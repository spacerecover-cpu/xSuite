import { supabase } from './supabaseClient';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { baseAmount } from './financialMath';

export interface Transaction {
  id?: string;
  transaction_date: string;
  amount: number;
  amount_base?: number | null;
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
  [key: string]: unknown;
}

const DEFAULT_PAGE_SIZE = 100;

export const fetchTransactionsPage = async (filters?: {
  type?: string;
  status?: string;
  categoryId?: string;
  bankAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: TransactionWithDetails[]; total: number }> => {
  let query = supabase
    .from('financial_transactions')
    .select(`
      *,
      category:master_transaction_categories(id, name),
      bank_account:bank_accounts(id, name, bank_name)
    `, { count: 'exact' })
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

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as TransactionWithDetails[], total: count ?? 0 };
};

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
}): Promise<TransactionWithDetails[]> => {
  return (await fetchTransactionsPage(filters)).rows;
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

// The financial_transactions ledger is append-only (REVOKE UPDATE/DELETE +
// prevent_audit_mutation trigger). All manual writes go through SECURITY
// DEFINER RPCs that set created_by server-side and maintain the bank-account
// balance atomically in the same transaction.
export const createTransaction = async (
  transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>
) => {
  const { data, error } = await supabase.rpc('post_manual_transaction', {
    p_txn: {
      transaction_type: transaction.transaction_type,
      amount: transaction.amount,
      currency: transaction.currency ?? null,
      transaction_date: transaction.transaction_date ?? null,
      description: transaction.description ?? null,
      category_id: transaction.category_id ?? null,
      bank_account_id: transaction.bank_account_id ?? null,
      reference_type: transaction.reference_type ?? null,
      reference_id: transaction.reference_id ?? null,
    },
  });

  if (error) throw error;
  return data;
};

export const reconcileTransaction = async (id: string) => {
  return fetchTransactionById(id);
};

export const bulkReconcileTransactions = async (ids: string[]) => {
  const results = await Promise.all(ids.map(id => fetchTransactionById(id)));
  return results;
};

// Void = post a reversing (contra) entry. The original ledger row is
// preserved (append-only); the RPC negates the amount, links the reversal to
// the original, and unwinds the bank-account balance in the same transaction.
export const voidTransaction = async (id: string, reason?: string) => {
  const { data, error } = await supabase.rpc('reverse_financial_transaction', {
    p_transaction_id: id,
    p_reason: reason ?? undefined,
  });

  if (error) throw error;
  return data;
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
  // One SQL aggregation (get_transaction_stats_base) instead of scanning the entire
  // append-only financial_transactions ledger and reducing in JS (audit F3). Money
  // is base-currency (coalesce(amount_base, amount)); fx_gain/fx_loss fold into net.
  const { data, error } = await supabase.rpc('get_transaction_stats_base', {
    p_date_from: filters?.dateFrom ?? undefined,
    p_date_to: filters?.dateTo ?? undefined,
  });
  if (error) throw error;

  const s = (data ?? {}) as Record<string, number>;
  const totalIncome = Number(s.totalIncomeBase ?? 0);
  const totalExpenses = Number(s.totalExpensesBase ?? 0);
  const fxGain = Number(s.fxGainBase ?? 0);
  const fxLoss = Number(s.fxLossBase ?? 0);

  return {
    total: Number(s.total ?? 0),
    income: Number(s.income ?? 0),
    expense: Number(s.expense ?? 0),
    pending: 0,
    reconciled: 0,
    totalIncome,
    totalExpenses,
    netCashFlow: totalIncome - totalExpenses + fxGain - fxLoss,
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
      grouped[month].income += baseAmount(t, 'amount');
    } else if (t.transaction_type === 'expense') {
      grouped[month].expense += baseAmount(t, 'amount');
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

export const transactionsService = {
  fetchTransactions,
  fetchTransactionById,
  createTransaction,
  reconcileTransaction,
  bulkReconcileTransactions,
  voidTransaction,
  getTransactionCategories,
  getTransactionStats,
  getTransactionsByDateRange,
  getCashFlowSummary,
};
