import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
vi.mock('./tenantToday', () => ({ currentTenantToday: vi.fn(() => Promise.resolve('2026-07-01')) }));

import {
  getExpensesByCategory,
  EXPENSE_LIST_COLUMNS,
  recordExpenseDisbursement,
  rejectExpense,
  archiveExpense,
  deleteExpense,
  getExpenseLedgerReconciliation,
  approveExpense,
  getExpenseStats,
} from './expensesService';
import { getBaseCurrency, getCurrencyDecimals } from './currencyService';
import { currentTenantToday } from './tenantToday';

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

describe('getExpenseStats thisMonthAmount (tenant-local month boundary, not UTC-converted local date)', () => {
  afterEach(() => vi.useRealTimers());

  it('buckets "this month" on the tenant calendar month even when the browser clock is a later month', async () => {
    // Browser wall clock sits in a LATER month (August) than the tenant's local
    // "today" (July). The pre-fix code derived thisMonthStart from new Date() (August),
    // wrongly EXCLUDING July expenses from the July KPI. The fix reads currentTenantToday().
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    vi.mocked(currentTenantToday).mockResolvedValue('2026-07-05');

    const query = makeQuery([
      { amount: 100, amount_base: 100, exchange_rate: 1, status: 'approved', expense_date: '2026-07-10', category_id: 'ops' },
      { amount: 40, amount_base: 40, exchange_rate: 1, status: 'approved', expense_date: '2026-06-20', category_id: 'ops' },
    ]);
    from.mockReturnValue(query);

    const stats = await getExpenseStats();

    // July 10 expense counts toward July's "this month"; June 20 does not.
    expect(stats.thisMonthAmount).toBe(100);
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

describe('archiveExpense / deleteExpense (EXP-018/EXP-006 — admin-gated atomic archive)', () => {
  it('archiveExpense calls archive_expense with the id, and p_reason only when given', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'e1', status: 'voided' }, error: null });
    const res = await archiveExpense('e1');
    expect(rpc).toHaveBeenCalledWith('archive_expense', { p_expense_id: 'e1' });
    expect(res).toEqual({ id: 'e1', status: 'voided' });

    rpc.mockResolvedValueOnce({ data: {}, error: null });
    await archiveExpense('e1', 'cleanup');
    expect(rpc).toHaveBeenLastCalledWith('archive_expense', { p_expense_id: 'e1', p_reason: 'cleanup' });
  });

  it('deleteExpense delegates to archive_expense (back-compat alias)', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'e1' }, error: null });
    await deleteExpense('e1');
    expect(rpc).toHaveBeenCalledWith('archive_expense', { p_expense_id: 'e1' });
  });

  it('surfaces the RPC guard error (paid / non-admin block)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Cannot archive a paid expense — reverse its disbursement (un-pay) first' } });
    await expect(archiveExpense('e1')).rejects.toMatchObject({ message: expect.stringContaining('paid expense') });
  });

  it('getExpenseLedgerReconciliation calls reconcile_expense_ledger (empty + date-filtered)', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await getExpenseLedgerReconciliation();
    expect(rpc).toHaveBeenCalledWith('reconcile_expense_ledger', {});

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await getExpenseLedgerReconciliation({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    expect(rpc).toHaveBeenLastCalledWith('reconcile_expense_ledger', { p_date_from: '2026-01-01', p_date_to: '2026-12-31' });
  });
});

describe('expense input-VAT posting (Phase 0 money dimensions)', () => {
  const expenseReader = (expense: Record<string, unknown>) => {
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      maybeSingle: vi.fn().mockResolvedValue({ data: expense, error: null }),
    };
    return b;
  };
  const approveUpdate = () => {
    const b: Record<string, unknown> = {
      update: vi.fn(() => b),
      eq: vi.fn(() => b),
      select: vi.fn(() => b),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'e1', status: 'approved' }, error: null }),
    };
    return b;
  };
  const vatInsert = (captured: { payload?: Record<string, unknown> }, error: unknown = null) => ({
    insert: vi.fn((rows: Array<Record<string, unknown>>) => {
      captured.payload = rows[0];
      return Promise.resolve({ error });
    }),
  });
  const pendingExpense = {
    amount: 100, description: 'x', currency: 'EUR', exchange_rate: 0.41, rate_source: 'manual',
    amount_base: 41, status: 'pending', created_by: 'u-creator', expense_date: '2026-06-15',
    tax_amount: 5, tax_amount_base: 2.05,
  };

  it('posts purchase VAT with currency, frozen rate and base amounts', async () => {
    vi.mocked(getBaseCurrency).mockResolvedValue('OMR');
    vi.mocked(getCurrencyDecimals).mockResolvedValue(3);
    const captured: { payload?: Record<string, unknown> } = {};
    from
      .mockReturnValueOnce(expenseReader({ ...pendingExpense }))
      .mockReturnValueOnce(approveUpdate())
      .mockReturnValueOnce(vatInsert(captured));

    await approveExpense('e1', 'u-approver');

    expect(captured.payload).toMatchObject({
      record_type: 'purchase', record_id: 'e1', currency: 'EUR', exchange_rate: 0.41,
      vat_amount: 5,
      vat_amount_base: 2.05,     // roundMoney(5 * 0.41, 3)
      taxable_amount_base: 41,   // roundMoney(100 * 0.41, 3)
    });
  });

  it('THROWS when the vat_records insert fails (no more silent input-VAT loss)', async () => {
    vi.mocked(getBaseCurrency).mockResolvedValue('OMR');
    vi.mocked(getCurrencyDecimals).mockResolvedValue(3);
    const captured: { payload?: Record<string, unknown> } = {};
    from
      .mockReturnValueOnce(expenseReader({ ...pendingExpense }))
      .mockReturnValueOnce(approveUpdate())
      .mockReturnValueOnce(vatInsert(captured, { message: 'boom' }));

    await expect(approveExpense('e1', 'u-approver')).rejects.toMatchObject({ message: 'boom' });
  });
});
