import React from 'react';
import { Briefcase, FilePlus2, AlertCircle, Microscope, CheckCircle2, PackageCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { CASE_PERIOD_OPTIONS, type CasePeriod } from '../../lib/casePeriods';
import type { CaseCommandStats } from '../../hooks/useCaseCommandStats';
import { GradientStatCard } from './GradientStatCard';

interface CasesCommandCenterProps {
  period: CasePeriod;
  onPeriodChange: (period: CasePeriod) => void;
  stats?: CaseCommandStats;
  loading?: boolean;
  /** Refresh / Create actions, owned by the page. */
  actions?: React.ReactNode;
  /** Optional context chip beside the summary, e.g. plan usage "12/50 this month". */
  note?: React.ReactNode;
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

/**
 * The Cases "command center" header: an airy title row (icon + title + live
 * summary) with the period toggle and page actions, above a bold six-tile KPI
 * grid. Presentational — the page owns the data (useCaseCommandStats), the
 * period state, and the action handlers.
 *
 * The gradient KPI tiles are an owner-approved, documented deviation from the
 * "no decorative gradients" rule (see DESIGN.md Decisions Log, 2026-06-24).
 */
export const CasesCommandCenter: React.FC<CasesCommandCenterProps> = ({
  period,
  onPeriodChange,
  stats,
  loading = false,
  actions,
  note,
}) => {
  const periodOpt = CASE_PERIOD_OPTIONS.find((o) => o.value === period) ?? CASE_PERIOD_OPTIONS[0];
  const summary = stats
    ? `${stats.active} active · ${stats.diagnosis} in diagnosis · ${stats.urgent} urgent`
    : 'Data recovery case management';

  return (
    <div className="mb-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Briefcase className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight text-slate-900">Cases</h1>
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm text-slate-500">{summary}</p>
              {note && (
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xxs font-semibold text-slate-600">
                  {note}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodToggle period={period} onChange={onPeriodChange} />
          {actions}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <GradientStatCard
          tone="primary"
          icon={FilePlus2}
          label="New"
          value={stats?.newCount ?? 0}
          trend={stats?.newTrend}
          trendLabel={periodOpt.vsLabel}
          loading={loading}
        />
        <GradientStatCard
          tone="info"
          icon={Briefcase}
          label="Active"
          value={stats?.active ?? 0}
          sub={stats ? `of ${stats.total} total` : undefined}
          loading={loading}
        />
        <GradientStatCard
          tone="danger"
          icon={AlertCircle}
          label="Urgent"
          value={stats?.urgent ?? 0}
          sub="need attention"
          loading={loading}
        />
        <GradientStatCard
          tone="warning"
          icon={Microscope}
          label="In Diagnosis"
          value={stats?.diagnosis ?? 0}
          sub="in the lab"
          loading={loading}
        />
        <GradientStatCard
          tone="success"
          icon={CheckCircle2}
          label="Ready"
          value={stats?.ready ?? 0}
          sub="to hand over"
          loading={loading}
        />
        <GradientStatCard
          tone="cat-2"
          icon={PackageCheck}
          label="Delivered"
          value={stats?.deliveredCount ?? 0}
          trend={stats?.deliveredTrend}
          trendLabel={periodOpt.vsLabel}
          loading={loading}
        />
      </div>
    </div>
  );
};
