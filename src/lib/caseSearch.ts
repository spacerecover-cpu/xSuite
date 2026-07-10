import { supabase } from './supabaseClient';

/**
 * Build the PostgREST `.or()` filter for the Cases list search.
 *
 * PostgREST cannot OR a foreign-table column into the parent filter, so customer and
 * device matches are pre-resolved to ids and folded in as `in.(...)` clauses:
 *   case_no / client_reference / subject   — direct ilike on cases
 *   customer name / email / mobile / number — via customer_id in.(matched customer ids)
 *   device serial number                    — via id in.(case ids of matched devices)
 *
 * Pure string assembly is split out so it is unit-testable without a client.
 */
export function buildCaseSearchOrParts(
  s: string,
  customerIds: string[],
  deviceCaseIds: string[],
): string {
  const parts = [
    `case_no.ilike.%${s}%`,
    `client_reference.ilike.%${s}%`,
    `subject.ilike.%${s}%`,
  ];
  if (customerIds.length > 0) parts.push(`customer_id.in.(${customerIds.join(',')})`);
  if (deviceCaseIds.length > 0) parts.push(`id.in.(${deviceCaseIds.join(',')})`);
  return parts.join(',');
}

/** Cap the id fan-in so a 1-letter term cannot expand into a huge in.() list. */
const MATCH_LIMIT = 200;

/** Resolve the sanitized search term against customers + device serials, then return the
 *  complete `.or()` filter string for the cases query. Pass an AbortSignal so a
 *  superseded resolution (new term, or the consuming query cancelled) stops the
 *  two ILIKE pre-resolution scans instead of running to completion server-side. */
export async function buildCaseSearchOr(s: string, signal?: AbortSignal): Promise<string> {
  let customersQuery = supabase
    .from('customers_enhanced')
    .select('id')
    .or(`customer_name.ilike.%${s}%,email.ilike.%${s}%,mobile_number.ilike.%${s}%,customer_number.ilike.%${s}%`)
    .is('deleted_at', null)
    .limit(MATCH_LIMIT);
  let devicesQuery = supabase
    .from('case_devices')
    .select('case_id')
    .ilike('serial_number', `%${s}%`)
    .is('deleted_at', null)
    .limit(MATCH_LIMIT);
  if (signal) {
    customersQuery = customersQuery.abortSignal(signal);
    devicesQuery = devicesQuery.abortSignal(signal);
  }

  const [customers, devices] = await Promise.all([customersQuery, devicesQuery]);

  const customerIds = (customers.data ?? []).map((r) => r.id);
  const deviceCaseIds = [...new Set((devices.data ?? []).map((r) => r.case_id).filter(Boolean))] as string[];
  return buildCaseSearchOrParts(s, customerIds, deviceCaseIds);
}

/** The status/priority/search/bucket filters for the Cases list, applied identically
 *  to the count query and the rows query. */
export interface CaseListFilters {
  searchOr: string | null;
  filterStatus: string;
  filterPriority: string;
  bucketStatusNames: string[] | null;
}

/** Minimal PostgREST filter-builder surface this helper needs. The real
 *  `PostgrestFilterBuilder` satisfies it (its methods return the same builder). */
interface CaseFilterableQuery {
  or(filter: string): this;
  eq(column: string, value: unknown): this;
  in(column: string, values: readonly unknown[]): this;
}

/**
 * Apply the Cases-list filters to a query builder. Both the count query and the
 * paged rows query route through here so they can never diverge — the previous
 * bug was the bucket `.in(status, …)` living on the count path only, so a bucket
 * click filtered the header count but showed every case in the table.
 */
export function applyCaseListFilters<Q extends CaseFilterableQuery>(
  query: Q,
  { searchOr, filterStatus, filterPriority, bucketStatusNames }: CaseListFilters,
): Q {
  let q = query;
  if (searchOr) q = q.or(searchOr);
  if (filterStatus !== 'all') q = q.eq('status', filterStatus);
  if (filterPriority !== 'all') q = q.eq('priority', filterPriority);
  if (bucketStatusNames) {
    // Empty bucket → match nothing rather than everything.
    q = q.in('status', bucketStatusNames.length > 0 ? bucketStatusNames : ['__none__']);
  }
  return q;
}
