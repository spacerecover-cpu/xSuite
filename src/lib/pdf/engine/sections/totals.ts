/**
 * Totals section — a right-aligned summary table (subtotal, discount, VAT, total,
 * …). Lines come pre-computed + pre-formatted in {@link EngineDocData.totals};
 * each carries a stable `key` and the grand total is flagged `emphasis`.
 *
 * Per-template customisation (config.totals — common to every language + the
 * Typst renderer): per-line label overrides (applied in the adapter), opt-in
 * per-row colours (total / balance-due / tax), and a table style
 * (plain / bordered / striped). Defaults reproduce the neutral clean look:
 * muted subtotal rows, a hairline rule above the grand total, and a tinted
 * grand-total band.
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { bilingualLabelRuns, engineLayoutDirection } from '../rtl';
import { fieldLabelLanguage } from '../labels';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hex = (v: string | undefined): string | null =>
  typeof v === 'string' && HEX_RE.test(v.trim()) ? v.trim() : null;

export const renderTotals: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const totals = data.totals;
  if (!totals || totals.length === 0) return null;

  const { language } = engine.config;
  const cfg = engine.config.totals ?? {};
  const rc = cfg.rowColors ?? {};
  const style = cfg.style ?? 'plain';
  const highlightTotal = cfg.highlightTotal !== false;
  // The totals labels follow the translation policy (e.g. "System labels only").
  const labelLang = fieldLabelLanguage(language, engine.config.translationPolicy, 'totals');
  const baseFont = engine.ctx.fontFamily;
  const totalIdx = totals.findIndex((l) => l.emphasis);
  // Under RTL the block mirrors: label/value swap column slots (so the pair reads
  // label-then-value right-to-left), the cell padding moves to the other side,
  // and the 280pt indent that pushes the block to the right edge moves to the
  // right so the block sits on the left edge. LTR keeps every value (parity).
  //
  // Cell alignment deliberately stays RIGHT in both directions: these cells are
  // currency figures, and right/decimal alignment is the numeric convention
  // regardless of script direction. `rtl.test.ts` pins this ("totals labels are
  // right-aligned under RTL") — mirroring the column slots is what makes the
  // block read correctly, not flipping the text alignment inside the cells.
  const rtl = engineLayoutDirection(language) === 'rtl';
  const cellAlign = 'right' as const;

  const body: TableCell[][] = totals.map((line) => {
    const isTotal = !!line.emphasis;
    const key = isTotal ? 'total' : line.key === 'balanceDue' ? 'balanceDue' : line.key === 'tax' ? 'tax' : null;
    const colors = key ? rc[key] : undefined;
    const labelColor = hex(colors?.text) ?? (isTotal ? PDF_COLORS.text : PDF_COLORS.textLight);
    const valueColor = hex(colors?.text) ?? (isTotal ? PDF_COLORS.primary : PDF_COLORS.text);
    // Per-run label so Arabic shapes in its own font even when the document
    // default is Latin (bilingual, English-primary). The value stays a separate
    // run so the number keeps LTR ordering.
    const labelRuns = bilingualLabelRuns(line.label, labelLang, baseFont);
    const vmargin = isTotal ? 5 : 2.5;
    const pad: [number, number, number, number] = rtl
      ? [8, vmargin, 0, vmargin]
      : [0, vmargin, 8, vmargin];
    const labelCell = { text: labelRuns, fontSize: isTotal ? 10.5 : 9, bold: isTotal, color: labelColor, alignment: cellAlign, margin: pad };
    const valueCell = { text: line.value, fontSize: isTotal ? 12 : 9, bold: isTotal, color: valueColor, alignment: cellAlign, margin: pad };
    return rtl ? [valueCell, labelCell] : [labelCell, valueCell];
  });

  const fillColor = (rowIndex: number): string | null => {
    const line = totals[rowIndex];
    if (!line) return null;
    if (line.emphasis) return hex(rc.total?.background) ?? (highlightTotal ? PDF_COLORS.background : null);
    if (line.key === 'balanceDue') return hex(rc.balanceDue?.background) ?? (style === 'striped' && rowIndex % 2 === 0 ? PDF_COLORS.background : null);
    if (line.key === 'tax') return hex(rc.tax?.background) ?? (style === 'striped' && rowIndex % 2 === 0 ? PDF_COLORS.background : null);
    return style === 'striped' && rowIndex % 2 === 0 ? PDF_COLORS.background : null;
  };

  return {
    table: { widths: rtl ? ['auto', '*'] : ['*', 'auto'], body },
    layout: {
      fillColor,
      // 'bordered' draws hairlines around every cell; otherwise just a single
      // rule above the grand total to separate it from the subtotals.
      hLineWidth: (i: number) => (style === 'bordered' ? 0.5 : i === totalIdx && totalIdx > 0 ? 0.5 : 0),
      vLineWidth: () => (style === 'bordered' ? 0.5 : 0),
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
    },
    margin: rtl ? [0, 8, 280, 8] : [280, 8, 0, 8],
  };
};
