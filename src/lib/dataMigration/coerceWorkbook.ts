import {
  type ParsedWorkbook,
  type RawRow,
  ENTITY_COLUMNS,
  IMPORT_ORDER,
} from './workbookContract';

/**
 * Type-aware normalisation applied to a parsed workbook BEFORE validation and import, so the
 * client dry-run and the Postgres RPC always see the same values. Two real-world problems this
 * solves (both observed in a live lab import):
 *
 *  1. Free-text manufacture dates ("07 AUG 2021", "JUN 2014", "--"). SheetJS/JS `new Date()`
 *     accepts many of these but Postgres `::date` does not, so they would pass validation and
 *     then silently drop the device at import. We normalise recognised formats to YYYY-MM-DD
 *     (month-only → first of month) and turn junk into null (keep the device, drop the date).
 *
 *  2. Invoice statuses that are the right meaning but the wrong spelling/case ("Paid",
 *     "Partially Paid", "Unpaid"). The tenant `invoices.status` CHECK is lowercase and
 *     case-sensitive, so "Paid" would fail. We lowercase and map common synonyms to the
 *     canonical enum.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

// Recognised "no real value" placeholders → treated as blank (null).
const JUNK_DATE = /^(-+|\.+|\?+|n\/?a|nil|none|null|unknown|tbd)$/i;
// A value Postgres `::date`/`::timestamptz` already accepts verbatim → pass through untouched.
const STRICT_ISO = /^\d{4}-\d{2}-\d{2}([ T].*)?$/;

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // Excel's day 0 (accounts for the 1900 leap bug)

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Normalise a single "date" cell to a Postgres-castable YYYY-MM-DD string, or null.
 * ISO values pass through unchanged (timestamps preserved); recognised fuzzy formats are
 * converted; anything unrecognised becomes null so the row still imports.
 */
export function normalizeDateCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  // A bare Excel serial (only when it lands in a plausible modern range, to avoid converting
  // stray small integers). SheetJS returns text cells as strings, so this rarely fires here.
  if (typeof value === 'number') {
    if (Number.isFinite(value) && value >= 20000 && value <= 80000) {
      return new Date(EXCEL_EPOCH_MS + value * 86400000).toISOString().slice(0, 10);
    }
    return null;
  }

  const s = String(value).trim();
  if (s === '' || JUNK_DATE.test(s)) return null;
  if (STRICT_ISO.test(s)) return s;

  let m: RegExpMatchArray | null;

  // DD <Mon> YYYY  (e.g. "07 AUG 2021", "07-SEP-2023")
  m = s.match(/^(\d{1,2})[ \-/.]+([A-Za-z]{3,9})[ \-/.]+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);

  // <Mon> YYYY  (month + year, no day → 1st) e.g. "JUN 2014", "MAY-2018"
  m = s.match(/^([A-Za-z]{3,9})[ \-/.]+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return ymd(+m[2], MONTHS[m[1].toLowerCase()], 1);

  // YYYY <Mon>  (year first) e.g. "2014 JUN"
  m = s.match(/^(\d{4})[ \-/.]+([A-Za-z]{3,9})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(+m[1], MONTHS[m[2].toLowerCase()], 1);

  // DD/MM/YYYY (full numeric, day-first — matches the DD-MON-YYYY convention in these files)
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return ymd(+m[3], +m[2], +m[1]);

  // MM/YYYY  (numeric month + 4-digit year → 1st) e.g. "02/2015"
  m = s.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (m) return ymd(+m[2], +m[1], 1);

  // YYYY/MM  (year + numeric month → 1st) e.g. "2010.05", "2001-11"
  m = s.match(/^(\d{4})[/\-.](\d{1,2})$/);
  if (m) return ymd(+m[1], +m[2], 1);

  // Year only → 1 Jan
  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01-01`;

  return null;
}

// Common non-canonical spellings the tenant invoices.status CHECK does not accept, mapped to
// the canonical enum. "Unpaid" → "sent" (issued, awaiting payment); tell us if you prefer
// "overdue". Anything not listed is just lowercased so a genuinely invalid value still fails
// validation as itself (not as a case mismatch).
const INVOICE_STATUS_SYNONYMS: Record<string, string> = {
  'partially paid': 'partial',
  'part paid': 'partial',
  'part-paid': 'partial',
  'partial payment': 'partial',
  unpaid: 'sent',
  'not paid': 'sent',
  'awaiting payment': 'sent',
  issued: 'sent',
  // Owner decision 2026-07-10 (FU-1/WP-C): overdue is a due-date fact derived at
  // read time, never a stored status — an imported 'overdue' invoice is an
  // issued, unpaid one. (The CHECK still tolerates legacy 'overdue' rows.)
  overdue: 'sent',
};

/** Normalise an invoice status to the canonical lowercase enum (or blank → unchanged). */
export function normalizeInvoiceStatus(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return s;
  const lower = s.toLowerCase();
  return INVOICE_STATUS_SYNONYMS[lower] ?? lower;
}

// quotes.status is CHECK-constrained to the 6 service-layer codes (WP-C), and
// legacy exports carry master_quote_statuses display names. Map every display
// name onto its nearest code; identity spellings (Draft/Sent/Accepted/…)
// only need lowercasing. Anything not listed is lowercased so a genuinely
// invalid value still fails validation as itself (not as a case mismatch).
const QUOTE_STATUS_SYNONYMS: Record<string, string> = {
  'sent to client': 'sent',
  'pending review': 'draft',
  'follow-up required': 'sent',
  'under negotiation': 'sent',
  declined: 'rejected',
  cancelled: 'rejected',
  'converted to job': 'converted',
  approved: 'accepted',
};

/** Normalise a quote status to the canonical lowercase codes (or blank → unchanged). */
export function normalizeQuoteStatus(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return s;
  const lower = s.toLowerCase();
  return QUOTE_STATUS_SYNONYMS[lower] ?? lower;
}

/**
 * Apply {@link normalizeDateCell} to every `date`-typed column and
 * {@link normalizeInvoiceStatus} to `invoices.status`, in place, returning the same workbook.
 * All other cells are untouched (booleans go straight to the RPC's `::boolean` cast, which
 * already accepts Yes/No/etc.).
 */
export function coerceWorkbook(wb: ParsedWorkbook): ParsedWorkbook {
  for (const entity of IMPORT_ORDER) {
    const rows = wb[entity];
    if (!rows || rows.length === 0) continue;

    const dateKeys = ENTITY_COLUMNS[entity].filter((c) => c.type === 'date').map((c) => c.key);
    const isInvoices = entity === 'invoices';
    const isQuotes = entity === 'quotes';

    for (const row of rows as RawRow[]) {
      for (const key of dateKeys) {
        if (key in row) row[key] = normalizeDateCell(row[key]);
      }
      if (isInvoices && 'status' in row) row.status = normalizeInvoiceStatus(row.status);
      if (isQuotes && 'status' in row) row.status = normalizeQuoteStatus(row.status);
    }
  }
  return wb;
}
