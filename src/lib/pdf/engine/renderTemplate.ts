/**
 * renderTemplate — the config-driven assembler. Given a resolved
 * {@link DocumentTemplateConfig}, the normalized {@link EngineDocData}, and the
 * translation context (+ optional pre-loaded logo/QR images), it produces a
 * pdfmake {@link TDocumentDefinitions}.
 *
 * Pipeline:
 *   1. Resolve page geometry (size / orientation / margins) from `config.paper`.
 *   2. Set `defaultStyle.font` and `styles` from the tenant font via
 *      `getStylesWithFont` — no styling is invented here.
 *   3. Filter sections by `visible`, sort by `order`, dispatch each through
 *      `SECTION_REGISTRY`, skipping unknown keys and `null` results.
 *   4. Flatten the section outputs into a single `content` array.
 *
 * Pure assembly: no I/O. Image loading happens upstream; this function only
 * places the base64 strings it is handed. It does NOT touch the existing
 * builders — it is the additive engine entry point.
 */

import type { Content, DynamicContent, PageOrientation, PageSize, StyleDictionary, TDocumentDefinitions, Watermark } from 'pdfmake/interfaces';
import { getStylesWithFont, PDF_COLORS, PDF_STYLES } from '../styles';
import type { DocumentTemplateConfig, TypographyStyleKey } from '../templateConfig';
import type { TranslationContext } from '../types';
import type { EngineContext, EngineDocData } from './types';
import { SECTION_REGISTRY } from './registry';
import { renderPartiesMeta, partiesDetailsKey } from './sections/infoBoxes';
import { buildPageFooter } from './sections/footer';
import { engineLayoutDirection, engineDefaultFont } from './rtl';
import {
  resolveColors,
  resolvePageFitting,
  resolvePageNumbers,
  resolveTypography,
  resolveWatermarkSettings,
} from './branding';

/** Spacing/size multiplier per density preset (comfortable = identity/legacy). */
const DENSITY_SCALE: Record<'comfortable' | 'compact' | 'dense', number> = {
  comfortable: 1,
  compact: 0.88,
  dense: 0.78,
};

/** Section keys that can be promoted to the repeating page footer. */
const PAGE_FOOTER_KEYS = new Set(['footer', 'qr']);

/** Named styles the typography group rescales when a tenant configures it. */
const TYPOGRAPHY_STYLE_KEYS: TypographyStyleKey[] = [
  'documentTitle',
  'sectionTitle',
  'tableHeader',
  'tableCell',
  'label',
  'value',
  'totalValue',
  'footer',
  'termsText',
];

/** Substitute `{page}` / `{pages}` tokens in a page-number format string. */
function formatPageNumber(format: string, page: number, pages: number): string {
  return format.replace(/\{page\}/g, String(page)).replace(/\{pages\}/g, String(pages));
}

export function renderTemplate(
  config: DocumentTemplateConfig,
  data: EngineDocData,
  ctx: TranslationContext,
  logo?: import('../brandingImage').BrandingImage | string | null,
  qrCodeBase64?: string | null,
): TDocumentDefinitions {
  const engine: EngineContext = { config, ctx, logo, qrCodeBase64 };

  // 1. Page geometry from config.paper. A `'custom'` size (physical labels)
  // becomes a literal `{ width, height }` page box from `paper.dimensions`; the
  // predefined sizes map to a pdfmake PredefinedPageSize (pdfmake spells "LETTER"
  // uppercase). A `'custom'` size with no dimensions degrades to A4 so a
  // malformed config can never produce an invalid page box.
  let pageSize: PageSize;
  if (config.paper.size === 'custom') {
    const dims = config.paper.dimensions;
    pageSize = dims ? { width: dims[0], height: dims[1] } : 'A4';
  } else {
    pageSize = config.paper.size === 'Letter' ? 'LETTER' : 'A4';
  }
  const pageOrientation: PageOrientation = config.paper.orientation;
  let pageMargins: [number, number, number, number] = config.paper.margins;

  // 2. Visible sections, ascending order, dispatched via the registry.
  const ordered = [...config.sections]
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  // Decide whether the footer/qr sections drive a REPEATING page footer.
  // They do only when a `footer` section is part of the document's TRAILING run
  // (the common case): a contiguous tail of footer/qr sections that includes a
  // `footer`. When a tenant reorders the footer into the body it stays inline
  // (no page footer) so its position is honored, and a trailing `qr` with no
  // accompanying footer also stays inline (it is body content, not chrome).
  // This keeps the page footer generic — documents without a trailing footer
  // get no page-footer callback.
  let trailingFrom = ordered.length;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (PAGE_FOOTER_KEYS.has(ordered[i].key)) {
      trailingFrom = i;
    } else {
      break;
    }
  }
  const trailingKeys = ordered.slice(trailingFrom).map((s) => s.key);
  const promoteToPageFooter = trailingKeys.includes('footer');

  // 3. Flatten the in-body sections. When the trailing run is promoted to the
  // page footer it is excluded here and emitted via the `footer:` callback
  // instead of inline content.
  const bodyEnd = promoteToPageFooter ? trailingFrom : ordered.length;

  // Optional side-by-side customer + details layout. The "details" half is the
  // financial meta box, or (for intake / checkout docs) the case-info box. When
  // enabled and both are visible AND the parties block is a single box (one of
  // from/to — the common case), render them as one equal-height panel at the
  // position of the first of the pair and drop the standalone details section.
  // Falls back to the normal stacked dispatch otherwise (e.g. both from+to
  // present, or one side absent).
  const isVisible = (key: string) => ordered.some((s) => s.key === key);
  const detailsKey = partiesDetailsKey(data);
  const combineParties =
    !!config.layout?.partiesMetaSideBySide &&
    isVisible('parties') &&
    !!detailsKey &&
    isVisible(detailsKey) &&
    !(data.parties?.from && data.parties?.to);
  let partiesComboEmitted = false;

  const content: Content[] = [];
  for (let i = 0; i < bodyEnd; i++) {
    const section = ordered[i];

    if (combineParties && (section.key === 'parties' || section.key === detailsKey)) {
      if (partiesComboEmitted) continue; // the second of the pair — already rendered
      const combined = renderPartiesMeta(engine, data);
      partiesComboEmitted = true;
      if (combined) content.push(combined);
      continue;
    }

    const renderer = SECTION_REGISTRY[section.key];
    if (!renderer) continue; // skip unknown / not-yet-implemented keys safely
    const out = renderer(engine, data);
    if (out == null) continue;
    if (Array.isArray(out)) {
      for (const block of out) content.push(block);
    } else {
      content.push(out);
    }
  }

  // 4. RTL + typography document defaults. Any Arabic-containing document (RTL
  // Arabic-lead OR English-lead bilingual) uses the Arabic-capable family so
  // Arabic glyphs shape — otherwise an English-lead bilingual document would
  // render its Arabic half as missing-glyph boxes. Pure English uses the tenant
  // typography font (which the typography group may swap). Absent typography →
  // today's font (parity). Only RTL (Arabic-lead) flips the default alignment.
  const direction = engineLayoutDirection(config.language);
  const rtlFont = engineDefaultFont(config.language, ctx.fontFamily);
  const typography = resolveTypography(config, rtlFont);
  const usesArabic = config.language.mode !== 'en';
  const baseFont = usesArabic ? rtlFont : typography.fontFamily;
  const defaultStyle =
    direction === 'rtl'
      ? { font: baseFont, alignment: 'right' as const }
      : { font: baseFont };

  // 5. Styles from the base font. When a typography group is present, rescale the
  // named styles (absolute per-style size wins, else the built-in size × scale);
  // absent → today's sizes (parity).
  const styles: StyleDictionary = getStylesWithFont(baseFont);
  if (config.typography) {
    for (const key of TYPOGRAPHY_STYLE_KEYS) {
      styles[key] = { ...styles[key], fontSize: typography.sizeFor(key) };
    }
  }

  // 6. Colors — NEUTRAL by default. With no `colors` group and `branding.accent`
  // === 'inherit', `resolveColors` returns the legacy `PDF_COLORS`, so this is a
  // no-op. The accent (colors.accent → branding.accent → neutral) always drives
  // the section-title + bilingual-header text (and, in `header.ts`, the divider
  // rule + document title). The full body palette (text / label / total) is
  // applied ONLY when a `colors` group is present, so unconfigured templates are
  // byte-for-byte unchanged.
  const colors = resolveColors(config);
  styles.sectionTitle = { ...styles.sectionTitle, color: colors.accent };
  styles.bilingualHeader = { ...styles.bilingualHeader, color: colors.accent };
  if (config.colors) {
    styles.value = { ...styles.value, color: colors.text };
    styles.valueBold = { ...styles.valueBold, color: colors.text };
    styles.tableCell = { ...styles.tableCell, color: colors.text };
    styles.tableCellCenter = { ...styles.tableCellCenter, color: colors.text };
    styles.tableCellRight = { ...styles.tableCellRight, color: colors.text };
    styles.label = { ...styles.label, color: colors.label };
    styles.totalValue = { ...styles.totalValue, color: colors.accent };
  }

  // 6b. Page fitting / density (opt-in). Density tightens margins + font sizes;
  // auto-fit applies an extra reduction (never below the legibility floor) to
  // keep the document on one page. Absent `pageFitting` (or comfortable with no
  // auto-fit) → scale 1 → no change (parity).
  if (config.pageFitting) {
    const fitting = resolvePageFitting(config);
    const densityScale = DENSITY_SCALE[fitting.density];
    const scale = fitting.autoFitOnePage ? Math.max(fitting.minScale, densityScale * 0.9) : densityScale;
    if (scale !== 1) {
      const m = config.paper.margins;
      pageMargins = [
        Math.round(m[0] * scale),
        Math.round(m[1] * scale),
        Math.round(m[2] * scale),
        Math.round(m[3] * scale),
      ];
      for (const key of Object.keys(styles)) {
        const style = styles[key] as { fontSize?: number };
        if (typeof style.fontSize === 'number') {
          styles[key] = { ...styles[key], fontSize: Math.round(style.fontSize * scale * 10) / 10 };
        }
      }
    }
  }

  // 7. Repeating page footer (divider + tagline + website + optional QR) plus an
  // optional page-number line. `buildPageFooter` returns null when there is
  // nothing to render. Page numbers (opt-in) append a line driven by
  // `pageNumbers.format`; when disabled (default) the footer is exactly the base
  // footer — parity preserved.
  const baseFooter = promoteToPageFooter ? buildPageFooter(engine, data) : null;
  const pageNumbers = resolvePageNumbers(config);
  let footer: DynamicContent | undefined;
  if (pageNumbers.enabled) {
    footer = (currentPage, pageCount, currentPageSize) => {
      const base = baseFooter ? baseFooter(currentPage, pageCount, currentPageSize) : null;
      const numberLine: Content = {
        text: formatPageNumber(pageNumbers.format, currentPage, pageCount),
        alignment: pageNumbers.position,
        fontSize: 8,
        color: PDF_COLORS.textMuted,
        margin: [40, 4, 40, 0],
      };
      return base
        ? { stack: [base, numberLine] }
        : { stack: [numberLine], margin: [0, 0, 0, 16] };
    };
  } else if (baseFooter) {
    footer = baseFooter;
  }

  // 8. Optional watermark. Absent → no key (default = none). The legacy
  // `branding.watermark` path keeps its exact prior shape (no `angle`) for parity;
  // only the new `watermark` group adds the configurable angle.
  const wm = resolveWatermarkSettings(config);
  const watermark: Watermark | undefined =
    wm && wm.text
      ? {
          text: wm.text,
          font: baseFont,
          color: PDF_STYLES.watermark.color as string,
          opacity: wm.opacity,
          bold: true,
          fontSize: wm.fontSize,
          ...(config.watermark ? { angle: wm.angle } : {}),
        }
      : undefined;

  return {
    pageSize,
    pageOrientation,
    pageMargins,
    defaultStyle,
    // Styles inherit the same font family so the named styles (tableHeader,
    // bilingualHeader, …) render in the Arabic family under RTL too.
    styles,
    content,
    ...(footer ? { footer } : {}),
    ...(watermark ? { watermark } : {}),
  };
}
