/**
 * Line-item table section — columns are driven entirely by config
 * (`visible` / `label` / `width` / `order`) resolved into
 * {@link EngineDocData.lineItems.columns}.
 *
 * Generalized from the `lineItemsSection` in `documents/InvoiceDocument.ts`
 * (lines ~169-220). The assembler/adapter is responsible for resolving the
 * config columns into {@link ResolvedColumn}s and stringifying each cell; this
 * renderer only lays out the header + body and applies per-column alignment.
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import { PDF_COLORS, createBilingualSectionHeader } from '../../styles';
import type {
  EngineContext,
  EngineDocData,
  ResolvedColumn,
  SectionRenderer,
} from '../types';
import { isBilingualMode, en, ar, resolveLabel } from '../labels';
import { engineLayoutDirection, mirrorColumns } from '../rtl';
import { resolveTable } from '../branding';

function headerAlignment(col: ResolvedColumn): 'left' | 'center' | 'right' {
  return col.align ?? 'left';
}

export const renderLineItems: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const li = data.lineItems;
  if (!li) return null;

  const { language } = engine.config;
  const direction = engineLayoutDirection(language);
  // Under RTL, mirror the column order (reverse) and swap each column's
  // left/right alignment so the table reads right-to-left. `mirrorColumns`
  // returns the input unchanged for LTR, so English-only output is untouched.
  const columns = mirrorColumns(li.columns.filter((c) => c.visible), direction);
  if (columns.length === 0) return null;

  const bilingual = isBilingualMode(language);

  // Section heading ("Line Items"), bilingual when the mode asks for it.
  const headingLabel = engine.config.labels.lineItems ?? { en: 'Line Items', ar: 'البنود' };
  const heading = createBilingualSectionHeader(
    en(headingLabel, 'Line Items'),
    bilingual ? ar(headingLabel) : null,
  ) as Content;

  // Table styling. `headerBackground` defaults to the legacy `PDF_COLORS.headerBg`,
  // so an unconfigured table is unchanged; S/N + zebra are opt-in.
  const tableStyle = resolveTable(engine.config);

  // Header row: one cell per visible column, label resolved by language mode.
  const headerRow: TableCell[] = columns.map((col) => ({
    text: resolveLabel(col.label, language),
    style: 'tableHeader',
    fillColor: tableStyle.headerBackground,
    color: PDF_COLORS.text,
    alignment: headerAlignment(col),
  }));

  const body: TableCell[][] = [headerRow];

  for (const row of li.rows) {
    body.push(
      columns.map((col): TableCell => {
        const raw = row[col.key];
        const text = raw === undefined || raw === null ? '' : String(raw);
        const align = col.align ?? 'left';
        const style =
          align === 'right' ? 'tableCellRight' : align === 'center' ? 'tableCellCenter' : 'tableCell';
        return { text, style };
      }),
    );
  }

  // Column widths: explicit point widths where given, else star-sized so the
  // table fits the printable width regardless of how many columns are visible.
  const widths: (number | string)[] = columns.map((col) => (col.width !== undefined ? col.width : '*'));

  // Opt-in S/N row-number column: a narrow serial column prepended to the header
  // and each body row.
  if (tableStyle.rowNumbering) {
    headerRow.unshift({ text: '#', style: 'tableHeader', fillColor: tableStyle.headerBackground, color: PDF_COLORS.text, alignment: 'center' });
    for (let r = 1; r < body.length; r++) {
      body[r].unshift({ text: String(r), style: 'tableCellCenter' });
    }
    widths.unshift(24);
  }

  // Opt-in zebra striping: body rows alternate a light fill. Header cells set
  // their own fill, so the layout fill only paints body rows.
  const layout = {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => PDF_COLORS.border,
    vLineColor: () => PDF_COLORS.border,
    ...(tableStyle.zebra
      ? { fillColor: (rowIndex: number) => (rowIndex > 0 && rowIndex % 2 === 0 ? PDF_COLORS.background : null) }
      : {}),
  };

  return {
    stack: [
      heading,
      { table: { headerRows: 1, widths, body }, layout, margin: [0, 0, 0, 8] },
    ],
  };
};
