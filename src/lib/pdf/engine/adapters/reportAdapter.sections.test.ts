import { describe, it, expect } from 'vitest';
import { toEngineData, reportConfigForSubtype } from './reportAdapter';
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
