import { describe, it, expect, vi, beforeEach } from 'vitest';

// getAccountBalanceSummary sums bank-account balances across documents; mock the
// supabase client (env-throwing on import) and feed mixed-currency accounts so the
// assertion proves base-currency summation, never the raw native balance.
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from }, resolveTenantId: vi.fn() }));
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

/** bank_transactions head-count builder: select/eq are chainable; awaiting yields {count}. */
function makeCountQuery(count: number) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
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
});
