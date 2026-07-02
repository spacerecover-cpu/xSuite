import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Check, Mail, Bell } from 'lucide-react';
import { listDueFollowUps, completeFollowUp } from '../../lib/followUpService';
import { followUpKeys } from '../../lib/queryKeys';
import { useTenantFeature } from '../../contexts/TenantConfigContext';
import { formatDateTime } from '../../lib/format';

export const DueFollowUpsWidget: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const enabled = useTenantFeature('automation.case_follow_ups');

  const { data: followUps = [], isLoading } = useQuery({
    queryKey: followUpKeys.due(),
    queryFn: () => listDueFollowUps(24),
    staleTime: 60000,
    enabled,
  });

  const completeMutation = useMutation({
    mutationFn: completeFollowUp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: followUpKeys.all }),
  });

  if (!enabled) return null;

  const overdue = followUps.filter(
    (f) => new Date(f.follow_up_date).getTime() < Date.now()
  ).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-info-muted flex items-center justify-center">
            <CalendarClock className="w-4 h-4 text-info" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Follow-ups Due
            </p>
            <p className="text-xl font-bold text-slate-900 leading-tight">
              {isLoading ? '—' : followUps.length}
            </p>
          </div>
        </div>
        {overdue > 0 && (
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-danger-muted text-danger">
            {overdue} overdue
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : followUps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-slate-400">
          <Check className="w-6 h-6 mb-1" />
          <p className="text-xs">Nothing due in the next 24 hours</p>
        </div>
      ) : (
        <div className="space-y-2">
          {followUps.slice(0, 5).map((followUp) => {
            const isOverdue = new Date(followUp.follow_up_date).getTime() < Date.now();
            return (
              <div
                key={followUp.id}
                className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0 gap-2"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/cases/${followUp.case_id}`)}
                  className="flex-1 min-w-0 text-left group"
                >
                  <p className="text-sm font-medium text-slate-800 truncate group-hover:text-primary transition-colors">
                    {followUp.cases?.case_number ?? 'Case'}
                    <span className="text-slate-400 font-normal">
                      {' '}
                      · {followUp.type?.replace(/_/g, ' ')}
                    </span>
                  </p>
                  <p
                    className={`text-xs truncate ${isOverdue ? 'text-danger' : 'text-slate-400'}`}
                  >
                    {formatDateTime(followUp.follow_up_date)}
                  </p>
                </button>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span title={followUp.channel === 'email' ? 'Auto-send email' : 'Team reminder'}>
                    {followUp.channel === 'email' ? (
                      <Mail className="w-3.5 h-3.5 text-slate-300" />
                    ) : (
                      <Bell className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => completeMutation.mutate(followUp.id)}
                    disabled={completeMutation.isPending}
                    className="p-1 text-slate-400 hover:text-success hover:bg-success-muted rounded transition-colors disabled:opacity-50"
                    title="Mark done"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
