import React from 'react';
import { AlertCircle, ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { CASE_PERIOD_OPTIONS, type CasePeriod, type Trend } from '../../lib/casePeriods';
import type { CaseCommandStats } from '../../hooks/useCaseCommandStats';
import type { CaseBucket } from '../../lib/caseLifecycle';

interface CasesCommandCenterProps {
  period: CasePeriod;
  onPeriodChange: (period: CasePeriod) => void;
  stats?: CaseCommandStats;
  loading?: boolean;
  /** Refresh / Create actions, owned by the page. */
  actions?: React.ReactNode;
  /** Optional context chip beside the summary, e.g. plan usage "12/50 this month". */
  note?: React.ReactNode;
  /** Snapshot bucket the list is filtered to; null = no bucket filter. */
  activeBucket: CaseBucket | null;
  onBucketChange: (bucket: CaseBucket | null) => void;
}

const PeriodToggle: React.FC<{ period: CasePeriod; onChange: (p: CasePeriod) => void }> = ({
  period,
  onChange,
}) => (
  <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Period">
    {CASE_PERIOD_OPTIONS.map((opt) => {
      const active = opt.value === period;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={active}
          className={cn(
            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

const TrendMark: React.FC<{ trend: Trend }> = ({ trend }) => {
  if (trend.direction === 'flat') return null;
  const Icon = trend.direction === 'up' ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-semibold',
        trend.direction === 'up' ? 'text-success' : 'text-danger',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {trend.pct !== null ? `${trend.pct}%` : 'new'}
    </span>
  );
};

const BUCKET_META: Array<{ bucket: CaseBucket; label: string; dotClass: string }> = [
  { bucket: 'new', label: 'New', dotClass: 'bg-primary' },
  { bucket: 'diagnosis', label: 'In diagnosis', dotClass: 'bg-warning' },
  { bucket: 'approval', label: 'Awaiting approval', dotClass: 'bg-accent' },
  { bucket: 'recovery', label: 'In recovery', dotClass: 'bg-info' },
  { bucket: 'ready', label: 'Ready', dotClass: 'bg-success' },
  { bucket: 'delivered', label: 'Delivered', dotClass: 'bg-slate-400' },
];

/**
 * The Cases command center: a one-line flow strip (snapshot active count +
 * period-scoped received/delivered/median-TAT with trends) and six compact
 * SNAPSHOT bucket chips that double as list filters (click to filter, click
 * again to clear). Presentational — the page owns data, period and filter
 * state. Buckets are lifecycle truth (master types + tenant overrides), so
 * the numbers always agree with the table below.
 */
export const CasesCommandCenter: React.FC<CasesCommandCenterProps> = ({
  period,
  onPeriodChange,
  stats,
  loading = false,
  actions,
  note,
  activeBucket,
  onBucketChange,
}) => {
  const periodLabel = CASE_PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? '';

  return (
    <div className="mb-4">
      <div className="mb-2.5 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
          {stats ? (
            <>
              <span>
                Active <span className="font-semibold text-slate-900">{stats.active.toLocaleString()}</span>
                <span className="text-slate-400"> of {stats.total.toLocaleString()}</span>
              </span>
              {stats.urgent > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger-muted px-2 py-0.5 text-xs font-semibold text-danger">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  {stats.urgent} urgent
                </span>
              )}
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-slate-500">{periodLabel}:</span>
              <span className="inline-flex items-center gap-1">
                <span className="font-semibold text-slate-900">{stats.receivedCount.toLocaleString()}</span>
                received <TrendMark trend={stats.receivedTrend} />
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <span className="font-semibold text-slate-900">{stats.deliveredCount.toLocaleString()}</span>
                delivered <TrendMark trend={stats.deliveredTrend} />
              </span>
              {stats.medianTatDays !== null && (
                <>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span>
                    median TAT <span className="font-semibold text-slate-900">{stats.medianTatDays}d</span>
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="text-slate-400">Loading case metrics…</span>
          )}
          {note && (
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xxs font-semibold text-slate-600">
              {note}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodToggle period={period} onChange={onPeriodChange} />
          {actions}
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"
        role="group"
        aria-label="Filter cases by lifecycle stage"
      >
        {BUCKET_META.map(({ bucket, label, dotClass }) => {
          const active = activeBucket === bucket;
          const value = stats?.buckets[bucket];
          return (
            <button
              key={bucket}
              type="button"
              onClick={() => onBucketChange(active ? null : bucket)}
              aria-pressed={active}
              className={cn(
                'rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)} aria-hidden="true" />
                <span className="truncate">{label}</span>
              </span>
              {loading || value === undefined ? (
                <span className="mt-1 block h-6 w-12 animate-pulse rounded bg-slate-100" />
              ) : (
                <span className="block text-lg font-bold leading-6 tabular-nums text-slate-900">
                  {value.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
