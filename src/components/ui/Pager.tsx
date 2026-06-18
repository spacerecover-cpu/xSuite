import React from 'react';
import { Button } from './Button';

interface PagerProps {
  /** Zero-based page index. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Used in the empty-state label, e.g. "0 invoices". */
  itemNoun?: string;
}

/**
 * Compact list pager: "X–Y of N" + Previous/Next. Zero-based page index to
 * match the list pages' `page` state. Server-pagination footer used across
 * list tables.
 */
export const Pager: React.FC<PagerProps> = ({ page, pageSize, total, onPageChange, itemNoun = 'items' }) => {
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  const hasPrev = page > 0;
  const hasNext = (page + 1) * pageSize < total;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
      <span>{total === 0 ? `0 ${itemNoun}` : `${from}–${to} of ${total}`}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={!hasPrev} onClick={() => onPageChange(Math.max(page - 1, 0))}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
};
