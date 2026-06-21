import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/invoiceAdapter';
import { renderTemplate } from './renderTemplate';
import { buildInvoiceDocument } from '../documents/InvoiceDocument';
import type { TranslationContext, InvoiceDocumentData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';

// ---------------------------------------------------------------------------
// M5 invoice ENGINE ↔ LEGACY parity.
//
// Renders a representative invoice BOTH ways — the legacy hand-written
// `buildInvoiceDocument(...)` and the config-driven engine
// (toEngineData → renderTemplate) — and asserts CONTENT/STRUCTURAL equivalence
// (not byte-identical): same document title, every line-item row + value,
// subtotal/discount/VAT/total, Amount Paid + Balance Due, every payment-history
// row, and that a repeating page-footer callback exists.
//
// This pins the four M5 parity gaps closed:
//   1. title precedence (proforma renders PROFORMA, not the static TAX INVOICE)
//   2. repeating page footer (a `footer:` callback, not trailing content)
//   3. bilingual terms/notes + bank layout (Payment Terms / Notes stacks)
//   4. payment history + Amount Paid / Balance Due totals
//
// The legacy builder is the reference and MUST stay untouched. All inputs are
// synthetic — no DB, no font loading.
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/** A 1×1 transparent PNG so the QR/footer image branches execute. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Representative tax invoice WITH payment history, a discount, 5% VAT, and a
 * partial payment. Currency AED, 2 decimals, position 'after' → "1500.00 AED".
 * Numbers chosen so the math is easy to read:
 *   subtotal 1500.00, discount 100.00 → net 1400.00, VAT 5% = 70.00,
 *   total 1470.00, amount paid 470.00 → balance due 1000.00.
 */
function makeInvoiceData(
  overrides?: Partial<InvoiceDocumentData['invoiceData']>,
): InvoiceDocumentData {
  return {
    invoiceData: {
      id: 'inv-parity',
      invoice_number: 'INV-2026-0042',
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
      amount_paid: 470,
      balance_due: 1000,
      payment_terms: 'Net 14 days from the invoice date.',
      notes: 'Thank you for trusting our lab with your data recovery.',
      created_at: '2026-06-13T00:00:00Z',
      customer: {
        id: 'cust-1',
        customer_name: 'Jane Client',
        email: 'jane@client.test',
        mobile_number: '+971 50 123 4567',
      },
      cases: {
        id: 'case-1',
        case_no: 'CASE-0007',
        contact_name: 'Jane Client',
        contact_email: 'jane@client.test',
        contact_phone: '+971 50 123 4567',
      },
      bank_accounts: {
        id: 'bank-1',
        account_name: 'Acme Data Recovery LLC',
        bank_name: 'First National Bank',
        account_number: '0123456789',
        iban: 'AE12 0000 0000 0123 4567 89',
        swift_code: 'FNBKAEXX',
      },
      invoice_line_items: [
        { description: 'RAID-5 logical recovery', quantity: 1, unit_price: 1000, tax_rate: 5, line_total: 1000 },
        { description: 'Donor drive sourcing', quantity: 2, unit_price: 250, tax_rate: 5, line_total: 500 },
      ],
      accounting_locales: {
        currency_symbol: 'AED',
        currency_position: 'after',
        decimal_places: 2,
      },
      ...overrides,
    },
    companySettings: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Dubai', country: 'United Arab Emirates' },
      contact_info: { phone_primary: '+971 4 123 4567', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.' },
      online_presence: { website: 'https://acme.test' },
    },
    paymentHistory: [
      {
        payment_date: '2026-06-14',
        amount: 300,
        method: 'Bank Transfer',
        reference: 'TRX-1001',
        transaction_id: 'txn-1',
        status: 'completed',
        recorded_by: 'Alex Accounts',
        notes: null,
        doc_number: 'RCPT-0001',
        source: 'receipt',
        running_balance: 1170,
      },
      {
        payment_date: '2026-06-15',
        amount: 170,
        method: 'Cash',
        reference: 'CASH-9',
        transaction_id: 'txn-2',
        status: 'completed',
        recorded_by: 'Alex Accounts',
        notes: null,
        doc_number: 'RCPT-0002',
        source: 'receipt',
        running_balance: 1000,
      },
    ],
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

/** All text leaves across the content AND the (possibly-callback) footer. */
function allTexts(def: TDocumentDefinitions): string[] {
  const out: string[] = [];
  collectTexts(def.content, out);
  const footer = def.footer as
    | ((currentPage: number, pageCount: number, pageSize?: unknown) => Content)
    | Content
    | undefined;
  if (typeof footer === 'function') {
    collectTexts(footer(1, 1, undefined), out);
  } else if (footer != null) {
    collectTexts(footer, out);
  }
  return out;
}

/** Render the invoice via the legacy hand-written builder (the reference). */
function renderLegacy(
  data: InvoiceDocumentData,
  ctx: TranslationContext = englishCtx,
): TDocumentDefinitions {
  return buildInvoiceDocument(data, ctx, null, TINY_PNG, 'Scan to pay this invoice');
}

/** Render the invoice via the config-driven engine. */
function renderEngine(
  data: InvoiceDocumentData,
  ctx: TranslationContext = englishCtx,
): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, ctx, null, TINY_PNG);
}

describe('invoice parity — engine output matches the legacy builder', () => {
  it('renders the same document title (tax invoice)', () => {
    const data = makeInvoiceData();
    const legacy = allTexts(renderLegacy(data));
    const engine = allTexts(renderEngine(data));
    expect(legacy.some((t) => t.includes('TAX INVOICE'))).toBe(true);
    expect(engine.some((t) => t.includes('TAX INVOICE'))).toBe(true);
  });

  it('renders the proforma title in BOTH (gap 1 — title precedence)', () => {
    const data = makeInvoiceData({ invoice_type: 'proforma' });
    const legacy = allTexts(renderLegacy(data));
    const engine = allTexts(renderEngine(data));
    expect(legacy.some((t) => t.includes('PROFORMA INVOICE'))).toBe(true);
    expect(engine.some((t) => t.includes('PROFORMA INVOICE'))).toBe(true);
    // Crucially, the engine must NOT fall back to the config's static title.
    expect(engine.some((t) => t.includes('TAX INVOICE'))).toBe(false);
  });

  it('renders every line-item row + value in both', () => {
    const data = makeInvoiceData();
    const engine = allTexts(renderEngine(data));
    const legacy = allTexts(renderLegacy(data));

    for (const desc of ['RAID-5 logical recovery', 'Donor drive sourcing']) {
      expect(legacy.some((t) => t.includes(desc))).toBe(true);
      expect(engine.some((t) => t.includes(desc))).toBe(true);
    }
    // Line-item monetary values (AED, 2dp, 'after').
    for (const val of ['1000.00 AED', '250.00 AED', '500.00 AED']) {
      expect(engine.some((t) => t.includes(val))).toBe(true);
    }
  });

  it('renders subtotal / discount / net / VAT / total in both', () => {
    const data = makeInvoiceData();
    const engineJoined = allTexts(renderEngine(data)).join('|');
    const legacyJoined = allTexts(renderLegacy(data)).join('|');

    for (const val of ['1500.00 AED', '100.00 AED', '1400.00 AED', '70.00 AED', '1470.00 AED']) {
      expect(legacyJoined).toContain(val);
      expect(engineJoined).toContain(val);
    }
  });

  it('renders Amount Paid + Balance Due (gap 4 — paid/balance)', () => {
    const data = makeInvoiceData();
    const engine = allTexts(renderEngine(data));
    const legacy = allTexts(renderLegacy(data));

    // Labels present in both.
    expect(legacy.some((t) => t.includes('Amount Paid:'))).toBe(true);
    expect(engine.some((t) => t.includes('Amount Paid:'))).toBe(true);
    expect(legacy.some((t) => t.includes('Balance Due:'))).toBe(true);
    expect(engine.some((t) => t.includes('Balance Due:'))).toBe(true);

    // Values: paid 470.00, balance 1000.00.
    const engineJoined = engine.join('|');
    expect(engineJoined).toContain('470.00 AED');
    expect(engineJoined).toContain('1000.00 AED');
  });

  it('renders every payment-history row (gap 4 — payment history)', () => {
    const data = makeInvoiceData();
    const engine = allTexts(renderEngine(data));
    const legacy = allTexts(renderLegacy(data));

    // The section title + each row's document number, method, recorder, and
    // running balance must appear in both.
    for (const probe of ['Payment History', 'RCPT-0001', 'RCPT-0002', 'Bank Transfer', 'Cash', 'Alex Accounts', 'TRX-1001', 'CASH-9']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Running balances (statement-style).
    const engineJoined = engine.join('|');
    expect(engineJoined).toContain('1170.00 AED');
    expect(engineJoined).toContain('1000.00 AED');
  });

  it('omits payment history + paid/balance on a proforma (parity)', () => {
    const data = makeInvoiceData({ invoice_type: 'proforma' });
    const engine = allTexts(renderEngine(data));
    expect(engine.some((t) => t.includes('Payment History'))).toBe(false);
    expect(engine.some((t) => t.includes('Amount Paid:'))).toBe(false);
    expect(engine.some((t) => t.includes('Balance Due:'))).toBe(false);
  });

  it('renders the per-record Payment Terms + Notes (overriding the template) and the bank box', () => {
    const data = makeInvoiceData();
    // Per-record terms — what the user typed on the invoice — take precedence over
    // the template's termsContent: the record's terms render and the template's do NOT.
    const config = {
      ...BUILT_IN_TEMPLATE_CONFIGS.invoice,
      termsContent: {
        terms: { en: 'TEMPLATE TERMS — SHOULD NOT APPEAR' },
        notes: { en: 'TEMPLATE NOTES — SHOULD NOT APPEAR' },
      },
    };
    const engineData = toEngineData(data, config);
    const engine = allTexts(renderTemplate(config, engineData, englishCtx, null, TINY_PNG));

    for (const probe of ['Payment Terms', 'Notes', 'Net 14 days from the invoice date.', 'Thank you for trusting our lab with your data recovery.']) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // The template terms are suppressed because the record carries its own.
    expect(engine.some((t) => t.includes('TEMPLATE TERMS — SHOULD NOT APPEAR'))).toBe(false);
    expect(engine.some((t) => t.includes('TEMPLATE NOTES — SHOULD NOT APPEAR'))).toBe(false);
    // Bank box detail rows (folded into the terms row) — still parity with legacy.
    for (const probe of ['Acme Data Recovery LLC', 'First National Bank', 'AE12 0000 0000 0123 4567 89', 'FNBKAEXX']) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('emits a repeating page-footer callback (gap 2)', () => {
    const def = renderEngine(makeInvoiceData());
    // The engine must promote footer/qr to a pdfmake page `footer:` callback,
    // mirroring the legacy builder (whose footer is also a function).
    expect(typeof def.footer).toBe('function');

    const legacy = renderLegacy(makeInvoiceData());
    expect(typeof legacy.footer).toBe('function');

    // The page footer carries the tagline + website on every page.
    const footerFn = def.footer as (cp: number, pc: number) => Content;
    const footerTexts: string[] = [];
    collectTexts(footerFn(1, 1), footerTexts);
    expect(footerTexts.some((t) => t.includes('Recovered. Verified. Delivered.'))).toBe(true);
    expect(footerTexts.some((t) => t.includes('https://acme.test'))).toBe(true);
  });
});
