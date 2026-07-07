import { describe, it, expect } from 'vitest';
import { composeGstr1HsnSummary, type HsnLineAggregate } from './hsnSummary';

const rows: HsnLineAggregate[] = [
  { itemCode: '998713', unitCode: 'NOS', quantity: 3, taxableBase: 135000, componentTaxBase: { CGST: 12150, SGST: 12150 } },
  { itemCode: '998713', unitCode: 'NOS', quantity: 2, taxableBase: 90000, componentTaxBase: { IGST: 16200 } },
  { itemCode: '998319', unitCode: 'OTH', quantity: 1, taxableBase: 1000, componentTaxBase: { CGST: 90, SGST: 90 } },
];

describe('composeGstr1HsnSummary (Table 12)', () => {
  it('aggregates quantity + taxable + per-head tax per (item_code, UQC) into ReturnBoxLines', () => {
    const boxes = composeGstr1HsnSummary(rows, 100);
    const b = boxes.find((x) => x.boxCode === 'hsn.998713.NOS');
    expect(b?.quantity).toBe(5);
    expect(b?.unitCode).toBe('NOS');
    expect(b?.amountBase).toBe(225000);
    expect(b?.meta).toEqual({ cgst: 12150, sgst: 12150, igst: 16200, total_tax: 40500 });
  });
  it('sequences from startSequence in deterministic (item-code, UQC) order', () => {
    const boxes = composeGstr1HsnSummary(rows, 100);
    expect(boxes.map((x) => x.boxCode)).toEqual(['hsn.998319.OTH', 'hsn.998713.NOS']);
    expect(boxes.map((x) => x.sequence)).toEqual([100, 101]);
  });

  it('does NOT collapse one HSN billed under different UQCs — quantity stays per-unit (Table 12 requires HSN+UQC rows)', () => {
    const multiUqc: HsnLineAggregate[] = [
      { itemCode: '998713', unitCode: 'NOS', quantity: 5, taxableBase: 50000, componentTaxBase: { IGST: 9000 } },
      { itemCode: '998713', unitCode: 'HRS', quantity: 20, taxableBase: 20000, componentTaxBase: { IGST: 3600 } },
    ];
    const boxes = composeGstr1HsnSummary(multiUqc, 1);
    expect(boxes).toHaveLength(2);
    expect(boxes.map((x) => x.boxCode)).toEqual(['hsn.998713.HRS', 'hsn.998713.NOS']);
    expect(boxes.find((x) => x.unitCode === 'NOS')?.quantity).toBe(5);
    expect(boxes.find((x) => x.unitCode === 'HRS')?.quantity).toBe(20);
  });
});
