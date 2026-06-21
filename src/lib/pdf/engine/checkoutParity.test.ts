import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/checkoutAdapter';
import { renderTemplate } from './renderTemplate';
import { buildCheckoutFormDocument } from '../documents/CheckoutFormDocument';
import type { TranslationContext, ReceiptData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';

// ---------------------------------------------------------------------------
// Checkout-form ENGINE ↔ LEGACY parity.
//
// Renders a representative CHECKOUT / RETURN document BOTH ways — the legacy
// hand-written `buildCheckoutFormDocument(...)` and the config-driven engine
// (toEngineData → renderTemplate) — and asserts CONTENT equivalence (not
// byte-identical layout): document title, company identity, case-info rows,
// every device row, the COLLECTOR block (name / mobile / national ID / checkout
// date / recovery outcome), the checkout acknowledgement consent text, and a
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

/** A 1×1 transparent PNG so the QR/footer image branches execute. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Representative checkout: device returned against CASE-0007, collected by a
 * DISTINCT third party (Bob Courier) so the National-ID branch of the collector
 * block is exercised. Full recovery, checked out on 2026-06-20 14:00.
 */
function makeCheckoutData(overrides?: Partial<ReceiptData['caseData']>): ReceiptData {
  return {
    caseData: {
      id: 'case-parity',
      case_no: 'CASE-0007',
      case_number: 'CASE-0007',
      created_at: '2026-06-13T09:30:00Z',
      status: 'completed',
      priority: 'High',
      contact_name: 'Jane Client',
      contact_phone: '+971 50 123 4567',
      contact_email: 'jane@client.test',
      recovery_outcome: 'full',
      checkout_date: '2026-06-20T14:00:00Z',
      checkout_collector_name: 'Bob Courier',
      checkout_collector_mobile: '+971 55 987 6543',
      checkout_collector_id: 'ID-784-1990-1234567-1',
      checkout_notes: 'Collected on behalf of the customer.',
      customer: {
        id: 'cust-1',
        customer_name: 'Jane Client',
        email: 'jane@client.test',
        mobile_number: '+971 50 123 4567',
      },
      company: { id: 'co-1', company_name: 'Client Holdings LLC' },
      service_type: { id: 'svc-1', name: 'Logical Recovery' },
      created_by_profile: { id: 'prof-1', full_name: 'Sam Reception', email: 'sam@acme.test' },
      ...overrides,
    },
    devices: [
      {
        id: 'dev-1',
        device_type: 'HDD',
        brand: 'Seagate',
        model: 'Barracuda',
        serial_number: 'SN-AAA-111',
        capacity: '2000',
        role: 'patient',
      },
    ],
    companySettings: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Dubai', country: 'United Arab Emirates' },
      contact_info: { phone_primary: '+971 4 123 4567', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.' },
      online_presence: { website: 'https://acme.test' },
      legal_compliance: { terms_conditions_url: 'https://acme.test/terms' },
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

function renderLegacy(data: ReceiptData): TDocumentDefinitions {
  return buildCheckoutFormDocument(data, englishCtx, null, TINY_PNG, 'Scan for more information');
}

function renderEngine(data: ReceiptData): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.checkout_form;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, englishCtx, null, TINY_PNG);
}

describe('checkout form parity — engine output matches the legacy builder', () => {
  it('renders the checkout title in both', () => {
    const data = makeCheckoutData();
    const legacy = allTexts(renderLegacy(data));
    const engine = allTexts(renderEngine(data));
    // Legacy renders "DEVICE CHECKOUT FORM"; the engine renders the configured
    // "DEVICE CHECKOUT / RETURN FORM". Both unambiguously identify a checkout doc.
    expect(legacy.some((t) => t.includes('DEVICE CHECKOUT'))).toBe(true);
    expect(engine.some((t) => t.includes('DEVICE CHECKOUT'))).toBe(true);
  });

  it('renders company identity + case-info rows in both', () => {
    const data = makeCheckoutData();
    const legacy = allTexts(renderLegacy(data));
    const engine = allTexts(renderEngine(data));
    for (const probe of ['Acme Data Recovery LLC', 'CASE-0007', 'Logical Recovery']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('renders the returned device row in both', () => {
    const data = makeCheckoutData();
    const legacy = allTexts(renderLegacy(data));
    const engine = allTexts(renderEngine(data));
    for (const probe of ['HDD', 'Seagate', 'SN-AAA-111']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Capacity 2000 → "2.0 TB" and Patient role badge in both.
    expect(legacy.join('|')).toContain('2.0 TB');
    expect(engine.join('|')).toContain('2.0 TB');
    expect(legacy.some((t) => t.includes('Patient'))).toBe(true);
    expect(engine.some((t) => t.includes('Patient'))).toBe(true);
  });

  it('renders the collector block (distinct collector: name / mobile / national ID) in both', () => {
    const data = makeCheckoutData();
    const legacy = allTexts(renderLegacy(data));
    const engine = allTexts(renderEngine(data));
    for (const probe of ['Bob Courier', '+971 55 987 6543', 'ID-784-1990-1234567-1', 'Full Recovery']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Checkout date renders (dd MMM yyyy, HH:mm) identically in both. The exact
    // hour is timezone-local, so assert the date stamp + engine↔legacy agreement
    // rather than a hardcoded hour.
    expect(legacy.join('|')).toContain('20 Jun 2026,');
    expect(engine.join('|')).toContain('20 Jun 2026,');
    const dateProbe = legacy.find((t) => t.includes('20 Jun 2026,'));
    expect(dateProbe).toBeDefined();
    expect(engine.some((t) => t.includes(dateProbe as string))).toBe(true);
  });

  it('renders the collector block (collector IS customer → no National ID) in both', () => {
    // No distinct collector recorded → both fall back to the customer identity.
    const data = makeCheckoutData({
      checkout_collector_name: undefined,
      checkout_collector_mobile: undefined,
      checkout_collector_id: undefined,
    });
    const legacy = allTexts(renderLegacy(data));
    const engine = allTexts(renderEngine(data));
    // Customer name appears as the collector in both.
    expect(legacy.some((t) => t.includes('Jane Client'))).toBe(true);
    expect(engine.some((t) => t.includes('Jane Client'))).toBe(true);
    // National ID label is NOT emitted in this branch.
    expect(engine.some((t) => t.includes('National ID:'))).toBe(false);
  });

  it('renders the checkout acknowledgement consent text in both', () => {
    const data = makeCheckoutData();
    const legacy = allTexts(renderLegacy(data));
    const engine = allTexts(renderEngine(data));
    const probe = 'I confirm receipt of my device/data and acknowledge that my case has been concluded';
    expect(legacy.some((t) => t.includes(probe))).toBe(true);
    expect(engine.some((t) => t.includes(probe))).toBe(true);
    // Policy link surfaces.
    expect(engine.some((t) => t.includes('https://acme.test/terms'))).toBe(true);
  });

  it('emits a repeating page-footer callback (tagline + website)', () => {
    const def = renderEngine(makeCheckoutData());
    expect(typeof def.footer).toBe('function');

    const legacy = renderLegacy(makeCheckoutData());
    expect(typeof legacy.footer).toBe('function');

    const footerFn = def.footer as (cp: number, pc: number) => Content;
    const footerTexts: string[] = [];
    collectTexts(footerFn(1, 1), footerTexts);
    expect(footerTexts.some((t) => t.includes('Recovered. Verified. Delivered.'))).toBe(true);
    expect(footerTexts.some((t) => t.includes('https://acme.test'))).toBe(true);
  });
});
