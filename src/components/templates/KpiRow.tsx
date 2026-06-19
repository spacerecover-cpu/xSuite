// src/components/templates/KpiRow.tsx
import React from 'react';
import { cn } from '../../lib/utils';
import { StatCard, type StatCardTone } from '../shared/StatCard';

export interface KpiSpec {
  label: string;
  value: string | number;
  sub?: string;
  tone?: StatCardTone;
  loading?: boolean;
}

export interface KpiRowProps {
  stats: KpiSpec[];
  /** Tailwind grid-cols utility; defaults to a 2-up/4-up responsive grid. */
  cols?: string;
}

/**
 * The single sanctioned KPI path. Maps KpiSpec[] → <StatCard/> grid. KpiSpec is
 * deliberately StatCard's contract (tone/label/value/sub) with no required icon
 * and no trend — so legacy StatsCard is structurally unreachable through the
 * templates (the H3 → L1 fold).
 */
export const KpiRow: React.FC<KpiRowProps> = ({ stats, cols = 'grid-cols-2 lg:grid-cols-4' }) => (
  <div className={cn('grid gap-3 mb-4', cols)} role="region" aria-label="summary">
    {stats.map((s) => (
      <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} tone={s.tone} loading={s.loading} />
    ))}
  </div>
);
