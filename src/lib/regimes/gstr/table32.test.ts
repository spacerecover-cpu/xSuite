import { describe, it, expect } from 'vitest';
import { composeGstr3bTable32, type InterStateB2CAggregate } from './table32';

const rows: InterStateB2CAggregate[] = [
  { stateCode: '29', stateName: 'Karnataka', taxableBase: 90000, igstBase: 16200 },
  { stateCode: '27', stateName: 'Maharashtra', taxableBase: 10000, igstBase: 1800 },
];

describe('composeGstr3bTable32 (state-wise inter-state B2C)', () => {
  it('emits one box per place-of-supply state with taxable value and IGST in meta', () => {
    const boxes = composeGstr3bTable32(rows, 6);
    expect(boxes.map((b) => b.boxCode)).toEqual(['3.2.27', '3.2.29']);   // sorted by GST state code
    const ka = boxes.find((b) => b.boxCode === '3.2.29');
    expect(ka?.boxLabel).toBe('Supplies made to unregistered persons — Karnataka (29)');
    expect(ka?.amountBase).toBe(90000);
    expect(ka?.meta).toEqual({ igst: 16200 });
    expect(boxes.map((b) => b.sequence)).toEqual([6, 7]);
  });
  it('is empty when there are no inter-state B2C supplies', () => {
    expect(composeGstr3bTable32([], 6)).toEqual([]);
  });
});
