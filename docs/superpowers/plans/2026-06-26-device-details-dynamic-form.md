# Dynamic Device Details Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `DeviceFormModal` body with a configuration-driven, per-device-family dynamic form (Basic / Technical / Component Diagnostics) for the technician Edit/Add Device surface, leaving the Create-Case wizard untouched.

**Architecture:** A TypeScript field-config registry keyed by 8 device families (resolved from the catalog type name) declares each field's label, control, and storage target. A single generic renderer maps configs → existing UI primitives. Pure hydrate/serialize/validate functions move form state to/from `case_devices` columns, a new `case_devices.technical_details` jsonb, and the existing `device_diagnostics.result` jsonb (via the existing typed diagnostics service). One additive migration adds `dom`, `part_number`, `dcm`, `technical_details`.

**Tech Stack:** React 19 + TypeScript + Vite + TanStack Query v5 + Supabase + Tailwind v3.4 (semantic tokens) + react-i18next + vitest/jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-26-device-details-dynamic-form-design.md`

## Global Constraints

- **Branch:** `feat/device-details-dynamic-form` (local only). **NEVER `git push` / open a PR** — the user does one manual push at the very end. Local commits per task are expected.
- **tsc baseline = 0 errors.** `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) must stay green; it is a CI gate.
- **Tests:** `npm test` = `vitest run`. Co-locate tests next to source: `*.test.ts` (node project) for pure logic, `*.test.tsx` (dom/jsdom project) for components. i18n is globally initialized via `src/test/setup.ts` — no provider wrapper needed; `t(key, { defaultValue })` resolves to the fallback.
- **Theming (DESIGN.md):** semantic tokens only. No raw hex; no `purple-*`/`indigo-*`/`violet-*`; no raw color in inline `style`. Labels `text-sm font-medium text-slate-700`, required `text-danger`, input border `border-slate-300`/error `border-danger`, focus `ring-ring`, surfaces `bg-surface`/`bg-surface-muted`/`border-border`. lucide icons only. `DM Sans` (`font-body`). Tailwind v3.4 — do not upgrade.
- **Types:** import `Database` from `src/types/database.types.ts` only; never hand-edit it (regenerate). Use `maybeSingle()` not `single()`.
- **DB writes:** soft-delete only (`deleted_at`), never hard delete. Applying the migration to the live DB (`ssmbegiyjivrcwgcqutu`) requires explicit user go-ahead (see Task 1).
- **Frozen — do not edit:** `src/components/cases/CreateCaseWizard.tsx`, `src/components/cases/ServerBulkDrivesModal.tsx`.
- **Preserve existing behavior in `DeviceFormModal`:** device-role gate, donor-from-inventory sourcing, `setPrimaryDevice` RPC, `is_primary`, `password`, `role_notes`, `symptoms` ("Device Problem"), `notes` ("Recovery Requirements"), soft-delete.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/lib/devices/deviceFamily.ts` | Create | `DeviceFamily` type + `resolveDeviceFamily(typeName)` (8 families). |
| `src/lib/devices/deviceFamily.test.ts` | Create | Resolver tests (18 catalog names + unknown). |
| `src/lib/devices/deviceFieldConfig.ts` | Create | Field-def types, `CatalogKey`, `BASIC_FIELDS`, per-family registry, `getDeviceFamilyConfig`, `ALL_FIELD_DEFS`. |
| `src/lib/devices/deviceFieldConfig.test.ts` | Create | Config-integrity tests. |
| `src/lib/devices/deviceCatalogQueries.ts` | Create | `CATALOG_SOURCES` (CatalogKey→table/select) + `useDeviceFormCatalogs()` hook. |
| `src/lib/devices/deviceCatalogQueries.test.ts` | Create | Source-coverage test. |
| `src/lib/devices/deviceFormSerialization.ts` | Create | `hydrateDeviceForm`, `serializeDeviceForm`, `validateDeviceForm`. |
| `src/lib/devices/deviceFormSerialization.test.ts` | Create | Round-trip / merge / fallback / validation tests. |
| `src/components/cases/device-form/DeviceFieldRenderer.tsx` | Create | Single control switch → primitives. |
| `src/components/cases/device-form/DeviceFieldRenderer.test.tsx` | Create | Per-control render tests. |
| `src/components/cases/device-form/DeviceDetailsForm.tsx` | Create | 3 `CollapsibleSection`s; family resolution; grid layout. |
| `src/components/cases/device-form/DeviceDetailsForm.test.tsx` | Create | Family-driven visibility + hidden-state-retention tests. |
| `src/lib/diagnosticsTransform.ts` | Modify | Add 3 component keys to `DeviceDiagnostics` + `RESULT_FIELDS`. |
| `src/lib/queryKeys.ts` | Modify | Extend `masterDataKeys` with the new catalog keys. |
| `src/components/cases/DeviceFormModal.tsx` | Modify | Replace 3-col grid + diagnostics sub-form with `<DeviceDetailsForm>`; new save glue; remove patient-only gate. |
| `src/components/cases/detail/CaseDevicesTab.tsx` | Modify | Fix `CreditCard as Edit` → real edit icon. |
| `src/types/database.types.ts` | Modify (regen) | Regenerated after the migration. |

---

## Task 1: Additive migration + types regen

**Files:**
- Migration (live DB via `mcp__supabase__apply_migration`, name `add_case_devices_technical_fields`)
- Modify (regen): `src/types/database.types.ts`

**Interfaces:**
- Produces: `case_devices.dom: string | null`, `case_devices.part_number: string | null`, `case_devices.dcm: string | null`, `case_devices.technical_details: Json` (default `{}`) in the regenerated `Database` type.

> ⚠️ **Live-DB gate:** Applying to `ssmbegiyjivrcwgcqutu` mutates the production database. **Confirm with the user before this step.** It is additive/nullable → zero data-migration risk (verified: all four targets are empty/new), but it is still a production change.

- [ ] **Step 1: Apply the migration** (after user go-ahead)

`mcp__supabase__apply_migration`, `project_id: ssmbegiyjivrcwgcqutu`, name `add_case_devices_technical_fields`:

```sql
ALTER TABLE case_devices
  ADD COLUMN IF NOT EXISTS dom date,
  ADD COLUMN IF NOT EXISTS part_number text,
  ADD COLUMN IF NOT EXISTS dcm text,
  ADD COLUMN IF NOT EXISTS technical_details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN case_devices.dom IS 'Date of manufacture (device spec sheet).';
COMMENT ON COLUMN case_devices.part_number IS 'Manufacturer part number / P/N (donor-matching key).';
COMMENT ON COLUMN case_devices.dcm IS 'Drive Configuration Module / DCM code (donor-matching key).';
COMMENT ON COLUMN case_devices.technical_details IS 'Dynamic per-device-type technical fields (config-driven device form, 2026-06-26).';
```

- [ ] **Step 2: Verify columns exist**

`mcp__supabase__execute_sql`:
```sql
select column_name, data_type, column_default from information_schema.columns
where table_schema='public' and table_name='case_devices'
  and column_name in ('dom','part_number','dcm','technical_details') order by column_name;
```
Expected: 4 rows — `dcm/text`, `dom/date`, `part_number/text`, `technical_details/jsonb` (default `'{}'::jsonb`).

- [ ] **Step 3: Regenerate types**

`mcp__supabase__generate_typescript_types` (`project_id: ssmbegiyjivrcwgcqutu`) → overwrite `src/types/database.types.ts`.

- [ ] **Step 4: Confirm regen + typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors). Confirm `case_devices.Row` now contains `dom`, `part_number`, `dcm`, `technical_details`.

- [ ] **Step 5: Update the migration manifest**

Add the migration entry to the repo's migration manifest per the convention used by `scripts/check-schema-drift.sh` / `.github/PULL_REQUEST_TEMPLATE/migration.md` (match the format of the most recent entry).

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts
git add -A  # manifest file
git commit -m "feat(db): add case_devices dom/part_number/dcm/technical_details (device-details form)"
```

---

## Task 2: Device family resolver

**Files:**
- Create: `src/lib/devices/deviceFamily.ts`
- Test: `src/lib/devices/deviceFamily.test.ts`

**Interfaces:**
- Produces: `type DeviceFamily = 'hdd'|'ssd'|'usb_flash'|'memory_card'|'mobile'|'raid'|'nas'|'other'`; `resolveDeviceFamily(typeName: string | null | undefined): DeviceFamily`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/devices/deviceFamily.test.ts
import { describe, it, expect } from 'vitest';
import { resolveDeviceFamily } from './deviceFamily';

describe('resolveDeviceFamily', () => {
  const cases: Array<[string, string]> = [
    ['2.5" HDD', 'hdd'], ['3.5" HDD', 'hdd'], ['Hybrid Drive', 'hdd'],
    ['2.5" SSD', 'ssd'], ['M.2 SSD', 'ssd'], ['NVMe SSD', 'ssd'], ['SSD External', 'ssd'],
    ['USB Drive', 'usb_flash'], ['Memory Stick', 'usb_flash'],
    ['SD Card', 'memory_card'], ['MicroSD Card', 'memory_card'], ['CF Card', 'memory_card'],
    ['Mobile Phone', 'mobile'], ['Tablet', 'mobile'],
    ['RAID Array', 'raid'], ['Server', 'raid'],
    ['NAS Device', 'nas'],
    ['DVR/Camera', 'other'],
  ];
  it.each(cases)('maps %s -> %s', (name, family) => {
    expect(resolveDeviceFamily(name)).toBe(family);
  });
  it('defaults unknown/empty to other', () => {
    expect(resolveDeviceFamily('Smart Fridge')).toBe('other');
    expect(resolveDeviceFamily('')).toBe('other');
    expect(resolveDeviceFamily(null)).toBe('other');
  });
  it('is case/spacing tolerant', () => {
    expect(resolveDeviceFamily('  nvme ssd ')).toBe('ssd');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- deviceFamily`
Expected: FAIL ("resolveDeviceFamily is not a function" / module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/devices/deviceFamily.ts
export type DeviceFamily =
  | 'hdd' | 'ssd' | 'usb_flash' | 'memory_card' | 'mobile' | 'raid' | 'nas' | 'other';

/** Explicit map from the live catalog_device_types names → family. */
const EXPLICIT: Record<string, DeviceFamily> = {
  '2.5" hdd': 'hdd', '3.5" hdd': 'hdd', 'hybrid drive': 'hdd',
  '2.5" ssd': 'ssd', 'm.2 ssd': 'ssd', 'nvme ssd': 'ssd', 'ssd external': 'ssd',
  'usb drive': 'usb_flash', 'memory stick': 'usb_flash',
  'sd card': 'memory_card', 'microsd card': 'memory_card', 'cf card': 'memory_card',
  'mobile phone': 'mobile', 'tablet': 'mobile',
  'raid array': 'raid', 'server': 'raid',
  'nas device': 'nas',
  'dvr/camera': 'other',
};

/** Substring fallback for catalog rows added later that are not in EXPLICIT. */
function heuristic(name: string): DeviceFamily {
  if (/\bnas\b/.test(name)) return 'nas';
  if (/raid|server/.test(name)) return 'raid';
  if (/phone|tablet|mobile/.test(name)) return 'mobile';
  if (/sd card|microsd|cf card|memory card/.test(name)) return 'memory_card';
  if (/usb|flash|memory stick|thumb/.test(name)) return 'usb_flash';
  if (/ssd|nvme|m\.2|solid state/.test(name)) return 'ssd';
  if (/hdd|hard|mechanical|hybrid|sshd/.test(name)) return 'hdd';
  return 'other';
}

export function resolveDeviceFamily(typeName: string | null | undefined): DeviceFamily {
  const key = (typeName ?? '').trim().toLowerCase();
  if (!key) return 'other';
  return EXPLICIT[key] ?? heuristic(key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- deviceFamily`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/devices/deviceFamily.ts src/lib/devices/deviceFamily.test.ts
git commit -m "feat(devices): device family resolver (8 families from catalog type name)"
```

---

## Task 3: Field-config registry

**Files:**
- Create: `src/lib/devices/deviceFieldConfig.ts`
- Test: `src/lib/devices/deviceFieldConfig.test.ts`

**Interfaces:**
- Consumes: `DeviceFamily` from `./deviceFamily`.
- Produces:
  - `type FieldControl = 'text'|'number'|'date'|'select'|'multiselect'|'textarea'|'component-status'`
  - `type CatalogKey = 'device_types'|'brands'|'capacities'|'conditions'|'accessories'|'encryption'|'interfaces'|'made_in'|'head_counts'|'platter_counts'|'component_statuses'`
  - `type FieldStorage` (discriminated union, below)
  - `interface DeviceFieldDef` (below)
  - `interface DeviceFamilyConfig { family: DeviceFamily; technical: DeviceFieldDef[]; components: DeviceFieldDef[] }`
  - `const BASIC_FIELDS: DeviceFieldDef[]`
  - `function getDeviceFamilyConfig(family: DeviceFamily): DeviceFamilyConfig`
  - `const ALL_FIELD_DEFS: DeviceFieldDef[]` (deduped by `key`, used by serialization)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/devices/deviceFieldConfig.test.ts
import { describe, it, expect } from 'vitest';
import {
  BASIC_FIELDS, getDeviceFamilyConfig, ALL_FIELD_DEFS, type DeviceFieldDef,
} from './deviceFieldConfig';

const FAMILIES = ['hdd','ssd','usb_flash','memory_card','mobile','raid','nas','other'] as const;

describe('deviceFieldConfig', () => {
  it('BASIC_FIELDS has the 7 basic fields', () => {
    expect(BASIC_FIELDS.map(f => f.key)).toEqual([
      'device_type_id','brand_id','model','serial_number','capacity_id','condition_id','accessories',
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

  it('select/multiselect/component-status fields declare an optionsSource', () => {
    const all = [...BASIC_FIELDS, ...FAMILIES.flatMap(f => {
      const c = getDeviceFamilyConfig(f); return [...c.technical, ...c.components];
    })];
    for (const f of all) {
      if (['select','multiselect','component-status'].includes(f.control)) {
        expect(f.optionsSource, `${f.key} needs optionsSource`).toBeTruthy();
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- deviceFieldConfig`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/devices/deviceFieldConfig.ts
import type { DeviceFamily } from './deviceFamily';

export type FieldControl =
  | 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'textarea' | 'component-status';

export type CatalogKey =
  | 'device_types' | 'brands' | 'capacities' | 'conditions' | 'accessories'
  | 'encryption' | 'interfaces' | 'made_in' | 'head_counts' | 'platter_counts'
  | 'component_statuses';

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
  componentKey?: string;          // for control:'component-status'
  colSpan?: 1 | 2;
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
  (Object.keys(REGISTRY) as DeviceFamily[]).forEach(fam => {
    REGISTRY[fam].technical.forEach(push);
    REGISTRY[fam].components.forEach(push);
  });
  return [...seen.values()];
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- deviceFieldConfig`
Expected: PASS (all integrity checks).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (remove any unused scaffolding the compiler flags).

- [ ] **Step 6: Commit**

```bash
git add src/lib/devices/deviceFieldConfig.ts src/lib/devices/deviceFieldConfig.test.ts
git commit -m "feat(devices): per-family field-config registry + storage map"
```

---

## Task 4: Catalog loaders

**Files:**
- Create: `src/lib/devices/deviceCatalogQueries.ts`
- Test: `src/lib/devices/deviceCatalogQueries.test.ts`
- Modify: `src/lib/queryKeys.ts`

**Interfaces:**
- Consumes: `CatalogKey` from `./deviceFieldConfig`.
- Produces:
  - `const CATALOG_SOURCES: Record<CatalogKey, { table: string; orderBy: string }>`
  - `interface CatalogOption { id: string; name: string }`
  - `function useDeviceFormCatalogs(): { options: Record<CatalogKey, CatalogOption[]>; isLoading: boolean }`

- [ ] **Step 1: Extend `masterDataKeys` in `src/lib/queryKeys.ts`**

Replace the existing `masterDataKeys` block (lines ~183–191) with:

```ts
export const masterDataKeys = {
  deviceTypes: () => ['master', 'device-types'] as const,
  deviceBrands: () => ['master', 'device-brands'] as const,
  deviceCapacities: () => ['master', 'device-capacities'] as const,
  deviceConditions: () => ['master', 'device-conditions'] as const,
  deviceAccessories: () => ['master', 'device-accessories'] as const,
  deviceEncryption: () => ['master', 'device-encryption'] as const,
  deviceInterfaces: () => ['master', 'device-interfaces'] as const,
  deviceMadeIn: () => ['master', 'device-made-in'] as const,
  deviceHeadCounts: () => ['master', 'device-head-counts'] as const,
  devicePlatterCounts: () => ['master', 'device-platter-counts'] as const,
  deviceComponentStatuses: () => ['master', 'device-component-statuses'] as const,
  countries: () => ['master', 'countries'] as const,
  currencies: () => ['master', 'currencies'] as const,
  services: () => ['master', 'services'] as const,
  storageLocations: () => ['master', 'storage-locations'] as const,
};
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/devices/deviceCatalogQueries.test.ts
import { describe, it, expect } from 'vitest';
import { CATALOG_SOURCES } from './deviceCatalogQueries';
import { BASIC_FIELDS, getDeviceFamilyConfig, type CatalogKey } from './deviceFieldConfig';

const FAMILIES = ['hdd','ssd','usb_flash','memory_card','mobile','raid','nas','other'] as const;

describe('CATALOG_SOURCES', () => {
  it('covers every optionsSource referenced by any field', () => {
    const used = new Set<CatalogKey>();
    const all = [...BASIC_FIELDS, ...FAMILIES.flatMap(f => {
      const c = getDeviceFamilyConfig(f); return [...c.technical, ...c.components];
    })];
    all.forEach(f => { if (f.optionsSource) used.add(f.optionsSource); });
    for (const key of used) {
      expect(CATALOG_SOURCES[key], `missing source for ${key}`).toBeTruthy();
      expect(typeof CATALOG_SOURCES[key].table).toBe('string');
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- deviceCatalogQueries`
Expected: FAIL (module not found).

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/devices/deviceCatalogQueries.ts
import { useQueries } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { masterDataKeys } from '../queryKeys';
import type { CatalogKey } from './deviceFieldConfig';

export interface CatalogOption { id: string; name: string }

export const CATALOG_SOURCES: Record<CatalogKey, { table: string; orderBy: string; queryKey: readonly unknown[] }> = {
  device_types:       { table: 'catalog_device_types',             orderBy: 'name',       queryKey: masterDataKeys.deviceTypes() },
  brands:             { table: 'catalog_device_brands',            orderBy: 'name',       queryKey: masterDataKeys.deviceBrands() },
  capacities:         { table: 'catalog_device_capacities',        orderBy: 'sort_order', queryKey: masterDataKeys.deviceCapacities() },
  conditions:         { table: 'catalog_device_conditions',        orderBy: 'name',       queryKey: masterDataKeys.deviceConditions() },
  accessories:        { table: 'catalog_accessories',              orderBy: 'name',       queryKey: masterDataKeys.deviceAccessories() },
  encryption:         { table: 'catalog_device_encryption',        orderBy: 'name',       queryKey: masterDataKeys.deviceEncryption() },
  interfaces:         { table: 'catalog_interfaces',               orderBy: 'sort_order', queryKey: masterDataKeys.deviceInterfaces() },
  made_in:            { table: 'catalog_device_made_in',           orderBy: 'name',       queryKey: masterDataKeys.deviceMadeIn() },
  head_counts:        { table: 'catalog_device_head_counts',       orderBy: 'sort_order', queryKey: masterDataKeys.deviceHeadCounts() },
  platter_counts:     { table: 'catalog_device_platter_counts',    orderBy: 'sort_order', queryKey: masterDataKeys.devicePlatterCounts() },
  component_statuses: { table: 'catalog_device_component_statuses', orderBy: 'sort_order', queryKey: masterDataKeys.deviceComponentStatuses() },
};

const KEYS = Object.keys(CATALOG_SOURCES) as CatalogKey[];

async function fetchCatalog(table: string, orderBy: string): Promise<CatalogOption[]> {
  const { data, error } = await supabase.from(table).select('id, name').eq('is_active', true).order(orderBy);
  if (error) throw error;
  return (data ?? []).map(r => ({ id: String((r as { id: string | number }).id), name: (r as { name: string }).name }));
}

export function useDeviceFormCatalogs(): { options: Record<CatalogKey, CatalogOption[]>; isLoading: boolean } {
  const results = useQueries({
    queries: KEYS.map(key => {
      const src = CATALOG_SOURCES[key];
      return { queryKey: src.queryKey, queryFn: () => fetchCatalog(src.table, src.orderBy), staleTime: 5 * 60 * 1000 };
    }),
  });
  const options = {} as Record<CatalogKey, CatalogOption[]>;
  KEYS.forEach((key, i) => { options[key] = (results[i].data as CatalogOption[]) ?? []; });
  return { options, isLoading: results.some(r => r.isLoading) };
}
```

> Note: all device catalogs use `is_active` (not `deleted_at`) — verified live. `catalog_interfaces` is the real FK target for `case_devices.interface_id` (NOT `catalog_device_interfaces`).

- [ ] **Step 5: Run test + typecheck**

Run: `npm test -- deviceCatalogQueries` → PASS.
Run: `npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/devices/deviceCatalogQueries.ts src/lib/devices/deviceCatalogQueries.test.ts src/lib/queryKeys.ts
git commit -m "feat(devices): centralized device-form catalog loaders (incl. interfaces/made_in/head/platter)"
```

---

## Task 5: Hydrate / serialize / validate

**Files:**
- Create: `src/lib/devices/deviceFormSerialization.ts`
- Test: `src/lib/devices/deviceFormSerialization.test.ts`

**Interfaces:**
- Consumes: `DeviceFieldDef`, `ALL_FIELD_DEFS` from `./deviceFieldConfig`.
- Produces:
  - `type DeviceFormState = Record<string, unknown>`
  - `interface LoadedDevice { device: Record<string, unknown>; diagnostics: Record<string, unknown> | null }`
  - `function hydrateDeviceForm(loaded: LoadedDevice, defs?: DeviceFieldDef[]): DeviceFormState`
  - `function serializeDeviceForm(state: DeviceFormState, loaded: LoadedDevice, defs?: DeviceFieldDef[]): { devicePatch: Record<string, unknown>; diagnosticsPatch: Record<string, unknown>; hasDiagnostics: boolean }`
  - `function validateDeviceForm(state: DeviceFormState, visibleDefs: DeviceFieldDef[]): { ok: boolean; errors: Record<string, string> }`

- [ ] **Step 1: Write the failing test**

```ts
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

  it('validate flags required visible fields only', () => {
    const visible = [...BASIC_FIELDS, ...getDeviceFamilyConfig('hdd').technical];
    const res = validateDeviceForm({ device_type_id: '' }, visible);
    expect(res.ok).toBe(false);
    expect(res.errors.device_type_id).toBeTruthy();
    const ok = validateDeviceForm({ device_type_id: 'some-id' }, visible);
    expect(ok.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- deviceFormSerialization`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
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
      diagnosticsPatch[def.storage.jsonKey] = isEmpty(raw) ? null : raw;
      if (!isEmpty(raw)) hasDiagnostics = true;
    }
  }

  devicePatch.technical_details = technicalDetails;
  // hasDiagnostics also true if pre-existing diagnostics had any non-empty value
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
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- deviceFormSerialization` → PASS (all 7).
Run: `npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/devices/deviceFormSerialization.ts src/lib/devices/deviceFormSerialization.test.ts
git commit -m "feat(devices): hydrate/serialize/validate (column+jsonb split, hidden-preserve, firmware fallback)"
```

---

## Task 6: Field renderer

**Files:**
- Create: `src/components/cases/device-form/DeviceFieldRenderer.tsx`
- Test: `src/components/cases/device-form/DeviceFieldRenderer.test.tsx`

**Interfaces:**
- Consumes: `DeviceFieldDef` from `../../../lib/devices/deviceFieldConfig`; `CatalogOption` from `../../../lib/devices/deviceCatalogQueries`; primitives `SearchableSelect`, `MultiSelectDropdown`, `Input`, `Textarea`.
- Produces: `function DeviceFieldRenderer(props: { def: DeviceFieldDef; value: unknown; onChange: (key: string, value: unknown) => void; options: CatalogOption[]; error?: string }): JSX.Element`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/cases/device-form/DeviceFieldRenderer.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeviceFieldRenderer } from './DeviceFieldRenderer';
import type { DeviceFieldDef } from '../../../lib/devices/deviceFieldConfig';

const textDef: DeviceFieldDef = {
  key: 'pcb_number', labelKey: 'devices.field.pcb_number', labelFallback: 'PCB Number',
  control: 'text', storage: { table: 'case_devices', kind: 'column', column: 'pcb_number' },
};
const selectDef: DeviceFieldDef = {
  key: 'brand_id', labelKey: 'devices.field.brand_id', labelFallback: 'Brand',
  control: 'select', storage: { table: 'case_devices', kind: 'column', column: 'brand_id' }, optionsSource: 'brands',
};

describe('DeviceFieldRenderer', () => {
  it('renders a text input with the fallback label and emits onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DeviceFieldRenderer def={textDef} value="" onChange={onChange} options={[]} />);
    const input = screen.getByLabelText(/PCB Number/i);
    await user.type(input, 'X');
    expect(onChange).toHaveBeenCalledWith('pcb_number', 'X');
  });

  it('renders a combobox for select fields', () => {
    render(<DeviceFieldRenderer def={selectDef} value="" onChange={vi.fn()}
      options={[{ id: '1', name: 'Seagate' }]} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- DeviceFieldRenderer`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/cases/device-form/DeviceFieldRenderer.tsx
import { useTranslation } from 'react-i18next';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { MultiSelectDropdown } from '../../ui/MultiSelectDropdown';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/Textarea';
import type { DeviceFieldDef } from '../../../lib/devices/deviceFieldConfig';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';

interface Props {
  def: DeviceFieldDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  options: CatalogOption[];
  error?: string;
}

export function DeviceFieldRenderer({ def, value, onChange, options, error }: Props) {
  const { t } = useTranslation();
  const label = t(def.labelKey, { defaultValue: def.labelFallback });
  const str = typeof value === 'string' ? value : value == null ? '' : String(value);

  switch (def.control) {
    case 'select':
    case 'component-status':
      return (
        <SearchableSelect
          label={label} value={str} onChange={(v) => onChange(def.key, v)}
          options={options} required={def.required} error={error} clearable={!def.required}
          placeholder={t('ui.select.placeholder', { defaultValue: 'Select...' })}
          usePortal
        />
      );
    case 'multiselect':
      return (
        <MultiSelectDropdown
          label={label} value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(ids) => onChange(def.key, ids)} options={options}
          required={def.required} error={error} usePortal
        />
      );
    case 'textarea':
      return (
        <Textarea label={label} value={str} required={def.required} error={error}
          onChange={(e) => onChange(def.key, e.target.value)} rows={3} />
      );
    case 'number':
      return (
        <Input type="number" label={label} value={str} required={def.required} error={error}
          onChange={(e) => onChange(def.key, e.target.value)} />
      );
    case 'date':
      return (
        <Input type="date" label={label} value={str} required={def.required} error={error}
          onChange={(e) => onChange(def.key, e.target.value)} />
      );
    case 'text':
    default:
      return (
        <Input type="text" label={label} value={str} required={def.required} error={error}
          onChange={(e) => onChange(def.key, e.target.value)} />
      );
  }
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- DeviceFieldRenderer` → PASS.
Run: `npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/cases/device-form/DeviceFieldRenderer.tsx src/components/cases/device-form/DeviceFieldRenderer.test.tsx
git commit -m "feat(devices): single-switch DeviceFieldRenderer over UI primitives"
```

---

## Task 7: 3-section dynamic form

**Files:**
- Create: `src/components/cases/device-form/DeviceDetailsForm.tsx`
- Test: `src/components/cases/device-form/DeviceDetailsForm.test.tsx`

**Interfaces:**
- Consumes: `BASIC_FIELDS`, `getDeviceFamilyConfig` (`../../../lib/devices/deviceFieldConfig`); `resolveDeviceFamily` (`../../../lib/devices/deviceFamily`); `CatalogOption`, `useDeviceFormCatalogs` types; `DeviceFieldRenderer`; `CollapsibleSection`.
- Produces: `function DeviceDetailsForm(props: { state: Record<string, unknown>; onChange: (key: string, value: unknown) => void; options: Record<string, CatalogOption[]>; errors?: Record<string, string> }): JSX.Element`

The form derives the family from `state.device_type_id` by looking up its name in `options.device_types`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/cases/device-form/DeviceDetailsForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceDetailsForm } from './DeviceDetailsForm';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';

const SSD_ID = 'ssd-type-id';
const HDD_ID = 'hdd-type-id';
const options = {
  device_types: [{ id: SSD_ID, name: 'NVMe SSD' }, { id: HDD_ID, name: '3.5" HDD' }] as CatalogOption[],
  brands: [], capacities: [], conditions: [], accessories: [], encryption: [],
  interfaces: [], made_in: [], head_counts: [], platter_counts: [], component_statuses: [],
} as Record<string, CatalogOption[]>;

describe('DeviceDetailsForm', () => {
  it('shows SSD Controller and hides HDD-only Physical Head Map for an SSD type', () => {
    render(<DeviceDetailsForm state={{ device_type_id: SSD_ID }} onChange={vi.fn()} options={options} />);
    expect(screen.getByText('Controller')).toBeInTheDocument();
    expect(screen.queryByText('Physical Head Map')).not.toBeInTheDocument();
  });

  it('shows HDD-only Physical Head Map for an HDD type', () => {
    render(<DeviceDetailsForm state={{ device_type_id: HDD_ID }} onChange={vi.fn()} options={options} />);
    expect(screen.getByText('Physical Head Map')).toBeInTheDocument();
  });

  it('always shows the Basic section fields', () => {
    render(<DeviceDetailsForm state={{ device_type_id: '' }} onChange={vi.fn()} options={options} />);
    expect(screen.getByText(/Serial Number/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- DeviceDetailsForm`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/cases/device-form/DeviceDetailsForm.tsx
import { useTranslation } from 'react-i18next';
import { HardDrive, Cpu, Stethoscope } from 'lucide-react';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { DeviceFieldRenderer } from './DeviceFieldRenderer';
import { BASIC_FIELDS, getDeviceFamilyConfig, type DeviceFieldDef } from '../../../lib/devices/deviceFieldConfig';
import { resolveDeviceFamily } from '../../../lib/devices/deviceFamily';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';

interface Props {
  state: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  options: Record<string, CatalogOption[]>;
  errors?: Record<string, string>;
}

export function DeviceDetailsForm({ state, onChange, options, errors = {} }: Props) {
  const { t } = useTranslation();
  const typeName = options.device_types?.find(o => o.id === state.device_type_id)?.name ?? '';
  const family = resolveDeviceFamily(typeName);
  const cfg = getDeviceFamilyConfig(family);

  const grid = (fields: DeviceFieldDef[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map(def => (
        <div key={def.key} className={def.colSpan === 2 ? 'md:col-span-2' : undefined}>
          <DeviceFieldRenderer
            def={def}
            value={state[def.key]}
            onChange={onChange}
            options={def.optionsSource ? (options[def.optionsSource] ?? []) : []}
            error={errors[def.key]}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <CollapsibleSection title={t('devices.section.basic', { defaultValue: 'Basic Information' })}
        icon={HardDrive} color="primary" defaultOpen fieldCount={BASIC_FIELDS.length}>
        {grid(BASIC_FIELDS)}
      </CollapsibleSection>

      <CollapsibleSection title={t('devices.section.technical', { defaultValue: 'Technical Information' })}
        icon={Cpu} color="info" defaultOpen fieldCount={cfg.technical.length}>
        {cfg.technical.length ? grid(cfg.technical)
          : <p className="text-sm text-slate-500">{t('devices.section.noTechnical', { defaultValue: 'No technical fields for this device type.' })}</p>}
      </CollapsibleSection>

      {cfg.components.length > 0 && (
        <CollapsibleSection title={t('devices.section.diagnostics', { defaultValue: 'Component Diagnostics' })}
          icon={Stethoscope} color="warning" defaultOpen={false} fieldCount={cfg.components.length}>
          {grid(cfg.components)}
        </CollapsibleSection>
      )}
    </div>
  );
}
```

> If `Stethoscope` is not exported by the installed `lucide-react`, substitute `Activity`. Verify with the existing icon imports before committing.

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- DeviceDetailsForm` → PASS.
Run: `npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/cases/device-form/DeviceDetailsForm.tsx src/components/cases/device-form/DeviceDetailsForm.test.tsx
git commit -m "feat(devices): 3-section dynamic DeviceDetailsForm (family-driven visibility)"
```

---

## Task 8: Extend diagnostics shape for new component keys

**Files:**
- Modify: `src/lib/diagnosticsTransform.ts`

**Interfaces:**
- Produces: `DeviceDiagnostics` gains optional `preamp_status?`, `service_area_status?`, `storage_chip_status?`; `RESULT_FIELDS` includes those 3 keys so they round-trip through the jsonb pack/unpack.

- [ ] **Step 1: Add the 3 keys to `RESULT_FIELDS`**

In `src/lib/diagnosticsTransform.ts`, add to the `RESULT_FIELDS` array (after `'surface_status'`):
```ts
  'preamp_status',
  'service_area_status',
  'storage_chip_status',
```

- [ ] **Step 2: Add the 3 fields to the `DeviceDiagnostics` interface**

Find the `DeviceDiagnostics` interface and add (near `surface_status`):
```ts
  preamp_status?: string;
  service_area_status?: string;
  storage_chip_status?: string;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (additive optional fields; existing callers unaffected).

- [ ] **Step 4: Run the existing diagnostics tests (if any) + full suite**

Run: `npm test -- diagnostics`
Expected: PASS (no regressions). If no diagnostics test exists, run `npm test` to confirm nothing broke.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diagnosticsTransform.ts
git commit -m "feat(diagnostics): add preamp/service_area/storage_chip component-status keys"
```

---

## Task 9: Integrate into DeviceFormModal

**Files:**
- Modify: `src/components/cases/DeviceFormModal.tsx`

**Interfaces:**
- Consumes: `useDeviceFormCatalogs`, `hydrateDeviceForm`, `serializeDeviceForm`, `validateDeviceForm`, `BASIC_FIELDS`, `getDeviceFamilyConfig`, `resolveDeviceFamily`, `DeviceDetailsForm`, `diagnosticsService`.

This task swaps the imperative Basic+Technical grid and the diagnostics sub-form for `<DeviceDetailsForm>`, drives state through the serializer, and removes the patient-only diagnostics gate — while preserving the role gate, donor sourcing, `is_primary`, `password`, `role_notes`, `symptoms`, `notes`, and soft-delete.

- [ ] **Step 1: Add imports**

Add to the import block:
```tsx
import { DeviceDetailsForm } from './device-form/DeviceDetailsForm';
import { useDeviceFormCatalogs } from '../../lib/devices/deviceCatalogQueries';
import {
  hydrateDeviceForm, serializeDeviceForm, validateDeviceForm,
} from '../../lib/devices/deviceFormSerialization';
import { BASIC_FIELDS, getDeviceFamilyConfig } from '../../lib/devices/deviceFieldConfig';
import { resolveDeviceFamily } from '../../lib/devices/deviceFamily';
```

- [ ] **Step 2: Add structural + dynamic state, replacing `diagnosticsFormData`**

Keep the existing structural pieces of `formData` (`device_role_id`, `is_primary`, `password`, `role_notes`, `symptoms`, `recovery_notes`, `selectedDonorInventoryId`). Add the dynamic config state and catalogs:
```tsx
const { options: deviceCatalogs } = useDeviceFormCatalogs();
const [detailState, setDetailState] = useState<Record<string, unknown>>(() => hydrateDeviceForm({ device: {}, diagnostics: null }));
const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
const [loadedRef, setLoadedRef] = useState<{ device: Record<string, unknown>; diagnostics: Record<string, unknown> | null }>({ device: {}, diagnostics: null });
const onDetailChange = (key: string, value: unknown) => setDetailState(prev => ({ ...prev, [key]: value }));
```
Remove the `diagnosticsFormData` state, the `loadDiagnostics` body's `setDiagnosticsFormData`, `hasDiagnosticsData`, and the `device_type_category` `useEffect` (the legacy category is now computed at save time only).

- [ ] **Step 3: Hydrate on edit-open**

Replace the load effect's device/diagnostics hydration with: fetch the full `case_devices` row (the modal already receives `deviceData`; ensure it includes `technical_details`, `dom`, `part_number`, `dcm` — fetch the row by id with `select('*')` if `deviceData` is partial) and the diagnostics row, then:
```tsx
const device = fullDeviceRow ?? {};
const diagnostics = await diagnosticsService.getDiagnosticsWithDevice(deviceData.id); // raw row or null
const loaded = { device, diagnostics: (diagnostics?.result as Record<string, unknown>) ?? null };
setLoadedRef(loaded);
setDetailState(hydrateDeviceForm(loaded));
```
For Add mode, keep `loadedRef = { device: {}, diagnostics: null }` and `detailState = hydrateDeviceForm({ device: {}, diagnostics: null })`.

> `getDiagnosticsWithDevice` returns the raw `device_diagnostics` row; its `.result` jsonb is what `hydrateDeviceForm` consumes as `diagnostics`.

- [ ] **Step 4: Replace the grid + diagnostics JSX with `<DeviceDetailsForm>`**

In the JSX, keep the structural controls (Device Role select, `is_primary` toggle for patient, donor inventory picker, `password`, `role_notes`, `symptoms`/"Device Problem", `notes`/"Recovery Requirements"). Replace the `<div className="grid grid-cols-3 gap-4">…</div>` (lines ~568–1012) **and** the diagnostics sub-section with:
```tsx
<DeviceDetailsForm
  state={detailState}
  onChange={onDetailChange}
  options={deviceCatalogs}
  errors={detailErrors}
/>
```
Move `device_type_id`, `brand_id`, `model`, `serial_number`, `capacity_id`, `condition_id`, `accessories`, `encryption_id`, and all technical/diagnostic inputs OUT of the structural area (they are now owned by `DeviceDetailsForm`).

- [ ] **Step 5: Rewrite the save handler glue**

Replace the body of `handleSubmit` device/diagnostics assembly with:
```tsx
// Validate visible fields (Basic + current family Technical) only
const typeName = deviceCatalogs.device_types?.find(o => o.id === detailState.device_type_id)?.name ?? '';
const family = resolveDeviceFamily(typeName);
const visible = [...BASIC_FIELDS, ...getDeviceFamilyConfig(family).technical];
const { ok, errors } = validateDeviceForm(detailState, visible);
setDetailErrors(errors);
if (!ok) { setIsSubmitting(false); return; }

const { devicePatch, diagnosticsPatch, hasDiagnostics } = serializeDeviceForm(detailState, loadedRef);

// Structural fields owned by the modal (unchanged behavior)
const structural = {
  case_id: caseId,
  tenant_id: profile?.tenant_id ?? '',
  device_role_id: formData.device_role_id ? Number(formData.device_role_id) : null,
  password: formData.password || null,
  role_notes: formData.role_notes || null,
  symptoms: formData.symptoms || null,
  notes: formData.recovery_notes || null,
};

// Donor role sources Basic identity from inventory (preserve existing behavior)
let devicePayload: Record<string, unknown> = { ...structural, ...devicePatch };
if (isDonorRole && selectedDonorInventoryId) {
  const donor = donorInventory.find(d => d.id === selectedDonorInventoryId);
  if (donor) {
    devicePayload = {
      ...devicePayload,
      brand_id: donor.brand_id ?? null, model: donor.model ?? null,
      serial_number: donor.serial_number ?? null, capacity_id: donor.capacity_id ?? null,
    };
  }
}
```
Then keep the existing update (`:410`) / insert (`:421`) using `devicePayload` (cast to `CaseDeviceUpdate`/`CaseDeviceInsert`), the `setPrimaryDevice` call, and the donor `inventory_case_assignments` insert.

- [ ] **Step 6: Save diagnostics for ALL roles (remove patient-only gate)**

Replace the `if (isPatientRole && deviceId && hasDiagnosticsData())` block with:
```tsx
if (deviceId && hasDiagnostics) {
  try {
    const category = diagnosticsService.determineDeviceCategory(typeName); // legacy 4-value field
    await diagnosticsService.upsertDeviceDiagnostics({
      case_device_id: deviceId,
      device_type_category: category,
      ...diagnosticsPatch,
    } as Parameters<typeof diagnosticsService.upsertDeviceDiagnostics>[0]);
  } catch (error) {
    logger.error('Error saving diagnostics:', error);
    toast.error(
      `Device saved, but the inspection/diagnostics did NOT save: ${
        error instanceof Error ? error.message : 'unknown error'
      }. Re-open the device and retry.`
    );
  }
}
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Resolve any type friction by casting `devicePayload`/diagnostics payload at the supabase boundary (the serializer returns `Record<string, unknown>`).

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS (all prior tasks' tests + existing 424 suite green).

- [ ] **Step 9: Manual smoke (browser)**

Open a case → Add Device → pick "3.5\" HDD": confirm Technical shows PCB/Interface/DOM/Part Number/DCM/Firmware/Platters/Heads/Head Map/Pre-Amp and Diagnostics shows Heads/PCB/Motor/Pre-Amp/Surface/Service Area. Switch type to "NVMe SSD": HDD-only fields disappear, Controller/Chipset appear, Diagnostics → Controller/NAND/PCB. Save, re-open: values persist. Switch a saved HDD to SSD, save, switch back: HDD values still present (hidden-preserve).

- [ ] **Step 10: Commit**

```bash
git add src/components/cases/DeviceFormModal.tsx
git commit -m "feat(devices): wire DeviceFormModal to dynamic per-family form; diagnostics for all roles"
```

---

## Task 10: Edit-icon fix + final gate

**Files:**
- Modify: `src/components/cases/detail/CaseDevicesTab.tsx`

- [ ] **Step 1: Fix the mis-aliased icon import**

Replace line 3 `import { CreditCard as Edit } from 'lucide-react';` with merging the edit icon into the existing lucide import (line 2). Use `SquarePen as Edit` (or `Pencil`):
```tsx
import { HardDrive, Grid2x2 as Grid, History, Clock, Eye, EyeOff, Shield, Package, SquarePen as Edit } from 'lucide-react';
```
Delete the now-redundant line 3.

- [ ] **Step 2: Typecheck + full test + lint**

Run: `npm run typecheck` → PASS (0).
Run: `npm test` → PASS.
Run: `npm run lint` (if present) → PASS (no `.from('<legacy>')`, no banned tables/colors).

- [ ] **Step 3: Commit**

```bash
git add src/components/cases/detail/CaseDevicesTab.tsx
git commit -m "fix(cases): correct mis-aliased device Edit icon (CreditCard -> SquarePen)"
```

---

## Self-Review (completed by author)

**Spec coverage:** §3 Basic (Task 3 BASIC_FIELDS) · §5.1 Technical matrices (Task 3 REGISTRY) · §5.2 Components + storage-boundary rule (Tasks 3, 8) · §4 families (Task 2) · §6 renderer (Tasks 6–7) · §7 hydrate/serialize/validate incl. firmware fallback + hidden-preserve (Task 5) · §8 migration (Task 1) · §9 files (all tasks) · §10 UX/theming/i18n (Tasks 6–7) · §11 tests (every task) · §2.1 wizard frozen (Global Constraints; not touched) · diagnostics-all-roles + dirty-check fix (Tasks 5 `hasDiagnostics`, 9 step 6) · Edit-icon fix (Task 10).

**Placeholder scan:** No "TBD/TODO/handle edge cases". All code blocks are directly usable; the earlier scaffolding markers were removed in self-review so nothing broken can ship.

**Type consistency:** `DeviceFieldDef`/`FieldStorage`/`CatalogKey`/`DeviceFamily` names identical across Tasks 2–9. `serializeDeviceForm` returns `{ devicePatch, diagnosticsPatch, hasDiagnostics }` — consumed with those exact names in Task 9. `resolveDeviceFamily`, `getDeviceFamilyConfig`, `BASIC_FIELDS`, `ALL_FIELD_DEFS`, `useDeviceFormCatalogs`, `hydrateDeviceForm`, `validateDeviceForm` referenced consistently. Component-status fields store at `device_diagnostics.result.<componentKey>_status`; the 3 new keys (`preamp_status`, `service_area_status`, `storage_chip_status`) are added to `RESULT_FIELDS` + `DeviceDiagnostics` in Task 8 so they persist.

**Open risk flagged for execution:** Task 9 is a large refactor of a 1069-line file; it is the one task to review most carefully and is gated by the full test suite + manual smoke (Task 9 step 9). Confirm `diagnosticsService.upsertDeviceDiagnostics`'s parameter type accepts the spread `diagnosticsPatch` (it takes a `DeviceDiagnostics`; extra null-valued keys are fine since `toDeviceDiagnosticsInsert/Update` only packs `RESULT_FIELDS`).
