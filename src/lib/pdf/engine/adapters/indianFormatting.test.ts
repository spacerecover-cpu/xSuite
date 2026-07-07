import { describe, it, expect } from 'vitest';
import { toEngineData } from './invoiceAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../../templateConfig';
import { countryTemplateOverride, type ResolvedCountryFacts } from '../countryConfig';
import { buildInvoiceFixture } from '../invoiceParity.fixtures';

const inFacts: ResolvedCountryFacts = {
  code: 'IN', taxSystem: 'GST', taxLabel: 'GST', taxNumberLabel: 'GSTIN',
  taxInvoiceRequired: true, languageCode: 'en', decimalPlaces: 2,
  dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',',
  digitGrouping: '3;2', amountWordsScale: 'indian', einvoiceRegimeKey: 'no_einvoice',
};

function inConfig() {
  return resolveTemplateConfigWithCountry(BUILT_IN_TEMPLATE_CONFIGS.invoice, countryTemplateOverride(inFacts));
}

function inFixture() {
  return buildInvoiceFixture({
    subtotal: 90000, discount_amount: 0, tax_rate: 18, tax_amount: 16200,
    total_amount: 106200, amount_paid: 0, balance_due: 106200,
    accounting_locales: { currency_symbol: '₹', currency_position: 'before', decimal_places: 2 },
  });
}

describe('invoiceAdapter Indian money formatting (WP-L1)', () => {
  it('renders the total with lakh grouping and the U+20B9 symbol', () => {
    const data = toEngineData(inFixture(), inConfig());
    const total = data.totals!.find((t) => t.key === 'total')!;
    expect(total.value).toBe('₹ 1,06,200.00');
    expect(total.value.codePointAt(0)).toBe(0x20b9);
  });
  it('AED fixture without the country layer stays byte-identical (parity guard)', () => {
    const data = toEngineData(buildInvoiceFixture(), BUILT_IN_TEMPLATE_CONFIGS.invoice);
    expect(data.totals!.find((t) => t.key === 'total')!.value).toBe('1,470.00 AED');
  });
});

describe('invoiceAdapter Indian amount-in-words (WP-L1)', () => {
  it('spells the total in lakh/crore when the totals line is enabled', () => {
    const config = resolveTemplateConfigWithCountry(
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
      countryTemplateOverride({ ...inFacts, amountWordsScale: 'indian' }),
    );
    const totalsSection = config.sections.find((s) => s.key === 'totals')!;
    totalsSection.lines = { ...(totalsSection.lines ?? {}), amountInWords: true };
    const data = toEngineData(inFixture(), config);
    const words = data.totals!.find((t) => t.key === 'amountInWords')!;
    expect(words.value).toBe('₹ One Lakh Six Thousand Two Hundred only');
  });
});
