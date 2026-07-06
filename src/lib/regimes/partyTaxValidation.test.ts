import { describe, it, expect, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { from: fromMock } }));

import { validatePartyTaxNumberPure, assertPartyTaxNumberValid } from './partyTaxValidation';

const chainReturning = (row: unknown) => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  return chain;
};

describe('validatePartyTaxNumberPure', () => {
  it('empty tax number is always ok (the column is optional; requirement gates own mandatoriness)', () => {
    expect(validatePartyTaxNumberPure({ countryCode: 'IN', taxNumber: '', subdivisionAuthorityCode: null }).ok).toBe(true);
    expect(validatePartyTaxNumberPure({ countryCode: 'IN', taxNumber: null, subdivisionAuthorityCode: null }).ok).toBe(true);
  });
  it('non-IN countries pass through (GCC VATINs are validated by the pack regex elsewhere)', () => {
    expect(validatePartyTaxNumberPure({ countryCode: 'OM', taxNumber: 'OM1100xyz', subdivisionAuthorityCode: null }).ok).toBe(true);
    expect(validatePartyTaxNumberPure({ countryCode: null, taxNumber: 'anything', subdivisionAuthorityCode: null }).ok).toBe(true);
  });
  it('IN: checksum-valid GSTIN passes; invalid checksum fails with the gstin error', () => {
    expect(validatePartyTaxNumberPure({ countryCode: 'IN', taxNumber: '29AAACX0000X1ZW', subdivisionAuthorityCode: null }).ok).toBe(true);
    const bad = validatePartyTaxNumberPure({ countryCode: 'IN', taxNumber: '29ABCDE1234F1Z5', subdivisionAuthorityCode: null });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/check character/i);
  });
  it('IN: state prefix must match the selected subdivision authority code when provided', () => {
    const r = validatePartyTaxNumberPure({ countryCode: 'IN', taxNumber: '29AAACX0000X1ZW', subdivisionAuthorityCode: '27' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/selected state/);
  });
});

describe('assertPartyTaxNumberValid', () => {
  it('resolves country code + subdivision authority code and throws the pure error', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'geo_countries') return chainReturning({ code: 'IN' });
      if (table === 'geo_subdivisions') return chainReturning({ tax_authority_code: '27' });
      throw new Error(`unexpected table ${table}`);
    });
    await expect(assertPartyTaxNumberValid({
      countryId: 'in-1', subdivisionId: 'sub-mh', taxNumber: '29AAACX0000X1ZW',
    })).rejects.toThrow(/selected state/);
  });
  it('no-ops without a tax number or country (never a hidden network call)', async () => {
    fromMock.mockClear();
    await assertPartyTaxNumberValid({ countryId: null, subdivisionId: null, taxNumber: '29AAACX0000X1ZW' });
    await assertPartyTaxNumberValid({ countryId: 'in-1', subdivisionId: null, taxNumber: '  ' });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
