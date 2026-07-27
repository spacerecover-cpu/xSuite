/**
 * Tax Summary section — a standalone VAT/GST breakdown table (rate → taxable →
 * tax) with an emphasised totals row. Opt-in: the adapter only populates
 * {@link EngineDocData.taxSummary} when `config.taxSummary.show` is on, so this
 * returns null otherwise. Styling (style / header + body colours / highlighted
 * totals row / amount-in-words) comes from `config.taxSummary`; defaults are
 * neutral (navy header, bordered).
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { resolveLabel } from '../labels';
import { engineLayoutDirection, mirrorAlign, type HAlign } from '../rtl';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hex = (v: string | undefined): string | null =>
  typeof v === 'string' && HEX_RE.test(v.trim()) ? v.trim() : null;

export const renderTaxSummary: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const ts = data.taxSummary;
  if (!ts || ts.rows.length === 0) return null;

  const { language } = engine.config;
  const cfg = engine.config.taxSummary ?? {};
  const style = cfg.style ?? 'bordered';
  const headerBg = hex(cfg.headerBackground) ?? PDF_COLORS.primary;
  const headerText = hex(cfg.headerText) ?? PDF_COLORS.white;
  const bodyText = hex(cfg.bodyText) ?? PDF_COLORS.text;
  const highlightTotal = cfg.highlightTotalRow !== false;
  const totalBg = hex(cfg.totalRowBackground) ?? PDF_COLORS.background;

  // Under RTL, reverse the column order and swap each cell's left/right
  // alignment so the statutory breakdown reads right-to-left like every other
  // table in the document. `orient` is the identity for LTR, so English output
  // is byte-for-byte unchanged.
  const rtl = engineLayoutDirection(language) === 'rtl';
  const orient = (cells: TableCell[]): TableCell[] =>
    rtl
      ? [...cells].reverse().map((cell) => {
          const c = cell as { alignment?: HAlign };
          return { ...(cell as object), alignment: mirrorAlign(c.alignment) } as TableCell;
        })
      : cells;

  const headerRow: TableCell[] = orient([
    { text: resolveLabel(ts.columns.rate, language), bold: true, fontSize: 8, color: headerText, alignment: 'left', margin: [4, 4, 4, 4] },
    { text: resolveLabel(ts.columns.taxable, language), bold: true, fontSize: 8, color: headerText, alignment: 'right', margin: [4, 4, 4, 4] },
    { text: resolveLabel(ts.columns.tax, language), bold: true, fontSize: 8, color: headerText, alignment: 'right', margin: [4, 4, 4, 4] },
  ]);
  const body: TableCell[][] = [headerRow];
  for (const r of ts.rows) {
    body.push(orient([
      { text: r.rate, fontSize: 8, color: bodyText, alignment: 'left', margin: [4, 3, 4, 3] },
      { text: r.taxable, fontSize: 8, color: bodyText, alignment: 'right', margin: [4, 3, 4, 3] },
      { text: r.tax, fontSize: 8, color: bodyText, alignment: 'right', margin: [4, 3, 4, 3] },
    ]));
  }
  body.push(orient([
    { text: resolveLabel(ts.total.label, language), bold: true, fontSize: 8, color: bodyText, alignment: 'left', margin: [4, 4, 4, 4] },
    { text: ts.total.taxable, bold: true, fontSize: 8, color: bodyText, alignment: 'right', margin: [4, 4, 4, 4] },
    { text: ts.total.tax, bold: true, fontSize: 8, color: bodyText, alignment: 'right', margin: [4, 4, 4, 4] },
  ]));
  const totalRowIdx = body.length - 1;

  const stack: Content[] = [
    { text: resolveLabel(ts.title, language), bold: true, fontSize: 9, color: PDF_COLORS.primary, margin: [0, 0, 0, 4] },
    {
      table: { headerRows: 1, dontBreakRows: true, widths: ['*', '*', '*'], body },
      layout: {
        fillColor: (rowIndex: number) =>
          rowIndex === 0
            ? headerBg
            : highlightTotal && rowIndex === totalRowIdx
              ? totalBg
              : style === 'striped' && rowIndex % 2 === 0
                ? PDF_COLORS.background
                : null,
        hLineWidth: () => (style === 'borderless' ? 0 : 0.5),
        vLineWidth: () => (style === 'bordered' ? 0.5 : 0),
        hLineColor: () => PDF_COLORS.border,
        vLineColor: () => PDF_COLORS.border,
      },
    },
  ];
  if (ts.amountInWords) {
    stack.push({ text: ts.amountInWords, italics: true, fontSize: 7, color: PDF_COLORS.textLight, margin: [0, 4, 0, 0] });
  }
  return { stack, margin: [0, 10, 0, 0] };
};
