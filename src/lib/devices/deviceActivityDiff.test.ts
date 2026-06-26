// src/lib/devices/deviceActivityDiff.test.ts
import { describe, it, expect } from 'vitest';
import { buildDeviceActivityEvents } from './deviceActivityDiff';
import { getDeviceFamilyConfig } from './deviceFieldConfig';

const HDD_COMPONENTS = getDeviceFamilyConfig('hdd').components.filter((d) => d.control === 'component-status');

describe('buildDeviceActivityEvents', () => {
  it('returns [] when nothing changed', () => {
    const events = buildDeviceActivityEvents({
      before: { device: {}, diagnostics: { pcb_status: 'Good' } },
      afterState: { pcb_status: 'Good' },
      componentDefs: HDD_COMPONENTS,
      isNewDevice: false,
    });
    expect(events).toEqual([]);
  });

  it('emits status / note / test / diagnostic-note events from a save diff', () => {
    const events = buildDeviceActivityEvents({
      before: { device: {}, diagnostics: { pcb_status: 'Good' } },
      afterState: {
        pcb_status: 'Failed',
        component_meta: { pcb: { notes: 'Burn mark near ROM', test_method: 'Visual Inspection' } },
        diagnostic_notes: 'Inspection complete',
      },
      componentDefs: HDD_COMPONENTS,
      isNewDevice: false,
    });
    const types = events.map((e) => e.activity_type);
    expect(types).toContain('component_status_updated');
    expect(types).toContain('component_note_added');
    expect(types).toContain('diagnostic_test_performed');
    expect(types).toContain('diagnostic_note_added');

    const status = events.find((e) => e.activity_type === 'component_status_updated');
    expect(status).toMatchObject({ component_key: 'pcb', old_value: 'Good', new_value: 'Failed', status: 'Failed' });
  });

  it('emits a device_received event for a new device', () => {
    const events = buildDeviceActivityEvents({
      before: { device: {}, diagnostics: null },
      afterState: {},
      componentDefs: HDD_COMPONENTS,
      isNewDevice: true,
    });
    expect(events.map((e) => e.activity_type)).toEqual(['device_received']);
  });

  it('does not emit a status event when the new status is empty', () => {
    const events = buildDeviceActivityEvents({
      before: { device: {}, diagnostics: { pcb_status: 'Good' } },
      afterState: { pcb_status: '' },
      componentDefs: HDD_COMPONENTS,
      isNewDevice: false,
    });
    expect(events).toEqual([]);
  });
});
