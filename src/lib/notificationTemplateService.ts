import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Database } from '../types/database.types';

// Tenant-customizable event email templates. The notification-dispatch-email
// edge function resolves tenant override > system default (NULL tenant_id) per
// event_type/channel/locale — this service gives that table its first admin
// surface. RLS: tenant admins write own-tenant rows; system rows are
// platform-managed and read-only here.

export type NotificationTemplateRow =
  Database['public']['Tables']['notification_templates']['Row'];

export interface MergedNotificationTemplate {
  eventType: string;
  system: NotificationTemplateRow | null;
  override: NotificationTemplateRow | null;
}

/**
 * Flat payload keys available per event, introspected from the live emit
 * functions (transition_case_status, process_time_based_events,
 * emit_payment/stock functions) and notification_events.payload samples.
 * The dispatcher substitutes {{key}} with '' for missing keys.
 */
export const NOTIFICATION_EVENT_VARIABLES: Record<string, string[]> = {
  'case.phase_changed': [
    'case_no', 'from_status_name', 'to_status_name', 'from_phase', 'to_phase',
    'reason', 'notes', 'case_id', 'customer_id',
  ],
  'case.phase_changed.customer': [
    'case_no', 'from_status_name', 'to_status_name', 'from_phase', 'to_phase',
    'reason', 'notes', 'case_id', 'customer_id',
  ],
  'case.sla_breach': [
    'case_no', 'priority', 'phase', 'status_name', 'target_hours',
    'hours_in_phase', 'case_id',
  ],
  'case.follow_up_due': [
    'case_no', 'follow_up_type', 'notes', 'case_id', 'follow_up_id', 'quote_id',
  ],
  'quote.expiring_soon': [
    'quote_number', 'valid_until', 'hours_until_expiry', 'total_amount',
    'currency', 'quote_id', 'case_id', 'customer_id',
  ],
  'invoice.overdue.7d': [
    'invoice_number', 'due_date', 'days_overdue', 'balance_due', 'currency',
    'invoice_id', 'case_id', 'customer_id',
  ],
  'invoice.overdue.14d': [
    'invoice_number', 'due_date', 'days_overdue', 'balance_due', 'currency',
    'invoice_id', 'case_id', 'customer_id',
  ],
  'invoice.overdue.30d': [
    'invoice_number', 'due_date', 'days_overdue', 'balance_due', 'currency',
    'invoice_id', 'case_id', 'customer_id',
  ],
  'payment.received': [
    'payment_number', 'amount', 'currency', 'payment_date', 'reference',
    'status', 'payment_id', 'invoice_id', 'case_id', 'customer_id',
  ],
  'payment.received.customer': [
    'payment_number', 'amount', 'currency', 'payment_date', 'reference',
    'status', 'payment_id', 'invoice_id', 'case_id', 'customer_id',
  ],
  'inventory.low_stock': ['alert_type', 'message', 'alert_id', 'item_id'],
  'inventory.out_of_stock': ['alert_type', 'message', 'alert_id', 'item_id'],
};

/** Sample values for editor previews, keyed by payload key. */
export const SAMPLE_EVENT_PAYLOAD: Record<string, string> = {
  case_no: 'C-2025-000001',
  from_status_name: 'Diagnosis',
  to_status_name: 'Recovery In Progress',
  from_phase: 'intake',
  to_phase: 'recovery',
  reason: 'Customer approved the quote',
  notes: 'Cleanroom slot booked for tomorrow',
  priority: 'High',
  phase: 'recovery',
  status_name: 'Recovery In Progress',
  target_hours: '48',
  hours_in_phase: '53',
  quote_number: 'QT-2025-00001',
  valid_until: '2025-12-15',
  hours_until_expiry: '24',
  total_amount: '250.00',
  currency: 'USD',
  invoice_number: 'INV-2025-00001',
  due_date: '2025-11-30',
  days_overdue: '7',
  balance_due: '250.00',
  payment_number: 'PAY-2025-00001',
  amount: '250.00',
  payment_date: '2025-11-20',
  reference: 'Bank transfer',
  status: 'completed',
  alert_type: 'low_stock',
  message: 'Donor drives (2.5" 1TB) below minimum level',
  follow_up_type: 'quote_chase',
  follow_up_id: '00000000-0000-0000-0000-000000000000',
  case_id: '00000000-0000-0000-0000-000000000000',
  customer_id: '00000000-0000-0000-0000-000000000000',
  quote_id: '00000000-0000-0000-0000-000000000000',
  invoice_id: '00000000-0000-0000-0000-000000000000',
  payment_id: '00000000-0000-0000-0000-000000000000',
  alert_id: '00000000-0000-0000-0000-000000000000',
  item_id: '00000000-0000-0000-0000-000000000000',
};

/**
 * System defaults + the tenant's overrides for the email channel, merged per
 * event type. Events with neither row still appear when listed in
 * NOTIFICATION_EVENT_VARIABLES so admins can create an override from scratch.
 */
export async function listMergedEmailTemplates(): Promise<MergedNotificationTemplate[]> {
  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('channel', 'email')
    .eq('locale', 'en')
    .eq('is_active', true)
    .is('deleted_at', null);

  if (error) {
    logger.error('Error fetching notification templates:', error);
    throw error;
  }

  const rows = data ?? [];
  const eventTypes = new Set<string>([
    ...Object.keys(NOTIFICATION_EVENT_VARIABLES),
    ...rows.map((r) => r.event_type),
  ]);

  return Array.from(eventTypes)
    .sort()
    .map((eventType) => ({
      eventType,
      system: rows.find((r) => r.event_type === eventType && r.tenant_id === null) ?? null,
      override: rows.find((r) => r.event_type === eventType && r.tenant_id !== null) ?? null,
    }));
}

export async function upsertOverride(input: {
  tenantId: string;
  eventType: string;
  subjectTemplate: string;
  bodyTemplate: string;
  linkTemplate?: string | null;
  existingOverrideId?: string;
}): Promise<NotificationTemplateRow> {
  if (input.existingOverrideId) {
    const { data, error } = await supabase
      .from('notification_templates')
      .update({
        subject_template: input.subjectTemplate,
        body_template: input.bodyTemplate,
        link_template: input.linkTemplate ?? null,
      })
      .eq('id', input.existingOverrideId)
      .select()
      .maybeSingle();
    if (error) {
      logger.error('Error updating notification template override:', error);
      throw error;
    }
    if (!data) throw new Error('Override not found');
    return data;
  }

  const { data, error } = await supabase
    .from('notification_templates')
    .insert({
      tenant_id: input.tenantId,
      event_type: input.eventType,
      channel: 'email',
      locale: 'en',
      subject_template: input.subjectTemplate,
      body_template: input.bodyTemplate,
      link_template: input.linkTemplate ?? null,
      is_active: true,
    })
    .select()
    .maybeSingle();
  if (error) {
    logger.error('Error creating notification template override:', error);
    throw error;
  }
  if (!data) throw new Error('Failed to create override');
  return data;
}

/** Soft-delete the tenant override; delivery falls back to the system default. */
export async function removeOverride(overrideId: string): Promise<void> {
  const { error } = await supabase
    .from('notification_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', overrideId);
  if (error) {
    logger.error('Error removing notification template override:', error);
    throw error;
  }
}
