import type { DocumentTotalsInput } from '../../taxDocumentService';

/** Rule 50 receipt-voucher fact assembly: the advance is collected GST-inclusive
 *  (a lab takes a round ₹5,000 at intake), so back it out at the 18% slab. The
 *  proviso default (18% when the rate is indeterminable; IGST when the nature of
 *  supply is indeterminable) is already the slab the kernel resolves via
 *  split_by_place_of_supply — no special-casing here. SAC 998319 (data recovery)
 *  is the tenant default; callers may pass 998713 or another selectable SAC. */
export function buildAdvanceVoucherTotalsInput(
  advanceAmount: number, documentDate: string, sacCode: string = '998319',
  buyer?: { customerId?: string | null; companyId?: string | null },
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
    // Thread the buyer so the kernel derives place-of-supply from the customer's
    // state (intra → CGST+SGST, inter → IGST). The Rule 50 IGST proviso then
    // applies ONLY to a genuinely buyer-less advance (POS indeterminable) — not
    // to every advance. Without this every voucher silently books IGST.
    customerId: buyer?.customerId ?? null,
    companyId: buyer?.companyId ?? null,
  };
}
