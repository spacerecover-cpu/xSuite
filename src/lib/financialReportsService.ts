import { supabase } from './supabaseClient';
import { baseAmount, isReceivableInvoice, RECEIVABLE_INVOICE_EXCLUDED_STATUSES } from './financialMath';
import { getBaseCurrency } from './currencyService';

/** D8 — sum bank balances in base currency. A balance is a live position, so the
 *  *_base column is an "indicative base" snapshot, not a frozen committed value.
 *  Falls back to the raw balance for rows that predate the base columns. */
export function sumBankBalanceBase(
  rows: Array<Record<string, unknown>>, field: 'current_balance' | 'opening_balance',
): number {
  return (rows || []).reduce((sum, a) => {
    const v = a[`${field}_base`] ?? a[field];
    return sum + (typeof v === 'number' ? v : 0);
  }, 0);
}

/** D8 — a bank closing balance summed across currencies is an INDICATIVE base
 *  figure (live positions converted at the snapshot rate), not a committed value.
 *  True when any account holds a non-base currency, so the UI can label it. */
export function closingBalanceIsIndicative(
  rows: Array<{ currency?: string | null }>, baseCurrency: string,
): boolean {
  return (rows || []).some((r) => !!r.currency && r.currency !== baseCurrency);
}

export interface ProfitLossData {
  revenue: {
    total: number;
    byCategory: Array<{ category: string; amount: number }>;
  };
  expenses: {
    total: number;
    byCategory: Array<{ category: string; amount: number }>;
  };
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
}

export interface AgedReceivablesData {
  current: Array<{ customer: string; amount: number; invoices: number }>;
  thirtyDays: Array<{ customer: string; amount: number; invoices: number }>;
  sixtyDays: Array<{ customer: string; amount: number; invoices: number }>;
  ninetyDays: Array<{ customer: string; amount: number; invoices: number }>;
  overNinetyDays: Array<{ customer: string; amount: number; invoices: number }>;
  totals: {
    current: number;
    thirtyDays: number;
    sixtyDays: number;
    ninetyDays: number;
    overNinetyDays: number;
    total: number;
  };
}

export interface CashFlowData {
  operatingActivities: {
    receipts: number;
    payments: number;
    net: number;
  };
  investingActivities: {
    inflows: number;
    outflows: number;
    net: number;
  };
  netCashFlow: number;
  openingBalance: number;
  closingBalance: number;
  /** D8 — closing balance is an indicative base rollup when any bank account
   *  holds a non-base currency (summed at the snapshot rate, not committed). */
  closingBalanceIsIndicative?: boolean;
}

export interface InvoiceSummaryData {
  byStatus: Array<{ status: string; count: number; amount: number }>;
  byType: Array<{ type: string; count: number; amount: number }>;
  totals: {
    invoiced: number;
    paid: number;
    outstanding: number;
    overdue: number;
  };
  conversionRate: number;
}

/** Revenue on the P&L must EXCLUDE output tax — collected VAT/GST is a liability
 *  owed to the tax authority, never income. Nets the PAID portion of tax off a
 *  (possibly partial) payment via the invoice's tax/total ratio, in base currency.
 *  Tax-free rows (no tax, or no total basis) pass through as gross == net. */
export function paidRevenueNetOfTax(inv: Record<string, unknown>): number {
  const paid = baseAmount(inv, 'amount_paid');
  const total = baseAmount(inv, 'total_amount');
  const tax = baseAmount(inv, 'tax_amount');
  if (total <= 0 || tax <= 0) return paid;
  return paid * ((total - tax) / total);
}

export const generateProfitLossReport = async (
  dateFrom: string,
  dateTo: string
): Promise<ProfitLossData> => {
  const [invoicesResult, expensesResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('amount_paid, amount_paid_base, total_amount, total_amount_base, tax_amount, tax_amount_base, status')
      // A void/cancelled invoice is not realized revenue even if a stale amount_paid
      // survives (it is never zeroed on status change) — exclude it as the Revenue-by-Case
      // report does (EXP-014), so P&L and revenue-by-case reconcile for the same period.
      .not('status', 'in', `(${RECEIVABLE_INVOICE_EXCLUDED_STATUSES.map((s) => `"${s}"`).join(',')})`)
      .is('deleted_at', null)
      .gte('invoice_date', dateFrom)
      .lte('invoice_date', dateTo),
    supabase
      .from('expenses')
      .select(`
        amount,
        amount_base,
        status,
        category:master_expense_categories(name)
      `)
      .is('deleted_at', null)
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo)
      .in('status', ['approved', 'paid']),
  ]);

  // Supabase resolves a failed query as {data:null, error}; without these checks a
  // silently-failed expenses fetch would read as 0 expenses and report revenue as pure
  // profit. Throw as generateAgedReceivablesReport does.
  if (invoicesResult.error) throw invoicesResult.error;
  if (expensesResult.error) throw expensesResult.error;

  const invoices = invoicesResult.data || [];
  const expenses = expensesResult.data || [];

  const totalRevenue = invoices.reduce((sum, inv) => sum + paidRevenueNetOfTax(inv), 0);

  const expensesByCategory: Record<string, number> = {};
  expenses.forEach((exp: any) => {
    const categoryName = exp.category?.name || 'Uncategorized';
    expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + baseAmount(exp, 'amount');
  });

  const totalExpenses = expenses.reduce((sum, exp) => sum + baseAmount(exp, 'amount'), 0);
  const grossProfit = totalRevenue - totalExpenses;
  const netProfit = grossProfit;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    revenue: {
      total: totalRevenue,
      byCategory: [{ category: 'Services', amount: totalRevenue }],
    },
    expenses: {
      total: totalExpenses,
      byCategory: Object.entries(expensesByCategory).map(([category, amount]) => ({
        category,
        amount,
      })),
    },
    grossProfit,
    netProfit,
    profitMargin,
  };
};

export const generateAgedReceivablesReport = async (): Promise<AgedReceivablesData> => {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_date,
      due_date,
      balance_due,
      balance_due_base,
      customer:customers_enhanced(id, customer_name)
    `)
    // Only real tax invoices are accounts-receivable — a proforma is a pre-bill that
    // owes nothing yet (isReceivableInvoice / EXP-014). Without this a sent proforma
    // (balance_due = total_amount, payments blocked) would be aged and counted as owed.
    .eq('invoice_type', 'tax_invoice')
    .gt('balance_due', 0)
    .is('deleted_at', null)
    .in('status', ['sent', 'partial', 'overdue']);

  if (error) throw error;

  const buckets: Record<string, Array<{ customer: string; amount: number; invoices: number }>> = {
    current: [],
    thirtyDays: [],
    sixtyDays: [],
    ninetyDays: [],
    overNinetyDays: [],
  };

  const customerTotals: Record<string, Record<string, { amount: number; invoices: number }>> = {};

  (invoices || []).forEach((inv: any) => {
    const dueDate = new Date(inv.due_date || inv.invoice_date);
    const daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const customerName = inv.customer?.customer_name || 'Unknown';

    let bucket: string;
    if (daysPastDue <= 0) {
      bucket = 'current';
    } else if (daysPastDue <= 30) {
      bucket = 'thirtyDays';
    } else if (daysPastDue <= 60) {
      bucket = 'sixtyDays';
    } else if (daysPastDue <= 90) {
      bucket = 'ninetyDays';
    } else {
      bucket = 'overNinetyDays';
    }

    if (!customerTotals[customerName]) {
      customerTotals[customerName] = {};
    }
    if (!customerTotals[customerName][bucket]) {
      customerTotals[customerName][bucket] = { amount: 0, invoices: 0 };
    }
    customerTotals[customerName][bucket].amount += baseAmount(inv, 'balance_due');
    customerTotals[customerName][bucket].invoices += 1;
  });

  Object.entries(customerTotals).forEach(([customer, bucketData]) => {
    Object.entries(bucketData).forEach(([bucket, data]) => {
      buckets[bucket].push({ customer, ...data });
    });
  });

  Object.keys(buckets).forEach(bucket => {
    buckets[bucket].sort((a, b) => b.amount - a.amount);
  });

  const totals = {
    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- amount is already base (accumulated via baseAmount above)
    current: buckets.current.reduce((sum, c) => sum + c.amount, 0),
    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- amount is already base (accumulated via baseAmount above)
    thirtyDays: buckets.thirtyDays.reduce((sum, c) => sum + c.amount, 0),
    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- amount is already base (accumulated via baseAmount above)
    sixtyDays: buckets.sixtyDays.reduce((sum, c) => sum + c.amount, 0),
    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- amount is already base (accumulated via baseAmount above)
    ninetyDays: buckets.ninetyDays.reduce((sum, c) => sum + c.amount, 0),
    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- amount is already base (accumulated via baseAmount above)
    overNinetyDays: buckets.overNinetyDays.reduce((sum, c) => sum + c.amount, 0),
    total: 0,
  };
  totals.total = totals.current + totals.thirtyDays + totals.sixtyDays + totals.ninetyDays + totals.overNinetyDays;

  return {
    ...buckets,
    totals,
  } as AgedReceivablesData;
};

export const generateCashFlowReport = async (
  dateFrom: string,
  dateTo: string
): Promise<CashFlowData> => {
  const [paymentsResult, expensesResult, bankAccountsResult] = await Promise.all([
    supabase
      .from('payments')
      .select('amount, amount_base, status')
      .is('deleted_at', null)
      .gte('payment_date', dateFrom)
      .lte('payment_date', dateTo)
      .eq('status', 'completed'),
    supabase
      .from('expenses')
      .select('amount, amount_base, status')
      .is('deleted_at', null)
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo)
      .in('status', ['approved', 'paid']),
    supabase
      .from('bank_accounts')
      .select('current_balance, current_balance_base, opening_balance, opening_balance_base, currency')
      .eq('is_active', true),
  ]);

  if (paymentsResult.error) throw paymentsResult.error;
  if (expensesResult.error) throw expensesResult.error;
  if (bankAccountsResult.error) throw bankAccountsResult.error;

  const receipts = (paymentsResult.data || []).reduce((sum, p) => sum + baseAmount(p, 'amount'), 0);
  const payments = (expensesResult.data || []).reduce((sum, e) => sum + baseAmount(e, 'amount'), 0);

  const bankRows = bankAccountsResult.data || [];
  const totalCurrentBalance = sumBankBalanceBase(bankRows, 'current_balance');
  const totalOpeningBalance = sumBankBalanceBase(bankRows, 'opening_balance');
  const baseCurrency = await getBaseCurrency();

  return {
    operatingActivities: {
      receipts,
      payments,
      net: receipts - payments,
    },
    investingActivities: {
      inflows: 0,
      outflows: 0,
      net: 0,
    },
    netCashFlow: receipts - payments,
    openingBalance: totalOpeningBalance,
    closingBalance: totalCurrentBalance,
    closingBalanceIsIndicative: closingBalanceIsIndicative(bankRows, baseCurrency),
  };
};

export const generateInvoiceSummaryReport = async (
  dateFrom: string,
  dateTo: string
): Promise<InvoiceSummaryData> => {
  const [invoicesResult, quotesResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('status, invoice_type, total_amount, total_amount_base, amount_paid, amount_paid_base, balance_due, balance_due_base')
      .is('deleted_at', null)
      .gte('invoice_date', dateFrom)
      .lte('invoice_date', dateTo),
    supabase
      .from('quotes')
      .select('status')
      .is('deleted_at', null)
      .gte('quote_date', dateFrom)
      .lte('quote_date', dateTo),
  ]);

  if (invoicesResult.error) throw invoicesResult.error;
  if (quotesResult.error) throw quotesResult.error;

  const invoices = invoicesResult.data || [];
  const quotes = quotesResult.data || [];

  const byStatus: Record<string, { count: number; amount: number }> = {};
  const byType: Record<string, { count: number; amount: number }> = {};

  invoices.forEach(inv => {
    const status = inv.status ?? 'unknown';
    if (!byStatus[status]) {
      byStatus[status] = { count: 0, amount: 0 };
    }
    byStatus[status].count += 1;
    byStatus[status].amount += baseAmount(inv, 'total_amount');

    const type = inv.invoice_type === 'proforma' ? 'Proforma' : 'Tax Invoice';
    if (!byType[type]) {
      byType[type] = { count: 0, amount: 0 };
    }
    byType[type].count += 1;
    byType[type].amount += baseAmount(inv, 'total_amount');
  });

  // Money totals count only real accounts-receivable tax invoices: a proforma owes
  // nothing yet, and a converted proforma and the tax invoice it became are the SAME
  // bill — summing both double-counts (isReceivableInvoice / EXP-014). The byStatus /
  // byType breakdowns above intentionally stay over ALL invoice types.
  const receivables = invoices.filter(isReceivableInvoice);
  const totalInvoiced = receivables.reduce((sum, inv) => sum + baseAmount(inv, 'total_amount'), 0);
  const totalPaid = receivables.reduce((sum, inv) => sum + baseAmount(inv, 'amount_paid'), 0);
  const totalOutstanding = receivables.reduce((sum, inv) => sum + baseAmount(inv, 'balance_due'), 0);
  const totalOverdue = receivables
    .filter(inv => inv.status === 'overdue')
    .reduce((sum, inv) => sum + baseAmount(inv, 'balance_due'), 0);

  const convertedQuotes = quotes.filter(q => q.status === 'converted').length;
  const conversionRate = quotes.length > 0 ? (convertedQuotes / quotes.length) * 100 : 0;

  return {
    byStatus: Object.entries(byStatus).map(([status, data]) => ({
      status,
      ...data,
    })),
    byType: Object.entries(byType).map(([type, data]) => ({
      type,
      ...data,
    })),
    totals: {
      invoiced: totalInvoiced,
      paid: totalPaid,
      outstanding: totalOutstanding,
      overdue: totalOverdue,
    },
    conversionRate,
  };
};

export const generateRevenueByCustomerReport = async (
  dateFrom: string,
  dateTo: string
) => {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      amount_paid,
      amount_paid_base,
      customer:customers_enhanced(id, customer_name, email)
    `)
    // Exclude void/cancelled — a stale amount_paid on a voided invoice is not realized
    // revenue (EXP-014), matching generateRevenueByCaseReport so the surfaces reconcile.
    .not('status', 'in', `(${RECEIVABLE_INVOICE_EXCLUDED_STATUSES.map((s) => `"${s}"`).join(',')})`)
    .is('deleted_at', null)
    .gte('invoice_date', dateFrom)
    .lte('invoice_date', dateTo);

  if (error) throw error;

  const customerRevenue: Record<string, { name: string; email: string; amount: number; count: number }> = {};

  (data || []).forEach((inv: any) => {
    const customerId = inv.customer?.id || 'unknown';
    const customerName = inv.customer?.customer_name || 'Unknown';
    const email = inv.customer?.email || '';

    if (!customerRevenue[customerId]) {
      customerRevenue[customerId] = { name: customerName, email, amount: 0, count: 0 };
    }
    customerRevenue[customerId].amount += baseAmount(inv, 'amount_paid');
    customerRevenue[customerId].count += 1;
  });

  return Object.entries(customerRevenue)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.amount - a.amount);
};

export const generateRevenueByCaseReport = async (
  dateFrom: string,
  dateTo: string
) => {
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select(`
      amount_paid,
      amount_paid_base,
      case_id,
      cases(id, case_no, title)
    `)
    // Match the case-detail Financial Summary's receivable filter (EXP-014): only
    // tax invoices, exclude void/cancelled and soft-deleted — so the two case-profit
    // surfaces agree and a converted proforma isn't double-counted with its tax invoice.
    .eq('invoice_type', 'tax_invoice')
    .is('deleted_at', null)
    .not('status', 'in', `(${RECEIVABLE_INVOICE_EXCLUDED_STATUSES.map((s) => `"${s}"`).join(',')})`)
    .gte('invoice_date', dateFrom)
    .lte('invoice_date', dateTo);

  if (invError) throw invError;

  const { data: expenses, error: expError } = await supabase
    .from('expenses')
    .select(`
      amount,
      amount_base,
      case_id,
      cases(id, case_no, title)
    `)
    .is('deleted_at', null)
    .gte('expense_date', dateFrom)
    .lte('expense_date', dateTo)
    .not('case_id', 'is', null)
    .in('status', ['approved', 'paid']);

  if (expError) throw expError;

  const caseFinancials: Record<string, {
    caseNo: string;
    title: string;
    revenue: number;
    expenses: number;
    profit: number;
  }> = {};

  (invoices || []).forEach((inv: any) => {
    if (!inv.case_id) return;
    if (!caseFinancials[inv.case_id]) {
      caseFinancials[inv.case_id] = {
        caseNo: inv.cases?.case_no || '',
        title: inv.cases?.title || '',
        revenue: 0,
        expenses: 0,
        profit: 0,
      };
    }
    caseFinancials[inv.case_id].revenue += baseAmount(inv, 'amount_paid');
  });

  (expenses || []).forEach((exp: any) => {
    if (!exp.case_id) return;
    if (!caseFinancials[exp.case_id]) {
      caseFinancials[exp.case_id] = {
        caseNo: exp.cases?.case_no || '',
        title: exp.cases?.title || '',
        revenue: 0,
        expenses: 0,
        profit: 0,
      };
    }
    caseFinancials[exp.case_id].expenses += baseAmount(exp, 'amount');
  });

  Object.values(caseFinancials).forEach(c => {
    c.profit = c.revenue - c.expenses;
  });

  return Object.entries(caseFinancials)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.revenue - a.revenue);
};

// ============================================================
// Aged Payables — unpaid expenses bucketed by days since expense_date.
// Mirrors aged-receivables: same buckets and totals shape so the UI
// table can share rendering. Status filter excludes paid/cancelled/
// rejected — anything else still owes money.
// ============================================================
export interface AgedPayablesData {
  current: Array<{ vendor: string; amount: number; expenses: number }>;
  thirtyDays: Array<{ vendor: string; amount: number; expenses: number }>;
  sixtyDays: Array<{ vendor: string; amount: number; expenses: number }>;
  ninetyDays: Array<{ vendor: string; amount: number; expenses: number }>;
  overNinetyDays: Array<{ vendor: string; amount: number; expenses: number }>;
  totals: {
    current: number;
    thirtyDays: number;
    sixtyDays: number;
    ninetyDays: number;
    overNinetyDays: number;
    total: number;
  };
}

export const generateAgedPayablesReport = async (): Promise<AgedPayablesData> => {
  const today = new Date();

  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('id, expense_date, amount, amount_base, status, vendor')
    .is('deleted_at', null)
    .not('status', 'in', '("paid","cancelled","rejected")');

  if (error) throw error;

  const buckets: Record<string, Array<{ vendor: string; amount: number; expenses: number }>> = {
    current: [],
    thirtyDays: [],
    sixtyDays: [],
    ninetyDays: [],
    overNinetyDays: [],
  };

  const vendorTotals: Record<string, Record<string, { amount: number; expenses: number }>> = {};

  (expenses ?? []).forEach((exp) => {
    if (!exp.expense_date) return;
    const expDate = new Date(exp.expense_date);
    const daysOld = Math.floor((today.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24));
    const vendor = exp.vendor || 'Unknown vendor';

    let bucket: string;
    if (daysOld <= 30) bucket = 'current';
    else if (daysOld <= 60) bucket = 'thirtyDays';
    else if (daysOld <= 90) bucket = 'sixtyDays';
    else if (daysOld <= 120) bucket = 'ninetyDays';
    else bucket = 'overNinetyDays';

    if (!vendorTotals[vendor]) vendorTotals[vendor] = {};
    if (!vendorTotals[vendor][bucket]) vendorTotals[vendor][bucket] = { amount: 0, expenses: 0 };
    vendorTotals[vendor][bucket].amount += baseAmount(exp, 'amount');
    vendorTotals[vendor][bucket].expenses += 1;
  });

  Object.entries(vendorTotals).forEach(([vendor, bucketData]) => {
    Object.entries(bucketData).forEach(([bucket, data]) => {
      buckets[bucket].push({ vendor, ...data });
    });
  });

  Object.keys(buckets).forEach((bucket) => {
    buckets[bucket].sort((a, b) => b.amount - a.amount);
  });

  const totals = {
    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- amount is already base (accumulated via baseAmount above)
    current: buckets.current.reduce((sum, c) => sum + c.amount, 0),
    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- amount is already base (accumulated via baseAmount above)
    thirtyDays: buckets.thirtyDays.reduce((sum, c) => sum + c.amount, 0),
    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- amount is already base (accumulated via baseAmount above)
    sixtyDays: buckets.sixtyDays.reduce((sum, c) => sum + c.amount, 0),
    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- amount is already base (accumulated via baseAmount above)
    ninetyDays: buckets.ninetyDays.reduce((sum, c) => sum + c.amount, 0),
    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- amount is already base (accumulated via baseAmount above)
    overNinetyDays: buckets.overNinetyDays.reduce((sum, c) => sum + c.amount, 0),
    total: 0,
  };
  totals.total =
    totals.current + totals.thirtyDays + totals.sixtyDays + totals.ninetyDays + totals.overNinetyDays;

  return { ...buckets, totals } as AgedPayablesData;
};

// ============================================================
// Expense by Category — sum + count per expense category for a
// date range, plus an "Uncategorized" bucket for expenses without
// a category_id (these slip through if the UI defaults to optional).
// ============================================================
export interface ExpenseByCategoryData {
  rows: Array<{ category: string; amount: number; count: number; percentage: number }>;
  total: number;
  count: number;
}

export const generateExpenseByCategoryReport = async (
  dateFrom: string,
  dateTo: string,
): Promise<ExpenseByCategoryData> => {
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select(`
      id,
      amount,
      amount_base,
      category_id,
      master_expense_categories ( id, name )
    `)
    .is('deleted_at', null)
    .gte('expense_date', dateFrom)
    .lte('expense_date', dateTo)
    .not('status', 'in', '("cancelled","rejected")');

  if (error) throw error;

  const acc: Record<string, { amount: number; count: number }> = {};
  let total = 0;
  let count = 0;

  for (const exp of expenses ?? []) {
    const cat = (exp.master_expense_categories as { name?: string } | null)?.name
      ?? 'Uncategorized';
    if (!acc[cat]) acc[cat] = { amount: 0, count: 0 };
    acc[cat].amount += baseAmount(exp, 'amount');
    acc[cat].count += 1;
    total += baseAmount(exp, 'amount');
    count += 1;
  }

  const rows = Object.entries(acc)
    .map(([category, v]) => ({
      category,
      amount: v.amount,
      count: v.count,
      percentage: total > 0 ? (v.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { rows, total, count };
};

// ============================================================
// Invoice vs Expense — month-by-month side-by-side. Invoiced
// (revenue) uses paid invoices only so we measure realized cash
// in, not just billed. Expenses excludes cancelled/rejected.
// ============================================================
export interface InvoiceVsExpenseData {
  months: Array<{ month: string; revenue: number; expense: number; net: number }>;
  totals: { revenue: number; expense: number; net: number };
}

export const generateInvoiceVsExpenseReport = async (
  dateFrom: string,
  dateTo: string,
): Promise<InvoiceVsExpenseData> => {
  const [invoicesRes, expensesRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, amount_paid, amount_paid_base, invoice_date, paid_at, status')
      .is('deleted_at', null)
      .gte('invoice_date', dateFrom)
      .lte('invoice_date', dateTo),
    supabase
      .from('expenses')
      .select('id, amount, amount_base, expense_date, status')
      .is('deleted_at', null)
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo)
      .not('status', 'in', '("cancelled","rejected")'),
  ]);

  if (invoicesRes.error) throw invoicesRes.error;
  if (expensesRes.error) throw expensesRes.error;

  // Bucket by YYYY-MM. Use invoice_date / expense_date as the canonical
  // monthly assignment — payment dates would skew across periods.
  const byMonth: Record<string, { revenue: number; expense: number }> = {};

  for (const inv of invoicesRes.data ?? []) {
    if (!inv.invoice_date) continue;
    const key = inv.invoice_date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { revenue: 0, expense: 0 };
    byMonth[key].revenue += baseAmount(inv, 'amount_paid');
  }
  for (const exp of expensesRes.data ?? []) {
    if (!exp.expense_date) continue;
    const key = exp.expense_date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { revenue: 0, expense: 0 };
    byMonth[key].expense += baseAmount(exp, 'amount');
  }

  const months = Object.entries(byMonth)
    .map(([month, v]) => ({
      month,
      revenue: v.revenue,
      expense: v.expense,
      net: v.revenue - v.expense,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const totals = months.reduce(
    (acc, m) => {
      acc.revenue += m.revenue;
      acc.expense += m.expense;
      acc.net += m.net;
      return acc;
    },
    { revenue: 0, expense: 0, net: 0 },
  );

  return { months, totals };
};

export const exportReportToCSV = (
  data: any[],
  columns: { key: string; label: string }[],
  filename: string
) => {
  const header = columns.map(c => c.label).join(',');
  const rows = data.map(row =>
    columns.map(c => {
      const value = row[c.key];
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value ?? '';
    }).join(',')
  );

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();

  URL.revokeObjectURL(url);
};

export const financialReportsService = {
  generateProfitLossReport,
  generateAgedReceivablesReport,
  generateAgedPayablesReport,
  generateCashFlowReport,
  generateInvoiceSummaryReport,
  generateExpenseByCategoryReport,
  generateInvoiceVsExpenseReport,
  generateRevenueByCustomerReport,
  generateRevenueByCaseReport,
  exportReportToCSV,
};
