ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS checkout_collector_name text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS checkout_collector_mobile text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS checkout_collector_id text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS checkout_date timestamptz;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS recovery_outcome text;

DROP FUNCTION IF EXISTS public.log_case_checkout(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.log_case_checkout(
  p_case_id uuid, p_collector_name text, p_collector_mobile text,
  p_collector_id text DEFAULT NULL, p_recovery_outcome text DEFAULT NULL, p_device_ids uuid[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant_id uuid; v_details text; v_delivered_status_id uuid; v_now timestamptz := now(); v_from_person text; v_device_id uuid;
BEGIN
  v_tenant_id := get_current_tenant_id();
  v_from_person := COALESCE((SELECT full_name FROM profiles WHERE id = auth.uid()), 'Lab');
  v_details := json_build_object('collector_name', p_collector_name, 'collector_mobile', p_collector_mobile,
    'collector_id', p_collector_id, 'recovery_outcome', p_recovery_outcome, 'device_ids', p_device_ids)::text;
  INSERT INTO case_job_history (tenant_id, case_id, action, details, performed_by)
  VALUES (v_tenant_id, p_case_id, 'checkout', v_details, auth.uid());
  UPDATE cases SET checkout_collector_name = p_collector_name, checkout_collector_mobile = p_collector_mobile,
    checkout_collector_id = p_collector_id, checkout_date = v_now, recovery_outcome = p_recovery_outcome
  WHERE id = p_case_id AND tenant_id = v_tenant_id;
  IF p_device_ids IS NOT NULL THEN
    FOREACH v_device_id IN ARRAY p_device_ids LOOP
      INSERT INTO chain_of_custody_transfers
        (tenant_id, case_id, device_id, from_person_name, to_person_name, transfer_reason, transfer_status, accepted_at)
      VALUES (v_tenant_id, p_case_id, v_device_id, v_from_person, p_collector_name, 'checkout', 'accepted', v_now);
    END LOOP;
  END IF;
  SELECT id INTO v_delivered_status_id FROM master_case_statuses WHERE type = 'delivered' ORDER BY sort_order LIMIT 1;
  PERFORM transition_case_status(p_case_id, v_delivered_status_id, 'checkout', v_details);
END; $$;

GRANT EXECUTE ON FUNCTION public.log_case_checkout(uuid, text, text, text, text, uuid[]) TO authenticated;
