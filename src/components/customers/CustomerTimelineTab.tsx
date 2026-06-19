import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { fetchCustomerTimeline } from '../../lib/chainOfCustodyService';
import { customerKeys } from '../../lib/queryKeys';
import { ActivityTimeline } from '../shared/ActivityTimeline';
import { Skeleton } from '../ui/Skeleton';

export const CustomerTimelineTab: React.FC<{ customerId: string }> = ({ customerId }) => {
  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: customerKeys.timeline(customerId),
    queryFn: () => fetchCustomerTimeline(customerId),
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <div className="p-6 text-center text-sm text-danger" role="alert">Couldn't load timeline.</div>;
  }
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <Activity className="mx-auto mb-4 h-16 w-16 text-slate-300" />
        <p className="text-sm text-slate-500">No activity recorded for this customer yet.</p>
      </div>
    );
  }
  return <ActivityTimeline entries={entries} />;
};
