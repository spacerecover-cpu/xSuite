/**
 * previewRecord — render a live Studio preview against a REAL tenant record
 * (an actual invoice / quote / receipt / report / custody log …) instead of
 * synthetic sample data. It reuses the proven production path — the same
 * `fetch*Data` → adapter → `renderTemplate` → `createPdfWithFonts` pipeline the
 * document generators use — but drives it from the config the Studio is
 * currently EDITING (not the deployed version), so the preview reflects unsaved
 * edits.
 *
 * Coverage: every document type whose data has a *record-shaped* production
 * fetcher. Only `stock_label` is excluded — its content is dominated by
 * print-dialog options (copies / quantity / location / show-price) rather than a
 * stored document, so there is no record to preview against without inventing a
 * second options surface. RLS scopes every query to the caller's tenant.
 */

import { supabase } from '../supabaseClient';
import {
  fetchInvoiceData,
  fetchQuoteData,
  fetchPaymentReceiptData,
  fetchCreditNoteData,
  fetchReceiptData,
  fetchPayslipData,
  fetchChainOfCustodyData,
} from './dataFetcher';
import { fetchInstanceReportData } from '../documentInstanceData.fetch';
import { toEngineData as toInvoiceEngineData } from './engine/adapters/invoiceAdapter';
import { toEngineData as toQuoteEngineData } from './engine/adapters/quoteAdapter';
import { toEngineData as toPaymentReceiptEngineData } from './engine/adapters/paymentReceiptAdapter';
import { toCreditNoteEngineData } from './engine/adapters/creditNoteAdapter';
import { toEngineData as toReceiptEngineData } from './engine/adapters/receiptAdapter';
import { toEngineData as toCheckoutEngineData } from './engine/adapters/checkoutAdapter';
import { toEngineData as toCaseLabelEngineData } from './engine/adapters/caseLabelAdapter';
import { toEngineData as toChainOfCustodyEngineData } from './engine/adapters/chainOfCustodyAdapter';
import { toEngineData as toPayslipEngineData } from './engine/adapters/payslipAdapter';
import { toEngineData as toReportEngineData } from './engine/adapters/reportAdapter';
import { renderTemplate } from './engine/renderTemplate';
import { PREVIEW_MAX_TABLE_ROWS } from './engine/sections/lineItemTable';
import { applyTenantLanguage } from './engine/applyTenantLanguage';
import { selectRenderEngine } from './engine/featureFlag';
import { createPdfWithFonts, initializePDFFonts } from './fonts';
import { ctxFromLanguageConfig, withTimeout } from './translationContext';
import { resolveSecondary } from './templateConfig';
import { loadImageAsBase64 } from './utils';
import { resolveBrandingImage, brandingImageWarning, type BrandingImage } from './brandingImage';
import { resolvePreviewLogo, type PreviewResult } from './engine/previewTemplate';

/** Hard cap so a stuck pdfmake rasterization surfaces as an error, never an infinite spinner. */
const PREVIEW_TIMEOUT_MS = 15000;
import type { EngineDocData } from './engine/types';
import type { DocumentTemplateConfig, TemplateDocumentType } from './templateConfig';
import type { CompanySettingsData, TranslationContext } from './types';

/**
 * Doc types that support previewing against a real record.
 *
 * Everything with a record-shaped production fetcher is here. `stock_label` is
 * deliberately absent: `StockLabelData` is assembled by the label print dialog
 * (quantity / copies / location / show-price), not stored per document, so a
 * "record" preview would be synthetic data wearing a record's name.
 */
const RECORD_PREVIEW_TYPES: ReadonlySet<TemplateDocumentType> = new Set([
  'invoice',
  'quote',
  'payment_receipt',
  'credit_note',
  'report',
  'checkout_form',
  'office_receipt',
  'customer_copy',
  'case_label',
  'chain_of_custody',
  'payslip',
]);

export function supportsRecordPreview(docType: TemplateDocumentType): boolean {
  return RECORD_PREVIEW_TYPES.has(docType);
}

export interface PreviewRecordOption {
  id: string;
  label: string;
}

/** Doc types whose record is a CASE (the id passed to the fetcher is a case id). */
const CASE_BACKED_TYPES: ReadonlySet<TemplateDocumentType> = new Set([
  'office_receipt',
  'customer_copy',
  'case_label',
  'chain_of_custody',
]);

const RECORD_LIMIT = 15;

/** Recent cases, newest first — the record list for every case-backed doc type. */
async function listRecentCases(): Promise<PreviewRecordOption[]> {
  const { data } = await supabase
    .from('cases')
    .select('id, case_no, case_number')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(RECORD_LIMIT);
  return (data ?? []).map((r) => ({ id: r.id, label: r.case_no || r.case_number || r.id }));
}

/**
 * Cases that actually have a checked-out device, newest checkout first — a
 * checkout form previewed against a case that was never collected shows an
 * empty collector block, which is exactly the layout this preview is meant to
 * validate against. Falls back to recent cases when the tenant has no checkouts
 * yet, so the picker is never mysteriously empty.
 */
async function listCheckoutCases(): Promise<PreviewRecordOption[]> {
  const { data } = await supabase
    .from('case_devices')
    .select('case_id, checked_out_at')
    .not('checked_out_at', 'is', null)
    .is('deleted_at', null)
    .order('checked_out_at', { ascending: false })
    .limit(90);
  const caseIds: string[] = [];
  for (const row of data ?? []) {
    if (row.case_id && !caseIds.includes(row.case_id)) caseIds.push(row.case_id);
    if (caseIds.length >= RECORD_LIMIT) break;
  }
  if (caseIds.length === 0) return listRecentCases();
  const { data: cases } = await supabase
    .from('cases')
    .select('id, case_no, case_number')
    .in('id', caseIds)
    .is('deleted_at', null);
  const byId = new Map((cases ?? []).map((c) => [c.id, c]));
  return caseIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => ({ id: c.id, label: c.case_no || c.case_number || c.id }));
}

/** List the most recent records for a doc type (id + a human label). */
export async function listPreviewRecords(docType: TemplateDocumentType): Promise<PreviewRecordOption[]> {
  if (docType === 'invoice') {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECORD_LIMIT);
    return (data ?? []).map((r) => ({ id: r.id, label: r.invoice_number || r.id }));
  }
  if (docType === 'quote') {
    const { data } = await supabase
      .from('quotes')
      .select('id, quote_number')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECORD_LIMIT);
    return (data ?? []).map((r) => ({ id: r.id, label: r.quote_number || r.id }));
  }
  if (docType === 'payment_receipt') {
    const { data } = await supabase
      .from('payments')
      .select('id, payment_number')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECORD_LIMIT);
    return (data ?? []).map((r) => ({ id: r.id, label: r.payment_number || r.id }));
  }
  if (docType === 'credit_note') {
    const { data } = await supabase
      .from('credit_notes')
      .select('id, credit_note_number')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECORD_LIMIT);
    return (data ?? []).map((r) => ({ id: r.id, label: r.credit_note_number || r.id }));
  }
  if (docType === 'report') {
    const { data } = await supabase
      .from('document_instances')
      .select('id, document_number, title')
      .eq('doc_type', 'report')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECORD_LIMIT);
    return (data ?? []).map((r) => ({ id: r.id, label: r.document_number || r.title || r.id }));
  }
  if (docType === 'payslip') {
    const { data } = await supabase
      .from('payroll_records')
      .select('id, employee:employees!payroll_records_employee_id_fkey (first_name, last_name, employee_number)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECORD_LIMIT);
    return (data ?? []).map((r) => {
      const e = r.employee as { first_name?: string; last_name?: string; employee_number?: string } | null;
      const name = [e?.first_name, e?.last_name].filter(Boolean).join(' ');
      return { id: r.id, label: name || e?.employee_number || r.id };
    });
  }
  if (docType === 'checkout_form') return listCheckoutCases();
  if (CASE_BACKED_TYPES.has(docType)) return listRecentCases();
  return [];
}

const safeImage = (url: string | null | undefined): Promise<string | null> =>
  url ? loadImageAsBase64(url).catch(() => null) : Promise.resolve(null);

const NO_IMAGE: BrandingImage = { kind: 'none', reason: 'empty' };

/**
 * Branding a caller has ALREADY resolved. Passing this makes the record preview
 * and the sample preview share one branding-resolution step (so flipping the
 * Studio's data-source picker can never change the letterhead), and skips the
 * duplicate logo/stamp/signature network fetches this module used to perform.
 */
export interface PreviewRecordBranding {
  logo?: BrandingImage | null;
  stamp?: BrandingImage | null;
  signature?: BrandingImage | null;
  /** `false` suppresses the stand-in logo box — see `resolvePreviewLogo`. */
  logoPlaceholder?: boolean;
}

/** What a fetched record hands back before the config/context are resolved. */
interface LoadedRecord {
  companySettings: CompanySettingsData | null;
  /** Tenant-uploaded QR image for this doc type (null → no QR image). */
  qrUrl: string | null | undefined;
  /**
   * Build the normalized engine data. Receives the RAW config (matching what
   * every adapter has always been handed here) plus the resolved translation
   * context, which only the report adapter consumes.
   */
  adapt: (config: DocumentTemplateConfig, ctx: TranslationContext) => EngineDocData;
}

/** The case number a custody log is titled with. */
async function fetchCaseNumber(caseId: string): Promise<string> {
  const { data } = await supabase
    .from('cases')
    .select('case_no, case_number')
    .eq('id', caseId)
    .maybeSingle();
  return data?.case_no || data?.case_number || caseId;
}

/**
 * Fetch the record and return everything needed to adapt it. Kept separate from
 * the render so the language/context resolution can sit between them: the
 * context depends on the tenant settings the fetch returns, and the report
 * adapter depends on the context.
 */
async function loadRecord(docType: TemplateDocumentType, recordId: string): Promise<LoadedRecord> {
  if (docType === 'invoice') {
    const data = await fetchInvoiceData(recordId);
    return {
      companySettings: data.companySettings,
      qrUrl: data.companySettings.branding?.qr_code_invoice_url,
      adapt: (config) => toInvoiceEngineData(data, config),
    };
  }
  if (docType === 'quote') {
    const data = await fetchQuoteData(recordId);
    return {
      companySettings: data.companySettings,
      qrUrl: data.companySettings.branding?.qr_code_quote_url,
      adapt: (config) => toQuoteEngineData(data, config),
    };
  }
  if (docType === 'payment_receipt') {
    const data = await fetchPaymentReceiptData(recordId);
    return {
      companySettings: data.companySettings,
      qrUrl: data.companySettings.branding?.qr_code_general_url,
      adapt: (config) => toPaymentReceiptEngineData(data, config),
    };
  }
  if (docType === 'credit_note') {
    const data = await fetchCreditNoteData(recordId);
    return {
      companySettings: data.companySettings,
      qrUrl: data.companySettings.branding?.qr_code_invoice_url,
      adapt: (config) => toCreditNoteEngineData(data, config),
    };
  }
  if (docType === 'report') {
    const data = await fetchInstanceReportData(recordId);
    return {
      companySettings: data.companySettings,
      qrUrl: data.companySettings.branding?.qr_code_general_url,
      adapt: (config, ctx) => toReportEngineData(data, config, ctx),
    };
  }
  if (docType === 'payslip') {
    const data = await fetchPayslipData(recordId);
    return {
      companySettings: data.companySettings,
      qrUrl: data.companySettings.branding?.qr_code_general_url,
      adapt: (config) => toPayslipEngineData(data, config),
    };
  }
  if (docType === 'chain_of_custody') {
    const caseNumber = await fetchCaseNumber(recordId);
    // Match the synthetic custody sample's options so flipping the data-source
    // picker changes only the DATA, never which optional blocks render.
    const data = await fetchChainOfCustodyData(recordId, caseNumber, {
      includeMetadata: true,
      includeHashes: true,
      includeSignatures: true,
    });
    return {
      companySettings: data.companySettings,
      qrUrl: data.companySettings.branding?.qr_code_general_url,
      adapt: (config) => toChainOfCustodyEngineData(data, config),
    };
  }
  if (docType === 'office_receipt' || docType === 'customer_copy' || docType === 'checkout_form' || docType === 'case_label') {
    const data = await fetchReceiptData(recordId);
    const qrUrl =
      docType === 'case_label'
        ? data.companySettings.branding?.qr_code_label_url
        : data.companySettings.branding?.qr_code_general_url;
    return {
      companySettings: data.companySettings,
      qrUrl,
      adapt: (config) => {
        if (docType === 'checkout_form') return toCheckoutEngineData(data, config);
        if (docType === 'case_label') return toCaseLabelEngineData(data, config);
        return toReceiptEngineData(data, config, docType === 'office_receipt' ? 'office' : 'customer');
      },
    };
  }
  throw new Error(`Record preview is not supported for "${docType}"`);
}

/**
 * Render a preview of `config` against the real record `recordId` and return a
 * blob object-URL for an `<iframe src>`. The caller MUST revoke it when done.
 * Throws for unsupported doc types (callers should gate on
 * {@link supportsRecordPreview}).
 *
 * @param branding Pre-resolved tenant branding. Supply it (the Studio does) so
 *        record and sample previews share ONE branding-resolution step and the
 *        duplicate logo/stamp/signature fetches are skipped. Omitting it keeps
 *        the standalone behaviour: resolve from the record's company settings
 *        and draw no stand-in logo.
 */
export async function previewDocumentForRecord(
  docType: TemplateDocumentType,
  recordId: string,
  config: DocumentTemplateConfig,
  languageExplicit = false,
  branding?: PreviewRecordBranding,
): Promise<PreviewResult> {
  const loaded = await loadRecord(docType, recordId);
  const companySettings = loaded.companySettings;

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
  const engineData = loaded.adapt(config, ctx);

  // One branding-resolution step. When the caller pre-resolved the tenant's
  // images we use them verbatim (no second fetch, and identical to whatever the
  // sample preview drew); otherwise fall back to the record's own settings.
  const preResolved = branding !== undefined;
  const logoPromise: Promise<BrandingImage> = preResolved
    ? Promise.resolve(branding.logo ?? NO_IMAGE)
    : resolveBrandingImage(companySettings?.branding?.logo_url);
  const stampPromise: Promise<BrandingImage> = preResolved
    ? Promise.resolve(branding.stamp ?? NO_IMAGE)
    : resolveBrandingImage(companySettings?.branding?.stamp_url);
  const signaturePromise: Promise<BrandingImage> = preResolved
    ? Promise.resolve(branding.signature ?? NO_IMAGE)
    : resolveBrandingImage(companySettings?.branding?.signature_url);
  const [logoImage, qr, stamp, signature] = await Promise.all([
    logoPromise,
    safeImage(loaded.qrUrl),
    stampPromise,
    signaturePromise,
  ]);

  // A caller that shares branding also shares the sample preview's stand-in
  // logo treatment — otherwise flipping the data-source picker would still swap
  // a placeholder box for nothing. Standalone callers keep the original
  // behaviour (real logo or none, one warning).
  const logoNote = brandingImageWarning(logoImage);
  const { logo, warnings } = preResolved
    ? resolvePreviewLogo(logoImage, { placeholder: branding.logoPlaceholder })
    : { logo: logoImage, warnings: logoNote ? [logoNote] : [] };

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
  // Renderer choice is the SHARED decision (see engine/featureFlag) so this
  // record preview can never render through a different engine than the
  // download it is meant to predict. Lazily imported so the WASM never enters
  // the default bundle. Phase-1: text/tables (logo/QR images TBD).
  if (selectRenderEngine(secondary) === 'typst') {
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
    return { url: URL.createObjectURL(blob), warnings };
  }

  // PREVIEW-ONLY row cap (QA TBL-08) — see `previewTemplate`. The download this
  // preview predicts goes through `pdfService`, which passes no cap and renders
  // every row.
  const docDefinition = renderTemplate(langConfig, engineData, ctx, logo, qr, stamp, signature, {
    maxTableRows: PREVIEW_MAX_TABLE_ROWS,
  });
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
