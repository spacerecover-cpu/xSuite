import { describe, it, expect, vi, beforeEach } from 'vitest';

// getCashFlowSummary fans out through fetchTransactions (a supabase query);
// mock the client (env-throwing on import) and feed mixed-currency rows so the
// assertion proves base-currency summation, never the raw native amount.
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { getCashFlowSummary } from './transactionsService';

/** Thenable query builder: fetchTransactions chains select/is/order/eq/gte/lte/range. */
function makeQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    or: vi.fn(() => builder),
    range: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

beforeEach(() => from.mockReset());

describe('getCashFlowSummary (cross-document monthly totals must be base currency)', () => {
  it('sums amount_base across mixed-currency rows per month, never the raw native amount', async () => {
    // income: 100 @ base 38, plus 50 @ base 50 ⇒ base income 88 (raw native would be 150).
    // expense: 30 @ base 12 ⇒ base expense 12 (raw native would be 30).
    const query = makeQuery([
      { amount: 100, amount_base: 38, transaction_type: 'income', transaction_date: '2026-01-15' },
      { amount: 50, amount_base: 50, transaction_type: 'income', transaction_date: '2026-01-20' },
      { amount: 30, amount_base: 12, transaction_type: 'expense', transaction_date: '2026-01-25' },
    ]);
    from.mockReturnValue(query);

    const summary = await getCashFlowSummary();

    expect(summary).toHaveLength(1);
    expect(summary[0].month).toBe('2026-01');
    expect(summary[0].income).toBe(88);
    expect(summary[0].expense).toBe(12);
    expect(summary[0].netFlow).toBe(76);
    // fetchTransactions selects '*', so amount_base reaches the rows for baseAmount.
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('*'));
  });

  it('falls back to the raw amount for pre-base transition rows (no amount_base)', async () => {
    const query = makeQuery([
      { amount: 70, transaction_type: 'income', transaction_date: '2026-02-01' },
      { amount: 20, transaction_type: 'expense', transaction_date: '2026-02-02' },
    ]);
    from.mockReturnValue(query);

    const summary = await getCashFlowSummary();

    expect(summary[0].income).toBe(70);
    expect(summary[0].expense).toBe(20);
  });
});
