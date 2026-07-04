-- ═══════════════════════════════════════════════════════════════════════════
-- Manual case-status override for the Case Detail → Overview Status picker.
--
-- The lifecycle state machine (transition_case_status) is intentionally strict:
-- it validates the transition graph edge, the edge's allowed_roles, and the
-- evidence/reason/device/payment gates. This function is the deliberate
-- ESCAPE HATCH the product owner requested: any non-viewer staff may set a case
-- to ANY status with no sequence or gate conditions. Every change is still
-- written to case_job_history (action 'status_changed', details.manual_override
-- = true) and still emits the same phase-change notifications, so nothing about
-- auditability or customer visibility changes — only the gating is removed.
--
-- transition_case_status is left UNTOUCHED (the guided Stage Banner, clone
-- mark-as-delivered, and log_case_checkout keep using it). This is a separate
-- function to avoid a PostgREST overload clash with the shipped RPC.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_case_status(p_case_id uuid, p_to_status_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_case          cases%ROWTYPE;
  v_from_status   master_case_statuses%ROWTYPE;
  v_to_status     master_case_statuses%ROWTYPE;
  v_caller_role   text;
  v_caller_tenant uuid;
  v_details       text;
  v_payload       jsonb;
BEGIN
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '28000'; END IF;

  -- Any non-viewer staff (or platform admin) may override. Viewers / portal
  -- customers cannot. is_staff_user() is true for every role except viewer.
  IF NOT (is_staff_user() OR is_platform_admin()) THEN
    RAISE EXCEPTION 'Role % is not permitted to change case status', v_caller_role USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_case FROM cases WHERE id = p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case % not found', p_case_id USING ERRCODE = 'P0002'; END IF;
  IF v_case.tenant_id != v_caller_tenant AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Case % belongs to a different tenant', p_case_id USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_to_status FROM master_case_statuses WHERE id = p_to_status_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target status % not found', p_to_status_id USING ERRCODE = 'P0002'; END IF;

  IF v_case.status_id IS NOT NULL THEN
    SELECT * INTO v_from_status FROM master_case_statuses WHERE id = v_case.status_id;
  ELSE
    SELECT * INTO v_from_status FROM master_case_statuses WHERE type = 'intake' ORDER BY sort_order LIMIT 1;
  END IF;

  IF v_from_status.id = v_to_status.id THEN
    RETURN jsonb_build_object('ok', true, 'case_id', v_case.id, 'no_op', true,
      'status_id', v_to_status.id, 'phase', v_to_status.type);
  END IF;

  -- No gates. Write under the same session-local guard bypass the state machine
  -- uses, so the guard trigger permits this UPDATE.
  PERFORM set_config('app.bypass_status_guard', 'true', true);
  UPDATE cases
    SET status_id = v_to_status.id, status = v_to_status.name,
        phase_entered_at = now(), updated_at = now(),
        actual_completion = CASE WHEN v_to_status.type = 'delivered' THEN now()
                                 ELSE actual_completion END
    WHERE id = p_case_id;
  PERFORM set_config('app.bypass_status_guard', '', true);

  v_details := jsonb_build_object(
    'from_phase', v_from_status.type, 'to_phase', v_to_status.type,
    'notes', p_notes, 'manual_override', true
  )::text;

  INSERT INTO case_job_history (case_id, action, old_value, new_value, performed_by, details)
  VALUES (p_case_id, 'status_changed', v_from_status.name, v_to_status.name, auth.uid(), v_details);

  v_payload := jsonb_build_object(
    'case_id', p_case_id, 'case_no', v_case.case_no,
    'from_status_id', v_from_status.id, 'from_status_name', v_from_status.name, 'from_phase', v_from_status.type,
    'to_status_id', v_to_status.id, 'to_status_name', v_to_status.name, 'to_phase', v_to_status.type,
    'customer_id', v_case.customer_id, 'assigned_engineer_id', v_case.assigned_engineer_id,
    'reason', NULL, 'notes', p_notes, 'manual_override', true
  );

  PERFORM emit_notification_event(
    'case.phase_changed', 'case', p_case_id, v_payload,
    'case.phase_changed:' || p_case_id::text || ':' || v_to_status.id::text || ':' || extract(epoch from now())::text
  );

  IF v_to_status.customer_visible AND v_case.customer_id IS NOT NULL THEN
    PERFORM emit_notification_event(
      'case.phase_changed.customer', 'case', p_case_id, v_payload,
      'case.phase_changed.customer:' || p_case_id::text || ':' || v_to_status.id::text || ':' || extract(epoch from now())::text
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'case_id', v_case.id,
    'from_status_id', v_from_status.id, 'from_phase', v_from_status.type,
    'to_status_id', v_to_status.id, 'to_phase', v_to_status.type
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_case_status(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_case_status(uuid, uuid, text) TO authenticated, service_role;
