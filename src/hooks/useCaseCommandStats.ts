import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { getPeriodWindows, computeTrend, type CasePeriod, type Trend } from '../lib/casePeriods';
import {
  bucketizeStatusCounts,
  resolveStatusTypes,
  type CaseBucket,
  type CaseStatusCount,
  type CaseStatusType,
} from '../lib/caseLifecycle';
import { getTenantCaseStatusTypes } from '../lib/caseLifecycleService';

export const CASE_COMMAND_STATS_KEY = 'case_command_stats';

export interface CaseStatusLite {
  id: string;
  name: string;
  type: string | null;
}

export interface CaseCommandStats {
  /** Total non-deleted cases (the "of N total" denominator). */
  total: number;
  /** Everything not delivered/completed/cancelled (unclassified counts as active). */
  active: number;
  urgent: number;
  /** Disjoint snapshot pipeline buckets (see caseLifecycle.ts). */
  buckets: Record<CaseBucket, number>;
  cancelled: number;
  unmapped: number;
  /** Raw per-status counts — powers the data-driven status chips. */
  statusCounts: CaseStatusCount[];
  /** Status name → lifecycle type (master rows + tenant overrides). */
  statusTypeMap: Map<string, CaseStatusType>;
  // Flow (period-scoped) metrics + period-over-period trend.
  receivedCount: number;
  receivedTrend: Trend;
  deliveredCount: number;
  deliveredTrend: Trend;
  medianTatDays: number | null;
}

/**
 * Command-center data for the Cases list.
 *
 * Snapshot truth comes from one get_case_status_counts() RPC (per-status
 * counts under RLS) classified via master_case_statuses.type layered with the
 * tenant's company_settings.metadata.case_status_types overrides — so imported
 * legacy vocabularies bucket correctly. Flow metrics (received / delivered /
 * median TAT) come from get_case_flow_stats() for the current and previous
 * period windows; trends are computed client-side.
 */
export function useCaseCommandStats(period: CasePeriod, caseStatuses: CaseStatusLite[]) {
  return useQuery<CaseCommandStats>({
    queryKey: [CASE_COMMAND_STATS_KEY, period, caseStatuses.map((s) => s.id).join(',')],
    enabled: caseStatuses.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date();
      const { curStart, prevStart, prevEnd } = getPeriodWindows(period, now);

      const [countsRes, urgentRes, flowCurRes, flowPrevRes, overrides] = await Promise.all([
        supabase.rpc('get_case_status_counts'),
        supabase
          .from('cases')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('priority', 'urgent'),
        supabase.rpc('get_case_flow_stats', { p_from: curStart, p_to: now.toISOString() }),
        supabase.rpc('get_case_flow_stats', { p_from: prevStart, p_to: prevEnd }),
        getTenantCaseStatusTypes(),
      ]);

      for (const r of [countsRes, urgentRes, flowCurRes, flowPrevRes]) {
        if (r.error) throw r.error;
      }

      const statusCounts: CaseStatusCount[] = (countsRes.data ?? []).map((r) => ({
        status: r.status,
        total: Number(r.total),
      }));
      const statusTypeMap = resolveStatusTypes(caseStatuses, overrides);
      const { buckets, cancelled, unmapped, total, active } = bucketizeStatusCounts(
        statusCounts,
        statusTypeMap,
      );

      const flowCur = flowCurRes.data?.[0];
      const flowPrev = flowPrevRes.data?.[0];
      const receivedCount = Number(flowCur?.received ?? 0);
      const deliveredCount = Number(flowCur?.delivered ?? 0);

      return {
        total,
        active,
        urgent: urgentRes.count ?? 0,
        buckets,
        cancelled,
        unmapped,
        statusCounts,
        statusTypeMap,
        receivedCount,
        receivedTrend: computeTrend(receivedCount, Number(flowPrev?.received ?? 0)),
        deliveredCount,
        deliveredTrend: computeTrend(deliveredCount, Number(flowPrev?.delivered ?? 0)),
        medianTatDays: flowCur?.median_tat_days != null ? Number(flowCur.median_tat_days) : null,
      };
    },
  });
}
