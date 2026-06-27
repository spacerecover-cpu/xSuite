-- Document Studio (2026-06-27): captured signatures (typed/drawn/uploaded/
-- click-to-accept) per signer slot. Append-only after signing (evidence), using
-- the same prevent_audit_mutation guard as audit_trails/chain_of_custody.

CREATE TABLE document_signatures (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_instance_id  uuid NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,

  slot                  signature_slot NOT NULL,
  method                signature_method NOT NULL,

  -- Signer identity (staff carry signer_user_id; portal/customer carry signer_customer_id)
  signer_user_id        uuid,
  signer_customer_id    uuid REFERENCES customers_enhanced(id),
  signer_name           text NOT NULL,
  signer_email          text,
  signer_role           text,

  -- Captured artifact
  signature_image_bucket text,
  signature_image_path   text,
  typed_value            text,
  signature_sha256       text,

  -- Forensic provenance
  signed_at             timestamptz NOT NULL DEFAULT now(),
  ip_address            inet,
  user_agent            text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,

  CONSTRAINT ds_signer_present CHECK (signer_user_id IS NOT NULL OR signer_customer_id IS NOT NULL)
);

CREATE INDEX idx_document_signatures_tenant_id ON document_signatures(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_document_signatures_instance ON document_signatures(document_instance_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_document_signatures_slot
  ON document_signatures(document_instance_id, slot) WHERE deleted_at IS NULL;

CREATE TRIGGER set_document_signatures_tenant_and_audit
  BEFORE INSERT OR UPDATE ON document_signatures
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();

-- Append-only: no UPDATE/DELETE except by service_role/postgres (mirrors audit tables)
CREATE TRIGGER prevent_document_signatures_mutation
  BEFORE UPDATE OR DELETE ON document_signatures
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_signatures FORCE ROW LEVEL SECURITY;

CREATE POLICY document_signatures_tenant_isolation ON document_signatures
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());

CREATE POLICY document_signatures_select ON document_signatures
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY document_signatures_insert ON document_signatures
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_staff_user());

-- Deferred FK from document_instances now that the target table exists
ALTER TABLE document_instances
  ADD CONSTRAINT di_customer_signoff_sig_fkey
  FOREIGN KEY (customer_signoff_signature_id) REFERENCES document_signatures(id);
