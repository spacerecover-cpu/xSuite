/**
 * Report-summary section — the Option B SUMMARY TILE ROW for a data-recovery
 * report. Up to four compact tinted tiles (Device · Fault · Recoverability ·
 * ETA), each a small card with a bilingual caption and a single value. The
 * Recoverability tile uses the warning/category tone; the rest are neutral.
 *
 * The adapter decides which tiles exist (only tiles with data are emitted) and
 * picks each tile's tone; this renderer lays them out side by side as equal
 * columns. Tile fills/borders are fixed-hex status tones (`PDF_TONES`), NOT brand
 * colour — theme-invariant, so this respects "PDFs stay neutral across themes".
 *
 * RTL-aware: under Arabic-lead layout the tile order is reversed and the caption
 * / value alignment flips, so the row reads right-to-left. Returns null when no
 * tiles are supplied.
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import { resolvePdfTone } from '../../styles';
import type { EngineContext, EngineDocData, ReportSummaryTile, SectionRenderer } from '../types';
import { engineLayoutDirection } from '../rtl';
import { resolveLabel } from '../labels';

function tileCell(
  tile: ReportSummaryTile,
  language: EngineContext['config']['language'],
  align: 'left' | 'right',
): TableCell {
  const tone = resolvePdfTone(tile.tone);
  return {
    stack: [
      {
        text: resolveLabel(tile.caption, language),
        fontSize: 7,
        bold: true,
        color: tone.accent,
        alignment: align,
        characterSpacing: 0.3,
      },
      {
        text: tile.value,
        fontSize: 9,
        bold: true,
        color: tone.text,
        alignment: align,
        margin: [0, 2, 0, 0],
        lineHeight: 1.1,
      },
    ],
    fillColor: tone.bg,
    margin: [8, 6, 8, 6],
  };
}

export const renderReportSummary: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const block = data.reportSummary;
  if (!block || block.tiles.length === 0) return null;

  const { language } = engine.config;
  const rtl = engineLayoutDirection(language) === 'rtl';
  const align: 'left' | 'right' = rtl ? 'right' : 'left';

  const tiles = rtl ? [...block.tiles].reverse() : block.tiles;
  const cells = tiles.map((t) => tileCell(t, language, align));
  const widths = tiles.map(() => '*');
  const tone = resolvePdfTone('neutral');

  return {
    table: { widths, body: [cells] },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 4, // a thin gutter between tiles, painted white below
      hLineColor: () => tone.border,
      vLineColor: () => '#FFFFFF',
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 12],
  };
};
