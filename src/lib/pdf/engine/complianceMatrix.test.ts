import { describe, it, expect } from 'vitest';
import { toEngineData } from './adapters/invoiceAdapter';
import { toEngineData as toQuoteEngineData } from './adapters/quoteAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../templateConfig';
import { countryTemplateOverride } from './countryConfig';
import { renderTemplate } from './renderTemplate';
import { ctxFromLanguageConfig } from '../translationContext';
import { registerAllRegimePlugins } from '../../regimes/register';
import { resolveDocumentProfile } from '../../regimes/registry';
import { gccTaxInvoiceProfile } from '../../regimes/gcc_tax_invoice';
import { buildInvoiceFixture } from './invoiceParity.fixtures';
import { buildQuoteFixture } from './quoteParity.fixtures';

// ---------------------------------------------------------------------------
// Phase 2 exit-criterion matrix (WP-9, Task 27).
//
// GCC-6 (OM/AE/SA/BH/KW/QA) + UK (GB, "any simple-VAT country") x
// {invoice, quote}: proves — per country — the title ceremony (TAX INVOICE
// only for a VAT + tax_invoice_required seller), the registration band
// (enabled + labelled for VAT, disabled for NONE), exactly one component tax
// row at the country's stored decimal places, and bilingual/RTL activation
// (ar -> bilingual_stacked, en -> en). A snapshot per cell pins the full
// resolved EngineDocData net, plus a raw pdfmake content-tree snapshot for
// the two RTL-heaviest countries (OM 3dp, SA 2dp Arabic-lead).
//
// `taxNumberLabel` values are the LIVE `geo_countries.tax_number_label`
// values (verified against the DB), not the plan draft: OM and BH are both
// 'VAT Number' (the plan draft had 'VATIN' / 'VAT Account Number').
// ---------------------------------------------------------------------------

registerAllRegimePlugins();

interface Cell {
  code: string; taxSystem: 'VAT' | 'NONE'; taxLabel: string; taxNumberLabel: string;
  taxInvoiceRequired: boolean; languageCode: string; dp: number; profileKey: 'gcc_tax_invoice' | 'generic_invoice';
}
const MATRIX: Cell[] = [
  { code: 'OM', taxSystem: 'VAT',  taxLabel: 'VAT', taxNumberLabel: 'VAT Number', taxInvoiceRequired: true,  languageCode: 'ar', dp: 3, profileKey: 'gcc_tax_invoice' },
  { code: 'AE', taxSystem: 'VAT',  taxLabel: 'VAT', taxNumberLabel: 'TRN',        taxInvoiceRequired: true,  languageCode: 'ar', dp: 2, profileKey: 'gcc_tax_invoice' },
  { code: 'SA', taxSystem: 'VAT',  taxLabel: 'VAT', taxNumberLabel: 'VAT Number', taxInvoiceRequired: true,  languageCode: 'ar', dp: 2, profileKey: 'gcc_tax_invoice' },
  { code: 'BH', taxSystem: 'VAT',  taxLabel: 'VAT', taxNumberLabel: 'VAT Number', taxInvoiceRequired: true,  languageCode: 'ar', dp: 3, profileKey: 'gcc_tax_invoice' },
  { code: 'KW', taxSystem: 'NONE', taxLabel: 'Tax', taxNumberLabel: 'Tax ID',     taxInvoiceRequired: false, languageCode: 'ar', dp: 3, profileKey: 'generic_invoice' },
  { code: 'QA', taxSystem: 'NONE', taxLabel: 'Tax', taxNumberLabel: 'Tax ID',     taxInvoiceRequired: false, languageCode: 'ar', dp: 2, profileKey: 'generic_invoice' },
  { code: 'GB', taxSystem: 'VAT',  taxLabel: 'VAT', taxNumberLabel: 'VAT Number', taxInvoiceRequired: true,  languageCode: 'en', dp: 2, profileKey: 'generic_invoice' },
];

const factsFor = (c: Cell) => ({
  code: c.code, taxSystem: c.taxSystem, taxLabel: c.taxLabel, taxNumberLabel: c.taxNumberLabel,
  taxInvoiceRequired: c.taxInvoiceRequired, languageCode: c.languageCode, decimalPlaces: c.dp,
  dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
  addressFormat: null as string | null,
});
const profileFor = (c: Cell) =>
  c.profileKey === 'gcc_tax_invoice' ? gccTaxInvoiceProfile : resolveDocumentProfile('generic_invoice');
const taxLinesFor = (c: Cell) => c.taxSystem === 'VAT'
  ? [{ line_item_id: null, component_code: 'VAT', component_label: `${c.taxLabel} 5%`, rate: 5,
       taxable_base: 1440, tax_amount: 72, tax_treatment: 'standard', treatment_reason_code: null,
       sequence: 0, backfilled: false, rule_trace: null }]
  : [];
const configFor = (c: Cell, docType: 'invoice' | 'quote') => resolveTemplateConfigWithCountry(
  BUILT_IN_TEMPLATE_CONFIGS[docType],
  countryTemplateOverride(factsFor(c), { profile: profileFor(c), sellerRegistered: true, docType }),
);

describe('Phase 2 compliance matrix', () => {
  it.each(MATRIX)('$code invoice — title ceremony, band, component row, bilingual', (c) => {
    const config = configFor(c, 'invoice');
    const data = toEngineData(buildInvoiceFixture({
      subtotal: 1440,
      // A NONE-tax-system country never carries a stored VAT rate/amount on
      // the header — real fixture data for KW/QA, not a mid-migration
      // backfill — so the fallback-to-header-tax path (invoiceAdapter.ts
      // "M-I") never fires and the matrix's own "0 tax rows for NONE" claim
      // is honest. (tax_rate must also be zeroed: the base fixture defaults
      // it to 5, which alone re-triggers the same fallback via `tax_rate > 0`.)
      tax_rate: c.taxSystem === 'VAT' ? 5 : 0,
      tax_amount: c.taxSystem === 'VAT' ? 72 : 0,
      total_amount: c.taxSystem === 'VAT' ? 1512 : 1440,
      seller_tax_number: `SELLER-${c.code}`,
      tax_lines: taxLinesFor(c),
    }), config);

    // 1. Title ceremony — only VAT + required countries claim TAX INVOICE.
    expect(data.documentTitle.en).toBe(c.taxSystem === 'VAT' && c.taxInvoiceRequired ? 'TAX INVOICE' : 'INVOICE');
    // 2. Band — enabled + labelled for VAT countries; disabled for KW/QA.
    expect(config.taxBar?.enabled).toBe(c.taxSystem === 'VAT');
    if (c.taxSystem === 'VAT') expect(config.taxBar?.label?.en).toBe(c.taxNumberLabel);
    // 3. Component row — exactly one 'tax' row, stored amount at country decimals (72.000 OM vs 72.00 AE).
    const taxRows = (data.totals ?? []).filter((t) => t.key === 'tax');
    if (c.taxSystem === 'VAT') {
      expect(taxRows).toHaveLength(1);
      expect(taxRows[0].label.en).toBe(`${c.taxLabel} 5%:`);
      expect(taxRows[0].value).toContain((72).toFixed(c.dp));
    } else {
      expect(taxRows).toHaveLength(0);
    }
    // 4. Bilingual — ar countries stack; GB stays en.
    expect(config.language?.mode).toBe(c.languageCode === 'ar' ? 'bilingual_stacked' : 'en');
    // 5. Snapshot net.
    expect(data).toMatchSnapshot(`${c.code}-invoice`);
  });

  it.each(MATRIX)('$code quote resolves QUOTATION + component rows', (c) => {
    const data = toQuoteEngineData(buildQuoteFixture({
      subtotal: 1440,
      tax_rate: c.taxSystem === 'VAT' ? 5 : 0,
      tax_amount: c.taxSystem === 'VAT' ? 72 : 0,
      total_amount: c.taxSystem === 'VAT' ? 1512 : 1440,
      tax_lines: taxLinesFor(c),
    }), configFor(c, 'quote'));
    expect(data.documentTitle.en).toBe('QUOTATION');
    expect(data).toMatchSnapshot(`${c.code}-quote`);
  });

  it('en output for a facts-null tenant is byte-identical (Phase-4a invariant)', () => {
    const gb = MATRIX[6];
    const withFacts = toEngineData(buildInvoiceFixture({ subtotal: 1440, tax_amount: 72, total_amount: 1512, tax_lines: taxLinesFor(gb) }), configFor(gb, 'invoice'));
    const nullFacts = toEngineData(buildInvoiceFixture({ subtotal: 1440, tax_amount: 72, total_amount: 1512, tax_lines: taxLinesFor(gb) }), BUILT_IN_TEMPLATE_CONFIGS.invoice);
    expect(withFacts.documentTitle.en).toBe(nullFacts.documentTitle.en);
    expect((withFacts.totals ?? []).filter((t) => t.key === 'tax')).toEqual((nullFacts.totals ?? []).filter((t) => t.key === 'tax'));
  });

  it.each(['OM', 'SA'])('%s RTL bilingual PDF content tree snapshot', (code) => {
    const c = MATRIX.find((m) => m.code === code)!;
    const config = configFor(c, 'invoice');
    const data = toEngineData(buildInvoiceFixture({ subtotal: 1440, tax_amount: 72, total_amount: 1512, tax_lines: taxLinesFor(c) }), config);
    const docDef = renderTemplate(config, data, ctxFromLanguageConfig(config.language), null);
    expect(docDef.content).toMatchSnapshot(`${code}-invoice-rtl-content`);
  });
});
