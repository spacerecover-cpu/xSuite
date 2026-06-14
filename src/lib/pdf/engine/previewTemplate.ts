/**
 * previewTemplate — render a live PDF preview of a {@link DocumentTemplateConfig}
 * from representative SAMPLE data for the given document type, returning an
 * object-URL the UI can drop into an `<iframe>`.
 *
 * Powers the Settings → Documents Studio's live preview: as the tenant edits the
 * config, the editor re-resolves it and calls this for a fresh preview blob.
 *
 * It reuses the engine end-to-end: per-doc-type sample data + adapter
 * ({@link buildPreviewEngineData}) → {@link renderTemplate} (the config-driven
 * assembler) → {@link createPdfWithFonts}`.getBlob()` → `URL.createObjectURL`.
 * Nothing here touches the legacy builders or the DB — it is a pure client-side
 * render of fixture data. The caller MUST `URL.revokeObjectURL` the returned url
 * when it swaps in a new preview or unmounts.
 *
 * Fonts: the caller should ensure fonts are ready (e.g. `preloadAllFonts()`)
 * before invoking; we default the translation context to the Roboto/English
 * path so a preview always renders even before Arabic fonts load (the resolved
 * config's `language` still drives bilingual/RTL section behavior).
 */

import type { DocumentTemplateConfig, TemplateDocumentType } from '../templateConfig';
import type { TranslationContext } from '../types';
import { renderTemplate } from './renderTemplate';
import { createPdfWithFonts } from '../fonts';
import { withTimeout } from '../translationContext';
import { buildPreviewEngineData, sampleInvoiceData } from './sampleData';

// Re-exported for any caller/test that wants the canonical invoice sample.
export { sampleInvoiceData };

/** Hard cap so a stuck pdfmake rasterization surfaces as an error, never an infinite spinner. */
const PREVIEW_TIMEOUT_MS = 15000;

/**
 * A VALID 1×1 light-gray PNG (8-bit RGB) used as the placeholder logo/QR so the
 * header/QR image branches render in the preview.
 *
 * NB: the previous placeholder was a 1-bit-grayscale PNG, which pdfmake's PNG
 * decoder rejects ("Incomplete or corrupt PNG file"). pdfmake throws that error
 * ASYNCHRONOUSLY, so it never fires the getBlob callback — the preview promise
 * never settles and the pane spins on "Updating…" forever. An 8-bit RGB PNG
 * decodes cleanly. Exported so the rasterization regression test uses the exact
 * same asset the preview does.
 */
export const PREVIEW_PLACEHOLDER_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN48OABAAVEAqEuYekCAAAAAElFTkSuQmCC';

/** A neutral English/LTR context — a preview always renders even before Arabic fonts load. */
const PREVIEW_CTX_EN: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/**
 * Render a live preview of `config` for `docType` from representative sample data
 * and return a blob object-URL suitable for an `<iframe src>`.
 *
 * @param docType The document type being edited — selects the sample + adapter.
 * @param config  The resolved template config to preview (the cascade result the
 *                editor is currently editing).
 * @param ctx     Optional translation context; defaults to English/LTR/Roboto.
 * @returns A `blob:` URL — the caller MUST `URL.revokeObjectURL` it when done.
 */
export function previewTemplate(
  docType: TemplateDocumentType,
  config: DocumentTemplateConfig,
  ctx: TranslationContext = PREVIEW_CTX_EN,
): Promise<string> {
  const engineData = buildPreviewEngineData(docType, config);
  const docDefinition = renderTemplate(
    config,
    engineData,
    ctx,
    PREVIEW_PLACEHOLDER_IMAGE,
    PREVIEW_PLACEHOLDER_IMAGE,
  );

  // Wire pdfmake's error callback so a rasterization failure REJECTS (rather
  // than leaving the promise pending forever → infinite "Updating…" spinner),
  // and cap it with a timeout as a last-resort guard. Mirrors the proven
  // pattern in pdfService.generateOfficeReceiptAsBlob.
  const render = new Promise<string>((resolve, reject) => {
    try {
      createPdfWithFonts(docDefinition).getBlob(
        (blob: Blob) => resolve(URL.createObjectURL(blob)),
        undefined,
        (err: unknown) => reject(err instanceof Error ? err : new Error('PDF rasterization failed')),
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to render template preview'));
    }
  });

  return withTimeout(render, PREVIEW_TIMEOUT_MS, 'Preview render timed out');
}
