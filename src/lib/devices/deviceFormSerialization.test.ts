// src/lib/devices/deviceFormSerialization.test.ts
import { describe, it, expect } from 'vitest';
import { hydrateDeviceForm, serializeDeviceForm, validateDeviceForm } from './deviceFormSerialization';
import { BASIC_FIELDS, getDeviceFamilyConfig } from './deviceFieldConfig';

describe('deviceFormSerialization', () => {
  it('hydrates from columns, technical_details, and diagnostics result', () => {
    const state = hydrateDeviceForm({
      device: { pcb_number: 'PCB-1', technical_details: { controller: 'SM2258' } },
      diagnostics: { heads_status: 'abc-id' },
    });
    expect(state.pcb_number).toBe('PCB-1');
    expect(state.controller).toBe('SM2258');
    expect(state.heads_status).toBe('abc-id');
  });

  it('firmware falls back to legacy result key when column empty', () => {
    const state = hydrateDeviceForm({
      device: { firmware_version: '' },
      diagnostics: { firmware_version: 'FW-legacy' },
    });
    expect(state.firmware_version).toBe('FW-legacy');
  });

  it('serialize splits columns vs technical_details and merges (hidden keys preserved)', () => {
    const loaded = { device: { technical_details: { os: 'Android 13' } }, diagnostics: null };
    const state = { pcb_number: 'PCB-9', controller: 'SM2259' };
    const { devicePatch } = serializeDeviceForm(state, loaded);
    expect(devicePatch.pcb_number).toBe('PCB-9');
    expect(devicePatch.technical_details).toMatchObject({ os: 'Android 13', controller: 'SM2259' });
  });

  it('serialize merges diagnostics result and flags hasDiagnostics', () => {
    const loaded = { device: {}, diagnostics: { pcb_status: 'old' } };
    const state = { heads_status: 'good-id' };
    const { diagnosticsPatch, hasDiagnostics } = serializeDeviceForm(state, loaded);
    expect(diagnosticsPatch).toMatchObject({ pcb_status: 'old', heads_status: 'good-id' });
    expect(hasDiagnostics).toBe(true);
  });

  it('hasDiagnostics is false when no diagnostics-bound values present', () => {
    const { hasDiagnostics } = serializeDeviceForm({ pcb_number: 'X' }, { device: {}, diagnostics: null });
    expect(hasDiagnostics).toBe(false);
  });

  it('empty-string column values serialize to null', () => {
    const { devicePatch } = serializeDeviceForm({ model: '' }, { device: {}, diagnostics: null });
    expect(devicePatch.model).toBeNull();
  });

  it('hydrates the component_meta json field to an object (default {})', () => {
    const withMeta = hydrateDeviceForm({ device: {}, diagnostics: { component_meta: { heads: { notes: 'ok' } } } });
    expect(withMeta.component_meta).toEqual({ heads: { notes: 'ok' } });
    const empty = hydrateDeviceForm({ device: {}, diagnostics: null });
    expect(empty.component_meta).toEqual({});
  });

  it('serializes a non-empty component_meta object and flags hasDiagnostics', () => {
    const { diagnosticsPatch, hasDiagnostics } = serializeDeviceForm(
      { component_meta: { heads: { notes: 'All good' } } },
      { device: {}, diagnostics: null },
    );
    expect(diagnosticsPatch.component_meta).toEqual({ heads: { notes: 'All good' } });
    expect(hasDiagnostics).toBe(true);
  });

  it('treats an empty component_meta object as empty (no phantom diagnostics row)', () => {
    const { diagnosticsPatch, hasDiagnostics } = serializeDeviceForm(
      { component_meta: {} },
      { device: {}, diagnostics: null },
    );
    expect(diagnosticsPatch.component_meta).toBeNull();
    expect(hasDiagnostics).toBe(false);
  });

  it('validate flags required visible fields only', () => {
    const visible = [...BASIC_FIELDS, ...getDeviceFamilyConfig('hdd').technical];
    const res = validateDeviceForm({ device_type_id: '' }, visible);
    expect(res.ok).toBe(false);
    expect(res.errors.device_type_id).toBeTruthy();
    const ok = validateDeviceForm({ device_type_id: 'some-id' }, visible);
    expect(ok.ok).toBe(true);
  });
});
