import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Database } from '../types/database.types';

// Case- and customer-level communication logging/reading. Case rows go through
// the SECURITY DEFINER log_case_communication RPC (tenant derived from the
// case; service-role safe); customer rows are direct inserts (tenant trigger
// fills tenant_id).

export type CaseCommunicationRow =
  Database['public']['Tables']['case_communications']['Row'];
export type CustomerCommunicationRow =
  Database['public']['Tables']['customer_communications']['Row'];

export type CommunicationChannel = 'email' | 'whatsapp' | 'sms' | 'phone' | 'meeting';

export async function logCaseCommunication(input: {
  caseId: string;
  type: CommunicationChannel;
  subject?: string;
  content?: string;
  sentTo?: string;
  direction?: 'inbound' | 'outbound' | 'internal';
}): Promise<string> {
  const { data, error } = await supabase.rpc('log_case_communication', {
    p_case_id: input.caseId,
    p_type: input.type,
    p_subject: input.subject ?? undefined,
    p_content: input.content ?? undefined,
    p_direction: input.direction ?? 'outbound',
    p_sent_to: input.sentTo ?? undefined,
  });

  if (error) {
    logger.error('Error logging case communication:', error);
    throw error;
  }
  return data as string;
}

export async function listCaseCommunications(
  caseId: string
): Promise<CaseCommunicationRow[]> {
  const { data, error } = await supabase
    .from('case_communications')
    .select('*')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error listing case communications:', error);
    throw error;
  }
  return data ?? [];
}

export async function logCustomerCommunication(input: {
  customerId: string;
  type: CommunicationChannel;
  subject?: string;
  content?: string;
  direction?: 'inbound' | 'outbound';
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.tenant_id) throw new Error('No active tenant');

  const { error } = await supabase.from('customer_communications').insert({
    tenant_id: profile.tenant_id,
    customer_id: input.customerId,
    type: input.type,
    subject: input.subject ?? null,
    content: input.content ?? null,
    direction: input.direction ?? 'outbound',
    sent_by: user.id,
    sent_at: new Date().toISOString(),
    status: 'sent',
  });

  if (error) {
    logger.error('Error logging customer communication:', error);
    throw error;
  }
}

export async function listCustomerCommunications(
  customerId: string
): Promise<CustomerCommunicationRow[]> {
  const { data, error } = await supabase
    .from('customer_communications')
    .select('*')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error listing customer communications:', error);
    throw error;
  }
  return data ?? [];
}
