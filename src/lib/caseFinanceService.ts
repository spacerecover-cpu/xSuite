import { supabase } from './supabaseClient';
import { baseAmount } from './financialMath';

export interface CaseFinancialSummary {
  caseId: string;
  totalQuoted: number;
  totalInvoiced: number;
  totalPaid: number;
  totalExpenses: number;
  outstandingBalance: number;
  profitMargin: number;
  quotesCount: number;
  invoicesCount: number;
  paymentsCount: number;
  expensesCount: number;
}

export interface CaseExpense {
  id: string;
  expense_number: string;
  expense_date: string;
  amount: number;
  description: string;
  vendor: string | null;
  status: string;
  category: { name: string } | null;
  submitter: { full_name: string } | null;
}

export interface CasePayment {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_method: { name: string } | null;
  invoice: { invoice_number: string } | null;
  customer: { customer_name: string } | null;
}

export async function getCaseFinancialSummary(caseId: string): Promise<CaseFinancialSummary> {
  const [quotesResult, invoicesResult, expensesResult] = await Promise.all([
    supabase
      .from('quotes')
      .select('id, total_amount, total_amount_base, status')
      .eq('case_id', caseId)
      .is('deleted_at', null),
    supabase
      .from('invoices')
      .select('id, invoice_type, total_amount, total_amount_base, amount_paid, amount_paid_base, status')
      .eq('case_id', caseId)
      .is('deleted_at', null),
    supabase
      .from('expenses')
      .select('id, amount, amount_base, is_billable, status')
      .eq('case_id', caseId)
      .is('deleted_at', null)
      .in('status', ['approved', 'paid']),
  ]);

  const quotes = quotesResult.data || [];
  const invoices = invoicesResult.data || [];
  const expenses = expensesResult.data || [];

  // Aggregate in base currency (a case can mix document currencies); baseAmount
  // falls back to the raw column for any transition row lacking a base snapshot.
  const totalQuoted = quotes
    .filter(q => q.status !== 'rejected')
    .reduce((sum, q) => sum + baseAmount(q, 'total_amount'), 0);

  // Only tax invoices are receivables. A converted proforma and the tax invoice
  // it became are the SAME bill — counting both doubled "Invoiced" (e.g. 630 →
  // 1,260). Void/cancelled invoices aren't owed either.
  const billableInvoices = invoices.filter(
    inv => inv.invoice_type === 'tax_invoice' && inv.status !== 'void' && inv.status !== 'cancelled',
  );

  const totalInvoiced = billableInvoices.reduce((sum, inv) => sum + baseAmount(inv, 'total_amount'), 0);
  const totalPaid = billableInvoices.reduce((sum, inv) => sum + baseAmount(inv, 'amount_paid'), 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + baseAmount(exp, 'amount'), 0);
  // Billable (rebillable) expenses are recovered from the customer via the invoice,
  // so they are margin-neutral pass-throughs. Net them out of BOTH the cost and the
  // revenue base, or margin is understated (EXP-014). netRevenue is unchanged (the
  // two cancel); only the margin base drops the recovered recharge — matching the
  // audit's worked example ($200 billable + $500 labor, paid $700 → 500/500 = 100%).
  const billableExpenses = expenses
    .filter((exp) => exp.is_billable)
    .reduce((sum, exp) => sum + baseAmount(exp, 'amount'), 0);
  const outstandingBalance = totalInvoiced - totalPaid;
  const netRevenue = totalPaid - totalExpenses;
  const ownRevenueBase = totalPaid - billableExpenses;
  const profitMargin = ownRevenueBase > 0 ? (netRevenue / ownRevenueBase) * 100 : 0;

  return {
    caseId,
    totalQuoted,
    totalInvoiced,
    totalPaid,
    totalExpenses,
    outstandingBalance,
    profitMargin,
    quotesCount: quotes.length,
    invoicesCount: billableInvoices.length,
    paymentsCount: billableInvoices.filter(inv => (inv.amount_paid || 0) > 0).length,
    expensesCount: expenses.length,
  };
}

export async function getCaseExpenses(caseId: string): Promise<CaseExpense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(`
      id,
      expense_number,
      expense_date,
      amount,
      description,
      vendor,
      status,
      category:master_expense_categories(name)
    `)
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false });

  if (error) throw error;
  return (data || []) as CaseExpense[];
}

export async function getCasePayments(caseId: string): Promise<CasePayment[]> {
  // Case→payment linkage lives in payment_allocations — the record-payment write path
  // does not populate payments.invoice_id/case_id, so resolving through payments directly
  // returns nothing. Resolve via allocations → invoices for this case instead. The amount
  // shown is the amount allocated to this case (correct when a payment spans cases/invoices).
  const { data, error } = await supabase
    .from('payment_allocations')
    .select(`
      id,
      amount,
      created_at,
      invoice:invoices!inner(invoice_number, case_id),
      payment:payments!inner(
        payment_number,
        payment_date,
        payment_method:master_payment_methods(name),
        customer:customers_enhanced(customer_name)
      )
    `)
    .eq('invoices.case_id', caseId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return [];
  }

  type AllocationRow = {
    id: string;
    amount: number | string | null;
    invoice: { invoice_number: string } | null;
    payment: {
      payment_number: string | null;
      payment_date: string | null;
      payment_method: { name: string } | null;
      customer: { customer_name: string } | null;
    } | null;
  };

  return ((data || []) as unknown as AllocationRow[]).map((row) => ({
    id: row.id,
    payment_number: row.payment?.payment_number ?? '',
    payment_date: row.payment?.payment_date ?? '',
    amount: Number(row.amount) || 0,
    payment_method: row.payment?.payment_method ?? null,
    invoice: row.invoice ? { invoice_number: row.invoice.invoice_number } : null,
    customer: row.payment?.customer ?? null,
  }));
}

export async function linkExpenseToCase(expenseId: string, caseId: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ case_id: caseId })
    .eq('id', expenseId);

  if (error) throw error;
}

export async function unlinkExpenseFromCase(expenseId: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ case_id: null })
    .eq('id', expenseId);

  if (error) throw error;
}
