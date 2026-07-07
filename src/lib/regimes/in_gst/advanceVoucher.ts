import type { DocumentTotalsInput } from '../../taxDocumentService';

/** Rule 50 receipt-voucher fact assembly: the advance is collected GST-inclusive
 *  (a lab takes a round ₹5,000 at intake), so back it out at the 18% slab. The
 *  proviso default (18% when the rate is indeterminable; IGST when the nature of
 *  supply is indeterminable) is already the slab the kernel resolves via
 *  split_by_place_of_supply — no special-casing here. SAC 998319 (data recovery)
 *  is the tenant default; callers may pass 998713 or another selectable SAC. */
export function buildAdvanceVoucherTotalsInput(
  advanceAmount: number, documentDate: string, sacCode: string = '998319',
): DocumentTotalsInput {
  return {
    items: [{
      description: `Advance against data-recovery services (SAC ${sacCode})`,
      quantity: 1, unit_price: advanceAmount,
    }],
    discountAmount: 0,
    taxRate: 18,
    documentType: 'receipt_voucher',
    documentDate,
    taxInclusive: true,
  };
}
