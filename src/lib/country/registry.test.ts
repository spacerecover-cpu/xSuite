import { describe, it, expect } from 'vitest';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';
import { CountryConfigError } from './resolveCountryConfig';
import {
  COUNTRY_CONFIG_REGISTRY,
  REGISTRY_BY_KEY,
  STATUTORY_KEYS,
  resolveCountryConfigKey,
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
