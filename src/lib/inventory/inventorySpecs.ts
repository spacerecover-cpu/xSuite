// src/lib/inventory/inventorySpecs.ts
//
// Pure serialization helpers for inventory technical_details (jsonb).
// Inventory items store ALL device technical fields in one `technical_details`
// jsonb column — no case_devices columns, no device_diagnostics rows.
// This module owns the serialize ↔ hydrate contract for that column.

import { getDeviceFamilyConfig } from '../devices/deviceFieldConfig';
import type { DeviceFamily } from '../devices/deviceFamily';

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === '';

/**
 * Build the `technical_details` object for an inventory item.
 * Walks the family's technical field defs, keying each value by `def.key`
 * (not by any storage column name — everything lands in the returned jsonb).
 * Skips empty values so the stored object stays clean.
 */
export function serializeInventorySpecs(
  family: DeviceFamily,
  form: Record<string, unknown>,
): Record<string, unknown> {
  const cfg = getDeviceFamilyConfig(family);
  const out: Record<string, unknown> = {};

  for (const def of cfg.technical) {
    if (!(def.key in form)) continue;
    const raw = form[def.key];
    const empty =
      isEmpty(raw) ||
      (def.control === 'multiselect' && Array.isArray(raw) && raw.length === 0);
    if (!empty) {
      out[def.key] = raw;
    }
  }

  return out;
}

/**
 * Reverse of serializeInventorySpecs.
 * Reads each technical field def key from the stored jsonb and returns a
 * form-state-shaped object with appropriate defaults.
 */
export function hydrateInventorySpecs(
  family: DeviceFamily,
  technical_details: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const cfg = getDeviceFamilyConfig(family);
  const td = technical_details ?? {};
  const out: Record<string, unknown> = {};

  for (const def of cfg.technical) {
    const val = td[def.key];
    if (def.control === 'multiselect') {
      out[def.key] = Array.isArray(val) ? val : [];
    } else {
      out[def.key] = val ?? '';
    }
  }

  return out;
}
