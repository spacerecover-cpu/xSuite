/**
 * Inline lucide icon SVGs for the Typst assembler's info-box header bands —
 * the same `user` (recipient) / `file-text` (details/bank) icons the pdfmake
 * renderer embeds via getGeneralIconSvg(), so the Typst output matches 1:1.
 *
 * Attributes use SINGLE quotes so the whole string can be embedded inside a
 * Typst double-quoted string literal — `image(bytes("<svg …>"), format: "svg")`
 * — without any escaping. The stroke is a fixed slate (#475569); these icons are
 * intentionally NOT themed (PDFs stay neutral across themes — see DESIGN.md).
 */

const STROKE = '#475569';

export const ICON_USER_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${STROKE}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>`;

export const ICON_DOC_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${STROKE}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M16 13H8'/><path d='M16 17H8'/><path d='M10 9H8'/></svg>`;
