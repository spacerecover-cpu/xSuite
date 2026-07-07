import { describe, it, expect, vi, beforeEach } from 'vitest';

// The module transitively imports ./supabaseClient which throws on missing env at
// load — mock it, exposing `from` for the generateProfitLossReport query (same
// thenable-builder pattern as paymentsService.test.ts).
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));

import {
  sumBankBalanceBase,
  closingBalanceIsIndicative,
  paidRevenueNetOfTax,
  generateProfitLossReport,
} from './financialReportsService';

/** Thenable query builder: chainable filters; awaiting it yields {data}. */
function makeQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    is: vi.fn(() => builder),
    in: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

beforeEach(() => from.mockReset());

describe('sumBankBalanceBase (D8)', () => {
  it('sums the base-converted balance, never raw cross-currency amounts', () => {
    expect(sumBankBalanceBase([
      { current_balance: 100, current_balance_base: 38 },
      { current_balance: 50, current_balance_base: 50 },
    ], 'current_balance')).toBe(88);
  });
  it('falls back to the raw balance when no base is present (pre-migration unity rows)', () => {
    expect(sumBankBalanceBase([{ current_balance: 50 }], 'current_balance')).toBe(50);
  });
});

describe('closingBalanceIsIndicative (D8 — multi-currency closing balance label)', () => {
  it('is true when any bank row currency differs from base', () => {
    expect(closingBalanceIsIndicative([{ currency: 'OMR' }, { currency: 'EUR' }], 'OMR')).toBe(true);
  });
  it('is false when all rows are base currency or currency is absent', () => {
    expect(closingBalanceIsIndicative([{ currency: 'OMR' }, { currency: null }], 'OMR')).toBe(false);
    expect(closingBalanceIsIndicative([{}], 'OMR')).toBe(false);
  });
});

describe('paidRevenueNetOfTax (P&L revenue excludes output tax — a liability, not income)', () => {
  it('passes a tax-free payment through unchanged', () => {
    expect(paidRevenueNetOfTax({ amount_paid: 100, total_amount: 100, tax_amount: 0 })).toBe(100);
  });
  it('nets output tax off a fully-paid VAT invoice (subtotal 100 + 5 VAT = 105 → 100 revenue)', () => {
    expect(paidRevenueNetOfTax({ amount_paid: 105, total_amount: 105, tax_amount: 5 })).toBe(100);
  });
  it('nets only the paid portion of tax on a partial payment (half of 105 → 50)', () => {
    expect(paidRevenueNetOfTax({ amount_paid: 52.5, total_amount: 105, tax_amount: 5 })).toBe(50);
  });
  it('guards against a zero total (no divide-by-zero)', () => {
    expect(paidRevenueNetOfTax({ amount_paid: 10, total_amount: 0, tax_amount: 0 })).toBe(10);
  });
  it('nets in base currency when base shadows are present (base 40/40/8 → 32, not native 80)', () => {
    expect(paidRevenueNetOfTax({
      amount_paid: 100, amount_paid_base: 40,
      total_amount: 100, total_amount_base: 40,
      tax_amount: 20, tax_amount_base: 8,
    })).toBe(32);
  });
});

describe('generateProfitLossReport', () => {
  it('reports revenue net of output tax and excludes soft-deleted invoices', async () => {
    const invoices = makeQuery([
      { amount_paid: 105, total_amount: 105, tax_amount: 5, status: 'paid' },
    ]);
    const expenses = makeQuery([]);
    from.mockImplementation((table: string) => (table === 'invoices' ? invoices : expenses));

    const report = await generateProfitLossReport('2026-01-01', '2026-12-31');

    // 105 collected, 5 of it is output VAT owed to the authority → 100 revenue
    expect(report.revenue.total).toBe(100);
    expect(report.grossProfit).toBe(100);
    // real only if soft-deleted invoices are excluded at the query...
    expect(invoices.is).toHaveBeenCalledWith('deleted_at', null);
    // ...and the tax/total basis needed to net is actually selected
    expect(invoices.select).toHaveBeenCalledWith(expect.stringContaining('tax_amount'));
  });
});
