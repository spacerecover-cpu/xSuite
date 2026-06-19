import React, { useCallback, useEffect, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UI_FLAG_KPIS_COLLAPSED, readUiFlagHint, loadUiFlag, setUiFlag } from '../../lib/uiPrefsService';

export interface CollapsibleKpisProps {
  children: React.ReactNode;
}

/**
 * Wraps a list page's KPI row with a per-user, persisted collapse toggle (M1).
 * Initial state comes from a localStorage hint (no flash); the server value
 * reconciles once on mount. Collapsing hides the KPI cards for the user across
 * list pages, leaving a compact "Show stats" affordance.
 */
export const CollapsibleKpis: React.FC<CollapsibleKpisProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(() => readUiFlagHint(UI_FLAG_KPIS_COLLAPSED));

  useEffect(() => {
    let cancelled = false;
    void loadUiFlag(UI_FLAG_KPIS_COLLAPSED).then((v) => {
      if (!cancelled) setCollapsed(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      void setUiFlag(UI_FLAG_KPIS_COLLAPSED, next);
      return next;
    });
  }, []);

  const Chevron = collapsed ? ChevronDown : ChevronUp;
  return (
    <div className={cn(collapsed && 'mb-4')}>
      <div className="flex items-center justify-end mb-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Chevron className="w-3.5 h-3.5" aria-hidden="true" />
          {collapsed ? 'Show stats' : 'Hide stats'}
        </button>
      </div>
      {!collapsed && children}
    </div>
  );
};
