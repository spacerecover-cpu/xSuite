import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** A Lucide icon component (e.g. `Package`) or an already-rendered node. */
  icon?: LucideIcon | React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Compact, standardized page header: a single toolbar row with a tokenized icon
 * chip + title + optional subtitle on the start edge and actions on the end.
 * Tightened for information density — keep page chrome short so content (tables)
 * sits high in the viewport.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, icon, actions }) => {
  let iconNode: React.ReactNode = null;
  if (icon) {
    iconNode = React.isValidElement(icon)
      ? icon
      : React.createElement(icon as LucideIcon, { className: 'w-5 h-5' });
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {iconNode && (
          <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
            {iconNode}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900 leading-tight truncate">{title}</h1>
          {description && (
            <p className="text-sm text-slate-500 leading-tight truncate">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};
