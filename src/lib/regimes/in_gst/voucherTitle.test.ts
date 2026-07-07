import { describe, it, expect } from 'vitest';
// PLAN DRIFT: the spec imports from '../in_gst_invoice' (a WP-S4 path that never
// materialized). The India DocumentComplianceProfile actually lives in
// './documents' (registered in ../register.ts as the 'in_gst_invoice' plugin).
import { inGstInvoiceProfile } from './documents';

describe('in_gst_invoice voucher titles', () => {
  const ctx = { sellerRegistered: true, taxInvoiceRequired: true };
  it('titles receipt and refund vouchers', () => {
    expect(inGstInvoiceProfile.documentTitle({ ...ctx, docType: 'receipt_voucher' }).title).toBe('RECEIPT VOUCHER');
    expect(inGstInvoiceProfile.documentTitle({ ...ctx, docType: 'refund_voucher' }).title).toBe('REFUND VOUCHER');
  });
});
