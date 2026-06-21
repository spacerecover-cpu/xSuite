import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';

interface SidebarBadgeCounts {
  casesTodayCount: number;
  invoicesAttentionCount: number;
  pendingQuotesCount: number;
  lowStockCount: number;
  isLoading: boolean;
}

/**
 * Custom hook to fetch real-time badge counts for the sidebar navigation
 *
 * Returns:
 * - casesTodayCount: Number of cases created today (active statuses only)
 * - invoicesAttentionCount: Number of invoices requiring attention (sent, partially-paid, overdue)
 * - pendingQuotesCount: Number of quotes pending customer response (sent status)
 */
export const useSidebarBadges = (): SidebarBadgeCounts => {
  // Master statuses change rarely; share the cache entry CasesList already uses
  // (same query key + select) instead of re-fetching them inside every badge
  // poll cycle. The count query below re-keys when the active names change.
  const { data: caseStatuses } = useQuery({
    queryKey: ['case_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_statuses')
        .select('id, name, type, color')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const excludedTypes = ['completed', 'delivered', 'cancelled'];
  const activeStatusNames = (caseStatuses ?? [])
    .filter(s => !excludedTypes.includes(s.type?.toLowerCase() || ''))
    .map(s => s.name);

  // Get cases created today with active statuses (not completed, delivered, or cancelled)
  const { data: casesTodayCount = 0 } = useQuery({
    queryKey: ['sidebar_badges_cases_today', activeStatusNames],
    enabled: activeStatusNames.length > 0,
    queryFn: async () => {
      try {
        // Get start of today in user's timezone
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        // Count cases created today with active statuses
        const { count, error } = await supabase
          .from('cases')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', todayISO)
          .in('status', activeStatusNames);

        if (error) throw error;
        return count || 0;
      } catch (error) {
        logger.error('Error fetching cases today count:', error);
        return 0;
      }
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 120000, // 2 minutes
    refetchOnWindowFocus: true,
  });

  // Get invoices requiring attention (sent, partially-paid, overdue)
  const { data: invoicesAttentionCount = 0 } = useQuery({
    queryKey: ['sidebar_badges_invoices_attention'],
    queryFn: async () => {
      try {
        const { count, error } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .in('status', ['sent', 'partially-paid', 'overdue']);

        if (error) throw error;
        return count || 0;
      } catch (error) {
        logger.error('Error fetching invoices attention count:', error);
        return 0;
      }
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 120000, // 2 minutes
    refetchOnWindowFocus: true,
  });

  // Get pending quotes (sent status only)
  const { data: pendingQuotesCount = 0 } = useQuery({
    queryKey: ['sidebar_badges_pending_quotes'],
    queryFn: async () => {
      try {
        const { count, error } = await supabase
          .from('quotes')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'sent');

        if (error) throw error;
        return count || 0;
      } catch (error) {
        logger.error('Error fetching pending quotes count:', error);
        return 0;
      }
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 120000, // 2 minutes
    refetchOnWindowFocus: true,
  });

  const { data: lowStockCount = 0 } = useQuery({
    queryKey: ['sidebar_badges_low_stock'],
    queryFn: async () => {
      try {
        // DB-side count (get_low_stock_count, SECURITY INVOKER so RLS applies):
        // PostgREST can't filter on current_quantity <= minimum_quantity, and
        // fetching every stock row to count client-side grew with stock volume.
        const { data, error } = await supabase.rpc('get_low_stock_count');
        if (error) throw error;
        return data ?? 0;
      } catch {
        return 0;
      }
    },
    staleTime: 60000,
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  return {
    casesTodayCount,
    invoicesAttentionCount,
    pendingQuotesCount,
    lowStockCount,
    isLoading: false,
  };
};
