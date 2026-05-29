import { supabase } from './supabaseClient';
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
  const { data: companyNumber, error: numberError } = await supabase.rpc('get_next_company_number');
  if (numberError) throw numberError;

  const payload = {
    ...input,
    company_number: companyNumber,
    company_name: input.company_name ?? input.name ?? null,
  } as CompanyInsert;

  const { data: newCompany, error: createError } = await supabase
    .from('companies')
    .insert(payload)
    .select()
    .maybeSingle();
  if (createError) throw createError;
  if (!newCompany) throw new Error('Failed to create company');

  if (primaryContactId) {
    // Matches CompaniesListPage: fire-and-forget primary-contact link.
    await supabase
      .from('customer_company_relationships')
      .insert({ customer_id: primaryContactId, company_id: newCompany.id, is_primary: true } as RelationshipInsert);
  }

  return newCompany;
}
