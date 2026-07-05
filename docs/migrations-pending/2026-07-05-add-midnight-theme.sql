-- ============================================================================
-- PENDING MIGRATION — NOT YET APPLIED
-- name: add_midnight_theme
-- date: 2026-07-05
--
-- Adds the 4th tenant theme value 'midnight' (Midnight Aurora) to the
-- tenants.theme CHECK constraint. Frontend support ships in the same PR
-- (v1.5.0); until this migration is applied, selecting Midnight Aurora in
-- Settings → Appearance will fail the CHECK and the UI will surface
-- "Failed to update theme" (the optimistic preview reverts safely).
--
-- HOW TO APPLY (per CLAUDE.md source-of-truth rules — never via dashboard):
--   mcp__supabase__apply_migration
--     project_id: ssmbegiyjivrcwgcqutu
--     name:       add_midnight_theme
--     query:      <this file's SQL below>
-- then add a row to supabase/migrations.manifest.md for the applied version.
-- (The Supabase MCP was unauthenticated in the session that authored this
-- change, so the SQL ships here as a pending artifact instead of being
-- written to supabase/migrations/, which must mirror APPLIED history only.)
--
-- No table rewrite: CHECK constraints on existing values validate in place;
-- no rows change ('midnight' only becomes newly legal). Additive + reversible.
-- ============================================================================

-- The original add_tenants_theme_column migration (20260513174236) is
-- pre-manifest "(historical)", so the constraint name is not verifiable
-- offline — drop whichever CHECK constraint governs theme, then recreate
-- canonically.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tenants'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%theme%'
  LOOP
    EXECUTE format('ALTER TABLE public.tenants DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_theme_check
  CHECK (theme IN ('royal', 'burgundy', 'scarlet', 'midnight'));

COMMENT ON COLUMN public.tenants.theme IS
  'Tenant-selectable UI theme: royal (default) | burgundy | scarlet | midnight (Midnight Aurora, premium dark). CHECK-constrained; see DESIGN.md → Color → Themes.';
