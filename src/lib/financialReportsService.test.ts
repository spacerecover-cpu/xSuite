import { describe, it, expect, vi, beforeEach } from 'vitest';

// The module transitively imports ./supabaseClient which throws on missing env at
// load — mock it, exposing `from` for the generateProfitLossReport query (same
// thenable-builder pattern as paymentsService.test.ts).
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));
// generateCashFlowReport awaits getBaseCurrency() (its own DB round-trip) — stub it
// so cash-flow tests stay focused on the report's own queries.
vi.mock('./currencyService', () => ({ getBaseCurrency: vi.fn(async () => 'OMR') }));

import {
  sumBankBalanceBase,
  closingBalanceIsIndicative,
  paidRevenueNetOfTax,
  generateProfitLossReport,
  generateInvoiceVsExpenseReport,
  generateCashFlowReport,
  generateInvoiceSummaryReport,
  generateRevenueByCustomerReport,
  generateAgedReceivablesReport,
} from './financialReportsService';

/** Thenable query builder: chainable filters; awaiting it yields {data}. */
function makeQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    is: vi.fn(() => builder),
    in: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    not: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

/** Thenable that resolves as a FAILED Supabase query: {data:null, error}. Supabase
 *  never rejects — a report that ignores `.error` treats this as an empty dataset. */
function makeErrorQuery(error: unknown) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    is: vi.fn(() => builder),
    in: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    not: vi.fn(() => builder),
    then: (resolve: (v: { data: null; error: unknown }) => void) =>
      resolve({ data: null, error }),
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

  it('throws when the expenses query fails instead of reporting revenue as pure profit (Bug 49)', async () => {
    // Invoices succeed, expenses fail. Without an .error check, totalExpenses reads 0
    // and the report claims grossProfit == full revenue with ~100% margin.
    const invoices = makeQuery([
      { amount_paid: 1000, total_amount: 1000, tax_amount: 0, status: 'paid' },
    ]);
    const expenses = makeErrorQuery({ message: 'expenses query failed' });
    from.mockImplementation((table: string) => (table === 'invoices' ? invoices : expenses));

    await expect(generateProfitLossReport('2026-01-01', '2026-12-31')).rejects.toBeTruthy();
  });

  it('excludes void/cancelled invoices from revenue at the query (Bug 50)', async () => {
    const invoices = makeQuery([
      { amount_paid: 500, total_amount: 500, tax_amount: 0, status: 'paid' },
    ]);
    const expenses = makeQuery([]);
    from.mockImplementation((table: string) => (table === 'invoices' ? invoices : expenses));

    const report = await generateProfitLossReport('2026-01-01', '2026-12-31');

    // A voided-but-still-paid tax invoice must not be counted as realized revenue,
    // so P&L reconciles with generateRevenueByCaseReport for the same period.
    expect(invoices.not).toHaveBeenCalledWith('status', 'in', '("void","cancelled")');
    expect(report.revenue.total).toBe(500);
  });
});

describe('generateInvoiceVsExpenseReport (Bug 13 — revenue is realized cash, not billed total)', () => {
  it('counts only the paid portion of an invoice, not the full billed total', async () => {
    // One $10,000 invoice, "sent" and entirely unpaid → realized revenue is 0,
    // not $10,000. A partially-paid invoice contributes only its paid portion.
    const invoices = makeQuery([
      { id: 'a', total_amount: 10000, amount_paid: 0, invoice_date: '2026-03-04', status: 'sent' },
      { id: 'b', total_amount: 10000, amount_paid: 3000, invoice_date: '2026-03-20', status: 'partial' },
    ]);
    const expenses = makeQuery([
      { id: 'e', amount: 1000, expense_date: '2026-03-10', status: 'approved' },
    ]);
    from.mockImplementation((table: string) => (table === 'invoices' ? invoices : expenses));

    const report = await generateInvoiceVsExpenseReport('2026-03-01', '2026-03-31');

    // Realized cash in = 0 + 3000, NOT the 20000 billed.
    expect(report.totals.revenue).toBe(3000);
    expect(report.totals.expense).toBe(1000);
    expect(report.totals.net).toBe(2000);
    // The paid-amount basis must actually be selected from the DB.
    expect(invoices.select).toHaveBeenCalledWith(expect.stringContaining('amount_paid'));
  });

  it('uses the base-currency shadow of the paid amount when present', async () => {
    const invoices = makeQuery([
      { id: 'a', amount_paid: 100, amount_paid_base: 40, invoice_date: '2026-04-05', status: 'paid' },
    ]);
    const expenses = makeQuery([]);
    from.mockImplementation((table: string) => (table === 'invoices' ? invoices : expenses));

    const report = await generateInvoiceVsExpenseReport('2026-04-01', '2026-04-30');

    // Base conversion: 40, never the native 100.
    expect(report.totals.revenue).toBe(40);
    expect(invoices.select).toHaveBeenCalledWith(expect.stringContaining('amount_paid_base'));
  });
});

describe('generateCashFlowReport (Bug 47 — soft-deleted payments are not cash receipts)', () => {
  it('excludes soft-deleted payments from operating receipts at the query', async () => {
    const payments = makeQuery([{ amount: 5000, status: 'completed' }]);
    const expenses = makeQuery([]);
    const bankAccounts = makeQuery([]);
    from.mockImplementation((table: string) =>
      table === 'payments' ? payments : table === 'expenses' ? expenses : bankAccounts);

    const report = await generateCashFlowReport('2026-01-01', '2026-12-31');

    // Only real if the payments query filters out soft-deleted rows.
    expect(payments.is).toHaveBeenCalledWith('deleted_at', null);
    expect(report.operatingActivities.receipts).toBe(5000);
    expect(report.netCashFlow).toBe(5000);
  });

  it('throws when a bank-accounts / expenses query fails rather than under-reporting cash (Bug 49)', async () => {
    const payments = makeQuery([{ amount: 5000, status: 'completed' }]);
    const expenses = makeErrorQuery({ message: 'expenses query failed' });
    const bankAccounts = makeQuery([]);
    from.mockImplementation((table: string) =>
      table === 'payments' ? payments : table === 'expenses' ? expenses : bankAccounts);

    await expect(generateCashFlowReport('2026-01-01', '2026-12-31')).rejects.toBeTruthy();
  });
});

describe('generateInvoiceSummaryReport (Bug 48 — soft-deleted invoices/quotes inflate totals)', () => {
  it('filters soft-deleted rows from both the invoices and quotes queries', async () => {
    const invoices = makeQuery([
      { status: 'paid', invoice_type: 'tax_invoice', total_amount: 2000, amount_paid: 2000, balance_due: 0 },
    ]);
    const quotes = makeQuery([{ status: 'converted' }]);
    from.mockImplementation((table: string) => (table === 'invoices' ? invoices : quotes));

    const report = await generateInvoiceSummaryReport('2026-01-01', '2026-12-31');

    expect(invoices.is).toHaveBeenCalledWith('deleted_at', null);
    expect(quotes.is).toHaveBeenCalledWith('deleted_at', null);
    expect(report.totals.invoiced).toBe(2000);
  });

  it('excludes proforma & converted rows from money totals but keeps them in the byType breakdown (Bug 10 — no AR double-count)', async () => {
    const invoices = makeQuery([
      // A standalone sent proforma owes nothing yet (balance_due = total, payments blocked).
      { status: 'sent', invoice_type: 'proforma', total_amount: 630, amount_paid: 0, balance_due: 630 },
      // A converted proforma keeps its balance_due — but is the SAME bill as the tax invoice.
      { status: 'converted', invoice_type: 'proforma', total_amount: 630, amount_paid: 0, balance_due: 630 },
      // ...the tax invoice it became is the real accounts-receivable.
      { status: 'sent', invoice_type: 'tax_invoice', total_amount: 630, amount_paid: 0, balance_due: 630 },
    ]);
    const quotes = makeQuery([]);
    from.mockImplementation((table: string) => (table === 'invoices' ? invoices : quotes));

    const report = await generateInvoiceSummaryReport('2026-01-01', '2026-12-31');

    // Only the single tax invoice is real AR — not 1,890 (3 × 630).
    expect(report.totals.invoiced).toBe(630);
    expect(report.totals.outstanding).toBe(630);
    // The byType breakdown still surfaces both proforma rows (informational).
    expect(report.byType.find(t => t.type === 'Proforma')?.count).toBe(2);
    expect(report.byType.find(t => t.type === 'Tax Invoice')?.count).toBe(1);
  });

  it('throws when the quotes query fails rather than silently reporting a 0% conversion rate (Bug 49)', async () => {
    const invoices = makeQuery([
      { status: 'paid', invoice_type: 'tax_invoice', total_amount: 2000, amount_paid: 2000, balance_due: 0 },
    ]);
    const quotes = makeErrorQuery({ message: 'quotes query failed' });
    from.mockImplementation((table: string) => (table === 'invoices' ? invoices : quotes));

    await expect(generateInvoiceSummaryReport('2026-01-01', '2026-12-31')).rejects.toBeTruthy();
  });
});

describe('generateAgedReceivablesReport (Bug 9 — proforma invoices are not accounts-receivable)', () => {
  it('ages only real tax invoices — the query filters invoice_type', async () => {
    const invoices = makeQuery([
      { id: 'i1', invoice_date: '2026-06-01', due_date: '2026-06-15', balance_due: 630,
        customer: { id: 'c1', customer_name: 'Acme' } },
    ]);
    from.mockImplementation(() => invoices);

    const report = await generateAgedReceivablesReport();

    // Without this filter a sent proforma reliably matches (status 'sent',
    // balance_due > 0) and is bucketed as money owed.
    expect(invoices.eq).toHaveBeenCalledWith('invoice_type', 'tax_invoice');
    expect(report.totals.total).toBe(630);
  });
});

describe('generateRevenueByCustomerReport (Bug 49 — soft-deleted invoices over-credit revenue)', () => {
  it('excludes soft-deleted invoices from per-customer revenue at the query', async () => {
    const invoices = makeQuery([
      { amount_paid: 3000, customer: { id: 'c1', customer_name: 'Acme', email: 'a@b.co' } },
    ]);
    from.mockImplementation(() => invoices);

    const rows = await generateRevenueByCustomerReport('2026-01-01', '2026-12-31');

    expect(invoices.is).toHaveBeenCalledWith('deleted_at', null);
    expect(rows[0].amount).toBe(3000);
  });

  it('excludes void/cancelled invoices from per-customer revenue at the query (Bug 50)', async () => {
    const invoices = makeQuery([
      { amount_paid: 3000, customer: { id: 'c1', customer_name: 'Acme', email: 'a@b.co' } },
    ]);
    from.mockImplementation(() => invoices);

    const rows = await generateRevenueByCustomerReport('2026-01-01', '2026-12-31');

    // A stale amount_paid on a voided invoice must not over-credit the customer.
    expect(invoices.not).toHaveBeenCalledWith('status', 'in', '("void","cancelled")');
    expect(rows[0].amount).toBe(3000);
  });
});
