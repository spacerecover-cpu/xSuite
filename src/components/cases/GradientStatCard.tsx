import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Trend } from '../../lib/casePeriods';

/**
 * Tones are the gradient face of the card. Every value is a SEMANTIC TOKEN
 * (primary/info/danger/warning/success) or the fixed cat-* identity palette —
 * never a raw brand color or hex — so the cards re-theme per tenant and stay
 * clear of the purple/indigo ban + the no-raw-style-colors rule.
 *
 * Gentle two-stop gradients (token → token/85) keep the lower-right corner —
 * where the value/sub sit — saturated enough for white text to read.
 */
export type GradientTone = 'primary' | 'info' | 'danger' | 'warning' | 'success' | 'cat-2';

const TONE_GRADIENT: Record<GradientTone, string> = {
  primary: 'from-primary to-primary/85',
  info: 'from-info to-info/85',
  danger: 'from-danger to-danger/85',
  warning: 'from-warning to-warning/85',
  success: 'from-success to-success/85',
  'cat-2': 'from-cat-2 to-cat-2/85',
};

const TREND_ICON: Record<Trend['direction'], LucideIcon> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

interface GradientStatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone: GradientTone;
  /** Contextual sub-label for snapshot metrics, e.g. "of 286 total". */
  sub?: string;
  /** Period-over-period trend for flow metrics; renders a pill. */
  trend?: Trend;
  /** Caption shown beside the trend pill, e.g. "vs last month". */
  trendLabel?: string;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Bold gradient KPI tile for the Cases command center. Big tabular value, an
 * icon chip, a soft corner glow + oversized ghost icon for depth, and either a
 * trend pill (flow metrics) or a contextual sub-label (snapshot metrics).
 */
export const GradientStatCard: React.FC<GradientStatCardProps> = ({
  label,
  value,
  icon: Icon,
  tone,
  sub,
  trend,
  trendLabel,
  loading = false,
  onClick,
  className,
}) => {
  const interactive = Boolean(onClick);
  const TrendIcon = trend ? TREND_ICON[trend.direction] : null;
  const caption = trend ? trendLabel : sub;

  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        'relative overflow-hidden rounded-2xl p-4 text-white shadow-lg ring-1 ring-inset ring-white/10',
        'bg-gradient-to-br',
        TONE_GRADIENT[tone],
        interactive &&
          'cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -top-8 -right-6 h-24 w-24 rounded-full bg-white/15 blur-2xl"
        aria-hidden="true"
      />
      <Icon
        className="pointer-events-none absolute -bottom-4 -right-3 h-24 w-24 text-white/10"
        aria-hidden="true"
        strokeWidth={1.5}
      />

      <div className="relative flex items-start justify-between gap-2">
        <p className="text-xxs font-semibold uppercase tracking-wider text-white/90">{label}</p>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>
      </div>

      <div className="relative mt-3 flex h-9 items-end">
        {loading ? (
          <span className="h-8 w-20 animate-pulse rounded-md bg-white/25" />
        ) : (
          <span className="text-3xl font-bold leading-none tabular-nums">{value}</span>
        )}
      </div>

      <div className="relative mt-2 flex min-h-[20px] flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {trend && !loading && (
          <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 font-semibold">
            {TrendIcon && <TrendIcon className="h-3 w-3" aria-hidden="true" />}
            {trend.pct === null ? 'New' : `${trend.pct}%`}
          </span>
        )}
        {!loading && caption && <span className="truncate text-white/80">{caption}</span>}
      </div>
    </div>
  );
};
