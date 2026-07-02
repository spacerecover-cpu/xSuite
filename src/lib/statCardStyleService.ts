import {
  getOrCreateCompanySettings,
  updateCompanySettings,
  invalidateCompanySettingsCache,
} from './companySettingsService';
import type { Json } from '../types/database.types';

/**
 * Tenant-wide KPI/stat-card style (Settings → Appearance):
 * 'compact' — calm white chips with coloured numbers; 'vivid' — the classic
 * gradient tiles. Stored in company_settings.metadata.stat_card_style.
 */
export const STAT_CARD_STYLES = ['compact', 'vivid'] as const;
export type StatCardStyle = (typeof STAT_CARD_STYLES)[number];
export const DEFAULT_STAT_CARD_STYLE: StatCardStyle = 'compact';

export function normalizeStatCardStyle(value: unknown): StatCardStyle | undefined {
  return (STAT_CARD_STYLES as readonly unknown[]).includes(value)
    ? (value as StatCardStyle)
    : undefined;
}

export async function getTenantStatCardStyle(): Promise<StatCardStyle | undefined> {
  const settings = await getOrCreateCompanySettings();
  const metadata = (settings.metadata ?? {}) as Record<string, unknown>;
  return normalizeStatCardStyle(metadata.stat_card_style);
}

export async function setTenantStatCardStyle(style: StatCardStyle): Promise<void> {
  const normalized = normalizeStatCardStyle(style);
  if (!normalized) throw new Error(`Invalid stat card style: ${style}`);
  const settings = await getOrCreateCompanySettings();
  const metadata = {
    ...((settings.metadata ?? {}) as Record<string, unknown>),
    stat_card_style: normalized,
  };
  await updateCompanySettings({ metadata: metadata as Json });
  invalidateCompanySettingsCache();
  writeStatCardStyleHint(normalized);
}

const STAT_CARD_STYLE_HINT_KEY = 'xsuite_stat_card_style';

export function readStatCardStyleHint(): StatCardStyle | undefined {
  try {
    return normalizeStatCardStyle(localStorage.getItem(STAT_CARD_STYLE_HINT_KEY));
  } catch {
    return undefined;
  }
}

export function writeStatCardStyleHint(style: StatCardStyle): void {
  try {
    localStorage.setItem(STAT_CARD_STYLE_HINT_KEY, style);
  } catch {
    // Best-effort hint only.
  }
}
