import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) } }));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(async () => ({ documentCurrency: 'INR', rate: 1, rateSource: 'derived', documentDecimals: 2, baseDecimals: 2, baseCurrency: 'INR' })),
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn(async () => undefined) }));

import { createAdvancePayment, applyAdvanceToInvoice, getHeldAdvancesForCase } from './advanceVoucherService';

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

// Chainable query builder that actually applies the filters, so the tests
// exercise the real WHERE clause the service builds (not just call-shape).
type Row = Record<string, unknown>;
function makeBuilder(rows: Row[]) {
  let filtered = rows.slice();
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => { filtered = filtered.filter((r) => r[col] === val); return builder; },
    in: (col: string, vals: unknown[]) => { filtered = filtered.filter((r) => vals.includes(r[col])); return builder; },
    is: (col: string, val: unknown) => { filtered = filtered.filter((r) => (r[col] ?? null) === val); return builder; },
    not: (col: string, _op: string, val: unknown) => { filtered = filtered.filter((r) => r[col] !== val); return builder; },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: filtered, error: null }),
  };
  return builder;
}
function mockTables(tables: Record<string, Row[]>) {
  from.mockImplementation((table: string) => makeBuilder(tables[table] ?? []));
}

describe('advanceVoucherService', () => {
  it('createAdvancePayment records record_payment with kind=advance and NO allocations', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'pay-1', payment_number: 'PAY-1' }, error: null });
    const res = await createAdvancePayment({
      amount: 5000, payment_date: '2026-04-10', customer_id: 'cust-1', case_id: 'case-1',
      payment_method_id: 'pm-1', bank_account_id: 'ba-1', currency: 'INR',
    });
    expect(res.id).toBe('pay-1');
    const [fnName, args] = rpc.mock.calls[0];
    expect(fnName).toBe('record_payment');
    expect((args as { p_payment: Record<string, unknown> }).p_payment.kind).toBe('advance');
    expect((args as { p_allocations: unknown[] }).p_allocations).toEqual([]);
  });

  it('applyAdvanceToInvoice calls the apply RPC with the three positional args', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, allocated: 5000 }, error: null });
    const res = await applyAdvanceToInvoice('pay-1', 'inv-1', 5000);
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('apply_advance_to_invoice', { p_payment_id: 'pay-1', p_invoice_id: 'inv-1', p_amount: 5000 });
  });

  it('getHeldAdvancesForCase returns a completed advance with its unapplied balance', async () => {
    mockTables({
      payments: [{ id: 'pay-1', payment_number: 'PAY-1', amount: 1000, currency: 'INR', payment_kind: 'advance', status: 'completed', case_id: 'case-1', deleted_at: null }],
      payment_allocations: [],
      advance_vouchers: [],
    });
    const res = await getHeldAdvancesForCase('case-1');
    expect(res).toEqual([{ id: 'pay-1', payment_number: 'PAY-1', amount: 1000, currency: 'INR', unappliedBalance: 1000 }]);
  });

  it('getHeldAdvancesForCase excludes a voided/refunded advance (regression: bug #10)', async () => {
    // void_payment flips status to 'refunded', leaves deleted_at NULL, soft-deletes
    // allocations, and posts no refund voucher — so applied=0 and refundedByPayment=0.
    // Without the status guard the reversed advance re-enters the picker as full cash.
    mockTables({
      payments: [{ id: 'pay-1', payment_number: 'PAY-1', amount: 1000, currency: 'INR', payment_kind: 'advance', status: 'refunded', case_id: 'case-1', deleted_at: null }],
      payment_allocations: [],
      advance_vouchers: [],
    });
    const res = await getHeldAdvancesForCase('case-1');
    expect(res).toEqual([]);
  });
});
