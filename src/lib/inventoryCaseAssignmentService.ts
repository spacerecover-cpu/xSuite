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
    .in('type', ['received', 'diagnosis', 'waiting-approval', 'in-progress'])
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
    .order('created_at', { ascending: false })
    .limit(100);

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
    .select('quantity, status_type:master_inventory_status_types(name)')
    .eq('id', itemId)
    .maybeSingle();

  if (itemError) {
    logger.error('Error fetching item details:', itemError);
    throw itemError;
  }

  if (!item) {
    return { available: false, reason: 'Inventory item not found' };
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

export async function markAssignmentAsDefective(
  assignmentId: string,
  defectReason: string,
  usageNotes?: string
): Promise<AssignmentWithDetails> {
  const { data: existing, error: fetchError } = await supabase
    .from('inventory_case_assignments')
    .select('notes')
    .eq('id', assignmentId)
    .maybeSingle();

  if (fetchError) {
    logger.error('Error loading assignment before defect mark:', fetchError);
    throw fetchError;
  }

  const composedNotes = annotateNotes(
    existing?.notes ?? null,
    `[defective] ${defectReason}`,
    usageNotes
  );

  const { data, error } = await supabase
    .from('inventory_case_assignments')
    .update({
      returned_at: new Date().toISOString(),
      notes: composedNotes,
    })
    .eq('id', assignmentId)
    .select(
      `
      *,
      inventory_item:inventory_items (${INVENTORY_ITEM_EMBED}),
      case:cases (id, case_no, title, status)
    `
    )
    .maybeSingle();

  if (error) {
    logger.error('Error marking assignment as defective:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Assignment update returned no row');
  }

  const profiles = await fetchProfileMap([data.assigned_by]);
  return decorate(data as AssignmentRowWithEmbeds, profiles);
}

export async function markAssignmentAsWorking(
  assignmentId: string,
  usageNotes?: string
): Promise<AssignmentWithDetails> {
  const { data: existing, error: fetchError } = await supabase
    .from('inventory_case_assignments')
    .select('notes')
    .eq('id', assignmentId)
    .maybeSingle();

  if (fetchError) {
    logger.error('Error loading assignment before working mark:', fetchError);
    throw fetchError;
  }

  const composedNotes = annotateNotes(existing?.notes ?? null, '[working]', usageNotes);

  const { data, error } = await supabase
    .from('inventory_case_assignments')
    .update({
      returned_at: new Date().toISOString(),
      notes: composedNotes,
    })
    .eq('id', assignmentId)
    .select(
      `
      *,
      inventory_item:inventory_items (${INVENTORY_ITEM_EMBED}),
      case:cases (id, case_no, title, status)
    `
    )
    .maybeSingle();

  if (error) {
    logger.error('Error marking assignment as working:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Assignment update returned no row');
  }

  const profiles = await fetchProfileMap([data.assigned_by]);
  return decorate(data as AssignmentRowWithEmbeds, profiles);
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
