import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/quoteAdapter';
import { renderTemplate } from './renderTemplate';
import { buildQuoteDocument } from '../documents/QuoteDocument';
import type { TranslationContext, QuoteDocumentData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';

// ---------------------------------------------------------------------------
// Quote ENGINE ↔ LEGACY parity.
//
// Renders a representative quote BOTH ways — the legacy hand-written
// `buildQuoteDocument(...)` and the config-driven engine
// (toEngineData → renderTemplate) — and asserts CONTENT/STRUCTURAL equivalence
// (not byte-identical): bilingual document title, every line-item row + value,
// subtotal/discount/net/VAT/total, customer, terms/notes + bank box, and a
// repeating page-footer callback.
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
 * Representative quote WITH an amount discount, 5% VAT, a bank box, terms and
 * notes. Currency AED, 2 decimals, position 'after' → "1500.00 AED".
 * Math (mirrors the legacy builder, discount_type 'amount'):
 *   subtotal 1500.00, discount 100.00 → net 1400.00, VAT 5% = 70.00,
 *   total 1470.00.
 */
function makeQuoteData(
  overrides?: Partial<QuoteDocumentData['quoteData']>,
): QuoteDocumentData {
  return {
    quoteData: {
      id: 'quote-parity',
      quote_number: 'QUO-2026-0042',
      status: 'sent',
      title: 'RAID recovery quotation',
      valid_until: '2026-07-13',
      client_reference: 'PO-9001',
      subtotal: 1500,
      tax_rate: 5,
      tax_amount: 70,
      discount_amount: 100,
      discount_type: 'amount',
      total_amount: 1470,
      terms_and_conditions: 'Quote valid for 30 days. 50% advance required to begin.',
      notes: 'Diagnostics are non-destructive.',
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
      quote_items: [
        { description: 'RAID-5 logical recovery', quantity: 1, unit_price: 1000 },
        { description: 'Donor drive sourcing', quantity: 2, unit_price: 250 },
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

/** Render the quote via the legacy hand-written builder (the reference). */
function renderLegacy(
  data: QuoteDocumentData,
  ctx: TranslationContext = englishCtx,
): TDocumentDefinitions {
  return buildQuoteDocument(data, ctx, null, TINY_PNG, 'Scan to approve this quote');
}

/** Render the quote via the config-driven engine. */
function renderEngine(
  data: QuoteDocumentData,
  ctx: TranslationContext = englishCtx,
): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.quote;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, ctx, null, TINY_PNG);
}

describe('quote parity — engine output matches the legacy builder', () => {
  it('renders the QUOTATION title in both (single language)', () => {
    const data = makeQuoteData();
    const legacy = allTexts(renderLegacy(data));
    const engine = allTexts(renderEngine(data));
    expect(legacy.some((t) => t.includes('QUOTATION'))).toBe(true);
    expect(engine.some((t) => t.includes('QUOTATION'))).toBe(true);
  });

  it('renders the bilingual QUOTATION title in both', () => {
    const data = makeQuoteData();
    const legacyJoined = allTexts(renderLegacy(data, bilingualCtx)).join('|');
    // Engine reads bilingual from config language mode, not ctx — assert the
    // engine emits the Arabic title from config.
    const config = BUILT_IN_TEMPLATE_CONFIGS.quote;
    const bilingualConfig = {
      ...config,
      language: { mode: 'bilingual_stacked' as const, primary: 'en' as const },
    };
    const engineData = toEngineData(data, bilingualConfig);
    const engineJoined = allTexts(
      renderTemplate(bilingualConfig, engineData, bilingualCtx, null, TINY_PNG),
    ).join('|');

    expect(legacyJoined).toContain('عرض أسعار');
    expect(engineJoined).toContain('عرض أسعار');
    expect(engineJoined).toContain('QUOTATION');
  });

  it('renders every line-item row + value in both', () => {
    const data = makeQuoteData();
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
    const data = makeQuoteData();
    const engineJoined = allTexts(renderEngine(data)).join('|');
    const legacyJoined = allTexts(renderLegacy(data)).join('|');

    for (const val of ['1500.00 AED', '100.00 AED', '1400.00 AED', '70.00 AED', '1470.00 AED']) {
      expect(legacyJoined).toContain(val);
      expect(engineJoined).toContain(val);
    }
  });

  it('handles a percentage discount the same way the legacy builder does', () => {
    // 10% of 1500 = 150 discount → net 1350, VAT 5% = 67.50, total 1417.50.
    const data = makeQuoteData({
      discount_type: 'percentage',
      discount_amount: 10,
      tax_amount: 67.5,
      total_amount: 1417.5,
    });
    const engineJoined = allTexts(renderEngine(data)).join('|');
    const legacyJoined = allTexts(renderLegacy(data)).join('|');

    for (const val of ['150.00 AED', '1350.00 AED', '67.50 AED', '1417.50 AED']) {
      expect(legacyJoined).toContain(val);
      expect(engineJoined).toContain(val);
    }
  });

  it('renders the customer block in both', () => {
    const data = makeQuoteData();
    const engine = allTexts(renderEngine(data));
    const legacy = allTexts(renderLegacy(data));

    for (const probe of ['Jane Client', 'jane@client.test', '+971 50 123 4567', 'QUO-2026-0042']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('renders the validity (valid_until) in the meta of both', () => {
    const data = makeQuoteData();
    const engine = allTexts(renderEngine(data)).join('|');
    const legacy = allTexts(renderLegacy(data)).join('|');
    // 2026-07-13 → "13 Jul 2026" via dd MMM yyyy.
    expect(legacy).toContain('13 Jul 2026');
    expect(engine).toContain('13 Jul 2026');
  });

  it('renders config Terms + Notes and the bank box (terms are per-template, not per-record)', () => {
    const data = makeQuoteData();
    // T&C is now OWNED BY THE TEMPLATE (config.termsContent), a deliberate
    // divergence from the legacy builder's per-record quote.terms_and_conditions.
    const config = {
      ...BUILT_IN_TEMPLATE_CONFIGS.quote,
      termsContent: {
        terms: { en: 'Quote valid for 30 days. 50% advance required to begin.' },
        notes: { en: 'Diagnostics are non-destructive.' },
      },
    };
    const engineData = toEngineData(data, config);
    const engine = allTexts(renderTemplate(config, engineData, englishCtx, null, TINY_PNG));

    for (const probe of [
      'Quote valid for 30 days. 50% advance required to begin.',
      'Diagnostics are non-destructive.',
    ]) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Bank box detail rows (folded into the terms row) — still parity with legacy.
    for (const probe of ['Acme Data Recovery LLC', 'First National Bank', 'AE12 0000 0000 0123 4567 89', 'FNBKAEXX']) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('emits a repeating page-footer callback (gap — page footer)', () => {
    const def = renderEngine(makeQuoteData());
    expect(typeof def.footer).toBe('function');

    const legacy = renderLegacy(makeQuoteData());
    expect(typeof legacy.footer).toBe('function');

    const footerFn = def.footer as (cp: number, pc: number) => Content;
    const footerTexts: string[] = [];
    collectTexts(footerFn(1, 1), footerTexts);
    expect(footerTexts.some((t) => t.includes('Recovered. Verified. Delivered.'))).toBe(true);
    expect(footerTexts.some((t) => t.includes('https://acme.test'))).toBe(true);
  });
});
