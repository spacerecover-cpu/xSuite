-- Phase 11 (Document Studio): one-time ADDITIVE, IDEMPOTENT migration of historical
-- legacy reports into the typed document_instances model so they remain viewable
-- after the legacy report stack is retired. case_reports/case_report_sections are
-- the frozen source-of-record and are NEVER modified or dropped here.
ALTER TABLE document_instances ADD COLUMN IF NOT EXISTS legacy_case_report_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_di_legacy_report
  ON document_instances(legacy_case_report_id) WHERE legacy_case_report_id IS NOT NULL;

DO $$
BEGIN
  -- migration runs without a JWT: bypass the tenant guard (we set tenant_id from the
  -- source row) and the lifecycle guard (we import the historical status directly).
  PERFORM set_config('app.bypass_tenant_guard', 'true', true);
  PERFORM set_config('app.bypass_document_guard', 'true', true);

  INSERT INTO document_instances
    (tenant_id, doc_type, report_subtype, title, document_number, case_id, status,
     visible_to_customer, version_number, is_latest, created_by, created_at, legacy_case_report_id)
  SELECT
    cr.tenant_id,
    'report',
    cr.content->>'report_type',
    cr.title,
    -- disambiguate the rare legacy number reused across report types (uq index is
    -- (tenant_id, doc_type, document_number)); otherwise keep the original number.
    CASE WHEN cr.report_number IS NOT NULL
              AND COUNT(*) OVER (PARTITION BY cr.tenant_id, cr.report_number) > 1
         THEN cr.report_number || ' (' || COALESCE(cr.content->>'report_type', 'report') || ')'
         ELSE cr.report_number END,
    cr.case_id,
    (CASE lower(COALESCE(cr.status, 'draft'))
        WHEN 'approved'   THEN 'approved'
        WHEN 'sent'       THEN 'delivered'
        WHEN 'delivered'  THEN 'delivered'
        WHEN 'review'     THEN 'in_review'
        WHEN 'in_review'  THEN 'in_review'
        WHEN 'signed_off' THEN 'signed_off'
        ELSE 'draft' END)::document_instance_status,
    COALESCE((cr.content->>'visible_to_customer')::boolean, false),
    COALESCE((cr.content->>'version_number')::int, 1),
    COALESCE((cr.content->>'is_latest_version')::boolean, true),
    cr.created_by,
    cr.created_at,
    cr.id
  FROM case_reports cr
  WHERE cr.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM document_instances di WHERE di.legacy_case_report_id = cr.id);

  INSERT INTO document_instance_sections
    (tenant_id, document_instance_id, section_key, title, content, sort_order, is_visible, created_at)
  SELECT
    s.tenant_id, di.id, COALESCE(s.section_type, 'section'), s.title, s.content,
    COALESCE(s.sort_order, 0), COALESCE(s.is_visible, true), s.created_at
  FROM case_report_sections s
  JOIN document_instances di ON di.legacy_case_report_id = s.report_id
  WHERE s.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM document_instance_sections ds
      WHERE ds.document_instance_id = di.id
        AND ds.section_key = COALESCE(s.section_type, 'section'));
END $$;
