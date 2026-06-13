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

import type { Content, DynamicContent, PageOrientation, PageSize, TDocumentDefinitions } from 'pdfmake/interfaces';
import { getStylesWithFont } from '../styles';
import type { DocumentTemplateConfig } from '../templateConfig';
import type { TranslationContext } from '../types';
import type { EngineContext, EngineDocData } from './types';
import { SECTION_REGISTRY } from './registry';
import { buildPageFooter } from './sections/footer';
import { engineLayoutDirection, engineDefaultFont } from './rtl';

/** Section keys that can be promoted to the repeating page footer. */
const PAGE_FOOTER_KEYS = new Set(['footer', 'qr']);

export function renderTemplate(
  config: DocumentTemplateConfig,
  data: EngineDocData,
  ctx: TranslationContext,
  logoBase64?: string | null,
  qrCodeBase64?: string | null,
): TDocumentDefinitions {
  const engine: EngineContext = { config, ctx, logoBase64, qrCodeBase64 };

  // 1. Page geometry from config.paper. Map the config size to a pdfmake
  // PredefinedPageSize (pdfmake spells "LETTER" uppercase).
  const pageSize: PageSize = config.paper.size === 'Letter' ? 'LETTER' : 'A4';
  const pageOrientation: PageOrientation = config.paper.orientation;
  const pageMargins = config.paper.margins;

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
  const content: Content[] = [];
  for (let i = 0; i < bodyEnd; i++) {
    const section = ordered[i];
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

  // 4. Repeating page footer (divider + tagline + website + optional QR),
  // mirroring the hand-written builders' `footer:` callback. `buildPageFooter`
  // returns null when there is nothing to render, in which case the trailing
  // sections simply contribute nothing (the same outcome as the in-content
  // renderers returning null for empty data).
  const footer: DynamicContent | undefined = promoteToPageFooter
    ? buildPageFooter(engine, data) ?? undefined
    : undefined;

  // 5. RTL document defaults (M6). When the resolved language puts Arabic in the
  // lead, the whole document flows right-to-left: the defaultStyle font becomes
  // the Arabic family (so glyphs shape) and the default alignment becomes right.
  // Section renderers additionally mirror their tables — they read direction off
  // `config.language` the same way (via `engine/rtl`), so the document default
  // and the per-section behavior stay in lock-step. LTR keeps the tenant font and
  // no document-level alignment override, leaving English-only output unchanged.
  const direction = engineLayoutDirection(config.language);
  const defaultFont = engineDefaultFont(config.language, ctx.fontFamily);
  const defaultStyle =
    direction === 'rtl'
      ? { font: defaultFont, alignment: 'right' as const }
      : { font: defaultFont };

  return {
    pageSize,
    pageOrientation,
    pageMargins,
    defaultStyle,
    // Styles inherit the same font family so the named styles (tableHeader,
    // bilingualHeader, …) render in the Arabic family under RTL too.
    styles: getStylesWithFont(defaultFont),
    content,
    ...(footer ? { footer } : {}),
  };
}
