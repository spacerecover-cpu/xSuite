-- Chain-of-custody write paths (platform review 2026-06-10, item 4 P0/P1).
-- 1) Open custody at intake: every case_devices INSERT logs a DEVICE_RECEIVED
--    creation event (DB trigger so no client path can skip it).
-- 2) log_chain_of_custody: p_device_id (and the params after it) gain DEFAULTs
--    so PostgREST named calls may omit the device for case-level events
--    (clients previously sent '' which failed the uuid cast).
-- 3) log_case_checkout: checkout now also writes DEVICE_CHECKED_OUT /
--    CASE_CHECKED_OUT ledger events with custody_status='checked_out'.

-- (1) Intake custody event ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_device_received_custody()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_name text;
  v_actor_role text;
BEGIN
  SELECT full_name, role INTO v_actor_name, v_actor_role
  FROM profiles WHERE id = auth.uid();

  INSERT INTO chain_of_custody
    (tenant_id, case_id, device_id, action_category, action, description,
     actor_id, actor_name, actor_role, custody_status, metadata)
  VALUES
    (NEW.tenant_id, NEW.case_id, NEW.id,
     'creation', 'DEVICE_RECEIVED',
     'Device received into lab custody at intake',
     auth.uid(), COALESCE(v_actor_name, 'System'), v_actor_role,
     'in_custody',
     jsonb_strip_nulls(jsonb_build_object(
       'serial_number', NEW.serial_number,
       'model', NEW.model,
       'device_type_id', NEW.device_type_id,
       'brand_id', NEW.brand_id,
       'is_primary', NEW.is_primary,
       'source', 'intake_trigger'
     )));
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_device_received_custody() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_device_received_custody ON public.case_devices;
CREATE TRIGGER trg_log_device_received_custody
  AFTER INSERT ON public.case_devices
  FOR EACH ROW EXECUTE FUNCTION public.log_device_received_custody();

-- (2) Optional p_device_id on the ledger RPC ----------------------------------
-- Same parameter order/types (CREATE OR REPLACE keeps the function identity);
-- positional callers (respond_to_custody_transfer) are unaffected.
CREATE OR REPLACE FUNCTION public.log_chain_of_custody(
  p_case_id uuid,
  p_device_id uuid DEFAULT NULL::uuid,
  p_action_category text DEFAULT NULL::text,
  p_action text DEFAULT NULL::text,
  p_description text DEFAULT NULL::text,
  p_location text DEFAULT NULL::text,
  p_custody_status text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_user_name text;
  v_user_role text;
BEGIN
  IF p_case_id IS NULL OR p_action_category IS NULL OR p_action IS NULL THEN
    RAISE EXCEPTION 'log_chain_of_custody: p_case_id, p_action_category and p_action are required'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;
  SELECT full_name, role INTO v_user_name, v_user_role FROM profiles WHERE id = auth.uid();
  INSERT INTO chain_of_custody (tenant_id, case_id, device_id, action_category, action, description, actor_id, actor_name, actor_role, location, custody_status, metadata)
  VALUES (get_current_tenant_id(), p_case_id, p_device_id, p_action_category::custody_action_category, p_action, p_description, auth.uid(), COALESCE(v_user_name, 'System'), v_user_role, p_location, p_custody_status::custody_status, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- (3) Checkout writes the forensic ledger --------------------------------------
CREATE OR REPLACE FUNCTION public.log_case_checkout(p_case_id uuid, p_collector_name text, p_collector_mobile text, p_collector_id text DEFAULT NULL::text, p_recovery_outcome text DEFAULT NULL::text, p_device_ids uuid[] DEFAULT NULL::uuid[])
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
BEGIN
  v_tenant_id := get_current_tenant_id();
  SELECT full_name, role INTO v_from_person, v_actor_role FROM profiles WHERE id = auth.uid();
  v_from_person := COALESCE(v_from_person, 'Lab');

  v_details := json_build_object(
    'collector_name', p_collector_name,
    'collector_mobile', p_collector_mobile,
    'collector_id', p_collector_id,
    'recovery_outcome', p_recovery_outcome,
    'device_ids', p_device_ids
  )::text;

  v_checkout_meta := jsonb_strip_nulls(jsonb_build_object(
    'collector_name', p_collector_name,
    'collector_mobile', p_collector_mobile,
    'collector_id', p_collector_id,
    'recovery_outcome', p_recovery_outcome,
    'source', 'log_case_checkout'
  ));

  -- (a) Append-only audit record (unchanged contract).
  INSERT INTO case_job_history (tenant_id, case_id, action, details, performed_by)
  VALUES (v_tenant_id, p_case_id, 'checkout', v_details, auth.uid());

  -- (b) Queryable projection on the case (does NOT touch status -> status guard
  -- is not tripped).
  UPDATE cases
  SET checkout_collector_name = p_collector_name,
      checkout_collector_mobile = p_collector_mobile,
      checkout_collector_id = p_collector_id,
      checkout_date = v_now,
      recovery_outcome = p_recovery_outcome
  WHERE id = p_case_id AND tenant_id = v_tenant_id;

  -- (c) Device-level custody: physical handoff to the collector — transfer row
  -- AND a forensic ledger event per device.
  IF p_device_ids IS NOT NULL THEN
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

  -- (d) Best-effort: drive the state machine to delivered when the current phase
  -- permits it (completed/ready). A return from a declined / unrecoverable /
  -- awaiting-approval case still records the physical checkout above; it simply
  -- does not force an invalid 'delivered' status. Only swallow the
  -- "transition not applicable" codes; re-raise anything genuinely wrong.
  SELECT id INTO v_delivered_status_id
  FROM master_case_statuses WHERE type = 'delivered' ORDER BY sort_order LIMIT 1;

  IF v_delivered_status_id IS NOT NULL THEN
    BEGIN
      PERFORM transition_case_status(p_case_id, v_delivered_status_id, 'checkout', v_details);
    EXCEPTION
      WHEN check_violation OR insufficient_privilege THEN
        -- 23514 (no active edge from current phase) / 42501 (role not permitted):
        -- the physical checkout is still recorded; case status is left unchanged.
        NULL;
    END;
  END IF;
END;
$function$;
