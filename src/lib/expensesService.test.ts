import { describe, it, expect, vi, beforeEach } from 'vitest';

// getExpensesByCategory wraps a supabase query; mock the client (env-throwing on
// import) and feed mixed-currency rows so the assertion proves base-currency summation.
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('./financialService', () => ({ createFinancialTransaction: vi.fn() }));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(),
  getBaseCurrency: vi.fn(),
  getCurrencyDecimals: vi.fn(),
}));

import { getExpensesByCategory, EXPENSE_LIST_COLUMNS, recordExpenseDisbursement, rejectExpense } from './expensesService';

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

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

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
    for (const col of ['id', 'expense_number', 'expense_date', 'amount', 'amount_base', 'status', 'notes', 'vendor', 'description', 'case_id', 'rejection_reason']) {
      expect(EXPENSE_LIST_COLUMNS).toContain(col);
    }
  });

  it('does not reference a payment_method_id column (no such column exists on expenses)', () => {
    expect(EXPENSE_LIST_COLUMNS).not.toContain('payment_method_id');
  });
});

describe('recordExpenseDisbursement (EXP-017 — atomic Mark-as-Paid)', () => {
  it('calls the atomic RPC with the disbursement args (reference included only when given)', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'e1', status: 'paid' }, error: null });

    const res = await recordExpenseDisbursement('e1', 'acct-1', '2026-06-22', 'REF-9');

    expect(rpc).toHaveBeenCalledWith('record_expense_disbursement', {
      p_expense_id: 'e1',
      p_bank_account_id: 'acct-1',
      p_paid_at: '2026-06-22',
      p_reference: 'REF-9',
    });
    expect(res).toEqual({ id: 'e1', status: 'paid' });
  });

  it('omits p_reference when no reference is supplied', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'e1', status: 'paid' }, error: null });

    await recordExpenseDisbursement('e1', 'acct-1', '2026-06-22');

    expect(rpc).toHaveBeenCalledWith('record_expense_disbursement', {
      p_expense_id: 'e1',
      p_bank_account_id: 'acct-1',
      p_paid_at: '2026-06-22',
    });
  });

  it('surfaces the RPC guard error (e.g. insufficient funds) to the caller', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Insufficient funds in Operations (balance 10, required 200)' } });

    await expect(recordExpenseDisbursement('e1', 'acct-1', '2026-06-22')).rejects.toMatchObject({
      message: expect.stringContaining('Insufficient funds'),
    });
  });
});

describe('rejectExpense (EXP-007 — reason to its own column, notes preserved)', () => {
  // rejectExpense issues TWO .from('expenses') calls: a status read, then the update.
  const statusReader = (status: string | null) => {
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      maybeSingle: vi.fn().mockResolvedValue({ data: status === null ? null : { status }, error: null }),
    };
    return b;
  };
  const updateCapture = (captured: { payload?: Record<string, unknown> }) => {
    const b: Record<string, unknown> = {
      update: vi.fn((p: Record<string, unknown>) => { captured.payload = p; return b; }),
      eq: vi.fn(() => b),
      select: vi.fn(() => b),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'e1', status: 'rejected' }, error: null }),
    };
    return b;
  };

  it('writes rejection_reason + rejected_by and never touches notes or approved_by', async () => {
    const captured: { payload?: Record<string, unknown> } = {};
    from.mockReturnValueOnce(statusReader('pending')).mockReturnValueOnce(updateCapture(captured));

    await rejectExpense('e1', 'mgr-9', 'Missing VAT receipt');

    expect(captured.payload).toMatchObject({ status: 'rejected', rejection_reason: 'Missing VAT receipt', rejected_by: 'mgr-9' });
    expect(captured.payload).not.toHaveProperty('notes');       // submitter's notes preserved
    expect(captured.payload).not.toHaveProperty('approved_by'); // no approved_by collision
    expect(typeof captured.payload!.rejected_at).toBe('string');
  });

  it('refuses to reject a non-pending expense (state guard)', async () => {
    const captured: { payload?: Record<string, unknown> } = {};
    const upd = updateCapture(captured);
    from.mockReturnValueOnce(statusReader('approved')).mockReturnValueOnce(upd);

    await expect(rejectExpense('e1', 'mgr-9', 'x')).rejects.toThrow(/pending/i);
    expect(upd.update).not.toHaveBeenCalled();
  });

  it('throws when the expense does not exist', async () => {
    from.mockReturnValueOnce(statusReader(null));
    await expect(rejectExpense('e1', 'mgr-9', 'x')).rejects.toThrow(/not found/i);
  });
});
