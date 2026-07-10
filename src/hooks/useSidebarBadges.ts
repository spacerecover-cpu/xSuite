import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';

interface SidebarBadgeCounts {
  casesTodayCount: number;
  invoicesAttentionCount: number;
  pendingQuotesCount: number;
  lowStockCount: number;
  isLoading: boolean;
}

/**
 * Real-time badge counts for the sidebar navigation.
 *
 * One `get_sidebar_badge_counts` RPC (SECURITY INVOKER → tenant-scoped RLS) returns
 * all four counts in a single round-trip, replacing four separate polled queries
 * (audit: SIDEBAR-BADGE-POLL-STORM / root-cause #5). The RPC also filters
 * `deleted_at IS NULL`, fixing the IDX-06 over-count.
 *
 * - casesTodayCount: cases created today (active statuses only — not delivered/closed/cancelled)
 * - invoicesAttentionCount: invoices requiring attention
 * - pendingQuotesCount: quotes pending customer response (sent status)
 * - lowStockCount: stock items at/below their minimum
 */
export const useSidebarBadges = (): SidebarBadgeCounts => {
  const { data, isLoading } = useQuery({
    queryKey: ['sidebar_badge_counts'],
    queryFn: async () => {
      // Start of today in the browser's timezone (parity with the previous hook).
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .rpc('get_sidebar_badge_counts', { p_cases_since: startOfToday.toISOString() })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60000,
    refetchInterval: 120000, // 2 minutes
    refetchOnWindowFocus: true,
  });

  return {
    casesTodayCount: Number(data?.cases_today ?? 0),
    invoicesAttentionCount: Number(data?.invoices_attention ?? 0),
    pendingQuotesCount: Number(data?.pending_quotes ?? 0),
    lowStockCount: Number(data?.low_stock ?? 0),
    isLoading,
  };
};
