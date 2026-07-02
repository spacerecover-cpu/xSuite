// src/hooks/useListPageSize.ts
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsKeys } from '../lib/queryKeys';
import {
  DEFAULT_LIST_PAGE_SIZE,
  getTenantListPageSize,
  readListPageSizeHint,
  writeListPageSizeHint,
} from '../lib/tablePrefsService';

/**
 * Tenant-configured rows-per-page for list tables (Settings → Tables).
 * The localStorage hint keeps the first paint at the tenant's size;
 * initialDataUpdatedAt: 0 marks it stale so the query still confirms
 * against company_settings and refreshes the hint.
 */
export function useListPageSize(): number {
  const { data } = useQuery({
    queryKey: settingsKeys.listPageSize(),
    queryFn: async () => (await getTenantListPageSize()) ?? null,
    initialData: () => readListPageSizeHint() ?? null,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) writeListPageSizeHint(data);
  }, [data]);

  return data ?? DEFAULT_LIST_PAGE_SIZE;
}
