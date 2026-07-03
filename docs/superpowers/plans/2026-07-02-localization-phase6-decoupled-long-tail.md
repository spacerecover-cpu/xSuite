# Localization Phase 6 — Decoupled Long Tail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the tax-critical-path-independent long tail of the global localization program — country-driven payroll (Oman PASI + real WPS SIF), data-driven bank-file formats, regime-parameterized privacy/DSR, late-payment/dunning keys, and an unclaimed-device disposal legality gate — each as an independently-shippable work package so a lab following the app can never destroy a device unlawfully or run wrong-money payroll.

**Architecture:** Every statutory rule becomes DATA on the existing Country Engine registry (`src/lib/country/registry.ts`) + `geo_countries.country_config` jsonb + country-scoped master seeds, consumed through registered regime plugins (`src/lib/regimes/`) resolved by `regime.*` config keys. New enforcement (disposal legality) lands as a SECURITY DEFINER RPC plus an un-skippable BEFORE-INSERT trigger backstop on the append-only `chain_of_custody` ledger. No new tax math — Phase 6 sits entirely off the tax kernel and reuses `resolveRateContext`/`buildPayrollBaseColumns`/`master_currency_codes` decimals.

**Tech Stack:** React 18 + TypeScript + Vite; Supabase Postgres 15 (RLS, SECURITY DEFINER RPCs, triggers, pg_cron); TanStack Query v5; Vitest 4 + Testing Library; pdfmake; Zod (registry schemas); `mcp__supabase__apply_migration` for all DDL (project_id `ssmbegiyjivrcwgcqutu`).

**Entry criteria (must be merged/true before starting):**
- **Phase 0** merged: `anonymize_customer_data` rewritten against real `customers_enhanced` columns; `export_customer_data` column-allowlisted (no `to_jsonb(c.*)`, no `portal_password_hash`); payroll 7%-PASI/USD-WPS behind loud not-configured errors; `tenantToday()` helper (`src/lib/tenantToday.ts`) shipped; `geo_countries.data_protection_regime` + `requires_local_residency` seeded; `tenants.data_residency_region` `global-1` invariant enforced; registry↔mapper parity CI gate live.
- **Phase 1** merged: `src/lib/regimes/types.ts` + `src/lib/regimes/registry.ts` (the plugin kernel: `RegimePluginKind`, `registerRegimePlugin`, `resolveTaxStrategy`, `CountryConfigError`); the five `regime.*` country config keys incl. `regime.payroll` (codedDefault `'none'`); reserved pack keys `custody.unclaimed_property` and `privacy.regime` present in `COUNTRY_CONFIG_REGISTRY` (reserved stubs); `master_engine_capabilities` table live; `master_country_pack_versions`/`master_country_pack_tests` + `publishGate` machinery (minimal).
- **Phase 3** merged: Country Authoring Studio + `publish_country_pack` RPC + capability manifest + staleness dashboard (needed only by WP-F's data-only intake proof).
- `npm run typecheck` = 0 errors; `npm run test` green on main.

---

## Global Constraints — verbatim repo rules every task inherits

- **Additive-only migrations.** No `DROP TABLE`, no `DROP COLUMN`, no `DELETE FROM` on production data. Dropping and re-adding a UNIQUE **constraint** (not data) is permitted where a task says so. Soft deletes only (`deleted_at = now()`), never hard deletes.
- **Every new tenant-scoped table** gets: `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`; `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`; RESTRICTIVE `{table}_tenant_isolation` policy (`tenant_id = get_current_tenant_id() OR is_platform_admin()`); PERMISSIVE op policies (financial/HR writes gated `has_role('accounts')`/`has_role('hr')`, rest `is_staff_user()`); `set_<table>_tenant_and_audit` trigger; `CREATE INDEX idx_<table>_tenant_id ON <table>(tenant_id) WHERE deleted_at IS NULL`; `deleted_at timestamptz DEFAULT NULL`.
- **Global master tables** (`master_*`, `geo_*`): SELECT `USING(true)` for authenticated; INSERT/UPDATE/DELETE via `is_platform_admin()` only.
- **`database.types.ts` is generated** — never hand-edit. Regenerate via `mcp__supabase__generate_typescript_types` after **every** migration and save to `src/types/database.types.ts`.
- **Migration discipline per PR:** apply via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) → regen types → update ALL callers → append a manifest row to `supabase/migrations.manifest.md` (`| <version> | <filename> | <classification> | <summary> | <PR> |`) → fill `.github/PULL_REQUEST_TEMPLATE/migration.md`.
- **`npm run typecheck` must stay at 0 errors** (`scripts/check-tsc.sh` fails any `^src/` diagnostic).
- **`maybeSingle()` never `single()`**; import `Database` from `src/types/database.types.ts` only (never `src/types/database.ts`).
- **pdfmake-only PDFs**; `lucide-react` icons only; semantic theme tokens only (no `bg-blue-*`/`bg-purple-*`/brand hex); no new npm packages without checking existing.
- **Custody/audit tables are append-only** (REVOKE UPDATE/DELETE + `prevent_audit_mutation`). Never weaken. A BEFORE-INSERT trigger that *blocks* an unlawful insert is permitted (it mutates nothing existing).
- **Financial/custody service writes preserve v1.2.0 custody 'financial' events** — never remove a `log_chain_of_custody` call.
- **No `if (countryCode === …)` branching outside `src/lib/regimes/`** (eslint `xsuite/no-country-branching-outside-regimes`, Phase 1). All country divergence is DATA or a registered plugin.

---

## Objectives

> Each objective is owned by exactly one work package (`(WP-x)` tag); the Acceptance Criteria bullets carry the same tags. Read the `(WP-x)` tag on an Objective and the matching-tagged Acceptance bullet(s) together with that WP's header (Independence + tasks + Estimated-Effort row) for the per-package objectives/acceptance/effort the phase brief asks for.

1. **(WP-A) Payroll runs per-country from data:** Oman PASI social-insurance components (employee + employer + job-security) as country-scoped `master_payroll_components`, consumed by a registered `om_payroll` PayrollPack; `processPayroll` emits itemized `payroll_record_items` rows (earnings + one per statutory component); the hardcoded 7% is gone.
2. **(WP-B) Bank files are real and data-driven:** a format-descriptor registry (`om_wps_sif`, `us_nacha`, `uk_bacs`) with honesty rows in `master_engine_capabilities`; WPS output is a genuine SIF with tenant base currency + correct minor-unit decimals — no `'USD'`/`'Bank Muscat'` literals.
3. **(WP-C) Privacy is regime-parameterized:** DSRs carry a regime + a regime-derived statutory `due_date` + identity-verification fields; retention policies carry regime-derived statutory floors + legal holds; UI labels/annotations are regime-neutral (no durable "per GDPR request" on PDPL data).
4. **(WP-D) Late payment is expressible as data:** `late_payment.*`/`credit_terms.*` country-locked registry keys (interest basis, reference-rate source, fixed indemnity, grace/net-days, dunning schedule); a pure interest-accrual engine; per-customer credit terms + tenant default net-days.
5. **(WP-E) Device disposal is lawful-by-construction:** `custody.unclaimed_property` pack dimension (holding period, notice schedule + template, storage-fee accrual, lien rights) drives a retention clock, a `disposal_notice` follow-up type, and a **per-country legality gate** enforced by a `dispose_case_device` RPC + a BEFORE-INSERT `chain_of_custody` trigger backstop that blocks any `custody_status='disposed'` write before the holding period elapses and before required notices are served.
6. **(WP-F) Country N = days, not weeks:** a documented, tested data-only country-intake runbook proving a simple-VAT country publishes through the Studio machine gate with zero deploy.

## Non-goals

- **Platform → tenant subscription billing** (Gap 3): a completely separate workstream. It reuses these currency/tax/localization primitives but MUST NOT appear in Phase 6 beyond this line.
- **Tax kernel / `issue_tax_document` / returns / e-invoice transports** — Phases 1–5; Phase 6 is off the tax critical path.
- **Full statutory payroll-report/return builders** (UK RTI/FPS, India Form 16/24Q, GOSI/PASI filing artifacts) — a later Document-Studio export layer; Phase 6 ships the itemized run + the WPS SIF payment artifact only.
- **EOSB/gratuity accrual, income-tax/PAYE/TDS/FICA withholding engines, holiday calendars, non-monthly pay frequencies, per-employee functional-currency payroll** — deferred (spec §1.11 High/Medium items beyond the phase brief).
- **Dunning PDF document types** (`payment_reminder` letters, `statement_of_account`), the storage-limitation purge executor, the customer-consent ledger, the breach-incident register — deferred (spec §1.15/§1.12 Medium/Low items); Phase 6 ships the *keys, clocks, and gates*, not those document surfaces.
- **Statutory audit-file exports** (FEC/SAF-T/GoBD, Appendix E q9) — reserved pack key only, no implementation.
- **Second Supabase residency region** — `global-1` invariant holds (Phase 0); regional routing is a future infra project.

## Architecture Decisions

**AD-1 — Statutory payroll is country DATA behind one PayrollPack plugin, not per-country code.**
Decision: seed PASI as `master_payroll_components` rows with `country_id`, resolve the tenant's pack via the `regime.payroll` config key → `resolvePayrollPack(key)`, and have `processPayroll` iterate `pack.statutoryComponents(ctx)`.
Rationale: matches the audit's "statutory payroll should become per-country data packs through the existing registry" (§1.11) and the `xsuite/no-country-branching-outside-regimes` gate; a new country = seed rows + optional thin plugin.
Rejected: a `tax_calculation_method` column switch / hardcoded per-country `if` blocks — the exact anti-pattern the audit flags (dead column, 7% everywhere).

**AD-2 — Uniqueness on master seeds becomes `(name, country_id)` partial-unique, not a new table.**
Decision: drop `UNIQUE(name)` on `master_payroll_components`/`master_leave_types`; add `UNIQUE(name, country_id) WHERE deleted_at IS NULL`.
Rationale: lets India "Income Tax" and Oman "PASI" coexist; both tables already carry `country_id`/`region_id` FKs (verified live). Zero data loss.
Rejected: tenant-scoped copy tables at onboarding — larger surface than the phase brief's "uniqueness → (name, country_id) + country-scoped seeds"; deferred as a spec "fix direction", not this phase's scope.

**AD-3 — Bank-file formats are descriptor objects in a registry, keyed by capability, not a `switch`.**
Decision: `BankFileDescriptor` objects in `src/lib/payroll/bankFile/`, one per format; `generateBankFile` resolves by `file_format`; each descriptor declares its `capability_key` matched against `master_engine_capabilities` (kind `'bank_file_op'`).
Rationale: the audit's "pluggable bank-file format registry keyed by country/bank reading tenant base currency + real decimals"; `payroll_bank_files.file_format` already stores the format as data.
Rejected: extending `generateWPSFileContent` in place — keeps the `'USD'`/`'Bank Muscat'` literals and the ignored-format-arg bug.

**AD-4 — Privacy varies by a `data_protection_regime` seeded on `geo_countries` (Phase 0) + a `privacy.regime` config key, consumed by the DSR module.**
Decision: DSRs snapshot the regime + a regime-derived `due_date`; retention floors derive from the regime; UI labels read the resolved regime.
Rationale: the audit's "seed the regime … expose in TenantConfigContext as the module's switch"; builds directly on the Phase 0 hotfixes (broken erasure RPC + leaking export already fixed).
Rejected: hardcoding GDPR windows — the durable "per GDPR request" annotation is a false legal citation for PDPL/DPDP tenants (§1.12).

**AD-5 — Disposal legality is enforced at TWO layers: a lawful-path RPC and an un-skippable ledger trigger.**
Decision: `dispose_case_device` RPC validates holding-period-elapsed against the country pack + an explicit legality confirmation, then logs the `custody_status='disposed'` event stamping `metadata.legality_gate_passed=true`; a BEFORE-INSERT trigger on `chain_of_custody` REJECTS any `disposed` write lacking that stamp.
Rationale: a lab following the app flow must never destroy a device unlawfully (owner decision 8, domain-critical). The trigger fires even for SECURITY DEFINER writes and raw PostgREST, so the gate cannot be bypassed. `chain_of_custody` stays append-only (the trigger blocks inserts; it mutates nothing).
**Consequence — every `custody_status='disposed'` write MUST route through `dispose_case_device`** (which arms the txn-local `app.disposal_gate_passed` flag). The existing custody disposal path `log_case_checkout` was inspected and today emits only `custody_status='checked_out'`/`'checked_out'` events (never `'disposed'`), so the new backstop does NOT break checkout; Task 21 Step 1 re-probes this so the assumption is verified at execution time. Should any future writer (including `log_case_checkout`) ever need to emit `'disposed'`, it must call `dispose_case_device` / arm the gate flag rather than INSERT directly, or the trigger will (correctly) reject it.
Rejected: UI-only guard (same class of defect as `deleteInvoice`'s browser-only gate, §1.13) — legally unacceptable for device destruction.

**AD-6 — Country-locked Phase-6 keys resolve from the country layer, read directly from `geo_countries.country_config` in DB gates.**
Decision: `custody.unclaimed_property`, `late_payment.*`, `credit_terms.*` are `maxOverrideLayer:'country'`; TS consumers use `resolveCountryConfigKey(layers, key)`; DB gates read `geo_countries.country_config->'<key>'` via the case's tenant `country_id`.
Rationale: for country-locked keys the country layer IS the effective value (tenant overrides are server-rejected), so gates need no snapshot mapper and cannot drift.
Rejected: threading every key through the `_apply_country_config` snapshot mapper — unnecessary coupling for country-locked keys; the parity gate covers snapshot keys, and read-time resolution is authoritative.

## Database Changes

| Migration (name) | Purpose | Tables touched |
|---|---|---|
| `p6_master_payroll_leave_uniqueness_country` | Drop `UNIQUE(name)`, add partial `UNIQUE(name, country_id) WHERE deleted_at IS NULL` | `master_payroll_components`, `master_leave_types` |
| `p6_seed_oman_payroll_leave_packs` | Country-scoped PASI components + Oman leave seeds + `regime.payroll='om_payroll'` for OM (data) | `master_payroll_components`, `master_leave_types`, `geo_countries` |
| `p6_seed_bank_file_op_capabilities` | Honesty rows: `om_wps_sif`/`us_nacha`/`uk_bacs` (kind `bank_file_op`) | `master_engine_capabilities` |
| `p6_dsr_regime_due_date_verification` | DSR regime + statutory `due_date` + identity-verification cols | `data_subject_requests` |
| `p6_retention_statutory_floor_legal_hold` | Retention statutory-floor + `legal_hold` cols + floor CHECK trigger | `data_retention_policies` |
| `p6_late_payment_keys_registry_parity` | Re-generate `validate_country_config_overrides()` to lock the new country-locked `late_payment.*`/`credit_terms.max_net_days` keys (registry↔trigger parity) | (trigger fn) |
| `p6_case_follow_ups_dunning_linkage` | `case_follow_ups.invoice_id` + `dunning_level` + index | `case_follow_ups` |
| `p6_customers_credit_terms` | Per-customer `payment_terms_days` (net-days) | `customers_enhanced` |
| `p6_seed_late_payment_credit_terms_config` | Seed `late_payment.*`/`credit_terms.*` into `geo_countries.country_config` (data) | `geo_countries` |
| `p6_seed_unclaimed_property_config` | Seed `custody.unclaimed_property` into `geo_countries.country_config` (data) | `geo_countries` |
| `p6_dispose_case_device_rpc_and_gate` | `dispose_case_device` RPC + `assert_lawful_disposal` BEFORE-INSERT trigger on `chain_of_custody` | `chain_of_custody` (trigger only) |

All migrations are additive. The two `UNIQUE` swaps drop a **constraint object** (not rows) and immediately re-add a stricter partial unique in the same migration.

## Backend Implementation

- **`src/lib/regimes/types.ts`** (Phase 1 file, extended): add `PayrollPack` interface (verbatim from the interface contract §1.4).
- **`src/lib/regimes/registry.ts`** (Phase 1 file, extended): add `'payroll'` to `RegimePluginKind`; add `resolvePayrollPack(key)`.
- **`src/lib/regimes/om_payroll/index.ts`** (new): the Oman PayrollPack plugin + `fixtures/`.
- **`src/lib/payroll/bankFile/`** (new): `types.ts` (`BankFileDescriptor`), `wpsSif.ts`, `nacha.ts`, `bacs.ts`, `registry.ts` (`resolveBankFileDescriptor`).
- **`src/lib/payrollService.ts`** (modified): `processPayroll` assembles gross from components + writes `payroll_record_items`; `generateBankFile`/`generateWPSFileContent` delegate to the descriptor registry.
- **`src/lib/privacyRegime.ts`** (new): `resolveDsrDueDate`, `resolveRetentionFloor`, `regimeLabel` (pure, regime-keyed).
- **`src/lib/gdprService.ts`** (modified): DSR create stamps regime + due_date; retention upsert respects floor + legal hold.
- **`src/lib/latePayment.ts`** (new): `computeLatePaymentInterest`, `resolveCreditTerms` (pure).
- **`src/lib/unclaimedDevice.ts`** (new): `resolveRetentionClock`, `isDisposalLawful` (pure, mirrors the SQL gate).
- **`src/lib/country/registry.ts`** (modified): add `ConfigDomain` values `'privacy' | 'receivables' | 'custody'`; add the `late_payment.*`, `credit_terms.*`, `custody.unclaimed_property` (full-schema, replacing any reserved stub), and `privacy.regime` (consumer) registry keys.

## Frontend Implementation

- **`src/pages/payroll/PayrollPeriodDetailPage.tsx`** (modified, lines 80/85): call the new bank-file generator; render itemized `payroll_record_items` in the payslip drill-down.
- **`src/pages/settings/GDPRCompliancePage.tsx`** (modified): show the resolved regime label + computed `due_date`; require identity verification before export.
- **`src/config/settingsCategories.ts`** (modified, ~line 268): regime-neutral naming ("Data Protection & Compliance").
- **`src/components/cases/InvoiceFormModal.tsx`** (modified): default `due_date` from resolved credit-terms net-days.
- **`src/pages/cases/CaseDetail.tsx`** + a new **`src/components/cases/DisposeDeviceModal.tsx`** (new): disposal action gated on the retention clock; disabled with a reason until lawful.
- **`docs/runbooks/country-data-only-intake.md`** (new): WP-F runbook.

## APIs & Services — exact signatures this phase creates/changes

```typescript
// src/lib/regimes/types.ts  (ADD — verbatim from interface contract §1.4)
export interface PayrollPack {
  readonly key: string;                              // 'om_payroll'
  readonly version: string;                          // semver
  statutoryComponents(ctx: { countryId: string; asOf: string }): Array<{
    componentCode: string; kind: 'earning' | 'deduction' | 'employer_contribution';
    rate: number | null; base: 'gross' | 'basic'; mandatory: boolean;
  }>;
  bankFileOps: string[];                             // capability keys: 'om_wps_sif','us_nacha','uk_bacs'
}

// src/lib/regimes/registry.ts  (ADD)
export function resolvePayrollPack(key: string): PayrollPack;   // throws CountryConfigError on unregistered key

// src/lib/payroll/bankFile/types.ts  (NEW)
export interface BankFileRecord {
  employeeNumber: string; employeeName: string; iban: string | null;
  bankAccountNumber: string; bankName: string | null; netSalary: number;
}
export interface BankFileContext {
  currencyCode: string; decimalPlaces: number; employerName: string;
  periodName: string; payDate: string;               // 'YYYY-MM-DD'
}
export interface BankFileDescriptor {
  readonly formatKey: string;                        // 'WPS' | 'ACH' | 'BACS'
  readonly capabilityKey: string;                    // 'om_wps_sif' | 'us_nacha' | 'uk_bacs'
  readonly fileExtension: string;                    // 'sif' | 'ach' | 'txt'
  build(records: BankFileRecord[], ctx: BankFileContext): string;
}

// src/lib/payroll/bankFile/registry.ts  (NEW)
export function resolveBankFileDescriptor(formatKey: string): BankFileDescriptor;  // throws on unknown

// src/lib/privacyRegime.ts  (NEW)
export type DataProtectionRegime = 'gdpr' | 'pdpl' | 'dpdp' | 'none';
export function resolveDsrDueDate(regime: DataProtectionRegime, requestType: string, createdAt: string): string; // 'YYYY-MM-DD'
export function resolveRetentionFloorDays(regime: DataProtectionRegime, recordClass: string): number;
export function regimeLabel(regime: DataProtectionRegime): string;

// src/lib/latePayment.ts  (NEW)
export interface CreditTerms { defaultNetDays: number; maxNetDays: number | null; }
export interface LatePaymentPolicy {
  interestBasis: 'reference_plus_margin' | 'fixed' | 'none';
  referenceRate: number; marginPoints: number; fixedIndemnity: number; graceDays: number;
}
export function resolveCreditTerms(config: Record<string, unknown>): CreditTerms;
export function computeLatePaymentInterest(args: {
  principal: number; dueDate: string; asOf: string; policy: LatePaymentPolicy; decimalPlaces: number;
}): { interest: number; indemnity: number; daysLate: number };

// src/lib/unclaimedDevice.ts  (NEW)
export interface UnclaimedPropertyPolicy {
  holdingPeriodDays: number; noticeScheduleDays: number[]; noticeTemplateKey: string | null;
  storageFeeAccrual: { amount: number; per: 'day' | 'month' } | null;
  lienRights: boolean; disposalRequiresLegalityGate: boolean;
}
export function resolveUnclaimedPropertyPolicy(config: Record<string, unknown>): UnclaimedPropertyPolicy | null;
export function resolveRetentionClock(args: {
  policy: UnclaimedPropertyPolicy; custodyStartDate: string; asOf: string;
}): { daysHeld: number; daysUntilLawfulDisposal: number; disposalLawful: boolean };

// DB RPC (NEW) — src/lib/caseService.ts wrapper `disposeCaseDevice`
// dispose_case_device(p_case_id uuid, p_device_id uuid, p_reason text, p_confirm_legality boolean) RETURNS void
```

Changed service signatures:
```typescript
// src/lib/payrollService.ts
generateBankFile(periodId: string, format: 'WPS' | 'ACH' | 'BACS' | 'custom' = 'WPS')  // format now honored
// generateWPSFileContent REMOVED (replaced by resolveBankFileDescriptor('WPS').build)

// src/lib/gdprService.ts
createDataSubjectRequest(request, regime: DataProtectionRegime): Promise<DataSubjectRequest>  // stamps due_date

// src/lib/caseService.ts  (ADD)
disposeCaseDevice(caseId: string, deviceId: string, reason: string, confirmLegality: boolean): Promise<void>
```

---

## File-by-File Implementation Tasks

> Work packages are **independent and parallel-executable**. Cross-package independence is called out per WP. Within a WP, tasks are ordered. Tasks are numbered globally (Task 1..N).
>
> **Cross-package independence matrix:**
> - **WP-A** (payroll pack) & **WP-B** (bank files) both touch `src/lib/payrollService.ts` but disjoint regions (A: `processPayroll` ~320–476; B: `generateBankFile`/`generateWPSFileContent` ~888–936). Land A before B if merging to the same branch; otherwise fully independent PRs (resolve the one-file overlap at merge).
> - **WP-C** (privacy), **WP-D** (late payment), **WP-E** (unclaimed device), **WP-F** (runbook) are file-disjoint from A/B and from each other. Any order, any parallelism.
> - All WPs share `src/lib/country/registry.ts` only for **appending** registry entries (C adds `privacy.regime`; D adds `late_payment.*`/`credit_terms.*`; E adds `custody.unclaimed_property`) — append-only edits at distinct array positions; trivially mergeable.

---

## WP-A — PayrollPack interface + Oman PASI pack

**Independence:** self-contained except the shared one-file overlap with WP-B in `payrollService.ts` (disjoint regions). Consumes Phase-1 `src/lib/regimes/{types,registry}.ts` and the `regime.payroll` config key.

### Task 1: Country-scope the master payroll/leave uniqueness

**Files:**
- Migration (via `mcp__supabase__apply_migration`): `p6_master_payroll_leave_uniqueness_country`
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `supabase/migrations.manifest.md` (append row)
- Test: SQL probes via `mcp__supabase__execute_sql`

**Interfaces:**
- Consumes: live `master_payroll_components` (UNIQUE(name)), `master_leave_types` (UNIQUE(name)), both with `country_id uuid`, `deleted_at timestamptz`.
- Produces: partial unique `(name, country_id) WHERE deleted_at IS NULL` on both — lets country-scoped statutory rows share a name across countries.

- [ ] **Step 1: Probe the current (blocking) state**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid IN ('master_payroll_components'::regclass,'master_leave_types'::regclass)
  AND contype='u';
```
Expected: two rows — `master_payroll_components_name_key = UNIQUE (name)` and `master_leave_types_name_key = UNIQUE (name)`. This proves a country-scoped "PASI Employee Contribution" cannot coexist with any other country's rows sharing a name.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` name `p6_master_payroll_leave_uniqueness_country`:
```sql
-- Country-scope master payroll/leave uniqueness so statutory packs can share names across countries.
ALTER TABLE public.master_payroll_components DROP CONSTRAINT IF EXISTS master_payroll_components_name_key;
ALTER TABLE public.master_leave_types      DROP CONSTRAINT IF EXISTS master_leave_types_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_payroll_components_name_country
  ON public.master_payroll_components (name, country_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_leave_types_name_country
  ON public.master_leave_types (name, country_id)
  WHERE deleted_at IS NULL;
```

- [ ] **Step 3: Probe the post-state**

```sql
SELECT indexname FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('uq_master_payroll_components_name_country','uq_master_leave_types_name_country');
```
Expected: both index names returned. Re-run the Step-1 probe: expected zero `UNIQUE(name)` constraint rows remain.

- [ ] **Step 4: Regenerate types**

Run `mcp__supabase__generate_typescript_types` and overwrite `src/types/database.types.ts`. Then `npm run typecheck` — Expected: `0 errors`.

- [ ] **Step 5: Append the manifest row**

Add to `supabase/migrations.manifest.md`:
```
| <applied_version> | p6_master_payroll_leave_uniqueness_country.sql | Additive | Country-scope master payroll/leave uniqueness → partial UNIQUE(name, country_id) | <PR> |
```

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(payroll): country-scope master payroll/leave uniqueness"
```

### Task 2: Seed the Oman PASI payroll pack + Oman leave seeds (country data)

**Files:**
- Migration: `p6_seed_oman_payroll_leave_packs`
- Modify: `supabase/migrations.manifest.md`
- Test: SQL probes

**Interfaces:**
- Consumes: `geo_countries.code = 'OM'`; the country-scoped uniqueness from Task 1; `master_payroll_components.type CHECK IN ('earning','deduction','employer_contribution')`.
- Produces: Oman-scoped `master_payroll_components` CATALOG rows (linked to `payroll_record_items.component_id` in Task 5) + Oman-scoped `master_leave_types` rows; `geo_countries.country_config->>'regime.payroll' = 'om_payroll'` for OM (the country-locked key the pack resolves from). **Statutory RATES are pack DATA in the `om_payroll` plugin subject to statutory review (owner E1) — `master_payroll_components` has no rate column, so the catalog carries component identity, the plugin carries rates.**

- [ ] **Step 1: Probe the current (empty) state**

```sql
SELECT count(*) AS oman_components
FROM master_payroll_components c JOIN geo_countries g ON g.id=c.country_id
WHERE g.code='OM' AND c.deleted_at IS NULL;
```
Expected: `0` — no country-scoped Oman components exist (only the 14 global country_id-NULL rows).

- [ ] **Step 2: Apply the seed migration**

`mcp__supabase__apply_migration` name `p6_seed_oman_payroll_leave_packs`:
```sql
-- Oman PASI social-insurance components as country DATA (replaces the hardcoded 7%).
-- Rates are pack data pending statutory review (owner decision E1).
INSERT INTO public.master_payroll_components (name, type, description, is_taxable, is_mandatory, is_active, sort_order, country_id)
SELECT v.name, v.type, v.description, false, true, true, v.sort_order, g.id
FROM geo_countries g
CROSS JOIN (VALUES
  ('PASI Employee Contribution',  'deduction',              'Public Authority for Social Insurance — employee share (7% of gross).', 10),
  ('PASI Employer Contribution',  'employer_contribution',  'PASI — employer share (10.5% of gross).',                                20),
  ('Job Security Employee',       'deduction',              'Job Security Fund — employee share (1% of gross).',                      30),
  ('Job Security Employer',       'employer_contribution',  'Job Security Fund — employer share (1% of gross).',                      40)
) AS v(name, type, description, sort_order)
WHERE g.code='OM'
ON CONFLICT DO NOTHING;

-- Oman labour-law leave seeds, country-scoped.
INSERT INTO public.master_leave_types (name, description, default_days, is_paid, is_active, sort_order, country_id)
SELECT v.name, v.description, v.default_days, v.is_paid, true, v.sort_order, g.id
FROM geo_countries g
CROSS JOIN (VALUES
  ('Annual Leave',    'Oman: 30 calendar days per year.',                 30, true,  10),
  ('Sick Leave',      'Oman: graduated sick leave per Labour Law.',       10, true,  20),
  ('Maternity Leave', 'Oman: 98 days maternity leave.',                   98, true,  30),
  ('Hajj Leave',      'Oman: up to 15 days once during service.',         15, true,  40)
) AS v(name, description, default_days, is_paid, sort_order)
WHERE g.code='OM'
ON CONFLICT DO NOTHING;

-- Point the Oman country pack at the om_payroll plugin. regime.payroll is
-- country-locked (AD-6), so the Oman tenant resolves this value directly from the
-- country layer; without this seed the tenant resolves 'none' and the pack never
-- loads (the "pack may never resolve" gap).
UPDATE public.geo_countries
SET country_config = country_config || jsonb_build_object('regime.payroll', 'om_payroll')
WHERE code = 'OM';
```

- [ ] **Step 3: Probe the post-state**

```sql
SELECT c.name, c.type FROM master_payroll_components c JOIN geo_countries g ON g.id=c.country_id
WHERE g.code='OM' AND c.deleted_at IS NULL ORDER BY c.sort_order;
```
Expected: 4 rows — `PASI Employee Contribution/deduction`, `PASI Employer Contribution/employer_contribution`, `Job Security Employee/deduction`, `Job Security Employer/employer_contribution`.

Then verify the pack key resolves for the Oman tenant (this is the runtime source `resolvePayrollPackKey` reads):
```sql
SELECT country_config->>'regime.payroll' AS payroll_pack FROM geo_countries WHERE code='OM';
```
Expected: `om_payroll` — proving the Oman tenant's `processPayroll` will resolve `resolvePayrollPack('om_payroll')` (not `'none'`).

- [ ] **Step 4: Regenerate types + typecheck**

`mcp__supabase__generate_typescript_types` → save; `npm run typecheck` → `0 errors` (data-only migration; types unchanged but regen per discipline).

- [ ] **Step 5: Append manifest row**
```
| <applied_version> | p6_seed_oman_payroll_leave_packs.sql | Additive | Seed Oman PASI payroll components + Oman leave types (country data) | <PR> |
```

- [ ] **Step 6: Commit**
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(payroll): seed Oman PASI + leave packs as country data"
```

### Task 3: `PayrollPack` interface + `resolvePayrollPack`

**Files:**
- Modify: `src/lib/regimes/types.ts` (append the interface)
- Modify: `src/lib/regimes/registry.ts` (add `'payroll'` kind + resolver)
- Test: `src/lib/regimes/registry.test.ts` (append cases)

**Interfaces:**
- Consumes: Phase-1 `RegimePluginKind`, `registerRegimePlugin`, `CountryConfigError` from `src/lib/regimes/registry.ts`.
- Produces: `PayrollPack` type + `resolvePayrollPack(key: string): PayrollPack` (throws `CountryConfigError` on unregistered key).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/regimes/registry.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { registerRegimePlugin, resolvePayrollPack } from './registry';
import type { PayrollPack } from './types';

describe('resolvePayrollPack', () => {
  const stub: PayrollPack = {
    key: 'test_payroll',
    version: '1.0.0',
    statutoryComponents: () => [
      { componentCode: 'X', kind: 'deduction', rate: 0.07, base: 'gross', mandatory: true },
    ],
    bankFileOps: ['om_wps_sif'],
  };

  it('resolves a registered payroll pack', () => {
    registerRegimePlugin('payroll', stub);
    expect(resolvePayrollPack('test_payroll')).toBe(stub);
  });

  it('throws CountryConfigError for an unregistered key', () => {
    expect(() => resolvePayrollPack('no_such_pack')).toThrow(/no_such_pack/);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/registry.test.ts`
Expected: FAIL — `resolvePayrollPack` is not exported (`TypeError: resolvePayrollPack is not a function` / import error).

- [ ] **Step 3: Minimal implementation**

Append to `src/lib/regimes/types.ts`:
```typescript
export interface PayrollPack {
  readonly key: string;
  readonly version: string;
  statutoryComponents(ctx: { countryId: string; asOf: string }): Array<{
    componentCode: string;
    kind: 'earning' | 'deduction' | 'employer_contribution';
    rate: number | null;
    base: 'gross' | 'basic';
    mandatory: boolean;
  }>;
  bankFileOps: string[];
}
```

In `src/lib/regimes/registry.ts`: add `'payroll'` to the `RegimePluginKind` union, and append the resolver (mirroring the existing `resolveTaxStrategy` pattern):
```typescript
import type { PayrollPack } from './types';

export function resolvePayrollPack(key: string): PayrollPack {
  const plugin = getRegistered('payroll', key); // same lookup helper resolveTaxStrategy uses
  if (!plugin) {
    throw new CountryConfigError(`No registered payroll pack for key '${key}'`);
  }
  return plugin as PayrollPack;
}
```
(If Phase 1's registry stores plugins in a `Map<RegimePluginKind, Map<string, unknown>>`, reuse that map exactly as `resolveTaxStrategy` does; do not invent a second store.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/registry.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**
```bash
git add src/lib/regimes/types.ts src/lib/regimes/registry.ts src/lib/regimes/registry.test.ts
git commit -m "feat(regimes): add PayrollPack interface + resolvePayrollPack"
```

### Task 4: `om_payroll` PayrollPack plugin + golden fixtures

**Files:**
- Create: `src/lib/regimes/om_payroll/index.ts`
- Create: `src/lib/regimes/om_payroll/fixtures/oman-basic.json`
- Test: `src/lib/regimes/om_payroll/index.test.ts`

**Interfaces:**
- Consumes: `PayrollPack` (Task 3); `registerRegimePlugin` (Phase 1).
- Produces: an `omPayrollPack: PayrollPack` object with `key='om_payroll'`, registered on import; `statutoryComponents` returns the PASI + Job-Security component descriptors; `bankFileOps=['om_wps_sif']`; `OM_COMPONENT_CATALOG_NAMES` (pack componentCode → seeded catalog `name`) consumed by Task 5 for `component_id` linkage.

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/om_payroll/index.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { omPayrollPack } from './index';

describe('omPayrollPack', () => {
  it('declares the om_payroll key and WPS SIF bank op', () => {
    expect(omPayrollPack.key).toBe('om_payroll');
    expect(omPayrollPack.bankFileOps).toContain('om_wps_sif');
  });

  it('returns PASI + Job Security statutory components (no earnings)', () => {
    const comps = omPayrollPack.statutoryComponents({ countryId: 'om-id', asOf: '2026-07-01' });
    const codes = comps.map((c) => c.componentCode).sort();
    expect(codes).toEqual(['JOB_SECURITY_EMPLOYEE', 'JOB_SECURITY_EMPLOYER', 'PASI_EMPLOYEE', 'PASI_EMPLOYER']);
    const employee = comps.find((c) => c.componentCode === 'PASI_EMPLOYEE')!;
    expect(employee.kind).toBe('deduction');
    expect(employee.rate).toBe(0.07);
    expect(employee.base).toBe('gross');
    expect(employee.mandatory).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/om_payroll/index.test.ts`
Expected: FAIL — cannot resolve `./index` export `omPayrollPack`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/om_payroll/fixtures/oman-basic.json`:
```json
{
  "name": "oman_basic_monthly",
  "input": { "basicSalary": 1000, "gross": 1000, "currency": "OMR" },
  "expected": {
    "deductions": [
      { "componentCode": "PASI_EMPLOYEE", "amount": 70.0 },
      { "componentCode": "JOB_SECURITY_EMPLOYEE", "amount": 10.0 }
    ],
    "employerContributions": [
      { "componentCode": "PASI_EMPLOYER", "amount": 105.0 },
      { "componentCode": "JOB_SECURITY_EMPLOYER", "amount": 10.0 }
    ],
    "netSalary": 920.0
  }
}
```

Create `src/lib/regimes/om_payroll/index.ts`:
```typescript
import { registerRegimePlugin } from '../registry';
import type { PayrollPack } from '../types';

export const omPayrollPack: PayrollPack = {
  key: 'om_payroll',
  version: '1.0.0',
  statutoryComponents: () => [
    { componentCode: 'PASI_EMPLOYEE',         kind: 'deduction',             rate: 0.07,  base: 'gross', mandatory: true },
    { componentCode: 'PASI_EMPLOYER',         kind: 'employer_contribution', rate: 0.105, base: 'gross', mandatory: true },
    { componentCode: 'JOB_SECURITY_EMPLOYEE', kind: 'deduction',             rate: 0.01,  base: 'gross', mandatory: true },
    { componentCode: 'JOB_SECURITY_EMPLOYER', kind: 'employer_contribution', rate: 0.01,  base: 'gross', mandatory: true },
  ],
  bankFileOps: ['om_wps_sif'],
};

// Maps each pack componentCode to its seeded master_payroll_components `name`
// (Task 2) so processPayroll can link payroll_record_items.component_id to the
// country-scoped catalog. Pack data — the pack carries rates (no rate column on
// the catalog table), the catalog carries component identity.
export const OM_COMPONENT_CATALOG_NAMES: Record<string, string> = {
  PASI_EMPLOYEE: 'PASI Employee Contribution',
  PASI_EMPLOYER: 'PASI Employer Contribution',
  JOB_SECURITY_EMPLOYEE: 'Job Security Employee',
  JOB_SECURITY_EMPLOYER: 'Job Security Employer',
};

registerRegimePlugin('payroll', omPayrollPack);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/om_payroll/index.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**
```bash
git add src/lib/regimes/om_payroll
git commit -m "feat(regimes): om_payroll PayrollPack plugin + golden fixture"
```

### Task 5: `processPayroll` assembles statutory components + writes itemized `payroll_record_items`

**Files:**
- Modify: `src/lib/payrollService.ts:320-476` (the `processPayroll` method)
- Create: `src/lib/payrollService.itemization.test.ts`

**Interfaces:**
- Consumes: `resolvePayrollPack` (Task 3); `omPayrollPack` + `OM_COMPONENT_CATALOG_NAMES` (Task 4, registered by import); the country-locked `regime.payroll` value read from `geo_countries.country_config` by the tenant's `country_id` (AD-6); `getBaseCurrency`/`getCurrencyDecimals` (`currencyService.ts`); `roundMoney` (`financialMath.ts:13`); live `payroll_record_items` columns `{tenant_id, record_id, component_id, component_name, component_type, amount, is_taxable, sort_order}`; the country-scoped `master_payroll_components` catalog (Task 2); existing `resolveRateContext`/`buildPayrollBaseColumns`.
- Produces: for each processed employee, one `payroll_record_items` EARNING row per gross earning (Basic Salary + any overtime) AND one row per statutory component (`component_id` linked to the `master_payroll_components` catalog where the pack code maps to a seeded row); amounts rounded to the tenant currency's minor units; `total_deductions` = Σ deduction items; the Phase-0 loud-error rate guard (main pre-Phase-0 `?? 0.07`) is replaced by the pack-driven path.

- [ ] **Step 1: Write the failing test**

Create `src/lib/payrollService.itemization.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildStatutoryItems, buildEarningItems } from './payrollService';
import { omPayrollPack } from './regimes/om_payroll';

describe('buildStatutoryItems', () => {
  it('emits one deduction row per employee-side statutory component off gross', () => {
    const items = buildStatutoryItems({
      pack: omPayrollPack, countryId: 'om', asOf: '2026-07-01', gross: 1000, basic: 1000, decimalPlaces: 3,
    });
    const employeeDeductions = items.filter((i) => i.component_type === 'deduction');
    expect(employeeDeductions.map((i) => [i.component_name, i.amount])).toEqual([
      ['PASI_EMPLOYEE', 70],
      ['JOB_SECURITY_EMPLOYEE', 10],
    ]);
    const employer = items.filter((i) => i.component_type === 'employer_contribution');
    expect(employer.map((i) => [i.component_name, i.amount])).toEqual([
      ['PASI_EMPLOYER', 105],
      ['JOB_SECURITY_EMPLOYER', 10],
    ]);
  });

  it('rounds statutory amounts to the tenant currency decimals (OMR = 3dp)', () => {
    // 333.333 × 7% = 23.33331 → 23.333 at 3dp (NOT 23.33, which a hardcoded 2dp gives).
    const items = buildStatutoryItems({
      pack: omPayrollPack, countryId: 'om', asOf: '2026-07-01', gross: 333.333, basic: 333.333, decimalPlaces: 3,
    });
    const pasi = items.find((i) => i.component_name === 'PASI_EMPLOYEE')!;
    expect(pasi.amount).toBe(23.333);
  });

  it('returns no items when the pack key is "none"', () => {
    expect(buildStatutoryItems({ pack: null, countryId: 'x', asOf: '2026-07-01', gross: 500, basic: 500, decimalPlaces: 3 })).toEqual([]);
  });
});

describe('buildEarningItems', () => {
  it('itemizes basic salary and any extra earnings as earning rows', () => {
    const rows = buildEarningItems({ basic: 1000, extras: [{ name: 'Overtime', amount: 50 }], decimalPlaces: 3 });
    expect(rows).toEqual([
      { component_name: 'Basic Salary', component_type: 'earning', amount: 1000 },
      { component_name: 'Overtime', component_type: 'earning', amount: 50 },
    ]);
  });

  it('emits a Basic Salary earning row even with no extras (Earnings column is never empty)', () => {
    const rows = buildEarningItems({ basic: 750, decimalPlaces: 3 });
    expect(rows).toEqual([{ component_name: 'Basic Salary', component_type: 'earning', amount: 750 }]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/payrollService.itemization.test.ts`
Expected: FAIL — `buildStatutoryItems` is not exported from `payrollService.ts`.

- [ ] **Step 3: Minimal implementation**

> **Predecessor state (Phase 0).** Per Entry criteria, Phase 0 already replaced the silent `settings.social_security_rate ?? 0.07` default with a LOUD not-configured guard (it throws when the statutory rate is unset rather than assuming 7%). The main-branch line number cited here (`:355`) is the PRE-Phase-0 reference; at execution time locate the Phase-0 loud-error guard in `processPayroll` and replace THAT with the pack-driven path below. Net effect is identical: no code path applies a hardcoded 7%.

Add the exported pure helpers near the top of `src/lib/payrollService.ts` (module scope, before `export const payrollService`):
```typescript
import type { PayrollPack } from './regimes/types';
import { roundMoney } from './financialMath';

export interface StatutoryItem {
  component_name: string;
  component_type: 'earning' | 'deduction' | 'employer_contribution';
  amount: number;
}

// Itemize gross earnings (basic + any extra earnings, e.g. overtime) so the payslip
// renders a REAL Earnings column — not an always-empty list.
export function buildEarningItems(args: {
  basic: number;
  extras?: Array<{ name: string; amount: number }>;
  decimalPlaces: number;
}): StatutoryItem[] {
  const rows: StatutoryItem[] = [
    { component_name: 'Basic Salary', component_type: 'earning', amount: roundMoney(args.basic, args.decimalPlaces) },
  ];
  for (const e of args.extras ?? []) {
    if (e.amount > 0) rows.push({ component_name: e.name, component_type: 'earning', amount: roundMoney(e.amount, args.decimalPlaces) });
  }
  return rows;
}

// Statutory deductions/contributions from the resolved pack. Amounts round to the
// TENANT currency's minor units (OMR = 3dp) — never a hardcoded 2dp.
export function buildStatutoryItems(args: {
  pack: PayrollPack | null;
  countryId: string;
  asOf: string;
  gross: number;
  basic: number;
  decimalPlaces: number;
}): StatutoryItem[] {
  if (!args.pack) return [];
  return args.pack.statutoryComponents({ countryId: args.countryId, asOf: args.asOf }).map((c) => {
    const rateBase = c.base === 'gross' ? args.gross : args.basic;
    const amount = c.rate == null ? 0 : roundMoney(rateBase * c.rate, args.decimalPlaces);
    return { component_name: c.componentCode, component_type: c.kind, amount };
  });
}
```

**Architecture note (where rates live).** `master_payroll_components` has NO rate column (verified: `name/type/description/is_taxable/is_mandatory/is_active/sort_order/country_id/region_id`). Statutory RATES are therefore pack DATA — versioned, fixture-tested, owner-E1-validatable — inside the `om_payroll` plugin (AD-1: "country DATA behind one PayrollPack plugin"; the plugin, not a per-employee `?? 0.07`, is the source). The seeded `master_payroll_components` rows are the country-scoped component CATALOG (surfaced in HR/reporting); `payroll_record_items.component_id` is linked back to them below so items are joinable to the catalog (identity) while the pack supplies amounts (computation).

Then rewrite the deduction math inside `processPayroll` (replacing the Phase-0 loud-error rate guard — main pre-Phase-0: `const socialSecurityRate = settings.social_security_rate ?? 0.07;` at `:355` — and the `socialSecurityDeduction`/`totalDeductions` computation). Resolve the pack, currency decimals, and the component catalog once per run:
```typescript
// regime.payroll is COUNTRY-LOCKED (AD-6): the country layer IS the effective value,
// so read geo_countries.country_config directly by the tenant's country_id — do NOT
// read tenants.resolved_country_config (the snapshot mapper is not guaranteed to carry
// regime.payroll). resolvePayrollPackKey returns 'none' when unset.
const countryId = await this.resolveTenantCountryId();
const payrollPackKey = await this.resolvePayrollPackKey(countryId);
const pack = payrollPackKey === 'none' ? null : resolvePayrollPack(payrollPackKey);
const baseCurrency = await getBaseCurrency();
const decimalPlaces = await getCurrencyDecimals(baseCurrency);
const catalogByName = await this.loadPayrollComponentCatalog(countryId); // name -> {id,name}

// ...inside the per-employee loop, replace socialSecurityDeduction:
const earningItems = buildEarningItems({
  basic: basicSalary,
  extras: [{ name: 'Overtime', amount: overtimeAmount }],
  decimalPlaces,
});
const statutoryItems = buildStatutoryItems({
  pack, countryId: countryId ?? '', asOf: period.end_date, gross: totalEarnings, basic: basicSalary, decimalPlaces,
});
itemsByEmployee.set(employee.id, [...earningItems, ...statutoryItems]);
const socialSecurityDeduction = statutoryItems
  .filter((i) => i.component_type === 'deduction')
  .reduce((sum, i) => sum + i.amount, 0);
const totalDeductions = socialSecurityDeduction + loanDeductions;
```
After the `payroll_records` insert returns `createdRecords`, insert one `payroll_record_items` row per item — EARNINGS and statutory — linking `component_id` to the catalog where the pack code maps to a seeded row:
```typescript
const itemRows = createdRecords!.flatMap((rec) => {
  const its = itemsByEmployee.get(rec.employee_id) ?? [];
  return its.map((it, idx) => {
    // Translate the pack componentCode to its seeded catalog name (pack data), then
    // link the catalog row id. Earnings + unmapped codes fall back to a null id.
    const catalogName = OM_COMPONENT_CATALOG_NAMES[it.component_name] ?? it.component_name;
    const catalog = catalogByName.get(catalogName);
    return {
      tenant_id: rec.tenant_id,
      record_id: rec.id,
      component_id: catalog?.id ?? null,
      component_name: catalog?.name ?? it.component_name,
      component_type: it.component_type,
      amount: it.amount,
      is_taxable: it.component_type === 'earning',
      sort_order: idx,
    };
  });
});
if (itemRows.length > 0) {
  const { error: itemErr } = await supabase.from('payroll_record_items').insert(itemRows);
  if (itemErr) throw itemErr;
}
```
Imports to add:
```typescript
import { resolvePayrollPack } from './regimes/registry';
import { omPayrollPack, OM_COMPONENT_CATALOG_NAMES } from './regimes/om_payroll'; // side-effect registration + code→catalog-name map
import { getBaseCurrency, getCurrencyDecimals } from './currencyService';
```
Private helpers to add (match the file's service-object method style; declare `itemsByEmployee = new Map<string, StatutoryItem[]>()` at run scope):
```typescript
// regime.payroll is country-locked → the country layer is authoritative (AD-6).
private async resolveTenantCountryId(): Promise<string | null> {
  const tenantId = await resolveTenantId();
  const { data } = await supabase.from('tenants').select('country_id').eq('id', tenantId).maybeSingle();
  return (data?.country_id as string | null) ?? null;
}

private async resolvePayrollPackKey(countryId: string | null): Promise<string> {
  if (!countryId) return 'none';
  const { data } = await supabase.from('geo_countries').select('country_config').eq('id', countryId).maybeSingle();
  const cfg = (data?.country_config as Record<string, unknown> | null) ?? {};
  const key = cfg['regime.payroll'];
  return typeof key === 'string' && key.length > 0 ? key : 'none';
}

// Country-scoped statutory-component catalog, keyed by name for pack-code linkage.
private async loadPayrollComponentCatalog(countryId: string | null): Promise<Map<string, { id: string; name: string }>> {
  const map = new Map<string, { id: string; name: string }>();
  if (!countryId) return map;
  const { data } = await supabase
    .from('master_payroll_components')
    .select('id, name')
    .eq('country_id', countryId)
    .is('deleted_at', null);
  for (const row of data ?? []) map.set(row.name as string, { id: row.id as string, name: row.name as string });
  return map;
}
```
(If `resolveTenantId` isn't already imported in `payrollService.ts`, add it from `./supabaseClient`.)

**Runtime resolution is verified by Task 2's post-state probe** (`geo_countries.country_config->>'regime.payroll' = 'om_payroll'` for OM), proving the Oman tenant resolves the `om_payroll` pack — closing the "pack may never resolve" gap.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/payrollService.itemization.test.ts && npm run typecheck`
Expected: PASS (5 passed); typecheck `0 errors`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/payrollService.ts src/lib/payrollService.itemization.test.ts
git commit -m "feat(payroll): assemble statutory components from pack + write payroll_record_items"
```

### Task 6: Render itemized `payroll_record_items` in the period detail drill-down

**Files:**
- Modify: `src/pages/payroll/PayrollPeriodDetailPage.tsx` (payslip drill-down section)
- Test: `src/pages/payroll/PayrollPeriodDetailPage.itemized.test.tsx`

**Interfaces:**
- Consumes: `payrollService.getPayrollRecordItems(recordId)` (exists, `payrollService.ts:304`); the rows written by Task 5.
- Produces: an earnings/deductions itemized table in the UI, sourced from real rows (no longer an always-empty list).

- [ ] **Step 1: Write the failing test**

Create `src/pages/payroll/PayrollPeriodDetailPage.itemized.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PayrollItemsTable } from './PayrollPeriodDetailPage';

describe('PayrollItemsTable', () => {
  it('renders one row per payroll_record_item grouped by type', () => {
    render(
      <PayrollItemsTable
        items={[
          { component_name: 'PASI_EMPLOYEE', component_type: 'deduction', amount: 70 },
          { component_name: 'Basic Salary', component_type: 'earning', amount: 1000 },
        ]}
        formatAmount={(n) => `OMR ${n.toFixed(3)}`}
      />,
    );
    expect(screen.getByText('PASI_EMPLOYEE')).toBeInTheDocument();
    expect(screen.getByText('OMR 70.000')).toBeInTheDocument();
    expect(screen.getByText('Basic Salary')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/pages/payroll/PayrollPeriodDetailPage.itemized.test.tsx`
Expected: FAIL — `PayrollItemsTable` not exported.

- [ ] **Step 3: Minimal implementation**

Export a presentational `PayrollItemsTable` from `PayrollPeriodDetailPage.tsx` and use it in the drill-down (fed by `getPayrollRecordItems`). Use semantic tokens + lucide icons only:
```tsx
export interface PayrollItemRow { component_name: string; component_type: string; amount: number; }

export function PayrollItemsTable({
  items, formatAmount,
}: { items: PayrollItemRow[]; formatAmount: (n: number) => string }) {
  const earnings = items.filter((i) => i.component_type === 'earning');
  const deductions = items.filter((i) => i.component_type !== 'earning');
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section>
        <h4 className="mb-2 text-sm font-semibold text-surface-foreground">Earnings</h4>
        {earnings.map((i) => (
          <div key={i.component_name} className="flex justify-between border-b border-border py-1 text-sm">
            <span>{i.component_name}</span><span>{formatAmount(i.amount)}</span>
          </div>
        ))}
      </section>
      <section>
        <h4 className="mb-2 text-sm font-semibold text-surface-foreground">Deductions</h4>
        {deductions.map((i) => (
          <div key={i.component_name} className="flex justify-between border-b border-border py-1 text-sm">
            <span>{i.component_name}</span><span>{formatAmount(i.amount)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
```
(Match the file's existing token vocabulary if `text-surface-foreground` is not the exact token in use — read the file and reuse its heading token.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/pages/payroll/PayrollPeriodDetailPage.itemized.test.tsx && npm run typecheck`
Expected: PASS; typecheck `0 errors`.

- [ ] **Step 5: Commit**
```bash
git add src/pages/payroll/PayrollPeriodDetailPage.tsx src/pages/payroll/PayrollPeriodDetailPage.itemized.test.tsx
git commit -m "feat(payroll): itemized earnings/deductions drill-down from payroll_record_items"
```

---

## WP-B — Data-driven bank-file formats (WPS SIF / NACHA / BACS)

**Independence:** file-disjoint from all other WPs except the shared `payrollService.ts` overlap with WP-A (Task 9 edits the `generateBankFile` region ~888–936; WP-A edits `processPayroll` ~320–476). Consumes the Phase-1 `master_engine_capabilities` table (columns `capability_key`, `kind text CHECK IN ('regime_adapter','scheme_mode','speller_scale','bank_file_op','filing_transport')`, `min_engine_version`) and per-currency `master_currency_codes.decimal_places`.

### Task 7: Seed `master_engine_capabilities` bank_file_op honesty rows

**Files:**
- Migration: `p6_seed_bank_file_op_capabilities`
- Modify: `supabase/migrations.manifest.md`
- Test: SQL probes

**Interfaces:**
- Consumes: Phase-1 `master_engine_capabilities`.
- Produces: three `kind='bank_file_op'` rows (`om_wps_sif`, `us_nacha`, `uk_bacs`) so the publish/capability manifest can honestly assert a bank-file op resolves to a registered descriptor.

- [ ] **Step 1: Probe current state**
```sql
SELECT capability_key FROM master_engine_capabilities WHERE kind='bank_file_op' ORDER BY capability_key;
```
Expected: `0 rows` (none seeded yet).

- [ ] **Step 2: Apply seed migration** — `mcp__supabase__apply_migration` name `p6_seed_bank_file_op_capabilities`:
```sql
INSERT INTO public.master_engine_capabilities (capability_key, kind, min_engine_version)
VALUES ('om_wps_sif', 'bank_file_op', '1.0.0'),
       ('us_nacha',   'bank_file_op', '1.0.0'),
       ('uk_bacs',    'bank_file_op', '1.0.0')
ON CONFLICT (capability_key) DO NOTHING;
```

- [ ] **Step 3: Probe post-state**
```sql
SELECT capability_key FROM master_engine_capabilities WHERE kind='bank_file_op' ORDER BY capability_key;
```
Expected: `om_wps_sif`, `uk_bacs`, `us_nacha`.

- [ ] **Step 4: Regenerate types + typecheck** — `mcp__supabase__generate_typescript_types` → save; `npm run typecheck` → `0 errors`.

- [ ] **Step 5: Append manifest row**
```
| <applied_version> | p6_seed_bank_file_op_capabilities.sql | Additive | Seed bank_file_op capability honesty rows (WPS SIF/NACHA/BACS) | <PR> |
```

- [ ] **Step 6: Commit**
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(payroll): seed bank_file_op capability rows"
```

### Task 8: `BankFileDescriptor` registry + real WPS SIF / NACHA / BACS builders

**Files:**
- Create: `src/lib/payroll/bankFile/types.ts`
- Create: `src/lib/payroll/bankFile/wpsSif.ts`
- Create: `src/lib/payroll/bankFile/nacha.ts`
- Create: `src/lib/payroll/bankFile/bacs.ts`
- Create: `src/lib/payroll/bankFile/registry.ts`
- Test: `src/lib/payroll/bankFile/wpsSif.test.ts`

**Interfaces:**
- Consumes: nothing external (pure string builders).
- Produces: `BankFileRecord`, `BankFileContext`, `BankFileDescriptor` (types.ts); `wpsSifDescriptor`/`nachaDescriptor`/`bacsDescriptor`; `resolveBankFileDescriptor(formatKey: 'WPS'|'ACH'|'BACS'): BankFileDescriptor`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/payroll/bankFile/wpsSif.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { resolveBankFileDescriptor } from './registry';

const records = [
  { employeeNumber: 'E001', employeeName: 'Ali Hassan', iban: 'OM810180000001234567890', bankAccountNumber: '1234567890', bankName: 'Bank Muscat', netSalary: 920.5 },
];
const ctx = { currencyCode: 'OMR', decimalPlaces: 3, employerName: 'SPACE DATAA RECOVERY', periodName: 'Jul 2026', payDate: '2026-07-25' };

describe('wpsSifDescriptor', () => {
  it('emits an SCR header with employer, pay date, base currency and record count', () => {
    const out = resolveBankFileDescriptor('WPS').build(records, ctx);
    const lines = out.split('\n');
    expect(lines[0]).toBe('SCR,SPACE DATAA RECOVERY,2026-07-25,OMR,920.500,1');
  });

  it('emits one EDR per employee with 3-decimal OMR net and no USD/Bank-Muscat literal', () => {
    const out = resolveBankFileDescriptor('WPS').build(records, ctx);
    expect(out).toContain('EDR,E001,OM810180000001234567890,Bank Muscat,920.500');
    expect(out).not.toContain('USD');
  });

  it('exposes the om_wps_sif capability key and sif extension', () => {
    const d = resolveBankFileDescriptor('WPS');
    expect(d.capabilityKey).toBe('om_wps_sif');
    expect(d.fileExtension).toBe('sif');
  });

  it('throws on an unknown format', () => {
    expect(() => resolveBankFileDescriptor('XYZ')).toThrow(/XYZ/);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/payroll/bankFile/wpsSif.test.ts`
Expected: FAIL — module `./registry` not found.

- [ ] **Step 3: Minimal implementation**

`src/lib/payroll/bankFile/types.ts`:
```typescript
export interface BankFileRecord {
  employeeNumber: string;
  employeeName: string;
  iban: string | null;
  bankAccountNumber: string;
  bankName: string | null;
  netSalary: number;
}
export interface BankFileContext {
  currencyCode: string;
  decimalPlaces: number;
  employerName: string;
  periodName: string;
  payDate: string; // 'YYYY-MM-DD'
}
export interface BankFileDescriptor {
  readonly formatKey: string;
  readonly capabilityKey: string;
  readonly fileExtension: string;
  build(records: BankFileRecord[], ctx: BankFileContext): string;
}
```

`src/lib/payroll/bankFile/wpsSif.ts`:
```typescript
import type { BankFileDescriptor, BankFileRecord, BankFileContext } from './types';

// Salary Information File (SIF): one SCR (Salary Control Record) header + one EDR
// (Employee Detail Record) per employee. Currency and minor-unit decimals come
// from the tenant base config — no hardcoded 'USD'/'Bank Muscat'.
export const wpsSifDescriptor: BankFileDescriptor = {
  formatKey: 'WPS',
  capabilityKey: 'om_wps_sif',
  fileExtension: 'sif',
  build(records: BankFileRecord[], ctx: BankFileContext): string {
    const total = records.reduce((sum, r) => sum + r.netSalary, 0);
    const scr = ['SCR', ctx.employerName, ctx.payDate, ctx.currencyCode, total.toFixed(ctx.decimalPlaces), String(records.length)].join(',');
    const edrs = records.map((r) =>
      ['EDR', r.employeeNumber, r.iban ?? r.bankAccountNumber, r.bankName ?? '', r.netSalary.toFixed(ctx.decimalPlaces)].join(','),
    );
    return [scr, ...edrs].join('\n');
  },
};
```

`src/lib/payroll/bankFile/nacha.ts`:
```typescript
import type { BankFileDescriptor, BankFileRecord, BankFileContext } from './types';

// NACHA PPD entries (US ACH). Amounts are integer cents per NACHA; decimalPlaces
// from ctx keeps non-2dp currencies correct if ever routed here.
export const nachaDescriptor: BankFileDescriptor = {
  formatKey: 'ACH',
  capabilityKey: 'us_nacha',
  fileExtension: 'ach',
  build(records: BankFileRecord[], ctx: BankFileContext): string {
    const factor = 10 ** ctx.decimalPlaces;
    return records
      .map((r) => ['6', '22', r.bankAccountNumber, String(Math.round(r.netSalary * factor)), r.employeeNumber, r.employeeName].join(','))
      .join('\n');
  },
};
```

`src/lib/payroll/bankFile/bacs.ts`:
```typescript
import type { BankFileDescriptor, BankFileRecord, BankFileContext } from './types';

// BACS Standard 18 (UK). Amounts in minor units per ctx.decimalPlaces.
export const bacsDescriptor: BankFileDescriptor = {
  formatKey: 'BACS',
  capabilityKey: 'uk_bacs',
  fileExtension: 'txt',
  build(records: BankFileRecord[], ctx: BankFileContext): string {
    const factor = 10 ** ctx.decimalPlaces;
    return records
      .map((r) => [r.bankAccountNumber, '0', '99', String(Math.round(r.netSalary * factor)), ctx.employerName, r.employeeName].join(','))
      .join('\n');
  },
};
```

`src/lib/payroll/bankFile/registry.ts`:
```typescript
import type { BankFileDescriptor } from './types';
import { wpsSifDescriptor } from './wpsSif';
import { nachaDescriptor } from './nacha';
import { bacsDescriptor } from './bacs';

const DESCRIPTORS: Record<string, BankFileDescriptor> = {
  WPS: wpsSifDescriptor,
  ACH: nachaDescriptor,
  BACS: bacsDescriptor,
};

export function resolveBankFileDescriptor(formatKey: string): BankFileDescriptor {
  const d = DESCRIPTORS[formatKey];
  if (!d) throw new Error(`No bank-file descriptor for format '${formatKey}'`);
  return d;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/payroll/bankFile/wpsSif.test.ts && npm run typecheck`
Expected: PASS (4 passed); typecheck `0 errors`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/payroll/bankFile
git commit -m "feat(payroll): data-driven bank-file descriptors (WPS SIF/NACHA/BACS)"
```

### Task 9: Wire `generateBankFile` to the descriptor registry (base currency + real decimals)

**Files:**
- Modify: `src/lib/payrollService.ts:888-936` (`generateBankFile`; delete `generateWPSFileContent`)
- Test: `src/lib/payrollService.bankfile.test.ts`

**Interfaces:**
- Consumes: `resolveBankFileDescriptor` (Task 8); `getBaseCurrency` + `getCurrencyDecimals` from `src/lib/currencyService.ts`; live `payroll_bank_files` columns (`file_format`, `file_name`, `total_amount`, `record_count`, `status`).
- Produces: `generateBankFile(periodId, format)` returns `{ ...bankFile, file_content, file_number, file_extension }`, honoring `format`, currency = tenant base, decimals = per-currency. `generateWPSFileContent` is removed.

- [ ] **Step 1: Write the failing test**

Create `src/lib/payrollService.bankfile.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { toBankFileRecords } from './payrollService';

describe('toBankFileRecords', () => {
  it('maps payroll records + employee joins to BankFileRecord (no USD literal)', () => {
    const rows = [{
      employee: { employee_number: 'E001', first_name: 'Ali', last_name: 'Hassan', bank_name: 'Bank Muscat', bank_account_number: '123', iban: 'OM81' },
      net_salary: 920.5,
    }];
    const out = toBankFileRecords(rows);
    expect(out).toEqual([{
      employeeNumber: 'E001', employeeName: 'Ali Hassan', iban: 'OM81',
      bankAccountNumber: '123', bankName: 'Bank Muscat', netSalary: 920.5,
    }]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/payrollService.bankfile.test.ts`
Expected: FAIL — `toBankFileRecords` not exported.

- [ ] **Step 3: Minimal implementation**

> **Predecessor state (Phase 0).** Per Entry criteria, Phase 0 already put the WPS/`'USD'`/`'Bank Muscat'` path behind LOUD not-configured errors — `generateWPSFileContent` (main pre-Phase-0 `:918`, with `netSalary.toFixed(2)` + literal `'USD'`/`'Bank Muscat'`) either throws when currency/bank are unconfigured or is otherwise Phase-0-hardened. The `:888–936` line numbers here are the PRE-Phase-0 reference; at execution time locate the current `generateBankFile`/`generateWPSFileContent` region. Phase 6 now DELETES that method entirely (loud-error guard included) and replaces it with the data-driven descriptor registry below — so the fix is the same regardless of the exact Phase-0 code shape.

Add the exported mapper at module scope in `payrollService.ts`, then rewrite `generateBankFile` and delete `generateWPSFileContent`:
```typescript
import { resolveBankFileDescriptor } from './payroll/bankFile/registry';
import type { BankFileRecord } from './payroll/bankFile/types';
import { getBaseCurrency, getCurrencyDecimals } from './currencyService';

export function toBankFileRecords(rows: Array<Record<string, unknown>>): BankFileRecord[] {
  return rows.map((row) => {
    const e = row.employee as Record<string, unknown> | null | undefined;
    const first = (e?.first_name as string) ?? '';
    const last = (e?.last_name as string) ?? '';
    return {
      employeeNumber: (e?.employee_number as string) ?? '',
      employeeName: `${first} ${last}`.trim(),
      iban: (e?.iban as string) ?? null,
      bankAccountNumber: (e?.bank_account_number as string) ?? '',
      bankName: (e?.bank_name as string) ?? null,
      netSalary: typeof row.net_salary === 'number' ? row.net_salary : Number(row.net_salary ?? 0),
    };
  });
}
```
Replace the body of `generateBankFile`:
```typescript
async generateBankFile(periodId: string, format: 'WPS' | 'ACH' | 'BACS' | 'custom' = 'WPS') {
  const period = await this.getPayrollPeriod(periodId);
  if (!period) throw new Error('Payroll period not found');
  const records = await this.getPayrollRecords(periodId);

  const descriptor = resolveBankFileDescriptor(format === 'custom' ? 'WPS' : format);
  const baseCurrency = await getBaseCurrency();
  if (!baseCurrency) throw new Error('Tenant base currency is not configured; cannot generate a bank file');
  const decimalPlaces = await getCurrencyDecimals(baseCurrency);

  const { data: nextNumber } = await supabase.rpc('get_next_number', { p_scope: 'payroll_bank_file' });
  const fileContent = descriptor.build(toBankFileRecords(records), {
    currencyCode: baseCurrency,
    decimalPlaces,
    employerName: period.period_name ?? 'Employer',
    periodName: period.period_name ?? '',
    payDate: period.payment_date ?? period.end_date,
  });
  const fileName = `${nextNumber || `PBF-${Date.now()}`}.${descriptor.fileExtension}`;

  const { data: bankFile, error } = await supabase
    .from('payroll_bank_files')
    .insert({
      file_name: fileName,
      period_id: periodId,
      file_format: format,
      total_amount: period.total_net,
      record_count: records.length,
      status: 'generated',
    } as Database['public']['Tables']['payroll_bank_files']['Insert'])
    .select()
    .maybeSingle();
  if (error) throw error;
  return { ...bankFile, file_content: fileContent, file_number: nextNumber || fileName, file_extension: descriptor.fileExtension };
},
```
Delete the entire `generateWPSFileContent` method. Update the two callers in `src/pages/payroll/PayrollPeriodDetailPage.tsx:80,85`: keep `generateBankFile(id!, 'WPS')` at :80; replace the `generateWPSFileContent(records)` call at :85 with reading `.file_content` from the `generateBankFile` result.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/payrollService.bankfile.test.ts && npm run typecheck`
Expected: PASS; typecheck `0 errors` (the removed `generateWPSFileContent` has no remaining callers).

- [ ] **Step 5: Commit**
```bash
git add src/lib/payrollService.ts src/lib/payrollService.bankfile.test.ts src/pages/payroll/PayrollPeriodDetailPage.tsx
git commit -m "feat(payroll): generate bank files from data-driven descriptors (base currency + real decimals)"
```

---

## WP-C — Privacy-regime parameterization of the DSR module

**Independence:** fully file-disjoint. Builds on the Phase-0 hotfixes (`anonymize_customer_data`/`export_customer_data` already correct) and the Phase-0-seeded `geo_countries.data_protection_regime`. Consumes the Phase-1 reserved `privacy.regime` config key (this WP gives it its consumer; Task 13 defensively ensures the registry entry exists).

### Task 10: `privacyRegime.ts` — pure regime-keyed policy resolvers

**Files:**
- Create: `src/lib/privacyRegime.ts`
- Test: `src/lib/privacyRegime.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces: `DataProtectionRegime`; `resolveDsrDueDate(regime, requestType, createdAt)`; `resolveRetentionFloorDays(regime, recordClass)`; `regimeLabel(regime)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/privacyRegime.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { resolveDsrDueDate, resolveRetentionFloorDays, regimeLabel } from './privacyRegime';

describe('privacyRegime', () => {
  it('computes a GDPR DSR due date one calendar month out', () => {
    expect(resolveDsrDueDate('gdpr', 'deletion', '2026-07-02')).toBe('2026-08-01');
  });
  it('gives DPDP a longer statutory window than GDPR', () => {
    expect(resolveDsrDueDate('dpdp', 'deletion', '2026-07-02')).toBe('2026-09-30');
  });
  it('never lets financial records fall below the statutory tax floor, any regime', () => {
    expect(resolveRetentionFloorDays('gdpr', 'financial')).toBeGreaterThanOrEqual(2555);
    expect(resolveRetentionFloorDays('none', 'financial')).toBeGreaterThanOrEqual(2555);
  });
  it('lets the regime RAISE the floor for the same record class', () => {
    // A regulated regime imposes a longer employment-record floor than an
    // unregulated jurisdiction — the floor is regime-derived, not recordClass-only.
    expect(resolveRetentionFloorDays('gdpr', 'employee')).toBe(3650);
    expect(resolveRetentionFloorDays('none', 'employee')).toBe(365);
    expect(resolveRetentionFloorDays('gdpr', 'employee')).toBeGreaterThan(
      resolveRetentionFloorDays('none', 'employee'),
    );
  });
  it('labels regimes without naming GDPR for PDPL tenants', () => {
    expect(regimeLabel('pdpl')).toBe('PDPL');
    expect(regimeLabel('none')).toBe('Data Protection');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/privacyRegime.test.ts`
Expected: FAIL — module `./privacyRegime` not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/privacyRegime.ts`:
```typescript
export type DataProtectionRegime = 'gdpr' | 'pdpl' | 'dpdp' | 'none';

// Statutory DSR response windows in DAYS. Data — reviewed with counsel per owner E1.
const DSR_WINDOW_DAYS: Record<DataProtectionRegime, number> = {
  gdpr: 30,   // GDPR Art. 12(3): one month
  pdpl: 30,   // KSA PDPL
  dpdp: 90,   // India DPDP: longer prescribed window
  none: 30,   // conservative default
};

// HARD statutory (tax/custody) minimum retention floors in DAYS, by record class.
// Financial/tax records carry a 7-year (2555d) floor that NO privacy regime may
// undercut — it is the non-negotiable lower bound.
const RETENTION_FLOOR_DAYS: Record<string, number> = {
  financial: 2555,
  custody: 2555,
  default: 365,
};

// Regime-DERIVED statutory floors in DAYS, by record class. A privacy regime may
// RAISE a floor above the hard tax floor (e.g. longer employment-record retention);
// it may never lower it. Data — reviewed with counsel per owner E1.
const REGIME_RETENTION_FLOOR_DAYS: Record<DataProtectionRegime, Record<string, number>> = {
  gdpr: { employee: 3650 }, // EU: employment records commonly retained ~10y
  pdpl: { employee: 1825 }, // KSA: ~5y
  dpdp: { employee: 2555 }, // India: ~7y
  none: {},
};

export function resolveDsrDueDate(regime: DataProtectionRegime, _requestType: string, createdAt: string): string {
  const days = DSR_WINDOW_DAYS[regime] ?? DSR_WINDOW_DAYS.none;
  const d = new Date(`${createdAt}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The effective floor is the GREATER of the hard tax/statutory floor and any
// regime-imposed floor for that record class — so different regimes yield
// different floors for the same class, and none can undercut the tax minimum.
export function resolveRetentionFloorDays(regime: DataProtectionRegime, recordClass: string): number {
  const taxFloor = RETENTION_FLOOR_DAYS[recordClass] ?? RETENTION_FLOOR_DAYS.default;
  const regimeFloor = REGIME_RETENTION_FLOOR_DAYS[regime]?.[recordClass] ?? 0;
  return Math.max(taxFloor, regimeFloor);
}

export function regimeLabel(regime: DataProtectionRegime): string {
  switch (regime) {
    case 'gdpr': return 'GDPR';
    case 'pdpl': return 'PDPL';
    case 'dpdp': return 'DPDP';
    default: return 'Data Protection';
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/privacyRegime.test.ts`
Expected: PASS (5 passed). (`2026-07-02` + 30d = `2026-08-01`; + 90d = `2026-09-30`; GDPR employee floor 3650 > none 365.)

- [ ] **Step 5: Commit**
```bash
git add src/lib/privacyRegime.ts src/lib/privacyRegime.test.ts
git commit -m "feat(privacy): regime-keyed DSR window + retention-floor resolvers"
```

### Task 11: DSR schema — regime, statutory `due_date`, identity verification

**Files:**
- Migration: `p6_dsr_regime_due_date_verification`
- Modify: `src/types/database.types.ts`, `supabase/migrations.manifest.md`
- Test: SQL probes

**Interfaces:**
- Consumes: live `data_subject_requests` (has `request_type`/`status` CHECKs, `subject_email`, `export_file_path`; NO regime/due_date/verification).
- Produces: columns `regime text`, `due_date date`, `identity_verified boolean NOT NULL DEFAULT false`, `identity_verified_at timestamptz`, `identity_verified_by uuid`.

- [ ] **Step 1: Probe current state**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='data_subject_requests'
  AND column_name IN ('regime','due_date','identity_verified');
```
Expected: `0 rows`.

- [ ] **Step 2: Apply migration** — name `p6_dsr_regime_due_date_verification`:
```sql
ALTER TABLE public.data_subject_requests
  ADD COLUMN IF NOT EXISTS regime text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS identity_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_verified_by uuid REFERENCES auth.users(id);

ALTER TABLE public.data_subject_requests
  DROP CONSTRAINT IF EXISTS data_subject_requests_regime_check;
ALTER TABLE public.data_subject_requests
  ADD CONSTRAINT data_subject_requests_regime_check
  CHECK (regime IS NULL OR regime IN ('gdpr','pdpl','dpdp','none'));
```
(RLS unchanged — `data_subject_requests` keeps its existing tenant-isolation + op policies; additive columns inherit them.)

- [ ] **Step 3: Probe post-state**
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='data_subject_requests'
  AND column_name IN ('regime','due_date','identity_verified','identity_verified_at','identity_verified_by')
ORDER BY column_name;
```
Expected: 5 rows.

- [ ] **Step 4: Regenerate types + typecheck** — regen; `npm run typecheck` → `0 errors`.

- [ ] **Step 5: Append manifest row**
```
| <applied_version> | p6_dsr_regime_due_date_verification.sql | Additive | DSR regime + statutory due_date + identity-verification columns | <PR> |
```

- [ ] **Step 6: Commit**
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(privacy): DSR regime + due_date + identity-verification columns"
```

### Task 12: Retention schema — statutory floor + legal hold + floor-enforcing trigger

**Files:**
- Migration: `p6_retention_statutory_floor_legal_hold`
- Modify: `src/types/database.types.ts`, `supabase/migrations.manifest.md`
- Test: SQL probes (including a rejection probe)

**Interfaces:**
- Consumes: live `data_retention_policies` (`retention_days` default 2555, `auto_purge`, `is_active`; NO floor/legal_hold).
- Produces: `statutory_floor_days integer NOT NULL DEFAULT 0`, `legal_hold boolean NOT NULL DEFAULT false`; trigger `enforce_retention_floor` rejecting `retention_days < statutory_floor_days`.

- [ ] **Step 1: Probe current state**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='data_retention_policies'
  AND column_name IN ('statutory_floor_days','legal_hold');
```
Expected: `0 rows`.

- [ ] **Step 2: Apply migration** — name `p6_retention_statutory_floor_legal_hold`:
```sql
ALTER TABLE public.data_retention_policies
  ADD COLUMN IF NOT EXISTS statutory_floor_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_retention_floor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.retention_days < NEW.statutory_floor_days THEN
    RAISE EXCEPTION 'retention_days (%) is below the statutory floor (%) for table %',
      NEW.retention_days, NEW.statutory_floor_days, NEW.table_name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_retention_floor ON public.data_retention_policies;
CREATE TRIGGER trg_enforce_retention_floor
  BEFORE INSERT OR UPDATE ON public.data_retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_retention_floor();
```

- [ ] **Step 3: Probe post-state (assert the floor rejects an unlawful value)**
```sql
DO $$
DECLARE t uuid;
BEGIN
  SELECT id INTO t FROM tenants LIMIT 1;
  BEGIN
    INSERT INTO data_retention_policies (tenant_id, table_name, retention_days, statutory_floor_days)
    VALUES (t, 'invoices', 1, 2555);
    RAISE EXCEPTION 'FLOOR NOT ENFORCED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK: floor enforced';
  END;
END $$;
```
Expected: notice `OK: floor enforced` (the `retention_days=1` below floor `2555` raises `check_violation`), and NO row inserted (the DO block rolls back its own attempt). Confirm no test row leaked:
```sql
SELECT count(*) FROM data_retention_policies WHERE table_name='invoices' AND retention_days=1;
```
Expected: `0`.

- [ ] **Step 4: Regenerate types + typecheck** — regen; `npm run typecheck` → `0 errors`.

- [ ] **Step 5: Append manifest row**
```
| <applied_version> | p6_retention_statutory_floor_legal_hold.sql | Additive | Retention statutory-floor + legal_hold + floor-enforcing trigger | <PR> |
```

- [ ] **Step 6: Commit**
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(privacy): retention statutory floor + legal hold + enforcing trigger"
```

### Task 13: Wire the regime through gdprService, the DSR page, settings labels + registry key

**Files:**
- Modify: `src/lib/gdprService.ts:19-28` (createDataSubjectRequest signature)
- Modify: `src/lib/country/registry.ts` (add `'privacy'` ConfigDomain + `privacy.regime` key if absent)
- Modify: `src/pages/settings/GDPRCompliancePage.tsx` (regime label + due_date + verify-before-export)
- Modify: `src/config/settingsCategories.ts:268` (regime-neutral title)
- Test: `src/lib/gdprService.dueDate.test.ts`

**Interfaces:**
- Consumes: `resolveDsrDueDate`/`regimeLabel` (Task 10); the DSR columns (Task 11); the tenant's resolved `privacy.regime` (or `data_protection_regime`).
- Produces: `createDataSubjectRequest(request, regime)` stamping `regime` + `due_date`; a regime-neutral "Data Protection & Compliance" settings title; export blocked until `identity_verified`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/gdprService.dueDate.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildDsrInsert } from './gdprService';

describe('buildDsrInsert', () => {
  it('stamps regime + statutory due_date onto the insert payload', () => {
    const payload = buildDsrInsert(
      { tenant_id: 't1', request_type: 'deletion', subject_email: 'a@b.com', requested_by: 'u1' },
      'gdpr',
      '2026-07-02',
    );
    expect(payload.regime).toBe('gdpr');
    expect(payload.due_date).toBe('2026-08-01');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/gdprService.dueDate.test.ts`
Expected: FAIL — `buildDsrInsert` not exported.

- [ ] **Step 3: Minimal implementation**

In `src/lib/gdprService.ts`, add the exported pure builder and thread it through `createDataSubjectRequest`:
```typescript
import { resolveDsrDueDate, type DataProtectionRegime } from './privacyRegime';

export function buildDsrInsert(
  request: Omit<DataSubjectRequestInsert, 'id' | 'created_at' | 'updated_at'>,
  regime: DataProtectionRegime,
  createdAt: string,
): DataSubjectRequestInsert & { regime: string; due_date: string } {
  return { ...request, regime, due_date: resolveDsrDueDate(regime, request.request_type, createdAt) };
}
```
Change `createDataSubjectRequest` to accept `regime: DataProtectionRegime` and insert `buildDsrInsert(request, regime, new Date().toISOString().slice(0,10))`.

In `src/lib/country/registry.ts`: extend `ConfigDomain` with `'privacy'`; append the key (guard against a Phase-1 stub by only adding if not already present — the executor greps `key: 'privacy.regime'` first):
```typescript
  // ── privacy (statutory; country-locked) ──
  {
    key: 'privacy.regime',
    domain: 'privacy',
    label: 'Data-protection regime',
    description: 'The privacy regime governing DSRs, retention floors, and labels (gdpr/pdpl/dpdp/none). D11 country-locked.',
    schema: z.enum(['gdpr', 'pdpl', 'dpdp', 'none']),
    codedDefault: 'none',
    maxOverrideLayer: 'country',
  },
```

In `src/pages/settings/GDPRCompliancePage.tsx`: import `regimeLabel`, resolve the tenant regime (from `data_protection_regime`/`privacy.regime`), render `regimeLabel(regime)` in the header and each request's computed `due_date`; disable the export action until `request.identity_verified === true` (block `processExport` early with a toast if unverified).

In `src/config/settingsCategories.ts:268`: rename the `'GDPR & Compliance'` title to `'Data Protection & Compliance'` (regime-neutral).

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/gdprService.dueDate.test.ts && npm run typecheck`
Expected: PASS; typecheck `0 errors` (update any other `createDataSubjectRequest` callers to pass the resolved regime).

- [ ] **Step 5: Commit**
```bash
git add src/lib/gdprService.ts src/lib/gdprService.dueDate.test.ts src/lib/country/registry.ts src/pages/settings/GDPRCompliancePage.tsx src/config/settingsCategories.ts
git commit -m "feat(privacy): regime-parameterize DSR due dates, labels, and verify-before-export"
```

---

## WP-D — Late-payment interest, dunning & credit terms (statutory keys as data)

**Independence:** fully file-disjoint from A/B/C/E/F except the append-only shared edit to `src/lib/country/registry.ts` (adds `'receivables'` ConfigDomain + `late_payment.*`/`credit_terms.*` keys). Consumes the existing `resolveCountryConfigKey` cascade, the pg_cron `process_time_based_events` scanner, the notification template cascade, and the `case_follow_ups` auto-send email path (`followUpService.ts`). **Adds 6 country-locked registry keys → REQUIRES the registry↔trigger parity migration (Task 15) in the same PR, or `npm run check:registry-trigger-parity` fails.**

**Scope limitation (explicit, deferred):** dunning is delivered over `case_follow_ups`, whose `case_id` is `NOT NULL` (verified live) — so **only case-linked invoices are dunnable this phase**. `scheduleInvoiceDunning` returns `0` when `invoices.case_id IS NULL` (standalone/non-case invoices are silently uncovered). Spec §1.15 (`followUpService.ts:26`) flags this and points to a future invoice-scoped `invoice_follow_ups`/`dunning_runs` table. Covering standalone invoices (an invoice-scoped dunning surface, or making the dunning row's `case_id` nullable) is **out of scope for Phase 6** and tracked as an Open Question; the keys/clocks/schedule this phase ships apply once that surface exists.

### Task 14: `latePayment.ts` — pure interest, credit-terms & due-date resolvers

**Files:**
- Create: `src/lib/latePayment.ts`
- Test: `src/lib/latePayment.test.ts`

**Interfaces:**
- Consumes: nothing external (pure).
- Produces: `CreditTerms`, `LatePaymentPolicy`; `resolveCreditTerms(config)`; `computeLatePaymentInterest(args)`; `dueDateFromTerms(invoiceDate, netDays)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/latePayment.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { resolveCreditTerms, computeLatePaymentInterest, dueDateFromTerms } from './latePayment';

describe('latePayment', () => {
  it('resolves credit terms with a max-days cap', () => {
    expect(resolveCreditTerms({ 'credit_terms.default_net_days': 30, 'credit_terms.max_net_days': 60 }))
      .toEqual({ defaultNetDays: 30, maxNetDays: 60 });
  });

  it('derives a due date from invoice date + net days', () => {
    expect(dueDateFromTerms('2026-07-02', 30)).toBe('2026-08-01');
  });

  it('accrues reference+margin interest and a fixed indemnity past the grace period', () => {
    const r = computeLatePaymentInterest({
      principal: 1000, dueDate: '2026-01-01', asOf: '2026-02-01',
      policy: { interestBasis: 'reference_plus_margin', referenceRate: 4, marginPoints: 8, fixedIndemnity: 40, graceDays: 0 },
      decimalPlaces: 2,
    });
    expect(r.daysLate).toBe(31);
    expect(r.interest).toBe(10.19);   // 1000 * 12% * 31/365
    expect(r.indemnity).toBe(40);
  });

  it('charges no interest when the regime has no statutory interest (basis none)', () => {
    const r = computeLatePaymentInterest({
      principal: 1000, dueDate: '2026-01-01', asOf: '2026-06-01',
      policy: { interestBasis: 'none', referenceRate: 0, marginPoints: 0, fixedIndemnity: 0, graceDays: 0 },
      decimalPlaces: 3,
    });
    expect(r).toEqual({ interest: 0, indemnity: 0, daysLate: 151 });
  });

  it('charges nothing inside the grace window', () => {
    const r = computeLatePaymentInterest({
      principal: 1000, dueDate: '2026-01-01', asOf: '2026-01-05',
      policy: { interestBasis: 'reference_plus_margin', referenceRate: 4, marginPoints: 8, fixedIndemnity: 40, graceDays: 10 },
      decimalPlaces: 2,
    });
    expect(r).toEqual({ interest: 0, indemnity: 0, daysLate: 4 });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/latePayment.test.ts`
Expected: FAIL — module `./latePayment` not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/latePayment.ts`:
```typescript
export interface CreditTerms {
  defaultNetDays: number;
  maxNetDays: number | null;
}
export interface LatePaymentPolicy {
  interestBasis: 'reference_plus_margin' | 'fixed' | 'none';
  referenceRate: number;   // percent, e.g. ECB main refi
  marginPoints: number;    // percentage points added (or the fixed rate when basis='fixed')
  fixedIndemnity: number;  // flat recovery cost (e.g. EUR 40)
  graceDays: number;
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);

export function resolveCreditTerms(config: Record<string, unknown>): CreditTerms {
  const maxRaw = config['credit_terms.max_net_days'];
  return {
    defaultNetDays: num(config['credit_terms.default_net_days'], 30),
    maxNetDays: typeof maxRaw === 'number' ? maxRaw : null,
  };
}

export function dueDateFromTerms(invoiceDate: string, netDays: number): string {
  const d = new Date(`${invoiceDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + netDays);
  return d.toISOString().slice(0, 10);
}

export function computeLatePaymentInterest(args: {
  principal: number;
  dueDate: string;
  asOf: string;
  policy: LatePaymentPolicy;
  decimalPlaces: number;
}): { interest: number; indemnity: number; daysLate: number } {
  const { principal, dueDate, asOf, policy, decimalPlaces } = args;
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const at = new Date(`${asOf}T00:00:00Z`).getTime();
  const daysLate = Math.max(0, Math.floor((at - due) / 86_400_000));
  if (policy.interestBasis === 'none' || daysLate <= policy.graceDays) {
    return { interest: 0, indemnity: 0, daysLate };
  }
  const annualRate =
    policy.interestBasis === 'fixed'
      ? policy.marginPoints / 100
      : (policy.referenceRate + policy.marginPoints) / 100;
  const factor = 10 ** decimalPlaces;
  const interest = Math.round(principal * annualRate * (daysLate / 365) * factor) / factor;
  return { interest, indemnity: policy.fixedIndemnity, daysLate };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/latePayment.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**
```bash
git add src/lib/latePayment.ts src/lib/latePayment.test.ts
git commit -m "feat(receivables): pure late-payment interest, credit-terms & due-date resolvers"
```

### Task 15: Registry keys + registry↔trigger parity migration

**Files:**
- Modify: `src/lib/country/registry.ts` (add `'receivables'` ConfigDomain + the `late_payment.*`/`credit_terms.*` keys)
- Migration: `p6_late_payment_keys_registry_parity`
- Modify: `src/types/database.types.ts`, `supabase/migrations.manifest.md`
- Test: `src/lib/country/registry.lateFees.test.ts`; `npm run check:registry-trigger-parity`

**Interfaces:**
- Consumes: `COUNTRY_CONFIG_REGISTRY`, `STATUTORY_KEYS`, `isConfigKeyLocked` (registry.ts, verified); the live `validate_country_config_overrides()` trigger function.
- Produces: 6 new country-locked keys (`late_payment.interest_basis`, `late_payment.reference_rate`, `late_payment.margin_points`, `late_payment.fixed_indemnity`, `late_payment.grace_days`, `credit_terms.max_net_days`) + 2 tenant-overridable keys (`credit_terms.default_net_days`, `late_payment.dunning_schedule`); the DB trigger re-generated so its locked set == registry `STATUTORY_KEYS`.

- [ ] **Step 1: Write the failing test (registry side)**

Create `src/lib/country/registry.lateFees.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { REGISTRY_BY_KEY, isConfigKeyLocked, STATUTORY_KEYS } from './registry';

describe('late-payment registry keys', () => {
  it('registers statutory late-payment keys as country-locked', () => {
    expect(isConfigKeyLocked('late_payment.interest_basis')).toBe(true);
    expect(isConfigKeyLocked('late_payment.fixed_indemnity')).toBe(true);
    expect(isConfigKeyLocked('credit_terms.max_net_days')).toBe(true);
    expect(STATUTORY_KEYS).toContain('late_payment.interest_basis');
  });
  it('keeps default net-days and dunning schedule tenant-overridable', () => {
    expect(isConfigKeyLocked('credit_terms.default_net_days')).toBe(false);
    expect(isConfigKeyLocked('late_payment.dunning_schedule')).toBe(false);
    expect(REGISTRY_BY_KEY['credit_terms.default_net_days'].codedDefault).toBe(30);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/country/registry.lateFees.test.ts`
Expected: FAIL — keys absent from `REGISTRY_BY_KEY`.

- [ ] **Step 3: Minimal implementation (registry)**

In `src/lib/country/registry.ts`, add `'receivables'` to the `ConfigDomain` union, and append these entries to `COUNTRY_CONFIG_REGISTRY` (before the closing `];`):
```typescript
  // ── receivables (late payment & credit terms) ──
  {
    key: 'credit_terms.default_net_days',
    domain: 'receivables',
    label: 'Default payment terms (net days)',
    description: 'Tenant default days until an invoice is due. Tenant preference.',
    schema: z.number().int().min(0).max(365),
    codedDefault: 30,
  },
  {
    key: 'credit_terms.max_net_days',
    domain: 'receivables',
    label: 'Maximum payment terms (net days)',
    description: 'Statutory cap on invoice terms (e.g. France 60). Country-locked.',
    schema: z.union([z.number().int().min(0).max(365), z.null()]),
    codedDefault: null,
    maxOverrideLayer: 'country',
  },
  {
    key: 'late_payment.interest_basis',
    domain: 'receivables',
    label: 'Late-payment interest basis',
    description: 'How statutory late interest is derived. Country-locked.',
    schema: z.enum(['reference_plus_margin', 'fixed', 'none']),
    codedDefault: 'none',
    maxOverrideLayer: 'country',
  },
  {
    key: 'late_payment.reference_rate',
    domain: 'receivables',
    label: 'Reference rate (percent)',
    description: 'Statutory reference rate (e.g. ECB refi, BoE base). Country-locked.',
    schema: z.number().min(0).max(100),
    codedDefault: 0,
    maxOverrideLayer: 'country',
  },
  {
    key: 'late_payment.margin_points',
    domain: 'receivables',
    label: 'Interest margin (points)',
    description: 'Percentage points added to the reference (or the fixed rate). Country-locked.',
    schema: z.number().min(0).max(100),
    codedDefault: 0,
    maxOverrideLayer: 'country',
  },
  {
    key: 'late_payment.fixed_indemnity',
    domain: 'receivables',
    label: 'Fixed recovery indemnity',
    description: 'Flat late-payment recovery cost (e.g. EUR 40, EU Directive 2011/7). Country-locked.',
    schema: z.number().min(0),
    codedDefault: 0,
    maxOverrideLayer: 'country',
  },
  {
    key: 'late_payment.grace_days',
    domain: 'receivables',
    label: 'Grace days before interest',
    description: 'Days after due date before statutory interest starts. Country-locked.',
    schema: z.number().int().min(0).max(90),
    codedDefault: 0,
    maxOverrideLayer: 'country',
  },
  {
    key: 'late_payment.dunning_schedule',
    domain: 'receivables',
    label: 'Dunning schedule',
    description: 'Reminder cadence: array of { level, offsetDays, channel, templateKey }. Tenant-configurable.',
    schema: z.array(z.object({ level: z.number().int(), offsetDays: z.number().int(), channel: z.enum(['internal', 'email']), templateKey: z.string() })),
    codedDefault: [
      { level: 1, offsetDays: 7, channel: 'internal', templateKey: 'dunning_l1' },
      { level: 2, offsetDays: 14, channel: 'email', templateKey: 'dunning_l2' },
      { level: 3, offsetDays: 30, channel: 'email', templateKey: 'dunning_l3' },
    ],
  },
```

- [ ] **Step 4: Run the registry test, verify pass**

Run: `npx vitest run src/lib/country/registry.lateFees.test.ts`
Expected: PASS. Then confirm the parity gate now FAILS (registry has locked keys the DB trigger doesn't): `npm run check:registry-trigger-parity` → Expected: FAIL (drift: 6 statutory keys missing from the DB trigger).

- [ ] **Step 5: Probe + re-generate the DB trigger**

Probe the live function via `mcp__supabase__execute_sql`:
```sql
SELECT pg_get_functiondef('public.validate_country_config_overrides()'::regprocedure) AS def;
```
Read its current locked-key set. Then `mcp__supabase__apply_migration` name `p6_late_payment_keys_registry_parity`, re-creating the function with the locked set EXTENDED to include the 6 new keys.

**Preserve the LIVE body verbatim — change ONLY the array contents.** The parity parser `parseTriggerStatutoryKeys` (`scripts/country-engine/registry-trigger-parity.ts`) anchors on the identifier `statutory_keys` immediately followed by an `ARRAY[...]` literal, and the function is captured `SECURITY DEFINER SET search_path TO 'public'` with a `FOREACH k IN ARRAY statutory_keys` loop. If you rename the variable (e.g. `v_locked_keys`), switch to `FOR … IN SELECT jsonb_object_keys(…)`, or drop `SECURITY DEFINER`/`search_path`, the parser finds no `statutory_keys` literal → returns `[]` → every registry `STATUTORY_KEYS` entry reports `missingInTrigger` → `npm run check:registry-trigger-parity` (Step 6) FAILS. Reproduce the live shape exactly.

The array must equal registry `STATUTORY_KEYS` (the `maxOverrideLayer:'country'` keys ONLY — `required` keys such as `currency.code`/`tax.label` are NOT trigger-locked and must stay OUT of the array). After Phase 1 that live set is `{regime.tax, regime.einvoice, regime.numbering, regime.documents, regime.payroll, tax.zatca_qr.enabled, privacy.regime, custody.unclaimed_property}`; this task adds the 6 new receivables keys → the 14 below. Derive the exact literal to paste from `expectedTriggerArraySql(STATUTORY_KEYS)` (exported by the parity script) or the failing test's "Fix:" message, rather than hand-copying. Canonical form (identifier, loop, guards, `SECURITY DEFINER`/`search_path` copied from the Step-5 `pg_get_functiondef` probe; only the `statutory_keys` array contents differ):
```sql
CREATE OR REPLACE FUNCTION public.validate_country_config_overrides()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Identifier MUST stay `statutory_keys` with an ARRAY[...] literal: the parity
  -- parser matches exactly this token. Contents MUST equal registry STATUTORY_KEYS.
  statutory_keys text[] := ARRAY[
    'regime.tax','regime.einvoice','regime.numbering','regime.documents','regime.payroll',
    'tax.zatca_qr.enabled','privacy.regime','custody.unclaimed_property',
    'late_payment.interest_basis','late_payment.reference_rate','late_payment.margin_points',
    'late_payment.fixed_indemnity','late_payment.grace_days','credit_terms.max_net_days'
  ];
  k text;
BEGIN
  IF NEW.country_config_overrides IS NULL OR NEW.country_config_overrides = '{}'::jsonb THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.country_config_overrides IS NOT DISTINCT FROM OLD.country_config_overrides THEN RETURN NEW; END IF;
  FOREACH k IN ARRAY statutory_keys LOOP
    IF NEW.country_config_overrides ? k THEN
      RAISE EXCEPTION 'country-config key % is jurisdiction-derived and cannot be overridden at the tenant/entity layer', k;
    END IF;
  END LOOP;
  RETURN NEW;
END $function$;
```
(If the Step-5 probe shows the live function has diverged from this shape — e.g. reads locked keys from a table rather than the `statutory_keys` array literal — match the LIVE shape and add the 6 new keys into whatever it uses; `npm run check:registry-trigger-parity` is the arbiter of correctness either way.)

- [ ] **Step 6: Regenerate types + verify parity green**

`mcp__supabase__generate_typescript_types` → save `src/types/database.types.ts`. Then:
- Run: `npm run check:registry-trigger-parity` → Expected: PASS (DB locked set == registry `STATUTORY_KEYS`).
- Run: `npm run typecheck` → `0 errors`.

- [ ] **Step 7: Append manifest row + commit**
```
| <applied_version> | p6_late_payment_keys_registry_parity.sql | Additive | Lock 6 new receivables statutory keys in validate_country_config_overrides() | <PR> |
```
```bash
git add src/lib/country/registry.ts src/lib/country/registry.lateFees.test.ts src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(receivables): late_payment/credit_terms registry keys + trigger parity"
```

### Task 16: Seed `late_payment.*`/`credit_terms.*` into `geo_countries.country_config` (data)

**Files:**
- Migration: `p6_seed_late_payment_credit_terms_config`
- Modify: `src/types/database.types.ts`, `supabase/migrations.manifest.md`
- Test: SQL probes

**Interfaces:**
- Consumes: `geo_countries.country_config jsonb` (verified NOT NULL default `'{}'`); country `code`.
- Produces: OM (no statutory interest), UK (base+8pp, 30d), FR (ECB+margin, EUR 40, 60d cap) late-payment/credit-terms pack data. **Rates are illustrative pending statutory review (owner E1).**

- [ ] **Step 1: Probe current state**
```sql
SELECT code, country_config ? 'late_payment.interest_basis' AS has_key
FROM geo_countries WHERE code IN ('OM','GB','FR') ORDER BY code;
```
Expected: three rows, all `has_key = false`.

- [ ] **Step 2: Apply seed migration** — `mcp__supabase__apply_migration` name `p6_seed_late_payment_credit_terms_config`:
```sql
-- Oman: no statutory late-payment interest regime.
UPDATE public.geo_countries SET country_config = country_config || jsonb_build_object(
  'credit_terms.default_net_days', 30,
  'late_payment.interest_basis', 'none'
) WHERE code = 'OM';

-- United Kingdom: LPCDIA — BoE base (illustrative 5.25) + 8 percentage points, EUR-equiv fixed sum.
UPDATE public.geo_countries SET country_config = country_config || jsonb_build_object(
  'credit_terms.default_net_days', 30,
  'late_payment.interest_basis', 'reference_plus_margin',
  'late_payment.reference_rate', 5.25,
  'late_payment.margin_points', 8,
  'late_payment.fixed_indemnity', 40,
  'late_payment.grace_days', 0
) WHERE code = 'GB';

-- France: Directive 2011/7 — ECB refi (illustrative 4.5) + 8 pts, EUR 40 indemnity, 60-day cap.
UPDATE public.geo_countries SET country_config = country_config || jsonb_build_object(
  'credit_terms.default_net_days', 30,
  'credit_terms.max_net_days', 60,
  'late_payment.interest_basis', 'reference_plus_margin',
  'late_payment.reference_rate', 4.5,
  'late_payment.margin_points', 8,
  'late_payment.fixed_indemnity', 40,
  'late_payment.grace_days', 0
) WHERE code = 'FR';
```

- [ ] **Step 3: Probe post-state**
```sql
SELECT code, country_config->>'late_payment.interest_basis' AS basis,
       country_config->>'credit_terms.max_net_days' AS cap
FROM geo_countries WHERE code IN ('OM','GB','FR') ORDER BY code;
```
Expected: `FR|reference_plus_margin|60`, `GB|reference_plus_margin|NULL`, `OM|none|NULL`.

- [ ] **Step 4: Regenerate types + typecheck** — `mcp__supabase__generate_typescript_types` → save; `npm run typecheck` → `0 errors`.

- [ ] **Step 5: Append manifest row + commit**
```
| <applied_version> | p6_seed_late_payment_credit_terms_config.sql | Additive | Seed OM/GB/FR late-payment + credit-terms pack data | <PR> |
```
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(receivables): seed OM/GB/FR late-payment + credit-terms config"
```

### Task 17: Per-customer credit terms + invoice due-date default from terms

**Files:**
- Migration: `p6_customers_credit_terms`
- Modify: `src/components/cases/InvoiceFormModal.tsx` (initial due-date), `src/types/database.types.ts`, `supabase/migrations.manifest.md`
- Test: `src/components/cases/invoiceDueDate.test.ts`

**Interfaces:**
- Consumes: `resolveCreditTerms`/`dueDateFromTerms` (Task 14); `resolveCountryConfigKey` cascade; live `customers_enhanced`.
- Produces: `customers_enhanced.payment_terms_days integer`; an `initialInvoiceDueDate(invoiceDate, customerNetDays, tenantDefaultNetDays)` helper wiring the modal's due-date default.

- [ ] **Step 1: Probe + write the failing test**

Probe:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='customers_enhanced' AND column_name='payment_terms_days';
```
Expected: `0 rows`.

Create `src/components/cases/invoiceDueDate.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { initialInvoiceDueDate } from './invoiceDueDate';

describe('initialInvoiceDueDate', () => {
  it('prefers the customer net-days when present', () => {
    expect(initialInvoiceDueDate('2026-07-02', 45, 30)).toBe('2026-08-16');
  });
  it('falls back to the tenant default net-days', () => {
    expect(initialInvoiceDueDate('2026-07-02', null, 30)).toBe('2026-08-01');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/cases/invoiceDueDate.test.ts`
Expected: FAIL — module `./invoiceDueDate` not found.

- [ ] **Step 3: Apply migration + minimal implementation**

`mcp__supabase__apply_migration` name `p6_customers_credit_terms`:
```sql
ALTER TABLE public.customers_enhanced
  ADD COLUMN IF NOT EXISTS payment_terms_days integer;
```
Create `src/components/cases/invoiceDueDate.ts`:
```typescript
import { dueDateFromTerms } from '../../lib/latePayment';

export function initialInvoiceDueDate(
  invoiceDate: string,
  customerNetDays: number | null,
  tenantDefaultNetDays: number,
): string {
  const netDays = customerNetDays ?? tenantDefaultNetDays;
  return dueDateFromTerms(invoiceDate, netDays);
}
```
In `src/components/cases/InvoiceFormModal.tsx`, seed the due-date field default via `initialInvoiceDueDate(invoiceDate, customer?.payment_terms_days ?? null, resolveCreditTerms(tenantConfigLayers).defaultNetDays)` instead of defaulting due date to `invoiceDate`/today. (Read the modal for the exact state setter; the change is the initial value only — the user may still override.)

- [ ] **Step 4: Regenerate types + run tests**

`mcp__supabase__generate_typescript_types` → save. Run: `npx vitest run src/components/cases/invoiceDueDate.test.ts && npm run typecheck` → PASS; `0 errors`.

- [ ] **Step 5: Append manifest row + commit**
```
| <applied_version> | p6_customers_credit_terms.sql | Additive | Add customers_enhanced.payment_terms_days; invoice due-date default from terms | <PR> |
```
```bash
git add supabase/migrations.manifest.md src/types/database.types.ts src/components/cases/invoiceDueDate.ts src/components/cases/invoiceDueDate.test.ts src/components/cases/InvoiceFormModal.tsx
git commit -m "feat(receivables): per-customer credit terms + invoice due-date default"
```

### Task 18: Invoice-linked dunning (`case_follow_ups` linkage + `dunningService`)

**Files:**
- Migration: `p6_case_follow_ups_dunning_linkage`
- Modify: `src/lib/followUpService.ts:13-24` (widen `FollowUpType`), `src/types/database.types.ts`, `supabase/migrations.manifest.md`
- Create: `src/lib/dunningService.ts`
- Test: `src/lib/dunningService.test.ts`

**Interfaces:**
- Consumes: live `case_follow_ups` (has `type text default 'general'` free-text, `channel`, `quote_id`; NO `invoice_id`/`dunning_level`); the dunning schedule (`late_payment.dunning_schedule` from Task 15); `resolveCountryConfigKey`.
- Produces: `case_follow_ups.invoice_id uuid` + `dunning_level integer`; `FollowUpType` widened with `'dunning'`; `buildDunningFollowUps(dueDate, schedule, invoiceId, caseId)` (pure) + `scheduleInvoiceDunning(invoiceId)`.

- [ ] **Step 1: Probe + write the failing test**

Probe:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='case_follow_ups' AND column_name IN ('invoice_id','dunning_level');
```
Expected: `0 rows`.

Create `src/lib/dunningService.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildDunningFollowUps } from './dunningService';

describe('buildDunningFollowUps', () => {
  it('emits one follow-up per schedule level offset from the due date', () => {
    const rows = buildDunningFollowUps({
      dueDate: '2026-07-01',
      schedule: [
        { level: 1, offsetDays: 7, channel: 'internal', templateKey: 'dunning_l1' },
        { level: 2, offsetDays: 14, channel: 'email', templateKey: 'dunning_l2' },
      ],
      invoiceId: 'inv-1', caseId: 'case-1',
    });
    expect(rows).toEqual([
      { invoice_id: 'inv-1', case_id: 'case-1', type: 'dunning', dunning_level: 1, channel: 'internal', follow_up_date: '2026-07-08', template_key: 'dunning_l1' },
      { invoice_id: 'inv-1', case_id: 'case-1', type: 'dunning', dunning_level: 2, channel: 'email', follow_up_date: '2026-07-15', template_key: 'dunning_l2' },
    ]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/dunningService.test.ts`
Expected: FAIL — module `./dunningService` not found.

- [ ] **Step 3: Apply migration + minimal implementation**

`mcp__supabase__apply_migration` name `p6_case_follow_ups_dunning_linkage`:
```sql
ALTER TABLE public.case_follow_ups
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS dunning_level integer;

CREATE INDEX IF NOT EXISTS idx_case_follow_ups_invoice_id
  ON public.case_follow_ups (invoice_id) WHERE deleted_at IS NULL;
```
Widen the `FollowUpType` union in `src/lib/followUpService.ts`:
```typescript
export type FollowUpType =
  | 'general'
  | 'quote_chase'
  | 'pickup_reminder'
  | 'payment_reminder'
  | 'dunning'
  | 'disposal_notice';
```
And add the two labels to `FOLLOW_UP_TYPE_LABELS` (`dunning: 'Dunning reminder'`, `disposal_notice: 'Disposal notice'`).

Create `src/lib/dunningService.ts`:
```typescript
import { supabase, resolveTenantId } from './supabaseClient';
import { dueDateFromTerms } from './latePayment';

export interface DunningLevel { level: number; offsetDays: number; channel: 'internal' | 'email'; templateKey: string; }
export interface DunningFollowUp {
  invoice_id: string; case_id: string; type: 'dunning'; dunning_level: number;
  channel: 'internal' | 'email'; follow_up_date: string; template_key: string;
}

export function buildDunningFollowUps(args: {
  dueDate: string; schedule: DunningLevel[]; invoiceId: string; caseId: string;
}): DunningFollowUp[] {
  return args.schedule.map((lvl) => ({
    invoice_id: args.invoiceId,
    case_id: args.caseId,
    type: 'dunning' as const,
    dunning_level: lvl.level,
    channel: lvl.channel,
    follow_up_date: dueDateFromTerms(args.dueDate, lvl.offsetDays),
    template_key: lvl.templateKey,
  }));
}

// Schedules dunning follow-ups for an overdue invoice; returns the count inserted.
export async function scheduleInvoiceDunning(invoiceId: string): Promise<number> {
  const tenantId = await resolveTenantId();
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, case_id, due_date, tenant_id')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!inv?.due_date || !inv.case_id) return 0;

  const { data: tenant } = await supabase
    .from('tenants')
    .select('resolved_country_config')
    .eq('id', tenantId)
    .maybeSingle();
  const schedule = ((tenant?.resolved_country_config as Record<string, unknown> | null)?.['late_payment.dunning_schedule'] ?? []) as DunningLevel[];
  if (schedule.length === 0) return 0;

  const rows = buildDunningFollowUps({ dueDate: inv.due_date, schedule, invoiceId, caseId: inv.case_id }).map((r) => ({
    tenant_id: tenantId,
    case_id: r.case_id,
    invoice_id: r.invoice_id,
    type: r.type,
    dunning_level: r.dunning_level,
    channel: r.channel,
    follow_up_date: r.follow_up_date,
    status: 'pending',
    auto_send: r.channel === 'email',
  }));
  const { error } = await supabase.from('case_follow_ups').insert(rows as never);
  if (error) throw error;
  return rows.length;
}
```

- [ ] **Step 4: Regenerate types + run tests**

`mcp__supabase__generate_typescript_types` → save. Run: `npx vitest run src/lib/dunningService.test.ts && npm run typecheck` → PASS; `0 errors`.

- [ ] **Step 5: Append manifest row + commit**
```
| <applied_version> | p6_case_follow_ups_dunning_linkage.sql | Additive | case_follow_ups invoice_id + dunning_level; invoice-linked dunning service | <PR> |
```
```bash
git add supabase/migrations.manifest.md src/types/database.types.ts src/lib/followUpService.ts src/lib/dunningService.ts src/lib/dunningService.test.ts
git commit -m "feat(receivables): invoice-linked dunning schedule over case_follow_ups"
```

---

## WP-E — Unclaimed-device / abandoned-property pack dimension + disposal legality gate

**Independence:** fully file-disjoint from A/B/C/D except the append-only shared edit to `src/lib/country/registry.ts` (finalizes the Phase-1 reserved `custody.unclaimed_property` key — already country-locked, so NO parity migration). **This is data-recovery-domain-critical (owner decision 8): a lab following the app flow must never destroy a device unlawfully.** Consumes the live custody model: `custody_status` enum (`in_custody|in_transit|checked_out|archived|disposed`), `chain_of_custody` (append-only), `case_follow_ups`, `log_case_checkout`'s existing RAISE-EXCEPTION gate pattern.

### Task 19: `unclaimedDevice.ts` — retention clock, storage-fee accrual, notice dates (pure)

**Files:**
- Create: `src/lib/unclaimedDevice.ts`
- Test: `src/lib/unclaimedDevice.test.ts`

**Interfaces:**
- Consumes: nothing external (pure; mirrors the SQL gate so UI and DB agree).
- Produces: `UnclaimedPropertyPolicy`; `resolveUnclaimedPropertyPolicy(config)`; `resolveRetentionClock(args)`; `computeStorageFeeAccrual(policy, start, asOf)`; `buildDisposalNoticeDates(start, offsets)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/unclaimedDevice.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  resolveUnclaimedPropertyPolicy, resolveRetentionClock,
  computeStorageFeeAccrual, buildDisposalNoticeDates,
} from './unclaimedDevice';

const policy = {
  holding_period_days: 90,
  notice_schedule_days: [30, 60],
  storage_fee_accrual: { amount: 1, per: 'day' as const },
  lien_rights: true,
  disposal_requires_legality_gate: true,
};

describe('unclaimedDevice', () => {
  it('validates and resolves a policy, returns null for empty config', () => {
    expect(resolveUnclaimedPropertyPolicy(policy)?.holdingPeriodDays).toBe(90);
    expect(resolveUnclaimedPropertyPolicy({})).toBeNull();
    expect(resolveUnclaimedPropertyPolicy(null)).toBeNull();
  });

  it('reports the retention clock as unlawful before and lawful after the holding period', () => {
    const p = resolveUnclaimedPropertyPolicy(policy)!;
    expect(resolveRetentionClock({ policy: p, custodyStartDate: '2026-02-01', asOf: '2026-03-04' }))
      .toEqual({ daysHeld: 31, daysUntilLawfulDisposal: 59, disposalLawful: false });
    expect(resolveRetentionClock({ policy: p, custodyStartDate: '2026-01-01', asOf: '2026-07-01' }))
      .toEqual({ daysHeld: 181, daysUntilLawfulDisposal: 0, disposalLawful: true });
  });

  it('accrues storage fees per day and per month, zero when unconfigured', () => {
    const p = resolveUnclaimedPropertyPolicy(policy)!;
    expect(computeStorageFeeAccrual(p, '2026-01-01', '2026-02-01')).toBe(31);
    const monthly = resolveUnclaimedPropertyPolicy({ ...policy, storage_fee_accrual: { amount: 30, per: 'month' } })!;
    expect(computeStorageFeeAccrual(monthly, '2026-01-01', '2026-03-07')).toBe(60);
    const none = resolveUnclaimedPropertyPolicy({ ...policy, storage_fee_accrual: null })!;
    expect(computeStorageFeeAccrual(none, '2026-01-01', '2026-06-01')).toBe(0);
  });

  it('builds disposal-notice dates from custody start + schedule offsets', () => {
    expect(buildDisposalNoticeDates('2026-01-01', [30, 60])).toEqual(['2026-01-31', '2026-03-02']);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/unclaimedDevice.test.ts`
Expected: FAIL — module `./unclaimedDevice` not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/unclaimedDevice.ts`:
```typescript
export interface UnclaimedPropertyPolicy {
  holdingPeriodDays: number;
  noticeScheduleDays: number[];
  noticeTemplateKey: string | null;   // notice-template reference (pack data); rendered by the notice sender
  storageFeeAccrual: { amount: number; per: 'day' | 'month' } | null;
  lienRights: boolean;
  disposalRequiresLegalityGate: boolean;
}

const DAY_MS = 86_400_000;
const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (start: string, asOf: string): number =>
  Math.max(0, Math.floor((new Date(`${asOf}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / DAY_MS));

export function resolveUnclaimedPropertyPolicy(config: unknown): UnclaimedPropertyPolicy | null {
  if (!config || typeof config !== 'object') return null;
  const c = config as Record<string, unknown>;
  if (typeof c.holding_period_days !== 'number') return null;
  const fee = c.storage_fee_accrual as { amount?: number; per?: string } | null | undefined;
  return {
    holdingPeriodDays: c.holding_period_days,
    noticeScheduleDays: Array.isArray(c.notice_schedule_days) ? (c.notice_schedule_days as number[]) : [],
    noticeTemplateKey: typeof c.notice_template_key === 'string' ? c.notice_template_key : null,
    storageFeeAccrual:
      fee && typeof fee.amount === 'number' && (fee.per === 'day' || fee.per === 'month')
        ? { amount: fee.amount, per: fee.per }
        : null,
    lienRights: c.lien_rights === true,
    disposalRequiresLegalityGate: c.disposal_requires_legality_gate !== false,
  };
}

export function resolveRetentionClock(args: {
  policy: UnclaimedPropertyPolicy;
  custodyStartDate: string;
  asOf: string;
}): { daysHeld: number; daysUntilLawfulDisposal: number; disposalLawful: boolean } {
  const daysHeld = daysBetween(args.custodyStartDate, args.asOf);
  const daysUntilLawfulDisposal = Math.max(0, args.policy.holdingPeriodDays - daysHeld);
  return { daysHeld, daysUntilLawfulDisposal, disposalLawful: daysHeld >= args.policy.holdingPeriodDays };
}

export function computeStorageFeeAccrual(policy: UnclaimedPropertyPolicy, custodyStartDate: string, asOf: string): number {
  if (!policy.storageFeeAccrual) return 0;
  const daysHeld = daysBetween(custodyStartDate, asOf);
  const units = policy.storageFeeAccrual.per === 'day' ? daysHeld : Math.floor(daysHeld / 30);
  return policy.storageFeeAccrual.amount * units;
}

export function buildDisposalNoticeDates(custodyStartDate: string, offsets: number[]): string[] {
  return offsets.map((o) => addDays(custodyStartDate, o));
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/unclaimedDevice.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**
```bash
git add src/lib/unclaimedDevice.ts src/lib/unclaimedDevice.test.ts
git commit -m "feat(custody): pure unclaimed-property retention clock + storage-fee + notice dates"
```

### Task 20: Finalize the `custody.unclaimed_property` registry key + seed Oman config

**Files:**
- Modify: `src/lib/country/registry.ts` (finalize the reserved key's schema; add `'custody'` ConfigDomain if absent)
- Migration: `p6_seed_unclaimed_property_config`
- Modify: `src/types/database.types.ts`, `supabase/migrations.manifest.md`
- Test: `src/lib/country/registry.custody.test.ts`; SQL probe

**Interfaces:**
- Consumes: the Phase-1 reserved `custody.unclaimed_property` key (country-locked stub); `geo_countries.country_config`.
- Produces: a full object schema on `custody.unclaimed_property` (still `maxOverrideLayer:'country'` — STATUTORY_KEYS unchanged, no parity migration); Oman pack data.

- [ ] **Step 1: Write the failing test**

Create `src/lib/country/registry.custody.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { REGISTRY_BY_KEY, isConfigKeyLocked } from './registry';

describe('custody.unclaimed_property key', () => {
  it('is registered, country-locked, and accepts the full policy object', () => {
    const def = REGISTRY_BY_KEY['custody.unclaimed_property'];
    expect(def).toBeDefined();
    expect(isConfigKeyLocked('custody.unclaimed_property')).toBe(true);
    expect(() =>
      def.schema.parse({
        holding_period_days: 90, notice_schedule_days: [30, 60],
        notice_template_key: 'disposal_notice_default',
        storage_fee_accrual: { amount: 1, per: 'day' }, lien_rights: true,
        disposal_requires_legality_gate: true,
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/country/registry.custody.test.ts`
Expected: FAIL if the reserved stub schema rejects the object (or key absent).

- [ ] **Step 3: Minimal implementation (registry)**

In `src/lib/country/registry.ts`, ensure `'custody'` is in the `ConfigDomain` union, and set the `custody.unclaimed_property` entry (replace the reserved stub, keep `maxOverrideLayer:'country'`):
```typescript
  // ── custody (unclaimed property; statutory, country-locked) ──
  {
    key: 'custody.unclaimed_property',
    domain: 'custody',
    label: 'Unclaimed-property policy',
    description: 'Holding period, disposal-notice schedule + notice template, storage-fee accrual, and lien rights before lawful device disposal. Country-locked (D11).',
    schema: z.object({
      holding_period_days: z.number().int().min(0),
      notice_schedule_days: z.array(z.number().int().min(0)),
      notice_template_key: z.string(),   // notice-template content is PACK DATA (brief E), mirrors dunning's templateKey
      storage_fee_accrual: z.object({ amount: z.number().min(0), per: z.enum(['day', 'month']) }).nullable(),
      lien_rights: z.boolean(),
      disposal_requires_legality_gate: z.boolean(),
    }),
    codedDefault: null,
    maxOverrideLayer: 'country',
  },
```

- [ ] **Step 4: Apply the seed migration**

`mcp__supabase__apply_migration` name `p6_seed_unclaimed_property_config` (Oman; illustrative pending statutory review, owner E1):
```sql
UPDATE public.geo_countries SET country_config = country_config || jsonb_build_object(
  'custody.unclaimed_property', jsonb_build_object(
    'holding_period_days', 90,
    'notice_schedule_days', jsonb_build_array(30, 60),
    'notice_template_key', 'disposal_notice_default',
    'storage_fee_accrual', jsonb_build_object('amount', 1, 'per', 'day'),
    'lien_rights', true,
    'disposal_requires_legality_gate', true
  )
) WHERE code = 'OM';
```

- [ ] **Step 5: Probe + regenerate types + verify parity unchanged**

Probe:
```sql
SELECT country_config->'custody.unclaimed_property'->>'holding_period_days' AS hold
FROM geo_countries WHERE code='OM';
```
Expected: `90`. Then `mcp__supabase__generate_typescript_types` → save; run `npm run check:registry-trigger-parity` → PASS (key was already country-locked; STATUTORY_KEYS unchanged); `npx vitest run src/lib/country/registry.custody.test.ts` → PASS; `npm run typecheck` → `0 errors`.

- [ ] **Step 6: Append manifest row + commit**
```
| <applied_version> | p6_seed_unclaimed_property_config.sql | Additive | Seed Oman unclaimed-property policy; finalize custody.unclaimed_property schema | <PR> |
```
```bash
git add src/lib/country/registry.ts src/lib/country/registry.custody.test.ts src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(custody): finalize custody.unclaimed_property key + seed Oman policy"
```

### Task 21: `dispose_case_device` RPC + un-skippable `assert_lawful_disposal` ledger trigger

**Files:**
- Migration: `p6_dispose_case_device_rpc_and_gate`
- Modify: `src/types/database.types.ts`, `supabase/migrations.manifest.md`
- Test: SQL probes (BEFORE = raw-insert accepted is the bug; AFTER = gate rejects premature + raw disposal)

**Interfaces:**
- Consumes: `get_current_tenant_id()`, `chain_of_custody` (append-only), `case_devices`, `case_follow_ups`, the `custody.unclaimed_property` pack data (Task 20), the `custody_status` enum value `'disposed'`.
- Produces: `dispose_case_device(p_case_id uuid, p_device_id uuid, p_reason text, p_confirm_legality boolean) RETURNS void`; a `case_devices.disposed_at` column; a BEFORE-INSERT trigger on `chain_of_custody` that rejects ANY `custody_status='disposed'` write not carrying the transaction-local `app.disposal_gate_passed` flag (set only by the RPC).

- [ ] **Step 1: Probe the current (un-gated) state**

Confirm nothing blocks a raw disposed-row insert today:
```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid='public.chain_of_custody'::regclass AND tgname='trg_assert_lawful_disposal';
SELECT to_regprocedure('public.dispose_case_device(uuid,uuid,text,boolean)') AS rpc;
```
Expected: `0 rows` for the trigger; `rpc = NULL`. This proves a `custody_status='disposed'` row can be written directly via PostgREST with no holding-period check — the exact unlawful-disposal path.

Also confirm no EXISTING writer emits `'disposed'` (so the new BEFORE-INSERT backstop cannot break a live path — notably `log_case_checkout`, the current custody disposal/checkout path):
```sql
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND pg_get_functiondef(p.oid) ~* 'chain_of_custody'
  AND pg_get_functiondef(p.oid) ~* $q$custody_status[^;]*'disposed'$q$;
```
Expected: `0 rows` (verified on main: `log_case_checkout` emits only `custody_status='checked_out'`, never `'disposed'`). If this returns any function, that writer MUST be re-routed through `dispose_case_device` (or arm `app.disposal_gate_passed`) in this migration BEFORE the trigger is created, or it will be rejected at runtime (AD-5).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` name `p6_dispose_case_device_rpc_and_gate`:
```sql
ALTER TABLE public.case_devices ADD COLUMN IF NOT EXISTS disposed_at timestamptz;

-- (1) The lawful-path RPC. Enforces the per-country legality gate, then writes the
--     append-only custody 'disposed' event after arming the transaction-local flag.
CREATE OR REPLACE FUNCTION public.dispose_case_device(
  p_case_id uuid, p_device_id uuid, p_reason text, p_confirm_legality boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid := get_current_tenant_id();
  v_country_id uuid;
  v_cfg jsonb;
  v_holding_days int;
  v_requires_gate boolean;
  v_required_notices int;
  v_notice_count int := 0;
  v_custody_start timestamptz;
  v_days_held numeric;
  v_actor text;
  v_actor_role text;
BEGIN
  IF NOT p_confirm_legality THEN
    RAISE EXCEPTION 'Disposal requires explicit legality confirmation' USING ERRCODE='check_violation';
  END IF;

  SELECT t.country_id INTO v_country_id FROM tenants t WHERE t.id = v_tenant_id;
  SELECT g.country_config->'custody.unclaimed_property' INTO v_cfg
    FROM geo_countries g WHERE g.id = v_country_id;
  IF v_cfg IS NULL THEN
    RAISE EXCEPTION 'No unclaimed-property policy configured for this jurisdiction; disposal blocked'
      USING ERRCODE='check_violation';
  END IF;

  v_holding_days     := COALESCE((v_cfg->>'holding_period_days')::int, 2147483647);
  v_requires_gate    := COALESCE((v_cfg->>'disposal_requires_legality_gate')::boolean, true);
  v_required_notices := COALESCE(jsonb_array_length(v_cfg->'notice_schedule_days'), 0);

  SELECT LEAST(
    COALESCE(
      (SELECT min(created_at) FROM chain_of_custody WHERE device_id = p_device_id AND tenant_id = v_tenant_id),
      (SELECT created_at FROM case_devices WHERE id = p_device_id AND tenant_id = v_tenant_id)),
    now()) INTO v_custody_start;
  v_days_held := EXTRACT(EPOCH FROM (now() - v_custody_start)) / 86400.0;

  IF v_requires_gate THEN
    IF v_days_held < v_holding_days THEN
      RAISE EXCEPTION 'Holding period not elapsed (% of % days) — lawful disposal blocked',
        floor(v_days_held), v_holding_days USING ERRCODE='check_violation';
    END IF;
    SELECT count(*) INTO v_notice_count FROM case_follow_ups
      WHERE case_id = p_case_id AND tenant_id = v_tenant_id AND type = 'disposal_notice'
        AND status IN ('completed','sent') AND deleted_at IS NULL;
    IF v_notice_count < v_required_notices THEN
      RAISE EXCEPTION 'Required disposal notices not served (% of %) — lawful disposal blocked',
        v_notice_count, v_required_notices USING ERRCODE='check_violation';
    END IF;
  END IF;

  -- Arm the transaction-local gate flag the append-only trigger checks, then write.
  PERFORM set_config('app.disposal_gate_passed', 'true', true);
  SELECT full_name, role INTO v_actor, v_actor_role FROM profiles WHERE id = auth.uid();

  UPDATE case_devices SET disposed_at = now(), updated_at = now()
    WHERE id = p_device_id AND case_id = p_case_id AND tenant_id = v_tenant_id AND deleted_at IS NULL;

  INSERT INTO chain_of_custody
    (tenant_id, case_id, device_id, action_category, action, description,
     actor_id, actor_name, actor_role, custody_status, metadata)
  VALUES
    (v_tenant_id, p_case_id, p_device_id, 'critical_event', 'DEVICE_DISPOSED',
     format('Device disposed (%s) after %s days in custody', p_reason, floor(v_days_held)),
     auth.uid(), COALESCE(v_actor,'Lab'), v_actor_role, 'disposed',
     jsonb_build_object('legality_gate_passed', true, 'days_held', floor(v_days_held),
                        'holding_period_days', v_holding_days, 'disposal_method', p_reason,
                        'notices_served', v_notice_count));
END;
$$;

REVOKE ALL ON FUNCTION public.dispose_case_device(uuid,uuid,text,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.dispose_case_device(uuid,uuid,text,boolean) TO authenticated;

-- (2) The un-skippable backstop: BEFORE INSERT on the append-only ledger. Any
--     'disposed' row not written through the RPC (which sets the txn-local flag) is
--     rejected — so raw PostgREST cannot destroy a device around the gate.
CREATE OR REPLACE FUNCTION public.assert_lawful_disposal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.custody_status = 'disposed'
     AND current_setting('app.disposal_gate_passed', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'A device disposal event may only be written by dispose_case_device after the legality gate passes'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_lawful_disposal ON public.chain_of_custody;
CREATE TRIGGER trg_assert_lawful_disposal
  BEFORE INSERT ON public.chain_of_custody
  FOR EACH ROW EXECUTE FUNCTION public.assert_lawful_disposal();
```

- [ ] **Step 3: Probe the post-state (the gate rejects unlawful writes)**

Assert a raw disposed-row insert is now blocked (run as a probe expecting an error):
```sql
-- Expected: ERROR 'A device disposal event may only be written by dispose_case_device...'
INSERT INTO chain_of_custody (tenant_id, case_id, device_id, action_category, action, description, custody_status)
SELECT id, gen_random_uuid(), gen_random_uuid(), 'critical_event', 'DEVICE_DISPOSED', 'raw bypass attempt', 'disposed'
FROM tenants LIMIT 1;
```
Expected: the INSERT RAISES `check_violation` (the raw-bypass path is closed). Confirm the trigger + RPC now exist (re-run Step-1 probes → both present).

- [ ] **Step 4: Regenerate types + typecheck**

`mcp__supabase__generate_typescript_types` → save; `npm run typecheck` → `0 errors`.

- [ ] **Step 5: Append manifest row + commit**
```
| <applied_version> | p6_dispose_case_device_rpc_and_gate.sql | Additive | dispose_case_device RPC + assert_lawful_disposal BEFORE-INSERT trigger (un-skippable legality gate) | <PR> |
```
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(custody): dispose_case_device RPC + un-skippable disposal legality gate"
```

### Task 22: Disposal service wrapper + notice scheduling

**Files:**
- Modify: `src/lib/caseService.ts` (add `disposeCaseDevice` + `scheduleDisposalNotices`)
- Test: `src/lib/caseService.disposal.test.ts`

**Interfaces:**
- Consumes: the `dispose_case_device` RPC (Task 21); `buildDisposalNoticeDates` (Task 19); `resolveUnclaimedPropertyPolicy` (Task 19); `completeFollowUp` (`followUpService.ts:119`); live `case_follow_ups` (type `'disposal_notice'`, widened in Task 18).
- Produces: `caseService.disposeCaseDevice(caseId, deviceId, reason, confirmLegality)` (RPC wrapper); `caseService.scheduleDisposalNotices(caseId, deviceId, custodyStartDate)` inserting `disposal_notice` follow-ups from the policy schedule; `caseService.markDisposalNoticeServed(followUpId)` + `caseService.getPendingDisposalNotices(caseId)` (the served-transition + remaining-notices readers the gate depends on); a pure `buildDisposalNoticeRows(...)` helper.

- [ ] **Step 1: Write the failing test**

Create `src/lib/caseService.disposal.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildDisposalNoticeRows } from './caseService';

describe('buildDisposalNoticeRows', () => {
  it('builds one disposal_notice follow-up per scheduled notice date', () => {
    const rows = buildDisposalNoticeRows({
      tenantId: 't1', caseId: 'c1', custodyStartDate: '2026-01-01', noticeScheduleDays: [30, 60],
      noticeTemplateKey: 'disposal_notice_default',
    });
    expect(rows).toEqual([
      { tenant_id: 't1', case_id: 'c1', type: 'disposal_notice', follow_up_date: '2026-01-31', channel: 'internal', status: 'pending', auto_send: false, template_key: 'disposal_notice_default' },
      { tenant_id: 't1', case_id: 'c1', type: 'disposal_notice', follow_up_date: '2026-03-02', channel: 'internal', status: 'pending', auto_send: false, template_key: 'disposal_notice_default' },
    ]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/caseService.disposal.test.ts`
Expected: FAIL — `buildDisposalNoticeRows` not exported.

- [ ] **Step 3: Minimal implementation**

Add to `src/lib/caseService.ts` (module-scope pure helper + two methods on the exported service object):
```typescript
import { buildDisposalNoticeDates } from './unclaimedDevice';

// Pure builder output carries `template_key` (the pack-data notice template,
// resolved by the notice sender) exactly as the dunning builder carries its
// templateKey; scheduleDisposalNotices strips it before the case_follow_ups
// INSERT (that table has no template_key column — same pattern as dunning).
export interface DisposalNoticeRow {
  tenant_id: string; case_id: string; type: 'disposal_notice';
  follow_up_date: string; channel: 'internal'; status: 'pending'; auto_send: false;
  template_key: string;
}

export function buildDisposalNoticeRows(args: {
  tenantId: string; caseId: string; custodyStartDate: string;
  noticeScheduleDays: number[]; noticeTemplateKey: string;
}): DisposalNoticeRow[] {
  return buildDisposalNoticeDates(args.custodyStartDate, args.noticeScheduleDays).map((d) => ({
    tenant_id: args.tenantId,
    case_id: args.caseId,
    type: 'disposal_notice' as const,
    follow_up_date: d,
    channel: 'internal' as const,
    status: 'pending' as const,
    auto_send: false as const,
    template_key: args.noticeTemplateKey,
  }));
}
```
Add the two service methods (using the existing `resolveTenantId`/`supabase` already imported in `caseService.ts`):
```typescript
  async disposeCaseDevice(caseId: string, deviceId: string, reason: string, confirmLegality: boolean): Promise<void> {
    const { error } = await supabase.rpc('dispose_case_device', {
      p_case_id: caseId, p_device_id: deviceId, p_reason: reason, p_confirm_legality: confirmLegality,
    });
    if (error) throw error;
  },

  async scheduleDisposalNotices(caseId: string, custodyStartDate: string, noticeScheduleDays: number[], noticeTemplateKey: string): Promise<number> {
    const rows = buildDisposalNoticeRows({
      tenantId: await resolveTenantId(), caseId, custodyStartDate, noticeScheduleDays, noticeTemplateKey,
    });
    if (rows.length === 0) return 0;
    // Strip the pure-builder `template_key` (case_follow_ups has no such column; the
    // notice sender resolves the template from the pack) before persisting — same
    // pattern the dunning insert uses.
    const insertRows = rows.map(({ template_key: _t, ...r }) => r);
    const { error } = await supabase.from('case_follow_ups').insert(insertRows as never);
    if (error) throw error;
    return rows.length;
  },

  // The lawful-disposal gate (dispose_case_device, Task 21) counts disposal_notice
  // follow-ups whose status IS IN ('completed','sent'). Notices are created 'pending'
  // (Task 22 above / buildDisposalNoticeRows), so the operator must mark each served
  // before disposal becomes possible. This delegates to followUpService.completeFollowUp
  // (sets status='completed', completed_at=now()) — the ONLY sanctioned served-transition.
  async markDisposalNoticeServed(followUpId: string): Promise<void> {
    await completeFollowUp(followUpId);
  },

  // Lists the pending disposal_notice follow-ups for a case so the disposal UX can
  // surface exactly what remains to be served before the gate will pass.
  async getPendingDisposalNotices(caseId: string): Promise<Array<{ id: string; follow_up_date: string }>> {
    const { data } = await supabase
      .from('case_follow_ups')
      .select('id, follow_up_date')
      .eq('case_id', caseId)
      .eq('type', 'disposal_notice')
      .eq('status', 'pending')
      .is('deleted_at', null);
    return (data ?? []) as Array<{ id: string; follow_up_date: string }>;
  },
```
Import `completeFollowUp` from `./followUpService` (verified export, `followUpService.ts:119`).
(If `caseService.ts` exports free functions rather than a service object, add these as exported functions matching that file's style — read the file's export shape first.)

**Required-status vocabulary (explicit):** `dispose_case_device` requires `count(disposal_notice follow-ups WHERE status IN ('completed','sent')) >= jsonb_array_length(notice_schedule_days)`. Notices start `'pending'`; `completeFollowUp` moves them to `'completed'`. Until then the RPC raises `'Required disposal notices not served'` — this is the intended happy-path sequencing (schedule → serve each notice → dispose), not a permanent block.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/caseService.disposal.test.ts && npm run typecheck`
Expected: PASS; typecheck `0 errors`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/caseService.ts src/lib/caseService.disposal.test.ts
git commit -m "feat(custody): disposal RPC wrapper + disposal-notice scheduling"
```

### Task 23: `DisposeDeviceModal` — disposal action gated on the retention clock

**Files:**
- Create: `src/components/cases/DisposeDeviceModal.tsx`
- Modify: `src/pages/cases/CaseDetail.tsx` (mount the modal on the device row / custody tab)
- Test: `src/components/cases/DisposeDeviceModal.test.tsx`

**Interfaces:**
- Consumes: `resolveRetentionClock` + `resolveUnclaimedPropertyPolicy` (Task 19); `caseService.disposeCaseDevice` (Task 22); `useTenantConfig`/country-config layers; `formatDateTimeWithConfig`.
- Produces: a modal whose Dispose button is DISABLED with a reason until `resolveRetentionClock(...).disposalLawful === true` and the legality checkbox is checked.

- [ ] **Step 1: Write the failing test**

Create `src/components/cases/DisposeDeviceModal.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DisposeDeviceGate } from './DisposeDeviceModal';

describe('DisposeDeviceGate', () => {
  it('disables disposal and states the reason before the holding period elapses', () => {
    render(<DisposeDeviceGate daysUntilLawfulDisposal={59} disposalLawful={false} legalityConfirmed={true} onDispose={() => {}} />);
    const btn = screen.getByRole('button', { name: /dispose device/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/59 day/i)).toBeInTheDocument();
  });

  it('enables disposal only when lawful AND legality confirmed', () => {
    render(<DisposeDeviceGate daysUntilLawfulDisposal={0} disposalLawful={true} legalityConfirmed={true} onDispose={() => {}} />);
    expect(screen.getByRole('button', { name: /dispose device/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/cases/DisposeDeviceModal.test.tsx`
Expected: FAIL — `DisposeDeviceGate` not exported.

- [ ] **Step 3: Minimal implementation**

Create `src/components/cases/DisposeDeviceModal.tsx` (semantic tokens + lucide only; export the pure gate for testability):
```tsx
import { Trash2 } from 'lucide-react';

export function DisposeDeviceGate({
  daysUntilLawfulDisposal, disposalLawful, legalityConfirmed, onDispose,
}: {
  daysUntilLawfulDisposal: number;
  disposalLawful: boolean;
  legalityConfirmed: boolean;
  onDispose: () => void;
}) {
  const enabled = disposalLawful && legalityConfirmed;
  return (
    <div className="space-y-3">
      {!disposalLawful && (
        <p className="text-sm text-warning-foreground">
          Lawful disposal is blocked for {daysUntilLawfulDisposal} more day(s) — the statutory holding period has not elapsed.
        </p>
      )}
      <button
        type="button"
        disabled={!enabled}
        onClick={onDispose}
        className="inline-flex items-center gap-2 rounded-md bg-danger px-3 py-2 text-sm font-medium text-danger-foreground disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" /> Dispose device
      </button>
    </div>
  );
}
```
Then build the full `DisposeDeviceModal` around `DisposeDeviceGate`: resolve the tenant's `custody.unclaimed_property` policy → `resolveRetentionClock({ policy, custodyStartDate, asOf: tenantToday(timezone) })`; render a legality-confirmation checkbox; on confirm call `caseService.disposeCaseDevice(caseId, deviceId, reason, true)`. Mount it from `CaseDetail.tsx` on the device/custody surface. (Reuse the repo's `Dialog` base component and match its token vocabulary — read one sibling modal for the exact base import.)

**Surface the disposal-notice served-transition (required for the gate to pass).** The RPC also blocks until the scheduled `disposal_notice` follow-ups are served (status `'completed'`/`'sent'`). The modal loads `caseService.getPendingDisposalNotices(caseId)` and lists each remaining notice with a "Mark served" action calling `caseService.markDisposalNoticeServed(followUpId)`; the Dispose button stays disabled while any pending notice remains (mirror the disabled-reason copy: "N disposal notice(s) not yet served"). This makes the lawful path — schedule → serve each notice → dispose — explicit in the UI rather than an invisible `dispose_case_device` rejection.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/cases/DisposeDeviceModal.test.tsx && npm run typecheck`
Expected: PASS (2 passed); typecheck `0 errors`.

- [ ] **Step 5: Commit**
```bash
git add src/components/cases/DisposeDeviceModal.tsx src/components/cases/DisposeDeviceModal.test.tsx src/pages/cases/CaseDetail.tsx
git commit -m "feat(custody): device disposal modal gated on the statutory retention clock"
```

---

## WP-F — Remaining-country authoring at scale (data-only intake)

**Independence:** fully file-disjoint (a doc + a coverage test). Depends on Phase-3's Country Authoring Studio + `publish_country_pack` only for the human publish path; the coverage test is self-contained. Proves the phase-brief exit: "each additional simple country = data-only days."

### Task 24: Data-only country-intake runbook + worked example

**Files:**
- Create: `docs/runbooks/country-data-only-intake.md`
- Test: SQL probe (the worked example resolves the long-tail keys)

**Interfaces:**
- Consumes: the Country Authoring Studio + `publish_country_pack` (Phase 3); the WP-A/C/D/E pack keys and seeds as the template.
- Produces: a documented, repeatable runbook for adding a simple-VAT country's long-tail packs with **zero deploy** — leave/payroll seeds, privacy regime, late-payment terms, unclaimed-property policy — all as data.

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/country-data-only-intake.md` documenting the exact data-only steps (no code, no migration file authored by hand — all via Studio RPCs / additive seed migrations):
```markdown
# Data-only country intake (long-tail packs)

Adding a simple-VAT country's long-tail (payroll, leave, privacy, receivables,
custody) is DATA, not code. No deploy. Steps (all via the Country Authoring
Studio's `is_platform_admin()` RPCs or one additive seed migration):

1. Confirm the country row exists and is at least `formatting_ready`:
   `SELECT code, config_status FROM geo_countries WHERE code = '<CC>';`
2. Payroll: set `regime.payroll` (a shared pack key, e.g. `simple_vat` countries
   with no statutory social-insurance use `'none'`; GCC PASI-style reuse `om_payroll`
   or a new data-only pack). Seed country-scoped `master_payroll_components` +
   `master_leave_types` rows (country_id = the country).
3. Privacy: set `data_protection_regime` ∈ {gdpr,pdpl,dpdp,none} and `privacy.regime`.
4. Receivables: set `late_payment.*` + `credit_terms.*` in `country_config`.
5. Custody: set `custody.unclaimed_property` (holding period, notices, storage fee,
   lien, legality gate) in `country_config`.
6. Publish via `publish_country_pack(country_id, version)` — the machine gate
   replays fixtures + checks capability manifest + dual control. `statutory_ready`
   is machine-derived. Zero application code changes.

## Worked example — Bahrain (BH), simple-VAT GCC
(illustrative values; validate with a statutory expert before production, owner E1)
```
- [ ] **Step 2: Probe the worked-example country exists**

```sql
SELECT code, config_status FROM geo_countries WHERE code='BH';
```
Expected: one row (Bahrain). If absent, choose any existing `formatting_ready` GCC country and record the substitution in the runbook.

- [ ] **Step 3: Apply the worked-example data-only seed**

Include in the runbook (and apply via `mcp__supabase__apply_migration` name `p6_runbook_example_bahrain_longtail`) the full data-only seed proving no code change:
```sql
-- Bahrain long-tail packs — DATA ONLY.
UPDATE public.geo_countries SET
  data_protection_regime = 'pdpl',
  country_config = country_config
    || jsonb_build_object('credit_terms.default_net_days', 30, 'late_payment.interest_basis', 'none')
    || jsonb_build_object('custody.unclaimed_property', jsonb_build_object(
         'holding_period_days', 90, 'notice_schedule_days', jsonb_build_array(30, 60),
         'notice_template_key', 'disposal_notice_default',
         'storage_fee_accrual', jsonb_build_object('amount', 1, 'per', 'day'),
         'lien_rights', true, 'disposal_requires_legality_gate', true))
WHERE code = 'BH';

INSERT INTO public.master_leave_types (name, description, default_days, is_paid, is_active, sort_order, country_id)
SELECT v.name, v.description, v.default_days, true, true, v.sort_order, g.id
FROM geo_countries g
CROSS JOIN (VALUES
  ('Annual Leave', 'Bahrain: 30 days per year.', 30, 10),
  ('Sick Leave',   'Bahrain: graduated sick leave.', 15, 20)
) AS v(name, description, default_days, sort_order)
WHERE g.code='BH'
ON CONFLICT DO NOTHING;
```

- [ ] **Step 4: Probe resolution + append manifest**

```sql
SELECT data_protection_regime,
       country_config->>'late_payment.interest_basis' AS lp,
       country_config->'custody.unclaimed_property'->>'holding_period_days' AS hold,
       (SELECT count(*) FROM master_leave_types lt JOIN geo_countries gg ON gg.id=lt.country_id WHERE gg.code='BH' AND lt.deleted_at IS NULL) AS leave_rows
FROM geo_countries WHERE code='BH';
```
Expected: `pdpl | none | 90 | 2`. Append manifest row:
```
| <applied_version> | p6_runbook_example_bahrain_longtail.sql | Additive | Data-only Bahrain long-tail pack (runbook worked example) | <PR> |
```

- [ ] **Step 5: Commit**
```bash
git add docs/runbooks/country-data-only-intake.md supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "docs(country): data-only long-tail intake runbook + Bahrain worked example"
```

### Task 25: Long-tail pack-coverage test (data-only stays valid)

**Files:**
- Create: `scripts/country-engine/long-tail-pack-coverage.test.ts`
- Modify: `package.json` (add `check:long-tail-coverage` script)
- Test: itself (runs via `vitest.config.scripts.ts`; self-skips without live-DB creds, matching `registry-trigger-parity`)

**Interfaces:**
- Consumes: live `geo_countries` (`data_protection_regime`, `country_config`); `REGISTRY_BY_KEY` (validates `custody.unclaimed_property`/`late_payment.*` shapes against the registry Zod schemas).
- Produces: a CI gate asserting every data-only long-tail seed stays schema-valid — the safety net that makes "country N = days" safe.

- [ ] **Step 1: Write the failing test**

Create `scripts/country-engine/long-tail-pack-coverage.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { REGISTRY_BY_KEY } from '../../src/lib/country/registry';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VALID_REGIMES = ['gdpr', 'pdpl', 'dpdp', 'none'];

describe.skipIf(!url || !key)('long-tail pack coverage (live DB)', () => {
  const supabase = createClient(url!, key!);

  it('every seeded data_protection_regime is a known regime code', async () => {
    const { data } = await supabase.from('geo_countries').select('code, data_protection_regime');
    for (const row of data ?? []) {
      if (row.data_protection_regime != null) {
        expect(VALID_REGIMES, `${row.code}`).toContain(row.data_protection_regime);
      }
    }
  });

  it('every custody.unclaimed_property config validates against the registry schema', async () => {
    const { data } = await supabase.from('geo_countries').select('code, country_config');
    const schema = REGISTRY_BY_KEY['custody.unclaimed_property'].schema;
    for (const row of data ?? []) {
      const cfg = (row.country_config as Record<string, unknown> | null)?.['custody.unclaimed_property'];
      if (cfg != null) expect(() => schema.parse(cfg), `${row.code}`).not.toThrow();
    }
  });

  it('every late_payment.interest_basis config is a known basis', async () => {
    const { data } = await supabase.from('geo_countries').select('code, country_config');
    const schema = REGISTRY_BY_KEY['late_payment.interest_basis'].schema;
    for (const row of data ?? []) {
      const v = (row.country_config as Record<string, unknown> | null)?.['late_payment.interest_basis'];
      if (v != null) expect(() => schema.parse(v), `${row.code}`).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails (or self-skips without creds)**

Run: `npx vitest run --config vitest.config.scripts.ts scripts/country-engine/long-tail-pack-coverage.test.ts`
Expected: with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` set → FAIL initially only if a bad seed exists (proves the gate bites); without creds → SKIPPED (matches `registry-trigger-parity` behaviour). The import path failing (test file absent) is the red state.

- [ ] **Step 3: Add the npm script**

In `package.json` `scripts`, add:
```json
"check:long-tail-coverage": "vitest run --config vitest.config.scripts.ts scripts/country-engine/long-tail-pack-coverage.test.ts"
```

- [ ] **Step 4: Run it, verify pass**

Run: `npm run check:long-tail-coverage`
Expected: PASS (all seeded values valid) or SKIPPED without creds; `npm run typecheck` → `0 errors`.

- [ ] **Step 5: Commit**
```bash
git add scripts/country-engine/long-tail-pack-coverage.test.ts package.json
git commit -m "test(country): long-tail pack-coverage gate (data-only stays schema-valid)"
```

---

## Testing Strategy

1. **Pure golden fixtures (compliance evidence + regression net).** `om_payroll/fixtures/oman-basic.json` (Task 4); WPS-SIF/NACHA/BACS builder snapshots (Task 8); late-interest worked examples (Task 14); retention-clock/storage-fee/notice-date cases (Task 19). Each expected value is data, editable when a statutory expert validates it (owner E1) — no code change.
2. **Property-style invariants.** Interest is zero inside grace and for `basis='none'`; interest scales with `daysLate`; the retention clock's `disposalLawful` flips exactly at `holdingPeriodDays`; storage-fee `per:'day'` accrual equals `amount × daysHeld`. Currency/decimals threaded from tenant base (never `'USD'`).
3. **DB probe tests (before/after per migration).** Every DB task runs a BEFORE probe showing the wrong/absent state and an AFTER probe verifying the fix (uniqueness swap, seeds present, DSR/retention columns, disposal RPC+trigger present).
4. **Security / bypass suite (WP-E, domain-critical).** A raw PostgREST `INSERT` of a `custody_status='disposed'` row is REJECTED by `assert_lawful_disposal` (Task 21 Step 3); `dispose_case_device` REVOKEd from `anon`; `dispose_case_device` raises before the holding period elapses and when required notices are unserved. RESTRICTIVE tenant isolation on every touched tenant table remains intact (no policy weakened).
5. **Registry↔trigger parity.** Adding country-locked `late_payment.*`/`credit_terms.max_net_days` keys regenerates `validate_country_config_overrides()`; `npm run check:registry-trigger-parity` must be GREEN in the WP-D PR.
6. **Coverage gate (WP-F).** `check:long-tail-coverage` asserts every data-only seed stays schema-valid across all 58 countries — the net that keeps "country N = days" safe.
7. **i18n / display.** New staff-surface copy uses i18n keys; currency via `formatCurrencyWithConfig`; dates via `formatDateTimeWithConfig`/`tenantToday`. Payslip itemization renders 3-dp OMR without fabricated `.00` (Task 6).

## Verification Commands

| Command | Expected |
|---|---|
| `npm run typecheck` | `0 errors` (gate: `scripts/check-tsc.sh` fails any `^src/` diagnostic) |
| `npm run test` | all suites pass |
| `npm run lint` | clean (no `no-country-branching-outside-regimes`/token violations) |
| `npx vitest run src/lib/regimes/om_payroll/index.test.ts` | PASS (2) |
| `npx vitest run src/lib/payroll/bankFile/wpsSif.test.ts` | PASS (4); output contains no `USD` |
| `npx vitest run src/lib/latePayment.test.ts` | PASS (5) |
| `npx vitest run src/lib/unclaimedDevice.test.ts` | PASS (4) |
| `npm run check:registry-trigger-parity` | PASS (after WP-D trigger migration) |
| `npm run check:long-tail-coverage` | PASS or SKIPPED (no creds) |
| SQL probe: raw insert of a `disposed` custody row | RAISES `check_violation` (gate closed) |
| SQL probe: Oman payroll run | ≥1 `payroll_record_items` row per employee per statutory component |

## Acceptance Criteria

- [ ] **(WP-A)** `master_payroll_components` & `master_leave_types` are uniquely keyed `(name, country_id)`; Oman PASI + leave rows exist country-scoped; the global rows are untouched.
- [ ] **(WP-A)** `resolvePayrollPack('om_payroll')` resolves for the Oman tenant (`regime.payroll` seeded); `processPayroll` writes one `payroll_record_items` EARNING row per gross earning (Basic Salary + overtime) AND one row per statutory component, with `component_id` linked to the `master_payroll_components` catalog; amounts rounded to tenant currency minor units (OMR 3dp); no code path applies a hardcoded 7% (pack-driven).
- [ ] **(WP-A)** The payslip drill-down renders real itemized earnings/deductions (Basic Salary earning row present — no always-empty list).
- [ ] **(WP-B)** `generateBankFile` emits base currency + correct minor-unit decimals via a descriptor; `generateWPSFileContent` and the `'USD'`/`'Bank Muscat'` literals are deleted; `master_engine_capabilities` carries the 3 `bank_file_op` rows.
- [ ] **(WP-C)** DSRs carry a `regime` + a regime-derived `due_date` + identity-verification fields; retention policies carry regime-derived statutory floors (a regime may RAISE the floor) + `legal_hold`; the settings surface is regime-neutral ("Data Protection & Compliance").
- [ ] **(WP-D)** `late_payment.*`/`credit_terms.*` keys resolve; statutory ones are country-locked with `check:registry-trigger-parity` green; OM/GB/FR configs seeded; invoice due-date defaults from terms; overdue CASE-LINKED invoices schedule dunning follow-ups (`case_follow_ups.invoice_id`/`dunning_level`); standalone-invoice dunning is explicitly deferred (WP-D scope note).
- [ ] **(WP-E)** `custody.unclaimed_property` policy resolves per country (incl. `notice_template_key`); a raw `disposed` custody insert is REJECTED; `dispose_case_device` blocks before the holding period elapses and while required disposal notices remain unserved, and SUCCEEDS once the holding period has elapsed AND every scheduled `disposal_notice` follow-up is marked served (status `'completed'`/`'sent'` via `markDisposalNoticeServed`); the UI Dispose button is disabled with a reason (holding period and/or unserved notices) until lawful.
- [ ] **(WP-F)** The data-only intake runbook exists; the Bahrain worked example resolves all long-tail keys with zero application-code change; `check:long-tail-coverage` is green.
- [ ] **(all WPs)** `npm run typecheck` = 0; `npm run test` green; every migration has a manifest row + regenerated `database.types.ts`.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Illustrative statutory rates ship as if authoritative** (PASI %, EU interest, holding periods) | High | High (wrong money / unlawful disposal) | Every seed is DATA with an explicit "validate before production (owner E1)" caveat; the `master_country_pack_tests` publish gate (Phase 3) forces externally-validated fixtures before `statutory_ready`. No country flips statutory_ready on unvalidated data. |
| **Disposal GUC gate bypassed** via a crafted request setting `app.disposal_gate_passed` | Low | Critical (unlawful destruction) | PostgREST exposes no generic `set_config`; each request is its own transaction so a session-level GUC cannot carry across; the flag is `is_local=true` set only inside the SECURITY DEFINER RPC after the checks. Bypass suite (Task 21 Step 3) asserts raw inserts fail. |
| **`validate_country_config_overrides()` reconstruction drifts** from the live body | Medium | Medium (parity gate red / lock lost) | Task 15 probes `pg_get_functiondef` FIRST and reconciles the locked-key array against the live shape; `check:registry-trigger-parity` is the arbiter and must be green in-PR. |
| **WPS SIF is not fully bank-accepted** — employees lack IBAN + MOL/establishment IDs (live: only `bank_account_number`/`bank_name`) | High | Medium | This phase fixes currency/decimals/format-descriptor correctness and falls back `iban ?? bank_account_number`; true SIF acceptance needs employee `iban` + employer establishment/MOL identifier columns — flagged as an Open Question / follow-up, not silently claimed. |
| **`payrollService.ts` one-file overlap** between WP-A (`processPayroll`) and WP-B (`generateBankFile`) | Medium | Low | Disjoint regions; land A before B on a shared branch, or independent PRs with a trivial merge. Called out in the WP independence matrix. |
| **Retention clock start date ambiguity** (custody event vs `case_devices.created_at`) | Medium | Medium | RPC + pure helper both use `min(chain_of_custody.created_at)` with `case_devices.created_at` fallback and `LEAST(…, now())`; the clock is conservative (never shorter than actual custody). |

## Exit Criteria (from the roadmap row, made measurable)

- [ ] **Per-country payroll runs with itemized `payroll_record_items`:** an Oman payroll run for N active employees produces ≥ (N × statutory-component-count) `payroll_record_items` rows, PASI resolved from the pack (not `0.07`), and the WPS SIF emits OMR with 3 decimals and zero `USD`/`Bank Muscat` literals.
- [ ] **Each additional simple country = data-only days:** the Bahrain worked example (Task 24) adds payroll/leave/privacy/receivables/custody packs via seeds only — zero application-code change — and `check:long-tail-coverage` (Task 25) stays green, proving new simple countries are configuration, not code.
- [ ] **A lab following the app can never destroy a device unlawfully:** `dispose_case_device` + `assert_lawful_disposal` block premature/raw disposal in the live DB (bypass suite green).
- [ ] **Privacy is multi-regime:** DSRs stamp regime + statutory due-date; no durable "per GDPR request" text is written for a PDPL/DPDP tenant.
- [ ] **Late payment is expressible as data:** OM/GB/FR resolve distinct late-payment behaviour with statutory keys country-locked and parity green.

## Estimated Effort

| Work package | Tasks | Engineer-days |
|---|---|---|
| WP-A — PayrollPack + Oman PASI + itemization | 1–6 | 5 |
| WP-B — Data-driven bank files | 7–9 | 3 |
| WP-C — Privacy-regime DSR | 10–13 | 4 |
| WP-D — Late-payment interest & dunning | 14–18 | 5 |
| WP-E — Unclaimed-device disposal + legality gate (domain-critical) | 19–23 | 6 |
| WP-F — Data-only country authoring | 24–25 | 2 |
| **Total** | **25 tasks** | **~25 engineer-days** |

External (not engineering time): statutory validation of every seeded rate/period by qualified experts before any country's production release (owner E1) — a coordination dependency, gated by the Phase-3 publish machine gate, not an eng-days line.

---

## Self-Review Notes (for the executor)

- **Every roadmap-row + phase-brief item maps to a task:** PayrollPack + Oman PASI + WPS SIF (WP-A/B); `master_payroll_components`/`master_leave_types` uniqueness → `(name, country_id)` (Task 1); itemized `payroll_record_items` (Task 5); NACHA/BACS + `bank_file_op` capability rows (WP-B); privacy-regime DSR on the regime-key pattern (WP-C); late-payment/dunning/credit-terms keys (WP-D); unclaimed-device retention clocks + disposal-notice workflow + storage-fee accrual + lien flags + per-country legality gate wired into the custody disposal path (WP-E); Studio-driven data-only intake runbook (WP-F).
- **Non-goals honored:** platform subscription billing appears only as a Non-goal; no tax-kernel/return/e-invoice work; EOSB/PAYE/TDS/holiday-calendar/statutory-report builders explicitly deferred.
- **Names match the interface contract:** `PayrollPack`, `resolvePayrollPack`, `custody.unclaimed_property` (E8 shape), `privacy.regime`, `regime.payroll`, `bank_file_op`, `data_protection_regime` ∈ {gdpr,pdpl,dpdp,none}, `custody_status='disposed'`.
- **Verification commands are all repo-real** (`check:tsc`, `check:registry-trigger-parity`, vitest node/scripts projects, `mcp__supabase__*`).
