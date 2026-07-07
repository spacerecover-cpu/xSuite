/**
 * Tenant label-printing preferences — company_settings.metadata.label_printing.
 *
 * Follows the v1.2.0 table_columns pattern (tablePrefsService.ts): read via the
 * cached company-settings service, write by merging the metadata bucket
 * (owner/admin RLS-gated), invalidate the cache after writes.
 *
 * Shape: default label-stock size per entity + auto-print-on-create toggles.
 */

import type { Json } from '../types/database.types';
import {
  getOrCreateCompanySettings,
  updateCompanySettings,
  invalidateCompanySettingsCache,
} from './companySettingsService';
import { DEFAULT_LABEL_SIZE_ID, LABEL_SIZE_PRESETS } from './pdf/labels/labelSizes';

export type LabelEntity = 'case' | 'stock' | 'inventory';

export interface LabelPrintingPrefs {
  /** Label-size preset id per entity (see LABEL_SIZE_PRESETS). */
  sizes: Record<LabelEntity, string>;
  /** Print the label immediately after the entity is created. */
  autoPrint: Record<LabelEntity, boolean>;
}

export const DEFAULT_LABEL_PRINTING_PREFS: LabelPrintingPrefs = {
  sizes: { case: DEFAULT_LABEL_SIZE_ID, stock: DEFAULT_LABEL_SIZE_ID, inventory: DEFAULT_LABEL_SIZE_ID },
  autoPrint: { case: false, stock: false, inventory: false },
};

const ENTITIES: LabelEntity[] = ['case', 'stock', 'inventory'];

function normalizeSizeId(value: unknown): string {
  return typeof value === 'string' && LABEL_SIZE_PRESETS.some((p) => p.id === value)
    ? value
    : DEFAULT_LABEL_SIZE_ID;
}

/** Guard against corrupt metadata: unknown sizes fall back, flags coerce to real booleans. */
export function normalizeLabelPrintingPrefs(value: unknown): LabelPrintingPrefs {
  const raw = (value && typeof value === 'object' ? value : {}) as {
    sizes?: Record<string, unknown>;
    autoPrint?: Record<string, unknown>;
  };
  const sizes = {} as Record<LabelEntity, string>;
  const autoPrint = {} as Record<LabelEntity, boolean>;
  for (const entity of ENTITIES) {
    sizes[entity] = normalizeSizeId(raw.sizes?.[entity]);
    autoPrint[entity] = raw.autoPrint?.[entity] === true;
  }
  return { sizes, autoPrint };
}

export async function getLabelPrintingPrefs(): Promise<LabelPrintingPrefs> {
  const settings = await getOrCreateCompanySettings();
  const metadata = (settings.metadata ?? {}) as Record<string, unknown>;
  return normalizeLabelPrintingPrefs(metadata.label_printing);
}

export async function setLabelPrintingPrefs(next: LabelPrintingPrefs): Promise<void> {
  const settings = await getOrCreateCompanySettings();
  const metadata = {
    ...((settings.metadata ?? {}) as Record<string, unknown>),
    label_printing: normalizeLabelPrintingPrefs(next) as unknown,
  };
  await updateCompanySettings({ metadata: metadata as Json });
  invalidateCompanySettingsCache();
}

/** Auto-print must never block creation flows — failures resolve to false. */
export async function shouldAutoPrintLabel(entity: LabelEntity): Promise<boolean> {
  try {
    return (await getLabelPrintingPrefs()).autoPrint[entity];
  } catch {
    return false;
  }
}
