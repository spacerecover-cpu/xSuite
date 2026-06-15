# xSuite Country Engine — Design Specification (Deliverables #2–#11)

> **Date:** 2026-06-15 · **Status:** Draft for review
> **Companion:** `2026-06-15-country-engine-discovery-brief.md` (Deliverable #1 — grounding, gap analysis, locked decisions, evidence gaps). This document is the design; the brief is its verified factual base. Read the brief first; this spec does not re-derive its facts.
> **Scope:** the system-level architecture, the 6-level hierarchy + RLS, the schema changes, the config-resolution engine, i18n, multi-currency, statutory compliance, reporting, onboarding, the existing-tenant migration, and future scalability — assembled as one coherent program with a single reconciled set of decisions.

---

## 0. Executive summary & the founder call

Here's what I'd actually do.

- **This is ~80% data population + de-hardcoding, not a re-architecture.** The runtime spine already works (`geo_countries → sync_tenant_config_from_country() → tenantConfigService → TenantConfigContext → hooks`). The job is to generalize it from a 1-country/1-tenant flat model to a 6-level cascade, make config migration-free (a jsonb bag + a code registry cloning the proven `feature_flags` pattern), and close the correctness holes (D1–D18).
- **The full 6-level hierarchy is the one genuinely expensive item — so build it additively and phased.** Every hierarchy column is nullable; every existing tenant auto-collapses to one legal entity + one business unit; isolation is extended only by **ADDITIONAL RESTRICTIVE policies ANDed onto the existing `tenant_id` predicate, never by widening it.** Ship the foundation dormant now (cheap, neutral, makes the expensive parts free later); hard-gate live sub-unit isolation behind a named multi-site customer.
- **Statutory correctness is GATING, not a feature.** D1 (input-VAT writer), D4 (EOSB accrual), D5 (rules-driven payroll), and D9 (country-correct tax label) **must ship before any non-OMR tenant is provisioned** — each is a way to file a wrong number with a tax authority or under-accrue a legally mandated liability. This is enforced **per onboarding country**, automatically, at provisioning.
- **Fail-loud, not fail-US.** Country selection becomes a hard provisioning prerequisite; missing country config fails loudly (a thrown `MissingConfigError` / a 422 at provisioning), never a silent `'$'`/`'USD'`/`en-US`/`MM-DD-YYYY` default. One policy change neutralizes most of the hardcoded-assumption blast radius.
- **Statutory values are resolved LIVE and effective-dated at document commit, then snapshotted onto the document row** (`tax_amount`, `exchange_rate`, the per-line assessment) for forensic immutability. The *tenant* config snapshot holds **display/formatting config only** — it never owns tax-rate or FX resolution. This is the single most important reconciliation in this spec (§2A.2 / §4.3 / §7.1) and the one most likely to file a wrong number if left ambiguous.
- **Both tracks run in parallel.** The correctness pass (D1–D18) and the Country Engine framework are the *same edits* — every hardcoded literal site is converted to a resolver read, which is exactly what the engine and its CI guards require.
- **Single-region now.** Add `data_residency_region` + a documented, enforced constraint now (locked to `'global-1'`, EU/regulated countries blocked at provisioning, enforcement covers Supabase **Storage** as well as Postgres rows); defer multi-region infrastructure until a regulated customer signs.

### Locked decisions (recap, from the brief)

1. **Full 6-level hierarchy** (`Global → Region → Country → Tenant → BusinessUnit → Department`) — additive, phased, auto-collapse, ADDITIVE-RESTRICTIVE RLS only.
2. **GCC-deep + globally-wide** — deep statutory for KSA/UAE/Oman; broad currency/locale/date/format for ~all countries.
3. **Both in parallel** — correctness-hardening pass alongside the framework build.
4. **Single-region now, design for later** — residency field + documented constraint now; multi-region infra deferred.

Plus the five architectural decisions the redesign hinges on (brief §6): multi-jurisdiction in scope; jsonb-bag + code-registry config; one snapshot-vs-live policy + re-sync path; statutory correctness as a gating release criterion; fail-loud not fail-US.

### What ships first (ordered)

1. **Unflagged bug fixes:** D6 (broken `onboarding_progress` insert) and D12 (SupplierFormModal silent data loss) — pure correctness, no legal-output change.
2. **Fail-loud foundation:** D2/D3 — delete US fallbacks, `get_base_currency()`, no-stub CI gate; `geo_countries` reference-data population from a maintained dataset.
3. **🔴 Statutory gate (blocks non-OMR):** D1 input-VAT writer, D9 tax label, D10 tax rate, D11 ZATCA-by-country.
4. **🔴 Statutory gate (blocks non-OMR payroll):** D4 EOSB, D5 rules-driven payroll, D15/D16/D17 work-calendar + bank files.
5. **Money correctness:** D7/D8/D13/D14/D18 — base-currency rollups, currency-aware formatting + amount-in-words, with the multi-currency end-to-end reconciliation proof as the release gate.

---

## 1. Gap analysis

The full, evidence-verified gap analysis lives in the **companion discovery brief** (`2026-06-15-country-engine-discovery-brief.md`): the reframe (§0), reusable foundations to build on (§2), the live-defect register with `file:line` evidence (§3), the structural gaps (§4), the blind spots (§5), and the admitted evidence gaps (§7). This spec does not duplicate it. The compact severity table below is reproduced only as the index the design sections reference (each fix names its `D#`).

| # | Defect | Severity |
|---|--------|----------|
| D1 | Input/purchase VAT never recorded (`record_type:'sale'` hardcoded; returns overstate VAT payable) | **Critical** |
| D2 | Fail-US not fail-loud (DB + config US defaults; money columns default `'USD'`) | **Critical** |
| D3 | 72% country stubs (16/58 have currency; `address_format {}` for all 58; `phone_format` 0/58) | **High** |
| D4 | No EOSB / gratuity anywhere | **Critical** (Gulf statutory) |
| D5 | Payroll matches no country (flat 7%; no income tax/employer contributions) | **Critical** |
| D6 | Broken `onboarding_progress` insert kills the post-login wizard | **High** |
| D7 | Dashboards sum raw multi-currency under one symbol | **High** |
| D8 | Bank-balance rollup sums across currencies, no base conversion | **High** |
| D9 | Tax label hardcoded "VAT" regardless of country | **High** |
| D10 | Tax rate default hardcoded 5% | **High** |
| D11 | ZATCA QR emits on a manual toggle, not country | **Medium** |
| D12 | SupplierFormModal drops state/zip to non-existent columns | **Medium** |
| D13 | `amountInWords` hardcodes `/100` (wrong for OMR/JPY) | **High** |
| D14 | ~42 money-rendering bypass sites (`toFixed(2)`/`$`) | **Medium** |
| D15 | Hardcoded Monday week-start / no weekend model | **High** |
| D16 | WPS bank-file hardcodes `'USD'` + `'Bank Muscat'` | **Medium** |
| D17 | Payroll currency dropdown hardcoded | **Medium** |
| D18 | `format.ts` legacy paths hardcode `en-US` + Western grouping | **High** |

---

## 2. Recommended global SaaS architecture — the Country Engine umbrella

> This is the system-level umbrella. It defines **where the Country Engine sits**, **how config flows end-to-end**, the **resolution cascade**, the **jurisdiction-derived vs tenant-chosen** split, **caching/invalidation**, **residency metadata**, and the **"no country-specific code" enforcement model**. The 6-level hierarchy entities and their RLS are detailed in **§2A**; the concrete DDL is owned by **§3**. Connection points to both are stated explicitly.

### 2.1 First-principles framing — what we are actually building

The brief's reframe (§0) is load-bearing: **this is ~80% data population + de-hardcoding + a small set of structural additions, not a re-architecture.** The runtime spine already exists and works:

```
geo_countries (35 cfg cols) ──sync_tenant_config_from_country()──▶ tenants (denormalized cols)
        │                                                                │
        │ (live-join for un-synced fields, verified at tenantConfigService.ts:26-32)
        ▼                                                                ▼
                  tenantConfigService.fetchTenantConfig()  ──▶ TenantConfigContext
                  (5-min Map cache, tenantConfigService.ts:6-7)         │
                                                                        ▼
              useTenantConfig / useCurrencyConfig / useTaxConfig / useDateTimeConfig / useLocaleConfig
                                                                        ▼
                                          components · PDF builders · email · reports
```

The job is therefore not to invent a new spine — it is to **(a)** generalize the spine from a 1-country/1-tenant flat model to a 6-level cascade, **(b)** make the config layer migration-free so ~195 countries can be populated without DDL churn, and **(c)** close the resolution-correctness holes (D2; D7/D8; stale cache for tax/FX). Everything below is additive on the verified spine.

### 2.2 The layered config-resolution model (the cascade)

The Country Engine resolves **one effective config value per key** by walking a fixed precedence chain. The chain has six logical layers but is delivered phased (locked decision #1) — early phases collapse the middle layers to no-ops so nothing breaks.

| # | Layer | Source of truth (today → target) | Mutability | Delivered |
|---|-------|----------------------------------|-----------|-----------|
| L0 | **Global default** | Code registry `COUNTRY_CONFIG_REGISTRY` (new; clones `FEATURE_REGISTRY` at `src/lib/features/registry.ts`) | Code only | Phase 1 |
| L1 | **Region** | `geo_regions` (new — §2A/§3) — e.g. GCC defaults | `is_platform_admin()` | Phase 3+ |
| L2 | **Country** | `geo_countries` (35 cols + new `country_config jsonb`) | `is_platform_admin()` | Phase 1 |
| L3 | **LegalEntity / Tenant** | `tenants` denormalized cols + `tenants.country_config_overrides jsonb`; later `legal_entities` (§2A/§3) | tenant admin | Phase 1 (tenant); Phase 2 (entity) |
| L4 | **BusinessUnit** | `branches` (promoted in place — §2A; nullable, auto-collapsed) | tenant admin | Phase 3+ |
| L5 | **Department** | `departments` (existing HR table; **org-only in P1, not a config-override layer**) | tenant admin | Deferred (§2.10) |

**Resolution rule (single pure function — mirrors `resolveFeatureEnabled` at `resolveFeatures.ts:22-39`):** for any config key `k`, the effective value is the **first non-null override walking L5→L0** — the most-specific layer wins; a layer that has not set `k` is transparent; a registered key that resolves to nothing throws (fail-loud). The canonical implementation is in §4.1; this umbrella only asserts the contract.

This is the structural answer to **D2 (fail-US not fail-loud)** and to the gap "config not extensible without a migration" (brief §4). A new country key ships as one registry entry + zero schema change, exactly like adding a feature toggle today.

### 2.3 Jurisdiction-derived vs tenant-chosen config — the hard separation

The single most important taxonomy decision. Every config key is classified **once, in the registry**, into one of two governance classes. The existing code already validates this cut: `tenantConfigService.ts:93-96` deliberately stops reading `country.language_code` because **UI language is a tenant choice, not a country fact** — that comment is the seed of this taxonomy.

| Class | Definition | Examples | Who may override | Override surface |
|-------|-----------|----------|------------------|------------------|
| **Jurisdiction-derived** (statutory) | Determined by where the legal entity files. Wrong value = legal/tax defect. | `tax_system`, `tax_label`, `tax_number_format`, `default_tax_rate`, `tax_invoice_required`, `zatca_required`, `eosb_required`, `weekend_days`, `fiscal_year_start`, `timezone` | **`is_platform_admin()` only** (at L1/L2); tenant **cannot** override | locked at Region/Country |
| **Tenant-chosen** (preference) | Cosmetic/operational; safe to differ from jurisdiction. | `ui_language`, `theme`, `date_display_format`, decimal display, week-start *display* | tenant admin (L3) | Settings → Appearance / Localization |

Enforcement of the split lives in the registry + RLS, not in component code:
- A `country_config_overrides` write at L3 (tenant) that targets a **jurisdiction-derived** key is rejected by a `BEFORE UPDATE` trigger `validate_country_config_overrides()` on `tenants` (and later `legal_entities`) — it diffs the incoming jsonb keys against the registry's governance class. This is the server-side twin of the client registry. **To prevent the two from drifting (the exact failure D11 represents), the trigger's key-class list is generated from the same registry source — this parity is a CI-asserted deliverable (§2.7), not a noted risk.**
- This directly closes **D11 (non-KSA tenant emits ZATCA QR via a manual toggle)**: `zatca_required` becomes a jurisdiction-derived key resolved from country, never a tenant toggle. The `invoiceAdapter` manual toggle at `invoiceAdapter:241,284` is replaced by a resolver read.

> **Timezone is jurisdiction-derived (single key).** Statutory timestamping (custody/audit) must use the entity's jurisdiction timezone. A separate `display_timezone` (display ≠ legal tz) is **deferred** as YAGNI — no current defect requires a display/stamp split; re-open when a tenant needs a display tz that differs from its legal tz.

### 2.4 Where the Country Engine sits (responsibility diagram)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ REFERENCE-DATA LAYER (global, no tenant_id; SELECT=auth, WRITE=is_platform_admin) │
│  geo_regions ──┐  geo_countries (35 cols + country_config jsonb)   master_*/       │
│  (§2A/§3)      │  geo_subdivisions (§2A/§3)                         catalog_*       │
│                └──▶ sourced from a MAINTAINED dataset (CLDR/ISO 3166/4217),         │
│                     NOT hand-curation  (closes brief §7 provenance gap)             │
└───────────────────────────────┬────────────────────────────────────────────────────┘
                                 │  resolve (display) + LIVE statutory resolution
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ COUNTRY ENGINE  (src/lib/country/* — NEW package; resolver + registry)             │
│  COUNTRY_CONFIG_REGISTRY  ── governance class + L0 defaults + metadata (code)       │
│  resolveConfig()          ── pure cascade L5→L0 (mirrors resolveFeatures.ts)        │
│  countryConfigService     ── builds layer stack from DB; assembles display bag      │
│  resolveStatutory()       ── NON-CACHED, effective-dated tax/FX at commit (§2A.2)   │
│  validate_*_overrides()   ── DB triggers enforcing jurisdiction-derived lockdown    │
└───────────────────────────────┬────────────────────────────────────────────────────┘
                                 │  effective display TenantConfig (one resolved bag)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ RUNTIME RESOLVER (existing, extended)                                              │
│  tenantConfigService.fetchTenantConfig()  ── calls the Country Engine              │
│  cache: class-aware TTL for DISPLAY config (§2.6); statutory reads bypass it        │
│  TenantConfigContext ──▶ useTenantConfig / useCurrencyConfig / useTaxConfig / …     │
└───────────────────────────────┬────────────────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ CONSUMPTION SURFACES (must NOT hardcode — enforced by §2.7)                         │
│  React components · pdfmake builders · email · reports (must use baseAmount, D7/D8) │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Responsibility boundaries:
- **Reference-data layer** owns *facts* (what KSA's standard VAT rate is, effective-dated). Stateless, global, platform-admin-curated, dataset-sourced.
- **Country Engine** owns *resolution* (this entity's effective display config) **and** the separate *statutory resolution* path (this entity's effective VAT rate / FX as-of a document date, resolved live), plus *governance* (who may override what).
- **Runtime resolver** owns *delivery + caching of display config* into React. It is the existing `tenantConfigService` + `TenantConfigContext`, minimally extended — **not rewritten**.
- **Consumption surfaces** own *nothing about jurisdiction*; they read resolved values via hooks.

### 2.5 Request / runtime resolution path

```
Login (staff profile.tenant_id OR portal session tenant_id)     [TenantConfigContext.tsx:48]
   │
   ▼
getTenantConfig(tenantId)                                        [tenantConfigService.ts:104]
   │  cache hit (display TTL) ────────────────────────────────▶ return
   │  miss
   ▼
countryConfigService.resolveForTenant(tenantId):
   1. one query: tenant row + country embed + entity/BU overrides
      (extends the single-query embed at tenantConfigService.ts:20-35 — keep it ONE round trip)
   2. build layer stack [dept(=null in P1), bu, entity/tenant, country, region]
   3. for each registry key → resolveConfig() (L5→L0)
   4. assemble DISPLAY TenantConfig bag (currency/tax LABELS/formats/locale + new country bag)
   │
   ▼
cache.set(tenantId, {config, class-aware timestamps})           [§2.6]
   ▼
TenantConfigContext state → hooks → surfaces
```

> The display bag carries the **tax label and formatting** for rendering. It does **not** carry the resolved tax rate or FX rate used to *compute* a committed money/tax value — those are resolved live at commit via `resolveStatutory()` (§2A.2) and then frozen onto the document row. The display bag may show an indicative current rate; the binding number is always the document-row snapshot.

**Phasing note:** in Phase 1 the layer stack is `[null, null, tenantOverrides, country, null]` — identical observable behavior to today, because every existing tenant auto-collapses to one entity/one BU (locked decision #1). The cascade machinery is live but the middle layers are transparent until §2A populates them.

### 2.6 Caching & invalidation — fixing the 5-min stale-config risk

The current flat **5-minute Map cache** (`tenantConfigService.ts:6-7`, `CACHE_TTL_MS = 5*60*1000`) is correct for *display* config but wrong for *statutory computation*. The reconciliation:

- **Display config is cached** (class-aware TTLs below). It protects the DB on every render and may be modestly stale without harm.
- **Statutory computation is NOT served from the config cache at all.** Document-commit money/tax binding goes through `resolveStatutory(tenantId, docDate)` (§2A.2), which always hits the DB and resolves the **effective-dated** rate/FX as-of the document date. Invoices/quotes/payments are low-frequency, high-stakes events; an extra round trip at commit is correct.

**Tiered TTL for the display bag:**

| Display config class | TTL | Rationale |
|--------------|-----|-----------|
| Tenant-chosen (theme, ui_language, display formats) | 5 min (unchanged) | cosmetic; staleness harmless |
| Jurisdiction-derived display (labels, formats, weekend) | 60 s | rarely changes; cheap to refresh |
| Tax-critical **display** (`tax_label` shown on a form) | 60 s | label drift is cosmetic until commit; the *binding* label is snapshotted on the committed row |

**Invalidation events (push, not just TTL):**
- `updateTenantUiLanguage` already calls `invalidateTenantConfigCache` (`tenantConfigService.ts:127`) — extend this pattern to **every** L3 override mutation.
- Platform-admin edits to `geo_countries` / `geo_regions` bump `geo_countries.config_version int` (new col); the resolver compares cached version on read and discards on mismatch. This closes the **half-snapshot/half-live drift** for *display* config (brief §4) without re-running the sync trigger. (Statutory drift is handled differently — effective-dated rows + the §4.3 re-sync path.)

### 2.7 The "no country-specific code" enforcement model

The architecture is only durable if `if (country === 'KSA')` and `${x.toFixed(2)}` cannot be merged. Enforcement is **ESLint + CI gates**, modeled on the existing schema-discipline gates and the banned-tables rule.

**ESLint rules (new, in `eslint-rules/`):**

| Rule | Bans | Targets |
|------|------|---------|
| `no-hardcoded-money-format` | `.toFixed(2)` on money, `Intl.NumberFormat` literal `currency:'USD'`, literal `'$'`/`'£'` in JSX, `toLocaleString('en-US'/'en-GB')` | **D14, D18** (~42 sites) |
| `no-hardcoded-tax` | string literals `'VAT'`/`'GST'`, numeric tax defaults `5`/`0.05`, `record_type:'sale'` literal | **D1, D9, D10** |
| `no-country-conditional` | `=== 'KSA'`/`'SA'`/`'AE'`/`'OM'` country-code branches outside `src/lib/country/**` and reference-data seeds | core principle |
| `require-tenant-config-import` | money/date/tax rendering without a `useCurrencyConfig`/`useTaxConfig`/`useDateTimeConfig` import in scope (broad enough to catch **service-layer** bypasses, not just components) | D2 blast radius |

`src/lib/country/**` and reference-data seed files are the **only** allowed-list locations for country-code literals.

**CI gates (new required-status checks):**

| Job | Catches |
|-----|---------|
| `country-lint` | the ESLint rules above (PR-blocking) |
| `country-config-completeness` | runs `resolveConfig` for every required key × every `is_active` country; any unresolved required key fails (operationalizes fail-loud; closes **D3**) |
| `registry-trigger-parity` | asserts `validate_country_config_overrides()`'s key-class list matches `COUNTRY_CONFIG_REGISTRY` (prevents the §2.3 drift that re-opens **D11**) |
| `statutory-gate` (release-criterion) | **per onboarding country**, asserts D1/D4/D5/D9 are satisfied for THAT country before a tenant in it is provisioned (§2.7 policy below) |

**Per-country statutory gate (stated decision, not an open question).** The release gate is **per onboarding country**: a tenant in country X is blocked at provisioning until X's statutory pack (D1 input-VAT, D4 EOSB, D5 payroll, D9 label) is present and X's country config passes the no-stub gate. A *global* non-OMR gate is rejected — it would needlessly block OMR-only operation or wave through an unprepared country. Reference data carries a `country_config.config_status` (`stub` → `formatting_ready` → `statutory_ready`); `statutory-gate` reads it per country at provisioning.

**Provisioning enforcement.** `provision-tenant` makes country selection a **hard prerequisite** — no tenant row without a resolved, complete country config. Touching provisioning here also fixes **D6** (the broken `onboarding_progress` insert).

### 2.8 Data residency metadata (single-region now, path to multi-region)

Per locked decision #4: **add the field + a documented, enforced constraint now, defer the infra.**

- Add `data_residency_region text NOT NULL DEFAULT 'global-1'` to `tenants` (and to `legal_entities`), plus a `master_data_residency_regions` lookup (global, platform-admin-write) enumerating allowed regions and their physical Supabase project mapping. **`'global-1'` is the single canonical region code across the whole spec** (it maps to the current project `ssmbegiyjivrcwgcqutu`).
- **One enforcement rule:** until multi-region infra exists, `data_residency_region` may only be `'global-1'`. Provisioning rejects (a) any non-`'global-1'` value and (b) any country whose `geo_countries.requires_local_residency = true` (EU/UK/CH) — both with an explicit "region not yet available" 422. The schema can *express* residency intent before the platform can *honor* it.
- **Enforcement covers Supabase Storage, not just Postgres rows.** Recovered-device file images and manifests live in Storage; residency that protects only the metadata tables is security theater. The provisioning block therefore gates onboarding of a residency-mandated country entirely until a regional project (Postgres **and** Storage bucket) exists.
- **Path to multi-region (deferred):** `data_residency_region → Supabase project URL + Storage endpoint` becomes a routing key; the app selects the client per tenant's region at auth. The field added now is the seam; the resolver needs no rework because residency is metadata *about* a tenant, orthogonal to the config cascade. The tenant↔region binding is **immutable after provisioning** (a region change is a data re-home, not a flag flip).

> **Honest label:** single-region means the residency field routes nothing today — pure forward-investment. That is the correct call, but it must be documented in `DESIGN.md`/the residency doc as **"intent + provisioning block, not multi-region enforcement"** so no one markets EU residency on the strength of a column.

### 2.9 How this connects to the other sections

- **§2A** owns the L1/L4/L5 entities (`geo_regions`, `legal_entities`, promoted `branches`, `departments` scope) and their **ADDITIONAL RESTRICTIVE RLS** (ANDed onto the existing `tenant_id = get_current_tenant_id() OR is_platform_admin()` predicate, never widening it). This umbrella asserts only *that* those layers slot into the cascade at L1/L4/L5.
- **§3 owns all hierarchy / address / tax / currency / EOSB DDL** — the concrete `geo_countries.country_config jsonb` + `config_version`, `tenants.country_config_overrides jsonb`, `data_residency_region`, `master_data_residency_regions`, the `validate_*_overrides()` triggers, the extended `sync_tenant_config_from_country()`, and every table below. §4/§7/§8/§9/§10/§11 **consume** these; they never re-declare them.
- **Correctness pass (D1–D18)** runs in parallel (locked decision #3): the resolver and the de-hardcoding are the *same* edits.

### 2.10 Deliberately deferred (YAGNI discipline)

| Deferred | Why | Re-open trigger |
|----------|-----|-----------------|
| Multi-region infra / per-region Supabase routing | No regulated customer yet | First EU/regulated signed deal |
| **L5 (Department) config overrides + RLS** | No tenant has dept-level divergence; departments aren't isolation boundaries in P1 | A tenant requests dept-level tax/format/confidentiality |
| `display_timezone` (display ≠ legal tz) | No defect requires a display/stamp split | A tenant needs a display tz ≠ legal tz |
| Full statutory **filing submission** (VAT201/GSTR/MTD/ZATCA-Phase-2 transmission) | Out of scope for the config umbrella | After GCC-deep config lands + a signed customer in-jurisdiction |
| Two-store cache split | One display bag + a non-cached statutory commit path suffices | Profiling shows commit-path DB load is a problem |

---

## 2A. The 6-level hierarchy & RLS

> The most expensive, RLS-touching piece of the Country Engine. Designed to **de-risk by construction**: every change is additive, every existing tenant auto-collapses to a working single-entity/single-unit shape, and isolation is only ever *narrowed*, never widened. Grounded against the live schema: 2 tenants, 31 cases, 58 countries, **0 branches / 0 departments / 0 positions**, and `cases.branch_id` confirmed **FK-less** today. **All DDL in this section is owned and emitted by §3; the SQL here is illustrative shape, not a second source.**

### 2A.0 The six levels and what each *is*

| # | Level | Table | Kind | Isolation role |
|---|-------|-------|------|----------------|
| 1 | Global | — (root) | — | Everything; platform admin only |
| 2 | **Region** | `geo_regions` (new) | Global lookup | Reporting/grouping only — **never** an RLS boundary |
| 3 | Country | `geo_countries` (exists) + `geo_subdivisions` (new sub-national) | Global lookup | Config source, not isolation |
| 4 | Tenant | `tenants` (exists) | Workspace | **The existing, unchanged isolation root** |
| 5 | **Business Unit** | `branches` (exists, 0 rows) **promoted in place** | Tenant-scoped | Optional *sub*-isolation, ANDed under tenant |
| 6 | Department | `departments` / `positions` (exist, 0 rows) | Tenant-scoped | HR org rungs (not an isolation boundary in P1) |

Plus the new **`legal_entities`** table — the tax/billing identity that today is wrongly fused onto `tenants` (brief §4). One tenant (workspace) → 1..N legal entities (tax identity) → 1..N business units (operating sites = `branches`).

**Decisive simplification (the single BU-table decision):** `branches` already has `tenant_id NOT NULL`, RESTRICTIVE `branches_tenant_isolation`, the `set_branches_tenant_and_audit` trigger, FKs to country/city, and **0 rows**. We do **not** create a `business_units` table — that would orphan a second org table (the brief §4 anti-pattern). **`branches` is promoted in place as the canonical business-unit entity.** The name stays `branches` (no rename migration); the *concept* is business unit. **Every other section FKs `branches(id)` for the business-unit dimension** — there is no `business_units` table anywhere in this program.

### 2A.1 New global tables — Region & Sub-national jurisdiction

`geo_*` global tables: no `tenant_id`, SELECT `true` for authenticated, write `is_platform_admin()` only.

- **`geo_regions`** (level 2 — reporting/grouping): `code` (`GCC`/`EU`/`MENA`/`APAC`), `name`, self-FK `parent_id`, `data_residency_region` (the locked-decision-#4 hook, defaulted to `'global-1'`), `sort_order`. `geo_countries` gains nullable `region_id uuid REFERENCES geo_regions(id)`, backfilled (KSA/UAE/Oman → `GCC`).
- **`geo_subdivisions`** (level 3b — sub-national jurisdiction): `country_id`, ISO-3166-2 `code` (`US-CA`/`AE-DU`/`IN-MH`), `name`, `subdivision_type`, `tax_authority_code`, self-FK `parent_id`. Replaces free-text `geo_cities.state_province` over time (additive FK, then stop writing the text).

> **Population is gated, not the table.** Shipping the `geo_subdivisions` *table* now is cheap (a hang-point for US-state/emirate tax). **Populating it from ISO 3166-2 for all countries is deferred** until the first US-state / IN-GST / UAE-emirate customer — there is no consumer today. The table exists in the foundation wave; its data load is a P3 item (§2A.9). The `tax_config` rate-resolution semantics belong to §7 (tax engine), not here.

### 2A.2 `legal_entities` — tax identity ≠ workspace, and where statutory values resolve

The single most important structural addition. Today tax identity (`tenants.tax_number`, `tax_system`, `currency_code DEFAULT 'USD'`) is fused to the workspace, forcing one-tenant-one-country. `legal_entities` separates **billing/tax identity** from **workspace**. Shape (DDL in §3e):

- `tenant_id NOT NULL`, `name`, `country_id NOT NULL`, `subdivision_id`, `tax_system NOT NULL DEFAULT 'NONE'`, `tax_number`, `registration_number`, `currency_code text NOT NULL` (**no `'USD'` default — fail-loud, D2**), `config jsonb`, `address jsonb`, `is_primary`, audit columns, `data_residency_region NOT NULL DEFAULT 'global-1'`.
- Standard tenant-scoped envelope: RLS ENABLE+FORCE, RESTRICTIVE `legal_entities_tenant_isolation` (`tenant_id = get_current_tenant_id() OR is_platform_admin()`), `set_legal_entities_tenant_and_audit` trigger, `idx_legal_entities_tenant_id` partial index, partial-unique `uq_legal_entity_primary` (one primary per tenant, mirrors v1.2.0's `uq_customer_primary_company`). It passes `check-tenant-table-requirements.sql` with no special-casing.
- `tenants.tax_system`/`tax_number`/`currency_code` become **legacy snapshot columns** (soft-deprecated, never dropped). The display resolver reads `legal_entities` first, falls back to `tenants`.

**Where statutory tax/FX is resolved (the reconciled policy — read this carefully):**

1. At **document commit**, `resolveStatutory(tenant/entity, docDate)` resolves the **effective-dated** tax rate from `geo_country_tax_rates` (§3c) and the FX rate from the live feed (§6), keyed off the **document date** and the **resolving legal entity's** country/currency. This path is **live, never served from the tenant display snapshot.**
2. The resolved values are then **snapshotted onto the document row** — `tax_amount`, `exchange_rate`, the append-only `tax_line_assessments` row (§7.1) — for forensic immutability. A 2026 invoice reproduces byte-for-byte in 2029 because its rate is frozen on its own row, **not** because a tenant config was frozen.
3. The **tenant snapshot** (`tenants.resolved_country_config`, §4.3) holds **display/formatting config only** and **explicitly excludes tax-rate and FX resolution.** §7 owns statutory resolution; §4 owns display snapshotting; they never overlap.

This reconciles the three previously-divergent positions: snapshot is right for *committed-document immutability* and *display config*; it is wrong as the read path for *computing a new statutory value*, which must resolve effective-dated and live.

### 2A.3 Promote `branches` → business unit; fix `cases.branch_id`

Add the missing parent links to `branches` additively (all nullable): `legal_entity_id` (which tax identity this BU bills under), `parent_branch_id` (nested BUs), `subdivision_id` (precise jurisdiction). `departments` gains nullable `branch_id` for the org tree.

**Fix `cases.branch_id` (the FK-less column, brief §4):** add the FK now — all 31 live cases are `NULL`, so the constraint is immediately satisfiable. Also add nullable `cases.legal_entity_id`. The migration re-verifies `branch_id` is NULL-or-valid immediately before adding the constraint.

> **Forensic guardrail:** `cases.legal_entity_id`/`business_unit_id` are additive scope tags — they do **not** touch `case_job_history`, `audit_trails`, or `chain_of_custody` semantics. Append-only triggers (`trg_log_device_received_custody`, `prevent_audit_mutation`) are untouched.

### 2A.4 Operational tables that gain optional scope columns

Add **nullable** `business_unit_id` (FK → `branches`) and/or `legal_entity_id` (FK → `legal_entities`). Nullable = every existing row and every single-unit tenant ignores them.

| Table | New nullable col(s) | Why |
|-------|--------------------|-----|
| `cases` | `branch_id` (FK now), `legal_entity_id` | Job site + tax identity |
| `invoices` | `legal_entity_id`, `business_unit_id` | Invoice issued by an *entity* (tax number, ZATCA seller), not a workspace |
| `quotes` | `legal_entity_id`, `business_unit_id` | Same tax identity at quote stage |
| `number_sequences` | `legal_entity_id`, `business_unit_id` | Per-entity / per-site statutory numbering |
| `chain_of_custody` | `business_unit_id` (write-once at insert) | Which lab site held the device (forensic locality) |
| `case_devices` | `business_unit_id` | Device physically at a site |
| `payments`, `receipts`, `stock_sales` | `legal_entity_id` | Money flows to a tax identity |

**Custody caveat:** `chain_of_custody` is append-only (REVOKE + `prevent_audit_mutation`). Adding a nullable column is a DDL `ALTER`, not a row mutation — permitted. The column is **write-once at insert** (set by the custody RPCs), never updated.

### 2A.5 Session-context helper — the single BU-claim mechanism

There is **one** business-unit session-claim helper across the whole spec, and it mirrors `get_current_tenant_id()` exactly (**profiles column primary, JWT claim fallback**). The `current_setting('app.business_unit_id')` GUC variant proposed elsewhere is **deleted** — it requires an auth change and is inconsistent with the existing precedent.

```sql
ALTER TABLE public.profiles
  ADD COLUMN business_unit_id uuid REFERENCES public.branches(id),
  ADD COLUMN legal_entity_id  uuid REFERENCES public.legal_entities(id);

CREATE OR REPLACE FUNCTION public.get_current_business_unit_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT business_unit_id FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL),
    nullif(current_setting('request.jwt.claims', true)::json->>'business_unit_id','')::uuid
  )
$$;

CREATE OR REPLACE FUNCTION public.get_current_region_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT gc.region_id FROM public.tenants t JOIN public.geo_countries gc ON gc.id = t.country_id
  WHERE t.id = get_current_tenant_id() AND t.deleted_at IS NULL
$$;  -- region is DERIVED from tenant→country, reporting-only, never gates rows
```

Rationale: profiles-primary is the proven pattern, requires **no Auth/JWT-claim change** to ship Phase 1, and reserves the JWT path as the future "switch active business unit" fallback. `get_current_region_id()` is derived, never stored, and must never sit in a hot-path RLS predicate.

### 2A.6 Per-entity / per-unit tax, currency & sequences

| Concern | Resolution order | Mechanism |
|---------|-----------------|-----------|
| **Currency (display)** | `legal_entities.currency_code` → `tenants.currency_code` → coded default → **fail-loud** | Functional currency is the *entity's*. Kills the `'USD'` default (D2). |
| **Tax system / label / number (display)** | `legal_entities.tax_system`/`tax_number` → `tenants.*` (legacy) → `geo_countries` | Per-entity ZATCA/VAT/TRN. |
| **Tax rate (binding)** | `geo_country_tax_rates` effective-dated, as-of doc date (§3c/§7) | The *only* source for a computed rate; never the display snapshot. |
| **Number sequences** | `(tenant_id, scope, legal_entity_id, business_unit_id)` composite | A KSA entity and a UAE entity under one tenant get separate statutory invoice runs. |

`number_sequences` gains nullable `legal_entity_id`/`business_unit_id` with a coalesce-based unique index so the existing 15 sequences (all entity/unit `NULL`) keep their `(tenant_id, scope)` identity. `get_next_number(scope)` gains optional `p_legal_entity_id`/`p_business_unit_id` defaulting `NULL`.

### 2A.7 The RLS extension pattern — ADDITIONAL RESTRICTIVE, never widening

**The cardinal rule (locked decision #1):** sub-unit isolation is a **second RESTRICTIVE policy** ANDed onto the untouched `*_tenant_isolation` policy. We never edit `get_current_tenant_id()` and never relax the existing predicate. Two RESTRICTIVE policies = `tenant_predicate AND business_unit_predicate` — strictly narrower, provably cannot widen access.

The business-unit predicate is **opt-in per tenant** (feature flag, cloning the `feature_flags` pattern) and **null-safe**:

```sql
CREATE OR REPLACE FUNCTION public.business_unit_scoping_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((SELECT (feature_flags->>'business_unit_isolation')::boolean
                   FROM public.tenants WHERE id = get_current_tenant_id()), false)
$$;

CREATE POLICY cases_business_unit_isolation ON public.cases
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    is_platform_admin()                         -- platform admin unaffected
    OR NOT business_unit_scoping_enabled()      -- flag off ⇒ no-op (collapse case)
    OR get_current_business_unit_id() IS NULL   -- tenant-wide user ⇒ sees all units
    OR branch_id IS NULL                        -- unscoped/pre-rollout rows visible to all
    OR branch_id = get_current_business_unit_id()-- the actual narrowing
  );
```

This exact 5-clause template is applied uniformly to each operational table that gained `business_unit_id` (§2A.4) — **one reviewable shape, copy-pasted with the column name swapped.** Phase 1 ships every such policy **flag-off everywhere** — a pure no-op, fully testable, zero behavior change. `legal_entities` does *not* get a sub-isolation policy (entities are visible tenant-wide; you bill from any of your own). The `tenant-table-requirements` CI check is extended to assert the paired BU policy exists wherever `business_unit_id` is present.

> **Append-only safety:** the additional policy on `chain_of_custody` is `FOR ALL` but the table already REVOKEs UPDATE/DELETE and has `prevent_audit_mutation`; the policy can only further restrict SELECT/INSERT, never re-enable mutation.

### 2A.8 Backfill & rollout — auto-collapse so nothing breaks

Idempotent backfill, run inside the migration after DDL. **The currency/tax identity it seeds must be a *real resolved* identity, not a placeholder** — this is the fail-loud guard:

1. **One primary `legal_entities` per tenant**, seeded from the tenant's current tax identity — **but the backfill validates that `tenants.currency_code` is a genuine resolved currency (3-letter ISO, present in `master_currency_codes`, not the `'USD'` placeholder for an OMR tenant) before the collapse.** If the source is the placeholder or null, the migration **fails loud per-tenant** with an explicit "tenant N has an unresolved currency identity; populate its real currency before hierarchy collapse" error. It never blindly copies a bad `'USD'`. (The 2 live OMR tenants are re-verified to carry real OMR identity in §10b before this runs.)
2. **One default `branches` row per tenant** ("Main", `code='MAIN'`) linked to that entity.
3. **Region/subdivision backfill** from the maintained reference set (CLDR/ISO) — `geo_countries.region_id` populated; `geo_subdivisions` **population deferred** (§2A.1).
4. **Existing operational rows: leave `business_unit_id`/`legal_entity_id` NULL.** The §2A.7 `branch_id IS NULL` clause keeps them universally visible. No data rewrite, no custody rewrite.

**Provisioning** also inserts the primary `legal_entities` row + `Main` branch in the same transaction (dovetails with the D6 fix). `sync_tenant_config_from_country()` is extended to stamp the primary entity's `currency_code`/`tax_system` when a tenant's country changes.

### 2A.9 Phasing — what ships first vs. gated behind a named customer

| Phase | Scope | Gate |
|-------|-------|------|
| **P0 — Foundation (ship now, behaviour-neutral)** | `geo_regions` + `geo_subdivisions` tables (table only, population deferred); `legal_entities` + RLS + trigger; backfill (§2A.8) → 1 entity + 1 `Main` BU per tenant; `cases.branch_id` **FK added**; nullable scope cols; `get_current_business_unit_id()`/`get_current_region_id()`; **all `*_business_unit_isolation` policies created but flag OFF**; regen `database.types.ts`. | None — pure additive, zero behavior change. |
| **P1 — Multi-entity tax/billing** | Display resolver reads `legal_entities` first; per-entity `number_sequences`; provisioning creates entity + Main BU + fixes D6; UI to add a 2nd legal entity (manager+, audited, mirrors `ManageCompaniesModal`). | First tenant needing ≥2 tax identities. Ties to D1/D9/D10/D11. |
| **P2 — Sub-unit isolation live** | Flip `feature_flags.business_unit_isolation` per opted-in tenant; assign `profiles.business_unit_id`; BU management UI; §2A.7 narrowing becomes active. | **Hard-gated behind a named multi-site customer.** |
| **P3 — Sub-national tax + deeper org** | `geo_subdivisions` **population** + `tax_config` rate resolution (§7); `departments.branch_id` org-tree UX; nested BUs. | Named US-state / IN-GST / UAE-emirate customer. |
| **Deferred** | Multi-region infra; L5 department config/RLS. | Signed EU/regulated customer; dept-divergence request. |

### 2A.10 Honest cost of locked decision #1

1. **RLS surface multiplication.** Every BU-isolated table carries a second RESTRICTIVE policy to author, test, and keep in lockstep forever. The 5-clause template + the extended `tenant-table-requirements` assertion are the mitigation. We ship it dormant (flag-off) to avoid a second RLS migration later — carrying-cost now to buy zero-rework later.
2. **`branches`-as-business-unit naming gap.** The table says `branches`, the concept is business unit. A future cosmetic rename via view is cheap; a data migration is not — so we don't rename now. Flagged as deliberate debt.
3. **`legal_entities` is 1:1 overhead until P1.** But building it now is near-free (2 tenants, 0 non-OMR invoices) and catastrophically expensive later (rewriting every issued invoice's tax identity). Do it while the data is empty.

**Net call:** ship **P0 in full now** (it makes the expensive parts free later), ship **P1 with the correctness pass**, and **hard-gate P2/P3 behind named customers.** The expensive thing — live sub-unit RLS — stays dormant until a customer pays for it.

---

## 3. Required database / schema changes

Every change below is **additive-safe** (new nullable columns, new tables, new policies; zero `DROP`, zero `DELETE`, zero non-null backfill that can fail) and conforms to the project's migration discipline. **This section is the single DDL owner for the whole program** — §2A specifies shapes and contracts; §4/§7/§8/§9/§10/§11 *consume* these objects and must not re-declare them. Every table was verified against the live DB before writing. Group into ~8 migrations; each regenerates `database.types.ts` and uses `.github/PULL_REQUEST_TEMPLATE/migration.md`.

**Verified baselines that shape this section:**
- `geo_countries` already has the 35 config columns (incl. fail-US defaults `currency_symbol '$'`, `tax_system 'NONE'`, `date_format 'MM/DD/YYYY'`, `timezone 'UTC'`, `locale_code 'en-US'`, `week_starts_on 0`, `address_format '{}'::jsonb`).
- The FX/base pattern on the 5 core financial tables is exactly `currency text + exchange_rate numeric + rate_source text + <amount>_base numeric(19,4)`. **Clone this verbatim** onto the gap tables.
- `tax_rates` exists but is a flat tenant table (`name, rate, is_default`) with no country link / rate-class / effective dating → country tax rate sets are a *new global* table, not an edit to `tax_rates`.
- `notification_templates` already exists and is localized (`tenant_id, event_type, channel, locale, …`) → §3i is an **overlay**, not a new table.
- Tenant-table trigger convention is `set_<table>_tenant_and_audit`.

### Migration map (ordering matters — FKs flow downward)

| Mig | Scope | New objects |
|----|-------|-------------|
| M-A | `geo_countries` config bag + labor/format columns + currency guard + residency cols | columns only |
| M-B | Sub-national jurisdiction | `geo_regions`, `geo_subdivisions` (+ `master_data_residency_regions`) |
| M-C | Country tax rate sets | `geo_country_tax_rates` |
| M-D | Work calendar | `geo_public_holidays` (+ weekend cols in M-A) |
| M-E | Org hierarchy (phased, nullable) | `legal_entities` + promote `branches` + nullable FK columns |
| M-F | Structured address (D12) | `structured_addresses` + nullable FK columns on 5 holders |
| M-G | Currency/FX gap-fill | columns on `stock_sales`, `payroll_records`, `purchase_orders`, `receipts` |
| M-H | EOSB + jurisdiction-overlay lookups + seq vocab | `geo_country_eosb_policies`, `employee_eosb_accruals`, lookup `country_id/deleted_at`, `tenant_leave_types`/`tenant_payroll_components`, `number_sequences` vocab |

### (a) `geo_countries` extensions — config bag + labor + format + currency guard + residency

`geo_countries` is global (no `tenant_id`): SELECT `true`, write `is_platform_admin()`. No RLS/trigger/index changes.

```sql
ALTER TABLE geo_countries
  ADD COLUMN country_config        jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- the feature_flags clone (§4)
  ADD COLUMN config_version        integer     NOT NULL DEFAULT 1,            -- bumped on edit; drives §2.6/§4.3 invalidation
  ADD COLUMN weekend_days          int[]       NOT NULL DEFAULT '{0,6}',      -- ISO dow; GCC = {5,6}; fixes D15
  ADD COLUMN statutory_workweek    numeric(4,2),
  ADD COLUMN social_security_schema jsonb      NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN income_tax_brackets   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN eosb_formula          jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- canonical store is geo_country_eosb_policies (§h)
  ADD COLUMN overtime_premiums     jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- day-class multipliers (D15)
  ADD COLUMN digit_grouping        text        NOT NULL DEFAULT '3',          -- '3' Western | '3;2' Indian — fixes D18
  ADD COLUMN reference_dataset_version text,                                  -- CLDR/ISO provenance (closes brief §7)
  ADD COLUMN region_id             uuid REFERENCES geo_regions(id),           -- FK wired after M-B
  ADD COLUMN requires_local_residency boolean NOT NULL DEFAULT false,         -- EU/UK/CH gate (§2.8/§7.4)
  ADD COLUMN data_protection_regime text;                                     -- 'gdpr'|'pdpl'|'dpdp'|'none'
```

**Currency / no-stub guard (D2/D3, made structural).** Do not flip the legacy `'$'` defaults destructively. Add a validity status + a tolerant CHECK so legacy stubs survive but new stub rows are blocked, and provisioning refuses any country whose `config_status='stub'`:

```sql
ALTER TABLE geo_countries
  ADD COLUMN config_status text NOT NULL DEFAULT 'stub'
    CHECK (config_status IN ('stub','formatting_ready','statutory_ready')),
  ADD CONSTRAINT chk_country_currency_nonstub
    CHECK (config_status = 'stub' OR (currency_code IS NOT NULL AND currency_code <> '' AND char_length(currency_code)=3))
    NOT VALID;  -- additive-safe; VALIDATE after backfill
```

`config_status` is also what the **per-country `statutory-gate`** (§2.7) reads: `statutory_ready` is required to provision a tenant in that country. The `country_config` jsonb splits statutory rules between typed columns and untyped jsonb deliberately (migration-free new keys); the **registry is the schema-of-record** for `country_config` (§4), validated code-side.

**Obligation:** regen `database.types.ts`; update `geoCountryService`, `tenantConfigService.ts`, `TenantConfigContext`, and extend `sync_tenant_config_from_country()` to copy the new fields + add the re-sync RPC (§4.3) — closing the brief §4 half-snapshot drift.

### (b) Sub-national jurisdiction — `geo_regions`, `geo_subdivisions` (+ residency lookup)

Both global (no `tenant_id`): SELECT `true`, write `is_platform_admin()`. `geo_regions` = supranational grouping (GCC/EU/APAC) for §2A's Region level; `geo_subdivisions` = the missing state/province/emirate layer.

```sql
CREATE TABLE geo_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, name text NOT NULL,
  parent_id uuid REFERENCES geo_regions(id),
  data_residency_region text NOT NULL DEFAULT 'global-1',
  sort_order int DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE geo_subdivisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES geo_countries(id),
  parent_id uuid REFERENCES geo_subdivisions(id),
  code text NOT NULL, name text NOT NULL, subdivision_type text, tax_authority_code text,
  sort_order int DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id, code)
);
CREATE INDEX idx_geo_subdivisions_country ON geo_subdivisions(country_id) WHERE deleted_at IS NULL;

CREATE TABLE master_data_residency_regions (   -- the single residency vocabulary; 'global-1' is the only active row today
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,                    -- 'global-1' (maps to ssmbegiyjivrcwgcqutu)
  display_name text NOT NULL, supabase_ref text, storage_endpoint text,
  is_active boolean NOT NULL DEFAULT true, deleted_at timestamptz
);
```

After M-B, wire `geo_countries.region_id` FK; migrate `geo_cities.state_province` reads to `geo_subdivisions` over time. **`geo_subdivisions` population is gated** (§2A.1/§2A.9 P3) — the table ships empty; its ISO-3166-2 seed lands with the first sub-national-tax customer.

### (c) Country-linked effective-dated tax rate sets — `geo_country_tax_rates` (the single tax-rate source)

**This is the one effective-dated tax-rate table for the whole program.** There is no `master_tax_rates`; every section that resolves a tax rate reads `geo_country_tax_rates`. The scalar `geo_countries.default_tax_rate` is kept (not dropped) as a **read-fallback only — the runtime never reads it directly**, it falls through the resolver. Global table (write `is_platform_admin()`).

```sql
CREATE TABLE geo_country_tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES geo_countries(id),
  subdivision_id uuid REFERENCES geo_subdivisions(id),   -- NULL = national; set = state/emirate-level
  tax_category_id uuid REFERENCES master_tax_categories(id),  -- §7.1.1 (standard/zero_rated/exempt/...)
  rate numeric(7,4) NOT NULL,
  tax_system text NOT NULL,             -- 'VAT'|'GST'|'SALES_TAX' — drives D9 label
  tax_label text NOT NULL,              -- denormalized at seed from geo_countries.tax_label; the label valid AT the doc date (D9)
  component_label text,                 -- 'CGST'/'SGST' for IN; null otherwise
  applies_to text NOT NULL DEFAULT 'both' CHECK (applies_to IN ('output','input','both')),  -- both-sided for D1
  effective_from date NOT NULL, effective_to date,        -- supersession by INSERT, never UPDATE
  is_default boolean NOT NULL DEFAULT false,
  deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_country_tax_rates_lookup
  ON geo_country_tax_rates(country_id, effective_from) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_country_tax_default
  ON geo_country_tax_rates(country_id, coalesce(subdivision_id,'00000000-0000-0000-0000-000000000000'::uuid),
                           tax_category_id) WHERE is_default AND deleted_at IS NULL;
```

**The single tax-label/rate resolution path** (resolves the §2.3 / §7.1.3 ambiguity): the runtime resolves the row where `effective_from <= doc_date < coalesce(effective_to,'infinity') AND deleted_at IS NULL`, reads its `tax_label`/`rate`/`tax_system`. `geo_countries.tax_label`/`default_tax_rate` are **fallbacks the resolver may use only when no rate row exists** — never read directly by `useTaxConfig` or any adapter. `useTaxConfig().label` reads *through* this resolver, not off the scalar column. This kills the half-snapshot drift the brief forbids and fixes **D9/D10** at the data layer.

### (d) `geo_public_holidays` + weekend model

Weekend lives on `geo_countries.weekend_days int[]` (§a — fixes **D15**). Holidays = new global table (write `is_platform_admin()`), with optional `subdivision_id` for regional holidays: `country_id`, `subdivision_id`, `holiday_date`, `name`, `is_recurring`, `day_class` (ties to `overtime_premiums`), unique `(country_id, holiday_date, name)`, partial index on `(country_id, holiday_date)`. Consumers: `TimesheetManagement.tsx`, leave-day counting, the overtime engine.

### (e) Org hierarchy — `legal_entities` (promote `branches`; no `business_units` table)

`legal_entities` is the **only** new org table — there is **no `business_units` table**; the business-unit dimension is the existing `branches` table promoted in place (§2A). Tenant-scoped full pattern (RLS ENABLE+FORCE, RESTRICTIVE isolation, `set_legal_entities_tenant_and_audit`, `idx_legal_entities_tenant_id`).

```sql
CREATE TABLE legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  country_id uuid NOT NULL REFERENCES geo_countries(id),
  subdivision_id uuid REFERENCES geo_subdivisions(id),
  name text NOT NULL, registration_number text,
  tax_system text NOT NULL DEFAULT 'NONE', tax_identifier text,
  currency_code text NOT NULL,                  -- per-entity functional currency; NO 'USD' default (D2)
  config jsonb NOT NULL DEFAULT '{}'::jsonb, address jsonb NOT NULL DEFAULT '{}'::jsonb,
  registered_address_id uuid REFERENCES structured_addresses(id),  -- §f
  data_residency_region text NOT NULL DEFAULT 'global-1',
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_legal_entity_primary ON legal_entities(tenant_id) WHERE is_primary AND deleted_at IS NULL;

-- promote branches in place (the business-unit entity):
ALTER TABLE branches
  ADD COLUMN legal_entity_id  uuid REFERENCES legal_entities(id),
  ADD COLUMN parent_branch_id uuid REFERENCES branches(id),
  ADD COLUMN subdivision_id   uuid REFERENCES geo_subdivisions(id),
  ADD COLUMN address_id       uuid REFERENCES structured_addresses(id);
```

Plus the **phased nullable FK columns** (§2A.4) on `cases`/`invoices`/`quotes`/`payments`/`receipts`/`stock_sales`/`chain_of_custody`/`case_devices`/`number_sequences`, all FKing `legal_entities(id)` and/or `branches(id)`. **Isolation is the ADDITIONAL RESTRICTIVE BU policy of §2A.7** (one session-claim helper, `get_current_business_unit_id()`; no GUC). **Auto-collapse backfill** per §2A.8 (with the real-currency validation guard). `cases.branch_id` gets its missing FK here (all 31 rows NULL; re-verified before the constraint add).

### (f) Structured address model — fixes D12 (data-capture now; rendering gated)

Two divergent shapes exist (verified): `customers_enhanced/companies/suppliers/branches` use `address text + city_id + country_id`; `employees` uses flat `city/country/postal_code text`. `SupplierFormModal` writes state/zip to non-existent columns → silent loss (**D12**). Unify via one tenant-scoped `structured_addresses` table referenced by nullable FK from each holder (additive, no drops, old `address text` kept as legacy/display fallback): `tenant_id`, `street_lines text[]`, `locality`, `subdivision_id`, `region_text`, `postal_code`, `country_id`, `formatted_cache`. Full tenant pattern. Nullable `address_id` FK added to `customers_enhanced`, `companies`, `suppliers`, `branches`, `employees`.

> **Separate two concerns the reviewer must not conflate:**
> - **D12 data-capture fix ships NOW, no dependency:** `SupplierFormModal.tsx:321` rewires to write `street_lines/subdivision_id/postal_code` into `structured_addresses` instead of dropping them. The defect (state/zip dropped) is fixed by the structured columns regardless of formatting.
> - **Address *rendering* is gated on CLDR population:** `geo_countries.address_format` is `{}` for all 58 today, so `formatAddress(parts, address_format)` is a no-op until the data-population pass lands. Until then, rendering falls back to the current line-stack. Do **not** block the cheap D12 correctness fix on the address-format data load.

### (g) Currency + FX + base columns on the gap tables

Clone the verified core pattern (`currency text + exchange_rate numeric + rate_source text + <amount>_base numeric(19,4)`). All additive nullable; backfill `currency` from the tenant base currency and `*_base = amount` with `exchange_rate=1` for existing rows (exact — FX feed has 0 non-unity rows). Closes brief §4 currency gaps; unblocks D7/D8.

```sql
ALTER TABLE receipts ADD COLUMN currency_code text;   -- had base+rate+source, missing currency_code
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
```

No new RLS. Callers: `currencyService.resolveRateContext` + `financialMath.baseAmount()` on insert/update for POs, stock sales, receipts, payroll; dashboard rollups switch to `*_base` (D7/D8). The currency-column defaults are flipped off `'USD'` to `get_base_currency()` per §6.5.

### (h) EOSB tables/columns — fixes D4

No EOSB anywhere today (grep 0). A global policy table (statutory formula per country) + a tenant-scoped append-only accrual ledger.

```sql
CREATE TABLE geo_country_eosb_policies (   -- global; write is_platform_admin()
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES geo_countries(id), name text NOT NULL,
  tiers jsonb NOT NULL,                  -- [{years_from,years_to,days_per_year}]
  base_wage_components text[] NOT NULL DEFAULT '{basic}', cap_months numeric,
  resignation_scale jsonb, effective_from date NOT NULL, effective_to date,
  deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employee_eosb_accruals (     -- tenant-scoped, append-corrections-only
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id), employee_id uuid NOT NULL REFERENCES employees(id),
  policy_id uuid REFERENCES geo_country_eosb_policies(id),
  as_of_date date NOT NULL, accrued_days numeric(8,2) NOT NULL, accrued_amount numeric(19,4) NOT NULL,
  currency text NOT NULL, amount_base numeric(19,4),
  event text,                            -- 'accrual'|'payout_resignation'|'payout_termination'|'forfeit'
  deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid
);
CREATE INDEX idx_employee_eosb_accruals_tenant_id ON employee_eosb_accruals(tenant_id) WHERE deleted_at IS NULL;
```

Full tenant pattern on the accrual ledger; treated as **append-corrections-only** (post a reversing/closing row, never UPDATE). **Gating release criterion (per country) for any GCC tenant (D4).** Caller: a new `eosbService.ts` + a payroll-period accrual writer; surfaced on the employee record and in termination settlement.

### (i) `notification_templates` — localized (overlay, not new table)

The table already exists per-tenant + per-locale. The gap is no global/country default layer. Add a global `master_notification_templates` default/overlay (write `is_platform_admin()`): `event_type`, `channel`, `locale`, `country_id` (NULL = global default), `subject_template`, `body_template`, `link_template`, unique `(event_type, channel, locale, coalesce(country_id,...))`. Resolution: tenant override (`notification_templates`) → country default → global default → coded fallback. Caller: `send-document-email` + a notification resolver; seed from the 13-language `documentTranslations.ts` corpus.

### (j) `number_sequences` format vocabulary

Verified shape: only `prefix, current_value, reset_annually, last_reset_year`. Add (all nullable): `format_template` (`{PREFIX}-{ENTITY}-{FY}-{SEQ:0000}`), `reset_basis` (`never`/`calendar_year`/`fiscal_year`/`month`), `fiscal_year_anchor`, `legal_entity_id` (FK `legal_entities`), `business_unit_id` (FK **`branches`**), `last_reset_period`. `get_next_number(scope)` renders `format_template` tokens; keeps `prefix`/`reset_annually` as legacy inputs. A `seed_number_sequences(tenant_id)` RPC makes the 15-row seed deterministic (closes brief §7 evidence gap #2); it is called by `seed_new_tenant` (§9.6).

### (k) Jurisdiction-loaded global lookups — `country_id`/`deleted_at` + overlay model

`master_leave_types` and `master_payroll_components` have **only `id`** matching jurisdiction/soft-delete filters (brief §4). Two additive moves:

1. **Annotate the global rows:** add `country_id` (NULL = universal), `region_id` (FK `geo_regions`), `deleted_at` to both.
2. **Tenant overlay tables** (cloning the `accounting_locales` precedent): `tenant_leave_types` and `tenant_payroll_components`, tenant-scoped full pattern, with `master_*_id` FK (NULL = tenant-custom), `is_enabled`, config. Resolution: tenant overlay (enabled) ∪ global rows where `country_id IS NULL OR country_id = tenant.country_id OR region_id = tenant.region_id`. Callers: HR leave config + `payrollService.ts` (which hardcodes flat 7% — **D5**).

### `database.types.ts` regen + caller-update obligation (every migration)

After each of M-A…M-H: `mcp__supabase__generate_typescript_types` → overwrite `src/types/database.types.ts` (never hand-edit); the schema-drift CI gate must pass. Notable caller obligations: M-A → `geoCountryService`, `tenantConfigService.ts`, `TenantConfigContext`, `sync_tenant_config_from_country()`, `format.ts` (D18); M-C → `vatService.ts` (D1), `InvoiceFormModal`/`QuoteFormModal` (D9/D10), `invoiceAdapter` (D9/D11); M-F → `SupplierFormModal.tsx:321` (D12); M-G → `currencyService.ts`, `financialMath.baseAmount()`, PO/stock/receipt/payroll services, dashboards (D7/D8); M-H → `eosbService.ts` (D4), `payrollService.ts` (D5/D16/D17). Audit/custody/`case_job_history` are untouched; `employee_eosb_accruals` is append-corrections-only in the service layer.

---

## 4. The Country Engine — config framework (jsonb bag + code registry + pure resolver)

The Country Engine is **not** a new subsystem. It is the `feature_flags` extensibility pattern (`src/lib/features/`) lifted from "booleans the tenant toggled" into "typed config values resolved across the jurisdiction hierarchy." The proven shape — **jsonb override column + code registry of typed defaults + pure injected resolver** (`registry.ts:116` → `resolveFeatures.ts:22`) — ports almost verbatim. New country-driven keys ship as a one-line registry entry, **zero migration** (brief §4).

Verified ground truth: `tenants.feature_flags` is `jsonb`; `geo_countries` has 35 config columns and no jsonb bag (until §3a adds `country_config`); the sync trigger fires only on INSERT or `country_id` change (so a `geo_countries` correction never reaches provisioned tenants — the §4 gap).

### 4.1 The resolution hierarchy + the load-bearing resolver

Precedence chain (later layers override earlier; most-local wins), subsuming today's `accounting_locales > tenants > geo_countries > coded default`:

```
coded default  →  global  →  region  →  country  →  legal_entity  →  tenant override  →  business_unit override
   (lowest precedence)                                                                  (highest precedence)
```

| Layer | Source (jsonb bag column) | Who writes |
|---|---|---|
| coded default | `COUNTRY_CONFIG_REGISTRY` (code) | engineers |
| global | `system_settings.country_config` | platform admin |
| region | `geo_regions.config` | platform admin |
| country | `geo_countries.country_config` | platform admin |
| legal_entity | `legal_entities.config` | tenant admin |
| tenant override | `tenants.country_config_overrides` | tenant admin |
| business_unit override | `branches.config` | tenant admin |

`accounting_locales` **folds in at the tenant-override altitude** as a synthetic override map (not a parallel chain): the active default row's currency/date columns are projected into the tenant layer just before `tenants.country_config_overrides`. One chain, no special-casing across 42 consumer sites.

**The resolver is the single load-bearing function the entire engine rests on. It is corrected here to a clean, compiling implementation** (the previously-drafted body had a comma-operator / double-assignment bug that would silently mis-resolve):

```ts
// src/lib/country/resolveCountryConfig.ts  (pure; registry + layers injected — mirrors resolveFeatures.ts)
export type ConfigLayers = {
  global?: ConfigBag; region?: ConfigBag; country?: ConfigBag;
  legalEntity?: ConfigBag; tenant?: ConfigBag; businessUnit?: ConfigBag;
};
export type ConfigBag = Record<string, unknown>;

// least → most specific; later wins
const ORDER: (keyof ConfigLayers)[] =
  ['global', 'region', 'country', 'legalEntity', 'tenant', 'businessUnit'];

export function resolveConfig<T>(
  registry: Record<string, ConfigKeyDef>,
  layers: ConfigLayers,
  key: string,
): T {
  const def = registry[key];
  if (!def) throw new CountryConfigError(`Unregistered country-config key: ${key}`); // unknown key THROWS
  let value: unknown = def.codedDefault;            // lowest precedence
  for (const layer of ORDER) {
    const bag = layers[layer];
    if (bag && key in bag && bag[key] != null) {
      value = bag[key];                             // most-specific non-null wins (clean assignment)
    }
  }
  const parsed = def.schema.safeParse(value);       // typed-but-open: validate on read
  if (!parsed.success) throw new CountryConfigError(`Invalid value for ${key}: ${parsed.error.message}`);
  if (def.required && parsed.data === REQUIRED_SENTINEL)
    throw new CountryConfigError(`Required country-config key '${key}' unresolved — country not configured (fail-loud, D2)`);
  return parsed.data as T;
}
```

This is the same injected-registry, dependency-free, unit-testable contract as `resolveFeatureEnabled`, with two upgrades: values are typed (validated on read via a per-key schema); an **unregistered key throws** rather than returning a permissive default — the **opposite** safety bias from feature-flag visibility (`resolveFeatures.ts:28` returns `true` for unknown keys; config must not, because config feeds money/tax/legal output). The test file (`resolveCountryConfig.test.ts`) **must pin this inversion** as a required assertion alongside precedence and fail-loud.

### 4.2 The key registry — typed-but-open

Mirror `FEATURE_REGISTRY`: one array, one entry per key, defaults + metadata in code; typed (each key declares a Zod schema + TS type) yet open (adding a key is an array push; the jsonb columns need no DDL).

```ts
export interface ConfigKeyDef {
  key: string; domain: ConfigDomain; label: string; description: string;
  schema: ZodType; codedDefault: unknown;          // NEVER a US fabrication for required keys → REQUIRED_SENTINEL
  required?: boolean;
  maxOverrideLayer?: 'country' | 'legal_entity' | 'tenant' | 'business_unit'; // statutory keys country-locked
}

export const COUNTRY_CONFIG_REGISTRY: ConfigKeyDef[] = [
  { key: 'currency.code', domain: 'currency', schema: z.string().length(3), codedDefault: REQUIRED_SENTINEL, required: true, /*…*/ },
  { key: 'tax.label', domain: 'tax', schema: z.string(), codedDefault: REQUIRED_SENTINEL, required: true, /* D9 */ },
  { key: 'tax.default_rate', domain: 'tax', schema: z.number().min(0).max(100), codedDefault: REQUIRED_SENTINEL, required: true, /* D10 */ },
  { key: 'tax.zatca_qr.enabled', domain: 'tax', schema: z.boolean(), codedDefault: false, maxOverrideLayer: 'country', /* D11 */ },
  { key: 'datetime.weekend_days', domain: 'datetime', schema: z.array(z.number().int().min(0).max(6)), codedDefault: [6,0], /* D15 */ },
  { key: 'number_format.amount_in_words_minor_units', domain: 'number_format', schema: z.number().int().min(0).max(4), codedDefault: REQUIRED_SENTINEL, required: true, /* D13 */ },
  // labor.eosb.enabled (D4), labor.payroll.tax_method (D5), … same shape
];
```

`maxOverrideLayer` is the typed-config analogue of feature `core`: a statutory key (`tax.zatca_qr.enabled`) is country-locked so no tenant can fake compliance (**D11**). **Enforcement is checked on WRITE (admin UI + the `validate_country_config_overrides()` trigger) and on READ (resolver)** — and the trigger's statutory-key list is generated from this same registry (the `registry-trigger-parity` CI gate, §2.7), so the client and server can't drift.

### 4.3 Snapshot vs live — the reconciled, scoped policy

**Decision: SNAPSHOT the resolved *display/formatting* bag onto the tenant; resolve *statutory tax/FX* LIVE and effective-dated at commit; never snapshot statutory rate/FX onto the tenant.** This is the single reconciliation the whole spec hinges on.

- **What is snapshotted onto `tenants.resolved_country_config`:** currency *display* config (symbol, decimals, position), date/number formats, locale, tax *label*, weekend display, address format — i.e. everything in the §2.6 display bag. This gives forensic-document reproducibility *for formatting* and tenant sovereignty over deliberate display choices, and avoids an N-layer join per render.
- **What is explicitly EXCLUDED from the tenant snapshot:** the tax *rate*, the FX *rate*, and any value used to *compute* a committed money/tax figure. Those are owned by §7 and resolved live, effective-dated, as-of the document date, then **frozen onto the document row** (`tax_amount`, `exchange_rate`, `tax_line_assessments`). A frozen tenant snapshot *cannot* satisfy effective-dating; using it to compute a statutory value would file a wrong number.

So: snapshot = formatting/display config **plus** per-document committed values (on the document row). Live + effective-dated = tax-rate/FX resolution at commit. These two never overlap.

**Why snapshot the display bag (decisively):** forensic immutability of formatting; performance/cache fit; tenant sovereignty over display choices. **The cost it forces (flagged):** a country *display* correction does not auto-reach provisioned tenants — so snapshot is only safe **if** the re-sync path ships in the same release. Without it, snapshot is strictly worse than today. Non-negotiable and gated.

**The mandatory re-sync / backfill path** (display config only — statutory corrections propagate via effective-dated rows, not re-sync):

```sql
ALTER TABLE tenants ADD COLUMN country_config_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;   -- tenant overrides
ALTER TABLE tenants ADD COLUMN resolved_country_config jsonb NOT NULL DEFAULT '{}'::jsonb;     -- the DISPLAY snapshot
ALTER TABLE tenants ADD COLUMN country_config_version integer;                                 -- which template version snapped
-- geo_countries.config_version (§3a) bumps on edit
```

`resync_tenant_country_config(p_tenant_id)`: recompute the coded→global→region→country **display** bag; write `tenants.resolved_country_config`; stamp `country_config_version = geo_countries.config_version`; **do not touch `tenants.country_config_overrides`** (sovereignty); emit an append-only `audit_trails` `COUNTRY_CONFIG_RESYNCED` row; invalidate the cache. A platform-admin drift banner (`WHERE country_config_version <> config_version`) makes corrections a governed event. **Server-side recomputation imports the TS registry in an edge function** (one source of truth) rather than duplicating defaults into a master table.

### 4.4 Coexistence with the 35 typed columns — phased, additive

No drops (additive only). Phase A: add `geo_countries.country_config` + `tenants.country_config_overrides`/`resolved_country_config`; seed registry keys derived from existing typed columns (backfill `currency_code`→`currency.code`); the resolver reads jsonb but falls back to the typed column when a key is absent → zero behavior change. Phase B: populate `geo_countries.country_config` from the maintained dataset (§10a); re-sync. Phase C: new keys (EOSB, weekend_days, input-VAT enablement) are **jsonb-only** — the migration-free path. The 12 typed `tenants` columns remain the fast read for the hottest fields; we deliberately do **not** migrate the 35 columns into jsonb (YAGNI; dropping is banned).

### 4.5 Fail-loud, not fail-US (fixes D2)

Two enforcement points:
1. **Provisioning prerequisite (hard gate).** `provision-tenant` must receive a `country_id` whose config resolves every `required` key past `REQUIRED_SENTINEL` and whose `config_status` satisfies the per-country gate (§2.7). If not, provisioning **fails with a 422**, no tenant row is created. The `|| 'US'`/`|| '$'`/`|| 'USD'`/`|| 'MM/DD/YYYY'` strings at `tenantConfig.ts:64-92` and `tenantConfigService.ts:64-96` are **deleted**; `DEFAULT_TENANT_CONFIG` required keys become `REQUIRED_SENTINEL`, not a US object.
2. **Read-time assertion.** `resolveConfig` throws on a still-sentinel required key. `TenantConfigProvider` catches once, renders a blocking "Tenant not configured for its country" state, and reports telemetry — never silently renders Japan as `$`/`MM-DD`/`en-US` (D3).

```ts
const REQUIRED_SENTINEL = Symbol.for('country-config.required');  // never a real value
```

> **Staging discipline:** deleting the US fallbacks is a hard behavior change — any path that silently relied on `|| 'USD'` now throws. Sweep the ~42 money-rendering bypass sites (D14) **behind the Phase-A compatibility shim** before flipping fail-loud, or the app white-screens for the 2 live OMR tenants.

### 4.6 Typed consumption surface — extend `TenantConfig`, no new provider

Extend the existing `TenantConfig` + the five hooks; **no second provider** (it would fork precedence and re-create drift). `fetchTenantConfig` reads `tenants.resolved_country_config` + `country_config_overrides` (+ the folded `accounting_locales`), assembles `ConfigLayers`, and builds the same `TenantConfig` shape via `resolveConfig()` per field instead of the `||`-chains. Add sub-configs for the homeless domains — `labor` (`weekendDays`/`eosbEnabled`/`payrollTaxMethod` — D4/D5/D15), `address` (`addressFormat`/`postalLabel`), `numberFormat` (`amountInWordsMinorUnits` — D13/D18), `documentPolicy` (`taxInvoiceRequired`/`zatcaQrEnabled` — D11) — surfaced via new hooks `useLaborConfig()`/`useAddressConfig()`/`useNumberFormatConfig()`/`useDocumentPolicy()`. All eight domains resolve through one chain. The 18 defects collapse to "read the right key."

### 4.7 Worked example — add a brand-new country key with ZERO schema change

Oman ROP requires the customer's national-ID label on delivery certificates ("Civil Number" in Oman, "Emirates ID" in UAE, "National ID" elsewhere): (1) add one registry entry `{ key: 'document.national_id_label', schema: z.string(), codedDefault: 'National ID' }`; (2) set per-country via the admin editor writing `geo_countries.country_config` + bump `config_version`; (3) re-sync picks it up; (4) consume `useDocumentPolicy().nationalIdLabel`. **No migration, no types regen, no trigger edit, no new column.** That is the engine. Contrast today: the same change needs a column + tenant column + sync edit + interface edit + `||`-chain edit + types regen — six coordinated changes (the brief §4 "single biggest thing standing between a Country table and a Country Engine").

### 4.8 Files to change / create

`src/lib/country/registry.ts` (new), `resolveCountryConfig.ts` (new), `resolveCountryConfig.test.ts` (new — precedence + fail-loud + **unknown-key-throws** assertions); extend `src/types/tenantConfig.ts` (+ sub-configs; replace `DEFAULT_TENANT_CONFIG` US literals with sentinels); rewire `src/lib/tenantConfigService.ts` (reads snapshot + overrides, folds `accounting_locales`, builds via `resolveConfig`, listens to invalidation); extend `src/contexts/TenantConfigContext.tsx` (new hooks; blocking "not configured" state); migration adds `country_config`/`config_version`/`country_config_overrides`/`resolved_country_config`/`country_config_version` + `resync_tenant_country_config()` (DDL owned by §3); `provision-tenant` hard prerequisite, no US fallback.

---

## 5. Localization & internationalization strategy

### 5.0 Ground truth

The platform is **i18n-_ready_, not internationalized**: 1/131 pages calls `t()` (`ReportSectionsPage.tsx`); UI `Locale` hard-pinned to `'en'|'ar'` (`LocaleContext.tsx:10`, `locale.ts:11`); RTL set hardcoded (`locale.ts:5`); two divergent catalogs (UI=2 langs in `i18n.ts`, PDF/doc=13 in `documentTranslations.ts`); the enforcement rule exists but is `'warn'` (`eslint.config.js:77`); D18 grouping bug at `format.ts:97`; email half-built (`notification-dispatch-email` already does `.eq('locale', locale)`, but `send-document-email:235` is a verbatim relay).

**Cost honesty:** the "~1,061 hardcoded strings" is a count of raw JSXText lint nodes, not unique strings; after dedup the unique-key set is plausibly **400–600**. The work is **breadth, not difficulty** — a per-slice burndown grind, sequenced against the D1–D18 pass for the same review bandwidth.

### 5.1 ONE tenant-language concept, two render targets

A single DB-backed catalog served to both UI and PDF/email. **New global table** (no `tenant_id`, master-data RLS): `i18n_translations(language_code, namespace, key, value, is_verified, is_machine_translated, deleted_at, …)` unique `(language_code, namespace, key)`; plus `geo_languages(code PK, name, native_name, is_rtl, numbering_system, is_active)`. DB-backed (not JSON files) because it lets platform-admins add a language and verify statutory strings without a deploy, mirrors `master_*`/`accounting_locales`, and serves the **same rows** to both consumers. **Bundled fallback stays:** `i18n.ts` `resources.en/.ar` for `common`/`ui`/`nav` ships in-bundle as anti-flash + offline fallback; everything else lazy-loads via an i18next backend. **Seed by ETL** from `documentTranslations.ts` (13 langs → `documents` namespace) + `i18n.ts` resources, with a **key-mapping pass** so doc-shaped keys don't land in `common`.

### 5.2 Widen `Locale`; lift RTL + `normalizeLang` from hardcode

`Locale = string` (was `'en'|'ar'`); `RTL_SET`/`SUPPORTED` become data hydrated from `geo_languages` via `hydrateLanguages()`; `isRTLLanguage`/`normalizeLang` read the data. Every `locale === 'ar'` consumer is swept to `isRTLLanguage(locale)` — an **exhaustive sweep**, not spot fixes (the compile-guard-loss risk).

### 5.3 Enforcement gate FIRST (Phase 0 — before extraction)

Stop the bleeding before draining the pool (mirrors the schema-discipline baseline→gate→burndown). (a) Extend `no-untranslated-jsx-text.js` to flag literal `placeholder=`/`title=`/`aria-label=`/`alt=` attributes; flip `eslint.config.js:77` `'warn'` → `'error'` **against a frozen `i18n-baseline.json` committed in the same PR** (exactly like the removed tsc baseline) — new violations error, the baseline only ratchets down. (b) Add `scripts/check-i18n-keys.sh` (required status check) asserting every `t('ns:key')` site has a key in `i18n_translations` for `fallbackLng`. This gate is load-bearing.

### 5.4 Extraction order — vertical slices, PORTAL FIRST

Per-slice burndown (one namespace, one PR, baseline ratchets down), ordered by externally-visible risk: **1) `portal`** (the only externally-visible non-English surface; smallest bounded slice to prove the pipeline), 2) `documents` (already 13-lang; mostly wiring; ties to D9/D13), 3) `cases`/intake/custody, 4) `financial` (couples with D9/D10/D14), 5) `settings`/`platformAdmin`/`hr` (internal, English-tolerant, last).

### 5.5 `format.ts` consolidation — one config-driven formatter (fixes D18)

Three divergent paths collapse to one formatter with grouping/position/separators/digit-shaping all from `geo_countries`/locale config. `groupInteger(intStr, sep, style)` supports `'standard'` and `'indian'` (lakh/crore) — fixes D18 at `format.ts:97`. `CurrencyConfig`/`TenantConfig` gain `groupingStyle`/`numberingSystem`, resolved through the existing precedence. Legacy `formatCurrencyWithSettings`/`fetchCurrencyFormat` (the `position:'before'`/`'en-US'` trap) are **deleted** after callers migrate to `formatCurrencyWithConfig`.

### 5.6 Localized transactional email / notifications

Lean into the half-correct split, don't rebuild. `notification_templates` already has `locale` and `notification-dispatch-email` resolves it — the gap is **seed coverage** (add per-locale rows with `is_verified` gate + English fallback) and the **global default layer** (`master_notification_templates`, §3i). `send-document-email` stays a relay; the **caller** renders subject/body through the unified catalog at the tenant's (or recipient's — open question) locale before invoking. **Statutory/forensic strings** (data-destruction certificate, checkout receipt, NDA emails) use `is_verified = true` rows only and fall back to English — a mistranslated certificate is a legal liability, not a polish gap.

### 5.7 PDF BiDi — accepted, documented constraint (no gold-plating)

pdfmake is the sole mandated PDF library; its BiDi/complex-script shaping is partial but the existing GCC bilingual plumbing (`rtl.ts`, `labels.ts`, `applyTenantLanguage.ts`, `taxBar.ts`, `amountInWords.ts`, Tajawal + Noto Sans Arabic) covers in-scope KSA/UAE/Oman docs. **Do NOT fork pdfmake or stand up an HTML→Chromium render path pre-demand** — that is justified only by a signed customer whose statutory docs pdfmake genuinely cannot render. Document the limitation in `DESIGN.md`/`docs/data-recovery-workflow.md`; treat it as a known constraint, not a bug.

### 5.8 Forced costs from the locked decisions

Globally-wide config means `geo_languages` + the formatter's `groupingStyle`/`numberingSystem` must be populated for ~all onboarding countries up front (a CLDR-sourced data cost a GCC-only scope would avoid). The 6-level hierarchy does **not** touch i18n directly — language resolution stays tenant-scoped through `TenantConfigContext`; per-unit language is out of scope (open question).

---

## 6. Multi-currency framework — closing the plumbed-but-dormant gap

**The model is correct and already built — it has just never carried a non-unity row.** Five core tables (`invoices`, `quotes`, `payments`, `expenses`, `financial_transactions`) carry the full base/transaction pattern (`exchange_rate NOT NULL DEFAULT 1`, `rate_source NOT NULL DEFAULT 'derived'`, `*_base numeric(19,4)`), fed by a live daily FX feed (`exchange_rates`, 544 rows, `er-api`, USD pivot), resolved through `currencyService.resolveRateContext()` + `financialMath.baseAmount()`. The defect is **(i)** three tables + one column never wired, **(ii)** read-side rollups summing transaction amounts under one symbol, **(iii)** minor-unit/default-currency assumptions hardcoded around it. With **0 non-unity FX rows DB-wide**, this is the cheapest possible moment to harden it. This is correctness-pass work (D2/D7/D8/D13/D14) parallel to the framework (locked decision #3); it consumes `get_base_currency()` per tenant but does not touch the hierarchy layer.

### 6.1 Close the gap tables to the existing pattern

DDL is §3g. Route every new writer through the existing resolver, not new code (replicate the `invoiceService` pattern): on create/update call `currencyService.resolveRateContext(tenantId, txnCurrency, rateDate)`, set `currency`/`exchange_rate`/`rate_source`/`*_base` via `financialMath.baseAmount(...)`. Files: `stockSalesService.ts`, `payrollService.ts` (`:386-391` is also the D5 calc site — touch once), `purchaseOrderService.ts`, `receiptService.ts`. **Backfill is exact** (all existing rows base-currency): one-shot `*_base = round(amount, base_decimals)` with `exchange_rate=1`, run **in the same migration as the column add, before any non-unity write path is enabled.**

### 6.2 Fix cross-currency read-side rollups (D7/D8)

| Defect | Site | Fix |
|---|---|---|
| **D7** | `ReportsDashboard.tsx:244-245,279,305,332` | Sum `*_base` (now populated). **Delete the 4 inline queries; rewire to the already-base-aware `financialReportsService.ts`** (`generateProfitLossReport`/`generateInvoiceSummaryReport`/…) via `queryKeys` — one code path, kills D7 and prevents the dashboard/reports divergence. |
| **D8** | `financialReportsService.ts:233-234` | `bank_accounts` has **no `*_base`** (verified). Add `currency_code` + `current_balance_base`/`opening_balance_base`/`fx_rate`/`fx_rate_source`/`fx_rate_at` (additive migration `bank_accounts_base_columns`), backfilled via rate context (not identity for non-base rows). A balance is a **live position**, so convert at read and label "indicative base" — never freeze a base on a balance. |

**The rule (lint-enforced invariant):** any aggregation across rows that may differ in currency MUST sum `*_base`; single-row display uses the transaction column + its currency. ESLint `no-raw-currency-aggregation` flags `.reduce(`/`+=` over `{amount,total_amount,amount_paid,balance_due,current_balance,opening_balance}` without a sibling `_base`/`baseAmount(` reference. Deliverable: a checklist of every aggregation site with disposition (`base-fixed` / `single-currency-asserted`).

### 6.3 Tenant-level rate override

`exchange_rates` is global (correct for a shared feed), but a tenant with a contractual/treasury rate cannot express it. Add tenant-scoped `tenant_exchange_rate_overrides` (`base_currency`, `quote_currency`, `rate > 0`, `effective_from`/`effective_to`, `reason`, audit) consulted **first** in resolver precedence: **tenant override (effective-dated, matching pair) → `exchange_rates` feed → unity if same currency → fail-loud if missing.** `rate_source` records which path won (`'tenant_override'|'er-api'|'derived'`) for forensic provenance. The resolver is the **only** place precedence is decided. YAGNI: a small manager+ admin form; no rate-approval workflows/bulk import yet.

### 6.4 Per-currency minor-unit correctness (D13/D14)

`master_currency_codes.decimal_places` is already correct (OMR/BHD/KWD=3, JPY=0). The bug is code that ignores it: **D13 — `amountInWords.ts:56-61` hardcodes `/100`** (renders OMR fils 10× wrong, invents a JPY fraction) → parametrize `decimals`, split on `10^decimals`, pluralize the minor unit from a per-currency source (baisa/fils/halala/sen), fall back to "and N/Mth" when unknown. **D14 — ~42 `.toFixed(2)`+`$` sites** route through `formatCurrencyWithConfig` (decimals/symbol/position from `TenantConfigContext`). ESLint bans `.toFixed(` on `/amount|total|price|balance|subtotal|pay/i` identifiers (explicit allowlist) — the durable defense against D14 recurring.

### 6.5 Fail-loud currency defaults (D2)

Every money table defaults `currency 'USD'::text`. Add `get_base_currency()` returning the tenant base from `tenant_currencies` (is_base) → `tenants.currency_code` → **NULL** (deliberately, to force a NOT NULL violation rather than poison analytics), and flip every money-column default to it:

```sql
CREATE OR REPLACE FUNCTION get_base_currency() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT currency_code FROM tenant_currencies WHERE tenant_id = get_current_tenant_id() AND is_base AND deleted_at IS NULL LIMIT 1),
    (SELECT currency_code FROM tenants WHERE id = get_current_tenant_id()),
    NULL)  -- NOT 'USD' — forces fail-loud
$$;
ALTER TABLE invoices ALTER COLUMN currency SET DEFAULT get_base_currency();
-- repeat: quotes, payments, expenses, financial_transactions, purchase_orders, bank_accounts, stock_sales, payroll_records, receipts
```

> **Sequencing dependency (concrete cross-section break):** because `get_base_currency()` returns NULL when no base exists, every new-tenant money write fails unless provisioning seeds the `tenant_currencies` is_base row first. **`seed_new_tenant` (§9.6) MUST seed the `tenant_currencies` is_base row** — this is now an explicit step there, not an assumption.

### 6.6 PurchaseOrderFormModal de-hardcoding sweep (D14)

`PurchaseOrderFormModal` hardcodes `$` + `.toFixed(2)`. Fix in place: read currency from the PO's `currency` (now rate-context-backed), render via `formatCurrencyWithConfig`; add the currency selector + live base-equivalent preview (mirroring the invoice modal). This is the canonical instance of the §6.4 sweep — fix it first as the reference implementation.

### 6.7 End-to-end verification — EUR on an OMR tenant reconciles to the penny (release gate)

Closes the brief's evidence gap. **Until this passes, we do not claim multi-currency works.** Integration test (Vitest + seeded test tenant): OMR-base tenant, EUR active, seeded `exchange_rates`; create a EUR invoice for €1,234.567 → assert `currency`/`exchange_rate`/`rate_source` and `total_amount_base = baseAmount(total, rate, 3)` at **OMR's 3 decimals**; partial EUR payment reconciles `SUM(payment.amount_base) == invoice.amount_paid_base` to the 3rd decimal; PDF `amountInWords` uses baisa/3-decimal (D13 guard); dashboard total equals base (D7 guard); tenant-override path asserts `rate_source='tenant_override'`; bank rollup (D8) sums in base. Add the **timezone boundary check** (FX `rate_date` is date-sensitive; shares the brief's tz-correctness risk).

### 6.8 Platform subscription billing currency (out of scope)

Platform billing (`billing_invoices`/PayPal) is the SaaS vendor's own currency — separate from tenant operational currency. **Recommendation: fixed platform settlement currency now** (YAGNI — avoids FX risk on your own revenue); revisit only if a major non-USD reseller demands local-currency billing. Flagged to the platform-billing track.

### 6.9 Phasing

C1 (correctness, ships first): `get_base_currency()` + flip defaults (6.5); D7/D8 rollups (6.2); D13 amountInWords (6.4); PO modal (6.6) — no schema risk. C2: gap tables + backfill + service wiring (6.1). C3: override + full `.toFixed(2)`/`$` sweep + ESLint guard. C4: end-to-end reconciliation proof (6.7) — **release gate.** Deferred (YAGNI): rate-approval workflows, bulk import, historical revaluation/unrealized-FX reporting, multi-currency on `bank_transactions` line items, platform billing FX.

---

## 7. Compliance & statutory framework

> **This is the gating deliverable.** Statutory correctness is a *release criterion, not a feature* (brief §6 decision #4). Items flagged **MUST-SHIP** block onboarding any non-OMR tenant — each is a way to file a wrong number, under-accrue a legal liability, or emit a "compliant" artifact that isn't. Built additively (DDL owned by §3); references are `file:line` / `table.column`. **Cross-cutting principle: the database is the statutory engine; the frontend is a thin renderer** — and statutory values are resolved **live + effective-dated at commit, then frozen onto the document row** (§2A.2/§4.3), never read from a tenant display snapshot.

Four pillars.

### 7.1 Pillar 1 — Tax engine (per-line, multi-rate, effective-dated)

Today `financialMath.ts:47-66` computes one document-level scalar tax; no per-line, no inclusive/exclusive, no zero-rated-vs-exempt, no withholding/reverse-charge; label hardcoded "VAT" (D9), rate 5% (D10), input VAT never written (D1).

#### 7.1.1 New tables

- `master_tax_categories` — **global**: the vocabulary of treatments (`standard`/`zero_rated`/`exempt`/`out_of_scope`/`reverse_charge`), with `treatment` and `affects_input_recovery` (exempt = false). **Zero-rated vs exempt is a treatment column, not a 0% rate** — both yield 0 output tax, but zero-rated allows input recovery and exempt does not; collapsing them overstates recoverable input VAT.
- `geo_country_tax_rates` — **the effective-dated rate set (defined in §3c — this section consumes it, does not re-declare it).** It carries `tax_category_id`, `applies_to`, `effective_from/to`, and the denormalized `tax_label`. The runtime resolves `rate where effective_from <= doc_date < coalesce(effective_to,'infinity')` — the single source for D9 label and D10 rate.
- `tax_line_assessments` — **tenant-scoped, append-only**: the per-line tax actually assessed (the audit-grade record): `document_type`, `document_id`, `line_id`, `tax_rate_id`, `tax_category_id`, `taxable_base`, `tax_amount`, `is_inclusive`, `tax_direction` (`output`/`input`), `withholding`, `reverse_charge`, `exchange_rate`/`rate_source`, base-currency shadow. RESTRICTIVE isolation + `set_*_tenant_and_audit` + partial index; append-only (REVOKE + `prevent_audit_mutation`). Corrections post a reversing row, never an UPDATE. **This is the frozen statutory snapshot on the document — the resolved live rate lands here at commit.**

#### 7.1.2 `financialMath.ts` extension

Add `computeLineTax()`/`computeDocumentTax()` alongside the existing rounded helpers (keep `calculateInvoiceTotals` as the single-rate fast path so the single-OMR case is unchanged): inclusive `tax = round(base - base/(1+rate/100))`, exclusive `tax = round(base*rate/100)`; `zero_rated`/`exempt`/`out_of_scope` ⇒ 0 (treatment carried for the return); `reverse_charge` ⇒ emit **both** an output and an input assessment (net-zero cash, both reported); `withholding` ⇒ negative contra line.

#### 7.1.3 De-hardcoding (D9/D10) — single resolution path

`InvoiceFormModal:893`/`QuoteFormModal:724`/`invoiceAdapter:150` read `useTaxConfig().label` — which resolves **through the `geo_country_tax_rates` effective-dated row** (not the `geo_countries.tax_label` scalar directly; the scalar is fallback-only). `InvoiceFormModal:128`/`QuoteFormModal:113` default from the resolved current rate row, never literal `5`. Tax-registration validation: `validateTaxNumber(value, country)` regex-checks `geo_countries.tax_number_format` (soft-warn so unknown-format countries still onboard).

#### 7.1.4 🔴 D1 — Input-VAT writer (MUST-SHIP, gating) with a single system-of-record

Every VAT return currently overstates net VAT payable because `vatService.ts:209-222` hardcodes `record_type:'sale'` and nothing writes a `'purchase'` row. The fix is **DB-side** so it cannot be skipped:

1. `trg_write_input_tax_from_expense` (AFTER INSERT/UPDATE ON `expenses` where `tax_amount > 0`) and `trg_write_input_tax_from_po` (AFTER INSERT/UPDATE ON `purchase_orders` where `tax_amount > 0`) insert an `input` row into **`tax_line_assessments`** — the single append-only system-of-record. `expenses` already carries `tax_amount/tax_amount_base/exchange_rate/rate_source`.
2. **`vat_records` becomes a derived rollup of `tax_line_assessments`, not a second independent writer.** Two writers for the same statutory fact is exactly the class of bug D1 is — so `vat_records` is **a view/materialized rollup over `tax_line_assessments`** (keyed by `record_type` derived from `tax_direction`), preserving the existing VAT screens without a divergent second insert. The VAT return can only reconcile one way.
3. `calculateVATForPeriod` (`vatService.ts:100-126`) sums `tax_amount_base` from the rollup (today it sums raw `vat_amount`, adding OMR to EUR — the D7/D8 class). `vat_returns.input_vat` becomes real; add a `vat_return_lines` rollup keyed by `tax_category_id` (standard/zero-rated/exempt/reverse-charge boxes — the ZATCA/VAT201/GSTR shape). Idempotency: a uniqueness key on `(document_type, document_id, line_id, tax_direction)` on `tax_line_assessments` prevents double-counting on edit/soft-delete.

> Deferred: partial-exemption input-recovery ratios (mixed taxable+exempt supply) — YAGNI for GCC labs; `affects_input_recovery` + `tax_category_id` make it a read-side calc later.

### 7.2 Pillar 2 — E-invoice & statutory filing (country-routed adapter layer)

Today `invoiceAdapter:241,284` emits a ZATCA QR on a manual toggle (**D11**); no filing engine. The `zatcaQr.ts` TLV builder works — the *routing* is broken.

- `master_einvoice_regimes` — **global** registry: `code` (`zatca_ph1`/`zatca_ph2`/`in_irn`/`uk_mtd`/`uae_vat201`/`none`), `country_id`, `adapter_key`, `mandatory_from`, `requires_tax_system`, `phase`.
- `einvoice_submissions` — **tenant-scoped, append-only** clearance/reporting ledger: `document_type`, `document_id`, `regime_id`, `status`, `payload_hash` (sha256 of canonical XML/JSON), `authority_reference`, `qr_payload`, `response_json`. The `payload_hash` ties e-invoices into chain-of-custody discipline.
- **Routing rule (kills D11):** ZATCA Phase-1 QR emits **iff** `geo_countries.tax_system='VAT' AND country='SA' AND regime.mandatory_from <= doc_date` — resolved in `src/lib/tax/einvoiceRouter.ts`, **never a UI toggle.** `invoiceAdapter` calls `resolveEinvoiceRegime(...)` and only invokes `zatcaQr.ts` for the `zatca_ph1` adapter.
- **Pluggable adapters** (`src/lib/tax/einvoice/adapters/`, code-registry keyed): Phase 1 ships `zatcaPhase1Adapter` (QR — buildable today); `zatcaPhase2Adapter`/`inIrnAdapter`/`ukMtdAdapter`/`uaeVat201Adapter` are **registered stubs, deferred.**
- **Statutory filing engine:** `master_filing_obligations` — **global** (`obligation_code`, `requires_tax_system`, `period_frequency`, `filing_adapter_key`, `fiscal_anchor`). `vat_returns`/`getQuarterlyVATSummary` become one renderer behind a `FilingAdapter`. Period boundaries derive from `geo_countries.fiscal_year_start` + `period_frequency` — not hardcoded calendar quarters.

> **MUST-SHIP for non-OMR:** D11 routing + the registry + correct VAT-return periodization. Phase-2 clearance / IRN / MTD are registered stubs, deferred.

### 7.3 Pillar 3 — Payroll / labor compliance (rules-driven, replaces flat 7%)

Today `payrollService.ts:389` = `basicSalary * socialSecurityRate` (D5); no brackets, no employer contributions, no nationality dimension; no EOSB (D4). `employees` already has `nationality`/`salary_currency` — the dimensions exist; the engine ignores them.

- **Rules tables (all global, effective-dated, country-keyed):** `master_income_tax_brackets` (GCC mostly empty; UK/IN populated), `master_statutory_contributions` (keyed by nationality/residency — KSA GOSI Saudi vs non-Saudi), `master_eosb_rules` (Gulf gratuity by tenure band — DDL is §3h `geo_country_eosb_policies`), `master_statutory_leave` (replaces jurisdiction-blind `master_leave_types`).
- **Tenant-scoped (additive):** `payroll_records` gains `income_tax_amount`/`employee_contribution`/`employer_contribution`/`eosb_accrued`/`currency`/`exchange_rate`/`net_salary_base` (all nullable — D16 USD fix + §3g currency gap); `employee_eosb_accruals` (§3h) is the append-corrections-only gratuity ledger.
- **Engine replacement:** replace `payrollService.ts:385-391` with `computeStatutoryPayroll(employee, period, calendar)`: resolve brackets/contributions/EOSB from the rules tables using `employee.nationality` + residency + tenant `country_id`, effective-dated; day-class overtime via the work calendar (§3d — fixes D15, replacing `weekStartsOn:1` at `TimesheetManagement.tsx:410`); write contribution/income-tax/EOSB columns + an `employee_eosb_accruals` row per active GCC employee per run. **The engine fails loud — a missing rule for the country blocks the payroll run for that country; it never falls back to flat-7%.**
- **Bank-file formats parameterized (D16/D17):** `master_bank_file_formats` (global: `country_id`, `format_code` `WPS`/`Mudad`/`SEPA`/`ACH`/`BACS`, `field_spec jsonb`); `payrollService.ts:871,913-914` reads currency/format/bank from data, never literal `'USD'`/`'Bank Muscat'`/`'WPS'`; `PayrollSettingsPage:271-275` dropdown sources from `tenant_currencies`/`master_currency_codes`.

> **MUST-SHIP for non-OMR:** EOSB (D4) + rules-driven contributions/income-tax (D5) **for the onboarding country** (per-country gate — §2.7/§7.5). **WPS/Mudad bank-file generation is MUST-SHIP only for a tenant that actually runs payroll disbursement** — a lab onboarding for case management alone can defer it.

### 7.4 Pillar 4 — Blind spots (residency + country-specific workflows)

#### 7.4.1 Data residency / GDPR (single-region; one vocabulary; enforcement covers Storage)

Per locked decision #4, single-region but residency is a first-class queryable field now, using the **single `'global-1'` vocabulary** (§2.8 — no `me-central-1`/`me-south-1` variants): `tenants.data_residency_region NOT NULL DEFAULT 'global-1'` + `legal_entities.data_residency_region` + `geo_countries.requires_local_residency`/`data_protection_regime` (§3a). **One enforcement rule:** `provision-tenant` rejects (fail-loud) any non-`'global-1'` value **and** any country with `requires_local_residency=true` while only `'global-1'` exists, with an explicit "region not yet available" 422. **Enforcement covers Supabase Storage** (recovered-device file images/manifests), not just Postgres — otherwise the field is security theater. Document in `DESIGN.md` + `docs/data-residency.md` as intent + provisioning block, not multi-region enforcement.

#### 7.4.2 Country-specific workflows / approvals (hooks on existing control points — custody stays append-only)

Jurisdiction variance (mandatory destructive-attempt consent, NDA-before-intake, data-handling acknowledgment) attaches as **DB-enforced gate rows**, never by forking the 16-stage lifecycle: `master_jurisdiction_gates` — **global** (`country_id`, `lifecycle_stage`, `gate_code`, `enforcement` `block`/`warn`) — and `case_compliance_gates` — **tenant-scoped, append-only** satisfaction ledger. `transition_case_status` is extended to resolve the gates for the tenant's country at the target stage and **RAISE EXCEPTION on an unsatisfied `enforcement='block'` gate** — turning advisory `requires[]` into a hard stop. Recovery-authorization and data-release points gain the same check. **Chain of custody is untouched and append-only** — a satisfied gate writes a `case_compliance_gates` row and a custody `evidence_handling` event via the existing `log_chain_of_custody(...)`. **Default `enforcement='warn'`** for any gate the platform hasn't explicitly verified for that country; `block` is opt-in per country (so a mis-seeded catalog can't hard-block legitimate flow).

> **MUST-SHIP for non-OMR:** the gate *mechanism* (block on unsatisfied mandatory consent at transition). The full per-country gate *catalog* beyond the onboarding country is data population, deferrable.

### 7.5 Migration & phasing (additive only)

| Phase | New objects (via §3 migrations) | Gates released |
|---|---|---|
| 7a — D1 input-VAT (ship first) | `tax_line_assessments`; expense/PO input-VAT triggers; `vat_records` → derived rollup; FX/country cols | VAT returns statutorily accurate |
| 7b — Tax engine | `master_tax_categories`; consume `geo_country_tax_rates`; `financialMath` per-line; D9/D10 de-hardcode; tax-number validator | Per-line/multi-rate/inclusive/zero-vs-exempt/WHT/reverse-charge |
| 7c — E-invoice + filing | `master_einvoice_regimes`, `einvoice_submissions`, `master_filing_obligations`; `einvoiceRouter`; ZATCA P1 routing (D11) | Country-routed e-invoice; periodized returns |
| 7d — Payroll/labor | payroll rules tables; `payroll_records` cols; `employee_eosb_accruals`; engine replacement (D4/D5/D15/D16/D17) | EOSB + rules-driven payroll |
| 7e — Blind spots | residency cols + provisioning guard (Storage-covering); `master_jurisdiction_gates`, `case_compliance_gates`; `transition_case_status` gate check | Residency constraint + consent gates |

Every phase: regen `database.types.ts`; global tables follow the global RLS pattern; tenant tables get RESTRICTIVE isolation + `set_*_tenant_and_audit` + partial index; assessment/submission/accrual/gate ledgers are append-only.

### 7.6 Cost the locked decisions force (flag)

Effective-dating everything (supersession-by-insert on rates/contributions/EOSB) is real overhead I'd skip for a one-country product — but a tax-authority audit asks "what was the rate on *that* invoice's date," so it's mandatory once multi-country is in scope. The global rules tables are platform-admin-write-only, so populating KSA/UAE/Oman statutory data is a platform-team job — correct for forensic/legal stakes; onboarding a 4th deep-statutory country is a data project, not a config screen. Both accepted and intended.

---

## 8. Reporting & analytics redesign

Reporting is where every Country-Engine decision becomes *visible*. This hardens the live analytics defects (D7/D8) and threads the country/hierarchy layer through the same surfaces, reusing the multi-currency core, the PDF cascade resolver, and `TenantConfigContext`. **All DDL referenced here is owned by §3; this section consumes it.**

### 8a. Base-currency-everywhere — `baseAmount` as the only cross-document aggregation path

Principle (locked): any sum crossing documents MUST sum base currency via `financialMath.baseAmount(row, field)`. `financialReportsService.ts` is the reference implementation; the defects are the widgets that bypass it. **D7:** delete `ReportsDashboard.tsx`'s inline raw-sum queries (`:244-245,279,305,332`) and rewire to the service via `queryKeys` (one code path). **D8:** `bank_accounts` has no `*_base` (§3g/§6.2 adds them); convert at read and label "indicative base" (a balance is a live position, never freeze its base). **CI gate `no-raw-currency-aggregation`** (§6.2) is the durable deliverable; the manual D14 sweep is the one-time payoff.

### 8b. Country/jurisdiction layer in the PDF template cascade

Extend `resolveTemplateConfig` (`templateConfig.ts:892-902`) with a **country layer** between built-in and theme — cascade becomes **built-in → country → theme → doc-type → instance.** Because `applyOverride(base, undefined)` is identity, the 8 existing `pdfService` call sites + 9 test sites keep working with a positional `undefined`. The country override is **derived, not authored**: `countryTemplateOverride(country)` (new `src/lib/pdf/engine/countryConfig.ts`) maps statutory facts → template config:

| `geo_countries` fact (resolved) | Override emitted | Kills |
|---|---|---|
| resolved `tax_label` (via §3c rate row) | `labels.taxLabel`, the VAT line label | **D9** |
| `tax_invoice_required` AND `tax_system='VAT'` | `taxBar.enabled = true` | **D11** |
| `tax_system='VAT'` AND country='SA' | ZATCA QR path (via `einvoiceRouter`) | **D11** |
| GCC / `is_rtl` | `language.mode='bilingual_stacked'`, amountInWords on | D13-adjacent |
| `currency_decimal_places` (3 OMR/KWD/BHD, 0 JPY) | thread into `money()` + amountInWords | **D13** |

**The country override is the single change that de-hardcodes the invoice PDF** — the adapter stops owning tax-label/QR/decimals truth (those now come from the resolved country config, sourced through §3c, **not** off a scalar column). Per the locked blind-spot decision: ship **one** country-derived override, not 195 hand-authored templates.

### 8c. Per-(legal_entity / business_unit, doc_type) template variants

Extend `document_template_versions` additively with **nullable `legal_entity_id` + `business_unit_id` (FK `branches`)** — **consuming the §3 tables, not re-declaring them** — plus a partial unique `uq_template_deployed_scope` (one deployed version per `(tenant, doc_type, entity, BU)`). `getDeployedVersionByType(docType, { legalEntityId?, businessUnitId? })` resolves most-specific-first; existing tenants auto-collapse (both NULL = tenant default). The country override (8b) is keyed off the *resolving entity's* country, so a KSA entity gets ZATCA and a UK entity gets a UK label — from the same built-in base. **Deferred:** a variant *picker UI* in Report Studio (logic + storage ship now; the author UI is a fast-follow once a second legal entity exists).

### 8d. Config-aware date formatting in every PDF adapter (D9-adjacent)

6 adapters hardcode `formatDate(x, 'dd MMM yyyy')` (11 sites). Thread `geo_countries.date_format` (→ tenant denormalized → `TenantConfigContext`) into the engine: add `dateFormat` to the render context; a config-aware `fmtDate` wrapper. `dateFmt` travels with the resolving entity's country. ESLint `no-hardcoded-pdf-dateformat` flags any literal date-format string inside `src/lib/pdf/`. Inject at `applyTenantLanguage` (extended to `applyTenantLocale` — date format + number grouping, §8g).

### 8e. Statutory report builders as jurisdiction adapters

`vat_returns`/`tax_rates` are the data backbone. **Critical dependency:** a VAT return is arithmetically wrong until **D1** lands (input_vat structurally 0) — **the VAT-return builder MUST NOT ship before D1** (gated, locked decision #4). Jurisdiction-adapter interface mirroring the PDF adapter pattern (`StatutoryReturnAdapter<TForm>`, one file per form); `statutoryReportsService.ts` sibling to `financialReportsService.ts` (separate release gate). Phase 1 ships **GCC VAT201 only** (KSA/UAE/OMN, summing `baseAmount` over the §7.1 `tax_line_assessments` rollup); GST/MTD scaffolded as stubs. The return PDF reuses the cascade (8b/8c) with a new `tax_return` built-in type. **Deferred:** live MTD/HMRC + ZATCA Phase-2 transmission.

### 8f. Hierarchy-aware analytics

Every aggregation gains optional roll-up dimensions (additive, phased): report functions gain `scope?: { legalEntityId?, businessUnitId?, regionId? }` (absent = whole tenant). `generateConsolidatedPnL(from, to, groupBy)` returns per-scope contribution + a consolidated base-currency total. **Isolation is preserved by construction:** these are extra `AND` predicates on top of the existing RESTRICTIVE `tenant_id` policy — no new widening policy. Region roll-up is a thin wrapper; cross-region consolidation is deferred with multi-region infra.

### 8g. Address & number formatting from config

**Numbers:** `format.ts:49,77,97` (`en-US` + Western grouping — **D18**) and `invoiceAdapter.money()` both route through `formatCurrencyWithConfig`/`formatNumberWithConfig` (grouping/position/decimals from `geo_countries`/`TenantConfigContext`); the adapter's `money()` is deleted (same injection point as 8d). **Address:** `geo_countries.address_format` is `{}` for all 58 (**D3**) — populate from the maintained dataset (§10a), then add `formatAddress(parts, address_format)` for PDF parties/print surfaces. **Until populated, fall back to the line-stack** — fail-soft on *format*, fail-loud on *missing country*. (This is the rendering half gated on CLDR population; the D12 data-capture half ships independently per §3f.)

### 8h. Phasing

P1 (correctness): D7/D8 + `no-raw-currency-aggregation` + format.ts D18. P2 (country PDF layer): country arg + `countryTemplateOverride` + config-aware `formatDate` (D9/D11/D13) + `applyTenantLocale`. P3 (entity/BU variants): template scope columns + resolver. P4 (statutory builders): **HARD GATE — D1 first** — GCC VAT201 + `tax_return` PDF. P5 (hierarchy analytics + address fmt): scoped/consolidated report fns; `formatAddress` after `address_format` populated. The 6-level hierarchy forces P3/P5 scaffolding now even though all live tenants are single-entity — mitigated by auto-collapse (schema cost now, UI cost deferred).

---

## 9. Tenant onboarding redesign — country-driven self-serve flow

A lab in any country must onboard end-to-end with correct money, language, tax identity, and a *deterministic, fail-loud* provisioning path. Build on the existing 4-step wizard (`src/pages/auth/onboarding/`), `tenantService.createTenant`, `provision-tenant`, and `sync_tenant_config_from_country()` — do **not** replace them. **All tables here are the §3-owned `legal_entities`/`branches` — there is no separate `tenant_legal_entities`.**

### 9.0 Verified ground truth (DB-confirmed)

D6 (`user_id` absent on `onboarding_progress`; insert at `provision-tenant:325`; error swallowed `:330-333`); `ui_language` pinned `'en'` (sync sets 11 fields, none is `ui_language`); fail-US fallbacks (`provision-tenant:306-312` `|| 'USD'/'$'/'en-US'`); JP `currency_code IS NULL` but `is_active=true` (D3); OTP path dead (no `send_signup_otp`/`verify_signup_otp` DB fns); no `number_sequences` seed fn; hierarchy tables absent (create additively); slug check diverges (wizard `useOnboardingFlow.ts:122-126` omits `deleted_at`; server `:148-153` includes it).

### 9.1 (a) Fix D6 — correct insert + fatal error

Migration `fix_onboarding_progress_provisioning`: add nullable `user_id uuid REFERENCES auth.users(id)` + `deleted_at` to `onboarding_progress`; partial index; partial-unique `(tenant_id, user_id)`. Confirm RLS ENABLE+FORCE + RESTRICTIVE isolation + `set_*_tenant_and_audit` + index. Edge fn `:320-333`: stop swallowing — on insert error, **soft-delete** the half-provisioned tenant and `throw`. **Also convert the two `:223`/`:240` `.delete()` rollbacks to `update({ deleted_at })`** (the hard delete violates the soft-delete rule).

### 9.2 (b) Country-driven `ui_language` + confirm/override

Extend `sync_tenant_config_from_country()` (preserve the 11 assignments) to set `ui_language` **only when `NEW.ui_language IS NULL`** (so an explicit wizard override is honored), mapping conservatively to the app's `'en'|'ar'` union and never falling back to US-default. Backfill the 2 OMR tenants to `'ar'`. Wizard Location step: a "Language" segmented control pre-filled from the country's `language_code`; `provision-tenant` sends `ui_language: null` unless the user overrode. **YAGNI:** do not internationalize the wizard JSX here (separate i18n deliverable).

### 9.3 (c) Capture jurisdiction at signup → primary `legal_entities` row

A conditional **Jurisdiction step** (renders only when the chosen country's `tax_system NOT IN (NULL,'NONE')`) captures legal entity type, tax/VAT registration number (label = `tax_number_label`, validated vs `geo_countries.tax_number_format`), fiscal-year confirmation, timezone. It writes the **primary `legal_entities` row (§3e)** in the provisioning transaction — so the first invoice PDF is compliant (closes the gap behind D9). **Validation guardrail:** if `tax_number_format` is empty (most of the 58 today), accept any non-empty string, persist it, flag the country for backfill — never block onboarding on *our* missing reference data, only on the *tenant's* missing data.

### 9.4 (d) FAIL-LOUD — block activation until country config resolves (D2/D3)

In `provision-tenant`, immediately after fetching `countryData`: assert currency/locale/date/timezone present **and** the per-country `config_status='statutory_ready'` gate (§2.7) is satisfied; if not, **soft-delete the tenant + return 422** ("This country is not yet available for onboarding…"). Delete the silent `|| 'USD'/'$'/'en-US'` fallbacks. Add a `BEFORE INSERT` DB backstop `enforce_onboardable_country` on `tenants`. Filter the wizard dropdown to currency-bearing countries (`useOnboardingFlow.ts:84-87` adds `.not('currency_code','is',null)`). Add a **blocking CI assertion** `scripts/check-active-country-config.sql` (every `is_active` country has currency/locale/date/timezone). The country-population (§10a) is a hard prerequisite or CI is red on merge (set unprepared countries `is_active=false` until populated).

### 9.5 (e) Wire the dead OTP path

Add `send_signup_otp(p_email)` / `verify_signup_otp(p_email, p_code)` DB RPCs over the existing `signup_otps` table (SECURITY DEFINER, rate-limited, single-use, constant-time compare); email via the `send-document-email` SMTP pattern (no new mailer). Wizard Account step gates `nextStep`/`submit` on `emailVerified`; `provision-tenant` re-checks server-side (single-use verification token issued on first verify, to avoid a double-consume race) before creating the auth user (admin-provisioned flow bypasses, as today). **YAGNI:** email OTP only; SMS/magic-link/SSO deferred.

### 9.6 (f) Deterministic per-tenant operational seeding

**New idempotent `seed_new_tenant(p_tenant_id)` RPC**, called once by `provision-tenant` with fail-loud rollback, seeding in one transaction:
1. **`tenant_currencies` is_base row** — **FIRST**, so the §6.5 `get_base_currency()` fail-loud default never fails a subsequent money write (the §6.5 sequencing dependency, now explicit).
2. `number_sequences` canonical scopes via `seed_number_sequences` (§3j) — the previously-undefined seed path, now deterministic.
3. Default templates / number formats (tenant copies of the country-default set).
4. Primary `legal_entities` (§9.3; if `tax_system='NONE'`, a minimal entity with `name = company_name` so collapse-to-one always holds).
5. One **`branches`** "Main" row (`legal_entity_id = primary`, `is_primary`) — the §2A auto-collapse BU (no `business_units` table).
6. `onboarding_progress` (`current_step='company_info'`).

Idempotent, so the 2 existing OMR tenants are backfilled by calling it once each.

### 9.7 (g) Align the wizard slug check with the server

Add the missing `.is('deleted_at', null)` to `useOnboardingFlow.ts:124` so the client check matches `provision-tenant:152` (the authority). Optional hardening: an `is_slug_available(p_slug)` RPC (deferred).

### 9.8 Phasing

**Phase 1 (ships first, unblocks signups):** D6 schema + fatal insert + soft-delete the two `.delete()` rollbacks; `ui_language` sync + Oman backfill; slug filter; fail-loud gate + drop silent fallbacks + wizard country filter + CI assertion. **Phase 2:** Language step; Jurisdiction step → `legal_entities`; OTP RPCs + Account wiring; `seed_new_tenant` (seeding `tenant_currencies` first) + Main `branches`; backfill 2 live tenants. After each migration: regen `database.types.ts`; update callers; use the migration PR template. **Deferred (YAGNI):** wizard-JSX i18n; multi-entity/BU management UI; per-country `master_legal_entity_types`; SMS/magic-link/SSO; multi-region residency infra.

---

## 10. Migration strategy for existing tenants

> **Frame: today the migration cost is near-zero, and that is the whole opportunity.** Live: **2 tenants (both Oman/OMR/English), 0 employees, 0 `payroll_records`, 0 `vat_returns`, 0 non-unity FX rows.** Operational data is sparse: 22 invoices, 10 quotes, 24 cases, 16 `vat_records` (all `sale`-side — that *is* D1), 15 `number_sequences`. Every defect is currently a paper cut; the instant a non-OMR tenant runs live payroll/VAT it becomes a regulator-facing incident with no clean back-out. This section sequences the framework build and the correctness pass to capitalize on the empty window. It assumes the §2A/§3 designs.

### 10(a) `geo_countries` population — maintained reference dataset, not hand-curation

Source from maintained, versioned, open datasets and commit a deterministic generator — **no hand-curation of config values.** Sources: ISO 3166-1 (identity/region), ISO 4217 (currency + decimals — reuse the existing `master_currency_codes`, do not re-derive), CLDR (locale/date/number/grouping/week-start), libphonenumber (phone), IANA tz, CLDR/Google address-format, `date-holidays` + a curated GCC statutory overlay. **Generator artifact:** `scripts/country-engine/build-geo-seed.ts` reads pinned dataset versions → emits one idempotent `supabase/seeds/geo_countries_seed.generated.sql` carrying the **full config bag** (not name+code), upserting per-column (`ON CONFLICT … DO UPDATE`, jsonb `||` merge), stamping provenance (`data_source`/`source_version` on `geo_countries`), and respecting a `source_locked boolean` so curated GCC overrides aren't clobbered. **CI no-stub assertion** `scripts/check-geo-completeness.sql` (required check) fails the build if any onboardable country lacks currency/locale/date/timezone/phone/address — making fail-loud structural. **YAGNI:** no live API pull / scheduled refresh now; refreshing is a manual generator re-run gated behind a named multi-country customer.

### 10(b) Re-sync existing tenants after backfill

**Root cause:** `sync_tenant_config_from_country()` fires only on INSERT or `country_id` change, so populating `geo_countries` (10a) won't reach the 2 already-provisioned tenants. **Fix:** the §4.3 `resync_tenant_config_from_country(p_tenant_id)` RPC — re-applies the full **display** config via a shared `_apply_country_config(tenant_row, country_row)` helper the INSERT trigger also calls (**one code path**, no provision-vs-resync drift), respects `accounting_locales` precedence, writes an `audit_trails` diff row, idempotent. Do **not** widen the trigger to fire on every `geo_countries` change (mass-mutation of forensic config). **Backfill (one-time, 2 tenants):** a guarded `DO` loop calling the RPC; tenants with `country_id IS NULL` left untouched and flagged (fail-loud — never guess a country). **This is also where the §2A.8 real-currency precondition is satisfied:** confirm both OMR tenants carry real OMR currency/tax identity (not a `'USD'` placeholder) *before* the hierarchy collapse runs. Operator surface: a manager+-gated "Re-apply country configuration" action.

### 10(c) Additive hierarchy rollout — collapse to one legal entity + one `branches` BU

(1) Create `legal_entities` (+ promote `branches`) per §2A/§3 — full tenant-scoped contract. (2) Add nullable FK columns on operational tables — no FK NOT NULL, no required backfill; nothing reads them until the consuming feature ships. (3) Auto-collapse backfill: one `legal_entities` (`is_primary`, seeded from the tenant's **validated** tax identity per §2A.8) + one `branches` "Main" per tenant; restamp the 22 invoices / 24 cases / 10 quotes (sub-second). (4) Extended isolation is **ANDed**, not substituted, with the `business_unit_id IS NULL` escape hatch (the load-bearing clause — a regression test asserts visible-row-count invariance). **Ship only L4-collapse in this window;** gate hierarchy depth + cross-BU isolation behind a named multi-entity customer.

### 10(d) Parallel correctness pass (D1–D18) — feature-flag-gated

Ship behavior-changing legal-output fixes **dark behind `tenants.feature_flags`** (the proven migration-free toggle), verify on the 2 live tenants, flip per-tenant once that tenant's country config passes the no-stub gate. Flags: `country_engine.fail_loud_config` (D2/D3), `country_engine.statutory_tax` (D1/D9/D10/D11), `country_engine.money_base` (D7/D8/D14/D18), `country_engine.amount_in_words_currency_aware` (D13), `country_engine.work_calendar` (D15/D16/D17), `country_engine.rules_payroll` (D4/D5). **D6 and D12 ship unflagged, immediately** — pure bugs, no legal-output change, first PRs.

### 10(e) Zero-downtime, additive-only ordering

(1) Add columns/tables (nullable/defaulted, nothing reads them). (2) Add functions/triggers (`resync_*`, `_apply_country_config`, input-VAT writer) — dormant until called/flagged. (3) Backfill in guarded idempotent `DO` blocks (≤58 country rows, ≤72 operational rows). (4) Ship code behind flags; flip per-tenant. (5) Defer all `NOT NULL`/FK tightening (YAGNI at current volumes). At no point do schema/types/app disagree — satisfies the schema-drift CI gate.

### 10(f) Per-defect rollout order — statutory items MUST-SHIP-BEFORE-NON-OMR

| Wave | Defects | Gate |
|---|---|---|
| 0 — unflagged bug fixes (first) | D6, D12 | none |
| 1 — fail-loud foundation | D2, D3 (+ 10a seed, 10b re-sync) | CI no-stub green |
| 2 — 🔴 STATUTORY (block non-OMR) | **D1, D9, D10, D11** | `statutory_tax` per verified tenant **+ per-country gate** |
| 3 — 🔴 STATUTORY (block non-OMR payroll) | **D4, D5**, D15/D16/D17 | `rules_payroll` + `work_calendar` per-country |
| 4 — money-correctness | D7, D8, D13, D14, D18 | `money_base` + multi-currency reconciliation proof (§6.7) |

**The line in the sand:** Waves 2–3 are prerequisites for any non-OMR tenant; **D1, D4, D5, D9 are the named blockers, enforced per onboarding country (§2.7).** The 0-employee/0-return window means Wave 3 can be fully built before any tenant depends on it. **No retroactive synthesis of historical purchase VAT** — the 16 sale-side rows stay; 0 filed returns means nothing to restate.

### 10(g) Per-migration discipline

`apply_migration` → regenerate `database.types.ts` → update every caller in the same PR → schema-drift CI gate. New nullable columns surface as optional fields (no existing caller breaks); new readers type against the regenerated `Database`. New services use `maybeSingle()`, `TenantConfigContext`, and semantic tokens so de-hardcoding fixes don't reintroduce a literal `'$'`/`'USD'`/`en-US`/`5%`.

### 10(h) Per-phase verification + back-out

Back-out is mostly "flip the flag off" or "soft-delete the added rows" — no destructive reversal. 10a: `check-geo-completeness.sql` returns 0 stubs; re-run generator (idempotent). 10b: both tenants show OMR/Arabic-capable config; `audit_trails` diff present; re-sync is itself the recovery. 10c: each tenant has exactly 1 entity + 1 `branches`; all operational rows carry non-null `legal_entity_id`; **visible-row-count per tenant unchanged (the key forensic assertion)**; nullable cols → set NULL to revert. 10d: flags verified on staging; D6/D12 verified by reproducing the original failures. 10f Wave 2/3: **multi-currency reconciliation to the penny (§6.7)**; input-VAT produces a `purchase`/`input` assessment and the return nets correctly; EOSB/payroll golden fixtures match hand-computed figures. Timezone: custody/audit event at a tz boundary renders correctly. **Forensic invariants that must survive every phase (hard stop):** `case_job_history`/`audit_trails`/`chain_of_custody` append-only; device-level custody never collapsed; RESTRICTIVE tenant isolation only ANDed, never widened.

---

## 11. Future scalability considerations

What stops the engine from rotting as we go from 2 tenants in Oman to thousands across 195 countries? **Machinery that makes the right thing the only thing that compiles, deploys, and stays current** — anchored to rails this repo already has (`eslint-rules/banned-tables.js`, `scripts/check-schema-drift.sh`, the CI gate pattern, `feature_flags`).

### (a) Reference data as VERSIONED, externally-sourced data — not code

Country/currency/locale/holiday data is an externally-sourced, versioned dataset with an import pipeline; `geo_countries` rows are **derived artifacts of a pinned upstream snapshot**, never hand-edited (closes brief §7). Sources pinned per §10a. Two global tables: `geo_reference_datasets` (immutable import provenance + checksum + version) and `geo_country_config_versions` (effective-dated config bag — `country_id`, `dataset_id`, `config jsonb`, `effective_from/to`). **Effective-dating is spent only where correctness demands it** (tax rates via §3c `geo_country_tax_rates`, holiday year-roll) — free for formatting fields (same bag, never queried by date). Pipeline: `scripts/reference-data/{fetch,normalize,diff,apply}.ts`; `npm run reference:refresh` prints a diff for **mandatory human review**; `apply.ts` reuses the §4.3 re-sync path so corrections propagate to provisioned tenants. **Deferred:** live holiday-API calls / scheduled auto-refresh (a reliability liability we don't need).

### (b) "No country-specific code" as an ENFORCED invariant

The durable fix is a guard that makes the 19th leak fail CI (the ESLint + CI gates of §2.7/§6.2/§5.3, mirroring banned-tables/raw-color discipline). New ESLint `no-hardcoded-i18n.js` (baseline-off for the ~42 existing sites, error for new code) bans literal currency symbols, `.toFixed(2)` on money, literal-locale `Intl`/`toLocaleString`, `'VAT'`/`'GST'`/numeric tax literals, `weekStartsOn:<int>`, `currency:'USD'` defaults. New CI `data-completeness` (clone of `schema-drift`/`tenant-table-requirements`) fails any active country missing currency/address/phone/tax label. A `BANNED_DEFAULTS` migration-lint assertion bans new money columns shipping `DEFAULT 'USD'::text`. This permanently prevents recurrence of the hardcoding class (D2/D9/D10/D13/D14/D15/D18); the rest (D1/D4/D5/D6) are correctness bugs fixed once.

### (c) Multi-region / data-residency path — designed now, built when signed

Single-region now, residency field + documented constraint now (one vocabulary: `'global-1'` via `master_data_residency_regions`, §3b), multi-region infra deferred. Provisioning **hard-blocks** a residency-mandated country (`geo_countries.requires_local_residency`) until a regional project exists; **enforcement covers Storage**, not just Postgres (§7.4.1). The deferred path: N regional Supabase projects + a tenant→region map (`tenants.data_residency_region`) + a platform-analytics ETL fan-in (not live cross-region joins; RLS cannot move bytes across jurisdictions). **The tenant↔region binding is immutable after provisioning** (a region change is a data re-home, not a flag flip) — flagged so a future EU region isn't a surprise.

### (d) New language / currency / jurisdiction / statutory filing = DATA or a registry entry, not a deploy

The central lever (the jsonb bag + code registry, cloning `feature_flags`): a new **currency** is a `master_currency_codes` row; a new **language** is a CLDR import + the one-time `Locale`-union widening (§5.2); a new **country config key** is a registry entry (no migration — §4.7); a new **statutory filing** is a `master_filing_obligations` row + a registered adapter (new *builder* code only for a genuinely new format); a new **sub-national jurisdiction** is `geo_regions`/`geo_subdivisions` + `geo_country_tax_rates` rows (no code). **The resolver is the only reader; CI bans direct column reads** — that is what turns a Country *table* into a Country *Engine*.

### (e) Performance — config caching, hierarchy resolution, RLS cost, indexes

Resolve the merged **display** config once per (tenant, business_unit) at session start, memoized behind the existing 5-min cache keyed on `config_version` (a reference-data `apply` invalidates cleanly); hierarchy resolution is a pure function over cached rows, never a per-request round trip. The additional RESTRICTIVE BU predicate (§2A.7) uses the `STABLE SECURITY DEFINER` `get_current_business_unit_id()` helper (planner-cached within a statement) + **composite partial indexes** `idx_<table>_tenant_bu (tenant_id, business_unit_id) WHERE deleted_at IS NULL` on high-traffic tables (`cases`/`invoices`/`case_devices`/`chain_of_custody`) — and is a **no-op `= <single bu>` for 100% of current (single-BU) tenants**, so zero measurable cost until depth is used. `geo_country_config_versions` is read-mostly by `(country_id, effective_from DESC)`; `geo_countries` stays the denormalized fast-path for current config.

### (f) Governance — curation, review cadence, compliance SLAs

Statutory correctness is a gating release criterion → named ownership. Formatting reference data: platform eng (automated pipeline + mandatory human diff-review), quarterly. Holidays: pipeline + curated GCC overlay, annual (Dec year-roll) with a named owner. **Country statutory packs (VAT rules, EOSB, payroll, filing formats): a per-market compliance owner (KSA/UAE/Oman named), reviewed on rate-change events + semi-annually, effective-dated — never auto-imported** (a wrong rate filed is a legal liability, the D1 lesson). The compliance SLA (a rate change with no effective-dated row by its `effective_from` is a release blocker) is enforced by the `data-completeness` gate extended to assert "no active country has a tax rule expiring with no successor."

### (g) Extensibility seams for new doc types / workflows / tax regimes

Three seams, each a registry + data table: **(1) Doc types/templates** — a `(doc_type, country, locale) → template` resolution over `document_templates`/`templates`; D11 becomes a country-driven `einvoiceRouter` lookup, not a toggle. **(2) Country-specific workflows** — keep the 16-stage lifecycle canonical (the forensic spine; do **not** fork it), make **gate enforcement** (`master_jurisdiction_gates`, §7.4.2) a country-pack-resolved policy — designed-for, built-when-needed. **(3) Tax regimes** — the effective-dated `geo_country_tax_rates` + `geo_subdivisions` are the seam for VAT (both-sided, D1), GST, sales tax, CGST/SGST/IGST, emirate rates; a new regime is rows + a registry-declared method, not a code path. **Closing discipline:** the config bag holds values, the code registry holds shape+defaults, the resolver is the only reader, and CI bans direct reads.

---

## 12. Phased roadmap

A single program plan synthesized across all sections. Each phase has goals, key items, and exit criteria. Phases are additive and largely parallelizable per locked decision #3 (the correctness pass and the framework are the same edits), but the **statutory gates are hard ordering constraints** — no non-OMR tenant before Phase 3's gated items land for that country.

### Phase 0 — Correctness pass (the empty-window capitalization)

- **Goals:** fix every live defect that is a paper cut today and a regulator-facing incident the moment a non-OMR tenant goes live; do it while there are 0 employees / 0 payroll / 0 returns / 0 non-unity FX rows.
- **Key items:** D6 + D12 (unflagged, first PRs); D2/D3 fail-loud foundation (`get_base_currency()`, delete US fallbacks, no-stub CI gate, `geo_countries` reference-data population from the maintained dataset + re-sync); D7/D8/D13/D14/D18 money correctness (base-currency rollups, `no-raw-currency-aggregation` lint, currency-aware `format.ts` + amountInWords, PO modal); the **gating statutory items** D1 (input-VAT writer, single system-of-record), D4 (EOSB accrual), D5 (rules-driven payroll), D9 (country tax label), with D10/D11 alongside. All behavior-changing fixes ship dark behind `tenants.feature_flags`, verified on the 2 OMR tenants, flipped per-tenant.
- **Exit criteria:** D6/D12 verified by reproducing the original failures; the multi-currency EUR-on-OMR reconciliation proof (§6.7) green; D1 produces an input/`purchase` assessment and the VAT return nets correctly; EOSB/payroll golden fixtures match hand-computed figures; CI no-stub gate green for every prepared country; **D1/D4/D5/D9 satisfied for the first target non-OMR country** (the per-country statutory gate).

### Phase 1 — Country Engine config framework + geo population + fail-loud onboarding

- **Goals:** turn the Country *table* into a Country *Engine*; make new country keys migration-free; make provisioning fail-loud and deterministic.
- **Key items:** the `src/lib/country/*` package (registry + the corrected pure `resolveConfig` + tests pinning unknown-key-throws); `geo_countries.country_config` jsonb + `config_version` + `tenants.country_config_overrides`/`resolved_country_config`; the **display-only snapshot** + the `resync_tenant_country_config()` path (§4.3); the `validate_country_config_overrides()` trigger + `registry-trigger-parity` CI gate; `geo_countries` populated from the maintained dataset for ~all onboardable countries; onboarding redesign (§9 Phase 1+2 — D6 fix, country-driven `ui_language`, Jurisdiction step → primary `legal_entities`, OTP, `seed_new_tenant` seeding `tenant_currencies` first + a `Main` `branches`); the §2A P0 hierarchy foundation (entities + collapse + dormant BU policies).
- **Exit criteria:** a brand-new country key ships with zero schema change (§4.7 worked example passes); provisioning rejects an unprepared/stub country with a 422; every existing tenant auto-collapsed to 1 entity + 1 BU with visible-row-count invariant; `country-config-completeness` CI green.

### Phase 2 — i18n extraction + multicurrency gap-table closure + reporting base-currency + country-routed templates

- **Goals:** internationalize the surface; close the dormant currency gaps; make reporting base-currency-correct; route PDFs by country.
- **Key items:** the i18n enforcement gate first (flip the rule to `error` on a frozen baseline + `check-i18n-keys.sh`), then the portal-first vertical-slice extraction into `i18n_translations`/`geo_languages`; the §3g currency gap tables (`stock_sales`/`payroll_records`/`purchase_orders`/`receipts`) wired through `resolveRateContext` + exact backfill; `tenant_exchange_rate_overrides`; reporting base-everywhere (delete inline dashboard sums, `bank_accounts` base columns, `no-raw-currency-aggregation`); the PDF cascade country layer (`countryTemplateOverride`, config-aware dates, `applyTenantLocale`) and per-entity template variant resolution.
- **Exit criteria:** the portal renders fully in a non-English tenant's language; new i18n violations fail CI; every money aggregation sums `*_base` (audited checklist complete); the invoice PDF's tax label/QR/decimals come entirely from resolved country config.

### Phase 3 — GCC-deep statutory: payroll engine, EOSB, e-invoice registry, statutory filings

- **Goals:** ship the deep statutory machinery for KSA/UAE/Oman that the gating items in Phase 0 began, as a complete country-routed framework.
- **Key items:** the full tax engine (per-line/multi-rate/inclusive/zero-vs-exempt/WHT/reverse-charge over `geo_country_tax_rates` + `tax_line_assessments`); the e-invoice registry + `einvoiceRouter` (ZATCA Phase-1 live; Phase-2/IRN/MTD/VAT201 registered stubs); the GCC VAT201 statutory return builder (gated behind D1) + `tax_return` PDF; the rules-driven payroll engine (income tax, statutory contributions by nationality, EOSB accrual ledger, day-class overtime via the work calendar) + parameterized bank files (WPS/Mudad, MUST-SHIP only for tenants running disbursement); the jurisdiction consent-gate mechanism (`master_jurisdiction_gates` + `transition_case_status` enforcement, default `warn`).
- **Exit criteria:** a GCC VAT201 reconciles to the penny across currencies; payroll for a KSA/UAE employee matches hand-computed statutory figures; ZATCA QR emits **only** for a KSA-VAT entity past `mandatory_from`; the per-country `statutory-gate` passes for each onboarded GCC country.

### Phase 4 — Gated: full hierarchy depth, multi-entity, multi-region

- **Goals:** light up the expensive depth — but only when a customer pays for it.
- **Key items (each behind a named customer):** live sub-unit isolation (flip `feature_flags.business_unit_isolation`, assign `profiles.business_unit_id`, BU management UI) — behind a named multi-site customer; sub-national tax (`geo_subdivisions` population + `tax_config` resolution, nested BUs, department org tree) — behind a named US-state/IN-GST/UAE-emirate customer; multi-entity template authoring UI + consolidated multi-entity analytics — behind a multi-entity tenant; multi-region infrastructure (regional Supabase projects + Postgres **and** Storage routing, ETL fan-in for platform metrics, the immutable tenant↔region binding) — behind a signed EU/regulated customer.
- **Exit criteria:** each capability ships with its RLS/perf load-tested (composite indexes, `STABLE` helpers) and the forensic invariants intact; no speculative depth enabled without a paying customer.

---

## 13. Open questions for product owner

Deduped across all sections into the decisive set that actually needs an owner's call:

1. **Reference dataset + cadence (blocks the no-stub gate at scale).** Which exact, pinned, maintained datasets (CLDR/ISO 3166-1/ISO 4217/libphonenumber) and which holiday provider (Nager.Date free vs Calendarific paid vs hand-curated GCC packs, given Islamic-calendar holidays move yearly), and who owns the version-bump review? This is the input to §10a/§11a and gates `country-config-completeness` going green.
2. **Statutory pack ownership + budget.** Who are the named compliance owners for KSA/UAE/Oman, and is there budget for a paid statutory-data subscription or are packs hand-authored? This sets the §11f cadence and whether the SLA is enforceable.
3. **Portal/email language scope.** Per-**tenant** language (the lab sets it) or per-**customer/recipient** language (the recipient picks)? This changes the resolution precedence on the portal and on transactional emails (§5.6). Today locale is tenant-scoped.
4. **Default entity for a case once a tenant has >1 legal entity.** Primary by default, or force an entity choice at case creation once >1 exists? Affects the CreateCaseWizard UX and per-entity tax resolution (§2A.6/§7.1).
5. **Platform subscription billing currency.** Fixed platform settlement currency (recommended, YAGNI) or bill tenants in their own currency (would require FX columns on `billing_invoices`)? (§6.8.)
6. **Translation supply for the long tail.** Beyond the 13 donor languages + GCC Arabic — professional vendor, CLDR-derived UI primitives, or machine-translation-then-review with a `is_verified` flag? Statutory document strings must be human-verified regardless (§5.6).
7. **Confirm the locked-scope reading.** Is shipping only L4-collapse now (hierarchy *depth* gated behind a named multi-entity customer) an acceptable satisfaction of locked decision #1's "depth delivered incrementally"? (§2A.9/§10c.)

---

## 14. Architecture critic findings (applied)

The architecture critic ran an adversarial pass over the authored sections and flagged a set of internal contradictions and over-engineering. Every required fix is applied in the assembled spec; here is what was flagged and how it was resolved.

- **BLOCKER — snapshot vs live vs effective-dated (the deepest, most dangerous contradiction).** The sections variously mandated a frozen tenant snapshot, a live statutory read, and effective-dated document-date resolution. **Resolved into one stated policy (§0, §2A.2, §4.3, §7.1):** the tenant snapshot holds **display/formatting config only**; statutory tax/FX is resolved **live + effective-dated at commit** and then **frozen onto the document row** for immutability. §4.3 was rewritten to explicitly exclude tax-rate/FX from the tenant snapshot; §7 owns statutory resolution.
- **BLOCKER — the load-bearing `resolveConfig` body was non-functional** (comma-operator, dead ternary, double-assignment). **Resolved (§4.1):** rewritten to a clean `value = bag[key]`, with the unknown-key-throws inversion pinned as a required test assertion.
- **BLOCKER — three incompatible BU session-claim mechanisms.** **Resolved (§2A.5):** one helper, `get_current_business_unit_id()` (profiles-primary, JWT fallback, mirroring `get_current_tenant_id()`); the `current_setting('app.business_unit_id')` GUC variant is deleted everywhere.
- **BLOCKER — two divergent BU-table designs (`branches` promoted vs a new `business_units`).** **Resolved (§2A, §3e, §8c, §9.6):** `branches` is promoted in place as the sole business-unit entity; there is no `business_units` table; every section FKs `branches(id)`.
- **BLOCKER — `legal_entities.currency_code NOT NULL` vs a placeholder-propagating backfill.** **Resolved (§2A.8, §10b):** the backfill validates the source is a real resolved currency (3-letter ISO in `master_currency_codes`, not the `'USD'` placeholder) before collapse, and fails loud per-tenant otherwise; §10b confirms the 2 OMR tenants carry real OMR identity first.
- **HIGH — inconsistent statutory gating + the EOSB open question.** **Resolved (§2.7, §7.3, §10f, §12 Phase 0/3):** the per-onboarding-country statutory pack (D1/D4/D5/D9 for THAT country) is a **stated release decision**, enforced by the `statutory-gate` CI check **per country at provisioning** — lifted out of open questions.
- **HIGH — tax-label/rate ownership in three places with two table names.** **Resolved (§3c, §7.1):** one effective-dated table, `geo_country_tax_rates` (no `master_tax_rates`); it is the source; `geo_countries.tax_label`/`default_tax_rate` are read-fallbacks the runtime never reads directly; `useTaxConfig` reads through the resolver.
- **HIGH — `vat_records` / `tax_line_assessments` double-write.** **Resolved (§7.1.4):** `tax_line_assessments` is the single append-only system-of-record; `vat_records` becomes a **derived rollup/view**, not a second independent insert.
- **HIGH — D12 data-capture vs address-formatting dependency.** **Resolved (§3f, §8g):** the D12 data-capture fix ships now with no dependency; address *rendering* is separately gated on CLDR `address_format` population.
- **HIGH — multi-region: three region-code defaults + Postgres-only enforcement.** **Resolved (§2.8, §7.4.1, §11c):** one vocabulary (`'global-1'`) and one enforcement rule; enforcement explicitly covers Supabase **Storage**, not just Postgres rows.
- **MEDIUM — over-engineering: `geo_subdivisions` population + `display_timezone`.** **Resolved:** the `geo_subdivisions` *table* ships in the foundation but its *population* is gated behind the first sub-national-tax customer (§2A.1/§2A.9 P3); `display_timezone` is **deferred** as a YAGNI key (§2.3/§2.10). L5 department config/RLS is also deferred.
- **MEDIUM — `legal_entities` created/renamed in four sections (incl. `tenant_legal_entities`).** **Resolved (§3 ownership note, §9.6):** §3 is the sole DDL owner; §8/§9/§10 consume; the `tenant_legal_entities` name is reconciled to `legal_entities`.
- **MEDIUM — `get_base_currency()` sequencing vs `seed_new_tenant`.** **Resolved (§6.5, §9.6):** `seed_new_tenant` seeds the `tenant_currencies` is_base row **first**, before any fail-loud currency default can be relied on.
- **MEDIUM — registry/trigger statutory-key drift.** **Resolved (§2.3, §2.7, §4.2):** the trigger's key-class list is generated from the same registry source, asserted by the `registry-trigger-parity` CI gate (a deliverable, not a noted risk).
- **NIT — section-number collision (two "§2"s).** **Resolved:** the umbrella is §2; the hierarchy is **§2A**; cross-references are disambiguated throughout.
- **NIT — `resolveFeatures` unknown-key inversion undertested.** **Resolved (§4.1/§4.8):** the unknown-key-throws inversion is a required assertion in `resolveCountryConfig.test.ts`.
