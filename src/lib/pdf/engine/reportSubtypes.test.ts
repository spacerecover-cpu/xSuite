import { describe, it, expect } from 'vitest';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { renderTemplate } from './renderTemplate';
import { buildPreviewEngineData, sampleReportDataFor } from './sampleData';
import { reportConfigForSubtype, reportSubtypeSections, reportSectionGuidance } from './adapters/reportAdapter';
import { resolveTemplateConfig } from '../templateConfig';
import type { TranslationContext } from '../types';

// ---------------------------------------------------------------------------
// The 8 report types (2026-07 industry taxonomy): every subtype must have an
// ordered section set, editor guidance, a realistic sample fixture whose
// authored sections all land in that set (so the Studio preview shows a
// filled-in document), and an end-to-end render that carries its content.
// ---------------------------------------------------------------------------

const SUBTYPES = [
  'evaluation', 'service', 'server', 'malware',
  'forensic', 'data_destruction', 'prevention', 'recovered_files',
] as const;

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

function allTexts(def: TDocumentDefinitions): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const o = node as Record<string, unknown>;
    if (typeof o.text === 'string') out.push(o.text);
    Object.values(o).forEach(walk);
  };
  walk(def.content);
  return out.join('|');
}

describe('8 report types — section taxonomy', () => {
  it.each(SUBTYPES)('%s has an ordered prose set with guidance for every section', (subtype) => {
    const sections = reportSubtypeSections(subtype);
    expect(sections.length).toBeGreaterThanOrEqual(5);
    for (const s of sections) {
      expect(s.title, `${subtype}:${s.key}`).toBeTruthy();
      expect(s.guidance, `${subtype}:${s.key} guidance`).toBeTruthy();
    }
  });

  it('subtype sets carry their signature industry sections', () => {
    const keys = (s: string) => reportSubtypeSections(s).map((x) => x.key);
    expect(keys('evaluation')).toContain('estimated_timeline');
    expect(keys('evaluation')).toContain('risks_disclaimers');
    expect(keys('service')).toContain('parts_used');
    expect(keys('server')).toContain('array_configuration');
    expect(keys('server')).toContain('member_drives');
    expect(keys('malware')).toContain('infection_vector');
    expect(keys('forensic')).toContain('acquisition_details');
    expect(keys('forensic')).toContain('chain_of_custody_notes');
    expect(keys('data_destruction')).toContain('sanitization_details');
    expect(keys('data_destruction')).toContain('destruction_certificate');
    expect(keys('prevention')).toContain('backup_strategy');
    expect(keys('prevention')).toContain('action_plan');
    expect(keys('recovered_files')).toContain('recovery_statistics');
    expect(keys('recovered_files')).toContain('critical_files');
  });

  it('guidance resolves through legacy alias keys too', () => {
    expect(reportSectionGuidance('proposed_solutions')).toBeTruthy();
    expect(reportSectionGuidance('estimated_recovery_time')).toBe(reportSectionGuidance('estimated_timeline'));
  });
});

describe('8 report types — sample fixtures render end-to-end', () => {
  it.each(SUBTYPES)('%s fixture authors only sections its set renders, and they all print', (subtype) => {
    const data = sampleReportDataFor(subtype);
    expect(data.report.report_type).toBe(subtype);

    const config = reportConfigForSubtype(subtype);
    const engineData = buildPreviewEngineData('report', config, undefined, { reportSubtype: subtype });
    const def = renderTemplate(resolveTemplateConfig(config), engineData, ctx, 'LOGO', null);
    const text = allTexts(def);

    // Every authored sample section's content must reach the rendered document
    // (proves the fixture keys belong to the subtype's set — a typo'd key would
    // silently drop the section).
    for (const s of data.sections) {
      const probe = s.section_content.slice(0, 40);
      expect(text, `${subtype} section ${s.section_key}`).toContain(probe);
    }
  });

  it('unknown subtypes fall back to the evaluation fixture', () => {
    expect(sampleReportDataFor('nope').report.report_type).toBe('evaluation');
  });

  it('the forensic fixture renders the custody timeline', () => {
    const config = reportConfigForSubtype('forensic');
    const engineData = buildPreviewEngineData('report', config, undefined, { reportSubtype: 'forensic' });
    const def = renderTemplate(resolveTemplateConfig(config), engineData, ctx, 'LOGO', null);
    expect(allTexts(def)).toContain('Drive received at intake counter.');
  });

  it('the destruction fixture renders the certificate signature slots', () => {
    const config = reportConfigForSubtype('data_destruction');
    const engineData = buildPreviewEngineData('report', config, undefined, { reportSubtype: 'data_destruction' });
    const def = renderTemplate(resolveTemplateConfig(config), engineData, ctx, 'LOGO', null);
    const text = allTexts(def);
    expect(text).toContain('NIST SP 800-88');
  });
});
