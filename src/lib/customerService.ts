import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

type CustomerRow = Database['public']['Tables']['customers_enhanced']['Row'];
type CustomerInsert = Database['public']['Tables']['customers_enhanced']['Insert'];
type RelationshipInsert = Database['public']['Tables']['customer_company_relationships']['Insert'];

export interface CreateCustomerInput {
  customer_name: string;
  email?: string | null;
  mobile_number?: string | null;
  phone?: string | null;
  customer_group_id?: string | null;
  country_id?: string | null;
  city_id?: string | null;
  address?: string | null;
  portal_enabled?: boolean;
  notes?: string | null;
  created_by?: string | null;
  /** When set, links the new customer to this company (non-primary). */
  company_id?: string | null;
}

/**
 * Create a customer: generate the next number, insert the row, and optionally
 * link it to a company. Owns the pipeline previously duplicated verbatim across
 * CustomerFormModal and CustomersListPage. tenant_id is stamped server-side by
 * the set_*_tenant_and_audit trigger (the cast satisfies the NOT-NULL Insert type).
 */
export async function createCustomer(input: CreateCustomerInput): Promise<CustomerRow | null> {
  const { data: customerNumber, error: numberError } = await supabase.rpc('get_next_customer_number');
  if (numberError) throw numberError;

  const { company_id, ...fields } = input;

  const { data: newCustomer, error: createError } = await supabase
    .from('customers_enhanced')
    .insert({ ...fields, customer_number: customerNumber } as CustomerInsert)
    .select()
    .maybeSingle();
  if (createError) throw createError;

  if (company_id && newCustomer) {
    const { error: relError } = await supabase
      .from('customer_company_relationships')
      .insert({ customer_id: newCustomer.id, company_id, is_primary: false } as RelationshipInsert);
    if (relError) throw relError;
  }

  return newCustomer;
}
