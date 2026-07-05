// The honesty bridge (graft 2): the DB capability manifest is only ever a
// projection of what the CODE registry actually has registered. Never insert
// capability rows by hand — a pack must not claim an unimplemented capability.
import { supabase } from '../supabaseClient';
import { listRegisteredCapabilities } from '../regimes/registry';

// The code registry speaks fine-grained RegimePluginKind (tax/return/numbering/
// documents/einvoice/payroll); the DB manifest + sync_engine_capabilities CHECK speak
// a coarser vocabulary {regime_adapter,scheme_mode,speller_scale,bank_file_op,
// filing_transport}. Every regime plugin is a 'regime_adapter' capability — map before
// the RPC, or it RAISEs 'invalid kind' on the first row (the whole bridge would throw).
export const KIND_TO_CAPABILITY: Record<string, string> = {
  tax: 'regime_adapter',
  return: 'regime_adapter',
  numbering: 'regime_adapter',
  documents: 'regime_adapter',
  einvoice: 'regime_adapter',
  payroll: 'regime_adapter',
};

export async function syncEngineCapabilities(): Promise<number> {
  const capabilities = listRegisteredCapabilities().map((c) => ({
    capability_key: c.capability_key,
    kind: KIND_TO_CAPABILITY[c.kind] ?? c.kind,
    version: c.version,
  }));
  const { data, error } = await supabase.rpc('sync_engine_capabilities', {
    p_capabilities: capabilities,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
