import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/Skeleton';

export type StatCardTone =
  | 'info' | 'success' | 'warning' | 'danger' | 'neutral'
  | 'cat-1' | 'cat-2' | 'cat-3' | 'cat-4' | 'cat-5' | 'cat-6' | 'cat-7' | 'cat-8';

interface StatCardProps {
  label: string;
  value: string | number;
  /** Muted secondary line, e.g. a count: "4 paid". */
  sub?: string;
  tone?: StatCardTone;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
}

// Literal, JIT-safe class strings. Status tones use the *-muted token surfaces
// (DESIGN.md); cat-* identity tones use the sanctioned alpha pattern
// (bg-cat-N/10 + text-cat-N). The value stays slate-900 (not tone-colored) so
// meaning never relies on color alone.
const TONE: Record<StatCardTone, { surface: string; fg: string }> = {
  info: { surface: 'bg-info-muted border-info/20', fg: 'text-info' },
  success: { surface: 'bg-success-muted border-success/20', fg: 'text-success' },
  warning: { surface: 'bg-warning-muted border-warning/20', fg: 'text-warning' },
  danger: { surface: 'bg-danger-muted border-danger/20', fg: 'text-danger' },
  neutral: { surface: 'bg-slate-50 border-slate-200', fg: 'text-slate-600' },
  'cat-1': { surface: 'bg-cat-1/10 border-cat-1/20', fg: 'text-cat-1' },
  'cat-2': { surface: 'bg-cat-2/10 border-cat-2/20', fg: 'text-cat-2' },
  'cat-3': { surface: 'bg-cat-3/10 border-cat-3/20', fg: 'text-cat-3' },
  'cat-4': { surface: 'bg-cat-4/10 border-cat-4/20', fg: 'text-cat-4' },
  'cat-5': { surface: 'bg-cat-5/10 border-cat-5/20', fg: 'text-cat-5' },
  'cat-6': { surface: 'bg-cat-6/10 border-cat-6/20', fg: 'text-cat-6' },
  'cat-7': { surface: 'bg-cat-7/10 border-cat-7/20', fg: 'text-cat-7' },
  'cat-8': { surface: 'bg-cat-8/10 border-cat-8/20', fg: 'text-cat-8' },
};

/**
 * Compact KPI card: tone-tinted surface, label + value + optional muted
 * sub-count. The single standard stat card for list/dashboard pages.
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  sub,
  tone = 'neutral',
  icon: Icon,
  loading = false,
  className,
}) => {
  const t = TONE[tone];
  return (
    <div className={cn('rounded-xl border p-3', t.surface, className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn('text-xxs font-semibold uppercase tracking-wide', t.fg)}>{label}</p>
          {loading ? (
            <Skeleton className="h-6 w-20 mt-1" />
          ) : (
            <p className="text-xl font-bold text-slate-900 mt-0.5 leading-tight truncate">{value}</p>
          )}
          {sub && !loading && <p className="text-xs text-slate-500 mt-0.5 truncate">{sub}</p>}
        </div>
        {Icon && (
          <div className={cn('w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center shrink-0', t.fg)}>
            <Icon className="w-4 h-4" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
};
