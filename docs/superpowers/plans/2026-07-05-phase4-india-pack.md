# Phase 4 — India Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship India as a `statutory_ready` country pack — a real Indian data-recovery lab runs compliantly on xSuite (GST CGST/SGST/IGST splitting, GSTIN capture, HSN/UQC, FY numbering, inclusive B2C with whole-rupee rounding, GSTR-3B/GSTR-1 data, TDS withholding, Rule 50/51 advance vouchers, Rule 55 challans, lakh/crore formatting) — flipped `statutory_ready` through the machine publish gate with external CA validation, with a written GA checklist gating the first real tenant.

**Architecture:** India is **data + thin parameter objects** over the shipped SPK+ fiscal kernel. `in_gst.compute()` is a one-line delegation to `computeWithMode(ctx, 'split_by_place_of_supply')` (zero kernel changes, zero contract-interface changes except one ratified additive `TaxDocumentType` widening for vouchers). Rates/requirements/rounding/numbering/words-scale are pack rows + registry keys; the composers, numbering policy, and document profile are new plugin registrations. The genuinely new surfaces are the GSTR composers, the advance-voucher money leg, TDS in `record_payment`, and the delivery challan — everything else flows through existing kernel primitives.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query v5, Supabase (Postgres 15, RLS, SECURITY DEFINER RPCs), Vitest 4 (node + jsdom, TZ pinned), pdfmake, zod. This plan adds **zero** npm packages.

**Governing spec:** `docs/superpowers/specs/2026-07-05-phase4-india-pack-design.md` (verified by a 5-lens adversarial panel — 42 findings folded in). The 2026-07-02 plan is a reference corpus only; where it conflicts with the spec, the spec wins.

## Global Constraints

Every task inherits these (exact values from CLAUDE.md + the spec):

- **Additive-only migrations**: no `DROP TABLE`/`DROP COLUMN`/`DELETE FROM` on production data; soft deletes only (`deleted_at = now()`). Apply via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) → regenerate `src/types/database.types.ts` via `mcp__supabase__generate_typescript_types` → append a row to `supabase/migrations.manifest.md` → use `.github/PULL_REQUEST_TEMPLATE/migration.md`.
- **New tenant-scoped table** gets: `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`; RLS ENABLE + FORCE; RESTRICTIVE `{table}_tenant_isolation` (`tenant_id = get_current_tenant_id() OR is_platform_admin()`); PERMISSIVE operation policies (financial writes `has_role('accounts')`, DELETE `has_role('admin')`); `set_<table>_tenant_and_audit` trigger; `idx_<table>_tenant_id` partial index `WHERE deleted_at IS NULL`; `deleted_at timestamptz DEFAULT NULL`.
- **Global/master tables**: no `tenant_id`; SELECT `USING (true)` for authenticated; write `is_platform_admin()` only.
- `maybeSingle()` never `single()` in frontend services. Import `Database` from `src/types/database.types.ts` only.
- `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) stays at **0 errors** (`scripts/check-tsc.sh` enforces zero).
- **Zero kernel changes**; kernel entry is `computeWithMode(ctx, 'split_by_place_of_supply')`. **Zero contract-interface changes** except WP-L4's additive `TaxDocumentType` union widening (assignability tests prove existing members unchanged).
- **Capability rows are NEVER hand-seeded** — each plugin WP registers in `src/lib/regimes/register.ts` and runs the `sync_engine_capabilities` RPC in the same PR; WP-S7 asserts all rows present pre-publish.
- All India logic under `src/lib/regimes/` (eslint `xsuite/no-country-branching-outside-regimes`); no ad-hoc money splits (`xsuite/no-adhoc-money-allocation` — `allocateLargestRemainder` only).
- `vat_records` stays amount-only; HSN/quantity aggregates from `invoice_line_items` + `document_tax_lines`.
- Statutory numerics: equal dual-levy heads (CGST = SGST = 9% of the same taxable value; the ±paise lands on a persisted Section 170 "Round off" line — the inclusive ₹5,000 fixture is **4,237.29 / 381.36 / 381.36 / −0.01 / 5,000.00**); rounding `level='head'`; `{FY}` renders short-form (`25-26`); `regime.einvoice='no_einvoice'` (no `in_irn` plugin/lifecycle this phase).
- PDFs: `pdfmake` only, programmatic, do NOT theme. Icons: `lucide-react` only. UI colors: the 14 semantic theme tokens only; read `DESIGN.md` before any visual change. Never hardcode currency symbols / tax labels / date formats — `TenantConfigContext` / pack data only.
- Custody/audit tables append-only; `chain_of_custody` 'financial' events preserved verbatim.
- Work lands on a fresh branch cut from `main` per WP (PR-per-WP, squash-merged); the assistant opens PRs, the owner merges; migration WPs are same-day PRs. **Verify the current branch (`git branch --show-current`) in the same chained command before every commit/push.**

## Work-Package Map & Merge Order

```
S1a → S1b → S2 → S3 → S4 → S5 → S6 → {L1, L4} → S7 (CA package → sign-off → publish = statutory_ready) → WP-GA
                                      L2 (≥S4) · L3 (before L4) · L5 (≥S4) · L6 (≥S5)
```

`src/lib/regimes/register.ts` is touched by S3/S4/S5/S6/L4 → they merge sequentially; L4 rebases after S6. S7's CA-package **step** requires L1 + L4 merged; the gate migrations and publish machinery do not. L3 merges before L4 (both splice `record_payment`).

| WP | Title | Size | Migration |
|----|-------|------|-----------|
| S1a | Schema Foundation | S | ✅ |
| S1b | India Data Pack | M | ✅ |
| S2 | IN Test Tenant + Buyer-Seam Threading | M | — |
| S3 | `in_gst` Strategy + Seam Completion + Fixtures | L | — |
| S4 | `in_gst_invoice` Profile + India Credit Notes | L | — |
| S5 | `in_fiscal_numbering` | S | — |
| S6 | `gstr` Return Composers | M | — |
| S7 | CA Gate ⑤ + Governed Publish | M | ✅ |
| L1 | Lakh/Crore Formatting + Indian Words + ₹ | S | — |
| L2 | GSTIN Registration Capture + Status Setting | M | — |
| L3 | TDS Withholding | M | ✅ |
| L4 | Advance Vouchers + Advance Money Leg | L | ✅ |
| L5 | IRN-Readiness | S | — |
| L6 | Rule 55 Delivery Challan | M | — |
| GA | GA Dry-Run Execution | S | — |

---


## Work Package WP-S1a — Schema Foundation [S, MIGRATION PR]

Branch: `feat/india-s1a-schema-foundation` (cut from `main`)
Depends on: nothing — first WP of Phase 4. Everything downstream (S1b's Studio-RPC seeding, S3's head-level rounding, S4's credit-note ref gate) consumes what lands here.

Scope is deliberately tiny (spec §4-S1a): (1) widen the rate-dimension unique with COALESCE'd `applies_to`, (2) widen the `master_document_requirements.field_key` CHECK with the credit-note original-invoice-ref key, (3) widen the `tax.rounding_policy` registry Zod `level` enum with `'head'` (verified absent — `src/lib/country/registry.ts:247` is `z.enum(['line', 'document'])`). Nothing else. The voucher `doc_type` CHECK widening is explicitly NOT here (WP-L4 owns it); no capability rows, no seeds, no plugins.

Live-verified facts this WP builds on (all probed read-only on `ssmbegiyjivrcwgcqutu`, 2026-07-05):
- `uq_geo_country_tax_rates_effective` = `UNIQUE (country_id, COALESCE(subdivision_id, '00000000-…-000000000000'::uuid), component_code, tax_category, valid_from) WHERE (deleted_at IS NULL)` — subdivision COALESCE and `tax_category` already present; only `applies_to` is missing.
- `geo_country_tax_rates.applies_to` exists (`text`, nullable). India currently has 3 Phase-1 rows, all `applies_to IS NULL` — the widening is strict (no existing row pair collides).
- **`upsert_country_tax_rate(p_row jsonb)` hard-codes an `ON CONFLICT (country_id, COALESCE(subdivision_id,…), component_code, tax_category, valid_from) WHERE deleted_at IS NULL` arbiter** (re-signed 20260705090200). Dropping/recreating the index with an extra column makes that inference fail with **42P10** on the very next Studio-RPC insert — and WP-S1b seeds ALL its rate rows through this RPC. The arbiter re-sign is therefore an inseparable part of the index widening and ships in the same migration. It is the ONLY function with an `ON CONFLICT` on this table (verified via `pg_get_functiondef` sweep).
- `master_document_requirements_field_key_check` = 7 values (`buyer_tax_number`, `buyer_address`, `place_of_supply_subdivision_id`, `supply_date`, `seller_tax_number`, `line.item_code`, `line.unit_code`). The new key is named **`original_invoice_ref`**.

### Task S1a.1: Rate-dimension unique widened with `applies_to` + `upsert_country_tax_rate` arbiter re-sign

**Files:**
- Migration: `phase4_s1a_rate_unique_applies_to` (via `mcp__supabase__apply_migration`, project_id `ssmbegiyjivrcwgcqutu`)
- Modify: `src/types/database.types.ts` (regenerated only — never hand-edited)
- Modify: `supabase/migrations.manifest.md` (append one row at end of table)

**Interfaces:**
- Consumes: live `geo_country_tax_rates` (columns verified above); live `upsert_country_tax_rate(p_row jsonb) RETURNS uuid` (body captured via `pg_get_functiondef` 2026-07-05, reproduced below with ONLY the arbiter changed); live index `uq_geo_country_tax_rates_effective`.
- Produces: unique index **`uq_geo_country_tax_rates_dims`** on `(country_id, COALESCE(subdivision_id, zero-uuid), component_code, tax_category, COALESCE(applies_to,''), valid_from) WHERE deleted_at IS NULL`; re-signed `upsert_country_tax_rate(p_row jsonb) RETURNS uuid` whose no-id branch upserts on the widened key — consumed by WP-S1b (all IN slab rows seed through this RPC; `gst_slab_18` CGST/SGST/IGST coexist inside `tax_category='standard'`) and by the publish-gate fixture machinery in WP-S7.

- [ ] **Step 1: Failing probe — the live unique rejects two same-category rows differing only in `applies_to`**

Run via `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
BEGIN;
INSERT INTO geo_country_tax_rates
  (country_id, subdivision_id, component_code, component_label, tax_category, rate, applies_to, valid_from, sort_order)
SELECT id, NULL, 'S1A_PROBE', 'S1A Probe', 'standard', 9.0, 'slab_a', DATE '2099-01-01', 9990
FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
INSERT INTO geo_country_tax_rates
  (country_id, subdivision_id, component_code, component_label, tax_category, rate, applies_to, valid_from, sort_order)
SELECT id, NULL, 'S1A_PROBE', 'S1A Probe', 'standard', 14.0, 'slab_b', DATE '2099-01-01', 9991
FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
ROLLBACK;
```

Expected: **FAIL** — second INSERT raises `23505 duplicate key value violates unique constraint "uq_geo_country_tax_rates_effective"` (the two rows differ only in `applies_to`, which the live index cannot see). The error aborts the transaction; nothing persists. Then confirm zero residue:

```sql
SELECT count(*) AS n FROM geo_country_tax_rates WHERE component_code = 'S1A_PROBE';
```

Expected: `n = 0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`), name `phase4_s1a_rate_unique_applies_to`, SQL:

```sql
-- P4 S1a: widen the rate-dimension unique so multiple slabs coexist within one
-- tax_category (India: CGST/SGST/IGST × gst_slab_18 are all 'standard').
-- Strict widening: every existing row (AE/IN/OM/GB/BH/SA seed) has applies_to NULL,
-- so no pre-existing pair collides. COALESCE keeps NULL applies_to deduplicated
-- exactly like the live subdivision_id COALESCE.
DROP INDEX IF EXISTS uq_geo_country_tax_rates_effective;
CREATE UNIQUE INDEX uq_geo_country_tax_rates_dims ON geo_country_tax_rates (
  country_id,
  COALESCE(subdivision_id, '00000000-0000-0000-0000-000000000000'::uuid),
  component_code,
  tax_category,
  COALESCE(applies_to, ''),
  valid_from
) WHERE deleted_at IS NULL;

-- Re-sign upsert_country_tax_rate: its no-id branch infers the arbiter from the OLD
-- column list, which no longer matches any unique index after the swap — every
-- Studio-RPC rate insert (WP-S1b seeds through this) would 42P10 without this.
-- Body is the live 20260705090200 definition verbatim; the ONLY change is
-- COALESCE(applies_to,'') added to the ON CONFLICT arbiter (idempotency semantics
-- preserved: same effective key -> DO UPDATE label/rate/pack_version_id, same id).
CREATE OR REPLACE FUNCTION public.upsert_country_tax_rate(p_row jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_country uuid := (p_row->>'country_id')::uuid; v_pack uuid; v_id uuid;
BEGIN
  PERFORM _pack_require_platform_admin();
  v_pack := _pack_open_version(v_country);
  IF v_pack IS NULL THEN
    RAISE EXCEPTION 'upsert_country_tax_rate: no open draft — call create_country_pack_draft first';
  END IF;
  IF (p_row->>'tax_category') NOT IN ('standard','reduced','zero','exempt') THEN
    RAISE EXCEPTION 'upsert_country_tax_rate: invalid tax_category %', p_row->>'tax_category';
  END IF;
  IF p_row ? 'id' THEN
    UPDATE geo_country_tax_rates SET
      subdivision_id = NULLIF(p_row->>'subdivision_id','')::uuid,
      component_code = p_row->>'component_code',
      component_label = p_row->>'component_label',
      component_label_i18n = p_row->'component_label_i18n',
      tax_category = p_row->>'tax_category',
      rate = (p_row->>'rate')::numeric,
      applies_to = NULLIF(p_row->>'applies_to',''),
      valid_from = (p_row->>'valid_from')::date,
      valid_to = NULLIF(p_row->>'valid_to','')::date,
      pack_version_id = v_pack,
      sort_order = COALESCE((p_row->>'sort_order')::int, 0)
    WHERE id = (p_row->>'id')::uuid AND country_id = v_country
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'upsert_country_tax_rate: row not found for this country'; END IF;
  ELSE
    INSERT INTO geo_country_tax_rates
      (country_id, subdivision_id, component_code, component_label, component_label_i18n,
       tax_category, rate, applies_to, valid_from, valid_to, pack_version_id, data_source, sort_order)
    VALUES
      (v_country, NULLIF(p_row->>'subdivision_id','')::uuid, p_row->>'component_code',
       p_row->>'component_label', p_row->'component_label_i18n', p_row->>'tax_category',
       (p_row->>'rate')::numeric, NULLIF(p_row->>'applies_to',''), (p_row->>'valid_from')::date,
       NULLIF(p_row->>'valid_to','')::date, v_pack, COALESCE(p_row->>'data_source','studio'),
       COALESCE((p_row->>'sort_order')::int, 0))
    ON CONFLICT (country_id, COALESCE(subdivision_id, '00000000-0000-0000-0000-000000000000'::uuid), component_code, tax_category, COALESCE(applies_to, ''), valid_from)
      WHERE deleted_at IS NULL
    DO UPDATE SET
      component_label = EXCLUDED.component_label,
      rate = EXCLUDED.rate,
      pack_version_id = EXCLUDED.pack_version_id
    RETURNING id INTO v_id;
  END IF;
  PERFORM _pack_touch(v_pack, 'country_tax_rate_upserted', 'geo_country_tax_rates', v_id, p_row);
  RETURN v_id;
END $function$;
```

Expected: migration applies clean (single transaction; table is ~20 rows, plain `CREATE UNIQUE INDEX` is fine).

- [ ] **Step 3: Passing probes — slab coexistence AND arbiter match, both rolled back**

Probe A (the Step-1 collision now succeeds), `mcp__supabase__execute_sql`:

```sql
BEGIN;
INSERT INTO geo_country_tax_rates
  (country_id, subdivision_id, component_code, component_label, tax_category, rate, applies_to, valid_from, sort_order)
SELECT id, NULL, 'S1A_PROBE', 'S1A Probe', 'standard', 9.0, 'slab_a', DATE '2099-01-01', 9990
FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
INSERT INTO geo_country_tax_rates
  (country_id, subdivision_id, component_code, component_label, tax_category, rate, applies_to, valid_from, sort_order)
SELECT id, NULL, 'S1A_PROBE', 'S1A Probe', 'standard', 14.0, 'slab_b', DATE '2099-01-01', 9991
FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
ROLLBACK;
```

Expected: **PASS** — both inserts succeed, `ROLLBACK` leaves no rows.

Probe B (the exact new arbiter expression binds to the new index — this is what the RPC's no-id branch will infer; a mismatch would raise `42P10` even inside a rolled-back transaction):

```sql
BEGIN;
INSERT INTO geo_country_tax_rates
  (country_id, subdivision_id, component_code, component_label, tax_category, rate, applies_to, valid_from, sort_order)
SELECT id, NULL, 'S1A_PROBE', 'S1A Probe', 'standard', 9.0, 'slab_a', DATE '2099-01-01', 9990
FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
INSERT INTO geo_country_tax_rates
  (country_id, subdivision_id, component_code, component_label, tax_category, rate, applies_to, valid_from, sort_order)
SELECT id, NULL, 'S1A_PROBE', 'S1A Probe v2', 'standard', 9.5, 'slab_a', DATE '2099-01-01', 9992
FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL
ON CONFLICT (country_id, COALESCE(subdivision_id, '00000000-0000-0000-0000-000000000000'::uuid), component_code, tax_category, COALESCE(applies_to, ''), valid_from)
  WHERE deleted_at IS NULL
DO UPDATE SET rate = EXCLUDED.rate
RETURNING rate;
ROLLBACK;
```

Expected: **PASS** — second statement returns `rate = 9.5` (conflict path taken, no 42P10). Then the state assertions:

```sql
SELECT
  (SELECT count(*) FROM pg_indexes WHERE tablename = 'geo_country_tax_rates' AND indexname = 'uq_geo_country_tax_rates_effective') AS old_idx,
  (SELECT count(*) FROM pg_indexes WHERE tablename = 'geo_country_tax_rates' AND indexname = 'uq_geo_country_tax_rates_dims'
     AND indexdef LIKE '%COALESCE(applies_to%') AS new_idx,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'upsert_country_tax_rate'
       AND pg_get_functiondef(p.oid) LIKE '%COALESCE(applies_to, %''%''%)%') AS fn_resigned,
  (SELECT count(*) FROM geo_country_tax_rates WHERE component_code = 'S1A_PROBE') AS residue;
```

Expected: `old_idx = 0`, `new_idx = 1`, `fn_resigned = 1`, `residue = 0`.

- [ ] **Step 4: Regenerate types + typecheck**

Run `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`), save the output over `src/types/database.types.ts`. Run `npm run typecheck`. Expected: exit 0. (Index + function-body changes don't alter table shapes — the types diff should be empty; if git reports no change, that is the expected outcome and the file simply isn't in the commit.)

- [ ] **Step 5: Manifest row + commit**

Append to the table at the end of `supabase/migrations.manifest.md` (fill `<version>` with the timestamp version reported by `mcp__supabase__list_migrations` for this migration):

```
| <version> | phase4_s1a_rate_unique_applies_to.sql | Additive (index + fn re-sign) | Rate-dimension unique widened with COALESCE'd applies_to (uq_geo_country_tax_rates_effective → uq_geo_country_tax_rates_dims) so GST slabs coexist within tax_category='standard'; upsert_country_tax_rate ON CONFLICT arbiter re-signed to the widened key (old arbiter would 42P10 on every Studio rate insert). Rolled-back probes: slab coexistence + arbiter DO UPDATE both verified live | P4 WP-S1a |
```

```bash
git add supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(db): widen rate unique with applies_to + re-sign upsert_country_tax_rate arbiter (P4 S1a)"
```

(If Step 4 produced no types diff, `git add` the manifest only.)

### Task S1a.2: `master_document_requirements.field_key` CHECK gains `original_invoice_ref`

**Files:**
- Migration: `phase4_s1a_docreq_field_key_original_invoice_ref` (via `mcp__supabase__apply_migration`, project_id `ssmbegiyjivrcwgcqutu`)
- Modify: `src/types/database.types.ts` (regenerated — expected no diff)
- Modify: `supabase/migrations.manifest.md` (append one row)

**Interfaces:**
- Consumes: live constraint `master_document_requirements_field_key_check` (7-value ARRAY, captured above); live `master_document_requirements` columns (`country_id, doc_type, field_key, condition, level, message_i18n, effective_from, pack_version_id` — verified in Phase 2 and re-probed).
- Produces: `field_key = 'original_invoice_ref'` is a legal requirement key — consumed by WP-S1b (seeds the credit-note `original_invoice_ref` block row) and WP-S4 (India credit notes enforce the original-invoice reference at issuance). The voucher `doc_type` widening (`receipt_voucher`/`refund_voucher`) is deliberately NOT done here — WP-L4 owns it.

- [ ] **Step 1: Failing probe — the live CHECK rejects the new key**

`mcp__supabase__execute_sql`:

```sql
BEGIN;
INSERT INTO master_document_requirements
  (country_id, doc_type, field_key, condition, level, message_i18n, effective_from)
SELECT id, 'credit_note', 'original_invoice_ref', NULL, 'block',
       jsonb_build_object('en', 'S1a probe'), DATE '2099-01-01'
FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
ROLLBACK;
```

Expected: **FAIL** — `23514 new row for relation "master_document_requirements" violates check constraint "master_document_requirements_field_key_check"`. Nothing persists.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`), name `phase4_s1a_docreq_field_key_original_invoice_ref`, SQL:

```sql
-- P4 S1a: field_key vocabulary gains the credit-note original-invoice-reference key
-- (CGST rule 53(1)(f): a credit note must carry the serial number and date of the
-- corresponding tax invoice). Strict widening: the 7 existing values are unchanged,
-- so every existing row still satisfies the new CHECK (validated at ADD time).
ALTER TABLE master_document_requirements
  DROP CONSTRAINT master_document_requirements_field_key_check;
ALTER TABLE master_document_requirements
  ADD CONSTRAINT master_document_requirements_field_key_check
  CHECK (field_key = ANY (ARRAY[
    'buyer_tax_number',
    'buyer_address',
    'place_of_supply_subdivision_id',
    'supply_date',
    'seller_tax_number',
    'line.item_code',
    'line.unit_code',
    'original_invoice_ref'
  ]::text[]));
```

Expected: applies clean (the `ADD CONSTRAINT` full-table validation passes because the value set is a superset).

- [ ] **Step 3: Passing probe + state assertion**

Re-run the exact Step-1 `BEGIN … ROLLBACK` block. Expected: **PASS** — INSERT succeeds, rolled back. Then:

```sql
SELECT
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid = 'master_document_requirements'::regclass
      AND conname = 'master_document_requirements_field_key_check') AS def,
  (SELECT count(*) FROM master_document_requirements WHERE field_key = 'original_invoice_ref') AS residue;
```

Expected: `def` contains `'original_invoice_ref'::text` (and still all 7 original values); `residue = 0` (no rows seeded — S1b/S4 own the rows).

- [ ] **Step 4: Regenerate types + typecheck**

Run `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`), save over `src/types/database.types.ts`; run `npm run typecheck`. Expected: exit 0, empty diff (CHECK constraints don't project into generated types).

- [ ] **Step 5: Manifest row + commit**

Append to `supabase/migrations.manifest.md`:

```
| <version> | phase4_s1a_docreq_field_key_original_invoice_ref.sql | Additive (CHECK widen) | master_document_requirements field_key CHECK gains 'original_invoice_ref' (CGST rule 53 credit-note original-invoice reference; requirement ROWS seed in S1b, enforcement in S4; voucher doc_type widening deferred to L4). Rolled-back probe verified live | P4 WP-S1a |
```

```bash
git add supabase/migrations.manifest.md
git commit -m "feat(db): widen master_document_requirements field_key CHECK with original_invoice_ref (P4 S1a)"
```

### Task S1a.3: `tax.rounding_policy` registry Zod `level` enum gains `'head'`

**Files:**
- Modify: `src/lib/country/registry.ts` (lines 242–251 — the `tax.rounding_policy` registry entry; `level: z.enum(['line', 'document'])` verified at line 247)
- Test: `src/lib/country/registryRegimeKeys.test.ts` (existing file; the `tax.rounding_policy` pin lives at lines 20–23)

**Interfaces:**
- Consumes: `COUNTRY_CONFIG_REGISTRY` export of `src/lib/country/registry.ts` (each entry exposes `key`, `schema` (Zod), `codedDefault`, `maxOverrideLayer`).
- Produces: the `tax.rounding_policy` registry schema accepts `{ mode: 'half_up', level: 'head', cash_increment: 1 }` — consumed by WP-S1b (the IN `country_config` binding per spec §3 must pass registry validation at authoring/resolution time; without this widening the IN pack binding is rejected) and by WP-S3 (which implements head-level rounding in the kernel path and widens the `RoundingPolicy` TS interface — NOT touched here per the §2 contract freeze; S1a changes registry Zod only). `codedDefault` stays `{ mode: 'half_up', level: 'document' }` (Oman byte-parity — the existing pin test keeps guarding it).

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('regime.* + reserved pack-schema keys (Phase 1 contract)', …)` block in `src/lib/country/registryRegimeKeys.test.ts`, directly after the `tax.rounding_policy is pack DATA with the Oman-parity default` test (after line 23):

```typescript
  it("tax.rounding_policy level accepts 'head' (India Section 170 per-head rounding — P4 S1a)", () => {
    const schema = byKey.get('tax.rounding_policy')!.schema;
    expect(schema.safeParse({ mode: 'half_up', level: 'head', cash_increment: 1 }).success).toBe(true);
    expect(schema.safeParse({ mode: 'half_up', level: 'line' }).success).toBe(true);
    expect(schema.safeParse({ mode: 'half_up', level: 'document' }).success).toBe(true);
    expect(schema.safeParse({ mode: 'half_up', level: 'total' }).success).toBe(false);
    expect(byKey.get('tax.rounding_policy')!.codedDefault).toEqual({ mode: 'half_up', level: 'document' });
  });
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
npx vitest run src/lib/country/registryRegimeKeys.test.ts
```

Expected: **FAIL** on the new test only — `safeParse({ …level: 'head'… }).success` is `false` because line 247's enum is `['line', 'document']`. The four pre-existing tests stay green.

- [ ] **Step 3: Minimal implementation**

Edit `src/lib/country/registry.ts` lines 243–248 — the full entry after the edit (only the `description` string and the `level` enum change; `codedDefault` and `maxOverrideLayer` untouched):

```typescript
  {
    key: 'tax.rounding_policy', domain: 'tax', label: 'Tax rounding policy',
    description: 'Pack DATA (graft 4): {mode: half_up|half_even, level: line|document|head, cash_increment?}. head = per-tax-head-per-document (India Sec 170). simple_vat default preserves Oman byte-parity.',
    schema: z.object({
      mode: z.enum(['half_up', 'half_even']),
      level: z.enum(['line', 'document', 'head']),
      cash_increment: z.number().positive().optional(),
    }),
    codedDefault: { mode: 'half_up', level: 'document' }, maxOverrideLayer: 'country',
  },
```

- [ ] **Step 4: Run the test suite — expect PASS**

```bash
npx vitest run src/lib/country/registryRegimeKeys.test.ts src/lib/country/registry.test.ts src/lib/country/resolveCountryConfig.test.ts src/lib/country/buildConfigLayers.test.ts
```

Expected: all green — the new test passes, and the enum widening breaks none of the existing registry/resolution suites (`'line'`/`'document'` values still parse; the Oman-parity `codedDefault` pin at `registryRegimeKeys.test.ts:21` is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/country/registry.ts src/lib/country/registryRegimeKeys.test.ts
git commit -m "feat(country): tax.rounding_policy level enum gains 'head' for India Sec 170 (P4 S1a)"
```

### Task S1a.4: WP verification + PR

**Files:**
- No new files. Verifies and ships Tasks S1a.1–S1a.3.

**Interfaces:**
- Consumes: everything produced above.
- Produces: the open WP-S1a migration PR (owner merges). WP-S1b branches from `main` only after this merges.

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```

Expected: exit 0, zero errors (CI-enforced baseline).

- [ ] **Step 2: Run the WP's test paths**

```bash
npx vitest run src/lib/country/registryRegimeKeys.test.ts src/lib/country/registry.test.ts src/lib/country/resolveCountryConfig.test.ts src/lib/country/buildConfigLayers.test.ts
```

Expected: all pass, including the new `'head'` acceptance test.

- [ ] **Step 3: Re-assert live DB end-state (both migrations, one probe)**

`mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
SELECT
  (SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_geo_country_tax_rates_dims' AND indexdef LIKE '%COALESCE(applies_to%') AS idx_ok,
  (SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_geo_country_tax_rates_effective') AS old_gone,
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'master_document_requirements'::regclass
     AND conname = 'master_document_requirements_field_key_check'
     AND pg_get_constraintdef(oid) LIKE '%original_invoice_ref%') AS check_ok;
```

Expected: `idx_ok = 1`, `old_gone = 0`, `check_ok = 1`.

- [ ] **Step 4: Push branch + open the migration PR (owner merges — do NOT merge)**

```bash
git push -u origin feat/india-s1a-schema-foundation
gh pr create --base main --title "P4 WP-S1a: Schema Foundation — rate-unique applies_to widening, CN original-invoice-ref field_key, rounding level 'head'" --body "$(cat <<'EOF'
## WP-S1a — Schema Foundation (Phase 4 India Pack, MIGRATION PR)

Per `docs/superpowers/specs/2026-07-05-phase4-india-pack-design.md` §4-S1a. Deliberately tiny — three widenings, no seeds, no plugins, no capability rows.

### Migrations (applied live via mcp__supabase__apply_migration)
1. **`phase4_s1a_rate_unique_applies_to`** — `uq_geo_country_tax_rates_effective` → `uq_geo_country_tax_rates_dims` with `COALESCE(applies_to,'')` added (subdivision COALESCE + tax_category were already present). Strict widening: all existing rows have `applies_to` NULL. **Includes the required `upsert_country_tax_rate` ON CONFLICT arbiter re-sign** — the RPC's no-id branch infers the old column list and would 42P10 on every S1b Studio rate insert otherwise. Verified live with rolled-back probes: pre-migration 23505 on two-slab insert; post-migration coexistence + arbiter DO UPDATE both pass; zero residue.
2. **`phase4_s1a_docreq_field_key_original_invoice_ref`** — `master_document_requirements.field_key` CHECK gains `original_invoice_ref` (CGST rule 53 credit-note original-invoice reference). Rows seed in S1b; enforcement in S4. Voucher `doc_type` widening deliberately deferred to WP-L4. Rolled-back 23514→pass probe verified live.

### Code
- `src/lib/country/registry.ts`: `tax.rounding_policy` Zod `level` enum widened `['line','document']` → `['line','document','head']` (India Section 170 per-head rounding, spec §3). `codedDefault` untouched — Oman byte-parity pin test still green. TS `RoundingPolicy` interface NOT touched (contract freeze §2; S3 owns kernel-side head handling).
- New test in `src/lib/country/registryRegimeKeys.test.ts` pinning `'head'` acceptance + `'total'` rejection + unchanged default.

### Checklist
- [x] `npm run typecheck` = 0
- [x] `npx vitest run src/lib/country/*.test.ts` green
- [x] `database.types.ts` regenerated (no shape change — index/CHECK/function-body only)
- [x] `supabase/migrations.manifest.md` +2 rows
- [x] Additive only; no DROP TABLE/COLUMN, no hard deletes, no hand-seeded capability rows

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opens against `main`. Report the PR URL; owner merges. WP-S1b starts on a fresh branch cut from `main` after merge.

---


## Work Package WP-S1b — India Data Pack [M, MIGRATION PR]
Branch: `feat/india-s1b-data-pack` (cut from `main`)
Depends on: **WP-S1a merged** — S1b consumes four S1a deliverables: (1) the new `uq_geo_country_tax_rates_dims` unique index widened to include `COALESCE(applies_to,'')`; (2) `upsert_country_tax_rate` re-signed so its `ON CONFLICT` target matches the widened index; (3) `master_document_requirements_field_key_check` **and** the `upsert_document_requirement` closed-vocabulary array both widened with `'original_invoice_ref'`; (4) the `tax.rounding_policy` Zod `level` enum in `src/lib/country/registry.ts` widened with `'head'`. Every task below probes its S1a precondition before seeding — a failed probe means STOP and fix S1a, not work around it.

All migrations in this WP are applied via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`). All pack-dimension seeds that have a Country Authoring Studio RPC (`create_country_pack_draft`, `upsert_country_tax_rate`, `update_country_pack_facts`, `upsert_country_numbering_policy`, `upsert_document_requirement` — all verified live, all `SECURITY DEFINER` requiring `is_platform_admin()` + a `platform_admins` row) go **through those RPCs** inside the migration, using the P3-proven transaction-local impersonation recipe (`docs/superpowers/handoff.md:38-41`): `set_config('request.jwt.claims', json_build_object('sub', <admin>, 'role','authenticated')::text, true)` as platform admin A (`d1139ac6-526c-4805-bbea-790985233725`, support@xsuite.space — the P3 dual-control **author**; S7 publishes as admin B, keeping `authored_by <> approved_by`). Dimensions with **no** studio RPC (`geo_subdivisions`, `master_unit_codes`) are seeded with direct idempotent SQL. **No capability rows are seeded anywhere in this WP** (spec §2 — capabilities are synced by each plugin WP via `sync_engine_capabilities`). **No `master_einvoice_regimes` row is seeded** (D3 — `regime.einvoice='no_einvoice'`; no `in_irn` anything). **No voucher requirement rows** (those are WP-L4). The pack draft created here stays **open** (`status='draft'`) — S3 records fixtures against it and S7 submits/publishes it.

Verified live state this WP builds on (probed 2026-07-05): `geo_countries` IN row exists (`config_status='formatting_ready'`, `tax_number_label='GSTIN'`, `fiscal_year_start='04-01'`, `country_config` already carries locale/currency/`number_format.digit_grouping='3;2'`); IN has **0** subdivisions, **0** pack versions, **0** numbering policies, **0** requirement rows, and **3** pre-seeded Phase-1 rate rows (CGST 9 / SGST 9 / IGST 18, all `tax_category='standard'`, `applies_to IS NULL`, `valid_from 2017-07-01`, `data_source='phase1-seed'`); `master_unit_codes` has 9 rows of which 6 have `uqc_code IS NULL` (E48, WEE, MON, ANN, E34, E35); `get_next_number(p_scope)` renders `{FY}` long-form via `v_fy_label := v_period || '-' || to_char(((v_period::int + 1) % 100), 'FM00');` and `preview_number_format(p_scope, p_format_template)` long-form in two branches; **zero** live `number_sequences` rows use an `{FY}` template (the short-form change is globally safe); `issue_credit_note` mints scope `'credit_note'`, `issue_tax_document` mints scope `'invoices'`.

---

### Task S1b.1: GST state-code seed — `geo_subdivisions`

**Files:**
- Migration: `india_gst_subdivisions_seed` (via `mcp__supabase__apply_migration`)
- Modify: `src/types/database.types.ts` (regenerated only — expected no diff), `supabase/migrations.manifest.md` (append one row)

**Interfaces:**
- Consumes: live `geo_subdivisions` (columns `id, country_id, parent_id, code, name, subdivision_type, tax_authority_code, sort_order, is_active, created_at, updated_at, deleted_at`; unique `(country_id, code)` — verified); `geo_countries` IN row (`code='IN'`).
- Produces: **38 IN subdivision rows** — 36 active GST states/UTs (2-digit GST state code in `tax_authority_code`; includes 26 = merged DNH+DD and 38 = Ladakh and AP = 37; codes 25 and 28 are defunct and absent) **plus** the two place-of-supply-only special rows **96 = `IN-FC` "Foreign Country"** and **97 = `IN-OT` "Other Territory"**, both flagged non-GSTIN via `subdivision_type = 'gst_special'`. Contract consumed by WP-S2 (buyer state capture / place-of-supply derivation), WP-S3 (`gstin.ts` validator set = the 36 rows where `subdivision_type <> 'gst_special'`, count-pinned), WP-S4 (place-of-supply state name+code rendering), WP-S6 (GSTR-3B Table 3.2 state-wise rows).

- [ ] **Step 1: Cut the branch**

```bash
git -C C:/Projects/Space_Recovery checkout main && git -C C:/Projects/Space_Recovery pull && git -C C:/Projects/Space_Recovery checkout -b feat/india-s1b-data-pack
```

- [ ] **Step 2: RED probe — assert the absent state**

`mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
SELECT count(*) AS n FROM geo_subdivisions s
JOIN geo_countries c ON c.id = s.country_id AND c.code = 'IN';
```

Expected: `n = 0` (nothing seeded — RED). If `n > 0`, stop and reconcile: someone seeded outside this plan.

- [ ] **Step 3: Apply the migration**

`mcp__supabase__apply_migration`, name `india_gst_subdivisions_seed`, SQL:

```sql
-- Phase 4 WP-S1b: full active GST state-code set (spec §3). ISO 3166-2:IN-style key in
-- `code`, statutory 2-digit GST state code (GSTIN prefix / place-of-supply code) in
-- `tax_authority_code`. Post-2020 list: 25 (Daman & Diu) merged into 26; 28 retired by
-- the 2014 AP bifurcation (AP = 37). Special codes 96 (Foreign Country) and 97 (Other
-- Territory) ARE seeded as place-of-supply-only rows, flagged non-GSTIN via
-- subdivision_type = 'gst_special' (WP-S3's GSTIN validator set = the other 36 rows).
-- Idempotent via anti-join. Part of the CA validation package (Task S1b.7 / WP-S7).
WITH ind AS (SELECT id FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL),
rows(code, name, subdivision_type, tax_authority_code, sort_order) AS (VALUES
  ('IN-JK', 'Jammu and Kashmir',                        'union_territory', '01', 10),
  ('IN-HP', 'Himachal Pradesh',                         'state',           '02', 20),
  ('IN-PB', 'Punjab',                                   'state',           '03', 30),
  ('IN-CH', 'Chandigarh',                               'union_territory', '04', 40),
  ('IN-UK', 'Uttarakhand',                              'state',           '05', 50),
  ('IN-HR', 'Haryana',                                  'state',           '06', 60),
  ('IN-DL', 'Delhi',                                    'union_territory', '07', 70),
  ('IN-RJ', 'Rajasthan',                                'state',           '08', 80),
  ('IN-UP', 'Uttar Pradesh',                            'state',           '09', 90),
  ('IN-BR', 'Bihar',                                    'state',           '10', 100),
  ('IN-SK', 'Sikkim',                                   'state',           '11', 110),
  ('IN-AR', 'Arunachal Pradesh',                        'state',           '12', 120),
  ('IN-NL', 'Nagaland',                                 'state',           '13', 130),
  ('IN-MN', 'Manipur',                                  'state',           '14', 140),
  ('IN-MZ', 'Mizoram',                                  'state',           '15', 150),
  ('IN-TR', 'Tripura',                                  'state',           '16', 160),
  ('IN-ML', 'Meghalaya',                                'state',           '17', 170),
  ('IN-AS', 'Assam',                                    'state',           '18', 180),
  ('IN-WB', 'West Bengal',                              'state',           '19', 190),
  ('IN-JH', 'Jharkhand',                                'state',           '20', 200),
  ('IN-OR', 'Odisha',                                   'state',           '21', 210),
  ('IN-CT', 'Chhattisgarh',                             'state',           '22', 220),
  ('IN-MP', 'Madhya Pradesh',                           'state',           '23', 230),
  ('IN-GJ', 'Gujarat',                                  'state',           '24', 240),
  ('IN-DH', 'Dadra and Nagar Haveli and Daman and Diu', 'union_territory', '26', 250),
  ('IN-MH', 'Maharashtra',                              'state',           '27', 260),
  ('IN-KA', 'Karnataka',                                'state',           '29', 270),
  ('IN-GA', 'Goa',                                      'state',           '30', 280),
  ('IN-LD', 'Lakshadweep',                              'union_territory', '31', 290),
  ('IN-KL', 'Kerala',                                   'state',           '32', 300),
  ('IN-TN', 'Tamil Nadu',                               'state',           '33', 310),
  ('IN-PY', 'Puducherry',                               'union_territory', '34', 320),
  ('IN-AN', 'Andaman and Nicobar Islands',              'union_territory', '35', 330),
  ('IN-TG', 'Telangana',                                'state',           '36', 340),
  ('IN-AP', 'Andhra Pradesh',                           'state',           '37', 350),
  ('IN-LA', 'Ladakh',                                   'union_territory', '38', 360),
  ('IN-FC', 'Foreign Country',                          'gst_special',     '96', 960),
  ('IN-OT', 'Other Territory',                          'gst_special',     '97', 970)
)
INSERT INTO geo_subdivisions (country_id, code, name, subdivision_type, tax_authority_code, sort_order, is_active)
SELECT ind.id, r.code, r.name, r.subdivision_type, r.tax_authority_code, r.sort_order, true
FROM rows r CROSS JOIN ind
WHERE NOT EXISTS (
  SELECT 1 FROM geo_subdivisions g WHERE g.country_id = ind.id AND g.code = r.code
);

-- Seed assertion: exact shape or the migration fails.
DO $$
DECLARE v_total int; v_special int; v_distinct int; v_defunct int;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE subdivision_type = 'gst_special'),
         count(DISTINCT tax_authority_code),
         count(*) FILTER (WHERE tax_authority_code IN ('25','28'))
    INTO v_total, v_special, v_distinct, v_defunct
  FROM geo_subdivisions s JOIN geo_countries c ON c.id = s.country_id AND c.code = 'IN'
  WHERE s.deleted_at IS NULL;
  IF v_total <> 38 OR v_special <> 2 OR v_distinct <> 38 OR v_defunct <> 0 THEN
    RAISE EXCEPTION 'S1b.1 seed assertion failed: total=% special=% distinct=% defunct=% (want 38/2/38/0)',
      v_total, v_special, v_distinct, v_defunct;
  END IF;
END $$;
```

- [ ] **Step 4: GREEN probe — spot-check statutory codes**

`mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT tax_authority_code FROM geo_subdivisions WHERE code='IN-KA') AS ka,
  (SELECT tax_authority_code FROM geo_subdivisions WHERE code='IN-MH') AS mh,
  (SELECT tax_authority_code FROM geo_subdivisions WHERE code='IN-DH') AS dh,
  (SELECT tax_authority_code FROM geo_subdivisions WHERE code='IN-AP') AS ap,
  (SELECT tax_authority_code FROM geo_subdivisions WHERE code='IN-LA') AS la,
  (SELECT subdivision_type   FROM geo_subdivisions WHERE code='IN-OT') AS ot_type,
  (SELECT subdivision_type   FROM geo_subdivisions WHERE code='IN-FC') AS fc_type;
```

Expected: `ka='29'`, `mh='27'`, `dh='26'`, `ap='37'`, `la='38'`, `ot_type='gst_special'`, `fc_type='gst_special'`.

- [ ] **Step 5: Regenerate types + typecheck**

Run `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`), save output over `C:/Projects/Space_Recovery/src/types/database.types.ts`. Run `npm run typecheck` — expected exit 0. Seed-only migration: `git diff --stat src/types/database.types.ts` expected empty (skip the add below if byte-identical).

- [ ] **Step 6: Manifest row + commit**

Append to `supabase/migrations.manifest.md` (fill the applied version from `mcp__supabase__list_migrations`):

```
| <version> | india_gst_subdivisions_seed | Additive (data seed) | India: 38 geo_subdivisions rows — 36 active GST state codes + 96/97 place-of-supply-only rows flagged subdivision_type='gst_special' (non-GSTIN); in-migration seed assertion 38/2/38/0 | Phase 4 S1b |
```

```bash
git add supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(geo): seed 36 GST state codes + 96/97 gst_special place-of-supply rows (WP-S1b)"
```

---

### Task S1b.2: `{FY}` token renders short-form (`25-26`) in `get_next_number` + `preview_number_format`

**Files:**
- Migration: `fy_token_short_form_render` (fn re-sign, via `mcp__supabase__apply_migration`)
- Modify: `src/types/database.types.ts` (regen — no diff expected), `supabase/migrations.manifest.md`
- Scratchpad: `C:/Users/SPACELAB/AppData/Local/Temp/claude/C--Projects-Space-Recovery/41cb8f1d-edd0-47ce-b30b-4a7953d09a32/scratchpad/get_next_number_captured.sql` (live capture, not committed)

**Interfaces:**
- Consumes: live `get_next_number(p_scope text)` (fiscal-FY label line verified: `v_fy_label := v_period || '-' || to_char(((v_period::int + 1) % 100), 'FM00');`); live `preview_number_format(p_scope text, p_format_template text)` (full body captured below).
- Produces: `{FY}` renders **`25-26`** (5 chars) for fiscal-year sequences in both the minting and preview paths — `'INV/{FY}/{SEQ:4}'` mints 14 chars, giving Rule 46(b) headroom for SEQ to grow to 6 digits inside the 16-char cap (spec §3). Consumed by Task S1b.5's policy seeds, WP-S5 (overflow/charset pinning + IN test-tenant backfill), WP-L4/L6 (voucher/challan numbers). Calendar-year `{FY}` rendering (`2025`) is intentionally untouched.

- [ ] **Step 1: RED probe — long-form rendering + zero blast radius**

`mcp__supabase__execute_sql` (single call; transaction rolled back):

```sql
BEGIN;
SELECT count(*) AS fy_templates_live FROM number_sequences WHERE format_template LIKE '%{FY}%';
SELECT set_config('request.jwt.claims', json_build_object('sub', p.id, 'role', 'authenticated')::text, true)
FROM profiles p
WHERE p.tenant_id IS NOT NULL AND p.role IN ('owner','admin') AND p.is_active AND p.deleted_at IS NULL
LIMIT 1;
SELECT preview_number_format('invoices', 'INV/{FY}/{SEQ:4}') AS preview;
ROLLBACK;
```

Expected: `fy_templates_live = 0` (the change affects no live sequence) and `preview = 'INV/2026-27/…'` — 16 chars, long-form: **RED**.

- [ ] **Step 2: Capture the live `get_next_number` definition (P3 method — reconcile against live first)**

`mcp__supabase__execute_sql`:

```sql
SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='get_next_number'
  AND pg_get_function_identity_arguments(p.oid) = 'p_scope text';
```

Save the returned body verbatim to the scratchpad file `get_next_number_captured.sql`. Confirm it contains **exactly one** occurrence of the fiscal-branch line:

```
v_fy_label := v_period || '-' || to_char(((v_period::int + 1) % 100), 'FM00');
```

If the line is absent or duplicated, STOP — live drift; reconcile before editing.

- [ ] **Step 3: Apply the migration (one-line edit to `get_next_number` + full re-sign of `preview_number_format`)**

`mcp__supabase__apply_migration`, name `fy_token_short_form_render`. The SQL is the **captured** `get_next_number` body with ONLY the fiscal-branch line replaced by:

```sql
v_fy_label := to_char((v_period::int % 100), 'FM00') || '-' || to_char(((v_period::int + 1) % 100), 'FM00');
```

(the calendar-year `v_fy_label := v_period;` and default `v_fy_label := to_char(v_today, 'YYYY');` lines stay byte-identical), followed by this complete replacement of `preview_number_format` (captured live 2026-07-05; both FY branch lines changed to short-form, everything else identical):

```sql
CREATE OR REPLACE FUNCTION public.preview_number_format(p_scope text, p_format_template text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := get_current_tenant_id();
  v_seq number_sequences%ROWTYPE;
  v_tz text; v_today date; v_fy_label text; v_pad int; v_next bigint;
BEGIN
  SELECT * INTO v_seq FROM number_sequences WHERE tenant_id = v_tenant AND scope = p_scope;
  v_next := COALESCE(v_seq.current_value, 0) + 1;
  SELECT timezone INTO v_tz FROM tenants WHERE id = v_tenant;
  v_today := (now() AT TIME ZONE COALESCE(v_tz, 'UTC'))::date;
  IF p_format_template IS NULL THEN
    RETURN COALESCE(v_seq.prefix, UPPER(LEFT(p_scope, 4))) || '-' || format_sequence_number(v_next, COALESCE(v_seq.padding, 4));
  END IF;
  v_pad := (regexp_match(p_format_template, '\{SEQ:(\d+)\}'))[1]::int;
  IF v_pad IS NULL THEN
    RAISE EXCEPTION 'format_template must contain {SEQ:n}';
  END IF;
  IF COALESCE(v_seq.fiscal_year_anchor, '01-01') <= to_char(v_today, 'MM-DD') THEN
    v_fy_label := to_char((EXTRACT(YEAR FROM v_today)::int % 100), 'FM00') || '-' || to_char(((EXTRACT(YEAR FROM v_today)::int + 1) % 100), 'FM00');
  ELSE
    v_fy_label := to_char(((EXTRACT(YEAR FROM v_today)::int - 1) % 100), 'FM00') || '-' || to_char((EXTRACT(YEAR FROM v_today)::int % 100), 'FM00');
  END IF;
  RETURN replace(replace(p_format_template, '{FY}', v_fy_label), '{SEQ:' || v_pad || '}', format_sequence_number(v_next, v_pad));
END;
$function$;
```

Before applying, diff the `preview_number_format` body above against a fresh `pg_get_functiondef` capture — only the two `v_fy_label :=` lines may differ. If anything else differs, live has drifted: STOP and reconcile.

- [ ] **Step 4: GREEN probe — rolled-back live mint renders 14 chars**

`mcp__supabase__execute_sql` (single call):

```sql
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', p.id, 'role', 'authenticated')::text, true)
FROM profiles p
WHERE p.tenant_id IS NOT NULL AND p.role IN ('owner','admin') AND p.is_active AND p.deleted_at IS NULL
LIMIT 1;
SELECT preview_number_format('invoices', 'INV/{FY}/{SEQ:4}') AS preview,
       length(preview_number_format('invoices', 'INV/{FY}/{SEQ:4}')) AS len;
UPDATE number_sequences
SET format_template = 'INV/{FY}/{SEQ:4}', reset_basis = 'fiscal_year', fiscal_year_anchor = '04-01'
WHERE scope = 'invoices' AND tenant_id = get_current_tenant_id();
SELECT get_next_number('invoices') AS minted, length(get_next_number('invoices')) AS minted_len;
ROLLBACK;
```

Expected: `preview = 'INV/26-27/…'`, `len = 14`; `minted ~ 'INV/26-27/00..'`, `minted_len = 14` (today 2026-07-05: preview anchors 01-01 → 26-27; mint anchors 04-01 → 26-27). If the `UPDATE` reports 0 rows the mint probe is inconclusive (RLS blocked the probe write) — re-run asserting on `preview` only and verify `get_next_number` behaviorally in WP-S5's tenant backfill. Everything rolls back.

- [ ] **Step 5: Regen types (no diff expected) + typecheck + manifest + commit**

Regenerate `src/types/database.types.ts` (as Task S1b.1 Step 5); `npm run typecheck` → 0. Append:

```
| <version> | fy_token_short_form_render | Additive (fn re-sign) | {FY} fiscal-year token renders short-form '25-26' in get_next_number + preview_number_format (Rule 46(b) headroom: INV/{FY}/{SEQ:4} = 14 chars, SEQ can reach 6 digits within the 16 cap). Zero live templates used {FY} pre-change. Calendar-year rendering untouched. | Phase 4 S1b |
```

```bash
git add supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(numbering): {FY} renders short-form 25-26 in mint + preview paths (WP-S1b)"
```

---

### Task S1b.3: IN pack draft + 18% slab / zero / exempt / UTGST rate rows (studio-authored, seed-asserted)

**Files:**
- Migration: `india_pack_draft_and_rates` (via `mcp__supabase__apply_migration`)
- Modify: `src/types/database.types.ts` (regen — no diff expected), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: Task S1b.1 subdivisions (`IN-CH`,`IN-AN`,`IN-LD`,`IN-DH`,`IN-LA`); WP-S1a's widened `uq_geo_country_tax_rates_dims` (includes `COALESCE(applies_to,'')`) + re-signed `upsert_country_tax_rate(p_row jsonb)` conflict target; studio RPCs `create_country_pack_draft(p_country_id uuid, p_changelog text) RETURNS uuid`, `upsert_country_tax_rate(p_row jsonb) RETURNS uuid`, helper `_pack_open_version(p_country_id uuid) RETURNS uuid`; the 3 live Phase-1 IN head rows (CGST/SGST/IGST, `applies_to IS NULL`).
- Produces: an **open IN pack draft** (`master_country_pack_versions` v1, `status='draft'`, authored by admin A — consumed by Tasks S1b.4/5/6, WP-S3 fixture recording, WP-S7 submit+publish) and **exactly 10 IN rate rows**: 3 country-level slab-18 heads (`tax_category='standard'`, `applies_to='gst_slab_18'`, CGST 9 / SGST 9 / IGST 18), 1 `zero` (nil-rated domestic) + 1 `exempt` (both `applies_to IS NULL`), and **5 subdivision-scoped UTGST label rows** — `component_code='SGST'`, `component_label='UTGST'`, 9%, slab-18, one per legislature-less UT. Data contract for WP-S3: the kernel's split mode selects on `component_code` (`src/lib/tax/kernel/index.ts:52` — literal `'CGST'|'SGST'|'IGST'` match, verified), so **S3's rate-context assembly MUST prefer the place-of-supply subdivision's SGST row over the country-level SGST row and never include both** (the in-migration assertion that no `standard` row has `applies_to IS NULL` kills the duplicate-head trap at the data layer). Only the 18% slab is seeded (D5): no `gst_slab_5/12/28` values exist.

- [ ] **Step 1: RED probe — S1a preconditions + current rate shape**

`mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_geo_country_tax_rates_dims') ~ 'applies_to' AS index_widened,
  (SELECT pg_get_functiondef('upsert_country_tax_rate(jsonb)'::regprocedure)) ~ 'ON CONFLICT \(country_id, COALESCE\(subdivision_id.*applies_to' AS rpc_resigned,
  (SELECT count(*) FROM master_country_pack_versions v JOIN geo_countries c ON c.id = v.country_id AND c.code='IN') AS packs,
  (SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id = r.country_id AND c.code='IN' WHERE r.deleted_at IS NULL) AS rates,
  (SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id = r.country_id AND c.code='IN'
   WHERE r.deleted_at IS NULL AND r.applies_to = 'gst_slab_18') AS slab18;
```

Expected: `index_widened = true` and `rpc_resigned = true` (S1a delivered — if either is false, STOP: S1a defect), `packs = 0`, `rates = 3`, `slab18 = 0` (RED).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `india_pack_draft_and_rates`, SQL:

```sql
-- Phase 4 WP-S1b: open the IN pack draft and author the rate dimension THROUGH the
-- Country Authoring Studio RPCs (provenance into platform_audit_logs via _pack_touch;
-- pack_version_id stamped on every row). Impersonation recipe per
-- docs/superpowers/handoff.md — platform admin A authors; S7 publishes as admin B.
DO $$
DECLARE
  v_admin constant uuid := 'd1139ac6-526c-4805-bbea-790985233725'; -- support@xsuite.space (P3 dual-control author)
  v_country uuid;
  v_pack uuid;
  v_row record;
  v_bad int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = v_admin) THEN
    RAISE EXCEPTION 'S1b.3: authoring admin % has no platform_admins row — _pack_touch would 23503', v_admin;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT id INTO v_country FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
  IF v_country IS NULL THEN RAISE EXCEPTION 'S1b.3: geo_countries IN row missing'; END IF;

  IF _pack_open_version(v_country) IS NULL THEN
    PERFORM create_country_pack_draft(v_country,
      'Phase 4 India Pack v1 — GST slab-18 heads + UTGST labels + zero/exempt, in_gst bindings, Rule 46(b) FY numbering, Rule 46 requirement rows. CA validation gates publish (D7/S7).');
  END IF;
  v_pack := _pack_open_version(v_country);

  -- (a) Stamp applies_to='gst_slab_18' onto the 3 pre-seeded Phase-1 head rows via the
  -- id-branch UPDATE. The no-id branch must NOT be used here: under the S1a-widened
  -- conflict key (which includes applies_to) an insert with applies_to='gst_slab_18'
  -- would not collide with the existing applies_to-NULL rows and would mint DUPLICATE
  -- 9%/18% heads — the kernel would then double-count SGST/CGST.
  FOR v_row IN
    SELECT id, component_code, component_label, rate
    FROM geo_country_tax_rates
    WHERE country_id = v_country AND deleted_at IS NULL AND subdivision_id IS NULL
      AND tax_category = 'standard' AND component_code IN ('CGST','SGST','IGST')
      AND applies_to IS NULL
  LOOP
    PERFORM upsert_country_tax_rate(jsonb_build_object(
      'id', v_row.id, 'country_id', v_country, 'subdivision_id', NULL,
      'component_code', v_row.component_code, 'component_label', v_row.component_label,
      'tax_category', 'standard', 'rate', v_row.rate, 'applies_to', 'gst_slab_18',
      'valid_from', '2017-07-01',
      'sort_order', CASE v_row.component_code WHEN 'CGST' THEN 10 WHEN 'SGST' THEN 20 ELSE 30 END));
  END LOOP;

  -- (b) zero = nil-rated DOMESTIC (LUT export zero-rating is a named deferral, spec §3);
  --     exempt = wholly-exempt (S4 raises the Bill-of-Supply guard for these).
  PERFORM upsert_country_tax_rate(jsonb_build_object(
    'country_id', v_country, 'component_code', 'IGST', 'component_label', 'IGST',
    'tax_category', 'zero', 'rate', 0, 'valid_from', '2017-07-01',
    'data_source', 'cgst_act_2017', 'sort_order', 40));
  PERFORM upsert_country_tax_rate(jsonb_build_object(
    'country_id', v_country, 'component_code', 'IGST', 'component_label', 'IGST',
    'tax_category', 'exempt', 'rate', 0, 'valid_from', '2017-07-01',
    'data_source', 'cgst_act_2017', 'sort_order', 50));

  -- (c) UTGST label rows for the five UTs WITHOUT legislatures (UTGST Act 2017):
  -- component_code stays 'SGST' (the kernel's split mode matches component_code —
  -- src/lib/tax/kernel/index.ts:52); component_label='UTGST' is the statutory print
  -- name. WP-S3's rate assembly prefers the subdivision row over the country SGST row.
  FOR v_row IN
    SELECT s.id AS sub_id, s.code
    FROM geo_subdivisions s
    WHERE s.country_id = v_country AND s.deleted_at IS NULL
      AND s.code IN ('IN-CH','IN-AN','IN-LD','IN-DH','IN-LA')
  LOOP
    PERFORM upsert_country_tax_rate(jsonb_build_object(
      'country_id', v_country, 'subdivision_id', v_row.sub_id,
      'component_code', 'SGST', 'component_label', 'UTGST',
      'tax_category', 'standard', 'rate', 9, 'applies_to', 'gst_slab_18',
      'valid_from', '2017-07-01', 'data_source', 'utgst_act_2017', 'sort_order', 20));
  END LOOP;

  -- (d) SEED ASSERTIONS (spec §4-S1b: migration fails on mismatch).
  SELECT count(*) INTO v_bad FROM geo_country_tax_rates
  WHERE country_id = v_country AND deleted_at IS NULL
    AND applies_to = 'gst_slab_18' AND tax_category <> 'standard';
  IF v_bad > 0 THEN RAISE EXCEPTION 'S1b.3 assertion: % gst_slab_18 rows not tax_category=standard', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM geo_country_tax_rates
  WHERE country_id = v_country AND deleted_at IS NULL
    AND tax_category IN ('zero','exempt') AND applies_to IS NOT NULL;
  IF v_bad > 0 THEN RAISE EXCEPTION 'S1b.3 assertion: % zero/exempt rows carry a slab applies_to', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM geo_country_tax_rates
  WHERE country_id = v_country AND deleted_at IS NULL
    AND tax_category = 'standard' AND applies_to IS DISTINCT FROM 'gst_slab_18';
  IF v_bad > 0 THEN RAISE EXCEPTION 'S1b.3 assertion: % standard rows outside gst_slab_18 (D5 + duplicate-head trap)', v_bad; END IF;

  IF EXISTS (SELECT 1 FROM geo_country_tax_rates
             WHERE country_id = v_country AND deleted_at IS NULL AND applies_to = 'gst_slab_18'
               AND ((component_code IN ('CGST','SGST') AND rate <> 9)
                 OR (component_code = 'IGST' AND rate <> 18))) THEN
    RAISE EXCEPTION 'S1b.3 assertion: slab-18 head rates broken (need CGST=SGST=UTGST label rows at 9, IGST 18 — equal dual-levy per spec §3)';
  END IF;

  SELECT count(*) INTO v_bad FROM geo_country_tax_rates
  WHERE country_id = v_country AND deleted_at IS NULL;
  IF v_bad <> 10 THEN
    RAISE EXCEPTION 'S1b.3 assertion: expected exactly 10 IN rate rows (3 slab-18 + zero + exempt + 5 UTGST), found %', v_bad;
  END IF;

  SELECT count(*) INTO v_bad FROM geo_country_tax_rates
  WHERE country_id = v_country AND deleted_at IS NULL AND pack_version_id IS DISTINCT FROM v_pack;
  IF v_bad > 0 THEN RAISE EXCEPTION 'S1b.3 assertion: % IN rate rows not stamped with the open pack version', v_bad; END IF;
END $$;
```

- [ ] **Step 3: GREEN probe**

`mcp__supabase__execute_sql`:

```sql
SELECT r.component_code, r.component_label, r.tax_category, r.rate, r.applies_to,
       (r.subdivision_id IS NOT NULL) AS ut_scoped
FROM geo_country_tax_rates r JOIN geo_countries c ON c.id = r.country_id AND c.code='IN'
WHERE r.deleted_at IS NULL ORDER BY r.subdivision_id NULLS FIRST, r.sort_order;
```

Expected 10 rows: CGST/9/gst_slab_18, SGST/9/gst_slab_18, IGST/18/gst_slab_18 (country), IGST/0/zero, IGST/0/exempt, then 5 × SGST-code/**UTGST-label**/9/gst_slab_18 with `ut_scoped=true`. Also confirm the draft: `SELECT status, version FROM master_country_pack_versions v JOIN geo_countries c ON c.id=v.country_id AND c.code='IN';` → `draft`, `1`.

- [ ] **Step 4: Regen types (no diff expected) + typecheck + manifest + commit**

As Task S1b.1 Step 5, then append:

```
| <version> | india_pack_draft_and_rates | Additive (governed-RPC data) | IN pack draft v1 opened (admin A authors; stays open for S3/S7). 10 rate rows via upsert_country_tax_rate: slab-18 heads stamped applies_to='gst_slab_18' (id-branch — no-id would duplicate under the widened key), zero+exempt, 5 UT-scoped SGST-code/UTGST-label rows. In-migration seed assertions incl. exactly-10 + no NULL-applies_to standard rows. | Phase 4 S1b |
```

```bash
git add supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(tax): IN pack draft + slab-18/zero/exempt/UTGST rate rows, studio-authored + seed-asserted (WP-S1b)"
```

---

### Task S1b.4: IN `country_config` bindings + UQC fill + repo binding-contract test

**Files:**
- Create: `src/lib/country/indiaPack.ts`
- Test: `src/lib/country/indiaPack.test.ts`
- Migration: `india_pack_bindings_and_uqc` (via `mcp__supabase__apply_migration`)
- Modify: `src/types/database.types.ts` (regen — no diff expected), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: Task S1b.3's open pack draft; studio RPC `update_country_pack_facts(p_country_id uuid, p_scalars jsonb, p_config jsonb)` (merges `p_config` into `geo_countries.country_config`; verified live); `REGISTRY_BY_KEY` from `src/lib/country/registry.ts:314` (`ConfigKeyDef.schema` Zod parsers); WP-S1a's widened `tax.rounding_policy` `level` enum (`'head'` accepted — `registry.ts:247` currently `['line','document']`).
- Produces: IN `country_config` carries `regime.tax='in_gst'`, `regime.documents='in_gst_invoice'`, `regime.numbering='in_fiscal_numbering'`, `regime.einvoice='no_einvoice'` (D3), `tax.return_composer='gstr'`, `tax.filing_frequency='monthly'`, `tax.period_anchor='04-01'`, `tax.rounding_policy={mode:'half_up',level:'head',cash_increment:1}` (spec §3 Section 170), `format.amount_words_scale='indian'`. These are **inert until threaded** — S2 deliberately does not read `regime.tax` (it would throw `CountryConfigError`: `in_gst` registers in S3); the plugins named here land in S3/S4/S5/S6. Also: every active `master_unit_codes` row has a non-NULL `uqc_code` (fills E48/WEE/MON/ANN/E34/E35 → `'OTH'`; existing C62→NOS, HUR→HRS, DAY→DAY untouched — all flagged for CA ratification in Task S1b.7). Exported constant **`INDIA_PACK_CONFIG`** (`src/lib/country/indiaPack.ts`) — the byte-equal TS mirror of the seeded config, consumed by WP-S2 (context-threading assertions) and WP-S3 (strategy resolution tests).

- [ ] **Step 1: Write the failing repo test**

Create `src/lib/country/indiaPack.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { REGISTRY_BY_KEY } from './registry';
import { INDIA_PACK_CONFIG } from './indiaPack';

describe('WP-S1b India pack bindings vs COUNTRY_CONFIG_REGISTRY', () => {
  it('every seeded config key exists in the registry and parses against its Zod schema', () => {
    for (const [key, value] of Object.entries(INDIA_PACK_CONFIG)) {
      const def = REGISTRY_BY_KEY[key];
      expect(def, `registry key missing: ${key}`).toBeDefined();
      const parsed = def.schema.safeParse(value);
      expect(parsed.success, `${key} rejected value ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it('rounding is head-level whole-rupee (Section 170; requires the S1a level-enum widening)', () => {
    expect(INDIA_PACK_CONFIG['tax.rounding_policy']).toEqual({ mode: 'half_up', level: 'head', cash_increment: 1 });
  });

  it('e-invoice regime is no_einvoice — D3: no in_irn plugin/lifecycle this phase', () => {
    expect(INDIA_PACK_CONFIG['regime.einvoice']).toBe('no_einvoice');
  });

  it('return shape: gstr composer, monthly periods anchored 04-01, indian words scale', () => {
    expect(INDIA_PACK_CONFIG['tax.return_composer']).toBe('gstr');
    expect(INDIA_PACK_CONFIG['tax.filing_frequency']).toBe('monthly');
    expect(INDIA_PACK_CONFIG['tax.period_anchor']).toBe('04-01');
    expect(INDIA_PACK_CONFIG['format.amount_words_scale']).toBe('indian');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

```bash
npx vitest run src/lib/country/indiaPack.test.ts
```

Expected: FAIL — `Cannot find module './indiaPack'` (the constant does not exist yet). If instead the first test fails on `tax.rounding_policy` after Step 3, the S1a enum widening is missing: STOP.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/country/indiaPack.ts`:

```typescript
/** WP-S1b: the exact `country_config` payload seeded onto geo_countries code='IN' by
 *  migration `india_pack_bindings_and_uqc` (via update_country_pack_facts). Keep this
 *  byte-equal with the migration — indiaPack.test.ts validates it against the registry,
 *  and WP-S2/WP-S3 assert threaded TaxContext fields against it. */
export const INDIA_PACK_CONFIG = {
  'regime.tax': 'in_gst',
  'regime.documents': 'in_gst_invoice',
  'regime.numbering': 'in_fiscal_numbering',
  'regime.einvoice': 'no_einvoice',
  'tax.return_composer': 'gstr',
  'tax.filing_frequency': 'monthly',
  'tax.period_anchor': '04-01',
  'tax.rounding_policy': { mode: 'half_up', level: 'head', cash_increment: 1 },
  'format.amount_words_scale': 'indian',
} as const;
```

- [ ] **Step 4: Run again — expect PASS**

```bash
npx vitest run src/lib/country/indiaPack.test.ts
```

Expected: 4 passed. Then `npm run typecheck` → 0.

- [ ] **Step 5: Apply the migration**

`mcp__supabase__apply_migration`, name `india_pack_bindings_and_uqc`, SQL:

```sql
-- Phase 4 WP-S1b: IN regime bindings + statutory return/rounding/words config, authored
-- through update_country_pack_facts (provenance + content_updated_at on the open draft).
-- NO master_einvoice_regimes row (D3: no_einvoice). NO capability rows (spec §2 — each
-- plugin WP syncs its own via sync_engine_capabilities).
DO $$
DECLARE
  v_admin constant uuid := 'd1139ac6-526c-4805-bbea-790985233725';
  v_country uuid;
  v_cfg jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = v_admin) THEN
    RAISE EXCEPTION 'S1b.4: authoring admin % has no platform_admins row', v_admin;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT id INTO v_country FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
  IF _pack_open_version(v_country) IS NULL THEN
    RAISE EXCEPTION 'S1b.4: no open IN pack draft — apply india_pack_draft_and_rates first';
  END IF;

  -- Scalars: '{}'::jsonb — tax_number_label='GSTIN' and fiscal_year_start='04-01' are
  -- already correct on the live IN row (verified 2026-07-05); nothing to change.
  PERFORM update_country_pack_facts(
    v_country,
    '{}'::jsonb,
    jsonb_build_object(
      'regime.tax',                'in_gst',
      'regime.documents',          'in_gst_invoice',
      'regime.numbering',          'in_fiscal_numbering',
      'regime.einvoice',           'no_einvoice',
      'tax.return_composer',       'gstr',
      'tax.filing_frequency',      'monthly',
      'tax.period_anchor',         '04-01',
      'tax.rounding_policy',       jsonb_build_object('mode','half_up','level','head','cash_increment',1),
      'format.amount_words_scale', 'indian'
    ));

  -- Seed assertions.
  SELECT country_config INTO v_cfg FROM geo_countries WHERE id = v_country;
  IF v_cfg->>'regime.einvoice' IS DISTINCT FROM 'no_einvoice' THEN
    RAISE EXCEPTION 'S1b.4 assertion: regime.einvoice=% (D3 requires no_einvoice)', v_cfg->>'regime.einvoice';
  END IF;
  IF v_cfg->'tax.rounding_policy'->>'level' IS DISTINCT FROM 'head'
     OR (v_cfg->'tax.rounding_policy'->>'cash_increment')::numeric IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'S1b.4 assertion: rounding_policy=% (need head-level, cash_increment 1 — spec §3)', v_cfg->'tax.rounding_policy';
  END IF;
  IF v_cfg->>'regime.tax' IS DISTINCT FROM 'in_gst'
     OR v_cfg->>'tax.return_composer' IS DISTINCT FROM 'gstr'
     OR v_cfg->>'tax.filing_frequency' IS DISTINCT FROM 'monthly'
     OR v_cfg->>'tax.period_anchor' IS DISTINCT FROM '04-01'
     OR v_cfg->>'format.amount_words_scale' IS DISTINCT FROM 'indian' THEN
    RAISE EXCEPTION 'S1b.4 assertion: binding drift: %', v_cfg;
  END IF;
END $$;

-- UQC fill on the global Rec-20 units master (no studio RPC exists for master_unit_codes;
-- direct fill-only UPDATE). GSTN's UQC list has no service/data-size units — E48 (service
-- unit), WEE/MON/ANN (time units), E34/E35 (GB/TB) map to 'OTH'. Existing curated
-- mappings (C62→NOS, HUR→HRS, DAY→DAY, KGM→KGS…) are NOT touched. The whole mapping
-- table ships in the CA package for ratification (Task S1b.7).
UPDATE master_unit_codes SET uqc_code = 'OTH'
WHERE uqc_code IS NULL AND code IN ('E48','WEE','MON','ANN','E34','E35');

DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM master_unit_codes
  WHERE is_active AND deleted_at IS NULL AND uqc_code IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'S1b.4 assertion: % active unit codes still lack a UQC mapping (Rule 46(g) would block issuance)', v_bad;
  END IF;
END $$;
```

- [ ] **Step 6: GREEN probe**

`mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT country_config->>'regime.tax' FROM geo_countries WHERE code='IN') AS rt,
  (SELECT country_config->>'regime.einvoice' FROM geo_countries WHERE code='IN') AS einv,
  (SELECT country_config->'tax.rounding_policy'->>'level' FROM geo_countries WHERE code='IN') AS lvl,
  (SELECT count(*) FROM master_unit_codes WHERE is_active AND deleted_at IS NULL AND uqc_code IS NULL) AS unmapped,
  (SELECT count(*) FROM master_einvoice_regimes r JOIN geo_countries c ON c.id=r.country_id AND c.code='IN') AS einv_rows,
  (SELECT count(*) FROM master_engine_capabilities WHERE capability_key LIKE '%in_gst%' OR capability_key LIKE '%in_irn%') AS in_caps;
```

Expected: `rt='in_gst'`, `einv='no_einvoice'`, `lvl='head'`, `unmapped=0`, `einv_rows=0` (D3 holds), `in_caps=0` (no hand-seeded capabilities — spec §2 holds).

- [ ] **Step 7: Regen types (no diff expected) + manifest + commit**

As Task S1b.1 Step 5, then append:

```
| <version> | india_pack_bindings_and_uqc | Additive (governed-RPC data + fill) | IN country_config bindings via update_country_pack_facts: in_gst / in_gst_invoice / in_fiscal_numbering / no_einvoice (D3), gstr monthly 04-01, rounding {half_up,head,cash_increment:1} (§3), indian words. UQC fill E48/WEE/MON/ANN/E34/E35→OTH (0 active units unmapped). NO einvoice regime row, NO capability rows. | Phase 4 S1b |
```

```bash
git add src/lib/country/indiaPack.ts src/lib/country/indiaPack.test.ts supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(tax): IN pack bindings (in_gst/gstr/head-rounding/indian words) + UQC fill + registry-contract test (WP-S1b)"
```

---

### Task S1b.5: FY numbering policies — invoice / credit note / vouchers / challan series

**Files:**
- Migration: `india_numbering_policies_seed` (via `mcp__supabase__apply_migration`)
- Modify: `src/types/database.types.ts` (regen — no diff expected), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: Task S1b.3's open draft; Task S1b.2's short-form `{FY}`; studio RPC `upsert_country_numbering_policy(p_row jsonb) RETURNS uuid` (verified live: validates `reset_basis`, requires `{SEQ:n}` token, upserts on `(country_id, scope)`); live scope vocabulary — `'invoices'` (minted by `issue_tax_document`), `'credit_note'` (minted by `issue_credit_note` — verified via `pg_get_functiondef`).
- Produces: **5 `master_numbering_policies` IN rows**, all `reset_basis='fiscal_year'`, `fiscal_year_anchor='04-01'`, `max_length=16`: `invoices → 'INV/{FY}/{SEQ:4}'`, `credit_note → 'CRN/{FY}/{SEQ:4}'`, `receipt_voucher → 'RCV/{FY}/{SEQ:4}'`, `refund_voucher → 'RFV/{FY}/{SEQ:4}'`, `delivery_challan → 'DC/{FY}/{SEQ:4}'`. Scope-name contract: **WP-L4 mints receipt/refund vouchers with scopes `'receipt_voucher'`/`'refund_voucher'` and WP-L6 mints challans with scope `'delivery_challan'`** (L6 adds no policy rows — it consumes these); WP-S5's `in_fiscal_numbering` plugin seeds tenant `number_sequences` from these rows and backfills the IN test tenant via `apply_country_numbering_policy(uuid)`. Rendered base = 13–14 chars (short-form FY), leaving SEQ headroom to 6 digits within the 16 cap; the 9,999→10,000 overflow behavior itself is pinned in WP-S5 (spec §3/§4-S5).

- [ ] **Step 1: RED probe**

`mcp__supabase__execute_sql`:

```sql
SELECT count(*) AS n FROM master_numbering_policies p
JOIN geo_countries c ON c.id = p.country_id AND c.code = 'IN'
WHERE p.deleted_at IS NULL;
```

Expected: `n = 0` (RED).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `india_numbering_policies_seed`, SQL:

```sql
-- Phase 4 WP-S1b: Rule 46(b)/49/50/51/55 FY series, authored through
-- upsert_country_numbering_policy (SEQ-token grammar validated in-RPC; upsert on
-- (country_id, scope)). {FY} renders short-form '25-26' (fy_token_short_form_render),
-- so 'INV/{FY}/{SEQ:4}' mints 14 chars — SEQ can grow to 6 digits inside max_length 16.
-- Voucher/challan scopes have no number_sequences rows yet; the rows here are country
-- DEFAULTS that WP-S5 seeds/backfills and WP-L4/L6 consume when they mint.
DO $$
DECLARE
  v_admin constant uuid := 'd1139ac6-526c-4805-bbea-790985233725';
  v_country uuid;
  v_row record;
  v_bad int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = v_admin) THEN
    RAISE EXCEPTION 'S1b.5: authoring admin % has no platform_admins row', v_admin;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT id INTO v_country FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
  IF _pack_open_version(v_country) IS NULL THEN
    RAISE EXCEPTION 'S1b.5: no open IN pack draft — apply india_pack_draft_and_rates first';
  END IF;

  FOR v_row IN
    SELECT * FROM (VALUES
      ('invoices',         'INV/{FY}/{SEQ:4}'),
      ('credit_note',      'CRN/{FY}/{SEQ:4}'),
      ('receipt_voucher',  'RCV/{FY}/{SEQ:4}'),
      ('refund_voucher',   'RFV/{FY}/{SEQ:4}'),
      ('delivery_challan', 'DC/{FY}/{SEQ:4}')
    ) AS t(scope, tpl)
  LOOP
    PERFORM upsert_country_numbering_policy(jsonb_build_object(
      'country_id', v_country, 'scope', v_row.scope, 'format_template', v_row.tpl,
      'reset_basis', 'fiscal_year', 'fiscal_year_anchor', '04-01', 'max_length', 16));
  END LOOP;

  -- Seed assertions: exactly 5 rows; every template renders <= 14 chars with the
  -- short-form FY and a 4-digit SEQ (Rule 46(b) headroom); uniform FY shape.
  SELECT count(*) INTO v_bad FROM master_numbering_policies
  WHERE country_id = v_country AND deleted_at IS NULL;
  IF v_bad <> 5 THEN RAISE EXCEPTION 'S1b.5 assertion: expected 5 IN numbering policies, found %', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM master_numbering_policies
  WHERE country_id = v_country AND deleted_at IS NULL
    AND (reset_basis <> 'fiscal_year' OR fiscal_year_anchor <> '04-01' OR max_length <> 16
         OR length(replace(replace(format_template, '{FY}', '25-26'), '{SEQ:4}', '0001')) > 14);
  IF v_bad > 0 THEN RAISE EXCEPTION 'S1b.5 assertion: % policies violate the FY/anchor/cap/headroom contract', v_bad; END IF;
END $$;
```

- [ ] **Step 3: GREEN probe**

`mcp__supabase__execute_sql`:

```sql
SELECT p.scope, p.format_template, p.reset_basis, p.fiscal_year_anchor, p.max_length,
       length(replace(replace(p.format_template,'{FY}','25-26'),'{SEQ:4}','0001')) AS rendered_len
FROM master_numbering_policies p JOIN geo_countries c ON c.id = p.country_id AND c.code='IN'
WHERE p.deleted_at IS NULL ORDER BY p.scope;
```

Expected 5 rows — `credit_note/CRN…/14`, `delivery_challan/DC…/13`, `invoices/INV…/14`, `receipt_voucher/RCV…/14`, `refund_voucher/RFV…/14`; all `fiscal_year / 04-01 / 16`.

- [ ] **Step 4: Regen types (no diff expected) + manifest + commit**

As Task S1b.1 Step 5, then append:

```
| <version> | india_numbering_policies_seed | Additive (governed-RPC data) | 5 IN FY numbering policies via upsert_country_numbering_policy (invoices/credit_note/receipt_voucher/refund_voucher/delivery_challan; fiscal_year 04-01, max_length 16, short-form {FY} → 13-14 char base, SEQ headroom to 6 digits). L4/L6 consume the voucher/challan scopes; S5 backfills tenants. | Phase 4 S1b |
```

```bash
git add supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(numbering): IN FY series for invoice/CN/vouchers/challan, studio-authored (WP-S1b)"
```

---

### Task S1b.6: Rule 46 requirement rows — invoice + credit note (incl. B2C ≥ ₹50k conditional and CN original-invoice ref)

**Files:**
- Migration: `india_document_requirements_seed` (via `mcp__supabase__apply_migration`)
- Modify: `src/types/database.types.ts` (regen — no diff expected), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: Task S1b.3's open draft; studio RPC `upsert_document_requirement(p_row jsonb) RETURNS uuid` (validates `level`, the closed `field_key` vocabulary, and `condition` via `validate_requirement_condition` — fact vocabulary verified live: `buyer_is_business, buyer_tax_number, seller_registered, place_of_supply, tax_treatment, document_total, line.item_code, line.unit_code`; ops `eq,neq,in,gte,present`); WP-S1a's `'original_invoice_ref'` widening of **both** the table CHECK and the RPC vocabulary; fact sources verified in live `issue_tax_document` (`buyer_is_business = (company_id IS NOT NULL)`, `document_total = invoices.total_amount`, `buyer_address` snapshot) — requirements evaluate only after pack activation (`tenants.country_pack_version` pinned at S7 publish), so no live tenant is gated before the machinery is complete.
- Produces: **10 `block` rows** on `master_document_requirements` for IN — consumed by `issue_tax_document`/`issue_credit_note` dry-runs (WP-S4 field-by-field surfacing), WP-S3 fixtures, WP-S7 publish-gate coverage. **No voucher rows** (WP-L4 widens the `doc_type` CHECK and seeds those).

- [ ] **Step 1: RED probe — S1a precondition + absent state**

`mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conname='master_document_requirements_field_key_check') ~ 'original_invoice_ref' AS check_widened,
  (SELECT pg_get_functiondef('upsert_document_requirement(jsonb)'::regprocedure)) ~ 'original_invoice_ref' AS rpc_widened,
  (SELECT count(*) FROM master_document_requirements r
   JOIN geo_countries c ON c.id = r.country_id AND c.code='IN') AS n;
```

Expected: `check_widened = true` AND `rpc_widened = true` (S1a delivered — if either is false, STOP: S1a defect), `n = 0` (RED).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `india_document_requirements_seed`, SQL:

```sql
-- Phase 4 WP-S1b: CGST Rule 46 issuance gate rows, authored through
-- upsert_document_requirement (condition validated in-RPC against the closed
-- vocabulary). All 'block'. Rule 46(e): recipient GSTIN on B2B; Rule 46: place of
-- supply; 46(g)/(h): HSN-SAC + unit per line; Rule 46 proviso: unregistered-recipient
-- documents of >= ₹50,000 must carry the recipient name/address + place of supply
-- (spec §3 — the B2C conditional row). Section 34 / Rule 53: credit notes reference
-- the original tax invoice (field_key 'original_invoice_ref', widened in WP-S1a).
-- Voucher doc_types are NOT seeded here (WP-L4). Requirements fire only after the
-- pack is published + pinned (S7), so nothing blocks before S3/S4 machinery exists.
DO $$
DECLARE
  v_admin constant uuid := 'd1139ac6-526c-4805-bbea-790985233725';
  v_country uuid;
  v_row record;
  v_n int; v_blocks int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = v_admin) THEN
    RAISE EXCEPTION 'S1b.6: authoring admin % has no platform_admins row', v_admin;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT id INTO v_country FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
  IF _pack_open_version(v_country) IS NULL THEN
    RAISE EXCEPTION 'S1b.6: no open IN pack draft — apply india_pack_draft_and_rates first';
  END IF;

  -- Idempotency: the RPC's no-id branch is INSERT-only; skip rows that already exist.
  FOR v_row IN
    SELECT * FROM (VALUES
      ('invoice',     'buyer_tax_number',
        '{"all":[{"fact":"buyer_is_business","op":"eq","value":true}]}'::jsonb,
        'Buyer GSTIN is required on B2B GST tax invoices (CGST Rule 46(e))'),
      ('invoice',     'place_of_supply_subdivision_id', NULL::jsonb,
        'Place of supply (state) is required on GST tax invoices (CGST Rule 46)'),
      ('invoice',     'line.item_code',                 NULL::jsonb,
        'HSN/SAC code is required on every line of a GST tax invoice (Rule 46(g))'),
      ('invoice',     'line.unit_code',                 NULL::jsonb,
        'A unit (UQC) is required on every line of a GST tax invoice (Rule 46(h))'),
      ('invoice',     'buyer_address',
        '{"all":[{"fact":"buyer_is_business","op":"eq","value":false},{"fact":"document_total","op":"gte","value":50000}]}'::jsonb,
        'Unregistered-buyer invoices of ₹50,000 or more must carry the buyer name, address and place of supply (Rule 46 proviso)'),
      ('credit_note', 'buyer_tax_number',
        '{"all":[{"fact":"buyer_is_business","op":"eq","value":true}]}'::jsonb,
        'Buyer GSTIN is required on B2B GST credit notes (Rule 53)'),
      ('credit_note', 'place_of_supply_subdivision_id', NULL::jsonb,
        'Place of supply (state) is required on GST credit notes (Rule 53)'),
      ('credit_note', 'line.item_code',                 NULL::jsonb,
        'HSN/SAC code is required on every line of a GST credit note (Rule 53)'),
      ('credit_note', 'line.unit_code',                 NULL::jsonb,
        'A unit (UQC) is required on every line of a GST credit note (Rule 53)'),
      ('credit_note', 'original_invoice_ref',           NULL::jsonb,
        'GST credit notes must reference the original tax invoice number and date (Section 34 / Rule 53)')
    ) AS t(doc_type, field_key, condition, message)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM master_document_requirements m
      WHERE m.country_id = v_country AND m.doc_type = v_row.doc_type
        AND m.field_key = v_row.field_key AND m.deleted_at IS NULL
    ) THEN
      PERFORM upsert_document_requirement(jsonb_build_object(
        'country_id', v_country, 'doc_type', v_row.doc_type, 'field_key', v_row.field_key,
        'condition', v_row.condition, 'level', 'block',
        'message_i18n', jsonb_build_object('en', v_row.message),
        'effective_from', '2017-07-01'));
    END IF;
  END LOOP;

  -- Seed assertions.
  SELECT count(*), count(*) FILTER (WHERE level = 'block') INTO v_n, v_blocks
  FROM master_document_requirements
  WHERE country_id = v_country AND deleted_at IS NULL;
  IF v_n <> 10 OR v_blocks <> 10 THEN
    RAISE EXCEPTION 'S1b.6 assertion: expected 10 block rows, found % (% block)', v_n, v_blocks;
  END IF;
  IF EXISTS (SELECT 1 FROM master_document_requirements
             WHERE country_id = v_country AND deleted_at IS NULL
               AND doc_type NOT IN ('invoice','credit_note')) THEN
    RAISE EXCEPTION 'S1b.6 assertion: voucher/other doc_type rows leaked in — those belong to WP-L4';
  END IF;
END $$;
```

- [ ] **Step 3: GREEN probe (incl. condition-vocabulary re-validation)**

`mcp__supabase__execute_sql`:

```sql
SELECT r.doc_type, r.field_key, r.level, r.condition,
       validate_requirement_condition(r.condition) AS cond_valid
FROM master_document_requirements r
JOIN geo_countries c ON c.id = r.country_id AND c.code='IN'
WHERE r.deleted_at IS NULL
ORDER BY r.doc_type, r.field_key;
```

Expected: 10 rows, all `level='block'`, all `cond_valid=true`; the `invoice/buyer_address` row carries the two-fact B2C ≥ 50000 condition; `credit_note/original_invoice_ref` present with `condition IS NULL`.

- [ ] **Step 4: Regen types (no diff expected) + manifest + commit**

As Task S1b.1 Step 5, then append:

```
| <version> | india_document_requirements_seed | Additive (governed-RPC data) | 10 IN Rule 46/53 block rows via upsert_document_requirement: B2B GSTIN (conditional), place of supply, HSN/SAC + UQC per line (invoice + credit_note), B2C >= ₹50k buyer-identity conditional (spec §3), CN original_invoice_ref (S1a key). No voucher rows (L4). Fires only post-publish (pack pinning). | Phase 4 S1b |
```

```bash
git add supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(tax): IN Rule 46/53 issuance requirement rows incl. B2C>=50k conditional + CN original-invoice ref (WP-S1b)"
```

---

### Task S1b.7: CA engagement kickoff (D7 side task)

**Files:**
- Create: `docs/superpowers/specs/2026-07-05-india-ca-engagement-kickoff.md`

**Interfaces:**
- Consumes: the seeded data from Tasks S1b.1–S1b.6 (extract queries below); spec §3 pinned semantics; §7 named deferrals.
- Produces: the CA engagement brief — the document the owner hands the CA **now** so review capacity exists when WP-S7 delivers the full package (fixture JSONs + rendered invoice/credit-note/receipt-voucher PDFs + the deferrals-and-treatments memo). Referenced by WP-S7's CA-package generator; the signed memo hash lands in `_meta.external_validation` (D7).

- [ ] **Step 1: Pull the seeded-data extracts**

`mcp__supabase__execute_sql` — run and save the outputs for embedding in the brief:

```sql
SELECT code, name, subdivision_type, tax_authority_code FROM geo_subdivisions s
JOIN geo_countries c ON c.id = s.country_id AND c.code='IN' WHERE s.deleted_at IS NULL ORDER BY tax_authority_code;
SELECT component_label, tax_category, rate, applies_to, (subdivision_id IS NOT NULL) AS ut_scoped
FROM geo_country_tax_rates r JOIN geo_countries c ON c.id=r.country_id AND c.code='IN' WHERE r.deleted_at IS NULL ORDER BY sort_order;
SELECT code, uqc_code FROM master_unit_codes WHERE is_active AND deleted_at IS NULL ORDER BY sort_order;
SELECT scope, format_template FROM master_numbering_policies p JOIN geo_countries c ON c.id=p.country_id AND c.code='IN' WHERE p.deleted_at IS NULL ORDER BY scope;
```

- [ ] **Step 2: Write the brief**

Create `docs/superpowers/specs/2026-07-05-india-ca-engagement-kickoff.md` with exactly these sections, embedding the Step-1 extracts as tables:

```markdown
# India Pack — CA Engagement Kickoff (Phase 4, D7)

**Purpose:** engage a qualified Indian CA NOW (parallel with WP-S2..S6 build) so external
validation does not stall the publish gate. Final review package arrives at WP-S7:
fixture JSONs + rendered PDFs (tax invoice, credit note, receipt voucher) + a
deferrals-and-treatments memo for signed ratification (memo hash recorded in
`_meta.external_validation`).

## 1. Scope of engagement
- Validate the statutory arithmetic fixtures (intra-state CGST+SGST, inter-state IGST,
  inclusive B2C 18/118 back-out, head-level Section 170 rounding with the "Round off"
  line, UTGST Chandigarh, credit-note reversal, advance-then-invoice netting).
- Validate rendered document layouts against CGST Rules 46/49/50/51/53/55.
- Ratify the named deferrals (spec §7 ⊕ list) and implemented treatments (advance
  netting; Bill-of-Supply wholly-exempt guard) via signed memo.

## 2. Pinned semantics under review (spec §3 — decided, CA validates)
[reproduce the eight §3 bullets verbatim: head-level rounding + round-off line;
equal dual-levy 381.36/381.36; Rule 46(b) 16-char/short-FY numbering; state-code set
incl. 96/97 seeded + 25/28 absent; UTGST labels; zero = nil-rated domestic (LUT
deferred); B2C >= ₹50k conditional; Rule 50/51 voucher rules + advance netting]

## 3. Seeded data for early review
### 3.1 GST state codes (38 rows) …[Step-1 extract]
### 3.2 Rate rows (10) …[Step-1 extract]
### 3.3 UQC mappings (incl. pre-existing HUR→HRS, DAY→DAY — flag if GSTN portal
requires OTH/NA for services) …[Step-1 extract]
### 3.4 Document number formats …[Step-1 extract]

## 4. Timeline & owner action
- NOW (owner): select + engage the CA; share this brief.
- WP-S3 merge: fixture JSONs available (`_meta.external_validation: pending`).
- WP-S7: full package (fixtures + PDFs + memo) → CA signs memo → hash recorded →
  dual-control publish flips IN to statutory_ready.
```

- [ ] **Step 3: Owner hand-off checklist item**

- [ ] **OWNER ACTION (D7): engage the Indian CA now, using `docs/superpowers/specs/2026-07-05-india-ca-engagement-kickoff.md` as the brief.** Record the CA's name/credential in the doc's §4 once engaged — WP-S7's `_meta.external_validation` requires them. This WP does not block on the CA; only WP-S7's final publish steps do.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-05-india-ca-engagement-kickoff.md
git commit -m "docs(india): CA engagement kickoff brief with seeded-data extracts (WP-S1b, D7)"
```

---

### Task S1b.8: WP verification + PR

**Files:**
- Test: `src/lib/country/indiaPack.test.ts` (from Task S1b.4)
- Scratchpad: `C:/Users/SPACELAB/AppData/Local/Temp/claude/C--Projects-Space-Recovery/41cb8f1d-edd0-47ce-b30b-4a7953d09a32/scratchpad/s1b-pr-body.md`

**Interfaces:**
- Consumes: all Task S1b.1–S1b.7 commits.
- Produces: the WP-S1b migration PR (owner merges — do NOT merge). Downstream: WP-S2 starts only after this PR merges (test-tenant provisioning reads the seeded subdivisions/bindings).

- [ ] **Step 1: Full-WP live assertion sweep**

`mcp__supabase__execute_sql` — one consolidated re-check:

```sql
SELECT
  (SELECT count(*) FROM geo_subdivisions s JOIN geo_countries c ON c.id=s.country_id AND c.code='IN' WHERE s.deleted_at IS NULL) AS subs,
  (SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id=r.country_id AND c.code='IN' WHERE r.deleted_at IS NULL) AS rates,
  (SELECT count(*) FROM master_numbering_policies p JOIN geo_countries c ON c.id=p.country_id AND c.code='IN' WHERE p.deleted_at IS NULL) AS numpol,
  (SELECT count(*) FROM master_document_requirements d JOIN geo_countries c ON c.id=d.country_id AND c.code='IN' WHERE d.deleted_at IS NULL) AS reqs,
  (SELECT status FROM master_country_pack_versions v JOIN geo_countries c ON c.id=v.country_id AND c.code='IN' ORDER BY version DESC LIMIT 1) AS pack_status,
  (SELECT config_status FROM geo_countries WHERE code='IN') AS config_status,
  (SELECT count(*) FROM master_engine_capabilities WHERE capability_key LIKE '%in_%') AS in_caps,
  (SELECT count(*) FROM master_einvoice_regimes r JOIN geo_countries c ON c.id=r.country_id AND c.code='IN') AS einv_rows;
```

Expected: `subs=38, rates=10, numpol=5, reqs=10, pack_status='draft', config_status='formatting_ready'` (publish is S7's job), `in_caps=0`, `einv_rows=0`.

- [ ] **Step 2: Typecheck (un-piped — per the P3 lesson) + WP tests**

```bash
npm run typecheck
npx vitest run src/lib/country/indiaPack.test.ts
```

Expected: typecheck exit 0 with zero errors; 4 tests passed.

- [ ] **Step 3: Push + open the PR (migration template; owner merges)**

Write `s1b-pr-body.md` in the scratchpad following `.github/PULL_REQUEST_TEMPLATE/migration.md`, summarizing: 6 migrations (`india_gst_subdivisions_seed`, `fy_token_short_form_render`, `india_pack_draft_and_rates`, `india_pack_bindings_and_uqc`, `india_numbering_policies_seed`, `india_document_requirements_seed`), all additive, all manifested, types regenerated (no diff — seed/fn-re-sign only); studio-RPC authoring with provenance (pack draft v1 open, admin A); seed assertions in-migration (38/2 subdivisions, exactly-10 rates all-standard-slab-18, 5 FY policies ≤14-char base, 10 block requirement rows); spec-delta compliance (no capability rows, no in_irn/einvoice rows, `level='head'`, short-form `{FY}`, 18%-slab-only, B2C≥50k row, voucher requirement rows deferred to L4); CA kickoff brief included (owner action flagged). Then:

```bash
git push -u origin feat/india-s1b-data-pack
gh pr create --title "Phase 4 WP-S1b: India Data Pack (subdivisions, slab-18 rates, bindings, FY numbering, Rule 46 requirements)" --body-file "C:/Users/SPACELAB/AppData/Local/Temp/claude/C--Projects-Space-Recovery/41cb8f1d-edd0-47ce-b30b-4a7953d09a32/scratchpad/s1b-pr-body.md" --base main
```

Expected: PR URL printed. Do NOT merge — owner merges (D8). Report the PR URL and the Step-1 assertion table in the completion summary.

---


## Work Package WP-S2 — IN Test Tenant + Buyer-Seam Threading [M, no migration]

Branch: `feat/india-s2-in-test-tenant-buyer-seam` (cut from `main`)
Depends on: **WP-S1a** merged (country-config registry/Zod `tax.rounding_policy.level` accepts `'head'`) and **WP-S1b** merged + migrations live on `ssmbegiyjivrcwgcqutu` (IN `geo_subdivisions` with `tax_authority_code`, 96/97 flagged non-GSTIN via `subdivision_type='gst_special'`; IN `geo_countries.country_config` bindings incl. `'tax.rounding_policy': {"mode":"half_up","level":"head","cash_increment":1}`, `'format.amount_words_scale':'indian'`, `'regime.tax':'in_gst'`; `master_document_requirements` IN invoice block rows incl. `buyer_tax_number` B2B). WP-S3 consumes this WP's `gstin.ts` and replaces the `'simple_vat'` literal this WP deliberately leaves at `src/lib/taxDocumentService.ts:172`.

Scope guard (spec §4-S2): **no migration** (buyer columns verified pre-existing: `customers_enhanced.tax_number`/`subdivision_id`, `companies.tax_number`/`subdivision_id`, `invoices.place_of_supply_subdivision_id`, `quotes.place_of_supply_subdivision_id`). **No strategy-key threading** — threading `regime.tax` before S3 registers `in_gst` would throw `CountryConfigError`; the IN tenant knowingly computes `simple_vat` until S3. Acceptance = TaxContext **field** assertions via `issue_tax_document p_dry_run` on the live tenant, not tax math.

---

### Task S2.1: GSTIN mod-36 checksum + state-prefix validator

**Files:**
Create: `src/lib/regimes/in_gst/gstin.ts`
Test: `src/lib/regimes/in_gst/gstin.test.ts`

**Interfaces:**
Consumes: nothing (pure module, zero I/O).
Produces (this WP is the **SOLE author** of `gstin.ts`; WP-S3 and WP-L2 CONSUME these exports): `validateGSTIN(gstin: string, subdivision?: { tax_authority_code: string | null } | null): GstinCheck`, `gstinCheckDigit(base14: string): string`, `gstStateCodeOf(gstin: string): string | null`, `GSTIN_STATE_CODES: ReadonlySet<string>` (36 GSTIN-issuing codes; special 96/97 excluded) with `interface GstinCheck { ok: boolean; error: string | null; stateCode: string | null }` — consumed by Tasks S2.2/S2.3 and by WP-S3 + WP-L2 (state-set membership is baked into `GSTIN_STATE_CODES`, not passed as a param).

- [ ] **Step 1: Write the failing validator test.** Create `src/lib/regimes/in_gst/gstin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateGSTIN, gstStateCodeOf, gstinCheckDigit, GSTIN_STATE_CODES } from './gstin';

describe('GSTIN_STATE_CODES', () => {
  it('pins the GSTIN-issuing set at 36 codes (special 96/97 excluded — place-of-supply-only)', () => {
    expect(GSTIN_STATE_CODES.size).toBe(36);
    expect(GSTIN_STATE_CODES.has('29')).toBe(true);  // Karnataka
    expect(GSTIN_STATE_CODES.has('04')).toBe(true);  // Chandigarh
    expect(GSTIN_STATE_CODES.has('96')).toBe(false); // foreign — place-of-supply only
    expect(GSTIN_STATE_CODES.has('97')).toBe(false); // Other Territory
  });
});

// Check-digit vectors verified against the GSTN/CBIC Luhn-mod-36 algorithm
// (factor 2 at the rightmost of the first 14 chars, alternating 2/1 leftwards).
describe('gstinCheckDigit', () => {
  it('reproduces the published GSTN vector 27AAPFU0939F1ZV', () => {
    expect(gstinCheckDigit('27AAPFU0939F1Z')).toBe('V');
  });
  it('computes check digits for the WP fixtures (Karnataka 29, Chandigarh 04)', () => {
    expect(gstinCheckDigit('29AAACX0000X1Z')).toBe('W');
    expect(gstinCheckDigit('04AAACX0000X1Z')).toBe('8');
  });
  it('throws on characters outside [0-9A-Z]', () => {
    expect(() => gstinCheckDigit('29aacx-000X1Z')).toThrow(/invalid character/);
  });
});

describe('gstStateCodeOf', () => {
  it('returns the 2-digit prefix', () => {
    expect(gstStateCodeOf('29AAACX0000X1ZW')).toBe('29');
    expect(gstStateCodeOf('  27aapfu0939f1zv ')).toBe('27');
  });
  it('returns null when the prefix is not two digits', () => {
    expect(gstStateCodeOf('X9AAACX0000X1ZW')).toBeNull();
    expect(gstStateCodeOf('')).toBeNull();
  });
});

describe('validateGSTIN', () => {
  it('accepts a checksum-valid GSTIN and normalizes case/whitespace', () => {
    expect(validateGSTIN('29AAACX0000X1ZW')).toEqual({ ok: true, error: null, stateCode: '29' });
    expect(validateGSTIN('  29aaacx0000x1zw ').ok).toBe(true);
  });
  it('rejects a well-formed GSTIN with a wrong check character (29ABCDE1234F1Z5 → expected W)', () => {
    const r = validateGSTIN('29ABCDE1234F1Z5');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/check character/i);
    expect(r.stateCode).toBe('29');
  });
  it('rejects a format-valid GSTIN on a non-GSTIN state code (96 foreign — rejected before checksum)', () => {
    const r = validateGSTIN('96ABCDE1234F1ZV');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('96');
  });
  it('rejects malformed GSTINs (14 chars, entity code 0, missing Z)', () => {
    expect(validateGSTIN('29AAACX0000X1Z').ok).toBe(false);       // 14 chars
    expect(validateGSTIN('29AAACX0000X0ZW').ok).toBe(false);      // entity code 0
    expect(validateGSTIN('29AAACX0000X1YW').ok).toBe(false);      // 14th char not Z
    expect(validateGSTIN('').ok).toBe(false);
  });
  it('cross-checks the state prefix against a selected subdivision authority code', () => {
    expect(validateGSTIN('29AAACX0000X1ZW', { tax_authority_code: '29' }).ok).toBe(true);
    const r = validateGSTIN('29AAACX0000X1ZW', { tax_authority_code: '27' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/does not match the selected state/);
  });
  it('skips the subdivision cross-check when none supplied', () => {
    expect(validateGSTIN('27AAPFU0939F1ZV').ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `npx vitest run src/lib/regimes/in_gst/gstin.test.ts` → FAIL: `Failed to resolve import "./gstin"` (module does not exist).
- [ ] **Step 3: Implement `src/lib/regimes/in_gst/gstin.ts`.**

```ts
// GSTIN validation (Phase 4 India Pack). WP-S2 is the SOLE author of this module;
// WP-S3 and WP-L2 CONSUME its exports. Pure — no I/O. Format per CGST Rule 10:
// 2-digit state code + 10-char PAN + entity code [1-9A-Z] + 'Z' + mod-36 check
// character (GSTN/CBIC Luhn-mod-36 over the first 14 characters). The GSTIN-issuing
// state-code set is baked in here (the S1b-seeded set MINUS the non-GSTIN
// place-of-supply codes 96/97) — never passed as a param.

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export interface GstinCheck {
  ok: boolean;
  error: string | null;
  stateCode: string | null;
}

// 36 GSTIN-capable state codes: 01–24 contiguous, 26 (merged DNH+DD; 25 defunct),
// 27, then 29–38 (29 KA … 37 AP with 28 defunct, 38 Ladakh). 96/97 are
// place-of-supply-only (foreign / other territory) and are NOT GSTIN-issuing.
export const GSTIN_STATE_CODES: ReadonlySet<string> = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
  '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24',
  '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38',
]);

export function gstStateCodeOf(gstin: string): string | null {
  const value = gstin.trim().toUpperCase();
  return /^[0-9]{2}/.test(value) ? value.slice(0, 2) : null;
}

/** GSTN/CBIC check character: factor 2 at the RIGHTMOST char of the 14-char body,
 *  alternating 2/1 leftwards; each product folded as floor(p/36) + p%36. */
export function gstinCheckDigit(base14: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = base14.length - 1; i >= 0; i--) {
    const cp = GSTIN_CHARSET.indexOf(base14[i]);
    if (cp < 0) throw new Error(`gstinCheckDigit: invalid character '${base14[i]}'`);
    const product = factor * cp;
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARSET[(36 - (sum % 36)) % 36];
}

export function validateGSTIN(
  gstin: string,
  subdivision?: { tax_authority_code: string | null } | null,
): GstinCheck {
  const value = gstin.trim().toUpperCase();
  const stateCode = gstStateCodeOf(value);
  if (!GSTIN_PATTERN.test(value)) {
    return {
      ok: false, stateCode,
      error: 'GSTIN must be 15 characters: 2-digit state code, 10-character PAN, entity code, "Z", check character.',
    };
  }
  if (!stateCode || !GSTIN_STATE_CODES.has(stateCode)) {
    return { ok: false, stateCode, error: `GSTIN state code ${stateCode} is not a GSTIN-issuing state code.` };
  }
  if (gstinCheckDigit(value.slice(0, 14)) !== value[14]) {
    return { ok: false, stateCode, error: 'GSTIN check character is invalid — please re-check the number.' };
  }
  if (subdivision?.tax_authority_code && stateCode !== subdivision.tax_authority_code) {
    return {
      ok: false, stateCode,
      error: `GSTIN state code ${stateCode} does not match the selected state (${subdivision.tax_authority_code}).`,
    };
  }
  return { ok: true, error: null, stateCode };
}
```

- [ ] **Step 4: Run — expect PASS** (all 12 tests). `npx vitest run src/lib/regimes/in_gst/gstin.test.ts`
- [ ] **Step 5: Commit.** `git add src/lib/regimes/in_gst/gstin.ts src/lib/regimes/in_gst/gstin.test.ts && git commit -m "feat(regimes): GSTIN mod-36 checksum + state-prefix validator (P4 S2)"`

---

### Task S2.2: Place-of-supply derivation (IGST Act Sec 12(2))

**Files:**
Create: `src/lib/regimes/in_gst/placeOfSupply.ts`
Test: `src/lib/regimes/in_gst/placeOfSupply.test.ts`

**Interfaces:**
Consumes: `validateGSTIN`, `gstStateCodeOf` (Task S2.1).
Produces: `derivePlaceOfSupply(input: PlaceOfSupplyInput): PlaceOfSupplyResult` with `interface PlaceOfSupplyInput { buyerTaxNumber: string | null; buyerSubdivisionId: string | null; subdivisionIdByAuthorityCode: ReadonlyMap<string, string> }`, `type PlaceOfSupplyBasis = 'gstin_prefix' | 'billing_subdivision' | 'none'`, `interface PlaceOfSupplyResult { subdivisionId: string | null; basis: PlaceOfSupplyBasis }` — consumed by Task S2.6 and by WP-S3 fixtures.

- [ ] **Step 1: Write the failing test.** Create `src/lib/regimes/in_gst/placeOfSupply.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { derivePlaceOfSupply } from './placeOfSupply';

const byCode = new Map([['29', 'sub-ka'], ['27', 'sub-mh'], ['96', 'sub-foreign']]);

describe('derivePlaceOfSupply — Sec 12(2) IGST Act', () => {
  it('registered buyer: valid GSTIN prefix resolves the state (buyer location)', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: '27AAPFU0939F1ZV', buyerSubdivisionId: 'sub-ka', subdivisionIdByAuthorityCode: byCode,
    })).toEqual({ subdivisionId: 'sub-mh', basis: 'gstin_prefix' });
  });
  it('unregistered buyer (no GSTIN): billing subdivision is the address on record', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: null, buyerSubdivisionId: 'sub-ka', subdivisionIdByAuthorityCode: byCode,
    })).toEqual({ subdivisionId: 'sub-ka', basis: 'billing_subdivision' });
  });
  it('checksum-invalid GSTIN falls back to the billing subdivision (never a wrong-state split)', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: '29ABCDE1234F1Z5', buyerSubdivisionId: 'sub-mh', subdivisionIdByAuthorityCode: byCode,
    })).toEqual({ subdivisionId: 'sub-mh', basis: 'billing_subdivision' });
  });
  it('valid GSTIN whose prefix is not in the map falls back to billing subdivision', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: '04AAACX0000X1Z8', buyerSubdivisionId: 'sub-ka',
      subdivisionIdByAuthorityCode: new Map([['29', 'sub-ka']]),
    })).toEqual({ subdivisionId: 'sub-ka', basis: 'billing_subdivision' });
  });
  it('nothing known: none/null (the requirement gate, not this function, decides blocking)', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: null, buyerSubdivisionId: null, subdivisionIdByAuthorityCode: byCode,
    })).toEqual({ subdivisionId: null, basis: 'none' });
  });
  it('non-IN tenants (empty map, non-GSTIN tax numbers) degrade to billing subdivision', () => {
    expect(derivePlaceOfSupply({
      buyerTaxNumber: 'OM1234567', buyerSubdivisionId: 'sub-om', subdivisionIdByAuthorityCode: new Map(),
    })).toEqual({ subdivisionId: 'sub-om', basis: 'billing_subdivision' });
  });
});
```

- [ ] **Step 2: Run — expect FAIL:** `npx vitest run src/lib/regimes/in_gst/placeOfSupply.test.ts` → `Failed to resolve import "./placeOfSupply"`.
- [ ] **Step 3: Implement `src/lib/regimes/in_gst/placeOfSupply.ts`.**

```ts
// Place of supply — Section 12(2), IGST Act 2017 (services, default rule):
// supply to a REGISTERED person → the location of that person (their GSTIN
// state); supply to an UNREGISTERED person → the recipient's address on record
// (billing subdivision). Pure and data-driven: for non-IN tenants the authority
// map is empty and tax numbers are not GSTINs, so this degrades to the billing
// subdivision without any country branching.
import { gstStateCodeOf, validateGSTIN } from './gstin';

export interface PlaceOfSupplyInput {
  buyerTaxNumber: string | null;
  buyerSubdivisionId: string | null;
  /** geo_subdivisions.tax_authority_code → geo_subdivisions.id for the seller country. */
  subdivisionIdByAuthorityCode: ReadonlyMap<string, string>;
}

export type PlaceOfSupplyBasis = 'gstin_prefix' | 'billing_subdivision' | 'none';

export interface PlaceOfSupplyResult {
  subdivisionId: string | null;
  basis: PlaceOfSupplyBasis;
}

export function derivePlaceOfSupply(input: PlaceOfSupplyInput): PlaceOfSupplyResult {
  const gstin = input.buyerTaxNumber?.trim() ?? '';
  if (gstin && validateGSTIN(gstin).ok) {
    const code = gstStateCodeOf(gstin);
    const subdivisionId = code ? input.subdivisionIdByAuthorityCode.get(code) ?? null : null;
    if (subdivisionId) return { subdivisionId, basis: 'gstin_prefix' };
  }
  if (input.buyerSubdivisionId) {
    return { subdivisionId: input.buyerSubdivisionId, basis: 'billing_subdivision' };
  }
  return { subdivisionId: null, basis: 'none' };
}
```

- [ ] **Step 4: Run — expect PASS** (6 tests).
- [ ] **Step 5: Commit.** `git add src/lib/regimes/in_gst/placeOfSupply.ts src/lib/regimes/in_gst/placeOfSupply.test.ts && git commit -m "feat(regimes): Sec 12(2) place-of-supply derivation (P4 S2)"`

---

### Task S2.3: Party tax-number validation chokepoint + service splices

**Files:**
Create: `src/lib/regimes/partyTaxValidation.ts`
Modify: `src/lib/customerService.ts` (`CreateCustomerInput` at :10-28; `createCustomer` at :36-58), `src/lib/companyService.ts` (`createCompany` at :53-92; `updateCompany` at :103-123)
Test: `src/lib/regimes/partyTaxValidation.test.ts`, `src/lib/companyService.taxValidation.test.ts`

**Interfaces:**
Consumes: `validateGSTIN` (S2.1); live tables `geo_countries(code)`, `geo_subdivisions(tax_authority_code)` (existing).
Produces: `validatePartyTaxNumberPure(args: { countryCode: string | null; taxNumber: string | null | undefined; subdivisionAuthorityCode: string | null }): PartyTaxNumberCheck` and `assertPartyTaxNumberValid(args: { countryId: string | null | undefined; subdivisionId: string | null | undefined; taxNumber: string | null | undefined }): Promise<void>` — consumed by Task S2.4 and by WP-L2 (registration capture).

> **Deliberate deviation from spec §4-S2's literal "customer/company forms" wording:** company GSTIN validation is enforced ONLY at the service-layer chokepoint (`companyService.createCompany`/`updateCompany`, spliced in Step 7 below) — there is intentionally **no** inline GSTIN field on the company form. Every company mutation surface (modal, page, import script) routes through `assertPartyTaxNumberValid`, so the chokepoint is the single, non-bypassable enforcement point; only the customer form (Task S2.4) additionally gets an inline field.

- [ ] **Step 1: Write the failing dispatcher test.** Create `src/lib/regimes/partyTaxValidation.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { from: fromMock } }));

import { validatePartyTaxNumberPure, assertPartyTaxNumberValid } from './partyTaxValidation';

const chainReturning = (row: unknown) => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  return chain;
};

describe('validatePartyTaxNumberPure', () => {
  it('empty tax number is always ok (the column is optional; requirement gates own mandatoriness)', () => {
    expect(validatePartyTaxNumberPure({ countryCode: 'IN', taxNumber: '', subdivisionAuthorityCode: null }).ok).toBe(true);
    expect(validatePartyTaxNumberPure({ countryCode: 'IN', taxNumber: null, subdivisionAuthorityCode: null }).ok).toBe(true);
  });
  it('non-IN countries pass through (GCC VATINs are validated by the pack regex elsewhere)', () => {
    expect(validatePartyTaxNumberPure({ countryCode: 'OM', taxNumber: 'OM1100xyz', subdivisionAuthorityCode: null }).ok).toBe(true);
    expect(validatePartyTaxNumberPure({ countryCode: null, taxNumber: 'anything', subdivisionAuthorityCode: null }).ok).toBe(true);
  });
  it('IN: checksum-valid GSTIN passes; invalid checksum fails with the gstin error', () => {
    expect(validatePartyTaxNumberPure({ countryCode: 'IN', taxNumber: '29AAACX0000X1ZW', subdivisionAuthorityCode: null }).ok).toBe(true);
    const bad = validatePartyTaxNumberPure({ countryCode: 'IN', taxNumber: '29ABCDE1234F1Z5', subdivisionAuthorityCode: null });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/check character/i);
  });
  it('IN: state prefix must match the selected subdivision authority code when provided', () => {
    const r = validatePartyTaxNumberPure({ countryCode: 'IN', taxNumber: '29AAACX0000X1ZW', subdivisionAuthorityCode: '27' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/selected state/);
  });
});

describe('assertPartyTaxNumberValid', () => {
  it('resolves country code + subdivision authority code and throws the pure error', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'geo_countries') return chainReturning({ code: 'IN' });
      if (table === 'geo_subdivisions') return chainReturning({ tax_authority_code: '27' });
      throw new Error(`unexpected table ${table}`);
    });
    await expect(assertPartyTaxNumberValid({
      countryId: 'in-1', subdivisionId: 'sub-mh', taxNumber: '29AAACX0000X1ZW',
    })).rejects.toThrow(/selected state/);
  });
  it('no-ops without a tax number or country (never a hidden network call)', async () => {
    fromMock.mockClear();
    await assertPartyTaxNumberValid({ countryId: null, subdivisionId: null, taxNumber: '29AAACX0000X1ZW' });
    await assertPartyTaxNumberValid({ countryId: 'in-1', subdivisionId: null, taxNumber: '  ' });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL:** `npx vitest run src/lib/regimes/partyTaxValidation.test.ts` → `Failed to resolve import "./partyTaxValidation"`.
- [ ] **Step 3: Implement `src/lib/regimes/partyTaxValidation.ts`.**

```ts
// Party (buyer) tax-number validation dispatcher. Lives under src/lib/regimes/
// so country dispatch stays inside the regimes boundary (eslint
// no-country-branching-outside-regimes). Empty values are always ok — the
// master_document_requirements gate owns mandatoriness at issuance.
import { supabase } from '../supabaseClient';
import { validateGSTIN } from './in_gst/gstin';

export interface PartyTaxNumberCheck {
  ok: boolean;
  error: string | null;
}

export function validatePartyTaxNumberPure(args: {
  countryCode: string | null;
  taxNumber: string | null | undefined;
  subdivisionAuthorityCode: string | null;
}): PartyTaxNumberCheck {
  const value = args.taxNumber?.trim() ?? '';
  if (!value) return { ok: true, error: null };
  if (args.countryCode !== 'IN') return { ok: true, error: null };
  const check = validateGSTIN(value, { tax_authority_code: args.subdivisionAuthorityCode });
  return { ok: check.ok, error: check.error };
}

/** Service-layer chokepoint: resolves the country code and (when the party has
 *  a state selected) the subdivision's GST authority code, then applies the
 *  pure dispatcher. Throws Error(message) on failure so every mutation surface
 *  (modal, page form, script) gets the same rejection. */
export async function assertPartyTaxNumberValid(args: {
  countryId: string | null | undefined;
  subdivisionId: string | null | undefined;
  taxNumber: string | null | undefined;
}): Promise<void> {
  const value = args.taxNumber?.trim() ?? '';
  if (!value || !args.countryId) return;
  const { data: country, error } = await supabase
    .from('geo_countries').select('code').eq('id', args.countryId).maybeSingle();
  if (error) throw error;
  let authorityCode: string | null = null;
  if (args.subdivisionId) {
    const { data: sub, error: subErr } = await supabase
      .from('geo_subdivisions').select('tax_authority_code').eq('id', args.subdivisionId).maybeSingle();
    if (subErr) throw subErr;
    authorityCode = sub?.tax_authority_code ?? null;
  }
  const check = validatePartyTaxNumberPure({
    countryCode: country?.code ?? null, taxNumber: value, subdivisionAuthorityCode: authorityCode,
  });
  if (!check.ok) throw new Error(check.error ?? 'Invalid tax registration number.');
}
```

- [ ] **Step 4: Run — expect PASS** (6 tests).
- [ ] **Step 5: Write the failing splice test.** Create `src/lib/companyService.taxValidation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { assertSpy, fromMock, rpcMock } = vi.hoisted(() => ({
  assertSpy: vi.fn(async () => undefined),
  fromMock: vi.fn(),
  rpcMock: vi.fn(async () => ({ data: 'COMP-0042', error: null })),
}));
vi.mock('./regimes/partyTaxValidation', () => ({ assertPartyTaxNumberValid: assertSpy }));
vi.mock('./supabaseClient', () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import { createCompany, updateCompany } from './companyService';

const insertChain = () => {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: { id: 'co-1', name: 'X' }, error: null }));
  return chain;
};

beforeEach(() => {
  assertSpy.mockClear();
  fromMock.mockReset();
  fromMock.mockImplementation(() => insertChain());
});

describe('companyService tax-number chokepoint', () => {
  it('createCompany validates the tax number BEFORE inserting and aborts on failure', async () => {
    assertSpy.mockRejectedValueOnce(new Error('GSTIN check character is invalid — please re-check the number.'));
    await expect(createCompany({
      name: 'Bad GSTIN Co', country_id: 'in-1', subdivision_id: 'sub-ka', tax_number: '29ABCDE1234F1Z5',
    })).rejects.toThrow(/check character/);
    expect(fromMock).not.toHaveBeenCalled();
  });
  it('createCompany passes country/subdivision/tax_number to the validator', async () => {
    await createCompany({ name: 'Good Co', country_id: 'in-1', subdivision_id: 'sub-ka', tax_number: '29AAACX0000X1ZW' });
    expect(assertSpy).toHaveBeenCalledWith({
      countryId: 'in-1', subdivisionId: 'sub-ka', taxNumber: '29AAACX0000X1ZW',
    });
  });
  it('updateCompany validates when the patch carries a tax_number (context from the patch or the row)', async () => {
    const readChain = insertChain();
    (readChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'co-1', country_id: 'in-1', subdivision_id: 'sub-mh' }, error: null,
    });
    fromMock.mockImplementationOnce(() => readChain);   // 1st from(): context read
    await updateCompany('co-1', { tax_number: '29AAACX0000X1ZW' });
    expect(assertSpy).toHaveBeenCalledWith({
      countryId: 'in-1', subdivisionId: 'sub-mh', taxNumber: '29AAACX0000X1ZW',
    });
  });
});
```

- [ ] **Step 6: Run — expect FAIL:** `npx vitest run src/lib/companyService.taxValidation.test.ts` → `assertSpy` never called (`expected "spy" to be called…`), and the createCompany-abort test fails because the insert proceeds.
- [ ] **Step 7: Splice the services.** In `src/lib/companyService.ts` add the import and calls:
  - Top of file: `import { assertPartyTaxNumberValid } from './regimes/partyTaxValidation';`
  - In `createCompany` (immediately after the `resolvedName` guard at :57-58, BEFORE the `get_next_company_number` rpc):
    ```ts
    await assertPartyTaxNumberValid({
      countryId: input.country_id ?? null,
      subdivisionId: input.subdivision_id ?? null,
      taxNumber: input.tax_number ?? null,
    });
    ```
  - In `updateCompany` (after the `if (!id)` guard at :104, before `stripGeneratedColumns`):
    ```ts
    if (typeof input.tax_number === 'string' && input.tax_number.trim() !== '') {
      const { data: ctxRow } = await supabase
        .from('companies').select('country_id, subdivision_id').eq('id', id).maybeSingle();
      await assertPartyTaxNumberValid({
        countryId: (input.country_id as string | null | undefined) ?? ctxRow?.country_id ?? null,
        subdivisionId: (input.subdivision_id as string | null | undefined) ?? ctxRow?.subdivision_id ?? null,
        taxNumber: input.tax_number,
      });
    }
    ```
  In `src/lib/customerService.ts`: add `tax_number?: string | null;` to `CreateCustomerInput` (:10-28), add the same import, and at the top of `createCustomer` (:36, before the `get_next_customer_number` rpc):
    ```ts
    await assertPartyTaxNumberValid({
      countryId: input.country_id ?? null,
      subdivisionId: input.subdivision_id ?? null,
      taxNumber: input.tax_number ?? null,
    });
    ```
- [ ] **Step 8: Run — expect PASS:** `npx vitest run src/lib/companyService.taxValidation.test.ts src/lib/regimes/partyTaxValidation.test.ts` (9 tests).
- [ ] **Step 9: Commit.** `git add src/lib/regimes/partyTaxValidation.ts src/lib/regimes/partyTaxValidation.test.ts src/lib/companyService.ts src/lib/companyService.taxValidation.test.ts src/lib/customerService.ts && git commit -m "feat(regimes): party tax-number validation chokepoint + customer/company service splices (P4 S2)"`

---

### Task S2.4: Customer form GSTIN capture + inline validation

**Files:**
Modify: `src/components/customers/CustomerFormModal.tsx` (formData at :105-121, `validate` at :194-203, payload at :222-239, `resetForm` at :263-287; new input in the address/notes section that renders `<AddressFields>` — `addressValue` built at :318-323)
Test: `src/components/customers/CustomerFormModal.test.tsx` (append a describe; existing harness at :1-55)

**Interfaces:**
Consumes: `validatePartyTaxNumberPure` (S2.3); `CreateCustomerInput.tax_number` (S2.3).
Produces: customer creation UI captures `customers_enhanced.tax_number` with inline format/checksum validation (label from the selected country's `tax_number_label`, e.g. "GSTIN" once S1b data is live).

- [ ] **Step 1: Write the failing modal test.** Append to `src/components/customers/CustomerFormModal.test.tsx` (and add the hoisted mock next to the existing ones at :9-18):

```ts
const { validatePureSpy } = vi.hoisted(() => ({
  validatePureSpy: vi.fn(() => ({ ok: true, error: null })),
}));
vi.mock('../../lib/regimes/partyTaxValidation', () => ({
  validatePartyTaxNumberPure: validatePureSpy,
}));
```

```tsx
describe('CustomerFormModal — tax registration number (GSTIN) capture', () => {
  beforeEach(() => {
    validatePureSpy.mockReset();
    validatePureSpy.mockReturnValue({ ok: true, error: null });
    createCustomerSpy.mockReset();
    createCustomerSpy.mockResolvedValue({ id: 'cust-1' });
  });

  it('blocks submit and shows the validator error for an invalid tax number', async () => {
    const user = userEvent.setup();
    validatePureSpy.mockReturnValue({
      ok: false, error: 'GSTIN check character is invalid — please re-check the number.',
    });
    renderModal();
    await user.type(screen.getByLabelText(/customer name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/tax registration number/i), '29ABCDE1234F1Z5');
    await user.click(screen.getByRole('button', { name: /create customer/i }));
    expect(await screen.findByText(/check character is invalid/i)).toBeInTheDocument();
    expect(createCustomerSpy).not.toHaveBeenCalled();
  });

  it('includes tax_number in the createCustomer payload when valid', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText(/customer name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/tax registration number/i), '29AAACX0000X1ZW');
    await user.click(screen.getByRole('button', { name: /create customer/i }));
    await waitFor(() =>
      expect(createCustomerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ tax_number: '29AAACX0000X1ZW' }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL:** `npx vitest run src/components/customers/CustomerFormModal.test.tsx` → `Unable to find a label with the text of: /tax registration number/i`.
- [ ] **Step 3: Implement the field.** In `src/components/customers/CustomerFormModal.tsx`:
  - Import: `import { validatePartyTaxNumberPure } from '../../lib/regimes/partyTaxValidation';`
  - Widen the `FormErrors` type (declared above :90) with `tax_number?: string;`
  - Add `tax_number: '',` to the `formData` initial state (:105-121) and to `resetForm` (:263-287).
  - Extend `validate` (:194-203) — change deps from `[]` to `[countries]`:
    ```ts
    if (data.tax_number.trim()) {
      const countryCode =
        (countries.find((c) => c.id === data.country_id) as { code?: string } | undefined)?.code ?? null;
      const check = validatePartyTaxNumberPure({
        countryCode, taxNumber: data.tax_number, subdivisionAuthorityCode: null,
      });
      if (!check.ok) errs.tax_number = check.error ?? 'Invalid tax registration number';
    }
    ```
  - Add `tax_number: customer.tax_number.trim() || null,` to the `createMutation` payload (:222-239).
  - In `handleSubmit` (:289-296) include `tax_number: true` in the `setTouched` call.
  - Render the input inside the collapsed address/notes section, directly below the `<AddressFields …/>` block (the section whose value is `addressValue`, :318-323), matching the neighboring input classes:
    ```tsx
    <div>
      <label htmlFor="customer-tax-number" className="mb-1 block text-sm font-medium">
        {(countries.find((c) => c.id === formData.country_id) as { tax_number_label?: string | null } | undefined)
          ?.tax_number_label ?? 'Tax Registration Number'}
      </label>
      <input
        id="customer-tax-number"
        aria-label="Tax Registration Number"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-ring"
        value={formData.tax_number}
        onChange={(e) => handleFieldChange('tax_number', e.target.value)}
        onBlur={() => handleBlur('tax_number')}
      />
      {errors.tax_number && <p className="mt-1 text-sm text-danger">{errors.tax_number}</p>}
    </div>
    ```
    (The `aria-label` keeps the test selector stable when the country supplies "GSTIN" as `tax_number_label`. If the section is collapsed by default in the rendered test, keep the input OUTSIDE the collapsed wrapper — place it directly under the Company select instead; the label/behavior contract above is what the test pins, and the section state is visible when you open the file.)
- [ ] **Step 4: Run — expect PASS:** `npx vitest run src/components/customers/CustomerFormModal.test.tsx` (all existing + 2 new).
- [ ] **Step 5: Commit.** `git add src/components/customers/CustomerFormModal.tsx src/components/customers/CustomerFormModal.test.tsx && git commit -m "feat(customers): GSTIN/tax-number capture with checksum validation in customer form (P4 S2)"`

---

### Task S2.5: `RoundingPolicy.level` gains `'head'` (client union)

**Files:**
Modify: `src/lib/regimes/types.ts` (`RoundingPolicy` at :23-27 — verified currently `level: 'line' | 'document';`)
Test: `src/lib/tax/kernel/headRounding.test.ts` (new)

**Interfaces:**
Consumes: `computeWithMode` (`src/lib/tax/kernel/index.ts:88`). WP-S1a owns ONLY the parallel **registry Zod** enum widening (`tax.rounding_policy.level` accepts `'head'`); it does NOT touch this TS type.
Produces: the widened `RoundingPolicy['level'] = 'line' | 'document' | 'head'` on the **canonical `RoundingPolicy` in `src/lib/regimes/types.ts`** — the same type WP-S3's `in_gst` strategy and the kernel import (NOT a kernel-local copy). **This task (WP-S2 Task S2.5) is the sole producer of the TS-side widening.** Consumed by Task S2.6 (pack-resolved IN policy `{mode:'half_up', level:'head', cash_increment:1}` threads without casts) and WP-S3 (head-level Section 170 rounding).

- [ ] **Step 1: Write the failing test.** Create `src/lib/tax/kernel/headRounding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeWithMode } from './index';
import type { GeoCountryTaxRateRow, RoundingPolicy, TaxContext } from '../../regimes/types';
import type { RateContext } from '../../currencyService';

const rc: RateContext = { documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2, rate: 1, rateSource: 'derived' };
const vat: GeoCountryTaxRateRow = {
  id: 'r1', country_id: 'in', subdivision_id: null, component_code: 'VAT', component_label: 'VAT',
  tax_category: 'standard', rate: 18, applies_to: null, valid_from: '2017-07-01', valid_to: null, sort_order: 0,
};

const ctxWith = (level: RoundingPolicy['level']): TaxContext => ({
  documentType: 'invoice',
  seller: { legalEntityId: 'le', countryId: 'in', subdivisionId: null, taxIdentifier: null, registrations: [] },
  buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
  taxPointDate: '2026-07-05', placeOfSupplySubdivisionId: null,
  lines: [
    { lineItemId: 'idx:0', description: 'a', quantity: 1, unitPrice: 100.005, lineDiscount: 0, unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null },
    { lineItemId: 'idx:1', description: 'b', quantity: 1, unitPrice: 200.005, lineDiscount: 0, unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null },
  ],
  documentDiscount: 0, taxInclusive: false, rateContext: rc, rates: [vat],
  roundingPolicy: { mode: 'half_up', level },
  scaleSystem: 'western',
});

describe("RoundingPolicy level 'head' (Section 170 seam, threaded by S2, exercised by S3)", () => {
  it("'head' computes per-component-rollup rounding (same arithmetic path as 'document' pre-split)", () => {
    const head = computeWithMode(ctxWith('head'), 'single');
    const doc = computeWithMode(ctxWith('document'), 'single');
    expect(head.totals).toEqual(doc.totals);
    expect(head.rollups.map((r) => r.taxAmount)).toEqual(doc.rollups.map((r) => r.taxAmount));
  });
  it("'head' differs from 'line' when per-line rounding accumulates", () => {
    const head = computeWithMode(ctxWith('head'), 'single');
    const line = computeWithMode(ctxWith('line'), 'single');
    expect(head.totals.taxTotal).not.toBe(line.totals.taxTotal);
  });
});
```

- [ ] **Step 2: Run — expect FAIL:** `npx vitest run src/lib/tax/kernel/headRounding.test.ts` → TypeScript error `Type '"head"' is not assignable to type '"line" | "document"'` (vitest reports the transform/type failure).
- [ ] **Step 3: Widen the union.** In `src/lib/regimes/types.ts:25` change:
    ```ts
    level: 'line' | 'document';
    ```
    to
    ```ts
    /** 'head' = per tax head per document (India Section 170); the kernel treats
     *  it as component-rollup rounding — identical arithmetic to 'document' in
     *  single mode, distinct per CGST/SGST/IGST head under split (WP-S3). */
    level: 'line' | 'document' | 'head';
    ```
    (WP-S1a widens only the registry Zod schema, NOT this TS union — WP-S2 owns the `src/lib/regimes/types.ts` widening, so this is a real change, not a no-op. If a `RoundingPolicy` is also defined kernel-locally, widen the one in `src/lib/regimes/types.ts` that S3 imports.)
- [ ] **Step 4: Run — expect PASS** (2 tests). Also run `npx vitest run src/lib/tax/kernel` to confirm no kernel regression.
- [ ] **Step 5: Commit.** `git add src/lib/regimes/types.ts src/lib/tax/kernel/headRounding.test.ts && git commit -m "feat(tax): widen RoundingPolicy.level with 'head' (Section 170 seam, P4 S2)"`

---

### Task S2.6: Thread buyer / place-of-supply / pack rounding / scale into `computeDocumentTotals`

**Files:**
Modify: `src/lib/taxDocumentService.ts` (`DocumentTotalsInput` at :18-26; `fetchSellerContext` at :104-126; `computeDocumentTotals` at :141-175 — hardcodes verified at :162 `subdivisionId: null`, :165 buyer nulls, :166 `placeOfSupplySubdivisionId: null`, :169 rounding, :170 scale, :172 `resolveTaxStrategy('simple_vat')` which STAYS)
Test: `src/lib/taxDocumentService.threading.test.ts` (new)

**Interfaces:**
Consumes: `derivePlaceOfSupply` (S2.2); `RoundingPolicy.level 'head'` (S2.5); `tenants.resolved_country_config` bindings `'tax.rounding_policy'` / `'format.amount_words_scale'` (pattern verified at `src/lib/tax/assembleStockSaleContext.ts:36-63`; the S1b IN pack populates them).
Produces: `DocumentTotalsInput` gains `customerId?: string | null; companyId?: string | null`; `computeDocumentTotals` return gains `placeOfSupplySubdivisionId: string | null` — consumed by Task S2.7. The `'simple_vat'` literal at :172 is the single remaining hardcode, replaced in WP-S3.

- [ ] **Step 1: Write the failing threading test.** Create `src/lib/taxDocumentService.threading.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaxComputation, TaxContext } from './regimes/types';
import type { RateContext } from './currencyService';

const cannedComputation: TaxComputation = {
  lines: [], rollups: [],
  totals: { taxableBase: 0, taxTotal: 0, grandTotal: 0, roundingAdjustment: null },
  expectedWithholding: null, notations: [],
  trace: { regimeKey: 'simple_vat', pluginVersion: 't', packVersionId: null, schemeMode: 'single', steps: [] },
};

const { computeSpy, tables, fromMock } = vi.hoisted(() => {
  const computeSpy = vi.fn(async (_ctx: unknown) => (undefined as never));
  const tables: Record<string, unknown> = {};
  const makeChain = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'lte', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: Array.isArray(result) ? result[0] ?? null : result, error: null }));
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: Array.isArray(result) ? result : result === null ? [] : [result], error: null });
    return chain;
  };
  const fromMock = vi.fn((table: string) => makeChain(tables[table] ?? null));
  return { computeSpy, tables, fromMock };
});

vi.mock('./supabaseClient', () => ({ supabase: { from: fromMock } }));
vi.mock('./regimes/register', () => ({ registerAllRegimePlugins: vi.fn() }));
vi.mock('./regimes/registry', () => ({
  resolveTaxStrategy: vi.fn(() => ({
    key: 'simple_vat', version: 't', schemeMode: 'single',
    defaults: { roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western' },
    compute: computeSpy,
  })),
}));

import { computeDocumentTotals } from './taxDocumentService';

const rc: RateContext = { documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2, rate: 1, rateSource: 'derived' };
const baseInput = {
  items: [{ description: 'Data recovery — evaluation', quantity: 1, unit_price: 8000 }],
  discountType: null, discountAmount: 0, taxRate: 18,
  documentType: 'invoice' as const, documentDate: '2026-07-05', taxInclusive: false,
};

beforeEach(() => {
  computeSpy.mockReset();
  computeSpy.mockResolvedValue(cannedComputation);
  fromMock.mockClear();
  tables.legal_entities = { id: 'le-1', tenant_id: 't-1', country_id: 'in-1', subdivision_id: 'sub-ka', tax_identifier: '29AAACX0000X1ZW', is_primary: true };
  tables.legal_entity_tax_registrations = [];
  tables.tenants = {
    resolved_country_config: {
      'regime.tax': 'in_gst',
      'tax.rounding_policy': { mode: 'half_up', level: 'head', cash_increment: 1 },
      'format.amount_words_scale': 'indian',
    },
  };
  tables.geo_country_tax_rates = [
    { id: 'r-cgst', country_id: 'in-1', subdivision_id: null, component_code: 'CGST', component_label: 'CGST', tax_category: 'standard', rate: 9, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 0 },
    { id: 'r-sgst', country_id: 'in-1', subdivision_id: null, component_code: 'SGST', component_label: 'SGST', tax_category: 'standard', rate: 9, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 1 },
    { id: 'r-igst', country_id: 'in-1', subdivision_id: null, component_code: 'IGST', component_label: 'IGST', tax_category: 'standard', rate: 18, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 2 },
  ];
  tables.customers_enhanced = { tax_number: '27AAPFU0939F1ZV', country_id: 'in-1', subdivision_id: 'sub-ka' };
  tables.companies = null;
  tables.geo_subdivisions = [
    { id: 'sub-ka', tax_authority_code: '29' },
    { id: 'sub-mh', tax_authority_code: '27' },
  ];
});

describe('computeDocumentTotals — buyer-seam threading (P4 S2)', () => {
  it('threads buyer fields, GSTIN-derived place of supply, pack rounding and scale into TaxContext', async () => {
    const result = await computeDocumentTotals({ ...baseInput, customerId: 'cust-1', companyId: null }, rc);
    expect(computeSpy).toHaveBeenCalledTimes(1);
    const ctx = computeSpy.mock.calls[0][0] as TaxContext;
    expect(ctx.buyer).toEqual({
      taxNumber: '27AAPFU0939F1ZV', countryId: 'in-1', subdivisionId: 'sub-ka',
      isBusiness: false, addressSnapshot: null,
    });
    // Registered buyer: GSTIN prefix 27 wins over billing state 29 (Sec 12(2)).
    expect(ctx.placeOfSupplySubdivisionId).toBe('sub-mh');
    expect(ctx.seller.subdivisionId).toBe('sub-ka');
    expect(ctx.roundingPolicy).toEqual({ mode: 'half_up', level: 'head', cash_increment: 1 });
    expect(ctx.scaleSystem).toBe('indian');
    expect(result.placeOfSupplySubdivisionId).toBe('sub-mh');
  });

  it('company overrides customer for buyer identity and sets isBusiness', async () => {
    tables.companies = { tax_number: '29AAACX0000X1ZW', country_id: 'in-1', subdivision_id: 'sub-ka' };
    await computeDocumentTotals({ ...baseInput, customerId: 'cust-1', companyId: 'co-1' }, rc);
    const ctx = computeSpy.mock.calls[0][0] as TaxContext;
    expect(ctx.buyer.taxNumber).toBe('29AAACX0000X1ZW');
    expect(ctx.buyer.isBusiness).toBe(true);
    expect(ctx.placeOfSupplySubdivisionId).toBe('sub-ka');
  });

  it('parity: without buyer ids and without pack bindings the context matches the legacy shape and skips buyer fetches', async () => {
    tables.tenants = { resolved_country_config: {} };
    const result = await computeDocumentTotals(baseInput, rc);
    const ctx = computeSpy.mock.calls[0][0] as TaxContext;
    expect(ctx.buyer).toEqual({ taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null });
    expect(ctx.placeOfSupplySubdivisionId).toBeNull();
    expect(ctx.roundingPolicy).toEqual({ mode: 'half_up', level: 'document' });
    expect(ctx.scaleSystem).toBe('western');
    expect(result.placeOfSupplySubdivisionId).toBeNull();
    const fetched = fromMock.mock.calls.map((c) => c[0]);
    expect(fetched).not.toContain('customers_enhanced');
    expect(fetched).not.toContain('companies');
    expect(fetched).not.toContain('geo_subdivisions');
  });
});
```

- [ ] **Step 2: Run — expect FAIL:** `npx vitest run src/lib/taxDocumentService.threading.test.ts` → first test fails on `ctx.buyer` (actual `taxNumber: null` — hardcode at :165) and `result.placeOfSupplySubdivisionId` is `undefined`.
- [ ] **Step 3: Implement the threading.** In `src/lib/taxDocumentService.ts`:
  - Add to imports: `import { derivePlaceOfSupply } from './regimes/in_gst/placeOfSupply';` and add `RoundingPolicy, ScaleSystem` to the type import from `./regimes/types`.
  - Extend `DocumentTotalsInput` (:18-26):
    ```ts
    /** Buyer identity for TaxContext threading (company overrides customer,
     *  mirroring issue_tax_document's buyer-identity block). Optional: legacy
     *  callers without a buyer keep the pre-S2 null-buyer context. */
    customerId?: string | null;
    companyId?: string | null;
    ```
  - Replace `fetchSellerContext` (:104-126) select + return so it also carries `tenant_id` and `subdivision_id`:
    ```ts
    async function fetchSellerContext(): Promise<{
      legalEntityId: string; tenantId: string; countryId: string; subdivisionId: string | null;
      taxIdentifier: string | null; registrations: LegalEntityTaxRegistrationRow[];
    }> {
      const { data: le, error } = await supabase
        .from('legal_entities')
        .select('id, tenant_id, country_id, subdivision_id, tax_identifier')
        .eq('is_primary', true)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (!le) throw new Error('Tenant has no primary legal entity — cannot resolve the tax jurisdiction.');
      const { data: regs, error: regErr } = await supabase
        .from('legal_entity_tax_registrations')
        .select('id, legal_entity_id, country_id, subdivision_id, tax_number, scheme, registered_from, registered_to, is_primary')
        .eq('legal_entity_id', le.id)
        .is('deleted_at', null);
      if (regErr) throw regErr;
      return {
        legalEntityId: le.id, tenantId: le.tenant_id, countryId: le.country_id,
        subdivisionId: le.subdivision_id ?? null, taxIdentifier: le.tax_identifier,
        registrations: (regs ?? []) as LegalEntityTaxRegistrationRow[],
      };
    }
    ```
  - Add three helpers after `fetchEffectiveRates` (:128-139):
    ```ts
    /** Pack-resolved rounding + scale (pattern: assembleStockSaleContext.ts:36-63).
     *  The strategy KEY is deliberately NOT consumed here — threading regime.tax
     *  before in_gst registers would throw CountryConfigError (WP-S3 owns it). */
    async function fetchPackContext(tenantId: string): Promise<{
      roundingPolicy: RoundingPolicy; scaleSystem: ScaleSystem;
    }> {
      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('resolved_country_config')
        .eq('id', tenantId)
        .maybeSingle();
      if (error) throw error;
      const resolved = (tenant?.resolved_country_config ?? {}) as Record<string, unknown>;
      return {
        roundingPolicy: (resolved['tax.rounding_policy'] as RoundingPolicy | undefined)
          ?? { mode: 'half_up', level: 'document' },
        scaleSystem: (resolved['format.amount_words_scale'] as ScaleSystem | undefined) ?? 'western',
      };
    }

    /** Buyer identity for the context: company overrides customer per-field,
     *  structurally mirroring issue_tax_document's «buyer-identity» block. */
    async function fetchBuyerContext(customerId: string | null, companyId: string | null): Promise<{
      taxNumber: string | null; countryId: string | null; subdivisionId: string | null; isBusiness: boolean;
    }> {
      let taxNumber: string | null = null;
      let countryId: string | null = null;
      let subdivisionId: string | null = null;
      if (customerId) {
        const { data, error } = await supabase
          .from('customers_enhanced')
          .select('tax_number, country_id, subdivision_id')
          .eq('id', customerId)
          .is('deleted_at', null)
          .maybeSingle();
        if (error) throw error;
        taxNumber = data?.tax_number ?? null;
        countryId = data?.country_id ?? null;
        subdivisionId = data?.subdivision_id ?? null;
      }
      if (companyId) {
        const { data, error } = await supabase
          .from('companies')
          .select('tax_number, country_id, subdivision_id')
          .eq('id', companyId)
          .is('deleted_at', null)
          .maybeSingle();
        if (error) throw error;
        taxNumber = data?.tax_number ?? taxNumber;
        countryId = data?.country_id ?? countryId;
        subdivisionId = data?.subdivision_id ?? subdivisionId;
      }
      return { taxNumber, countryId, subdivisionId, isBusiness: companyId !== null };
    }

    /** tax_authority_code → subdivision id for the seller country (empty for
     *  countries without GST-style authority codes, e.g. OM governorates). */
    async function fetchSubdivisionAuthorityMap(countryId: string): Promise<Map<string, string>> {
      const { data, error } = await supabase
        .from('geo_subdivisions')
        .select('id, tax_authority_code')
        .eq('country_id', countryId)
        .eq('is_active', true)
        .is('deleted_at', null);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.tax_authority_code) map.set(row.tax_authority_code, row.id);
      }
      return map;
    }
    ```
  - In `computeDocumentTotals` (:141-175) replace the body between `const seller = await fetchSellerContext();` and the `ctx` literal, and the hardcoded ctx fields:
    ```ts
    const seller = await fetchSellerContext();
    const pack = await fetchPackContext(seller.tenantId);
    const hasBuyer = Boolean(input.customerId || input.companyId);
    const buyer = hasBuyer
      ? await fetchBuyerContext(input.customerId ?? null, input.companyId ?? null)
      : { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false };
    const authorityMap = hasBuyer
      ? await fetchSubdivisionAuthorityMap(seller.countryId)
      : new Map<string, string>();
    const pos = derivePlaceOfSupply({
      buyerTaxNumber: buyer.taxNumber,
      buyerSubdivisionId: buyer.subdivisionId,
      subdivisionIdByAuthorityCode: authorityMap,
    });
    ```
    and in the `ctx` literal: `subdivisionId: seller.subdivisionId` (seller), `buyer: { ...buyer, addressSnapshot: null }`, `placeOfSupplySubdivisionId: pos.subdivisionId`, `roundingPolicy: pack.roundingPolicy,` `scaleSystem: pack.scaleSystem,`. Update the comment on the strategy line (:172) to:
    ```ts
    const strategy = resolveTaxStrategy('simple_vat'); // WP-S3 threads pack-resolved regime.tax (in_gst registers there)
    ```
    and the return:
    ```ts
    return { computation, placeOfSupplySubdivisionId: pos.subdivisionId, ...totalsFromComputation(computation, documentDiscount, rc.documentDecimals) };
    ```
- [ ] **Step 4: Run — expect PASS:** `npx vitest run src/lib/taxDocumentService.threading.test.ts src/lib/taxDocumentService.test.ts` (existing pure-helper tests must stay green — they don't call `computeDocumentTotals`).
- [ ] **Step 5: Live parity sanity read (no code).** Via `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):
    ```sql
    SELECT t.id, gc.code,
           t.resolved_country_config->'tax.rounding_policy'   AS rounding,
           t.resolved_country_config->>'format.amount_words_scale' AS scale
    FROM tenants t JOIN geo_countries gc ON gc.id = t.country_id
    WHERE t.deleted_at IS NULL;
    ```
    Expected: existing tenants' `rounding` is either NULL (→ code default `{half_up, document}`, byte-identical to pre-S2 behavior) or their pack's published policy (already live on the POS path via `assembleStockSaleContext` — invoices now align with it). Paste the output into the PR body under "non-India parity evidence".
- [ ] **Step 6: Commit.** `git add src/lib/taxDocumentService.ts src/lib/taxDocumentService.threading.test.ts && git commit -m "feat(tax): thread buyer/place-of-supply/pack-rounding/scale into TaxContext (P4 S2)"`

---

### Task S2.7: Callers pass buyer ids and persist `place_of_supply_subdivision_id`

**Files:**
Modify: `src/lib/invoiceService.ts` (`createInvoice` call at :449-465 + insert at :478-504; `updateInvoice` existing-row select at :637-641, call at :677-693, `updateData` at :702-717), `src/lib/quotesService.ts` (`createQuote` call at :423-438 + insert at :446-470; `updateQuote` existing-row select at :573-577, call at :608-623, `updateData` at :627-638)
Test: `src/lib/invoiceService.threading.test.ts`, `src/lib/quotesService.threading.test.ts` (new)

**Interfaces:**
Consumes: `DocumentTotalsInput.customerId/companyId` + return `placeOfSupplySubdivisionId` (S2.6); existing columns `invoices.place_of_supply_subdivision_id` / `quotes.place_of_supply_subdivision_id` (verified in `database.types.ts` Insert/Update blocks :8725/:8792 and :13532/:13588).
Produces: every draft save writes `place_of_supply_subdivision_id`, which `issue_tax_document` reads as the `place_of_supply` fact (verified in the live RPC definition) — the S2.9 acceptance and WP-S4/S6 depend on this column being populated.

- [ ] **Step 1: Write the failing invoice test.** Create `src/lib/invoiceService.threading.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { computeTotalsSpy, insertedPayloads, fromMock } = vi.hoisted(() => {
  const insertedPayloads: Record<string, unknown[]> = {};
  const computeTotalsSpy = vi.fn(async () => ({
    computation: {
      lines: [], rollups: [],
      totals: { taxableBase: 8000, taxTotal: 1440, grandTotal: 9440, roundingAdjustment: null },
      expectedWithholding: null, notations: [],
      trace: { regimeKey: 'simple_vat', pluginVersion: 't', packVersionId: null, schemeMode: 'single', steps: [] },
    },
    subtotal: 8000, taxAmount: 1440, totalAmount: 9440,
    placeOfSupplySubdivisionId: 'sub-ka',
  }));
  const rowFor = (table: string): unknown =>
    table === 'invoices'
      ? { id: 'inv-1', invoice_number: null, due_date: null }
      : [{ id: 'li-1', sort_order: 0 }];
  const fromMock = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn((payload: unknown) => {
      (insertedPayloads[table] ??= []).push(Array.isArray(payload) ? payload[0] : payload);
      return chain;
    });
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: rowFor(table), error: null }));
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rowFor(table), error: null });
    return chain;
  });
  return { computeTotalsSpy, insertedPayloads, fromMock };
});

vi.mock('./supabaseClient', () => ({
  supabase: { from: fromMock, rpc: vi.fn(async () => ({ data: 'X-1', error: null })), auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } } })) } },
  resolveTenantId: vi.fn(async () => 't-1'),
}));
vi.mock('./taxDocumentService', () => ({
  computeDocumentTotals: computeTotalsSpy,
  persistDocumentTaxLines: vi.fn(async () => undefined),
  issueTaxDocument: vi.fn(async () => ({})),
}));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(async () => ({ documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2, rate: 1, rateSource: 'derived' })),
  getBaseCurrency: vi.fn(async () => 'INR'),
  getCurrencyDecimals: vi.fn(async () => 2),
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn(async () => undefined) }));
vi.mock('./chainOfCustodyService', () => ({ logInvoiceCreated: vi.fn(async () => undefined), logInvoicePayment: vi.fn(async () => undefined) }));
vi.mock('./rateLimiter', () => ({
  checkRateLimit: vi.fn(async () => undefined),
  RATE_LIMITS: new Proxy({}, { get: () => ({ maxRequests: 1000, windowMs: 60000 }) }),
}));
vi.mock('./tenantConfigService', () => ({ getTenantConfig: vi.fn(async () => ({})) }));
vi.mock('./tenantToday', () => ({ currentTenantToday: vi.fn(async () => '2026-07-05') }));

import { createInvoice } from './invoiceService';

beforeEach(() => {
  computeTotalsSpy.mockClear();
  for (const k of Object.keys(insertedPayloads)) delete insertedPayloads[k];
});

describe('createInvoice — buyer threading + place-of-supply persistence (P4 S2)', () => {
  it('passes customerId/companyId to computeDocumentTotals and persists place_of_supply_subdivision_id', async () => {
    await createInvoice(
      { case_id: 'case-1', customer_id: 'cust-1', company_id: null, invoice_type: 'tax_invoice', invoice_date: '2026-07-05', tax_rate: 18 },
      [{ description: 'Data recovery — evaluation', quantity: 1, unit_price: 8000 }],
    );
    expect(computeTotalsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1', companyId: null }),
      expect.anything(),
    );
    expect(insertedPayloads['invoices'][0]).toMatchObject({ place_of_supply_subdivision_id: 'sub-ka' });
  });
});
```

- [ ] **Step 2: Run — expect FAIL:** `npx vitest run src/lib/invoiceService.threading.test.ts` → `computeDocumentTotals` called WITHOUT `customerId` (objectContaining mismatch) and the insert payload lacks `place_of_supply_subdivision_id`.
- [ ] **Step 3: Implement the invoice wiring.** In `src/lib/invoiceService.ts`:
  - `createInvoice`: destructure `placeOfSupplySubdivisionId` from the `computeDocumentTotals` result (:449) and add to the input object (:450-463): `customerId: invoice.customer_id ?? null, companyId: invoice.company_id ?? null,`. Add to `invoiceToInsert` (:478-504): `place_of_supply_subdivision_id: placeOfSupplySubdivisionId,`.
  - `updateInvoice`: extend the existing-row select (:637-641) to `'currency, exchange_rate, rate_source, amount_paid, customer_id, company_id'`; destructure `placeOfSupplySubdivisionId` at :677 and add to the input (:678-691): `customerId: invoice.customer_id ?? existing?.customer_id ?? null, companyId: invoice.company_id ?? existing?.company_id ?? null,`. Add `place_of_supply_subdivision_id: placeOfSupplySubdivisionId,` to `updateData` (:702-717).
- [ ] **Step 4: Run — expect PASS.** `npx vitest run src/lib/invoiceService.threading.test.ts`
- [ ] **Step 5: Write the failing quote test.** Create `src/lib/quotesService.threading.test.ts` — identical mock harness to Step 1 with these deltas: `rowFor` returns `{ id: 'q-1', quote_number: 'QUO-1' }` for `'quotes'` and `[{ id: 'qi-1', sort_order: 0 }]` for `'quote_items'`; mock `'./chainOfCustodyService'` as `{ logQuoteCreated: vi.fn(async () => undefined), logQuoteStatusChanged: vi.fn(async () => undefined) }`; drop the `'./rateLimiter'` and `'./tenantToday'` mocks (not imported by quotesService); import `{ createQuote } from './quotesService'`. Test body:

```ts
describe('createQuote — buyer threading + place-of-supply persistence (P4 S2)', () => {
  it('passes customerId/companyId to computeDocumentTotals and persists place_of_supply_subdivision_id', async () => {
    await createQuote(
      { case_id: 'case-1', customer_id: 'cust-1', company_id: null, status: 'draft', tax_rate: 18 } as never,
      [{ description: 'Data recovery — evaluation', quantity: 1, unit_price: 8000 }],
    );
    expect(computeTotalsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1', companyId: null }),
      expect.anything(),
    );
    expect(insertedPayloads['quotes'][0]).toMatchObject({ place_of_supply_subdivision_id: 'sub-ka' });
  });
});
```

- [ ] **Step 6: Run — expect FAIL** (same two mismatches as the invoice test).
- [ ] **Step 7: Implement the quote wiring.** In `src/lib/quotesService.ts`:
  - `createQuote`: destructure `placeOfSupplySubdivisionId` (:423); add `customerId: quote.customer_id ?? null, companyId: quote.company_id ?? null,` to the input (:424-436); add `place_of_supply_subdivision_id: placeOfSupplySubdivisionId,` to `quoteToInsertRaw` (:446-469).
  - `updateQuote`: extend the existing select (:573-577) to `'currency, exchange_rate, rate_source, customer_id, company_id'`; destructure `placeOfSupplySubdivisionId` (:608); add `customerId: quote.customer_id ?? existing?.customer_id ?? null, companyId: quote.company_id ?? existing?.company_id ?? null,` to the input (:609-622); add `place_of_supply_subdivision_id: placeOfSupplySubdivisionId,` to `updateData` (:627-638).
- [ ] **Step 8: Run — expect PASS:** `npx vitest run src/lib/quotesService.threading.test.ts src/lib/invoiceService.threading.test.ts`
- [ ] **Step 9: Commit.** `git add src/lib/invoiceService.ts src/lib/quotesService.ts src/lib/invoiceService.threading.test.ts src/lib/quotesService.threading.test.ts && git commit -m "feat(financial): persist derived place_of_supply_subdivision_id on quote/invoice drafts (P4 S2)"`

---

### Task S2.8: Provision the disposable IN test tenant (live ops, no code)

**Files:**
Create: none (live operations against project `ssmbegiyjivrcwgcqutu`; tenant id + credentials recorded in the PR body and the session scratchpad, NOT committed)

**Interfaces:**
Consumes: `provision-tenant` edge function (`supabase/functions/provision-tenant/index.ts:57-71` request shape; `provisionGuards.ts:41-60` — IN is `formatting_ready`, so onboardable); WP-S1b live data; `gstinCheckDigit` (S2.1) for minting the seller GSTIN.
Produces: **live IN tenant** with owner login, primary `legal_entities` row (Karnataka), `legal_entity_tax_registrations` row (GSTIN `29AAACX0000X1ZW`, scheme `standard`), and a test-rig pack activation (`tenants.country_pack_version = 1`) — consumed by S2.9, S3–S7 fixtures/probes and WP-GA. Known-accepted consequences until S3: this tenant computes `simple_vat` on documents, and `computeStockSaleTax` would throw `CountryConfigError` (`regime.tax='in_gst'` unregistered) — do not exercise POS on it before S3.

- [ ] **Step 1: Verify S1b prerequisites live.** `mcp__supabase__execute_sql`:
    ```sql
    SELECT
      (SELECT count(*) FROM geo_subdivisions s JOIN geo_countries c ON c.id = s.country_id
        WHERE c.code = 'IN' AND s.deleted_at IS NULL AND s.tax_authority_code IS NOT NULL) AS gst_code_rows,
      (SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id = r.country_id
        WHERE c.code = 'IN' AND r.tax_category = 'standard' AND r.applies_to = 'gst_slab_18'
          AND r.subdivision_id IS NULL AND r.deleted_at IS NULL) AS slab18_rows,
      (SELECT country_config->>'regime.tax' FROM geo_countries WHERE code = 'IN') AS regime_tax,
      (SELECT country_config->'tax.rounding_policy' FROM geo_countries WHERE code = 'IN') AS rounding,
      (SELECT count(*) FROM master_document_requirements mr JOIN geo_countries c ON c.id = mr.country_id
        WHERE c.code = 'IN' AND mr.document_type = 'invoice' AND mr.deleted_at IS NULL) AS invoice_req_rows;
    ```
    Expected: `gst_code_rows ≥ 38`, `slab18_rows = 3` (CGST/SGST/IGST), `regime_tax = 'in_gst'`, `rounding = {"mode":"half_up","level":"head","cash_increment":1}`, `invoice_req_rows ≥ 2`. Any mismatch → STOP, S1b is not actually merged/applied.
- [ ] **Step 2: Read the rest of the provisioning function.** `Read supabase/functions/provision-tenant/index.ts` beyond :120 to confirm the unauthenticated (self-signup) path and that it creates tenant + owner profile + primary `legal_entities` row from `tax_number`/`countryId`. Record the exact response shape for Step 4.
- [ ] **Step 3: Resolve invocation inputs.** `mcp__supabase__execute_sql`: `SELECT id FROM geo_countries WHERE code = 'IN';` and `SELECT id, name FROM subscription_plans WHERE deleted_at IS NULL ORDER BY sort_order NULLS LAST, created_at LIMIT 5;` — pick the same plan the existing dev tenant uses (`SELECT ts.plan_id FROM tenant_subscriptions ts JOIN tenants t ON t.id = ts.tenant_id WHERE t.deleted_at IS NULL LIMIT 1;`). Read `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from `C:\Projects\Space_Recovery\.env`. Generate a password: `node -e "console.log('P4in!'+require('crypto').randomBytes(12).toString('base64url'))"` and save it to `<scratchpad>\in-tenant-credentials.txt`.
- [ ] **Step 4: Invoke provisioning.** (Bash; substitute resolved values)
    ```bash
    curl -sS -X POST "$SUPABASE_URL/functions/v1/provision-tenant" \
      -H "Content-Type: application/json" -H "apikey: $ANON_KEY" \
      -d '{
        "name": "IN Test Lab (Phase 4 - disposable)",
        "slug": "in-test-lab-p4",
        "adminEmail": "phase4-in-lab@spacedatarecovery.com",
        "adminPassword": "<generated>",
        "adminFullName": "IN Test Owner",
        "planId": "<plan-uuid>",
        "countryId": "<in-country-uuid>",
        "timezone": "Asia/Kolkata",
        "tax_number": "29AAACX0000X1ZW"
      }'
    ```
    Expected: 2xx JSON containing the new tenant id. (GSTIN `29AAACX0000X1ZW` is checksum-valid — pinned by the S2.1 test.)
- [ ] **Step 5: Verify the tenant resolved the IN pack.** `mcp__supabase__execute_sql`:
    ```sql
    SELECT t.id,
           t.resolved_country_config->>'regime.tax'                    AS regime_tax,
           t.resolved_country_config->'tax.rounding_policy'->>'level'  AS rounding_level,
           t.resolved_country_config->>'format.amount_words_scale'     AS scale,
           t.timezone, t.base_currency_code, t.country_pack_version
    FROM tenants t WHERE t.name = 'IN Test Lab (Phase 4 - disposable)' AND t.deleted_at IS NULL;
    ```
    Expected: `regime_tax='in_gst'`, `rounding_level='head'`, `scale='indian'`, `timezone='Asia/Kolkata'`, INR base, `country_pack_version` NULL (publish is S7). If `resolved_country_config` predates S1b bindings for any reason, run `SELECT resync_tenant_country_config('<tenant-id>');` and re-verify.
- [ ] **Step 6: Seller state + registration row (UI is WP-L2 — direct insert is the S2-sanctioned path).** `mcp__supabase__execute_sql`:
    ```sql
    WITH ka AS (
      SELECT s.id FROM geo_subdivisions s JOIN geo_countries c ON c.id = s.country_id
      WHERE c.code = 'IN' AND s.tax_authority_code = '29' AND s.deleted_at IS NULL
    ),
    le AS (
      UPDATE legal_entities SET subdivision_id = (SELECT id FROM ka)
      WHERE tenant_id = '<tenant-id>' AND is_primary AND deleted_at IS NULL
      RETURNING id, tenant_id, country_id
    )
    INSERT INTO legal_entity_tax_registrations
      (tenant_id, legal_entity_id, country_id, subdivision_id, tax_number, scheme, registered_from, is_primary)
    SELECT le.tenant_id, le.id, le.country_id, (SELECT id FROM ka), '29AAACX0000X1ZW', 'standard', '2026-04-01', true
    FROM le
    RETURNING id;
    ```
    Expected: one registration id returned. Then verify: `SELECT tax_number, scheme, is_primary FROM legal_entity_tax_registrations WHERE tenant_id='<tenant-id>' AND deleted_at IS NULL;`
- [ ] **Step 7: Test-rig pack activation (documented deviation).** `issue_tax_document` evaluates `master_document_requirements` only when `tenants.country_pack_version IS NOT NULL` (verified in the live RPC def), and only `publish_country_pack` (S7) sets it. Activate the rig so S2.9's field assertions can fire:
    ```sql
    UPDATE tenants SET country_pack_version = 1
    WHERE id = '<tenant-id>' AND deleted_at IS NULL;  -- TEST RIG: disposable IN tenant only.
    -- Real activation happens at S7 publish; this tenant exists to exercise
    -- pre-publish plumbing. Recorded in the S2 PR body.
    ```
    Expected: 1 row updated. Record tenant id, email, password location, and this deviation in the PR body.

---

### Task S2.9: Live dry-run acceptance (TaxContext field assertions) + WP wrap-up

**Files:**
Create: `src/lib/regimes/in_gst/s2LiveAcceptance.test.ts` (env-gated live probe — skipped in CI, executed once here)
Test: same file

**Interfaces:**
Consumes: everything above; live `issue_tax_document(p_doc_type, p_doc_id, p_dry_run)` returning `requirement_failures` (verified live def); S1b requirement row `field_key='buyer_tax_number'` (B2B block); `cases` minimal insert (verified live: only `tenant_id` is NOT-NULL-without-default, stamped by trigger; NULL/NULL status insert allowed by `guard_cases_status_changes`); `get_next_case_number` RPC.
Produces: recorded live evidence (PR body) that the client threads buyer + place-of-supply fields end-to-end into the columns and facts the issuance gate reads — the WP-S2 acceptance per spec §4-S2.

- [ ] **Step 1: Write the probe.** Create `src/lib/regimes/in_gst/s2LiveAcceptance.test.ts`:

```ts
// @vitest-environment jsdom
//
// LIVE acceptance probe for WP-S2 (spec §4-S2): TaxContext FIELD assertions via
// issue_tax_document p_dry_run on the disposable IN test tenant. NOT tax math —
// the tenant knowingly computes simple_vat until WP-S3. Gated on IN_S2_LIVE=1
// (skipped in CI); requires IN_S2_EMAIL / IN_S2_PASSWORD env vars.
import { describe, it, expect } from 'vitest';

const LIVE = process.env.IN_S2_LIVE === '1';

describe.runIf(LIVE)('WP-S2 live acceptance — IN test tenant', () => {
  it('threads buyer + place of supply into the draft and the dry-run gate sees the fields', { timeout: 120_000 }, async () => {
    const { supabase } = await import('../../supabaseClient');
    const { createCustomer } = await import('../../customerService');
    const { createCompany } = await import('../../companyService');
    const { createInvoice } = await import('../../invoiceService');
    const { dryRunIssueTaxDocument } = await import('../../taxDocumentService');
    const { gstinCheckDigit } = await import('./gstin');

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: process.env.IN_S2_EMAIL!, password: process.env.IN_S2_PASSWORD!,
    });
    expect(authErr).toBeNull();

    const { data: inCountry } = await supabase.from('geo_countries').select('id').eq('code', 'IN').maybeSingle();
    const { data: ka } = await supabase.from('geo_subdivisions')
      .select('id').eq('country_id', inCountry!.id).eq('tax_authority_code', '29').maybeSingle();

    // (a) GSTIN chokepoint, negative: checksum-invalid GSTIN is rejected at create.
    await expect(createCustomer({
      customer_name: 'S2 Bad GSTIN', country_id: inCountry!.id, subdivision_id: ka!.id,
      tax_number: '29ABCDE1234F1Z5',
    })).rejects.toThrow(/check character/i);

    // (b) Registered Karnataka buyer with a self-consistent valid GSTIN.
    const buyerGstin = '29AABCT1332L1Z' + gstinCheckDigit('29AABCT1332L1Z');
    const customer = await createCustomer({
      customer_name: 'S2 Registered Buyer', country_id: inCountry!.id, subdivision_id: ka!.id,
      tax_number: buyerGstin,
    });
    expect(customer).not.toBeNull();

    // Minimal case (invoices are case-linked): NULL/NULL status is guard-legal.
    const { data: caseNo } = await supabase.rpc('get_next_case_number');
    const { data: caseRow, error: caseErr } = await supabase.from('cases')
      .insert({ case_no: caseNo as string, customer_id: customer!.id })
      .select('id').maybeSingle();
    expect(caseErr).toBeNull();

    // (c) Positive: draft invoice through the REAL client path.
    const inv = await createInvoice(
      { case_id: caseRow!.id, customer_id: customer!.id, invoice_type: 'tax_invoice',
        invoice_date: new Date().toISOString().slice(0, 10), tax_rate: 18 },
      [{ description: 'Data recovery — logical evaluation (SAC 998319)', quantity: 1, unit_price: 8000 }],
    );
    const { data: persisted } = await supabase.from('invoices')
      .select('place_of_supply_subdivision_id').eq('id', inv.id).maybeSingle();
    expect(persisted!.place_of_supply_subdivision_id).toBe(ka!.id);   // FIELD assertion #1

    const dry = await dryRunIssueTaxDocument('invoice', inv.id);
    expect(dry.ok).toBe(true);
    const keys = dry.requirement_failures.map((f) => f.field_key);
    expect(keys).not.toContain('buyer_tax_number');                    // FIELD assertion #2
    expect(keys.filter((k) => k.startsWith('place_of_supply'))).toEqual([]); // FIELD assertion #3

    // (d) Negative: B2B invoice for a GSTIN-less company → the gate reports the missing buyer field.
    const company = await createCompany({ name: 'S2 GSTless Traders', country_id: inCountry!.id });
    const inv2 = await createInvoice(
      { case_id: caseRow!.id, customer_id: customer!.id, company_id: company.id,
        invoice_type: 'tax_invoice', invoice_date: new Date().toISOString().slice(0, 10), tax_rate: 18 },
      [{ description: 'Data recovery — imaging', quantity: 1, unit_price: 12000 }],
    );
    const dry2 = await dryRunIssueTaxDocument('invoice', inv2.id);
    expect(dry2.requirement_failures.map((f) => f.field_key)).toContain('buyer_tax_number'); // FIELD assertion #4
  });
});
```

- [ ] **Step 2: Confirm CI-skip.** `npx vitest run src/lib/regimes/in_gst/s2LiveAcceptance.test.ts` (no env) → suite reported as skipped, exit 0.
- [ ] **Step 3: Execute live.** PowerShell: `$env:IN_S2_LIVE='1'; $env:IN_S2_EMAIL='phase4-in-lab@spacedatarecovery.com'; $env:IN_S2_PASSWORD='<from scratchpad>'; npx vitest run src/lib/regimes/in_gst/s2LiveAcceptance.test.ts` → expected PASS (1 test). If assertion #4 returns `[]`, re-check Task S2.8 Step 7 (rig activation) and the S1b requirement rows before touching code. Save the vitest output to `<scratchpad>\s2-live-acceptance.txt` for the PR body.
- [ ] **Step 4: Commit the probe.** `git add src/lib/regimes/in_gst/s2LiveAcceptance.test.ts && git commit -m "test(regimes): env-gated live dry-run acceptance probe for the IN test tenant (P4 S2)"`
- [ ] **Step 5: Full verification.** Run `npm run typecheck` → expect **0 errors** (run un-piped; re-read the actual output — do not trust exit code summaries). Then `npx vitest run src/lib/regimes/in_gst src/lib/regimes/partyTaxValidation.test.ts src/lib/companyService.taxValidation.test.ts src/lib/tax/kernel src/lib/taxDocumentService.test.ts src/lib/taxDocumentService.threading.test.ts src/lib/invoiceService.threading.test.ts src/lib/quotesService.threading.test.ts src/components/customers/CustomerFormModal.test.tsx` → all green (live probe skipped).
- [ ] **Step 6: Push + PR (owner merges — do NOT merge).**
    ```
    git push -u origin feat/india-s2-in-test-tenant-buyer-seam
    gh pr create --base main --title "P4 WP-S2: IN test tenant + buyer-seam threading" --body "## WP-S2 — IN Test Tenant + Buyer-Seam Threading (no migration)

    - GSTIN mod-36 checksum + state-prefix validator (src/lib/regimes/in_gst/gstin.ts); party tax-number chokepoint spliced into customerService/companyService; GSTIN capture field on the customer form.
    - Sec 12(2) place-of-supply derivation (in_gst/placeOfSupply.ts); RoundingPolicy.level widened with 'head'.
    - taxDocumentService.computeDocumentTotals now threads buyer identity (company-overrides-customer), derived place of supply, pack-resolved rounding policy and scale into TaxContext; quote/invoice create+update persist place_of_supply_subdivision_id. Strategy key remains 'simple_vat' by design — WP-S3 threads regime.tax when in_gst registers.
    - LIVE: disposable IN test tenant provisioned (id: <tenant-id>; owner phase4-in-lab@spacedatarecovery.com; credentials held out-of-repo); primary legal entity set to Karnataka; standard-scheme GSTIN registration 29AAACX0000X1ZW inserted directly (registration UI is WP-L2). DEVIATION (test rig): tenants.country_pack_version set to 1 on this tenant only so the requirement gate fires pre-publish; real activation is S7.
    - Live acceptance (spec §4-S2 field assertions, output attached): invoice draft persists KA place of supply; dry-run shows no buyer_tax_number/place_of_supply failures for the registered buyer and reports buyer_tax_number for a GSTIN-less B2B invoice; checksum-invalid GSTIN rejected at customer create. Known-until-S3: this tenant computes simple_vat; POS stock sales must not be exercised on it.
    - Non-India parity: buyer-less callers keep the legacy null-buyer context (test-pinned); rounding/scale resolve from resolved_country_config exactly as the shipped POS path (assembleStockSaleContext) already does — parity evidence query output attached.

    🤖 Generated with [Claude Code](https://claude.com/claude-code)"
    ```
    Paste `<scratchpad>\s2-live-acceptance.txt` and the Task S2.6 Step 5 query output into the PR as comments/attachments.

---


## Work Package WP-S3 — `in_gst` Strategy + Seam Completion + Golden Fixtures [L, no migration]

Branch: `feat/india-s3-in-gst-strategy` (cut from `main`)

Depends on: **WP-S2 (Task S2.5)** (`RoundingPolicy.level` widened to `'line' | 'document' | 'head'` in `src/lib/regimes/types.ts` — WP-S1a widens only the registry Zod schema, NOT this TS type) · **WP-S1b** (live IN pack seeds — `geo_country_tax_rates` `gst_slab_18` rows, `country_config` `regime.tax='in_gst'` + `tax.rounding_policy={half_up,head,cash_increment:1}`; required for the *live* seam to fire, not for this WP's build/tests) · **WP-S2** (`computeDocumentTotals` in `src/lib/taxDocumentService.ts` now fetches the seller-tenant `resolved_country_config` into a local `resolved: Record<string, unknown>` and threads rounding/scale/buyer/`placeOfSupplySubdivisionId` into `TaxContext`; strategy resolution deliberately still hardcodes `resolveTaxStrategy('simple_vat')` — "the IN tenant knowingly computes `simple_vat` until S3").

Global spec anchors this WP encodes: kernel entry is `computeWithMode(ctx, 'split_by_place_of_supply')` (verified `src/lib/tax/kernel/index.ts:83-88`; `computeDocumentTax` is hardwired to `'single'`); equal dual-levy heads **381.36/381.36 + round-off −0.01** (never 381.36/381.35); rounding `level='head'`; capability rows synced via `sync_engine_capabilities` RPC (verified upsert-only, `ON CONFLICT (capability_key, kind) WHERE deleted_at IS NULL` — passing a single `in_gst` row is safe); no migration.

---

### Task S3.1: GSTIN validator — CONSUMED from WP-S2 (no production in this WP)

**GSTIN validation is authored exactly once, by WP-S2** (`src/lib/regimes/in_gst/gstin.ts`; see WP-S2 Task S2.1). This task previously duplicated the module with an incompatible signature — that duplicate **production is deleted**. WP-S3 now CONSUMES WP-S2's canonical exports; there is no new code, test, or commit for GSTIN validation in this WP.

**Interfaces:**
- Consumes (all from **WP-S2**, `src/lib/regimes/in_gst/gstin.ts`): `validateGSTIN(gstin: string, subdivision?: { tax_authority_code: string | null } | null): GstinCheck`, `gstinCheckDigit(base14: string): string`, `gstStateCodeOf(gstin: string): string | null`, `GSTIN_STATE_CODES: ReadonlySet<string>` (36 GSTIN-issuing codes; special 96/97 excluded), and `interface GstinCheck { ok: boolean; error: string | null; stateCode: string | null }`.
- Produces: nothing. (WP-S2 merges before WP-S3, so `gstin.ts` already exists on `main` when this branch is cut.)

---

### Task S3.2: `in_gst` TaxStrategy — one-line `computeWithMode` delegation + registration

**Files:**
- Create: `src/lib/regimes/in_gst/index.ts`
- Modify: `src/lib/regimes/register.ts` (add import + registration alongside the existing `simple_vat`/`gcc_*`/`zatca_ph1`/`no_einvoice` bootstrap, verified at `register.ts:6-27`)
- Create (Test): `src/lib/regimes/in_gst/index.test.ts`

**Interfaces:**
- Consumes: `computeWithMode` from `src/lib/tax/kernel` (verified export `kernel/index.ts:88`); `TaxStrategy`/`TaxContext`/`TaxComputation` from `../types`; `registerRegimePlugin`/`resolveTaxStrategy` from `../registry`; `registerAllRegimePlugins` from `../register`; `RoundingPolicy.level` including `'head'` (from **WP-S2 (Task S2.5)**).
- Produces: `inGstStrategy: TaxStrategy` (`key='in_gst'`, `version='1.0.0'`, `schemeMode='split_by_place_of_supply'`, defaults `{roundingPolicy:{mode:'half_up',level:'head',cash_increment:1}, scaleSystem:'indian'}`) resolvable via `resolveTaxStrategy('in_gst')` — consumed by S3.3 (live seam), S3.5 (fixtures), S3.6 (properties).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/index.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inGstStrategy } from './index';
import { resolveTaxStrategy } from '../registry';
import { registerAllRegimePlugins } from '../register';

describe('in_gst strategy — parameterization, not a fork', () => {
  it('declares the contract identity (head-level rounding + Indian scale)', () => {
    expect(inGstStrategy.key).toBe('in_gst');
    expect(inGstStrategy.version).toBe('1.0.0');
    expect(inGstStrategy.schemeMode).toBe('split_by_place_of_supply');
    expect(inGstStrategy.defaults.roundingPolicy).toEqual({ mode: 'half_up', level: 'head', cash_increment: 1 });
    expect(inGstStrategy.defaults.scaleSystem).toBe('indian');
  });

  it('is resolvable from the registry after bootstrap', () => {
    registerAllRegimePlugins();
    expect(resolveTaxStrategy('in_gst')).toBe(inGstStrategy);
  });

  it('compute() is a pure kernel delegation — zero India arithmetic in the plugin', () => {
    const src = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');
    expect(src).toContain("computeWithMode(ctx, 'split_by_place_of_supply')");
    expect(src).not.toMatch(/CGST|SGST|IGST/);   // component names live in DATA, never the plugin
    expect(src).not.toMatch(/\d\s*\/\s*2/);       // no hand-halved dual levy
    expect(src).not.toMatch(/\/\s*100/);          // no rate arithmetic
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 3: Minimal implementation** (delegation re-stamps trace provenance to `in_gst`, exactly as `simple_vat/index.ts:15-18` does — no arithmetic)

```typescript
// src/lib/regimes/in_gst/index.ts
// India GST = a data-driven split_by_place_of_supply parameterization of the
// fiscal kernel. THIS FILE STAYS MATH-FREE (the structural test greps it): the
// intra/inter decision, slab resolution, inclusive back-out, largest-remainder
// split and the Section-170 whole-rupee rounding are ALL kernel behaviour driven
// by geo_country_tax_rates rows and the pack's tax.rounding_policy data.
import { computeWithMode } from '../../tax/kernel';
import type { TaxComputation, TaxContext, TaxStrategy } from '../types';

export const inGstStrategy: TaxStrategy = {
  key: 'in_gst',
  version: '1.0.0',
  schemeMode: 'split_by_place_of_supply',
  defaults: {
    roundingPolicy: { mode: 'half_up', level: 'head', cash_increment: 1 },
    scaleSystem: 'indian',
  },
  compute(ctx: TaxContext): TaxComputation {
    const c = computeWithMode(ctx, 'split_by_place_of_supply');
    return { ...c, trace: { ...c.trace, regimeKey: this.key, pluginVersion: this.version } };
  },
};
```

Then register in `src/lib/regimes/register.ts` — add the import after line 13 and the registration inside `registerAllRegimePlugins()` after `registerRegimePlugin('tax', simpleVat);` (line 19):

```typescript
import { inGstStrategy } from './in_gst';
```
```typescript
  registerRegimePlugin('tax', inGstStrategy);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/index.test.ts` — Expected: 3 passed. Then `npm run typecheck` — Expected: 0 errors (confirms `level:'head'` is assignable, i.e. WP-S2 Task S2.5 landed the TS widening).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/in_gst/index.ts src/lib/regimes/in_gst/index.test.ts src/lib/regimes/register.ts
git commit -m "feat(regimes): in_gst TaxStrategy as split_by_place_of_supply kernel delegation + registration"
```

---

### Task S3.3: Seam completion — slab-aware `matchFormRate` + `regime.tax` strategy threading

**Files:**
- Modify: `src/lib/taxDocumentService.ts` (rewrite `matchFormRate` at lines ~77–91; add `resolveStrategyKey`; replace the `resolveTaxStrategy('simple_vat')` call at line ~172)
- Modify (Test): `src/lib/taxDocumentService.test.ts` (add to the existing `taxDocumentService pure helpers` describe at line 32; verified `omVat`/`GeoCountryTaxRateRow`/`matchFormRate` already imported)

**Interfaces:**
- Consumes: from **WP-S2**, `computeDocumentTotals` holds a local `resolved: Record<string, unknown>` (the seller-tenant `resolved_country_config`) in scope at the strategy-resolution site; `registerAllRegimePlugins()` is already called first (verified `taxDocumentService.ts:144`), so `in_gst` is registered by the time this resolves. `resolveTaxStrategy` (registry), `GeoCountryTaxRateRow` (types), `roundMoney` — already imported.
- Produces: `resolveStrategyKey(resolved: Record<string, unknown>): string`; a slab-aware `matchFormRate(effective, formRate)` that returns the full `gst_slab_18` head-set for form rate 18 on IN rows.

- [ ] **Step 1: Write the failing test** — append these cases inside the `describe('taxDocumentService pure helpers', …)` block, and add `resolveStrategyKey` to the import from `./taxDocumentService` (line 22-24)

```typescript
  // --- WP-S3 seam completion ---
  const inCgst: GeoCountryTaxRateRow = { id: 'in-cgst-18', country_id: 'in', subdivision_id: null, component_code: 'CGST', component_label: 'CGST', tax_category: 'standard', rate: 9, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 10 };
  const inSgst: GeoCountryTaxRateRow = { id: 'in-sgst-18', country_id: 'in', subdivision_id: null, component_code: 'SGST', component_label: 'SGST', tax_category: 'standard', rate: 9, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 20 };
  const inIgst: GeoCountryTaxRateRow = { id: 'in-igst-18', country_id: 'in', subdivision_id: null, component_code: 'IGST', component_label: 'IGST', tax_category: 'standard', rate: 18, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 30 };

  it('matchFormRate is slab-aware: IN form rate 18 returns the full CGST/SGST/IGST head-set, never a synthetic form:18 row', () => {
    const rows = matchFormRate([inCgst, inSgst, inIgst], 18);
    expect(rows.map((r) => r.component_code)).toEqual(['CGST', 'SGST', 'IGST']);
    expect(rows.some((r) => r.id.startsWith('form:'))).toBe(false);
  });
  it('matchFormRate leaves the legacy single-levy path byte-identical (Oman VAT 5 → the one VAT row)', () => {
    expect(matchFormRate([omVat], 5)).toEqual([omVat]);
    expect(matchFormRate([omVat], 7.5)[0]).toMatchObject({ id: 'form:7.5', rate: 7.5, component_code: 'VAT' });
    expect(matchFormRate([omVat], 0)).toEqual([]);
  });
  it('resolveStrategyKey reads regime.tax, defaulting to simple_vat when unbound', () => {
    expect(resolveStrategyKey({ 'regime.tax': 'in_gst' })).toBe('in_gst');
    expect(resolveStrategyKey({})).toBe('simple_vat');
    expect(resolveStrategyKey({ 'regime.tax': null })).toBe('simple_vat');
  });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/taxDocumentService.test.ts`
Expected: FAIL — `resolveStrategyKey` is not exported (import error), and (once stubbed) `matchFormRate([inCgst,inSgst,inIgst], 18)` returns a single `form:18` row (sum 36 ≠ 18), so the head-set assertion fails.

- [ ] **Step 3: Minimal implementation** — replace the whole `matchFormRate` function (lines 77–91) with the slab-aware version, and add `resolveStrategyKey` beneath it

```typescript
/** The form's header rate resolves against effective-dated standard rows.
 *  (1) Slab-bucketed multi-head packs (India GST: CGST+SGST+IGST share an
 *      `applies_to` bucket) — the bucket whose HEADLINE (max) component rate
 *      equals the form rate carries the full head-set; return every row so the
 *      kernel's split_by_place_of_supply mode picks CGST/SGST vs IGST itself.
 *  (2) Legacy single-levy packs (Oman/AE/SA) — subdivision-null, bucket-less
 *      standards summing to the form rate (byte-parity path, unchanged).
 *  (3) Unmatched → one synthetic 'form:<rate>' row so provenance shows the
 *      override. rate 0 → no components (untaxed doc, matches legacy 0%). */
export function matchFormRate(
  effective: GeoCountryTaxRateRow[], formRate: number,
): GeoCountryTaxRateRow[] {
  if (formRate === 0) return [];
  const standards = effective.filter((r) => r.tax_category === 'standard');
  const buckets = new Map<string, GeoCountryTaxRateRow[]>();
  for (const r of standards) {
    if (r.applies_to === null) continue;
    const rows = buckets.get(r.applies_to) ?? [];
    rows.push(r);
    buckets.set(r.applies_to, rows);
  }
  for (const rows of buckets.values()) {
    const headline = Math.max(...rows.map((r) => r.rate));
    if (Math.abs(headline - formRate) < 1e-9) return rows;
  }
  const flat = standards.filter((r) => r.subdivision_id === null && r.applies_to === null);
  const sum = flat.reduce((s, r) => s + r.rate, 0);
  if (flat.length > 0 && Math.abs(sum - formRate) < 1e-9) return flat;
  return [{
    id: `form:${formRate}`, country_id: flat[0]?.country_id ?? standards[0]?.country_id ?? 'form',
    subdivision_id: null,
    component_code: flat[0]?.component_code ?? standards[0]?.component_code ?? 'VAT',
    component_label: flat[0]?.component_label ?? standards[0]?.component_label ?? 'VAT',
    tax_category: 'standard', rate: formRate, applies_to: null,
    valid_from: '1970-01-01', valid_to: null, sort_order: 0,
  }];
}

/** The tax strategy key for the current tenant, resolved from the pack's
 *  `regime.tax` binding (Country Engine), defaulting to `simple_vat` when unbound
 *  — mirrors assembleStockSaleContext.ts:37-38. Threaded into computeDocumentTotals
 *  so a live India invoice resolves `in_gst` (kernel split) instead of `simple_vat`. */
export function resolveStrategyKey(resolved: Record<string, unknown>): string {
  return (resolved['regime.tax'] as string) || 'simple_vat';
}
```

Then, in `computeDocumentTotals`, replace the hardcoded resolution (verified live at line 172: `const strategy = resolveTaxStrategy('simple_vat'); // Phase 2: thread useRegimeConfig().tax`; anchor on the `resolveTaxStrategy('simple_vat')` call, which WP-S2 leaves intact) with:

```typescript
  const strategy = resolveTaxStrategy(resolveStrategyKey(resolved));
```

(`resolved` is the tenant `resolved_country_config` local that WP-S2 introduced to thread rounding/scale; if S2 named it differently, point `resolveStrategyKey` at that variable.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/taxDocumentService.test.ts` — Expected: all green (the three new cases plus the pre-existing `matchFormRate: exact standard match wins…` case at line 39, which still holds because Oman rows are `applies_to: null`, bucket-less). Then `npm run typecheck` — Expected: 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxDocumentService.ts src/lib/taxDocumentService.test.ts
git commit -m "fix(tax): slab-aware matchFormRate + thread pack regime.tax into computeDocumentTotals (kill simple_vat hardcode)"
```

---

### Task S3.4: Section 170 round-off adjustment line — helper + persistence

**Files:**
- Modify: `src/lib/taxDocumentService.ts` (add `ComputedTaxLine` to the type import at line 13-16; add `roundOffAdjustmentLine`; append the round-off row inside `persistDocumentTaxLines` before the `insert(rows)` at line 220)
- Create (Test): `src/lib/taxDocumentService.roundoff.test.ts`

**Interfaces:**
- Consumes: `TaxComputation`, `ComputedTaxLine` from `./regimes/types`; `convertToBase` (already imported line 8); `persistDocumentTaxLines` (existing).
- Produces: `roundOffAdjustmentLine(computation: TaxComputation): ComputedTaxLine | null` — a document-level `out_of_scope` "Round off" line carrying `totals.roundingAdjustment` (`componentCode: 'ROUND_OFF'`, `treatmentReasonCode: 'SEC_170_ROUNDING'`, `sequence: 999`) — consumed by S3.5 and by the persisted `document_tax_lines` snapshot so invoice, ledger and return tie.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/taxDocumentService.roundoff.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RateContext } from './currencyService';
import type { TaxComputation } from './regimes/types';

const { insertCapture } = vi.hoisted(() => ({ insertCapture: { rows: null as unknown[] | null } }));
vi.mock('./supabaseClient', () => {
  const chain: Record<string, (...args: unknown[]) => unknown> = {
    update: () => chain,
    eq: () => chain,
    is: () => Promise.resolve({ error: null }),
    insert: (rows: unknown) => { insertCapture.rows = rows as unknown[]; return Promise.resolve({ error: null }); },
  };
  return { supabase: { from: () => chain } };
});

import { roundOffAdjustmentLine, persistDocumentTaxLines } from './taxDocumentService';

const rc: RateContext = { documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2, rate: 1, rateSource: 'manual' };

function computationWith(adj: number | null): TaxComputation {
  return {
    lines: [],
    rollups: [
      { lineItemId: null, componentCode: 'CGST', componentLabel: 'CGST 9%', jurisdictionRef: null, rate: 9, taxableBase: 4237.29, taxAmount: 381.36, taxTreatment: 'standard', treatmentReasonCode: null, sequence: 0 },
      { lineItemId: null, componentCode: 'SGST', componentLabel: 'SGST 9%', jurisdictionRef: null, rate: 9, taxableBase: 4237.29, taxAmount: 381.36, taxTreatment: 'standard', treatmentReasonCode: null, sequence: 1 },
    ],
    totals: { taxableBase: 4237.29, taxTotal: 762.72, grandTotal: 5000, roundingAdjustment: adj },
    expectedWithholding: null, notations: [],
    trace: { regimeKey: 'in_gst', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'split_by_place_of_supply', steps: [] },
  };
}

describe('roundOffAdjustmentLine (Section 170)', () => {
  it('emits an out_of_scope Round off line for a non-zero adjustment', () => {
    expect(roundOffAdjustmentLine(computationWith(-0.01))).toEqual({
      lineItemId: null, componentCode: 'ROUND_OFF', componentLabel: 'Round off', jurisdictionRef: null,
      rate: 0, taxableBase: 0, taxAmount: -0.01, taxTreatment: 'out_of_scope', treatmentReasonCode: 'SEC_170_ROUNDING', sequence: 999,
    });
  });
  it('emits nothing for a zero or null adjustment', () => {
    expect(roundOffAdjustmentLine(computationWith(0))).toBeNull();
    expect(roundOffAdjustmentLine(computationWith(null))).toBeNull();
  });
});

describe('persistDocumentTaxLines round-off persistence', () => {
  it('appends the Round off line to the inserted rows so ledger + invoice tie', async () => {
    insertCapture.rows = null;
    await persistDocumentTaxLines({ tenantId: 't1', documentType: 'invoice', documentId: 'inv-1', computation: computationWith(-0.01), rc });
    const inserted = insertCapture.rows as Array<Record<string, unknown>>;
    const roundOff = inserted.find((r) => r.component_code === 'ROUND_OFF');
    expect(roundOff).toMatchObject({ tax_amount: -0.01, tax_treatment: 'out_of_scope', tax_amount_base: -0.01, line_item_id: null });
  });
  it('appends nothing when the adjustment is zero', async () => {
    insertCapture.rows = null;
    await persistDocumentTaxLines({ tenantId: 't1', documentType: 'invoice', documentId: 'inv-2', computation: computationWith(0), rc });
    const inserted = insertCapture.rows as Array<Record<string, unknown>>;
    expect(inserted.some((r) => r.component_code === 'ROUND_OFF')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/taxDocumentService.roundoff.test.ts`
Expected: FAIL — `roundOffAdjustmentLine` is not exported.

- [ ] **Step 3: Minimal implementation** — add `ComputedTaxLine` to the type import (line 13-16 becomes `GeoCountryTaxRateRow, LegalEntityTaxRegistrationRow, RuleTrace, ComputedTaxLine, TaxComputation, TaxContext, TaxDocumentType, TaxableLine`), add the helper after `totalsFromComputation` (line ~102), and append the row in `persistDocumentTaxLines`

```typescript
/** Section 170 (CGST Act): whole-rupee cash rounding leaves a ± paise residual.
 *  Persist it as an explicit document-level "Round off" line (out_of_scope) so
 *  invoice grand total, the vat ledger and the GST return all reconcile — the
 *  residual is never smeared into a tax head. Null/0 adjustment → no line. */
export function roundOffAdjustmentLine(computation: TaxComputation): ComputedTaxLine | null {
  const adj = computation.totals.roundingAdjustment;
  if (adj === null || adj === 0) return null;
  return {
    lineItemId: null, componentCode: 'ROUND_OFF', componentLabel: 'Round off',
    jurisdictionRef: null, rate: 0, taxableBase: 0, taxAmount: adj,
    taxTreatment: 'out_of_scope', treatmentReasonCode: 'SEC_170_ROUNDING', sequence: 999,
  };
}
```

Then in `persistDocumentTaxLines`, insert this block immediately before `const { error } = await supabase.from('document_tax_lines').insert(rows);` (line 220):

```typescript
  const roundOff = roundOffAdjustmentLine(computation);
  if (roundOff) {
    rows.push({
      tenant_id: tenantId, document_type: documentType, document_id: documentId,
      line_item_id: null, component_code: roundOff.componentCode, component_label: roundOff.componentLabel,
      jurisdiction_ref: null, rate: roundOff.rate, taxable_base: roundOff.taxableBase, tax_amount: roundOff.taxAmount,
      currency: rc.documentCurrency, exchange_rate: rc.rate,
      tax_amount_base: convertToBase(roundOff.taxAmount, rc.rate, rc.baseDecimals),
      tax_treatment: roundOff.taxTreatment, treatment_reason_code: roundOff.treatmentReasonCode,
      regime_key: computation.trace.regimeKey, plugin_version: computation.trace.pluginVersion,
      pack_version_id: computation.trace.packVersionId, rule_trace: null, backfilled: false, sequence: roundOff.sequence,
    });
  }
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/taxDocumentService.roundoff.test.ts` — Expected: 4 passed. Then `npm run typecheck` — Expected: 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxDocumentService.ts src/lib/taxDocumentService.roundoff.test.ts
git commit -m "feat(tax): persist Section 170 round-off as an out_of_scope Round off line"
```

---

### Task S3.5: Golden fixture corpus — the 8 CA-facing scenarios

**Files:**
- Create: `src/lib/regimes/in_gst/fixtures/intra_state_sac_998319.json`
- Create: `src/lib/regimes/in_gst/fixtures/inter_state_igst.json`
- Create: `src/lib/regimes/in_gst/fixtures/inclusive_b2c_rounding.json`
- Create: `src/lib/regimes/in_gst/fixtures/head_vs_line_rounding.json`
- Create: `src/lib/regimes/in_gst/fixtures/utgst_chandigarh.json`
- Create: `src/lib/regimes/in_gst/fixtures/credit_note_full_reversal.json`
- Create: `src/lib/regimes/in_gst/fixtures/advance_then_invoice_netting.json`
- Create: `src/lib/regimes/in_gst/fixtures/unregistered_seller_plain_invoice.json`
- Create (Test): `src/lib/regimes/in_gst/fixtures.test.ts`

**Interfaces:**
- Consumes: `inGstStrategy` (S3.2); `roundOffAdjustmentLine` (S3.4); `TaxContext` (types). Fixture shape: `{ name, input_document: TaxContext, expected: { totals, rollups }, _meta: { external_validation, citations } }` (mirrors the shipped `simple_vat/fixtures/*.json` convention — `input_document` IS a full `TaxContext`, so no mapper). The advance fixture additionally carries `advance_input_document` + `expected.{advance_tax_total,final_tax_total,net_tax_total}`.
- Produces: 8 self-contained fixture JSONs (`_meta.external_validation.status: "pending"`) — consumed by WP-S7's `master_country_pack_tests` seed + CA package.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/fixtures.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { TaxContext } from '../types';
import { inGstStrategy } from './index';
// taxDocumentService pulls supabaseClient at import; stub it (roundOffAdjustmentLine is pure).
vi.mock('../../supabaseClient', () => ({ supabase: {} }));
import { roundOffAdjustmentLine } from '../../taxDocumentService';
import intraSac from './fixtures/intra_state_sac_998319.json';
import interIgst from './fixtures/inter_state_igst.json';
import inclusiveB2c from './fixtures/inclusive_b2c_rounding.json';
import headVsLine from './fixtures/head_vs_line_rounding.json';
import utgst from './fixtures/utgst_chandigarh.json';
import creditNote from './fixtures/credit_note_full_reversal.json';
import unregistered from './fixtures/unregistered_seller_plain_invoice.json';
import advance from './fixtures/advance_then_invoice_netting.json';

type Fx = { name: string; input_document: TaxContext; expected: { totals: Record<string, number | null>; rollups: Array<Record<string, unknown>> }; _meta: { external_validation: { status: string }; citations: string[] } };
const simple = [intraSac, interIgst, inclusiveB2c, headVsLine, utgst, creditNote, unregistered] as unknown as Fx[];

describe('in_gst golden fixtures (CA evidence corpus — external_validation pending)', () => {
  it('every fixture carries external-validation metadata + ≥1 statutory citation', () => {
    for (const f of [...simple, advance as unknown as Fx]) {
      expect(f._meta.external_validation.status, f.name).toMatch(/^(pending|validated)$/);
      expect(f._meta.citations.length, f.name).toBeGreaterThan(0);
    }
  });

  simple.forEach((f) => {
    it(`replays: ${f.name}`, async () => {
      const c = await inGstStrategy.compute(f.input_document);
      expect(c.totals).toEqual(f.expected.totals);
      f.expected.rollups.forEach((r, i) => expect(c.rollups[i]).toMatchObject(r));
      expect(c.trace.regimeKey).toBe('in_gst');
    });
  });

  it('intra-state resolves CGST+SGST via split_by_place_of_supply', async () => {
    const c = await inGstStrategy.compute((intraSac as unknown as Fx).input_document);
    expect(c.trace.schemeMode).toBe('split_by_place_of_supply');
    expect(c.trace.steps.some((s) => s.op === 'scheme_decision')).toBe(true);
    expect(c.rollups.map((r) => r.componentCode)).toEqual(['CGST', 'SGST']);
  });

  it('inter-state resolves a single IGST head', async () => {
    const c = await inGstStrategy.compute((interIgst as unknown as Fx).input_document);
    expect(c.rollups.map((r) => r.componentCode)).toEqual(['IGST']);
  });

  it('inclusive ₹5,000 B2C: EQUAL heads (381.36/381.36) + Section-170 round-off −0.01 line', async () => {
    const c = await inGstStrategy.compute((inclusiveB2c as unknown as Fx).input_document);
    expect(c.rollups.find((r) => r.componentCode === 'CGST')?.taxAmount).toBe(381.36);
    expect(c.rollups.find((r) => r.componentCode === 'SGST')?.taxAmount).toBe(381.36); // never 381.35
    expect(c.totals.grandTotal).toBe(5000);
    expect(c.totals.roundingAdjustment).toBe(-0.01);
    expect(roundOffAdjustmentLine(c)).toMatchObject({ componentCode: 'ROUND_OFF', taxTreatment: 'out_of_scope', taxAmount: -0.01 });
  });

  it('head-vs-line discriminator: head-level 2.32 differs from a wrong line-level 2.31', async () => {
    const doc = (headVsLine as unknown as Fx).input_document;
    const head = await inGstStrategy.compute(doc);
    expect(head.rollups.find((r) => r.componentCode === 'CGST')?.taxAmount).toBe(2.32);
    const lineLevel = await inGstStrategy.compute({ ...doc, roundingPolicy: { ...doc.roundingPolicy, level: 'line' } });
    expect(lineLevel.rollups.find((r) => r.componentCode === 'CGST')?.taxAmount).toBe(2.31);
  });

  it('UTGST Chandigarh: the second intra-UT head renders UTGST (label data); code stays SGST', async () => {
    const c = await inGstStrategy.compute((utgst as unknown as Fx).input_document);
    expect(c.rollups[1].componentCode).toBe('SGST');
    expect(c.rollups[1].componentLabel).toBe('UTGST 9%');
  });

  it('credit note flows through split mode with per-head components', async () => {
    expect((creditNote as unknown as Fx).input_document.documentType).toBe('credit_note');
    const c = await inGstStrategy.compute((creditNote as unknown as Fx).input_document);
    expect(c.rollups.map((r) => r.componentCode)).toEqual(['CGST', 'SGST']);
  });

  it('unregistered seller: a plain invoice carries NO GST heads', async () => {
    const c = await inGstStrategy.compute((unregistered as unknown as Fx).input_document);
    expect(c.rollups).toEqual([]);
    expect(c.totals.taxTotal).toBe(0);
    expect(c.totals.grandTotal).toBe(c.totals.taxableBase);
  });

  it('advance-then-invoice netting: voucher tax + net invoice tax = total supply tax (no GSTR-3B double count)', async () => {
    const adv = advance as unknown as { advance_input_document: TaxContext; input_document: TaxContext; expected: { advance_tax_total: number; final_tax_total: number; net_tax_total: number } };
    const advanceLeg = await inGstStrategy.compute(adv.advance_input_document);
    const finalLeg = await inGstStrategy.compute(adv.input_document);
    expect(advanceLeg.totals.taxTotal).toBe(adv.expected.advance_tax_total);
    expect(finalLeg.totals.taxTotal).toBe(adv.expected.final_tax_total);
    const netTax = Number((finalLeg.totals.taxTotal - advanceLeg.totals.taxTotal).toFixed(2));
    expect(netTax).toBe(adv.expected.net_tax_total);
    expect(advanceLeg.totals.taxTotal + netTax).toBe(finalLeg.totals.taxTotal); // conservation
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/fixtures.test.ts`
Expected: FAIL — `Cannot find module './fixtures/intra_state_sac_998319.json'`.

- [ ] **Step 3: Create the 8 fixture JSONs**

`src/lib/regimes/in_gst/fixtures/intra_state_sac_998319.json`:
```json
{
  "name": "intra-state SAC 998319 — RAID-5 logical recovery, Karnataka B2B @18%",
  "input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "le-in", "countryId": "in", "subdivisionId": "sub-IN-KA", "taxIdentifier": "29ABCDE1234F1ZW", "registrations": [] },
    "buyer": { "taxNumber": "29AABCU9603R1ZJ", "countryId": "in", "subdivisionId": "sub-IN-KA", "isBusiness": true, "addressSnapshot": null },
    "taxPointDate": "2026-07-15",
    "placeOfSupplySubdivisionId": "sub-IN-KA",
    "lines": [{ "lineItemId": null, "description": "RAID-5 logical data recovery", "quantity": 1, "unitPrice": 100000, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null }],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "INR", "documentDecimals": 2, "baseCurrency": "INR", "baseDecimals": 2, "rate": 1, "rateSource": "manual" },
    "rates": [
      { "id": "in-cgst-18", "country_id": "in", "subdivision_id": null, "component_code": "CGST", "component_label": "CGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 10 },
      { "id": "in-sgst-18", "country_id": "in", "subdivision_id": null, "component_code": "SGST", "component_label": "SGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 20 },
      { "id": "in-igst-18", "country_id": "in", "subdivision_id": null, "component_code": "IGST", "component_label": "IGST", "tax_category": "standard", "rate": 18, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 30 }
    ],
    "roundingPolicy": { "mode": "half_up", "level": "head", "cash_increment": 1 },
    "scaleSystem": "indian"
  },
  "expected": {
    "totals": { "taxableBase": 100000, "taxTotal": 18000, "grandTotal": 118000, "roundingAdjustment": 0 },
    "rollups": [
      { "componentCode": "CGST", "rate": 9, "taxableBase": 100000, "taxAmount": 9000, "taxTreatment": "standard" },
      { "componentCode": "SGST", "rate": 9, "taxableBase": 100000, "taxAmount": 9000, "taxTreatment": "standard" }
    ]
  },
  "_meta": {
    "external_validation": { "status": "pending", "validator": null, "credential": null, "reference": null, "signed_off_at": null },
    "citations": ["CGST Act 2017 s.9(1) + Karnataka GST Act s.9(1) — intra-state dual levy", "IGST Act 2017 s.8 — intra-state supply determination", "Notification 11/2017-CT(R) — SAC 998319 (data-recovery service) @ 18%"]
  }
}
```

`src/lib/regimes/in_gst/fixtures/inter_state_igst.json`:
```json
{
  "name": "inter-state IGST — Karnataka lab to a Maharashtra business @18%",
  "input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "le-in", "countryId": "in", "subdivisionId": "sub-IN-KA", "taxIdentifier": "29ABCDE1234F1ZW", "registrations": [] },
    "buyer": { "taxNumber": "27AAACI1681G1ZP", "countryId": "in", "subdivisionId": "sub-IN-MH", "isBusiness": true, "addressSnapshot": null },
    "taxPointDate": "2026-07-15",
    "placeOfSupplySubdivisionId": "sub-IN-MH",
    "lines": [{ "lineItemId": null, "description": "SSD chip-off recovery", "quantity": 1, "unitPrice": 100000, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null }],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "INR", "documentDecimals": 2, "baseCurrency": "INR", "baseDecimals": 2, "rate": 1, "rateSource": "manual" },
    "rates": [
      { "id": "in-cgst-18", "country_id": "in", "subdivision_id": null, "component_code": "CGST", "component_label": "CGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 10 },
      { "id": "in-sgst-18", "country_id": "in", "subdivision_id": null, "component_code": "SGST", "component_label": "SGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 20 },
      { "id": "in-igst-18", "country_id": "in", "subdivision_id": null, "component_code": "IGST", "component_label": "IGST", "tax_category": "standard", "rate": 18, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 30 }
    ],
    "roundingPolicy": { "mode": "half_up", "level": "head", "cash_increment": 1 },
    "scaleSystem": "indian"
  },
  "expected": {
    "totals": { "taxableBase": 100000, "taxTotal": 18000, "grandTotal": 118000, "roundingAdjustment": 0 },
    "rollups": [
      { "componentCode": "IGST", "rate": 18, "taxableBase": 100000, "taxAmount": 18000, "taxTreatment": "standard" }
    ]
  },
  "_meta": {
    "external_validation": { "status": "pending", "validator": null, "credential": null, "reference": null, "signed_off_at": null },
    "citations": ["IGST Act 2017 s.5(1), s.7(3) — inter-state supply", "IGST Act 2017 s.12(2)(a) — place of supply = recipient's registered location", "Notification 8/2017-IT(R) — SAC 9987 @ 18%"]
  }
}
```

`src/lib/regimes/in_gst/fixtures/inclusive_b2c_rounding.json` (the ₹5,000 walk-in; taxable value 5000×100/118 = 4,237.29 is derived upstream and fed as the ex-tax line — the single-levy inclusive back-out is NOT valid for dual levy, so each head is computed independently at 9% and the ₹0.01 residual becomes the Section-170 round-off):
```json
{
  "name": "inclusive B2C walk-in ₹5,000 (taxable value 4,237.29 derived) — equal heads + Section 170 round-off",
  "input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "le-in", "countryId": "in", "subdivisionId": "sub-IN-KA", "taxIdentifier": "29ABCDE1234F1ZW", "registrations": [] },
    "buyer": { "taxNumber": null, "countryId": "in", "subdivisionId": "sub-IN-KA", "isBusiness": false, "addressSnapshot": null },
    "taxPointDate": "2026-07-15",
    "placeOfSupplySubdivisionId": "sub-IN-KA",
    "lines": [{ "lineItemId": null, "description": "Walk-in HDD recovery (₹5,000 all-inclusive)", "quantity": 1, "unitPrice": 4237.29, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null }],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "INR", "documentDecimals": 2, "baseCurrency": "INR", "baseDecimals": 2, "rate": 1, "rateSource": "manual" },
    "rates": [
      { "id": "in-cgst-18", "country_id": "in", "subdivision_id": null, "component_code": "CGST", "component_label": "CGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 10 },
      { "id": "in-sgst-18", "country_id": "in", "subdivision_id": null, "component_code": "SGST", "component_label": "SGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 20 },
      { "id": "in-igst-18", "country_id": "in", "subdivision_id": null, "component_code": "IGST", "component_label": "IGST", "tax_category": "standard", "rate": 18, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 30 }
    ],
    "roundingPolicy": { "mode": "half_up", "level": "head", "cash_increment": 1 },
    "scaleSystem": "indian"
  },
  "expected": {
    "totals": { "taxableBase": 4237.29, "taxTotal": 762.72, "grandTotal": 5000, "roundingAdjustment": -0.01 },
    "rollups": [
      { "componentCode": "CGST", "rate": 9, "taxableBase": 4237.29, "taxAmount": 381.36, "taxTreatment": "standard" },
      { "componentCode": "SGST", "rate": 9, "taxableBase": 4237.29, "taxAmount": 381.36, "taxTreatment": "standard" }
    ]
  },
  "_meta": {
    "external_validation": { "status": "pending", "validator": null, "credential": null, "reference": null, "signed_off_at": null },
    "citations": ["CGST Act 2017 s.15 — value of taxable supply (inclusive back-out to 4,237.29)", "CGST Act 2017 s.170 — rounding of tax; equal 9% heads + round-off −0.01 → ₹5,000.00", "Rule 46(m) — consolidated B2C invoice"]
  }
}
```

`src/lib/regimes/in_gst/fixtures/head_vs_line_rounding.json` (3 × ₹8.61: head-level aggregates to 25.83 → 2.32/head; a line-level impl would round each line's 0.7749 to 0.77 → 2.31/head — the discriminator; no `cash_increment` so the residual is isolated):
```json
{
  "name": "head-vs-line rounding discriminator — 3 × ₹8.61 intra-state @18%",
  "input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "le-in", "countryId": "in", "subdivisionId": "sub-IN-KA", "taxIdentifier": "29ABCDE1234F1ZW", "registrations": [] },
    "buyer": { "taxNumber": "29AABCU9603R1ZJ", "countryId": "in", "subdivisionId": "sub-IN-KA", "isBusiness": true, "addressSnapshot": null },
    "taxPointDate": "2026-07-15",
    "placeOfSupplySubdivisionId": "sub-IN-KA",
    "lines": [
      { "lineItemId": null, "description": "Consumable A", "quantity": 1, "unitPrice": 8.61, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null },
      { "lineItemId": null, "description": "Consumable B", "quantity": 1, "unitPrice": 8.61, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null },
      { "lineItemId": null, "description": "Consumable C", "quantity": 1, "unitPrice": 8.61, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null }
    ],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "INR", "documentDecimals": 2, "baseCurrency": "INR", "baseDecimals": 2, "rate": 1, "rateSource": "manual" },
    "rates": [
      { "id": "in-cgst-18", "country_id": "in", "subdivision_id": null, "component_code": "CGST", "component_label": "CGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 10 },
      { "id": "in-sgst-18", "country_id": "in", "subdivision_id": null, "component_code": "SGST", "component_label": "SGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 20 },
      { "id": "in-igst-18", "country_id": "in", "subdivision_id": null, "component_code": "IGST", "component_label": "IGST", "tax_category": "standard", "rate": 18, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 30 }
    ],
    "roundingPolicy": { "mode": "half_up", "level": "head" },
    "scaleSystem": "indian"
  },
  "expected": {
    "totals": { "taxableBase": 25.83, "taxTotal": 4.64, "grandTotal": 30.47, "roundingAdjustment": null },
    "rollups": [
      { "componentCode": "CGST", "rate": 9, "taxableBase": 25.83, "taxAmount": 2.32, "taxTreatment": "standard" },
      { "componentCode": "SGST", "rate": 9, "taxableBase": 25.83, "taxAmount": 2.32, "taxTreatment": "standard" }
    ]
  },
  "_meta": {
    "external_validation": { "status": "pending", "validator": null, "credential": null, "reference": null, "signed_off_at": null },
    "citations": ["CGST Act 2017 s.170 — rounding applied per tax head per invoice (head level, not per line)"]
  }
}
```

`src/lib/regimes/in_gst/fixtures/utgst_chandigarh.json` (UT without legislature; the second head is coded `SGST` so the kernel's split path picks it, but `component_label:"UTGST"` renders "UTGST 9%"):
```json
{
  "name": "UTGST Chandigarh — intra-UT supply, second head renders UTGST",
  "input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "le-in", "countryId": "in", "subdivisionId": "sub-IN-CH", "taxIdentifier": "04ABCDE1234F1Z8", "registrations": [] },
    "buyer": { "taxNumber": null, "countryId": "in", "subdivisionId": "sub-IN-CH", "isBusiness": false, "addressSnapshot": null },
    "taxPointDate": "2026-07-15",
    "placeOfSupplySubdivisionId": "sub-IN-CH",
    "lines": [{ "lineItemId": null, "description": "HDD recovery (Chandigarh)", "quantity": 1, "unitPrice": 50000, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null }],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "INR", "documentDecimals": 2, "baseCurrency": "INR", "baseDecimals": 2, "rate": 1, "rateSource": "manual" },
    "rates": [
      { "id": "in-cgst-18", "country_id": "in", "subdivision_id": null, "component_code": "CGST", "component_label": "CGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 10 },
      { "id": "in-utgst-ch-18", "country_id": "in", "subdivision_id": "sub-IN-CH", "component_code": "SGST", "component_label": "UTGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 20 },
      { "id": "in-igst-18", "country_id": "in", "subdivision_id": null, "component_code": "IGST", "component_label": "IGST", "tax_category": "standard", "rate": 18, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 30 }
    ],
    "roundingPolicy": { "mode": "half_up", "level": "head", "cash_increment": 1 },
    "scaleSystem": "indian"
  },
  "expected": {
    "totals": { "taxableBase": 50000, "taxTotal": 9000, "grandTotal": 59000, "roundingAdjustment": 0 },
    "rollups": [
      { "componentCode": "CGST", "componentLabel": "CGST 9%", "rate": 9, "taxableBase": 50000, "taxAmount": 4500, "taxTreatment": "standard" },
      { "componentCode": "SGST", "componentLabel": "UTGST 9%", "rate": 9, "taxableBase": 50000, "taxAmount": 4500, "taxTreatment": "standard" }
    ]
  },
  "_meta": {
    "external_validation": { "status": "pending", "validator": null, "credential": null, "reference": null, "signed_off_at": null },
    "citations": ["UTGST Act 2017 s.7 — Union Territory tax (Chandigarh; UT without legislature)", "CGST Act 2017 s.9(1) — CGST component"]
  }
}
```

`src/lib/regimes/in_gst/fixtures/credit_note_full_reversal.json` (per-head negation is a persistence concern — L4/S4; the kernel computes the positive per-head magnitudes the CN reverses):
```json
{
  "name": "credit note full reversal — RAID-5 recovery cancelled, Karnataka intra-state",
  "input_document": {
    "documentType": "credit_note",
    "seller": { "legalEntityId": "le-in", "countryId": "in", "subdivisionId": "sub-IN-KA", "taxIdentifier": "29ABCDE1234F1ZW", "registrations": [] },
    "buyer": { "taxNumber": "29AABCU9603R1ZJ", "countryId": "in", "subdivisionId": "sub-IN-KA", "isBusiness": true, "addressSnapshot": null },
    "taxPointDate": "2026-07-20",
    "placeOfSupplySubdivisionId": "sub-IN-KA",
    "lines": [{ "lineItemId": null, "description": "Reversal — RAID-5 logical data recovery", "quantity": 1, "unitPrice": 100000, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null }],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "INR", "documentDecimals": 2, "baseCurrency": "INR", "baseDecimals": 2, "rate": 1, "rateSource": "manual" },
    "rates": [
      { "id": "in-cgst-18", "country_id": "in", "subdivision_id": null, "component_code": "CGST", "component_label": "CGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 10 },
      { "id": "in-sgst-18", "country_id": "in", "subdivision_id": null, "component_code": "SGST", "component_label": "SGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 20 },
      { "id": "in-igst-18", "country_id": "in", "subdivision_id": null, "component_code": "IGST", "component_label": "IGST", "tax_category": "standard", "rate": 18, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 30 }
    ],
    "roundingPolicy": { "mode": "half_up", "level": "head", "cash_increment": 1 },
    "scaleSystem": "indian"
  },
  "expected": {
    "totals": { "taxableBase": 100000, "taxTotal": 18000, "grandTotal": 118000, "roundingAdjustment": 0 },
    "rollups": [
      { "componentCode": "CGST", "rate": 9, "taxableBase": 100000, "taxAmount": 9000, "taxTreatment": "standard" },
      { "componentCode": "SGST", "rate": 9, "taxableBase": 100000, "taxAmount": 9000, "taxTreatment": "standard" }
    ]
  },
  "_meta": {
    "external_validation": { "status": "pending", "validator": null, "credential": null, "reference": null, "signed_off_at": null },
    "citations": ["CGST Act 2017 s.34(1) — credit note against the original tax invoice", "CGST Rules r.53 — credit note particulars; per-head negation posted at persistence (WP-S4)"]
  }
}
```

`src/lib/regimes/in_gst/fixtures/advance_then_invoice_netting.json` (both legs modelled as `invoice` — the `receipt_voucher` document type lands in WP-L4; the GST-at-receipt math is identical, so the conservation identity is what the CA certifies):
```json
{
  "name": "advance-then-invoice netting — receipt-voucher tax + net invoice tax = total supply tax",
  "advance_input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "le-in", "countryId": "in", "subdivisionId": "sub-IN-KA", "taxIdentifier": "29ABCDE1234F1ZW", "registrations": [] },
    "buyer": { "taxNumber": "29AABCU9603R1ZJ", "countryId": "in", "subdivisionId": "sub-IN-KA", "isBusiness": true, "addressSnapshot": null },
    "taxPointDate": "2026-07-10",
    "placeOfSupplySubdivisionId": "sub-IN-KA",
    "lines": [{ "lineItemId": null, "description": "Advance against RAID recovery (Rule 50 receipt voucher)", "quantity": 1, "unitPrice": 50000, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null }],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "INR", "documentDecimals": 2, "baseCurrency": "INR", "baseDecimals": 2, "rate": 1, "rateSource": "manual" },
    "rates": [
      { "id": "in-cgst-18", "country_id": "in", "subdivision_id": null, "component_code": "CGST", "component_label": "CGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 10 },
      { "id": "in-sgst-18", "country_id": "in", "subdivision_id": null, "component_code": "SGST", "component_label": "SGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 20 },
      { "id": "in-igst-18", "country_id": "in", "subdivision_id": null, "component_code": "IGST", "component_label": "IGST", "tax_category": "standard", "rate": 18, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 30 }
    ],
    "roundingPolicy": { "mode": "half_up", "level": "head", "cash_increment": 1 },
    "scaleSystem": "indian"
  },
  "input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "le-in", "countryId": "in", "subdivisionId": "sub-IN-KA", "taxIdentifier": "29ABCDE1234F1ZW", "registrations": [] },
    "buyer": { "taxNumber": "29AABCU9603R1ZJ", "countryId": "in", "subdivisionId": "sub-IN-KA", "isBusiness": true, "addressSnapshot": null },
    "taxPointDate": "2026-07-25",
    "placeOfSupplySubdivisionId": "sub-IN-KA",
    "lines": [{ "lineItemId": null, "description": "Final tax invoice — RAID-5 recovery (full value)", "quantity": 1, "unitPrice": 100000, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null }],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "INR", "documentDecimals": 2, "baseCurrency": "INR", "baseDecimals": 2, "rate": 1, "rateSource": "manual" },
    "rates": [
      { "id": "in-cgst-18", "country_id": "in", "subdivision_id": null, "component_code": "CGST", "component_label": "CGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 10 },
      { "id": "in-sgst-18", "country_id": "in", "subdivision_id": null, "component_code": "SGST", "component_label": "SGST", "tax_category": "standard", "rate": 9, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 20 },
      { "id": "in-igst-18", "country_id": "in", "subdivision_id": null, "component_code": "IGST", "component_label": "IGST", "tax_category": "standard", "rate": 18, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "sort_order": 30 }
    ],
    "roundingPolicy": { "mode": "half_up", "level": "head", "cash_increment": 1 },
    "scaleSystem": "indian"
  },
  "expected": { "advance_tax_total": 9000, "final_tax_total": 18000, "net_tax_total": 9000 },
  "_meta": {
    "external_validation": { "status": "pending", "validator": null, "credential": null, "reference": null, "signed_off_at": null },
    "citations": ["CGST Act 2017 s.13(2) / s.31(3)(d) — GST payable on advance; Rule 50 receipt voucher", "CGST Act 2017 s.31(3)(f) — final invoice net of advance; conservation: 9,000 (voucher) + 9,000 (net) = 18,000 (total)", "GSTR-1 Table 11 / GSTR-3B — advances received & adjusted (composition supported; rows named-deferred per §7)"]
  }
}
```

`src/lib/regimes/in_gst/fixtures/unregistered_seller_plain_invoice.json` (unregistered seller: no GSTIN, no rate rows → no GST heads; the loud unregistered UI treatment is WP-L2 / D6):
```json
{
  "name": "unregistered seller plain invoice — below threshold, no GST levied",
  "input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "le-in", "countryId": "in", "subdivisionId": "sub-IN-KA", "taxIdentifier": null, "registrations": [] },
    "buyer": { "taxNumber": null, "countryId": "in", "subdivisionId": "sub-IN-KA", "isBusiness": false, "addressSnapshot": null },
    "taxPointDate": "2026-07-15",
    "placeOfSupplySubdivisionId": "sub-IN-KA",
    "lines": [{ "lineItemId": null, "description": "USB flash recovery", "quantity": 1, "unitPrice": 100000, "lineDiscount": 0, "unitCode": "C62", "itemCode": "998319", "treatment": "standard", "treatmentReasonCode": null }],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "INR", "documentDecimals": 2, "baseCurrency": "INR", "baseDecimals": 2, "rate": 1, "rateSource": "manual" },
    "rates": [],
    "roundingPolicy": { "mode": "half_up", "level": "head" },
    "scaleSystem": "indian"
  },
  "expected": {
    "totals": { "taxableBase": 100000, "taxTotal": 0, "grandTotal": 100000, "roundingAdjustment": null },
    "rollups": []
  },
  "_meta": {
    "external_validation": { "status": "pending", "validator": null, "credential": null, "reference": null, "signed_off_at": null },
    "citations": ["CGST Act 2017 s.22/24 — registration threshold", "CGST Act 2017 s.32(1) — an unregistered person shall not collect GST"]
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/fixtures.test.ts` — Expected: all green.
NOTE: these expected figures are the CA-facing numbers. If the kernel produces anything different, **stop and debug the kernel/data, never the expectation** — invoke `superpowers:systematic-debugging`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/in_gst/fixtures src/lib/regimes/in_gst/fixtures.test.ts
git commit -m "feat(regimes): in_gst golden fixture corpus (8 scenarios) with statutory citations + pending external validation"
```

---

### Task S3.6: Property tests — allocation, inclusive round-trip, equal dual-levy, trace determinism

**Files:**
- Create (Test): `src/lib/regimes/in_gst/properties.test.ts`

**Interfaces:**
- Consumes: `allocateLargestRemainder` from `../../financialMath` (verified export); `backOutInclusive` from `../../tax/kernel/backOutInclusive` (verified export); `inGstStrategy` (S3.2); `GeoCountryTaxRateRow`/`TaxContext` (types).
- Produces: regression net only (no exports).

- [ ] **Step 1: Write the test** (deterministic mulberry32 sweep, no new deps)

```typescript
// src/lib/regimes/in_gst/properties.test.ts
import { describe, it, expect } from 'vitest';
import { allocateLargestRemainder } from '../../financialMath';
import { backOutInclusive } from '../../tax/kernel/backOutInclusive';
import { inGstStrategy } from './index';
import type { GeoCountryTaxRateRow, TaxContext } from '../types';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IN_RATES: GeoCountryTaxRateRow[] = [
  { id: 'in-cgst-18', country_id: 'in', subdivision_id: null, component_code: 'CGST', component_label: 'CGST', tax_category: 'standard', rate: 9, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 10 },
  { id: 'in-sgst-18', country_id: 'in', subdivision_id: null, component_code: 'SGST', component_label: 'SGST', tax_category: 'standard', rate: 9, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 20 },
  { id: 'in-igst-18', country_id: 'in', subdivision_id: null, component_code: 'IGST', component_label: 'IGST', tax_category: 'standard', rate: 18, applies_to: 'gst_slab_18', valid_from: '2017-07-01', valid_to: null, sort_order: 30 },
];

function intraCtx(unitPrice: number, cashIncrement?: number): TaxContext {
  return {
    documentType: 'invoice',
    seller: { legalEntityId: 'le', countryId: 'in', subdivisionId: 'sub-IN-KA', taxIdentifier: '29ABCDE1234F1ZW', registrations: [] },
    buyer: { taxNumber: null, countryId: 'in', subdivisionId: 'sub-IN-KA', isBusiness: false, addressSnapshot: null },
    taxPointDate: '2026-07-15', placeOfSupplySubdivisionId: 'sub-IN-KA',
    lines: [{ lineItemId: null, description: 'svc', quantity: 1, unitPrice, lineDiscount: 0, unitCode: 'C62', itemCode: '998319', treatment: 'standard', treatmentReasonCode: null }],
    documentDiscount: 0, taxInclusive: false,
    rateContext: { documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2, rate: 1, rateSource: 'manual' },
    rates: IN_RATES,
    roundingPolicy: cashIncrement ? { mode: 'half_up', level: 'head', cash_increment: cashIncrement } : { mode: 'half_up', level: 'head' },
    scaleSystem: 'indian',
  };
}

describe('in_gst kernel-parameter properties', () => {
  it('largest-remainder totality: Σ(parts) === whole at 2dp over 500 random splits', () => {
    const rand = rng(42);
    for (let i = 0; i < 500; i++) {
      const total = Math.round(rand() * 1_000_000) / 100;
      const parts = allocateLargestRemainder(total, [1, 1], 2);
      expect(parts[0] + parts[1]).toBeCloseTo(total, 9);
    }
  });

  it('inclusive back-out round-trips: base + tax === gross over 500 random @18% grosses', () => {
    const rand = rng(7);
    for (let i = 0; i < 500; i++) {
      const gross = Math.round(rand() * 1_000_000) / 100;
      const { base, tax } = backOutInclusive(gross, 18, 2);
      expect(base + tax).toBeCloseTo(gross, 9);
    }
  });

  it('equal dual-levy: CGST and SGST are each 9% of the SAME base and always equal (never asymmetric)', async () => {
    const rand = rng(99);
    for (let i = 0; i < 200; i++) {
      const price = Math.round(rand() * 1_000_000) / 100;
      const c = await inGstStrategy.compute(intraCtx(price));
      const cgst = c.rollups.find((r) => r.componentCode === 'CGST');
      const sgst = c.rollups.find((r) => r.componentCode === 'SGST');
      expect(cgst?.taxAmount).toBe(sgst?.taxAmount);
    }
  });

  it('the walk-in ₹5,000 case: equal 381.36 heads + Section-170 round-off to ₹5,000.00', async () => {
    const c = await inGstStrategy.compute(intraCtx(4237.29, 1));
    expect(c.rollups.find((r) => r.componentCode === 'CGST')?.taxAmount).toBe(381.36);
    expect(c.rollups.find((r) => r.componentCode === 'SGST')?.taxAmount).toBe(381.36);
    expect(c.totals.grandTotal).toBe(5000);
    expect(c.totals.roundingAdjustment).toBe(-0.01);
  });

  it('trace determinism: identical input → deep-equal computation + split scheme mode', async () => {
    const a = await inGstStrategy.compute(intraCtx(100000, 1));
    const b = await inGstStrategy.compute(intraCtx(100000, 1));
    expect(a).toEqual(b);
    expect(a.trace.schemeMode).toBe('split_by_place_of_supply');
  });
});
```

- [ ] **Step 2: Run it, verify current state**

Run: `npx vitest run src/lib/regimes/in_gst/properties.test.ts`
Expected: PASS (these pin Phase-1 primitives + S3.2 delegation under India parameters). If any case fails, that is a **kernel/primitive bug** — invoke `superpowers:systematic-debugging` against `financialMath`/`backOutInclusive`/`kernel`; do not adjust expectations.

- [ ] **Step 3: Commit**

```bash
git add src/lib/regimes/in_gst/properties.test.ts
git commit -m "test(regimes): India property pins — allocation totality, inclusive round-trip, equal dual-levy, trace determinism"
```

---

### Task S3.7: Capability sync + full-WP verification + PR

**Files:**
- No source files. Live-DB capability sync (`sync_engine_capabilities` RPC, project_id `ssmbegiyjivrcwgcqutu`) + repo verification.

**Interfaces:**
- Consumes: the `in_gst` registration added to `register.ts` in S3.2; the `sync_engine_capabilities(jsonb)` RPC (verified upsert-only on `(capability_key, kind) WHERE deleted_at IS NULL`, so a single-row payload does not disturb the 7 existing plugin rows).
- Produces: one `master_engine_capabilities` row (`capability_key='in_gst'`, `kind='regime_adapter'`, `min_engine_version='1.0.0'`) — asserted present by WP-S7's pre-publish capability gate.

- [ ] **Step 1: Sync the capability projection to the live DB** (honesty bridge — the row exists only because `in_gst` is now registered in code; no hand-seed)

Run via `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):
```sql
SELECT sync_engine_capabilities(
  '[{"capability_key":"in_gst","kind":"regime_adapter","version":"1.0.0"}]'::jsonb
);
```
Expected: returns `1`.

- [ ] **Step 2: Verify the row landed and nothing else changed**

```sql
SELECT capability_key, kind, min_engine_version
FROM master_engine_capabilities
WHERE capability_key = 'in_gst' AND deleted_at IS NULL;
```
Expected: one row `in_gst | regime_adapter | 1.0.0`.

- [ ] **Step 3: Run the full WP test set + typecheck + lint**

```bash
npm run typecheck
npx vitest run src/lib/regimes/in_gst src/lib/taxDocumentService.test.ts src/lib/taxDocumentService.roundoff.test.ts
npm run lint
```
Expected: typecheck 0 errors; all `in_gst/*`, `taxDocumentService.test.ts`, `taxDocumentService.roundoff.test.ts` green; lint clean (in particular `xsuite/no-country-branching-outside-regimes` and `xsuite/no-adhoc-money-allocation` report nothing — all India logic lives under `src/lib/regimes/in_gst/`, and the seam helpers `matchFormRate`/`resolveStrategyKey`/`roundOffAdjustmentLine` branch on pack DATA, never a country literal).

- [ ] **Step 4: Push + open the PR** (owner merges; do NOT merge)

```bash
git push -u origin feat/india-s3-in-gst-strategy
gh pr create --base main --title "Phase 4 India Pack — WP-S3: in_gst strategy + seam completion + golden fixtures" --body "$(cat <<'EOF'
## WP-S3 — in_gst Strategy + Seam Completion + Golden Fixtures

Governing spec: docs/superpowers/specs/2026-07-05-phase4-india-pack-design.md §4-S3. No migration.

### What this ships
- **in_gst TaxStrategy** (`src/lib/regimes/in_gst/index.ts`): one-line `computeWithMode(ctx, 'split_by_place_of_supply')` delegation; a structural test greps the module to prove zero India arithmetic (component names live in DATA). Defaults `{half_up, level:'head', cash_increment:1}`, `scaleSystem:'indian'`. Registered in `register.ts`.
- **GSTIN validator**: CONSUMED from WP-S2 (`src/lib/regimes/in_gst/gstin.ts` — CBIC mod-36 checksum + format + count-pinned 36-code GST state set with special 96/97 excluded + optional subdivision cross-check); this WP does NOT re-author it.
- **Seam completion (blocker fix)** in `taxDocumentService.ts`: `matchFormRate` is now slab-aware — IN form rate 18 returns the full CGST/SGST/IGST head-set (never a synthetic `form:18`), Oman/AE/SA single-levy path byte-identical; `computeDocumentTotals` threads the pack-resolved `regime.tax` key (new `resolveStrategyKey`), killing the `simple_vat` hardcode so the kernel split fires on a live IN invoice.
- **Section 170 round-off** (`roundOffAdjustmentLine` + `persistDocumentTaxLines`): the whole-rupee residual is persisted as an explicit `out_of_scope` "Round off" line so invoice, ledger and return tie.
- **8 golden fixtures** (all `_meta.external_validation: pending`): intra-state SAC 998319, inter-state IGST, inclusive B2C (EQUAL 381.36/381.36 heads + round-off −0.01 → ₹5,000.00), head-vs-line rounding discriminator (2.32 vs 2.31), UTGST Chandigarh, credit-note full reversal, advance-then-invoice netting (conservation: voucher 9,000 + net 9,000 = total 18,000), unregistered-seller plain invoice.
- **Property tests**: allocation totality, inclusive round-trip, equal dual-levy, trace determinism.
- **Capability sync**: `in_gst` regime_adapter row synced live via `sync_engine_capabilities` (projection of the code registry — not hand-seeded); WP-S7 asserts it pre-publish.

### Verification
- `npm run typecheck` = 0
- `npx vitest run src/lib/regimes/in_gst src/lib/taxDocumentService.test.ts src/lib/taxDocumentService.roundoff.test.ts` — green
- `npm run lint` — clean
- Non-India golden suites unaffected (`matchFormRate` legacy path byte-identical; kernel unchanged).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: branch pushed; PR opened against `main`. Do not merge.

---


## Work Package WP-S4 — `in_gst_invoice` Profile + India Credit Notes [L, no migration]

Branch: `feat/india-s4-in-gst-invoice-profile` (cut from `main`)
Depends on: **WP-S1a** (migration: `master_document_requirements` `field_key` CHECK widened to the credit-note original-invoice-ref key; rounding `level` enum gains `'head'`), **WP-S1b** (data: IN `country_config` sets `regime.documents='in_gst_invoice'`, `format.amount_words_scale='indian'`, `taxNumberLabel='GSTIN'`; IN `master_numbering_policies` incl. the credit-note FY series; `master_document_requirements` invoice+CN block rows), **WP-S2** (IN test tenant provisioned; buyer GSTIN/state snapshot columns threaded into `TaxContext`), **WP-S3** (`in_gst` tax strategy registered under kind `tax`, `computeDocumentTotals` seam completed so IN quotes/invoices persist per-head `document_tax_lines` with `component_label` ∈ {CGST, SGST, IGST}; `gstin.ts` / `placeOfSupply.ts`). No migration in this WP.

---

### Task S4.1: HSN/SAC format + UQC mapping helpers

**Files:**
- Create: `src/lib/regimes/in_gst/hsn.ts`
- Test: `src/lib/regimes/in_gst/hsn.test.ts`

**Interfaces:**
- Consumes: nothing (pure). UQC rows arrive at call sites from `master_unit_codes.uqc_code` (seeded in WP-S1b).
- Produces: `validateHsnSac(code: string): { ok: boolean; error: string | null }` and `uqcForUnitCode(unitCode: string, units: Array<{ code: string; uqc_code: string | null }>): string` — consumed by Tasks S4.4 (SAC defaults) and the line-item form soft-validation.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/hsn.test.ts
import { describe, it, expect } from 'vitest';
import { validateHsnSac, uqcForUnitCode } from './hsn';

describe('validateHsnSac', () => {
  it('accepts 4/6/8-digit HSN and 6-digit SAC codes', () => {
    expect(validateHsnSac('4907').ok).toBe(true);      // 4-digit HSN
    expect(validateHsnSac('998319').ok).toBe(true);    // 6-digit SAC (99xxxx)
    expect(validateHsnSac('84717020').ok).toBe(true);  // 8-digit HSN
  });
  it('rejects wrong lengths and non-digits', () => {
    expect(validateHsnSac('99871').ok).toBe(false);    // 5 digits
    expect(validateHsnSac('99871A').ok).toBe(false);
    expect(validateHsnSac('').ok).toBe(false);
    expect(validateHsnSac('998319').error).toBe(null);
    expect(validateHsnSac('99871').error).toContain('4, 6 or 8');
  });
});

describe('uqcForUnitCode', () => {
  const units = [
    { code: 'C62', uqc_code: 'NOS' },
    { code: 'HUR', uqc_code: 'OTH' },
    { code: 'XYZ', uqc_code: null },
  ];
  it('maps a Rec-20 code to its GSTN UQC', () => {
    expect(uqcForUnitCode('C62', units)).toBe('NOS');
    expect(uqcForUnitCode('HUR', units)).toBe('OTH');
  });
  it("falls back to 'OTH' for unmapped or unknown codes (never blank on a filing)", () => {
    expect(uqcForUnitCode('XYZ', units)).toBe('OTH');
    expect(uqcForUnitCode('NOPE', units)).toBe('OTH');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/hsn.test.ts`
Expected: FAIL — `Cannot find module './hsn'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/in_gst/hsn.ts
// HSN (goods, 4/6/8 digits) and SAC (services, 6 digits, 99-prefix — same digit
// rule) FORMAT validation, and the Rec-20 → GSTN UQC mapping read from
// master_unit_codes. Digit-count-by-turnover policy (4 vs 6 mandatory digits) is
// enforced by the requirement rows + CA guidance, not here.

export function validateHsnSac(code: string): { ok: boolean; error: string | null } {
  const value = code.trim();
  if (/^\d{4}$/.test(value) || /^\d{6}$/.test(value) || /^\d{8}$/.test(value)) {
    return { ok: true, error: null };
  }
  return { ok: false, error: 'HSN/SAC must be 4, 6 or 8 digits' };
}

export function uqcForUnitCode(
  unitCode: string,
  units: Array<{ code: string; uqc_code: string | null }>,
): string {
  const match = units.find((u) => u.code === unitCode);
  return match?.uqc_code ?? 'OTH';
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/hsn.test.ts` — Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/in_gst/hsn.ts src/lib/regimes/in_gst/hsn.test.ts
git commit -m "feat(regimes): HSN/SAC format validation + Rec-20→UQC mapping helper"
```

---

### Task S4.2: `in_gst_invoice` DocumentComplianceProfile + register + capability sync

**Files:**
- Create: `src/lib/regimes/in_gst/documents.ts`
- Modify: `src/lib/regimes/register.ts` (register the profile — the barrel adds one line after `gccTaxInvoiceProfile` at `register.ts:22`)
- Test: `src/lib/regimes/in_gst/documents.test.ts`
- Test: `src/lib/tax/capabilityManifest.inGst.test.ts`

**Interfaces:**
- Consumes: `DocumentComplianceProfile`, `TaxComputation`, `DocumentNotation`, `TaxDocumentType` from `src/lib/regimes/types.ts` (`types.ts:127,133,215,21`); `registerRegimePlugin` / `resolveDocumentProfile` from `src/lib/regimes/registry.ts` (`registry.ts:21,46`); `registerAllRegimePlugins` from `src/lib/regimes/register.ts`; `syncEngineCapabilities` from `src/lib/tax/capabilityManifest.ts` (`capabilityManifest.ts:21`).
- Produces: `inGstInvoiceProfile: DocumentComplianceProfile` (key `'in_gst_invoice'`, version `'1.0.0'`) — consumed by `countryTemplateOverride` (Task S4.9 acceptance) and `resolveComplianceRenderInputs` (Task S4.8).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/documents.test.ts
import { describe, it, expect } from 'vitest';
import { inGstInvoiceProfile } from './documents';
import { resolveDocumentProfile } from '../registry';
import { registerAllRegimePlugins } from '../register';
import type { TaxComputation } from '../types';

registerAllRegimePlugins();

const computation = (over: Partial<TaxComputation>): TaxComputation => ({
  lines: [], rollups: [],
  totals: { taxableBase: 0, taxTotal: 0, grandTotal: 0, roundingAdjustment: null },
  expectedWithholding: null, notations: [],
  trace: { regimeKey: 'in_gst', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'split_by_place_of_supply', steps: [] },
  ...over,
});

describe('in_gst_invoice DocumentComplianceProfile', () => {
  it('is registered and identity-correct', () => {
    expect(resolveDocumentProfile('in_gst_invoice')).toBe(inGstInvoiceProfile);
    expect(inGstInvoiceProfile.key).toBe('in_gst_invoice');
    expect(inGstInvoiceProfile.version).toBe('1.0.0');
    expect(inGstInvoiceProfile.requiresTaxInvoiceCeremony).toBe(true);
    expect(inGstInvoiceProfile.showRegistrationBand).toBe(true);
    expect(inGstInvoiceProfile.paperSize).toBe('A4');
    expect(inGstInvoiceProfile.bilingual).toEqual({ enabled: false, secondaryLanguage: null, arabicLead: false });
  });

  it('forces HSN and UQC columns — the tenant cannot delete them', () => {
    expect(inGstInvoiceProfile.forcedColumns).toEqual(['item_code', 'unit_code']);
  });

  it("titles 'TAX INVOICE' only for a registered seller when required, 'Invoice' otherwise", () => {
    expect(inGstInvoiceProfile.documentTitle({ docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: true }))
      .toEqual({ title: 'TAX INVOICE', titleTranslated: null });
    expect(inGstInvoiceProfile.documentTitle({ docType: 'invoice', sellerRegistered: false, taxInvoiceRequired: true }).title)
      .toBe('Invoice');
    expect(inGstInvoiceProfile.documentTitle({ docType: 'credit_note', sellerRegistered: true, taxInvoiceRequired: true }).title)
      .toBe('CREDIT NOTE');
    expect(inGstInvoiceProfile.documentTitle({ docType: 'quote', sellerRegistered: true, taxInvoiceRequired: true }).title)
      .toBe('Quotation');
    expect(inGstInvoiceProfile.documentTitle({ docType: 'stock_sale', sellerRegistered: true, taxInvoiceRequired: true }).title)
      .toBe('TAX INVOICE');
    expect(inGstInvoiceProfile.documentTitle({ docType: 'stock_sale', sellerRegistered: false, taxInvoiceRequired: true }).title)
      .toBe('Cash Sale');
  });

  it('passes through reverse-charge notations from the computation, invents none', () => {
    const notes = inGstInvoiceProfile.notations(computation({
      notations: [{ code: 'REVERSE_CHARGE', text: 'Tax payable on reverse charge basis' }],
    }));
    expect(notes).toEqual([{ code: 'REVERSE_CHARGE', text: 'Tax payable on reverse charge basis' }]);
    expect(inGstInvoiceProfile.notations(computation({ notations: [] }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/documents.test.ts`
Expected: FAIL — `Cannot find module './documents'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/in_gst/documents.ts
// India GST document compliance profile (CGST Rules r.46/r.49/r.53). Consumed by
// the Localization Phase-2 profile plumbing: countryTemplateOverride, the pdfmake
// adapters, and the React previews all read the SAME resolved profile so screen and
// print cannot diverge. bilingual:false — India invoices are English-only (no
// statutory second script), unlike the GCC Arabic profile.
import type {
  DocumentComplianceProfile, TaxComputation, DocumentNotation, TaxDocumentType,
} from '../types';

const TITLES: Record<TaxDocumentType, { registered: string; unregistered: string }> = {
  invoice:     { registered: 'TAX INVOICE', unregistered: 'Invoice' },
  credit_note: { registered: 'CREDIT NOTE', unregistered: 'Credit Note' },
  quote:       { registered: 'Quotation',   unregistered: 'Quotation' },
  stock_sale:  { registered: 'TAX INVOICE', unregistered: 'Cash Sale' },
};

export const inGstInvoiceProfile: DocumentComplianceProfile = {
  key: 'in_gst_invoice',
  version: '1.0.0',
  documentTitle(ctx) {
    const t = TITLES[ctx.docType];
    const useRegistered = ctx.sellerRegistered && ctx.taxInvoiceRequired;
    // Quotation/Cash-Sale titles do not depend on registration; the map already
    // encodes that (both keys equal for quote; unregistered stock_sale = Cash Sale).
    return { title: useRegistered ? t.registered : t.unregistered, titleTranslated: null };
  },
  requiresTaxInvoiceCeremony: true,
  showRegistrationBand: true,
  forcedColumns: ['item_code', 'unit_code'],
  bilingual: { enabled: false, secondaryLanguage: null, arabicLead: false },
  paperSize: 'A4',
  notations(computation: TaxComputation): DocumentNotation[] {
    // The in_gst strategy (WP-S3) already queues REVERSE_CHARGE / ZERO_RATED
    // treatment notations; the profile passes them through and never invents amounts.
    return computation.notations;
  },
};
```

Add to `src/lib/regimes/register.ts` — import beside the other document profiles and register beside `gccTaxInvoiceProfile` (`register.ts:10,22`):

```typescript
import { inGstInvoiceProfile } from './in_gst/documents';
// ...inside registerAllRegimePlugins(), after registerRegimePlugin('documents', gccTaxInvoiceProfile):
  registerRegimePlugin('documents', inGstInvoiceProfile);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/documents.test.ts` — Expected: 4 passed.

- [ ] **Step 5: Write the capability-sync test**

```typescript
// src/lib/tax/capabilityManifest.inGst.test.ts
import { describe, it, expect } from 'vitest';
import { registerAllRegimePlugins } from '../regimes/register';
import { listRegisteredCapabilities } from '../regimes/registry';
import { KIND_TO_CAPABILITY } from './capabilityManifest';

describe('in_gst_invoice is present in the code capability registry (never hand-seeded)', () => {
  it('the documents profile is registered and maps to a regime_adapter row', () => {
    registerAllRegimePlugins();
    const caps = listRegisteredCapabilities();
    const row = caps.find((c) => c.capability_key === 'in_gst_invoice' && c.kind === 'documents');
    expect(row).toBeDefined();
    expect(row?.version).toBe('1.0.0');
    expect(KIND_TO_CAPABILITY[row!.kind]).toBe('regime_adapter');
  });
});
```

Run: `npx vitest run src/lib/tax/capabilityManifest.inGst.test.ts` — Expected: PASS (Step 3 already registered the profile; `syncEngineCapabilities()` projects it via the RPC — no hand-seeded rows).

- [ ] **Step 6: Commit**

```bash
git add src/lib/regimes/in_gst/documents.ts src/lib/regimes/in_gst/documents.test.ts src/lib/regimes/register.ts src/lib/tax/capabilityManifest.inGst.test.ts
git commit -m "feat(regimes): in_gst_invoice document profile (GSTIN band, forced HSN/UQC, TAX INVOICE ceremony) + capability sync"
```

---

### Task S4.3: India statutory document meta — place of supply, reverse-charge, delivery-address-where-different, signature block

**Files:**
- Create: `src/lib/regimes/in_gst/statutoryMeta.ts`
- Create: `src/lib/regimes/in_gst/statutoryMeta.test.ts`
- Modify: `src/lib/pdf/engine/countryConfig.ts` (`countryTemplateOverride`, `countryConfig.ts:58` — set `override.statutoryProfileKey = compliance.profile.key`)
- Modify: `src/lib/pdf/templateConfig.ts` (add optional `statutoryProfileKey?: string` to `TemplateConfigOverride` and `DocumentTemplateConfig`)
- Modify: `src/lib/pdf/engine/adapters/invoiceAdapter.ts` and `src/lib/pdf/engine/adapters/creditNoteAdapter.ts` (`creditNoteAdapter.ts:110-124` meta block) — append dispatcher rows to `meta`
- Test: `src/lib/pdf/engine/adapters/inGstStatutoryMeta.render.test.ts`

**Interfaces:**
- Consumes: `TemplateConfigOverride` / `DocumentTemplateConfig` from `src/lib/pdf/templateConfig.ts`; `ComplianceOverrideInputs` from `src/lib/pdf/engine/countryConfig.ts` (`countryConfig.ts:49`); `CreditNoteData` (`buyer_tax_number`, `buyer_address`, `reverse_charge`, `pdf/types.ts:543-572`); `EngineDocData` meta shape (`src/lib/pdf/engine/types.ts`).
- Produces: `buildIndiaStatutoryMeta(ctx: IndiaMetaContext): StatutoryMetaRow[]`, `resolveStatutoryDocumentMeta(profileKey: string, ctx: IndiaMetaContext): StatutoryMetaRow[]`, `INDIA_SIGNATURE_LINES` — consumed by both financial adapters and pinned by the render test.

- [ ] **Step 1: Write the failing test (pure builders)**

```typescript
// src/lib/regimes/in_gst/statutoryMeta.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildIndiaStatutoryMeta, resolveStatutoryDocumentMeta, INDIA_SIGNATURE_LINES,
} from './statutoryMeta';

const base = {
  placeOfSupplyStateName: 'Maharashtra',
  placeOfSupplyStateCode: '27',
  reverseCharge: false,
  billingAddress: '12 MG Road, Pune',
  deliveryAddress: null as string | null,
};

describe('buildIndiaStatutoryMeta (Rule 46 conditionals)', () => {
  it('prints Place of Supply as "State Name (Code)" and Reverse Charge always', () => {
    const rows = buildIndiaStatutoryMeta(base);
    expect(rows).toEqual([
      { label: { en: 'Place of Supply:' }, value: 'Maharashtra (27)' },
      { label: { en: 'Reverse Charge:' }, value: 'No' },
    ]);
  });

  it('prints Reverse Charge: Yes when the flag is set', () => {
    const rows = buildIndiaStatutoryMeta({ ...base, reverseCharge: true });
    expect(rows).toContainEqual({ label: { en: 'Reverse Charge:' }, value: 'Yes' });
  });

  it('adds a Delivery Address row ONLY when it differs from billing (Rule 46 ship-to)', () => {
    expect(buildIndiaStatutoryMeta({ ...base, deliveryAddress: '12 MG Road, Pune' }))
      .not.toContainEqual({ label: { en: 'Delivery Address:' }, value: '12 MG Road, Pune' });
    expect(buildIndiaStatutoryMeta({ ...base, deliveryAddress: 'Plot 9, Hinjewadi' }))
      .toContainEqual({ label: { en: 'Delivery Address:' }, value: 'Plot 9, Hinjewadi' });
  });

  it('omits Place of Supply when state data is absent (honest-degrade, no blank row)', () => {
    const rows = buildIndiaStatutoryMeta({ ...base, placeOfSupplyStateName: null, placeOfSupplyStateCode: null });
    expect(rows.some((r) => r.label.en === 'Place of Supply:')).toBe(false);
    expect(rows).toContainEqual({ label: { en: 'Reverse Charge:' }, value: 'No' });
  });

  it('exposes the r.46(q) authorised-signatory block lines', () => {
    expect(INDIA_SIGNATURE_LINES).toEqual(['For {SELLER}', 'Authorised Signatory']);
  });
});

describe('resolveStatutoryDocumentMeta (dispatch by profile key, never country string)', () => {
  it('returns India rows only for in_gst_invoice, [] for every other profile', () => {
    expect(resolveStatutoryDocumentMeta('in_gst_invoice', base).length).toBeGreaterThan(0);
    expect(resolveStatutoryDocumentMeta('gcc_tax_invoice', base)).toEqual([]);
    expect(resolveStatutoryDocumentMeta('generic_invoice', base)).toEqual([]);
    expect(resolveStatutoryDocumentMeta('', base)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/statutoryMeta.test.ts`
Expected: FAIL — `Cannot find module './statutoryMeta'`.

- [ ] **Step 3: Minimal implementation (pure builders + dispatcher)**

```typescript
// src/lib/regimes/in_gst/statutoryMeta.ts
// India-only Rule 46 document meta rows (place of supply, reverse-charge notation,
// ship-to-where-different) and the r.46(q) signature block. Lives under regimes/in_gst
// so the country logic never leaks into pdf/engine (no-country-branching-outside-regimes);
// the render layer reaches it only through resolveStatutoryDocumentMeta, keyed by the
// resolved DocumentComplianceProfile key — data-driven, not a country string.

export interface StatutoryMetaRow {
  label: { en: string };
  value: string;
}

export interface IndiaMetaContext {
  placeOfSupplyStateName: string | null;
  placeOfSupplyStateCode: string | null; // GST state code, e.g. '27'
  reverseCharge: boolean;
  billingAddress: string | null;
  deliveryAddress: string | null;        // ship-to, when captured
}

/** r.46(q) — every tax invoice carries the seller's authorised signatory block.
 *  {SELLER} is substituted by the adapter with the resolved seller name. */
export const INDIA_SIGNATURE_LINES = ['For {SELLER}', 'Authorised Signatory'] as const;

export function buildIndiaStatutoryMeta(ctx: IndiaMetaContext): StatutoryMetaRow[] {
  const rows: StatutoryMetaRow[] = [];
  if (ctx.placeOfSupplyStateName && ctx.placeOfSupplyStateCode) {
    rows.push({ label: { en: 'Place of Supply:' }, value: `${ctx.placeOfSupplyStateName} (${ctx.placeOfSupplyStateCode})` });
  }
  // r.46(p): whether tax is payable on reverse charge — mandatory, always printed.
  rows.push({ label: { en: 'Reverse Charge:' }, value: ctx.reverseCharge ? 'Yes' : 'No' });
  const delivery = ctx.deliveryAddress?.trim();
  if (delivery && delivery !== ctx.billingAddress?.trim()) {
    rows.push({ label: { en: 'Delivery Address:' }, value: delivery });
  }
  return rows;
}

export function resolveStatutoryDocumentMeta(profileKey: string, ctx: IndiaMetaContext): StatutoryMetaRow[] {
  if (profileKey === 'in_gst_invoice') return buildIndiaStatutoryMeta(ctx);
  return [];
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/statutoryMeta.test.ts` — Expected: all passed.

- [ ] **Step 5: Thread the profile key + wire adapters (failing render test first)**

```typescript
// src/lib/pdf/engine/adapters/inGstStatutoryMeta.render.test.ts
// India cell of the document matrix: the invoice/credit-note adapters must append
// the Rule-46 statutory meta rows when config.statutoryProfileKey === 'in_gst_invoice',
// sourced ONLY from fields already on the doc data (no new fetch), and emit nothing
// for a non-India profile (byte-stability for GCC/generic).
import { describe, it, expect } from 'vitest';
import { toCreditNoteEngineData } from './creditNoteAdapter';
import type { CreditNoteDocumentData } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';

const config = (over: Partial<DocumentTemplateConfig>): DocumentTemplateConfig => ({
  sections: [{ key: 'lineItems', columns: [] }, { key: 'totals', lines: {} }],
  ...(over as DocumentTemplateConfig),
});

const cnData = (over: Partial<CreditNoteDocumentData['creditNoteData']>): CreditNoteDocumentData => ({
  creditNoteData: {
    credit_note_number: 'CN/25-26/0001', credit_note_date: '2026-05-10',
    credit_type: 'adjustment', status: 'issued', reason_code: null, reason_notes: null,
    subtotal: 1000, tax_rate: 18, tax_amount: 180, total_amount: 1180, applied_amount: 0,
    invoice_number: 'INV/25-26/0007', customer_name: 'Acme', company_name: null, case_no: null,
    currency_symbol: '₹', currency_position: 'before', decimal_places: 2, items: [],
    buyer_tax_number: '27ABCDE1234F1Z5', buyer_address: { state: 'Maharashtra' },
    reverse_charge: false, tax_lines: [],
    ...over,
  },
  companySettings: { basic_info: {} } as CreditNoteDocumentData['companySettings'],
});

describe('India statutory meta wiring on the credit-note adapter', () => {
  it('appends Place of Supply + Reverse Charge for in_gst_invoice', () => {
    const out = toCreditNoteEngineData(cnData({}), config({ statutoryProfileKey: 'in_gst_invoice' }));
    const labels = out.meta.map((m) => m.label.en);
    expect(labels).toContain('Place of Supply:');
    expect(labels).toContain('Reverse Charge:');
    const pos = out.meta.find((m) => m.label.en === 'Place of Supply:');
    expect(pos?.value).toBe('Maharashtra (27)');
  });

  it('emits NO statutory meta for a non-India profile (byte-stable)', () => {
    const out = toCreditNoteEngineData(cnData({}), config({ statutoryProfileKey: 'gcc_tax_invoice' }));
    expect(out.meta.some((m) => m.label.en === 'Place of Supply:')).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/pdf/engine/adapters/inGstStatutoryMeta.render.test.ts` — Expected: FAIL (`statutoryProfileKey` not on config type; adapter appends nothing).

- [ ] **Step 6: Implement the config field + adapter wiring**

In `src/lib/pdf/templateConfig.ts` add the optional field to both `TemplateConfigOverride` and `DocumentTemplateConfig`:

```typescript
  /** Resolved DocumentComplianceProfile key (set by countryTemplateOverride).
   *  Drives regime-owned statutory meta injection in the financial adapters. */
  statutoryProfileKey?: string;
```

In `src/lib/pdf/engine/countryConfig.ts` `countryTemplateOverride` (after the title block, `countryConfig.ts:81`):

```typescript
  if (compliance) {
    override.statutoryProfileKey = compliance.profile.key;
  }
```

In `src/lib/pdf/engine/adapters/creditNoteAdapter.ts`, after the `meta` array is built (`creditNoteAdapter.ts:124`), append the dispatcher rows (state code is the GSTIN prefix — already on the snapshot; state name from `buyer_address.state`):

```typescript
import { resolveStatutoryDocumentMeta } from '../../../regimes/in_gst/statutoryMeta';
// ...after meta.push(...) block:
const buyerGstin = creditNoteData.buyer_tax_number ?? '';
const posCode = /^\d{2}/.test(buyerGstin) ? buyerGstin.slice(0, 2) : null;
const posName = (creditNoteData.buyer_address?.state as string | undefined) ?? null;
for (const row of resolveStatutoryDocumentMeta(config.statutoryProfileKey ?? '', {
  placeOfSupplyStateName: posName,
  placeOfSupplyStateCode: posCode,
  reverseCharge: creditNoteData.reverse_charge ?? false,
  billingAddress: (creditNoteData.buyer_address?.address as string | undefined) ?? null,
  deliveryAddress: (creditNoteData.buyer_address?.delivery_address as string | undefined) ?? null,
})) {
  meta.push({ label: { en: row.label.en, ar: '' }, value: row.value });
}
```

Apply the identical block in `src/lib/pdf/engine/adapters/invoiceAdapter.ts` where its `meta` array is assembled, reading the invoice snapshot's `buyer_tax_number` / `buyer_address` fields (same shape, verified on `InvoiceData`).

- [ ] **Step 7: Run tests, verify pass**

Run: `npx vitest run src/lib/pdf/engine/adapters/inGstStatutoryMeta.render.test.ts src/lib/pdf/engine/adapters/creditNoteAdapter.test.ts src/lib/pdf/engine/adapters/invoiceAdapter.compliance.test.ts` — Expected: all passed (GCC/generic goldens unchanged — the dispatcher returns `[]` for their profile keys).

- [ ] **Step 8: Commit**

```bash
git add src/lib/regimes/in_gst/statutoryMeta.ts src/lib/regimes/in_gst/statutoryMeta.test.ts src/lib/pdf/engine/countryConfig.ts src/lib/pdf/templateConfig.ts src/lib/pdf/engine/adapters/invoiceAdapter.ts src/lib/pdf/engine/adapters/creditNoteAdapter.ts src/lib/pdf/engine/adapters/inGstStatutoryMeta.render.test.ts
git commit -m "feat(regimes): India Rule-46 statutory meta (place of supply, reverse charge, ship-to) wired via profile-keyed dispatcher"
```

---

### Task S4.4: SAC line-item defaults seeded at IN provisioning (tenant-level, never global catalog)

**Files:**
- Create: `src/lib/regimes/in_gst/sacDefaults.ts`
- Create: `src/lib/regimes/in_gst/sacDefaults.test.ts`

**Interfaces:**
- Consumes: `validateHsnSac` from `src/lib/regimes/in_gst/hsn.ts` (Task S4.1); `supabase` from `src/lib/supabaseClient`; `company_settings.metadata` jsonb (tenant-scoped settings blob, the same store used for `table_columns` in v1.2.0 — NOT `catalog_*`).
- Produces: `INDIA_SAC_DEFAULTS`, `resolveLineItemSac(metadata, override): string`, `buildIndiaSacMetadataPatch(): Record<string, unknown>`, `seedIndiaSacDefaults(tenantId): Promise<void>` — consumed by the line-item form's SAC picker default and by IN provisioning (WP-L2 wires the provisioning call; S4 applies it to the S2 test tenant).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/sacDefaults.test.ts
import { describe, it, expect } from 'vitest';
import {
  INDIA_SAC_DEFAULTS, resolveLineItemSac, buildIndiaSacMetadataPatch,
} from './sacDefaults';
import { validateHsnSac } from './hsn';

describe('India SAC line-item defaults (tenant metadata, not global catalog)', () => {
  it('defaults to data-recovery SAC 998319, offers 998713 as selectable', () => {
    expect(INDIA_SAC_DEFAULTS.default).toBe('998319');
    expect(INDIA_SAC_DEFAULTS.selectable).toEqual(['998319', '998713']);
  });

  it('every seeded SAC is a valid 6-digit code', () => {
    for (const code of INDIA_SAC_DEFAULTS.selectable) {
      expect(validateHsnSac(code).ok).toBe(true);
    }
  });

  it('buildIndiaSacMetadataPatch nests under an in_gst namespace (no catalog write)', () => {
    expect(buildIndiaSacMetadataPatch()).toEqual({
      in_gst: { sac_defaults: { default: '998319', selectable: ['998319', '998713'] } },
    });
  });

  it('resolveLineItemSac: explicit override wins, else tenant default, else hard default', () => {
    const meta = { in_gst: { sac_defaults: { default: '998319', selectable: ['998319', '998713'] } } };
    expect(resolveLineItemSac(meta, '998713')).toBe('998713');
    expect(resolveLineItemSac(meta, null)).toBe('998319');
    expect(resolveLineItemSac({}, null)).toBe('998319');
    expect(resolveLineItemSac(null, undefined)).toBe('998319');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/sacDefaults.test.ts`
Expected: FAIL — `Cannot find module './sacDefaults'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/in_gst/sacDefaults.ts
// India SAC line-item defaults. DECIDED (spec §4-S4): SAC codes are tenant-level
// line-item defaults stored in company_settings.metadata at IN provisioning — never
// rows on the global catalog_* tables (which are shared across all tenants). 998319
// = "Other information technology services n.e.c." (data recovery); 998713 =
// "Maintenance and repair of computers and peripheral equipment" (physical media).
import { supabase } from '../../supabaseClient';

export const INDIA_SAC_DEFAULTS = {
  default: '998319',
  selectable: ['998319', '998713'] as const,
} as const;

export function buildIndiaSacMetadataPatch(): Record<string, unknown> {
  return {
    in_gst: {
      sac_defaults: {
        default: INDIA_SAC_DEFAULTS.default,
        selectable: [...INDIA_SAC_DEFAULTS.selectable],
      },
    },
  };
}

export function resolveLineItemSac(
  metadata: Record<string, unknown> | null | undefined,
  override: string | null | undefined,
): string {
  if (override && override.trim()) return override.trim();
  const inGst = (metadata?.in_gst as Record<string, unknown> | undefined) ?? undefined;
  const sac = (inGst?.sac_defaults as { default?: string } | undefined) ?? undefined;
  return sac?.default ?? INDIA_SAC_DEFAULTS.default;
}

/** Seed the SAC defaults into the tenant's company_settings.metadata (idempotent
 *  merge — never clobbers sibling metadata keys). Called by IN provisioning (L2)
 *  and, in this WP, applied to the S2 IN test tenant during verification. */
export async function seedIndiaSacDefaults(tenantId: string): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from('company_settings')
    .select('id, metadata')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (readErr) throw readErr;
  const metadata = { ...((row?.metadata as Record<string, unknown> | null) ?? {}), ...buildIndiaSacMetadataPatch() };
  const { error: writeErr } = await supabase
    .from('company_settings')
    .update({ metadata })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  if (writeErr) throw writeErr;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/sacDefaults.test.ts` — Expected: all passed.

- [ ] **Step 5: Apply to the S2 IN test tenant + verify (read-only confirm)**

Using Supabase MCP `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`), merge the patch onto the IN test tenant's `company_settings.metadata` and confirm:

```sql
UPDATE company_settings cs
SET metadata = COALESCE(cs.metadata, '{}'::jsonb)
  || '{"in_gst":{"sac_defaults":{"default":"998319","selectable":["998319","998713"]}}}'::jsonb
WHERE cs.tenant_id = (SELECT id FROM tenants WHERE metadata->>'is_in_test_tenant' = 'true' OR name ILIKE '%india test%' LIMIT 1)
  AND cs.deleted_at IS NULL;

SELECT tenant_id, metadata->'in_gst'->'sac_defaults' AS sac_defaults
FROM company_settings
WHERE metadata ? 'in_gst';
```

Expected: one row, `sac_defaults = {"default":"998319","selectable":["998319","998713"]}`. (No `catalog_*` write — confirms the tenant-level decision.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/regimes/in_gst/sacDefaults.ts src/lib/regimes/in_gst/sacDefaults.test.ts
git commit -m "feat(regimes): India SAC line-item defaults in tenant metadata (998319 default, 998713 selectable) — no global catalog rows"
```

---

### Task S4.5: Amount-in-words hook (scale-keyed dispatch; L1 implements the Indian speller)

**Files:**
- Modify: `src/lib/pdf/engine/amountInWords.ts` (add `numberToWordsEnIndian` hook stub + `formatAmountWordsForScale` dispatch beside `numberToWordsEn` at `amountInWords.ts:34`)
- Test: `src/lib/pdf/engine/amountInWordsHook.test.ts`

**Interfaces:**
- Consumes: `amountInWordsEn` from `src/lib/pdf/engine/amountInWords.ts` (`amountInWords.ts:59`); `ScaleSystem` from `src/lib/regimes/types.ts` (`types.ts:29`).
- Produces: `numberToWordsEnIndian(value: number): string | null` (hook — returns `null` until WP-L1 supplies the lakh/crore body) and `formatAmountWordsForScale(amount, currency, decimals, scale): string | null` — consumed by the invoice adapter's amount-in-words region (`invoiceAdapter.ts:271`) and by WP-L1. **WP-L1 Task L1.3 REPLACES this `numberToWordsEnIndian` stub in place — same module (`src/lib/pdf/engine/amountInWords.ts`), same `string | null` signature — so there is one owner and no duplicate export; every caller here (`formatAmountWordsForScale` and, through it, the Rule-46 profile render path) already null-guards the result, so L1's swap from always-null to a real speller is transparent.**

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/pdf/engine/amountInWordsHook.test.ts
import { describe, it, expect } from 'vitest';
import { formatAmountWordsForScale, numberToWordsEnIndian } from './amountInWords';

describe('amount-in-words scale hook (WP-S4 defines, WP-L1 implements indian)', () => {
  it("western scale spells normally with currency + cheque-style minor", () => {
    expect(formatAmountWordsForScale(1180.5, '₹', 2, 'western'))
      .toBe('₹ One Thousand One Hundred Eighty and 50/100 only');
  });

  it("indian scale returns null until WP-L1 implements numberToWordsEnIndian (honest-degrade — render omits the line, never prints western grouping on an Indian doc)", () => {
    expect(numberToWordsEnIndian(105000)).toBeNull();
    expect(formatAmountWordsForScale(105000, '₹', 2, 'indian')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/pdf/engine/amountInWordsHook.test.ts`
Expected: FAIL — `formatAmountWordsForScale`/`numberToWordsEnIndian` are not exported.

- [ ] **Step 3: Minimal implementation** — append to `src/lib/pdf/engine/amountInWords.ts`:

```typescript
import type { ScaleSystem } from '../../regimes/types';

/**
 * HOOK (defined by WP-S4, implemented in place by WP-L1 Task L1.3 — same module,
 * same `string | null` signature, no second export): spell a whole number in Indian
 * English (lakh/crore grouping). Returns null until L1 supplies the body, so a
 * render path OMITS the words line rather than printing western grouping on an
 * Indian statutory document. L1 flips this to a non-null grammatically-complete
 * speller and updates amountInWordsHook.test.ts accordingly.
 */
export function numberToWordsEnIndian(_value: number): string | null {
  return null;
}

/** Scale-keyed amount-in-words dispatch. 'western' → the existing speller;
 *  'indian' → the L1 hook (null until implemented). Keyed on format.amount_words_scale. */
export function formatAmountWordsForScale(
  amount: number, currency: string, decimals: number, scale: ScaleSystem,
): string | null {
  if (scale === 'indian') {
    const whole = Math.floor(Math.abs(amount));
    const words = numberToWordsEnIndian(whole);
    if (words === null) return null;
    const factor = 10 ** decimals;
    const minor = Math.round((Math.abs(amount) - whole) * factor);
    const minorPart = decimals > 0 && minor > 0 ? ` and ${String(minor).padStart(decimals, '0')}/${factor}` : '';
    return `${currency ? `${currency} ` : ''}${words}${minorPart} only`;
  }
  return amountInWordsEn(amount, currency, decimals);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/pdf/engine/amountInWordsHook.test.ts src/lib/pdf/engine/amountInWords.test.ts` — Expected: all passed (existing western speller suite unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/amountInWords.ts src/lib/pdf/engine/amountInWordsHook.test.ts
git commit -m "feat(pdf): amount-in-words scale hook (numberToWordsEnIndian stub + formatAmountWordsForScale) — L1 implements Indian grouping"
```

---

### Task S4.6: India credit notes — per-head negative `document_tax_lines`, original-invoice-ref block, FY series, 30-Nov guard

**Files:**
- Create: `src/lib/regimes/in_gst/creditNote.ts`
- Create: `src/lib/regimes/in_gst/creditNote.test.ts`
- Modify: `src/lib/pdf/dataFetcher.ts` (`fetchCreditNoteData`, `dataFetcher.ts:736` — also fetch the original invoice's `invoice_date`; `dataFetcher.ts:796` — pass through the fetched `tax_lines`)
- Modify: `src/lib/pdf/engine/adapters/creditNoteAdapter.ts` (`creditNoteAdapter.ts:148-159` — render per-head rows from `tax_lines` rollups when present; `creditNoteAdapter.ts:119-121` — strengthen the original-invoice-ref meta into a "Revision of Tax Invoice: {no} dt {date}" block)
- Modify: `src/lib/pdf/types.ts` (`CreditNoteData`, `types.ts:555` — add optional `invoice_date?: string | null`)
- Test: `src/lib/pdf/engine/adapters/creditNoteAdapter.inGst.test.ts`

**Interfaces:**
- Consumes: `computeDocumentTotals`, `persistDocumentTaxLines` from `src/lib/taxDocumentService.ts` (`taxDocumentService.ts:141,177`); `issueCreditNote` / `CreditNoteInput` / `CreditNoteItemInput` from `src/lib/creditNoteService.ts` (`creditNoteService.ts:43`); `TaxComputation` from `src/lib/regimes/types.ts`; `DocumentTaxLine` / `CreditNoteData` from `src/lib/pdf/types.ts` (`types.ts:543`, already carries `tax_lines`, `invoice_number`, `reverse_charge`); `RateContext` from `src/lib/currencyService`.
- Produces: `negateComputation(c: TaxComputation): TaxComputation`, `assertOriginalInvoiceRef(input): void` (block), `checkCreditNoteCutoff(creditNoteDate, fyEndYear): { warn: boolean; message: string | null }` (30-Nov), `issueIndiaCreditNote(input, items, rc): Promise<{ creditNoteId: string; computation: TaxComputation }>` — consumed by the credit-note UI and WP-S7's CA-package credit-note render.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/creditNote.test.ts
import { describe, it, expect } from 'vitest';
import { negateComputation, assertOriginalInvoiceRef, checkCreditNoteCutoff } from './creditNote';
import type { TaxComputation } from '../types';

const comp = (): TaxComputation => ({
  lines: [
    { lineItemId: 'l1', componentCode: 'CGST', componentLabel: 'CGST', jurisdictionRef: null, rate: 9, taxableBase: 1000, taxAmount: 90, taxTreatment: 'standard', treatmentReasonCode: null, sequence: 1 },
  ],
  rollups: [
    { lineItemId: null, componentCode: 'CGST', componentLabel: 'CGST', jurisdictionRef: null, rate: 9, taxableBase: 1000, taxAmount: 90, taxTreatment: 'standard', treatmentReasonCode: null, sequence: 1 },
    { lineItemId: null, componentCode: 'SGST', componentLabel: 'SGST', jurisdictionRef: null, rate: 9, taxableBase: 1000, taxAmount: 90, taxTreatment: 'standard', treatmentReasonCode: null, sequence: 2 },
  ],
  totals: { taxableBase: 1000, taxTotal: 180, grandTotal: 1180, roundingAdjustment: null },
  expectedWithholding: null, notations: [],
  trace: { regimeKey: 'in_gst', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'split_by_place_of_supply', steps: [] },
});

describe('negateComputation (per-head reversal)', () => {
  it('negates every line/rollup amount and the totals — heads stay equal and paired', () => {
    const n = negateComputation(comp());
    expect(n.rollups.map((r) => r.taxAmount)).toEqual([-90, -90]);
    expect(n.rollups[0].taxableBase).toBe(-1000);
    expect(n.lines[0].taxAmount).toBe(-90);
    expect(n.totals).toEqual({ taxableBase: -1000, taxTotal: -180, grandTotal: -1180, roundingAdjustment: null });
    // component identity/labels/sequence preserved (only signs flip)
    expect(n.rollups.map((r) => r.componentCode)).toEqual(['CGST', 'SGST']);
    expect(n.trace.regimeKey).toBe('in_gst');
  });
});

describe('assertOriginalInvoiceRef (r.53 block requirement)', () => {
  it('throws when the credit note has no original invoice reference', () => {
    expect(() => assertOriginalInvoiceRef({ invoice_id: null })).toThrow(/original tax invoice/i);
    expect(() => assertOriginalInvoiceRef({ invoice_id: '' })).toThrow(/original tax invoice/i);
  });
  it('passes when an original invoice is referenced', () => {
    expect(() => assertOriginalInvoiceRef({ invoice_id: 'inv-1' })).not.toThrow();
  });
});

describe('checkCreditNoteCutoff (30-Nov following FY, s.34(2))', () => {
  it('warns when issued after 30 Nov of the year following the supply FY', () => {
    // supply FY 2024-25 (ends 2025-03-31) → cutoff 2025-11-30
    expect(checkCreditNoteCutoff('2025-12-01', 2025).warn).toBe(true);
    expect(checkCreditNoteCutoff('2025-12-01', 2025).message).toContain('30 Nov');
  });
  it('does not warn on or before the cutoff', () => {
    expect(checkCreditNoteCutoff('2025-11-30', 2025).warn).toBe(false);
    expect(checkCreditNoteCutoff('2025-06-10', 2025).warn).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/creditNote.test.ts`
Expected: FAIL — `Cannot find module './creditNote'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/in_gst/creditNote.ts
// India credit notes end-to-end (CGST s.34 + Rule 53). Three statutory obligations
// the generic credit-note path does not carry:
//   1. per-head NEGATIVE document_tax_lines (CGST/SGST or IGST reversal) so GSTR-3B/1
//      net correctly (WP-S6 reads these) — computed via the kernel, then negated;
//   2. reference to the ORIGINAL tax invoice number+date (r.53 block requirement);
//   3. the s.34(2) 30-Nov-following-FY declaration cutoff (a WARN, not a block —
//      a late credit note is still a valid commercial document, just not GSTR-adjustable).
// The FY credit-note series is consumed from the WP-S1b master_numbering_policies
// row (issue_credit_note mints the number) — this WP adds no numbering rows.
import { computeDocumentTotals, persistDocumentTaxLines } from '../../taxDocumentService';
import { issueCreditNote, type CreditNoteInput, type CreditNoteItemInput } from '../../creditNoteService';
import type { RateContext } from '../../currencyService';
import type { TaxComputation } from '../types';

export function negateComputation(c: TaxComputation): TaxComputation {
  const flip = <T extends { taxableBase: number; taxAmount: number }>(l: T): T =>
    ({ ...l, taxableBase: -l.taxableBase, taxAmount: -l.taxAmount });
  return {
    ...c,
    lines: c.lines.map(flip),
    rollups: c.rollups.map(flip),
    totals: {
      taxableBase: -c.totals.taxableBase,
      taxTotal: -c.totals.taxTotal,
      grandTotal: -c.totals.grandTotal,
      roundingAdjustment: c.totals.roundingAdjustment == null ? null : -c.totals.roundingAdjustment,
    },
  };
}

export function assertOriginalInvoiceRef(input: { invoice_id: string | null | undefined }): void {
  if (!input.invoice_id || !input.invoice_id.trim()) {
    throw new Error('An India credit note must reference the original tax invoice (Rule 53).');
  }
}

/** s.34(2): the declaration cutoff is 30 Nov of the year FOLLOWING the supply FY.
 *  `fyEndYear` = calendar year the supply FY ends (FY 2024-25 → 2025). */
export function checkCreditNoteCutoff(
  creditNoteDate: string, fyEndYear: number,
): { warn: boolean; message: string | null } {
  const cutoff = `${fyEndYear}-11-30`;
  if (creditNoteDate > cutoff) {
    return {
      warn: true,
      message: `Issued after 30 Nov ${fyEndYear} — beyond the s.34(2) cutoff; this credit note cannot be declared in GSTR-1/3B (commercial credit only). Consult your CA.`,
    };
  }
  return { warn: false, message: null };
}

/** Issue an India credit note: validate the r.53 original-invoice ref, mint via
 *  issue_credit_note (consumes the FY CN series), then compute per-head tax through
 *  the kernel as a credit_note document and persist the NEGATED rollups so the
 *  ledger and returns net. Returns the computation for the render/CA-package path. */
export async function issueIndiaCreditNote(
  input: CreditNoteInput, items: CreditNoteItemInput[], rc: RateContext,
): Promise<{ creditNoteId: string; computation: TaxComputation }> {
  assertOriginalInvoiceRef({ invoice_id: input.invoice_id });
  const cn = await issueCreditNote(input, items);
  const creditNoteId = (cn as { id: string }).id;
  const { computation } = await computeDocumentTotals(
    {
      items: items.map((it) => ({
        description: it.description ?? '', quantity: it.quantity ?? 1,
        unit_price: it.unit_price ?? 0, discount_percent: 0,
      })),
      discountType: null, discountAmount: 0, taxRate: input.tax_rate ?? 0,
      documentType: 'credit_note', documentDate: new Date().toISOString().slice(0, 10),
    },
    rc,
  );
  const negated = negateComputation(computation);
  await persistDocumentTaxLines({
    tenantId: (cn as { tenant_id: string }).tenant_id,
    documentType: 'credit_note', documentId: creditNoteId,
    computation: negated, rc,
  });
  return { creditNoteId, computation: negated };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/creditNote.test.ts` — Expected: all passed.

- [ ] **Step 5: Write the CN render test (per-head rows + original-invoice block)**

```typescript
// src/lib/pdf/engine/adapters/creditNoteAdapter.inGst.test.ts
import { describe, it, expect } from 'vitest';
import { toCreditNoteEngineData } from './creditNoteAdapter';
import type { CreditNoteDocumentData, DocumentTaxLine } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';

const rollups: DocumentTaxLine[] = [
  { line_item_id: null, component_code: 'CGST', component_label: 'CGST', rate: 9, taxable_base: -1000, tax_amount: -90, tax_treatment: 'standard', treatment_reason_code: null, sequence: 1, backfilled: false, rule_trace: null },
  { line_item_id: null, component_code: 'SGST', component_label: 'SGST', rate: 9, taxable_base: -1000, tax_amount: -90, tax_treatment: 'standard', treatment_reason_code: null, sequence: 2, backfilled: false, rule_trace: null },
];

const config: DocumentTemplateConfig = {
  sections: [{ key: 'lineItems', columns: [] }, { key: 'totals', lines: {} }],
  statutoryProfileKey: 'in_gst_invoice',
} as DocumentTemplateConfig;

const data: CreditNoteDocumentData = {
  creditNoteData: {
    credit_note_number: 'CN/25-26/0001', credit_note_date: '2026-05-10',
    credit_type: 'adjustment', status: 'issued', reason_code: 'price_revision', reason_notes: null,
    subtotal: -1000, tax_rate: 18, tax_amount: -180, total_amount: -1180, applied_amount: 0,
    invoice_number: 'INV/25-26/0007', invoice_date: '2026-04-02',
    customer_name: 'Acme', company_name: null, case_no: null,
    currency_symbol: '₹', currency_position: 'before', decimal_places: 2, items: [],
    buyer_tax_number: '27ABCDE1234F1Z5', buyer_address: { state: 'Maharashtra' },
    reverse_charge: false, tax_lines: rollups,
  },
  companySettings: { basic_info: {} } as CreditNoteDocumentData['companySettings'],
};

describe('India credit-note render', () => {
  it('renders one totals row per stored NEGATIVE head rollup (never the single header scalar)', () => {
    const out = toCreditNoteEngineData(data, config);
    const taxRows = (out.totals ?? []).filter((t) => t.label.en === 'CGST' || t.label.en === 'SGST');
    expect(taxRows.map((t) => t.value)).toEqual(['-₹90.00', '-₹90.00'].map((_, i) => taxRows[i].value)); // both present
    expect(taxRows.length).toBe(2);
  });

  it('carries an original tax invoice reference block with number AND date (r.53)', () => {
    const out = toCreditNoteEngineData(data, config);
    const ref = out.meta.find((m) => m.label.en.startsWith('Revision of Tax Invoice'));
    expect(ref?.value).toContain('INV/25-26/0007');
    expect(ref?.value).toContain('2026-04-02');
  });
});
```

- [ ] **Step 6: Implement the fetcher + adapter changes**

In `src/lib/pdf/types.ts` add `invoice_date?: string | null;` to `CreditNoteData` (after `invoice_number`, `types.ts:555`).

In `src/lib/pdf/dataFetcher.ts` `fetchCreditNoteData`: change the original-invoice fetch at `dataFetcher.ts:736` to `select('invoice_number, invoice_date')`, and add `invoice_date: invoice?.invoice_date ?? null` to the returned `creditNoteData` object (`dataFetcher.ts:776`). `tax_lines` already flows through (`dataFetcher.ts:796`).

In `src/lib/pdf/engine/adapters/creditNoteAdapter.ts`:
- Replace the single-header tax push (`creditNoteAdapter.ts:149-159`) with per-head rendering when rollups exist:

```typescript
  const rollups = (creditNoteData.tax_lines ?? []).filter((l) => l.line_item_id === null);
  if (on('tax') && rollups.length > 0) {
    for (const r of rollups) {
      totals.push({ key: 'tax', label: { en: r.component_label, ar: '' }, value: money(r.tax_amount) });
    }
  } else if (on('tax') && (creditNoteData.tax_amount ?? 0) !== 0) {
    const rate = creditNoteData.tax_rate != null ? ` ${creditNoteData.tax_rate}%` : '';
    totals.push({ key: 'tax', label: { en: `${tLabels.tax ?? 'Tax'}${rate}:`, ar: `ضريبة${rate}:` }, value: money(creditNoteData.tax_amount ?? 0) });
  }
```

- Replace the "Against Invoice" meta row (`creditNoteAdapter.ts:119-121`) with the r.53 revision block carrying number + date:

```typescript
  if (creditNoteData.invoice_number) {
    const dt = creditNoteData.invoice_date ? ` dt ${creditNoteData.invoice_date}` : '';
    meta.push({ label: { en: 'Revision of Tax Invoice:', ar: 'مقابل الفاتورة:' }, value: `${creditNoteData.invoice_number}${dt}` });
  }
```

- [ ] **Step 7: Run tests, verify pass**

Run: `npx vitest run src/lib/pdf/engine/adapters/creditNoteAdapter.inGst.test.ts src/lib/pdf/engine/adapters/creditNoteAdapter.test.ts` — Expected: all passed (the non-India CN golden falls into the `else` header-scalar branch, unchanged).

- [ ] **Step 8: Commit**

```bash
git add src/lib/regimes/in_gst/creditNote.ts src/lib/regimes/in_gst/creditNote.test.ts src/lib/pdf/dataFetcher.ts src/lib/pdf/engine/adapters/creditNoteAdapter.ts src/lib/pdf/engine/adapters/creditNoteAdapter.inGst.test.ts src/lib/pdf/types.ts
git commit -m "feat(regimes): India credit notes — per-head negative tax lines, r.53 original-invoice block, s.34(2) 30-Nov cutoff"
```

---

### Task S4.7: Wholly-exempt Bill-of-Supply guard + two-document goods guidance banner

**Files:**
- Create: `src/lib/regimes/in_gst/documentGuards.ts`
- Create: `src/lib/regimes/in_gst/documentGuards.test.ts`
- Create: `src/components/regimes/in_gst/IndiaDocumentGuidance.tsx`
- Test: `src/components/regimes/in_gst/IndiaDocumentGuidance.test.tsx`

**Interfaces:**
- Consumes: `DocumentTaxLine` from `src/lib/pdf/types.ts`; `RequirementFailure` from `src/lib/taxDocumentService.ts` (`taxDocumentService.ts:28`).
- Produces: `whollyExemptGuard(rollups): RequirementFailure | null` (block — Bill of Supply, Rule 49) and `goodsInHandoverGuidance(lineKinds): { show: boolean; message: string } | null` (guidance banner, two-document flow) — consumed by the issue dry-run panel and the case delivery/handover surface; `IndiaDocumentGuidance` React banner renders them.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/documentGuards.test.ts
import { describe, it, expect } from 'vitest';
import { whollyExemptGuard, goodsInHandoverGuidance } from './documentGuards';
import type { DocumentTaxLine } from '../../pdf/types';

const line = (treatment: string): DocumentTaxLine => ({
  line_item_id: 'l', component_code: 'GST', component_label: 'GST', rate: 0,
  taxable_base: 100, tax_amount: 0, tax_treatment: treatment, treatment_reason_code: null,
  sequence: 1, backfilled: false, rule_trace: null,
});

describe('whollyExemptGuard (Rule 49 Bill of Supply)', () => {
  it('BLOCKS a tax-invoice issue when every line is exempt (needs a Bill of Supply, not supported)', () => {
    const f = whollyExemptGuard([line('exempt'), line('exempt')]);
    expect(f?.level).toBe('block');
    expect(f?.field_key).toBe('wholly_exempt_bill_of_supply');
    expect(f?.message).toMatch(/Bill of Supply/i);
    expect(f?.message).toMatch(/consult/i);
  });
  it('passes when any line is taxable', () => {
    expect(whollyExemptGuard([line('exempt'), line('standard')])).toBeNull();
  });
  it('passes on an empty set (no lines yet — nothing to guard)', () => {
    expect(whollyExemptGuard([])).toBeNull();
  });
});

describe('goodsInHandoverGuidance (two-document flow — banner only)', () => {
  it('shows the split-document banner when lab-supplied goods are in the handover', () => {
    const g = goodsInHandoverGuidance(['service', 'goods']);
    expect(g?.show).toBe(true);
    expect(g?.message).toMatch(/separate goods tax invoice/i);
  });
  it('returns null for a services-only document', () => {
    expect(goodsInHandoverGuidance(['service', 'service'])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/documentGuards.test.ts`
Expected: FAIL — `Cannot find module './documentGuards'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/in_gst/documentGuards.ts
// India issue-time guards that are NOT tax math:
//  - Rule 49: a WHOLLY exempt supply legally requires a Bill of Supply, not a tax
//    invoice. xSuite does not ship Bill of Supply this phase (spec §3, §7 ⊕) — so a
//    100%-exempt tax-invoice issue is BLOCKED with a consult-CA message.
//  - Two-document goods flow (spec §4-S4): mixed goods+services jobs are directed to
//    a SEPARATE goods tax invoice via an in-product guidance banner. The automated
//    linked two-document flow is DEFERRED — this is guidance copy only, never a block.
import type { RequirementFailure } from '../../taxDocumentService';
import type { DocumentTaxLine } from '../../pdf/types';

export function whollyExemptGuard(rollups: DocumentTaxLine[]): RequirementFailure | null {
  if (rollups.length === 0) return null;
  const allExempt = rollups.every(
    (l) => l.tax_treatment === 'exempt' || l.tax_treatment === 'zero_rated',
  );
  if (!allExempt) return null;
  return {
    field_key: 'wholly_exempt_bill_of_supply',
    level: 'block',
    message: 'A wholly exempt/nil-rated supply requires a Bill of Supply (Rule 49), which is not supported in this release. Consult your CA before issuing.',
  };
}

export function goodsInHandoverGuidance(
  lineKinds: Array<'service' | 'goods'>,
): { show: boolean; message: string } | null {
  if (!lineKinds.includes('goods')) return null;
  return {
    show: true,
    message: 'This job includes lab-supplied goods (e.g. replacement media). Goods and services must be billed on a separate goods tax invoice — this tax invoice should carry the recovery service (SAC) only.',
  };
}
```

```tsx
// src/components/regimes/in_gst/IndiaDocumentGuidance.tsx
// Renders the India issue-time guidance. Block-level guard (wholly-exempt) uses the
// danger token; the two-document goods note uses the warning token. Semantic tokens
// only (DESIGN.md) — no brand hex, no purple/indigo.
import { AlertTriangle, Info } from 'lucide-react';

interface Props {
  whollyExemptMessage?: string | null;
  goodsGuidanceMessage?: string | null;
}

export function IndiaDocumentGuidance({ whollyExemptMessage, goodsGuidanceMessage }: Props) {
  if (!whollyExemptMessage && !goodsGuidanceMessage) return null;
  return (
    <div className="space-y-2">
      {whollyExemptMessage && (
        <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-muted p-3 text-danger-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-sm">{whollyExemptMessage}</p>
        </div>
      )}
      {goodsGuidanceMessage && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-muted p-3 text-warning-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-sm">{goodsGuidanceMessage}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the component test**

```tsx
// src/components/regimes/in_gst/IndiaDocumentGuidance.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IndiaDocumentGuidance } from './IndiaDocumentGuidance';

describe('IndiaDocumentGuidance', () => {
  it('renders nothing when there is no guidance', () => {
    const { container } = render(<IndiaDocumentGuidance />);
    expect(container.firstChild).toBeNull();
  });
  it('renders both the wholly-exempt block and the goods guidance when present', () => {
    render(<IndiaDocumentGuidance whollyExemptMessage="Needs a Bill of Supply." goodsGuidanceMessage="Bill goods separately." />);
    expect(screen.getByText('Needs a Bill of Supply.')).toBeInTheDocument();
    expect(screen.getByText('Bill goods separately.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/documentGuards.test.ts src/components/regimes/in_gst/IndiaDocumentGuidance.test.tsx` — Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/regimes/in_gst/documentGuards.ts src/lib/regimes/in_gst/documentGuards.test.ts src/components/regimes/in_gst/IndiaDocumentGuidance.tsx src/components/regimes/in_gst/IndiaDocumentGuidance.test.tsx
git commit -m "feat(regimes): India wholly-exempt Bill-of-Supply block guard + two-document goods guidance banner"
```

---

### Task S4.8: `generic_invoice` fallback dev assertion in the profile resolver

**Files:**
- Modify: `src/lib/pdf/engine/profileResolver.ts` (`resolveComplianceRenderInputs`, after building `value` at `profileResolver.ts:96-102`)
- Test: `src/lib/pdf/engine/profileResolver.devAssertion.test.ts`

**Interfaces:**
- Consumes: `resolveDocumentProfile` from `src/lib/regimes/registry.ts`; `ComplianceRenderInputs` (`profileResolver.ts:16`). Reads the DECLARED `regime.documents` key vs the RESOLVED `profile.key`.
- Produces: `assertProfileResolved(declaredKey: string, resolved: DocumentComplianceProfile, sellerRegistered: boolean): void` (exported for the test) — a dev-only hard failure when a registered seller's declared non-generic profile silently fell back to `generic_invoice`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/pdf/engine/profileResolver.devAssertion.test.ts
import { describe, it, expect } from 'vitest';
import { assertProfileResolved } from './profileResolver';
import { registerAllRegimePlugins } from '../../regimes/register';
import { resolveDocumentProfile } from '../../regimes/registry';

registerAllRegimePlugins();
const generic = resolveDocumentProfile('generic_invoice');
const inGst = resolveDocumentProfile('in_gst_invoice');

describe('assertProfileResolved (honest-degrade dev assertion)', () => {
  it('THROWS when a registered seller declared a non-generic profile that fell back to generic_invoice', () => {
    expect(() => assertProfileResolved('in_gst_invoice', generic, true))
      .toThrow(/in_gst_invoice.*generic_invoice/i);
  });
  it('does not throw when the declared profile actually resolved', () => {
    expect(() => assertProfileResolved('in_gst_invoice', inGst, true)).not.toThrow();
  });
  it('does not throw when the country genuinely declares generic_invoice', () => {
    expect(() => assertProfileResolved('generic_invoice', generic, true)).not.toThrow();
  });
  it('does not throw for an unregistered seller (no ceremony expected)', () => {
    expect(() => assertProfileResolved('in_gst_invoice', generic, false)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/pdf/engine/profileResolver.devAssertion.test.ts`
Expected: FAIL — `assertProfileResolved` is not exported.

- [ ] **Step 3: Minimal implementation** — in `src/lib/pdf/engine/profileResolver.ts`:

```typescript
import type { DocumentComplianceProfile } from '../../regimes/types';

/** Honest-degrade dev assertion (spec §4-S4, moved here from L2 so it never fires
 *  before in_gst_invoice exists): a registered seller whose country DECLARED a
 *  non-generic documents profile that silently fell back to generic_invoice means
 *  the declared plugin is not registered — a misconfiguration, not a valid render.
 *  Throws in dev/test; warns in prod (never crashes a customer's document). */
export function assertProfileResolved(
  declaredKey: string, resolved: DocumentComplianceProfile, sellerRegistered: boolean,
): void {
  const fellBack = declaredKey !== 'generic_invoice' && resolved.key === 'generic_invoice';
  if (fellBack && sellerRegistered) {
    const msg =
      `Compliance profile "${declaredKey}" is declared for this registered tenant but ` +
      `resolved to "generic_invoice" — its regime plugin is not registered.`;
    if (import.meta.env.MODE !== 'production') throw new Error(msg);
    console.error(`[profileResolver] ${msg}`);
  }
}
```

Call it just before caching `value` (`profileResolver.ts:102`):

```typescript
  assertProfileResolved(profileKey, value.profile, value.sellerRegistered);
  cache = { at: Date.now(), value };
  return value;
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/pdf/engine/profileResolver.devAssertion.test.ts src/lib/pdf/engine/profileResolver.test.ts` — Expected: all passed (existing resolver tests declare `generic_invoice` or register their profile, so the assertion is inert for them).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/profileResolver.ts src/lib/pdf/engine/profileResolver.devAssertion.test.ts
git commit -m "feat(pdf): dev assertion — registered tenant's declared profile falling back to generic_invoice is a hard failure"
```

---

### Task S4.9: Quote per-head GST acceptance — screen + PDF render the CGST/SGST (or IGST) rows

**Files:**
- Test: `src/hooks/useDocumentCompliance.inGst.test.tsx`
- Test: `src/lib/pdf/engine/adapters/quoteAdapter.inGst.test.ts`

**Interfaces:**
- Consumes: `useDocumentCompliance` from `src/hooks/useDocumentCompliance.ts` (`useDocumentCompliance.ts:45`, maps `document_tax_lines` rollups → `taxRows` by `component_label` at `useDocumentCompliance.ts:80-86`); `toQuoteEngineData` from `src/lib/pdf/engine/adapters/quoteAdapter.ts`; `inGstInvoiceProfile` (Task S4.2). No production code change expected — the split-mode rollups from WP-S3 already flow through both surfaces; this task PINS the acceptance so a regression cannot silently blend the heads.
- Produces: two pinning tests (the GA dry-run's quote-approval step depends on them).

- [ ] **Step 1: Write the screen-surface pin (mock the tax-line rollups)**

```tsx
// src/hooks/useDocumentCompliance.inGst.test.tsx
// Acceptance (spec §4-S4): the IN quote surface renders per-head GST rows on SCREEN.
// The hook maps document_tax_lines rollups → taxRows by component_label; for India
// the in_gst strategy (WP-S3) emits CGST + SGST (intra-state) or IGST (inter-state),
// so the panel shows two/one head rows, never a single blended 'GST 18%' row.
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../lib/pdf/engine/profileResolver', () => ({
  resolveComplianceRenderInputs: async () => ({
    facts: { code: 'IN', taxSystem: 'GST', taxLabel: 'GST', taxNumberLabel: 'GSTIN', taxInvoiceRequired: true, languageCode: 'en', decimalPlaces: 2, dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3;2', einvoiceRegimeKey: 'no_einvoice' },
    profile: (await import('../lib/regimes/in_gst/documents')).inGstInvoiceProfile,
    sellerRegistered: true, sellerTaxNumber: '27ABCDE1234F1Z5',
  }),
}));
vi.mock('../lib/pdf/dataFetcher', () => ({
  fetchDocumentTaxLines: async () => ([
    { line_item_id: null, component_code: 'CGST', component_label: 'CGST', rate: 9, taxable_base: 1000, tax_amount: 90, tax_treatment: 'standard', treatment_reason_code: null, sequence: 1, backfilled: false, rule_trace: null },
    { line_item_id: null, component_code: 'SGST', component_label: 'SGST', rate: 9, taxable_base: 1000, tax_amount: 90, tax_treatment: 'standard', treatment_reason_code: null, sequence: 2, backfilled: false, rule_trace: null },
  ]),
}));

import { useDocumentCompliance } from './useDocumentCompliance';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('IN quote — per-head GST on screen', () => {
  it('renders CGST + SGST rows, not a single blended row', async () => {
    const { result } = renderHook(
      () => useDocumentCompliance('quote', 'quote-1', { taxRate: 18, taxAmount: 180 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.taxRows).toEqual([
      { label: 'CGST', amount: 90 },
      { label: 'SGST', amount: 90 },
    ]);
    expect(result.current.taxBandLabel).toBe('GSTIN');
    expect(result.current.title.en).toBe('Quotation');
  });
});
```

- [ ] **Step 2: Write the PDF-surface pin**

```typescript
// src/lib/pdf/engine/adapters/quoteAdapter.inGst.test.ts
// Acceptance (spec §4-S4): the IN quote PDF renders per-head GST rows. The quote
// adapter maps stored document_tax_lines rollups verbatim (AD-3, no recompute) —
// pin that CGST/SGST land as two distinct totals rows for the in_gst_invoice profile.
import { describe, it, expect } from 'vitest';
import { toQuoteEngineData } from './quoteAdapter';
import type { QuoteDocumentData, DocumentTaxLine } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';

const rollups: DocumentTaxLine[] = [
  { line_item_id: null, component_code: 'CGST', component_label: 'CGST', rate: 9, taxable_base: 1000, tax_amount: 90, tax_treatment: 'standard', treatment_reason_code: null, sequence: 1, backfilled: false, rule_trace: null },
  { line_item_id: null, component_code: 'SGST', component_label: 'SGST', rate: 9, taxable_base: 1000, tax_amount: 90, tax_treatment: 'standard', treatment_reason_code: null, sequence: 2, backfilled: false, rule_trace: null },
];

const config: DocumentTemplateConfig = {
  sections: [{ key: 'lineItems', columns: [] }, { key: 'totals', lines: {} }],
  statutoryProfileKey: 'in_gst_invoice',
} as DocumentTemplateConfig;

const data = {
  quoteData: {
    quote_number: 'QUO/25-26/0003', quote_date: '2026-05-01',
    subtotal: 1000, tax_rate: 18, tax_amount: 180, total_amount: 1180,
    currency_symbol: '₹', currency_position: 'before', decimal_places: 2,
    items: [], tax_lines: rollups,
  },
  companySettings: { basic_info: {} },
} as unknown as QuoteDocumentData;

describe('IN quote — per-head GST on the PDF', () => {
  it('emits CGST and SGST as two distinct totals rows', () => {
    const out = toQuoteEngineData(data, config);
    const heads = (out.totals ?? []).filter((t) => t.label.en === 'CGST' || t.label.en === 'SGST');
    expect(heads.map((h) => h.label.en)).toEqual(['CGST', 'SGST']);
    expect(heads).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the pins**

Run: `npx vitest run src/hooks/useDocumentCompliance.inGst.test.tsx src/lib/pdf/engine/adapters/quoteAdapter.inGst.test.ts`

Expected: the screen pin PASSES (the hook already maps rollups by `component_label`). If the PDF pin FAILS because `quoteAdapter.ts` still renders the single header `tax_amount`, apply the same per-head totals branch used in Task S4.6 Step 6 to `src/lib/pdf/engine/adapters/quoteAdapter.ts` (render one totals row per `tax_lines` rollup when present; fall back to the header scalar otherwise), then re-run to green.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useDocumentCompliance.inGst.test.tsx src/lib/pdf/engine/adapters/quoteAdapter.inGst.test.ts src/lib/pdf/engine/adapters/quoteAdapter.ts
git commit -m "test(regimes): pin IN quote per-head GST acceptance (CGST/SGST rows on screen and PDF)"
```

---

### Task S4.10: WP verification, capability sync run, branch push + PR

**Files:**
- Test: all WP-S4 paths (no new files)

**Interfaces:**
- Consumes: `syncEngineCapabilities` from `src/lib/tax/capabilityManifest.ts`.
- Produces: nothing — the exit gate for the WP.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck` — Expected: 0 errors. (If a stale-column read fails, fix the citing file; do not silence.)

- [ ] **Step 2: Run the full WP suite**

Run:

```bash
npx vitest run src/lib/regimes/in_gst src/lib/tax/capabilityManifest.inGst.test.ts src/lib/pdf/engine/amountInWordsHook.test.ts src/lib/pdf/engine/profileResolver.devAssertion.test.ts src/lib/pdf/engine/adapters/inGstStatutoryMeta.render.test.ts src/lib/pdf/engine/adapters/creditNoteAdapter.inGst.test.ts src/lib/pdf/engine/adapters/quoteAdapter.inGst.test.ts src/hooks/useDocumentCompliance.inGst.test.tsx src/components/regimes/in_gst/IndiaDocumentGuidance.test.tsx
```

Expected: all green.

- [ ] **Step 3: Regression — GCC/generic goldens byte-identical**

Run: `npx vitest run src/lib/pdf/engine/adapters/creditNoteAdapter.test.ts src/lib/pdf/engine/adapters/invoiceAdapter.compliance.test.ts src/lib/pdf/engine/adapters/quoteAdapter.compliance.test.ts src/lib/regimes/gcc_tax_invoice` — Expected: all passed, no snapshot churn (the profile-keyed dispatcher and per-head branch are inert for non-`in_gst_invoice` documents).

- [ ] **Step 4: Sync the code registry to the DB manifest (the profile is registered in code, never hand-seeded)**

Run a one-off against the canonical project to project `in_gst_invoice` into `master_engine_capabilities`, then confirm via Supabase MCP `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
SELECT capability_key, kind, version
FROM master_engine_capabilities
WHERE capability_key = 'in_gst_invoice';
```

Expected: one row `in_gst_invoice | regime_adapter | 1.0.0` (produced by `syncEngineCapabilities()` from the code registry — WP-S7 asserts all four plugin rows present pre-publish).

- [ ] **Step 5: Push the branch**

```bash
git push -u origin feat/india-s4-in-gst-invoice-profile
```

- [ ] **Step 6: Open the PR (owner merges — do NOT merge)**

```bash
gh pr create --base main --head feat/india-s4-in-gst-invoice-profile --title "Phase 4 India Pack — WP-S4: in_gst_invoice profile + India credit notes" --body "$(cat <<'EOF'
## WP-S4 — in_gst_invoice Profile + India Credit Notes (no migration)

Depends on: S1a, S1b, S2, S3.

### What ships
- **`in_gst_invoice` DocumentComplianceProfile** — TAX INVOICE ceremony (registered seller only), GSTIN registration band, forced HSN/SAC + UQC line columns, A4, English-only. Registered in `register.ts` + projected into `master_engine_capabilities` via `syncEngineCapabilities()` (never hand-seeded).
- **HSN/SAC format + UQC helpers** (`hsn.ts`).
- **India Rule-46 statutory meta** — place of supply "State (code)", reverse-charge Yes/No, delivery-address-where-different, r.46(q) signature block — via a profile-keyed dispatcher (`resolveStatutoryDocumentMeta`), wired into the invoice + credit-note adapters. Inert for GCC/generic (goldens byte-identical).
- **SAC line-item defaults** seeded in tenant `company_settings.metadata` at IN provisioning (998319 default, 998713 selectable) — **not** global `catalog_*` rows.
- **Amount-in-words hook** — `numberToWordsEnIndian` stub + `formatAmountWordsForScale` keyed on `format.amount_words_scale`; WP-L1 implements the lakh/crore body.
- **India credit notes end-to-end** — per-head **negative** `document_tax_lines`, r.53 original-tax-invoice reference block (number + date), FY series consumed from the S1b numbering policy, s.34(2) 30-Nov cutoff warning.
- **Wholly-exempt Bill-of-Supply block guard** (Rule 49, consult-CA) + **two-document goods guidance banner** (guidance only; automated linked flow deferred per §7 ⊕).
- **Dev assertion** — a registered tenant whose declared `regime.documents` falls back to `generic_invoice` is a hard failure (moved here from L2 so it never fires before the profile exists).

### Acceptance
- IN test-tenant quote renders **per-head GST** (CGST/SGST or IGST) on **screen and PDF** — pinned (GA dry-run quote-approval step depends on it).

### Verification
- `npm run typecheck` = 0; WP suite green; GCC/generic goldens unchanged; `in_gst_invoice` capability row present via sync.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened against `main`. Owner merges.

**WP-S4 exit:** `npm run typecheck` = 0; every WP-S4 test path green; non-India goldens byte-identical; `in_gst_invoice` present in the code registry and the DB capability manifest; no migration, no DROP/DELETE.

---


## Work Package WP-S5 — `in_fiscal_numbering` [S, no migration]

Branch: `feat/india-s5-in-fiscal-numbering` (cut from `main`)

Depends on: **WP-S1b** (IN `master_numbering_policies` rows — 5 financial scopes, short-form `{FY}`, `max_length 16` — plus the short-form `{FY}` renderer in `get_next_number` v2 / `preview_number_format`; the live renderer captured 2026-07-05 still emits long-form `YYYY-YY`, so S1b's migration owns that change — S5 is no-migration and only *pins* it), **WP-S2** (provisioned IN test tenant — none exists live today; only the OM tenant does), **WP-S4** (spine order: `src/lib/regimes/register.ts` is a serial seam, and `src/lib/regimes/in_gst/` exists from S3).

Scope guard (spec §3 + §4 WP-S5 entry): financial document scopes ONLY — `cases`/`case_devices`/`inventory:*` numbering is untouched. No charset column is added anywhere; charset `[A-Za-z0-9/-]` is client template validation. The only preview fix is `src/lib/inventory/inventorySequenceService.ts:89-97`; `src/pages/settings/SystemNumbers.tsx` is NOT touched (verified: it previews server-side via `preview_number_format`, and its local `formatCurrentNumber` at line 233 takes the whole sequence row — the old-plan claim against it was false).

### Task S5.1: Template render + validation module (`src/lib/numbering/templates.ts`)

**Files:**
- Create: `src/lib/numbering/templates.ts`
- Test: `src/lib/numbering/templates.test.ts`

**Interfaces:**
- Consumes: nothing (pure module; dependency-free). Mirrors the DB `get_next_number` v2 rendering contract (`{FY}` + `{SEQ:n}`, SEQ grows beyond padding — same growth rule as the live `format_sequence_number`), with `{FY}` in the **short form** S1b's renderer emits (`'26-27'`).
- Produces: `fiscalYearLabel(anchor: string, today: Date): string`; `renderNumberTemplate(template: string, value: number, fiscalYearAnchor: string | null, today?: Date): string`; `validateNumberingTemplate(template: string, maxLength: number | null): string[]` — consumed by Tasks S5.2 (plugin self-validation) and S5.3 (inventory preview fix).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/numbering/templates.test.ts
import { describe, it, expect } from 'vitest';
import { fiscalYearLabel, renderNumberTemplate, validateNumberingTemplate } from './templates';

describe('fiscalYearLabel (short form, spec §3)', () => {
  it('renders 26-27 on and after the 04-01 anchor', () => {
    expect(fiscalYearLabel('04-01', new Date(2026, 3, 1))).toBe('26-27');
    expect(fiscalYearLabel('04-01', new Date(2026, 6, 5))).toBe('26-27');
  });

  it('renders 25-26 before the anchor', () => {
    expect(fiscalYearLabel('04-01', new Date(2026, 2, 31))).toBe('25-26');
  });

  it('defaults are calendar-year-like with a 01-01 anchor', () => {
    expect(fiscalYearLabel('01-01', new Date(2026, 0, 1))).toBe('26-27');
  });
});

describe('renderNumberTemplate', () => {
  it('renders INV/{FY}/{SEQ:4} to exactly 14 characters (rule 46(b) headroom)', () => {
    const out = renderNumberTemplate('INV/{FY}/{SEQ:4}', 42, '04-01', new Date(2026, 6, 5));
    expect(out).toBe('INV/26-27/0042');
    expect(out).toHaveLength(14);
  });

  it('grows SEQ beyond the pad width instead of truncating (9999 → 10000)', () => {
    expect(renderNumberTemplate('INV/{FY}/{SEQ:4}', 9999, '04-01', new Date(2026, 6, 5))).toBe('INV/26-27/9999');
    expect(renderNumberTemplate('INV/{FY}/{SEQ:4}', 10000, '04-01', new Date(2026, 6, 5))).toBe('INV/26-27/10000');
  });

  it('throws on a template with no {SEQ:n} token (DB parity: get_next_number RAISEs)', () => {
    expect(() => renderNumberTemplate('INV/{FY}', 1, '04-01', new Date(2026, 6, 5))).toThrow('{SEQ:n}');
  });
});

describe('validateNumberingTemplate (charset as TEMPLATE validation — no charset column)', () => {
  it('accepts the India invoice template', () => {
    expect(validateNumberingTemplate('INV/{FY}/{SEQ:4}', 16)).toEqual([]);
  });

  it('rejects literal characters outside [A-Za-z0-9/-]', () => {
    expect(validateNumberingTemplate('INV#{FY}/{SEQ:4}', 16)).toContainEqual(
      expect.stringContaining('[A-Za-z0-9/-]'),
    );
    expect(validateNumberingTemplate('INV {FY}/{SEQ:4}', 16)).toContainEqual(
      expect.stringContaining('[A-Za-z0-9/-]'),
    );
  });

  it('requires exactly one {SEQ:n} token', () => {
    expect(validateNumberingTemplate('INV/{FY}', 16)).toContainEqual(
      expect.stringContaining('exactly one {SEQ:n}'),
    );
    expect(validateNumberingTemplate('{SEQ:2}/{SEQ:4}', 16)).toContainEqual(
      expect.stringContaining('exactly one {SEQ:n}'),
    );
  });

  it('rejects a template whose minimum rendered length already exceeds max_length', () => {
    // literals 'INVOICE-SERIES//' (16) + FY (5) + pad 4 = 25 > 16
    expect(validateNumberingTemplate('INVOICE-SERIES/{FY}/{SEQ:4}', 16)).toContainEqual(
      expect.stringContaining('max_length'),
    );
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run src/lib/numbering/templates.test.ts` → FAIL: `Cannot find module './templates'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/numbering/templates.ts
//
// Client-side mirror of the DB get_next_number v2 template rendering
// ({FY} + {SEQ:n}). {FY} renders the SHORT fiscal-year form ('26-27') per the
// India Pack spec §3 — matching the S1b DB renderer. SEQ grows beyond its pad
// width (same rule as format_sequence_number); enforcement of the 16-char cap
// is DB-side (get_next_number RAISEs) — validateNumberingTemplate is the
// design-time guard. Rule 46(b) charset [A-Za-z0-9/-] is enforced here as
// TEMPLATE validation: master_numbering_policies has no charset column by design.

export const TEMPLATE_LITERAL_CHARSET = /^[A-Za-z0-9/-]*$/;
const SEQ_TOKEN = /\{SEQ:(\d+)\}/;
const FY_SHORT_LENGTH = 5; // 'YY-YY'

export function fiscalYearLabel(anchor: string, today: Date): string {
  const mmdd =
    `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const startYear = mmdd >= anchor ? today.getFullYear() : today.getFullYear() - 1;
  const yy = (y: number) => String(y % 100).padStart(2, '0');
  return `${yy(startYear)}-${yy(startYear + 1)}`;
}

export function renderNumberTemplate(
  template: string,
  value: number,
  fiscalYearAnchor: string | null,
  today: Date = new Date(),
): string {
  const m = template.match(SEQ_TOKEN);
  if (!m) throw new Error(`format_template must contain {SEQ:n}: "${template}"`);
  const pad = parseInt(m[1], 10);
  const digits = value.toString();
  const seq = digits.length < pad ? digits.padStart(pad, '0') : digits;
  return template
    .replace('{FY}', fiscalYearLabel(fiscalYearAnchor ?? '01-01', today))
    .replace(m[0], seq);
}

export function validateNumberingTemplate(template: string, maxLength: number | null): string[] {
  const errors: string[] = [];
  const seqMatches = template.match(/\{SEQ:\d+\}/g) ?? [];
  if (seqMatches.length !== 1) errors.push('template must contain exactly one {SEQ:n} token');
  const fyMatches = template.match(/\{FY\}/g) ?? [];
  if (fyMatches.length > 1) errors.push('template may contain at most one {FY} token');
  const literals = template.replace(/\{SEQ:\d+\}/g, '').replace(/\{FY\}/g, '');
  if (!TEMPLATE_LITERAL_CHARSET.test(literals)) {
    errors.push('literal characters must be within [A-Za-z0-9/-] (rule 46(b) charset)');
  }
  if (maxLength !== null && seqMatches.length === 1) {
    const pad = parseInt(seqMatches[0].slice(5, -1), 10);
    const minRendered = literals.length + fyMatches.length * FY_SHORT_LENGTH + pad;
    if (minRendered > maxLength) {
      errors.push(`minimum rendered length ${minRendered} exceeds max_length ${maxLength}`);
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/numbering/templates.test.ts` → 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/numbering/templates.ts src/lib/numbering/templates.test.ts
git commit -m "feat(numbering): client template renderer + rule 46(b) template validation (short-form {FY}, charset, headroom)"
```

### Task S5.2: `in_fiscal_numbering` NumberingPolicy plugin + registration

**Files:**
- Create: `src/lib/regimes/in_gst/numbering.ts`
- Modify: `src/lib/regimes/register.ts` (imports at lines 6–13, registrations at lines 19–25 — verified)
- Test: `src/lib/regimes/in_gst/numbering.test.ts`

**Interfaces:**
- Consumes: `NumberingPolicy`, `NumberSequenceSeed` (`src/lib/regimes/types.ts:200-213`); `registerRegimePlugin`/`resolveNumberingPolicy`/`listRegisteredCapabilities` (`src/lib/regimes/registry.ts`); `registerAllRegimePlugins` (`src/lib/regimes/register.ts`); `validateNumberingTemplate` (Task S5.1). Scope/template contract from **WP-S1b's** `master_numbering_policies` IN rows: `invoices → INV/{FY}/{SEQ:4}`, `credit_note → CRN/{FY}/{SEQ:4}`, `receipt_voucher → RCV/{FY}/{SEQ:4}`, `refund_voucher → RFV/{FY}/{SEQ:4}`, `delivery_challan → DC/{FY}/{SEQ:4}` — all `reset_basis='fiscal_year'`, anchor `04-01`, `max_length 16`. If S1b landed different scope strings, reconcile THIS file to the live rows (the Task S5.5 parity test is the tripwire; the DB rows are the S1b-authored truth).
- Produces: `inFiscalNumberingPolicy: NumberingPolicy` (key `'in_fiscal_numbering'`, version `'1.0.0'`) and `IN_FISCAL_SEQUENCE_TEMPLATES` — consumed by Task S5.5's parity test, the S1b-seeded `regime.numbering='in_fiscal_numbering'` binding resolution, and WP-S7's capability assertion.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/numbering.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { inFiscalNumberingPolicy, IN_FISCAL_SEQUENCE_TEMPLATES } from './numbering';
import { resolveNumberingPolicy, listRegisteredCapabilities } from '../registry';
import { registerAllRegimePlugins } from '../register';
import { renderNumberTemplate, validateNumberingTemplate } from '../../numbering/templates';

beforeAll(() => registerAllRegimePlugins());

describe('in_fiscal_numbering policy', () => {
  it('is registered under its data key and identity-correct', () => {
    expect(resolveNumberingPolicy('in_fiscal_numbering')).toBe(inFiscalNumberingPolicy);
    expect(inFiscalNumberingPolicy.key).toBe('in_fiscal_numbering');
    expect(inFiscalNumberingPolicy.version).toBe('1.0.0');
  });

  it('projects into the capability manifest input (S7 asserts the DB row)', () => {
    expect(listRegisteredCapabilities()).toContainEqual({
      capability_key: 'in_fiscal_numbering', kind: 'numbering', version: '1.0.0',
    });
  });

  it('seeds exactly the five FINANCIAL document scopes — cases/devices/inventory untouched', () => {
    const seeds = inFiscalNumberingPolicy.defaultSequences({ countryCode: 'IN', fiscalYearStart: '04-01' });
    expect(seeds.map((s) => s.scope).sort()).toEqual(
      ['credit_note', 'delivery_challan', 'invoices', 'receipt_voucher', 'refund_voucher'],
    );
    expect(seeds.map((s) => s.scope)).not.toContain('case');
  });

  it('every seed is fiscal-year 04-01, template-driven, max_length 16, padding 4, null prefix', () => {
    for (const s of inFiscalNumberingPolicy.defaultSequences({ countryCode: 'IN', fiscalYearStart: '04-01' })) {
      expect(s).toEqual({
        scope: s.scope,
        prefix: null,
        format_template: expect.stringMatching(/^[A-Z]{2,3}\/\{FY\}\/\{SEQ:4\}$/),
        reset_basis: 'fiscal_year',
        fiscal_year_anchor: '04-01',
        max_length: 16,
        padding: 4,
      });
    }
  });

  it('falls back to the 04-01 anchor when the country row has no fiscalYearStart', () => {
    const seeds = inFiscalNumberingPolicy.defaultSequences({ countryCode: 'IN', fiscalYearStart: '' });
    expect(seeds.every((s) => s.fiscal_year_anchor === '04-01')).toBe(true);
  });

  it('rule 46(b): every template renders within the 16-char cap at pad width — SEQ headroom to 6 digits', () => {
    for (const { template } of IN_FISCAL_SEQUENCE_TEMPLATES) {
      expect(validateNumberingTemplate(template, 16)).toEqual([]);
      const at4 = renderNumberTemplate(template, 42, '04-01', new Date(2026, 6, 5));
      expect(at4.length).toBeLessThanOrEqual(14); // 3-letter prefixes → 14; 'DC' challan → 13
      const at6 = renderNumberTemplate(template, 999999, '04-01', new Date(2026, 6, 5));
      expect(at6.length).toBeLessThanOrEqual(16);
    }
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run src/lib/regimes/in_gst/numbering.test.ts` → FAIL: `Cannot find module './numbering'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/in_gst/numbering.ts
//
// CGST Rules rule 46(b): consecutive serial number, unique for a financial year,
// max 16 characters, charset [A-Za-z0-9/-]. These seeds MIRROR the
// master_numbering_policies IN rows seeded by WP-S1b — the live parity test
// (scripts/country-packs/in-numbering.live.test.ts) fails on any drift, and the
// publish gate's coverage check (④) independently validates template-vs-max_length
// DB-side. {FY} renders SHORT form ('26-27'), so each template is 14 chars at pad
// width, leaving SEQ headroom to 6 digits inside the 16-char cap. Financial
// document scopes ONLY: case/device/inventory numbering is out of regime scope.
import type { NumberingPolicy, NumberSequenceSeed } from '../types';
import { validateNumberingTemplate } from '../../numbering/templates';

export const IN_FISCAL_SEQUENCE_TEMPLATES: ReadonlyArray<{ scope: string; template: string }> = [
  { scope: 'invoices', template: 'INV/{FY}/{SEQ:4}' },
  { scope: 'credit_note', template: 'CRN/{FY}/{SEQ:4}' },
  { scope: 'receipt_voucher', template: 'RCV/{FY}/{SEQ:4}' },
  { scope: 'refund_voucher', template: 'RFV/{FY}/{SEQ:4}' },
  { scope: 'delivery_challan', template: 'DC/{FY}/{SEQ:4}' },
];

const RULE_46B_MAX_LENGTH = 16;

export const inFiscalNumberingPolicy: NumberingPolicy = {
  key: 'in_fiscal_numbering',
  version: '1.0.0',
  defaultSequences(country: { countryCode: string; fiscalYearStart: string }): NumberSequenceSeed[] {
    const anchor = country.fiscalYearStart || '04-01';
    return IN_FISCAL_SEQUENCE_TEMPLATES.map(({ scope, template }) => {
      const errors = validateNumberingTemplate(template, RULE_46B_MAX_LENGTH);
      if (errors.length > 0) {
        throw new Error(`in_fiscal_numbering seed for scope "${scope}" is invalid: ${errors.join('; ')}`);
      }
      return {
        scope, prefix: null, format_template: template, reset_basis: 'fiscal_year',
        fiscal_year_anchor: anchor, max_length: RULE_46B_MAX_LENGTH, padding: 4,
      };
    });
  },
};
```

In `src/lib/regimes/register.ts`, add the import after line 8 (`import { prefixNumbering } ...`):

```typescript
import { inFiscalNumberingPolicy } from './in_gst/numbering';
```

and the registration directly after line 20 (`registerRegimePlugin('numbering', prefixNumbering);`):

```typescript
  registerRegimePlugin('numbering', inFiscalNumberingPolicy);
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/regimes/in_gst/numbering.test.ts` → 6 passed. Also `npx vitest run src/lib/regimes/registry.test.ts src/lib/regimes/defaults.test.ts` → still green (registration is additive; one-key-one-plugin guard untouched).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/in_gst/numbering.ts src/lib/regimes/in_gst/numbering.test.ts src/lib/regimes/register.ts
git commit -m "feat(regimes): in_fiscal_numbering policy — 5 financial FY series, short-form {FY}, 16-char rule 46(b) cap"
```

### Task S5.3: Cosmetic preview fix — template-aware `inventorySequenceService` formatters

**Files:**
- Modify: `src/lib/inventory/inventorySequenceService.ts` (lines 88–98: `formatNextNumber` / `formatCurrentNumber` — verified template-blind `${prefix}-${padded}`)
- Modify: `src/pages/settings/InventorySettingsPage.tsx` (lines 295, 303, 399 — verified call sites that hold a full sequence row; lines 120 and 386 are prefix-editor previews with no row and stay legacy)
- Test: `src/lib/inventory/inventorySequenceService.test.ts` (extend; existing cases at lines 19–41 must keep passing unchanged)

**Interfaces:**
- Consumes: `renderNumberTemplate` (Task S5.1); `seq`/`editModal.sequence` rows already in scope at the named lines (`number_sequences` Row: `format_template`, `fiscal_year_anchor` — both live columns, verified).
- Produces: backward-compatible widened signatures `formatNextNumber(prefix, currentValue, padding, formatTemplate?, fiscalYearAnchor?, today?)` and `formatCurrentNumber(...)` — same call shape for all existing callers. NOT touched: `SystemNumbers.tsx` (server-side preview via `preview_number_format` is already correct).

- [ ] **Step 1: Write the failing test** — append to `src/lib/inventory/inventorySequenceService.test.ts`:

```typescript
describe('template-aware previews (cosmetic fix — spec §4 WP-S5)', () => {
  it('formatNextNumber renders the v2 template when the row carries one', () => {
    expect(
      formatNextNumber('INV', 41, 4, 'INV/{FY}/{SEQ:4}', '04-01', new Date(2026, 6, 5)),
    ).toBe('INV/26-27/0042');
  });

  it('formatCurrentNumber renders the template and keeps the em-dash for 0', () => {
    expect(
      formatCurrentNumber('INV', 42, 4, 'INV/{FY}/{SEQ:4}', '04-01', new Date(2026, 6, 5)),
    ).toBe('INV/26-27/0042');
    expect(formatCurrentNumber('INV', 0, 4, 'INV/{FY}/{SEQ:4}', '04-01')).toBe('—');
  });

  it('null/omitted template keeps the exact legacy shape (all existing callers unchanged)', () => {
    expect(formatNextNumber('HDD', 0, 4, null, null)).toBe('HDD-0001');
    expect(formatCurrentNumber('HDD', 5, 4)).toBe('HDD-0005');
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run src/lib/inventory/inventorySequenceService.test.ts` → FAIL: `Expected 3 arguments, but got 6` (tsc) / template args ignored at runtime.

- [ ] **Step 3: Minimal implementation** — replace lines 88–98 of `src/lib/inventory/inventorySequenceService.ts`:

```typescript
/** Format a next-number preview from a sequence row or catalog defaults.
 *  Template-aware: a row carrying a v2 format_template previews via the same
 *  {FY}/{SEQ:n} rendering the DB uses (short-form FY) instead of the legacy
 *  template-blind `${prefix}-${padded}` shape. */
export function formatNextNumber(
  prefix: string, currentValue: number, padding: number,
  formatTemplate?: string | null, fiscalYearAnchor?: string | null, today?: Date,
): string {
  const next = currentValue + 1;
  if (formatTemplate) return renderNumberTemplate(formatTemplate, next, fiscalYearAnchor ?? null, today);
  return `${prefix}-${next.toString().padStart(padding, '0')}`;
}

/** Format the current (last-allocated) number, or '—' if none allocated yet. */
export function formatCurrentNumber(
  prefix: string, currentValue: number, padding: number,
  formatTemplate?: string | null, fiscalYearAnchor?: string | null, today?: Date,
): string {
  if (currentValue === 0) return '—';
  if (formatTemplate) return renderNumberTemplate(formatTemplate, currentValue, fiscalYearAnchor ?? null, today);
  return `${prefix}-${currentValue.toString().padStart(padding, '0')}`;
}
```

and add to the imports at the top of the file (after line 8):

```typescript
import { renderNumberTemplate } from '../numbering/templates';
```

Then update the three row-bearing call sites in `src/pages/settings/InventorySettingsPage.tsx`:

Line 295: `formatNextNumber(effectivePrefix, currentValue, effectivePadding)` → `formatNextNumber(effectivePrefix, currentValue, effectivePadding, seq?.format_template ?? null, seq?.fiscal_year_anchor ?? null)`

Line 303: `formatCurrentNumber(effectivePrefix, currentValue, effectivePadding)` → `formatCurrentNumber(effectivePrefix, currentValue, effectivePadding, seq?.format_template ?? null, seq?.fiscal_year_anchor ?? null)`

Line 399: `formatCurrentNumber(editModal.sequence.prefix ?? editModal.prefix, editModal.sequence.current_value ?? 0, editModal.sequence.padding ?? editModal.padding)` → `formatCurrentNumber(editModal.sequence.prefix ?? editModal.prefix, editModal.sequence.current_value ?? 0, editModal.sequence.padding ?? editModal.padding, editModal.sequence.format_template ?? null, editModal.sequence.fiscal_year_anchor ?? null)`

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/inventory/inventorySequenceService.test.ts` → all passed (including the 6 pre-existing cases, byte-identical expectations). `npm run typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory/inventorySequenceService.ts src/lib/inventory/inventorySequenceService.test.ts src/pages/settings/InventorySettingsPage.tsx
git commit -m "fix(inventory): template-aware sequence previews — cosmetic parity with get_next_number v2 rendering"
```

### Task S5.4: Backfill the IN test tenant via `apply_country_numbering_policy(uuid)` (live op, no migration)

**Files:** none (live-data operation on the canonical DB, `project_id ssmbegiyjivrcwgcqutu`, via `mcp__supabase__execute_sql`; permanently pinned by the Task S5.5 test)

**Interfaces:**
- Consumes: `apply_country_numbering_policy(p_tenant_id uuid) RETURNS int` (live, migration `20260704154058` — non-destructive NULL→value fill of `format_template`/`reset_basis`/`fiscal_year_anchor` on EXISTING `number_sequences` rows only; verified via `pg_get_functiondef`: it does **not** create missing scope rows and does **not** copy `max_length`); WP-S1b's IN `master_numbering_policies` rows; WP-S2's IN test tenant; a platform-admin profile (`role IN ('owner','admin') AND tenant_id IS NULL`) for the RPC's guard, impersonated via `request.jwt.claims` (same mechanism as the P3 publish runbooks).
- Produces: 5 fiscally-configured `number_sequences` rows on the IN tenant (`invoices`, `credit_note`, `receipt_voucher`, `refund_voucher`, `delivery_challan`) — consumed by Task S5.5's probes, WP-L4 voucher issuance, and WP-L6 challan numbering.

- [ ] **Step 1: Pre-flight — verify S1b rows and renderer are live (spec-delta guard).** Run via `mcp__supabase__execute_sql`:

```sql
SELECT p.scope, p.format_template, p.reset_basis, p.fiscal_year_anchor, p.max_length
FROM master_numbering_policies p JOIN geo_countries c ON c.id = p.country_id
WHERE c.code = 'IN' AND p.deleted_at IS NULL ORDER BY p.scope;
```

Expected: exactly the 5 rows matching `IN_FISCAL_SEQUENCE_TEMPLATES` (Task S5.2), all `fiscal_year, 04-01, 16`. Then:

```sql
SELECT pg_get_functiondef(p.oid) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_next_number';
```

Expected: the `{FY}` label expression emits the SHORT form (a `YY-YY` label, not `YYYY-YY`). **If it still emits long-form (`v_period || '-' || ...` where `v_period` is `YYYY`), STOP — the S1b short-form delta has not landed; escalate to the owner rather than patching a function from a no-migration WP.**

- [ ] **Step 2: Execute the backfill (single `mcp__supabase__execute_sql` call — one session, so the impersonation config survives all four statements):**

```sql
-- Impersonate a platform admin (RPC guard: is_platform_admin() OR tenant admin).
SELECT set_config('request.jwt.claims', json_build_object(
  'sub', (SELECT id FROM profiles
          WHERE role IN ('owner','admin') AND tenant_id IS NULL AND deleted_at IS NULL LIMIT 1),
  'role', 'authenticated')::text, false);

-- Pre-create missing scope rows: apply_country_numbering_policy only UPDATEs
-- existing rows, and the voucher/challan scopes have never been lazily created.
INSERT INTO number_sequences (tenant_id, scope, prefix, current_value, padding, reset_annually)
SELECT t.id, p.scope, UPPER(LEFT(p.scope, 4)), 0, 4, false
FROM tenants t
JOIN geo_countries c ON c.id = t.country_id AND c.code = 'IN'
JOIN master_numbering_policies p ON p.country_id = c.id AND p.deleted_at IS NULL
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM number_sequences ns
                  WHERE ns.tenant_id = t.id AND ns.scope = p.scope);

-- THE spec'd backfill.
SELECT t.id AS tenant_id, apply_country_numbering_policy(t.id) AS cols_filled
FROM tenants t JOIN geo_countries c ON c.id = t.country_id
WHERE c.code = 'IN' AND t.deleted_at IS NULL;

-- RPC gap (verified via pg_get_functiondef): max_length is not copied by the RPC.
-- Same non-destructive NULL→value semantics, applied here so the rule 46(b)
-- 16-char hard stop actually arms on the tenant rows. Recorded in the PR body.
UPDATE number_sequences ns
SET max_length = p.max_length, updated_at = now()
FROM tenants t
JOIN geo_countries c ON c.id = t.country_id AND c.code = 'IN'
JOIN master_numbering_policies p ON p.country_id = c.id AND p.deleted_at IS NULL
WHERE ns.tenant_id = t.id AND ns.scope = p.scope
  AND t.deleted_at IS NULL
  AND ns.max_length IS NULL AND p.max_length IS NOT NULL;
```

Expected: INSERT creates only the scopes missing on the IN tenant; `cols_filled > 0`; UPDATE touches ≤ 5 rows. Idempotent — a re-run reports `cols_filled = 0` and `UPDATE 0`.

- [ ] **Step 3: Verify the resulting rows:**

```sql
SELECT ns.scope, ns.format_template, ns.reset_basis, ns.fiscal_year_anchor, ns.max_length, ns.current_value
FROM number_sequences ns
JOIN tenants t ON t.id = ns.tenant_id
JOIN geo_countries c ON c.id = t.country_id
WHERE c.code = 'IN' AND t.deleted_at IS NULL
  AND ns.scope IN ('invoices','credit_note','receipt_voucher','refund_voucher','delivery_challan')
ORDER BY ns.scope;
```

Expected: 5 rows, each `format_template` matching its master row, `reset_basis='fiscal_year'`, `fiscal_year_anchor='04-01'`, `max_length=16`. Case/device/inventory scopes: confirm untouched with `SELECT count(*) FROM number_sequences ns JOIN tenants t ON t.id=ns.tenant_id JOIN geo_countries c ON c.id=t.country_id WHERE c.code='IN' AND ns.format_template IS NOT NULL AND ns.scope NOT IN ('invoices','credit_note','receipt_voucher','refund_voucher','delivery_challan');` → `0`.

- [ ] **Step 4: Commit the run record** — no repo files change in this task; paste the three result sets into the PR body draft (kept in the branch description, not a repo file). No commit.

### Task S5.5: Live probes — parity, short-FY render, FY reset, 9999→10000 growth, 17-char hard error

**Files:**
- Create: `scripts/country-packs/in-numbering.live.test.ts` (scripts vitest project — `vitest.config.scripts.ts` already includes `scripts/**/*.test.ts`; self-skips without `SUPABASE_DB_URL`, the exact convention of `scripts/localization/parity-replay.test.ts` — psql via `execSync`, no `pg` package, none is installed)

**Interfaces:**
- Consumes: `inFiscalNumberingPolicy` (Task S5.2); live `get_next_number(p_scope)` v2 with short-form `{FY}` + `max_length` RAISE (verified live: `RAISE EXCEPTION '... exceeds max_length % for scope % ...'`); Task S5.4's backfilled rows; an IN-tenant admin profile for claim impersonation.
- Produces: the permanent CI regression pin for spec §3's numbering rulings (overflow growth, hard stop before 17 chars, fiscal reset, short-form FY, plugin↔master parity).

- [ ] **Step 1: Write the live test**

```typescript
// scripts/country-packs/in-numbering.live.test.ts
//
// India fiscal-numbering live pins (spec §3 / WP-S5). Runs only when
// SUPABASE_DB_URL is set (CI); self-skips locally — same convention as
// scripts/localization/parity-replay.test.ts. Probes use the throwaway scope
// 'in_probe_s5' inside an explicit BEGIN…ROLLBACK so no legal series is ever
// consumed or mutated; SQL is single-quote-only so the psql -c double-quote
// wrapper needs no escaping.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { inFiscalNumberingPolicy } from '../../src/lib/regimes/in_gst/numbering';
import { fiscalYearLabel } from '../../src/lib/numbering/templates';

const DB = process.env.SUPABASE_DB_URL;
const d = describe.skipIf(!DB);

function psql(sql: string): string {
  return execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -q -t -A -c "${sql.replace(/\n/g, ' ')}"`, {
    encoding: 'utf8',
  }).trim();
}

const IMPERSONATE_IN_ADMIN = `
  SELECT set_config('request.jwt.claims', json_build_object('sub',
    (SELECT p.id FROM profiles p
     JOIN tenants t ON t.id = p.tenant_id
     JOIN geo_countries c ON c.id = t.country_id
     WHERE c.code = 'IN' AND p.role IN ('owner','admin') AND p.deleted_at IS NULL LIMIT 1),
    'role', 'authenticated')::text, true)`;

const CURRENT_FY_PERIOD = `
  CASE WHEN to_char(current_date, 'MM-DD') >= '04-01'
       THEN to_char(current_date, 'YYYY')
       ELSE (extract(year from current_date)::int - 1)::text END`;

function probeRowInsert(currentValue: number, lastResetPeriod: string): string {
  return `
    INSERT INTO number_sequences (tenant_id, scope, prefix, current_value, padding,
      reset_annually, format_template, reset_basis, fiscal_year_anchor, max_length, last_reset_period)
    VALUES (get_current_tenant_id(), 'in_probe_s5', 'PRB', ${currentValue}, 4, false,
      'PRB/{FY}/{SEQ:4}', 'fiscal_year', '04-01', 16, ${lastResetPeriod})`;
}

d('India fiscal numbering (live, canonical DB)', () => {
  it('plugin seeds mirror the S1b master_numbering_policies IN rows exactly', () => {
    const rows = JSON.parse(psql(`
      SELECT COALESCE(json_agg(json_build_object(
        'scope', p.scope, 'format_template', p.format_template, 'reset_basis', p.reset_basis,
        'fiscal_year_anchor', p.fiscal_year_anchor, 'max_length', p.max_length) ORDER BY p.scope), '[]'::json)
      FROM master_numbering_policies p JOIN geo_countries c ON c.id = p.country_id
      WHERE c.code = 'IN' AND p.deleted_at IS NULL`));
    const seeds = inFiscalNumberingPolicy
      .defaultSequences({ countryCode: 'IN', fiscalYearStart: '04-01' })
      .map(({ scope, format_template, reset_basis, fiscal_year_anchor, max_length }) => ({
        scope, format_template, reset_basis, fiscal_year_anchor, max_length,
      }))
      .sort((a, b) => a.scope.localeCompare(b.scope));
    expect(rows).toEqual(seeds);
  });

  it('IN tenant rows carry the S5.4 backfill (template, fiscal reset, 16-char cap armed)', () => {
    const rows = JSON.parse(psql(`
      SELECT COALESCE(json_agg(json_build_object('scope', ns.scope,
        'format_template', ns.format_template, 'reset_basis', ns.reset_basis,
        'fiscal_year_anchor', ns.fiscal_year_anchor, 'max_length', ns.max_length) ORDER BY ns.scope), '[]'::json)
      FROM number_sequences ns
      JOIN tenants t ON t.id = ns.tenant_id
      JOIN geo_countries c ON c.id = t.country_id
      WHERE c.code = 'IN' AND t.deleted_at IS NULL
        AND ns.scope IN ('invoices','credit_note','receipt_voucher','refund_voucher','delivery_challan')`));
    expect(rows).toHaveLength(5);
    for (const r of rows as Array<Record<string, unknown>>) {
      expect(r.reset_basis).toBe('fiscal_year');
      expect(r.fiscal_year_anchor).toBe('04-01');
      expect(r.max_length).toBe(16);
      expect(r.format_template).toMatch(/^[A-Z]{2,3}\/\{FY\}\/\{SEQ:4\}$/);
    }
  });

  it('short-form FY + SEQ growth at 9999→10000 + fiscal reset (rolled back)', () => {
    const fy = fiscalYearLabel('04-01', new Date());
    const out = psql(`
      BEGIN;
      ${IMPERSONATE_IN_ADMIN};
      ${probeRowInsert(9998, CURRENT_FY_PERIOD)};
      SELECT get_next_number('in_probe_s5');
      SELECT get_next_number('in_probe_s5');
      UPDATE number_sequences SET last_reset_period = '1999', current_value = 42
        WHERE tenant_id = get_current_tenant_id() AND scope = 'in_probe_s5';
      SELECT get_next_number('in_probe_s5');
      ROLLBACK;`);
    expect(out).toContain(`PRB/${fy}/9999`);   // 14 chars — within cap
    expect(out).toContain(`PRB/${fy}/10000`);  // 15 chars — SEQ grew inside max_length
    expect(out).toContain(`PRB/${fy}/0001`);   // stale period ⇒ fiscal reset to 0001
    expect(out).not.toMatch(/PRB\/\d{4}-/);    // long-form FY = S1b renderer delta missing
  });

  it('hard-errors before issuing a 17-char number (rule 46(b) cap)', () => {
    let message = '';
    try {
      psql(`
        BEGIN;
        ${IMPERSONATE_IN_ADMIN};
        ${probeRowInsert(999999, CURRENT_FY_PERIOD)};
        SELECT get_next_number('in_probe_s5');
        ROLLBACK;`);
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      message = `${e.stderr ?? ''}${e.message ?? ''}`;
    }
    expect(message).toContain('exceeds max_length 16');
  });
});
```

- [ ] **Step 2: Run locally, expect SKIP** — `npm run geo:test -- scripts/country-packs/in-numbering.live.test.ts` → 4 skipped (no `SUPABASE_DB_URL` locally; CI carries the secret).

- [ ] **Step 3: Execute the probes once now via `mcp__supabase__execute_sql`** (one call per probe; substitute the SQL bodies from Step 1 verbatim, with the TS interpolations expanded — e.g. `${CURRENT_FY_PERIOD}` pasted inline). Expected today (2026-07-05, anchor 04-01):
  - growth/reset probe returns `PRB/26-27/9999`, `PRB/26-27/10000`, `PRB/26-27/0001` (all rolled back — confirm after: `SELECT count(*) FROM number_sequences WHERE scope = 'in_probe_s5';` → `0`);
  - the overflow probe fails with `get_next_number: "PRB/26-27/1000000" exceeds max_length 16 for scope in_probe_s5` (17 chars — the hard stop fires BEFORE issuance and the transaction aborts, so nothing persists);
  - if any output shows `PRB/2026-27/…`, STOP per the Task S5.4 Step 1 escalation.

- [ ] **Step 4: Commit**

```bash
git add scripts/country-packs/in-numbering.live.test.ts
git commit -m "test(numbering): live India pins — plugin/master parity, short-FY, fiscal reset, SEQ growth, 17-char hard stop"
```

### Task S5.6: Capability sync, full verification, PR

**Files:** none created; verification + live sync + PR

**Interfaces:**
- Consumes: `sync_engine_capabilities(jsonb)` (live RPC, P3 WP-4 — upsert `ON CONFLICT (capability_key, kind) WHERE deleted_at IS NULL`); `listRegisteredCapabilities()` projection asserted in Task S5.2's test (payload below is exactly what `syncEngineCapabilities()` in `src/lib/tax/capabilityManifest.ts` would push for this plugin: kind `numbering` → `regime_adapter`). Never hand-invent rows — this row exists in code first (§2).
- Produces: the `master_engine_capabilities` row `('in_fiscal_numbering','regime_adapter','1.0.0')` — asserted by WP-S7's pre-publish capability check; the open PR.

- [ ] **Step 1: Sync the capability row (single `mcp__supabase__execute_sql` call):**

```sql
SELECT set_config('request.jwt.claims', json_build_object(
  'sub', (SELECT id FROM profiles
          WHERE role IN ('owner','admin') AND tenant_id IS NULL AND deleted_at IS NULL LIMIT 1),
  'role', 'authenticated')::text, false);

SELECT sync_engine_capabilities(
  '[{"capability_key":"in_fiscal_numbering","kind":"regime_adapter","version":"1.0.0"}]'::jsonb);

SELECT capability_key, kind FROM master_engine_capabilities
WHERE capability_key = 'in_fiscal_numbering' AND deleted_at IS NULL;
```

Expected: sync returns ≥ 1; final SELECT returns exactly one row `('in_fiscal_numbering','regime_adapter')`.

- [ ] **Step 2: Full verification.**

```bash
npm run typecheck
```
Expected: 0 errors (the CI baseline IS zero — verify un-piped).

```bash
npx vitest run src/lib/numbering/templates.test.ts src/lib/regimes/in_gst/numbering.test.ts src/lib/inventory/inventorySequenceService.test.ts src/lib/regimes/registry.test.ts src/lib/regimes/defaults.test.ts
npm run geo:test -- scripts/country-packs/in-numbering.live.test.ts
```
Expected: all app tests pass; live suite 4 skipped locally (green in CI).

- [ ] **Step 3: Push and open the PR (owner merges — do NOT merge):**

```bash
git push -u origin feat/india-s5-in-fiscal-numbering
gh pr create --base main --title "feat(india): WP-S5 — in_fiscal_numbering policy, IN tenant backfill, rule 46(b) pins" --body "$(cat <<'EOF'
## WP-S5 — in_fiscal_numbering [S, no migration]

Spec: docs/superpowers/specs/2026-07-05-phase4-india-pack-design.md §4 (WP-S5) + §3 numbering rulings.

- **Plugin**: `in_fiscal_numbering` v1.0.0 — 5 FINANCIAL scopes (invoices, credit_note, receipt_voucher, refund_voucher, delivery_challan), `XXX/{FY}/{SEQ:4}`, fiscal_year 04-01, max_length 16, prefix null. Cases/devices/inventory numbering untouched. Registered in `register.ts`; seeds self-validate (charset `[A-Za-z0-9/-]` as TEMPLATE validation — no charset column added, by design).
- **Backfill (live)**: `apply_country_numbering_policy(<IN tenant>)` executed against ssmbegiyjivrcwgcqutu after pre-creating the missing voucher/challan scope rows. **Finding**: the RPC does not copy `max_length` (verified via pg_get_functiondef) — filled with the same non-destructive NULL→value semantics in the same session; consider folding into the RPC in a later migration WP. Run records below.
- **Live pins** (`scripts/country-packs/in-numbering.live.test.ts`, self-skips without SUPABASE_DB_URL): plugin↔master parity; backfilled tenant rows; short-form {FY}; fiscal reset; SEQ growth 9999→10000 (15 chars, inside the cap); hard error before a 17-char number (`exceeds max_length 16`). All probes on a throwaway scope inside BEGIN…ROLLBACK.
- **Cosmetic preview fix**: `inventorySequenceService.ts` `formatNextNumber`/`formatCurrentNumber` are now template-aware (backward-compatible optional args; legacy output byte-identical). `SystemNumbers.tsx` deliberately untouched — it previews server-side via `preview_number_format`.
- **Capability sync**: `sync_engine_capabilities` upserted `('in_fiscal_numbering','regime_adapter','1.0.0')` — projection of `listRegisteredCapabilities()`, asserted in the plugin test; never hand-seeded.

Verification: `npm run typecheck` = 0; unit suites green; live suite green via CI secret.

<!-- paste Task S5.4 Step 3 + Task S5.5 Step 3 result sets here before opening -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opens against `main` with the run records pasted in; owner merges.

---


## Work Package WP-S6 — `gstr` Return Composers [M, no migration]

Branch: `feat/india-s6-gstr-composers` (cut fresh from `main`)
Depends on: WP-S5 merged (spine WPs merge sequentially — `src/lib/regimes/register.ts` is a shared seam touched by S3/S4/S5/S6); WP-S1b live IN bindings (`tax.return_composer='gstr'`, `tax.filing_frequency='monthly'`, `tax.period_anchor='04-01'` in `tenants.resolved_country_config`) for the live-tenant behavior only — every test in this WP is fixture-pure or mock-driven and runs green without the IN tenant.

**WP-scope notes (spec §3/§4-S6, binding):**
- GSTR-3B scope is **3.1(a)** outward taxable + per-head payable, **3.1(c)** exempt/nil, and **Table 3.2** state-wise inter-state B2C. **Named non-goals** (do NOT compose, assert their absence where tested): GSTR-1 B2B rows, documents-issued table, portal JSON, Table 4 ITC, Table 11 advance rows. The 3B is display-only; meta marks ITC as not composed so it cannot be mistaken for fileable.
- Advance adjustments **net through the ledger shape**: the composer sums signed `vat_records` rows, so L4's voucher/offset rows net into the boxes when present and everything still works when L4 hasn't merged (net rows simply absent).
- The plugin contract in `src/lib/regimes/types.ts` is **frozen** (spec §2 — the only ratified widening is `TaxDocumentType`, owned by L4). The live `vat_records` table carries more columns than the contract's structural `VatRecordRow` mirror (verified live: `taxable_amount_base`, `tax_treatment`, `source_document_id`, `source_document_type`); this WP narrows structurally inside the `gstr` module instead of touching `types.ts`.
- `getQuarterlyVATSummary` is already period-anchor-driven (verified at `src/lib/vatService.ts:295-309`, with an existing pin test `src/lib/vatService.test.ts:106`); the stale "hardcoded quarters" claim is dropped. The monthly wiring this WP owns is in `taxReturnService.getFilingConfig`/`composeReturnForDate` (already frequency-driven from `resolved_country_config` — verified `src/lib/tax/taxReturnService.ts:44-113`) plus the gstr-specific seams below.
- **No capability rows are hand-seeded.** Registration happens in code (`register.ts`); the DB manifest row appears only via the `sync_engine_capabilities` flow (Task S6.7).

### Task S6.1: `gstr` period math — monthly Apr–Mar, short-form FY label

**Files:**
- Create: `src/lib/regimes/gstr/periods.ts`
- Test: `src/lib/regimes/gstr/periods.test.ts`

**Interfaces:**
- Consumes: `CountryConfigError` from `src/lib/country/resolveCountryConfig.ts` (same import the shipped `gcc_return` composer uses at `src/lib/regimes/gcc_return/index.ts:5`). Nothing else — pure string math, no `Date→toISOString` round-trips (the Phase-0 UTC-boundary bug class).
- Produces: `gstrPeriodBounds(filingFrequency: 'monthly'|'quarterly'|'annual', periodAnchor: string, forDate: string, timezone: string): { periodStart: string; periodEnd: string; taxPeriods: string[] }` (signature-identical to `ReturnComposer['periodBounds']`) and `fiscalYearLabel(forDate: string, periodAnchor: string): string` returning the **short form** `'25-26'` (spec §3 numbering headroom — never `'2025-26'`). Consumed by Task S6.2.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/gstr/periods.test.ts
import { describe, it, expect } from 'vitest';
import { gstrPeriodBounds, fiscalYearLabel } from './periods';

describe('gstrPeriodBounds (04-01 anchor, Asia/Kolkata)', () => {
  it('monthly: mid-month resolves the calendar month', () => {
    expect(gstrPeriodBounds('monthly', '04-01', '2026-07-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-07-01', periodEnd: '2026-07-31', taxPeriods: ['2026-07'],
    });
  });
  it('monthly: month-end boundary stays in its month (pure string math — no UTC drift)', () => {
    expect(gstrPeriodBounds('monthly', '04-01', '2026-07-31', 'Asia/Kolkata').taxPeriods).toEqual(['2026-07']);
    expect(gstrPeriodBounds('monthly', '04-01', '2026-08-01', 'Asia/Kolkata').taxPeriods).toEqual(['2026-08']);
  });
  it('monthly: February leap handling', () => {
    expect(gstrPeriodBounds('monthly', '04-01', '2028-02-10', 'Asia/Kolkata').periodEnd).toBe('2028-02-29');
    expect(gstrPeriodBounds('monthly', '04-01', '2027-02-10', 'Asia/Kolkata').periodEnd).toBe('2027-02-28');
  });
  it('quarterly (QRMP shape): fiscal quarters off the anchor', () => {
    expect(gstrPeriodBounds('quarterly', '04-01', '2026-07-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-07-01', periodEnd: '2026-09-30', taxPeriods: ['2026-07', '2026-08', '2026-09'],
    });
    expect(gstrPeriodBounds('quarterly', '04-01', '2026-02-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-01-01', periodEnd: '2026-03-31', taxPeriods: ['2026-01', '2026-02', '2026-03'],
    });
  });
  it('annual: the Apr–Mar fiscal year containing forDate', () => {
    expect(gstrPeriodBounds('annual', '04-01', '2026-07-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-04-01', periodEnd: '2027-03-31',
      taxPeriods: ['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03'],
    });
    expect(gstrPeriodBounds('annual', '04-01', '2026-02-15', 'Asia/Kolkata').periodStart).toBe('2025-04-01');
  });
  it('rejects a non-month-aligned anchor', () => {
    expect(() => gstrPeriodBounds('monthly', '04-15', '2026-07-15', 'Asia/Kolkata'))
      .toThrowError(/month-aligned/);
  });
});

describe('fiscalYearLabel — SHORT form per spec §3 ({FY} = 25-26, never 2025-26)', () => {
  it('renders yy-yy across the April boundary', () => {
    expect(fiscalYearLabel('2026-07-15', '04-01')).toBe('26-27');
    expect(fiscalYearLabel('2026-02-15', '04-01')).toBe('25-26');
    expect(fiscalYearLabel('2026-04-01', '04-01')).toBe('26-27');
    expect(fiscalYearLabel('2026-03-31', '04-01')).toBe('25-26');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/gstr/periods.test.ts` — Expected: FAIL, `Cannot find module './periods'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/gstr/periods.ts
// GSTR period math. PURE STRING ARITHMETIC on 'YYYY-MM-DD' — never
// new Date().toISOString() (the Phase-0 VATReturnModal UTC-boundary bug class).
// The timezone argument documents intent (forDate must already be tenant-local
// via tenantToday); it is not used for conversion here — same convention as
// gcc_return/index.ts:35.
import { CountryConfigError } from '../../country/resolveCountryConfig';

const pad2 = (n: number): string => String(n).padStart(2, '0');

const daysInMonth = (y: number, m: number): number =>
  [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
   31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

function monthsFrom(startYear: number, startMonth: number, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = startYear * 12 + (startMonth - 1) + i;
    out.push(`${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`);
  }
  return out;
}

/** Fiscal-year start year for a date under an 'MM-DD' anchor. */
function fiscalStartYear(forDate: string, periodAnchor: string): number {
  const y = Number(forDate.slice(0, 4));
  const m = Number(forDate.slice(5, 7));
  const d = Number(forDate.slice(8, 10));
  const am = Number(periodAnchor.slice(0, 2));
  const ad = Number(periodAnchor.slice(3, 5));
  return m < am || (m === am && d < ad) ? y - 1 : y;
}

/** {FY} SHORT form per spec §3 (Rule 46(b) headroom): '25-26'. Mirrors the S5 numbering token. */
export function fiscalYearLabel(forDate: string, periodAnchor: string): string {
  const start = fiscalStartYear(forDate, periodAnchor);
  return `${pad2(start % 100)}-${pad2((start + 1) % 100)}`;
}

export function gstrPeriodBounds(
  filingFrequency: 'monthly' | 'quarterly' | 'annual',
  periodAnchor: string,
  forDate: string,
  _timezone: string,
): { periodStart: string; periodEnd: string; taxPeriods: string[] } {
  if (periodAnchor.slice(3, 5) !== '01') {
    throw new CountryConfigError(`gstr requires a month-aligned period anchor (MM-01); got ${periodAnchor}`);
  }
  const y = Number(forDate.slice(0, 4));
  const m = Number(forDate.slice(5, 7));
  const anchorMonth = Number(periodAnchor.slice(0, 2));

  if (filingFrequency === 'monthly') {
    return {
      periodStart: `${y}-${pad2(m)}-01`,
      periodEnd: `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`,
      taxPeriods: [`${y}-${pad2(m)}`],
    };
  }

  const monthsPerPeriod = filingFrequency === 'quarterly' ? 3 : 12;
  const fy = fiscalStartYear(forDate, periodAnchor);
  const elapsed = (y * 12 + (m - 1)) - (fy * 12 + (anchorMonth - 1));
  const startOffset = Math.floor(elapsed / monthsPerPeriod) * monthsPerPeriod;
  const startTotal = fy * 12 + (anchorMonth - 1) + startOffset;
  const sy = Math.floor(startTotal / 12);
  const sm = (startTotal % 12) + 1;
  const endTotal = startTotal + monthsPerPeriod - 1;
  const ey = Math.floor(endTotal / 12);
  const em = (endTotal % 12) + 1;
  return {
    periodStart: `${sy}-${pad2(sm)}-01`,
    periodEnd: `${ey}-${pad2(em)}-${pad2(daysInMonth(ey, em))}`,
    taxPeriods: monthsFrom(sy, sm, monthsPerPeriod),
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/gstr/periods.test.ts` — Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/gstr/periods.ts src/lib/regimes/gstr/periods.test.ts
git commit -m "feat(regimes): gstr period math — monthly Apr-Mar anchor, short-form FY label, string-safe"
```

### Task S6.2: `gstr` ReturnComposer — GSTR-3B 3.1(a)/3.1(c) from the component ledger + registration

**Files:**
- Create: `src/lib/regimes/gstr/index.ts`
- Modify: `src/lib/regimes/register.ts` (import + one `registerRegimePlugin('return', …)` line appended after the LAST `registerRegimePlugin` call inside `registerAllRegimePlugins()` — by the time this branch is cut, S3/S4/S5 will have appended `in_gst`/`in_gst_invoice`/`in_fiscal_numbering` lines to the file shown at `src/lib/regimes/register.ts:17-27` on today's main; append after theirs)
- Test: `src/lib/regimes/gstr/index.test.ts`

**Interfaces:**
- Consumes: `ReturnComposer`, `ReturnBoxLine`, `VatRecordRow` from `src/lib/regimes/types.ts` (frozen contract); `CountryConfigError` from `src/lib/country/resolveCountryConfig.ts`; `roundMoney` from `src/lib/financialMath.ts`; `gstrPeriodBounds`, `fiscalYearLabel` (Task S6.1); `registerRegimePlugin` + `resolveReturnComposer` + `listRegisteredCapabilities` from `src/lib/regimes/registry.ts`; `registerAllRegimePlugins` from `src/lib/regimes/register.ts`.
- Produces: `gstrComposer: ReturnComposer` (key `'gstr'`, version `'1.0.0'`) resolvable via `resolveReturnComposer('gstr')`; exported type `GstrLedgerRow = VatRecordRow & { taxable_amount_base?: number | null; tax_treatment?: string | null; source_document_id?: string | null; source_document_type?: string | null }` — consumed by Tasks S6.5 tests. Box codes produced: `3.1(a).taxable`, `3.1(a).igst`, `3.1(a).cgst`, `3.1(a).sgst`, `3.1(c).taxable` (sequences 1–5).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/gstr/index.test.ts
import { describe, it, expect } from 'vitest';
import { gstrComposer, type GstrLedgerRow } from './index';
import { registerAllRegimePlugins } from '../register';
import { resolveReturnComposer, listRegisteredCapabilities } from '../registry';

registerAllRegimePlugins();

const row = (over: Partial<GstrLedgerRow>): GstrLedgerRow => ({
  id: 'v1', record_type: 'sale', record_id: 'doc1', vat_amount: 0, vat_rate: 18,
  tax_period: '2026-07', vat_amount_base: 0, component_code: 'IGST', regime_key: 'in_gst',
  taxable_amount_base: 0, tax_treatment: 'standard',
  source_document_id: 'doc1', source_document_type: 'invoice',
  ...over,
});

const input = (ledgerRows: GstrLedgerRow[]) => ({
  tenantId: 't1', legalEntityId: 'le1', taxPeriods: ['2026-07'],
  ledgerRows, jurisdictionCurrency: 'INR', baseCurrency: 'INR',
});

const box = (r: ReturnType<typeof gstrComposer.compose>, code: string) =>
  r.boxes.find((b) => b.boxCode === code)?.amountBase;

describe('gstr composer — identity & registration', () => {
  it('is registered under key gstr and projected into the capability manifest input', () => {
    expect(resolveReturnComposer('gstr')).toBe(gstrComposer);
    expect(gstrComposer.key).toBe('gstr');
    expect(listRegisteredCapabilities()).toContainEqual(
      { capability_key: 'gstr', kind: 'return', version: '1.0.0' });
  });
  it('periodBounds delegates to the Apr-Mar period math', () => {
    expect(gstrComposer.periodBounds('monthly', '04-01', '2026-07-15', 'Asia/Kolkata').taxPeriods)
      .toEqual(['2026-07']);
  });
});

describe('gstr composer — GSTR-3B', () => {
  it('throws CountryConfigError on base ≠ jurisdiction currency (never a silent mixed sum)', () => {
    expect(() => gstrComposer.compose({ ...input([]), baseCurrency: 'USD' }))
      .toThrowError(/jurisdiction/i);
  });

  it('3.1(a): CGST+SGST pairs share ONE taxable base — dedup, never double-counted', () => {
    const rows = [
      row({ id: 'a', component_code: 'CGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ id: 'b', component_code: 'SGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ id: 'c', record_id: 'doc2', source_document_id: 'doc2', component_code: 'IGST', vat_amount_base: 16200, taxable_amount_base: 90000 }),
    ];
    const r = gstrComposer.compose(input(rows));
    expect(box(r, '3.1(a).taxable')).toBe(180000);   // NOT 270000 (the double-count assertion)
    expect(box(r, '3.1(a).cgst')).toBe(8100);
    expect(box(r, '3.1(a).sgst')).toBe(8100);
    expect(box(r, '3.1(a).igst')).toBe(16200);
  });

  it('equal dual-levy fixture ties: 5,000 inclusive → 4,237.29 / 381.36 / 381.36; round-off row excluded', () => {
    const rows = [
      row({ id: 'a', component_code: 'CGST', vat_amount_base: 381.36, taxable_amount_base: 4237.29 }),
      row({ id: 'b', component_code: 'SGST', vat_amount_base: 381.36, taxable_amount_base: 4237.29 }),
      row({ id: 'c', component_code: null, vat_amount_base: -0.01, taxable_amount_base: 0, tax_treatment: 'out_of_scope' }),
    ];
    const r = gstrComposer.compose(input(rows));
    expect(box(r, '3.1(a).taxable')).toBe(4237.29);
    expect(box(r, '3.1(a).cgst')).toBe(381.36);
    expect(box(r, '3.1(a).sgst')).toBe(381.36);      // heads EQUAL (spec §3)
  });

  it("3.1(c): exempt AND zero_rated (= nil-rated domestic, spec §3) report as exempt/nil", () => {
    const rows = [
      row({ id: 'a', record_id: 'd3', source_document_id: 'd3', tax_treatment: 'exempt', component_code: 'CGST', vat_amount_base: 0, taxable_amount_base: 1000 }),
      row({ id: 'b', record_id: 'd4', source_document_id: 'd4', tax_treatment: 'zero_rated', component_code: 'IGST', vat_amount_base: 0, taxable_amount_base: 500 }),
    ];
    const r = gstrComposer.compose(input(rows));
    expect(box(r, '3.1(c).taxable')).toBe(1500);
    expect(box(r, '3.1(a).taxable')).toBe(0);
  });

  it('credit-note contra rows net into the same boxes', () => {
    const rows = [
      row({ id: 'a', component_code: 'CGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ id: 'b', component_code: 'SGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ id: 'c', record_id: 'cn1', source_document_id: 'cn1', source_document_type: 'credit_note', component_code: 'CGST', vat_amount_base: -8100, taxable_amount_base: -90000 }),
      row({ id: 'd', record_id: 'cn1', source_document_id: 'cn1', source_document_type: 'credit_note', component_code: 'SGST', vat_amount_base: -8100, taxable_amount_base: -90000 }),
    ];
    const r = gstrComposer.compose(input(rows));
    expect(box(r, '3.1(a).cgst')).toBe(0);
    expect(box(r, '3.1(a).taxable')).toBe(0);
  });

  it('advance netting (L4 shape): voucher month + net invoice month conserve total tax; works with rows absent too', () => {
    // July: Rule 50 receipt voucher — GST at receipt (1,180 incl → 1,000 / 90 / 90).
    const july = gstrComposer.compose(input([
      row({ id: 'a', record_id: 'rv1', source_document_id: 'rv1', source_document_type: 'receipt_voucher', component_code: 'CGST', vat_amount_base: 90, taxable_amount_base: 1000 }),
      row({ id: 'b', record_id: 'rv1', source_document_id: 'rv1', source_document_type: 'receipt_voucher', component_code: 'SGST', vat_amount_base: 90, taxable_amount_base: 1000 }),
    ]));
    // August: final invoice full 10,000/900/900 + net-of-advance offset rows (spec §3 blocker fix).
    const august = gstrComposer.compose(input([
      row({ id: 'c', record_id: 'inv1', source_document_id: 'inv1', component_code: 'CGST', vat_amount_base: 900, taxable_amount_base: 10000 }),
      row({ id: 'd', record_id: 'inv1', source_document_id: 'inv1', component_code: 'SGST', vat_amount_base: 900, taxable_amount_base: 10000 }),
      row({ id: 'e', record_id: 'inv1', source_document_id: 'inv1', component_code: 'CGST', vat_amount_base: -90, taxable_amount_base: -1000 }),
      row({ id: 'f', record_id: 'inv1', source_document_id: 'inv1', component_code: 'SGST', vat_amount_base: -90, taxable_amount_base: -1000 }),
    ]));
    expect(box(august, '3.1(a).taxable')).toBe(9000);
    expect(box(august, '3.1(a).cgst')).toBe(810);
    // Conservation: voucher tax + invoice net tax = total supply tax.
    expect(box(july, '3.1(a).cgst')! + box(august, '3.1(a).cgst')!).toBe(900);
  });

  it('purchase rows are skipped — Table 4 ITC is a NAMED NON-GOAL; the meta says so', () => {
    const r = gstrComposer.compose(input([
      row({ id: 'a', record_type: 'purchase', record_id: 'exp1', source_document_id: null, component_code: 'CGST', vat_amount_base: 450, taxable_amount_base: 2500 }),
    ]));
    expect(box(r, '3.1(a).cgst')).toBe(0);
    expect(r.boxes.some((b) => b.boxCode.startsWith('4('))).toBe(false);
    expect(r.meta['itc_table4']).toBe('not_composed_purchases_not_modeled');
    expect(r.meta['skipped_purchase_rows']).toBe(1);
    expect(r.meta['display_only']).toBe(true);
  });

  it('boxes are deterministic, ascending-sequenced, and meta carries the short-form FY', () => {
    const r1 = gstrComposer.compose(input([row({ component_code: 'CGST', vat_amount_base: 90, taxable_amount_base: 1000 })]));
    const r2 = gstrComposer.compose(input([row({ component_code: 'CGST', vat_amount_base: 90, taxable_amount_base: 1000 })]));
    expect(r1.boxes).toEqual(r2.boxes);
    expect(r1.boxes.map((b) => b.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(r1.meta['financial_year']).toBe('26-27');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/gstr/index.test.ts` — Expected: FAIL, `Cannot find module './index'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/gstr/index.ts
// GSTR-3B composer (spec §3 scope: 3.1(a) + 3.1(c); Table 3.2 is service-fed —
// see ./table32.ts — because B2C-ness lives on the invoice, not the amount-only
// ledger). Consumes ONLY base-currency vat_records rows selected by tax_period.
// NAMED NON-GOALS (spec §7): GSTR-1 B2B rows, documents-issued, portal JSON,
// Table 4 ITC, Table 11 — the meta marks the 3B display-only so it cannot be
// mistaken for fileable.
//
// Contract note: VatRecordRow (regimes/types.ts) is the frozen minimal mirror.
// The live table carries more columns (verified: taxable_amount_base,
// tax_treatment, source_document_id/type). We narrow structurally HERE instead
// of widening the frozen contract.
import { CountryConfigError } from '../../country/resolveCountryConfig';
import { roundMoney } from '../../financialMath';
import type { ReturnBoxLine, ReturnComposer, VatRecordRow } from '../types';
import { fiscalYearLabel, gstrPeriodBounds } from './periods';

export type GstrLedgerRow = VatRecordRow & {
  taxable_amount_base?: number | null;
  tax_treatment?: string | null;
  source_document_id?: string | null;
  source_document_type?: string | null;
};

const HEADS = ['igst', 'cgst', 'sgst'] as const;
type Head = (typeof HEADS)[number];

const headOf = (r: GstrLedgerRow): Head | null => {
  const code = (r.component_code ?? '').toLowerCase();
  return (HEADS as readonly string[]).includes(code) ? (code as Head) : null;
};

export const gstrComposer: ReturnComposer = {
  key: 'gstr',
  version: '1.0.0',

  periodBounds: gstrPeriodBounds,

  compose(input) {
    if (input.baseCurrency !== input.jurisdictionCurrency) {
      throw new CountryConfigError(
        `gstr: tenant base currency ${input.baseCurrency} does not match the jurisdiction filing currency ` +
        `${input.jurisdictionCurrency} — a GSTR cannot be composed from a mismatched base ledger`,
      );
    }

    const outward = { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    let exemptNil = 0;
    let skippedPurchaseRows = 0;

    for (const raw of input.ledgerRows) {
      const r = raw as GstrLedgerRow;
      const treatment = r.tax_treatment ?? 'standard';
      if (treatment === 'out_of_scope') continue;              // Section 170 round-off lines
      if (r.record_type !== 'sale') { skippedPurchaseRows += 1; continue; }  // ITC = named non-goal

      const head = headOf(r);
      const taxable = Number(r.taxable_amount_base ?? 0);
      // SGST mirrors CGST's base on every dual-levy row pair (equal heads, spec §3):
      // count taxable from every NON-SGST row (IGST rows, CGST rows, head-less
      // evidence rows) and never from the SGST mirror. Signed sums make credit-note
      // contras and L4 advance offsets net automatically — and compose identically
      // when those rows are absent.
      if (treatment === 'exempt' || treatment === 'zero_rated') {
        if (head !== 'sgst') exemptNil += taxable;             // 'zero' = nil-rated domestic (§3)
        continue;
      }
      if (head) outward[head] += Number(r.vat_amount_base ?? 0);
      if (head !== 'sgst') outward.taxable += taxable;
    }

    const boxes: ReturnBoxLine[] = [
      { boxCode: '3.1(a).taxable', boxLabel: 'Outward taxable supplies (other than zero rated, nil rated and exempted) — taxable value', amountBase: roundMoney(outward.taxable, 2), sequence: 1 },
      { boxCode: '3.1(a).igst', boxLabel: 'Outward taxable supplies — Integrated tax (IGST)', amountBase: roundMoney(outward.igst, 2), sequence: 2 },
      { boxCode: '3.1(a).cgst', boxLabel: 'Outward taxable supplies — Central tax (CGST)', amountBase: roundMoney(outward.cgst, 2), sequence: 3 },
      { boxCode: '3.1(a).sgst', boxLabel: 'Outward taxable supplies — State/UT tax (SGST/UTGST)', amountBase: roundMoney(outward.sgst, 2), sequence: 4 },
      { boxCode: '3.1(c).taxable', boxLabel: 'Other outward supplies (nil rated, exempted) — taxable value', amountBase: roundMoney(exemptNil, 2), sequence: 5 },
    ];

    return {
      boxes,
      meta: {
        composer: 'gstr',
        form: 'GSTR-3B',
        display_only: true,
        itc_table4: 'not_composed_purchases_not_modeled',
        skipped_purchase_rows: skippedPurchaseRows,
        taxPeriods: input.taxPeriods,
        ...(input.taxPeriods.length > 0
          ? { financial_year: fiscalYearLabel(`${input.taxPeriods[0]}-15`, '04-01') }
          : {}),
      },
    };
  },
};
```

Then in `src/lib/regimes/register.ts` add the import alongside the others and append inside `registerAllRegimePlugins()` after the last existing `registerRegimePlugin` line (S3/S4/S5 will have added theirs above it):

```typescript
import { gstrComposer } from './gstr';
```
```typescript
  registerRegimePlugin('return', gstrComposer);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/gstr/index.test.ts src/lib/regimes/defaults.test.ts` — Expected: all pass (the gstr file's 9 tests, plus `defaults.test.ts` proving `registerAllRegimePlugins` stays idempotent with the new line). `npm run typecheck` — 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/gstr/index.ts src/lib/regimes/gstr/index.test.ts src/lib/regimes/register.ts
git commit -m "feat(regimes): gstr ReturnComposer — GSTR-3B 3.1(a)/3.1(c) with dual-levy dedup and signed netting"
```

### Task S6.3: GSTR-1 Table 12 HSN summary — pure composer + `fetchHsnLineAggregates` (AD-4)

**Files:**
- Create: `src/lib/regimes/gstr/hsnSummary.ts`
- Modify: `src/lib/vatService.ts` (append after `getQuarterlyVATSummary`, which ends at `src/lib/vatService.ts:309`; extend the `vatService` barrel at `:311-327`; new imports at the top next to line 1-2)
- Test: `src/lib/regimes/gstr/hsnSummary.test.ts`, extend `src/lib/vatService.test.ts`

**Interfaces:**
- Consumes: `ReturnBoxLine` from `src/lib/regimes/types.ts` (fields `boxCode, boxLabel, amountBase, quantity?, unitCode?, meta?, sequence` — verified `types.ts:179-183`); `roundMoney` from `src/lib/financialMath.ts`; `supabase` from `src/lib/supabaseClient.ts`; live columns verified in `src/types/database.types.ts`: `invoice_line_items.item_code/unit_code/quantity`, `document_tax_lines.line_item_id/component_code/taxable_base/tax_amount_base/exchange_rate/document_type/document_id/deleted_at`, `vat_records.source_document_id/source_document_type/tax_period/deleted_at`.
- Produces: `HsnLineAggregate { itemCode: string; unitCode: string | null; quantity: number; taxableBase: number; componentTaxBase: Record<string, number> }`; `composeGstr1HsnSummary(rows: HsnLineAggregate[], startSequence: number): ReturnBoxLine[]`; `fetchHsnLineAggregates(taxPeriods: string[]): Promise<HsnLineAggregate[]>` — consumed by Task S6.4's `composeGstrSupplementaryBoxes`.

- [ ] **Step 1: Write the failing pure-composer test**

```typescript
// src/lib/regimes/gstr/hsnSummary.test.ts
import { describe, it, expect } from 'vitest';
import { composeGstr1HsnSummary, type HsnLineAggregate } from './hsnSummary';

const rows: HsnLineAggregate[] = [
  { itemCode: '998713', unitCode: 'NOS', quantity: 3, taxableBase: 135000, componentTaxBase: { CGST: 12150, SGST: 12150 } },
  { itemCode: '998713', unitCode: 'NOS', quantity: 2, taxableBase: 90000, componentTaxBase: { IGST: 16200 } },
  { itemCode: '998319', unitCode: 'OTH', quantity: 1, taxableBase: 1000, componentTaxBase: { CGST: 90, SGST: 90 } },
];

describe('composeGstr1HsnSummary (Table 12)', () => {
  it('aggregates quantity + taxable + per-head tax per item_code into ReturnBoxLines', () => {
    const boxes = composeGstr1HsnSummary(rows, 100);
    const b = boxes.find((x) => x.boxCode === 'hsn.998713');
    expect(b?.quantity).toBe(5);
    expect(b?.unitCode).toBe('NOS');
    expect(b?.amountBase).toBe(225000);
    expect(b?.meta).toEqual({ cgst: 12150, sgst: 12150, igst: 16200, total_tax: 40500 });
  });
  it('sequences from startSequence in deterministic item-code order', () => {
    const boxes = composeGstr1HsnSummary(rows, 100);
    expect(boxes.map((x) => x.boxCode)).toEqual(['hsn.998319', 'hsn.998713']);
    expect(boxes.map((x) => x.sequence)).toEqual([100, 101]);
  });
});
```

Run: `npx vitest run src/lib/regimes/gstr/hsnSummary.test.ts` — Expected: FAIL, module missing.

- [ ] **Step 2: Implement the pure composer**

```typescript
// src/lib/regimes/gstr/hsnSummary.ts
// GSTR-1 Table 12 (HSN/SAC summary): quantity + UQC + taxable + per-head tax per
// item_code. Sourced from LINE data (AD-4 — vat_records stays amount-only); the
// I/O fetch lives in vatService.fetchHsnLineAggregates.
import { roundMoney } from '../../financialMath';
import type { ReturnBoxLine } from '../types';

export interface HsnLineAggregate {
  itemCode: string;
  unitCode: string | null;
  quantity: number;
  taxableBase: number;
  componentTaxBase: Record<string, number>;   // 'CGST' | 'SGST' | 'IGST' → base amount
}

export function composeGstr1HsnSummary(rows: HsnLineAggregate[], startSequence: number): ReturnBoxLine[] {
  const byCode = new Map<string, { quantity: number; unitCode: string | null; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const r of rows) {
    const agg = byCode.get(r.itemCode) ?? { quantity: 0, unitCode: r.unitCode, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    agg.quantity += r.quantity;
    agg.taxable += r.taxableBase;
    agg.cgst += r.componentTaxBase['CGST'] ?? 0;
    agg.sgst += r.componentTaxBase['SGST'] ?? 0;
    agg.igst += r.componentTaxBase['IGST'] ?? 0;
    if (!agg.unitCode) agg.unitCode = r.unitCode;
    byCode.set(r.itemCode, agg);
  }
  return [...byCode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemCode, agg], i) => ({
      boxCode: `hsn.${itemCode}`,
      boxLabel: `HSN/SAC ${itemCode}`,
      amountBase: roundMoney(agg.taxable, 2),
      quantity: agg.quantity,
      unitCode: agg.unitCode ?? 'OTH',
      meta: {
        cgst: roundMoney(agg.cgst, 2), sgst: roundMoney(agg.sgst, 2), igst: roundMoney(agg.igst, 2),
        total_tax: roundMoney(agg.cgst + agg.sgst + agg.igst, 2),
      },
      sequence: startSequence + i,
    }));
}
```

Run: `npx vitest run src/lib/regimes/gstr/hsnSummary.test.ts` — Expected: 2 passed.

- [ ] **Step 3: Write the failing service-fetch test**

Append to `src/lib/vatService.test.ts` (the file already hoists `from` at line 3 and mocks `./supabaseClient` at line 4 — reuse them; add the `chainFor` builder once, above the new describes):

```typescript
// A thenable query builder: every chain method returns the builder; awaiting it at
// any point resolves the given result (terminal method varies per query).
function chainFor(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<{ data: unknown; error: unknown }>;
}
```

And the describe (add `fetchHsnLineAggregates` to the import list from `./vatService` at lines 6-9):

```typescript
describe('fetchHsnLineAggregates (GSTR-1 Table 12 source, AD-4)', () => {
  it('resolves invoice ids from vat_records by tax_period, then aggregates line + tax-line data', async () => {
    const vatChain = chainFor({ data: [{ source_document_id: 'inv1' }], error: null });
    const lineChain = chainFor({ data: [{ id: 'l1', invoice_id: 'inv1', item_code: '998713', unit_code: 'NOS', quantity: 2 }], error: null });
    const taxChain = chainFor({ data: [
      { line_item_id: 'l1', component_code: 'CGST', taxable_base: 90000, tax_amount_base: 8100, exchange_rate: 1 },
      { line_item_id: 'l1', component_code: 'SGST', taxable_base: 90000, tax_amount_base: 8100, exchange_rate: 1 },
    ], error: null });
    from.mockImplementation((t: string) =>
      t === 'vat_records' ? vatChain : t === 'invoice_line_items' ? lineChain : taxChain);

    const rows = await fetchHsnLineAggregates(['2026-07']);

    // tax_period is THE period dimension — never created_at (vatService.ts:279 drift class)
    expect(vatChain.in).toHaveBeenCalledWith('tax_period', ['2026-07']);
    // taxable counted ONCE per line (CGST+SGST share the line's base)
    expect(rows).toEqual([
      { itemCode: '998713', unitCode: 'NOS', quantity: 2, taxableBase: 90000, componentTaxBase: { CGST: 8100, SGST: 8100 } },
    ]);
  });
  it('returns [] when no invoices fall in the periods', async () => {
    from.mockReturnValue(chainFor({ data: [], error: null }) as never);
    expect(await fetchHsnLineAggregates(['2026-07'])).toEqual([]);
  });
});
```

Run: `npx vitest run src/lib/vatService.test.ts` — Expected: the new describe FAILS (`fetchHsnLineAggregates` is not exported); pre-existing tests still pass.

- [ ] **Step 4: Implement the fetch in `vatService.ts`**

Add imports at the top of `src/lib/vatService.ts` (after line 2):

```typescript
import { roundMoney } from './financialMath';
import { composeGstr1HsnSummary, type HsnLineAggregate } from './regimes/gstr/hsnSummary';
```

Append after `getQuarterlyVATSummary` (line 309), before the `vatService` barrel:

```typescript
/**
 * GSTR-1 Table 12 source (AD-4): line-level HSN/SAC aggregates for the invoices whose
 * ledger rows fall in the given tax periods. tax_period is THE period dimension —
 * never created_at.
 */
export const fetchHsnLineAggregates = async (taxPeriods: string[]): Promise<HsnLineAggregate[]> => {
  const { data: ledger, error: ledgerError } = await supabase
    .from('vat_records')
    .select('source_document_id')
    .eq('record_type', 'sale')
    .eq('source_document_type', 'invoice')
    .in('tax_period', taxPeriods)
    .is('deleted_at', null);
  if (ledgerError) throw ledgerError;
  const invoiceIds = [...new Set((ledger ?? []).map((r) => r.source_document_id).filter(Boolean))] as string[];
  if (invoiceIds.length === 0) return [];

  const { data: lines, error: linesError } = await supabase
    .from('invoice_line_items')
    .select('id, invoice_id, item_code, unit_code, quantity')
    .in('invoice_id', invoiceIds);
  if (linesError) throw linesError;

  const { data: taxLines, error: taxError } = await supabase
    .from('document_tax_lines')
    .select('line_item_id, component_code, taxable_base, tax_amount_base, exchange_rate')
    .eq('document_type', 'invoice')
    .in('document_id', invoiceIds)
    .not('line_item_id', 'is', null)
    .is('deleted_at', null);
  if (taxError) throw taxError;

  const byLine = new Map<string, { taxable: number; counted: boolean; components: Record<string, number> }>();
  for (const t of taxLines ?? []) {
    const key = t.line_item_id as string;
    const agg = byLine.get(key) ?? { taxable: 0, counted: false, components: {} };
    if (!agg.counted) {
      // taxable_base is document-currency; convert once at the row's frozen rate.
      // Counted ONCE per line — the CGST/SGST pair shares the line's base.
      agg.taxable = roundMoney(Number(t.taxable_base ?? 0) * Number(t.exchange_rate ?? 1), 2);
      agg.counted = true;
    }
    agg.components[t.component_code] = roundMoney(
      (agg.components[t.component_code] ?? 0) + Number(t.tax_amount_base ?? 0), 2,
    );
    byLine.set(key, agg);
  }

  return (lines ?? [])
    .filter((l) => l.item_code)
    .map((l) => {
      const tax = byLine.get(l.id) ?? { taxable: 0, counted: false, components: {} };
      return {
        itemCode: l.item_code as string,
        unitCode: (l.unit_code as string | null) ?? null,
        quantity: Number(l.quantity ?? 0),
        taxableBase: tax.taxable,
        componentTaxBase: tax.components,
      };
    });
};
```

Add `fetchHsnLineAggregates,` to the `vatService` barrel object (before its closing brace at line 327).

- [ ] **Step 5: Run tests, verify pass**

Run: `npx vitest run src/lib/vatService.test.ts src/lib/regimes/gstr/hsnSummary.test.ts` — Expected: all pass. `npm run typecheck` — 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/regimes/gstr/hsnSummary.ts src/lib/regimes/gstr/hsnSummary.test.ts src/lib/vatService.ts src/lib/vatService.test.ts
git commit -m "feat(returns): GSTR-1 Table 12 HSN summary composer + fetchHsnLineAggregates (AD-4 line-sourced)"
```

### Task S6.4: GSTR-3B Table 3.2 (state-wise inter-state B2C) + the gstr supplementary-box assembly

**Files:**
- Create: `src/lib/regimes/gstr/table32.ts`
- Modify: `src/lib/vatService.ts` (append after `fetchHsnLineAggregates` from Task S6.3; extend the barrel)
- Test: `src/lib/regimes/gstr/table32.test.ts`, extend `src/lib/vatService.test.ts`

**Interfaces:**
- Consumes: `ReturnBoxLine` (regimes/types.ts); `roundMoney`; `supabase`; `composeGstr1HsnSummary` + `fetchHsnLineAggregates` (Task S6.3); live columns verified: `invoices.buyer_tax_number` (`database.types.ts:8626`), `invoices.place_of_supply_subdivision_id` (`:8658`), `geo_subdivisions.id/name/code/tax_authority_code` (`:7649-7662`), `vat_records.component_code/taxable_amount_base/vat_amount_base/source_document_id`.
- Produces: `InterStateB2CAggregate { stateCode: string; stateName: string; taxableBase: number; igstBase: number }`; `composeGstr3bTable32(rows: InterStateB2CAggregate[], startSequence: number): ReturnBoxLine[]`; `fetchInterStateB2CAggregates(taxPeriods: string[]): Promise<InterStateB2CAggregate[]>`; `composeGstrSupplementaryBoxes(taxPeriods: string[], startSequence: number): Promise<ReturnBoxLine[]>` — consumed by Task S6.5's seam. Box codes: `3.2.<gst-state-code>` before the `hsn.*` boxes.

*Why service-fed:* Table 3.2 needs the buyer's registration status (B2C = `invoices.buyer_tax_number IS NULL`) and the place-of-supply state — neither is on the amount-only ledger (AD-4), and the `ReturnComposer.compose` input is contract-frozen. Same sibling pattern as the HSN summary.

- [ ] **Step 1: Write the failing pure-composer test**

```typescript
// src/lib/regimes/gstr/table32.test.ts
import { describe, it, expect } from 'vitest';
import { composeGstr3bTable32, type InterStateB2CAggregate } from './table32';

const rows: InterStateB2CAggregate[] = [
  { stateCode: '29', stateName: 'Karnataka', taxableBase: 90000, igstBase: 16200 },
  { stateCode: '27', stateName: 'Maharashtra', taxableBase: 10000, igstBase: 1800 },
];

describe('composeGstr3bTable32 (state-wise inter-state B2C)', () => {
  it('emits one box per place-of-supply state with taxable value and IGST in meta', () => {
    const boxes = composeGstr3bTable32(rows, 6);
    expect(boxes.map((b) => b.boxCode)).toEqual(['3.2.27', '3.2.29']);   // sorted by GST state code
    const ka = boxes.find((b) => b.boxCode === '3.2.29');
    expect(ka?.boxLabel).toBe('Supplies made to unregistered persons — Karnataka (29)');
    expect(ka?.amountBase).toBe(90000);
    expect(ka?.meta).toEqual({ igst: 16200 });
    expect(boxes.map((b) => b.sequence)).toEqual([6, 7]);
  });
  it('is empty when there are no inter-state B2C supplies', () => {
    expect(composeGstr3bTable32([], 6)).toEqual([]);
  });
});
```

Run: `npx vitest run src/lib/regimes/gstr/table32.test.ts` — Expected: FAIL, module missing.

- [ ] **Step 2: Implement the pure composer**

```typescript
// src/lib/regimes/gstr/table32.ts
// GSTR-3B Table 3.2: inter-state supplies to UNREGISTERED persons, state-wise by
// place of supply. B2C-ness and the PoS state live on the invoice (AD-4), so the
// aggregates are service-fed (vatService.fetchInterStateB2CAggregates); this
// module is the pure composition half.
import { roundMoney } from '../../financialMath';
import type { ReturnBoxLine } from '../types';

export interface InterStateB2CAggregate {
  stateCode: string;      // GST state code (geo_subdivisions.tax_authority_code)
  stateName: string;
  taxableBase: number;
  igstBase: number;
}

export function composeGstr3bTable32(rows: InterStateB2CAggregate[], startSequence: number): ReturnBoxLine[] {
  const byState = new Map<string, { stateName: string; taxable: number; igst: number }>();
  for (const r of rows) {
    const agg = byState.get(r.stateCode) ?? { stateName: r.stateName, taxable: 0, igst: 0 };
    agg.taxable += r.taxableBase;
    agg.igst += r.igstBase;
    byState.set(r.stateCode, agg);
  }
  return [...byState.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stateCode, agg], i) => ({
      boxCode: `3.2.${stateCode}`,
      boxLabel: `Supplies made to unregistered persons — ${agg.stateName} (${stateCode})`,
      amountBase: roundMoney(agg.taxable, 2),
      meta: { igst: roundMoney(agg.igst, 2) },
      sequence: startSequence + i,
    }));
}
```

Run: `npx vitest run src/lib/regimes/gstr/table32.test.ts` — Expected: 2 passed.

- [ ] **Step 3: Write the failing service tests**

Append to `src/lib/vatService.test.ts` (reuses `chainFor` from Task S6.3; add `fetchInterStateB2CAggregates, composeGstrSupplementaryBoxes` to the vatService import):

```typescript
describe('fetchInterStateB2CAggregates (GSTR-3B Table 3.2 source)', () => {
  it('joins IGST sale rows → B2C invoices → subdivision state codes and nets signed amounts', async () => {
    const vatChain = chainFor({ data: [
      { source_document_id: 'inv1', taxable_amount_base: 90000, vat_amount_base: 16200 },
      { source_document_id: 'inv1', taxable_amount_base: -1000, vat_amount_base: -180 },  // L4 advance offset nets in
      { source_document_id: 'inv2', taxable_amount_base: 5000, vat_amount_base: 900 },    // B2B — filtered out below
    ], error: null });
    const invChain = chainFor({ data: [
      { id: 'inv1', buyer_tax_number: null, place_of_supply_subdivision_id: 'sub-ka' },
      // inv2 absent: its buyer_tax_number is set, so the .is('buyer_tax_number', null) filter drops it
    ], error: null });
    const subChain = chainFor({ data: [
      { id: 'sub-ka', name: 'Karnataka', code: 'KA', tax_authority_code: '29' },
    ], error: null });
    from.mockImplementation((t: string) =>
      t === 'vat_records' ? vatChain : t === 'invoices' ? invChain : subChain);

    const rows = await fetchInterStateB2CAggregates(['2026-07']);

    expect(vatChain.eq).toHaveBeenCalledWith('component_code', 'IGST');
    expect(vatChain.in).toHaveBeenCalledWith('tax_period', ['2026-07']);
    expect(invChain.is).toHaveBeenCalledWith('buyer_tax_number', null);
    expect(rows).toEqual([
      { stateCode: '29', stateName: 'Karnataka', taxableBase: 89000, igstBase: 16020 },
    ]);
  });
});

describe('composeGstrSupplementaryBoxes (Table 3.2 + Table 12, collision-free sequences)', () => {
  it('emits 3.2 boxes first, then hsn boxes, sequenced from startSequence', async () => {
    from.mockImplementation((t: string) => {
      if (t === 'vat_records') return chainFor({ data: [
        { source_document_id: 'inv1', taxable_amount_base: 90000, vat_amount_base: 16200 },
      ], error: null });
      if (t === 'invoices') return chainFor({ data: [
        { id: 'inv1', buyer_tax_number: null, place_of_supply_subdivision_id: 'sub-ka' },
      ], error: null });
      if (t === 'geo_subdivisions') return chainFor({ data: [
        { id: 'sub-ka', name: 'Karnataka', code: 'KA', tax_authority_code: '29' },
      ], error: null });
      if (t === 'invoice_line_items') return chainFor({ data: [
        { id: 'l1', invoice_id: 'inv1', item_code: '998713', unit_code: 'NOS', quantity: 2 },
      ], error: null });
      // document_tax_lines
      return chainFor({ data: [
        { line_item_id: 'l1', component_code: 'IGST', taxable_base: 90000, tax_amount_base: 16200, exchange_rate: 1 },
      ], error: null });
    });

    const boxes = await composeGstrSupplementaryBoxes(['2026-07'], 6);

    expect(boxes.map((b) => b.boxCode)).toEqual(['3.2.29', 'hsn.998713']);
    expect(boxes.map((b) => b.sequence)).toEqual([6, 7]);
    expect(new Set(boxes.map((b) => b.sequence)).size).toBe(boxes.length);
  });
});
```

Run: `npx vitest run src/lib/vatService.test.ts` — Expected: new describes FAIL (functions not exported); everything else passes.

- [ ] **Step 4: Implement in `vatService.ts`**

Add the import next to the Task S6.3 imports:

```typescript
import { composeGstr3bTable32, type InterStateB2CAggregate } from './regimes/gstr/table32';
import type { ReturnBoxLine } from './regimes/types';
```

Append after `fetchHsnLineAggregates`:

```typescript
/**
 * GSTR-3B Table 3.2 source: inter-state (IGST) supplies to unregistered buyers
 * (invoices.buyer_tax_number IS NULL), grouped by place-of-supply state. Signed
 * ledger sums mean credit-note contras and L4 advance offsets net automatically —
 * and the query composes identically when no such rows exist.
 */
export const fetchInterStateB2CAggregates = async (taxPeriods: string[]): Promise<InterStateB2CAggregate[]> => {
  const { data: ledger, error: ledgerError } = await supabase
    .from('vat_records')
    .select('source_document_id, taxable_amount_base, vat_amount_base')
    .eq('record_type', 'sale')
    .eq('component_code', 'IGST')
    .eq('source_document_type', 'invoice')
    .in('tax_period', taxPeriods)
    .is('deleted_at', null);
  if (ledgerError) throw ledgerError;
  const perInvoice = new Map<string, { taxable: number; igst: number }>();
  for (const r of ledger ?? []) {
    if (!r.source_document_id) continue;
    const agg = perInvoice.get(r.source_document_id) ?? { taxable: 0, igst: 0 };
    agg.taxable += Number(r.taxable_amount_base ?? 0);
    agg.igst += Number(r.vat_amount_base ?? 0);
    perInvoice.set(r.source_document_id, agg);
  }
  if (perInvoice.size === 0) return [];

  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select('id, buyer_tax_number, place_of_supply_subdivision_id')
    .in('id', [...perInvoice.keys()])
    .is('buyer_tax_number', null)                            // B2C = unregistered buyer
    .not('place_of_supply_subdivision_id', 'is', null)
    .is('deleted_at', null);
  if (invError) throw invError;
  const subIds = [...new Set((invoices ?? []).map((i) => i.place_of_supply_subdivision_id).filter(Boolean))] as string[];
  if (subIds.length === 0) return [];

  const { data: subs, error: subError } = await supabase
    .from('geo_subdivisions')
    .select('id, name, code, tax_authority_code')
    .in('id', subIds);
  if (subError) throw subError;
  const subById = new Map((subs ?? []).map((s) => [s.id, s]));

  const byState = new Map<string, InterStateB2CAggregate>();
  for (const inv of invoices ?? []) {
    const amounts = perInvoice.get(inv.id);
    const sub = subById.get(inv.place_of_supply_subdivision_id as string);
    if (!amounts || !sub) continue;
    const stateCode = sub.tax_authority_code ?? sub.code;
    const agg = byState.get(stateCode) ?? { stateCode, stateName: sub.name, taxableBase: 0, igstBase: 0 };
    agg.taxableBase = roundMoney(agg.taxableBase + amounts.taxable, 2);
    agg.igstBase = roundMoney(agg.igstBase + amounts.igst, 2);
    byState.set(stateCode, agg);
  }
  return [...byState.values()];
};

/**
 * Everything the GSTR return needs beyond the ledger-only composer: Table 3.2
 * (part of the 3B) first, then the GSTR-1 Table 12 HSN annexure. Sequences
 * continue from startSequence so persisted tax_return_lines never collide.
 */
export const composeGstrSupplementaryBoxes = async (
  taxPeriods: string[],
  startSequence: number,
): Promise<ReturnBoxLine[]> => {
  const t32 = composeGstr3bTable32(await fetchInterStateB2CAggregates(taxPeriods), startSequence);
  const hsn = composeGstr1HsnSummary(await fetchHsnLineAggregates(taxPeriods), startSequence + t32.length);
  return [...t32, ...hsn];
};
```

Add `fetchInterStateB2CAggregates,` and `composeGstrSupplementaryBoxes,` to the `vatService` barrel object.

- [ ] **Step 5: Run tests, verify pass**

Run: `npx vitest run src/lib/vatService.test.ts src/lib/regimes/gstr/table32.test.ts` — Expected: all pass. `npm run typecheck` — 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/regimes/gstr/table32.ts src/lib/regimes/gstr/table32.test.ts src/lib/vatService.ts src/lib/vatService.test.ts
git commit -m "feat(returns): GSTR-3B Table 3.2 state-wise inter-state B2C + gstr supplementary-box assembly"
```

### Task S6.5: Wire the return path — supplementary seam + composer-agnostic ledger totals in `taxReturnService`

**Files:**
- Modify: `src/lib/tax/taxReturnService.ts` (`composeReturnForDate` at `:78-113`; imports at `:1-9`)
- Test: extend `src/lib/tax/taxReturnService.test.ts` (currently pure — add the supabase mock harness)

**Interfaces:**
- Consumes: `composeGstrSupplementaryBoxes` (Task S6.4, from `../vatService`); `registerAllRegimePlugins` from `../regimes/register`; `roundMoney` from `../financialMath`; `ReturnBoxLine` from `../regimes/types`; the live `file_vat_return` RPC (verified via `pg_get_functiondef`: it **re-derives** `output_vat`/`input_vat` as `SUM(vat_amount_base) FILTER (record_type)` over `vat_records WHERE tax_period = ANY(p_tax_periods) AND deleted_at IS NULL` and RAISEs on >0.0001 divergence from the submitted numbers; it maps `quantity`/`unitCode`/`meta` from `p_lines` into `tax_return_lines` — no migration needed).
- Produces: `composeReturnForDate` unchanged in signature (`(tenantId: string, forDate?: string) => Promise<ComposedReturnPreview>`) but now (a) registry-safe, (b) returning `outputVat`/`inputVat` derived from the fetched ledger rows exactly as the RPC re-derives them (composer-agnostic — the gcc `BOX_1_OUTPUT` lookup would return 0 for gstr and the RPC would reject the filing), and (c) with `composed.boxes` extended by the gstr supplementary boxes when the tenant's `tax.return_composer` is `'gstr'` (data-keyed lookup, not country branching). The existing `VATReturnModal.tsx:54/74` call sites need no change — monthly IN periods flow from `getFilingConfig` (`tax.filing_frequency='monthly'`, `tax.period_anchor='04-01'`, seeded by S1b).

- [ ] **Step 1: Write the failing tests**

Replace the header of `src/lib/tax/taxReturnService.test.ts` (lines 1-3) with a mocked-client version and append the new describes. The full new file content:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { from, rpc } }));

import { taxPeriodsBetween, boxAmount, composeReturnForDate } from './taxReturnService';
import type { ComposedReturn } from '../regimes/types';

function chainFor(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  (chain as { maybeSingle: unknown }).maybeSingle = vi.fn(() =>
    Promise.resolve({ data: Array.isArray(result.data) ? (result.data as unknown[])[0] ?? null : result.data, error: result.error }));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<{ data: unknown; error: unknown }>;
}

const IN_TENANT = {
  id: 't-in', timezone: 'Asia/Kolkata', base_currency_code: 'INR',
  resolved_country_config: {
    'tax.return_composer': 'gstr', 'tax.filing_frequency': 'monthly', 'tax.period_anchor': '04-01',
  },
};
const GCC_TENANT = {
  id: 't-om', timezone: 'Asia/Muscat', base_currency_code: 'OMR',
  resolved_country_config: {
    'tax.return_composer': 'gcc_return', 'tax.filing_frequency': 'quarterly', 'tax.period_anchor': '01-01',
  },
};
const ENTITY_INR = { id: 'le1', currency_code: 'INR' };
const ENTITY_OMR = { id: 'le1', currency_code: 'OMR' };

function mockTablesFor(tenant: unknown, entity: unknown, vatRows: unknown[]) {
  from.mockImplementation((t: string) => {
    if (t === 'tenants') return chainFor({ data: [tenant], error: null });
    if (t === 'legal_entities') return chainFor({ data: [entity], error: null });
    if (t === 'vat_records') return chainFor({ data: vatRows, error: null });
    if (t === 'invoices') return chainFor({ data: [], error: null });
    if (t === 'geo_subdivisions') return chainFor({ data: [], error: null });
    if (t === 'invoice_line_items') return chainFor({ data: [], error: null });
    return chainFor({ data: [], error: null });                 // document_tax_lines
  });
}

describe('taxPeriodsBetween (re-export)', () => {
  it('enumerates inclusive month keys across a year boundary', () => {
    expect(taxPeriodsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('boxAmount', () => {
  const composed: ComposedReturn = {
    boxes: [
      { boxCode: 'BOX_1_OUTPUT', boxLabel: 'Output VAT on sales', amountBase: 62.5, sequence: 1 },
      { boxCode: 'BOX_2_INPUT', boxLabel: 'Recoverable input VAT on purchases', amountBase: 12.25, sequence: 2 },
      { boxCode: 'BOX_3_NET', boxLabel: 'Net VAT payable / (refundable)', amountBase: 50.25, sequence: 3 },
    ],
    meta: {},
  };
  it('reads a box by code and defaults absent boxes to 0', () => {
    expect(boxAmount(composed, 'BOX_1_OUTPUT')).toBe(62.5);
    expect(boxAmount(composed, 'BOX_9_MISSING')).toBe(0);
  });
});

describe('composeReturnForDate — gstr wiring (monthly, ledger-parity totals, supplementary boxes)', () => {
  beforeEach(() => { from.mockReset(); rpc.mockReset(); });

  it('gstr + monthly + 04-01 resolves July bounds, composes 3B boxes, and derives outputVat from the LEDGER (not gcc box codes)', async () => {
    mockTablesFor(IN_TENANT, ENTITY_INR, [
      { id: 'v1', record_type: 'sale', record_id: 'inv1', vat_amount: 8100, vat_rate: 18, tax_period: '2026-07',
        vat_amount_base: 8100, taxable_amount_base: 90000, component_code: 'CGST', regime_key: 'in_gst',
        tax_treatment: 'standard', source_document_id: 'inv1', source_document_type: 'invoice' },
      { id: 'v2', record_type: 'sale', record_id: 'inv1', vat_amount: 8100, vat_rate: 18, tax_period: '2026-07',
        vat_amount_base: 8100, taxable_amount_base: 90000, component_code: 'SGST', regime_key: 'in_gst',
        tax_treatment: 'standard', source_document_id: 'inv1', source_document_type: 'invoice' },
    ]);

    const preview = await composeReturnForDate('t-in', '2026-07-15');

    expect(preview.periodStart).toBe('2026-07-01');
    expect(preview.periodEnd).toBe('2026-07-31');
    expect(preview.taxPeriods).toEqual(['2026-07']);
    expect(preview.filingFrequency).toBe('monthly');
    expect(preview.regimeKey).toBe('gstr');
    // RPC-parity: file_vat_return re-derives SUM(vat_amount_base) by record_type over
    // the same tax_period rows and rejects divergence — the preview MUST match that,
    // not a gcc-only BOX_1_OUTPUT lookup (which is absent from gstr boxes → 0 → 22P02-class reject).
    expect(preview.outputVat).toBe(16200);
    expect(preview.inputVat).toBe(0);
    expect(preview.netVat).toBe(16200);
    expect(preview.composed.boxes.find((b) => b.boxCode === '3.1(a).cgst')?.amountBase).toBe(8100);
    // supplementary boxes appended after the 3B block, sequences collision-free
    const seqs = preview.composed.boxes.map((b) => b.sequence);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('gcc tenants keep byte-identical behavior: outputVat still equals BOX_1_OUTPUT and no supplementary boxes appear', async () => {
    mockTablesFor(GCC_TENANT, ENTITY_OMR, [
      { id: 'v1', record_type: 'sale', record_id: 'inv1', vat_amount: 62.5, vat_rate: 5, tax_period: '2026-07',
        vat_amount_base: 62.5, component_code: 'VAT', regime_key: 'simple_vat' },
      { id: 'v2', record_type: 'purchase', record_id: 'exp1', vat_amount: 12.25, vat_rate: 5, tax_period: '2026-08',
        vat_amount_base: 12.25, component_code: 'VAT', regime_key: 'simple_vat' },
    ]);

    const preview = await composeReturnForDate('t-om', '2026-07-15');

    expect(preview.outputVat).toBe(62.5);
    expect(preview.outputVat).toBe(boxAmount(preview.composed, 'BOX_1_OUTPUT'));   // parity preserved
    expect(preview.inputVat).toBe(12.25);
    expect(preview.composed.boxes.map((b) => b.boxCode)).toEqual(['BOX_1_OUTPUT', 'BOX_2_INPUT', 'BOX_3_NET']);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/tax/taxReturnService.test.ts` — Expected: the two `composeReturnForDate` tests FAIL — first with `CountryConfigError: No registered return regime plugin for key "gstr"` (or, once registration is reached, `outputVat` = 0 from the gcc `BOX_1_OUTPUT` lookup); the gcc test may fail on missing registration too. Pre-existing pure tests pass.

- [ ] **Step 3: Implement**

In `src/lib/tax/taxReturnService.ts`, extend the imports (lines 4-9):

```typescript
import { registerAllRegimePlugins } from '../regimes/register';
import { composeGstrSupplementaryBoxes } from '../vatService';
import { roundMoney } from '../financialMath';
import type { ComposedReturn, ReturnBoxLine } from '../regimes/types';
```

(keep the existing imports; `ComposedReturn` is already imported — just add `ReturnBoxLine` to that type import.)

Add the seam map above `composeReturnForDate` (after `getFilingConfig`, line 76):

```typescript
// Data-keyed supplementary sources (NOT country branching — the key comes from the
// tenant's resolved pack config). gstr appends GSTR-3B Table 3.2 + GSTR-1 Table 12,
// which need invoice-level dimensions the amount-only ledger cannot provide (AD-4).
const SUPPLEMENTARY_BOX_SOURCES: Record<
  string,
  (taxPeriods: string[], startSequence: number) => Promise<ReturnBoxLine[]>
> = {
  gstr: composeGstrSupplementaryBoxes,
};
```

Rewrite `composeReturnForDate` (`:78-113`) as:

```typescript
export async function composeReturnForDate(tenantId: string, forDate?: string): Promise<ComposedReturnPreview> {
  registerAllRegimePlugins();
  const cfg = await getFilingConfig(tenantId);
  const composer = resolveReturnComposer(cfg.composerKey);
  const bounds = composer.periodBounds(
    cfg.filingFrequency,
    cfg.periodAnchor,
    forDate ?? tenantToday(cfg.timezone),
    cfg.timezone,
  );
  const { data: rows, error } = await supabase
    .from('vat_records')
    .select('*')
    .in('tax_period', bounds.taxPeriods)
    .is('deleted_at', null);
  if (error) throw error;
  const ledgerRows = rows ?? [];

  const composed = composer.compose({
    tenantId,
    legalEntityId: cfg.legalEntityId,
    taxPeriods: bounds.taxPeriods,
    ledgerRows: ledgerRows as unknown as import('../regimes/types').VatRecordRow[],
    jurisdictionCurrency: cfg.jurisdictionCurrency,
    baseCurrency: cfg.baseCurrency,
  });

  const supplementary = SUPPLEMENTARY_BOX_SOURCES[cfg.composerKey];
  if (supplementary) {
    const startSequence = composed.boxes.reduce((m, b) => Math.max(m, b.sequence), 0) + 1;
    composed.boxes.push(...(await supplementary(bounds.taxPeriods, startSequence)));
  }

  // Composer-agnostic header totals, mirroring file_vat_return's authoritative
  // re-derivation EXACTLY (SUM(vat_amount_base) by record_type over the same
  // tax_period rows) — the RPC RAISEs on >0.0001 divergence, and the previous
  // boxAmount('BOX_1_OUTPUT') lookup is a gcc-only vocabulary (0 for gstr).
  const outputVat = roundMoney(
    ledgerRows.filter((r) => r.record_type === 'sale').reduce((s, r) => s + Number(r.vat_amount_base ?? 0), 0), 4);
  const inputVat = roundMoney(
    ledgerRows.filter((r) => r.record_type === 'purchase').reduce((s, r) => s + Number(r.vat_amount_base ?? 0), 0), 4);

  return {
    ...bounds,
    composed,
    outputVat,
    inputVat,
    netVat: roundMoney(outputVat - inputVat, 4),
    regimeKey: cfg.composerKey,
    filingFrequency: cfg.filingFrequency,
    periodAnchor: cfg.periodAnchor,
  };
}
```

(`boxAmount` at `:40` stays exported and untouched — the gcc parity test proves the derivations agree.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/tax/taxReturnService.test.ts src/components/financial/VATReturnModal.test.tsx` — Expected: all pass (the modal test mocks `taxReturnService`, proving the call-site contract is unchanged). `npm run typecheck` — 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/taxReturnService.ts src/lib/tax/taxReturnService.test.ts
git commit -m "feat(returns): wire gstr into composeReturnForDate — supplementary boxes seam + RPC-parity ledger totals"
```

### Task S6.6: Return-surface rendering (quantity/UQC) + the 'VAT'-literal → `taxConfig.label` sweep

**Files:**
- Modify: `src/components/financial/VATReturnModal.tsx` (box row render `:128-139`), `src/components/financial/VATReturnDetailModal.tsx` (lines list `:57-64`, `th` at `:75`), `src/pages/financial/VATAuditPage.tsx` (verified literals at `:198, :204, :212, :228, :250, :256, :262, :279, :286-288, :298-299, :374, :405-406`; the page already has `const taxConfig = useTaxConfig()` at `:76`), `src/components/layout/AppLayout.tsx` (`routeLabels` `:25`, `getBreadcrumbs` `:76`, call site `:115`), `src/pages/settings/GeneralSettings.tsx` (`label="VAT Number"` at `:742`)
- Test: extend `src/components/financial/VATReturnModal.test.tsx`, `src/components/financial/VATReturnDetailModal.test.tsx`

**Interfaces:**
- Consumes: `ReturnBoxLine.quantity`/`unitCode` (persisted by `file_vat_return` into `tax_return_lines.quantity`/`unit_code` — verified live); `useTaxConfig()` from `src/contexts/TenantConfigContext.tsx` (returns `TaxConfig` with `.label` — IN pack label is `'GST'`, GCC packs `'VAT'`).
- Produces: HSN boxes render their quantity + UQC in both the filing modal and the detail modal; every user-visible hardcoded `VAT` on tenant tax surfaces renders `taxConfig.label` instead. No API changes.

- [ ] **Step 1: Write the failing modal tests**

Append to `src/components/financial/VATReturnModal.test.tsx` (inside the existing describe; the `preview` const is at lines 6-16 — add an HSN box to its `boxes` array):

```typescript
    { boxCode: 'hsn.998713', boxLabel: 'HSN/SAC 998713', amountBase: 90000, quantity: 5, unitCode: 'NOS', sequence: 6 },
```

```typescript
  it('renders quantity + UQC on boxes that carry them (GSTR HSN summary rows)', async () => {
    render(<VATReturnModal isOpen onClose={() => {}} onFiled={() => {}} />);
    await screen.findByText('HSN/SAC 998713');
    expect(screen.getByText('Qty 5 NOS')).toBeInTheDocument();
  });
```

Append to `src/components/financial/VATReturnDetailModal.test.tsx` — its `getReturnLines` mock rows are at lines 6-10; add a row `{ id: 'l4', box_code: 'hsn.998713', box_label: 'HSN/SAC 998713', amount_base: 90000, quantity: 5, unit_code: 'NOS', sequence: 6 }` and the test:

```typescript
  it('renders quantity + UQC on persisted HSN lines', async () => {
    render(<VATReturnDetailModal vatReturn={vatReturn} onClose={() => {}} />);
    await screen.findByText('HSN/SAC 998713');
    expect(screen.getByText('Qty 5 NOS')).toBeInTheDocument();
  });
```

Run: `npx vitest run src/components/financial/VATReturnModal.test.tsx src/components/financial/VATReturnDetailModal.test.tsx` — Expected: the two new tests FAIL (`Unable to find an element with the text: Qty 5 NOS`).

- [ ] **Step 2: Implement the quantity/UQC rendering**

In `VATReturnModal.tsx`, inside the box row (`:130-138`), under the `boxCode` div:

```tsx
                  {box.quantity != null && (
                    <div className="text-xs text-slate-500 tabular-nums">
                      {`Qty ${box.quantity}${box.unitCode ? ` ${box.unitCode}` : ''}`}
                    </div>
                  )}
```

In `VATReturnDetailModal.tsx`, inside the lines map (`:58-63`), wrap the label in a div and add the same sub-line:

```tsx
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between px-4 py-2">
              <div>
                <span className="text-sm">{l.box_label}</span>
                {l.quantity != null && (
                  <div className="text-xs text-slate-500 tabular-nums">
                    {`Qty ${Number(l.quantity)}${l.unit_code ? ` ${l.unit_code}` : ''}`}
                  </div>
                )}
              </div>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(l.amount_base))}</span>
            </div>
          ))}
```

Run the two modal test files again — Expected: all pass.

- [ ] **Step 3: Run the repo-wide 'VAT'-literal audit (the one-grep task)**

Run and capture:

```bash
rg -n "\bVAT\b" src --glob '!**/*.test.*' --glob '!src/types/**' --glob '!**/fixtures/**'
```

Disposition rules — a hit is ALLOWED to stay only if it is: (a) **data-driven render labels** (`component_label` values like `VAT 5%` frozen at computation time — kernel/`deviceIconMapper`-class intentional constants), (b) **gcc-only composer/data output** (`gcc_return` box labels — GCC jurisdictions genuinely file VAT), (c) **identifiers/internal names** (`vatService`, `VATReturnModal`, `vat_records` — code identifiers are not user-visible copy; renaming is out of scope), (d) **comments and logger-only strings**. Every remaining **user-visible tenant-surface literal** must render `taxConfig.label`. Fix the four verified files:

`src/pages/financial/VATAuditPage.tsx` (uses the existing `taxConfig` from `:76`; add `const taxLabel = taxConfig.label || 'VAT';` right after it):
- `:198` `title="VAT & Audit"` → `` title={`${taxLabel} & Audit`} ``
- `:204` `Export VAT Report` → `` {`Export ${taxLabel} Report`} ``
- `:212` `New VAT Return` → `` {`New ${taxLabel} Return`} ``
- `:228` `VAT Management` → `` {`${taxLabel} Management`} ``
- `:250` `label: 'VAT Collected'` → `` label: `${taxLabel} Collected` ``; `:256` → `` `${taxLabel} Paid` ``; `:262` → `` `Net ${taxLabel} Position` ``
- `:279` `Recent VAT Returns` → `` {`Recent ${taxLabel} Returns`} ``
- `:286-288` `Output VAT` / `Input VAT` / `Net VAT` → `` {`Output ${taxLabel}`} `` / `` {`Input ${taxLabel}`} `` / `` {`Net ${taxLabel}`} ``
- `:298-299` `No VAT returns filed` / `Create your first VAT return…` → `` {`No ${taxLabel} returns filed`} `` / `` {`Create your first ${taxLabel} return to get started`} ``
- `:374` `VAT Records` → `` {`${taxLabel} Records`} ``; `:405-406` `VAT Amount` / `VAT Rate` → `` {`${taxLabel} Amount`} `` / `` {`${taxLabel} Rate`} ``

`src/components/layout/AppLayout.tsx`:
- `:25` → `'vat-audit': '__TAX__ & Audit',`
- add to the imports (next to `:13`): `import { useTaxConfig } from '../../contexts/TenantConfigContext';`
- `:114-115` becomes:
```tsx
  const location = useLocation();
  const taxConfig = useTaxConfig();
  const crumbs = getBreadcrumbs(location.pathname);
  const label = crumbs.label.replace('__TAX__', taxConfig.label || 'VAT');
  const section = crumbs.section;
```

`src/components/financial/VATReturnDetailModal.tsx` `:75` `VAT (base)` → `Tax (base)` (regime-neutral; this modal renders persisted data for any regime and deliberately takes no tenant-config dependency).

`src/pages/settings/GeneralSettings.tsx` `:742`: add `import { useTaxConfig } from '../../contexts/TenantConfigContext';` (skip if already imported), `const taxConfig = useTaxConfig();` in the component body, and change `label="VAT Number"` → `` label={`${taxConfig.label || 'VAT'} Number`} `` (leave the `vat_number` field key and placeholder untouched — the column name is not copy).

- [ ] **Step 4: Re-run the audit + affected tests**

Re-run the same `rg` command — Expected: every remaining hit falls under disposition (a)–(d); paste the final hit list into the commit body. Run: `npx vitest run src/components/financial src/components/layout 2>$null || npx vitest run src/components/financial` and `npm run typecheck` — Expected: green / 0. (If `AppLayout` has a test file rendering it outside `TenantConfigContext`, wrap with the same provider mock pattern the file already uses for other contexts.)

- [ ] **Step 5: Commit**

```bash
git add src/components/financial/VATReturnModal.tsx src/components/financial/VATReturnModal.test.tsx src/components/financial/VATReturnDetailModal.tsx src/components/financial/VATReturnDetailModal.test.tsx src/pages/financial/VATAuditPage.tsx src/components/layout/AppLayout.tsx src/pages/settings/GeneralSettings.tsx
git commit -m "feat(returns): HSN quantity/UQC rendering + tenant tax-label sweep (VAT literals -> taxConfig.label)"
```

### Task S6.7: Capability sync + WP verification + PR

**Files:**
- No source changes (registration landed in Task S6.2; this task runs the sync flow, full verification, and opens the PR)

**Interfaces:**
- Consumes: `syncEngineCapabilities()` from `src/lib/tax/capabilityManifest.ts:21` (maps every plugin kind → `'regime_adapter'` before the RPC); the platform-admin "Sync capabilities" button at `src/pages/platform-admin/CountryPacksPage.tsx:32` (its `useMutation({ mutationFn: syncEngineCapabilities })` at `:21`); `sync_engine_capabilities` RPC (verified live: upserts `(capability_key, kind)` per row under `_pack_require_platform_admin()` — it never deletes, so pushing the full registry projection is idempotent and safe).
- Produces: live `master_engine_capabilities` row `('gstr','regime_adapter','1.0.0')` — asserted present by WP-S7's pre-publish capability gate. Open PR for owner merge.

- [ ] **Step 1: Full test + typecheck sweep**

Run: `npm run typecheck` — Expected: 0 errors (run un-piped and read the real output — the recorded lesson is that piped/subagent tsc reports have lied before).
Run: `npx vitest run src/lib/regimes/gstr src/lib/vatService.test.ts src/lib/tax/taxReturnService.test.ts src/lib/regimes/defaults.test.ts src/lib/regimes/registry.test.ts src/components/financial/VATReturnModal.test.tsx src/components/financial/VATReturnDetailModal.test.tsx` — Expected: all green.

- [ ] **Step 2: Run the capability sync flow (NEVER hand-insert rows)**

Start the app locally (`npm run dev`), sign in as a platform admin, open Platform Admin → Country Packs (`CountryPacksPage`), click **Sync capabilities** (this executes `syncEngineCapabilities()`, projecting `listRegisteredCapabilities()` — which now includes `gstr` via `register.ts` — through the `sync_engine_capabilities` RPC). Do not INSERT into `master_engine_capabilities` by any other path — the manifest must remain a projection of the code registry (spec §2).

- [ ] **Step 3: Verify the manifest row (read-only)**

Via `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
SELECT capability_key, kind, min_engine_version
FROM master_engine_capabilities
WHERE capability_key = 'gstr' AND deleted_at IS NULL;
```

Expected: exactly one row — `gstr | regime_adapter | 1.0.0`. Paste the result into the PR body.

- [ ] **Step 4: Live-tenant smoke (requires S1b bindings on the IN test tenant)**

On the IN test tenant (provisioned in WP-S2), open Financial → VAT & Audit (header now reads "GST & Audit") → New GST Return: the modal must show a **monthly** period (`filingFrequency` badge "monthly", one-calendar-month bounds) composed by the `gstr` composer (box codes `3.1(a).*`, `3.1(c).taxable`, plus `3.2.*`/`hsn.*` rows when July has inter-state B2C or invoiced lines). If S3 invoices exist in the open month, file as **draft** and confirm `file_vat_return` accepts it (the ledger-parity totals from Task S6.5 are what make the RPC's re-derivation check pass). Record the observed boxes in the PR body. If the tenant has no ledger rows yet, record the empty-period compose (all zeros) instead — the RPC divergence check trivially passes.

- [ ] **Step 5: Push + PR (owner merges — do NOT merge)**

```bash
git push -u origin feat/india-s6-gstr-composers
gh pr create --title "WP-S6: gstr return composers — GSTR-3B (3.1a/3.1c/Table 3.2) + GSTR-1 HSN Table 12" --body "$(cat <<'EOF'
## WP-S6 — gstr Return Composers [M, no migration]

Phase 4 India Pack, spec §4-S6 (docs/superpowers/specs/2026-07-05-phase4-india-pack-design.md).

- **gstr ReturnComposer** (`src/lib/regimes/gstr/`): GSTR-3B 3.1(a) outward taxable + per-head CGST/SGST/IGST and 3.1(c) exempt/nil, composed from the base-currency `vat_records` component ledger on the `tax_period` dimension. CGST+SGST pairs share ONE taxable base (dedup + double-count assertion); credit-note contras and L4 advance-netting rows net via signed sums and compose identically when absent (L4 not merged yet). Equal dual-levy fixture ties (381.36/381.36; out_of_scope round-off rows excluded).
- **Table 3.2** state-wise inter-state B2C, service-fed from `invoices.buyer_tax_number IS NULL` + place-of-supply subdivision (AD-4 — the frozen composer contract stays untouched).
- **GSTR-1 Table 12 HSN summary** from `invoice_line_items` + `document_tax_lines` via new `fetchHsnLineAggregates`; persisted through the existing `file_vat_return` RPC (quantity/unit_code/meta columns verified live — no migration).
- **Period math**: monthly Apr–Mar on the 04-01 anchor, pure string arithmetic; `{FY}` label short-form ('25-26').
- **Wiring**: `composeReturnForDate` now derives header totals from the ledger exactly as `file_vat_return` re-derives them (the gcc BOX_1_OUTPUT lookup returns 0 for gstr and the RPC would reject the filing); data-keyed supplementary-box seam; gcc behavior parity-tested.
- **UI**: HSN quantity/UQC rendering in both return modals; repo-wide 'VAT'-literal sweep → `taxConfig.label` (audit grep output below).
- **Register + sync**: `gstr` registered in `register.ts`; capability manifest synced via the sync_engine_capabilities flow (projection, never hand-seeded). Row verified: <paste Step 3 result>.
- **Named non-goals** (spec §7, asserted in tests/meta): GSTR-1 B2B rows, documents-issued table, portal JSON, Table 4 ITC, Table 11 advance rows. 3B meta marks `display_only`.

Verification: `npm run typecheck` = 0; vitest suites green (list in checks); live IN-tenant smoke: <paste Step 4 observations>.
<paste final 'VAT'-literal audit hit list + dispositions>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opens against `main`. Owner merges; **L4 rebases after this WP lands** (§5 ordering — shared `register.ts` seam).

---


## Work Package WP-S7 — CA Gate ⑤ + Governed Publish [M, MIGRATION PR]

Branch: `feat/india-s7-ca-gate-publish` (cut from `main` after WP-S6 merges; **rebase onto `main` after WP-L1 and WP-L4 merge, before starting Task S7.3** — the gate migrations in S7.1/S7.2 do not need L1/L4, the CA-package rendering steps do)

Depends on: WP-S1a…WP-S6 merged (S1b seeds the IN rates/bindings/numbering/requirements the coverage gate reads; S3 produces the 8 `in_gst` fixtures with `_meta`; S3/S4/S5/S6 each registered + synced their capability row). Tasks S7.3–S7.7 additionally depend on WP-L1 + WP-L4 merged (₹/lakh formatting and the Receipt Voucher PDF the CA reviews). External dependency: the CA engagement started at S1b (D7) — Task S7.5's positive-publish steps block on the returned signed memo; everything before them proceeds with `pending` fixtures.

---

### Task S7.1: Migration A — `publish_country_pack` gate ⑤ (external validation)

**Files:**
- Migration: `phase4_publish_gate_external_validation` (via `mcp__supabase__apply_migration`, project_id `ssmbegiyjivrcwgcqutu`)
- Modify: `src/types/database.types.ts` (regen — no table-shape change expected, diff should be empty)
- Modify: `supabase/migrations.manifest.md` (append row at end of table)

**Interfaces:**
- Consumes: live `publish_country_pack(p_country_id uuid, p_version integer) RETURNS jsonb` (P3 WP-4, last re-signed by migration `20260705091617 phase3_cf_fixture_gate_deleted_at`). Verified live 2026-07-05: gates ①–④ build `v_blockers` via `array_append` (CF-5 fix), fixture count filters `deleted_at` (CF-7 fix), non-empty blockers → `{published:false, config_status, gate}` early-return. Also consumes `master_country_pack_tests` (columns verified live: `id, country_id, pack_version_id, name, input_document jsonb, expected jsonb, last_run_at, last_result, created_at, deleted_at`).
- Produces: gate ⑤ — publish blocked while any non-deleted `master_country_pack_tests` row for the country carries `input_document->'_meta'->'external_validation'` with `status` ≠ `'validated'`; gate JSON gains `"external_validation": {"pass": bool, "unvalidated": int}`. Countries whose tests carry no `_meta.external_validation` block (OM/AE/SA corpora — verified: their fixtures have no `_meta`) are unaffected.

- [ ] **Step 1: Failing probe — gate ⑤ absent (the migration's red test)**

Via `mcp__supabase__execute_sql`:

```sql
SELECT pg_get_functiondef(p.oid) ILIKE '%external_validation%' AS gated,
       pg_get_functiondef(p.oid) AS current_def
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'publish_country_pack';
```

Expected: `gated = false`. Save `current_def` verbatim to `C:\Users\SPACELAB\AppData\Local\Temp\claude\C--Projects-Space-Recovery\41cb8f1d-edd0-47ce-b30b-4a7953d09a32\scratchpad\publish_country_pack.current.sql`. **Diff it against the base body embedded in Step 2** (everything except the three `[GATE-5]` fragments). If anything beyond whitespace differs, STOP — re-splice the three fragments into the freshly captured body instead of applying Step 2's text blind (repo reconciled-against-live discipline; the P3 statutory-keys migration is the cautionary tale).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase4_publish_gate_external_validation`. Signature unchanged → existing grants (authenticated + service_role EXECUTE, anon/PUBLIC revoked) are preserved by CREATE OR REPLACE. The three `[GATE-5]` fragments are the ONLY deltas from the Step-1 capture:

```sql
CREATE OR REPLACE FUNCTION public.publish_country_pack(p_country_id uuid, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pack master_country_pack_versions;
  v_country geo_countries;
  v_fixture_total int; v_fixture_pass int; v_fixture_stale int;
  v_unvalidated int;  -- [GATE-5] fragment 1 of 3
  v_required_caps text[]; v_missing_caps text[];
  v_rate_ok boolean; v_req_bad int; v_num_bad int; v_num_untemplated int;
  v_blockers text[] := '{}';
  v_gate jsonb; v_status text;
  v_tenant record;
BEGIN
  PERFORM _pack_require_platform_admin();

  SELECT * INTO v_pack FROM master_country_pack_versions
   WHERE country_id = p_country_id AND version = p_version;
  IF v_pack IS NULL THEN RAISE EXCEPTION 'publish_country_pack: pack version not found'; END IF;
  IF v_pack.status <> 'in_review' THEN
    RAISE EXCEPTION 'publish_country_pack: only in_review packs can publish (current: %)', v_pack.status;
  END IF;

  IF v_pack.authored_by IS NULL OR v_pack.authored_by = auth.uid() THEN
    RAISE EXCEPTION 'publish_country_pack: dual control — the pack must have a recorded author distinct from the approver';
  END IF;

  SELECT * INTO v_country FROM geo_countries WHERE id = p_country_id;

  SELECT count(*),
         count(*) FILTER (WHERE (last_result->>'pass')::boolean IS TRUE),
         count(*) FILTER (WHERE last_run_at IS NULL
                             OR last_run_at < COALESCE(v_pack.content_updated_at, v_pack.created_at))
    INTO v_fixture_total, v_fixture_pass, v_fixture_stale
    FROM master_country_pack_tests
   WHERE country_id = p_country_id AND deleted_at IS NULL;

  IF v_country.tax_system IS DISTINCT FROM 'NONE' THEN
    IF v_fixture_total = 0 THEN v_blockers := array_append(v_blockers, 'no fixtures — a statutory pack needs golden evidence'); END IF;
    IF v_fixture_pass < v_fixture_total THEN v_blockers := array_append(v_blockers, 'failing fixtures'); END IF;
    IF v_fixture_stale > 0 THEN v_blockers := array_append(v_blockers, 'stale fixture results — re-run the gate after the last edit'); END IF;
  END IF;

  v_required_caps := ARRAY[
    COALESCE(v_country.country_config->>'regime.tax', 'simple_vat'),
    COALESCE(v_country.country_config->>'regime.numbering', 'prefix_numbering'),
    COALESCE(v_country.country_config->>'regime.documents', 'generic_invoice'),
    COALESCE(v_country.country_config->>'regime.einvoice', 'no_einvoice'),
    COALESCE(v_country.country_config->>'tax.return_composer', 'gcc_return')
  ] || COALESCE((SELECT array_agg(DISTINCT adapter_key)
                   FROM master_einvoice_regimes
                  WHERE country_id = p_country_id AND deleted_at IS NULL
                    AND adapter_key IS NOT NULL), '{}');
  SELECT array_agg(c) INTO v_missing_caps
    FROM unnest(v_required_caps) c
   WHERE NOT EXISTS (SELECT 1 FROM master_engine_capabilities m
                      WHERE m.capability_key = c AND m.deleted_at IS NULL);

  v_rate_ok := (v_country.tax_system IS NOT DISTINCT FROM 'NONE') OR EXISTS (
    SELECT 1 FROM geo_country_tax_rates r
     WHERE r.country_id = p_country_id AND r.tax_category = 'standard' AND r.deleted_at IS NULL
       AND r.valid_from <= CURRENT_DATE AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE));
  SELECT count(*) INTO v_req_bad FROM master_document_requirements q
   WHERE q.country_id = p_country_id AND NOT validate_requirement_condition(q.condition);
  SELECT count(*) INTO v_num_bad FROM master_numbering_policies n
   WHERE n.country_id = p_country_id AND n.deleted_at IS NULL
     AND n.format_template IS NOT NULL AND n.max_length IS NOT NULL
     AND numbering_template_render_length(n.format_template, 4) > n.max_length;
  SELECT count(*) INTO v_num_untemplated FROM master_numbering_policies n
   WHERE n.country_id = p_country_id AND n.deleted_at IS NULL
     AND n.format_template IS NOT NULL AND n.format_template !~ '\{SEQ:\d+\}';

  IF NOT v_rate_ok THEN v_blockers := array_append(v_blockers, 'no standard-category rate effective today'); END IF;
  IF v_req_bad > 0 THEN v_blockers := array_append(v_blockers, format('%s requirement condition(s) fail the closed vocabulary', v_req_bad)); END IF;
  IF v_num_bad > 0 THEN v_blockers := array_append(v_blockers, format('%s numbering template(s) exceed max_length', v_num_bad)); END IF;
  IF v_num_untemplated > 0 THEN v_blockers := array_append(v_blockers, format('%s numbering template(s) are not mintable (missing {SEQ:n} token)', v_num_untemplated)); END IF;

  -- [GATE-5] fragment 2 of 3: external validation (D7). Any pack test that
  -- DECLARES a _meta.external_validation block must be signed off 'validated'.
  -- Tests without the block (OM/AE/SA machine-parity corpora) are unaffected.
  SELECT count(*) INTO v_unvalidated
    FROM master_country_pack_tests t
   WHERE t.country_id = p_country_id AND t.deleted_at IS NULL
     AND t.input_document -> '_meta' ? 'external_validation'
     AND t.input_document -> '_meta' -> 'external_validation' ->> 'status' IS DISTINCT FROM 'validated';
  IF v_unvalidated > 0 THEN
    v_blockers := array_append(v_blockers, format('%s fixture(s) await external validation sign-off', v_unvalidated));
  END IF;

  v_gate := jsonb_build_object(
    'fixtures', jsonb_build_object('total', v_fixture_total, 'passed', v_fixture_pass, 'stale', v_fixture_stale),
    'capabilities', jsonb_build_object('required', to_jsonb(v_required_caps),
                                       'missing', COALESCE(to_jsonb(v_missing_caps), '[]'::jsonb)),
    'dual_control', true,
    'coverage', jsonb_build_object('standard_rate', v_rate_ok,
                                   'invalid_requirement_conditions', v_req_bad,
                                   'numbering_over_max_length', v_num_bad,
                                   'numbering_missing_seq_token', v_num_untemplated),
    -- [GATE-5] fragment 3 of 3
    'external_validation', jsonb_build_object('pass', (v_unvalidated = 0), 'unvalidated', v_unvalidated),
    'blockers', to_jsonb(v_blockers));

  IF array_length(v_blockers, 1) IS NOT NULL THEN
    RETURN jsonb_build_object('published', false, 'config_status', v_country.config_status, 'gate', v_gate);
  END IF;

  UPDATE master_country_pack_versions SET status = 'superseded'
   WHERE country_id = p_country_id AND status = 'published';
  UPDATE master_country_pack_versions
     SET status = 'published', approved_by = auth.uid(),
         effective_from = COALESCE(effective_from, CURRENT_DATE)
   WHERE id = v_pack.id;

  v_status := CASE
    WHEN v_missing_caps IS NULL AND v_country.tax_system IS DISTINCT FROM 'NONE' THEN 'statutory_ready'
    ELSE 'formatting_ready'
  END;
  UPDATE geo_countries SET config_status = v_status WHERE id = p_country_id;

  FOR v_tenant IN SELECT id FROM tenants WHERE country_id = p_country_id AND deleted_at IS NULL LOOP
    PERFORM resync_tenant_country_config(v_tenant.id);
    PERFORM apply_country_numbering_policy(v_tenant.id);
    UPDATE tenants SET country_pack_version = p_version WHERE id = v_tenant.id;
  END LOOP;

  PERFORM _pack_touch(v_pack.id, 'country_pack_published', 'master_country_pack_versions', v_pack.id,
                      jsonb_build_object('version', p_version, 'config_status', v_status, 'gate', v_gate));

  RETURN jsonb_build_object('published', true, 'config_status', v_status, 'gate', v_gate);
END $function$;
```

- [ ] **Step 3: Green probes — gate present, blocker fires, existing corpora unaffected**

Via `mcp__supabase__execute_sql` — three assertions:

```sql
-- (a) spliced
SELECT pg_get_functiondef(p.oid) ILIKE '%external_validation%' AS gated
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'publish_country_pack';
-- expect gated = true

-- (b) counting expression: 0 unvalidated for every existing country (no _meta blocks live today)
SELECT c.code, count(*) FILTER (
         WHERE t.input_document -> '_meta' ? 'external_validation'
           AND t.input_document -> '_meta' -> 'external_validation' ->> 'status' IS DISTINCT FROM 'validated'
       ) AS unvalidated
FROM master_country_pack_tests t JOIN geo_countries c ON c.id = t.country_id
WHERE t.deleted_at IS NULL GROUP BY c.code;
-- expect unvalidated = 0 for OM, AE, SA

-- (c) rolled-back behavioral probe: a synthetic pending row IS counted
BEGIN;
INSERT INTO master_country_pack_tests (country_id, name, input_document, expected)
SELECT id, '_gate5_probe', '{"_meta":{"external_validation":{"status":"pending"}}}'::jsonb, '{}'::jsonb
FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL;
SELECT count(*) AS should_be_1
FROM master_country_pack_tests t
WHERE t.country_id = (SELECT id FROM geo_countries WHERE code='IN' AND deleted_at IS NULL)
  AND t.deleted_at IS NULL
  AND t.input_document -> '_meta' ? 'external_validation'
  AND t.input_document -> '_meta' -> 'external_validation' ->> 'status' IS DISTINCT FROM 'validated';
ROLLBACK;
```

Expected: `gated=true`; OM/AE/SA `unvalidated=0`; probe `should_be_1=1` then rolled back. The full end-to-end negative publish runs in Task S7.2 Step 5.

- [ ] **Step 4: Regenerate types, manifest row, commit**

Run `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) → save to `src/types/database.types.ts` (function signature unchanged, expect zero diff — `git diff --stat src/types/database.types.ts` to confirm). Append to `supabase/migrations.manifest.md`:

```
| <applied-version> | phase4_publish_gate_external_validation.sql | Additive (fn re-sign) | publish_country_pack gate ⑤: any master_country_pack_tests row declaring _meta.external_validation must be status='validated' or publish blocks (blocker via array_append, gate JSON gains external_validation{pass,unvalidated}); OM/AE/SA corpora carry no block → unaffected (verified). Signature unchanged → grants preserved. Reconciled against live capture; rolled-back synthetic-pending probe counted 1. | P4 S7 |
```

```bash
git add supabase/migrations.manifest.md src/types/database.types.ts && git commit -m "feat(governance): publish gate 5 — external CA validation sign-off enforcement (P4 S7)"
```

---

### Task S7.2: Migration B — seed `master_country_pack_tests` from the 8 fixtures + negative-publish proof

**Files:**
- Create: `scripts/localization/gen-india-pack-seed.mjs`
- Migration: `phase4_india_pack_tests_seed` (via `mcp__supabase__apply_migration`)
- Modify: `scripts/localization/statutory-fixtures.test.ts` (REPO_FIXTURES map, lines 15–22 verified — add the `IN` row)
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts` (regen)

**Interfaces:**
- Consumes: the 8 WP-S3 fixture JSONs in `src/lib/regimes/in_gst/fixtures/` (`in_intra_state_sac_998319.json`, `in_inter_state_igst.json`, `in_inclusive_b2c_5000.json`, `in_head_vs_line_rounding.json`, `in_utgst_chandigarh.json`, `in_credit_note_full_reversal.json`, `in_advance_then_invoice_netting.json`, `in_unregistered_seller_plain.json` — WP-S3's deliverable names; the generator walks the directory so only the count 8 is pinned, not the names). Each fixture is `{name, input_document, expected, _meta}` where `_meta = {citations: string[], external_validation: {status:'pending'}}` (WP-S3). Also consumes: gate ⑤ (Task S7.1); P3 governance RPCs `create_country_pack_draft(uuid,text)→uuid`, `submit_country_pack_for_review(uuid)`, `publish_country_pack(uuid,int)→jsonb`, `record_pack_test_result(uuid,jsonb)` (all verified live); `runPackFixtures(countryId, countryCode)` in `src/lib/countryPackService.ts:133` (Studio "Run fixtures" button, `PackFixturesTab.tsx`); the two platform admins from the P3 recipe — Admin A (author) `d1139ac6-526c-4805-bbea-790985233725`, Admin B (approver) `4db807ae-09f7-4db9-89b4-b7a68cf67fc0` (`scripts/country-engine/publish-ae-pack.md`).
- Produces: 8 IN rows in `master_country_pack_tests` with `_meta` folded into `input_document` (so gate ⑤ sees the block); an IN pack v1 draft in `in_review`; the archived **negative-publish gate JSON** (`published:false`, `external_validation.pass:false`, `unvalidated:8`); `REPO_FIXTURES['IN']` so the CI `statutory-fixtures` live-DB half won't fail the moment IN flips `statutory_ready` (it asserts every `statutory_ready` country has repo fixtures — verified at `statutory-fixtures.test.ts:47`).

- [ ] **Step 1: Write the seed-SQL generator (fixtures are the single source — no hand-typed JSON in the migration)**

```javascript
// scripts/localization/gen-india-pack-seed.mjs
// node scripts/localization/gen-india-pack-seed.mjs > <scratchpad>/india_pack_tests_seed.sql
// Emits the complete phase4_india_pack_tests_seed migration by reading the 8
// in_gst fixtures. _meta is folded into input_document so publish gate ⑤ can
// see external_validation; the kernel replay ignores the extra key (subset diff).
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'src/lib/regimes/in_gst/fixtures';
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
if (files.length !== 8) {
  console.error(`expected exactly 8 in_gst fixtures, found ${files.length}`);
  process.exit(1);
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const values = files.map((f) => {
  const fx = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  for (const k of ['name', 'input_document', 'expected', '_meta']) {
    if (!(k in fx)) { console.error(`${f}: missing ${k}`); process.exit(1); }
  }
  if (fx._meta?.external_validation?.status !== 'pending') {
    console.error(`${f}: _meta.external_validation.status must start 'pending'`); process.exit(1);
  }
  const doc = JSON.stringify({ ...fx.input_document, _meta: fx._meta });
  return `  (${q(fx.name)}, ${q(doc)}, ${q(JSON.stringify(fx.expected))})`;
}).join(',\n');

process.stdout.write(`-- phase4_india_pack_tests_seed — MACHINE-GENERATED by scripts/localization/gen-india-pack-seed.mjs
INSERT INTO master_country_pack_tests (country_id, name, input_document, expected)
SELECT c.id, v.name, v.doc::jsonb, v.expected::jsonb
FROM geo_countries c,
(VALUES
${values}
) AS v(name, doc, expected)
WHERE c.code = 'IN' AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM master_country_pack_tests t
                   WHERE t.country_id = c.id AND t.name = v.name AND t.deleted_at IS NULL);

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM master_country_pack_tests t JOIN geo_countries c ON c.id = t.country_id
  WHERE c.code = 'IN' AND c.deleted_at IS NULL AND t.deleted_at IS NULL;
  IF v_n <> 8 THEN RAISE EXCEPTION 'india_pack_tests_seed: expected 8 IN rows, found %', v_n; END IF;
END $$;
`);
```

Run: `node scripts/localization/gen-india-pack-seed.mjs` → expected FAIL if the S3 fixtures are absent/malformed; expected: complete SQL on stdout with 8 VALUES rows and the count-pin DO block.

- [ ] **Step 2: Apply the migration**

Redirect the generator output to the scratchpad, read it, and apply the emitted SQL **verbatim** via `mcp__supabase__apply_migration`, name `phase4_india_pack_tests_seed`. Then assert via `mcp__supabase__execute_sql`:

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE t.input_document->'_meta'->'external_validation'->>'status' = 'pending') AS pending
FROM master_country_pack_tests t JOIN geo_countries c ON c.id = t.country_id
WHERE c.code = 'IN' AND c.deleted_at IS NULL AND t.deleted_at IS NULL;
```

Expected: `total = 8, pending = 8`.

- [ ] **Step 3: Add the IN row to the CI statutory-fixtures gate (test-first — this IS the test)**

Edit `scripts/localization/statutory-fixtures.test.ts`: after the existing SA imports (line 13), add the 8 imports and extend `REPO_FIXTURES` (lines 15–22):

```typescript
import inIntraState from '../../src/lib/regimes/in_gst/fixtures/in_intra_state_sac_998319.json';
import inInterState from '../../src/lib/regimes/in_gst/fixtures/in_inter_state_igst.json';
import inInclusiveB2c from '../../src/lib/regimes/in_gst/fixtures/in_inclusive_b2c_5000.json';
import inHeadVsLine from '../../src/lib/regimes/in_gst/fixtures/in_head_vs_line_rounding.json';
import inUtgst from '../../src/lib/regimes/in_gst/fixtures/in_utgst_chandigarh.json';
import inCreditNote from '../../src/lib/regimes/in_gst/fixtures/in_credit_note_full_reversal.json';
import inAdvanceNetting from '../../src/lib/regimes/in_gst/fixtures/in_advance_then_invoice_netting.json';
import inUnregistered from '../../src/lib/regimes/in_gst/fixtures/in_unregistered_seller_plain.json';
```

and in the map (adjust import names to S3's shipped filenames if they differ — the count of 8 is the pin):

```typescript
  // P4 S7: IN publishes statutory_ready through gate ⑤ — the live-DB half REQUIRES
  // these repo fixtures the moment config_status flips (see the assertion below).
  IN: [inIntraState, inInterState, inInclusiveB2c, inHeadVsLine, inUtgst,
       inCreditNote, inAdvanceNetting, inUnregistered] as unknown as PackFixture[],
```

Run: `npx vitest run --config vitest.config.scripts.ts scripts/localization/statutory-fixtures.test.ts` → expected PASS (repo half replays all four countries through the kernel; the extra `_meta` key is inert — `runPublishGate` casts `input_document` to `TaxContext` and diffs `expected` as a leaf-subset, `src/lib/tax/publishGate.ts:57-66`).

- [ ] **Step 4: Author + submit the IN pack v1 draft (Admin A)**

Via `mcp__supabase__execute_sql`, one transaction, impersonating Admin A with the P3 recipe (`scripts/country-engine/publish-ae-pack.md` Step 1–2):

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','d1139ac6-526c-4805-bbea-790985233725','role','authenticated')::text, true);
SELECT create_country_pack_draft(
  (SELECT id FROM geo_countries WHERE code='IN' AND deleted_at IS NULL),
  'India pack v1 — GST launch (18% slab, Rule 46/49/50/51, FY numbering, gate-5 CA validation)') AS pack_id;
COMMIT;
```

Then run the fixtures so gate ① has fresh honest results — kernel-green basis is the Step-3 CI suite (the AE-runbook honesty rule): for each of the 8 rows, still as Admin A:

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','d1139ac6-526c-4805-bbea-790985233725','role','authenticated')::text, true);
SELECT record_pack_test_result(t.id, jsonb_build_object('pass', true, 'diffs', '[]'::jsonb, 'name', t.name))
FROM master_country_pack_tests t
JOIN geo_countries c ON c.id = t.country_id
WHERE c.code='IN' AND c.deleted_at IS NULL AND t.deleted_at IS NULL;
SELECT submit_country_pack_for_review(
  (SELECT id FROM master_country_pack_versions
    WHERE country_id=(SELECT id FROM geo_countries WHERE code='IN' AND deleted_at IS NULL)
      AND status='draft' ORDER BY version DESC LIMIT 1));
COMMIT;
```

(In the app this is the Studio Pack Fixtures tab "Run fixtures" → "Submit"; the SQL path is the same governed RPCs. Submit does not stale fixtures — P3 fix `phase3_wp7_submit_no_content_bump`.) Expected: pack v1 `in_review`, 8 fixtures `last_result.pass=true`, none stale.

- [ ] **Step 5: NEGATIVE publish — the gate's own end-to-end test (Admin B)**

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','4db807ae-09f7-4db9-89b4-b7a68cf67fc0','role','authenticated')::text, true);
SELECT publish_country_pack((SELECT id FROM geo_countries WHERE code='IN' AND deleted_at IS NULL), 1);
COMMIT;
SELECT config_status FROM geo_countries WHERE code='IN' AND deleted_at IS NULL;
```

Expected — and this exact JSON is archived on the PR as the negative proof:
`{"published": false, "config_status": "formatting_ready", "gate": {..., "fixtures": {"total": 8, "passed": 8, "stale": 0}, "external_validation": {"pass": false, "unvalidated": 8}, "blockers": ["8 fixture(s) await external validation sign-off"]}}` and `config_status` unchanged. If ANY other blocker appears, an upstream WP (S1b coverage / S3-S6 capabilities) regressed — stop and fix there, not here. Save the returned JSON to `docs/compliance/india/evidence/negative-publish-gate.json` (create the directory).

- [ ] **Step 6: Regen types, manifest row, commit**

Regenerate `src/types/database.types.ts` via `mcp__supabase__generate_typescript_types` (data-only migration — expect zero diff). Append to `supabase/migrations.manifest.md`:

```
| <applied-version> | phase4_india_pack_tests_seed.sql | Additive (data) | 8 in_gst fixtures seeded into master_country_pack_tests (machine-generated by scripts/localization/gen-india-pack-seed.mjs; _meta.external_validation='pending' folded into input_document for gate ⑤; NOT EXISTS idempotence; in-migration count-pin=8). IN pack v1 drafted+submitted (Admin A) and NEGATIVE publish proven (Admin B): published=false, external_validation.unvalidated=8 — evidence at docs/compliance/india/evidence/negative-publish-gate.json | P4 S7 |
```

```bash
git add scripts/localization/gen-india-pack-seed.mjs scripts/localization/statutory-fixtures.test.ts docs/compliance/india/evidence/negative-publish-gate.json supabase/migrations.manifest.md src/types/database.types.ts && git commit -m "feat(pack): seed 8 IN pack tests + negative-publish proof for gate 5 (P4 S7)"
```

---

### Task S7.3: CA validation package — handoff generator, deferrals-and-treatments memo, rendered PDFs

> **Rebase gate: `main` must contain WP-L1 and WP-L4 before this task** (₹/lakh/Indian-words rendering and the Receipt Voucher document the CA reviews). `git fetch origin && git rebase origin/main`.

**Files:**
- Create: `scripts/localization/generate-ca-package.test.ts`
- Create: `docs/compliance/india/deferrals-and-treatments-memo.md`
- Create: `docs/compliance/india/README.md`
- Create: `docs/compliance/india/ca-package/` (generated `ca-validation-handoff.md` + 3 operator-exported PDFs)
- Modify: `package.json` (scripts block, lines 6–29 verified — add `pack:ca-package`)

**Interfaces:**
- Consumes: the 8 fixture JSONs + `_meta.citations` (WP-S3); `runPublishGate({countryCode, fixtures, mode:'kernel'})` from `src/lib/tax/publishGate.ts:44`; `registerAllRegimePlugins` from `src/lib/regimes/register.ts`; the IN test tenant (WP-S2) with issued documents: a per-head GST tax invoice + India credit note (WP-S4 render), a Rule 50 Receipt Voucher (WP-L4 builder + preview), all with lakh grouping/₹/Indian words (WP-L1); node `crypto.createHash('sha256')`.
- Produces: `docs/compliance/india/ca-package/ca-validation-handoff.md` (drift-gated: committed content must equal fixture-derived content); `docs/compliance/india/deferrals-and-treatments-memo.md` whose sha256 is the `memo_sha256` transcribed into every fixture's `_meta.external_validation` at sign-off (D7 "signed memo hash-referenced"); the three rendered PDFs `in-tax-invoice.pdf`, `in-credit-note.pdf`, `in-receipt-voucher.pdf` under `docs/compliance/india/ca-package/`; npm script `pack:ca-package`.

- [ ] **Step 1: Author the deferrals-and-treatments memo (two labeled lists — §4-S7 / §7)**

Write `docs/compliance/india/deferrals-and-treatments-memo.md` in full:

```markdown
# India GST Pack v1 — Deferrals & Implemented Treatments Memo (for CA ratification)

This memo accompanies `ca-validation-handoff.md`. The CA is asked to ratify BOTH lists
by signing this memo; the signed copy's SHA-256 is transcribed into every fixture's
`_meta.external_validation.memo_sha256` and is checked by the publish pipeline.

## List A — Deferred items (not in v1; ratify that omission is compliant for a service lab)

1. **Debit notes** — a second tax invoice is issued instead (compliant substitute under Sec 34 read with Rule 53; ratify).
2. **Automated linked two-document goods flow** — v1 ships an in-product guidance banner directing goods+services jobs to a separate goods tax invoice; the linked automation is deferred.
3. **Media-destruction / certificate-of-destruction GST treatment** — destruction service billing treatment deferred; labs bill it as recovery service (SAC 998319) or not at all in v1.
4. **Composition scheme / Bill of Supply (Rule 49)** — unsupported; a wholly-exempt document is BLOCKED with "consult CA" guidance (see List B item 2).
5. **Mixed-slab documents** — only the 18% slab + nil-rated + exempt are seeded; 5/12/28 not seeded in v1.
6. **GSTR-1 B2B (Table 4) rows, documents-issued table, portal JSON, GSTR-3B Table 4 ITC, GSTR-1 Table 11 advance rows** — GSTR outputs are display-only summaries (3B 3.1(a)/3.1(c)/3.2 + GSTR-1 Table 12 HSN); not fileable artifacts. The advance-adjustment data model supports later Table 11 composition.
7. **LUT zero-rated exports** — 'zero' in v1 means nil-rated domestic only.
8. **e-invoicing (IRN/IRP), e-way bill API, CESS, GST-TDS (Sec 51), GSTR-7** — readiness flag + warning only for e-invoicing; the rest out of scope v1.

## List B — Implemented treatments submitted for ratification

1. **Advance GST netting** — Receipt Voucher (Rule 50) posts tax at receipt (18/118 back-out; proviso defaults: 18%, IGST where indeterminable); the final invoice posts net-of-advance via an offsetting adjustment in the invoice period; conservation holds (voucher tax + invoice net tax = total supply tax). Fixture: `in_advance_then_invoice_netting`.
2. **Bill-of-Supply guard for wholly-exempt documents** — instead of emitting a non-compliant tax invoice, issuance is blocked with guidance to consult the CA (Rule 49 deferral, List A item 4).
3. **Section 170 rounding at head level** — line taxes at 2dp half-up; whole-rupee rounding per tax head per invoice; a persisted "Round off" out-of-scope adjustment line ties invoice, ledger and return. CGST/SGST pairs are each independently 9% and always equal (381.36/381.36 on the inclusive ₹5,000 fixture, round-off −0.01).
4. **Special place-of-supply codes 96 (foreign) / 97 (Other Territory)** — seeded as place-of-supply-only rows, flagged non-GSTIN (excluded from GSTIN validation).

## Sign-off

- [ ] Both lists ratified as presented
- Validator name / firm: ______________________
- Membership no. (ICAI): ______________________
- Date: ____________  Reference: ____________
```

```bash
git add docs/compliance/india/deferrals-and-treatments-memo.md && git commit -m "docs(compliance): India CA deferrals-and-treatments memo for ratification (P4 S7)"
```

- [ ] **Step 2: Write the failing package-generator test**

```typescript
// scripts/localization/generate-ca-package.test.ts
// GENERATE=1 npm run pack:ca-package  → writes docs/compliance/india/ca-package/ca-validation-handoff.md
// Without GENERATE: drift gate — the committed handoff MUST equal fixture-derived content,
// the memo hash embedded in it MUST equal the current memo's sha256, and the three
// operator-exported PDFs MUST exist. Any fixture edit re-enters the CA loop.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { runPublishGate, type PackFixture } from '../../src/lib/tax/publishGate';

const FIXTURE_DIR = path.resolve(__dirname, '../../src/lib/regimes/in_gst/fixtures');
const PKG_DIR = path.resolve(__dirname, '../../docs/compliance/india/ca-package');
const OUT = path.join(PKG_DIR, 'ca-validation-handoff.md');
const MEMO = path.resolve(__dirname, '../../docs/compliance/india/deferrals-and-treatments-memo.md');
const PDFS = ['in-tax-invoice.pdf', 'in-credit-note.pdf', 'in-receipt-voucher.pdf'];

interface InGstFixtureFile {
  name: string;
  input_document: Record<string, unknown>;
  expected: Record<string, unknown>;
  _meta: {
    citations: string[];
    external_validation: { status: string; memo_sha256?: string };
  };
}

function memoSha256(): string {
  return createHash('sha256').update(readFileSync(MEMO)).digest('hex');
}

async function buildHandoff(fixtures: InGstFixtureFile[]): Promise<string> {
  const gate = await runPublishGate({
    countryCode: 'IN',
    fixtures: fixtures as unknown as PackFixture[],
    mode: 'kernel',
  });
  expect(gate.pass, `kernel must reproduce every fixture before the CA sees it: ${
    JSON.stringify(gate.results.filter((r) => !r.pass), null, 2)}`).toBe(true);

  const s: string[] = [
    '# India GST Pack v1 — External CA Validation Handoff',
    '',
    'Generated from `src/lib/regimes/in_gst/fixtures/` — DO NOT EDIT BY HAND.',
    `Companion memo: \`deferrals-and-treatments-memo.md\` (sha256 \`${memoSha256()}\`) — ratify both lists.`,
    'Rendered PDF exhibits in this folder: ' + PDFS.map((p) => `\`${p}\``).join(', ') + '.',
    'Reviewer instructions: verify each fixture\'s expected values against the cited statutes,',
    'sign each block, sign the memo, return both. Each sign-off is transcribed into the',
    'fixture `_meta.external_validation` and enforced by publish gate ⑤.',
    '',
  ];
  for (const fx of fixtures) {
    s.push(
      `## Fixture: ${fx.name}`, '',
      '### Input document', '```json', JSON.stringify(fx.input_document, null, 2), '```',
      '### Expected statutory result (kernel-reproduced at generation time)', '```json',
      JSON.stringify(fx.expected, null, 2), '```',
      '### Statutory citations',
      ...fx._meta.citations.map((c) => `- ${c}`),
      '',
      '### Sign-off',
      '- [ ] Computation verified correct per the citations above',
      '- Validator name / firm: ______________________',
      '- Membership no. (ICAI): ______________________',
      '- Date: ____________  Reference: ____________',
      '',
    );
  }
  s.push(
    '## Data annexes for review',
    '- GST state codes: full active set incl. 26 (merged DNH+DD), 38 (Ladakh), AP=37; special 96/97 seeded place-of-supply-only, non-GSTIN (migration `phase4_india_data_pack`)',
    '- Slabs seeded: 18% standard (CGST 9 / SGST 9 / IGST 18, UTGST-labelled in UTs) + nil-rated + exempt ONLY (owner D5)',
    "- Rounding: { mode: 'half_up', level: 'head', cash_increment: 1 } — Section 170, per-head whole-rupee, persisted Round-off line",
    "- Numbering: 'INV/{FY}/{SEQ:4}', {FY} short-form (e.g. '25-26'), fiscal anchor 04-01, 16-char cap (Rule 46(b)), charset [A-Za-z0-9/-]",
    '- Documents: Tax Invoice (Rule 46), Credit Note (own FY series, original-invoice ref), Receipt Voucher (Rule 50), Refund Voucher (Rule 51, references the receipt voucher)',
    '',
  );
  return s.join('\n');
}

describe('CA validation package (P4 S7, D7)', () => {
  it('generates (GENERATE=1) or drift-checks the committed handoff, memo hash, and PDF exhibits', async () => {
    const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).sort();
    expect(files.length, 'in_gst fixture count is pinned').toBe(8);
    const fixtures = files.map((f) =>
      JSON.parse(readFileSync(path.join(FIXTURE_DIR, f), 'utf8')) as InGstFixtureFile);

    const content = await buildHandoff(fixtures);
    if (process.env.GENERATE === '1') {
      writeFileSync(OUT, content);
      expect(existsSync(OUT)).toBe(true);
      return;
    }
    expect(existsSync(OUT), 'run: GENERATE=1 npm run pack:ca-package').toBe(true);
    expect(readFileSync(OUT, 'utf8')).toBe(content);
    for (const pdf of PDFS) {
      expect(existsSync(path.join(PKG_DIR, pdf)),
        `${pdf} must be exported from the IN test tenant (README step 3)`).toBe(true);
    }
    const memoHash = memoSha256();
    for (const fx of fixtures) {
      const ev = fx._meta.external_validation;
      if (ev.status === 'validated') {
        expect(ev.memo_sha256, `${fx.name}: validated sign-off must reference the memo`).toBe(memoHash);
      }
    }
  });
});
```

Add to `package.json` scripts (after `"check:bypass-suite"`, line 28):

```json
    "pack:ca-package": "vitest run --config vitest.config.scripts.ts scripts/localization/generate-ca-package.test.ts"
```

Run: `npm run pack:ca-package` → expected FAIL: `run: GENERATE=1 npm run pack:ca-package` (handoff not yet generated).

- [ ] **Step 3: Export the three PDF exhibits from the IN test tenant (operator step)**

In the running app (`npm run dev`), signed into the IN test tenant (WP-S2), download via the real document preview/print surfaces: (a) the WP-S4 per-head GST tax invoice (CGST/SGST columns, HSN/SAC, place of supply, ₹ + lakh grouping + Indian words from L1) → save as `docs/compliance/india/ca-package/in-tax-invoice.pdf`; (b) the WP-S4 India credit note (own series, original-invoice ref) → `in-credit-note.pdf`; (c) the WP-L4 Rule 50 Receipt Voucher for an advance → `in-receipt-voucher.pdf`. These are the CA's rendered exhibits (D7: fixtures + rendered PDFs, not fixtures alone).

- [ ] **Step 4: Generate, verify green, document the loop, commit**

Run: `GENERATE=1 npm run pack:ca-package` → writes the handoff (expected PASS). Then `npm run pack:ca-package` (no GENERATE) → expected PASS (drift check + 3 PDFs present + memo-hash rule vacuous while `pending`).

Create `docs/compliance/india/README.md`:

```markdown
# India pack — external CA validation workflow (owner D7)

1. `GENERATE=1 npm run pack:ca-package` regenerates `ca-package/ca-validation-handoff.md`
   from the 8 fixtures. Any fixture edit MUST regenerate it (CI drift gate).
2. Deliver to the engaged CA: the handoff, `deferrals-and-treatments-memo.md`, and the
   three PDF exhibits in `ca-package/`.
3. The CA verifies each fixture against its citations, signs every fixture block AND the
   memo (both lists ratified), and returns the signed documents.
4. Compute the memo sha256 (`node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(f.readFileSync('docs/compliance/india/deferrals-and-treatments-memo.md')).digest('hex'))"`).
   Transcribe into every fixture's `_meta.external_validation`:
   `{ "status": "validated", "validator": "<name/firm>", "credential": "ICAI <membership no.>",
      "reference": "<engagement ref>", "memo_sha256": "<hash>", "signed_off_at": "YYYY-MM-DD" }`.
   Commit the signed PDFs under `docs/compliance/india/signoffs/`.
5. Re-run `GENERATE=1 npm run pack:ca-package` and follow
   `scripts/country-engine/publish-in-pack.md` (upsert → staleness re-run → dual-control publish).
6. Publish gate ⑤ (`publish_country_pack`) hard-blocks until step 4 is complete. Any later
   fixture change re-enters this loop from step 1.
```

```bash
git add scripts/localization/generate-ca-package.test.ts package.json docs/compliance/india && git commit -m "feat(compliance): CA validation package — handoff generator, memo hash gate, PDF exhibits (P4 S7)"
```

---

### Task S7.4: Capability assertion — all 4 India plugin rows present

**Files:**
- Create: `scripts/localization/india-capabilities.test.ts`

**Interfaces:**
- Consumes: `registerAllRegimePlugins()` (`src/lib/regimes/register.ts`) and `listRegisteredCapabilities()` (`src/lib/regimes/registry.ts`) — WP-S3/S4/S5/S6 each registered `in_gst` / `in_gst_invoice` / `in_fiscal_numbering` / `gstr` and ran `syncEngineCapabilities()` (`src/lib/tax/capabilityManifest.ts:21`) in their own PRs (spec §2: rows are never hand-seeded); live `master_engine_capabilities` (projection); `SUPABASE_DB_URL` + `psql` self-skip pattern from `statutory-fixtures.test.ts:36`.
- Produces: a pinned repo+live assertion that the 4 rows exist before publish — a missing row would silently degrade the publish to `formatting_ready` (gate ② degrades, it does not block), which is exactly the dishonest outcome this test makes loud.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/localization/india-capabilities.test.ts
// S7 pre-publish assertion (spec §2): the 4 India plugin capability rows must exist,
// each synced from code by its own WP — NEVER hand-seeded here. If this fails, the
// fix is syncEngineCapabilities() in the OWNING plugin WP, not an INSERT.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { registerAllRegimePlugins } from '../../src/lib/regimes/register';
import { listRegisteredCapabilities } from '../../src/lib/regimes/registry';

const INDIA_CAPABILITY_KEYS = ['in_gst', 'in_gst_invoice', 'in_fiscal_numbering', 'gstr'] as const;

describe('India capability manifest (repo half — always runs)', () => {
  it('the code registry registers all 4 India plugin capabilities', () => {
    registerAllRegimePlugins();
    const keys = new Set(listRegisteredCapabilities().map((c) => c.capability_key));
    for (const k of INDIA_CAPABILITY_KEYS) {
      expect(keys.has(k), `capability '${k}' missing from the code registry`).toBe(true);
    }
  });
});

describe.skipIf(!process.env.SUPABASE_DB_URL)('India capability manifest (live-DB half)', () => {
  it('all 4 rows are present and live in master_engine_capabilities', () => {
    const dbUrl = process.env.SUPABASE_DB_URL as string;
    const inList = INDIA_CAPABILITY_KEYS.map((k) => `'${k}'`).join(',');
    const out = execSync(
      `psql "${dbUrl}" -t -A -c "SELECT count(*) FROM master_engine_capabilities WHERE capability_key IN (${inList}) AND deleted_at IS NULL"`,
      { encoding: 'utf8' },
    ).trim();
    expect(out, 'each plugin WP syncs its own row via sync_engine_capabilities — never INSERT here').toBe('4');
  });
});
```

Run: `npx vitest run --config vitest.config.scripts.ts scripts/localization/india-capabilities.test.ts` → expected PASS on the repo half if S3–S6 shipped correctly (if RED, the failure names the delinquent plugin — fix belongs in that WP's follow-up, not here); live half self-skips locally.

- [ ] **Step 2: Live verification + commit**

Via `mcp__supabase__execute_sql` (mirrors the live half so the assertion is executed now, not only in CI):

```sql
SELECT capability_key FROM master_engine_capabilities
WHERE capability_key IN ('in_gst','in_gst_invoice','in_fiscal_numbering','gstr')
  AND deleted_at IS NULL ORDER BY capability_key;
```

Expected: exactly 4 rows. Then:

```bash
git add scripts/localization/india-capabilities.test.ts && git commit -m "test(pack): pin the 4 India plugin capability rows pre-publish (P4 S7)"
```

---

### Task S7.5: CA sign-off transcription → fixture-staleness re-run → live dual-control publish

> Blocks on the signed memo + signed handoff returned by the CA (D7). Everything up to here shipped with `pending` fixtures.

**Files:**
- Modify: `src/lib/regimes/in_gst/fixtures/*.json` (8 files — `_meta.external_validation` only; **never** touch `input_document`/`expected` — the CA signed those numbers)
- Create: `docs/compliance/india/signoffs/` (signed PDFs from the CA)
- Create: `scripts/country-engine/publish-in-pack.md` (runbook + evidence, pattern: `scripts/country-engine/publish-ae-pack.md`)
- Create: `docs/compliance/india/evidence/positive-publish-gate.json`

**Interfaces:**
- Consumes: `upsert_country_pack_test(p_row jsonb)→uuid` (verified live: with `id` it UPDATEs the row, nulls `last_run_at`/`last_result` — stale by construction — and `_pack_touch` bumps `content_updated_at`; requires an open draft/in_review pack, which Task S7.2 left `in_review`); `record_pack_test_result(uuid, jsonb)`; `publish_country_pack(uuid, int)` with gate ⑤ (Task S7.1); the CI-green kernel replay (Task S7.2 Step 3) as the honest basis for recorded passes; Admin A/B UUIDs (Task S7.2 Interfaces).
- Produces: IN `config_status='statutory_ready'` machine-derived; archived positive gate JSON; the publish runbook.

- [ ] **Step 1: Transcribe the sign-off into the 8 fixture JSONs**

Compute the memo hash (README step 4 command). Edit each fixture's `_meta.external_validation` to (real values from the signed documents):

```json
{ "status": "validated", "validator": "<name/firm from the signed handoff>",
  "credential": "ICAI <membership no.>", "reference": "<engagement reference>",
  "memo_sha256": "<computed hash>", "signed_off_at": "<YYYY-MM-DD>" }
```

Place the signed PDFs under `docs/compliance/india/signoffs/`. Regenerate + verify: `GENERATE=1 npm run pack:ca-package && npm run pack:ca-package` → expected PASS (memo-hash rule now armed and green — a wrong hash fails here, before anything touches the DB).

```bash
git add src/lib/regimes/in_gst/fixtures docs/compliance/india && git commit -m "feat(compliance): transcribe CA sign-off into the 8 in_gst fixtures (memo hash referenced) (P4 S7)"
```

- [ ] **Step 2: Push the validated `_meta` into the DB rows through the governed RPC (Admin A)**

Generate the 8 `upsert_country_pack_test` calls from the now-validated JSONs (fixture-driven — no hand-typed JSON):

```bash
node -e '
const { readdirSync, readFileSync } = require("node:fs");
const dir = "src/lib/regimes/in_gst/fixtures";
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const fx = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  const row = { name: fx.name, input_document: { ...fx.input_document, _meta: fx._meta }, expected: fx.expected };
  const lit = JSON.stringify(row).replace(/\x27/g, "\x27\x27");
  console.log(`SELECT upsert_country_pack_test((jsonb_build_object(\x27country_id\x27,(SELECT id FROM geo_countries WHERE code=\x27IN\x27 AND deleted_at IS NULL),\x27id\x27,(SELECT id FROM master_country_pack_tests WHERE name=\x27${fx.name}\x27 AND country_id=(SELECT id FROM geo_countries WHERE code=\x27IN\x27 AND deleted_at IS NULL) AND deleted_at IS NULL)) || \x27${lit}\x27::jsonb));`);
}
' > "$SCRATCHPAD/in-signoff-upserts.sql"
```

Execute the 8 emitted statements via `mcp__supabase__execute_sql` in one transaction prefixed with the Admin-A `set_config('request.jwt.claims', ...)` impersonation (exactly as Task S7.2 Step 4). Expected: 8 uuids returned; each row now has validated `_meta`, `last_run_at IS NULL` (stale by construction), and `content_updated_at` bumped.

- [ ] **Step 3: Fixture-staleness re-run immediately before publish (Admin A)**

The upserts staled every result AND bumped content freshness — gate ① would now block. Re-verify the kernel basis then re-record, still as Admin A:

```bash
npx vitest run --config vitest.config.scripts.ts scripts/localization/statutory-fixtures.test.ts
```

Expected PASS (the validated `_meta` changed nothing computational). Then via `mcp__supabase__execute_sql` (Admin-A impersonation transaction):

```sql
SELECT record_pack_test_result(t.id, jsonb_build_object('pass', true, 'diffs', '[]'::jsonb, 'name', t.name))
FROM master_country_pack_tests t
JOIN geo_countries c ON c.id = t.country_id
WHERE c.code='IN' AND c.deleted_at IS NULL AND t.deleted_at IS NULL;
```

Verify freshness: `SELECT count(*) FILTER (WHERE last_run_at IS NULL) AS stale FROM master_country_pack_tests t JOIN geo_countries c ON c.id=t.country_id WHERE c.code='IN' AND t.deleted_at IS NULL;` → `stale = 0`.

- [ ] **Step 4: Dual-control POSITIVE publish (Admin B ≠ author) + persistence checks**

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','4db807ae-09f7-4db9-89b4-b7a68cf67fc0','role','authenticated')::text, true);
SELECT publish_country_pack((SELECT id FROM geo_countries WHERE code='IN' AND deleted_at IS NULL), 1);
COMMIT;
```

Expected: `{"published": true, "config_status": "statutory_ready", "gate": {"fixtures": {"total": 8, "passed": 8, "stale": 0}, "capabilities": {"required": ["in_gst","in_fiscal_numbering","in_gst_invoice","no_einvoice","gstr"], "missing": []}, "dual_control": true, "coverage": {"standard_rate": true, ...}, "external_validation": {"pass": true, "unvalidated": 0}, "blockers": []}}`. Save verbatim to `docs/compliance/india/evidence/positive-publish-gate.json`. Then verify persistence:

```sql
SELECT config_status FROM geo_countries WHERE code='IN' AND deleted_at IS NULL;
-- expect 'statutory_ready' (machine-derived — at no point hand-set)
SELECT status, authored_by <> approved_by AS dual_held, effective_from
FROM master_country_pack_versions
WHERE country_id=(SELECT id FROM geo_countries WHERE code='IN' AND deleted_at IS NULL) AND version=1;
-- expect 'published', dual_held = true, effective_from = today
SELECT country_pack_version FROM tenants
WHERE country_id=(SELECT id FROM geo_countries WHERE code='IN' AND deleted_at IS NULL) AND deleted_at IS NULL;
-- expect 1 on the IN test tenant (publish-tail resync + numbering-apply + pin ran)
```

- [ ] **Step 5: Write the runbook + commit the evidence**

Create `scripts/country-engine/publish-in-pack.md` recording, in the `publish-ae-pack.md` format: the two admin identities, the exact executed sequence (S7.2 draft/run/submit/negative → S7.5 transcribe/upsert/re-run/positive), both gate JSONs (negative `unvalidated:8`, positive `pass:true`), the persistence-check results, and any findings surfaced live (the P3 lesson: the runbook section is where live-only failures get recorded and carried forward — if any step deviates from this plan's expectations, STOP, record the finding, fix via the systematic-debugging skill, and only then proceed).

```bash
git add scripts/country-engine/publish-in-pack.md docs/compliance/india/evidence/positive-publish-gate.json && git commit -m "feat(pack): India pack v1 PUBLISHED statutory_ready through gate 5 dual-control (P4 S7)"
```

---

### Task S7.6: GA checklist document (spec §5 content)

**Files:**
- Create: `docs/compliance/india/ga-checklist.md`

**Interfaces:**
- Consumes: spec §5 (the locked GA-checklist content); the honest-degrade assertion set named there (WP-S4's `generic_invoice` dev assertion; WP-L2's unregistered-mode loud treatment + D6 silent-fallback dev assertion + branch-state mismatch warning).
- Produces: the GA checklist that WP-GA executes and fills — the gate between `statutory_ready` and the first real lab tenant (D4).

- [ ] **Step 1: Write the checklist in full**

```markdown
# India Pack — GA Onboarding Checklist (owner D4: gates the FIRST REAL lab tenant)

`statutory_ready` was flipped by the machine publish gate (evidence:
`docs/compliance/india/evidence/positive-publish-gate.json`). This checklist is the
second stage: ALL boxes ✓ before onboarding a real Indian data-recovery lab.
WP-GA executes the two dry-run branches on the IN test tenant and records results here.

## Merge state
- [ ] WP-L1 merged (lakh/crore grouping, Indian words, ₹ both render paths)
- [ ] WP-L2 merged (GSTIN registration capture + registered/unregistered status setting)
- [ ] WP-L3 merged (TDS withholding in record_payment)
- [ ] WP-L4 merged (Receipt/Refund Vouchers + advance money leg + case-lifecycle hooks)
- [ ] WP-L5 merged (IRN-readiness flag + warning + QR real-estate)
- [ ] WP-L6 merged (Rule 55 Delivery Challan in triplicate)

## WP-GA dry-run branch 1 — recovered (record run date, case number, document numbers)
- [ ] intake → advance captured → Receipt Voucher issued (Rule 50, GST at receipt)
- [ ] diagnosis → quote shows per-head GST breakup (CGST/SGST or IGST) on screen AND PDF
- [ ] approval → recovery → invoice issued NET of advance (conservation: voucher tax + invoice net tax = supply tax)
- [ ] payment recorded with TDS withheld (invoice settles in full; withholding credit row posted)
- [ ] device checkout emits the Delivery Challan (triplicate, checkout-event device set)

## WP-GA dry-run branch 2 — no recovery
- [ ] diagnosis → no_solution → Refund Voucher issued (Rule 51, references the receipt voucher)
- [ ] retained-advance terminal: evaluation-service tax invoice (SAC 998319) the advance allocates against

## Honest-degrade assertions (all must be demonstrably green)
- [ ] S4: registered IN tenant resolving regime.documents to generic_invoice = hard dev-assertion failure
- [ ] L2: unregistered mode is LOUD (explicit setting, plain-invoice treatment visible)
- [ ] L2: D6 silent-fallback dev assertion fires on any silent unregistered fallback
- [ ] L2: branch-state mismatch warning (active branches.subdivision_id ≠ GSTIN state → settings banner + dev assertion)

## Known platform gaps called out (NOT India Pack deliverables)
- GST-on-quote rides the existing quote surfaces (rate picker from S1b rows + S2 threading;
  per-head rendering owned by S4's acceptance item — verified there).
- The portal `case_quotes` loop is pre-existing broken (0 rows platform-wide); customer
  quote approval happens off-portal until the platform gap is fixed. Do not present the
  portal quote flow to the first lab as working.

## Sign-off
- [ ] Owner reviewed both recorded dry-run branches and all assertions → GA approved
```

```bash
git add docs/compliance/india/ga-checklist.md && git commit -m "docs(compliance): India GA onboarding checklist — second publish stage per D4 (P4 S7)"
```

---

### Task S7.7: WP exit — typecheck, WP test suites, push, PR

**Files:** none new — verification only (fix regressions where found before pushing).

**Interfaces:**
- Consumes: everything above; `gh` CLI.
- Produces: the open WP-S7 PR (owner merges — do NOT merge).

- [ ] **Step 1: Typecheck** — run `npm run typecheck` un-piped. Expected: exit 0, zero errors (MEMORY lesson: never trust a piped/summarized tsc result).
- [ ] **Step 2: WP test suites** — run:

```bash
npx vitest run --config vitest.config.scripts.ts scripts/localization/generate-ca-package.test.ts scripts/localization/india-capabilities.test.ts scripts/localization/statutory-fixtures.test.ts
```

Expected: all green (live-DB halves self-skip locally; CI runs them with `SUPABASE_DB_URL`).
- [ ] **Step 3: Schema drift** — run `npm run check:schema-drift`. Expected: green (both S7 migrations regenerated types in their own steps).
- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/india-s7-ca-gate-publish
gh pr create --base main --title "P4 S7: CA gate 5 + governed publish — India statutory_ready" --body "$(cat <<'EOF'
## WP-S7 — CA Gate ⑤ + Governed Publish [MIGRATION PR]

- **Migration A** `phase4_publish_gate_external_validation`: publish gate ⑤ — any pack test declaring `_meta.external_validation` must be `validated` or publish blocks (generic mechanism; OM/AE/SA corpora unaffected, verified). Reconciled against live pg_get_functiondef.
- **Migration B** `phase4_india_pack_tests_seed`: 8 in_gst fixtures machine-seeded into `master_country_pack_tests` (count-pinned, idempotent).
- **Negative-publish proof**: `published:false`, `external_validation.unvalidated:8` — `docs/compliance/india/evidence/negative-publish-gate.json`.
- **CA package** (D7): fixture handoff generator with CI drift gate (`npm run pack:ca-package`), deferrals-AND-treatments memo (two ratified lists, sha256-referenced in every sign-off), 3 rendered PDF exhibits from the IN test tenant (invoice / credit note / receipt voucher — L1+L4).
- **Capability assertion**: 4 India plugin rows pinned repo+live (never hand-seeded).
- **Governed publish**: sign-off transcribed through `upsert_country_pack_test`, fixture-staleness re-run, dual-control publish (author ≠ approver) → **IN `config_status='statutory_ready'`, machine-derived**. Gate JSON archived: `docs/compliance/india/evidence/positive-publish-gate.json`. Runbook: `scripts/country-engine/publish-in-pack.md`.
- **GA checklist** created (`docs/compliance/india/ga-checklist.md`) — WP-GA executes and fills it; gates the first real lab tenant (D4).

Verification: `npm run typecheck` = 0; WP suites green; `check:schema-drift` green; manifest rows appended for both migrations.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Owner merges (do not merge). If the CA sign-off (Task S7.5) has not yet returned when the rest of the WP is done, split at the natural seam: open the PR with Tasks S7.1–S7.4 + S7.6 complete and the S7.5 steps listed as an in-PR checklist, then execute S7.5 and push the transcription/evidence commits to the same branch before requesting merge — gate ⑤ makes a premature merge harmless (India stays structurally unpublishable until the sign-off lands).

---


## Work Package WP-L1 — Lakh/Crore Formatting + Indian Words + ₹ [S, no migration]

Branch: `feat/india-l1-lakh-crore-words` (cut from `main`)
Depends on: WP-S4 merged (§5 ordering — L1 implements the amount-in-words hook S4's Rule 46 profile renders through, and S4's per-head acceptance test is what the Indian words/grouping ride on). Data inputs already live: `geo_countries.digit_grouping = '3;2'` and `currency_symbol = '₹'` for IN (verified on the canonical DB), the `format.amount_words_scale` registry key (`src/lib/country/registry.ts:253`, codedDefault `'western'`), and WP-S1b's IN binding `format.amount_words_scale='indian'` in `geo_countries.country_config`. No migration: the `_apply_country_config` snapshot mapper already writes `number_format.digit_grouping` and `format.amount_words_scale` into `tenants.resolved_country_config` (verified on the live OM tenant row), so this WP is pure TypeScript threading.

**Byte-parity exit gate:** every existing golden/parity suite (`src/lib/pdf/engine/*Parity*.test.ts`, `complianceMatrix.test.ts`, `src/lib/format.test.ts` regression pins) must pass unchanged — grouping `'3'` and scale `'western'` are the additive defaults on every new parameter, so non-India output is byte-identical.

### Task L1.1: `groupIntegerDigits` + in-app lakh/crore (`format.ts` + TenantConfig)

**Files:**
- Modify: `src/lib/format.ts` (grouping regex inside `formatCurrencyWithConfig` at `:63`; new export above `:47`)
- Modify: `src/types/tenantConfig.ts` (`CurrencyConfig` at `:12-26`; `DEFAULT_TENANT_CONFIG.currency` at `:90-100`)
- Modify: `src/lib/country/registry.ts` (append a `ConfigKeyDef` after the `number_format.amount_in_words_minor_units` block ending `:206`)
- Modify: `src/lib/tenantConfigService.ts` (engine currency block `:93-105`; legacy `mapRowToConfig` currency block `:159-171`)
- Test: `src/lib/format.test.ts` (extend; existing `cfg()` builder at `:157-168`), `src/lib/tenantConfigService.test.ts` (extend the `resolveTenantConfigFromLayers` describe at `:45`)

**Interfaces:**
- Consumes: `CurrencyConfig` (`src/types/tenantConfig.ts:12`); `resolveCountryConfigKey` + `COUNTRY_CONFIG_REGISTRY` (`src/lib/country/registry.ts`); the live snapshot key `number_format.digit_grouping` in `tenants.resolved_country_config` (populated DB-side by `_apply_country_config`; verified present on the live tenant).
- Produces: `groupIntegerDigits(intPart: string, grouping: '3' | '3;2', separator: string): string` (exported from `src/lib/format.ts`); `CurrencyConfig.digitGrouping?: '3' | '3;2'` (optional, additive — absent ⇒ `'3'` ⇒ byte-identical); registry key `number_format.digit_grouping` (schema `z.enum(['3','3;2'])`, codedDefault `'3'`, NOT required, NOT country-locked — so `STATUTORY_KEYS` and the registry↔trigger parity gate are untouched and no migration is needed).

- [ ] **Step 1: Write the failing format tests.** Append to `src/lib/format.test.ts`:

```typescript
describe('groupIntegerDigits (WP-L1)', () => {
  it("western '3' reproduces the legacy regex byte-for-byte", () => {
    expect(groupIntegerDigits('1000000', '3', ',')).toBe('1,000,000');
    expect(groupIntegerDigits('106200', '3', ',')).toBe('106,200');
    expect(groupIntegerDigits('123', '3', ',')).toBe('123');
  });
  it("lakh/crore '3;2': last 3, then pairs", () => {
    expect(groupIntegerDigits('1000000', '3;2', ',')).toBe('10,00,000');
    expect(groupIntegerDigits('106200', '3;2', ',')).toBe('1,06,200');
    expect(groupIntegerDigits('123', '3;2', ',')).toBe('123');
    expect(groupIntegerDigits('1234', '3;2', ',')).toBe('1,234');
    expect(groupIntegerDigits('123456789', '3;2', ',')).toBe('12,34,56,789');
    expect(groupIntegerDigits('-106200', '3;2', ',')).toBe('-1,06,200');
  });
});

describe('formatCurrencyWithConfig digitGrouping (WP-L1)', () => {
  it('renders the walkthrough total ₹1,06,200.00', () => {
    expect(
      formatCurrencyWithConfig(106200, cfg({ code: 'INR', symbol: '₹', position: 'before', digitGrouping: '3;2' })),
    ).toBe('₹1,06,200.00');
  });
  it('absent digitGrouping stays byte-identical to today', () => {
    expect(formatCurrencyWithConfig(106200, cfg({ symbol: '$', position: 'before' }))).toBe('$106,200.00');
  });
  it("explicit '3' equals absent", () => {
    expect(formatCurrencyWithConfig(106200, cfg({ symbol: '$', position: 'before', digitGrouping: '3' })))
      .toBe('$106,200.00');
  });
});
```

Add `groupIntegerDigits` to the existing `from './format'` import block at `format.test.ts:5`.
- [ ] **Step 2: Run** `npx vitest run --project node src/lib/format.test.ts` — Expected: FAIL (`groupIntegerDigits` is not exported; `digitGrouping` not a known `CurrencyConfig` property → tsc error in-test).
- [ ] **Step 3: Implement the type + the function.** In `src/types/tenantConfig.ts`, after `negativeFormat` (`:25`):

```typescript
  /** Integer digit grouping: '3' (Western thousands, default) or '3;2' (Indian
   *  lakh/crore). Resolved from the number_format.digit_grouping snapshot key
   *  (populated from geo_countries.digit_grouping). Optional — absent = '3',
   *  keeping every existing CurrencyConfig literal byte-identical. */
  digitGrouping?: '3' | '3;2';
```

and in `DEFAULT_TENANT_CONFIG.currency` after `negativeFormat: 'minus',` (`:99`): `digitGrouping: '3',`.
In `src/lib/format.ts`, above `formatCurrencyWithConfig` (`:47`):

```typescript
/** Group an integer digit string per the tenant's grouping style. '3' reproduces
 *  the legacy Western regex byte-for-byte; '3;2' is Indian lakh/crore (last 3
 *  digits, then 2-digit groups). Sign-aware. Pure. */
export const groupIntegerDigits = (
  intPart: string,
  grouping: '3' | '3;2',
  separator: string,
): string => {
  if (grouping === '3;2') {
    const sign = intPart.startsWith('-') ? '-' : '';
    const digits = sign ? intPart.slice(1) : intPart;
    if (digits.length <= 3) return intPart;
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, separator);
    return `${sign}${rest}${separator}${digits.slice(-3)}`;
  }
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
};
```

Replace `format.ts:63`:

```typescript
  const integerPart = groupIntegerDigits(parts[0], config.digitGrouping ?? '3', config.thousandsSeparator);
```

- [ ] **Step 4: Run** `npx vitest run --project node src/lib/format.test.ts` — Expected: PASS (including the pre-existing D18 grouping-separator pins at `:234`).
- [ ] **Step 5: Write the failing config-threading tests.** Append to `src/lib/tenantConfigService.test.ts` inside the `resolveTenantConfigFromLayers` describe (`:45`), reusing that suite's existing `baseRow`/layers idiom:

```typescript
  it("resolves digitGrouping '3;2' from the number_format.digit_grouping snapshot key (IN)", () => {
    const cfg = resolveTenantConfigFromLayers(baseRow, {
      country: { ...(layers.country as Record<string, unknown>), 'number_format.digit_grouping': '3;2' },
      tenant: {},
    });
    expect(cfg.currency.digitGrouping).toBe('3;2');
  });
  it("defaults digitGrouping to '3' when the snapshot lacks the key (legacy tenants)", () => {
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.digitGrouping).toBe('3');
  });
```

(If that describe names its fixture differently, thread the same two bags through whatever the first passing test at `:63` uses — the assertion pair is what matters.) Run `npx vitest run --project node src/lib/tenantConfigService.test.ts` — Expected: FAIL (`resolveCountryConfigKey` throws `CountryConfigError: unknown key` for the unregistered key / `digitGrouping` undefined).
- [ ] **Step 6: Register the key + thread it.** In `src/lib/country/registry.ts`, append immediately after the `number_format.amount_in_words_minor_units` entry (closing `},` at `:206`):

```typescript
  {
    key: 'number_format.digit_grouping',
    domain: 'number_format',
    label: 'Digit grouping',
    description: "Integer grouping style: '3' Western thousands, '3;2' Indian lakh/crore. Snapshot-populated from geo_countries.digit_grouping by _apply_country_config; display preference, not statutory.",
    schema: z.enum(['3', '3;2']),
    codedDefault: '3',
  },
```

In `src/lib/tenantConfigService.ts` `resolveTenantConfigFromLayers`, after `negativeFormat: ...` (`:104`):

```typescript
      digitGrouping: get<'3' | '3;2'>('number_format.digit_grouping'),
```

In `mapRowToConfig`, after `negativeFormat: 'minus',` (`:170`): `digitGrouping: '3',` (legacy seam is byte-stable by definition).
- [ ] **Step 7: Run** `npx vitest run --project node src/lib/tenantConfigService.test.ts src/lib/country` — Expected: PASS (the registry loop test at `registry.test.ts:108` iterates keys, so the addition passes it; nothing pins a key count — verify green).
- [ ] **Step 8: Commit.**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/types/tenantConfig.ts src/lib/country/registry.ts src/lib/tenantConfigService.ts src/lib/tenantConfigService.test.ts
git commit -m "feat(i18n): digit grouping '3;2' — lakh/crore in-app rendering via number_format.digit_grouping (WP-L1.1)"
```

### Task L1.2: PDF money path — `formatEngineMoney` '3;2' + country layer `groupingStyle` + adapter threading

**Files:**
- Modify: `src/lib/pdf/utils.ts` (`formatCurrency` grouping at `:47`; `formatEngineMoney` at `:69-85`)
- Modify: `src/lib/pdf/engine/countryConfig.ts` (locale block of `countryTemplateOverride` at `:117-134`)
- Modify: `src/lib/pdf/engine/adapters/invoiceAdapter.ts` (`money` at `:75-82`)
- Modify: `src/lib/pdf/engine/adapters/quoteAdapter.ts` (`money` at `:81-88`)
- Modify: `src/lib/pdf/engine/adapters/creditNoteAdapter.ts` (`money` at `:85-92`)
- Test: `src/lib/pdf/utils.test.ts` (extend), `src/lib/pdf/engine/countryConfig.test.ts` (extend), Create: `src/lib/pdf/engine/adapters/indianFormatting.test.ts`

**Interfaces:**
- Consumes: `ResolvedCountryFacts.digitGrouping` (already live — `countryConfig.ts:37`, read by `countryFactsService.ts:72`); the dormant `LocaleConfig.groupingStyle?: 'standard' | 'indian'` (`src/lib/pdf/templateConfig.ts:590` — set nowhere today, this task activates it); `buildInvoiceFixture` (`src/lib/pdf/engine/invoiceParity.fixtures.ts:19`).
- Produces: `formatEngineMoney(amount, opts)` with additive `opts.digitGrouping?: '3' | '3;2'`; `countryTemplateOverride` emitting `locale.groupingStyle = 'indian'` when `facts.digitGrouping === '3;2'`; invoice/quote/credit-note `money()` honoring it. Payment-receipt/payslip `formatEngineMoney` call sites are deliberately untouched (no country layer flows there today; the IN customer-facing receipt artifact is superseded by WP-L4's Rule 50 voucher).
- Note: `src/lib/pdf/utils.ts` deliberately does NOT import from `src/lib/format.ts` (documented import-chain isolation, `utils.ts:22-28`) — the grouping helper is a module-local mirror, same as the existing `formatCurrency` mirror.

- [ ] **Step 1: Write the failing utils tests.** Append to `src/lib/pdf/utils.test.ts`:

```typescript
describe("formatEngineMoney digitGrouping '3;2' (WP-L1)", () => {
  it('groups lakh/crore with the walkthrough total', () => {
    expect(formatEngineMoney(106200, { symbol: '₹', decimalPlaces: 2, position: 'before', digitGrouping: '3;2' }))
      .toBe('₹ 1,06,200.00');
    expect(formatEngineMoney(12345678.9, { symbol: '₹', decimalPlaces: 2, position: 'before', digitGrouping: '3;2' }))
      .toBe('₹ 1,23,45,678.90');
    expect(formatEngineMoney(250, { symbol: '₹', decimalPlaces: 2, position: 'before', digitGrouping: '3;2' }))
      .toBe('₹ 250.00');
  });
  it("absent / '3' stays byte-identical to today", () => {
    expect(formatEngineMoney(106200, { symbol: 'AED', decimalPlaces: 2, position: 'after' })).toBe('106,200.00 AED');
    expect(formatEngineMoney(106200, { symbol: 'AED', decimalPlaces: 2, position: 'after', digitGrouping: '3' }))
      .toBe('106,200.00 AED');
  });
  it('formatCurrency (CurrencyConfig mirror) honors digitGrouping', () => {
    expect(formatCurrency(106200, {
      code: 'INR', symbol: '₹', name: 'Indian Rupee', decimalPlaces: 2,
      decimalSeparator: '.', thousandsSeparator: ',', position: 'before',
      displayMode: 'symbol', negativeFormat: 'minus', digitGrouping: '3;2',
    })).toBe('₹1,06,200.00');
  });
});
```

(`formatCurrency` is already imported in this file's header; add `formatEngineMoney` alongside if the import list lacks it — it doesn't, per `:8`.) Run `npx vitest run --project node src/lib/pdf/utils.test.ts` — Expected: FAIL (`digitGrouping` not in `opts` type; mirror renders `₹106,200.00` Western).
- [ ] **Step 2: Implement in `src/lib/pdf/utils.ts`.** Add above `formatCurrency` (`:20`):

```typescript
/** Module-local mirror of lib/format's groupIntegerDigits — duplicated (not
 *  imported) so this PDF leaf stays free of the lib/format import chain, exactly
 *  like the formatCurrency mirror above it. '3' = legacy Western regex,
 *  '3;2' = Indian lakh/crore. Empty separator = no grouping (engine contract). */
function groupInt(intPart: string, grouping: '3' | '3;2', separator: string): string {
  if (separator === '') return intPart;
  if (grouping === '3;2') {
    const sign = intPart.startsWith('-') ? '-' : '';
    const digits = sign ? intPart.slice(1) : intPart;
    if (digits.length <= 3) return intPart;
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, separator);
    return `${sign}${rest}${separator}${digits.slice(-3)}`;
  }
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}
```

Replace `formatCurrency`'s grouping line (`:47`):

```typescript
  const integerPart = groupInt(parts[0], config.digitGrouping ?? '3', config.thousandsSeparator);
```

Replace `formatEngineMoney` (`:69-85`) with:

```typescript
export function formatEngineMoney(
  amount: number,
  opts: {
    symbol: string;
    decimalPlaces: number;
    position: 'before' | 'after';
    decimalSeparator?: string;
    thousandsSeparator?: string;
    /** '3' (default, Western) or '3;2' (Indian lakh/crore). Additive — untouched
     *  call sites render byte-identically. */
    digitGrouping?: '3' | '3;2';
  },
): string {
  const dec = opts.decimalSeparator ?? '.';
  const thou = opts.thousandsSeparator ?? ',';
  const [intPart, decPart] = amount.toFixed(opts.decimalPlaces).split('.');
  const grouped = groupInt(intPart, opts.digitGrouping ?? '3', thou);
  const formatted = decPart ? `${grouped}${dec}${decPart}` : grouped;
  return opts.position === 'before' ? `${opts.symbol} ${formatted}` : `${formatted} ${opts.symbol}`;
}
```

Run `npx vitest run --project node src/lib/pdf/utils.test.ts` — Expected: PASS (all pre-existing pins at `:8-19`/`:50-60` unchanged).
- [ ] **Step 3: Write the failing country-layer test.** Append to `src/lib/pdf/engine/countryConfig.test.ts` (reuse that file's facts-fixture style at `:8-20`, which already carries `digitGrouping: null`):

```typescript
describe("digitGrouping → locale.groupingStyle (WP-L1)", () => {
  const inFacts = {
    code: 'IN', taxSystem: 'GST', taxLabel: 'GST', taxNumberLabel: 'GSTIN',
    taxInvoiceRequired: true, languageCode: 'en', decimalPlaces: 2,
    dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',',
    digitGrouping: '3;2', einvoiceRegimeKey: 'no_einvoice',
  };
  it("sets groupingStyle 'indian' for '3;2'", () => {
    expect(countryTemplateOverride(inFacts).locale?.groupingStyle).toBe('indian');
  });
  it("leaves groupingStyle unset for '3' and null (byte parity)", () => {
    expect(countryTemplateOverride({ ...inFacts, digitGrouping: '3' }).locale?.groupingStyle).toBeUndefined();
    expect(countryTemplateOverride({ ...inFacts, digitGrouping: null }).locale?.groupingStyle).toBeUndefined();
  });
});
```

Run `npx vitest run --project node src/lib/pdf/engine/countryConfig.test.ts` — Expected: FAIL (groupingStyle never set).
- [ ] **Step 4: Implement.** In `countryTemplateOverride`'s locale block (`countryConfig.ts:117-121`), after the `thousandsSeparator` line (`:121`):

```typescript
  if (facts.digitGrouping === '3;2') locale.groupingStyle = 'indian';
```

Run the test — Expected: PASS.
- [ ] **Step 5: Write the failing adapter test.** Create `src/lib/pdf/engine/adapters/indianFormatting.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toEngineData } from './invoiceAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../../templateConfig';
import { countryTemplateOverride, type ResolvedCountryFacts } from '../countryConfig';
import { buildInvoiceFixture } from '../invoiceParity.fixtures';

const inFacts: ResolvedCountryFacts = {
  code: 'IN', taxSystem: 'GST', taxLabel: 'GST', taxNumberLabel: 'GSTIN',
  taxInvoiceRequired: true, languageCode: 'en', decimalPlaces: 2,
  dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',',
  digitGrouping: '3;2', einvoiceRegimeKey: 'no_einvoice',
};

function inConfig() {
  return resolveTemplateConfigWithCountry(BUILT_IN_TEMPLATE_CONFIGS.invoice, countryTemplateOverride(inFacts));
}

function inFixture() {
  return buildInvoiceFixture({
    subtotal: 90000, discount_amount: 0, tax_rate: 18, tax_amount: 16200,
    total_amount: 106200, amount_paid: 0, balance_due: 106200,
    accounting_locales: { currency_symbol: '₹', currency_position: 'before', decimal_places: 2 },
  });
}

describe('invoiceAdapter Indian money formatting (WP-L1)', () => {
  it('renders the total with lakh grouping and the U+20B9 symbol', () => {
    const data = toEngineData(inFixture(), inConfig());
    const total = data.totals!.find((t) => t.key === 'total')!;
    expect(total.value).toBe('₹ 1,06,200.00');
    expect(total.value.codePointAt(0)).toBe(0x20b9);
  });
  it('AED fixture without the country layer stays byte-identical (parity guard)', () => {
    const data = toEngineData(buildInvoiceFixture(), BUILT_IN_TEMPLATE_CONFIGS.invoice);
    expect(data.totals!.find((t) => t.key === 'total')!.value).toBe('1,470.00 AED');
  });
});
```

Run `npx vitest run --project node src/lib/pdf/engine/adapters/indianFormatting.test.ts` — Expected: FAIL (total renders `₹ 106,200.00` — adapter not threading grouping).
- [ ] **Step 6: Thread the adapters.** In `invoiceAdapter.ts` `money` (`:75-82`), add inside the `formatEngineMoney` opts object after `thousandsSeparator: ...` (`:81`):

```typescript
      digitGrouping: config.locale?.groupingStyle === 'indian' ? '3;2' : '3',
```

In `quoteAdapter.ts` `money` (`:81-88`), after `thousandsSeparator: ...` (`:87`):

```typescript
      digitGrouping: config.locale?.groupingStyle === 'indian' ? '3;2' : '3',
```

In `creditNoteAdapter.ts` `money` (`:85-92`), after `thousandsSeparator: config.locale?.thousandsSeparator,` (`:91`):

```typescript
      digitGrouping: config.locale?.groupingStyle === 'indian' ? '3;2' : '3',
```

- [ ] **Step 7: Run** `npx vitest run --project node src/lib/pdf/engine/adapters/indianFormatting.test.ts src/lib/pdf/engine/invoiceParity.test.ts src/lib/pdf/engine/quoteParity.test.ts src/lib/pdf/engine/complianceMatrix.test.ts` — Expected: ALL PASS (explicit `'3'` equals the default; goldens unchanged).
- [ ] **Step 8: Commit.**

```bash
git add src/lib/pdf/utils.ts src/lib/pdf/utils.test.ts src/lib/pdf/engine/countryConfig.ts src/lib/pdf/engine/countryConfig.test.ts src/lib/pdf/engine/adapters/invoiceAdapter.ts src/lib/pdf/engine/adapters/quoteAdapter.ts src/lib/pdf/engine/adapters/creditNoteAdapter.ts src/lib/pdf/engine/adapters/indianFormatting.test.ts
git commit -m "feat(pdf): lakh/crore engine money — formatEngineMoney '3;2' via the country layer groupingStyle (WP-L1.2)"
```

### Task L1.3: Indian-scale amount-in-words — `numberToWordsEnIndian` + scale threading

**Files:**
- Modify: `src/lib/pdf/engine/amountInWords.ts` (append after `numberToWordsEn` `:50`; widen `amountInWordsEn` at `:59-67`)
- Modify: `src/lib/pdf/engine/countryConfig.ts` (`ResolvedCountryFacts` at `:26-45`; locale block `:117-134`)
- Modify: `src/lib/pdf/templateConfig.ts` (`LocaleConfig` at `:588-599`)
- Modify: `src/lib/pdf/countryFactsService.ts` (select at `:22`; return map at `:61-75`)
- Modify: `src/lib/pdf/engine/adapters/invoiceAdapter.ts` (words at `:273` and `:306-309`)
- Modify: `src/lib/pdf/engine/adapters/quoteAdapter.ts` (words at `:270` and `:305-308`)
- Test: `src/lib/pdf/engine/amountInWords.test.ts`, `src/lib/pdf/engine/amountInWordsHook.test.ts` (update the S4 stub-era `null` pins now that this task fills the stub in place), `src/lib/pdf/countryFactsService.test.ts`, `src/lib/pdf/engine/adapters/indianFormatting.test.ts` (extend)

**Interfaces:**
- Consumes: module-local `threeDigitsEn` (`amountInWords.ts:17-31`); `geo_countries.country_config` jsonb binding `format.amount_words_scale` (registry key at `registry.ts:253`; WP-S1b seeds `'indian'` for IN — absent today ⇒ default `'western'`, verified live for OM/AE/SA/GB/US); the S4-defined amount-in-words hook slot (WP-S4's Rule 46 profile renders the totals words line; this task supplies the scale plumbing it reads).
- Produces: `numberToWordsEnIndian(value: number): string | null` — REPLACES the WP-S4 Task S4.5 hook stub **in place** in the same module (`src/lib/pdf/engine/amountInWords.ts`), keeping S4's `string | null` signature byte-identical and adding **no second export**: it returns the spelled string for valid finite non-negative input and `null` only for the guard cases S4's stub documented (non-finite / negative), so S4's `formatAmountWordsForScale` and the Rule-46 profile callers keep their existing null-guards; `amountInWordsEn(amount: number, currency?: string, decimals?: number, scale?: 'western' | 'indian'): string` (default `'western'` = byte-identical to every existing caller); `ResolvedCountryFacts.amountWordsScale?: 'western' | 'indian'` (optional — existing fixtures compile); `LocaleConfig.amountWordsScale?: 'western' | 'indian'`; `countryTemplateOverride` emitting `locale.amountWordsScale = 'indian'`. Arabic speller unchanged (IN tenants are `en-IN`).

- [ ] **Step 1: Write the failing words tests.** Append to `src/lib/pdf/engine/amountInWords.test.ts` (add `numberToWordsEnIndian` to the import at `:2`):

```typescript
describe('numberToWordsEnIndian (WP-L1)', () => {
  const cases: [number, string][] = [
    [0, 'Zero'],
    [999, 'Nine Hundred Ninety Nine'],
    [106200, 'One Lakh Six Thousand Two Hundred'],
    [1234000, 'Twelve Lakh Thirty Four Thousand'],
    [10000000, 'One Crore'],
    [123456789, 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine'],
  ];
  it.each(cases)('spells %i as "%s"', (n, words) => {
    expect(numberToWordsEnIndian(n)).toBe(words);
  });
  it('returns null for the honest-degrade guard cases (non-finite / negative)', () => {
    expect(numberToWordsEnIndian(Number.NaN)).toBeNull();
    expect(numberToWordsEnIndian(Number.POSITIVE_INFINITY)).toBeNull();
    expect(numberToWordsEnIndian(-5)).toBeNull();
  });
});

describe("amountInWordsEn scale='indian' (WP-L1)", () => {
  it('spells the walkthrough total', () => {
    expect(amountInWordsEn(106200, '₹', 2, 'indian')).toBe('₹ One Lakh Six Thousand Two Hundred only');
  });
  it('keeps cheque-style minor units', () => {
    expect(amountInWordsEn(106200.5, '₹', 2, 'indian')).toBe('₹ One Lakh Six Thousand Two Hundred and 50/100 only');
  });
  it('default scale stays western (byte-identical)', () => {
    expect(amountInWordsEn(1234000, 'OMR', 3)).toBe('OMR One Million Two Hundred Thirty Four Thousand only');
  });
});
```

Run `npx vitest run --project node src/lib/pdf/engine/amountInWords.test.ts` — Expected: FAIL (`numberToWordsEnIndian` not exported).
- [ ] **Step 2: Implement.** Append after `numberToWordsEn` (`amountInWords.ts:50`):

```typescript
/** Indian numbering scale: crore (10^7), lakh (10^5), thousand, hundreds. Same word
 *  tables and joining style as numberToWordsEn (threeDigitsEn). REPLACES the WP-S4
 *  Task S4.5 hook stub in place — same module, same `string | null` signature, no
 *  second export: returns the spelled string for valid finite non-negative input and
 *  null only for the guard cases S4's stub documented (non-finite / negative), so the
 *  render path OMITS the words line rather than mis-spelling an Indian statutory doc. */
export function numberToWordsEnIndian(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  let n = Math.floor(value);
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  if (crore > 0) parts.push(`${numberToWordsEnIndian(crore)} Crore`);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  if (lakh > 0) parts.push(`${threeDigitsEn(lakh)} Lakh`);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  if (thousand > 0) parts.push(`${threeDigitsEn(thousand)} Thousand`);
  n %= 1000;
  if (n > 0) parts.push(threeDigitsEn(n));
  return parts.join(' ').trim();
}
```

Replace `amountInWordsEn` (`:59-67`) with the additive 4-arg form:

```typescript
export function amountInWordsEn(
  amount: number,
  currency = '',
  decimals = 2,
  scale: 'western' | 'indian' = 'western',
): string {
  const whole = Math.floor(Math.abs(amount));
  const factor = 10 ** decimals;
  const minor = Math.round((Math.abs(amount) - whole) * factor);
  const words = scale === 'indian' ? numberToWordsEnIndian(whole) : numberToWordsEn(whole);
  const minorPart = decimals > 0 && minor > 0
    ? ` and ${String(minor).padStart(decimals, '0')}/${factor}` : '';
  return `${currency ? `${currency} ` : ''}${words}${minorPart} only`;
}
```

Then update `src/lib/pdf/engine/amountInWordsHook.test.ts` (the S4-owned hook test): the two stub-era assertions that pinned `numberToWordsEnIndian(105000)` and `formatAmountWordsForScale(105000, '₹', 2, 'indian')` to `null` now become the implemented lakh/crore output (`'One Lakh Five Thousand'` and `'₹ One Lakh Five Thousand only'` respectively) — S4's stub docstring anticipated this flip; the null-guard branch itself stays covered by the new non-finite/negative case above. Run `npx vitest run --project node src/lib/pdf/engine/amountInWords.test.ts src/lib/pdf/engine/amountInWordsHook.test.ts` — Expected: PASS (existing D13 pins at `:20-39` unchanged).
- [ ] **Step 3: Write the failing facts-resolution test.** Append to `src/lib/pdf/countryFactsService.test.ts`, following that file's existing mock-row pattern (rows at `:41`/`:61`/`:87` — add `country_config` to the new mock row only):

```typescript
  it("maps country_config format.amount_words_scale='indian' onto facts.amountWordsScale", async () => {
    // Same mock harness as the tests above; the geo row now carries the S1b binding.
    // (Copy the arrange block of the first test verbatim, with this row:)
    // { code: 'IN', ..., digit_grouping: '3;2', address_format: null,
    //   country_config: { 'format.amount_words_scale': 'indian' } }
    const facts = await getResolvedCountryFacts('geo-in');
    expect(facts?.amountWordsScale).toBe('indian');
  });
  it("defaults amountWordsScale to 'western' when the binding is absent", async () => {
    const facts = await getResolvedCountryFacts('geo-om'); // existing OM mock row, no country_config
    expect(facts?.amountWordsScale).toBe('western');
  });
```

Run `npx vitest run --project node src/lib/pdf/countryFactsService.test.ts` — Expected: FAIL (`amountWordsScale` undefined).
- [ ] **Step 4: Implement facts + config threading.** `countryConfig.ts` — in `ResolvedCountryFacts` after `addressFormat?` (`:44`):

```typescript
  /** format.amount_words_scale binding from geo_countries.country_config (S1b
   *  seeds 'indian' for IN). Optional so pre-existing fixtures keep compiling;
   *  absent = 'western'. */
  amountWordsScale?: 'western' | 'indian';
```

In the locale block, after the `groupingStyle` line added in L1.2:

```typescript
  if (facts.amountWordsScale === 'indian') locale.amountWordsScale = 'indian';
```

`templateConfig.ts` `LocaleConfig` (`:588-599`), after `groupingStyle`:

```typescript
  /** Amount-in-words scale for the English speller: absent/'western' = million/
   *  billion (today's output), 'indian' = lakh/crore (WP-L1). */
  amountWordsScale?: 'western' | 'indian';
```

`countryFactsService.ts` — add `country_config` to the select at `:22` (append `, country_config` inside the string), and in the return map after `digitGrouping: ...` (`:72`):

```typescript
    amountWordsScale:
      ((data.country_config ?? {}) as Record<string, unknown>)['format.amount_words_scale'] === 'indian'
        ? 'indian'
        : 'western',
```

Run Step-3 tests — Expected: PASS.
- [ ] **Step 5: Write the failing adapter words test.** Extend `src/lib/pdf/engine/adapters/indianFormatting.test.ts` (`inFacts` gains `amountWordsScale: 'indian'`):

```typescript
describe('invoiceAdapter Indian amount-in-words (WP-L1)', () => {
  it('spells the total in lakh/crore when the totals line is enabled', () => {
    const config = resolveTemplateConfigWithCountry(
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
      countryTemplateOverride({ ...inFacts, amountWordsScale: 'indian' }),
    );
    const totalsSection = config.sections.find((s) => s.key === 'totals')!;
    totalsSection.lines = { ...(totalsSection.lines ?? {}), amountInWords: true };
    const data = toEngineData(inFixture(), config);
    const words = data.totals!.find((t) => t.key === 'amountInWords')!;
    expect(words.value).toBe('₹ One Lakh Six Thousand Two Hundred only');
  });
});
```

Run — Expected: FAIL (renders 'One Hundred Six Thousand Two Hundred', Western scale).
- [ ] **Step 6: Thread the four English-speller call sites.** In `invoiceAdapter.ts`: at `:273` change to `const enWords = amountInWordsEn(totalAmount, currencySymbol, decimalPlaces, config.locale?.amountWordsScale ?? 'western');` and in the taxSummary block (`:306-309`) change BOTH `amountInWordsEn(storedTax, currencySymbol, decimalPlaces)` occurrences to `amountInWordsEn(storedTax, currencySymbol, decimalPlaces, config.locale?.amountWordsScale ?? 'western')`. In `quoteAdapter.ts`: identical edits at `:270` (`totalAmount`) and both taxSummary occurrences at `:307-308` (`storedTax`). `amountInWordsAr` calls stay untouched.
- [ ] **Step 7: Run** `npx vitest run --project node src/lib/pdf/engine/adapters/indianFormatting.test.ts src/lib/pdf/engine/amountInWords.test.ts src/lib/pdf/engine/adapters/quoteAdapter.compliance.test.ts src/lib/pdf/engine/adapters/invoiceAdapter.compliance.test.ts` — Expected: ALL PASS.
- [ ] **Step 8: Commit.**

```bash
git add src/lib/pdf/engine/amountInWords.ts src/lib/pdf/engine/amountInWords.test.ts src/lib/pdf/engine/amountInWordsHook.test.ts src/lib/pdf/engine/countryConfig.ts src/lib/pdf/templateConfig.ts src/lib/pdf/countryFactsService.ts src/lib/pdf/countryFactsService.test.ts src/lib/pdf/engine/adapters/invoiceAdapter.ts src/lib/pdf/engine/adapters/quoteAdapter.ts src/lib/pdf/engine/adapters/indianFormatting.test.ts
git commit -m "feat(pdf): indian-scale amount-in-words keyed on format.amount_words_scale (WP-L1.3)"
```

### Task L1.4: U+20B9 (₹) verification on both render paths

**Files:**
- Create: `src/lib/pdf/rupeeGlyph.test.ts` (node project; reads `public/fonts/Roboto-*.ttf` — the exact TTFs `loadRobotoFontsFromLocal` embeds into pdfmake, `src/lib/pdf/fontLoader.ts:90-116`)
- Test: `src/lib/format.test.ts` (extend — in-app path code-point preservation)

**Interfaces:**
- Consumes: `public/fonts/Roboto-Regular.ttf`, `Roboto-Bold.ttf`, `Roboto-Italic.ttf`, `Roboto-BoldItalic.ttf` (verified present); `formatCurrencyWithConfig` (Task L1.1). In-app text renders in Inter (Google Fonts, `index.html:16`), which ships the ₹ glyph — the testable in-app property is that our formatters emit the exact U+20B9 code point unmangled.
- Produces: a CI-permanent glyph-coverage gate: if anyone swaps the PDF fonts for a subset lacking ₹, this test fails.

- [ ] **Step 1: Write the (possibly-failing) glyph test.** Create `src/lib/pdf/rupeeGlyph.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The pdfmake render path embeds these exact local TTFs (fontLoader.ts:90-116).
// A font subset without U+20B9 would print a tofu box on every Indian invoice —
// this is the WP-L1 "₹ on the PDF path" verification, parsing the TrueType cmap
// directly (no font library; formats 4 and 12 cover Roboto).
const RUPEE = 0x20b9;

function lookupFormat4(buf: Buffer, sub: number, cp: number): boolean {
  const segCountX2 = buf.readUInt16BE(sub + 6);
  const endCodes = sub + 14;
  const startCodes = endCodes + segCountX2 + 2;
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;
  for (let i = 0; i < segCountX2 / 2; i++) {
    const end = buf.readUInt16BE(endCodes + i * 2);
    if (cp > end) continue;
    const start = buf.readUInt16BE(startCodes + i * 2);
    if (cp < start) return false;
    const idRangeOffset = buf.readUInt16BE(idRangeOffsets + i * 2);
    if (idRangeOffset === 0) return ((cp + buf.readInt16BE(idDeltas + i * 2)) & 0xffff) !== 0;
    return buf.readUInt16BE(idRangeOffsets + i * 2 + idRangeOffset + (cp - start) * 2) !== 0;
  }
  return false;
}

function lookupFormat12(buf: Buffer, sub: number, cp: number): boolean {
  const numGroups = buf.readUInt32BE(sub + 12);
  for (let i = 0; i < numGroups; i++) {
    const g = sub + 16 + i * 12;
    const start = buf.readUInt32BE(g);
    if (cp >= start && cp <= buf.readUInt32BE(g + 4)) return buf.readUInt32BE(g + 8) + (cp - start) !== 0;
  }
  return false;
}

function hasGlyphFor(buf: Buffer, cp: number): boolean {
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) !== 'cmap') continue;
    const cmap = buf.readUInt32BE(rec + 8);
    const numSub = buf.readUInt16BE(cmap + 2);
    for (let j = 0; j < numSub; j++) {
      const enc = cmap + 4 + j * 8;
      const platformID = buf.readUInt16BE(enc);
      const encodingID = buf.readUInt16BE(enc + 2);
      const unicode = platformID === 0 || (platformID === 3 && (encodingID === 1 || encodingID === 10));
      if (!unicode) continue;
      const sub = cmap + buf.readUInt32BE(enc + 4);
      const format = buf.readUInt16BE(sub);
      if ((format === 4 && lookupFormat4(buf, sub, cp)) || (format === 12 && lookupFormat12(buf, sub, cp))) {
        return true;
      }
    }
    return false;
  }
  return false;
}

describe('U+20B9 (₹) glyph coverage — PDF font files (WP-L1)', () => {
  it.each(['Roboto-Regular.ttf', 'Roboto-Bold.ttf', 'Roboto-Italic.ttf', 'Roboto-BoldItalic.ttf'])(
    'public/fonts/%s maps a real glyph for U+20B9',
    (file) => {
      const buf = readFileSync(resolve(process.cwd(), 'public/fonts', file));
      expect(hasGlyphFor(buf, RUPEE)).toBe(true);
    },
  );
});
```

- [ ] **Step 2: Run** `npx vitest run --project node src/lib/pdf/rupeeGlyph.test.ts`. Two legitimate outcomes: PASS (full Roboto ships ₹ — the test becomes the permanent regression gate) or FAIL (the local TTFs are a subset). On FAIL, the fix IS the deliverable: replace the four `public/fonts/Roboto-*.ttf` files with the full-coverage Roboto TTFs from the official google/roboto releases (same family/weights, drop-in — `fontLoader.ts` validates magic bytes only), re-run to PASS, and additionally re-run `npx vitest run src/lib/pdf/engine/invoiceParity.test.ts` (goldens compare doc-definitions, not rendered bytes, so a font-file swap is parity-neutral — confirm green).
- [ ] **Step 3: Write + run the in-app code-point tests.** Append to `src/lib/format.test.ts`:

```typescript
describe('U+20B9 passes through the in-app formatter unmangled (WP-L1)', () => {
  it('formatCurrencyWithConfig emits the exact rupee code point', () => {
    const out = formatCurrencyWithConfig(1, cfg({ code: 'INR', symbol: '₹', position: 'before', digitGrouping: '3;2' }));
    expect(out.codePointAt(0)).toBe(0x20b9);
    expect(out).toBe('₹1.00');
  });
  it('renderCurrencyToken symbol_code keeps ₹ intact beside the ISO code', () => {
    expect(renderCurrencyToken(cfg({ code: 'INR', symbol: '₹', displayMode: 'symbol_code' }))).toBe('₹ INR');
  });
});
```

(`renderCurrencyToken` is already exported and imported in this file.) Run `npx vitest run --project node src/lib/format.test.ts` — Expected: PASS immediately (these are pin tests locking the behavior Tasks L1.1 built; a normalization regression would break them).
- [ ] **Step 4: Commit.**

```bash
git add src/lib/pdf/rupeeGlyph.test.ts src/lib/format.test.ts public/fonts
git commit -m "test(pdf): U+20B9 glyph-coverage gate on the embedded Roboto TTFs + in-app code-point pins (WP-L1.4)"
```

(Drop `public/fonts` from the `git add` if Step 2 passed without a font swap.)

### Task L1.5: Byte-parity exit gate, typecheck, PR

**Files:**
- Test: whole-suite run (no source changes in this task)

**Interfaces:**
- Consumes: everything above.
- Produces: the WP-L1 PR (owner merges; do NOT merge). Exit evidence: non-India golden suites byte-identical (spec §9.5); `npm run typecheck` = 0.

- [ ] **Step 1: Run the WP test paths.** `npx vitest run --project node src/lib/format.test.ts src/lib/tenantConfigService.test.ts src/lib/country src/lib/pdf/utils.test.ts src/lib/pdf/countryFactsService.test.ts src/lib/pdf/engine/amountInWords.test.ts src/lib/pdf/engine/countryConfig.test.ts src/lib/pdf/engine/adapters/indianFormatting.test.ts src/lib/pdf/rupeeGlyph.test.ts` — Expected: ALL PASS.
- [ ] **Step 2: Run the full byte-parity gate.** `npx vitest run` (both vitest projects — the PDF parity/golden suites, compliance matrix, ZATCA render, and preview-print parity all exercise the touched formatters with `'3'`/`'western'` defaults). Expected: ALL PASS with ZERO golden diffs. Any parity failure = a default leaked — fix the offending default (never re-record a non-India golden) before proceeding.
- [ ] **Step 3: Typecheck.** `npm run typecheck` — Expected: 0 errors (run un-piped and read the real exit output — do not trust a summarized report).
- [ ] **Step 4: Push + open the PR.**

```bash
git push -u origin feat/india-l1-lakh-crore-words
gh pr create --base main --title "WP-L1: Lakh/crore formatting + Indian amount-in-words + U+20B9 verification" --body "Phase 4 India Pack WP-L1 (spec: docs/superpowers/specs/2026-07-05-phase4-india-pack-design.md §4).

- groupIntegerDigits '3;2' in src/lib/format.ts + optional CurrencyConfig.digitGrouping, resolved from the number_format.digit_grouping snapshot key (new non-statutory registry key; codedDefault '3' — no migration, no STATUTORY_KEYS change)
- formatEngineMoney/formatCurrency (pdf/utils.ts) honor digitGrouping; country layer activates the dormant LocaleConfig.groupingStyle from facts.digitGrouping ('3;2' live on geo_countries for IN); threaded through invoice/quote/credit-note adapters
- numberToWordsEnIndian + additive amountInWordsEn scale param, keyed on the format.amount_words_scale pack binding (geo_countries.country_config → ResolvedCountryFacts.amountWordsScale → LocaleConfig.amountWordsScale); implements the WP-S4 amount-in-words hook. ₹1,06,200.00 = 'One Lakh Six Thousand Two Hundred only'
- U+20B9 verification on both render paths: TrueType cmap glyph gate on the embedded public/fonts Roboto TTFs + in-app code-point pins
- Byte-parity: all defaults additive ('3'/'western'); full vitest run green with zero golden diffs; npm run typecheck = 0

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 5: Report** the PR URL, the full-suite pass counts, and the typecheck result. Owner merges.

---


## Work Package WP-L2 — GSTIN Registration Capture + Status Setting [M, no migration]

Branch: `feat/india-l2-gstin-registration` (cut fresh from `main`)
Depends on: **WP-S4 merged** (which implies S1a→S4: `geo_subdivisions` IN rows with `tax_authority_code` seeded by S1b; `src/lib/regimes/in_gst/` exists with **WP-S2's** `gstin.ts` validator (WP-S2 is its sole author; S3 consumes it); S2/S3 have threaded seller registrations + the pack-resolved `regime.tax` key through `taxDocumentService.computeDocumentTotals`). No migration — `legal_entity_tax_registrations`, `company_settings.metadata`, and `branches.subdivision_id` all exist live (verified in `src/types/database.types.ts:9459-9535`, `:4289-4315`, `:1216-1236`).

**Scope per spec §4-L2 + D6:** single-registration UX only (the multi-state GSTIN manager is a named deferral, §7). Deliverables: `taxRegistrationService` CRUD; onboarding JurisdictionStep state+GSTIN capture; `provision-tenant` threading; a Settings page with the **explicit registered/unregistered control**, **loud unregistered treatment**, the **D6 silent-fallback dev assertion**, and the **branch-state mismatch warning** (banner + dev assertion) pointing at the deferred multi-state manager.

---

### Task L2.1: `taxRegistrationService` — single-registration CRUD + declared status

**Files:**
- Create: `src/lib/taxRegistrationService.ts`
- Test: `src/lib/taxRegistrationService.test.ts` (node project — `.test.ts`)

**Interfaces:**
- Consumes: `supabase`, `resolveTenantId` (`src/lib/supabaseClient.ts:69`); `getOrCreateCompanySettings` / `updateCompanySettings` / `invalidateCompanySettingsCache` (`src/lib/companySettingsService.ts:197/259/254`); `Database`, `Json` from `src/types/database.types.ts`.
- Produces: `getPrimaryLegalEntity(): Promise<{ id: string; country_id: string } | null>`; `getActiveTaxRegistration(onDate: string): Promise<DbTaxRegistrationRow | null>`; `createTaxRegistration(input): Promise<DbTaxRegistrationRow>`; `endTaxRegistration(id: string, registeredTo: string): Promise<void>`; `getDeclaredRegistrationStatus(): Promise<'registered'|'unregistered'|undefined>`; `setDeclaredRegistrationStatus(status): Promise<void>`; `DbTaxRegistrationRow` type. Consumed by Tasks L2.2, L2.5, L2.6.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/taxRegistrationService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
  resolveTenantId: vi.fn().mockResolvedValue('t-1'),
}));

const getOrCreateCompanySettings = vi.fn();
const updateCompanySettings = vi.fn().mockResolvedValue({});
const invalidateCompanySettingsCache = vi.fn();
vi.mock('./companySettingsService', () => ({
  getOrCreateCompanySettings: (...a: unknown[]) => getOrCreateCompanySettings(...a),
  updateCompanySettings: (...a: unknown[]) => updateCompanySettings(...a),
  invalidateCompanySettingsCache: (...a: unknown[]) => invalidateCompanySettingsCache(...a),
}));

import {
  getActiveTaxRegistration, createTaxRegistration, endTaxRegistration,
  getDeclaredRegistrationStatus, setDeclaredRegistrationStatus,
} from './taxRegistrationService';

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'lte', 'or', 'order', 'maybeSingle']) {
    c[m] = vi.fn().mockImplementation(() => c);
  }
  c.maybeSingle.mockResolvedValue(result);
  c.order.mockResolvedValue(result);
  return c;
}

beforeEach(() => {
  fromMock.mockReset();
  getOrCreateCompanySettings.mockReset();
  updateCompanySettings.mockClear();
  invalidateCompanySettingsCache.mockClear();
});

describe('getActiveTaxRegistration', () => {
  it('returns the primary active registration effective on the date', async () => {
    const rows = [
      { id: 'r2', is_primary: false, registered_from: '2026-06-01', registered_to: null },
      { id: 'r1', is_primary: true, registered_from: '2026-07-01', registered_to: null },
    ];
    const c = chain({ data: rows, error: null });
    fromMock.mockReturnValue(c);
    const row = await getActiveTaxRegistration('2026-07-05');
    expect(fromMock).toHaveBeenCalledWith('legal_entity_tax_registrations');
    expect(c.is).toHaveBeenCalledWith('deleted_at', null);
    expect(c.lte).toHaveBeenCalledWith('registered_from', '2026-07-05');
    expect(c.or).toHaveBeenCalledWith('registered_to.is.null,registered_to.gte.2026-07-05');
    expect(row?.id).toBe('r1');
  });

  it('returns null when no registration is active', async () => {
    const c = chain({ data: [], error: null });
    fromMock.mockReturnValue(c);
    expect(await getActiveTaxRegistration('2026-07-05')).toBe(null);
  });
});

describe('createTaxRegistration', () => {
  it('inserts a standard primary registration stamped with the resolved tenant_id (maybeSingle, never single)', async () => {
    const c = chain({ data: { id: 'new' }, error: null });
    fromMock.mockReturnValue(c);
    const row = await createTaxRegistration({
      legal_entity_id: 'le-1', country_id: 'c-in', subdivision_id: 's-ka',
      tax_number: '29ABCDE1234F1Z5', registered_from: '2026-07-05',
    });
    expect(c.insert).toHaveBeenCalledWith({
      legal_entity_id: 'le-1', country_id: 'c-in', subdivision_id: 's-ka',
      tax_number: '29ABCDE1234F1Z5', registered_from: '2026-07-05',
      tenant_id: 't-1', scheme: 'standard', is_primary: true,
    });
    expect(c.maybeSingle).toHaveBeenCalled();
    expect(row.id).toBe('new');
  });
});

describe('endTaxRegistration', () => {
  it('sets registered_to (business end date — NOT deleted_at)', async () => {
    const c = chain({ data: null, error: null });
    c.eq.mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue(c);
    await endTaxRegistration('r1', '2026-07-05');
    expect(c.update).toHaveBeenCalledWith({ registered_to: '2026-07-05' });
    expect(c.eq).toHaveBeenCalledWith('id', 'r1');
  });
});

describe('declared registration status (company_settings.metadata.tax_registration_status)', () => {
  it('reads a declared status and rejects corrupt values', async () => {
    getOrCreateCompanySettings.mockResolvedValueOnce({ id: 'cs', metadata: { tax_registration_status: 'unregistered' } });
    expect(await getDeclaredRegistrationStatus()).toBe('unregistered');
    getOrCreateCompanySettings.mockResolvedValueOnce({ id: 'cs', metadata: { tax_registration_status: 'maybe' } });
    expect(await getDeclaredRegistrationStatus()).toBeUndefined();
    getOrCreateCompanySettings.mockResolvedValueOnce({ id: 'cs', metadata: null });
    expect(await getDeclaredRegistrationStatus()).toBeUndefined();
  });

  it('writes the status while preserving sibling metadata keys, then invalidates the cache', async () => {
    getOrCreateCompanySettings.mockResolvedValueOnce({ id: 'cs', metadata: { table_columns: { cases: {} } } });
    await setDeclaredRegistrationStatus('registered');
    expect(updateCompanySettings).toHaveBeenCalledWith({
      metadata: { table_columns: { cases: {} }, tax_registration_status: 'registered' },
    });
    expect(invalidateCompanySettingsCache).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/taxRegistrationService.test.ts`
Expected: FAIL — `Cannot find module './taxRegistrationService'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/taxRegistrationService.ts
// Seller tax registration state — SINGLE-registration UX (India v1; the
// multi-state GSTIN manager is a named Phase-4 deferral). The tenant-visible
// registration status is EXPLICIT (spec D6): 'registered' is evidenced by an
// active legal_entity_tax_registrations row; 'unregistered' is a declared flag
// in company_settings.metadata.tax_registration_status. Absence of BOTH is a
// silent fallback and fails a dev assertion (regimes/in_gst/registrationStatus).
// registered_to is the BUSINESS end date (a lapsed registration stays visible
// for historical documents); deleted_at is data removal — never conflate them.
import { supabase, resolveTenantId } from './supabaseClient';
import type { Database, Json } from '../types/database.types';
import {
  getOrCreateCompanySettings,
  updateCompanySettings,
  invalidateCompanySettingsCache,
} from './companySettingsService';

export type DbTaxRegistrationRow =
  Database['public']['Tables']['legal_entity_tax_registrations']['Row'];

export type DeclaredRegistrationStatus = 'registered' | 'unregistered';

const REGISTRATION_STATUS_KEY = 'tax_registration_status';

export async function getPrimaryLegalEntity(): Promise<{ id: string; country_id: string } | null> {
  const { data, error } = await supabase
    .from('legal_entities')
    .select('id, country_id')
    .eq('is_primary', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getActiveTaxRegistration(onDate: string): Promise<DbTaxRegistrationRow | null> {
  const { data, error } = await supabase
    .from('legal_entity_tax_registrations')
    .select('*')
    .is('deleted_at', null)
    .lte('registered_from', onDate)
    .or(`registered_to.is.null,registered_to.gte.${onDate}`)
    .order('registered_from', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as DbTaxRegistrationRow[];
  return rows.find((r) => r.is_primary) ?? rows[0] ?? null;
}

export async function createTaxRegistration(input: {
  legal_entity_id: string;
  country_id: string;
  subdivision_id: string | null;
  tax_number: string;
  registered_from: string;
}): Promise<DbTaxRegistrationRow> {
  const tenantId = await resolveTenantId();
  const { data, error } = await supabase
    .from('legal_entity_tax_registrations')
    .insert({ ...input, tenant_id: tenantId, scheme: 'standard', is_primary: true })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to create tax registration');
  return data as DbTaxRegistrationRow;
}

export async function endTaxRegistration(id: string, registeredTo: string): Promise<void> {
  const { error } = await supabase
    .from('legal_entity_tax_registrations')
    .update({ registered_to: registeredTo })
    .eq('id', id);
  if (error) throw error;
}

export async function getDeclaredRegistrationStatus(): Promise<DeclaredRegistrationStatus | undefined> {
  const settings = await getOrCreateCompanySettings();
  const metadata = (settings.metadata ?? {}) as Record<string, unknown>;
  const value = metadata[REGISTRATION_STATUS_KEY];
  return value === 'registered' || value === 'unregistered' ? value : undefined;
}

export async function setDeclaredRegistrationStatus(status: DeclaredRegistrationStatus): Promise<void> {
  const settings = await getOrCreateCompanySettings();
  const metadata = {
    ...((settings.metadata ?? {}) as Record<string, unknown>),
    [REGISTRATION_STATUS_KEY]: status,
  };
  await updateCompanySettings({ metadata: metadata as Json });
  invalidateCompanySettingsCache();
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/taxRegistrationService.test.ts` — Expected: 6 passed. `npm run typecheck` — 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxRegistrationService.ts src/lib/taxRegistrationService.test.ts
git commit -m "feat(tax): taxRegistrationService — single seller registration CRUD + explicit declared status (D6)"
```

---

### Task L2.2: D6 registration-status resolver + silent-fallback dev assertion wired into the compute path

**Files:**
- Create: `src/lib/regimes/in_gst/registrationStatus.ts`
- Modify: `src/lib/taxRegistrationService.ts` (append the `assertGstRegistrationExplicit` wrapper after `setDeclaredRegistrationStatus`)
- Modify: `src/lib/taxDocumentService.ts` (`computeDocumentTotals` — on current main the strategy resolution is `const strategy = resolveTaxStrategy('simple_vat')` at `:172`; WP-S3 replaces the `'simple_vat'` literal with the pack-resolved key. Insert one line immediately after that resolution line.)
- Test: `src/lib/regimes/in_gst/registrationStatus.test.ts` (node)

**Interfaces:**
- Consumes: `LegalEntityTaxRegistrationRow` (`src/lib/regimes/types.ts:47-57`); `logger` (`src/lib/logger.ts`); `getDeclaredRegistrationStatus` (Task L2.1); the pack-resolved `regime.tax` key expression in `computeDocumentTotals` (WP-S3 — same shape as `assembleStockSaleContext.ts:37`).
- Produces: `regimeRequiresExplicitRegistrationStatus(regimeTaxKey: string): boolean`; `filterActiveRegistrations(regs: LegalEntityTaxRegistrationRow[], onDate: string): LegalEntityTaxRegistrationRow[]`; `resolveGstRegistrationStatus(input): RegistrationStatusResolution`; `assertNoSilentUnregisteredFallback(resolution): void`; `gstinMatchesSubdivision(gstin: string, taxAuthorityCode: string | null | undefined): boolean`; `assertGstRegistrationExplicit(regimeTaxKey, registrations, onDate): Promise<void>` (in taxRegistrationService). Consumed by Tasks L2.3, L2.5, L2.6 and by WP-GA's honest-degrade assertion set.

- [ ] **Step 1: Write the failing pure-module test**

```typescript
// src/lib/regimes/in_gst/registrationStatus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
import { logger } from '../../logger';
import {
  regimeRequiresExplicitRegistrationStatus,
  filterActiveRegistrations,
  resolveGstRegistrationStatus,
  assertNoSilentUnregisteredFallback,
  gstinMatchesSubdivision,
} from './registrationStatus';
import type { LegalEntityTaxRegistrationRow } from '../types';

const reg = (over: Partial<LegalEntityTaxRegistrationRow>): LegalEntityTaxRegistrationRow => ({
  id: 'r1', legal_entity_id: 'le1', country_id: 'c-in', subdivision_id: 's-ka',
  tax_number: '29ABCDE1234F1Z5', scheme: 'standard',
  registered_from: '2026-04-01', registered_to: null, is_primary: true,
  ...over,
});

describe('regimeRequiresExplicitRegistrationStatus', () => {
  it('is true only for in_gst', () => {
    expect(regimeRequiresExplicitRegistrationStatus('in_gst')).toBe(true);
    expect(regimeRequiresExplicitRegistrationStatus('simple_vat')).toBe(false);
    expect(regimeRequiresExplicitRegistrationStatus('gcc_return')).toBe(false);
  });
});

describe('filterActiveRegistrations', () => {
  it('keeps only registrations effective on the date', () => {
    const rows = [
      reg({ id: 'live' }),
      reg({ id: 'future', registered_from: '2027-01-01' }),
      reg({ id: 'lapsed', registered_to: '2026-06-30' }),
    ];
    expect(filterActiveRegistrations(rows, '2026-07-05').map((r) => r.id)).toEqual(['live']);
  });
});

describe('resolveGstRegistrationStatus (D6)', () => {
  it('an active registration row = registered, no assertion', () => {
    const r = resolveGstRegistrationStatus({
      regimeTaxKey: 'in_gst', activeRegistrations: [reg({})], declaredStatus: undefined,
    });
    expect(r).toEqual({ status: 'registered', source: 'registration_row', assertionMessage: null });
  });

  it('declared unregistered = unregistered, no assertion (loud mode, not silent)', () => {
    const r = resolveGstRegistrationStatus({
      regimeTaxKey: 'in_gst', activeRegistrations: [], declaredStatus: 'unregistered',
    });
    expect(r.status).toBe('unregistered');
    expect(r.source).toBe('declared_unregistered');
    expect(r.assertionMessage).toBe(null);
  });

  it('in_gst with NEITHER a row NOR a declaration = silent fallback with assertion message', () => {
    const r = resolveGstRegistrationStatus({
      regimeTaxKey: 'in_gst', activeRegistrations: [], declaredStatus: undefined,
    });
    expect(r.source).toBe('silent_fallback');
    expect(r.assertionMessage).toMatch(/Tax Registration/);
  });

  it('declared "registered" but no active row is ALSO a silent fallback (inconsistent state)', () => {
    const r = resolveGstRegistrationStatus({
      regimeTaxKey: 'in_gst', activeRegistrations: [], declaredStatus: 'registered',
    });
    expect(r.source).toBe('silent_fallback');
  });

  it('non-GST regimes never assert on absence', () => {
    const r = resolveGstRegistrationStatus({
      regimeTaxKey: 'simple_vat', activeRegistrations: [], declaredStatus: undefined,
    });
    expect(r.status).toBe('unregistered');
    expect(r.assertionMessage).toBe(null);
  });
});

describe('assertNoSilentUnregisteredFallback', () => {
  it('is a no-op for explicit resolutions', () => {
    expect(() => assertNoSilentUnregisteredFallback({
      status: 'registered', source: 'registration_row', assertionMessage: null,
    })).not.toThrow();
  });

  it('logs AND throws under DEV (vitest runs with import.meta.env.DEV=true) on silent fallback', () => {
    expect(() => assertNoSilentUnregisteredFallback({
      status: 'unregistered', source: 'silent_fallback', assertionMessage: 'boom',
    })).toThrow(/\[dev-assert\] boom/);
    expect(logger.error).toHaveBeenCalledWith('[dev-assert] boom');
  });
});

describe('gstinMatchesSubdivision', () => {
  it('compares the 2-digit GSTIN state prefix to the subdivision tax_authority_code', () => {
    expect(gstinMatchesSubdivision('29ABCDE1234F1Z5', '29')).toBe(true);
    expect(gstinMatchesSubdivision('27ABCDE1234F1Z5', '29')).toBe(false);
    expect(gstinMatchesSubdivision(' 29ABCDE1234F1Z5 ', '29')).toBe(true);
  });
  it('passes when the subdivision carries no GST code (nothing to compare)', () => {
    expect(gstinMatchesSubdivision('29ABCDE1234F1Z5', null)).toBe(true);
    expect(gstinMatchesSubdivision('29ABCDE1234F1Z5', undefined)).toBe(true);
  });
});

describe('D6 wire (structural)', () => {
  it('computeDocumentTotals calls assertGstRegistrationExplicit', () => {
    const src = readFileSync(new URL('../../taxDocumentService.ts', import.meta.url), 'utf8');
    expect(src).toContain('assertGstRegistrationExplicit(');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/registrationStatus.test.ts`
Expected: FAIL — `Cannot find module './registrationStatus'`.

- [ ] **Step 3: Implement the pure module**

```typescript
// src/lib/regimes/in_gst/registrationStatus.ts
// D6: the GST registration status must be EXPLICIT. 'registered' is evidenced
// by an active legal_entity_tax_registrations row; 'unregistered' by the
// tenant-visible declared flag. Deriving 'unregistered' from mere absence is a
// SILENT FALLBACK: dev assertion failure (throw under import.meta.env.DEV),
// loud logger.error in production while the computation degrades honestly to
// unregistered. India-only logic lives in this module so the eslint
// no-country-branching-outside-regimes rule holds at every call site.
import { logger } from '../../logger';
import type { LegalEntityTaxRegistrationRow } from '../types';

export type GstRegistrationStatus = 'registered' | 'unregistered';

export interface RegistrationStatusResolution {
  status: GstRegistrationStatus;
  source: 'registration_row' | 'declared_unregistered' | 'silent_fallback';
  assertionMessage: string | null;
}

export function regimeRequiresExplicitRegistrationStatus(regimeTaxKey: string): boolean {
  return regimeTaxKey === 'in_gst';
}

export function filterActiveRegistrations(
  registrations: LegalEntityTaxRegistrationRow[],
  onDate: string,
): LegalEntityTaxRegistrationRow[] {
  return registrations.filter(
    (r) => r.registered_from <= onDate && (r.registered_to === null || r.registered_to >= onDate),
  );
}

export function resolveGstRegistrationStatus(input: {
  regimeTaxKey: string;
  activeRegistrations: LegalEntityTaxRegistrationRow[];
  declaredStatus: 'registered' | 'unregistered' | undefined;
}): RegistrationStatusResolution {
  if (input.activeRegistrations.length > 0) {
    return { status: 'registered', source: 'registration_row', assertionMessage: null };
  }
  if (input.declaredStatus === 'unregistered') {
    return { status: 'unregistered', source: 'declared_unregistered', assertionMessage: null };
  }
  if (!regimeRequiresExplicitRegistrationStatus(input.regimeTaxKey)) {
    return { status: 'unregistered', source: 'declared_unregistered', assertionMessage: null };
  }
  return {
    status: 'unregistered',
    source: 'silent_fallback',
    assertionMessage:
      'GST tenant has no active tax registration and no declared "unregistered" status. ' +
      'Set the registration status in Settings → Tax Registration (D6: a silent unregistered fallback is forbidden).',
  };
}

export function assertNoSilentUnregisteredFallback(resolution: RegistrationStatusResolution): void {
  if (resolution.source !== 'silent_fallback' || !resolution.assertionMessage) return;
  logger.error(`[dev-assert] ${resolution.assertionMessage}`);
  if (import.meta.env.DEV) throw new Error(`[dev-assert] ${resolution.assertionMessage}`);
}

/** 2-digit GSTIN state prefix vs the subdivision's GST code. A subdivision with
 *  no tax_authority_code (e.g. code 96/97 place-of-supply-only rows) never mismatches. */
export function gstinMatchesSubdivision(
  gstin: string,
  taxAuthorityCode: string | null | undefined,
): boolean {
  if (!taxAuthorityCode) return true;
  return gstin.trim().slice(0, 2) === taxAuthorityCode;
}
```

Run: `npx vitest run src/lib/regimes/in_gst/registrationStatus.test.ts` — Expected: all pass EXCEPT the structural "D6 wire" test (the call site doesn't exist yet).

- [ ] **Step 4: Add the service wrapper + wire the compute path**

Append to `src/lib/taxRegistrationService.ts` (after `setDeclaredRegistrationStatus`), and add the two imports at the top of the file:

```typescript
import type { LegalEntityTaxRegistrationRow } from './regimes/types';
import {
  regimeRequiresExplicitRegistrationStatus,
  filterActiveRegistrations,
  resolveGstRegistrationStatus,
  assertNoSilentUnregisteredFallback,
} from './regimes/in_gst/registrationStatus';

/** D6 choke-point guard: called by computeDocumentTotals with the pack-resolved
 *  regime.tax key and the seller registrations it already fetched. No-op for
 *  non-GST regimes; lazily reads the declared status only when there is no
 *  active registration (getOrCreateCompanySettings is cached ~5 min). */
export async function assertGstRegistrationExplicit(
  regimeTaxKey: string,
  registrations: LegalEntityTaxRegistrationRow[],
  onDate: string,
): Promise<void> {
  if (!regimeRequiresExplicitRegistrationStatus(regimeTaxKey)) return;
  const active = filterActiveRegistrations(registrations, onDate);
  const declaredStatus = active.length > 0 ? undefined : await getDeclaredRegistrationStatus();
  assertNoSilentUnregisteredFallback(
    resolveGstRegistrationStatus({ regimeTaxKey, activeRegistrations: active, declaredStatus }),
  );
}
```

In `src/lib/taxDocumentService.ts`, add the import `import { assertGstRegistrationExplicit } from './taxRegistrationService';` and insert ONE line in `computeDocumentTotals`, immediately after the strategy-resolution line (main `:172`; after WP-S3 that line reads `const strategy = resolveTaxStrategy(<packResolvedKey>)` — pass the **identical** `<packResolvedKey>` expression here):

```typescript
  await assertGstRegistrationExplicit(<packResolvedKey>, seller.registrations, input.documentDate);
```

(`seller.registrations` and `input.documentDate` are already in scope — `taxDocumentService.ts:145,141`.)

- [ ] **Step 5: Run tests, verify pass, commit**

Run: `npx vitest run src/lib/regimes/in_gst/registrationStatus.test.ts src/lib/taxRegistrationService.test.ts` — Expected: all pass (structural wire test now green). `npm run typecheck` — 0.

```bash
git add src/lib/regimes/in_gst/registrationStatus.ts src/lib/regimes/in_gst/registrationStatus.test.ts src/lib/taxRegistrationService.ts src/lib/taxDocumentService.ts
git commit -m "feat(tax): D6 explicit GST registration status — resolver + silent-fallback dev assertion wired into computeDocumentTotals"
```

---

### Task L2.3: Onboarding — State/UT selector + GSTIN state cross-check in JurisdictionStep

**Files:**
- Modify: `src/lib/geoCountryService.ts` (append `listCountrySubdivisions` inside the `geoCountryService` object after `listOnboardableCountries`, which ends at `:45`; export `CountrySubdivision` above the object)
- Modify: `src/pages/auth/onboarding/constants.ts` (`OnboardingFormData` `:112-132` — add `subdivisionId: string;` under `taxNumber` at `:126`; `DEFAULT_FORM_DATA` `:134-152` — add `subdivisionId: ''` beside `taxNumber: ''` at `:146`; `jurisdictionSchema` `:97-102` — add `subdivisionId: z.string(),`)
- Modify: `src/pages/auth/onboarding/steps/JurisdictionStep.tsx` (selector + GSTIN-aware validation; existing tax-number block `:72-86`)
- Modify: `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts` (submit payload `:189-205`)
- Modify: `src/lib/tenantService.ts` (`CreateTenantParams` `:8-24`; request body `:86-100`)
- Test: `src/lib/geoCountryService.test.ts` (extend — file exists), `src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx` (create; dom project)

**Interfaces:**
- Consumes: `validateGSTIN(gstin: string, subdivision?: { tax_authority_code: string | null } | null): GstinCheck` where `interface GstinCheck { ok: boolean; error: string | null; stateCode: string | null }`, from `src/lib/regimes/in_gst/gstin.ts` (**WP-S2**, Task S2.1 — format + mod-36 checksum + baked GSTIN-state-code check; the `subdivision` arg is optional, so the single-arg call `validateGSTIN(value)` used here is fine); `gstinMatchesSubdivision` (Task L2.2); S1b-seeded `geo_subdivisions` rows; `OnboardableCountry` (`src/lib/geoCountryService.ts:8-23`); `validateTaxNumber` (`src/pages/auth/onboarding/onboardingValidation.ts:42`, unchanged fallback for non-GST countries).
- Produces: `geoCountryService.listCountrySubdivisions(countryId: string): Promise<CountrySubdivision[]>`; `CountrySubdivision { id; code; name; subdivision_type: string | null; tax_authority_code: string | null }`; `formData.subdivisionId` → `tenantService.createTenant({ subdivisionId })` → provision-tenant request key `subdivision_id` (Task L2.4). `listCountrySubdivisions` is also consumed by Task L2.6.

- [ ] **Step 1: Write the failing service test**

Append to `src/lib/geoCountryService.test.ts` (keep its existing mocks intact; if the file already mocks `./supabaseClient` with a module-level `fromMock`, reuse it — the assertion body below is what matters):

```typescript
describe('listCountrySubdivisions', () => {
  it('returns active, non-deleted subdivisions ordered by sort_order', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: 's1', code: 'IN-KA', name: 'Karnataka', subdivision_type: 'state', tax_authority_code: '29' }],
      error: null,
    });
    const is = vi.fn().mockReturnValue({ order });
    const eq2 = vi.fn().mockReturnValue({ is });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    fromMock.mockReturnValueOnce({ select });
    const rows = await geoCountryService.listCountrySubdivisions('c-in');
    expect(fromMock).toHaveBeenCalledWith('geo_subdivisions');
    expect(eq1).toHaveBeenCalledWith('country_id', 'c-in');
    expect(eq2).toHaveBeenCalledWith('is_active', true);
    expect(is).toHaveBeenCalledWith('deleted_at', null);
    expect(rows[0].tax_authority_code).toBe('29');
  });
});
```

Run: `npx vitest run src/lib/geoCountryService.test.ts` — Expected: FAIL (`listCountrySubdivisions is not a function`).

- [ ] **Step 2: Implement the service addition**

In `src/lib/geoCountryService.ts`, add above the `geoCountryService` object:

```typescript
export interface CountrySubdivision {
  id: string;
  code: string;
  name: string;
  subdivision_type: string | null;
  tax_authority_code: string | null;
}
```

and append inside the object, after `listOnboardableCountries` (before the closing `};` at `:46`):

```typescript
  /**
   * Tax subdivisions for a country (India states/UTs with GST codes; US states
   * in Phase 5). Empty array = no subdivision dimension; callers hide the picker.
   */
  async listCountrySubdivisions(countryId: string): Promise<CountrySubdivision[]> {
    const { data, error } = await supabase
      .from('geo_subdivisions')
      .select('id, code, name, subdivision_type, tax_authority_code')
      .eq('country_id', countryId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order');
    if (error) throw new Error(error.message);
    return (data ?? []) as CountrySubdivision[];
  },
```

Run: `npx vitest run src/lib/geoCountryService.test.ts` — Expected: PASS.

- [ ] **Step 3: Wire form data, schema, and submit threading**

In `src/pages/auth/onboarding/constants.ts`: add `subdivisionId: string;` to `OnboardingFormData` directly under `taxNumber: string;` (`:126`); add `subdivisionId: '',` to `DEFAULT_FORM_DATA` beside `taxNumber: ''` (`:146` — required: omitting it leaves the new `<select>` uncontrolled and breaks the component test); add `subdivisionId: z.string(),` to `jurisdictionSchema` (`:97-102` — presence-only, NOT `min(1)`: countries without subdivisions submit `''`).

In `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts`, inside the `tenantService.createTenant({...})` payload (`:189-205`), after the `taxNumber` line add:

```typescript
        subdivisionId: formData.subdivisionId || undefined,
```

In `src/lib/tenantService.ts`: add to `CreateTenantParams` (`:8-24`) after `taxNumber?: string;`:

```typescript
  /** Seller state/UT (GSTIN state) — threads to legal_entity_tax_registrations.subdivision_id. */
  subdivisionId?: string;
```

and to the request body (`:86-100`) after the `tax_number` spread:

```typescript
        ...(params.subdivisionId ? { subdivision_id: params.subdivisionId } : {}),
```

- [ ] **Step 4: Write the failing component test**

```typescript
// src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../../lib/geoCountryService', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    geoCountryService: {
      ...(mod.geoCountryService as Record<string, unknown>),
      listCountrySubdivisions: vi.fn().mockResolvedValue([
        { id: 's-ka', code: 'IN-KA', name: 'Karnataka', subdivision_type: 'state', tax_authority_code: '29' },
        { id: 's-mh', code: 'IN-MH', name: 'Maharashtra', subdivision_type: 'state', tax_authority_code: '27' },
      ]),
    },
  };
});
// Checksum validity is S3's concern — stub it OK so this test isolates the
// L2 state-prefix cross-check.
vi.mock('../../../../lib/regimes/in_gst/gstin', () => ({
  validateGSTIN: vi.fn().mockReturnValue({ ok: true, error: null }),
}));

import { JurisdictionStep } from './JurisdictionStep';

const country = {
  id: 'c-in', code: 'IN', name: 'India', currency_code: 'INR', currency_symbol: '₹',
  is_active: true, language_code: 'en', tax_system: 'GST', tax_label: 'GST',
  tax_number_label: 'GSTIN',
  tax_number_format: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$',
  fiscal_year_start: '04-01', timezone: 'Asia/Kolkata',
};

const baseForm = {
  companyName: '', slug: '', countryId: 'c-in', baseCurrencyCode: 'INR', fullName: '', email: '',
  password: '', confirmPassword: '', emailVerified: false, uiLanguage: '', legalEntityType: 'llc',
  taxNumber: '27ABCDE1234F1Z5', subdivisionId: 's-ka', fiscalYearStart: '4',
  timezone: 'Asia/Kolkata', services: [], estimatedCases: '', planId: '',
};

describe('JurisdictionStep with GST subdivisions', () => {
  it('renders the state selector and flags a GSTIN/state prefix mismatch', async () => {
    render(<JurisdictionStep formData={baseForm} country={country} updateField={vi.fn()} />);
    expect(await screen.findByLabelText(/state \/ union territory/i)).toBeInTheDocument();
    // GSTIN prefix 27 (Maharashtra) vs selected Karnataka (29) → mismatch message
    expect(await screen.findByText(/does not match the selected state/i)).toBeInTheDocument();
  });

  it('shows no mismatch when the prefix matches the selected state', async () => {
    render(
      <JurisdictionStep
        formData={{ ...baseForm, taxNumber: '29ABCDE1234F1Z5' }}
        country={country}
        updateField={vi.fn()}
      />,
    );
    expect(await screen.findByLabelText(/state \/ union territory/i)).toBeInTheDocument();
    expect(screen.queryByText(/does not match the selected state/i)).toBeNull();
  });
});
```

Run: `npx vitest run src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx` — Expected: FAIL (no state selector rendered).

- [ ] **Step 5: Extend JurisdictionStep**

In `src/pages/auth/onboarding/steps/JurisdictionStep.tsx`, add imports:

```tsx
import { useEffect, useState } from 'react';
import { geoCountryService, type CountrySubdivision } from '../../../../lib/geoCountryService';
import { validateGSTIN } from '../../../../lib/regimes/in_gst/gstin';
import { gstinMatchesSubdivision } from '../../../../lib/regimes/in_gst/registrationStatus';
```

In the component body (before the `return`, replacing the existing `taxCheck` const at `:32-35` with the block below):

```tsx
  const [subdivisions, setSubdivisions] = useState<CountrySubdivision[]>([]);
  useEffect(() => {
    let cancelled = false;
    geoCountryService.listCountrySubdivisions(country.id)
      .then((rows) => { if (!cancelled) setSubdivisions(rows); })
      .catch(() => { if (!cancelled) setSubdivisions([]); });
    return () => { cancelled = true; };
  }, [country.id]);

  const selectedSubdivision = subdivisions.find((s) => s.id === formData.subdivisionId) ?? null;
  const hasGstSubdivisions = subdivisions.some((s) => s.tax_authority_code);
  const trimmedTax = formData.taxNumber.trim();

  // GST-coded countries get the S3 checksum validator + the L2 state cross-check;
  // everything else keeps the existing soft regex check.
  let taxCheck: { ok: boolean; message?: string } = { ok: true };
  if (trimmedTax.length > 0) {
    if (hasGstSubdivisions) {
      const gstin = validateGSTIN(trimmedTax);
      if (!gstin.ok) {
        taxCheck = { ok: false, message: gstin.error ?? 'Invalid GSTIN' };
      } else if (selectedSubdivision && !gstinMatchesSubdivision(trimmedTax, selectedSubdivision.tax_authority_code)) {
        taxCheck = {
          ok: false,
          message: `This ${country.tax_number_label || 'GSTIN'} does not match the selected state (expected state code ${selectedSubdivision.tax_authority_code}).`,
        };
      }
    } else {
      taxCheck = validateTaxNumber(country.tax_number_format, formData.taxNumber);
    }
  }
```

In the JSX, insert the selector block ABOVE the tax-number field block (`:72`), rendered only when subdivisions exist:

```tsx
        {subdivisions.length > 0 && (
          <div>
            <label htmlFor="jurisdiction-subdivision" className="block text-sm font-medium text-slate-300 mb-2">
              State / Union Territory <span className="text-primary">*</span>
            </label>
            <select
              id="jurisdiction-subdivision"
              aria-label="State / Union Territory"
              value={formData.subdivisionId}
              onChange={(e) => updateField('subdivisionId', e.target.value)}
              className={inputClasses(false)}
            >
              <option value="" className="bg-slate-900">Select a state…</option>
              {subdivisions.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900">
                  {s.name}{s.tax_authority_code ? ` (${s.tax_authority_code})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
```

(The existing `{!taxCheck.ok && <p className="text-danger text-xs mt-1">{taxCheck.message}</p>}` at `:83-85` renders both the checksum error and the mismatch message — no further JSX change.)

- [ ] **Step 6: Run tests + typecheck, commit**

Run: `npx vitest run src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx src/lib/geoCountryService.test.ts` — Expected: PASS. `npm run typecheck` — 0.

```bash
git add src/lib/geoCountryService.ts src/lib/geoCountryService.test.ts src/pages/auth/onboarding/constants.ts src/pages/auth/onboarding/steps/JurisdictionStep.tsx src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx src/pages/auth/onboarding/hooks/useOnboardingFlow.ts src/lib/tenantService.ts
git commit -m "feat(onboarding): state/UT selector + GSTIN checksum & state-prefix cross-check in JurisdictionStep"
```

---

### Task L2.4: `provision-tenant` writes the primary tax registration

**Files:**
- Modify: `supabase/functions/provision-tenant/index.ts` (request interface `:57-71`; body destructure `:143`; `legal_entities` insert block `:413-439`)
- Modify: `supabase/functions/provision-tenant/provisionGuards.ts` (append pure builder)
- Test: `supabase/functions/provision-tenant/provisionGuards.test.ts` (extend — runs under `npm run geo:test`, config `vitest.config.scripts.ts:16`)

**Interfaces:**
- Consumes: Task L2.3's `subdivision_id` request key; the existing fail-loud soft-delete rollback pattern (`index.ts:434-439`).
- Produces: `buildPrimaryRegistrationRow(input: PrimaryRegistrationInput)` (pure); on provisioning with a `tax_number`, exactly one `legal_entity_tax_registrations` row (`scheme 'standard'`, `is_primary true`, `registered_from` = today UTC) — the row S2 created manually for the IN test tenant now exists for every self-serve signup. Deployed via `mcp__supabase__deploy_edge_function`.

- [ ] **Step 1: Write the failing pure-guard test**

Append to `supabase/functions/provision-tenant/provisionGuards.test.ts` (extend the import at `:2-7` with `buildPrimaryRegistrationRow`):

```typescript
describe('buildPrimaryRegistrationRow', () => {
  const base = {
    tenantId: 't1', legalEntityId: 'le1', countryId: 'c-in',
    taxNumber: '29ABCDE1234F1Z5', subdivisionId: 's-ka', today: '2026-07-05',
  };
  it('builds a standard primary registration when a tax number exists', () => {
    expect(buildPrimaryRegistrationRow(base)).toEqual({
      tenant_id: 't1', legal_entity_id: 'le1', country_id: 'c-in',
      subdivision_id: 's-ka', tax_number: '29ABCDE1234F1Z5',
      scheme: 'standard', registered_from: '2026-07-05', is_primary: true,
    });
  });
  it('returns null when no tax number was captured (unregistered business)', () => {
    expect(buildPrimaryRegistrationRow({ ...base, taxNumber: '' })).toBe(null);
    expect(buildPrimaryRegistrationRow({ ...base, taxNumber: null })).toBe(null);
    expect(buildPrimaryRegistrationRow({ ...base, taxNumber: undefined })).toBe(null);
  });
  it('tolerates a missing subdivision (non-subdivision countries)', () => {
    expect(buildPrimaryRegistrationRow({ ...base, subdivisionId: null })?.subdivision_id).toBe(null);
  });
});
```

Run: `npm run geo:test -- supabase/functions/provision-tenant/provisionGuards.test.ts` — Expected: FAIL (`buildPrimaryRegistrationRow` not exported).

- [ ] **Step 2: Implement the pure builder**

Append to `supabase/functions/provision-tenant/provisionGuards.ts`:

```typescript
export interface PrimaryRegistrationInput {
  tenantId: string;
  legalEntityId: string;
  countryId: string;
  taxNumber: string | null | undefined;
  subdivisionId: string | null | undefined;
  today: string; // 'YYYY-MM-DD' (UTC)
}

/** Seller registration row from the jurisdiction payload. null = nothing captured
 *  (the tenant declares registered/unregistered post-onboarding in Settings —
 *  D6 explicit-status discipline; nothing is fabricated here). */
export function buildPrimaryRegistrationRow(input: PrimaryRegistrationInput) {
  const taxNumber = (input.taxNumber ?? '').trim();
  if (!taxNumber) return null;
  return {
    tenant_id: input.tenantId,
    legal_entity_id: input.legalEntityId,
    country_id: input.countryId,
    subdivision_id: input.subdivisionId ?? null,
    tax_number: taxNumber,
    scheme: 'standard' as const,
    registered_from: input.today,
    is_primary: true,
  };
}
```

Run: `npm run geo:test -- supabase/functions/provision-tenant/provisionGuards.test.ts` — Expected: PASS (3 new tests).

- [ ] **Step 3: Wire the edge function**

In `supabase/functions/provision-tenant/index.ts`:
1. Request interface (`:57-71`): add `subdivision_id?: string;` after `tax_number?: string;`.
2. Body destructure (`:143`): add `subdivision_id` to the destructured list.
3. `legal_entities` insert (`:413-432`): change the bare `.insert({...})` to `.insert({...}).select('id').single()`, capturing `const { data: legalEntity, error: legalEntityError }` (edge functions run service-role Deno — the frontend-only `maybeSingle` rule does not apply, and the insert-returning row is guaranteed).
4. Immediately after the existing `legalEntityError` rollback block (`:434-439`), add (and extend the `provisionGuards.ts` import at the top of `index.ts` with `buildPrimaryRegistrationRow`):

```typescript
    // Primary tax registration (GSTIN / any registered seller). Same fail-loud
    // soft-delete rollback discipline as the legal entity itself.
    const registrationRow = buildPrimaryRegistrationRow({
      tenantId: tenant.id,
      legalEntityId: legalEntity!.id,
      countryId,
      taxNumber: tax_number,
      subdivisionId: subdivision_id ?? null,
      today: new Date().toISOString().slice(0, 10),
    });
    if (registrationRow) {
      const { error: registrationError } = await supabase
        .from('legal_entity_tax_registrations')
        .insert(registrationRow);
      if (registrationError) {
        console.error('Primary tax registration creation failed:', registrationError);
        await supabase.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
        throw new Error(`Provisioning failed: legal_entity_tax_registrations insert: ${registrationError.message}`);
      }
    }
```

- [ ] **Step 4: Deploy + verify**

Run `npm run geo:test` (full scripts project — no regressions), then deploy via `mcp__supabase__deploy_edge_function` (project_id `ssmbegiyjivrcwgcqutu`, name `provision-tenant`, passing the updated `index.ts` + `provisionGuards.ts` files). Live probe: read-only check that the function version bumped via `mcp__supabase__list_edge_functions`; the end-to-end registration-row assertion is exercised by WP-GA's dry run (the S2 IN test tenant already has its manually-created row).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/provision-tenant/index.ts supabase/functions/provision-tenant/provisionGuards.ts supabase/functions/provision-tenant/provisionGuards.test.ts
git commit -m "feat(provisioning): write primary legal_entity_tax_registrations row from the jurisdiction payload"
```

---

### Task L2.5: Branch-state mismatch detection (banner data + dev assertion)

**Files:**
- Create: `src/lib/regimes/in_gst/branchStateCheck.ts`
- Modify: `src/lib/taxRegistrationService.ts` (append `getBranchStateMismatches`)
- Test: `src/lib/regimes/in_gst/branchStateCheck.test.ts` (node)

**Interfaces:**
- Consumes: `branches.subdivision_id` (verified live, `database.types.ts:1233`); `getActiveTaxRegistration` (Task L2.1); `logger` (`src/lib/logger.ts`); `supabase`.
- Produces: `BranchStateMismatch { branchId: string; branchName: string; branchSubdivisionId: string }`; `findBranchStateMismatches(branches, registrationSubdivisionId): BranchStateMismatch[]` (pure); `getBranchStateMismatches(): Promise<BranchStateMismatch[]>` (service — fires the dev assertion as a **non-throwing** `logger.error` so the Settings banner that reports the problem can still render). Consumed by Task L2.6 and WP-GA's honest-degrade checks.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/branchStateCheck.test.ts
import { describe, it, expect } from 'vitest';
import { findBranchStateMismatches } from './branchStateCheck';

const branches = [
  { id: 'b1', name: 'HQ Lab — Bengaluru', subdivision_id: 's-ka', is_active: true },
  { id: 'b2', name: 'Mumbai Intake Desk', subdivision_id: 's-mh', is_active: true },
  { id: 'b3', name: 'Closed Pune Desk', subdivision_id: 's-mh', is_active: false },
  { id: 'b4', name: 'No-state branch', subdivision_id: null, is_active: true },
];

describe('findBranchStateMismatches', () => {
  it('flags active branches whose state differs from the GSTIN state', () => {
    const out = findBranchStateMismatches(branches, 's-ka');
    expect(out).toEqual([{ branchId: 'b2', branchName: 'Mumbai Intake Desk', branchSubdivisionId: 's-mh' }]);
  });

  it('ignores inactive branches and branches without a state', () => {
    const out = findBranchStateMismatches(branches, 's-mh');
    expect(out.map((m) => m.branchId)).toEqual(['b1']);
  });

  it('returns [] when the registration has no subdivision (nothing to compare)', () => {
    expect(findBranchStateMismatches(branches, null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/branchStateCheck.test.ts`
Expected: FAIL — `Cannot find module './branchStateCheck'`.

- [ ] **Step 3: Implement the pure check + the service fetch**

```typescript
// src/lib/regimes/in_gst/branchStateCheck.ts
// Single-GSTIN v1 invariant: every active branch operates in the GSTIN's state.
// A branch in another state legally needs its OWN GSTIN — the multi-state
// registration manager is a named Phase-4 deferral, so we DETECT and warn
// loudly instead of silently mis-taxing inter-state branch supplies.

export interface BranchForStateCheck {
  id: string;
  name: string;
  subdivision_id: string | null;
  is_active: boolean | null;
}

export interface BranchStateMismatch {
  branchId: string;
  branchName: string;
  branchSubdivisionId: string;
}

export function findBranchStateMismatches(
  branches: BranchForStateCheck[],
  registrationSubdivisionId: string | null,
): BranchStateMismatch[] {
  if (!registrationSubdivisionId) return [];
  return branches
    .filter((b) => b.is_active === true && b.subdivision_id !== null && b.subdivision_id !== registrationSubdivisionId)
    .map((b) => ({ branchId: b.id, branchName: b.name, branchSubdivisionId: b.subdivision_id as string }));
}
```

Append to `src/lib/taxRegistrationService.ts` (extend the existing `./regimes/in_gst/registrationStatus` import block region with the new import, and add `import { logger } from './logger';`):

```typescript
import { findBranchStateMismatches, type BranchStateMismatch } from './regimes/in_gst/branchStateCheck';

export type { BranchStateMismatch } from './regimes/in_gst/branchStateCheck';

/** Branch-state vs GSTIN-state check. Non-throwing dev assertion: the mismatch
 *  is reported via logger.error AND returned so the Settings banner (which is
 *  the surface telling the user how to fix it) always renders. */
export async function getBranchStateMismatches(): Promise<BranchStateMismatch[]> {
  const today = new Date().toISOString().slice(0, 10);
  const registration = await getActiveTaxRegistration(today);
  if (!registration || !registration.subdivision_id) return [];
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, subdivision_id, is_active')
    .is('deleted_at', null);
  if (error) throw error;
  const mismatches = findBranchStateMismatches(data ?? [], registration.subdivision_id);
  if (mismatches.length > 0) {
    logger.error(
      `[dev-assert] ${mismatches.length} active branch(es) are in a different state than the GSTIN registration ` +
      `(${mismatches.map((m) => m.branchName).join(', ')}). Multi-state GSTIN management is not yet available; ` +
      'these branches must not issue GST documents under this registration.',
    );
  }
  return mismatches;
}
```

- [ ] **Step 4: Extend the service test for the assertion path**

Append to `src/lib/taxRegistrationService.test.ts` (the `./supabaseClient` and `./companySettingsService` mocks from Task L2.1 are already in place; add a `vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))` at the top of the file and `import { logger } from './logger';` plus `import { getBranchStateMismatches } from './taxRegistrationService';` to the existing imports):

```typescript
describe('getBranchStateMismatches', () => {
  it('returns mismatched branches and fires the non-throwing dev assertion', async () => {
    const regChain = chain({
      data: [{ id: 'r1', is_primary: true, subdivision_id: 's-ka', registered_from: '2026-04-01', registered_to: null }],
      error: null,
    });
    const branchChain = chain({ data: null, error: null });
    branchChain.is.mockResolvedValue({
      data: [
        { id: 'b1', name: 'HQ', subdivision_id: 's-ka', is_active: true },
        { id: 'b2', name: 'Mumbai Desk', subdivision_id: 's-mh', is_active: true },
      ],
      error: null,
    });
    fromMock.mockImplementation((table: string) =>
      table === 'legal_entity_tax_registrations' ? regChain : branchChain);
    const out = await getBranchStateMismatches();
    expect(out).toEqual([{ branchId: 'b2', branchName: 'Mumbai Desk', branchSubdivisionId: 's-mh' }]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Mumbai Desk'));
  });

  it('returns [] with no registration and never queries branches', async () => {
    const regChain = chain({ data: [], error: null });
    fromMock.mockReturnValue(regChain);
    expect(await getBranchStateMismatches()).toEqual([]);
    expect(fromMock).not.toHaveBeenCalledWith('branches');
  });
});
```

- [ ] **Step 5: Run tests, verify pass, commit**

Run: `npx vitest run src/lib/regimes/in_gst/branchStateCheck.test.ts src/lib/taxRegistrationService.test.ts` — Expected: all pass. `npm run typecheck` — 0.

```bash
git add src/lib/regimes/in_gst/branchStateCheck.ts src/lib/regimes/in_gst/branchStateCheck.test.ts src/lib/taxRegistrationService.ts src/lib/taxRegistrationService.test.ts
git commit -m "feat(tax): branch-state vs GSTIN-state mismatch detection with loud dev assertion"
```

---

### Task L2.6: Settings → Tax Registration page (explicit status control, loud unregistered mode, branch banner)

**Files:**
- Create: `src/pages/settings/TaxRegistrationSettings.tsx`
- Modify: `src/App.tsx` (settings routes block `:249-269` — add the route line directly after the `appearance` route at `:253`, and BEFORE the `:categoryId` catch-all at `:268`)
- Modify: `src/config/settingsCategories.ts` (add the category to `SETTINGS_CATEGORIES` after the `appearance` entry ending `:78`; add `'tax-registration'` to the `finance` group's `categoryIds` in `SETTINGS_GROUPS` `:310`; add `Receipt` to the lucide import at `:1-21`)
- Modify: `src/lib/queryKeys.ts` (`settingsKeys` `:109-120` — two new keys)
- Test: `src/pages/settings/TaxRegistrationSettings.test.tsx` (dom project)

**Interfaces:**
- Consumes: `getPrimaryLegalEntity` / `getActiveTaxRegistration` / `createTaxRegistration` / `endTaxRegistration` / `getDeclaredRegistrationStatus` / `setDeclaredRegistrationStatus` / `getBranchStateMismatches` (Tasks L2.1/L2.5); `gstinMatchesSubdivision` (L2.2); `validateGSTIN` (**WP-S2**, canonical 3-field `GstinCheck {ok, error, stateCode}` signature per Task L2.3; called single-arg here since `subdivision` is optional); `geoCountryService.listCountrySubdivisions` (L2.3); `useTaxConfig` (`src/contexts/TenantConfigContext.tsx:130` — `TaxConfig` has `label`/`numberLabel`/`numberPlaceholder`, `src/types/tenantConfig.ts:28-37`); `SettingsPageHeader` (`src/components/layout/SettingsPageHeader.tsx:12`); `Button` (`src/components/ui/Button.tsx:61` — variants verified); `useToast` (`src/hooks/useToast`); TanStack Query.
- Produces: route `/settings/tax-registration` (admin-gated by the existing `ADMIN_ROLES` wrapper at `App.tsx:250`; the `SettingsDashboard` default navigation `navigate('/settings/${categoryId}')` reaches it with no dashboard change); `settingsKeys.taxRegistration()` and `settingsKeys.branchStateCheck()`. This page is the tenant-visible D6 control the WP-GA checklist verifies.

- [ ] **Step 1: Add the query keys**

In `src/lib/queryKeys.ts`, inside `settingsKeys` (`:109-120`), after the `masterData` line add:

```typescript
  taxRegistration: () => ['settings', 'tax-registration'] as const,
  branchStateCheck: () => ['settings', 'branch-state-check'] as const,
```

- [ ] **Step 2: Write the failing page test**

```typescript
// src/pages/settings/TaxRegistrationSettings.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const svc = {
  getPrimaryLegalEntity: vi.fn(),
  getActiveTaxRegistration: vi.fn(),
  createTaxRegistration: vi.fn(),
  endTaxRegistration: vi.fn(),
  getDeclaredRegistrationStatus: vi.fn(),
  setDeclaredRegistrationStatus: vi.fn(),
  getBranchStateMismatches: vi.fn(),
};
vi.mock('../../lib/taxRegistrationService', () => svc);
vi.mock('../../lib/geoCountryService', () => ({
  geoCountryService: {
    listCountrySubdivisions: vi.fn().mockResolvedValue([
      { id: 's-ka', code: 'IN-KA', name: 'Karnataka', subdivision_type: 'state', tax_authority_code: '29' },
    ]),
  },
}));
vi.mock('../../lib/regimes/in_gst/gstin', () => ({
  validateGSTIN: vi.fn().mockReturnValue({ ok: true, error: null }),
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useTaxConfig: () => ({
    system: 'GST', label: 'GST', numberLabel: 'GSTIN',
    numberFormat: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$',
    numberPlaceholder: '22AAAAA0000A1Z5', defaultRate: 18, invoiceRequired: true,
  }),
}));
vi.mock('../../components/layout/SettingsPageHeader', () => ({
  SettingsPageHeader: () => null,
}));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { TaxRegistrationSettings } from './TaxRegistrationSettings';

const registration = {
  id: 'r1', legal_entity_id: 'le1', country_id: 'c-in', subdivision_id: 's-ka',
  tax_number: '29ABCDE1234F1Z5', scheme: 'standard', registered_from: '2026-04-01',
  registered_to: null, is_primary: true, tenant_id: 't1', created_at: '', updated_at: null, deleted_at: null,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}><TaxRegistrationSettings /></QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.values(svc).forEach((m) => m.mockReset());
  svc.getPrimaryLegalEntity.mockResolvedValue({ id: 'le1', country_id: 'c-in' });
  svc.getBranchStateMismatches.mockResolvedValue([]);
});

describe('TaxRegistrationSettings', () => {
  it('registered tenant: shows the GSTIN and the Registered state', async () => {
    svc.getActiveTaxRegistration.mockResolvedValue(registration);
    svc.getDeclaredRegistrationStatus.mockResolvedValue('registered');
    renderPage();
    expect(await screen.findByText('29ABCDE1234F1Z5')).toBeInTheDocument();
    expect(screen.getByText(/^registered$/i)).toBeInTheDocument();
  });

  it('declared-unregistered tenant: renders the LOUD warning', async () => {
    svc.getActiveTaxRegistration.mockResolvedValue(null);
    svc.getDeclaredRegistrationStatus.mockResolvedValue('unregistered');
    renderPage();
    expect(await screen.findByText(/without gst/i)).toBeInTheDocument();
    expect(screen.getByText(/not gst registered/i)).toBeInTheDocument();
  });

  it('undeclared tenant: renders the action-required state (D6 — never silent)', async () => {
    svc.getActiveTaxRegistration.mockResolvedValue(null);
    svc.getDeclaredRegistrationStatus.mockResolvedValue(undefined);
    renderPage();
    expect(await screen.findByText(/registration status is not set/i)).toBeInTheDocument();
  });

  it('branch-state mismatch: renders the warning banner naming the branch', async () => {
    svc.getActiveTaxRegistration.mockResolvedValue(registration);
    svc.getDeclaredRegistrationStatus.mockResolvedValue('registered');
    svc.getBranchStateMismatches.mockResolvedValue([
      { branchId: 'b2', branchName: 'Mumbai Intake Desk', branchSubdivisionId: 's-mh' },
    ]);
    renderPage();
    expect(await screen.findByText(/Mumbai Intake Desk/)).toBeInTheDocument();
    expect(screen.getByText(/multi-state gstin management is not yet available/i)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/settings/TaxRegistrationSettings.test.tsx` — Expected: FAIL (`Cannot find module './TaxRegistrationSettings'`).

- [ ] **Step 3: Implement the page**

```tsx
// src/pages/settings/TaxRegistrationSettings.tsx
// D6 surface: the tenant-visible GST registration status. SINGLE-registration
// UX (multi-state GSTIN manager is a named Phase-4 deferral). Registered =
// active legal_entity_tax_registrations row; Unregistered = explicit declared
// flag with a LOUD warning; neither = "action required" (the compute-path dev
// assertion fires until this page is answered). Semantic tokens only (DESIGN.md).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, AlertTriangle, ShieldCheck, ShieldOff } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../hooks/useToast';
import { useTaxConfig } from '../../contexts/TenantConfigContext';
import { settingsKeys } from '../../lib/queryKeys';
import { geoCountryService, type CountrySubdivision } from '../../lib/geoCountryService';
import { validateGSTIN } from '../../lib/regimes/in_gst/gstin';
import { gstinMatchesSubdivision } from '../../lib/regimes/in_gst/registrationStatus';
import {
  getPrimaryLegalEntity, getActiveTaxRegistration, createTaxRegistration,
  endTaxRegistration, getDeclaredRegistrationStatus, setDeclaredRegistrationStatus,
  getBranchStateMismatches,
} from '../../lib/taxRegistrationService';

const today = () => new Date().toISOString().slice(0, 10);

export const TaxRegistrationSettings: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const tax = useTaxConfig();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [taxNumber, setTaxNumber] = useState('');
  const [subdivisionId, setSubdivisionId] = useState('');

  const { data: view, isLoading } = useQuery({
    queryKey: settingsKeys.taxRegistration(),
    queryFn: async () => {
      const [entity, registration, declared] = await Promise.all([
        getPrimaryLegalEntity(), getActiveTaxRegistration(today()), getDeclaredRegistrationStatus(),
      ]);
      return { entity, registration, declared };
    },
  });

  const { data: mismatches = [] } = useQuery({
    queryKey: settingsKeys.branchStateCheck(),
    queryFn: getBranchStateMismatches,
  });

  const { data: subdivisions = [] } = useQuery<CountrySubdivision[]>({
    queryKey: ['settings', 'tax-subdivisions', view?.entity?.country_id ?? ''],
    queryFn: () => geoCountryService.listCountrySubdivisions(view!.entity!.country_id),
    enabled: !!view?.entity?.country_id,
  });

  const status: 'registered' | 'unregistered' | 'unset' =
    view?.registration ? 'registered' : view?.declared === 'unregistered' ? 'unregistered' : 'unset';

  const selected = subdivisions.find((s) => s.id === subdivisionId) ?? null;
  const trimmed = taxNumber.trim().toUpperCase();
  let formError: string | null = null;
  if (trimmed.length > 0) {
    const check = validateGSTIN(trimmed);
    if (!check.ok) formError = check.error ?? `Invalid ${tax.numberLabel}`;
    else if (selected && !gstinMatchesSubdivision(trimmed, selected.tax_authority_code)) {
      formError = `This ${tax.numberLabel} does not match the selected state (expected state code ${selected.tax_authority_code}).`;
    }
  }
  const canSave = trimmed.length > 0 && !formError && (subdivisions.length === 0 || !!subdivisionId);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: settingsKeys.taxRegistration() });
    queryClient.invalidateQueries({ queryKey: settingsKeys.branchStateCheck() });
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!view?.entity) throw new Error('No primary legal entity configured for this workspace.');
      if (view.registration) await endTaxRegistration(view.registration.id, today());
      await createTaxRegistration({
        legal_entity_id: view.entity.id,
        country_id: view.entity.country_id,
        subdivision_id: subdivisionId || null,
        tax_number: trimmed,
        registered_from: today(),
      });
      await setDeclaredRegistrationStatus('registered');
    },
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setTaxNumber('');
      setSubdivisionId('');
      toast.success(`${tax.numberLabel} registration saved`);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save registration'),
  });

  const unregisterMutation = useMutation({
    mutationFn: async () => {
      if (view?.registration) await endTaxRegistration(view.registration.id, today());
      await setDeclaredRegistrationStatus('unregistered');
    },
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      toast.success(`Workspace marked as not ${tax.label} registered`);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update status'),
  });

  const subdivisionName = (id: string | null) =>
    subdivisions.find((s) => s.id === id)?.name ?? '—';

  const selectClasses =
    'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring';

  if (isLoading) return <div className="min-h-screen p-6"><SettingsPageHeader categoryId="tax-registration" /></div>;

  return (
    <div className="min-h-screen p-6">
      <SettingsPageHeader categoryId="tax-registration" />
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Back to settings"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {mismatches.length > 0 && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning-muted p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Branch state does not match this {tax.numberLabel}
              </p>
              <p className="text-sm text-slate-700 mt-1">
                {mismatches.map((m) => m.branchName).join(', ')}{' '}
                {mismatches.length === 1 ? 'is' : 'are'} in a different state than your registration
                ({subdivisionName(view?.registration?.subdivision_id ?? null)}). A branch operating in
                another state legally needs its own {tax.numberLabel}. Multi-state GSTIN management is
                not yet available — until it ships, do not issue {tax.label} documents from those branches
                under this registration.
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'unset' && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger-muted p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Your {tax.label} registration status is not set
              </p>
              <p className="text-sm text-slate-700 mt-1">
                Documents cannot be taxed correctly until you choose one of the options below.
                This is required — the platform never assumes a registration status silently.
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'unregistered' && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger-muted p-4">
          <div className="flex items-start gap-3">
            <ShieldOff className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Not {tax.label} registered
              </p>
              <p className="text-sm text-slate-700 mt-1">
                This workspace issues documents WITHOUT {tax.label} — plain invoices, no tax lines,
                no {tax.numberLabel} band. If your lab is actually registered, add your {tax.numberLabel} now:
                issuing untaxed invoices while registered is a compliance violation.
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'registered' && view?.registration && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-success" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-success">Registered</p>
                <p className="font-mono text-lg font-semibold text-slate-900">{view.registration.tax_number}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {subdivisionName(view.registration.subdivision_id)} · effective from {view.registration.registered_from}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
              Change {tax.numberLabel}
            </Button>
          </div>
        </div>
      )}

      {(status !== 'registered' || formOpen) && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-4 max-w-xl">
          <h2 className="text-lg font-semibold text-slate-900">
            {status === 'registered' ? `Update ${tax.numberLabel}` : `Set your ${tax.label} registration status`}
          </h2>

          {subdivisions.length > 0 && (
            <div>
              <label htmlFor="tax-reg-subdivision" className="block text-sm font-medium text-slate-700 mb-1">
                State / Union Territory <span className="text-danger">*</span>
              </label>
              <select
                id="tax-reg-subdivision"
                value={subdivisionId}
                onChange={(e) => setSubdivisionId(e.target.value)}
                className={selectClasses}
              >
                <option value="">Select a state…</option>
                {subdivisions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.tax_authority_code ? ` (${s.tax_authority_code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="tax-reg-number" className="block text-sm font-medium text-slate-700 mb-1">
              {tax.numberLabel} <span className="text-danger">*</span>
            </label>
            <input
              id="tax-reg-number"
              type="text"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              placeholder={tax.numberPlaceholder ?? ''}
              className={selectClasses}
            />
            {formError && <p className="text-xs text-danger mt-1">{formError}</p>}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              onClick={() => registerMutation.mutate()}
              disabled={!canSave}
              isLoading={registerMutation.isPending}
            >
              Save as registered
            </Button>
            {status !== 'unregistered' && (
              <Button
                variant="danger"
                onClick={() => unregisterMutation.mutate()}
                isLoading={unregisterMutation.isPending}
              >
                We are not {tax.label} registered
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Marking the workspace as unregistered ends the current registration and issues all
            future documents without {tax.label}. One registration per workspace — multi-state
            registrations are coming later.
          </p>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Register the route + category**

In `src/config/settingsCategories.ts`: add `Receipt` to the lucide-react import (`:1-21`), then insert after the `appearance` entry (ends `:78`):

```typescript
  {
    id: 'tax-registration',
    title: 'Tax Registration',
    icon: Receipt,
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
    tables: [],
    actionLabel: 'Manage Registration',
    description: 'Your tax registration number and registered/unregistered status — controls how every document is taxed.',
  },
```

and add `'tax-registration'` to the `finance` group: `SETTINGS_GROUPS` (`:310`) becomes `categoryIds: ['client-financial', 'localization', 'tax-registration']`.

In `src/App.tsx`, inside the `ADMIN_ROLES`-protected settings block, directly after the `appearance` route (`:253`) and before the `:categoryId` catch-all (`:268`):

```tsx
            <Route path="tax-registration" lazy={page(() => import('./pages/settings/TaxRegistrationSettings'), 'TaxRegistrationSettings')} />
```

- [ ] **Step 5: Run tests, verify pass, commit**

Run: `npx vitest run src/pages/settings/TaxRegistrationSettings.test.tsx src/config/settingsCategories.test.ts` — Expected: PASS (4 new + existing category tests unaffected). `npm run typecheck` — 0. `npm run lint` — clean (semantic tokens only; no banned classes).

```bash
git add src/pages/settings/TaxRegistrationSettings.tsx src/pages/settings/TaxRegistrationSettings.test.tsx src/App.tsx src/config/settingsCategories.ts src/lib/queryKeys.ts
git commit -m "feat(settings): Tax Registration page — explicit registered/unregistered control (D6), loud unregistered mode, branch-state warning"
```

---

### Task L2.7: WP verification + PR

**Files:**
- No new files — verification and delivery only.

**Interfaces:**
- Consumes: everything above. Produces: the WP-L2 PR (owner merges — do NOT merge).

- [ ] **Step 1: Full typecheck** — Run `npm run typecheck`. Expected: 0 errors. If not 0, fix before proceeding (never pipe/filter the output — read it raw).

- [ ] **Step 2: WP test suite** — Run:

```bash
npx vitest run src/lib/taxRegistrationService.test.ts src/lib/regimes/in_gst/registrationStatus.test.ts src/lib/regimes/in_gst/branchStateCheck.test.ts src/lib/geoCountryService.test.ts src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx src/pages/settings/TaxRegistrationSettings.test.tsx src/config/settingsCategories.test.ts
```

Expected: all pass. Then `npm run geo:test` — Expected: all pass (provision guards + country-engine suites unaffected).

- [ ] **Step 3: Lint** — Run `npm run lint`. Expected: clean (in particular `no-country-branching-outside-regimes` — all India logic added under `src/lib/regimes/in_gst/`).

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/india-l2-gstin-registration
gh pr create --title "WP-L2: GSTIN registration capture + explicit status setting (India Pack Phase 4)" --body "$(cat <<'EOF'
## WP-L2 — GSTIN Registration Capture + Status Setting [M, no migration]

Phase 4 India Pack, spec §4-L2 (docs/superpowers/specs/2026-07-05-phase4-india-pack-design.md). Depends on WP-S4 (merged).

- **taxRegistrationService** — single-registration CRUD over `legal_entity_tax_registrations` + explicit declared status in `company_settings.metadata.tax_registration_status` (single-GSTIN UX; multi-state manager is a named deferral).
- **D6 delivered:** `resolveGstRegistrationStatus` + `assertGstRegistrationExplicit` wired into `computeDocumentTotals` — a GST tenant with neither an active registration row nor a declared "unregistered" status is a SILENT FALLBACK: throws under DEV, `logger.error` in production. Structural test pins the wire.
- **Onboarding** — JurisdictionStep gains the State/UT selector (S1b-seeded `geo_subdivisions`) with S3 GSTIN checksum validation + state-prefix cross-check; `subdivisionId` threads formData → tenantService → provision-tenant.
- **provision-tenant** — writes the primary `legal_entity_tax_registrations` row (scheme standard, is_primary, registered_from today) with the standard fail-loud soft-delete rollback; redeployed.
- **Settings → Tax Registration** (`/settings/tax-registration`, admin-gated) — explicit registered/unregistered control, LOUD unregistered treatment, "status not set" action-required state, and the **branch-state mismatch warning** (any active `branches.subdivision_id` ≠ GSTIN state → banner + non-throwing dev assertion) pointing at the deferred multi-state manager.

Verification: `npm run typecheck` = 0; WP vitest suites green; `npm run geo:test` green; `npm run lint` clean. No migration (all tables pre-existing, verified).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Report** — Post the PR URL and the WP-GA-relevant assertion inventory (D6 silent-fallback assertion location: `src/lib/regimes/in_gst/registrationStatus.ts` via `taxDocumentService.computeDocumentTotals`; branch-mismatch assertion: `taxRegistrationService.getBranchStateMismatches`; loud unregistered surface: `/settings/tax-registration`). Owner merges.

---


## Work Package WP-L3 — TDS Withholding [M, MIGRATION PR]

Branch: `feat/india-l3-tds-withholding` (cut from `main`)

Depends on: **nothing in the spine** — L3 is independent of S1–S7 and can start immediately. **Hard ordering constraint: L3 merges BEFORE WP-L4** — both WPs splice `record_payment`, and L4's plan re-captures the function via `pg_get_functiondef` AFTER L3 is merged so L4's advance-kind extension preserves L3's withholding conservation (spec §4-L4, §5, §6). Scope note: this is **income-tax TDS suffered by the lab** (customer withholds from the payment, lab holds a certificate-backed tax credit); GST-TDS (Sec 51) is a named deferral (spec §7).

---

### Task L3.1: Migration — `payments` withholding columns, `payment_withholdings` ledger, `record_payment` conservation

**Files:**
- Migration: `india_l3_payment_withholdings_and_record_payment_tds` (applied via `mcp__supabase__apply_migration`, `project_id ssmbegiyjivrcwgcqutu`)
- Modify: `src/types/database.types.ts` (regenerated, never hand-edited), `supabase/migrations.manifest.md` (append row)

**Interfaces:**
- Consumes: live `record_payment(p_payment jsonb, p_allocations jsonb) RETURNS payments` (SECURITY DEFINER, `SET search_path TO 'public'` — full body captured live 2026-07-05 and embedded below); `get_current_tenant_id()` (verified: profiles-by-`auth.uid()` with a `request.jwt.claims->>'tenant_id'` fallback — the probe recipe uses the fallback); `set_tenant_and_audit_fields()` (verified present); `_fin_base_currency(uuid)` / `_fin_currency_decimals(text)` (already called by the live body); `is_platform_admin()`, `is_staff_user()`, `has_role(text)`.
- Produces: `payments.withheld_amount numeric(19,4) NOT NULL DEFAULT 0`; `payments.withholding_certificate_ref text`; tenant table `public.payment_withholdings` (full tenant discipline); extended `record_payment` honoring `p_payment->>'withheld_amount'` + `p_payment->>'certificate_ref'` with the conservation rule **allocations = amount + withheld** and a TDS-credit ledger row in the same transaction — consumed by Task L3.2 and by WP-L4's re-splice.

- [ ] **Step 1: Probe current state (the failing SQL test)**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='payments'
       AND column_name IN ('withheld_amount','withholding_certificate_ref')) AS pay_cols,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name='payment_withholdings') AS wh_table,
  (SELECT pg_get_functiondef(p.oid) ILIKE '%withheld%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='record_payment') AS rpc_aware;
```

Expected FAIL state: `pay_cols = 0`, `wh_table = 0`, `rpc_aware = false` (verified true as of 2026-07-05).

- [ ] **Step 2: Drift guard — re-capture the live function and diff against the embedded body**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT pg_get_functiondef(p.oid) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'record_payment';
```

Save the output to `C:\Users\SPACELAB\AppData\Local\Temp\claude\C--Projects-Space-Recovery\41cb8f1d-edd0-47ce-b30b-4a7953d09a32\scratchpad\record_payment.current.sql` and diff it against Part 3 of Step 3 **with the five `[TDS-*]` blocks removed**. If identical (expected — no other in-flight WP touches `record_payment`; L4 is ordered after L3), apply Step 3 verbatim. If the body has drifted, splice the five labeled `[TDS-*]` blocks into the FRESH capture at the same structural anchors (DECLARE list; after the `v_payment_date :=` extraction; the `INSERT INTO payments` column/value lists; the post-loop conservation `IF`; immediately after that `IF`) and apply that instead — the Step 4 assertions prove the splice regardless of which path ran.

- [ ] **Step 3: Apply the migration**

`mcp__supabase__apply_migration`, name `india_l3_payment_withholdings_and_record_payment_tds`, project_id `ssmbegiyjivrcwgcqutu`:

```sql
-- ============================================================
-- WP-L3: TDS withholding (income-tax TDS suffered by the lab).
-- Part 1: additive payments columns
-- ============================================================
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS withheld_amount numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withholding_certificate_ref text;

COMMENT ON COLUMN payments.withheld_amount IS
  'Tax withheld at source by the payer (e.g. Indian TDS 194J). Cash received = amount; receivable settled = amount + withheld_amount.';

-- ============================================================
-- Part 2: TDS-credit ledger table — full tenant discipline
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_withholdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id),
  customer_id uuid REFERENCES customers_enhanced(id),
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  exchange_rate numeric(20,10) NOT NULL DEFAULT 1,
  amount_base numeric(19,4) NOT NULL,
  certificate_ref text NOT NULL,
  tax_point_date date NOT NULL,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  deleted_at timestamptz
);

ALTER TABLE payment_withholdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_withholdings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_withholdings_tenant_isolation ON payment_withholdings;
CREATE POLICY payment_withholdings_tenant_isolation ON payment_withholdings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
DROP POLICY IF EXISTS payment_withholdings_select ON payment_withholdings;
CREATE POLICY payment_withholdings_select ON payment_withholdings
  FOR SELECT TO authenticated USING (is_staff_user());
DROP POLICY IF EXISTS payment_withholdings_insert ON payment_withholdings;
CREATE POLICY payment_withholdings_insert ON payment_withholdings
  FOR INSERT TO authenticated WITH CHECK (has_role('accounts'));
DROP POLICY IF EXISTS payment_withholdings_update ON payment_withholdings;
CREATE POLICY payment_withholdings_update ON payment_withholdings
  FOR UPDATE TO authenticated USING (has_role('accounts'));
DROP POLICY IF EXISTS payment_withholdings_delete ON payment_withholdings;
CREATE POLICY payment_withholdings_delete ON payment_withholdings
  FOR DELETE TO authenticated USING (has_role('admin'));

DROP TRIGGER IF EXISTS set_payment_withholdings_tenant_and_audit ON payment_withholdings;
CREATE TRIGGER set_payment_withholdings_tenant_and_audit
  BEFORE INSERT OR UPDATE ON payment_withholdings
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();

CREATE INDEX IF NOT EXISTS idx_payment_withholdings_tenant_id
  ON payment_withholdings(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_withholdings_payment
  ON payment_withholdings(tenant_id, payment_id) WHERE deleted_at IS NULL;

-- ============================================================
-- Part 3: record_payment — captured live body (2026-07-05) +
-- five [TDS-*] blocks. Conservation: allocations = amount + withheld.
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_payment(p_payment jsonb, p_allocations jsonb)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_uid uuid; v_amount numeric; v_currency text; v_rate numeric; v_rate_source text;
  v_payment_date timestamptz; v_base_currency text; v_base_decimals integer; v_doc_decimals integer;
  v_payment payments%ROWTYPE; v_payment_number text; v_alloc jsonb; v_alloc_amount numeric;
  v_inv_id uuid; v_inv invoices%ROWTYPE; v_new_paid numeric; v_new_due numeric; v_new_status text;
  v_total_alloc numeric := 0; v_base_allocated numeric := 0;
  -- [TDS-1a] WP-L3 withholding
  v_withheld numeric; v_certificate_ref text;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'record_payment: no tenant context for caller' USING ERRCODE = 'insufficient_privilege'; END IF;
  v_uid := auth.uid();

  v_amount       := (p_payment->>'amount')::numeric;
  v_currency     := NULLIF(p_payment->>'currency','');
  IF v_currency IS NULL THEN
    -- Omitted currency books at the TENANT BASE (rate 1 by the same-currency
    -- invariant) — never a fabricated USD. _fin_base_currency RAISEs if even the
    -- base is unresolvable.
    v_currency := public._fin_base_currency(v_tenant);
  END IF;
  v_rate         := COALESCE(NULLIF(p_payment->>'exchange_rate','')::numeric, 1);
  v_rate_source  := COALESCE(NULLIF(p_payment->>'rate_source',''), 'derived');
  v_payment_date := COALESCE(NULLIF(p_payment->>'payment_date','')::timestamptz, now());

  -- [TDS-1b] withholding extraction + validation (WP-L3)
  v_withheld        := COALESCE(NULLIF(p_payment->>'withheld_amount','')::numeric, 0);
  v_certificate_ref := NULLIF(p_payment->>'certificate_ref','');
  IF v_withheld < 0 THEN
    RAISE EXCEPTION 'record_payment: withheld_amount must be >= 0 (got %)', v_withheld USING ERRCODE = 'check_violation'; END IF;
  IF v_withheld > 0 AND v_certificate_ref IS NULL THEN
    RAISE EXCEPTION 'record_payment: a withholding certificate reference is required when withheld_amount > 0' USING ERRCODE = 'check_violation'; END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'record_payment: amount must be > 0 (got %)', v_amount USING ERRCODE = 'check_violation'; END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'record_payment: at least one allocation is required; unapplied/advance payments are not yet supported (Phase 4)' USING ERRCODE = 'check_violation'; END IF;

  v_base_currency := _fin_base_currency(v_tenant);
  v_base_decimals := _fin_currency_decimals(v_base_currency);
  v_doc_decimals  := _fin_currency_decimals(v_currency);
  v_payment_number := get_next_number('payment');

  -- [TDS-3a] payments INSERT carries the withholding columns
  INSERT INTO payments (tenant_id, payment_number, payment_date, amount, currency, exchange_rate, rate_source, amount_base,
    customer_id, payment_method_id, bank_account_id, reference, status, notes, created_by,
    withheld_amount, withholding_certificate_ref)
  VALUES (v_tenant, v_payment_number, v_payment_date, v_amount, v_currency, v_rate, v_rate_source, round(v_amount * v_rate, v_base_decimals),
    NULLIF(p_payment->>'customer_id','')::uuid, NULLIF(p_payment->>'payment_method_id','')::uuid, NULLIF(p_payment->>'bank_account_id','')::uuid,
    NULLIF(p_payment->>'reference',''), COALESCE(NULLIF(p_payment->>'status',''), 'completed'), NULLIF(p_payment->>'notes',''), v_uid,
    v_withheld, v_certificate_ref)
  RETURNING * INTO v_payment;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_alloc_amount := (v_alloc->>'amount')::numeric;
    v_inv_id       := (v_alloc->>'invoice_id')::uuid;
    IF v_alloc_amount IS NULL OR v_alloc_amount <= 0 THEN RAISE EXCEPTION 'record_payment: allocation amount must be > 0 (invoice %)', v_inv_id USING ERRCODE = 'check_violation'; END IF;

    SELECT * INTO v_inv FROM invoices WHERE id = v_inv_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'record_payment: invoice % not found', v_inv_id USING ERRCODE = 'foreign_key_violation'; END IF;
    IF v_inv.tenant_id <> v_tenant THEN RAISE EXCEPTION 'record_payment: invoice % belongs to another tenant', v_inv_id USING ERRCODE = 'insufficient_privilege'; END IF;
    IF COALESCE(v_inv.currency, v_base_currency) <> v_currency THEN
      RAISE EXCEPTION 'record_payment: payment currency % does not match invoice % currency % (mixed-currency allocation is a Phase 2 feature)', v_currency, v_inv_id, v_inv.currency USING ERRCODE = 'check_violation'; END IF;
    IF v_alloc_amount > round(COALESCE(v_inv.balance_due, 0), v_doc_decimals) THEN
      RAISE EXCEPTION 'record_payment: allocation % exceeds invoice % balance due %', v_alloc_amount, v_inv_id, v_inv.balance_due USING ERRCODE = 'check_violation'; END IF;

    INSERT INTO payment_allocations (tenant_id, payment_id, invoice_id, amount, created_by)
    VALUES (v_tenant, v_payment.id, v_inv_id, v_alloc_amount, v_uid);

    v_new_paid := round(COALESCE(v_inv.amount_paid, 0) + v_alloc_amount, v_doc_decimals);
    v_new_due  := round(COALESCE(v_inv.total_amount, 0) - v_new_paid - COALESCE(v_inv.credited_amount, 0), v_doc_decimals);
    v_new_status := CASE WHEN v_new_due <= 0 THEN 'paid'
                         WHEN (v_new_paid + COALESCE(v_inv.credited_amount, 0)) > 0 THEN 'partial'
                         ELSE 'sent' END;

    UPDATE invoices SET
      amount_paid      = v_new_paid,
      balance_due      = GREATEST(0, v_new_due),
      amount_paid_base = round(v_new_paid * v_rate, v_base_decimals),
      balance_due_base = round(GREATEST(0, v_new_due) * v_rate, v_base_decimals),
      status           = v_new_status,
      paid_at          = CASE WHEN v_new_due <= 0 THEN now() ELSE paid_at END
    WHERE id = v_inv_id;

    v_total_alloc   := v_total_alloc + v_alloc_amount;
    v_base_allocated := round(v_base_allocated + round(v_alloc_amount * v_rate, v_base_decimals), v_base_decimals);
  END LOOP;

  -- [TDS-2] conservation: receivable settled = cash received + tax withheld at source
  IF round(v_total_alloc, v_doc_decimals) <> round(v_amount + v_withheld, v_doc_decimals) THEN
    RAISE EXCEPTION 'record_payment: allocations (%) must equal payment amount (%) plus withheld amount (%)', v_total_alloc, v_amount, v_withheld USING ERRCODE = 'check_violation'; END IF;

  -- [TDS-3b] TDS-credit ledger row — same transaction as the payment (atomic)
  IF v_withheld > 0 THEN
    INSERT INTO payment_withholdings
      (tenant_id, payment_id, customer_id, amount, currency, exchange_rate,
       amount_base, certificate_ref, tax_point_date, created_by)
    VALUES
      (v_tenant, v_payment.id, v_payment.customer_id, v_withheld, v_currency, v_rate,
       round(v_withheld * v_rate, v_base_decimals), v_certificate_ref, v_payment_date::date, v_uid);
  END IF;

  -- Income posts at v_total_alloc (= amount + withheld): the full receivable is
  -- settled; payments.amount remains the CASH leg for bank reconciliation.
  INSERT INTO financial_transactions (tenant_id, transaction_type, amount, currency, transaction_date,
    description, reference_type, reference_id, exchange_rate, rate_source, amount_base, status, created_by)
  VALUES (v_tenant, 'income', v_total_alloc, v_currency, v_payment_date,
    'Payment received ' || v_payment_number, 'payment', v_payment.id, v_rate, v_rate_source, v_base_allocated, 'posted', v_uid);

  RETURN v_payment;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_payment(jsonb, jsonb) FROM anon;
```

- [ ] **Step 4: Structural assertions (expected PASS)**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='payments'
       AND column_name IN ('withheld_amount','withholding_certificate_ref')) AS pay_cols,
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE relname='payment_withholdings') AS rls,
  (SELECT count(*) FROM pg_policies WHERE tablename='payment_withholdings') AS policies,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relname='payment_withholdings' AND tgname='set_payment_withholdings_tenant_and_audit') AS trig,
  (SELECT pg_get_functiondef(p.oid) ILIKE '%plus withheld amount%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='record_payment') AS rpc_aware;
```

Expected: `pay_cols = 2`, `rls = true`, `policies = 5`, `trig = 1`, `rpc_aware = true`.

- [ ] **Step 5: Behavioral probes — negative + positive, fully rolled back**

Run via `mcp__supabase__execute_sql` as ONE statement batch. It impersonates a tenant through `get_current_tenant_id()`'s verified `request.jwt.claims->>'tenant_id'` fallback, seeds a scratch invoice (status `'sent'`, no currency → tenant base; the `assert_document_tax_integrity` constraint trigger is INITIALLY DEFERRED so it never fires under ROLLBACK), and exercises all three paths:

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('tenant_id', (SELECT id FROM tenants WHERE deleted_at IS NULL LIMIT 1),
                    'role', 'authenticated')::text, true);

INSERT INTO invoices (tenant_id, invoice_number, total_amount, balance_due, amount_paid, status)
VALUES ((SELECT id FROM tenants WHERE deleted_at IS NULL LIMIT 1), 'L3-PROBE-1', 100, 100, 0, 'sent');

-- Probe A (negative): withheld without certificate must be rejected pre-insert
DO $$
BEGIN
  PERFORM record_payment(
    jsonb_build_object('amount', 98, 'withheld_amount', 2, 'payment_date', '2026-07-05', 'status', 'completed'),
    jsonb_build_array(jsonb_build_object(
      'invoice_id', (SELECT id FROM invoices WHERE invoice_number='L3-PROBE-1'), 'amount', 100)));
  RAISE EXCEPTION 'PROBE A FAILED: missing certificate was accepted';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT ILIKE '%certificate%' THEN RAISE; END IF;
  RAISE NOTICE 'probe A ok: %', SQLERRM;
END $$;

-- Probe B (negative): conservation must include withheld (alloc 98 <> 98 + 2)
DO $$
BEGIN
  PERFORM record_payment(
    jsonb_build_object('amount', 98, 'withheld_amount', 2, 'certificate_ref', 'TDS/2026/001',
                       'payment_date', '2026-07-05', 'status', 'completed'),
    jsonb_build_array(jsonb_build_object(
      'invoice_id', (SELECT id FROM invoices WHERE invoice_number='L3-PROBE-1'), 'amount', 98)));
  RAISE EXCEPTION 'PROBE B FAILED: under-allocation with withholding was accepted';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT ILIKE '%plus withheld amount%' THEN RAISE; END IF;
  RAISE NOTICE 'probe B ok: %', SQLERRM;
END $$;

-- Probe C (positive): 98 cash + 2 TDS settles the 100 receivable atomically
SELECT record_payment(
  jsonb_build_object('amount', 98, 'withheld_amount', 2, 'certificate_ref', 'TDS/2026/001',
                     'payment_date', '2026-07-05', 'status', 'completed'),
  jsonb_build_array(jsonb_build_object(
    'invoice_id', (SELECT id FROM invoices WHERE invoice_number='L3-PROBE-1'), 'amount', 100)));

SELECT
  (SELECT count(*) FROM payment_withholdings w JOIN payments p ON p.id = w.payment_id
     WHERE w.amount = 2 AND w.certificate_ref = 'TDS/2026/001'
       AND p.withheld_amount = 2 AND p.amount = 98) AS tds_rows,
  (SELECT balance_due = 0 AND status = 'paid' FROM invoices WHERE invoice_number='L3-PROBE-1') AS settled;

ROLLBACK;
```

Expected: probe A notice contains `certificate`, probe B notice contains `plus withheld amount`, probe C returns a payment row, and the final SELECT shows `tds_rows = 1`, `settled = true`. Nothing persists (ROLLBACK).

- [ ] **Step 6: Regenerate types**

Call `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) and write the output to `src/types/database.types.ts`. Then run `npm run typecheck` — expected 0 errors (the new columns/table are additive; no caller reads them yet).

- [ ] **Step 7: Manifest row + commit**

Append to the table in `supabase/migrations.manifest.md` (use the version timestamp reported by `mcp__supabase__list_migrations` for the new entry):

```
| <applied-version> | india_l3_payment_withholdings_and_record_payment_tds.sql | Additive (cols + table + fn re-sign) | WP-L3 TDS/WHT: payments.withheld_amount + withholding_certificate_ref; payment_withholdings tenant ledger (RLS+FORCE, 5 policies, audit trigger, partial indexes); record_payment conservation = amount + withheld, TDS-credit row same txn, certificate mandatory when withheld > 0. Verified rolled-back: probes A/B/C. | P4 WP-L3 |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(payments): TDS withholding — payments columns, payment_withholdings ledger, record_payment conservation (WP-L3)"
```

---

### Task L3.2: Service — `createPayment` withholding parameter

**Files:**
- Modify: `src/lib/paymentsService.ts` (`Payment` interface at `:10-28`; `createPayment` signature at `:176-179`; bank-account guard block ends `:196`; `p_payment` object at `:208-220` — all anchors verified)
- Test: `src/lib/paymentsService.test.ts` (extend — existing file hoists only `from`; header is replaced as shown)

**Interfaces:**
- Consumes: Task L3.1's RPC contract (`p_payment.withheld_amount` numeric ≥ 0, `p_payment.certificate_ref` text, conservation allocations = amount + withheld); existing `resolveRateContext(currency, date, override)` from `src/lib/currencyService.ts` (called at `paymentsService.ts:201-205`).
- Produces: `createPayment(payment, allocations?, withholding?)` where the third optional parameter is `{ amount: number; certificateRef: string } | null` — consumed by Task L3.3 (modal `onSave`) and Task L3.4 (both mutation call sites); `Payment` interface gains optional read fields `withheld_amount?: number` and `withholding_certificate_ref?: string | null`.

- [ ] **Step 1: Write the failing test**

Replace the header of `src/lib/paymentsService.test.ts` (lines 1–9: the hoisted mock currently exposes only `from`) with the two-symbol form plus collaborator stubs, keeping `makeQuery` and the existing `getPaymentStats` describe block untouched:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// getPaymentStats wraps a supabase query; createPayment wraps the record_payment
// RPC. Mock the client (env-throwing on import) exposing BOTH from and rpc, and
// stub createPayment's collaborators (rate resolution, audit, custody).
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(async (currency: string | null | undefined, _date: string, o: { rate: number } | null) =>
    ({ documentCurrency: currency ?? 'INR', rate: o?.rate ?? 1, rateSource: 'manual' })),
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn() }));
vi.mock('./chainOfCustodyService', () => ({ logInvoicePayment: vi.fn() }));

import { getPaymentStats, createPayment } from './paymentsService';
```

Then append this describe block at the end of the file:

```typescript
const basePayment = (amount: number) => ({
  payment_date: '2026-07-05',
  amount,
  currency: 'INR',
  exchange_rate: 1,
  status: 'completed' as const,
  payment_method_id: 'pm1',
  bank_account_id: 'ba1',
});

describe('createPayment withholding (WP-L3 TDS)', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: { id: 'p1', payment_number: 'PAY-1' }, error: null });
    // the post-RPC custody block is best-effort — a benign invoices chain suffices
    from.mockReset().mockReturnValue({
      select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })),
    });
  });

  it('passes withheld_amount + certificate_ref into p_payment; allocations settle amount + withheld', async () => {
    await createPayment(basePayment(98), [{ invoice_id: 'i1', amount: 100 }],
      { amount: 2, certificateRef: 'TDS/2026/001' });
    const call = rpc.mock.calls.find((c) => c[0] === 'record_payment');
    expect(call?.[1].p_payment.withheld_amount).toBe(2);
    expect(call?.[1].p_payment.certificate_ref).toBe('TDS/2026/001');
    expect(call?.[1].p_allocations).toEqual([{ invoice_id: 'i1', amount: 100 }]);
  });

  it('sends withheld_amount 0 and null certificate when no withholding is given', async () => {
    await createPayment(basePayment(100), [{ invoice_id: 'i1', amount: 100 }]);
    const call = rpc.mock.calls.find((c) => c[0] === 'record_payment');
    expect(call?.[1].p_payment.withheld_amount).toBe(0);
    expect(call?.[1].p_payment.certificate_ref).toBeNull();
  });

  it('rejects withholding without a certificate reference client-side (before any RPC)', async () => {
    await expect(
      createPayment(basePayment(98), [{ invoice_id: 'i1', amount: 100 }], { amount: 2, certificateRef: '  ' }),
    ).rejects.toThrow(/certificate/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it — expected FAIL**

`npx vitest run src/lib/paymentsService.test.ts` — the three new cases fail: `createPayment` takes 2 arguments (TS arity error surfaces as a test-file compile failure under vitest's transform, or the `withheld_amount` key is `undefined`). The existing `getPaymentStats` cases must still pass.

- [ ] **Step 3: Minimal implementation**

In `src/lib/paymentsService.ts`:

(a) Extend the `Payment` interface (after `notes?: string;` at `:24`):

```typescript
  withheld_amount?: number;
  withholding_certificate_ref?: string | null;
```

(b) Change the `createPayment` signature (`:176-179`) to:

```typescript
export const createPayment = async (
  payment: Omit<Payment, 'id' | 'payment_number' | 'created_at' | 'updated_at'>,
  allocations?: Array<{ invoice_id: string; amount: number }>,
  withholding?: { amount: number; certificateRef: string } | null
) => {
```

(c) After the bank-account guard (the `if (!payment.bank_account_id)` block ending `:196`), add:

```typescript
  // TDS/WHT: a withheld amount is a certificate-backed tax credit — never
  // accept it without the certificate reference (record_payment enforces
  // this server-side too; failing here gives an actionable form error).
  if (withholding && withholding.amount > 0 && !withholding.certificateRef.trim()) {
    throw new Error('A withholding certificate reference is required when an amount is withheld.');
  }
```

(d) Extend the `p_payment` object (after `notes: payment.notes ?? null,` at `:219`):

```typescript
      withheld_amount: withholding?.amount ?? 0,
      certificate_ref: withholding?.certificateRef?.trim() || null,
```

- [ ] **Step 4: Run — expected PASS**

`npx vitest run src/lib/paymentsService.test.ts` — all cases green (3 new + 2 existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/paymentsService.ts src/lib/paymentsService.test.ts
git commit -m "feat(payments): createPayment optional withholding arg — TDS amount + mandatory certificate ref (WP-L3)"
```

---

### Task L3.3: RecordPaymentModal — universal collapsed "Withholding (TDS/WHT)" section

**Files:**
- Modify: `src/components/financial/RecordPaymentModal.tsx` (props interface `:28-47`; state block `:78-89`; `updateTotalFromAllocations` `:224-227`; `handleTotalAmountChange` `:238-248`; `handleSubmit` `:250-287`; `handleClose` `:289-300`; derived flags `:306-316`; mismatch message `:594-610`; submit button `:652-667`; JSX insertion point between the allocation block closing at `:626` and the Notes block at `:628` — all anchors verified)
- Test: Create `src/components/financial/RecordPaymentModal.test.tsx` (jsdom project — `.test.tsx` is auto-included per `vitest.config.ts:43`)

Deliberate deviation from the old plan: `src/components/ui/CollapsibleSection.tsx` is a heavyweight card with **mandatory `icon` and `color` props** and card chrome (verified `:6-17`) — wrong scale for an inline modal group. The section is a lightweight local disclosure (button + ChevronDown), collapsed by default per AD-7, on the universal modal (both entry points get it — no country branching in `src/components/`).

**Interfaces:**
- Consumes: Task L3.2's `createPayment` third-arg shape `{ amount: number; certificateRef: string } | null`; existing modal prop `onSave(paymentData, allocations)` (verified `:31-44` — the prop is `onSave`, NOT `onSubmit`); `Input` (`../ui/Input`), `ChevronDown` (`lucide-react`).
- Produces: widened prop `onSave(paymentData, allocations, withholding?: { amount: number; certificateRef: string } | null): Promise<void>` — consumed by Task L3.4's two call sites; conservation semantics: **allocations total = payment (cash) amount + withheld amount**.

- [ ] **Step 1: Write the failing test**

Create `src/components/financial/RecordPaymentModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Passthrough Modal so the form renders inline; stub the service + client.
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('../../lib/paymentsService', () => ({
  getPaymentMethods: vi.fn(async () => [{ id: 'pm1', name: 'Bank Transfer' }]),
  getCasesWithUnpaidInvoices: vi.fn(async () => [
    { id: 'c1', case_no: 'CASE-1', title: 'RAID job', customer: { id: 'cu1', customer_name: 'Acme Labs', email: 'a@acme.test' } },
  ]),
  getUnpaidInvoicesByCase: vi.fn(async () => [
    { id: 'i1', invoice_number: 'INV-1', total_amount: 100, balance_due: 100, status: 'sent' },
  ]),
}));
const from = vi.fn(() => ({
  select: () => ({
    eq: () => ({
      order: () =>
        Promise.resolve({
          data: [{ id: 'ba1', account_name: 'Ops Account', bank_name: 'HDFC', account_type: 'current' }],
          error: null,
        }),
    }),
  }),
}));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from } }));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({
    formatCurrency: (n: number) => n.toFixed(2),
    currencyFormat: { decimalPlaces: 2, currencyCode: 'INR' },
  }),
}));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));
vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { RecordPaymentModal } from './RecordPaymentModal';

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={qc}>
      <RecordPaymentModal
        isOpen
        onClose={() => {}}
        onSave={onSave}
        preselectedCaseId="c1"
        preselectedInvoiceId="i1"
      />
    </QueryClientProvider>,
  );
  return { onSave };
}

async function fillRequiredFields() {
  await screen.findByText('INV-1'); // allocation seeded from the preselected invoice (100 due)
  await userEvent.selectOptions(screen.getByLabelText(/payment method/i), 'pm1');
  await userEvent.selectOptions(screen.getByLabelText(/deposit to/i), 'ba1');
}

beforeEach(() => vi.clearAllMocks());

describe('RecordPaymentModal withholding (WP-L3 TDS, AD-7 universal collapsed section)', () => {
  it('captures withheld amount + certificate, adjusts cash amount, and passes withholding to onSave', async () => {
    const { onSave } = renderModal();
    await fillRequiredFields();

    await userEvent.click(screen.getByRole('button', { name: /withholding/i }));
    await userEvent.type(screen.getByLabelText(/withheld amount/i), '2');
    await userEvent.type(screen.getByLabelText(/certificate reference/i), 'TDS/2026/001');

    // receivable stays fully allocated at 100; the CASH amount drops to 98
    expect(screen.getByDisplayValue('98')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /record payment/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 98, status: 'completed' }),
      [{ invoice_id: 'i1', amount: 100 }],
      { amount: 2, certificateRef: 'TDS/2026/001' },
    );
  });

  it('blocks submit while an amount is withheld without a certificate reference', async () => {
    renderModal();
    await fillRequiredFields();

    await userEvent.click(screen.getByRole('button', { name: /withholding/i }));
    await userEvent.type(screen.getByLabelText(/withheld amount/i), '2');

    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled();
    expect(screen.getByText(/required when an amount is withheld/i)).toBeInTheDocument();
  });

  it('passes null withholding when the section is untouched (regression: existing flow)', async () => {
    const { onSave } = renderModal();
    await fillRequiredFields();

    await userEvent.click(screen.getByRole('button', { name: /record payment/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100 }),
      [{ invoice_id: 'i1', amount: 100 }],
      null,
    );
  });
});
```

- [ ] **Step 2: Run it — expected FAIL**

`npx vitest run src/components/financial/RecordPaymentModal.test.tsx` — all three fail: no button matches `/withholding/i` (tests 1–2), and `onSave` is called with 2 arguments, not 3 (test 3).

- [ ] **Step 3: Implement the modal section**

In `src/components/financial/RecordPaymentModal.tsx`:

(a) Add `ChevronDown` to the `lucide-react` import list (`:15-25`).

(b) Widen the `onSave` prop type (`:31-44`) — append a third parameter after `allocations`:

```typescript
    allocations: Array<{ invoice_id: string; amount: number }>,
    withholding?: { amount: number; certificateRef: string } | null
  ) => Promise<void>;
```

(c) Add state beside the existing block (after `:86`):

```typescript
  const [showWithholding, setShowWithholding] = useState(false);
  const [withheldAmount, setWithheldAmount] = useState<number>(0);
  const [certificateRef, setCertificateRef] = useState('');
```

(d) Conservation rewiring — `record_payment` now requires **allocations = cash amount + withheld**:

Replace `updateTotalFromAllocations` (`:224-227`) with:

```typescript
  const updateTotalFromAllocations = (allocs: InvoiceAllocation[]) => {
    const total = allocs.reduce((sum, a) => sum + a.allocation_amount, 0);
    setTotalAmount(Math.max(0, roundToCurrency(total - withheldAmount)));
  };
```

(Move the `roundToCurrency` declaration at `:229-232` ABOVE `updateTotalFromAllocations` so it is in scope.)

Replace the distribution line inside `handleTotalAmountChange` (`:240-241`): `let remaining = roundToCurrency(value);` becomes `let remaining = roundToCurrency(value + withheldAmount);`.

Add a handler after `handleTotalAmountChange`:

```typescript
  // Withheld tax reduces the CASH received, not the receivable settled: keep
  // the allocations pinned to the invoice dues and re-derive the cash amount.
  const handleWithheldChange = (value: number) => {
    const w = Math.max(0, value);
    setWithheldAmount(w);
    setTotalAmount(Math.max(0, roundToCurrency(totalAllocated - w)));
  };
```

Update the derived flags (`:313-316`) — replace the `allocationMismatch` line and add `certMissing`:

```typescript
  const allocationMismatch =
    allocations.length > 0 && Math.abs(totalAllocated - (totalAmount + withheldAmount)) > 1e-6;
  const certMissing = withheldAmount > 0 && !certificateRef.trim();
```

In `handleSubmit` (`:260`), replace `if (Math.abs(totalAllocated - totalAmount) > 1e-6) return;` with:

```typescript
    if (Math.abs(totalAllocated - (totalAmount + withheldAmount)) > 1e-6 || certMissing) return;
```

and extend the `onSave` call (`:264-279`) with the third argument after the allocations array:

```typescript
        allocations.map(a => ({
          invoice_id: a.invoice_id,
          amount: a.allocation_amount,
        })),
        withheldAmount > 0 ? { amount: withheldAmount, certificateRef: certificateRef.trim() } : null
      );
```

In the mismatch message (`:599-601`), replace `totalAmount - totalAllocated > 0` and both `formatCurrency(totalAmount - totalAllocated)` / `the payment amount ${formatCurrency(totalAmount)}` computations to use `totalAmount + withheldAmount` as the settled total:

```tsx
                          {totalAmount + withheldAmount - totalAllocated > 0
                            ? `${formatCurrency(totalAmount + withheldAmount - totalAllocated)} of the payment is unallocated — it exceeds the listed invoices' due. Reduce the amount or add another invoice.`
                            : `Allocated ${formatCurrency(totalAllocated)} exceeds the payment amount plus withheld tax ${formatCurrency(totalAmount + withheldAmount)} — lower the allocations or raise the amount.`}
```

In `handleClose` (`:289-300`) add resets before `onClose()`:

```typescript
    setShowWithholding(false);
    setWithheldAmount(0);
    setCertificateRef('');
```

Add `|| certMissing` to the submit button's `disabled` expression (`:654`).

(e) Insert the collapsed section between the Invoice Allocation block (closes `:626`) and the Notes block (starts `:628`):

```tsx
        <div className="border border-slate-200 rounded-lg">
          <button
            type="button"
            onClick={() => setShowWithholding((v) => !v)}
            aria-expanded={showWithholding}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            <span>Withholding (TDS/WHT)</span>
            <ChevronDown
              aria-hidden="true"
              className={`w-4 h-4 text-slate-400 transition-transform ${showWithholding ? 'rotate-180' : ''}`}
            />
          </button>
          {showWithholding && (
            <div className="px-3 pb-3 space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="payment-withheld-amount" className="block text-sm font-medium text-slate-700 mb-1">
                    Withheld Amount
                  </label>
                  <Input
                    id="payment-withheld-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={withheldAmount || ''}
                    onChange={(e) => handleWithheldChange(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label htmlFor="payment-withholding-cert" className="block text-sm font-medium text-slate-700 mb-1">
                    Certificate Reference {withheldAmount > 0 && <span className="text-danger">*</span>}
                  </label>
                  <Input
                    id="payment-withholding-cert"
                    type="text"
                    value={certificateRef}
                    onChange={(e) => setCertificateRef(e.target.value)}
                    placeholder="e.g. TDS 194J / Form 16A ref"
                  />
                  {certMissing && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-danger" role="alert">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                      Required when an amount is withheld
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                The invoice settles for the full allocated amount; the withheld portion is recorded
                as a tax-credit receivable against the certificate.
              </p>
            </div>
          )}
        </div>
```

- [ ] **Step 4: Run — expected PASS**

`npx vitest run src/components/financial/RecordPaymentModal.test.tsx` — 3 green. (`npm run typecheck` will show errors in the two `onSave` call-site files ONLY if they destructure — they don't; the widened prop is backward-compatible, so typecheck stays at 0. Threading is therefore mandatory by review, not by compiler — Task L3.4.)

- [ ] **Step 5: Commit**

```bash
git add src/components/financial/RecordPaymentModal.tsx src/components/financial/RecordPaymentModal.test.tsx
git commit -m "feat(payments): RecordPaymentModal collapsed Withholding (TDS/WHT) section — cash+withheld conservation, mandatory certificate (WP-L3)"
```

---

### Task L3.4: Thread withholding through both `createPayment` call sites

**Files:**
- Modify: `src/pages/financial/PaymentsList.tsx` (mutation input type `:167-176`; modal `onSave` handler `:590-592` — verified)
- Modify: `src/components/cases/detail/useCaseMutations.ts` (`createPaymentMutation` input type + call `:222-231` — verified)
- Modify: `src/pages/cases/CaseDetail.tsx` (modal `onSave` handler `:1002-1008`; `PaymentShape` alias imported at `:48` — verified)

**Interfaces:**
- Consumes: Task L3.2's `createPayment(payment, allocations, withholding?)`; Task L3.3's widened `onSave(paymentData, allocations, withholding?)` prop.
- Produces: end-to-end withholding threading on BOTH payment-entry surfaces (global Payments list + case detail). Because `createPayment`'s third parameter is optional, a missed caller would NOT fail typecheck — updating both call sites is mandatory, verified by the grep step below.

- [ ] **Step 1: PaymentsList — widen the mutation and forward the third arg**

In `src/pages/financial/PaymentsList.tsx`, replace the `createPaymentMutation` `mutationFn` (`:167-176`):

```typescript
  const createPaymentMutation = useMutation({
    mutationFn: async ({
      paymentData,
      allocations,
      withholding,
    }: {
      paymentData: Omit<import('../../lib/paymentsService').Payment, 'id' | 'payment_number' | 'created_at' | 'updated_at'>;
      allocations: Array<{ invoice_id: string; amount: number }>;
      withholding?: { amount: number; certificateRef: string } | null;
    }) => {
      return createPayment(paymentData, allocations, withholding);
    },
```

and replace the modal handler (`:590-592`):

```tsx
        onSave={async (paymentData, allocations, withholding) => {
          await createPaymentMutation.mutateAsync({ paymentData, allocations, withholding: withholding ?? null });
        }}
```

- [ ] **Step 2: Case-detail path — widen `useCaseMutations` and the `CaseDetail` handler**

In `src/components/cases/detail/useCaseMutations.ts`, replace the `createPaymentMutation` `mutationFn` (`:222-231`):

```typescript
  const createPaymentMutation = useMutation({
    mutationFn: async ({
      paymentData,
      allocations,
      withholding,
    }: {
      paymentData: Omit<import('@/lib/paymentsService').Payment, 'id' | 'payment_number' | 'created_at' | 'updated_at'>;
      allocations: Array<{ invoice_id: string; amount: number }>;
      withholding?: { amount: number; certificateRef: string } | null;
    }) => {
      return createPayment(paymentData, allocations, withholding);
    },
```

In `src/pages/cases/CaseDetail.tsx`, replace the modal handler (`:1002-1008`):

```tsx
              onSave={async (paymentData, allocations, withholding) => {
                await createPaymentMutation.mutateAsync({
                  paymentData: paymentData as Omit<PaymentShape, 'id' | 'payment_number' | 'created_at' | 'updated_at'>,
                  allocations,
                  withholding: withholding ?? null,
                });
                invalidateCaseFinanceQueries();
              }}
```

- [ ] **Step 3: Verify both call sites carry the third arg (compiler can't — the param is optional)**

```bash
grep -rn "createPayment(paymentData, allocations" src/pages src/components
```

Expected output: exactly two hits — `src/pages/financial/PaymentsList.tsx` and `src/components/cases/detail/useCaseMutations.ts` — BOTH reading `createPayment(paymentData, allocations, withholding)`. Any hit still showing the two-arg form is a defect; fix before proceeding.

- [ ] **Step 4: Typecheck + full WP test paths — expected PASS**

```bash
npm run typecheck
npx vitest run src/lib/paymentsService.test.ts src/components/financial/RecordPaymentModal.test.tsx
```

Expected: 0 type errors; all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/pages/financial/PaymentsList.tsx src/components/cases/detail/useCaseMutations.ts src/pages/cases/CaseDetail.tsx
git commit -m "feat(payments): thread withholding through both createPayment call sites — Payments list + case detail (WP-L3)"
```

---

### Task L3.5: WP verification, push & PR

**Files:**
- No new files. Verifies the whole branch; PR body uses `.github/PULL_REQUEST_TEMPLATE/migration.md` (this is a MIGRATION PR).

**Interfaces:**
- Consumes: all L3.1–L3.4 commits on `feat/india-l3-tds-withholding`.
- Produces: an open PR (owner merges — do NOT merge). Its merge unblocks WP-L4's `record_payment` re-capture.

- [ ] **Step 1: Full verification run**

```bash
npm run typecheck
npx vitest run src/lib/paymentsService.test.ts src/components/financial/RecordPaymentModal.test.tsx
npm run lint
```

Expected: typecheck 0 errors (run un-piped and read the actual output — do not trust a summarized pass); 8 tests green (5 service + 3 modal); lint clean.

- [ ] **Step 2: Re-assert the live DB state one final time**

Re-run the Task L3.1 Step 4 structural SQL. Expected unchanged: `pay_cols = 2`, `rls = true`, `policies = 5`, `trig = 1`, `rpc_aware = true`.

- [ ] **Step 3: Push branch and open the PR**

```bash
git push -u origin feat/india-l3-tds-withholding
gh pr create --title "WP-L3: TDS withholding — payment_withholdings ledger, record_payment conservation, universal modal capture" --body "$(cat <<'EOF'
## WP-L3 — TDS Withholding (Phase 4 India Pack) [MIGRATION PR]

Income-tax TDS suffered by the lab: the customer withholds tax from a payment and issues a certificate; the receivable still settles in full and the withheld portion becomes a certificate-backed tax credit.

### Migration (applied live: `india_l3_payment_withholdings_and_record_payment_tds`)
- `payments.withheld_amount numeric(19,4) NOT NULL DEFAULT 0` + `payments.withholding_certificate_ref text` (additive)
- `payment_withholdings` tenant ledger — full discipline: `tenant_id NOT NULL` FK, RLS ENABLE+FORCE, RESTRICTIVE isolation + 4 operation policies, `set_tenant_and_audit_fields` trigger, partial tenant indexes
- `record_payment` extended (pg_get_functiondef capture + 5 labeled splices): withheld extraction/validation, **conservation = allocations must equal amount + withheld**, certificate mandatory when withheld > 0, TDS-credit row inserted in the same transaction; income posts at the settled total, `payments.amount` stays the cash leg
- Verified live with rolled-back probes: missing-certificate rejection, conservation rejection, positive 98+2=100 settlement (`payment_withholdings` row + invoice paid)
- `database.types.ts` regenerated; manifest row appended

### Client
- `createPayment(payment, allocations, withholding?)` — optional `{ amount, certificateRef }`, client-side certificate guard before any RPC
- RecordPaymentModal: universal collapsed "Withholding (TDS/WHT)" section (AD-7) — free-amount capture, mandatory certificate ref, cash amount auto-derived from allocations minus withheld
- Threaded through BOTH call sites: global Payments list + case detail (`useCaseMutations`/`CaseDetail`)

### Ordering
**Must merge before WP-L4** — L4 re-captures `record_payment` via pg_get_functiondef after this PR merges and layers the advance-kind extension on top of this conservation rule.

### Deferred (spec §7)
GST-TDS (Sec 51), GSTR-7/26Q, certificate reconciliation UI (`reconciled_at` column reserved).

### Verification
`npm run typecheck` = 0 · 8 vitest cases green (service + modal) · lint clean · live structural + behavioral SQL assertions recorded above

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Owner merges; do not merge or reuse this branch afterward (squash-merge policy — WP-L4 starts from a fresh branch cut from `main` after this lands).

---


## Work Package WP-L4 — Advance Vouchers + the Advance Money Leg [L, MIGRATION PR]

Branch: `feat/india-l4-advance-vouchers` (cut from `main`, after L3 is merged)
Depends on: **WP-S1a** (`master_document_requirements.field_key` CHECK already carries the credit-note ref key `'original_invoice_ref'`; `document_tax_lines`/`master_document_requirements` base CHECK sets), **WP-S1b** (IN pack rows + `receipt_voucher`/`refund_voucher` numbering scopes in `master_numbering_policies` + IN `invoice` requirement rows to inherit `pack_version_id` from), **WP-S3** (`in_gst` strategy + `computeDocumentTotals` threads `regime.tax`; kernel inclusive back-out), **WP-S4** (`in_gst_invoice` `DocumentComplianceProfile` at `src/lib/regimes/in_gst_invoice/index.ts`, key `'in_gst_invoice'`, version `'1.0.0'`), **WP-S5** (`in_fiscal_numbering` applied to the IN test tenant so `get_next_number('receipt_voucher')`/`('refund_voucher')` mint FY-scoped 16-char numbers), **WP-S6** (`register.ts` seam — L4 rebases onto S6), **WP-L3** (`record_payment` re-spliced with `payments.withheld_amount` conservation `amount + withheld = Σ allocations`; L4 re-captures and re-splices `record_payment` AFTER L3).

This WP has **three migration files in one PR**. It never hand-seeds `master_engine_capabilities` and registers no new regime plugin (the capability count stays 4 — `in_gst`/`in_gst_invoice`/`in_fiscal_numbering`/`gstr`); it widens the `TaxDocumentType` union (the one ratified additive exception, §2) and extends the existing `in_gst_invoice` profile.

---

### Task L4.1: `TaxDocumentType` additive union widening + non-breaking assignability proof

**Files:**
- Modify: `src/lib/regimes/types.ts` (line 21 — `export type TaxDocumentType = 'quote' | 'invoice' | 'credit_note' | 'stock_sale';`)
- Create: `src/lib/regimes/advanceDocTypes.test.ts`

**Interfaces:**
- Produces: `TaxDocumentType` widened to `'quote' | 'invoice' | 'credit_note' | 'stock_sale' | 'receipt_voucher' | 'refund_voucher'` — consumed by every L4 task and by `issue_tax_document`/`document_tax_lines` doc-type facts.

- [ ] **Step 1: Write the failing assignability test.** Create `src/lib/regimes/advanceDocTypes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { TaxDocumentType } from './types';

// Compile-time proof: the two voucher members exist AND the four legacy members
// are still assignable (additive widening — no consumer narrows). tsc is the real
// assertion; the runtime body only exists so vitest executes the compiled module.
describe('TaxDocumentType voucher widening is additive', () => {
  it('accepts all six members and keeps the legacy four assignable', () => {
    const all: TaxDocumentType[] = [
      'quote', 'invoice', 'credit_note', 'stock_sale', 'receipt_voucher', 'refund_voucher',
    ];
    const receipt: TaxDocumentType = 'receipt_voucher';
    const refund: TaxDocumentType = 'refund_voucher';
    const legacy: TaxDocumentType = 'invoice'; // must still narrow
    expect(all).toHaveLength(6);
    expect([receipt, refund, legacy]).toHaveLength(3);
  });
});
```
- [ ] **Step 2: Run it, expect a tsc/compile FAIL.** `npx vitest run src/lib/regimes/advanceDocTypes.test.ts` — FAILS: `Type '"receipt_voucher"' is not assignable to type 'TaxDocumentType'` (union does not yet include the voucher members).
- [ ] **Step 3: Widen the union (minimal).** In `src/lib/regimes/types.ts` line 21 replace:
```ts
export type TaxDocumentType = 'quote' | 'invoice' | 'credit_note' | 'stock_sale';
```
with:
```ts
export type TaxDocumentType =
  'quote' | 'invoice' | 'credit_note' | 'stock_sale' | 'receipt_voucher' | 'refund_voucher';
```
- [ ] **Step 4: Run test + full typecheck, expect PASS.** `npx vitest run src/lib/regimes/advanceDocTypes.test.ts` PASSES; `npm run typecheck` returns 0 (proves the widening breaks no existing consumer — the non-breaking proof required by §2).
- [ ] **Step 5: Commit.** `git add src/lib/regimes/types.ts src/lib/regimes/advanceDocTypes.test.ts && git commit -m "feat(regimes): widen TaxDocumentType with receipt_voucher/refund_voucher (additive, non-breaking)"`

---

### Task L4.2: Migration — CHECK widenings, `payments.payment_kind`, `advance_vouchers` document table, IN voucher requirement rows

**Files:**
- Migration (via `mcp__supabase__apply_migration`, project_id `ssmbegiyjivrcwgcqutu`): `india_advance_voucher_schema`
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `supabase/migrations.manifest.md`
- Create: `supabase/migrations/20260706_india_advance_voucher_schema.sql` (mirror copy for the repo tree, filename echoing the applied version)

**Interfaces:**
- Consumes: `master_document_requirements_doc_type_check` = `('quote','invoice','credit_note','stock_sale')`, `document_tax_lines_document_type_check` = same set, `master_document_requirements_field_key_check` = base 7 keys + WP-S1a's `'original_invoice_ref'` (verify via `pg_get_constraintdef` at implementation time and re-list the captured set — see Step 2); `get_current_tenant_id()`, `is_platform_admin()`, `set_tenant_and_audit_fields()` (repo-wide tenant trigger).
- Produces: `payments.payment_kind text NOT NULL DEFAULT 'standard'` (CHECK `('standard','advance')`); table `advance_vouchers` (document entity for receipt/refund vouchers); widened doc-type CHECKs admitting `'receipt_voucher'`/`'refund_voucher'`; `field_key` CHECK admitting `'original_receipt_voucher_ref'`; IN `receipt_voucher` + `refund_voucher` requirement rows.

- [ ] **Step 1: Write the failing schema probe.** Run via `mcp__supabase__execute_sql` (expected to prove the gap):
```sql
SELECT
  (SELECT bool_or(pg_get_constraintdef(oid) LIKE '%receipt_voucher%')
     FROM pg_constraint WHERE conname='document_tax_lines_document_type_check') AS dtl_ok,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='payments' AND column_name='payment_kind') AS kind_col,
  to_regclass('public.advance_vouchers') IS NOT NULL AS voucher_table;
```
Expected FAIL: `dtl_ok=false/null`, `kind_col=false`, `voucher_table=false`.
- [ ] **Step 2: Capture the live `field_key` CHECK before recreating it.** `mcp__supabase__execute_sql`: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='master_document_requirements_field_key_check';` — confirm it lists the base 7 keys plus WP-S1a's `'original_invoice_ref'`. The recreate in Step 3 MUST re-list every captured value verbatim plus the new `'original_receipt_voucher_ref'` (a CHECK is replaced wholesale — dropping a value in current use would fail the `ADD CONSTRAINT`).
- [ ] **Step 3: Apply the migration.** `mcp__supabase__apply_migration` name `india_advance_voucher_schema`:
```sql
-- ── (a) Widen the two document-type CHECKs to admit voucher documents ──────────
ALTER TABLE document_tax_lines DROP CONSTRAINT document_tax_lines_document_type_check;
ALTER TABLE document_tax_lines ADD CONSTRAINT document_tax_lines_document_type_check
  CHECK (document_type = ANY (ARRAY['quote','invoice','credit_note','stock_sale','receipt_voucher','refund_voucher']));

ALTER TABLE master_document_requirements DROP CONSTRAINT master_document_requirements_doc_type_check;
ALTER TABLE master_document_requirements ADD CONSTRAINT master_document_requirements_doc_type_check
  CHECK (doc_type = ANY (ARRAY['quote','invoice','credit_note','stock_sale','receipt_voucher','refund_voucher']));

-- Rule 51(f): refund voucher references the original receipt voucher. Re-list the
-- captured live set (base 7 + WP-S1a 'original_invoice_ref') + the new key.
ALTER TABLE master_document_requirements DROP CONSTRAINT master_document_requirements_field_key_check;
ALTER TABLE master_document_requirements ADD CONSTRAINT master_document_requirements_field_key_check
  CHECK (field_key = ANY (ARRAY[
    'buyer_tax_number','buyer_address','place_of_supply_subdivision_id','supply_date',
    'seller_tax_number','line.item_code','line.unit_code',
    'original_invoice_ref','original_receipt_voucher_ref']));

-- ── (b) Advance money leg on payments (held unallocated) ───────────────────────
ALTER TABLE payments ADD COLUMN payment_kind text NOT NULL DEFAULT 'standard'
  CHECK (payment_kind IN ('standard','advance'));
CREATE INDEX idx_payments_advance ON payments(tenant_id)
  WHERE payment_kind = 'advance' AND deleted_at IS NULL;

-- ── (c) advance_vouchers: first-class document entity (receipt + refund) ───────
CREATE TABLE advance_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id),
  case_id uuid REFERENCES cases(id),
  customer_id uuid REFERENCES customers_enhanced(id),
  company_id uuid REFERENCES companies(id),
  voucher_type text NOT NULL CHECK (voucher_type IN ('receipt','refund')),
  voucher_number text,
  voucher_date timestamptz NOT NULL DEFAULT now(),
  original_voucher_id uuid REFERENCES advance_vouchers(id),   -- refund → its receipt voucher
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued')),
  currency text NOT NULL,
  exchange_rate numeric NOT NULL DEFAULT 1,
  taxable_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  place_of_supply_subdivision_id uuid REFERENCES geo_subdivisions(id),
  buyer_tax_number text,
  buyer_address jsonb,
  seller_tax_number text,
  notations jsonb NOT NULL DEFAULT '[]'::jsonb,
  regime_key text,
  pack_version_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz DEFAULT NULL,
  -- Rule 51: a refund voucher MUST carry the original receipt voucher.
  CONSTRAINT advance_vouchers_refund_ref_ck
    CHECK (voucher_type <> 'refund' OR original_voucher_id IS NOT NULL)
);

ALTER TABLE advance_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_vouchers FORCE ROW LEVEL SECURITY;
CREATE POLICY advance_vouchers_tenant_isolation ON advance_vouchers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
CREATE POLICY advance_vouchers_select ON advance_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY advance_vouchers_insert ON advance_vouchers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY advance_vouchers_update ON advance_vouchers FOR UPDATE TO authenticated USING (true);
CREATE POLICY advance_vouchers_delete ON advance_vouchers FOR DELETE TO authenticated USING (has_role('admin'));
CREATE INDEX idx_advance_vouchers_tenant_id ON advance_vouchers(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_advance_vouchers_payment ON advance_vouchers(payment_id) WHERE deleted_at IS NULL;
CREATE TRIGGER set_advance_vouchers_tenant_and_audit
  BEFORE INSERT OR UPDATE ON advance_vouchers
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();

-- Statutory immutability: once issued, only soft-delete may touch a voucher.
CREATE OR REPLACE FUNCTION prevent_issued_advance_voucher_mutation()
 RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.status = 'issued'
     AND NOT (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'advance_vouchers: issued voucher % is immutable', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $fn$;
CREATE TRIGGER trg_prevent_issued_advance_voucher_mutation
  BEFORE UPDATE ON advance_vouchers FOR EACH ROW
  EXECUTE FUNCTION prevent_issued_advance_voucher_mutation();

-- ── (d) IN voucher requirement rows (Rule 50 receipt / Rule 51 refund) ─────────
-- pack_version_id inherited from the IN invoice rows S1b seeded (the gate ignores
-- pack_version_id — evaluate_document_requirements filters country/doc_type/effective_from).
INSERT INTO master_document_requirements (country_id, doc_type, field_key, condition, level, message_i18n, pack_version_id, sort_order)
SELECT g.id, v.doc_type, v.field_key, v.condition::jsonb, v.level, v.message::jsonb,
       (SELECT r.pack_version_id FROM master_document_requirements r
        WHERE r.country_id = g.id AND r.doc_type='invoice' AND r.deleted_at IS NULL LIMIT 1),
       v.sort_order
FROM geo_countries g
CROSS JOIN (VALUES
  ('receipt_voucher','supply_date', NULL, 'block',
     '{"en":"Advance receipt date is required (Rule 50)."}', 10),
  ('receipt_voucher','place_of_supply_subdivision_id', NULL, 'warn',
     '{"en":"Place of supply should be recorded on the receipt voucher (Rule 50)."}', 20),
  ('refund_voucher','original_receipt_voucher_ref', NULL, 'block',
     '{"en":"Refund voucher must reference the original receipt voucher number and date (Rule 51)."}', 10)
) AS v(doc_type, field_key, condition, level, message, sort_order)
WHERE g.code = 'IN';

-- Seed assertion — migration fails if the three IN voucher rows did not land.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM master_document_requirements r
  JOIN geo_countries g ON g.id = r.country_id AND g.code='IN'
  WHERE r.doc_type IN ('receipt_voucher','refund_voucher') AND r.deleted_at IS NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 IN voucher requirement rows, got %', n; END IF;
END $$;
```
- [ ] **Step 4: Re-run the probe from Step 1, expect PASS.** `dtl_ok=true`, `kind_col=true`, `voucher_table=true`.
- [ ] **Step 5: Regenerate types.** `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) → overwrite `src/types/database.types.ts`. Confirm `advance_vouchers` Row/Insert and `payments.payment_kind` appear.
- [ ] **Step 6: Append the manifest row.** Add to `supabase/migrations.manifest.md`:
```
| 20260706_india_advance_voucher_schema | india_advance_voucher_schema.sql | Additive | Voucher doc-type CHECK widening (document_tax_lines + master_document_requirements → receipt_voucher/refund_voucher); field_key CHECK + 'original_receipt_voucher_ref' (Rule 51); payments.payment_kind ('standard'|'advance') + partial index; advance_vouchers document table (full tenant discipline + issued-immutability trigger); 3 IN voucher requirement rows (Rule 50 receipt / Rule 51 refund) w/ post-insert seed assertion. Verified live: dtl_ok=t, kind_col=t, voucher_table=t, IN voucher rows=3 | P4 L4 |
```
- [ ] **Step 7: Commit.** `git add supabase/migrations/20260706_india_advance_voucher_schema.sql src/types/database.types.ts supabase/migrations.manifest.md && git commit -m "feat(db): advance-voucher schema — CHECK widenings, payments.payment_kind, advance_vouchers, IN voucher requirements"`

---

### Task L4.3: Migration — re-splice `record_payment` with the `advance` payment kind (AFTER L3)

**Files:**
- Migration: `record_payment_advance_kind`
- Modify: `src/types/database.types.ts` (regenerated — `record_payment` arg shape unchanged, but regen to keep drift-check clean)
- Modify: `supabase/migrations.manifest.md`
- Create: `supabase/migrations/20260706_record_payment_advance_kind.sql`

**Interfaces:**
- Consumes: **WP-L3's** live `record_payment(p_payment jsonb, p_allocations jsonb)` (its standard path enforces `amount + p_payment->>'withheld_amount' = Σ allocations` and posts the TDS-credit row). The advance branch is orthogonal: it early-RETURNs before the standard allocation loop, so L3's withholding conservation is preserved untouched. `_fin_base_currency`, `_fin_currency_decimals`, `get_next_number` (all live).
- Produces: `record_payment` accepts `p_payment->>'kind' = 'advance'` with an EMPTY `p_allocations` — inserts `payments.payment_kind='advance'`, posts the income ledger for the full amount, and RETURNs the payment held unallocated.

- [ ] **Step 1: Capture L3's live definition.** `mcp__supabase__execute_sql`: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='record_payment';` — this captured body is the base the re-splice re-applies (it already contains L3's `withheld_amount` handling). The graft below inserts a self-contained advance block; nothing in L3's standard path is edited.
- [ ] **Step 2: Write the failing behavioral probe (advance rejected today).** `mcp__supabase__execute_sql` (rolled back), impersonating the IN test tenant context is not available in a raw probe, so assert on the current guard text instead:
```sql
SELECT pg_get_functiondef(oid) NOT LIKE '%payment_kind%'
       AND pg_get_functiondef(oid) LIKE '%advance payments are not yet supported%' AS advance_still_blocked
FROM pg_proc WHERE proname='record_payment';
```
Expected: `advance_still_blocked=true` (the Phase-4 rejection is still in place; no advance branch).
- [ ] **Step 3: Apply the re-splice.** `mcp__supabase__apply_migration` name `record_payment_advance_kind` = the Step-1 captured body re-applied as `CREATE OR REPLACE FUNCTION public.record_payment(p_payment jsonb, p_allocations jsonb) ...` with **one inserted block**, placed immediately after the `IF v_amount IS NULL OR v_amount <= 0 THEN ... END IF;` guard and before the `IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' ...` allocation-required guard:
```sql
  -- ── Advance money leg (Phase 4): an advance is HELD UNALLOCATED (no invoice
  -- exists yet at intake/diagnosis). Ledger stays balanced — the full amount is
  -- posted as income; invoice-time allocation happens later via
  -- apply_advance_to_invoice. Early-return keeps L3's standard allocation +
  -- withholding conservation path completely unchanged.
  IF COALESCE(NULLIF(p_payment->>'kind',''), 'standard') = 'advance' THEN
    IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array'
       AND jsonb_array_length(p_allocations) > 0 THEN
      RAISE EXCEPTION 'record_payment: an advance payment must be recorded unallocated (apply it to an invoice later)'
        USING ERRCODE = 'check_violation';
    END IF;

    v_base_currency := _fin_base_currency(v_tenant);
    v_base_decimals := _fin_currency_decimals(v_base_currency);
    v_payment_number := get_next_number('payment');

    INSERT INTO payments (
      tenant_id, payment_number, payment_date, amount, currency,
      exchange_rate, rate_source, amount_base, payment_kind,
      customer_id, payment_method_id, bank_account_id, case_id,
      reference, status, notes, created_by
    ) VALUES (
      v_tenant, v_payment_number, v_payment_date, v_amount, v_currency,
      v_rate, v_rate_source, round(v_amount * v_rate, v_base_decimals), 'advance',
      NULLIF(p_payment->>'customer_id','')::uuid,
      NULLIF(p_payment->>'payment_method_id','')::uuid,
      NULLIF(p_payment->>'bank_account_id','')::uuid,
      NULLIF(p_payment->>'case_id','')::uuid,
      NULLIF(p_payment->>'reference',''),
      COALESCE(NULLIF(p_payment->>'status',''), 'completed'),
      NULLIF(p_payment->>'notes',''), v_uid
    ) RETURNING * INTO v_payment;

    INSERT INTO financial_transactions (
      tenant_id, transaction_type, amount, currency, transaction_date,
      description, reference_type, reference_id, exchange_rate, rate_source,
      amount_base, status, created_by
    ) VALUES (
      v_tenant, 'income', v_amount, v_currency, v_payment_date,
      'Advance received ' || v_payment_number, 'payment', v_payment.id, v_rate, v_rate_source,
      round(v_amount * v_rate, v_base_decimals), 'posted', v_uid
    );

    RETURN v_payment;
  END IF;
```
(The `REVOKE`/`GRANT` footer from the captured body is re-applied verbatim.)
- [ ] **Step 4: Positive+negative rolled-back probe.** `mcp__supabase__execute_sql`:
```sql
BEGIN;
SELECT pg_get_functiondef(oid) LIKE '%payment_kind%'
       AND pg_get_functiondef(oid) LIKE '%must be recorded unallocated%' AS advance_branch_present
FROM pg_proc WHERE proname='record_payment';
ROLLBACK;
```
Expected `advance_branch_present=true`. (End-to-end money-flow assertions run live on the IN tenant in WP-GA.)
- [ ] **Step 5: Regenerate types + append manifest row.** `mcp__supabase__generate_typescript_types` → `src/types/database.types.ts`. Manifest:
```
| 20260706_record_payment_advance_kind | record_payment_advance_kind.sql | Additive (fn re-sign) | record_payment gains an 'advance' kind (p_payment->>'kind'='advance'): held unallocated, full-amount income posting, RETURN before the standard allocation/withholding path — re-spliced onto L3's captured body (withholding conservation preserved). Verified: advance_branch_present=true | P4 L4 |
```
- [ ] **Step 6: Commit.** `git add supabase/migrations/20260706_record_payment_advance_kind.sql src/types/database.types.ts supabase/migrations.manifest.md && git commit -m "feat(db): record_payment 'advance' kind held unallocated (re-spliced after L3)"`

---

### Task L4.4: Migration — `_issue_advance_voucher` + `issue_tax_document` voucher delegation + `apply_advance_to_invoice` (net-of-advance)

**Files:**
- Migration: `advance_voucher_issue_and_apply`
- Modify: `src/types/database.types.ts` (regenerated — new RPCs)
- Modify: `supabase/migrations.manifest.md`
- Create: `supabase/migrations/20260706_advance_voucher_issue_and_apply.sql`

**Interfaces:**
- Consumes: `advance_vouchers` (L4.2); `document_tax_lines` rollups persisted client-side against `document_type='receipt_voucher'|'refund_voucher'`, `document_id = advance_voucher.id` (via L4.5); `evaluate_document_requirements`, `get_next_number('receipt_voucher')`/`('refund_voucher')` (S1b/S5 scopes); `log_chain_of_custody`; `vat_records` insert shape (per live `issue_tax_document`).
- Produces: `issue_tax_document(p_doc_type,p_doc_id,p_dry_run)` accepts the two voucher types (delegating to `_issue_advance_voucher(text,uuid,boolean)`); `apply_advance_to_invoice(p_payment_id uuid, p_invoice_id uuid, p_amount numeric)` → `jsonb` (posts the net-of-advance adjustment + conservation assertion).

- [ ] **Step 1: Write the failing probe.** `mcp__supabase__execute_sql`:
```sql
SELECT to_regprocedure('public._issue_advance_voucher(text,uuid,boolean)') IS NOT NULL AS helper,
       to_regprocedure('public.apply_advance_to_invoice(uuid,uuid,numeric)') IS NOT NULL AS applier,
       pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname='issue_tax_document')) LIKE '%receipt_voucher%' AS delegates;
```
Expected: all three `false`/`null`.
- [ ] **Step 2: Apply the migration.** `mcp__supabase__apply_migration` name `advance_voucher_issue_and_apply`:
```sql
SET check_function_bodies = off;

-- ── (1) Voucher issuer: GST at receipt (receipt) / negative at refund (refund) ──
-- Operates on advance_vouchers (p_doc_id = voucher id). document_tax_lines for the
-- voucher are computed + persisted client-side (L4.5) exactly like an invoice, so
-- the Σ-rollup evidence is present here. Rule 50 proviso (18%, IGST when
-- indeterminable) is applied when the client built the totals input (L4.6).
CREATE OR REPLACE FUNCTION public._issue_advance_voucher(
  p_doc_type text, p_doc_id uuid, p_dry_run boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_tenant uuid; v_v advance_vouchers%ROWTYPE; v_tz text; v_dp int;
  v_country_id uuid; v_pack_version int; v_facts jsonb; v_req_failures jsonb := '[]'::jsonb;
  v_has_block boolean := false; v_sign numeric; v_period text; v_tax_point date;
  v_number text; v_scope text; v_r record; v_vat_ids uuid[] := '{}'; v_vat_id uuid;
  v_orig advance_vouchers%ROWTYPE; v_rollup_tax numeric;
BEGIN
  v_tenant := get_current_tenant_id();
  SELECT * INTO v_v FROM advance_vouchers WHERE id = p_doc_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '_issue_advance_voucher: voucher % not found', p_doc_id; END IF;
  IF v_v.tenant_id <> v_tenant AND NOT is_platform_admin() THEN
    RAISE EXCEPTION '_issue_advance_voucher: voucher % belongs to another tenant', p_doc_id; END IF;
  IF NOT p_dry_run AND v_v.status <> 'draft' THEN
    RAISE EXCEPTION '_issue_advance_voucher: voucher % already issued', p_doc_id; END IF;

  v_sign  := CASE WHEN v_v.voucher_type = 'refund' THEN -1 ELSE 1 END;
  v_scope := CASE WHEN v_v.voucher_type = 'refund' THEN 'refund_voucher' ELSE 'receipt_voucher' END;

  SELECT timezone INTO v_tz FROM tenants WHERE id = v_v.tenant_id;
  SELECT decimal_places INTO v_dp FROM master_currency_codes WHERE code = v_v.currency;
  IF v_dp IS NULL THEN RAISE EXCEPTION '_issue_advance_voucher: unknown currency "%"', v_v.currency; END IF;
  v_tax_point := (v_v.voucher_date AT TIME ZONE COALESCE(v_tz,'UTC'))::date;

  SELECT t.country_id, t.country_pack_version INTO v_country_id, v_pack_version
  FROM tenants t WHERE t.id = v_v.tenant_id;

  -- Rule 51: refund voucher must reference its receipt voucher (block gate).
  IF v_pack_version IS NOT NULL AND v_country_id IS NOT NULL THEN
    IF v_v.voucher_type = 'refund' THEN
      SELECT * INTO v_orig FROM advance_vouchers
      WHERE id = v_v.original_voucher_id AND deleted_at IS NULL;
    END IF;
    v_facts := jsonb_strip_nulls(jsonb_build_object(
      'supply_date', to_char(v_tax_point,'YYYY-MM-DD'),
      'place_of_supply_subdivision_id', v_v.place_of_supply_subdivision_id,
      'original_receipt_voucher_ref',
        CASE WHEN v_v.voucher_type='refund' THEN COALESCE(v_orig.voucher_number, NULL) END
    ));
    v_req_failures := evaluate_document_requirements(p_doc_type, v_country_id, v_tax_point, v_facts);
    SELECT COALESCE(bool_or(f->>'level'='block'), false) INTO v_has_block
    FROM jsonb_array_elements(v_req_failures) f;
    IF NOT p_dry_run AND v_has_block THEN
      RAISE EXCEPTION 'REQUIREMENTS_NOT_MET: %', v_req_failures::text
        USING ERRCODE='P0403', HINT='advance-voucher requirement gate';
    END IF;
  END IF;

  SELECT COALESCE(sum(tax_amount),0) INTO v_rollup_tax FROM document_tax_lines
  WHERE document_type = p_doc_type AND document_id = p_doc_id
    AND line_item_id IS NULL AND deleted_at IS NULL;

  IF p_dry_run THEN
    RETURN jsonb_build_object('ok', true, 'document_number', NULL,
      'totals', jsonb_build_object('taxTotal', v_sign * v_rollup_tax),
      'requirement_failures', v_req_failures, 'trace', NULL);
  END IF;

  v_number := get_next_number(v_scope);
  v_period := to_char(v_tax_point,'YYYY-MM');

  -- vat_records: receipt = positive advance tax; refund = negative reversal.
  FOR v_r IN SELECT * FROM document_tax_lines
    WHERE document_type = p_doc_type AND document_id = p_doc_id
      AND line_item_id IS NULL AND deleted_at IS NULL AND tax_amount <> 0
    ORDER BY sequence
  LOOP
    INSERT INTO vat_records (
      tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
      currency, exchange_rate, vat_amount_base, taxable_amount_base,
      component_code, jurisdiction_ref, tax_treatment, regime_key,
      tax_point_date, source_document_type, source_document_id)
    VALUES (
      v_v.tenant_id,
      CASE WHEN v_v.voucher_type='refund' THEN 'advance_refund' ELSE 'advance' END,
      p_doc_id, v_sign * v_r.tax_amount, v_r.rate, v_period,
      v_r.currency, v_r.exchange_rate, v_sign * v_r.tax_amount_base,
      round(v_sign * v_r.taxable_base * v_r.exchange_rate, v_dp),
      v_r.component_code, v_r.jurisdiction_ref, v_r.tax_treatment, v_r.regime_key,
      v_tax_point, p_doc_type, p_doc_id)
    RETURNING id INTO v_vat_id;
    v_vat_ids := v_vat_ids || v_vat_id;
  END LOOP;

  UPDATE advance_vouchers
  SET voucher_number = v_number, status = 'issued',
      tax_amount = v_sign * v_rollup_tax
  WHERE id = p_doc_id;

  IF v_v.case_id IS NOT NULL THEN
    PERFORM log_chain_of_custody(
      v_v.case_id, NULL, 'financial',
      CASE WHEN v_v.voucher_type='refund' THEN 'REFUND_VOUCHER_ISSUED' ELSE 'RECEIPT_VOUCHER_ISSUED' END,
      format('%s voucher %s (%s %s)', v_v.voucher_type, v_number, v_v.currency, v_v.total_amount),
      NULL, 'in_custody',
      jsonb_build_object('advance_voucher_id', p_doc_id, 'voucher_number', v_number,
                         'payment_id', v_v.payment_id, 'tax_amount', v_sign * v_rollup_tax));
  END IF;

  RETURN jsonb_build_object('ok', true, 'document_number', v_number, 'issued_at', now(),
    'vat_record_ids', to_jsonb(v_vat_ids), 'trace', NULL);
END; $fn$;

REVOKE ALL ON FUNCTION public._issue_advance_voucher(text,uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._issue_advance_voucher(text,uuid,boolean) TO authenticated;

-- ── (2) issue_tax_document delegates the two voucher types ─────────────────────
-- Re-apply the live captured body with TWO edits: widen the opening guard and add
-- an early delegation. The rest of the 200-line body is unchanged.
--   EDIT A — the opening guard line:
--     IF p_doc_type NOT IN ('quote','invoice','credit_note','stock_sale') THEN
--   becomes:
--     IF p_doc_type NOT IN ('quote','invoice','credit_note','stock_sale','receipt_voucher','refund_voucher') THEN
--   EDIT B — insert, as the first statement after BEGIN (before that guard):
--     IF p_doc_type IN ('receipt_voucher','refund_voucher') THEN
--       RETURN _issue_advance_voucher(p_doc_type, p_doc_id, p_dry_run);
--     END IF;
-- (Apply via CREATE OR REPLACE of the full captured definition with these two
--  substitutions — capture with pg_get_functiondef in the implementing session.)

-- ── (3) Invoice-time allocation + net-of-advance adjustment ────────────────────
CREATE OR REPLACE FUNCTION public.apply_advance_to_invoice(
  p_payment_id uuid, p_invoice_id uuid, p_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_tenant uuid; v_uid uuid; v_pay payments%ROWTYPE; v_inv invoices%ROWTYPE;
  v_base text; v_bdec int; v_ddec int; v_applied numeric; v_free numeric;
  v_new_paid numeric; v_new_due numeric; v_new_status text;
  v_voucher advance_vouchers%ROWTYPE; v_adv_tax numeric := 0; v_adj_tax numeric := 0;
  v_prior_adj numeric := 0; v_period text; v_tz text; v_tax_point date; v_r record;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'apply_advance_to_invoice: no tenant' USING ERRCODE='insufficient_privilege'; END IF;
  v_uid := auth.uid();
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'apply_advance_to_invoice: amount must be > 0'; END IF;

  SELECT * INTO v_pay FROM payments WHERE id = p_payment_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'apply_advance_to_invoice: payment % not found', p_payment_id USING ERRCODE='foreign_key_violation'; END IF;
  IF v_pay.tenant_id <> v_tenant THEN RAISE EXCEPTION 'apply_advance_to_invoice: cross-tenant payment' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_pay.payment_kind <> 'advance' THEN RAISE EXCEPTION 'apply_advance_to_invoice: payment % is not an advance', p_payment_id USING ERRCODE='check_violation'; END IF;

  v_base := _fin_base_currency(v_tenant); v_bdec := _fin_currency_decimals(v_base);
  v_ddec := _fin_currency_decimals(COALESCE(v_pay.currency, v_base));

  -- Unapplied advance balance = amount − Σ prior allocations of this payment.
  SELECT COALESCE(sum(amount),0) INTO v_applied FROM payment_allocations
  WHERE payment_id = p_payment_id AND deleted_at IS NULL;
  v_free := round(v_pay.amount - v_applied, v_ddec);
  IF p_amount > v_free THEN
    RAISE EXCEPTION 'apply_advance_to_invoice: amount % exceeds unapplied advance balance %', p_amount, v_free USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'apply_advance_to_invoice: invoice % not found', p_invoice_id USING ERRCODE='foreign_key_violation'; END IF;
  IF v_inv.tenant_id <> v_tenant THEN RAISE EXCEPTION 'apply_advance_to_invoice: cross-tenant invoice' USING ERRCODE='insufficient_privilege'; END IF;
  IF COALESCE(v_inv.currency, v_base) <> COALESCE(v_pay.currency, v_base) THEN
    RAISE EXCEPTION 'apply_advance_to_invoice: currency mismatch (advance % vs invoice %)', v_pay.currency, v_inv.currency USING ERRCODE='check_violation'; END IF;
  IF p_amount > round(COALESCE(v_inv.balance_due,0), v_ddec) THEN
    RAISE EXCEPTION 'apply_advance_to_invoice: amount % exceeds invoice balance %', p_amount, v_inv.balance_due USING ERRCODE='check_violation'; END IF;

  -- Allocate (mirrors record_payment's per-invoice balance recompute).
  INSERT INTO payment_allocations (tenant_id, payment_id, invoice_id, amount, created_by)
  VALUES (v_tenant, p_payment_id, p_invoice_id, p_amount, v_uid);
  v_new_paid := round(COALESCE(v_inv.amount_paid,0) + p_amount, v_ddec);
  v_new_due  := round(COALESCE(v_inv.total_amount,0) - v_new_paid, v_ddec);
  v_new_status := CASE WHEN v_new_due <= 0 THEN 'paid' WHEN v_new_paid > 0 THEN 'partial' ELSE 'sent' END;
  UPDATE invoices SET amount_paid=v_new_paid, balance_due=GREATEST(0,v_new_due),
    amount_paid_base=round(v_new_paid*COALESCE(v_inv.exchange_rate,1), v_bdec),
    balance_due_base=round(GREATEST(0,v_new_due)*COALESCE(v_inv.exchange_rate,1), v_bdec),
    status=v_new_status, paid_at=CASE WHEN v_new_due<=0 THEN now() ELSE paid_at END
  WHERE id = p_invoice_id;

  -- ── Net-of-advance GST (§3): the advance tax already declared on the ISSUED
  -- receipt voucher is offset in the INVOICE period, pro-rated to the amount
  -- applied. Conservation: voucher tax + (invoice full tax − Σ adjustments) =
  -- total supply tax, and Σ adjustments never exceed the voucher's declared tax.
  SELECT * INTO v_voucher FROM advance_vouchers
  WHERE payment_id = p_payment_id AND voucher_type='receipt' AND status='issued' AND deleted_at IS NULL
  ORDER BY voucher_date LIMIT 1;

  IF FOUND THEN
    v_adv_tax := v_voucher.tax_amount;
    SELECT timezone INTO v_tz FROM tenants WHERE id = v_tenant;
    v_tax_point := COALESCE(v_inv.supply_date, (now() AT TIME ZONE COALESCE(v_tz,'UTC'))::date);
    v_period := to_char(v_tax_point,'YYYY-MM');

    -- adjustment pro-rated by the fraction of the advance applied here.
    -- Post per-head negative rows mirroring the voucher's rollup components.
    FOR v_r IN
      SELECT component_code, jurisdiction_ref, rate, tax_treatment, regime_key, currency, exchange_rate, tax_amount, taxable_base
      FROM document_tax_lines
      WHERE document_type='receipt_voucher' AND document_id=v_voucher.id
        AND line_item_id IS NULL AND deleted_at IS NULL AND tax_amount <> 0
      ORDER BY sequence
    LOOP
      INSERT INTO vat_records (
        tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
        currency, exchange_rate, vat_amount_base, taxable_amount_base,
        component_code, jurisdiction_ref, tax_treatment, regime_key,
        tax_point_date, source_document_type, source_document_id)
      VALUES (
        v_tenant, 'advance_adjustment', p_invoice_id,
        -round(v_r.tax_amount * (p_amount / v_pay.amount), v_ddec), v_r.rate, v_period,
        v_r.currency, v_r.exchange_rate,
        -round(v_r.tax_amount * (p_amount / v_pay.amount) * v_r.exchange_rate, v_bdec),
        -round(v_r.taxable_base * (p_amount / v_pay.amount) * v_r.exchange_rate, v_ddec),
        v_r.component_code, v_r.jurisdiction_ref, v_r.tax_treatment, v_r.regime_key,
        v_tax_point, 'invoice', p_invoice_id);
      v_adj_tax := v_adj_tax + round(v_r.tax_amount * (p_amount / v_pay.amount), v_ddec);
    END LOOP;

    -- Conservation assertion: cumulative advance-adjustment for this voucher must
    -- never exceed the tax it declared at receipt (no over-netting = no under-report).
    SELECT COALESCE(sum(-vat_amount),0) INTO v_prior_adj FROM vat_records
    WHERE record_type='advance_adjustment' AND deleted_at IS NULL
      AND source_document_id IN (SELECT id FROM invoices WHERE id = p_invoice_id)
      AND record_id = p_invoice_id;
    IF round(v_prior_adj, v_ddec) > round(v_adv_tax + 0.5*power(10::numeric,-v_ddec), v_ddec) THEN
      RAISE EXCEPTION 'apply_advance_to_invoice: advance adjustment % exceeds declared voucher tax %', v_prior_adj, v_adv_tax USING ERRCODE='check_violation';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'allocated', p_amount,
    'advance_adjustment_tax', v_adj_tax, 'invoice_status', v_new_status);
END; $fn$;

REVOKE ALL ON FUNCTION public.apply_advance_to_invoice(uuid,uuid,numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_advance_to_invoice(uuid,uuid,numeric) TO authenticated;
```
- [ ] **Step 3: Re-run the Step-1 probe, expect PASS** (`helper=true`, `applier=true`, `delegates=true`).
- [ ] **Step 4: Regenerate types + append manifest row.** `mcp__supabase__generate_typescript_types` → `src/types/database.types.ts`. Manifest:
```
| 20260706_advance_voucher_issue_and_apply | advance_voucher_issue_and_apply.sql | Additive (fn) | _issue_advance_voucher (GST at receipt; negative reversal at refund; Rule 51 receipt-ref gate; custody event); issue_tax_document delegates receipt_voucher/refund_voucher (2-edit re-splice of captured body); apply_advance_to_invoice (invoice-time payment_allocation + per-head net-of-advance vat_records adjustment in the invoice period + no-over-netting conservation assertion). Verified: helper/applier/delegates all true | P4 L4 |
```
- [ ] **Step 5: Commit.** `git add supabase/migrations/20260706_advance_voucher_issue_and_apply.sql src/types/database.types.ts supabase/migrations.manifest.md && git commit -m "feat(db): advance-voucher issuance + net-of-advance invoice allocation with conservation"`

---

### Task L4.5: `advanceVoucherService` — capture, issue, allocate, refund (client seam)

**Files:**
- Create: `src/lib/advanceVoucherService.ts`
- Create: `src/lib/advanceVoucherService.test.ts`

**Interfaces:**
- Consumes: `record_payment` (advance kind, L4.3), `apply_advance_to_invoice`/`issue_tax_document('receipt_voucher'|'refund_voucher',…)` (L4.4), `computeDocumentTotals`/`persistDocumentTaxLines` from `src/lib/taxDocumentService.ts` (S3-completed seam), `buildAdvanceVoucherTotalsInput` (L4.6), `resolveRateContext` (`src/lib/currencyService.ts`).
- Produces: `createAdvancePayment(input)`, `issueReceiptVoucher(voucherDraft)`, `applyAdvanceToInvoice(paymentId, invoiceId, amount)`, `issueRefundVoucher(receiptVoucherId, reason)` — the case/modal surfaces call these.

- [ ] **Step 1: Write the failing service test.** Create `src/lib/advanceVoucherService.test.ts` (node project; mock `./supabaseClient`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) } }));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(async () => ({ documentCurrency: 'INR', rate: 1, rateSource: 'derived', documentDecimals: 2, baseDecimals: 2, baseCurrency: 'INR' })),
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn(async () => undefined) }));

import { createAdvancePayment, applyAdvanceToInvoice } from './advanceVoucherService';

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

describe('advanceVoucherService', () => {
  it('createAdvancePayment records record_payment with kind=advance and NO allocations', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'pay-1', payment_number: 'PAY-1' }, error: null });
    const res = await createAdvancePayment({
      amount: 5000, payment_date: '2026-04-10', customer_id: 'cust-1', case_id: 'case-1',
      payment_method_id: 'pm-1', bank_account_id: 'ba-1', currency: 'INR',
    });
    expect(res.id).toBe('pay-1');
    const [fnName, args] = rpc.mock.calls[0];
    expect(fnName).toBe('record_payment');
    expect((args as { p_payment: Record<string, unknown> }).p_payment.kind).toBe('advance');
    expect((args as { p_allocations: unknown[] }).p_allocations).toEqual([]);
  });

  it('applyAdvanceToInvoice calls the apply RPC with the three positional args', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, allocated: 5000 }, error: null });
    const res = await applyAdvanceToInvoice('pay-1', 'inv-1', 5000);
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('apply_advance_to_invoice', { p_payment_id: 'pay-1', p_invoice_id: 'inv-1', p_amount: 5000 });
  });
});
```
- [ ] **Step 2: Run it, expect FAIL** (`Cannot find module './advanceVoucherService'`).
- [ ] **Step 3: Implement `src/lib/advanceVoucherService.ts`.** Full module:
```ts
import { supabase } from './supabaseClient';
import { logAuditTrail } from './auditTrailService';
import { resolveRateContext } from './currencyService';
import { computeDocumentTotals, persistDocumentTaxLines, issueTaxDocument } from './taxDocumentService';
import { buildAdvanceVoucherTotalsInput } from './regimes/in_gst/advanceVoucher';

export interface AdvancePaymentInput {
  amount: number; payment_date: string; currency?: string | null; exchange_rate?: number;
  customer_id?: string | null; company_id?: string | null; case_id?: string | null;
  payment_method_id?: string | null; bank_account_id?: string | null;
  reference?: string | null; notes?: string | null;
}

export async function createAdvancePayment(input: AdvancePaymentInput) {
  const rc = await resolveRateContext(
    input.currency, input.payment_date, input.exchange_rate ? { rate: input.exchange_rate } : null);
  const { data, error } = await supabase.rpc('record_payment', {
    p_payment: {
      kind: 'advance',
      amount: input.amount, currency: rc.documentCurrency, exchange_rate: rc.rate, rate_source: rc.rateSource,
      payment_date: input.payment_date, customer_id: input.customer_id ?? null, case_id: input.case_id ?? null,
      payment_method_id: input.payment_method_id ?? null, bank_account_id: input.bank_account_id ?? null,
      reference: input.reference ?? null, status: 'completed', notes: input.notes ?? null,
    },
    p_allocations: [],
  });
  if (error) throw error;
  if (!data) throw new Error('Failed to record advance payment');
  await logAuditTrail('create', 'payments', data.id, {}, { payment_number: data.payment_number, kind: 'advance', amount: input.amount });
  return data;
}

export interface ReceiptVoucherDraft {
  payment_id: string; tenant_id: string; case_id?: string | null;
  customer_id?: string | null; company_id?: string | null;
  advance_amount: number; currency: string; payment_date: string;
  place_of_supply_subdivision_id?: string | null; sac_code?: string;
}

export async function issueReceiptVoucher(draft: ReceiptVoucherDraft) {
  const rc = await resolveRateContext(draft.currency, draft.payment_date, null);
  const { data: voucher, error: insErr } = await supabase.from('advance_vouchers').insert({
    tenant_id: draft.tenant_id, payment_id: draft.payment_id, case_id: draft.case_id ?? null,
    customer_id: draft.customer_id ?? null, company_id: draft.company_id ?? null,
    voucher_type: 'receipt', voucher_date: draft.payment_date, currency: draft.currency,
    exchange_rate: rc.rate, total_amount: draft.advance_amount,
    place_of_supply_subdivision_id: draft.place_of_supply_subdivision_id ?? null,
  }).select().single();
  if (insErr) throw insErr;

  // Rule 50: back out GST from the inclusive advance (18/118, equal heads + round-off).
  const input = buildAdvanceVoucherTotalsInput(draft.advance_amount, draft.payment_date, draft.sac_code);
  const { computation } = await computeDocumentTotals(input, rc);
  await persistDocumentTaxLines({
    tenantId: draft.tenant_id, documentType: 'receipt_voucher', documentId: voucher.id, computation, rc,
  });
  const result = await issueTaxDocument('receipt_voucher', voucher.id, false);
  await logAuditTrail('create', 'advance_vouchers', voucher.id, {}, { voucher_number: result.document_number, type: 'receipt' });
  return { voucher_id: voucher.id, ...result };
}

export async function applyAdvanceToInvoice(paymentId: string, invoiceId: string, amount: number) {
  const { data, error } = await supabase.rpc('apply_advance_to_invoice', {
    p_payment_id: paymentId, p_invoice_id: invoiceId, p_amount: amount,
  });
  if (error) throw error;
  return data as { ok: boolean; allocated: number; advance_adjustment_tax: number; invoice_status: string };
}

export async function issueRefundVoucher(receiptVoucherId: string, reason: string) {
  const { data: orig, error: oErr } = await supabase.from('advance_vouchers')
    .select('*').eq('id', receiptVoucherId).is('deleted_at', null).maybeSingle();
  if (oErr) throw oErr;
  if (!orig) throw new Error('Original receipt voucher not found');
  const rc = await resolveRateContext(orig.currency, new Date().toISOString().slice(0, 10), null);
  const { data: refund, error: rErr } = await supabase.from('advance_vouchers').insert({
    tenant_id: orig.tenant_id, payment_id: orig.payment_id, case_id: orig.case_id,
    customer_id: orig.customer_id, company_id: orig.company_id, voucher_type: 'refund',
    original_voucher_id: orig.id, currency: orig.currency, exchange_rate: rc.rate,
    total_amount: orig.total_amount, place_of_supply_subdivision_id: orig.place_of_supply_subdivision_id,
    notations: [{ code: 'REFUND_REASON', text: reason }],
  }).select().single();
  if (rErr) throw rErr;

  const input = buildAdvanceVoucherTotalsInput(orig.total_amount, refund.voucher_date, undefined);
  const { computation } = await computeDocumentTotals(input, rc);
  await persistDocumentTaxLines({
    tenantId: orig.tenant_id, documentType: 'refund_voucher', documentId: refund.id, computation, rc,
  });
  const result = await issueTaxDocument('refund_voucher', refund.id, false);
  await logAuditTrail('create', 'advance_vouchers', refund.id, {}, { voucher_number: result.document_number, type: 'refund', reason });
  return { voucher_id: refund.id, ...result };
}

export const advanceVoucherService = { createAdvancePayment, issueReceiptVoucher, applyAdvanceToInvoice, issueRefundVoucher };
```
- [ ] **Step 4: Run test, expect PASS.** `npx vitest run src/lib/advanceVoucherService.test.ts`
- [ ] **Step 5: Commit.** `git add src/lib/advanceVoucherService.ts src/lib/advanceVoucherService.test.ts && git commit -m "feat(advance): advanceVoucherService — capture, receipt/refund voucher issue, invoice allocation"`

---

### Task L4.6: `buildAdvanceVoucherTotalsInput` (Rule 50 back-out) + `in_gst_invoice` voucher titles

**Files:**
- Create: `src/lib/regimes/in_gst/advanceVoucher.ts`
- Create: `src/lib/regimes/in_gst/advanceVoucher.test.ts`
- Modify: `src/lib/regimes/in_gst_invoice/index.ts` (WP-S4's profile — `documentTitle(ctx)` switch)

**Interfaces:**
- Consumes: `DocumentTotalsInput` from `src/lib/taxDocumentService.ts`; `DocumentComplianceProfile` from `src/lib/regimes/types.ts`; the WP-S4 `in_gst_invoice` profile (key `'in_gst_invoice'`).
- Produces: `buildAdvanceVoucherTotalsInput(advanceAmount, documentDate, sacCode?)` → `DocumentTotalsInput` (tax-inclusive, single line, 18% slab, SAC 998319 default); `in_gst_invoice.documentTitle` returns `RECEIPT VOUCHER`/`REFUND VOUCHER` for the two voucher doc types.

- [ ] **Step 1: Write the failing builder test.** Create `src/lib/regimes/in_gst/advanceVoucher.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildAdvanceVoucherTotalsInput } from './advanceVoucher';

describe('buildAdvanceVoucherTotalsInput (Rule 50 inclusive back-out)', () => {
  it('emits a single tax-inclusive line at the 18% slab, SAC 998319 default', () => {
    const input = buildAdvanceVoucherTotalsInput(5000, '2026-04-10');
    expect(input.taxInclusive).toBe(true);
    expect(input.documentType).toBe('receipt_voucher');
    expect(input.taxRate).toBe(18);
    expect(input.items).toHaveLength(1);
    expect(input.items[0].unit_price).toBe(5000);
    expect(input.items[0].description).toContain('998319');
  });

  it('honors a caller-supplied SAC code', () => {
    const input = buildAdvanceVoucherTotalsInput(1180, '2026-04-10', '998713');
    expect(input.items[0].description).toContain('998713');
  });
});
```
- [ ] **Step 2: Run it, expect FAIL** (module not found).
- [ ] **Step 3: Implement `src/lib/regimes/in_gst/advanceVoucher.ts`.**
```ts
import type { DocumentTotalsInput } from '../../taxDocumentService';

/** Rule 50 receipt-voucher fact assembly: the advance is collected GST-inclusive
 *  (a lab takes a round ₹5,000 at intake), so back it out at the 18% slab. The
 *  proviso default (18% when the rate is indeterminable; IGST when the nature of
 *  supply is indeterminable) is already the slab the kernel resolves via
 *  split_by_place_of_supply — no special-casing here. SAC 998319 (data recovery)
 *  is the tenant default; callers may pass 998713 or another selectable SAC. */
export function buildAdvanceVoucherTotalsInput(
  advanceAmount: number, documentDate: string, sacCode: string = '998319',
): DocumentTotalsInput {
  return {
    items: [{
      description: `Advance against data-recovery services (SAC ${sacCode})`,
      quantity: 1, unit_price: advanceAmount,
    }],
    discountAmount: 0,
    taxRate: 18,
    documentType: 'receipt_voucher',
    documentDate,
    taxInclusive: true,
  };
}
```
- [ ] **Step 4: Run test, expect PASS.**
- [ ] **Step 5: Write the failing profile-title test.** Append to `src/lib/regimes/in_gst_invoice/index.test.ts` (S4's test file) a case — but to keep this WP self-contained, create `src/lib/regimes/in_gst/voucherTitle.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { inGstInvoiceProfile } from '../in_gst_invoice';

describe('in_gst_invoice voucher titles', () => {
  const ctx = { sellerRegistered: true, taxInvoiceRequired: true };
  it('titles receipt and refund vouchers', () => {
    expect(inGstInvoiceProfile.documentTitle({ ...ctx, docType: 'receipt_voucher' }).title).toBe('RECEIPT VOUCHER');
    expect(inGstInvoiceProfile.documentTitle({ ...ctx, docType: 'refund_voucher' }).title).toBe('REFUND VOUCHER');
  });
});
```
(Verify S4's export name; adjust the import to S4's actual `inGstInvoiceProfile` symbol — named in Consumes.)
- [ ] **Step 6: Run it, expect FAIL** (the profile's default branch returns TAX INVOICE for voucher types).
- [ ] **Step 7: Extend the profile.** In `src/lib/regimes/in_gst_invoice/index.ts`, add two branches to the `documentTitle` switch (before the final invoice fallthrough), leaving version at `'1.0.0'` (additive title cases require no capability re-sync):
```ts
    if (ctx.docType === 'receipt_voucher') {
      return { title: 'RECEIPT VOUCHER', titleTranslated: null };
    }
    if (ctx.docType === 'refund_voucher') {
      return { title: 'REFUND VOUCHER', titleTranslated: null };
    }
```
- [ ] **Step 8: Run both tests, expect PASS.** `npx vitest run src/lib/regimes/in_gst/advanceVoucher.test.ts src/lib/regimes/in_gst/voucherTitle.test.ts`
- [ ] **Step 9: Commit.** `git add src/lib/regimes/in_gst/advanceVoucher.ts src/lib/regimes/in_gst/advanceVoucher.test.ts src/lib/regimes/in_gst/voucherTitle.test.ts src/lib/regimes/in_gst_invoice/index.ts && git commit -m "feat(in_gst): Rule 50 voucher totals input + RECEIPT/REFUND VOUCHER titles"`

---

### Task L4.7: Voucher PDF adapters + regime-keyed receipt-artifact switch

**Files:**
- Create: `src/lib/pdf/engine/adapters/advanceVoucherAdapter.ts`
- Create: `src/lib/pdf/engine/adapters/advanceVoucherAdapter.test.ts`
- Create: `src/lib/pdf/advanceReceiptArtifact.ts`
- Create: `src/lib/pdf/advanceReceiptArtifact.test.ts`

**Interfaces:**
- Consumes: `EngineDocData`, `PartyBlock`, `LabelText`, `ResolvedColumn` from `src/lib/pdf/engine/types.ts`; `DocumentTemplateConfig` from `src/lib/pdf/templateConfig.ts`; `formatEngineMoney`, `safeString` from `src/lib/pdf/utils.ts`; `fmtDateWithConfig` from `src/lib/pdf/configDate.ts` (all patterns proven in `creditNoteAdapter.ts`).
- Produces: `toAdvanceVoucherEngineData(voucher, config)` → `EngineDocData`; `resolveAdvanceReceiptArtifact(regimeDocumentsKey)` → `'receipt_voucher' | 'payment_receipt'` (the "one advance ⇒ one customer artifact" switch — no country branching in components).

- [ ] **Step 1: Write the failing artifact-switch test.** Create `src/lib/pdf/advanceReceiptArtifact.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveAdvanceReceiptArtifact } from './advanceReceiptArtifact';

describe('resolveAdvanceReceiptArtifact', () => {
  it('IN GST tenants supersede the legacy payment receipt with the Rule 50 voucher', () => {
    expect(resolveAdvanceReceiptArtifact('in_gst_invoice')).toBe('receipt_voucher');
  });
  it('non-India regimes keep the legacy payment receipt for advances', () => {
    expect(resolveAdvanceReceiptArtifact('gcc_tax_invoice')).toBe('payment_receipt');
    expect(resolveAdvanceReceiptArtifact('generic_invoice')).toBe('payment_receipt');
    expect(resolveAdvanceReceiptArtifact(null)).toBe('payment_receipt');
  });
});
```
- [ ] **Step 2: Run it, expect FAIL** (module not found).
- [ ] **Step 3: Implement `src/lib/pdf/advanceReceiptArtifact.ts`.**
```ts
/** Regime-keyed receipt-artifact switch (NOT country branching): for an advance,
 *  an IN GST tenant issues the statutory Rule 50 Receipt Voucher, which SUPERSEDES
 *  the legacy payment_receipts artifact — one advance yields exactly one
 *  customer-facing receipt document. Every other regime keeps the legacy receipt.
 *  Keyed on the tenant's resolved regime.documents plugin key. */
export function resolveAdvanceReceiptArtifact(
  regimeDocumentsKey: string | null,
): 'receipt_voucher' | 'payment_receipt' {
  return regimeDocumentsKey === 'in_gst_invoice' ? 'receipt_voucher' : 'payment_receipt';
}
```
- [ ] **Step 4: Run test, expect PASS.**
- [ ] **Step 5: Write the failing adapter test.** Create `src/lib/pdf/engine/adapters/advanceVoucherAdapter.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toAdvanceVoucherEngineData } from './advanceVoucherAdapter';
import type { DocumentTemplateConfig } from '../../templateConfig';

const config = {
  sections: [{ key: 'lineItems', columns: [{ key: 'description', visible: true, label: 'Description' }] }],
  locale: { decimalPlaces: 2, decimalSeparator: '.', thousandsSeparator: ',' },
} as unknown as DocumentTemplateConfig;

describe('toAdvanceVoucherEngineData', () => {
  it('maps a receipt voucher into engine data with the voucher number + taxable/tax rows', () => {
    const data = toAdvanceVoucherEngineData({
      voucher_type: 'receipt', voucher_number: 'RV/25-26/0001', voucher_date: '2026-04-10',
      currency_symbol: '₹', currency_position: 'before', decimal_places: 2,
      customer_name: 'Acme Data', taxable_amount: 4237.29, tax_amount: 762.71, total_amount: 5000,
      original_voucher_number: null,
    }, config);
    expect(data.documentTitle.en).toBe('RECEIPT VOUCHER');
    expect(data.meta.some((m) => m.value === 'RV/25-26/0001')).toBe(true);
    expect(data.totals?.some((t) => t.value.includes('5,000'))).toBe(true);
  });

  it('titles a refund voucher and shows the original receipt-voucher reference', () => {
    const data = toAdvanceVoucherEngineData({
      voucher_type: 'refund', voucher_number: 'RFV/25-26/0001', voucher_date: '2026-05-01',
      currency_symbol: '₹', currency_position: 'before', decimal_places: 2,
      customer_name: 'Acme Data', taxable_amount: 4237.29, tax_amount: 762.71, total_amount: 5000,
      original_voucher_number: 'RV/25-26/0001',
    }, config);
    expect(data.documentTitle.en).toBe('REFUND VOUCHER');
    expect(data.meta.some((m) => m.value === 'RV/25-26/0001')).toBe(true);
  });
});
```
- [ ] **Step 6: Run it, expect FAIL** (module not found).
- [ ] **Step 7: Implement `src/lib/pdf/engine/adapters/advanceVoucherAdapter.ts`** (modeled on `creditNoteAdapter.ts`):
```ts
import type { DocumentTemplateConfig } from '../../templateConfig';
import { formatEngineMoney, safeString } from '../../utils';
import { fmtDateWithConfig } from '../../configDate';
import type { EngineDocData, LabelText, PartyBlock } from '../types';

export interface AdvanceVoucherDocumentData {
  voucher_type: 'receipt' | 'refund';
  voucher_number: string | null;
  voucher_date: string;
  currency_symbol: string;
  currency_position: 'before' | 'after' | string;
  decimal_places: number;
  customer_name: string | null;
  company_name?: string | null;
  case_no?: string | null;
  taxable_amount: number;
  tax_amount: number;
  total_amount: number;
  original_voucher_number: string | null;
}

export function toAdvanceVoucherEngineData(
  v: AdvanceVoucherDocumentData, config: DocumentTemplateConfig,
): EngineDocData {
  const money = (amount: number): string =>
    formatEngineMoney(amount, {
      symbol: v.currency_symbol || '',
      decimalPlaces: config.locale?.decimalPlaces ?? v.decimal_places ?? 2,
      position: v.currency_position === 'before' ? 'before' : 'after',
      decimalSeparator: config.locale?.decimalSeparator,
      thousandsSeparator: config.locale?.thousandsSeparator,
    });

  const isRefund = v.voucher_type === 'refund';
  const documentTitle: LabelText = { en: isRefund ? 'REFUND VOUCHER' : 'RECEIPT VOUCHER', ar: null } as LabelText;

  const to: PartyBlock = {
    title: { en: 'Customer Information', ar: 'معلومات العميل' },
    name: v.customer_name ?? v.company_name ?? 'N/A',
    rows: [],
  };

  const meta: EngineDocData['meta'] = [
    { label: { en: 'Voucher No:', ar: 'رقم القسيمة:' }, value: v.voucher_number || 'Draft' },
    { label: { en: 'Date:', ar: 'التاريخ:' }, value: fmtDateWithConfig(v.voucher_date, config.locale) },
  ];
  if (v.case_no) meta.push({ label: { en: 'Job ID:', ar: 'رقم المهمة:' }, value: v.case_no });
  if (isRefund && v.original_voucher_number) {
    meta.push({ label: { en: 'Against Receipt Voucher:', ar: 'مقابل قسيمة الاستلام:' }, value: v.original_voucher_number });
  }

  const rows = [{ description: safeString(`Advance ${isRefund ? 'refund' : 'received'} against data-recovery services`) }];

  const totals: NonNullable<EngineDocData['totals']> = [
    { label: { en: 'Taxable Value:', ar: 'القيمة الخاضعة:' }, value: money(v.taxable_amount) },
    { label: { en: 'GST:', ar: 'ضريبة:' }, value: money(v.tax_amount) },
    { key: 'total', label: { en: isRefund ? 'Total Refunded:' : 'Total Received:', ar: 'الإجمالي:' }, value: money(v.total_amount), emphasis: true },
  ];

  return {
    documentTitle,
    identity: null,
    parties: { to },
    meta,
    lineItems: { columns: [{ key: 'description', visible: true, label: 'Description', align: 'left' }], rows },
    totals,
    paymentHistory: null,
    terms: null,
    bank: null,
  } satisfies EngineDocData;
}
```
- [ ] **Step 8: Run both new test files, expect PASS.** `npx vitest run src/lib/pdf/advanceReceiptArtifact.test.ts src/lib/pdf/engine/adapters/advanceVoucherAdapter.test.ts`
- [ ] **Step 9: Commit.** `git add src/lib/pdf/engine/adapters/advanceVoucherAdapter.ts src/lib/pdf/engine/adapters/advanceVoucherAdapter.test.ts src/lib/pdf/advanceReceiptArtifact.ts src/lib/pdf/advanceReceiptArtifact.test.ts && git commit -m "feat(pdf): advance-voucher engine adapter + regime-keyed receipt-artifact switch"`

---

### Task L4.8: RecordPaymentModal "Advance (unallocated)" kind + case-side capture entry

**Files:**
- Modify: `src/components/financial/RecordPaymentModal.tsx` (props `onSave` at lines ~33–53; allocation grid + `InvoiceAllocation` state)
- Modify: `src/components/cases/detail/CaseFinancesTab.tsx`
- Create: `src/components/financial/RecordPaymentModal.advance.test.tsx`

**Interfaces:**
- Consumes: `createAdvancePayment`, `issueReceiptVoucher` (L4.5); `resolveAdvanceReceiptArtifact` (L4.7); existing `getPaymentMethods` (`paymentsService`), `useCurrency`, `useToast`.
- Produces: `RecordPaymentModal` gains a `kind: 'standard' | 'advance'` toggle; when `advance`, the invoice-allocation grid is hidden and `onSave` receives `{ kind: 'advance', ... }` with an empty allocation array. `CaseFinancesTab` gains a "Record Advance" action opening the modal in advance mode, then an "Issue Receipt Voucher" action on the resulting advance.

- [ ] **Step 1: Write the failing jsdom test.** Create `src/components/financial/RecordPaymentModal.advance.test.tsx` (jsdom project):
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecordPaymentModal } from './RecordPaymentModal';

vi.mock('../../lib/paymentsService', () => ({
  getPaymentMethods: vi.fn(async () => [{ id: 'pm-1', name: 'Cash' }]),
  getCasesWithUnpaidInvoices: vi.fn(async () => []),
  getUnpaidInvoicesByCase: vi.fn(async () => []),
}));
vi.mock('../../hooks/useCurrency', () => ({ useCurrency: () => ({ format: (n: number) => `₹${n}`, currencyCode: 'INR' }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }) } }));

describe('RecordPaymentModal advance kind', () => {
  it('hides the invoice allocation grid and emits kind=advance with no allocations', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<RecordPaymentModal isOpen onClose={() => {}} onSave={onSave} preselectedCaseId="case-1" />);
    fireEvent.click(await screen.findByRole('radio', { name: /advance \(unallocated\)/i }));
    expect(screen.queryByText(/allocate to invoices/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /record advance/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [payload, allocations] = onSave.mock.calls[0];
    expect((payload as { kind: string }).kind).toBe('advance');
    expect(allocations).toEqual([]);
  });
});
```
- [ ] **Step 2: Run it, expect FAIL** (no advance radio; grid always shown; `onSave` payload has no `kind`).
- [ ] **Step 3: Implement the modal changes.** In `RecordPaymentModal.tsx`: (a) widen the `onSave` payload type at lines ~33–53 to include `kind?: 'standard' | 'advance'`; (b) add `const [kind, setKind] = useState<'standard' | 'advance'>('standard');` and a two-radio control ("Standard payment" / "Advance (unallocated)"); (c) gate the allocation grid + `getUnpaidInvoicesByCase` query with `{kind === 'standard' && (…) }`; (d) on submit, when `kind === 'advance'` call `onSave({ ...paymentData, kind: 'advance' }, [])` and label the submit button "Record Advance"; keep the existing standard path otherwise; (e) when `kind === 'advance'`, do not require the invoice selection but still require amount + method + deposit account.
- [ ] **Step 4: Run test, expect PASS.**
- [ ] **Step 5: Wire the case surface.** In `CaseFinancesTab.tsx`: add a "Record Advance" button that opens `RecordPaymentModal` with `preselectedCaseId` and, on save, calls `advanceVoucherService.createAdvancePayment(...)`; after success, surface an "Issue Receipt Voucher" action on the advance row that calls `issueReceiptVoucher(...)` and, per `resolveAdvanceReceiptArtifact(regime.documents)`, renders the Rule 50 voucher (IN) instead of the legacy payment receipt. (Reuse the existing `useRegimeConfig`/tenant-config hook for the documents key.)
- [ ] **Step 6: Typecheck the touched components.** `npm run typecheck` (expect 0).
- [ ] **Step 7: Commit.** `git add src/components/financial/RecordPaymentModal.tsx src/components/financial/RecordPaymentModal.advance.test.tsx src/components/cases/detail/CaseFinancesTab.tsx && git commit -m "feat(cases): Advance (unallocated) payment kind + case-side advance capture & receipt-voucher issue"`

---

### Task L4.9: Case-lifecycle refund/retained-advance hooks + WP finalization

**Files:**
- Modify: `src/components/cases/detail/CaseOverviewTab.tsx` (Mark No Solution / cancellation surfaces)
- Create: `src/lib/advanceTerminals.ts`
- Create: `src/lib/advanceTerminals.test.ts`

**Interfaces:**
- Consumes: `issueRefundVoucher`, `applyAdvanceToInvoice` (L4.5); `cases.recovery_outcome` / `no_solution` phase / cancellation (CLAUDE.md v1.3.0/v1.4.0); the case's issued receipt voucher (`advance_vouchers` where `voucher_type='receipt'`).
- Produces: `offerRefundVoucher(caseId)` (guarded to `recovery_outcome='unrecoverable'` | phase `no_solution` | cancelled) and `retainAdvanceAsEvaluationInvoice(caseId, advancePaymentId)` — the three named terminals from §4-L4.

- [ ] **Step 1: Write the failing terminal-guard test.** Create `src/lib/advanceTerminals.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { canOfferRefundVoucher } from './advanceTerminals';

describe('canOfferRefundVoucher', () => {
  it('offers refund on unrecoverable / no_solution / cancelled with a held advance', () => {
    expect(canOfferRefundVoucher({ phaseType: 'no_solution', recoveryOutcome: null, hasIssuedReceiptVoucher: true })).toBe(true);
    expect(canOfferRefundVoucher({ phaseType: 'recovery', recoveryOutcome: 'unrecoverable', hasIssuedReceiptVoucher: true })).toBe(true);
    expect(canOfferRefundVoucher({ phaseType: 'cancelled', recoveryOutcome: null, hasIssuedReceiptVoucher: true })).toBe(true);
  });
  it('does NOT offer refund on a live recovery or when no receipt voucher exists', () => {
    expect(canOfferRefundVoucher({ phaseType: 'recovery', recoveryOutcome: null, hasIssuedReceiptVoucher: true })).toBe(false);
    expect(canOfferRefundVoucher({ phaseType: 'no_solution', recoveryOutcome: null, hasIssuedReceiptVoucher: false })).toBe(false);
  });
});
```
- [ ] **Step 2: Run it, expect FAIL** (module not found).
- [ ] **Step 3: Implement `src/lib/advanceTerminals.ts`.**
```ts
import { issueRefundVoucher } from './advanceVoucherService';

export interface RefundEligibility {
  phaseType: string | null;
  recoveryOutcome: string | null;
  hasIssuedReceiptVoucher: boolean;
}

/** Rule 51 refund is offered ONLY on the real no-recovery surfaces — the
 *  no_solution phase, recovery_outcome='unrecoverable', or a cancelled case —
 *  and only when an advance receipt voucher was actually issued (there is a tax
 *  leg to reverse). A live recovery never offers a refund. */
export function canOfferRefundVoucher(e: RefundEligibility): boolean {
  if (!e.hasIssuedReceiptVoucher) return false;
  return e.phaseType === 'no_solution'
    || e.phaseType === 'cancelled'
    || e.recoveryOutcome === 'unrecoverable';
}

/** Terminal 1 — actual refund: reverse the advance and emit the Refund Voucher
 *  (which references the original receipt voucher per Rule 51). */
export async function offerRefundVoucher(receiptVoucherId: string, reason: string) {
  return issueRefundVoucher(receiptVoucherId, reason);
}
```
(The retained-advance terminal — Terminal 3 — is realized by the existing invoice flow: an evaluation-service tax invoice (SAC 998319) is raised, then `applyAdvanceToInvoice(advancePaymentId, evaluationInvoiceId, amount)` from L4.5 nets the advance GST and closes the loop; no new primitive is required.)
- [ ] **Step 4: Run test, expect PASS.**
- [ ] **Step 5: Wire the Overview surface.** In `CaseOverviewTab.tsx`: in the Mark-No-Solution / cancellation flows, when `canOfferRefundVoucher(...)` is true, render an "Issue Refund Voucher" action calling `offerRefundVoucher(receiptVoucherId, reason)`; and when the lab retains the advance on a no-recovery close, surface "Raise Evaluation Invoice (advance retained)" which raises the SAC-998319 evaluation invoice and calls `applyAdvanceToInvoice(...)`. Reuse the existing case-status context for `phaseType`/`recoveryOutcome`.
- [ ] **Step 6: Final verification — typecheck + full L4 test set.** Run `npm run typecheck` (expect 0), then `npx vitest run src/lib/regimes/advanceDocTypes.test.ts src/lib/advanceVoucherService.test.ts src/lib/regimes/in_gst/advanceVoucher.test.ts src/lib/regimes/in_gst/voucherTitle.test.ts src/lib/pdf/advanceReceiptArtifact.test.ts src/lib/pdf/engine/adapters/advanceVoucherAdapter.test.ts src/components/financial/RecordPaymentModal.advance.test.tsx src/lib/advanceTerminals.test.ts` (expect all green).
- [ ] **Step 7: Commit.** `git add src/lib/advanceTerminals.ts src/lib/advanceTerminals.test.ts src/components/cases/detail/CaseOverviewTab.tsx && git commit -m "feat(cases): refund-voucher + retained-advance evaluation-invoice terminals"`
- [ ] **Step 8: Push + open the PR (owner merges — do NOT merge).** `git push -u origin feat/india-l4-advance-vouchers && gh pr create --base main --title "Phase 4 India Pack — WP-L4: Advance Vouchers + Advance Money Leg" --body "$(cat <<'EOF'
## WP-L4 — Advance Vouchers + the Advance Money Leg [L, MIGRATION PR]

Implements the advance money leg + Rule 50/51 vouchers wired to the DR-lab lifecycle. Rebased onto S6; re-splices `record_payment` AFTER L3.

### Migrations (3 files, applied to ssmbegiyjivrcwgcqutu)
- `india_advance_voucher_schema` — voucher doc-type CHECK widenings; `field_key` + `original_receipt_voucher_ref`; `payments.payment_kind`; `advance_vouchers` document table (full tenant discipline + issued-immutability); 3 IN voucher requirement rows (Rule 50/51) w/ seed assertion.
- `record_payment_advance_kind` — `record_payment` gains an `advance` kind held unallocated (ledger-balanced), re-spliced onto L3's captured body (withholding conservation preserved).
- `advance_voucher_issue_and_apply` — `_issue_advance_voucher` (GST at receipt / negative at refund; Rule 51 receipt-ref gate); `issue_tax_document` delegates the two voucher types; `apply_advance_to_invoice` posts the per-head **net-of-advance** adjustment in the invoice period with a no-over-netting conservation assertion.

### Contract change (the one ratified exception)
- `TaxDocumentType` additively widened (`receipt_voucher`, `refund_voucher`); assignability proof + `npm run typecheck = 0` show it is non-breaking. No new regime plugin / no hand-seeded capabilities (count stays 4).

### App surfaces
- `advanceVoucherService` (capture / receipt-voucher issue / invoice allocation / refund voucher).
- Rule 50 inclusive back-out (`buildAdvanceVoucherTotalsInput`, 18% slab, SAC 998319); `in_gst_invoice` RECEIPT/REFUND VOUCHER titles.
- Voucher PDF adapter + regime-keyed receipt-artifact switch (IN advance ⇒ Rule 50 voucher **supersedes** the legacy payment receipt — one advance, one customer artifact).
- RecordPaymentModal "Advance (unallocated)" kind; case-side advance capture; refund-voucher terminal (no_solution / unrecoverable / cancelled) + retained-advance → evaluation-invoice (SAC 998319) terminal.

### Named statutory treatments (for the CA memo / S7)
- Advance GST netting: voucher tax + (invoice full tax − advance adjustment) = total supply tax.
- Rule 50 proviso defaults (18%, IGST when indeterminable) resolved through the kernel split.
- GSTR-1 Table 11 advance rows remain deferred (adjustment data model supports later composition — see S6).

Verify: `npm run typecheck` = 0; all migrations manifested; no DROP/DELETE; custody/audit append-only intact.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"`

---


## Work Package WP-L5 — IRN-Readiness [S, no migration]

Branch: `feat/india-l5-irn-readiness` (cut from main)
Depends on: **WP-S4 merged** (§5 ordering `L5 ≥ S4`: IN tenants resolve `regime.tax='in_gst'` via the S1b bindings + S3 seam threading, and the `in_gst_invoice` profile/S3 fixtures exist so `src/lib/regimes/in_gst/` is a real directory). No dependency on WP-L2, WP-L4, or `register.ts`.

**Scope (D3, spec §1/§4-L5):** IRN **readiness only** — `regime.einvoice` stays `'no_einvoice'`; there is NO `in_irn` plugin, no `einvoice_submissions` lifecycle, no edge function, no IRP transport anywhere in this WP. The old-plan WP-8 chunk was mined solely for the INV-01 v1.1 field names (`Version`, `TranDtls.*`, `DocDtls.*`, `SellerDtls.*`, `BuyerDtls.*`, `ItemList.*`, `ValDtls.*`). Deliverables: (1) per-tenant "e-invoicing applicable" flag in `company_settings.metadata` (the verified `tablePrefsService.ts` pattern), (2) loud warning banner on invoice surfaces + settings card, (3) an INV-01 field-completeness **assertion test** proving xSuite already captures every mandatory INV-01 field (a test over a typed field map — not a payload builder), (4) invoice-PDF QR real-estate: the always-rendered QR block is relabelled as the reserved IRN slot for flagged tenants, byte-identical for everyone else.

All country gating is by the `regime.tax` **data key** (`config.regime.tax === 'in_gst'`, `src/lib/tenantConfigService.ts:130`) — never a country-code literal (eslint `no-country-branching-outside-regimes` flags `countryCode === 'IN'`).

### Task L5.1: E-invoicing applicability flag — pure module + settings-metadata service

**Files:**
- Create: `src/lib/einvoiceReadiness.ts` (pure — no I/O, importable from the PDF adapter)
- Create: `src/lib/einvoiceReadinessService.ts` (supabase read/write via `companySettingsService`)
- Modify: `src/lib/queryKeys.ts` (append a new key group at end of file)
- Test: `src/lib/einvoiceReadinessService.test.ts` (node project — `.test.ts`)

**Interfaces:**
- Consumes: `getOrCreateCompanySettings()`, `updateCompanySettings(updates: Partial<CompanySettings>)`, `invalidateCompanySettingsCache()` from `src/lib/companySettingsService.ts` (verified :197/:259/:254; `CompanySettings.metadata?: Json | null` verified :8); metadata spread-preserve pattern from `src/lib/tablePrefsService.ts:20-29` (`setTenantTableColumns`).
- Produces: `EInvoiceReadiness { applicable: boolean; marked_at: string | null }`, `EINVOICE_READINESS_METADATA_KEY = 'einvoice_readiness'`, `normalizeEInvoiceReadiness(value: unknown): EInvoiceReadiness`, `isEInvoiceApplicable(metadata: unknown): boolean` (all from `einvoiceReadiness.ts`); `getEInvoiceReadiness(): Promise<EInvoiceReadiness>`, `setEInvoiceApplicable(applicable: boolean): Promise<void>` (from `einvoiceReadinessService.ts`); `einvoiceReadinessKeys` (from `queryKeys.ts`). Consumed by Tasks L5.2, L5.3, L5.4.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/einvoiceReadinessService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getOrCreateCompanySettings, updateCompanySettings, invalidateCompanySettingsCache } = vi.hoisted(() => ({
  getOrCreateCompanySettings: vi.fn(),
  updateCompanySettings: vi.fn(),
  invalidateCompanySettingsCache: vi.fn(),
}));
vi.mock('./companySettingsService', () => ({
  getOrCreateCompanySettings,
  updateCompanySettings,
  invalidateCompanySettingsCache,
}));

import { getEInvoiceReadiness, setEInvoiceApplicable } from './einvoiceReadinessService';
import {
  isEInvoiceApplicable,
  normalizeEInvoiceReadiness,
  EINVOICE_READINESS_METADATA_KEY,
} from './einvoiceReadiness';

beforeEach(() => {
  vi.clearAllMocks();
  updateCompanySettings.mockResolvedValue({ id: 'cs1' });
});

describe('einvoiceReadiness (pure)', () => {
  it('defaults to not-applicable on null/corrupt metadata', () => {
    expect(normalizeEInvoiceReadiness(null)).toEqual({ applicable: false, marked_at: null });
    expect(normalizeEInvoiceReadiness('junk')).toEqual({ applicable: false, marked_at: null });
    // string 'true' must NOT pass — only boolean true (guards JSON round-trips)
    expect(normalizeEInvoiceReadiness({ applicable: 'true' }).applicable).toBe(false);
  });

  it('isEInvoiceApplicable reads the flag straight off a metadata bag (adapter path)', () => {
    expect(isEInvoiceApplicable(null)).toBe(false);
    expect(isEInvoiceApplicable({})).toBe(false);
    expect(isEInvoiceApplicable({ [EINVOICE_READINESS_METADATA_KEY]: { applicable: true } })).toBe(true);
    expect(isEInvoiceApplicable({ [EINVOICE_READINESS_METADATA_KEY]: { applicable: false } })).toBe(false);
  });
});

describe('einvoiceReadinessService', () => {
  it('getEInvoiceReadiness returns the default when metadata is empty', async () => {
    getOrCreateCompanySettings.mockResolvedValue({ id: 'cs1', metadata: null });
    expect(await getEInvoiceReadiness()).toEqual({ applicable: false, marked_at: null });
  });

  it('getEInvoiceReadiness returns the stored flag', async () => {
    getOrCreateCompanySettings.mockResolvedValue({
      id: 'cs1',
      metadata: { einvoice_readiness: { applicable: true, marked_at: '2026-07-05T00:00:00.000Z' } },
    });
    expect(await getEInvoiceReadiness()).toEqual({
      applicable: true,
      marked_at: '2026-07-05T00:00:00.000Z',
    });
  });

  it('setEInvoiceApplicable preserves sibling metadata keys and invalidates the cache', async () => {
    getOrCreateCompanySettings.mockResolvedValue({
      id: 'cs1',
      metadata: { table_columns: { cases: { visible: ['case_number'] } }, list_page_size: 25 },
    });
    await setEInvoiceApplicable(true);

    const written = updateCompanySettings.mock.calls[0][0].metadata as Record<string, unknown>;
    expect(written.table_columns).toEqual({ cases: { visible: ['case_number'] } }); // siblings intact
    expect(written.list_page_size).toBe(25);
    const flag = written.einvoice_readiness as { applicable: boolean; marked_at: string };
    expect(flag.applicable).toBe(true);
    expect(typeof flag.marked_at).toBe('string');
    expect(Number.isNaN(Date.parse(flag.marked_at))).toBe(false);
    expect(invalidateCompanySettingsCache).toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/lib/einvoiceReadinessService.test.ts` — Expected: **FAIL** (`Cannot find module './einvoiceReadinessService'`).

- [ ] **Step 2: Implement the pure module + service + query key**

```typescript
// src/lib/einvoiceReadiness.ts
// IRN-READINESS ONLY (Phase 4 D3): xSuite does not generate IRNs. This flag
// records that GST e-invoicing legally applies to the tenant (aggregate
// turnover above the notified threshold) so invoice surfaces warn loudly and
// the printed invoice reserves the IRN QR slot. Pure module — no I/O — so the
// pdfmake adapter can import it without dragging in supabaseClient.

export interface EInvoiceReadiness {
  applicable: boolean;
  marked_at: string | null;
}

export const EINVOICE_READINESS_METADATA_KEY = 'einvoice_readiness';

export const DEFAULT_EINVOICE_READINESS: EInvoiceReadiness = { applicable: false, marked_at: null };

/** Guard against corrupt metadata / JSON string round-trips: only boolean true passes. */
export function normalizeEInvoiceReadiness(value: unknown): EInvoiceReadiness {
  if (!value || typeof value !== 'object') return DEFAULT_EINVOICE_READINESS;
  const bag = value as Record<string, unknown>;
  return {
    applicable: bag.applicable === true,
    marked_at: typeof bag.marked_at === 'string' ? bag.marked_at : null,
  };
}

/** Reads the flag off a raw company_settings.metadata bag (adapter-safe, total). */
export function isEInvoiceApplicable(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return normalizeEInvoiceReadiness(
    (metadata as Record<string, unknown>)[EINVOICE_READINESS_METADATA_KEY],
  ).applicable;
}
```

```typescript
// src/lib/einvoiceReadinessService.ts
// Flag storage: company_settings.metadata.einvoice_readiness — the same
// tenant-scoped metadata bucket as table_columns / list_page_size
// (tablePrefsService pattern). updateCompanySettings enforces owner/admin.
import type { Json } from '../types/database.types';
import {
  getOrCreateCompanySettings,
  updateCompanySettings,
  invalidateCompanySettingsCache,
} from './companySettingsService';
import {
  EINVOICE_READINESS_METADATA_KEY,
  normalizeEInvoiceReadiness,
  type EInvoiceReadiness,
} from './einvoiceReadiness';

export async function getEInvoiceReadiness(): Promise<EInvoiceReadiness> {
  const settings = await getOrCreateCompanySettings();
  const metadata = (settings.metadata ?? {}) as Record<string, unknown>;
  return normalizeEInvoiceReadiness(metadata[EINVOICE_READINESS_METADATA_KEY]);
}

export async function setEInvoiceApplicable(applicable: boolean): Promise<void> {
  const settings = await getOrCreateCompanySettings();
  const metadata = { ...((settings.metadata ?? {}) as Record<string, unknown>) };
  metadata[EINVOICE_READINESS_METADATA_KEY] = {
    applicable,
    marked_at: new Date().toISOString(),
  };
  await updateCompanySettings({ metadata: metadata as Json });
  invalidateCompanySettingsCache();
}
```

Append to `src/lib/queryKeys.ts` (end of file):

```typescript
export const einvoiceReadinessKeys = {
  all: ['einvoice-readiness'] as const,
  tenant: () => [...einvoiceReadinessKeys.all, 'tenant'] as const,
};
```

- [ ] **Step 3: Run, expect PASS**

`npx vitest run src/lib/einvoiceReadinessService.test.ts` — all green. `npm run typecheck` — 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/einvoiceReadiness.ts src/lib/einvoiceReadinessService.ts src/lib/einvoiceReadinessService.test.ts src/lib/queryKeys.ts
git commit -m "feat(india): per-tenant e-invoicing-applicable flag in company_settings.metadata (IRN readiness, D3)"
```

### Task L5.2: Settings toggle card — Localization Center, Document tab

**Files:**
- Create: `src/components/settings/EInvoiceReadinessCard.tsx`
- Modify: `src/pages/settings/AccountingLocales.tsx` (Document tab panel — insert `<EInvoiceReadinessCard />` after the "Tax & resolved locale" `SectionCard` closing tag at line 526, inside the fragment that closes at line 527; add the import next to the existing component imports at the top of the file)
- Test: `src/components/settings/EInvoiceReadinessCard.test.tsx` (dom project — `.test.tsx`)

**Interfaces:**
- Consumes: `getEInvoiceReadiness` / `setEInvoiceApplicable` / `einvoiceReadinessKeys` (Task L5.1); `useTenantConfig()` from `src/contexts/TenantConfigContext.tsx` (`config.regime.tax` — `tenantConfigService.ts:130`); `useToast()` from `src/hooks/useToast.ts` (`toast.success/error`, pattern `AccountingLocales.tsx:221-224`); `Checkbox` from `src/components/ui/Checkbox.tsx` (`label`/`hint`/standard input props — verified :5-9).
- Produces: `EInvoiceReadinessCard: React.FC` — self-gating (renders `null` unless `config.regime.tax === 'in_gst'`), so `AccountingLocales.tsx` renders it unconditionally.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/settings/EInvoiceReadinessCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { getEInvoiceReadiness, setEInvoiceApplicable } = vi.hoisted(() => ({
  getEInvoiceReadiness: vi.fn(),
  setEInvoiceApplicable: vi.fn(),
}));
vi.mock('../../lib/einvoiceReadinessService', () => ({ getEInvoiceReadiness, setEInvoiceApplicable }));

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: { regime: { tax: 'in_gst' } } as { regime: { tax: string } },
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useTenantConfig: () => ({ config: mockConfig }),
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ success: toastSuccess, error: toastError }) }));

import { EInvoiceReadinessCard } from './EInvoiceReadinessCard';

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EInvoiceReadinessCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.regime.tax = 'in_gst';
  getEInvoiceReadiness.mockResolvedValue({ applicable: false, marked_at: null });
  setEInvoiceApplicable.mockResolvedValue(undefined);
});

describe('EInvoiceReadinessCard', () => {
  it('renders nothing for a non-in_gst tenant (regime data key, not a country literal)', () => {
    mockConfig.regime.tax = 'simple_vat';
    const { container } = renderCard();
    expect(container.firstChild).toBeNull();
    expect(getEInvoiceReadiness).not.toHaveBeenCalled(); // query disabled too
  });

  it('renders the applicability toggle for an in_gst tenant', async () => {
    renderCard();
    expect(
      await screen.findByLabelText('E-invoicing is applicable to this business'),
    ).not.toBeChecked();
    expect(screen.queryByRole('alert')).toBeNull(); // no warning while off
  });

  it('shows the LOUD manual-IRP warning when the flag is on', async () => {
    getEInvoiceReadiness.mockResolvedValue({ applicable: true, marked_at: '2026-07-05T00:00:00.000Z' });
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('xSuite does not yet generate IRNs');
    expect(alert.textContent).toContain('IRP');
  });

  it('persists the toggle through the service and toasts', async () => {
    renderCard();
    fireEvent.click(await screen.findByLabelText('E-invoicing is applicable to this business'));
    await waitFor(() => expect(setEInvoiceApplicable).toHaveBeenCalledWith(true));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });
});
```

Run: `npx vitest run src/components/settings/EInvoiceReadinessCard.test.tsx` — Expected: **FAIL** (`Cannot find module './EInvoiceReadinessCard'`).

- [ ] **Step 2: Implement the card**

```tsx
// src/components/settings/EInvoiceReadinessCard.tsx
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { useToast } from '../../hooks/useToast';
import { Checkbox } from '../ui/Checkbox';
import { getEInvoiceReadiness, setEInvoiceApplicable } from '../../lib/einvoiceReadinessService';
import { einvoiceReadinessKeys } from '../../lib/queryKeys';

/**
 * GST e-invoicing (IRN) applicability — IRN-READINESS ONLY (Phase 4 D3).
 * xSuite does not generate IRNs; this flag drives the loud invoice-surface
 * warning and the reserved IRN QR caption on the printed invoice. Gated by the
 * regime.tax data key (in_gst), never a country-code literal.
 */
export const EInvoiceReadinessCard: React.FC = () => {
  const { config } = useTenantConfig();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const inGst = config.regime.tax === 'in_gst';

  const { data } = useQuery({
    queryKey: einvoiceReadinessKeys.tenant(),
    queryFn: getEInvoiceReadiness,
    enabled: inGst,
  });

  if (!inGst) return null;
  const applicable = data?.applicable === true;

  const onToggle = async (next: boolean) => {
    setIsSaving(true);
    try {
      await setEInvoiceApplicable(next);
      await queryClient.invalidateQueries({ queryKey: einvoiceReadinessKeys.all });
      toast.success(
        next
          ? 'E-invoicing marked applicable — invoice surfaces will warn about manual IRP registration'
          : 'E-invoicing marked not applicable',
      );
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save e-invoicing applicability');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">GST e-Invoicing (IRN)</h2>
      <p className="mt-1 text-sm text-slate-600">
        Businesses above the government-notified aggregate-turnover threshold must register
        B2B invoices on the Invoice Registration Portal (IRP) and print the signed IRN QR code.
      </p>
      <div className="mt-5">
        <Checkbox
          label="E-invoicing is applicable to this business"
          hint="Set this once your aggregate annual turnover crosses the notified e-invoicing threshold. Confirm the current threshold with your CA."
          checked={applicable}
          disabled={isSaving}
          onChange={(e) => void onToggle(e.target.checked)}
        />
      </div>
      {applicable && (
        <div role="alert" className="mt-4 rounded-lg border border-warning/30 bg-warning-muted p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm text-warning">
              xSuite does not yet generate IRNs. Every B2B tax invoice must be registered on the
              IRP manually (portal or offline utility) and the signed QR affixed before the
              invoice is delivered to the buyer. Space for the IRN QR is reserved on the printed
              invoice.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
```

Wire into `src/pages/settings/AccountingLocales.tsx`: add `import { EInvoiceReadinessCard } from '../../components/settings/EInvoiceReadinessCard';` with the other component imports, then in the `activeTab === 'document'` panel insert the card between the closing `</SectionCard>` of "Tax & resolved locale" (line 526) and the fragment close (line 527):

```tsx
            </SectionCard>

            <EInvoiceReadinessCard />
          </>
        )}
```

- [ ] **Step 3: Run, expect PASS**

`npx vitest run src/components/settings/EInvoiceReadinessCard.test.tsx` — all green. `npm run typecheck` — 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/EInvoiceReadinessCard.tsx src/components/settings/EInvoiceReadinessCard.test.tsx src/pages/settings/AccountingLocales.tsx
git commit -m "feat(india): GST e-invoicing applicability toggle in Localization Center (Document tab)"
```

### Task L5.3: Loud warning banner on the invoice surface

**Files:**
- Create: `src/components/financial/EInvoiceReadinessBanner.tsx`
- Modify: `src/pages/financial/InvoiceDetailPage.tsx` (render the banner as the FIRST child of the `alerts` fragment at lines 778–779, above the PDF-resource alerts; add the import to the component import block, lines 1–36)
- Test: `src/components/financial/EInvoiceReadinessBanner.test.tsx` (dom project)

**Interfaces:**
- Consumes: `getEInvoiceReadiness` / `einvoiceReadinessKeys` (Task L5.1); `useTenantConfig()` (`config.regime.tax`); `DetailPageTemplate`'s `alerts` slot (existing alert markup pattern verified at `InvoiceDetailPage.tsx:778-793` — `rounded-lg border border-danger/30 bg-danger-muted p-3` shape, reused with warning tokens).
- Produces: `EInvoiceReadinessBanner: React.FC` — self-gating (null unless `regime.tax === 'in_gst'` AND flag on), so non-India tenants render byte-identically.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/financial/EInvoiceReadinessBanner.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { getEInvoiceReadiness } = vi.hoisted(() => ({ getEInvoiceReadiness: vi.fn() }));
vi.mock('../../lib/einvoiceReadinessService', () => ({ getEInvoiceReadiness }));

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: { regime: { tax: 'in_gst' } } as { regime: { tax: string } },
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useTenantConfig: () => ({ config: mockConfig }),
}));

import { EInvoiceReadinessBanner } from './EInvoiceReadinessBanner';

function renderBanner() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EInvoiceReadinessBanner />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.regime.tax = 'in_gst';
});

describe('EInvoiceReadinessBanner', () => {
  it('renders the loud warning when in_gst + flag on', async () => {
    getEInvoiceReadiness.mockResolvedValue({ applicable: true, marked_at: '2026-07-05T00:00:00.000Z' });
    renderBanner();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('manual IRP registration required');
    expect(alert.textContent).toContain('not a valid tax invoice');
  });

  it('renders nothing when the flag is off', async () => {
    getEInvoiceReadiness.mockResolvedValue({ applicable: false, marked_at: null });
    const { container } = renderBanner();
    // settle the query, then assert emptiness
    await new Promise((r) => setTimeout(r, 0));
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing (and never queries) for a non-in_gst tenant even with stale flag data', () => {
    mockConfig.regime.tax = 'simple_vat';
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
    expect(getEInvoiceReadiness).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/components/financial/EInvoiceReadinessBanner.test.tsx` — Expected: **FAIL** (module missing).

- [ ] **Step 2: Implement the banner + wire the alerts slot**

```tsx
// src/components/financial/EInvoiceReadinessBanner.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { getEInvoiceReadiness } from '../../lib/einvoiceReadinessService';
import { einvoiceReadinessKeys } from '../../lib/queryKeys';

/**
 * Loud IRN-readiness warning (Phase 4 D3): shown on invoice surfaces when the
 * tenant marked GST e-invoicing applicable. xSuite does not generate IRNs, so
 * the lab must register each B2B invoice on the IRP manually. Gated by the
 * regime.tax data key — never a country literal.
 */
export const EInvoiceReadinessBanner: React.FC = () => {
  const { config } = useTenantConfig();
  const inGst = config.regime.tax === 'in_gst';
  const { data } = useQuery({
    queryKey: einvoiceReadinessKeys.tenant(),
    queryFn: getEInvoiceReadiness,
    enabled: inGst,
  });
  if (!inGst || data?.applicable !== true) return null;
  return (
    <div role="alert" className="rounded-lg border border-warning/30 bg-warning-muted p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div className="flex-1">
          <h4 className="mb-1 text-sm font-semibold text-warning">
            E-invoicing (IRN) applies — manual IRP registration required
          </h4>
          <p className="text-sm text-warning">
            This business is marked as e-invoicing applicable, but xSuite does not yet generate
            IRNs. Register this invoice on the Invoice Registration Portal and affix the signed
            QR before delivering it to a registered (B2B) buyer — without an IRN it is not a
            valid tax invoice for an e-invoicing-mandated supplier.
          </p>
        </div>
      </div>
    </div>
  );
};
```

In `src/pages/financial/InvoiceDetailPage.tsx` add `import { EInvoiceReadinessBanner } from '../../components/financial/EInvoiceReadinessBanner';` to the import block, then make the banner the first child of the `alerts` fragment (line 778–779):

```tsx
      alerts={
        <>
          <EInvoiceReadinessBanner />
          {(translationsError || settingsError || resourceError) && (
```

- [ ] **Step 3: Run, expect PASS**

`npx vitest run src/components/financial/EInvoiceReadinessBanner.test.tsx` — all green. `npm run typecheck` — 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/financial/EInvoiceReadinessBanner.tsx src/components/financial/EInvoiceReadinessBanner.test.tsx src/pages/financial/InvoiceDetailPage.tsx
git commit -m "feat(india): loud IRN-readiness warning banner on the invoice detail surface"
```

### Task L5.4: Invoice PDF QR real-estate — reserved IRN slot caption

The invoice QR block already renders on EVERY invoice (generic verification `qrPayload` fallback, `invoiceAdapter.ts:430-436`, rendered by `sections/qr.ts` + `sections/footer.ts`), so the physical real estate exists. This task makes it an honest, labelled IRN reservation for flagged tenants: the caption names the slot as the future signed-QR position, the payload stays the generic verification QR (NEVER a fabricated IRN payload), and every unflagged tenant's output is byte-identical.

**Files:**
- Modify: `src/lib/pdf/types.ts` (`CompanySettingsData` interface at line 70 — add the optional `metadata` member; `dataFetcher.ts` already passes the full `getOrCreateCompanySettings()` row, which carries `metadata`, at e.g. :321/:550)
- Modify: `src/lib/pdf/engine/adapters/invoiceAdapter.ts` (imports ~line 18; QR block lines 430–436; `qrCaption` line 455)
- Test: `src/lib/pdf/engine/adapters/invoiceAdapter.irnReadiness.test.ts` (node project)

**Interfaces:**
- Consumes: `isEInvoiceApplicable(metadata)` from `src/lib/einvoiceReadiness.ts` (Task L5.1 — pure, so the adapter stays fixture-testable); `buildInvoiceFixture` from `src/lib/pdf/engine/invoiceParity.fixtures.ts:19`; `resolveTemplateConfigWithCountry` / `BUILT_IN_TEMPLATE_CONFIGS` from `src/lib/pdf/templateConfig.ts`; `countryTemplateOverride`, `ResolvedCountryFacts` from `src/lib/pdf/engine/countryConfig.ts:26`; `gccTaxInvoiceProfile` from `src/lib/regimes/gcc_tax_invoice` + `registerAllRegimePlugins` from `src/lib/regimes/register.ts` (ZATCA-precedence case only).
- Produces: `EngineDocData.qrCaption === 'IRN QR (reserved) — register on IRP; verification QR shown'` for flagged tenants; consumed by the existing QR surfaces unchanged.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/pdf/engine/adapters/invoiceAdapter.irnReadiness.test.ts
import { describe, it, expect } from 'vitest';
import { toEngineData } from './invoiceAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../../templateConfig';
import { countryTemplateOverride, type ResolvedCountryFacts } from '../countryConfig';
import { gccTaxInvoiceProfile } from '../../../regimes/gcc_tax_invoice';
import { registerAllRegimePlugins } from '../../../regimes/register';
import { buildInvoiceFixture } from '../invoiceParity.fixtures';
import { EINVOICE_READINESS_METADATA_KEY } from '../../../einvoiceReadiness';

const inFacts: ResolvedCountryFacts = {
  code: 'IN',
  taxSystem: 'GST',
  taxLabel: 'GST',
  taxNumberLabel: 'GSTIN',
  taxInvoiceRequired: true,
  languageCode: 'en',
  decimalPlaces: 2,
  dateFormat: 'DD/MM/YYYY',
  decimalSeparator: '.',
  thousandsSeparator: ',',
  digitGrouping: '3;2',
  einvoiceRegimeKey: 'no_einvoice', // D3: no in_irn regime exists this phase
};

const inConfig = () =>
  resolveTemplateConfigWithCountry(BUILT_IN_TEMPLATE_CONFIGS.invoice, countryTemplateOverride(inFacts));

function flaggedFixture() {
  const fixture = buildInvoiceFixture();
  fixture.companySettings = {
    ...fixture.companySettings,
    metadata: { [EINVOICE_READINESS_METADATA_KEY]: { applicable: true, marked_at: '2026-07-05T00:00:00.000Z' } },
  };
  return fixture;
}

describe('invoice PDF IRN QR real-estate (Phase 4 D3)', () => {
  it('unflagged tenants are byte-identical: default caption + generic QR', () => {
    const data = toEngineData(buildInvoiceFixture(), inConfig(), inFacts);
    expect(data.qrCaption).toBe('Scan to verify this invoice');
    expect(data.qrPayload).toContain('INVOICE:');
    expect(data.zatcaPayload).toBeNull();
  });

  it('flagged tenants get the RESERVED IRN caption — payload stays the generic verification QR, never a fabricated IRN', () => {
    const data = toEngineData(flaggedFixture(), inConfig(), inFacts);
    expect(data.qrCaption).toBe('IRN QR (reserved) — register on IRP; verification QR shown');
    expect(data.qrPayload).toContain('INVOICE:'); // still the honest verification payload
    expect(data.zatcaPayload).toBeNull();         // no e-invoice artifact is fabricated
  });

  it('a real e-invoice regime payload takes precedence over the reservation caption', () => {
    registerAllRegimePlugins();
    const zatcaFacts: ResolvedCountryFacts = { ...inFacts, code: 'SA', einvoiceRegimeKey: 'zatca_ph1' };
    const zatcaConfig = resolveTemplateConfigWithCountry(
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
      countryTemplateOverride(zatcaFacts, {
        profile: gccTaxInvoiceProfile,
        sellerRegistered: true,
        docType: 'invoice',
      }),
    );
    const fixture = flaggedFixture();
    fixture.invoiceData.seller_tax_number = '310123456700003';
    const data = toEngineData(fixture, zatcaConfig, zatcaFacts);
    expect(data.zatcaPayload).toBeTruthy();
    expect(data.qrCaption).toBe('ZATCA e-invoice QR');
  });
});
```

Run: `npx vitest run src/lib/pdf/engine/adapters/invoiceAdapter.irnReadiness.test.ts` — Expected: **FAIL** — first on TS: `metadata` is not a member of `CompanySettingsData`; after the type is added, on the caption assertion (`'Scan to verify this invoice' ≠ 'IRN QR (reserved) …'`).

- [ ] **Step 2: Implement — additive type member + adapter caption**

In `src/lib/pdf/types.ts`, add to `CompanySettingsData` (line 70, before `basic_info`):

```typescript
export interface CompanySettingsData {
  /** Raw company_settings.metadata bucket (dataFetcher passes the full row).
   *  Read via pure helpers only (e.g. isEInvoiceApplicable) — never typed here. */
  metadata?: Record<string, unknown> | null;
```

In `src/lib/pdf/engine/adapters/invoiceAdapter.ts`, add the import next to line 18:

```typescript
import { isEInvoiceApplicable } from '../../../einvoiceReadiness';
```

Replace the generic-QR block + `qrCaption` (lines 430–436 and 455):

```typescript
  // ---- Generic verification QR (fallback when no ZATCA payload) ------------
  // So the QR section/footer always renders a real, scannable code — not an
  // empty box — even for non-GCC invoices. The ZATCA TLV takes precedence when
  // the tax bar is enabled (handled by the QR surfaces' precedence).
  const qrPayload = zatcaPayload
    ? null
    : `INVOICE:${invoiceData.invoice_number || 'Draft'} TOTAL:${money(totalAmount)} DATE:${docDate(invoiceData.invoice_date)}`;

  // ---- IRN QR real-estate (Phase 4 D3, IRN-readiness only) -----------------
  // When the tenant marked GST e-invoicing applicable, the always-rendered QR
  // block is labelled as the RESERVED IRN slot. The payload stays the generic
  // verification QR — a fabricated IRN payload would be a compliance lie. A
  // real e-invoice regime artifact (zatcaPayload) always wins.
  const irnReserved = !zatcaPayload && isEInvoiceApplicable(companySettings.metadata);
```

and in the returned object:

```typescript
    qrCaption: zatcaPayload
      ? 'ZATCA e-invoice QR'
      : irnReserved
        ? 'IRN QR (reserved) — register on IRP; verification QR shown'
        : 'Scan to verify this invoice',
```

- [ ] **Step 3: Run, expect PASS + prove non-India byte-parity**

`npx vitest run src/lib/pdf/engine/adapters/invoiceAdapter.irnReadiness.test.ts` — all green.
`npx vitest run src/lib/pdf/engine` — the full engine suite incl. `complianceMatrix` snapshots and `invoiceAdapter.compliance.test.ts` passes UNCHANGED (no fixture sets the metadata flag, so every existing snapshot is byte-identical — this is the golden-parity exit gate for this task). `npm run typecheck` — 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/types.ts src/lib/pdf/engine/adapters/invoiceAdapter.ts src/lib/pdf/engine/adapters/invoiceAdapter.irnReadiness.test.ts
git commit -m "feat(india): reserved IRN QR real-estate on the invoice PDF (honest caption; non-flagged output byte-identical)"
```

### Task L5.5: INV-01 field-completeness assertion — typed field map + test (NOT a builder)

Proves, in CI, that every INV-01 v1.1 mandatory-core field the IRP will demand is already captured by xSuite's issuance data surface — so when the real `in_irn` builder ships (deferred, §7), no schema work is needed. The map is a **data module** whose source references are constrained to `keyof` the generated `Database` row types — a renamed/dropped column breaks `npm run typecheck`, and the vitest test asserts zero unmapped fields. Field names mined from the old-plan WP-8 chunk (`buildIrnPayload` envelope). No payload is ever built.

**Files:**
- Create: `src/lib/regimes/in_gst/inv01FieldMap.ts` (directory exists after WP-S3/S4)
- Test: `src/lib/regimes/in_gst/inv01Completeness.test.ts` (node project)

**Interfaces:**
- Consumes: `Database` from `src/types/database.types.ts` — verified live columns: `invoices.{invoice_number, invoice_date, invoice_type, seller_tax_number, buyer_tax_number, buyer_address, place_of_supply_subdivision_id, total_amount}` (:8617-8684), `invoice_line_items.{description, sort_order, item_code, quantity, unit_code, unit_price, total}` (:8529-8550), `document_tax_lines.{component_code, rate, taxable_base, tax_amount, tax_treatment}` (:5963-5991), `geo_subdivisions.tax_authority_code` (:7649/:7661), `legal_entity_tax_registrations` (:9459); Section 170 round-off adjustment line persisted by WP-S3 (`out_of_scope` treatment, spec §3).
- Produces: `Inv01Source` (discriminated union), `Inv01FieldEntry`, `INV01_MANDATORY_FIELDS: readonly Inv01FieldEntry[]` (39 entries) — the deferred `in_irn` builder's future input contract; also referenced by WP-S7's CA deferrals memo (IRN readiness = implemented treatment submitted for ratification is NOT claimed; this stays a named deferral).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/inv01Completeness.test.ts
// INV-01 v1.1 field-completeness ASSERTION (WP-L5, D3): xSuite's issuance data
// surface must already cover every mandatory-core INV-01 field. This is a test
// over a typed map — NOT an IRN payload builder (that is a named deferral, §7).
// Column-name existence is enforced at compile time (keyof Database rows); this
// suite enforces coverage, uniqueness, and the statutory spot-checks.
import { describe, it, expect } from 'vitest';
import { INV01_MANDATORY_FIELDS } from './inv01FieldMap';

const byField = (field: string) => INV01_MANDATORY_FIELDS.find((e) => e.field === field);

describe('INV-01 v1.1 field-completeness assertion', () => {
  it('pins the mandatory-core field count at 39', () => {
    expect(INV01_MANDATORY_FIELDS).toHaveLength(39);
  });

  it('field paths are unique', () => {
    const fields = INV01_MANDATORY_FIELDS.map((e) => e.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('every mandatory field has a real source — ZERO gaps', () => {
    const gaps = INV01_MANDATORY_FIELDS.filter((e) => e.source.kind === 'gap');
    expect(gaps.map((g) => g.field)).toEqual([]);
  });

  it('every derived source names its table.column inputs and a non-empty rule', () => {
    for (const entry of INV01_MANDATORY_FIELDS) {
      if (entry.source.kind !== 'derived') continue;
      expect(entry.source.from.length, entry.field).toBeGreaterThan(0);
      expect(entry.source.rule.length, entry.field).toBeGreaterThan(0);
      for (const ref of entry.source.from) {
        expect(ref, `${entry.field} input '${ref}'`).toMatch(/^[a-z_]+\.[a-z_]+$/);
      }
    }
  });

  it('all three GST heads are covered per line AND per document (stored amounts, never recomputed)', () => {
    for (const field of ['ItemList.IgstAmt', 'ItemList.CgstAmt', 'ItemList.SgstAmt',
                         'ValDtls.IgstVal', 'ValDtls.CgstVal', 'ValDtls.SgstVal']) {
      const entry = byField(field);
      expect(entry?.source.kind, field).toBe('tax_line_column');
      if (entry?.source.kind === 'tax_line_column') {
        expect(entry.source.column).toBe('tax_amount');
        expect(['IGST', 'CGST', 'SGST']).toContain(entry.source.componentCode);
      }
    }
  });

  it('place of supply (Pos) comes from the frozen invoice snapshot via the subdivision GST code', () => {
    expect(byField('BuyerDtls.Pos')?.source).toEqual({
      kind: 'subdivision_column',
      column: 'tax_authority_code',
      via: 'place_of_supply_subdivision_id',
    });
  });

  it('HSN/SAC and UQC come from the statutory line-item columns (S4 forcedColumns)', () => {
    expect(byField('ItemList.HsnCd')?.source).toEqual({ kind: 'line_item_column', column: 'item_code' });
    expect(byField('ItemList.Unit')?.source).toEqual({ kind: 'line_item_column', column: 'unit_code' });
  });

  it('round-off maps to the persisted Section 170 adjustment line, not a render-time recompute', () => {
    const entry = byField('ValDtls.RndOffAmt');
    expect(entry?.source.kind).toBe('derived');
    if (entry?.source.kind === 'derived') {
      expect(entry.source.from).toContain('document_tax_lines.tax_treatment');
      expect(entry.source.rule).toContain('out_of_scope');
    }
  });
});
```

Run: `npx vitest run src/lib/regimes/in_gst/inv01Completeness.test.ts` — Expected: **FAIL** (`Cannot find module './inv01FieldMap'`).

- [ ] **Step 2: Implement the typed field map**

```typescript
// src/lib/regimes/in_gst/inv01FieldMap.ts
// INV-01 v1.1 mandatory-core field map (IRN READINESS, Phase 4 D3). Each IRP
// schema field is mapped to the xSuite issuance surface that already holds it.
// Source column names are `keyof` the GENERATED Database rows, so a rename or
// drop fails `npm run typecheck`; inv01Completeness.test.ts asserts coverage.
// This module is DATA ONLY — the in_irn payload builder is a named deferral.
import type { Database } from '../../../types/database.types';

type InvoiceColumn = keyof Database['public']['Tables']['invoices']['Row'];
type LineItemColumn = keyof Database['public']['Tables']['invoice_line_items']['Row'];
type TaxLineColumn = keyof Database['public']['Tables']['document_tax_lines']['Row'];
type SubdivisionColumn = keyof Database['public']['Tables']['geo_subdivisions']['Row'];

export type Inv01Source =
  | { kind: 'constant'; value: string }
  | { kind: 'invoice_column'; column: InvoiceColumn }
  | { kind: 'line_item_column'; column: LineItemColumn }
  | { kind: 'tax_line_column'; column: TaxLineColumn; componentCode?: 'CGST' | 'SGST' | 'IGST' }
  | { kind: 'subdivision_column'; column: SubdivisionColumn; via: InvoiceColumn }
  | { kind: 'company_settings'; path: string }
  | { kind: 'derived'; from: string[]; rule: string }
  | { kind: 'gap'; note: string }; // asserted EMPTY by inv01Completeness.test.ts

export interface Inv01FieldEntry {
  field: string;
  source: Inv01Source;
}

export const INV01_MANDATORY_FIELDS: readonly Inv01FieldEntry[] = [
  { field: 'Version', source: { kind: 'constant', value: '1.1' } },
  { field: 'TranDtls.TaxSch', source: { kind: 'constant', value: 'GST' } },
  { field: 'TranDtls.SupTyp', source: { kind: 'derived', from: ['invoices.buyer_tax_number'], rule: "B2B when a buyer GSTIN is present, else B2C (e-invoicing itself applies to B2B only)" } },
  { field: 'DocDtls.Typ', source: { kind: 'derived', from: ['invoices.invoice_type'], rule: "tax invoice → 'INV'; the credit_notes table (same snapshot shape) maps to 'CRN'" } },
  { field: 'DocDtls.No', source: { kind: 'invoice_column', column: 'invoice_number' } },
  { field: 'DocDtls.Dt', source: { kind: 'derived', from: ['invoices.invoice_date'], rule: 'rendered as dd/MM/yyyy (IRP date format)' } },
  { field: 'SellerDtls.Gstin', source: { kind: 'invoice_column', column: 'seller_tax_number' } },
  { field: 'SellerDtls.LglNm', source: { kind: 'company_settings', path: 'basic_info.legal_name' } },
  { field: 'SellerDtls.Addr1', source: { kind: 'company_settings', path: 'location.address_line1' } },
  { field: 'SellerDtls.Loc', source: { kind: 'company_settings', path: 'location.city' } },
  { field: 'SellerDtls.Pin', source: { kind: 'company_settings', path: 'location.postal_code' } },
  { field: 'SellerDtls.Stcd', source: { kind: 'derived', from: ['invoices.seller_tax_number'], rule: 'GSTIN characters 1-2 (the state code is embedded in the stamped seller GSTIN)' } },
  { field: 'BuyerDtls.Gstin', source: { kind: 'invoice_column', column: 'buyer_tax_number' } },
  { field: 'BuyerDtls.LglNm', source: { kind: 'derived', from: ['invoices.buyer_address', 'customers_enhanced.customer_name', 'companies.company_name'], rule: 'issuance snapshot name, falling back to the linked customer/company record' } },
  { field: 'BuyerDtls.Addr1', source: { kind: 'derived', from: ['invoices.buyer_address'], rule: 'frozen snapshot JSON line1' } },
  { field: 'BuyerDtls.Loc', source: { kind: 'derived', from: ['invoices.buyer_address'], rule: 'frozen snapshot JSON city' } },
  { field: 'BuyerDtls.Pin', source: { kind: 'derived', from: ['invoices.buyer_address'], rule: 'frozen snapshot JSON postal_code' } },
  { field: 'BuyerDtls.Stcd', source: { kind: 'derived', from: ['invoices.buyer_tax_number', 'invoices.place_of_supply_subdivision_id'], rule: 'GSTIN characters 1-2; unregistered buyer → the place-of-supply state code (Sec 12(2), S2 derivation)' } },
  { field: 'BuyerDtls.Pos', source: { kind: 'subdivision_column', column: 'tax_authority_code', via: 'place_of_supply_subdivision_id' } },
  { field: 'ItemList.SlNo', source: { kind: 'line_item_column', column: 'sort_order' } },
  { field: 'ItemList.PrdDesc', source: { kind: 'line_item_column', column: 'description' } },
  { field: 'ItemList.IsServc', source: { kind: 'derived', from: ['invoice_line_items.item_code'], rule: "'Y' when the HSN/SAC starts with 99 (services chapter), else 'N'" } },
  { field: 'ItemList.HsnCd', source: { kind: 'line_item_column', column: 'item_code' } },
  { field: 'ItemList.Qty', source: { kind: 'line_item_column', column: 'quantity' } },
  { field: 'ItemList.Unit', source: { kind: 'line_item_column', column: 'unit_code' } },
  { field: 'ItemList.UnitPrice', source: { kind: 'line_item_column', column: 'unit_price' } },
  { field: 'ItemList.TotAmt', source: { kind: 'line_item_column', column: 'total' } },
  { field: 'ItemList.AssAmt', source: { kind: 'tax_line_column', column: 'taxable_base' } },
  { field: 'ItemList.GstRt', source: { kind: 'derived', from: ['document_tax_lines.rate'], rule: 'sum of per-line component rates (CGST 9 + SGST 9 = 18, or IGST 18) — the slab rate, never a synthetic form-rate row' } },
  { field: 'ItemList.IgstAmt', source: { kind: 'tax_line_column', column: 'tax_amount', componentCode: 'IGST' } },
  { field: 'ItemList.CgstAmt', source: { kind: 'tax_line_column', column: 'tax_amount', componentCode: 'CGST' } },
  { field: 'ItemList.SgstAmt', source: { kind: 'tax_line_column', column: 'tax_amount', componentCode: 'SGST' } },
  { field: 'ItemList.TotItemVal', source: { kind: 'derived', from: ['document_tax_lines.taxable_base', 'document_tax_lines.tax_amount'], rule: 'per-line taxable base + all stored component amounts' } },
  { field: 'ValDtls.AssVal', source: { kind: 'derived', from: ['document_tax_lines.taxable_base'], rule: 'document rollup taxable base — CGST/SGST pairs share ONE base (dedup, never doubled; the S6 GSTR seam owns the same assertion)' } },
  { field: 'ValDtls.CgstVal', source: { kind: 'tax_line_column', column: 'tax_amount', componentCode: 'CGST' } },
  { field: 'ValDtls.SgstVal', source: { kind: 'tax_line_column', column: 'tax_amount', componentCode: 'SGST' } },
  { field: 'ValDtls.IgstVal', source: { kind: 'tax_line_column', column: 'tax_amount', componentCode: 'IGST' } },
  { field: 'ValDtls.RndOffAmt', source: { kind: 'derived', from: ['document_tax_lines.tax_treatment'], rule: "the persisted Section 170 'Round off' adjustment line (out_of_scope treatment at grand total, S3) — invoice, ledger and return tie" } },
  { field: 'ValDtls.TotInvVal', source: { kind: 'invoice_column', column: 'total_amount' } },
];
```

- [ ] **Step 3: Run, expect PASS**

`npx vitest run src/lib/regimes/in_gst/inv01Completeness.test.ts` — all green. `npm run typecheck` — 0 (this is the compile-time half of the completeness proof: every `column:` literal must be a real generated-row key).

- [ ] **Step 4: Commit**

```bash
git add src/lib/regimes/in_gst/inv01FieldMap.ts src/lib/regimes/in_gst/inv01Completeness.test.ts
git commit -m "test(india): INV-01 v1.1 field-completeness assertion over the issuance data surface (39 fields, zero gaps)"
```

### Task L5.6: WP verification + PR

**Files:**
- No new files. Verification + branch push only.

**Interfaces:**
- Consumes: all Task L5.1–L5.5 outputs.
- Produces: open PR against `main` (owner merges — do NOT merge).

- [ ] **Step 1: Full typecheck**

Run `npm run typecheck` un-piped and read the output directly (the Inventory-V2 lesson: never trust a summarized pass). Expected: **0 errors**.

- [ ] **Step 2: Run the WP test set + the PDF byte-parity gate**

```bash
npx vitest run src/lib/einvoiceReadinessService.test.ts src/lib/regimes/in_gst/inv01Completeness.test.ts src/lib/pdf/engine/adapters/invoiceAdapter.irnReadiness.test.ts src/components/settings/EInvoiceReadinessCard.test.tsx src/components/financial/EInvoiceReadinessBanner.test.tsx
npx vitest run src/lib/pdf/engine
```

Expected: all green; zero snapshot updates in `src/lib/pdf/engine/__snapshots__/` (non-India/unflagged output byte-identical — spec §9.5).

- [ ] **Step 3: Push + open the PR**

```bash
git push -u origin feat/india-l5-irn-readiness
gh pr create --base main --title "WP-L5: IRN-Readiness — e-invoicing flag, loud warning, INV-01 completeness assertion, reserved QR slot" --body "## Phase 4 India Pack — WP-L5 (IRN-Readiness, D3)

**Readiness ONLY — no IRN generation.** regime.einvoice stays 'no_einvoice'; there is no in_irn plugin, no einvoice_submissions lifecycle, no IRP transport. No migration.

- **Per-tenant 'e-invoicing applicable' flag** in company_settings.metadata.einvoice_readiness (tablePrefsService pattern; owner/admin write via updateCompanySettings); pure normalizer split into src/lib/einvoiceReadiness.ts so the PDF adapter stays I/O-free.
- **Settings toggle** in Localization Center → Document tab (renders only for regime.tax='in_gst' — data key, never a country literal), with a loud in-card warning when on.
- **Loud warning banner** on the invoice detail alerts slot: 'manual IRP registration required — without an IRN it is not a valid tax invoice'.
- **INV-01 v1.1 field-completeness ASSERTION** (test, not a builder): 39 mandatory-core fields each mapped to a verified issuance-surface source; column refs are keyof the generated Database rows (typecheck-enforced), zero 'gap' entries (vitest-enforced). The in_irn builder remains a named deferral (spec §7).
- **Invoice PDF QR real-estate**: flagged tenants get the reserved-IRN caption on the always-rendered QR block; payload stays the generic verification QR (never a fabricated IRN); ZATCA regime payload keeps precedence; unflagged tenants byte-identical (full pdf/engine snapshot suite unchanged).

**Verification:** npm run typecheck = 0; WP vitest set green; npx vitest run src/lib/pdf/engine green with zero snapshot churn.

Owner merges.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: PR URL printed. Do not merge; report the URL back for the owner.

---


## Work Package WP-L6 — Rule 55 Delivery Challan [M, no migration]
Branch: `feat/india-l6-delivery-challan` (cut from `main`)
Depends on: **WP-S1b** (seeds the `delivery_challan` FY numbering-policy row — L6 adds NO numbering rows), **WP-S3** (creates `src/lib/regimes/in_gst/`), **WP-S5** (`in_fiscal_numbering` applied to the IN test tenant so `get_next_number('delivery_challan')` renders the FY template live). Independent of L1–L5. Touches neither `register.ts` nor any custody table — `chain_of_custody*` stays append-only and is only **read** (via the `case_devices.checkout_batch_id` projection `log_case_checkout` stamps).

**Scope ruling carried from the verification evidence (verify-labfit.json findings 5–6, verify-statutory.json finding 8):** challan lines come from **the specific checkout event's device set** (the `p_device_ids` batch `log_case_checkout` stamps as `case_devices.checkout_batch_id` and mirrors one-row-per-device into `chain_of_custody_transfers`), never the full `case_devices` list; **customer-owned devices only** (patient/source/donor roles; lab-supplied backup/clone/spare/target media is excluded with goods-tax-invoice guidance); the PDF renders **in triplicate** with ORIGINAL FOR CONSIGNEE / DUPLICATE FOR TRANSPORTER / TRIPLICATE FOR CONSIGNER markings; e-way bill stays manual with a ₹50,000 threshold guidance note.

---

### Task L6.1: `in_gst` delivery-challan domain helpers (pure)

**Files:**
- Create: `src/lib/regimes/in_gst/deliveryChallan.ts`
- Test: `src/lib/regimes/in_gst/deliveryChallan.test.ts` (Vitest 4, node project)

**Interfaces:**
- Consumes: `src/lib/regimes/in_gst/` directory (created in **WP-S3**: `index.ts`, `gstin.ts`, `placeOfSupply.ts` already live there when this branch is cut). Role-name vocabulary of `catalog_device_roles` as normalized by `getSimpleRoleLabel` in `src/lib/pdf/styles.ts:515-523` (patient/source, backup/clone, donor, spare — verified).
- Produces: `deliveryChallanEnabled(documentsRegimeKey)`, `isCustomerOwnedRole(roleName)`, `ewayBillGuidance(totalInr)`, constants `DELIVERY_CHALLAN_SCOPE = 'delivery_challan'`, `EWAY_BILL_THRESHOLD_INR = 50000`, `CHALLAN_NOTATION`, `LAB_SUPPLIED_GOODS_GUIDANCE`, `CHALLAN_COPY_LABELS` (3-tuple), `CHALLAN_DEFAULT_HSN = '847170'` — consumed by Tasks L6.2/L6.3/L6.5 and by WP-S7's CA package (challan sample + HSN ruling go in the ratification memo).

- [ ] **Step 1: Write the failing helper test.** Create `src/lib/regimes/in_gst/deliveryChallan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  deliveryChallanEnabled,
  isCustomerOwnedRole,
  ewayBillGuidance,
  DELIVERY_CHALLAN_SCOPE,
  EWAY_BILL_THRESHOLD_INR,
  CHALLAN_NOTATION,
  LAB_SUPPLIED_GOODS_GUIDANCE,
  CHALLAN_COPY_LABELS,
  CHALLAN_DEFAULT_HSN,
} from './deliveryChallan';

describe('deliveryChallanEnabled', () => {
  it('is data-selected by the documents regime key, never a country literal', () => {
    expect(deliveryChallanEnabled('in_gst_invoice')).toBe(true);
    expect(deliveryChallanEnabled('generic_invoice')).toBe(false);
    expect(deliveryChallanEnabled('gcc_tax_invoice')).toBe(false);
    expect(deliveryChallanEnabled(null)).toBe(false);
    expect(deliveryChallanEnabled(undefined)).toBe(false);
  });
});

describe('isCustomerOwnedRole — customer-owned devices only (verify-labfit finding 6)', () => {
  it('patient/source/donor and the NULL default intake role are customer-owned', () => {
    expect(isCustomerOwnedRole('Patient')).toBe(true);
    expect(isCustomerOwnedRole('source')).toBe(true);
    expect(isCustomerOwnedRole('Donor Drive')).toBe(true);
    expect(isCustomerOwnedRole(null)).toBe(true);
    expect(isCustomerOwnedRole(undefined)).toBe(true);
  });
  it('lab-supplied media roles are excluded: backup/clone/spare/target', () => {
    expect(isCustomerOwnedRole('Backup')).toBe(false);
    expect(isCustomerOwnedRole('clone')).toBe(false);
    expect(isCustomerOwnedRole('Spare Drive')).toBe(false);
    expect(isCustomerOwnedRole('Target')).toBe(false);
  });
});

describe('ewayBillGuidance — manual e-way with ₹50k threshold', () => {
  it('is silent under the threshold and speaks at/above it', () => {
    expect(ewayBillGuidance(49_999.99)).toBeNull();
    expect(ewayBillGuidance(EWAY_BILL_THRESHOLD_INR)).toMatch(/e-way bill/i);
    expect(ewayBillGuidance(120_000)).toMatch(/manually/i);
  });
});

describe('statutory constants', () => {
  it('numbering scope matches the S1b-seeded series', () => {
    expect(DELIVERY_CHALLAN_SCOPE).toBe('delivery_challan');
  });
  it('triplicate copy markings per Rule 55(2) (verify-statutory finding 8)', () => {
    expect(CHALLAN_COPY_LABELS).toEqual([
      'ORIGINAL FOR CONSIGNEE',
      'DUPLICATE FOR TRANSPORTER',
      'TRIPLICATE FOR CONSIGNER',
    ]);
  });
  it('notation declares a non-supply movement, never a tax invoice', () => {
    expect(CHALLAN_NOTATION).toMatch(/other than supply/i);
    expect(CHALLAN_NOTATION).toMatch(/Rule 55/);
    expect(CHALLAN_NOTATION).toMatch(/not a tax invoice/i);
  });
  it('lab-supplied guidance points at a goods tax invoice (verify-labfit finding 6)', () => {
    expect(LAB_SUPPLIED_GOODS_GUIDANCE).toMatch(/goods tax invoice/i);
  });
  it('default HSN for storage devices is pinned for the CA memo', () => {
    expect(CHALLAN_DEFAULT_HSN).toBe('847170');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './deliveryChallan'`): `npx vitest run src/lib/regimes/in_gst/deliveryChallan.test.ts`
- [ ] **Step 3: Implement the module.** Create `src/lib/regimes/in_gst/deliveryChallan.ts`:

```typescript
// Rule 55 (CGST Rules, 2017) delivery challan — pure domain helpers.
//
// The challan documents the MOVEMENT of customer-owned goods (patient/donor
// devices returned after data recovery) — transportation for reasons other
// than supply, Rule 55(1)(c). Lab-supplied media carrying recovered data IS a
// supply of goods and must go on a separate goods tax invoice, never on this
// challan (misdeclaration otherwise — verify-labfit finding 6).
//
// Everything here is pure and data-driven; the feature is selected by the
// tenant's `regime.documents` key, never by a country literal
// (eslint no-country-branching-outside-regimes).

/** number_sequences / master_numbering_policies scope of the S1b-seeded FY
 *  series (template DC/{FY}/{SEQ:4}, short-form FY per design §3, ≤16 chars).
 *  L6 adds no numbering rows — it only consumes this scope. */
export const DELIVERY_CHALLAN_SCOPE = 'delivery_challan';

const CHALLAN_DOCUMENT_PROFILES: ReadonlySet<string> = new Set(['in_gst_invoice']);

/** True when the tenant's documents regime requires Rule 55 challans at device
 *  checkout. Selected BY DATA (regime.documents), extendable per regime. */
export function deliveryChallanEnabled(documentsRegimeKey: string | null | undefined): boolean {
  return documentsRegimeKey != null && CHALLAN_DOCUMENT_PROFILES.has(documentsRegimeKey);
}

// catalog_device_roles names normalize into these families (mirrors
// getSimpleRoleLabel in src/lib/pdf/styles.ts). Lab-supplied = media the lab
// provides (backup/clone/spare/target). Everything else — patient/source,
// donor, and a NULL role (the default intake device) — is customer-owned.
// Unknown role names default to customer-owned: over-listing a device on a
// non-supply challan is harmless; silently dropping a customer device is not.
const LAB_SUPPLIED_ROLE_TOKENS = ['backup', 'clone', 'spare', 'target'] as const;

export function isCustomerOwnedRole(roleName: string | null | undefined): boolean {
  if (!roleName) return true;
  const normalized = roleName.toLowerCase();
  return !LAB_SUPPLIED_ROLE_TOKENS.some((token) => normalized.includes(token));
}

/** Rule 138 CGST — e-way bill threshold. Generation stays MANUAL (design §4-L6). */
export const EWAY_BILL_THRESHOLD_INR = 50_000;

export function ewayBillGuidance(totalDeclaredValueInr: number): string | null {
  if (totalDeclaredValueInr < EWAY_BILL_THRESHOLD_INR) return null;
  return (
    'Consignment value is \u20B950,000 or more — an e-way bill may be required for this movement. ' +
    'Generate it manually on the e-way bill portal before dispatch; xSuite does not automate e-way bills.'
  );
}

export const CHALLAN_NOTATION =
  'Goods dispatched for reasons other than supply: customer-owned device(s) returned after data ' +
  'recovery service (Rule 55(1), CGST Rules, 2017). This is not a tax invoice — no GST is charged ' +
  'on this movement.';

export const LAB_SUPPLIED_GOODS_GUIDANCE =
  'Lab-supplied delivery media handed over with recovered data is a supply of goods. Issue a ' +
  'separate goods tax invoice for it — it must not be listed on this delivery challan.';

/** Rule 55(2): the challan is prepared in triplicate, copies marked exactly so. */
export const CHALLAN_COPY_LABELS = [
  'ORIGINAL FOR CONSIGNEE',
  'DUPLICATE FOR TRANSPORTER',
  'TRIPLICATE FOR CONSIGNER',
] as const;

/** Default HSN printed for storage devices moved under this challan
 *  (8471 70 — storage units of automatic data-processing machines).
 *  Submitted for ratification in the S7 CA package alongside the challan PDF. */
export const CHALLAN_DEFAULT_HSN = '847170';
```

- [ ] **Step 4: Run again — expect PASS** (11 tests): `npx vitest run src/lib/regimes/in_gst/deliveryChallan.test.ts`
- [ ] **Step 5: Commit.** `git add src/lib/regimes/in_gst/deliveryChallan.ts src/lib/regimes/in_gst/deliveryChallan.test.ts && git commit -m "feat(l6): in_gst Rule 55 delivery challan domain helpers (customer-owned partition, e-way threshold, triplicate labels)"`

---

### Task L6.2: Challan issuance service (idempotent per checkout batch, append-only audit)

**Files:**
- Create: `src/lib/deliveryChallanService.ts`
- Test: `src/lib/deliveryChallanService.test.ts` (node)

**Interfaces:**
- Consumes: Task L6.1 exports; live RPCs `get_next_number({ p_scope: string }) → string` (`src/types/database.types.ts:18570`) and `log_case_history({ p_action, p_case_id, p_details? })` (`src/types/database.types.ts:18782-18791`; client-call precedent `src/components/cases/ClientTab.tsx:209`); live columns `case_devices.checkout_batch_id/checked_out_at/checkout_collector_*` and `case_devices.device_role_id → catalog_device_roles(id,name)` (stamped by `log_case_checkout`, `supabase/migrations/20260620180558_per_device_checkout_handover.sql:130-160`); `customers_enhanced` (`customer_name, address, address_line1, address_line2, postal_code, tax_number, mobile_number, phone` — verified in `database.types.ts`); staff-readable `case_job_history` (client-read precedent `src/lib/chainOfCustodyService.ts:1170`). **From WP-S1b/S5:** the seeded+applied `delivery_challan` FY series so `get_next_number` returns e.g. `DC/25-26/0001` on the IN tenant.
- Produces: `ChallanLineInput { deviceId: string; declaredValue: number }`, `IssuedDeliveryChallan { caseId; batchId; challanNo; issuedAt; lines: ChallanLineInput[]; totalDeclaredValue: number }`, `DevicePartition { customerOwned: Array<{id: string; roleName: string | null}>; labSupplied: Array<{id: string; roleName: string | null}> }`, functions `fetchDeviceRolePartition(deviceIds)`, `getCheckoutBatchId(deviceId)`, `issueDeliveryChallan(params)`, `getIssuedChallan(caseId, batchId)`, `fetchChallanConsignee(customerId)`, and the pure `assembleDeliveryChallanData(receipt, issued, consignee)` — consumed by Tasks L6.3 (type), L6.4 (glue), L6.5 (modal). History rows use `action = 'delivery_challan_issued'` with JSON `details {kind:'delivery_challan', batch_id, challan_no, lines:[{device_id, declared_value}], total_declared_value, issued_at}`.

- [ ] **Step 1: Write the failing service test.** Create `src/lib/deliveryChallanService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from './supabaseClient';
import {
  fetchDeviceRolePartition,
  getCheckoutBatchId,
  issueDeliveryChallan,
  getIssuedChallan,
  assembleDeliveryChallanData,
  type IssuedDeliveryChallan,
} from './deliveryChallanService';
import type { ReceiptData } from './pdf/types';

vi.mock('./supabaseClient', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

/** Minimal chainable PostgREST stub: every builder method returns itself; the
 *  chain is awaitable and resolves to `result`. */
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'maybeSingle']) {
    c[m] = vi.fn(() => c);
  }
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
  return c as never;
}

const HISTORY_ROW = {
  details: JSON.stringify({
    kind: 'delivery_challan',
    batch_id: 'batch-1',
    challan_no: 'DC/25-26/0007',
    lines: [{ device_id: 'dev-1', declared_value: 12000 }],
    total_declared_value: 12000,
    issued_at: '2026-07-05T10:00:00.000Z',
  }),
  created_at: '2026-07-05T10:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(supabase.rpc).mockReset();
  vi.mocked(supabase.from).mockReset();
});

describe('fetchDeviceRolePartition', () => {
  it('splits customer-owned from lab-supplied via catalog_device_roles', async () => {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'case_devices') {
        return chain({
          data: [
            { id: 'dev-1', device_role_id: 1 },
            { id: 'dev-2', device_role_id: 2 },
            { id: 'dev-3', device_role_id: null },
          ],
          error: null,
        });
      }
      return chain({ data: [{ id: 1, name: 'Patient' }, { id: 2, name: 'Clone' }], error: null });
    }) as never);

    const p = await fetchDeviceRolePartition(['dev-1', 'dev-2', 'dev-3']);
    expect(p.customerOwned.map((d) => d.id).sort()).toEqual(['dev-1', 'dev-3']);
    expect(p.labSupplied.map((d) => d.id)).toEqual(['dev-2']);
  });
});

describe('getCheckoutBatchId', () => {
  it('reads the batch stamped by log_case_checkout off case_devices', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      chain({ data: { checkout_batch_id: 'batch-9' }, error: null }),
    );
    expect(await getCheckoutBatchId('dev-1')).toBe('batch-9');
  });
});

describe('issueDeliveryChallan — idempotent per checkout batch', () => {
  it('allocates a number from the delivery_challan scope and appends one history row', async () => {
    vi.mocked(supabase.from).mockReturnValue(chain({ data: [], error: null })); // no prior issuance
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'get_next_number') return Promise.resolve({ data: 'DC/25-26/0007', error: null });
      return Promise.resolve({ data: undefined, error: null }); // log_case_history
    }) as never);

    const issued = await issueDeliveryChallan({
      caseId: 'case-1',
      batchId: 'batch-1',
      lines: [{ deviceId: 'dev-1', declaredValue: 12000 }],
    });

    expect(issued.challanNo).toBe('DC/25-26/0007');
    expect(issued.totalDeclaredValue).toBe(12000);
    expect(supabase.rpc).toHaveBeenCalledWith('get_next_number', { p_scope: 'delivery_challan' });
    const histCall = vi.mocked(supabase.rpc).mock.calls.find((c) => c[0] === 'log_case_history');
    expect(histCall).toBeDefined();
    const args = histCall![1] as { p_action: string; p_case_id: string; p_details: string };
    expect(args.p_action).toBe('delivery_challan_issued');
    expect(args.p_case_id).toBe('case-1');
    expect(JSON.parse(args.p_details)).toMatchObject({
      kind: 'delivery_challan',
      batch_id: 'batch-1',
      challan_no: 'DC/25-26/0007',
      lines: [{ device_id: 'dev-1', declared_value: 12000 }],
      total_declared_value: 12000,
    });
  });

  it('re-issuing the same batch returns the recorded number and consumes NO new number', async () => {
    vi.mocked(supabase.from).mockReturnValue(chain({ data: [HISTORY_ROW], error: null }));

    const issued = await issueDeliveryChallan({
      caseId: 'case-1',
      batchId: 'batch-1',
      lines: [{ deviceId: 'dev-1', declaredValue: 12000 }],
    });

    expect(issued.challanNo).toBe('DC/25-26/0007');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('refuses an empty line set', async () => {
    vi.mocked(supabase.from).mockReturnValue(chain({ data: [], error: null }));
    await expect(
      issueDeliveryChallan({ caseId: 'case-1', batchId: 'batch-1', lines: [] }),
    ).rejects.toThrow(/at least one customer-owned device/i);
  });
});

describe('getIssuedChallan', () => {
  it('finds the batch among history rows and skips malformed details', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      chain({ data: [{ details: 'not-json', created_at: 'x' }, HISTORY_ROW], error: null }),
    );
    const found = await getIssuedChallan('case-1', 'batch-1');
    expect(found?.challanNo).toBe('DC/25-26/0007');
    expect(await getIssuedChallan('case-1', 'batch-OTHER')).toBeNull();
  });
});

describe('assembleDeliveryChallanData — per-transfer device set only', () => {
  const issued: IssuedDeliveryChallan = {
    caseId: 'case-1',
    batchId: 'batch-1',
    challanNo: 'DC/25-26/0007',
    issuedAt: '2026-07-05T10:00:00.000Z',
    lines: [
      { deviceId: 'raid-1', declaredValue: 20000 },
      { deviceId: 'raid-2', declaredValue: 20000 },
      { deviceId: 'raid-3', declaredValue: 20000 },
    ],
    totalDeclaredValue: 60000,
  };

  /** 12-drive RAID case: 3 drives checked out in batch-1, 9 still in the lab,
   *  plus a lab-supplied clone handed over in the SAME batch. */
  const receipt = {
    caseData: {
      id: 'case-1', case_no: 'CASE-0042', created_at: '2026-06-01', status: 'ready',
      priority: 'high', checkout_collector_name: 'A. Kumar',
      checkout_collector_mobile: '+91 98765 43210',
    },
    devices: [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `raid-${i + 1}`,
        device_type: 'HDD', brand: 'Seagate', model: 'ST4000',
        serial_number: `SER-${i + 1}`, role: 'Patient',
        checkout_batch_id: i < 3 ? 'batch-1' : undefined,
        checkout_collector_name: i < 3 ? 'A. Kumar' : undefined,
        checkout_collector_mobile: i < 3 ? '+91 98765 43210' : undefined,
        checkout_collector_relationship: i < 3 ? 'self' : undefined,
      })),
      {
        id: 'clone-1', device_type: 'HDD', brand: 'WD', serial_number: 'CLONE-1',
        role: 'Clone', checkout_batch_id: 'batch-1',
      },
    ],
    companySettings: {},
  } as unknown as ReceiptData;

  it('itemizes ONLY the batch devices — a partial 12-drive checkout yields 3 lines', () => {
    const data = assembleDeliveryChallanData(receipt, issued, {
      name: 'Acme Films', address: '12 MG Road, Bengaluru 560001', gstin: '29ABCDE1234F1Z5', phone: null,
    });
    expect(data.lines).toHaveLength(3);
    expect(data.lines.map((l) => l.serialNumber)).toEqual(['SER-1', 'SER-2', 'SER-3']);
    expect(data.totalDeclaredValue).toBe(60000);
    expect(data.caseNo).toBe('CASE-0042');
    expect(data.challanNo).toBe('DC/25-26/0007');
    expect(data.consignee.gstin).toBe('29ABCDE1234F1Z5');
    expect(data.transport.collectorName).toBe('A. Kumar');
  });

  it('drops a lab-supplied clone even if a declared value slipped into the lines', () => {
    const withClone: IssuedDeliveryChallan = {
      ...issued,
      lines: [...issued.lines, { deviceId: 'clone-1', declaredValue: 5000 }],
      totalDeclaredValue: 65000,
    };
    const data = assembleDeliveryChallanData(receipt, withClone, {
      name: 'Acme Films', address: null, gstin: null, phone: null,
    });
    expect(data.lines.map((l) => l.serialNumber)).not.toContain('CLONE-1');
    expect(data.totalDeclaredValue).toBe(60000);
  });

  it('sets the e-way note at/above ₹50,000 total', () => {
    const data = assembleDeliveryChallanData(receipt, issued, {
      name: 'Acme Films', address: null, gstin: null, phone: null,
    });
    expect(data.ewayNote).toMatch(/e-way bill/i);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './deliveryChallanService'`): `npx vitest run src/lib/deliveryChallanService.test.ts`
- [ ] **Step 3: Implement the service.** Create `src/lib/deliveryChallanService.ts`:

```typescript
// Rule 55 delivery challan issuance — no migration, no custody writes.
//
// Statutory serial numbers must be stable per checkout event: issuance is
// idempotent per checkout batch (the uuid log_case_checkout stamps onto
// case_devices.checkout_batch_id). The issuance record is an APPEND-ONLY
// case_job_history row via the existing log_case_history RPC — reprints read
// it back instead of consuming a fresh number.

import { supabase } from './supabaseClient';
import { logger } from './logger';
import {
  DELIVERY_CHALLAN_SCOPE,
  isCustomerOwnedRole,
  ewayBillGuidance,
  CHALLAN_NOTATION,
  CHALLAN_DEFAULT_HSN,
} from './regimes/in_gst/deliveryChallan';
import type { ReceiptData } from './pdf/types';
import type { DeliveryChallanData } from './pdf/types';

export const DELIVERY_CHALLAN_ACTION = 'delivery_challan_issued';

export interface ChallanLineInput {
  deviceId: string;
  declaredValue: number;
}

export interface IssuedDeliveryChallan {
  caseId: string;
  batchId: string;
  challanNo: string;
  issuedAt: string;
  lines: ChallanLineInput[];
  totalDeclaredValue: number;
}

export interface DevicePartition {
  customerOwned: Array<{ id: string; roleName: string | null }>;
  labSupplied: Array<{ id: string; roleName: string | null }>;
}

/** Which of these case devices are customer-owned goods (challan-eligible)
 *  versus lab-supplied media (goods tax invoice territory)? */
export async function fetchDeviceRolePartition(deviceIds: string[]): Promise<DevicePartition> {
  const empty: DevicePartition = { customerOwned: [], labSupplied: [] };
  if (deviceIds.length === 0) return empty;

  const { data: deviceRows, error } = await supabase
    .from('case_devices')
    .select('id, device_role_id')
    .in('id', deviceIds)
    .is('deleted_at', null);
  if (error) throw error;

  const roleIds = [...new Set((deviceRows ?? []).map((d) => d.device_role_id).filter((r): r is number => r != null))];
  const roleNames = new Map<number, string>();
  if (roleIds.length > 0) {
    const { data: roleRows, error: roleError } = await supabase
      .from('catalog_device_roles')
      .select('id, name')
      .in('id', roleIds);
    if (roleError) throw roleError;
    for (const r of roleRows ?? []) roleNames.set(r.id, r.name);
  }

  const partition: DevicePartition = { customerOwned: [], labSupplied: [] };
  for (const d of deviceRows ?? []) {
    const roleName = d.device_role_id != null ? roleNames.get(d.device_role_id) ?? null : null;
    (isCustomerOwnedRole(roleName) ? partition.customerOwned : partition.labSupplied)
      .push({ id: d.id, roleName });
  }
  return partition;
}

/** The checkout batch log_case_checkout stamped onto this device (null if the
 *  device has not been checked out). */
export async function getCheckoutBatchId(deviceId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('case_devices')
    .select('checkout_batch_id')
    .eq('id', deviceId)
    .maybeSingle();
  if (error) throw error;
  return data?.checkout_batch_id ?? null;
}

interface ChallanHistoryDetails {
  kind: 'delivery_challan';
  batch_id: string;
  challan_no: string;
  lines: Array<{ device_id: string; declared_value: number }>;
  total_declared_value: number;
  issued_at: string;
}

function parseChallanDetails(details: string | null): ChallanHistoryDetails | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as Partial<ChallanHistoryDetails>;
    if (parsed.kind !== 'delivery_challan' || !parsed.batch_id || !parsed.challan_no) return null;
    return parsed as ChallanHistoryDetails;
  } catch {
    return null;
  }
}

/** The already-issued challan for this checkout batch, or null. */
export async function getIssuedChallan(caseId: string, batchId: string): Promise<IssuedDeliveryChallan | null> {
  const { data, error } = await supabase
    .from('case_job_history')
    .select('details, created_at')
    .eq('case_id', caseId)
    .eq('action', DELIVERY_CHALLAN_ACTION)
    .order('created_at', { ascending: true });
  if (error) throw error;

  for (const row of data ?? []) {
    const parsed = parseChallanDetails(row.details);
    if (parsed && parsed.batch_id === batchId) {
      return {
        caseId,
        batchId,
        challanNo: parsed.challan_no,
        issuedAt: parsed.issued_at,
        lines: parsed.lines.map((l) => ({ deviceId: l.device_id, declaredValue: l.declared_value })),
        totalDeclaredValue: parsed.total_declared_value,
      };
    }
  }
  return null;
}

/** Idempotent issuance: one challan number per checkout batch, recorded as an
 *  append-only case_job_history row. Never touches chain_of_custody*. */
export async function issueDeliveryChallan(params: {
  caseId: string;
  batchId: string;
  lines: ChallanLineInput[];
}): Promise<IssuedDeliveryChallan> {
  const existing = await getIssuedChallan(params.caseId, params.batchId);
  if (existing) return existing;

  if (params.lines.length === 0) {
    throw new Error('A delivery challan needs at least one customer-owned device line');
  }

  const { data: challanNo, error: numberError } = await supabase.rpc('get_next_number', {
    p_scope: DELIVERY_CHALLAN_SCOPE,
  });
  if (numberError || !challanNo) {
    throw numberError ?? new Error('Failed to allocate a delivery challan number');
  }

  const totalDeclaredValue = params.lines.reduce((sum, l) => sum + l.declaredValue, 0);
  const issuedAt = new Date().toISOString();
  const details: ChallanHistoryDetails = {
    kind: 'delivery_challan',
    batch_id: params.batchId,
    challan_no: challanNo,
    lines: params.lines.map((l) => ({ device_id: l.deviceId, declared_value: l.declaredValue })),
    total_declared_value: totalDeclaredValue,
    issued_at: issuedAt,
  };

  const { error: historyError } = await supabase.rpc('log_case_history', {
    p_case_id: params.caseId,
    p_action: DELIVERY_CHALLAN_ACTION,
    p_details: JSON.stringify(details),
  });
  if (historyError) {
    logger.error('Delivery challan number allocated but issuance record failed:', historyError);
    throw historyError;
  }

  return { caseId: params.caseId, batchId: params.batchId, challanNo, issuedAt, lines: params.lines, totalDeclaredValue };
}

/** Consignee block for the challan header, from the canonical customer table. */
export async function fetchChallanConsignee(
  customerId: string,
): Promise<{ name: string; address: string | null; gstin: string | null; phone: string | null }> {
  const { data, error } = await supabase
    .from('customers_enhanced')
    .select('customer_name, address, address_line1, address_line2, postal_code, tax_number, mobile_number, phone')
    .eq('id', customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { name: 'Customer', address: null, gstin: null, phone: null };

  const address = [data.address_line1 ?? data.address, data.address_line2, data.postal_code]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(', ');
  return {
    name: data.customer_name,
    address: address || null,
    gstin: data.tax_number ?? null,
    phone: data.mobile_number ?? data.phone ?? null,
  };
}

/** Pure assembly: challan lines are the issued batch's device set intersected
 *  with the case devices actually stamped with that checkout_batch_id, minus
 *  any lab-supplied roles (defense in depth — the UI already filters). */
export function assembleDeliveryChallanData(
  receipt: ReceiptData,
  issued: IssuedDeliveryChallan,
  consignee: { name: string; address: string | null; gstin: string | null; phone: string | null },
): DeliveryChallanData {
  const declaredByDevice = new Map(issued.lines.map((l) => [l.deviceId, l.declaredValue]));
  const batchDevices = receipt.devices.filter(
    (d) => d.checkout_batch_id === issued.batchId && declaredByDevice.has(d.id) && isCustomerOwnedRole(d.role),
  );

  const lines = batchDevices.map((d) => ({
    description: [d.device_type, d.brand, d.model].filter(Boolean).join(' ') || 'Storage device',
    hsnCode: CHALLAN_DEFAULT_HSN,
    quantity: 1,
    unitCode: 'NOS',
    serialNumber: d.serial_number ?? null,
    declaredValue: declaredByDevice.get(d.id)!,
  }));
  const totalDeclaredValue = lines.reduce((sum, l) => sum + l.declaredValue, 0);

  const first = batchDevices[0];
  return {
    challanNo: issued.challanNo,
    challanDate: issued.issuedAt,
    caseNo: receipt.caseData.case_no,
    consignee,
    transport: {
      collectorName: first?.checkout_collector_name ?? receipt.caseData.checkout_collector_name ?? null,
      collectorMobile: first?.checkout_collector_mobile ?? receipt.caseData.checkout_collector_mobile ?? null,
      relationship: first?.checkout_collector_relationship ?? null,
    },
    lines,
    totalDeclaredValue,
    ewayNote: ewayBillGuidance(totalDeclaredValue),
    notation: CHALLAN_NOTATION,
  };
}
```

- [ ] **Step 4: Add the `DeliveryChallanData` types the service references.** In `src/lib/pdf/types.ts`, insert immediately after the `CreditNoteDocumentData` interface (verified at `src/lib/pdf/types.ts:574-577`):

```typescript
export interface DeliveryChallanLine {
  description: string;
  hsnCode: string;
  quantity: number;
  unitCode: string;
  serialNumber: string | null;
  declaredValue: number;
}

export interface DeliveryChallanData {
  challanNo: string;
  /** ISO timestamp of issuance. */
  challanDate: string;
  caseNo: string;
  consignee: { name: string; address: string | null; gstin: string | null; phone: string | null };
  transport: { collectorName: string | null; collectorMobile: string | null; relationship: string | null };
  lines: DeliveryChallanLine[];
  totalDeclaredValue: number;
  ewayNote: string | null;
  notation: string;
}

export interface DeliveryChallanDocumentData {
  challanData: DeliveryChallanData;
  companySettings: CompanySettingsData;
}
```

- [ ] **Step 5: Run — expect PASS** (9 tests): `npx vitest run src/lib/deliveryChallanService.test.ts`
- [ ] **Step 6: Commit.** `git add src/lib/deliveryChallanService.ts src/lib/deliveryChallanService.test.ts src/lib/pdf/types.ts && git commit -m "feat(l6): delivery challan issuance service — idempotent per checkout batch, per-transfer device sourcing, append-only history record"`

---

### Task L6.3: Triplicate pdfmake builder

**Files:**
- Create: `src/lib/pdf/documents/DeliveryChallanDocument.ts`
- Test: `src/lib/pdf/documents/DeliveryChallanDocument.test.ts` (node)

**Interfaces:**
- Consumes: `DeliveryChallanDocumentData` (Task L6.2 / `src/lib/pdf/types.ts`); `CHALLAN_COPY_LABELS` (Task L6.1); shared PDF plumbing verified live: `PDF_COLORS`/`getStylesWithFont` (`src/lib/pdf/styles.ts`), `formatDate`/`buildCompanyAddress`/`safeString` (`src/lib/pdf/utils.ts`), `buildLogoNode` (`src/lib/pdf/brandingImage.ts`), `TranslationContext`/`createTranslationContext` (`src/lib/pdf/translationContext.ts`). Note: `\u20B9` (₹) renders in the bundled Noto/Roboto faces; WP-L1's font-verification suite covers both render paths and will assert this glyph independently.
- Produces: `buildDeliveryChallanDocument(data, ctx, logoBase64?) : TDocumentDefinitions` and `formatInr(amount: number): string` (en-IN lakh grouping — self-contained, no WP-L1 dependency) — consumed by Task L6.4.

- [ ] **Step 1: Write the failing builder test.** Create `src/lib/pdf/documents/DeliveryChallanDocument.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createTranslationContext } from '../translationContext';
import { buildDeliveryChallanDocument, formatInr } from './DeliveryChallanDocument';
import { CHALLAN_COPY_LABELS } from '../../regimes/in_gst/deliveryChallan';
import type { DeliveryChallanDocumentData } from '../types';

const ctx = createTranslationContext('english_only', null);

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

function makeData(overrides: Partial<DeliveryChallanDocumentData['challanData']> = {}): DeliveryChallanDocumentData {
  return {
    challanData: {
      challanNo: 'DC/25-26/0007',
      challanDate: '2026-07-05T10:00:00.000Z',
      caseNo: 'CASE-0042',
      consignee: { name: 'Acme Films', address: '12 MG Road, Bengaluru 560001', gstin: '29ABCDE1234F1Z5', phone: '+91 98765 43210' },
      transport: { collectorName: 'A. Kumar', collectorMobile: '+91 98765 43210', relationship: 'self' },
      lines: [
        { description: 'HDD Seagate ST4000', hsnCode: '847170', quantity: 1, unitCode: 'NOS', serialNumber: 'SER-1', declaredValue: 20000 },
        { description: 'HDD Seagate ST4000', hsnCode: '847170', quantity: 1, unitCode: 'NOS', serialNumber: 'SER-2', declaredValue: 20000 },
      ],
      totalDeclaredValue: 40000,
      ewayNote: null,
      notation: 'Goods dispatched for reasons other than supply (Rule 55(1)). This is not a tax invoice.',
      ...overrides,
    },
    companySettings: {
      basic_info: { company_name: 'Space Recovery', legal_name: 'Space Recovery Labs Pvt Ltd', vat_number: '29AAACS1234A1Z2' },
      location: { address_line1: '4 Residency Rd', city: 'Bengaluru' },
    },
  };
}

describe('buildDeliveryChallanDocument — Rule 55 triplicate', () => {
  it('renders exactly three copies, each with its statutory marking, split by two page breaks', () => {
    const doc = buildDeliveryChallanDocument(makeData(), ctx);
    const s = JSON.stringify(doc.content);
    for (const label of CHALLAN_COPY_LABELS) {
      expect(occurrences(s, label)).toBe(1);
    }
    expect(occurrences(s, 'DELIVERY CHALLAN')).toBe(3);
    expect(occurrences(s, 'DC/25-26/0007')).toBe(3);
    expect(occurrences(s, '"pageBreak":"after"')).toBe(2);
  });

  it('itemizes exactly the passed lines with serials, HSN, and declared values (3× for triplicate)', () => {
    const s = JSON.stringify(buildDeliveryChallanDocument(makeData(), ctx).content);
    expect(occurrences(s, 'SER-1')).toBe(3);
    expect(occurrences(s, 'SER-2')).toBe(3);
    expect(occurrences(s, '847170')).toBe(6); // 2 lines × 3 copies
    expect(s).toContain(formatInr(40000));
  });

  it('prints consigner GSTIN, consignee GSTIN, the non-supply notation, and case number', () => {
    const s = JSON.stringify(buildDeliveryChallanDocument(makeData(), ctx).content);
    expect(s).toContain('29AAACS1234A1Z2');
    expect(s).toContain('29ABCDE1234F1Z5');
    expect(s).toContain('other than supply');
    expect(s).toContain('CASE-0042');
  });

  it('shows the e-way note only when set', () => {
    const withNote = JSON.stringify(
      buildDeliveryChallanDocument(makeData({ ewayNote: 'E-way bill may be required — generate it manually.' }), ctx).content,
    );
    const without = JSON.stringify(buildDeliveryChallanDocument(makeData(), ctx).content);
    expect(withNote).toContain('E-way bill may be required');
    expect(without).not.toContain('E-way bill may be required');
  });
});

describe('formatInr', () => {
  it('uses Indian digit grouping with the rupee sign', () => {
    expect(formatInr(1234567.5)).toBe('\u20B912,34,567.50');
    expect(formatInr(40000)).toBe('\u20B940,000.00');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './DeliveryChallanDocument'`): `npx vitest run src/lib/pdf/documents/DeliveryChallanDocument.test.ts`
- [ ] **Step 3: Implement the builder.** Create `src/lib/pdf/documents/DeliveryChallanDocument.ts`:

```typescript
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { DeliveryChallanDocumentData, DeliveryChallanData, TranslationContext } from '../types';
import { PDF_COLORS, getStylesWithFont } from '../styles';
import { formatDate, buildCompanyAddress, safeString } from '../utils';
import { buildLogoNode } from '../brandingImage';
import { CHALLAN_COPY_LABELS } from '../../regimes/in_gst/deliveryChallan';

// Self-contained Indian grouping (3;2) — the challan is an India-only document,
// so en-IN is always correct here and this builder does not wait on WP-L1's
// general formatting work.
const INR = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatInr(amount: number): string {
  return `\u20B9${INR.format(amount)}`;
}

/**
 * Rule 55 (CGST Rules, 2017) Delivery Challan, prepared in triplicate:
 * ORIGINAL FOR CONSIGNEE / DUPLICATE FOR TRANSPORTER / TRIPLICATE FOR CONSIGNER.
 * Documents a non-supply movement (customer-owned devices returned after data
 * recovery). Never shows tax columns — no GST is charged on this movement.
 */
export function buildDeliveryChallanDocument(
  data: DeliveryChallanDocumentData,
  ctx: TranslationContext,
  logoBase64?: string | null,
): TDocumentDefinitions {
  const { challanData, companySettings } = data;
  const { fontFamily } = ctx;

  const legalName =
    companySettings.basic_info?.legal_name || companySettings.basic_info?.company_name || 'Company Name';
  const companyAddress = buildCompanyAddress(companySettings.location);
  const consignerGstin =
    companySettings.basic_info?.vat_number || companySettings.basic_info?.tax_id || null;

  const copies: Content[] = CHALLAN_COPY_LABELS.map((copyLabel, index) => {
    const copy = buildChallanCopy(challanData, copyLabel, legalName, companyAddress, consignerGstin, logoBase64);
    if (index < CHALLAN_COPY_LABELS.length - 1) {
      (copy as { pageBreak?: string }).pageBreak = 'after';
    }
    return copy;
  });

  return {
    pageSize: 'A4',
    pageMargins: [35, 30, 35, 40],
    defaultStyle: { font: fontFamily },
    styles: getStylesWithFont(fontFamily),
    content: copies,
  };
}

function buildChallanCopy(
  challan: DeliveryChallanData,
  copyLabel: string,
  legalName: string,
  companyAddress: string,
  consignerGstin: string | null,
  logoBase64?: string | null,
): Content {
  const logoNode = buildLogoNode(logoBase64, { width: 110, margin: [0, 0, 0, 4] });

  const header: Content = {
    columns: [
      {
        stack: [
          ...(logoNode ? [logoNode as Content] : []),
          { text: legalName, fontSize: 13, bold: true, color: PDF_COLORS.text },
          { text: companyAddress, fontSize: 8, color: PDF_COLORS.textLight, lineHeight: 1.1 },
          ...(consignerGstin
            ? [{ text: `GSTIN: ${consignerGstin}`, fontSize: 8, bold: true, color: PDF_COLORS.text, margin: [0, 2, 0, 0] as [number, number, number, number] }]
            : []),
        ],
        width: '*',
      },
      {
        stack: [
          {
            table: { widths: ['auto'], body: [[{ text: copyLabel, fontSize: 8, bold: true, color: PDF_COLORS.text, margin: [8, 3, 8, 3] }]] },
            layout: {
              hLineWidth: () => 0.75,
              vLineWidth: () => 0.75,
              hLineColor: () => PDF_COLORS.border,
              vLineColor: () => PDF_COLORS.border,
            },
            alignment: 'right',
          },
          { text: 'DELIVERY CHALLAN', fontSize: 15, bold: true, color: PDF_COLORS.primaryDark, alignment: 'right', margin: [0, 6, 0, 0] },
          { text: 'Rule 55 — CGST Rules, 2017', fontSize: 8, color: PDF_COLORS.textLight, alignment: 'right' },
        ],
        width: 'auto',
      },
    ],
    margin: [0, 0, 0, 10],
  };

  const metaRow = (label: string, value: string | null | undefined): Content => ({
    columns: [
      { text: label, fontSize: 8, color: PDF_COLORS.textLight, width: 80 },
      { text: safeString(value), fontSize: 9, color: PDF_COLORS.text, width: '*' },
    ],
    margin: [0, 0, 0, 2],
  });

  const partiesSection: Content = {
    columns: [
      {
        width: '50%',
        stack: [
          { text: 'Consignee (Customer)', fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
          metaRow('Name:', challan.consignee.name),
          metaRow('Address:', challan.consignee.address),
          metaRow('GSTIN:', challan.consignee.gstin ?? 'Unregistered'),
          metaRow('Phone:', challan.consignee.phone),
        ],
      },
      { width: 10, text: '' },
      {
        width: '50%',
        stack: [
          { text: 'Challan Details', fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
          metaRow('Challan No:', challan.challanNo),
          metaRow('Date:', formatDate(challan.challanDate, 'dd MMM yyyy, HH:mm')),
          metaRow('Case No:', challan.caseNo),
          metaRow('Collected By:', challan.transport.collectorName),
          metaRow('Mobile:', challan.transport.collectorMobile),
          ...(challan.transport.relationship && challan.transport.relationship !== 'self'
            ? [metaRow('Relationship:', challan.transport.relationship.replace(/_/g, ' '))]
            : []),
        ],
      },
    ],
    margin: [0, 0, 0, 10],
  };

  const th = (text: string, alignment: 'left' | 'right' = 'left'): TableCell => ({
    text, fontSize: 8, bold: true, fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment, margin: [2, 3, 2, 3],
  });
  const td = (text: string, alignment: 'left' | 'right' = 'left'): TableCell => ({
    text, fontSize: 8, color: PDF_COLORS.text, alignment, margin: [2, 3, 2, 3],
  });

  const tableBody: TableCell[][] = [
    [th('#'), th('Description of Goods'), th('HSN'), th('Qty (UQC)'), th('Serial No.'), th('Declared Value', 'right')],
    ...challan.lines.map((line, i) => [
      td(String(i + 1)),
      td(line.description),
      td(line.hsnCode),
      td(`${line.quantity} ${line.unitCode}`),
      td(safeString(line.serialNumber)),
      td(formatInr(line.declaredValue), 'right'),
    ]),
    [
      { text: 'Total Declared Value', colSpan: 5, fontSize: 8, bold: true, color: PDF_COLORS.text, alignment: 'right', margin: [2, 3, 2, 3] },
      {}, {}, {}, {},
      { text: formatInr(challan.totalDeclaredValue), fontSize: 8, bold: true, color: PDF_COLORS.text, alignment: 'right', margin: [2, 3, 2, 3] },
    ],
  ];

  const goodsTable: Content = {
    table: { headerRows: 1, widths: [14, '*', 42, 48, 95, 75], body: tableBody },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
    },
    margin: [0, 0, 0, 8],
  };

  const notationSection: Content = {
    stack: [
      { text: challan.notation, fontSize: 7.5, color: PDF_COLORS.textLight, lineHeight: 1.2 },
      ...(challan.ewayNote
        ? [{ text: challan.ewayNote, fontSize: 7.5, bold: true, color: PDF_COLORS.text, lineHeight: 1.2, margin: [0, 4, 0, 0] as [number, number, number, number] }]
        : []),
    ],
    margin: [0, 0, 0, 14],
  };

  const signatureBox = (title: string): Content => ({
    width: '50%',
    stack: [
      { text: title, fontSize: 9, bold: true, color: PDF_COLORS.text, alignment: 'center', margin: [0, 0, 0, 4] },
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 230, h: 42, lineWidth: 0.5, lineColor: PDF_COLORS.border }], margin: [0, 0, 0, 2] },
      { text: 'Signature & Date', fontSize: 7.5, color: PDF_COLORS.textLight, alignment: 'center' },
    ],
  });

  const signatures: Content = {
    columns: [signatureBox('Received by (Consignee/Collector)'), { width: 20, text: '' }, signatureBox(`For ${legalName} — Authorised Signatory`)],
    margin: [0, 4, 0, 0],
  };

  return { stack: [header, partiesSection, goodsTable, notationSection, signatures] };
}
```

- [ ] **Step 4: Run — expect PASS** (6 tests): `npx vitest run src/lib/pdf/documents/DeliveryChallanDocument.test.ts`
- [ ] **Step 5: Commit.** `git add src/lib/pdf/documents/DeliveryChallanDocument.ts src/lib/pdf/documents/DeliveryChallanDocument.test.ts && git commit -m "feat(l6): triplicate Rule 55 delivery challan pdfmake builder (copy markings, HSN/UQC/serial lines, non-supply notation, e-way note)"`

---

### Task L6.4: pdfService glue + print route

**Files:**
- Create: `src/pages/print/PrintDeliveryChallanPage.tsx`
- Modify: `src/lib/pdf/pdfService.ts` (insert after `generateCheckoutForm`, which ends at line 784 — verified), `src/App.tsx` (print-route block, after the `/print/checkout/:caseId` route at line 121 — verified)
- Test: `src/pages/print/PrintDeliveryChallanPage.test.tsx` (jsdom)

**Interfaces:**
- Consumes: `getIssuedChallan`, `assembleDeliveryChallanData`, `fetchChallanConsignee` (Task L6.2); `buildDeliveryChallanDocument` (Task L6.3); existing pdfService internals verified in-file: `fetchReceiptData`, `initializePDFFonts`, `createTranslationContext`, `loadImageAsBase64`, `createPdfWithFonts`, `PDFGenerationResult` (all already imported/defined in `pdfService.ts` — see `generateCheckoutForm` at `src/lib/pdf/pdfService.ts:732-784`); `page(...)` lazy-route helper in `App.tsx`.
- Produces: `generateDeliveryChallan(caseId: string, batchId: string, download?: boolean): Promise<PDFGenerationResult>`; route `/print/delivery-challan/:caseId/:batchId` — consumed by Task L6.5.

- [ ] **Step 1: Write the failing print-page test.** Create `src/pages/print/PrintDeliveryChallanPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PrintDeliveryChallanPage from './PrintDeliveryChallanPage';
import { generateDeliveryChallan } from '../../lib/pdf/pdfService';

vi.mock('../../lib/pdf/pdfService', () => ({
  generateDeliveryChallan: vi.fn(() => Promise.resolve({ success: true })),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/print/delivery-challan/:caseId/:batchId" element={<PrintDeliveryChallanPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PrintDeliveryChallanPage', () => {
  beforeEach(() => vi.mocked(generateDeliveryChallan).mockClear());

  it('generates the challan for the route case + checkout batch', async () => {
    renderAt('/print/delivery-challan/case-1/batch-1');
    await waitFor(() =>
      expect(generateDeliveryChallan).toHaveBeenCalledWith('case-1', 'batch-1', false),
    );
    expect(await screen.findByText(/PDF Ready/i)).toBeTruthy();
  });

  it('surfaces a generation failure', async () => {
    vi.mocked(generateDeliveryChallan).mockResolvedValueOnce({
      success: false,
      error: 'No delivery challan has been issued for this checkout',
    });
    renderAt('/print/delivery-challan/case-1/batch-x');
    expect(await screen.findByText(/No delivery challan has been issued/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './PrintDeliveryChallanPage'`): `npx vitest run src/pages/print/PrintDeliveryChallanPage.test.tsx`
- [ ] **Step 3: Add the pdfService glue.** In `src/lib/pdf/pdfService.ts`, add these imports next to the existing document-builder imports at the top of the file, then insert the function directly after `generateCheckoutForm` (after line 784):

```typescript
// with the other builder/service imports at the top of pdfService.ts:
import { buildDeliveryChallanDocument } from './documents/DeliveryChallanDocument';
import { getIssuedChallan, assembleDeliveryChallanData, fetchChallanConsignee } from '../deliveryChallanService';
```

```typescript
export async function generateDeliveryChallan(
  caseId: string,
  batchId: string,
  download: boolean = true,
): Promise<PDFGenerationResult> {
  try {
    const data = await fetchReceiptData(caseId);

    const issued = await getIssuedChallan(caseId, batchId);
    if (!issued) {
      return { success: false, error: 'No delivery challan has been issued for this checkout' };
    }

    const consignee = data.caseData.customer_id
      ? await fetchChallanConsignee(data.caseData.customer_id)
      : {
          name: data.caseData.customer?.customer_name || data.caseData.contact_name || 'Customer',
          address: null,
          gstin: null,
          phone: data.caseData.contact_phone ?? null,
        };
    const challanData = assembleDeliveryChallanData(data, issued, consignee);

    const languageSettings = data.companySettings.localization?.document_language_settings;
    let languageCode: LanguageCode | null = (languageSettings?.secondary_language as LanguageCode) || null;
    const fontsLoaded = await initializePDFFonts(languageCode);
    if (!fontsLoaded && languageCode) {
      languageCode = null;
    }
    // The Rule 55 challan is an English statutory document; only the font family
    // is taken from the translation context.
    const ctx = createTranslationContext('english_only', languageCode);

    const logoBase64 = data.companySettings.branding?.logo_url
      ? await loadImageAsBase64(data.companySettings.branding.logo_url)
      : null;

    const docDefinition = buildDeliveryChallanDocument(
      { challanData, companySettings: data.companySettings },
      ctx,
      logoBase64,
    );

    const filename = `Delivery_Challan_${issued.challanNo.replace(/\//g, '-')}.pdf`;
    if (download) {
      createPdfWithFonts(docDefinition).download(filename);
    } else {
      createPdfWithFonts(docDefinition).open();
    }
    return { success: true };
  } catch (error) {
    console.error('Error generating delivery challan:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate delivery challan',
    };
  }
}
```

- [ ] **Step 4: Create the print page.** Create `src/pages/print/PrintDeliveryChallanPage.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { generateDeliveryChallan } from '../../lib/pdf/pdfService';
import { Printer, X, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export const PrintDeliveryChallanPage = () => {
  const { caseId, batchId } = useParams<{ caseId: string; batchId: string }>();
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, batch: string) => {
    setIsGenerating(true);
    setError(null);
    const result = await generateDeliveryChallan(id, batch, false);
    if (!result.success) setError(result.error || 'Failed to generate PDF');
    setIsGenerating(false);
  };

  useEffect(() => {
    if (!caseId || !batchId) {
      setError('Invalid delivery challan reference');
      setIsGenerating(false);
      return;
    }
    void run(caseId, batchId);
  }, [caseId, batchId]);

  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        {isGenerating ? (
          <>
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Generating PDF</h2>
            <p className="text-slate-600">Preparing the Rule 55 delivery challan (triplicate)...</p>
          </>
        ) : error ? (
          <>
            <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Generation Failed</h2>
            <p className="text-slate-600 mb-6">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => caseId && batchId && void run(caseId, batchId)}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
              <button
                onClick={handleClose}
                className="flex items-center gap-2 px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <Printer className="w-16 h-16 text-success mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">PDF Ready</h2>
            <p className="text-slate-600 mb-6">The delivery challan has been generated and opened.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => caseId && batchId && generateDeliveryChallan(caseId, batchId, true)}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={handleClose}
                className="flex items-center gap-2 px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PrintDeliveryChallanPage;
```

- [ ] **Step 5: Register the route.** In `src/App.tsx`, directly after the checkout print route (line 121), add:

```tsx
          <Route path="/print/delivery-challan/:caseId/:batchId" lazy={page(() => import('./pages/print/PrintDeliveryChallanPage'), 'PrintDeliveryChallanPage')} />
```

- [ ] **Step 6: Run — expect PASS** (2 tests): `npx vitest run src/pages/print/PrintDeliveryChallanPage.test.tsx`
- [ ] **Step 7: Commit.** `git add src/lib/pdf/pdfService.ts src/pages/print/PrintDeliveryChallanPage.tsx src/pages/print/PrintDeliveryChallanPage.test.tsx src/App.tsx && git commit -m "feat(l6): generateDeliveryChallan pdfService glue + /print/delivery-challan/:caseId/:batchId route"`

---

### Task L6.5: Checkout-flow integration (declared values, lab-supplied guidance, issuance)

**Files:**
- Modify: `src/components/cases/DeviceCheckoutModal.tsx` (props interface lines 34-44; state block lines 57-70; `handleSubmit` lines 93-146; form JSX — insert the challan section between the recovery-outcome block ending at line 302 and the hint paragraph at line 304; `handleClose` lines 148-159), `src/pages/cases/CaseDetail.tsx` (import block line 23; `DeviceCheckoutModal` usage lines 507-521)
- Test: `src/components/cases/DeviceCheckoutModal.challan.test.tsx` (jsdom)

**Interfaces:**
- Consumes: `deliveryChallanEnabled`, `EWAY_BILL_THRESHOLD_INR`, `ewayBillGuidance`, `LAB_SUPPLIED_GOODS_GUIDANCE` (Task L6.1); `fetchDeviceRolePartition`, `getCheckoutBatchId`, `issueDeliveryChallan` (Task L6.2); route from Task L6.4; `useTenantConfig().config.regime.documents` (`src/contexts/TenantConfigContext.tsx:121`, `RegimeConfig` in `src/types/tenantConfig.ts:43-49`); live `log_case_checkout` 7-arg RPC (unchanged).
- Produces: `DeviceCheckoutModalProps.challanEnabled?: boolean`; the checkout UX contract: on an `in_gst_invoice` tenant, one checkout batch ⇒ exactly one issued challan opened at `/print/delivery-challan/{caseId}/{batchId}`; challan-issuance failure never rolls back or re-runs the custody-stamped checkout (retry re-runs issuance only).

- [ ] **Step 1: Write the failing modal test.** Create `src/components/cases/DeviceCheckoutModal.challan.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeviceCheckoutModal } from './DeviceCheckoutModal';
import { supabase } from '../../lib/supabaseClient';
import {
  fetchDeviceRolePartition,
  getCheckoutBatchId,
  issueDeliveryChallan,
} from '../../lib/deliveryChallanService';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn(() => Promise.resolve({ error: null })) },
}));
vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../../lib/deliveryChallanService', () => ({
  fetchDeviceRolePartition: vi.fn(() =>
    Promise.resolve({
      customerOwned: [{ id: 'dev-1', roleName: 'Patient' }],
      labSupplied: [{ id: 'dev-2', roleName: 'Clone' }],
    }),
  ),
  getCheckoutBatchId: vi.fn(() => Promise.resolve('batch-1')),
  issueDeliveryChallan: vi.fn(() =>
    Promise.resolve({
      caseId: 'case-1', batchId: 'batch-1', challanNo: 'DC/25-26/0007',
      issuedAt: '2026-07-05T10:00:00.000Z',
      lines: [{ deviceId: 'dev-1', declaredValue: 60000 }], totalDeclaredValue: 60000,
    }),
  ),
}));

const devices = [
  { id: 'dev-1', device_type: { name: 'HDD' }, brand: { name: 'Seagate' }, model: 'ST4000', serial_number: 'SER-1' },
  { id: 'dev-2', device_type: { name: 'HDD' }, brand: { name: 'WD' }, model: 'Clone', serial_number: 'CLONE-1' },
];

function renderModal(challanEnabled: boolean) {
  render(
    <DeviceCheckoutModal
      isOpen
      onClose={vi.fn()}
      caseId="case-1"
      caseNumber="CASE-0042"
      devices={devices}
      customerName="Acme"
      customerMobileNumber="12345"
      onCheckoutComplete={vi.fn()}
      onShowCheckoutPreview={vi.fn()}
      challanEnabled={challanEnabled}
    />,
  );
}

function selectDevice(serial: string) {
  fireEvent.click(screen.getByText(new RegExp(serial)).closest('label')!.querySelector('input')!);
}

describe('DeviceCheckoutModal — Rule 55 challan integration', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockClear();
    vi.mocked(issueDeliveryChallan).mockClear();
    vi.mocked(getCheckoutBatchId).mockClear();
    vi.spyOn(window, 'open').mockReturnValue(null);
  });

  it('shows no challan section when the regime does not require one', async () => {
    renderModal(false);
    selectDevice('SER-1');
    expect(screen.queryByText(/Delivery Challan/i)).toBeNull();
  });

  it('requires a declared value per selected customer-owned device before checkout', async () => {
    renderModal(true);
    selectDevice('SER-1');
    await screen.findByText(/Delivery Challan \(Rule 55\)/i);
    fireEvent.click(screen.getByRole('button', { name: /Print Checkout Form/i }));
    expect(await screen.findByText(/declared value/i)).toBeTruthy();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('checks out, issues ONE challan for the batch, and opens the challan print route', async () => {
    renderModal(true);
    selectDevice('SER-1');
    await screen.findByText(/Delivery Challan \(Rule 55\)/i);
    fireEvent.change(screen.getByPlaceholderText(/Declared value/i), { target: { value: '60000' } });
    fireEvent.click(screen.getByRole('button', { name: /Print Checkout Form/i }));

    await waitFor(() => expect(issueDeliveryChallan).toHaveBeenCalledTimes(1));
    expect(supabase.rpc).toHaveBeenCalledWith('log_case_checkout', expect.objectContaining({ p_device_ids: ['dev-1'] }));
    expect(getCheckoutBatchId).toHaveBeenCalledWith('dev-1');
    expect(issueDeliveryChallan).toHaveBeenCalledWith({
      caseId: 'case-1',
      batchId: 'batch-1',
      lines: [{ deviceId: 'dev-1', declaredValue: 60000 }],
    });
    expect(window.open).toHaveBeenCalledWith('/print/delivery-challan/case-1/batch-1', '_blank');
  });

  it('excludes a lab-supplied clone from challan lines and shows the goods-invoice guidance', async () => {
    renderModal(true);
    selectDevice('SER-1');
    selectDevice('CLONE-1');
    await screen.findByText(/supply of goods/i); // LAB_SUPPLIED_GOODS_GUIDANCE
    // Only the customer-owned device gets a declared-value input.
    expect(screen.getAllByPlaceholderText(/Declared value/i)).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText(/Declared value/i), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: /Print Checkout Form/i }));
    await waitFor(() => expect(issueDeliveryChallan).toHaveBeenCalled());
    expect(issueDeliveryChallan).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [{ deviceId: 'dev-1', declaredValue: 20000 }] }),
    );
  });

  it('shows the manual e-way guidance when declared total reaches ₹50,000', async () => {
    renderModal(true);
    selectDevice('SER-1');
    await screen.findByText(/Delivery Challan \(Rule 55\)/i);
    fireEvent.change(screen.getByPlaceholderText(/Declared value/i), { target: { value: '50000' } });
    expect(await screen.findByText(/e-way bill/i)).toBeTruthy();
  });

  it('challan failure keeps the modal open for an issuance-only retry — checkout is never re-run', async () => {
    vi.mocked(issueDeliveryChallan)
      .mockRejectedValueOnce(new Error('numbering unavailable'))
      .mockResolvedValueOnce({
        caseId: 'case-1', batchId: 'batch-1', challanNo: 'DC/25-26/0007',
        issuedAt: '2026-07-05T10:00:00.000Z',
        lines: [{ deviceId: 'dev-1', declaredValue: 60000 }], totalDeclaredValue: 60000,
      });
    renderModal(true);
    selectDevice('SER-1');
    await screen.findByText(/Delivery Challan \(Rule 55\)/i);
    fireEvent.change(screen.getByPlaceholderText(/Declared value/i), { target: { value: '60000' } });
    fireEvent.click(screen.getByRole('button', { name: /Print Checkout Form/i }));

    expect(await screen.findByText(/challan could not be issued/i)).toBeTruthy();
    const checkoutCalls = vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === 'log_case_checkout').length;

    fireEvent.click(screen.getByRole('button', { name: /Retry Delivery Challan/i }));
    await waitFor(() => expect(issueDeliveryChallan).toHaveBeenCalledTimes(2));
    expect(
      vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === 'log_case_checkout').length,
    ).toBe(checkoutCalls); // custody-stamped checkout ran exactly once
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (unknown prop `challanEnabled`, no challan section rendered): `npx vitest run src/components/cases/DeviceCheckoutModal.challan.test.tsx`
- [ ] **Step 3: Extend the modal.** In `src/components/cases/DeviceCheckoutModal.tsx`:

(a) Replace the react import (line 1) and lucide import (line 5), and add service/domain imports:

```tsx
import React, { useEffect, useId, useRef, useState } from 'react';
import { Package, User, Phone, CreditCard, Printer, FileText } from 'lucide-react';
import {
  fetchDeviceRolePartition,
  getCheckoutBatchId,
  issueDeliveryChallan,
} from '../../lib/deliveryChallanService';
import {
  ewayBillGuidance,
  LAB_SUPPLIED_GOODS_GUIDANCE,
} from '../../lib/regimes/in_gst/deliveryChallan';
```

(b) Add to `DeviceCheckoutModalProps` (after `onShowCheckoutPreview?: () => void;`, line 43):

```tsx
  /** True when the tenant's documents regime requires a Rule 55 delivery
   *  challan at device checkout (deliveryChallanEnabled(regime.documents)). */
  challanEnabled?: boolean;
```

and destructure `challanEnabled = false,` in the component signature.

(c) Add state after the existing state block (after line 64):

```tsx
  const [declaredValues, setDeclaredValues] = useState<Record<string, string>>({});
  const [labSuppliedIds, setLabSuppliedIds] = useState<string[]>([]);
  const [checkoutDone, setCheckoutDone] = useState(false);
```

and the partition effect after the id hooks (after line 70):

```tsx
  useEffect(() => {
    if (!challanEnabled || !isOpen || selectedDevices.length === 0) {
      setLabSuppliedIds([]);
      return;
    }
    let cancelled = false;
    fetchDeviceRolePartition(selectedDevices)
      .then((p) => {
        if (!cancelled) setLabSuppliedIds(p.labSupplied.map((d) => d.id));
      })
      .catch((e) => {
        // Fail open to customer-owned: over-listing on a non-supply challan is
        // harmless; silently dropping a customer device is not.
        if (!cancelled) {
          setLabSuppliedIds([]);
          logger.error('Device role partition failed:', e);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [challanEnabled, isOpen, selectedDevices]);

  const challanEligibleSelected = selectedDevices.filter((id) => !labSuppliedIds.includes(id));
  const declaredTotal = challanEligibleSelected.reduce(
    (sum, id) => sum + (parseFloat(declaredValues[id] ?? '') || 0),
    0,
  );
  const ewayNote = challanEnabled ? ewayBillGuidance(declaredTotal) : null;
```

(d) Replace the body of `handleSubmit` (lines 93-146) with:

```tsx
  const runChallanIssuance = async (): Promise<string> => {
    const challanLines = challanEligibleSelected.map((id) => ({
      deviceId: id,
      declaredValue: parseFloat(declaredValues[id]),
    }));
    const batchId = await getCheckoutBatchId(selectedDevices[0]);
    if (!batchId) throw new Error('Checkout batch not found for the delivery challan');
    await issueDeliveryChallan({ caseId, batchId, lines: challanLines });
    return batchId;
  };

  const handleSubmit = async () => {
    if (!checkoutDone) {
      if (selectedDevices.length === 0) {
        setError('Please select at least one device');
        return;
      }
      if (!collectorName.trim() || !collectorMobile.trim()) {
        setError('Collector name and mobile number are required');
        return;
      }
      if (relationship !== 'self' && !collectorId.trim()) {
        setError('A National ID / passport is required when someone collects on behalf of the customer.');
        return;
      }
    }

    if (
      challanEnabled &&
      challanEligibleSelected.some((id) => !(parseFloat(declaredValues[id] ?? '') > 0))
    ) {
      setError('Enter a declared value (INR) for every customer-owned device — the Rule 55 delivery challan requires it.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (!checkoutDone) {
        const { error: dbError } = await supabase.rpc('log_case_checkout', {
          p_case_id: caseId,
          p_collector_name: collectorName.trim(),
          p_collector_mobile: collectorMobile.trim(),
          p_collector_id: collectorId.trim() || undefined,
          p_recovery_outcome: recoveryOutcome,
          p_device_ids: selectedDevices,
          p_collector_relationship: relationship,
        });
        if (dbError) throw dbError;
        setCheckoutDone(true);
        onCheckoutComplete();
      }

      if (challanEnabled && challanEligibleSelected.length > 0) {
        try {
          const batchId = await runChallanIssuance();
          window.open(`/print/delivery-challan/${caseId}/${batchId}`, '_blank');
        } catch (challanErr) {
          logger.error('Delivery challan issuance failed after checkout:', challanErr);
          const msg =
            challanErr instanceof Error ? challanErr.message : 'unknown error';
          setError(
            `Devices are checked out and custody is recorded, but the delivery challan could not be issued: ${msg}. ` +
              'Retry below — closing this dialog will skip automatic challan issuance.',
          );
          return;
        }
      }

      onClose();
      setTimeout(() => {
        if (onShowCheckoutPreview) {
          onShowCheckoutPreview();
        } else {
          window.open(`/print/checkout/${caseId}`, '_blank');
        }
      }, 500);
    } catch (err) {
      logger.error('Error during checkout:', err);
      const dbMessage =
        err && typeof err === 'object' && 'message' in err &&
        typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : null;
      setError(dbMessage ? `Checkout failed: ${dbMessage}` : 'Failed to complete checkout. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
```

(e) In `handleClose` (lines 148-159), add resets alongside the existing ones:

```tsx
      setDeclaredValues({});
      setLabSuppliedIds([]);
      setCheckoutDone(false);
```

(f) Insert the challan section between the recovery-outcome `</div>` (line 302) and the closing-hint `<p>` (line 304):

```tsx
        {challanEnabled && selectedDevices.length > 0 && (
          <div className="bg-warning-muted border border-warning/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-warning-foreground font-semibold">
              <FileText className="w-5 h-5" />
              <span>Delivery Challan (Rule 55)</span>
            </div>
            <p className="text-xs text-slate-600">
              Customer-owned devices leaving the lab move under a Rule 55 delivery challan
              (printed in triplicate). Enter each device's declared goods value — this is a
              transit value declaration, not a charge.
            </p>
            {devices
              .filter((d) => selectedDevices.includes(d.id) && !labSuppliedIds.includes(d.id))
              .map((device) => (
                <div key={device.id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-slate-700">
                    {device.device_type?.name || 'Device'}
                    {device.serial_number ? ` · S/N ${device.serial_number}` : ''}
                  </span>
                  <label className="sr-only" htmlFor={`challan-value-${device.id}`}>
                    Declared value for {device.serial_number || device.id}
                  </label>
                  <Input
                    id={`challan-value-${device.id}`}
                    type="number"
                    min="1"
                    step="0.01"
                    value={declaredValues[device.id] ?? ''}
                    onChange={(e) =>
                      setDeclaredValues((prev) => ({ ...prev, [device.id]: e.target.value }))
                    }
                    placeholder="Declared value (INR)"
                    className="w-44"
                  />
                </div>
              ))}
            {labSuppliedIds.some((id) => selectedDevices.includes(id)) && (
              <p className="text-xs text-warning-foreground font-medium">
                {LAB_SUPPLIED_GOODS_GUIDANCE}
              </p>
            )}
            {ewayNote && <p className="text-xs text-slate-600">{ewayNote}</p>}
          </div>
        )}
```

(g) Make the submit button label reflect the retry state — replace the `Print Checkout Form` span (lines 335-338) content with:

```tsx
              <span className="flex items-center gap-2">
                <Printer className="w-4 h-4" />
                {checkoutDone ? 'Retry Delivery Challan' : 'Print Checkout Form'}
              </span>
```

- [ ] **Step 4: Run the challan modal test AND the existing modal regression — expect PASS** (6 new + existing green): `npx vitest run src/components/cases/DeviceCheckoutModal.challan.test.tsx src/components/cases/DeviceCheckoutModal.test.tsx`
- [ ] **Step 5: Wire CaseDetail.** In `src/pages/cases/CaseDetail.tsx`: change line 23 to `import { useTenantFeatures, useTenantConfig } from '../../contexts/TenantConfigContext';`, add `import { deliveryChallanEnabled } from '../../lib/regimes/in_gst/deliveryChallan';` to the import block, add `const { config: tenantConfig } = useTenantConfig();` beside the existing hooks, and pass one new prop at the modal usage (insert after line 515):

```tsx
              challanEnabled={deliveryChallanEnabled(tenantConfig.regime.documents)}
```

- [ ] **Step 6: Commit.** `git add src/components/cases/DeviceCheckoutModal.tsx src/components/cases/DeviceCheckoutModal.challan.test.tsx src/pages/cases/CaseDetail.tsx && git commit -m "feat(l6): checkout flow issues Rule 55 challan per batch — declared values, lab-supplied goods guidance, e-way note, issuance-only retry"`

---

### Task L6.6: WP verification + PR

**Files:**
- Test: all WP-L6 test paths (below); no new files.

**Interfaces:**
- Consumes: everything above.
- Produces: PR `feat/india-l6-delivery-challan` → `main` (owner merges, per D8 — do NOT merge).

- [ ] **Step 1: Full typecheck — expect 0 errors:** `npm run typecheck`
- [ ] **Step 2: Run the WP test suite — expect all green:** `npx vitest run src/lib/regimes/in_gst/deliveryChallan.test.ts src/lib/deliveryChallanService.test.ts src/lib/pdf/documents/DeliveryChallanDocument.test.ts src/pages/print/PrintDeliveryChallanPage.test.tsx src/components/cases/DeviceCheckoutModal.challan.test.tsx src/components/cases/DeviceCheckoutModal.test.tsx`
- [ ] **Step 3: Guard-rail sweep — confirm no custody/numbering writes leaked in:** `git diff main --stat` must show NO changes under `supabase/` and no `.from('chain_of_custody')`/`.insert` additions in the diff (`git diff main | grep -n "chain_of_custody" ` returns only the read-only comment references), and no `master_numbering_policies` writes (`git diff main | grep -c "master_numbering_policies"` = 0).
- [ ] **Step 4: Push and open the PR (owner merges):** `git push -u origin feat/india-l6-delivery-challan && gh pr create --base main --title "WP-L6: Rule 55 Delivery Challan (triplicate, per-checkout-batch, customer-owned devices only)" --body "## WP-L6 — Rule 55 Delivery Challan [M, no migration]

India Pack lab track (design: docs/superpowers/specs/2026-07-05-phase4-india-pack-design.md §4-L6).

### What ships
- **Triplicate pdfmake builder** (ORIGINAL FOR CONSIGNEE / DUPLICATE FOR TRANSPORTER / TRIPLICATE FOR CONSIGNER) with HSN/UQC/serial/declared-value lines, consigner+consignee GSTIN, Rule 55(1) non-supply notation, and a manual e-way bill note at the ₹50,000 threshold.
- **Per-transfer sourcing:** challan lines come from the specific checkout event's device set (the log_case_checkout p_device_ids batch stamped as case_devices.checkout_batch_id, mirrored per-device into chain_of_custody_transfers) — never the full case_devices list. Includes a partial-checkout 12-drive RAID test (3 of 12 → 3 lines).
- **Customer-owned devices only:** patient/source/donor (and null-role intake) devices are challan-eligible; lab-supplied backup/clone/spare/target media is excluded and the checkout modal shows the goods-tax-invoice guidance.
- **Idempotent statutory numbering:** one challan number per checkout batch from the S1b-seeded delivery_challan FY series (via get_next_number; L6 adds no numbering rows), recorded as an append-only case_job_history row (log_case_history) so reprints never consume a fresh number.
- Checkout modal (regime-gated via deliveryChallanEnabled(regime.documents) — no country literals) captures per-device declared values; challan-issuance failure keeps the modal open for an issuance-only retry and never re-runs the custody-stamped checkout.
- New route /print/delivery-challan/:caseId/:batchId + generateDeliveryChallan glue.

### Invariants held
- No migration; chain_of_custody* untouched (append-only preserved; batch read via the case_devices projection).
- CHALLAN_DEFAULT_HSN=847170 and the challan sample go into the S7 CA ratification package.
- typecheck 0; all WP test paths green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"`
- [ ] **Step 5: Record the PR URL in the session notes for WP-GA** (the GA dry-run's challan-checkout step executes this flow live on the IN test tenant).

---


## Work Package WP-GA — GA Dry-Run Execution [S, no migration]

Branch: `feat/india-ga-dry-run` (cut from `main` after WP-S7's publish PR and all of WP-L1–L6 are merged)
Depends on: WP-S7 (IN published `statutory_ready`; GA checklist document created at `docs/superpowers/specs/2026-07-05-india-ga-checklist.md`), WP-S2 (live IN test tenant + staff login), WP-S3 (`in_gst` strategy + head-level rounding + capability sync), WP-S4 (`in_gst_invoice` profile + per-head quote/invoice rendering + generic_invoice dev assertion), WP-S5 (`in_fiscal_numbering` applied to the IN tenant), WP-S6 (`gstr` composers), WP-L1 (lakh grouping + Indian words + ₹), WP-L2 (registration status setting, unregistered loud treatment, D6 silent-fallback assertion, branch-state mismatch warning), WP-L3 (TDS on `record_payment`), WP-L4 (receipt/refund vouchers, advance payment kind, netting, case-lifecycle hooks, `TaxDocumentType` widening), WP-L6 (Rule 55 challan at checkout).

**Nature of this WP (P3 live-runbook style, per `docs/superpowers/handoff.md` §METHOD-3 and `docs/superpowers/specs/2026-07-02-p3-exit-evidence.md`):** static review and unit fixtures cannot reach live-pipeline failures (P3's live runbook found 7 findings the 12-agent review missed). WP-GA therefore executes spec §5's two live branches end-to-end on the IN test tenant through the real UI (`npm run dev` against canonical DB `ssmbegiyjivrcwgcqutu`), asserts every stage with read-only MCP SQL (ToolSearch `select:mcp__supabase__execute_sql`, always `project_id: ssmbegiyjivrcwgcqutu`), and records verbatim evidence into the GA checklist document. Each runbook step follows the TDD shape: run the post-condition SQL assertion first (expected FAIL — the action hasn't happened), perform the UI action, re-run (expected PASS), commit the evidence. All live writes are business-legitimate dry-run data on the disposable IN test tenant — no rollbacks needed, no schema or engine code changes. Any assertion that FAILS after its action is a **stop-the-line finding**: record it in the checklist's Findings table (P3 §5 format: # / severity / finding / status), fix it in the owning WP's surface via a separate PR, and re-run the step — WP-GA itself ships only tests + evidence.

---

### Task GA.1: Automated GA smoke suite (CI-runnable, no live DB)

**Files:**
- Create: `src/lib/regimes/in_gst/gaSmoke.test.ts`
- Test: `src/lib/regimes/in_gst/gaSmoke.test.ts`

**Interfaces:**
- Consumes: `registerAllRegimePlugins()` (`src/lib/regimes/register.ts:17`, verified); `listRegisteredCapabilities()` (`src/lib/regimes/registry.ts:51`, verified); `resolveTaxStrategy(key)` (`src/lib/regimes/registry.ts:43`, verified); `TaxContext`, `TaxableLine`, `GeoCountryTaxRateRow`, `TaxDocumentType` (`src/lib/regimes/types.ts`; union widened with `'receipt_voucher' | 'refund_voucher'` by WP-L4); `RateContext` (`src/lib/currencyService.ts`, verified via `src/lib/tax/kernel/computeDocumentTax.test.ts:4`); `in_gst` plugin registration + head-level rounding + Section 170 round-off (WP-S3); `roundingPolicy.level` union including `'head'` (WP-S1a).
- Produces: `gaSmoke.test.ts` — the permanent CI guard that the four India capability registrations, the voucher document types, and the pinned §3 B2C dual-levy numbers never regress after GA.

- [ ] **Step 1: Cut the branch.** `git checkout main && git pull && git checkout -b feat/india-ga-dry-run`
- [ ] **Step 2: Write the smoke test (RED).** Create `src/lib/regimes/in_gst/gaSmoke.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { registerAllRegimePlugins } from '../register';
import { listRegisteredCapabilities, resolveTaxStrategy } from '../registry';
import type { TaxContext, TaxableLine, GeoCountryTaxRateRow, TaxDocumentType } from '../types';
import type { RateContext } from '../../currencyService';

const inrRc: RateContext = {
  documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2,
  rate: 1, rateSource: 'derived',
};
const rateRow = (over: Partial<GeoCountryTaxRateRow>): GeoCountryTaxRateRow => ({
  id: 'r', country_id: 'in', subdivision_id: null, component_code: 'IGST',
  component_label: 'IGST', tax_category: 'standard', rate: 18, applies_to: 'gst_slab_18',
  valid_from: '2017-07-01', valid_to: null, sort_order: 0, ...over,
});
const gstHeads: GeoCountryTaxRateRow[] = [
  rateRow({ id: 'cg', component_code: 'CGST', component_label: 'CGST', rate: 9, sort_order: 0 }),
  rateRow({ id: 'sg', component_code: 'SGST', component_label: 'SGST', rate: 9, sort_order: 1 }),
  rateRow({ id: 'ig', component_code: 'IGST', component_label: 'IGST', rate: 18, sort_order: 2 }),
];
const line = (over: Partial<TaxableLine>): TaxableLine => ({
  lineItemId: null, description: 'Data recovery service (SAC 998319)', quantity: 1,
  unitPrice: 5000, lineDiscount: 0, unitCode: null, itemCode: '998319',
  treatment: 'standard', treatmentReasonCode: null, ...over,
});
const ctx = (over: Partial<TaxContext>): TaxContext => ({
  documentType: 'invoice',
  seller: {
    legalEntityId: 'le', countryId: 'in', subdivisionId: 'sub-KA', taxIdentifier: '29ABCDE1234F1Z5',
    registrations: [{
      id: 'reg1', legal_entity_id: 'le', country_id: 'in', subdivision_id: 'sub-KA',
      tax_number: '29ABCDE1234F1Z5', scheme: 'standard', registered_from: '2020-01-01',
      registered_to: null, is_primary: true,
    }],
  },
  buyer: { taxNumber: null, countryId: 'in', subdivisionId: 'sub-KA', isBusiness: false, addressSnapshot: null },
  taxPointDate: '2026-07-05', placeOfSupplySubdivisionId: 'sub-KA',
  lines: [line({})], documentDiscount: 0, taxInclusive: false,
  rateContext: inrRc, rates: gstHeads,
  roundingPolicy: { mode: 'half_up', level: 'head', cash_increment: 1 },
  scaleSystem: 'indian', ...over,
});

describe('WP-GA smoke — India Pack GA invariants', () => {
  beforeAll(() => registerAllRegimePlugins());

  it('all four India capability registrations are present (S3/S4/S5/S6)', () => {
    const keys = listRegisteredCapabilities().map((c) => c.capability_key);
    for (const k of ['in_gst', 'in_gst_invoice', 'in_fiscal_numbering', 'gstr']) {
      expect(keys, `missing capability registration: ${k}`).toContain(k);
    }
  });

  it('TaxDocumentType carries the L4 voucher members (additive widening held)', () => {
    const rv: TaxDocumentType = 'receipt_voucher';
    const fv: TaxDocumentType = 'refund_voucher';
    expect([rv, fv]).toEqual(['receipt_voucher', 'refund_voucher']);
  });

  it('pinned §3 B2C inclusive fixture: 4237.29 / 381.36 / 381.36 / −0.01 / 5000.00', async () => {
    const c = await resolveTaxStrategy('in_gst').compute(ctx({ taxInclusive: true }));
    expect(c.totals.taxableBase).toBe(4237.29);
    const heads = Object.fromEntries(c.rollups.map((r) => [r.componentCode, r.taxAmount]));
    expect(heads).toEqual({ CGST: 381.36, SGST: 381.36 }); // EQUAL heads — never 381.36/381.35
    expect(c.totals.roundingAdjustment).toBe(-0.01);
    expect(c.totals.grandTotal).toBe(5000);
  });

  it('inter-state place of supply flips the same document to a single IGST head', async () => {
    const c = await resolveTaxStrategy('in_gst').compute(ctx({ placeOfSupplySubdivisionId: 'sub-MH' }));
    expect(c.rollups.map((r) => r.componentCode)).toEqual(['IGST']);
    expect(c.rollups[0].taxAmount).toBe(900);
  });
});
```
- [ ] **Step 3: Run it — expect FAIL only if a dependency regressed.** `npx vitest run src/lib/regimes/in_gst/gaSmoke.test.ts`. Expected: **PASS** (every asserted behavior shipped in S1a–S6/L4; this suite is a regression net, not new behavior — the RED phase for WP-GA's runbook lives in the live SQL pre-assertions of GA.3/GA.4). If any test fails, that is a stop-the-line finding against the named source WP: record it in the GA checklist Findings table and halt until fixed.
- [ ] **Step 4: Commit.** `git add src/lib/regimes/in_gst/gaSmoke.test.ts && git commit -m "test(ga): India Pack GA smoke suite — capabilities, voucher types, pinned dual-levy fixture"`

---

### Task GA.2: Pre-flight live-state gate

**Files:**
- Modify: `docs/superpowers/specs/2026-07-05-india-ga-checklist.md` (created by WP-S7; WP-GA appends `## WP-GA Evidence` sections — additive only, never rewrite S7's checklist rows)

**Interfaces:**
- Consumes: canonical DB `ssmbegiyjivrcwgcqutu`; IN test tenant (WP-S2; resolved by SQL below); `publish_country_pack` gate results + `master_country_pack_tests` (WP-S7); `master_engine_capabilities` sync (S3–S6); `apply_country_numbering_policy` backfill (WP-S5); seller registration row in `legal_entity_tax_registrations` (WP-S2).
- Produces: the pinned `IN_TENANT_ID` used by every subsequent SQL assertion in GA.3–GA.5, recorded in the checklist Pre-flight table.

- [ ] **Step 1: Load the SQL tool.** ToolSearch `select:mcp__supabase__execute_sql`; every call below passes `project_id: ssmbegiyjivrcwgcqutu`.
- [ ] **Step 2: Assert IN is published statutory_ready (RED if S7 regressed).** Run:
```sql
SELECT c.code, c.config_status,
       (SELECT count(*) FROM master_country_pack_tests t
         WHERE t.country_id = c.id AND t.deleted_at IS NULL
           AND (t.pass IS DISTINCT FROM true
                OR t._meta->'external_validation'->>'status' IS DISTINCT FROM 'validated')) AS non_validated_fixtures
FROM geo_countries c WHERE c.code = 'IN';
```
Expected PASS: `config_status='statutory_ready'`, `non_validated_fixtures=0`. Any other result = stop-the-line (S7 gate regressed or fixtures went stale).
- [ ] **Step 3: Resolve and pin the IN test tenant.** Run:
```sql
SELECT t.id, t.name FROM tenants t
JOIN geo_countries c ON c.id = t.country_id
WHERE c.code = 'IN' AND t.deleted_at IS NULL;
```
Expected: exactly 1 row (the WP-S2 tenant). Record `id` + `name` verbatim; this is `IN_TENANT_ID` everywhere below.
- [ ] **Step 4: Assert capability rows, pack bindings, numbering, seller registration in one shot.** Run:
```sql
SELECT
  (SELECT count(*) FROM master_engine_capabilities
    WHERE capability_key IN ('in_gst','in_gst_invoice','in_fiscal_numbering','gstr')
      AND deleted_at IS NULL) AS capability_rows,          -- expect 4
  (SELECT count(*) FROM master_numbering_policies p
    JOIN geo_countries c ON c.id = p.country_id
    WHERE c.code = 'IN' AND p.deleted_at IS NULL) AS in_numbering_policies,  -- expect ≥5 (INV/CN/RCV/RFV/challan, S1b)
  (SELECT count(*) FROM legal_entity_tax_registrations r
    WHERE r.tenant_id = '<IN_TENANT_ID>' AND r.deleted_at IS NULL
      AND r.registered_to IS NULL) AS active_seller_registrations;           -- expect 1 (single GSTIN, D6)
```
Expected PASS: `4 / ≥5 / 1`. Record the row verbatim.
- [ ] **Step 5: Append the Pre-flight evidence section and commit.** Append to `docs/superpowers/specs/2026-07-05-india-ga-checklist.md`:
```markdown
## WP-GA Evidence — Pre-flight (recorded <date>, canonical DB ssmbegiyjivrcwgcqutu)
| Check | Query result (verbatim) | Verdict |
|---|---|---|
| IN config_status + fixture validation | <Step 2 output> | PASS |
| IN test tenant | <Step 3 output: id + name> | PASS |
| Capabilities / numbering / seller registration | <Step 4 output> | PASS |

### Findings (stop-the-line; P3 §5 format)
| # | Severity | Finding | Status |
|---|---|---|---|
```
`git add docs/superpowers/specs/2026-07-05-india-ga-checklist.md && git commit -m "docs(ga): pre-flight live-state gate evidence — IN statutory_ready, tenant pinned, capabilities 4/4"`

---

### Task GA.3: Live Branch A — main flow (intake → challan checkout)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-05-india-ga-checklist.md` (append `## WP-GA Evidence — Branch A`)

**Interfaces:**
- Consumes: `CreateCaseWizard` intake (existing, v1.3.0); advance-capture entry point on intake/diagnosis case surfaces + "Advance (unallocated)" payment kind in `RecordPaymentModal` + receipt-voucher issuance + Rule 50 supersession of `payment_receipts` (WP-L4); quote per-head GST rendering (WP-S4 acceptance item); `transition_case_status` gated path + `case_recovery_attempts` evidence (v1.3.0, existing); invoice advance-netting + conservation (WP-L4 per §3); TDS section in `RecordPaymentModal` + `payments.withheld_amount` + `payment_withholdings` (WP-L3); `log_case_checkout` + triplicate DeliveryChallan (WP-L6); `document_tax_lines` persistence (`src/lib/taxDocumentService.ts:177-222`, verified).
- Produces: Branch A evidence table (case number, voucher/invoice/challan numbers, per-head amounts, conservation arithmetic) consumed by GA.6's sign-off.

Setup: `npm run dev`, log in as the WP-S2 IN-tenant staff user. All SQL below substitutes the pinned `IN_TENANT_ID`. After each UI action, append one evidence row (step name · UI surface used · verbatim SQL output · PASS/FAIL) to the Branch A table before moving on.

- [ ] **Step 1: Intake + custody (RED→act→GREEN).** Pre-assert (expect 0 rows — RED): `SELECT id FROM cases WHERE tenant_id='<IN_TENANT_ID>' AND deleted_at IS NULL AND created_at > now() - interval '10 minutes';` Then create a case via `CreateCaseWizard`: customer "GA DryRun Labs Pvt Ltd" (registered buyer, GSTIN with the seller's state prefix → intra-state), one patient HDD device. Post-assert (GREEN):
```sql
SELECT c.case_number, cc.action, cc.custody_status
FROM cases c JOIN chain_of_custody cc ON cc.case_id = c.id
WHERE c.tenant_id='<IN_TENANT_ID>' AND c.deleted_at IS NULL
ORDER BY c.created_at DESC, cc.created_at ASC LIMIT 3;
```
Expected: the new case number in the S1b case format, plus a `DEVICE_RECEIVED`/`in_custody` ledger row (v1.2.0 trigger). Record `CASE_A_ID`.
- [ ] **Step 2: Advance + Receipt Voucher (Rule 50).** Pre-assert (RED, expect 0): `SELECT count(*) FROM document_tax_lines WHERE tenant_id='<IN_TENANT_ID>' AND document_type='receipt_voucher' AND deleted_at IS NULL;` UI: from the case's intake surface use L4's advance-capture entry point — record an **Advance (unallocated)** payment of ₹2,000 (inclusive). Post-assert (GREEN):
```sql
SELECT document_type, component_code, taxable_base, tax_amount
FROM document_tax_lines
WHERE tenant_id='<IN_TENANT_ID>' AND document_type='receipt_voucher' AND deleted_at IS NULL
ORDER BY sequence;
```
Expected: CGST + SGST rows from the 18/118 back-out (taxable 1,694.92; 152.54 per head — equal). Also assert exactly ONE customer-facing receipt artifact (L4's supersession decision): the voucher PDF exists in `document_instances` and no `payment_receipts` row was created for this payment. Voucher number must match the S1b RCV FY series with `{FY}` rendered `25-26` and length ≤ 16.
- [ ] **Step 3: Diagnosis.** Move the case to diagnosis via the guided Stage Banner (gated `transition_case_status`, NOT the free-form Overview picker — the GA dry-run proves the gated machine). Assert: `SELECT status FROM cases WHERE id='<CASE_A_ID>';` shows a diagnosis-phase status and `case_job_history` gained the transition row.
- [ ] **Step 4: Quote with GST breakup (S4 acceptance).** Create a quote: one line "Logical data recovery — HDD" SAC 998319, ₹15,000 exclusive. Assert on screen AND in the PDF preview: separate CGST ₹1,350.00 / SGST ₹1,350.00 lines (never a blended 18%), HSN/SAC column printed, lakh-grouped amounts (`15,000.00` under '3;2' → `15,000.00`; verify a >1-lakh amount groups as `1,35,000.00` by temporarily typing qty 9 in the preview, then reverting to 1), place of supply with state name+code. Post-assert: `SELECT component_code, tax_amount FROM document_tax_lines WHERE document_id='<QUOTE_ID>' AND document_type='quote' AND deleted_at IS NULL AND line_item_id IS NULL;` → CGST 1350 + SGST 1350. Screenshot filed under `docs/superpowers/specs/assets/ga-dryrun/` and linked from the evidence row. Note in the evidence row: portal `case_quotes` loop is a pre-existing platform gap (checklist calls it out; NOT asserted here).
- [ ] **Step 5: Approval → recovery → outcome.** Approve the quote through the quote surface; walk `awaiting_approval → approved → recovery` via the Stage Banner; record a successful recovery attempt (required evidence to leave recovery, v1.3.0) with result `full`. Assert: `SELECT status, recovery_outcome FROM cases WHERE id='<CASE_A_ID>';` → post-recovery status, `recovery_outcome='full'`; `SELECT count(*) FROM case_recovery_attempts WHERE case_id='<CASE_A_ID>' AND deleted_at IS NULL;` ≥ 1.
- [ ] **Step 6: Invoice, advance-netted (§3 conservation).** Issue the invoice from the approved quote. Post-assert:
```sql
SELECT component_code, taxable_base, tax_amount, tax_treatment
FROM document_tax_lines
WHERE document_id='<INVOICE_ID>' AND document_type='invoice' AND deleted_at IS NULL
  AND line_item_id IS NULL ORDER BY sequence;
```
Expected: per-head rows PLUS L4's offsetting advance-adjustment entries netting the voucher tax. **Conservation arithmetic recorded in the evidence row:** voucher tax (Step 2: 152.54 + 152.54) + invoice net tax = total supply tax (2,700.00 on ₹15,000). Also verify: invoice number `INV/25-26/<SEQ>` ≤ 16 chars; amount-in-words in Indian scale on the PDF; ₹ (U+20B9) renders in both preview and downloaded PDF; the advance now shows allocated via `SELECT sum(amount) FROM payment_allocations WHERE invoice_id='<INVOICE_ID>' AND deleted_at IS NULL;`.
- [ ] **Step 7: Payment with TDS (Sec 194J leg, L3).** Record the balance payment in `RecordPaymentModal` with the TDS section expanded: withheld amount = 10% of the taxable service value (₹1,500.00 on the ₹15,000 base — free-amount capture), certificate ref "GA-DRYRUN-26Q-001". Post-assert (conservation):
```sql
SELECT p.amount, p.withheld_amount, p.withholding_certificate_ref,
       (SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id = p.id AND a.deleted_at IS NULL) AS allocated,
       (SELECT count(*) FROM payment_withholdings w WHERE w.payment_id = p.id AND w.deleted_at IS NULL) AS tds_rows
FROM payments p WHERE p.id = '<PAYMENT_ID>';
```
Expected: `amount + withheld_amount = allocated`, `tds_rows = 1`, certificate ref persisted.
- [ ] **Step 8: Challan checkout (Rule 55, L6).** Check the device out via the checkout flow (`log_case_checkout`). Generate the Delivery Challan. Assert visually: triplicate pages (ORIGINAL FOR CONSIGNEE / DUPLICATE FOR TRANSPORTER / TRIPLICATE FOR CONSIGNER), line items = exactly this checkout event's device (the one patient HDD, sourced from the event's `chain_of_custody_transfers` rows — not `case_devices`), challan number from the S1b FY series. Post-assert:
```sql
SELECT c.status, (SELECT count(*) FROM chain_of_custody cc
  WHERE cc.case_id = c.id AND cc.action = 'DEVICE_CHECKED_OUT') AS checkout_events
FROM cases c WHERE c.id='<CASE_A_ID>';
```
Expected: case drove `ready → delivered → closed` (full collection) and `checkout_events = 1`; custody ledger append-only intact (no updated rows: `SELECT count(*) FROM chain_of_custody WHERE case_id='<CASE_A_ID>' AND updated_at IS DISTINCT FROM created_at;` → 0 if the column pair exists, else omit with a note).
- [ ] **Step 8b: Live INTER-STATE invoice — single IGST head (§9.3 exit criterion 3, second half).** Branch A above exercises the CGST+SGST intra-state split only, because "GA DryRun Labs Pvt Ltd" carries the seller's state prefix. Spec §9.3 requires the kernel split to be proven on a **LIVE UI-issued invoice for BOTH** intra-state (Steps 4/6 above) **AND** inter-state (IGST) — the unit fixture in GA.1 Step 2's inter-state test does NOT satisfy "a LIVE invoice through the real UI path." So mirror the intra-state assertion once more on an inter-state supply: via `CreateCaseWizard` create/select a SECOND buyer **"GA DryRun Maharashtra Pvt Ltd"** with a non-seller-state GSTIN carrying the Maharashtra prefix `27` (e.g. `27ABCDE1234F1Z5`) and a Maharashtra place of supply (`sub-MH`), one patient HDD device (`CASE_A2_ID`); walk it through quote (one line "Logical data recovery — HDD", SAC 998319, ₹15,000 exclusive) and issue the invoice from the accepted quote — all through the same live UI path as Branch A, NOT via SQL inserts. Assert on screen AND in the downloaded PDF: a **single IGST 18% ₹2,700.00 line** (never a CGST/SGST pair), HSN/SAC column printed, `INV/25-26/<SEQ>` numbering ≤ 16 chars, amount-in-words in Indian scale, ₹ (U+20B9) rendering, and lakh grouping (verify a >1-lakh amount groups `1,35,000.00` by temporarily typing qty 9 in the preview, then reverting to 1), place of supply printed as Maharashtra state name+code `27`. Post-assert (GREEN — exactly one IGST head, no CGST/SGST):
```sql
SELECT component_code, taxable_base, tax_amount
FROM document_tax_lines
WHERE document_id='<INVOICE_A2_ID>' AND document_type='invoice' AND deleted_at IS NULL
  AND line_item_id IS NULL ORDER BY sequence;
```
Expected: exactly one row `IGST / 15000.00 / 2700.00`; zero `CGST`/`SGST` rows for this document. Record `CASE_A2_ID`, `INVOICE_A2_ID`, the buyer GSTIN, and the verbatim single-head output in the Branch A evidence table alongside the intra-state rows so §9.3's both-paths criterion is demonstrably closed. Screenshot the IGST invoice PDF under `docs/superpowers/specs/assets/ga-dryrun/` and link it.
- [ ] **Step 9: Commit Branch A evidence.** `git add docs/superpowers/specs/2026-07-05-india-ga-checklist.md docs/superpowers/specs/assets/ga-dryrun && git commit -m "docs(ga): Branch A main-flow dry-run recorded — intake→voucher→quote→invoice(netted)→TDS payment→challan, conservation ties; + live inter-state IGST invoice (single head, §9.3)"`

---

### Task GA.4: Live Branch B — no-recovery (refund voucher + retained-advance terminal)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-05-india-ga-checklist.md` (append `## WP-GA Evidence — Branch B`)

**Interfaces:**
- Consumes: Mark No Solution flow + `master_case_no_solution_reasons` + `case_follow_ups` scheduling (v1.4.0, existing); Refund Voucher offered from the no-solution/unrecoverable/cancellation hooks, refund→receipt-voucher reference requirement row, retained-advance ⇒ evaluation-service tax invoice (SAC 998319) terminal (all WP-L4).
- Produces: Branch B evidence table with both terminals; the refund-voucher original-reference assertion GA.6 cites in sign-off.

- [ ] **Step 1: Case B1 — intake + advance.** Repeat GA.3 Steps 1–2 exactly on a second case (`CASE_B1_ID`): new case for the same customer, one patient SSD device, ₹2,000 advance → receipt voucher `RCV_B1_NUMBER` (assert per-head equal 152.54/152.54 via the GA.3 Step 2 `document_tax_lines` query filtered to the new voucher's `document_id`).
- [ ] **Step 2: Case B1 — diagnosis → No Solution → Refund Voucher (Rule 51).** Move to diagnosis (Stage Banner), then run **Mark No Solution** choosing reason "media damage" — the flow captures the reason and schedules the +6-month follow-up. Take L4's offered Refund Voucher for the full ₹2,000 (actual payment reversal, method matching the advance). Pre-assert (RED, expect 0): `SELECT count(*) FROM document_tax_lines WHERE tenant_id='<IN_TENANT_ID>' AND document_type='refund_voucher' AND deleted_at IS NULL;` Post-assert (GREEN):
```sql
SELECT c.status, c.no_solution_reason_id IS NOT NULL AS reason_captured,
  (SELECT count(*) FROM case_follow_ups f WHERE f.case_id=c.id AND f.deleted_at IS NULL) AS followups,
  (SELECT count(*) FROM document_tax_lines d
    WHERE d.tenant_id=c.tenant_id AND d.document_type='refund_voucher' AND d.deleted_at IS NULL) AS refund_voucher_tax_rows
FROM cases c WHERE c.id='<CASE_B1_ID>';
```
Expected: `no_solution`-phase status, `reason_captured=true`, `followups≥1`, `refund_voucher_tax_rows≥2` (per-head reversal). Assert on the refund voucher PDF: it prints the **original receipt voucher number + date** (`RCV_B1_NUMBER` — the L4 block requirement); attempting issuance with the reference blank is refused by the dry-run field-by-field failure surface (try it once, screenshot the block, then fill and issue).
- [ ] **Step 3: Case B2 — retained advance ⇒ evaluation invoice terminal.** Third case (`CASE_B2_ID`), same shape, ₹2,000 advance + receipt voucher. Diagnosis → Mark No Solution (reason "no method exists") — this time choose L4's **retain advance** terminal: issue the evaluation-service tax invoice (SAC 998319, ₹2,000 inclusive) that the advance allocates against. Post-assert (GST loop closes):
```sql
SELECT
  (SELECT sum(a.amount) FROM payment_allocations a
    JOIN payments p ON p.id=a.payment_id
    WHERE a.invoice_id='<EVAL_INVOICE_ID>' AND a.deleted_at IS NULL) AS allocated,   -- expect 2000.00
  (SELECT sum(d.tax_amount) FROM document_tax_lines d
    WHERE d.document_id='<EVAL_INVOICE_ID>' AND d.document_type='invoice'
      AND d.deleted_at IS NULL AND d.line_item_id IS NULL) AS invoice_net_tax;       -- expect 0.00 net (voucher already posted 305.08)
```
Conservation recorded in the evidence row: voucher tax 305.08 + invoice net tax 0.00 = total supply tax 305.08 on the ₹2,000 inclusive evaluation supply. Invoice line shows SAC 998319; no refund voucher exists for B2.
- [ ] **Step 4: Commit Branch B evidence.** `git add docs/superpowers/specs/2026-07-05-india-ga-checklist.md docs/superpowers/specs/assets/ga-dryrun && git commit -m "docs(ga): Branch B no-recovery dry-run recorded — refund voucher w/ original-ref block + retained-advance evaluation-invoice terminal"`

---

### Task GA.5: Honest-degrade assertion set + branch-state warning (live triggers)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-05-india-ga-checklist.md` (append `## WP-GA Evidence — Honest-Degrade Set`)

**Interfaces:**
- Consumes: S4's registered-IN-resolves-`generic_invoice` dev assertion (WP-S4); unregistered-mode loud treatment + explicit registration-status setting + D6 silent-fallback dev assertion (WP-L2); branch-state mismatch warning — active `branches.subdivision_id` ≠ GSTIN state ⇒ settings banner + dev assertion (WP-L2).
- Produces: the four-row honest-degrade evidence table GA.6's sign-off requires green.

- [ ] **Step 1: Re-run the owning WPs' assertion tests (armed check).** Locate the test files by marker, then run them: `Grep pattern "generic_invoice" glob "src/**/*.test.{ts,tsx}"` and `Grep pattern "silent-fallback|silent_fallback|unregistered" glob "src/**/*.test.{ts,tsx}"`; run the matched files with `npx vitest run <matched paths>`. Expected: all green. Record the exact file list + pass counts in the evidence table (this proves the S4/L2 dev assertions still exist and fire in CI — the "armed" half of verification).
- [ ] **Step 2: Live trigger — unregistered-mode loud treatment (reversible).** In Settings on the IN test tenant, flip L2's GST registration status control to **unregistered**. Assert: loud banner appears on Settings + document surfaces; a new dry-run quote renders a plain (no GST heads) document with the unregistered treatment, not a silent 18% drop. Screenshot both. Flip back to **registered**; re-open the quote surface and confirm per-head rendering returns. SQL confirm the setting round-tripped: `SELECT r.registered_to FROM legal_entity_tax_registrations r WHERE r.tenant_id='<IN_TENANT_ID>' AND r.deleted_at IS NULL;` → `NULL` (active again).
- [ ] **Step 3: Live trigger — branch-state mismatch warning (reversible).** Pre-assert (RED — no warning): open Settings, confirm no branch-state banner. Create a branch row for the IN tenant with a `subdivision_id` of a DIFFERENT GST state than the seller GSTIN's prefix (use the Branches UI; if none exists, insert via MCP SQL with full tenant fields and note it in evidence):
```sql
INSERT INTO branches (tenant_id, name, subdivision_id)
VALUES ('<IN_TENANT_ID>', 'GA DryRun Mismatch Branch', (SELECT id FROM geo_subdivisions s JOIN geo_countries c ON c.id=s.country_id WHERE c.code='IN' AND s.tax_authority_code='27'))
RETURNING id;
```
Assert (GREEN): the L2 settings banner appears, pointing at the deferred multi-state manager. Screenshot. Revert by soft delete: `UPDATE branches SET deleted_at = now() WHERE id='<BRANCH_ID>';` — banner clears on reload (assert visually).
- [ ] **Step 4: Live probe — S4 generic_invoice assertion cannot fire on a healthy tenant.** Read-only SQL proving the IN binding resolves the real profile (so the dev assertion is a tripwire, not a live condition):
```sql
SELECT cc.config->'regime'->>'documents' AS documents_regime,
       cc.config->'regime'->>'einvoice' AS einvoice_regime
FROM country_config cc JOIN geo_countries c ON c.id = cc.country_id WHERE c.code='IN';
```
Expected: `in_gst_invoice` / `no_einvoice` (D3 — no `in_irn` anywhere). Adapt the column path to the live `country_config` shape if it differs (introspect with `SELECT * FROM country_config LIMIT 1` first; record the actual query used). Any other value = stop-the-line finding against S1b.
- [ ] **Step 5: Commit.** `git add docs/superpowers/specs/2026-07-05-india-ga-checklist.md docs/superpowers/specs/assets/ga-dryrun && git commit -m "docs(ga): honest-degrade set verified live — unregistered loud, branch-state banner, generic_invoice tripwire armed"`

---

### Task GA.6: Return-level cross-check, checklist sign-off, gates, PR

**Files:**
- Modify: `docs/superpowers/specs/2026-07-05-india-ga-checklist.md` (append `## WP-GA Sign-off`)
- Test: `src/lib/regimes/in_gst/gaSmoke.test.ts` (final run)

**Interfaces:**
- Consumes: `gstr` GSTR-3B composer + Returns UI surface (WP-S6); everything recorded in GA.2–GA.5.
- Produces: the completed GA checklist (spec §9 exit criterion 4) — the artifact that gates the first real lab tenant.

- [ ] **Step 1: Return-level conservation cross-check.** Open the Returns surface for the current period on the IN test tenant; the GSTR-3B view must show 3.1(a) outward taxable + per-head payable that tie to the dry-run's ledger. Cross-check in SQL:
```sql
SELECT d.component_code, sum(d.tax_amount) AS head_total
FROM document_tax_lines d
WHERE d.tenant_id='<IN_TENANT_ID>' AND d.deleted_at IS NULL
  AND d.document_type IN ('invoice','credit_note','receipt_voucher','refund_voucher')
  AND d.line_item_id IS NULL
GROUP BY d.component_code ORDER BY d.component_code;
```
Expected (all intra-state dry-run supplies): CGST = SGST exactly; grand total = Branch A supply tax (2,700.00) + B2 evaluation tax (305.08); B1's voucher + refund voucher net to zero. Record the query output and the on-screen 3B boxes side by side; they must be equal. Note in evidence: Table 4 ITC intentionally absent (named non-goal, §3).
- [ ] **Step 2: Fill the sign-off section.** Append:
```markdown
## WP-GA Sign-off
- Branch A (main flow, 8 stages): EXECUTED + RECORDED — all assertions PASS.
- §9.3 exit criterion 3 (kernel split proven on a LIVE UI-issued invoice for BOTH paths): intra-state CGST+SGST (Branch A Steps 4/6) AND inter-state single IGST head (Branch A Step 8b, Maharashtra `27` buyer): EXECUTED + RECORDED — PASS.
- Branch B (no-recovery: refund-voucher terminal + retained-advance evaluation-invoice terminal): EXECUTED + RECORDED — all assertions PASS.
- Honest-degrade set (S4 generic_invoice tripwire · L2 unregistered loud + D6 silent-fallback · L2 branch-state warning): VERIFIED (armed in CI + triggered live where reversible).
- GSTR-3B period cross-check ties to document_tax_lines: PASS.
- One advance ⇒ exactly one customer-facing receipt artifact (Rule 50 supersession): PASS.
- Findings raised: <count> (see Findings table; all closed or owner-assigned).
- Pre-existing platform gap, NOT an India Pack item: portal case_quotes loop (0 rows).
```
Every line carries its evidence-row references. If any finding remains open, the sign-off states GA is BLOCKED on it — never soften.
- [ ] **Step 3: Final gates.** Run `npm run typecheck` — expect **0** (run it yourself, un-piped; do not trust a subagent report). Run `npx vitest run src/lib/regimes/in_gst/gaSmoke.test.ts` — expect all green.
- [ ] **Step 4: Commit, push, PR.** `git add docs/superpowers/specs/2026-07-05-india-ga-checklist.md && git commit -m "docs(ga): WP-GA sign-off — both live dry-run branches recorded, GSTR-3B ties, honest-degrade set green"` then `git push -u origin feat/india-ga-dry-run` and:
```
gh pr create --base main --title "WP-GA: India Pack GA dry-run executed + recorded" --body "Executes spec §5's two live branches on the IN test tenant (canonical DB) and records evidence into the GA checklist (docs/superpowers/specs/2026-07-05-india-ga-checklist.md).

- Branch A: intake → advance receipt voucher (Rule 50, supersedes payment_receipts) → diagnosis → quote w/ per-head GST → approval → recovery → invoice advance-netted (conservation ties) → payment w/ TDS (amount+withheld=allocations) → triplicate Rule 55 challan checkout (ready→delivered→closed). PLUS a live inter-state invoice for a Maharashtra (27) buyer proving a SINGLE IGST head through the real UI — closing §9.3 exit criterion 3 (kernel split live-proven on BOTH intra-state CGST+SGST and inter-state IGST).
- Branch B: diagnosis → no_solution → refund voucher (Rule 51, original-RCV ref enforced) + retained-advance → SAC 998319 evaluation-invoice terminal.
- Honest-degrade set verified: S4 generic_invoice tripwire, L2 unregistered loud treatment + D6 silent-fallback assertion, L2 branch-state mismatch warning (triggered live, reverted).
- GSTR-3B period boxes tie to document_tax_lines; CGST=SGST equality held everywhere.
- New CI guard: src/lib/regimes/in_gst/gaSmoke.test.ts (capabilities 4/4, voucher doc types, pinned 4237.29/381.36/381.36/−0.01/5000.00 fixture).
- No migration. No engine code changes. Findings (if any) listed in the checklist Findings table with owning-WP fix PRs.

Owner merges; merging this PR marks spec §9 exit criterion 4 complete.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Do NOT merge — the owner merges (D8).

---
