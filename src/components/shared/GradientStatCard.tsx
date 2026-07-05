import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Trend } from '../../lib/casePeriods';

/**
 * The platform KPI tile: a bold token-gradient face with a subtle white/dark
 * decorative background. This is the single primitive behind the Cases command
 * center AND the shared StatCard/KpiRow, so every KPI surface looks the same.
 *
 * Tones map to a gradient + a foreground mode. White ink fails AA on the
 * lightest tiles (amber/lime/yellow), so those tones flip to dark ink; the
 * decoration and text colours follow the chosen mode (FG.dark vs FG.light).
 */
export type GradientTone =
  | 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'neutral'
  | 'cat-1' | 'cat-2' | 'cat-3' | 'cat-4' | 'cat-5' | 'cat-6' | 'cat-7' | 'cat-8';

const TONE: Record<GradientTone, { gradient: string; dark?: boolean }> = {
  primary: { gradient: 'from-primary to-primary/85' },
  info: { gradient: 'from-info to-info/85' },
  success: { gradient: 'from-success to-success/85' },
  danger: { gradient: 'from-danger to-danger/85' },
  warning: { gradient: 'from-warning to-warning/85', dark: true },
  neutral: { gradient: 'from-slate-600 to-slate-700' },
  'cat-1': { gradient: 'from-cat-1 to-cat-1/85' },
  'cat-2': { gradient: 'from-cat-2 to-cat-2/85' },
  'cat-3': { gradient: 'from-cat-3 to-cat-3/85', dark: true },
  'cat-4': { gradient: 'from-cat-4 to-cat-4/85', dark: true },
  'cat-5': { gradient: 'from-cat-5 to-cat-5/85' },
  'cat-6': { gradient: 'from-cat-6 to-cat-6/85' },
  'cat-7': { gradient: 'from-cat-7 to-cat-7/85' },
  'cat-8': { gradient: 'from-cat-8 to-cat-8/85' },
};

// Foreground bundles, picked by tone darkness. Literal class strings keep them
// JIT-safe. `dark` tiles (most) take white ink + white decor; `light` tiles
// (amber/lime/yellow) take ink-dark + dark decor so contrast stays AA.
// ink-dark (not slate-900) because the slate text utilities are theme-mapped:
// under midnight text-slate-900 inverts to near-white, which would put white
// ink on an amber tile. ink-dark is the constant on-color ink token.
type FgSpec = {
  text: string; label: string; denom: string; sub: string; pill: string;
  track: string; fill: string; ring: string; glow: string; ringline: string;
  ghost: string; dotA: string; dotB: string; dotC: string;
};
const FG: Record<'dark' | 'light', FgSpec> = {
  dark: {
    text: 'text-white', label: 'text-white/90', denom: 'text-white/60', sub: 'text-white/70',
    pill: 'bg-white/15', track: 'bg-white/20', fill: 'bg-white/75', ring: 'ring-white/10',
    glow: 'bg-white/15', ringline: 'border-white/10', ghost: 'text-white/10',
    dotA: 'bg-white/25', dotB: 'bg-white/20', dotC: 'bg-white/15',
  },
  light: {
    text: 'text-ink-dark', label: 'text-ink-dark/80', denom: 'text-ink-dark/60', sub: 'text-ink-dark/70',
    pill: 'bg-ink-dark/10', track: 'bg-ink-dark/10', fill: 'bg-ink-dark/50', ring: 'ring-ink-dark/5',
    glow: 'bg-ink-dark/10', ringline: 'border-ink-dark/10', ghost: 'text-ink-dark/10',
    dotA: 'bg-ink-dark/20', dotB: 'bg-ink-dark/15', dotC: 'bg-ink-dark/10',
  },
};

const TREND_ICON: Record<Trend['direction'], LucideIcon> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

/**
 * Decorative background: a soft glow, a faint orbital ring (a nod to a disk
 * platter), an oversized ghost icon, and a small dot scatter — all clipped and
 * aria-hidden. Colours come from the active foreground bundle so it adapts to
 * light and dark tiles. The icon is optional (KpiRow tiles often have none).
 */
const TileDecor: React.FC<{ icon?: LucideIcon; fg: FgSpec }> = ({ icon: Icon, fg }) => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <div className={cn('absolute -top-7 -right-6 h-20 w-20 rounded-full blur-2xl', fg.glow)} />
    <div className={cn('absolute -bottom-9 -right-8 h-28 w-28 rounded-full border', fg.ringline)} />
    {Icon && <Icon className={cn('absolute -bottom-2.5 -right-2 h-14 w-14', fg.ghost)} strokeWidth={1.5} />}
    <span className={cn('absolute right-3 top-2.5 h-1.5 w-1.5 rounded-full', fg.dotA)} />
    <span className={cn('absolute right-7 top-4 h-1 w-1 rounded-full', fg.dotB)} />
    <span className={cn('absolute right-2 top-6 h-1 w-1 rounded-full', fg.dotC)} />
  </div>
);

export interface GradientStatCardProps {
  label: string;
  value: string | number;
  tone?: GradientTone;
  /** Optional — rendered as the oversized ghost icon in the background. */
  icon?: LucideIcon;
  /** Muted caption line (snapshot metrics), e.g. "4 paid". */
  sub?: string;
  /** Period-over-period trend (flow metrics) → inline pill. */
  trend?: Trend;
  /** Denominator for snapshot share → "/N" + a share-of-total bar. */
  denom?: number;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  /** 'sm' tightens padding + value size for dense header rows. */
  size?: 'md' | 'sm';
}

/**
 * Compact gradient KPI tile. Label, a big tabular value (truncates with a
 * tooltip so long currency values stay readable), an optional inline trend pill
 * or "/total" denominator, an optional muted sub caption, and a thin
 * share-of-total bar when a denominator is given.
 */
export const GradientStatCard: React.FC<GradientStatCardProps> = ({
  label,
  value,
  tone = 'neutral',
  icon,
  sub,
  trend,
  denom,
  loading = false,
  onClick,
  className,
  size = 'md',
}) => {
  const spec = TONE[tone];
  const fg = spec.dark ? FG.light : FG.dark;
  const interactive = Boolean(onClick);
  const TrendIcon = trend ? TREND_ICON[trend.direction] : null;
  const pct =
    denom && denom > 0 && typeof value === 'number'
      ? Math.max(0, Math.min(100, Math.round((value / denom) * 100)))
      : null;

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
        'relative overflow-hidden rounded-xl shadow-md ring-1 ring-inset',
        size === 'sm' ? 'p-2.5' : 'p-3',
        fg.text,
        fg.ring,
        'bg-gradient-to-br',
        spec.gradient,
        interactive &&
          'cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current',
        className,
      )}
    >
      <TileDecor icon={icon} fg={fg} />

      <div className="relative">
        <p className={cn('truncate text-xxs font-semibold uppercase tracking-wider', fg.label)}>{label}</p>
      </div>

      <div className={cn('relative flex items-end justify-between gap-2', size === 'sm' ? 'mt-1' : 'mt-1.5')}>
        {loading ? (
          <span className={cn('animate-pulse rounded', size === 'sm' ? 'h-6 w-12' : 'h-7 w-14', fg.track)} />
        ) : (
          <span className="flex min-w-0 items-baseline gap-1 leading-none">
            <span
              className={cn('truncate font-bold tabular-nums', size === 'sm' ? 'text-xl' : 'text-2xl')}
              title={typeof value === 'string' ? value : undefined}
            >
              {value}
            </span>
            {denom != null && <span className={cn('shrink-0 text-xxs font-medium', fg.denom)}>/{denom}</span>}
          </span>
        )}
        {!loading && trend && (
          <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-xxs font-semibold', fg.pill)}>
            {TrendIcon && <TrendIcon className="h-3 w-3" aria-hidden="true" />}
            {trend.pct === null ? 'New' : `${trend.pct}%`}
          </span>
        )}
      </div>

      {!loading && sub && !trend && <p className={cn('relative mt-1 truncate text-xxs', fg.sub)}>{sub}</p>}

      {pct != null && (
        <div className={cn('relative h-1 overflow-hidden rounded-full', size === 'sm' ? 'mt-1.5' : 'mt-2', fg.track)}>
          {!loading && <div className={cn('h-full rounded-full', fg.fill)} style={{ width: `${pct}%` }} />}
        </div>
      )}
    </div>
  );
};
