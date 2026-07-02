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
 *  complete `.or()` filter string for the cases query. */
export async function buildCaseSearchOr(s: string): Promise<string> {
  const [customers, devices] = await Promise.all([
    supabase
      .from('customers_enhanced')
      .select('id')
      .or(`customer_name.ilike.%${s}%,email.ilike.%${s}%,mobile_number.ilike.%${s}%,customer_number.ilike.%${s}%`)
      .is('deleted_at', null)
      .limit(MATCH_LIMIT),
    supabase
      .from('case_devices')
      .select('case_id')
      .ilike('serial_number', `%${s}%`)
      .is('deleted_at', null)
      .limit(MATCH_LIMIT),
  ]);

  const customerIds = (customers.data ?? []).map((r) => r.id);
  const deviceCaseIds = [...new Set((devices.data ?? []).map((r) => r.case_id).filter(Boolean))] as string[];
  return buildCaseSearchOrParts(s, customerIds, deviceCaseIds);
}
