import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { WHATSAPP_EVENT_CATALOG } from './whatsapp/events';

export type WhatsAppIntegration = Database['public']['Tables']['whatsapp_integrations']['Row'];
export type WhatsAppRule = Database['public']['Tables']['whatsapp_automation_rules']['Row'];
export type WhatsAppRuleInsert = Database['public']['Tables']['whatsapp_automation_rules']['Insert'];
export type WhatsAppTemplate = Database['public']['Tables']['whatsapp_templates']['Row'];
export type WhatsAppMessage = Database['public']['Tables']['whatsapp_messages']['Row'];
export type WhatsAppConsent = Database['public']['Tables']['whatsapp_consents']['Row'];

export interface ConsentStateRow { scope: string; opted_in: boolean; occurred_at: string; }

/** Pure: which catalog events have no rule row yet (used to seed defaults on first visit). */
export function diffRulesToSeed(
  existing: Array<Pick<WhatsAppRule, 'event_key'>>, tenantId: string,
): WhatsAppRuleInsert[] {
  const have = new Set(existing.map((r) => r.event_key));
  return WHATSAPP_EVENT_CATALOG.filter((e) => !have.has(e.key)).map((e) => ({
    tenant_id: tenantId,
    event_key: e.key,
    enabled: false,
    required_consent: e.requiredConsent,
    delay_minutes: e.defaultDelayMinutes,
    reminder_config: e.defaultReminderConfig ?? {},
  }));
}

/** Pure: consent-state rows → { utility, marketing } booleans. */
export function summarizeConsent(rows: ConsentStateRow[]): { utility: boolean; marketing: boolean } {
  const get = (scope: string) => rows.find((r) => r.scope === scope)?.opted_in ?? false;
  return { utility: get('utility'), marketing: get('marketing') };
}

/**
 * Every readable column EXCEPT access_token_secret_id / app_secret_secret_id.
 * Those two are REVOKEd from `authenticated` (the Vault handles are service-role
 * only), and Postgres denies `SELECT *` outright when any expanded column lacks a
 * grant — so this list must stay explicit. Adding a column to the table means
 * adding it here too.
 */
const INTEGRATION_COLUMNS = [
  'id', 'tenant_id', 'public_id', 'integration_mode', 'app_id', 'waba_id',
  'phone_number_id', 'display_phone_number', 'verified_name', 'graph_api_version',
  'webhook_verify_token', 'is_enabled', 'connection_status', 'webhook_status',
  'quality_rating', 'messaging_limit_tier', 'name_status', 'token_valid',
  'token_expires_at', 'send_paused_until', 'last_health_check_at', 'last_webhook_at',
  'health_errors', 'created_by', 'updated_by', 'created_at', 'updated_at', 'deleted_at',
].join(', ');

export type WhatsAppIntegrationView = Omit<
  WhatsAppIntegration, 'access_token_secret_id' | 'app_secret_secret_id'
>;

export async function getIntegration(): Promise<WhatsAppIntegrationView | null> {
  const { data, error } = await supabase.from('whatsapp_integrations')
    .select(INTEGRATION_COLUMNS).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return (data as WhatsAppIntegrationView | null) ?? null;
}

export async function listRules(): Promise<WhatsAppRule[]> {
  const { data, error } = await supabase.from('whatsapp_automation_rules')
    .select('*').is('deleted_at', null).order('event_key');
  if (error) throw error;
  return data ?? [];
}

export async function ensureRules(tenantId: string): Promise<void> {
  const rules = await listRules();
  const inserts = diffRulesToSeed(rules, tenantId);
  if (inserts.length === 0) return;
  const { error } = await supabase.from('whatsapp_automation_rules').insert(inserts);
  if (error && error.code !== '23505') throw error; // concurrent seeding is fine
}

export async function updateRule(id: string, patch: Partial<WhatsAppRule>): Promise<void> {
  const { error } = await supabase.from('whatsapp_automation_rules').update(patch).eq('id', id);
  if (error) throw error;
}

export async function listTemplates(): Promise<WhatsAppTemplate[]> {
  const { data, error } = await supabase.from('whatsapp_templates')
    .select('*').is('deleted_at', null).is('superseded_by', null)
    .order('name').order('language');
  if (error) throw error;
  return data ?? [];
}

export async function saveDraftTemplate(
  row: Database['public']['Tables']['whatsapp_templates']['Insert'],
): Promise<WhatsAppTemplate> {
  const { data, error } = await supabase.from('whatsapp_templates')
    .insert(row).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Template insert returned no row');
  return data;
}

export async function listMessages(filters: {
  caseId?: string; customerId?: string; status?: string; limit?: number;
}): Promise<WhatsAppMessage[]> {
  let q = supabase.from('whatsapp_messages').select('*')
    .is('deleted_at', null).order('created_at', { ascending: false })
    .limit(filters.limit ?? 100);
  if (filters.caseId) q = q.eq('case_id', filters.caseId);
  if (filters.customerId) q = q.eq('customer_id', filters.customerId);
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function retryMessage(id: string): Promise<void> {
  const { error } = await supabase.from('whatsapp_messages')
    .update({ status: 'pending', next_attempt_at: null, attempt_count: 0, last_error: null })
    .eq('id', id).eq('status', 'failed');
  if (error) throw error;
}

export async function getConsentState(tenantId: string, customerId: string): Promise<ConsentStateRow[]> {
  const { data, error } = await supabase.rpc('whatsapp_consent_state', {
    p_tenant_id: tenantId, p_customer_id: customerId,
  });
  if (error) throw error;
  return (data ?? []) as ConsentStateRow[];
}

export async function recordConsent(row: Database['public']['Tables']['whatsapp_consents']['Insert']): Promise<void> {
  const { error } = await supabase.from('whatsapp_consents').insert(row);
  if (error) throw error;
}

/**
 * All whatsapp-admin edge actions go through here. On a non-2xx response
 * supabase-js raises a generic FunctionsHttpError WITHOUT the body — the real
 * validation message ("Meta rejected the access token…", scope errors, template
 * rejections) lives in error.context; surface it or the Connection tab shows
 * "Edge Function returned a non-2xx status code" for every failure.
 */
export async function whatsappAdmin<T = Record<string, unknown>>(
  action: string, payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
    body: { action, ...payload },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
