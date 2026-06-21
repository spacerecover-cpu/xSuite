import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/caseLabelAdapter';
import { renderTemplate } from './renderTemplate';
import { buildCaseLabelDocument } from '../documents/CaseLabelDocument';
import type { TranslationContext, ReceiptData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';

// ---------------------------------------------------------------------------
// Case-label ENGINE ↔ LEGACY parity.
//
// Renders a representative CASE LABEL BOTH ways — the legacy hand-written
// `buildCaseLabelDocument(...)` and the config-driven engine (toEngineData →
// renderTemplate) — and asserts CONTENT equivalence (not byte-identical
// layout): the large case number, the priority text, the received date, and the
// device summary (primary device brand/model + a "+N more" line). The legacy
// label uses a fixed small page geometry with no footer; the engine label uses
// the LABEL_PAPER config with a repeating footer — so we assert content, not
// page size.
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
 * Representative label job: CASE-0042 (Critical priority), customer Jane Client,
 * a primary HDD plus a second device (so the "+N more" summary line renders).
 */
function makeReceiptData(overrides?: Partial<ReceiptData['caseData']>): ReceiptData {
  return {
    caseData: {
      id: 'case-label-parity',
      case_no: 'CASE-0042',
      case_number: 'CASE-0042',
      created_at: '2026-06-13T14:05:00Z',
      status: 'in_progress',
      priority: 'Critical',
      contact_name: 'Jane Client',
      contact_phone: '+971 50 123 4567',
      customer: {
        id: 'cust-1',
        customer_name: 'Jane Client',
        mobile_number: '+971 50 123 4567',
      },
      company: { id: 'co-1', company_name: 'Client Holdings LLC' },
      service_type: { id: 'svc-1', name: 'Logical Recovery' },
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
      {
        id: 'dev-2',
        device_type: 'SSD',
        brand: 'Samsung',
        model: '870 EVO',
        serial_number: 'SN-BBB-222',
        capacity: '500',
        role: 'donor',
      },
    ],
    companySettings: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Dubai', country: 'United Arab Emirates' },
      contact_info: { phone_primary: '+971 4 123 4567', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.', qr_code_label_caption: 'Scan to track' },
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

function renderEngine(data: ReceiptData): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.case_label;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, englishCtx, TINY_PNG, TINY_PNG);
}

describe('case label parity — engine output matches the legacy builder', () => {
  it('renders the large case number in both', () => {
    const data = makeReceiptData();
    const legacy = allTexts(buildCaseLabelDocument(data, englishCtx, TINY_PNG, TINY_PNG));
    const engine = allTexts(renderEngine(data));
    expect(legacy.some((t) => t.includes('CASE-0042'))).toBe(true);
    expect(engine.some((t) => t.includes('CASE-0042'))).toBe(true);
  });

  it('renders the priority text in both', () => {
    const data = makeReceiptData();
    const legacy = allTexts(buildCaseLabelDocument(data, englishCtx, TINY_PNG, TINY_PNG)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    // The legacy header badge upper-cases the priority; the engine badge does the
    // same (renderCaseLabel uppercases the raw priority string).
    expect(legacy).toContain('CRITICAL');
    expect(engine).toContain('CRITICAL');
  });

  it('renders the received date in both', () => {
    const data = makeReceiptData();
    const legacy = allTexts(buildCaseLabelDocument(data, englishCtx, TINY_PNG, TINY_PNG)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    // created_at 2026-06-13 → "13/06/2026" in both (dd/MM/yyyy).
    expect(legacy).toContain('13/06/2026');
    expect(engine).toContain('13/06/2026');
  });

  it('renders the device summary (primary device + "+N more") in the engine', () => {
    const data = makeReceiptData();
    const engine = allTexts(renderEngine(data));
    const joined = engine.join('|');
    // Primary device brand + model surface on the focal device line.
    expect(joined).toContain('Seagate');
    expect(joined).toContain('Barracuda');
    // The second device is summarized as "+ 1 more device(s)".
    expect(joined).toContain('+ 1 more device(s)');
  });

  it('renders the device summary primary brand/model in the legacy builder too', () => {
    const data = makeReceiptData();
    const legacy = allTexts(buildCaseLabelDocument(data, englishCtx, TINY_PNG, TINY_PNG)).join('|');
    expect(legacy).toContain('Seagate');
    expect(legacy).toContain('Barracuda');
    expect(legacy).toContain('more device(s)');
  });

  it('emits a repeating page-footer callback (tagline + website) on the engine label', () => {
    const def = renderEngine(makeReceiptData());
    expect(typeof def.footer).toBe('function');
    const footerFn = def.footer as (cp: number, pc: number) => Content;
    const footerTexts: string[] = [];
    collectTexts(footerFn(1, 1), footerTexts);
    expect(footerTexts.some((t) => t.includes('Recovered. Verified. Delivered.'))).toBe(true);
    expect(footerTexts.some((t) => t.includes('https://acme.test'))).toBe(true);
  });

  it('omits the device summary when the case has no devices', () => {
    const data = makeReceiptData();
    data.devices = [];
    const engine = allTexts(renderEngine(data)).join('|');
    // Still shows the case number, but no "more device(s)" line.
    expect(engine).toContain('CASE-0042');
    expect(engine).not.toContain('more device(s)');
  });
});
