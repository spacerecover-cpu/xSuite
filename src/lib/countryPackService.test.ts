import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const fromResponses = new Map<string, unknown[]>();
vi.mock('./supabaseClient', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (table: string) => {
      const rows = fromResponses.get(table) ?? [];
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) chain[m] = vi.fn(self);
      (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
        resolve({ data: rows, error: null });
      return chain;
    },
  },
}));
// vi.mock is hoisted above top-level consts, so the fixture the factory closes over
// must be created with vi.hoisted (else: "Cannot access 'gateResults' before initialization").
const { gateResults } = vi.hoisted(() => ({
  gateResults: [{ name: 'f1', pass: true, diffs: [], trace: null }],
}));
vi.mock('./tax/publishGate', () => ({
  runPublishGate: vi.fn().mockResolvedValue({ pass: true, results: gateResults }),
}));

import { runPackFixtures, publishPack } from './countryPackService';

describe('countryPackService (P3)', () => {
  beforeEach(() => { rpc.mockReset(); fromResponses.clear(); });

  it('runPackFixtures replays fixtures through runPublishGate and records every result', async () => {
    fromResponses.set('master_country_pack_tests', [
      { id: 't1', name: 'f1', input_document: { kind: 'x' }, expected: { y: 1 } },
    ]);
    rpc.mockResolvedValue({ data: null, error: null });
    const summary = await runPackFixtures('country-1', 'AE');
    expect(summary).toEqual({ total: 1, passed: 1, results: gateResults });
    expect(rpc).toHaveBeenCalledWith('record_pack_test_result', {
      p_test_id: 't1',
      p_result: { pass: true, diffs: [], name: 'f1' },
    });
  });

  it('publishPack surfaces the RPC gate payload', async () => {
    const payload = { published: true, config_status: 'statutory_ready', gate: { blockers: [] } };
    rpc.mockResolvedValue({ data: payload, error: null });
    const result = await publishPack('country-1', 2);
    expect(rpc).toHaveBeenCalledWith('publish_country_pack', { p_country_id: 'country-1', p_version: 2 });
    expect(result).toEqual(payload);
  });
});
