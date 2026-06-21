import { describe, it, expect, vi, beforeEach } from 'vitest';

// fetchFinancialSummary runs two parallel queries (invoices + expenses); mock the
// client (env-throwing on import) and feed mixed-currency rows so the assertions
// prove base-currency summation, never the raw native amount.
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from }, resolveTenantId: vi.fn() }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { fetchFinancialSummary } from './financialService';

/** Thenable query builder: select/is/gte/lte are chainable; awaiting yields {data}. */
function makeQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    is: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

beforeEach(() => from.mockReset());

describe('fetchFinancialSummary (cross-document totals must be base currency)', () => {
  it('sums *_base across mixed-currency invoices and expenses, never the raw native amount', async () => {
    // Invoices: 100 @ base 38 + 50 @ base 50 ⇒ base totals 88. Raw native sum would be 150.
    const invoiceQuery = makeQuery([
      {
        total_amount: 100, total_amount_base: 38,
        amount_paid: 100, amount_paid_base: 38,
        balance_due: 0, balance_due_base: 0,
        status: 'paid',
      },
      {
        total_amount: 50, total_amount_base: 50,
        amount_paid: 20, amount_paid_base: 20,
        balance_due: 30, balance_due_base: 30,
        status: 'partial',
      },
    ]);
    // Expenses: 200 @ base 76 + 40 @ base 40 ⇒ base total 116. Raw native sum would be 240.
    const expenseQuery = makeQuery([
      { amount: 200, amount_base: 76, status: 'approved' },
      { amount: 40, amount_base: 40, status: 'paid' },
    ]);

    from.mockImplementation((table: string) =>
      table === 'invoices' ? invoiceQuery : expenseQuery,
    );

    const summary = await fetchFinancialSummary();

    expect(summary.totalInvoiced).toBe(88);
    expect(summary.totalPaid).toBe(58);
    expect(summary.totalOutstanding).toBe(30);
    expect(summary.totalExpenses).toBe(116);
    // the fix is real only if the base shadows are actually selected
    expect(invoiceQuery.select).toHaveBeenCalledWith(expect.stringContaining('total_amount_base'));
    expect(invoiceQuery.select).toHaveBeenCalledWith(expect.stringContaining('amount_paid_base'));
    expect(invoiceQuery.select).toHaveBeenCalledWith(expect.stringContaining('balance_due_base'));
    expect(expenseQuery.select).toHaveBeenCalledWith(expect.stringContaining('amount_base'));
  });

  it('falls back to the raw amount for pre-base transition rows (no *_base)', async () => {
    const invoiceQuery = makeQuery([
      { total_amount: 70, amount_paid: 70, balance_due: 0, status: 'paid' },
    ]);
    const expenseQuery = makeQuery([{ amount: 25, status: 'approved' }]);
    from.mockImplementation((table: string) =>
      table === 'invoices' ? invoiceQuery : expenseQuery,
    );

    const summary = await fetchFinancialSummary();

    expect(summary.totalInvoiced).toBe(70);
    expect(summary.totalPaid).toBe(70);
    expect(summary.totalExpenses).toBe(25);
  });
});
