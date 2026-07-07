/** Regime-keyed receipt-artifact switch (NOT country branching): for an advance,
 *  an IN GST tenant issues the statutory Rule 50 Receipt Voucher, which SUPERSEDES
 *  the legacy payment_receipts artifact — one advance yields exactly one
 *  customer-facing receipt document. Every other regime keeps the legacy receipt.
 *  Keyed on the tenant's resolved regime.documents plugin key. */
export function resolveAdvanceReceiptArtifact(
  regimeDocumentsKey: string | null,
): 'receipt_voucher' | 'payment_receipt' {
  return regimeDocumentsKey === 'in_gst_invoice' ? 'receipt_voucher' : 'payment_receipt';
}
