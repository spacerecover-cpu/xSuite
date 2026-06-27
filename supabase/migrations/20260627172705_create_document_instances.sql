-- Document Studio (2026-06-27): the universal generated-document record.
-- Replaces the untyped case_reports.content JSONB lifecycle blob. Tenant-scoped,
-- soft-delete, RLS-forced. Lifecycle/approval/artifact columns are protected by a
-- guard trigger so only the SECURITY DEFINER transition/artifact RPCs can set them.

CREATE TABLE document_instances (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  doc_type              document_instance_type NOT NULL,
  report_subtype        text,
  CONSTRAINT di_report_subtype_only_for_reports
    CHECK (report_subtype IS NULL OR doc_type = 'report'),

  -- Source linkage (nullable-FK polymorphism; at least one source required)
  case_id               uuid REFERENCES cases(id) ON DELETE CASCADE,
  device_id             uuid REFERENCES case_devices(id),
  invoice_id            uuid REFERENCES invoices(id),
  quote_id              uuid REFERENCES quotes(id),
  customer_id           uuid REFERENCES customers_enhanced(id),
  CONSTRAINT di_source_present CHECK (
    case_id IS NOT NULL OR invoice_id IS NOT NULL
    OR quote_id IS NOT NULL OR customer_id IS NOT NULL
  ),

  -- Template snapshot (mirrors case_reports.template_version_id)
  template_version_id   uuid REFERENCES document_template_versions(id) ON DELETE SET NULL,
  instance_overrides    jsonb NOT NULL DEFAULT '{}'::jsonb,

  document_number       text,

  -- Lifecycle
  status                document_instance_status NOT NULL DEFAULT 'draft',
  version_number        integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  supersedes_id         uuid REFERENCES document_instances(id),
  is_latest             boolean NOT NULL DEFAULT true,

  title                 text NOT NULL,

  -- Exact render input snapshot (forensic reproducibility)
  resolved_data         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Output artifact
  pdf_storage_bucket    text,
  pdf_storage_path      text,
  pdf_sha256            text,
  pdf_generated_at      timestamptz,

  -- Generation actor
  generated_by          uuid,
  generated_at          timestamptz,

  -- Approval (two-person gate; author = created_by)
  reviewed_by           uuid,
  reviewed_at           timestamptz,
  approved_by           uuid,
  approved_at           timestamptz,
  rejected_by           uuid,
  rejected_at           timestamptz,
  rejection_reason      text,
  CONSTRAINT di_approver_differs_from_author
    CHECK (approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by),

  -- Delivery / portal sign-off
  delivered_at                  timestamptz,
  visible_to_customer           boolean NOT NULL DEFAULT false,
  signed_off_by_customer_at     timestamptz,
  customer_signoff_signature_id uuid,  -- deferred FK -> document_signatures (added later)

  forensic_custody_id   uuid REFERENCES chain_of_custody(id),

  -- Actor stamps + soft delete (CLAUDE.md standard)
  created_by            uuid,
  updated_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

-- Indexes (CI tenant-table-requirements: idx_<table>_tenant_id partial)
CREATE INDEX idx_document_instances_tenant_id ON document_instances(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_document_instances_case ON document_instances(case_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_document_instances_type_status ON document_instances(tenant_id, doc_type, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_document_instances_latest ON document_instances(tenant_id, doc_type, is_latest) WHERE is_latest AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_document_instances_number
  ON document_instances(tenant_id, doc_type, document_number)
  WHERE document_number IS NOT NULL AND deleted_at IS NULL;

-- Tenant + audit stamping (generic functions, per existing convention)
CREATE TRIGGER set_document_instances_tenant_and_audit
  BEFORE INSERT OR UPDATE ON document_instances
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();
CREATE TRIGGER set_document_instances_audit_actor
  BEFORE INSERT OR UPDATE ON document_instances
  FOR EACH ROW EXECUTE FUNCTION set_audit_actor_fields();

-- Lifecycle guard: block direct client mutation of approval/delivery/artifact/
-- status columns. Only the SECURITY DEFINER RPCs (which set app.bypass_document_guard)
-- may change them. Mirrors transition_case_status's app.bypass_status_guard pattern.
CREATE OR REPLACE FUNCTION enforce_document_instance_lifecycle()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(current_setting('app.bypass_document_guard', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
     OR NEW.visible_to_customer IS DISTINCT FROM OLD.visible_to_customer
     OR NEW.signed_off_by_customer_at IS DISTINCT FROM OLD.signed_off_by_customer_at
     OR NEW.customer_signoff_signature_id IS DISTINCT FROM OLD.customer_signoff_signature_id
     OR NEW.pdf_storage_bucket IS DISTINCT FROM OLD.pdf_storage_bucket
     OR NEW.pdf_storage_path IS DISTINCT FROM OLD.pdf_storage_path
     OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256
     OR NEW.is_latest IS DISTINCT FROM OLD.is_latest THEN
    RAISE EXCEPTION 'document_instances lifecycle/approval/artifact columns are managed by RPCs, not direct updates'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_document_instance_lifecycle_guard
  BEFORE UPDATE ON document_instances
  FOR EACH ROW EXECUTE FUNCTION enforce_document_instance_lifecycle();

-- RLS
ALTER TABLE document_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_instances FORCE ROW LEVEL SECURITY;

CREATE POLICY document_instances_tenant_isolation ON document_instances
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());

CREATE POLICY document_instances_select ON document_instances
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY document_instances_insert ON document_instances
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_staff_user());

-- Clients may UPDATE only while draft/in_review; the guard trigger further
-- protects lifecycle columns. Post-approval edits go through RPCs only.
CREATE POLICY document_instances_update_authoring ON document_instances
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_staff_user() AND status IN ('draft','in_review'))
  WITH CHECK (is_staff_user() AND status IN ('draft','in_review'));

CREATE POLICY document_instances_delete ON document_instances
  AS PERMISSIVE FOR DELETE TO authenticated USING (has_role('admin'));
