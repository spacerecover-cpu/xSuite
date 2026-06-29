// src/lib/inventory/inventorySequenceService.ts
//
// Service helpers for per-device-type inventory number sequences.
// Scopes follow the pattern `inventory:<device_type_id>`.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import type { Database } from '../../types/database.types';

type NumberSequenceRow = Database['public']['Tables']['number_sequences']['Row'];

export const INVENTORY_SEQUENCES_QUERY_KEY = ['number_sequences', 'inventory'] as const;

/** Returns all `inventory:<id>` scoped sequences for the current tenant. */
export async function fetchInventorySequences(): Promise<NumberSequenceRow[]> {
  const { data, error } = await supabase
    .from('number_sequences')
    .select('*')
    .like('scope', 'inventory:%')
    .order('scope', { ascending: true });

  if (error) throw error;
  return (data ?? []) as NumberSequenceRow[];
}

export function useInventorySequences() {
  return useQuery<NumberSequenceRow[]>({
    queryKey: INVENTORY_SEQUENCES_QUERY_KEY,
    queryFn: fetchInventorySequences,
    staleTime: 60 * 1000,
  });
}

/**
 * Upsert a `number_sequences` row for the given device type via the shared RPC.
 * This creates the row if it does not exist yet (lazy-seed equivalent).
 */
export async function updateInventorySequence(
  deviceTypeId: string,
  prefix: string,
  padding: number,
  resetAnnually: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('update_number_sequence', {
    p_scope: `inventory:${deviceTypeId}`,
    p_prefix: prefix,
    p_padding: padding,
    p_reset: resetAnnually,
  });

  if (error) throw error;
}

/** Format a next-number preview from a sequence row or catalog defaults. */
export function formatNextNumber(prefix: string, currentValue: number, padding: number): string {
  const next = currentValue + 1;
  return `${prefix}-${next.toString().padStart(padding, '0')}`;
}

/** Format the current (last-allocated) number, or '—' if none allocated yet. */
export function formatCurrentNumber(prefix: string, currentValue: number, padding: number): string {
  if (currentValue === 0) return '—';
  return `${prefix}-${currentValue.toString().padStart(padding, '0')}`;
}
