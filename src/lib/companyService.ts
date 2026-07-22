import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Database } from '../types/database.types';
import { assertPartyTaxNumberValid } from './regimes/partyTaxValidation';

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
type CompanyUpdate = Database['public']['Tables']['companies']['Update'];
type RelationshipInsert = Database['public']['Tables']['customer_company_relationships']['Insert'];

// uuid FK columns reject empty strings ("invalid input syntax for type uuid") —
// a 400 the generated types would otherwise hide. Forms send '' for an unset
// <select>, so coerce blanks to null before any write.
const uuidOrNull = (v?: string | null) => (v && v.trim() !== '' ? v : null);

// company_name is a GENERATED column (ALWAYS AS name). Postgres rejects every
// write to it — on INSERT: `cannot insert a non-DEFAULT value into column
// "company_name"`; on UPDATE: `column "company_name" can only be updated to
// DEFAULT`. It is always derived from `name`, so it must never appear in a write
// payload. This is the single chokepoint that guarantees that for ALL company
// writes (createCompany + updateCompany), regardless of what a caller passes.
function stripGeneratedColumns(payload: Record<string, unknown>): Record<string, unknown> {
  delete payload.company_name;
  return payload;
}

/**
 * Non-consuming preview of the next company number. Mirrors the DB
 * `get_next_number('companies')` legacy branch (all sequences have a NULL
 * format_template): `prefix || '-' || LPAD(current_value + 1, padding)`, with
 * an annual-reset short-circuit. Read-only — the real number is allocated at
 * insert time by `get_next_company_number()`.
 */
export async function getNextCompanyNumberPreview(): Promise<string | null> {
  const { data, error } = await supabase
    .from('number_sequences')
    .select('prefix, padding, current_value, reset_annually, last_reset_year')
    .eq('scope', 'companies')
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error('Failed to preview next company number:', error);
    return null;
  }
  const prefix = data?.prefix ?? 'COMP';
  const padding = data?.padding ?? 4;
  const currentYear = new Date().getFullYear();
  let nextVal: number;
  if (!data) {
    nextVal = 1;
  } else if (data.reset_annually && (data.last_reset_year == null || data.last_reset_year < currentYear)) {
    nextVal = 1;
  } else {
    nextVal = (data.current_value ?? 0) + 1;
  }
  return `${prefix}-${String(nextVal).padStart(padding, '0')}`;
}

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
  address_line1?: string | null;
  address_line2?: string | null;
  subdivision_id?: string | null;
  postal_code?: string | null;
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

  await assertPartyTaxNumberValid({
    countryId: input.country_id ?? null,
    subdivisionId: input.subdivision_id ?? null,
    taxNumber: input.tax_number ?? null,
  });

  const { data: companyNumber, error: numberError } = await supabase.rpc('get_next_company_number');
  if (numberError) throw numberError;

  const payload = stripGeneratedColumns({
    ...input,
    company_number: companyNumber,
    name: resolvedName,
    industry_id: uuidOrNull(input.industry_id),
    country_id: uuidOrNull(input.country_id),
    city_id: uuidOrNull(input.city_id),
    subdivision_id: uuidOrNull(input.subdivision_id),
    created_by: uuidOrNull(input.created_by),
  }) as CompanyInsert;

  const { data: newCompany, error: createError } = await supabase
    .from('companies')
    .insert(payload)
    .select()
    .maybeSingle();
  if (createError) throw createError;
  if (!newCompany) throw new Error('Failed to create company');

  if (primaryContactId) {
    // A customer can hold only one primary company (uq_customer_primary_company).
    // Demote any existing live primary first so this selection wins, rather than
    // tripping a 23505 that would silently drop the user's chosen contact.
    const { data: existingPrimary } = await supabase
      .from('customer_company_relationships')
      .select('id')
      .eq('customer_id', primaryContactId)
      .eq('is_primary', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingPrimary) {
      await supabase
        .from('customer_company_relationships')
        .update({ is_primary: false })
        .eq('id', existingPrimary.id);
    }
    const { error: relError } = await supabase
      .from('customer_company_relationships')
      .insert({ customer_id: primaryContactId, company_id: newCompany.id, is_primary: true } as RelationshipInsert);
    if (relError) {
      logger.warn('Failed to link primary contact to company', { companyId: newCompany.id, primaryContactId, error: relError });
    }
  }

  return newCompany;
}

/**
 * Update a company. Counterpart to createCompany: strips the generated
 * `company_name` column and coerces blank uuid FKs to null, so no call site can
 * trip the "cannot ... company_name" / uuid-syntax 400s. EVERY company write
 * should go through createCompany or updateCompany — never a raw
 * supabase.from('companies').update(), which is how the generated-column bug
 * kept leaking back in (it was only ever patched at the insert in #155).
 * tenant_id / updated_* are stamped server-side by the audit trigger.
 */
export async function updateCompany(id: string, input: CompanyUpdate): Promise<CompanyRow> {
  if (!id) throw new Error('Company id is required');

  if (typeof input.tax_number === 'string' && input.tax_number.trim() !== '') {
    const { data: ctxRow } = await supabase
      .from('companies').select('country_id, subdivision_id').eq('id', id).maybeSingle();
    await assertPartyTaxNumberValid({
      countryId: (input.country_id as string | null | undefined) ?? ctxRow?.country_id ?? null,
      subdivisionId: (input.subdivision_id as string | null | undefined) ?? ctxRow?.subdivision_id ?? null,
      taxNumber: input.tax_number,
    });
  }

  const patch = stripGeneratedColumns({ ...input }) as CompanyUpdate;
  for (const key of ['industry_id', 'country_id', 'city_id'] as const) {
    if (key in patch) {
      patch[key] = uuidOrNull(patch[key] as string | null | undefined);
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('companies')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error('Failed to update company');

  return updated;
}
