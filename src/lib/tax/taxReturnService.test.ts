import { describe, expect, it } from 'vitest';
import { taxPeriodsBetween, boxAmount } from './taxReturnService';
import type { ComposedReturn } from '../regimes/types';

describe('taxPeriodsBetween (re-export)', () => {
  it('enumerates inclusive month keys across a year boundary', () => {
    expect(taxPeriodsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('boxAmount', () => {
  const composed: ComposedReturn = {
    boxes: [
      { boxCode: 'BOX_1_OUTPUT', boxLabel: 'Output VAT on sales', amountBase: 62.5, sequence: 1 },
      { boxCode: 'BOX_2_INPUT', boxLabel: 'Recoverable input VAT on purchases', amountBase: 12.25, sequence: 2 },
      { boxCode: 'BOX_3_NET', boxLabel: 'Net VAT payable / (refundable)', amountBase: 50.25, sequence: 3 },
    ],
    meta: {},
  };
  it('reads a box by code and defaults absent boxes to 0', () => {
    expect(boxAmount(composed, 'BOX_1_OUTPUT')).toBe(62.5);
    expect(boxAmount(composed, 'BOX_9_MISSING')).toBe(0);
  });
});
