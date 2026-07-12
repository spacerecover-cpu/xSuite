import { supabase, getTenantId } from './supabaseClient';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { logger } from './logger';
import type { Database } from '../types/database.types';

export type InventoryCategory = Database['public']['Tables']['master_inventory_categories']['Row'];
export type InventoryStatusType = Database['public']['Tables']['master_inventory_status_types']['Row'];
export type InventoryConditionType = Database['public']['Tables']['master_inventory_condition_types']['Row'];
export type InventoryItem = Database['public']['Tables']['inventory_items']['Row'];
export type InventoryItemInsert = Database['public']['Tables']['inventory_items']['Insert'];
export type InventoryItemUpdate = Database['public']['Tables']['inventory_items']['Update'];
export type InventoryStatusHistory = Database['public']['Tables']['inventory_status_history']['Row'];
export type InventoryTransaction = Database['public']['Tables']['inventory_transactions']['Row'];
export type InventoryTransactionInsert = Database['public']['Tables']['inventory_transactions']['Insert'];
export type InventoryPhoto = Database['public']['Tables']['inventory_photos']['Row'];
export type InventoryPhotoInsert = Database['public']['Tables']['inventory_photos']['Insert'];

export async function getInventoryCategories() {
  const { data, error } = await supabase
    .from('master_inventory_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    logger.error('Error fetching inventory categories:', error);
    throw error;
  }
  return (data ?? []) as InventoryCategory[];
}

export async function getInventoryStatusTypes() {
  const { data, error } = await supabase
    .from('master_inventory_status_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    logger.error('Error fetching inventory status types:', error);
    throw error;
  }
  return (data ?? []) as InventoryStatusType[];
}

export async function getInventoryConditionTypes() {
  const { data, error } = await supabase
    .from('master_inventory_condition_types')
    .select('*')
    .eq('is_active', true)
    .order('rating', { ascending: false });

  if (error) throw error;
  return (data ?? []) as InventoryConditionType[];
}

export interface InventorySpecFilters {
  device_type_id?: string;
  pcb_number?: string;
  firmware?: string;
  controller?: string;
  head_map?: string;
  dcm?: string;
  chipset?: string;
  barcode?: string;
  serial_number?: string;
}

export type InventoryFilters = {
  category_id?: string;
  status_id?: string;
  condition_id?: string;
  location_id?: string;
  search?: string;
} & InventorySpecFilters;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFilterBuilder = any;

function applyInventoryFilters(
  query: AnyFilterBuilder,
  filters: InventoryFilters | undefined,
): AnyFilterBuilder {
  if (!filters) return query;

  let q: AnyFilterBuilder = query;

  if (filters.category_id) q = q.eq('category_id', filters.category_id);
  if (filters.status_id) q = q.eq('status_id', filters.status_id);
  if (filters.condition_id) q = q.eq('condition_id', filters.condition_id);
  if (filters.location_id) q = q.eq('location_id', filters.location_id);
  if (filters.device_type_id) q = q.eq('device_type_id', filters.device_type_id);

  if (filters.search) {
    const s = sanitizeFilterValue(filters.search);
    q = q.or(
      `name.ilike.%${s}%,` +
      `item_number.ilike.%${s}%,` +
      `serial_number.ilike.%${s}%,` +
      `model.ilike.%${s}%,` +
      `barcode.ilike.%${s}%`
    );
  }

  if (filters.barcode) {
    const b = sanitizeFilterValue(filters.barcode);
    q = q.ilike('barcode', `%${b}%`);
  }

  if (filters.serial_number) {
    const v = sanitizeFilterValue(filters.serial_number);
    q = q.ilike('serial_number', `%${v}%`);
  }

  // Specs live in technical_details jsonb (the wizard writes everything there by
  // def.key — the legacy pcb_number/firmware_version/dcm columns are unused), so
  // ALL spec filters must target technical_details, not the legacy columns.
  if (filters.pcb_number) {
    const v = sanitizeFilterValue(filters.pcb_number);
    q = q.ilike('technical_details->>pcb_number', `%${v}%`);
  }

  if (filters.firmware) {
    const v = sanitizeFilterValue(filters.firmware);
    q = q.ilike('technical_details->>firmware_version', `%${v}%`);
  }

  if (filters.dcm) {
    const v = sanitizeFilterValue(filters.dcm);
    q = q.ilike('technical_details->>dcm', `%${v}%`);
  }

  if (filters.controller) {
    const v = sanitizeFilterValue(filters.controller);
    q = q.ilike('technical_details->>controller', `%${v}%`);
  }

  if (filters.head_map) {
    const v = sanitizeFilterValue(filters.head_map);
    q = q.ilike('technical_details->>physical_head_map', `%${v}%`);
  }

  if (filters.chipset) {
    const v = sanitizeFilterValue(filters.chipset);
    q = q.ilike('technical_details->>chipset', `%${v}%`);
  }

  return q;
}

export async function getInventoryItems(filters?: InventoryFilters) {
  let query = supabase
    .from('inventory_items')
    .select(`
      *,
      category:master_inventory_categories(id, name, color_code),
      status_type:master_inventory_status_types(id, name, color_code, is_available_status),
      condition_type:master_inventory_condition_types(id, rating, name, color_code),
      brand:catalog_device_brands(id, name),
      device_type:catalog_device_types(id, name),
      capacity:catalog_device_capacities(id, name, gb_value),
      storage_location:inventory_locations(id, name),
      interface:catalog_interfaces(id, name)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  query = applyInventoryFilters(query, filters);

  const { data, error } = await query;

  if (error) {
    logger.error('Error fetching inventory items:', error);
    throw error;
  }

  const items = data ?? [];
  return await enrichItemsWithStockCount(items);
}

export async function getInventoryItemsPage(filters?: InventoryFilters & { page?: number; pageSize?: number }) {
  const pageSize = filters?.pageSize ?? 50;
  const page = filters?.page ?? 0;

  let query = supabase
    .from('inventory_items')
    .select(`
      *,
      category:master_inventory_categories(id, name, color_code),
      status_type:master_inventory_status_types(id, name, color_code, is_available_status),
      condition_type:master_inventory_condition_types(id, rating, name, color_code),
      brand:catalog_device_brands(id, name),
      device_type:catalog_device_types(id, name),
      capacity:catalog_device_capacities(id, name, gb_value),
      storage_location:inventory_locations(id, name),
      interface:catalog_interfaces(id, name)
    `, { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  query = applyInventoryFilters(query, filters);

  const { data, error, count } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) {
    logger.error('Error fetching inventory items:', error);
    throw error;
  }

  const rows = await enrichItemsWithStockCount(data ?? []);
  return { rows, total: count ?? 0 };
}

type EnrichableItem = { model: string | null; [key: string]: unknown };
type StockCountRow = {
  model: string | null;
  status_type: { name: string | null; is_available_status: boolean | null } | null;
};

export async function enrichItemsWithStockCount<T extends EnrichableItem>(items: T[]) {
  if (items.length === 0) return items.map(item => ({ ...item, similarCount: 0 }));

  const modelNumbers = items
    .map(item => item.model)
    .filter((model): model is string => Boolean(model && model.trim() !== ''));

  if (modelNumbers.length === 0) {
    return items.map(item => ({ ...item, similarCount: 0 }));
  }

  const { data: availableItems, error } = await supabase
    .from('inventory_items')
    .select('model, status_type:master_inventory_status_types(name, is_available_status)')
    .is('deleted_at', null)
    .in('model', modelNumbers);

  if (error) {
    logger.error('Error fetching available stock counts:', error);
    return items.map(item => ({ ...item, similarCount: 0 }));
  }

  const stockCounts: Record<string, number> = {};

  const rows = (availableItems ?? []) as unknown as StockCountRow[];
  rows.forEach((row) => {
    const statusName = row.status_type?.name?.toLowerCase() ?? '';
    const isExcluded = statusName.includes('disposed') || statusName.includes('defective');

    if (row.model && !isExcluded) {
      stockCounts[row.model] = (stockCounts[row.model] ?? 0) + 1;
    }
  });

  return items.map(item => ({
    ...item,
    similarCount: item.model ? (stockCounts[item.model] ?? 0) : 0
  }));
}

export async function getInventoryItemById(id: string) {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      *,
      category:master_inventory_categories(id, name, color_code),
      status_type:master_inventory_status_types(id, name, color_code),
      condition_type:master_inventory_condition_types(id, rating, name, color_code),
      brand:catalog_device_brands(id, name),
      device_type:catalog_device_types(id, name),
      capacity:catalog_device_capacities(id, name, gb_value),
      storage_location:inventory_locations(id, name),
      interface:catalog_interfaces(id, name)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('Error fetching inventory item by ID:', error);
    throw error;
  }
  return data;
}

export async function createInventoryItem(item: InventoryItemInsert) {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert([item])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateInventoryItem(id: string, updates: InventoryItemUpdate) {
  const { data, error } = await supabase
    .from('inventory_items')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteInventoryItem(id: string) {
  const { error } = await supabase
    .from('inventory_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Get next per-device-type inventory number via the `get_next_inventory_number` RPC.
 * Returns a formatted string like "BIG-0001" ready to use as `item_number`.
 */
export async function getNextInventoryNumber(deviceTypeId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_next_inventory_number', {
    p_device_type_id: deviceTypeId,
  });
  if (error) throw error;
  if (!data) throw new Error('Could not allocate an inventory number for this device type');
  return data as string;
}

type StatusTypeRef = { id: string; name: string | null; color_code: string | null };

export async function getInventoryStatusHistory(itemId: string) {
  const { data, error } = await supabase
    .from('inventory_status_history')
    .select(`
      *,
      old_status_id,
      new_status_id
    `)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching inventory status history:', error);
    return [];
  }

  const rows = data ?? [];

  // old_status_id / new_status_id have no FK constraint, so PostgREST cannot embed
  // master_inventory_status_types — fetch the lookup rows separately and attach them.
  const statusIds = Array.from(
    new Set(
      rows
        .flatMap((row) => [row.old_status_id, row.new_status_id])
        .filter((id): id is string => Boolean(id))
    )
  );

  const statusMap = new Map<string, StatusTypeRef>();
  if (statusIds.length > 0) {
    const { data: statusTypes } = await supabase
      .from('master_inventory_status_types')
      .select('id, name, color_code')
      .in('id', statusIds);

    (statusTypes ?? []).forEach((status) => {
      statusMap.set(status.id, status);
    });
  }

  return rows.map((row) => ({
    ...row,
    old_status: row.old_status_id ? statusMap.get(row.old_status_id) ?? null : null,
    new_status: row.new_status_id ? statusMap.get(row.new_status_id) ?? null : null,
  }));
}

export async function getInventoryTransactions(itemId: string) {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching inventory transactions:', error);
    return [];
  }
  return data ?? [];
}

export async function createInventoryTransaction(transaction: InventoryTransactionInsert) {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .insert([transaction])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function adjustInventoryQuantity(
  itemId: string,
  quantityChange: number,
  transactionType: 'receipt' | 'issue' | 'adjustment' | 'return' | 'transfer' | 'write_off',
  reason: string,
  notes?: string
) {
  const MAX_ATTEMPTS = 5;
  let updatedItem: InventoryItem | null = null;

  // Compare-and-set retry loop: each attempt re-reads the current quantity and
  // only applies the delta if the row still holds the value we read. This stops
  // concurrent adjustments from silently overwriting each other (lost update)
  // without needing a DB-side atomic increment.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: item, error: fetchError } = await supabase
      .from('inventory_items')
      .select('quantity')
      .eq('id', itemId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!item) throw new Error(`Inventory item ${itemId} not found`);

    const quantityBefore = item.quantity ?? 0;
    const quantityAfter = quantityBefore + quantityChange;

    if (quantityAfter < 0) {
      throw new Error(
        `Adjustment would drive inventory item ${itemId} below zero (have ${quantityBefore}, change ${quantityChange})`
      );
    }

    let update = supabase
      .from('inventory_items')
      .update({ quantity: quantityAfter })
      .eq('id', itemId);
    // Guard on the exact value we read; NULL must be matched with .is(), not .eq().
    update = item.quantity === null || item.quantity === undefined
      ? update.is('quantity', null)
      : update.eq('quantity', item.quantity);

    const { data, error: updateError } = await update.select().maybeSingle();

    if (updateError) throw updateError;

    if (data) {
      updatedItem = data as InventoryItem;
      break;
    }
    // No row matched: another writer changed the quantity between our read and
    // write. Fall through to re-read and retry with the fresh value.
  }

  if (!updatedItem) {
    throw new Error(
      `Failed to adjust inventory item ${itemId} after ${MAX_ATTEMPTS} concurrent attempts`
    );
  }

  // Write the ledger row only after the quantity change has committed, so a
  // failed/rejected update can never leave a phantom transaction behind.
  const { data: user } = await supabase.auth.getUser();
  await createInventoryTransaction({
    item_id: itemId,
    tenant_id: updatedItem.tenant_id,
    transaction_type: transactionType,
    quantity: quantityChange,
    reference_type: 'manual',
    performed_by: user?.user?.id ?? null,
    notes: [reason, notes].filter(Boolean).join(' - '),
  });

  return updatedItem;
}

export async function getInventoryPhotos(itemId: string) {
  const { data, error } = await supabase
    .from('inventory_photos')
    .select('*')
    .eq('item_id', itemId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as InventoryPhoto[];
}

export async function addInventoryPhoto(photo: InventoryPhotoInsert) {
  const { data, error } = await supabase
    .from('inventory_photos')
    .insert([photo])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data as InventoryPhoto | null;
}

export async function deleteInventoryPhoto(photoId: string) {
  const { error } = await supabase
    .from('inventory_photos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', photoId);

  if (error) throw error;
}

export async function getInventoryValueByCategory() {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      quantity,
      purchase_price,
      category:master_inventory_categories(id, name)
    `)
    .is('deleted_at', null);

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    quantity: number | null;
    purchase_price: number | null;
    category: { id: string; name: string } | null;
  }>;

  const grouped = new Map<string, { category_id: string; category_name: string; total_value: number; total_quantity: number }>();
  rows.forEach((row) => {
    const id = row.category?.id ?? 'uncategorized';
    const name = row.category?.name ?? 'Uncategorized';
    const value = (row.purchase_price ?? 0) * (row.quantity ?? 0);
    const existing = grouped.get(id);
    if (existing) {
      existing.total_value += value;
      existing.total_quantity += row.quantity ?? 0;
    } else {
      grouped.set(id, {
        category_id: id,
        category_name: name,
        total_value: value,
        total_quantity: row.quantity ?? 0,
      });
    }
  });
  return Array.from(grouped.values());
}

export async function calculateTotalInventoryValue() {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('quantity, purchase_price')
    .is('deleted_at', null);

  if (error) throw error;

  const rows = (data ?? []) as Array<{ quantity: number | null; purchase_price: number | null }>;
  return rows.reduce((sum, row) => sum + ((row.purchase_price ?? 0) * (row.quantity ?? 0)), 0);
}

export type InventorySearchTemplate = Database['public']['Tables']['inventory_search_templates']['Row'];

export async function getInventorySearchTemplates(): Promise<InventorySearchTemplate[]> {
  const { data, error } = await supabase
    .from('inventory_search_templates')
    .select('*')
    .is('deleted_at', null)
    .order('last_used_at', { ascending: false, nullsFirst: false });

  if (error) {
    logger.error('Error fetching inventory search templates:', error);
    return [];
  }
  return data ?? [];
}

export async function saveInventorySearchTemplate(
  name: string,
  criteria: InventorySpecFilters & { search?: string; category_id?: string; status_id?: string; location_id?: string },
): Promise<InventorySearchTemplate | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const tenantId = getTenantId();
  if (!tenantId) throw new Error('Tenant not resolved');

  const { data, error } = await supabase
    .from('inventory_search_templates')
    .insert({ name, criteria: criteria as Database['public']['Tables']['inventory_search_templates']['Insert']['criteria'], created_by: user.id, tenant_id: tenantId })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteInventorySearchTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_search_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function touchInventorySearchTemplate(id: string): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase
    .from('inventory_search_templates')
    .select('usage_count')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) {
    logger.error('Error fetching template for touch:', fetchErr);
    return;
  }

  const { error } = await supabase
    .from('inventory_search_templates')
    .update({
      last_used_at: new Date().toISOString(),
      usage_count: ((existing?.usage_count ?? 0) + 1),
    })
    .eq('id', id);

  if (error) {
    logger.error('Error touching inventory search template (non-fatal):', error);
  }
}

export async function getInventoryStatistics() {
  const { data: items, error } = await supabase
    .from('inventory_items')
    .select('quantity, purchase_price, status_id')
    .is('deleted_at', null);

  if (error) {
    logger.error('Error fetching inventory statistics:', error);
    throw error;
  }

  if (!items) {
    return {
      totalItems: 0,
      totalInStock: 0,
      totalInUse: 0,
      totalValue: 0,
    };
  }

  const totalItems = items.length;
  const totalInStock = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  const totalValue = items.reduce((sum, item) => {
    return sum + ((item.purchase_price ?? 0) * (item.quantity ?? 0));
  }, 0);

  return {
    totalItems,
    totalInStock,
    totalInUse: 0,
    totalValue,
  };
}

export interface InventoryInsights {
  hddCount: number;
  ssdCount: number;
  pcbCount: number;
  totalValue: number;
  totalInUse: number;
}

export async function getInventoryInsights(): Promise<InventoryInsights> {
  const { data: items, error } = await supabase
    .from('inventory_items')
    .select(`
      id,
      quantity,
      purchase_price,
      category:master_inventory_categories(name)
    `)
    .is('deleted_at', null);

  if (error) {
    logger.error('Error fetching inventory insights:', error);
    throw error;
  }

  let hddCount = 0;
  let ssdCount = 0;
  let pcbCount = 0;
  let totalValue = 0;

  if (!items) {
    return {
      hddCount: 0,
      ssdCount: 0,
      pcbCount: 0,
      totalValue: 0,
      totalInUse: 0,
    };
  }

  const rows = items as unknown as Array<{
    id: string;
    quantity: number | null;
    purchase_price: number | null;
    category: { name: string | null } | null;
  }>;

  rows.forEach((item) => {
    const categoryName = item.category?.name?.toLowerCase() ?? '';
    const quantity = item.quantity ?? 0;
    const cost = item.purchase_price ?? 0;

    totalValue += (cost * quantity);

    if (
      categoryName.includes('hard drive') ||
      categoryName.includes('hard disk') ||
      categoryName.includes('hdd')
    ) {
      hddCount += quantity;
    } else if (
      categoryName.includes('ssd') ||
      categoryName.includes('nvme') ||
      categoryName.includes('m.2') ||
      categoryName.includes('solid state')
    ) {
      ssdCount += quantity;
    }

    if (
      categoryName.includes('pcb') ||
      categoryName.includes('circuit board')
    ) {
      pcbCount += quantity;
    }
  });

  return {
    hddCount,
    ssdCount,
    pcbCount,
    totalValue,
    totalInUse: 0,
  };
}
