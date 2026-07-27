import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CheckCheck,
  Clock,
  Coins,
  Download,
  Eye,
  Reply,
  Send,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/database.types';
import { whatsappKeys } from '../../lib/queryKeys';
import { WHATSAPP_EVENT_CATALOG } from '../../lib/whatsapp/events';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { KpiRow, type KpiSpec } from '../../components/templates/KpiRow';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { chartAxis, chartCategorical, chartGrid, chartTooltipBorder } from '../../lib/chartTheme';
import { downloadCSV, type ExportColumn } from '../../lib/csvExport';
import { useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { addDaysIso, tenantToday } from '../../lib/tenantToday';

type SummaryRow = Database['public']['Functions']['whatsapp_analytics_summary']['Returns'][number];
type FailureRow = Database['public']['Functions']['whatsapp_failure_breakdown']['Returns'][number];

const RANGES: Array<{ id: string; label: string; days: number }> = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
];

const EVENT_LABELS = new Map(WHATSAPP_EVENT_CATALOG.map((e) => [e.key, e.label]));

const SERIES_COLORS = {
  Read: chartCategorical[1],
  Delivered: chartCategorical[0],
  Sent: chartCategorical[7],
  Failed: chartCategorical[4],
  Skipped: chartCategorical[3],
} as const;

const CSV_COLUMNS: ExportColumn<SummaryRow>[] = [
  { key: 'day', label: 'Day' },
  { key: 'queued', label: 'Queued' },
  { key: 'sent', label: 'Sent' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'read', label: 'Read' },
  { key: 'failed', label: 'Failed' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'billable', label: 'Billable' },
  { key: 'replies', label: 'Replies' },
  { key: 'avg_response_seconds', label: 'Avg response (s)' },
];

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export const WhatsAppAnalytics: React.FC = () => {
  const dt = useDateTimeConfig();
  const [range, setRange] = useState<string>('30d');

  const { from, toExclusive } = useMemo(() => {
    const today = tenantToday(dt.timezone);
    const days = RANGES.find((r) => r.id === range)?.days ?? 30;
    return { from: addDaysIso(today, -(days - 1)), toExclusive: addDaysIso(today, 1) };
  }, [range, dt.timezone]);

  // The aggregation RPCs ship in a later migration (whatsapp_gdpr_and_seeds) — a
  // missing function must degrade to an empty-state, not a crashed page.
  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryRow[] | null>({
    queryKey: whatsappKeys.analytics({ kind: 'summary', from, toExclusive }),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('whatsapp_analytics_summary', {
        p_from: from,
        p_to: toExclusive,
      });
      if (error) return null;
      return data ?? [];
    },
  });

  const { data: failures } = useQuery<FailureRow[] | null>({
    queryKey: whatsappKeys.analytics({ kind: 'failures', from, toExclusive }),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('whatsapp_failure_breakdown', {
        p_from: from,
        p_to: toExclusive,
      });
      if (error) return null;
      return data ?? [];
    },
  });

  const { data: eventRows = [] } = useQuery({
    queryKey: whatsappKeys.analytics({ kind: 'events', from, toExclusive }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('event_key,status')
        .is('deleted_at', null)
        .gte('created_at', from)
        .lt('created_at', toExclusive)
        .limit(1000);
      if (error) return [];
      return data ?? [];
    },
  });

  const rpcUnavailable = summary === null;

  const totals = useMemo(() => {
    const t = {
      queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0,
      billable: 0, replies: 0, responseSum: 0, responseWeight: 0,
    };
    for (const d of summary ?? []) {
      t.queued += d.queued;
      t.sent += d.sent;
      t.delivered += d.delivered;
      t.read += d.read;
      t.failed += d.failed;
      t.skipped += d.skipped;
      t.billable += d.billable;
      t.replies += d.replies;
      if (d.avg_response_seconds != null && d.replies > 0) {
        t.responseSum += d.avg_response_seconds * d.replies;
        t.responseWeight += d.replies;
      }
    }
    return t;
  }, [summary]);

  const kpis: KpiSpec[] = [
    { label: 'Sent', value: totals.sent, tone: 'primary', icon: Send, loading: summaryLoading },
    { label: 'Delivery rate', value: pct(totals.delivered, totals.sent), sub: `${totals.delivered} delivered`, tone: 'success', icon: CheckCheck, loading: summaryLoading },
    { label: 'Read rate', value: pct(totals.read, totals.delivered), sub: `${totals.read} read`, tone: 'info', icon: Eye, loading: summaryLoading },
    { label: 'Reply rate', value: pct(totals.replies, totals.sent), sub: `${totals.replies} replies`, tone: 'cat-1', icon: Reply, loading: summaryLoading },
    { label: 'Avg response time', value: formatDuration(totals.responseWeight > 0 ? totals.responseSum / totals.responseWeight : null), tone: 'neutral', icon: Clock, loading: summaryLoading },
    { label: 'Failed', value: totals.failed, tone: 'danger', icon: XCircle, loading: summaryLoading },
    { label: 'Billable messages', value: totals.billable, sub: `${totals.skipped} skipped`, tone: 'warning', icon: Coins, loading: summaryLoading },
  ];

  const volumeData = useMemo(
    () =>
      (summary ?? []).map((d) => ({
        day: d.day.slice(5),
        Read: d.read,
        Delivered: Math.max(d.delivered - d.read, 0),
        Sent: Math.max(d.sent - d.delivered, 0),
        Failed: d.failed,
        Skipped: d.skipped,
      })),
    [summary],
  );

  const failureData = useMemo(
    () =>
      (failures ?? []).map((f) => ({
        code: f.error_code != null ? `Code ${f.error_code}` : 'Unknown',
        occurrences: f.occurrences,
        sample: f.sample_error ?? '',
      })),
    [failures],
  );

  const eventStats = useMemo(() => {
    const map = new Map<string, { label: string; queued: number; sent: number; delivered: number; read: number; failed: number }>();
    for (const r of eventRows) {
      const key = r.event_key ?? 'manual';
      let e = map.get(key);
      if (!e) {
        e = {
          label: key === 'manual' ? 'Manual / session' : (EVENT_LABELS.get(key) ?? key),
          queued: 0, sent: 0, delivered: 0, read: 0, failed: 0,
        };
        map.set(key, e);
      }
      e.queued += 1;
      if (r.status === 'sent' || r.status === 'delivered' || r.status === 'read') e.sent += 1;
      if (r.status === 'delivered' || r.status === 'read') e.delivered += 1;
      if (r.status === 'read') e.read += 1;
      if (r.status === 'failed') e.failed += 1;
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.queued - a.queued);
  }, [eventRows]);

  const tooltipStyle = { fontSize: 12, borderRadius: 8, border: `1px solid ${chartTooltipBorder}` };

  return (
    <div className="p-8 max-w-[1800px] mx-auto space-y-6">
      <PageHeaderSlot
        title="WhatsApp Analytics"
        icon={BarChart3}
        actions={
          <Button
            size="sm"
            variant="secondary"
            disabled={!summary?.length}
            onClick={() => summary?.length && downloadCSV(summary, CSV_COLUMNS, 'whatsapp-analytics')}
          >
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </Button>
        }
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
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
        <p className="text-xs text-slate-500 ml-auto">
          {from} → {addDaysIso(toExclusive, -1)} · tenant timezone
        </p>
      </div>

      {rpcUnavailable && (
        <div className="bg-info-muted border border-info/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle aria-hidden="true" className="w-5 h-5 text-info shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700">
            Analytics aggregates are not available yet — the <code>whatsapp_analytics_summary</code> database
            function has not been installed on this environment. KPIs and charts will populate once it ships.
          </p>
        </div>
      )}

      <KpiRow stats={kpis} cols="grid-cols-2 md:grid-cols-4 xl:grid-cols-7" />

      {summaryLoading ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <Skeleton className="h-80 w-full rounded-2xl xl:col-span-2" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 xl:col-span-2">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Daily volume by outcome</h2>
            {volumeData.length === 0 ? (
              <p className="text-sm text-slate-500 py-16 text-center">No WhatsApp traffic in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={volumeData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chartGrid} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: chartAxis }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartAxis }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {(Object.keys(SERIES_COLORS) as Array<keyof typeof SERIES_COLORS>).map((series) => (
                    <Area
                      key={series}
                      type="monotone"
                      dataKey={series}
                      stackId="volume"
                      stroke={SERIES_COLORS[series]}
                      fill={SERIES_COLORS[series]}
                      fillOpacity={0.7}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Failures by error code</h2>
            {failureData.length === 0 ? (
              <p className="text-sm text-slate-500 py-16 text-center">
                {failures === null ? 'Failure breakdown unavailable.' : 'No failed messages in this period.'}
              </p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={failureData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="code"
                      width={84}
                      tick={{ fontSize: 11, fill: chartAxis }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip formatter={(value: number) => [String(value), 'Occurrences']} contentStyle={tooltipStyle} />
                    <Bar dataKey="occurrences" radius={[0, 4, 4, 0]}>
                      {failureData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={chartCategorical[index % chartCategorical.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <ul className="mt-4 space-y-1.5">
                  {failureData.slice(0, 5).map((f) => (
                    <li key={f.code} className="text-xs text-slate-600 flex gap-2">
                      <span className="font-semibold text-slate-900 shrink-0">{f.code}</span>
                      <span className="truncate" title={f.sample}>{f.sample || '—'}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">Per-event performance</h2>
          {eventRows.length >= 1000 && (
            <p className="text-xs text-warning">Showing the first 1,000 messages of this period — totals may undercount.</p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Event</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Queued</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Sent</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Delivered</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Read</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Failed</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Success %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {eventStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No messages in this period.
                  </td>
                </tr>
              ) : (
                eventStats.map((e) => (
                  <tr key={e.key} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-slate-900">{e.label}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-600 text-right tabular-nums">{e.queued}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-600 text-right tabular-nums">{e.sent}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-600 text-right tabular-nums">{e.delivered}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-600 text-right tabular-nums">{e.read}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-right tabular-nums">
                      <span className={e.failed > 0 ? 'text-danger font-semibold' : 'text-slate-600'}>{e.failed}</span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm font-semibold text-slate-900 text-right tabular-nums">
                      {pct(e.delivered, e.sent)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
