import { describe, it, expect, vi, beforeEach } from 'vitest';

// getStockStats/getSalesReport/getTodaysSales each wrap a supabase query; mock the
// client (env-throwing on import) and feed mixed-currency rows so the assertions
// prove base-currency summation, never the raw native sum.
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({
  supabase: { from },
  getTenantId: () => 'tenant-1',
}));
vi.mock('./postgrestSanitizer', () => ({ sanitizeFilterValue: (v: string) => v }));

import { getStockStats, getSalesReport, getTodaysSales } from './stockService';

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
