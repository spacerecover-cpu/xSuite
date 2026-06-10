import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Database } from '../types/database.types';

// Scheduled case follow-ups (feature flag: automation.case_follow_ups).
// channel 'internal' -> the pg_cron scanner emits a case.follow_up_due
// notification event; channel 'email' + auto_send -> the
// process-scheduled-followups edge function sends the FROZEN subject/message
// captured at scheduling time.

export type FollowUpRow = Database['public']['Tables']['case_follow_ups']['Row'];

export type FollowUpType =
  | 'general'
  | 'quote_chase'
  | 'pickup_reminder'
  | 'payment_reminder';

export const FOLLOW_UP_TYPE_LABELS: Record<FollowUpType, string> = {
  general: 'General follow-up',
  quote_chase: 'Quote chase',
  pickup_reminder: 'Pickup reminder',
  payment_reminder: 'Payment reminder',
};

export interface CreateFollowUpInput {
  caseId: string;
  followUpDate: string;
  type: FollowUpType;
  notes?: string;
  channel: 'internal' | 'email';
  autoSend?: boolean;
  sendTo?: string;
  subject?: string;
  message?: string;
  templateId?: string | null;
  quoteId?: string | null;
}

export async function createFollowUp(input: CreateFollowUpInput): Promise<FollowUpRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.tenant_id) throw new Error('No active tenant');

  const { data, error } = await supabase
    .from('case_follow_ups')
    .insert({
      tenant_id: profile.tenant_id,
      case_id: input.caseId,
      follow_up_date: input.followUpDate,
      type: input.type,
      notes: input.notes ?? null,
      status: 'pending',
      channel: input.channel,
      auto_send: input.channel === 'email' ? (input.autoSend ?? true) : false,
      send_to: input.sendTo ?? null,
      subject: input.subject ?? null,
      message: input.message ?? null,
      template_id: input.templateId ?? null,
      quote_id: input.quoteId ?? null,
      assigned_to: user.id,
      created_by: user.id,
    })
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error creating follow-up:', error);
    throw error;
  }
  if (!data) throw new Error('Failed to create follow-up');
  return data;
}

export async function listCaseFollowUps(caseId: string): Promise<FollowUpRow[]> {
  const { data, error } = await supabase
    .from('case_follow_ups')
    .select('*')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('follow_up_date', { ascending: true });

  if (error) {
    logger.error('Error listing case follow-ups:', error);
    throw error;
  }
  return data ?? [];
}

export type DueFollowUp = FollowUpRow & {
  cases: { case_number: string | null; title: string | null } | null;
};

/** Pending follow-ups due within the next `withinHours` (default: end of today + overdue). */
export async function listDueFollowUps(withinHours = 24): Promise<DueFollowUp[]> {
  const horizon = new Date(Date.now() + withinHours * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from('case_follow_ups')
    .select('*, cases!inner(case_number, title)')
    .is('deleted_at', null)
    .eq('status', 'pending')
    .lte('follow_up_date', horizon)
    .order('follow_up_date', { ascending: true })
    .limit(20);

  if (error) {
    logger.error('Error listing due follow-ups:', error);
    throw error;
  }
  return (data ?? []) as unknown as DueFollowUp[];
}

export async function completeFollowUp(id: string): Promise<void> {
  const { error } = await supabase
    .from('case_follow_ups')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    logger.error('Error completing follow-up:', error);
    throw error;
  }
}

export async function cancelFollowUp(id: string): Promise<void> {
  const { error } = await supabase
    .from('case_follow_ups')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) {
    logger.error('Error cancelling follow-up:', error);
    throw error;
  }
}
