// src/lib/devices/deviceCatalogQueries.ts
import { useQueries } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { masterDataKeys } from '../queryKeys';
import type { CatalogKey } from './deviceFieldConfig';

export interface CatalogOption { id: string; name: string }

export const CATALOG_SOURCES: Record<CatalogKey, { table: string; orderBy: string; queryKey: readonly unknown[]; valueField?: 'id' | 'name' }> = {
  device_types:       { table: 'catalog_device_types',              orderBy: 'name',       queryKey: masterDataKeys.deviceTypes() },
  brands:             { table: 'catalog_device_brands',             orderBy: 'name',       queryKey: masterDataKeys.deviceBrands() },
  capacities:         { table: 'catalog_device_capacities',         orderBy: 'sort_order', queryKey: masterDataKeys.deviceCapacities() },
  conditions:         { table: 'catalog_device_conditions',         orderBy: 'name',       queryKey: masterDataKeys.deviceConditions() },
  accessories:        { table: 'catalog_accessories',               orderBy: 'name',       queryKey: masterDataKeys.deviceAccessories() },
  encryption:         { table: 'catalog_device_encryption',         orderBy: 'name',       queryKey: masterDataKeys.deviceEncryption() },
  interfaces:         { table: 'catalog_interfaces',                orderBy: 'sort_order', queryKey: masterDataKeys.deviceInterfaces() },
  made_in:            { table: 'catalog_device_made_in',            orderBy: 'name',       queryKey: masterDataKeys.deviceMadeIn() },
  head_counts:        { table: 'catalog_device_head_counts',        orderBy: 'sort_order', queryKey: masterDataKeys.deviceHeadCounts() },
  platter_counts:     { table: 'catalog_device_platter_counts',     orderBy: 'sort_order', queryKey: masterDataKeys.devicePlatterCounts() },
  component_statuses: { table: 'catalog_device_component_statuses', orderBy: 'sort_order', queryKey: masterDataKeys.deviceComponentStatuses(), valueField: 'name' },
  service_problems:   { table: 'catalog_service_problems',           orderBy: 'name',       queryKey: masterDataKeys.deviceServiceProblems(),    valueField: 'name' },
};

const KEYS = Object.keys(CATALOG_SOURCES) as CatalogKey[];

async function fetchCatalog(table: string, orderBy: string, valueField: 'id' | 'name' = 'id'): Promise<CatalogOption[]> {
  const { data, error } = await supabase.from(table as never).select('id, name').eq('is_active', true).order(orderBy);
  if (error) throw error;
  return (data ?? []).map(r => {
    const row = r as { id: string | number; name: string };
    return { id: valueField === 'name' ? row.name : String(row.id), name: row.name };
  });
}

export function useDeviceFormCatalogs(): { options: Record<CatalogKey, CatalogOption[]>; isLoading: boolean } {
  const results = useQueries({
    queries: KEYS.map(key => {
      const src = CATALOG_SOURCES[key];
      return { queryKey: src.queryKey, queryFn: () => fetchCatalog(src.table, src.orderBy, src.valueField), staleTime: 5 * 60 * 1000 };
    }),
  });
  const options = {} as Record<CatalogKey, CatalogOption[]>;
  KEYS.forEach((key, i) => { options[key] = (results[i].data as CatalogOption[]) ?? []; });
  return { options, isLoading: results.some(r => r.isLoading) };
}
