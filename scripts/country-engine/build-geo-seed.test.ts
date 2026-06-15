import { describe, it, expect } from 'vitest';
import {
  buildCountryConfigRow,
  emitSeedSql,
  MissingReferenceError,
  type CountryReferenceInputs,
} from './build-geo-seed';

const OMAN_INPUTS: CountryReferenceInputs = {
  iso: { alpha2: 'OM', alpha3: 'OMN', name: 'Oman', currency: 'OMR', currencyMinorUnits: 3 },
  cldr: {
    localeCode: 'ar-OM',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: 'h:mm a',
    decimalSeparator: '.',
    groupSeparator: ',',
    firstDay: 6,
    weekendDays: [5, 6],
    numberingSystem: 'latn',
    currencySymbol: 'ر.ع.',
    currencyPosition: 'before',
    timezone: 'Asia/Muscat',
  },
  phone: { code: '+968', format: 'XXXX XXXX' },
  address: { lines: ['%N', '%O', '%A', '%C %Z'] },
};

describe('buildCountryConfigRow', () => {
  it('maps CLDR/ISO into a complete formatting-ready row (no US fabrication)', () => {
    const row = buildCountryConfigRow(OMAN_INPUTS);
    expect(row.code).toBe('OM');
    expect(row.currency_code).toBe('OMR');
    expect(row.decimal_places).toBe(3); // ISO 4217 minor units, not 2
    expect(row.locale_code).toBe('ar-OM');
    expect(row.week_starts_on).toBe(6); // CLDR firstDay, not 0
    expect(row.config_status).toBe('formatting_ready');
    expect(row.country_config.datetime.weekend_days).toEqual([5, 6]); // GCC weekend (D15)
    expect(row.address_format).not.toEqual({}); // no longer empty (D3)
    expect(row.phone_format).toBe('XXXX XXXX'); // libphonenumber (D3)
    expect(row.data_source).toBe('cldr+iso4217+libphonenumber');
  });

  it('carries digit_grouping default of 3 for western numbering systems', () => {
    expect(buildCountryConfigRow(OMAN_INPUTS).digit_grouping).toBe('3');
  });

  it('uses the South-Asian 3;2 grouping when the input declares it (ms-IN style)', () => {
    const india: CountryReferenceInputs = {
      ...OMAN_INPUTS,
      iso: { alpha2: 'IN', alpha3: 'IND', name: 'India', currency: 'INR', currencyMinorUnits: 2 },
      cldr: { ...OMAN_INPUTS.cldr, localeCode: 'en-IN', firstDay: 0, weekendDays: [0, 6], digitGrouping: '3;2' },
    };
    expect(buildCountryConfigRow(india).digit_grouping).toBe('3;2');
  });

  it('fails LOUD when the currency keystone is missing (never defaults to USD)', () => {
    const bad = { ...OMAN_INPUTS, iso: { ...OMAN_INPUTS.iso, currency: undefined } };
    expect(() => buildCountryConfigRow(bad as never)).toThrow(MissingReferenceError);
  });

  it('fails LOUD when the locale keystone is missing (never defaults to en-US)', () => {
    const bad = { ...OMAN_INPUTS, cldr: { ...OMAN_INPUTS.cldr, localeCode: undefined } };
    expect(() => buildCountryConfigRow(bad as never)).toThrow(MissingReferenceError);
  });

  it('fails LOUD when the week-start keystone is missing (never defaults to Sunday)', () => {
    const bad = { ...OMAN_INPUTS, cldr: { ...OMAN_INPUTS.cldr, firstDay: undefined } };
    expect(() => buildCountryConfigRow(bad as never)).toThrow(MissingReferenceError);
  });
});

describe('emitSeedSql', () => {
  it('emits an idempotent per-column upsert that respects source_locked', () => {
    const sql = emitSeedSql([buildCountryConfigRow(OMAN_INPUTS)]);
    expect(sql).toContain('INSERT INTO public.geo_countries');
    expect(sql).toContain('ON CONFLICT (code) DO UPDATE');
    expect(sql).toContain('WHERE geo_countries.source_locked IS NOT TRUE'); // curated overrides preserved
    expect(sql).toContain('country_config = geo_countries.country_config ||'); // jsonb merge, not replace
  });

  it('escapes single quotes in text values (no SQL injection from a name)', () => {
    const row = buildCountryConfigRow({
      ...OMAN_INPUTS,
      iso: { ...OMAN_INPUTS.iso, name: "Cote d'Ivoire" },
    });
    const sql = emitSeedSql([row]);
    expect(sql).toContain("Cote d''Ivoire");
  });

  it('renders the country_config jsonb as a valid json literal', () => {
    const sql = emitSeedSql([buildCountryConfigRow(OMAN_INPUTS)]);
    const match = sql.match(/'(\{[^']*weekend_days[^']*\})'::jsonb/);
    expect(match, 'expected a jsonb literal containing weekend_days').toBeTruthy();
    expect(() => JSON.parse(match![1])).not.toThrow();
  });
});
