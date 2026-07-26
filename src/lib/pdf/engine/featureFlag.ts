/**
 * featureFlag — gate for routing a document type through the new config-driven
 * PDF engine (`renderTemplate`) instead of the hand-written builders.
 *
 * DEFAULT-OFF by design: with the flag unset, every document type keeps using
 * its legacy builder and the rendered output is byte-identical to production.
 * Only the literal string `'true'` on the matching env var opts a document type
 * into the engine — any other value (unset, `'false'`, `'1'`, …) stays OFF.
 *
 * NOTE: `'invoice'`, `'quote'`, and `'credit_note'` no longer appear here — they
 * render EXCLUSIVELY through the engine (their legacy builders were deleted in
 * Task 10), so there is no flag to gate. `'payment_receipt'`, the three case
 * documents `'office_receipt'`, `'customer_copy'`, and `'checkout_form'`, the
 * `'case_label'` and `'chain_of_custody'` documents, the `'payslip'` +
 * `'stock_label'` documents, and the `'report'` (case report) document each have
 * a wired engine branch, driven by
 * `VITE_PDF_ENGINE_PAYMENT_RECEIPT`, `VITE_PDF_ENGINE_OFFICE_RECEIPT`,
 * `VITE_PDF_ENGINE_CUSTOMER_COPY`, `VITE_PDF_ENGINE_CHECKOUT_FORM`,
 * `VITE_PDF_ENGINE_CASE_LABEL`, `VITE_PDF_ENGINE_CHAIN_OF_CUSTODY`,
 * `VITE_PDF_ENGINE_PAYSLIP`, `VITE_PDF_ENGINE_STOCK_LABEL`, and
 * `VITE_PDF_ENGINE_REPORT` respectively. Other document types always return
 * `false` here.
 *
 * NOTE: this is a build-time, ALL-tenants switch. Per-tenant rollout (reading a
 * tenant flag / a deployed-template opt-in) is a later milestone — deliberately
 * out of scope for the pilot so the blast radius stays a single env var.
 */

/** Env var name per supported document type. Absent types are never enabled. */
const FLAG_ENV_BY_TYPE: Record<string, string> = {
  payment_receipt: 'VITE_PDF_ENGINE_PAYMENT_RECEIPT',
  office_receipt: 'VITE_PDF_ENGINE_OFFICE_RECEIPT',
  customer_copy: 'VITE_PDF_ENGINE_CUSTOMER_COPY',
  checkout_form: 'VITE_PDF_ENGINE_CHECKOUT_FORM',
  case_label: 'VITE_PDF_ENGINE_CASE_LABEL',
  chain_of_custody: 'VITE_PDF_ENGINE_CHAIN_OF_CUSTODY',
  payslip: 'VITE_PDF_ENGINE_PAYSLIP',
  stock_label: 'VITE_PDF_ENGINE_STOCK_LABEL',
  report: 'VITE_PDF_ENGINE_REPORT',
};

/**
 * Whether the new PDF engine is enabled for `documentType`.
 *
 * Returns `true` only when the document type has a registered env flag AND that
 * env var is exactly the string `'true'`. Defaults to `false` for everything
 * else, so the legacy path is the safe, unchanged default.
 */
export function isPdfEngineEnabled(documentType: string): boolean {
  const envKey = FLAG_ENV_BY_TYPE[documentType];
  if (!envKey) return false;
  const raw = (import.meta.env as Record<string, unknown>)[envKey];
  return raw === 'true';
}

/**
 * Whether the experimental Typst renderer (correct Arabic/Thai/Korean via
 * rustybuzz + Unicode bidi) is used instead of pdfmake for engine-rendered
 * documents. Build-time, ALL-tenants, DEFAULT-OFF — only `VITE_PDF_TYPST==='true'`
 * opts in. Per-tenant runtime rollout is a later milestone (see the spec).
 * Lazy-loads a ~10 MB WASM only when on, so the default app is unaffected.
 */
export function isTypstEngineEnabled(): boolean {
  return (import.meta.env as Record<string, unknown>).VITE_PDF_TYPST === 'true';
}

/**
 * Whether the GENERATION path (pdfService) can produce a Typst document.
 *
 * It cannot today: pdfService builds a pdfmake `TDocumentDefinitions` and
 * rasterizes it at ~15 `createPdfWithFonts(...).download()/.open()` call sites,
 * and the Typst assembler is still Phase-1 (text/tables; logo/QR image support
 * outstanding). Flip this to `true` in the same change that teaches pdfService
 * to emit Typst — `selectRenderEngine` then re-enables it for preview and
 * generation together, which is the point.
 */
export const TYPST_GENERATION_SUPPORTED = false;

/**
 * The SINGLE renderer decision, shared by the preview paths
 * (`engine/previewTemplate`, `previewRecord`) and the generator (`pdfService`).
 *
 * Why this exists: the Typst flag used to be read by the two preview paths and
 * never by pdfService, so with the flag on an Arabic document PREVIEWED through
 * Typst and DOWNLOADED through pdfmake — diverging in exactly the glyph-shaping
 * and bidi respects Typst was introduced to fix. A live preview that cannot
 * predict the artifact is worse than no preview, so the choice now has one home
 * and both sides ask the same question.
 *
 * Typst is selected only when all three hold:
 *   1. the build-time flag is on,
 *   2. the document's secondary language is Arabic (LTR scripts render cleanly
 *      through pdfmake already), and
 *   3. generation can actually emit Typst ({@link TYPST_GENERATION_SUPPORTED}).
 *
 * Condition 3 is what makes divergence structurally impossible rather than a
 * convention someone has to remember.
 */
export function selectRenderEngine(secondaryLanguage: string | null | undefined): 'typst' | 'pdfmake' {
  if (!TYPST_GENERATION_SUPPORTED) return 'pdfmake';
  if (!isTypstEngineEnabled()) return 'pdfmake';
  return secondaryLanguage === 'ar' ? 'typst' : 'pdfmake';
}
