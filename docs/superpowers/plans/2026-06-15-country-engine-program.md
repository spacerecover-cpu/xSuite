# xSuite Country Engine — Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize xSuite's working 1-country/1-tenant config spine into a fail-loud, migration-free, 6-level Country Engine — closing the 18 live correctness defects (D1–D18) and shipping GCC-deep statutory + globally-wide formatting on additive, CI-guarded rails.

**Architecture:** A jsonb config bag (`geo_countries.country_config`) + a typed-but-open code registry + a pure cascade resolver (cloning the proven `feature_flags` pattern) resolve one effective display-config value per key across six layers (Global→Region→Country→LegalEntity/Tenant→BusinessUnit→Department), while statutory tax/FX resolve **live + effective-dated at document commit and freeze onto the document row** — never from the display snapshot. The 6-level hierarchy ships dormant (nullable scope columns, auto-collapse to one legal entity + one business unit, ADDITIONAL-RESTRICTIVE RLS created flag-off); live sub-unit isolation, multi-entity operations, and multi-region residency are hard-gated behind named/signed customers.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind, TanStack Query v5, Supabase (Postgres 15 via `mcp__supabase__apply_migration`, Auth, Edge Functions, Storage), pdfmake, vitest, ESLint custom rules + required-status CI gates.

---

## How to use this plan

This document is the **program master plan** — one coherent map of the whole Country Engine across five phases. It uses **graduated detail by design**:

- **Phase 0 — fully bite-sized and execution-ready NOW.** Every task is a complete TDD micro-loop (one failing test → run-to-fail → minimal implementation → run-to-pass → commit) with verified `file:line` anchors, exact migration SQL, and exact verification commands. **Start here.** Phase 0 has no blocking open questions and capitalizes on the empty 0-payroll/0-vat-return window to fix the live defects before any tenant depends on the wrong model.
- **Phases 1–4 — task-level now, expand-on-arrival.** Each phase below is specified to the task + file-map + exit-criteria level — enough to sequence, estimate, and review the shape — but **each must be expanded into its own detailed, dated plan** under `docs/superpowers/plans/` (e.g. `2026-06-XX-country-engine-phase1.md`) **when it is reached**, using superpowers:writing-plans. Do that expansion **only after the blocking open questions named for that phase (§ "Blocking open questions" below) are answered** — they change resolver precedence, dataset sourcing, and statutory sign-off in ways that would otherwise force a re-plan.
- **Phase 4 is gated behind named, signed customers.** It is the most expensive, lowest-current-ROI phase. Its correct default state is **not started**. Do not expand or build any Phase-4 work-stream until a real contract triggers its specific gate (multi-site → WS-A, ≥2 legal entities → WS-B, EU/regulated → WS-C). If no gate is triggered, "not started" is success, not incompleteness.

When you reach a phase: (1) confirm its dependencies (below) are merged, (2) confirm its blocking open questions are answered, (3) run superpowers:writing-plans to expand it into a dated per-phase plan using the task list here as the skeleton, (4) execute that plan with subagent-driven-development.

---

## Cross-cutting standards (apply to every task)

These are non-negotiable for **every** task in every phase. A task that violates one is non-conforming and must be redone.

1. **Migration discipline.** Every schema change goes through `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) — never hand-written files, never the Supabase dashboard. Immediately after each migration: (a) `mcp__supabase__generate_typescript_types` → overwrite `src/types/database.types.ts` (never hand-edit); (b) append the migration row to `supabase/migrations.manifest.md` (the `migration-manifest` gate reads it); (c) `bash scripts/check-schema-drift.sh` must print no diff; (d) `npm run check:tsc` / `bash scripts/check-tsc.sh` must print 0 errors; (e) use `.github/PULL_REQUEST_TEMPLATE/migration.md`. The six required CI gates — `typecheck`, `schema-drift`, `lint`, `tenant-table-requirements`, `migration-manifest`, `from-table-names` — plus the new program gates (`country-lint`, `country-config-completeness`, `registry-trigger-parity`, `statutory-gate`, `country-i18n`) must all be green before merge.
2. **TDD with vitest.** Every behavioral change is written test-first: write the failing test, run `npx vitest run <path>` and confirm it FAILS for the expected reason, write the minimal implementation, run and confirm it PASSES, then commit. Pure helpers are extracted as the testable seam wherever a React/DB dependency would otherwise block a unit test. Known local-only `i18n`/`LocaleContext` jsdom failures pass in CI — do not chase them (MEMORY).
3. **Additive-only / soft-delete.** Zero `DROP TABLE`, `DROP COLUMN`, `DELETE FROM`, or non-null backfill that can fail. New columns are nullable (or have a safe default); deletes set `deleted_at = now()`. Backfills are idempotent `DO` blocks that fail loud per-row rather than guessing.
4. **Additive-RESTRICTIVE-RLS rule.** Sub-scope isolation is **only ever a second RESTRICTIVE policy ANDed onto the untouched `*_tenant_isolation` predicate** (`tenant_id = get_current_tenant_id() OR is_platform_admin()`). Never edit `get_current_tenant_id()`, never relax the existing predicate. Two RESTRICTIVE policies = strictly narrower, provably cannot widen. New tenant-scoped tables get the full envelope: `tenant_id uuid NOT NULL REFERENCES tenants(id)`, RLS ENABLE+FORCE, RESTRICTIVE isolation, `set_<table>_tenant_and_audit` trigger, `idx_<table>_tenant_id` partial index — must pass `scripts/check-tenant-table-requirements.sql`. Global `geo_*`/`master_*` tables get no `tenant_id`, SELECT `true`, write `is_platform_admin()`.
5. **Feature-flag gating for safe rollout.** Risky/depth capabilities ship behind `tenants.feature_flags` (the proven jsonb toggle) and flip per verified tenant after staging. Dormant policies/flags are pure no-ops until flipped. The dark-flag scaffold (`country_engine.statutory_tax`, `country_engine.rules_payroll`, `country_engine.work_calendar`, `business_unit_isolation`) is created early and flipped on per-country/per-tenant only after the relevant statutory/topology verification passes.
6. **Commit cadence.** One logical change per commit, each with its tests green and `tsc` at 0. Branch from `main` per piece of work; never reuse a merged branch (squash-merge deletes it). Every commit message ends with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
7. **Fail-loud, not fail-US (invariant).** No required country-config key may ever resolve to a US literal (`'$'`/`'USD'`/`'en-US'`/`'MM/DD/YYYY'`/flat-7%). A missing required value surfaces a thrown `CountryConfigError`/`MissingConfigError`, a 422 at provisioning, or a blocking "tenant not configured" UI state with telemetry — never a silent default. Cosmetic/tenant-chosen display fields keep safe defaults; required jurisdiction-derived keys do not.
8. **Statutory live-then-frozen (invariant).** Statutory tax rate and FX are resolved **live and effective-dated at document commit** (off the resolving legal entity's country/currency and the document date), then **snapshotted onto the document row** (`tax_amount`, `exchange_rate`, the append-only `tax_line_assessments` row) for forensic immutability. They are **never** read from, or stored in, the tenant display snapshot. Display config is snapshotted/cached; statutory computation bypasses the cache.
9. **No-country-specific-code ESLint guards.** `if (country === 'KSA')`, `.toFixed(2)` on money, literal `'$'`/`'VAT'`/`5` tax defaults, `record_type:'sale'` literals, and `toLocaleString('en-US')` are banned outside `src/lib/country/**` and reference-data seed files, enforced by the `no-hardcoded-money-format` / `no-hardcoded-tax` / `no-country-conditional` / `require-tenant-config-import` rules and the `country-lint` CI gate. Forensic append-only tables (`case_job_history`, `audit_trails`, `chain_of_custody`) stay REVOKE'd + `prevent_audit_mutation`-guarded across every migration; RESTRICTIVE tenant isolation is only ever ANDed, never widened; device-level custody is never collapsed.

---

## Dependency & sequencing graph

Per locked decision #3, the **Phase 0 correctness pass runs alongside the Phase 1 framework build** — they are the *same* edits (every hardcoded literal site becomes a resolver read). Phases 2–4 are strictly sequential on their predecessors. Phase 4's three work-streams are mutually independent and each independently customer-gated.

```
        ┌─────────────────────────────────────────────┐
        │  PARALLEL TRACK (locked decision #3)         │
        │                                             │
  ┌─────┴──────┐                         ┌────────────┴───────────┐
  │  PHASE 0   │  ── shares fail-loud ──▶ │       PHASE 1          │
  │ Correctness│     primitives          │ Country Engine framework│
  │ (D1–D18)   │ ◀── hardens same ────── │ + geo population        │
  │            │     provisioning surface │ + onboarding + dormant │
  │            │                         │   hierarchy foundation  │
  └────────────┘                         └────────────┬───────────┘
                                                       │ (resolver, registry,
                                                       │  legal_entities, branches,
                                                       │  get_base_currency, hooks,
                                                       │  geo_country_tax_rates, i18n tables)
                                                       ▼
                                          ┌────────────────────────┐
                                          │       PHASE 2          │
                                          │ i18n extraction +      │
                                          │ multi-currency closure │
                                          │ + base reporting +     │
                                          │ country-routed PDFs    │
                                          └────────────┬───────────┘
                                                       │ (tax engine consumes §3g base cols;
                                                       │  VAT201 reuses the EUR-on-OMR gate;
                                                       │  legal_entities + countryConfig override)
                                                       ▼
                                          ┌────────────────────────┐
                                          │       PHASE 3          │
                                          │ GCC-deep statutory:    │
                                          │ tax/payroll/EOSB/      │
                                          │ e-invoice/filings      │
                                          └────────────┬───────────┘
                                                       │ (tax engine, einvoiceRouter,
                                                       │  legal_entities resolution)
                                                       ▼
                                   ┌───────────────────┴───────────────────┐
                                   │   PHASE 4  — GATED DEPTH (do NOT start │
                                   │   without a SIGNED customer per WS)    │
                                   │                                        │
                                   │  WS-A live sub-unit RLS  (multi-site)  │
                                   │  WS-B multi-entity ops   (≥2 entities) │
                                   │  WS-C multi-region       (EU/regulated)│
                                   │  ── three independent, parallel WS ──  │
                                   └────────────────────────────────────────┘
```

| Phase | Depends on | Runs in parallel with | Gate to start |
|---|---|---|---|
| **0** Correctness pass | — (capitalizes on the empty window) | **Phase 1** (locked decision #3) | None — start now |
| **1** Engine framework + geo + onboarding + dormant hierarchy | Phase 0 fail-loud primitives (D2/D3/D6); see note ¹ | **Phase 0** | Blocking Q1, Q7, Q3 (soft) answered |
| **2** i18n + multi-currency + base reporting + PDF routing | Phase 1 (resolver, registry, extended `TenantConfig` + hooks, `get_base_currency`, `legal_entities`/`branches`, `geo_country_tax_rates`, `geo_languages`/`i18n_translations`, `master_notification_templates`) | — | Blocking Q3, Q6 answered |
| **3** GCC-deep statutory | Phase 0 (dark flags), Phase 1 (`legal_entities`, registry, statutory-gate CI, `weekend_days`), Phase 2 (§3g base cols, EUR-on-OMR reconciliation gate, `tenant_exchange_rate_overrides`) | — | Blocking Q2 (hard), Q4, Q1-holidays answered |
| **4** Gated depth (WS-A/B/C) | Phase 1 (dormant hierarchy foundation), Phase 2 (PDF country override), Phase 3 (tax engine + einvoiceRouter) | WS-A ∥ WS-B ∥ WS-C | A **signed customer** per work-stream + Q4 (WS-B) / Q7 confirmation |

> ¹ **Note on the Phase-0↔Phase-1 D6 overlap:** the live `onboarding_progress` table has **no `user_id` column** (verified). Phase 0 Task 1.1 ships that schema fix + fail-loud; Phase 1 Task 9 also lands a D6 onboarding migration. Whichever runs first lands the column; the second becomes a confirming no-op (`ADD COLUMN IF NOT EXISTS`). Neither assumes the other has run.

---

## Defect coverage map

Every live defect D1–D18 is closed by a named task. Defects with both an immediate Phase-0 correctness fix and a Phase-1+ structural generalization are listed against both — the structural row supersedes but does not replace the correctness row.

| Defect | Closed by (phase · task) | Note |
|---|---|---|
| **D1** Input/purchase VAT never recorded | **P0 · Task 3.1** (purchase-side writer + idempotency) → **P3 · Task 3.2** (`tax_line_assessments` append-only system-of-record; `vat_records` → derived rollup) | 🔴 release-blocker non-OMR; structural close in P3 |
| **D2** Fail-US not fail-loud | **P0 · Tasks 2.1/2.2/2.3** (`REQUIRED_SENTINEL`, no per-field US fallbacks, `get_base_currency()`, no-stub gate) → **P1 · Tasks 1/2/6/9** (resolver + registry + engine-resolved `TenantConfig` + provisioning gate) | foundation in P0, generalized in P1 |
| **D3** 72% country stubs | **P0 · Task 2.3** (no-stub CI gate, report-only) → **P1 · Task 7** (reference-data population + gate flips required) | data load is P1 |
| **D4** No EOSB / gratuity | **P3 · Tasks 3.6/3.7** (`geo_country_eosb_policies` + `employee_eosb_accruals` + `eosbService`) | 🔴 GCC statutory |
| **D5** Payroll matches no country | **P3 · Tasks 3.6/3.8** (rules tables + `computeStatutoryPayroll`, fail-loud on missing rule) | 🔴 GCC statutory; replaces flat-7% |
| **D6** Broken onboarding_progress insert | **P0 · Task 1.1** (add `user_id` + fail-loud) → **P1 · Task 9** (deterministic provisioning + jurisdiction capture) | unflagged bug |
| **D7** Dashboards sum raw multi-currency | **P0 · Task 4.1** (`sumBase` rollup) → **P2 · Track C/C1** (`baseAmount`-only aggregation + `no-raw-currency-aggregation` gate) | |
| **D8** Bank-balance rollup no base conversion | **P0 · Task 4.2** (`bank_accounts` base cols + `sumBankBalanceBase`) → **P2 · Track C/C1** (convert-at-read "indicative base") | |
| **D9** Tax label hardcoded "VAT" | **P0 · Task 3.2** (`resolveTaxLabel` from config) → **P2 · Track D/D1** (`countryTemplateOverride`) → **P3 · Tasks 3.3/3.4** (`taxRatesService` effective-dated) | 🔴 release-blocker non-OMR |
| **D10** Tax rate default hardcoded 5% | **P0 · Task 3.2** (`resolveDefaultRate` from config) → **P3 · Task 3.3** (effective-dated `geo_country_tax_rates`) | 🔴 release-blocker non-OMR |
| **D11** ZATCA QR on manual toggle | **P0 · Task 3.3** (`shouldEmitZatcaQr` country-gate) → **P2 · Track D/D1** (derived override) → **P3 · Task 3.4** (`einvoiceRouter` registry) | 🔴 release-blocker non-OMR |
| **D12** SupplierFormModal silent data loss | **P0 · Task 1.2** (`composeSupplierAddress` fold) → **P1/P2** (structured-address columns, §3f, no dependency) | unflagged bug |
| **D13** `amountInWords` hardcodes /100 | **P0 · Task 4.3** (thread minor-unit decimals) → **P2 · Track B/B4 + P3 · Task 3.9** (per-currency minor-unit names) | |
| **D14** ~42 money-render bypass sites | **P0 · Task 4.4** (PurchaseOrderFormModal canonical) → **P2 · Track B/B4** (`no-raw-currency-format` gate + sweep) | |
| **D15** Hardcoded Monday week-start | **P0 · Task 4.6** (`resolveWeekStartsOn` from config) → **P3 · Task 3.5** (`workCalendar` + `geo_public_holidays` day-class) | |
| **D16** WPS bank-file hardcodes USD/Bank Muscat | **P3 · Task 3.8** (`bankFileFormats` field_spec-driven) | |
| **D17** Payroll currency dropdown hardcoded | **P0 · Task 4.7** (`buildCurrencyOptions` from data) → **P3 · Task 3.8** (sourced from `tenant_currencies`/`master_currency_codes`) | |
| **D18** `format.ts` en-US + Western grouping | **P0 · Task 4.5** (legacy formatter respects tenant grouping) → **P2 · Track B/B4** (one config-driven formatter; legacy deleted) | |

**Coverage confirmation:** D1–D18 are each mapped to at least one concrete task; no defect is dropped. Every Phase-0 correctness fix has a forward structural generalization in Phases 1–3 where one is required.

---

## Phase 0 — Correctness pass (D1–D18) + fail-loud foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans, task-by-task. Every step uses `- [ ]`. Each task is one failing test → run-to-fail → minimal impl → run-to-pass → commit. **Skill gate:** these are backend/logic + a few UI-text edits — load **using-superpowers** (routes to **test-driven-development**); the form edits (D12/D14/D17) also touch UI, but only mechanical de-hardcoding, no new design.

**Goal:** Capitalize on the empty 0-payroll/0-vat-return window to fix the live correctness defects D1–D18 in scope and install the fail-loud currency foundation, in the spec §0 "what ships first" order, with no DB-schema risk except the single tested D1 input-VAT writer.

**Architecture:** Pure de-hardcoding edits (read resolved config instead of literals) where no DB change is needed; one tested service-layer writer + one additive migration for D1 (`createVATRecordFromPurchase`). Statutory-gating items D1/D9/D10/D11 are **release-blockers for non-OMR tenants** — flagged inline. Vitest run command is `npx vitest run <path>` (config: `vitest.config.ts`, `"test": "vitest run"`).

**Verified post-pull file map (origin/main aa596e0):** the pull moved several files. All line numbers below were re-verified by Read/Grep on 2026-06-15 and supersede the brief/spec.

---

### Group 1 — Unflagged bug fixes (no legal-output change)

### Task 1.1: D6 — stop swallowing the broken `onboarding_progress` insert

**Files:**
- Modify: `supabase/functions/provision-tenant/index.ts:320-333` (insert + swallow), `:289-292` (the `user_id` already passed)
- Migration (Supabase MCP): `fix_onboarding_progress_user_id`

> **Verified:** `index.ts:325` inserts `user_id: userId` but the live `onboarding_progress` table has **no `user_id` column** (brief D6 / observation 5849), so the insert errors and `:330-333` logs `'Onboarding progress creation failed'` then continues (`// Non-critical, don't fail the whole flow`). Net: 0 rows, dead post-login wizard.

- [ ] **Step 1: Add the missing column + envelope via migration.** Run `mcp__plugin_supabase_supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`, name `fix_onboarding_progress_user_id`):

```sql
ALTER TABLE public.onboarding_progress
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_tenant_id
  ON public.onboarding_progress(tenant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_progress_tenant_user
  ON public.onboarding_progress(tenant_id, user_id) WHERE deleted_at IS NULL;
```

- [ ] **Step 2: Verify the column exists.** Run `mcp__plugin_supabase_supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='onboarding_progress' AND column_name IN ('user_id','deleted_at') ORDER BY 1;
```
Expected: two rows `deleted_at`, `user_id`.

- [ ] **Step 3: Regenerate types.** Run `mcp__plugin_supabase_supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) and overwrite `src/types/database.types.ts` (never hand-edit). Then `npx tsc --noEmit` → Expected: no new errors.

- [ ] **Step 4: Make the insert fatal with soft-delete rollback.** In `supabase/functions/provision-tenant/index.ts`, replace lines 330-333:

```ts
    if (onboardingError) {
      console.error('Onboarding progress creation failed:', onboardingError);
      // FAIL-LOUD: a half-provisioned tenant must not silently lose its wizard.
      await supabase.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
      throw new Error(`Provisioning failed: onboarding_progress insert: ${onboardingError.message}`);
    }
```

- [ ] **Step 5: Verify edge-fn typechecks (Deno import map unaffected).** Run `npx tsc --noEmit` → Expected: no new errors (the edge fn is excluded from the app tsconfig; the change is plain JS-compatible). Confirm by Grep that no `// Non-critical` remains: `grep -n "Non-critical" supabase/functions/provision-tenant/index.ts` → Expected: no output.

- [ ] **Step 6: Commit.**

```bash
git checkout -b fix/phase0-d6-onboarding-insert
git add supabase/functions/provision-tenant/index.ts src/types/database.types.ts
git commit -m "fix(onboarding): D6 — add onboarding_progress.user_id + fail-loud on insert error

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: D12 — SupplierFormModal silent state/zip/country data loss

**Files:**
- Test: `src/components/suppliers/supplierAddress.test.ts` (new — pure builder, no React render needed)
- Create: `src/components/suppliers/supplierAddress.ts` (new — pure `buildSupplierPayload`)
- Modify: `src/components/suppliers/SupplierFormModal.tsx:142-185`

> **Verified:** `SupplierFormModal.tsx:142-144` comment "UI-only fields (state, zip_code, country, …) are dropped here"; `supplierUpdate` (`:145-162`) omits them; the suppliers table has an `address text` column but no `state`/`zip_code`/`country` columns. **Phase 0 scope = stop the silent drop by folding the captured state/zip/country into the existing `address` text** (the cheap data-capture fix; the `structured_addresses` migration is Phase 1 per spec §3f — do NOT block this on it). Per spec §3f: "the defect is fixed by the structured columns regardless of formatting" — here we preserve the data in the single existing column so it is no longer lost.

- [ ] **Step 1: Write the failing test.** Create `src/components/suppliers/supplierAddress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composeSupplierAddress } from './supplierAddress';

describe('composeSupplierAddress', () => {
  it('folds street, state, zip and country into one address string (no drop)', () => {
    expect(composeSupplierAddress({
      address: '12 Main St', state: 'Muscat', zip_code: '113', country: 'Oman',
    })).toBe('12 Main St, Muscat, 113, Oman');
  });
  it('skips blank parts and trims', () => {
    expect(composeSupplierAddress({ address: '12 Main St', state: '', zip_code: '113', country: '' }))
      .toBe('12 Main St, 113');
  });
  it('returns null when every part is empty (so null reaches the DB, not "")', () => {
    expect(composeSupplierAddress({ address: '', state: '', zip_code: '', country: '' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/components/suppliers/supplierAddress.test.ts` → Expected: FAIL `Failed to resolve import "./supplierAddress"`.

- [ ] **Step 3: Minimal implementation.** Create `src/components/suppliers/supplierAddress.ts`:

```ts
export interface SupplierAddressParts {
  address?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
}

/** Fold the four captured address inputs into the single `suppliers.address` text
 *  column so state/zip/country are no longer silently dropped (D12). */
export function composeSupplierAddress(parts: SupplierAddressParts): string | null {
  const ordered = [parts.address, parts.state, parts.zip_code, parts.country]
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0);
  return ordered.length > 0 ? ordered.join(', ') : null;
}
```

- [ ] **Step 4: Run to pass.** Run `npx vitest run src/components/suppliers/supplierAddress.test.ts` → Expected: 3 passed.

- [ ] **Step 5: Wire into the modal.** In `src/components/suppliers/SupplierFormModal.tsx`, add `import { composeSupplierAddress } from './supplierAddress';` near the top, and replace the comment+`address` line (`:142-150`):

```ts
      // state/zip/country are folded into the address text so they are no longer
      // dropped (D12). Structured-address migration is Phase 1; this is the
      // zero-schema data-capture fix.
      const supplierUpdate = {
        name: formData.name,
        supplier_number: formData.supplier_number,
        email: formData.email || null,
        phone: formData.phone || null,
        address: composeSupplierAddress(formData),
```
(Leave the remaining fields `:151-162` unchanged.)

- [ ] **Step 6: Typecheck.** Run `npx tsc --noEmit` → Expected: no new errors.

- [ ] **Step 7: Commit.**

```bash
git add src/components/suppliers/supplierAddress.ts src/components/suppliers/supplierAddress.test.ts src/components/suppliers/SupplierFormModal.tsx
git commit -m "fix(suppliers): D12 — stop dropping supplier state/zip/country (fold into address)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Group 2 — Fail-loud foundation (D2/D3)

### Task 2.1: D2 — replace `DEFAULT_TENANT_CONFIG` US literals with a fail-loud sentinel

**Files:**
- Test: `src/types/tenantConfig.test.ts` (new)
- Modify: `src/types/tenantConfig.ts:56-93`

> **Verified:** `tenantConfig.ts:56-93` is a fully-US object (`code:'USD'`, `symbol:'$'`, `dateFormat:'MM/DD/YYYY'`, `localeCode:'en-US'`). Per spec §4.5: required keys become a sentinel, never a US object. Phase 0 introduces `REQUIRED_SENTINEL` and the `isResolvedConfig()` guard; the full registry/resolver is Phase 1.

- [ ] **Step 1: Write the failing test.** Create `src/types/tenantConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { REQUIRED_SENTINEL, DEFAULT_TENANT_CONFIG, isResolvedConfig } from './tenantConfig';

describe('fail-loud config sentinel (D2)', () => {
  it('REQUIRED_SENTINEL is a unique non-value, never a real string', () => {
    expect(typeof REQUIRED_SENTINEL).toBe('symbol');
    expect(String(REQUIRED_SENTINEL)).not.toContain('USD');
  });
  it('DEFAULT_TENANT_CONFIG no longer fabricates a US currency/locale', () => {
    expect(DEFAULT_TENANT_CONFIG.currency.code).toBe(REQUIRED_SENTINEL);
    expect(DEFAULT_TENANT_CONFIG.locale.localeCode).toBe(REQUIRED_SENTINEL);
  });
  it('isResolvedConfig is false when a required field is still the sentinel', () => {
    expect(isResolvedConfig(DEFAULT_TENANT_CONFIG)).toBe(false);
  });
  it('isResolvedConfig is true for a genuinely resolved config', () => {
    const resolved = {
      ...DEFAULT_TENANT_CONFIG,
      currency: { ...DEFAULT_TENANT_CONFIG.currency, code: 'OMR' },
      locale: { ...DEFAULT_TENANT_CONFIG.locale, localeCode: 'ar-OM' },
    };
    expect(isResolvedConfig(resolved)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/types/tenantConfig.test.ts` → Expected: FAIL `REQUIRED_SENTINEL` is not exported.

- [ ] **Step 3: Minimal implementation.** In `src/types/tenantConfig.ts`, change `code`/`name` types to allow the sentinel and add at the top of the file (after `TaxSystem`):

```ts
/** A required country-config value that has NOT been resolved. Never a real value —
 *  surfaces fail-loud instead of silently rendering US defaults (D2). */
export const REQUIRED_SENTINEL: unique symbol = Symbol.for('country-config.required');
export type RequiredSentinel = typeof REQUIRED_SENTINEL;
```
Change `CurrencyConfig.code` to `string | RequiredSentinel`, `LocaleConfig.localeCode` to `string | RequiredSentinel`. Then replace the US literals in `DEFAULT_TENANT_CONFIG` (`:62` `code`, `:87` `localeCode`) with `REQUIRED_SENTINEL`, and append after the object:

```ts
/** True only when every required country-config field has been resolved past the
 *  sentinel. The provider blocks render and reports telemetry when this is false. */
export function isResolvedConfig(c: TenantConfig): boolean {
  return c.currency.code !== REQUIRED_SENTINEL && c.locale.localeCode !== REQUIRED_SENTINEL;
}
```

- [ ] **Step 4: Run to pass.** Run `npx vitest run src/types/tenantConfig.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Typecheck the blast radius.** Run `npx tsc --noEmit`. Expected: errors at sites that read `.currency.code`/`.localeCode` as `string`. For Phase 0, narrow each such site with `typeof code === 'string' ? code : 'USD'` ONLY inside `tenantConfigService.ts` (Task 2.2 replaces this), and leave display readers throwing-safe via `isResolvedConfig`. Re-run `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 6: Commit.**

```bash
git add src/types/tenantConfig.ts src/types/tenantConfig.test.ts
git commit -m "feat(config): D2 — fail-loud REQUIRED_SENTINEL replaces US defaults in DEFAULT_TENANT_CONFIG

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2.2: D2 — remove per-field US fallbacks in `tenantConfigService`

**Files:**
- Test: `src/lib/tenantConfigService.test.ts` (new)
- Modify: `src/lib/tenantConfigService.ts:64-97`

> **Verified:** `tenantConfigService.ts:64-97` has `|| 'US'` (`:64`), `|| 'USD'` (`:67,69`), `|| '$'` (`:68`), `|| 'MM/DD/YYYY'` (`:85`), `|| 'UTC'` (`:87`), `|| 'en-US'` (`:92`). These silently render Japan as `$`/`en-US` (D3). Replace each required-field fallback with `REQUIRED_SENTINEL`.

- [ ] **Step 1: Write the failing test** (`tenantConfigService.test.ts`) — extract the pure mapping into a testable `mapRowToConfig(tenantRow, localeRow)` first, then assert it. Create the test:

```ts
import { describe, it, expect } from 'vitest';
import { mapRowToConfig } from './tenantConfigService';
import { REQUIRED_SENTINEL } from '../types/tenantConfig';

describe('mapRowToConfig fail-loud (D2/D3)', () => {
  it('uses REQUIRED_SENTINEL — not USD/en-US — when currency/locale are absent', () => {
    const cfg = mapRowToConfig({ id: 't1', name: 'Lab', country: null }, null);
    expect(cfg.currency.code).toBe(REQUIRED_SENTINEL);
    expect(cfg.locale.localeCode).toBe(REQUIRED_SENTINEL);
  });
  it('passes through real resolved values', () => {
    const cfg = mapRowToConfig(
      { id: 't1', name: 'Lab', currency_code: 'OMR', locale_code: 'ar-OM', country: { code: 'OM', name: 'Oman' } },
      null,
    );
    expect(cfg.currency.code).toBe('OMR');
    expect(cfg.locale.localeCode).toBe('ar-OM');
  });
});
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/lib/tenantConfigService.test.ts` → Expected: FAIL `mapRowToConfig` is not exported.

- [ ] **Step 3: Minimal implementation.** In `tenantConfigService.ts`, extract the `return {…}` body of `fetchTenantConfig` (`:61-101`) into an exported `export function mapRowToConfig(data: Record<string, unknown>, defaultLocale: Record<string, unknown> | null): TenantConfig`, importing `REQUIRED_SENTINEL`. Replace required-field fallbacks: `:64` `(country?.code as string) ?? REQUIRED_SENTINEL`; `:67` currency `code: defaultLocale?.currency_code || data.currency_code || REQUIRED_SENTINEL`; `:92` `localeCode: defaultLocale?.locale_code || data.locale_code || REQUIRED_SENTINEL`. Leave cosmetic display fields (`symbol`, separators, `position`) with their current fallbacks — they are tenant-chosen display, not required statutory keys (spec §2.3). Have `fetchTenantConfig` call `mapRowToConfig(data, defaultLocale)`.

- [ ] **Step 4: Run to pass.** Run `npx vitest run src/lib/tenantConfigService.test.ts` → Expected: 2 passed.

- [ ] **Step 5: Typecheck.** Run `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/tenantConfigService.ts src/lib/tenantConfigService.test.ts
git commit -m "feat(config): D2/D3 — remove per-field US fallbacks in tenantConfigService (fail-loud)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2.3: D2 — add `get_base_currency()` + no-stub CI assertion

**Files:**
- Migration (Supabase MCP): `add_get_base_currency`
- Create: `scripts/check-active-country-config.sql` (new — CI no-stub gate)
- Modify: `.github/workflows/*.yml` (add `country-config-completeness` job step) — pin the exact workflow after Grep

> **Verified:** spec §6.5 defines `get_base_currency()` returning `tenant_currencies(is_base)` → `tenants.currency_code` → **NULL** (deliberately, to force a NOT NULL violation rather than poison analytics). Spec §4.5/§9.4 require a blocking CI assertion that every `is_active` country has currency/locale/date/timezone. Phase 0 ships the function and the gate; flipping money-column defaults to it is Phase 1 (§6.9 C1) because it depends on `seed_new_tenant` seeding the base-currency row (§6.5 sequencing note) — do NOT flip defaults here.

- [ ] **Step 1: Apply the function via migration.** Run `mcp__plugin_supabase_supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`, name `add_get_base_currency`):

```sql
CREATE OR REPLACE FUNCTION public.get_base_currency() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT currency_code FROM public.tenant_currencies
       WHERE tenant_id = get_current_tenant_id() AND is_base AND deleted_at IS NULL LIMIT 1),
    (SELECT currency_code FROM public.tenants WHERE id = get_current_tenant_id()),
    NULL)  -- NOT 'USD' — forces fail-loud on an unresolved tenant
$$;
```

- [ ] **Step 2: Verify it resolves for the 2 live OMR tenants.** Run `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT id, currency_code FROM public.tenants WHERE deleted_at IS NULL;
```
Expected: both rows show `OMR` (confirms the fallback chain has a real value to return; brief: 2 OMR tenants).

- [ ] **Step 3: Write the no-stub CI assertion.** Create `scripts/check-active-country-config.sql`:

```sql
-- FAIL the build if any active country is a stub (missing currency/locale/date/timezone).
-- Operationalizes fail-loud (spec §4.5/§9.4): an is_active country MUST be onboardable.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.geo_countries
  WHERE is_active = true AND deleted_at IS NULL
    AND (currency_code IS NULL OR currency_code = '' OR char_length(currency_code) <> 3
         OR locale_code IS NULL OR date_format IS NULL OR timezone IS NULL);
  IF bad > 0 THEN
    RAISE EXCEPTION 'check-active-country-config: % active country row(s) are stubs (missing currency/locale/date/timezone)', bad;
  END IF;
END $$;
```

- [ ] **Step 4: Run the gate against live DB to confirm it catches today's stubs.** Run `mcp__plugin_supabase_supabase__execute_sql` with the `SELECT count(*) …` body from Step 3 (without the `DO`/`RAISE`):

```sql
SELECT count(*) AS stub_active_countries FROM public.geo_countries
WHERE is_active = true AND deleted_at IS NULL
  AND (currency_code IS NULL OR currency_code = '' OR char_length(currency_code) <> 3
       OR locale_code IS NULL OR date_format IS NULL OR timezone IS NULL);
```
Expected: a non-zero count (brief D3: 16/58 have currency → ~42 active stubs). **This proves the gate works.** Note in the PR body: the gate is added in `continue-on-error` / report-only mode in Phase 0 (data population is §10a / Phase 1); it flips to required once unprepared countries are set `is_active=false`.

- [ ] **Step 5: Find and wire the CI workflow.** Run `grep -rln "schema-drift\|check-tenant-table-requirements" .github/workflows/`. In the matched workflow, add a step running `scripts/check-active-country-config.sql` via the same psql/Supabase invocation the schema-drift job uses, with `continue-on-error: true` and a comment `# Phase 0: report-only until §10a country population; flip to required then`.

- [ ] **Step 6: Regenerate types** (the function add is non-table but keeps the regen discipline). Run `mcp__plugin_supabase_supabase__generate_typescript_types`, overwrite `src/types/database.types.ts`, `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 7: Commit.**

```bash
git add scripts/check-active-country-config.sql .github/workflows/ src/types/database.types.ts
git commit -m "feat(config): D2 — get_base_currency() + report-only no-stub country-config CI gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Group 3 — Statutory gate (🔴 release-blockers for non-OMR tenants: D1/D9/D10/D11)

### Task 3.1: 🔴 D1 — purchase-side VAT writer so `vat_returns.input_vat` is real

**Files:**
- Test: `src/lib/vatService.test.ts` (new)
- Modify: `src/lib/vatService.ts:209-222` (add `createVATRecordFromPurchase`; keep `createVATRecordFromInvoice`)
- Migration (Supabase MCP): `vat_records_purchase_idempotency`

> **Verified:** `vatService.ts:209-222` `createVATRecordFromInvoice` hardcodes `record_type:'sale'`; nothing writes `'purchase'`; `calculateVATForPeriod` (`:113-118`) filters `record_type === 'purchase'` for `totalInputVAT` → always 0 → every return overstates net VAT payable filed with the tax authority. **🔴 RELEASE-BLOCKER for non-OMR.** Phase 0 ships the minimal service-layer `'purchase'` writer + an idempotency uniqueness key (the DB-trigger system-of-record `tax_line_assessments` is the Phase 3/§7.1.4 architecture; this is the immediate correctness fix that makes input VAT non-zero today).

- [ ] **Step 1: Write the failing test.** Create `src/lib/vatService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: () => ({
      insert: (rows: unknown[]) => { insertMock(rows); return {
        select: () => ({ maybeSingle: () => Promise.resolve({ data: (rows as any[])[0], error: null }) }) }; },
    }),
  },
}));

import { createVATRecordFromPurchase, createVATRecordFromInvoice } from './vatService';

beforeEach(() => insertMock.mockClear());

describe('input-VAT writer (D1)', () => {
  it('writes a purchase row so input VAT is recorded', async () => {
    await createVATRecordFromPurchase('po-1', { tax_amount: 50, tax_rate: 5 });
    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({ record_type: 'purchase', record_id: 'po-1', vat_amount: 50, vat_rate: 5 }),
    ]);
  });
  it('the sale writer still writes record_type sale (unchanged)', async () => {
    await createVATRecordFromInvoice('inv-1', { tax_amount: 30, tax_rate: 5 });
    expect(insertMock).toHaveBeenCalledWith([expect.objectContaining({ record_type: 'sale' })]);
  });
});
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/lib/vatService.test.ts` → Expected: FAIL `createVATRecordFromPurchase` is not exported.

- [ ] **Step 3: Minimal implementation.** In `src/lib/vatService.ts`, after `createVATRecordFromInvoice` (`:222`), add:

```ts
/** D1 — record INPUT (purchase) VAT so vat_returns.input_vat is non-zero and the
 *  net VAT filed with the authority is correct. Source: expenses / purchase orders
 *  carrying a tax_amount. Mirrors createVATRecordFromInvoice but record_type='purchase'. */
export const createVATRecordFromPurchase = async (
  purchaseId: string,
  purchaseData: { tax_amount: number; tax_rate: number },
) => {
  return createVATRecord({
    record_type: 'purchase',
    record_id: purchaseId,
    vat_amount: purchaseData.tax_amount,
    vat_rate: purchaseData.tax_rate,
  });
};
```
Add `createVATRecordFromPurchase` to the `vatService` export object (`:282-297`).

- [ ] **Step 4: Run to pass.** Run `npx vitest run src/lib/vatService.test.ts` → Expected: 2 passed.

- [ ] **Step 5: Add the idempotency guard via migration** (prevents double-count on edit/re-save — spec §7.1.4). Run `mcp__plugin_supabase_supabase__apply_migration` (name `vat_records_purchase_idempotency`):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_vat_records_record
  ON public.vat_records(record_type, record_id) WHERE deleted_at IS NULL;
```

- [ ] **Step 6: Verify the index and that calculateVATForPeriod now has a real input path.** Run `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT indexname FROM pg_indexes WHERE tablename='vat_records' AND indexname='uq_vat_records_record';
```
Expected: one row. (Live `vat_records` is all `'sale'` today; the writer + the `record_type==='purchase'` filter at `vatService.ts:114` now produce non-zero `totalInputVAT` once purchase rows exist.)

- [ ] **Step 7: Regenerate types + typecheck.** Run `mcp__plugin_supabase_supabase__generate_typescript_types`, overwrite `src/types/database.types.ts`, `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/vatService.ts src/lib/vatService.test.ts src/types/database.types.ts
git commit -m "feat(vat): D1 — purchase-side VAT writer + idempotency so input_vat is real (release-blocker non-OMR)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3.2: 🔴 D9/D10 — tax label + default rate from config, not hardcoded "VAT"/5

**Files:**
- Test: `src/components/cases/taxFieldConfig.test.ts` (new — pure helper)
- Create: `src/components/cases/taxFieldConfig.ts` (new — `resolveTaxLabel`, `resolveDefaultRate`)
- Modify: `src/components/cases/InvoiceFormModal.tsx:128,169,893`, `src/components/cases/QuoteFormModal.tsx:113,128,724`

> **Verified:** InvoiceFormModal `:128` `tax_rate: initialData?.tax_rate || 5`, `:169` `|| 5`, `:893` `VAT ({invoiceData.tax_rate}%)`. QuoteFormModal `:113` `?? 5`, `:128` `?? 5`, `:724` `VAT (…)`. **🔴 RELEASE-BLOCKER for non-OMR** — wrong tax label is a legal defect. Phase 0: read `useTaxConfig().label` (already wired through `TenantConfigContext`) and `useTaxConfig().defaultRate` instead of literal `'VAT'`/`5`. (The `geo_country_tax_rates` effective-dated resolver is Phase 3/§7.1.3; `useTaxConfig` already returns the country tax label/rate today.)

- [ ] **Step 1: Write the failing test.** Create `src/components/cases/taxFieldConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveDefaultRate, resolveTaxLabel } from './taxFieldConfig';

describe('resolveDefaultRate (D10)', () => {
  it('uses the config default rate, never literal 5', () => {
    expect(resolveDefaultRate(undefined, 15)).toBe(15);
    expect(resolveDefaultRate(undefined, 0)).toBe(0); // 0% must survive (not coerced to 5)
  });
  it('prefers an explicit initial value when present', () => {
    expect(resolveDefaultRate(7.5, 15)).toBe(7.5);
  });
});

describe('resolveTaxLabel (D9)', () => {
  it('returns the country tax label, not hardcoded VAT', () => {
    expect(resolveTaxLabel('GST', 10)).toBe('GST (10%)');
    expect(resolveTaxLabel('Sales Tax', 8.25)).toBe('Sales Tax (8.25%)');
  });
});
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/components/cases/taxFieldConfig.test.ts` → Expected: FAIL import unresolved.

- [ ] **Step 3: Minimal implementation.** Create `src/components/cases/taxFieldConfig.ts`:

```ts
/** D10 — resolve the tax-rate field default from the tenant's country config,
 *  never the hardcoded Gulf-VAT 5. An explicit initial value (editing an existing
 *  doc) always wins; otherwise fall through to the config default. 0% is valid. */
export function resolveDefaultRate(initial: number | undefined, configDefault: number): number {
  return initial ?? configDefault;
}

/** D9 — render the tax line label from the country's tax label (VAT/GST/Sales Tax),
 *  never the hardcoded "VAT". */
export function resolveTaxLabel(label: string, rate: number): string {
  return `${label} (${rate}%)`;
}
```

- [ ] **Step 4: Run to pass.** Run `npx vitest run src/components/cases/taxFieldConfig.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Wire InvoiceFormModal.** Add `import { resolveDefaultRate, resolveTaxLabel } from './taxFieldConfig';` and confirm `useTaxConfig` is imported (Grep `useTaxConfig` in the file; if absent, add `import { useTaxConfig } from '../../contexts/TenantConfigContext';` and `const taxConfig = useTaxConfig();` in the component body). Replace `:128` `tax_rate: initialData?.tax_rate || 5` → `tax_rate: resolveDefaultRate(initialData?.tax_rate, taxConfig.defaultRate)`; `:169` likewise; `:893` `VAT ({invoiceData.tax_rate}%)` → `{resolveTaxLabel(taxConfig.label, invoiceData.tax_rate)}`.

- [ ] **Step 6: Wire QuoteFormModal** identically at `:113`, `:128` (`?? 5` → `resolveDefaultRate(asNumber(initialData?.tax_rate), taxConfig.defaultRate)`) and `:724`.

- [ ] **Step 7: Typecheck + existing modal test.** Run `npx tsc --noEmit` → Expected: 0 errors. Run `npx vitest run src/components/cases/InvoiceFormModal.test.tsx` → Expected: passes (no tax-label/rate assertion regressed; if a snapshot pins "VAT 5%", update it to the config-driven value and note it in the commit).

- [ ] **Step 8: Commit.**

```bash
git add src/components/cases/taxFieldConfig.ts src/components/cases/taxFieldConfig.test.ts src/components/cases/InvoiceFormModal.tsx src/components/cases/QuoteFormModal.tsx
git commit -m "fix(invoicing): D9/D10 — tax label + default rate from config not hardcoded VAT/5 (release-blocker non-OMR)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3.3: 🔴 D11 — route ZATCA QR off country, not the manual tax-bar toggle

**Files:**
- Test: `src/lib/pdf/engine/einvoiceRouting.test.ts` (new)
- Create: `src/lib/pdf/engine/einvoiceRouting.ts` (new — `shouldEmitZatcaQr`)
- Modify: `src/lib/pdf/engine/adapters/invoiceAdapter.ts:236-285`

> **Verified:** `invoiceAdapter.ts:245` derives the ZATCA payload's seller-VAT from `config.taxBar.source === 'manual' ? config.taxBar.value : …`, and `:236-250` builds the ZATCA TLV whenever the tax bar is enabled — i.e. on a manual toggle, so a non-KSA tenant can emit a KSA-spec QR (D11). **🔴 RELEASE-BLOCKER for non-OMR.** Phase 0 introduces a pure `shouldEmitZatcaQr({ taxSystem, countryCode })` gate and uses it to guard the existing TLV build; the full `master_einvoice_regimes` adapter registry is Phase 3/§7.2.

- [ ] **Step 1: Write the failing test.** Create `src/lib/pdf/engine/einvoiceRouting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldEmitZatcaQr } from './einvoiceRouting';

describe('shouldEmitZatcaQr (D11)', () => {
  it('emits only for a Saudi VAT entity', () => {
    expect(shouldEmitZatcaQr({ taxSystem: 'VAT', countryCode: 'SA' })).toBe(true);
  });
  it('never emits for a non-Saudi country even with a manual tax bar enabled', () => {
    expect(shouldEmitZatcaQr({ taxSystem: 'VAT', countryCode: 'OM' })).toBe(false);
    expect(shouldEmitZatcaQr({ taxSystem: 'VAT', countryCode: 'AE' })).toBe(false);
  });
  it('never emits for a non-VAT system', () => {
    expect(shouldEmitZatcaQr({ taxSystem: 'SALES_TAX', countryCode: 'SA' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/lib/pdf/engine/einvoiceRouting.test.ts` → Expected: FAIL import unresolved.

- [ ] **Step 3: Minimal implementation.** Create `src/lib/pdf/engine/einvoiceRouting.ts`:

```ts
/** D11 — ZATCA Phase-1 QR is a Saudi-VAT statutory artifact. It must be routed by
 *  the resolving entity's country + tax system, NEVER by a UI tax-bar toggle, so a
 *  non-KSA tenant cannot emit a "compliant" KSA QR. (master_einvoice_regimes registry
 *  is the Phase-3 generalization; this is the immediate routing fix.) */
export function shouldEmitZatcaQr(args: { taxSystem: string | null | undefined; countryCode: string | null | undefined }): boolean {
  return args.taxSystem === 'VAT' && args.countryCode === 'SA';
}
```

- [ ] **Step 4: Run to pass.** Run `npx vitest run src/lib/pdf/engine/einvoiceRouting.test.ts` → Expected: 3 passed.

- [ ] **Step 5: Guard the TLV build.** In `invoiceAdapter.ts`, thread `taxSystem`/`countryCode` from the adapter's resolved config/company settings into the builder context (Grep the adapter signature for the resolved-config object already in scope), import `shouldEmitZatcaQr`, and wrap the `:240-250` ZATCA payload build with `if (shouldEmitZatcaQr({ taxSystem, countryCode }) && <existing tax-bar condition>) { … }`. The generic verification QR fallback (`:260-284`) is unchanged.

- [ ] **Step 6: Typecheck + run the PDF engine test suite.** Run `npx tsc --noEmit` → Expected: 0 errors. Run `npx vitest run src/lib/pdf/engine/` → Expected: all pass (the generic-QR path keeps non-KSA invoices rendering a verify QR, so no snapshot loses its QR box).

- [ ] **Step 7: Commit.**

```bash
git add src/lib/pdf/engine/einvoiceRouting.ts src/lib/pdf/engine/einvoiceRouting.test.ts src/lib/pdf/engine/adapters/invoiceAdapter.ts
git commit -m "fix(pdf): D11 — route ZATCA QR by country/tax-system not manual toggle (release-blocker non-OMR)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Group 4 — Money correctness (D7/D8/D13/D14/D18/D15/D17)

### Task 4.1: D7 — ReportsDashboard sums base currency, not raw multi-currency

**Files:**
- Test: `src/pages/financial/reportsDashboardRollup.test.ts` (new — pure rollup helper)
- Create: `src/pages/financial/reportsDashboardRollup.ts` (new — `sumBase`)
- Modify: `src/pages/financial/ReportsDashboard.tsx:229-245,265-279,317-332`

> **Verified:** `ReportsDashboard.tsx:230` selects `total_amount, amount_paid` (no `_base`); `:244` `reduce((sum,inv)=>sum+(inv.amount_paid||0),0)`, `:245` expenses raw, `:279` `+= invoice.total_amount`, `:332` `+= invoice.amount_paid` — all sum transaction amounts under one symbol → wrong with ≥2 currencies (D7). The base columns exist (`amount_paid_base`, `amount_base`, `total_amount_base`). Phase 0 minimal fix: add `_base` to the selects and sum via `baseAmount` (the same helper `financialReportsService.ts` already uses). Full rewire-to-service is spec §8a/§6.2 Phase 2.

- [ ] **Step 1: Write the failing test.** Create `src/pages/financial/reportsDashboardRollup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sumBase } from './reportsDashboardRollup';

describe('sumBase (D7)', () => {
  it('sums the *_base shadow column, never the raw transaction amount', () => {
    const rows = [
      { amount_paid: 100, amount_paid_base: 38, exchange_rate: 0.38 }, // EUR→OMR
      { amount_paid: 50, amount_paid_base: 50, exchange_rate: 1 },     // OMR
    ];
    expect(sumBase(rows, 'amount_paid')).toBe(88);
  });
  it('falls back to the raw amount when no base is present (legacy unity rows)', () => {
    expect(sumBase([{ amount_paid: 50 }], 'amount_paid')).toBe(50);
  });
});
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/pages/financial/reportsDashboardRollup.test.ts` → Expected: FAIL import unresolved.

- [ ] **Step 3: Minimal implementation.** Create `src/pages/financial/reportsDashboardRollup.ts`:

```ts
import { baseAmount } from '../../lib/financialMath';

/** D7 — sum the base-currency shadow column so multi-currency analytics are
 *  arithmetically correct. Delegates to financialMath.baseAmount (raw fallback for
 *  legacy unity rows). */
export function sumBase<T extends Record<string, unknown>>(rows: T[], field: string): number {
  return (rows || []).reduce((acc, r) => acc + baseAmount(r as never, field as never), 0);
}
```

- [ ] **Step 4: Run to pass.** Run `npx vitest run src/pages/financial/reportsDashboardRollup.test.ts` → Expected: 2 passed.

- [ ] **Step 5: Wire the dashboard.** In `ReportsDashboard.tsx`: add `import { sumBase } from './reportsDashboardRollup';`; extend `:230` select to `'total_amount, total_amount_base, amount_paid, amount_paid_base, status, invoice_date'`; extend `:234`-area expenses select to include `amount_base`; extend `:266` and `:318` selects with the `_base` siblings. Replace `:244` with `const totalRevenue = sumBase(invoices, 'amount_paid');`, `:245` with `sumBase(expenses, 'amount')`, `:279` `statusCounts[status].amount += baseAmount(invoice, 'total_amount')` (import `baseAmount`), `:332` `customerRevenue[customerId].amount += baseAmount(invoice, 'amount_paid')`.

- [ ] **Step 6: Typecheck.** Run `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 7: Commit.**

```bash
git add src/pages/financial/reportsDashboardRollup.ts src/pages/financial/reportsDashboardRollup.test.ts src/pages/financial/ReportsDashboard.tsx
git commit -m "fix(reports): D7 — ReportsDashboard sums base currency not raw multi-currency

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: D8 — bank-balance rollup converts to base before summing

**Files:**
- Migration (Supabase MCP): `bank_accounts_base_columns`
- Modify: `src/lib/financialReportsService.ts:225-234`

> **Verified:** `financialReportsService.ts:226` selects `current_balance, opening_balance` only; `:233-234` `reduce((sum,a)=>sum+(a.current_balance||0),0)` — sums across currencies with no conversion (D8). `bank_accounts` has **no `*_base`** (spec §6.2). A balance is a live position → convert at read, label "indicative base" (spec §8a: never freeze a base on a balance).

- [ ] **Step 1: Add additive base/FX columns via migration.** Run `mcp__plugin_supabase_supabase__apply_migration` (name `bank_accounts_base_columns`):

```sql
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS currency_code        text,
  ADD COLUMN IF NOT EXISTS fx_rate              numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_source       text,
  ADD COLUMN IF NOT EXISTS fx_rate_at           timestamptz,
  ADD COLUMN IF NOT EXISTS current_balance_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS opening_balance_base numeric(19,4);
-- exact backfill: all live rows are base currency (0 non-unity FX rows DB-wide).
UPDATE public.bank_accounts
  SET current_balance_base = current_balance, opening_balance_base = opening_balance, fx_rate = 1
  WHERE current_balance_base IS NULL AND deleted_at IS NULL;
```

- [ ] **Step 2: Verify backfill.** Run `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT count(*) AS unconverted FROM public.bank_accounts
WHERE deleted_at IS NULL AND current_balance_base IS NULL;
```
Expected: `0`.

- [ ] **Step 3: Regenerate types.** Run `mcp__plugin_supabase_supabase__generate_typescript_types`, overwrite `src/types/database.types.ts`.

- [ ] **Step 4: Write the failing test.** Append to (or create) `src/lib/financialReportsService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sumBankBalanceBase } from './financialReportsService';

describe('sumBankBalanceBase (D8)', () => {
  it('sums the base-converted balance, never raw cross-currency amounts', () => {
    expect(sumBankBalanceBase([
      { current_balance: 100, current_balance_base: 38 },
      { current_balance: 50, current_balance_base: 50 },
    ], 'current_balance')).toBe(88);
  });
});
```

- [ ] **Step 5: Run to fail.** Run `npx vitest run src/lib/financialReportsService.test.ts` → Expected: FAIL `sumBankBalanceBase` not exported.

- [ ] **Step 6: Minimal implementation.** In `financialReportsService.ts`, add an exported helper and use it:

```ts
/** D8 — sum bank balances in base currency. A balance is a live position, so the
 *  *_base column is an "indicative base" snapshot, not a frozen committed value. */
export function sumBankBalanceBase(
  rows: Array<Record<string, number | null | undefined>>, field: 'current_balance' | 'opening_balance',
): number {
  return (rows || []).reduce((sum, a) => sum + (a[`${field}_base`] ?? a[field] ?? 0), 0);
}
```
Extend the `:226` select to `'current_balance, current_balance_base, opening_balance, opening_balance_base'`; replace `:233` with `const totalCurrentBalance = sumBankBalanceBase(bankAccountsResult.data || [], 'current_balance');` and `:234` with the `'opening_balance'` variant.

- [ ] **Step 7: Run to pass + typecheck.** Run `npx vitest run src/lib/financialReportsService.test.ts` → Expected: pass. `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/financialReportsService.ts src/lib/financialReportsService.test.ts src/types/database.types.ts
git commit -m "fix(reports): D8 — bank balance rollup sums indicative base, not raw cross-currency

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.3: D13 — `amountInWords` threads currency minor-unit decimals

**Files:**
- Test: `src/lib/pdf/engine/amountInWords.test.ts:20-30` (extend)
- Modify: `src/lib/pdf/engine/amountInWords.ts:56-62,107-110`

> **Verified (post-pull):** `amountInWords.ts:58` `Math.round((Math.abs(amount)-whole)*100)`, `:60` `${cents}/100` — hardcodes 2 minor digits → OMR (3 decimals, baisa) renders 10× wrong, JPY (0 decimals) invents a fraction (D13). `amountInWordsAr` (`:107-110`) drops the minor unit entirely. Add a `decimals` param defaulting to 2 (preserves current callers/tests) and split on `10^decimals`.

- [ ] **Step 1: Extend the test (failing).** In `amountInWords.test.ts`, add inside `describe('amountInWordsEn', …)`:

```ts
  it('renders OMR 3-decimal minor units (baisa), not /100 (D13)', () => {
    expect(amountInWordsEn(1050.5, 'OMR', 3)).toBe('OMR One Thousand Fifty and 500/1000 only');
  });
  it('renders JPY with no fractional part (0 decimals)', () => {
    expect(amountInWordsEn(1050, 'JPY', 0)).toBe('JPY One Thousand Fifty only');
  });
  it('defaults to 2 decimals when omitted (back-compat)', () => {
    expect(amountInWordsEn(1050.5, 'OMR')).toBe('OMR One Thousand Fifty and 50/100 only');
  });
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/lib/pdf/engine/amountInWords.test.ts` → Expected: FAIL (3rd-decimal case yields `50/100`).

- [ ] **Step 3: Minimal implementation.** Replace `amountInWordsEn` (`:56-62`):

```ts
export function amountInWordsEn(amount: number, currency = '', decimals = 2): string {
  const whole = Math.floor(Math.abs(amount));
  const factor = 10 ** decimals;
  const minor = Math.round((Math.abs(amount) - whole) * factor);
  const words = numberToWordsEn(whole);
  const minorPart = decimals > 0 && minor > 0
    ? ` and ${String(minor).padStart(decimals, '0')}/${factor}` : '';
  return `${currency ? `${currency} ` : ''}${words}${minorPart} only`;
}
```
Add the same `decimals = 2` param to `amountInWordsAr` (`:107-110`), spelling the minor part when `decimals > 0 && minor > 0` (mirror the EN structure with the Arabic joiner).

- [ ] **Step 4: Run to pass.** Run `npx vitest run src/lib/pdf/engine/amountInWords.test.ts` → Expected: all pass (incl. the back-compat default).

- [ ] **Step 5: Thread decimals from callers.** Grep `amountInWordsEn(`/`amountInWordsAr(` across `src/lib/pdf/` and pass the resolved `currencyDecimalPlaces` (from the adapter's resolved currency config, already in scope per the D11 task) at each call. Run `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/pdf/engine/amountInWords.ts src/lib/pdf/engine/amountInWords.test.ts src/lib/pdf/engine/adapters/
git commit -m "fix(pdf): D13 — amountInWords threads currency minor-unit decimals (OMR/JPY correct)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.4: D14 — PurchaseOrderFormModal `$`/`toFixed(2)` sweep

**Files:**
- Modify: `src/components/suppliers/PurchaseOrderFormModal.tsx:370,394,398,402`

> **Verified:** PurchaseOrderFormModal `:370` `value={item.total.toFixed(2)}`, `:394` `${totals.subtotal.toFixed(2)}`, `:398` `${totals.tax.toFixed(2)}`, `:402` `${totals.total.toFixed(2)}`. Spec §6.6 calls this the canonical D14 instance. Phase 0: render via `formatCurrencyWithConfig` reading `useCurrency()` — no new currency selector (that is the §6.6 Phase-2 enhancement); the sweep is the de-hardcoding.

- [ ] **Step 1: Confirm the currency hook.** Run `grep -n "useCurrency\|formatCurrency\|useCurrencyConfig" src/components/suppliers/PurchaseOrderFormModal.tsx`. If absent, add `import { useCurrency } from '../../hooks/useCurrency';` and `const { format: formatMoney } = useCurrency();` (match the existing hook surface — Grep `src/hooks/useCurrency.ts` for the returned formatter name and adapt).

- [ ] **Step 2: Replace the four sites.** `:394` `${totals.subtotal.toFixed(2)}` → `{formatMoney(totals.subtotal)}`; `:398`, `:402` likewise; `:370` (an input `value`) → keep numeric display but route through the config-aware formatter: `value={formatMoney(item.total)}` only if the field is read-only display; if it is an editable numeric input keep `.toFixed(config.decimalPlaces)` using `useCurrencyConfig().decimalPlaces` (NOT literal 2). Verify by Read of `:360-405` which case applies before editing.

- [ ] **Step 3: Typecheck.** Run `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 4: Grep-verify no hardcoded money symbol remains.** Run `grep -n "\\$\|toFixed(2)" src/components/suppliers/PurchaseOrderFormModal.tsx` → Expected: no `$`/`toFixed(2)` on money lines (a `toFixed(config.decimalPlaces)` on an editable input is acceptable).

- [ ] **Step 5: Commit.**

```bash
git add src/components/suppliers/PurchaseOrderFormModal.tsx
git commit -m "fix(po): D14 — PurchaseOrderFormModal money via formatCurrencyWithConfig not \$/toFixed(2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.5: D18 — `format.ts` consolidation (grouping/position from config, not en-US)

**Files:**
- Test: `src/lib/format.test.ts` (new or extend)
- Modify: `src/lib/format.ts:49,77,80,97`

> **Verified:** `format.ts:77` `parseInt(integerPart).toLocaleString('en-US')` forces Western grouping; `:49` and `:80` hardcode `currencyPosition: 'before'` in the legacy `fetchCurrencyFormat` fallback / `formatCurrencyWithSettings`; `:97` is the legacy formatter. Per spec §5.5/§8g: collapse to one config-driven formatter; legacy `formatCurrencyWithSettings`/`fetchCurrencyFormat` deleted after callers migrate. Phase 0 minimal fix: stop the `en-US` grouping forcing in the legacy path so it respects the tenant separator (full deletion of the legacy path is the §5.5 Phase-2 consolidation).

- [ ] **Step 1: Write the failing test.** Create/extend `src/lib/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatCurrencyWithSettings } from './format';

describe('formatCurrencyWithSettings grouping (D18)', () => {
  it('uses the supplied separators, not forced en-US comma grouping', () => {
    const out = formatCurrencyWithSettings(1234567.5, {
      currencySymbol: 'OMR', currencyPosition: 'after', decimalPlaces: 3,
      currencyCode: 'OMR', thousandsSeparator: ' ', decimalSeparator: '.',
    });
    expect(out).toBe('1 234 567.500 OMR');
  });
});
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/lib/format.test.ts` → Expected: FAIL (current path emits `1,234,567.50` with `$`-before via `en-US`; also the `CurrencyFormat` type lacks separators).

- [ ] **Step 3: Minimal implementation.** Read `format.ts:1-110` to confirm the `CurrencyFormat` type, then: add optional `thousandsSeparator?: string; decimalSeparator?: string;` to `CurrencyFormat`; in `formatCurrencyWithSettings` (`:74-90`) replace `parseInt(integerPart).toLocaleString('en-US')` with a grouping that uses `format.thousandsSeparator ?? ','` via the same regex `formatCurrencyWithConfig` already uses (`.replace(/\B(?=(\d{3})+(?!\d))/g, sep)`), and join the decimal with `format.decimalSeparator ?? '.'`. Keep `currencyPosition` honored (it already is at `:80`).

- [ ] **Step 4: Run to pass + full format suite.** Run `npx vitest run src/lib/format.test.ts` → Expected: pass. Run `npx vitest run src/lib` → Expected: no regression (note: any `i18n`/`LocaleContext` failures are a known local jsdom artifact per MEMORY — they pass in CI; do not chase).

- [ ] **Step 5: Typecheck.** Run `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "fix(format): D18 — legacy formatter respects tenant grouping/separators not en-US

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.6: D15 — week-start/weekend from config in TimesheetManagement

**Files:**
- Test: `src/pages/employee-management/workWeek.test.ts` (new — pure helper)
- Create: `src/pages/employee-management/workWeek.ts` (new — `resolveWeekStartsOn`)
- Modify: `src/pages/employee-management/TimesheetManagement.tsx:410-411`

> **Verified:** `TimesheetManagement.tsx:410-411` `startOfWeek(now,{weekStartsOn:1})` / `endOfWeek(now,{weekStartsOn:1})` hardcode Monday, ignoring `week_starts_on` (D15) — GCC labs miscount. Phase 0: read `useDateTimeConfig().weekStartsOn` (already on `DateTimeConfig`). The full weekend-day model (`geo_countries.weekend_days int[]`) is Phase 3/§3a; week-start is the immediate display fix.

- [ ] **Step 1: Write the failing test.** Create `workWeek.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveWeekStartsOn } from './workWeek';

describe('resolveWeekStartsOn (D15)', () => {
  it('returns the config value, never hardcoded Monday', () => {
    expect(resolveWeekStartsOn(0)).toBe(0); // Sunday-start (GCC/US)
    expect(resolveWeekStartsOn(6)).toBe(6); // Saturday-start
  });
  it('defaults to Sunday (0) when unset, not Monday', () => {
    expect(resolveWeekStartsOn(undefined)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/pages/employee-management/workWeek.test.ts` → Expected: FAIL import unresolved.

- [ ] **Step 3: Minimal implementation.** Create `workWeek.ts`:

```ts
type Dow = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** D15 — resolve the week-start day from tenant config instead of hardcoding Monday.
 *  date-fns weekStartsOn uses 0=Sunday..6=Saturday, matching geo_countries.week_starts_on. */
export function resolveWeekStartsOn(configValue: Dow | undefined): Dow {
  return configValue ?? 0;
}
```

- [ ] **Step 4: Run to pass.** Run `npx vitest run src/pages/employee-management/workWeek.test.ts` → Expected: 2 passed.

- [ ] **Step 5: Wire the component.** In `TimesheetManagement.tsx`: add `import { resolveWeekStartsOn } from './workWeek';` and `import { useDateTimeConfig } from '../../contexts/TenantConfigContext';` (confirm the hook export name by Grep); `const { weekStartsOn } = useDateTimeConfig();` in the component; `const wso = resolveWeekStartsOn(weekStartsOn);` and replace `:410-411` `{ weekStartsOn: 1 }` → `{ weekStartsOn: wso }` in both calls.

- [ ] **Step 6: Typecheck.** Run `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 7: Commit.**

```bash
git add src/pages/employee-management/workWeek.ts src/pages/employee-management/workWeek.test.ts src/pages/employee-management/TimesheetManagement.tsx
git commit -m "fix(timesheet): D15 — week start from config not hardcoded Monday

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.7: D17 — payroll currency dropdown sourced from data, not hardcoded map

**Files:**
- Test: `src/pages/payroll/currencyOptions.test.ts` (new — pure builder)
- Create: `src/pages/payroll/currencyOptions.ts` (new — `buildCurrencyOptions`)
- Modify: `src/pages/payroll/PayrollSettingsPage.tsx:254-275`

> **Verified:** `PayrollSettingsPage.tsx:257-...` defines an inline `currencyMap: Record<string, {symbol; decimals}>` literal (`USD/EUR/...`) driving the dropdown (D17), which drifts from `master_currency_codes`. Phase 0: build the options from a passed-in currency list (the page fetches `master_currency_codes`/`tenant_currencies`); pure builder is the testable seam.

- [ ] **Step 1: Write the failing test.** Create `currencyOptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCurrencyOptions } from './currencyOptions';

describe('buildCurrencyOptions (D17)', () => {
  it('maps DB currency rows to options, not a hardcoded USD/EUR map', () => {
    expect(buildCurrencyOptions([
      { code: 'OMR', symbol: 'OMR', decimal_places: 3 },
      { code: 'JPY', symbol: '¥', decimal_places: 0 },
    ])).toEqual([
      { value: 'OMR', label: 'OMR (OMR)', symbol: 'OMR', decimals: 3 },
      { value: 'JPY', label: 'JPY (¥)', symbol: '¥', decimals: 0 },
    ]);
  });
  it('returns an empty list (not a US default) when no data', () => {
    expect(buildCurrencyOptions([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to fail.** Run `npx vitest run src/pages/payroll/currencyOptions.test.ts` → Expected: FAIL import unresolved.

- [ ] **Step 3: Minimal implementation.** Create `currencyOptions.ts`:

```ts
export interface CurrencyRow { code: string; symbol: string; decimal_places: number }
export interface CurrencyOption { value: string; label: string; symbol: string; decimals: number }
/** D17 — build the payroll currency dropdown from master_currency_codes/tenant_currencies
 *  rows instead of an inline hardcoded USD/EUR/... map that drifts from the data. */
export function buildCurrencyOptions(rows: CurrencyRow[]): CurrencyOption[] {
  return (rows || []).map((r) => ({
    value: r.code, label: `${r.code} (${r.symbol})`, symbol: r.symbol, decimals: r.decimal_places,
  }));
}
```

- [ ] **Step 4: Run to pass.** Run `npx vitest run src/pages/payroll/currencyOptions.test.ts` → Expected: 2 passed.

- [ ] **Step 5: Wire the page.** Read `PayrollSettingsPage.tsx:240-300` to confirm the currency fetch; add `import { buildCurrencyOptions } from './currencyOptions';`; fetch `master_currency_codes` via a `useQuery` (Grep the page for an existing currency query first — reuse it), replace the inline `currencyMap`/option JSX (`:257-275`) with `buildCurrencyOptions(currencyRows).map(o => <option key={o.value} value={o.value}>{o.label}</option>)` and derive symbol/decimals on change from the selected option.

- [ ] **Step 6: Typecheck.** Run `npx tsc --noEmit` → Expected: 0 errors.

- [ ] **Step 7: Commit.**

```bash
git add src/pages/payroll/currencyOptions.ts src/pages/payroll/currencyOptions.test.ts src/pages/payroll/PayrollSettingsPage.tsx
git commit -m "fix(payroll): D17 — currency dropdown sourced from master_currency_codes not hardcoded map

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Phase 0 exit verification

- [ ] **Full suite.** Run `npx vitest run` → Expected: all new tests green; pre-existing `i18n`/`LocaleContext` jsdom failures (if any) are the known local-only artifact (MEMORY) — confirm they are unchanged, not newly introduced.
- [ ] **Typecheck gate.** Run `npx tsc --noEmit` → Expected: 0 errors (CI `typecheck` requirement).
- [ ] **Schema-drift gate.** Confirm `src/types/database.types.ts` was regenerated after every migration (Tasks 1.1, 2.3, 3.1, 4.2) and matches live — run the repo's `scripts/check-schema-drift.sh` if present.
- [ ] **Migration manifest.** Add the 4 applied migrations (`fix_onboarding_progress_user_id`, `add_get_base_currency`, `vat_records_purchase_idempotency`, `bank_accounts_base_columns`) to the migration manifest the `migration-manifest` CI job checks, and use `.github/PULL_REQUEST_TEMPLATE/migration.md`.
- [ ] **Release-blocker flag.** In the PR description, list D1/D9/D10/D11 explicitly as **non-OMR release-blockers shipped in this phase**; the 2 live tenants are OMR so they are safe, but no non-OMR tenant may be provisioned until these are merged.

**Phase 0 exit criteria:** `npx vitest run` green for every new test (D1,D2,D7,D8,D9,D10,D11,D12,D13,D14,D15,D17,D18); `npx tsc --noEmit` = 0 errors; all 4 migrations applied + types regenerated + schema-drift green + manifest updated; D1 input-VAT writer proven (`createVATRecordFromPurchase` + `uq_vat_records_record`); D2 fail-loud proven (`REQUIRED_SENTINEL`, no `|| 'USD'/'$'/'en-US'` on required fields, `get_base_currency()` returns OMR for live tenants / NULL for unresolved); D6 closed (column exists, no swallow, soft-delete-and-throw); D9/D10/D11 shipped + flagged as non-OMR release-blockers; D7/D8/D13/D14/D18 money correctness landed; `scripts/check-active-country-config.sql` demonstrated to catch ~42 active stubs (report-only).

---

## Phase 1 — Country Engine config framework + geo population + fail-loud onboarding + dormant hierarchy foundation

> Turns the Country *table* into a Country *Engine*: a migration-free jsonb config bag + code registry + pure resolver cloning the proven `feature_flags` pattern; populates `geo_countries` from a maintained reference dataset with a no-stub CI gate; makes provisioning fail-loud and deterministic; and lays the **dormant** 6-level hierarchy foundation (entities + collapse + flag-off BU policies, no live sub-unit isolation).
>
> **Skill gate:** backend/logic + schema/migrations → load **using-superpowers** (routes to **test-driven-development** + **writing-plans** when expanding this phase). When expanding, branch from `main`; one commit per task; cross-cutting standards above apply to every task.
>
> **Grounding verified against live DB + HEAD `aa596e0` (2026-06-15):** `geo_countries` has NONE of `country_config`/`config_version`/`weekend_days`/`config_status`/`region_id` yet; `tenants` lacks `country_config_overrides`/`resolved_country_config`/`country_config_version`; `onboarding_progress` has **no `user_id` column** (D6 live — the edge fn at `provision-tenant/index.ts:319-333` inserts a non-existent column, error swallowed, **0 rows**); `sync_tenant_config_from_country()` sets 11 fields, **no `ui_language`**, hardcodes `'USD'`/`'$'` fallbacks, fires only on INSERT or `country_id` change; no `src/lib/country/`; no `geo_regions`/`geo_subdivisions`/`legal_entities`/`master_data_residency_regions`; `branches`/`departments`/`positions` exist with **0 rows**; `profiles` has no `business_unit_id`/`legal_entity_id`; `cases.branch_id` has **NO FK**; **2 tenants, both OMR/VAT, real OMR identity, `ui=en`**; 16/58 countries carry currency; `master_currency_codes` has 35 codes, OMR decimals=3.

### Migration discipline (applies to EVERY migration task below)

Each `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) is immediately followed by: (1) `mcp__supabase__generate_typescript_types` → overwrite `src/types/database.types.ts` (never hand-edit); (2) add the new row to `supabase/migrations.manifest.md` (the `migration-manifest` gate reads `| $version |`); (3) `bash scripts/check-schema-drift.sh` must print no diff; (4) `bash scripts/check-tsc.sh` must print 0 errors; (5) use `.github/PULL_REQUEST_TEMPLATE/migration.md`. All DDL is additive (new nullable cols / new tables / new policies; **zero DROP/DELETE**). Tenant-scoped new tables get `tenant_id uuid NOT NULL REFERENCES tenants(id)`, RLS ENABLE+FORCE, RESTRICTIVE `<t>_tenant_isolation` (`tenant_id = get_current_tenant_id() OR is_platform_admin()`), `set_<t>_tenant_and_audit` trigger, `idx_<t>_tenant_id` partial index — must pass `scripts/check-tenant-table-requirements.sql`. Global `geo_*`/`master_*` tables get no `tenant_id`, SELECT `true`, write `is_platform_admin()`.

> **Note:** task numbering in this phase is Phase-1-local (Task 1…Task 9 + Exit). Cross-references from other phases that say "Phase 1 Task 9" refer to the onboarding/provisioning task below.

### Task 1 — Pure config resolver (`resolveCountryConfig.ts`) cloning `resolveFeatures.ts`, TDD

**Spec:** §4.1 (the load-bearing resolver, precedence L0→L5, fail-loud), §4.2 (typed-but-open registry).

- [ ] **Write the failing test first** `src/lib/country/resolveCountryConfig.test.ts` mirroring the structure of `src/lib/features/resolveFeatures.test.ts`. Use a Zod-backed mini-registry. Required assertions (each MUST be pinned):
  - precedence: `businessUnit` over `tenant` over `legalEntity` over `country` over `region` over `global` over `codedDefault` (later layer wins; assert each rung).
  - a layer that has the key set to `null`/`undefined` is **transparent** (does not override a more-general non-null).
  - **unknown-key THROWS** `CountryConfigError` (this is the deliberate inversion vs `resolveFeatures.ts:28` which returns `true` for unknown keys — the test comment must cite that contrast; §4.1).
  - a `required` key still resolving to `REQUIRED_SENTINEL` THROWS `CountryConfigError` with a "country not configured (fail-loud, D2)" message.
  - a value failing the per-key `schema.safeParse` THROWS `CountryConfigError`.
- [ ] **Implement** `src/lib/country/resolveCountryConfig.ts` exactly per §4.1: `export type ConfigBag = Record<string, unknown>`; `ConfigLayers` with optional `global/region/country/legalEntity/tenant/businessUnit`; `const ORDER = ['global','region','country','legalEntity','tenant','businessUnit']`; `REQUIRED_SENTINEL = Symbol.for('country-config.required')`; `class CountryConfigError extends Error`; `resolveConfig<T>(registry, layers, key)` — `def.codedDefault` seed, walk ORDER taking most-specific non-null (clean `value = bag[key]`, NOT the buggy comma-operator the spec §14 flagged), `def.schema.safeParse(value)`, throw on unregistered key / parse failure / unresolved required sentinel; return `parsed.data as T`. Pure, dependency-free, registry+layers injected (mirrors the `resolveFeatureEnabled` contract).
- [ ] **Verify:** `npx vitest run src/lib/country/resolveCountryConfig.test.ts` → all green. `bash scripts/check-tsc.sh` → 0 errors.
- [ ] **Commit:** `feat(country): pure config resolver cloning feature_flags pattern (fail-loud)`.

### Task 2 — Country config registry (`registry.ts`) cloning `FEATURE_REGISTRY`, TDD

**Spec:** §4.2 (typed-but-open registry, `maxOverrideLayer` statutory lock), §4.6 (eight domains), §4.7 (worked example: zero-schema-change key).

- [ ] **Write the failing test** `src/lib/country/registry.test.ts`: assert `COUNTRY_CONFIG_REGISTRY` has no duplicate `key`; `required: true` keys (`currency.code`, `tax.label`, `tax.default_rate`, `number_format.amount_in_words_minor_units`) carry `codedDefault === REQUIRED_SENTINEL`; statutory keys (`tax.zatca_qr.enabled`) carry `maxOverrideLayer: 'country'`; `resolveCountryConfig` (Task 1) wired to this registry resolves a known display key from a country layer and **throws** for `currency.code` when no layer provides it; `STATUTORY_KEYS` (derived export, `maxOverrideLayer === 'country'`) is non-empty and used by the trigger-parity gate (Task 8).
- [ ] **Implement** `src/lib/country/registry.ts` per §4.2: `interface ConfigKeyDef { key; domain: ConfigDomain; label; description; schema: ZodType; codedDefault: unknown; required?: boolean; maxOverrideLayer?: 'country'|'legal_entity'|'tenant'|'business_unit' }`; `type ConfigDomain = 'currency'|'tax'|'datetime'|'number_format'|'locale'|'address'|'labor'|'document'`; the `COUNTRY_CONFIG_REGISTRY` array with the §4.2 seed entries (`currency.code` len-3 required; `tax.label` required; `tax.default_rate` 0–100 required; `tax.zatca_qr.enabled` bool default false country-locked; `datetime.weekend_days` int[] default `[6,0]`; `number_format.amount_in_words_minor_units` int 0–4 required; plus `locale.code`, `datetime.date_format`, `datetime.timezone` as non-required display keys backfilled from existing typed columns per §4.4 Phase A); `REGISTRY_BY_KEY` map; `STATUTORY_KEYS` derived array; `resolveCountryConfigKey(layers, key)` app-facing binding to `COUNTRY_CONFIG_REGISTRY` (mirrors `isFeatureEnabled` at `registry.ts:116`).
- [ ] **Verify:** `npx vitest run src/lib/country/registry.test.ts` green; `bash scripts/check-tsc.sh` 0 errors.
- [ ] **Commit:** `feat(country): typed-but-open config key registry`.

### Task 3 — Migration M-A: `geo_countries` config bag + format/labor columns + no-stub guard; regen types

**Spec:** §3a, §4.4 (additive, fallback to typed columns), §4.3 (`config_version` drives invalidation), §2.7 (`config_status` reads by the per-country gate).

- [ ] **Apply migration** `country_engine_geo_country_config_bag` — ADD to `geo_countries`: `country_config jsonb NOT NULL DEFAULT '{}'::jsonb`, `config_version integer NOT NULL DEFAULT 1`, `weekend_days int[] NOT NULL DEFAULT '{0,6}'`, `statutory_workweek numeric(4,2)`, `digit_grouping text NOT NULL DEFAULT '3'`, `reference_dataset_version text`, `config_status text NOT NULL DEFAULT 'stub' CHECK (config_status IN ('stub','formatting_ready','statutory_ready'))`, `requires_local_residency boolean NOT NULL DEFAULT false`, `data_protection_regime text`; plus `ADD CONSTRAINT chk_country_currency_nonstub CHECK (config_status='stub' OR (currency_code IS NOT NULL AND currency_code <> '' AND char_length(currency_code)=3)) NOT VALID`. (Defer `region_id` FK to M-B; defer `social_security_schema`/`income_tax_brackets`/`eosb_formula`/`overtime_premiums` to the Phase-3 statutory wave — Phase 1 ships only the framework + format columns.) No RLS/index change (global table).
- [ ] **Backfill** in the same migration: set `config_status='formatting_ready'` for the 16 rows where `currency_code IS NOT NULL AND char_length(currency_code)=3`; seed each row's `country_config` from existing typed columns (`currency.code`, `tax.label`, `tax.default_rate`, `locale.code`, `datetime.date_format`, `datetime.timezone`, `datetime.weekend_days` default `'{6,0}'` unless a curated override) via `jsonb_build_object`, so the resolver reads jsonb but falls back to typed columns (zero behavior change, §4.4 Phase A).
- [ ] **Regen + verify:** generate types → `src/types/database.types.ts`; add manifest row; `bash scripts/check-schema-drift.sh` (no diff); `bash scripts/check-tsc.sh` (0). Confirm via SQL that the 2 OMR countries' rows show `config_status='formatting_ready'` and a populated `country_config`.
- [ ] **Commit:** `feat(geo): country_config jsonb bag + config_version + format/labor columns + no-stub guard (M-A)`.

### Task 4 — Migration M-B: dormant hierarchy foundation (regions/subdivisions/legal_entities/residency) + branches promotion + nullable scope cols + helpers + flag-off RLS; regen types

**Spec:** §2A.1–2A.8, §3b, §3e, §2A.5 (BU/region session helpers), §2A.7 (ADDITIONAL RESTRICTIVE flag-off policy), §10c (auto-collapse), §3j (number_sequences vocab). **Schema + backfill only; live sub-unit isolation NOT enabled (flag off everywhere).**

- [ ] **Apply migration** `country_engine_hierarchy_foundation`:
  - Global tables (no tenant_id; SELECT true; write `is_platform_admin()`): `geo_regions` (`code unique, name, parent_id self-FK, data_residency_region default 'global-1', sort_order, is_active, deleted_at, timestamps`); `geo_subdivisions` (`country_id NOT NULL → geo_countries, parent_id self-FK, code, name, subdivision_type, tax_authority_code, UNIQUE(country_id,code)` + partial index `idx_geo_subdivisions_country`); `master_data_residency_regions` (`code unique, display_name, supabase_ref, storage_endpoint, is_active, deleted_at`) — seed one row `('global-1','Global (default)','ssmbegiyjivrcwgcqutu',…,true)`.
  - Wire `geo_countries.region_id uuid REFERENCES geo_regions(id)` (the FK deferred from M-A); seed `geo_regions` `GCC` row; backfill KSA/UAE/OMN `region_id → GCC`.
  - `legal_entities` (tenant-scoped FULL pattern): per §3e shape — `tenant_id NOT NULL, country_id NOT NULL, subdivision_id, name NOT NULL, registration_number, tax_system NOT NULL DEFAULT 'NONE', tax_identifier, currency_code text NOT NULL` (**no `'USD'` default — D2**), `config jsonb DEFAULT '{}'`, `address jsonb DEFAULT '{}'`, `data_residency_region NOT NULL DEFAULT 'global-1'`, `is_primary boolean DEFAULT false`, `created_by/updated_by/deleted_at/timestamps`; RLS ENABLE+FORCE + RESTRICTIVE `legal_entities_tenant_isolation` + `set_legal_entities_tenant_and_audit` trigger + `idx_legal_entities_tenant_id` + `uq_legal_entity_primary ON legal_entities(tenant_id) WHERE is_primary AND deleted_at IS NULL`. (Omit `registered_address_id` FK → `structured_addresses` — that table is M-F, deferred to Phase 2; column added then.)
  - Promote `branches` in place (all nullable): `ADD legal_entity_id uuid REFERENCES legal_entities(id), parent_branch_id uuid REFERENCES branches(id), subdivision_id uuid REFERENCES geo_subdivisions(id), config jsonb DEFAULT '{}'`.
  - `profiles`: `ADD business_unit_id uuid REFERENCES branches(id), legal_entity_id uuid REFERENCES legal_entities(id)`.
  - Nullable scope cols (§2A.4): `cases ADD branch_id` **FK** (re-verify all 31 rows NULL before constraint) + `legal_entity_id`; `invoices`/`quotes` ADD `legal_entity_id, business_unit_id`; `number_sequences` ADD `legal_entity_id, business_unit_id, format_template, reset_basis, fiscal_year_anchor, last_reset_period` (§3j); `payments`/`receipts`/`stock_sales` ADD `legal_entity_id`; `chain_of_custody` ADD `business_unit_id` (write-once; append-only triggers untouched); `case_devices` ADD `business_unit_id`.
  - Tenants config cols (§4.3): `tenants ADD country_config_overrides jsonb NOT NULL DEFAULT '{}'::jsonb, resolved_country_config jsonb NOT NULL DEFAULT '{}'::jsonb, country_config_version integer, data_residency_region text NOT NULL DEFAULT 'global-1'`.
  - Session helpers (§2A.5, SQL STABLE SECURITY DEFINER, profiles-primary + JWT fallback): `get_current_business_unit_id()`, `get_current_region_id()`; `business_unit_scoping_enabled()` (reads `tenants.feature_flags->>'business_unit_isolation'`, default false).
  - ADDITIONAL RESTRICTIVE **flag-off** BU policies (§2A.7 exact 5-clause template, `is_platform_admin() OR NOT business_unit_scoping_enabled() OR get_current_business_unit_id() IS NULL OR <col> IS NULL OR <col> = get_current_business_unit_id()`) on every operational table that gained `business_unit_id`: `cases` (branch_id), `invoices`/`quotes`/`number_sequences` (business_unit_id), `chain_of_custody`/`case_devices` (business_unit_id). **Pure no-op everywhere** (flag off; all rows NULL).
- [ ] **Auto-collapse backfill** (§2A.8/§10c, idempotent `DO` block, AFTER DDL): for each non-deleted tenant — (1) **validate** `tenants.currency_code` is a real ISO currency present in `master_currency_codes` (NOT a `'USD'` placeholder for an OMR tenant) — RAISE EXCEPTION per-tenant if not (fail-loud guard; both live tenants already carry real OMR so this passes); (2) INSERT one primary `legal_entities` (`is_primary=true`, name = tenant name, `country_id`, `currency_code`, `tax_system` from tenant); (3) INSERT one `branches` "Main" (`code='MAIN'`, `legal_entity_id`=primary). Leave all operational `business_unit_id`/`legal_entity_id` **NULL** (the `<col> IS NULL` clause keeps them universally visible — no data rewrite, no custody rewrite).
- [ ] **Regen + verify:** generate types; manifest row; `check-schema-drift.sh` no diff; `check-tsc.sh` 0; `check-tenant-table-requirements.sql` passes for `legal_entities`. SQL assert: each tenant has exactly 1 `is_primary` legal entity + 1 `MAIN` branch; **visible-row-count per tenant on `cases`/`invoices` unchanged** (the load-bearing forensic invariant, §10c/§10h).
- [ ] **Commit:** `feat(hierarchy): dormant legal_entities + branches promotion + nullable scope cols + flag-off BU RLS (M-B)`.

### Task 5 — Extend `sync_tenant_config_from_country()` (+ ui_language + format fields + COALESCE guards) and the re-sync/backfill path; regen types

**Spec:** §9.2 (ui_language from language_code), §4.3 / §10b (re-sync RPC, `_apply_country_config` shared helper, one code path).

- [ ] **Write the failing test** `src/lib/country/resyncCountryConfig.test.ts` (integration, seeded test tenant per the repo's vitest DB harness; if no DB harness exists, assert via a thin service wrapper `resyncTenantCountryConfig(tenantId)` in `src/lib/tenantConfigService.ts` calling the RPC and that it (a) writes `resolved_country_config`, (b) stamps `country_config_version = geo_countries.config_version`, (c) does NOT mutate `country_config_overrides`).
- [ ] **Apply migration** `country_engine_sync_and_resync`:
  - Extract a shared `_apply_country_config(p_tenant_id uuid)` SECURITY DEFINER plpgsql helper that recomputes the **display** bag (currency/tax-label/locale/date/format fields) from `geo_countries` + `accounting_locales` precedence and writes `tenants.resolved_country_config`, stamping `country_config_version = config_version`. (Statutory rate/FX explicitly excluded — §4.3.)
  - Rewrite `sync_tenant_config_from_country()` to: keep the 11 existing assignments; ADD `NEW.ui_language := COALESCE(NEW.ui_language, CASE WHEN cc.language_code='ar' THEN 'ar' ELSE 'en' END)` (only when caller didn't set it — honors wizard override, §9.2); ADD copies of the new format fields (`weekend_days`, `digit_grouping` into tenant denormalized cols if present — else leave to resolved bag); **remove the `'USD'`/`'$'` literal fallbacks** in the trigger body, COALESCE only against the resolved country value then leave NULL (fail-loud, D2) — except keep `base_currency_code` backstop against `NEW.currency_code` (no `'USD'`). Trigger calls `_apply_country_config` so INSERT and re-sync share one path.
  - `resync_tenant_country_config(p_tenant_id uuid)` RPC: calls `_apply_country_config`, emits an append-only `audit_trails` `COUNTRY_CONFIG_RESYNCED` row, returns the new version. (Do NOT widen the trigger to fire on every `geo_countries` change — §10b.)
- [ ] **Backfill** (§9.2/§10b, one-time `DO`): UPDATE the 2 OMR tenants `ui_language='ar'`-capable per the language map (confirm both carry real OMR identity FIRST — satisfies the §2A.8 precondition); call `resync_tenant_country_config(id)` for each non-deleted tenant with `country_id NOT NULL` (leave `country_id IS NULL` tenants untouched + flagged — fail-loud, never guess).
- [ ] **Regen + verify:** generate types; manifest row; `check-schema-drift.sh` no diff; `check-tsc.sh` 0; `npx vitest run src/lib/country/resyncCountryConfig.test.ts` green; SQL confirms both tenants have a populated `resolved_country_config` + matching `country_config_version` + an `audit_trails` resync row.
- [ ] **Commit:** `feat(country): ui_language sync + display-only re-sync path (one code path, M-C)`.

### Task 6 — Rewire `tenantConfigService` + extend `TenantConfig` to resolve via the engine (fail-loud, no US literals)

**Spec:** §4.5 (fail-loud read assertion), §4.6 (extend `TenantConfig` + hooks, no new provider), §2.5 (ONE round trip), §2.6 (class-aware cache — display only).

- [ ] **Write the failing test** `src/lib/tenantConfigService.test.ts`: assert `fetchTenantConfig` builds `ConfigLayers` from `tenants.resolved_country_config` + `country_config_overrides` + folded `accounting_locales` and resolves each `TenantConfig` field via `resolveConfig` (mock the supabase client); assert that a missing required key (no currency) surfaces a thrown/blocking error rather than `'USD'`/`'$'`; assert the single-query embed at `tenantConfigService.ts:18-44` stays ONE round trip (no added per-field query).
- [ ] **Edit `src/types/tenantConfig.ts`:** replace `DEFAULT_TENANT_CONFIG` required-key US literals (`currency.code:'USD'`, `symbol:'$'`, `tax.label`, `locale.localeCode:'en-US'`, etc. at `tenantConfig.ts:56-93`) with `REQUIRED_SENTINEL`-backed values (or a `DEFAULT_TENANT_CONFIG` that is explicitly "unconfigured" and used only as a typed shape, never rendered). Keep cosmetic display defaults (theme). (Do NOT add the four new sub-config interfaces — `labor`/`address`/`numberFormat`/`documentPolicy` — yet; those land in Phase 2/3 with their consumers. Phase 1 only de-US-defaults the existing shape and routes resolution through the engine.) Builds on the Phase-0 `REQUIRED_SENTINEL`/`isResolvedConfig` primitives (Task 2.1).
- [ ] **Edit `src/lib/tenantConfigService.ts`:** in `fetchTenantConfig` (`:9-102`), additionally select `resolved_country_config, country_config_overrides` on the existing tenant query (still one round trip, §2.5); assemble `ConfigLayers` (`country`/`tenant`/folded `accounting_locales`); replace the `|| 'USD'` / `|| '$'` / `|| 'en-US'` / `|| 'MM/DD/YYYY'` `||`-chains at `:64-97` with `resolveConfig(...)` reads per field; on a thrown `CountryConfigError`, propagate it (do NOT swallow into `DEFAULT_TENANT_CONFIG`). Keep the 5-min `CACHE_TTL_MS` for display (§2.6). Export `resyncTenantCountryConfig(tenantId)` thin wrapper over the RPC (Task 5). Keep `invalidateTenantConfigCache` and extend it to be called by the resync wrapper.
- [ ] **Edit `src/contexts/TenantConfigContext.tsx`:** catch a `CountryConfigError` once and render a blocking "Tenant not configured for its country" state + telemetry (§4.5) instead of silently rendering US. (Existing hooks unchanged — same `TenantConfig` shape.)
- [ ] **Verify:** `npx vitest run src/lib/tenantConfigService.test.ts` green; `bash scripts/check-tsc.sh` 0; manually trace that the 2 OMR tenants resolve to OMR/VAT (no regression) via the test fixture.
- [ ] **Commit:** `feat(country): resolve TenantConfig through the engine, delete US fallbacks (fail-loud)`.

### Task 7 — `geo_countries` reference-data population from a MAINTAINED dataset + no-stub CI gate

**Spec:** §10a (deterministic generator from CLDR/ISO 3166/4217/libphonenumber/holiday data; idempotent seed carrying the FULL config bag; provenance), §2.7 / §9.4 (no-stub gate, `country-config-completeness`). **Blocking open question Q1 — see § "Blocking open questions" below.**

- [ ] **Create the generator** `scripts/country-engine/build-geo-seed.ts`: reads PINNED dataset versions (ISO 3166-1 identity/region, ISO 4217 currency+decimals — reuse `master_currency_codes`, do NOT re-derive; CLDR locale/date/number/grouping/week-start; libphonenumber phone; IANA tz; CLDR address-format) → emits ONE idempotent `supabase/seeds/geo_countries_seed.generated.sql` that upserts per-column (`ON CONFLICT (code) DO UPDATE` with jsonb `||` merge into `country_config`), stamps `reference_dataset_version`/`data_protection_regime`, flips `config_status` to `formatting_ready` for every populated country, and respects a `source_locked` flag so curated GCC overrides aren't clobbered. Pin versions in a committed `scripts/country-engine/dataset-versions.json`.
- [ ] **Apply the generated seed** via `mcp__supabase__execute_sql` (it is data, not DDL — idempotent upsert; safe to re-run). Set countries that remain stubs to `is_active=false` so the wizard dropdown + CI stay green (§9.4).
- [ ] **Add the no-stub CI gate** `scripts/check-geo-completeness.sql` (required status check, modeled on `scripts/check-tenant-table-requirements.sql`): fails if any `is_active` country lacks currency/locale/date/timezone (and, post-population, phone/address). Register it in CI alongside the existing gates. Add `scripts/country-engine/build-geo-seed.test.ts` asserting the generator output is deterministic (same input versions → byte-identical SQL) and carries the full bag (not name+code-only).
- [ ] **Validate the constraint:** after population, run `ALTER TABLE geo_countries VALIDATE CONSTRAINT chk_country_currency_nonstub;` (the M-A `NOT VALID` constraint, now satisfiable for active rows).
- [ ] **Verify:** `psql`/MCP run of `check-geo-completeness.sql` returns 0 stubs among `is_active` countries; `npx vitest run scripts/country-engine/build-geo-seed.test.ts` green.
- [ ] **Commit:** `feat(geo): reference-data population generator + no-stub CI gate`.

### Task 8 — `validate_country_config_overrides()` trigger + `registry-trigger-parity` CI gate

**Spec:** §2.3 (jurisdiction-derived vs tenant-chosen split enforced server-side), §2.7 (`registry-trigger-parity` gate), §4.2 (`maxOverrideLayer` statutory lock).

- [ ] **Apply migration** `country_engine_override_governance`: `validate_country_config_overrides()` BEFORE UPDATE trigger on `tenants` (and `legal_entities`) that diffs the incoming `country_config_overrides` jsonb keys against a `STATUTORY_KEYS` allowlist baked into the function and RAISES on an attempt to override a jurisdiction-derived key at the tenant layer. The statutory-key list in the function is generated from `COUNTRY_CONFIG_REGISTRY.STATUTORY_KEYS` (Task 2) — emitted into the migration body by a small codegen step so client and server cannot drift.
- [ ] **Add CI gate** `scripts/check-registry-trigger-parity.sh` (required status check): extracts the statutory-key list from the live `validate_country_config_overrides()` definition and diffs it against `STATUTORY_KEYS` exported from `src/lib/country/registry.ts`; fails on mismatch (prevents the §2.3 drift that re-opens D11).
- [ ] **Write test** `src/lib/country/registry.parity.test.ts` asserting `STATUTORY_KEYS` is stable and non-empty (the source the gate reads).
- [ ] **Regen + verify:** generate types; manifest row; `check-schema-drift.sh` no diff; `check-tsc.sh` 0; run `check-registry-trigger-parity.sh` → pass; SQL: attempting `UPDATE tenants SET country_config_overrides = '{"tax.default_rate": 9}'` RAISES.
- [ ] **Commit:** `feat(country): override-governance trigger + registry-trigger-parity gate`.

### Task 9 — Fail-loud onboarding: D6 fix + jurisdiction capture + OTP + deterministic `seed_new_tenant` + provisioning gate

**Spec:** §9.1 (D6), §9.3 (jurisdiction → primary legal_entities), §9.4 (block activation until config resolves), §9.5 (wire dead OTP), §9.6 (`seed_new_tenant`, tenant_currencies FIRST), §9.7 (slug check), §6.5 (`get_base_currency`).

- [ ] **Apply migration** `fix_onboarding_progress_provisioning` (D6, §9.1): `onboarding_progress ADD user_id uuid REFERENCES auth.users(id), deleted_at timestamptz` (**`IF NOT EXISTS` — confirming no-op if Phase-0 Task 1.1 already landed it**); partial index; partial-unique `(tenant_id, user_id) WHERE deleted_at IS NULL`; confirm RLS ENABLE+FORCE + RESTRICTIVE isolation + `set_onboarding_progress_tenant_and_audit` + index (the edge fn at `provision-tenant/index.ts:319-333` already passes `user_id` — it was failing because the column was absent; this makes the insert succeed). Add `get_base_currency()` (§6.5: `tenant_currencies` is_base → `tenants.currency_code` → **NULL**, not `'USD'`; `IF NOT EXISTS`/`OR REPLACE` — Phase-0 Task 2.3 may have landed it). Add `enforce_onboardable_country` BEFORE INSERT backstop on `tenants` (rejects a country whose `config_status<>'statutory_ready'` is required, or non-`'global-1'` residency / `requires_local_residency=true`, §9.4/§7.4.1). Add `seed_new_tenant(p_tenant_id)` + `seed_number_sequences(p_tenant_id)` (§9.6/§3j): idempotent, one transaction, seeds **(1) `tenant_currencies` is_base row FIRST** (so `get_base_currency()` never returns NULL on a later money write — §6.5 sequencing dependency), (2) `number_sequences` canonical scopes, (3) primary `legal_entities` (Task 4 collapse shape; minimal entity if `tax_system='NONE'`), (4) `Main` `branches`, (5) `onboarding_progress` (`current_step='company_info'`). Add `send_signup_otp(p_email)` / `verify_signup_otp(p_email, p_code)` SECURITY DEFINER RPCs over `signup_otps` (rate-limited, single-use, constant-time, §9.5).
- [ ] **Edit `supabase/functions/provision-tenant/index.ts`:** (a) immediately after the country fetch at `:263`, assert currency/locale/date/timezone present AND the per-country `config_status` gate — on failure **soft-delete the tenant** (`update({deleted_at})`, NOT `.delete()`) and return **422** "This country is not yet available for onboarding…"; (b) **delete** the `|| 'USD'` / `|| '$'` / `|| 'en-US'` literal fallbacks at `:305-312` (and the accounting-locale insert) — pass resolved values or fail; (c) convert the two existing `.delete()` rollbacks to `update({deleted_at})` (soft-delete rule); (d) stop swallowing the onboarding insert error — on failure soft-delete + `throw` (confirms/extends the Phase-0 Task 1.1 fail-loud); (e) call `seed_new_tenant(tenant.id)` once (replacing the ad-hoc accounting-locale/onboarding inserts); (f) send `ui_language: null` unless the wizard user overrode (honors §9.2 sync default).
- [ ] **Edit `src/pages/auth/onboarding/useOnboardingFlow.ts`:** add `.is('deleted_at', null)` at the slug check (`:124`) to match the server authority (`provision-tenant:152`, §9.7); filter the country dropdown to currency-bearing countries (`.not('currency_code','is',null)`, §9.4); add a conditional **Jurisdiction step** capturing legal-entity type + tax registration (label from `tax_number_label`, soft-validated vs `geo_countries.tax_number_format` — accept any non-empty when format empty, §9.3) + fiscal-year + timezone, persisted into the provisioning payload → primary `legal_entities`; add a Language segmented control pre-filled from the country's `language_code` (§9.2); gate `nextStep`/`submit` on `emailVerified` wired to the OTP RPCs (§9.5).
- [ ] **Add CI assertion** `scripts/check-active-country-config.sql` (required check, §9.4; flip the Phase-0 report-only gate to required): every `is_active` country has currency/locale/date/timezone (red on merge otherwise).
- [ ] **Backfill (one-time):** call `seed_new_tenant(id)` once for each of the 2 existing OMR tenants (idempotent) so they get a primary legal entity + Main branch + onboarding row + tenant_currencies is_base (§9.6).
- [ ] **Regen + verify:** generate types; manifest rows; `check-schema-drift.sh` no diff; `check-tsc.sh` 0; deploy the edge fn to a Supabase branch and exercise: provisioning a stub country → 422, no tenant row (soft-deleted); provisioning an OMR-config country → 1 tenant + 1 legal_entity + 1 Main branch + 1 onboarding_progress row + tenant_currencies is_base; OTP request+verify round-trips. SQL confirms both backfilled OMR tenants now have `onboarding_progress` rows (was 0).
- [ ] **Commit:** `feat(onboarding): fail-loud provisioning + D6 fix + jurisdiction capture + OTP + deterministic seed`.

### Phase 1 exit verification

- [ ] **§4.7 worked example passes:** add a throwaway registry key `document.national_id_label` (registry entry only) + set it on a country's `country_config` + bump `config_version` + resync → the value resolves through `resolveConfig` with **zero schema change / zero types regen / zero trigger edit**. Revert the throwaway.
- [ ] **Provisioning rejects an unprepared/stub country with a 422** (no tenant row); **a prepared country provisions** with the full deterministic seed.
- [ ] **Every existing tenant auto-collapsed** to exactly 1 legal entity + 1 Main branch; **visible-row-count per tenant on `cases`/`invoices` unchanged** (forensic invariant).
- [ ] **All new CI gates green:** `check-geo-completeness.sql`, `check-active-country-config.sql`, `check-registry-trigger-parity.sh`; existing gates (`typecheck`, `schema-drift`, `migration-manifest`, `tenant-table-requirements`, `lint`) green.
- [ ] **Append-only forensic tables untouched:** `case_job_history`/`audit_trails`/`chain_of_custody` still REVOKE'd + `prevent_audit_mutation`; BU policies are flag-OFF no-ops (live sub-unit isolation NOT enabled).

**Phase 1 exit criteria:** a new country config key ships with ZERO schema change (§4.7 worked example); provisioning rejects an unprepared/stub country with a 422 and creates NO tenant row, a prepared country provisions with the full deterministic seed (tenant_currencies is_base FIRST + number_sequences + primary legal_entities + Main branch + onboarding_progress); every existing tenant auto-collapsed to exactly 1 primary legal_entity + 1 MAIN branch with cases/invoices visible-row-count unchanged; `country-config-completeness`/`registry-trigger-parity` gates green and `chk_country_currency_nonstub` VALIDATEd; `sync_tenant_config_from_country` sets `ui_language` (COALESCE-guarded) and the display-only re-sync reaches the 2 OMR tenants with an audit row; TenantConfig resolves entirely through the engine with no `'$'/'USD'/'en-US'/'MM/DD/YYYY'` fallback surviving; D6 closed (the 2 OMR tenants now have onboarding_progress rows); dormant hierarchy intact (BU policies flag-OFF no-ops, append-only forensic tables untouched); all migrations additive with `database.types.ts` regenerated + schema-drift + tsc 0 + manifest green.

---

## Phase 2 — i18n extraction + multi-currency gap-table closure + base-currency reporting + country-routed PDF templates

> **Goal (spec §12 Phase 2):** internationalize the surface (portal-first), close the dormant multi-currency gaps, make every cross-document aggregation base-currency-correct, and route PDF templates by the resolving entity's country — all additive, all behind the existing CI rails.
>
> **Skill gate:** mixed UI + backend → load **both tracks** — `ui-ux-pro-max` + `frontend-design` (for the i18n extraction + PO-modal currency selector + portal RTL) AND **using-superpowers** (routes to **test-driven-development** for the currency/reporting/PDF logic). When expanding this phase into its dated plan, run **writing-plans** first.
>
> **Depends on Phase 1** for: the `src/lib/country/*` resolver + `COUNTRY_CONFIG_REGISTRY` (§4), `geo_countries.country_config`/`config_version` + `tenants.resolved_country_config` (§3a/§4.3), the extended `TenantConfig` + new hooks (`useLaborConfig`/`useNumberFormatConfig`/`useDocumentPolicy` — §4.6), `get_base_currency()` + flipped money-column defaults (§6.5), `legal_entities` + promoted `branches` + nullable scope FKs (§2A/§3e), `geo_country_tax_rates` (§3c, the single tax-label/rate source for D9/D10), and the Phase-1 i18n tables `geo_languages`/`i18n_translations` (§5.1) + `master_notification_templates` (§3i). Phase 2 **consumes** these; it never re-declares them.
>
> **Post-pull verification done (origin/main HEAD aa596e0):** `resolveTemplateConfig(builtIn, theme?, docType?, instance?)` lives at `src/lib/pdf/templateConfig.ts:963`; it has **8 production call sites in `src/lib/pdf/pdfService.ts`** (`:52,94,135,171,206,249,313,352,392`) + `src/lib/reportPDFService.ts:191` + 2 component sites (`TemplateGalleryModal.tsx:111`, `TemplateStudio.tsx:136`) + ~30 test sites — every one passes positional `undefined` for `theme`, so inserting a **new positional `country` argument between `builtIn` and `theme`** is identity-safe (`applyOverride(base, undefined)` returns base). PDF dates funnel through **one** helper `formatDate(date, formatStr='dd/MM/yyyy')` at `src/lib/pdf/utils.ts:5`; ~24 adapter/document sites hardcode `'dd MMM yyyy'`/`'dd/MM/yyyy HH:mm'` literals. `applyTenantLanguage` (`src/lib/pdf/engine/applyTenantLanguage.ts`) is the per-build injection point called "AFTER resolveTemplateConfig and BEFORE renderTemplate" — the natural seam for `applyTenantLocale`. `src/lib/locale.ts` hard-codes `RTL_LANGUAGES={'ar'}` and `normalizeLang(): 'en'|'ar'`. The i18n rule `eslint-rules/no-untranslated-jsx-text.js` flags only `JSXText`; `eslint.config.js:77` sets it to `'warn'` (~1,684 pre-existing). `format.ts:77` (`toLocaleString('en-US')`) + `:97` (Western `\B(?=(\d{3})+...)` grouping) = D18.

### Verified DB deltas that update stale spec/brief line numbers (read-only introspection, project ssmbegiyjivrcwgcqutu)

- **`receipts`** ALREADY has `amount_base`, `exchange_rate`, `rate_source` — it is **missing only `currency_code`** (spec §3g correct; one column here).
- **`purchase_orders`** has `currency` but **no** `exchange_rate`/`rate_source`/`subtotal_base`/`tax_amount_base`/`discount_amount_base`/`total_amount_base`.
- **`stock_sales`** has **no** currency/FX/base columns whatsoever.
- **`payroll_records`** writers live in `payrollService.ts` (insert sites `:257,:272,:287,:423,:848`); needs `currency`/`exchange_rate`/`rate_source`/`*_base`.
- **`bank_accounts`** has `currency` + `currency_id` but **no `*_base`** columns (D8 — §6.2/§8a). (Phase-0 Task 4.2 already added `currency_code`/`*_base`/`fx_*` — this phase's `bank_accounts_base_columns` becomes a confirming/extending `IF NOT EXISTS` migration; reconcile column names with Phase 0's.)
- **No dedicated `stockSalesService.ts`/`purchaseOrderService.ts`/`receiptService.ts` exist.** Stock-sale writes live in `src/lib/stockService.ts` (`:430,:454,:513,:565,:721,:777,:918`); PO writes currently only in `src/lib/importExportService.ts`; receipt writes have no service-layer site. Phase 2 creates `purchaseOrderService.ts` + `receiptService.ts` writer wrappers and threads `stockService.ts`/`payrollService.ts` in place.
- `currencyService.resolveRateContext(documentCurrency, onDate, override?)` returns `{documentCurrency,documentDecimals,baseCurrency,baseDecimals,rate,rateSource}` (`src/lib/currencyService.ts:137`); `financialMath.baseAmount(row, field)` at `:178`. These are the only two functions every new writer calls.

---

### Track A — i18n (spec §5): gate FIRST, then portal-first extraction

**A0 — Enforcement gate before any extraction (spec §5.3).** Mirror the schema-discipline baseline→gate→burndown. The gate ships and goes green BEFORE a single string is extracted, so the bleeding stops first.

- Extend `eslint-rules/no-untranslated-jsx-text.js` to also flag literal string `JSXAttribute` values for `placeholder`/`title`/`aria-label`/`alt` (skip `{t(...)}`, empty/whitespace/pure-punctuation/number, reuse the existing `isReportableText` predicate); add attribute fixtures to `eslint-rules/no-untranslated-jsx-text.test.js`; freeze `i18n-baseline.json` (every current violation `{file,line,messageId}` — ratchet-down, like the removed `tsc-baseline.count`); flip the rule to `'error'` in `eslint.config.js` with `{ baseline: './i18n-baseline.json' }`; add `scripts/check-i18n-keys.sh` (required check — every `t('ns:key')` site has a key in `i18n_translations` for `fallbackLng='en'`); add a `country-i18n` CI job running the baseline lint + key check.
- **Verify:** new `placeholder="X"` → `npx eslint <file>` exits 1; `bash scripts/check-i18n-keys.sh` exits 0 on `main`. **Commit:** `feat(i18n): enforcement gate — attr literals + missing-key CI + frozen baseline`.

**A1 — Widen `Locale`, lift RTL + `normalizeLang` from hardcode (spec §5.2).** `src/lib/locale.ts` `RTL_LANGUAGES`/`SUPPORTED` become a mutable set hydrated by `hydrateLanguages(rows)`; `isRTLLanguage`/`normalizeLang(code?): string` read the hydrated set (keep `{'ar'}`/`'en'` as the in-bundle bootstrap); `src/types/locale.ts` `Locale = string`; `LocaleContext.tsx` hydrates `geo_languages` on mount; exhaustive sweep of every `=== 'ar'`/`=== 'en'`. Test `src/lib/locale.test.ts`; verify `npm run typecheck`=0. **Commit:** `feat(i18n): config-driven Locale union + data-hydrated RTL/normalizeLang`.

**A2 — Collapse the two catalogs; seed from `documentTranslations` (spec §5.1).** `scripts/country-engine/seed-i18n-from-donor.ts` (idempotent ETL: `documentTranslations.ts` 13-lang corpus → `i18n_translations` `documents` namespace with key-mapping; `i18n.ts` `resources.en/.ar` → `common`/`ui`/`nav`; `is_machine_translated=false,is_verified=false`); `src/lib/i18n.ts` keeps en/ar in-bundle, adds a lazy backend; `src/lib/i18nBackendService.ts` `loadNamespace(lang,ns)` with `en` fallback. Test `i18nBackendService.test.ts`. **Commit:** `feat(i18n): one DB-backed catalog — donor ETL + lazy namespace backend`.

**A3 — Portal-first vertical-slice extraction (spec §5.4, slice 1 of 5).** Every `src/pages/portal/**` + `src/components/portal/**` JSXText/flagged-attr literal → `t('portal:<key>')`; add `portal` namespace keys (EN+AR verified); ratchet `i18n-baseline.json` down. Test: render a portal page under `LocaleContext` with `locale='ar'`, assert Arabic value + `dir` flip. **Slices 2–5** (`documents`, `cases`, `financial`, `settings/platformAdmin/hr`) are subsequent same-recipe PRs. **Commit:** `feat(i18n): extract portal slice into i18n_translations (portal-first)`.

**A4 — Localized transactional email / notifications (spec §5.6).** `supabase/functions/notification-dispatch-email/*` gains the global-default fallback chain (tenant `notification_templates` → country default → `master_notification_templates` → coded English); statutory/forensic event types (`data_destruction_certificate`, `checkout_receipt`, `nda_*`) resolve `is_verified=true` rows ONLY else English; `src/lib/notificationTemplateService.ts` (the caller-side resolver). Test `notificationTemplateService.test.ts` (locale present→localized; missing→English; statutory unverified→English). **Commit:** `feat(i18n): localized notification resolution with verified-only statutory strings`.

---

### Track B — multi-currency gap-table closure (spec §6) [migration sub-track M-G]

**B1 — Migration `currency_fx_base_gap_tables` (spec §3g) + types regen.** Additive nullable columns + exact backfill, BEFORE any non-unity write path enables:

```sql
ALTER TABLE receipts ADD COLUMN currency_code text;
ALTER TABLE purchase_orders
  ADD COLUMN exchange_rate numeric, ADD COLUMN rate_source text,
  ADD COLUMN subtotal_base numeric(19,4), ADD COLUMN tax_amount_base numeric(19,4),
  ADD COLUMN discount_amount_base numeric(19,4), ADD COLUMN total_amount_base numeric(19,4);
ALTER TABLE stock_sales
  ADD COLUMN currency text, ADD COLUMN exchange_rate numeric, ADD COLUMN rate_source text,
  ADD COLUMN subtotal_base numeric(19,4), ADD COLUMN tax_amount_base numeric(19,4),
  ADD COLUMN discount_amount_base numeric(19,4), ADD COLUMN total_amount_base numeric(19,4);
ALTER TABLE payroll_records
  ADD COLUMN currency text, ADD COLUMN exchange_rate numeric, ADD COLUMN rate_source text,
  ADD COLUMN total_earnings_base numeric(19,4), ADD COLUMN total_deductions_base numeric(19,4),
  ADD COLUMN overtime_amount_base numeric(19,4);
-- exact backfill (FX feed has 0 non-unity rows): currency from tenant base, *_base = amount, rate=1
UPDATE receipts r SET currency_code = COALESCE(currency_code,
  (SELECT currency_code FROM tenants t WHERE t.id = r.tenant_id)) WHERE currency_code IS NULL AND deleted_at IS NULL;
UPDATE purchase_orders p SET exchange_rate=1, rate_source='derived',
  subtotal_base=subtotal, tax_amount_base=tax_amount, total_amount_base=total_amount
  WHERE exchange_rate IS NULL AND deleted_at IS NULL;
UPDATE stock_sales s SET currency=COALESCE(currency,(SELECT currency_code FROM tenants t WHERE t.id=s.tenant_id)),
  exchange_rate=1, rate_source='derived', subtotal_base=subtotal, tax_amount_base=tax_amount,
  total_amount_base=total_amount WHERE exchange_rate IS NULL AND deleted_at IS NULL;
-- payroll_records backfill mirrors stock_sales on its money columns
-- flip defaults to get_base_currency() (Phase-1 §6.5) on the new/existing currency cols
ALTER TABLE purchase_orders ALTER COLUMN currency SET DEFAULT get_base_currency();
ALTER TABLE stock_sales   ALTER COLUMN currency SET DEFAULT get_base_currency();
ALTER TABLE receipts      ALTER COLUMN currency_code SET DEFAULT get_base_currency();
ALTER TABLE payroll_records ALTER COLUMN currency SET DEFAULT get_base_currency();
```
Regen types; post-migration assertion SQL (every row non-null currency/`*_base`, `exchange_rate=1`). **Commit:** `feat(currency): add FX/base columns to stock_sales/payroll/PO + receipts.currency_code (+backfill)`.

**B2 — Route every new writer through `resolveRateContext` + `baseAmount` (spec §6.1).** `stockService.ts` stock_sales write sites; new `purchaseOrderService.ts` + `receiptService.ts` wrappers; `payrollService.ts` insert sites — each: `resolveRateContext(currency, date)` then `*_base = baseAmount({...row, exchange_rate:ctx.rate}, '<field>')` at `ctx.baseDecimals`, `rate_source=ctx.rateSource`. Tests `purchaseOrderService.test.ts`/`receiptService.test.ts`/`stockService.currency.test.ts`. **Commit:** `feat(currency): wire stock/PO/receipt/payroll writers through resolveRateContext`.

**B3 — Tenant-level rate override (spec §6.3).** Migration `tenant_exchange_rate_overrides` (tenant-scoped full pattern: `base_currency`, `quote_currency`, `rate numeric CHECK(rate>0)`, `effective_from/to date`, `reason`); `currencyService.resolveRateContext` consults the override FIRST (precedence: tenant override → `exchange_rates` feed → unity if same → fail-loud), stamping `rate_source ∈ 'tenant_override'|'er-api'|'derived'`; `tenantExchangeRateService.ts` + manager+-gated admin form (no approval workflow — YAGNI). Test `currencyService.override.test.ts`. **Commit:** `feat(currency): tenant exchange-rate overrides (first in resolver precedence)`.

**B4 — Per-currency minor-unit correctness (D13/D14/D18, spec §6.4).** `src/lib/pdf/amountInWords.ts:56-61` parametrize `decimals` + per-currency minor-unit map (baisa/fils/halala/sen) — supersedes Phase-0 Task 4.3's defaulted-decimals version with the named minor units; `format.ts:77,97` → one config-driven formatter with `groupInteger(intStr, sep, style)` supporting `'standard'` + `'indian'` (lakh/crore), `CurrencyConfig`/`TenantConfig` gain `groupingStyle`/`numberingSystem`, **delete legacy `formatCurrencyWithSettings`/`fetchCurrencyFormat`** after callers migrate (completes D18 beyond Phase-0's interim fix); `PurchaseOrderFormModal.tsx` currency selector + base-equivalent preview via `formatCurrencyWithConfig` (the §6.6 enhancement on top of Phase-0 Task 4.4's sweep); `eslint-rules/no-raw-currency-format.js` + register `error` w/ frozen baseline. Tests `amountInWords.test.ts`/`format.test.ts`. **Commit:** `fix(currency): minor-unit-aware amountInWords + config-driven format.ts + PO modal (D13/D14/D18)`.

**B5 — EUR-on-OMR end-to-end reconciliation proof (RELEASE GATE, spec §6.7).** `src/lib/__tests__/multiCurrencyReconciliation.test.ts` (vitest integration, seeded OMR-base tenant + EUR active + seeded `exchange_rates`): EUR invoice €1,234.567 → `total_amount_base === baseAmount(total, rate, 3)`; partial EUR payment → `SUM(payment.amount_base) === invoice.amount_paid_base` to the 3rd decimal; PDF `amountInWords` baisa (D13); dashboard total === base (D7); override path `rate_source='tenant_override'`; bank rollup sums base (D8); **timezone-boundary check** on FX `rate_date`. Marked a required CI check, un-skippable. **Commit:** `test(currency): EUR-on-OMR reconciliation-to-the-penny release gate`. **This is the multi-currency release gate and is reused by Phase-3 VAT201 reconciliation.**

---

### Track C — base-currency reporting (spec §8a) + `no-raw-currency-aggregation`

**C1 — `baseAmount` as the only cross-document aggregation path (D7/D8).** `ReportsDashboard.tsx` — **delete the 4 inline raw-sum queries** (`:244-245,:279,:305,:332`; supersedes Phase-0 Task 4.1's interim `sumBase` patch) and rewire to the base-aware `financialReportsService.ts` via `financialKeys.reports()`; migration `bank_accounts_base_columns` (confirming/extending Phase-0 Task 4.2 with `IF NOT EXISTS`); `financialReportsService.ts:225-230` convert bank balances at read, label "indicative base" (D8); `eslint-rules/no-raw-currency-aggregation.js` + register `error` (flags `.reduce(`/`+=` over money fields without a sibling `_base`/`baseAmount(`); deliverable checklist `docs/country-engine/aggregation-audit.md`. Tests `ReportsDashboard.test.tsx` + `no-raw-currency-aggregation.test.js`. **Commit:** `fix(reporting): base-currency-only aggregation + bank base columns + no-raw-currency-aggregation gate (D7/D8)`.

---

### Track D — country-routed PDF templates (spec §8b/§8c/§8d/§8g)

**D1 — Country layer in the cascade: `resolveTemplateConfig` gains a positional `country` override (spec §8b).** `templateConfig.ts:963` → `resolveTemplateConfig(builtIn, country?, theme?, docType?, instance?)` (apply `country` first: `built-in→country→theme→doc-type→instance`); `src/lib/pdf/engine/countryConfig.ts` `countryTemplateOverride(countryCfg)` **derived not authored** (resolved `tax_label`→`labels.taxLabel` + VAT line label = **D9**; `tax_invoice_required AND tax_system='VAT'`→`taxBar.enabled` = **D11**; `tax_system='VAT' AND country='SA'`→ZATCA flag via `einvoiceRouter` = **D11**, supersedes Phase-0 Task 3.3's `shouldEmitZatcaQr` with the registry-backed override; GCC/`is_rtl`→`language.mode='bilingual_stacked'`; `currency_decimal_places`→`money()`+amountInWords = **D13**); insert the resolved override as the new 2nd arg at all 8 `pdfService.ts` sites + `reportPDFService.ts:191`, keyed off the **resolving entity's** `legal_entity_id`'s country; insert positional `undefined` at the ~30 test sites + 2 component sites. Test `countryConfig.test.ts` (KSA/UK/JP + cascade). **Commit:** `feat(pdf): country layer in template cascade (countryTemplateOverride) — D9/D11/D13`.

**D2 — Config-aware date formatting in every PDF adapter (spec §8d/§8g).** `utils.ts:5` `formatDate` accepts an optional `dateFormatPattern` from render context; `applyTenantLanguage.ts → applyTenantLocale` threads `geo_countries.date_format` + grouping into the render context; the ~24 hardcoded-literal sites replace literal format strings with config-aware `fmtDate(value, ctx)`; `eslint-rules/no-hardcoded-pdf-dateformat.js` + register (frozen baseline). Test `applyTenantLocale.test.ts`. **Commit:** `feat(pdf): config-aware date formatting in every adapter + lint gate`.

**D3 — Per-(legal_entity / business_unit, doc_type) template variants (spec §8c).** Logic + storage now; variant-picker UI deferred until a 2nd legal entity exists. Migration `template_versions_entity_bu_scope` (`document_template_versions` nullable `legal_entity_id`/`business_unit_id` **consuming Phase-1 §3e tables** + partial unique `uq_template_deployed_scope`); `documentTemplateService.getDeployedVersionByType(docType, { legalEntityId?, businessUnitId? })` most-specific-first (entity+BU → entity → tenant default; auto-collapse safe). Test `documentTemplateService.scope.test.ts`. **Commit:** `feat(pdf): per-entity/BU deployed template-version resolution (auto-collapse safe)`.

---

### Phase 2 exit criteria (spec §12 Phase 2)

- The i18n enforcement gate is green and PR-blocking (`no-untranslated-jsx-text='error'` on a frozen `i18n-baseline.json` now flagging `placeholder`/`title`/`aria-label`/`alt`; `check-i18n-keys.sh` asserts every `t('ns:key')` resolves; NEW violations fail CI); `Locale` widened to `string` with data-hydrated RTL/`normalizeLang` and the full `=== 'ar'` sweep done (`npm run typecheck`=0); the portal slice is fully extracted into `i18n_translations` (EN+AR verified) and a non-English tenant renders the portal in its language with correct `dir`; statutory/forensic emails use `is_verified=true` rows only else English.
- `stock_sales`/`payroll_records`/`purchase_orders` gain currency+exchange_rate+rate_source+`*_base` and `receipts` gains `currency_code`; all existing rows backfilled exactly (rate=1, `*_base`=amount); every new writer routes through `resolveRateContext` + `baseAmount`; `tenant_exchange_rate_overrides` + resolver precedence (override→feed→unity→fail-loud) with `rate_source` provenance; per-currency minor units correct (`amountInWords` no longer hardcodes `/100`; `format.ts` grouping/position config-driven; legacy formatters deleted); **the EUR-on-OMR reconciliation proof passes to the penny** (the multi-currency release gate).
- `baseAmount` is the only cross-document aggregation path (ReportsDashboard inline raw sums deleted and rewired to `financialReportsService`; `bank_accounts` base columns converted-at-read; `no-raw-currency-aggregation` green; `aggregation-audit.md` complete).
- `resolveTemplateConfig` has a country layer (built-in→country→theme→doctype→instance) via derived `countryTemplateOverride`; all 8 `pdfService` + `reportPDFService` + component + ~30 test call sites compile with the inserted positional arg; invoice tax_label/taxBar/QR/decimals come entirely from resolved country config (D9/D11/D13); every PDF adapter formats dates from config (`applyTenantLocale`; ~24 literal sites converted; `no-hardcoded-pdf-dateformat` green); per-(legal_entity/business_unit, doc_type) template variants resolve most-specific-first with auto-collapse to tenant default (`uq_template_deployed_scope` enforced).
- `npm run typecheck`=0; schema-drift, lint (incl. the new gates), tenant-table-requirements, migration-manifest all green; each migration regenerated `database.types.ts` in the same PR.

---

## Phase 3 — GCC-deep statutory: tax engine, payroll engine, EOSB, e-invoice registry, statutory filings

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes. Each task is independently testable, TDD-first, one commit per task. Migrations go through `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`), then regenerate `src/types/database.types.ts` and append to `supabase/migrations.manifest.md` in the same PR. **Skill gate:** backend/logic/schema → **using-superpowers** (routes to **test-driven-development**). When expanding into the dated plan, run **writing-plans** first; **Q2 statutory-pack ownership must be answered before authoring any golden-number fixture.**

**Goal:** Ship the deep statutory machinery for KSA/UAE/Oman as a complete, country-routed, effective-dated framework — the per-line/multi-rate tax engine, the input-VAT system-of-record (D1), the rules-driven payroll engine (D5) with EOSB accrual (D4), the country-routed e-invoice registry (D11) and the GCC VAT201 statutory return — turning every Phase-0 gating stub into a verified, per-country-gated capability.

**Architecture:** The database is the statutory engine; the frontend is a thin renderer. Statutory values resolve **live + effective-dated at commit, then freeze onto the document row** (append-only `tax_line_assessments` / `einvoice_submissions` / `employee_eosb_accruals`) — never read from the tenant display snapshot (spec §2A.2/§4.3/§7). Rules data lives in **global, platform-admin-write, effective-dated, country-keyed** tables (`geo_country_tax_rates`, `master_statutory_contributions`, `geo_country_eosb_policies`, …); the runtime resolves the row valid AS-OF the document date. Every engine **fails loud** — a missing rule for the onboarding country blocks that country, never falls back to a US/flat-7% default.

**Tech stack:** Postgres 15 (Supabase MCP migrations), TypeScript service layer (`src/lib/**`), Vitest golden tests, pdfmake (existing `zatcaQr.ts` TLV builder reused), the `feature_flags` registry pattern (`src/lib/features/`) as the e-invoice adapter-registry template.

### Verified current state (against live DB `ssmbegiyjivrcwgcqutu` @ HEAD aa596e0)

- **All Phase-3 statutory tables are net-new** — `geo_country_tax_rates`, `master_tax_categories`, `tax_line_assessments`, `master_einvoice_regimes`, `einvoice_submissions`, `master_filing_obligations`, `geo_public_holidays`, `geo_country_eosb_policies`, `employee_eosb_accruals`, `master_income_tax_brackets`, `master_statutory_contributions`, `master_bank_file_formats`, `tenant_leave_types`, `tenant_payroll_components`, `master_statutory_leave`, `master_jurisdiction_gates`, `case_compliance_gates` **do not exist** (verified `information_schema.tables`).
- **`expenses` already carries** `tax_amount`, `tax_amount_base`, `exchange_rate`, `rate_source`, `currency` → the D1 expense input-VAT trigger reads these directly.
- **`purchase_orders` has** `tax_amount`, `currency` but is **missing** `tax_amount_base`/`exchange_rate`/`rate_source` → the PO input-VAT trigger is **gated on Phase 2 §3g** (Track B1) adding those columns. **Ship the expense trigger now; ship the PO trigger only after Phase 2.**
- **`employees` has** `nationality` + `salary_currency` (D5 dimensions exist, the engine ignores them).
- **`master_leave_types` (10 rows)** and **`master_payroll_components` (14 rows)** have **only `id`** matching jurisdiction/soft-delete filters — confirms the §3k overlay gap.
- **Live volumes (the empty window):** 2 tenants (both Oman), **0 employees, 0 payroll_records, 16 vat_records all `sale`, 0 `purchase`, 0 vat_returns, 0 expenses-with-tax.** Build the entire payroll/EOSB stack before any tenant depends on it.
- **Defect sites:** D1 `vatService.ts:217` (`record_type:'sale'`) + `:116-117` (raw sum); D5 `payrollService.ts:389` (`basicSalary * socialSecurityRate`); D16 `payrollService.ts:913-914` (literal `'USD'`/`'Bank Muscat'`); D13 `src/lib/pdf/engine/amountInWords.ts:58-60`.
- **Reusable seams:** `financialMath.roundMoney(value, decimalPlaces)`; `currencyService` `resolveRateContext`/`getCurrencyDecimals`/`getBaseCurrency`; `feature_flags` registry as the e-invoice adapter-registry clone target; ZATCA TLV at `zatcaQr.ts`; invoice PDF adapter at `invoiceAdapter.ts`.
- **Moved files:** `invoiceAdapter` → `src/lib/pdf/engine/adapters/invoiceAdapter.ts`; `TimesheetManagement` → `src/pages/employee-management/TimesheetManagement.tsx`; `PayrollSettingsPage` → `src/pages/payroll/PayrollSettingsPage.tsx`.

### Migration / build order (FKs flow downward; ties to spec §7.5 phases 7a–7e)

| Order | Task block | New objects | Gate released |
|---|---|---|---|
| 1 | **3.1 Tax categories + country rate sets** | `master_tax_categories`, `geo_country_tax_rates` (§3c) | single tax-rate/label source (D9/D10 data layer) |
| 2 | **3.2 Assessment ledger + D1 input-VAT** | `tax_line_assessments`, expense input-VAT trigger, `vat_records`→view | VAT returns statutorily accurate |
| 3 | **3.3 Tax engine in `financialMath` + resolver service** | `taxRatesService`, `computeLineTax`/`computeDocumentTax` | per-line/multi-rate/inclusive/zero-vs-exempt/WHT/reverse-charge |
| 4 | **3.4 De-hardcode invoice PDF (D9) + e-invoice router (D11)** | `einvoiceRouter`, adapter registry, `master_einvoice_regimes`/`einvoice_submissions`/`master_filing_obligations` | country-routed e-invoice |
| 5 | **3.5 Work calendar (D15) + holidays** | `geo_public_holidays`, `workCalendar` | day-class overtime correct |
| 6 | **3.6 Payroll rules tables + EOSB tables** | rules tables, `geo_country_eosb_policies`, `employee_eosb_accruals`, `payroll_records` cols | rules-data backbone |
| 7 | **3.7 EOSB engine (D4)** | `eosbService` | Gulf gratuity accrual |
| 8 | **3.8 Rules-driven payroll engine (D5) + bank files (D16/D17)** | `statutoryPayroll`, `bankFileFormats` | payroll matches a real country |
| 9 | **3.9 D13 amount-in-words currency-aware** | `amountInWords` parametrized | legal invoice minor units correct |
| 10 | **3.10 Jurisdiction overlay lookups (§3k)** | `master_*` annotations + `tenant_*` overlays | leave/component by jurisdiction |
| 11 | **3.11 VAT201 statutory return (gated behind D1)** | `filingAdapter`, `vat201Adapter` | periodized GCC return |
| 12 | **3.12 Jurisdiction consent gates (§7.4.2)** | `master_jurisdiction_gates`, `case_compliance_gates`, `transition_case_status` extension | consent gate mechanism |
| 13 | **3.13 Per-country statutory-gate wiring + flag flip** | extend `statutory-gate` CI; flip `country_engine.*` flags | provisioning unblocked per GCC country |

Each migration task ends with: regenerate `database.types.ts` via `npm run db:types`, append the filename to `supabase/migrations.manifest.md`, confirm `bash scripts/check-schema-drift.sh` and `npm run check:tsc` pass, then commit.

### Task 3.1 — `master_tax_categories` + `geo_country_tax_rates` (the single tax-rate/label source, §3c)

- [ ] **DDL (global; SELECT `true`, write `is_platform_admin()`):** `master_tax_categories` (`code` unique in `standard|zero_rated|exempt|out_of_scope|reverse_charge`, `treatment`, `affects_input_recovery boolean` — the zero-rated≠exempt guard); `geo_country_tax_rates` (`country_id NOT NULL`, `subdivision_id`, `tax_category_id NOT NULL`, `rate numeric(7,4)`, `tax_system`, `tax_label`, `component_label`, `applies_to CHECK('output'|'input'|'both')`, `effective_from NOT NULL`, `effective_to`, `is_default`, `deleted_at`) + `idx_country_tax_rates_lookup(country_id, effective_from)` + `uq_country_tax_default` partial unique. RLS ENABLE+FORCE both.
- [ ] **Seed GCC standard rates** (KSA 15% / UAE 5% / Oman 5%, `tax_system='VAT'`, `tax_label='VAT'`, `is_default`, `effective_from` per VAT-introduction date) — **gated on §13 Q2 compliance-owner sign-off; flag placeholder rows, do NOT flip the statutory-gate green for a country until an owner confirms.**
- [ ] **Regen + manifest + verify** (schema-drift; SQL: `SELECT count(*) FROM geo_country_tax_rates WHERE is_default` = 3). **Commit:** `feat(tax): add master_tax_categories + geo_country_tax_rates effective-dated rate set (D9/D10 data layer)`.

### Task 3.2 — `tax_line_assessments` append-only ledger + D1 input-VAT writer (system-of-record)

- [ ] **Migration `tax_line_assessments`** (tenant-scoped, append-only): full envelope + `document_type/document_id/line_id/tax_rate_id/tax_category_id/taxable_base/tax_amount/is_inclusive/tax_direction CHECK('output'|'input')/withholding/reverse_charge/currency/exchange_rate/rate_source/tax_amount_base/taxable_base_base/tax_period/created_by/deleted_at`; RESTRICTIVE `tax_line_assessments_tenant_isolation` + `set_*_tenant_and_audit` + `idx_*_tenant_id` + `idx_*_period`; idempotency `uq_tax_line_assessment(document_type, document_id, coalesce(line_id,…), tax_direction)`; **append-only:** `REVOKE UPDATE,DELETE` + `prevent_audit_mutation` trigger. (Confirm the exact `set_*_tenant_and_audit` + `prevent_audit_mutation` signatures against an existing append-only table like `chain_of_custody` before applying.)
- [ ] **Migration expense input-VAT trigger (D1, DB-side):** `write_input_tax_from_expense()` AFTER INSERT/UPDATE on `expenses` (reads its existing `tax_amount/tax_amount_base/exchange_rate/rate_source/currency`) → inserts an `input` assessment, `ON CONFLICT … DO NOTHING`. (Verify `expenses.amount`/`expense_date` exist.) **PO input-VAT trigger DEFERRED to after Phase-2 §3g.**
- [ ] **Migration `vat_records` → derived rollup:** keep the 16 legacy `sale` rows; add a `tax_line_assessments`-backed read in `vatService` (do NOT destructively swap the table to a view — there are live readers). **No retroactive synthesis of historical purchase VAT (§10f); 0 filed returns = nothing to restate.**
- [ ] **TDD `vatService.test.ts`** (netting in base; input lowers `netVAT`; idempotency), then modify `vatService.ts` (`createVATRecordFromInvoice` writes an `output` assessment replacing the `:217` hardcode; `calculateVATForPeriod` sums `tax_amount_base` grouped by `tax_direction` replacing the `:116-117` raw sum; `vat_return_lines` keyed by `tax_category_id`). Add `taxAssessmentKeys` to `queryKeys.ts`. **Commit:** `feat(tax): tax_line_assessments append-only ledger + expense input-VAT writer; vat_records becomes derived rollup (D1)`.

### Task 3.3 — Tax engine: `taxRatesService` + `computeLineTax`/`computeDocumentTax` (D9/D10)

- [ ] **TDD `taxRatesService.test.ts`** (effective-dated resolution; `{rate, taxLabel, taxSystem, taxCategoryId}`; **throws fail-loud when no row + no fallback**; zero-rated vs exempt same 0 tax / different `affects_input_recovery`), then `taxRatesService.resolveTaxRate(countryId, docDate, categoryId?)` (the `geo_countries.tax_label`/`default_tax_rate` scalars are fallback-only, never read directly by `useTaxConfig`).
- [ ] **TDD `financialMath.test.ts`** golden vectors at 2/3/0 decimals (exclusive/inclusive/zero/exempt/out-of-scope/reverse-charge/withholding), then `computeLineTax()`/`computeDocumentTax()` alongside the existing single-rate fast path (single-OMR case byte-identical). Reuse `roundMoney`.
- [ ] **De-hardcode form defaults (D9/D10):** wire Invoice/Quote modal tax label + default rate through `useTaxConfig()` resolving through `taxRatesService` (generalizes Phase-0 Task 3.2); add `validateTaxNumber(value, country)` soft-warn vs `geo_countries.tax_number_format`. **Commit:** `feat(tax): per-line multi-rate tax engine + effective-dated rate resolver (D9/D10, inclusive/zero-vs-exempt/WHT/reverse-charge)`.

### Task 3.4 — Country-routed e-invoice registry + router (D11, §7.2)

- [ ] **Migration:** `master_einvoice_regimes` (global) + `einvoice_submissions` (tenant append-only, mirror 3.2 envelope; `payload_hash`/`authority_reference`/`qr_payload`/`response_json`) + `master_filing_obligations` (global); seed `zatca_ph1` (SA, `requires_tax_system='VAT'`, `mandatory_from`), `uae_vat201` (AE), `none`.
- [ ] **TDD `einvoiceRouter.test.ts`** (`resolveEinvoiceRegime` returns `zatca_ph1` ONLY when `country='SA' AND tax_system='VAT' AND regime.mandatory_from<=docDate`; `none` otherwise; **no UI toggle path**), then `einvoiceRouter.ts` + adapter registry (`zatcaPhase1Adapter` live wrapping `zatcaQr.ts`; `zatcaPhase2`/`inIrn`/`ukMtd`/`uaeVat201` registered stubs that throw `NotImplementedError`).
- [ ] **Rewire `invoiceAdapter.ts`:** replace the manual ZATCA toggle (generalizes Phase-0 Task 3.3's `shouldEmitZatcaQr` and Phase-2 Track-D's flag) with `resolveEinvoiceRegime(resolvingEntityCountry, taxSystem, docDate)`; tax label from `taxRatesService`. Add `einvoiceKeys`. **Commit:** `feat(tax): country-routed e-invoice registry + ZATCA Phase-1 routing, kills manual QR toggle (D11)`.

### Task 3.5 — Work calendar + `geo_public_holidays` (D15, §3d)

- [ ] **Migration `geo_public_holidays`** (global; `country_id`, nullable `subdivision_id`, `holiday_date`, `name`, `is_recurring`, `day_class`, unique `(country_id, holiday_date, name)`); seed GCC fixed-date + Islamic-calendar overlay note (**Q1 holiday provider open**). `geo_countries.weekend_days` already exists from Phase 1 §3a — do NOT re-add.
- [ ] **TDD `workCalendar.test.ts`** (GCC `{5,6}` Fri/Sat weekend; holiday `day_class`; overtime premium by day-class; non-GCC `{0,6}`), then `workCalendar.ts` (`classifyDay`/`overtimePremium`/`countWorkingDays`).
- [ ] **Rewire `TimesheetManagement.tsx` (D15):** replace the hardcoded Monday (generalizes Phase-0 Task 4.6) with `workCalendar` reads from `useDateTimeConfig()`/`useLaborConfig()`. **Commit:** `feat(payroll): work-calendar weekend + public-holiday day-classification (D15)`.

### Task 3.6 — Payroll rules tables + EOSB tables + `payroll_records` statutory columns (§3d/3h/3g)

- [ ] **Migration rules tables (global, effective-dated, country-keyed):** `master_income_tax_brackets`, `master_statutory_contributions` (`nationality_class`, `employee_rate`/`employer_rate`/`wage_base`/`cap`), `master_bank_file_formats` (`format_code CHECK('WPS'|'Mudad'|'SEPA'|'ACH'|'BACS')`, `field_spec jsonb`). **Seed GCC contributions gated on Q2.**
- [ ] **Migration EOSB tables (D4):** `geo_country_eosb_policies` (global; `tiers jsonb`, `base_wage_components text[]`, `cap_months`, `resignation_scale jsonb`, `effective_from/to`); `employee_eosb_accruals` (tenant, append-corrections-only via reversing rows; full envelope + `idx_*_tenant_id`). Seed GCC tier policies (Q2).
- [ ] **Migration `payroll_records` statutory columns:** ADD nullable `income_tax_amount`/`employee_contribution`/`employer_contribution`/`eosb_accrued`/`currency`/`exchange_rate`/`rate_source`/`total_earnings_base`/`total_deductions_base`/`overtime_amount_base`/`net_salary_base` (the §3g backfill for 0 rows is a no-op; reconcile with Phase-2 Track-B1 which also touches `payroll_records`). **Commit:** `feat(payroll): rules tables + EOSB policy & accrual tables + payroll_records statutory columns (D4/D5/D16)`.

### Task 3.7 — EOSB accrual engine `eosbService` (D4, §3h)

- [ ] **TDD `eosbService.test.ts`** golden Gulf-gratuity fixtures (21 days/yr first 5y, 30 thereafter, capped, resignation-scale) for 3y and 7y tenures — **owner-confirmed numbers (Q2)**; then `computeEosbAccrual(employee, policy, asOfDate)` (pure, injected) + `writeAccrualRow` (append-only). Add `eosbKeys`. **Commit:** `feat(payroll): EOSB accrual+payout engine over geo_country_eosb_policies (D4)`.

### Task 3.8 — Rules-driven payroll engine (D5) + parameterized bank files (D16/D17), §7.3

- [ ] **TDD `statutoryPayroll.test.ts`** golden (KSA Saudi GOSI / KSA non-Saudi / UAE no-income-tax / bracketed country — **owner-signed Q2**) + **critical fail-loud: a country with NO seeded rule throws, never flat-7%**; then `computeStatutoryPayroll(employee, period, calendar)` (brackets/contributions/EOSB by `nationality`+residency, effective-dated; day-class overtime via `workCalendar`).
- [ ] **TDD `bankFileFormats.test.ts`** WPS + Mudad golden output (from `field_spec` + employee data, **no literal `'USD'`/`'Bank Muscat'`/`'WPS'`**); then `bankFileFormats.ts`.
- [ ] **Rewire `payrollService.ts` (D5/D16):** replace `:385-391` flat-7% with `computeStatutoryPayroll`; replace `generateWPSFileContent` `:901-919` with `bankFileFormats`. **Rewire `PayrollSettingsPage.tsx` (D17):** currency dropdown from `tenant_currencies`/`master_currency_codes` (generalizes Phase-0 Task 4.7). **Commit:** `feat(payroll): rules-driven statutory payroll engine + parameterized bank files; replaces flat-7% (D5/D16/D17)`.

### Task 3.9 — `amountInWords` currency-aware minor units (D13, §6.4)

- [ ] **TDD** (OMR baisa 3dp / JPY 0dp / USD 2dp), then parametrize `decimals` from `master_currency_codes.decimal_places`/`getCurrencyDecimals`; per-currency minor-unit name (baisa/fils/halala/sen) with "and N/Mths" fallback (final form of Phase-0 Task 4.3 + Phase-2 Track-B4). **Commit:** `fix(pdf): currency-aware amountInWords minor units, fixes OMR/JPY (D13)`.

### Task 3.10 — Jurisdiction-overlay lookups for leave types / payroll components (§3k)

- [ ] **Migration:** ADD `country_id`/`region_id`(FK `geo_regions`)/`deleted_at` to `master_leave_types` + `master_payroll_components`; CREATE `tenant_leave_types` + `tenant_payroll_components` (tenant pattern) + `master_statutory_leave` (global). Resolution = tenant overlay (enabled) ∪ global rows where `country_id IS NULL OR = tenant.country_id OR region_id = tenant.region_id`. Update HR leave config + `payrollService.ts` reads; filter `deleted_at`. **Commit:** `feat(hr): jurisdiction overlay for leave types & payroll components (§3k)`.

### Task 3.11 — GCC VAT201 statutory return builder (HARD-GATED behind D1, §8e)

- [ ] **GATE CHECK:** confirm Task 3.2 (D1) merged and `tax_line_assessments` carries both directions. If not green, STOP.
- [ ] **TDD `vat201Adapter.test.ts`** reusing the Phase-2 §6.7 EUR-on-OMR scaffold (OMR-base tenant + KSA-VAT output sale + EUR input expense → output/input/net boxes sum `tax_amount_base` and **reconcile to the penny at OMR 3 decimals**; period boundaries from `geo_countries.fiscal_year_start`+`period_frequency`, not hardcoded quarters); then `filingAdapter.ts` (`StatutoryReturnAdapter<TForm>` + `periodBoundaries`) + `vat201Adapter.ts` (boxes keyed by `tax_category_id`). Add `statutoryReturnKeys`. **Commit:** `feat(statutory): GCC VAT201 return builder over tax_line_assessments (gated behind D1)`.

### Task 3.12 — Jurisdiction consent-gate mechanism (§7.4.2)

- [ ] **Migration:** `master_jurisdiction_gates` (global; `enforcement CHECK('block','warn') DEFAULT 'warn'`) + `case_compliance_gates` (tenant append-only); extend `transition_case_status` to `RAISE EXCEPTION` on an unsatisfied `enforcement='block'` gate (advisory `requires[]` → hard stop). A satisfied gate writes a `case_compliance_gates` row + a custody `evidence_handling` event via existing `log_chain_of_custody(...)` — **chain of custody stays append-only and untouched, never a forked lifecycle.** SQL test: `block` raises until satisfied, `warn` passes. **Commit:** `feat(workflow): jurisdiction consent gates on transition_case_status (default warn) (§7.4.2)`.

### Task 3.13 — Per-country statutory-gate wiring + dark-flag flip (§2.7, §10d/f)

- [ ] **Extend the Phase-1 `statutory-gate` CI check:** per onboarding country, assert D1 (input-VAT writer), D4 (`geo_country_eosb_policies` row), D5 (`master_statutory_contributions` rows), D9 (`geo_country_tax_rates` default) present AND `config_status='statutory_ready'`. A tenant in country X is blocked at provisioning until X's pack is present.
- [ ] **Flip the dark flags per verified tenant (§10d):** on the 2 live OMR tenants, after Oman's pack passes the gate, flip `country_engine.statutory_tax`/`rules_payroll`/`work_calendar` (verify on staging; with 0 employees/payroll/returns the payroll flags are inert until data exists — safe). Verify Oman green + an unprepared country blocked. **Commit:** `feat(country-engine): per-country statutory gate + flip GCC flags for verified tenants (§2.7)`.

### Exit gate for Phase 3 (run all before claiming complete — verification-before-completion)

```bash
npm run check:tsc          # expect: 0 errors
npm test                   # expect: all green incl. every new *.test.ts
bash scripts/check-schema-drift.sh   # expect: no diff (types match live DB)
```
Plus the per-country `statutory-gate` passes for each onboarded GCC country, and forensic invariants (`case_job_history`/`audit_trails`/`chain_of_custody` append-only; `tax_line_assessments`/`einvoice_submissions`/`employee_eosb_accruals` append-only; RESTRICTIVE tenant isolation only ANDed) are re-asserted by the SQL checks in Tasks 3.2/3.6/3.12.

**Phase 3 exit criteria:** GCC VAT201 reconciles to the penny across currencies over the `tax_line_assessments` base rollup; **D1** structurally closed (expense/PO write input assessments via DB trigger, `vat_records` derived, idempotent); **D9/D10** closed (effective-dated `taxRatesService`, zero-rated vs exempt distinguished); **D11** closed (`einvoiceRouter` SA+VAT-after-mandate only, no manual toggle); **D4** closed (golden Gulf gratuity, append-corrections-only); **D5** closed (rules-driven engine matches KSA/UAE/bracketed fixtures and RAISES on a missing rule — never flat-7%); **D15/D16/D17** closed (`workCalendar` GCC weekend/holiday day-classes; `bankFileFormats` WPS+Mudad from `field_spec` with no literals; data-sourced currency dropdown); **D13** closed (OMR baisa / JPY no-fraction golden); the per-country statutory-gate passes per onboarded GCC country and blocks a country whose pack is absent; forensic invariants intact across every migration; `npm run check:tsc`=0; `npm test` green; schema-drift clean; manifest appended.

### What MUST ship before a given GCC country can onboard (the line in the sand)

- **KSA / UAE (non-OMR statutory tenants):** Tasks **3.1, 3.2 (D1), 3.3 (D9/D10), 3.4 (D11), 3.6, 3.7 (D4), 3.8 (D5)** merged AND that country's rule data seeded and **§13-Q2-owner-signed**, AND the per-country gate (3.13) green. Tasks 3.5/3.9/3.10/3.11/3.12 harden correctness and are required for a tenant that runs payroll/returns, but a case-management-only onboarding can sequence 3.8's `bankFileFormats` after go-live (§7.3).
- **Oman (the 2 live tenants):** already statutory-ready for the simple single-rate VAT case; Phase 3 flips them onto the engine (3.13) without behavior change (0 employees/returns).

---

## Phase 4 — Gated depth: hierarchy, multi-entity, multi-region

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. **Skill gate:** WS-A/WS-C backend/RLS → **using-superpowers**; WS-B + the BU/entity management screens are mixed UI → also load `ui-ux-pro-max` + `frontend-design`. **Do NOT expand or build any work-stream until its GATE is met by a signed contract.**

**Goal:** Light up the expensive depth of the 6-level hierarchy — live business-unit RLS isolation, full per-legal-entity operations, and multi-region data residency — but only when a named/signed customer pays for it.

**Architecture:** Every capability here is *activation* of a foundation that Phases 0–1 shipped dormant (nullable scope columns, `legal_entities`, `branches`-as-business-unit, the dormant `*_business_unit_isolation` policies created flag-OFF, `get_current_business_unit_id()`/`get_current_region_id()` helpers, `data_residency_region` columns). Isolation is only ever *narrowed* — an ADDITIONAL RESTRICTIVE policy ANDed onto the untouched `tenant_id` predicate (§2A.7), never a widening. Multi-region is a per-tenant client/Storage routing key (§11c), not a config-cascade change.

**Tech Stack:** Postgres 15 RLS (RESTRICTIVE policies, `STABLE SECURITY DEFINER` helpers, composite partial indexes), `tenants.feature_flags` jsonb, vitest, Supabase MCP migrations, React 18 + TanStack Query v5, Supabase JS client + Storage.

---

### ⚠️ THE CARDINAL GATE — DO NOT START THIS PHASE WITHOUT A SIGNED CUSTOMER

> **Verified blunt truth (live DB, 2026-06-15):** 2 tenants, **0 branches**, 0 employees, 15 number_sequences, 24 cases — and the foundation this phase activates (`legal_entities`, `geo_regions`, `get_current_business_unit_id`, `profiles.business_unit_id`, `tenants.data_residency_region`, the `*_business_unit_isolation` policies) **does not exist in the live DB yet** (every `to_regclass`/`pg_proc` lookup returned null except `get_current_tenant_id`). It is created dormant by Phases 1–3.

**This is the most expensive, lowest-current-ROI phase in the entire program.** Building it speculatively is the textbook gold-plating this codebase has leaked before. The honest founder call: **ship Phases 0–3, then stop.** Pick up a Phase-4 work-stream *only* when its specific GATE is met by a real contract. Each work-stream is independently gated and independently shippable — **do not bundle them.**

| Work-stream | GATE (the only trigger to start) | §spec |
|---|---|---|
| **WS-A** — Live sub-unit RLS isolation | **Signed contract** with a tenant that runs **≥2 physical lab sites** under one workspace and requires staff at site X to NOT see site Y's cases/devices. | §2A.5, §2A.7, §2A.9 P2, §11e |
| **WS-B** — Full multi-entity operations | **Signed contract** with a tenant operating **≥2 legal/tax entities** (e.g. a KSA `LLC` + a UAE `FZ-LLC`) issuing invoices under separate tax numbers from one workspace. | §2A.6, §13-Q4, §12 P4 |
| **WS-C** — Multi-region data residency | **Signed contract** with an **EU/regulated customer** whose recovered-device data is legally barred from the `global-1` (`ssmbegiyjivrcwgcqutu`) region. | §2.8, §7.4.1, §11c, §12 P4 |

**Hard precondition for ALL work-streams (foundation-existence probe before any task):** run a `to_regclass`/`pg_proc`/`information_schema.columns` check confirming `legal_entities`, `geo_regions`, `get_current_business_unit_id`, `business_unit_scoping_enabled`, `profiles.business_unit_id`, `tenants.data_residency_region`, and at least one `*_business_unit_isolation` dormant policy all exist. **If any is null, STOP — Phase 1 is incomplete; finish it before Phase 4.**

---

### WS-A — Live sub-unit RLS isolation (GATE: signed multi-site customer)

**Goal:** Flip `feature_flags.business_unit_isolation` ON for the named tenant, assign `profiles.business_unit_id`, and turn the dormant `*_business_unit_isolation` policies (§2A.7) into active narrowing — provably without widening tenant isolation.

- [ ] **Task 0 — GATE check.** Confirm a signed multi-site customer is named in the contract; record the `tenant_id`. If not, do not proceed.
- [ ] **Task A1 — Perf indexes (ship before flipping any flag, §11e).** Migration `activate_business_unit_isolation_perf_indexes`: composite partial `idx_<tbl>_tenant_bu` on `cases`(`branch_id`)/`invoices`/`case_devices`/`chain_of_custody`(`business_unit_id`). Drive it test-first via `scripts/check-bu-isolation-invariant.sql` (4 MISSING rows → apply → 0 rows). Regen types; schema-drift clean. **Commit:** `feat(hierarchy): perf indexes for live business-unit isolation (WS-A)`.
- [ ] **Task A2 — Row-count invariance regression (the load-bearing forensic assertion, §10c/§10h).** `scripts/check-bu-isolation-invariant.sql` asserts the `cases_business_unit_isolation` policy `qual` contains all 5 escape clauses (flag-off no-op proof); if it fails the Phase-1 policy is wrong — STOP and fix Phase 1. Add a vitest integration test against a seeded tenant: flag ON + profile in BU-X → query returns only BU-X + `branch_id IS NULL` rows; flag OFF → all rows. **Commit:** `test(hierarchy): row-count invariance + narrowing proof for BU isolation`.
- [ ] **Task A3 — `businessUnitService` + assignment UI.** TDD `assignProfileToBusinessUnit`/`moveProfileToBusinessUnit` (audited, manager+); build `src/pages/settings/BusinessUnitManagement.tsx` (semantic tokens, `lucide-react`; owner/admin isolation toggle, manager+ assignment) + `src/lib/queryKeys.ts` keys. `npm run build`+`check-tsc`=0. **Commit:** `feat(hierarchy): business-unit management + audited staff assignment (WS-A)`.
- [ ] **Task A4 — Extend `check-tenant-table-requirements.sql` for BU-policy parity (§2A.7).** Add `issue_7`: any `business_unit_id` table must have a paired `*_business_unit_isolation` RESTRICTIVE policy. Run against live → 0 rows. **Commit:** `ci(hierarchy): assert BU-isolation policy parity in tenant-table-requirements`.
- [ ] **Task A5 — Flip the flag for the named tenant.** Set `feature_flags || '{"business_unit_isolation":true}'` for that tenant only; assign each staff profile to its BU; QA-verify BU-X staff cannot see BU-Y cases while `branch_id IS NULL` rows + platform-admin + tenant-wide users stay visible. **Commit:** `chore(hierarchy): activate BU isolation for <named tenant> (WS-A go-live)`.

**WS-A rollback:** flip the flag OFF — instant, reversible (every escape clause makes the policy a no-op); indexes are harmless when unused; no data/custody/audit row touched (`chain_of_custody.business_unit_id` is write-once).
**WS-A risk of premature build:** with 0 branches live, flipping the flag with no BU assignments makes `get_current_business_unit_id() IS NULL` true for everyone — a silent no-op that *looks* like it works but isolates nothing. Build only against a real multi-site tenant's site topology.
**WS-A P3 extension (separate sub-gate — named US-state / IN-GST / UAE-emirate customer):** populate `geo_subdivisions` from ISO-3166-2 **for that country only**; wire `geo_country_tax_rates.subdivision_id` resolution; `departments.branch_id` org-tree UX; nested BUs via `branches.parent_branch_id`. Same flag-gated, additive, reversible pattern.

---

### WS-B — Full multi-entity operations (GATE: signed ≥2-legal-entity tenant)

**Goal:** Make per-`legal_entity` tax/currency/number-sequences/templates fully live, and resolve §13-Q4, so a KSA entity and a UAE entity under one workspace issue separate statutory invoice runs.

- [ ] **Task 0 — GATE check + §13-Q4 sign-off.** Confirm a signed ≥2-entity tenant; record `tenant_id`. **§13-Q4 is a BLOCKING open question** — recommended call (await owner sign-off): **force an explicit entity choice once `count(legal_entities WHERE NOT deleted_at) > 1`, default to primary at exactly 1.** Do not build B2/B3 until signed off. Rationale: case tax identity is forensic and re-pointing issued invoices is catastrophic (§2A.10).
- [ ] **Task B1 — Multi-entity number sequences.** TDD `getNextNumber('invoices', {legalEntityId})` → separate counters; legacy single-arg unchanged. Migration `multi_entity_number_sequences_resolution`: coalesce-unique `uq_number_sequence_scope` + `get_next_number(p_scope, p_legal_entity_id default null, p_business_unit_id default null)` overload (preserve the single-arg signature). **Commit:** `feat(multi-entity): per-legal-entity statutory number sequences (WS-B)`.
- [ ] **Task B2 — Case → entity resolution (per Q4).** TDD `resolveCaseLegalEntity(case)` (primary when 1; requires explicit selection when >1 and NULL); `CreateCaseWizard.tsx` entity picker (renders only when >1); persist `cases.legal_entity_id`. **Commit:** `feat(multi-entity): per-case legal-entity selection + resolver (WS-B, Q4)`.
- [ ] **Task B3 — Invoice/quote issue under the resolving entity + entity-aware PDF.** TDD a KSA-entity case carries that entity's `tax_identifier`/`currency_code` + ZATCA override; a UK-entity case → UK label, no ZATCA. `InvoiceFormModal`/`QuoteFormModal` read `cases.legal_entity_id` → `legal_entities`; thread scope cols; PDF cascade resolves `countryTemplateOverride(entity.country)` (consumes Phase-2 `countryConfig.ts`, do not re-author). Build `LegalEntityManagement.tsx` + `legalEntityService.ts` (manager+, audited; single-primary already enforced by Phase-1's `uq_legal_entity_primary`). `country-lint`/`registry-trigger-parity` green. **Commit:** `feat(multi-entity): issue invoices/quotes under resolving legal entity + entity-aware PDF (WS-B)`.

**WS-B rollback:** entity columns nullable/additive — leave `legal_entity_id` NULL (collapses to tenant default) and revert UI commits; the `get_next_number` overload is additive (legacy untouched). No custody/audit mutation.
**WS-B risk of premature build:** with 1 entity per tenant (100% today), the picker never renders, per-entity sequences are 1:1 with tenant sequences, the entity-aware PDF override is identical to the tenant default — zero observable difference, full carrying cost; forcing the Q4 UX without a real multi-entity tenant risks the wrong default + later invoice re-pointing (catastrophic). Build only against the signed tenant's entity set.

---

### WS-C — Multi-region data residency (GATE: signed EU/regulated customer)

**Goal:** Stand up a second regional Supabase project (Postgres **and** Storage), a `tenant → region` routing map, per-tenant client selection at auth, cross-region platform-analytics ETL fan-in, and remove the §7.4.1 provisioning block for that one regulated country — honoring residency for **both** rows and recovered-device file images.

- [ ] **Task 0 — GATE check.** Confirm a signed EU/regulated customer; record the country + required region. The single most expensive item in the program (a whole second deployment topology). If not signed, do not proceed.
- [ ] **Task C1 — Provision + register the regional project.** Create the regional Supabase project in the legally-correct region; replay the full migration manifest so it is schema-identical. TDD `regionRouter.resolveClient('<new-region>')` → client at the new project's URL/Storage; migration `register_second_residency_region` inserts the `master_data_residency_regions` row. **Commit:** `feat(residency): register <region> regional project + router (WS-C)`.
- [ ] **Task C2 — Per-tenant client + Storage routing at auth.** TDD: a `data_residency_region='<new-region>'` tenant binds the routed client and Storage uploads target the regional bucket; `global-1` tenants unaffected. `regionRouter.ts` + `supabaseClient.ts` region-aware factory (keep the default `global-1` client static) + `AuthContext.tsx` binding. **Storage residency is non-negotiable (§7.4.1)** — device-image uploads/downloads route through the regional Storage endpoint, not just metadata. **Commit:** `feat(residency): per-tenant Postgres+Storage routing at auth (WS-C)`.
- [ ] **Task C3 — Unblock provisioning + immutable binding.** TDD: `provision-tenant` with the regulated country succeeds (no 422), writes `data_residency_region`, and any later region change is rejected (immutable, §11c). Replace the §7.4.1 block with region resolution; add a `BEFORE UPDATE` guard raising on any `data_residency_region` change after insert. **Commit:** `feat(residency): provision into regional project; immutable tenant↔region binding (WS-C)`.
- [ ] **Task C4 — Cross-region platform-analytics fan-in.** `supabase/functions/platform-analytics-etl/index.ts` (scheduled aggregates-only fan-in into `global-1`; NO live cross-region join, NO PII/recovered-data crossing the border). Update `docs/data-residency.md` + `DESIGN.md` to "multi-region active for `<region>`; binding immutable." **Commit:** `feat(residency): platform-analytics ETL fan-in across regions + docs (WS-C)`.

**WS-C rollback:** the regional project is additive — re-instate the §7.4.1 provisioning block and revert the router/AuthContext commits; the `global-1` path is never touched. **Already-provisioned regional tenants cannot be rolled back without a data re-home** — which is why the binding is immutable and why WS-C must not ship before a real signed customer.
**WS-C risk of premature build:** a second full deployment topology (schema replay, Storage routing, ETL, ops/monitoring/backup) carrying continuous infra + on-call cost for capability zero current tenants need; marketing EU residency on the dormant column is the §2.8 failure mode. Until the signed EU contract makes the region mandatory, the Phase-1 provisioning block (`requires_local_residency` → 422) is the correct, honest behavior.

---

### Phase 4 exit criteria (per §12 P4)

Each work-stream ships independently; the phase as a whole is "complete" only in the sense that **each gated capability, when its customer arrives, ships with RLS/perf load-tested (composite indexes + `STABLE` helpers), the forensic invariants intact (`case_job_history`/`audit_trails`/`chain_of_custody` append-only, device-level custody never collapsed, RESTRICTIVE tenant isolation only ANDed), and no speculative depth enabled without a paying customer.**

- **WS-A** (if signed multi-site): perf indexes present; `check-bu-isolation-invariant.sql` + extended `check-tenant-table-requirements.sql` green; vitest proves real narrowing under RLS AND the flag-off no-op; flag flipped for the named tenant; QA confirms BU-X staff cannot see BU-Y cases while `branch_id`-NULL rows + platform-admin + tenant-wide users stay visible; rollback = flip flag off (instant, reversible).
- **WS-B** (if signed ≥2-entity AND §13-Q4 signed): `get_next_number` overload yields separate per-entity counters with the legacy single-arg untouched; `CreateCaseWizard` forces entity choice when >1, defaults to primary at 1; invoices/quotes issue under the resolving entity's tax number/currency and resolve the correct per-country PDF override (KSA→ZATCA, UK→UK label); `country-lint`/`registry-trigger-parity` green; rollback leaves entity columns NULL.
- **WS-C** (if signed EU/regulated): a second regional Supabase project (Postgres+Storage) is schema-identical and registered; tenants route their client AND Storage uploads to their region at auth; provisioning into the regulated country succeeds and writes an IMMUTABLE `data_residency_region`; platform analytics fan-in reflects both regions with no live cross-region join; docs flipped to "multi-region active"; `global-1` tenants unaffected.
- **Cross-cutting:** forensic invariants intact across every WS (`chain_of_custody.business_unit_id` write-once; device-level custody never collapsed; RESTRICTIVE tenant isolation only ANDed); `database.types.ts` regenerated after each migration with schema-drift green; tsc 0.
- **Phase-level:** if NO gate has been triggered by a signed customer, the correct and successful state of Phase 4 is **NOT STARTED** — speculative depth must not be enabled without a paying customer.

---

## Blocking open questions (must answer before the named phase)

These are the per-phase `blockingOpenQuestions` consolidated and mapped to the design spec §13 "Open questions for product owner." Each must be answered **before the phase that depends on it is expanded into its dated plan** — they change dataset sourcing, resolver precedence, and statutory sign-off in ways that would force a re-plan otherwise. Phase 0 has **none** — start it now.

| Spec §13 | Question | Blocks | Why it blocks / what changes |
|---|---|---|---|
| **Q1** | **Reference dataset + cadence.** Which exact pinned/maintained datasets (CLDR / ISO 3166-1 / ISO 4217 / libphonenumber) and which holiday provider (Nager.Date free vs Calendarific paid vs hand-curated GCC packs, given Islamic-calendar holidays move yearly), and who owns the version-bump review? | **Phase 1 · Task 7** (and Phase 3 · Task 3.5 holidays) | Direct input to `scripts/country-engine/build-geo-seed.ts`; gates `check-geo-completeness.sql` / `country-config-completeness` going green. Phase 1 cannot complete population without the named, licensed source. The holiday slice also blocks Phase-3 `workCalendar` overtime day-classification. |
| **Q2** | **Statutory pack ownership + budget.** Who are the NAMED compliance owners for KSA/UAE/Oman, and is the rules data (rates, GOSI/contribution schedules, EOSB tier formulae, income-tax brackets, WPS/Mudad field_spec) bought from a paid subscription or hand-authored? | **Phase 3** (every golden-fixture task: 3.1, 3.6, 3.7, 3.8) | The single hardest blocker for Phase 3. Every golden test encodes a number a compliance owner must sign off; without owners the rate/contribution/EOSB seed rows are unverifiable and the statutory-gate cannot legitimately go green. |
| **Q3** | **Portal/email language scope** — per-**tenant** (lab sets it) or per-**recipient** (recipient picks)? | **Phase 1 (soft)** + **Phase 2 · Tracks A3/A4** | Sets resolution precedence for the portal slice and notification rendering. Today locale is tenant-scoped (the default the plan implements); a per-recipient decision adds a recipient-locale lookup to A4's resolver and a language toggle to the portal. |
| **Q4** | **Default legal entity for a case once a tenant has >1 entity** — primary-by-default or force an explicit choice at case creation? | **Phase 4 · WS-B (Tasks B2/B3)**; informs **Phase 3** per-entity tax resolution | Drives which `legal_entity_id` (hence which country's tax rate/label/ZATCA routing) `resolveTaxRate`/`einvoiceRouter` and the PDF override key off. With auto-collapse (1 entity today) it is a no-op, but the >1-entity rule must be confirmed before the variant-picker UI. **Recommended (await sign-off): force explicit choice when >1, default to primary at exactly 1** — case tax identity is forensic and re-pointing issued invoices is catastrophic (§2A.10). |
| **Q6** | **Translation supply for the long tail** beyond the 13 donor languages + GCC Arabic — professional vendor vs CLDR-derived UI primitives vs machine-translate-then-review with `is_verified`? | **Phase 2 · Track A** (non-statutory portal/UI fill rate) | Statutory document/email strings MUST be human-verified regardless (A4 enforces `is_verified=true` for statutory events); the non-statutory fill rate for non-donor languages is gated on this answer. |
| **Q7** | **Confirm the locked-scope reading** — is shipping only L4-collapse now (hierarchy DEPTH gated behind a named multi-entity customer; live sub-unit isolation flag-OFF) an acceptable satisfaction of locked decision #1's "depth delivered incrementally"? | **Phase 1 · Task 4** (the dormant foundation) + the **entire Phase 4** gated structure | Phase 1 builds exactly this dormant foundation and Phase 4 is predicated on a YES. A "no — light up sub-unit isolation / ship depth speculatively now" answer expands Phase 1's RLS/testing scope materially and forces a costly Phase-4 re-plan. |

> **Spec §13 Q5 (platform subscription billing currency)** is not a blocking dependency of any phase here (the recommended YAGNI fixed-settlement-currency stands); it is noted for completeness and does not gate this program.

---

## Execution handoff

This plan is ready to execute. Two execution options, in order of preference:

1. **Subagent-driven development (recommended).** Use **superpowers:subagent-driven-development** to execute task-by-task with a fresh subagent per task — best for this program because each task is a self-contained TDD micro-loop with explicit verification, and the orchestrator keeps the master plan's checkboxes as the single source of truth while subagents stay focused. Run the cross-cutting standards check (above) at the start of every task; surface any failed gate immediately rather than proceeding.
2. **Inline executing-plans.** Use **superpowers:executing-plans** to work the checkboxes inline in one session with review checkpoints at each phase boundary — appropriate if you prefer a single continuous context over fan-out.

**Recommended start: Phase 0.** It is fully bite-sized, has no blocking open questions, ships pure correctness (closing the live D1–D18 holes in the empty 0-payroll/0-vat-return window before any tenant depends on the wrong model), and lays the fail-loud primitives (`REQUIRED_SENTINEL`, `get_base_currency()`, the no-stub gate) that Phase 1 builds on. Begin with Phase 0 Group 1 (the two unflagged bug fixes, D6 + D12), then Group 2 (fail-loud foundation), then the 🔴 statutory gate (Group 3), then money correctness (Group 4).

**When you reach Phases 1–4:** confirm dependencies merged + the named blocking open questions answered, then run **superpowers:writing-plans** to expand that phase into its own dated plan under `docs/superpowers/plans/` using the task list here as the skeleton, and execute it with subagent-driven-development. **Do not expand or start any Phase-4 work-stream until a signed customer triggers its specific gate** — "not started" is the correct state of Phase 4 until then.
