# Edit Device — Dense Tabbed Redesign — Design Spec

- **Date:** 2026-06-26
- **Status:** Approved for implementation (4 decisions locked with product owner)
- **Builds on:** `2026-06-26-device-details-dynamic-form-design.md` (the dynamic config-driven form). This redesign changes the **presentation** (collapsible sections → dense tabs) and adds a **Diagnostic** tab; it reuses the config registry / renderer / serializer / family resolver from that feature.
- **Branch:** `feat/device-details-dynamic-form` (continuation; all local, no push).
- **Goal:** Make the Edit/Add Device dialog a dense, tabbed, low-scroll workspace for engineers processing many devices/day. Target ~30–40% less vertical space.

## 1. Problem

The shipped dynamic form stacks three `CollapsibleSection` cards in a `Modal` with a scrolling body. For an engineer editing dozens of devices a day this is too tall and too sparse: ~300px of section chrome before any field, 40px inputs, single scroll region, footer that scrolls away. The ask: a tabbed, high-density layout (Jira/Adobe/Autodesk feel) with a fixed footer and minimal scrolling.

## 2. Decisions (locked 2026-06-26)

1. **Diagnostic tab = pragmatic, zero-migration.** Wire dormant columns + add jsonb-backed fields via the existing `device_diagnostics.result` write path. **Defer** device-level Recovery Priority + Engineer Assigned (case-level today; per-device needs a migration + workflow change).
2. **Device Problem and Symptoms = two distinct fields.** Device Problem = select from `catalog_service_problems` (stored in `symptoms` as the name, matching intake); Symptoms = free-text (`device_diagnostics.result.symptoms`).
3. **Tab coloring = categorical** `cat-1..cat-4` identity tokens (NOT the banned purple/indigo/violet, NOT the status palette). **lucide icons, not emojis** (design-system rule).
4. **Components tab renders the existing per-component status grid now** (it's built); History/Activity is a placeholder.

## 3. Ground truth (verified 2026-06-26)

- **No `Tabs` primitive exists** (~24 files hand-roll tab buttons). Closest pattern: `src/components/stock/StockItemFormModal.tsx:197-211` (underline strip).
- **`Modal.tsx` has no footer slot** (single `p-4 overflow-y-auto` body). Sticky-footer precedent: `src/components/cases/CreateCaseWizard.tsx` — Panel `max-h-[90vh] overflow-hidden flex flex-col` (:563), header `border-b` (:565), body `flex-1 overflow-y-auto` (:578), footer `flex justify-end gap-3 p-6 border-t bg-slate-50` (:1029).
- **Input primitives hardcode `px-3 py-2`** with no size prop; `Button.tsx:41-45` / `Badge` already use `cva` size blocks — copyable pattern.
- **Dormant `case_devices` columns** (present, no app read/write today): `recovery_result` (→ Evaluation Result), `diagnosis` (→ Initial Diagnosis). Active: `symptoms` ("Device Problem"), `notes` ("Recovery Requirements").
- **Existing `device_diagnostics` write path:** `serializeDeviceForm` already emits a `diagnosticsPatch` (result keys) and `DeviceFormModal` upserts it via `diagnosticsService.upsertDeviceDiagnostics` for all roles. New Diagnostic jsonb fields ride this path (no new persistence machinery).
- `catalog_service_problems` = 50 active rows. `master_case_priorities` = 3 (Low/Normal/High), `case_engineers` = case-level — confirming Priority/Engineer are case-scoped (deferred).

## 4. Shell architecture (the density foundation)

`DeviceFormModal` becomes a `Dialog`-based **flex column** (drop the `Modal` wrapper; `Modal` is unchanged for other callers):

```
<Dialog> <Dialog.Panel className="max-h-[90vh] w-full max-w-5xl overflow-hidden flex flex-col rounded-xl bg-surface">
  ── Fixed header (shrink-0) ─────────────────────────────
     • Title row (Edit/Add Device) — compact (py-2)
     • Context row: Device Role (SearchableSelect, required) + is_primary toggle (patient only) + donor picker mount point
     • <Tabs> strip (cat-colored, lucide icons, error-dots)
  ── Scrolling body (flex-1 overflow-y-auto px-4 py-3) ───
     • Active tab panel
  ── Sticky footer (shrink-0, p-4 border-t border-border) ─
     • [Delete (edit)]            [Cancel] [Save Changes]
</Dialog.Panel> </Dialog>
```

- `activeTab` state lives in `DeviceFormModal`; `detailState`/structural state stay lifted (panels keep state across tab switches).
- `max-w-5xl` (~1024px) to comfortably fit the 4-col grid (4×~190px + portals).

## 5. `Tabs` primitive (new `src/components/ui/Tabs.tsx`)

Accessible underline tabs. Props:
```ts
interface TabDef { id: string; label: string; icon?: React.ComponentType<{className?:string}>; colorToken?: string; hasError?: boolean; disabled?: boolean }
interface TabsProps { tabs: TabDef[]; activeId: string; onChange: (id: string) => void; className?: string }
```
- Markup: `role="tablist"` strip (`flex border-b border-border`), each tab `role="tab"` button `aria-selected`/`aria-controls`, roving `tabIndex` (active=0, others=-1), Left/Right/Home/End arrow navigation, `disabled` skips.
- Active style: `border-b-2` in the tab's `colorToken` (e.g. `border-cat-1 text-cat-1`); inactive `border-transparent text-slate-500 hover:text-slate-700`.
- `hasError` → a small `bg-danger` dot after the label.
- Icon (lucide) + label inline.

## 6. Input density (`size` cva variant)

Add a `size` variant (`sm` | `md`, default `md`) to `Input`, `Select`, `SearchableSelect`, `Textarea`, `MultiSelectDropdown`:
- `sm: 'px-3 py-1.5 text-sm'`, `md: 'px-3 py-2 text-sm'` (mirror `Button.tsx:41-45`).
- `DeviceFieldRenderer` passes `size="sm"` to every control; compact textareas `rows={2}` (full-width Diagnostic/role notes `rows={3}`).
- Labels keep `mb-1`. (Note: ~32px controls are below the 44px touch target; accepted for this desktop-dense engineer tool per the product owner's explicit density goal.)

## 7. The four tabs

### Tab 1 — Device Details (`cat-1`, `HardDrive`) — `DeviceDetailsForm.tsx` rewrite
- Drop the 3 `CollapsibleSection`s. Render **merged** `[...BASIC_FIELDS, ...cfg.technical]` as one dense grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3`. Honor `colSpan:2` → `lg:col-span-2`.
- Keep `resolveDeviceFamily(typeName)` → `getDeviceFamilyConfig` derivation verbatim.
- **Do NOT** render `cfg.components` here (moves to Tab 3).
- Below the grid (modal-owned, not config): **Device Password** (relocated; `Input type=password size=sm` full-width with show/hide Eye toggle — replacing the hand-rolled raw input) and **Role-Specific Notes** (`role_notes`, full-width textarea).
- **Donor role:** Tab 1 shows the donor inventory picker instead of the dynamic grid (current behavior); Tabs 2–3 disabled.

### Tab 2 — Diagnostic (`cat-2`, `Stethoscope`) — new `DeviceDiagnosticForm.tsx`
3-col grid `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3`; Diagnostic Notes full-width (`lg:col-span-3`). Driven by a new `DIAGNOSTIC_FIELDS` config set (rendered via `DeviceFieldRenderer`). **No password.**

| Field (key) | Control | Storage |
|---|---|---|
| Device Problem (`device_problem`) | select, optionsSource `service_problems` | `case_devices.symptoms` (col; stores name) |
| Symptoms (`symptoms_detail`) | textarea | `device_diagnostics.result.symptoms` |
| Recovery Requirement (`recovery_requirement`) | textarea | `case_devices.notes` (col) |
| Initial Diagnosis (`initial_diagnosis`) | textarea | `case_devices.diagnosis` (col) |
| Evaluation Result (`evaluation_result`) | text | `case_devices.recovery_result` (col) |
| Diagnostic Status (`diagnostic_status`) | select, `staticOptions` Pending/In Progress/Completed/Inconclusive | `device_diagnostics.result.diagnostic_status` |
| Estimated Recovery Chance (`recovery_chance`) | select, `staticOptions` High/Medium/Low/None | `device_diagnostics.result.recovery_chance` |
| Diagnostic Notes (`diagnostic_notes`) | textarea, colSpan full | `device_diagnostics.result.diagnostic_notes` |

### Tab 3 — Components (`cat-3`, `Cpu`) — new `DeviceComponentsForm.tsx`
The per-component status grid extracted from today's Section 3 (`cfg.components` for the family) rendered dense (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`). Hidden/disabled when `cfg.components` is empty (e.g. `other` family) or donor role.

### Tab 4 — History / Activity (`cat-4`, `History`) — placeholder
Empty-state panel ("Device history coming soon"). Excluded from validation and any dirty-check.

## 8. Config + storage changes

`src/lib/devices/deviceFieldConfig.ts`:
- Add `staticOptions?: { id: string; name: string }[]` to `DeviceFieldDef` (fixed-set selects with no DB catalog).
- Add `'service_problems'` to `CatalogKey`.
- Add `DIAGNOSTIC_FIELDS: DeviceFieldDef[]` (the 8 fields above).
- `ALL_FIELD_DEFS` includes `DIAGNOSTIC_FIELDS` (so hydrate/serialize cover them).
- Config-integrity test invariants updated: a `select` field has `optionsSource` **or** `staticOptions`; **no two distinct keys share a storage target** (new check — guards the `technical_notes` reuse and any future collision).

`src/lib/devices/deviceCatalogQueries.ts`: add a `service_problems` source → `catalog_service_problems`, `valueField:'name'` (stores the problem name, like component_statuses).

`src/lib/diagnosticsTransform.ts`: add `symptoms`, `diagnostic_status`, `recovery_chance`, `diagnostic_notes` to `RESULT_FIELDS` and optional `string` fields to `DeviceDiagnostics`. (Diagnostic Notes uses its OWN `diagnostic_notes` key — NOT `technical_notes`, which the raid/nas component config already uses; avoids a write collision.)

`src/lib/queryKeys.ts`: add `deviceServiceProblems` to `masterDataKeys`.

`DeviceFieldRenderer.tsx`: select/component-status branch uses `def.staticOptions ?? options`.

## 9. Modal save/state changes

- **Structural payload shrinks:** `symptoms`/`notes`/`diagnosis`/`recovery_result` move OUT of the modal's structural payload into `DIAGNOSTIC_FIELDS` (the serializer writes them now). The structural payload keeps `device_role_id`, `password`, `role_notes`. (Avoid double-writing — remove them from structural.)
- Hydrate/serialize unchanged in mechanism: `DIAGNOSTIC_FIELDS` ride `ALL_FIELD_DEFS`. The new jsonb keys flow through `diagnosticsPatch` → `upsertDeviceDiagnostics` (all roles), exactly like component statuses.
- `is_primary` (RPC), donor override, soft-delete, the `isFormValid` (Device Role + Device Type for non-donor) all preserved.
- **Cross-tab validation:** on Save with invalid required fields, switch `activeTab` to the tab holding the first error (Device Type → Tab 1) and surface the error; the Tabs strip shows an error-dot on that tab.

## 10. Files

**New:** `src/components/ui/Tabs.tsx`, `src/components/cases/device-form/DeviceDiagnosticForm.tsx`, `src/components/cases/device-form/DeviceComponentsForm.tsx`, tests for each.
**Edit:** `DeviceFormModal.tsx` (Dialog shell + tabs + sticky footer + password→Tab1 + structural shrink), `DeviceDetailsForm.tsx` (→ Tab 1 dense 4-col, drop collapsibles + components), `DeviceFieldRenderer.tsx` (`size`, `staticOptions`), `ui/{Input,Select,SearchableSelect,Textarea,MultiSelectDropdown}.tsx` (`size` cva), `deviceFieldConfig.ts`, `deviceCatalogQueries.ts`, `diagnosticsTransform.ts`, `queryKeys.ts`.
**Frozen:** `CreateCaseWizard.tsx`, `ServerBulkDrivesModal.tsx`. `Modal.tsx` untouched (we bypass it).

## 11. UX & theming

- Tokens only: tabs `cat-1..cat-4`, dividers `border-border`, surfaces `bg-surface`/`bg-surface-muted`, focus `ring-ring`, labels `text-sm font-medium text-slate-700`, required `text-danger`. No purple/indigo/violet; no status palette for tabs. lucide icons only; `DM Sans`; Tailwind v3.4.
- Responsive: 4-col → `sm:` 2-col → 1-col (Tab 1); 3-col → 2 → 1 (Tab 2). No horizontal scroll. Sticky footer always visible; tabs in the non-scrolling header.
- a11y: `Tabs` full keyboard + ARIA; inputs keep `useFieldA11y`; validation errors below fields + error-dot on the tab; Save focus-jumps to the offending tab.
- i18n: tab labels + new field labels via `t(key, { defaultValue })`.

## 12. Testing (TDD; jsdom/vitest)

1. **Tabs**: renders tablist + tabs; click/arrow-key changes active (`aria-selected`); `disabled` skipped; `hasError` dot present; active uses the colorToken border.
2. **size variant**: `Input size="sm"` applies the dense classes; default `md` unchanged (snapshot/class assertion); existing Input/SearchableSelect tests still green.
3. **deviceFieldConfig**: `DIAGNOSTIC_FIELDS` present + in `ALL_FIELD_DEFS`; updated invariants (select has optionsSource|staticOptions; no shared storage target); `staticOptions` selects carry options.
4. **deviceCatalogQueries**: `service_problems` source present with `valueField:'name'`.
5. **diagnosticsTransform**: 4 new keys round-trip; existing keys intact (additive).
6. **DeviceDiagnosticForm**: renders the 8 fields in a 3-col grid; Diagnostic Notes full-width; Device Problem is a combobox; no password field present.
7. **DeviceDetailsForm (Tab 1)**: dense 4-col grid; merged Basic+Technical; no `CollapsibleSection`; no component fields; password + role_notes present.
8. **DeviceFormModal**: renders the 4-tab shell with sticky footer; switching tabs preserves entered state; donor role disables Tabs 2–3; full suite + typecheck green.

## 13. Out of scope

Device-level Recovery Priority + Engineer Assigned (migration deferred); `catalog_service_problems` FK persistence (still stored as name text); History/Activity tab content; the PDF report-engine category gate (separate follow-up from the prior feature); `Modal.tsx` refactor.
