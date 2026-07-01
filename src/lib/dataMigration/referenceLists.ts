import { supabase } from '../supabaseClient';
import type { WorkbookDomain } from './workbookContract';
import type { ReferenceLists } from './workbookBuilder';

/**
 * Fetch the global master-data lists (payment methods, currencies, device catalogs, case
 * priorities, expense categories, etc.) relevant to a domain, for the import template's
 * "Reference (Valid Values)" sheet. Lets an admin map their data to the exact names the
 * importer resolves — and see what's missing so they can add it in Settings.
 *
 * Best-effort: on any error returns {} so the template still downloads (without the block).
 */
export async function fetchReferenceLists(domain: WorkbookDomain): Promise<ReferenceLists> {
  try {
    const { data, error } = await supabase.rpc('data_migration_reference_lists', { p_domain: domain });
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) return {};
    const out: ReferenceLists = {};
    for (const [label, values] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(values)) {
        out[label] = values.filter((v): v is string => typeof v === 'string' && v.length > 0);
      }
    }
    return out;
  } catch {
    return {};
  }
}
