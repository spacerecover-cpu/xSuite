/**
 * pageGeometry — the one place that resolves a template's physical page box and
 * the widths derived from it.
 *
 * Section renderers used to hardcode `x2: 525` for their divider rules — the
 * A4-portrait content width (595.28 minus a 35pt inset each side). That silently
 * assumed one sheet and one orientation: on Letter the rule fell ~52pt short, on
 * landscape A4 it spanned about 62% of the page, and with narrow custom margins
 * it overflowed the text column. These helpers replace that constant so every
 * rule follows the page it is actually drawn on.
 *
 * Lives in its own module because `renderTemplate` imports the section
 * renderers — sections importing back from `renderTemplate` would be circular.
 */

import type { DocumentTemplateConfig } from '../templateConfig';

/** Point dimensions of the predefined sheets, portrait. */
export const SHEET_POINTS: Record<'A4' | 'LETTER', [number, number]> = {
  A4: [595.28, 841.89],
  LETTER: [612, 792],
};

/** Minimum printable content box we refuse to shrink below (1 inch each way). */
export const MIN_CONTENT_POINTS = 72;

/**
 * The inset the page footer blocks apply on each side (`margin: [35, …, 35, …]`
 * in `sections/footer.ts` / `reportFooter.ts`). Exported so the divider width
 * inside those blocks is derived from the same number rather than re-guessed.
 */
export const FOOTER_SIDE_INSET = 35;

type PaperLike = Pick<DocumentTemplateConfig['paper'], 'size' | 'orientation' | 'margins' | 'dimensions'>;

/**
 * The page box in points, honouring a custom size and swapping the axes for
 * landscape (matching how pdfmake lays the sheet out). A `'custom'` size with no
 * usable dimensions degrades to A4, mirroring `renderTemplate`.
 */
export function resolvePageBox(paper: PaperLike): { width: number; height: number } {
  const dims = paper.size === 'custom' ? paper.dimensions : undefined;
  const valid = dims && dims[0] > 0 && dims[1] > 0 ? dims : undefined;
  const [sheetW, sheetH] = valid ?? SHEET_POINTS[paper.size === 'Letter' ? 'LETTER' : 'A4'];
  return paper.orientation === 'landscape'
    ? { width: sheetH, height: sheetW }
    : { width: sheetW, height: sheetH };
}

/**
 * Clamp `[left, top, right, bottom]` so the content box can never collapse.
 *
 * Margins are tenant-configurable and also arrive from stored configs, the
 * gallery and hand-edited JSON — not just the Studio inputs — so the guard lives
 * here rather than only in the UI. Without it, a margin pair wider than the
 * sheet yields a zero/negative content width and pdfmake emits a blank or broken
 * page. Each axis is scaled down proportionally so the layout keeps its intended
 * balance instead of one side absorbing the whole correction.
 */
export function clampPageMargins(
  margins: [number, number, number, number],
  pageWidth: number,
  pageHeight: number,
): [number, number, number, number] {
  const fit = (near: number, far: number, extent: number): [number, number] => {
    const a = Math.max(0, Number.isFinite(near) ? near : 0);
    const b = Math.max(0, Number.isFinite(far) ? far : 0);
    const budget = extent - MIN_CONTENT_POINTS;
    if (budget <= 0) return [0, 0];
    const total = a + b;
    if (total <= budget) return [a, b];
    const scale = budget / total;
    return [Math.floor(a * scale), Math.floor(b * scale)];
  };
  const [left, right] = fit(margins[0], margins[2], pageWidth);
  const [top, bottom] = fit(margins[1], margins[3], pageHeight);
  return [left, top, right, bottom];
}

/**
 * Width available to BODY content — the page minus its (clamped) side margins.
 * Use for rules drawn in the content stream, e.g. the header's brand divider.
 */
export function contentWidth(paper: PaperLike): number {
  const box = resolvePageBox(paper);
  const css = paper.margins;
  const [left, , right] = clampPageMargins([css[3], css[0], css[1], css[2]], box.width, box.height);
  return Math.max(1, Math.round(box.width - left - right));
}

/**
 * Width available INSIDE a page-footer block, which applies its own fixed
 * {@link FOOTER_SIDE_INSET} rather than the page margins.
 */
export function footerContentWidth(paper: PaperLike): number {
  const box = resolvePageBox(paper);
  return Math.max(1, Math.round(box.width - FOOTER_SIDE_INSET * 2));
}
