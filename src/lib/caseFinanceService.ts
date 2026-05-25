import { supabase } from './supabaseClient';

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
      .select('id, total_amount, status')
      .eq('case_id', caseId),
    supabase
      .from('invoices')
      .select('id, total_amount, amount_paid, status')
      .eq('case_id', caseId),
    supabase
      .from('expenses')
      .select('id, amount, status')
      .eq('case_id', caseId)
      .in('status', ['approved', 'paid']),
  ]);

  const quotes = quotesResult.data || [];
  const invoices = invoicesResult.data || [];
  const expenses = expensesResult.data || [];

  const totalQuoted = quotes
    .filter(q => q.status !== 'rejected')
    .reduce((sum, q) => sum + (q.total_amount || 0), 0);

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const outstandingBalance = totalInvoiced - totalPaid;
  const netRevenue = totalPaid - totalExpenses;
  const profitMargin = totalPaid > 0 ? (netRevenue / totalPaid) * 100 : 0;

  return {
    caseId,
    totalQuoted,
    totalInvoiced,
    totalPaid,
    totalExpenses,
    outstandingBalance,
    profitMargin,
    quotesCount: quotes.length,
    invoicesCount: invoices.length,
    paymentsCount: invoices.filter(inv => (inv.amount_paid || 0) > 0).length,
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
    .order('expense_date', { ascending: false });

  if (error) throw error;
  return (data || []) as CaseExpense[];
}

export async function getCasePayments(caseId: string): Promise<CasePayment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(`
      id,
      payment_number,
      payment_date,
      amount,
      payment_method:master_payment_methods(name),
      invoice:invoices!inner(invoice_number, case_id),
      customer:customers_enhanced(customer_name)
    `)
    .eq('invoices.case_id', caseId)
    .order('payment_date', { ascending: false });

  if (error) {
    return [];
  }

  return (data || []) as CasePayment[];
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
