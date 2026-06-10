import { format as dateFnsFormat, parseISO } from 'date-fns';
import { ar as arDateLocale } from 'date-fns/locale/ar';
import { supabase } from './supabaseClient';
import { logger } from './logger';
import { normalizeLang } from './locale';
import type { CurrencyConfig } from '../types/tenantConfig';
import { DEFAULT_TENANT_CONFIG } from '../types/tenantConfig';

// Phase 4a: locale-aware formatting. All locale params are OPTIONAL (additive) and
// every locale-dependent branch is gated on normalizeLang(localeCode) === 'ar', so
// the 'en' path stays byte-identical to pre-Phase-4a output. Policy (LOCKED): Western
// numerals + Gregorian for 'ar' (no Arabic-Indic digits / Hijri) — Intl's 'ar' locale
// natively emits Arabic-Indic digits, so the 'ar' branch forces numberingSystem 'latn'.
const DEFAULT_LOCALE = 'en-US';

export interface CurrencyFormat {
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  decimalPlaces: number;
  currencyCode: string;
}

let cachedCurrencyFormat: CurrencyFormat | null = null;

export const fetchCurrencyFormat = async (): Promise<CurrencyFormat> => {
  if (cachedCurrencyFormat) {
    return cachedCurrencyFormat;
  }

  try {
    const { data, error } = await supabase
      .from('accounting_locales')
      .select('currency_code, date_format, number_format, is_default, decimal_places')
      .eq('is_default', true)
      .maybeSingle();

    if (error || !data) {
      const def = DEFAULT_TENANT_CONFIG.currency;
      return {
        currencySymbol: def.symbol,
        currencyPosition: def.position,
        decimalPlaces: def.decimalPlaces,
        currencyCode: def.code,
      };
    }

    cachedCurrencyFormat = {
      currencySymbol: data.currency_code || DEFAULT_TENANT_CONFIG.currency.code,
      currencyPosition: 'before',
      decimalPlaces: (data as { decimal_places?: number }).decimal_places
        ?? DEFAULT_TENANT_CONFIG.currency.decimalPlaces,
      currencyCode: data.currency_code || DEFAULT_TENANT_CONFIG.currency.code,
    };
    return cachedCurrencyFormat;
  } catch (error) {
    logger.error('Error fetching currency format:', error);
    const def = DEFAULT_TENANT_CONFIG.currency;
    return {
      currencySymbol: def.symbol,
      currencyPosition: def.position,
      decimalPlaces: def.decimalPlaces,
      currencyCode: def.code,
    };
  }
};

export const clearCurrencyFormatCache = () => {
  cachedCurrencyFormat = null;
};

export const formatCurrencyWithSettings = (
  amount: number,
  format: CurrencyFormat
): string => {
  const formattedNumber = amount.toFixed(format.decimalPlaces);
  const [integerPart, decimalPart] = formattedNumber.split('.');
  const formattedInteger = parseInt(integerPart).toLocaleString('en-US');
  const fullNumber = decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;

  if (format.currencyPosition === 'before') {
    return `${format.currencySymbol} ${fullNumber}`;
  } else {
    return `${fullNumber} ${format.currencySymbol}`;
  }
};

export const formatCurrencyWithConfig = (
  amount: number,
  config: CurrencyConfig,
  // Accepted for API parity with the other formatters. v1 policy is Western numerals
  // for 'ar' (Gulf-ERP norm), which this hand-rolled path already produces, so the
  // 'ar' output is byte-identical to 'en' here. Reserved for a future Arabic-Indic
  // opt-in without a breaking signature change.
  _localeCode?: string,
): string => {
  const parts = amount.toFixed(config.decimalPlaces).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSeparator);
  const decimalPart = parts[1];
  const formattedNumber = config.decimalPlaces > 0
    ? `${integerPart}${config.decimalSeparator}${decimalPart}`
    : integerPart;

  return config.position === 'before'
    ? `${config.symbol}${formattedNumber}`
    : `${formattedNumber} ${config.symbol}`;
};

export const formatCurrency = (amount: number, currency = 'USD', localeCode?: string): string => {
  const isArabic = normalizeLang(localeCode) === 'ar';
  try {
    // No fraction-digit overrides: Intl applies the currency's ISO-4217 decimals
    // (USD 2, OMR 3, JPY 0).
    return new Intl.NumberFormat(isArabic ? localeCode : DEFAULT_LOCALE, {
      style: 'currency',
      currency: currency,
      // 'ar' only: keep the locale's grouping/bidi but force Western digits.
      ...(isArabic ? { numberingSystem: 'latn' } : {}),
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

/**
 * "≈ <base>" preview for a document total. Returns null when doc currency == base
 * (caller hides the line). Rounds via Intl to the base currency's ISO-4217 decimals.
 */
export const formatBaseEquivalent = (
  docTotal: number,
  rate: number,
  baseCurrency: string,
  documentCurrency?: string,
): string | null => {
  if (documentCurrency && documentCurrency === baseCurrency) return null;
  return `≈ ${formatCurrency(docTotal * rate, baseCurrency)}`;
};

export const formatDate = (
  date: string | Date,
  formatStr = 'MMM dd, yyyy',
  localeCode?: string,
): string => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    // 'ar' only: apply the date-fns ar locale (Gregorian, Western numerals). 'en'
    // omits the option entirely so output is byte-identical to pre-Phase-4a.
    return normalizeLang(localeCode) === 'ar'
      ? dateFnsFormat(dateObj, formatStr, { locale: arDateLocale })
      : dateFnsFormat(dateObj, formatStr);
  } catch (error) {
    return '';
  }
};

export const formatDateTime = (date: string | Date, localeCode?: string): string => {
  return formatDate(date, 'MMM dd, yyyy HH:mm', localeCode);
};

/** The slice of DateTimeConfig the audit formatter needs (structural, so it is
 *  testable without the tenant-config context). */
export interface AuditDateTimeConfig {
  timezone?: string | null;
  timeFormat?: '12h' | '24h' | null;
}

/**
 * Tenant-timezone date-time for audit surfaces ("Created … by …").
 * Timestamps are stored as UTC timestamptz; this renders them in the tenant's
 * IANA timezone with an explicit zone label so "when" is unambiguous in
 * disputes. Month-name format is deliberate — numeric day/month order varies
 * by tenant and audit strings must not be misread. Built on Intl (no extra
 * dependency; date-fns cannot do timezones).
 */
export const formatDateTimeWithConfig = (
  date: string | Date | null | undefined,
  config?: AuditDateTimeConfig | null,
  opts?: { withTz?: boolean },
): string => {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (Number.isNaN(dateObj.getTime())) return '';

  const timeZone = config?.timezone || undefined;
  const hour12 = (config?.timeFormat ?? '24h') === '12h';
  const withTz = opts?.withTz ?? true;
  const baseOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  };
  try {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      ...baseOptions,
      ...(timeZone ? { timeZone } : {}),
      ...(withTz && timeZone ? { timeZoneName: 'short' } : {}),
    }).format(dateObj);
  } catch {
    // Unknown IANA zone in tenant config — degrade to browser-local time
    // rather than rendering nothing.
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, baseOptions).format(dateObj);
  }
};

/**
 * Normalize a date value to the `yyyy-MM-dd` string an `<input type="date">`
 * requires. Postgres `timestamptz` columns come back as full ISO strings
 * (e.g. "2026-07-03T00:00:00+00:00"); binding one straight into a date input
 * renders BLANK — which looks like data loss when editing a record. Slices the
 * leading date portion when present (no timezone shift), else parses defensively.
 */
export const toDateInputValue = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : dateFnsFormat(value, 'yyyy-MM-dd');
  }
  const leading = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (leading) return leading[1];
  try {
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? '' : dateFnsFormat(parsed, 'yyyy-MM-dd');
  } catch {
    return '';
  }
};

export const formatNumber = (num: number, decimals = 2, localeCode?: string): string => {
  const isArabic = normalizeLang(localeCode) === 'ar';
  return new Intl.NumberFormat(isArabic ? localeCode : DEFAULT_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    // 'ar' only: force Western digits per the locked Western-numeral policy.
    ...(isArabic ? { numberingSystem: 'latn' } : {}),
  }).format(num);
};

export const formatPercent = (value: number): string => {
  return `${formatNumber(value * 100, 2)}%`;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const cleanBankFieldValue = (value: string | null | undefined): string => {
  if (!value) return '';

  const trimmedValue = value.trim();

  const prefixes = [
    'IBAN:',
    'SWIFT:',
    'SWIFT Code:',
    'Account No:',
    'Account Number:',
    'Bank:',
    'Branch:',
    'Routing:',
  ];

  for (const prefix of prefixes) {
    if (trimmedValue.startsWith(prefix)) {
      return trimmedValue.substring(prefix.length).trim();
    }
  }

  return trimmedValue;
};
