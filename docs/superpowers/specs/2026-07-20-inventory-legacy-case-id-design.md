# Inventory — Legacy Case ID reference field

**Date:** 2026-07-20
**Status:** Design (approval sought asynchronously; the interactive question channel
was unavailable, so this proceeds on documented defaults — see Open Choices.)

## Problem

Data-recovery labs migrating from an older ERP have physical devices in inventory
whose original case reference exists only in the old system. When a device is added
to xSuite inventory manually (Add Inventory Item), there is no `cases` row to link
(`inventory_items.source_case_id` is an FK to the *new* `cases` table). Staff need to
record the **original/legacy case reference** as free text so the item can be tracked
and found later.

This is a provenance/lookup need, not a technical spec. It must not be modelled as an
FK — the referenced case does not exist in xSuite.

## Design

### Storage — new nullable column
`inventory_items.legacy_case_ref text NULL` (additive migration + partial index
`WHERE deleted_at IS NULL AND legacy_case_ref IS NOT NULL`). It sits beside the
existing provenance columns added by the case→inventory work
(`source_case_id`, `inventory_source`, `converted_by`, `converted_at`).

Why a real column rather than stuffing it into `technical_details` JSON:
- It is identity/provenance, not a family-specific technical spec; the family
  serializer (`serializeInventorySpecs`) would silently drop an unknown key.
- "Future lookup" wants efficient, indexable search — a first-class column is
  searchable via a plain `ilike`, not a JSON extraction.
- `main` is now caught up to the live DB (PRs #430/#431 merged), so an additive
  column no longer risks schema-drift noise on other open branches.

The column is optional; no CHECK, no format enforcement (legacy refs are arbitrary).
`inventory_items` is already tenant-scoped with RLS enabled/forced and the standard
policies — an additive nullable column inherits all of that, so no new policy or
trigger is required.

### Form — `InventoryItemWizard`
One optional text input, label **"Legacy Case ID"**, in the IDENTITY section in the
currently-empty grid cell after *Accessories* (the location the request highlighted).
- Added to `InventoryForm` state + `EMPTY_FORM` (`legacy_case_ref: ''`).
- Included in `basePayload` (`legacy_case_ref: trim() || null`).
- Hydrated in edit mode from `item.legacy_case_ref`.
- No validation beyond trim-to-null (optional).

### Display — `InventoryDetailModal`
Show the legacy reference read-only when present, so it is visible on lookup.

### Search — inventory list
Include `legacy_case_ref` in the inventory list text-search `or(...)` chain
(alongside `item_number` / `name` / `serial_number`) so an item can be found by its
old case reference — this delivers the "future lookup" requirement.

## Testing / verification
- `tsc` clean; existing `InventoryItemWizard.test.tsx` still passes.
- Live rolled-back insert of an item with `legacy_case_ref`, read it back, confirm it
  persists and is searchable; roll back (no residue).
- Regenerated `database.types.ts` shows only the `legacy_case_ref` addition.

## Open Choices (defaults taken; easily changed)
1. **Label:** "Legacy Case ID" (vs "Old Case ID Reference"). Chosen for brevity and
   to match the request's first suggestion; trivially renamable.
2. **Searchable:** yes (delivers "future lookup"). Could be reduced to record+display.
3. **Branch:** fresh `claude/inventory-legacy-case-id` cut from `main` (the merged
   designated branch is not reused, per CLAUDE.md).

## Out of scope
- Back-linking legacy refs to reconstructed cases.
- Bulk import mapping of legacy case IDs (belongs to the data-migration workbook, not
  this manual-entry field).
