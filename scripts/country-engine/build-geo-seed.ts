// Deterministic geo reference-data → geo_countries seed generator.
//
// SCOPE / CONSTRAINT NOTE (Phase 1, this area):
//   The Country-Engine plan calls for this generator to read maintained
//   datasets (CLDR / ISO 4217 / libphonenumber-js / i18n-postal-address) at
//   build time and emit a ~195-country seed. Those libraries are NOT yet a
//   dependency of this repo, and adding them (plus sourcing/validating the full
//   ~195-country dataset) is an OWNER DECISION — see the area's blockers. So
//   this module ships the *interface* and the *pure, unit-testable transform*
//   (`buildCountryConfigRow`) + idempotent SQL emitter (`emitSeedSql`), with the
//   actual reference data supplied by `datasets/manifest.json`'s hand-verified
//   GCC + priority-country seed (`GCC_PRIORITY_SEED`, accurate by hand) rather
//   than a dataset import. When the libraries are approved, `main()` swaps the
//   hand-seed for a CLDR/ISO loader with NO change to the transform or emitter.
//
//   FAIL-LOUD, NO US FABRICATION: a country missing the currency / locale /
//   week-start keystone throws `MissingReferenceError` — it is NEVER backfilled
//   with USD / en-US / Sunday-week defaults.

export class MissingReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingReferenceError';
  }
}

/** ISO-4217 / ISO-3166 facts for one country. */
export interface IsoInputs {
  alpha2: string;
  alpha3: string;
  name: string;
  currency?: string; // ISO 4217 alpha — REQUIRED (keystone)
  currencyMinorUnits?: number; // ISO 4217 minor units (e.g. OMR = 3, JPY = 0)
}

/** CLDR-derived locale/number/date facts. */
export interface CldrInputs {
  localeCode?: string; // REQUIRED (keystone)
  dateFormat?: string;
  timeFormat?: string;
  decimalSeparator?: string;
  groupSeparator?: string;
  firstDay?: number; // CLDR weekData firstDay 0=Sun..6=Sat — REQUIRED (keystone)
  weekendDays?: number[]; // CLDR weekData weekend (e.g. GCC = [5,6])
  numberingSystem?: string;
  currencySymbol?: string;
  currencyPosition?: 'before' | 'after';
  timezone?: string; // representative IANA tz
  digitGrouping?: string; // override; default '3' (western), '3;2' (South-Asian)
}

export interface PhoneInputs {
  code?: string; // e.g. '+968'
  format?: string; // libphonenumber national format pattern
}

export interface AddressInputs {
  lines?: string[]; // libaddressinput %-token lines
}

export interface CountryReferenceInputs {
  iso: IsoInputs;
  cldr: CldrInputs;
  phone?: PhoneInputs;
  address?: AddressInputs;
}

/** The emitted seed row — the geo_countries columns this generator writes. */
export interface GeoCountrySeedRow {
  code: string;
  name: string;
  currency_code: string;
  currency_symbol: string | null;
  currency_position: string | null;
  decimal_places: number;
  decimal_separator: string | null;
  thousands_separator: string | null;
  locale_code: string;
  language_code: string;
  date_format: string | null;
  time_format: string | null;
  timezone: string | null;
  week_starts_on: number;
  digit_grouping: string;
  phone_format: string | null;
  address_format: Record<string, unknown>;
  country_config: {
    currency: { code: string; symbol: string | null; decimal_places: number };
    datetime: { date_format: string | null; timezone: string | null; weekend_days: number[]; week_starts_on: number };
    number_format: { digit_grouping: string; decimal_separator: string | null; group_separator: string | null };
    locale: { code: string };
  };
  config_status: 'stub' | 'formatting_ready';
  data_source: string;
  source_version: string;
  reference_dataset_version: string;
}

const DATA_SOURCE = 'cldr+iso4217+libphonenumber';

/**
 * Pure transform: maintained-dataset inputs → a formatting-ready geo_countries
 * seed row. No I/O. Fail-loud on a missing keystone (currency / locale / first
 * day of week) — never a US fabrication.
 */
export function buildCountryConfigRow(inputs: CountryReferenceInputs): GeoCountrySeedRow {
  const { iso, cldr, phone, address } = inputs;

  if (!iso?.currency) {
    throw new MissingReferenceError(`Missing ISO 4217 currency for ${iso?.alpha2 ?? '??'} (no USD fallback)`);
  }
  if (!cldr?.localeCode) {
    throw new MissingReferenceError(`Missing CLDR locale for ${iso.alpha2} (no en-US fallback)`);
  }
  if (cldr.firstDay === undefined || cldr.firstDay === null) {
    throw new MissingReferenceError(`Missing CLDR firstDay (week start) for ${iso.alpha2} (no Sunday fallback)`);
  }

  const decimalPlaces = iso.currencyMinorUnits ?? 2;
  const weekendDays = cldr.weekendDays ?? [6, 0];
  const digitGrouping = cldr.digitGrouping ?? '3';
  const languageCode = cldr.localeCode.split('-')[0];

  const hasFormattingReady =
    !!iso.currency &&
    !!cldr.localeCode &&
    !!cldr.dateFormat &&
    !!cldr.timezone &&
    !!phone?.format &&
    !!address?.lines?.length;

  const addressFormat: Record<string, unknown> = address?.lines?.length
    ? { lines: address.lines }
    : {};

  return {
    code: iso.alpha2,
    name: iso.name,
    currency_code: iso.currency,
    currency_symbol: cldr.currencySymbol ?? null,
    currency_position: cldr.currencyPosition ?? null,
    decimal_places: decimalPlaces,
    decimal_separator: cldr.decimalSeparator ?? null,
    thousands_separator: cldr.groupSeparator ?? null,
    locale_code: cldr.localeCode,
    language_code: languageCode,
    date_format: cldr.dateFormat ?? null,
    time_format: cldr.timeFormat ?? null,
    timezone: cldr.timezone ?? null,
    week_starts_on: cldr.firstDay,
    digit_grouping: digitGrouping,
    phone_format: phone?.format ?? null,
    address_format: addressFormat,
    country_config: {
      currency: { code: iso.currency, symbol: cldr.currencySymbol ?? null, decimal_places: decimalPlaces },
      datetime: {
        date_format: cldr.dateFormat ?? null,
        timezone: cldr.timezone ?? null,
        weekend_days: weekendDays,
        week_starts_on: cldr.firstDay,
      },
      number_format: {
        digit_grouping: digitGrouping,
        decimal_separator: cldr.decimalSeparator ?? null,
        group_separator: cldr.groupSeparator ?? null,
      },
      locale: { code: cldr.localeCode },
    },
    config_status: hasFormattingReady ? 'formatting_ready' : 'stub',
    data_source: DATA_SOURCE,
    source_version: REFERENCE_DATASET_VERSION,
    reference_dataset_version: REFERENCE_DATASET_VERSION,
  };
}

/** Bumped whenever the hand-verified seed or (future) pinned datasets change. */
export const REFERENCE_DATASET_VERSION = 'gcc-priority-2026-06-15';

function sqlText(v: string | null): string {
  if (v === null) return 'NULL';
  return `'${v.replace(/'/g, "''")}'`;
}

function sqlJson(v: unknown): string {
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
}

function sqlInt(v: number | null): string {
  return v === null ? 'NULL' : String(v);
}

/**
 * Render an idempotent, source_locked-respecting seed. The upsert merges
 * `country_config` jsonb (`||`) rather than replacing it so curated overrides
 * on the live row survive, and the whole UPDATE is gated on
 * `source_locked IS NOT TRUE` so a hand-curated GCC override is never clobbered
 * by a regenerated dataset.
 */
export function emitSeedSql(rows: GeoCountrySeedRow[]): string {
  const header = `-- GENERATED by scripts/country-engine/build-geo-seed.ts — DO NOT EDIT BY HAND.
-- Reference dataset version: ${REFERENCE_DATASET_VERSION}
-- Idempotent: ON CONFLICT (code) DO UPDATE ... WHERE source_locked IS NOT TRUE.
-- country_config is jsonb-MERGED (||), not replaced, so curated overrides survive.
`;

  const values = rows
    .map((r) => {
      return `  (${sqlText(r.code)}, ${sqlText(r.name)}, ${sqlText(r.currency_code)}, ${sqlText(
        r.currency_symbol,
      )}, ${sqlText(r.currency_position)}, ${sqlInt(r.decimal_places)}, ${sqlText(
        r.decimal_separator,
      )}, ${sqlText(r.thousands_separator)}, ${sqlText(r.locale_code)}, ${sqlText(
        r.language_code,
      )}, ${sqlText(r.date_format)}, ${sqlText(r.time_format)}, ${sqlText(r.timezone)}, ${sqlInt(
        r.week_starts_on,
      )}, ${sqlText(r.digit_grouping)}, ${sqlText(r.phone_format)}, ${sqlJson(
        r.address_format,
      )}, ${sqlJson(r.country_config)}, ${sqlText(r.config_status)}, ${sqlText(
        r.data_source,
      )}, ${sqlText(r.source_version)}, ${sqlText(r.reference_dataset_version)})`;
    })
    .join(',\n');

  return `${header}
INSERT INTO public.geo_countries
  (code, name, currency_code, currency_symbol, currency_position, decimal_places,
   decimal_separator, thousands_separator, locale_code, language_code, date_format,
   time_format, timezone, week_starts_on, digit_grouping, phone_format, address_format,
   country_config, config_status, data_source, source_version, reference_dataset_version)
VALUES
${values}
ON CONFLICT (code) DO UPDATE SET
  currency_code = EXCLUDED.currency_code,
  currency_symbol = EXCLUDED.currency_symbol,
  currency_position = EXCLUDED.currency_position,
  decimal_places = EXCLUDED.decimal_places,
  decimal_separator = EXCLUDED.decimal_separator,
  thousands_separator = EXCLUDED.thousands_separator,
  locale_code = EXCLUDED.locale_code,
  language_code = EXCLUDED.language_code,
  date_format = EXCLUDED.date_format,
  time_format = EXCLUDED.time_format,
  timezone = EXCLUDED.timezone,
  week_starts_on = EXCLUDED.week_starts_on,
  digit_grouping = EXCLUDED.digit_grouping,
  phone_format = EXCLUDED.phone_format,
  address_format = EXCLUDED.address_format,
  country_config = geo_countries.country_config || EXCLUDED.country_config,
  config_status = EXCLUDED.config_status,
  data_source = EXCLUDED.data_source,
  source_version = EXCLUDED.source_version,
  reference_dataset_version = EXCLUDED.reference_dataset_version,
  updated_at = now()
WHERE geo_countries.source_locked IS NOT TRUE;
`;
}
