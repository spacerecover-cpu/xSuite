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

import type { DocumentTemplateConfig, PaperConfig } from '../templateConfig';

/**
 * Point dimensions of pdfmake's predefined sheets, portrait. Keyed by the name
 * pdfmake itself uses (`LETTER`/`LEGAL` uppercase, the ISO A sizes as-is), and
 * copied from pdfmake's own `standardPageSizes` table so the clamp and the
 * derived rule widths agree with the box pdfmake actually lays out.
 */
export const SHEET_POINTS: Record<'A3' | 'A4' | 'A5' | 'LEGAL' | 'LETTER', [number, number]> = {
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  LEGAL: [612, 1008],
  LETTER: [612, 792],
};

/**
 * Config `paper.size` → the pdfmake predefined sheet name (which doubles as the
 * {@link SHEET_POINTS} key). The one place the two vocabularies are bridged —
 * `renderTemplate` reads it for `pageSize`, this module for the page box, so a
 * new sheet cannot be added to one and forgotten in the other.
 */
export const PREDEFINED_SHEET: Record<
  Exclude<PaperConfig['size'], 'custom'>,
  keyof typeof SHEET_POINTS
> = {
  A3: 'A3',
  A4: 'A4',
  A5: 'A5',
  Legal: 'LEGAL',
  Letter: 'LETTER',
};

/** Minimum printable content box we refuse to shrink below (1 inch each way). */
export const MIN_CONTENT_POINTS = 72;

/**
 * The inset the page-footer blocks applied on each side before RND-03
 * (`margin: [35, …, 35, …]` in `sections/footer.ts` / `reportFooter.ts`).
 * Retained as the calibration point for {@link FOOTER_OUTDENT}, not as a
 * hardcoded geometry constant.
 */
export const FOOTER_SIDE_INSET = 35;

/** The engine's built-in A4 side margin, which the 35pt inset was paired with. */
const LEGACY_PAGE_SIDE_MARGIN = 40;

/**
 * How far OUTSIDE the body text column the page-footer block sits, in points.
 *
 * The page footer used to inset a flat 35pt while the engine's page margins
 * default to 40 — a 5pt outdent that no config could influence, so a 20pt or
 * 60pt template got a footer visibly detached from its text column (RND-03), and
 * the case-label sheet (16pt margins) was out by 19pt.
 *
 * The inset now TRACKS the configured margins while preserving that 5pt
 * relationship, rather than re-aligning flush. That keeps the default template
 * byte-identical (40 − 5 = 35, divider 525) instead of silently nudging the
 * footer of every document already in the field by 5pt.
 */
export const FOOTER_OUTDENT = LEGACY_PAGE_SIDE_MARGIN - FOOTER_SIDE_INSET;

type PaperLike = Pick<DocumentTemplateConfig['paper'], 'size' | 'orientation' | 'margins' | 'dimensions'>;

/**
 * The page box in points, honouring a custom size and swapping the axes for
 * landscape (matching how pdfmake lays the sheet out). A `'custom'` size with no
 * usable dimensions degrades to A4, mirroring `renderTemplate`.
 */
export function resolvePageBox(paper: PaperLike): { width: number; height: number } {
  const dims = paper.size === 'custom' ? paper.dimensions : undefined;
  const valid = dims && dims[0] > 0 && dims[1] > 0 ? dims : undefined;
  const sheet = paper.size === 'custom' ? 'A4' : (PREDEFINED_SHEET[paper.size] ?? 'A4');
  const [sheetW, sheetH] = valid ?? SHEET_POINTS[sheet];
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

/** The clamped `[left, right]` page margins in points, from the CSS-order tuple. */
export function sideMargins(paper: PaperLike): [number, number] {
  const box = resolvePageBox(paper);
  const css = paper.margins;
  const [left, , right] = clampPageMargins([css[3], css[0], css[1], css[2]], box.width, box.height);
  return [left, right];
}

/**
 * Width available to BODY content — the page minus its (clamped) side margins.
 * Use for rules drawn in the content stream, e.g. the header's brand divider.
 */
export function contentWidth(paper: PaperLike): number {
  const box = resolvePageBox(paper);
  const [left, right] = sideMargins(paper);
  return Math.max(1, Math.round(box.width - left - right));
}

/**
 * The `[left, right]` inset a page-footer block applies — the page margins
 * carrying the constant {@link FOOTER_OUTDENT}. Default margins reproduce the
 * legacy `[35, 35]` exactly.
 */
export function footerSideInsets(paper: PaperLike): [number, number] {
  const [left, right] = sideMargins(paper);
  return [
    Math.max(0, Math.round(left - FOOTER_OUTDENT)),
    Math.max(0, Math.round(right - FOOTER_OUTDENT)),
  ];
}

/**
 * The full pdfmake `margin` tuple for a page-footer block: the resolved side
 * insets with the block's own vertical padding. Both footer builders go through
 * this so the block and its divider rule can never disagree.
 */
export function footerBlockMargin(
  paper: PaperLike,
  top: number,
  bottom: number,
): [number, number, number, number] {
  const [left, right] = footerSideInsets(paper);
  return [left, top, right, bottom];
}

/**
 * Width available INSIDE a page-footer block — the page minus
 * {@link footerSideInsets}. Kept in lockstep with {@link footerBlockMargin} so
 * the divider rule always spans exactly the block it is drawn in.
 */
export function footerContentWidth(paper: PaperLike): number {
  const box = resolvePageBox(paper);
  const [left, right] = footerSideInsets(paper);
  return Math.max(1, Math.round(box.width - left - right));
}
