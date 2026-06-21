import { describe, it, expect, beforeEach } from 'vitest';
import {
  isRTLLanguage,
  normalizeLang,
  hydrateLanguages,
  SUPPORTED_LANGS,
  RTL_LANGS,
} from './locale';

// The supported/RTL sets are module-level mutable state; reset to the bootstrap
// {en, ar} before each test so order never matters.
beforeEach(() => hydrateLanguages([{ code: 'en', is_rtl: false }, { code: 'ar', is_rtl: true }]));

describe('isRTLLanguage', () => {
  it('returns true for the bootstrap RTL language (ar)', () => {
    expect(isRTLLanguage('ar')).toBe(true);
  });
  it('returns false for LTR languages', () => {
    expect(isRTLLanguage('en')).toBe(false);
    expect(isRTLLanguage('de')).toBe(false);
    expect(isRTLLanguage('fr')).toBe(false);
  });
  it('is case-sensitive — uppercase AR is not the canonical RTL code', () => {
    expect(isRTLLanguage('AR')).toBe(false);
  });
  it('returns false for unknown / empty codes', () => {
    expect(isRTLLanguage('xx')).toBe(false);
    expect(isRTLLanguage('')).toBe(false);
  });
});

describe('normalizeLang', () => {
  it('returns ar for the Arabic base code', () => {
    expect(normalizeLang('ar')).toBe('ar');
  });
  it('returns ar for region-tagged Arabic (ar-*)', () => {
    expect(normalizeLang('ar-SA')).toBe('ar');
    expect(normalizeLang('ar-OM')).toBe('ar');
  });
  it('returns en for English', () => {
    expect(normalizeLang('en')).toBe('en');
  });
  it('guards unshipped UI languages to en (while only en/ar hydrated)', () => {
    expect(normalizeLang('de')).toBe('en');
    expect(normalizeLang('fr')).toBe('en');
  });
  it('returns en for undefined / missing input', () => {
    expect(normalizeLang(undefined)).toBe('en');
    expect(normalizeLang()).toBe('en');
  });
});

describe('hydrateLanguages (config-driven widening, no redeploy)', () => {
  it('widens the supported + RTL sets from data', () => {
    hydrateLanguages([
      { code: 'en', is_rtl: false },
      { code: 'he', is_rtl: true },
      { code: 'fr', is_rtl: false },
    ]);
    expect(isRTLLanguage('he')).toBe(true);
    expect(normalizeLang('fr')).toBe('fr'); // now supported
    expect(SUPPORTED_LANGS.has('fr')).toBe(true);
    expect(RTL_LANGS.has('he')).toBe(true);
    expect(isRTLLanguage('ar')).toBe(false); // ar no longer in the hydrated set
  });
  it('keeps the bootstrap set on an empty list (DB unreachable)', () => {
    hydrateLanguages([]);
    expect(SUPPORTED_LANGS.has('en')).toBe(true);
    expect(SUPPORTED_LANGS.has('ar')).toBe(true);
  });
  it('always guarantees the en fallback is supported', () => {
    hydrateLanguages([{ code: 'fr', is_rtl: false }]);
    expect(SUPPORTED_LANGS.has('en')).toBe(true);
  });
});
