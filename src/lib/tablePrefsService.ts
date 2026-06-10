import { supabase, resolveTenantId } from './supabaseClient';
import { logger } from './logger';
import type { Json } from '../types/database.types';
import {
  getOrCreateCompanySettings,
  updateCompanySettings,
  invalidateCompanySettingsCache,
} from './companySettingsService';
import type { TenantTableColumnConfig, UserTableColumnPrefs } from './tables/types';

type TableColumnsMetadata = { table_columns?: Record<string, TenantTableColumnConfig> } & Record<string, unknown>;

/** Tenant-level column defaults live in company_settings.metadata.table_columns[tableKey]. */
export async function getTenantTableColumns(tableKey: string): Promise<TenantTableColumnConfig | undefined> {
  const settings = await getOrCreateCompanySettings();
  const metadata = (settings.metadata ?? {}) as TableColumnsMetadata;
  return metadata.table_columns?.[tableKey];
}

export async function setTenantTableColumns(
  tableKey: string,
  config: TenantTableColumnConfig,
): Promise<void> {
  const settings = await getOrCreateCompanySettings();
  const metadata = { ...((settings.metadata ?? {}) as TableColumnsMetadata) };
  metadata.table_columns = { ...(metadata.table_columns ?? {}), [tableKey]: config };
  await updateCompanySettings({ metadata: metadata as Json });
  invalidateCompanySettingsCache();
}

/** Per-user prefs live in user_preferences.preferences.tables[tableKey]. */
export async function getUserTablePrefs(tableKey: string): Promise<UserTableColumnPrefs | undefined> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return undefined;

  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.error('Failed to load user table preferences:', error);
    return undefined;
  }
  const prefs = (data?.preferences ?? {}) as { tables?: Record<string, UserTableColumnPrefs> };
  return prefs.tables?.[tableKey];
}

export async function setUserTablePrefs(
  tableKey: string,
  next: UserTableColumnPrefs,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;

  const { data: existing, error: readError } = await supabase
    .from('user_preferences')
    .select('id, preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;

  const current = (existing?.preferences ?? {}) as { tables?: Record<string, UserTableColumnPrefs> } & Record<string, unknown>;
  const preferences = {
    ...current,
    tables: { ...(current.tables ?? {}), [tableKey]: next },
  } as unknown as Json;

  if (existing?.id) {
    const { error } = await supabase
      .from('user_preferences')
      .update({ preferences })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const tenantId = await resolveTenantId();
    const { error } = await supabase
      .from('user_preferences')
      .insert({ tenant_id: tenantId, user_id: userId, preferences });
    if (error) throw error;
  }
}

const hintKey = (tableKey: string) => `xsuite_tablecols_${tableKey}`;

/** localStorage hint so the table renders with the user's columns on first paint. */
export function readTablePrefsHint(tableKey: string): UserTableColumnPrefs | undefined {
  try {
    const raw = localStorage.getItem(hintKey(tableKey));
    return raw ? (JSON.parse(raw) as UserTableColumnPrefs) : undefined;
  } catch {
    return undefined;
  }
}

export function writeTablePrefsHint(tableKey: string, prefs: UserTableColumnPrefs): void {
  try {
    localStorage.setItem(hintKey(tableKey), JSON.stringify(prefs));
  } catch {
    // Best-effort hint only.
  }
}
