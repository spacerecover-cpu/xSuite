/**
 * Devices section — the device intake/return TABLE for case documents. Columns
 * are config-driven (`visible` / `label` / `width` / `order`) resolved into
 * {@link DevicesBlock.columns}, exactly like {@link renderLineItems} for
 * financial line items.
 *
 * Generalized from the "Device(s) Received / Returned" table hand-written in
 * `documents/OfficeReceiptDocument.ts` (lines ~182-265) and
 * `documents/CheckoutFormDocument.ts` (lines ~193-276). Two device-specific
 * behaviours beyond the generic line-item table:
 *
 *  - the table MIRRORS under RTL via `mirrorColumns` (reverse order + swap
 *    alignment), the same as the line-item table; and
 *  - the `role` column renders a coloured role BADGE (Patient / Backup / Donor /
 *    Spare) via `getRoleBadgeColors` + `getSimpleRoleLabel`, instead of plain
 *    text — matching the legacy builders' inline badge table.
 *
 * The adapter stringifies every cell; for the role column it passes the raw role
 * string through (e.g. `'patient'`) and this renderer maps it to the simple
 * label + badge colours. A `'-'`/empty role renders as a plain dash cell.
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import {
  PDF_COLORS,
  createBilingualSectionHeader,
  getRoleBadgeColors,
  getSimpleRoleLabel,
} from '../../styles';
import type {
  EngineContext,
  EngineDocData,
  ResolvedColumn,
  SectionRenderer,
} from '../types';
import { isBilingualMode, en, ar, resolveLabel } from '../labels';
import { engineLayoutDirection, mirrorColumns } from '../rtl';

/** Build the coloured role-badge cell used for the `role` column. */
function roleBadgeCell(rawRole: string, align: 'left' | 'center' | 'right'): TableCell {
  const roleLabel = getSimpleRoleLabel(rawRole);
  if (roleLabel === '-') {
    const style = align === 'right' ? 'tableCellRight' : align === 'center' ? 'tableCellCenter' : 'tableCell';
    return { text: '-', style };
  }
  const roleColors = getRoleBadgeColors(rawRole);
  return {
    table: {
      widths: ['auto'],
      body: [
        [
          {
            text: roleLabel,
            fontSize: 8,
            bold: true,
            color: roleColors.text,
            fillColor: roleColors.bg,
            margin: [8, 2, 8, 2],
            alignment: 'center',
            noWrap: true,
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
    margin: [2, 3, 2, 3],
  };
}

function headerAlignment(col: ResolvedColumn): 'left' | 'center' | 'right' {
  return col.align ?? 'left';
}

export const renderDevices: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const dev = data.devices;
  if (!dev) return null;

  const { language } = engine.config;
  const direction = engineLayoutDirection(language);
  // Under RTL mirror the column order (reverse) and swap each column's
  // left/right alignment so the table reads right-to-left. `mirrorColumns`
  // returns the input unchanged for LTR, so English-only output is untouched.
  const columns = mirrorColumns(dev.columns.filter((c) => c.visible), direction);
  if (columns.length === 0) return null;

  const bilingual = isBilingualMode(language);

  // Section heading ("Device(s) Received" / "Device(s) Returned"), bilingual
  // when the mode asks for it.
  const heading = createBilingualSectionHeader(
    en(dev.title, 'Devices'),
    bilingual ? ar(dev.title) : null,
  ) as Content;

  // Header row: one cell per visible column, label resolved by language mode.
  const headerRow: TableCell[] = columns.map((col) => ({
    text: resolveLabel(col.label, language),
    style: 'tableHeader',
    fillColor: PDF_COLORS.headerBg,
    color: PDF_COLORS.text,
    alignment: headerAlignment(col),
  }));

  const body: TableCell[][] = [headerRow];

  for (const row of dev.rows) {
    body.push(
      columns.map((col): TableCell => {
        const raw = row[col.key];
        const text = raw === undefined || raw === null ? '' : String(raw);
        const align = col.align ?? 'left';
        if (col.key === 'role') {
          return roleBadgeCell(text, align);
        }
        const style =
          align === 'right' ? 'tableCellRight' : align === 'center' ? 'tableCellCenter' : 'tableCell';
        return { text, style };
      }),
    );
  }

  // Column widths: explicit point widths where given, else star-sized so the
  // table fits the printable width regardless of how many columns are visible.
  const widths = columns.map((col) => (col.width !== undefined ? col.width : '*'));

  return {
    stack: [
      heading,
      {
        table: { headerRows: 1, widths, body },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => PDF_COLORS.border,
          vLineColor: () => PDF_COLORS.border,
        },
        margin: [0, 0, 0, 8],
      },
    ],
  };
};
