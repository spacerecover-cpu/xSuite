import React from 'react';
import { LucideIcon } from 'lucide-react';
import { GradientStatCard, type GradientTone } from './GradientStatCard';

/**
 * StatCard tones are the gradient primitive's tones. `neutral` is the default;
 * status tones (info/success/warning/danger) and the cat-* identity palette all
 * map straight through.
 */
export type StatCardTone = GradientTone;

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
 * The standard KPI card for list/dashboard pages. A thin wrapper over
 * GradientStatCard so every KPI surface shares one gradient look; the optional
 * icon renders as the tile's ghost background, and `sub` becomes the muted
 * caption line.
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
}) => (
  <GradientStatCard
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
