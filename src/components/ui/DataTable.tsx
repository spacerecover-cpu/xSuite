import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Skeleton } from './Skeleton';

export type SortDirection = 'asc' | 'desc';

export interface DataTableColumn<T> {
  /** Stable identifier; also the default property read from a row when no `render` is given. */
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
  align?: 'start' | 'center' | 'end';
  sortable?: boolean;
  /** Hide this column below the named breakpoint (it still appears in the mobile card layout). */
  hideBelow?: 'sm' | 'md' | 'lg';
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableSelection<T> {
  selectedIds: Set<React.Key>;
  onToggle: (id: React.Key, row: T) => void;
  onToggleAll: (checked: boolean) => void;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  loading?: boolean;
  skeletonRows?: number;
  /** Empty-state message (string or node). Defaults to the translated `ui.noData`. */
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowKey?: (row: T, idx: number) => React.Key;
  className?: string;
  caption?: string;
  'aria-label'?: string;

  // --- Sorting (controlled if all three provided, otherwise uncontrolled) ---
  sortKey?: string | null;
  sortDir?: SortDirection;
  onSort?: (key: string, dir: SortDirection) => void;

  // --- Optional pagination footer ---
  pagination?: DataTablePagination;

  // --- Optional row selection ---
  selection?: DataTableSelection<T>;

  /** Below the smallest breakpoint, render each row as a stacked card instead of a scrolling table. */
  mobileCard?: (row: T) => React.ReactNode;
}

const alignToText: Record<NonNullable<DataTableColumn<unknown>['align']>, string> = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
};

const hideBelowClass: Record<NonNullable<DataTableColumn<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

function cellValue<T>(column: DataTableColumn<T>, row: T): React.ReactNode {
  if (column.render) return column.render(row);
  return (row as Record<string, React.ReactNode>)[column.key];
}

export function DataTable<T extends object>({
  data,
  columns,
  loading = false,
  skeletonRows = 5,
  empty,
  onRowClick,
  rowKey,
  className,
  caption,
  'aria-label': ariaLabel,
  sortKey,
  sortDir,
  onSort,
  pagination,
  selection,
  mobileCard,
}: DataTableProps<T>) {
  const { t } = useTranslation();

  // Uncontrolled sort fallback: used only when the consumer does not drive sortKey/onSort.
  const isControlledSort = sortKey !== undefined && onSort !== undefined;
  const [internalSort, setInternalSort] = useState<{ key: string; dir: SortDirection } | null>(null);
  const activeSortKey = isControlledSort ? sortKey : internalSort?.key ?? null;
  const activeSortDir: SortDirection = isControlledSort
    ? sortDir ?? 'asc'
    : internalSort?.dir ?? 'asc';

  const getRowKey = (row: T, idx: number): React.Key => rowKey?.(row, idx) ?? idx;

  const handleSort = (column: DataTableColumn<T>) => {
    if (!column.sortable) return;
    const nextDir: SortDirection =
      activeSortKey === column.key && activeSortDir === 'asc' ? 'desc' : 'asc';
    if (isControlledSort) {
      onSort!(column.key, nextDir);
    } else {
      setInternalSort({ key: column.key, dir: nextDir });
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLElement>, row: T) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  const getRowClassName = (idx: number) =>
    cn(
      'transition-all duration-150',
      onRowClick
        ? 'cursor-pointer hover:bg-slate-50 hover:shadow-sm'
        : 'hover:bg-slate-50/50',
      idx % 2 === 0 ? 'bg-surface' : 'bg-slate-50/30',
    );

  const ariaSortFor = (column: DataTableColumn<T>): React.AriaAttributes['aria-sort'] => {
    if (!column.sortable) return undefined;
    if (activeSortKey !== column.key) return 'none';
    return activeSortDir === 'asc' ? 'ascending' : 'descending';
  };

  // Header select-all reflects "are all current-page rows selected".
  const allSelected =
    !!selection &&
    data.length > 0 &&
    data.every((row, idx) => selection.selectedIds.has(getRowKey(row, idx)));
  const someSelected =
    !!selection &&
    !allSelected &&
    data.some((row, idx) => selection.selectedIds.has(getRowKey(row, idx)));

  const totalColSpan = columns.length + (selection ? 1 : 0);
  const showEmpty = !loading && data.length === 0;

  const defaultMobileCard = (row: T) => (
    <dl className="grid grid-cols-[minmax(0,40%)_1fr] gap-x-3 gap-y-2">
      {columns.map((column) => (
        <React.Fragment key={column.key}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {column.header}
          </dt>
          <dd className="text-sm text-slate-900 break-words">{cellValue(column, row)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );

  const renderMobileCard = mobileCard ?? defaultMobileCard;

  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / Math.max(1, pagination.pageSize)))
    : 1;

  return (
    <div className={cn('rounded-lg border border-slate-200', className)}>
      {/* Desktop / tablet: real table (hidden on the smallest breakpoint) */}
      <div className="hidden overflow-x-auto rounded-t-lg sm:block">
        <table className="min-w-full divide-y divide-slate-200" aria-label={ariaLabel}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
            <tr>
              {selection ? (
                <th scope="col" className="w-12 px-4 py-3.5 text-start">
                  <input
                    type="checkbox"
                    aria-label={t('ui.selectAll', { defaultValue: 'Select all rows' })}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-2 focus:ring-ring"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={(e) => selection.onToggleAll(e.target.checked)}
                  />
                </th>
              ) : null}
              {columns.map((column) => {
                const sorted = activeSortKey === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    style={{ width: column.width }}
                    aria-sort={ariaSortFor(column)}
                    className={cn(
                      'px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-700',
                      alignToText[column.align ?? 'start'],
                      column.hideBelow ? hideBelowClass[column.hideBelow] : undefined,
                      column.sortable && 'cursor-pointer select-none hover:bg-slate-200',
                    )}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(column)}
                        className={cn(
                          'inline-flex items-center gap-1.5 uppercase tracking-wider',
                          column.align === 'end' && 'flex-row-reverse',
                          column.align === 'center' && 'justify-center',
                        )}
                      >
                        <span>{column.header}</span>
                        {sorted ? (
                          activeSortDir === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-surface">
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, idx) => (
                <tr key={`skeleton-${idx}`}>
                  {selection ? (
                    <td className="px-4 py-4">
                      <Skeleton className="h-4 w-4" />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'whitespace-nowrap px-6 py-4',
                        column.hideBelow ? hideBelowClass[column.hideBelow] : undefined,
                      )}
                    >
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : showEmpty ? (
              <tr>
                <td
                  colSpan={totalColSpan}
                  className="px-6 py-12 text-center text-slate-500"
                >
                  {empty ?? t('ui.noData')}
                </td>
              </tr>
            ) : (
              data.map((row, idx) => {
                const key = getRowKey(row, idx);
                const isSelected = selection?.selectedIds.has(key) ?? false;
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => handleRowKeyDown(e, row) : undefined}
                    role={onRowClick ? 'button' : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-selected={selection ? isSelected : undefined}
                    className={cn(getRowClassName(idx), isSelected && 'bg-primary/5')}
                  >
                    {selection ? (
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={t('ui.selectRow', {
                            defaultValue: 'Select row {{n}}',
                            n: idx + 1,
                          })}
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-2 focus:ring-ring"
                          checked={isSelected}
                          onChange={() => selection.onToggle(key, row)}
                        />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          'whitespace-nowrap px-6 py-4 text-sm text-slate-900',
                          alignToText[column.align ?? 'start'],
                          column.hideBelow ? hideBelowClass[column.hideBelow] : undefined,
                        )}
                      >
                        {cellValue(column, row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked card layout (only below the `sm` breakpoint) */}
      <div className="divide-y divide-slate-100 sm:hidden">
        {loading ? (
          Array.from({ length: skeletonRows }).map((_, idx) => (
            <div key={`m-skeleton-${idx}`} className="space-y-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))
        ) : showEmpty ? (
          <div className="px-4 py-12 text-center text-slate-500">{empty ?? t('ui.noData')}</div>
        ) : (
          data.map((row, idx) => {
            const key = getRowKey(row, idx);
            const isSelected = selection?.selectedIds.has(key) ?? false;
            return (
              <div
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => handleRowKeyDown(e, row) : undefined}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                aria-selected={selection ? isSelected : undefined}
                className={cn(
                  'p-4 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-slate-50',
                  isSelected && 'bg-primary/5',
                )}
              >
                {selection ? (
                  <label
                    className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={t('ui.selectRow', {
                        defaultValue: 'Select row {{n}}',
                        n: idx + 1,
                      })}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-2 focus:ring-ring"
                      checked={isSelected}
                      onChange={() => selection.onToggle(key, row)}
                    />
                    {t('ui.select', { defaultValue: 'Select' })}
                  </label>
                ) : null}
                {renderMobileCard(row)}
              </div>
            );
          })
        )}
      </div>

      {/* Optional pagination footer */}
      {pagination ? (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row">
          <p className="text-sm text-slate-600">
            {t('ui.pagination.range', {
              defaultValue: 'Showing {{from}}–{{to}} of {{total}}',
              from: pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1,
              to: Math.min(pagination.page * pagination.pageSize, pagination.total),
              total: pagination.total,
            })}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              aria-label={t('ui.pagination.previous', { defaultValue: 'Previous page' })}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="px-2 text-sm text-slate-600">
              {t('ui.pagination.page', {
                defaultValue: 'Page {{page}} of {{pages}}',
                page: pagination.page,
                pages: totalPages,
              })}
            </span>
            <button
              type="button"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              aria-label={t('ui.pagination.next', { defaultValue: 'Next page' })}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
