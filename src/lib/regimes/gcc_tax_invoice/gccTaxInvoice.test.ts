import { describe, it, expect } from 'vitest';
import { gccTaxInvoiceProfile } from './index';
import type { TaxComputation } from '../types';

const emptyComputation: TaxComputation = {
  lines: [],
  rollups: [],
  totals: { taxableBase: 0, taxTotal: 0, grandTotal: 0, roundingAdjustment: null },
  expectedWithholding: null,
  notations: [],
  trace: { regimeKey: 'simple_vat', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'single', steps: [] },
};

describe('gccTaxInvoiceProfile', () => {
  it('titles a registered seller invoice TAX INVOICE (bilingual)', () => {
    const t = gccTaxInvoiceProfile.documentTitle({
      docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: true,
    });
    expect(t).toEqual({ title: 'TAX INVOICE', titleTranslated: 'فاتورة ضريبية' });
  });

  it('titles an UNregistered seller invoice plain INVOICE', () => {
    const t = gccTaxInvoiceProfile.documentTitle({
      docType: 'invoice', sellerRegistered: false, taxInvoiceRequired: true,
    });
    expect(t).toEqual({ title: 'INVOICE', titleTranslated: 'فاتورة' });
  });

  it('titles an invoice plain INVOICE when the country does not require the ceremony', () => {
    const t = gccTaxInvoiceProfile.documentTitle({
      docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: false,
    });
    expect(t.title).toBe('INVOICE');
  });

  it('titles quotes, credit notes and POS sales', () => {
    expect(gccTaxInvoiceProfile.documentTitle({ docType: 'quote', sellerRegistered: true, taxInvoiceRequired: true }).title).toBe('QUOTATION');
    expect(gccTaxInvoiceProfile.documentTitle({ docType: 'credit_note', sellerRegistered: true, taxInvoiceRequired: true }).title).toBe('TAX CREDIT NOTE');
    expect(gccTaxInvoiceProfile.documentTitle({ docType: 'stock_sale', sellerRegistered: true, taxInvoiceRequired: true }).title).toBe('SIMPLIFIED TAX INVOICE');
    expect(gccTaxInvoiceProfile.documentTitle({ docType: 'stock_sale', sellerRegistered: false, taxInvoiceRequired: true }).title).toBe('RECEIPT');
  });

  it('declares the GCC statutory shape', () => {
    expect(gccTaxInvoiceProfile.key).toBe('gcc_tax_invoice');
    expect(gccTaxInvoiceProfile.requiresTaxInvoiceCeremony).toBe(true);
    expect(gccTaxInvoiceProfile.showRegistrationBand).toBe(true);
    expect(gccTaxInvoiceProfile.forcedColumns).toEqual([]);
    expect(gccTaxInvoiceProfile.bilingual).toEqual({ enabled: true, secondaryLanguage: 'ar', arabicLead: false });
    expect(gccTaxInvoiceProfile.paperSize).toBe('A4');
  });

  it('emits a reverse-charge notation from the computation', () => {
    const comp: TaxComputation = {
      ...emptyComputation,
      rollups: [{
        lineItemId: null, componentCode: 'VAT', componentLabel: 'VAT 5%', jurisdictionRef: null,
        rate: 5, taxableBase: 100, taxAmount: 0, taxTreatment: 'reverse_charge',
        treatmentReasonCode: null, sequence: 0,
      }],
    };
    const notes = gccTaxInvoiceProfile.notations(comp);
    expect(notes).toContainEqual({
      code: 'REVERSE_CHARGE',
      text: 'VAT to be accounted for by the recipient under the reverse-charge mechanism.',
      textTranslated: 'يتم احتساب ضريبة القيمة المضافة من قبل المستلم وفقاً لآلية الاحتساب العكسي.',
    });
  });

  it('emits a zero-rated notation carrying the reason code', () => {
    const comp: TaxComputation = {
      ...emptyComputation,
      rollups: [{
        lineItemId: null, componentCode: 'VAT', componentLabel: 'VAT 0%', jurisdictionRef: null,
        rate: 0, taxableBase: 100, taxAmount: 0, taxTreatment: 'zero_rated',
        treatmentReasonCode: 'EXPORT_SERVICES', sequence: 0,
      }],
    };
    const notes = gccTaxInvoiceProfile.notations(comp);
    expect(notes).toContainEqual({
      code: 'ZERO_RATED',
      text: 'Zero-rated supply (EXPORT_SERVICES).',
      textTranslated: 'توريد خاضع لنسبة الصفر (EXPORT_SERVICES).',
    });
  });
});
