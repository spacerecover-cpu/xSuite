import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, insertMock } = vi.hoisted(() => ({ from: vi.fn(), insertMock: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));

import {
  createVATRecordFromPurchase, createVATRecordFromInvoice, calculateVATForPeriod,
} from './vatService';

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
