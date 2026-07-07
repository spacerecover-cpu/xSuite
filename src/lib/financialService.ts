import { supabase, resolveTenantId } from './supabaseClient';
import { logger } from './logger';
import { baseAmount } from './financialMath';
import type { Database } from '../types/database.types';

type FinancialTransactionInsert = Database['public']['Tables']['financial_transactions']['Insert'];

export interface CreateFinancialTransactionInput {
  transaction_date: string;
  amount: number;
  transaction_type: string;
  description: string;
  reference_type?: string;
  reference_id?: string;
  /** Transaction currency. Omit to keep the column default. */
  currency?: string;
  /** documentCurrency->base rate frozen on this ledger row. */
  exchange_rate?: number;
  /** 'provider' | 'manual' | 'derived'. */
  rate_source?: string;
  /** The amount expressed in base currency. Omit to leave NULL (reports then coalesce amount * exchange_rate). */
  amount_base?: number;
}

/**
 * Single source of truth for writing a financial ledger entry. Throws on failure
 * so callers can abort their unit of work rather than silently losing financial
 * data. tenant_id is also stamped server-side by the set_*_tenant_and_audit trigger.
 *
 * Currency/base fields are passed through when provided (multi-currency callers);
 * omitting them keeps the existing single-currency column defaults untouched.
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
    ...(transaction.currency !== undefined ? { currency: transaction.currency } : {}),
    ...(transaction.exchange_rate !== undefined ? { exchange_rate: transaction.exchange_rate } : {}),
    ...(transaction.rate_source !== undefined ? { rate_source: transaction.rate_source } : {}),
    ...(transaction.amount_base !== undefined ? { amount_base: transaction.amount_base } : {}),
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
      .select('total_amount, total_amount_base, amount_paid, amount_paid_base, balance_due, balance_due_base, status')
      .is('deleted_at', null);

    let expenseQuery = supabase
      .from('expenses')
      .select('amount, amount_base, status')
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

    const totalInvoiced = invoices.reduce((sum, inv) => sum + baseAmount(inv, 'total_amount'), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + baseAmount(inv, 'amount_paid'), 0);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + baseAmount(inv, 'balance_due'), 0);

    const totalExpenses = expenses
      .filter(exp => exp.status === 'approved' || exp.status === 'paid')
      .reduce((sum, exp) => sum + baseAmount(exp, 'amount'), 0);

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

export const getTransactionTypes = (): TransactionType[] => {
  return [
    { id: 'income', name: 'Income', type: 'income', description: 'Money received' },
    { id: 'expense', name: 'Expense', type: 'expense', description: 'Money spent' },
    { id: 'asset', name: 'Asset', type: 'asset', description: 'Asset purchase or sale' },
    { id: 'equity', name: 'Equity', type: 'equity', description: 'Owner transactions' },
  ];
};

/** Fiscal-year bounds for a tenant whose fiscal year starts on `fiscalYearStart`
 *  ('MM-DD'). The FY containing `today` runs from that MM-DD to the day before it
 *  a year later; '01-01' is the calendar year. Date-only and DST-safe (UTC
 *  arithmetic), so it never drifts a day across timezones the way toISOString did. */
export const fiscalYearBounds = (
  fiscalYearStart: string,
  today: Date,
): { thisYear: { start: string; end: string }; lastYear: { start: string; end: string } } => {
  const [mRaw, dRaw] = (fiscalYearStart || '01-01').split('-').map(Number);
  const startMonth = mRaw >= 1 && mRaw <= 12 ? mRaw : 1;
  const startDay = dRaw >= 1 && dRaw <= 31 ? dRaw : 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const mm = pad(startMonth);
  const dd = pad(startDay);

  const curMonth = today.getMonth() + 1;
  const curDay = today.getDate();
  const started = curMonth > startMonth || (curMonth === startMonth && curDay >= startDay);
  const fyStartYear = started ? today.getFullYear() : today.getFullYear() - 1;

  const startOf = (yr: number) => `${yr}-${mm}-${dd}`;
  const endOf = (yr: number) => {
    const end = new Date(Date.UTC(yr + 1, startMonth - 1, startDay) - 86400000);
    return `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
  };
  return {
    thisYear: { start: startOf(fyStartYear), end: endOf(fyStartYear) },
    lastYear: { start: startOf(fyStartYear - 1), end: endOf(fyStartYear - 1) },
  };
};

export const getFinancialYearDates = (fiscalYearStart = '01-01') => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const fy = fiscalYearBounds(fiscalYearStart, now);

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
    thisYear: fy.thisYear,
    lastYear: fy.lastYear,
  };
};
