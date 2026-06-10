import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fitColumns } from '../../lib/tables/fitColumns';
import type { ResolvedTableView, TableColumnDef } from '../../lib/tables/types';

/** Matches the useBulkSelection API so pages can pass it straight through. */
export interface ConfigurableSelection {
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  allSelected: (ids: string[]) => boolean;
  someSelected: (ids: string[]) => boolean;
  setMany: (ids: string[], on: boolean) => void;
}

interface ConfigurableDataTableProps<T> {
  rows: T[];
  columns: TableColumnDef<T>[];
  view: ResolvedTableView;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selection?: ConfigurableSelection;
  /** Persist user column widths (called once per resize gesture, on release). */
  onWidthsChange?: (widths: Record<string, number>) => void;
  rowAriaLabel?: (row: T) => string;
}

const SELECTION_W = 48;
const EXPANDER_W = 44;
const FIT_SLACK = 8;

/**
 * Config-driven table that fits columns to the actual container width instead
 * of horizontally scrolling: identity columns always render, lower-priority
 * columns collapse into a per-row expander. Column widths are user-resizable
 * via pointer-drag on header dividers. Below `sm` it renders stacked cards.
 */
export function ConfigurableDataTable<T>({
  rows,
  columns,
  view,
  rowKey,
  onRowClick,
  selection,
  onWidthsChange,
  rowAriaLabel,
}: ConfigurableDataTableProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1200);
  const [widths, setWidths] = useState<Record<string, number>>(view.widths);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setWidths(view.widths);
  }, [view.widths]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setContainerWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const defsByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const orderedDefs = useMemo(
    () => view.orderedVisible.map((k) => defsByKey.get(k)).filter((d): d is TableColumnDef<T> => !!d),
    [view.orderedVisible, defsByKey],
  );

  const { fitDefs, overflowDefs } = useMemo(() => {
    const input = orderedDefs.map((d) => ({
      key: d.key,
      minWidth: d.minWidth,
      priority: d.priority,
      width: widths[d.key],
    }));
    const baseReserved = (selection ? SELECTION_W : 0) + FIT_SLACK;
    let result = fitColumns(containerWidth, input, baseReserved);
    if (result.overflow.length > 0) {
      // An expander column will render — refit with its width reserved.
      result = fitColumns(containerWidth, input, baseReserved + EXPANDER_W);
    }
    const fitSet = new Set(result.fit);
    return {
      fitDefs: orderedDefs.filter((d) => fitSet.has(d.key)),
      overflowDefs: orderedDefs.filter((d) => !fitSet.has(d.key)),
    };
  }, [orderedDefs, widths, containerWidth, selection]);

  const visibleIds = useMemo(() => rows.map((r) => rowKey(r)), [rows, rowKey]);
  const hasExpander = overflowDefs.length > 0;
  const totalColSpan = fitDefs.length + (selection ? 1 : 0) + (hasExpander ? 1 : 0);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const startResize = useCallback(
    (key: string, startWidth: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizingRef.current = { key, startX: e.clientX, startWidth };
      const def = defsByKey.get(key);
      const onMove = (ev: PointerEvent) => {
        const r = resizingRef.current;
        if (!r) return;
        const next = Math.max(def?.minWidth ?? 60, Math.round(r.startWidth + (ev.clientX - r.startX)));
        setWidths((prev) => ({ ...prev, [r.key]: next }));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        resizingRef.current = null;
        setWidths((prev) => {
          onWidthsChange?.(prev);
          return prev;
        });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [defsByKey, onWidthsChange],
  );

  const handleRowKeyDown = (e: React.KeyboardEvent, row: T) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  const widthFor = (def: TableColumnDef<T>, isLast: boolean) =>
    isLast ? undefined : Math.max(def.minWidth, widths[def.key] ?? def.minWidth);

  return (
    <div ref={containerRef}>
      {/* Desktop / tablet */}
      <div className="hidden sm:block">
        <table className="w-full" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {selection ? (
                <th scope="col" className="px-4 py-4" style={{ width: SELECTION_W }}>
                  <input
                    type="checkbox"
                    checked={selection.allSelected(visibleIds)}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate =
                          !selection.allSelected(visibleIds) && selection.someSelected(visibleIds);
                      }
                    }}
                    onChange={(e) => selection.setMany(visibleIds, e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                    aria-label="Select all on this page"
                  />
                </th>
              ) : null}
              {fitDefs.map((def, idx) => (
                <th
                  key={def.key}
                  scope="col"
                  style={{ width: widthFor(def, idx === fitDefs.length - 1) }}
                  className={cn(
                    'relative px-6 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider',
                    def.align === 'end' ? 'text-end' : 'text-left',
                  )}
                >
                  <span className="block truncate">{def.label}</span>
                  {onWidthsChange && idx < fitDefs.length - 1 ? (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${def.label} column`}
                      onPointerDown={startResize(def.key, Math.max(def.minWidth, widths[def.key] ?? def.minWidth))}
                      className="absolute inset-y-0 -right-1 w-2 cursor-col-resize touch-none select-none hover:bg-primary/20"
                    />
                  ) : null}
                </th>
              ))}
              {hasExpander ? (
                <th scope="col" className="px-2 py-4" style={{ width: EXPANDER_W }}>
                  <span
                    className="inline-flex items-center rounded-full bg-slate-200 px-1.5 py-0.5 text-xxs font-semibold text-slate-600"
                    title={`${overflowDefs.length} more column${overflowDefs.length === 1 ? '' : 's'} (${overflowDefs
                      .map((d) => d.label)
                      .join(', ')}) — expand a row to view`}
                  >
                    +{overflowDefs.length}
                  </span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => {
              const id = rowKey(row);
              const isExpanded = expanded.has(id);
              const isSelected = selection?.isSelected(id) ?? false;
              return (
                <React.Fragment key={id}>
                  <tr
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => handleRowKeyDown(e, row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-label={rowAriaLabel?.(row)}
                    className={cn(
                      'transition-colors hover:bg-slate-50',
                      onRowClick && 'cursor-pointer',
                      isSelected && 'bg-info-muted/30',
                    )}
                  >
                    {selection ? (
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => selection.toggle(id)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                          aria-label={`Select ${rowAriaLabel?.(row) ?? 'row'}`}
                        />
                      </td>
                    ) : null}
                    {fitDefs.map((def) => (
                      <td
                        key={def.key}
                        className={cn(
                          'px-6 py-4 overflow-hidden text-ellipsis whitespace-nowrap',
                          def.align === 'end' ? 'text-end' : undefined,
                        )}
                      >
                        {def.render(row)}
                      </td>
                    ))}
                    {hasExpander ? (
                      <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(id)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Hide additional fields' : 'Show additional fields'}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                  {hasExpander && isExpanded ? (
                    <tr className="bg-slate-50/60">
                      <td colSpan={totalColSpan} className="px-6 py-3">
                        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2 lg:grid-cols-3">
                          {overflowDefs.map((def) => (
                            <div key={def.key} className="flex items-baseline gap-2">
                              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {def.label}
                              </dt>
                              <dd className="text-sm text-slate-800">{def.render(row)}</dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="divide-y divide-slate-200 sm:hidden">
        {rows.map((row) => {
          const id = rowKey(row);
          const isSelected = selection?.isSelected(id) ?? false;
          return (
            <div
              key={id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => handleRowKeyDown(e, row) : undefined}
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn('p-4', onRowClick && 'cursor-pointer hover:bg-slate-50', isSelected && 'bg-info-muted/30')}
            >
              {selection ? (
                <label
                  className="mb-3 flex min-h-[2.75rem] items-center gap-2 text-xs font-medium text-slate-500"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => selection.toggle(id)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    aria-label={`Select ${rowAriaLabel?.(row) ?? 'row'}`}
                  />
                  Select
                </label>
              ) : null}
              <dl className="grid grid-cols-[minmax(0,40%)_1fr] gap-x-3 gap-y-2">
                {orderedDefs.map((def) => (
                  <React.Fragment key={def.key}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{def.label}</dt>
                    <dd className="text-sm text-slate-900 break-words">{def.render(row)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
