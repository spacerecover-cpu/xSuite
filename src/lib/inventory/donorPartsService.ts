// src/lib/inventory/donorPartsService.ts
//
// Donor-part read/write for the inventory_donor_parts table.
// tenant_id and created_by are stamped by DB triggers — never set from client.
// Reconcile (setItemDonorParts) is idempotent: upsert present, soft-delete absent.
//
// Inventory V2 P4.

import { supabase, resolveTenantId } from '../supabaseClient';
import { logger } from '../logger';
import type { Database } from '../../types/database.types';

export type DonorPartRow = Database['public']['Tables']['inventory_donor_parts']['Row'];

export interface DonorPartInput {
  part_type: string;
  quantity: number;
  condition_id?: string | null;
  notes?: string | null;
}

/**
 * Fetch all non-deleted donor parts for an inventory item.
 */
export async function getItemDonorParts(itemId: string): Promise<DonorPartRow[]> {
  const { data, error } = await supabase
    .from('inventory_donor_parts')
    .select('*')
    .eq('item_id', itemId)
    .is('deleted_at', null)
    .order('created_at');
  if (error) {
    logger.error('donorPartsService.getItemDonorParts error', error);
    throw error;
  }
  return (data ?? []) as DonorPartRow[];
}

/**
 * Reconcile the donor parts for an item.
 *
 * Strategy:
 *  1. Fetch existing non-deleted rows for this item.
 *  2. For each provided part:
 *     - If a live row with the same part_type exists, UPDATE it (qty/condition/notes).
 *     - Otherwise INSERT a new row.
 *  3. For any existing row whose part_type is NOT in the provided list, soft-delete it.
 *
 * This makes the call fully idempotent — re-submitting the same set of parts
 * is a no-op at the data level.
 */
export async function setItemDonorParts(
  itemId: string,
  parts: DonorPartInput[],
): Promise<void> {
  // 1. Load existing
  const existing = await getItemDonorParts(itemId);
  const existingByType = new Map<string, DonorPartRow>(
    existing.map(r => [r.part_type, r]),
  );

  const providedTypes = new Set(parts.map(p => p.part_type));

  // Resolve tenant id once for all inserts in this reconcile call
  const tenantId = await resolveTenantId();

  // 2. Upsert provided parts
  for (const part of parts) {
    const existingRow = existingByType.get(part.part_type);
    if (existingRow) {
      // UPDATE existing row
      const { error } = await supabase
        .from('inventory_donor_parts')
        .update({
          quantity: part.quantity,
          condition_id: part.condition_id ?? null,
          notes: part.notes ?? null,
        })
        .eq('id', existingRow.id);
      if (error) {
        logger.error('donorPartsService.setItemDonorParts update error', error);
        throw error;
      }
    } else {
      // INSERT new row.
      // tenant_id is required by the Insert TS type; the trigger will overwrite
      // it server-side (same pattern as all other tenant-stamped inserts).
      const { error } = await supabase
        .from('inventory_donor_parts')
        .insert({
          item_id: itemId,
          part_type: part.part_type,
          quantity: part.quantity,
          condition_id: part.condition_id ?? null,
          notes: part.notes ?? null,
          tenant_id: tenantId,
        });
      if (error) {
        logger.error('donorPartsService.setItemDonorParts insert error', error);
        throw error;
      }
    }
  }

  // 3. Soft-delete removed parts
  const toDelete = existing.filter(r => !providedTypes.has(r.part_type));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('inventory_donor_parts')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', toDelete.map(r => r.id));
    if (error) {
      logger.error('donorPartsService.setItemDonorParts soft-delete error', error);
      throw error;
    }
  }
}
