# Device Catalog Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the duplicate `catalog_device_interfaces`→`catalog_interfaces` and `master_inventory_item_categories`→`master_inventory_categories` catalogs, and fix the inventory import field-mapping alias collision.

**Architecture:** Code-first (local, safe), then a DML-only migration applied to the live DB last and only on explicit go-ahead. The app/service layer already references the canonical tables; the dead tables live only in Settings config + seed; `item_category_id` lives only in generated types. So the code surface is: 1 alias fix (TDD), Settings/seed retirement of `catalog_device_interfaces`, a type rename, 2 optional touch-ups, and the migration.

**Tech Stack:** React 19 + TypeScript + Vite, Supabase (Postgres), Vitest (jsdom), Supabase MCP `apply_migration`.

**Spec:** `docs/superpowers/specs/2026-06-25-device-catalog-consolidation-design.md`

## Global Constraints
- No `DROP TABLE` / `DROP COLUMN` / `DELETE FROM`. Retire via `is_active = false` (these catalogs use `is_active`, NOT `deleted_at`) + deprecation comments.
- These are **global** catalogs (no `tenant_id`); RLS is platform-admin-write.
- `catalog_device_interfaces` and the two `master_inventory_item_categories` have **no `updated_at`** column; only `catalog_interfaces` has `updated_at`. Do not set `updated_at` on tables that lack it.
- Migration is DML-only → **no DDL → `database.types.ts` is unchanged** (do NOT regenerate types; schema-drift stays green).
- Supabase project_id: `ssmbegiyjivrcwgcqutu`. Apply migrations via `mcp__supabase__apply_migration`.
- Hold `npm run typecheck` = 0 and `npm run lint` clean on every task.
- All work local; **no `git push` / PR** unless the owner explicitly asks.
- **Apply the migration to the live DB only on explicit owner go-ahead** (Task 7 is gated).

---

## File Structure
- `src/lib/importExportService.ts` — alias arrays (B4 fix), `referenceFields` (already correct).
- `src/lib/importExportService.test.ts` — **new**, unit test for `suggestFieldMapping` (B4).
- `src/config/settingsCategories.ts` — `MasterDataTable` union, `device-media` tables list, `TABLE_LABELS` (retire `catalog_device_interfaces`).
- `src/config/settingsCategories.test.ts` — **new**, config invariants test.
- `src/config/seedData.ts` — `DEVICE_MEDIA_SEED_DATA` (move granular list to `catalog_interfaces`).
- `src/lib/seedService.ts` — `checkIfSeeded` list, `tableLabels`, `tables` array, and the list near line ~1080.
- `src/lib/inventoryService.ts` — rename exported type `InventoryItemCategory` → `InventoryCategory`.
- `src/pages/inventory/InventoryListPage.tsx`, `src/pages/inventory/InventoryFormPage.tsx` — update type import (and optional B3).
- `src/components/importExport/ImportWizard.tsx` — optional `item_category` option → `category_id`.
- `supabase/migrations/<ts>_consolidate_device_catalogs.sql` — **new**, the DML migration.
- `supabase/migrations.manifest.md` — add the migration entry.

---

### Task 1: Fix inventory import alias collision (B4) — TDD

**Files:**
- Create: `src/lib/importExportService.test.ts`
- Modify: `src/lib/importExportService.ts:777,793`

**Interfaces:**
- Consumes: `suggestFieldMapping(sourceFields: string[], entityType: EntityType): Record<string, { target: string; confidence: number }>` (exported, `importExportService.ts:745`).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/importExportService.test.ts
import { describe, it, expect, vi } from 'vitest';
// suggestFieldMapping is pure; mock the supabase import so the module loads without env/network.
vi.mock('./supabaseClient', () => ({ supabase: {} }));
import { suggestFieldMapping } from './importExportService';

describe('suggestFieldMapping — inventory alias disambiguation (B4)', () => {
  it("maps a 'category' column to category_id, not device_type_id", () => {
    const r = suggestFieldMapping(['category'], 'inventory');
    expect(r['category']?.target).toBe('category_id');
  });

  it("maps a 'type' column to device_type_id", () => {
    const r = suggestFieldMapping(['type'], 'inventory');
    expect(r['type']?.target).toBe('device_type_id');
  });

  it("still maps 'device_type' to device_type_id", () => {
    const r = suggestFieldMapping(['device_type'], 'inventory');
    expect(r['device_type']?.target).toBe('device_type_id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/importExportService.test.ts`
Expected: the first test FAILS — currently `'category'` maps to `device_type_id` (its alias list at line 777 includes `'category'`, and `device_type_id` is iterated before `category_id`). The other two pass.

- [ ] **Step 3: Make the minimal edit**

In `src/lib/importExportService.ts`, line 777 — remove `'category'`:
```ts
      device_type_id: ['device_type', 'type', 'device'],
```
line 793 — remove `'type'`:
```ts
      category_id: ['category', 'item_category'],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/importExportService.test.ts`
Expected: all 3 PASS. (`'type'` still resolves to `device_type_id`; `'category'`/`'item_category'` now resolve to `category_id`.)

- [ ] **Step 5: typecheck + commit**

```bash
npm run typecheck
git add src/lib/importExportService.ts src/lib/importExportService.test.ts
git commit -m "fix(import): disambiguate inventory category/type field-mapping aliases (B4)"
```

---

### Task 2: Retire `catalog_device_interfaces` from Settings + seed (B1 code) — config test

**Files:**
- Create: `src/config/settingsCategories.test.ts`
- Modify: `src/config/settingsCategories.ts:27,109,299`
- Modify: `src/config/seedData.ts:129`
- Modify: `src/lib/seedService.ts` (occurrences at ~68, ~135, ~149, ~1080)

**Interfaces:**
- Consumes: `SETTINGS_CATEGORIES`, `TABLE_LABELS`, `MasterDataTable` (exported from `settingsCategories.ts`).
- Produces: a single `catalog_interfaces`="Interfaces" Device & Media tab; `catalog_device_interfaces` no longer referenced in Settings/seed.

- [ ] **Step 1: Write the failing test**

```ts
// src/config/settingsCategories.test.ts
import { describe, it, expect } from 'vitest';
import { SETTINGS_CATEGORIES, TABLE_LABELS } from './settingsCategories';

describe('Device & Media settings — interface catalog consolidation', () => {
  const deviceMedia = SETTINGS_CATEGORIES.find((c) => c.id === 'device-media')!;

  it('exposes catalog_interfaces and not catalog_device_interfaces', () => {
    expect(deviceMedia.tables).toContain('catalog_interfaces');
    expect(deviceMedia.tables).not.toContain('catalog_device_interfaces');
  });

  it('labels catalog_interfaces as "Interfaces" and has no catalog_device_interfaces label', () => {
    expect(TABLE_LABELS.catalog_interfaces).toBe('Interfaces');
    expect((TABLE_LABELS as Record<string, string>).catalog_device_interfaces).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/settingsCategories.test.ts`
Expected: FAIL — `deviceMedia.tables` currently contains `catalog_device_interfaces` (line 109) and `TABLE_LABELS.catalog_device_interfaces` is `'Device Interface'` (line 299).

- [ ] **Step 3: Edit `settingsCategories.ts`**

Remove the union member (line 27) — delete this line:
```ts
  | 'catalog_device_interfaces'
```
Remove the device-media tables entry (line 109) — delete this line, keeping `catalog_interfaces` (110):
```ts
      'catalog_device_interfaces',
```
Remove the `TABLE_LABELS` entry (line 299) — delete this line, keeping `catalog_interfaces: 'Interfaces',` (300):
```ts
  catalog_device_interfaces: 'Device Interface',
```

- [ ] **Step 4: Edit `seedData.ts`** — rename the seed key so the granular list seeds the canonical table.

At line 129, change the key (the 30-value array body stays identical):
```ts
  catalog_interfaces: [
    'SATA I (1.5 Gb/s)',
    // … all 30 values unchanged …
    'Ethernet (RJ45)',
  ],
```

- [ ] **Step 5: Edit `seedService.ts`** — replace every `catalog_device_interfaces` with `catalog_interfaces`.

```bash
grep -n "catalog_device_interfaces" src/lib/seedService.ts
```
Expected sites: `checkIfSeeded` list (~68), `tableLabels` (~135), `tables` array (~149), and a list near ~1080. For the array/list sites replace the string with `'catalog_interfaces'`. For the `tableLabels` site change both key and value:
```ts
      catalog_interfaces: 'Interfaces',
```
Verify none remain:
```bash
grep -c "catalog_device_interfaces" src/lib/seedService.ts   # expect 0
```

- [ ] **Step 6: Run config test + typecheck + lint**

Run:
```bash
npx vitest run src/config/settingsCategories.test.ts
npm run typecheck
npm run lint
```
Expected: test PASS; typecheck 0 (the `TABLE_LABELS: Record<MasterDataTable,…>` stays exhaustive because the union member was removed in lockstep); lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/config/settingsCategories.ts src/config/settingsCategories.test.ts src/config/seedData.ts src/lib/seedService.ts
git commit -m "feat(settings): retire catalog_device_interfaces; single Interfaces tab on catalog_interfaces (B1)"
```

---

### Task 3: Rename `InventoryItemCategory` type → `InventoryCategory` (B2 clarity)

**Files:**
- Modify: `src/lib/inventoryService.ts:6,29`
- Modify: `src/pages/inventory/InventoryListPage.tsx:21,35`
- Modify: `src/pages/inventory/InventoryFormPage.tsx:14,34`

**Interfaces:**
- Produces: exported type `InventoryCategory = Database['public']['Tables']['master_inventory_categories']['Row']` (replaces `InventoryItemCategory`, which misleadingly implied the dead `master_inventory_item_categories`).

- [ ] **Step 1: Rename the declaration + cast in `inventoryService.ts`**

Line 6:
```ts
export type InventoryCategory = Database['public']['Tables']['master_inventory_categories']['Row'];
```
Line 29:
```ts
  return (data ?? []) as InventoryCategory[];
```

- [ ] **Step 2: Update the two consumers**

`src/pages/inventory/InventoryListPage.tsx` line 21 import and line 35 usage:
```ts
  type InventoryCategory,
```
```ts
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
```
`src/pages/inventory/InventoryFormPage.tsx` line 14 import and line 34 usage — identical two changes.

- [ ] **Step 3: Verify no stale references remain**

```bash
grep -rn "InventoryItemCategory" src   # expect 0
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventoryService.ts src/pages/inventory/InventoryListPage.tsx src/pages/inventory/InventoryFormPage.tsx
git commit -m "refactor(inventory): rename InventoryItemCategory type to InventoryCategory (B2)"
```

---

### Task 4 (optional): ImportWizard `item_category` option → `category_id`

**Files:**
- Modify: `src/components/importExport/ImportWizard.tsx:523`

**Interfaces:** none.

- [ ] **Step 1: Confirm how the target is consumed**

```bash
grep -n "item_category\|category_id" src/components/importExport/ImportWizard.tsx
```
Confirm the inventory "Basic Information" optgroup offers `item_category` (line 523) while `category_id` is the canonical inventory field (`importExportService.ts` referenceFields:290). The mapping value is the import target field; `category_id` is what the importer resolves against `master_inventory_categories`.

- [ ] **Step 2: Edit the option**

Line 523:
```tsx
                          <option value="category_id">category_id (Category)</option>
```

- [ ] **Step 3: typecheck + commit**

```bash
npm run typecheck
git add src/components/importExport/ImportWizard.tsx
git commit -m "fix(import): map the inventory category option to category_id (B2)"
```

---

### Task 5 (optional, verify-first): B3 — InventoryListPage reads a non-existent column

**Files:**
- Modify: `src/pages/inventory/InventoryListPage.tsx:507,510`

- [ ] **Step 1: Verify the column actually does not exist**

```bash
grep -n "inventory_code\|item_number" src/types/database.types.ts | grep -i inventory_items
```
Confirm `inventory_items` has `item_number` and **no** `inventory_code`. If `inventory_code` exists on the row type, STOP — B3 is not a bug; skip this task.

- [ ] **Step 2: Repoint the badge to `item_number`**

Line 507 and 510 — replace `item.inventory_code` with `item.item_number` (and the displayed value):
```tsx
                          {item.item_number && (
                            <div className="inline-flex items-center gap-1.5 bg-info-muted border border-info/30 rounded-md px-2.5 py-1">
                              <span className="text-xs font-medium text-info">INV#:</span>
                              <span className="text-sm font-bold text-info font-mono tracking-wide">{item.item_number}</span>
                            </div>
                          )}
```

- [ ] **Step 3: typecheck + commit**

```bash
npm run typecheck
git add src/pages/inventory/InventoryListPage.tsx
git commit -m "fix(inventory): render INV# badge from item_number, not non-existent inventory_code (B3)"
```

---

### Task 6: Author the consolidation migration (SQL file + manifest)

**Files:**
- Create: `supabase/migrations/20260625120000_consolidate_device_catalogs.sql`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:** none (DML).

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260625120000_consolidate_device_catalogs.sql
-- DML-only. Consolidate duplicate catalogs. No DDL → database.types.ts unchanged.
-- All affected FK columns have 0 rows (verified 2026-06-25): zero orphan risk.

-- 1. Interfaces: seed the 23 granular values not yet present in the canonical table.
insert into catalog_interfaces (id, name, is_active, sort_order, created_at, updated_at)
select gen_random_uuid(), v.name, true, v.ord, now(), now()
from (values
  ('SATA I (1.5 Gb/s)',10),('SATA II (3 Gb/s)',11),('SATA III (6 Gb/s)',12),
  ('USB 2.0',20),('USB 3.0',21),('USB 3.1',22),('USB 3.2',23),('USB-C',24),
  ('Thunderbolt 2',31),('Thunderbolt 3',32),('Thunderbolt 4',33),
  ('PCIe x1',40),('PCIe x4',41),('PCIe x8',42),('PCIe x16',43),
  ('M.2 SATA',50),('M.2 NVMe',51),
  ('FireWire 400',60),('FireWire 800',61),
  ('SD',70),('MicroSD',71),('CF',72),
  ('Ethernet (RJ45)',81)
) as v(name, ord)
where not exists (select 1 from catalog_interfaces ci where ci.name = v.name);

-- 2. Deactivate the coarse parents now superseded by granular children.
update catalog_interfaces
set is_active = false, updated_at = now()
where name in ('USB','SATA','M.2','NVMe','PCIe','FireWire','SD/MMC','Ethernet');

-- 3. Retire the disconnected interface catalog (no updated_at column on this table).
update catalog_device_interfaces set is_active = false;
comment on table catalog_device_interfaces is
  'DEPRECATED 2026-06-25 — consolidated into catalog_interfaces. Not FK-referenced.';

-- 4. Categories: add the 3 genuinely-new parts categories to the canonical table.
insert into master_inventory_categories (id, name, is_active, sort_order, created_at)
select gen_random_uuid(), v.name, true, v.ord, now()
from (values ('Donor Drives',100),('Head Assemblies',101),('Motors',102)) as v(name, ord)
where not exists (select 1 from master_inventory_categories m where m.name = v.name);

-- 5. Retire the disconnected category catalog (no updated_at column).
update master_inventory_item_categories set is_active = false;
comment on table master_inventory_item_categories is
  'DEPRECATED 2026-06-25 — consolidated into master_inventory_categories.';
comment on column inventory_items.item_category_id is
  'DEPRECATED 2026-06-25 — use category_id (master_inventory_categories).';
```

- [ ] **Step 2: Add the manifest entry**

Append this row to the table in `supabase/migrations.manifest.md` (format is `| timestamp | name | type | description | tag |`):

```
| 20260625120000 | consolidate_device_catalogs | Data (DML consolidation) | Tier 2 catalog consolidation — seed 23 granular interfaces into catalog_interfaces + deactivate 8 coarse parents (USB/SATA/M.2/NVMe/PCIe/FireWire/SD-MMC/Ethernet); retire catalog_device_interfaces (is_active=false, 0 FK refs); add Donor Drives/Head Assemblies/Motors to master_inventory_categories; retire master_inventory_item_categories; deprecation comments on both retired tables + inventory_items.item_category_id. All affected FK columns had 0 rows (verified 2026-06-25). No DDL → database.types.ts unchanged. | device-catalog |
```

- [ ] **Step 3: Commit (do NOT apply yet)**

```bash
git add supabase/migrations/20260625120000_consolidate_device_catalogs.sql supabase/migrations.manifest.md
git commit -m "feat(db): migration to consolidate device interface + inventory category catalogs (B1/B2)"
```

---

### Task 7: Apply migration to the live DB + verify — **GATED on explicit owner go-ahead**

**Files:** none (live DB operation).

- [ ] **Step 1: Confirm go-ahead.** Do not proceed without the owner explicitly approving application to `ssmbegiyjivrcwgcqutu`.

- [ ] **Step 2: Apply**

Call `mcp__supabase__apply_migration` with `project_id="ssmbegiyjivrcwgcqutu"`, `name="consolidate_device_catalogs"`, and the SQL from Task 6.

- [ ] **Step 3: Verify with assertions**

Run via `mcp__supabase__execute_sql` (project `ssmbegiyjivrcwgcqutu`):
```sql
select
 (select count(*) from catalog_interfaces where is_active) ci_active,        -- expect 30
 (select count(*) from catalog_device_interfaces where is_active) cdi_active, -- expect 0
 (select count(*) from master_inventory_categories where is_active) mic_active,        -- expect 10
 (select count(*) from master_inventory_item_categories where is_active) miic_active;  -- expect 0
```
Expected: `ci_active=30, cdi_active=0, mic_active=10, miic_active=0`. If any differ, stop and reconcile before continuing.

- [ ] **Step 4: Confirm types are unchanged (no DDL)**

Run: `npm run db:types` then `git diff --stat src/types/database.types.ts`
Expected: **no diff** (DML-only). If there IS a diff, something unexpected changed — investigate before committing.

---

## Notes for the implementer
- The dev server is running against the live project; after Task 7, reload Settings → Device & Media to eyeball the single "Interfaces" tab with the granular list.
- Tier 1 label renames (Media Type→Device Type, etc.) are explicitly out of scope here.
