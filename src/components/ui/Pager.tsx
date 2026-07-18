import React, { useState } from 'react';
import { Button } from './Button';
import { pageWindow } from '../../lib/pagination';

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
 * List pager: "X–Y of N" summary, numbered page buttons (windowed with … gaps,
 * first & last always reachable), Previous/Next, and a "Go to page" jump when
 * pages are elided. Zero-based `page` to match the list pages' state. Server-
 * pagination footer used across list tables.
 */
export const Pager: React.FC<PagerProps> = ({ page, pageSize, total, onPageChange, itemNoun = 'items' }) => {
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = page + 1; // 1-based for display
  const hasPrev = current > 1;
  const hasNext = current < totalPages;

  // Clamp to a valid 1-based page, then hand back the zero-based index.
  const goTo = (target: number) => {
    const clamped = Math.min(Math.max(target, 1), totalPages);
    if (clamped !== current) onPageChange(clamped - 1);
  };

  const [jump, setJump] = useState('');
  const submitJump = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(jump);
    if (Number.isFinite(n) && n >= 1) goTo(Math.trunc(n));
    setJump('');
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 text-sm text-slate-600"
    >
      <span className="tabular-nums">
        {total === 0 ? `0 ${itemNoun}` : `${from}–${to} of ${total}`}
      </span>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {totalPages > 7 && (
            <form onSubmit={submitJump} className="flex items-center gap-1.5 mr-1">
              <label htmlFor="pager-jump" className="text-slate-500">
                Go to
              </label>
              <input
                id="pager-jump"
                type="number"
                min={1}
                max={totalPages}
                inputMode="numeric"
                value={jump}
                onChange={(e) => setJump(e.target.value)}
                placeholder={String(current)}
                className="h-9 w-16 rounded-md border border-slate-300 px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <Button type="submit" variant="secondary" size="sm" disabled={jump.trim() === ''}>
                Go
              </Button>
            </form>
          )}

          <Button variant="secondary" size="sm" disabled={!hasPrev} onClick={() => goTo(current - 1)}>
            Previous
          </Button>

          <ul className="flex items-center gap-1">
            {pageWindow(current, totalPages).map((token, i) =>
              token === 'gap' ? (
                <li
                  key={`gap-${i}`}
                  aria-hidden="true"
                  className="inline-flex h-9 min-w-[2.25rem] items-center justify-center text-slate-400 select-none"
                >
                  …
                </li>
              ) : (
                <li key={token}>
                  <button
                    type="button"
                    onClick={() => goTo(token)}
                    aria-label={`Go to page ${token}`}
                    aria-current={token === current ? 'page' : undefined}
                    className={`inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-md px-2 text-sm font-medium tabular-nums transition-colors ${
                      token === current
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-primary'
                    }`}
                  >
                    {token}
                  </button>
                </li>
              ),
            )}
          </ul>

          <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => goTo(current + 1)}>
            Next
          </Button>
        </div>
      )}
    </nav>
  );
};
