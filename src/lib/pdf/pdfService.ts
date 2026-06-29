import { initializePDFFonts, createPdfWithFonts } from './fonts';
import { fetchReceiptData, fetchQuoteData, fetchInvoiceData, fetchCreditNoteData, fetchPaymentReceiptData, fetchPayslipData, fetchChainOfCustodyData } from './dataFetcher';
import { buildOfficeReceiptDocument } from './documents/OfficeReceiptDocument';
import { buildCustomerCopyDocument } from './documents/CustomerCopyDocument';
import { buildCheckoutFormDocument } from './documents/CheckoutFormDocument';
import { buildCaseLabelDocument } from './documents/CaseLabelDocument';
import { buildQuoteDocument } from './documents/QuoteDocument';
import { buildInvoiceDocument } from './documents/InvoiceDocument';
import { buildCreditNoteDocument } from './documents/CreditNoteDocument';
import { buildPaymentReceiptDocument } from './documents/PaymentReceiptDocument';
import { buildPayslipDocument } from './documents/PayslipDocument';
import { buildChainOfCustodyDocument } from './documents/ChainOfCustodyDocument';
import { loadImageAsBase64 } from './utils';
import { logPDFGeneration } from './loggingService';
import { withTimeout, createTranslationContext, ctxFromLanguageConfig } from './translationContext';
import type { DocumentType, InvoiceDocumentData, QuoteDocumentData, PaymentReceiptDocumentData, PayslipDocumentData, ChainOfCustodyDocumentData, ReceiptData, TranslationContext } from './types';
import { type LanguageCode } from '../documentTranslations';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { isPdfEngineEnabled } from './engine/featureFlag';
import { renderTemplate } from './engine/renderTemplate';
import { resolveQrImage } from './qrImage';
import { applyTenantLanguage } from './engine/applyTenantLanguage';

/**
 * Render via the engine with the QR resolved to an image: the tenant's uploaded
 * QR image if present, else one auto-generated from the document's verification
 * payload (pdfmake's native `qr` doesn't paint in the browser, so a PNG image is
 * the reliable path). Used by every engine builder so QR works without an upload.
 */
async function renderWithQr(
  config: Parameters<typeof renderTemplate>[0],
  data: Parameters<typeof renderTemplate>[1],
  ctx: Parameters<typeof renderTemplate>[2],
  logo: Parameters<typeof renderTemplate>[3],
  tenantQr: string | null,
  stampImage?: Parameters<typeof renderTemplate>[5],
  signatureImage?: Parameters<typeof renderTemplate>[6],
): Promise<ReturnType<typeof renderTemplate>> {
  const qr = await resolveQrImage(tenantQr, data.zatcaPayload ?? data.qrPayload);
  return renderTemplate(config, data, ctx, logo, qr, stampImage, signatureImage);
}
import { toEngineData } from './engine/adapters/invoiceAdapter';
import { toEngineData as toQuoteEngineData } from './engine/adapters/quoteAdapter';
import { toEngineData as toPaymentReceiptEngineData } from './engine/adapters/paymentReceiptAdapter';
import { toEngineData as toReceiptEngineData, type ReceiptVariant } from './engine/adapters/receiptAdapter';
import { toEngineData as toCheckoutEngineData } from './engine/adapters/checkoutAdapter';
import { toEngineData as toCaseLabelEngineData } from './engine/adapters/caseLabelAdapter';
import { toEngineData as toChainOfCustodyEngineData } from './engine/adapters/chainOfCustodyAdapter';
import { toEngineData as toPayslipEngineData } from './engine/adapters/payslipAdapter';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  resolveSecondary,
  type DocumentTemplateConfig,
  type TemplateConfigOverride,
} from './templateConfig';
import { getDeployedVersionByType, readConfig } from '../documentTemplateService';
import { resolveBrandingImage, type BrandingImage } from './brandingImage';
import type { SignatureImagesConfig } from './templateConfig';

/**
 * Resolve the deployed `signatureImages` config for a generated (legacy-path)
 * document type. Reads the tenant's deployed doc-type template (if any) as the
 * cascade layer over the built-in default, then returns the resolved
 * `signatureImages` group. Wrapped so a missing/failed template lookup never
 * breaks generation — it simply leaves the feature off (`undefined`).
 */
async function resolveSignatureImagesConfig(
  docType: 'office_receipt' | 'customer_copy' | 'checkout_form',
): Promise<SignatureImagesConfig | undefined> {
  try {
    const deployed = await getDeployedVersionByType(docType);
    const cfg = resolveTemplateConfig(
      BUILT_IN_TEMPLATE_CONFIGS[docType],
      /* theme */ undefined,
      /* docType */ deployed ? readConfig(deployed.config) : undefined,
      /* instance */ undefined,
    );
    return cfg.signatureImages;
  } catch (err) {
    console.error(`[PDF Service] ${docType}: signatureImages resolution failed, feature off:`, err);
    return undefined;
  }
}

/**
 * Build the invoice pdfmake doc-definition via the NEW config-driven engine.
 *
 * Flag-guarded: this is only reached when `isPdfEngineEnabled('invoice')` is
 * true. It resolves the tenant's deployed invoice template (if any) as the
 * doc-type cascade layer over the built-in 'invoice' default, normalizes the
 * invoice data through the adapter, and assembles via `renderTemplate`. With no
 * tenant template seeded it falls back to the built-in config, so the path
 * works without any DB seeding.
 */
async function buildInvoiceDocumentViaEngine(
  data: InvoiceDocumentData,
  _ctx: TranslationContext,
  logoBase64: string | null,
  qrCodeBase64: string | null,
): Promise<TDocumentDefinitions> {
  // Doc-type override layer: the tenant's deployed invoice template config, if
  // one exists. Resolution failures must never break PDF generation — fall back
  // to the built-in default.
  let docTypeOverride: TemplateConfigOverride | undefined;
  try {
    const deployed = await getDeployedVersionByType('invoice');
    if (deployed) {
      docTypeOverride = readConfig(deployed.config);
    }
  } catch (err) {
    console.error('[PDF Service] Invoice engine: template resolution failed, using built-in default:', err);
  }

  const resolvedConfig: DocumentTemplateConfig = resolveTemplateConfig(
    BUILT_IN_TEMPLATE_CONFIGS.invoice,
    /* theme */ undefined,
    /* docType */ docTypeOverride,
    /* instance */ undefined,
  );

  // Bridge the tenant's document-language setting into the resolved config so
  // the engine renders bilingual/RTL when the tenant is configured for it.
  const languageAwareConfig = applyTenantLanguage(resolvedConfig, data.companySettings, docTypeOverride?.language !== undefined);

  const engineData = toEngineData(data, languageAwareConfig);
  await initializePDFFonts(resolveSecondary(languageAwareConfig.language));
  return renderWithQr(languageAwareConfig, engineData, ctxFromLanguageConfig(languageAwareConfig.language), logoBase64, qrCodeBase64);
}

/**
 * Build the quote pdfmake doc-definition via the NEW config-driven engine.
 *
 * Flag-guarded: only reached when `isPdfEngineEnabled('quote')` is true. Mirrors
 * {@link buildInvoiceDocumentViaEngine}: resolve the tenant's deployed quote
 * template (if any) as the doc-type cascade layer over the built-in 'quote'
 * default, normalize through the quote adapter, and assemble via
 * `renderTemplate`. With no tenant template seeded it falls back to the built-in
 * config, so the path works without any DB seeding.
 */
async function buildQuoteViaEngine(
  data: QuoteDocumentData,
  _ctx: TranslationContext,
  logoBase64: string | null,
  qrCodeBase64: string | null,
): Promise<TDocumentDefinitions> {
  let docTypeOverride: TemplateConfigOverride | undefined;
  try {
    const deployed = await getDeployedVersionByType('quote');
    if (deployed) {
      docTypeOverride = readConfig(deployed.config);
    }
  } catch (err) {
    console.error('[PDF Service] Quote engine: template resolution failed, using built-in default:', err);
  }

  const resolvedConfig: DocumentTemplateConfig = resolveTemplateConfig(
    BUILT_IN_TEMPLATE_CONFIGS.quote,
    /* theme */ undefined,
    /* docType */ docTypeOverride,
    /* instance */ undefined,
  );

  const languageAwareConfig = applyTenantLanguage(resolvedConfig, data.companySettings, docTypeOverride?.language !== undefined);

  const engineData = toQuoteEngineData(data, languageAwareConfig);
  await initializePDFFonts(resolveSecondary(languageAwareConfig.language));
  return renderWithQr(languageAwareConfig, engineData, ctxFromLanguageConfig(languageAwareConfig.language), logoBase64, qrCodeBase64);
}

/**
 * Build the payment-receipt pdfmake doc-definition via the NEW config-driven
 * engine. Flag-guarded: only reached when
 * `isPdfEngineEnabled('payment_receipt')` is true. Mirrors
 * {@link buildInvoiceDocumentViaEngine} with the 'payment_receipt' built-in
 * config and the payment-receipt adapter.
 */
async function buildPaymentReceiptViaEngine(
  data: PaymentReceiptDocumentData,
  _ctx: TranslationContext,
  logoBase64: string | null,
  qrCodeBase64: string | null,
): Promise<TDocumentDefinitions> {
  let docTypeOverride: TemplateConfigOverride | undefined;
  try {
    const deployed = await getDeployedVersionByType('payment_receipt');
    if (deployed) {
      docTypeOverride = readConfig(deployed.config);
    }
  } catch (err) {
    console.error('[PDF Service] Payment receipt engine: template resolution failed, using built-in default:', err);
  }

  const resolvedConfig: DocumentTemplateConfig = resolveTemplateConfig(
    BUILT_IN_TEMPLATE_CONFIGS.payment_receipt,
    /* theme */ undefined,
    /* docType */ docTypeOverride,
    /* instance */ undefined,
  );

  const languageAwareConfig = applyTenantLanguage(resolvedConfig, data.companySettings, docTypeOverride?.language !== undefined);

  const engineData = toPaymentReceiptEngineData(data, languageAwareConfig);
  await initializePDFFonts(resolveSecondary(languageAwareConfig.language));
  return renderWithQr(languageAwareConfig, engineData, ctxFromLanguageConfig(languageAwareConfig.language), logoBase64, qrCodeBase64);
}

/**
 * Build the payslip pdfmake doc-definition via the NEW config-driven engine.
 * Flag-guarded: only reached when `isPdfEngineEnabled('payslip')` is true.
 * Mirrors {@link buildPaymentReceiptViaEngine} with the 'payslip' built-in config
 * and the payslip adapter. A payslip is HR-internal: it has no QR and no party
 * blocks, so no logo/QR images are loaded (the header still draws the company
 * identity from `companySettings`).
 */
async function buildPayslipViaEngine(
  data: PayslipDocumentData,
  _ctx: TranslationContext,
): Promise<TDocumentDefinitions> {
  let docTypeOverride: TemplateConfigOverride | undefined;
  try {
    const deployed = await getDeployedVersionByType('payslip');
    if (deployed) {
      docTypeOverride = readConfig(deployed.config);
    }
  } catch (err) {
    console.error('[PDF Service] Payslip engine: template resolution failed, using built-in default:', err);
  }

  const resolvedConfig: DocumentTemplateConfig = resolveTemplateConfig(
    BUILT_IN_TEMPLATE_CONFIGS.payslip,
    /* theme */ undefined,
    /* docType */ docTypeOverride,
    /* instance */ undefined,
  );

  const languageAwareConfig = applyTenantLanguage(resolvedConfig, data.companySettings, docTypeOverride?.language !== undefined);

  const engineData = toPayslipEngineData(data, languageAwareConfig);
  await initializePDFFonts(resolveSecondary(languageAwareConfig.language));
  return renderTemplate(languageAwareConfig, engineData, ctxFromLanguageConfig(languageAwareConfig.language), null, null);
}

/**
 * Build a case INTAKE (office_receipt / customer_copy) pdfmake doc-definition via
 * the NEW config-driven engine. Flag-guarded: only reached when
 * `isPdfEngineEnabled('office_receipt' | 'customer_copy')` is true. Mirrors
 * {@link buildInvoiceDocumentViaEngine}: resolve the tenant's deployed template
 * for the given doc type (if any) as the doc-type cascade layer over the built-in
 * default, normalize through the receipt adapter for the matching variant, and
 * assemble via `renderTemplate`. Falls back to the built-in config when no tenant
 * template is seeded, so the path works without any DB seeding.
 */
async function buildOfficeReceiptViaEngine(
  data: ReceiptData,
  _ctx: TranslationContext,
  logoBase64: string | null,
  qrCodeBase64: string | null,
  docType: 'office_receipt' | 'customer_copy',
  variant: ReceiptVariant,
  stampImage?: BrandingImage | string | null,
  signatureImage?: BrandingImage | string | null,
): Promise<TDocumentDefinitions> {
  let docTypeOverride: TemplateConfigOverride | undefined;
  try {
    const deployed = await getDeployedVersionByType(docType);
    if (deployed) {
      docTypeOverride = readConfig(deployed.config);
    }
  } catch (err) {
    console.error(`[PDF Service] ${docType} engine: template resolution failed, using built-in default:`, err);
  }

  const resolvedConfig: DocumentTemplateConfig = resolveTemplateConfig(
    BUILT_IN_TEMPLATE_CONFIGS[docType],
    /* theme */ undefined,
    /* docType */ docTypeOverride,
    /* instance */ undefined,
  );

  const languageAwareConfig = applyTenantLanguage(resolvedConfig, data.companySettings, docTypeOverride?.language !== undefined);

  const engineData = toReceiptEngineData(data, languageAwareConfig, variant);
  await initializePDFFonts(resolveSecondary(languageAwareConfig.language));
  return renderWithQr(languageAwareConfig, engineData, ctxFromLanguageConfig(languageAwareConfig.language), logoBase64, qrCodeBase64, stampImage, signatureImage);
}

/**
 * Build the customer_copy intake doc via the engine. Thin wrapper over
 * {@link buildOfficeReceiptViaEngine} with the 'customer_copy' config + the
 * customer-facing receipt variant.
 */
function buildCustomerCopyViaEngine(
  data: ReceiptData,
  ctx: TranslationContext,
  logoBase64: string | null,
  qrCodeBase64: string | null,
  stampImage?: BrandingImage | string | null,
  signatureImage?: BrandingImage | string | null,
): Promise<TDocumentDefinitions> {
  return buildOfficeReceiptViaEngine(
    data,
    ctx,
    logoBase64,
    qrCodeBase64,
    'customer_copy',
    'customer',
    stampImage,
    signatureImage,
  );
}

/**
 * Build the checkout_form (device return) pdfmake doc-definition via the NEW
 * config-driven engine. Flag-guarded: only reached when
 * `isPdfEngineEnabled('checkout_form')` is true. Mirrors
 * {@link buildOfficeReceiptViaEngine} with the 'checkout_form' built-in config
 * and the checkout adapter (case-info + device return table + collector +
 * signature + consent box).
 */
async function buildCheckoutFormViaEngine(
  data: ReceiptData,
  _ctx: TranslationContext,
  logoBase64: string | null,
  qrCodeBase64: string | null,
  stampImage?: BrandingImage | string | null,
  signatureImage?: BrandingImage | string | null,
): Promise<TDocumentDefinitions> {
  let docTypeOverride: TemplateConfigOverride | undefined;
  try {
    const deployed = await getDeployedVersionByType('checkout_form');
    if (deployed) {
      docTypeOverride = readConfig(deployed.config);
    }
  } catch (err) {
    console.error('[PDF Service] Checkout form engine: template resolution failed, using built-in default:', err);
  }

  const resolvedConfig: DocumentTemplateConfig = resolveTemplateConfig(
    BUILT_IN_TEMPLATE_CONFIGS.checkout_form,
    /* theme */ undefined,
    /* docType */ docTypeOverride,
    /* instance */ undefined,
  );

  const languageAwareConfig = applyTenantLanguage(resolvedConfig, data.companySettings, docTypeOverride?.language !== undefined);

  const engineData = toCheckoutEngineData(data, languageAwareConfig);
  await initializePDFFonts(resolveSecondary(languageAwareConfig.language));
  return renderWithQr(languageAwareConfig, engineData, ctxFromLanguageConfig(languageAwareConfig.language), logoBase64, qrCodeBase64, stampImage, signatureImage);
}

/**
 * Build the case_label pdfmake doc-definition via the NEW config-driven engine.
 * Flag-guarded: only reached when `isPdfEngineEnabled('case_label')` is true.
 * Mirrors {@link buildOfficeReceiptViaEngine}: resolve the tenant's deployed
 * case_label template (if any) as the doc-type cascade layer over the built-in
 * 'case_label' default, normalize the receipt data through the case-label
 * adapter (large case number + priority badge + received date + device summary),
 * and assemble via `renderTemplate`. Falls back to the built-in config when no
 * tenant template is seeded, so the path works without any DB seeding.
 */
async function buildCaseLabelViaEngine(
  data: ReceiptData,
  _ctx: TranslationContext,
  logoBase64: string | null,
  qrCodeBase64: string | null,
): Promise<TDocumentDefinitions> {
  let docTypeOverride: TemplateConfigOverride | undefined;
  try {
    const deployed = await getDeployedVersionByType('case_label');
    if (deployed) {
      docTypeOverride = readConfig(deployed.config);
    }
  } catch (err) {
    console.error('[PDF Service] Case label engine: template resolution failed, using built-in default:', err);
  }

  const resolvedConfig: DocumentTemplateConfig = resolveTemplateConfig(
    BUILT_IN_TEMPLATE_CONFIGS.case_label,
    /* theme */ undefined,
    /* docType */ docTypeOverride,
    /* instance */ undefined,
  );

  const languageAwareConfig = applyTenantLanguage(resolvedConfig, data.companySettings, docTypeOverride?.language !== undefined);

  const engineData = toCaseLabelEngineData(data, languageAwareConfig);
  await initializePDFFonts(resolveSecondary(languageAwareConfig.language));
  return renderWithQr(languageAwareConfig, engineData, ctxFromLanguageConfig(languageAwareConfig.language), logoBase64, qrCodeBase64);
}

/**
 * Build the chain_of_custody pdfmake doc-definition via the NEW config-driven
 * engine. Flag-guarded: only reached when
 * `isPdfEngineEnabled('chain_of_custody')` is true. Mirrors
 * {@link buildCaseLabelViaEngine}: resolve the tenant's deployed
 * chain_of_custody template (if any) as the doc-type cascade layer over the
 * built-in 'chain_of_custody' default, normalize the ledger data through the
 * chain-of-custody adapter (case-info header + entries table + legal notice +
 * optional hash/signature columns), and assemble via `renderTemplate`. Falls
 * back to the built-in config when no tenant template is seeded.
 */
async function buildChainOfCustodyViaEngine(
  data: ChainOfCustodyDocumentData,
  _ctx: TranslationContext,
  logoBase64: string | null,
  qrCodeBase64: string | null,
): Promise<TDocumentDefinitions> {
  let docTypeOverride: TemplateConfigOverride | undefined;
  try {
    const deployed = await getDeployedVersionByType('chain_of_custody');
    if (deployed) {
      docTypeOverride = readConfig(deployed.config);
    }
  } catch (err) {
    console.error('[PDF Service] Chain of custody engine: template resolution failed, using built-in default:', err);
  }

  const resolvedConfig: DocumentTemplateConfig = resolveTemplateConfig(
    BUILT_IN_TEMPLATE_CONFIGS.chain_of_custody,
    /* theme */ undefined,
    /* docType */ docTypeOverride,
    /* instance */ undefined,
  );

  const languageAwareConfig = applyTenantLanguage(resolvedConfig, data.companySettings, docTypeOverride?.language !== undefined);

  const engineData = toChainOfCustodyEngineData(data, languageAwareConfig);
  await initializePDFFonts(resolveSecondary(languageAwareConfig.language));
  return renderWithQr(languageAwareConfig, engineData, ctxFromLanguageConfig(languageAwareConfig.language), logoBase64, qrCodeBase64);
}

const PDF_GENERATION_TIMEOUT = 45000; // 45 seconds

export interface PDFGenerationResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

export interface PDFBlobResult {
  success: boolean;
  blobUrl?: string;
  blob?: Blob;
  filename?: string;
  error?: string;
  errorCode?: string;
}

export interface PDFGenerationOptions {
  caseId: string;
  documentType: DocumentType;
  download?: boolean;
  filename?: string;
}

export async function generateOfficeReceipt(caseId: string, download: boolean = true): Promise<PDFGenerationResult> {
  const startTime = Date.now();
  let languageCode: LanguageCode | null = null;
  let mode: 'english_only' | 'bilingual' = 'english_only';
  let fontSource: 'local' | 'cdn' | 'fallback' = 'local';

  try {
    const data = await withTimeout(
      fetchReceiptData(caseId),
      10000,
      'Failed to fetch case data'
    );

    const languageSettings = data.companySettings.localization?.document_language_settings;
    languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await withTimeout(
      initializePDFFonts(languageCode),
      15000,
      'Font initialization timeout'
    );

    if (!fontsLoaded && languageCode) {
      languageCode = null;
      mode = 'english_only';
      fontSource = 'fallback';
    }

    const ctx = createTranslationContext(mode, languageCode);

    const [logoBase64, qrCodeBase64, stampImg, sigImg] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? withTimeout(
            loadImageAsBase64(data.companySettings.branding.logo_url),
            5000,
            'Logo loading timeout'
          )
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? withTimeout(
            loadImageAsBase64(data.companySettings.branding.qr_code_general_url),
            5000,
            'QR code loading timeout'
          )
        : Promise.resolve(null),
      resolveBrandingImage(data.companySettings.branding?.stamp_url),
      resolveBrandingImage(data.companySettings.branding?.signature_url),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';
    const signatureImages = await resolveSignatureImagesConfig('office_receipt');

    const docDefinition = isPdfEngineEnabled('office_receipt')
      ? await buildOfficeReceiptViaEngine(data, ctx, logoBase64, qrCodeBase64, 'office_receipt', 'office', stampImg, sigImg)
      : buildOfficeReceiptDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption, stampImg, sigImg, signatureImages);

    const filename = `Office_Receipt_${data.caseData.case_number}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }

    const duration = Date.now() - startTime;

    await logPDFGeneration({
      caseId,
      documentType: 'office_receipt',
      languageCode,
      mode,
      success: true,
      durationMs: duration,
      fontSource,
    });

    return { success: true };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate office receipt';
    const errorCode = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'GENERATION_FAILED';

    console.error('[PDF Service] Error generating office receipt:', error);

    await logPDFGeneration({
      caseId,
      documentType: 'office_receipt',
      languageCode,
      mode,
      success: false,
      durationMs: duration,
      errorMessage,
      errorCode,
      fontSource,
    });

    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  }
}

export async function generateCustomerCopy(caseId: string, download: boolean = true): Promise<PDFGenerationResult> {
  try {
    const data = await fetchReceiptData(caseId);

    const languageSettings = data.companySettings.localization?.document_language_settings;
    let languageCode: LanguageCode | null = (languageSettings?.secondary_language as LanguageCode) || null;
    let mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await initializePDFFonts(languageCode);

    if (!fontsLoaded && languageCode) {
      console.error(`${languageCode} fonts unavailable, falling back to English-only mode`);
      languageCode = null;
      mode = 'english_only';
    }

    const ctx = createTranslationContext(mode, languageCode);

    const [logoBase64, qrCodeBase64, stampImg, sigImg] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_general_url)
        : Promise.resolve(null),
      resolveBrandingImage(data.companySettings.branding?.stamp_url),
      resolveBrandingImage(data.companySettings.branding?.signature_url),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

    // customer_copy's legacy builder has no signature block; the engine builder
    // reads its own resolved signatureImages, so it only needs the image inputs.
    const docDefinition = isPdfEngineEnabled('customer_copy')
      ? await buildCustomerCopyViaEngine(data, ctx, logoBase64, qrCodeBase64, stampImg, sigImg)
      : buildCustomerCopyDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);

    const filename = `Customer_Copy_${data.caseData.case_number}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }

    return { success: true };
  } catch (error) {
    console.error('Error generating customer copy:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate customer copy',
    };
  }
}

export async function generateCheckoutForm(caseId: string, download: boolean = true): Promise<PDFGenerationResult> {
  try {
    const data = await fetchReceiptData(caseId);

    const languageSettings = data.companySettings.localization?.document_language_settings;
    let languageCode: LanguageCode | null = (languageSettings?.secondary_language as LanguageCode) || null;
    let mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await initializePDFFonts(languageCode);

    if (!fontsLoaded && languageCode) {
      console.error(`${languageCode} fonts unavailable, falling back to English-only mode`);
      languageCode = null;
      mode = 'english_only';
    }

    const ctx = createTranslationContext(mode, languageCode);

    const [logoBase64, qrCodeBase64, stampImg, sigImg] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_general_url)
        : Promise.resolve(null),
      resolveBrandingImage(data.companySettings.branding?.stamp_url),
      resolveBrandingImage(data.companySettings.branding?.signature_url),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';
    const signatureImages = await resolveSignatureImagesConfig('checkout_form');

    const docDefinition = isPdfEngineEnabled('checkout_form')
      ? await buildCheckoutFormViaEngine(data, ctx, logoBase64, qrCodeBase64, stampImg, sigImg)
      : buildCheckoutFormDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption, stampImg, sigImg, signatureImages);

    const filename = `Checkout_Form_${data.caseData.case_number}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }

    return { success: true };
  } catch (error) {
    console.error('Error generating checkout form:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate checkout form',
    };
  }
}

export async function generateCaseLabel(caseId: string, download: boolean = true): Promise<PDFGenerationResult> {
  try {
    const data = await fetchReceiptData(caseId);

    const languageSettings = data.companySettings.localization?.document_language_settings;
    let languageCode: LanguageCode | null = (languageSettings?.secondary_language as LanguageCode) || null;
    let mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await initializePDFFonts(languageCode);

    if (!fontsLoaded && languageCode) {
      console.error(`${languageCode} fonts unavailable, falling back to English-only mode`);
      languageCode = null;
      mode = 'english_only';
    }

    const ctx = createTranslationContext(mode, languageCode);

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_label_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_label_url)
        : Promise.resolve(null),
    ]);

    const docDefinition = isPdfEngineEnabled('case_label')
      ? await buildCaseLabelViaEngine(data, ctx, logoBase64, qrCodeBase64)
      : buildCaseLabelDocument(data, ctx, logoBase64, qrCodeBase64);

    const filename = `Label_${data.caseData.case_number}.pdf`;

    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }

    return { success: true };
  } catch (error) {
    console.error('Error generating case label:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate case label',
    };
  }
}

export async function generateQuote(quoteId: string, download: boolean = true): Promise<PDFGenerationResult> {
  const startTime = Date.now();
  let languageCode: LanguageCode | null = null;
  let mode: 'english_only' | 'bilingual' = 'english_only';
  let fontSource: 'local' | 'cdn' | 'fallback' = 'local';

  try {
    const data = await withTimeout(
      fetchQuoteData(quoteId),
      10000,
      'Failed to fetch quote data'
    );

    const languageSettings = data.companySettings.localization?.document_language_settings;
    languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await withTimeout(
      initializePDFFonts(languageCode),
      15000,
      'Font initialization timeout'
    );

    if (!fontsLoaded && languageCode) {
      languageCode = null;
      mode = 'english_only';
      fontSource = 'fallback';
    }

    const ctx = createTranslationContext(mode, languageCode);

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? withTimeout(
            loadImageAsBase64(data.companySettings.branding.logo_url),
            5000,
            'Logo loading timeout'
          )
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_quote_url
        ? withTimeout(
            loadImageAsBase64(data.companySettings.branding.qr_code_quote_url),
            5000,
            'QR code loading timeout'
          )
        : Promise.resolve(null),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_quote_caption || 'Scan to approve this quote';

    const docDefinition = isPdfEngineEnabled('quote')
      ? await buildQuoteViaEngine(data, ctx, logoBase64, qrCodeBase64)
      : buildQuoteDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);

    const filename = `Quote_${data.quoteData.quote_number}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }

    const duration = Date.now() - startTime;

    await logPDFGeneration({
      caseId: data.quoteData.case_id || '',
      documentType: 'quote',
      languageCode,
      mode,
      success: true,
      durationMs: duration,
      fontSource,
    });

    return { success: true };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate quote';
    const errorCode = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'GENERATION_FAILED';

    console.error('[PDF Service] Error generating quote:', error);

    await logPDFGeneration({
      caseId: '',
      documentType: 'quote',
      languageCode,
      mode,
      success: false,
      durationMs: duration,
      errorMessage,
      errorCode,
      fontSource,
    });

    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  }
}

export async function generateInvoice(invoiceId: string, download: boolean = true): Promise<PDFGenerationResult> {
  const startTime = Date.now();
  let languageCode: LanguageCode | null = null;
  let mode: 'english_only' | 'bilingual' = 'english_only';
  let fontSource: 'local' | 'cdn' | 'fallback' = 'local';

  try {
    const data = await withTimeout(
      fetchInvoiceData(invoiceId),
      10000,
      'Failed to fetch invoice data'
    );

    const languageSettings = data.companySettings.localization?.document_language_settings;
    languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await withTimeout(
      initializePDFFonts(languageCode),
      15000,
      'Font initialization timeout'
    );

    if (!fontsLoaded && languageCode) {
      languageCode = null;
      mode = 'english_only';
      fontSource = 'fallback';
    }

    const ctx = createTranslationContext(mode, languageCode);

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? withTimeout(
            loadImageAsBase64(data.companySettings.branding.logo_url),
            5000,
            'Logo loading timeout'
          )
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_invoice_url
        ? withTimeout(
            loadImageAsBase64(data.companySettings.branding.qr_code_invoice_url),
            5000,
            'QR code loading timeout'
          )
        : Promise.resolve(null),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_invoice_caption || 'Scan to pay this invoice';

    const docDefinition = isPdfEngineEnabled('invoice')
      ? await buildInvoiceDocumentViaEngine(data, ctx, logoBase64, qrCodeBase64)
      : buildInvoiceDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);

    const invoiceType = data.invoiceData.invoice_type === 'proforma' ? 'Proforma' : 'Tax';
    const filename = `${invoiceType}_Invoice_${data.invoiceData.invoice_number}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }

    const duration = Date.now() - startTime;

    await logPDFGeneration({
      caseId: data.invoiceData.case_id || '',
      documentType: 'invoice',
      languageCode,
      mode,
      success: true,
      durationMs: duration,
      fontSource,
    });

    return { success: true };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate invoice';
    const errorCode = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'GENERATION_FAILED';

    console.error('[PDF Service] Error generating invoice:', error);

    await logPDFGeneration({
      caseId: '',
      documentType: 'invoice',
      languageCode,
      mode,
      success: false,
      durationMs: duration,
      errorMessage,
      errorCode,
      fontSource,
    });

    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  }
}

export async function generateCreditNote(creditNoteId: string, download: boolean = true): Promise<PDFGenerationResult> {
  const startTime = Date.now();
  let languageCode: LanguageCode | null = null;
  let mode: 'english_only' | 'bilingual' = 'english_only';
  let fontSource: 'local' | 'cdn' | 'fallback' = 'local';

  try {
    const data = await withTimeout(fetchCreditNoteData(creditNoteId), 10000, 'Failed to fetch credit note data');

    const languageSettings = data.companySettings.localization?.document_language_settings;
    languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await withTimeout(initializePDFFonts(languageCode), 15000, 'Font initialization timeout');
    if (!fontsLoaded && languageCode) {
      languageCode = null;
      mode = 'english_only';
      fontSource = 'fallback';
    }

    const ctx = createTranslationContext(mode, languageCode);

    const logoBase64 = data.companySettings.branding?.logo_url
      ? await withTimeout(loadImageAsBase64(data.companySettings.branding.logo_url), 5000, 'Logo loading timeout')
      : null;

    const docDefinition = buildCreditNoteDocument(data, ctx, logoBase64);
    const filename = `Credit_Note_${data.creditNoteData.credit_note_number || 'draft'}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }

    await logPDFGeneration({
      caseId: '',
      documentType: 'credit_note',
      languageCode,
      mode,
      success: true,
      durationMs: Date.now() - startTime,
      fontSource,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate credit note';
    const errorCode = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'GENERATION_FAILED';

    console.error('[PDF Service] Error generating credit note:', error);

    await logPDFGeneration({
      caseId: '',
      documentType: 'credit_note',
      languageCode,
      mode,
      success: false,
      durationMs: Date.now() - startTime,
      errorMessage,
      errorCode,
      fontSource,
    });

    return { success: false, error: errorMessage, errorCode };
  }
}

export async function generatePaymentReceipt(paymentId: string, download: boolean = true): Promise<PDFGenerationResult> {
  const startTime = Date.now();
  let languageCode: LanguageCode | null = null;
  let mode: 'english_only' | 'bilingual' = 'english_only';
  let fontSource: 'local' | 'cdn' | 'fallback' = 'local';

  try {
    const data = await withTimeout(fetchPaymentReceiptData(paymentId), 10000, 'Failed to fetch payment data');

    const languageSettings = data.companySettings.localization?.document_language_settings;
    languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await withTimeout(initializePDFFonts(languageCode), 15000, 'Font initialization timeout');
    if (!fontsLoaded && languageCode) {
      languageCode = null;
      mode = 'english_only';
      fontSource = 'fallback';
    }

    const ctx = createTranslationContext(mode, languageCode);

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? withTimeout(loadImageAsBase64(data.companySettings.branding.logo_url), 5000, 'Logo loading timeout')
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? withTimeout(loadImageAsBase64(data.companySettings.branding.qr_code_general_url), 5000, 'QR code loading timeout')
        : Promise.resolve(null),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';
    const docDefinition = isPdfEngineEnabled('payment_receipt')
      ? await buildPaymentReceiptViaEngine(data, ctx, logoBase64, qrCodeBase64)
      : buildPaymentReceiptDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
    const filename = `Payment_Receipt_${data.paymentData.receipt_number || paymentId}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }

    const duration = Date.now() - startTime;
    await logPDFGeneration({ caseId: data.paymentData.cases?.id || '', documentType: 'payment_receipt', languageCode, mode, success: true, durationMs: duration, fontSource });
    return { success: true };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate payment receipt';
    const errorCode = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'GENERATION_FAILED';
    await logPDFGeneration({ caseId: '', documentType: 'payment_receipt', languageCode, mode, success: false, durationMs: duration, errorMessage, errorCode, fontSource });
    return { success: false, error: errorMessage, errorCode };
  }
}

export async function generatePayslip(recordId: string, download: boolean = true): Promise<PDFGenerationResult> {
  const startTime = Date.now();
  let languageCode: LanguageCode | null = null;
  let mode: 'english_only' | 'bilingual' = 'english_only';
  let fontSource: 'local' | 'cdn' | 'fallback' = 'local';

  try {
    const data = await withTimeout(fetchPayslipData(recordId), 10000, 'Failed to fetch payslip data');

    const languageSettings = data.companySettings.localization?.document_language_settings;
    languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await withTimeout(initializePDFFonts(languageCode), 15000, 'Font initialization timeout');
    if (!fontsLoaded && languageCode) {
      languageCode = null;
      mode = 'english_only';
      fontSource = 'fallback';
    }

    const ctx = createTranslationContext(mode, languageCode);
    const docDefinition = isPdfEngineEnabled('payslip')
      ? await buildPayslipViaEngine(data, ctx)
      : buildPayslipDocument(data, ctx);
    const filename = `Payslip_${data.payslipData.employee.employee_number}_${data.payslipData.payroll_period.period_name}.pdf`;

    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }

    const duration = Date.now() - startTime;
    await logPDFGeneration({ caseId: '', documentType: 'payslip', languageCode, mode, success: true, durationMs: duration, fontSource });
    return { success: true };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate payslip';
    const errorCode = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'GENERATION_FAILED';
    await logPDFGeneration({ caseId: '', documentType: 'payslip', languageCode, mode, success: false, durationMs: duration, errorMessage, errorCode, fontSource });
    return { success: false, error: errorMessage, errorCode };
  }
}

export async function generateChainOfCustody(
  caseId: string,
  caseNumber: string,
  options?: { includeMetadata?: boolean; includeHashes?: boolean; includeSignatures?: boolean },
  download: boolean = true
): Promise<PDFGenerationResult> {
  const startTime = Date.now();
  let languageCode: LanguageCode | null = null;
  let mode: 'english_only' | 'bilingual' = 'english_only';
  let fontSource: 'local' | 'cdn' | 'fallback' = 'local';

  try {
    const data = await withTimeout(fetchChainOfCustodyData(caseId, caseNumber, options), 10000, 'Failed to fetch chain of custody data');

    const languageSettings = data.companySettings.localization?.document_language_settings;
    languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await withTimeout(initializePDFFonts(languageCode), 15000, 'Font initialization timeout');
    if (!fontsLoaded && languageCode) {
      languageCode = null;
      mode = 'english_only';
      fontSource = 'fallback';
    }

    const ctx = createTranslationContext(mode, languageCode);

    let docDefinition: TDocumentDefinitions;
    if (isPdfEngineEnabled('chain_of_custody')) {
      const [logoBase64, qrCodeBase64] = await Promise.all([
        data.companySettings.branding?.logo_url
          ? withTimeout(loadImageAsBase64(data.companySettings.branding.logo_url), 5000, 'Logo loading timeout')
          : Promise.resolve(null),
        data.companySettings.branding?.qr_code_general_url
          ? withTimeout(loadImageAsBase64(data.companySettings.branding.qr_code_general_url), 5000, 'QR code loading timeout')
          : Promise.resolve(null),
      ]);
      docDefinition = await buildChainOfCustodyViaEngine(data, ctx, logoBase64, qrCodeBase64);
    } else {
      docDefinition = buildChainOfCustodyDocument(data, ctx);
    }
    const filename = `Chain_of_Custody_${caseNumber}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }

    const duration = Date.now() - startTime;
    await logPDFGeneration({ caseId, documentType: 'chain_of_custody', languageCode, mode, success: true, durationMs: duration, fontSource });
    return { success: true };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate chain of custody';
    const errorCode = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'GENERATION_FAILED';
    await logPDFGeneration({ caseId, documentType: 'chain_of_custody', languageCode, mode, success: false, durationMs: duration, errorMessage, errorCode, fontSource });
    return { success: false, error: errorMessage, errorCode };
  }
}

export async function generatePDF(options: PDFGenerationOptions): Promise<PDFGenerationResult> {
  const { caseId, documentType, download = true } = options;

  switch (documentType) {
    case 'office_receipt':
      return generateOfficeReceipt(caseId, download);
    case 'customer_copy':
      return generateCustomerCopy(caseId, download);
    case 'checkout_form':
      return generateCheckoutForm(caseId, download);
    case 'case_label':
      return generateCaseLabel(caseId, download);
    case 'quote':
      return generateQuote(caseId, download);
    case 'invoice':
      return generateInvoice(caseId, download);
    default:
      return { success: false, error: `Unknown document type: ${documentType}` };
  }
}

export async function generateOfficeReceiptAsBlob(caseId: string): Promise<PDFBlobResult> {
  const startTime = Date.now();
  let languageCode: LanguageCode | null = null;
  let mode: 'english_only' | 'bilingual' = 'english_only';
  let fontSource: 'local' | 'cdn' | 'fallback' = 'local';

  try {
    const data = await withTimeout(
      fetchReceiptData(caseId),
      10000,
      'Failed to fetch case data'
    );

    const languageSettings = data.companySettings.localization?.document_language_settings;
    languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    mode = languageSettings?.mode || 'english_only';

    const fontsLoaded = await withTimeout(
      initializePDFFonts(languageCode),
      15000,
      'Font initialization timeout'
    );

    if (!fontsLoaded && languageCode) {
      languageCode = null;
      mode = 'english_only';
      fontSource = 'fallback';
    }

    const ctx = createTranslationContext(mode, languageCode);

    const [logoBase64, qrCodeBase64, stampImg, sigImg] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? withTimeout(
            loadImageAsBase64(data.companySettings.branding.logo_url),
            5000,
            'Logo loading timeout'
          )
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? withTimeout(
            loadImageAsBase64(data.companySettings.branding.qr_code_general_url),
            5000,
            'QR code loading timeout'
          )
        : Promise.resolve(null),
      resolveBrandingImage(data.companySettings.branding?.stamp_url),
      resolveBrandingImage(data.companySettings.branding?.signature_url),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';
    const signatureImages = await resolveSignatureImagesConfig('office_receipt');

    const docDefinition = isPdfEngineEnabled('office_receipt')
      ? await buildOfficeReceiptViaEngine(data, ctx, logoBase64, qrCodeBase64, 'office_receipt', 'office', stampImg, sigImg)
      : buildOfficeReceiptDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption, stampImg, sigImg, signatureImages);
    const filename = `Office_Receipt_${data.caseData.case_number}_${new Date().toISOString().split('T')[0]}.pdf`;

    const blobPromise = new Promise<{ blobUrl: string; blob: Blob }>((resolve, reject) => {
      try {
        const pdf = createPdfWithFonts(docDefinition);

        pdf.getBlob((blob: Blob) => {
          const blobUrl = URL.createObjectURL(blob);
          resolve({ blobUrl, blob });
        }, undefined, (err: any) => {
          console.error('[PDF Service] Error in getBlob callback:', err);
          reject(err);
        });
      } catch (error) {
        console.error('[PDF Service] Error creating PDF:', error);
        reject(error);
      }
    });

    const { blobUrl, blob } = await withTimeout(
      blobPromise,
      PDF_GENERATION_TIMEOUT,
      'PDF blob generation timeout'
    );

    const duration = Date.now() - startTime;

    await logPDFGeneration({
      caseId,
      documentType: 'office_receipt',
      languageCode,
      mode,
      success: true,
      durationMs: duration,
      fontSource,
    });

    return { success: true, blobUrl, blob, filename };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate office receipt';
    const errorCode = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'GENERATION_FAILED';

    console.error('[PDF Service] Error generating office receipt blob:', error);

    await logPDFGeneration({
      caseId,
      documentType: 'office_receipt',
      languageCode,
      mode,
      success: false,
      durationMs: duration,
      errorMessage,
      errorCode,
      fontSource,
    });

    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  }
}

export async function generateCustomerCopyAsBlob(caseId: string): Promise<PDFBlobResult> {
  try {
    const data = await fetchReceiptData(caseId);

    const languageSettings = data.companySettings.localization?.document_language_settings;
    const languageCode = (languageSettings?.secondary_language as LanguageCode) || null;

    await initializePDFFonts(languageCode);

    const ctx = createTranslationContext(
      languageSettings?.mode || 'english_only',
      languageCode
    );

    const [logoBase64, qrCodeBase64, stampImg, sigImg] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_general_url)
        : Promise.resolve(null),
      resolveBrandingImage(data.companySettings.branding?.stamp_url),
      resolveBrandingImage(data.companySettings.branding?.signature_url),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

    // customer_copy's legacy builder has no signature block; the engine builder
    // reads its own resolved signatureImages, so it only needs the image inputs.
    const docDefinition = isPdfEngineEnabled('customer_copy')
      ? await buildCustomerCopyViaEngine(data, ctx, logoBase64, qrCodeBase64, stampImg, sigImg)
      : buildCustomerCopyDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
    const filename = `Customer_Copy_${data.caseData.case_number}_${new Date().toISOString().split('T')[0]}.pdf`;

    return new Promise((resolve) => {
      createPdfWithFonts(docDefinition).getBlob((blob: Blob) => {
        const blobUrl = URL.createObjectURL(blob);
        resolve({ success: true, blobUrl, blob, filename });
      });
    });
  } catch (error) {
    console.error('Error generating customer copy blob:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate customer copy',
    };
  }
}

export async function generateCheckoutFormAsBlob(caseId: string): Promise<PDFBlobResult> {
  try {
    const data = await fetchReceiptData(caseId);

    const languageSettings = data.companySettings.localization?.document_language_settings;
    const languageCode = (languageSettings?.secondary_language as LanguageCode) || null;

    await initializePDFFonts(languageCode);

    const ctx = createTranslationContext(
      languageSettings?.mode || 'english_only',
      languageCode
    );

    const [logoBase64, qrCodeBase64, stampImg, sigImg] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_general_url)
        : Promise.resolve(null),
      resolveBrandingImage(data.companySettings.branding?.stamp_url),
      resolveBrandingImage(data.companySettings.branding?.signature_url),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';
    const signatureImages = await resolveSignatureImagesConfig('checkout_form');

    const docDefinition = isPdfEngineEnabled('checkout_form')
      ? await buildCheckoutFormViaEngine(data, ctx, logoBase64, qrCodeBase64, stampImg, sigImg)
      : buildCheckoutFormDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption, stampImg, sigImg, signatureImages);
    const filename = `Checkout_Form_${data.caseData.case_number}_${new Date().toISOString().split('T')[0]}.pdf`;

    return new Promise((resolve) => {
      createPdfWithFonts(docDefinition).getBlob((blob: Blob) => {
        const blobUrl = URL.createObjectURL(blob);
        resolve({ success: true, blobUrl, blob, filename });
      });
    });
  } catch (error) {
    console.error('Error generating checkout form blob:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate checkout form',
    };
  }
}

export async function generateCaseLabelAsBlob(caseId: string): Promise<PDFBlobResult> {
  try {
    const data = await fetchReceiptData(caseId);

    const languageSettings = data.companySettings.localization?.document_language_settings;
    const languageCode = (languageSettings?.secondary_language as LanguageCode) || null;

    await initializePDFFonts(languageCode);

    const ctx = createTranslationContext(
      languageSettings?.mode || 'english_only',
      languageCode
    );

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_label_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_label_url)
        : Promise.resolve(null),
    ]);

    const docDefinition = isPdfEngineEnabled('case_label')
      ? await buildCaseLabelViaEngine(data, ctx, logoBase64, qrCodeBase64)
      : buildCaseLabelDocument(data, ctx, logoBase64, qrCodeBase64);
    const filename = `Label_${data.caseData.case_number}.pdf`;

    return new Promise((resolve) => {
      createPdfWithFonts(docDefinition).getBlob((blob: Blob) => {
        const blobUrl = URL.createObjectURL(blob);
        resolve({ success: true, blobUrl, blob, filename });
      });
    });
  } catch (error) {
    console.error('Error generating case label blob:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate case label',
    };
  }
}

export async function generateQuoteAsBlob(quoteId: string): Promise<PDFBlobResult> {
  try {
    const data = await fetchQuoteData(quoteId);

    const languageSettings = data.companySettings.localization?.document_language_settings;
    const languageCode = (languageSettings?.secondary_language as LanguageCode) || null;

    await initializePDFFonts(languageCode);

    const ctx = createTranslationContext(
      languageSettings?.mode || 'english_only',
      languageCode
    );

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_quote_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_quote_url)
        : Promise.resolve(null),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_quote_caption || 'Scan to approve this quote';

    const docDefinition = isPdfEngineEnabled('quote')
      ? await buildQuoteViaEngine(data, ctx, logoBase64, qrCodeBase64)
      : buildQuoteDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
    const filename = `Quote_${data.quoteData.quote_number}_${new Date().toISOString().split('T')[0]}.pdf`;

    return new Promise((resolve) => {
      createPdfWithFonts(docDefinition).getBlob((blob: Blob) => {
        const blobUrl = URL.createObjectURL(blob);
        resolve({ success: true, blobUrl, blob, filename });
      });
    });
  } catch (error) {
    console.error('Error generating quote blob:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate quote',
    };
  }
}

export async function generateInvoiceAsBlob(invoiceId: string): Promise<PDFBlobResult> {
  try {
    const data = await fetchInvoiceData(invoiceId);

    const languageSettings = data.companySettings.localization?.document_language_settings;
    const languageCode = (languageSettings?.secondary_language as LanguageCode) || null;

    await initializePDFFonts(languageCode);

    const ctx = createTranslationContext(
      languageSettings?.mode || 'english_only',
      languageCode
    );

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_invoice_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_invoice_url)
        : Promise.resolve(null),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_invoice_caption || 'Scan to pay this invoice';

    const docDefinition = isPdfEngineEnabled('invoice')
      ? await buildInvoiceDocumentViaEngine(data, ctx, logoBase64, qrCodeBase64)
      : buildInvoiceDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
    const invoiceType = data.invoiceData.invoice_type === 'proforma' ? 'Proforma' : 'Tax';
    const filename = `${invoiceType}_Invoice_${data.invoiceData.invoice_number}_${new Date().toISOString().split('T')[0]}.pdf`;

    return new Promise((resolve) => {
      createPdfWithFonts(docDefinition).getBlob((blob: Blob) => {
        const blobUrl = URL.createObjectURL(blob);
        resolve({ success: true, blobUrl, blob, filename });
      });
    });
  } catch (error) {
    console.error('Error generating invoice blob:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate invoice',
    };
  }
}

export async function generatePaymentReceiptAsBlob(paymentId: string): Promise<PDFBlobResult> {
  try {
    const data = await fetchPaymentReceiptData(paymentId);
    const languageSettings = data.companySettings.localization?.document_language_settings;
    const languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    await initializePDFFonts(languageCode);
    const ctx = createTranslationContext(languageSettings?.mode || 'english_only', languageCode);

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url ? loadImageAsBase64(data.companySettings.branding.logo_url) : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url ? loadImageAsBase64(data.companySettings.branding.qr_code_general_url) : Promise.resolve(null),
    ]);
    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

    const docDefinition = isPdfEngineEnabled('payment_receipt')
      ? await buildPaymentReceiptViaEngine(data, ctx, logoBase64, qrCodeBase64)
      : buildPaymentReceiptDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
    const filename = `Payment_Receipt_${data.paymentData.receipt_number || paymentId}_${new Date().toISOString().split('T')[0]}.pdf`;

    return new Promise((resolve) => {
      createPdfWithFonts(docDefinition).getBlob((blob: Blob) => {
        const blobUrl = URL.createObjectURL(blob);
        resolve({ success: true, blobUrl, blob, filename });
      });
    });
  } catch (error) {
    console.error('Error generating payment receipt blob:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate payment receipt' };
  }
}

export async function generatePayslipAsBlob(recordId: string): Promise<PDFBlobResult> {
  try {
    const data = await fetchPayslipData(recordId);
    const languageSettings = data.companySettings.localization?.document_language_settings;
    const languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    await initializePDFFonts(languageCode);
    const ctx = createTranslationContext(languageSettings?.mode || 'english_only', languageCode);

    const docDefinition = isPdfEngineEnabled('payslip')
      ? await buildPayslipViaEngine(data, ctx)
      : buildPayslipDocument(data, ctx);
    const filename = `Payslip_${data.payslipData.employee.employee_number}_${data.payslipData.payroll_period.period_name}.pdf`;

    return new Promise((resolve) => {
      createPdfWithFonts(docDefinition).getBlob((blob: Blob) => {
        const blobUrl = URL.createObjectURL(blob);
        resolve({ success: true, blobUrl, blob, filename });
      });
    });
  } catch (error) {
    console.error('Error generating payslip blob:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate payslip' };
  }
}

export async function generateChainOfCustodyAsBlob(
  caseId: string,
  caseNumber: string,
  options?: { includeMetadata?: boolean; includeHashes?: boolean; includeSignatures?: boolean }
): Promise<PDFBlobResult> {
  try {
    const data = await fetchChainOfCustodyData(caseId, caseNumber, options);
    const languageSettings = data.companySettings.localization?.document_language_settings;
    const languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
    await initializePDFFonts(languageCode);
    const ctx = createTranslationContext(languageSettings?.mode || 'english_only', languageCode);

    let docDefinition: TDocumentDefinitions;
    if (isPdfEngineEnabled('chain_of_custody')) {
      const [logoBase64, qrCodeBase64] = await Promise.all([
        data.companySettings.branding?.logo_url ? loadImageAsBase64(data.companySettings.branding.logo_url) : Promise.resolve(null),
        data.companySettings.branding?.qr_code_general_url ? loadImageAsBase64(data.companySettings.branding.qr_code_general_url) : Promise.resolve(null),
      ]);
      docDefinition = await buildChainOfCustodyViaEngine(data, ctx, logoBase64, qrCodeBase64);
    } else {
      docDefinition = buildChainOfCustodyDocument(data, ctx);
    }
    const filename = `Chain_of_Custody_${caseNumber}_${new Date().toISOString().split('T')[0]}.pdf`;

    return new Promise((resolve) => {
      createPdfWithFonts(docDefinition).getBlob((blob: Blob) => {
        const blobUrl = URL.createObjectURL(blob);
        resolve({ success: true, blobUrl, blob, filename });
      });
    });
  } catch (error) {
    console.error('Error generating chain of custody blob:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate chain of custody' };
  }
}

export async function generatePDFAsBlob(documentType: DocumentType, caseId: string): Promise<PDFBlobResult> {
  switch (documentType) {
    case 'office_receipt':
      return generateOfficeReceiptAsBlob(caseId);
    case 'customer_copy':
      return generateCustomerCopyAsBlob(caseId);
    case 'checkout_form':
      return generateCheckoutFormAsBlob(caseId);
    case 'case_label':
      return generateCaseLabelAsBlob(caseId);
    case 'quote':
      return generateQuoteAsBlob(caseId);
    case 'invoice':
      return generateInvoiceAsBlob(caseId);
    default:
      return { success: false, error: `Unknown document type: ${documentType}` };
  }
}
