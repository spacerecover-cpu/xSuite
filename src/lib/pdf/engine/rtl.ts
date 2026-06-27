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
import { isRTLLanguage, type LanguageCode } from '../../documentTranslations';
import { resolveSecondary, secondaryText, type LanguageConfig, type LabelText } from '../templateConfig';

export type LayoutDirection = 'ltr' | 'rtl';

/** The Arabic font family the engine tags Arabic runs with. */
const ARABIC_FONT = 'Tajawal';

/**
 * The pdfmake font family that SHAPES a given secondary language's script.
 * Non-Latin scripts need their own family (Arabic→Tajawal, Korean→NotoSansKR,
 * Thai→NotoSansThai); Cyrillic (ru/uk) and Latin (pl/cs/tr/fr/de/it/es/pt) all
 * shape in the base Latin family (Roboto), so they return `null` (= "use the
 * base font"). The actual binaries are resolved from pdfmake's VFS at render
 * time; the engine only needs the deterministic family NAME in the definition.
 */
function secondaryFontFamily(secondary: LanguageCode | null): string | null {
  switch (secondary) {
    case 'ar':
      return ARABIC_FONT;
    case 'ko':
      return 'NotoSansKR';
    case 'th':
      return 'NotoSansThai';
    default:
      // Cyrillic (ru, uk) + Latin (pl, cs, tr, fr, de, it, es, pt) → base/Roboto.
      return null;
  }
}

/** A pdfmake inline text run, optionally pinned to a specific font family. */
export interface FontRun {
  text: string;
  font?: string;
}

/** Horizontal text alignment values the engine swaps under RTL. */
export type HAlign = 'left' | 'center' | 'right';

/**
 * The reading direction implied by a language config. RTL exactly when an RTL
 * secondary LEADS the document — i.e. the resolved secondary is RTL (Arabic
 * today) AND it is the leading language (single secondary mode `'ar'`, or a
 * bilingual mode with `primary: 'ar'`). For a legacy config (no `secondary`),
 * `resolveSecondary` returns `'ar'`, so this is byte-identical to before; a
 * config with a non-RTL secondary (French, Korean, …) stays LTR.
 */
export function engineLayoutDirection(language: LanguageConfig): LayoutDirection {
  const secondary = resolveSecondary(language);
  const secondaryLeads =
    language.mode === 'ar' ||
    ((language.mode === 'bilingual_stacked' || language.mode === 'bilingual_sidebyside') &&
      language.primary === 'ar');
  return secondaryLeads && isRTLLanguage(secondary) ? 'rtl' : 'ltr';
}

/**
 * The document `defaultStyle.font` for a language config. ANY document that
 * includes a NON-LATIN secondary script — Arabic (`ar`→Tajawal), Korean
 * (`ko`→NotoSansKR), Thai (`th`→NotoSansThai) — needs that script's family so
 * its glyphs shape; those families cover Latin too, so the English half still
 * renders. Cyrillic (ru/uk) and Latin (pl/cs/tr/fr/de/it/es/pt) secondaries —
 * and pure English — keep the tenant/base font. For a legacy config (no
 * `secondary`), `resolveSecondary` returns `'ar'`, so this is byte-identical to
 * the previous Arabic-only behavior.
 *
 * pdfmake resolves the family name from its VFS at render time (callers preload
 * fonts via `preloadAllFonts()` / `initializePDFFonts(secondary)`). We return
 * the literal family name so the doc-definition is deterministic even before
 * fonts have loaded (binaries are resolved later); a font that fails to load
 * degrades to the base font at rasterization without throwing.
 */
export function engineDefaultFont(language: LanguageConfig, baseFont: string): string {
  if (language.mode === 'en') return baseFont;
  const secondary = resolveSecondary(language);
  const family = secondaryFontFamily(secondary);
  // Touch the loader so a loaded family is preferred when present; the literal
  // family name is still returned for determinism (see doc comment).
  if (family) {
    const loaded = getFontFamily(secondary);
    return loaded === family ? loaded : family;
  }
  return baseFont;
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
  const secondaryCode = resolveSecondary(language);
  const secondary = secondaryText(label, secondaryCode) ?? null;
  // The secondary run's font: its non-Latin script family (Arabic/Korean/Thai),
  // or the base font for Latin/Cyrillic secondaries.
  const secondaryFont = secondaryFontFamily(secondaryCode) ?? baseFont;

  if (language.mode === 'en') return [{ text: english }];
  if (language.mode === 'ar') {
    // Secondary-only: a single secondary run in the secondary family (falls back
    // to the English text when no secondary string was supplied).
    return secondary
      ? [{ text: secondary, font: secondaryFont }]
      : [{ text: english, font: baseFont }];
  }

  // Bilingual: both runs, primary first, separated by " | ". Each run is pinned
  // to its own font so a non-Latin secondary shapes regardless of the document
  // default.
  const englishRun: FontRun = { text: english, font: baseFont };
  if (!secondary) return [englishRun];
  const secondaryRun: FontRun = { text: secondary, font: secondaryFont };
  const sep: FontRun = { text: ' | ', font: baseFont };
  return language.primary === 'ar' ? [secondaryRun, sep, englishRun] : [englishRun, sep, secondaryRun];
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
