/**
 * RTL + bilingual layout helpers for the engine (M6).
 *
 * The engine derives its reading DIRECTION from the resolved
 * {@link LanguageConfig} (NOT from `ctx.isRTL` alone), so the same config that
 * decides EN vs AR also decides LTR vs RTL. When Arabic leads — `mode === 'ar'`,
 * or a bilingual mode with `primary === 'ar'` — the document flips to RTL:
 *
 *  - the document `defaultStyle.font` becomes the Arabic family (Tajawal) so
 *    Arabic glyphs shape, and `defaultStyle.alignment` becomes `'right'`;
 *  - line-item / payment-history tables MIRROR their column order (reverse the
 *    columns and swap each cell's left/right alignment) so the table reads
 *    right-to-left;
 *  - totals labels stay right-aligned (already correct for RTL).
 *
 * ── HONEST LIMIT ───────────────────────────────────────────────────────────
 * pdfmake has NO Unicode BiDi algorithm. It lays glyphs left-to-right in logical
 * order and only reverses the Arabic *presentation forms* it is handed. That
 * means a single text run that MIXES Arabic + Latin + digits (e.g.
 * "VAT ضريبة 5%") is NOT fully reordered to visual order — the Latin/number
 * segments keep their logical position inside the run instead of jumping to the
 * correct visual side. We get the best achievable fidelity with: correct fonts,
 * right alignment, and column mirroring (this module). TRUE bidi fidelity needs
 * either the `@digicole/pdfmake-rtl` fork (a forked pdfmake with a bidi pass) or
 * an HTML → Chromium (Puppeteer) render path. Both are FLAGGED FUTURE decisions
 * — neither is installed here (no new npm packages were added). To minimise the
 * artefact today, adapters/labels keep Arabic and Latin/number content in
 * SEPARATE runs/cells wherever possible (e.g. currency stays its own cell), so
 * the unshaped-mix case is the exception, not the rule.
 */

import { getFontFamily } from '../fonts';
import type { LanguageConfig, LabelText } from '../templateConfig';

export type LayoutDirection = 'ltr' | 'rtl';

/** The Arabic font family the engine tags Arabic runs with. */
const ARABIC_FONT = 'Tajawal';

/** A pdfmake inline text run, optionally pinned to a specific font family. */
export interface FontRun {
  text: string;
  font?: string;
}

/** Horizontal text alignment values the engine swaps under RTL. */
export type HAlign = 'left' | 'center' | 'right';

/**
 * The reading direction implied by a language config. RTL exactly when Arabic
 * is the leading language (single `ar`, or a bilingual mode with `primary: 'ar'`).
 */
export function engineLayoutDirection(language: LanguageConfig): LayoutDirection {
  const arabicLeads =
    language.mode === 'ar' ||
    ((language.mode === 'bilingual_stacked' || language.mode === 'bilingual_sidebyside') &&
      language.primary === 'ar');
  return arabicLeads ? 'rtl' : 'ltr';
}

/**
 * The document `defaultStyle.font` for a language config. ANY document that
 * includes Arabic — single Arabic (`ar`) OR either bilingual mode (even with
 * English leading) — needs the Arabic family so Arabic glyphs shape. Tajawal
 * covers Latin too, so the English half of a bilingual document still renders
 * correctly. Only pure English keeps the tenant/base font.
 *
 * pdfmake resolves the family name from its VFS at render time (callers preload
 * fonts via `preloadAllFonts()` / `initializePDFFonts('ar')`). We ask
 * `getFontFamily('ar')` first so a loaded Tajawal is used, and fall back to the
 * literal Arabic family name so the doc-definition is deterministic even before
 * fonts have loaded (the engine must produce a stable definition; font binaries
 * are resolved later).
 */
export function engineDefaultFont(language: LanguageConfig, baseFont: string): string {
  if (language.mode === 'en') return baseFont;
  // `getFontFamily('ar')` returns 'Tajawal' only when the family is already
  // loaded into pdfmake's VFS, else 'Roboto'. For an Arabic-containing document
  // we always want the Arabic family in the definition (binaries are resolved at
  // render time by the caller's font preload), so coerce to it explicitly.
  const arabicFamily = getFontFamily('ar');
  return arabicFamily === 'Tajawal' ? arabicFamily : 'Tajawal';
}

/**
 * Build per-run text for a bilingual label so EACH language renders in the right
 * font, even when the DOCUMENT default font is the other language's family.
 *
 * pdfmake shapes glyphs with whatever font a run resolves to. If an Arabic
 * string is emitted inside a run whose font is a Latin family (e.g. an
 * English-primary bilingual document whose `defaultStyle.font` is Roboto), the
 * Arabic glyphs do NOT shape. Splitting the label into discrete runs — English
 * pinned to the base font, Arabic pinned to the Arabic family — fixes the
 * *per-run* shaping. The runs are returned in reading order (primary first) with
 * a " | " separator between them, mirroring `resolveLabel`'s joined form but as
 * structured runs instead of one mixed string.
 *
 * ── LIMIT (same bidi caveat as the module header) ──────────────────────────
 * This fixes per-run FONT selection, not per-run REORDERING. pdfmake still lays
 * the runs in array order; it has no bidi pass to move a trailing Latin run to
 * the visual left of an Arabic run. For pure single-language runs (the common
 * case) this is correct; for a label that itself mixes scripts+digits the
 * residual ordering artefact described in the file header remains.
 *
 * @returns An array of {@link FontRun}s suitable as a pdfmake `text:` value.
 */
export function bilingualLabelRuns(
  label: LabelText,
  language: LanguageConfig,
  baseFont: string,
): FontRun[] {
  const english = label.en ?? '';
  const arabic = label.ar ?? null;

  if (language.mode === 'en') return [{ text: english }];
  if (language.mode === 'ar') {
    // Arabic-only: a single Arabic run in the Arabic family (falls back to the
    // English text when no Arabic string was supplied).
    return arabic ? [{ text: arabic, font: ARABIC_FONT }] : [{ text: english, font: baseFont }];
  }

  // Bilingual: both runs, primary first, separated by " | ". Each run is pinned
  // to its own font so the Arabic shapes regardless of the document default.
  const englishRun: FontRun = { text: english, font: baseFont };
  if (!arabic) return [englishRun];
  const arabicRun: FontRun = { text: arabic, font: ARABIC_FONT };
  const sep: FontRun = { text: ' | ', font: baseFont };
  return language.primary === 'ar' ? [arabicRun, sep, englishRun] : [englishRun, sep, arabicRun];
}

/** Swap left↔right (center is unchanged) — used when mirroring table cells. */
export function mirrorAlign(align: HAlign | undefined): HAlign {
  if (align === 'left') return 'right';
  if (align === 'right') return 'left';
  return align ?? 'left';
}

/**
 * Mirror a list of table columns for RTL: reverse the column order so the
 * first-read column sits on the right, and swap each column's horizontal
 * alignment. Returns a NEW array (inputs untouched). For LTR the input is
 * returned unchanged.
 */
export function mirrorColumns<T extends { align?: HAlign }>(
  columns: T[],
  direction: LayoutDirection,
): T[] {
  if (direction !== 'rtl') return columns;
  return [...columns].reverse().map((col) => ({ ...col, align: mirrorAlign(col.align) }));
}
