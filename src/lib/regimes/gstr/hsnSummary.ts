// GSTR-1 Table 12 (HSN/SAC summary): quantity + UQC + taxable + per-head tax per
// item_code. Sourced from LINE data (AD-4 — vat_records stays amount-only); the
// I/O fetch lives in vatService.fetchHsnLineAggregates.
import { roundMoney } from '../../financialMath';
import type { ReturnBoxLine } from '../types';

export interface HsnLineAggregate {
  itemCode: string;
  unitCode: string | null;
  quantity: number;
  taxableBase: number;
  componentTaxBase: Record<string, number>;   // 'CGST' | 'SGST' | 'IGST' → base amount
}

export function composeGstr1HsnSummary(rows: HsnLineAggregate[], startSequence: number): ReturnBoxLine[] {
  const byCode = new Map<string, { quantity: number; unitCode: string | null; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const r of rows) {
    const agg = byCode.get(r.itemCode) ?? { quantity: 0, unitCode: r.unitCode, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    agg.quantity += r.quantity;
    agg.taxable += r.taxableBase;
    agg.cgst += r.componentTaxBase['CGST'] ?? 0;
    agg.sgst += r.componentTaxBase['SGST'] ?? 0;
    agg.igst += r.componentTaxBase['IGST'] ?? 0;
    if (!agg.unitCode) agg.unitCode = r.unitCode;
    byCode.set(r.itemCode, agg);
  }
  return [...byCode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemCode, agg], i) => ({
      boxCode: `hsn.${itemCode}`,
      boxLabel: `HSN/SAC ${itemCode}`,
      amountBase: roundMoney(agg.taxable, 2),
      quantity: agg.quantity,
      unitCode: agg.unitCode ?? 'OTH',
      meta: {
        cgst: roundMoney(agg.cgst, 2), sgst: roundMoney(agg.sgst, 2), igst: roundMoney(agg.igst, 2),
        total_tax: roundMoney(agg.cgst + agg.sgst + agg.igst, 2),
      },
      sequence: startSequence + i,
    }));
}
