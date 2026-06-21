import type { ReactNode } from 'react';

/** One column in a configurable table's registry — the single source of truth
 *  for what CAN be shown. New tenant column requests become registry entries. */
export interface TableColumnDef<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** Pixels the column needs to stay legible — the admission unit for the fit algorithm. */
  minWidth: number;
  /** 1 = identity column, never collapsed; higher numbers collapse first. */
  priority: number;
  defaultVisible: boolean;
  /** Plain value for CSV export; omit to exclude from exports. */
  exportValue?: (row: T) => string | number | null | undefined;
  align?: 'start' | 'end';
}

/** Tenant-level defaults, stored in company_settings.metadata.table_columns[tableKey]. */
export interface TenantTableColumnConfig {
  visible?: string[];
  order?: string[];
  /** Columns users may not hide (always rendered). */
  locked?: string[];
}

/** Per-user overrides, stored in user_preferences.preferences.tables[tableKey]. */
export interface UserTableColumnPrefs {
  visible?: string[];
  order?: string[];
  widths?: Record<string, number>;
}

export interface ResolvedTableView {
  /** Visible column keys in display order after registry ← tenant ← user resolution. */
  orderedVisible: string[];
  locked: string[];
  widths: Record<string, number>;
}

/**
 * Resolve the effective view: registry defaults ← tenant defaults ← user prefs.
 * Unknown keys (renamed/removed columns in stale prefs) are dropped; locked
 * columns always render; newly-registered columns append to the end of the
 * order rather than disappearing.
 */
export function resolveTableView(
  registry: Array<{ key: string; defaultVisible: boolean }>,
  tenant?: TenantTableColumnConfig | null,
  user?: UserTableColumnPrefs | null,
): ResolvedTableView {
  const known = new Set(registry.map((c) => c.key));
  const keep = (keys: string[] | undefined) => (keys ?? []).filter((k) => known.has(k));

  const locked = keep(tenant?.locked);
  const tenantVisible = keep(tenant?.visible);
  const userVisible = keep(user?.visible);

  const baseVisible =
    userVisible.length > 0
      ? userVisible
      : tenantVisible.length > 0
        ? tenantVisible
        : registry.filter((c) => c.defaultVisible).map((c) => c.key);

  const visible = new Set([...locked, ...baseVisible]);

  const userOrder = keep(user?.order);
  const tenantOrder = keep(tenant?.order);
  const baseOrder = userOrder.length > 0 ? userOrder : tenantOrder.length > 0 ? tenantOrder : registry.map((c) => c.key);
  const orderedAll = [...baseOrder, ...registry.map((c) => c.key).filter((k) => !baseOrder.includes(k))];

  return {
    orderedVisible: orderedAll.filter((k) => visible.has(k)),
    locked,
    widths: user?.widths ?? {},
  };
}
