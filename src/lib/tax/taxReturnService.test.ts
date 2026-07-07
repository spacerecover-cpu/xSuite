import { describe, expect, it, vi, beforeEach } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { from, rpc } }));

import { taxPeriodsBetween, boxAmount, composeReturnForDate } from './taxReturnService';
import type { ComposedReturn } from '../regimes/types';

function chainFor(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  (chain as { maybeSingle: unknown }).maybeSingle = vi.fn(() =>
    Promise.resolve({ data: Array.isArray(result.data) ? (result.data as unknown[])[0] ?? null : result.data, error: result.error }));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<{ data: unknown; error: unknown }>;
}

const IN_TENANT = {
  id: 't-in', timezone: 'Asia/Kolkata', base_currency_code: 'INR',
  resolved_country_config: {
    'tax.return_composer': 'gstr', 'tax.filing_frequency': 'monthly', 'tax.period_anchor': '04-01',
  },
};
const GCC_TENANT = {
  id: 't-om', timezone: 'Asia/Muscat', base_currency_code: 'OMR',
  resolved_country_config: {
    'tax.return_composer': 'gcc_return', 'tax.filing_frequency': 'quarterly', 'tax.period_anchor': '01-01',
  },
};
const ENTITY_INR = { id: 'le1', currency_code: 'INR' };
const ENTITY_OMR = { id: 'le1', currency_code: 'OMR' };

function mockTablesFor(tenant: unknown, entity: unknown, vatRows: unknown[]) {
  from.mockImplementation((t: string) => {
    if (t === 'tenants') return chainFor({ data: [tenant], error: null });
    if (t === 'legal_entities') return chainFor({ data: [entity], error: null });
    if (t === 'vat_records') return chainFor({ data: vatRows, error: null });
    if (t === 'invoices') return chainFor({ data: [], error: null });
    if (t === 'geo_subdivisions') return chainFor({ data: [], error: null });
    if (t === 'invoice_line_items') return chainFor({ data: [], error: null });
    return chainFor({ data: [], error: null });                 // document_tax_lines
  });
}

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

describe('composeReturnForDate — gstr wiring (monthly, ledger-parity totals, supplementary boxes)', () => {
  beforeEach(() => { from.mockReset(); rpc.mockReset(); });

  it('gstr + monthly + 04-01 resolves July bounds, composes 3B boxes, and derives outputVat from the LEDGER (not gcc box codes)', async () => {
    mockTablesFor(IN_TENANT, ENTITY_INR, [
      { id: 'v1', record_type: 'sale', record_id: 'inv1', vat_amount: 8100, vat_rate: 18, tax_period: '2026-07',
        vat_amount_base: 8100, taxable_amount_base: 90000, component_code: 'CGST', regime_key: 'in_gst',
        tax_treatment: 'standard', source_document_id: 'inv1', source_document_type: 'invoice' },
      { id: 'v2', record_type: 'sale', record_id: 'inv1', vat_amount: 8100, vat_rate: 18, tax_period: '2026-07',
        vat_amount_base: 8100, taxable_amount_base: 90000, component_code: 'SGST', regime_key: 'in_gst',
        tax_treatment: 'standard', source_document_id: 'inv1', source_document_type: 'invoice' },
    ]);

    const preview = await composeReturnForDate('t-in', '2026-07-15');

    expect(preview.periodStart).toBe('2026-07-01');
    expect(preview.periodEnd).toBe('2026-07-31');
    expect(preview.taxPeriods).toEqual(['2026-07']);
    expect(preview.filingFrequency).toBe('monthly');
    expect(preview.regimeKey).toBe('gstr');
    // RPC-parity: file_vat_return re-derives SUM(vat_amount_base) by record_type over
    // the same tax_period rows and rejects divergence — the preview MUST match that,
    // not a gcc-only BOX_1_OUTPUT lookup (which is absent from gstr boxes → 0 → 22P02-class reject).
    expect(preview.outputVat).toBe(16200);
    expect(preview.inputVat).toBe(0);
    expect(preview.netVat).toBe(16200);
    expect(preview.composed.boxes.find((b) => b.boxCode === '3.1(a).cgst')?.amountBase).toBe(8100);
    // supplementary boxes appended after the 3B block, sequences collision-free
    const seqs = preview.composed.boxes.map((b) => b.sequence);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('gcc tenants keep byte-identical behavior: outputVat still equals BOX_1_OUTPUT and no supplementary boxes appear', async () => {
    mockTablesFor(GCC_TENANT, ENTITY_OMR, [
      { id: 'v1', record_type: 'sale', record_id: 'inv1', vat_amount: 62.5, vat_rate: 5, tax_period: '2026-07',
        vat_amount_base: 62.5, component_code: 'VAT', regime_key: 'simple_vat' },
      { id: 'v2', record_type: 'purchase', record_id: 'exp1', vat_amount: 12.25, vat_rate: 5, tax_period: '2026-08',
        vat_amount_base: 12.25, component_code: 'VAT', regime_key: 'simple_vat' },
    ]);

    const preview = await composeReturnForDate('t-om', '2026-07-15');

    expect(preview.outputVat).toBe(62.5);
    expect(preview.outputVat).toBe(boxAmount(preview.composed, 'BOX_1_OUTPUT'));   // parity preserved
    expect(preview.inputVat).toBe(12.25);
    expect(preview.composed.boxes.map((b) => b.boxCode)).toEqual(['BOX_1_OUTPUT', 'BOX_2_INPUT', 'BOX_3_NET']);
  });
});
