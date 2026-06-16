import { supabase } from '../supabaseClient';
import { fetchInvoicePaymentLedger } from '../paymentLedger';
import { getOrCreateCompanySettings } from '../companySettingsService';
import type {
  CaseData,
  DeviceData,
  CompanySettingsData,
  ReceiptData,
  QuoteData,
  QuoteDocumentData,
  QuoteItemData,
  InvoiceData,
  InvoiceDocumentData,
  CreditNoteDocumentData,
  InvoicePaymentLine,
  InvoiceItemData,
  PaymentReceiptData,
  PaymentReceiptDocumentData,
  PayslipData,
  PayslipDocumentData,
  ChainOfCustodyDocumentData,
  ChainOfCustodyEntryData,
} from './types';
import type { Database } from '../../types/database.types';
import type { CurrencyConfig } from '../../types/tenantConfig';
import { getTenantConfig } from '../tenantConfigService';

type QuotesRow = Database['public']['Tables']['quotes']['Row'];
type InvoicesRow = Database['public']['Tables']['invoices']['Row'];
type CasesRow = Database['public']['Tables']['cases']['Row'];
type PaymentsRow = Database['public']['Tables']['payments']['Row'];
type PayrollRecordsRow = Database['public']['Tables']['payroll_records']['Row'];
type QuoteItemsRow = Database['public']['Tables']['quote_items']['Row'];
type InvoiceLineItemsRow = Database['public']['Tables']['invoice_line_items']['Row'];

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed nested-relation mappers — the permanent guard against the "customer info
 * shows N/A" bug class.
 *
 * Root cause history: document fetchers used to embed customer/company via
 * PostgREST under the aliases `customers`/`companies` (plural) and then cast the
 * whole result `as unknown as QuoteData`. The document builders read singular
 * `customer`/`company`, so the data silently vanished — and the cast meant tsc
 * never caught the mismatch. It was "fixed" twice in runtime data-shaping and
 * regressed each time a query was refactored.
 *
 * Two structural defenses now make it impossible to recur silently:
 *   1. Customer/company are fetched with SEPARATE queries (no alias to mismatch),
 *      exactly like the working office-receipt path.
 *   2. Every nested object is built by an explicitly-typed mapper below and the
 *      document objects are assembled with `satisfies`, so any shape/key drift is
 *      a compile error. The pure `toQuoteData`/`toInvoiceData` builders are unit
 *      tested (see dataFetcher.test.ts).
 * Do NOT reintroduce `... as unknown as QuoteData/InvoiceData` over nested data.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function pickRecord(value: unknown): Record<string, unknown> | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v != null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function reqStr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Superset customer block — assignable to every *Data['customer'] field.
function toCustomerBlock(src: unknown): NonNullable<QuoteData['customer']> | undefined {
  const r = pickRecord(src);
  if (!r) return undefined;
  return {
    id: reqStr(r.id),
    customer_name: reqStr(r.customer_name),
    email: optStr(r.email),
    mobile_number: optStr(r.mobile_number),
    // DB column is `phone`; the type historically called it `phone_number`.
    phone_number: optStr(r.phone_number) ?? optStr(r.phone),
    address_line1: optStr(r.address_line1) ?? optStr(r.address),
    address_line2: optStr(r.address_line2),
    city: optStr(r.city),
    postal_code: optStr(r.postal_code),
    country: optStr(r.country),
  };
}

// Superset company block — assignable to every *Data['company'] field.
function toCompanyBlock(src: unknown): NonNullable<InvoiceData['company']> | undefined {
  const r = pickRecord(src);
  if (!r) return undefined;
  return {
    id: reqStr(r.id),
    company_name: reqStr(r.company_name) || reqStr(r.name),
    email: optStr(r.email),
    phone_number: optStr(r.phone_number) ?? optStr(r.phone),
    address_line1: optStr(r.address_line1) ?? optStr(r.address),
    address_line2: optStr(r.address_line2),
    city: optStr(r.city),
    postal_code: optStr(r.postal_code),
    country: optStr(r.country),
  };
}

function toAssociatedCompany(src: unknown): NonNullable<QuoteData['customer_associated_company']> | undefined {
  const block = toCompanyBlock(src);
  return block ? { id: block.id, company_name: block.company_name } : undefined;
}

function toCaseRef(src: unknown): NonNullable<QuoteData['cases']> | undefined {
  const r = pickRecord(src);
  if (!r) return undefined;
  return {
    id: reqStr(r.id),
    case_no: reqStr(r.case_no),
    title: optStr(r.title),
    contact_name: optStr(r.contact_name),
    contact_email: optStr(r.contact_email),
    contact_phone: optStr(r.contact_phone),
  };
}

function toCreatedByProfile(src: unknown): { id: string; full_name: string; email?: string } | undefined {
  const r = pickRecord(src);
  if (!r) return undefined;
  return {
    id: reqStr(r.id),
    full_name: reqStr(r.full_name),
    email: optStr(r.email),
  };
}

function toBankAccount(src: unknown): NonNullable<InvoiceData['bank_accounts']> | undefined {
  const r = pickRecord(src);
  if (!r) return undefined;
  return {
    id: reqStr(r.id),
    account_name: reqStr(r.account_name) || reqStr(r.name),
    bank_name: reqStr(r.bank_name),
    account_number: reqStr(r.account_number),
    iban: optStr(r.iban),
    swift_code: optStr(r.swift_code),
    branch_code: optStr(r.branch_code),
  };
}

/**
 * The document currency block, sourced from the resolved Country Engine
 * CurrencyConfig (NOT the legacy accounting_locales table). Falls back to the ISO
 * code when a tenant has no display symbol — never to a US '$'/'USD' default. This
 * is the single place currency formatting enters the PDF/document layer; Phase 2
 * will extend it to honor a tenant display_mode (symbol vs ISO code).
 */
export function currencyToBlock(c: CurrencyConfig): NonNullable<QuoteData['accounting_locales']> {
  const code = typeof c.code === 'string' ? c.code : '';
  return {
    currency_symbol: c.symbol || code,
    currency_position: c.position,
    decimal_places: c.decimalPlaces,
  };
}

function toIdName(src: unknown): { id: string; name: string } | undefined {
  const r = pickRecord(src);
  return r ? { id: reqStr(r.id), name: reqStr(r.name) } : undefined;
}

function toIdFullName(src: unknown): { id: string; full_name: string } | undefined {
  const r = pickRecord(src);
  return r ? { id: reqStr(r.id), full_name: reqStr(r.full_name) } : undefined;
}

// Line-item mappers — typed field extraction replaces the old
// `as unknown as XItemData[]` casts so a column rename is a compile error.
// Neither table has a `line_total` column: the quote builder computes the row
// total itself, and the invoice builder falls back to quantity*unit_price, so
// we compute it here to satisfy the required field without changing output.
export function toQuoteItems(rows: Partial<QuoteItemsRow>[] | null | undefined): QuoteItemData[] {
  return (rows ?? []).map(row => ({
    id: row.id ?? undefined,
    description: row.description ?? '',
    quantity: row.quantity ?? 0,
    unit_price: row.unit_price ?? 0,
  }));
}

export function toInvoiceItems(rows: Partial<InvoiceLineItemsRow>[] | null | undefined): InvoiceItemData[] {
  return (rows ?? []).map(row => {
    const quantity = row.quantity ?? 0;
    const unit_price = row.unit_price ?? 0;
    return {
      id: row.id ?? undefined,
      description: row.description ?? '',
      quantity,
      unit_price,
      tax_rate: row.tax_rate ?? 0,
      line_total: quantity * unit_price,
    };
  });
}

/**
 * Pure transform from a raw `cases` row (+ separately-fetched relations) into
 * CaseData. Built field-by-field from the typed row (no `as unknown as`) so a
 * renamed/removed column is a compile error and `satisfies` proves completeness.
 *
 * Note: the DB column is `description`; the document builders read
 * `problem_description` (used as the fallback when no device problem is set), so
 * it is mapped here. `contact_name/phone/email` and `assigned_technician_id` have
 * no `cases` column and stay undefined, matching prior behavior.
 */
export function toCaseData(
  caseRow: Partial<CasesRow>,
  extras: {
    customer?: unknown;
    company?: unknown;
    serviceType?: unknown;
    assignedTechnician?: unknown;
    createdByProfile?: unknown;
  },
): CaseData {
  return {
    id: caseRow.id ?? '',
    case_no: caseRow.case_no ?? '',
    case_number: caseRow.case_number ?? undefined,
    created_at: caseRow.created_at ?? '',
    status: caseRow.status ?? '',
    priority: caseRow.priority ?? '',
    problem_description: caseRow.description ?? undefined,
    contact_name: undefined,
    contact_phone: undefined,
    contact_email: undefined,
    customer_id: caseRow.customer_id ?? undefined,
    company_id: caseRow.company_id ?? undefined,
    service_type_id: caseRow.service_type_id ?? undefined,
    assigned_technician_id: undefined,
    checkout_date: caseRow.checkout_date ?? undefined,
    checkout_collector_name: caseRow.checkout_collector_name ?? undefined,
    checkout_collector_mobile: caseRow.checkout_collector_mobile ?? undefined,
    checkout_collector_id: caseRow.checkout_collector_id ?? undefined,
    checkout_notes: undefined, // no `cases.checkout_notes` column — undefined as before
    recovery_outcome: caseRow.recovery_outcome ?? undefined,
    client_reference: caseRow.client_reference ?? undefined,
    customer: toCustomerBlock(extras.customer),
    company: toCompanyBlock(extras.company),
    service_type: toIdName(extras.serviceType),
    assigned_technician: toIdFullName(extras.assignedTechnician),
    created_by: caseRow.created_by ?? undefined,
    created_by_profile: toCreatedByProfile(extras.createdByProfile),
  } satisfies CaseData;
}

export async function fetchReceiptData(caseId: string): Promise<ReceiptData> {
  const [caseResult, devicesResult, settingsResult] = await Promise.all([
    fetchCaseData(caseId),
    fetchCaseDevices(caseId),
    fetchCompanySettings(),
  ]);

  return {
    caseData: caseResult,
    devices: devicesResult,
    companySettings: settingsResult,
  };
}

async function fetchCaseData(caseId: string): Promise<CaseData> {
  const { data: caseData, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .maybeSingle();

  if (caseError) {
    console.error('Error fetching case data:', caseError);
    throw new Error('Failed to load case data');
  }

  if (!caseData) {
    throw new Error('Case not found');
  }

  const [customerData, companyData, serviceTypeData, technicianData, createdByData] = await Promise.all([
    caseData.customer_id
      ? supabase
          .from('customers_enhanced')
          .select('id, customer_name, email, mobile_number, phone')
          .eq('id', caseData.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    caseData.company_id
      ? supabase
          .from('companies')
          .select('id, name, company_name')
          .eq('id', caseData.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    caseData.service_type_id
      ? supabase
          .from('catalog_service_types')
          .select('id, name')
          .eq('id', caseData.service_type_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    caseData.assigned_engineer_id
      ? supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', caseData.assigned_engineer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    caseData.created_by
      ? supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', caseData.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return toCaseData(caseData, {
    customer: customerData.data,
    company: companyData.data,
    serviceType: serviceTypeData.data,
    assignedTechnician: technicianData.data,
    createdByProfile: createdByData.data,
  });
}

async function fetchCaseDevices(caseId: string): Promise<DeviceData[]> {
  const { data, error } = await supabase
    .from('case_devices')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching case devices:', error);
    return [];
  }

  if (!data) return [];

  const isNonNullString = (v: string | null): v is string => v != null;
  const isNonNullNumber = (v: number | null): v is number => v != null;

  const deviceTypeIds = data.map(d => d.device_type_id).filter(isNonNullString);
  const brandIds = data.map(d => d.brand_id).filter(isNonNullString);
  const capacityIds = data.map(d => d.capacity_id).filter(isNonNullString);
  const deviceRoleIds = data.map(d => d.device_role_id).filter(isNonNullNumber);

  const [deviceTypes, brands, capacities, deviceRoles] = await Promise.all([
    deviceTypeIds.length > 0
      ? supabase.from('catalog_device_types').select('id, name').in('id', deviceTypeIds)
      : { data: [], error: null },
    brandIds.length > 0
      ? supabase.from('catalog_device_brands').select('id, name').in('id', brandIds)
      : { data: [], error: null },
    capacityIds.length > 0
      ? supabase.from('catalog_device_capacities').select('id, name').in('id', capacityIds)
      : { data: [], error: null },
    deviceRoleIds.length > 0
      ? supabase.from('catalog_device_roles').select('id, name').in('id', deviceRoleIds)
      : { data: [], error: null },
  ]);

  const deviceTypeMap = new Map((deviceTypes.data || []).map(dt => [dt.id, dt.name]));
  const brandMap = new Map((brands.data || []).map(b => [b.id, b.name]));
  const capacityMap = new Map((capacities.data || []).map(c => [c.id, c.name]));
  const roleMap = new Map((deviceRoles.data || []).map(role => [role.id, role.name]));

  return data.map(device => ({
    id: device.id,
    device_type: device.device_type_id ? deviceTypeMap.get(device.device_type_id) ?? undefined : undefined,
    brand: device.brand_id ? brandMap.get(device.brand_id) ?? undefined : undefined,
    model: device.model ?? undefined,
    serial_number: device.serial_number ?? undefined,
    capacity: device.capacity_id ? capacityMap.get(device.capacity_id) ?? undefined : undefined,
    condition: undefined,
    role: device.device_role_id ? roleMap.get(device.device_role_id) ?? undefined : undefined,
    notes: device.symptoms ?? (device.accessories ? device.accessories.join(', ') : undefined),
    device_problem: device.symptoms ?? undefined,
  }));
}

async function fetchCompanySettings(): Promise<CompanySettingsData> {
  try {
    const settings = await getOrCreateCompanySettings();
    return {
      basic_info: settings.basic_info,
      location: settings.location,
      contact_info: settings.contact_info,
      branding: settings.branding,
      online_presence: settings.online_presence,
      legal_compliance: settings.legal_compliance,
      localization: settings.localization,
    } as CompanySettingsData;
  } catch (error) {
    console.error('Error fetching company settings:', error);
    return {
      basic_info: { company_name: 'Company Name' },
      location: {},
      contact_info: {},
      branding: {},
      online_presence: {},
      legal_compliance: {},
      localization: {
        document_language_settings: {
          mode: 'english_only',
          secondary_language: null,
          language_name: null,
        },
      },
    };
  }
}

/**
 * Pure transform from a raw `quotes` row (+ separately-fetched relations) into the
 * QuoteData shape the document builder consumes. Kept pure and exported so the
 * customer/company contract is unit tested without a live database.
 */
export function toQuoteData(
  quoteRow: Partial<QuotesRow> & { cases?: unknown },
  extras: {
    currency: CurrencyConfig;
    customer?: unknown;
    company?: unknown;
    createdByProfile?: unknown;
    customerAssociatedCompany?: unknown;
    items?: QuoteItemData[] | null;
  },
): QuoteData {
  // Built field-by-field from the typed row (no `as unknown as`): a renamed or
  // removed column is now a compile error, and `satisfies` proves completeness.
  return {
    id: quoteRow.id ?? '',
    quote_number: quoteRow.quote_number ?? '',
    case_id: quoteRow.case_id ?? undefined,
    customer_id: quoteRow.customer_id ?? undefined,
    company_id: quoteRow.company_id ?? undefined,
    status: quoteRow.status ?? '',
    title: '',
    valid_until: quoteRow.valid_until ?? undefined,
    subtotal: quoteRow.subtotal ?? 0,
    tax_rate: quoteRow.tax_rate ?? 0,
    tax_amount: quoteRow.tax_amount ?? 0,
    discount_amount: quoteRow.discount_amount ?? 0,
    discount_type: 'amount',
    total_amount: quoteRow.total_amount ?? 0,
    notes: quoteRow.notes ?? undefined,
    created_at: quoteRow.created_at ?? '',
    created_by: quoteRow.created_by ?? undefined,
    terms_and_conditions: optStr(quoteRow.terms),
    customer: toCustomerBlock(extras.customer),
    company: toCompanyBlock(extras.company),
    cases: toCaseRef(quoteRow.cases),
    created_by_profile: toCreatedByProfile(extras.createdByProfile),
    customer_associated_company: toAssociatedCompany(extras.customerAssociatedCompany),
    quote_items: extras.items ?? [],
    accounting_locales: currencyToBlock(extras.currency),
  } satisfies QuoteData;
}

export async function fetchQuoteData(quoteId: string): Promise<QuoteDocumentData> {
  const [quoteResult, settingsResult] = await Promise.all([
    fetchQuoteDetails(quoteId),
    fetchCompanySettings(),
  ]);

  return {
    quoteData: quoteResult,
    companySettings: settingsResult,
  };
}

async function fetchQuoteDetails(quoteId: string): Promise<QuoteData> {
  const { data: quoteRow, error: quoteError } = await supabase
    .from('quotes')
    .select('*, cases:case_id ( id, case_no, title )')
    .eq('id', quoteId)
    .maybeSingle();

  if (quoteError) {
    console.error('Error fetching quote data:', quoteError);
    throw new Error('Failed to load quote data');
  }

  if (!quoteRow) {
    throw new Error('Quote not found');
  }

  // Customer/company are fetched separately (NOT embedded) so there is no plural
  // alias that can drift away from the builder's `customer`/`company` reads.
  // quotes.created_by FKs to auth.users (not profiles), so the creator profile is
  // also a separate lookup.
  const [customerRes, companyRes, createdByRes] = await Promise.all([
    quoteRow.customer_id
      ? supabase
          .from('customers_enhanced')
          .select('id, customer_name, email, mobile_number, phone, address')
          .eq('id', quoteRow.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    quoteRow.company_id
      ? supabase
          .from('companies')
          .select('id, name, company_name, email, phone, address')
          .eq('id', quoteRow.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    quoteRow.created_by
      ? supabase.from('profiles').select('id, full_name').eq('id', quoteRow.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let customerAssociatedCompany: unknown = null;
  if (quoteRow.customer_id) {
    const { data: relationshipData } = await supabase
      .from('customer_company_relationships')
      .select('companies (id, name, company_name)')
      .eq('customer_id', quoteRow.customer_id)
      .eq('is_primary', true)
      .is('deleted_at', null)
      .maybeSingle();

    customerAssociatedCompany = relationshipData?.companies ?? null;
  }

  const { data: items, error: itemsError } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', quoteId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (itemsError) {
    console.error('Error fetching quote items:', itemsError);
  }

  // Currency is resolved through the Country Engine (single source of truth), not
  // the legacy accounting_locales table. quotes.tenant_id scopes the resolution.
  const cfg = await getTenantConfig(quoteRow.tenant_id);

  return toQuoteData(quoteRow, {
    currency: cfg.currency,
    customer: customerRes.data,
    company: companyRes.data,
    createdByProfile: createdByRes.data,
    customerAssociatedCompany,
    items: toQuoteItems(items),
  });
}

/**
 * Pure transform from a raw `invoices` row (+ separately-fetched relations) into
 * InvoiceData. Pure and exported for unit testing the customer/company contract.
 */
export function toInvoiceData(
  invoiceRow: Partial<InvoicesRow> & { cases?: unknown; bank_accounts?: unknown },
  extras: {
    currency: CurrencyConfig;
    customer?: unknown;
    company?: unknown;
    customerAssociatedCompany?: unknown;
    items?: InvoiceItemData[] | null;
  },
): InvoiceData {
  // Built field-by-field from the typed row (no `as unknown as`): column drift is
  // a compile error, and `satisfies` proves completeness.
  return {
    id: invoiceRow.id ?? '',
    invoice_number: invoiceRow.invoice_number ?? '',
    case_id: invoiceRow.case_id ?? undefined,
    customer_id: invoiceRow.customer_id ?? undefined,
    company_id: invoiceRow.company_id ?? undefined,
    invoice_type: invoiceRow.invoice_type === 'proforma' ? 'proforma' : 'tax_invoice',
    invoice_date: invoiceRow.invoice_date ?? '',
    due_date: invoiceRow.due_date ?? '',
    status: invoiceRow.status ?? '',
    subtotal: invoiceRow.subtotal ?? 0,
    tax_rate: invoiceRow.tax_rate ?? undefined,
    tax_amount: invoiceRow.tax_amount ?? 0,
    discount_amount: invoiceRow.discount_amount ?? 0,
    total_amount: invoiceRow.total_amount ?? 0,
    amount_paid: invoiceRow.amount_paid ?? 0,
    balance_due: invoiceRow.balance_due ?? 0,
    notes: invoiceRow.notes ?? undefined,
    created_at: invoiceRow.created_at ?? '',
    created_by: invoiceRow.created_by ?? undefined,
    customer: toCustomerBlock(extras.customer),
    company: toCompanyBlock(extras.company),
    cases: toCaseRef(invoiceRow.cases),
    bank_accounts: toBankAccount(invoiceRow.bank_accounts),
    customer_associated_company: toAssociatedCompany(extras.customerAssociatedCompany),
    invoice_line_items: extras.items ?? [],
    accounting_locales: currencyToBlock(extras.currency),
  } satisfies InvoiceData;
}

export async function fetchInvoiceData(invoiceId: string): Promise<InvoiceDocumentData> {
  const [invoiceResult, settingsResult, paymentHistory] = await Promise.all([
    fetchInvoiceDetails(invoiceId),
    fetchCompanySettings(),
    fetchInvoicePaymentHistory(invoiceId),
  ]);

  return {
    invoiceData: invoiceResult,
    companySettings: settingsResult,
    paymentHistory,
  };
}

export async function fetchCreditNoteData(creditNoteId: string): Promise<CreditNoteDocumentData> {
  const { data: cnRow, error } = await supabase
    .from('credit_notes')
    .select('*')
    .eq('id', creditNoteId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching credit note data:', error);
    throw new Error('Failed to load credit note data');
  }
  if (!cnRow) {
    throw new Error('Credit note not found');
  }

  // Related records fetched separately (mirrors fetchInvoiceDetails — no embed/alias drift).
  // Currency from the Country Engine (single source), not accounting_locales.
  const cfg = await getTenantConfig(cnRow.tenant_id);
  const [settings, invoiceRes, customerRes, companyRes, caseRes, itemsRes] = await Promise.all([
    fetchCompanySettings(),
    cnRow.invoice_id
      ? supabase.from('invoices').select('invoice_number').eq('id', cnRow.invoice_id).maybeSingle()
      : Promise.resolve({ data: null }),
    cnRow.customer_id
      ? supabase.from('customers_enhanced').select('customer_name').eq('id', cnRow.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    cnRow.company_id
      ? supabase.from('companies').select('company_name, name').eq('id', cnRow.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    cnRow.case_id
      ? supabase.from('cases').select('case_no').eq('id', cnRow.case_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('credit_note_items')
      .select('description, quantity, unit_price, total')
      .eq('credit_note_id', creditNoteId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
  ]);

  const invoice = invoiceRes.data as { invoice_number?: string | null } | null;
  const customer = customerRes.data as { customer_name?: string | null } | null;
  const company = companyRes.data as { company_name?: string | null; name?: string | null } | null;
  const caseRow = caseRes.data as { case_no?: string | null } | null;
  const block = currencyToBlock(cfg.currency);
  const items = (itemsRes.data ?? []) as Array<{ description?: string | null; quantity?: number | null; unit_price?: number | null; total?: number | null }>;

  return {
    creditNoteData: {
      credit_note_number: cnRow.credit_note_number ?? null,
      credit_note_date: cnRow.credit_note_date ?? null,
      credit_type: cnRow.credit_type ?? null,
      status: cnRow.status ?? null,
      reason_code: cnRow.reason_code ?? null,
      reason_notes: cnRow.reason_notes ?? null,
      subtotal: cnRow.subtotal ?? null,
      tax_rate: cnRow.tax_rate ?? null,
      tax_amount: cnRow.tax_amount ?? null,
      total_amount: cnRow.total_amount ?? null,
      applied_amount: cnRow.applied_amount ?? null,
      invoice_number: invoice?.invoice_number ?? null,
      customer_name: customer?.customer_name ?? null,
      company_name: company?.company_name ?? company?.name ?? null,
      case_no: caseRow?.case_no ?? null,
      currency_symbol: block.currency_symbol,
      currency_position: block.currency_position,
      decimal_places: block.decimal_places,
      items: items.map((it) => ({
        description: it.description ?? '',
        quantity: typeof it.quantity === 'number' ? it.quantity : 0,
        unit_price: typeof it.unit_price === 'number' ? it.unit_price : 0,
        line_total: typeof it.total === 'number' ? it.total : 0,
      })),
    },
    companySettings: settings,
  };
}

// Payment trail for the invoice PDF: the unified ledger (receipts + allocated
// payments + legacy direct payments with running balances). paymentLedger is
// dependency-light (supabase client only), so the pdf module still stays free
// of the lazily-loaded invoiceService.
async function fetchInvoicePaymentHistory(invoiceId: string): Promise<InvoicePaymentLine[]> {
  const entries = await fetchInvoicePaymentLedger(invoiceId);
  return entries.map((e) => ({
    payment_date: e.payment_date,
    amount: e.amount,
    method: e.method,
    reference: e.reference,
    transaction_id: e.transaction_id,
    status: e.status,
    recorded_by: e.recorded_by,
    notes: e.notes,
    doc_number: e.doc_number,
    source: e.source,
    running_balance: e.running_balance,
  }));
}

async function fetchInvoiceDetails(invoiceId: string): Promise<InvoiceData> {
  const { data: invoiceRow, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      *,
      cases ( id, case_no, title ),
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
    .eq('id', invoiceId)
    .maybeSingle();

  if (invoiceError) {
    console.error('Error fetching invoice data:', invoiceError);
    throw new Error('Failed to load invoice data');
  }

  if (!invoiceRow) {
    throw new Error('Invoice not found');
  }

  // Customer/company fetched separately (no plural-alias drift) — see toInvoiceData.
  const [customerRes, companyRes] = await Promise.all([
    invoiceRow.customer_id
      ? supabase
          .from('customers_enhanced')
          .select('id, customer_name, email, mobile_number, phone, address')
          .eq('id', invoiceRow.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    invoiceRow.company_id
      ? supabase
          .from('companies')
          .select('id, name, company_name, email, phone, address')
          .eq('id', invoiceRow.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let customerAssociatedCompany: unknown = null;
  if (invoiceRow.customer_id) {
    const { data: relationshipData } = await supabase
      .from('customer_company_relationships')
      .select('companies (id, name, company_name)')
      .eq('customer_id', invoiceRow.customer_id)
      .eq('is_primary', true)
      .is('deleted_at', null)
      .maybeSingle();

    customerAssociatedCompany = relationshipData?.companies ?? null;
  }

  const { data: items, error: itemsError } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (itemsError) {
    console.error('Error fetching invoice items:', itemsError);
  }

  // Currency from the Country Engine (single source), not accounting_locales.
  const cfg = await getTenantConfig(invoiceRow.tenant_id);

  return toInvoiceData(invoiceRow, {
    currency: cfg.currency,
    customer: customerRes.data,
    company: companyRes.data,
    customerAssociatedCompany,
    items: toInvoiceItems(items),
  });
}

/**
 * Pure transform from a raw `payments` row (+ separately-fetched relations) into
 * PaymentReceiptData. Built field-by-field (no `as unknown as`).
 *
 * Column renames the old cast silently dropped: `payment_number→receipt_number`
 * (the receipt header previously always read "Draft") and `reference→reference_number`
 * (the reference line never rendered). `payment_method`, `company`, and
 * `created_by_profile` have no source in this query and stay undefined.
 */
export function toPaymentReceiptData(
  paymentRow: Partial<PaymentsRow>,
  extras: {
    currency: CurrencyConfig;
    invoice?: unknown;
    customer?: unknown;
    bankAccounts?: unknown;
    cases?: unknown;
  },
): PaymentReceiptData {
  const invoiceRef = pickRecord(extras.invoice);
  return {
    id: paymentRow.id ?? '',
    receipt_number: paymentRow.payment_number ?? undefined,
    payment_date: paymentRow.payment_date ?? '',
    amount: paymentRow.amount ?? 0,
    payment_method: undefined,
    reference_number: paymentRow.reference ?? undefined,
    notes: paymentRow.notes ?? undefined,
    created_at: paymentRow.created_at ?? '',
    invoice: invoiceRef
      ? {
          id: reqStr(invoiceRef.id),
          invoice_number: reqStr(invoiceRef.invoice_number),
          total_amount: typeof invoiceRef.total_amount === 'number' ? invoiceRef.total_amount : 0,
          invoice_type: reqStr(invoiceRef.invoice_type),
        }
      : undefined,
    customer: toCustomerBlock(extras.customer),
    bank_accounts: toBankAccount(extras.bankAccounts),
    cases: toCaseRef(extras.cases),
    accounting_locales: currencyToBlock(extras.currency),
  } satisfies PaymentReceiptData;
}

export async function fetchPaymentReceiptData(paymentId: string): Promise<PaymentReceiptDocumentData> {
  const [paymentResult, settingsResult] = await Promise.all([
    fetchPaymentDetails(paymentId),
    fetchCompanySettings(),
  ]);

  return {
    paymentData: paymentResult,
    companySettings: settingsResult,
  };
}

async function fetchPaymentDetails(paymentId: string): Promise<PaymentReceiptData> {
  const { data: paymentData, error: paymentError } = await supabase
    .from('payments')
    .select(`
      *,
      invoices (
        id,
        invoice_number,
        total_amount,
        invoice_type
      ),
      bank_accounts (
        id,
        account_name:name,
        bank_name,
        account_number,
        iban,
        swift_code
      )
    `)
    .eq('id', paymentId)
    .maybeSingle();

  if (paymentError) {
    console.error('Error fetching payment data:', paymentError);
    throw new Error('Failed to load payment data');
  }

  if (!paymentData) {
    throw new Error('Payment not found');
  }

  // Customer fetched separately (no plural-alias drift).
  const { data: customerRow } = paymentData.customer_id
    ? await supabase
        .from('customers_enhanced')
        .select('id, customer_name, email, mobile_number, phone')
        .eq('id', paymentData.customer_id)
        .maybeSingle()
    : { data: null };

  let caseInfo: unknown = null;
  if (paymentData.invoices?.id) {
    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('case_id, cases(id, case_no)')
      .eq('id', paymentData.invoices.id)
      .maybeSingle();
    caseInfo = invoiceData?.cases ?? null;
  }

  // Currency from the Country Engine (single source), not accounting_locales.
  const cfg = await getTenantConfig(paymentData.tenant_id);

  return toPaymentReceiptData(paymentData, {
    currency: cfg.currency,
    invoice: paymentData.invoices,
    customer: customerRow,
    bankAccounts: paymentData.bank_accounts,
    cases: caseInfo,
  });
}

/**
 * Pure transform from a raw `payroll_records` row (+ separately-fetched relations)
 * into PayslipData. Built field-by-field (no `as unknown as`).
 *
 * `total_earnings→gross_salary`. `payment_date`, `days_worked`, `days_absent`, and
 * `regular_hours` have no `payroll_records` column and stay undefined, matching
 * prior behavior (the builder renders 0 / "Not paid" for them).
 */
export function toPayslipData(
  recordRow: Partial<PayrollRecordsRow>,
  extras: {
    currency: CurrencyConfig;
    employee?: unknown;
    period?: unknown;
    items?: PayslipData['items'];
  },
): PayslipData {
  const employeeRow = pickRecord(extras.employee);
  const periodRow = pickRecord(extras.period);
  return {
    id: recordRow.id ?? '',
    employee: {
      first_name: reqStr(employeeRow?.first_name),
      last_name: reqStr(employeeRow?.last_name),
      employee_number: reqStr(employeeRow?.employee_number),
    },
    payroll_period: {
      period_name: reqStr(periodRow?.period_name),
      start_date: reqStr(periodRow?.start_date),
      end_date: reqStr(periodRow?.end_date),
    },
    payment_date: undefined,
    working_days: recordRow.working_days ?? undefined,
    days_worked: undefined,
    days_absent: undefined,
    regular_hours: undefined,
    overtime_hours: recordRow.overtime_hours ?? undefined,
    gross_salary: recordRow.total_earnings ?? undefined,
    net_salary: recordRow.net_salary ?? 0,
    items: extras.items ?? [],
    accounting_locales: currencyToBlock(extras.currency),
  } satisfies PayslipData;
}

export async function fetchPayslipData(recordId: string): Promise<PayslipDocumentData> {
  const [payslipResult, settingsResult] = await Promise.all([
    fetchPayslipDetails(recordId),
    fetchCompanySettings(),
  ]);

  return {
    payslipData: payslipResult,
    companySettings: settingsResult,
  };
}

async function fetchPayslipDetails(recordId: string): Promise<PayslipData> {
  const { data: recordData, error: recordError } = await supabase
    .from('payroll_records')
    .select(`
      *,
      employee:employees!payroll_records_employee_id_fkey (
        first_name,
        last_name,
        employee_number
      ),
      payroll_period:payroll_records_period_id_fkey (
        period_name,
        start_date,
        end_date
      )
    `)
    .eq('id', recordId)
    .maybeSingle();

  if (recordError) {
    console.error('Error fetching payroll record:', recordError);
    throw new Error('Failed to load payroll record');
  }

  if (!recordData) {
    throw new Error('Payroll record not found');
  }

  const { data: items } = await supabase
    .from('payroll_record_items')
    .select('component_id, component_name, component_type, amount')
    .eq('record_id', recordId)
    .order('sort_order', { ascending: true });

  // Currency from the Country Engine (single source), not accounting_locales.
  const cfg = await getTenantConfig(recordData.tenant_id);

  const mappedItems = (items || []).map(item => ({
    component_code: item.component_id ?? '',
    component_name: item.component_name,
    component_type: item.component_type,
    amount: item.amount,
  }));

  return toPayslipData(recordData, {
    currency: cfg.currency,
    employee: recordData.employee,
    period: recordData.payroll_period,
    items: mappedItems,
  });
}

export async function fetchChainOfCustodyData(
  caseId: string,
  caseNumber: string,
  options?: ChainOfCustodyDocumentData['options']
): Promise<ChainOfCustodyDocumentData> {
  const [entriesResult, settingsResult] = await Promise.all([
    fetchChainOfCustodyEntries(caseId),
    fetchCompanySettings(),
  ]);

  return {
    caseNumber,
    entries: entriesResult,
    options,
    companySettings: settingsResult,
  };
}

async function fetchChainOfCustodyEntries(caseId: string): Promise<ChainOfCustodyEntryData[]> {
  const { data, error } = await supabase
    .from('chain_of_custody')
    .select('id, action, action_category, actor_name, actor_role, created_at, description, evidence_hash, metadata')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching chain of custody entries:', error);
    return [];
  }

  return (data || []).map((row, index): ChainOfCustodyEntryData => {
    const metadata = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
      ? (row.metadata as Record<string, unknown>)
      : {};
    const pickString = (key: string): string | undefined => {
      const value = metadata[key];
      return typeof value === 'string' ? value : undefined;
    };
    const pickNumber = (key: string): number | undefined => {
      const value = metadata[key];
      return typeof value === 'number' ? value : undefined;
    };

    return {
      entry_number: pickNumber('entry_number') ?? index + 1,
      action_category: row.action_category,
      action_type: row.action,
      action_description: row.description ?? '',
      actor_name: row.actor_name,
      actor_role: row.actor_role ?? undefined,
      occurred_at: pickString('occurred_at') ?? row.created_at,
      evidence_reference: pickString('evidence_reference'),
      hash_algorithm: pickString('hash_algorithm'),
      hash_value: pickString('hash_value') ?? row.evidence_hash ?? undefined,
      digital_signature: pickString('digital_signature'),
    };
  });
}
