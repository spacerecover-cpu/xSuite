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

import {
  getStockStats,
  getSalesReport,
  getTodaysSales,
  getTopSellingItems,
  createStockSale,
  recordStockReceipt,
  cancelStockSale,
  bulkAdjustQuantities,
  getStockItems,
  getLowStockItems,
} from './stockService';

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

describe('Bug 110: Low Stock KPI badge count must agree with the Low Stock tab contents', () => {
  // One shared low-stock predicate: at/below reorder point but > 0 (out-of-stock is
  // its own mutually-exclusive bucket). The stats.lowStockCount badge and the tab rows
  // (getStockItems lowStock) must return the SAME low-only set — previously the badge
  // excluded out-of-stock while the tab list included it. getLowStockItems() instead
  // returns the low-OR-out UNION, because its consumers (generateLowStockAlerts,
  // getLowStockCount) need both buckets to emit distinct out_of_stock/low_stock alerts.
  const items = [
    { current_quantity: 2, minimum_quantity: 5, item_type: 'internal' }, // low (counts)
    { current_quantity: 0, minimum_quantity: 5, item_type: 'internal' }, // out-of-stock (does NOT count as low)
    { current_quantity: 10, minimum_quantity: 5, item_type: 'internal' }, // healthy
  ];

  it('getStockStats.lowStockCount excludes the out-of-stock item and matches outOfStockCount separately', async () => {
    from
      .mockReturnValueOnce(makeQuery(items))
      .mockReturnValueOnce(makeQuery([])); // sales-today
    const stats = await getStockStats();
    expect(stats.lowStockCount).toBe(1);
    expect(stats.outOfStockCount).toBe(1);
  });

  it('getStockItems({lowStock}) lists exactly the badge-counted rows (out-of-stock excluded)', async () => {
    from.mockReturnValue(makeQuery(items));
    const rows = await getStockItems({ lowStock: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].current_quantity).toBe(2);
  });

  it('getLowStockItems returns the low-OR-out union (alert consumers need both)', async () => {
    from.mockReturnValue(makeQuery(items));
    const rows = await getLowStockItems();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.current_quantity).sort()).toEqual([0, 2]);
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

  it('Bug 68: excludes collected tax from revenue so Gross Profit/Margin are not inflated', async () => {
    // 15% VAT: subtotal 100, cost 60 ⇒ total_amount 115, tax_amount 15.
    // Net revenue must be 100 (not 115); profit 40 (not 55); margin 40% (not 47.8%).
    const query = makeQuery([
      {
        total_amount: 115,
        tax_amount: 15,
        stock_sale_items: [{ quantity: 1, stock_items: { cost_price: 60 } }],
      },
    ]);
    from.mockReturnValue(query);

    const report = await getSalesReport('2020-01-01', '2020-12-31');

    expect(report.totalRevenue).toBe(100);
    expect(report.totalCost).toBe(60);
    expect(report.totalProfit).toBe(40);
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

describe('getTopSellingItems (Bug 65: exclude cancelled/refunded sales and honour the date range)', () => {
  it('joins stock_sales!inner and filters parent deleted_at + sale_date range, plus line-item deleted_at', async () => {
    const query = makeQuery([
      { item_id: 'i1', quantity: 3, total: 300, stock_items: { id: 'i1', name: 'WD 2TB', brand: 'WD', sku: 'WD2' } },
    ]);
    from.mockReturnValue(query);

    const result = await getTopSellingItems('2020-01-01', '2020-12-31', 10);

    // the parent sale must be inner-joined so a soft-deleted stock_sales row drops its live line items
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('stock_sales!inner'));
    // line item's own soft-delete filter
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    // parent sale not cancelled/refunded (cancel_stock_sale soft-deletes the parent only)
    expect(query.is).toHaveBeenCalledWith('stock_sales.deleted_at', null);
    // date range applied through the parent sale_date (was previously ignored)
    expect(query.gte).toHaveBeenCalledWith('stock_sales.sale_date', '2020-01-01');
    expect(query.lte).toHaveBeenCalledWith('stock_sales.sale_date', '2020-12-31');

    expect(result).toEqual([
      { id: 'i1', name: 'WD 2TB', brand: 'WD', sku: 'WD2', totalQty: 3, totalRevenue: 300 },
    ]);
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

describe('FU-4: non-atomic stock writes route through atomic RPCs', () => {
  beforeEach(() => rpc.mockReset());

  it('recordStockReceipt calls record_stock_receipt with the full arg set', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await recordStockReceipt('item-1', 5, {
      poId: 'po-1',
      cost: 12.5,
      serialNumbers: ['SN1', 'SN2'],
      notes: 'delivery',
    });
    expect(rpc).toHaveBeenCalledWith('record_stock_receipt', {
      p_item_id: 'item-1',
      p_quantity: 5,
      p_po_id: 'po-1',
      p_unit_cost: 12.5,
      p_serial_numbers: ['SN1', 'SN2'],
      p_notes: 'delivery',
    });
  });

  it('recordStockReceipt omits optional args (server DEFAULTs apply) and surfaces rpc errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(recordStockReceipt('item-1', 3)).rejects.toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('record_stock_receipt', {
      p_item_id: 'item-1',
      p_quantity: 3,
      p_po_id: undefined,
      p_unit_cost: undefined,
      p_serial_numbers: undefined,
      p_notes: undefined,
    });
  });

  it('cancelStockSale calls cancel_stock_sale and surfaces errors', async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null });
    await cancelStockSale('sale-9');
    expect(rpc).toHaveBeenCalledWith('cancel_stock_sale', { p_sale_id: 'sale-9' });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    await expect(cancelStockSale('sale-9')).rejects.toBeTruthy();
  });

  it('bulkAdjustQuantities maps adjustments to p_adjustments and returns the RPC count', async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null });
    const count = await bulkAdjustQuantities([
      { id: 'a', newQuantity: 10, reason: 'recount' },
      { id: 'b', newQuantity: 0, reason: 'damaged' },
    ]);
    expect(count).toBe(2);
    expect(rpc).toHaveBeenCalledWith('bulk_adjust_stock_quantities', {
      p_adjustments: [
        { id: 'a', new_quantity: 10, reason: 'recount' },
        { id: 'b', new_quantity: 0, reason: 'damaged' },
      ],
    });
  });
});
