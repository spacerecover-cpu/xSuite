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
import { buildTenantPreviewContext } from './engine/tenantPreviewContext';
import { createPdfWithFonts } from './fonts';
import { withTimeout } from './translationContext';
import { loadImageAsBase64 } from './utils';
import { resolveBrandingImage, brandingImageWarning, type BrandingImage } from './brandingImage';
import type { PreviewResult } from './engine/previewTemplate';

/** Hard cap so a stuck pdfmake rasterization surfaces as an error, never an infinite spinner. */
const PREVIEW_TIMEOUT_MS = 15000;
import type { EngineDocData } from './engine/types';
import type { DocumentTemplateConfig, TemplateDocumentType } from './templateConfig';
import type { CompanySettingsData, TranslationContext } from './types';

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

/** English/LTR context — the editing config's `language` still drives bilingual. */
const PREVIEW_CTX_EN: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

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
  // real PDF: derive the config's `language` and the translation context from the
  // tenant's document-language settings (not the hard-coded English default).
  const langConfig = companySettings ? applyTenantLanguage(config, companySettings) : config;
  const ctx = companySettings ? buildTenantPreviewContext(companySettings) : PREVIEW_CTX_EN;
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
