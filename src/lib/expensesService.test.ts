import { describe, it, expect, vi, beforeEach } from 'vitest';

// getExpensesByCategory wraps a supabase query; mock the client (env-throwing on
// import) and feed mixed-currency rows so the assertion proves base-currency summation.
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('./financialService', () => ({ createFinancialTransaction: vi.fn() }));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(),
  getBaseCurrency: vi.fn(),
  getCurrencyDecimals: vi.fn(),
}));

import { getExpensesByCategory, EXPENSE_LIST_COLUMNS } from './expensesService';

/** Thenable query builder: select/in/gte/lte are chainable; awaiting yields {data}. */
function makeQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

beforeEach(() => from.mockReset());

describe('getExpensesByCategory (cross-document totals must be base currency)', () => {
  it('sums amount_base across mixed-currency expenses, never the raw native amount', async () => {
    // 100 @ rate→38 base, plus 50 @ base 50 ⇒ base total 88. Raw native sum would be 150.
    const query = makeQuery([
      { amount: 100, amount_base: 38, exchange_rate: 0.38, category: { id: 'ops', name: 'Operations' } },
      { amount: 50, amount_base: 50, exchange_rate: 1, category: { id: 'ops', name: 'Operations' } },
    ]);
    from.mockReturnValue(query);

    const result = await getExpensesByCategory();

    expect(result).toEqual([{ id: 'ops', name: 'Operations', amount: 88 }]);
    // the fix is real only if the base shadow is actually selected
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('amount_base'));
  });

  it('falls back to the raw amount for pre-base transition rows (no amount_base)', async () => {
    const query = makeQuery([
      { amount: 70, exchange_rate: 1, category: { id: 'ops', name: 'Operations' } },
    ]);
    from.mockReturnValue(query);

    const result = await getExpensesByCategory();

    expect(result).toEqual([{ id: 'ops', name: 'Operations', amount: 70 }]);
  });
});

describe('EXPENSE_LIST_COLUMNS (the edit form must be able to pre-select the saved category)', () => {
  it('selects the scalar category_id — the missing column behind the "edit blanks Category" bug', () => {
    // The list previously selected only the joined category object, so the edit
    // modal read initialData.category_id === undefined and reset the dropdown to "".
    expect(EXPENSE_LIST_COLUMNS).toContain('category_id');
  });

  it('still selects the columns the list rows + base-currency totals depend on', () => {
    for (const col of ['id', 'expense_number', 'expense_date', 'amount', 'amount_base', 'status', 'notes', 'vendor', 'description', 'case_id']) {
      expect(EXPENSE_LIST_COLUMNS).toContain(col);
    }
  });

  it('does not reference a payment_method_id column (no such column exists on expenses)', () => {
    expect(EXPENSE_LIST_COLUMNS).not.toContain('payment_method_id');
  });
});
