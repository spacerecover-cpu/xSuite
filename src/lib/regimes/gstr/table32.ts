// GSTR-3B Table 3.2: inter-state supplies to UNREGISTERED persons, state-wise by
// place of supply. B2C-ness and the PoS state live on the invoice (AD-4), so the
// aggregates are service-fed (vatService.fetchInterStateB2CAggregates); this
// module is the pure composition half.
import { roundMoney } from '../../financialMath';
import type { ReturnBoxLine } from '../types';

export interface InterStateB2CAggregate {
  stateCode: string;      // GST state code (geo_subdivisions.tax_authority_code)
  stateName: string;
  taxableBase: number;
  igstBase: number;
}

export function composeGstr3bTable32(rows: InterStateB2CAggregate[], startSequence: number): ReturnBoxLine[] {
  const byState = new Map<string, { stateName: string; taxable: number; igst: number }>();
  for (const r of rows) {
    const agg = byState.get(r.stateCode) ?? { stateName: r.stateName, taxable: 0, igst: 0 };
    agg.taxable += r.taxableBase;
    agg.igst += r.igstBase;
    byState.set(r.stateCode, agg);
  }
  return [...byState.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stateCode, agg], i) => ({
      boxCode: `3.2.${stateCode}`,
      boxLabel: `Supplies made to unregistered persons — ${agg.stateName} (${stateCode})`,
      amountBase: roundMoney(agg.taxable, 2),
      meta: { igst: roundMoney(agg.igst, 2) },
      sequence: startSequence + i,
    }));
}
