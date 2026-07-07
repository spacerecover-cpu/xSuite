import { describe, it, expect } from 'vitest';
import { inGstInvoiceProfile } from './documents';
import { resolveDocumentProfile } from '../registry';
import { registerAllRegimePlugins } from '../register';
import type { TaxComputation } from '../types';

registerAllRegimePlugins();

const computation = (over: Partial<TaxComputation>): TaxComputation => ({
  lines: [], rollups: [],
  totals: { taxableBase: 0, taxTotal: 0, grandTotal: 0, roundingAdjustment: null },
  expectedWithholding: null, notations: [],
  trace: { regimeKey: 'in_gst', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'split_by_place_of_supply', steps: [] },
  ...over,
});

describe('in_gst_invoice DocumentComplianceProfile', () => {
  it('is registered and identity-correct', () => {
    expect(resolveDocumentProfile('in_gst_invoice')).toBe(inGstInvoiceProfile);
    expect(inGstInvoiceProfile.key).toBe('in_gst_invoice');
    expect(inGstInvoiceProfile.version).toBe('1.0.0');
    expect(inGstInvoiceProfile.requiresTaxInvoiceCeremony).toBe(true);
    expect(inGstInvoiceProfile.showRegistrationBand).toBe(true);
    expect(inGstInvoiceProfile.paperSize).toBe('A4');
    expect(inGstInvoiceProfile.bilingual).toEqual({ enabled: false, secondaryLanguage: null, arabicLead: false });
  });

  it('forces HSN and UQC columns — the tenant cannot delete them', () => {
    expect(inGstInvoiceProfile.forcedColumns).toEqual(['item_code', 'unit_code']);
  });

  it("titles 'TAX INVOICE' only for a registered seller when required, 'Invoice' otherwise", () => {
    expect(inGstInvoiceProfile.documentTitle({ docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: true }))
      .toEqual({ title: 'TAX INVOICE', titleTranslated: null });
    expect(inGstInvoiceProfile.documentTitle({ docType: 'invoice', sellerRegistered: false, taxInvoiceRequired: true }).title)
      .toBe('Invoice');
    expect(inGstInvoiceProfile.documentTitle({ docType: 'credit_note', sellerRegistered: true, taxInvoiceRequired: true }).title)
      .toBe('CREDIT NOTE');
    expect(inGstInvoiceProfile.documentTitle({ docType: 'quote', sellerRegistered: true, taxInvoiceRequired: true }).title)
      .toBe('Quotation');
    expect(inGstInvoiceProfile.documentTitle({ docType: 'stock_sale', sellerRegistered: true, taxInvoiceRequired: true }).title)
      .toBe('TAX INVOICE');
    expect(inGstInvoiceProfile.documentTitle({ docType: 'stock_sale', sellerRegistered: false, taxInvoiceRequired: true }).title)
      .toBe('Cash Sale');
  });

  it('passes through reverse-charge notations from the computation, invents none', () => {
    const notes = inGstInvoiceProfile.notations(computation({
      notations: [{ code: 'REVERSE_CHARGE', text: 'Tax payable on reverse charge basis' }],
    }));
    expect(notes).toEqual([{ code: 'REVERSE_CHARGE', text: 'Tax payable on reverse charge basis' }]);
    expect(inGstInvoiceProfile.notations(computation({ notations: [] }))).toEqual([]);
  });
});
