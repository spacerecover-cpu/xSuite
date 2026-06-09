import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, FileText, Users, CreditCard, Settings, AlertCircle } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Skeleton } from '../../ui/Skeleton';
import { getTenantActivityLog } from '@/lib/platformAdminService';
import { platformAdminKeys } from '@/lib/queryKeys';
import { formatDistanceToNow } from 'date-fns';

interface TenantActivityTabProps {
  tenantId: string;
}

const activityTypeIcons: Record<string, React.ElementType> = {
  case_created: FileText,
  user_added: Users,
  payment_received: CreditCard,
  settings_changed: Settings,
  internal_note: AlertCircle,
  subscription_changed: CreditCard,
  default: Activity,
};

const activityTypeLabels: Record<string, string> = {
  case_created: 'Case Created',
  user_added: 'User Added',
  payment_received: 'Payment Received',
  settings_changed: 'Settings Changed',
  internal_note: 'Internal Note',
  subscription_changed: 'Subscription Changed',
};

export const TenantActivityTab: React.FC<TenantActivityTabProps> = ({ tenantId }) => {
  const [filter, setFilter] = useState<string>('all');

  const { data: activities = [], isLoading } = useQuery({
    queryKey: platformAdminKeys.tenantActivity(tenantId),
    queryFn: () => getTenantActivityLog(tenantId, 100),
  });

  const filteredActivities = filter === 'all'
    ? activities
    : activities.filter(a => a.activity_type === filter);

  const activityTypes = ['all', ...new Set(activities.map(a => a.activity_type))];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-slate-700">Filter by type:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {activityTypes.map(type => (
            <option key={type} value={type}>
              {type === 'all' ? 'All Activities' : (activityTypeLabels[type] || type)}
            </option>
          ))}
        </select>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          {filteredActivities.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No activity found</p>
          ) : (
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-6">
                {filteredActivities.map((activity) => {
                  const Icon = activityTypeIcons[activity.activity_type] || activityTypeIcons.default;
                  const activityData = activity.activity_details as Record<string, unknown> | null;

                  return (
                    <div key={activity.id} className="relative flex gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-info-muted flex items-center justify-center z-10">
                        <Icon className="w-5 h-5 text-info" />
                      </div>
                      <div className="flex-1 pt-1">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {activityTypeLabels[activity.activity_type] || activity.activity_type}
                            </p>
                            {typeof activityData?.description === 'string' && (
                              <p className="text-sm text-slate-600 mt-1">{activityData.description}</p>
                            )}
                            {typeof activityData?.note === 'string' && (
                              <p className="text-sm text-slate-600 mt-1 italic">"{activityData.note}"</p>
                            )}
                            {typeof activityData?.admin_name === 'string' && (
                              <p className="text-xs text-slate-500 mt-1">by {activityData.admin_name}</p>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 whitespace-nowrap">
                            {formatDistanceToNow(new Date(activity.created_at))} ago
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
