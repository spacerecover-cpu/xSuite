import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaxComputation, TaxContext } from './regimes/types';
import type { RateContext } from './currencyService';

const cannedComputation: TaxComputation = {
  lines: [], rollups: [],
  totals: { taxableBase: 0, taxTotal: 0, grandTotal: 0, roundingAdjustment: null },
  expectedWithholding: null, notations: [],
  trace: { regimeKey: 'simple_vat', pluginVersion: 't', packVersionId: null, schemeMode: 'single', steps: [] },
};

const { computeSpy, tables, fromMock } = vi.hoisted(() => {
  const computeSpy = vi.fn(async (_ctx: unknown): Promise<TaxComputation> => (undefined as unknown as TaxComputation));
  const tables: Record<string, unknown> = {};
  const makeChain = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'lte', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: Array.isArray(result) ? result[0] ?? null : result, error: null }));
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: Array.isArray(result) ? result : result === null ? [] : [result], error: null });
    return chain;
  };
  const fromMock = vi.fn((table: string) => makeChain(tables[table] ?? null));
  return { computeSpy, tables, fromMock };
});

vi.mock('./supabaseClient', () => ({ supabase: { from: fromMock } }));
vi.mock('./regimes/register', () => ({ registerAllRegimePlugins: vi.fn() }));
vi.mock('./regimes/registry', () => ({
  resolveTaxStrategy: vi.fn(() => ({
    key: 'simple_vat', version: 't', schemeMode: 'single',
    defaults: { roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western' },
    compute: computeSpy,
  })),
}));

import { computeDocumentTotals } from './taxDocumentService';

const rc: RateContext = { documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2, rate: 1, rateSource: 'derived' };
const baseInput = {
  items: [{ description: 'Data recovery — evaluation', quantity: 1, unit_price: 8000 }],
  discountType: null, discountAmount: 0, taxRate: 18,
  documentType: 'invoice' as const, documentDate: '2026-07-05', taxInclusive: false,
};

beforeEach(() => {
  computeSpy.mockReset();
  computeSpy.mockResolvedValue(cannedComputation);
  fromMock.mockClear();
  tables.legal_entities = { id: 'le-1', tenant_id: 't-1', country_id: 'in-1', subdivision_id: 'sub-ka', tax_identifier: '29AAACX0000X1ZW', is_primary: true };
  tables.legal_entity_tax_registrations = [];
  tables.tenants = {
    resolved_country_config: {
      'regime.tax': 'in_gst',
      'tax.rounding_policy': { mode: 'half_up', level: 'head', cash_increment: 1 },
      'format.amount_words_scale': 'indian',
    },
  };
  tables.geo_country_tax_rates = [
    { id: 'r-cgst', country_id: 'in-1', subdivision_id: null, component_code: 'CGST', component_label: 'CGST', tax_category: 'standard', rate: 9, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 0 },
    { id: 'r-sgst', country_id: 'in-1', subdivision_id: null, component_code: 'SGST', component_label: 'SGST', tax_category: 'standard', rate: 9, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 1 },
    { id: 'r-igst', country_id: 'in-1', subdivision_id: null, component_code: 'IGST', component_label: 'IGST', tax_category: 'standard', rate: 18, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 2 },
  ];
  tables.customers_enhanced = { tax_number: '27AAPFU0939F1ZV', country_id: 'in-1', subdivision_id: 'sub-ka' };
  tables.companies = null;
  tables.geo_subdivisions = [
    { id: 'sub-ka', tax_authority_code: '29' },
    { id: 'sub-mh', tax_authority_code: '27' },
  ];
});

describe('computeDocumentTotals — buyer-seam threading (P4 S2)', () => {
  it('threads buyer fields, GSTIN-derived place of supply, pack rounding and scale into TaxContext', async () => {
    const result = await computeDocumentTotals({ ...baseInput, customerId: 'cust-1', companyId: null }, rc);
    expect(computeSpy).toHaveBeenCalledTimes(1);
    const ctx = computeSpy.mock.calls[0][0] as TaxContext;
    expect(ctx.buyer).toEqual({
      taxNumber: '27AAPFU0939F1ZV', countryId: 'in-1', subdivisionId: 'sub-ka',
      isBusiness: false, addressSnapshot: null,
    });
    // Registered buyer: GSTIN prefix 27 wins over billing state 29 (Sec 12(2)).
    expect(ctx.placeOfSupplySubdivisionId).toBe('sub-mh');
    expect(ctx.seller.subdivisionId).toBe('sub-ka');
    expect(ctx.roundingPolicy).toEqual({ mode: 'half_up', level: 'head', cash_increment: 1 });
    expect(ctx.scaleSystem).toBe('indian');
    expect(result.placeOfSupplySubdivisionId).toBe('sub-mh');
  });

  it('company overrides customer for buyer identity and sets isBusiness', async () => {
    tables.companies = { tax_number: '29AAACX0000X1ZW', country_id: 'in-1', subdivision_id: 'sub-ka' };
    await computeDocumentTotals({ ...baseInput, customerId: 'cust-1', companyId: 'co-1' }, rc);
    const ctx = computeSpy.mock.calls[0][0] as TaxContext;
    expect(ctx.buyer.taxNumber).toBe('29AAACX0000X1ZW');
    expect(ctx.buyer.isBusiness).toBe(true);
    expect(ctx.placeOfSupplySubdivisionId).toBe('sub-ka');
  });

  it('parity: without buyer ids and without pack bindings the context matches the legacy shape and skips buyer fetches', async () => {
    tables.tenants = { resolved_country_config: {} };
    const result = await computeDocumentTotals(baseInput, rc);
    const ctx = computeSpy.mock.calls[0][0] as TaxContext;
    expect(ctx.buyer).toEqual({ taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null });
    expect(ctx.placeOfSupplySubdivisionId).toBeNull();
    expect(ctx.roundingPolicy).toEqual({ mode: 'half_up', level: 'document' });
    expect(ctx.scaleSystem).toBe('western');
    expect(result.placeOfSupplySubdivisionId).toBeNull();
    const fetched = fromMock.mock.calls.map((c) => c[0]);
    expect(fetched).not.toContain('customers_enhanced');
    expect(fetched).not.toContain('companies');
    expect(fetched).not.toContain('geo_subdivisions');
  });
});
