import { formatDate } from './utils';

/** PDF default when a tenant/country supplies no date format. Matches today's
 *  hardcoded 'dd MMM yyyy' so untouched tenants are byte-identical. */
export const DEFAULT_PDF_DATE_FNS = 'dd MMM yyyy';

const KNOWN: Record<string, string> = {
  'MM/DD/YYYY': 'MM/dd/yyyy',
  'DD/MM/YYYY': 'dd/MM/yyyy',
  'YYYY-MM-DD': 'yyyy-MM-dd',
  'DD-MM-YYYY': 'dd-MM-yyyy',
  'DD MMM YYYY': 'dd MMM yyyy',
};

/** Convert a stored `geo_countries.date_format` (uppercase CLDR-ish tokens) into a
 *  date-fns pattern. Recognised CLDR day/month/year tokens (Y->y, D->d, M kept as-is
 *  since date-fns months are uppercase) with their separators are transliterated, so
 *  any picker/country format -- e.g. the European 'DD.MM.YYYY' -- maps correctly
 *  instead of silently degrading to the default. An already-valid date-fns pattern
 *  (lowercase d/y present) passes through unchanged. Unknown/empty -> the PDF default. */
export function toDateFnsFormat(stored: string | null | undefined): string {
  const raw = (stored ?? '').trim();
  if (!raw) return DEFAULT_PDF_DATE_FNS;
  const upper = raw.toUpperCase();
  if (KNOWN[upper]) return KNOWN[upper];
  if (/[dy]/.test(raw)) return raw; // already date-fns-shaped (lowercase tokens)
  // Generalized fallback: only when the string is composed solely of CLDR date
  // tokens (Y/M/D) and common separators AND carries a day or year token. Lowercase
  // Y->y and D->d; date-fns keeps months uppercase (M/MM/MMM), so leave M alone.
  if (/^[YMD .\/-]+$/.test(upper) && /[YD]/.test(upper)) {
    return upper.replace(/Y/g, 'y').replace(/D/g, 'd');
  }
  return DEFAULT_PDF_DATE_FNS;
}

/** The slice of the resolved date config a PDF adapter needs. */
export interface PdfDateConfig {
  dateFormat?: string | null;
}

/** Format a date for a PDF using the resolved tenant/country date format.
 *  `withTime` appends ' HH:mm'. Falls back to today's 'dd MMM yyyy' default when
 *  no config is threaded -- so an un-wired call site is unchanged. */
export function fmtDateWithConfig(
  date: string | Date | null | undefined,
  config: PdfDateConfig | undefined,
  opts?: { withTime?: boolean },
): string {
  const base = toDateFnsFormat(config?.dateFormat);
  const pattern = opts?.withTime ? `${base} HH:mm` : base;
  return formatDate(date, pattern);
}
