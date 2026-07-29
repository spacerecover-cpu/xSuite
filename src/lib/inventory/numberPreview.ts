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
// Deliberately free of supabase imports so it is unit-testable without env
// (renderNumberTemplate is a pure formatter with no imports of its own).

import { renderNumberTemplate } from '../numbering/templates';

export interface PrefixSequence {
  scope: string;
  prefix: string | null;
  current_value?: number | null;
  padding?: number | null;
  format_template?: string | null;
  fiscal_year_anchor?: string | null;
}

export interface PrefixDeviceType {
  id: string;
  inventory_prefix: string | null;
  inventory_padding?: number | null;
}

/**
 * The number the next item will receive, e.g. `H35-0050`.
 *
 * Non-consuming: it renders `current_value + 1` without touching the counter,
 * matching what get_next_number would return. Two people adding items at once
 * therefore see the same value and only one will get it — acceptable for a
 * preview, and the reason the DB never takes a client-supplied number here.
 *
 * Template-aware: a sequence carrying a v2 format_template previews through the
 * same {FY}/{SEQ:n} rendering the DB uses, rather than assuming `PREFIX-NNNN`.
 *
 * Returns '' when no prefix or template can be resolved.
 */
export function inventoryNumberPreview(
  sequences: readonly PrefixSequence[] | undefined,
  deviceTypes: readonly PrefixDeviceType[] | undefined,
  typeId: string,
  today?: Date,
): string {
  if (!typeId) return '';

  const seq = sequences?.find((s) => s.scope === `inventory:${typeId}`);
  const seqPrefix = seq?.prefix?.trim();
  const template = seq?.format_template?.trim();

  if (seq && (seqPrefix || template)) {
    const next = (seq.current_value ?? 0) + 1;
    if (template) {
      return renderNumberTemplate(template, next, seq.fiscal_year_anchor ?? null, today);
    }
    return `${seqPrefix}-${String(next).padStart(seq.padding ?? 4, '0')}`;
  }

  // No tenant sequence yet: get_next_inventory_number lazy-seeds from the
  // catalog at current_value 0, so the first item lands on 1.
  const dt = deviceTypes?.find((d) => d.id === typeId);
  const catalogPrefix = dt?.inventory_prefix?.trim();
  if (!catalogPrefix) return '';
  return `${catalogPrefix}-${String(1).padStart(dt?.inventory_padding ?? 4, '0')}`;
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
