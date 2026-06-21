import { describe, it, expect } from 'vitest';
import { countryTemplateOverride, type ResolvedCountryFacts } from './countryConfig';

const OMAN: ResolvedCountryFacts = {
  code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxInvoiceRequired: true,
  languageCode: 'ar', decimalPlaces: 3, dateFormat: 'DD/MM/YYYY',
};
const UK: ResolvedCountryFacts = {
  code: 'GB', taxSystem: 'VAT', taxLabel: 'VAT', taxInvoiceRequired: true,
  languageCode: 'en', decimalPlaces: 2, dateFormat: 'DD/MM/YYYY',
};
const US: ResolvedCountryFacts = {
  code: 'US', taxSystem: 'SALES_TAX', taxLabel: 'Sales Tax', taxInvoiceRequired: false,
  languageCode: 'en', decimalPlaces: 2, dateFormat: 'MM/DD/YYYY',
};

describe('countryTemplateOverride (§8b)', () => {
  it('emits the resolved tax label so the VAT line is country-correct (D9)', () => {
    expect(countryTemplateOverride(US).labels?.taxLabel).toEqual({ en: 'Sales Tax' });
    expect(countryTemplateOverride(OMAN).labels?.taxLabel).toEqual({ en: 'VAT' });
  });
  it('also threads the tax label onto taxBar.label (the bar the adapter renders)', () => {
    expect(countryTemplateOverride(US).taxBar?.label).toEqual({ en: 'Sales Tax' });
    expect(countryTemplateOverride(OMAN).taxBar?.label).toEqual({ en: 'VAT' });
  });
  it('enables the tax bar only when a tax invoice is required AND system is VAT (D11)', () => {
    expect(countryTemplateOverride(OMAN).taxBar?.enabled).toBe(true);
    expect(countryTemplateOverride(US).taxBar?.enabled).toBe(false);
  });
  it('switches to bilingual-stacked + arabic-lead for an RTL country', () => {
    const ov = countryTemplateOverride(OMAN);
    expect(ov.language?.mode).toBe('bilingual_stacked');
    expect(ov.language?.primary).toBe('ar');
  });
  it('keeps English LTR for a non-RTL country (no language override)', () => {
    expect(countryTemplateOverride(UK).language).toBeUndefined();
  });
  it('threads the country date format onto config.locale (§8d hand-off)', () => {
    expect(countryTemplateOverride(UK).locale?.dateFormat).toBe('DD/MM/YYYY');
  });
  it('threads decimal places onto config.locale for money/amountInWords (D13)', () => {
    expect(countryTemplateOverride(OMAN).locale?.decimalPlaces).toBe(3);
  });
});
