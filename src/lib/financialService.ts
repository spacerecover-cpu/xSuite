import { supabase, resolveTenantId } from './supabaseClient';
import { AccountingLocale } from '../types/accountingLocale';
import { logger } from './logger';
import type { Database } from '../types/database.types';

type FinancialTransactionInsert = Database['public']['Tables']['financial_transactions']['Insert'];

export interface CreateFinancialTransactionInput {
  transaction_date: string;
  amount: number;
  transaction_type: string;
  description: string;
  reference_type?: string;
  reference_id?: string;
}

/**
 * Single source of truth for writing a financial ledger entry. Throws on failure
 * so callers can abort their unit of work rather than silently losing financial
 * data. tenant_id is also stamped server-side by the set_*_tenant_and_audit trigger.
 */
export const createFinancialTransaction = async (
  transaction: CreateFinancialTransactionInput,
): Promise<void> => {
  const tenantId = await resolveTenantId();

  const payload: FinancialTransactionInsert = {
    tenant_id: tenantId,
    transaction_date: transaction.transaction_date,
    amount: transaction.amount,
    transaction_type: transaction.transaction_type,
    description: transaction.description,
    reference_type: transaction.reference_type,
    reference_id: transaction.reference_id,
  };

  const { error } = await supabase
    .from('financial_transactions')
    .insert([payload]);

  if (error) {
    logger.error('Error creating financial transaction:', error);
    throw new Error(`Failed to create financial audit record: ${error.message}`);
  }
};

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  profitMargin: number;
}

export interface TransactionType {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'asset' | 'equity';
  description?: string;
}

export const fetchDefaultLocale = async (): Promise<AccountingLocale | null> => {
  try {
    const { data, error } = await supabase
      .from('accounting_locales')
      .select('*')
      .eq('is_default', true)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching default locale:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Error fetching default locale:', error);
    return null;
  }
};

export const calculateVAT = (amount: number, taxRate: number): number => {
  return Math.round(amount * taxRate * 100) / 100;
};

export const calculateAmountWithVAT = (amount: number, taxRate: number): number => {
  return Math.round((amount + calculateVAT(amount, taxRate)) * 100) / 100;
};

export const calculateAmountWithoutVAT = (amountWithVAT: number, taxRate: number): number => {
  return Math.round((amountWithVAT / (1 + taxRate)) * 100) / 100;
};

export const fetchFinancialSummary = async (
  startDate?: string,
  endDate?: string
): Promise<FinancialSummary> => {
  try {
    let invoiceQuery = supabase
      .from('invoices')
      .select('total_amount, amount_paid, balance_due, status')
      .is('deleted_at', null);

    let expenseQuery = supabase
      .from('expenses')
      .select('amount, status')
      .is('deleted_at', null);

    if (startDate && endDate) {
      invoiceQuery = invoiceQuery
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate);
      expenseQuery = expenseQuery
        .gte('expense_date', startDate)
        .lte('expense_date', endDate);
    }

    const [invoicesResult, expensesResult] = await Promise.all([
      invoiceQuery,
      expenseQuery,
    ]);

    const invoices = invoicesResult.data || [];
    const expenses = expensesResult.data || [];

    const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0);

    const totalExpenses = expenses
      .filter(exp => exp.status === 'approved' || exp.status === 'paid')
      .reduce((sum, exp) => sum + (exp.amount || 0), 0);

    const totalRevenue = totalPaid;
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      profitMargin,
    };
  } catch (error) {
    logger.error('Error fetching financial summary:', error);
    return {
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      totalInvoiced: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      profitMargin: 0,
    };
  }
};

export const getNextTransactionNumber = async (prefix: string): Promise<string> => {
  try {
    const { data, error } = await supabase
      .rpc('get_next_number', { p_scope: prefix.toLowerCase() });

    if (error) {
      logger.error('Error getting next number:', error);
      if (error.message?.includes('not found in the schema cache')) {
        throw new Error(`${prefix} numbering system is not configured. Please contact your system administrator.`);
      }
      if (error.message?.includes('Number sequence not found')) {
        throw new Error(`${prefix} number sequence not found. Please configure it in Settings > System & Numbers.`);
      }
      throw new Error(`Failed to generate ${prefix} number. Please check your number sequence configuration.`);
    }

    if (!data) {
      throw new Error(`No number generated for ${prefix}. Please configure it in Settings > System & Numbers.`);
    }

    return data;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('numbering system') || msg.includes('number sequence') || msg.includes('Failed to generate') || msg.includes('No number generated')) {
      throw error;
    }
    throw new Error(`Failed to generate ${prefix} number: ${msg}`);
  }
};

export const formatCurrencyWithLocale = (
  amount: number,
  locale: AccountingLocale
): string => {
  const formattedNumber = amount.toFixed(locale.decimal_places ?? 2);
  const [integerPart, decimalPart] = formattedNumber.split('.');
  const formattedInteger = parseInt(integerPart).toLocaleString('en-US');
  const fullNumber = decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;

  if (locale.currency_position === 'before') {
    return `${locale.currency_symbol} ${fullNumber}`;
  } else {
    return `${fullNumber} ${locale.currency_symbol}`;
  }
};

export const getTransactionTypes = (): TransactionType[] => {
  return [
    { id: 'income', name: 'Income', type: 'income', description: 'Money received' },
    { id: 'expense', name: 'Expense', type: 'expense', description: 'Money spent' },
    { id: 'asset', name: 'Asset', type: 'asset', description: 'Asset purchase or sale' },
    { id: 'equity', name: 'Equity', type: 'equity', description: 'Owner transactions' },
  ];
};

export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    draft: '#94a3b8',
    pending: '#f59e0b',
    sent: '#3b82f6',
    approved: '#10b981',
    'partially-paid': '#f59e0b',
    paid: '#10b981',
    completed: '#10b981',
    overdue: '#ef4444',
    rejected: '#ef4444',
    failed: '#ef4444',
    cancelled: '#6b7280',
    refunded: '#6b7280',
  };
  return colors[status] || '#64748b';
};

export const getFinancialYearDates = () => {
  const now = new Date();
  const currentYear = now.getFullYear();

  return {
    thisMonth: {
      start: new Date(currentYear, now.getMonth(), 1).toISOString().split('T')[0],
      end: new Date(currentYear, now.getMonth() + 1, 0).toISOString().split('T')[0],
    },
    lastMonth: {
      start: new Date(currentYear, now.getMonth() - 1, 1).toISOString().split('T')[0],
      end: new Date(currentYear, now.getMonth(), 0).toISOString().split('T')[0],
    },
    thisQuarter: {
      start: new Date(currentYear, Math.floor(now.getMonth() / 3) * 3, 1).toISOString().split('T')[0],
      end: new Date(currentYear, Math.floor(now.getMonth() / 3) * 3 + 3, 0).toISOString().split('T')[0],
    },
    thisYear: {
      start: new Date(currentYear, 0, 1).toISOString().split('T')[0],
      end: new Date(currentYear, 11, 31).toISOString().split('T')[0],
    },
    lastYear: {
      start: new Date(currentYear - 1, 0, 1).toISOString().split('T')[0],
      end: new Date(currentYear - 1, 11, 31).toISOString().split('T')[0],
    },
  };
};
