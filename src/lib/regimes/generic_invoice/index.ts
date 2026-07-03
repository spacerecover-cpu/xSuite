import type { DocumentComplianceProfile, DocumentNotation, TaxComputation } from '../types';

/** The default document profile: today's rendered behavior, made explicit. */
export const genericInvoice: DocumentComplianceProfile = {
  key: 'generic_invoice',
  version: '1.0.0',
  documentTitle({ docType, sellerRegistered, taxInvoiceRequired }) {
    if (docType === 'quote') return { title: 'QUOTATION', titleTranslated: null };
    if (docType === 'credit_note') return { title: 'CREDIT NOTE', titleTranslated: null };
    if (docType === 'stock_sale') return { title: 'SALES RECEIPT', titleTranslated: null };
    return sellerRegistered && taxInvoiceRequired
      ? { title: 'TAX INVOICE', titleTranslated: null }
      : { title: 'INVOICE', titleTranslated: null };
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
