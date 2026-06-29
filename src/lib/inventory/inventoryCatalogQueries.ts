// src/lib/inventory/inventoryCatalogQueries.ts
//
// Inventory-specific catalog queries. Device types need `family`,
// `default_category_id`, and `inventory_prefix` which the case-form catalog
// does not select. Kept separate to avoid broadening the case-form queries.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

export interface InventoryDeviceType {
  id: string;
  name: string;
  family: string | null;
  default_category_id: string | null;
  inventory_prefix: string | null;
  inventory_padding: number;
  icon: string | null;
  is_inventory_tracked: boolean;
}

export interface InventoryLocation {
  id: string;
  name: string;
  parent_id: string | null;
  location_code: string | null;
  description: string | null;
  is_active: boolean | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InventorySupplier {
  id: string;
  name: string;
}

export function useInventoryDeviceTypes() {
  return useQuery<InventoryDeviceType[]>({
    queryKey: ['inventory', 'device-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_types')
        .select('id, name, family, default_category_id, inventory_prefix, inventory_padding, icon, is_inventory_tracked')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as InventoryDeviceType[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useInventoryLocations() {
  return useQuery<InventoryLocation[]>({
    queryKey: ['inventory', 'locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_locations')
        .select('id, name, parent_id, location_code, description, is_active, tenant_id, created_at, updated_at, deleted_at')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []) as InventoryLocation[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useInventorySuppliers() {
  return useQuery<InventorySupplier[]>({
    queryKey: ['inventory', 'suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []) as InventorySupplier[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
