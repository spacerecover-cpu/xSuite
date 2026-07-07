import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData, reportConfigForSubtype } from './adapters/reportAdapter';
import { renderTemplate } from './renderTemplate';
import type { ReportData } from '../documents/ReportDocument';
import type { TranslationContext } from '../types';
import { createTranslationContext } from '../translationContext';

// ---------------------------------------------------------------------------
// Option B report rendering — STRUCTURAL smoke test (the engine intentionally
// DIVERGES from the legacy `buildReportDocument`).
//
// The report PDF was redesigned to the approved "Option B — Modern lab" design
// (navy header band, summary tiles, two-column General/Device, toned editorial
// prose sections, provable footer). It is no longer content-equivalent to the
// legacy hand-written `documents/ReportDocument.ts` builder — that builder is
// retained only as historical reference and is no longer the engine's reference.
// So the previous engine ≡ legacy parity assertions no longer hold; this suite
// instead asserts the engine produces the expected Option B structure for a
// representative sample of the 8 subtypes.
//
// All inputs are synthetic — no DB, no font loading.
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/** A 1×1 transparent PNG so the logo/footer image branches execute. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * A representative report for CASE-0042. `report_type`, `sections`, and
 * `recoverability` are overridden per subtype in the tests below.
 */
function makeData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    report: {
      id: 'rpt-1',
      case_id: 'case-1',
      report_number: 'REP-0007',
      report_type: 'evaluation',
      title: 'Evaluation',
      status: 'approved',
      version_number: 1,
      created_at: '2026-06-13T09:30:00Z',
      created_by: 'user-1',
    },
    sections: [
      {
        id: 'sec-1',
        section_key: 'executive_summary',
        section_title: 'Executive Summary',
        section_content: 'Drive submitted for evaluation; physical symptoms noted.',
        section_order: 0,
      },
      {
        id: 'sec-2',
        section_key: 'initial_assessment',
        section_title: 'Initial Assessment',
        section_content: 'Visual inspection complete; PCB intact.',
        section_order: 1,
      },
      {
        id: 'sec-3',
        section_key: 'diagnostic_findings',
        section_title: 'Findings',
        section_content: '<p>Drive shows clicking; heads are degraded.</p><p>Surface scan reveals bad sectors.</p>',
        section_order: 2,
      },
      {
        id: 'sec-4',
        section_key: 'recommendations',
        section_title: 'Recommendations',
        section_content: 'Replace head stack in cleanroom and re-image.',
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
      priority: 'high',
      estimated_completion: '2026-06-20T00:00:00Z',
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
      physical_damage_notes: 'Visible scoring on platter 0.',
    },
    chainOfCustodyEvents: [],
    companySettings: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Dubai', country: 'United Arab Emirates' },
      contact_info: { phone_primary: '+971 4 123 4567', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.', qr_code_general_caption: 'Scan for more information' },
      online_presence: { website: 'https://acme.test' },
    },
    preparedByName: 'Lina Engineer',
    recoverability: 'partially_recoverable',
    ...overrides,
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
  const config = reportConfigForSubtype(data.report.report_type);
  const engineData = toEngineData(data, config, englishCtx);
  return renderTemplate(config, engineData, englishCtx, TINY_PNG, TINY_PNG);
}

describe('Option B report — universal shell', () => {
  it('renders the navy band identity + report title + Job line', () => {
    const texts = allTexts(renderEngine(makeData())).join('|');
    expect(texts).toContain('EVALUATION REPORT');
    expect(texts).toContain('Acme Data Recovery LLC');
    expect(texts).toContain('Case ID: CASE-0042');
  });

  it('renders the summary tiles incl. the recoverability CATEGORY (no percentage)', () => {
    const texts = allTexts(renderEngine(makeData())).join('|');
    expect(texts).toContain('Device');
    expect(texts).toContain('Recoverability');
    expect(texts).toContain('Partial recovery'); // category label
    expect(texts).not.toMatch(/\d+\s*%/); // never a percentage
    expect(texts).toContain('ETA');
  });

  it('renders the two-column General + Device info region', () => {
    const texts = allTexts(renderEngine(makeData())).join('|');
    expect(texts).toContain('General Details');
    expect(texts).toContain('Device Information');
    for (const probe of ['Ahmed Customer', 'ABC Trading LLC', 'ST2000DM008', '2TB', 'SN-ABC-12345']) {
      expect(texts).toContain(probe);
    }
  });

  it('renders the toned prose sections for the subtype (canonical multilingual titles)', () => {
    const texts = allTexts(renderEngine(makeData()));
    for (const probe of [
      'Executive Summary',
      'Initial Assessment',
      // Canonical section titles resolved via ctx.t in english_only mode.
      'Diagnostic Findings',
      'Drive shows clicking; heads are degraded.',
      'Proposed Solution',
      'Replace head stack in cleanroom and re-image.',
    ]) {
      expect(texts.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('renders the provable footer (confidentiality + Report ID line)', () => {
    const def = renderEngine(makeData());
    expect(typeof def.footer).toBe('function');
    const footerTexts: string[] = [];
    collectTexts((def.footer as (cp: number, pc: number) => Content)(1, 1), footerTexts);
    const joined = footerTexts.join('|');
    expect(joined).toContain('confidential');
    expect(joined).toContain('Report ID: REP-0007');
    expect(joined).toContain('All rights reserved');
  });
});

describe('Option B report — per-subtype coverage (all 8)', () => {
  const SUBTYPES: Array<{ type: string; title: string }> = [
    { type: 'evaluation', title: 'EVALUATION REPORT' },
    { type: 'service', title: 'SERVICE REPORT' },
    { type: 'server', title: 'SERVER RECOVERY REPORT' },
    { type: 'malware', title: 'MALWARE ANALYSIS REPORT' },
    { type: 'forensic', title: 'FORENSIC ANALYSIS REPORT' },
    { type: 'data_destruction', title: 'DATA DESTRUCTION CERTIFICATE' },
    { type: 'prevention', title: 'PREVENTION & STRATEGY REPORT' },
    { type: 'recovered_files', title: 'RECOVERED FILES REPORT' },
  ];

  it.each(SUBTYPES)('renders the $type subtype title + footer', ({ type, title }) => {
    const data = makeData({ report: { ...makeData().report, report_type: type, title: type } });
    const texts = allTexts(renderEngine(data)).join('|');
    expect(texts).toContain(title);
    expect(texts).toContain('Report ID: REP-0007');
  });

  it('prevention (advisory — no media examined) OMITS the Device column', () => {
    for (const type of ['prevention']) {
      const data = makeData({ report: { ...makeData().report, report_type: type } });
      const config = reportConfigForSubtype(type);
      const engineData = toEngineData(data, config, englishCtx);
      expect(engineData.reportInfoColumns?.device == null).toBe(true);
    }
  });

  it('device subtypes INCLUDE the Device column', () => {
    // recovered_files joined the device set in the 2026-07 taxonomy: a delivery
    // acceptance report must identify the specific device it covers.
    for (const type of ['evaluation', 'service', 'server', 'malware', 'forensic', 'data_destruction', 'recovered_files']) {
      const data = makeData({ report: { ...makeData().report, report_type: type } });
      const config = reportConfigForSubtype(type);
      const engineData = toEngineData(data, config, englishCtx);
      expect(engineData.reportInfoColumns?.device != null).toBe(true);
    }
  });

  it('forensic renders the chain-of-custody TIMELINE (not a prose box)', () => {
    const data = makeData({
      report: { ...makeData().report, report_type: 'forensic' },
      sections: [
        {
          id: 'sec-coc',
          section_key: 'chain_of_custody',
          section_title: 'Chain of Custody',
          section_content: 'PROSE_THAT_MUST_NOT_RENDER',
          section_order: 0,
        },
      ],
      chainOfCustodyEvents: [
        {
          event_type: 'device_received',
          event_date: '2026-06-12T08:05:00Z',
          event_timestamp: '2026-06-12T08:05:00Z',
          event_description: 'Drive received at intake counter.',
          actor: { full_name: 'Sam Reception' },
        },
      ],
    });
    const texts = allTexts(renderEngine(data)).join('|');
    expect(texts).toContain('Drive received at intake counter.');
    expect(texts).toContain('Sam Reception');
    expect(texts).not.toContain('PROSE_THAT_MUST_NOT_RENDER');
  });

  it('data_destruction renders operator + witness signature slots', () => {
    const data = makeData({
      report: { ...makeData().report, report_type: 'data_destruction' },
      sections: [
        {
          id: 'sec-cert',
          section_key: 'executive_summary',
          section_title: 'Executive Summary',
          section_content: 'Media securely destroyed per NIST 800-88 purge.',
          section_order: 0,
        },
      ],
    });
    const texts = allTexts(renderEngine(data)).join('|');
    expect(texts).toContain('Certificate of Destruction');
    expect(texts).toContain('Operator');
    expect(texts).toContain('Witness');
  });

  it('omits the recoverability tile when no assessment is present', () => {
    const data = makeData({ recoverability: null });
    const config = reportConfigForSubtype('evaluation');
    const engineData = toEngineData(data, config, englishCtx);
    const captions = (engineData.reportSummary?.tiles ?? []).map((t) => t.caption.en);
    expect(captions).not.toContain('Recoverability');
  });
});

// ---------------------------------------------------------------------------
// Multilingual labels (Option B) — every report title/label now routes through
// the shared document-translation system (`ctx.t`) instead of English+Arabic-
// only hardcoded maps. In english_only mode `ctx.t(key, en)` returns the English
// canonical verbatim; in bilingual mode it returns the combined "EN | translated"
// string, so the same titles render in any of the 13 languages.
// ---------------------------------------------------------------------------

describe('Option B report — multilingual labels via ctx.t', () => {
  it('english_only: section titles + headers equal the English canonical', () => {
    const config = reportConfigForSubtype('evaluation');
    const engineData = toEngineData(makeData(), config, englishCtx);

    // Two-column header titles.
    expect(engineData.reportInfoColumns?.general.title.en).toBe('General Details');
    expect(engineData.reportInfoColumns?.device?.title.en).toBe('Device Information');

    // Summary tile captions.
    const captions = (engineData.reportSummary?.tiles ?? []).map((t) => t.caption.en);
    expect(captions).toEqual(
      expect.arrayContaining(['Device', 'Fault', 'Recoverability', 'ETA']),
    );

    // Canonical section titles (resolved via ctx.t, not the authored titles).
    const sectionTitles = (engineData.reportSections?.sections ?? []).map((s) => s.title.en);
    expect(sectionTitles).toEqual(
      expect.arrayContaining([
        'Executive Summary',
        'Initial Assessment',
        'Diagnostic Findings',
        'Proposed Solution',
      ]),
    );

    // Document title + footer confidentiality.
    expect(engineData.documentTitle.en).toBe('EVALUATION REPORT');
    expect(engineData.reportFooter?.confidentiality.en).toBe(
      'This report is confidential and intended solely for the named recipient.',
    );
  });

  it('bilingual (Arabic): titles render as combined "EN | translated" strings', () => {
    const arCtx = createTranslationContext('bilingual', 'ar');
    const config = reportConfigForSubtype('evaluation');
    const engineData = toEngineData(makeData(), config, arCtx);

    // Document title carries BOTH the English canonical and the Arabic translation.
    expect(engineData.documentTitle.en).toContain('EVALUATION REPORT');
    expect(engineData.documentTitle.en).toContain('تقرير التقييم');

    // A section title routed through ctx.t carries the Arabic translation too.
    const findings = (engineData.reportSections?.sections ?? []).find((s) =>
      s.title.en.includes('Diagnostic Findings'),
    );
    expect(findings?.title.en).toContain('النتائج التشخيصية');

    // A summary tile caption is bilingual as well.
    const recov = (engineData.reportSummary?.tiles ?? []).find((t) =>
      t.caption.en.includes('Recoverability'),
    );
    expect(recov?.caption.en).toContain('قابلية الاسترداد');
  });

  it('bilingual (French): a non-Arabic language also localizes via ctx.t', () => {
    const frCtx = createTranslationContext('bilingual', 'fr');
    const config = reportConfigForSubtype('evaluation');
    const engineData = toEngineData(makeData(), config, frCtx);

    expect(engineData.documentTitle.en).toContain("Rapport d'Évaluation");
    const general = engineData.reportInfoColumns?.general.title.en ?? '';
    expect(general).toContain('General Details');
    expect(general).toContain('Détails Généraux');
  });
});
