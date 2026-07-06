import { describe, it, expect } from 'vitest';
import { derivePlaceOfSupply } from './placeOfSupply';

const byCode = new Map([['29', 'sub-ka'], ['27', 'sub-mh'], ['96', 'sub-foreign']]);

describe('derivePlaceOfSupply — Sec 12(2) IGST Act', () => {
  it('registered buyer: valid GSTIN prefix resolves the state (buyer location)', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: '27AAPFU0939F1ZV', buyerSubdivisionId: 'sub-ka', subdivisionIdByAuthorityCode: byCode,
    })).toEqual({ subdivisionId: 'sub-mh', basis: 'gstin_prefix' });
  });
  it('unregistered buyer (no GSTIN): billing subdivision is the address on record', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: null, buyerSubdivisionId: 'sub-ka', subdivisionIdByAuthorityCode: byCode,
    })).toEqual({ subdivisionId: 'sub-ka', basis: 'billing_subdivision' });
  });
  it('checksum-invalid GSTIN falls back to the billing subdivision (never a wrong-state split)', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: '29ABCDE1234F1Z5', buyerSubdivisionId: 'sub-mh', subdivisionIdByAuthorityCode: byCode,
    })).toEqual({ subdivisionId: 'sub-mh', basis: 'billing_subdivision' });
  });
  it('valid GSTIN whose prefix is not in the map falls back to billing subdivision', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: '04AAACX0000X1Z8', buyerSubdivisionId: 'sub-ka',
      subdivisionIdByAuthorityCode: new Map([['29', 'sub-ka']]),
    })).toEqual({ subdivisionId: 'sub-ka', basis: 'billing_subdivision' });
  });
  it('nothing known: none/null (the requirement gate, not this function, decides blocking)', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: null, buyerSubdivisionId: null, subdivisionIdByAuthorityCode: byCode,
    })).toEqual({ subdivisionId: null, basis: 'none' });
  });
  it('non-IN tenants (empty map, non-GSTIN tax numbers) degrade to billing subdivision', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: 'OM1234567', buyerSubdivisionId: 'sub-om', subdivisionIdByAuthorityCode: new Map(),
    })).toEqual({ subdivisionId: 'sub-om', basis: 'billing_subdivision' });
  });
});
