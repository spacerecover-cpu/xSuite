import { describe, it, expect } from 'vitest';
import { validateGSTIN, gstStateCodeOf, gstinCheckDigit, GSTIN_STATE_CODES } from './gstin';

describe('GSTIN_STATE_CODES', () => {
  it('pins the GSTIN-issuing set at 36 codes (special 96/97 excluded — place-of-supply-only)', () => {
    expect(GSTIN_STATE_CODES.size).toBe(36);
    expect(GSTIN_STATE_CODES.has('29')).toBe(true);  // Karnataka
    expect(GSTIN_STATE_CODES.has('04')).toBe(true);  // Chandigarh
    expect(GSTIN_STATE_CODES.has('96')).toBe(false); // foreign — place-of-supply only
    expect(GSTIN_STATE_CODES.has('97')).toBe(false); // Other Territory
  });
});

// Check-digit vectors verified against the GSTN/CBIC Luhn-mod-36 algorithm
// (factor 2 at the rightmost of the first 14 chars, alternating 2/1 leftwards).
describe('gstinCheckDigit', () => {
  it('reproduces the published GSTN vector 27AAPFU0939F1ZV', () => {
    expect(gstinCheckDigit('27AAPFU0939F1Z')).toBe('V');
  });
  it('computes check digits for the WP fixtures (Karnataka 29, Chandigarh 04)', () => {
    expect(gstinCheckDigit('29AAACX0000X1Z')).toBe('W');
    expect(gstinCheckDigit('04AAACX0000X1Z')).toBe('8');
  });
  it('throws on characters outside [0-9A-Z]', () => {
    expect(() => gstinCheckDigit('29aacx-000X1Z')).toThrow(/invalid character/);
  });
});

describe('gstStateCodeOf', () => {
  it('returns the 2-digit prefix', () => {
    expect(gstStateCodeOf('29AAACX0000X1ZW')).toBe('29');
    expect(gstStateCodeOf('  27aapfu0939f1zv ')).toBe('27');
  });
  it('returns null when the prefix is not two digits', () => {
    expect(gstStateCodeOf('X9AAACX0000X1ZW')).toBeNull();
    expect(gstStateCodeOf('')).toBeNull();
  });
});

describe('validateGSTIN', () => {
  it('accepts a checksum-valid GSTIN and normalizes case/whitespace', () => {
    expect(validateGSTIN('29AAACX0000X1ZW')).toEqual({ ok: true, error: null, stateCode: '29' });
    expect(validateGSTIN('  29aaacx0000x1zw ').ok).toBe(true);
  });
  it('rejects a well-formed GSTIN with a wrong check character (29ABCDE1234F1Z5 → expected W)', () => {
    const r = validateGSTIN('29ABCDE1234F1Z5');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/check character/i);
    expect(r.stateCode).toBe('29');
  });
  it('rejects a format-valid GSTIN on a non-GSTIN state code (96 foreign — rejected before checksum)', () => {
    const r = validateGSTIN('96ABCDE1234F1ZV');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('96');
  });
  it('rejects malformed GSTINs (14 chars, entity code 0, missing Z)', () => {
    expect(validateGSTIN('29AAACX0000X1Z').ok).toBe(false);       // 14 chars
    expect(validateGSTIN('29AAACX0000X0ZW').ok).toBe(false);      // entity code 0
    expect(validateGSTIN('29AAACX0000X1YW').ok).toBe(false);      // 14th char not Z
    expect(validateGSTIN('').ok).toBe(false);
  });
  it('cross-checks the state prefix against a selected subdivision authority code', () => {
    expect(validateGSTIN('29AAACX0000X1ZW', { tax_authority_code: '29' }).ok).toBe(true);
    const r = validateGSTIN('29AAACX0000X1ZW', { tax_authority_code: '27' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/does not match the selected state/);
  });
  it('skips the subdivision cross-check when none supplied', () => {
    expect(validateGSTIN('27AAPFU0939F1ZV').ok).toBe(true);
  });
});
