import { supabase } from './supabaseClient';
import { logger } from './logger';

export const logAuditTrail = async (actionType: string, tableName: string, recordId: string, oldValues: object, newValues: object) => {
  try {
    const { error } = await supabase.rpc('log_audit_trail', {
      p_action: actionType,
      p_record_type: tableName,
      p_record_id: recordId,
      p_old_values: oldValues as never,
      p_new_values: newValues as never,
    });
    if (error) {
      throw new Error(error.message);
    }
  } catch (e) {
    logger.error('Audit trail logging failed:', e);
    throw new Error(`Audit trail logging failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
};
