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
    return data;
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
