import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

export type TenantCurrencyRow = Pick<
  Database['public']['Tables']['tenant_currencies']['Row'],
  'id' | 'currency_code' | 'is_base' | 'is_active' | 'display_order'
>;

/** Throws if `code` is already a (non-deleted) currency for the tenant. Pure. */
export function assertCanAddCurrency(rows: TenantCurrencyRow[], code: string): void {
  if (rows.some((r) => r.currency_code === code)) {
    throw new Error(`${code} is already one of your currencies.`);
  }
}

/** Throws if `id` refers to the base currency (which cannot be deactivated). Pure. */
export function assertCanDeactivate(rows: TenantCurrencyRow[], id: string): void {
  const row = rows.find((r) => r.id === id);
  if (row?.is_base) {
    throw new Error('The base currency cannot be deactivated.');
  }
}

export async function listTenantCurrencies(): Promise<TenantCurrencyRow[]> {
  const { data, error } = await supabase
    .from('tenant_currencies')
    .select('id, currency_code, is_base, is_active, display_order')
    .is('deleted_at', null)
    .order('is_base', { ascending: false })
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addTenantCurrency(code: string): Promise<void> {
  const rows = await listTenantCurrencies();
  assertCanAddCurrency(rows, code);
  const nextOrder = rows.reduce((m, r) => Math.max(m, r.display_order), 0) + 1;
  const { error } = await supabase
    .from('tenant_currencies')
    // tenant_id is stamped by the set_tenant_and_audit_fields trigger.
    .insert([{ tenant_id: '' as string, currency_code: code, is_base: false, is_active: true, display_order: nextOrder }]);
  if (error) throw error;
}

export async function setCurrencyActive(id: string, isActive: boolean): Promise<void> {
  if (!isActive) {
    const rows = await listTenantCurrencies();
    assertCanDeactivate(rows, id);
  }
  const { error } = await supabase.from('tenant_currencies').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

/** Active ISO-4217 currencies offered when adding (excludes already-added). */
export async function listAddableCurrencies(): Promise<{ code: string; name: string | null }[]> {
  const [{ data: all, error }, existing] = await Promise.all([
    supabase.from('master_currency_codes').select('code, name').eq('is_active', true).order('code'),
    listTenantCurrencies(),
  ]);
  if (error) throw error;
  const have = new Set(existing.map((r) => r.currency_code));
  return (all ?? []).filter((c) => !have.has(c.code));
}
