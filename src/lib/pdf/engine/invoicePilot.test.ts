import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/invoiceAdapter';
import { renderTemplate } from './renderTemplate';
import { isPdfEngineEnabled } from './featureFlag';
import type { TranslationContext, InvoiceDocumentData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig } from '../templateConfig';

// ---------------------------------------------------------------------------
// M3 invoice-pilot characterization.
//
// Proves the engine renders a COMPLETE, VALID invoice end-to-end from real
// InvoiceDocumentData: toEngineData (the adapter, which owns all currency/math
// domain knowledge) → renderTemplate (the config-driven assembler). We walk the
// pdfmake content tree and assert the header/line-items/totals content is
// present, that line-item and total VALUES match the synthetic input exactly,
// and that bilingual mode surfaces the Arabic title. Plus a guard that the
// feature flag defaults OFF (so production keeps the legacy builder).
//
// All inputs are synthetic — no DB, no font loading, no real records.
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

const bilingualCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: true,
  isBilingual: true,
  languageCode: 'ar',
  fontFamily: 'Roboto',
};

/** A 1x1 transparent PNG data URI so the QR/footer image branches execute. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Synthetic invoice with two line items, a discount and 5% VAT, full company
 * identity and a customer. Currency is OMR with 3 decimal places and a
 * `before` position. Numbers are chosen so the totals are easy to verify:
 *   subtotal 1500.000, discount 100.000 → net 1400.000, VAT 5% = 70.000,
 *   total 1470.000.
 */
function makeInvoiceData(
  overrides?: Partial<InvoiceDocumentData['invoiceData']>,
): InvoiceDocumentData {
  return {
    invoiceData: {
      id: 'inv-1',
      invoice_number: 'INVO-0042',
      invoice_type: 'tax_invoice',
      invoice_date: '2026-06-13',
      due_date: '2026-06-27',
      status: 'issued',
      client_reference: 'PO-9001',
      subtotal: 1500,
      tax_rate: 5,
      tax_amount: 70,
      discount_amount: 100,
      total_amount: 1470,
      amount_paid: 0,
      balance_due: 1470,
      payment_terms: 'Net 14 days from invoice date.',
      notes: 'Thank you for your business.',
      created_at: '2026-06-13T00:00:00Z',
      customer: {
        id: 'cust-1',
        customer_name: 'Jane Client',
        email: 'jane@client.test',
        mobile_number: '+968 9999 0000',
      },
      cases: {
        id: 'case-1',
        case_no: 'CASE-0007',
        contact_name: 'Jane Client',
        contact_email: 'jane@client.test',
        contact_phone: '+968 9999 0000',
      },
      bank_accounts: {
        id: 'bank-1',
        account_name: 'Acme Data Recovery LLC',
        bank_name: 'Bank of Muscat',
        account_number: '0123456789',
        iban: 'OM12 0000 0000 0123 4567 89',
        swift_code: 'BMUSOMRX',
      },
      invoice_line_items: [
        { description: 'RAID-5 logical recovery', quantity: 1, unit_price: 1000, tax_rate: 5, line_total: 1000 },
        { description: 'Donor drive sourcing', quantity: 2, unit_price: 250, tax_rate: 5, line_total: 500 },
      ],
      accounting_locales: {
        currency_symbol: 'OMR',
        currency_position: 'before',
        decimal_places: 3,
      },
      ...overrides,
    },
    companySettings: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Muscat', country: 'Oman' },
      contact_info: { phone_primary: '+968 1234 5678', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.' },
      online_presence: { website: 'https://acme.test' },
    },
    paymentHistory: [],
  };
}

/** Collect every leaf `text` string in a pdfmake content tree (recursively). */
function collectTexts(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectTexts(child, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('text' in obj) collectTexts(obj.text, out);
    for (const key of Object.keys(obj)) {
      if (key === 'text') continue;
      collectTexts(obj[key], out);
    }
  }
}

/** All text leaves across content AND footer (footer may be a callback). */
function allTexts(def: TDocumentDefinitions): string[] {
  const out: string[] = [];
  collectTexts(def.content, out);
  const footer = def.footer as
    | ((currentPage: number, pageCount: number, pageSize?: unknown) => Content)
    | Content
    | undefined;
  if (typeof footer === 'function') {
    collectTexts(footer(1, 1), out);
  } else if (footer != null) {
    collectTexts(footer, out);
  }
  return out;
}

function renderInvoice(
  data: InvoiceDocumentData,
  ctx: TranslationContext = englishCtx,
): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, ctx, null, TINY_PNG);
}

describe('invoice pilot — engine renders a complete, valid invoice', () => {
  it('produces non-empty content with header, line items, and totals', () => {
    const def = renderInvoice(makeInvoiceData());
    expect(Array.isArray(def.content)).toBe(true);
    expect((def.content as Content[]).length).toBeGreaterThan(0);

    const texts = allTexts(def);
    // Header: the document title.
    expect(texts.some((t) => t.includes('TAX INVOICE'))).toBe(true);
    // Line items: both descriptions.
    expect(texts.some((t) => t.includes('RAID-5 logical recovery'))).toBe(true);
    expect(texts.some((t) => t.includes('Donor drive sourcing'))).toBe(true);
    // Meta: the invoice number.
    expect(texts.some((t) => t.includes('INVO-0042'))).toBe(true);
  });

  it('renders line-item values matching the input (currency-formatted)', () => {
    const texts = allTexts(renderInvoice(makeInvoiceData()));
    // OMR, 3 decimals, position 'before' → "OMR 1000.000".
    expect(texts.some((t) => t.includes('OMR 1000.000'))).toBe(true); // item 1 unit price + total
    expect(texts.some((t) => t.includes('OMR 250.000'))).toBe(true); // item 2 unit price
    expect(texts.some((t) => t.includes('OMR 500.000'))).toBe(true); // item 2 line total (2 x 250)
  });

  it('computes totals (subtotal/discount/net/VAT/total) matching the input', () => {
    const texts = allTexts(renderInvoice(makeInvoiceData()));
    const joined = texts.join('');
    expect(joined).toContain('OMR 1500.000'); // subtotal
    expect(joined).toContain('OMR 100.000'); // discount
    expect(joined).toContain('OMR 1400.000'); // net (subtotal - discount)
    expect(joined).toContain('OMR 70.000'); // VAT 5% of 1400
    expect(joined).toContain('OMR 1470.000'); // grand total
  });

  it('renders the proforma vs tax title from the adapter (title precedence)', () => {
    // M5 GAP 1 (closed): the adapter computes the proforma/tax title from
    // invoice_type (the source of truth), and the header section renderer now
    // PREFERS `data.documentTitle` over the config's static label. So with the
    // built-in 'invoice' config — whose `labels.documentTitle` is the static
    // "TAX INVOICE" — a proforma invoice still renders "PROFORMA INVOICE".

    // Adapter contract still holds...
    const taxData = toEngineData(makeInvoiceData(), BUILT_IN_TEMPLATE_CONFIGS.invoice);
    expect(taxData.documentTitle.en).toBe('TAX INVOICE');
    expect(taxData.documentTitle.ar).toBe('فاتورة ضريبية');

    const proformaData = toEngineData(
      makeInvoiceData({ invoice_type: 'proforma' }),
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
    );
    expect(proformaData.documentTitle.en).toBe('PROFORMA INVOICE');
    expect(proformaData.documentTitle.ar).toBe('فاتورة مبدئية');

    // ...and the RENDERED output now reflects it (the precedence fix). A tax
    // invoice renders "TAX INVOICE"; a proforma renders "PROFORMA INVOICE" and
    // never the config's static "TAX INVOICE".
    const taxTexts = allTexts(renderInvoice(makeInvoiceData()));
    expect(taxTexts.some((t) => t.includes('TAX INVOICE'))).toBe(true);

    const proformaTexts = allTexts(renderInvoice(makeInvoiceData({ invoice_type: 'proforma' })));
    expect(proformaTexts.some((t) => t.includes('PROFORMA INVOICE'))).toBe(true);
    expect(proformaTexts.some((t) => t.includes('TAX INVOICE'))).toBe(false);
  });

  it('surfaces the Arabic title in bilingual mode (null-Arabic-title guard)', () => {
    // Drive the config into bilingual side-by-side so renderers emit Arabic.
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'bilingual_sidebyside', primary: 'ar' },
    });
    const data = makeInvoiceData();
    const engineData = toEngineData(data, config);
    const def = renderTemplate(config, engineData, bilingualCtx, null, TINY_PNG);
    const texts = allTexts(def);
    // The built-in invoice config carries the Arabic tax-invoice title.
    expect(texts.some((t) => t.includes('فاتورة ضريبية'))).toBe(true);
  });
});

describe('isPdfEngineEnabled — defaults OFF', () => {
  it("returns false for 'invoice' when the env flag is unset", () => {
    // The test env does not set VITE_PDF_ENGINE_INVOICE, so the legacy path
    // must be the default. This is the production-safety guard.
    expect(isPdfEngineEnabled('invoice')).toBe(false);
  });

  it('returns false for an unknown document type', () => {
    expect(isPdfEngineEnabled('quote')).toBe(false);
    expect(isPdfEngineEnabled('not_a_real_type')).toBe(false);
  });
});
