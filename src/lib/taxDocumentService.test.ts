import { describe, it, expect, vi } from 'vitest';
import { computeDocumentTax } from './tax/kernel';
import type { GeoCountryTaxRateRow, TaxContext } from './regimes/types';
import type { RateContext } from './currencyService';

// `vi.mock` factories are hoisted above imports, so any variable they close
// over must be created via `vi.hoisted` (a bare top-level `const` here would
// still be in its TDZ when the factory first runs).
const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<{ data: Record<string, unknown> | null; error: Error | null }> => ({
    data: {
      ok: false, document_number: null, tax_lines: [], totals: {},
      requirement_failures: [{ field_key: 'buyer_tax_number', level: 'block', message: 'Buyer VATIN is required for B2B tax invoices.' }],
      trace: null,
    },
    error: null,
  })),
}));
vi.mock('./supabaseClient', () => ({ supabase: { rpc: rpcMock } }));

import { buildTaxableLines, matchFormRate, totalsFromComputation, dryRunIssueTaxDocument } from './taxDocumentService';

const rc: RateContext = { documentCurrency: 'OMR', documentDecimals: 3, baseCurrency: 'OMR', baseDecimals: 3, rate: 1, rateSource: 'derived' };
const omVat: GeoCountryTaxRateRow = {
  id: 'r1', country_id: 'om', subdivision_id: null, component_code: 'VAT', component_label: 'VAT',
  tax_category: 'standard', rate: 5, applies_to: null, valid_from: '2021-04-16', valid_to: null, sort_order: 0,
};

describe('taxDocumentService pure helpers', () => {
  it('buildTaxableLines converts per-item % discounts to dp-rounded amounts (legacy parity)', () => {
    const lines = buildTaxableLines(
      [{ description: 'x', quantity: 3, unit_price: 40.5, discount_percent: 10 }], 3,
    );
    expect(lines[0]).toMatchObject({ lineItemId: 'idx:0', lineDiscount: 12.15, quantity: 3, unitPrice: 40.5, treatment: 'standard' });
  });
  it('matchFormRate: exact standard match wins; unmatched rate synthesizes a form: row (provenance preserved)', () => {
    expect(matchFormRate([omVat], 5)).toEqual([omVat]);
    const synth = matchFormRate([omVat], 7.5);
    expect(synth).toHaveLength(1);
    expect(synth[0]).toMatchObject({ id: 'form:7.5', rate: 7.5, component_code: 'VAT', tax_category: 'standard' });
    expect(matchFormRate([omVat], 0)).toEqual([]); // rate 0 → no components (untaxed document)
  });
  it('totalsFromComputation restores the legacy header shape (subtotal pre-doc-discount)', () => {
    const ctx: TaxContext = {
      documentType: 'invoice',
      seller: { legalEntityId: 'le', countryId: 'om', subdivisionId: null, taxIdentifier: null, registrations: [] },
      buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
      taxPointDate: '2026-07-02', placeOfSupplySubdivisionId: null,
      lines: buildTaxableLines([{ description: 'a', quantity: 1, unit_price: 100 }, { description: 'b', quantity: 1, unit_price: 100 }], 3),
      documentDiscount: 0.1, taxInclusive: false, rateContext: rc, rates: [omVat],
      roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western',
    };
    const c = computeDocumentTax(ctx);
    const t = totalsFromComputation(c, 0.1, rc.documentDecimals);
    expect(t.subtotal).toBe(200);        // pre-doc-discount, legacy shape
    expect(t.taxAmount).toBe(9.995);     // round(199.900 * 0.05, 3)
    expect(t.totalAmount).toBe(209.895);
  });
});

describe('dryRunIssueTaxDocument', () => {
  it('calls issue_tax_document with p_dry_run=true and normalizes the failures', async () => {
    const result = await dryRunIssueTaxDocument('invoice', 'inv-1');
    expect(rpcMock).toHaveBeenCalledWith('issue_tax_document', {
      p_doc_type: 'invoice', p_doc_id: 'inv-1', p_dry_run: true,
    });
    expect(result.requirement_failures[0]).toMatchObject({ field_key: 'buyer_tax_number', level: 'block' });
  });

  it('defaults requirement_failures to [] when the RPC response omits the key (pre-Task-18 shape)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, tax_lines: [], totals: {}, trace: null },
      error: null,
    });
    const result = await dryRunIssueTaxDocument('quote', 'q-1');
    expect(result.requirement_failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('throws the RPC error instead of swallowing it', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('rpc boom') });
    await expect(dryRunIssueTaxDocument('credit_note', 'cn-1')).rejects.toThrow('rpc boom');
  });
});
