/**
 * Shared payslip component-table builder — the 3-column (component / calculation
 * / amount) table with a pre-formatted total row used by BOTH the earnings and
 * deductions sections. Generalized from `buildComponentTable` in
 * `documents/PayslipDocument.ts` (lines ~151-207).
 *
 * Earnings and deductions are structurally identical (same columns, same total
 * row, same styling) — only the data block differs — so they share this one
 * builder and each expose a thin {@link SectionRenderer} (`earnings.ts`,
 * `deductions.ts`) that selects its block. Columns RTL-mirror via the same
 * `engine/rtl` helpers the line-item table uses: the component column reads
 * leading (left in LTR, right in RTL) and the amount column trails.
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import { PDF_COLORS, createBilingualSectionHeader } from '../../styles';
import { resolveSectionFill, resolvePresentation } from '../branding';
import { readableTextOn } from '../palette';
import { safeString } from '../../utils';
import type { EngineContext, LabelText, PayComponentBlock } from '../types';
import { isBilingualMode, en, ar, resolveLabel } from '../labels';
import { engineLayoutDirection, type LayoutDirection } from '../rtl';

/** One component-table column described as DATA so RTL can reorder + realign it. */
interface ComponentColumn {
  label: LabelText;
  field: 'component' | 'calculation' | 'amount';
  width: string;
  align: 'left' | 'center' | 'right';
}

/**
 * Build the earnings/deductions component table for a {@link PayComponentBlock}.
 * Returns null when the block is absent or has no rows (so an empty earnings or
 * deductions list renders nothing, matching the legacy conditional layout).
 */
export function buildPayComponentTable(
  engine: EngineContext,
  block: PayComponentBlock | null | undefined,
  sectionKey: string,
): Content | null {
  if (!block || block.rows.length === 0) return null;

  const { language } = engine.config;
  const direction: LayoutDirection = engineLayoutDirection(language);
  const bilingual = isBilingualMode(language);

  // Column order matches the legacy table (component → calculation → amount).
  const baseColumns: ComponentColumn[] = [
    { label: block.columns.component, field: 'component', width: '50%', align: 'left' },
    { label: block.columns.calculation, field: 'calculation', width: '25%', align: 'center' },
    { label: block.columns.amount, field: 'amount', width: '25%', align: 'right' },
  ];

  // Under RTL, reverse the columns and swap each cell's left/right alignment so
  // the table reads right-to-left (center stays center). LTR keeps legacy order.
  const ordered: ComponentColumn[] =
    direction === 'rtl'
      ? [...baseColumns].reverse().map((c) => ({
          ...c,
          align: (c.align === 'left' ? 'right' : c.align === 'right' ? 'left' : c.align) as
            | 'left'
            | 'center'
            | 'right',
        }))
      : baseColumns;

  const heading = createBilingualSectionHeader(
    en(block.title, 'Components'),
    bilingual ? ar(block.title, language) : null,
  ) as Content;

  // Premium light finish: white header with dark bold labels (consistent with
  // the line-item / device tables); legacy filled band otherwise.
  const light = resolvePresentation(engine.config).tableHeaderStyle === 'light';
  const headerFill = light
    ? PDF_COLORS.white
    : resolveSectionFill(engine.config, sectionKey, PDF_COLORS.headerBg);
  const headerText = light ? PDF_COLORS.text : readableTextOn(headerFill);
  const headerRow: TableCell[] = ordered.map((c) => ({
    text: resolveLabel(c.label, language),
    style: 'tableHeader',
    fillColor: headerFill,
    color: headerText,
    alignment: c.align,
    ...(light ? { fontSize: 8.5 } : {}),
  }));

  const body: TableCell[][] = [headerRow];
  for (const row of block.rows) {
    body.push(
      ordered.map((c) => ({
        text: safeString(row[c.field]) || (c.field === 'calculation' ? '-' : ''),
        fontSize: 9,
        color: c.field === 'calculation' ? PDF_COLORS.textLight : PDF_COLORS.text,
        alignment: c.align,
        margin: [4, 3, 4, 3],
      })),
    );
  }

  // Total row: label in the leading cell, amount in the trailing cell, the
  // middle cell blank — placed by field so it follows the RTL column order.
  const totalCells: TableCell[] = ordered.map((c) => {
    const base = {
      fontSize: 9,
      bold: true,
      color: PDF_COLORS.text,
      fillColor: PDF_COLORS.background,
      margin: [4, 4, 4, 4] as [number, number, number, number],
      alignment: c.align,
    };
    if (c.field === 'component') return { ...base, text: resolveLabel(block.total.label, language) };
    if (c.field === 'amount') return { ...base, text: safeString(block.total.amount) };
    return { ...base, text: '' };
  });
  body.push(totalCells);

  const widths = ordered.map((c) => c.width);

  return {
    stack: [
      heading,
      {
        table: { headerRows: 1, widths, body },
        layout: light
          ? {
              hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
                i === 0 || i === 1 || i === node.table.body.length ? 0.75 : 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => PDF_COLORS.border,
              vLineColor: () => PDF_COLORS.border,
            }
          : {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => PDF_COLORS.border,
              vLineColor: () => PDF_COLORS.border,
            },
        margin: [0, 0, 0, 12],
      },
    ],
  };
}
