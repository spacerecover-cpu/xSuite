/**
 * Tenant label-printing preferences — company_settings.metadata.label_printing.
 *
 * Follows the v1.2.0 table_columns pattern (tablePrefsService.ts): read via the
 * cached company-settings service, write by merging the metadata bucket
 * (owner/admin RLS-gated), invalidate the cache after writes.
 *
 * Shape: per-entity label design — stock size, auto-print-on-create, copies,
 * QR / barcode visibility, and per-entity content-field toggles. Stored as
 * PARALLEL maps keyed by entity so the original `{ sizes, autoPrint }` metadata
 * still reads back unchanged; the newer maps default in when absent (forward
 * migration with zero risk to existing tenants).
 */

import type { Json } from '../types/database.types';
import {
  getOrCreateCompanySettings,
  updateCompanySettings,
  invalidateCompanySettingsCache,
} from './companySettingsService';
import { DEFAULT_LABEL_SIZE_ID, LABEL_SIZE_PRESETS } from './pdf/labels/labelSizes';

export type LabelEntity = 'case' | 'stock' | 'inventory';

/** A togglable content field on a label, per entity (drives the mapper + editor UI). */
export interface LabelFieldDef {
  key: string;
  label: string;
  default: boolean;
}

/**
 * The optional content fields each entity's label can show. The identifier and
 * (for cases) the device index are always rendered and are NOT listed here.
 * This is the single source of truth for both the editor checkboxes and the
 * per-entity default field set.
 */
export const LABEL_FIELDS: Record<LabelEntity, LabelFieldDef[]> = {
  case: [
    { key: 'serial', label: 'Serial number', default: true },
    { key: 'device', label: 'Device (brand / model / capacity)', default: true },
    { key: 'customer', label: 'Customer name', default: true },
    { key: 'date', label: 'Received date', default: true },
    { key: 'footer', label: 'Lab name', default: true },
  ],
  stock: [
    { key: 'category', label: 'Category', default: true },
    { key: 'brand', label: 'Brand', default: true },
    { key: 'price', label: 'Price', default: true },
    { key: 'location', label: 'Location', default: true },
    { key: 'footer', label: 'Company name', default: true },
  ],
  inventory: [
    { key: 'spec', label: 'Spec (brand / type / capacity)', default: true },
    { key: 'location', label: 'Storage location', default: true },
  ],
};

/** Per-entity label design. `fields` keys come from {@link LABEL_FIELDS}. */
export interface LabelEntityConfig {
  sizeId: string;
  autoPrint: boolean;
  copies: number;
  showQr: boolean;
  showBarcode: boolean;
  fields: Record<string, boolean>;
}

export interface LabelPrintingPrefs {
  /** Label-size preset id per entity (see LABEL_SIZE_PRESETS). */
  sizes: Record<LabelEntity, string>;
  /** Print the label immediately after the entity is created. */
  autoPrint: Record<LabelEntity, boolean>;
  /** Copies of each label per print (1–20). */
  copies: Record<LabelEntity, number>;
  /** Render the scannable QR. */
  showQr: Record<LabelEntity, boolean>;
  /** Render the Code128 barcode (wide stock only). */
  showBarcode: Record<LabelEntity, boolean>;
  /** Optional content-field visibility, per entity. */
  fields: Record<LabelEntity, Record<string, boolean>>;
}

const ENTITIES: LabelEntity[] = ['case', 'stock', 'inventory'];

/** The default field-visibility map for an entity, derived from LABEL_FIELDS. */
export function defaultLabelFields(entity: LabelEntity): Record<string, boolean> {
  return Object.fromEntries(LABEL_FIELDS[entity].map((f) => [f.key, f.default]));
}

function buildDefaults(): LabelPrintingPrefs {
  const sizes = {} as Record<LabelEntity, string>;
  const autoPrint = {} as Record<LabelEntity, boolean>;
  const copies = {} as Record<LabelEntity, number>;
  const showQr = {} as Record<LabelEntity, boolean>;
  const showBarcode = {} as Record<LabelEntity, boolean>;
  const fields = {} as Record<LabelEntity, Record<string, boolean>>;
  for (const e of ENTITIES) {
    sizes[e] = DEFAULT_LABEL_SIZE_ID;
    autoPrint[e] = false;
    copies[e] = 1;
    showQr[e] = true;
    showBarcode[e] = true;
    fields[e] = defaultLabelFields(e);
  }
  return { sizes, autoPrint, copies, showQr, showBarcode, fields };
}

export const DEFAULT_LABEL_PRINTING_PREFS: LabelPrintingPrefs = buildDefaults();

function normalizeSizeId(value: unknown): string {
  return typeof value === 'string' && LABEL_SIZE_PRESETS.some((p) => p.id === value)
    ? value
    : DEFAULT_LABEL_SIZE_ID;
}

function normalizeCopies(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : 1;
  return Math.max(1, Math.min(20, Number.isFinite(n) ? n : 1));
}

/** Only known field keys survive; each coerces to a real boolean (default when absent). */
function normalizeFields(entity: LabelEntity, value: unknown): Record<string, boolean> {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const def of LABEL_FIELDS[entity]) {
    out[def.key] = typeof raw[def.key] === 'boolean' ? (raw[def.key] as boolean) : def.default;
  }
  return out;
}

/** Guard against corrupt metadata: unknown sizes fall back, flags coerce to real
 *  booleans, and pre-existing `{ sizes, autoPrint }` metadata migrates forward. */
export function normalizeLabelPrintingPrefs(value: unknown): LabelPrintingPrefs {
  const raw = (value && typeof value === 'object' ? value : {}) as {
    sizes?: Record<string, unknown>;
    autoPrint?: Record<string, unknown>;
    copies?: Record<string, unknown>;
    showQr?: Record<string, unknown>;
    showBarcode?: Record<string, unknown>;
    fields?: Record<string, unknown>;
  };
  const coerce = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
  const prefs = buildDefaults();
  for (const e of ENTITIES) {
    prefs.sizes[e] = normalizeSizeId(raw.sizes?.[e]);
    prefs.autoPrint[e] = raw.autoPrint?.[e] === true;
    prefs.copies[e] = normalizeCopies(raw.copies?.[e]);
    prefs.showQr[e] = coerce(raw.showQr?.[e], true);
    prefs.showBarcode[e] = coerce(raw.showBarcode?.[e], true);
    prefs.fields[e] = normalizeFields(e, raw.fields?.[e]);
  }
  return prefs;
}

/** The resolved design for one entity, as the print service / mappers consume it. */
export function labelEntityConfig(prefs: LabelPrintingPrefs, entity: LabelEntity): LabelEntityConfig {
  return {
    sizeId: prefs.sizes[entity],
    autoPrint: prefs.autoPrint[entity],
    copies: prefs.copies[entity],
    showQr: prefs.showQr[entity],
    showBarcode: prefs.showBarcode[entity],
    fields: prefs.fields[entity],
  };
}

export async function getLabelPrintingPrefs(): Promise<LabelPrintingPrefs> {
  const settings = await getOrCreateCompanySettings();
  const metadata = (settings.metadata ?? {}) as Record<string, unknown>;
  return normalizeLabelPrintingPrefs(metadata.label_printing);
}

export async function getLabelEntityConfig(entity: LabelEntity): Promise<LabelEntityConfig> {
  return labelEntityConfig(await getLabelPrintingPrefs(), entity);
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
