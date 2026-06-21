-- Localization Center (Phase 3): before removing the accounting_locales resolver
-- fold (buildConfigLayers), preserve exactly what the fold provided. The fold lifted
-- ONLY these 3 keys at the tenant altitude: currency.code, datetime.date_format,
-- locale.code (the cosmetic currency/datetime fields were always read from
-- resolved_country_config, NOT the fold, so they are intentionally NOT backfilled).
--
-- Idempotent + additive: for each tenant with a default accounting_locale row, lift a
-- fold key into country_config_overrides ONLY when it is absent from BOTH
-- resolved_country_config AND country_config_overrides (i.e. the fold was its sole
-- source). Re-run = no-op. Never lowers isResolvedConfig.
--
-- Live data 2026-06-16: 2 tenants, both already carry all 3 keys in
-- resolved_country_config -> this migration writes nothing today; it is a safety net
-- for any tenant whose required keys were fold-only before the fold is removed.
UPDATE public.tenants t
SET country_config_overrides = COALESCE(t.country_config_overrides, '{}'::jsonb) || (
  SELECT COALESCE(jsonb_object_agg(kv.key, kv.val), '{}'::jsonb)
  FROM (
    SELECT 'currency.code'        AS key, to_jsonb(al.currency_code) AS val WHERE al.currency_code IS NOT NULL
    UNION ALL SELECT 'datetime.date_format', to_jsonb(al.date_format)        WHERE al.date_format   IS NOT NULL
    UNION ALL SELECT 'locale.code',          to_jsonb(al.locale_code)        WHERE al.locale_code   IS NOT NULL
  ) kv
  WHERE NOT (COALESCE(t.resolved_country_config, '{}'::jsonb) ? kv.key)
    AND NOT (COALESCE(t.country_config_overrides, '{}'::jsonb) ? kv.key)
)
FROM public.accounting_locales al
WHERE al.tenant_id = t.id
  AND al.is_default = true
  AND al.deleted_at IS NULL
  AND t.deleted_at IS NULL;
