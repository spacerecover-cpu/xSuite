import { describe, it, expect } from 'vitest';
import type { TaxContext, TaxComputation, RuleTrace, TaxStrategy, RoundingPolicy } from './types';

describe('regimes/types', () => {
  it('a fully-populated TaxContext typechecks and round-trips', () => {
    const policy: RoundingPolicy = { mode: 'half_up', level: 'document' };
    const ctx: TaxContext = {
      documentType: 'invoice',
      seller: {
        legalEntityId: 'le-1', countryId: 'om-uuid', subdivisionId: null,
        taxIdentifier: 'OM1234567890', registrations: [],
      },
      buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
      taxPointDate: '2026-07-02',
      placeOfSupplySubdivisionId: null,
      lines: [{
        lineItemId: null, description: 'RAID recovery', quantity: 1, unitPrice: 100,
        lineDiscount: 0, unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null,
      }],
      documentDiscount: 0,
      taxInclusive: false,
      rateContext: {
        documentCurrency: 'OMR', documentDecimals: 3, baseCurrency: 'OMR',
        baseDecimals: 3, rate: 1, rateSource: 'derived',
      },
      rates: [{
        id: 'r1', country_id: 'om-uuid', subdivision_id: null, component_code: 'VAT',
        component_label: 'VAT', tax_category: 'standard', rate: 5, applies_to: null,
        valid_from: '2021-04-16', valid_to: null, sort_order: 0,
      }],
      roundingPolicy: policy,
      scaleSystem: 'western',
    };
    expect(ctx.lines).toHaveLength(1);
    const trace: RuleTrace = { regimeKey: 'simple_vat', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'single', steps: [] };
    const comp: TaxComputation = {
      lines: [], rollups: [],
      totals: { taxableBase: 100, taxTotal: 5, grandTotal: 105, roundingAdjustment: null },
      expectedWithholding: null, notations: [], trace,
    };
    expect(comp.totals.grandTotal).toBe(105);
    const strategyShape: Pick<TaxStrategy, 'key' | 'version' | 'schemeMode'> = {
      key: 'simple_vat', version: '1.0.0', schemeMode: 'single',
    };
    expect(strategyShape.key).toBe('simple_vat');
  });
});
