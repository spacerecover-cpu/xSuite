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

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

describe('getPaymentStats (D7 — cross-document totals must be base currency)', () => {
  // The base-currency summation moved into the get_payment_stats_base SQL RPC
  // (coalesce(amount_base, amount)); the raw-vs-base and deleted_at behavior is
  // verified against live data by the P2c parity probe. At the service seam the
  // contract is: read the *Base fields the RPC returns (never a raw native sum),
  // pass the browser today/month-start, and default cleanly when there is no row.
  it('surfaces the RPC base-currency totals, and passes today/month-start', async () => {
    rpc.mockResolvedValue({
      data: {
        total: 2, completed: 2, pending: 0, today: 1,
        totalAmountBase: 88, completedAmountBase: 88, thisMonthAmountBase: 88,
      },
      error: null,
    });

    const stats = await getPaymentStats();

    expect(rpc).toHaveBeenCalledWith(
      'get_payment_stats_base',
      expect.objectContaining({ p_today: expect.any(String), p_month_start: expect.any(String) }),
    );
    expect(stats.total).toBe(2);
    expect(stats.completed).toBe(2);
    expect(stats.today).toBe(1);
    expect(stats.totalAmount).toBe(88); // the *Base field, not a raw native sum
    expect(stats.completedAmount).toBe(88);
    expect(stats.thisMonthAmount).toBe(88);
  });

  it('defaults every field to 0 when the RPC returns no row', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const stats = await getPaymentStats();

    expect(stats.total).toBe(0);
    expect(stats.totalAmount).toBe(0);
    expect(stats.thisMonthAmount).toBe(0);
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
