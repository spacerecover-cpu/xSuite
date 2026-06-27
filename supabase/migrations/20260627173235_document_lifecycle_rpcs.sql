-- Document Studio (2026-06-27): server-enforced lifecycle RPCs.
-- All SECURITY DEFINER; they set app.bypass_document_guard to pass the guard trigger,
-- exactly as transition_case_status uses app.bypass_status_guard.

-- 1) Status transitions (role-gated, second-person, send-gate, evidence gates)
CREATE OR REPLACE FUNCTION transition_document_instance(
  p_instance_id uuid,
  p_to_status   document_instance_status,
  p_reason      text DEFAULT NULL,
  p_signature_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_inst   document_instances%ROWTYPE;
  v_role   text;
  v_tenant uuid;
  v_uid    uuid := auth.uid();
  v_edge   document_status_transitions%ROWTYPE;
BEGIN
  SELECT role, tenant_id INTO v_role, v_tenant FROM profiles WHERE id = v_uid;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='28000'; END IF;

  SELECT * INTO v_inst FROM document_instances WHERE id = p_instance_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document % not found', p_instance_id USING ERRCODE='P0002'; END IF;
  IF v_inst.tenant_id <> v_tenant AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Document belongs to a different tenant' USING ERRCODE='42501';
  END IF;

  IF v_inst.status = p_to_status THEN
    RETURN jsonb_build_object('ok', true, 'no_op', true, 'status', p_to_status);
  END IF;

  SELECT * INTO v_edge FROM document_status_transitions
  WHERE from_status = v_inst.status AND to_status = p_to_status AND is_active
    AND (doc_type = v_inst.doc_type OR doc_type IS NULL)
  ORDER BY (doc_type IS NOT NULL) DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transition % -> % is not allowed', v_inst.status, p_to_status USING ERRCODE='23514';
  END IF;

  IF NOT (v_role = ANY(v_edge.allowed_roles)) AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Role % may not perform % -> %', v_role, v_inst.status, p_to_status USING ERRCODE='42501';
  END IF;

  -- Second-person gate: approver differs from author and generator
  IF p_to_status = 'approved' THEN
    IF v_uid = v_inst.created_by OR v_uid = v_inst.generated_by THEN
      RAISE EXCEPTION 'The approver must be a different person than the document author' USING ERRCODE='42501';
    END IF;
  END IF;

  -- Send gate: delivery requires a rendered, hashed PDF
  IF p_to_status = 'delivered' THEN
    IF v_inst.pdf_storage_path IS NULL OR v_inst.pdf_sha256 IS NULL THEN
      RAISE EXCEPTION 'Cannot deliver: no rendered PDF artifact is on record'
        USING ERRCODE='23514', HINT='render_and_archive_first';
    END IF;
  END IF;

  -- Evidence gate (token-driven; reuses the case QA vocabulary)
  IF 'qa_passed' = ANY(v_edge.requires) AND v_inst.case_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM case_qa_checklists
                   WHERE case_id = v_inst.case_id AND status = 'passed' AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Cannot proceed: QA has not passed for this case' USING ERRCODE='23514', HINT='qa_passed';
    END IF;
  END IF;

  PERFORM set_config('app.bypass_document_guard','true', true);
  UPDATE document_instances SET
    status = p_to_status,
    reviewed_by = CASE WHEN p_to_status='in_review' THEN v_uid ELSE reviewed_by END,
    reviewed_at = CASE WHEN p_to_status='in_review' THEN now() ELSE reviewed_at END,
    approved_by = CASE WHEN p_to_status='approved' THEN v_uid ELSE approved_by END,
    approved_at = CASE WHEN p_to_status='approved' THEN now() ELSE approved_at END,
    rejected_by = CASE WHEN p_to_status='rejected' THEN v_uid ELSE rejected_by END,
    rejected_at = CASE WHEN p_to_status='rejected' THEN now() ELSE rejected_at END,
    rejection_reason = CASE WHEN p_to_status='rejected' THEN p_reason ELSE rejection_reason END,
    delivered_at = CASE WHEN p_to_status='delivered' THEN now() ELSE delivered_at END,
    visible_to_customer = CASE WHEN p_to_status='delivered' THEN true ELSE visible_to_customer END,
    updated_at = now()
  WHERE id = p_instance_id;
  PERFORM set_config('app.bypass_document_guard','', true);

  PERFORM log_audit_trail('document_instance', p_instance_id, 'status_changed',
    jsonb_build_object('status', v_inst.status::text),
    jsonb_build_object('status', p_to_status::text, 'reason', p_reason),
    ARRAY['status']);

  IF v_inst.case_id IS NOT NULL AND p_to_status IN ('approved','delivered') THEN
    PERFORM log_chain_of_custody(
      v_inst.case_id, v_inst.device_id,
      CASE WHEN p_to_status='delivered' THEN 'communication' ELSE 'critical_event' END,
      CASE WHEN p_to_status='delivered' THEN 'DOCUMENT_DELIVERED' ELSE 'DOCUMENT_APPROVED' END,
      format('%s %s', v_inst.doc_type, p_to_status), NULL, NULL,
      jsonb_build_object('document_instance_id', p_instance_id, 'doc_type', v_inst.doc_type::text,
                         'document_number', v_inst.document_number));
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_instance_id, 'from', v_inst.status, 'to', p_to_status);
END; $$;

-- 2) Attach rendered artifact + resolved-data snapshot (provability write path)
CREATE OR REPLACE FUNCTION set_document_instance_artifact(
  p_instance_id uuid,
  p_bucket text,
  p_path text,
  p_sha256 text,
  p_resolved_data jsonb DEFAULT NULL,
  p_template_version_id uuid DEFAULT NULL,
  p_document_number text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_inst document_instances%ROWTYPE; v_tenant uuid; v_uid uuid := auth.uid();
BEGIN
  SELECT tenant_id INTO v_tenant FROM profiles WHERE id = v_uid;
  IF NOT is_staff_user() THEN RAISE EXCEPTION 'Staff only' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_inst FROM document_instances WHERE id = p_instance_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document % not found', p_instance_id USING ERRCODE='P0002'; END IF;
  IF v_inst.tenant_id <> v_tenant AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'cross-tenant' USING ERRCODE='42501'; END IF;
  IF v_inst.status NOT IN ('draft','in_review','approved') THEN
    RAISE EXCEPTION 'Artifact can only be attached before delivery' USING ERRCODE='23514'; END IF;

  PERFORM set_config('app.bypass_document_guard','true', true);
  UPDATE document_instances SET
    pdf_storage_bucket = p_bucket,
    pdf_storage_path = p_path,
    pdf_sha256 = p_sha256,
    pdf_generated_at = now(),
    generated_by = v_uid,
    generated_at = now(),
    resolved_data = COALESCE(p_resolved_data, resolved_data),
    template_version_id = COALESCE(p_template_version_id, template_version_id),
    document_number = COALESCE(document_number, p_document_number),
    updated_at = now()
  WHERE id = p_instance_id;
  PERFORM set_config('app.bypass_document_guard','', true);

  RETURN jsonb_build_object('ok', true, 'id', p_instance_id, 'sha256', p_sha256);
END; $$;

-- 3) Portal customer sign-off (only write path for portal principals)
CREATE OR REPLACE FUNCTION portal_sign_off_document(
  p_instance_id uuid,
  p_method signature_method,
  p_typed_value text DEFAULT NULL,
  p_image_bucket text DEFAULT NULL,
  p_image_path text DEFAULT NULL,
  p_signature_sha256 text DEFAULT NULL,
  p_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cust uuid := get_current_portal_customer_id(); v_inst document_instances%ROWTYPE; v_sig uuid; v_name text;
BEGIN
  IF v_cust IS NULL THEN RAISE EXCEPTION 'Portal customers only' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_inst FROM document_instances WHERE id = p_instance_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found' USING ERRCODE='P0002'; END IF;
  IF v_inst.status <> 'delivered' OR NOT v_inst.visible_to_customer THEN
    RAISE EXCEPTION 'Document is not available for sign-off' USING ERRCODE='42501'; END IF;
  IF v_inst.case_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM cases c WHERE c.id = v_inst.case_id AND c.customer_id = v_cust
  ) THEN
    RAISE EXCEPTION 'This document does not belong to you' USING ERRCODE='42501'; END IF;

  SELECT customer_name INTO v_name FROM customers_enhanced WHERE id = v_cust;

  INSERT INTO document_signatures(
    tenant_id, document_instance_id, slot, method,
    signer_customer_id, signer_name, signer_role,
    typed_value, signature_image_bucket, signature_image_path, signature_sha256,
    signed_at, ip_address, user_agent
  ) VALUES (
    v_inst.tenant_id, p_instance_id, 'customer', p_method,
    v_cust, COALESCE(v_name,'Customer'), 'portal_customer',
    p_typed_value, p_image_bucket, p_image_path, p_signature_sha256,
    now(), p_ip, p_user_agent
  ) RETURNING id INTO v_sig;

  PERFORM set_config('app.bypass_document_guard','true', true);
  UPDATE document_instances SET
    status = 'signed_off',
    signed_off_by_customer_at = now(),
    customer_signoff_signature_id = v_sig,
    updated_at = now()
  WHERE id = p_instance_id;
  PERFORM set_config('app.bypass_document_guard','', true);

  PERFORM log_chain_of_custody(
    v_inst.case_id, v_inst.device_id, 'communication', 'DOCUMENT_SIGNED_OFF',
    'Customer portal sign-off', NULL, NULL,
    jsonb_build_object('document_instance_id', p_instance_id, 'signature_id', v_sig));

  RETURN jsonb_build_object('ok', true, 'signature_id', v_sig);
END; $$;

-- Portal read access: delivered/signed-off, visible, own-case documents only
GRANT SELECT ON document_instances TO portal;
CREATE POLICY document_instances_portal_read ON document_instances
  AS PERMISSIVE FOR SELECT TO portal
  USING (
    deleted_at IS NULL
    AND visible_to_customer = true
    AND status IN ('delivered','signed_off')
    AND case_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM cases c
                WHERE c.id = document_instances.case_id
                  AND c.customer_id = get_current_portal_customer_id())
  );

GRANT EXECUTE ON FUNCTION portal_sign_off_document(uuid, signature_method, text, text, text, text, inet, text) TO portal;
