import { supabase } from './supabaseClient';

export interface Subdivision {
  id: string;
  code: string;
  name: string;
  subdivision_type: string | null;
}

/** Active geo_subdivisions rows for a country (e.g. OM governorates), ordered
 *  for stable select-list display. Empty array (never throws-to-caller on a
 *  missing table) when the country has no subdivisions seeded. */
export async function listSubdivisions(countryId: string): Promise<Subdivision[]> {
  const { data, error } = await supabase
    .from('geo_subdivisions')
    .select('id, code, name, subdivision_type')
    .eq('country_id', countryId)
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}
