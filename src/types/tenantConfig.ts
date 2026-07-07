export type TaxSystem = 'VAT' | 'GST' | 'SALES_TAX' | 'NONE';

/** A required country-config value that has NOT been resolved. Never a real value —
 *  surfaces fail-loud instead of silently rendering US defaults (D2). */
export const REQUIRED_SENTINEL: unique symbol = Symbol.for('country-config.required');
export type RequiredSentinel = typeof REQUIRED_SENTINEL;

export type Theme = 'royal' | 'burgundy' | 'scarlet' | 'midnight';
export const THEMES: readonly Theme[] = ['royal', 'burgundy', 'scarlet', 'midnight'] as const;
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
  /** Integer digit grouping: '3' (Western thousands, default) or '3;2' (Indian
   *  lakh/crore). Resolved from the number_format.digit_grouping snapshot key
   *  (populated from geo_countries.digit_grouping). Optional — absent = '3',
   *  keeping every existing CurrencyConfig literal byte-identical. */
  digitGrouping?: '3' | '3;2';
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

/** Country-locked regime routing keys (statutory, maxOverrideLayer:'country'). Each
 *  value is a registered plugin key resolved in later phases: tax → TaxStrategy,
 *  einvoice → EInvoicingTransport, numbering → NumberingPolicy, documents →
 *  DocumentComplianceProfile, payroll → PayrollPack ('none' = not configured). */
export interface RegimeConfig {
  tax: string;
  einvoice: string;
  numbering: string;
  documents: string;
  payroll: string;
}

export interface DateTimeConfig {
  dateFormat: string;
  timeFormat: '12h' | '24h';
  timezone: string;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Weekend weekday indices (0=Sun … 6=Sat). Gulf tenants use [5,6] (Fri/Sat);
   *  default [6,0] (Sat/Sun). Distinct from weekStartsOn. */
  weekendDays: number[];
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
  regime: RegimeConfig;
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
    digitGrouping: '3',
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
  regime: {
    tax: 'simple_vat',
    einvoice: 'no_einvoice',
    numbering: 'prefix_numbering',
    documents: 'generic_invoice',
    payroll: 'none',
  },
  dateTime: {
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    timezone: 'UTC',
    weekStartsOn: 0,
    weekendDays: [6, 0],
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
