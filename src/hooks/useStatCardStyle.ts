// src/hooks/useStatCardStyle.ts
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsKeys } from '../lib/queryKeys';
import {
  DEFAULT_STAT_CARD_STYLE,
  getTenantStatCardStyle,
  readStatCardStyleHint,
  writeStatCardStyleHint,
  type StatCardStyle,
} from '../lib/statCardStyleService';

/**
 * Tenant-selected KPI card style (Settings → Appearance). Same hint +
 * initialDataUpdatedAt pattern as useListPageSize: instant paint, immediate
 * server confirmation, hint kept in sync.
 */
export function useStatCardStyle(): StatCardStyle {
  const { data } = useQuery({
    queryKey: settingsKeys.statCardStyle(),
    // Resilient: StatCard renders on surfaces without tenant settings
    // (platform admin) — fall back to the default instead of erroring.
    queryFn: async () => {
      try {
        return (await getTenantStatCardStyle()) ?? null;
      } catch {
        return null;
      }
    },
    initialData: () => readStatCardStyleHint() ?? null,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) writeStatCardStyleHint(data);
  }, [data]);

  return data ?? DEFAULT_STAT_CARD_STYLE;
}
