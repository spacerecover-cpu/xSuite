/**
 * Net-pay section — the emphasized Net Salary line on a payslip: a bilingual
 * label stacked over the large, brand-coloured net amount in a filled box. This
 * is the payslip's grand-total equivalent (its own self-contained block, not a
 * {@link EngineDocData.totals} line).
 *
 * Generalized from the `netSalarySection` in `documents/PayslipDocument.ts`
 * (lines ~209-234). The legacy box used a fixed light-blue fill; engine sections
 * are non-themed and compose `PDF_COLORS`, so the box reuses the same neutral
 * `background` fill + `primary` value treatment as the totals emphasis line.
 * The label is built with `bilingualLabelRuns` so the Arabic run shapes in its
 * own font even when the document default font is Latin. Returns null when there
 * is no net-pay data.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { safeString } from '../../utils';
import { bilingualLabelRuns } from '../rtl';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

export const renderNetPay: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const net = data.netPay;
  if (!net || !safeString(net.amount)) return null;

  const { language } = engine.config;
  const baseFont = engine.ctx.fontFamily;
  const labelRuns = bilingualLabelRuns(net.label, language, baseFont);

  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: labelRuns, fontSize: 12, color: PDF_COLORS.primary, margin: [0, 0, 0, 4] },
              { text: safeString(net.amount), fontSize: 20, bold: true, color: PDF_COLORS.primary },
            ],
            fillColor: PDF_COLORS.background,
            margin: [12, 10, 12, 10],
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
    margin: [0, 8, 0, 20],
  };
};
