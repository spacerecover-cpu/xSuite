import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';
import {
  resolveConfig,
  CountryConfigError,
  type ConfigKeyDef,
  type ConfigLayers,
} from './resolveCountryConfig';

// A Zod-backed mini-registry exercising every code path.
const reg: Record<string, ConfigKeyDef> = {
  'currency.code': {
    key: 'currency.code',
    schema: z.union([z.string().length(3), z.symbol()]),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
  'datetime.date_format': {
    key: 'datetime.date_format',
    schema: z.string(),
    codedDefault: 'YYYY-MM-DD', // a coded default that is a real value
  },
  'tax.default_rate': {
    key: 'tax.default_rate',
    schema: z.number().min(0).max(100),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
};

describe('resolveConfig — precedence (most-specific non-null wins)', () => {
  it('returns the coded default when no layer sets the key', () => {
    expect(resolveConfig<string>(reg, {}, 'datetime.date_format')).toBe('YYYY-MM-DD');
  });

  it('walks global → region → country → legalEntity → tenant → businessUnit, later wins', () => {
    const layers: ConfigLayers = {
      global: { 'datetime.date_format': 'A' },
      region: { 'datetime.date_format': 'B' },
      country: { 'datetime.date_format': 'C' },
      legalEntity: { 'datetime.date_format': 'D' },
      tenant: { 'datetime.date_format': 'E' },
      businessUnit: { 'datetime.date_format': 'F' },
    };
    expect(resolveConfig<string>(reg, layers, 'datetime.date_format')).toBe('F'); // most specific

    // Remove the two most-specific rungs → the next one wins, proving each rung.
    expect(resolveConfig<string>(reg, { ...layers, businessUnit: {}, tenant: {} }, 'datetime.date_format')).toBe('D');
    expect(resolveConfig<string>(reg, { global: { 'datetime.date_format': 'A' }, country: { 'datetime.date_format': 'C' } }, 'datetime.date_format')).toBe('C');
    expect(resolveConfig<string>(reg, { global: { 'datetime.date_format': 'A' } }, 'datetime.date_format')).toBe('A');
  });

  it('treats a null/undefined value in a more-specific layer as TRANSPARENT (does not override a more-general non-null)', () => {
    const layers: ConfigLayers = {
      country: { 'datetime.date_format': 'C' },
      tenant: { 'datetime.date_format': null }, // explicit null
      businessUnit: { 'datetime.date_format': undefined as unknown }, // explicit undefined
    };
    expect(resolveConfig<string>(reg, layers, 'datetime.date_format')).toBe('C');
  });
});

describe('resolveConfig — fail-loud safety', () => {
  it('THROWS CountryConfigError for an UNREGISTERED key — the deliberate inversion vs resolveFeatures.ts:28, which returns true for unknown keys (config feeds money/tax/legal output, so it must not silently permit)', () => {
    expect(() => resolveConfig(reg, {}, 'no.such.key')).toThrow(CountryConfigError);
    expect(() => resolveConfig(reg, {}, 'no.such.key')).toThrow(/Unregistered country-config key/);
  });

  it('THROWS for a required key still resolving to REQUIRED_SENTINEL (country not configured, fail-loud, D2)', () => {
    expect(() => resolveConfig(reg, {}, 'currency.code')).toThrow(CountryConfigError);
    expect(() => resolveConfig(reg, {}, 'currency.code')).toThrow(/fail-loud, D2/);
  });

  it('resolves a required key once a layer supplies a valid value', () => {
    expect(resolveConfig<string>(reg, { country: { 'currency.code': 'OMR' } }, 'currency.code')).toBe('OMR');
  });

  it('THROWS when a supplied value fails the per-key schema (e.g. a 4-letter currency, an out-of-range rate)', () => {
    expect(() => resolveConfig(reg, { tenant: { 'currency.code': 'OMRX' } }, 'currency.code')).toThrow(CountryConfigError);
    expect(() => resolveConfig(reg, { tenant: { 'tax.default_rate': 150 } }, 'tax.default_rate')).toThrow(CountryConfigError);
  });
});
