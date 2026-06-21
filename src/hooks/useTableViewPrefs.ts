import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTenantTableColumns,
  getUserTablePrefs,
  readTablePrefsHint,
  setUserTablePrefs,
  writeTablePrefsHint,
} from '../lib/tablePrefsService';
import { resolveTableView } from '../lib/tables/types';
import type { ResolvedTableView, UserTableColumnPrefs } from '../lib/tables/types';
import { logger } from '../lib/logger';

interface RegistryMeta {
  key: string;
  defaultVisible: boolean;
}

/**
 * Effective column view for a configurable table:
 * registry defaults ← tenant defaults (company_settings) ← user prefs
 * (user_preferences), with a localStorage hint so the first paint already
 * uses the user's layout.
 */
export function useTableViewPrefs(tableKey: string, registry: RegistryMeta[]) {
  const queryClient = useQueryClient();

  const { data: tenantConfig } = useQuery({
    queryKey: ['table_columns', 'tenant', tableKey],
    queryFn: () => getTenantTableColumns(tableKey),
    staleTime: 5 * 60 * 1000,
  });

  const { data: userPrefs } = useQuery({
    queryKey: ['table_columns', 'user', tableKey],
    queryFn: async () => (await getUserTablePrefs(tableKey)) ?? null,
    initialData: () => readTablePrefsHint(tableKey) ?? null,
    staleTime: 60 * 1000,
  });

  const view: ResolvedTableView = useMemo(
    () => resolveTableView(registry, tenantConfig, userPrefs ?? undefined),
    [registry, tenantConfig, userPrefs],
  );

  const saveMutation = useMutation({
    mutationFn: (next: UserTableColumnPrefs) => setUserTablePrefs(tableKey, next),
    onError: (error) => logger.error('Failed to save table preferences:', error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['table_columns', 'user', tableKey] }),
  });

  const savePrefs = useCallback(
    (patch: Partial<UserTableColumnPrefs>) => {
      const next: UserTableColumnPrefs = { ...(userPrefs ?? {}), ...patch };
      // Optimistic: paint immediately, persist in the background.
      queryClient.setQueryData(['table_columns', 'user', tableKey], next);
      writeTablePrefsHint(tableKey, next);
      saveMutation.mutate(next);
    },
    [queryClient, saveMutation, tableKey, userPrefs],
  );

  const resetPrefs = useCallback(() => {
    const next: UserTableColumnPrefs = {};
    queryClient.setQueryData(['table_columns', 'user', tableKey], next);
    writeTablePrefsHint(tableKey, next);
    saveMutation.mutate(next);
  }, [queryClient, saveMutation, tableKey]);

  return {
    view,
    tenantConfig,
    userPrefs: userPrefs ?? undefined,
    setVisibleAndOrder: (visible: string[], order: string[]) => savePrefs({ visible, order }),
    setWidths: (widths: Record<string, number>) => savePrefs({ widths }),
    resetPrefs,
  };
}
