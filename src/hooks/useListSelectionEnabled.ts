// src/hooks/useListSelectionEnabled.ts
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsKeys } from '../lib/queryKeys';
import {
  getTenantListSelectionEnabled,
  readListSelectionHint,
  writeListSelectionHint,
} from '../lib/tablePrefsService';

/**
 * Whether list tables show bulk-selection checkboxes (Settings → Preferences).
 * Defaults to true. Same hint/initialDataUpdatedAt pattern as useListPageSize
 * so the first paint matches the tenant's choice without a layout flash.
 */
export function useListSelectionEnabled(): boolean {
  const { data } = useQuery({
    queryKey: settingsKeys.listSelection(),
    queryFn: async () => (await getTenantListSelectionEnabled()) ?? null,
    initialData: () => readListSelectionHint() ?? null,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data !== null && data !== undefined) writeListSelectionHint(data);
  }, [data]);

  return data ?? true;
}
