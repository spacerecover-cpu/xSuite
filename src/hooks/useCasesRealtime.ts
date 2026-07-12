import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, getTenantId } from '../lib/supabaseClient';
import { logger } from '../lib/logger';

interface UseCasesRealtimeOptions {
  /**
   * When provided, list-level changes call this instead of invalidating the
   * ['cases'] queries — the page shows a "N updates — refresh" pill rather
   * than reordering rows under a reading operator. Per-case detail keys are
   * still invalidated either way.
   */
  onListChange?: () => void;
}

export const useCasesRealtime = (options?: UseCasesRealtimeOptions) => {
  const queryClient = useQueryClient();
  const debounceTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const onListChangeRef = useRef(options?.onListChange);
  onListChangeRef.current = options?.onListChange;

  useEffect(() => {
    // Scope the subscription to the current tenant so Postgres pre-filters before
    // RLS, instead of evaluating this subscriber against every tenant's writes.
    const tenantId = getTenantId();
    if (!tenantId) return;

    const debouncedInvalidate = (queryKey: any[], delay: number = 500) => {
      const key = JSON.stringify(queryKey);

      if (debounceTimers.current[key]) {
        clearTimeout(debounceTimers.current[key]);
      }

      debounceTimers.current[key] = setTimeout(() => {
        // Default refetchType ('active') so a realtime change actually refetches
        // queries currently on screen. 'none' only marked them stale, which the
        // global refetchOnMount/refetchOnWindowFocus settings then never picked
        // up — live updates were silently dropped. The debounce above already
        // protects against event bursts.
        queryClient.invalidateQueries({ queryKey });
        delete debounceTimers.current[key];
      }, delay);
    };

    const casesChannel = supabase
      .channel('cases-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cases',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.new && 'id' in payload.new) {
            debouncedInvalidate(['case', payload.new.id], 300);
          }

          if (payload.old && 'id' in payload.old) {
            debouncedInvalidate(['case', payload.old.id], 300);
          }

          if (onListChangeRef.current) {
            onListChangeRef.current();
          } else {
            debouncedInvalidate(['cases'], 800);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          // '*' (not 'UPDATE') so device INSERTs at intake also live-refresh the
          // open case — a newly-intaked device must invalidate ['case', case_id]
          // and ['case_devices', case_id] the same way an edit does.
          event: '*',
          schema: 'public',
          table: 'case_devices',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.new && 'case_id' in payload.new) {
            debouncedInvalidate(['case', payload.new.case_id], 300);
            debouncedInvalidate(['case_devices', payload.new.case_id], 300);
          }

          if (payload.old && 'case_id' in payload.old) {
            debouncedInvalidate(['case', payload.old.case_id], 300);
            debouncedInvalidate(['case_devices', payload.old.case_id], 300);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          logger.error('Real-time subscription error');
        }
      });

    return () => {
      Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
      debounceTimers.current = {};
      supabase.removeChannel(casesChannel);
    };
  }, [queryClient]);
};
