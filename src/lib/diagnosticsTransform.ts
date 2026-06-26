import type { Database, Json } from '../types/database.types';

/** Per-component diagnostic metadata captured on the Components tab. */
export interface ComponentMeta {
  notes?: string;
  test_method?: string;
  result?: string;
  tested_at?: string;
  findings?: string[];
}

/**
 * Rich inspection/diagnosis shape used by the UI. Only `device_id`,
 * `performed_by`, `diagnostic_type`, `tool_used` and `notes` are real columns on
 * `device_diagnostics`; every other field lives inside the `result` jsonb column.
 * The component-level fields must use the exact names the report reader pulls
 * back out (see src/lib/reportPDFService.ts mapDiagnosticsRow).
 */
export interface DeviceDiagnostics {
  id?: string;
  case_device_id: string;
  device_type_category: 'hdd' | 'ssd' | 'hybrid' | 'other';
  diagnostic_date?: string;
  diagnosed_by?: string;

  heads_status?: string;
  head_map?: Json;
  pcb_status?: string;
  pcb_notes?: string;
  motor_status?: string;
  surface_status?: string;
  preamp_status?: string;
  service_area_status?: string;
  storage_chip_status?: string;
  sa_access?: boolean;
  platter_condition?: string;

  controller_status?: string;
  controller_model?: string;
  memory_chips_status?: string;
  nand_type?: string;
  firmware_corruption?: boolean;
  trim_support?: boolean;
  wear_leveling_count?: number;

  firmware_version?: string;
  rom_version?: string;
  smart_data?: Json;
  imaging_stats?: Json;

  physical_damage_notes?: string;
  technical_notes?: string;

  symptoms?: string;
  diagnostic_status?: string;
  recovery_chance?: string;
  diagnostic_notes?: string;

  // Diagnostic-tab inputs (all stored in `result` jsonb — additive, no migration).
  failure_type?: string;
  severity?: string;
  symptoms_list?: string[];
  next_step?: string;
  tools_software?: string;
  engineer_id?: string;
  est_time?: string;
  recommendation?: string;

  // Per-component metadata keyed by componentKey (heads, pcb, …).
  component_meta?: Record<string, ComponentMeta>;

  created_at?: string;
  updated_at?: string;
}

type DiagnosticsRow = Database['public']['Tables']['device_diagnostics']['Row'];
type DiagnosticsInsert = Database['public']['Tables']['device_diagnostics']['Insert'];
type DiagnosticsUpdate = Database['public']['Tables']['device_diagnostics']['Update'];

// Every DeviceDiagnostics field that is stored inside the `result` jsonb column
// rather than as its own table column. Names match the report reader exactly.
const RESULT_FIELDS = [
  'device_type_category',
  'heads_status',
  'head_map',
  'pcb_status',
  'pcb_notes',
  'motor_status',
  'surface_status',
  'preamp_status',
  'service_area_status',
  'storage_chip_status',
  'sa_access',
  'platter_condition',
  'controller_status',
  'controller_model',
  'memory_chips_status',
  'nand_type',
  'firmware_corruption',
  'trim_support',
  'wear_leveling_count',
  'firmware_version',
  'rom_version',
  'smart_data',
  'imaging_stats',
  'physical_damage_notes',
  'technical_notes',
  'symptoms',
  'diagnostic_status',
  'recovery_chance',
  'diagnostic_notes',
  'failure_type',
  'severity',
  'symptoms_list',
  'next_step',
  'tools_software',
  'engineer_id',
  'est_time',
  'recommendation',
  'component_meta',
] as const;

/** Collect the non-column inspection fields into the `result` jsonb payload. */
export function packDiagnosticsResult(d: Partial<DeviceDiagnostics>): Record<string, Json> {
  const result: Record<string, Json> = {};
  for (const key of RESULT_FIELDS) {
    const value = d[key];
    if (value !== undefined) {
      result[key] = value as Json;
    }
  }
  return result;
}

/** Build a type-checked INSERT payload. tenant_id is filled by the table trigger. */
export function toDeviceDiagnosticsInsert(d: DeviceDiagnostics, performedBy?: string): DiagnosticsInsert {
  return {
    device_id: d.case_device_id,
    diagnostic_type: 'device_inspection',
    performed_by: d.diagnosed_by ?? performedBy ?? null,
    result: packDiagnosticsResult(d),
    // set by the set_device_diagnostics_tenant_and_audit trigger
    tenant_id: undefined as unknown as string,
  };
}

/** Build a type-checked UPDATE payload, re-packing the result jsonb. */
export function toDeviceDiagnosticsUpdate(d: Partial<DeviceDiagnostics>, performedBy?: string): DiagnosticsUpdate {
  const payload: DiagnosticsUpdate = {
    result: packDiagnosticsResult(d),
  };
  if (d.case_device_id !== undefined) {
    payload.device_id = d.case_device_id;
  }
  const resolvedPerformer = d.diagnosed_by ?? performedBy;
  if (resolvedPerformer !== undefined) {
    payload.performed_by = resolvedPerformer;
  }
  return payload;
}

function asJsonObject(value: Json | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Flatten a stored row back into the rich DeviceDiagnostics shape the UI uses. */
export function fromDeviceDiagnosticsRow(row: DiagnosticsRow): DeviceDiagnostics {
  const result = asJsonObject(row.result);
  const out: DeviceDiagnostics = {
    id: row.id,
    case_device_id: row.device_id ?? '',
    device_type_category: 'other',
    diagnosed_by: row.performed_by ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  for (const key of RESULT_FIELDS) {
    if (result[key] !== undefined) {
      (out as unknown as Record<string, unknown>)[key] = result[key];
    }
  }
  return out;
}
