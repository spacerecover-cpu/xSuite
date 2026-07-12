import { supabase } from './supabaseClient';
import type { Database, Json } from '../types/database.types';

type NotificationEventRow = Database['public']['Tables']['notification_events']['Row'];
type NotificationEventInsert = Database['public']['Tables']['notification_events']['Insert'];
type NotificationLogRow = Database['public']['Tables']['notification_log']['Row'];

export type DLQChannel = 'all' | 'in_app' | 'email';
export type DLQStatus = 'all' | 'failed' | 'bounced' | 'dlq';

export interface DLQFilters {
  eventType?: string;
  channel?: DLQChannel;
  status?: DLQStatus;
  startDate?: string;
  endDate?: string;
}

export interface DLQEvent extends NotificationEventRow {
  is_stuck: boolean;
  is_unprocessed: boolean;
  failed_log_count: number;
}

export interface DLQStats {
  unprocessed: number;
  failedDeliveries: number;
  stuckLongRunning: number;
}

const STUCK_THRESHOLD_MINUTES = 5;
const LONG_RUNNING_HOURS = 1;

function stuckCutoffIso(): string {
  return new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();
}

function longRunningCutoffIso(): string {
  return new Date(Date.now() - LONG_RUNNING_HOURS * 60 * 60 * 1000).toISOString();
}

// --- Email-route resolution -------------------------------------------------
// `notification_events.processed_at` is written by exactly one path: the
// notification-dispatch-email edge function, which stamps it (at claim time)
// only for events that have an email subscription. The in-app dispatch trigger
// delivers and writes notification_log WITHOUT touching processed_at. So
// `processed_at IS NULL` does NOT mean "undelivered" — for an in-app-only event
// (e.g. the seeded default staff subscription to case.phase_changed on in_app)
// it stays NULL forever despite correct delivery. An event is only genuinely
// unprocessed/stuck when it has an enabled email subscription route AND the edge
// function never claimed it. These helpers resolve that route.

export function emailRouteKey(tenantId: string, eventType: string): string {
  return `${tenantId}::${eventType}`;
}

interface EmailRoutes {
  /** Distinct event_types that have an enabled email subscription (any tenant). */
  eventTypes: string[];
  /** Precise `${tenant_id}::${event_type}` keys for per-tenant refinement. */
  keys: Set<string>;
}

export function buildEmailRoutes(
  rows: Array<{ tenant_id: string | null; event_type: string | null }>,
): EmailRoutes {
  const eventTypes = new Set<string>();
  const keys = new Set<string>();
  for (const row of rows) {
    if (!row.event_type) continue;
    eventTypes.add(row.event_type);
    if (row.tenant_id) keys.add(emailRouteKey(row.tenant_id, row.event_type));
  }
  return { eventTypes: Array.from(eventTypes), keys };
}

async function fetchEmailRoutes(): Promise<EmailRoutes> {
  const { data, error } = await supabase
    .from('notification_subscriptions')
    .select('tenant_id, event_type')
    .eq('channel', 'email')
    .eq('enabled', true)
    .is('deleted_at', null);
  if (error) throw error;
  return buildEmailRoutes(data ?? []);
}

export function deriveDlqFlags(
  event: Pick<NotificationEventRow, 'tenant_id' | 'event_type' | 'processed_at' | 'occurred_at'>,
  emailRouteKeys: Set<string>,
  longRunningCutoff: string,
): { is_unprocessed: boolean; is_stuck: boolean } {
  const undelivered =
    event.processed_at === null && emailRouteKeys.has(emailRouteKey(event.tenant_id, event.event_type));
  const is_stuck =
    undelivered && new Date(event.occurred_at).getTime() < new Date(longRunningCutoff).getTime();
  return { is_unprocessed: undelivered, is_stuck };
}

// PostgREST `or()` in-list value quoting (defensive; event_type is a dotted id).
function quoteOrInValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export async function getDLQStats(): Promise<DLQStats> {
  const longRunningCutoff = longRunningCutoffIso();
  const { eventTypes: emailRoutedTypes } = await fetchEmailRoutes();

  const failedPromise = supabase
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .in('status', ['failed', 'bounced', 'dlq'])
    .is('deleted_at', null);

  // Only events with an enabled email route can be genuinely unprocessed/stuck —
  // processed_at is the email-dispatch marker and is NULL by design for in-app-only
  // events. With no email routes at all, those two counters are definitionally zero,
  // so skip the (otherwise-flood-prone) processed_at IS NULL scans entirely.
  if (emailRoutedTypes.length === 0) {
    const failedRes = await failedPromise;
    if (failedRes.error) throw failedRes.error;
    return { unprocessed: 0, failedDeliveries: failedRes.count ?? 0, stuckLongRunning: 0 };
  }

  const [unprocessedRes, failedRes, stuckRes] = await Promise.all([
    supabase
      .from('notification_events')
      .select('id', { count: 'exact', head: true })
      .is('processed_at', null)
      .is('deleted_at', null)
      .in('event_type', emailRoutedTypes),
    failedPromise,
    supabase
      .from('notification_events')
      .select('id', { count: 'exact', head: true })
      .is('processed_at', null)
      .lt('occurred_at', longRunningCutoff)
      .is('deleted_at', null)
      .in('event_type', emailRoutedTypes),
  ]);

  if (unprocessedRes.error) throw unprocessedRes.error;
  if (failedRes.error) throw failedRes.error;
  if (stuckRes.error) throw stuckRes.error;

  return {
    unprocessed: unprocessedRes.count ?? 0,
    failedDeliveries: failedRes.count ?? 0,
    stuckLongRunning: stuckRes.count ?? 0,
  };
}

export async function getDLQEvents(filters: DLQFilters = {}): Promise<DLQEvent[]> {
  const stuckCutoff = stuckCutoffIso();
  const longRunningCutoff = longRunningCutoffIso();
  const { eventTypes: emailRoutedTypes, keys: emailRouteKeys } = await fetchEmailRoutes();

  let query = supabase
    .from('notification_events')
    .select('*')
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false })
    .limit(200);

  // Surface an event via the "stuck" clause (processed_at NULL + old) ONLY when its
  // event_type has an enabled email subscription — otherwise correctly-delivered
  // in-app-only events flood the queue forever. processing_attempts/last_error stay
  // unconditional: they signal a real processing failure on any channel.
  const orClauses = ['processing_attempts.gt.0', 'last_error.not.is.null'];
  if (emailRoutedTypes.length > 0) {
    const inList = emailRoutedTypes.map(quoteOrInValue).join(',');
    orClauses.push(
      `and(processed_at.is.null,occurred_at.lt.${stuckCutoff},event_type.in.(${inList}))`,
    );
  }
  query = query.or(orClauses.join(','));

  if (filters.eventType) {
    query = query.eq('event_type', filters.eventType);
  }
  if (filters.startDate) {
    query = query.gte('occurred_at', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('occurred_at', filters.endDate);
  }

  const { data: events, error } = await query;
  if (error) throw error;

  // event_type.in above is tenant-agnostic; refine to the precise per-tenant email
  // route so an in-app-only event whose type another tenant emails is not shown as
  // stuck. Events surfaced by a real processing signal (attempts/error) are kept.
  const rows = (events ?? []).filter((event) => {
    const stuckOnly =
      event.processed_at === null && event.processing_attempts === 0 && event.last_error === null;
    if (stuckOnly) return emailRouteKeys.has(emailRouteKey(event.tenant_id, event.event_type));
    return true;
  });
  if (rows.length === 0) return [];

  const eventIds = rows.map((r) => r.id);
  const failedStatuses = ['failed', 'bounced', 'dlq'];

  let logsQuery = supabase
    .from('notification_log')
    .select('event_id, channel, status')
    .in('event_id', eventIds)
    .is('deleted_at', null);

  if (filters.channel && filters.channel !== 'all') {
    logsQuery = logsQuery.eq('channel', filters.channel);
  }
  if (filters.status && filters.status !== 'all') {
    logsQuery = logsQuery.eq('status', filters.status);
  } else {
    logsQuery = logsQuery.in('status', failedStatuses);
  }

  const { data: logs } = await logsQuery;

  const failedCounts = new Map<string, number>();
  const eventIdsWithMatchingLog = new Set<string>();
  (logs ?? []).forEach((log) => {
    if (!log.event_id) return;
    eventIdsWithMatchingLog.add(log.event_id);
    if (failedStatuses.includes(log.status)) {
      failedCounts.set(log.event_id, (failedCounts.get(log.event_id) ?? 0) + 1);
    }
  });

  const filtered = rows.filter((event) => {
    if (filters.channel && filters.channel !== 'all') {
      return eventIdsWithMatchingLog.has(event.id);
    }
    if (filters.status && filters.status !== 'all') {
      return eventIdsWithMatchingLog.has(event.id);
    }
    return true;
  });

  return filtered.map<DLQEvent>((event) => ({
    ...event,
    ...deriveDlqFlags(event, emailRouteKeys, longRunningCutoff),
    failed_log_count: failedCounts.get(event.id) ?? 0,
  }));
}

export async function getEventLogs(eventId: string): Promise<NotificationLogRow[]> {
  const { data, error } = await supabase
    .from('notification_log')
    .select('*')
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getDistinctEventTypes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('notification_events')
    .select('event_type')
    .is('deleted_at', null)
    .order('event_type', { ascending: true })
    .limit(500);

  if (error) throw error;
  const seen = new Set<string>();
  (data ?? []).forEach((row) => {
    if (row.event_type) seen.add(row.event_type);
  });
  return Array.from(seen).sort();
}

export async function retryEvent(event: NotificationEventRow): Promise<NotificationEventRow> {
  const retrySuffix = `-retry-${Date.now()}`;
  const newDedupKey = `${event.dedup_key}${retrySuffix}`;

  const insertPayload: NotificationEventInsert = {
    tenant_id: event.tenant_id,
    event_type: event.event_type,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    actor_user_id: event.actor_user_id,
    payload: (event.payload ?? {}) as Json,
    dedup_key: newDedupKey,
    occurred_at: new Date().toISOString(),
    processing_attempts: 0,
    last_error: null,
    processed_at: null,
  };

  const { data, error } = await supabase
    .from('notification_events')
    .insert(insertPayload)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Retry insert returned no row');
  return data;
}

export async function markEventResolved(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('notification_events')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', eventId);

  if (error) throw error;
}
