import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Database } from '../types/database.types';
import type { RecoveryResult, QaResult } from './caseReleaseGate';

type RecoveryAttemptRow = Database['public']['Tables']['case_recovery_attempts']['Row'];
type RecoveryAttemptInsert = Database['public']['Tables']['case_recovery_attempts']['Insert'];
type QaChecklistRow = Database['public']['Tables']['case_qa_checklists']['Row'];
type QaChecklistInsert = Database['public']['Tables']['case_qa_checklists']['Insert'];

export interface RecordRecoveryAttemptInput {
  deviceId?: string | null;
  method?: string | null;
  toolUsed?: string | null;
  result: RecoveryResult;
  dataRecovered?: string | null;
  notes?: string | null;
}

export interface RecordQaResultInput {
  checklistName: string;
  result: QaResult;
}

type NoSolutionReasonRow = Database['public']['Tables']['master_case_no_solution_reasons']['Row'];

/**
 * Roll a recovery-attempt result up to the case-level outcome
 * (cases.recovery_outcome vocabulary: full | partial | unrecoverable | declined).
 * 'declined' is a customer-side outcome, not an attempt result, so it's not here.
 */
export const RECOVERY_RESULT_TO_OUTCOME: Record<RecoveryResult, string> = {
  success: 'full',
  partial: 'partial',
  failed: 'unrecoverable',
  no_data: 'unrecoverable',
};

/**
 * Aggregate EVERY recovery attempt on a case into the single case-level outcome
 * (cases.recovery_outcome). This is the opposite of last-write-wins: a case that
 * has already recovered data (e.g. drive 1 of a RAID succeeded) must never be
 * flipped to 'unrecoverable' by a later empty attempt on another drive — that
 * field drives the customer OutcomeBadge AND Rule 51 advance-GST refund
 * eligibility (canOfferRefundVoucher), so a wrong 'unrecoverable' exposes a
 * refund on a case that actually recovered data.
 *
 *  - every attempt succeeded                     → 'full'
 *  - some data recovered (any success/partial)
 *    but not all attempts succeeded              → 'partial'
 *  - nothing recovered (only failed / no_data)   → 'unrecoverable'
 *  - no valid attempt results                    → null (leave the field alone)
 */
export function aggregateRecoveryOutcome(results: ReadonlyArray<string | null>): string | null {
  const valid = results.filter(
    (r): r is RecoveryResult => r != null && r in RECOVERY_RESULT_TO_OUTCOME,
  );
  if (valid.length === 0) return null;
  if (valid.every((r) => r === 'success')) return 'full';
  if (valid.some((r) => r === 'success' || r === 'partial')) return 'partial';
  return 'unrecoverable';
}

/**
 * Capture services backing the C3 release gate. The gate in
 * transition_case_status requires a recorded recovery attempt and a passed QA
 * checklist before a case can reach Completed / Delivered; these are the only
 * write paths for that evidence.
 */
export const caseQualityService = {
  async listRecoveryAttempts(caseId: string): Promise<RecoveryAttemptRow[]> {
    const { data, error } = await supabase
      .from('case_recovery_attempts')
      .select('*')
      .eq('case_id', caseId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('Error listing recovery attempts:', error);
      throw error;
    }
    return data ?? [];
  },

  async recordRecoveryAttempt(
    caseId: string,
    tenantId: string,
    userId: string | null,
    input: RecordRecoveryAttemptInput,
  ): Promise<RecoveryAttemptRow> {
    const payload: RecoveryAttemptInsert = {
      tenant_id: tenantId,
      case_id: caseId,
      device_id: input.deviceId ?? null,
      method: input.method ?? null,
      tool_used: input.toolUsed ?? null,
      result: input.result,
      data_recovered: input.dataRecovered ?? null,
      notes: input.notes ?? null,
      performed_by: userId,
      completed_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('case_recovery_attempts')
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) {
      logger.error('Error recording recovery attempt:', error);
      throw error;
    }
    if (!data) throw new Error('Failed to record recovery attempt');

    // Roll the case outcome up by AGGREGATING across every non-deleted recovery
    // attempt on the case (see aggregateRecoveryOutcome) — never last-write-wins.
    // The attempt just inserted is committed, so it is included here. This keeps
    // the Outcome badge (esp. Partial) correct without waiting for checkout;
    // recovery_outcome is not gated by the status guard, so a direct column
    // update is fine and staff can still adjust it at delivery.
    const { data: attempts, error: attemptsErr } = await supabase
      .from('case_recovery_attempts')
      .select('result')
      .eq('case_id', caseId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    if (attemptsErr) {
      logger.error('Failed to load recovery attempts for outcome rollup:', attemptsErr);
    } else {
      const outcome = aggregateRecoveryOutcome((attempts ?? []).map((a) => a.result));
      if (outcome) {
        const { error: outcomeErr } = await supabase
          .from('cases')
          .update({ recovery_outcome: outcome, updated_at: new Date().toISOString() })
          .eq('id', caseId);
        if (outcomeErr) logger.error('Failed to roll up recovery outcome:', outcomeErr);
      }
    }
    return data;
  },

  /** Active no-solution reasons for the "Mark No Solution" picker. */
  async listNoSolutionReasons(): Promise<Pick<NoSolutionReasonRow, 'id' | 'code' | 'name' | 'description'>[]> {
    const { data, error } = await supabase
      .from('master_case_no_solution_reasons')
      .select('id, code, name, description')
      .eq('is_active', true)
      .order('sort_order');
    if (error) {
      logger.error('Error listing no-solution reasons:', error);
      throw error;
    }
    return data ?? [];
  },

  /**
   * Record the structured no-solution reason + notes on a case. The
   * transition_case_status no_solution_reason gate requires this to be set
   * before the case can enter the No-Solution phase.
   */
  async setNoSolutionReason(caseId: string, reasonId: string, notes?: string | null): Promise<void> {
    const { error } = await supabase
      .from('cases')
      .update({
        no_solution_reason_id: reasonId,
        no_solution_notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId);
    if (error) {
      logger.error('Error setting no-solution reason:', error);
      throw error;
    }
  },

  async listQaChecklists(caseId: string): Promise<QaChecklistRow[]> {
    const { data, error } = await supabase
      .from('case_qa_checklists')
      .select('*')
      .eq('case_id', caseId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('Error listing QA checklists:', error);
      throw error;
    }
    return data ?? [];
  },

  async recordQaResult(
    caseId: string,
    tenantId: string,
    userId: string | null,
    input: RecordQaResultInput,
  ): Promise<QaChecklistRow> {
    const payload: QaChecklistInsert = {
      tenant_id: tenantId,
      case_id: caseId,
      checklist_name: input.checklistName,
      status: input.result,
      created_by: userId,
      completed_by: userId,
      completed_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('case_qa_checklists')
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) {
      logger.error('Error recording QA result:', error);
      throw error;
    }
    if (!data) throw new Error('Failed to record QA result');
    return data;
  },
};
