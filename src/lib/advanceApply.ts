// WP-L4 forward-apply: pure math for netting a held (unallocated) advance
// payment into an issued invoice. The authoritative guards live in the
// apply_advance_to_invoice RPC (unapplied balance, currency match, invoice
// balance, GST conservation); these helpers only drive the picker UI and
// keep the client-side default/max amount in step with the DB caps.

export interface AllocationAmount {
  amount: number | string | null;
}

/** Unapplied advance balance = advance amount − Σ(existing allocations). */
export function computeUnappliedBalance(amount: number, allocations: AllocationAmount[]): number {
  const applied = allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  return amount - applied;
}

/**
 * Largest amount that may be netted in one application: bounded by both the
 * advance's unapplied balance and the target invoice's balance due. Never
 * negative.
 */
export function maxApplicable(unapplied: number, invoiceBalance: number): number {
  return Math.max(0, Math.min(unapplied, invoiceBalance));
}

/** Clamp a requested amount into (0, max]; non-positive / non-finite → 0. */
export function clampApplyAmount(requested: number, max: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return requested > max ? max : requested;
}
