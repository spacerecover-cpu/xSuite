import { supabase } from './supabaseClient';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { logger } from './logger';
import { baseAmount } from './financialMath';

export interface Transaction {
  id?: string;
  transaction_date: string;
  amount: number;
  transaction_type: 'income' | 'expense' | 'asset' | 'equity';
  description?: string;
  category_id?: string | null;
  bank_account_id?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  currency?: string | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface TransactionWithDetails extends Transaction {
  category?: {
    id: string;
    name: string;
  };
  bank_account?: {
    id: string;
    name: string;
    bank_name: string;
  };
}

const DEFAULT_PAGE_SIZE = 100;

export const fetchTransactions = async (filters?: {
  type?: string;
  status?: string;
  categoryId?: string;
  bankAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) => {
  let query = supabase
    .from('financial_transactions')
    .select(`
      *,
      category:master_transaction_categories(id, name),
      bank_account:bank_accounts(id, name, bank_name)
    `)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.type && filters.type !== 'all') {
    query = query.eq('transaction_type', filters.type);
  }

  if (filters?.categoryId) {
    query = query.eq('category_id', filters.categoryId);
  }

  if (filters?.bankAccountId) {
    query = query.eq('bank_account_id', filters.bankAccountId);
  }

  if (filters?.dateFrom) {
    query = query.gte('transaction_date', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('transaction_date', filters.dateTo);
  }

  if (filters?.search) {
    const s = sanitizeFilterValue(filters.search);
    query = query.or(`description.ilike.%${s}%`);
  }

  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const page = filters?.page || 0;
  query = query.range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data as TransactionWithDetails[];
};

export const fetchTransactionById = async (id: string) => {
  const { data, error } = await supabase
    .from('financial_transactions')
    .select(`
      *,
      category:master_transaction_categories(id, name),
      bank_account:bank_accounts(id, name, bank_name, account_number)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as TransactionWithDetails;
};

export const createTransaction = async (
  transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>
) => {
  if (transaction.bank_account_id && transaction.transaction_type === 'expense') {
    const { data: account } = await supabase
      .from('bank_accounts')
      .select('current_balance')
      .eq('id', transaction.bank_account_id)
      .maybeSingle();

    if (account && (account.current_balance || 0) < transaction.amount) {
      throw new Error(`Insufficient balance. Available: ${account.current_balance}, Required: ${transaction.amount}`);
    }
  }

  const { data, error } = await supabase
    .from('financial_transactions')
    .insert([transaction as never])
    .select()
    .maybeSingle();

  if (error) throw error;

  if (transaction.bank_account_id) {
    await updateBankAccountBalance(
      transaction.bank_account_id,
      transaction.amount,
      transaction.transaction_type === 'income' ? 'credit' : 'debit'
    );
  }

  return data;
};

export const updateTransaction = async (
  id: string,
  transaction: Partial<Transaction>
) => {
  const { data, error } = await supabase
    .from('financial_transactions')
    .update(transaction)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const deleteTransaction = async (id: string) => {
  const { error } = await supabase
    .from('financial_transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
};

export const reconcileTransaction = async (id: string) => {
  return fetchTransactionById(id);
};

export const bulkReconcileTransactions = async (ids: string[]) => {
  const results = await Promise.all(ids.map(id => fetchTransactionById(id)));
  return results;
};

export const voidTransaction = async (id: string) => {
  const { data: transaction, error: fetchError } = await supabase
    .from('financial_transactions')
    .select('bank_account_id, amount, transaction_type')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (transaction?.bank_account_id) {
    await updateBankAccountBalance(
      transaction.bank_account_id,
      transaction.amount,
      transaction.transaction_type === 'income' ? 'debit' : 'credit'
    );
  }

  const { error } = await supabase
    .from('financial_transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
  return transaction;
};

export const createTransactionFromPayment = async (
  paymentId: string,
  paymentData: {
    amount: number;
    payment_date: string;
    payment_number: string;
    bank_account_id?: string;
    customer_name?: string;
  }
) => {
  return createTransaction({
    transaction_date: paymentData.payment_date,
    amount: paymentData.amount,
    transaction_type: 'income',
    description: `Payment received: ${paymentData.payment_number}${paymentData.customer_name ? ` from ${paymentData.customer_name}` : ''}`,
    reference_type: 'payment',
    reference_id: paymentId,
    bank_account_id: paymentData.bank_account_id || null,
  });
};

export const createTransactionFromExpense = async (
  expenseId: string,
  expenseData: {
    amount: number;
    expense_date: string;
    expense_number: string;
    description: string;
    bank_account_id?: string;
    category_id?: string;
  }
) => {
  return createTransaction({
    transaction_date: expenseData.expense_date,
    amount: expenseData.amount,
    transaction_type: 'expense',
    description: `Expense: ${expenseData.description}`,
    reference_type: 'expense',
    reference_id: expenseId,
    bank_account_id: expenseData.bank_account_id || null,
    category_id: expenseData.category_id || null,
  });
};

export const createTransactionFromInvoice = async (
  invoiceId: string,
  invoiceData: {
    total_amount: number;
    invoice_date: string;
    invoice_number: string;
    customer_name?: string;
  }
) => {
  return createTransaction({
    transaction_date: invoiceData.invoice_date,
    amount: invoiceData.total_amount,
    transaction_type: 'income',
    description: `Invoice: ${invoiceData.invoice_number}${invoiceData.customer_name ? ` to ${invoiceData.customer_name}` : ''}`,
    reference_type: 'invoice',
    reference_id: invoiceId,
  });
};

export const getTransactionCategories = async () => {
  const { data, error } = await supabase
    .from('master_transaction_categories')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
};

export const getTransactionStats = async (filters?: {
  dateFrom?: string;
  dateTo?: string;
}) => {
  let query = supabase
    .from('financial_transactions')
    .select('amount, amount_base, transaction_type, transaction_date')
    .is('deleted_at', null);

  if (filters?.dateFrom) {
    query = query.gte('transaction_date', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('transaction_date', filters.dateTo);
  }

  const { data: transactions, error } = await query;
  if (error) throw error;

  const allTransactions = transactions || [];

  // Aggregate in base currency (transactions may be in mixed currencies once a
  // tenant invoices in more than one). baseAmount falls back to raw for any
  // pre-base transition row.
  const income = allTransactions
    .filter(t => t.transaction_type === 'income')
    .reduce((sum, t) => sum + baseAmount(t, 'amount'), 0);

  const expenseTotal = allTransactions
    .filter(t => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + baseAmount(t, 'amount'), 0);

  // Realized FX rows are posted as positive magnitudes typed fx_gain / fx_loss
  // (see paymentsService.allocatePaymentToInvoices); fold them into the net so the
  // bottom line reflects realized currency movement, not just operating flows.
  const fxGain = allTransactions
    .filter(t => t.transaction_type === 'fx_gain')
    .reduce((sum, t) => sum + baseAmount(t, 'amount'), 0);

  const fxLoss = allTransactions
    .filter(t => t.transaction_type === 'fx_loss')
    .reduce((sum, t) => sum + baseAmount(t, 'amount'), 0);

  return {
    total: allTransactions.length,
    income: allTransactions.filter(t => t.transaction_type === 'income').length,
    expense: allTransactions.filter(t => t.transaction_type === 'expense').length,
    pending: 0,
    reconciled: 0,
    totalIncome: income,
    totalExpenses: expenseTotal,
    netCashFlow: income - expenseTotal + fxGain - fxLoss,
  };
};

export const getTransactionsByDateRange = async (
  dateFrom: string,
  dateTo: string,
  type?: string
) => {
  let query = supabase
    .from('financial_transactions')
    .select(`
      *,
      category:master_transaction_categories(id, name),
      bank_account:bank_accounts(id, name)
    `)
    .is('deleted_at', null)
    .gte('transaction_date', dateFrom)
    .lte('transaction_date', dateTo)
    .order('transaction_date', { ascending: true });

  if (type) {
    query = query.eq('transaction_type', type);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const getCashFlowSummary = async (filters?: {
  dateFrom?: string;
  dateTo?: string;
}) => {
  const transactions = await fetchTransactions(filters);

  const grouped: Record<string, { income: number; expense: number }> = {};

  transactions.forEach(t => {
    const month = t.transaction_date?.substring(0, 7);
    if (!month) return;
    if (!grouped[month]) {
      grouped[month] = { income: 0, expense: 0 };
    }

    if (t.transaction_type === 'income') {
      grouped[month].income += t.amount;
    } else if (t.transaction_type === 'expense') {
      grouped[month].expense += t.amount;
    }
  });

  return Object.entries(grouped)
    .map(([month, data]) => ({
      month,
      income: data.income,
      expense: data.expense,
      netFlow: data.income - data.expense,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

const updateBankAccountBalance = async (
  accountId: string,
  amount: number,
  direction: 'credit' | 'debit'
) => {
  const { data: account, error: fetchError } = await supabase
    .from('bank_accounts')
    .select('current_balance')
    .eq('id', accountId)
    .maybeSingle();

  if (fetchError) {
    logger.error('Error fetching bank account:', fetchError);
    return;
  }

  if (!account) {
    logger.error('Bank account not found:', accountId);
    return;
  }

  const currentBalance = account.current_balance || 0;
  const newBalance = direction === 'credit'
    ? currentBalance + amount
    : currentBalance - amount;

  const { error } = await supabase
    .from('bank_accounts')
    .update({ current_balance: newBalance })
    .eq('id', accountId);

  if (error) {
    logger.error('Error updating bank account balance:', error);
  }
};

export const transactionsService = {
  fetchTransactions,
  fetchTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  reconcileTransaction,
  bulkReconcileTransactions,
  voidTransaction,
  createTransactionFromPayment,
  createTransactionFromExpense,
  createTransactionFromInvoice,
  getTransactionCategories,
  getTransactionStats,
  getTransactionsByDateRange,
  getCashFlowSummary,
};
