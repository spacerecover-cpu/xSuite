/**
 * Report-sections section — the ordered, DB-DRIVEN dynamic sections of a case
 * REPORT (diagnostic findings, proposed solutions, recovery time, failure-cause
 * analysis, recommendations, …). Each renders as a bilingual section header plus
 * a free-prose content body, boxed exactly like the legacy builder's per-section
 * table.
 *
 * Generalized from the `visibleSections.forEach` loop hand-written in
 * `documents/ReportDocument.ts` (regular-content branch, lines ~457-494): each
 * section is a bordered table whose first row is the bold, shaded title and whose
 * second row is the content paragraph (`lineHeight: 1.4`). This renderer keeps
 * that visual treatment but:
 *
 *  - surfaces the REAL Arabic title (`LabelText.ar`) in bilingual modes instead
 *    of the legacy hardcoded single-language title; and
 *  - is stable for an ARBITRARY number of sections — it sorts by the optional
 *    `order` (ascending; ties keep input order) and renders one boxed block per
 *    section, returning `null` when there are no sections.
 *
 * The adapter pre-resolves each title to a {@link LabelText} and pre-cleans the
 * content to PLAIN TEXT (HTML stripped, paragraph breaks preserved as `\n`
 * newlines — the same shape the legacy `stripHtmlTags` produced), so this
 * renderer stays dumb: it only lays the supplied header + body out.
 *
 * The forensic chain-of-custody timeline is intentionally NOT handled here — it
 * reuses the existing `custodyLog` block / `renderCustodyLog`, mirroring the
 * legacy builder's `chain_of_custody` special case.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { safeString } from '../../utils';
import type {
  EngineContext,
  EngineDocData,
  LabelText,
  SectionRenderer,
} from '../types';
import { isBilingualMode, en, resolveLabel } from '../labels';

/**
 * One boxed report section: shaded bilingual title row + content paragraph row,
 * matching the legacy per-section table. The content keeps its `\n` paragraph
 * breaks (pdfmake honors them in a single text run) at `lineHeight: 1.4`.
 */
function sectionBox(
  title: LabelText,
  content: string,
  language: EngineContext['config']['language'],
): Content {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: resolveLabel(title, language),
            fontSize: 10,
            bold: true,
            color: PDF_COLORS.text,
            fillColor: PDF_COLORS.background,
            margin: [6, 5, 6, 5],
          },
        ],
        [
          {
            text: safeString(content),
            fontSize: 8,
            color: PDF_COLORS.text,
            margin: [8, 6, 8, 6],
            lineHeight: 1.4,
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
    },
    margin: [0, 0, 0, 8],
  };
}

/**
 * Report-sections renderer: the ordered dynamic prose sections of a case report,
 * each as a bilingual-aware boxed header + content body. Stable for any section
 * count. Returns null when there is nothing to render.
 */
export const renderReportSections: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content[] | null => {
  const block = data.reportSections;
  if (!block || block.sections.length === 0) return null;

  const { language } = engine.config;
  const bilingual = isBilingualMode(language);

  // Sort by optional `order` (ascending), keeping input order for ties / when
  // `order` is absent. A stable index keeps the sort deterministic.
  const ordered = block.sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => {
      const oa = a.section.order ?? a.index;
      const ob = b.section.order ?? b.index;
      if (oa !== ob) return oa - ob;
      return a.index - b.index;
    })
    .map((entry) => entry.section)
    // A section with no content is dropped — matches the legacy builder, which
    // filtered out empty `section_content` before rendering.
    .filter((section) => safeString(section.content).trim().length > 0);

  if (ordered.length === 0) return null;

  return ordered.map((section) =>
    sectionBox(
      bilingual ? section.title : { en: en(section.title) },
      section.content,
      language,
    ),
  );
};
