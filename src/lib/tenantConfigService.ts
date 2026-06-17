import { supabase } from './supabaseClient';
import type { TenantConfig, TaxSystem, Theme } from '../types/tenantConfig';
import { DEFAULT_TENANT_CONFIG, DEFAULT_THEME, THEMES, REQUIRED_SENTINEL } from '../types/tenantConfig';
import { logger } from './logger';
import { SUPPORTED_LANGS } from './locale';
import { resolveCountryConfigKey, REGISTRY_BY_KEY, isConfigKeyLocked } from './country/registry';
import type { Json } from '../types/database.types';
import { buildConfigLayers } from './country/buildConfigLayers';
import type { ConfigLayers } from './country/resolveCountryConfig';

const configCache = new Map<string, { config: TenantConfig; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchTenantConfig(tenantId: string): Promise<TenantConfig> {
  // Per-tenant feature overrides, read concurrently with the tenant config.
  const flagsPromise = supabase
    .from('tenants')
    .select('feature_flags')
    .eq('id', tenantId)
    .maybeSingle();

  // These reads are keyed only on tenantId and are independent, so run concurrently.
  // Phase 3: the accounting_locales default-row read was removed — country_config_overrides
  // is now the sole tenant-override source (the resolver fold was cut in buildConfigLayers).
  const [tenantResult, flagsResult] = await Promise.all([
    supabase
      .from('tenants')
      .select(`
        id, name, theme, ui_language,
        resolved_country_config, country_config_overrides,
        currency_code, currency_symbol, decimal_places,
        tax_system, tax_label, tax_number_label, tax_number, default_tax_rate,
        locale_code, timezone, date_format, fiscal_year_start,
        country:geo_countries!country_id (
          code, name, currency_name,
          decimal_separator, thousands_separator, currency_position,
          tax_number_format, tax_number_placeholder,
          time_format, week_starts_on, language_code,
          postal_code_label, tax_invoice_required
        )
      `)
      .eq('id', tenantId)
      .maybeSingle(),
    flagsPromise,
  ]);

  const { data, error } = tenantResult;
  if (error || !data) {
    logger.error('Failed to fetch tenant config:', error);
    return { ...DEFAULT_TENANT_CONFIG, tenantId };
  }

  const rawFlags = flagsResult?.data?.feature_flags;
  const featureFlags: Record<string, boolean> =
    rawFlags && typeof rawFlags === 'object' && !Array.isArray(rawFlags)
      ? (rawFlags as Record<string, boolean>)
      : {};

  const layers = buildConfigLayers({
    resolved_country_config: (data as Record<string, unknown>).resolved_country_config,
    country_config_overrides: (data as Record<string, unknown>).country_config_overrides,
  });
  // Engine path: resolve every required field through the cascade. A missing
  // required key throws CountryConfigError, which propagates to the provider's
  // blocking "not configured" state (§4.5) — never a silent US fallback.
  const resolved = resolveTenantConfigFromLayers(data as Record<string, unknown>, layers);
  return { ...resolved, featureFlags };
}

/**
 * Pure: a tenant base row (id/name/theme) + the assembled DISPLAY ConfigLayers →
 * TenantConfig, resolving every JURISDICTION-required field through the engine
 * (resolveCountryConfigKey). A missing required key THROWS CountryConfigError —
 * fail-loud, never a US literal (D2/D3). Cosmetic display fields (symbol,
 * separators, position) read from the snapshot bag with safe display fallbacks
 * because they are tenant-chosen, not statutory. This is the testable seam (no DB).
 */
export function resolveTenantConfigFromLayers(
  base: Record<string, unknown>,
  layers: ConfigLayers,
): TenantConfig {
  const snap = (layers.country ?? {}) as Record<string, unknown>;
  const get = <T>(key: string): T => resolveCountryConfigKey<T>(layers, key); // throws on unresolved required

  return {
    tenantId: base.id as string,
    tenantName: base.name as string,
    countryCode: (snap['country.code'] as string) || (base.countryCode as string) || '',
    countryName: (snap['country.name'] as string) || (base.countryName as string) || '',
    currency: {
      code: get<string>('currency.code'), // required → throws if unresolved
      symbol: (snap['currency.symbol'] as string) || '',
      name: (snap['currency.name'] as string) || (get<string>('currency.code')),
      decimalPlaces: get<number>('currency.decimal_places'),
      decimalSeparator: get<string>('currency.decimal_separator'),
      thousandsSeparator: get<string>('currency.thousands_separator'),
      position: get<'before' | 'after'>('currency.position'),
      // Tenant display preferences (registry codedDefault 'symbol'/'minus' unless
      // the tenant overrode via country_config_overrides). Non-statutory.
      displayMode: get<'symbol' | 'iso_code' | 'symbol_code'>('currency.display_mode'),
      negativeFormat: get<'minus' | 'parentheses'>('currency.negative_format'),
    },
    tax: {
      system: ((snap['tax.system'] as string) || 'NONE') as TaxSystem,
      label: get<string>('tax.label'), // required → throws if unresolved (D9)
      numberLabel: (snap['tax.number_label'] as string) || 'Tax ID',
      numberFormat: (snap['tax.number_format'] as string) || null,
      numberPlaceholder: (snap['tax.number_placeholder'] as string) || null,
      defaultRate: get<number>('tax.default_rate'), // required → throws (D10)
      invoiceRequired: (snap['tax.invoice_required'] as boolean) || false,
    },
    dateTime: {
      dateFormat: get<string>('datetime.date_format'),
      timeFormat: get<'12h' | '24h'>('datetime.time_format'),
      timezone: get<string>('datetime.timezone'),
      weekStartsOn: get<0 | 1 | 2 | 3 | 4 | 5 | 6>('datetime.week_starts_on'),
      fiscalYearStart: get<string>('datetime.fiscal_year_start'),
    },
    locale: {
      localeCode: get<string>('locale.code'),
      // UI language is a deliberate tenant choice, not a country fact (the seed of
      // the jurisdiction-derived-vs-tenant-chosen split, tenantConfigService.ts:108).
      languageCode: (base.ui_language as string) || 'en',
      postalCodeLabel: (snap['address.postal_code_label'] as string) || 'Postal Code',
    },
    theme: THEMES.includes(base.theme as Theme) ? (base.theme as Theme) : DEFAULT_THEME,
    featureFlags: {},
  };
}

/**
 * Pure mapper: tenant row (+ default accounting-locale row) → TenantConfig.
 * D2/D3 fail-loud: required jurisdiction-derived keys (currency code, locale code)
 * resolve to REQUIRED_SENTINEL when absent — NEVER to a US literal (USD/en-US). The
 * provider surfaces this via isResolvedConfig instead of silently rendering US.
 * Cosmetic/tenant-chosen display fields (symbol, separators, position) keep their
 * safe display fallbacks (spec §2.3). Extracted as the testable seam for Task 2.2.
 */
export function mapRowToConfig(
  data: Record<string, unknown>,
  defaultLocale: Record<string, unknown> | null,
): TenantConfig {
  const country = (data.country as Record<string, unknown> | null) ?? null;
  return {
    tenantId: data.id as string,
    tenantName: data.name as string,
    countryCode: (country?.code as string) || 'US',
    countryName: (country?.name as string) || 'United States',
    currency: {
      code: (defaultLocale?.currency_code as string) || (data.currency_code as string) || REQUIRED_SENTINEL,
      symbol: (defaultLocale?.currency_symbol as string) || (data.currency_symbol as string) || '$',
      name: (country?.currency_name as string) || (data.currency_code as string) || 'Currency',
      decimalPlaces: (defaultLocale?.decimal_places as number) ?? (data.decimal_places as number) ?? 2,
      decimalSeparator: (defaultLocale?.decimal_separator as string) || (country?.decimal_separator as string) || '.',
      thousandsSeparator: (defaultLocale?.thousands_separator as string) ?? (country?.thousands_separator as string) ?? ',',
      position: ((defaultLocale?.currency_position as string) || (country?.currency_position as string) || 'before') as 'before' | 'after',
      // Legacy accounting-locale path carries no display-preference columns; default
      // to byte-identical pre-Phase-2 rendering. The engine path resolves overrides.
      displayMode: 'symbol',
      negativeFormat: 'minus',
    },
    tax: {
      system: (data.tax_system || 'NONE') as TaxSystem,
      label: (data.tax_label as string) || 'Tax',
      numberLabel: (data.tax_number_label as string) || 'Tax ID',
      numberFormat: (country?.tax_number_format as string) || null,
      numberPlaceholder: (country?.tax_number_placeholder as string) || null,
      defaultRate: parseFloat(String(data.default_tax_rate)) || 0,
      invoiceRequired: (country?.tax_invoice_required as boolean) || false,
    },
    dateTime: {
      dateFormat: (defaultLocale?.date_format as string) || (data.date_format as string) || 'MM/DD/YYYY',
      timeFormat: ((country?.time_format as string) || '12h') as '12h' | '24h',
      timezone: (data.timezone as string) || 'UTC',
      weekStartsOn: ((country?.week_starts_on as number) ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      fiscalYearStart: (data.fiscal_year_start as string) || '01-01',
    },
    locale: {
      localeCode: (defaultLocale?.locale_code as string) || (data.locale_code as string) || REQUIRED_SENTINEL,
      // UI language / text-direction is a deliberate tenant choice, NOT a function
      // of country. country.language_code is intentionally no longer read here, so
      // an English-operating lab in an Arabic-language country defaults to LTR.
      languageCode: (data.ui_language as string) || 'en',
      postalCodeLabel: (country?.postal_code_label as string) || 'Postal Code',
    },
    theme: THEMES.includes(data.theme as Theme) ? (data.theme as Theme) : DEFAULT_THEME,
    featureFlags: {},
  };
}

export async function getTenantConfig(tenantId: string): Promise<TenantConfig> {
  const cached = configCache.get(tenantId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.config;
  }

  const config = await fetchTenantConfig(tenantId);
  configCache.set(tenantId, { config, timestamp: Date.now() });
  return config;
}

/**
 * Persist tenant config overrides into tenants.country_config_overrides via the
 * merge RPC (Localization Center write path). Validates EACH key client-side
 * against the registry's own Zod schema and rejects locked (statutory/required)
 * or unknown keys before the round-trip. The server enforces the lock surface
 * authoritatively too — the set RPC rejects required jurisdiction keys and the
 * validate_country_config_overrides() trigger rejects country-locked statutory
 * keys — so a direct rpc() call cannot bypass it. Invalidates the 5-min config
 * cache so the next read (and refreshConfig) sees the new values.
 */
export async function setTenantConfigOverrides(
  tenantId: string,
  overrides: Record<string, Json>,
): Promise<void> {
  for (const [key, value] of Object.entries(overrides)) {
    const def = REGISTRY_BY_KEY[key];
    if (!def) throw new Error(`Unknown config key: ${key}`);
    if (isConfigKeyLocked(key)) throw new Error(`Config key is locked (statutory/required): ${key}`);
    const parsed = def.schema.safeParse(value);
    if (!parsed.success) throw new Error(`Invalid value for ${key}: ${parsed.error.message}`);
  }
  const { error } = await supabase.rpc('set_tenant_country_config_overrides', {
    p_tenant_id: tenantId,
    p_overrides: overrides,
  });
  if (error) {
    logger.error('Failed to set tenant config overrides:', error);
    throw error;
  }
  invalidateTenantConfigCache(tenantId);
}

/** Clear specific tenant config override keys (reset to country default) via the
 *  reset RPC, which refuses to clear a required key that is not otherwise
 *  resolvable (anti-brick). Invalidates the config cache. */
export async function resetTenantConfigOverrides(tenantId: string, keys: string[]): Promise<void> {
  const { error } = await supabase.rpc('reset_tenant_country_config_overrides', {
    p_tenant_id: tenantId,
    p_keys: keys,
  });
  if (error) {
    logger.error('Failed to reset tenant config overrides:', error);
    throw error;
  }
  invalidateTenantConfigCache(tenantId);
}

export async function updateTenantUiLanguage(tenantId: string, language: string): Promise<void> {
  // Validate against the hydrated supported-language set (geo_languages), not a
  // hardcoded en/ar union. Bootstrap is {en, ar} until hydrateLanguages widens it.
  if (!SUPPORTED_LANGS.has(language)) {
    throw new Error(`Invalid UI language: ${language}`);
  }
  const { error } = await supabase
    .from('tenants')
    .update({ ui_language: language })
    .eq('id', tenantId);
  if (error) {
    logger.error('Failed to update tenant UI language:', error);
    throw error;
  }
  invalidateTenantConfigCache(tenantId);
}

/** Re-applies the DISPLAY country config to a tenant after a geo_countries
 *  correction (§4.3/§10b). Statutory rate/FX is NOT re-synced — it resolves live
 *  effective-dated at commit. Invalidates the cache so the next read is fresh. */
export async function resyncTenantCountryConfig(tenantId: string): Promise<void> {
  const { error } = await supabase.rpc('resync_tenant_country_config', { p_tenant_id: tenantId });
  if (error) {
    logger.error('Failed to resync tenant country config:', error);
    throw error;
  }
  invalidateTenantConfigCache(tenantId);
}

export function invalidateTenantConfigCache(tenantId: string): void {
  configCache.delete(tenantId);
}

export function clearTenantConfigCache(): void {
  configCache.clear();
}
