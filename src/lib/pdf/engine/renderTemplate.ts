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

import type { Content, PageOrientation, PageSize, TDocumentDefinitions } from 'pdfmake/interfaces';
import { getStylesWithFont } from '../styles';
import type { DocumentTemplateConfig } from '../templateConfig';
import type { TranslationContext } from '../types';
import type { EngineContext, EngineDocData } from './types';
import { SECTION_REGISTRY } from './registry';

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

  // 3. Visible sections, ascending order, dispatched via the registry.
  const ordered = [...config.sections]
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  const content: Content[] = [];
  for (const section of ordered) {
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

  return {
    pageSize,
    pageOrientation,
    pageMargins,
    defaultStyle: { font: ctx.fontFamily },
    styles: getStylesWithFont(ctx.fontFamily),
    content,
  };
}
