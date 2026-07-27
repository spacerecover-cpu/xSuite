import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MessageSquare, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/database.types';
import { whatsappKeys } from '../../lib/queryKeys';
import { retryMessage } from '../../lib/whatsappService';
import { WHATSAPP_EVENT_CATALOG } from '../../lib/whatsapp/events';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { VirtualizedTableBody } from '../../components/ui/VirtualizedTableBody';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../hooks/useToast';
import { useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { formatDateTimeWithConfig } from '../../lib/format';
import { addDaysIso, tenantToday } from '../../lib/tenantToday';

type LogRow = Database['public']['Tables']['whatsapp_messages']['Row'] & {
  case: { case_number: string | null } | null;
  customer: { customer_name: string | null } | null;
};

type StatusVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_META: Record<string, { label: string; variant: StatusVariant }> = {
  pending: { label: 'Pending', variant: 'default' },
  sent: { label: 'Sent', variant: 'info' },
  delivered: { label: 'Delivered', variant: 'info' },
  read: { label: 'Read', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
  skipped: { label: 'Skipped', variant: 'warning' },
};

const STATUS_OPTIONS = ['all', 'pending', 'sent', 'delivered', 'read', 'failed', 'skipped'] as const;

const RANGES: Array<{ id: string; label: string; days: number | null }> = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

const EVENT_LABELS = new Map(WHATSAPP_EVENT_CATALOG.map((e) => [e.key, e.label]));

function eventLabel(row: LogRow): string {
  if (row.event_key) return EVENT_LABELS.get(row.event_key) ?? row.event_key;
  // stored kinds are 'session_text' / 'session_media' (never bare 'session')
  return String(row.message_kind ?? '').startsWith('session') ? 'Session reply' : 'Manual send';
}

function costChip(row: LogRow): string | null {
  if (!row.pricing_category) return null;
  return row.pricing_billable === false ? `${row.pricing_category} · free` : row.pricing_category;
}

const COL_COUNT = 9;

export const WhatsAppMessageLog: React.FC = () => {
  const dt = useDateTimeConfig();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>('all');
  const [eventKey, setEventKey] = useState<string>('all');
  const [range, setRange] = useState<string>('30d');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const dtConfig = { timezone: dt.timezone, timeFormat: dt.timeFormat };

  const fromDate = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)?.days;
    if (!days) return null;
    return addDaysIso(tenantToday(dt.timezone), -(days - 1));
  }, [range, dt.timezone]);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: whatsappKeys.messages({ status, eventKey, from: fromDate }),
    queryFn: async (): Promise<LogRow[]> => {
      let q = supabase
        .from('whatsapp_messages')
        .select('*, case:cases(case_number), customer:customers_enhanced(customer_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (status !== 'all') q = q.eq('status', status);
      if (eventKey !== 'all') q = q.eq('event_key', eventKey);
      if (fromDate) q = q.gte('created_at', fromDate);
      const { data, error: qError } = await q;
      if (qError) throw qError;
      return (data ?? []) as unknown as LogRow[];
    },
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.case?.case_number, r.customer?.customer_name, r.to_phone_e164, r.template_name, r.body_preview, eventLabel(r)]
        .some((v) => (v ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, search]);

  const failedVisible = useMemo(() => filtered.filter((r) => r.status === 'failed'), [filtered]);
  const allFailedSelected = failedVisible.length > 0 && failedVisible.every((r) => selected.has(r.id));

  const retryMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => retryMessage(id)));
      const rejected = results.filter((r) => r.status === 'rejected').length;
      return { requeued: ids.length - rejected, rejected };
    },
    onSuccess: ({ requeued, rejected }) => {
      if (requeued > 0) toast.success(`${requeued} message${requeued === 1 ? '' : 's'} re-queued for sending`);
      if (rejected > 0) toast.error(`${rejected} retr${rejected === 1 ? 'y' : 'ies'} could not be queued`);
      setSelected(new Set());
      setExpandedId(null);
      queryClient.invalidateQueries({ queryKey: whatsappKeys.all });
    },
    onError: () => toast.error('Retry failed'),
  });

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFailed = () => {
    setSelected(allFailedSelected ? new Set() : new Set(failedVisible.map((r) => r.id)));
  };

  const renderRow = (row: LogRow) => {
    const meta = STATUS_META[row.status] ?? { label: row.status, variant: 'default' as const };
    const isExpanded = expandedId === row.id;
    const cost = costChip(row);
    const timeline: Array<{ label: string; at: string | null }> = [
      { label: 'Queued', at: row.created_at },
      { label: 'Sent', at: row.sent_at },
      { label: 'Delivered', at: row.delivered_at },
      { label: 'Read', at: row.read_at },
      ...(row.failed_at ? [{ label: 'Failed', at: row.failed_at }] : []),
    ];
    return (
      <React.Fragment key={row.id}>
        <tr
          onClick={() => setExpandedId(isExpanded ? null : row.id)}
          className="hover:bg-slate-50 transition-colors cursor-pointer"
          aria-expanded={isExpanded}
        >
          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
            {row.status === 'failed' && (
              <input
                type="checkbox"
                aria-label={`Select failed message to ${row.to_phone_e164 ?? 'unknown recipient'}`}
                checked={selected.has(row.id)}
                onChange={() => toggleSelected(row.id)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
          </td>
          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
            {formatDateTimeWithConfig(row.created_at, dtConfig, { withTz: false })}
          </td>
          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">{eventLabel(row)}</td>
          <td className="px-4 py-3 whitespace-nowrap text-sm">
            <span className="font-semibold text-primary">{row.case?.case_number ?? '—'}</span>
            {row.customer?.customer_name && (
              <span className="block text-xs text-slate-500">{row.customer.customer_name}</span>
            )}
          </td>
          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600 tabular-nums">{row.to_phone_e164 ?? '—'}</td>
          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
            {row.template_name ?? (String(row.message_kind ?? '').startsWith('session') ? 'free-form' : '—')}
            {row.template_language && <span className="text-xs text-slate-400"> · {row.template_language}</span>}
          </td>
          <td className="px-4 py-3 whitespace-nowrap">
            <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
          </td>
          <td className="px-4 py-3 whitespace-nowrap">
            {cost ? <Badge variant="secondary" size="sm">{cost}</Badge> : <span className="text-sm text-slate-400">—</span>}
          </td>
          <td className="px-4 py-3 text-sm text-danger max-w-[220px] truncate" title={row.last_error ?? undefined}>
            {row.last_error ?? ''}
          </td>
        </tr>
        {isExpanded && (
          <tr className="bg-slate-50/70">
            <td colSpan={COL_COUNT} className="px-6 py-4">
              <div className="grid gap-6 md:grid-cols-3 text-sm">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Delivery timeline</h4>
                  <ol className="space-y-1.5">
                    {timeline.map((step) => (
                      <li key={step.label} className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`h-2 w-2 rounded-full ${step.at ? (step.label === 'Failed' ? 'bg-danger' : 'bg-success') : 'bg-slate-300'}`}
                        />
                        <span className={step.at ? 'text-slate-900 font-medium' : 'text-slate-400'}>{step.label}</span>
                        <span className="text-slate-500 ml-auto tabular-nums">
                          {step.at ? formatDateTimeWithConfig(step.at, dtConfig, { withTz: false }) : '—'}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-slate-500">
                    Attempts: <span className="font-medium text-slate-700">{row.attempt_count}</span>
                    {row.next_attempt_at && (
                      <> · Next attempt {formatDateTimeWithConfig(row.next_attempt_at, dtConfig, { withTz: false })}</>
                    )}
                    {row.skip_reason && <> · Skipped: {row.skip_reason}</>}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Message</h4>
                  {row.body_preview || row.session_body ? (
                    <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-slate-700">
                      {row.body_preview ?? row.session_body}
                    </p>
                  ) : (
                    <p className="text-slate-400">No preview captured</p>
                  )}
                  {row.last_error && (
                    <div className="mt-3 rounded-lg border border-danger/30 bg-danger-muted p-3">
                      <p className="text-xs font-semibold text-danger">
                        {row.last_error_code != null ? `Error ${row.last_error_code}` : 'Error'}
                      </p>
                      <p className="text-xs text-slate-700 mt-1 break-words">{row.last_error}</p>
                    </div>
                  )}
                  {row.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      isLoading={retryMutation.isPending}
                      onClick={() => retryMutation.mutate([row.id])}
                    >
                      <RefreshCw className="w-4 h-4 mr-1.5" />
                      Retry message
                    </Button>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Rendered parameters</h4>
                  {row.rendered_params ? (
                    <pre className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 overflow-x-auto max-h-48">
                      {JSON.stringify(row.rendered_params, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-slate-400">—</p>
                  )}
                  {row.wamid && <p className="mt-2 text-xs text-slate-400 break-all">wamid: {row.wamid}</p>}
                </div>
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="p-8 max-w-[1800px] mx-auto space-y-6">
      <PageHeaderSlot title="WhatsApp Message Log" icon={MessageSquare} />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
          <div className="w-full lg:w-72 relative">
            <label htmlFor="wa-log-search" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
              Search
            </label>
            <Search aria-hidden="true" className="absolute left-3 bottom-2.5 text-slate-400 w-4 h-4" />
            <input
              id="wa-log-search"
              type="text"
              placeholder="Case, customer, phone, template…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="wa-log-status" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
              Status
            </label>
            <select
              id="wa-log-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'All statuses' : (STATUS_META[s]?.label ?? s)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wa-log-event" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
              Event
            </label>
            <select
              id="wa-log-event"
              value={eventKey}
              onChange={(e) => setEventKey(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary max-w-[220px]"
            >
              <option value="all">All events</option>
              {WHATSAPP_EVENT_CATALOG.map((e) => (
                <option key={e.key} value={e.key}>{e.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  range === r.id
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="lg:ml-auto">
            <Button
              size="sm"
              variant="secondary"
              disabled={selected.size === 0}
              isLoading={retryMutation.isPending}
              onClick={() => retryMutation.mutate([...selected])}
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Retry {selected.size > 0 ? selected.size : ''} failed
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="bg-danger-muted border border-danger/30 rounded-2xl p-6 flex items-start gap-3">
          <AlertTriangle aria-hidden="true" className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700">Failed to load the message log: {(error as Error).message}</p>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <MessageSquare aria-hidden="true" className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">
            {rows.length === 0
              ? 'No WhatsApp messages in this period yet.'
              : 'No messages match your filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* scrollRef is the vertical scroll viewport VirtualizedTableBody measures —
              keep overflow-y scrollable (do not change to overflow-y-hidden). */}
          <div ref={scrollRef} className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '640px' }}>
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all failed messages"
                      checked={allFailedSelected}
                      disabled={failedVisible.length === 0}
                      onChange={toggleAllFailed}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Event</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Case / Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Recipient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Template</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Cost</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <VirtualizedTableBody
                  items={filtered}
                  renderRow={renderRow}
                  scrollRef={scrollRef}
                  colSpan={COL_COUNT}
                />
              </tbody>
            </table>
          </div>
          {rows.length >= 500 && (
            <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-200 bg-slate-50">
              Showing the most recent 500 messages — narrow the filters to reach older traffic.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
