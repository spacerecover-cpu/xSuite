import { describe, it, expect, beforeEach } from 'vitest';
import { resolveCustomerLanguage } from './customerLanguageService';
import { hydrateLanguages } from './locale';

beforeEach(() => hydrateLanguages([{ code: 'en', is_rtl: false }, { code: 'ar', is_rtl: true }]));

describe('resolveCustomerLanguage (Q3 per-recipient UI locale, normalized to a supported lang)', () => {
  it('prefers the customer preference, then session, tenant, country', () => {
    expect(resolveCustomerLanguage({ preferred: 'ar', sessionLang: 'en', tenantDefault: 'en', countryLanguage: 'en' })).toBe('ar');
    expect(resolveCustomerLanguage({ sessionLang: 'ar', tenantDefault: 'en', countryLanguage: 'en' })).toBe('ar');
    expect(resolveCustomerLanguage({ tenantDefault: 'ar', countryLanguage: 'en' })).toBe('ar');
    expect(resolveCustomerLanguage({ countryLanguage: 'ar' })).toBe('ar');
  });
  it('falls back to en when everything is null/blank', () => {
    expect(resolveCustomerLanguage({})).toBe('en');
    expect(resolveCustomerLanguage({ preferred: '  ', countryLanguage: null })).toBe('en');
  });
  it('normalizes a region-tagged code to its supported base (ar-OM -> ar)', () => {
    expect(resolveCustomerLanguage({ preferred: 'ar-OM' })).toBe('ar');
  });
  it('guards an unsupported preference down to en (while only en/ar hydrated)', () => {
    expect(resolveCustomerLanguage({ preferred: 'de', countryLanguage: 'ar' })).toBe('en');
  });
});
