import { format as dateFnsFormat, parseISO } from 'date-fns';
import { ar as arDateLocale } from 'date-fns/locale/ar';
import { normalizeLang } from './locale';
import type { CurrencyConfig } from '../types/tenantConfig';

// Phase 4a: locale-aware formatting. All locale params are OPTIONAL (additive) and
// every locale-dependent branch is gated on normalizeLang(localeCode) === 'ar', so
// the 'en' path stays byte-identical to pre-Phase-4a output. Policy (LOCKED): Western
// numerals + Gregorian for 'ar' (no Arabic-Indic digits / Hijri) — Intl's 'ar' locale
// natively emits Arabic-Indic digits, so the 'ar' branch forces numberingSystem 'latn'.
const DEFAULT_LOCALE = 'en-US';

// Backward-compat display shape consumed by useCurrency(); the tenant-aware
// formatting itself now flows through formatCurrencyWithConfig.
export interface CurrencyFormat {
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  decimalPlaces: number;
  currencyCode: string;
}

/**
 * The currency TOKEN the tenant chose to see: the display symbol ('ر.ع.'), the ISO
 * 4217 code ('OMR'), or both ('ر.ع. OMR'). Pure — Phase 2's single place the
 * symbol-vs-code decision is made (currencyToBlock feeds it into the PDF/document
 * layer; formatCurrencyWithConfig uses it for in-app rendering). Falls back to the
 * code when no display symbol exists, and to the symbol when the code is the
 * unresolved REQUIRED_SENTINEL — never blank, never a Symbol→string crash.
 */
export const renderCurrencyToken = (config: CurrencyConfig): string => {
  const code = typeof config.code === 'string' ? config.code : '';
  const symbol = config.symbol || code;
  switch (config.displayMode) {
    case 'iso_code':
      return code || symbol;
    case 'symbol_code':
      // Avoid duplicating ('OMR OMR') when there is no distinct display symbol.
      return code && config.symbol && config.symbol !== code
        ? `${config.symbol} ${code}`
        : code || symbol;
    case 'symbol':
    default:
      return symbol;
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
  const token = renderCurrencyToken(config);
  // Parentheses mode renders the MAGNITUDE then wraps it; minus mode (the default)
  // keeps the sign inside the number via toFixed — byte-identical to pre-Phase-2.
  const useParens = config.negativeFormat === 'parentheses' && amount < 0;
  const magnitude = useParens ? Math.abs(amount) : amount;

  const parts = magnitude.toFixed(config.decimalPlaces).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSeparator);
  const decimalPart = parts[1];
  const formattedNumber = config.decimalPlaces > 0
    ? `${integerPart}${config.decimalSeparator}${decimalPart}`
    : integerPart;

  const body = config.position === 'before'
    ? `${token}${formattedNumber}`
    : `${formattedNumber} ${token}`;
  return useParens ? `(${body})` : body;
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

/**
 * Tax rates are stored as PERCENT platform-wide (5 = 5%, 20 = 20%) — proven by the
 * live geo values (OM default_tax_rate 5.00, GB 20.00) and the registry max(100).
 * NEVER multiply by 100 before rendering; that is the '500.00%' compliance-page bug.
 */
export const formatTaxRatePercent = (rate: number | null | undefined): string =>
  `${Number(rate ?? 0).toFixed(2)}%`;

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
