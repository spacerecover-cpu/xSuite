import { describe, it, expect } from 'vitest';
import { resolveCustomerLanguage } from './notificationLanguage';

describe('resolveCustomerLanguage (Q3 per-recipient chain)', () => {
  it('prefers the customer explicit preference', () => {
    expect(resolveCustomerLanguage({ customerPref: 'ar', sessionPref: 'en', tenantDefault: 'en', countryLang: 'ar' })).toBe('ar');
  });
  it('falls back to session, then tenant, then country, then en', () => {
    expect(resolveCustomerLanguage({ sessionPref: 'fr', tenantDefault: 'en', countryLang: 'ar' })).toBe('fr');
    expect(resolveCustomerLanguage({ tenantDefault: 'en', countryLang: 'ar' })).toBe('en');
    expect(resolveCustomerLanguage({ countryLang: 'ar' })).toBe('ar');
    expect(resolveCustomerLanguage({})).toBe('en');
  });
  it('ignores blank/whitespace candidates', () => {
    expect(resolveCustomerLanguage({ customerPref: '  ', countryLang: 'ar' })).toBe('ar');
  });
});
