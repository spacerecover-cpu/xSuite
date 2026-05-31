import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { STATUS_TONE_MUTED, type StatusTone } from '../../lib/ui/variants';
import { Card } from './Card';
import { Skeleton } from './Skeleton';

interface StatsCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  color?: string;
  className?: string;
  loading?: boolean;
}

const COLOR_ALIAS: Record<string, StatusTone> = {
  blue: 'info',
  green: 'success',
  orange: 'warning',
  yellow: 'warning',
  red: 'danger',
  purple: 'accent',
};

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  color = 'blue',
  className,
  loading = false,
}) => {
  const { t } = useTranslation();
  const tone = COLOR_ALIAS[color] ?? 'info';
  const chipClass = STATUS_TONE_MUTED[tone];

  return (
    <Card className={className}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn('p-3 rounded-lg', chipClass)}>
            <Icon className="w-6 h-6" aria-hidden="true" />
          </div>
          {trend && (
            <div
              className={cn(
                'flex items-center gap-1 text-sm font-medium',
                trend.isPositive ? 'text-success' : 'text-danger',
              )}
              aria-label={
                trend.isPositive
                  ? t('ui.statsCard.trendUp', { value: trend.value })
                  : t('ui.statsCard.trendDown', { value: trend.value })
              }
            >
              {trend.isPositive ? (
                <TrendingUp className="w-4 h-4" aria-hidden="true" />
              ) : (
                <TrendingDown className="w-4 h-4" aria-hidden="true" />
              )}
              {trend.value}%
            </div>
          )}
        </div>
        <h3 className="text-sm font-medium text-slate-600 mb-1">{title}</h3>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <p className="text-3xl font-bold text-slate-900">{value}</p>
        )}
      </div>
    </Card>
  );
};
