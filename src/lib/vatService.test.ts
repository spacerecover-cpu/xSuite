import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: () => ({
      insert: (rows: unknown[]) => { insertMock(rows); return {
        select: () => ({ maybeSingle: () => Promise.resolve({ data: (rows as any[])[0], error: null }) }) }; },
    }),
  },
}));

import { createVATRecordFromPurchase, createVATRecordFromInvoice } from './vatService';

beforeEach(() => insertMock.mockClear());

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
