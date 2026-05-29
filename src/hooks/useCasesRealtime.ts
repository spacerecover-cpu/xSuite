import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, getTenantId } from '../lib/supabaseClient';
import { logger } from '../lib/logger';

export const useCasesRealtime = () => {
  const queryClient = useQueryClient();
  const debounceTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

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
        queryClient.invalidateQueries({
          queryKey,
          refetchType: 'none'
        });
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

          debouncedInvalidate(['cases'], 800);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'case_devices',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.new && 'case_id' in payload.new) {
            debouncedInvalidate(['case', payload.new.case_id], 300);
            debouncedInvalidate(['case_devices', payload.new.case_id], 300);
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
