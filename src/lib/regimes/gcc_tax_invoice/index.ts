import type {
  DocumentComplianceProfile,
  DocumentNotation,
  TaxComputation,
} from '../types';

/**
 * Statutory notation strings (English + Arabic) for the GCC reverse-charge and
 * zero-rated ceremonies. Exported as a stable structure — NOT inlined — because
 * WP-2 Task 18 re-freezes these SAME strings as literals in a migration and a
 * drift test imports this constant to assert they match. Do not edit one side
 * without the other.
 */
export const GCC_TAX_INVOICE_NOTATIONS = {
  REVERSE_CHARGE: {
    code: 'REVERSE_CHARGE',
    text: 'VAT to be accounted for by the recipient under the reverse-charge mechanism.',
    textTranslated: 'يتم احتساب ضريبة القيمة المضافة من قبل المستلم وفقاً لآلية الاحتساب العكسي.',
  },
  ZERO_RATED: (reasonCode: string | null): DocumentNotation => ({
    code: 'ZERO_RATED',
    text: `Zero-rated supply (${reasonCode ?? 'unspecified'}).`,
    textTranslated: `توريد خاضع لنسبة الصفر (${reasonCode ?? 'unspecified'}).`,
  }),
} as const;

/** GCC (OM/AE/SA/BH — VAT states) document compliance profile.
 *  Title ceremony: only a registered seller in a tax_invoice_required country
 *  may issue a 'TAX INVOICE'; everyone else issues a plain 'INVOICE'.
 *  POS sales title as the GCC 'simplified tax invoice' when registered. */
export const gccTaxInvoiceProfile: DocumentComplianceProfile = {
  key: 'gcc_tax_invoice',
  version: '1.0.0',

  documentTitle(ctx) {
    if (ctx.docType === 'quote') {
      return { title: 'QUOTATION', titleTranslated: 'عرض سعر' };
    }
    if (ctx.docType === 'credit_note') {
      return ctx.sellerRegistered && ctx.taxInvoiceRequired
        ? { title: 'TAX CREDIT NOTE', titleTranslated: 'إشعار دائن ضريبي' }
        : { title: 'CREDIT NOTE', titleTranslated: 'إشعار دائن' };
    }
    if (ctx.docType === 'stock_sale') {
      return ctx.sellerRegistered && ctx.taxInvoiceRequired
        ? { title: 'SIMPLIFIED TAX INVOICE', titleTranslated: 'فاتورة ضريبية مبسطة' }
        : { title: 'RECEIPT', titleTranslated: 'إيصال' };
    }
    return ctx.sellerRegistered && ctx.taxInvoiceRequired
      ? { title: 'TAX INVOICE', titleTranslated: 'فاتورة ضريبية' }
      : { title: 'INVOICE', titleTranslated: 'فاتورة' };
  },

  requiresTaxInvoiceCeremony: true,
  showRegistrationBand: true,
  forcedColumns: [],
  bilingual: { enabled: true, secondaryLanguage: 'ar', arabicLead: false },
  paperSize: 'A4',

  notations(computation: TaxComputation): DocumentNotation[] {
    const notes: DocumentNotation[] = [];
    const rollups = computation.rollups;
    if (rollups.some((r) => r.taxTreatment === 'reverse_charge')) {
      notes.push(GCC_TAX_INVOICE_NOTATIONS.REVERSE_CHARGE);
    }
    for (const r of rollups) {
      if (r.taxTreatment === 'zero_rated') {
        notes.push(GCC_TAX_INVOICE_NOTATIONS.ZERO_RATED(r.treatmentReasonCode));
        break;
      }
    }
    return notes;
  },
};
