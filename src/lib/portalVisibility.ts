import { supabase } from './supabaseClient';

export const PORTAL_VISIBILITY_FLAGS = [
  'show_device_details',
  'show_technical_details',
  'show_device_password',
  'show_important_data',
  'show_accessories',
  'show_status_updates',
  'show_quotes',
  'show_invoices',
  'show_reports',
  'show_attachments',
  'show_documents',
] as const;

export type PortalVisibilityFlag = typeof PORTAL_VISIBILITY_FLAGS[number];

export interface PortalVisibilityRow {
  case_id: string;
  visible_fields: string[] | null;
  custom_message: string | null;
}

// Returns the set of visibility rows for the given customer's cases. Each row
// describes one case and the per-entity-type flags that gate what the customer
// can see (e.g. 'show_quotes', 'show_reports'). Used by every portal list page
// in place of the non-existent `portal_visible` columns called out in the
// client-portal audit.
export async function fetchPortalVisibility(
  customerId: string
): Promise<PortalVisibilityRow[]> {
  if (!customerId) return [];

  const { data: cases, error: casesErr } = await supabase
    .from('cases')
    .select('id')
    .eq('customer_id', customerId)
    .is('deleted_at', null);

  if (casesErr) throw casesErr;
  const caseIds = (cases ?? []).map((c) => c.id);
  if (caseIds.length === 0) return [];

  const { data, error } = await supabase
    .from('case_portal_visibility')
    .select('case_id, visible_fields, custom_message')
    .in('case_id', caseIds)
    .eq('is_visible', true)
    .is('deleted_at', null);

  if (error) throw error;
  return (data ?? []) as PortalVisibilityRow[];
}

export function getVisibleCaseIds(rows: PortalVisibilityRow[]): string[] {
  return rows.map((r) => r.case_id);
}

// Returns true when a single visibility row has the given flag enabled.
// Single-row mirror of getCaseIdsWithFlag's predicate — useful when the caller
// already holds the relevant row and doesn't need to filter across a collection.
export function isFieldVisible(row: PortalVisibilityRow, flag: string): boolean {
  return Array.isArray(row.visible_fields) && row.visible_fields.includes(flag);
}

// Returns the subset of case_ids whose visibility row enables the given flag.
// Flags are stored as strings inside the `visible_fields` text[] column
// (e.g. 'show_quotes', 'show_reports', 'show_invoices'); see
// CasePortalTab.tsx for the producer side.
export function getCaseIdsWithFlag(
  rows: PortalVisibilityRow[],
  flag: string
): string[] {
  return rows
    .filter((r) => Array.isArray(r.visible_fields) && r.visible_fields!.includes(flag))
    .map((r) => r.case_id);
}

export function getVisibilityByCaseId(
  rows: PortalVisibilityRow[]
): Map<string, PortalVisibilityRow> {
  const m = new Map<string, PortalVisibilityRow>();
  for (const r of rows) m.set(r.case_id, r);
  return m;
}
