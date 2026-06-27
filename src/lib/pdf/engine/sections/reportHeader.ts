/**
 * Report-header section — the Option B navy HEADER BAND for a data-recovery
 * report. A full-width band in the fixed Royal navy (`PDF_COLORS.primary`) with
 * the tenant logo + company short identity reversed-out (white) on the leading
 * edge, and the report title (EN + Arabic) + the "Job <case_no>" line on the
 * trailing edge.
 *
 * This is REPORT-ONLY: it is registered under the `reportHeader` key and only
 * the report subtype configs reference it, so the shared `header` renderer (used
 * by every other document type) is left completely untouched. The band is laid
 * out as a single-cell table painted with the navy fill so the colour spans the
 * full printable width; the inner `columns` place identity vs title.
 *
 * RTL-aware: under Arabic-lead layout the identity and title columns swap sides
 * (logo/identity to the right, title to the left) and text alignment flips, so
 * the band reads right-to-left. The adapter pre-formats every string and routes
 * the bilingual title through {@link bilingualLabelRuns} so Arabic glyphs shape
 * in their own run regardless of the document default font.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';
import { engineLayoutDirection, engineDefaultFont, bilingualLabelRuns } from '../rtl';
import { buildLogoNode, classifyLogo } from '../../brandingImage';

export const renderReportHeader: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const block = data.reportHeader;
  if (!block) return null;

  const { config, logo } = engine;
  const direction = engineLayoutDirection(config.language);
  const rtl = direction === 'rtl';
  const baseFont = engineDefaultFont(config.language, engine.ctx.fontFamily);

  const showLogo = config.branding.logo && classifyLogo(logo).kind !== 'none';
  const logoNode = showLogo
    ? buildLogoNode(logo, { width: 90, maxHeight: 34, alignment: rtl ? 'right' : 'left' })
    : null;

  // Identity column: logo (if any) then the reversed-out company name + tagline.
  const identityStack: Content[] = [];
  if (logoNode) identityStack.push({ ...(logoNode as object), margin: [0, 0, 0, 4] } as Content);
  identityStack.push({
    text: block.companyName,
    fontSize: 13,
    bold: true,
    color: PDF_COLORS.white,
    alignment: rtl ? 'right' : 'left',
  });
  if (block.companyTagline) {
    identityStack.push({
      text: block.companyTagline,
      fontSize: 8,
      color: '#C7D2FE',
      alignment: rtl ? 'right' : 'left',
      margin: [0, 2, 0, 0],
      lineHeight: 1.1,
    });
  }

  // Title column: the report title (EN + AR runs) large, then the Job line.
  const titleRuns = bilingualLabelRuns(block.title, config.language, baseFont).map((run) => ({
    text: run.text,
    ...(run.font ? { font: run.font } : {}),
  }));
  const titleStack: Content[] = [
    {
      text: titleRuns,
      fontSize: 15,
      bold: true,
      color: PDF_COLORS.white,
      alignment: rtl ? 'left' : 'right',
    },
  ];
  if (block.jobLine) {
    titleStack.push({
      text: block.jobLine,
      fontSize: 9,
      color: '#C7D2FE',
      alignment: rtl ? 'left' : 'right',
      margin: [0, 3, 0, 0],
    });
  }

  const identityCol = { stack: identityStack, width: '*' };
  const titleCol = { stack: titleStack, width: '*' };

  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            columns: rtl ? [titleCol, identityCol] : [identityCol, titleCol],
            columnGap: 16,
            margin: [14, 12, 14, 12],
            fillColor: PDF_COLORS.primary,
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 12],
  };
};
