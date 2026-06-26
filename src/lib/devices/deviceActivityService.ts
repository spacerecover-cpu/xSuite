// src/lib/devices/deviceActivityService.ts
import { supabase } from '../supabaseClient';
import { logger } from '../logger';
import type { Database, Json } from '../../types/database.types';
import type { DeviceActivityDraft } from './deviceActivityDiff';

export type DeviceActivityRow = Database['public']['Tables']['case_device_activity']['Row'];
type DeviceActivityInsert = Database['public']['Tables']['case_device_activity']['Insert'];

/** Bulk-insert activity drafts for a device. No-op when there are no drafts. */
export async function logDeviceActivities(params: {
  caseId: string;
  deviceId: string;
  tenantId: string;
  actorId: string | null;
  drafts: DeviceActivityDraft[];
}): Promise<void> {
  const { caseId, deviceId, tenantId, actorId, drafts } = params;
  if (!drafts.length) return;

  const rows: DeviceActivityInsert[] = drafts.map((d) => ({
    tenant_id: tenantId,
    case_id: caseId,
    device_id: deviceId,
    created_by: actorId,
    activity_type: d.activity_type,
    title: d.title,
    description: d.description ?? null,
    status: d.status ?? null,
    component_key: d.component_key ?? null,
    old_value: d.old_value ?? null,
    new_value: d.new_value ?? null,
    metadata: (d.metadata ?? {}) as Json,
  }));

  const { error } = await supabase.from('case_device_activity').insert(rows);
  if (error) {
    logger.error('Error logging device activity:', error);
    throw error;
  }
}

/** Newest-first activity for one device, page-able via offset/limit. */
export async function fetchDeviceActivity(
  deviceId: string,
  opts: { limit: number; offset?: number } = { limit: 20 },
): Promise<DeviceActivityRow[]> {
  const offset = opts.offset ?? 0;
  const { data, error } = await supabase
    .from('case_device_activity')
    .select('*')
    .eq('device_id', deviceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + opts.limit - 1);

  if (error) {
    logger.error('Error fetching device activity:', error);
    throw error;
  }
  return data ?? [];
}
