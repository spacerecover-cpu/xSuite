import { supabase } from './supabaseClient';

export async function setPrimaryDevice(deviceId: string, caseId: string): Promise<void> {
  const { error } = await supabase.rpc('promote_device_to_primary', {
    p_device_id: deviceId,
    p_case_id: caseId,
  });

  if (error) {
    if (error.code === '40001') {
      throw new Error('Another update is in progress — please retry.');
    }
    throw new Error(error.message);
  }
}
