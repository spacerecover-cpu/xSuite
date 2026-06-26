// src/lib/devices/deviceFieldConfig.test.ts
import { describe, it, expect } from 'vitest';
import {
  BASIC_FIELDS, DIAGNOSTIC_FIELDS, getDeviceFamilyConfig, ALL_FIELD_DEFS, type DeviceFieldDef,
} from './deviceFieldConfig';

const FAMILIES = ['hdd','ssd','usb_flash','memory_card','mobile','raid','nas','other'] as const;

const everyField = (): DeviceFieldDef[] => [
  ...BASIC_FIELDS, ...DIAGNOSTIC_FIELDS,
  ...FAMILIES.flatMap(f => { const c = getDeviceFamilyConfig(f); return [...c.technical, ...c.components]; }),
];

// Diagnostic-tab fields rendered by the bespoke DeviceDiagnosticForm (not the
// generic DeviceFieldRenderer): engineer_id gets its option list at runtime, and
// symptoms_list is a free-typed tag input. They legitimately carry no
// optionsSource/staticOptions, so they are exempt from the options invariants.
const BESPOKE_DYNAMIC = new Set(['engineer_id', 'symptoms_list']);

describe('deviceFieldConfig', () => {
  it('BASIC_FIELDS has the 8 basic fields, with interface_id between capacity and condition', () => {
    expect(BASIC_FIELDS.map(f => f.key)).toEqual([
      'device_type_id','brand_id','model','serial_number','capacity_id','interface_id','condition_id','accessories',
    ]);
  });

  it('every family resolves to a config with arrays', () => {
    for (const fam of FAMILIES) {
      const cfg = getDeviceFamilyConfig(fam);
      expect(cfg.family).toBe(fam);
      expect(Array.isArray(cfg.technical)).toBe(true);
      expect(Array.isArray(cfg.components)).toBe(true);
    }
  });

  it('no duplicate field keys within a single section', () => {
    for (const fam of FAMILIES) {
      const cfg = getDeviceFamilyConfig(fam);
      for (const section of [cfg.technical, cfg.components]) {
        const keys = section.map(f => f.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it('select/multiselect/component-status fields declare optionsSource or staticOptions', () => {
    for (const f of everyField()) {
      if (BESPOKE_DYNAMIC.has(f.key)) continue;
      if (['select','multiselect','component-status'].includes(f.control)) {
        expect(Boolean(f.optionsSource) || Boolean(f.staticOptions), `${f.key} needs optionsSource or staticOptions`).toBe(true);
      }
    }
  });

  it('component-status fields target device_diagnostics and carry a componentKey', () => {
    for (const fam of FAMILIES) {
      for (const f of getDeviceFamilyConfig(fam).components) {
        if (f.control === 'component-status') {
          expect(f.storage.table).toBe('device_diagnostics');
          expect(f.componentKey).toBeTruthy();
        }
      }
    }
  });

  it('any field key used in >1 family maps to identical storage (dedupe-safe)', () => {
    const byKey = new Map<string, string>();
    const all = [...BASIC_FIELDS, ...FAMILIES.flatMap(f => {
      const c = getDeviceFamilyConfig(f); return [...c.technical, ...c.components];
    })];
    for (const f of all) {
      const sig = JSON.stringify(f.storage);
      if (byKey.has(f.key)) expect(byKey.get(f.key)).toBe(sig);
      else byKey.set(f.key, sig);
    }
  });

  it('ALL_FIELD_DEFS is deduped by key and covers every field', () => {
    const keys = ALL_FIELD_DEFS.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('pcb_number');
    expect(keys).toContain('heads_status');
  });

  it('DIAGNOSTIC_FIELDS has the redesigned diagnostic keys in render order', () => {
    expect(DIAGNOSTIC_FIELDS.map(f => f.key)).toEqual([
      'device_problem','failure_type','severity','symptoms_list','symptoms_detail',
      'initial_diagnosis','diagnostic_status','next_step','tools_software','engineer_id',
      'est_time','evaluation_result','recovery_chance','recommendation','diagnostic_notes',
    ]);
  });

  it('DIAGNOSTIC_FIELDS are in ALL_FIELD_DEFS', () => {
    for (const k of ['device_problem','diagnostic_status','diagnostic_notes'])
      expect(ALL_FIELD_DEFS.map(f => f.key)).toContain(k);
  });

  it('select fields declare optionsSource OR staticOptions', () => {
    for (const f of everyField()) {
      if (BESPOKE_DYNAMIC.has(f.key)) continue;
      if (f.control === 'select' || f.control === 'multiselect' || f.control === 'component-status')
        expect(Boolean(f.optionsSource) || Boolean(f.staticOptions), `${f.key}`).toBe(true);
    }
  });

  it('no two distinct field keys share a storage target', () => {
    const seen = new Map<string, string>();
    for (const f of everyField()) {
      const sig = JSON.stringify(f.storage);
      if (seen.has(sig)) expect(seen.get(sig), `storage clash on ${sig}`).toBe(f.key);
      else seen.set(sig, f.key);
    }
  });

  it('diagnostic_status and recovery_chance carry staticOptions', () => {
    for (const k of ['diagnostic_status','recovery_chance']) {
      const f = DIAGNOSTIC_FIELDS.find(x => x.key === k)!;
      expect(f.staticOptions && f.staticOptions.length).toBeTruthy();
    }
  });
});
