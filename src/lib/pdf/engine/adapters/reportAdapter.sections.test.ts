import { describe, it, expect } from 'vitest';
import type { Content } from 'pdfmake/interfaces';
import { toEngineData, reportConfigForSubtype, reportSubtypeSections } from './reportAdapter';
import { renderTemplate } from '../renderTemplate';
import { mapInstanceToReportData } from '../../../documentInstanceData';
import type { ReportData } from '../../documents/ReportDocument';
import type { TranslationContext } from '../../types';

const ctx = { t: (_key: string, en: string) => en } as unknown as TranslationContext;

function baseData(reportType: string, sections: ReportData['sections']): ReportData {
  return {
    report: {
      id: 'r1',
      case_id: 'c1',
      report_number: 'REP-1',
      report_type: reportType,
      title: 'Report',
      status: 'draft',
      version_number: 1,
      created_at: '2026-08-02T00:00:00Z',
    },
    sections,
    companySettings: {} as ReportData['companySettings'],
  };
}

function proseSections(data: ReportData) {
  const engine = toEngineData(data, reportConfigForSubtype(data.report.report_type), ctx);
  return engine.reportSections?.sections ?? [];
}

function row(
  key: string,
  title: string,
  content: string,
  order: number,
): ReportData['sections'][number] {
  return { id: key, section_key: key, section_title: title, section_content: content, section_order: order };
}

describe('buildReportSections (instance-driven)', () => {
  it('renders authored sections in their stored order, including custom keys', () => {
    const out = proseSections(
      baseData('evaluation', [
        row('my_custom_notes', 'Warranty Notes', 'Warranty voided on opening.', 0),
        row('recommendations', 'Proposed Solution', 'Replace the drive.', 1),
        row('executive_summary', 'Executive Summary', 'Recovered in full.', 2),
      ]),
    );
    expect(out.map((s) => s.title.en)).toEqual([
      'Warranty Notes',
      'Proposed Solution',
      'Executive Summary',
    ]);
    // custom section: neutral prose, no canonical tone
    expect(out[0].tone).toBeUndefined();
    // canonical section keeps its status tone
    expect(out[1].tone).toBe('success');
    expect(out.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('keeps a tenant-renamed title on a canonical section (tone preserved)', () => {
    const out = proseSections(
      baseData('evaluation', [row('findings', 'Lab Findings', 'Head crash.', 0)]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].title.en).toBe('Lab Findings');
    expect(out[0].tone).toBe('danger');
  });

  it('resolves the canonical multilingual title when the authored title is unrenamed or blank', () => {
    const out = proseSections(
      baseData('evaluation', [
        row('findings', 'Diagnostic Findings', 'Platter damage.', 0),
        row('diagnostic_findings', '', 'Alias-keyed legacy row.', 1),
      ]),
    );
    expect(out[0].title.en).toBe('Diagnostic Findings');
    expect(out[0].tone).toBe('danger');
    // legacy alias key maps to the same canonical section
    expect(out[1].title.en).toBe('Diagnostic Findings');
    expect(out[1].tone).toBe('danger');
  });

  it('normalizes LEGACY-ALIASED rows to the canonical title even when a title was authored', () => {
    const out = proseSections(
      baseData('evaluation', [row('diagnostic_findings', 'Findings', 'Legacy content.', 0)]),
    );
    expect(out[0].title.en).toBe('Diagnostic Findings');
    expect(out[0].tone).toBe('danger');
  });

  it('always appends the destruction certificate to a data_destruction report missing it', () => {
    const out = proseSections(
      baseData('data_destruction', [
        row('sanitization_details', 'Sanitization Details', 'Purged per 800-88.', 0),
      ]),
    );
    expect(out.map((s) => s.kind ?? 'prose')).toEqual(['prose', 'destruction_certificate']);
    expect(out[1].title.en).toBe('Certificate of Destruction');
  });

  it('skips empty prose sections but keeps the destruction certificate', () => {
    const out = proseSections(
      baseData('data_destruction', [
        row('sanitization_details', 'Sanitization Details', '', 0),
        row('destruction_certificate', 'Certificate of Destruction', '', 1),
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('destruction_certificate');
  });
});

// ---------------------------------------------------------------------------
// Seeded-template → instance → engine E2E: for EVERY subtype, the sections the
// Standard preset seeds (mirrored by reportSubtypeSections) must survive the
// full client seam — document_instance_sections rows → mapInstanceToReportData
// → toEngineData → renderTemplate — with every section title in the rendered
// doc-definition. Guards the whole choose/customize/print pipeline per type.
// ---------------------------------------------------------------------------

const ALL_SUBTYPES = [
  'evaluation', 'service', 'server', 'malware',
  'forensic', 'data_destruction', 'prevention', 'recovered_files',
] as const;

function collectTexts(node: Content | undefined, out: string[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectTexts(n as Content, out));
    return;
  }
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (typeof node !== 'object') return;
  const rec = node as unknown as Record<string, unknown>;
  if (typeof rec.text === 'string') out.push(rec.text);
  for (const key of ['text', 'stack', 'columns', 'ul', 'ol']) {
    if (rec[key] && typeof rec[key] === 'object') collectTexts(rec[key] as Content, out);
  }
  if (rec.table && typeof rec.table === 'object') {
    const body = (rec.table as { body?: unknown }).body;
    if (Array.isArray(body)) body.forEach((r) => collectTexts(r as Content, out));
  }
}

describe('seeded template renders end-to-end for every subtype', () => {
  it.each(ALL_SUBTYPES.map((s) => [s] as const))('%s: every seeded section prints', (subtype) => {
    const seeds = reportSubtypeSections(subtype);
    expect(seeds.length).toBeGreaterThan(0);

    // Simulate the rows createReportInstance seeds, then authored content.
    const instance = {
      id: `di-${subtype}`,
      case_id: 'case-1',
      document_number: `REP-${subtype.toUpperCase()}-0001`,
      report_subtype: subtype,
      title: `${subtype} report`,
      status: 'draft',
      version_number: 1,
      created_at: '2026-08-02T10:00:00Z',
      created_by: 'user-1',
    };
    const sectionRows = seeds.map((s, i) => ({
      section_key: s.key,
      title: s.title,
      content: `Authored content for ${s.title}.`,
      sort_order: i,
      is_visible: true,
    }));

    const data = mapInstanceToReportData(instance, sectionRows, {
      companySettings: {} as ReportData['companySettings'],
    });
    const config = reportConfigForSubtype(subtype);
    const def = renderTemplate(config, toEngineData(data, config, ctx), ctx, null, null);

    const texts: string[] = [];
    collectTexts(def.content as Content, texts);
    const joined = texts.join('|');
    for (const s of seeds) {
      expect(joined).toContain(s.title);
      expect(joined).toContain(`Authored content for ${s.title}.`);
    }
  });

  it('a customized template (reordered + renamed + custom section) prints in order', () => {
    const instance = {
      id: 'di-custom',
      case_id: 'case-1',
      document_number: 'REP-EVAL-0042',
      report_subtype: 'evaluation',
      title: 'Evaluation report',
      status: 'draft',
      version_number: 1,
      created_at: '2026-08-02T10:00:00Z',
      created_by: 'user-1',
    };
    const sectionRows = [
      { section_key: 'findings', title: 'Lab Analysis', content: 'Heads degraded.', sort_order: 0, is_visible: true },
      { section_key: 'warranty_notes', title: 'Warranty Notes', content: 'Opening voids warranty.', sort_order: 1, is_visible: true },
      { section_key: 'executive_summary', title: 'Executive Summary', content: 'Recoverable.', sort_order: 2, is_visible: true },
      { section_key: 'risks_disclaimers', title: 'Risks & Required Consents', content: 'Hidden.', sort_order: 3, is_visible: false },
    ];
    const data = mapInstanceToReportData(instance, sectionRows, {
      companySettings: {} as ReportData['companySettings'],
    });
    const config = reportConfigForSubtype('evaluation');
    const engine = toEngineData(data, config, ctx);
    const titles = (engine.reportSections?.sections ?? []).map((s) => s.title.en);
    // Renamed canonical first, custom second, canonical third; hidden row absent.
    expect(titles).toEqual(['Lab Analysis', 'Warranty Notes', 'Executive Summary']);
    expect(() => renderTemplate(config, engine, ctx, null, null)).not.toThrow();
  });
});
