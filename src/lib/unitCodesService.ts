import { supabase } from './supabaseClient';

export interface UnitCode {
  code: string;
  uqc_code: string | null;
  label: string;
  scheme: string;
}

let cache: UnitCode[] | null = null;

export async function listUnitCodes(): Promise<UnitCode[]> {
  if (cache) return cache;
  const { data, error } = await supabase
    .from('master_unit_codes')
    .select('code, uqc_code, labels_i18n, scheme')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order');
  if (error) throw error;
  cache = (data ?? []).map((r) => ({
    code: r.code,
    uqc_code: r.uqc_code,
    label: ((r.labels_i18n as Record<string, string> | null)?.en) ?? r.code,
    scheme: r.scheme,
  }));
  return cache;
}

export function clearUnitCodesCache(): void {
  cache = null;
}
