import { describe, it, expect } from 'vitest';
import { registerRegimePlugin, resolveTaxStrategy, listRegisteredCapabilities } from './registry';
import { CountryConfigError } from '../country/resolveCountryConfig';
import type { TaxStrategy } from './types';

const fake: TaxStrategy = {
  key: 'test_vat', version: '0.0.1', schemeMode: 'single',
  defaults: { roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western' },
  compute: () => { throw new Error('unused'); },
};

describe('regimes/registry', () => {
  it('register then resolve returns the same plugin object', () => {
    registerRegimePlugin('tax', fake);
    expect(resolveTaxStrategy('test_vat')).toBe(fake);
  });
  it('unregistered key throws CountryConfigError naming the key — never a silent VAT 0%', () => {
    expect(() => resolveTaxStrategy('nonexistent_regime')).toThrowError(CountryConfigError);
    expect(() => resolveTaxStrategy('nonexistent_regime')).toThrowError(/nonexistent_regime/);
  });
  it('duplicate key+kind registration with a different version throws (accidental fork guard)', () => {
    expect(() => registerRegimePlugin('tax', { ...fake, version: '0.0.2' })).toThrowError(/already registered/);
  });
  it('listRegisteredCapabilities exposes capability_key/kind/version for the manifest gate', () => {
    const caps = listRegisteredCapabilities();
    expect(caps).toContainEqual({ capability_key: 'test_vat', kind: 'tax', version: '0.0.1' });
  });
});
