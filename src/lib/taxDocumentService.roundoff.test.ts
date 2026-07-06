import { describe, it, expect, vi } from 'vitest';
import type { RateContext } from './currencyService';
import type { TaxComputation } from './regimes/types';

const { insertCapture } = vi.hoisted(() => ({ insertCapture: { rows: null as unknown[] | null } }));
vi.mock('./supabaseClient', () => {
  const chain: Record<string, (...args: unknown[]) => unknown> = {
    update: () => chain,
    eq: () => chain,
    is: () => Promise.resolve({ error: null }),
    insert: (rows: unknown) => { insertCapture.rows = rows as unknown[]; return Promise.resolve({ error: null }); },
  };
  return { supabase: { from: () => chain } };
});

import { roundOffAdjustmentLine, persistDocumentTaxLines } from './taxDocumentService';

const rc: RateContext = { documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2, rate: 1, rateSource: 'manual' };

function computationWith(adj: number | null): TaxComputation {
  return {
    lines: [],
    rollups: [
      { lineItemId: null, componentCode: 'CGST', componentLabel: 'CGST 9%', jurisdictionRef: null, rate: 9, taxableBase: 4237.29, taxAmount: 381.36, taxTreatment: 'standard', treatmentReasonCode: null, sequence: 0 },
      { lineItemId: null, componentCode: 'SGST', componentLabel: 'SGST 9%', jurisdictionRef: null, rate: 9, taxableBase: 4237.29, taxAmount: 381.36, taxTreatment: 'standard', treatmentReasonCode: null, sequence: 1 },
    ],
    totals: { taxableBase: 4237.29, taxTotal: 762.72, grandTotal: 5000, roundingAdjustment: adj },
    expectedWithholding: null, notations: [],
    trace: { regimeKey: 'in_gst', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'split_by_place_of_supply', steps: [] },
  };
}

describe('roundOffAdjustmentLine (Section 170)', () => {
  it('emits an out_of_scope Round off line for a non-zero adjustment', () => {
    expect(roundOffAdjustmentLine(computationWith(-0.01))).toEqual({
      lineItemId: null, componentCode: 'ROUND_OFF', componentLabel: 'Round off', jurisdictionRef: null,
      rate: 0, taxableBase: 0, taxAmount: -0.01, taxTreatment: 'out_of_scope', treatmentReasonCode: 'SEC_170_ROUNDING', sequence: 999,
    });
  });
  it('emits nothing for a zero or null adjustment', () => {
    expect(roundOffAdjustmentLine(computationWith(0))).toBeNull();
    expect(roundOffAdjustmentLine(computationWith(null))).toBeNull();
  });
});

describe('persistDocumentTaxLines round-off persistence', () => {
  it('appends the Round off line to the inserted rows so ledger + invoice tie', async () => {
    insertCapture.rows = null;
    await persistDocumentTaxLines({ tenantId: 't1', documentType: 'invoice', documentId: 'inv-1', computation: computationWith(-0.01), rc });
    const inserted = insertCapture.rows as unknown as Array<Record<string, unknown>>;
    const roundOff = inserted.find((r) => r.component_code === 'ROUND_OFF');
    expect(roundOff).toMatchObject({ tax_amount: -0.01, tax_treatment: 'out_of_scope', tax_amount_base: -0.01, line_item_id: null });
  });
  it('appends nothing when the adjustment is zero', async () => {
    insertCapture.rows = null;
    await persistDocumentTaxLines({ tenantId: 't1', documentType: 'invoice', documentId: 'inv-2', computation: computationWith(0), rc });
    const inserted = insertCapture.rows as unknown as Array<Record<string, unknown>>;
    expect(inserted.some((r) => r.component_code === 'ROUND_OFF')).toBe(false);
  });
});
