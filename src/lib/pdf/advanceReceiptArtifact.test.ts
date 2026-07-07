import { describe, it, expect } from 'vitest';
import { resolveAdvanceReceiptArtifact } from './advanceReceiptArtifact';

describe('resolveAdvanceReceiptArtifact', () => {
  it('IN GST tenants supersede the legacy payment receipt with the Rule 50 voucher', () => {
    expect(resolveAdvanceReceiptArtifact('in_gst_invoice')).toBe('receipt_voucher');
  });
  it('non-India regimes keep the legacy payment receipt for advances', () => {
    expect(resolveAdvanceReceiptArtifact('gcc_tax_invoice')).toBe('payment_receipt');
    expect(resolveAdvanceReceiptArtifact('generic_invoice')).toBe('payment_receipt');
    expect(resolveAdvanceReceiptArtifact(null)).toBe('payment_receipt');
  });
});
