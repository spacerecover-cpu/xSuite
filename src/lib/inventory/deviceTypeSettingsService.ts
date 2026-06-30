import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { supabase, resolveTenantId } from '../supabaseClient';

const QUERY_KEY = ['deviceTypeSettings'] as const;

export async function getDeviceTypeSettings(): Promise<Map<string, string | null>> {
  const { data, error } = await supabase
    .from('tenant_device_type_settings')
    .select('device_type_id, default_location_id')
    .is('deleted_at', null);

  if (error) throw error;

  const map = new Map<string, string | null>();
  for (const row of data ?? []) {
    map.set(row.device_type_id, row.default_location_id);
  }
  return map;
}

export async function setDeviceTypeDefaultLocation(
  deviceTypeId: string,
  locationId: string | null,
): Promise<void> {
  // The unique index on (tenant_id, device_type_id) is PARTIAL (WHERE deleted_at IS NULL),
  // so PostgREST cannot infer it for ON CONFLICT — upsert would always emit 42P10.
  // Use a read-then-insert/update reconcile identical to setItemDonorParts.
  const { data: existing, error: selectErr } = await supabase
    .from('tenant_device_type_settings')
    .select('id')
    .eq('device_type_id', deviceTypeId)
    .is('deleted_at', null)
    .maybeSingle();
  if (selectErr) throw selectErr;

  if (existing) {
    const { error } = await supabase
      .from('tenant_device_type_settings')
      .update({ default_location_id: locationId })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    if (locationId === null) return; // nothing to create for a null clear
    // tenant_id is stamped server-side by the set_*_tenant_and_audit trigger;
    // supplied here only to satisfy the generated Insert type.
    const tenantId = await resolveTenantId();
    const { error } = await supabase
      .from('tenant_device_type_settings')
      .insert({ tenant_id: tenantId, device_type_id: deviceTypeId, default_location_id: locationId });
    if (error) throw error;
  }
}

export function useDeviceTypeSettings(): UseQueryResult<Map<string, string | null>> {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getDeviceTypeSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export { QUERY_KEY as deviceTypeSettingsQueryKey };
