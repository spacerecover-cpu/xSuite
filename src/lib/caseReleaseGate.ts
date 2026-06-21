// Client-side companions to the C3 release gate enforced in
// transition_case_status (migration c3_enforce_release_gate_*). The DB raises
// SQLSTATE 23514 with a HINT identifying which evidence is missing; we turn that
// into a guiding message, and we pre-compute readiness so the UI can show what's
// still needed before a case can advance to Completed / Delivered.

// Mirror the DB CHECK constraint on case_recovery_attempts.result.
export const RECOVERY_RESULTS = ['success', 'partial', 'failed', 'no_data'] as const;
export type RecoveryResult = (typeof RECOVERY_RESULTS)[number];

// The QA outcomes the capture UI records (subset of the status CHECK, which also
// allows the in-progress values 'pending' / 'in_progress').
export const QA_RESULTS = ['passed', 'failed'] as const;
export type QaResult = (typeof QA_RESULTS)[number];

interface GateErrorShape {
  code?: string;
  hint?: string | null;
  message?: string;
}

/**
 * Turn a transition_case_status gate violation into a guiding, user-facing
 * message. Returns null when the error is not a recognised release-gate block
 * (so callers can fall back to their generic error handling).
 */
export function describeGateError(error: unknown): string | null {
  const e = error as GateErrorShape | null | undefined;
  if (!e || e.code !== '23514') return null;
  switch (e.hint) {
    case 'qa_passed':
      return "This case can't advance until QA passes. Record a passed QA result in the Recovery & QA tab first.";
    case 'recovery_recorded':
      return "This case can't advance until a recovery attempt with an outcome is recorded. Add one in the Recovery & QA tab first.";
    case 'payment_outstanding':
      return "This case can't be released while it has an outstanding invoice balance. Record the remaining payment first (this gate is enabled for your lab in Settings).";
    default:
      return null;
  }
}

export interface RecoveryAttemptLike {
  result?: string | null;
  deleted_at?: string | null;
}

export interface QaChecklistLike {
  status?: string | null;
  deleted_at?: string | null;
}

export interface ReleaseReadiness {
  hasRecordedRecovery: boolean;
  hasPassedQa: boolean;
}

/**
 * Compute which release-gate preconditions are already satisfied for a case,
 * mirroring the EXISTS checks in transition_case_status.
 */
export function evaluateReleaseReadiness(input: {
  recoveryAttempts: RecoveryAttemptLike[];
  qaChecklists: QaChecklistLike[];
}): ReleaseReadiness {
  const hasRecordedRecovery = input.recoveryAttempts.some(
    (a) => a.result != null && !a.deleted_at,
  );
  const hasPassedQa = input.qaChecklists.some(
    (q) => q.status === 'passed' && !q.deleted_at,
  );
  return { hasRecordedRecovery, hasPassedQa };
}
