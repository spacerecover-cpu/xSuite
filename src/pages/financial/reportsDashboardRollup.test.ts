import { describe, it, expect } from 'vitest';
import { sumBase, groupSumBase } from './reportsDashboardRollup';

describe('sumBase (D7)', () => {
  it('sums the *_base shadow column, never the raw transaction amount', () => {
    const rows = [
      { amount_paid: 100, amount_paid_base: 38, exchange_rate: 0.38 }, // EUR→OMR
      { amount_paid: 50, amount_paid_base: 50, exchange_rate: 1 },     // OMR
    ];
    expect(sumBase(rows, 'amount_paid')).toBe(88);
  });
  it('falls back to the raw amount when no base is present (legacy unity rows)', () => {
    expect(sumBase([{ amount_paid: 50 }], 'amount_paid')).toBe(50);
  });
});

describe('groupSumBase (D7 — category rollups must sum base)', () => {
  it('sums amount_base per group, not raw amount', () => {
    const rows = [
      { amount: 100, amount_base: 38, cat: 'A' }, // EUR 100 @ OMR rate
      { amount: 50, amount_base: 19, cat: 'A' },
      { amount: 10, amount_base: 10, cat: 'B' }, // OMR (unity)
    ];
    const out = groupSumBase(rows, 'amount', (r) => String(r.cat));
    expect(out).toEqual({ A: 57, B: 10 }); // NOT 150 / 10
  });
  it('falls back to raw for legacy rows missing _base', () => {
    expect(groupSumBase([{ amount: 7, cat: 'X' }], 'amount', (r) => String(r.cat))).toEqual({ X: 7 });
  });
});
