import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

export interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  className?: string;
  caption?: string;
  'aria-label'?: string;
  emptyMessage?: React.ReactNode;
  loading?: boolean;
  skeletonRows?: number;
  rowKey?: (row: T, idx: number) => React.Key;
}

export function Table<T extends Record<string, any>>({
  data,
  columns,
  onRowClick,
  className,
  caption,
  'aria-label': ariaLabel,
  emptyMessage,
  loading = false,
  skeletonRows = 5,
  rowKey,
}: TableProps<T>) {
  const { t } = useTranslation();

  const getRowClassName = (idx: number) =>
    cn(
      'transition-all duration-150',
      onRowClick
        ? 'cursor-pointer hover:bg-slate-50 hover:shadow-sm'
        : 'hover:bg-slate-50/50',
      idx % 2 === 0 ? 'bg-surface' : 'bg-slate-50/30',
    );

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-slate-200', className)}>
      <table className="min-w-full divide-y divide-slate-200" aria-label={ariaLabel}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{ width: column.width }}
                className="px-6 py-3.5 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-surface divide-y divide-slate-100">
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, idx) => (
              <tr key={`skeleton-${idx}`}>
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-4 whitespace-nowrap">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-500">
                {emptyMessage ?? t('ui.noData')}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={rowKey?.(row, idx) ?? idx}
                onClick={() => onRowClick?.(row)}
                onKeyDown={onRowClick ? (e) => handleRowKeyDown(e, row) : undefined}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={getRowClassName(idx)}
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
