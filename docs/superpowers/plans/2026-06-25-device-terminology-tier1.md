# Device Terminology — Tier 1 Renames + 2 Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Apply the locked terminology glossary (label-only, no schema/data change) across forms, PDFs, Settings, seed, and email vars — plus fix two carried follow-ups (inventory `inventory_code` import target → `item_number`; type `InventoryListPage` rows).

**Architecture:** Pure code edits on branch `feat/device-catalog-consolidation` (continues the catalog work; builds on its B3/B4). Mostly string-literal swaps; the only typed changes are one const rename (lockstep) and the F2 row typing. PDFs have a legacy builder + engine adapter per document — sibling sites MUST change together ("lockstep groups") so the two render paths stay identical. Source of exact edits: the verified manifest below.

**Tech Stack:** React 19 + TS + Vite + Supabase, Vitest.

## Global Constraints
- **Label/string edits only.** Do NOT change data bindings, input types, mustache tokens (`{{device.*}}`), i18n key *values*, or DB.
- **Bilingual PDFs: English side only.** Arabic (`ar:`) literals and `t('key', …)` keys stay (except the explicit `mediaDetails→deviceDetails` key rename in Task 2).
- **Lockstep groups change together** (legacy PDF doc + engine adapter) or the two render paths diverge.
- `npm run typecheck` = 0 every task. No `git push` / PR.
- Branch: `feat/device-catalog-consolidation` (already checked out).
- Leave OUT of scope (verified non-targets): the `ar` literals; the `case.problem` email var `'Problem Description'` (seedData ~L1063, different field); `IntegrityCheckModal.tsx` "Physical Condition" (evidence form label); `inventoryCaseAssignmentService.ts` `inventory_code` alias (display-only); the i18n key `'type'`/`'serialNumber'` (already correct); "Device Conditions/Roles" Settings tabs; "Device Model" column headers (column cluster, not email-vars).

---

### Task 1: Device Type label everywhere (12 edits)

**Files:** `CreateCaseWizard.tsx`, `DeviceFormModal.tsx`, `CaseOverviewTab.tsx`, `seedData.ts`, PDF docs `{ReportDocument,CheckoutFormDocument,CustomerCopyDocument,OfficeReceiptDocument}.ts`, engine adapters `{reportAdapter,checkoutAdapter,receiptAdapter}.ts`.

- [ ] **Step 1: Apply edits** (exact `current` → `target`):
  - `src/components/cases/CreateCaseWizard.tsx:819` `label="Media Type"` → `label="Device Type"`
  - `src/components/cases/CreateCaseWizard.tsx:825` `placeholder="Device type..."` → `placeholder="Select device type..."`
  - `src/components/cases/DeviceFormModal.tsx:616` `label="Media Type"` → `label="Device Type"`
  - `src/components/cases/detail/CaseOverviewTab.tsx:521` `<option value="">Select type...</option>` → `<option value="">Select device type...</option>`
  - `src/config/seedData.ts:982` `<tr><td>Type:</td><td>{{device.type}}</td></tr>` → `<tr><td>Device Type:</td><td>{{device.type}}</td></tr>`
  - **lockstep `report-device-type`** — `src/lib/pdf/documents/ReportDocument.ts:307`: replace the three `'Type'` English literals in `const typeLabel = isBilingual ? (t('type', '').split(' | ')[1] ? \`Type | ${…}\` : 'Type') : 'Type';` with `Device Type` (keep the `t('type', …)` key and the `.split(' | ')[1]` Arabic extraction); **and** `src/lib/pdf/engine/adapters/reportAdapter.ts:121`: `label: { en: 'Type', ar: 'النوع' }` → `label: { en: 'Device Type', ar: 'النوع' }`
  - **lockstep `checkout-device-type`** — `CheckoutFormDocument.ts:196`: `isBilingual ? t('type', 'Type') : 'Type'` → `isBilingual ? t('type', 'Device Type') : 'Device Type'`; **and** `engine/adapters/checkoutAdapter.ts:41`: `label: { en: 'Type', ar: 'النوع' }` → `{ en: 'Device Type', ar: 'النوع' }`
  - **lockstep `receipt-device-type`** — `CustomerCopyDocument.ts:180` and `OfficeReceiptDocument.ts:185`: both `isBilingual ? t('type', 'Type') : 'Type'` → `… 'Device Type') : 'Device Type'`; **and** `engine/adapters/receiptAdapter.ts:54`: `label: { en: 'Type', ar: 'النوع' }` → `{ en: 'Device Type', ar: 'النوع' }`
- [ ] **Step 2: Verify** — `npm run typecheck` (0) and `npx vitest run src/lib/pdf` (PDF/engine parity tests green). Grep `grep -rn '"Media Type"\|>Select type<\|label: { en: .Type.' src` returns no device-type leftovers.
- [ ] **Step 3: Commit** — `git commit -am "feat(ui): unify device-type label to 'Device Type' across form, PDFs, report template (Tier 1)"`

---

### Task 2: "Media Details" → "Device Details" + i18n key rename (7 runtime edits + comments)

**Files:** `ReportDocument.ts`, `engine/adapters/reportAdapter.ts`, `engine/sections/reportDiagnostics.ts`, `documentTranslations.ts`, (+ doc-comments in those + `engine/types.ts`, `templateConfig.ts`).

- [ ] **Step 1: Heading (lockstep `media-details-heading-parity`)**
  - `ReportDocument.ts:302` `: 'Media Details';` → `: 'Device Details';`
  - `engine/adapters/reportAdapter.ts:148` `title: { en: 'Media Details', ar: 'تفاصيل الوسائط' },` → `title: { en: 'Device Details', ar: 'تفاصيل الوسائط' },`
  - `engine/sections/reportDiagnostics.ts:69` `en(diagnostics.title, 'Media Details'),` → `en(diagnostics.title, 'Device Details'),`
- [ ] **Step 2: i18n key rename (lockstep `media-details-i18n-key`)** — rename key `mediaDetails`→`deviceDetails` at all three sites (values unchanged):
  - `ReportDocument.ts:301` `` ? `Media Details | ${t('mediaDetails', '').split(' | ')[1] || 'تفاصيل الوسائط'}` `` → `` ? `Device Details | ${t('deviceDetails', '').split(' | ')[1] || 'تفاصيل الوسائط'}` ``
  - `documentTranslations.ts:108` `mediaDetails: 'تفاصيل الوسائط',` → `deviceDetails: 'تفاصيل الوسائط',`
  - `documentTranslations.ts:359` `mediaDetails: 'Szczegóły Nośnika',` → `deviceDetails: 'Szczegóły Nośnika',`
  - Also rename the orphan key `documentTranslations.ts:264` `mediaDetailsType: 'النوع',` → `deviceDetailsType: 'النوع',` (no call sites; consistency).
- [ ] **Step 3: Doc comments (consistency)** — update the `Media Details`→`Device Details` text in comments at `ReportDocument.ts:298`, `reportAdapter.ts:11,24,108,268`, `reportDiagnostics.ts:3,8,48`, `engine/types.ts:472,481,489,596`, `templateConfig.ts:763`. (Comments only — apply with line numbers; some snippets repeat, disambiguate by surrounding text.)
- [ ] **Step 4: Verify** — `npm run typecheck` (0); `npx vitest run src/lib/pdf` green; `grep -rn 'mediaDetails\|Media Details' src` returns 0 (the rename is complete).
- [ ] **Step 5: Commit** — `git commit -am "feat(pdf): rename 'Media Details' → 'Device Details' (heading + i18n keys) (Tier 1)"`

---

### Task 3: "Serial No" → "Serial Number" + caps (4 edits)

- [ ] **Step 1: Apply**
  - **lockstep `pdf-report-serial-label`** — `ReportDocument.ts:310`: replace the three `'Serial No'` English literals in `const serialLabel = …` with `Serial Number` (keep `t('serialNumber', …)`); **and** `reportAdapter.ts:124`: `label: { en: 'Serial No', ar: 'الرقم التسلسلي' }` → `{ en: 'Serial Number', ar: 'الرقم التسلسلي' }`
  - `src/components/cases/detail/CaseDevicesTab.tsx:85` `>s/n: {device.serial_number}<` → `>S/N: {device.serial_number}<` (caps; line 336 already `S/N:` — leave)
  - `src/components/cases/ServerBulkDrivesModal.tsx:461` `placeholder="Enter S/N..."` → `placeholder="Enter serial number..."`
- [ ] **Step 2: Verify** — `npm run typecheck` (0); `npx vitest run src/lib/pdf` green; `grep -rn "'Serial No'\|Enter S/N\|>s/n:" src` → 0.
- [ ] **Step 3: Commit** — `git commit -am "feat(ui): 'Serial No' → 'Serial Number' in PDFs; standardize S/N caps + placeholder (Tier 1)"`

---

### Task 4: Settings tab labels (9 edits, 4 lockstep pairs)

**Files:** `src/config/settingsCategories.ts` (TABLE_LABELS), `src/lib/seedService.ts` (device-catalog tableLabels map).

- [ ] **Step 1: Apply** (each pair = settingsCategories + seedService, change together):
  - `settingsCategories.ts:298` & `seedService.ts:136`: `catalog_device_made_in: 'Device Made In',` → `'Made In',`
  - `settingsCategories.ts:299` & `seedService.ts:137`: `catalog_device_encryption: 'Device Encryption',` → `'Encryption',`
  - `settingsCategories.ts:300` & `seedService.ts:138`: `catalog_device_platter_counts: 'Device Platter No',` → `'Platter Count',`
  - `settingsCategories.ts:301` & `seedService.ts:139`: `catalog_device_head_counts: 'Device Head No',` → `'Head Count',`
  - `settingsCategories.ts:304` (single): `catalog_service_problems: 'Device Problems',` → `'Service Problems',` (seedService L606 is already `'Service Problems'` — do NOT touch)
- [ ] **Step 2: Verify** — `npm run typecheck` (0); `npx vitest run src/config/settingsCategories.test.ts` green; `grep -rn "Device Made In\|Device Platter No\|Device Head No\|catalog_service_problems: 'Device Problems'\|catalog_device_encryption: 'Device Encryption'" src` → 0.
- [ ] **Step 3: Commit** — `git commit -am "feat(settings): drop redundant 'Device' prefixes; Platter/Head No → Count; service problems label (Tier 1)"`

---

### Task 5: Form field labels + problem + placeholder (5 edits)

- [ ] **Step 1: Apply**
  - `DeviceFormModal.tsx:738` `label="Encryption Type"` → `label="Encryption"`
  - `CreateCaseWizard.tsx:990` `label="Encryption Type"` → `label="Encryption"`
  - `DeviceFormModal.tsx:752` field label text `Problem Description` → `Device Problem` (label text only; do NOT change the textarea/`symptoms` binding)
  - `src/components/cases/detail/CaseDevicesTab.tsx:142` `>Problem Description</span>` → `>Device Problem</span>`
  - `CaseOverviewTab.tsx:521` `<option value="">Select type...</option>` → `<option value="">Select device type...</option>` *(if Task 1 already changed this exact line, skip — it's the same site; verify before editing)*
- [ ] **Step 2: Verify** — `npm run typecheck` (0); `grep -rn '"Encryption Type"\|>Problem Description<' src` → 0.
- [ ] **Step 3: Commit** — `git commit -am "feat(ui): 'Encryption Type'→'Encryption'; unify 'Problem Description'→'Device Problem' label (Tier 1)"`

> Note: `CaseOverviewTab.tsx:521` appears in both Task 1 and Task 5 manifests (same line). Whichever task runs first makes the change; the second must verify it's already done and skip.

---

### Task 6: "Device & Media" section + `DEVICE_MEDIA_SEED_DATA` const rename (8 edits)

- [ ] **Step 1: Const rename (lockstep `seed-const`, tsc-critical — all 3 together)**
  - `src/config/seedData.ts:1` `export const DEVICE_MEDIA_SEED_DATA = {` → `export const DEVICE_INVENTORY_SEED_DATA = {`
  - `src/lib/seedService.ts:4` import `DEVICE_MEDIA_SEED_DATA,` → `DEVICE_INVENTORY_SEED_DATA,`
  - `src/lib/seedService.ts:176` `const seedData = DEVICE_MEDIA_SEED_DATA[table];` → `DEVICE_INVENTORY_SEED_DATA[table];`
- [ ] **Step 2: User-facing section name (group `device-section-label`)**
  - `settingsCategories.ts:99` `title: 'Device & Media',` → `title: 'Devices & Inventory',` (keep `id: 'device-media'`)
  - `src/pages/settings/CategoryDetail.tsx:377` confirm msg `…all Device & Media tables…` → `…all Devices & Inventory tables…`
  - `seedService.ts:238` `…across ${seededCount} Device & Media tables` → `…Devices & Inventory tables`
  - `seedService.ts:240` `All Device & Media tables already have data…` → `All Devices & Inventory tables already have data…`
  - `src/config/settingsCategories.test.ts:4` describe `'Device & Media settings …'` → `'Devices & Inventory settings …'`
- [ ] **Step 3: Verify** — `npm run typecheck` (0, proves the const rename is complete); `npx vitest run src/config/settingsCategories.test.ts` green; `grep -rn 'DEVICE_MEDIA_SEED_DATA\|Device & Media' src` → 0. (Historical docs under `docs/` may still mention `DEVICE_MEDIA_SEED_DATA` — leave them.)
- [ ] **Step 4: Commit** — `git commit -am "refactor(settings): rename 'Device & Media' → 'Devices & Inventory' + DEVICE_INVENTORY_SEED_DATA (Tier 1)"`

---

### Task 7: Email/template variable display names (4 edits, `seedData.ts`)

- [ ] **Step 1: Apply** (display `name` only; `key`/`{{token}}` unchanged)
  - `seedData.ts:1067` `name: 'Device Brand'` → `name: 'Brand'`
  - `seedData.ts:1068` `name: 'Device Model'` → `name: 'Model'`
  - `seedData.ts:1071` `name: 'Physical Condition'` → `name: 'Condition'`
  - `seedData.ts:1023` report-template body `<p><strong>Physical Condition:</strong> {{device.condition}}</p>` → `<p><strong>Condition:</strong> {{device.condition}}</p>`
- [ ] **Step 2: Verify** — `npm run typecheck` (0); `grep -rn "name: 'Device Brand'\|name: 'Device Model'\|Physical Condition" src` → 0 (the `IntegrityCheckModal` "Physical Condition" is a different string with a `<label>` — confirm grep only flags seedData; if it flags IntegrityCheckModal, that's expected and OUT of scope, leave it).
- [ ] **Step 3: Commit** — `git commit -am "feat(templates): align device email-var display names (Brand/Model/Condition) (Tier 1)"`

> Note: these are seed display names — existing tenants keep the old names until re-seeded; tokens are unchanged so rendered reports are unaffected.

---

### Task 8: FOLLOW-UP F1 — `inventory_code` import target → `item_number` (6 edits + TDD)

**Files:** `ImportWizard.tsx`, `BulkInventoryImportModal.tsx`, `importExportService.ts` (+ test).

- [ ] **Step 1: Write the failing test** — append to `src/lib/importExportService.test.ts`:
```ts
describe('suggestFieldMapping — inventory_code header maps to item_number (F1)', () => {
  it("maps an 'inventory_code' / 'inv_code' column to item_number", () => {
    expect(suggestFieldMapping(['inventory_code'], 'inventory')['inventory_code']?.target).toBe('item_number');
    expect(suggestFieldMapping(['inv_code'], 'inventory')['inv_code']?.target).toBe('item_number');
  });
});
```
- [ ] **Step 2: Run → fails** — `npx vitest run src/lib/importExportService.test.ts` (current synonym keyed to dead `inventory_code` never fires → no/ wrong target).
- [ ] **Step 3: Apply edits**
  - `importExportService.ts:771` `inventory_code: ['inv_code', 'item_code', 'code', 'inv_no', 'item_no'],` → `item_number: ['inv_code', 'item_code', 'inv_no', 'item_no', 'inventory_code'],` (re-key to the real field; drop bare `'code'` to avoid hijacking `barcode`/`product_code`; add `'inventory_code'` for legacy CSVs)
  - `ImportWizard.tsx:526` `<option value="inventory_code">inventory_code</option>` → `<option value="item_number">item_number</option>`
  - `BulkInventoryImportModal.tsx:118` template header `'inventory_code',` → `'item_number',`
  - `BulkInventoryImportModal.tsx:310` `<option value="inventory_code">inventory_code</option>` → `<option value="item_number">item_number</option>`
  - `importExportService.ts:1024` (6-space) `'inventory_code',` → `'item_number',`
  - `importExportService.ts:1453` (4-space) `'inventory_code',` → `'item_number',`
- [ ] **Step 4: Run → passes** — `npx vitest run src/lib/importExportService.test.ts` (all green, incl. the existing category/type cases); `npm run typecheck` (0).
- [ ] **Step 5: Commit** — `git commit -am "fix(import): map inventory 'inventory_code' import target to real column item_number (F1)"`

> Do NOT touch `inventoryCaseAssignmentService.ts` (`inventory_code` is a legit display alias of `item_number` there).

---

### Task 9: FOLLOW-UP F2 — Type `InventoryListPage` rows (3 edits)

**File:** `src/pages/inventory/InventoryListPage.tsx`. (Verified by the discovery agent: these 3 edits → full-project `tsc` 0.)

- [ ] **Step 1: Add the derived row type** — `InventoryListPage.tsx:28` after `const PAGE_SIZE = 50;` add:
```ts

type InventoryRow = Awaited<ReturnType<typeof getInventoryItemsPage>>['rows'][number];
```
(`getInventoryItemsPage` is already imported. This resolves to the `inventory_items` Row + 7 nullable embeds + `similarCount`.)
- [ ] **Step 2: Type the state** — `:34` `const [items, setItems] = useState<any[]>([]);` → `useState<InventoryRow[]>([]);`
- [ ] **Step 3: Fix the surfaced phantom field** — `:607` `{item.status_type?.name || item.status}` → `{item.status_type?.name || 'N/A'}` (no `status` column exists; `|| item.status` always evaluated `undefined`. Without this, the new type fails `tsc` with TS2339.)
- [ ] **Step 4: Verify** — `npm run typecheck` (0); `grep -n 'any\[\]' src/pages/inventory/InventoryListPage.tsx` → 0.
- [ ] **Step 5: Commit** — `git commit -am "refactor(inventory): type InventoryListPage rows via derived InventoryRow; drop phantom item.status (F2)"`

---

## Final
After all tasks: `npm run typecheck` (0), `npm run lint`, `npx vitest run src/lib/pdf src/config src/lib/importExportService.test.ts` green. Whole-branch review, then report (no push).
