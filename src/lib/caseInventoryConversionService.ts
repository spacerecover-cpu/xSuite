import { supabase } from './supabaseClient';
import { logger } from './logger';

/**
 * Case → Inventory conversion.
 *
 * When a customer never collects their device after a completed case, the lab
 * keeps it as donor/spare-parts stock. This service is the thin client wrapper
 * over the `convert_case_device_to_inventory` SECURITY DEFINER RPC, which does
 * the whole conversion atomically server-side: it copies the device's hardware
 * attributes into a new `inventory_items` row, auto-numbers it (per device type),
 * stamps provenance (`source_case_id` / `source_case_device_id` /
 * `inventory_source='case_conversion'` / `converted_by` / `converted_at`), and
 * writes both a chain-of-custody event and a case-history entry. Conversion is
 * per physical device — never one collapsed record for a multi-device job.
 */

export interface ConvertCaseDeviceParams {
  caseId: string;
  caseDeviceId: string;
  /** Inventory-side condition (master_inventory_condition_types). NOT copied from
   *  the case — the two condition catalogs do not share ids. */
  conditionId?: string | null;
  /** Inventory status; the RPC defaults to "Available" when omitted. */
  statusId?: string | null;
  locationId?: string | null;
  /** Converted abandoned drives are donor stock by default. */
  isDonor?: boolean;
  notes?: string | null;
  /** Optional display-name override; the RPC synthesizes one from brand/model/capacity. */
  name?: string | null;
  /** Abandonment / unclaimed-property basis, recorded in the custody metadata. */
  legalBasis?: string | null;
  /** Allow a second inventory item from a device that was already converted. */
  allowDuplicate?: boolean;
}

export interface ConvertCaseDeviceResult {
  inventory_item_id: string;
  item_number: string | null;
  source_case_id: string;
  source_case_device_id: string;
  reconverted: boolean;
}

/** One inventory item that originated from a given case (for the case indicator). */
export interface ConvertedInventoryRef {
  id: string;
  item_number: string | null;
  name: string;
  source_case_device_id: string | null;
  device_type_id: string | null;
}

export async function convertCaseDeviceToInventory(
  params: ConvertCaseDeviceParams,
): Promise<ConvertCaseDeviceResult> {
  const { data, error } = await supabase.rpc('convert_case_device_to_inventory', {
    p_case_id: params.caseId,
    p_case_device_id: params.caseDeviceId,
    p_condition_id: params.conditionId ?? undefined,
    p_status_id: params.statusId ?? undefined,
    p_location_id: params.locationId ?? undefined,
    p_is_donor: params.isDonor ?? true,
    p_notes: params.notes ?? undefined,
    p_name: params.name ?? undefined,
    p_legal_basis: params.legalBasis ?? undefined,
    p_allow_duplicate: params.allowDuplicate ?? false,
  });

  if (error) throw error;
  return data as unknown as ConvertCaseDeviceResult;
}

/** Inventory items created from this case, for the "In inventory" indicator and
 *  the convert modal's already-converted markers. */
export async function getInventoryConvertedFromCase(
  caseId: string,
): Promise<ConvertedInventoryRef[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, item_number, name, source_case_device_id, device_type_id')
    .eq('source_case_id', caseId)
    .is('deleted_at', null)
    .order('converted_at', { ascending: true });

  if (error) {
    logger.error('Error fetching inventory converted from case:', error);
    throw error;
  }
  return (data ?? []) as ConvertedInventoryRef[];
}
