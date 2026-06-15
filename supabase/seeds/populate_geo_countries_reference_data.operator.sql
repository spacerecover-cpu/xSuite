-- =============================================================================
-- OPERATOR-APPLY MIGRATION: populate_geo_countries_reference_data
-- =============================================================================
-- DO NOT auto-apply. This file is the deliverable the OPERATOR lands via
--   mcp__supabase__apply_migration(project_id='ssmbegiyjivrcwgcqutu',
--     name='populate_geo_countries_reference_data', query=<this file body>)
-- then regenerates src/types/database.types.ts, adds a migrations.manifest row,
-- and runs check-schema-drift + check-tsc.
--
-- WHY THE OPERATOR, NOT THE SUBAGENT: the subagent that authored this is barred
-- from applying migrations / regenerating types per its task constraints.
--
-- SCOPE: this lands ONLY the hand-verified GCC-6 + priority-anchor countries
-- (SA AE OM KW QA BH GB IN US). The full ~195-country population needs the
-- CLDR/ISO/libphonenumber dataset dependency, which is an OWNER DECISION (see
-- the PR blockers). Countries NOT covered here are de-activated below so the
-- enforcing no-stub gate (check-geo-completeness.sql) stays green.
-- =============================================================================

BEGIN;

-- (1) PREREQUISITE COLUMNS — the seed emitter writes provenance + a curation
-- lock that migration 1 (country_engine_geo_country_config_bag) did NOT add.
-- Verified live 2026-06-15: geo_countries has country_config/config_status/
-- weekend_days/digit_grouping/reference_dataset_version but NOT these three.
ALTER TABLE public.geo_countries
  ADD COLUMN IF NOT EXISTS source_locked  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_source    text,
  ADD COLUMN IF NOT EXISTS source_version text;

-- (2) THE GENERATED SEED BODY
-- ----------------------------------------------------------------------------
-- >>> PASTE THE CONTENTS OF supabase/seeds/geo_countries_seed.generated.sql HERE <<<
-- (kept as a separate generated artifact so the generator output stays diffable;
--  the operator inlines it at apply time, or \i it when running via psql.)
\i supabase/seeds/geo_countries_seed.generated.sql

-- (3) DE-ACTIVATE every country we could NOT fully populate this phase, so no
-- half-stub stays is_active=true (fail-loud: never ship a partially-configured
-- active country). Only the hand-verified set remains onboardable.
UPDATE public.geo_countries
SET is_active = false, updated_at = now()
WHERE is_active = true
  AND code NOT IN ('SA','AE','OM','KW','QA','BH','GB','IN','US');

-- (4) VERIFY — must return 0, else the gate would (correctly) fail.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.geo_countries
  WHERE is_active = true
    AND (currency_code IS NULL OR char_length(currency_code) <> 3
         OR locale_code IS NULL OR date_format IS NULL OR timezone IS NULL
         OR phone_format IS NULL OR address_format = '{}'::jsonb);
  IF bad > 0 THEN
    RAISE EXCEPTION 'populate_geo_countries_reference_data: % active stub(s) remain after seed', bad;
  END IF;
END $$;

COMMIT;
