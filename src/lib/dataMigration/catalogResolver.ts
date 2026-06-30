import { supabase } from '../supabaseClient';

export interface CatalogMaps {
  deviceTypes: Map<string, string>;
  brands: Map<string, string>;
  capacities: Map<string, string>;
  interfaces: Map<string, string>;
  conditions: Map<string, string>;
}

const norm = (name: string): string => name.trim().toLowerCase();

async function loadOne(table: string): Promise<Map<string, string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from(table as any) as any)
    .select('id, name')
    .eq('is_active', true);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; name: string | null }>) {
    if (row.name) map.set(norm(row.name), row.id);
  }
  return map;
}

/** Loads name(lowercased)→uuid maps for the device catalogs used by import resolution. */
export async function loadCatalogMaps(): Promise<CatalogMaps> {
  const [deviceTypes, brands, capacities, interfaces, conditions] = await Promise.all([
    loadOne('catalog_device_types'),
    loadOne('catalog_device_brands'),
    loadOne('catalog_device_capacities'),
    loadOne('catalog_device_interfaces'),
    loadOne('catalog_device_conditions'),
  ]);
  return { deviceTypes, brands, capacities, interfaces, conditions };
}
