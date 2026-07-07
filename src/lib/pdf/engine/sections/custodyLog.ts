/**
 * Custody-log section — the forensic chain-of-custody ENTRIES table for a
 * Chain-of-Custody report. Columns are config-driven (`visible` / `label` /
 * `width` / `order`) resolved into {@link CustodyLogBlock.columns}, exactly like
 * {@link renderDevices} for the device table and {@link renderLineItems} for
 * financial line items.
 *
 * Generalized from the entries table + legal notice hand-written in
 * `documents/ChainOfCustodyDocument.ts` (entries table lines ~196-288, legal
 * notice ~81-121). Three custody-specific behaviours beyond the generic table:
 *
 *  - the table MIRRORS under RTL via `mirrorColumns` (reverse order + swap
 *    alignment), the same as the device / line-item tables;
 *  - the `actionCategory` column renders a colour-coded BADGE keyed off the RAW
 *    category string (creation / modification / access / transfer / verification
 *    / communication / evidence_handling / financial / critical_event) using the
 *    same palette as the legacy builder, instead of plain text; and
 *  - a forensic LEGAL-NOTICE box (immutability / tamper warning) is rendered
 *    above the table when the adapter supplies one.
 *
 * The adapter stringifies every cell, passes the RAW `action_category` through
 * the `actionCategory` column key so this renderer can colour it, and only emits
 * `hash` / `signature` columns when `includeHashes` / `includeSignatures` is on.
 * Returns null when there are no visible columns or no entries.
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import { PDF_COLORS, createBilingualSectionHeader } from '../../styles';
import { resolveSectionFill, resolvePresentation } from '../branding';
import { readableTextOn } from '../palette';
import type {
  EngineContext,
  EngineDocData,
  ResolvedColumn,
  SectionRenderer,
} from '../types';
import { isBilingualMode, en, ar, resolveLabel } from '../labels';
import { engineLayoutDirection, mirrorColumns } from '../rtl';

/**
 * Action-category fill colours, mirroring the legacy `categoryColors` map in
 * `documents/ChainOfCustodyDocument.ts` so the engine output matches the
 * hand-written report's colour language.
 */
const CATEGORY_COLORS: Record<string, string> = {
  creation: '#D1FAE5',
  modification: '#DBEAFE',
  access: '#E9D5FF',
  transfer: '#FED7AA',
  verification: '#CCFBF1',
  communication: '#E0E7FF',
  evidence_handling: '#CFFAFE',
  financial: '#D1FAE5',
  critical_event: '#FECACA',
};

/** Humanize a raw snake_case category/type into "Title Case With Spaces". */
function humanize(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build the colour-coded category badge cell for the `actionCategory` column. */
function categoryBadgeCell(rawCategory: string, align: 'left' | 'center' | 'right'): TableCell {
  const text = rawCategory ? humanize(rawCategory) : '-';
  if (!rawCategory) {
    const style = align === 'right' ? 'tableCellRight' : align === 'center' ? 'tableCellCenter' : 'tableCell';
    return { text: '-', style };
  }
  const fill = CATEGORY_COLORS[rawCategory] || PDF_COLORS.headerBg;
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text,
            fontSize: 7,
            bold: true,
            color: '#334155',
            fillColor: fill,
            alignment: 'center',
            margin: [2, 2, 2, 2],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 1,
      paddingBottom: () => 1,
    },
    margin: [2, 3, 2, 3],
  };
}

function headerAlignment(col: ResolvedColumn): 'left' | 'center' | 'right' {
  return col.align ?? 'left';
}

export const renderCustodyLog: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const log = data.custodyLog;
  if (!log) return null;

  const { language } = engine.config;
  const direction = engineLayoutDirection(language);
  // Under RTL mirror the column order (reverse) and swap each column's
  // left/right alignment so the table reads right-to-left. `mirrorColumns`
  // returns the input unchanged for LTR, so English-only output is untouched.
  const columns = mirrorColumns(log.columns.filter((c) => c.visible), direction);
  if (columns.length === 0 || log.rows.length === 0) return null;

  const bilingual = isBilingualMode(language);

  const heading = createBilingualSectionHeader(
    en(log.title, 'Chain of Custody Entries'),
    bilingual ? ar(log.title, language) : null,
  ) as Content;

  // Header row: per-section fill (default keeps the navy 'tableHeader' look) with
  // auto-contrast text so a custom fill stays readable. The premium light finish
  // uses the white header + dark labels, consistent with the other data tables.
  const light = resolvePresentation(engine.config).tableHeaderStyle === 'light';
  const headerFill = light
    ? PDF_COLORS.white
    : resolveSectionFill(engine.config, 'custodyLog', PDF_COLORS.primary);
  const headerText = light ? PDF_COLORS.text : readableTextOn(headerFill);
  const headerRow: TableCell[] = columns.map((col) => ({
    text: resolveLabel(col.label, language),
    style: 'tableHeader',
    fillColor: headerFill,
    color: headerText,
    alignment: light ? (col.align ?? 'left') : headerAlignment(col),
    ...(light ? { fontSize: 8.5 } : {}),
  }));

  const body: TableCell[][] = [headerRow];

  log.rows.forEach((row, index) => {
    // Zebra striping matches the legacy entries table (white / subtle bg).
    const bgColor = index % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.background;
    body.push(
      columns.map((col): TableCell => {
        const raw = row[col.key];
        const text = raw === undefined || raw === null ? '' : String(raw);
        const align = col.align ?? 'left';
        if (col.key === 'actionCategory') {
          // Badge cell carries its own fill; still sit it on the zebra row bg.
          return { ...(categoryBadgeCell(text, align) as object), fillColor: bgColor } as TableCell;
        }
        const style =
          align === 'right' ? 'tableCellRight' : align === 'center' ? 'tableCellCenter' : 'tableCell';
        return { text, style, fillColor: bgColor };
      }),
    );
  });

  // Column widths: explicit point widths where given, else star-sized so the
  // table fits the printable width regardless of how many columns are visible.
  const widths = columns.map((col) => (col.width !== undefined ? col.width : '*'));

  const stack: Content[] = [];

  // Forensic legal-notice box above the entries (immutability / tamper warning).
  if (log.legalNotice && en(log.legalNotice)) {
    stack.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: resolveLabel(log.legalNotice, language),
              fontSize: 7,
              color: '#78350F',
              lineHeight: 1.3,
              fillColor: '#FFF3CD',
              margin: [8, 6, 8, 6],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => '#FCD34D',
        vLineColor: () => '#FCD34D',
      },
      margin: [0, 0, 0, 10],
    });
  }

  stack.push(heading);
  stack.push({
    table: { headerRows: 1, widths, body },
    layout: {
      hLineWidth: (i: number) => (i <= 1 ? 1 : 0.5),
      vLineWidth: () => 0.5,
      hLineColor: (i: number) => (i <= 1 ? PDF_COLORS.primary : PDF_COLORS.border),
      vLineColor: () => PDF_COLORS.border,
    },
    margin: [0, 0, 0, 10],
  });

  return { stack };
};
