-- ============================================================================
-- DRAFT — requires explicit approval (M1 gate); apply via
-- mcp__supabase__apply_migration, then regenerate src/types/database.types.ts.
-- ============================================================================
--
-- Migration draft: Tenant-Configurable Bilingual PDF Document Template Engine — M1 schema.
-- Design spec: docs/superpowers/specs/2026-06-13-pdf-template-engine-design.md
-- Supabase project: ssmbegiyjivrcwgcqutu
--
-- THIS FILE IS A REVIEWABLE ARTIFACT ONLY. DO NOT APPLY IT IN THIS RUN.
-- It is hand-written DDL for human approval at the M1 ⚠ gate. When approved,
-- it is to be applied via mcp__supabase__apply_migration (one logical migration,
-- or split into the four labelled sections below), followed by a regeneration
-- of src/types/database.types.ts via mcp__supabase__generate_typescript_types.
--
-- Conventions verified against the LIVE schema (project ssmbegiyjivrcwgcqutu),
-- not assumed:
--   * Canonical tenant trigger function = public.set_tenant_and_audit_fields()
--     (no args; SECURITY DEFINER; manages tenant_id + created_at/updated_at;
--     enforces no-cross-tenant-insert and no-tenant_id-change). Attached as a
--     BEFORE INSERT OR UPDATE trigger named set_<table>_tenant_and_audit.
--   * Canonical actor trigger function = public.set_audit_actor_fields()
--     (no args; SECURITY DEFINER; stamps created_by on INSERT, updated_by on
--     UPDATE from auth.uid()). Attached as a BEFORE INSERT OR UPDATE trigger
--     named set_<table>_audit_actor. NOTE: the tenant trigger does NOT stamp
--     actor columns — the two triggers are separate (matches case_internal_notes).
--   * RESTRICTIVE tenant isolation policy form:
--     (tenant_id = get_current_tenant_id() OR is_platform_admin())
--   * Partial tenant index name = idx_<table>_tenant_id ... WHERE deleted_at IS NULL.
--   * Soft delete via deleted_at timestamptz DEFAULT NULL; never hard delete.
--   * Role helpers available: is_platform_admin(), is_tenant_admin(),
--     is_staff_user(), has_role(text), get_current_tenant_id().
--
-- SECTIONS:
--   1. branding_themes                      (new tenant-scoped table)
--   2. document_templates_pdf               (new tenant-scoped table)
--   3. document_template_versions           (new tenant-scoped, immutable table)
--   4. Lock-on-issue pins (invoices/quotes/case_reports add template_version_id)
--   5. Report Studio RLS fix (report_section_library / _presets /
--      master_case_report_templates) + soft-delete normalization
--
-- TODO (M1 gate — confirm before apply):
--   * Final table/column NAMES (prompt provides working names; confirm prefixes).
--     -- TODO: prefix question — these are tenant-scoped but do NOT carry a domain
--        prefix from the Table-Prefixes table (no document_*/template_* prefix is
--        defined). Names below follow the design spec verbatim. Confirm whether to
--        adopt a `document_*` prefix for consistency, or keep spec names.
--   * Exact config jsonb shape is validated in the app layer (resolver), not by a
--     CHECK here; confirm whether a jsonb_schema CHECK is wanted at M1 or deferred.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — branding_themes
-- Xero-style reusable identity. Seeded (later, app-side) from
-- company_settings.branding. Logo refs reuse the existing `company-assets`
-- Storage bucket (URLs only; no Storage change in this migration).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.branding_themes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  name               text NOT NULL,
  is_default         boolean NOT NULL DEFAULT false,

  -- Identity / logo (URLs into the existing company-assets bucket; no Storage DDL here)
  logo_url           text,                       -- primary logo
  logo_light_url     text,                       -- light-background variant
  favicon_url        text,

  -- PDFs stay NEUTRAL (logo-only) in v1 per design Decision 4 / open question 2.
  -- accent_color is collected but OPT-IN and ignored by the renderer until M7.
  accent_color       text,                       -- TODO: bounded #hex; app-validated. Ignored by renderer in v1.

  -- Typography / page defaults (renderer reads these; fonts already embedded)
  font_family        text NOT NULL DEFAULT 'Roboto',
  default_paper_size text NOT NULL DEFAULT 'A4',         -- 'A4' | 'Letter'
  default_orientation text NOT NULL DEFAULT 'portrait',  -- 'portrait' | 'landscape'
  default_margins    jsonb NOT NULL DEFAULT '[40,40,40,40]'::jsonb,  -- [top,right,bottom,left]

  -- Static text blocks reused across documents
  footer_text        text,
  terms_text         text,

  -- Structured extras: socials, per-doc QR config, language defaults, etc.
  -- TODO: confirm whether socials/qr_config deserve their own columns or stay in metadata.
  socials            jsonb NOT NULL DEFAULT '{}'::jsonb,
  qr_config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  language_defaults  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- e.g. {"mode":"en","primary":"en"}
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Audit actor + timestamps (stamped by triggers below)
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz DEFAULT NULL
);

ALTER TABLE public.branding_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branding_themes FORCE ROW LEVEL SECURITY;

-- RESTRICTIVE tenant isolation (ANDed with all permissive policies)
CREATE POLICY branding_themes_tenant_isolation ON public.branding_themes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());

-- Permissive operation policies
CREATE POLICY branding_themes_select ON public.branding_themes
  FOR SELECT TO authenticated
  USING (true);  -- gated to-tenant by the RESTRICTIVE policy above

CREATE POLICY branding_themes_insert ON public.branding_themes
  FOR INSERT TO authenticated
  WITH CHECK (is_staff_user());

CREATE POLICY branding_themes_update ON public.branding_themes
  FOR UPDATE TO authenticated
  USING (is_staff_user())
  WITH CHECK (is_staff_user());

-- DELETE (soft-delete is the norm; this gates the rare hard-delete path) — admin only
CREATE POLICY branding_themes_delete ON public.branding_themes
  FOR DELETE TO authenticated
  USING (has_role('admin'));

-- Tenant + audit + actor triggers (canonical pair)
CREATE TRIGGER set_branding_themes_tenant_and_audit
  BEFORE INSERT OR UPDATE ON public.branding_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_and_audit_fields();

CREATE TRIGGER set_branding_themes_audit_actor
  BEFORE INSERT OR UPDATE ON public.branding_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor_fields();

-- Partial tenant index
CREATE INDEX idx_branding_themes_tenant_id
  ON public.branding_themes (tenant_id)
  WHERE deleted_at IS NULL;

-- One default theme per tenant (partial unique; excludes soft-deleted)
-- TODO: confirm single-default semantics are desired (mirrors uq_customer_primary_company pattern).
CREATE UNIQUE INDEX uq_branding_themes_default_per_tenant
  ON public.branding_themes (tenant_id)
  WHERE is_default = true AND deleted_at IS NULL;

COMMENT ON TABLE public.branding_themes IS
  'Reusable per-tenant branding identity (Xero-style theme) for the PDF template engine. Logo URLs reference the company-assets Storage bucket. accent_color is opt-in and ignored by the renderer until M7 (PDFs neutral in v1).';


-- ============================================================================
-- SECTION 2 — document_templates_pdf
-- Per doc-type configurable template. One default per (tenant, document_type).
-- The live editable config lives on the deployed version row (Section 3); the
-- column here holds the working/draft config for the editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_templates_pdf (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Which document this template drives. Free-text + app-side enum union for now;
  -- the renderer's DocumentType union (invoice, quote, payment_receipt, office_receipt,
  -- customer_copy, checkout_form, case_label, stock_label, chain_of_custody,
  -- case_report, payslip).
  -- TODO: confirm whether to back this with a master_* lookup or a CHECK enum.
  document_type     text NOT NULL,

  name              text NOT NULL,
  branding_theme_id uuid REFERENCES public.branding_themes(id) ON DELETE SET NULL,

  -- Working / draft config snapshot (see design §5 "Template config schema (JSON)").
  -- The authoritative issued-doc config is the DEPLOYED version row in Section 3.
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,

  is_default        boolean NOT NULL DEFAULT false,

  -- 'en' | 'ar' | 'bilingual_stacked' | 'bilingual_sidebyside'
  language_mode     text NOT NULL DEFAULT 'en',

  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz DEFAULT NULL
);

ALTER TABLE public.document_templates_pdf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates_pdf FORCE ROW LEVEL SECURITY;

CREATE POLICY document_templates_pdf_tenant_isolation ON public.document_templates_pdf
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());

CREATE POLICY document_templates_pdf_select ON public.document_templates_pdf
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY document_templates_pdf_insert ON public.document_templates_pdf
  FOR INSERT TO authenticated
  WITH CHECK (is_staff_user());

CREATE POLICY document_templates_pdf_update ON public.document_templates_pdf
  FOR UPDATE TO authenticated
  USING (is_staff_user())
  WITH CHECK (is_staff_user());

CREATE POLICY document_templates_pdf_delete ON public.document_templates_pdf
  FOR DELETE TO authenticated
  USING (has_role('admin'));

CREATE TRIGGER set_document_templates_pdf_tenant_and_audit
  BEFORE INSERT OR UPDATE ON public.document_templates_pdf
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_and_audit_fields();

CREATE TRIGGER set_document_templates_pdf_audit_actor
  BEFORE INSERT OR UPDATE ON public.document_templates_pdf
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor_fields();

CREATE INDEX idx_document_templates_pdf_tenant_id
  ON public.document_templates_pdf (tenant_id)
  WHERE deleted_at IS NULL;

-- Lookup by doc-type within a tenant
CREATE INDEX idx_document_templates_pdf_tenant_doctype
  ON public.document_templates_pdf (tenant_id, document_type)
  WHERE deleted_at IS NULL;

-- One default template per (tenant, document_type)
-- TODO: confirm one-default-per-doc-type is the desired cascade root.
CREATE UNIQUE INDEX uq_document_templates_pdf_default_per_doctype
  ON public.document_templates_pdf (tenant_id, document_type)
  WHERE is_default = true AND deleted_at IS NULL;

COMMENT ON TABLE public.document_templates_pdf IS
  'Per-document-type configurable PDF template (cascade node: tenant branding theme -> doc-type template). The live/issued config is the deployed version row in document_template_versions; the config column here is the working draft for the Settings editor.';


-- ============================================================================
-- SECTION 3 — document_template_versions  (IMMUTABLE)
-- Append-only version snapshots for a document_templates_pdf row.
--
-- PUBLISH / ROLLBACK SEMANTICS:
--   * Each edit in the editor creates a NEW version row (immutable config snapshot).
--   * is_deployed is a POINTER: exactly one version per template may be deployed
--     (enforced by uq_document_template_versions_one_deployed below).
--   * PUBLISH  = flip is_deployed: set the chosen version's is_deployed = true and
--                clear the previous deployed version's is_deployed = false.
--   * ROLLBACK = re-point is_deployed to an older version (same operation).
--   * The config snapshot of a version is NEVER mutated after creation. Rollback
--     does not edit history; it only moves the deployed pointer.
--   * LOCK-ON-ISSUE: when a document is finalized/issued, the issuing row pins this
--     version via *.template_version_id (Section 4) so the artifact can be
--     re-rendered byte-for-config identically forever (forensic auditability).
--
-- IMMUTABILITY ENFORCEMENT:
--   The config + version_number + template_id of a version row must not change.
--   Only is_deployed (the pointer) and deleted_at may change after insert.
--   -- TODO (M1 gate): decide ENFORCEMENT mechanism. Options:
--      (a) a BEFORE UPDATE trigger that RAISEs if config/version_number/template_id
--          are changed (recommended; mirrors prevent_audit_mutation philosophy), or
--      (b) column-level GRANT/REVOKE.
--   A starter trigger (option a) is drafted below, commented out pending approval.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_template_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  template_id     uuid NOT NULL REFERENCES public.document_templates_pdf(id) ON DELETE CASCADE,
  version_number  integer NOT NULL,         -- monotonic per template_id; assigned app-side or by trigger

  -- Immutable config snapshot captured at publish/version time.
  config          jsonb NOT NULL,

  -- Deployed pointer. Exactly one TRUE per template (partial unique below).
  is_deployed     boolean NOT NULL DEFAULT false,

  -- Optional human note for the version (changelog)
  change_note     text,

  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz DEFAULT NULL,

  CONSTRAINT uq_document_template_versions_number
    UNIQUE (template_id, version_number)
);

ALTER TABLE public.document_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_template_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY document_template_versions_tenant_isolation ON public.document_template_versions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());

CREATE POLICY document_template_versions_select ON public.document_template_versions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY document_template_versions_insert ON public.document_template_versions
  FOR INSERT TO authenticated
  WITH CHECK (is_staff_user());

-- UPDATE allowed only to flip the deployed pointer / soft-delete; the immutability
-- trigger (below, pending approval) blocks config/version_number/template_id changes.
CREATE POLICY document_template_versions_update ON public.document_template_versions
  FOR UPDATE TO authenticated
  USING (is_staff_user())
  WITH CHECK (is_staff_user());

CREATE POLICY document_template_versions_delete ON public.document_template_versions
  FOR DELETE TO authenticated
  USING (has_role('admin'));

CREATE TRIGGER set_document_template_versions_tenant_and_audit
  BEFORE INSERT OR UPDATE ON public.document_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_and_audit_fields();

CREATE TRIGGER set_document_template_versions_audit_actor
  BEFORE INSERT OR UPDATE ON public.document_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor_fields();

CREATE INDEX idx_document_template_versions_tenant_id
  ON public.document_template_versions (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_document_template_versions_template_id
  ON public.document_template_versions (template_id)
  WHERE deleted_at IS NULL;

-- Exactly one deployed version per template (the live pointer)
CREATE UNIQUE INDEX uq_document_template_versions_one_deployed
  ON public.document_template_versions (template_id)
  WHERE is_deployed = true AND deleted_at IS NULL;

COMMENT ON TABLE public.document_template_versions IS
  'Immutable, append-only version snapshots of a PDF template config. is_deployed is the live pointer (exactly one per template). Publish flips the pointer to a new version; rollback re-points to an older one; config snapshots are never edited. Issued documents pin a version via *.template_version_id (lock-on-issue).';

-- ----------------------------------------------------------------------------
-- IMMUTABILITY TRIGGER (option a) — DRAFT, COMMENTED OUT pending M1 approval.
-- Blocks post-insert changes to the immutable columns; allows is_deployed +
-- deleted_at + audit columns to change.
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.prevent_document_template_version_mutation()
--   RETURNS trigger
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path TO 'public'
-- AS $fn$
-- BEGIN
--   IF NEW.config            IS DISTINCT FROM OLD.config
--      OR NEW.version_number IS DISTINCT FROM OLD.version_number
--      OR NEW.template_id    IS DISTINCT FROM OLD.template_id THEN
--     RAISE EXCEPTION 'document_template_versions rows are immutable (config/version_number/template_id cannot change)';
--   END IF;
--   RETURN NEW;
-- END;
-- $fn$;
--
-- CREATE TRIGGER trg_prevent_document_template_version_mutation
--   BEFORE UPDATE ON public.document_template_versions
--   FOR EACH ROW EXECUTE FUNCTION public.prevent_document_template_version_mutation();


-- ============================================================================
-- SECTION 4 — Lock-on-issue pins
-- Nullable template_version_id on issuing tables. NULL = legacy / pre-engine doc
-- (renders via the resolver's live cascade). NON-NULL = pinned forever to that
-- immutable version (forensic re-render).
--
-- Tables confirmed LIVE to have deleted_at + RESTRICTIVE tenant isolation:
--   invoices, quotes, case_reports.  All three are additive nullable columns.
--
-- -- TODO: custody exports (chain_of_custody / *_transfers) are mentioned in the
--    design as also pinning a version. Those are append-only audit tables; adding
--    a column there needs a separate decision (do NOT weaken the audit trigger).
--    Deferred out of this section pending M1 confirmation.
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS template_version_id uuid
    REFERENCES public.document_template_versions(id) ON DELETE SET NULL;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS template_version_id uuid
    REFERENCES public.document_template_versions(id) ON DELETE SET NULL;

ALTER TABLE public.case_reports
  ADD COLUMN IF NOT EXISTS template_version_id uuid
    REFERENCES public.document_template_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoices.template_version_id IS
  'Pinned PDF template version at issue (lock-on-finalize). NULL = pre-engine / live cascade render.';
COMMENT ON COLUMN public.quotes.template_version_id IS
  'Pinned PDF template version at issue (lock-on-finalize). NULL = pre-engine / live cascade render.';
COMMENT ON COLUMN public.case_reports.template_version_id IS
  'Pinned PDF template version at issue (lock-on-finalize). NULL = pre-engine / live cascade render.';

-- Helper indexes for the pin lookups (partial: only rows that actually pin)
CREATE INDEX IF NOT EXISTS idx_invoices_template_version_id
  ON public.invoices (template_version_id)
  WHERE template_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_template_version_id
  ON public.quotes (template_version_id)
  WHERE template_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_case_reports_template_version_id
  ON public.case_reports (template_version_id)
  WHERE template_version_id IS NOT NULL;


-- ============================================================================
-- SECTION 5 — REPORT STUDIO RLS FIX  (security hardening)
-- ----------------------------------------------------------------------------
-- LIVE-SCHEMA CORRECTION vs the design doc:
--   The design said these three tables use `SELECT USING(true)`. The LIVE policies
--   are actually `(tenant_id IS NULL OR tenant_id = get_current_tenant_id()
--   OR is_platform_admin())` — i.e. PERMISSIVE-only with a global (tenant_id IS
--   NULL) read carve-out, and NO RESTRICTIVE tenant-isolation backstop. The real
--   gap is: (1) no RESTRICTIVE policy means a future/permissive policy regression
--   could leak cross-tenant rows; (2) these tables have tenant_id NULLABLE (to hold
--   global/system rows) and NO deleted_at column (soft-delete is via is_active),
--   diverging from the platform standard.
--
-- FIX APPROACH (preserves the legitimate global/system-row read):
--   * Add a RESTRICTIVE tenant-isolation policy that STILL ALLOWS the global rows
--     (tenant_id IS NULL) to be read by everyone, AND own-tenant rows, AND platform
--     admin — but blocks reading ANOTHER tenant's rows even if a permissive policy
--     widens. This is the safe RESTRICTIVE shape for a table that mixes global +
--     tenant data.
--   * Recreate the permissive SELECT to USING(true) (the RESTRICTIVE policy now
--     does the gating), matching the new-table pattern in Sections 1–3.
--   * Normalise soft-delete: add deleted_at where missing (additive; is_active is
--     left in place for backward-compat — app continues to honor both until a later
--     data migration; do NOT drop is_active here).
--
-- -- TODO (M1 gate): confirm the global-row carve-out must remain. If these three
--    tables should become STRICTLY tenant-scoped (no global rows), the RESTRICTIVE
--    policy should drop the `tenant_id IS NULL` branch AND a data migration must
--    first re-home or seed the existing global rows per tenant. As-is, the draft
--    PRESERVES global rows (safer, non-breaking).
-- ============================================================================

-- ---- 5a. Soft-delete normalization (additive; keep is_active) ----
ALTER TABLE public.report_section_library
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

ALTER TABLE public.report_section_presets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

ALTER TABLE public.master_case_report_templates
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.report_section_library.deleted_at IS
  'Soft-delete timestamp. Normalizes Report Studio onto the platform deleted_at standard (is_active retained for backward-compat).';
COMMENT ON COLUMN public.report_section_presets.deleted_at IS
  'Soft-delete timestamp. Normalizes Report Studio onto the platform deleted_at standard.';
COMMENT ON COLUMN public.master_case_report_templates.deleted_at IS
  'Soft-delete timestamp. Normalizes Report Studio onto the platform deleted_at standard (is_active retained for backward-compat).';


-- ---- 5b. report_section_library — RESTRICTIVE isolation + permissive SELECT ----
ALTER TABLE public.report_section_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_section_library FORCE ROW LEVEL SECURITY;

-- RESTRICTIVE backstop: read global rows OR own-tenant rows OR platform admin.
-- (For a mixed global/tenant table; blocks reading another tenant's rows.)
DROP POLICY IF EXISTS report_section_library_tenant_isolation ON public.report_section_library;
CREATE POLICY report_section_library_tenant_isolation ON public.report_section_library
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = get_current_tenant_id()
    OR is_platform_admin()
  );

-- Permissive SELECT now simply true; gating handled by the RESTRICTIVE policy.
DROP POLICY IF EXISTS report_section_library_select ON public.report_section_library;
CREATE POLICY report_section_library_select ON public.report_section_library
  FOR SELECT TO authenticated
  USING (true);
-- INSERT/UPDATE/DELETE policies left as-is (already tenant-admin gated on the live DB).


-- ---- 5c. report_section_presets — RESTRICTIVE isolation + permissive SELECT ----
ALTER TABLE public.report_section_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_section_presets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_section_presets_tenant_isolation ON public.report_section_presets;
CREATE POLICY report_section_presets_tenant_isolation ON public.report_section_presets
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = get_current_tenant_id()
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS report_section_presets_select ON public.report_section_presets;
CREATE POLICY report_section_presets_select ON public.report_section_presets
  FOR SELECT TO authenticated
  USING (true);
-- INSERT/UPDATE/DELETE policies left as-is (already staff/tenant-admin gated).


-- ---- 5d. master_case_report_templates — RESTRICTIVE isolation + permissive SELECT ----
ALTER TABLE public.master_case_report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_case_report_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_case_report_templates_tenant_isolation ON public.master_case_report_templates;
CREATE POLICY master_case_report_templates_tenant_isolation ON public.master_case_report_templates
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = get_current_tenant_id()
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS master_case_report_templates_select ON public.master_case_report_templates;
CREATE POLICY master_case_report_templates_select ON public.master_case_report_templates
  FOR SELECT TO authenticated
  USING (true);
-- INSERT/UPDATE/DELETE policies left as-is (already platform/tenant-admin gated).


-- ============================================================================
-- POST-APPLY (manual, after approval — NOT part of this SQL):
--   1. Regenerate src/types/database.types.ts via
--      mcp__supabase__generate_typescript_types (project ssmbegiyjivrcwgcqutu).
--   2. Add the four new/changed tables to the migration manifest (CI gate).
--   3. Update src/lib/queryKeys.ts + service layer for the new tables.
--   4. Verify scripts/check-tenant-table-requirements.sql passes for the 3 new
--      tenant-scoped tables (RLS forced, RESTRICTIVE isolation, tenant trigger,
--      idx_<table>_tenant_id partial index — all present above).
-- ============================================================================
