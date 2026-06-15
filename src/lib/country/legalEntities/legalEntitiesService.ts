import { supabase } from '../../supabaseClient';
import { logger } from '../../logger';
import type { Database } from '../../../types/database.types';

type LegalEntityRow = Database['public']['Tables']['legal_entities']['Row'];
type LegalEntityInsert = Database['public']['Tables']['legal_entities']['Insert'];
type LegalEntityUpdate = Database['public']['Tables']['legal_entities']['Update'];

/** Blank-string uuid FK → null (Postgres rejects '' as uuid → 400). companyService precedent. */
const uuidOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v : null;

export async function listLegalEntities(tenantId: string): Promise<LegalEntityRow[]> {
  const { data, error } = await supabase
    .from('legal_entities')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false });
  if (error) { logger.error('listLegalEntities failed:', error); throw error; }
  return data ?? [];
}

export async function getPrimaryLegalEntity(tenantId: string): Promise<LegalEntityRow | null> {
  const { data, error } = await supabase
    .from('legal_entities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_primary', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) { logger.error('getPrimaryLegalEntity failed:', error); throw error; }
  return data;
}

export async function createLegalEntity(input: {
  tenant_id: string; name: string; country_id: string;
  currency_code: string; tax_system: string;
  subdivision_id?: string | null; tax_identifier?: string | null;
  registration_number?: string | null; is_primary?: boolean;
}): Promise<LegalEntityRow> {
  // Fail-loud (D2): a legal entity must carry a real 3-letter currency — never '' / USD placeholder.
  if (!input.currency_code || input.currency_code.length !== 3) {
    throw new Error(`createLegalEntity: unresolved currency '${input.currency_code}' — fail-loud, no USD default`);
  }
  const payload: LegalEntityInsert = {
    tenant_id: input.tenant_id,
    name: input.name,
    country_id: input.country_id,
    currency_code: input.currency_code,
    tax_system: input.tax_system,
    subdivision_id: uuidOrNull(input.subdivision_id),
    tax_identifier: input.tax_identifier ?? null,
    registration_number: input.registration_number ?? null,
    is_primary: input.is_primary ?? false,
  };
  const { data, error } = await supabase.from('legal_entities').insert(payload).select('*').maybeSingle();
  if (error) { logger.error('createLegalEntity failed:', error); throw error; }
  return data as LegalEntityRow;
}

export async function updateLegalEntity(
  id: string,
  patch: Partial<Omit<LegalEntityRow, 'id' | 'tenant_id' | 'created_at' | 'created_by'>>,
): Promise<LegalEntityRow> {
  const { tenant_id: _drop, ...rest } = patch as Record<string, unknown>; // tenant is immutable
  void _drop;
  const safe = rest as LegalEntityUpdate;
  const { data, error } = await supabase.from('legal_entities').update(safe).eq('id', id).select('*').maybeSingle();
  if (error) { logger.error('updateLegalEntity failed:', error); throw error; }
  return data as LegalEntityRow;
}

export async function softDeleteLegalEntity(id: string): Promise<void> {
  const { error } = await supabase
    .from('legal_entities')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { logger.error('softDeleteLegalEntity failed:', error); throw error; }
}
