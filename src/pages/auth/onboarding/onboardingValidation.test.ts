import { describe, it, expect } from 'vitest';
import {
  filterOnboardableCountries,
  validateTaxNumber,
  resolveUiLanguageDefault,
  shouldShowJurisdictionStep,
  canAdvanceFromAccount,
  otpCodeIsValidShape,
  resolveUiLanguagePayload,
} from './onboardingValidation';

describe('filterOnboardableCountries', () => {
  it('keeps only currency-bearing active countries (fail-loud, D2/D3)', () => {
    const out = filterOnboardableCountries([
      { id: '1', code: 'OM', currency_code: 'OMR', is_active: true },
      { id: '2', code: 'XX', currency_code: null, is_active: true },
    ] as never);
    expect(out.map((c) => c.code)).toEqual(['OM']);
  });

  it('drops a 3-letter-currency country that is not active', () => {
    const out = filterOnboardableCountries([
      { id: '1', code: 'OM', currency_code: 'OMR', is_active: true },
      { id: '3', code: 'ZZ', currency_code: 'ZZZ', is_active: false },
    ] as never);
    expect(out.map((c) => c.code)).toEqual(['OM']);
  });

  it('drops a blank-string or malformed currency code (never a 1/2/4-char stub)', () => {
    const out = filterOnboardableCountries([
      { id: '1', code: 'OM', currency_code: 'OMR', is_active: true },
      { id: '4', code: 'AA', currency_code: '', is_active: true },
      { id: '5', code: 'BB', currency_code: '$', is_active: true },
      { id: '6', code: 'CC', currency_code: 'USDX', is_active: true },
    ] as never);
    expect(out.map((c) => c.code)).toEqual(['OM']);
  });
});

describe('validateTaxNumber', () => {
  it('accepts any non-empty when the reference format is missing (our gap, not theirs)', () => {
    expect(validateTaxNumber(null, 'OM12345')).toEqual({ ok: true });
  });
  it('rejects empty when a tax system requires it', () => {
    expect(validateTaxNumber(null, '').ok).toBe(false);
  });
  it('rejects whitespace-only as empty', () => {
    expect(validateTaxNumber(null, '   ').ok).toBe(false);
  });
  it('validates against the format regex when present', () => {
    expect(validateTaxNumber('^[0-9]{15}$', '300000000000003').ok).toBe(true);
    expect(validateTaxNumber('^[0-9]{15}$', 'abc').ok).toBe(false);
  });
  it('does not throw on an invalid regex string — treats it as "no machine check" and accepts non-empty', () => {
    expect(validateTaxNumber('([unclosed', 'anything').ok).toBe(true);
  });
});

describe('resolveUiLanguageDefault', () => {
  it('maps the country language to the supported en|ar union, never US-default', () => {
    expect(resolveUiLanguageDefault('ar')).toBe('ar');
    expect(resolveUiLanguageDefault('fr')).toBe('en'); // conservative fallback to en (supported), NOT a throw
  });
  it('falls back to en for null/undefined/empty (supported, not a throw)', () => {
    expect(resolveUiLanguageDefault(null)).toBe('en');
    expect(resolveUiLanguageDefault(undefined)).toBe('en');
    expect(resolveUiLanguageDefault('')).toBe('en');
  });
  it('is case-insensitive on the country language code', () => {
    expect(resolveUiLanguageDefault('AR')).toBe('ar');
  });
});

describe('shouldShowJurisdictionStep', () => {
  it('renders only when the country has a real tax system', () => {
    expect(shouldShowJurisdictionStep('VAT')).toBe(true);
    expect(shouldShowJurisdictionStep('GST')).toBe(true);
    expect(shouldShowJurisdictionStep('NONE')).toBe(false);
    expect(shouldShowJurisdictionStep(null)).toBe(false);
    expect(shouldShowJurisdictionStep('')).toBe(false);
  });
});

describe('canAdvanceFromAccount', () => {
  it('blocks until the email is verified (OTP gate, §9.5)', () => {
    expect(canAdvanceFromAccount({ emailVerified: false })).toBe(false);
    expect(canAdvanceFromAccount({ emailVerified: true })).toBe(true);
  });
});

describe('resolveUiLanguagePayload', () => {
  it('returns undefined when the chosen language equals the country default (let DB sync own it, §9.2)', () => {
    expect(resolveUiLanguagePayload('ar', 'ar')).toBeUndefined();
    expect(resolveUiLanguagePayload('en', 'en')).toBeUndefined();
  });
  it('returns undefined when nothing was chosen (empty/undefined)', () => {
    expect(resolveUiLanguagePayload('ar', '')).toBeUndefined();
    expect(resolveUiLanguagePayload('ar', undefined)).toBeUndefined();
  });
  it('forwards the override only when the user deviated from the country default', () => {
    expect(resolveUiLanguagePayload('ar', 'en')).toBe('en'); // country ar, user chose en
    expect(resolveUiLanguagePayload('en', 'ar')).toBe('ar');
  });
});

describe('otpCodeIsValidShape', () => {
  it('accepts exactly 6 digits', () => {
    expect(otpCodeIsValidShape('123456')).toBe(true);
  });
  it('rejects non-6-digit or non-numeric codes', () => {
    expect(otpCodeIsValidShape('12345')).toBe(false);
    expect(otpCodeIsValidShape('1234567')).toBe(false);
    expect(otpCodeIsValidShape('12a456')).toBe(false);
    expect(otpCodeIsValidShape('')).toBe(false);
    expect(otpCodeIsValidShape(' 123456 ')).toBe(false);
  });
});
