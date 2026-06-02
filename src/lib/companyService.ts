import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Database } from '../types/database.types';

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
type RelationshipInsert = Database['public']['Tables']['customer_company_relationships']['Insert'];

export interface CreateCompanyInput {
  name?: string | null;
  company_name?: string | null;
  tax_number?: string | null;
  industry_id?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  country_id?: string | null;
  city_id?: string | null;
  address?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

/**
 * Create a company: generate the next number, insert the row, and optionally
 * link a primary contact. Owns the pipeline previously duplicated across
 * CustomerFormModal, CustomersListPage and CompaniesListPage. company_name is
 * always populated (some call sites previously set only `name`, leaving
 * company_name NULL). tenant_id is stamped server-side by the
 * set_*_tenant_and_audit trigger.
 */
export async function createCompany(
  input: CreateCompanyInput,
  primaryContactId?: string | null,
): Promise<CompanyRow> {
  const resolvedName = (input.company_name ?? input.name ?? '').trim();
  if (!resolvedName) throw new Error('Company name is required');

  const { data: companyNumber, error: numberError } = await supabase.rpc('get_next_company_number');
  if (numberError) throw numberError;

  // uuid FK columns reject empty strings ("invalid input syntax for type uuid")
  // — a 400 that the `as CompanyInsert` cast would otherwise hide. Coerce blanks
  // to null here so every caller (forms that send '' for an unset select) is safe.
  const uuidOrNull = (v?: string | null) => (v && v.trim() !== '' ? v : null);

  const payload = {
    ...input,
    company_number: companyNumber,
    company_name: resolvedName,
    name: resolvedName,
    industry_id: uuidOrNull(input.industry_id),
    country_id: uuidOrNull(input.country_id),
    city_id: uuidOrNull(input.city_id),
    created_by: uuidOrNull(input.created_by),
  } as CompanyInsert;

  const { data: newCompany, error: createError } = await supabase
    .from('companies')
    .insert(payload)
    .select()
    .maybeSingle();
  if (createError) throw createError;
  if (!newCompany) throw new Error('Failed to create company');

  if (primaryContactId) {
    const { error: relError } = await supabase
      .from('customer_company_relationships')
      .insert({ customer_id: primaryContactId, company_id: newCompany.id, is_primary: true } as RelationshipInsert);
    if (relError) {
      logger.warn('Failed to link primary contact to company', { companyId: newCompany.id, primaryContactId, error: relError });
    }
  }

  return newCompany;
}
