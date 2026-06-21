-- FAIL the build if any active country is a stub (missing currency/locale/date/timezone).
-- Operationalizes fail-loud (spec §4.5/§9.4): an is_active country MUST be onboardable.
DO $$
DECLARE bad int;
BEGIN
  -- NOTE: geo_countries has NO deleted_at column (global lookup); de-activation
  -- is via is_active=false. The prior `deleted_at IS NULL` predicate ERRORED at
  -- runtime (column does not exist) — that latent bug is why this gate ran
  -- report-only. Fixed here so it can enforce alongside check-geo-completeness.
  SELECT count(*) INTO bad FROM public.geo_countries
  WHERE is_active = true
    AND (currency_code IS NULL OR currency_code = '' OR char_length(currency_code) <> 3
         OR locale_code IS NULL OR date_format IS NULL OR timezone IS NULL);
  IF bad > 0 THEN
    RAISE EXCEPTION 'check-active-country-config: % active country row(s) are stubs (missing currency/locale/date/timezone)', bad;
  END IF;
END $$;
