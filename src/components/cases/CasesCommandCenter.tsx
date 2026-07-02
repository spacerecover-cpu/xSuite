import React from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Briefcase,
  CheckCircle2,
  FilePlus2,
  Microscope,
  PackageCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { CASE_PERIOD_OPTIONS, type CasePeriod, type Trend } from '../../lib/casePeriods';
import type { CaseCommandStats } from '../../hooks/useCaseCommandStats';
import type { CaseBucket } from '../../lib/caseLifecycle';
import type { StatCardStyle } from '../../lib/statCardStyleService';
import { GradientStatCard } from '../shared/GradientStatCard';

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
  /** Tenant card style (Settings → Appearance): compact chips or vivid tiles. */
  cardStyle?: StatCardStyle;
  /** Vivid Urgent tile click — the page filters by priority. */
  onUrgentFilter?: () => void;
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

// Each bucket owns a VISIBLE-on-white hue end-to-end: dot + number share it,
// and the active (filtering) card tints in the same colour rather than a
// generic outline. The five stage hues are meaning-constant across themes
// (like status pills); "New" alone follows the tenant theme's primary as the
// brand moment (owner request) — note it reads near-ink on Royal's navy.
// Delivered stays ink/slate: terminal states shouldn't compete.
const BUCKET_META: Array<{
  bucket: CaseBucket;
  label: string;
  dotClass: string;
  valueClass: string;
  activeClass: string;
}> = [
  { bucket: 'new', label: 'New', dotClass: 'bg-primary', valueClass: 'text-primary', activeClass: 'border-primary bg-primary/10' },
  { bucket: 'diagnosis', label: 'In diagnosis', dotClass: 'bg-warning', valueClass: 'text-warning', activeClass: 'border-warning bg-warning-muted' },
  { bucket: 'approval', label: 'Awaiting approval', dotClass: 'bg-cat-6', valueClass: 'text-cat-6', activeClass: 'border-cat-6 bg-cat-6/10' },
  { bucket: 'recovery', label: 'In recovery', dotClass: 'bg-cat-2', valueClass: 'text-cat-2', activeClass: 'border-cat-2 bg-cat-2/10' },
  { bucket: 'ready', label: 'Ready', dotClass: 'bg-success', valueClass: 'text-success', activeClass: 'border-success bg-success-muted' },
  { bucket: 'delivered', label: 'Delivered', dotClass: 'bg-slate-400', valueClass: 'text-slate-900', activeClass: 'border-slate-400 bg-slate-100' },
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
  cardStyle = 'compact',
  onUrgentFilter,
}) => {
  const periodLabel = CASE_PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? '';
  const activeRing = 'ring-2 ring-primary ring-offset-2';

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

      {cardStyle === 'vivid' ? (
        <div
          className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"
          role="group"
          aria-label="Filter cases by lifecycle stage"
        >
          <GradientStatCard
            size="sm"
            tone="primary"
            icon={FilePlus2}
            label="New"
            value={stats?.buckets.new ?? 0}
            denom={stats?.total}
            loading={loading}
            onClick={() => onBucketChange(activeBucket === 'new' ? null : 'new')}
            className={cn(activeBucket === 'new' && activeRing)}
          />
          <GradientStatCard
            size="sm"
            tone="info"
            icon={Briefcase}
            label="Active"
            value={stats?.active ?? 0}
            denom={stats?.total}
            loading={loading}
            onClick={() => onBucketChange(null)}
          />
          <GradientStatCard
            size="sm"
            tone="danger"
            icon={AlertCircle}
            label="Urgent"
            value={stats?.urgent ?? 0}
            denom={stats?.total}
            loading={loading}
            onClick={onUrgentFilter}
          />
          <GradientStatCard
            size="sm"
            tone="warning"
            icon={Microscope}
            label="In Diagnosis"
            value={stats?.buckets.diagnosis ?? 0}
            denom={stats?.total}
            loading={loading}
            onClick={() => onBucketChange(activeBucket === 'diagnosis' ? null : 'diagnosis')}
            className={cn(activeBucket === 'diagnosis' && activeRing)}
          />
          <GradientStatCard
            size="sm"
            tone="success"
            icon={CheckCircle2}
            label="Ready"
            value={stats?.buckets.ready ?? 0}
            denom={stats?.total}
            loading={loading}
            onClick={() => onBucketChange(activeBucket === 'ready' ? null : 'ready')}
            className={cn(activeBucket === 'ready' && activeRing)}
          />
          <GradientStatCard
            size="sm"
            tone="cat-2"
            icon={PackageCheck}
            label="Delivered"
            value={stats?.buckets.delivered ?? 0}
            denom={stats?.total}
            loading={loading}
            onClick={() => onBucketChange(activeBucket === 'delivered' ? null : 'delivered')}
            className={cn(activeBucket === 'delivered' && activeRing)}
          />
        </div>
      ) : (
      <div
        className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"
        role="group"
        aria-label="Filter cases by lifecycle stage"
      >
        {BUCKET_META.map(({ bucket, label, dotClass, valueClass, activeClass }) => {
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
                active ? activeClass : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dotClass)} aria-hidden="true" />
                <span className="truncate">{label}</span>
              </span>
              {loading || value === undefined ? (
                <span className="mt-1 block h-7 w-14 animate-pulse rounded bg-slate-100" />
              ) : (
                <span className={cn('block text-xl font-bold leading-7 tabular-nums', valueClass)}>
                  {value.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
};
