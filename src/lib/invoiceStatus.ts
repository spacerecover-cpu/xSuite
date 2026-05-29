// Single source of truth for deriving an invoice's payment status from amounts.
//
// The financial/payments services historically emit 'partial' for a partially
// paid invoice, while the banking services emit 'partially-paid'. Both strings
// are live and consumed downstream (financialService.getStatusColor,
// useSidebarBadges, financialReportsService, RecordReceiptModal), so they are
// NOT unified here — the label is a parameter and each caller reproduces its
// exact prior output.
// TODO(finance): reconcile 'partial' vs 'partially-paid' into one canonical
//   value behind a migration + downstream sweep, then drop the label params.

export interface DeriveInvoiceStatusOptions {
  /** Status when 0 < amountPaid and amountDue remains. Defaults to 'partial'. */
  partialLabel?: string;
  /** Status when nothing is paid yet. Defaults to 'sent'. */
  unpaidLabel?: string;
}

/**
 * - amountDue <= 0            -> 'paid'
 * - amountPaid > 0            -> partialLabel
 * - otherwise (fully unpaid)  -> unpaidLabel
 *
 * Callers pass their own pre-computed amounts (some derive `due` from
 * total_amount, banking from balance_due — both preserved).
 */
export function deriveInvoiceStatus(
  amountPaid: number,
  amountDue: number,
  options: DeriveInvoiceStatusOptions = {},
): string {
  const { partialLabel = 'partial', unpaidLabel = 'sent' } = options;
  if (amountDue <= 0) return 'paid';
  if (amountPaid > 0) return partialLabel;
  return unpaidLabel;
}
