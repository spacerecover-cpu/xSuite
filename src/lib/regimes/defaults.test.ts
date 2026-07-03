import { describe, it, expect } from 'vitest';
import { registerAllRegimePlugins } from './register';
import {
  resolveTaxStrategy, resolveNumberingPolicy, resolveDocumentProfile, resolveEInvoicingTransport,
} from './registry';

describe('default regime plugins (the ~80% data-only path)', () => {
  registerAllRegimePlugins();
  it('all four defaults resolve', () => {
    expect(resolveTaxStrategy('simple_vat').version).toBe('1.0.0');
    expect(resolveNumberingPolicy('prefix_numbering').key).toBe('prefix_numbering');
    expect(resolveDocumentProfile('generic_invoice').key).toBe('generic_invoice');
    expect(resolveEInvoicingTransport('no_einvoice').regimeClass).toBe('render_artifact');
  });
  it('registerAllRegimePlugins is idempotent (same objects, no duplicate-key throw)', () => {
    expect(() => registerAllRegimePlugins()).not.toThrow();
  });
  it('prefix_numbering: legacy prefixes, never a format_template (zero behavior change)', () => {
    const seeds = resolveNumberingPolicy('prefix_numbering').defaultSequences({ countryCode: 'OM', fiscalYearStart: '01-01' });
    const invoices = seeds.find((s) => s.scope === 'invoices');
    expect(invoices).toEqual({
      scope: 'invoices', prefix: 'INVO', format_template: null,
      reset_basis: 'never', fiscal_year_anchor: null, max_length: null, padding: 4,
    });
    expect(seeds.map((s) => s.scope)).toEqual(
      expect.arrayContaining(['invoices', 'proforma_invoices', 'quote', 'case', 'customers', 'companies', 'payment']),
    );
    expect(seeds.every((s) => s.format_template === null)).toBe(true);
  });
  it('generic_invoice: TAX INVOICE only when registered AND required', () => {
    const p = resolveDocumentProfile('generic_invoice');
    expect(p.documentTitle({ docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: true }))
      .toEqual({ title: 'TAX INVOICE', titleTranslated: null });
    expect(p.documentTitle({ docType: 'invoice', sellerRegistered: false, taxInvoiceRequired: true }).title).toBe('INVOICE');
    expect(p.documentTitle({ docType: 'quote', sellerRegistered: true, taxInvoiceRequired: true }).title).toBe('QUOTATION');
    expect(p.requiresTaxInvoiceCeremony).toBe(true);
    expect(p.forcedColumns).toEqual([]);
  });
  it('no_einvoice: buildArtifact refuses (no statutory artifact exists for this regime)', () => {
    const t = resolveEInvoicingTransport('no_einvoice');
    expect(() => t.buildArtifact({
      documentType: 'invoice', documentId: 'x', documentNumber: 'INVO-1', issuedAt: '2026-07-02T00:00:00Z',
      currency: 'OMR', totals: { taxableBase: 0, taxTotal: 0, grandTotal: 0 },
      taxLines: [], sellerTaxIdentifier: null, buyerTaxNumber: null,
    })).toThrowError(/no_einvoice/);
  });
});
