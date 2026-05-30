import { supabase } from './supabaseClient';
import { logAuditTrail } from './auditTrailService';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { logger } from './logger';
import { deriveInvoiceStatus } from './invoiceStatus';
import { createFinancialTransaction } from './financialService';
import { convertToBase, computeRealizedFx, roundMoney } from './financialMath';
import { resolveRateContext, getBaseCurrency, getCurrencyDecimals } from './currencyService';
import type { Database } from '../types/database.types';

type PaymentInsert = Database['public']['Tables']['payments']['Insert'];
type PaymentAllocationInsert = Database['public']['Tables']['payment_allocations']['Insert'];

export interface Payment {
  id?: string;
  payment_number?: string;
  payment_date: string;
  amount: number;
  /** Payment transaction currency (SMB model: the invoice's currency). Defaults to base. */
  currency?: string | null;
  /** Optional manual override of the payment-date rate; otherwise snapshotted by the service. */
  exchange_rate?: number;
  customer_id?: string | null;
  payment_method_id?: string | null;
  bank_account_id?: string | null;
  reference?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentAllocation {
  id?: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  created_at?: string;
}

export interface PaymentWithDetails extends Payment {
  case?: {
    id: string;
    case_no: string;
    title: string;
  };
  customer?: {
    id: string;
    customer_name: string;
    email: string;
  };
  payment_method?: {
    id: string;
    name: string;
  };
  bank_account?: {
    id: string;
    account_name: string;
    bank_name: string;
  };
  allocations?: Array<{
    id: string;
    amount: number;
    invoice: {
      id: string;
      invoice_number: string;
      total_amount: number;
      case?: {
        id: string;
        case_no: string;
        title: string;
      };
    };
  }>;
  created_by_profile?: {
    id: string;
    full_name: string;
  };
}

const getCurrentTenantId = async (): Promise<string> => {
  const { data, error } = await supabase.rpc('get_current_tenant_id');
  if (error) {
    logger.error('Error fetching current tenant id:', error);
    throw new Error('Unable to resolve current tenant');
  }
  if (!data) {
    throw new Error('No active tenant for current session');
  }
  return data;
};

export const getNextPaymentNumber = async (): Promise<string> => {
  const { data, error } = await supabase.rpc('get_next_number', {
    p_scope: 'payment'
  });

  if (error) {
    logger.error('Error getting next payment number:', error);
    return `PAY-${Date.now()}`;
  }

  return data || `PAY-${Date.now()}`;
};

const DEFAULT_PAGE_SIZE = 100;

export const fetchPayments = async (filters?: {
  status?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) => {
  let query = supabase
    .from('payments')
    .select(`
      *,
      customer:customers_enhanced(id, customer_name, email),
      payment_method:master_payment_methods(id, name),
      bank_account:bank_accounts(id, account_name:name, bank_name),
      allocations:payment_allocations(
        id,
        amount,
        invoice:invoices(id, invoice_number, total_amount, case_id)
      )
    `)
    .is('deleted_at', null)
    .order('payment_date', { ascending: false });

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }

  if (filters?.dateFrom) {
    query = query.gte('payment_date', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('payment_date', filters.dateTo);
  }

  if (filters?.search) {
    const s = sanitizeFilterValue(filters.search);
    query = query.or(`payment_number.ilike.%${s}%,reference.ilike.%${s}%`);
  }

  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const page = filters?.page || 0;
  query = query.range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as PaymentWithDetails[];
};

export const fetchPaymentById = async (id: string) => {
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      customer:customers_enhanced(id, customer_name, email, mobile_number, address, city_id),
      payment_method:master_payment_methods(id, name),
      bank_account:bank_accounts(id, account_name:name, bank_name, account_number),
      allocations:payment_allocations(
        id,
        amount,
        invoice:invoices(
          id,
          invoice_number,
          total_amount,
          balance_due,
          case:cases(id, case_no, title)
        )
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as unknown as PaymentWithDetails;
};

export const createPayment = async (
  payment: Omit<Payment, 'id' | 'payment_number' | 'created_at' | 'updated_at'>,
  allocations?: Array<{ invoice_id: string; amount: number }>
) => {
  const paymentNumber = await getNextPaymentNumber();
  const tenantId = await getCurrentTenantId();

  // Snapshot the payment's own currency + rate at the payment date. amount_base is
  // the cash received expressed in base; realized FX vs each invoice's booked rate
  // is posted during allocation, not here.
  const rc = await resolveRateContext(
    payment.currency,
    payment.payment_date,
    payment.exchange_rate ? { rate: payment.exchange_rate } : null,
  );

  const insertPayload: PaymentInsert = {
    tenant_id: tenantId,
    payment_number: paymentNumber,
    payment_date: payment.payment_date,
    amount: payment.amount,
    currency: rc.documentCurrency,
    exchange_rate: rc.rate,
    rate_source: rc.rateSource,
    amount_base: convertToBase(payment.amount, rc.rate, rc.baseDecimals),
    customer_id: payment.customer_id ?? null,
    payment_method_id: payment.payment_method_id ?? null,
    bank_account_id: payment.bank_account_id ?? null,
    reference: payment.reference,
    status: payment.status,
    notes: payment.notes,
    created_by: payment.created_by ?? null,
  };

  const { data: paymentData, error: paymentError } = await supabase
    .from('payments')
    .insert([insertPayload])
    .select()
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!paymentData) {
    throw new Error('Failed to create payment record');
  }

  if (allocations && allocations.length > 0) {
    await allocatePaymentToInvoices(paymentData.id, allocations);
  }

  await logAuditTrail('create', 'payments', paymentData.id, {}, { payment_number: paymentNumber, amount: payment.amount });

  return paymentData;
};

export const allocatePaymentToInvoices = async (
  paymentId: string,
  allocations: Array<{ invoice_id: string; amount: number }>
) => {
  const tenantId = await getCurrentTenantId();

  const allocationRecords: PaymentAllocationInsert[] = allocations.map(alloc => ({
    tenant_id: tenantId,
    payment_id: paymentId,
    invoice_id: alloc.invoice_id,
    amount: alloc.amount,
  }));

  const { error: allocError } = await supabase
    .from('payment_allocations')
    .insert(allocationRecords);

  if (allocError) throw allocError;

  // The payment date drives the settlement rate for realized FX; the base currency
  // and its decimals frame every *_base figure below.
  const { data: paymentRow } = await supabase
    .from('payments')
    .select('payment_date, currency, exchange_rate')
    .eq('id', paymentId)
    .maybeSingle();
  const paymentDate = paymentRow?.payment_date ?? new Date().toISOString().split('T')[0];
  // The payment's settlement rate was frozen at createPayment (honouring any manual
  // override). Realized FX measures it against each invoice's booked rate — we never
  // re-derive it from the rates table, which would discard the override and (while the
  // rate cron is dormant and exchange_rates is empty) throw on a cross-currency lookup.
  // Sound under the Phase-1 SMB invariant (payment is in the invoice's currency, so the
  // payment's frozen documentCurrency->base rate IS the settlement rate for that invoice).
  const paymentRate = paymentRow?.exchange_rate ?? 1;
  const baseCurrency = await getBaseCurrency();
  const baseDecimals = await getCurrencyDecimals(baseCurrency);

  // Track successfully updated invoices for rollback on failure (base fields included).
  const updatedInvoices: Array<{
    invoice_id: string;
    original: {
      amount_paid: number;
      balance_due: number;
      status: string;
      amount_paid_base: number | null;
      balance_due_base: number | null;
    };
  }> = [];

  // Accumulated postings to write once all invoice updates have succeeded.
  let baseAllocated = 0;
  const currenciesTouched = new Set<string>();
  const fxPostings: number[] = [];

  try {
    for (const alloc of allocations) {
      const { data: invoice, error: fetchError } = await supabase
        .from('invoices')
        .select('total_amount, amount_paid, balance_due, status, currency, exchange_rate, amount_paid_base, balance_due_base')
        .eq('id', alloc.invoice_id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!invoice) {
        throw new Error(`Invoice ${alloc.invoice_id} not found`);
      }

      // Save original state for rollback
      updatedInvoices.push({
        invoice_id: alloc.invoice_id,
        original: {
          amount_paid: invoice.amount_paid || 0,
          balance_due: invoice.balance_due || 0,
          status: invoice.status || 'sent',
          amount_paid_base: invoice.amount_paid_base,
          balance_due_base: invoice.balance_due_base,
        },
      });

      const invCurrency = invoice.currency ?? baseCurrency;
      const invoiceRate = invoice.exchange_rate ?? 1;
      const docDecimals = await getCurrencyDecimals(invCurrency);

      const newAmountPaid = roundMoney((invoice.amount_paid || 0) + alloc.amount, docDecimals);
      const newAmountDue = roundMoney((invoice.total_amount || 0) - newAmountPaid, docDecimals);

      // The receivable is carried at the invoice's BOOKED rate; the rate movement
      // between booking and settlement is captured separately as realized FX below.
      const newAmountPaidBase = convertToBase(newAmountPaid, invoiceRate, baseDecimals);
      const newBalanceDueBase = convertToBase(Math.max(0, newAmountDue), invoiceRate, baseDecimals);

      const newStatus = deriveInvoiceStatus(newAmountPaid, newAmountDue);

      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          amount_paid: newAmountPaid,
          balance_due: Math.max(0, newAmountDue),
          amount_paid_base: newAmountPaidBase,
          balance_due_base: newBalanceDueBase,
          status: newStatus,
        })
        .eq('id', alloc.invoice_id);

      if (updateError) throw updateError;

      baseAllocated = roundMoney(baseAllocated + convertToBase(alloc.amount, invoiceRate, baseDecimals), baseDecimals);
      currenciesTouched.add(invCurrency);

      // Realized FX only exists when the document currency differs from base AND the
      // payment's frozen rate moved from the invoice's booked rate. Same-currency
      // settlements are structurally zero, so we skip them.
      if (invCurrency !== baseCurrency) {
        const realizedFx = computeRealizedFx(alloc.amount, paymentRate, invoiceRate, baseDecimals);
        if (realizedFx !== 0) fxPostings.push(realizedFx);
      }
    }

    // Income posting in the document currency, with the exact base equivalent. For a
    // uniform-currency payment we tag the effective booked rate; mixed-currency
    // allocations (Phase 2) fall back to a base-denominated row.
    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    const uniformCurrency = currenciesTouched.size === 1 ? [...currenciesTouched][0] : null;
    await createFinancialTransaction({
      transaction_date: paymentDate,
      amount: uniformCurrency ? totalAllocated : baseAllocated,
      transaction_type: 'income',
      description: `Payment received`,
      reference_type: 'payment',
      reference_id: paymentId,
      currency: uniformCurrency ?? baseCurrency,
      exchange_rate: uniformCurrency && totalAllocated !== 0 ? baseAllocated / totalAllocated : 1,
      amount_base: baseAllocated,
    });

    // One fx_gain / fx_loss ledger row per allocation that realized a non-zero delta.
    for (const fx of fxPostings) {
      await createFinancialTransaction({
        transaction_date: paymentDate,
        amount: Math.abs(fx),
        transaction_type: fx > 0 ? 'fx_gain' : 'fx_loss',
        description: `Realized FX ${fx > 0 ? 'gain' : 'loss'} on payment allocation`,
        reference_type: 'payment',
        reference_id: paymentId,
        currency: baseCurrency,
        exchange_rate: 1,
        amount_base: Math.abs(fx),
      });
    }
  } catch (error) {
    // Rollback: reverse allocation insert
    await supabase
      .from('payment_allocations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('payment_id', paymentId);

    // Rollback: restore original invoice states (including base fields)
    for (const updated of updatedInvoices) {
      await supabase
        .from('invoices')
        .update({
          amount_paid: updated.original.amount_paid,
          balance_due: updated.original.balance_due,
          amount_paid_base: updated.original.amount_paid_base,
          balance_due_base: updated.original.balance_due_base,
          status: updated.original.status,
        })
        .eq('id', updated.invoice_id);
    }

    // Rollback: compensate any income / fx ledger rows already posted for this payment
    // before the failure, so a reversed allocation never leaves orphan revenue behind.
    // (A single-transaction RPC would make this atomic — tracked as Wave-3 follow-up.)
    await supabase
      .from('financial_transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('reference_type', 'payment')
      .eq('reference_id', paymentId);

    throw error;
  }
};

export const updatePaymentStatus = async (
  id: string,
  status: Payment['status'],
  notes?: string
) => {
  const { data, error } = await supabase
    .from('payments')
    .update({ status, notes: notes || undefined })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;

  await logAuditTrail('update', 'payments', id, {}, { status, notes });

  return data;
};

export const voidPayment = async (paymentId: string) => {
  const { data: allocations, error: allocError } = await supabase
    .from('payment_allocations')
    .select('invoice_id, amount')
    .eq('payment_id', paymentId);

  if (allocError) throw allocError;

  const baseCurrency = await getBaseCurrency();
  const baseDecimals = await getCurrencyDecimals(baseCurrency);

  for (const alloc of allocations || []) {
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('total_amount, amount_paid, currency, exchange_rate')
      .eq('id', alloc.invoice_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!invoice) {
      throw new Error(`Invoice ${alloc.invoice_id} not found`);
    }

    const invoiceRate = invoice.exchange_rate ?? 1;
    const docDecimals = await getCurrencyDecimals(invoice.currency ?? baseCurrency);
    const newAmountPaid = Math.max(0, roundMoney((invoice.amount_paid || 0) - alloc.amount, docDecimals));
    const newAmountDue = roundMoney((invoice.total_amount || 0) - newAmountPaid, docDecimals);

    const newStatus = deriveInvoiceStatus(newAmountPaid, newAmountDue);

    await supabase
      .from('invoices')
      .update({
        amount_paid: newAmountPaid,
        balance_due: newAmountDue,
        amount_paid_base: convertToBase(newAmountPaid, invoiceRate, baseDecimals),
        balance_due_base: convertToBase(newAmountDue, invoiceRate, baseDecimals),
        status: newStatus,
      })
      .eq('id', alloc.invoice_id);
  }

  const { error: deleteAllocError } = await supabase
    .from('payment_allocations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('payment_id', paymentId);

  if (deleteAllocError) throw deleteAllocError;

  const { data, error } = await supabase
    .from('payments')
    .update({ status: 'refunded' })
    .eq('id', paymentId)
    .select()
    .maybeSingle();

  if (error) throw error;

  await logAuditTrail('void', 'payments', paymentId, {}, { status: 'refunded' });

  return data;
};

export const getPaymentsByCase = async (caseId: string) => {
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select('id')
    .eq('case_id', caseId);

  if (invError) throw invError;
  if (!invoices || invoices.length === 0) return [];

  const invoiceIds = invoices.map(i => i.id);

  const { data: allocations, error: allocError } = await supabase
    .from('payment_allocations')
    .select(`
      amount,
      payment:payments(
        *,
        customer:customers_enhanced(id, customer_name),
        payment_method:master_payment_methods(name)
      ),
      invoice:invoices(id, invoice_number)
    `)
    .in('invoice_id', invoiceIds);

  if (allocError) throw allocError;
  return allocations || [];
};

export const getPaymentMethods = async () => {
  const { data, error } = await supabase
    .from('master_payment_methods')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data || [];
};

export const getUnpaidInvoices = async (customerId?: string) => {
  let query = supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      amount_paid,
      balance_due,
      status,
      case_id,
      cases!invoices_case_id_fkey(id, case_no, title),
      customer:customers_enhanced!invoices_customer_id_fkey(id, customer_name)
    `)
    .eq('invoice_type', 'tax_invoice')
    .in('status', ['draft', 'sent', 'partial', 'overdue'])
    .gt('balance_due', 0)
    .order('invoice_date', { ascending: false });

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const getPaymentStats = async (filters?: {
  dateFrom?: string;
  dateTo?: string;
}) => {
  let query = supabase
    .from('payments')
    .select('amount, status, payment_date');

  if (filters?.dateFrom) {
    query = query.gte('payment_date', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('payment_date', filters.dateTo);
  }

  const { data: payments, error } = await query;
  if (error) throw error;

  const today = new Date().toISOString().split('T')[0];
  const thisMonth = new Date();
  thisMonth.setDate(1);
  const thisMonthStart = thisMonth.toISOString().split('T')[0];

  const rows = payments ?? [];

  return {
    total: rows.length,
    completed: rows.filter(p => p.status === 'completed').length,
    pending: rows.filter(p => p.status === 'pending').length,
    today: rows.filter(p => p.payment_date === today).length,
    totalAmount: rows.reduce((sum, p) => sum + (p.amount || 0), 0),
    completedAmount: rows.filter(p => p.status === 'completed').reduce((sum, p) => sum + (p.amount || 0), 0),
    thisMonthAmount: rows
      .filter(p => p.payment_date !== null && p.payment_date >= thisMonthStart)
      .reduce((sum, p) => sum + (p.amount || 0), 0),
  };
};

export const getCasesWithUnpaidInvoices = async () => {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      case_id,
      cases!invoices_case_id_fkey!inner(
        id,
        case_no,
        title,
        customer:customers_enhanced!cases_customer_id_fkey(id, customer_name, email)
      )
    `)
    .eq('invoice_type', 'tax_invoice')
    .in('status', ['draft', 'sent', 'partial', 'overdue'])
    .gt('balance_due', 0);

  if (error) throw error;

  const uniqueCases = new Map();
  for (const invoice of data || []) {
    if (invoice.cases && !uniqueCases.has(invoice.cases.id)) {
      uniqueCases.set(invoice.cases.id, invoice.cases);
    }
  }

  return Array.from(uniqueCases.values());
};

export const getUnpaidInvoicesByCase = async (caseId: string) => {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      amount_paid,
      balance_due,
      status,
      case_id,
      cases!invoices_case_id_fkey(id, case_no, title),
      customer:customers_enhanced!invoices_customer_id_fkey(id, customer_name)
    `)
    .eq('case_id', caseId)
    .eq('invoice_type', 'tax_invoice')
    .in('status', ['draft', 'sent', 'partial', 'overdue'])
    .gt('balance_due', 0)
    .order('invoice_date', { ascending: false });

  if (error) throw error;
  return data || [];
};

// createFinancialTransaction is now the shared fail-fast implementation in
// financialService; this path already threw on error, so behavior is unchanged.

export const paymentsService = {
  getNextPaymentNumber,
  fetchPayments,
  fetchPaymentById,
  createPayment,
  allocatePaymentToInvoices,
  updatePaymentStatus,
  voidPayment,
  getPaymentsByCase,
  getPaymentMethods,
  getUnpaidInvoices,
  getUnpaidInvoicesByCase,
  getCasesWithUnpaidInvoices,
  getPaymentStats,
};
