// src/lib/devices/deviceFormSerialization.ts
import { ALL_FIELD_DEFS, type DeviceFieldDef } from './deviceFieldConfig';

export type DeviceFormState = Record<string, unknown>;
export interface LoadedDevice {
  device: Record<string, unknown>;
  diagnostics: Record<string, unknown> | null;
}

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === '';

function readRaw(def: DeviceFieldDef, loaded: LoadedDevice): unknown {
  const { device, diagnostics } = loaded;
  if (def.storage.table === 'case_devices' && def.storage.kind === 'column') {
    return device[def.storage.column];
  }
  if (def.storage.table === 'case_devices' && def.storage.kind === 'json') {
    const td = (device.technical_details ?? {}) as Record<string, unknown>;
    return td[def.storage.jsonKey];
  }
  return (diagnostics ?? {})[def.storage.jsonKey];
}

export function hydrateDeviceForm(loaded: LoadedDevice, defs: DeviceFieldDef[] = ALL_FIELD_DEFS): DeviceFormState {
  const state: DeviceFormState = {};
  for (const def of defs) {
    let val = readRaw(def, loaded);
    if (isEmpty(val) && def.legacyResultKey) {
      val = (loaded.diagnostics ?? {})[def.legacyResultKey];
    }
    if (def.control === 'multiselect') state[def.key] = Array.isArray(val) ? val : [];
    else state[def.key] = val ?? '';
  }
  return state;
}

export function serializeDeviceForm(
  state: DeviceFormState, loaded: LoadedDevice, defs: DeviceFieldDef[] = ALL_FIELD_DEFS,
): { devicePatch: Record<string, unknown>; diagnosticsPatch: Record<string, unknown>; hasDiagnostics: boolean } {
  const devicePatch: Record<string, unknown> = {};
  const technicalDetails: Record<string, unknown> = { ...((loaded.device.technical_details ?? {}) as Record<string, unknown>) };
  const diagnosticsPatch: Record<string, unknown> = { ...((loaded.diagnostics ?? {}) as Record<string, unknown>) };
  let hasDiagnostics = false;

  for (const def of defs) {
    if (!(def.key in state)) continue;
    const raw = state[def.key];
    if (def.storage.table === 'case_devices' && def.storage.kind === 'column') {
      if (def.control === 'multiselect') {
        const arr = Array.isArray(raw) ? raw : [];
        devicePatch[def.storage.column] = arr.length ? arr : null;
      } else {
        devicePatch[def.storage.column] = isEmpty(raw) ? null : raw;
      }
    } else if (def.storage.table === 'case_devices' && def.storage.kind === 'json') {
      technicalDetails[def.storage.jsonKey] = isEmpty(raw) ? null : raw;
    } else {
      // Treat empty arrays (e.g. an untouched symptoms multi-select) as empty so
      // they neither store [] nor force a phantom device_diagnostics row.
      const empty = isEmpty(raw) || (Array.isArray(raw) && raw.length === 0);
      diagnosticsPatch[def.storage.jsonKey] = empty ? null : raw;
      if (!empty) hasDiagnostics = true;
    }
  }

  devicePatch.technical_details = technicalDetails;
  if (!hasDiagnostics) {
    hasDiagnostics = Object.values(diagnosticsPatch).some(v => !isEmpty(v));
  }
  return { devicePatch, diagnosticsPatch, hasDiagnostics };
}

export function validateDeviceForm(
  state: DeviceFormState, visibleDefs: DeviceFieldDef[],
): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const def of visibleDefs) {
    if (!def.required) continue;
    const v = state[def.key];
    const empty = def.control === 'multiselect' ? !(Array.isArray(v) && v.length) : isEmpty(v);
    if (empty) errors[def.key] = `${def.labelFallback} is required`;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
