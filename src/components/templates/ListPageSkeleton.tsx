// src/components/templates/ListPageSkeleton.tsx
import React from 'react';
import { Skeleton } from '../ui/Skeleton';

/**
 * Results-only loading frame: 8 table rows, no KPI or toolbar strip.
 *
 * This is what a list page shows while fetching. The KPI row and toolbar stay
 * MOUNTED above it — replacing them would unmount the search input, destroying
 * focus and cursor position on every keystroke-triggered refetch.
 */
export const ListPageBodySkeleton: React.FC = () => (
  <div
    aria-busy="true"
    aria-label="Loading"
    className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100"
  >
    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 m-0 rounded-none" />)}
  </div>
);

/**
 * Full-page loading frame: KPI row + toolbar strip + 8 table rows.
 *
 * Retained for callers that render a whole-page placeholder themselves. Prefer
 * ListPageBodySkeleton inside ListPageTemplate — see the note above.
 */
export const ListPageSkeleton: React.FC = () => (
  <div aria-busy="true" aria-label="Loading" className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
    </div>
    <Skeleton className="h-12 rounded-lg" />
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 m-0 rounded-none" />)}
    </div>
  </div>
);
