import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { caseKeys } from '../../../lib/queryKeys';
import { formatActionType } from '../../../lib/chainOfCustodyService';
import { formatDateTimeWithConfig } from '../../../lib/format';
import { useDateTimeConfig } from '../../../contexts/TenantConfigContext';
import { Skeleton } from '../../ui/Skeleton';

interface ActivityEntry {
  id: string;
  action: string;
  details: string | null;
  old_value: string | null;
  new_value: string | null;
  performed_by: string | null;
  created_at: string;
  actor_name: string;
}

/** Render the free-form details column: JSON blobs become a compact key/value
 *  list, plain text renders as-is. */
function DetailsBlock({ details }: { details: string | null }) {
  if (!details) return null;
  let parsed: Record<string, unknown> | null = null;
  try {
    const candidate = JSON.parse(details);
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      parsed = candidate as Record<string, unknown>;
    }
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return <p className="text-sm text-slate-600 break-words">{details}</p>;
  }
  const entries = Object.entries(parsed).filter(
    ([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object',
  );
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-[minmax(0,40%)_1fr] gap-x-3 gap-y-0.5">
      {entries.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="text-xs uppercase tracking-wide text-slate-400">{key.replace(/_/g, ' ')}</dt>
          <dd className="text-xs text-slate-600 break-words">{String(value)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/**
 * Case activity timeline fed by case_job_history — the workflow log
 * (status transitions, checkout, company changes…). Distinct from the
 * forensic Chain of Custody ledger, which tracks physical device handling.
 */
export const CaseActivityTab: React.FC<{ caseId: string }> = ({ caseId }) => {
  const dateTimeConfig = useDateTimeConfig();
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

  return (
    <div className="p-4 md:p-6">
      <ol className="relative space-y-4 border-s border-slate-200 ps-6">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <span
              className="absolute -start-[1.85rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary"
              aria-hidden="true"
            />
            <div className="rounded-lg border border-slate-200 bg-surface p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold text-slate-900">{formatActionType(entry.action)}</p>
                <p className="text-xs text-slate-500" title={`UTC: ${entry.created_at}`}>
                  {formatDateTimeWithConfig(entry.created_at, dateTimeConfig)} · {entry.actor_name}
                </p>
              </div>
              {entry.old_value || entry.new_value ? (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                  {entry.old_value && <span className="rounded bg-slate-100 px-1.5 py-0.5">{entry.old_value}</span>}
                  {entry.old_value && entry.new_value && (
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  )}
                  {entry.new_value && (
                    <span className="rounded bg-accent px-1.5 py-0.5 text-accent-foreground">{entry.new_value}</span>
                  )}
                </p>
              ) : null}
              <div className="mt-1.5">
                <DetailsBlock details={entry.details} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
