-- Document Studio (2026-06-27): per-report editable prose body
-- (migration target of case_report_sections). Section content = the editor overlay
-- on top of binding-resolved defaults.

CREATE TABLE document_instance_sections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_instance_id  uuid NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  section_key           text NOT NULL,
  title                 text,
  content               text,
  sort_order            integer NOT NULL DEFAULT 0,
  is_visible            boolean NOT NULL DEFAULT true,
  created_by            uuid,
  updated_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX idx_document_instance_sections_tenant_id ON document_instance_sections(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_document_instance_sections_instance ON document_instance_sections(document_instance_id) WHERE deleted_at IS NULL;

CREATE TRIGGER set_document_instance_sections_tenant_and_audit
  BEFORE INSERT OR UPDATE ON document_instance_sections
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();
CREATE TRIGGER set_document_instance_sections_audit_actor
  BEFORE INSERT OR UPDATE ON document_instance_sections
  FOR EACH ROW EXECUTE FUNCTION set_audit_actor_fields();

ALTER TABLE document_instance_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_instance_sections FORCE ROW LEVEL SECURITY;

CREATE POLICY document_instance_sections_tenant_isolation ON document_instance_sections
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());

CREATE POLICY document_instance_sections_select ON document_instance_sections
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY document_instance_sections_insert ON document_instance_sections
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_staff_user());

CREATE POLICY document_instance_sections_update ON document_instance_sections
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_staff_user()) WITH CHECK (is_staff_user());

CREATE POLICY document_instance_sections_delete ON document_instance_sections
  AS PERMISSIVE FOR DELETE TO authenticated USING (has_role('admin'));
