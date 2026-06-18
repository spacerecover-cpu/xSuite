import React from 'react';
import { StatCard, type StatCardTone } from '../shared/StatCard';

interface FinancialStatsCardProps {
  label: string;
  value: string | number;
  /** @deprecated Icons are omitted in the compact card; ignored. */
  icon?: React.ReactNode;
  color: 'blue' | 'green' | 'orange' | 'amber' | 'red' | 'slate' | 'purple' | 'teal';
}

const TONE_BY_COLOR: Record<FinancialStatsCardProps['color'], StatCardTone> = {
  blue: 'info',
  green: 'success',
  orange: 'warning',
  amber: 'warning',
  red: 'danger',
  slate: 'neutral',
  purple: 'cat-7',
  teal: 'cat-2',
};

/**
 * @deprecated Use `StatCard` (src/components/shared/StatCard.tsx). Retained as a
 * thin wrapper that maps the legacy `color` union to a StatCard tone.
 */
export const FinancialStatsCard: React.FC<FinancialStatsCardProps> = ({ label, value, color }) => (
  <StatCard label={label} value={value} tone={TONE_BY_COLOR[color]} />
);
