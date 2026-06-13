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
import { withTimeout, createTranslationContext } from './translationContext';
import type { DocumentType } from './types';
import { type LanguageCode } from '../documentTranslations';

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

    const [logoBase64, qrCodeBase64] = await Promise.all([
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
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

    const docDefinition = buildOfficeReceiptDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);

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

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_general_url)
        : Promise.resolve(null),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

    const docDefinition = buildCustomerCopyDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);

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

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_general_url)
        : Promise.resolve(null),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

    const docDefinition = buildCheckoutFormDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);

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

    const docDefinition = buildCaseLabelDocument(data, ctx, logoBase64, qrCodeBase64);

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

    const docDefinition = buildQuoteDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);

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

    const docDefinition = buildInvoiceDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);

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
    const docDefinition = buildPaymentReceiptDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
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
    const docDefinition = buildPayslipDocument(data, ctx);
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
    const docDefinition = buildChainOfCustodyDocument(data, ctx);
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

    const [logoBase64, qrCodeBase64] = await Promise.all([
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
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

    const docDefinition = buildOfficeReceiptDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
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

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_general_url)
        : Promise.resolve(null),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

    const docDefinition = buildCustomerCopyDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
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

    const [logoBase64, qrCodeBase64] = await Promise.all([
      data.companySettings.branding?.logo_url
        ? loadImageAsBase64(data.companySettings.branding.logo_url)
        : Promise.resolve(null),
      data.companySettings.branding?.qr_code_general_url
        ? loadImageAsBase64(data.companySettings.branding.qr_code_general_url)
        : Promise.resolve(null),
    ]);

    const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

    const docDefinition = buildCheckoutFormDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
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

    const docDefinition = buildCaseLabelDocument(data, ctx, logoBase64, qrCodeBase64);
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

    const docDefinition = buildQuoteDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
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

    const docDefinition = buildInvoiceDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
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

    const docDefinition = buildPaymentReceiptDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
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

    const docDefinition = buildPayslipDocument(data, ctx);
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

    const docDefinition = buildChainOfCustodyDocument(data, ctx);
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
