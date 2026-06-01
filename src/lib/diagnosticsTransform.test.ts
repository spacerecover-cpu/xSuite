import { describe, it, expect } from 'vitest';
import {
  toDeviceDiagnosticsInsert,
  toDeviceDiagnosticsUpdate,
  fromDeviceDiagnosticsRow,
  type DeviceDiagnostics,
} from './diagnosticsTransform';
import type { Database } from '../types/database.types';

type DiagnosticsRow = Database['public']['Tables']['device_diagnostics']['Row'];

// The live device_diagnostics table has ONLY these columns (verified against the
// project DB). Anything else the old code sent (heads_status, diagnosed_by, ...)
// 400'd in PostgREST and the error was swallowed — silent data loss.
const REAL_COLUMNS = [
  'device_id',
  'diagnostic_type',
  'tool_used',
  'notes',
  'performed_by',
  'result',
  'tenant_id',
];

// The exact keys the report PDF reader pulls out of result jsonb
// (src/lib/reportPDFService.ts mapDiagnosticsRow, lines 36-45). If the writer
// doesn't pack these EXACT names, reports stay blank despite rows existing.
const REPORT_READER_KEYS = [
  'device_type_category',
  'heads_status',
  'pcb_status',
  'motor_status',
  'surface_status',
  'controller_status',
  'memory_chips_status',
  'controller_model',
  'nand_type',
  'physical_damage_notes',
];

const sample: DeviceDiagnostics = {
  case_device_id: 'dev-1',
  device_type_category: 'hdd',
  heads_status: 'bad',
  pcb_status: 'good',
  pcb_notes: 'scorched pad',
  motor_status: 'partial',
  surface_status: 'good',
  sa_access: true,
  platter_condition: 'scored',
  controller_status: 'good',
  controller_model: 'Marvell 88i',
  memory_chips_status: 'good',
  nand_type: 'TLC',
  firmware_corruption: false,
  trim_support: true,
  wear_leveling_count: 1200,
  firmware_version: 'A1',
  rom_version: 'R2',
  physical_damage_notes: 'bent connector',
  technical_notes: 'donor needed',
  diagnosed_by: 'user-9',
};

describe('toDeviceDiagnosticsInsert', () => {
  it('packs structured fields into result jsonb, never as top-level columns', () => {
    const insert = toDeviceDiagnosticsInsert(sample);
    for (const key of Object.keys(insert)) {
      expect(REAL_COLUMNS).toContain(key);
    }
    // the field that used to 400 must NOT be a top-level column
    expect('heads_status' in insert).toBe(false);
    expect((insert.result as Record<string, unknown>).heads_status).toBe('bad');
  });

  it('maps case_device_id -> device_id and diagnosed_by -> performed_by', () => {
    const insert = toDeviceDiagnosticsInsert(sample);
    expect(insert.device_id).toBe('dev-1');
    expect(insert.performed_by).toBe('user-9');
  });

  it('falls back to the passed performedBy when diagnosed_by is absent', () => {
    const insert = toDeviceDiagnosticsInsert({ ...sample, diagnosed_by: undefined }, 'auth-7');
    expect(insert.performed_by).toBe('auth-7');
  });

  it('packs every key the report reader consumes, under the exact same name', () => {
    const result = toDeviceDiagnosticsInsert(sample).result as Record<string, unknown>;
    for (const key of REPORT_READER_KEYS) {
      expect(result[key]).toBe(sample[key as keyof DeviceDiagnostics]);
    }
  });

  it('omits undefined fields from result (no null-key noise)', () => {
    const sparse = toDeviceDiagnosticsInsert({ case_device_id: 'd', device_type_category: 'ssd' });
    const result = sparse.result as Record<string, unknown>;
    expect('heads_status' in result).toBe(false);
    expect(result.device_type_category).toBe('ssd');
  });

  it('never emits diagnosed_by or diagnostic_date as columns (they do not exist on the table)', () => {
    const insert = toDeviceDiagnosticsInsert(sample);
    expect('diagnosed_by' in insert).toBe(false);
    expect('diagnostic_date' in insert).toBe(false);
  });
});

describe('toDeviceDiagnosticsUpdate', () => {
  it('produces only real columns and re-packs result', () => {
    const update = toDeviceDiagnosticsUpdate({ case_device_id: 'dev-2', pcb_status: 'replacement' }, 'auth-3');
    for (const key of Object.keys(update)) {
      expect(REAL_COLUMNS).toContain(key);
    }
    expect(update.device_id).toBe('dev-2');
    expect((update.result as Record<string, unknown>).pcb_status).toBe('replacement');
  });
});

describe('fromDeviceDiagnosticsRow', () => {
  it('round-trips structured fields back out of result jsonb', () => {
    const insert = toDeviceDiagnosticsInsert(sample);
    const row: DiagnosticsRow = {
      id: 'r1',
      device_id: 'dev-1',
      diagnostic_type: 'device_inspection',
      tool_used: null,
      notes: null,
      performed_by: 'user-9',
      result: insert.result ?? {},
      tenant_id: 't1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      deleted_at: null,
    };
    const back = fromDeviceDiagnosticsRow(row);
    expect(back.case_device_id).toBe('dev-1');
    expect(back.device_type_category).toBe('hdd');
    expect(back.heads_status).toBe('bad');
    expect(back.technical_notes).toBe('donor needed');
    expect(back.diagnosed_by).toBe('user-9');
  });

  it('tolerates an empty/absent result jsonb', () => {
    const row = {
      id: 'r2',
      device_id: 'dev-3',
      diagnostic_type: null,
      tool_used: null,
      notes: null,
      performed_by: null,
      result: {},
      tenant_id: 't1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      deleted_at: null,
    } as DiagnosticsRow;
    const back = fromDeviceDiagnosticsRow(row);
    expect(back.case_device_id).toBe('dev-3');
    expect(back.device_type_category).toBe('other');
    expect(back.heads_status).toBeUndefined();
  });
});
