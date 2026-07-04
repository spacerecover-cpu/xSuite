import type { DocumentComplianceProfile, DocumentNotation, TaxComputation } from '../types';

/** The default document profile: today's rendered behavior, made explicit. */
export const genericInvoice: DocumentComplianceProfile = {
  key: 'generic_invoice',
  version: '1.0.0',
  documentTitle({ docType, sellerRegistered, taxInvoiceRequired }) {
    // Supply Arabic titles so a bilingual (e.g. KW/QA) document doesn't fall back to the base
    // config's 'فاتورة ضريبية' (TAX INVOICE) for a plain 'INVOICE' — mergeLabels keeps the base
    // ar when the override omits it, which would pair English 'INVOICE' with Arabic 'TAX INVOICE'.
    if (docType === 'quote') return { title: 'QUOTATION', titleTranslated: 'عرض أسعار' };
    if (docType === 'credit_note') return { title: 'CREDIT NOTE', titleTranslated: 'إشعار دائن' };
    if (docType === 'stock_sale') return { title: 'SALES RECEIPT', titleTranslated: 'إيصال مبيعات' };
    return sellerRegistered && taxInvoiceRequired
      ? { title: 'TAX INVOICE', titleTranslated: 'فاتورة ضريبية' }
      : { title: 'INVOICE', titleTranslated: 'فاتورة' };
  },
  requiresTaxInvoiceCeremony: true,
  showRegistrationBand: true,
  forcedColumns: [],
  bilingual: { enabled: false, secondaryLanguage: null, arabicLead: false },
  paperSize: 'A4',
  notations(computation: TaxComputation): DocumentNotation[] {
    return computation.notations;
  },
};
