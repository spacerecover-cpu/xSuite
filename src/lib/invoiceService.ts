import { supabase, resolveTenantId } from './supabaseClient';
import type { Database } from '../types/database.types';
import { checkRateLimit, RATE_LIMITS } from './rateLimiter';
import { logAuditTrail } from './auditTrailService';
import { sanitizeUuidFields as sanitizeUuids, dropEmptyKeys } from './dataValidation';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { calculateInvoiceTotals, calculateInvoiceTotalsBase, convertToBase, roundMoney } from './financialMath';
import { resolveRateContext, getBaseCurrency, getCurrencyDecimals } from './currencyService';
import { deriveInvoiceStatus } from './invoiceStatus';
import { getInvoiceEditability, RESTRICTED_EDITABLE_FIELDS } from './invoicePermissions';
import { toDateInputValue } from './format';

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

// Caller-facing Invoice shape. A few fields remain UI-only (internal_notes,
// payment_terms, template_id, accounting_locale_id, currency_id) and
// `terms_and_conditions` maps to the DB `terms` column; title/client_reference/
// discount_type are now persisted columns.
export interface Invoice {
  id?: string;
  invoice_number?: string;
  case_id: string;
  customer_id?: string | null;
  company_id?: string | null;
  invoice_type: 'proforma' | 'tax_invoice';
  title?: string;
  invoice_date: string;
  due_date: string;
  status: string;
  client_reference?: string;
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  discount_type?: 'fixed' | 'percentage';
  discount_amount?: number;
  total_amount?: number;
  amount_paid?: number;
  balance_due?: number;
  /** @deprecated TODO(B8): not persisted — invoices table has no `currency_id` column (use `currency` text) */
  currency_id?: string | null;
  currency?: string | null;
  /** Frozen documentCurrency->base rate. Optional manual override; otherwise snapshotted by the service. */
  exchange_rate?: number;
  /** 'provider' | 'manual' | 'derived'. Set by the service from the rate context. */
  rate_source?: string;
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
  if (input.discount_type !== undefined) out.discount_type = input.discount_type;
  if (input.total_amount !== undefined) out.total_amount = input.total_amount;
  if (input.amount_paid !== undefined) out.amount_paid = input.amount_paid;
  if (input.balance_due !== undefined) out.balance_due = input.balance_due;
  if (input.title !== undefined) out.title = input.title;
  if (input.client_reference !== undefined) out.client_reference = input.client_reference;
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
    .is('deleted_at', null)
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

/**
 * Build the InvoiceFormModal `initialData` from a fetched invoice. Normalizes the
 * fields the form can't consume from a raw row: the `timestamptz` `invoice_date`
 * and `due_date` are formatted to the `yyyy-MM-dd` a date input needs, and the DB
 * `terms` column is mapped onto the form's `terms_and_conditions`. Without this
 * the dates and terms render blank on edit (apparent data loss). All other fields
 * pass through, so once title/client_reference/discount_type are persisted they
 * populate automatically.
 */
export const toInvoiceEditInitialData = (invoice: Record<string, unknown>): Record<string, unknown> => ({
  ...invoice,
  invoice_date: toDateInputValue(invoice.invoice_date as string | null | undefined),
  due_date: toDateInputValue(invoice.due_date as string | null | undefined),
  terms_and_conditions:
    (invoice.terms_and_conditions as string | null | undefined) ??
    (invoice.terms as string | null | undefined) ??
    '',
});

export const getNextInvoiceNumber = async (invoiceType?: 'proforma' | 'tax_invoice'): Promise<string> => {
  // Separate series per document family: proformas are not tax documents and
  // must not consume tax-invoice sequence numbers (sequential tax numbering —
  // EU VAT Art. 226 / GCC VAT). Tax invoices stay on the 'invoices' scope
  // (INVO-); proformas draw from 'proforma_invoices' (PRO-).
  if (invoiceType === 'proforma') {
    const { data, error } = await supabase.rpc('get_next_number', { p_scope: 'proforma_invoices' });
    if (error) throw error;
    return (data ?? '') as string;
  }
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
  const amountPaid = invoice.amount_paid ?? 0;

  // Snapshot the documentCurrency->base rate at the invoice date and freeze the
  // base-currency equivalents on the row, so cross-currency reports SUM(*_base)
  // correctly without re-converting history. Single-currency tenants get rate 1
  // (base == document) and never touch the rates table. Resolved BEFORE the totals
  // so header amounts round to the document currency's decimals (3 for OMR, 0 for JPY).
  const rc = await resolveRateContext(
    invoice.currency,
    invoice.invoice_date || new Date().toISOString().slice(0, 10),
    invoice.exchange_rate ? { rate: invoice.exchange_rate, source: invoice.rate_source as 'manual' | 'provider' | undefined } : null,
  );

  const { subtotal, taxAmount, totalAmount, amountDue } = calculateInvoiceTotals(
    items,
    invoice.discount_amount || 0,
    invoiceTaxRate,
    amountPaid,
    rc.documentDecimals,
  );
  const baseTotals = calculateInvoiceTotalsBase(
    { subtotal, taxAmount, totalAmount, amountPaid, amountDue },
    rc.rate,
    rc.baseDecimals,
  );

  // tenant_id must be a real uuid: the set_tenant_and_audit_fields trigger only
  // stamps it when NULL, and an empty string fails the uuid cast (22P02) before
  // the trigger fires. Resolve the authenticated tenant once for header + items.
  const tenantId = await resolveTenantId();
  const persistFields = pickInvoicePersistFields(invoice);
  const invoiceToInsert: InvoiceInsert = {
    ...persistFields,
    // Honour any caller-provided tenant_id, else the resolved tenant.
    tenant_id: persistFields.tenant_id ?? tenantId,
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
    amount_paid: amountPaid,
    balance_due: amountDue,
    currency: rc.documentCurrency,
    exchange_rate: rc.rate,
    rate_source: rc.rateSource,
    subtotal_base: baseTotals.subtotalBase,
    tax_amount_base: baseTotals.taxAmountBase,
    total_amount_base: baseTotals.totalAmountBase,
    amount_paid_base: baseTotals.amountPaidBase,
    balance_due_base: baseTotals.balanceDueBase,
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
    const itemTax = roundMoney(taxableAmount * (invoiceTaxRate / 100), rc.documentDecimals);
    const lineTotal = roundMoney(taxableAmount + itemTax, rc.documentDecimals);

    return {
      tenant_id: tenantId,
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
  // Enforce the restricted-edit business rule server-side (defense in depth — the
  // form also disables locked fields). Once an invoice is issued or has any payment,
  // only non-financial fields persist and line-item / total changes are ignored.
  const { data: lockRow } = await supabase
    .from('invoices')
    .select('status, payment_status, invoice_type, total_amount, amount_paid, balance_due, due_date')
    .eq('id', id)
    .maybeSingle();
  const editability = getInvoiceEditability(lockRow ?? {});
  if (editability.mode === 'none') {
    throw new Error(editability.reason || 'This invoice can no longer be edited.');
  }
  if (editability.mode === 'restricted') {
    const allowed = new Set<string>(RESTRICTED_EDITABLE_FIELDS);
    const filtered: Partial<Invoice> = {};
    for (const key of Object.keys(invoice)) {
      if (allowed.has(key)) (filtered as Record<string, unknown>)[key] = (invoice as Record<string, unknown>)[key];
    }
    const restrictedData = sanitizeUuidFields(pickInvoicePersistFields(filtered));
    const { data, error } = await supabase.from('invoices').update(restrictedData).eq('id', id).select().maybeSingle();
    if (error) throw error;
    return data;
  }

  let updateData: InvoiceUpdate = sanitizeUuidFields(pickInvoicePersistFields(invoice));

  if (items) {
    // Header totals now use the shared rounded helper (matching createInvoice).
    // Previously this path skipped rounding, so editing an invoice could shift
    // stored totals by sub-cent amounts versus what create stored.
    const invoiceTaxRate = invoice.tax_rate || 0;

    // Re-snapshot base amounts against the invoice's ALREADY-FROZEN rate — an edit
    // must not re-derive the booked rate (that would restate history). Only a caller
    // that explicitly changes the currency or supplies a manual override re-resolves.
    // We also coalesce amount_paid from the persisted row: a line-item edit that omits
    // amount_paid must NOT wipe recorded payments — otherwise raw amount_paid stays
    // but amount_paid_base/balance_due_base desync and the base stats mis-report a
    // partly-paid invoice.
    const { data: existing } = await supabase
      .from('invoices')
      .select('currency, exchange_rate, rate_source, amount_paid')
      .eq('id', id)
      .maybeSingle();

    const amountPaid = invoice.amount_paid ?? existing?.amount_paid ?? 0;

    // Resolve the (frozen) rate + document currency BEFORE the totals so header
    // amounts round to the document currency's decimals (3 for OMR, 0 for JPY) while
    // *_base rounds to the base currency's decimals. base never changes on an edit.
    const baseCurrency = await getBaseCurrency();
    const baseDecimals = await getCurrencyDecimals(baseCurrency);
    let rate = existing?.exchange_rate ?? 1;
    let rateSource = existing?.rate_source ?? 'derived';
    let docCurrency: string | null = existing?.currency ?? null;

    const currencyChanged = invoice.currency !== undefined && invoice.currency !== existing?.currency;
    if (invoice.exchange_rate || currencyChanged) {
      const rc = await resolveRateContext(
        invoice.currency ?? existing?.currency,
        invoice.invoice_date || new Date().toISOString().slice(0, 10),
        invoice.exchange_rate
          ? { rate: invoice.exchange_rate, source: invoice.rate_source as 'manual' | 'provider' | undefined }
          : null,
      );
      rate = rc.rate;
      rateSource = rc.rateSource;
      docCurrency = rc.documentCurrency;
    }

    const docDecimals = await getCurrencyDecimals(docCurrency ?? baseCurrency);
    const { subtotal, taxAmount, totalAmount, amountDue } = calculateInvoiceTotals(
      items,
      invoice.discount_amount || 0,
      invoiceTaxRate,
      amountPaid,
      docDecimals,
    );

    const baseTotals = calculateInvoiceTotalsBase(
      { subtotal, taxAmount, totalAmount, amountPaid, amountDue },
      rate,
      baseDecimals,
    );

    updateData = {
      ...updateData,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      balance_due: amountDue,
      exchange_rate: rate,
      rate_source: rateSource,
      ...(docCurrency != null ? { currency: docCurrency } : {}),
      subtotal_base: baseTotals.subtotalBase,
      tax_amount_base: baseTotals.taxAmountBase,
      total_amount_base: baseTotals.totalAmountBase,
      amount_paid_base: baseTotals.amountPaidBase,
      balance_due_base: baseTotals.balanceDueBase,
    };

    await supabase.from('invoice_line_items').update({ deleted_at: new Date().toISOString() }).eq('invoice_id', id);

    const tenantId = await resolveTenantId();
    const itemsWithInvoiceId: InvoiceLineItemInsert[] = items.map((item, index) => {
      const itemSubtotal = item.quantity * item.unit_price;
      const discountPct = item.discount_percent || 0;
      const discount = itemSubtotal * (discountPct / 100);
      const taxableAmount = itemSubtotal - discount;
      const itemTax = roundMoney(taxableAmount * (invoiceTaxRate / 100), docDecimals);
      const lineTotal = roundMoney(taxableAmount + itemTax, docDecimals);

      return {
        tenant_id: tenantId,
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

  // Defense-in-depth (Issue 2): an edit must never clear the invoice's ownership links.
  updateData = dropEmptyKeys(
    updateData as Record<string, unknown>,
    ['case_id', 'customer_id', 'company_id', 'created_by'],
  ) as InvoiceUpdate;

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
  // Server-side aggregate in BASE currency (replaces the previous fetch-all-then-reduce
  // over raw document amounts, which summed mixed currencies). The RPC reads
  // coalesce(total_amount_base, total_amount * exchange_rate), so it is correct both
  // before and after rows carry *_base, and it excludes soft-deleted rows.
  const { data, error } = await supabase.rpc(
    'get_invoice_stats_base',
    filters?.caseId ? { p_case_id: filters.caseId } : {},
  );

  if (error) throw error;

  const s = (data ?? {}) as Record<string, number | null>;
  return {
    total: Number(s.total ?? 0),
    draft: Number(s.draft ?? 0),
    sent: Number(s.sent ?? 0),
    paid: Number(s.paid ?? 0),
    partial: Number(s.partial ?? 0),
    overdue: Number(s.overdue ?? 0),
    proforma: Number(s.proforma ?? 0),
    taxInvoice: Number(s.taxInvoice ?? 0),
    totalValue: Number(s.totalValueBase ?? 0),
    totalPaid: Number(s.totalPaidBase ?? 0),
    totalOutstanding: Number(s.totalOutstandingBase ?? 0),
  };
};

export const convertQuoteToInvoice = async (
  quoteId: string,
  invoiceType: 'proforma' | 'tax_invoice',
  dueDate: string,
  additionalData?: Partial<Invoice>
) => {
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .maybeSingle();

  if (quoteError) throw quoteError;
  if (!quote) throw new Error('Quote not found');

  // LIVE items only — quote_items are soft-deleted on edit; an embedded read would
  // copy deleted rows into the converted invoice.
  const { data: quoteItems } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', quoteId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

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
    currency: quote.currency,
    terms: quote.terms ?? '',
    notes: quote.notes ?? '',
    converted_from_quote_id: quote.id,
    ...additionalData,
  };

  const items: InvoiceItem[] = (quoteItems ?? []).map((item) => ({
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
    .select('total_amount, amount_paid, invoice_type, customer_id, currency, exchange_rate')
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

  // Keep the invoice/payment base amounts consistent at the invoice's frozen rate.
  // (This legacy single-invoice path captures no realized FX; the canonical
  // paymentsService.allocatePaymentToInvoices path does.)
  const baseCurrency = await getBaseCurrency();
  const baseDecimals = await getCurrencyDecimals(baseCurrency);
  const tenantId = await resolveTenantId();
  const invoiceRate = invoice.exchange_rate ?? 1;
  const newAmountPaidBase = convertToBase(newAmountPaid, invoiceRate, baseDecimals);
  const newBalanceDueBase = convertToBase(newBalanceDue, invoiceRate, baseDecimals);

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
        tenant_id: tenantId,
        invoice_id: invoiceId,
        customer_id: invoice.customer_id,
        amount: paymentData.amount,
        payment_method_id: paymentData.payment_method,
        payment_date: paymentData.payment_date,
        reference: paymentData.reference_number,
        notes: paymentData.notes,
        status: 'completed',
        currency: invoice.currency ?? baseCurrency,
        exchange_rate: invoiceRate,
        rate_source: 'derived',
        amount_base: convertToBase(paymentData.amount, invoiceRate, baseDecimals),
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
      amount_paid_base: newAmountPaidBase,
      balance_due_base: newBalanceDueBase,
      status: newStatus,
    })
    .eq('id', invoiceId);

  if (updateError) throw updateError;

  return payment;
};

export interface PaymentHistoryEntry {
  id: string;
  payment_number: string | null;
  payment_date: string | null;
  amount: number;
  currency: string | null;
  method: string | null;
  reference: string | null;
  transaction_id: string | null;
  status: string | null;
  notes: string | null;
  recorded_by: string | null;
}

interface RawPaymentRow {
  id: string;
  payment_number?: string | null;
  payment_date?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  reference?: string | null;
  transaction_id?: string | null;
  status?: string | null;
  notes?: string | null;
  created_by?: string | null;
  payment_method?: { name: string | null } | null;
}

// Pure shaping of payment rows into the UI/PDF/portal payment-history trail.
// Kept separate from the fetch so it is unit-testable without Supabase.
export function mapPaymentHistory(
  rows: RawPaymentRow[],
  nameById: Record<string, string>,
): PaymentHistoryEntry[] {
  return rows.map((r) => ({
    id: r.id,
    payment_number: r.payment_number ?? null,
    payment_date: r.payment_date ?? null,
    amount: typeof r.amount === 'number' ? r.amount : Number(r.amount ?? 0),
    currency: r.currency ?? null,
    method: r.payment_method?.name ?? null,
    reference: r.reference ?? null,
    transaction_id: r.transaction_id ?? null,
    status: r.status ?? null,
    notes: r.notes ?? null,
    recorded_by: r.created_by ? (nameById[r.created_by] ?? null) : null,
  }));
}

// payments has no FK to profiles, so the recorder name is resolved with a second
// batched fetch and joined in `mapPaymentHistory`.
export const getPaymentHistory = async (invoiceId: string): Promise<PaymentHistoryEntry[]> => {
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, payment_number, payment_date, amount, currency, reference, transaction_id, status, notes, created_by, payment_method:master_payment_methods(name)',
    )
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .order('payment_date', { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as unknown as RawPaymentRow[];

  const ids = Array.from(new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v)));
  let nameById: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    nameById = Object.fromEntries(
      (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? '']),
    );
  }

  return mapPaymentHistory(rows, nameById);
};

export const convertProformaToTaxInvoice = async (
  proformaInvoiceId: string,
  dueDate?: string,
  notes?: string
) => {
  const rl = checkRateLimit(RATE_LIMITS.INVOICE_CONVERSION);
  if (!rl.allowed) {
    throw new Error(rl.message);
  }

  // Proforma INVOICE -> Tax INVOICE via the dedicated invoice RPC. The previous call sent
  // the invoice id to convert_proforma_to_tax_invoice(p_quote_id), which reads the quotes
  // table -> "Quote not found" (400). This RPC reads invoices: it creates a linked tax
  // invoice, copies line items, and marks the proforma converted — atomically.
  const { data, error } = await supabase.rpc('convert_proforma_invoice_to_tax_invoice', {
    p_invoice_id: proformaInvoiceId,
    p_due_date: dueDate || undefined,
    p_notes: notes || undefined,
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
  toInvoiceEditInitialData,
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
