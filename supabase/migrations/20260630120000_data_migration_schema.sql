-- Unified import/export engine (P0). Two tenant-scoped tables:
--   data_migration_runs       — one ledger row per import/export run
--   data_migration_entity_map — legacy_id -> new_id remap + idempotency backbone
-- Both: tenant_id NOT NULL FK, RLS enabled+forced, RESTRICTIVE isolation,
-- set_<table>_tenant_and_audit + audit_actor triggers, idx_<table>_tenant_id partial.

-- ── data_migration_runs ─────────────────────────────────────────────────────
CREATE TABLE data_migration_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('import','export')),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','validating','running','paused','completed','failed')),
  source_filename text,
  file_hash       text,
  schema_version  int  NOT NULL DEFAULT 1,
  totals          jsonb NOT NULL DEFAULT '{}'::jsonb,
  counts          jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary   jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX idx_data_migration_runs_tenant_id
  ON data_migration_runs(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_data_migration_runs_status
  ON data_migration_runs(tenant_id, kind, status) WHERE deleted_at IS NULL;
-- One resumable (non-completed) import per (tenant, file_hash).
CREATE UNIQUE INDEX uq_data_migration_runs_active_import
  ON data_migration_runs(tenant_id, file_hash)
  WHERE kind = 'import' AND status <> 'completed' AND deleted_at IS NULL;

CREATE TRIGGER set_data_migration_runs_tenant_and_audit
  BEFORE INSERT OR UPDATE ON data_migration_runs
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();
CREATE TRIGGER set_data_migration_runs_audit_actor
  BEFORE INSERT OR UPDATE ON data_migration_runs
  FOR EACH ROW EXECUTE FUNCTION set_audit_actor_fields();

ALTER TABLE data_migration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_migration_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY data_migration_runs_tenant_isolation ON data_migration_runs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
CREATE POLICY data_migration_runs_select ON data_migration_runs
  AS PERMISSIVE FOR SELECT TO authenticated USING (is_staff_user());
CREATE POLICY data_migration_runs_insert ON data_migration_runs
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_staff_user());
CREATE POLICY data_migration_runs_update ON data_migration_runs
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_staff_user()) WITH CHECK (is_staff_user());
CREATE POLICY data_migration_runs_delete ON data_migration_runs
  AS PERMISSIVE FOR DELETE TO authenticated USING (has_role('admin'));

-- ── data_migration_entity_map ───────────────────────────────────────────────
CREATE TABLE data_migration_entity_map (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid NOT NULL REFERENCES data_migration_runs(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  legacy_id    text NOT NULL,
  new_id       uuid,
  status       text NOT NULL CHECK (status IN ('inserted','skipped_duplicate','error')),
  error        text,
  created_by   uuid,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX idx_data_migration_entity_map_tenant_id
  ON data_migration_entity_map(tenant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_data_migration_entity_map_legacy
  ON data_migration_entity_map(run_id, entity_type, legacy_id);
CREATE INDEX idx_data_migration_entity_map_run_entity
  ON data_migration_entity_map(run_id, entity_type);
CREATE INDEX idx_data_migration_entity_map_tenant_entity
  ON data_migration_entity_map(tenant_id, entity_type, legacy_id);

CREATE TRIGGER set_data_migration_entity_map_tenant_and_audit
  BEFORE INSERT OR UPDATE ON data_migration_entity_map
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();
CREATE TRIGGER set_data_migration_entity_map_audit_actor
  BEFORE INSERT OR UPDATE ON data_migration_entity_map
  FOR EACH ROW EXECUTE FUNCTION set_audit_actor_fields();

ALTER TABLE data_migration_entity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_migration_entity_map FORCE ROW LEVEL SECURITY;

CREATE POLICY data_migration_entity_map_tenant_isolation ON data_migration_entity_map
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
CREATE POLICY data_migration_entity_map_select ON data_migration_entity_map
  AS PERMISSIVE FOR SELECT TO authenticated USING (is_staff_user());
CREATE POLICY data_migration_entity_map_insert ON data_migration_entity_map
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_staff_user());
CREATE POLICY data_migration_entity_map_update ON data_migration_entity_map
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_staff_user()) WITH CHECK (is_staff_user());
CREATE POLICY data_migration_entity_map_delete ON data_migration_entity_map
  AS PERMISSIVE FOR DELETE TO authenticated USING (has_role('admin'));
