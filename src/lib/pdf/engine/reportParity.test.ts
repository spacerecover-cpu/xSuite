import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/reportAdapter';
import { renderTemplate } from './renderTemplate';
import { buildReportDocument, type ReportData } from '../documents/ReportDocument';
import type { TranslationContext } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';

// ---------------------------------------------------------------------------
// Case-REPORT ENGINE ↔ LEGACY parity.
//
// Renders a representative FORENSIC case report BOTH ways — the legacy
// hand-written `buildReportDocument(...)` and the config-driven engine
// (toEngineData → renderTemplate) — and asserts CONTENT equivalence (not
// byte-identical layout): the report-type document title, the case + customer +
// report meta, every dynamic prose section (title + content), the device
// diagnostics rows (HDD-aware), and every chain-of-custody timeline entry.
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
 * Representative forensic report for CASE-0042: a report-type title, the
 * customer + report meta, two dynamic prose sections (one with inline HTML to
 * prove the strip), an HDD device with component diagnostics, and three
 * chain-of-custody timeline events.
 */
function makeData(): ReportData {
  return {
    report: {
      id: 'rpt-1',
      case_id: 'case-1',
      report_number: 'REP-0007',
      report_type: 'forensic',
      title: 'Forensic Analysis',
      status: 'approved',
      version_number: 2,
      created_at: '2026-06-13T09:30:00Z',
      created_by: 'user-1',
    },
    sections: [
      {
        id: 'sec-1',
        section_key: 'diagnostic_findings',
        section_title: 'Diagnostic Findings',
        section_content: '<p>Drive shows clicking; heads are degraded.</p><p>Surface scan reveals bad sectors.</p>',
        section_order: 1,
      },
      {
        id: 'sec-2',
        section_key: 'recommendations',
        section_title: 'Recommendations',
        section_content: 'Replace head stack in cleanroom and re-image.',
        section_order: 2,
      },
      {
        // chain_of_custody section: must NOT render as a prose box — it becomes
        // the custody timeline instead. Its prose content must not leak.
        id: 'sec-3',
        section_key: 'chain_of_custody',
        section_title: 'Chain of Custody',
        section_content: 'PROSE_THAT_MUST_NOT_RENDER',
        section_order: 3,
      },
    ],
    caseData: {
      case_number: 'CASE-0042',
      case_no: 'CASE-0042',
      customer_name: 'Ahmed Customer',
      customer_email: 'ahmed@example.test',
      customer_phone: '+971 50 111 2222',
      company_name: 'ABC Trading LLC',
      client_reference: 'PO-9981',
      service_type: 'Data Recovery',
      assigned_engineer: 'Lina Engineer',
      created_at: '2026-06-12T08:00:00Z',
    },
    customerData: {
      customer_name: 'Ahmed Customer',
      email: 'ahmed@example.test',
      mobile_number: '+971 50 111 2222',
      company_name: 'ABC Trading LLC',
    },
    deviceData: {
      device_type: '3.5" HDD',
      brand: 'Seagate',
      model: 'ST2000DM008',
      capacity: '2TB',
      serial_number: 'SN-ABC-12345',
      condition: 'Physical damage',
    },
    diagnosticsData: {
      device_type_category: 'hdd',
      heads_status: 'Degraded',
      pcb_status: 'OK',
      motor_status: 'OK',
      surface_status: 'Bad sectors',
      physical_damage_notes: 'Visible scoring on platter 0.',
    },
    chainOfCustodyEvents: [
      {
        event_type: 'device_received',
        event_date: '2026-06-12T08:05:00Z',
        event_timestamp: '2026-06-12T08:05:00Z',
        event_description: 'Drive received at intake counter.',
        actor: { full_name: 'Sam Reception' },
      },
      {
        event_type: 'imaging_started',
        event_date: '2026-06-12T11:00:00Z',
        event_timestamp: '2026-06-12T11:00:00Z',
        event_description: 'Forensic image acquisition started.',
        actor: { full_name: 'Lina Engineer' },
      },
      {
        event_type: 'destructive_attempt_authorized',
        event_date: '2026-06-13T15:45:00Z',
        event_timestamp: '2026-06-13T15:45:00Z',
        event_description: 'Customer authorized destructive recovery attempt.',
        actor: { full_name: 'Omar Manager' },
      },
    ],
    companySettings: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Dubai', country: 'United Arab Emirates' },
      contact_info: { phone_primary: '+971 4 123 4567', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.', qr_code_general_caption: 'Scan for more information' },
      online_presence: { website: 'https://acme.test' },
    },
    preparedByName: 'Lina Engineer',
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

function renderEngine(data: ReportData): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.report;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, englishCtx, TINY_PNG, TINY_PNG);
}

describe('case report parity — engine output matches the legacy builder', () => {
  it('renders the report-type document title in both', () => {
    const data = makeData();
    const legacy = allTexts(buildReportDocument(data, englishCtx)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    // forensic → "FORENSIC ANALYSIS REPORT"
    expect(legacy).toContain('FORENSIC ANALYSIS REPORT');
    expect(engine).toContain('FORENSIC ANALYSIS REPORT');
  });

  it('renders the case + customer + report meta in both', () => {
    const data = makeData();
    const legacy = allTexts(buildReportDocument(data, englishCtx));
    const engine = allTexts(renderEngine(data));
    for (const probe of [
      'Ahmed Customer',
      'ABC Trading LLC',
      'ahmed@example.test',
      '+971 50 111 2222',
      'PO-9981',
      'CASE-0042',
      'REP-0007',
      'Data Recovery',
      'Lina Engineer',
    ]) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('renders every dynamic prose section (title + content) in both', () => {
    const data = makeData();
    const legacy = allTexts(buildReportDocument(data, englishCtx));
    const engine = allTexts(renderEngine(data));
    for (const probe of [
      'Diagnostic Findings',
      'Drive shows clicking; heads are degraded.',
      'Surface scan reveals bad sectors.',
      'Recommendations',
      'Replace head stack in cleanroom and re-image.',
    ]) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('does NOT render the chain_of_custody section as a prose box in either', () => {
    const data = makeData();
    const legacy = allTexts(buildReportDocument(data, englishCtx)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).not.toContain('PROSE_THAT_MUST_NOT_RENDER');
    expect(engine).not.toContain('PROSE_THAT_MUST_NOT_RENDER');
  });

  it('renders the device diagnostics rows (HDD-aware) in both', () => {
    const data = makeData();
    const legacy = allTexts(buildReportDocument(data, englishCtx)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    // Device identity + HDD component statuses + physical-damage notes.
    for (const probe of [
      '3.5" HDD',
      'ST2000DM008',
      '2TB',
      'SN-ABC-12345',
      'Degraded',
      'Bad sectors',
      'Visible scoring on platter 0.',
    ]) {
      expect(legacy).toContain(probe);
      expect(engine).toContain(probe);
    }
  });

  it('renders every chain-of-custody timeline entry in both', () => {
    const data = makeData();
    const legacy = allTexts(buildReportDocument(data, englishCtx));
    const engine = allTexts(renderEngine(data));
    for (const probe of [
      'Drive received at intake counter.',
      'Forensic image acquisition started.',
      'Customer authorized destructive recovery attempt.',
      'Sam Reception',
      'Omar Manager',
    ]) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('emits a footer on the engine report (tagline + website)', () => {
    const def = renderEngine(makeData());
    expect(typeof def.footer).toBe('function');
    const footerFn = def.footer as (cp: number, pc: number) => Content;
    const footerTexts: string[] = [];
    collectTexts(footerFn(1, 1), footerTexts);
    expect(footerTexts.some((t) => t.includes('Recovered. Verified. Delivered.'))).toBe(true);
    expect(footerTexts.some((t) => t.includes('https://acme.test'))).toBe(true);
  });
});
