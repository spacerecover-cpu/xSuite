import { describe, it, expect, vi, beforeEach } from 'vitest';

// getAccountBalanceSummary sums bank-account balances across documents; mock the
// supabase client (env-throwing on import) and feed mixed-currency accounts so the
// assertion proves base-currency summation, never the raw native balance.
const { from, rpc, getUser, resolveTenantId } = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), getUser: vi.fn(), resolveTenantId: vi.fn(),
}));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc, auth: { getUser } }, resolveTenantId }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { bankingService } from './bankingService';

/** Thenable bank_accounts builder: select/eq/is are chainable; awaiting yields {data}. */
function makeAccountsQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

/** bank_transactions head-count builder: select/eq/is are chainable; awaiting yields {count}. */
function makeCountQuery(count: number) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    then: (resolve: (v: { count: number; error: null }) => void) =>
      resolve({ count, error: null }),
  };
  return builder;
}

beforeEach(() => from.mockReset());

describe('getAccountBalanceSummary (cross-document balances must be base currency)', () => {
  it('sums current_balance_base across mixed-currency accounts, never the raw native balance', async () => {
    // 100 @ rate→38 base, plus 50 @ base 50 ⇒ base total 88. Raw native sum would be 150.
    const accountsQuery = makeAccountsQuery([
      { account_type: 'bank', current_balance: 100, current_balance_base: 38, currency: 'OMR' },
      { account_type: 'checking', current_balance: 50, current_balance_base: 50, currency: 'EUR' },
    ]);
    const countQuery = makeCountQuery(0);
    from.mockImplementation((table: string) =>
      table === 'bank_accounts' ? accountsQuery : countQuery,
    );

    const summary = await bankingService.getAccountBalanceSummary();

    expect(summary.totalBankBalance).toBe(88);
    // the fix is real only if the base shadow is actually selected
    expect(accountsQuery.select).toHaveBeenCalledWith(expect.stringContaining('current_balance_base'));
  });

  it('falls back to the raw balance for pre-base transition rows (no current_balance_base)', async () => {
    const accountsQuery = makeAccountsQuery([
      { account_type: 'cash', current_balance: 70, currency: null },
    ]);
    const countQuery = makeCountQuery(0);
    from.mockImplementation((table: string) =>
      table === 'bank_accounts' ? accountsQuery : countQuery,
    );

    const summary = await bankingService.getAccountBalanceSummary();

    expect(summary.totalCashBalance).toBe(70);
  });

  it('excludes soft-deleted rows from the pending-reconciliation count', async () => {
    // Soft-deleted unreconciled rows keep is_reconciled=false; without a
    // deleted_at filter they inflate pendingReconciliations and it never hits 0.
    const accountsQuery = makeAccountsQuery([
      { account_type: 'bank', current_balance: 0, current_balance_base: 0, currency: 'OMR' },
    ]);
    const countQuery = makeCountQuery(4);
    from.mockImplementation((table: string) =>
      table === 'bank_accounts' ? accountsQuery : countQuery,
    );

    const summary = await bankingService.getAccountBalanceSummary();

    expect(summary.pendingReconciliations).toBe(4);
    // the count must be scoped to live (non-soft-deleted) transactions
    expect(countQuery.is).toHaveBeenCalledWith('deleted_at', null);
  });
});

describe('createTransfer — cross-currency guard (Phase 0)', () => {
  const accountRead = (row: Record<string, unknown> | null) => {
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    return b;
  };

  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    resolveTenantId.mockResolvedValue('t-1');
    rpc.mockReset();
  });

  it('throws before dispatching the RPC when the two accounts have different currencies', async () => {
    from
      .mockReturnValueOnce(accountRead({ current_balance: 1000, currency: 'OMR' })) // source
      .mockReturnValueOnce(accountRead({ currency: 'USD' }));                       // destination
    // execute_account_transfer must NOT run — the friendlier client guard fires first.

    await expect(
      bankingService.createTransfer({ amount: 500, from_account_id: 'a', to_account_id: 'b' }),
    ).rejects.toThrow(/Cross-currency transfers are not supported/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still allows same-currency transfers via the atomic RPC', async () => {
    from
      .mockReturnValueOnce(accountRead({ current_balance: 1000, currency: 'OMR' }))
      .mockReturnValueOnce(accountRead({ currency: 'OMR' }));
    rpc.mockResolvedValue({
      data: { id: 't1', status: 'completed', from_account_id: 'a', to_account_id: 'b', amount: 500 },
      error: null,
    });

    const result = await bankingService.createTransfer({ amount: 500, from_account_id: 'a', to_account_id: 'b' });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('execute_account_transfer', {
      p_from: 'a',
      p_to: 'b',
      p_amount: 500,
      p_transfer_date: null,
      p_reference: null,
      p_notes: null,
      p_status: 'completed',
    });
    expect(result).toMatchObject({ id: 't1' });
  });
});

describe('createTransfer — atomic balance move via RPC (BUG-40 regression)', () => {
  const accountRead = (row: Record<string, unknown>) => {
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    return b;
  };

  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    resolveTenantId.mockResolvedValue('t-1');
    rpc.mockReset();
  });

  it('delegates a completed transfer to execute_account_transfer instead of non-atomic client-side balance moves', async () => {
    from
      .mockReturnValueOnce(accountRead({ current_balance: 1000, currency: 'OMR' })) // source
      .mockReturnValueOnce(accountRead({ currency: 'OMR' }));                       // destination
    rpc.mockResolvedValue({
      data: { id: 't1', status: 'completed', from_account_id: 'a', to_account_id: 'b', amount: 500 },
      error: null,
    });

    // The old read-modify-write + compensation is gone; the service must not touch
    // updateAccountBalance itself — both legs move atomically inside the RPC's txn.
    const balanceSpy = vi.spyOn(bankingService, 'updateAccountBalance');

    const result = await bankingService.createTransfer({ amount: 500, from_account_id: 'a', to_account_id: 'b' });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('execute_account_transfer', {
      p_from: 'a',
      p_to: 'b',
      p_amount: 500,
      p_transfer_date: null,
      p_reference: null,
      p_notes: null,
      p_status: 'completed',
    });
    expect(balanceSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 't1' });

    balanceSpy.mockRestore();
  });

  it('throws (nothing applied) when the atomic RPC rejects, so a partial failure cannot understate cash', async () => {
    from
      .mockReturnValueOnce(accountRead({ current_balance: 1000, currency: 'OMR' }))
      .mockReturnValueOnce(accountRead({ currency: 'OMR' }));
    rpc.mockResolvedValue({ data: null, error: { message: 'insufficient balance' } });

    const balanceSpy = vi.spyOn(bankingService, 'updateAccountBalance');

    await expect(
      bankingService.createTransfer({ amount: 500, from_account_id: 'a', to_account_id: 'b' }),
    ).rejects.toBeTruthy();
    // no client-side balance mutation happened — the whole move is the DB txn's job
    expect(balanceSpy).not.toHaveBeenCalled();

    balanceSpy.mockRestore();
  });
});

describe('completeTransfer / updateAccountBalance — atomic single-transaction RPCs (BUG-40)', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    resolveTenantId.mockResolvedValue('t-1');
    rpc.mockReset();
  });

  it('completeTransfer delegates to complete_account_transfer (locks, validates, moves balances, sets completed)', async () => {
    rpc.mockResolvedValue({
      data: { id: 't9', status: 'completed', from_account_id: 'a', to_account_id: 'b', amount: 250 },
      error: null,
    });

    const result = await bankingService.completeTransfer('t9');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('complete_account_transfer', { p_transfer_id: 't9' });
    expect(result).toMatchObject({ id: 't9', status: 'completed' });
  });

  it('updateAccountBalance delegates to the atomic adjust_account_balance increment', async () => {
    rpc.mockResolvedValue({ data: { id: 'acc-1', current_balance: 900 }, error: null });

    await bankingService.updateAccountBalance('acc-1', 100, 'debit');

    expect(rpc).toHaveBeenCalledWith('adjust_account_balance', {
      p_account_id: 'acc-1',
      p_amount: 100,
      p_direction: 'debit',
    });
  });

  it('updateAccountBalance throws when the RPC returns an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'account not found' } });

    await expect(
      bankingService.updateAccountBalance('missing', 50, 'credit'),
    ).rejects.toBeTruthy();
  });
});

describe('allocateReceiptToInvoice — canonical status vocabulary + fail-loud (WP-C)', () => {
  function makeAllocationHarness(invoice: Record<string, unknown>, updateError: { message: string } | null) {
    const updateEq = vi.fn(() => ({
      then: (resolve: (v: { error: { message: string } | null }) => void) =>
        resolve({ error: updateError }),
    }));
    const update = vi.fn(() => ({ eq: updateEq }));
    const insert = vi.fn(() => ({
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    }));
    const maybeSingle = vi.fn(() => Promise.resolve({ data: invoice, error: null }));
    const selectEq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq: selectEq }));
    from.mockImplementation((table: string) => {
      if (table === 'receipt_allocations') return { insert };
      return { select, update };
    });
    return { update };
  }

  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    resolveTenantId.mockResolvedValue('tenant-1');
  });

  it("writes the canonical 'partial' status (never the CHECK-rejected 'partially-paid')", async () => {
    const { update } = makeAllocationHarness({ amount_paid: 0, balance_due: 100, status: 'sent' }, null);

    await bankingService.allocateReceiptToInvoice('rcpt-1', 'inv-1', 40);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ amount_paid: 40, balance_due: 60, status: 'partial' }),
    );
  });

  it('throws when the invoice update fails instead of silently swallowing it', async () => {
    makeAllocationHarness(
      { amount_paid: 0, balance_due: 100, status: 'sent' },
      { message: 'violates check constraint' },
    );

    await expect(
      bankingService.allocateReceiptToInvoice('rcpt-1', 'inv-1', 40),
    ).rejects.toBeTruthy();
  });
});
