import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) } }));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(async () => ({ documentCurrency: 'INR', rate: 1, rateSource: 'derived', documentDecimals: 2, baseDecimals: 2, baseCurrency: 'INR' })),
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn(async () => undefined) }));

import { createAdvancePayment, applyAdvanceToInvoice } from './advanceVoucherService';

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

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
});
