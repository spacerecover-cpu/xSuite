import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, insertMock } = vi.hoisted(() => ({ from: vi.fn(), insertMock: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));

import {
  createVATRecordFromPurchase, createVATRecordFromInvoice, calculateVATForPeriod,
  getVATRecordsByReturn, getQuarterlyVATSummary, fetchHsnLineAggregates,
  fetchInterStateB2CAggregates, composeGstrSupplementaryBoxes,
} from './vatService';

// A thenable query builder: every chain method returns the builder; awaiting it at
// any point resolves the given result (terminal method varies per query).
function chainFor(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<{ data: unknown; error: unknown }>;
}

/** insert-path builder: .insert(rows).select().maybeSingle() → { data: rows[0] }. */
function makeInsertQuery() {
  return {
    insert: (rows: unknown[]) => {
      insertMock(rows);
      return {
        select: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: (rows as Array<Record<string, unknown>>)[0], error: null }),
        }),
      };
    },
  } as Record<string, unknown>;
}

/** read-path builder for calculateVATForPeriod: select/is/or chainable; awaiting yields { data: rows }. */
function makeRecordsQuery(rows: Array<Record<string, unknown>>) {
  const b: Record<string, unknown> = {
    select: vi.fn(() => b),
    is: vi.fn(() => b),
    or: vi.fn(() => b),
    then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null }),
  };
  return b;
}

beforeEach(() => {
  from.mockReset();
  insertMock.mockClear();
  from.mockReturnValue(makeInsertQuery()); // default path for the existing writer tests
});

describe('input-VAT writer (D1)', () => {
  it('writes a purchase row so input VAT is recorded', async () => {
    await createVATRecordFromPurchase('po-1', { tax_amount: 50, tax_rate: 5 });
    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({ record_type: 'purchase', record_id: 'po-1', vat_amount: 50, vat_rate: 5 }),
    ]);
  });
  it('the sale writer still writes record_type sale (unchanged)', async () => {
    await createVATRecordFromInvoice('inv-1', { tax_amount: 30, tax_rate: 5 });
    expect(insertMock).toHaveBeenCalledWith([expect.objectContaining({ record_type: 'sale' })]);
  });
});

describe('calculateVATForPeriod — base-currency summation (Phase 0)', () => {
  it('sums vat_amount_base so a EUR invoice cannot pollute an OMR return', async () => {
    from.mockReturnValue(makeRecordsQuery([
      { record_type: 'sale', vat_amount: 5, vat_amount_base: 5 },
      { record_type: 'sale', vat_amount: 100, vat_amount_base: 41 },
      { record_type: 'purchase', vat_amount: 10, vat_amount_base: 10 },
    ]));
    const s = await calculateVATForPeriod('2026-07-01', '2026-09-30');
    expect(s.totalOutputVAT).toBe(46); // 5 + 41 — NEVER 105
    expect(s.totalInputVAT).toBe(10);
    expect(s.netVAT).toBe(36);
  });
  it('falls back to vat_amount for legacy rows with NULL base', async () => {
    from.mockReturnValue(makeRecordsQuery([
      { record_type: 'sale', vat_amount: 7, vat_amount_base: null },
    ]));
    const s = await calculateVATForPeriod('2026-07-01', '2026-09-30');
    expect(s.totalOutputVAT).toBe(7);
  });
});

/**
 * drill-down builder for getVATRecordsByReturn: tolerant of BOTH the old
 * created_at chain (.select().is().gte().lte().order()) and the new tax_period
 * chain (.select().in().is().order()) so RED fails on the assertion, not a
 * missing method. Records the `.in(column, values)` call.
 */
function makeDrillDownQuery(captured: { column?: string; values?: unknown }) {
  const b: Record<string, unknown> = {
    select: vi.fn(() => b),
    in: vi.fn((column: string, values: unknown[]) => { captured.column = column; captured.values = values; return b; }),
    is: vi.fn(() => b),
    gte: vi.fn(() => b),
    lte: vi.fn(() => b),
    order: vi.fn(() => b),
    then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: [], error: null }),
  };
  return b;
}

describe('getVATRecordsByReturn (P3 — tax_period dimension)', () => {
  it('filters by tax_period months, never created_at', async () => {
    const captured: { column?: string; values?: unknown } = {};
    from.mockReturnValue(makeDrillDownQuery(captured));
    await getVATRecordsByReturn('2026-07-01', '2026-09-30');
    expect(captured.column).toBe('tax_period');
    expect(captured.values).toEqual(['2026-07', '2026-08', '2026-09']);
  });
});

describe('getQuarterlyVATSummary (P3 — composer-derived period anchor)', () => {
  it('derives Q1 from the fiscal-year anchor, not calendar January', async () => {
    const orArgs: string[] = [];
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      is: vi.fn(() => b),
      or: vi.fn((arg: string) => { orArgs.push(arg); return b; }),
      then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: [], error: null }),
    };
    from.mockReturnValue(b);
    const summaries = await getQuarterlyVATSummary(2026, '04-01');
    expect(summaries.map(s => s.quarter)).toEqual([1, 2, 3, 4]);
    expect(orArgs).toHaveLength(4);
    // Fiscal year starts April → Q1 window is Apr–Jun, NOT calendar Jan–Mar.
    expect(orArgs[0]).toContain('tax_period.gte.2026-04');
    expect(orArgs[0]).toContain('tax_period.lte.2026-06');
  });
});

describe('fetchHsnLineAggregates (GSTR-1 Table 12 source, AD-4)', () => {
  it('resolves invoice ids from vat_records by tax_period, then aggregates line + tax-line data', async () => {
    const vatChain = chainFor({ data: [{ source_document_id: 'inv1' }], error: null });
    const lineChain = chainFor({ data: [{ id: 'l1', invoice_id: 'inv1', item_code: '998713', unit_code: 'NOS', quantity: 2 }], error: null });
    const taxChain = chainFor({ data: [
      { line_item_id: 'l1', component_code: 'CGST', taxable_base: 90000, tax_amount_base: 8100, exchange_rate: 1 },
      { line_item_id: 'l1', component_code: 'SGST', taxable_base: 90000, tax_amount_base: 8100, exchange_rate: 1 },
    ], error: null });
    from.mockImplementation((t: string) =>
      t === 'vat_records' ? vatChain : t === 'invoice_line_items' ? lineChain : taxChain);

    const rows = await fetchHsnLineAggregates(['2026-07']);

    // tax_period is THE period dimension — never created_at (vatService.ts:279 drift class)
    expect(vatChain.in).toHaveBeenCalledWith('tax_period', ['2026-07']);
    // invoice_line_items MUST filter soft-deletes — updateInvoice soft-deletes+re-inserts
    // all lines on edit, so stale rows would otherwise double-count Table 12 quantity.
    expect(lineChain.is).toHaveBeenCalledWith('deleted_at', null);
    // taxable counted ONCE per line (CGST+SGST share the line's base)
    expect(rows).toEqual([
      { itemCode: '998713', unitCode: 'NOS', quantity: 2, taxableBase: 90000, componentTaxBase: { CGST: 8100, SGST: 8100 } },
    ]);
  });
  it('returns [] when no invoices fall in the periods', async () => {
    from.mockReturnValue(chainFor({ data: [], error: null }) as never);
    expect(await fetchHsnLineAggregates(['2026-07'])).toEqual([]);
  });
});

describe('fetchInterStateB2CAggregates (GSTR-3B Table 3.2 source)', () => {
  it('joins IGST sale rows → B2C invoices → subdivision state codes and nets signed amounts', async () => {
    const vatChain = chainFor({ data: [
      { source_document_id: 'inv1', taxable_amount_base: 90000, vat_amount_base: 16200 },
      { source_document_id: 'inv1', taxable_amount_base: -1000, vat_amount_base: -180 },  // L4 advance offset nets in
      { source_document_id: 'inv2', taxable_amount_base: 5000, vat_amount_base: 900 },    // B2B — filtered out below
    ], error: null });
    const invChain = chainFor({ data: [
      { id: 'inv1', buyer_tax_number: null, place_of_supply_subdivision_id: 'sub-ka' },
      // inv2 absent: its buyer_tax_number is set, so the .is('buyer_tax_number', null) filter drops it
    ], error: null });
    const subChain = chainFor({ data: [
      { id: 'sub-ka', name: 'Karnataka', code: 'KA', tax_authority_code: '29' },
    ], error: null });
    from.mockImplementation((t: string) =>
      t === 'vat_records' ? vatChain : t === 'invoices' ? invChain : subChain);

    const rows = await fetchInterStateB2CAggregates(['2026-07']);

    expect(vatChain.eq).toHaveBeenCalledWith('component_code', 'IGST');
    expect(vatChain.in).toHaveBeenCalledWith('tax_period', ['2026-07']);
    expect(invChain.is).toHaveBeenCalledWith('buyer_tax_number', null);
    expect(rows).toEqual([
      { stateCode: '29', stateName: 'Karnataka', taxableBase: 89000, igstBase: 16020 },
    ]);
  });

  it('buckets inter-state B2C with NO place-of-supply into an explicit unknown state — never silently dropped (reconciles with gross 3.1(a))', async () => {
    const vatChain = chainFor({ data: [
      { source_document_id: 'inv1', taxable_amount_base: 50000, vat_amount_base: 9000 },
    ], error: null });
    const invChain = chainFor({ data: [
      { id: 'inv1', buyer_tax_number: null, place_of_supply_subdivision_id: null },
    ], error: null });
    const subChain = chainFor({ data: [], error: null });
    from.mockImplementation((t: string) =>
      t === 'vat_records' ? vatChain : t === 'invoices' ? invChain : subChain);

    const rows = await fetchInterStateB2CAggregates(['2026-07']);

    expect(rows).toEqual([
      { stateCode: '00', stateName: 'Unknown / unspecified place of supply', taxableBase: 50000, igstBase: 9000 },
    ]);
  });
});

describe('composeGstrSupplementaryBoxes (Table 3.2 + Table 12, collision-free sequences)', () => {
  it('emits 3.2 boxes first, then hsn boxes, sequenced from startSequence', async () => {
    from.mockImplementation((t: string) => {
      if (t === 'vat_records') return chainFor({ data: [
        { source_document_id: 'inv1', taxable_amount_base: 90000, vat_amount_base: 16200 },
      ], error: null });
      if (t === 'invoices') return chainFor({ data: [
        { id: 'inv1', buyer_tax_number: null, place_of_supply_subdivision_id: 'sub-ka' },
      ], error: null });
      if (t === 'geo_subdivisions') return chainFor({ data: [
        { id: 'sub-ka', name: 'Karnataka', code: 'KA', tax_authority_code: '29' },
      ], error: null });
      if (t === 'invoice_line_items') return chainFor({ data: [
        { id: 'l1', invoice_id: 'inv1', item_code: '998713', unit_code: 'NOS', quantity: 2 },
      ], error: null });
      // document_tax_lines
      return chainFor({ data: [
        { line_item_id: 'l1', component_code: 'IGST', taxable_base: 90000, tax_amount_base: 16200, exchange_rate: 1 },
      ], error: null });
    });

    const boxes = await composeGstrSupplementaryBoxes(['2026-07'], 6);

    expect(boxes.map((b) => b.boxCode)).toEqual(['3.2.29', 'hsn.998713.NOS']);
    expect(boxes.map((b) => b.sequence)).toEqual([6, 7]);
    expect(new Set(boxes.map((b) => b.sequence)).size).toBe(boxes.length);
  });
});
