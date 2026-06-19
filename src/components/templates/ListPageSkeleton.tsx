// src/components/templates/ListPageSkeleton.tsx
import React from 'react';
import { Skeleton } from '../ui/Skeleton';

/** Standard list loading frame: KPI row + toolbar strip + 8 table rows. */
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
