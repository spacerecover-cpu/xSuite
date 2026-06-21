/**
 * Shared status-tone -> semantic token-class maps. Replaces the success/warning/
 * danger/info color objects duplicated across Toast/Badge/ConfirmDialog/StatsCard.
 * `accent` has no -muted token, so it falls back to its solid pair.
 */
export const STATUS_TONE = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-danger text-danger-foreground',
  info: 'bg-info text-info-foreground',
  accent: 'bg-accent text-accent-foreground',
} as const;

export const STATUS_TONE_MUTED = {
  success: 'bg-success-muted text-success',
  warning: 'bg-warning-muted text-warning',
  danger: 'bg-danger-muted text-danger',
  info: 'bg-info-muted text-info',
  accent: 'bg-accent text-accent-foreground',
} as const;

export type StatusTone = keyof typeof STATUS_TONE;

/**
 * Badge variant union — mirrors the `BadgeVariant` type in
 * `src/components/ui/Badge.tsx`. Declared here (rather than imported) so the
 * canonical status->variant mapping lives next to STATUS_TONE without creating
 * a circular import: Badge.tsx already imports from this module.
 */
export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'custom'
  | 'error'
  | 'outline'
  | 'accent';

/**
 * Canonical mapping from a domain status string to a Badge variant. Replaces
 * the ad-hoc per-file `getStatusColor()` helpers (~22 call sites) with a single
 * token-vocabulary-backed source of truth. Adopt incrementally; this only ADDS
 * the function. Matching is case-insensitive and ignores surrounding whitespace.
 *
 * Unknown statuses — including null/undefined from nullable DB columns
 * (e.g. `invoices.status`) — fall back to the neutral `secondary` variant.
 */
export function statusToBadgeVariant(status: string | null | undefined): BadgeVariant {
  switch (status?.trim().toLowerCase()) {
    // Positive / terminal-good outcomes. Domain additions: 'ready' (recovery
    // data ready for delivery — matches the internal "Ready" success stat card),
    // 'available' (clone drive free for use).
    case 'paid':
    case 'completed':
    case 'complete':
    case 'active':
    case 'approved':
    case 'accepted':
    case 'delivered':
    case 'passed':
    case 'resolved':
    case 'closed':
    case 'verified':
    case 'ready':
    case 'available':
      return 'success';

    // In-progress / needs-attention but not failed. Domain additions:
    // 'in-progress' (hyphenated portal variant), 'waiting-approval' (recovery
    // blocked on customer approval — was an accent color, but no accent Badge
    // variant exists and "needs approval" reads as attention), 'maintenance'
    // (clone drive), 'on_leave' (employee).
    case 'pending':
    case 'partial':
    case 'partially_paid':
    case 'in_progress':
    case 'in-progress':
    case 'on_hold':
    case 'awaiting':
    case 'processing':
    case 'warning':
    case 'waiting-approval':
    case 'maintenance':
    case 'on_leave':
      return 'warning';

    // Informational / early-lifecycle states. Domain additions: 'received'/
    // 'diagnosis' (recovery intake), 'in_use' (clone drive in use), 'extracted'
    // (clone image extracted off the drive).
    case 'draft':
    case 'sent':
    case 'open':
    case 'new':
    case 'submitted':
    case 'info':
    case 'received':
    case 'diagnosis':
    case 'in_use':
    case 'extracted':
      return 'info';

    // Negative / failed / terminated outcomes. Domain additions: 'lost'/
    // 'damaged' (clone drive), 'deleted' (clone assignment), 'suspended'
    // (employee).
    case 'overdue':
    case 'failed':
    case 'rejected':
    case 'void':
    case 'voided':
    case 'cancelled':
    case 'canceled':
    case 'declined':
    case 'expired':
    case 'error':
    case 'lost':
    case 'damaged':
    case 'deleted':
    case 'suspended':
      return 'danger';

    default:
      return 'secondary';
  }
}
