import { supabase } from './supabaseClient';
import { logAuditTrail } from './auditTrailService';
import { logger } from './logger';
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
    // First (and only) company link — it IS the customer's primary company.
    const { error: relError } = await supabase
      .from('customer_company_relationships')
      .insert({ customer_id: newCustomer.id, company_id, is_primary: true } as RelationshipInsert);
    if (relError) throw relError;
  }

  return newCustomer;
}

// ---------------------------------------------------------------------------
// Customer ↔ company relationship management (platform review 2026-06-10, #1).
// Relationships are managed, never swapped: add / end (soft delete + reason) /
// set primary. Historical documents keep their company snapshots; every change
// lands in audit_trails.
// ---------------------------------------------------------------------------

export interface CompanyRelationshipRecord {
  id: string;
  company_id: string;
  is_primary: boolean | null;
  role: string | null;
  created_at: string;
  companies: {
    id: string;
    company_number: string | null;
    company_name: string | null;
    name: string;
  } | null;
}

export async function getCompanyRelationships(customerId: string): Promise<CompanyRelationshipRecord[]> {
  const { data, error } = await supabase
    .from('customer_company_relationships')
    .select('id, company_id, is_primary, role, created_at, companies (id, company_number, company_name, name)')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CompanyRelationshipRecord[];
}

/** Keep the display-only customers_enhanced.company_name in step with the primary link. */
async function syncDenormalizedCompanyName(customerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('customer_company_relationships')
    .select('companies (name, company_name)')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error('Failed to resolve primary company for name sync:', error);
    return;
  }
  const company = data?.companies as { name: string; company_name: string | null } | null;
  const name = company?.company_name ?? company?.name ?? null;
  const { error: updateError } = await supabase
    .from('customers_enhanced')
    .update({ company_name: name })
    .eq('id', customerId);
  if (updateError) logger.error('Failed to sync customer company_name:', updateError);
}

export async function addCompanyRelationship(params: {
  customerId: string;
  companyId: string;
  role?: string | null;
  makePrimary?: boolean;
}): Promise<void> {
  const { customerId, companyId, role = null, makePrimary = false } = params;

  const { data: inserted, error } = await supabase
    .from('customer_company_relationships')
    .insert({ customer_id: customerId, company_id: companyId, role, is_primary: false } as RelationshipInsert)
    .select('id')
    .maybeSingle();

  let relationshipId = inserted?.id;
  if (error) {
    if (error.code !== '23505') throw error;
    // UNIQUE(tenant, customer, company) also covers ended (soft-deleted) links —
    // re-linking restores the existing row instead of failing.
    const { data: existing, error: findError } = await supabase
      .from('customer_company_relationships')
      .select('id, deleted_at')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing || !existing.deleted_at) {
      throw new Error('This customer is already linked to that company.');
    }
    const { error: reviveError } = await supabase
      .from('customer_company_relationships')
      .update({ deleted_at: null, role, is_primary: false })
      .eq('id', existing.id);
    if (reviveError) throw reviveError;
    relationshipId = existing.id;
  }

  await logAuditTrail('company_linked', 'customer_company_relationships', relationshipId ?? customerId, {}, {
    customer_id: customerId,
    company_id: companyId,
    role,
  });

  if (makePrimary && relationshipId) {
    await setPrimaryCompany(customerId, relationshipId);
  } else {
    await syncDenormalizedCompanyName(customerId);
  }
}

export async function setPrimaryCompany(customerId: string, relationshipId: string): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from('customer_company_relationships')
    .select('id, company_id')
    .eq('customer_id', customerId)
    .eq('is_primary', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (currentError) throw currentError;
  if (current?.id === relationshipId) return;

  // Clear the old primary first — uq_customer_primary_company allows one per customer.
  if (current) {
    const { error } = await supabase
      .from('customer_company_relationships')
      .update({ is_primary: false })
      .eq('id', current.id);
    if (error) throw error;
  }
  const { data: next, error: setError } = await supabase
    .from('customer_company_relationships')
    .update({ is_primary: true })
    .eq('id', relationshipId)
    .eq('customer_id', customerId)
    .select('company_id')
    .maybeSingle();
  if (setError) throw setError;

  await logAuditTrail('primary_company_changed', 'customer_company_relationships', relationshipId, {
    company_id: current?.company_id ?? null,
  }, {
    company_id: next?.company_id ?? null,
    customer_id: customerId,
  });

  await syncDenormalizedCompanyName(customerId);
}

export async function endCompanyRelationship(relationshipId: string, reason: string): Promise<void> {
  const { data: rel, error: fetchError } = await supabase
    .from('customer_company_relationships')
    .select('id, customer_id, company_id, is_primary')
    .eq('id', relationshipId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!rel) throw new Error('Relationship not found');

  const { error } = await supabase
    .from('customer_company_relationships')
    .update({ deleted_at: new Date().toISOString(), is_primary: false })
    .eq('id', relationshipId);
  if (error) throw error;

  await logAuditTrail('company_unlinked', 'customer_company_relationships', relationshipId, {
    customer_id: rel.customer_id,
    company_id: rel.company_id,
    is_primary: rel.is_primary,
  }, { reason });

  // If the primary link ended, promote the earliest remaining link.
  if (rel.is_primary && rel.customer_id) {
    const { data: nextPrimary } = await supabase
      .from('customer_company_relationships')
      .select('id')
      .eq('customer_id', rel.customer_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextPrimary) {
      await setPrimaryCompany(rel.customer_id, nextPrimary.id);
      return;
    }
  }
  if (rel.customer_id) await syncDenormalizedCompanyName(rel.customer_id);
}

export interface OpenCaseRef {
  id: string;
  case_no: string | null;
  status: string | null;
  company_id: string | null;
}

async function getTerminalStatusNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('master_case_statuses')
    .select('name')
    .in('type', ['completed', 'delivered', 'cancelled']);
  if (error) throw error;
  return (data ?? []).map((s) => s.name);
}

/** Open (non-terminal) cases that reference a company for this customer —
 *  the impact surface shown before relationship changes. */
export async function getOpenCasesForCompany(customerId: string, companyId: string): Promise<OpenCaseRef[]> {
  const terminalNames = await getTerminalStatusNames();
  let query = supabase
    .from('cases')
    .select('id, case_no, status, company_id')
    .eq('customer_id', customerId)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (terminalNames.length > 0) {
    query = query.not('status', 'in', `(${terminalNames.map((n) => `"${n}"`).join(',')})`);
  }
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Open (non-terminal) cases for this customer that are still pinned to ANY
 *  company — the cases that become personal when the customer is made
 *  individual. */
export async function getOpenCompanyCasesForCustomer(customerId: string): Promise<OpenCaseRef[]> {
  const terminalNames = await getTerminalStatusNames();
  let query = supabase
    .from('cases')
    .select('id, case_no, status, company_id')
    .eq('customer_id', customerId)
    .not('company_id', 'is', null)
    .is('deleted_at', null);
  if (terminalNames.length > 0) {
    query = query.not('status', 'in', `(${terminalNames.map((n) => `"${n}"`).join(',')})`);
  }
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Convert a business contact into an individual customer: re-point every open
 * company-pinned case to personal (company_id = null, audited per case), then
 * soft-delete all active company links. Issued quotes/invoices and closed
 * cases keep their company snapshot — history is never rewritten.
 */
export async function makeCustomerIndividual(
  customerId: string,
  reason: string,
): Promise<{ repointedCases: number; endedLinks: number }> {
  // 1. Re-point open company-pinned cases to personal (each logged on the case).
  const openCases = await getOpenCompanyCasesForCustomer(customerId);
  for (const c of openCases) {
    await repointCaseCompany(c.id, c.company_id, null);
  }

  // 2. Soft-delete every active link in one write (no per-link primary churn).
  const relationships = await getCompanyRelationships(customerId);
  if (relationships.length > 0) {
    const { error } = await supabase
      .from('customer_company_relationships')
      .update({ deleted_at: new Date().toISOString(), is_primary: false })
      .eq('customer_id', customerId)
      .is('deleted_at', null);
    if (error) throw error;
    for (const rel of relationships) {
      await logAuditTrail('company_unlinked', 'customer_company_relationships', rel.id, {
        company_id: rel.company_id,
        is_primary: rel.is_primary,
      }, { reason, via: 'make_individual' });
    }
  }

  // 3. Clear the denormalized name and record the conversion itself.
  await syncDenormalizedCompanyName(customerId);
  await logAuditTrail('customer_converted_to_individual', 'customers_enhanced', customerId, {}, {
    reason,
    repointed_cases: openCases.length,
    ended_links: relationships.length,
  });

  return { repointedCases: openCases.length, endedLinks: relationships.length };
}

/** Re-point an open case to another company, keeping the audited case history
 *  trail (same shape as the case-level Change Company action). */
export async function repointCaseCompany(caseId: string, oldCompanyId: string | null, newCompanyId: string | null): Promise<void> {
  const { error } = await supabase
    .from('cases')
    .update({ company_id: newCompanyId })
    .eq('id', caseId);
  if (error) throw error;

  const { error: historyError } = await supabase.rpc('log_case_history', {
    p_case_id: caseId,
    p_action: 'COMPANY_CHANGED',
    p_details: JSON.stringify({ old_company_id: oldCompanyId, new_company_id: newCompanyId, source: 'customer_relationship_change' }),
    p_old_value: oldCompanyId ?? undefined,
    p_new_value: newCompanyId ?? undefined,
  });
  if (historyError) logger.error('Case company re-pointed but history log failed:', historyError);
}
