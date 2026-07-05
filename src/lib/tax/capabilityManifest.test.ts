import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn().mockResolvedValue({ data: 6, error: null });
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
// The REAL registry emits fine-grained RegimePluginKind values (tax/return/numbering/…),
// NOT the DB vocabulary — mock THOSE so the kind mapping is actually exercised. (The
// original plan test mocked kind:'regime_adapter', which masked the drift the RPC rejects.)
vi.mock('../regimes/registry', () => ({
  listRegisteredCapabilities: () => [
    { capability_key: 'simple_vat', kind: 'tax', version: '1.0.0' },
    { capability_key: 'gcc_return', kind: 'return', version: '1.0.0' },
    { capability_key: 'prefix_numbering', kind: 'numbering', version: '1.0.0' },
  ],
}));

import { syncEngineCapabilities, KIND_TO_CAPABILITY } from './capabilityManifest';

describe('syncEngineCapabilities (P3)', () => {
  it('maps fine-grained registry kinds to the DB regime_adapter vocabulary before the RPC', async () => {
    const count = await syncEngineCapabilities();
    expect(rpc).toHaveBeenCalledWith('sync_engine_capabilities', {
      p_capabilities: [
        { capability_key: 'simple_vat', kind: 'regime_adapter', version: '1.0.0' },
        { capability_key: 'gcc_return', kind: 'regime_adapter', version: '1.0.0' },
        { capability_key: 'prefix_numbering', kind: 'regime_adapter', version: '1.0.0' },
      ],
    });
    expect(count).toBe(6);
  });

  it('maps every RegimePluginKind into a DB-accepted capability kind (static guard)', () => {
    const DB_KINDS = new Set(['regime_adapter', 'scheme_mode', 'speller_scale', 'bank_file_op', 'filing_transport']);
    for (const k of ['tax', 'return', 'numbering', 'documents', 'einvoice', 'payroll']) {
      expect(KIND_TO_CAPABILITY[k], `RegimePluginKind '${k}' must be mapped`).toBeDefined();
      expect(DB_KINDS.has(KIND_TO_CAPABILITY[k])).toBe(true);
    }
  });
});
