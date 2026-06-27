/**
 * Report-sections section — the ordered, DB-driven dynamic prose sections of a
 * data-recovery REPORT, rendered in the Option B "editorial" style: a bilingual
 * section title, a coloured LEFT ACCENT BAR (per-section status tone), and the
 * HTML-cleaned content body. Unlike the legacy full-box treatment, each section
 * is an open editorial block with a tinted left rule — the Option B look.
 *
 * Per-section `tone` (info / success / warning / danger / neutral) paints the
 * left accent bar + the tinted title using the fixed-hex {@link PDF_TONES}
 * palette — theme-INVARIANT status semantics, never brand colour, so this
 * respects "PDFs stay neutral across themes" (DESIGN.md). The adapter assigns
 * each section's tone (findings → danger, recommendations → success,
 * assessment/work → info, security → warning, executive summary → neutral, …).
 *
 * A section may carry `kind: 'destruction_certificate'`, which renders the prose
 * THEN operator + witness signature slots (placeholder wet-ink lines now; real
 * captured signatures wire in a later phase). The chain-of-custody timeline is
 * NOT handled here — it reuses `custodyLog` / `renderCustodyLog`, exactly as the
 * legacy builder special-cased it.
 *
 * The adapter pre-resolves each title to a {@link LabelText} and pre-cleans the
 * content to PLAIN TEXT (HTML stripped, paragraph breaks preserved as `\n`); this
 * renderer stays dumb. Stable for any section count (zero → renders nothing).
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS, createBilingualSignatureBlock, resolvePdfTone } from '../../styles';
import { safeString } from '../../utils';
import type {
  EngineContext,
  EngineDocData,
  ReportSectionsBlock,
  SectionRenderer,
} from '../types';
import { isBilingualMode, en, ar } from '../labels';

type ReportSection = ReportSectionsBlock['sections'][number];

/** Operator + witness signature slots for a destruction certificate. */
function destructionSignatures(
  language: EngineContext['config']['language'],
): Content {
  const bilingual = isBilingualMode(language);
  const operator = createBilingualSignatureBlock(
    'Operator',
    bilingual ? 'المشغّل' : null,
  ) as Content;
  const witness = createBilingualSignatureBlock(
    'Witness',
    bilingual ? 'الشاهد' : null,
  ) as Content;
  return {
    columns: [operator, { text: '', width: '*' }, witness],
    margin: [0, 18, 0, 4],
  };
}

/**
 * One editorial report section: a tinted bilingual title with a coloured left
 * accent bar, then the content paragraph (keeping `\n` paragraph breaks at
 * `lineHeight: 1.4`). For the destruction-certificate kind, operator + witness
 * signature slots are appended under the prose.
 */
function editorialSection(
  section: ReportSection,
  language: EngineContext['config']['language'],
): Content {
  const bilingual = isBilingualMode(language);
  const tone = resolvePdfTone(section.tone);
  const titleEn = en(section.title);
  const titleAr = bilingual ? ar(section.title, language) : null;

  // Title row: a small coloured accent block, the EN title, then (bilingual) the
  // RTL Arabic title pushed to the trailing edge.
  const titleRow: Content = {
    columns: [
      {
        // Left accent swatch (the editorial rule head).
        canvas: [{ type: 'rect', x: 0, y: 0, w: 4, h: 12, color: tone.accent }],
        width: 8,
      },
      { text: titleEn, fontSize: 10, bold: true, color: tone.accent, width: 'auto', margin: [0, 0, 0, 0] },
      { text: '', width: '*' },
      ...(titleAr
        ? [{ text: titleAr, fontSize: 10, bold: true, color: tone.accent, alignment: 'right' as const, width: 'auto' }]
        : []),
    ],
    columnGap: 6,
    margin: [0, 0, 0, 4],
  };

  // Body: a left accent rule (table with a coloured left border) holding the prose.
  const body: Content = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: safeString(section.content),
            fontSize: 8,
            color: PDF_COLORS.text,
            lineHeight: 1.4,
            margin: [8, 4, 4, 4],
            border: [true, false, false, false],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 2 : 0),
      vLineColor: () => tone.accent,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };

  const stack: Content[] = [titleRow, body];
  if (section.kind === 'destruction_certificate') {
    stack.push(destructionSignatures(language));
  }
  return { stack, margin: [0, 0, 0, 10] };
}

export const renderReportSections: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content[] | null => {
  const block = data.reportSections;
  if (!block || block.sections.length === 0) return null;

  const { language } = engine.config;

  // Sort by optional `order` (ascending), keeping input order for ties / absent.
  const ordered = block.sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => {
      const oa = a.section.order ?? a.index;
      const ob = b.section.order ?? b.index;
      if (oa !== ob) return oa - ob;
      return a.index - b.index;
    })
    .map((entry) => entry.section)
    // A section with no content is dropped — UNLESS it is a destruction
    // certificate, whose signature slots are meaningful even with empty prose.
    .filter(
      (section) =>
        section.kind === 'destruction_certificate' ||
        safeString(section.content).trim().length > 0,
    );

  if (ordered.length === 0) return null;

  return ordered.map((section) => editorialSection(section, language));
};
