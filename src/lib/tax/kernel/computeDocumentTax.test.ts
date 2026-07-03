import { describe, it, expect } from 'vitest';
import { computeDocumentTax, computeWithMode } from './index';
import type { TaxContext, TaxableLine, GeoCountryTaxRateRow } from '../../regimes/types';
import type { RateContext } from '../../currencyService';

const omrRc: RateContext = {
  documentCurrency: 'OMR', documentDecimals: 3, baseCurrency: 'OMR', baseDecimals: 3, rate: 1, rateSource: 'derived',
};
const vat5: GeoCountryTaxRateRow = {
  id: 'rate-om-vat-std', country_id: 'om', subdivision_id: null, component_code: 'VAT',
  component_label: 'VAT', tax_category: 'standard', rate: 5, applies_to: null,
  valid_from: '2021-04-16', valid_to: null, sort_order: 0,
};
const line = (over: Partial<TaxableLine>): TaxableLine => ({
  lineItemId: null, description: 'svc', quantity: 1, unitPrice: 100, lineDiscount: 0,
  unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null, ...over,
});
const ctx = (over: Partial<TaxContext>): TaxContext => ({
  documentType: 'invoice',
  seller: { legalEntityId: 'le', countryId: 'om', subdivisionId: null, taxIdentifier: 'OM123', registrations: [] },
  buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
  taxPointDate: '2026-07-02', placeOfSupplySubdivisionId: null,
  lines: [line({})], documentDiscount: 0, taxInclusive: false,
  rateContext: omrRc, rates: [vat5],
  roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western', ...over,
});

describe('computeDocumentTax — single mode, Oman parity shapes', () => {
  it('spec walkthrough: 12 × OMR 120.000 @5% → taxable 1440.000, VAT 72.000, total 1512.000', () => {
    const c = computeDocumentTax(ctx({ lines: [line({ quantity: 12, unitPrice: 120 })] }));
    expect(c.totals).toEqual({ taxableBase: 1440, taxTotal: 72, grandTotal: 1512, roundingAdjustment: null });
    expect(c.rollups).toHaveLength(1);
    expect(c.rollups[0]).toMatchObject({
      lineItemId: null, componentCode: 'VAT', componentLabel: 'VAT 5%', rate: 5,
      taxableBase: 1440, taxAmount: 72, taxTreatment: 'standard',
    });
    expect(c.lines).toHaveLength(1);
    expect(c.trace.steps.some((s) => s.op === 'rate_match' && s.rateRowId === 'rate-om-vat-std')).toBe(true);
  });

  it('legacy invoice math parity: per-line % discount then fixed doc discount then 5% (OMR mils survive)', () => {
    // Mirrors calculateInvoiceTotals(items=[{3×40.5, 10%}, {1×0.105}], discount=0.100, 5%, dp=3):
    // line1 sub=121.500, disc=12.150 → 109.350; line2 0.105; subtotal 109.455;
    // discounted 109.355; tax = round(109.355*0.05,3) = 5.468; total 114.823.
    const c = computeDocumentTax(ctx({
      lines: [
        line({ quantity: 3, unitPrice: 40.5, lineDiscount: 12.15 }),
        line({ quantity: 1, unitPrice: 0.105 }),
      ],
      documentDiscount: 0.1,
    }));
    expect(c.totals.taxableBase).toBe(109.355);
    expect(c.totals.taxTotal).toBe(5.468);
    expect(c.totals.grandTotal).toBe(114.823);
  });

  it('document discount allocation: line component rows sum exactly to the rollup', () => {
    const c = computeDocumentTax(ctx({
      lines: [line({ unitPrice: 100 }), line({ unitPrice: 100 }), line({ unitPrice: 100 })],
      documentDiscount: 0.1,
    }));
    const lineSum = c.lines.reduce((s, l) => s + l.taxAmount, 0);
    expect(Math.round(lineSum * 1000) / 1000).toBe(c.rollups[0].taxAmount);
    const alloc = c.trace.steps.find((s) => s.op === 'discount_allocation');
    expect(alloc).toBeDefined();
  });

  it('zero_rated line contributes a 0-amount component row and a notation', () => {
    const c = computeDocumentTax(ctx({
      lines: [line({ unitPrice: 200 }), line({ unitPrice: 50, treatment: 'zero_rated', treatmentReasonCode: 'EXPORT_SERVICES' })],
    }));
    expect(c.totals.taxTotal).toBe(10); // only the standard line taxes
    const zeroRow = c.lines.find((l) => l.taxTreatment === 'zero_rated');
    expect(zeroRow).toMatchObject({ taxAmount: 0, treatmentReasonCode: 'EXPORT_SERVICES' });
    expect(c.notations.some((n) => n.code === 'EXPORT_SERVICES')).toBe(true);
  });

  it('reverse_charge emits 0-amount components + REVERSE_CHARGE notation', () => {
    const c = computeDocumentTax(ctx({ lines: [line({ treatment: 'reverse_charge' })] }));
    expect(c.totals.taxTotal).toBe(0);
    expect(c.notations.some((n) => n.code === 'REVERSE_CHARGE')).toBe(true);
  });

  it('inclusive back-out reconstitutes gross exactly and splits by largest remainder', () => {
    const inr: RateContext = { ...omrRc, documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2 };
    const cgst = { ...vat5, id: 'cg', component_code: 'CGST', component_label: 'CGST', rate: 9, sort_order: 0 };
    const sgst = { ...vat5, id: 'sg', component_code: 'SGST', component_label: 'SGST', rate: 9, sort_order: 1 };
    const c = computeDocumentTax(ctx({
      lines: [line({ unitPrice: 5000 })], taxInclusive: true, rateContext: inr, rates: [cgst, sgst],
    }));
    expect(c.totals.taxableBase).toBe(4237.29);
    expect(c.totals.taxTotal).toBe(762.71);
    expect(c.totals.grandTotal).toBe(5000);
    expect(c.rollups.map((r) => r.taxAmount).sort((a, b) => b - a)).toEqual([381.36, 381.35]);
  });

  it('cash_increment emits an out-of-scope rounding adjustment closing the gap exactly', () => {
    const inr: RateContext = { ...omrRc, documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2 };
    const igst = { ...vat5, id: 'ig', component_code: 'IGST', component_label: 'IGST', rate: 18 };
    const c = computeDocumentTax(ctx({
      lines: [line({ unitPrice: 100.3 })], rateContext: inr, rates: [igst],
      roundingPolicy: { mode: 'half_up', level: 'document', cash_increment: 1 },
    }));
    // taxable 100.30, tax 18.05, raw 118.35 → 118.00, adjustment -0.35
    expect(c.totals.roundingAdjustment).toBe(-0.35);
    expect(c.totals.grandTotal).toBe(118);
    expect(c.trace.steps.some((s) => s.op === 'cash_rounding' && s.adjustment === -0.35)).toBe(true);
  });

  it('trace is deterministic: same ctx → deep-equal trace', () => {
    const a = computeDocumentTax(ctx({ documentDiscount: 0.1 }));
    const b = computeDocumentTax(ctx({ documentDiscount: 0.1 }));
    expect(a.trace).toEqual(b.trace);
  });
});

describe('computeWithMode — parameterization seams', () => {
  const inrRc: RateContext = { ...omrRc, documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2 };
  const rows: GeoCountryTaxRateRow[] = [
    { ...vat5, id: 'cg', component_code: 'CGST', component_label: 'CGST', rate: 9 },
    { ...vat5, id: 'sg', component_code: 'SGST', component_label: 'SGST', rate: 9, sort_order: 1 },
    { ...vat5, id: 'ig', component_code: 'IGST', component_label: 'IGST', rate: 18, sort_order: 2 },
  ];
  const reg = {
    id: 'reg1', legal_entity_id: 'le', country_id: 'in', subdivision_id: 'sub-KA',
    tax_number: '29X', scheme: 'standard' as const, registered_from: '2020-01-01', registered_to: null, is_primary: true,
  };
  it('split_by_place_of_supply: intra-state → CGST+SGST pair', () => {
    const c = computeWithMode(ctx({
      rateContext: inrRc, rates: rows, placeOfSupplySubdivisionId: 'sub-KA',
      seller: { legalEntityId: 'le', countryId: 'in', subdivisionId: 'sub-KA', taxIdentifier: '29X', registrations: [reg] },
      lines: [line({ quantity: 2, unitPrice: 45000 })],
    }), 'split_by_place_of_supply');
    expect(c.rollups.map((r) => r.componentCode).sort()).toEqual(['CGST', 'SGST']);
    expect(c.rollups.map((r) => r.taxAmount)).toEqual([8100, 8100]);
    expect(c.totals.grandTotal).toBe(106200);
  });
  it('split_by_place_of_supply: inter-state → IGST', () => {
    const c = computeWithMode(ctx({
      rateContext: inrRc, rates: rows, placeOfSupplySubdivisionId: 'sub-MH',
      seller: { legalEntityId: 'le', countryId: 'in', subdivisionId: 'sub-KA', taxIdentifier: '29X', registrations: [reg] },
      lines: [line({ quantity: 2, unitPrice: 45000 })],
    }), 'split_by_place_of_supply');
    expect(c.rollups.map((r) => r.componentCode)).toEqual(['IGST']);
    expect(c.rollups[0].taxAmount).toBe(16200);
  });
  it('jurisdiction_stack: stacks every registered-subdivision rate row; no registration → out_of_scope', () => {
    const usRc: RateContext = { ...omrRc, documentCurrency: 'USD', documentDecimals: 2, baseCurrency: 'USD', baseDecimals: 2 };
    const stack: GeoCountryTaxRateRow[] = [
      { ...vat5, id: 'tx-st', subdivision_id: 'sub-TX', component_code: 'STATE', component_label: 'TX State', rate: 6.25, sort_order: 0 },
      { ...vat5, id: 'tx-ci', subdivision_id: 'sub-AUS', component_code: 'CITY', component_label: 'Austin City', rate: 1, sort_order: 1 },
    ];
    const txReg = { ...reg, id: 'r-tx', subdivision_id: 'sub-TX' };
    const ausReg = { ...reg, id: 'r-aus', subdivision_id: 'sub-AUS' };
    const c = computeWithMode(ctx({
      rateContext: usRc, rates: stack,
      seller: { legalEntityId: 'le', countryId: 'us', subdivisionId: 'sub-TX', taxIdentifier: null, registrations: [txReg, ausReg] },
      lines: [line({ unitPrice: 2000 })],
    }), 'jurisdiction_stack');
    expect(c.rollups.map((r) => r.taxAmount)).toEqual([125, 20]);
    // No registrations at all → every line out_of_scope, zero components
    const c2 = computeWithMode(ctx({
      rateContext: usRc, rates: stack,
      seller: { legalEntityId: 'le', countryId: 'us', subdivisionId: 'sub-TX', taxIdentifier: null, registrations: [] },
      lines: [line({ unitPrice: 2000 })],
    }), 'jurisdiction_stack');
    expect(c2.totals.taxTotal).toBe(0);
    expect(c2.rollups).toHaveLength(0);
  });
});
