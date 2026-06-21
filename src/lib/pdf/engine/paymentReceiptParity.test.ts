import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/paymentReceiptAdapter';
import { renderTemplate } from './renderTemplate';
import { buildPaymentReceiptDocument } from '../documents/PaymentReceiptDocument';
import type { TranslationContext, PaymentReceiptDocumentData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';

// ---------------------------------------------------------------------------
// Payment Receipt ENGINE ↔ LEGACY parity.
//
// Renders a representative payment receipt BOTH ways — the legacy hand-written
// `buildPaymentReceiptDocument(...)` and the config-driven engine
// (toEngineData → renderTemplate) — and asserts CONTENT equivalence (not
// byte-identical layout): bilingual document title, the prominent amount value +
// "Amount Paid" label, meta rows (receipt no, date, method, reference, invoice
// no, job id), customer block, bank box + notes, and a page-footer callback.
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

const bilingualCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: true,
  languageCode: 'ar',
  fontFamily: 'Roboto',
};

/** A 1×1 transparent PNG so the QR/footer image branches execute. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Representative payment receipt: 470.00 AED received against an invoice, by
 * bank transfer, with notes and a bank box. Currency AED, 2 decimals, position
 * 'after' → "470.00 AED".
 */
function makeReceiptData(
  overrides?: Partial<PaymentReceiptDocumentData['paymentData']>,
): PaymentReceiptDocumentData {
  return {
    paymentData: {
      id: 'pay-parity',
      receipt_number: 'RCPT-2026-0042',
      payment_date: '2026-06-14',
      amount: 470,
      payment_method: 'Bank Transfer',
      reference_number: 'TRX-1001',
      notes: 'Partial payment received with thanks.',
      created_at: '2026-06-14T00:00:00Z',
      invoice: {
        id: 'inv-1',
        invoice_number: 'INV-2026-0042',
        total_amount: 1470,
        invoice_type: 'tax_invoice',
      },
      customer: {
        id: 'cust-1',
        customer_name: 'Jane Client',
        email: 'jane@client.test',
        mobile_number: '+971 50 123 4567',
      },
      cases: {
        id: 'case-1',
        case_no: 'CASE-0007',
      },
      created_by_profile: {
        id: 'prof-1',
        full_name: 'Alex Accounts',
      },
      bank_accounts: {
        id: 'bank-1',
        account_name: 'Acme Data Recovery LLC',
        bank_name: 'First National Bank',
        account_number: '0123456789',
        iban: 'AE12 0000 0000 0123 4567 89',
        swift_code: 'FNBKAEXX',
      },
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

/** Render the receipt via the legacy hand-written builder (the reference). */
function renderLegacy(
  data: PaymentReceiptDocumentData,
  ctx: TranslationContext = englishCtx,
): TDocumentDefinitions {
  return buildPaymentReceiptDocument(data, ctx, null, TINY_PNG, 'Scan to verify this receipt');
}

/** Render the receipt via the config-driven engine. */
function renderEngine(
  data: PaymentReceiptDocumentData,
  ctx: TranslationContext = englishCtx,
): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.payment_receipt;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, ctx, null, TINY_PNG);
}

describe('payment receipt parity — engine output matches the legacy builder', () => {
  it('renders the PAYMENT RECEIPT title in both (single language)', () => {
    const data = makeReceiptData();
    const legacy = allTexts(renderLegacy(data));
    const engine = allTexts(renderEngine(data));
    expect(legacy.some((t) => t.includes('PAYMENT RECEIPT'))).toBe(true);
    expect(engine.some((t) => t.includes('PAYMENT RECEIPT'))).toBe(true);
  });

  it('renders the bilingual PAYMENT RECEIPT title in both', () => {
    const data = makeReceiptData();
    const legacyJoined = allTexts(renderLegacy(data, bilingualCtx)).join('|');

    const config = BUILT_IN_TEMPLATE_CONFIGS.payment_receipt;
    const bilingualConfig = {
      ...config,
      language: { mode: 'bilingual_stacked' as const, primary: 'en' as const },
    };
    const engineData = toEngineData(data, bilingualConfig);
    const engineJoined = allTexts(
      renderTemplate(bilingualConfig, engineData, bilingualCtx, null, TINY_PNG),
    ).join('|');

    expect(legacyJoined).toContain('إيصال الدفع');
    expect(engineJoined).toContain('إيصال الدفع');
    expect(engineJoined).toContain('PAYMENT RECEIPT');
  });

  it('renders the prominent amount + Amount Paid label in both', () => {
    const data = makeReceiptData();
    const engine = allTexts(renderEngine(data));
    const legacy = allTexts(renderLegacy(data));

    expect(legacy.some((t) => t.includes('470.00 AED'))).toBe(true);
    expect(engine.some((t) => t.includes('470.00 AED'))).toBe(true);
    expect(legacy.some((t) => t.includes('Amount Paid'))).toBe(true);
    expect(engine.some((t) => t.includes('Amount Paid'))).toBe(true);
  });

  it('renders the meta rows (receipt no, date, method, reference, invoice, job) in both', () => {
    const data = makeReceiptData();
    const engine = allTexts(renderEngine(data));
    const legacy = allTexts(renderLegacy(data));

    for (const probe of ['RCPT-2026-0042', 'Bank Transfer', 'TRX-1001', 'INV-2026-0042', 'CASE-0007']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Payment date 2026-06-14 → "14 Jun 2026" (dd MMM yyyy).
    expect(allTexts(renderEngine(data)).join('|')).toContain('14 Jun 2026');
    expect(allTexts(renderLegacy(data)).join('|')).toContain('14 Jun 2026');
  });

  it('renders the customer block in both', () => {
    const data = makeReceiptData();
    const engine = allTexts(renderEngine(data));
    const legacy = allTexts(renderLegacy(data));

    for (const probe of ['Jane Client', 'jane@client.test', '+971 50 123 4567']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('renders the per-record notes as their own section, alongside the standard template notes + bank box', () => {
    const data = makeReceiptData();
    // Standard (Studio) notes and per-record notes are now INDEPENDENT sections:
    // both render — the per-record notes no longer override the template.
    const config = {
      ...BUILT_IN_TEMPLATE_CONFIGS.payment_receipt,
      termsContent: { notes: { en: 'TEMPLATE STANDARD NOTES' } },
    };
    const engineData = toEngineData(data, config);
    const engine = allTexts(renderTemplate(config, engineData, englishCtx, null, TINY_PNG));

    expect(engine.some((t) => t.includes('Partial payment received with thanks.'))).toBe(true);
    // The standard Terms & Conditions section renders the template notes independently.
    expect(engine.some((t) => t.includes('TEMPLATE STANDARD NOTES'))).toBe(true);

    for (const probe of ['Acme Data Recovery LLC', 'First National Bank', 'AE12 0000 0000 0123 4567 89', 'FNBKAEXX']) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('emits a repeating page-footer callback', () => {
    const def = renderEngine(makeReceiptData());
    expect(typeof def.footer).toBe('function');

    const legacy = renderLegacy(makeReceiptData());
    expect(typeof legacy.footer).toBe('function');

    const footerFn = def.footer as (cp: number, pc: number) => Content;
    const footerTexts: string[] = [];
    collectTexts(footerFn(1, 1), footerTexts);
    expect(footerTexts.some((t) => t.includes('Recovered. Verified. Delivered.'))).toBe(true);
    expect(footerTexts.some((t) => t.includes('https://acme.test'))).toBe(true);
  });
});
