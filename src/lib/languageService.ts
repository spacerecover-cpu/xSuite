import { supabase } from './supabaseClient';
import type { LanguageRow } from './locale';

// A1-hydrate (Country Engine Phase 2): fetch the active UI languages from
// geo_languages so hydrateLanguages can widen the supported-language + RTL sets
// at runtime (no redeploy). A failed/empty read returns [] → hydrateLanguages is
// a no-op → the in-bundle {en,ar} bootstrap is preserved.
export async function fetchActiveLanguages(): Promise<LanguageRow[]> {
  try {
    const { data, error } = await supabase
      .from('geo_languages')
      .select('code, is_rtl')
      .eq('is_active', true);
    if (error || !data) return [];
    return data.map((r) => ({ code: r.code, is_rtl: !!r.is_rtl }));
  } catch {
    return [];
  }
}
