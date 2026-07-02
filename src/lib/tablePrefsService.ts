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

/**
 * Tenant-wide rows-per-page for list tables. Lives in
 * company_settings.metadata.list_page_size next to table_columns; every
 * paginated list reads it via useListPageSize().
 */
export const LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_LIST_PAGE_SIZE = 50;

/** Guard against corrupt metadata / string round-trips: only allowed options pass. */
export function normalizeListPageSize(value: unknown): number | undefined {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return (LIST_PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : undefined;
}

export async function getTenantListPageSize(): Promise<number | undefined> {
  const settings = await getOrCreateCompanySettings();
  const metadata = (settings.metadata ?? {}) as Record<string, unknown>;
  return normalizeListPageSize(metadata.list_page_size);
}

export async function setTenantListPageSize(size: number): Promise<void> {
  const normalized = normalizeListPageSize(size);
  if (normalized === undefined) throw new Error(`Invalid rows-per-page value: ${size}`);
  const settings = await getOrCreateCompanySettings();
  const metadata = {
    ...((settings.metadata ?? {}) as Record<string, unknown>),
    list_page_size: normalized,
  };
  await updateCompanySettings({ metadata: metadata as Json });
  invalidateCompanySettingsCache();
  writeListPageSizeHint(normalized);
}

const LIST_PAGE_SIZE_HINT_KEY = 'xsuite_list_page_size';

/** localStorage hint so lists render at the tenant's size on first paint. */
export function readListPageSizeHint(): number | undefined {
  try {
    return normalizeListPageSize(localStorage.getItem(LIST_PAGE_SIZE_HINT_KEY));
  } catch {
    return undefined;
  }
}

export function writeListPageSizeHint(size: number): void {
  try {
    localStorage.setItem(LIST_PAGE_SIZE_HINT_KEY, String(size));
  } catch {
    // Best-effort hint only.
  }
}

/**
 * Tenant-wide visibility of the bulk-selection checkboxes on list tables
 * (company_settings.metadata.list_selection_checkboxes). Hidden = lists render
 * without the checkbox column; bulk actions stay dormant.
 */
export function normalizeListSelectionEnabled(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export async function getTenantListSelectionEnabled(): Promise<boolean | undefined> {
  const settings = await getOrCreateCompanySettings();
  const metadata = (settings.metadata ?? {}) as Record<string, unknown>;
  return normalizeListSelectionEnabled(metadata.list_selection_checkboxes);
}

export async function setTenantListSelectionEnabled(enabled: boolean): Promise<void> {
  const settings = await getOrCreateCompanySettings();
  const metadata = {
    ...((settings.metadata ?? {}) as Record<string, unknown>),
    list_selection_checkboxes: enabled,
  };
  await updateCompanySettings({ metadata: metadata as Json });
  invalidateCompanySettingsCache();
  writeListSelectionHint(enabled);
}

const LIST_SELECTION_HINT_KEY = 'xsuite_list_selection';

export function readListSelectionHint(): boolean | undefined {
  try {
    return normalizeListSelectionEnabled(localStorage.getItem(LIST_SELECTION_HINT_KEY));
  } catch {
    return undefined;
  }
}

export function writeListSelectionHint(enabled: boolean): void {
  try {
    localStorage.setItem(LIST_SELECTION_HINT_KEY, String(enabled));
  } catch {
    // Best-effort hint only.
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
