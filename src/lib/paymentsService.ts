import { supabase } from './supabaseClient';
import { logAuditTrail } from './auditTrailService';
import { logInvoicePayment } from './chainOfCustodyService';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { buildPaymentSearchOr } from './searchResolvers';
import { logger } from './logger';
import { resolveRateContext } from './currencyService';

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
  withheld_amount?: number;
  withholding_certificate_ref?: string | null;
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
    query = query.or(await buildPaymentSearchOr(s));
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
  allocations?: Array<{ invoice_id: string; amount: number }>,
  withholding?: { amount: number; certificateRef: string } | null
) => {
  if (!allocations || allocations.length === 0) {
    // Money conservation: every unit of cash received must be allocated to an invoice.
    // Unapplied/advance cash needs a credit model (Phase 4) before it can be accepted.
    throw new Error('A payment must be allocated to at least one invoice.');
  }

  // Financial integrity: a recorded payment must name HOW it was paid and WHERE it
  // lands, so it can be reconciled. The RecordPaymentModal enforces this in the UI;
  // this is the service-layer backstop covering both payment-entry screens (case
  // detail + global Payments). The shared record_payment RPC stays permissive on
  // purpose — receiptsService calls it directly with its own rules.
  if (!payment.payment_method_id) {
    throw new Error('A payment method is required to record a payment.');
  }
  if (!payment.bank_account_id) {
    throw new Error('A deposit account is required to record a payment.');
  }

  // TDS/WHT: a withheld amount is a certificate-backed tax credit — never
  // accept it without the certificate reference (record_payment enforces
  // this server-side too; failing here gives an actionable form error).
  if (withholding && withholding.amount > 0 && !withholding.certificateRef.trim()) {
    throw new Error('A withholding certificate reference is required when an amount is withheld.');
  }

  // Resolve the payment-date rate client-side (honouring any manual override). The RPC
  // owns atomicity, FOR UPDATE locking, money-conservation validation, balance recompute,
  // and the (append-only) ledger posting — see record_payment in the DB.
  const rc = await resolveRateContext(
    payment.currency,
    payment.payment_date,
    payment.exchange_rate ? { rate: payment.exchange_rate } : null,
  );

  const { data, error } = await supabase.rpc('record_payment', {
    p_payment: {
      amount: payment.amount,
      currency: rc.documentCurrency,
      exchange_rate: rc.rate,
      rate_source: rc.rateSource,
      payment_date: payment.payment_date,
      customer_id: payment.customer_id ?? null,
      payment_method_id: payment.payment_method_id ?? null,
      bank_account_id: payment.bank_account_id ?? null,
      reference: payment.reference ?? null,
      status: payment.status ?? 'completed',
      notes: payment.notes ?? null,
      withheld_amount: withholding?.amount ?? 0,
      certificate_ref: withholding?.certificateRef?.trim() || null,
    },
    p_allocations: allocations.map((a) => ({ invoice_id: a.invoice_id, amount: a.amount })),
  });

  if (error) throw error;
  if (!data) {
    throw new Error('Failed to create payment record');
  }

  await logAuditTrail('create', 'payments', data.id, {}, { payment_number: data.payment_number, amount: payment.amount });

  // Forensic ledger: record a payment event on each case-linked invoice in the
  // allocation (post-RPC, so balances are final). Best-effort — a ledger failure
  // must not abort the already-recorded payment.
  try {
    const invoiceIds = [...new Set(allocations.map((a) => a.invoice_id))];
    const { data: allocatedInvoices } = await supabase
      .from('invoices')
      .select('id, case_id, invoice_number, amount_paid, total_amount')
      .in('id', invoiceIds);
    for (const inv of allocatedInvoices ?? []) {
      if (!inv.case_id) continue;
      // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency (allocations of one payment, filtered to a single invoice id; all same currency by construction)
      const allocated = allocations
        .filter((a) => a.invoice_id === inv.id)
        .reduce((sum, a) => sum + a.amount, 0);
      await logInvoicePayment({
        caseId: inv.case_id,
        invoiceNo: inv.invoice_number ?? inv.id,
        paymentAmount: allocated,
        totalPaid: inv.amount_paid ?? 0,
        totalAmount: inv.total_amount ?? 0,
        paymentMethod: payment.payment_method_id ?? undefined,
      });
    }
  } catch (custodyError) {
    logger.error('Payment recorded but chain-of-custody event failed:', custodyError);
  }

  return data;
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
  // Atomic reversal: the RPC reverses each invoice balance, soft-deletes the allocations,
  // and posts a REVERSING (negative) income ledger entry rather than deleting the original
  // posting — keeping the ledger append-only. See void_payment in the DB.
  const { data, error } = await supabase.rpc('void_payment', { p_payment_id: paymentId });

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
  // One SQL aggregation (get_payment_stats_base) instead of fetching every payment
  // row and reducing in JS. The RPC filters deleted_at IS NULL (the old query did
  // not — audit F8) and computes `today` from payment_date's date (the old
  // string-vs-timestamptz compare was ~always 0). today/month-start are passed in
  // (browser tz, parity). Money is base-currency (coalesce(amount_base, amount)).
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = new Date();
  thisMonth.setDate(1);
  const thisMonthStart = thisMonth.toISOString().split('T')[0];

  const { data, error } = await supabase.rpc('get_payment_stats_base', {
    p_date_from: filters?.dateFrom ?? undefined,
    p_date_to: filters?.dateTo ?? undefined,
    p_today: today,
    p_month_start: thisMonthStart,
  });
  if (error) throw error;

  const s = (data ?? {}) as Record<string, number>;
  return {
    total: Number(s.total ?? 0),
    completed: Number(s.completed ?? 0),
    pending: Number(s.pending ?? 0),
    today: Number(s.today ?? 0),
    totalAmount: Number(s.totalAmountBase ?? 0),
    completedAmount: Number(s.completedAmountBase ?? 0),
    thisMonthAmount: Number(s.thisMonthAmountBase ?? 0),
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
    .in('status', ['sent', 'partial', 'overdue'])
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
    // Drafts are excluded by design: an invoice must be ISSUED before payment
    // (canRecordPayment); the Issue action on the invoice moves draft → sent.
    .in('status', ['sent', 'partial', 'overdue'])
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
  updatePaymentStatus,
  voidPayment,
  getPaymentsByCase,
  getPaymentMethods,
  getUnpaidInvoices,
  getUnpaidInvoicesByCase,
  getCasesWithUnpaidInvoices,
  getPaymentStats,
};
