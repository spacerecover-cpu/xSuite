import { describe, it, expect } from 'vitest';
import { countryTemplateOverride, type ResolvedCountryFacts } from './countryConfig';
import { gccTaxInvoiceProfile } from '../../regimes/gcc_tax_invoice';

const OMAN: ResolvedCountryFacts = {
  code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: null, taxInvoiceRequired: true,
  languageCode: 'ar', decimalPlaces: 3, dateFormat: 'DD/MM/YYYY',
  decimalSeparator: null, thousandsSeparator: null, digitGrouping: null,
  einvoiceRegimeKey: 'no_einvoice',
};
const UK: ResolvedCountryFacts = {
  code: 'GB', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: null, taxInvoiceRequired: true,
  languageCode: 'en', decimalPlaces: 2, dateFormat: 'DD/MM/YYYY',
  decimalSeparator: null, thousandsSeparator: null, digitGrouping: null,
  einvoiceRegimeKey: 'no_einvoice',
};
const US: ResolvedCountryFacts = {
  code: 'US', taxSystem: 'SALES_TAX', taxLabel: 'Sales Tax', taxNumberLabel: null, taxInvoiceRequired: false,
  languageCode: 'en', decimalPlaces: 2, dateFormat: 'MM/DD/YYYY',
  decimalSeparator: null, thousandsSeparator: null, digitGrouping: null,
  einvoiceRegimeKey: 'no_einvoice',
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
  it('LTR country + a bilingual-enabled profile → bilingual_stacked, English-primary (else-if branch)', () => {
    // GB (languageCode en, not RTL) with a profile whose bilingual is enabled AND carries a
    // secondaryLanguage exercises the LTR-bilingual branch — dead until such a regime ships,
    // so this pins its behavior in advance: stacked layout, English as the primary language.
    const ov = countryTemplateOverride(UK, {
      profile: gccTaxInvoiceProfile, sellerRegistered: true, docType: 'invoice',
    });
    expect(ov.language).toEqual({ mode: 'bilingual_stacked', primary: 'en' });
  });
  it('threads the country date format onto config.locale (§8d hand-off)', () => {
    expect(countryTemplateOverride(UK).locale?.dateFormat).toBe('DD/MM/YYYY');
  });
  it('threads decimal places onto config.locale for money/amountInWords (D13)', () => {
    expect(countryTemplateOverride(OMAN).locale?.decimalPlaces).toBe(3);
  });
});

const omFacts: ResolvedCountryFacts = {
  code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
  taxInvoiceRequired: true, languageCode: 'ar', decimalPlaces: 3,
  dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
  einvoiceRegimeKey: 'no_einvoice',
};

describe('countryTemplateOverride + DocumentComplianceProfile', () => {
  it('derives the profile title for a registered seller', () => {
    const o = countryTemplateOverride(omFacts, {
      profile: gccTaxInvoiceProfile, sellerRegistered: true, docType: 'invoice',
    });
    expect(o.labels?.documentTitle).toEqual({ en: 'TAX INVOICE', ar: 'فاتورة ضريبية' });
  });

  it('derives plain INVOICE for an unregistered seller and disables the band', () => {
    const o = countryTemplateOverride(omFacts, {
      profile: gccTaxInvoiceProfile, sellerRegistered: false, docType: 'invoice',
    });
    expect(o.labels?.documentTitle).toEqual({ en: 'INVOICE', ar: 'فاتورة' });
    expect(o.taxBar?.enabled).toBe(false);
  });

  it('labels the tax bar with taxNumberLabel (TRN/VATIN), not the tax-system label', () => {
    const o = countryTemplateOverride(omFacts, {
      profile: gccTaxInvoiceProfile, sellerRegistered: true, docType: 'invoice',
    });
    expect(o.taxBar).toMatchObject({ enabled: true, label: { en: 'VATIN' } });
  });

  it('threads the separator facts onto the locale slice', () => {
    const o = countryTemplateOverride(omFacts);
    expect(o.locale).toMatchObject({
      dateFormat: 'DD/MM/YYYY', decimalPlaces: 3,
      decimalSeparator: '.', thousandsSeparator: ',',
    });
  });

  it('keeps the legacy no-compliance behavior byte-identical for existing callers', () => {
    const o = countryTemplateOverride(omFacts);
    expect(o.labels?.documentTitle).toBeUndefined();          // profile absent → no title override
    expect(o.taxBar?.enabled).toBe(true);                     // D11 rule unchanged
    expect(o.language).toEqual({ mode: 'bilingual_stacked', primary: 'ar' });
  });
});

describe('countryTemplateOverride address ordering', () => {
  it('sets locale.postalFirst=true when the postal token precedes the city token', () => {
    const override = countryTemplateOverride({ ...omFacts, addressFormat: '%N %O %A %Z %C' });
    expect(override.locale?.postalFirst).toBe(true);
  });
  it('leaves postalFirst unset when the template lists city before postal (GCC/US/UK)', () => {
    const override = countryTemplateOverride({ ...omFacts, addressFormat: '%N %O %A %C %Z' });
    expect(override.locale?.postalFirst).toBeUndefined();
  });
});

describe("digitGrouping → locale.groupingStyle (WP-L1)", () => {
  it("sets groupingStyle 'indian' for '3;2'", () => {
    expect(countryTemplateOverride({ ...omFacts, digitGrouping: '3;2' }).locale?.groupingStyle).toBe('indian');
  });
  it("leaves groupingStyle unset for '3' and null (byte parity)", () => {
    expect(countryTemplateOverride({ ...omFacts, digitGrouping: '3' }).locale?.groupingStyle).toBeUndefined();
    expect(countryTemplateOverride({ ...omFacts, digitGrouping: null }).locale?.groupingStyle).toBeUndefined();
  });
});
