import { describe, it, expect } from 'vitest';
import { computeUnappliedBalance, maxApplicable, clampApplyAmount } from './advanceApply';

describe('computeUnappliedBalance', () => {
  it('returns the full amount when there are no allocations', () => {
    expect(computeUnappliedBalance(5000, [])).toBe(5000);
  });

  it('subtracts the sum of allocation amounts', () => {
    expect(computeUnappliedBalance(5000, [{ amount: 2000 }, { amount: 500 }])).toBe(2500);
  });

  it('coerces string / null allocation amounts', () => {
    expect(computeUnappliedBalance(5000, [{ amount: '2000' }, { amount: null }])).toBe(3000);
  });

  it('returns 0 once the advance is fully applied', () => {
    expect(computeUnappliedBalance(5000, [{ amount: 5000 }])).toBe(0);
  });
});

describe('maxApplicable', () => {
  it('is bounded by the unapplied advance balance', () => {
    expect(maxApplicable(3000, 8000)).toBe(3000);
  });

  it('is bounded by the invoice balance due', () => {
    expect(maxApplicable(9000, 4200)).toBe(4200);
  });

  it('never goes below zero', () => {
    expect(maxApplicable(-100, 500)).toBe(0);
    expect(maxApplicable(500, -100)).toBe(0);
  });
});

describe('clampApplyAmount', () => {
  it('passes through a valid in-range amount', () => {
    expect(clampApplyAmount(1500, 3000)).toBe(1500);
  });

  it('clamps an over-max request down to the max', () => {
    expect(clampApplyAmount(9999, 3000)).toBe(3000);
  });

  it('treats non-positive / non-finite requests as 0', () => {
    expect(clampApplyAmount(0, 3000)).toBe(0);
    expect(clampApplyAmount(-5, 3000)).toBe(0);
    expect(clampApplyAmount(Number.NaN, 3000)).toBe(0);
  });
});
