# Inventory V2 P0 — Device Family Engine Report

**Date:** 2026-06-30  
**Branch:** feat/drop-legacy-report-tables (engine changes applied here per task spec)  
**Status:** DONE

---

## Changes Made

### `src/lib/devices/deviceFamily.ts`

- Extended `DeviceFamily` union with `'nvme' | 'pcb' | 'head_stack'`.
- `EXPLICIT` map: changed `'nvme ssd'` from `'ssd'` to `'nvme'`; added `'pcb': 'pcb'`, `'head stack': 'head_stack'`, `'head assembly': 'head_stack'`.
- `heuristic()`: Added rules (in priority order before the generic ssd/hdd rules):
  - `head_stack` — matches `head stack` / `head assembl` patterns
  - `pcb` — matches `\bpcb\b`, `circuit board`, `logic board`
  - `nvme` — matches `nvme` / `m.2 nvme`
  - Existing ssd rule had `m\.2` removed (kept as generic ssd for `M.2 SSD` without nvme keyword)

### `src/lib/devices/deviceFieldConfig.ts`

Six new fields added to the `F` library (all `tj(...)` / technical_details JSON storage):

| Field key | Label |
|---|---|
| `nand_type` | NAND Type |
| `pcie_generation` | PCIe Generation |
| `raid_controller` | RAID Controller |
| `pcb_revision` | PCB Revision |
| `compatible_models` | Compatible Models |
| `firmware_family` | Firmware Family |

REGISTRY updates:

| Family | Change |
|---|---|
| `ssd` | `technical` now `[controller, firmware_version, nand_type, pcb_number, chipset, encryption_id, dom, made_in_id]` — added `nandType` |
| `raid` | `technical` now uses `F.raidController` instead of `F.controller` |
| `nvme` (NEW) | `technical: [controller, pcie_generation, firmware_version, nand_type, pcb_number]`; `components: [controller_status, memory_chips_status, pcb_status]` |
| `pcb` (NEW) | `technical: [pcb_number, pcb_revision, compatible_models, firmware_family]`; `components: []` |
| `head_stack` (NEW) | `technical: [physical_head_map, head_count_id, pre_amp, compatible_models]`; `components: []` |

---

## Tests Added (RED → GREEN)

### `src/lib/devices/deviceFamily.test.ts` — 9 new tests

All written RED before implementation, then GREEN after:

1. `NVMe SSD resolves to nvme (not ssd)`
2. `PCB resolves to pcb`
3. `Head Stack resolves to head_stack`
4. `Head Assembly resolves to head_stack`
5. `heuristic nvme matches before ssd fallback` (NVMe PCIe SSD, M.2 NVMe)
6. `heuristic pcb matches circuit board / logic board names`
7. `heuristic head_stack matches head assembly variants`
8. `existing hdd and ssd cases still resolve correctly after nvme split`
9. (case-tolerance test updated — see below)

### `src/lib/devices/deviceFieldConfig.test.ts` — 11 new tests

1. `nvme config has expected technical field keys in order`
2. `nvme config has expected component keys`
3. `pcb config technical keys include pcb_revision, compatible_models, firmware_family`
4. `pcb config has empty components array`
5. `head_stack config technical keys include physical_head_map, head_count_id, pre_amp, compatible_models`
6. `head_stack config has empty components array`
7. `ssd technical field keys include nand_type after firmware upgrade`
8. `ssd technical field keys match new spec exactly`
9. `raid technical uses raidController (raid_controller) not generic controller`
10. `raid technical field keys match new spec exactly`
11. `ALL_FIELD_DEFS contains the new field keys`

Also updated `FAMILIES` const to include `nvme`, `pcb`, `head_stack` so all invariant tests (no-duplicate-keys, select-options, storage-target-clash, etc.) cover the new families.

---

## Case Tests Updated (and Why)

Two existing tests in `deviceFamily.test.ts` asserted the old `'NVMe SSD' → 'ssd'` mapping and `'nvme ssd' → 'ssd'` (case-tolerance test). The DB backfill that prompted this task changes that mapping to `'nvme'`. Both were updated to match the new spec:

- `cases` array entry: `['NVMe SSD', 'nvme']` (was `'ssd'`)
- Case-tolerance test: `resolveDeviceFamily('  nvme ssd ') → 'nvme'`; added `resolveDeviceFamily('  m.2 ssd ') → 'ssd'` to keep the ssd heuristic covered

These updates are expected per the task brief: "a test asserting the OLD ssd/nvme field set may need updating to the new sets — update it to match the new spec."

---

## i18n Keys

**No parity test exists** for `devices.field.*` — the `labelFallback` strings in `deviceFieldConfig.ts` are the only i18n mechanism in use. No locale JSON files or i18n test files reference `devices.field.*`. The six new fields carry English fallback text only; no i18n system to extend.

---

## Full Suite Result

- **Tests:** 1901 passed, 2 skipped, 0 failed (246 test files)
- **tsc:** 0 errors (`npm run typecheck`)
- **Known skip:** `typstEngine.node.test.ts` sha256 flake — not triggered in this run

---

## Concerns

None. The engine change is purely additive — new union members + new REGISTRY entries. All existing Case Intake paths that call `resolveDeviceFamily` / `getDeviceFamilyConfig` benefit automatically. The only behavioral delta is that catalog rows previously typed as "NVMe SSD" now resolve to the finer `nvme` family; forms that rendered the `ssd` field set for those devices will now render the `nvme` field set (narrower, PCIe-aware) — this is the intended outcome.
