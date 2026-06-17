// Pure, framework-free core of the Localization Center (Phase 3 PR-B). Keeping
// the editable-key set, the dirty-diff, the preview assembly, and the control
// option lists here makes the risk-bearing logic unit-testable without rendering
// the whole tenant-config context tree (which trips jsdom). The component in
// AccountingLocales.tsx composes these.
import type { CurrencyConfig } from '../../types/tenantConfig';
import { isConfigKeyLocked } from '../../lib/country/registry';
import type { Json } from '../../types/database.types';

/** Currency-tab override keys (all non-statutory, tenant-overridable). */
export const CURRENCY_KEYS = [
  'currency.display_mode',
  'currency.negative_format',
  'currency.position',
  'currency.decimal_places',
  'currency.decimal_separator',
  'currency.thousands_separator',
] as const;

// Date/Time + Regional override keys (all non-statutory, tenant-overridable).
// NOTE: datetime.weekend_days is intentionally excluded — the resolver does not
// surface it on DateTimeConfig and no UI consumes it yet, so editing it here would
// be a write with no observable effect. Surfacing it is a resolver change owned by
// the backend phase, not this UI.
export const DATETIME_KEYS = [
  'datetime.date_format',
  'datetime.time_format',
  'datetime.week_starts_on',
  'datetime.fiscal_year_start',
  'datetime.timezone',
] as const;

/** Every country-config key the Localization Center can write. */
export const EDITABLE_KEYS = [...CURRENCY_KEYS, ...DATETIME_KEYS] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];

/** The dirty form state: every editable key mapped to its current draft value. */
export type DraftValues = Record<EditableKey, Json>;

function jsonEqual(a: Json, b: Json): boolean {
  // Stable structural equality covering the array value (weekend_days) too.
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The minimal override batch to persist: editable keys whose draft value differs
 * from the currently-resolved value. Locked (statutory/required) keys are NEVER
 * emitted — defense-in-depth mirroring the server's reject, so a future registry
 * reclassification can't leak a forbidden write through this form.
 */
export function collectDirtyOverrides(
  draft: DraftValues,
  resolved: DraftValues,
): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const key of EDITABLE_KEYS) {
    if (isConfigKeyLocked(key)) continue;
    if (!jsonEqual(draft[key], resolved[key])) out[key] = draft[key];
  }
  return out;
}

/**
 * Compose a CurrencyConfig for the live preview from the resolved base (which
 * carries the immutable code/symbol/name) plus the currency portion of the draft.
 */
export function buildPreviewCurrencyConfig(
  base: CurrencyConfig,
  draft: DraftValues,
): CurrencyConfig {
  return {
    ...base,
    displayMode: draft['currency.display_mode'] as CurrencyConfig['displayMode'],
    negativeFormat: draft['currency.negative_format'] as CurrencyConfig['negativeFormat'],
    position: draft['currency.position'] as CurrencyConfig['position'],
    decimalPlaces: draft['currency.decimal_places'] as number,
    decimalSeparator: draft['currency.decimal_separator'] as string,
    thousandsSeparator: draft['currency.thousands_separator'] as string,
  };
}

// ── Control option lists ─────────────────────────────────────────────────────

export const DISPLAY_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'symbol', label: 'Symbol (ر.ع.)' },
  { value: 'iso_code', label: 'ISO code (OMR)' },
  { value: 'symbol_code', label: 'Both (ر.ع. OMR)' },
];

export const NEGATIVE_FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: 'minus', label: 'Minus sign (-1,234.500)' },
  { value: 'parentheses', label: 'Parentheses (1,234.500)' },
];

export const POSITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'before', label: 'Before amount ($ 100)' },
  { value: 'after', label: 'After amount (100 OMR)' },
];

export const DECIMAL_PLACES_OPTIONS: { value: string; label: string }[] = [0, 1, 2, 3, 4].map(
  (n) => ({ value: String(n), label: String(n) }),
);

export const DECIMAL_SEPARATOR_OPTIONS: { value: string; label: string }[] = [
  { value: '.', label: 'Period ( . )' },
  { value: ',', label: 'Comma ( , )' },
];

export const THOUSANDS_SEPARATOR_OPTIONS: { value: string; label: string }[] = [
  { value: ',', label: 'Comma ( , )' },
  { value: '.', label: 'Period ( . )' },
  { value: ' ', label: 'Space (   )' },
  { value: '', label: 'None' },
];

export const TIME_FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: '24h', label: '24-hour (14:30)' },
  { value: '12h', label: '12-hour (2:30 PM)' },
];

/** 0=Sunday … 6=Saturday — the registry encoding for week_starts_on / weekend_days. */
export const DAY_NAMES: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const WEEK_START_OPTIONS: { value: string; label: string }[] = DAY_NAMES.map((label, i) => ({
  value: String(i),
  label,
}));

/** Curated display date patterns. The component merges the tenant's resolved value
 *  in if it is not already present, so the select always reflects current state. */
export const DATE_FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (31/12/2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/31/2026)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-12-31)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (31-12-2026)' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY (31.12.2026)' },
];

/** Common IANA timezones; the component merges the resolved value in if missing. */
export const TIMEZONE_OPTIONS: string[] = [
  'UTC',
  'Asia/Muscat',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Qatar',
  'Asia/Kuwait',
  'Asia/Bahrain',
  'Asia/Baghdad',
  'Asia/Tehran',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
];

/**
 * Lightweight, dependency-free sample render of a moment-style date pattern for the
 * live preview (not the production date formatter — that is threaded from config in
 * Phase 4). Substitutes a fixed sample date so the admin sees the shape of the output.
 */
export function previewDate(pattern: string): string {
  const sample: Record<string, string> = {
    YYYY: '2026',
    YY: '26',
    MM: '12',
    DD: '31',
  };
  return pattern.replace(/YYYY|YY|MM|DD/g, (tok) => sample[tok] ?? tok);
}

/** Build a full DraftValues snapshot from a resolved TenantConfig's currency +
 *  dateTime slices. Keeps the form seed in one place (component + tests share it). */
export interface ResolvedSlices {
  currency: Pick<
    CurrencyConfig,
    'displayMode' | 'negativeFormat' | 'position' | 'decimalPlaces' | 'decimalSeparator' | 'thousandsSeparator'
  >;
  dateTime: {
    dateFormat: string;
    timeFormat: string;
    weekStartsOn: number;
    fiscalYearStart: string;
    timezone: string;
  };
}

export function draftFromResolved(slices: ResolvedSlices): DraftValues {
  return {
    'currency.display_mode': slices.currency.displayMode,
    'currency.negative_format': slices.currency.negativeFormat,
    'currency.position': slices.currency.position,
    'currency.decimal_places': slices.currency.decimalPlaces,
    'currency.decimal_separator': slices.currency.decimalSeparator,
    'currency.thousands_separator': slices.currency.thousandsSeparator,
    'datetime.date_format': slices.dateTime.dateFormat,
    'datetime.time_format': slices.dateTime.timeFormat,
    'datetime.week_starts_on': slices.dateTime.weekStartsOn,
    'datetime.fiscal_year_start': slices.dateTime.fiscalYearStart,
    'datetime.timezone': slices.dateTime.timezone,
  };
}
