import { describe, it, expect } from 'vitest';
import { reportSubtypeSections, toEngineData, reportConfigForSubtype } from './reportAdapter';
import type { ReportData } from '../../documents/ReportDocument';
import type { TranslationContext } from '../../types';

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/** Minimal forensic ReportData carrying an authored Chain of Custody narrative. */
function forensicDataWithCustodyNotes(custodyProse: string): ReportData {
  return {
    report: {
      id: 'rpt-1',
      case_id: 'case-1',
      report_number: 'REP-0007',
      report_type: 'forensic',
      title: 'Forensic',
      status: 'approved',
      version_number: 1,
      created_at: '2026-07-01T09:30:00Z',
    },
    sections: [
      {
        id: 'sec-coc',
        section_key: 'chain_of_custody',
        section_title: 'Chain of Custody',
        section_content: custodyProse,
        section_order: 0,
      },
    ],
    companySettings: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
    },
  };
}

describe('reportSubtypeSections', () => {
  it('returns ordered sections for evaluation with stable keys + titles', () => {
    const s = reportSubtypeSections('evaluation');
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => typeof x.key === 'string' && typeof x.title === 'string')).toBe(true);
    // executive summary leads the evaluation report
    expect(s[0].key).toContain('summary');
  });

  it('data_destruction includes the destruction certificate section', () => {
    const keys = reportSubtypeSections('data_destruction').map((x) => x.key);
    expect(keys.some((k) => k.includes('destruction'))).toBe(true);
  });

  it('falls back to the evaluation set for an unknown subtype', () => {
    expect(reportSubtypeSections('nope')).toEqual(reportSubtypeSections('evaluation'));
  });

  it('does NOT include device_information (auto-rendered two-column card, not a prose section)', () => {
    const keys = reportSubtypeSections('evaluation').map((x) => x.key);
    expect(keys).not.toContain('device_information');
  });

  it('forensic seeds the Chain of Custody narrative section', () => {
    const keys = reportSubtypeSections('forensic').map((x) => x.key);
    expect(keys).toContain('chain_of_custody_notes');
  });
});

describe('buildReportSections — authored Chain of Custody prose', () => {
  // Regression for the content-loss bug: the forensic subtype seeds an editable
  // `chain_of_custody_notes` narrative, but the adapter used to filter that key
  // out of the rendered prose sections, silently dropping legally-relevant text.
  it('renders the engineer-authored custody narrative on a forensic report', () => {
    const prose = 'Seals intact on receipt; media stored in evidence locker B; transferred to examiner 2026-07-02.';
    const config = reportConfigForSubtype('forensic');
    const engineData = toEngineData(forensicDataWithCustodyNotes(prose), config, englishCtx);

    const contents = (engineData.reportSections?.sections ?? []).map((s) => s.content);
    expect(contents).toContain(prose);
  });
});
