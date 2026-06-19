import React from 'react';
import { Skeleton } from '../ui/Skeleton';

/** Standard detail loading frame: header strip + 2-col card placeholders. */
export const DetailPageSkeleton: React.FC = () => (
  <div className="px-6 py-5 max-w-[1800px] mx-auto" aria-busy="true" aria-label="Loading">
    <Skeleton className="h-8 w-64 mb-4" />
    <div className="flex flex-col xl:grid xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2"><Skeleton className="h-96 rounded-xl" /></div>
      <div className="xl:col-span-1 space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  </div>
);
