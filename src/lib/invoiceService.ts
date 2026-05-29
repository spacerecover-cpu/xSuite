import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { checkRateLimit, RATE_LIMITS } from './rateLimiter';
import { logAuditTrail } from './auditTrailService';
import { sanitizeUuidFields as sanitizeUuids } from './dataValidation';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { calculateInvoiceTotals } from './financialMath';
import { deriveInvoiceStatus } from './invoiceStatus';

type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];
type InvoiceUpdate = Database['public']['Tables']['invoices']['Update'];
type InvoiceLineItemRow = Database['public']['Tables']['invoice_line_items']['Row'];
type InvoiceLineItemInsert = Database['public']['Tables']['invoice_line_items']['Insert'];

// FK-safe UUID fields. `template_id`, `accounting_locale_id`, `currency_id` removed from invoices
// schema in v1.0.0 — kept here only because callers may still pass them via Partial<Invoice>.
// They will be stripped in pickInvoicePersistFields() before any DB write.
const INVOICE_UUID_FIELDS = ['customer_id', 'company_id', 'case_id', 'created_by', 'bank_account_id', 'converted_from_quote_id'];
const sanitizeUuidFields = <T extends Record<string, unknown>>(data: T): T =>
  sanitizeUuids(data, INVOICE_UUID_FIELDS) as T;

export interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount_percent?: number;
  line_total?: number;
  sort_order?: number;
}

// Caller-facing Invoice shape. Several fields (title, client_reference, terms_and_conditions,
// discount_type, template_id, accounting_locale_id, currency_id, internal_notes, payment_terms,
// quote_id) no longer exist in the DB but are still consumed by InvoiceFormModal etc.
// TODO(B8): migrate callers off these fields, then drop them from this interface.
export interface Invoice {
  id?: string;
  invoice_number?: string;
  case_id: string;
  customer_id?: string | null;
  company_id?: string | null;
  invoice_type: 'proforma' | 'tax_invoice';
  /** @deprecated TODO(B8): not persisted — invoices table has no `title` column */
  title?: string;
  invoice_date: string;
  due_date: string;
  status: string;
  /** @deprecated TODO(B8): not persisted — invoices table has no `client_reference` column */
  client_reference?: string;
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  /** @deprecated TODO(B8): not persisted — invoices table has no `discount_type` column */
  discount_type?: 'fixed' | 'percentage';
  discount_amount?: number;
  total_amount?: number;
  amount_paid?: number;
  balance_due?: number;
  /** @deprecated TODO(B8): not persisted — invoices table has no `currency_id` column (use `currency` text) */
  currency_id?: string | null;
  currency?: string | null;
  /** @deprecated TODO(B8): not persisted — invoices table column is `terms`, not `terms_and_conditions` */
  terms_and_conditions?: string;
  notes?: string;
  /** @deprecated TODO(B8): not persisted — invoices table has no `internal_notes` column */
  internal_notes?: string;
  /** @deprecated TODO(B8): not persisted — invoices table has no `payment_terms` column */
  payment_terms?: string;
  sent_at?: string | null;
  created_by?: string;
  /** @deprecated TODO(B8): not persisted — invoices table has no `template_id` column */
  template_id?: string | null;
  /** @deprecated TODO(B8): not persisted — invoices table has no `accounting_locale_id` column */
  accounting_locale_id?: string | null;
  bank_account_id?: string | null;
  /** @deprecated TODO(B8): not persisted — DB column is `converted_from_quote_id` */
  quote_id?: string | null;
  converted_from_quote_id?: string | null;
  terms?: string | null;
  footer?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceWithDetails extends Invoice {
  cases?: {
    id: string;
    case_no: string;
    title: string;
  };
  customers_enhanced?: {
    id: string;
    customer_name: string;
    email: string;
    mobile_number: string;
  };
  companies?: {
    id: string;
    name: string;
    company_name: string | null;
    email: string;
    phone: string;
  };
  customer_associated_company?: {
    id: string;
    name: string;
    company_name: string | null;
  } | null;
  created_by_profile?: {
    id: string;
    full_name: string;
  };
  invoice_line_items?: InvoiceItem[];
  quote?: {
    id: string;
    quote_number: string;
  };
  bank_accounts?: {
    id: string;
    account_name: string;
    bank_name: string;
    account_number: string;
    iban: string;
    swift_code: string;
    branch_code: string;
  };
}

const DEFAULT_PAGE_SIZE = 100;

/** Whitelist Invoice fields → real `invoices` columns. Strips dead/deprecated fields. */
const pickInvoicePersistFields = (input: Partial<Invoice>): InvoiceUpdate => {
  const out: InvoiceUpdate = {};
  if (input.invoice_number !== undefined) out.invoice_number = input.invoice_number;
  if (input.case_id !== undefined) out.case_id = input.case_id;
  if (input.customer_id !== undefined) out.customer_id = input.customer_id;
  if (input.company_id !== undefined) out.company_id = input.company_id;
  if (input.invoice_type !== undefined) out.invoice_type = input.invoice_type;
  if (input.invoice_date !== undefined) out.invoice_date = input.invoice_date;
  if (input.due_date !== undefined) out.due_date = input.due_date;
  if (input.status !== undefined) out.status = input.status;
  if (input.subtotal !== undefined) out.subtotal = input.subtotal;
  if (input.tax_rate !== undefined) out.tax_rate = input.tax_rate;
  if (input.tax_amount !== undefined) out.tax_amount = input.tax_amount;
  if (input.discount_amount !== undefined) out.discount_amount = input.discount_amount;
  if (input.total_amount !== undefined) out.total_amount = input.total_amount;
  if (input.amount_paid !== undefined) out.amount_paid = input.amount_paid;
  if (input.balance_due !== undefined) out.balance_due = input.balance_due;
  if (input.notes !== undefined) out.notes = input.notes;
  if (input.bank_account_id !== undefined) out.bank_account_id = input.bank_account_id;
  if (input.currency !== undefined) out.currency = input.currency;
  if (input.terms !== undefined) out.terms = input.terms;
  if (input.footer !== undefined) out.footer = input.footer;
  if (input.sent_at !== undefined) out.sent_at = input.sent_at;
  if (input.created_by !== undefined) out.created_by = input.created_by;
  if (input.converted_from_quote_id !== undefined) {
    out.converted_from_quote_id = input.converted_from_quote_id;
  } else if (input.quote_id !== undefined) {
    out.converted_from_quote_id = input.quote_id;
  }
  // terms_and_conditions → terms (compat for legacy callers)
  if (input.terms_and_conditions !== undefined && input.terms === undefined) {
    out.terms = input.terms_and_conditions;
  }
  return out;
};

export const fetchInvoices = async (filters?: {
  status?: string;
  invoiceType?: string;
  search?: string;
  caseId?: string;
  customerId?: string;
  companyId?: string;
  page?: number;
  pageSize?: number;
}): Promise<InvoiceWithDetails[]> => {
  let query = supabase
    .from('invoices')
    .select(`
      *,
      cases (
        id,
        case_no,
        title
      ),
      customers_enhanced (
        id,
        customer_name,
        email,
        mobile_number
      ),
      companies (
        id,
        name,
        company_name,
        email,
        phone
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters?.invoiceType && filters.invoiceType !== 'all') {
    query = query.eq('invoice_type', filters.invoiceType);
  }

  if (filters?.search) {
    const s = sanitizeFilterValue(filters.search);
    query = query.or(`invoice_number.ilike.%${s}%,notes.ilike.%${s}%`);
  }

  if (filters?.caseId) {
    query = query.eq('case_id', filters.caseId);
  }

  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }

  if (filters?.companyId) {
    query = query.eq('company_id', filters.companyId);
  }

  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const page = filters?.page || 0;
  query = query.range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as unknown as InvoiceWithDetails[];
};

export const fetchInvoiceById = async (id: string): Promise<InvoiceWithDetails | null> => {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      cases (
        id,
        case_no,
        title,
        customer_id,
        company_id
      ),
      customers_enhanced (
        id,
        customer_name,
        email,
        mobile_number,
        phone,
        address,
        country_id,
        city_id,
        geo_countries(name),
        geo_cities(name)
      ),
      companies (
        id,
        name,
        company_name,
        email,
        phone,
        address,
        country_id,
        city_id,
        geo_countries(name),
        geo_cities(name)
      ),
      bank_accounts (
        id,
        account_name:name,
        bank_name,
        account_number,
        iban,
        swift_code,
        branch_code
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  let customerAssociatedCompany: { id: string; name: string; company_name: string | null } | null = null;
  if (data.customer_id) {
    const { data: relationshipData } = await supabase
      .from('customer_company_relationships')
      .select(`
        companies (id, name, company_name)
      `)
      .eq('customer_id', data.customer_id)
      .eq('is_primary', true)
      .maybeSingle();

    if (relationshipData?.companies) {
      const co = relationshipData.companies as unknown as {
        id: string;
        name: string;
        company_name: string | null;
      };
      customerAssociatedCompany = co;
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', id)
    .order('sort_order', { ascending: true });

  if (itemsError) throw itemsError;

  // Map DB columns (discount, total) → caller-facing InvoiceItem (discount_percent, line_total)
  const mappedItems: InvoiceItem[] = (items ?? []).map((it: InvoiceLineItemRow) => ({
    id: it.id,
    description: it.description,
    quantity: it.quantity ?? 0,
    unit_price: it.unit_price,
    tax_rate: it.tax_rate ?? 0,
    discount_percent: it.discount ?? 0,
    line_total: it.total,
    sort_order: it.sort_order ?? 0,
  }));

  return {
    ...data,
    invoice_line_items: mappedItems,
    customer_associated_company: customerAssociatedCompany,
  } as unknown as InvoiceWithDetails;
};

export const getNextInvoiceNumber = async (_invoiceType?: 'proforma' | 'tax_invoice'): Promise<string> => {
  // Live function signature: get_next_invoice_number() — takes no args.
  // _invoiceType retained for API compatibility but ignored.
  const { data, error } = await supabase.rpc('get_next_invoice_number');

  if (error) throw error;
  return (data ?? '') as string;
};

export const createInvoice = async (invoice: Partial<Invoice>, items: InvoiceItem[]) => {
  if (!invoice.case_id) {
    throw new Error('Case ID is required for invoice');
  }

  const invoiceType: 'proforma' | 'tax_invoice' = invoice.invoice_type ?? 'tax_invoice';
  const invoiceNumber = await getNextInvoiceNumber(invoiceType);

  const invoiceTaxRate = invoice.tax_rate || 0;
  const { subtotal, taxAmount, totalAmount, amountDue } = calculateInvoiceTotals(
    items,
    invoice.discount_amount || 0,
    invoiceTaxRate,
    invoice.amount_paid || 0,
  );

  const persistFields = pickInvoicePersistFields(invoice);
  const invoiceToInsert: InvoiceInsert = {
    ...persistFields,
    // tenant_id is auto-populated by the set_tenant_and_audit_fields trigger;
    // cast keeps the Insert type happy (tenant_id is declared NOT NULL in Insert).
    tenant_id: persistFields.tenant_id ?? ('' as string),
    invoice_number: invoiceNumber,
    invoice_type: invoiceType,
    is_proforma: invoiceType === 'proforma',
    case_id: invoice.case_id,
    status: invoice.status || 'draft',
    subtotal,
    tax_rate: invoiceTaxRate,
    tax_amount: taxAmount,
    discount_amount: invoice.discount_amount ?? 0,
    total_amount: totalAmount,
    amount_paid: invoice.amount_paid ?? 0,
    balance_due: amountDue,
  };

  const sanitizedInvoice = sanitizeUuidFields(invoiceToInsert);

  const { data: invoiceData, error: invoiceError } = await supabase
    .from('invoices')
    .insert([sanitizedInvoice])
    .select()
    .maybeSingle();

  if (invoiceError) throw invoiceError;
  if (!invoiceData) throw new Error('Invoice insert returned no row');

  const itemsWithInvoiceId: InvoiceLineItemInsert[] = items.map((item, index) => {
    const itemSubtotal = item.quantity * item.unit_price;
    const discountPct = item.discount_percent || 0;
    const discount = itemSubtotal * (discountPct / 100);
    const taxableAmount = itemSubtotal - discount;
    const itemTax = taxableAmount * (invoiceTaxRate / 100);
    const lineTotal = taxableAmount + itemTax;

    return {
      // tenant_id auto-set by trigger; same workaround as above
      tenant_id: '' as string,
      invoice_id: invoiceData.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_rate: invoiceTaxRate,
      tax_amount: itemTax,
      discount: discountPct,
      total: lineTotal,
      sort_order: index,
    };
  });

  const { error: itemsError } = await supabase
    .from('invoice_line_items')
    .insert(itemsWithInvoiceId);

  if (itemsError) throw itemsError;

  await logAuditTrail('create', 'invoices', invoiceData.id, {}, { invoice_number: invoiceData.invoice_number, total_amount: totalAmount });

  return invoiceData;
};

export const updateInvoice = async (id: string, invoice: Partial<Invoice>, items?: InvoiceItem[]) => {
  let updateData: InvoiceUpdate = sanitizeUuidFields(pickInvoicePersistFields(invoice));

  if (items) {
    // Header totals now use the shared rounded helper (matching createInvoice).
    // Previously this path skipped rounding, so editing an invoice could shift
    // stored totals by sub-cent amounts versus what create stored.
    const invoiceTaxRate = invoice.tax_rate || 0;
    const { subtotal, taxAmount, totalAmount, amountDue } = calculateInvoiceTotals(
      items,
      invoice.discount_amount || 0,
      invoiceTaxRate,
      invoice.amount_paid || 0,
    );

    updateData = {
      ...updateData,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      balance_due: amountDue,
    };

    await supabase.from('invoice_line_items').update({ deleted_at: new Date().toISOString() }).eq('invoice_id', id);

    const itemsWithInvoiceId: InvoiceLineItemInsert[] = items.map((item, index) => {
      const itemSubtotal = item.quantity * item.unit_price;
      const discountPct = item.discount_percent || 0;
      const discount = itemSubtotal * (discountPct / 100);
      const taxableAmount = itemSubtotal - discount;
      const itemTax = taxableAmount * (invoiceTaxRate / 100);
      const lineTotal = taxableAmount + itemTax;

      return {
        tenant_id: '' as string,
        invoice_id: id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: invoiceTaxRate,
        tax_amount: itemTax,
        discount: discountPct,
        total: lineTotal,
        sort_order: index,
      };
    });

    const { error: itemsError } = await supabase
      .from('invoice_line_items')
      .insert(itemsWithInvoiceId);

    if (itemsError) throw itemsError;
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updateData)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;

  await logAuditTrail('update', 'invoices', id, {}, updateData as Record<string, unknown>);

  return data;
};

export const deleteInvoice = async (id: string) => {
  const { error } = await supabase.from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};

export const updateInvoiceStatus = async (
  id: string,
  status: string,
  additionalData?: Partial<Invoice>
) => {
  const persistAdditional = additionalData ? pickInvoicePersistFields(additionalData) : {};
  const updatePayload: InvoiceUpdate = {
    status,
    ...persistAdditional,
  };

  const { data, error } = await supabase
    .from('invoices')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;

  await logAuditTrail('update', 'invoices', id, {}, updatePayload as Record<string, unknown>);

  return data;
};

export const getInvoiceStats = async (filters?: { caseId?: string }) => {
  let query = supabase.from('invoices').select('status, total_amount, amount_paid, balance_due, invoice_type');

  if (filters?.caseId) {
    query = query.eq('case_id', filters.caseId);
  }

  const { data: invoices, error } = await query;

  if (error) throw error;

  const rows = invoices ?? [];

  const stats = {
    total: rows.length,
    draft: rows.filter((i) => i.status === 'draft').length,
    sent: rows.filter((i) => i.status === 'sent').length,
    paid: rows.filter((i) => i.status === 'paid').length,
    partial: rows.filter((i) => i.status === 'partial').length,
    overdue: rows.filter((i) => i.status === 'overdue').length,
    proforma: rows.filter((i) => i.invoice_type === 'proforma').length,
    taxInvoice: rows.filter((i) => i.invoice_type === 'tax_invoice').length,
    totalValue: rows.reduce((sum, i) => sum + (i.total_amount || 0), 0),
    totalPaid: rows.reduce((sum, i) => sum + (i.amount_paid || 0), 0),
    totalOutstanding: rows.reduce((sum, i) => sum + (i.balance_due || 0), 0),
  };

  return stats;
};

export const convertQuoteToInvoice = async (
  quoteId: string,
  invoiceType: 'proforma' | 'tax_invoice',
  dueDate: string,
  additionalData?: Partial<Invoice>
) => {
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select(`
      *,
      quote_items (*)
    `)
    .eq('id', quoteId)
    .maybeSingle();

  if (quoteError) throw quoteError;
  if (!quote) throw new Error('Quote not found');

  if (!quote.case_id) {
    throw new Error('Quote must be linked to a case to convert to invoice');
  }

  // Note: `title`, `terms_and_conditions`, `template_id`, `accounting_locale_id` no longer
  // exist on `quotes`. We map `quote.terms` → `notes` (best-effort) and skip the rest.
  // TODO(B8): once callers handle the cleaner shape, drop the deprecated Invoice fields entirely.
  const newInvoice: Partial<Invoice> = {
    case_id: quote.case_id,
    customer_id: quote.customer_id,
    company_id: quote.company_id,
    invoice_type: invoiceType,
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: dueDate,
    status: 'draft',
    discount_amount: quote.discount_amount ?? 0,
    terms: quote.terms ?? '',
    notes: quote.notes ?? '',
    converted_from_quote_id: quote.id,
    ...additionalData,
  };

  const items: InvoiceItem[] = (quote.quote_items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity ?? 0,
    unit_price: item.unit_price,
    tax_rate: quote.tax_rate ?? 0,
  }));

  const createdInvoice = await createInvoice(newInvoice, items);

  const { error: updateError } = await supabase
    .from('quotes')
    .update({
      status: 'converted',
    })
    .eq('id', quoteId)
    .neq('status', 'converted');

  if (updateError) {
    throw new Error(`Failed to update quote status after conversion: ${updateError.message}`);
  }

  return createdInvoice;
};

export const getInvoicesByCaseId = async (caseId: string) => {
  // FK join to accounting_locales dropped (no FK constraint exists on invoices).
  // We surface tenant default currency formatting on each row for callers
  // (CaseFinancesTab consumes currency_symbol/position/decimal_places).
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const { data: defaultLocale } = await supabase
    .from('accounting_locales')
    .select('currency_symbol, currency_position, decimal_places')
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();

  const defaultCurrencySymbol = defaultLocale?.currency_symbol || 'USD';
  const defaultCurrencyPosition = defaultLocale?.currency_position || 'before';
  const defaultDecimalPlaces = defaultLocale?.decimal_places || 2;

  return (data ?? []).map((invoice) => ({
    ...invoice,
    currency_symbol: defaultCurrencySymbol,
    currency_position: defaultCurrencyPosition,
    decimal_places: defaultDecimalPlaces,
  }));
};

export const recordPayment = async (
  invoiceId: string,
  paymentData: {
    amount: number;
    payment_method: string;
    payment_date: string;
    reference_number?: string;
    notes?: string;
  }
) => {
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('total_amount, amount_paid, invoice_type, customer_id')
    .eq('id', invoiceId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!invoice) throw new Error('Invoice not found');

  // Only allow payment recording for tax invoices, not proforma invoices
  if (invoice.invoice_type !== 'tax_invoice') {
    throw new Error('Payments can only be recorded against Tax Invoices, not Proforma Invoices.');
  }

  const totalAmount = invoice.total_amount ?? 0;
  const previousPaid = invoice.amount_paid ?? 0;
  const newAmountPaid = previousPaid + paymentData.amount;
  const newBalanceDue = totalAmount - newAmountPaid;

  const newStatus = deriveInvoiceStatus(newAmountPaid, newBalanceDue, {
    partialLabel: 'partial',
    unpaidLabel: 'sent',
  });

  // payment_method here is the master_payment_methods UUID (caller already passes the FK).
  // The legacy `reference_number` arg maps to the `reference` column.
  // TODO(B8): the caller-facing parameter names still reference _number; update callers to
  //          send (payment_method_id, reference) and rename here.
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert([
      {
        tenant_id: '' as string, // auto-set by trigger
        invoice_id: invoiceId,
        customer_id: invoice.customer_id,
        amount: paymentData.amount,
        payment_method_id: paymentData.payment_method,
        payment_date: paymentData.payment_date,
        reference: paymentData.reference_number,
        notes: paymentData.notes,
        status: 'completed',
      },
    ])
    .select()
    .maybeSingle();

  if (paymentError) throw paymentError;

  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      amount_paid: newAmountPaid,
      balance_due: newBalanceDue,
      status: newStatus,
    })
    .eq('id', invoiceId);

  if (updateError) throw updateError;

  return payment;
};

export const getPaymentHistory = async (invoiceId: string) => {
  // payments has no FK to profiles, so the legacy embed has been removed.
  // TODO(B8): if a recorded-by profile is required for UI, do a separate fetch.
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: false });

  if (error) throw error;
  return data ?? [];
};

export const convertProformaToTaxInvoice = async (
  proformaId: string,
  _dueDate?: string,
  _notes?: string
) => {
  const rl = checkRateLimit(RATE_LIMITS.INVOICE_CONVERSION);
  if (!rl.allowed) {
    throw new Error(rl.message);
  }

  // Live RPC signature: convert_proforma_to_tax_invoice(p_quote_id uuid) returns uuid.
  // _dueDate / _notes kept for API back-compat but ignored — TODO(B8) update callers.
  const { data, error } = await supabase.rpc('convert_proforma_to_tax_invoice', {
    p_quote_id: proformaId,
  });

  if (error) throw error;
  return data;
};

export const getConversionHistory = async (_proformaId: string) => {
  // TODO(B8): `invoice_conversion_history` table was removed in v1.0.0. Reconstruct from
  // `converted_from_quote_id` chain when callers actually need history. For now return null
  // so InvoiceDetailPage can render an empty state without crashing.
  return null;
};

// Type-only import keeps pdfService.ts out of the static graph — the
// runtime pdfmake-libs chunk only loads when a user actually clicks
// "Download Invoice PDF". invoiceService is imported by InvoicesListPage
// and CaseDetail (transitively), so without this lazy boundary every
// authenticated user pays the 2 MB pdfmake cost on first navigation.
import type { PDFGenerationResult, PDFBlobResult } from './pdf/pdfService';

export async function generateInvoicePDF(invoiceId: string, download: boolean = true): Promise<PDFGenerationResult> {
  const { generateInvoice } = await import('./pdf/pdfService');
  return generateInvoice(invoiceId, download);
}

export async function generateInvoicePDFBlob(invoiceId: string): Promise<PDFBlobResult> {
  const { generateInvoiceAsBlob } = await import('./pdf/pdfService');
  return generateInvoiceAsBlob(invoiceId);
}

// Per-row outcome of bulkSendInvoiceEmails. Callers want all three
// states so they can report a useful summary: "5 sent, 2 skipped
// (no email), 1 failed".
export interface BulkSendInvoiceResult {
  invoiceId: string;
  invoiceNumber: string | null;
  status: 'sent' | 'skipped' | 'failed';
  error?: string;
}

// Sequentially email each selected invoice to its customer's address.
// Sequential because:
//   1. The client-side rate limiter caps email send at 5/min — parallel
//      hits would all race past the gate at once and then fail in a
//      cluster, leaving partial state.
//   2. PDF generation is heavy. Serializing keeps memory predictable
//      and gives the progress callback meaningful "done of total" steps.
// Returns one result per invoice; never throws for a single-row
// failure (callers want the summary). Throws only if the initial
// fetch fails.
export async function bulkSendInvoiceEmails(
  invoiceIds: string[],
  onProgress?: (done: number, total: number, latest: BulkSendInvoiceResult) => void,
): Promise<BulkSendInvoiceResult[]> {
  // Lazy-load the email transport + template helpers so this code
  // path doesn't drag them into the invoice-service main bundle.
  // Templates are tiny but emailDocumentService also pulls rateLimiter.
  const [{ sendDocumentEmail }, { getEmailTemplate }] = await Promise.all([
    import('./emailDocumentService'),
    import('./emailTemplates'),
  ]);

  const { data: rows, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, case_id, customers_enhanced:customer_id(customer_name, email)',
    )
    .in('id', invoiceIds)
    .is('deleted_at', null);
  if (error) throw error;

  const results: BulkSendInvoiceResult[] = [];
  const total = rows?.length ?? 0;
  let done = 0;

  for (const inv of rows ?? []) {
    const customer = inv.customers_enhanced as {
      customer_name?: string;
      email?: string | null;
    } | null;
    const email = customer?.email?.trim();
    let result: BulkSendInvoiceResult;

    if (!email) {
      result = {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        status: 'skipped',
        error: 'Customer has no email',
      };
    } else {
      try {
        const pdfResult = await generateInvoicePDFBlob(inv.id);
        if (!pdfResult.success || !pdfResult.blob || !pdfResult.filename) {
          result = {
            invoiceId: inv.id,
            invoiceNumber: inv.invoice_number,
            status: 'failed',
            error: pdfResult.error || 'PDF generation failed',
          };
        } else {
          const template = getEmailTemplate('invoice', {
            customerName: customer?.customer_name || 'Valued Customer',
            caseNumber: '',
            companyName: '',
            documentType: 'invoice',
          });
          const send = await sendDocumentEmail({
            to: email,
            subject: template.subject,
            body: template.body,
            blob: pdfResult.blob,
            filename: pdfResult.filename,
            caseId: inv.case_id || undefined,
            documentType: 'invoice',
          });
          if (send.success) {
            // Mark sent. Don't fail the whole row if the status update
            // errors — the email already went out; surfacing a noisy
            // failure would scare the user into resending.
            await supabase
              .from('invoices')
              .update({ sent_at: new Date().toISOString(), status: 'sent' })
              .eq('id', inv.id);
            result = {
              invoiceId: inv.id,
              invoiceNumber: inv.invoice_number,
              status: 'sent',
            };
          } else {
            result = {
              invoiceId: inv.id,
              invoiceNumber: inv.invoice_number,
              status: 'failed',
              error: send.error || 'Send failed',
            };
          }
        }
      } catch (err) {
        result = {
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }

    results.push(result);
    done += 1;
    onProgress?.(done, total, result);
  }

  return results;
}

export const invoiceService = {
  fetchInvoices,
  fetchInvoiceById,
  getNextInvoiceNumber,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  updateInvoiceStatus,
  getInvoiceStats,
  recordPayment,
  getPaymentHistory,
  convertQuoteToInvoice,
  getInvoicesByCaseId,
  convertProformaToTaxInvoice,
  getConversionHistory,
  generateInvoicePDF,
  generateInvoicePDFBlob,
  bulkSendInvoiceEmails,
};
