import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn().mockResolvedValue({ data: 6, error: null });
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('../regimes/registry', () => ({
  listRegisteredCapabilities: () => [
    { capability_key: 'simple_vat', kind: 'regime_adapter', version: '1.0.0' },
    { capability_key: 'gcc_return', kind: 'regime_adapter', version: '1.0.0' },
    { capability_key: 'zatca_ph1', kind: 'regime_adapter', version: '1.0.0' },
  ],
}));

import { syncEngineCapabilities } from './capabilityManifest';

describe('syncEngineCapabilities', () => {
  it('pushes the full code-registry capability list to the DB manifest', async () => {
    const count = await syncEngineCapabilities();
    expect(rpc).toHaveBeenCalledWith('sync_engine_capabilities', {
      p_capabilities: [
        { capability_key: 'simple_vat', kind: 'regime_adapter', version: '1.0.0' },
        { capability_key: 'gcc_return', kind: 'regime_adapter', version: '1.0.0' },
        { capability_key: 'zatca_ph1', kind: 'regime_adapter', version: '1.0.0' },
      ],
    });
    expect(count).toBe(6);
  });
});
