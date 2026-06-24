import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { getPeriodWindows, computeTrend, type CasePeriod, type Trend } from '../lib/casePeriods';

export const CASE_COMMAND_STATS_KEY = 'case_command_stats';

export interface CaseStatusLite {
  id: string;
  name: string;
  type: string | null;
}

export interface CaseCommandStats {
  /** Total non-deleted cases (the "of N total" denominator). */
  total: number;
  // Snapshot (point-in-time "now") metrics.
  active: number;
  urgent: number;
  diagnosis: number;
  ready: number;
  // Flow (period-scoped) metrics + period-over-period trend.
  newCount: number;
  newTrend: Trend;
  deliveredCount: number;
  deliveredTrend: Trend;
}

/**
 * Command-center KPIs for the Cases list. All ten figures are head-only COUNT
 * queries (no rows pulled, no new RPC), fired in parallel:
 *
 * - Snapshot counts (active/urgent/diagnosis/ready/total) reuse the page's
 *   existing `master_case_statuses.type` logic, so the numbers are identical to
 *   the old stat cards — "active" = (has-status) − (terminal).
 * - Flow counts compare the current period window against the previous equal
 *   window: `new` on `created_at`, `delivered` on `checkout_date` (the handover
 *   timestamp written by log_case_checkout).
 *
 * Trends are computed client-side from the two windows.
 */
export function useCaseCommandStats(period: CasePeriod, caseStatuses: CaseStatusLite[]) {
  return useQuery<CaseCommandStats>({
    queryKey: [CASE_COMMAND_STATS_KEY, period, caseStatuses.map((s) => s.id).join(',')],
    enabled: caseStatuses.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { curStart, prevStart, prevEnd } = getPeriodWindows(period, new Date());

      const namesOfTypes = (types: string[]) =>
        caseStatuses.filter((s) => s.type !== null && types.includes(s.type)).map((s) => s.name);
      const terminal = namesOfTypes(['completed', 'delivered', 'cancelled']);
      const diagnosis = namesOfTypes(['diagnosis']);
      const ready = namesOfTypes(['ready']);

      const base = () =>
        supabase.from('cases').select('id', { count: 'exact', head: true }).is('deleted_at', null);
      const none = Promise.resolve({ count: 0 as number | null, error: null });

      const [
        total,
        withStatus,
        inTerminal,
        urgent,
        inDiagnosis,
        inReady,
        newCur,
        newPrev,
        delCur,
        delPrev,
      ] = await Promise.all([
        base(),
        base().not('status', 'is', null),
        terminal.length ? base().in('status', terminal) : none,
        base().eq('priority', 'urgent'),
        diagnosis.length ? base().in('status', diagnosis) : none,
        ready.length ? base().in('status', ready) : none,
        base().gte('created_at', curStart),
        base().gte('created_at', prevStart).lt('created_at', prevEnd),
        base().gte('checkout_date', curStart),
        base().gte('checkout_date', prevStart).lt('checkout_date', prevEnd),
      ]);

      for (const r of [
        total, withStatus, inTerminal, urgent, inDiagnosis, inReady, newCur, newPrev, delCur, delPrev,
      ]) {
        if (r.error) throw r.error;
      }

      const newCount = newCur.count ?? 0;
      const deliveredCount = delCur.count ?? 0;

      return {
        total: total.count ?? 0,
        active: Math.max(0, (withStatus.count ?? 0) - (inTerminal.count ?? 0)),
        urgent: urgent.count ?? 0,
        diagnosis: inDiagnosis.count ?? 0,
        ready: inReady.count ?? 0,
        newCount,
        newTrend: computeTrend(newCount, newPrev.count ?? 0),
        deliveredCount,
        deliveredTrend: computeTrend(deliveredCount, delPrev.count ?? 0),
      };
    },
  });
}
