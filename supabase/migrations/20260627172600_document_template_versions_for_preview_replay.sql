-- Preview-replay shim #4 (preview-fix workstream; precedent: 20260409000001).
--
-- document_template_versions was created on the live DB by the UNMIRRORED
-- pdf_template_engine_m1_schema migration (20260613164410). The mirrored
-- 20260627172705 (create_document_instances) declares
--   template_version_id uuid REFERENCES document_template_versions(id)
-- so a fresh preview-branch replay dies with 42P01. Column set mirrors live;
-- FKs/RLS/policies of the original are deliberately omitted (they would pull
-- in further unmirrored objects, e.g. legal_entities) — the replay only needs
-- the FK target. Idempotent; registered as applied on prod (table exists there).
CREATE TABLE IF NOT EXISTS public.document_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  template_id uuid NOT NULL,
  version_number integer NOT NULL,
  config jsonb NOT NULL,
  is_deployed boolean NOT NULL DEFAULT false,
  change_note text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  legal_entity_id uuid,
  business_unit_id uuid
);
