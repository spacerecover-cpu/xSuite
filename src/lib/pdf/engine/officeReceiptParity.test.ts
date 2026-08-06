import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData, type ReceiptVariant } from './adapters/receiptAdapter';
import { renderTemplate } from './renderTemplate';
import { buildOfficeReceiptDocument } from '../documents/OfficeReceiptDocument';
import { buildCustomerCopyDocument } from '../documents/CustomerCopyDocument';
import type { TranslationContext, ReceiptData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';

// ---------------------------------------------------------------------------
// Office-receipt / customer-copy ENGINE ↔ LEGACY parity.
//
// Renders a representative INTAKE document BOTH ways — the legacy hand-written
// `buildOfficeReceiptDocument(...)` / `buildCustomerCopyDocument(...)` and the
// config-driven engine (toEngineData → renderTemplate) — and asserts CONTENT
// equivalence (not byte-identical layout): document title, company identity,
// the case-info rows (case no, service, priority), every device row (type /
// brand / capacity / serial / role), the legal-terms/consent text, and a
// repeating page-footer callback (tagline + website).
//
// The legacy builders are the reference and MUST stay untouched. All inputs are
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
 * Representative intake job: two devices received against CASE-0007, customer
 * Jane Client, a HDD (patient role) and an SSD (donor role).
 */
function makeReceiptData(overrides?: Partial<ReceiptData['caseData']>): ReceiptData {
  return {
    caseData: {
      id: 'case-parity',
      case_no: 'CASE-0007',
      case_number: 'CASE-0007',
      created_at: '2026-06-13T09:30:00Z',
      status: 'received',
      priority: 'High',
      problem_description: 'Drive not detected by BIOS.',
      contact_name: 'Jane Client',
      contact_phone: '+971 50 123 4567',
      contact_email: 'jane@client.test',
      client_reference: 'PO-9001',
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
        device_problem: 'Clicking noise on spin-up.',
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

function renderEngine(
  data: ReceiptData,
  docType: 'office_receipt' | 'customer_copy',
  variant: ReceiptVariant,
): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS[docType];
  const engineData = toEngineData(data, config, variant);
  return renderTemplate(config, engineData, englishCtx, null, TINY_PNG);
}

describe('office receipt parity — engine output matches the legacy builder', () => {
  it('renders the DEVICE CHECK-IN RECEIPT title in both', () => {
    const data = makeReceiptData();
    const legacy = allTexts(
      buildOfficeReceiptDocument(data, englishCtx, null, TINY_PNG, 'Scan for more information'),
    );
    const engine = allTexts(renderEngine(data, 'office_receipt', 'office'));
    expect(legacy.some((t) => t.includes('DEVICE CHECK-IN RECEIPT'))).toBe(true);
    expect(engine.some((t) => t.includes('DEVICE CHECK-IN RECEIPT'))).toBe(true);
  });

  it('renders company identity in both', () => {
    const data = makeReceiptData();
    const legacy = allTexts(
      buildOfficeReceiptDocument(data, englishCtx, null, TINY_PNG, 'Scan for more information'),
    );
    const engine = allTexts(renderEngine(data, 'office_receipt', 'office'));
    expect(legacy.some((t) => t.includes('Acme Data Recovery LLC'))).toBe(true);
    expect(engine.some((t) => t.includes('Acme Data Recovery LLC'))).toBe(true);
  });

  it('renders the case-info rows (case no / service / priority) in both', () => {
    const data = makeReceiptData();
    const legacy = allTexts(
      buildOfficeReceiptDocument(data, englishCtx, null, TINY_PNG, 'Scan for more information'),
    );
    const engine = allTexts(renderEngine(data, 'office_receipt', 'office'));
    for (const probe of ['CASE-0007', 'Logical Recovery', 'High']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('renders every device row (type / brand / serial / capacity / role) in both', () => {
    const data = makeReceiptData();
    const legacy = allTexts(
      buildOfficeReceiptDocument(data, englishCtx, null, TINY_PNG, 'Scan for more information'),
    );
    const engine = allTexts(renderEngine(data, 'office_receipt', 'office'));
    // Device descriptive cells.
    for (const probe of ['HDD', 'Seagate', 'SN-AAA-111', 'SSD', 'Samsung', 'SN-BBB-222']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Capacity formatting (2000 → "2.0 TB", 500 → "500 GB") matches the builder.
    const legacyJoined = legacy.join('|');
    const engineJoined = engine.join('|');
    expect(legacyJoined).toContain('2.0 TB');
    expect(engineJoined).toContain('2.0 TB');
    expect(legacyJoined).toContain('500 GB');
    expect(engineJoined).toContain('500 GB');
    // Role badges (Patient / Donor) render in both.
    for (const role of ['Patient', 'Donor']) {
      expect(legacy.some((t) => t.includes(role))).toBe(true);
      expect(engine.some((t) => t.includes(role))).toBe(true);
    }
  });

  it('renders the office consent / Terms & Conditions box', () => {
    const data = makeReceiptData();
    const engine = allTexts(renderEngine(data, 'office_receipt', 'office'));
    expect(engine.some((t) => t.includes('Terms & Conditions'))).toBe(true);
    expect(engine.some((t) => t.includes('I authorize the company to proceed'))).toBe(true);
    // Policy link surfaces.
    expect(engine.some((t) => t.includes('https://acme.test/terms'))).toBe(true);
  });

  it('emits a repeating page-footer callback (tagline + website)', () => {
    const def = renderEngine(makeReceiptData(), 'office_receipt', 'office');
    expect(typeof def.footer).toBe('function');

    const legacy = buildOfficeReceiptDocument(makeReceiptData(), englishCtx, null, TINY_PNG, 'Scan');
    expect(typeof legacy.footer).toBe('function');

    const footerFn = def.footer as (cp: number, pc: number) => Content;
    const footerTexts: string[] = [];
    collectTexts(footerFn(1, 1), footerTexts);
    expect(footerTexts.some((t) => t.includes('Recovered. Verified. Delivered.'))).toBe(true);
    expect(footerTexts.some((t) => t.includes('https://acme.test'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Depositor handover block — CONFIG WIRING regression guard.
//
// `receiptAdapter.toEngineData` building a `collector` block is NOT enough to
// put it on the page: `renderTemplate` only renders section keys the CONFIG
// lists, so an intake config without `section('collector', …)` silently throws
// the depositor away (built, never rendered — no error, no blank box). These
// tests fail if `intakeSections()` in `templateConfig.ts` stops listing a
// visible `collector` section for either intake doc type.
// ---------------------------------------------------------------------------

const INTAKE_DOC_TYPES: Array<['office_receipt' | 'customer_copy', ReceiptVariant]> = [
  ['office_receipt', 'office'],
  ['customer_copy', 'customer'],
];

/** The same intake job, handed over at the counter by a named courier. */
function makeReceiptDataWithDepositor(): ReceiptData {
  const data = makeReceiptData();
  return {
    ...data,
    devices: data.devices.map((d) => ({
      ...d,
      received_at: '2026-06-13T09:30:00Z',
      depositor_name: 'Sam Okafor',
      depositor_relationship: 'courier',
      depositor_id: 'P1234567',
      depositor_mobile: '+971 55 111 2222',
    })),
  };
}

describe('depositor handover block reaches the intake page', () => {
  it.each(INTAKE_DOC_TYPES)('%s config lists a visible collector section', (docType) => {
    const collector = BUILT_IN_TEMPLATE_CONFIGS[docType].sections.find((s) => s.key === 'collector');
    expect(collector, `${docType} config must list a collector section`).toBeDefined();
    expect(collector?.visible).toBe(true);
  });

  it.each(INTAKE_DOC_TYPES)('%s prints the depositor identity', (docType, variant) => {
    const texts = allTexts(renderEngine(makeReceiptDataWithDepositor(), docType, variant));
    const joined = texts.join('|');

    // The box itself, then every depositor field the adapter emits.
    expect(joined).toContain('Handover Information');
    expect(joined).toContain('Sam Okafor — on behalf of Jane Client');
    expect(joined).toContain('Courier');
    expect(joined).toContain('P1234567');
    expect(joined).toContain('+971 55 111 2222');
  });

  it.each(INTAKE_DOC_TYPES)('%s reads "Delivered by customer" for a self drop-off', (docType, variant) => {
    const data = makeReceiptDataWithDepositor();
    const selfDropOff: ReceiptData = {
      ...data,
      devices: data.devices.map((d) => ({
        ...d,
        depositor_name: 'Jane Client',
        depositor_relationship: 'self',
        depositor_id: undefined,
        depositor_mobile: undefined,
      })),
    };
    const joined = allTexts(renderEngine(selfDropOff, docType, variant)).join('|');
    expect(joined).toContain('Handover Information');
    expect(joined).toContain('Delivered by customer');
  });

  // Negative control: proves the assertions above track the DEPOSITOR DATA and
  // are not just matching a title the template prints unconditionally.
  it.each(INTAKE_DOC_TYPES)('%s omits the box when no depositor was recorded', (docType, variant) => {
    const joined = allTexts(renderEngine(makeReceiptData(), docType, variant)).join('|');
    expect(joined).not.toContain('Handover Information');
  });
});

describe('customer copy parity — engine output matches the legacy builder', () => {
  it('renders the title + customer acknowledgement (variant-specific consent)', () => {
    const data = makeReceiptData();
    const legacy = allTexts(
      buildCustomerCopyDocument(data, englishCtx, null, TINY_PNG, 'Scan for more information'),
    );
    const engine = allTexts(renderEngine(data, 'customer_copy', 'customer'));

    expect(legacy.some((t) => t.includes('DEVICE CHECK-IN RECEIPT'))).toBe(true);
    expect(engine.some((t) => t.includes('DEVICE CHECK-IN RECEIPT'))).toBe(true);

    // The customer variant interpolates the legal name into the consent body
    // (parity with the legacy customer-copy acknowledgement).
    expect(legacy.some((t) => t.includes('authorize Acme Data Recovery LLC'))).toBe(true);
    expect(engine.some((t) => t.includes('authorize Acme Data Recovery LLC'))).toBe(true);
  });

  it('renders the device rows + company identity in the customer variant', () => {
    const data = makeReceiptData();
    const engine = allTexts(renderEngine(data, 'customer_copy', 'customer'));
    for (const probe of ['Acme Data Recovery LLC', 'CASE-0007', 'HDD', 'Seagate', 'SN-AAA-111']) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });
});
