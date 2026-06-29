/**
 * Stage-driven document automation (Document Studio Phase 10). When a case changes
 * phase, advisorily auto-draft the document that phase usually needs. ADVISORY ONLY:
 * never approve/send/transition; idempotent; failure-isolated; fire-and-forget.
 */
import { createReportInstance, listDocumentInstances } from '../documentInstanceService';
import { isDocStudioEnabled } from '../featureFlags';
import { logger } from '../logger';

export interface CaseTransition {
  ok?: boolean;
  from_phase?: string;
  to_phase?: string;
  no_op?: boolean;
  [k: string]: unknown;
}

interface AutoDraftRule {
  id: string;
  /** Fires when a case moves from `from` to `to`. */
  when: (fromPhase: string, toPhase: string) => boolean;
  reportSubtype: 'evaluation' | 'service';
  title: string;
}

const RULES: AutoDraftRule[] = [
  // P2 — after diagnosis, entering quoting: an evaluation report to quote from.
  { id: 'P2_evaluation', when: (f, t) => f === 'diagnosis' && t === 'quoting', reportSubtype: 'evaluation', title: 'Evaluation Report' },
  // P3 — after recovery, entering QA: a service report documenting the work.
  { id: 'P3_service', when: (f, t) => f === 'recovery' && t === 'qa', reportSubtype: 'service', title: 'Service Report' },
  // P1 (DEFERRED) — data-destruction certificate. A Certificate of Destruction is a
  // CONSENTED destructive-service document (operator + witness), NOT something every
  // delivered case should auto-draft. Enable only behind a real "this case involved
  // data destruction" predicate, e.g.:
  //   { id: 'P1_destruction', when: (_f, t) => t === 'delivered' && caseHadDestruction, reportSubtype: 'data_destruction', title: 'Certificate of Destruction' },
];

/**
 * Fire-and-forget from the case-status mutation's onSuccess. Never throws to the
 * caller; each rule is isolated. Skips when Doc Studio is off or the transition is a no-op.
 */
export async function onCaseTransitioned(
  caseId: string,
  fromPhase: string,
  toPhase: string,
  transition?: CaseTransition,
): Promise<void> {
  try {
    if (!isDocStudioEnabled() || !caseId || transition?.no_op) return;
    const matching = RULES.filter((r) => r.when(fromPhase, toPhase));
    if (matching.length === 0) return;

    const existing = await listDocumentInstances(caseId);
    const existingSubtypes = new Set(
      existing.filter((d) => !d.deleted_at).map((d) => d.report_subtype),
    );

    for (const rule of matching) {
      if (existingSubtypes.has(rule.reportSubtype)) continue; // idempotent
      try {
        await createReportInstance({ caseId, reportSubtype: rule.reportSubtype, title: rule.title });
        logger.info?.(`[documentAutomation] drafted ${rule.reportSubtype} for case ${caseId} (${rule.id})`);
      } catch (err) {
        logger.error(`[documentAutomation] rule ${rule.id} failed for case ${caseId}:`, err);
      }
    }
  } catch (err) {
    logger.error('[documentAutomation] onCaseTransitioned failed:', err);
  }
}
