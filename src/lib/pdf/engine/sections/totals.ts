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
import { fieldLabelLanguage } from '../labels';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

export const renderTotals: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const totals = data.totals;
  if (!totals || totals.length === 0) return null;

  const { language } = engine.config;
  // The totals labels follow the translation policy: under "System labels only"
  // or a custom "Total box" toggle = off, they collapse to a single language so a
  // tenant can keep the totals box uncluttered.
  const labelLang = fieldLabelLanguage(language, engine.config.translationPolicy, 'totals');
  // English runs render in the tenant's Latin font; Arabic runs are pinned to
  // the Arabic family by `bilingualLabelRuns`. The currency/number value stays a
  // SEPARATE run so it keeps LTR ordering within the RTL flow (never reversed).
  const baseFont = engine.ctx.fontFamily;
  // Value column auto-sizes (never wraps the larger grand-total figure); it is the
  // LAST, right-aligned column, so every amount still aligns to the block's right
  // edge regardless of length or currency.
  const rows: Content[] = [];
  let ruled = false;

  for (const line of totals) {
    // Per-run label so Arabic shapes in its own font even when the document
    // default is Latin (bilingual, English-primary). Totals are intrinsically
    // right-anchored, so labels stay right-aligned in BOTH LTR and RTL.
    const labelRuns = bilingualLabelRuns(line.label, labelLang, baseFont);

    if (line.emphasis) {
      // A hairline rule separates the subtotals from the grand total.
      if (!ruled) {
        rows.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 245, y2: 0, lineWidth: 0.5, lineColor: PDF_COLORS.border }], margin: [0, 3, 0, 4] });
        ruled = true;
      }
      // Grand total: a clean tinted band (no boxy border), bold brand-colored
      // value, slightly larger — reads as the document's headline figure.
      rows.push({
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              { text: labelRuns, fontSize: 10.5, bold: true, color: PDF_COLORS.text, alignment: 'right', border: [false, false, false, false], margin: [0, 5, 8, 5] },
              { text: line.value, fontSize: 12, bold: true, color: PDF_COLORS.primary, alignment: 'right', border: [false, false, false, false], margin: [0, 5, 8, 5] },
            ],
          ],
        },
        layout: {
          fillColor: () => PDF_COLORS.background,
          hLineWidth: () => 0,
          vLineWidth: () => 0,
        },
        margin: [0, 0, 0, 0],
      });
    } else {
      rows.push({
        columns: [
          { text: labelRuns, fontSize: 9, color: PDF_COLORS.textLight, width: '*', alignment: 'right' },
          { text: line.value, fontSize: 9, color: PDF_COLORS.text, width: 'auto', alignment: 'right' },
        ],
        margin: [0, 2.5, 8, 2.5],
      });
    }
  }

  return { stack: rows, margin: [280, 8, 0, 8] };
};
