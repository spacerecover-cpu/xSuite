import { supabase } from './supabaseClient';

// A2 (Country Engine Phase 2): lazy loader for the DB-backed translation catalog
// (i18n_translations). The bundled en/ar resources in i18n.ts stay the anti-flash
// + offline baseline; this seam fetches a namespace on demand for any language.
// Registering this as a live i18next backend is a deliberate follow-up — shipping
// the tested loader first keeps the existing bundled init untouched.

/** Load one (language, namespace) slice as a flat key→value map. Empty/error
 *  result falls back to the en slice; en itself missing returns {}. Never throws. */
export async function loadNamespace(lang: string, ns: string): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase
      .from('i18n_translations')
      .select('key, value')
      .eq('language_code', lang)
      .eq('namespace', ns)
      .is('deleted_at', null);

    if (error || !data || data.length === 0) {
      return lang !== 'en' ? loadNamespace('en', ns) : {};
    }

    const out: Record<string, string> = {};
    for (const row of data) {
      if (row && typeof row.key === 'string' && typeof row.value === 'string') {
        out[row.key] = row.value;
      }
    }
    return out;
  } catch {
    return lang !== 'en' ? loadNamespace('en', ns) : {};
  }
}
