import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Database } from '../types/database.types';

type InventoryCaseAssignmentRow = Database['public']['Tables']['inventory_case_assignments']['Row'];

export type AssignmentUsageResult = 'working' | 'defective' | 'partially_working' | 'pending';

export interface InventoryCaseAssignment {
  id: string;
  item_id: string;
  case_id: string;
  // `assigned_at` is nullable in the DB but always populated by the service
  // (it falls back to `created_at` in `decorate()` so consumers can rely on it).
  assigned_at: string;
  assigned_by: string | null;
  returned_at: string | null;
  purpose: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  deleted_at: string | null;
}

export interface AssignmentWithDetails extends InventoryCaseAssignment {
  // Derived/legacy fields preserved for caller UI compatibility.
  // The underlying schema does not store these directly; they are synthesized
  // from `returned_at` (active vs returned) and `notes`.
  is_active: boolean;
  unassigned_at: string | null;
  usage_result: AssignmentUsageResult;
  usage_notes: string | null;
  inventory_item?: {
    id: string;
    name: string;
    inventory_code: string | null;
    model: string | null;
    serial_number: string | null;
    brand?: { name: string } | null;
    capacity?: { name: string } | null;
    status_type?: { name: string; color_code: string | null } | null;
  };
  case?: {
    id: string;
    case_no: string | null;
    title: string | null;
    status: string | null;
    priority?: string | null;
  };
  assigned_by_profile?: {
    id: string;
    full_name: string;
  } | null;
  unassigned_by_profile?: {
    id: string;
    full_name: string;
  } | null;
}

export interface CaseOption {
  id: string;
  case_no: string;
  title: string;
  status: string;
  priority: string;
  customer_name?: string;
}

type InventoryItemEmbed = {
  id: string;
  name: string;
  item_number: string | null;
  model: string | null;
  serial_number: string | null;
  brand: { name: string } | { name: string }[] | null;
  capacity?: { name: string } | { name: string }[] | null;
  status_type?: { name: string; color_code: string | null } | { name: string; color_code: string | null }[] | null;
};

type CaseEmbed = {
  id: string;
  case_no: string | null;
  title: string | null;
  status: string | null;
  priority?: string | null;
};

type AssignmentRowWithEmbeds = InventoryCaseAssignmentRow & {
  inventory_item?: InventoryItemEmbed | InventoryItemEmbed[] | null;
  case?: CaseEmbed | CaseEmbed[] | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeInventoryItem(raw: InventoryItemEmbed | InventoryItemEmbed[] | null | undefined) {
  const item = pickOne(raw);
  if (!item) return undefined;
  return {
    id: item.id,
    name: item.name,
    inventory_code: item.item_number,
    model: item.model,
    serial_number: item.serial_number,
    brand: pickOne(item.brand),
    capacity: pickOne(item.capacity),
    status_type: pickOne(item.status_type),
  };
}

function normalizeCase(raw: CaseEmbed | CaseEmbed[] | null | undefined) {
  const value = pickOne(raw);
  if (!value) return undefined;
  return {
    id: value.id,
    case_no: value.case_no,
    title: value.title,
    status: value.status,
    priority: value.priority ?? null,
  };
}

async function fetchProfileMap(
  ids: ReadonlyArray<string | null>
): Promise<Map<string, { id: string; full_name: string }>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', unique);
  if (error) {
    logger.error('Error fetching profiles for assignments:', error);
    return new Map();
  }
  const map = new Map<string, { id: string; full_name: string }>();
  for (const row of data ?? []) {
    map.set(row.id, { id: row.id, full_name: row.full_name });
  }
  return map;
}

function deriveUsageResult(notes: string | null, returnedAt: string | null): AssignmentUsageResult {
  if (!returnedAt) return 'pending';
  const text = (notes ?? '').toLowerCase();
  if (text.includes('[defective]')) return 'defective';
  if (text.includes('[partially_working]')) return 'partially_working';
  return 'working';
}

function decorate(
  row: AssignmentRowWithEmbeds,
  profiles: Map<string, { id: string; full_name: string }>
): AssignmentWithDetails {
  return {
    id: row.id,
    item_id: row.item_id,
    case_id: row.case_id,
    assigned_at: row.assigned_at ?? row.created_at,
    assigned_by: row.assigned_by,
    returned_at: row.returned_at,
    purpose: row.purpose,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tenant_id: row.tenant_id,
    deleted_at: row.deleted_at,
    is_active: row.returned_at === null,
    unassigned_at: row.returned_at,
    usage_result: deriveUsageResult(row.notes, row.returned_at),
    usage_notes: row.notes,
    inventory_item: normalizeInventoryItem(row.inventory_item),
    case: normalizeCase(row.case),
    assigned_by_profile: row.assigned_by ? profiles.get(row.assigned_by) ?? null : null,
    unassigned_by_profile: null,
  };
}

export async function getCasesForAssignment(): Promise<CaseOption[]> {
  const { data: statusData, error: statusError } = await supabase
    .from('master_case_statuses')
    .select('name')
    .in('type', ['intake', 'diagnosis', 'quoting', 'awaiting_approval', 'approved', 'recovery', 'qa'])
    .eq('is_active', true);

  if (statusError) {
    logger.error('Error fetching active case statuses:', statusError);
    throw statusError;
  }

  const activeStatusNames = (statusData ?? []).map((s) => s.name);

  const { data, error } = await supabase
    .from('cases')
    .select(
      `
      id,
      case_no,
      title,
      status,
      priority,
      customers_enhanced:customer_id (
        customer_name
      )
    `
    )
    .in('status', activeStatusNames)
    .is('deleted_at', null)
    // No row cap: the picker (AssignToCaseModal) loads this list into state and
    // filters it client-side, so any cap silently hides older still-active cases
    // from busy labs — breaking the donor→case linkage for those jobs. The result
    // is already bounded by active-workflow statuses, deleted_at, and tenant RLS.
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching cases for assignment:', error);
    throw error;
  }

  type CaseRow = {
    id: string;
    case_no: string | null;
    title: string | null;
    status: string | null;
    priority: string | null;
    customers_enhanced: { customer_name: string | null } | { customer_name: string | null }[] | null;
  };

  return ((data ?? []) as CaseRow[]).map((item) => {
    const customer = pickOne(item.customers_enhanced);
    return {
      id: item.id,
      case_no: item.case_no ?? '',
      title: item.title ?? 'Untitled Case',
      status: item.status ?? '',
      priority: item.priority ?? '',
      customer_name: customer?.customer_name ?? undefined,
    };
  });
}

export async function checkItemAvailability(itemId: string): Promise<{
  available: boolean;
  reason?: string;
  currentAssignment?: AssignmentWithDetails;
}> {
  const { data: activeAssignment, error: assignmentError } = await supabase
    .from('inventory_case_assignments')
    .select(
      `
      *,
      case:cases (id, case_no, title, status)
    `
    )
    .eq('item_id', itemId)
    .is('returned_at', null)
    .is('deleted_at', null)
    .maybeSingle();

  if (assignmentError) {
    logger.error('Error checking item availability:', assignmentError);
    throw assignmentError;
  }

  if (activeAssignment) {
    const profiles = await fetchProfileMap([activeAssignment.assigned_by]);
    const decorated = decorate(activeAssignment as AssignmentRowWithEmbeds, profiles);
    return {
      available: false,
      reason: `This item is currently assigned to case ${decorated.case?.case_no ?? ''}`,
      currentAssignment: decorated,
    };
  }

  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select('quantity, status_type:master_inventory_status_types(name, is_available_status)')
    .eq('id', itemId)
    .maybeSingle();

  if (itemError) {
    logger.error('Error fetching item details:', itemError);
    throw itemError;
  }

  if (!item) {
    return { available: false, reason: 'Inventory item not found' };
  }

  // A terminal/non-available disposition (Disposed, Defective, Written off, …) must
  // block assignment even when quantity > 0 and no open assignment row exists —
  // otherwise a dead/disposed donor is reported reassignable. Prefer the authoritative
  // master_inventory_status_types.is_available_status flag, and also match by name for
  // rows where the flag was never populated (same terminal names excluded by
  // enrichItemsWithStockCount in inventoryService.ts).
  const status = pickOne(
    item.status_type as
      | { name: string | null; is_available_status: boolean | null }
      | { name: string | null; is_available_status: boolean | null }[]
      | null
  );
  if (status) {
    const statusName = (status.name ?? '').toLowerCase();
    const nameIndicatesUnavailable =
      statusName.includes('disposed') ||
      statusName.includes('defective') ||
      statusName.includes('written off') ||
      statusName.includes('written-off');
    if (status.is_available_status === false || nameIndicatesUnavailable) {
      return {
        available: false,
        reason: `This item is not available for assignment (status: ${status.name ?? 'unknown'})`,
      };
    }
  }

  if ((item.quantity ?? 0) <= 0) {
    return {
      available: false,
      reason: 'No available quantity in stock',
    };
  }

  return { available: true };
}

const INVENTORY_ITEM_EMBED = `
  id,
  name,
  item_number,
  model,
  serial_number,
  brand:catalog_device_brands (name),
  capacity:catalog_device_capacities (name),
  status_type:master_inventory_status_types (name, color_code)
` as const;

export async function assignInventoryToCase(
  inventoryItemId: string,
  caseId: string,
  notes?: string
): Promise<AssignmentWithDetails> {
  // Pre-flight UX guard (keeps the friendly "already assigned to case X" message).
  // The authoritative single-custody guard now lives inside the RPC, which also
  // runs the insert, the status flip (reserve the unique asset), the chain-of-custody
  // event, and case-history/audit writes in one atomic transaction.
  const availability = await checkItemAvailability(inventoryItemId);

  if (!availability.available) {
    throw new Error(availability.reason || 'Item is not available for assignment');
  }

  const { data: assignmentId, error } = await supabase.rpc('assign_inventory_to_case', {
    p_item_id: inventoryItemId,
    p_case_id: caseId,
    p_notes: notes ?? undefined,
  });

  if (error) {
    logger.error('Error assigning inventory to case:', error);
    throw error;
  }

  // The RPC returns the new inventory_case_assignments row; re-fetch with embeds
  // so callers keep the same decorated shape they relied on before.
  const newId = (assignmentId as { id?: string } | null)?.id;
  const { data, error: fetchError } = await supabase
    .from('inventory_case_assignments')
    .select(
      `
      *,
      inventory_item:inventory_items (${INVENTORY_ITEM_EMBED}),
      case:cases (id, case_no, title, status)
    `
    )
    .eq(newId ? 'id' : 'item_id', newId ?? inventoryItemId)
    .is('returned_at', null)
    .is('deleted_at', null)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    logger.error('Error loading assignment after RPC:', fetchError);
    throw fetchError;
  }

  if (!data) {
    throw new Error('Assignment was created but no row was returned');
  }

  const profiles = await fetchProfileMap([data.assigned_by]);
  return decorate(data as AssignmentRowWithEmbeds, profiles);
}

function annotateNotes(existing: string | null, marker: string, usageNotes?: string): string {
  const parts: string[] = [];
  if (existing) parts.push(existing);
  parts.push(marker);
  if (usageNotes) parts.push(usageNotes);
  return parts.join('\n').trim();
}

async function fetchDecoratedAssignment(assignmentId: string): Promise<AssignmentWithDetails> {
  // Re-hydrate the (now returned) assignment with its embeds after the release RPC,
  // so callers keep the decorated AssignmentWithDetails shape they relied on.
  const { data, error } = await supabase
    .from('inventory_case_assignments')
    .select(
      `
      *,
      inventory_item:inventory_items (${INVENTORY_ITEM_EMBED}),
      case:cases (id, case_no, title, status)
    `
    )
    .eq('id', assignmentId)
    .maybeSingle();

  if (error) {
    logger.error('Error loading assignment after release:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Assignment update returned no row');
  }

  const profiles = await fetchProfileMap([data.assigned_by]);
  return decorate(data as AssignmentRowWithEmbeds, profiles);
}

export async function markAssignmentAsDefective(
  assignmentId: string,
  defectReason: string,
  usageNotes?: string
): Promise<AssignmentWithDetails> {
  // Route the closure through the SAME atomic RPC as unassignInventoryItem — a bare
  // UPDATE that only set returned_at would leave the item stuck "In Use" forever and
  // write NO return chain-of-custody event (a checkout with no matching return, and a
  // dead donor that checkItemAvailability would still report as reassignable). The RPC
  // releases the item, writes the return custody event, and records case-history/audit
  // in one transaction. The `[defective]` marker keeps deriveUsageResult()/the usage
  // badge correct after re-fetch.
  const noteMarker = annotateNotes(null, `[defective] ${defectReason}`, usageNotes);

  const { data: released, error } = await supabase.rpc('unassign_inventory_from_case', {
    p_assignment_id: assignmentId,
    p_notes: noteMarker,
  });

  if (error) {
    logger.error('Error marking assignment as defective:', error);
    throw error;
  }

  // The shared RPC releases the asset back to "Available"; a defective donor must NOT
  // be reassignable, so move the item to a non-available "Defective" disposition.
  const itemId = (released as { item_id?: string } | null)?.item_id;
  if (itemId) {
    const { data: defectiveStatus, error: statusLookupError } = await supabase
      .from('master_inventory_status_types')
      .select('id')
      .ilike('name', '%defective%')
      .limit(1)
      .maybeSingle();

    if (statusLookupError) {
      logger.error('Error resolving defective inventory status:', statusLookupError);
      throw statusLookupError;
    }

    if (defectiveStatus?.id) {
      const { error: statusError } = await supabase
        .from('inventory_items')
        .update({ status_id: defectiveStatus.id })
        .eq('id', itemId);

      if (statusError) {
        logger.error('Error setting inventory item to defective status:', statusError);
        throw statusError;
      }
    } else {
      logger.warn('No "Defective" inventory status found; item left released after defect mark');
    }
  }

  return fetchDecoratedAssignment(assignmentId);
}

export async function markAssignmentAsWorking(
  assignmentId: string,
  usageNotes?: string
): Promise<AssignmentWithDetails> {
  // Same atomic release path as markAssignmentAsDefective / unassignInventoryItem:
  // the RPC flips the item status back to "Available", writes the return
  // chain-of-custody event, and records case-history/audit. A working donor stays
  // available for reuse.
  const noteMarker = annotateNotes(null, '[working]', usageNotes);

  const { error } = await supabase.rpc('unassign_inventory_from_case', {
    p_assignment_id: assignmentId,
    p_notes: noteMarker,
  });

  if (error) {
    logger.error('Error marking assignment as working:', error);
    throw error;
  }

  return fetchDecoratedAssignment(assignmentId);
}

export async function getInventoryItemAssignments(
  inventoryItemId: string
): Promise<AssignmentWithDetails[]> {
  const { data, error } = await supabase
    .from('inventory_case_assignments')
    .select(
      `
      *,
      case:cases (id, case_no, title, status)
    `
    )
    .eq('item_id', inventoryItemId)
    .is('deleted_at', null)
    .order('assigned_at', { ascending: false });

  if (error) {
    logger.error('Error fetching inventory item assignments:', error);
    throw error;
  }

  const rows = (data ?? []) as AssignmentRowWithEmbeds[];
  const profiles = await fetchProfileMap(rows.map((row) => row.assigned_by));
  return rows.map((row) => decorate(row, profiles));
}

export async function getCaseAssignments(caseId: string): Promise<AssignmentWithDetails[]> {
  const { data, error } = await supabase
    .from('inventory_case_assignments')
    .select(
      `
      *,
      inventory_item:inventory_items (${INVENTORY_ITEM_EMBED})
    `
    )
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('assigned_at', { ascending: false });

  if (error) {
    logger.error('Error fetching case assignments:', error);
    throw error;
  }

  const rows = (data ?? []) as AssignmentRowWithEmbeds[];
  const profiles = await fetchProfileMap(rows.map((row) => row.assigned_by));
  return rows.map((row) => decorate(row, profiles));
}

export async function getActiveAssignment(
  inventoryItemId: string
): Promise<AssignmentWithDetails | null> {
  const { data, error } = await supabase
    .from('inventory_case_assignments')
    .select(
      `
      *,
      inventory_item:inventory_items (${INVENTORY_ITEM_EMBED}),
      case:cases (id, case_no, title, status, priority)
    `
    )
    .eq('item_id', inventoryItemId)
    .is('returned_at', null)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error('Error fetching active assignment:', error);
    throw error;
  }

  if (!data) return null;

  const profiles = await fetchProfileMap([data.assigned_by]);
  return decorate(data as AssignmentRowWithEmbeds, profiles);
}

export async function unassignInventoryItem(
  assignmentId: string,
  notes?: string
): Promise<void> {
  // Single atomic transaction: marks the assignment returned, releases the unique
  // asset back to "Available", and logs the return chain-of-custody + case-history
  // + audit events. The RPC composes the "[returned]" note marker internally, so the
  // prior read-then-write here is no longer needed.
  const { error } = await supabase.rpc('unassign_inventory_from_case', {
    p_assignment_id: assignmentId,
    p_notes: notes ?? undefined,
  });

  if (error) {
    logger.error('Error unassigning inventory item:', error);
    throw error;
  }
}
