/**
 * previewRecord — render a live Studio preview against a REAL tenant record
 * (an actual invoice / quote / payment receipt) instead of synthetic sample
 * data. It reuses the proven production path — the same `fetch*Data` →
 * adapter → `renderTemplate` → `createPdfWithFonts` pipeline the document
 * generators use — but drives it from the config the Studio is currently
 * EDITING (not the deployed version), so the preview reflects unsaved edits.
 *
 * Only the financial doc types have a rich fetch + adapter + a meaningful record
 * list, so record preview is offered for those; other doc types fall back to the
 * synthetic `previewTemplate`. RLS scopes every query to the caller's tenant.
 */

import { supabase } from '../supabaseClient';
import { fetchInvoiceData, fetchQuoteData, fetchPaymentReceiptData } from './dataFetcher';
import { toEngineData as toInvoiceEngineData } from './engine/adapters/invoiceAdapter';
import { toEngineData as toQuoteEngineData } from './engine/adapters/quoteAdapter';
import { toEngineData as toPaymentReceiptEngineData } from './engine/adapters/paymentReceiptAdapter';
import { renderTemplate } from './engine/renderTemplate';
import { applyTenantLanguage } from './engine/applyTenantLanguage';
import { isTypstEngineEnabled } from './engine/featureFlag';
import { createPdfWithFonts, initializePDFFonts } from './fonts';
import { ctxFromLanguageConfig, withTimeout } from './translationContext';
import { resolveSecondary } from './templateConfig';
import { loadImageAsBase64 } from './utils';
import { resolveBrandingImage, brandingImageWarning, type BrandingImage } from './brandingImage';
import type { PreviewResult } from './engine/previewTemplate';

/** Hard cap so a stuck pdfmake rasterization surfaces as an error, never an infinite spinner. */
const PREVIEW_TIMEOUT_MS = 15000;
import type { EngineDocData } from './engine/types';
import type { DocumentTemplateConfig, TemplateDocumentType } from './templateConfig';
import type { CompanySettingsData } from './types';

/** Doc types that support previewing against a real record. */
const RECORD_PREVIEW_TYPES: ReadonlySet<TemplateDocumentType> = new Set([
  'invoice',
  'quote',
  'payment_receipt',
]);

export function supportsRecordPreview(docType: TemplateDocumentType): boolean {
  return RECORD_PREVIEW_TYPES.has(docType);
}

export interface PreviewRecordOption {
  id: string;
  label: string;
}

/** List the most recent records for a doc type (id + a human label). */
export async function listPreviewRecords(docType: TemplateDocumentType): Promise<PreviewRecordOption[]> {
  if (docType === 'invoice') {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(15);
    return (data ?? []).map((r) => ({ id: r.id, label: r.invoice_number || r.id }));
  }
  if (docType === 'quote') {
    const { data } = await supabase
      .from('quotes')
      .select('id, quote_number')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(15);
    return (data ?? []).map((r) => ({ id: r.id, label: r.quote_number || r.id }));
  }
  if (docType === 'payment_receipt') {
    const { data } = await supabase
      .from('payments')
      .select('id, payment_number')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(15);
    return (data ?? []).map((r) => ({ id: r.id, label: r.payment_number || r.id }));
  }
  return [];
}

const safeImage = (url: string | null | undefined): Promise<string | null> =>
  url ? loadImageAsBase64(url).catch(() => null) : Promise.resolve(null);

/**
 * Render a preview of `config` against the real record `recordId` and return a
 * blob object-URL for an `<iframe src>`. The caller MUST revoke it when done.
 * Throws for unsupported doc types (callers should gate on
 * {@link supportsRecordPreview}).
 */
export async function previewDocumentForRecord(
  docType: TemplateDocumentType,
  recordId: string,
  config: DocumentTemplateConfig,
  languageExplicit = false,
): Promise<PreviewResult> {
  let engineData: EngineDocData;
  let companySettings: CompanySettingsData | null = null;
  let logo: BrandingImage = { kind: 'none', reason: 'empty' };
  let qr: string | null = null;
  let stamp: BrandingImage = { kind: 'none', reason: 'empty' };
  let signature: BrandingImage = { kind: 'none', reason: 'empty' };

  if (docType === 'invoice') {
    const data = await fetchInvoiceData(recordId);
    engineData = toInvoiceEngineData(data, config);
    companySettings = data.companySettings;
    [logo, qr, stamp, signature] = await Promise.all([
      resolveBrandingImage(data.companySettings.branding?.logo_url),
      safeImage(data.companySettings.branding?.qr_code_invoice_url),
      resolveBrandingImage(data.companySettings.branding?.stamp_url),
      resolveBrandingImage(data.companySettings.branding?.signature_url),
    ]);
  } else if (docType === 'quote') {
    const data = await fetchQuoteData(recordId);
    engineData = toQuoteEngineData(data, config);
    companySettings = data.companySettings;
    [logo, qr, stamp, signature] = await Promise.all([
      resolveBrandingImage(data.companySettings.branding?.logo_url),
      safeImage(data.companySettings.branding?.qr_code_quote_url),
      resolveBrandingImage(data.companySettings.branding?.stamp_url),
      resolveBrandingImage(data.companySettings.branding?.signature_url),
    ]);
  } else if (docType === 'payment_receipt') {
    const data = await fetchPaymentReceiptData(recordId);
    engineData = toPaymentReceiptEngineData(data, config);
    companySettings = data.companySettings;
    [logo, qr, stamp, signature] = await Promise.all([
      resolveBrandingImage(data.companySettings.branding?.logo_url),
      safeImage(data.companySettings.branding?.qr_code_general_url),
      resolveBrandingImage(data.companySettings.branding?.stamp_url),
      resolveBrandingImage(data.companySettings.branding?.signature_url),
    ]);
  } else {
    throw new Error(`Record preview is not supported for "${docType}"`);
  }

  // Mirror the generator's language path so the preview's language matches the
  // real PDF: resolve the config's `language` (per-template Studio picker wins,
  // tenant setting fills in only when the template is English-default), then build
  // the translation context FROM that resolved language so the chosen secondary
  // (any of the 13) drives both layout and translation.
  const langConfig = companySettings ? applyTenantLanguage(config, companySettings, languageExplicit) : config;
  // ctxFromLanguageConfig needs only `language` (never companySettings); `langConfig`
  // is already `config` when no tenant settings were fetched, so deriving from it
  // ALWAYS honours the per-template secondary — no English fallback that silently
  // drops the chosen language.
  const ctx = ctxFromLanguageConfig(langConfig.language);
  // Preload the chosen secondary's font so a non-Latin script shapes; non-fatal
  // (createPdfWithFonts also remaps an unresolved family to Roboto), so a missing
  // font degrades to Latin instead of crashing the preview.
  const secondary = resolveSecondary(langConfig.language);
  if (secondary) {
    try {
      await initializePDFFonts(secondary);
    } catch {
      /* non-fatal: render proceeds with the base font */
    }
  }
  // Arabic documents render through Typst (correct shaping + bidi); the LTR
  // languages keep the proven pdfmake path. Lazily imported so the WASM never
  // enters the default bundle. Phase-1: text/tables (logo/QR images TBD).
  if (isTypstEngineEnabled() && secondary === 'ar') {
    const [{ assembleTypst }, { renderTypstPdf }, { logoAsset, qrAsset, stampAsset, signatureAsset }] = await Promise.all([
      import('./typst/assemble'),
      import('./typst/typstEngine'),
      import('./typst/assets'),
    ]);
    const logoA = logoAsset(logo);
    const qrA = qrAsset(qr);
    const stampA = stampAsset(stamp);
    const signatureA = signatureAsset(signature);
    const markup = assembleTypst(engineData, langConfig, ctx, {
      logoPath: logoA?.path,
      qrPath: qrA?.path,
      stampPath: stampA?.path,
      signaturePath: signatureA?.path,
    });
    const blob = await withTimeout(
      renderTypstPdf(markup, [logoA, qrA, stampA, signatureA].filter((a): a is NonNullable<typeof a> => a !== null)),
      PREVIEW_TIMEOUT_MS,
      'Preview render timed out',
    );
    const w = brandingImageWarning(logo);
    return { url: URL.createObjectURL(blob), warnings: w ? [w] : [] };
  }

  const docDefinition = renderTemplate(langConfig, engineData, ctx, logo, qr, stamp, signature);
  const warning = brandingImageWarning(logo);
  const warnings = warning ? [warning] : [];
  const render = new Promise<string>((resolve, reject) => {
    try {
      createPdfWithFonts(docDefinition).getBlob(
        (blob: Blob) => resolve(URL.createObjectURL(blob)),
        undefined,
        (err: unknown) => reject(err instanceof Error ? err : new Error('PDF rasterization failed')),
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to render record preview'));
    }
  });
  return withTimeout(render, PREVIEW_TIMEOUT_MS, 'Preview render timed out').then((url) => ({ url, warnings }));
}
