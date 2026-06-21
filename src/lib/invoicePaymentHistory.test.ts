import { describe, it, expect, vi } from 'vitest';

// paymentLedger imports the Supabase client at module load; stub it so the pure
// core can be unit-tested without env/network.
vi.mock('./supabaseClient', () => ({ supabase: {}, resolveTenantId: vi.fn() }));

import { sortAndBalance } from './paymentLedger';

describe('sortAndBalance', () => {
  it('orders entries chronologically and computes statement-style running balances', () => {
    const out = sortAndBalance(
      [
        { id: 'late', amount: 100, sortKey: '2026-06-09' },
        { id: 'early', amount: 200, sortKey: '2026-06-01' },
      ],
      336,
    );
    expect(out.map((e) => e.id)).toEqual(['early', 'late']);
    expect(out.map((e) => e.running_balance)).toEqual([136, 36]);
  });

  it('rounds running balances to 3 decimals (OMR-safe float math)', () => {
    const out = sortAndBalance(
      [
        { id: 'a', amount: 0.1, sortKey: '1' },
        { id: 'b', amount: 0.2, sortKey: '2' },
      ],
      0.3,
    );
    expect(out.map((e) => e.running_balance)).toEqual([0.2, 0]);
  });

  it('does not mutate the input array and handles empty trails', () => {
    const input = [
      { id: 'b', amount: 1, sortKey: '2' },
      { id: 'a', amount: 1, sortKey: '1' },
    ];
    const snapshot = [...input];
    sortAndBalance(input, 10);
    expect(input).toEqual(snapshot);
    expect(sortAndBalance([], 50)).toEqual([]);
  });

  it('lets the balance go to exactly zero on full settlement', () => {
    const out = sortAndBalance([{ id: 'full', amount: 136, sortKey: '1' }], 136);
    expect(out[0].running_balance).toBe(0);
  });
});
