import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Lock, RotateCcw, Settings2 } from 'lucide-react';
import { Button } from './Button';
import type { ResolvedTableView } from '../../lib/tables/types';

interface ColumnPickerPopoverProps {
  /** Full registry, in registry order. */
  columns: Array<{ key: string; label: string }>;
  view: ResolvedTableView;
  onApply: (visible: string[], order: string[]) => void;
  onReset: () => void;
}

/**
 * Show/Hide + reorder control for configurable tables. Changes apply
 * immediately (and persist via the page's preference hook). Reordering uses
 * keyboard-accessible up/down buttons rather than drag-and-drop.
 */
export const ColumnPickerPopover: React.FC<ColumnPickerPopoverProps> = ({
  columns,
  view,
  onApply,
  onReset,
}) => {
  const [open, setOpen] = useState(false);

  const labelByKey = useMemo(() => new Map(columns.map((c) => [c.key, c.label])), [columns]);
  const lockedSet = useMemo(() => new Set(view.locked), [view.locked]);
  const visibleSet = useMemo(() => new Set(view.orderedVisible), [view.orderedVisible]);
  /** Display list: visible columns in their order, then hidden ones in registry order. */
  const displayKeys = useMemo(
    () => [...view.orderedVisible, ...columns.map((c) => c.key).filter((k) => !visibleSet.has(k))],
    [view.orderedVisible, columns, visibleSet],
  );

  const apply = (nextVisible: string[], nextOrder: string[]) => onApply(nextVisible, nextOrder);

  const toggle = (key: string) => {
    if (lockedSet.has(key)) return;
    const nextVisible = visibleSet.has(key)
      ? view.orderedVisible.filter((k) => k !== key)
      : [...view.orderedVisible, key];
    const nextOrder = visibleSet.has(key) ? displayKeys : [...view.orderedVisible, key, ...displayKeys.filter((k) => !visibleSet.has(k) && k !== key)];
    apply(nextVisible, nextOrder);
  };

  const move = (key: string, delta: -1 | 1) => {
    const order = [...view.orderedVisible];
    const idx = order.indexOf(key);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    apply(order, order);
  };

  return (
    <div className="relative flex-shrink-0">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog">
        <Settings2 className="w-4 h-4 mr-2" aria-hidden="true" />
        Columns
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Configure table columns"
            className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-surface p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Table columns</p>
              <button
                type="button"
                onClick={() => {
                  onReset();
                }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </button>
            </div>
            <ul className="max-h-80 space-y-0.5 overflow-y-auto">
              {displayKeys.map((key) => {
                const isVisible = visibleSet.has(key);
                const isLocked = lockedSet.has(key);
                const visibleIdx = view.orderedVisible.indexOf(key);
                return (
                  <li key={key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <input
                      id={`col-${key}`}
                      type="checkbox"
                      checked={isVisible}
                      disabled={isLocked}
                      onChange={() => toggle(key)}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-50"
                    />
                    <label
                      htmlFor={`col-${key}`}
                      className={`flex-1 truncate text-sm ${isVisible ? 'text-slate-900' : 'text-slate-500'}`}
                    >
                      {labelByKey.get(key) ?? key}
                    </label>
                    {isLocked && (
                      <Lock className="h-3.5 w-3.5 text-slate-400" aria-label="Locked by tenant settings" />
                    )}
                    {isVisible && !isLocked && (
                      <span className="flex">
                        <button
                          type="button"
                          onClick={() => move(key, -1)}
                          disabled={visibleIdx <= 0}
                          aria-label={`Move ${labelByKey.get(key)} up`}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(key, 1)}
                          disabled={visibleIdx === view.orderedVisible.length - 1}
                          aria-label={`Move ${labelByKey.get(key)} down`}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              Columns that don't fit your window collapse into the row expander instead of scrolling.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
