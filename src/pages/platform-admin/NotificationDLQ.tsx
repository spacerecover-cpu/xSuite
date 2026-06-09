import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  Inbox,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import {
  type DLQChannel,
  type DLQEvent,
  type DLQFilters,
  type DLQStats,
  type DLQStatus,
  getDLQEvents,
  getDLQStats,
  getDistinctEventTypes,
  getEventLogs,
  markEventResolved,
  retryEvent,
} from '../../lib/notificationDLQService';
import type { Database } from '../../types/database.types';

type NotificationLogRow = Database['public']['Tables']['notification_log']['Row'];

const dlqKeys = {
  all: ['platform-admin', 'notification-dlq'] as const,
  stats: () => [...dlqKeys.all, 'stats'] as const,
  events: (filters: DLQFilters) => [...dlqKeys.all, 'events', filters] as const,
  eventTypes: () => [...dlqKeys.all, 'event-types'] as const,
  logs: (eventId: string) => [...dlqKeys.all, 'logs', eventId] as const,
};

const CHANNEL_OPTIONS: Array<{ value: DLQChannel; label: string }> = [
  { value: 'all', label: 'All channels' },
  { value: 'in_app', label: 'In-app' },
  { value: 'email', label: 'Email' },
];

const STATUS_OPTIONS: Array<{ value: DLQStatus; label: string }> = [
  { value: 'all', label: 'All failure statuses' },
  { value: 'failed', label: 'Failed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'dlq', label: 'DLQ' },
];

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

function previewPayload(payload: unknown): string {
  try {
    const str = JSON.stringify(payload);
    if (!str) return '{}';
    if (str.length > 80) return `${str.slice(0, 77)}...`;
    return str;
  } catch {
    return '[unserializable]';
  }
}

const NotificationDLQ: React.FC = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<DLQChannel>('all');
  const [statusFilter, setStatusFilter] = useState<DLQStatus>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<DLQEvent | null>(null);

  // Verify in-page access: platform admin OR tenant admin/owner.
  const { data: accessCheck, isLoading: accessLoading } = useQuery({
    queryKey: ['notification-dlq', 'access-check', profile?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('is_platform_admin');
      const isPlatform = data === true;
      const role = profile?.role ?? null;
      const isTenantAdmin = role === 'admin' || role === 'owner';
      return { allowed: isPlatform || isTenantAdmin };
    },
    enabled: !!profile,
    staleTime: 5 * 60 * 1000,
  });

  const filters: DLQFilters = useMemo(
    () => ({
      eventType: eventTypeFilter || undefined,
      channel: channelFilter,
      status: statusFilter,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
    }),
    [eventTypeFilter, channelFilter, statusFilter, startDate, endDate],
  );

  const { data: stats } = useQuery<DLQStats>({
    queryKey: dlqKeys.stats(),
    queryFn: getDLQStats,
    enabled: accessCheck?.allowed === true,
    refetchInterval: 30000,
  });

  const { data: events = [], isLoading: eventsLoading, refetch: refetchEvents } = useQuery<DLQEvent[]>({
    queryKey: dlqKeys.events(filters),
    queryFn: () => getDLQEvents(filters),
    enabled: accessCheck?.allowed === true,
    refetchInterval: 60000,
  });

  const { data: eventTypes = [] } = useQuery<string[]>({
    queryKey: dlqKeys.eventTypes(),
    queryFn: getDistinctEventTypes,
    enabled: accessCheck?.allowed === true,
    staleTime: 5 * 60 * 1000,
  });

  const { data: detailLogs = [] } = useQuery<NotificationLogRow[]>({
    queryKey: dlqKeys.logs(detailEvent?.id ?? ''),
    queryFn: () => getEventLogs(detailEvent?.id ?? ''),
    enabled: !!detailEvent,
  });

  const retryMutation = useMutation({
    mutationFn: retryEvent,
    onSuccess: () => {
      toast.success('Event re-queued for dispatch');
      queryClient.invalidateQueries({ queryKey: dlqKeys.all });
    },
    onError: (err) => {
      toast.error(`Retry failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: markEventResolved,
    onSuccess: () => {
      toast.success('Event marked resolved');
      queryClient.invalidateQueries({ queryKey: dlqKeys.all });
    },
    onError: (err) => {
      toast.error(`Resolve failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    },
  });

  const handleResetFilters = () => {
    setEventTypeFilter('');
    setChannelFilter('all');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
  };

  if (accessLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!accessCheck?.allowed) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-lg border border-danger/30 p-8 text-center">
        <AlertOctagon className="w-12 h-12 mx-auto mb-3 text-danger" />
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Access denied</h2>
        <p className="text-sm text-slate-600">
          This page is restricted to platform admins and tenant owners/admins.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <AlertOctagon className="w-6 h-6 text-danger" />
            Notification Dead Letter Queue
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Inspect, retry, and resolve notification events that failed dispatch or stalled in processing.
          </p>
        </div>
        <button
          onClick={() => {
            void refetchEvents();
            queryClient.invalidateQueries({ queryKey: dlqKeys.stats() });
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Inbox}
          label="Unprocessed events"
          value={stats?.unprocessed ?? 0}
          tone="warning"
        />
        <StatCard
          icon={XCircle}
          label="Failed deliveries"
          value={stats?.failedDeliveries ?? 0}
          tone="danger"
        />
        <StatCard
          icon={Clock}
          label="Stuck > 1h"
          value={stats?.stuckLongRunning ?? 0}
          tone="danger"
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Event type</label>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All event types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Channel</label>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as DLQChannel)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DLQStatus)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button
            onClick={handleResetFilters}
            className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-md whitespace-nowrap"
          >
            Reset
          </button>
        </div>
      </div>

      {eventsLoading ? (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-success/60" />
          <p className="text-slate-500">No failed or stuck events found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-3 text-left font-medium text-slate-600 w-6"></th>
                <th className="px-3 py-3 text-left font-medium text-slate-600">Occurred</th>
                <th className="px-3 py-3 text-left font-medium text-slate-600">Event type</th>
                <th className="px-3 py-3 text-left font-medium text-slate-600">Entity</th>
                <th className="px-3 py-3 text-left font-medium text-slate-600">Payload</th>
                <th className="px-3 py-3 text-left font-medium text-slate-600">Last error</th>
                <th className="px-3 py-3 text-left font-medium text-slate-600">Attempts</th>
                <th className="px-3 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-3 py-3 text-right font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => {
                const isExpanded = expandedRow === event.id;
                return (
                  <React.Fragment key={event.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setExpandedRow(isExpanded ? null : event.id)}
                          className="p-1 hover:bg-slate-100 rounded"
                          aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                        <div className="font-medium">{formatRelative(event.occurred_at)}</div>
                        <div className="text-xs text-slate-400">
                          {new Date(event.occurred_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {event.event_type}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="font-medium text-slate-700">{event.entity_type}</div>
                        <div className="text-slate-400 font-mono truncate max-w-[140px]">
                          {event.entity_id}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-500 max-w-xs truncate">
                        {previewPayload(event.payload)}
                      </td>
                      <td className="px-3 py-3 text-xs text-danger max-w-xs truncate">
                        {event.last_error || (
                          <span className="text-slate-300 italic">none</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            event.processing_attempts > 0
                              ? 'bg-warning-muted text-warning'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {event.processing_attempts}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <StatusPills event={event} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => retryMutation.mutate(event)}
                            disabled={retryMutation.isPending}
                            className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors disabled:opacity-50"
                            title="Retry dispatch"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDetailEvent(event)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async () => {
                              const ok = await confirm({
                                title: 'Mark resolved',
                                message: 'Mark this event as resolved? It will be soft-deleted.',
                                confirmLabel: 'Mark resolved',
                                tone: 'danger',
                              });
                              if (!ok) return;
                              resolveMutation.mutate(event.id);
                            }}
                            disabled={resolveMutation.isPending}
                            className="p-1.5 hover:bg-success/10 text-success rounded-lg transition-colors disabled:opacity-50"
                            title="Mark resolved"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="px-6 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="font-semibold text-slate-600 mb-1">Payload</p>
                              <pre className="bg-white border border-slate-200 rounded p-2 overflow-x-auto text-slate-700 max-h-48">
                                {JSON.stringify(event.payload, null, 2)}
                              </pre>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <p className="font-semibold text-slate-600 mb-1">Dedup key</p>
                                <p className="font-mono text-slate-500 break-all">{event.dedup_key}</p>
                              </div>
                              {event.last_error && (
                                <div>
                                  <p className="font-semibold text-slate-600 mb-1">Last error</p>
                                  <p className="text-danger whitespace-pre-wrap break-all">{event.last_error}</p>
                                </div>
                              )}
                              <div>
                                <p className="font-semibold text-slate-600 mb-1">Event ID</p>
                                <p className="font-mono text-slate-500 break-all">{event.id}</p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={!!detailEvent}
        onClose={() => setDetailEvent(null)}
        title="Event details"
        icon={AlertOctagon}
        size="xl"
      >
        {detailEvent && (
          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Event type</p>
                <p className="font-mono text-slate-800">{detailEvent.event_type}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Occurred</p>
                <p className="text-slate-800">{new Date(detailEvent.occurred_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Entity</p>
                <p className="font-mono text-slate-800">
                  {detailEvent.entity_type}/{detailEvent.entity_id}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Attempts</p>
                <p className="text-slate-800">{detailEvent.processing_attempts}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-semibold text-slate-500 uppercase">Dedup key</p>
                <p className="font-mono text-slate-700 break-all">{detailEvent.dedup_key}</p>
              </div>
              {detailEvent.last_error && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Last error</p>
                  <p className="text-danger whitespace-pre-wrap break-words">{detailEvent.last_error}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Payload</p>
              <pre className="bg-slate-50 border border-slate-200 rounded p-3 overflow-x-auto text-xs text-slate-700 max-h-64">
                {JSON.stringify(detailEvent.payload, null, 2)}
              </pre>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Notification log ({detailLogs.length})
              </p>
              {detailLogs.length === 0 ? (
                <p className="text-slate-400 italic text-xs">No log rows for this event.</p>
              ) : (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Channel</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Recipient</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Retries</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Error</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="px-3 py-2 font-mono">{log.channel}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                ['failed', 'bounced', 'dlq'].includes(log.status)
                                  ? 'bg-danger-muted text-danger'
                                  : log.status === 'sent' || log.status === 'delivered'
                                    ? 'bg-success-muted text-success'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600 truncate max-w-[160px]">
                            {log.recipient_address ?? log.recipient_user_id ?? log.recipient_customer_id ?? '—'}
                          </td>
                          <td className="px-3 py-2">{log.retry_count}</td>
                          <td className="px-3 py-2 text-danger truncate max-w-[200px]">
                            {log.error ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                variant="ghost"
                onClick={() => setDetailEvent(null)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                isLoading={retryMutation.isPending}
                onClick={() => {
                  retryMutation.mutate(detailEvent);
                  setDetailEvent(null);
                }}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry dispatch
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: 'warning' | 'danger' | 'success';
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, tone }) => {
  const toneClasses: Record<StatCardProps['tone'], string> = {
    warning: 'bg-warning-muted text-warning',
    danger: 'bg-danger-muted text-danger',
    success: 'bg-success-muted text-success',
  };
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${toneClasses[tone]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-xs text-slate-500 uppercase font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</p>
      </div>
    </div>
  );
};

interface StatusPillsProps {
  event: DLQEvent;
}

const StatusPills: React.FC<StatusPillsProps> = ({ event }) => {
  const pills: React.ReactNode[] = [];
  if (event.is_stuck) {
    pills.push(
      <span key="stuck" className="bg-danger-muted text-danger text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> stuck
      </span>,
    );
  }
  if (event.is_unprocessed && !event.is_stuck) {
    pills.push(
      <span key="unproc" className="bg-warning-muted text-warning text-[10px] px-2 py-0.5 rounded-full font-medium">
        unprocessed
      </span>,
    );
  }
  if (event.failed_log_count > 0) {
    pills.push(
      <span key="failed" className="bg-danger-muted text-danger text-[10px] px-2 py-0.5 rounded-full font-medium">
        {event.failed_log_count} failed
      </span>,
    );
  }
  if (event.last_error) {
    pills.push(
      <span key="err" className="bg-danger-muted text-danger text-[10px] px-2 py-0.5 rounded-full font-medium">
        error
      </span>,
    );
  }
  if (pills.length === 0) {
    pills.push(
      <span key="ok" className="bg-slate-100 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-medium">
        ok
      </span>,
    );
  }
  return <div className="flex flex-wrap gap-1">{pills}</div>;
};

export { NotificationDLQ };
export default NotificationDLQ;
