import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { caseKeys } from '../../../lib/queryKeys';
import { Skeleton } from '../../ui/Skeleton';
import { ActivityTimeline, type ActivityEntry } from '../../shared/ActivityTimeline';

/**
 * Case activity timeline fed by case_job_history — the workflow log
 * (status transitions, checkout, company changes…). Distinct from the
 * forensic Chain of Custody ledger, which tracks physical device handling.
 */
export const CaseActivityTab: React.FC<{ caseId: string }> = ({ caseId }) => {
  const { data: entries = [], isLoading, isError, error } = useQuery({
    queryKey: caseKeys.activity(caseId),
    queryFn: async (): Promise<ActivityEntry[]> => {
      const { data, error: fetchError } = await supabase
        .from('case_job_history')
        .select('id, action, details, old_value, new_value, performed_by, created_at')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      const rows = data ?? [];

      // performed_by references auth.users (no FK to profiles) — batch the
      // name lookup like the rest of the case views.
      const actorIds = [...new Set(rows.map((r) => r.performed_by).filter(Boolean))] as string[];
      const names = new Map<string, string | null>();
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', actorIds);
        for (const p of profiles ?? []) names.set(p.id, p.full_name);
      }
      return rows.map((r) => ({
        ...r,
        actor_name: r.performed_by ? names.get(r.performed_by) ?? 'Unknown user' : 'System',
      }));
    },
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
    return (
      <div className="p-6 text-center text-sm text-danger" role="alert">
        Couldn't load case activity. {(error as Error)?.message}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <Activity className="mx-auto mb-4 h-16 w-16 text-slate-300" />
        <h3 className="mb-2 text-lg font-semibold text-slate-700">No Activity Recorded</h3>
        <p className="text-sm text-slate-500">
          Workflow events (status changes, checkout, reassignments) will appear here.
        </p>
      </div>
    );
  }

  return <ActivityTimeline entries={entries} />;
};
