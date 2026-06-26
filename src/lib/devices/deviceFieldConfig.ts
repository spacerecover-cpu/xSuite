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

export const DIAGNOSTIC_FIELDS: DeviceFieldDef[] = [
  { key: 'device_problem', labelKey: 'devices.field.device_problem', labelFallback: 'Device Problem',
    control: 'select', storage: col('symptoms'), optionsSource: 'service_problems' },
  { key: 'symptoms_detail', labelKey: 'devices.field.symptoms_detail', labelFallback: 'Symptoms',
    control: 'textarea', storage: dj('symptoms'), colSpan: 2 },
  { key: 'recovery_requirement', labelKey: 'devices.field.recovery_requirement', labelFallback: 'Recovery Requirement',
    control: 'textarea', storage: col('notes'), colSpan: 2 },
  { key: 'initial_diagnosis', labelKey: 'devices.field.initial_diagnosis', labelFallback: 'Initial Diagnosis',
    control: 'textarea', storage: col('diagnosis'), colSpan: 2 },
  { key: 'evaluation_result', labelKey: 'devices.field.evaluation_result', labelFallback: 'Evaluation Result',
    control: 'text', storage: col('recovery_result') },
  { key: 'diagnostic_status', labelKey: 'devices.field.diagnostic_status', labelFallback: 'Diagnostic Status',
    control: 'select', storage: dj('diagnostic_status'),
    staticOptions: opt('Pending', 'In Progress', 'Completed', 'Inconclusive') },
  { key: 'recovery_chance', labelKey: 'devices.field.recovery_chance', labelFallback: 'Estimated Recovery Chance',
    control: 'select', storage: dj('recovery_chance'),
    staticOptions: opt('High', 'Medium', 'Low', 'None') },
  { key: 'diagnostic_notes', labelKey: 'devices.field.diagnostic_notes', labelFallback: 'Diagnostic Notes',
    control: 'textarea', storage: dj('diagnostic_notes'), colSpan: 3 },
];

// --- Basic (shared, always visible) -----------------------------------------
export const BASIC_FIELDS: DeviceFieldDef[] = [
  fk('device_type_id', 'device_type_id', 'Device Type', 'device_types', { required: true }),
  fk('brand_id', 'brand_id', 'Brand', 'brands'),
  text('model', col('model'), 'Model'),
  text('serial_number', col('serial_number'), 'Serial Number'),
  fk('capacity_id', 'capacity_id', 'Capacity / Storage', 'capacities'),
  fk('condition_id', 'condition_id', 'Condition', 'conditions'),
  { key: 'accessories', labelKey: 'devices.field.accessories', labelFallback: 'Accessories',
    control: 'multiselect', storage: col('accessories'), optionsSource: 'accessories', colSpan: 2 },
];

// Reusable technical fields ---------------------------------------------------
const F = {
  pcb: text('pcb_number', col('pcb_number'), 'PCB Number'),
  iface: fk('interface_id', 'interface_id', 'Interface', 'interfaces'),
  madeIn: fk('made_in_id', 'made_in_id', 'Made In', 'made_in'),
  dom: date('dom', col('dom'), 'Date of Manufacture (DOM)'),
  partNumber: text('part_number', col('part_number'), 'Part Number (P/N)'),
  dcm: text('dcm', col('dcm'), 'DCM'),
  firmware: text('firmware_version', col('firmware_version'), 'Firmware', { legacyResultKey: 'firmware_version' }),
  encryption: fk('encryption_id', 'encryption_id', 'Encryption', 'encryption'),
  platters: fk('platter_count_id', 'platter_count_id', 'Number of Platters', 'platter_counts'),
  heads: fk('head_count_id', 'head_count_id', 'Number of Heads', 'head_counts'),
  headMap: text('physical_head_map', tj('physical_head_map'), 'Physical Head Map', { legacyResultKey: 'head_map', colSpan: 2 }),
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
    technical: [F.pcb, F.iface, F.madeIn, F.dom, F.partNumber, F.dcm, F.firmware, F.encryption, F.platters, F.heads, F.headMap, F.preAmp],
    components: [comp('heads', 'Heads'), comp('pcb', 'PCB'), comp('motor', 'Motor'), comp('preamp', 'Pre-Amp'), comp('surface', 'Read/Write Surface'), comp('service_area', 'Service Area (SA)')],
  },
  ssd: {
    technical: [F.controller, F.firmware, F.dom, F.madeIn, F.iface, F.pcb, F.encryption, F.chipset],
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
    technical: [F.iface, F.madeIn, F.firmware, F.encryption, F.fileSystem],
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
