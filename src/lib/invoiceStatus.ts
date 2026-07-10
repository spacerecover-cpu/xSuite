// Single source of truth for deriving an invoice's payment status from amounts.
//
// Vocabulary is canonical (owner decision 2026-07-10, FU-1): lowercase codes
// matching invoices_status_check — 'paid' / 'partial' / 'sent'. The historical
// banking-only 'partially-paid' label was never storable (the CHECK rejects
// it); the label parameters that preserved it are gone.

/**
 * - amountDue <= 0            -> 'paid'
 * - amountPaid > 0            -> 'partial'
 * - otherwise (fully unpaid)  -> 'sent'
 *
 * Callers pass their own pre-computed amounts (some derive `due` from
 * total_amount, banking from balance_due — both preserved).
 */
export function deriveInvoiceStatus(amountPaid: number, amountDue: number): string {
  if (amountDue <= 0) return 'paid';
  if (amountPaid > 0) return 'partial';
  return 'sent';
}
