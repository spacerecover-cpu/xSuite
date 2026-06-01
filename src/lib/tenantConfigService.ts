import { supabase } from './supabaseClient';
import type { TenantConfig, TaxSystem, Theme } from '../types/tenantConfig';
import { DEFAULT_TENANT_CONFIG, DEFAULT_THEME, THEMES } from '../types/tenantConfig';
import { logger } from './logger';

const configCache = new Map<string, { config: TenantConfig; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchTenantConfig(tenantId: string): Promise<TenantConfig> {
  // Both reads are keyed only on tenantId and are independent of each other, so
  // run them concurrently to remove a serial round-trip from the auth->shell
  // bootstrap path.
  const [tenantResult, localeResult] = await Promise.all([
    supabase
      .from('tenants')
      .select(`
        id, name, theme, ui_language,
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
    supabase
      .from('accounting_locales')
      .select('currency_code, currency_symbol, decimal_places, currency_position, decimal_separator, thousands_separator, date_format, locale_code')
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);

  const { data, error } = tenantResult;
  if (error || !data) {
    logger.error('Failed to fetch tenant config:', error);
    return { ...DEFAULT_TENANT_CONFIG, tenantId };
  }

  const country = data.country as Record<string, unknown> | null;
  const { data: defaultLocale } = localeResult;

  return {
    tenantId: data.id,
    tenantName: data.name,
    countryCode: (country?.code as string) || 'US',
    countryName: (country?.name as string) || 'United States',
    currency: {
      code: defaultLocale?.currency_code || data.currency_code || 'USD',
      symbol: defaultLocale?.currency_symbol || data.currency_symbol || '$',
      name: (country?.currency_name as string) || data.currency_code || 'USD',
      decimalPlaces: defaultLocale?.decimal_places ?? data.decimal_places ?? 2,
      decimalSeparator: defaultLocale?.decimal_separator || (country?.decimal_separator as string) || '.',
      thousandsSeparator: defaultLocale?.thousands_separator ?? (country?.thousands_separator as string) ?? ',',
      position: ((defaultLocale?.currency_position || country?.currency_position as string) || 'before') as 'before' | 'after',
    },
    tax: {
      system: (data.tax_system || 'NONE') as TaxSystem,
      label: data.tax_label || 'Tax',
      numberLabel: data.tax_number_label || 'Tax ID',
      numberFormat: (country?.tax_number_format as string) || null,
      numberPlaceholder: (country?.tax_number_placeholder as string) || null,
      defaultRate: parseFloat(String(data.default_tax_rate)) || 0,
      invoiceRequired: (country?.tax_invoice_required as boolean) || false,
    },
    dateTime: {
      dateFormat: defaultLocale?.date_format || data.date_format || 'MM/DD/YYYY',
      timeFormat: ((country?.time_format as string) || '12h') as '12h' | '24h',
      timezone: data.timezone || 'UTC',
      weekStartsOn: ((country?.week_starts_on as number) ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      fiscalYearStart: data.fiscal_year_start || '01-01',
    },
    locale: {
      localeCode: defaultLocale?.locale_code || data.locale_code || 'en-US',
      // UI language / text-direction is a deliberate tenant choice, NOT a function
      // of country. country.language_code is intentionally no longer read here, so
      // an English-operating lab in an Arabic-language country defaults to LTR.
      languageCode: (data.ui_language as string) || 'en',
      postalCodeLabel: (country?.postal_code_label as string) || 'Postal Code',
    },
    theme: THEMES.includes(data.theme as Theme) ? (data.theme as Theme) : DEFAULT_THEME,
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

export async function updateTenantUiLanguage(tenantId: string, language: 'en' | 'ar'): Promise<void> {
  if (language !== 'en' && language !== 'ar') {
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

export function invalidateTenantConfigCache(tenantId: string): void {
  configCache.delete(tenantId);
}

export function clearTenantConfigCache(): void {
  configCache.clear();
}
