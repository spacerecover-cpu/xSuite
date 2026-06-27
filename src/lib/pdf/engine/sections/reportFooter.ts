/**
 * Report-footer section — the Option B report FOOTER for a data-recovery report:
 * a confidentiality line (italic), the copyright "© {year} {tenant}", and the
 * provability line "Report ID: {id} | Generated: {timestamp}". Report-only.
 *
 * Like the shared `footer`, this has two consumers:
 * - {@link renderReportFooter}: the in-content section renderer (used when a
 *   tenant reorders the footer into the body, or for non-paged previews).
 * - {@link buildReportPageFooter}: a pdfmake page-`footer` callback factory so
 *   the footer repeats on every page. The assembler prefers this when the report
 *   config's trailing run includes a `reportFooter` section.
 *
 * The provable PDF hash is wired in a later phase; today the report line binds to
 * the report number/id + generated timestamp the adapter supplies. The adapter
 * pre-formats every string (including the bilingual confidentiality line).
 */

import type { Content, DynamicContent } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import type { EngineContext, EngineDocData, ReportFooterBlock, SectionRenderer } from '../types';
import { resolveLabel } from '../labels';

/** Build the stacked footer lines (divider + confidentiality + copyright + report id). */
function footerLines(
  block: ReportFooterBlock,
  language: EngineContext['config']['language'],
): Content[] {
  const lines: Content[] = [
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 0.5, lineColor: PDF_COLORS.primary }],
      margin: [0, 0, 0, 6],
    },
    {
      text: resolveLabel(block.confidentiality, language),
      fontSize: 7,
      italics: true,
      color: PDF_COLORS.textLight,
      alignment: 'center',
      lineHeight: 1.2,
    },
  ];
  if (block.copyright) {
    lines.push({
      text: block.copyright,
      fontSize: 7,
      color: PDF_COLORS.textMuted,
      alignment: 'center',
      margin: [0, 2, 0, 0],
    });
  }
  lines.push({
    text: block.reportLine,
    fontSize: 7,
    bold: true,
    color: PDF_COLORS.textLight,
    alignment: 'center',
    margin: [0, 2, 0, 0],
  });
  return lines;
}

export const renderReportFooter: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const block = data.reportFooter;
  if (!block) return null;
  return { stack: footerLines(block, engine.config.language), margin: [0, 12, 0, 0] };
};

/**
 * Build a pdfmake page-`footer` callback that repeats the report footer on every
 * page. Returns null when there is no report footer block.
 */
export function buildReportPageFooter(
  engine: EngineContext,
  data: EngineDocData,
): DynamicContent | null {
  const block = data.reportFooter;
  if (!block) return null;
  const lines = footerLines(block, engine.config.language);
  return (): Content => ({ stack: lines, margin: [35, 6, 35, 22] });
}
