import { describe, it, expect } from 'vitest';
import { isRTLLanguage, normalizeLang } from './locale';

describe('isRTLLanguage', () => {
  it('returns true for the only RTL language (ar)', () => {
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
    expect(normalizeLang('ar-EG')).toBe('ar');
  });

  it('returns en for English', () => {
    expect(normalizeLang('en')).toBe('en');
  });

  it('guards unshipped UI languages to en', () => {
    expect(normalizeLang('de')).toBe('en');
    expect(normalizeLang('fr')).toBe('en');
  });

  it('returns en for undefined / missing input', () => {
    expect(normalizeLang(undefined)).toBe('en');
    expect(normalizeLang()).toBe('en');
  });
});
