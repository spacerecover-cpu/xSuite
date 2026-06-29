import { describe, it, expect } from 'vitest';
import { mapInstanceToReportData } from './documentInstanceData';

describe('mapInstanceToReportData', () => {
  const ctx = {
    caseData: { case_number: 'C-0001', customer_name: 'Jane', created_at: '2026-06-01T00:00:00Z' },
    customerData: { customer_name: 'Jane', email: 'jane@x.com' },
    deviceData: { device_type: 'HDD', brand: 'WD', serial_number: 'SN1' },
    diagnosticsData: undefined,
    chainOfCustodyEvents: undefined,
    companySettings: { basic_info: { company_name: 'Lab LLC' } },
    recoverability: 'Recoverable',
    preparedByName: 'Tech A',
  };

  it('maps instance + sections into the ReportData shape the engine consumes', () => {
    const instance = {
      id: 'di-1',
      case_id: 'case-1',
      document_number: 'REP-EVAL-0007',
      report_subtype: 'evaluation',
      title: 'Evaluation Report',
      status: 'draft',
      version_number: 1,
      created_at: '2026-06-02T00:00:00Z',
      created_by: 'u1',
    };
    const sections = [
      { section_key: 'findings', title: 'Findings', content: '<p>OK</p>', sort_order: 2, is_visible: true },
      { section_key: 'executive_summary', title: 'Summary', content: '<p>Hi</p>', sort_order: 1, is_visible: true },
    ];

    const rd = mapInstanceToReportData(instance, sections, ctx);

    expect(rd.report.report_number).toBe('REP-EVAL-0007');
    expect(rd.report.report_type).toBe('evaluation');
    expect(rd.report.title).toBe('Evaluation Report');
    // sections are sorted by sort_order and only visible ones kept
    expect(rd.sections.map((s) => s.section_key)).toEqual(['executive_summary', 'findings']);
    expect(rd.recoverability).toBe('Recoverable');
    expect(rd.companySettings.basic_info?.company_name).toBe('Lab LLC');
  });

  it('drops hidden sections', () => {
    const instance = { id: 'di-2', case_id: 'c', document_number: 'R-1', report_subtype: 'service', title: 'T', status: 'draft', version_number: 1, created_at: '2026-06-02T00:00:00Z', created_by: 'u1' };
    const sections = [
      { section_key: 'a', title: 'A', content: 'x', sort_order: 1, is_visible: true },
      { section_key: 'b', title: 'B', content: 'y', sort_order: 2, is_visible: false },
    ];
    const rd = mapInstanceToReportData(instance, sections, { companySettings: {} });
    expect(rd.sections.map((s) => s.section_key)).toEqual(['a']);
  });

  it('applies fallback defaults when case_id, document_number, and report_subtype are null', () => {
    const instance = {
      id: 'di-3',
      case_id: null,
      document_number: null,
      report_subtype: null,
      title: 'Untitled',
      status: 'draft',
      version_number: 1,
      created_at: '2026-06-02T00:00:00Z',
      created_by: null,
    };
    const rd = mapInstanceToReportData(instance, [], { companySettings: {} });
    expect(rd.report.report_type).toBe('evaluation');
    expect(rd.report.report_number).toBe('');
    expect(rd.report.case_id).toBe('');
  });

  it('threads signatureBlocks from context onto ReportData', () => {
    const rd = mapInstanceToReportData(
      { id: 'di-1', case_id: 'c', document_number: 'R-1', report_subtype: 'data_destruction', title: 'Cert', status: 'draft', version_number: 1, created_at: '2026-06-02T00:00:00Z', created_by: 'u1' },
      [],
      { companySettings: {}, signatureBlocks: [{ slot: 'engineer', name: 'Op', role: 'Operator', method: 'drawn', imageDataUrl: 'data:image/png;base64,ZZ' }] },
    );
    expect(rd.signatureBlocks?.[0].slot).toBe('engineer');
  });
});
