-- Preview-replay shim (preview-fix workstream; precedent: 20260409000001).
--
-- tenants.country_config_overrides / tenants.resolved_country_config were added
-- to the live DB by the UNMIRRORED country_engine_phase1_foundation migration
-- (20260615082952, applied via MCP). The mirrored 202606161* files reference
-- them, so every fresh Supabase preview-branch replay died at 20260616142738
-- ("column t.country_config_overrides does not exist", SQLSTATE 42703) — the
-- visible Supabase Preview CI failure on any PR touching supabase/.
--
-- Adds ONLY the two columns those mirrored files need, with the exact live
-- shape (jsonb NOT NULL DEFAULT '{}'). Idempotent; registered as applied on
-- prod (the columns already exist there), so it is a no-op outside preview
-- replays.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS country_config_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_country_config jsonb NOT NULL DEFAULT '{}'::jsonb;
