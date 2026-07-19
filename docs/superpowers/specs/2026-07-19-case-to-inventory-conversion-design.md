# Case → Inventory Conversion — Design Spec

**Date:** 2026-07-19
**Status:** Approved-by-default (see "Decision process" below)
**Lifecycle stage:** bridges Stage 13 (Device Checkout / Return) and the Inventory / donor-drive module.

## Problem

After a recovery case is completed, some customers never return to collect their
original device. These abandoned devices are valuable as **donor drives** and today
are re-keyed into inventory by hand — slow, error-prone, and with no traceable link
back to the originating case. We want a one-click **"Convert to Inventory"** action on
the Case Details page that creates a pre-filled, auto-numbered, fully-audited inventory
record and links it back to its source case + device.

## Decision process

This spec was produced through the brainstorming workflow: the codebase was mapped
across six subsystems (inventory schema/numbering, case/device model, Case Details UI,
inventory UI/routing, audit/custody/RPC patterns, service-layer patterns) and the live
database was inspected as the source of truth. Three design forks were surfaced for the
product owner. The interactive question channel was unavailable in this session, so each
fork was resolved on its **domain-correct** default (below), documented here for review,
and can be revised.

## Verified facts (source of truth = live DB, project `ssmbegiyjivrcwgcqutu`)

- **Canonical donor inventory = `inventory_items`** (existing tenant-scoped table). Donor
  status = `is_donor` boolean.
- `inventory_items` has **no provenance columns** today (no `source_case_id`, no
  `inventory_source`, etc.). → migration adds them.
- Inventory numbering is **per device type**: a `BEFORE INSERT` trigger
  `trg_assign_inventory_item_number` assigns `item_number` (e.g. `HDD-0001`) when
  `item_number IS NULL AND device_type_id IS NOT NULL`. **An INSERT that leaves
  `item_number` NULL gets the next number for free** — the convert path must NOT call
  `get_next_inventory_number` itself (double-burn).
- `set_tenant_and_audit_fields` on `inventory_items` stamps `tenant_id`/timestamps but
  **not** `created_by`/`updated_by` — the convert path sets actor fields explicitly.
- A case is **one-to-many** with `case_devices` (a 12-drive RAID = 12 rows). `device_role_id`
  → `catalog_device_roles` = {1 Patient, 2 Backup, 3 Donor, 4 Clone}.
- **Directly copyable FK columns** (identical FK target on both tables): `device_type_id`
  (`catalog_device_types`), `brand_id` (`catalog_device_brands`), `capacity_id`
  (`catalog_device_capacities`), `interface_id` (`catalog_interfaces`). Plus text/array/json:
  `model`, `serial_number`, `firmware_version`, `pcb_number`, `photos`, `technical_details`.
- **NOT copyable:** `condition_id` (case → `catalog_device_conditions`, inventory →
  `master_inventory_condition_types`; **0 name overlap** between the 20 case-side and 6
  inventory-side rows) and `form_factor_id` (**no** column on `inventory_items`).
- Case terminal phases (`master_case_statuses.type`): `delivered`, `closed`, `no_solution`,
  `cancelled` (+ legacy `completed`). There is no `phase` column on `cases`; resolve via
  `status_id → master_case_statuses.type`.
- Existing custody/history/audit write helpers (all `SECURITY DEFINER`, actor derived
  internally from `auth.uid()`): `log_chain_of_custody(...)`, `log_case_history(...)`.

## Design decisions (the three forks)

1. **Granularity — per device.** Convert operates on a single selected `case_device`, one
   `inventory_items` row per device, linked by `source_case_device_id`. This honours the
   CLAUDE.md rule that a multi-device job must never collapse to one outcome, and preserves
   per-drive serials/traceability. (Rejected: one inventory item per case.)
2. **Eligibility — terminal cases only.** The action is enabled and the RPC enforced only
   when the case phase ∈ {delivered, closed, no_solution, cancelled, completed}. Converting
   a device from an in-flight case is refused. A device already checked out to the customer
   is a soft warning, not a hard block.
3. **Post-convert UX — redirect to the new item.** The RPC creates the item atomically
   (number auto-assigned); the UI then navigates to `/inventory?item=<id>`, and the
   inventory list opens the existing `InventoryDetailModal` for that id (new lightweight
   `?item=` deep-link). The case also shows a persistent, clickable "In inventory: HDD-0001"
   indicator.

## Architecture

### 1. Migration — additive columns on `inventory_items`

```
source_case_id         uuid    REFERENCES cases(id)         -- nullable
source_case_device_id  uuid    REFERENCES case_devices(id)  -- nullable, device-level provenance
inventory_source       text    NOT NULL DEFAULT 'manual'
                               CHECK (inventory_source IN ('manual','case_conversion'))
converted_by           uuid    REFERENCES profiles(id)      -- nullable
converted_at           timestamptz                          -- nullable
```

Existing rows backfill to `inventory_source='manual'` (they were hand-entered). Partial
indexes on `source_case_id` and `source_case_device_id` (`WHERE deleted_at IS NULL`).
`inventory_items` is an existing table with RLS/isolation/trigger/tenant-index already in
place — this migration only **adds columns + indexes + one function**.

### 2. RPC — `convert_case_device_to_inventory(...)` (`SECURITY DEFINER`, returns `jsonb`)

Params: `p_case_id`, `p_case_device_id`, `p_condition_id?`, `p_status_id?`, `p_location_id?`,
`p_is_donor=true`, `p_notes?`, `p_name?`, `p_legal_basis?`, `p_allow_duplicate=false`.

Steps, all in one transaction:
1. Resolve tenant (`get_current_tenant_id`) + actor (`auth.uid`); tenant-scope the case and
   device (device must belong to the case).
2. Require `device_type_id` (needed for numbering) — else raise `device_type_required`.
3. Enforce terminal phase — else raise `case_not_terminal`.
4. Duplicate guard: existing non-deleted item with same `source_case_device_id` + not
   `p_allow_duplicate` → raise `already_converted` (carries the existing item number).
5. Synthesize a name if none given (`brand model capacity` → `deviceType serial` → case fallback).
6. Default status → the "Available" row when not supplied. Condition is **not** copied from
   the case (`p_condition_id`, user-chosen, may be NULL).
7. Merge `form_factor` / `head_count` names + provenance breadcrumbs into `technical_details`
   (inventory has no columns for them); build a human-readable provenance note.
8. INSERT `inventory_items` copying the safe columns, `is_donor`, `quantity=1`, the provenance
   columns, `inventory_source='case_conversion'`, `converted_by`/`converted_at`, and explicit
   `created_by`/`updated_by`. `item_number` left NULL → trigger assigns it.
9. `log_chain_of_custody`: `critical_event` / `DEVICE_CONVERTED_TO_INVENTORY` / status
   `archived` (media retained by lab, not disposed), metadata carries the item id + legal basis.
10. `log_case_history`: `device_converted_to_inventory`, `new_value` = item number.
11. Return `{ inventory_item_id, item_number, source_case_id, source_case_device_id }`.

Audit of "who + when" is covered three ways: the `converted_by`/`converted_at` columns, the
chain-of-custody row, and the case-history row — so no separate `log_audit_trail` call is
needed (and it avoids that helper's overload ambiguity).

### 3. Service — `src/lib/caseInventoryConversionService.ts`

- `convertCaseDeviceToInventory(params)` → `rpc('convert_case_device_to_inventory', {...})`.
- `getInventoryConvertedFromCase(caseId)` → items where `source_case_id = caseId` (for the
  case badge + the modal's "already converted" markers).

### 4. UI

- **`ConvertToInventoryModal`** (`src/components/cases/`): device selector (defaults to the
  primary/patient device; already-converted devices shown with their item number and a
  reconvert override), donor toggle (default on), optional inventory condition + location,
  optional notes + legal basis, read-only preview of the copied hardware attributes. Owns a
  `useMutation`; parent supplies navigation via `onConverted(itemId)` (mirrors
  `StartReRecoveryModal`'s decoupled pattern).
- **`CaseDetail.tsx`**: a "To Inventory" header action gated on `canConvertToInventory`
  (terminal phase) and non-viewer role; a clickable "In inventory: HDD-0001" badge in the
  header badges row (reads `getInventoryConvertedFromCase`); the modal mounted in the
  `outside` slot; `onConverted` → `navigate('/inventory?item=<id>')`.
- **`InventoryListPage.tsx`**: read `?item=<id>` (via `useSearchParams`) on mount and open
  the existing `InventoryDetailModal` for that id, then clear the param.
- **`InventoryDetailModal.tsx`**: a "Source Case" card (shown when
  `inventory_source='case_conversion'`) with a clickable link back to the originating case
  and the original customer name — the reverse navigation. The customer name is snapshotted
  into `technical_details.source_customer_name` at conversion time (a read-only internal
  reference; the item itself is a lab asset), via a follow-up migration that only changes the
  RPC body (same signature — no generated-type change).

### 5. Query invalidation

The case detail page uses raw keys (`['case', id]`, `['case_devices', id]`,
`['case_history', id]`) while the inventory list uses `inventoryKeys` (and its own imperative
`loadData`). After a conversion, invalidate `['case', id]`, `['case_history', id]`, the new
`['case', 'converted-inventory', id]` badge query, and `inventoryKeys.all`.

## Error handling

RPC raises typed exceptions with `HINT`s (`device_type_required`, `case_not_terminal`,
`already_converted`); the modal surfaces them as toasts. The insert + custody + history writes
share one transaction, so a failure at any step rolls back cleanly (no orphaned item).

## Out of scope (YAGNI)

- No `/inventory/:id` route page (the `?item=` deep-link reuses the existing modal).
- No multi-device batch convert in one submit (convert one device at a time, with per-device
  condition/location — correct for physically distinct drives).
- No new consent/abandonment record table; the legal basis is captured in custody metadata.
- No change to `case_devices` (the case's converted indicator is derived from `inventory_items`).

## Testing / verification

- `npm run typecheck` (0 errors — CI gate), `npm run lint`, `npm run build`.
- `npm run check:schema-drift` after regenerating `database.types.ts`.
- Manual reasoning of the flow against the live schema; RPC exercised via a dry read of the
  new columns/function existence.
