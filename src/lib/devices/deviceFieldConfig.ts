// src/lib/devices/deviceFieldConfig.ts
import type { DeviceFamily } from './deviceFamily';

export type FieldControl =
  | 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'textarea' | 'component-status';

export type CatalogKey =
  | 'device_types' | 'brands' | 'capacities' | 'conditions' | 'accessories'
  | 'encryption' | 'interfaces' | 'made_in' | 'head_counts' | 'platter_counts'
  | 'component_statuses' | 'service_problems';

export type FieldStorage =
  | { table: 'case_devices'; kind: 'column'; column: string }
  | { table: 'case_devices'; kind: 'json'; jsonKey: string }            // → technical_details
  | { table: 'device_diagnostics'; kind: 'json'; jsonKey: string };     // → result

export interface DeviceFieldDef {
  key: string;
  labelKey: string;
  labelFallback: string;
  control: FieldControl;
  storage: FieldStorage;
  optionsSource?: CatalogKey;
  staticOptions?: { id: string; name: string }[];
  componentKey?: string;          // for control:'component-status'
  colSpan?: 1 | 2 | 3;
  required?: boolean;
  /** Load-only fallback: read this device_diagnostics.result key if the primary store is empty. */
  legacyResultKey?: string;
}

// --- helpers to keep the registry terse -------------------------------------
const col = (column: string): FieldStorage => ({ table: 'case_devices', kind: 'column', column });
const tj = (jsonKey: string): FieldStorage => ({ table: 'case_devices', kind: 'json', jsonKey });
const dj = (jsonKey: string): FieldStorage => ({ table: 'device_diagnostics', kind: 'json', jsonKey });

// Field builders (explicit; no clever currying that obscures types):
function fk(key: string, column: string, label: string, src: CatalogKey, opts: Partial<DeviceFieldDef> = {}): DeviceFieldDef {
  return { key, labelKey: `devices.field.${key}`, labelFallback: label, control: 'select', storage: col(column), optionsSource: src, ...opts };
}
function text(key: string, store: FieldStorage, label: string, opts: Partial<DeviceFieldDef> = {}): DeviceFieldDef {
  return { key, labelKey: `devices.field.${key}`, labelFallback: label, control: 'text', storage: store, ...opts };
}
function num(key: string, store: FieldStorage, label: string, opts: Partial<DeviceFieldDef> = {}): DeviceFieldDef {
  return { key, labelKey: `devices.field.${key}`, labelFallback: label, control: 'number', storage: store, ...opts };
}
function date(key: string, store: FieldStorage, label: string, opts: Partial<DeviceFieldDef> = {}): DeviceFieldDef {
  return { key, labelKey: `devices.field.${key}`, labelFallback: label, control: 'date', storage: store, ...opts };
}
function comp(componentKey: string, label: string): DeviceFieldDef {
  return {
    key: `${componentKey}_status`, labelKey: `devices.component.${componentKey}`, labelFallback: label,
    control: 'component-status', storage: dj(`${componentKey}_status`), optionsSource: 'component_statuses', componentKey,
  };
}

const opt = (...names: string[]) => names.map(n => ({ id: n, name: n }));

// Static option sets for the Diagnostic tab — exported so the bespoke
// DeviceDiagnosticForm renders the same vocabulary that the field defs persist.
// The four diagnostic-status stages drive the sidebar status stepper.
export const FAILURE_TYPE_OPTIONS = opt('Logical', 'Physical', 'Electronic', 'Firmware');
export const SEVERITY_OPTIONS = opt('Low', 'Medium', 'High', 'Critical');
export const DIAGNOSTIC_STATUS_OPTIONS = opt('Received', 'Under Diagnosis', 'Evaluation', 'Completed');
export const NEXT_STEP_OPTIONS = opt('Surface Scan', 'Imaging', 'Head Swap', 'PCB Repair', 'Firmware Repair', 'Donor Required', 'Cleanroom');
export const TOOLS_SOFTWARE_OPTIONS = opt('PC-3000 Express', 'PC-3000 SSD', 'DeepSpar DDI', 'ddrescue', 'R-Studio', 'Atola');
export const EVALUATION_RESULT_OPTIONS = opt('Pending', 'Recoverable', 'Partially Recoverable', 'Unrecoverable');
export const RECOVERY_CHANCE_OPTIONS = opt('High', 'Medium', 'Low', 'None');
export const RECOMMENDATION_OPTIONS = opt('Attempt Recovery', 'Quote Required', 'Return Device', 'Unrecoverable', 'Awaiting Approval');

// Diagnostic fields stay the storage source of truth (serialize/hydrate walk
// these defs). Every new key below stores into device_diagnostics.result jsonb
// (additive — no migration). `symptoms` (string) is the report-read notes field;
// the multi-chip symptom list uses a distinct `symptoms_list` key.
export const DIAGNOSTIC_FIELDS: DeviceFieldDef[] = [
  { key: 'device_problem', labelKey: 'devices.field.device_problem', labelFallback: 'Device Problem',
    control: 'select', storage: col('symptoms'), optionsSource: 'service_problems', required: true },
  { key: 'failure_type', labelKey: 'devices.field.failure_type', labelFallback: 'Failure Type',
    control: 'select', storage: dj('failure_type'), staticOptions: FAILURE_TYPE_OPTIONS },
  { key: 'severity', labelKey: 'devices.field.severity', labelFallback: 'Severity',
    control: 'select', storage: dj('severity'), staticOptions: SEVERITY_OPTIONS },
  { key: 'symptoms_list', labelKey: 'devices.field.symptoms_list', labelFallback: 'Symptoms',
    control: 'multiselect', storage: dj('symptoms_list') },
  { key: 'symptoms_detail', labelKey: 'devices.field.symptoms_detail', labelFallback: 'Notes / Symptoms',
    control: 'textarea', storage: dj('symptoms') },
  { key: 'initial_diagnosis', labelKey: 'devices.field.initial_diagnosis', labelFallback: 'Initial Diagnosis',
    control: 'textarea', storage: col('diagnosis') },
  { key: 'diagnostic_status', labelKey: 'devices.field.diagnostic_status', labelFallback: 'Current Status',
    control: 'select', storage: dj('diagnostic_status'), staticOptions: DIAGNOSTIC_STATUS_OPTIONS },
  { key: 'next_step', labelKey: 'devices.field.next_step', labelFallback: 'Next Step',
    control: 'select', storage: dj('next_step'), staticOptions: NEXT_STEP_OPTIONS },
  { key: 'tools_software', labelKey: 'devices.field.tools_software', labelFallback: 'Tools / Software',
    control: 'select', storage: dj('tools_software'), staticOptions: TOOLS_SOFTWARE_OPTIONS },
  { key: 'engineer_id', labelKey: 'devices.field.engineer', labelFallback: 'Engineer',
    control: 'select', storage: dj('engineer_id') },
  { key: 'est_time', labelKey: 'devices.field.est_time', labelFallback: 'Est. Time',
    control: 'text', storage: dj('est_time') },
  { key: 'evaluation_result', labelKey: 'devices.field.evaluation_result', labelFallback: 'Evaluation Result',
    control: 'select', storage: col('recovery_result'), staticOptions: EVALUATION_RESULT_OPTIONS },
  { key: 'recovery_chance', labelKey: 'devices.field.recovery_chance', labelFallback: 'Recovery Chance',
    control: 'select', storage: dj('recovery_chance'), staticOptions: RECOVERY_CHANCE_OPTIONS },
  { key: 'recommendation', labelKey: 'devices.field.recommendation', labelFallback: 'Recommendation',
    control: 'select', storage: dj('recommendation'), staticOptions: RECOMMENDATION_OPTIONS },
  { key: 'diagnostic_notes', labelKey: 'devices.field.diagnostic_notes', labelFallback: 'Engineer Notes',
    control: 'textarea', storage: dj('diagnostic_notes'), colSpan: 3 },
];

// --- Basic (shared, always visible) -----------------------------------------
// Interface lives here (single source of truth). It is intentionally NOT also
// listed in any family `technical` array — the form must never render Interface
// twice (no "Interface" + "Interface Type" duplication).
export const BASIC_FIELDS: DeviceFieldDef[] = [
  fk('device_type_id', 'device_type_id', 'Device Type', 'device_types', { required: true }),
  fk('brand_id', 'brand_id', 'Brand', 'brands'),
  text('model', col('model'), 'Model'),
  text('serial_number', col('serial_number'), 'Serial Number'),
  fk('capacity_id', 'capacity_id', 'Capacity / Storage', 'capacities'),
  fk('interface_id', 'interface_id', 'Interface', 'interfaces'),
  fk('condition_id', 'condition_id', 'Condition', 'conditions'),
  { key: 'accessories', labelKey: 'devices.field.accessories', labelFallback: 'Accessories',
    control: 'multiselect', storage: col('accessories'), optionsSource: 'accessories' },
];

// Reusable technical fields ---------------------------------------------------
const F = {
  pcb: text('pcb_number', col('pcb_number'), 'PCB Number'),
  madeIn: fk('made_in_id', 'made_in_id', 'Made In', 'made_in'),
  dom: date('dom', col('dom'), 'Date of Manufacture (DOM)'),
  partNumber: text('part_number', col('part_number'), 'Part Number (P/N)'),
  dcm: text('dcm', col('dcm'), 'DCM'),
  firmware: text('firmware_version', col('firmware_version'), 'Firmware', { legacyResultKey: 'firmware_version' }),
  encryption: fk('encryption_id', 'encryption_id', 'Encryption', 'encryption'),
  platters: fk('platter_count_id', 'platter_count_id', 'Number of Platters', 'platter_counts'),
  heads: fk('head_count_id', 'head_count_id', 'Number of Heads', 'head_counts'),
  headMap: text('physical_head_map', tj('physical_head_map'), 'Physical Head Map', { legacyResultKey: 'head_map' }),
  preAmp: text('pre_amp', tj('pre_amp'), 'Pre-Amplifier'),
  controller: text('controller', tj('controller'), 'Controller', { legacyResultKey: 'controller_model' }),
  chipset: text('chipset', tj('chipset'), 'Chipset'),
  imei: text('imei', tj('imei'), 'IMEI'),
  os: text('os', tj('os'), 'Operating System'),
  raidLevel: text('raid_level', tj('raid_level'), 'RAID Level'),
  numDrives: num('num_drives', tj('num_drives'), 'Number of Drives'),
  fileSystem: text('file_system', tj('file_system'), 'File System'),
};

const REGISTRY: Record<DeviceFamily, { technical: DeviceFieldDef[]; components: DeviceFieldDef[] }> = {
  hdd: {
    technical: [F.pcb, F.firmware, F.partNumber, F.madeIn, F.dom, F.dcm, F.encryption, F.platters, F.heads, F.headMap, F.preAmp],
    components: [comp('heads', 'Heads'), comp('pcb', 'PCB'), comp('motor', 'Motor'), comp('preamp', 'Pre-Amp'), comp('surface', 'Read/Write Surface'), comp('service_area', 'Service Area (SA)')],
  },
  ssd: {
    technical: [F.controller, F.firmware, F.dom, F.madeIn, F.pcb, F.encryption, F.chipset],
    components: [comp('controller', 'Controller'), comp('memory_chips', 'NAND / Memory Chips'), comp('pcb', 'PCB')],
  },
  usb_flash: {
    technical: [F.controller, F.firmware, F.partNumber],
    components: [comp('controller', 'Controller'), comp('memory_chips', 'NAND / Memory Chips'), comp('pcb', 'PCB')],
  },
  memory_card: {
    technical: [F.controller, F.firmware, F.partNumber],
    components: [comp('controller', 'Controller'), comp('memory_chips', 'NAND / Memory Chips'), comp('pcb', 'PCB')],
  },
  mobile: {
    technical: [F.encryption, F.chipset, F.imei, F.os],
    components: [comp('pcb', 'Board / PCB'), comp('storage_chip', 'Storage Chip')],
  },
  raid: {
    technical: [F.raidLevel, F.numDrives, F.controller, F.fileSystem, F.firmware],
    components: [comp('controller', 'Controller'),
      { key: 'technical_notes', labelKey: 'devices.field.technical_notes', labelFallback: 'Member Drive Notes', control: 'textarea', storage: dj('technical_notes'), colSpan: 2 }],
  },
  nas: {
    technical: [F.raidLevel, F.numDrives, F.os, F.fileSystem, F.firmware],
    components: [comp('controller', 'Controller'),
      { key: 'technical_notes', labelKey: 'devices.field.technical_notes', labelFallback: 'Member Drive Notes', control: 'textarea', storage: dj('technical_notes'), colSpan: 2 }],
  },
  other: {
    technical: [F.madeIn, F.firmware, F.encryption, F.fileSystem],
    components: [],
  },
};

export interface DeviceFamilyConfig {
  family: DeviceFamily;
  technical: DeviceFieldDef[];
  components: DeviceFieldDef[];
}

export function getDeviceFamilyConfig(family: DeviceFamily): DeviceFamilyConfig {
  const entry = REGISTRY[family] ?? REGISTRY.other;
  return { family, technical: entry.technical, components: entry.components };
}

/** Every field across Basic + all families, deduped by key — drives serialization. */
export const ALL_FIELD_DEFS: DeviceFieldDef[] = (() => {
  const seen = new Map<string, DeviceFieldDef>();
  const push = (f: DeviceFieldDef) => { if (!seen.has(f.key)) seen.set(f.key, f); };
  BASIC_FIELDS.forEach(push);
  DIAGNOSTIC_FIELDS.forEach(push);
  (Object.keys(REGISTRY) as DeviceFamily[]).forEach(fam => {
    REGISTRY[fam].technical.forEach(push);
    REGISTRY[fam].components.forEach(push);
  });
  return [...seen.values()];
})();
