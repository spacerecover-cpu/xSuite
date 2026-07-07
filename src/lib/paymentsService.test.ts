import { describe, it, expect, vi, beforeEach } from 'vitest';

// getPaymentStats wraps a supabase query; createPayment wraps the record_payment
// RPC. Mock the client (env-throwing on import) exposing BOTH from and rpc, and
// stub createPayment's collaborators (rate resolution, audit, custody).
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(async (currency: string | null | undefined, _date: string, o: { rate: number } | null) =>
    ({ documentCurrency: currency ?? 'INR', rate: o?.rate ?? 1, rateSource: 'manual' })),
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn() }));
vi.mock('./chainOfCustodyService', () => ({ logInvoicePayment: vi.fn() }));

import { getPaymentStats, createPayment } from './paymentsService';

/** Thenable query builder: select/gte/lte are chainable; awaiting it yields {data}. */
function makeQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

beforeEach(() => from.mockReset());

describe('getPaymentStats (D7 — cross-document totals must be base currency)', () => {
  it('sums amount_base across mixed-currency payments, never the raw native amount', async () => {
    // 100 @ rate→38 base, plus 50 @ base 50 ⇒ base total 88. Raw native sum would be 150.
    const query = makeQuery([
      { amount: 100, amount_base: 38, status: 'completed', payment_date: '2020-01-01' },
      { amount: 50, amount_base: 50, status: 'completed', payment_date: '2020-01-01' },
    ]);
    from.mockReturnValue(query);

    const stats = await getPaymentStats();

    expect(stats.totalAmount).toBe(88);
    expect(stats.completedAmount).toBe(88);
    // the fix is real only if the base shadow is actually selected
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('amount_base'));
  });

  it('falls back to the raw amount for pre-base transition rows (no amount_base)', async () => {
    const query = makeQuery([{ amount: 70, status: 'completed', payment_date: '2020-01-01' }]);
    from.mockReturnValue(query);

    const stats = await getPaymentStats();

    expect(stats.totalAmount).toBe(70);
  });
});

const basePayment = (amount: number) => ({
  payment_date: '2026-07-05',
  amount,
  currency: 'INR',
  exchange_rate: 1,
  status: 'completed' as const,
  payment_method_id: 'pm1',
  bank_account_id: 'ba1',
});

describe('createPayment withholding (WP-L3 TDS)', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: { id: 'p1', payment_number: 'PAY-1' }, error: null });
    // the post-RPC custody block is best-effort — a benign invoices chain suffices
    from.mockReset().mockReturnValue({
      select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })),
    });
  });

  it('passes withheld_amount + certificate_ref into p_payment; allocations settle amount + withheld', async () => {
    await createPayment(basePayment(98), [{ invoice_id: 'i1', amount: 100 }],
      { amount: 2, certificateRef: 'TDS/2026/001' });
    const call = rpc.mock.calls.find((c) => c[0] === 'record_payment');
    expect(call?.[1].p_payment.withheld_amount).toBe(2);
    expect(call?.[1].p_payment.certificate_ref).toBe('TDS/2026/001');
    expect(call?.[1].p_allocations).toEqual([{ invoice_id: 'i1', amount: 100 }]);
  });

  it('sends withheld_amount 0 and null certificate when no withholding is given', async () => {
    await createPayment(basePayment(100), [{ invoice_id: 'i1', amount: 100 }]);
    const call = rpc.mock.calls.find((c) => c[0] === 'record_payment');
    expect(call?.[1].p_payment.withheld_amount).toBe(0);
    expect(call?.[1].p_payment.certificate_ref).toBeNull();
  });

  it('rejects withholding without a certificate reference client-side (before any RPC)', async () => {
    await expect(
      createPayment(basePayment(98), [{ invoice_id: 'i1', amount: 100 }], { amount: 2, certificateRef: '  ' }),
    ).rejects.toThrow(/certificate/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
