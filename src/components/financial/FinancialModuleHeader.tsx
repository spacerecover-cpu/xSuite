import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { PageHeader } from '../shared/PageHeader';

interface Statistic {
  label: string;
  value: string | number;
  color: string;
}

interface FinancialModuleHeaderProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  /** @deprecated Inline stats are superseded by a StatCard row; ignored. */
  statistics?: Statistic[];
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** @deprecated The icon now uses the primary token; ignored. */
  iconBgColor?: string;
}

/**
 * @deprecated Use `PageHeader` (src/components/shared/PageHeader.tsx) plus a
 * `StatCard` row. Retained as a thin wrapper so existing financial pages keep
 * working; the inline `statistics` line and raw-hex `iconBgColor` are
 * intentionally dropped (they caused the duplicate hierarchy + off-theme icon).
 */
export const FinancialModuleHeader: React.FC<FinancialModuleHeaderProps> = ({
  icon,
  title,
  description,
  primaryAction,
  onRefresh,
  isRefreshing = false,
}) => {
  return (
    <PageHeader
      icon={icon}
      title={title}
      description={description}
      actions={
        <>
          {onRefresh && (
            <Button onClick={onRefresh} variant="secondary" size="sm" disabled={isRefreshing} title="Refresh data">
              <RefreshCw className={`w-4 h-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          )}
          {primaryAction && (
            <Button size="sm" onClick={primaryAction.onClick}>
              {primaryAction.icon && <span className="mr-1.5">{primaryAction.icon}</span>}
              {primaryAction.label}
            </Button>
          )}
        </>
      }
    />
  );
};
