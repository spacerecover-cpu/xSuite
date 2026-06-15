import { describe, it, expect, vi, beforeEach } from 'vitest';

// getPaymentStats wraps a supabase query; mock the client (env-throwing on import)
// and feed mixed-currency rows so the assertion proves base-currency summation.
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { getPaymentStats } from './paymentsService';

/** Thenable query builder: select/gte/lte are chainable; awaiting it yields {data}. */
function makeQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

beforeEach(() => from.mockReset());

describe('getPaymentStats (D7 — cross-document totals must be base currency)', () => {
  it('sums amount_base across mixed-currency payments, never the raw native amount', async () => {
    // 100 @ rate→38 base, plus 50 @ base 50 ⇒ base total 88. Raw native sum would be 150.
    const query = makeQuery([
      { amount: 100, amount_base: 38, status: 'completed', payment_date: '2020-01-01' },
      { amount: 50, amount_base: 50, status: 'completed', payment_date: '2020-01-01' },
    ]);
    from.mockReturnValue(query);

    const stats = await getPaymentStats();

    expect(stats.totalAmount).toBe(88);
    expect(stats.completedAmount).toBe(88);
    // the fix is real only if the base shadow is actually selected
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('amount_base'));
  });

  it('falls back to the raw amount for pre-base transition rows (no amount_base)', async () => {
    const query = makeQuery([{ amount: 70, status: 'completed', payment_date: '2020-01-01' }]);
    from.mockReturnValue(query);

    const stats = await getPaymentStats();

    expect(stats.totalAmount).toBe(70);
  });
});
