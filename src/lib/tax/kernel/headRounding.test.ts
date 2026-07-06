import { describe, it, expect } from 'vitest';
import { computeWithMode } from './index';
import type { GeoCountryTaxRateRow, RoundingPolicy, TaxContext } from '../../regimes/types';
import type { RateContext } from '../../currencyService';

const rc: RateContext = { documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2, rate: 1, rateSource: 'derived' };
const vat: GeoCountryTaxRateRow = {
  id: 'r1', country_id: 'in', subdivision_id: null, component_code: 'VAT', component_label: 'VAT',
  tax_category: 'standard', rate: 18, applies_to: null, valid_from: '2017-07-01', valid_to: null, sort_order: 0,
};

const ctxWith = (level: RoundingPolicy['level']): TaxContext => ({
  documentType: 'invoice',
  seller: { legalEntityId: 'le', countryId: 'in', subdivisionId: null, taxIdentifier: null, registrations: [] },
  buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
  taxPointDate: '2026-07-05', placeOfSupplySubdivisionId: null,
  // Prices chosen so per-line 18% rounding genuinely accumulates a divergence:
  // line: round(2.75*.18)=0.50 + round(8.25*.18=1.485)=1.49 → 1.99;
  // document/head: round(11.00*.18=1.98)=1.98. (The plan's 100.005/200.005 do
  // NOT diverge — 18.0009/36.0009 both round to .00 — so they are replaced here.)
  lines: [
    { lineItemId: 'idx:0', description: 'a', quantity: 1, unitPrice: 2.75, lineDiscount: 0, unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null },
    { lineItemId: 'idx:1', description: 'b', quantity: 1, unitPrice: 8.25, lineDiscount: 0, unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null },
  ],
  documentDiscount: 0, taxInclusive: false, rateContext: rc, rates: [vat],
  roundingPolicy: { mode: 'half_up', level },
  scaleSystem: 'western',
});

describe("RoundingPolicy level 'head' (Section 170 seam, threaded by S2, exercised by S3)", () => {
  it("'head' computes per-component-rollup rounding (same arithmetic path as 'document' pre-split)", () => {
    const head = computeWithMode(ctxWith('head'), 'single');
    const doc = computeWithMode(ctxWith('document'), 'single');
    expect(head.totals).toEqual(doc.totals);
    expect(head.rollups.map((r) => r.taxAmount)).toEqual(doc.rollups.map((r) => r.taxAmount));
  });
  it("'head' differs from 'line' when per-line rounding accumulates", () => {
    const head = computeWithMode(ctxWith('head'), 'single');
    const line = computeWithMode(ctxWith('line'), 'single');
    expect(head.totals.taxTotal).not.toBe(line.totals.taxTotal);
  });
});
