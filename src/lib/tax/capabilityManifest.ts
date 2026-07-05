// The honesty bridge (graft 2): the DB capability manifest is only ever a
// projection of what the CODE registry actually has registered. Never insert
// capability rows by hand — a pack must not claim an unimplemented capability.
import { supabase } from '../supabaseClient';
import { listRegisteredCapabilities } from '../regimes/registry';

export async function syncEngineCapabilities(): Promise<number> {
  const capabilities = listRegisteredCapabilities();
  const { data, error } = await supabase.rpc('sync_engine_capabilities', {
    p_capabilities: capabilities,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
