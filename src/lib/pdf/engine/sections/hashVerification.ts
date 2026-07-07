/**
 * Hash-verification section — the forensic HASH-VERIFICATION table for a
 * Chain-of-Custody report: one row per ledger entry that carries a cryptographic
 * hash, with columns entry # / algorithm / hash value.
 *
 * Restored from the legacy `buildHashSection` in
 * `documents/ChainOfCustodyDocument.ts` (lines ~290-340), which the M2 engine
 * folded into an inline `hash` custody-log column. Bringing it back as a
 * dedicated table matches the legacy structure (a separate Hash Verification
 * table, gated on `includeHashes`) so the engine custody report is forensically
 * complete before the chain_of_custody flag flips.
 *
 * Built from the same config-driven column + RTL-mirror pattern as
 * `renderCustodyLog` / `renderPaymentHistory`: the adapter resolves the columns
 * into {@link ResolvedColumn}s and stringifies every cell; this renderer lays out
 * the header + body, applies per-column alignment, mirrors under RTL via
 * `mirrorColumns`, and renders the hash value in a monospace (Courier) run for
 * legibility — parity with the legacy table's `font: 'Courier'` hash cell.
 * Returns null when the adapter omitted the block (option off / no hashes).
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
import { resolvePresentation } from '../branding';
import { engineLayoutDirection, mirrorColumns } from '../rtl';

function headerAlignment(col: ResolvedColumn): 'left' | 'center' | 'right' {
  return col.align ?? 'left';
}

export const renderHashVerification: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const block = data.hashVerification;
  if (!block) return null;

  const { language } = engine.config;
  const direction = engineLayoutDirection(language);
  // Mirror column order + alignment under RTL (no-op for LTR), exactly like the
  // custody-log and payment-history tables.
  const columns = mirrorColumns(block.columns.filter((c) => c.visible), direction);
  if (columns.length === 0 || block.rows.length === 0) return null;

  const bilingual = isBilingualMode(language);

  const heading = createBilingualSectionHeader(
    en(block.title, 'Hash Verification'),
    bilingual ? ar(block.title, language) : null,
  ) as Content;

  // Premium light finish: white header + dark bold labels, consistent with the
  // other data tables; the legacy navy 'tableHeader' style otherwise.
  const light = resolvePresentation(engine.config).tableHeaderStyle === 'light';
  const headerRow: TableCell[] = columns.map((col) => ({
    text: resolveLabel(col.label, language),
    style: 'tableHeader',
    alignment: light ? (col.align ?? 'left') : headerAlignment(col),
    ...(light ? { fillColor: PDF_COLORS.white, color: PDF_COLORS.text, fontSize: 8.5 } : {}),
  }));

  const body: TableCell[][] = [headerRow];
  block.rows.forEach((row) => {
    body.push(
      columns.map((col): TableCell => {
        const raw = row[col.key];
        const text = raw === undefined || raw === null ? '' : String(raw);
        const align = col.align ?? 'left';
        const style =
          align === 'right' ? 'tableCellRight' : align === 'center' ? 'tableCellCenter' : 'tableCell';
        // The hash value renders in Courier (monospace), parity with the legacy
        // builder's hash cell, so long hex strings stay legible.
        if (col.key === 'hash') {
          return { text, style, font: 'Courier', fontSize: 6, color: PDF_COLORS.textLight };
        }
        return { text, style };
      }),
    );
  });

  const widths = columns.map((col) => (col.width !== undefined ? col.width : '*'));

  return {
    stack: [
      heading,
      {
        table: { headerRows: 1, widths, body },
        layout: {
          hLineWidth: (i: number) => (i <= 1 ? 1 : 0.5),
          vLineWidth: () => 0.5,
          hLineColor: (i: number) => (i <= 1 ? PDF_COLORS.primary : PDF_COLORS.border),
          vLineColor: () => PDF_COLORS.border,
        },
        margin: [0, 0, 0, 10],
      },
    ],
  };
};
