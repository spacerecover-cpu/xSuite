import { supabase, resolveTenantId } from './supabaseClient';
import type { Database } from '../types/database.types';
import { logAuditTrail } from './auditTrailService';
import { logQuoteCreated, logQuoteStatusChanged } from './chainOfCustodyService';
import { sanitizeUuidFields as sanitizeUuids, dropEmptyKeys } from './dataValidation';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { logger } from './logger';
import { calculateQuoteTotals, calculateQuoteTotalsBase, roundMoney } from './financialMath';
import { resolveRateContext, getBaseCurrency, getCurrencyDecimals } from './currencyService';
import { toDateInputValue } from './format';
import { getTenantConfig } from './tenantConfigService';

type QuoteInsert = Database['public']['Tables']['quotes']['Insert'];
type QuoteUpdate = Database['public']['Tables']['quotes']['Update'];
type QuoteItemRow = Database['public']['Tables']['quote_items']['Row'];
type QuoteItemInsert = Database['public']['Tables']['quote_items']['Insert'];

// FK-safe UUID fields — coerced empty-string -> null before any DB write so an
// unset <select> can't trip the uuid cast (22P02). `template_id` /
// `accounting_locale_id` remain non-persisted (no columns) and are dropped by
// pickQuotePersistFields(); `bank_account_id` is now a real FK column.
const QUOTE_UUID_FIELDS = ['customer_id', 'company_id', 'case_id', 'created_by', 'approved_by', 'converted_to_invoice_id', 'bank_account_id'];
const sanitizeUuidFields = <T extends Record<string, unknown>>(data: T): T =>
  sanitizeUuids(data, QUOTE_UUID_FIELDS) as T;

export interface QuoteItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  /** Caller-facing alias for `total` (DB column). Maps both ways. */
  line_total?: number;
  sort_order?: number;
}

// Caller-facing Quote shape. A few fields remain UI-only (description,
// template_id, accounting_locale_id, converted_to_case_id) and `terms_and_conditions`
// maps to the DB `terms` column; title/client_reference/discount_type/bank_account_id
// are now persisted columns.
export interface Quote {
  id?: string;
  quote_number?: string;
  case_id: string;
  customer_id: string | null;
  company_id: string | null;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
  title?: string;
  /** @deprecated TODO(B8): not persisted — quotes table has no `description` column */
  description?: string;
  valid_until?: string;
  client_reference?: string;
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  discount_amount?: number;
  discount_type?: 'amount' | 'percentage' | 'fixed';
  total_amount?: number;
  /** @deprecated TODO(B8): not persisted — quotes table column is `terms`, not `terms_and_conditions` */
  terms_and_conditions?: string;
  terms?: string | null;
  notes?: string;
  created_by?: string;
  updated_by?: string | null;
  approved_by?: string;
  /** @deprecated TODO(B8): not persisted — quotes table has no `converted_to_case_id` column */
  converted_to_case_id?: string;
  converted_to_invoice_id?: string | null;
  /** @deprecated TODO(B8): not persisted — quotes table has no `template_id` column */
  template_id?: string | null;
  /** @deprecated TODO(B8): not persisted — quotes table has no `accounting_locale_id` column */
  accounting_locale_id?: string | null;
  bank_account_id?: string | null;
  currency?: string | null;
  /** Frozen documentCurrency->base rate. Optional manual override; otherwise snapshotted by the service. */
  exchange_rate?: number;
  /** 'provider' | 'manual' | 'derived'. Set by the service from the rate context. */
  rate_source?: string;
  created_at?: string;
  updated_at?: string;
}

export interface QuoteWithDetails extends Quote {
  cases?: {
    id: string;
    case_no: string;
    title: string;
  };
  customers?: {
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
  bank_accounts?: {
    id: string;
    account_name: string;
    bank_name: string;
    account_number: string;
    iban?: string;
    swift_code?: string;
    branch_code?: string;
  };
  quote_items?: QuoteItem[];
}

const DEFAULT_PAGE_SIZE = 100;

/** Whitelist Quote fields → real `quotes` columns. Strips dead/deprecated fields. */
const pickQuotePersistFields = (input: Partial<Quote>): QuoteUpdate => {
  const out: QuoteUpdate = {};
  if (input.quote_number !== undefined) out.quote_number = input.quote_number;
  if (input.case_id !== undefined) out.case_id = input.case_id;
  if (input.customer_id !== undefined) out.customer_id = input.customer_id;
  if (input.company_id !== undefined) out.company_id = input.company_id;
  if (input.status !== undefined) out.status = input.status;
  if (input.valid_until !== undefined) out.valid_until = input.valid_until;
  if (input.subtotal !== undefined) out.subtotal = input.subtotal;
  if (input.tax_rate !== undefined) out.tax_rate = input.tax_rate;
  if (input.tax_amount !== undefined) out.tax_amount = input.tax_amount;
  if (input.discount_amount !== undefined) out.discount_amount = input.discount_amount;
  if (input.discount_type !== undefined) out.discount_type = input.discount_type;
  if (input.total_amount !== undefined) out.total_amount = input.total_amount;
  if (input.title !== undefined) out.title = input.title;
  if (input.client_reference !== undefined) out.client_reference = input.client_reference;
  if (input.bank_account_id !== undefined) out.bank_account_id = input.bank_account_id;
  if (input.notes !== undefined) out.notes = input.notes;
  if (input.created_by !== undefined) out.created_by = input.created_by;
  if (input.approved_by !== undefined) out.approved_by = input.approved_by;
  if (input.converted_to_invoice_id !== undefined) out.converted_to_invoice_id = input.converted_to_invoice_id;
  if (input.currency !== undefined) out.currency = input.currency;
  // terms_and_conditions → terms (compat for legacy callers)
  if (input.terms !== undefined) {
    out.terms = input.terms;
  } else if (input.terms_and_conditions !== undefined) {
    out.terms = input.terms_and_conditions;
  }
  return out;
};

export const fetchQuotes = async (filters?: {
  status?: string;
  search?: string;
  customerId?: string;
  companyId?: string;
  caseId?: string;
  page?: number;
  pageSize?: number;
}): Promise<QuoteWithDetails[]> => {
  try {
    let query = supabase
      .from('quotes')
      .select(`
        *,
        cases:cases!case_id (
          id,
          case_no,
          title
        ),
        customers:customers_enhanced (
          id,
          customer_name,
          email,
          mobile_number
        ),
        companies:companies (
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

    if (filters?.search) {
      const s = sanitizeFilterValue(filters.search);
    query = query.or(`quote_number.ilike.%${s}%,title.ilike.%${s}%`);
    }

    if (filters?.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }

    if (filters?.companyId) {
      query = query.eq('company_id', filters.companyId);
    }

    if (filters?.caseId) {
      query = query.eq('case_id', filters.caseId);
    }

    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
    const page = filters?.page || 0;
    query = query.range(page * pageSize, (page + 1) * pageSize - 1);

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching quotes:', error);
      throw new Error(`Failed to fetch quotes: ${error.message}`);
    }

    return (data ?? []) as unknown as QuoteWithDetails[];
  } catch (error: unknown) {
    logger.error('Fetch quotes failed:', error);
    throw error;
  }
};

export const fetchQuoteById = async (id: string): Promise<QuoteWithDetails | null> => {
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      *,
      cases!case_id (
        id,
        case_no,
        title,
        customer_id,
        company_id
      ),
      customers:customers_enhanced (
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
        address
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
      .is('deleted_at', null)
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
    .from('quote_items')
    .select('*')
    .eq('quote_id', id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (itemsError) throw itemsError;

  // Map DB column `total` → caller-facing `line_total` (QuoteDocument and other consumers expect this).
  const mappedItems: QuoteItem[] = (items ?? []).map((it: QuoteItemRow) => ({
    id: it.id,
    description: it.description,
    quantity: it.quantity ?? 0,
    unit_price: it.unit_price,
    line_total: it.total,
    sort_order: it.sort_order ?? 0,
  }));

  return {
    ...data,
    quote_items: mappedItems,
    customer_associated_company: customerAssociatedCompany,
  } as unknown as QuoteWithDetails;
};

/**
 * Build the QuoteFormModal `initialData` from a fetched quote. Normalizes the two
 * fields the form can't consume from a raw row: the `timestamptz` `valid_until`
 * is formatted to the `yyyy-MM-dd` a date input needs, and the DB `terms` column
 * is mapped onto the form's `terms_and_conditions`. Without this the date and
 * terms render blank on edit (apparent data loss). All other fields pass through,
 * so once title/client_reference/discount_type/bank_account_id are persisted they
 * populate automatically.
 */
export const toQuoteEditInitialData = (quote: Record<string, unknown>): Record<string, unknown> => ({
  ...quote,
  valid_until: toDateInputValue(quote.valid_until as string | null | undefined),
  terms_and_conditions:
    (quote.terms_and_conditions as string | null | undefined) ??
    (quote.terms as string | null | undefined) ??
    '',
});

export const getNextQuoteNumber = async () => {
  const { data, error } = await supabase.rpc('get_next_number', {
    p_scope: 'quote',
  });

  if (error) {
    logger.error('Error generating quote number:', error);
    if (error.message?.includes('not found in the schema cache')) {
      throw new Error('Quote numbering system is not configured. Please contact your system administrator.');
    }
    if (error.message?.includes('Number sequence not found')) {
      throw new Error('Quote number sequence not found. Please configure it in Settings > System & Numbers.');
    }
    throw new Error(`Failed to generate quote number: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to generate quote number. Please try again or contact support.');
  }

  return data as string;
};

export const createQuote = async (quote: Quote, items: QuoteItem[]) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated. Please log in and try again.');
    }

    if (!quote.case_id) {
      throw new Error('Case ID is required to create a quote.');
    }

    if (!quote.customer_id && !quote.company_id) {
      throw new Error('Either customer or company must be specified for the quote.');
    }

    if (!items || items.length === 0) {
      throw new Error('At least one line item is required.');
    }

    const quoteNumber = await getNextQuoteNumber();
    if (!quoteNumber) {
      throw new Error('Failed to generate quote number. Please try again.');
    }

    // Snapshot the documentCurrency->base rate at the quote date and freeze the
    // base equivalents (single-currency tenants get rate 1, base == document).
    // Resolved BEFORE the totals so header amounts round to the document currency's
    // decimals (3 for OMR, 0 for JPY) while base rounds to the base currency's.
    const rc = await resolveRateContext(
      quote.currency,
      new Date().toISOString().slice(0, 10),
      quote.exchange_rate
        ? { rate: quote.exchange_rate, source: quote.rate_source as 'manual' | 'provider' | undefined }
        : null,
    );

    const { subtotal, taxAmount, totalAmount } = calculateQuoteTotals(
      items,
      quote.discount_type,
      quote.discount_amount || 0,
      quote.tax_rate || 0,
      rc.documentDecimals,
    );
    const baseTotals = calculateQuoteTotalsBase({ subtotal, taxAmount, totalAmount }, rc.rate, rc.baseDecimals);

    // tenant_id must be a real uuid: the set_tenant_and_audit_fields trigger only
    // stamps it when NULL, and an empty string fails the uuid cast (22P02) before
    // the trigger fires. Resolve the authenticated tenant once for header + items.
    const tenantId = await resolveTenantId();
    const persistFields = pickQuotePersistFields(quote);
    const quoteToInsertRaw: QuoteInsert = {
      ...persistFields,
      // Honour any caller-provided tenant_id, else the resolved tenant.
      tenant_id: persistFields.tenant_id ?? tenantId,
      case_id: quote.case_id,
      customer_id: quote.customer_id || null,
      company_id: quote.company_id || null,
      status: quote.status || 'draft',
      valid_until: quote.valid_until || null,
      tax_rate: quote.tax_rate || 0,
      discount_amount: quote.discount_amount || 0,
      notes: quote.notes || null,
      quote_number: quoteNumber,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      currency: rc.documentCurrency,
      exchange_rate: rc.rate,
      rate_source: rc.rateSource,
      subtotal_base: baseTotals.subtotalBase,
      tax_amount_base: baseTotals.taxAmountBase,
      total_amount_base: baseTotals.totalAmountBase,
      created_by: user.id,
    };
    const quoteToInsert = sanitizeUuidFields(quoteToInsertRaw as Record<string, unknown>) as QuoteInsert;

    const { data: quoteData, error: quoteError } = await supabase
      .from('quotes')
      .insert([quoteToInsert])
      .select()
      .maybeSingle();

    if (quoteError) {
      logger.error('Error creating quote:', quoteError);
      if (quoteError.message.includes('duplicate')) {
        throw new Error('A quote with this number already exists. Please try again.');
      }
      if (quoteError.message.includes('foreign key')) {
        throw new Error('Invalid case, customer, or company reference. Please check your data.');
      }
      if (quoteError.code === '42501') {
        throw new Error('You do not have permission to create quotes for this case.');
      }
      throw new Error(`Failed to create quote: ${quoteError.message}`);
    }

    if (!quoteData || !quoteData.id) {
      throw new Error('Quote was not created successfully. Please try again.');
    }

    const itemsWithQuoteId: QuoteItemInsert[] = items.map((item, index) => {
      const total = roundMoney(item.quantity * item.unit_price, rc.documentDecimals);
      return {
        tenant_id: tenantId,
        quote_id: quoteData.id,
        description: item.description.trim(),
        quantity: item.quantity,
        unit_price: item.unit_price,
        total,
        sort_order: index,
      };
    });

    const { error: itemsError } = await supabase
      .from('quote_items')
      .insert(itemsWithQuoteId);

    if (itemsError) {
      logger.error('Error creating quote items:', itemsError);
      await supabase.from('quotes').update({ deleted_at: new Date().toISOString() }).eq('id', quoteData.id);
      throw new Error(`Failed to add quote items: ${itemsError.message}`);
    }

    await logAuditTrail('create', 'quotes', quoteData.id, {}, { quote_number: quoteData.quote_number, total_amount: quoteData.total_amount });

    // Forensic ledger: quotes are always case-linked (guarded above). A ledger
    // failure must not abort the already-created quote — log and continue.
    try {
      await logQuoteCreated({
        caseId: quote.case_id,
        quoteNo: quoteData.quote_number ?? quoteNumber,
        total: totalAmount,
        subtotal,
        discount: quote.discount_amount || 0,
        tax: taxAmount,
      });
    } catch (custodyError) {
      logger.error('Quote created but chain-of-custody event failed:', custodyError);
    }

    return quoteData;
  } catch (error: unknown) {
    logger.error('Quote creation failed:', error);
    throw error;
  }
};

export const updateQuote = async (id: string, quote: Partial<Quote>, items?: QuoteItem[]) => {
  let updateData: QuoteUpdate = sanitizeUuidFields(
    pickQuotePersistFields(quote) as Record<string, unknown>
  ) as QuoteUpdate;

  if (items) {
    // Re-snapshot base against the quote's frozen rate (see updateInvoice rationale).
    // Resolve currency/rate BEFORE the totals so header amounts round to the document
    // currency's decimals; base never changes on an edit.
    const { data: existing } = await supabase
      .from('quotes')
      .select('currency, exchange_rate, rate_source')
      .eq('id', id)
      .maybeSingle();

    const baseCurrency = await getBaseCurrency();
    const baseDecimals = await getCurrencyDecimals(baseCurrency);
    let rate = existing?.exchange_rate ?? 1;
    let rateSource = existing?.rate_source ?? 'derived';
    let docCurrency: string | null = existing?.currency ?? null;

    const currencyChanged = quote.currency !== undefined && quote.currency !== existing?.currency;
    if (quote.exchange_rate || currencyChanged) {
      const rc = await resolveRateContext(
        quote.currency ?? existing?.currency,
        new Date().toISOString().slice(0, 10),
        quote.exchange_rate
          ? { rate: quote.exchange_rate, source: quote.rate_source as 'manual' | 'provider' | undefined }
          : null,
      );
      rate = rc.rate;
      rateSource = rc.rateSource;
      docCurrency = rc.documentCurrency;
    }

    const docDecimals = await getCurrencyDecimals(docCurrency ?? baseCurrency);
    const { subtotal, taxAmount, totalAmount } = calculateQuoteTotals(
      items,
      quote.discount_type,
      quote.discount_amount || 0,
      quote.tax_rate || 0,
      docDecimals,
    );

    const baseTotals = calculateQuoteTotalsBase({ subtotal, taxAmount, totalAmount }, rate, baseDecimals);

    updateData = {
      ...updateData,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      exchange_rate: rate,
      rate_source: rateSource,
      ...(docCurrency != null ? { currency: docCurrency } : {}),
      subtotal_base: baseTotals.subtotalBase,
      tax_amount_base: baseTotals.taxAmountBase,
      total_amount_base: baseTotals.totalAmountBase,
    };

    await supabase.from('quote_items').update({ deleted_at: new Date().toISOString() }).eq('quote_id', id);

    const tenantId = await resolveTenantId();
    const itemsWithQuoteId: QuoteItemInsert[] = items.map((item, index) => {
      const total = roundMoney(item.quantity * item.unit_price, docDecimals);
      return {
        tenant_id: tenantId,
        quote_id: id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total,
        sort_order: index,
      };
    });

    const { error: itemsError } = await supabase
      .from('quote_items')
      .insert(itemsWithQuoteId);

    if (itemsError) throw itemsError;
  }

  // Defense-in-depth (Issue 2): an edit must never clear the quote's ownership links.
  updateData = dropEmptyKeys(
    updateData as Record<string, unknown>,
    ['case_id', 'customer_id', 'company_id', 'created_by'],
  ) as QuoteUpdate;

  const { data, error } = await supabase
    .from('quotes')
    .update(updateData)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;

  await logAuditTrail('update', 'quotes', id, {}, updateData as Record<string, unknown>);

  return data;
};

export const deleteQuote = async (id: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { error } = await supabase
    .from('quotes')
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
};

export const restoreQuote = async (id: string) => {
  const { error } = await supabase
    .from('quotes')
    .update({
      deleted_at: null,
    })
    .eq('id', id);

  if (error) throw error;
};

export const permanentDeleteQuote = async (id: string) => {
  const { error } = await supabase.from('quotes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};

export const fetchDeletedQuotes = async () => {
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      *,
      cases!case_id (
        id,
        case_no,
        title
      ),
      customers:customers_enhanced (
        id,
        customer_name,
        email,
        mobile_number
      ),
      companies:companies (
        id,
        company_name,
        email,
        phone
      )
    `)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as QuoteWithDetails[];
};

export const updateQuoteStatus = async (
  id: string,
  status: Quote['status'],
  additionalData?: Partial<Quote>
) => {
  // Prior state for the audit + custody trail (status transition, case linkage).
  const { data: before } = await supabase
    .from('quotes')
    .select('status, case_id, quote_number')
    .eq('id', id)
    .maybeSingle();

  const persistAdditional = additionalData ? pickQuotePersistFields(additionalData) : {};
  const updatePayload: QuoteUpdate = {
    status,
    ...persistAdditional,
  };

  const { data, error } = await supabase
    .from('quotes')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;

  await logAuditTrail('update', 'quotes', id, {}, updatePayload as Record<string, unknown>);

  if (before?.case_id && before.status !== status) {
    try {
      await logQuoteStatusChanged({
        caseId: before.case_id,
        quoteNo: before.quote_number ?? id,
        oldStatus: before.status ?? 'unknown',
        newStatus: status ?? 'unknown',
      });
    } catch (custodyError) {
      logger.error('Quote status changed but chain-of-custody event failed:', custodyError);
    }
  }

  return data;
};

export const getQuoteStats = async () => {
  try {
    // Money totals aggregate the BASE-currency column (falling back to
    // total_amount * exchange_rate until a row carries total_amount_base), so the
    // figures are correct across currencies. We aggregate in JS rather than via
    // get_quote_stats_base because that RPC does not expose sentValue. Soft-deleted
    // quotes are now excluded (the previous query counted them).
    const { data: quotes, error } = await supabase
      .from('quotes')
      .select('status, total_amount, total_amount_base, exchange_rate')
      .is('deleted_at', null);

    if (error) {
      logger.error('Error fetching quote stats:', error);
      throw new Error(`Failed to fetch quote statistics: ${error.message}`);
    }

    const quotesList = quotes || [];
    const baseValue = (q: { total_amount: number | null; total_amount_base: number | null; exchange_rate: number | null }) =>
      Number(q.total_amount_base ?? (q.total_amount ?? 0) * (q.exchange_rate ?? 1));

    const stats = {
      total: quotesList.length,
      draft: quotesList.filter((q) => q.status === 'draft').length,
      sent: quotesList.filter((q) => q.status === 'sent').length,
      accepted: quotesList.filter((q) => q.status === 'accepted').length,
      rejected: quotesList.filter((q) => q.status === 'rejected').length,
      expired: quotesList.filter((q) => q.status === 'expired').length,
      converted: quotesList.filter((q) => q.status === 'converted').length,
      totalValue: quotesList.reduce((sum, q) => sum + baseValue(q), 0),
      sentValue: quotesList
        .filter((q) => q.status === 'sent')
        .reduce((sum, q) => sum + baseValue(q), 0),
      acceptedValue: quotesList
        .filter((q) => q.status === 'accepted')
        .reduce((sum, q) => sum + baseValue(q), 0),
    };

    return stats;
  } catch (error: unknown) {
    logger.error('Get quote stats failed:', error);
    return {
      total: 0,
      draft: 0,
      sent: 0,
      accepted: 0,
      rejected: 0,
      expired: 0,
      converted: 0,
      totalValue: 0,
      sentValue: 0,
      acceptedValue: 0,
    };
  }
};

export const duplicateQuote = async (sourceId: string) => {
  const sourceQuote = await fetchQuoteById(sourceId);
  if (!sourceQuote) throw new Error('Source quote not found');

  // Note: title/description/terms_and_conditions/template_id/accounting_locale_id/bank_account_id
  // are no longer persisted (columns removed in v1.0.0). Carry forward only fields that map to
  // real `quotes` columns. `terms` is the canonical replacement for `terms_and_conditions`.
  const newQuote: Quote = {
    case_id: sourceQuote.case_id,
    customer_id: sourceQuote.customer_id,
    company_id: sourceQuote.company_id,
    status: 'draft',
    valid_until: sourceQuote.valid_until,
    tax_rate: sourceQuote.tax_rate,
    discount_amount: sourceQuote.discount_amount,
    terms: sourceQuote.terms ?? sourceQuote.terms_and_conditions ?? null,
    notes: sourceQuote.notes,
    currency: sourceQuote.currency,
  };

  const items: QuoteItem[] =
    sourceQuote.quote_items?.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })) ?? [];

  return createQuote(newQuote, items);
};

export const getQuotesByCaseId = async (caseId: string) => {
  // FK-based joins removed: `quotes` no longer has accounting_locale_id / bank_account_id columns,
  // and PostgREST cannot auto-join without an FK. We surface tenant default currency formatting
  // on each row for callers (CaseFinancesTab consumes currency_symbol/position/decimal_places).
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Currency from the Country Engine (single source of truth), not the legacy
  // accounting_locales table. Derived from the rows' tenant_id; never defaults to USD.
  const cur = data && data.length > 0 ? (await getTenantConfig(data[0].tenant_id)).currency : null;
  const defaultCurrencySymbol = cur ? (cur.symbol || (typeof cur.code === 'string' ? cur.code : '')) : '';
  const defaultCurrencyPosition = cur?.position ?? 'before';
  const defaultDecimalPlaces = cur?.decimalPlaces ?? 2;

  return (data ?? []).map((quote) => ({
    ...quote,
    currency_symbol: defaultCurrencySymbol,
    currency_position: defaultCurrencyPosition,
    decimal_places: defaultDecimalPlaces,
  }));
};

// Same lazy boundary as invoiceService — pdfService transitively pulls
// the 2 MB pdfmake-libs chunk via pdf/fonts. Keeping this import
// type-only lets QuotesListPage and CaseDetail mount without the cost.
import type { PDFGenerationResult, PDFBlobResult } from './pdf/pdfService';

export async function generateQuotePDF(quoteId: string, download: boolean = true): Promise<PDFGenerationResult> {
  const { generateQuote } = await import('./pdf/pdfService');
  return generateQuote(quoteId, download);
}

export async function generateQuotePDFBlob(quoteId: string): Promise<PDFBlobResult> {
  const { generateQuoteAsBlob } = await import('./pdf/pdfService');
  return generateQuoteAsBlob(quoteId);
}

// Mirrors invoiceService.BulkSendInvoiceResult. Same three-state outcome
// shape so the InvoicesListPage / QuotesListPage summary toasts can share
// rendering logic if we generalize later.
export interface BulkSendQuoteResult {
  quoteId: string;
  quoteNumber: string | null;
  status: 'sent' | 'skipped' | 'failed';
  error?: string;
}

// Sequential per-row send. Same reasoning as bulkSendInvoiceEmails:
// the 5/min email rate limit + heavy PDF gen want serialization, and
// callers want a per-row outcome rather than a hard throw.
export async function bulkSendQuoteEmails(
  quoteIds: string[],
  onProgress?: (done: number, total: number, latest: BulkSendQuoteResult) => void,
): Promise<BulkSendQuoteResult[]> {
  const [{ sendDocumentEmail }, { getEmailTemplate }] = await Promise.all([
    import('./emailDocumentService'),
    import('./emailTemplates'),
  ]);

  const { data: rows, error } = await supabase
    .from('quotes')
    .select(
      'id, quote_number, case_id, customers_enhanced:customer_id(customer_name, email)',
    )
    .in('id', quoteIds)
    .is('deleted_at', null);
  if (error) throw error;

  const results: BulkSendQuoteResult[] = [];
  const total = rows?.length ?? 0;
  let done = 0;

  for (const q of rows ?? []) {
    const customer = q.customers_enhanced as {
      customer_name?: string;
      email?: string | null;
    } | null;
    const email = customer?.email?.trim();
    let result: BulkSendQuoteResult;

    if (!email) {
      result = {
        quoteId: q.id,
        quoteNumber: q.quote_number,
        status: 'skipped',
        error: 'Customer has no email',
      };
    } else {
      try {
        const pdfResult = await generateQuotePDFBlob(q.id);
        if (!pdfResult.success || !pdfResult.blob || !pdfResult.filename) {
          result = {
            quoteId: q.id,
            quoteNumber: q.quote_number,
            status: 'failed',
            error: pdfResult.error || 'PDF generation failed',
          };
        } else {
          const template = getEmailTemplate('quote', {
            customerName: customer?.customer_name || 'Valued Customer',
            caseNumber: '',
            companyName: '',
            documentType: 'quote',
          });
          const send = await sendDocumentEmail({
            to: email,
            subject: template.subject,
            body: template.body,
            blob: pdfResult.blob,
            filename: pdfResult.filename,
            caseId: q.case_id || undefined,
            documentType: 'quote',
          });
          if (send.success) {
            // Best-effort status update — quotes table has no sent_at
            // column (unlike invoices). Don't fail the row if this
            // errors; the email already went out.
            await supabase
              .from('quotes')
              .update({ status: 'sent' })
              .eq('id', q.id);
            result = {
              quoteId: q.id,
              quoteNumber: q.quote_number,
              status: 'sent',
            };
          } else {
            result = {
              quoteId: q.id,
              quoteNumber: q.quote_number,
              status: 'failed',
              error: send.error || 'Send failed',
            };
          }
        }
      } catch (err) {
        result = {
          quoteId: q.id,
          quoteNumber: q.quote_number,
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

export const quotesService = {
  fetchQuotes,
  fetchQuoteById,
  toQuoteEditInitialData,
  getNextQuoteNumber,
  createQuote,
  updateQuote,
  deleteQuote,
  restoreQuote,
  permanentDeleteQuote,
  fetchDeletedQuotes,
  updateQuoteStatus,
  getQuoteStats,
  duplicateQuote,
  getQuotesByCaseId,
  generateQuotePDF,
  generateQuotePDFBlob,
  bulkSendQuoteEmails,
};
