# Phase 0 — Stop the Bleeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every live wrong-number in the localization/financial surface — broken signup, USD ghost defaults, the ×100 tax-rate display, UTC date-boundary shifts, the credit-note VAT-reversal hole, currency-less VAT ledger, 2-decimal money truncation, un-backfilled `*_base` columns, the cross-currency transfer hole, the fabricated 7%/USD payroll defaults, and the two broken privacy RPCs — with zero architectural risk, in independently PR-able units.

**Architecture:** Pure correctness phase: no tax kernel, no regime plugins, no new domain tables. Every change is either a one-file frontend/service fix with a colocated test, or an additive `mcp__supabase__apply_migration` with SQL probe assertions before/after. The only new TS modules are two small pure helpers: `src/lib/tenantToday.ts` — mandated by the program's canonical interface contract (§1.7) — and `src/lib/vatPeriods.ts`, a Phase-0-local pure helper that is NOT part of the canonical contract and is superseded by the Phase-3 `ReturnComposer.periodBounds` (it is a stopgap so the VAT return modal stops shifting month boundaries under UTC).

**Tech Stack:** React 18 + TypeScript + Vite; Vitest 4 (node + jsdom projects, TZ pinned `Asia/Dubai`); Supabase Postgres 15 (live project `ssmbegiyjivrcwgcqutu` — the single source of truth); pg_cron 1.6.4 (verified installed); psql-based live-DB gate scripts under `scripts/`.

**Entry criteria:** none (this is the program's first phase). Repo at `main` (9684297); typecheck baseline 0 errors; live DB matches the 2026-07-02 DB scout report (993 invoices / 1,138 quotes / 1,114 payments; all `*_base` NULL; `vat_records`/`vat_returns`/`vat_transactions` at 0 rows; single Omani demo tenant).

---

## Global Constraints

Every task inherits these verbatim repo rules:

- **Additive-only migrations.** No `DROP TABLE`, no `DROP COLUMN`, no `DELETE FROM`. Widening a `numeric` type, dropping a column DEFAULT, and adding columns/constraints are allowed (non-destructive). Soft deletes only (`deleted_at = now()`).
- **New tenant-scoped tables** (none are created in this phase, but if any task is extended): `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, RLS ENABLED + FORCED, RESTRICTIVE `{table}_tenant_isolation` policy, PERMISSIVE op policies (financial writes `has_role('accounts')`), `set_<table>_tenant_and_audit` trigger, `idx_<table>_tenant_id` partial index, `deleted_at`.
- **`maybeSingle()` never `single()`.**
- **`src/types/database.types.ts` is generated** — regenerate via `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) after EVERY migration; never hand-edit.
- **Migration discipline per PR:** apply via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) → regen types → update ALL callers → append a row to `supabase/migrations.manifest.md` (markdown table: `| version | filename | classification | summary | PR |`) → use `.github/PULL_REQUEST_TEMPLATE/migration.md`.
- **typecheck must stay at 0 errors** (`npm run check:tsc`).
- **pdfmake-only PDFs; lucide-react icons only; semantic theme tokens only** (no raw `bg-blue-600`/purple/indigo/violet; see `DESIGN.md`).
- **No new npm packages** without checking existing ones first (this plan needs none).
- **Custody/audit tables are append-only** — never weaken `prevent_audit_mutation`, REVOKEs, or the v1.2.0 custody write paths in `invoiceService`/`quotesService`/`paymentsService`.
- **Never hardcode currency symbols, tax labels, or date formats** — use `TenantConfigContext` (`useCurrencyConfig`/`useTaxConfig`/`useDateTimeConfig`) and `src/lib/format.ts` helpers.
- **The frozen-rate money model (keystone invariant):** every financial row stores transaction `currency` + frozen `exchange_rate numeric(20,10)` + `rate_source` + `*_base = round(amount × rate, base decimals)` computed ONCE at write through `currencyService.resolveRateContext`. Never convert history on read; never re-derive a stored rate.
- Do not reuse a merged work branch — every WP starts on a fresh branch cut from `main`.

---

## Objectives

1. **Onboarding works for every seeded country** — the signup country list stops 400-ing (`geo_countries.deleted_at` does not exist live while `geoCountryService.ts:40` filters on it), and a provisioned non-Oman tenant carries country-correct scalars (no `USD`/`$`/`NONE`/`en-US`/`UTC`/`MM/DD/YYYY` ghosts).
2. **No wrong-money write path remains open** — credit notes reverse output VAT in the ledger that returns actually read; the VAT ledger carries currency/rate/base; money and rate columns can store 3-decimal OMR and 4-decimal US rates; cross-currency transfers are blocked; `record_payment` can never book USD by omission; payroll never silently deducts 7% or emits a USD "WPS" file.
3. **Wrong displayed statutory numbers fixed** — the ×100 tax-rate KPI/rows, and UTC-shifted VAT period boundaries that double-declare a month for east-of-UTC tenants.
4. **`*_base` history materialized** — idempotent backfill (`rate_source='derived_backfill'`) with SUM-parity assertions, plus standing pg_cron monitors so "schema landed, data didn't" can never recur silently.
5. **Privacy hotfixes (owner decision E7)** — `anonymize_customer_data` rewritten against the real `customers_enhanced` columns; `export_customer_data` column-allowlisted (no more `portal_password_hash` in the export JSON).
6. **Residency-ready from the start (owner decision E6)** — regime/residency seeds, the `global-1` DB invariant, and the honest-422 provisioning gate, with zero regional routing built.

## Non-goals

- **Platform subscription billing** — separate workstream (owner decision E4); reuses these primitives later but appears in NO task here.
- The tax kernel, `TaxStrategy`/plugin registry, `document_tax_lines`, `geo_country_tax_rates`, `issue_tax_document`, issued-document immutability triggers, `assert_document_tax_integrity` — all Phase 1.
- `get_next_number` v2 (fiscal templates/reset) and the full `update_number_sequence` admin/audit hardening — Phase 1 ("one release" rule). This phase ships only the anon-grant REVOKE (a pre-auth mutation hole).
- Return-shape work (`tax_return_lines`, composers, filing frequencies), `getVATRecordsByReturn` period-predicate unification — Phase 3.
- Read-side "today"/fiscal range builders (`financialService.getFinancialYearDates`, dashboard `.gte(created_at, …)` widgets, aging buckets) — Phase 1+ fiscal-period deriver. This phase sweeps only **document-date WRITE stamping** plus the VAT period seeds.
- Per-document currency display sweep (`useCurrency()` on foreign-currency rows), digit grouping, amount-in-words scales, address/paper-size rendering — Phases 1–2.
- Payroll statutory engine, WPS SIF/NACHA/BACS bank files, `master_payroll_components` packs — Phase 6. This phase only makes the wrong defaults error loudly.
- GDPR/PDPL/DPDP regime *behavior* (DSR deadlines, retention floors, erasure walker over the full PII map, Storage deletion) — Phase 6 on the regime-key pattern. This phase seeds the regime column and fixes the two broken RPCs.

## Architecture Decisions

1. **Fix the signup break by ADDING `geo_countries.deleted_at`, not by removing the filter.** The live DB has no `deleted_at` on `geo_countries` (verified 2026-07-02: `information_schema` count = 0), so the shipped `.is('deleted_at', null)` filter in `geoCountryService.ts:40` 400s the wizard's country list today. The platform convention is "all tables use `deleted_at`"; the service code and its comment already assume it. Adding the column is additive, fixes signup, and future-proofs. *Rejected alternative:* deleting the filter (spec M-0 wording) — leaves `geo_countries` the only master table without soft-delete and re-arms the same 42703 the moment anyone re-adds the conventional filter. The spec's real requirement — a PostgREST smoke test locking the endpoint — ships either way.
2. **Defaults-before-trigger fix = DROP the ghost DEFAULTs + overwrite-on-country-change trigger.** With the `'USD'`/`'$'`/`'NONE'`/`'en-US'`/`'UTC'`/`'MM/DD/YYYY'`/`'01-01'`/`'en'` DEFAULTs dropped, the BEFORE-trigger's existing COALESCEs genuinely fire on INSERT; on `UPDATE OF country_id` the trigger overwrites the 11 country-fact scalars (never `base_currency_code` — changing functional currency is a governed financial operation, not a relocation side-effect; never `ui_language` — a user preference). NOT NULL stays, so a stub country fails loudly at INSERT. *Rejected:* keeping defaults and having provisioning always send explicit values — a fragile caller contract the schema cannot enforce (the audit's exact finding).
3. **Credit-note VAT reversal via a DB trigger mirroring `post_invoice_vat_record`, not an RPC rewrite.** `post_credit_note_vat_record()` AFTER INSERT/UPDATE ON `credit_notes` posts contra `vat_records` rows — REST-unskippable, survives any future RPC change, and reuses the proven invoice-void contra pattern. The `vat_transactions` INSERTs inside `issue_credit_note`/`void_credit_note` (verified live: both reference `vat_transactions`) are stripped in the same migration, and the table is frozen by REVOKE. *Rejected:* computing reversals app-side (client-skippable) or teaching returns to read two ledgers (permanent double bookkeeping).
4. **`tenantToday` scope = document-date WRITE stamping only.** The contract mandates `tenantToday(timezone): string`. Components get the timezone from `useDateTimeConfig()`; services use a tiny RLS-scoped cached `getTenantTimezone()` (same pattern as `currencyService.getBaseCurrency`'s tenant-row fallback). The 104-site read-side sweep (range filters, aging) is Phase 1+ — stamping wrong dates onto documents is the wrong-number bug; filtering widgets a few hours off is not.
5. **Backfill semantics (resolves the live divergence the DB scout found).** 992/993 invoices are OMR-on-OMR but store `exchange_rate = 2.6` (a USD-pivot artifact) with all `*_base` NULL. Rule: rows where `currency = tenants.base_currency_code` get `exchange_rate = 1`, `*_base = round(amount, base dp)`, `rate_source = 'derived_backfill'`; foreign-currency rows get the most-recent provider rate on/before the document date (earliest-available carry-back when the document predates the 2026-05-30 rate history start), same `rate_source` key. Idempotent: every UPDATE is gated on `*_base IS NULL`. *Rejected:* honoring the stored 2.6 (books OMR invoices at 2.6× into an OMR base — provably wrong money) or hand-editing rows (not re-runnable).
6. **Cross-currency transfers are BLOCKED, not converted.** A clear error until the Phase-2 FX-transfer flow (snapshotted rate + realized-FX posting) lands. A guard is one conditional; a correct FX transfer is a feature.
7. **Payroll guards error loudly instead of guessing.** Unset `social_security_rate` → deduction skipped + loud warning (the Omani demo row keeps its correct 0.07 PASI); the bank-file emitter throws an honest "not configured for this country" error (the current output is a fake format with hardcoded `'USD'`/`'Bank Muscat'` no bank accepts). *Rejected:* threading tenant currency into the fake writer — polishing a file that is still not WPS SIF.
8. **Monitors = a SECURITY DEFINER assertion function + pg_cron (verified installed, 1.6.4) + a CI-runnable SQL script.** The function RAISEs on violations so failures surface in `cron.job_run_details` with zero new tables; the same predicate lives in `scripts/financial/check-financial-base-integrity.sql` for CI/manual runs (mirroring `detect-receipt-ledger-drift.sql`). *Rejected:* a monitoring table (schema surface for Phase 0) or CI-only checks (misses live drift between runs).
9. **Privacy hotfixes are minimal and regime-neutral.** Erasure rewritten against the real columns with neutral annotation text ("per data-subject erasure request", not "per GDPR request"); export becomes an explicit `jsonb_build_object` allowlist (never `to_jsonb(c.*)`). The full PII map/Storage walker is Phase 6.
10. **Residency: gate code ships, but `requires_local_residency` seeds FALSE for all 9 onboardable countries.** Flagging SA/GB true today would 422-block their onboarding under the global-1-only deployment, violating this phase's exit criterion ("onboarding works for every seeded country"). The gate + `global-1` CHECK + regime seeds make the platform residency-ready (owner E6); flipping a country's flag later enforces automatically with no code change. Recorded as an open question for the owner.

## Database Changes

Every migration below is applied with `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`), followed by type regen + manifest row. Names are the migration names to pass to the tool.

| # | Migration name | Purpose | Tables/functions touched | Task |
|---|---|---|---|---|
| M1 | `phase0_geo_countries_soft_delete_column` | Unbreak signup: add the `deleted_at` column the wizard query filters on | `geo_countries` | 1 |
| M2 | `phase0_tenants_ghost_defaults_and_country_sync` | Drop US ghost DEFAULTs; COALESCE-on-INSERT + overwrite-on-country-change sync; `country_id`-UPDATE resync; `_apply_country_config` full registry key set; resync live tenants | `tenants` (defaults), `sync_tenant_config_from_country()`, `_apply_country_config()`, `trg_tenants_apply_country_config` | 3 |
| M3 | `phase0_vat_records_currency_base_columns` | VAT ledger gains currency/rate/base dimensions; widen `vat_amount`/`vat_rate`; output-VAT trigger stamps them (tenant-local `tax_period`) | `vat_records`, `post_invoice_vat_record()` | 10 |
| M4 | `phase0_credit_note_vat_reversal` | Contra `vat_records` rows on credit-note issue/void; strip `vat_transactions` writes from the credit-note RPCs | `post_credit_note_vat_record()` (new), trigger on `credit_notes`, `issue_credit_note`, `void_credit_note` | 13 |
| M5 | `phase0_vat_transactions_freeze` | Freeze the dead second ledger (0 rows) — client-role REVOKE, kept forever | `vat_transactions` grants | 14 |
| M6 | `phase0_precision_and_rate_widening_sweep` | `unit_price`/line money → `numeric(19,4)`; all tax rates → `numeric(7,4)`; FX rates → `numeric(20,10)`; money tail tables → `(19,4)`; drop `'USD'` currency column DEFAULTs | `invoice_line_items`, `quote_items`, `invoices`, `quotes`, `tenants`, `geo_countries`, `receipts`, `account_transfers`, `payment_receipts`, `payment_disbursements`, `payroll_*`, `stock_*`, `vat_returns`, `vat_transactions`, `payments` | 15 |
| M7 | `phase0_base_backfill` | Idempotent `*_base` backfill (`rate_source='derived_backfill'`) for invoices/quotes/payments/receipts + rate normalization + SUM-parity assertions | data UPDATEs on `invoices`, `quotes`, `payments`, `receipts`; scratch fn `_p0_backfill_rate` (dropped in-migration) | 16 |
| M8 | `phase0_financial_null_monitors` | Standing NULL-base/NULL-rate monitor + hourly pg_cron schedule | `assert_financial_base_integrity()` (new), `cron.job` | 17 |
| M9 | `phase0_payroll_social_security_nullable` | Let the statutory rate be genuinely unset (drop DEFAULT + NOT NULL); Omani row keeps 0.07 | `payroll_settings` | 19 |
| M10 | `phase0_record_payment_no_usd_default` | `_fin_base_currency` RAISEs instead of returning `'USD'`; `record_payment` defaults omitted currency to the tenant base; proforma-conversion RPC checked for the same literal | `_fin_base_currency()`, `record_payment()`, `convert_proforma_invoice_to_tax_invoice()` | 21 |
| M11 | `phase0_privacy_anonymize_customer_rewrite` | Erasure RPC rewritten against real `customers_enhanced` columns, regime-neutral annotations | `anonymize_customer_data()` | 22 |
| M12 | `phase0_privacy_export_allowlist` | Export RPC becomes an explicit column allowlist (no `to_jsonb(c.*)`, no credential/lockout columns) | `export_customer_data()` | 23 |
| M13 | `phase0_residency_seed_and_invariant` | Seed `data_protection_regime` for all 58 countries + CHECK vocabulary; explicit `requires_local_residency=false` for the 9 onboardable; tenants `global-1` CHECK | `geo_countries` (data), `tenants` (constraint) | 25 |
| M14 | `phase0_revoke_anon_number_sequence_mutator` | Close the pre-auth EXECUTE grant on the SECURITY DEFINER sequence mutator (found live by the DB scout) | grants on `update_number_sequence(text,text,integer,boolean,integer)` | 27 |

## Backend Implementation (summary)

| Module | Change | Task |
|---|---|---|
| `src/lib/tenantToday.ts` (new) | `tenantToday(timezone)`, `tenantTodayMonth`, `addDaysIso`, `addMonthsIso`, cached `getTenantTimezone()`, `currentTenantToday()` | 6 |
| `src/lib/vatPeriods.ts` (new) | Pure `calendarQuarterBounds(year, quarter)` + `quarterOf(isoDate)` — no Date→ISO round trips | 8 |
| `src/lib/format.ts` | `formatTaxRatePercent(rate)` — the percent convention (5 = 5%) encoded once | 7 |
| `src/lib/vatService.ts` | Sum `vat_amount_base ?? vat_amount`; select/interface gain the new ledger columns | 12 |
| `src/lib/expensesService.ts` | Input-VAT writer stamps currency/rate/base; posting failures THROW; tenant-local `tax_period` fallback | 11 |
| `src/lib/bankingService.ts` | Cross-currency transfer guard in `createTransfer` | 18 |
| `src/lib/payrollService.ts` | 7% fallback removed (skip + loud warn); `generateBankFile`/`generateWPSFileContent` throw honest not-configured errors | 19, 20 |
| `src/lib/invoiceService.ts`, `leaveService.ts`, `payrollService.ts`, `performanceService.ts` | Document-date stamping via `currentTenantToday()` | 9 |
| `supabase/functions/provision-tenant/provisionGuards.ts` + `index.ts` | `assertResidencySupported` + honest 422; country select gains `requires_local_residency` | 26 |
| `scripts/country-engine/registry-mapper-parity.{ts,test.ts}` (new) | Registry↔`_apply_country_config` parity gate | 4 |
| `scripts/country-engine/provisioning-ghost-scalars.test.ts` (new) | UK fixture INSERT (rolled back) asserts no USD/NONE ghosts | 5 |
| `scripts/country-engine/signup-smoke.test.ts` (new) | Anon PostgREST probe of the wizard's exact country query | 2 |
| `scripts/financial/check-financial-base-integrity.sql` (new) | CI/manual twin of the pg_cron monitor | 17 |

## Frontend Implementation (summary)

| Surface | Change | Task |
|---|---|---|
| `src/pages/financial/VATAuditPage.tsx` | Drop both ×100s (`:291` KPI, `:468` row) via `formatTaxRatePercent`; `getDateFromFilter` on tenant-today | 7, 9 |
| `src/components/financial/VATReturnModal.tsx` | Quarter seeds/quick-select via `vatPeriods` + `tenantToday` (no `toISOString()` round trip) | 8 |
| `src/components/cases/InvoiceFormModal.tsx`, `QuoteFormModal.tsx`, `ConvertToInvoiceModal.tsx`, `src/components/financial/ExpenseFormModal.tsx`, `ExpensePaymentModal.tsx` | Default document dates via `tenantToday(timezone)` / `addDaysIso` | 9 |
| `src/types/tenantConfig.ts` | Unit-convention doc comment on `TaxConfig.defaultRate` | 7 |
| `src/pages/settings/GDPRCompliancePage.tsx` | DSR no longer stuck in `processing` when the RPC throws | 24 |
| `src/pages/payroll/PayrollPeriodDetailPage.tsx` | Bank-file export surfaces the honest error | 20 |

## APIs & Services — exact signatures created/changed this phase

```typescript
// src/lib/tenantToday.ts (NEW — canonical contract name)
export function tenantToday(timezone: string): string;                    // 'YYYY-MM-DD' in the tenant's IANA timezone
export function tenantTodayMonth(timezone: string): string;               // 'YYYY-MM'
export function addDaysIso(isoDate: string, days: number): string;        // pure calendar math, no TZ
export function addMonthsIso(isoDate: string, months: number): string;
export async function getTenantTimezone(): Promise<string>;               // RLS-scoped tenants.timezone, cached
export async function currentTenantToday(): Promise<string>;              // tenantToday(await getTenantTimezone())
export function clearTenantTodayCache(): void;

// src/lib/vatPeriods.ts (NEW)
export interface PeriodBounds { periodStart: string; periodEnd: string; }
export function calendarQuarterBounds(year: number, quarter: 1 | 2 | 3 | 4): PeriodBounds;
export function quarterOf(isoDate: string): { year: number; quarter: 1 | 2 | 3 | 4 };

// src/lib/format.ts (ADDED)
export const formatTaxRatePercent: (rate: number | null | undefined) => string;  // percent convention: 5 -> '5.00%'

// src/lib/expensesService.ts (CHANGED, module-private)
// createExpenseVATRecord args gain: currency: string | null; exchangeRate: number | null — and it now THROWS on insert error.

// src/lib/payrollService.ts (CHANGED)
// generateBankFile(periodId, format?) and generateWPSFileContent(records) now THROW (honest not-configured errors) until Phase 6.

// supabase/functions/provision-tenant/provisionGuards.ts (ADDED)
export class ResidencyNotAvailableError extends Error { readonly status: 422; }
export function assertResidencySupported(
  country: { name?: string | null; requires_local_residency?: boolean | null },
  availableRegions?: string[],                                             // defaults ['global-1']
): void;

// DB — new/changed (all SECURITY DEFINER, client grants unchanged unless stated)
// post_credit_note_vat_record() RETURNS trigger                            (NEW, AFTER INSERT OR UPDATE ON credit_notes)
// post_invoice_vat_record()     RETURNS trigger                            (CHANGED: stamps currency/exchange_rate/*_base, tenant-local tax_period)
// sync_tenant_config_from_country() RETURNS trigger                        (CHANGED: overwrite-on-country-change)
// _apply_country_config(p_tenant_id uuid) RETURNS integer                  (CHANGED: full registry key set)
// _fin_base_currency(p_tenant uuid) RETURNS text                           (CHANGED: RAISEs instead of returning 'USD')
// record_payment(p_payment jsonb, p_allocations jsonb) RETURNS payments    (signature UNCHANGED; omitted currency -> tenant base, never 'USD')
// anonymize_customer_data(p_customer_id uuid) RETURNS void                 (REWRITTEN against real columns)
// export_customer_data(p_customer_id uuid) RETURNS jsonb                   (REWRITTEN as column allowlist)
// assert_financial_base_integrity(p_lookback interval DEFAULT '25 hours') RETURNS void   (NEW monitor)
```

RESERVED (documented here, NOT built — owner E8/E9 note): the Phase 1 pack schema will create reserved keys `compliance.audit_file_exports`, `custody.unclaimed_property`, `privacy.regime`. This phase only seeds the `geo_countries.data_protection_regime` / `requires_local_residency` columns those keys will consume.

---

## File-by-File Implementation Tasks

Tasks are numbered globally. Each Work Package (WP) is one PR-able unit on a fresh branch from `main`, with its own verification. Migration tasks follow the pattern: SQL probe demonstrating the wrong/absent state (the "failing test") → apply migration → SQL probe proving the fix → regen types → manifest row.

---

### WP-1 — Onboarding unblock: `geo_countries.deleted_at` + signup smoke test
*Branch: `fix/p0-signup-geo-deleted-at` · every seeded country becomes onboardable again.*

### Task 1: `geo_countries.deleted_at` column (migration M1)

**Files:**
- Migration: `phase0_geo_countries_soft_delete_column` (via `mcp__supabase__apply_migration`)
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `supabase/migrations.manifest.md` (append row)

**Interfaces:**
- Consumes: `src/lib/geoCountryService.ts:35-45` `listOnboardableCountries()` — already queries `.eq('is_active', true).is('deleted_at', null)` and currently 400s.
- Produces: `geo_countries.deleted_at timestamptz` column that Task 2's smoke test and the wizard rely on.

- [ ] **Step 1: Write the failing probe** — run via `mcp__supabase__execute_sql` and confirm the wizard's exact predicate errors today:

```sql
SELECT count(*) FROM public.geo_countries WHERE is_active = true AND deleted_at IS NULL;
```

Expected: `ERROR: 42703: column "deleted_at" does not exist` — this is the live signup break.

- [ ] **Step 2: Apply the migration** via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`, name `phase0_geo_countries_soft_delete_column`):

```sql
ALTER TABLE public.geo_countries
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.geo_countries.deleted_at IS
  'Soft-delete marker (platform convention: all tables carry deleted_at). Added in localization Phase 0: '
  'geoCountryService.listOnboardableCountries() and the onboarding wizard filter on it; the missing column '
  '400-ed the public signup country list (42703).';
```

No RLS change needed: `geo_countries` keeps its global-master posture (SELECT `USING(true)`, writes `is_platform_admin()`).

- [ ] **Step 3: Run the passing probe:**

```sql
SELECT count(*) AS active_countries FROM public.geo_countries WHERE is_active = true AND deleted_at IS NULL;
```

Expected: `active_countries = 9` (AE, BH, GB, IN, KW, OM, QA, SA, US).

- [ ] **Step 4: Regenerate types** via `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) → overwrite `src/types/database.types.ts`. Run `npm run check:tsc` — expected: 0 errors (the `OnboardableCountry` projection in `geoCountryService.ts` does not select `deleted_at`, so no caller changes).

- [ ] **Step 5: Manifest row** — append to the table in `supabase/migrations.manifest.md`:

```markdown
| <applied-version> | phase0_geo_countries_soft_delete_column.sql | Additive | geo_countries.deleted_at (unbreaks signup country list 42703) | #TBD-PR |
```

(`<applied-version>` = the timestamp version reported by `apply_migration`; fill the PR number when the PR exists — the gate greps the `| <version> |` cell only.)

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "fix(geo): add geo_countries.deleted_at — signup country list 400s on the missing column"
```

### Task 2: PostgREST signup smoke test (CI regression lock)

**Files:**
- Create: `scripts/country-engine/signup-smoke.test.ts`
- Modify: `package.json` (one script line)
- Modify: `.github/workflows/ci.yml` (add the run line to the existing `registry-trigger-parity` job, and add `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` to that job's `env` so the live spec runs — it self-skips without them, exactly as Task 4 wires `check:registry-mapper-parity`)

**Interfaces:**
- Consumes: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env (same env the app uses); the exact column list from `src/lib/geoCountryService.ts:25-26` (`ONBOARDABLE_COLUMNS`).
- Produces: the CI gate the interface contract names "PostgREST signup smoke test" — registered as a CI gate (a run line in `ci.yml`), not merely a `package.json` script.

- [ ] **Step 1: Write the failing test** (it fails before Task 1's migration; after it, it locks the regression):

```typescript
// scripts/country-engine/signup-smoke.test.ts
//
// PostgREST smoke test for the PUBLIC (anon) signup country list — the exact
// query geoCountryService.listOnboardableCountries() issues. supabase-js does
// NOT type-check filter column names, so only a real REST round trip catches a
// missing column (the Phase-0 geo_countries.deleted_at 42703 incident).
// Self-skips when the env is absent (same policy as registry-trigger-parity).
import { describe, it, expect } from 'vitest';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const live = url && anonKey ? describe : describe.skip;

const ONBOARDABLE_COLUMNS =
  'id,code,name,currency_code,currency_symbol,is_active,language_code,tax_system,tax_label,tax_number_label,tax_number_format,fiscal_year_start,timezone';

live('signup country list (anon PostgREST)', () => {
  it('returns 200 with at least one onboardable country for the wizard query', async () => {
    const endpoint =
      `${url}/rest/v1/geo_countries?select=${ONBOARDABLE_COLUMNS}` +
      `&is_active=eq.true&deleted_at=is.null&order=name&limit=50`;
    const res = await fetch(endpoint, {
      headers: { apikey: anonKey as string, Authorization: `Bearer ${anonKey}` },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as Array<{ currency_code: string | null }>).some((c) => !!c.currency_code)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it exercises the endpoint** (with `.env` values exported):

Run: `set -a; source .env; set +a; npx vitest run --config vitest.config.scripts.ts scripts/country-engine/signup-smoke.test.ts`
Expected BEFORE Task 1's migration: FAIL with status 400 and a `42703 column geo_countries.deleted_at does not exist` body. AFTER: PASS.

- [ ] **Step 3: Add the npm script** — in `package.json` `scripts`, after `"check:registry-trigger-parity"`:

```json
"check:signup-smoke": "vitest run --config vitest.config.scripts.ts scripts/country-engine/signup-smoke.test.ts",
```

- [ ] **Step 4: Register it as a CI gate.** In `.github/workflows/ci.yml`, in the `registry-trigger-parity` job, extend its `env:` block with the anon Supabase vars and add the run line directly below the existing `- run: npm run check:registry-trigger-parity`:

```yaml
    env:
      SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
      VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
      VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

```yaml
      - run: npm run check:signup-smoke
```

(The spec self-skips when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are absent — Dependabot/fork PRs stay green — while internal PRs and push-to-main run it live, exactly the pattern the job already uses for the DB gate.)

- [ ] **Step 5: Run the full scripts suite** to confirm nothing else broke:

Run: `npm run geo:test`
Expected: PASS (live specs self-skip without env).

- [ ] **Step 6: Commit**

```bash
git add scripts/country-engine/signup-smoke.test.ts package.json .github/workflows/ci.yml
git commit -m "test(ci): anon PostgREST signup smoke test — locks the geo_countries.deleted_at regression"
```

---

### WP-2 — Tenant provisioning correctness: ghost defaults, country sync, parity gates
*Branch: `fix/p0-tenant-country-sync` · a provisioned tenant can never again carry USD/NONE ghosts; country corrections resync.*

### Task 3: Tenants ghost-default drop + authoritative country sync (migration M2)

**Files:**
- Migration: `phase0_tenants_ghost_defaults_and_country_sync`
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: live `sync_tenant_config_from_country()` (verified 2026-07-02: COALESCE-only body, defeated by column DEFAULTs), live `_apply_country_config(p_tenant_id uuid) RETURNS integer` (verified: writes 13 keys + merges `country_config`), trigger `trg_tenants_apply_country_config` (AFTER INSERT only), `resync_tenant_country_config` RPC (existing).
- Produces: DEFAULTs-free tenant scalars; overwrite-on-country-change sync; `_apply_country_config` writing the full geo-derived registry key set (consumed by Tasks 4 and 5).

- [ ] **Step 1: Failing probe — prove the ghost-default vector live** (via `mcp__supabase__execute_sql`; the transaction is rolled back):

```sql
BEGIN;
INSERT INTO public.tenants (name, slug, country_id)
SELECT 'P0 Ghost Probe', 'p0-ghost-probe', id FROM public.geo_countries WHERE code = 'OM'
RETURNING currency_code, currency_symbol, tax_system, tax_label, default_tax_rate,
          locale_code, timezone, date_format, fiscal_year_start, ui_language, base_currency_code;
ROLLBACK;
```

Expected today: `currency_code='USD', currency_symbol='$', tax_system='NONE', locale_code='en-US', timezone='UTC', date_format='MM/DD/YYYY', fiscal_year_start='01-01', ui_language='en', base_currency_code='USD'` — every value a ghost, for an OMAN tenant. (If the INSERT trips an unrelated NOT NULL — e.g. `plan_id` — add the minimal extra column to the probe; keep the RETURNING list identical.)

- [ ] **Step 2: Capture the current trigger definition** (needed to recreate it verbatim with the extended event):

```sql
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgname IN ('trg_tenants_apply_country_config', 'sync_tenant_country_config') AND NOT tgisinternal;
```

Note the EXECUTE FUNCTION name of `trg_tenants_apply_country_config` (a trigger-returning wrapper that PERFORMs `_apply_country_config(NEW.id)`); reuse it verbatim in Step 3's `CREATE TRIGGER`.

- [ ] **Step 3: Apply migration `phase0_tenants_ghost_defaults_and_country_sync`:**

> **Not copy-paste complete until Step 2 is run.** Section (4) below recreates `trg_tenants_apply_country_config` with a literal `<function-name-from-step-2>()` — the trigger's wrapper function name is live-DB-owned (not in the repo) and MUST be substituted with the exact `EXECUTE FUNCTION` name captured in Step 2's `pg_get_triggerdef` before applying. Everything else in the block is complete SQL; Step 6's `pg_get_triggerdef` assertion catches a wrong substitution.

```sql
-- 1) Kill the ghost US defaults (defaults are applied BEFORE the BEFORE-trigger,
--    so the sync COALESCEs never fired — the audit's defaults-before-trigger critical).
ALTER TABLE public.tenants
  ALTER COLUMN currency_code     DROP DEFAULT,
  ALTER COLUMN currency_symbol   DROP DEFAULT,
  ALTER COLUMN decimal_places    DROP DEFAULT,
  ALTER COLUMN tax_system        DROP DEFAULT,
  ALTER COLUMN tax_label         DROP DEFAULT,
  ALTER COLUMN tax_number_label  DROP DEFAULT,
  ALTER COLUMN default_tax_rate  DROP DEFAULT,
  ALTER COLUMN locale_code       DROP DEFAULT,
  ALTER COLUMN timezone          DROP DEFAULT,
  ALTER COLUMN date_format       DROP DEFAULT,
  ALTER COLUMN fiscal_year_start DROP DEFAULT,
  ALTER COLUMN ui_language       DROP DEFAULT;
-- NOT NULL stays on all of them: a stub country (NULL currency_code) now fails the
-- INSERT loudly instead of minting a USD tenant.

-- 2) Sync trigger: COALESCE on INSERT (now genuinely effective), OVERWRITE on country change.
CREATE OR REPLACE FUNCTION public.sync_tenant_config_from_country()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cc public.geo_countries%ROWTYPE;
BEGIN
  IF NEW.country_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO cc FROM public.geo_countries WHERE id = NEW.country_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND NEW.country_id IS DISTINCT FROM OLD.country_id THEN
    -- Country correction/relocation: the new country's facts are authoritative.
    -- base_currency_code is deliberately NOT overwritten (changing the functional
    -- currency is a governed financial operation, not a relocation side effect);
    -- ui_language is a user preference, also untouched.
    NEW.currency_code     := cc.currency_code;
    NEW.currency_symbol   := cc.currency_symbol;
    NEW.decimal_places    := cc.decimal_places;
    NEW.tax_system        := cc.tax_system;
    NEW.tax_label         := cc.tax_label;
    NEW.tax_number_label  := cc.tax_number_label;
    NEW.default_tax_rate  := cc.default_tax_rate;
    NEW.locale_code       := cc.locale_code;
    NEW.timezone          := cc.timezone;
    NEW.date_format       := cc.date_format;
    NEW.fiscal_year_start := cc.fiscal_year_start;
  ELSE
    NEW.currency_code     := COALESCE(NEW.currency_code, cc.currency_code);
    NEW.currency_symbol   := COALESCE(NEW.currency_symbol, cc.currency_symbol);
    NEW.decimal_places    := COALESCE(NEW.decimal_places, cc.decimal_places);
    NEW.tax_system        := COALESCE(NEW.tax_system, cc.tax_system);
    NEW.tax_label         := COALESCE(NEW.tax_label, cc.tax_label);
    NEW.tax_number_label  := COALESCE(NEW.tax_number_label, cc.tax_number_label);
    NEW.default_tax_rate  := COALESCE(NEW.default_tax_rate, cc.default_tax_rate);
    NEW.locale_code       := COALESCE(NEW.locale_code, cc.locale_code);
    NEW.timezone          := COALESCE(NEW.timezone, cc.timezone);
    NEW.date_format       := COALESCE(NEW.date_format, cc.date_format);
    NEW.fiscal_year_start := COALESCE(NEW.fiscal_year_start, cc.fiscal_year_start);
    NEW.ui_language       := COALESCE(NEW.ui_language,
                                      CASE WHEN cc.language_code = 'ar' THEN 'ar' ELSE 'en' END);
    NEW.base_currency_code := COALESCE(NEW.base_currency_code, NEW.currency_code, cc.currency_code);
  END IF;
  RETURN NEW;
END $function$;

-- 3) Snapshot mapper: FULL geo-derived registry key set (was 13 keys; the audit's
--    "tax.system / separators / week_starts_on / fiscal_year_start never reach the
--    snapshot" High). Explicit keys win over the raw country_config merge below only
--    where country_config lacks the flat key (jsonb || keeps the right-hand value),
--    so explicit keys are listed AFTER the merge to be authoritative.
CREATE OR REPLACE FUNCTION public._apply_country_config(p_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cc public.geo_countries%ROWTYPE; v_bag jsonb; v_ver integer;
BEGIN
  SELECT gc.* INTO v_cc FROM public.tenants t JOIN public.geo_countries gc ON gc.id = t.country_id
  WHERE t.id = p_tenant_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_ver := COALESCE(v_cc.config_version, 1);
  v_bag := COALESCE(v_cc.country_config, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'currency.code',                 v_cc.currency_code,
    'currency.symbol',               v_cc.currency_symbol,
    'currency.decimal_places',       v_cc.decimal_places,
    'currency.position',             v_cc.currency_position,
    'currency.decimal_separator',    v_cc.decimal_separator,
    'currency.thousands_separator',  v_cc.thousands_separator,
    'tax.system',                    v_cc.tax_system,
    'tax.label',                     v_cc.tax_label,
    'tax.number_label',              v_cc.tax_number_label,
    'tax.number_format',             v_cc.tax_number_format,
    'tax.default_rate',              v_cc.default_tax_rate,
    'tax.invoice_required',          v_cc.tax_invoice_required,
    'locale.code',                   v_cc.locale_code,
    'datetime.date_format',          v_cc.date_format,
    'datetime.time_format',          v_cc.time_format,
    'datetime.timezone',             v_cc.timezone,
    'datetime.week_starts_on',       v_cc.week_starts_on,
    'datetime.fiscal_year_start',    v_cc.fiscal_year_start,
    'datetime.weekend_days',         to_jsonb(COALESCE(v_cc.weekend_days, '{6,0}'::int[])),
    'number_format.digit_grouping',  v_cc.digit_grouping,
    'number_format.amount_in_words_minor_units',
        COALESCE((SELECT mcc.decimal_places FROM public.master_currency_codes mcc
                  WHERE mcc.code = v_cc.currency_code), v_cc.decimal_places),
    'address.format',                v_cc.address_format
  ));
  UPDATE public.tenants
    SET resolved_country_config = v_bag, country_config_version = v_ver
    WHERE id = p_tenant_id;
  RETURN v_ver;
END $function$;

-- 4) Resync fires on country correction too (was AFTER INSERT only).
--    Recreate with the EXACT function name captured in Step 2's pg_get_triggerdef.
DROP TRIGGER IF EXISTS trg_tenants_apply_country_config ON public.tenants;
CREATE TRIGGER trg_tenants_apply_country_config
  AFTER INSERT OR UPDATE OF country_id ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION <function-name-from-step-2>();

-- 5) Refresh every live tenant's snapshot with the full key set (idempotent).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT id FROM public.tenants WHERE deleted_at IS NULL AND country_id IS NOT NULL LOOP
    PERFORM public._apply_country_config(t.id);
  END LOOP;
END $$;
```

(`<function-name-from-step-2>` is the one mechanical substitution — the wrapper name is live-DB-owned and not present in the repo; the Step 6 assertion catches a wrong name.)

- [ ] **Step 4: Passing probe — rerun Step 1's rolled-back INSERT.** Expected: `currency_code='OMR', currency_symbol='ر.ع.', tax_system='VAT', tax_label='VAT', default_tax_rate=5.00, locale_code='ar-OM', timezone='Asia/Muscat', date_format='DD/MM/YYYY', fiscal_year_start='01-01', ui_language='ar', base_currency_code='OMR'`.

- [ ] **Step 5: Country-change probe** (rolled back):

```sql
BEGIN;
WITH om AS (SELECT id FROM public.geo_countries WHERE code='OM'),
     gb AS (SELECT id FROM public.geo_countries WHERE code='GB'),
     ins AS (
       INSERT INTO public.tenants (name, slug, country_id)
       SELECT 'P0 Move Probe', 'p0-move-probe', id FROM om RETURNING id, base_currency_code)
UPDATE public.tenants SET country_id = (SELECT id FROM gb)
WHERE id = (SELECT id FROM ins)
RETURNING currency_code, tax_label, timezone, date_format, fiscal_year_start, base_currency_code;
ROLLBACK;
```

Expected: `currency_code='GBP', tax_label='VAT', timezone='Europe/London', date_format='DD/MM/YYYY', fiscal_year_start='04-06'` — and `base_currency_code` STILL `'OMR'` (never overwritten). Also verify the AFTER trigger refreshed the snapshot: within the same transaction `SELECT resolved_country_config->>'currency.code' FROM tenants WHERE slug='p0-move-probe'` → `GBP`.

- [ ] **Step 6: Assert the trigger + mapper shape:**

```sql
SELECT pg_get_triggerdef(oid) ILIKE '%OR UPDATE OF country_id%' AS resync_on_update
FROM pg_trigger WHERE tgname = 'trg_tenants_apply_country_config';
SELECT pg_get_functiondef(p.oid) ILIKE '%tax.system%'
   AND pg_get_functiondef(p.oid) ILIKE '%datetime.fiscal_year_start%'
   AND pg_get_functiondef(p.oid) ILIKE '%currency.decimal_separator%' AS mapper_full
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='_apply_country_config';
SELECT count(*) AS remaining_ghost_defaults FROM information_schema.columns
WHERE table_schema='public' AND table_name='tenants' AND column_default IS NOT NULL
  AND column_name IN ('currency_code','currency_symbol','decimal_places','tax_system','tax_label',
                      'tax_number_label','default_tax_rate','locale_code','timezone','date_format',
                      'fiscal_year_start','ui_language');
```

Expected: `resync_on_update=true`, `mapper_full=true`, `remaining_ghost_defaults=0`.

- [ ] **Step 7: Regen types + typecheck.** `mcp__supabase__generate_typescript_types` → `src/types/database.types.ts`; run `npm run check:tsc` (expected 0 — defaults becoming optional-less does not change generated Insert types' optionality for NOT NULL columns without defaults: they become REQUIRED. If tsc surfaces callers inserting into `tenants` without these fields, they are exactly the ghost-vector callers this fix targets — the only known writer is `provision-tenant` (Deno, not tsc-checked) which explicitly relies on the trigger; document any other site found and fix it to pass `country_id`).

- [ ] **Step 8: Manifest row + commit**

```markdown
| <applied-version> | phase0_tenants_ghost_defaults_and_country_sync.sql | Conditional | Drop US ghost defaults on tenants country scalars; overwrite-on-country-change sync; country_id-UPDATE resync; _apply_country_config full key set; live resync | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "fix(tenancy): tenants country scalars sync authoritatively — ghost USD defaults dropped, country_id updates resync"
```

### Task 4: Registry↔mapper parity gate

**Files:**
- Create: `scripts/country-engine/registry-mapper-parity.ts`
- Create: `scripts/country-engine/registry-mapper-parity.test.ts`
- Modify: `package.json` (one script line)
- Modify: `.github/workflows/ci.yml` (add the run line to the existing `registry-trigger-parity` job)

**Interfaces:**
- Consumes: `COUNTRY_CONFIG_REGISTRY` (array of `ConfigKeyDef { key: string; … }`) from `src/lib/country/registry.ts`; `pg_get_functiondef` of `_apply_country_config` (Task 3's full-key version); the psql-glue pattern of `scripts/country-engine/registry-trigger-parity.test.ts`.
- Produces: `parseMapperKeys(funcDef: string): string[]`, `diffMapperKeys(registryKeys: string[], mapperKeys: string[]): { missingInMapper: string[]; inParity: boolean }`, `CODED_DEFAULT_KEYS: Set<string>` — the CI gate the contract names "Registry↔mapper parity test".

- [ ] **Step 1: Write the failing unit test:**

```typescript
// scripts/country-engine/registry-mapper-parity.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { COUNTRY_CONFIG_REGISTRY } from '../../src/lib/country/registry';
import { parseMapperKeys, diffMapperKeys, CODED_DEFAULT_KEYS } from './registry-mapper-parity';

const SAMPLE_DEF = `
CREATE OR REPLACE FUNCTION public._apply_country_config(p_tenant_id uuid)
AS $function$ ... jsonb_build_object(
  'currency.code', v_cc.currency_code,
  'tax.label', v_cc.tax_label,
  'datetime.timezone', v_cc.timezone
) ... $function$`;

describe('parseMapperKeys', () => {
  it('extracts dotted config keys from a functiondef', () => {
    expect(parseMapperKeys(SAMPLE_DEF)).toEqual(['currency.code', 'tax.label', 'datetime.timezone']);
  });
  it('returns [] for a body with no keys (missing/renamed function fails loud downstream)', () => {
    expect(parseMapperKeys('CREATE FUNCTION x() ...')).toEqual([]);
  });
});

describe('diffMapperKeys', () => {
  it('flags registry keys the mapper does not write, excluding coded-default keys', () => {
    const registry = ['currency.code', 'tax.label', 'tax.default_rate', 'currency.display_mode'];
    const { missingInMapper, inParity } = diffMapperKeys(registry, ['currency.code', 'tax.label']);
    expect(missingInMapper).toEqual(['tax.default_rate']); // display_mode is coded-default, excluded
    expect(inParity).toBe(false);
  });
});

const dbUrl = process.env.SUPABASE_DB_URL;
const live = dbUrl ? describe : describe.skip;

live('live _apply_country_config covers the geo-derived registry keys', () => {
  it('every non-coded-default registry key appears in the mapper body', () => {
    const def = execFileSync(
      'psql',
      [dbUrl as string, '-tA', '-c',
       "SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_apply_country_config'"],
      { encoding: 'utf8' },
    );
    const registryKeys = COUNTRY_CONFIG_REGISTRY.map((d) => d.key);
    expect(registryKeys.length).toBeGreaterThan(0);
    const diff = diffMapperKeys(registryKeys, parseMapperKeys(def));
    expect(diff.missingInMapper, `mapper missing keys: ${diff.missingInMapper.join(', ')}`).toEqual([]);
    expect(CODED_DEFAULT_KEYS.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails:**

Run: `npx vitest run --config vitest.config.scripts.ts scripts/country-engine/registry-mapper-parity.test.ts`
Expected: FAIL — `Cannot find module './registry-mapper-parity'`.

- [ ] **Step 3: Minimal implementation:**

```typescript
// scripts/country-engine/registry-mapper-parity.ts
//
// Registry <-> DB-snapshot-mapper parity (localization Phase 0). The TS registry
// (src/lib/country/registry.ts) declares the config keys tenants resolve; the DB
// mapper _apply_country_config() writes the snapshot bag. Keys sourced from coded
// defaults / governed jsonb (not geo_countries columns) are exempt.
export const CODED_DEFAULT_KEYS: Set<string> = new Set([
  'currency.display_mode',   // tenant preference, codedDefault
  'currency.negative_format',// tenant preference, codedDefault
  'tax.zatca_qr.enabled',    // governed via country_config jsonb, not a geo column
]);

/** Dotted config-key literals ('domain.key') inside a pg_get_functiondef body. */
export function parseMapperKeys(funcDef: string): string[] {
  return [...funcDef.matchAll(
    /'((?:currency|tax|datetime|locale|number_format|address)\.[A-Za-z0-9_.]+)'/g,
  )].map((m) => m[1]);
}

export function diffMapperKeys(
  registryKeys: string[],
  mapperKeys: string[],
): { missingInMapper: string[]; inParity: boolean } {
  const mapper = new Set(mapperKeys);
  const missingInMapper = registryKeys
    .filter((k) => !CODED_DEFAULT_KEYS.has(k) && !mapper.has(k))
    .sort();
  return { missingInMapper, inParity: missingInMapper.length === 0 };
}
```

- [ ] **Step 4: Run tests, verify pass:**

Run: `npx vitest run --config vitest.config.scripts.ts scripts/country-engine/registry-mapper-parity.test.ts`
Expected: PASS (unit tests; live spec skips without `SUPABASE_DB_URL`, passes with it once Task 3 is applied).

- [ ] **Step 5: Wire the gate.** `package.json` scripts (after `check:registry-trigger-parity`):

```json
"check:registry-mapper-parity": "vitest run --config vitest.config.scripts.ts scripts/country-engine/registry-mapper-parity.test.ts",
```

In `.github/workflows/ci.yml`, locate the `registry-trigger-parity` job's run step and add directly below its existing command:

```yaml
      - run: npm run check:registry-mapper-parity
```

- [ ] **Step 6: Commit**

```bash
git add scripts/country-engine/registry-mapper-parity.ts scripts/country-engine/registry-mapper-parity.test.ts package.json .github/workflows/ci.yml
git commit -m "test(ci): registry<->_apply_country_config parity gate — snapshot mapper can no longer drift from the registry"
```

### Task 5: Provisioning ghost-scalar integration test (UK fixture)

**Files:**
- Create: `scripts/country-engine/provisioning-ghost-scalars.test.ts`
- Modify: `package.json` (one script line)
- Modify: `.github/workflows/ci.yml` (add the run line to the existing `registry-trigger-parity` job — the job already exposes `SUPABASE_DB_URL`, so no env change; mirrors Task 4's `check:registry-mapper-parity` wiring)

**Interfaces:**
- Consumes: Task 3's authoritative sync; `SUPABASE_DB_URL` psql glue (registry-trigger-parity pattern).
- Produces: the contract's "Provisioning integration test — UK fixture tenant asserts no USD/NONE ghost scalars" — registered as a CI gate (a run line in `ci.yml`), not merely a `package.json` script.

- [ ] **Step 1: Write the failing test:**

```typescript
// scripts/country-engine/provisioning-ghost-scalars.test.ts
//
// Provisioning correctness gate (localization Phase 0): a tenants INSERT that
// provides ONLY country_id must come out with the country's scalars — never the
// historical USD/'$'/NONE/en-US/UTC/MM-DD ghosts. Runs a rolled-back transaction
// against the live DB; self-skips without SUPABASE_DB_URL.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

const dbUrl = process.env.SUPABASE_DB_URL;
const live = dbUrl ? describe : describe.skip;

function psqlRows(sql: string): string[] {
  return execFileSync('psql', [dbUrl as string, '-tA', '-F', '|', '-c', sql], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
}

live('tenant provisioning carries country facts (UK fixture)', () => {
  it('a GB tenant INSERT has zero USD/NONE ghosts', () => {
    const rows = psqlRows(`
      BEGIN;
      INSERT INTO public.tenants (name, slug, country_id)
      SELECT 'P0 UK Fixture', 'p0-uk-fixture', id FROM public.geo_countries WHERE code = 'GB';
      SELECT currency_code || '|' || currency_symbol || '|' || tax_system || '|' || tax_label || '|' ||
             locale_code || '|' || timezone || '|' || date_format || '|' || fiscal_year_start || '|' ||
             base_currency_code
      FROM public.tenants WHERE slug = 'p0-uk-fixture';
      ROLLBACK;
    `);
    const fixture = rows.find((r) => r.includes('GBP')) ?? rows[rows.length - 1] ?? '';
    const [currency, symbol, taxSystem, taxLabel, locale, tz, dateFormat, fy, base] = fixture.split('|');
    expect(currency).toBe('GBP');
    expect(symbol).toBe('£');
    expect(taxSystem).toBe('VAT');
    expect(taxLabel).toBe('VAT');
    expect(locale).not.toBe('en-US');
    expect(tz).toBe('Europe/London');
    expect(dateFormat).toBe('DD/MM/YYYY');
    expect(fy).toBe('04-06');
    expect(base).toBe('GBP');
  });
});
```

- [ ] **Step 2: Run it, verify behavior:**

Run: `SUPABASE_DB_URL=<url> npx vitest run --config vitest.config.scripts.ts scripts/country-engine/provisioning-ghost-scalars.test.ts`
Expected BEFORE Task 3's migration: FAIL (`currency` is `'USD'`). AFTER: PASS. Without the env: SKIP.

- [ ] **Step 3: Add npm script:**

```json
"check:provisioning-ghost-scalars": "vitest run --config vitest.config.scripts.ts scripts/country-engine/provisioning-ghost-scalars.test.ts",
```

- [ ] **Step 4: Register it as a CI gate.** In `.github/workflows/ci.yml`, in the `registry-trigger-parity` job, add the run line directly below the existing `- run: npm run check:registry-trigger-parity` (the job already sets `SUPABASE_DB_URL` in its `env`; the spec self-skips without it):

```yaml
      - run: npm run check:provisioning-ghost-scalars
```

- [ ] **Step 5: Commit**

```bash
git add scripts/country-engine/provisioning-ghost-scalars.test.ts package.json .github/workflows/ci.yml
git commit -m "test(ci): UK-fixture provisioning gate — a new tenant can never carry USD/NONE ghost scalars"
```

---

### WP-3 — `tenantToday` + tax-rate display + VAT period boundaries + date-stamp sweep
*Branch: `fix/p0-tenant-today-and-vat-display` · frontend/service only, no migrations.*

### Task 6: `src/lib/tenantToday.ts` — the tenant-timezone "today" primitive

**Files:**
- Create: `src/lib/tenantToday.ts`
- Test: `src/lib/tenantToday.test.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabaseClient` (RLS-scoped `tenants.timezone` read — same pattern as `currencyService.getBaseCurrency`'s tenant-row fallback at `src/lib/currencyService.ts:96-105`).
- Produces (canonical contract name): `tenantToday(timezone: string): string`; plus `tenantTodayMonth(timezone: string): string`, `addDaysIso(isoDate: string, days: number): string`, `addMonthsIso(isoDate: string, months: number): string`, `getTenantTimezone(): Promise<string>`, `currentTenantToday(): Promise<string>`, `clearTenantTodayCache(): void`. Tasks 8, 9, 11 consume these.

- [ ] **Step 1: Write the failing test** (node project; the vitest TZ pin `Asia/Dubai` makes the UTC-divergence assertions deterministic):

```typescript
// src/lib/tenantToday.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const maybeSingle = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle })) })),
    })),
  },
}));

import {
  tenantToday, tenantTodayMonth, addDaysIso, addMonthsIso,
  getTenantTimezone, currentTenantToday, clearTenantTodayCache,
} from './tenantToday';

describe('tenantToday (pure)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the tenant-local calendar date, not the UTC date', () => {
    // 2026-06-30 22:30 UTC = 2026-07-01 02:30 in Muscat (UTC+4), 18:30 in New York (UTC-4)
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));
    expect(tenantToday('Asia/Muscat')).toBe('2026-07-01');
    expect(tenantToday('America/New_York')).toBe('2026-06-30');
    expect(tenantToday('UTC')).toBe('2026-06-30');
    // the pattern this helper replaces stamps the WRONG day for Muscat:
    expect(new Date().toISOString().split('T')[0]).toBe('2026-06-30');
  });

  it('tenantTodayMonth returns YYYY-MM in tenant time', () => {
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));
    expect(tenantTodayMonth('Asia/Muscat')).toBe('2026-07');
    expect(tenantTodayMonth('UTC')).toBe('2026-06');
  });

  it('throws on an invalid IANA zone (fail-loud, no silent UTC)', () => {
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));
    expect(() => tenantToday('Not/AZone')).toThrow();
  });
});

describe('date math (pure, timezone-free)', () => {
  it('addDaysIso handles month/year rollover', () => {
    expect(addDaysIso('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysIso('2026-12-02', 30)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('addMonthsIso handles year boundaries and negatives', () => {
    expect(addMonthsIso('2026-01-15', -3)).toBe('2025-10-15');
    expect(addMonthsIso('2026-11-15', 2)).toBe('2027-01-15');
  });
});

describe('getTenantTimezone / currentTenantToday', () => {
  beforeEach(() => { clearTenantTodayCache(); maybeSingle.mockReset(); });

  it('reads tenants.timezone once and caches it', async () => {
    maybeSingle.mockResolvedValue({ data: { timezone: 'Asia/Muscat' }, error: null });
    expect(await getTenantTimezone()).toBe('Asia/Muscat');
    expect(await getTenantTimezone()).toBe('Asia/Muscat');
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('throws loudly when no timezone is configured', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getTenantTimezone()).rejects.toThrow('no timezone');
  });

  it('currentTenantToday composes both', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));
    maybeSingle.mockResolvedValue({ data: { timezone: 'Asia/Muscat' }, error: null });
    expect(await currentTenantToday()).toBe('2026-07-01');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run it, verify it fails:**

Run: `npx vitest run src/lib/tenantToday.test.ts`
Expected: FAIL — `Cannot find module './tenantToday'`.

- [ ] **Step 3: Minimal implementation:**

```typescript
// src/lib/tenantToday.ts
//
// The tenant-timezone "current date" primitive (localization Phase 0, canonical
// contract src/lib/tenantToday.ts). Replaces `new Date().toISOString().split('T')[0]`
// on every DOCUMENT-DATE write path: that pattern stamps the UTC calendar day, which
// for any UTC+ tenant (e.g. Muscat, UTC+4) is YESTERDAY between local 00:00 and the
// offset — wrong tax point and wrong VAT period at month/quarter boundaries.
import { supabase } from './supabaseClient';

/** 'YYYY-MM-DD' for "now" in the given IANA timezone. Throws on an invalid zone. */
export function tenantToday(timezone: string): string {
  // en-CA formats as YYYY-MM-DD; Intl throws RangeError on a bad zone (fail-loud).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** 'YYYY-MM' for "now" in the given IANA timezone (vat_records.tax_period shape). */
export function tenantTodayMonth(timezone: string): string {
  return tenantToday(timezone).slice(0, 7);
}

/** Pure calendar-day arithmetic on 'YYYY-MM-DD' strings — no timezone involved. */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Pure calendar-month arithmetic on 'YYYY-MM-DD' strings. */
export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

let timezoneCache: string | null = null;

/** The tenant's IANA timezone (RLS scopes the tenants read to the caller). Cached. */
export async function getTenantTimezone(): Promise<string> {
  if (timezoneCache) return timezoneCache;
  const { data, error } = await supabase.from('tenants').select('timezone').limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.timezone) throw new Error('Tenant has no timezone configured');
  timezoneCache = data.timezone;
  return data.timezone;
}

/** Convenience for service-layer (non-React) document-date stamping. */
export async function currentTenantToday(): Promise<string> {
  return tenantToday(await getTenantTimezone());
}

export function clearTenantTodayCache(): void {
  timezoneCache = null;
}
```

- [ ] **Step 4: Run tests, verify pass:**

Run: `npx vitest run src/lib/tenantToday.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenantToday.ts src/lib/tenantToday.test.ts
git commit -m "feat(datetime): tenantToday — tenant-timezone current-date primitive for document-date stamping"
```

### Task 7: Tax-rate percent convention — `formatTaxRatePercent` + VATAuditPage ×100 fixes

**Files:**
- Modify: `src/lib/format.ts` (add one export)
- Modify: `src/pages/financial/VATAuditPage.tsx:291` and `:468`
- Modify: `src/types/tenantConfig.ts:34` (doc comment)
- Test: `src/lib/format.test.ts` (add cases)

**Interfaces:**
- Consumes: `useTaxConfig()` (`src/contexts/TenantConfigContext.tsx:130`) — `TaxConfig.defaultRate` is a PERCENT (live value 5.00 for Oman, populated at `src/lib/tenantConfigService.ts:171`).
- Produces: `formatTaxRatePercent(rate: number | null | undefined): string` in `src/lib/format.ts` — the single encoding of the percent convention; later phases reuse it.

- [ ] **Step 1: Write the failing test** — append to `src/lib/format.test.ts`:

```typescript
import { formatTaxRatePercent } from './format';

describe('formatTaxRatePercent', () => {
  it('renders stored-percent rates directly — 5 means 5%, never 500%', () => {
    expect(formatTaxRatePercent(5)).toBe('5.00%');
    expect(formatTaxRatePercent(20)).toBe('20.00%');
    expect(formatTaxRatePercent(8.875)).toBe('8.88%');
  });
  it('treats null/undefined as 0', () => {
    expect(formatTaxRatePercent(null)).toBe('0.00%');
    expect(formatTaxRatePercent(undefined)).toBe('0.00%');
  });
});
```

- [ ] **Step 2: Run it, verify it fails:**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — `formatTaxRatePercent` is not exported.

- [ ] **Step 3: Implement.** In `src/lib/format.ts`, after `formatPercent` (line ~206):

```typescript
/**
 * Tax rates are stored as PERCENT platform-wide (5 = 5%, 20 = 20%) — proven by the
 * live geo values (OM default_tax_rate 5.00, GB 20.00) and the registry max(100).
 * NEVER multiply by 100 before rendering; that is the '500.00%' compliance-page bug.
 */
export const formatTaxRatePercent = (rate: number | null | undefined): string =>
  `${Number(rate ?? 0).toFixed(2)}%`;
```

In `src/pages/financial/VATAuditPage.tsx` (import `formatTaxRatePercent` from `'../../lib/format'`):

Line 291, replace:
```tsx
                    value: `${(taxConfig.defaultRate * 100).toFixed(2)}%`,
```
with:
```tsx
                    value: formatTaxRatePercent(taxConfig.defaultRate),
```

Line 468, replace:
```tsx
                              {(record.vat_rate * 100).toFixed(2)}%
```
with:
```tsx
                              {formatTaxRatePercent(record.vat_rate)}
```

In `src/types/tenantConfig.ts`, on the `defaultRate` member of `TaxConfig` (line 34), add the doc comment:

```typescript
  /** PERCENT convention: 5 = 5% (never a fraction 0.05). Divide by 100 only inside money math. */
  defaultRate: number;
```

- [ ] **Step 4: Run tests + typecheck:**

Run: `npx vitest run src/lib/format.test.ts && npm run check:tsc`
Expected: PASS / 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/pages/financial/VATAuditPage.tsx src/types/tenantConfig.ts
git commit -m "fix(vat): drop the x100 on stored-percent tax rates — Oman showed 500.00% on the compliance page"
```

### Task 8: VAT period boundaries — `vatPeriods.ts` + VATReturnModal UTC fix

**Files:**
- Create: `src/lib/vatPeriods.ts`
- Test: `src/lib/vatPeriods.test.ts`
- Modify: `src/components/financial/VATReturnModal.tsx:46-54`, `:102-108`, `:110`

**Interfaces:**
- Consumes: `tenantToday(timezone)` (Task 6); `useDateTimeConfig()` from `src/contexts/TenantConfigContext.tsx:135` (provides `timezone`).
- Produces: `calendarQuarterBounds(year: number, quarter: 1 | 2 | 3 | 4): PeriodBounds` and `quarterOf(isoDate: string): { year: number; quarter: 1 | 2 | 3 | 4 }` — pure string math, no `Date -> toISOString()` round trip anywhere.

- [ ] **Step 1: Write the failing test:**

```typescript
// src/lib/vatPeriods.test.ts
import { describe, it, expect } from 'vitest';
import { calendarQuarterBounds, quarterOf } from './vatPeriods';

describe('calendarQuarterBounds', () => {
  it('builds month-aligned bounds as pure strings (never a UTC round trip)', () => {
    expect(calendarQuarterBounds(2026, 1)).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-03-31' });
    expect(calendarQuarterBounds(2026, 2)).toEqual({ periodStart: '2026-04-01', periodEnd: '2026-06-30' });
    expect(calendarQuarterBounds(2026, 3)).toEqual({ periodStart: '2026-07-01', periodEnd: '2026-09-30' });
    expect(calendarQuarterBounds(2026, 4)).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-12-31' });
  });
  it('handles leap February in Q1', () => {
    expect(calendarQuarterBounds(2028, 1).periodEnd).toBe('2028-03-31'); // Q1 end is March regardless
    expect(calendarQuarterBounds(2028, 1).periodStart).toBe('2028-01-01');
  });
  // Regression: the old code did `new Date(y, m, 1).toISOString().split('T')[0]`,
  // which in any UTC+ browser shifted Jul 1 -> Jun 30 and (via month-slice
  // bucketing in calculateVATForPeriod) double-declared an entire month.
  it('Q3 start is July 1 exactly — the double-declared-month regression', () => {
    expect(calendarQuarterBounds(2026, 3).periodStart).toBe('2026-07-01');
    expect(calendarQuarterBounds(2026, 3).periodStart).not.toBe('2026-06-30');
  });
});

describe('quarterOf', () => {
  it('maps a tenant-local date to its calendar quarter', () => {
    expect(quarterOf('2026-01-01')).toEqual({ year: 2026, quarter: 1 });
    expect(quarterOf('2026-06-30')).toEqual({ year: 2026, quarter: 2 });
    expect(quarterOf('2026-07-01')).toEqual({ year: 2026, quarter: 3 });
    expect(quarterOf('2026-12-31')).toEqual({ year: 2026, quarter: 4 });
  });
});
```

- [ ] **Step 2: Run it, verify it fails:**

Run: `npx vitest run src/lib/vatPeriods.test.ts`
Expected: FAIL — `Cannot find module './vatPeriods'`.

- [ ] **Step 3: Implement:**

```typescript
// src/lib/vatPeriods.ts
//
// Calendar-quarter period bounds as PURE STRING math (localization Phase 0).
// Never construct a local-midnight Date and serialize via toISOString(): for any
// UTC+ tenant that shifts the boundary a day, and calculateVATForPeriod's
// month-slice bucketing amplifies the shifted day into a DOUBLE-DECLARED MONTH
// across consecutive quarterly returns. Country/tenant filing frequencies and
// fiscal anchors arrive with the Phase-3 ReturnComposer; these calendar quarters
// are the Phase-0 (GCC-correct) default.
export interface PeriodBounds { periodStart: string; periodEnd: string; }

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Last day-of-month via UTC construction only (no local-zone Date in play). */
const daysInMonth = (year: number, month1to12: number): number =>
  new Date(Date.UTC(year, month1to12, 0)).getUTCDate();

export function calendarQuarterBounds(year: number, quarter: 1 | 2 | 3 | 4): PeriodBounds {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    periodStart: `${year}-${pad2(startMonth)}-01`,
    periodEnd: `${year}-${pad2(endMonth)}-${pad2(daysInMonth(year, endMonth))}`,
  };
}

export function quarterOf(isoDate: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const [y, m] = isoDate.split('-').map(Number);
  return { year: y, quarter: (Math.floor((m - 1) / 3) + 1) as 1 | 2 | 3 | 4 };
}
```

- [ ] **Step 4: Run tests, verify pass:**

Run: `npx vitest run src/lib/vatPeriods.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire `VATReturnModal.tsx`.** Add imports and the timezone hook:

```typescript
import { calendarQuarterBounds, quarterOf } from '../../lib/vatPeriods';
import { tenantToday } from '../../lib/tenantToday';
import { useDateTimeConfig } from '../../contexts/TenantConfigContext';
```

Inside the component (after line 38's `useCurrency()`): `const { timezone } = useDateTimeConfig();`

Replace lines 46–54 (the default-quarter effect) with:

```tsx
  useEffect(() => {
    const { year, quarter } = quarterOf(tenantToday(timezone));
    const bounds = calendarQuarterBounds(year, quarter);
    setPeriodStart(bounds.periodStart);
    setPeriodEnd(bounds.periodEnd);
  }, [isOpen, timezone]);
```

Replace lines 102–108 (`setQuarterPeriod`) with:

```tsx
  const setQuarterPeriod = (quarter: number, year: number) => {
    const bounds = calendarQuarterBounds(year, quarter as 1 | 2 | 3 | 4);
    setPeriodStart(bounds.periodStart);
    setPeriodEnd(bounds.periodEnd);
  };
```

Replace line 110 with:

```tsx
  const currentYear = quarterOf(tenantToday(timezone)).year;
```

- [ ] **Step 6: Typecheck + full test run:**

Run: `npm run check:tsc && npx vitest run src/lib/vatPeriods.test.ts src/lib/tenantToday.test.ts`
Expected: 0 errors / PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/vatPeriods.ts src/lib/vatPeriods.test.ts src/components/financial/VATReturnModal.tsx
git commit -m "fix(vat): quarter bounds as pure tenant-local strings — kills the UTC+ double-declared-month return bug"
```

### Task 9: Document-date stamping sweep — every UTC stamp onto `tenantToday`

**Files:** (each row of the sweep table below)
**Interfaces:**
- Consumes: `tenantToday`, `addDaysIso`, `addMonthsIso`, `currentTenantToday` (Task 6); `useDateTimeConfig()` in components.
- Produces: no new interfaces — behavioral fix only.

The complete sweep. "Component" rows add `const { timezone } = useDateTimeConfig();` (import from the appropriate relative path to `contexts/TenantConfigContext`) plus imports from `'../../lib/tenantToday'`. "Service" rows hoist `const today = await currentTenantToday();` immediately before the edited expression (all listed service sites are inside `async` functions — verify each when editing; if a site is inside a non-async callback, hoist the `await` to the nearest enclosing async scope above the callback).

| # | File : line (verified 2026-07-02) | Old (exact) | New (exact) |
|---|---|---|---|
| 1 | `src/components/cases/InvoiceFormModal.tsx:127` | `invoice_date: initialData?.invoice_date \|\| new Date().toISOString().split('T')[0],` | `invoice_date: initialData?.invoice_date \|\| tenantToday(timezone),` |
| 2 | `src/components/cases/InvoiceFormModal.tsx:128` | `due_date: initialData?.due_date \|\| new Date().toISOString().split('T')[0],` | `due_date: initialData?.due_date \|\| tenantToday(timezone),` |
| 3 | `src/components/cases/InvoiceFormModal.tsx:198` | `invoice_date: initialData.invoice_date \|\| new Date().toISOString().split('T')[0],` | `invoice_date: initialData.invoice_date \|\| tenantToday(timezone),` |
| 4 | `src/components/cases/InvoiceFormModal.tsx:199` | `due_date: initialData.due_date \|\| new Date().toISOString().split('T')[0],` | `due_date: initialData.due_date \|\| tenantToday(timezone),` |
| 5 | `src/components/cases/QuoteFormModal.tsx:93-97` (`getDefaultValidUntil`) | `const date = new Date(); date.setDate(date.getDate() + 30); return date.toISOString().split('T')[0];` | `return addDaysIso(tenantToday(timezone), 30);` |
| 6 | `src/components/cases/ConvertToInvoiceModal.tsx:32-36` (`getDefaultDueDate`) | `const date = new Date(); date.setDate(date.getDate() + 30); return date.toISOString().split('T')[0];` | `return addDaysIso(tenantToday(timezone), 30);` |
| 7 | `src/components/financial/ExpenseFormModal.tsx:42` | `useState(new Date().toISOString().split('T')[0])` | `useState(() => tenantToday(timezone))` |
| 8 | `src/components/financial/ExpenseFormModal.tsx:103` | `: new Date().toISOString().split('T')[0],` | `: tenantToday(timezone),` |
| 9 | `src/components/financial/ExpenseFormModal.tsx:121` | `setExpenseDate(new Date().toISOString().split('T')[0]);` | `setExpenseDate(tenantToday(timezone));` |
| 10 | `src/components/financial/ExpensePaymentModal.tsx:39` | `useState(new Date().toISOString().split('T')[0])` | `useState(() => tenantToday(timezone))` |
| 11 | `src/components/financial/ExpensePaymentModal.tsx:60` | `setPaidAt(new Date().toISOString().split('T')[0]);` | `setPaidAt(tenantToday(timezone));` |
| 12 | `src/lib/invoiceService.ts:829` (`convertQuoteToInvoice`) | `invoice_date: new Date().toISOString().split('T')[0],` | `invoice_date: await currentTenantToday(),` |
| 13 | `src/lib/expensesService.ts:278` | `expense.expense_date ?? new Date().toISOString().slice(0, 10),` | `expense.expense_date ?? (await currentTenantToday()),` |
| 14 | `src/lib/expensesService.ts:417` | `transaction_date: (expense.expense_date ?? new Date().toISOString()).slice(0, 10),` | `transaction_date: (expense.expense_date ?? (await currentTenantToday())).slice(0, 10),` |
| 15 | `src/lib/expensesService.ts:~752` (`createExpenseVATRecord` tax_period) | `const taxPeriod = (args.expenseDate ?? new Date().toISOString()).slice(0, 7);` | `const taxPeriod = (args.expenseDate ?? (await currentTenantToday())).slice(0, 7);` |
| 16 | `src/lib/leaveService.ts:160` | `reviewed_date: new Date().toISOString().split('T')[0],` | `reviewed_date: await currentTenantToday(),` |
| 17 | `src/lib/leaveService.ts:178` | `reviewed_date: new Date().toISOString().split('T')[0],` | `reviewed_date: await currentTenantToday(),` |
| 18 | `src/lib/payrollService.ts:734` | `end_date: isCompleted ? new Date().toISOString().split('T')[0] : loan.end_date,` | `end_date: isCompleted ? await currentTenantToday() : loan.end_date,` |
| 19 | `src/lib/performanceService.ts:111` | `review_date: new Date().toISOString().split('T')[0],` | `review_date: await currentTenantToday(),` |
| 20 | `src/pages/financial/VATAuditPage.tsx:81-99` (`getDateFromFilter`) | whole function body (local-Date mutation + `toISOString().split('T')[0]`) | see code block below |

Row 20 replacement (component already gets `taxConfig`; add `const { timezone } = useDateTimeConfig();` and import `tenantToday, addMonthsIso`):

```tsx
  const getDateFromFilter = () => {
    if (dateRange === 'all') return undefined;
    const today = tenantToday(timezone);
    switch (dateRange) {
      case 'month':   return addMonthsIso(today, -1);
      case 'quarter': return addMonthsIso(today, -3);
      case 'year':    return addMonthsIso(today, -12);
      default:        return undefined;
    }
  };
```

Explicitly OUT of this sweep (read-side range builders / non-document dates, Phase 1+): `financialService.ts:203-220`, `paymentsService.ts:381-384`, `expensesService.ts:666`, `stockService.ts:767,959`, `timesheetService.ts:189-228`, `leaveService.ts:255-257`, `vatService.ts:251-252`, `billingService.ts:513`, `employeeOnboardingService.ts:201,226`, `platformAdminService.ts:103`, `reportPDFService.ts:118` (filename only), `payrollService.ts:193-194`.

- [ ] **Step 1: Write the failing regression test** — extend `src/lib/tenantToday.test.ts` with a guard that the swept pattern is gone from the swept files:

```typescript
// Appended to src/lib/tenantToday.test.ts (node project — fs allowed)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('document-date stamping sweep (Phase 0)', () => {
  const SWEPT_FILES = [
    'src/components/cases/InvoiceFormModal.tsx',
    'src/components/cases/QuoteFormModal.tsx',
    'src/components/cases/ConvertToInvoiceModal.tsx',
    'src/components/financial/ExpenseFormModal.tsx',
    'src/components/financial/ExpensePaymentModal.tsx',
  ];
  it.each(SWEPT_FILES)('%s no longer stamps UTC document dates', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    expect(src.includes("new Date().toISOString().split('T')[0]")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails:** `npx vitest run src/lib/tenantToday.test.ts` — Expected: FAIL on all five files (pattern still present).

- [ ] **Step 3: Apply every row of the sweep table** (pattern shown per row; component rows also add the two imports + the `timezone` hook line).

- [ ] **Step 4: Run tests + typecheck:**

Run: `npx vitest run src/lib/tenantToday.test.ts && npm run check:tsc && npm test`
Expected: sweep guard PASS, 0 tsc errors, full suite green (jsdom LocaleContext failures are a known local-only artifact — pass in CI).

- [ ] **Step 5: Commit**

```bash
git add -A src/components src/lib src/pages/financial/VATAuditPage.tsx
git commit -m "fix(datetime): stamp document dates in the tenant timezone — UTC 'today' shifted GCC tax points a day back"
```

---

### WP-4 — VAT ledger gains money dimensions (currency / rate / base)
*Branch: `fix/p0-vat-ledger-currency-base` · migration M3 + both ledger writers + return math.*

### Task 10: `vat_records` currency/base columns + output-VAT trigger stamping (migration M3)

**Files:**
- Migration: `phase0_vat_records_currency_base_columns`
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: live `post_invoice_vat_record()` trigger fn (verified behavior: INSERT posts `record_type='sale'` for `tax_invoice` with `tax_amount<>0` and non-void/cancelled status; UPDATE into void/cancelled posts a negative row with current-month `tax_period`; both skipped when `app.importing='true'`); `set_vat_records_tenant_and_audit` trigger (stamps `tenant_id`); invoice columns `currency`, `exchange_rate`, `tax_amount_base`, `subtotal_base` (live, `numeric(19,4)`).
- Produces: `vat_records.currency text`, `exchange_rate numeric(20,10)`, `vat_amount_base numeric(19,4)`, `taxable_amount_base numeric(19,4)` (Tasks 11, 12, 13, 17 consume); `vat_amount numeric(19,4)`, `vat_rate numeric(7,4)`. NOTE: `tax_period text` ALREADY EXISTS live (roadmap wording included it; verified present) — asserted, not added. RESERVED and NOT built (contract §3.5): the per-registration seam `tax_amount_reg_base` + `reg_exchange_rate`.

- [ ] **Step 1: Failing probe — the ledger is currency-blind today:**

```sql
SELECT count(*) AS money_dimension_cols FROM information_schema.columns
WHERE table_schema='public' AND table_name='vat_records'
  AND column_name IN ('currency','exchange_rate','vat_amount_base','taxable_amount_base');
SELECT count(*) AS tax_period_exists FROM information_schema.columns
WHERE table_schema='public' AND table_name='vat_records' AND column_name='tax_period';
```

Expected: `money_dimension_cols = 0`, `tax_period_exists = 1`.

- [ ] **Step 2: Capture the live trigger fn before replacing it** (drift check — if the live body materially differs from the behavior described above, STOP and reconcile before Step 3):

```sql
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='post_invoice_vat_record';
```

- [ ] **Step 3: Apply migration `phase0_vat_records_currency_base_columns`:**

```sql
-- 1) Money dimensions on THE tax ledger (mirrors the invoices *_base invariant).
ALTER TABLE public.vat_records
  ADD COLUMN IF NOT EXISTS currency            text,
  ADD COLUMN IF NOT EXISTS exchange_rate       numeric(20,10),
  ADD COLUMN IF NOT EXISTS vat_amount_base     numeric(19,4),
  ADD COLUMN IF NOT EXISTS taxable_amount_base numeric(19,4);

-- 2) Precision: the ledger could not store a 3-decimal OMR tax amount or a 4-dp rate.
ALTER TABLE public.vat_records
  ALTER COLUMN vat_amount TYPE numeric(19,4),
  ALTER COLUMN vat_rate   TYPE numeric(7,4);

-- 3) Output-VAT posting stamps the money dimensions and buckets tax_period in the
--    TENANT timezone (UTC to_char put boundary-night invoices in the wrong month).
CREATE OR REPLACE FUNCTION public.post_invoice_vat_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
  v_base_dp integer;
BEGIN
  IF current_setting('app.importing', true) = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT t.timezone, COALESCE(mcc.decimal_places, 2)
    INTO v_tz, v_base_dp
  FROM public.tenants t
  LEFT JOIN public.master_currency_codes mcc ON mcc.code = t.base_currency_code
  WHERE t.id = NEW.tenant_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_type = 'tax_invoice' AND COALESCE(NEW.tax_amount, 0) <> 0
       AND COALESCE(NEW.status, '') NOT IN ('void', 'cancelled') THEN
      INSERT INTO public.vat_records
        (tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
         currency, exchange_rate, vat_amount_base, taxable_amount_base)
      VALUES
        (NEW.tenant_id, 'sale', NEW.id, NEW.tax_amount, COALESCE(NEW.tax_rate, 0),
         to_char(timezone(COALESCE(v_tz, 'UTC'), COALESCE(NEW.invoice_date, now())), 'YYYY-MM'),
         NEW.currency, COALESCE(NEW.exchange_rate, 1),
         COALESCE(NEW.tax_amount_base,
                  round(NEW.tax_amount * COALESCE(NEW.exchange_rate, 1), v_base_dp)),
         COALESCE(NEW.subtotal_base,
                  round(COALESCE(NEW.subtotal, 0) * COALESCE(NEW.exchange_rate, 1), v_base_dp)));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.invoice_type = 'tax_invoice' AND COALESCE(NEW.tax_amount, 0) <> 0
       AND COALESCE(OLD.status, '') NOT IN ('void', 'cancelled')
       AND COALESCE(NEW.status, '') IN ('void', 'cancelled') THEN
      -- Whole-invoice reversal: lands in the CURRENT tenant-local month by design
      -- (adjustments are reported in the period they are made).
      INSERT INTO public.vat_records
        (tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
         currency, exchange_rate, vat_amount_base, taxable_amount_base)
      VALUES
        (NEW.tenant_id, 'sale', NEW.id, -NEW.tax_amount, COALESCE(NEW.tax_rate, 0),
         to_char(timezone(COALESCE(v_tz, 'UTC'), now()), 'YYYY-MM'),
         NEW.currency, COALESCE(NEW.exchange_rate, 1),
         -COALESCE(NEW.tax_amount_base,
                   round(NEW.tax_amount * COALESCE(NEW.exchange_rate, 1), v_base_dp)),
         -COALESCE(NEW.subtotal_base,
                   round(COALESCE(NEW.subtotal, 0) * COALESCE(NEW.exchange_rate, 1), v_base_dp)));
    END IF;
  END IF;
  RETURN NEW;
END $function$;
```

(If Step 2's capture shows the live function also handles cases this body does not — e.g. an extra guard — fold that logic in verbatim; the described behavior above is the live-verified baseline.)

- [ ] **Step 4: Passing probe — issue a synthetic tax invoice in a rolled-back transaction:**

```sql
BEGIN;
SET LOCAL ROLE postgres;
INSERT INTO public.invoices (tenant_id, case_id, invoice_number, invoice_type, status,
                             invoice_date, currency, exchange_rate, subtotal, tax_rate,
                             tax_amount, total_amount)
SELECT t.id, c.id, 'P0-PROBE-0001', 'tax_invoice', 'sent',
       now(), t.base_currency_code, 1, 100.000, 5, 5.000, 105.000
FROM public.tenants t, LATERAL (SELECT id FROM public.cases WHERE tenant_id = t.id LIMIT 1) c
WHERE t.deleted_at IS NULL LIMIT 1;
SELECT record_type, vat_amount, vat_rate, tax_period, currency, exchange_rate,
       vat_amount_base, taxable_amount_base
FROM public.vat_records WHERE record_id = (SELECT id FROM public.invoices WHERE invoice_number='P0-PROBE-0001');
ROLLBACK;
```

Expected: one row — `record_type='sale', vat_amount=5.000, currency='OMR', exchange_rate=1, vat_amount_base=5.000, taxable_amount_base=100.000`, `tax_period` = the current Muscat-local `YYYY-MM`. (If the invoices INSERT trips a NOT NULL not listed here, add the minimal column; keep the SELECT list identical.)

- [ ] **Step 5: Regen types (`mcp__supabase__generate_typescript_types`) → `npm run check:tsc`** — expected 0 errors (columns are additive/nullable).

- [ ] **Step 6: Manifest row + commit**

```markdown
| <applied-version> | phase0_vat_records_currency_base_columns.sql | Additive | vat_records +currency/exchange_rate/vat_amount_base/taxable_amount_base; vat_amount->(19,4), vat_rate->(7,4); post_invoice_vat_record stamps money dimensions + tenant-local tax_period | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(vat): vat_records gains currency/rate/base dimensions; output-VAT trigger stamps them tenant-locally"
```

### Task 11: Expense input-VAT writer stamps money dimensions and fails loud

**Files:**
- Modify: `src/lib/expensesService.ts:743-767` (`createExpenseVATRecord`) + its single caller
- Test: `src/lib/expensesService.test.ts` (extend; file exists)

**Interfaces:**
- Consumes: Task 10's columns; `roundMoney` (`src/lib/financialMath.ts:13`); `getBaseCurrency`/`getCurrencyDecimals` (`src/lib/currencyService.ts:84/:14`); `currentTenantToday` (Task 6).
- Produces: module-private `createExpenseVATRecord` with args `{ recordId; vatAmount; netAmount; taxAmount; expenseDate; currency: string | null; exchangeRate: number | null }` that THROWS on insert failure.

- [ ] **Step 1: Write the failing test** — extend `src/lib/expensesService.test.ts`. First add two lines to the top-of-file mock/import block (the file already mocks `./supabaseClient`, `./logger`, `./financialService`, `./currencyService` and hoists `{ from, rpc }`): a `./tenantToday` mock (its `currentTenantToday` is imported by the new writer but not called on this path since `expense_date` is set), and imports for `approveExpense` + the two currency helpers:

```typescript
// add to the vi.mock block at the top of the file:
vi.mock('./tenantToday', () => ({ currentTenantToday: vi.fn(() => Promise.resolve('2026-07-01')) }));
// add to the existing `import { … } from './expensesService';` list: approveExpense
// add a new import for the (already-mocked) currency helpers:
import { getBaseCurrency, getCurrencyDecimals } from './currencyService';
```

Then append this describe. `approveExpense` issues, in order: a read on `expenses` (`select→eq→maybeSingle`), the `approved` update on `expenses` (`update→eq→eq→select→maybeSingle`), then `createExpenseVATRecord`'s `insert` on `vat_records`. `createFinancialTransaction` is mocked (no `from` call); the three `from` calls are chained with `mockReturnValueOnce`.

```typescript
describe('expense input-VAT posting (Phase 0 money dimensions)', () => {
  const expenseReader = (expense: Record<string, unknown>) => {
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      maybeSingle: vi.fn().mockResolvedValue({ data: expense, error: null }),
    };
    return b;
  };
  const approveUpdate = () => {
    const b: Record<string, unknown> = {
      update: vi.fn(() => b),
      eq: vi.fn(() => b),
      select: vi.fn(() => b),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'e1', status: 'approved' }, error: null }),
    };
    return b;
  };
  const vatInsert = (captured: { payload?: Record<string, unknown> }, error: unknown = null) => ({
    insert: vi.fn((rows: Array<Record<string, unknown>>) => {
      captured.payload = rows[0];
      return Promise.resolve({ error });
    }),
  });
  const pendingExpense = {
    amount: 100, description: 'x', currency: 'EUR', exchange_rate: 0.41, rate_source: 'manual',
    amount_base: 41, status: 'pending', created_by: 'u-creator', expense_date: '2026-06-15',
    tax_amount: 5, tax_amount_base: 2.05,
  };

  it('posts purchase VAT with currency, frozen rate and base amounts', async () => {
    vi.mocked(getBaseCurrency).mockResolvedValue('OMR');
    vi.mocked(getCurrencyDecimals).mockResolvedValue(3);
    const captured: { payload?: Record<string, unknown> } = {};
    from
      .mockReturnValueOnce(expenseReader({ ...pendingExpense }))
      .mockReturnValueOnce(approveUpdate())
      .mockReturnValueOnce(vatInsert(captured));

    await approveExpense('e1', 'u-approver');

    expect(captured.payload).toMatchObject({
      record_type: 'purchase', record_id: 'e1', currency: 'EUR', exchange_rate: 0.41,
      vat_amount: 5,
      vat_amount_base: 2.05,     // roundMoney(5 * 0.41, 3)
      taxable_amount_base: 41,   // roundMoney(100 * 0.41, 3)
    });
  });

  it('THROWS when the vat_records insert fails (no more silent input-VAT loss)', async () => {
    vi.mocked(getBaseCurrency).mockResolvedValue('OMR');
    vi.mocked(getCurrencyDecimals).mockResolvedValue(3);
    const captured: { payload?: Record<string, unknown> } = {};
    from
      .mockReturnValueOnce(expenseReader({ ...pendingExpense }))
      .mockReturnValueOnce(approveUpdate())
      .mockReturnValueOnce(vatInsert(captured, { message: 'boom' }));

    await expect(approveExpense('e1', 'u-approver')).rejects.toMatchObject({ message: 'boom' });
  });
});
```

- [ ] **Step 2: Run, verify failure:** `npx vitest run src/lib/expensesService.test.ts` — Expected: FAIL (payload lacks `currency`/base; error path resolves instead of rejecting).

- [ ] **Step 3: Implement** — replace the body of `createExpenseVATRecord` (currently `src/lib/expensesService.ts:743-767`):

```typescript
const createExpenseVATRecord = async (args: {
  recordId: string;
  vatAmount: number;
  netAmount: number;
  taxAmount: number;
  expenseDate: string | null;
  currency: string | null;
  exchangeRate: number | null;
}) => {
  const vatRate = args.netAmount > 0 ? Math.round((args.taxAmount / args.netAmount) * 10000) / 100 : 0;
  const taxPeriod = (args.expenseDate ?? (await currentTenantToday())).slice(0, 7); // YYYY-MM
  const baseCurrency = await getBaseCurrency();
  const baseDp = await getCurrencyDecimals(baseCurrency);
  const rate = args.exchangeRate ?? 1;
  const payload = {
    record_type: 'purchase',
    record_id: args.recordId,
    vat_amount: args.vatAmount,
    vat_rate: vatRate,
    tax_period: taxPeriod,
    currency: args.currency ?? baseCurrency,
    exchange_rate: rate,
    vat_amount_base: roundMoney(args.vatAmount * rate, baseDp),
    taxable_amount_base: roundMoney(args.netAmount * rate, baseDp),
  } as Database['public']['Tables']['vat_records']['Insert'];

  const { error } = await supabase.from('vat_records').insert([payload]);
  if (error) {
    logger.error('Error creating expense VAT record:', error);
    // Input-VAT posting failures must be LOUD: a silently missing purchase row
    // understates the reclaim on the filed return (Phase-0 posture).
    throw error;
  }
};
```

Add imports at the top of the file: `import { roundMoney } from './financialMath';`, `import { getBaseCurrency, getCurrencyDecimals } from './currencyService';`, `import { currentTenantToday } from './tenantToday';` (skip any already present).

Update the single caller (locate with `grep -n "createExpenseVATRecord(" src/lib/expensesService.ts`): extend the argument object with the expense row's money fields, exactly:

```typescript
      currency: expense.currency ?? null,
      exchangeRate: expense.exchange_rate ?? null,
```

(the caller has the approved expense row in scope; `npm run check:tsc` enforces the exact variable name in that scope).

- [ ] **Step 4: Run tests + typecheck:** `npx vitest run src/lib/expensesService.test.ts && npm run check:tsc` — Expected: PASS / 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/expensesService.ts src/lib/expensesService.test.ts
git commit -m "fix(vat): expense input-VAT rows carry currency/rate/base and posting failures throw"
```

### Task 12: Return math sums the base column

**Files:**
- Modify: `src/lib/vatService.ts:3-13` (`VATRecord` interface), `:100-135` (`calculateVATForPeriod`)
- Test: `src/lib/vatService.test.ts` (Step 1 upgrades the current insert-only mock to a dual-purpose `from` harness so both the existing writer tests AND the new read-path tests run; file exists)

**Interfaces:**
- Consumes: Task 10's `vat_records.vat_amount_base`.
- Produces: `calculateVATForPeriod(periodStart, periodEnd): Promise<VATSummary>` (signature unchanged) summing BASE currency; `VATRecord` gains `vat_amount_base?: number | null; currency?: string | null; exchange_rate?: number | null; taxable_amount_base?: number | null`.

- [ ] **Step 1: Write the failing test.** The file's current mock is insert-only and cannot drive `calculateVATForPeriod` (which does `select→is→or` then awaits). **Replace the file's mock header + `beforeEach` (current lines 1–15)** with the dual-purpose harness below, then append the new describe. The two existing input-VAT writer tests keep passing — the default `from` still yields the `insert→select→maybeSingle` chain they assert `insertMock` against.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, insertMock } = vi.hoisted(() => ({ from: vi.fn(), insertMock: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));

import {
  createVATRecordFromPurchase, createVATRecordFromInvoice, calculateVATForPeriod,
} from './vatService';

/** insert-path builder: .insert(rows).select().maybeSingle() → { data: rows[0] }. */
function makeInsertQuery() {
  return {
    insert: (rows: unknown[]) => {
      insertMock(rows);
      return {
        select: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: (rows as Array<Record<string, unknown>>)[0], error: null }),
        }),
      };
    },
  } as Record<string, unknown>;
}

/** read-path builder for calculateVATForPeriod: select/is/or chainable; awaiting yields { data: rows }. */
function makeRecordsQuery(rows: Array<Record<string, unknown>>) {
  const b: Record<string, unknown> = {
    select: vi.fn(() => b),
    is: vi.fn(() => b),
    or: vi.fn(() => b),
    then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null }),
  };
  return b;
}

beforeEach(() => {
  from.mockReset();
  insertMock.mockClear();
  from.mockReturnValue(makeInsertQuery()); // default path for the existing writer tests
});
```

Then append:

```typescript
describe('calculateVATForPeriod — base-currency summation (Phase 0)', () => {
  it('sums vat_amount_base so a EUR invoice cannot pollute an OMR return', async () => {
    from.mockReturnValue(makeRecordsQuery([
      { record_type: 'sale', vat_amount: 5, vat_amount_base: 5 },
      { record_type: 'sale', vat_amount: 100, vat_amount_base: 41 },
      { record_type: 'purchase', vat_amount: 10, vat_amount_base: 10 },
    ]));
    const s = await calculateVATForPeriod('2026-07-01', '2026-09-30');
    expect(s.totalOutputVAT).toBe(46); // 5 + 41 — NEVER 105
    expect(s.totalInputVAT).toBe(10);
    expect(s.netVAT).toBe(36);
  });
  it('falls back to vat_amount for legacy rows with NULL base', async () => {
    from.mockReturnValue(makeRecordsQuery([
      { record_type: 'sale', vat_amount: 7, vat_amount_base: null },
    ]));
    const s = await calculateVATForPeriod('2026-07-01', '2026-09-30');
    expect(s.totalOutputVAT).toBe(7);
  });
});
```

- [ ] **Step 2: Run, verify failure:** `npx vitest run src/lib/vatService.test.ts` — Expected: FAIL (`totalOutputVAT` = 105).

- [ ] **Step 3: Implement.** In `calculateVATForPeriod` change the select (line ~111) to:

```typescript
    .select('record_type, vat_amount, vat_amount_base, tax_period, created_at')
```

and the two reducers (lines ~124-125) to:

```typescript
  const totalOutputVAT = sales.reduce((sum, r) => sum + (r.vat_amount_base ?? r.vat_amount ?? 0), 0);
  const totalInputVAT = purchases.reduce((sum, r) => sum + (r.vat_amount_base ?? r.vat_amount ?? 0), 0);
```

Extend the `VATRecord` interface (line 3) with:

```typescript
  vat_amount_base?: number | null;
  taxable_amount_base?: number | null;
  currency?: string | null;
  exchange_rate?: number | null;
```

- [ ] **Step 4: Run tests + typecheck:** `npx vitest run src/lib/vatService.test.ts && npm run check:tsc` — Expected: PASS / 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vatService.ts src/lib/vatService.test.ts
git commit -m "fix(vat): return math sums vat_amount_base — mixed-currency ledgers can no longer add EUR to OMR"
```

---

### WP-5 — Credit-note VAT reversal + second-ledger freeze
*Branch: `fix/p0-credit-note-vat-reversal` · migrations M4 + M5.*

### Task 13: Credit-note contra rows into `vat_records` (migration M4)

**Files:**
- Migration: `phase0_credit_note_vat_reversal`
- Modify: `src/types/database.types.ts` (regenerated — no shape change expected, still regen per discipline)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `credit_notes` columns (verified live): `credit_note_date timestamptz`, `status text`, `invoice_id uuid`, `currency text`, `exchange_rate numeric`, `tax_rate numeric`, `tax_amount numeric`, `subtotal numeric`, `subtotal_base`, `tax_amount_base` (RPC-computed); `issue_credit_note`/`void_credit_note` (verified: both bodies reference `vat_transactions`); Task 10's `vat_records` columns.
- Produces: `post_credit_note_vat_record()` trigger fn + `trg_post_credit_note_vat_record` on `credit_notes`; credit-note RPCs free of `vat_transactions` writes. Phase 3's ReturnComposer relies on `vat_records` being the ONLY output-tax ledger.

- [ ] **Step 1: Failing probe — a credit note today leaves NO trace in the ledger returns read:**

```sql
BEGIN;
INSERT INTO public.invoices (tenant_id, case_id, invoice_number, invoice_type, status,
                             invoice_date, currency, exchange_rate, subtotal, tax_rate, tax_amount, total_amount)
SELECT t.id, c.id, 'P0-CN-PROBE-INV', 'tax_invoice', 'sent', now(), t.base_currency_code, 1, 100.000, 5, 5.000, 105.000
FROM public.tenants t, LATERAL (SELECT id FROM public.cases WHERE tenant_id = t.id LIMIT 1) c
WHERE t.deleted_at IS NULL LIMIT 1;
INSERT INTO public.credit_notes (tenant_id, credit_note_number, credit_note_date, status, credit_type,
                                 invoice_id, currency, exchange_rate, subtotal, tax_rate, tax_amount, total_amount,
                                 subtotal_base, tax_amount_base, total_amount_base)
SELECT i.tenant_id, 'P0-CN-PROBE-0001', now(), 'issued', 'adjustment',
       i.id, i.currency, 1, 40.000, 5, 2.000, 42.000, 40.000, 2.000, 42.000
FROM public.invoices i WHERE i.invoice_number = 'P0-CN-PROBE-INV';
SELECT count(*) AS contra_rows FROM public.vat_records vr
JOIN public.credit_notes cn ON cn.id = vr.record_id WHERE cn.credit_note_number = 'P0-CN-PROBE-0001';
ROLLBACK;
```

Expected today: `contra_rows = 0` — the reversal hole. (Adjust NOT NULL minima if the INSERT complains; keep the final SELECT identical.)

- [ ] **Step 2: Capture both RPC bodies** (they are live-DB-owned, not in the repo):

```sql
SELECT p.proname, pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('issue_credit_note','void_credit_note');
```

Save both definitions to the scratchpad. In each, delete the `INSERT INTO vat_transactions …;` statement(s) — and ONLY those statements — leaving everything else byte-identical.

- [ ] **Step 3: Apply migration `phase0_credit_note_vat_reversal`** — the new trigger, then the two stripped `CREATE OR REPLACE FUNCTION` bodies from Step 2.

> **This migration is NOT copy-paste complete until the Step-2 capture is run.** The `issue_credit_note` / `void_credit_note` bodies are live-DB-owned (not in the repo); the SQL below is complete ONLY for the new trigger function + trigger. The two `CREATE OR REPLACE FUNCTION public.issue_credit_note(...)` / `void_credit_note(...)` bodies must be pasted in from the Step-2 `pg_get_functiondef` capture with ONLY their `INSERT INTO vat_transactions …` statement(s) removed — do not author them from memory. Also capture, in Step 2, the pre-migration EXECUTE grants of both functions (see Step 4d).

```sql
-- Contra output-VAT rows for credit notes — the exact invoice-void pattern, at the
-- DB layer so no client path can skip it. Fixes the audit critical: reversals were
-- written to vat_transactions, which no return logic reads.
CREATE OR REPLACE FUNCTION public.post_credit_note_vat_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
  v_base_dp integer;
  v_vat_base numeric;
  v_taxable_base numeric;
BEGIN
  IF current_setting('app.importing', true) = 'true' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.tax_amount, 0) = 0 THEN RETURN NEW; END IF;
  -- Only credit notes against TAX invoices carry output VAT to reverse.
  IF NEW.invoice_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.invoices i WHERE i.id = NEW.invoice_id AND i.invoice_type = 'tax_invoice')
  THEN RETURN NEW; END IF;

  SELECT t.timezone, COALESCE(mcc.decimal_places, 2)
    INTO v_tz, v_base_dp
  FROM public.tenants t
  LEFT JOIN public.master_currency_codes mcc ON mcc.code = t.base_currency_code
  WHERE t.id = NEW.tenant_id;

  v_vat_base     := COALESCE(NEW.tax_amount_base,
                             round(NEW.tax_amount * COALESCE(NEW.exchange_rate, 1), v_base_dp));
  v_taxable_base := COALESCE(NEW.subtotal_base,
                             round(COALESCE(NEW.subtotal, 0) * COALESCE(NEW.exchange_rate, 1), v_base_dp));

  IF TG_OP = 'INSERT' AND COALESCE(NEW.status, '') <> 'void' THEN
    -- Issue: NEGATIVE sale row in the credit note's own tenant-local period.
    INSERT INTO public.vat_records
      (tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
       currency, exchange_rate, vat_amount_base, taxable_amount_base)
    VALUES
      (NEW.tenant_id, 'sale', NEW.id, -NEW.tax_amount, COALESCE(NEW.tax_rate, 0),
       to_char(timezone(COALESCE(v_tz, 'UTC'), COALESCE(NEW.credit_note_date, now())), 'YYYY-MM'),
       NEW.currency, COALESCE(NEW.exchange_rate, 1), -v_vat_base, -v_taxable_base);
  ELSIF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') <> 'void' AND COALESCE(NEW.status, '') = 'void' THEN
    -- Voiding the credit note re-adds the output VAT in the CURRENT tenant-local month.
    INSERT INTO public.vat_records
      (tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
       currency, exchange_rate, vat_amount_base, taxable_amount_base)
    VALUES
      (NEW.tenant_id, 'sale', NEW.id, NEW.tax_amount, COALESCE(NEW.tax_rate, 0),
       to_char(timezone(COALESCE(v_tz, 'UTC'), now()), 'YYYY-MM'),
       NEW.currency, COALESCE(NEW.exchange_rate, 1), v_vat_base, v_taxable_base);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_post_credit_note_vat_record ON public.credit_notes;
CREATE TRIGGER trg_post_credit_note_vat_record
  AFTER INSERT OR UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.post_credit_note_vat_record();

-- Followed here by the two Step-2 bodies with their vat_transactions INSERTs removed:
-- CREATE OR REPLACE FUNCTION public.issue_credit_note(...) ...
-- CREATE OR REPLACE FUNCTION public.void_credit_note(...)  ...
```

- [ ] **Step 4: Passing probes.** (a) Re-run Step 1 — expected `contra_rows = 1` with `vat_amount = -2.000`, `vat_amount_base = -2.000`. (b) Void-path probe: same setup plus `UPDATE public.credit_notes SET status='void' WHERE credit_note_number='P0-CN-PROBE-0001';` then expect a second row with `vat_amount = +2.000` (then ROLLBACK). (c) RPC hygiene:

```sql
SELECT p.proname, pg_get_functiondef(p.oid) ILIKE '%vat_transactions%' AS still_writes_vt
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('issue_credit_note','void_credit_note');
```

Expected: `still_writes_vt = false` for both. (d) Grant retention — `CREATE OR REPLACE FUNCTION` preserves existing privileges, but assert it so no reviewer assumes the recreated bodies silently lost their grants:

```sql
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('issue_credit_note','void_credit_note');
```

Expected: `auth_can_exec = true` for both, and `anon_can_exec` identical to the pre-migration value captured in Step 2 — the recreation must neither widen nor narrow either grant.

- [ ] **Step 5: End-to-end return check** (rolled back): after (a)+(b) style inserts, `SELECT` the `calculateVATForPeriod` predicate manually — `SELECT sum(COALESCE(vat_amount_base, vat_amount)) FROM vat_records WHERE tax_period = to_char(now(),'YYYY-MM')` inside the probe transaction — expected `5.000 - 2.000 = 3.000` after issue (invoice + credit note).

- [ ] **Step 6: Regen types + manifest row + commit**

```markdown
| <applied-version> | phase0_credit_note_vat_reversal.sql | Conditional | post_credit_note_vat_record contra rows into vat_records; issue/void_credit_note stripped of vat_transactions writes | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "fix(vat): credit notes reverse output VAT in vat_records — the ledger returns actually read"
```

### Task 14: Freeze `vat_transactions` (migration M5)

**Files:**
- Migration: `phase0_vat_transactions_freeze`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: Task 13 (RPC writers already stripped; table verified 0 rows, zero readers in `src/`).
- Produces: a write-frozen `vat_transactions` (kept forever per additive-only policy).

- [ ] **Step 1: Failing probe:**

```sql
SELECT has_table_privilege('authenticated', 'public.vat_transactions', 'INSERT') AS auth_can_insert;
```

Expected today: `auth_can_insert = true`.

- [ ] **Step 2: Apply migration `phase0_vat_transactions_freeze`:**

```sql
REVOKE INSERT, UPDATE, DELETE ON public.vat_transactions FROM anon, authenticated;
COMMENT ON TABLE public.vat_transactions IS
  'FROZEN (localization Phase 0): vat_records is THE tax ledger; this table had 0 rows and zero readers. '
  'Kept per the additive-only policy (never dropped); client-role writes revoked; the credit-note RPC '
  'writers were removed in phase0_credit_note_vat_reversal. Do not add new writers or readers.';
```

- [ ] **Step 3: Passing probe:** rerun Step 1 → `auth_can_insert = false`; also `SELECT has_table_privilege('anon','public.vat_transactions','INSERT')` → `false`; `SELECT has_table_privilege('authenticated','public.vat_transactions','SELECT')` → unchanged `true` (read stays for audit archaeology).

- [ ] **Step 4: Regen types + manifest row + commit**

```markdown
| <applied-version> | phase0_vat_transactions_freeze.sql | RLS-only | vat_transactions client-role INSERT/UPDATE/DELETE revoked (dead second ledger frozen) | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "chore(vat): freeze vat_transactions — one tax ledger, enforced by REVOKE"
```

---

### WP-6 — Precision + rate widening sweep, ghost currency defaults
*Branch: `fix/p0-precision-widening` · migration M6.*

### Task 15: Money/rate/FX precision sweep + drop `'USD'` currency column defaults (migration M6)

**Files:**
- Migration: `phase0_precision_and_rate_widening_sweep`
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: live column inventory (verified 2026-07-02): `invoice_line_items.unit_price`/`quote_items.unit_price` `numeric(12,2)`; `invoices.tax_rate`/item `tax_rate` `numeric(5,2)`; `receipts.exchange_rate numeric(10,6)`; `receipts.amount_base numeric(12,3)`; `invoices.currency`/`payments.currency`/`quotes.currency` DEFAULT `'USD'`.
- Produces: `numeric(19,4)` money, `numeric(7,4)` tax rates, `numeric(20,10)` FX platform-wide — the storable-money floor Tasks 16/17 and every later phase assume. `invoiceService`/`quotesService`/`paymentsService` already pass `currency` explicitly (`rc.documentCurrency`), so dropping the defaults changes no green path.

- [ ] **Step 1: Failing probe — enumerate today's lossy columns:**

```sql
-- (a) EVERY numeric(12,2) money column on a BASE TABLE (views such as public.customers
--     are excluded by the join, since a view column cannot be ALTERed), minus the two
--     known NON-money GB-size columns. This is the COMPLETE "cannot store OMR/BHD/KWD
--     mils" set computed from live metadata — never a hand-maintained table allowlist.
SELECT c.table_name, c.column_name
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
WHERE c.table_schema='public' AND c.numeric_precision=12 AND c.numeric_scale=2
  AND (c.table_name, c.column_name) NOT IN
      (('clone_drives','expected_size_gb'), ('clone_drives','image_size_gb'))
ORDER BY 1, 2;
-- (b) Residual (5,2) tax-rate columns anywhere, plus receipts.exchange_rate at (10,6).
SELECT c.table_name, c.column_name, c.numeric_precision, c.numeric_scale
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
WHERE c.table_schema='public' AND (
  (c.numeric_precision=5 AND c.numeric_scale=2 AND c.column_name IN ('tax_rate','vat_rate','default_tax_rate'))
  OR (c.table_name='receipts' AND c.column_name='exchange_rate' AND c.numeric_precision=10)
) ORDER BY 1, 2;
```

Expected: (a) ~90 money columns across ~40 base tables (verified live 2026-07-02: includes `purchase_orders`, `purchase_order_items`, `payroll_periods`, `payroll_bank_files`, `stock_transactions`, `stock_price_history`, `receipts.amount`, `bank_accounts`, `bank_transactions`, `cases`, `assets`, `asset_depreciation`, `employee_*`, `suppliers`, `payment_allocations`, `receipt_allocations`, `case_quotes`, `supplier_products`, `inventory_items`, `document_templates`, … — the full set the old named-allowlist silently skipped); (b) a non-empty rate/FX list. This is the "cannot store 12.345 OMR / 8.875%" state. Save both outputs — the before-picture for the PR.

- [ ] **Step 2: Apply migration `phase0_precision_and_rate_widening_sweep`:**

```sql
-- ===== Line-level money: a 3-decimal OMR unit price is silently rounded today =====
ALTER TABLE public.invoice_line_items
  ALTER COLUMN unit_price TYPE numeric(19,4),
  ALTER COLUMN discount   TYPE numeric(19,4),
  ALTER COLUMN tax_rate   TYPE numeric(7,4);
ALTER TABLE public.quote_items
  ALTER COLUMN unit_price TYPE numeric(19,4),
  ALTER COLUMN discount   TYPE numeric(19,4),
  ALTER COLUMN tax_rate   TYPE numeric(7,4);

-- ===== Header tax rates: NYC 8.875% is unstorable at (5,2) =====
ALTER TABLE public.invoices      ALTER COLUMN tax_rate         TYPE numeric(7,4);
ALTER TABLE public.tenants       ALTER COLUMN default_tax_rate TYPE numeric(7,4);
ALTER TABLE public.geo_countries ALTER COLUMN default_tax_rate TYPE numeric(7,4);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='quotes' AND column_name='tax_rate') THEN
    ALTER TABLE public.quotes ALTER COLUMN tax_rate TYPE numeric(7,4);
  END IF;
END $$;

-- ===== FX normalization: one precision for frozen rates platform-wide =====
ALTER TABLE public.receipts
  ALTER COLUMN exchange_rate TYPE numeric(20,10),
  ALTER COLUMN amount_base   TYPE numeric(19,4);

-- ===== The M3 tail: EVERY remaining numeric(12,2) money column platform-wide =====
-- Spec §1.3 Critical (manifest:51) + Financial Calculation Engine mandate widening
-- EVERY remaining tenant money column to numeric(19,4); the audit only NAMED a handful
-- of stragglers. A hand-kept table allowlist silently skipped purchase_orders /
-- purchase_order_items (a live OMR PO write path), payroll_periods, payroll_bank_files,
-- stock_transactions, stock_price_history, receipts.amount, bank_accounts, cases,
-- assets, employee_*, suppliers, payment_allocations, and ~25 more. So sweep every
-- numeric(12,2) column on a BASE TABLE (the join excludes views like public.customers,
-- which cannot be ALTERed) and subtract only the two known NON-money columns
-- (clone_drives GB sizes). Verified live 2026-07-02: NONE of these columns is GENERATED,
-- so ALTER TYPE is safe. The loop is naturally idempotent — columns already widened
-- (vat_records.vat_amount in M-A; invoice_line_items/quote_items above) are no longer
-- numeric(12,2) and do not match.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.numeric_precision=12 AND c.numeric_scale=2
      AND (c.table_name, c.column_name) NOT IN
          (('clone_drives','expected_size_gb'), ('clone_drives','image_size_gb'))
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(19,4)', r.table_name, r.column_name);
  END LOOP;
END $$;

-- ===== Residual (5,2) rate columns anywhere in public =====
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.numeric_precision=5 AND c.numeric_scale=2
      AND c.column_name IN ('tax_rate','vat_rate','default_tax_rate')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(7,4)', r.table_name, r.column_name);
  END LOOP;
END $$;

-- ===== Ghost 'USD' document-currency defaults: currency must be stated, never assumed =====
ALTER TABLE public.invoices ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.quotes   ALTER COLUMN currency DROP DEFAULT;
```

- [ ] **Step 3: Passing probe:** re-run **both** of Step 1's queries — (a) and (b) each return **0 rows** (zero numeric(12,2) money columns and zero residual (5,2) tax-rate / (10,6) `receipts.exchange_rate` remain on ANY base table platform-wide, excluding the two `clone_drives` GB-size columns). Then:

```sql
SELECT count(*) AS usd_defaults FROM information_schema.columns
WHERE table_schema='public' AND column_name='currency' AND column_default ILIKE '%USD%'
  AND table_name IN ('invoices','payments','quotes');
```

Expected: `usd_defaults = 0`.

- [ ] **Step 4: Regen types → `npm run check:tsc` → `npm test`.** Expected: 0 tsc errors; full suite green. (`currency` becoming a required Insert field: `invoiceService.ts` writes `currency: rc.documentCurrency` in `invoiceToInsert`, `quotesService` likewise, `record_payment` receives it via jsonb — if tsc flags any other inserting caller, that caller was fabricating USD; fix it to pass `rc.documentCurrency` from `resolveRateContext`.)

- [ ] **Step 5: Manifest row + commit**

```markdown
| <applied-version> | phase0_precision_and_rate_widening_sweep.sql | Additive | Money->(19,4), tax rates->(7,4), FX->(20,10) sweep; USD currency defaults dropped on invoices/payments/quotes | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "fix(money): widen unit_price/rates/FX precision platform-wide; drop USD currency column defaults"
```

---

### WP-7 — `*_base` backfill + standing NULL monitors
*Branch: `fix/p0-base-backfill-monitors` · migrations M7 + M8. Depends on WP-6 (widened columns).*

### Task 16: Idempotent `*_base` backfill with SUM-parity assertions (migration M7)

**Files:**
- Migration: `phase0_base_backfill`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: live corpus (993 invoices: 992 OMR + 1 USD, `*_base` 100% NULL, 992 rows storing a meaningless `exchange_rate=2.6`; 1,138 quotes; 1,114 payments; 2 receipts); `exchange_rates` USD-pivot table (`source='provider'`, history from 2026-05-30); `master_currency_codes.decimal_places`.
- Produces: fully materialized `*_base` history keyed `rate_source='derived_backfill'`; the parity corpus Phase 1's M-E replay gate runs against.

- [ ] **Step 1: Failing probe — the before-picture:**

```sql
SELECT
  (SELECT count(*) FROM invoices WHERE total_amount_base IS NULL) AS inv_null_base,
  (SELECT count(*) FROM quotes   WHERE total_amount_base IS NULL) AS q_null_base,
  (SELECT count(*) FROM payments WHERE amount_base IS NULL)       AS pay_null_base,
  (SELECT count(*) FROM receipts WHERE amount_base IS NULL)       AS rcpt_null_base,
  (SELECT count(*) FROM invoices i JOIN tenants t ON t.id=i.tenant_id
    WHERE i.currency = t.base_currency_code AND i.exchange_rate IS DISTINCT FROM 1) AS base_rows_bad_rate;
```

Expected today: `993 / 1138 / 1114 / 2 / 992`.

- [ ] **Step 2: Apply migration `phase0_base_backfill`:**

```sql
-- Scratch rate resolver for the one-time backfill. rate(doc -> base) via the USD
-- pivot: usd(x) = x-units per 1 USD (er-api convention, matching
-- currencyService.getConversionRate = usdRate(to)/usdRate(from)). Most-recent rate
-- on/before the document date; EARLIEST available as carry-back for documents that
-- predate the 2026-05-30 rate history (recorded as 'derived_backfill' by definition).
CREATE OR REPLACE FUNCTION public._p0_backfill_rate(p_doc text, p_base text, p_on date)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE v_usd_doc numeric; v_usd_base numeric;
BEGIN
  IF p_doc = p_base THEN RETURN 1; END IF;
  IF p_doc = 'USD' THEN v_usd_doc := 1;
  ELSE
    SELECT rate INTO v_usd_doc FROM (
      (SELECT rate, 0 AS pref FROM public.exchange_rates
        WHERE base_currency='USD' AND quote_currency=p_doc AND source='provider' AND rate_date <= p_on
        ORDER BY rate_date DESC LIMIT 1)
      UNION ALL
      (SELECT rate, 1 FROM public.exchange_rates
        WHERE base_currency='USD' AND quote_currency=p_doc AND source='provider'
        ORDER BY rate_date ASC LIMIT 1)
    ) x ORDER BY pref LIMIT 1;
  END IF;
  IF p_base = 'USD' THEN v_usd_base := 1;
  ELSE
    SELECT rate INTO v_usd_base FROM (
      (SELECT rate, 0 AS pref FROM public.exchange_rates
        WHERE base_currency='USD' AND quote_currency=p_base AND source='provider' AND rate_date <= p_on
        ORDER BY rate_date DESC LIMIT 1)
      UNION ALL
      (SELECT rate, 1 FROM public.exchange_rates
        WHERE base_currency='USD' AND quote_currency=p_base AND source='provider'
        ORDER BY rate_date ASC LIMIT 1)
    ) x ORDER BY pref LIMIT 1;
  END IF;
  IF v_usd_doc IS NULL OR v_usd_base IS NULL THEN
    RAISE EXCEPTION 'backfill: no provider rate chain for % -> %', p_doc, p_base;
  END IF;
  RETURN v_usd_base / v_usd_doc;
END $$;

-- ============ INVOICES ============
-- (A) Base-currency rows: normalize the meaningless stored 2.6 to the identity rate.
UPDATE public.invoices i
SET exchange_rate = 1, rate_source = 'derived_backfill'
FROM public.tenants t
WHERE t.id = i.tenant_id AND i.currency = t.base_currency_code
  AND i.total_amount_base IS NULL AND i.exchange_rate IS DISTINCT FROM 1;

-- (B) Base-currency rows: *_base = round(amount, base dp) at rate 1.
UPDATE public.invoices i
SET subtotal_base     = round(COALESCE(i.subtotal, 0),     mc.decimal_places),
    tax_amount_base   = round(COALESCE(i.tax_amount, 0),   mc.decimal_places),
    total_amount_base = round(COALESCE(i.total_amount, 0), mc.decimal_places),
    amount_paid_base  = round(COALESCE(i.amount_paid, 0),  mc.decimal_places),
    balance_due_base  = round(COALESCE(i.balance_due, 0),  mc.decimal_places),
    rate_source       = 'derived_backfill'
FROM public.tenants t
JOIN public.master_currency_codes mc ON mc.code = t.base_currency_code
WHERE t.id = i.tenant_id AND i.currency = t.base_currency_code AND i.total_amount_base IS NULL;

-- (C) Foreign-currency rows: dated carry-forward provider rate.
UPDATE public.invoices i
SET exchange_rate     = public._p0_backfill_rate(i.currency, t.base_currency_code, COALESCE(i.invoice_date::date, i.created_at::date)),
    subtotal_base     = round(COALESCE(i.subtotal, 0)     * public._p0_backfill_rate(i.currency, t.base_currency_code, COALESCE(i.invoice_date::date, i.created_at::date)), mc.decimal_places),
    tax_amount_base   = round(COALESCE(i.tax_amount, 0)   * public._p0_backfill_rate(i.currency, t.base_currency_code, COALESCE(i.invoice_date::date, i.created_at::date)), mc.decimal_places),
    total_amount_base = round(COALESCE(i.total_amount, 0) * public._p0_backfill_rate(i.currency, t.base_currency_code, COALESCE(i.invoice_date::date, i.created_at::date)), mc.decimal_places),
    amount_paid_base  = round(COALESCE(i.amount_paid, 0)  * public._p0_backfill_rate(i.currency, t.base_currency_code, COALESCE(i.invoice_date::date, i.created_at::date)), mc.decimal_places),
    balance_due_base  = round(COALESCE(i.balance_due, 0)  * public._p0_backfill_rate(i.currency, t.base_currency_code, COALESCE(i.invoice_date::date, i.created_at::date)), mc.decimal_places),
    rate_source       = 'derived_backfill'
FROM public.tenants t
JOIN public.master_currency_codes mc ON mc.code = t.base_currency_code
WHERE t.id = i.tenant_id AND i.currency <> t.base_currency_code AND i.total_amount_base IS NULL;

-- ============ QUOTES (same rules; quote base columns) ============
UPDATE public.quotes q
SET exchange_rate = 1, rate_source = 'derived_backfill'
FROM public.tenants t
WHERE t.id = q.tenant_id AND q.currency = t.base_currency_code
  AND q.total_amount_base IS NULL AND q.exchange_rate IS DISTINCT FROM 1;

UPDATE public.quotes q
SET subtotal_base     = round(COALESCE(q.subtotal, 0),     mc.decimal_places),
    tax_amount_base   = round(COALESCE(q.tax_amount, 0),   mc.decimal_places),
    total_amount_base = round(COALESCE(q.total_amount, 0), mc.decimal_places),
    rate_source       = 'derived_backfill'
FROM public.tenants t
JOIN public.master_currency_codes mc ON mc.code = t.base_currency_code
WHERE t.id = q.tenant_id AND q.currency = t.base_currency_code AND q.total_amount_base IS NULL;

UPDATE public.quotes q
SET exchange_rate     = public._p0_backfill_rate(q.currency, t.base_currency_code, q.created_at::date),
    subtotal_base     = round(COALESCE(q.subtotal, 0)     * public._p0_backfill_rate(q.currency, t.base_currency_code, q.created_at::date), mc.decimal_places),
    tax_amount_base   = round(COALESCE(q.tax_amount, 0)   * public._p0_backfill_rate(q.currency, t.base_currency_code, q.created_at::date), mc.decimal_places),
    total_amount_base = round(COALESCE(q.total_amount, 0) * public._p0_backfill_rate(q.currency, t.base_currency_code, q.created_at::date), mc.decimal_places),
    rate_source       = 'derived_backfill'
FROM public.tenants t
JOIN public.master_currency_codes mc ON mc.code = t.base_currency_code
WHERE t.id = q.tenant_id AND q.currency <> t.base_currency_code AND q.total_amount_base IS NULL;

-- ============ PAYMENTS ============
UPDATE public.payments p
SET exchange_rate = 1, rate_source = 'derived_backfill'
FROM public.tenants t
WHERE t.id = p.tenant_id AND p.currency = t.base_currency_code
  AND p.amount_base IS NULL AND p.exchange_rate IS DISTINCT FROM 1;

UPDATE public.payments p
SET amount_base = round(COALESCE(p.amount, 0), mc.decimal_places),
    rate_source = 'derived_backfill'
FROM public.tenants t
JOIN public.master_currency_codes mc ON mc.code = t.base_currency_code
WHERE t.id = p.tenant_id AND p.currency = t.base_currency_code AND p.amount_base IS NULL;

UPDATE public.payments p
SET exchange_rate = public._p0_backfill_rate(p.currency, t.base_currency_code, COALESCE(p.payment_date::date, p.created_at::date)),
    amount_base   = round(COALESCE(p.amount, 0) * public._p0_backfill_rate(p.currency, t.base_currency_code, COALESCE(p.payment_date::date, p.created_at::date)), mc.decimal_places),
    rate_source   = 'derived_backfill'
FROM public.tenants t
JOIN public.master_currency_codes mc ON mc.code = t.base_currency_code
WHERE t.id = p.tenant_id AND p.currency <> t.base_currency_code AND p.amount_base IS NULL;

-- ============ RECEIPTS (base-currency-only by design; 2 rows) ============
UPDATE public.receipts r
SET exchange_rate = 1,
    amount_base   = round(COALESCE(r.amount, 0), mc.decimal_places)
FROM public.tenants t
JOIN public.master_currency_codes mc ON mc.code = t.base_currency_code
WHERE t.id = r.tenant_id AND r.amount_base IS NULL;

-- ============ ASSERTIONS (the migration FAILS — and rolls back — on violation) ============
DO $$
DECLARE v_bad bigint; v_sum_raw numeric; v_sum_base numeric;
BEGIN
  -- Row-level base invariant on every invoice: *_base = round(amount * rate, base dp)
  SELECT count(*) INTO v_bad
  FROM public.invoices i
  JOIN public.tenants t ON t.id = i.tenant_id
  JOIN public.master_currency_codes mc ON mc.code = t.base_currency_code
  WHERE i.total_amount_base IS NULL
     OR i.total_amount_base <> round(COALESCE(i.total_amount, 0) * i.exchange_rate, mc.decimal_places)
     OR i.tax_amount_base   <> round(COALESCE(i.tax_amount, 0)   * i.exchange_rate, mc.decimal_places);
  IF v_bad > 0 THEN RAISE EXCEPTION 'backfill parity: % invoices violate the base invariant', v_bad; END IF;

  -- SUM parity for base-currency rows: base == raw exactly
  SELECT COALESCE(sum(i.total_amount),0), COALESCE(sum(i.total_amount_base),0)
    INTO v_sum_raw, v_sum_base
  FROM public.invoices i JOIN public.tenants t ON t.id = i.tenant_id
  WHERE i.currency = t.base_currency_code;
  IF v_sum_raw <> v_sum_base THEN
    RAISE EXCEPTION 'backfill SUM parity: invoices raw % <> base %', v_sum_raw, v_sum_base;
  END IF;

  SELECT count(*) INTO v_bad FROM public.quotes   WHERE total_amount_base IS NULL;
  IF v_bad > 0 THEN RAISE EXCEPTION 'backfill: % quotes still NULL base', v_bad; END IF;
  SELECT count(*) INTO v_bad FROM public.payments WHERE amount_base IS NULL;
  IF v_bad > 0 THEN RAISE EXCEPTION 'backfill: % payments still NULL base', v_bad; END IF;
  SELECT count(*) INTO v_bad FROM public.receipts WHERE amount_base IS NULL;
  IF v_bad > 0 THEN RAISE EXCEPTION 'backfill: % receipts still NULL base', v_bad; END IF;
END $$;

DROP FUNCTION public._p0_backfill_rate(text, text, date);
```

- [ ] **Step 3: Passing probe:** re-run Step 1 — expected `0 / 0 / 0 / 0 / 0`. Then row counts by provenance:

```sql
SELECT rate_source, count(*) FROM public.invoices GROUP BY rate_source ORDER BY 2 DESC;
```

Expected: `derived_backfill` covers all 993 (new rows written after this land as `derived`/`manual`/`provider`).

- [ ] **Step 4: Idempotence check:** re-run ONLY the UPDATE statements (Step 2 without the DDL) via `execute_sql` — every UPDATE reports `0 rows` (all gated on `*_base IS NULL`).

- [ ] **Step 5: Manifest row + commit**

```markdown
| <applied-version> | phase0_base_backfill.sql | Conditional | One-time idempotent *_base backfill (invoices/quotes/payments/receipts), rate normalization for base-currency rows, SUM-parity assertions in-migration | #TBD-PR |
```

```bash
git add supabase/migrations.manifest.md
git commit -m "fix(money): backfill *_base across the live corpus — rate_source=derived_backfill, SUM-parity asserted"
```

### Task 17: Standing NULL-base/NULL-rate monitors (migration M8 + CI script)

**Files:**
- Migration: `phase0_financial_null_monitors`
- Create: `scripts/financial/check-financial-base-integrity.sql`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: pg_cron 1.6.4 (verified installed — the phase brief's fallback path is NOT needed; the SQL script below doubles as the CI-side monitor anyway); Tasks 10/16 (columns populated).
- Produces: `assert_financial_base_integrity(p_lookback interval DEFAULT interval '25 hours') RETURNS void` + hourly cron job `financial-base-integrity-hourly`; failures surface in `cron.job_run_details`.

- [ ] **Step 1: Failing probe — seed a violation and show nothing catches it today:**

```sql
BEGIN;
INSERT INTO public.vat_records (tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period)
SELECT id, 'purchase', gen_random_uuid(), 1.000, 5, to_char(now(),'YYYY-MM') FROM public.tenants LIMIT 1;
-- No currency / exchange_rate / vat_amount_base — a Phase-0-invalid row. Nothing fires.
ROLLBACK;
```

Expected: INSERT succeeds silently (that silence is the bug this task closes).

- [ ] **Step 2: Apply migration `phase0_financial_null_monitors`:**

```sql
-- Standing monitor (graft 10): new financial rows MUST carry currency + frozen rate +
-- *_base. RAISES on violation so pg_cron records a failed run — no new tables needed.
CREATE OR REPLACE FUNCTION public.assert_financial_base_integrity(
  p_lookback interval DEFAULT interval '25 hours'
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_bad bigint; v_msg text := '';
BEGIN
  SELECT count(*) INTO v_bad FROM public.invoices
   WHERE created_at > now() - p_lookback AND deleted_at IS NULL
     AND (total_amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL);
  IF v_bad > 0 THEN v_msg := v_msg || format('invoices:%s ', v_bad); END IF;

  SELECT count(*) INTO v_bad FROM public.quotes
   WHERE created_at > now() - p_lookback AND deleted_at IS NULL
     AND (total_amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL);
  IF v_bad > 0 THEN v_msg := v_msg || format('quotes:%s ', v_bad); END IF;

  SELECT count(*) INTO v_bad FROM public.payments
   WHERE created_at > now() - p_lookback AND deleted_at IS NULL
     AND (amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL);
  IF v_bad > 0 THEN v_msg := v_msg || format('payments:%s ', v_bad); END IF;

  SELECT count(*) INTO v_bad FROM public.receipts
   WHERE created_at > now() - p_lookback AND deleted_at IS NULL
     AND (amount_base IS NULL OR exchange_rate IS NULL);
  IF v_bad > 0 THEN v_msg := v_msg || format('receipts:%s ', v_bad); END IF;

  SELECT count(*) INTO v_bad FROM public.vat_records
   WHERE created_at > now() - p_lookback AND deleted_at IS NULL
     AND (vat_amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL);
  IF v_bad > 0 THEN v_msg := v_msg || format('vat_records:%s ', v_bad); END IF;

  IF v_msg <> '' THEN
    RAISE EXCEPTION 'financial base integrity: NULL base/rate/currency on new rows — %', v_msg;
  END IF;
END $function$;

REVOKE ALL ON FUNCTION public.assert_financial_base_integrity(interval) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'financial-base-integrity-hourly') THEN
    PERFORM cron.schedule('financial-base-integrity-hourly', '17 * * * *',
                          $job$SELECT public.assert_financial_base_integrity()$job$);
  END IF;
END $$;
```

- [ ] **Step 3: Passing probes.** (a) Clean run: `SELECT public.assert_financial_base_integrity(interval '100 years');` → succeeds (backfill complete). (b) Seeded violation: re-run Step 1's INSERT inside a transaction, then `SELECT public.assert_financial_base_integrity();` → expect `ERROR: financial base integrity: … vat_records:1` → ROLLBACK. (c) `SELECT jobname, schedule FROM cron.job WHERE jobname='financial-base-integrity-hourly';` → one row.

- [ ] **Step 4: Create the CI/manual twin** `scripts/financial/check-financial-base-integrity.sql` (list-violations form — any output row = fail, matching `scripts/financial/detect-receipt-ledger-drift.sql`'s contract):

```sql
-- Any row returned = a financial base-integrity violation. CI/manual twin of the
-- hourly assert_financial_base_integrity() pg_cron monitor (localization Phase 0).
-- Usage: psql "$SUPABASE_DB_URL" -f scripts/financial/check-financial-base-integrity.sql
SELECT 'invoices' AS tbl, id, created_at FROM public.invoices
 WHERE deleted_at IS NULL AND (total_amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL)
UNION ALL
SELECT 'quotes', id, created_at FROM public.quotes
 WHERE deleted_at IS NULL AND (total_amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL)
UNION ALL
SELECT 'payments', id, created_at FROM public.payments
 WHERE deleted_at IS NULL AND (amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL)
UNION ALL
SELECT 'receipts', id, created_at FROM public.receipts
 WHERE deleted_at IS NULL AND (amount_base IS NULL OR exchange_rate IS NULL)
UNION ALL
SELECT 'vat_records', id, created_at FROM public.vat_records
 WHERE deleted_at IS NULL AND (vat_amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL)
ORDER BY 1, 3 DESC;
```

- [ ] **Step 5: Manifest row + commit**

```markdown
| <applied-version> | phase0_financial_null_monitors.sql | Additive | assert_financial_base_integrity() + hourly pg_cron job; SQL twin in scripts/financial | #TBD-PR |
```

```bash
git add scripts/financial/check-financial-base-integrity.sql supabase/migrations.manifest.md
git commit -m "feat(monitoring): standing NULL-base/NULL-rate monitor — hourly pg_cron + CI SQL twin"
```

---

### WP-8 — Cross-currency transfer guard
*Branch: `fix/p0-cross-currency-transfer-guard` · one service file + test, no migration.*

### Task 18: Block mismatched-currency account transfers

**Files:**
- Modify: `src/lib/bankingService.ts:539-589` (`createTransfer`)
- Test: `src/lib/bankingService.test.ts` (extend; file exists)

**Interfaces:**
- Consumes: `bank_accounts.currency` (field exists on the `BankAccount` interface, `bankingService.ts:26-27`); the existing balance-check block at `:549-559`.
- Produces: `createTransfer(transferData: Partial<AccountTransfer>): Promise<AccountTransfer>` (signature unchanged) that THROWS on currency mismatch before any insert or balance mutation. Phase-2 FX transfers will replace the throw with a converting flow.

- [ ] **Step 1: Write the failing test** — extend `src/lib/bankingService.test.ts`. `createTransfer` calls `supabase.auth.getUser()` and `resolveTenantId()`, neither of which the current mock exposes, so first **replace the file's mock header (current lines 6–7)** to add a hoisted `getUser`/`resolveTenantId` (the existing `getAccountBalanceSummary` tests use only `from` and are unaffected):

```typescript
const { from, getUser, resolveTenantId } = vi.hoisted(() => ({
  from: vi.fn(), getUser: vi.fn(), resolveTenantId: vi.fn(),
}));
vi.mock('./supabaseClient', () => ({ supabase: { from, auth: { getUser } }, resolveTenantId }));
```

Then append this describe. In Task 18's implementation the two `bank_accounts` reads run inside a `Promise.all` (source first, destination second), so `mockReturnValueOnce` order = source then destination; a trailing default builder stands in for the `account_transfers` insert (it must NOT be reached in the mismatch case):

```typescript
describe('createTransfer — cross-currency guard (Phase 0)', () => {
  const accountRead = (row: Record<string, unknown> | null) => {
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    return b;
  };

  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    resolveTenantId.mockResolvedValue('t-1');
  });

  it('throws before inserting when the two accounts have different currencies', async () => {
    const insert = vi.fn(() => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 't', status: 'pending' }, error: null }) }),
    }));
    from
      .mockReturnValueOnce(accountRead({ current_balance: 1000, currency: 'OMR' })) // source
      .mockReturnValueOnce(accountRead({ currency: 'USD' }))                        // destination
      .mockReturnValue({ insert });                                                // account_transfers — must NOT run

    await expect(
      bankingService.createTransfer({ amount: 500, from_account_id: 'a', to_account_id: 'b' }),
    ).rejects.toThrow(/Cross-currency transfers are not supported/);
    expect(insert).not.toHaveBeenCalled();
  });

  it('still allows same-currency transfers', async () => {
    const captured: { row?: Record<string, unknown> } = {};
    const insert = vi.fn((row: Record<string, unknown>) => {
      captured.row = row;
      // Return status 'pending' so the completed-transfer balance-update fan-out is skipped.
      return { select: () => ({ maybeSingle: () => Promise.resolve({
        data: { id: 't1', status: 'pending', from_account_id: 'a', to_account_id: 'b', amount: 500 }, error: null,
      }) }) };
    });
    from
      .mockReturnValueOnce(accountRead({ current_balance: 1000, currency: 'OMR' }))
      .mockReturnValueOnce(accountRead({ currency: 'OMR' }))
      .mockReturnValue({ insert });

    const result = await bankingService.createTransfer({ amount: 500, from_account_id: 'a', to_account_id: 'b' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(captured.row).toMatchObject({ amount: 500, from_account_id: 'a', to_account_id: 'b' });
    expect(result).toMatchObject({ id: 't1' });
  });
});
```

- [ ] **Step 2: Run, verify failure:** `npx vitest run src/lib/bankingService.test.ts` — Expected: FAIL (no guard exists; the OMR→USD transfer resolves, moving 500 "of each").

- [ ] **Step 3: Implement.** In `createTransfer`, replace the source-account fetch block (`src/lib/bankingService.ts:549-559`) with:

```typescript
    // validate_account_balance RPC does not exist in v1.0.0 schema; do balance
    // check in TS. TODO(B8): replace with server-side RPC when added.
    const [{ data: sourceAccount }, { data: destinationAccount }] = await Promise.all([
      supabase
        .from('bank_accounts')
        .select('current_balance, currency')
        .eq('id', transferData.from_account_id)
        .maybeSingle(),
      supabase
        .from('bank_accounts')
        .select('currency')
        .eq('id', transferData.to_account_id)
        .maybeSingle(),
    ]);

    // Phase-0 guard: a transfer moves ONE number, so both ledgers must share a
    // currency. 1000 USD -> OMR previously credited 1000 OMR (wrong by ~2.6x).
    // Proper FX transfers (snapshotted rate + realized-FX posting) are Phase 2.
    const fromCurrency = sourceAccount?.currency ?? null;
    const toCurrency = destinationAccount?.currency ?? null;
    if (fromCurrency && toCurrency && fromCurrency !== toCurrency) {
      throw new Error(
        `Cross-currency transfers are not supported yet: the source account is ${fromCurrency} ` +
        `and the destination is ${toCurrency}. Use same-currency accounts, or wait for FX transfers (Phase 2).`,
      );
    }

    if (sourceAccount && (sourceAccount.current_balance ?? 0) < transferData.amount) {
      throw new Error('Insufficient balance in the source account');
    }
```

- [ ] **Step 4: Run tests + typecheck:** `npx vitest run src/lib/bankingService.test.ts && npm run check:tsc` — Expected: PASS / 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bankingService.ts src/lib/bankingService.test.ts
git commit -m "fix(banking): block cross-currency account transfers — same number was debited/credited in two currencies"
```

---

### WP-9 — Payroll loud-error guards (7% PASI default, USD 'WPS' file)
*Branch: `fix/p0-payroll-loud-errors` · migration M9 + service edits.*

### Task 19: Social-security rate must be configured, never assumed (migration M9 + service)

**Files:**
- Migration: `phase0_payroll_social_security_nullable`
- Modify: `src/lib/payrollService.ts:42-49` (`DEFAULT_PAYROLL_SETTINGS`), `:74-77` (`parsePayrollSettings`), `:352-356` (rate resolution), `:399` (deduction)
- Test: `src/lib/payrollService.test.ts` (extend; file exists)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `payroll_settings.social_security_rate` (live: NOT NULL DEFAULT 0.07 — Appendix A); `PayrollSettingsValues.social_security_rate?: number` (`payrollService.ts:37`).
- Produces: an engine where an UNSET rate means "deduction skipped + loud warning" — never a fabricated Omani 7%. The Omani demo row keeps its correct 0.07 (PASI).

- [ ] **Step 1: Failing probe (DB) + failing test (TS).** DB:

```sql
SELECT column_default, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='payroll_settings' AND column_name='social_security_rate';
```

Expected today: default `0.07`, `is_nullable='NO'` — every new tenant is born with Oman's PASI rate. TS test — extend `src/lib/payrollService.test.ts`. The file mocks `./supabaseClient`, `./currencyService`, `./payrollBase` but NOT `./logger`; add a logger mock + import so the loud warning is assertable:

```typescript
// add to the top-of-file vi.mock block:
vi.mock('./logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// add an import:
import { logger } from './logger';
```

Then append this describe. It drives `processPayroll` for one employee; the higher-level reads (period / settings / attendance / loans / period-update) are spied via `vi.spyOn(payrollService, …)`, so only the `employees` SELECT and the `payroll_records` INSERT go through the file's `from` mock. `resolveRateContext`/`buildPayrollBaseColumns` are already mocked at module scope, and `makeQuery` is the file's existing builder:

```typescript
describe('statutory social-security guard (Phase 0)', () => {
  const baseSettings = {
    working_days_per_month: 22,
    working_hours_per_day: 8,
    overtime_rate_multiplier: { regular: 1.5, weekend: 1.5, holiday: 2 },
    payment_day: 28,
  };

  function arrange(
    socialSecurityRate: number | undefined,
    captured: { records?: Array<Record<string, unknown>> },
  ) {
    vi.spyOn(payrollService, 'getPayrollPeriod').mockResolvedValue(
      { id: 'period-1', status: 'draft', start_date: '2026-06-01', end_date: '2026-06-30', period_name: 'Jun 2026' } as never,
    );
    vi.spyOn(payrollService, 'getPayrollSettings').mockResolvedValue(
      { ...baseSettings, social_security_rate: socialSecurityRate } as never,
    );
    vi.spyOn(payrollService, 'getEmployeeAttendance').mockResolvedValue(
      { daysWorked: 22, daysAbsent: 0, daysLeave: 0, regularHours: 176, overtimeHours: 0 } as never,
    );
    vi.spyOn(payrollService, 'getActiveLoans').mockResolvedValue([] as never);
    vi.spyOn(payrollService, 'updatePayrollPeriod').mockResolvedValue(undefined as never);

    from.mockImplementation((table: string) => {
      if (table === 'employees') return makeQuery([{ id: 'emp-1', tenant_id: 't-1', basic_salary: 1000 }]);
      if (table === 'payroll_records') {
        return {
          insert: (rows: Array<Record<string, unknown>>) => {
            captured.records = rows;
            return { select: () => Promise.resolve({ data: rows, error: null }) };
          },
        } as unknown as ReturnType<typeof makeQuery>;
      }
      return makeQuery(null);
    });
  }

  it('skips the deduction and warns loudly when no rate is configured', async () => {
    const captured: { records?: Array<Record<string, unknown>> } = {};
    arrange(undefined, captured);

    await payrollService.processPayroll('period-1');

    expect(captured.records).toHaveLength(1);
    expect(captured.records![0].total_deductions).toBe(0);  // no fabricated 7% PASI
    expect(captured.records![0].net_salary).toBe(1000);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/social-security rate/i));
  });

  it('applies a configured rate exactly (Omani 0.07 keeps working)', async () => {
    const captured: { records?: Array<Record<string, unknown>> } = {};
    arrange(0.07, captured);

    await payrollService.processPayroll('period-1');

    expect(captured.records![0].total_deductions).toBe(70);  // 1000 * 0.07
    expect(captured.records![0].net_salary).toBe(930);
  });
});
```

- [ ] **Step 2: Run, verify failure:** `npx vitest run src/lib/payrollService.test.ts` — Expected: FAIL (the `?? 0.07` fallback deducts 70 even with a null rate).

- [ ] **Step 3: Apply migration `phase0_payroll_social_security_nullable`:**

```sql
-- A tenant with no configured statutory rate must be representable as NULL. The
-- live Omani tenant's 0.07 (PASI) is CORRECT for Oman and is retained untouched.
ALTER TABLE public.payroll_settings
  ALTER COLUMN social_security_rate DROP DEFAULT,
  ALTER COLUMN social_security_rate DROP NOT NULL;
```

Regen types (`mcp__supabase__generate_typescript_types`) + manifest row:

```markdown
| <applied-version> | phase0_payroll_social_security_nullable.sql | Additive | payroll_settings.social_security_rate nullable, 0.07 default dropped (Oman row keeps its correct PASI value) | #TBD-PR |
```

- [ ] **Step 4: Implement the TS guard.** In `src/lib/payrollService.ts`:

(a) Remove line 46 (`social_security_rate: 0.07,`) from `DEFAULT_PAYROLL_SETTINGS` — the optional field is simply absent.

(b) Replace the `parsePayrollSettings` branch at lines 74-77 with:

```typescript
    social_security_rate:
      typeof row.social_security_rate === 'number' ? row.social_security_rate : undefined,
```

(c) Replace lines 352-356 (comment + rate resolution) with:

```typescript
    // Statutory deductions are COUNTRY facts, not universal constants. An unset
    // rate means the deduction is SKIPPED with a loud warning — never a fabricated
    // Omani 7% (country payroll packs land in localization Phase 6).
    const socialSecurityRate = settings.social_security_rate ?? null;
    if (socialSecurityRate == null) {
      logger.warn(
        'payroll: no statutory social-security rate configured for this tenant — the deduction is SKIPPED. ' +
        'Set it in Payroll Settings before relying on net-pay figures.',
      );
    }
    const overtimeMultiplier = settings.overtime_rate_multiplier.regular;
```

Ensure `import { logger } from './logger';` is present at the top of `payrollService.ts` — it is NOT imported today, so add it or `logger.warn` won't resolve (`npm run check:tsc` flags the absence).

(d) Replace line 399 with:

```typescript
      const socialSecurityDeduction = socialSecurityRate == null ? 0 : basicSalary * socialSecurityRate;
```

- [ ] **Step 5: Run tests + typecheck:** `npx vitest run src/lib/payrollService.test.ts && npm run check:tsc` — Expected: PASS / 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payrollService.ts src/lib/payrollService.test.ts src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "fix(payroll): unset social-security rate skips the deduction loudly — Oman's 7% PASI is no longer the world's default"
```

### Task 20: Disable the fake USD 'WPS' bank file behind an honest error

**Files:**
- Modify: `src/lib/payrollService.ts:888-936` (`generateBankFile`, `generateWPSFileContent`)
- Modify: `src/pages/payroll/PayrollPeriodDetailPage.tsx:78-92` (`handleExportBankFile` — verify its `catch` shows the error via toast; add one if missing)
- Test: `src/lib/payrollService.test.ts` (extend)

**Interfaces:**
- Consumes: callers at `PayrollPeriodDetailPage.tsx:80` (`generateBankFile(id!, 'WPS')`) and `:85` (`generateWPSFileContent(records)`).
- Produces: both functions THROW `Error` with an honest not-configured message (signatures unchanged so callers compile). Phase 6's `PayrollPack.bankFileOps` replaces them with real formats.

- [ ] **Step 1: Write the failing test:**

```typescript
describe('bank-file generation is honestly disabled (Phase 0)', () => {
  it('generateBankFile throws the not-configured error and mints nothing', async () => {
    await expect(payrollService.generateBankFile('period-1', 'WPS'))
      .rejects.toThrow(/not configured for this tenant/);
    // Assert NO get_next_number RPC call and NO payroll_bank_files insert occurred.
  });
  it('generateWPSFileContent throws the same honest error', () => {
    expect(() => payrollService.generateWPSFileContent([])).toThrow(/not configured for this tenant/);
  });
});
```

- [ ] **Step 2: Run, verify failure:** `npx vitest run src/lib/payrollService.test.ts` — Expected: FAIL (today it resolves with a pipe-delimited USD file).

- [ ] **Step 3: Implement.** Replace BOTH function bodies (`src/lib/payrollService.ts:888-936`) with:

```typescript
  async generateBankFile(_periodId: string, _format: 'WPS' | 'ACH' | 'custom' = 'WPS'): Promise<never> {
    // Honest disable (localization Phase 0): the previous writer emitted a
    // pipe-delimited placeholder with hardcoded 'USD' and 'Bank Muscat' — not WPS
    // SIF, not NACHA, not BACS; no bank accepts it and it truncated 3-decimal OMR
    // salaries. Real country bank-file formats arrive with the Phase-6 payroll
    // packs (PayrollPack.bankFileOps: 'om_wps_sif', 'us_nacha', 'uk_bacs').
    throw new Error(
      'Salary bank-file generation is not configured for this tenant yet. The previous export produced a ' +
      'non-compliant placeholder file (wrong currency, wrong format) and has been disabled. Country-specific ' +
      'bank formats (WPS SIF, NACHA, BACS) ship with the payroll country packs.',
    );
  },

  generateWPSFileContent(_records: Array<Record<string, unknown>>): string {
    throw new Error(
      'WPS file generation is not configured for this tenant yet — see generateBankFile.',
    );
  },
```

In `PayrollPeriodDetailPage.tsx`, confirm `handleExportBankFile`'s `try` block (starting line 79) has a `catch` that surfaces `error.message` via `toast.error(...)` — the mutation above it (`:73-75`) shows the established pattern; add the equivalent `catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to generate bank file'); }` if the try/catch is incomplete.

- [ ] **Step 4: Run tests + typecheck:** `npx vitest run src/lib/payrollService.test.ts && npm run check:tsc` — Expected: PASS / 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payrollService.ts src/lib/payrollService.test.ts src/pages/payroll/PayrollPeriodDetailPage.tsx
git commit -m "fix(payroll): disable the fake USD/'Bank Muscat' WPS export behind an honest not-configured error"
```

---

### WP-10 — `record_payment` can never book USD by omission
*Branch: `fix/p0-record-payment-usd` · migration M10.*

### Task 21: `_fin_base_currency` RAISEs; `record_payment` defaults to the tenant base (migration M10)

**Files:**
- Migration: `phase0_record_payment_no_usd_default`
- Reference (repo source of the current bodies): `supabase/migrations/20260601092707_atomic_record_and_void_payment_rpcs.sql` (`_fin_base_currency` USD fallback at `:84`; `record_payment` USD COALESCE at `:139`)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `record_payment(p_payment jsonb, p_allocations jsonb) RETURNS payments` (signature UNCHANGED — the frontend at `src/lib/paymentsService.ts:207-216` always passes `currency`, so the green path is untouched); `_fin_base_currency(p_tenant uuid) RETURNS text`.
- Produces: an RPC contract where an omitted currency books at the tenant base (with rate 1 semantics preserved for base-currency payments) and an unresolvable base RAISEs — never `'USD'`.

- [ ] **Step 1: Failing probe — the silent USD booking:**

```sql
SELECT pg_get_functiondef(p.oid) ILIKE '%''USD''%' AS body_has_usd, p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('record_payment','_fin_base_currency');
```

Expected today: `body_has_usd = true` for both.

- [ ] **Step 2: Apply migration `phase0_record_payment_no_usd_default`.** Copy the CURRENT full bodies from the repo file `supabase/migrations/20260601092707_atomic_record_and_void_payment_rpcs.sql` and apply exactly two deltas:

Delta 1 — `_fin_base_currency` (replaces `RETURN COALESCE(v_code, 'USD');` at repo line 84):

```sql
CREATE OR REPLACE FUNCTION public._fin_base_currency(p_tenant uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_code text;
BEGIN
  SELECT currency_code INTO v_code
  FROM tenant_currencies
  WHERE tenant_id = p_tenant AND is_base = true AND deleted_at IS NULL
  LIMIT 1;
  IF v_code IS NULL THEN
    SELECT base_currency_code INTO v_code FROM tenants WHERE id = p_tenant;
  END IF;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'No base currency configured for tenant % — refusing to fabricate USD', p_tenant
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN v_code;
END;
$function$;
```

(Before applying, diff this header/lookup against the repo file's `_fin_base_currency` block around lines 70–86; if the live SELECTs differ, keep the live SELECTs and change ONLY the final COALESCE→RAISE.)

Delta 2 — inside the copied `record_payment` body, replace the single line (repo line 139):

```sql
  v_currency     := COALESCE(NULLIF(p_payment->>'currency',''), 'USD');
```

with:

```sql
  v_currency     := NULLIF(p_payment->>'currency','');
  IF v_currency IS NULL THEN
    -- Omitted currency books at the TENANT BASE (rate 1 by the same-currency
    -- invariant) — never a fabricated USD. _fin_base_currency RAISEs if even the
    -- base is unresolvable.
    v_currency := public._fin_base_currency(v_tenant);
  END IF;
```

Everything else in the copied body stays byte-identical (atomicity, FOR UPDATE, Σ(allocations)=amount, same-currency invariant, ledger posting, realized FX).

Additionally probe `convert_proforma_invoice_to_tax_invoice` for the same literal:

```sql
SELECT pg_get_functiondef(p.oid) ILIKE '%''USD''%' AS body_has_usd
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname = 'convert_proforma_invoice_to_tax_invoice';
```

If `true`: capture its body (`pg_get_functiondef`), replace its `COALESCE(<currency-expr>, 'USD')` with `COALESCE(<currency-expr>, public._fin_base_currency(<its tenant variable>))` (same mechanical pattern as Delta 2), include the `CREATE OR REPLACE` in this migration. If `false`: record "no USD literal" in the PR body.

- [ ] **Step 3: Passing probes.** (a) Re-run Step 1 → `body_has_usd = false` for both (and for the conversion RPC if patched). (b) Behavior probe (rolled back):

```sql
BEGIN;
-- as the demo tenant context this runs as postgres; call the internal helper directly:
SELECT public._fin_base_currency(id) AS base FROM public.tenants LIMIT 1;   -- expect 'OMR'
SELECT public._fin_base_currency(gen_random_uuid());                        -- expect ERROR 'No base currency configured'
ROLLBACK;
```

- [ ] **Step 4: Regression: the payments frontend path still passes.** Run: `npx vitest run src/lib/paymentsService.test.ts` — Expected: PASS (client always sends `currency: rc.documentCurrency`).

- [ ] **Step 5: Regen types + manifest row + commit**

```markdown
| <applied-version> | phase0_record_payment_no_usd_default.sql | Conditional | _fin_base_currency RAISEs instead of 'USD'; record_payment omitted-currency -> tenant base; proforma-conversion RPC checked/patched for the same literal | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "fix(payments): record_payment can never book USD by omission — base-currency default, fail-loud helper"
```

---

### WP-11 — Privacy hotfixes (owner decision E7)
*Branch: `fix/p0-privacy-hotfixes` · migrations M11 + M12 + one page fix.*

### Task 22: Rewrite `anonymize_customer_data` against the real schema (migration M11)

**Files:**
- Migration: `phase0_privacy_anonymize_customer_rewrite`
- Reference: old broken body in `supabase/migrations/20260409000000_baseline_schema.sql:5191-5218` (references `first_name`/`last_name`/`mobile`/`address_line1`/`address_line2`/`city`/`postal_code` — NONE exist on live `customers_enhanced`)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: live `customers_enhanced` columns (verified 2026-07-02): `customer_number, customer_name, email, mobile_number, phone, whatsapp_number, address, city_id, country_id, company_name, profile_photo_url, id_type, id_number, tax_number, notes, source, referred_by, portal_enabled, portal_password_hash, portal_failed_login_attempts, portal_locked_until, is_active, metadata, preferred_language`; `customer_communications(subject, content)`; caller `src/lib/gdprService.ts:53-58`.
- Produces: a working `anonymize_customer_data(p_customer_id uuid) RETURNS void` with regime-neutral annotations — the seed of the Phase-6 regime-parameterized erasure engine.

- [ ] **Step 1: Failing probe — the RPC throws for every customer today:**

```sql
BEGIN;
SELECT public.anonymize_customer_data(id) FROM public.customers_enhanced LIMIT 1;
ROLLBACK;
```

Expected today: `ERROR: 42703: column "first_name" of relation "customers_enhanced" does not exist` (or the first of the five phantom columns it hits).

- [ ] **Step 2: Pre-flight nullability probe** (drives the two email variants below):

```sql
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='customers_enhanced'
  AND column_name IN ('email','mobile_number','customer_name');
```

- [ ] **Step 3: Apply migration `phase0_privacy_anonymize_customer_rewrite`:**

```sql
CREATE OR REPLACE FUNCTION public.anonymize_customer_data(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_tag text := 'ERASED-' || left(p_customer_id::text, 8);
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.customers_enhanced WHERE id = p_customer_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Customer % not found', p_customer_id USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.customers_enhanced SET
    customer_name                = v_tag,
    email                        = NULL,      -- if Step 2 shows email NOT NULL, use: lower(v_tag) || '@erased.invalid'
    mobile_number                = NULL,      -- same NOT-NULL fallback pattern: '0000000000'
    phone                        = NULL,
    whatsapp_number              = NULL,
    address                      = NULL,
    company_name                 = NULL,
    profile_photo_url            = NULL,
    id_type                      = NULL,
    id_number                    = NULL,
    tax_number                   = NULL,
    notes                        = 'Personal data anonymized per data-subject erasure request',
    source                       = NULL,
    referred_by                  = NULL,
    metadata                     = '{}'::jsonb,
    portal_enabled               = false,
    portal_password_hash         = NULL,
    portal_failed_login_attempts = 0,
    portal_locked_until          = NULL,
    is_active                    = false,
    updated_at                   = now()
  WHERE id = p_customer_id;

  UPDATE public.customer_communications SET
    subject    = '[removed]',
    content    = 'Content removed per data-subject erasure request',
    updated_at = now()
  WHERE customer_id = p_customer_id;

  -- Audit entry: reuse the EXACT INSERT INTO audit_trails column list from the old
  -- function body (baseline_schema.sql:5212-5218) with the annotation text replaced by
  -- the regime-neutral 'Data anonymized per data-subject erasure request'. The
  -- old list is authoritative for this table's shape; only the wording changes.
END $function$;
```

(The trailing audit INSERT is copied verbatim from the baseline file with the neutral wording — a mechanical, in-repo-sourced substitution. Do NOT cite GDPR in durable data: the platform serves PDPL/DPDP/no-regime tenants too.)

- [ ] **Step 4: Passing probe (rolled back):**

```sql
BEGIN;
SELECT public.anonymize_customer_data(id) FROM public.customers_enhanced LIMIT 1;
SELECT customer_name LIKE 'ERASED-%' AS name_erased,
       portal_password_hash IS NULL   AS hash_cleared,
       portal_enabled = false         AS portal_off,
       tax_number IS NULL             AS tax_cleared
FROM public.customers_enhanced ORDER BY updated_at DESC LIMIT 1;
ROLLBACK;
```

Expected: all four `true`, no exception. Also confirm the durable annotation is regime-neutral: `SELECT count(*) FROM ... WHERE notes ILIKE '%GDPR%'` on the probe row → 0.

- [ ] **Step 5: Regen types + manifest row + commit**

```markdown
| <applied-version> | phase0_privacy_anonymize_customer_rewrite.sql | Conditional | anonymize_customer_data rewritten against real customers_enhanced columns; regime-neutral annotations; portal credentials invalidated | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "fix(privacy): customer-erasure RPC works again — rewritten against real columns, regime-neutral wording"
```

### Task 23: Column-allowlist `export_customer_data` (migration M12)

**Files:**
- Migration: `phase0_privacy_export_allowlist`
- Reference: old leaking body in `supabase/migrations/20260409000000_baseline_schema.sql:5441-5469` (`to_jsonb(c.*)` ships `portal_password_hash`, `id_number`, lockout columns)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: caller `src/lib/gdprService.ts:45-51` (expects a JSON object it downloads as-is).
- Produces: `export_customer_data(p_customer_id uuid) RETURNS jsonb` — explicit `jsonb_build_object` projections only; excluded BY DESIGN: `portal_password_hash`, `id_number`, `portal_failed_login_attempts`, `portal_locked_until`, `metadata`, internal FKs/aggregates.

- [ ] **Step 1: Failing probe — the leak, live:**

```sql
SELECT (public.export_customer_data(id))::text ILIKE '%portal_password_hash%' AS leaks_hash
FROM public.customers_enhanced LIMIT 1;
```

Expected today: `leaks_hash = true`.

- [ ] **Step 2: Apply migration `phase0_privacy_export_allowlist`:**

```sql
CREATE OR REPLACE FUNCTION public.export_customer_data(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'personal_info', (
      SELECT jsonb_build_object(
        'customer_number',    c.customer_number,
        'customer_name',      c.customer_name,
        'email',              c.email,
        'mobile_number',      c.mobile_number,
        'phone',              c.phone,
        'whatsapp_number',    c.whatsapp_number,
        'address',            c.address,
        'company_name',       c.company_name,
        'id_type',            c.id_type,
        'tax_number',         c.tax_number,
        'notes',              c.notes,
        'source',             c.source,
        'preferred_language', c.preferred_language,
        'portal_enabled',     c.portal_enabled,
        'created_at',         c.created_at
      )
      FROM public.customers_enhanced c
      WHERE c.id = p_customer_id AND c.deleted_at IS NULL
    ),
    'cases', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'case_no', cs.case_no, 'title', cs.title, 'status', cs.status, 'created_at', cs.created_at)), '[]'::jsonb)
      FROM public.cases cs WHERE cs.customer_id = p_customer_id AND cs.deleted_at IS NULL
    ),
    'invoices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'invoice_number', inv.invoice_number, 'invoice_type', inv.invoice_type,
        'invoice_date', inv.invoice_date, 'currency', inv.currency,
        'total_amount', inv.total_amount, 'status', inv.status)), '[]'::jsonb)
      FROM public.invoices inv WHERE inv.customer_id = p_customer_id AND inv.deleted_at IS NULL
    ),
    'quotes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'quote_number', q.quote_number, 'currency', q.currency,
        'total_amount', q.total_amount, 'status', q.status, 'created_at', q.created_at)), '[]'::jsonb)
      FROM public.quotes q WHERE q.customer_id = p_customer_id AND q.deleted_at IS NULL
    ),
    'communications', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'type', cc.type, 'subject', cc.subject, 'content', cc.content,
        'direction', cc.direction, 'sent_at', cc.sent_at)), '[]'::jsonb)
      FROM public.customer_communications cc WHERE cc.customer_id = p_customer_id AND cc.deleted_at IS NULL
    ),
    'payments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'payment_number', p.payment_number, 'amount', p.amount, 'currency', p.currency,
        'payment_date', p.payment_date, 'status', p.status)), '[]'::jsonb)
      FROM public.payments p WHERE p.customer_id = p_customer_id AND p.deleted_at IS NULL
    ),
    'exported_at', now()
  ) INTO v_result;
  RETURN v_result;
END $function$;
```

(If any referenced entity column errors 42703 on apply — e.g. a `payments.payment_number` naming difference — check the live column via `information_schema.columns` and use the real name; the allowlist principle, not the exact field roster, is the contract.)

- [ ] **Step 3: Passing probe:**

```sql
SELECT (public.export_customer_data(id))::text ILIKE '%portal_password_hash%' AS leaks_hash,
       (public.export_customer_data(id))::text ILIKE '%id_number%'            AS leaks_id_number,
       (public.export_customer_data(id)) ? 'personal_info'                    AS has_personal,
       jsonb_typeof((public.export_customer_data(id))->'invoices') = 'array'  AS has_invoices
FROM public.customers_enhanced LIMIT 1;
```

Expected: `false, false, true, true`.

- [ ] **Step 4: Regen types + manifest row + commit**

```markdown
| <applied-version> | phase0_privacy_export_allowlist.sql | Conditional | export_customer_data column-allowlisted (portal_password_hash/id_number/lockout excluded; never to_jsonb(row)) | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "fix(privacy): customer export is an explicit allowlist — credential hash no longer ships in the JSON"
```

### Task 24: DSRs no longer stuck in 'processing' on RPC failure

**Files:**
- Modify: `src/pages/settings/GDPRCompliancePage.tsx:63-101` (`processExport`, `processDeletion`)

**Interfaces:**
- Consumes: `gdprService.updateRequestStatus(id, status, processedBy?)` (`src/lib/gdprService.ts:30`).
- Produces: UI behavior only — a failed RPC returns the request to `pending` so it can be retried; the toast shows the real error.

(No new unit test — this is the plan's one **documented TDD waiver** (see Testing Strategy item 7): presentational error-flow wiring over RPCs whose correctness Tasks 22/23 pin with SQL probes; `npm run check:tsc` + the manual QA step verify the page. The jsdom cost of mounting this settings page is not justified for two catch blocks. The waiver lapses if either `catch` grows logic beyond status-revert + toast.)

- [ ] **Step 1: Edit both handlers** — in each `catch`, revert the status before toasting. `processExport` (lines 63-78) becomes:

```tsx
  const processExport = async (requestId: string) => {
    if (!selectedCustomerId) {
      toast.error('Please search and select a customer first');
      return;
    }
    try {
      await gdprService.updateRequestStatus(requestId, 'processing', user!.id);
      const data = await gdprService.exportCustomerData(selectedCustomerId);
      gdprService.downloadAsJson(data, `dsr-export-${new Date().toISOString().slice(0, 10)}.json`);
      await gdprService.updateRequestStatus(requestId, 'completed', user!.id);
      queryClient.invalidateQueries({ queryKey: gdprKeys.all });
      toast.success('Data exported successfully');
    } catch (err) {
      await gdprService.updateRequestStatus(requestId, 'pending', user!.id).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: gdprKeys.all });
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };
```

`processDeletion` (lines 80-101): apply the identical `catch` pattern (revert to `'pending'`, invalidate, toast the real message) around its existing `try` body — the confirm dialog and success path stay untouched.

- [ ] **Step 2: Typecheck:** `npm run check:tsc` — Expected: 0.

- [ ] **Step 3: Manual QA:** with Task 22 NOT yet applied on a branch DB (or by temporarily pointing at a customer id of `gen_random_uuid()`), click "Process" on a deletion request — the request must return to `pending` (not freeze at `processing`) and the toast must show the DB error.

- [ ] **Step 4: Commit**

```bash
git add src/pages/settings/GDPRCompliancePage.tsx
git commit -m "fix(privacy): failed DSR processing reverts to pending instead of sticking in processing"
```

---

### WP-12 — Residency & privacy-regime seeds + the global-1 invariant (owner E6)
*Branch: `feat/p0-residency-seeds-gate` · migration M13 + provisioning guard.*

### Task 25: Regime seeds + `global-1` CHECK (migration M13)

**Files:**
- Migration: `phase0_residency_seed_and_invariant`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: existing columns `geo_countries.data_protection_regime` (NULL for all 58) and `geo_countries.requires_local_residency` (verified present); `tenants.data_residency_region` (NOT NULL DEFAULT `'global-1'`).
- Produces: seeded `data_protection_regime` ∈ (`'gdpr'|'pdpl'|'dpdp'|'none'`) for all 58 rows (contract vocabulary #16, consumed Phase 6); explicit `requires_local_residency=false` decision for the 9 onboardable countries; `tenants_data_residency_global1` CHECK — the invariant a future region table replaces without business-logic change.

- [ ] **Step 1: Failing probe:**

```sql
SELECT count(*) AS unseeded FROM public.geo_countries WHERE data_protection_regime IS NULL;
SELECT count(*) AS invariant FROM information_schema.table_constraints
WHERE table_schema='public' AND table_name='tenants' AND constraint_name='tenants_data_residency_global1';
```

Expected today: `unseeded = 58`, `invariant = 0`.

- [ ] **Step 2: Apply migration `phase0_residency_seed_and_invariant`:**

```sql
-- Privacy-regime seeds (contract vocabulary: gdpr | pdpl | dpdp | none). Absent
-- codes in a list are harmless no-ops; every row ends non-NULL via the final UPDATE.
UPDATE public.geo_countries SET data_protection_regime = 'gdpr'
 WHERE data_protection_regime IS NULL AND code IN
  ('GB','DE','FR','IT','ES','NL','BE','IE','PT','AT','SE','DK','FI','NO','CH','PL','CZ','GR','HU','RO','LU');
UPDATE public.geo_countries SET data_protection_regime = 'pdpl'
 WHERE data_protection_regime IS NULL AND code IN ('SA','OM','AE','BH','QA','KW');
UPDATE public.geo_countries SET data_protection_regime = 'dpdp'
 WHERE data_protection_regime IS NULL AND code = 'IN';
UPDATE public.geo_countries SET data_protection_regime = 'none'
 WHERE data_protection_regime IS NULL;

ALTER TABLE public.geo_countries
  ADD CONSTRAINT geo_countries_data_protection_regime_check
  CHECK (data_protection_regime IN ('gdpr','pdpl','dpdp','none')) NOT VALID;
ALTER TABLE public.geo_countries VALIDATE CONSTRAINT geo_countries_data_protection_regime_check;

-- Residency mandate: EXPLICIT decision recorded — none of the 9 currently
-- onboardable countries carries a hard data-localization mandate that blocks a
-- single global deployment (owner E6 + this phase's "onboarding works for every
-- seeded country" exit criterion). Flipping a row to true later enforces the
-- honest-422 gate (Task 26) automatically, with zero code change.
UPDATE public.geo_countries SET requires_local_residency = false
 WHERE code IN ('AE','BH','GB','IN','KW','OM','QA','SA','US');

-- The global-1 invariant: marketing residency on a dormant column is the named
-- failure mode; this CHECK makes the single-region reality DB-enforced. When a
-- regional Supabase project lands, replace this CHECK with an FK to the residency
-- region table — routing changes, business logic does not.
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_data_residency_global1
  CHECK (data_residency_region = 'global-1') NOT VALID;
ALTER TABLE public.tenants VALIDATE CONSTRAINT tenants_data_residency_global1;
```

- [ ] **Step 3: Passing probes:** Step 1's queries → `unseeded = 0`, `invariant = 1`. Plus:

```sql
SELECT data_protection_regime, count(*) FROM public.geo_countries GROUP BY 1 ORDER BY 2 DESC;
BEGIN;
UPDATE public.tenants SET data_residency_region = 'eu-1' WHERE deleted_at IS NULL;  -- expect CHECK violation
ROLLBACK;
```

Expected: regime distribution with 0 NULLs; the UPDATE fails with `violates check constraint "tenants_data_residency_global1"`.

- [ ] **Step 4: Regen types + manifest row + commit**

```markdown
| <applied-version> | phase0_residency_seed_and_invariant.sql | Conditional | data_protection_regime seeded for all 58 countries (+CHECK); requires_local_residency=false recorded for the 9 onboardable; tenants global-1 CHECK invariant | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(residency): seed privacy regimes, record the residency decision, enforce the global-1 invariant"
```

### Task 26: Provisioning residency gate (honest 422)

**Files:**
- Modify: `supabase/functions/provision-tenant/provisionGuards.ts` (add error + guard)
- Modify: `supabase/functions/provision-tenant/index.ts:201-208` (country select + guard call)
- Test: `supabase/functions/provision-tenant/provisionGuards.test.ts` (extend; file exists)

**Interfaces:**
- Consumes: Task 25's seeded `requires_local_residency`; existing `assertOnboardableCountry` (`provisionGuards.ts:41-60`) and its 422 handling in `index.ts`.
- Produces: `export class ResidencyNotAvailableError extends Error { readonly status = 422 }` and `export function assertResidencySupported(country: { name?: string | null; requires_local_residency?: boolean | null }, availableRegions?: string[]): void` — the seam later regional deployments extend by passing real regions.

- [ ] **Step 1: Write the failing test** — add to `provisionGuards.test.ts`:

```typescript
import { assertResidencySupported, ResidencyNotAvailableError } from './provisionGuards';

describe('assertResidencySupported (owner E6 honest 422)', () => {
  it('throws 422 for a residency-mandated country when only global-1 exists', () => {
    expect(() =>
      assertResidencySupported({ name: 'Ruritania', requires_local_residency: true }),
    ).toThrow(ResidencyNotAvailableError);
    try {
      assertResidencySupported({ name: 'Ruritania', requires_local_residency: true });
    } catch (e) {
      expect((e as ResidencyNotAvailableError).status).toBe(422);
    }
  });
  it('passes for false/null flags (all 9 live countries today)', () => {
    expect(() => assertResidencySupported({ name: 'Oman', requires_local_residency: false })).not.toThrow();
    expect(() => assertResidencySupported({ name: 'Oman', requires_local_residency: null })).not.toThrow();
  });
  it('passes when a matching non-global region is available (future regional deploys)', () => {
    expect(() =>
      assertResidencySupported({ name: 'Ruritania', requires_local_residency: true }, ['global-1', 'eu-1']),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify failure:**

Run: `npx vitest run --config vitest.config.scripts.ts supabase/functions/provision-tenant/provisionGuards.test.ts`
Expected: FAIL — `assertResidencySupported` is not exported.

- [ ] **Step 3: Implement.** Append to `provisionGuards.ts`:

```typescript
/** Owner E6: a residency-mandated country without a matching deployed region must
 *  fail with an HONEST 422 — never silently place regulated data in global-1. */
export class ResidencyNotAvailableError extends Error {
  readonly status = 422;
  constructor(countryName: string) {
    super(
      `${countryName} requires in-country data residency and no matching residency region is deployed yet. ` +
      'Onboarding is blocked rather than silently storing regulated data in the global region.',
    );
    this.name = 'ResidencyNotAvailableError';
  }
}

export function assertResidencySupported(
  country: { name?: string | null; requires_local_residency?: boolean | null },
  availableRegions: string[] = ['global-1'],
): void {
  if (!country?.requires_local_residency) return;
  if (availableRegions.some((r) => r !== 'global-1')) return;
  throw new ResidencyNotAvailableError(country.name ?? 'This country');
}
```

In `index.ts` (four concrete edits — the last is load-bearing):

1. Extend the import at `:2` to include the new symbols:

```typescript
import { assertOnboardableCountry, assertResidencySupported, ProvisionGuardError, ResidencyNotAvailableError } from './provisionGuards.ts';
```

2. Add `requires_local_residency` to the `geo_countries` `.select(...)` list at `:203` (append it to the existing 15-column string).

3. Place the new assertion inside the SAME `try` block, and widen that block's local `catch` so the new error routes to 422. **Replace the whole `:207-217` block** with:

```typescript
    try {
      assertOnboardableCountry(countryData);
      assertResidencySupported(countryData);
    } catch (guardErr) {
      if (guardErr instanceof ProvisionGuardError || guardErr instanceof ResidencyNotAvailableError) {
        return new Response(
          JSON.stringify({ error: guardErr.message }),
          { status: guardErr.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw guardErr;
    }
```

`ResidencyNotAvailableError` stays `extends Error` with `readonly status = 422` per the canonical contract; routing works because this branch matches the class **explicitly** and reads its `.status`. Do NOT rely on the pre-existing `instanceof ProvisionGuardError` check alone — a bare `extends Error` subclass fails that `instanceof`, falls through to `throw guardErr`, and is caught by the outer handler as a generic **500** (the silent wrong-status trap this finding guards against). The `.status` read is safe because both classes expose `status: number`.

- [ ] **Step 4: Run tests:**

Run: `npx vitest run --config vitest.config.scripts.ts supabase/functions/provision-tenant/provisionGuards.test.ts`
Expected: PASS.

- [ ] **Step 5: Redeploy the edge function** via `mcp__supabase__deploy_edge_function` (project_id `ssmbegiyjivrcwgcqutu`, function `provision-tenant`) — or `supabase functions deploy provision-tenant` where the CLI is available. Verify with a dry POST that a normal OM/GB signup still returns 201 on the happy path.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/provision-tenant/provisionGuards.ts supabase/functions/provision-tenant/provisionGuards.test.ts supabase/functions/provision-tenant/index.ts
git commit -m "feat(residency): honest-422 provisioning gate for residency-mandated countries (dormant until a flag flips)"
```

---

### WP-13 — Numbering security hygiene
*Branch: `fix/p0-revoke-anon-number-mutator` · migration M14.*

### Task 27: REVOKE the anon grant on `update_number_sequence` (migration M14)

**Files:**
- Migration: `phase0_revoke_anon_number_sequence_mutator`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: live grants (verified 2026-07-02: `update_number_sequence(text,text,integer,boolean,integer)` — SECURITY DEFINER, EXECUTE granted to **anon**); Settings UI caller `src/pages/settings/SystemNumbers.tsx:106-111` (authenticated — unaffected).
- Produces: a pre-auth-unreachable sequence mutator. The full admin-gate + audit-write hardening ships with `get_next_number` v2 in Phase 1 (the "one release" rule) — this task only closes the unauthenticated hole.

- [ ] **Step 1: Failing probe:**

```sql
SELECT has_function_privilege('anon',
  'public.update_number_sequence(text,text,integer,boolean,integer)', 'EXECUTE') AS anon_can_execute;
```

Expected today: `anon_can_execute = true` — an unauthenticated caller path to rewrite document numbering.

- [ ] **Step 2: Apply migration `phase0_revoke_anon_number_sequence_mutator`:**

```sql
REVOKE EXECUTE ON FUNCTION public.update_number_sequence(text,text,integer,boolean,integer)
  FROM anon, PUBLIC;
COMMENT ON FUNCTION public.update_number_sequence(text,text,integer,boolean,integer) IS
  'SEC: EXECUTE revoked from anon/PUBLIC (localization Phase 0) — a recreated SECURITY DEFINER function '
  'silently restores the default PUBLIC grant; re-assert grants on every CREATE OR REPLACE. Full '
  'is_tenant_admin() gate + number_sequences_audit writes ship with get_next_number v2 (Phase 1).';
```

- [ ] **Step 3: Passing probe:** rerun Step 1 → `false`; and `SELECT has_function_privilege('authenticated', 'public.update_number_sequence(text,text,integer,boolean,integer)', 'EXECUTE')` → still `true` (Settings UI unaffected).

- [ ] **Step 4: Regen types + manifest row + commit**

```markdown
| <applied-version> | phase0_revoke_anon_number_sequence_mutator.sql | RLS-only | REVOKE anon/PUBLIC EXECUTE on update_number_sequence (pre-auth sequence-mutation hole) | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "fix(security): revoke anon EXECUTE on update_number_sequence — numbering was mutable pre-auth"
```

---

## Testing Strategy

1. **TDD per task.** Every TS change lands with a colocated Vitest spec written first (node project for `src/lib/*.test.ts`, jsdom for `*.test.tsx`; TZ pinned `Asia/Dubai` makes every UTC-divergence assertion deterministic). Every DB change lands with SQL probes: a BEFORE probe demonstrating the live wrong behavior (the "failing test"), the migration, and an AFTER probe proving the fix — all rolled back where they touch data.
2. **Live-DB gate scripts** (self-skipping without env, following the `registry-trigger-parity` pattern): `signup-smoke` (anon PostgREST, Task 2), `registry-mapper-parity` (Task 4), `provisioning-ghost-scalars` (UK fixture, Task 5). These are the phase's three contract-named CI gates.
3. **In-migration assertions.** The backfill (Task 16) carries its own SUM-parity + row-invariant `DO` blocks that RAISE (and roll the migration back) on violation; the monitor migration (Task 17) is proven with a seeded-violation probe.
4. **Regression suites.** `npm test` runs after every WP; the custody 'financial' write paths are untouched by this phase (no invoiceService/quotesService/paymentsService custody code is edited), and `paymentsService.test.ts`/`bankingService.test.ts`/`payrollService.test.ts`/`vatService.test.ts`/`expensesService.test.ts` extensions pin the changed behaviors. Known caveat: LocaleContext/i18n jsdom failures are a local-only artifact — they pass in CI; don't chase them.
5. **Idempotence.** Task 16's UPDATEs are re-run standalone and must report 0 rows — the `rate_source='derived_backfill'` / `*_base IS NULL` keying is itself under test.
6. **Manual QA (one pass at phase end):** create a GB tenant through the real wizard (signup list loads, tenant lands with GBP/VAT/Europe/London); open VAT & Audit (rate shows `5.00%`); open the VAT return modal on a Muscat browser (Q-boundaries month-aligned); attempt a cross-currency transfer (clear error); run payroll with an unset rate (warning, no 7%); export bank file (honest error); process a DSR export + deletion (works; JSON has no `portal_password_hash`).
7. **Documented TDD waiver — Task 24 (DSR error-flow wiring).** Task 24 is the single task in this phase intentionally exempt from the strict "Step 1 = failing test" format. It is presentational `catch`-block wiring over RPCs whose correctness is already pinned by SQL probes in Tasks 22/23; mounting `GDPRCompliancePage` under jsdom purely to assert two `toast.error`/`invalidateQueries` calls is disproportionate to the risk. It ships as a non-TDD tweak, verified by `npm run check:tsc` (0) plus the Step-3 manual QA (a failed RPC returns the request to `pending` and surfaces the real DB error). This waiver — the only sanctioned deviation from the TDD task format in this plan — is recorded here so the deviation is deliberate and reviewable; if the two `catch` bodies ever grow logic beyond status-revert + toast, the waiver lapses and a jsdom test is required.

## Verification Commands

All from the repo root; every command exists today (verified against `package.json` and `scripts/`).

| Command | Expected |
|---|---|
| `npm run check:tsc` | `0` src diagnostics (exit 0) |
| `npm test` | full Vitest suite green (jsdom i18n failures = known local-only artifact; green in CI) |
| `npx vitest run src/lib/tenantToday.test.ts src/lib/vatPeriods.test.ts src/lib/format.test.ts` | PASS — new Phase-0 helpers |
| `npx vitest run src/lib/vatService.test.ts src/lib/expensesService.test.ts src/lib/bankingService.test.ts src/lib/payrollService.test.ts src/lib/paymentsService.test.ts` | PASS — changed services |
| `npm run geo:test` | scripts project green (new gates self-skip without env) |
| `set -a; source .env; set +a; npm run check:signup-smoke` | PASS — anon country list returns 200 + rows |
| `SUPABASE_DB_URL=<url> npm run check:registry-mapper-parity` | PASS — mapper covers every geo-derived registry key |
| `SUPABASE_DB_URL=<url> npm run check:provisioning-ghost-scalars` | PASS — UK fixture has zero USD/NONE ghosts |
| `SUPABASE_DB_URL=<url> npm run check:schema-drift` | no diff (types regenerated after every migration) |
| `SUPABASE_DB_URL=<url> bash scripts/check-migration-manifest.sh` | every applied version has a manifest row |
| `SUPABASE_DB_URL=<url> psql "$SUPABASE_DB_URL" -f scripts/financial/check-financial-base-integrity.sql` | **0 rows** returned |
| `npx eslint src` | clean (no new rules added this phase) |
| via `mcp__supabase__execute_sql`: `SELECT public.assert_financial_base_integrity(interval '100 years');` | succeeds (no exception) |
| via `mcp__supabase__execute_sql`: `SELECT jobname FROM cron.job WHERE jobname='financial-base-integrity-hourly';` | 1 row |

## Acceptance Criteria

- [ ] Anon PostgREST `geo_countries` wizard query returns 200 with 9 active countries (Tasks 1–2); smoke test in CI.
- [ ] A `tenants` INSERT providing only `country_id` yields country-correct scalars for OM and GB probes; `base_currency_code` never fabricates USD; a `country_id` UPDATE overwrites the 11 country scalars, preserves `base_currency_code`/`ui_language`, and refreshes `resolved_country_config` (Task 3).
- [ ] Zero ghost DEFAULTs remain on the 12 tenants country scalars; registry↔mapper parity gate green; UK-fixture gate green (Tasks 3–5).
- [ ] `tenantToday('Asia/Muscat')` at 2026-06-30T22:30Z returns `2026-07-01`; all 20 sweep-table rows applied; the swept-pattern guard test green (Tasks 6, 9).
- [ ] VAT & Audit shows `5.00%` (not `500.00%`) for the Omani tenant in both KPI and record rows (Task 7).
- [ ] VAT return modal seeds month-aligned tenant-local quarter bounds; `calendarQuarterBounds(2026, 3).periodStart === '2026-07-01'` (Task 8).
- [ ] `vat_records` carries `currency`/`exchange_rate`/`vat_amount_base`/`taxable_amount_base`; output-VAT trigger and expense writer stamp them; `calculateVATForPeriod` sums base (Tasks 10–12).
- [ ] A credit note against a tax invoice produces a negative `vat_records` row; voiding it produces the offsetting positive row; `issue_credit_note`/`void_credit_note` no longer reference `vat_transactions`; `vat_transactions` client-role writes revoked (Tasks 13–14).
- [ ] Zero `numeric(12,2)` money columns remain on ANY base table platform-wide (excluding the two `clone_drives` GB-size columns) — asserted by Task 15 Step 1 query (a) returning 0 rows, not merely on a named allowlist; no `numeric(5,2)` tax-rate columns anywhere; `receipts.exchange_rate` is `(20,10)`; `invoices`/`payments`/`quotes` currency DEFAULTs dropped (Task 15).
- [ ] 0 NULL `*_base` across invoices/quotes/payments/receipts; all backfilled rows keyed `rate_source='derived_backfill'`; SUM-parity assertions passed in-migration; UPDATEs idempotent (Task 16).
- [ ] `assert_financial_base_integrity()` exists, RAISEs on a seeded violation, and is scheduled hourly; the SQL twin returns 0 rows (Task 17).
- [ ] An OMR→USD transfer throws before any insert/balance mutation; same-currency transfers unaffected (Task 18).
- [ ] Payroll with an unset statutory rate deducts 0 with a loud warning; the Omani row still deducts 7%; bank-file export throws the honest not-configured error with no side effects (Tasks 19–20).
- [ ] `record_payment` and `_fin_base_currency` bodies contain no `'USD'` literal; omitted currency books at tenant base; unresolvable base RAISEs (Task 21).
- [ ] `anonymize_customer_data` completes without 42703, clears portal credentials, writes regime-neutral annotations; `export_customer_data` JSON contains neither `portal_password_hash` nor `id_number`; a failed DSR reverts to `pending` (Tasks 22–24).
- [ ] All 58 countries carry a non-NULL `data_protection_regime`; `tenants_data_residency_global1` CHECK enforced; `assertResidencySupported` 422s a flagged country and passes all 9 live ones (Tasks 25–26).
- [ ] `anon` cannot EXECUTE `update_number_sequence`; `authenticated` still can (Task 27).
- [ ] `npm run check:tsc` = 0; `check:schema-drift` clean; every applied migration has a manifest row.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Dropping tenants DEFAULTs breaks an unknown tenants-inserting path (NOT NULL now bites) | Deliberate fail-loud: any such path was minting USD tenants. `provision-tenant` (the only known writer) passes `country_id`; the OM/GB probes + UK gate prove the trigger fills everything; tsc surfaces TS-side inserters after type regen. |
| Live RPC/trigger bodies drift from the verified descriptions (`post_invoice_vat_record`, credit-note RPCs, `record_payment`, the apply-config wrapper) | Every replace-function task starts with a `pg_get_functiondef` capture step and a STOP-and-reconcile instruction; post-apply assertions (`NOT ILIKE '%vat_transactions%'`, `NOT ILIKE '%''USD''%'`, trigger-def contains `OR UPDATE OF country_id`) catch a bad merge. |
| Numeric widening rewrites tables | Corpus is tiny (≤1,138 rows/table); scale changes rewrite but complete in milliseconds; applied in one migration, off-peak irrelevant (no production users — owner context). |
| Backfill misreads rate semantics (the stored 2.6 artifact) | Backfill trusts `currency` vs `base_currency_code`, never the stored rate; row-level invariant + SUM-parity assertions abort the migration on any violation; idempotence keyed on `*_base IS NULL`. |
| The 1 USD invoice predates `exchange_rates` history (2026-05-30) | `_p0_backfill_rate` carries BACK to the earliest provider row and the provenance is honest (`derived_backfill`); the row is flagged in Step 3's provenance query for eyeball review. |
| `record_payment` omitted-currency now books base instead of erroring — is that "hard error" enough? | The wrong-money path (silent USD) is closed; base-currency booking is correct-by-invariant (rate 1 = same-currency payment). `_fin_base_currency` RAISEs when even base is unresolvable — the genuine hard-error case. |
| Throwing from `createExpenseVATRecord` surfaces mid-approval failures | Intended posture change (loud beats silently-wrong reclaim); the error propagates to the approval toast; no production users to disrupt (owner context). |
| GB probe values drift from seeds (e.g. `fiscal_year_start` `'04-06'`) | Task 5 asserts against Appendix-A-verified seed values; if a legitimate seed correction changes them, update the fixture expectations in the same PR as the seed change. |
| pg_cron job leaks into a branch-DB rehearsal | `cron.schedule` is guarded by a jobname-existence check (idempotent); Supabase branches copy cron config — harmless duplicate protection. |
| CI dormancy (Actions reportedly dormant since ~06-20; only `typecheck` branch-protection-required) | Every WP's verification commands are runnable locally and listed above; do not rely on CI as the only gate — run the table before requesting merge. |

## Exit Criteria (roadmap row, made measurable)

1. **"Onboarding works for every seeded country"** → Task 2's smoke test green (9 countries listed via anon REST) AND Task 5's UK fixture green AND one manual wizard signup for a non-Oman country reaching a 201 with country-correct scalars.
2. **"No wrong-money write path remains open"** → Acceptance items for Tasks 10–21 all checked: credit-note reversal posts contra rows; ledger carries base; precision floors in place; transfers guarded; payroll guarded; `record_payment`/conversion RPC USD literals gone; `vat_transactions` frozen.
3. **"Monitors green"** → `SELECT public.assert_financial_base_integrity(interval '100 years')` succeeds; `cron.job` row present; `scripts/financial/check-financial-base-integrity.sql` returns 0 rows; the three live-DB gates (signup-smoke, registry-mapper-parity, provisioning-ghost-scalars) pass with env.
4. Phase-brief extras → privacy hotfix acceptance items (Tasks 22–24) and residency items (Tasks 25–26) checked; `npm run check:tsc` = 0; schema-drift clean; manifest complete.

## Estimated Effort

| WP | Scope | Engineer-days |
|---|---|---|
| WP-1 | geo deleted_at + smoke test | 0.5 |
| WP-2 | tenants defaults/sync + parity + UK gates | 2.0 |
| WP-3 | tenantToday + vatPeriods + ×100 + 20-row sweep | 2.0 |
| WP-4 | vat_records dimensions + two writers + return math | 1.5 |
| WP-5 | credit-note reversal + freeze | 1.0 |
| WP-6 | precision widening sweep | 1.0 |
| WP-7 | backfill + monitors | 1.5 |
| WP-8 | transfer guard | 0.5 |
| WP-9 | payroll guards | 1.0 |
| WP-10 | record_payment USD | 0.5 |
| WP-11 | privacy hotfixes | 1.5 |
| WP-12 | residency seeds + gate | 1.0 |
| WP-13 | anon REVOKE | 0.25 |
| **Total** | | **~14.25 engineer-days** (fits the 1–2-week roadmap size; WPs 1/3/8/9/13 parallelize freely — only WP-4→WP-5 and WP-6→WP-7 are ordered) |

**PR sequencing note:** WP-4 must merge before WP-5 (contra rows need the new columns); WP-6 before WP-7 (backfill writes into widened columns). Everything else is independent. Since PRs are squash-merged and branches deleted, cut each WP branch fresh from the then-current `main`.
