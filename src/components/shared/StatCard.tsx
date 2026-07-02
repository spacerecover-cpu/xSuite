import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { GradientStatCard, type GradientTone } from './GradientStatCard';
import { useStatCardStyle } from '../../hooks/useStatCardStyle';

/**
 * StatCard tones are the gradient primitive's tones. `neutral` is the default;
 * status tones (info/success/warning/danger) and the cat-* identity palette all
 * map straight through.
 */
export type StatCardTone = GradientTone;

/** Compact-style dot colour per tone (literal classes for JIT safety). */
const DOT: Record<StatCardTone, string> = {
  neutral: 'bg-slate-400',
  primary: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  'cat-1': 'bg-cat-1',
  'cat-2': 'bg-cat-2',
  'cat-3': 'bg-cat-3',
  'cat-4': 'bg-cat-4',
  'cat-5': 'bg-cat-5',
  'cat-6': 'bg-cat-6',
  'cat-7': 'bg-cat-7',
  'cat-8': 'bg-cat-8',
};

/** Compact-style value colour: the number carries the hue (neutral + the
 *  too-light lime cat-3 stay ink for contrast on white). */
const VALUE: Record<StatCardTone, string> = {
  neutral: 'text-slate-900',
  primary: 'text-primary',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  'cat-1': 'text-cat-1',
  'cat-2': 'text-cat-2',
  'cat-3': 'text-slate-900',
  'cat-4': 'text-cat-4',
  'cat-5': 'text-cat-5',
  'cat-6': 'text-cat-6',
  'cat-7': 'text-cat-7',
  'cat-8': 'text-cat-8',
};

interface StatCardProps {
  label: string;
  value: string | number;
  /** Muted secondary line, e.g. a count: "4 paid". */
  sub?: string;
  tone?: StatCardTone;
  icon?: LucideIcon;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * THE platform KPI card. Renders in the tenant's chosen style (Settings →
 * Appearance): 'compact' — a calm white chip with a tone dot and coloured-dot
 * identity; 'vivid' — the dense gradient tile. One size and type scale in each
 * style, so every KPI surface (list pages, banking, VAT, dashboards, inventory)
 * looks identical.
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  loading = false,
  onClick,
  className,
}) => {
  const style = useStatCardStyle();

  if (style === 'vivid') {
    return (
      <GradientStatCard
        size="sm"
        label={label}
        value={value}
        sub={sub}
        tone={tone}
        icon={icon}
        loading={loading}
        onClick={onClick}
        className={className}
      />
    );
  }

  const interactive = Boolean(onClick);
  const Tag: 'button' | 'div' = interactive ? 'button' : 'div';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left',
        interactive &&
          'cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[tone])} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      {loading ? (
        <span className="mt-1 block h-7 w-14 animate-pulse rounded bg-slate-100" />
      ) : (
        <span
          className={cn('block truncate text-xl font-bold leading-7 tabular-nums', VALUE[tone])}
          title={typeof value === 'string' ? value : undefined}
        >
          {value}
        </span>
      )}
      {!loading && sub && <span className="block truncate text-xs text-slate-500">{sub}</span>}
    </Tag>
  );
};
