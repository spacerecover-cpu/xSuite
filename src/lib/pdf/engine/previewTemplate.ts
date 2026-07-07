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
import type { CompanySettingsData, TranslationContext } from '../types';
import { renderTemplate } from './renderTemplate';
import { applyTenantLanguage } from './applyTenantLanguage';
import { isTypstEngineEnabled } from './featureFlag';
import { createPdfWithFonts, initializePDFFonts } from '../fonts';
import { ctxFromLanguageConfig, withTimeout } from '../translationContext';
import { resolveSecondary } from '../templateConfig';
import { buildPreviewEngineData, sampleInvoiceData } from './sampleData';
import { resolveQrImage } from '../qrImage';
import { brandingImageWarning, placeholderLogoSvg, type BrandingImage } from '../brandingImage';

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

export interface PreviewResult {
  url: string;
  warnings: string[];
}

/**
 * Decide which logo a sample preview should draw: the real resolved logo when
 * present, else a labeled placeholder box (so the layout still shows where the
 * logo goes), plus any warning to surface in the Studio.
 */
export function resolvePreviewLogo(
  resolved: BrandingImage | null | undefined,
): { logo: BrandingImage; warnings: string[] } {
  if (resolved && resolved.kind !== 'none') return { logo: resolved, warnings: [] };
  const warning = brandingImageWarning(resolved ?? { kind: 'none', reason: 'empty' });
  return { logo: placeholderLogoSvg('LOGO'), warnings: warning ? [warning] : [] };
}

/**
 * Render a live preview of `config` for `docType` from representative sample data
 * and return a blob object-URL suitable for an `<iframe src>`.
 *
 * @param docType The document type being edited — selects the sample + adapter.
 * @param config  The resolved template config to preview (the cascade result the
 *                editor is currently editing).
 * @param ctx     Optional translation context; defaults to English/LTR/Roboto.
 * @param logo    Optional resolved tenant logo. When present it is drawn as-is;
 *                otherwise a labeled placeholder box is used and a warning is
 *                surfaced in the returned result.
 * @param stampImage     Optional resolved tenant stamp drawn in the signature area.
 * @param signatureImage Optional resolved tenant signature drawn in the signature area.
 * @returns A {@link PreviewResult} — `url` is a `blob:` URL the caller MUST
 *          `URL.revokeObjectURL` when done; `warnings` is non-blocking copy.
 */
export async function previewTemplate(
  docType: TemplateDocumentType,
  config: DocumentTemplateConfig,
  ctx: TranslationContext = PREVIEW_CTX_EN,
  logo?: BrandingImage | null,
  stampImage?: BrandingImage | null,
  signatureImage?: BrandingImage | null,
  companySettings?: CompanySettingsData,
  languageExplicit = false,
  opts?: { reportSubtype?: string },
): Promise<PreviewResult> {
  // When the tenant's company settings are supplied, render the way the generator
  // does: the tenant's real company replaces the sample company, and the config
  // `language` follows the per-template Studio picker. `languageExplicit` (the user
  // picked a language — including "English Only") makes that choice override the
  // tenant default; only an unconfigured template falls back to the tenant setting.
  // Without companySettings, the legacy sample-company behavior is preserved.
  const effectiveConfig = companySettings ? applyTenantLanguage(config, companySettings, languageExplicit) : config;
  // Derive the translation context from the RESOLVED per-template language so the
  // Studio's secondary-language choice drives BOTH layout (config.language) AND
  // translation (ctx) — any of the 13 languages, not just the tenant-wide Arabic.
  // When no company settings are passed, honour the caller-supplied ctx (tests).
  // Build the context from the RESOLVED per-template language. ctxFromLanguageConfig
  // needs only `language` — NOT companySettings — so we derive it whenever the
  // caller passes tenant settings (the live Studio + generators always do). The
  // caller-supplied `ctx` fallback is honoured only when no tenant settings are
  // given at all (unit tests). Deriving here means a bilingual template renders its
  // secondary language on the FIRST paint, before the async company-settings fetch
  // resolves — no English flash that then corrects to the chosen language.
  const effectiveCtx = companySettings
    ? ctxFromLanguageConfig(effectiveConfig.language)
    : config.language.mode !== 'en'
      ? ctxFromLanguageConfig(config.language)
      : ctx;
  // Preload the chosen secondary's font so a non-Latin script (Arabic/Korean/Thai)
  // shapes in the preview. Non-fatal: initializePDFFonts swallows load failures
  // and degrades to the base font (createPdfWithFonts also remaps any unresolved
  // family to Roboto), so a CSP-blocked CDN font can never crash the preview.
  const secondary = resolveSecondary(effectiveConfig.language);
  if (secondary) {
    try {
      await initializePDFFonts(secondary);
    } catch {
      /* non-fatal: render proceeds with the base font */
    }
  }
  const engineData = buildPreviewEngineData(docType, effectiveConfig, companySettings, opts);
  // Draw the real logo when resolved, else a labeled placeholder box. The QR is
  // auto-generated from the document's verification payload as a PNG image —
  // pdfmake's native `qr` does not paint in the browser build, so an image is the
  // reliable path (the same one tenant-uploaded QR images use).
  const { logo: previewLogo, warnings } = resolvePreviewLogo(logo);
  const qrImage = await resolveQrImage(null, engineData.zatcaPayload ?? engineData.qrPayload);

  // Experimental Typst renderer (flag-gated, default off): correct Arabic via
  // rustybuzz + Unicode bidi. Scoped to ARABIC documents only — the LTR
  // languages already render cleanly through pdfmake, so they stay on it. Lazily
  // imported so the WASM never enters the default bundle. Phase-1: text/tables
  // (logo/QR images TBD).
  if (isTypstEngineEnabled() && secondary === 'ar') {
    const [{ assembleTypst }, { renderTypstPdf }, { logoAsset, qrAsset }] = await Promise.all([
      import('../typst/assemble'),
      import('../typst/typstEngine'),
      import('../typst/assets'),
    ]);
    const logo = logoAsset(previewLogo);
    const qrA = qrAsset(qrImage);
    const markup = assembleTypst(engineData, effectiveConfig, effectiveCtx, { logoPath: logo?.path, qrPath: qrA?.path });
    const blob = await withTimeout(renderTypstPdf(markup, [logo, qrA].filter((a): a is NonNullable<typeof a> => a !== null)), PREVIEW_TIMEOUT_MS, 'Preview render timed out');
    return { url: URL.createObjectURL(blob), warnings };
  }

  const docDefinition = renderTemplate(
    effectiveConfig,
    engineData,
    effectiveCtx,
    previewLogo,
    qrImage,
    stampImage ?? null,
    signatureImage ?? null,
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

  return withTimeout(render, PREVIEW_TIMEOUT_MS, 'Preview render timed out').then((url) => ({ url, warnings }));
}
