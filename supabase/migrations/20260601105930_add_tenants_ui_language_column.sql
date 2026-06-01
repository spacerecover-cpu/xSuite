-- Tenant-wide UI language / text-direction, decoupled from country.
-- Before this, UI direction was derived from geo_countries.language_code, so an
-- English-operating lab in an Arabic-language country (e.g. Oman) was forced into
-- a fully mirrored RTL interface with no way to switch. Country continues to drive
-- currency/date/number formats; this column governs only interface language + dir.
-- Additive: NOT NULL DEFAULT 'en' backfills every existing tenant to English/LTR.
--
-- NOTE: applied to the live DB out-of-band (version 20260601105930); captured here
-- so the migration-manifest/schema-drift gates stay green. Belongs to the UI-language
-- workstream — included on this branch only to unblock PR #137.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ui_language text NOT NULL DEFAULT 'en'
    CHECK (ui_language IN ('en', 'ar'));

COMMENT ON COLUMN public.tenants.ui_language IS
  'Tenant-wide UI language and text direction, independent of country (country still drives currency/date/number formats). en = LTR (default), ar = RTL.';
