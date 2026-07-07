import { describe, it, expect } from 'vitest';
import { buildAdvanceVoucherTotalsInput } from './advanceVoucher';

describe('buildAdvanceVoucherTotalsInput (Rule 50 inclusive back-out)', () => {
  it('emits a single tax-inclusive line at the 18% slab, SAC 998319 default', () => {
    const input = buildAdvanceVoucherTotalsInput(5000, '2026-04-10');
    expect(input.taxInclusive).toBe(true);
    expect(input.documentType).toBe('receipt_voucher');
    expect(input.taxRate).toBe(18);
    expect(input.items).toHaveLength(1);
    expect(input.items[0].unit_price).toBe(5000);
    expect(input.items[0].description).toContain('998319');
  });

  it('honors a caller-supplied SAC code', () => {
    const input = buildAdvanceVoucherTotalsInput(1180, '2026-04-10', '998713');
    expect(input.items[0].description).toContain('998713');
  });

  it('threads the buyer so place-of-supply (CGST/SGST vs IGST) follows the customer state', () => {
    const withBuyer = buildAdvanceVoucherTotalsInput(5000, '2026-04-10', undefined, { customerId: 'cust-1' });
    expect(withBuyer.customerId).toBe('cust-1');
    expect(withBuyer.companyId).toBeNull();
    // company overrides customer, mirroring the invoice buyer-identity block
    const withCompany = buildAdvanceVoucherTotalsInput(5000, '2026-04-10', undefined, { companyId: 'co-1' });
    expect(withCompany.companyId).toBe('co-1');
    // a genuinely buyer-less advance keeps null buyer → the Rule 50 IGST proviso
    expect(buildAdvanceVoucherTotalsInput(5000, '2026-04-10').customerId).toBeNull();
  });
});
