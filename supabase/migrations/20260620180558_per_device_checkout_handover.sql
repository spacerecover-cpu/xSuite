-- Per-device checkout handover + distinct collector.
-- Additive + backward-compatible: nullable columns; the reworked RPC keeps the
-- existing 6-arg call shape working (new 7th param defaults NULL).

-- 1. Per-device checkout STATE on case_devices (the queryable "which devices left" truth).
ALTER TABLE public.case_devices
  ADD COLUMN IF NOT EXISTS checked_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_batch_id uuid,
  ADD COLUMN IF NOT EXISTS checkout_collector_name text,
  ADD COLUMN IF NOT EXISTS checkout_collector_mobile text,
  ADD COLUMN IF NOT EXISTS checkout_collector_id text,
  ADD COLUMN IF NOT EXISTS checkout_collector_relationship text,
  ADD COLUMN IF NOT EXISTS checkout_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_devices_checkout_relationship_chk'
  ) THEN
    ALTER TABLE public.case_devices
      ADD CONSTRAINT case_devices_checkout_relationship_chk
      CHECK (checkout_collector_relationship IS NULL
             OR checkout_collector_relationship IN ('self','authorized_agent','company_rep','courier'));
  END IF;
END $$;

-- Fast "still in the lab" lookups.
CREATE INDEX IF NOT EXISTS idx_case_devices_in_lab
  ON public.case_devices(case_id)
  WHERE checked_out_at IS NULL AND deleted_at IS NULL;

-- 2. Best-effort backfill: devices already released (per the custody ledger) are
-- marked checked out so historical cases don't show as "still here". Case-level
-- (CASE_CHECKED_OUT, no device id) releases cannot be attributed and are skipped.
UPDATE public.case_devices cd
SET checked_out_at = sub.ts,
    checkout_collector_name = COALESCE(cd.checkout_collector_name, sub.collector_name)
FROM (
  SELECT DISTINCT ON (coc.device_id)
    coc.device_id,
    coc.created_at AS ts,
    coc.metadata->>'collector_name' AS collector_name
  FROM public.chain_of_custody coc
  WHERE coc.action = 'DEVICE_CHECKED_OUT'
    AND coc.device_id IS NOT NULL
    AND coc.deleted_at IS NULL
  ORDER BY coc.device_id, coc.created_at DESC
) sub
WHERE cd.id = sub.device_id AND cd.checked_out_at IS NULL;

-- 3. Rework log_case_checkout: per-device state stamping, a distinct-collector ID
-- gate, and a partial-vs-full delivered transition. Drop the old 6-arg signature
-- and recreate with a trailing p_collector_relationship (defaults NULL, so the
-- existing 6-arg named-arg callers resolve to this function unambiguously).
DROP FUNCTION IF EXISTS public.log_case_checkout(uuid, text, text, text, text, uuid[]);

CREATE OR REPLACE FUNCTION public.log_case_checkout(
  p_case_id uuid,
  p_collector_name text,
  p_collector_mobile text,
  p_collector_id text DEFAULT NULL,
  p_recovery_outcome text DEFAULT NULL,
  p_device_ids uuid[] DEFAULT NULL,
  p_collector_relationship text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_details text;
  v_delivered_status_id uuid;
  v_now timestamptz := now();
  v_from_person text;
  v_actor_role text;
  v_device_id uuid;
  v_checkout_meta jsonb;
  v_batch_id uuid := gen_random_uuid();
  v_remaining int;
BEGIN
  v_tenant_id := get_current_tenant_id();
  SELECT full_name, role INTO v_from_person, v_actor_role FROM profiles WHERE id = auth.uid();
  v_from_person := COALESCE(v_from_person, 'Lab');

  -- Chain-of-custody gate: an agent / company rep / courier collecting on behalf
  -- of the customer must present a National ID. A NULL relationship (legacy
  -- callers / "customer collects") is not gated, keeping this backward-compatible.
  IF p_collector_relationship IS NOT NULL
     AND p_collector_relationship <> 'self'
     AND COALESCE(btrim(p_collector_id), '') = '' THEN
    RAISE EXCEPTION 'A National ID / passport is required when the collector is not the customer (relationship: %)', p_collector_relationship
      USING ERRCODE = 'check_violation';
  END IF;

  v_details := json_build_object(
    'collector_name', p_collector_name,
    'collector_mobile', p_collector_mobile,
    'collector_id', p_collector_id,
    'collector_relationship', p_collector_relationship,
    'recovery_outcome', p_recovery_outcome,
    'device_ids', p_device_ids,
    'batch_id', v_batch_id
  )::text;

  v_checkout_meta := jsonb_strip_nulls(jsonb_build_object(
    'collector_name', p_collector_name,
    'collector_mobile', p_collector_mobile,
    'collector_id', p_collector_id,
    'collector_relationship', p_collector_relationship,
    'recovery_outcome', p_recovery_outcome,
    'batch_id', v_batch_id,
    'source', 'log_case_checkout'
  ));

  -- (a) Append-only audit record.
  INSERT INTO case_job_history (tenant_id, case_id, action, details, performed_by)
  VALUES (v_tenant_id, p_case_id, 'checkout', v_details, auth.uid());

  -- (b) Case projection: last-collection convenience (does NOT touch status here).
  UPDATE cases
  SET checkout_collector_name = p_collector_name,
      checkout_collector_mobile = p_collector_mobile,
      checkout_collector_id = p_collector_id,
      checkout_date = v_now,
      recovery_outcome = p_recovery_outcome
  WHERE id = p_case_id AND tenant_id = v_tenant_id;

  -- (c) Per-device: stamp checkout STATE + write custody (transfer + ledger).
  IF p_device_ids IS NOT NULL THEN
    UPDATE case_devices
    SET checked_out_at = v_now,
        checkout_batch_id = v_batch_id,
        checkout_collector_name = p_collector_name,
        checkout_collector_mobile = p_collector_mobile,
        checkout_collector_id = p_collector_id,
        checkout_collector_relationship = p_collector_relationship,
        checkout_by = auth.uid()
    WHERE case_id = p_case_id
      AND tenant_id = v_tenant_id
      AND id = ANY(p_device_ids)
      AND deleted_at IS NULL;

    FOREACH v_device_id IN ARRAY p_device_ids LOOP
      INSERT INTO chain_of_custody_transfers
        (tenant_id, case_id, device_id, from_person_name, to_person_name,
         transfer_reason, transfer_status, accepted_at)
      VALUES
        (v_tenant_id, p_case_id, v_device_id, v_from_person, p_collector_name,
         'checkout', 'accepted', v_now);

      INSERT INTO chain_of_custody
        (tenant_id, case_id, device_id, action_category, action, description,
         actor_id, actor_name, actor_role, custody_status, metadata)
      VALUES
        (v_tenant_id, p_case_id, v_device_id, 'transfer', 'DEVICE_CHECKED_OUT',
         format('Device released to %s at case checkout', p_collector_name),
         auth.uid(), v_from_person, v_actor_role, 'checked_out', v_checkout_meta);
    END LOOP;
  ELSE
    INSERT INTO chain_of_custody
      (tenant_id, case_id, device_id, action_category, action, description,
       actor_id, actor_name, actor_role, custody_status, metadata)
    VALUES
      (v_tenant_id, p_case_id, NULL, 'transfer', 'CASE_CHECKED_OUT',
       format('Case checked out to %s', p_collector_name),
       auth.uid(), v_from_person, v_actor_role, 'checked_out', v_checkout_meta);
  END IF;

  -- (d) Drive to 'delivered' only when the WHOLE case is collected. A per-device
  -- partial checkout leaves the status unchanged so the rest can be collected
  -- later. A legacy case-level checkout (p_device_ids IS NULL) keeps the prior
  -- best-effort transition.
  IF p_device_ids IS NULL THEN
    v_remaining := 0;
  ELSE
    SELECT count(*) INTO v_remaining
    FROM case_devices
    WHERE case_id = p_case_id AND tenant_id = v_tenant_id
      AND deleted_at IS NULL AND checked_out_at IS NULL;
  END IF;

  IF v_remaining = 0 THEN
    SELECT id INTO v_delivered_status_id
    FROM master_case_statuses WHERE type = 'delivered' ORDER BY sort_order LIMIT 1;

    IF v_delivered_status_id IS NOT NULL THEN
      BEGIN
        PERFORM transition_case_status(p_case_id, v_delivered_status_id, 'checkout', v_details);
      EXCEPTION
        WHEN check_violation OR insufficient_privilege THEN
          NULL;
      END;
    END IF;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.log_case_checkout(uuid, text, text, text, text, uuid[], text) TO authenticated;
