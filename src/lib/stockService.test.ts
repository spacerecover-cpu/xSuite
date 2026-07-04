import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaxComputation } from './regimes/types';

// getStockStats/getSalesReport/getTodaysSales each wrap a supabase query; mock the
// client (env-throwing on import) and feed mixed-currency rows so the assertions
// prove base-currency summation, never the raw native sum. createStockSale exercises
// the rpc leg (record_stock_sale) — same hoisted mock, distinct fn.
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({
  supabase: { from, rpc },
  getTenantId: () => 'tenant-1',
}));
vi.mock('./postgrestSanitizer', () => ({ sanitizeFilterValue: (v: string) => v }));

import { getStockStats, getSalesReport, getTodaysSales, createStockSale } from './stockService';

/**
 * Thenable query builder: every chained filter returns the builder; awaiting it
 * (or calling .order, which resolves at the end of each chain) yields {data}.
 */
function makeQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    is: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

beforeEach(() => from.mockReset());

describe('getStockStats (cross-document revenue total must be base currency)', () => {
  it('sums total_amount_base across mixed-currency sales, never the raw native total', async () => {
    // stock_items query (first .from): empty so stockValue math is irrelevant.
    const itemsQuery = makeQuery([]);
    // sales-today query (second .from): 100 @ base 38 + 50 @ base 50 ⇒ base total 88.
    // Raw native sum would be 150.
    const salesQuery = makeQuery([
      { total_amount: 100, total_amount_base: 38 },
      { total_amount: 50, total_amount_base: 50 },
    ]);
    from
      .mockReturnValueOnce(itemsQuery)
      .mockReturnValueOnce(salesQuery);

    const stats = await getStockStats();

    expect(stats.revenueToday).toBe(88);
    // the fix is real only if the base shadow is actually selected
    expect(salesQuery.select).toHaveBeenCalledWith(expect.stringContaining('total_amount_base'));
  });
});

describe('getSalesReport (cross-document revenue total must be base currency)', () => {
  it('sums total_amount_base across mixed-currency sales, never the raw native total', async () => {
    const query = makeQuery([
      { total_amount: 100, total_amount_base: 38, stock_sale_items: [] },
      { total_amount: 50, total_amount_base: 50, stock_sale_items: [] },
    ]);
    from.mockReturnValue(query);

    const report = await getSalesReport('2020-01-01', '2020-12-31');

    expect(report.totalRevenue).toBe(88);
  });
});

describe('getTodaysSales (cross-document revenue total must be base currency)', () => {
  it('sums total_amount_base across mixed-currency sales, never the raw native total', async () => {
    const query = makeQuery([
      { total_amount: 100, total_amount_base: 38 },
      { total_amount: 50, total_amount_base: 50 },
    ]);
    from.mockReturnValue(query);

    const summary = await getTodaysSales();

    expect(summary.revenue).toBe(88);
  });
});

describe('createStockSale (Task 26: kernel tax parity — p_tax_lines threading)', () => {
  beforeEach(() => rpc.mockReset());

  const taxComputation: TaxComputation = {
    lines: [{
      lineItemId: null, componentCode: 'VAT', componentLabel: 'VAT', jurisdictionRef: null,
      rate: 5, taxableBase: 10, taxAmount: 0.5, taxTreatment: 'standard', treatmentReasonCode: null, sequence: 0,
    }],
    rollups: [{
      lineItemId: null, componentCode: 'VAT', componentLabel: 'VAT', jurisdictionRef: null,
      rate: 5, taxableBase: 10, taxAmount: 0.5, taxTreatment: 'standard', treatmentReasonCode: null, sequence: 0,
    }],
    totals: { taxableBase: 10, taxTotal: 0.5, grandTotal: 10.5, roundingAdjustment: null },
    expectedWithholding: null,
    notations: [],
    trace: { regimeKey: 'simple_vat', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'single', steps: [] },
  };

  it('passes p_tax_lines with a rollup (line_item_id null) carrying component_label/regime_key/plugin_version', async () => {
    rpc.mockResolvedValue({ data: { id: 'sale-1' }, error: null });

    await createStockSale({
      customer_id: 'cust-1',
      currency: 'OMR',
      taxComputation,
      items: [{ stock_item_id: 'item-1', quantity: 2, unit_price: 5 }],
    });

    const call = rpc.mock.calls.find((c) => c[0] === 'record_stock_sale');
    const taxLines = (call![1] as { p_tax_lines: Array<{ line_item_id: string | null; tax_amount: number }> }).p_tax_lines;
    // Regression (whole-branch review CRITICAL): send ONLY the document-level rollups, never
    // [...lines, ...rollups]. Both carry line_item_id:null for POS, so threading both would let
    // record_stock_sale's `line_item_id IS NULL` header/ledger filter double-count the tax.
    expect(taxLines).toHaveLength(taxComputation.rollups.length); // 1, not 2
    expect(taxLines.every((l) => l.line_item_id === null)).toBe(true);
    expect(taxLines.reduce((s, l) => s + l.tax_amount, 0)).toBe(0.5); // rollup total, NOT doubled 1.0
    expect(taxLines[0]).toMatchObject({ component_label: 'VAT', regime_key: 'simple_vat', plugin_version: '1.0.0' });
  });

  it('sends p_tax_lines: null when no taxComputation is supplied (backward compatible)', async () => {
    rpc.mockResolvedValue({ data: { id: 'sale-2' }, error: null });

    await createStockSale({
      customer_id: 'cust-1',
      currency: 'OMR',
      items: [{ stock_item_id: 'item-1', quantity: 1, unit_price: 5 }],
    });

    expect(rpc).toHaveBeenCalledWith('record_stock_sale', expect.objectContaining({ p_tax_lines: null }));
  });
});
