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
import { buildPreviewEngineData, sampleInvoiceData } from './sampleData';

// Re-exported for any caller/test that wants the canonical invoice sample.
export { sampleInvoiceData };

/**
 * A 1×1 transparent PNG so the QR/logo image branches execute without needing a
 * real asset. Kept tiny and inline — the preview is about layout, not artwork.
 */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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
  const docDefinition = renderTemplate(config, engineData, ctx, TINY_PNG, TINY_PNG);

  return new Promise<string>((resolve, reject) => {
    try {
      createPdfWithFonts(docDefinition).getBlob((blob: Blob) => {
        resolve(URL.createObjectURL(blob));
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to render template preview'));
    }
  });
}
