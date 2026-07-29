// Pure resolution of the inventory-number preview shown while adding an item.
//
// Two sources exist for an inventory prefix and they are NOT interchangeable:
//   number_sequences.prefix       — per TENANT, scope 'inventory:<device_type_id>'
//   catalog_device_types.inventory_prefix — GLOBAL, shared by every tenant
//
// The DB allocator (get_next_inventory_number) reads the tenant sequence and
// only lazy-seeds from the catalog when the tenant has no row yet. The wizard
// badge used to read the catalog directly, so a tenant that had renamed its
// prefix saw "BIG-…" while the row was written "H35-0043". This mirrors the
// allocator's precedence exactly so the two can never disagree again.
//
// Deliberately kept free of supabase imports so it is unit-testable without env.

export interface PrefixSequence { scope: string; prefix: string | null }
export interface PrefixDeviceType { id: string; inventory_prefix: string | null }

function tenantPrefix(sequences: readonly PrefixSequence[] | undefined, typeId: string): string | null {
  const row = sequences?.find((s) => s.scope === `inventory:${typeId}`);
  const prefix = row?.prefix?.trim();
  return prefix ? prefix : null;
}

/**
 * `PREFIX-…` for the badge, or '' when no prefix can be resolved.
 *
 * The trailing ellipsis is deliberate: the real number is allocated by the DB
 * at insert, so showing a concrete next value would promise something two
 * concurrent users cannot both receive.
 */
export function inventoryNumberPreview(
  sequences: readonly PrefixSequence[] | undefined,
  deviceTypes: readonly PrefixDeviceType[] | undefined,
  typeId: string,
): string {
  if (!typeId) return '';
  const prefix = tenantPrefix(sequences, typeId)
    ?? deviceTypes?.find((d) => d.id === typeId)?.inventory_prefix?.trim()
    ?? '';
  return prefix ? `${prefix}-…` : '';
}

/**
 * Whether saving will make the DB reissue this item's number, mirroring the
 * condition in assign_inventory_item_number's UPDATE branch.
 *
 * `issuedByDeviceTypeId` is inventory_items.item_number_device_type_id. NULL
 * means the number came from outside the managed scheme (legacy, imported or
 * hand-set), which the trigger never auto-reissues — so the UI must not warn
 * about a renumber that will not happen.
 */
export function willReissueNumber(input: {
  issuedByDeviceTypeId: string | null | undefined;
  selectedDeviceTypeId: string | null | undefined;
}): boolean {
  const { issuedByDeviceTypeId, selectedDeviceTypeId } = input;
  if (!issuedByDeviceTypeId || !selectedDeviceTypeId) return false;
  return issuedByDeviceTypeId !== selectedDeviceTypeId;
}
