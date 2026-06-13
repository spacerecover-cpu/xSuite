/**
 * Totals section — a right-aligned stack of summary lines (subtotal, discount,
 * VAT, total, …). Lines come pre-computed and pre-formatted in
 * {@link EngineDocData.totals}; the `emphasis` flag promotes a line (the grand
 * total) to the boxed, larger treatment.
 *
 * Generalized from the `financialSummaryRows` block in
 * `documents/InvoiceDocument.ts` (lines ~240-319). The config `totals` section
 * `lines` toggles decide which lines the ADAPTER emits; this renderer simply
 * lays out whatever lines it is handed.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { bilingualLabelRuns } from '../rtl';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

export const renderTotals: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const totals = data.totals;
  if (!totals || totals.length === 0) return null;

  const { language } = engine.config;
  // English runs render in the tenant's Latin font; Arabic runs are pinned to
  // the Arabic family by `bilingualLabelRuns`. The currency/number value stays a
  // SEPARATE run so it keeps LTR ordering within the RTL flow (never reversed).
  const baseFont = engine.ctx.fontFamily;
  const rows: Content[] = [];

  for (const line of totals) {
    // Per-run label so Arabic shapes in its own font even when the document
    // default is Latin (bilingual, English-primary). Totals are intrinsically
    // right-anchored, so labels stay right-aligned in BOTH LTR and RTL.
    const labelRuns = bilingualLabelRuns(line.label, language, baseFont);

    if (line.emphasis) {
      // Grand-total: boxed, larger, brand-colored value.
      rows.push({
        table: {
          widths: ['*', 100],
          body: [
            [
              { text: labelRuns, fontSize: 10, bold: true, color: PDF_COLORS.text, alignment: 'right', border: [false, false, false, false], margin: [0, 3, 0, 3] },
              { text: line.value, fontSize: 11, bold: true, color: PDF_COLORS.primary, alignment: 'right', border: [false, false, false, false], margin: [0, 3, 0, 3] },
            ],
          ],
        },
        layout: {
          fillColor: () => PDF_COLORS.background,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => PDF_COLORS.border,
          vLineColor: () => PDF_COLORS.border,
        },
        margin: [0, 4, 0, 0],
      });
    } else {
      rows.push({
        columns: [
          { text: labelRuns, fontSize: 9, color: PDF_COLORS.textLight, width: '*', alignment: 'right' },
          { text: line.value, fontSize: 9, bold: true, color: PDF_COLORS.text, width: 100, alignment: 'right' },
        ],
        margin: [0, 2, 0, 2],
      });
    }
  }

  return { stack: rows, margin: [280, 8, 0, 8] };
};
