import { describe, it, expect } from 'vitest';
import { composeGstr1HsnSummary, type HsnLineAggregate } from './hsnSummary';

const rows: HsnLineAggregate[] = [
  { itemCode: '998713', unitCode: 'NOS', quantity: 3, taxableBase: 135000, componentTaxBase: { CGST: 12150, SGST: 12150 } },
  { itemCode: '998713', unitCode: 'NOS', quantity: 2, taxableBase: 90000, componentTaxBase: { IGST: 16200 } },
  { itemCode: '998319', unitCode: 'OTH', quantity: 1, taxableBase: 1000, componentTaxBase: { CGST: 90, SGST: 90 } },
];

describe('composeGstr1HsnSummary (Table 12)', () => {
  it('aggregates quantity + taxable + per-head tax per item_code into ReturnBoxLines', () => {
    const boxes = composeGstr1HsnSummary(rows, 100);
    const b = boxes.find((x) => x.boxCode === 'hsn.998713');
    expect(b?.quantity).toBe(5);
    expect(b?.unitCode).toBe('NOS');
    expect(b?.amountBase).toBe(225000);
    expect(b?.meta).toEqual({ cgst: 12150, sgst: 12150, igst: 16200, total_tax: 40500 });
  });
  it('sequences from startSequence in deterministic item-code order', () => {
    const boxes = composeGstr1HsnSummary(rows, 100);
    expect(boxes.map((x) => x.boxCode)).toEqual(['hsn.998319', 'hsn.998713']);
    expect(boxes.map((x) => x.sequence)).toEqual([100, 101]);
  });
});
