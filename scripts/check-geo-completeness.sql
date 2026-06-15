-- STRICTER no-stub gate (Country Engine Phase 1, formatting-ready).
-- Fails the build if any active, non-deleted country is missing ANY of the
-- formatting keystones the engine renders from: currency / locale / date /
-- timezone / phone / address. This is the enforcing companion to the looser
-- Phase-0 check-active-country-config.sql (currency/locale/date/timezone only);
-- both run in CI. Operationalizes fail-loud (spec §4.5/§9.4): an is_active
-- country MUST be fully onboardable — never a half-stub.
DO $$
DECLARE bad int;
BEGIN
  -- NOTE: geo_countries has NO deleted_at column (global lookup; unprepared
  -- countries are de-activated via is_active=false, not soft-deleted).
  SELECT count(*) INTO bad FROM public.geo_countries
  WHERE is_active = true
    AND (currency_code IS NULL OR char_length(currency_code) <> 3
         OR locale_code IS NULL OR date_format IS NULL OR timezone IS NULL
         OR phone_format IS NULL OR address_format = '{}'::jsonb);
  IF bad > 0 THEN
    RAISE EXCEPTION 'check-geo-completeness: % active country row(s) are stubs (missing currency/locale/date/timezone/phone/address)', bad;
  END IF;
END $$;
