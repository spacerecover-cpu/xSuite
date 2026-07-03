export type TaxSystem = 'VAT' | 'GST' | 'SALES_TAX' | 'NONE';

/** A required country-config value that has NOT been resolved. Never a real value —
 *  surfaces fail-loud instead of silently rendering US defaults (D2). */
export const REQUIRED_SENTINEL: unique symbol = Symbol.for('country-config.required');
export type RequiredSentinel = typeof REQUIRED_SENTINEL;

export type Theme = 'royal' | 'burgundy' | 'scarlet';
export const THEMES: readonly Theme[] = ['royal', 'burgundy', 'scarlet'] as const;
export const DEFAULT_THEME: Theme = 'royal';

export interface CurrencyConfig {
  code: string | RequiredSentinel;
  symbol: string;
  name: string;
  decimalPlaces: number;
  decimalSeparator: string;
  thousandsSeparator: string;
  position: 'before' | 'after';
  /** Tenant preference: which token renders — symbol ('ر.ع.'), ISO code ('OMR'),
   *  or both ('ر.ع. OMR'). Resolved from currency.display_mode (default 'symbol'). */
  displayMode: 'symbol' | 'iso_code' | 'symbol_code';
  /** Tenant preference: negative-amount rendering — leading minus (default) or
   *  accounting parentheses. Resolved from currency.negative_format. */
  negativeFormat: 'minus' | 'parentheses';
}

export interface TaxConfig {
  system: TaxSystem;
  label: string;
  numberLabel: string;
  numberFormat: string | null;
  numberPlaceholder: string | null;
  /** PERCENT convention: 5 = 5% (never a fraction 0.05). Divide by 100 only inside money math. */
  defaultRate: number;
  invoiceRequired: boolean;
}

export interface DateTimeConfig {
  dateFormat: string;
  timeFormat: '12h' | '24h';
  timezone: string;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  fiscalYearStart: string;
}

export interface LocaleConfig {
  localeCode: string | RequiredSentinel;
  languageCode: string;
  postalCodeLabel: string;
}

export interface TenantConfig {
  tenantId: string;
  tenantName: string;
  countryCode: string;
  countryName: string;
  currency: CurrencyConfig;
  tax: TaxConfig;
  dateTime: DateTimeConfig;
  locale: LocaleConfig;
  theme: Theme;
  /** Per-tenant feature overrides (from tenants.feature_flags). Only keys the
   *  tenant explicitly changed; everything else falls back to registry defaults. */
  featureFlags: Record<string, boolean>;
}

/** Typed SHAPE placeholder only — never rendered. The provider blocks render when
 *  isResolvedConfig() is false (sentinel-bearing required keys). Cosmetic display
 *  fields keep safe defaults; required jurisdiction keys stay REQUIRED_SENTINEL so
 *  an unconfigured tenant fails loud instead of silently rendering US (D2/D3). */
export const DEFAULT_TENANT_CONFIG: TenantConfig = {
  tenantId: '',
  tenantName: '',
  countryCode: 'US',
  countryName: 'United States',
  currency: {
    code: REQUIRED_SENTINEL,
    symbol: '$',
    name: 'US Dollar',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    position: 'before',
    displayMode: 'symbol',
    negativeFormat: 'minus',
  },
  tax: {
    system: 'SALES_TAX',
    label: 'Sales Tax',
    numberLabel: 'Tax ID',
    numberFormat: null,
    numberPlaceholder: null,
    defaultRate: 0,
    invoiceRequired: false,
  },
  dateTime: {
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    timezone: 'UTC',
    weekStartsOn: 0,
    fiscalYearStart: '01-01',
  },
  locale: {
    localeCode: REQUIRED_SENTINEL,
    languageCode: 'en',
    postalCodeLabel: 'Postal Code',
  },
  theme: DEFAULT_THEME,
  featureFlags: {},
};

/** True only when every required country-config field has been resolved past the
 *  sentinel. The provider blocks render and reports telemetry when this is false. */
export function isResolvedConfig(c: TenantConfig): boolean {
  return c.currency.code !== REQUIRED_SENTINEL && c.locale.localeCode !== REQUIRED_SENTINEL;
}
