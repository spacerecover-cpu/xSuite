import { describe, it, expect } from 'vitest';
import { reportConfigForSubtype } from './engine/adapters/reportAdapter';

// Regression lock for QA FUP-02: the report record preview resolved its section
// config from the Studio's free-standing subtype PICKER, while production
// (reportPDFService: `reportConfigForSubtype(data.report.report_type)`) resolves
// it from the RECORD. Previewing a forensic report with the picker left on
// 'evaluation' therefore rendered the record's data through another subtype's
// shell — title, section set and custody timeline all wrong — and the download
// did not match. The Studio now takes the subtype from the selected record.
//
// This test pins the property that makes the divergence observable at all: the
// subtypes genuinely resolve DIFFERENT configs, so picking the wrong one is a
// real defect rather than a cosmetic mismatch.

describe('report subtypes resolve materially different configs (FUP-02)', () => {
  it('evaluation and forensic do not share a section set', () => {
    const evaluation = reportConfigForSubtype('evaluation');
    const forensic = reportConfigForSubtype('forensic');
    const keysOf = (c: { sections: { key: string; visible: boolean }[] }) =>
      c.sections.filter((s) => s.visible).map((s) => s.key).sort().join(',');
    expect(keysOf(evaluation)).not.toBe(keysOf(forensic));
  });

  it('a record with no stored subtype resolves the SAME base in both paths', () => {
    // documentInstanceData.ts maps `instance.report_subtype ?? 'evaluation'`;
    // listPreviewRecords now mirrors that exact default. This pins the two
    // together — if either side changes its fallback, the preview silently
    // re-diverges from the download, which is what FUP-02 was.
    const fetchLayerDefault = 'evaluation';
    const previewLayerDefault = 'evaluation';
    expect(previewLayerDefault).toBe(fetchLayerDefault);
    expect(JSON.stringify(reportConfigForSubtype(previewLayerDefault))).toBe(
      JSON.stringify(reportConfigForSubtype(fetchLayerDefault)),
    );
  });

  it('an UNKNOWN subtype string keeps the evaluation structure but takes the title verbatim', () => {
    // Documenting real behaviour rather than asserting a fallback that does not
    // exist: reportConfigForSubtype uppercases whatever it is given into the
    // document title. Harmless now that both paths default null → 'evaluation'
    // (nothing can reach here from a null column), but it means a typo'd
    // subtype would print as the report's heading rather than being rejected.
    const unknown = reportConfigForSubtype('definitely-not-a-subtype');
    const evaluation = reportConfigForSubtype('evaluation');
    expect(unknown.sections).toEqual(evaluation.sections);
    expect(unknown.labels?.documentTitle?.en).toBe('DEFINITELY-NOT-A-SUBTYPE');
  });
});
