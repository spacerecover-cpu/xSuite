// India GST document compliance profile (CGST Rules r.46/r.49/r.53). Consumed by
// the Localization Phase-2 profile plumbing: countryTemplateOverride, the pdfmake
// adapters, and the React previews all read the SAME resolved profile so screen and
// print cannot diverge. bilingual:false — India invoices are English-only (no
// statutory second script), unlike the GCC Arabic profile.
import type {
  DocumentComplianceProfile, TaxComputation, DocumentNotation, TaxDocumentType,
} from '../types';

const TITLES: Record<TaxDocumentType, { registered: string; unregistered: string }> = {
  invoice:     { registered: 'TAX INVOICE', unregistered: 'Invoice' },
  credit_note: { registered: 'CREDIT NOTE', unregistered: 'Credit Note' },
  quote:       { registered: 'Quotation',   unregistered: 'Quotation' },
  stock_sale:  { registered: 'TAX INVOICE', unregistered: 'Cash Sale' },
};

export const inGstInvoiceProfile: DocumentComplianceProfile = {
  key: 'in_gst_invoice',
  version: '1.0.0',
  documentTitle(ctx) {
    const t = TITLES[ctx.docType];
    const useRegistered = ctx.sellerRegistered && ctx.taxInvoiceRequired;
    // Quotation/Cash-Sale titles do not depend on registration; the map already
    // encodes that (both keys equal for quote; unregistered stock_sale = Cash Sale).
    return { title: useRegistered ? t.registered : t.unregistered, titleTranslated: null };
  },
  requiresTaxInvoiceCeremony: true,
  showRegistrationBand: true,
  forcedColumns: ['item_code', 'unit_code'],
  bilingual: { enabled: false, secondaryLanguage: null, arabicLead: false },
  paperSize: 'A4',
  notations(computation: TaxComputation): DocumentNotation[] {
    // The in_gst strategy (WP-S3) already queues REVERSE_CHARGE / ZERO_RATED
    // treatment notations; the profile passes them through and never invents amounts.
    return computation.notations;
  },
};
