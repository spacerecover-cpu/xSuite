-- transition_case_status modelled status changes purely as phase-to-phase edges
-- in case_status_transitions. But five lifecycle phases hold more than one
-- sub-status (intake: Registered/Received; diagnosis: Initial Assessment/
-- Diagnosis in Progress; qa: Verification & QC/Data Transfer; completed:
-- Success/Partial/Failed; cancelled: three reasons). Moving between two
-- siblings of the same phase produced from_phase = to_phase, found no edge,
-- and RAISEd 23514 -> HTTP 400 -- breaking the most basic intake step
-- (Registered -> Received) and every other intra-phase refinement.
--
-- Fix: treat a same-phase move (same type, different status id) as a lateral
-- refinement that does NOT cross a phase boundary, so the edge table and the
-- evidence gates (qa_passed / recovery_outcome / payment-before-release, which
-- all guard phase boundaries) do not apply. It is still staff-gated and still
-- audited (case_job_history) and notified exactly like any other status change.
-- Cross-phase behaviour is unchanged -- the existing edge lookup, role
-- allowlist and release gates are simply moved into the ELSE branch.
CREATE OR REPLACE FUNCTION public.transition_case_status(p_case_id uuid, p_to_status_id uuid, p_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_case          cases%ROWTYPE;
  v_from_status   master_case_statuses%ROWTYPE;
  v_to_status     master_case_statuses%ROWTYPE;
  v_transition    case_status_transitions%ROWTYPE;
  v_caller_role   text;
  v_caller_tenant uuid;
  v_details       text;
  v_payload       jsonb;
BEGIN
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '28000'; END IF;

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

  IF v_from_status.type = v_to_status.type THEN
    -- Intra-phase lateral move (same lifecycle phase, different sub-status).
    -- No phase boundary is crossed, so case_status_transitions has no row for it
    -- and the evidence gates do not apply. Staff-gated; v_transition stays NULL.
    IF NOT (v_caller_role = ANY (ARRAY['technician','manager','admin','owner'])) AND NOT is_platform_admin() THEN
      RAISE EXCEPTION 'Role % is not permitted to change status within the % phase',
        v_caller_role, v_from_status.type USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO v_transition FROM case_status_transitions
    WHERE from_phase = v_from_status.type AND to_phase = v_to_status.type AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transition % → % is not allowed', v_from_status.type, v_to_status.type USING ERRCODE = '23514';
    END IF;

    IF NOT (v_caller_role = ANY(v_transition.allowed_roles)) AND NOT is_platform_admin() THEN
      RAISE EXCEPTION 'Role % is not permitted to perform % → % transition',
        v_caller_role, v_from_status.type, v_to_status.type USING ERRCODE = '42501';
    END IF;

    -- C3 release gate: enforce the evidence-backed requires[] tokens on this edge.
    IF 'qa_passed' = ANY(v_transition.requires) THEN
      IF NOT EXISTS (
        SELECT 1 FROM case_qa_checklists
        WHERE case_id = p_case_id AND status = 'passed' AND deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Cannot enter "%": QA has not passed. Record a passed QA checklist for this case first.',
          v_to_status.name USING ERRCODE = '23514', HINT = 'qa_passed';
      END IF;
    END IF;

    IF v_transition.requires && ARRAY['recovery_completed','recovery_outcome']::text[] THEN
      IF NOT EXISTS (
        SELECT 1 FROM case_recovery_attempts
        WHERE case_id = p_case_id AND result IS NOT NULL AND deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Cannot enter "%": no recovery attempt with an outcome has been recorded for this case.',
          v_to_status.name USING ERRCODE = '23514', HINT = 'recovery_recorded';
      END IF;
    END IF;

    -- Payment-before-release gate (tenant opt-in, default OFF). Releasing recovered
    -- data before payment is the lab's most expensive operational mistake. Reads the
    -- flag with an explicit FALSE default so tenants that have not enabled it are
    -- entirely unaffected.
    IF v_to_status.type = 'delivered' THEN
      IF COALESCE(
           (SELECT (feature_flags ->> 'gate.payment_before_release')::boolean
              FROM tenants WHERE id = v_case.tenant_id),
           false) THEN
        IF EXISTS (
          SELECT 1 FROM invoices
          WHERE case_id = p_case_id
            AND deleted_at IS NULL
            AND COALESCE(is_proforma, false) = false
            AND COALESCE(balance_due, 0) > 0
        ) THEN
          RAISE EXCEPTION 'Cannot enter "%": the case has an outstanding invoice balance. Record payment before releasing recovered data.',
            v_to_status.name USING ERRCODE = '23514', HINT = 'payment_outstanding';
        END IF;
      END IF;
    END IF;
  END IF;

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
    'reason', p_reason, 'notes', p_notes, 'transition_id', v_transition.id
  )::text;

  INSERT INTO case_job_history (case_id, action, old_value, new_value, performed_by, details)
  VALUES (p_case_id, 'status_changed', v_from_status.name, v_to_status.name, auth.uid(), v_details);

  v_payload := jsonb_build_object(
    'case_id', p_case_id, 'case_no', v_case.case_no,
    'from_status_id', v_from_status.id, 'from_status_name', v_from_status.name, 'from_phase', v_from_status.type,
    'to_status_id', v_to_status.id, 'to_status_name', v_to_status.name, 'to_phase', v_to_status.type,
    'customer_id', v_case.customer_id, 'assigned_engineer_id', v_case.assigned_engineer_id,
    'reason', p_reason, 'notes', p_notes
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
