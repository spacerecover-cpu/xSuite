import { supabase } from './supabaseClient';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { logger } from './logger';
import type { Database } from '../types/database.types';
import { createFinancialTransaction } from './financialService';

type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];
type ExpenseAttachmentRow = Database['public']['Tables']['expense_attachments']['Row'];

export type ExpenseStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'paid';

export interface Expense {
  id?: string;
  expense_number?: string;
  expense_date: string;
  amount: number;
  description: string;
  vendor?: string;
  category_id?: string | null;
  case_id?: string | null;
  payment_method_id?: string | null;
  status: ExpenseStatus;
  created_by?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseWithDetails extends Expense {
  category?: {
    id: string;
    name: string;
  };
  case?: {
    id: string;
    case_no: string;
    title: string;
  };
  submitter?: {
    id: string;
    full_name: string;
  };
  approver?: {
    id: string;
    full_name: string;
  };
  attachments?: ExpenseAttachment[];
}

export type ExpenseAttachment = ExpenseAttachmentRow;

export const getNextExpenseNumber = async (): Promise<string> => {
  const { data, error } = await supabase.rpc('get_next_number', {
    p_scope: 'expense'
  });

  if (error) {
    logger.error('Error getting next expense number:', error);
    return `EXP-${Date.now()}`;
  }

  return data || `EXP-${Date.now()}`;
};

export const fetchExpenses = async (filters?: {
  status?: string;
  categoryId?: string;
  caseId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  submittedBy?: string;
}) => {
  let query = supabase
    .from('expenses')
    .select(`
      *,
      category:master_expense_categories(id, name),
      case:cases(id, case_no, title)
    `)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false });

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters?.categoryId) {
    query = query.eq('category_id', filters.categoryId);
  }

  if (filters?.caseId) {
    query = query.eq('case_id', filters.caseId);
  }

  if (filters?.dateFrom) {
    query = query.gte('expense_date', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('expense_date', filters.dateTo);
  }

  if (filters?.search) {
    const s = sanitizeFilterValue(filters.search);
    query = query.or(`expense_number.ilike.%${s}%,description.ilike.%${s}%,vendor.ilike.%${s}%`);
  }

  if (filters?.submittedBy) {
    query = query.eq('created_by', filters.submittedBy);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ExpenseWithDetails[];
};

export const fetchExpenseById = async (id: string) => {
  const { data: expense, error } = await supabase
    .from('expenses')
    .select(`
      *,
      category:master_expense_categories(id, name),
      case:cases(id, case_no, title)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!expense) return null;

  const { data: attachments } = await supabase
    .from('expense_attachments')
    .select('*')
    .eq('expense_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return {
    ...expense,
    attachments: attachments ?? [],
  } as unknown as ExpenseWithDetails;
};

export const createExpense = async (
  expense: Omit<Expense, 'id' | 'expense_number' | 'created_at' | 'updated_at'>
) => {
  const expenseNumber = await getNextExpenseNumber();

  const payload = {
    ...expense,
    expense_number: expenseNumber,
  } as unknown as ExpenseInsert;

  const { data, error } = await supabase
    .from('expenses')
    .insert([payload])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const updateExpense = async (
  id: string,
  expense: Partial<Expense>
) => {
  const updatePayload = expense as unknown as Database['public']['Tables']['expenses']['Update'];

  const { data, error } = await supabase
    .from('expenses')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const deleteExpense = async (id: string) => {
  await supabase
    .from('expense_attachments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('expense_id', id);

  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
};

export const submitExpense = async (id: string, submittedBy: string) => {
  const { data, error } = await supabase
    .from('expenses')
    .update({
      status: 'pending',
      created_by: submittedBy,
    })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const approveExpense = async (id: string, approvedBy: string) => {
  const { data: expense, error: fetchError } = await supabase
    .from('expenses')
    .select('amount, description, case_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!expense) {
    throw new Error(`Expense ${id} not found`);
  }

  const { data, error } = await supabase
    .from('expenses')
    .update({
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;

  await createFinancialTransaction({
    transaction_date: new Date().toISOString().split('T')[0],
    amount: expense.amount,
    transaction_type: 'expense',
    description: `Expense approved: ${expense.description ?? ''}`,
    reference_type: 'expense',
    reference_id: id,
  });

  if (expense.case_id) {
    await createVATRecord({
      record_type: 'expense',
      record_id: id,
      vat_amount: 0,
      vat_rate: 0,
    });
  }

  return data;
};

export const rejectExpense = async (
  id: string,
  rejectedBy: string,
  reason: string
) => {
  const { data, error } = await supabase
    .from('expenses')
    .update({
      status: 'rejected',
      approved_by: rejectedBy,
      approved_at: new Date().toISOString(),
      notes: reason,
    })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const markExpenseAsPaid = async (id: string) => {
  const { data, error } = await supabase
    .from('expenses')
    .update({ status: 'paid' })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const uploadExpenseAttachment = async (
  expenseId: string,
  file: File
): Promise<ExpenseAttachment> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${expenseId}/${Date.now()}.${fileExt}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('expense-receipts')
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  const { data: tenantRow, error: tenantError } = await supabase
    .from('expenses')
    .select('tenant_id')
    .eq('id', expenseId)
    .maybeSingle();

  if (tenantError) throw tenantError;
  if (!tenantRow) {
    throw new Error(`Expense ${expenseId} not found`);
  }

  const insertPayload: Database['public']['Tables']['expense_attachments']['Insert'] = {
    expense_id: expenseId,
    tenant_id: tenantRow.tenant_id,
    file_name: file.name,
    file_url: uploadData.path,
    file_type: file.type,
    file_size: file.size,
  };

  const { data, error } = await supabase
    .from('expense_attachments')
    .insert([insertPayload])
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('Failed to create expense attachment');
  }
  return data;
};

export const deleteExpenseAttachment = async (attachmentId: string) => {
  const { data: attachment, error: fetchError } = await supabase
    .from('expense_attachments')
    .select('file_url')
    .eq('id', attachmentId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!attachment) {
    throw new Error(`Expense attachment ${attachmentId} not found`);
  }

  await supabase.storage
    .from('expense-receipts')
    .remove([attachment.file_url]);

  const { error } = await supabase
    .from('expense_attachments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', attachmentId);

  if (error) throw error;
};

export const getExpenseCategories = async () => {
  const { data, error } = await supabase
    .from('master_expense_categories')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data ?? [];
};

export const getExpensesByCase = async (caseId: string) => {
  const { data, error } = await supabase
    .from('expenses')
    .select(`
      *,
      category:master_expense_categories(id, name)
    `)
    .eq('case_id', caseId)
    .order('expense_date', { ascending: false });

  if (error) throw error;
  return data ?? [];
};

export const getExpenseStats = async (filters?: {
  dateFrom?: string;
  dateTo?: string;
}) => {
  let query = supabase
    .from('expenses')
    .select('amount, status, expense_date, category_id');

  if (filters?.dateFrom) {
    query = query.gte('expense_date', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('expense_date', filters.dateTo);
  }

  const { data: expenses, error } = await query;
  if (error) throw error;

  const rows = expenses ?? [];

  const thisMonth = new Date();
  thisMonth.setDate(1);
  const thisMonthStart = thisMonth.toISOString().split('T')[0];

  const approvedExpenses = rows.filter(e => e.status === 'approved' || e.status === 'paid');

  return {
    total: rows.length,
    pending: rows.filter(e => e.status === 'pending').length,
    approved: rows.filter(e => e.status === 'approved').length,
    rejected: rows.filter(e => e.status === 'rejected').length,
    paid: rows.filter(e => e.status === 'paid').length,
    totalAmount: approvedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0),
    pendingAmount: rows.filter(e => e.status === 'pending').reduce((sum, e) => sum + (e.amount || 0), 0),
    thisMonthAmount: approvedExpenses
      .filter(e => e.expense_date !== null && e.expense_date >= thisMonthStart)
      .reduce((sum, e) => sum + (e.amount || 0), 0),
  };
};

export const getExpensesByCategory = async (filters?: {
  dateFrom?: string;
  dateTo?: string;
}) => {
  let query = supabase
    .from('expenses')
    .select(`
      amount,
      category:master_expense_categories(id, name)
    `)
    .in('status', ['approved', 'paid']);

  if (filters?.dateFrom) {
    query = query.gte('expense_date', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('expense_date', filters.dateTo);
  }

  const { data, error } = await query;
  if (error) throw error;

  type CategoryRow = {
    amount: number;
    category: { id: string; name: string } | null;
  };

  const categoryTotals: Record<string, { name: string; amount: number }> = {};

  ((data ?? []) as unknown as CategoryRow[]).forEach((expense) => {
    const categoryName = expense.category?.name || 'Uncategorized';
    const categoryId = expense.category?.id || 'uncategorized';

    if (!categoryTotals[categoryId]) {
      categoryTotals[categoryId] = { name: categoryName, amount: 0 };
    }
    categoryTotals[categoryId].amount += expense.amount || 0;
  });

  return Object.entries(categoryTotals)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.amount - a.amount);
};

// createFinancialTransaction now lives in financialService (shared, fail-fast):
// a failed ledger write throws so approveExpense aborts instead of silently
// leaving the books out of balance.

const createVATRecord = async (record: {
  record_type: string;
  record_id: string;
  vat_amount: number;
  vat_rate: number;
}) => {
  const payload = {
    record_type: record.record_type,
    record_id: record.record_id,
    vat_amount: record.vat_amount,
    vat_rate: record.vat_rate,
  } as Database['public']['Tables']['vat_records']['Insert'];

  const { error } = await supabase
    .from('vat_records')
    .insert([payload]);

  if (error) {
    logger.error('Error creating VAT record:', error);
  }
};

export const expensesService = {
  getNextExpenseNumber,
  fetchExpenses,
  fetchExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  submitExpense,
  approveExpense,
  rejectExpense,
  markExpenseAsPaid,
  uploadExpenseAttachment,
  deleteExpenseAttachment,
  getExpenseCategories,
  getExpensesByCase,
  getExpenseStats,
  getExpensesByCategory,
};
