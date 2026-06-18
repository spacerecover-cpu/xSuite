import { supabase, resolveTenantId } from './supabaseClient';
import { logger } from './logger';
import { getOrCreateCompanySettings } from './companySettingsService';
import { formatCurrencyWithConfig, formatDate } from './format';
import { getTenantConfig } from './tenantConfigService';
import type { TemplateContext } from './templateEngine';

// Builds the nested context the template engine renders against, shaped to the
// dotted keys in the master_template_variables catalog (company.*, customer.*,
// case.*, device.*, quote.*, invoice.*, service.*, technician.*). Money and
// dates are pre-formatted display strings — templates never see raw numbers.

export interface ContextRefs {
  caseId?: string;
  quoteId?: string;
  invoiceId?: string;
  customerId?: string;
}

export interface TemplateVariableInfo {
  variableKey: string;
  name: string;
  category: string | null;
  description: string | null;
}

let registryCache: { data: TemplateVariableInfo[]; fetchedAt: number } | null = null;
const REGISTRY_TTL_MS = 5 * 60 * 1000;

export async function getVariableRegistry(): Promise<TemplateVariableInfo[]> {
  if (registryCache && Date.now() - registryCache.fetchedAt < REGISTRY_TTL_MS) {
    return registryCache.data;
  }

  const { data, error } = await supabase
    .from('master_template_variables')
    .select('variable_key, name, category, description')
    .eq('is_active', true)
    .order('category')
    .order('name');

  if (error) {
    logger.error('Error fetching template variable registry:', error);
    throw error;
  }

  const registry = (data ?? []).map((row) => ({
    variableKey: row.variable_key,
    name: row.name,
    category: row.category,
    description: row.description,
  }));
  registryCache = { data: registry, fetchedAt: Date.now() };
  return registry;
}

const daysBetween = (from: string | null, to: string | null): string => {
  if (!from || !to) return '';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (Number.isNaN(ms)) return '';
  return String(Math.max(0, Math.round(ms / 86_400_000)));
};

export async function buildTemplateContext(refs: ContextRefs): Promise<TemplateContext> {
  const ctx: TemplateContext = {};

  const [companySettings, currencyConfig] = await Promise.all([
    getOrCreateCompanySettings().catch((error) => {
      logger.warn('Template context: company settings unavailable:', error);
      return null;
    }),
    // Single-source the tenant's currency via the Country Engine config instead of
    // the legacy accounting_locales reader (CL-002). resolveTenantId() preserves the
    // implicit "current tenant" scoping the RLS-filtered read used to provide.
    resolveTenantId()
      .then((tenantId) => getTenantConfig(tenantId))
      .then((config) => config.currency)
      .catch((error) => {
        logger.warn('Template context: tenant currency config unavailable:', error);
        return null;
      }),
  ]);

  const money = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined) return '';
    return currencyConfig ? formatCurrencyWithConfig(amount, currencyConfig) : String(amount);
  };

  if (companySettings) {
    const loc = companySettings.location ?? {};
    const address = [loc.address_line1, loc.address_line2, loc.city, loc.country]
      .filter(Boolean)
      .join(', ');
    ctx.company = {
      name: companySettings.basic_info?.company_name ?? '',
      email: companySettings.contact_info?.email_general ?? '',
      phone: companySettings.contact_info?.phone_primary ?? '',
      address,
      website: companySettings.online_presence?.website ?? '',
      currency: currencyConfig && typeof currencyConfig.code === 'string' ? currencyConfig.code : '',
    };
  }

  let caseCustomerId: string | null = null;

  if (refs.caseId) {
    const { data: caseRow, error } = await supabase
      .from('cases')
      .select('case_number, case_no, status, priority, description, created_at, customer_id')
      .eq('id', refs.caseId)
      .maybeSingle();
    if (error) logger.warn('Template context: case fetch failed:', error);
    if (caseRow) {
      caseCustomerId = caseRow.customer_id;
      ctx.case = {
        number: caseRow.case_number ?? caseRow.case_no ?? '',
        status: caseRow.status ?? '',
        priority: caseRow.priority ?? '',
        problem: caseRow.description ?? '',
        received_date: caseRow.created_at ? formatDate(caseRow.created_at) : '',
      };
    }

    const { data: device, error: deviceError } = await supabase
      .from('case_devices')
      .select(
        'model, serial_number, catalog_device_types(name), catalog_device_brands(name), catalog_device_capacities(name), catalog_device_conditions(name)'
      )
      .eq('case_id', refs.caseId)
      .eq('is_primary', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (deviceError) logger.warn('Template context: device fetch failed:', deviceError);
    if (device) {
      ctx.device = {
        type: device.catalog_device_types?.name ?? '',
        brand: device.catalog_device_brands?.name ?? '',
        model: device.model ?? '',
        serial: device.serial_number ?? '',
        capacity: device.catalog_device_capacities?.name ?? '',
        condition: device.catalog_device_conditions?.name ?? '',
      };
    }
  }

  if (refs.quoteId) {
    const { data: quote, error } = await supabase
      .from('quotes')
      .select('quote_number, total_amount, quote_date, valid_until, customer_id')
      .eq('id', refs.quoteId)
      .maybeSingle();
    if (error) logger.warn('Template context: quote fetch failed:', error);
    if (quote) {
      caseCustomerId = caseCustomerId ?? quote.customer_id;
      ctx.quote = {
        number: quote.quote_number ?? '',
        total: money(quote.total_amount),
        validity_days: daysBetween(quote.quote_date, quote.valid_until),
        expiry_date: quote.valid_until ? formatDate(quote.valid_until) : '',
      };
    }
  }

  if (refs.invoiceId) {
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('invoice_number, total_amount, invoice_date, due_date, customer_id')
      .eq('id', refs.invoiceId)
      .maybeSingle();
    if (error) logger.warn('Template context: invoice fetch failed:', error);
    if (invoice) {
      caseCustomerId = caseCustomerId ?? invoice.customer_id;
      ctx.invoice = {
        number: invoice.invoice_number ?? '',
        total: money(invoice.total_amount),
        due_date: invoice.due_date ? formatDate(invoice.due_date) : '',
        due_days: daysBetween(invoice.invoice_date, invoice.due_date),
      };
    }
  }

  const customerId = refs.customerId ?? caseCustomerId;
  if (customerId) {
    const { data: customer, error } = await supabase
      .from('customers_enhanced')
      .select('customer_name, email, phone, mobile_number, company_name')
      .eq('id', customerId)
      .maybeSingle();
    if (error) logger.warn('Template context: customer fetch failed:', error);
    if (customer) {
      ctx.customer = {
        name: customer.customer_name ?? '',
        email: customer.email ?? '',
        phone: customer.phone ?? customer.mobile_number ?? '',
        company: customer.company_name ?? '',
      };
    }
  }

  return ctx;
}
