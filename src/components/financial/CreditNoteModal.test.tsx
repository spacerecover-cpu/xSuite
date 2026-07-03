import { describe, it, expect } from 'vitest';
import { proratedVat } from './CreditNoteModal';

describe('CreditNoteModal proratedVat', () => {
  it('splits invoice VAT proportionally with exact totality (largest remainder)', () => {
    // invoice tax 72.000 over total 1512.000; credit the whole → 72.000
    expect(proratedVat(1512, 72, 1512, 3)).toBe(72);
    // partial credit of 756.000 (half) → 36.000
    expect(proratedVat(756, 72, 1512, 3)).toBe(36);
    // zero total → 0 (no divide-by-zero)
    expect(proratedVat(100, 0, 0, 3)).toBe(0);
  });
});
