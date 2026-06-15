import { describe, it, expect } from 'vitest';
import { sumBase } from './reportsDashboardRollup';

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
