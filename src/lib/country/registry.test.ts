import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';
import { CountryConfigError, resolveConfig, type ConfigKeyDef } from './resolveCountryConfig';
import {
  COUNTRY_CONFIG_REGISTRY,
  REGISTRY_BY_KEY,
  STATUTORY_KEYS,
  resolveCountryConfigKey,
  isConfigKeyLocked,
} from './registry';

describe('COUNTRY_CONFIG_REGISTRY integrity', () => {
  it('has no duplicate keys', () => {
    const keys = COUNTRY_CONFIG_REGISTRY.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('required keys carry codedDefault === REQUIRED_SENTINEL (never a US fabrication)', () => {
    const required = ['currency.code', 'tax.label', 'tax.default_rate', 'number_format.amount_in_words_minor_units'];
    for (const k of required) {
      const def = REGISTRY_BY_KEY[k];
      expect(def, `missing registry entry ${k}`).toBeTruthy();
      expect(def.required).toBe(true);
      expect(def.codedDefault).toBe(REQUIRED_SENTINEL);
    }
  });

  it('statutory keys are country-locked via maxOverrideLayer:"country"', () => {
    expect(REGISTRY_BY_KEY['tax.zatca_qr.enabled'].maxOverrideLayer).toBe('country');
  });

  it('STATUTORY_KEYS is the non-empty set of maxOverrideLayer==="country" keys (consumed by the registry-trigger-parity gate)', () => {
    expect(STATUTORY_KEYS.length).toBeGreaterThan(0);
    expect(STATUTORY_KEYS).toContain('tax.zatca_qr.enabled');
    for (const k of STATUTORY_KEYS) {
      expect(REGISTRY_BY_KEY[k].maxOverrideLayer).toBe('country');
    }
  });
});

describe('resolveCountryConfigKey bound to the real registry', () => {
  it('resolves a display key from the country layer', () => {
    const v = resolveCountryConfigKey<string>(
      { country: { 'datetime.date_format': 'DD/MM/YYYY' } },
      'datetime.date_format',
    );
    expect(v).toBe('DD/MM/YYYY');
  });

  it('THROWS for a required key (currency.code) when no layer provides it (fail-loud)', () => {
    expect(() => resolveCountryConfigKey({}, 'currency.code')).toThrow(CountryConfigError);
  });

  it('weekend_days has a real coded default of [6,0] (Sat/Sun) and is NOT required', () => {
    expect(resolveCountryConfigKey<number[]>({}, 'datetime.weekend_days')).toEqual([6, 0]);
    expect(REGISTRY_BY_KEY['datetime.weekend_days'].required).toBeFalsy();
  });
});

describe('currency display preferences (Phase 2: tenant-overridable, NON-statutory)', () => {
  it('currency.display_mode resolves to the coded default "symbol" when no layer sets it', () => {
    expect(resolveCountryConfigKey<string>({}, 'currency.display_mode')).toBe('symbol');
  });

  it('currency.negative_format resolves to the coded default "minus" when no layer sets it', () => {
    expect(resolveCountryConfigKey<string>({}, 'currency.negative_format')).toBe('minus');
  });

  it('currency.display_mode is tenant-overridable (the tenant layer wins — preference, not statutory)', () => {
    expect(
      resolveCountryConfigKey<string>(
        { tenant: { 'currency.display_mode': 'symbol_code' } },
        'currency.display_mode',
      ),
    ).toBe('symbol_code');
  });

  it('rejects an out-of-enum display_mode (fail-loud on bad config)', () => {
    expect(() =>
      resolveCountryConfigKey({ tenant: { 'currency.display_mode': 'bogus' } }, 'currency.display_mode'),
    ).toThrow(CountryConfigError);
  });

  it('neither preference key is statutory, so the registry↔trigger parity gate never governs them', () => {
    expect(STATUTORY_KEYS).not.toContain('currency.display_mode');
    expect(STATUTORY_KEYS).not.toContain('currency.negative_format');
    expect(REGISTRY_BY_KEY['currency.display_mode'].maxOverrideLayer).toBeUndefined();
    expect(REGISTRY_BY_KEY['currency.negative_format'].maxOverrideLayer).toBeUndefined();
    expect(REGISTRY_BY_KEY['currency.display_mode'].required).toBeFalsy();
    expect(REGISTRY_BY_KEY['currency.negative_format'].required).toBeFalsy();
  });
});

describe('Phase 3 cosmetic keys (tenant-overridable, NON-statutory)', () => {
  const KEYS: Array<[string, unknown]> = [
    ['currency.position', 'before'],
    ['currency.decimal_places', 2],
    ['currency.decimal_separator', '.'],
    ['currency.thousands_separator', ','],
    ['datetime.time_format', '24h'],
    ['datetime.week_starts_on', 0],
    ['datetime.fiscal_year_start', '01-01'],
  ];

  it('each resolves to its coded default when no layer sets it', () => {
    for (const [key, def] of KEYS) {
      expect(resolveCountryConfigKey({}, key)).toEqual(def);
    }
  });

  it('each is tenant-overridable and none is statutory', () => {
    for (const [key] of KEYS) {
      expect(REGISTRY_BY_KEY[key], `missing ${key}`).toBeTruthy();
      expect(REGISTRY_BY_KEY[key].maxOverrideLayer).toBeUndefined();
      expect(REGISTRY_BY_KEY[key].required).toBeFalsy();
      expect(STATUTORY_KEYS).not.toContain(key);
    }
  });

  it('validates values via the registry Zod schema', () => {
    expect(resolveCountryConfigKey({ tenant: { 'currency.position': 'after' } }, 'currency.position')).toBe('after');
    expect(() => resolveCountryConfigKey({ tenant: { 'currency.position': 'left' } }, 'currency.position')).toThrow(CountryConfigError);
    expect(() => resolveCountryConfigKey({ tenant: { 'currency.decimal_places': 9 } }, 'currency.decimal_places')).toThrow(CountryConfigError);
    expect(() => resolveCountryConfigKey({ tenant: { 'datetime.fiscal_year_start': '1-1' } }, 'datetime.fiscal_year_start')).toThrow(CountryConfigError);
  });
});

describe('isConfigKeyLocked — editable vs statutory derivation', () => {
  it('locks required keys and country-locked keys, leaves preferences editable', () => {
    expect(isConfigKeyLocked('currency.code')).toBe(true);
    expect(isConfigKeyLocked('tax.zatca_qr.enabled')).toBe(true);
    expect(isConfigKeyLocked('currency.display_mode')).toBe(false);
    expect(isConfigKeyLocked('currency.position')).toBe(false);
    expect(isConfigKeyLocked('datetime.date_format')).toBe(false);
  });

  it('treats an unknown key as locked (fail-safe)', () => {
    expect(isConfigKeyLocked('nope.nope')).toBe(true);
  });
});

describe('§4.7 worked example — a NEW country key ships with ZERO schema change', () => {
  it('a registry entry alone makes a new per-country key resolvable through the cascade', () => {
    // Simulate the ONLY change a new key requires: one registry entry. In prod
    // this is a literal array push to COUNTRY_CONFIG_REGISTRY; here we build a
    // throwaway registry to prove no schema/types/trigger change is involved.
    const newKey: ConfigKeyDef = {
      key: 'document.national_id_label',
      domain: 'document',
      label: 'National ID label',
      description: 'Civil Number (OM) / Emirates ID (AE) / National ID (default).',
      schema: z.string(),
      codedDefault: 'National ID',
    } as ConfigKeyDef;

    const reg = { 'document.national_id_label': newKey };

    // Coded default when no country sets it:
    expect(resolveConfig<string>(reg, {}, 'document.national_id_label')).toBe('National ID');

    // Per-country value (what an admin would write into geo_countries.country_config,
    // which lands in the resolved snapshot → the country layer) — NO migration:
    expect(
      resolveConfig<string>(reg, { country: { 'document.national_id_label': 'Civil Number' } }, 'document.national_id_label'),
    ).toBe('Civil Number');

    // A tenant override (UAE entity) still wins at the tenant altitude:
    expect(
      resolveConfig<string>(
        reg,
        { country: { 'document.national_id_label': 'Civil Number' }, tenant: { 'document.national_id_label': 'Emirates ID' } },
        'document.national_id_label',
      ),
    ).toBe('Emirates ID');
  });
});
