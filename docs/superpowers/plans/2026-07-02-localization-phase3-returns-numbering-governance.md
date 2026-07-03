# Phase 3 — Returns, Numbering Value & Publish Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase-1 fiscal kernel into a governed product: statutory returns compose from the `vat_records` subledger via `ReturnComposer` (GCC 3-box quarterly live for Oman, drill-down reconciling on the same `tax_period` dimension), fiscal-template numbering goes into production from `master_numbering_policies` pack data, and the Country Authoring Studio + dual-control publish gate publishes AE and SA to `statutory_ready` end-to-end — including the `zatca_ph1` e-invoice regime row that retires the `einvoiceRouting.ts` hardcode.

**Architecture:** Everything statutory stays DATA governed by RPCs: return boxes are composed client-side by registered `ReturnComposer` plugins from base-currency subledger rows and persisted atomically by a server-side `file_vat_return` RPC that re-derives the boxes from `vat_records` (REST-unforgeable); country packs are versioned rows (`master_country_pack_versions`) published only through `publish_country_pack`, a four-part machine gate (fixture replay, capability manifest, dual control, coverage checks) that machine-derives `geo_countries.config_status` and resyncs + pins every tenant of that country. The Studio is a platform-admin React surface over those RPCs — no direct table writes, provenance stamped into `platform_audit_logs` on every mutation.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query v5, Supabase (Postgres 15 RPCs via `mcp__supabase__apply_migration`, pg_cron 1.6.4), Vitest 4, pdfmake (untouched except the invoice adapter QR routing), lucide-react icons, semantic theme tokens.

**Entry criteria (must be merged/true before starting):**
- **Phase 0** merged: `vat_records` carries `currency`, `exchange_rate`, `vat_amount_base numeric(19,4)`, `taxable_amount_base`, `tax_period` (always stamped); `tenantToday(timezone)` exists at `src/lib/tenantToday.ts`; VATReturnModal UTC boundary fix landed (this plan then replaces that period math wholesale); `trg_tenants_apply_country_config` fires on `country_id` UPDATE.
- **Phase 1** merged: `src/lib/regimes/types.ts` (all contract §1.1–1.4 interfaces incl. `ReturnComposer`, `ComposedReturn`, `ReturnBoxLine`, `EInvoicingTransport`, `IssuedDocumentSnapshot`, `VatRecordRow`), `src/lib/regimes/registry.ts` (`registerRegimePlugin`, `resolveReturnComposer`, `resolveEInvoicingTransport`, `listRegisteredCapabilities`), `src/lib/tax/publishGate.ts` (`runPublishGate`, `PackFixture`, `FixtureRunResult`); tables `master_country_pack_versions`, `master_country_pack_tests`, `master_engine_capabilities`, `geo_country_tax_rates` (9 countries seeded incl. AE 5% / SA 15%), `master_einvoice_regimes`, `document_tax_lines`, `einvoice_submissions`; RPCs `issue_tax_document` (with `p_dry_run`), `get_next_number` v2 (reads `format_template`/`reset_basis`/`fiscal_year_anchor`, tokens `{FY}` `{SEQ:n}`), `preview_number_format(p_scope, p_format_template)`, 9-arg `update_number_sequence` (admin-gated, audited, legal-scope rewind-blocked); the five `regime.*` registry keys; reserved pack keys `compliance.audit_file_exports`, `custody.unclaimed_property`, `privacy.regime` present in the registry.
- **Phase 2** merged: `master_document_requirements` + `master_unit_codes` tables exist (the requirements editor and gate part ④ read them); `ResolvedCountryFacts` is threaded into the PDF adapters (this plan extends it with `einvoiceRegimeKey`).
- Live-DB caveat: `supabase/migrations/` is a partial mirror; the manifest (`supabase/migrations.manifest.md`) + live DB are ground truth. All line numbers cited below were verified on `main @ 9684297`; if Phases 0–2 moved a cited region, re-anchor on the quoted code, not the line number.

## Global Constraints

Verbatim repo rules every task inherits:

- **Additive-only migrations** — no `DROP TABLE`, no `DROP COLUMN`, no `DELETE FROM`. Soft deletes (`deleted_at = now()`) only.
- **Every new tenant-scoped table** gets: `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`; RLS `ENABLE` + `FORCE`; RESTRICTIVE `{table}_tenant_isolation` policy (`tenant_id = get_current_tenant_id() OR is_platform_admin()`); PERMISSIVE per-operation policies (financial writes gated `has_role('accounts')`, DELETE gated `has_role('admin')`); `set_<table>_tenant_and_audit` trigger executing `set_tenant_and_audit_fields()`; `idx_<table>_tenant_id` partial index `WHERE deleted_at IS NULL`; `deleted_at timestamptz`.
- **Global master tables**: no `tenant_id`; SELECT `USING (true)` for authenticated; INSERT/UPDATE/DELETE `is_platform_admin()` only (writes in practice via the governed RPCs).
- `maybeSingle()` never `single()`.
- `src/types/database.types.ts` is **generated** — regen via `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) after every migration; never hand-edit.
- **Migration discipline per PR**: apply via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) → regen types → update ALL callers → append a `| <version> | <filename> | <classification> | <summary> | <PR> |` row to `supabase/migrations.manifest.md` → use `.github/PULL_REQUEST_TEMPLATE/migration.md`.
- `npm run typecheck` must stay at **0 errors** (`scripts/check-tsc.sh` enforces zero).
- pdfmake is the sole PDF library. lucide-react is the sole icon library.
- Semantic theme tokens only — no `bg-purple-*`/`bg-indigo-*`/`bg-violet-*`, no brand hexes; use `primary/secondary/accent/surface/border/ring/success/warning/danger/info` tokens.
- No new npm packages without checking existing ones first (this plan adds **zero** packages).
- Custody/audit tables are append-only; never weaken `prevent_audit_mutation`.
- Never hardcode currency symbols, tax labels, or date formats — `TenantConfigContext` / resolved country config only.
- TanStack Query keys centralized in `src/lib/queryKeys.ts`.
- Do not reuse a merged work branch — each WP starts on a fresh branch cut from `main`.

## Objectives

1. **Returns from the subledger** — `tax_return_lines` child table; `vat_returns` gains `regime_key`/`filing_frequency`/`period_anchor` (+ widening to `numeric(19,4)`); `gcc_return` ReturnComposer (3-box, monthly/quarterly/annual period bounds in tenant-local date strings); `file_vat_return` RPC that re-derives boxes server-side from `vat_records.vat_amount_base` by `tax_period` and refuses divergent submissions; drill-down queries the SAME `tax_period` dimension so a filed Oman quarterly return reconciles exactly.
2. **Fiscal-template numbering in production** — `master_numbering_policies` pack table + OM/AE/SA seeds; `apply_country_numbering_policy` RPC (non-destructive fill of dormant `number_sequences` fiscal columns); SystemNumbers settings UI surfaces `format_template`/`reset_basis`/`fiscal_year_anchor` with live `preview_number_format` preview; regression probes that legal-scope counter rewind stays blocked.
3. **Publish governance** — the six contract RPCs (`create_country_pack_draft`, `submit_country_pack_for_review`, `upsert_country_tax_rate`, `upsert_document_requirement`, `upsert_country_pack_test`, `publish_country_pack`) plus this plan's authoring extensions (`upsert_country_einvoice_regime`, `upsert_country_numbering_policy`, `update_country_pack_facts`, `record_pack_test_result`, `sync_engine_capabilities`); four-part machine gate; machine-derived `config_status`; publish→resync discipline with a verifiable no-op resync; pg_cron staleness monitor.
4. **Country Authoring Studio** — platform-admin pages: pack list + staleness dashboard, pack editor over all pack dimensions (rates, requirements, e-invoice regimes, numbering, fixtures, reserved E8/E9/privacy keys shown read-only), version lifecycle draft→in_review→published→superseded, dual-control publish UI (publish disabled for the author), fixture gate runner.
5. **CLDR import job** — operator script seeding locale facts (currency from ISO-4217 via CLDR `currencyData`, weekend/week-start from CLDR `weekData`) as a reviewable operator SQL seed, following the existing `geo:build-seed` convention.
6. **AE/SA end-to-end proof** — both packs authored through the Studio RPCs, fixtures green, published through the FULL gate to `statutory_ready`; SA pack carries `zatca_ph1` as `master_einvoice_regimes` row #1 (`render_artifact` — the existing TLV QR path, now a registered `EInvoicingTransport` plugin); `src/lib/pdf/engine/einvoiceRouting.ts` **deleted**.

## Non-goals

- **Platform subscription billing** — separate workstream (owner E4). It reuses these primitives but must not appear in this phase.
- India (`in_gst`, GSTR composers, TDS withholding, `in_irn`) — Phase 4. US/UK composers (`us_jurisdiction_remit`, `uk_mtd_9box`), Avalara/TaxJar adapters, `zatca_ph2` clearance edge function — Phase 5. This phase ships `gcc_return` only; the composer INTERFACE consumed here is the contract one, so those land as data + plugins later.
- Staged/deferred per-tenant pack upgrades during filing-sensitive windows — pre-production (owner decision), publish resyncs all tenants of the country immediately; the staged-rollout control is deferred until there are production tenants.
- UK stagger groups / non-month-aligned period anchors — `gcc_return` explicitly rejects them (`CountryConfigError`); `uk_mtd_9box` (Phase 5) owns stagger.
- Return PDF/export artifact rendering — the "Export VAT Report" dead button stays out of scope; filing artifacts are Phase 5 (`filing_api`) territory.
- Implementing consumers for reserved pack keys (E8 unclaimed property, E9 audit-file exports, privacy.regime) — surfaced read-only in the Studio only; consumers are Phase 6.
- **`master_unit_codes` (UN/ECE Rec-20 / UQC) editing in the Studio** — units are a GLOBAL table owned/seeded by Phase 2, not a per-country pack-authoring dimension. The Studio's Facts tab covers scalars + regime.* bindings + filing keys + rounding + amount-words scale (spec pack-contents rows 696–701); a per-pack Units editor is deferred (no launch country changes the global unit set), tracked for a later phase if a jurisdiction ever needs bespoke UQC rows.
- Payroll (`PayrollPack`) — Phase 6.

## Architecture Decisions

1. **Boxes are composed client-side, but FILED server-side against a re-derivation.** Decision: `file_vat_return(p_return, p_lines, p_tax_periods)` re-sums `vat_records.vat_amount_base` by `tax_period` inside the RPC and raises on divergence > 0.0001 from the submitted boxes. Rationale: the composer must be a pure, golden-testable TS plugin (contract §1.4), but a statutory number must not be forgeable via raw PostgREST — the RPC makes the subledger authoritative. Alternative rejected: trusting client-computed boxes (REST-forgeable) or porting the composer to plpgsql (duplicates the plugin logic the contract puts in TS).
2. **Filing frequency/anchor/composer selection are Country Engine registry keys.** Decision: add `tax.filing_frequency` (default `'quarterly'`), `tax.period_anchor` (default `'01-01'`) — both named by the spec (§1.6 line 177) — and `tax.return_composer` (default `'gcc_return'`), all `maxOverrideLayer: 'country'`, snapshot onto `vat_returns` at filing. Rationale: the pack contents table (spec line 701) makes the return shape pack data; the registry is the shipped mechanism for country-locked keys and needs zero schema change. Alternative rejected: new `geo_countries` scalar columns (registry keys are additive without migration and already govern lock semantics). *Note:* `tax.return_composer` is a plan-added key name — flagged to the owner (open question), chosen because the contract locked exactly five `regime.*` plugin-binding keys and the composer binding was left to "vat_returns.regime_key + composer params".
3. **Gate part ① (fixture replay) is enforced via recorded, fresh results — not by running TS inside Postgres.** Decision: the Studio's "Run gate" button executes `runPublishGate` (mode `'dry_run_rpc'` when a same-country tenant context exists — Oman; mode `'kernel'` otherwise — AE/SA have no tenant) and persists each result via `record_pack_test_result`; `publish_country_pack` then requires every `master_country_pack_tests` row for the pack to have `last_result->>'pass' = 'true'` AND `last_run_at >= content_updated_at` (a new column this plan adds, bumped by every `upsert_*` authoring RPC). Rationale: the tax kernel is TypeScript; Postgres cannot execute it, and `issue_tax_document(p_dry_run)` needs a real draft document row that cannot exist for a country with zero tenants. Freshness-stamped results close the "edit one rate row after the run" hole (graft 1) because any edit bumps `content_updated_at` and stales every result. Alternative rejected: a plv8/edge-function replay inside the RPC (new runtime dependency, violates "no code sharing between edge functions", and still can't fabricate tenant documents).
4. **Capability manifest gaps degrade, they don't block.** Decision: missing capabilities (a `regime.*` key or `master_einvoice_regimes.adapter_key` absent from `master_engine_capabilities`) cap `config_status` at `formatting_ready` while still allowing publish of the formatting facts; failing fixtures / missing standard rate / unparseable requirement conditions / over-length numbering templates block publish outright; author = approver raises immediately. Rationale: spec line 719's honest-degradation semantics ("publishes formatting_ready but stays un-onboardable with a 422 naming exactly what's missing"). Alternative rejected: all-or-nothing publish (would block shipping formatting data for future-regime countries).
5. **`zatca_ph1` retirement is a plugin + facts-key, not a smarter hardcode.** Decision: `ResolvedCountryFacts` gains `einvoiceRegimeKey` resolved from `master_einvoice_regimes` (first row with `mandatory_from <= today`, else `'no_einvoice'`); the invoice adapter emits the TLV QR iff `einvoiceRegimeKey === 'zatca_ph1'`, building the payload through the registered `EInvoicingTransport` plugin; `einvoiceRouting.ts` and `normalizeSaudi` are deleted (owner: prefer redesign over patching). Rationale: keys on the regime, never the country string — satisfies the Phase-1 `no-country-branching-outside-regimes` lint. Alternative rejected: keeping `shouldEmitZatcaQr` and feeding it DB data (still country-string branching in the render path).
6. **Numbering policy application is non-destructive.** Decision: `apply_country_numbering_policy` fills `format_template`/`reset_basis`/`fiscal_year_anchor` on a tenant's `number_sequences` rows ONLY where the column is currently NULL. Rationale: a tenant admin's explicit sequence configuration must survive a pack republish; policies are defaults, not overrides (mirrors the defaults-vs-overrides cascade). Alternative rejected: force-overwrite on publish (would clobber tenant-legal series mid-year).
7. **`max_length` stays pack data.** `number_sequences` is contract-frozen at zero schema change; the publish gate validates every `master_numbering_policies.format_template` renders within `max_length` via a SQL length calculator (`numbering_template_render_length`), and `get_next_number` v2 (Phase 1) enforces it at mint time by joining the tenant's country policy. This plan only adds the gate-side calculator + seeds.
8. **One generic Studio CRUD table.** Decision: a single `PackRowsTable` component parameterized by column definitions renders the rates/requirements/regimes/numbering tabs. Rationale: four near-identical admin CRUD grids; DRY beats four bespoke tables, and the platform-admin surface is not tenant-facing polish territory.

## Database Changes

All applied via `mcp__supabase__apply_migration` with `project_id = ssmbegiyjivrcwgcqutu`. Every migration task below includes: SQL → assertion probes (before/after) → types regen → manifest row.

| # | Migration name | Purpose | Tables/functions touched | Classification |
|---|---|---|---|---|
| M3-1 | `phase3_tax_return_lines` | `vat_returns` child boxes table | + `tax_return_lines` (tenant, full ceremony) | Additive |
| M3-2 | `phase3_vat_returns_regime_columns` | Return regime snapshot + precision | `vat_returns` + `regime_key`,`filing_frequency`,`period_anchor`; widen `output_vat`/`input_vat`/`net_vat` → numeric(19,4) | Additive |
| M3-3 | `phase3_file_vat_return_rpc` | Atomic, subledger-verified filing | + `file_vat_return(jsonb, jsonb, text[])` | Additive |
| M3-4 | `phase3_master_numbering_policies` | Per-country numbering pack table + OM/AE/SA seeds | + `master_numbering_policies` (global) | Additive |
| M3-5 | `phase3_apply_country_numbering_policy` | Non-destructive policy → tenant sequences | + `apply_country_numbering_policy(uuid)` | Additive |
| M3-6 | `phase3_pack_authoring_rpcs` | Governed authoring writes + gate helpers | + `content_updated_at` on `master_country_pack_versions`; + `create_country_pack_draft`, `submit_country_pack_for_review`, `upsert_country_tax_rate`, `upsert_document_requirement`, `upsert_country_pack_test`, `upsert_country_einvoice_regime`, `upsert_country_numbering_policy`, `update_country_pack_facts`, `record_pack_test_result`, `validate_requirement_condition`, `numbering_template_render_length` | Additive |
| M3-7 | `phase3_publish_country_pack` | The four-part publish gate | + `publish_country_pack(uuid, int)`; + `sync_engine_capabilities(jsonb)` | Additive |
| M3-8 | `phase3_pack_staleness_monitor` | Overdue-review standing monitor | + `refresh_pack_staleness()`; pg_cron job `pack-staleness-daily` | Additive |
| M3-9 | `phase3_sa_zatca_ph1_regime_row` | SA e-invoice regime row #1 (via RPC, recorded as migration for manifest traceability) | `master_einvoice_regimes` data row | Additive (data) |
| M3-10 | `phase3_statutory_keys_filing_trigger` | Registry↔trigger parity for the 3 filing keys (Task 4) | `validate_country_config_overrides()` `statutory_keys` literal | Additive (function) |

## Backend Implementation (summary)

| Module | Contents |
|---|---|
| `src/lib/regimes/gcc_return/index.ts` (+ `fixtures/`) | `gccReturnComposer: ReturnComposer` — month-aligned `periodBounds` (monthly/quarterly/annual, `MM-DD` anchor, tenant-local date strings, zero `Date`-timezone round-trips), 3-box `compose` summing `vat_amount_base` by `record_type`, `CountryConfigError` on base≠jurisdiction currency and on non-month-aligned anchors |
| `src/lib/tax/taxReturnService.ts` | `getFilingConfig`, `composeReturnForDate`, `fileReturn`, `getReturnLines`, `getReturnLedgerRows`, `taxPeriodsBetween` — the orchestration seam between config, composer, subledger, and the filing RPC |
| `src/lib/vatService.ts` | `getVATRecordsByReturn` re-based onto `tax_period` (kills the `created_at` drill-down divergence at :279); `getQuarterlyVATSummary` derives periods from the composer instead of hardcoded calendar quarters (:287-293) |
| `src/lib/countryPackService.ts` | Typed wrappers for every governance RPC + pack detail/list/staleness queries + `runPackFixtures` (publishGate → `record_pack_test_result`) + `syncEngineCapabilities` |
| `src/lib/tax/hash.ts` | `sha256Hex(input: string \| Uint8Array): string` — pure sync SHA-256 (needed by `EInvoicingTransport.buildArtifact`'s sync contract; wide signature satisfies the Phase 4/5 consumers that pass `Uint8Array`) |
| `src/lib/regimes/zatca_ph1/index.ts` | `zatcaPh1Transport: EInvoicingTransport` (`render_artifact`) wrapping the existing `buildZatcaTlvBase64` |
| `src/lib/pdf/countryFactsService.ts` + `src/lib/pdf/engine/countryConfig.ts` | `ResolvedCountryFacts.einvoiceRegimeKey` resolved from `master_einvoice_regimes` |
| `src/lib/country/registry.ts` | + `tax.filing_frequency`, `tax.period_anchor`, `tax.return_composer` ConfigKeyDefs (`maxOverrideLayer: 'country'`) |
| `scripts/country-engine/cldrMapping.ts` + `import-cldr.test.ts` | CLDR → operator-seed SQL generator (GENERATE=1 gated, network fetch at generation time only) |
| **Deleted** | `src/lib/pdf/engine/einvoiceRouting.ts` (+ its test) and `normalizeSaudi` in `invoiceAdapter.ts` |

## Frontend Implementation (summary)

| Surface | Change |
|---|---|
| `src/components/financial/VATReturnModal.tsx` | Rewritten: composer-derived period picker (prev/next period navigation via `tenantToday` + `periodBounds`), 3-box display, files via `fileReturn` — no `toISOString()` date math, no free-range periods |
| `src/components/financial/VATReturnDetailModal.tsx` (new) | Drill-down: boxes + underlying `vat_records` rows fetched by the SAME `tax_period` list + a live reconciliation badge (Σ ledger == box) |
| `src/pages/financial/VATAuditPage.tsx` | Modal call-site rewired (`onFiled` invalidation instead of `onSave`); "View" action per return row opens the drill-down |
| `src/pages/settings/SystemNumbers.tsx` | Edit modal gains `format_template` / `reset_basis` / `fiscal_year_anchor` fields + debounced `preview_number_format` live preview; 9-arg `update_number_sequence` call |
| `src/pages/platform-admin/CountryPacksPage.tsx` (new) | Country list with `config_status`, published version, staleness badges; staleness dashboard strip; "Sync capabilities" action |
| `src/pages/platform-admin/CountryPackEditorPage.tsx` (new) | Tabs: Rates · Requirements · E-invoice · Numbering · Fixtures · Reserved keys · Lifecycle/Publish |
| `src/components/platform-admin/country-packs/PackRowsTable.tsx` (new) | Generic pack-dimension CRUD grid |
| `src/components/platform-admin/country-packs/PackPublishPanel.tsx` (new) | Draft/submit/run-gate/publish lifecycle; publish disabled when current admin authored the pack; gate result rendering |
| `src/components/platform-admin/country-packs/PackFixturesTab.tsx` (new) | Fixture list + JSON editor + "Run fixtures" (publishGate) with per-fixture diff display |
| `src/App.tsx` + `PlatformAdminLayout` nav + `src/lib/queryKeys.ts` | Routes `platform-admin/countries`, `platform-admin/countries/:countryId`; `countryPackKeys` |

## APIs & Services — exact signatures created/changed this phase

**SQL RPCs (all SECURITY DEFINER, `SET search_path = public`, `REVOKE ... FROM PUBLIC, anon`):**
```sql
file_vat_return(p_return jsonb, p_lines jsonb, p_tax_periods text[]) RETURNS vat_returns
apply_country_numbering_policy(p_tenant_id uuid) RETURNS int
create_country_pack_draft(p_country_id uuid, p_changelog text) RETURNS uuid          -- contract §2.6
submit_country_pack_for_review(p_pack_version_id uuid) RETURNS void                   -- contract §2.6
upsert_country_tax_rate(p_row jsonb) RETURNS uuid                                     -- contract §2.6
upsert_document_requirement(p_row jsonb) RETURNS uuid                                 -- contract §2.6
upsert_country_pack_test(p_row jsonb) RETURNS uuid                                    -- contract §2.6
upsert_country_einvoice_regime(p_row jsonb) RETURNS uuid                              -- plan-added
upsert_country_numbering_policy(p_row jsonb) RETURNS uuid                             -- plan-added
update_country_pack_facts(p_country_id uuid, p_scalars jsonb, p_config jsonb) RETURNS void  -- plan-added
record_pack_test_result(p_test_id uuid, p_result jsonb) RETURNS void                  -- plan-added
sync_engine_capabilities(p_capabilities jsonb) RETURNS int                            -- plan-added
publish_country_pack(p_country_id uuid, p_version int) RETURNS jsonb                  -- contract §2.6 return shape
validate_requirement_condition(p_condition jsonb) RETURNS boolean                     -- gate helper (IMMUTABLE)
numbering_template_render_length(p_format_template text, p_padding int) RETURNS int   -- gate helper (IMMUTABLE)
refresh_pack_staleness() RETURNS void                                                 -- pg_cron target
```

**TypeScript:**
```typescript
// src/lib/regimes/gcc_return/index.ts
export const gccReturnComposer: ReturnComposer;            // key 'gcc_return', version '1.0.0'

// src/lib/tax/taxReturnService.ts
export interface FilingConfig { composerKey: string; filingFrequency: 'monthly'|'quarterly'|'annual';
  periodAnchor: string; timezone: string; baseCurrency: string; jurisdictionCurrency: string; legalEntityId: string; }
export interface ComposedReturnPreview { periodStart: string; periodEnd: string; taxPeriods: string[];
  composed: ComposedReturn; outputVat: number; inputVat: number; netVat: number;
  regimeKey: string; filingFrequency: string; periodAnchor: string; }
export function taxPeriodsBetween(startYm: string, endYm: string): string[];
export async function getFilingConfig(tenantId: string): Promise<FilingConfig>;
export async function composeReturnForDate(tenantId: string, forDate?: string): Promise<ComposedReturnPreview>;
export async function fileReturn(preview: ComposedReturnPreview, status: 'draft' | 'review'): Promise<VatReturnRow>;
export async function getReturnLines(vatReturnId: string): Promise<TaxReturnLineRow[]>;
export async function getReturnLedgerRows(vatReturn: Pick<VatReturnRow,'period_start'|'period_end'>): Promise<VatRecordRow[]>;

// src/lib/vatService.ts (changed)
export const getVATRecordsByReturn: (periodStart: string, periodEnd: string) => Promise<VATRecord[]>; // now tax_period-based

// src/lib/tax/hash.ts
export function sha256Hex(input: string | Uint8Array): string;

// src/lib/regimes/zatca_ph1/index.ts
export const zatcaPh1Transport: EInvoicingTransport;       // key 'zatca_ph1', regimeClass 'render_artifact'

// src/lib/pdf/engine/countryConfig.ts (extended)
export interface ResolvedCountryFacts { /* existing fields */ einvoiceRegimeKey: string; }

// src/lib/countryPackService.ts — see Task 19 for the full export list
```

## File-by-File Implementation Tasks

Tasks are numbered globally. Work packages are PR-able units — each ends with its own verification and a fresh branch cut from `main`.

---

# WP-1 — Returns data model + filing RPC (branch: `feat/p3-returns-schema`)

### Task 1: `tax_return_lines` table

**Files:**
- Migration: `phase3_tax_return_lines` (via `mcp__supabase__apply_migration`)
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `supabase/migrations.manifest.md` (append row)

**Interfaces:**
- Consumes: `vat_returns` table (existing), `set_tenant_and_audit_fields()`, `get_current_tenant_id()`, `is_platform_admin()`, `has_role(text)`, `is_staff_user()` (all existing DB helpers).
- Produces: table `tax_return_lines` with columns `id, tenant_id, vat_return_id, box_code, box_label, amount_base numeric(19,4), quantity numeric(14,3), unit_code, meta jsonb, sequence int, created_at, created_by, updated_at, updated_by, deleted_at` — consumed by Task 3 (`file_vat_return`), Task 6 (`getReturnLines`), and Phase 4/5 composers (GSTR-1 `quantity`+`unit_code` dimensions are already present).

- [ ] **Step 1: Failing probe — table absent**

Run via `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):
```sql
SELECT to_regclass('public.tax_return_lines') AS t;
```
Expected: `t = null`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase3_tax_return_lines`:
```sql
CREATE TABLE tax_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vat_return_id uuid NOT NULL REFERENCES vat_returns(id),
  box_code text NOT NULL,
  box_label text NOT NULL,
  amount_base numeric(19,4) NOT NULL DEFAULT 0,
  quantity numeric(14,3),
  unit_code text,
  meta jsonb,
  sequence int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  deleted_at timestamptz
);

ALTER TABLE tax_return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_return_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY "tax_return_lines_tenant_isolation" ON tax_return_lines
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());

CREATE POLICY "tax_return_lines_select" ON tax_return_lines
  FOR SELECT TO authenticated USING (is_staff_user());
CREATE POLICY "tax_return_lines_insert" ON tax_return_lines
  FOR INSERT TO authenticated WITH CHECK (has_role('accounts'));
CREATE POLICY "tax_return_lines_update" ON tax_return_lines
  FOR UPDATE TO authenticated USING (has_role('accounts'));
CREATE POLICY "tax_return_lines_delete" ON tax_return_lines
  FOR DELETE TO authenticated USING (has_role('admin'));

CREATE TRIGGER set_tax_return_lines_tenant_and_audit
  BEFORE INSERT OR UPDATE ON tax_return_lines
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();

CREATE INDEX idx_tax_return_lines_tenant_id ON tax_return_lines(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tax_return_lines_return ON tax_return_lines(vat_return_id) WHERE deleted_at IS NULL;
```

- [ ] **Step 3: Post-probe — ceremony complete**

```sql
SELECT
  (SELECT to_regclass('public.tax_return_lines') IS NOT NULL) AS table_exists,
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE relname='tax_return_lines') AS rls_forced,
  (SELECT count(*) FROM pg_policies WHERE tablename='tax_return_lines') AS policy_count,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='tax_return_lines'::regclass AND tgname='set_tax_return_lines_tenant_and_audit') AS trigger_count,
  (SELECT count(*) FROM pg_indexes WHERE tablename='tax_return_lines' AND indexname='idx_tax_return_lines_tenant_id') AS idx_count;
```
Expected: `table_exists=true, rls_forced=true, policy_count=5, trigger_count=1, idx_count=1`.

- [ ] **Step 4: Regenerate types**

`mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) → save output to `src/types/database.types.ts`. Then run: `npm run typecheck` — expected: 0 errors.

- [ ] **Step 5: Manifest row**

Append to `supabase/migrations.manifest.md` table (fill the applied version timestamp reported by the MCP):
```
| <version> | phase3_tax_return_lines.sql | Additive | tax_return_lines vat_returns child (box_code/box_label/amount_base 19,4/quantity+unit_code for GSTR-1) with full tenant ceremony | P3 WP-1 |
```
Run: `SUPABASE_DB_URL=... bash scripts/check-migration-manifest.sh` if `SUPABASE_DB_URL` is available locally; otherwise CI's `migration-manifest` job covers it.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): tax_return_lines — vat_returns box child table (P3 M3-1)"
```

### Task 2: `vat_returns` regime columns + precision widening

**Files:**
- Migration: `phase3_vat_returns_regime_columns`
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Produces: `vat_returns.regime_key text`, `vat_returns.filing_frequency text CHECK IN ('monthly','quarterly','annual')`, `vat_returns.period_anchor text`; `output_vat/input_vat/net_vat` at `numeric(19,4)` — consumed by Task 3 and Task 8.

- [ ] **Step 1: Failing probe**

```sql
SELECT column_name, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema='public' AND table_name='vat_returns'
  AND column_name IN ('regime_key','filing_frequency','period_anchor','output_vat');
```
Expected: only `output_vat` returned, at precision 12 scale 2 (Appendix A ground truth).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase3_vat_returns_regime_columns`:
```sql
ALTER TABLE vat_returns
  ADD COLUMN IF NOT EXISTS regime_key text,
  ADD COLUMN IF NOT EXISTS filing_frequency text
    CHECK (filing_frequency IS NULL OR filing_frequency IN ('monthly','quarterly','annual')),
  ADD COLUMN IF NOT EXISTS period_anchor text
    CHECK (period_anchor IS NULL OR period_anchor ~ '^\d{2}-\d{2}$');

ALTER TABLE vat_returns
  ALTER COLUMN output_vat TYPE numeric(19,4),
  ALTER COLUMN input_vat  TYPE numeric(19,4),
  ALTER COLUMN net_vat    TYPE numeric(19,4);
```

- [ ] **Step 3: Post-probe**

Re-run the Step-1 query. Expected: 4 rows; `output_vat` now precision 19 scale 4.

- [ ] **Step 4: Regen types + typecheck**

`mcp__supabase__generate_typescript_types` → `src/types/database.types.ts`; `npm run typecheck` → 0 errors.

- [ ] **Step 5: Manifest row + commit**

```
| <version> | phase3_vat_returns_regime_columns.sql | Additive | vat_returns +regime_key/filing_frequency/period_anchor; output/input/net widened to numeric(19,4) | P3 WP-1 |
```
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): vat_returns regime snapshot columns + 19,4 widening (P3 M3-2)"
```

### Task 3: `file_vat_return` RPC — subledger-verified atomic filing

**Files:**
- Migration: `phase3_file_vat_return_rpc`
- Modify: `src/types/database.types.ts` (regenerated — Functions section)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `vat_records.vat_amount_base`, `vat_records.tax_period` (Phase 0), Task 1 + Task 2 columns.
- Produces: `file_vat_return(p_return jsonb, p_lines jsonb, p_tax_periods text[]) RETURNS vat_returns`. `p_return` keys: `period_start, period_end, output_vat, input_vat, net_vat, status ('draft'|'review'), regime_key, filing_frequency, period_anchor`. `p_lines`: array of `{boxCode, boxLabel, amountBase, quantity?, unitCode?, meta?, sequence?}` (the `ReturnBoxLine` wire shape). Consumed by Task 6 (`fileReturn`).

- [ ] **Step 1: Failing probe — function absent**

```sql
SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
WHERE ns.nspname='public' AND p.proname='file_vat_return';
```
Expected: `n = 0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase3_file_vat_return_rpc`:
```sql
CREATE OR REPLACE FUNCTION file_vat_return(p_return jsonb, p_lines jsonb, p_tax_periods text[])
RETURNS vat_returns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := get_current_tenant_id();
  v_output numeric(19,4);
  v_input  numeric(19,4);
  v_ret    vat_returns;
  v_line   jsonb;
  v_seq    int := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'file_vat_return: no tenant context';
  END IF;
  IF NOT has_role('accounts') THEN
    RAISE EXCEPTION 'file_vat_return: requires accounts role';
  END IF;
  IF p_tax_periods IS NULL OR array_length(p_tax_periods, 1) IS NULL THEN
    RAISE EXCEPTION 'file_vat_return: p_tax_periods is required (tax_period is the only period dimension)';
  END IF;
  IF (p_return->>'period_start') IS NULL OR (p_return->>'period_end') IS NULL THEN
    RAISE EXCEPTION 'file_vat_return: period_start and period_end are required';
  END IF;
  IF COALESCE(p_return->>'status', 'draft') NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'file_vat_return: status must be draft or review at filing time';
  END IF;
  -- Reject overlapping non-void returns for the same months (double-declaration guard).
  IF EXISTS (
    SELECT 1 FROM vat_returns vr
    WHERE vr.tenant_id = v_tenant AND vr.deleted_at IS NULL
      AND vr.period_start <= (p_return->>'period_end')::date
      AND vr.period_end   >= (p_return->>'period_start')::date
  ) THEN
    RAISE EXCEPTION 'file_vat_return: an existing return already covers part of % .. %',
      p_return->>'period_start', p_return->>'period_end';
  END IF;

  -- THE authoritative numbers: re-derived from the subledger on the tax_period dimension.
  SELECT COALESCE(SUM(vat_amount_base) FILTER (WHERE record_type = 'sale'), 0),
         COALESCE(SUM(vat_amount_base) FILTER (WHERE record_type = 'purchase'), 0)
    INTO v_output, v_input
    FROM vat_records
   WHERE tenant_id = v_tenant
     AND deleted_at IS NULL
     AND tax_period = ANY(p_tax_periods);

  IF abs(v_output - (p_return->>'output_vat')::numeric) > 0.0001
     OR abs(v_input - (p_return->>'input_vat')::numeric) > 0.0001 THEN
    RAISE EXCEPTION
      'file_vat_return: submitted boxes diverge from the vat_records subledger (output submitted % vs ledger %, input submitted % vs ledger %)',
      (p_return->>'output_vat')::numeric, v_output, (p_return->>'input_vat')::numeric, v_input;
  END IF;

  INSERT INTO vat_returns
    (tenant_id, period_start, period_end, output_vat, input_vat, net_vat,
     status, regime_key, filing_frequency, period_anchor)
  VALUES
    (v_tenant, (p_return->>'period_start')::date, (p_return->>'period_end')::date,
     v_output, v_input, v_output - v_input,
     COALESCE(p_return->>'status', 'draft'),
     p_return->>'regime_key', p_return->>'filing_frequency', p_return->>'period_anchor')
  RETURNING * INTO v_ret;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) LOOP
    v_seq := v_seq + 1;
    INSERT INTO tax_return_lines
      (tenant_id, vat_return_id, box_code, box_label, amount_base, quantity, unit_code, meta, sequence)
    VALUES
      (v_tenant, v_ret.id, v_line->>'boxCode', v_line->>'boxLabel',
       (v_line->>'amountBase')::numeric,
       NULLIF(v_line->>'quantity', '')::numeric,
       NULLIF(v_line->>'unitCode', ''),
       v_line->'meta',
       COALESCE((v_line->>'sequence')::int, v_seq));
  END LOOP;

  RETURN v_ret;
END
$fn$;

REVOKE ALL ON FUNCTION file_vat_return(jsonb, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION file_vat_return(jsonb, jsonb, text[]) TO authenticated, service_role;
```

- [ ] **Step 3: Post-probes — divergence rejection + grant posture**

```sql
SELECT p.proname, p.prosecdef,
       NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_revoked
FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
WHERE ns.nspname='public' AND p.proname='file_vat_return';
```
Expected: 1 row, `prosecdef=true`, `anon_revoked=true`.

Behavioral probe (runs as postgres — tenant context absent, so expect the tenant guard, proving the function raises rather than defaults):
```sql
SELECT file_vat_return('{"period_start":"2026-04-01","period_end":"2026-06-30","output_vat":1,"input_vat":0,"net_vat":1}'::jsonb, '[]'::jsonb, ARRAY['2026-04']);
```
Expected: `ERROR: file_vat_return: no tenant context`.

- [ ] **Step 4: Regen types + typecheck**

`mcp__supabase__generate_typescript_types` → `src/types/database.types.ts`; `npm run typecheck` → 0 errors.

- [ ] **Step 5: Manifest row + commit**

```
| <version> | phase3_file_vat_return_rpc.sql | Additive | file_vat_return atomic filing RPC — re-derives boxes from vat_records by tax_period, rejects divergence/overlap, writes vat_returns + tax_return_lines | P3 WP-1 |
```
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): file_vat_return subledger-verified filing RPC (P3 M3-3)"
```

**WP-1 verification:** `npm run typecheck` (0), `npm run check:schema-drift` (clean), the three post-probes above. Open PR with `.github/PULL_REQUEST_TEMPLATE/migration.md`.

---

# WP-2 — gcc_return composer, return service & UI (branch: `feat/p3-gcc-return`)

### Task 4: Registry keys — `tax.filing_frequency`, `tax.period_anchor`, `tax.return_composer`

**Files:**
- Modify: `src/lib/country/registry.ts` (append to `COUNTRY_CONFIG_REGISTRY`, which starts at :45; the `ConfigKeyDef` interface is at :26-38)
- Test: `src/lib/country/registry.test.ts` (append)
- DB migration (via `mcp__supabase__apply_migration`): `phase3_statutory_keys_filing_trigger` — regrows `validate_country_config_overrides()`
- Modify: `supabase/migrations.manifest.md` (manifest row for the trigger migration)

**Interfaces:**
- Consumes: `ConfigKeyDef` (registry.ts:26), `zod` (already imported in the file).
- Produces: registry keys `'tax.filing_frequency'` (coded default `'quarterly'`), `'tax.period_anchor'` (coded default `'01-01'`), `'tax.return_composer'` (coded default `'gcc_return'`), all `domain: 'tax'`, `maxOverrideLayer: 'country'` — consumed by Task 6 (`getFilingConfig`). Because they are `maxOverrideLayer:'country'`, all three enter `STATUTORY_KEYS` (`src/lib/country/registry.ts:223`, `.filter(d => d.maxOverrideLayer === 'country')`), which today holds only `tax.zatca_qr.enabled`. The **required** `check:registry-trigger-parity` CI gate (`scripts/country-engine/registry-trigger-parity.test.ts`) diffs `STATUTORY_KEYS` against the `statutory_keys text[]` literal inside the live `validate_country_config_overrides()` trigger and FAILS **deterministically** until that trigger is grown — so Step 5 below is a MANDATORY migration against `validate_country_config_overrides()` (the override-VALIDATOR), **not** `_apply_country_config`. No `_apply_country_config` change is required: these three keys live in `geo_countries.country_config`, which that resolved-config mapper already copies wholesale into `resolved_country_config` via `v_bag := v_bag || COALESCE(v_cc.country_config,'{}'::jsonb)` (verified against the live function body).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/country/registry.test.ts`:
```typescript
describe('P3 filing keys', () => {
  it('registers tax.filing_frequency / tax.period_anchor / tax.return_composer as country-locked', () => {
    const byKey = Object.fromEntries(COUNTRY_CONFIG_REGISTRY.map((d) => [d.key, d]));
    for (const key of ['tax.filing_frequency', 'tax.period_anchor', 'tax.return_composer']) {
      expect(byKey[key], `${key} missing`).toBeDefined();
      expect(byKey[key].maxOverrideLayer).toBe('country');
      expect(byKey[key].domain).toBe('tax');
    }
    expect(byKey['tax.filing_frequency'].codedDefault).toBe('quarterly');
    expect(byKey['tax.period_anchor'].codedDefault).toBe('01-01');
    expect(byKey['tax.return_composer'].codedDefault).toBe('gcc_return');
    expect(byKey['tax.filing_frequency'].schema.safeParse('monthly').success).toBe(true);
    expect(byKey['tax.filing_frequency'].schema.safeParse('weekly').success).toBe(false);
    expect(byKey['tax.period_anchor'].schema.safeParse('04-01').success).toBe(true);
    expect(byKey['tax.period_anchor'].schema.safeParse('4-1').success).toBe(false);
  });
});
```
(If the test file does not already import `COUNTRY_CONFIG_REGISTRY`, add it to the existing import from `'./registry'`.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/country/registry.test.ts -t "P3 filing keys"`
Expected: FAIL — `tax.filing_frequency missing: expected undefined to be defined`.

- [ ] **Step 3: Minimal implementation**

Append inside the `COUNTRY_CONFIG_REGISTRY` array in `src/lib/country/registry.ts` (before the closing `];`):
```typescript
  // ── tax filing shape (P3 — consumed by the ReturnComposer path) ──
  {
    key: 'tax.filing_frequency',
    domain: 'tax',
    label: 'Tax filing frequency',
    description: 'How often the jurisdiction requires tax returns to be filed.',
    schema: z.enum(['monthly', 'quarterly', 'annual']),
    codedDefault: 'quarterly',
    maxOverrideLayer: 'country',
  },
  {
    key: 'tax.period_anchor',
    domain: 'tax',
    label: 'Tax period anchor',
    description: 'MM-DD anchor the filing periods count from (fiscal-year style anchors supported).',
    schema: z.string().regex(/^\d{2}-\d{2}$/),
    codedDefault: '01-01',
    maxOverrideLayer: 'country',
  },
  {
    key: 'tax.return_composer',
    domain: 'tax',
    label: 'Return composer',
    description: "Registered ReturnComposer plugin key that shapes this jurisdiction's statutory return.",
    schema: z.enum(['gcc_return', 'gstr', 'us_jurisdiction_remit', 'uk_mtd_9box']),
    codedDefault: 'gcc_return',
    maxOverrideLayer: 'country',
  },
```
(The `tax.return_composer` description is a **double-quoted** string so the apostrophe in `jurisdiction's` needs no escaping — do NOT write `''` (SQL-style) inside a single-quoted TS string, which the typecheck gate rejects as two adjacent literals. The other two defs stay single-quoted because they contain no apostrophe.)

- [ ] **Step 4: Run the registry tests, verify pass**

Run: `npx vitest run src/lib/country/registry.test.ts` — expected: PASS (all).

- [ ] **Step 5: MANDATORY migration — grow `validate_country_config_overrides()` statutory_keys**

The three new keys grow `STATUTORY_KEYS` from `['tax.zatca_qr.enabled']` to four keys, so the required `check:registry-trigger-parity` gate FAILS deterministically until the live trigger's `statutory_keys` literal matches (parity is asserted against the DB, not `_apply_country_config`). This step is NOT conditional.

Pre-probe (run via `mcp__supabase__execute_sql` — shows the failing 1-key state):
```sql
SELECT (regexp_match(pg_get_functiondef(p.oid), 'statutory_keys[^;]*'))[1] AS current_literal
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'validate_country_config_overrides';
-- Expected BEFORE: statutory_keys text[] := ARRAY['tax.zatca_qr.enabled']
```

Apply via `mcp__supabase__apply_migration` (name `phase3_statutory_keys_filing_trigger`). The ARRAY literal below is exactly `expectedTriggerArraySql(STATUTORY_KEYS)` — the sorted four-key set (keep the rest of the body byte-identical to the live function so this is a pure `statutory_keys`-only change):
```sql
CREATE OR REPLACE FUNCTION public.validate_country_config_overrides()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  statutory_keys text[] := ARRAY['tax.filing_frequency','tax.period_anchor','tax.return_composer','tax.zatca_qr.enabled'];
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
Do NOT touch `scripts/country-engine/registry-trigger-parity.test.ts`: its `REAL_FUNC_DEF` constant is a captured **parser fixture** whose offline assertions (`parseTriggerStatutoryKeys(REAL_FUNC_DEF) === ['tax.zatca_qr.enabled']`) are independent of `STATUTORY_KEYS` and must stay green; only the live-DB parity assertion moves, and it moves because the DB moved.

Post-probe (parity restored):
```sql
SELECT (regexp_match(pg_get_functiondef(p.oid), 'statutory_keys[^;]*'))[1] AS current_literal
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'validate_country_config_overrides';
-- Expected AFTER: statutory_keys text[] := ARRAY['tax.filing_frequency','tax.period_anchor','tax.return_composer','tax.zatca_qr.enabled']
```
This migration changes no table shape, so `database.types.ts` is unaffected; still run `mcp__supabase__generate_typescript_types` → save to `src/types/database.types.ts` and confirm a clean `git diff` on it (Global Constraints).

- [ ] **Step 6: Manifest row + re-run the parity gate**

Append to `supabase/migrations.manifest.md`:
```
| <version> | phase3_statutory_keys_filing_trigger.sql | Additive (function) | validate_country_config_overrides().statutory_keys → tax.filing_frequency/period_anchor/return_composer/zatca_qr.enabled (registry↔trigger parity) | P3 WP-2 |
```
Run: `SUPABASE_DB_URL=<canonical> npm run check:registry-trigger-parity` — expected: PASS (live parity assertion green; offline parser tests untouched).

- [ ] **Step 7: Commit**

```bash
git add src/lib/country/registry.ts src/lib/country/registry.test.ts supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(country): tax.filing_frequency/period_anchor/return_composer keys + trigger parity (P3)"
```

### Task 5: `gcc_return` ReturnComposer plugin

**Files:**
- Create: `src/lib/regimes/gcc_return/index.ts`
- Create: `src/lib/regimes/gcc_return/fixtures/om_q3_2026.json`
- Test: `src/lib/regimes/gcc_return/gccReturn.test.ts`
- Modify: the Phase-1 plugin bootstrap file that registers default plugins (locate with `grep -rn "registerRegimePlugin" src/lib/regimes --include="*.ts" | grep -v test` — Phase 1 registers `simple_vat` etc. there); add the `gcc_return` registration beside them.

**Interfaces:**
- Consumes: `ReturnComposer`, `ComposedReturn`, `ReturnBoxLine`, `VatRecordRow` from `src/lib/regimes/types.ts` (Phase 1, contract §1.4); `CountryConfigError` from `src/lib/country/resolveCountryConfig.ts` (verify constructor with `grep -n "class CountryConfigError" src/lib/country/resolveCountryConfig.ts` — it extends Error with a message argument); `roundMoney` from `src/lib/financialMath.ts:13`; `registerRegimePlugin` from `src/lib/regimes/registry.ts` (Phase 1).
- Produces: `gccReturnComposer: ReturnComposer` (key `'gcc_return'`, version `'1.0.0'`); box codes `'BOX_1_OUTPUT' | 'BOX_2_INPUT' | 'BOX_3_NET'` — consumed by Tasks 6, 8, 9 and by `publish_country_pack` capability checks (capability key `gcc_return`).

- [ ] **Step 1: Write the failing test**

`src/lib/regimes/gcc_return/gccReturn.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { CountryConfigError } from '../../country/resolveCountryConfig';
import type { VatRecordRow } from '../types';
import { gccReturnComposer } from './index';

const row = (record_type: 'sale' | 'purchase', vat_amount_base: number, tax_period: string): VatRecordRow =>
  ({ record_type, vat_amount_base, tax_period } as unknown as VatRecordRow);

describe('gccReturnComposer.periodBounds', () => {
  it('calendar quarterly (anchor 01-01): Jul 2 falls in Q3', () => {
    expect(gccReturnComposer.periodBounds('quarterly', '01-01', '2026-07-02', 'Asia/Muscat')).toEqual({
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      taxPeriods: ['2026-07', '2026-08', '2026-09'],
    });
  });
  it('quarter boundary day stays in its own quarter (the toISOString bug class)', () => {
    expect(gccReturnComposer.periodBounds('quarterly', '01-01', '2026-07-01', 'Asia/Muscat').periodStart).toBe('2026-07-01');
    expect(gccReturnComposer.periodBounds('quarterly', '01-01', '2026-06-30', 'Asia/Muscat').periodEnd).toBe('2026-06-30');
  });
  it('fiscal anchor 04-01 quarterly: Jan 15 is fiscal Q4 of the prior anchor year', () => {
    expect(gccReturnComposer.periodBounds('quarterly', '04-01', '2026-01-15', 'Asia/Muscat')).toEqual({
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      taxPeriods: ['2026-01', '2026-02', '2026-03'],
    });
  });
  it('monthly and annual frequencies', () => {
    expect(gccReturnComposer.periodBounds('monthly', '01-01', '2026-02-10', 'Asia/Muscat')).toEqual({
      periodStart: '2026-02-01', periodEnd: '2026-02-28', taxPeriods: ['2026-02'],
    });
    expect(gccReturnComposer.periodBounds('annual', '04-01', '2026-05-01', 'Asia/Muscat').taxPeriods).toHaveLength(12);
  });
  it('rejects non-month-aligned anchors (UK stagger belongs to uk_mtd_9box)', () => {
    expect(() => gccReturnComposer.periodBounds('quarterly', '04-06', '2026-05-01', 'Europe/London'))
      .toThrow(CountryConfigError);
  });
});

describe('gccReturnComposer.compose', () => {
  const input = {
    tenantId: 't1', legalEntityId: 'le1', taxPeriods: ['2026-07', '2026-08', '2026-09'],
    ledgerRows: [row('sale', 50.005, '2026-07'), row('sale', 12.5, '2026-08'), row('purchase', 10, '2026-09')],
    jurisdictionCurrency: 'OMR', baseCurrency: 'OMR',
  };
  it('sums vat_amount_base into the 3 GCC boxes', () => {
    const composed = gccReturnComposer.compose(input);
    expect(composed.boxes).toEqual([
      { boxCode: 'BOX_1_OUTPUT', boxLabel: 'Output VAT on sales', amountBase: 62.505, sequence: 1 },
      { boxCode: 'BOX_2_INPUT', boxLabel: 'Recoverable input VAT on purchases', amountBase: 10, sequence: 2 },
      { boxCode: 'BOX_3_NET', boxLabel: 'Net VAT payable / (refundable)', amountBase: 52.505, sequence: 3 },
    ]);
    expect(composed.meta.recordCount).toBe(3);
  });
  it('throws ConfigError when base currency differs from the jurisdiction filing currency (graft 7)', () => {
    expect(() => gccReturnComposer.compose({ ...input, baseCurrency: 'USD' })).toThrow(CountryConfigError);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/gcc_return/gccReturn.test.ts`
Expected: FAIL — `Cannot find module './index'` (or equivalent unresolved-import error).

- [ ] **Step 3: Minimal implementation**

`src/lib/regimes/gcc_return/index.ts`:
```typescript
// GCC 3-box return composer (OM/AE/SA/BH/KW/QA shape). Pure: no I/O, no Date
// timezone round-trips — all period math is YYYY-MM-DD string arithmetic on the
// tenant-local forDate (tenantToday output), which is what makes the east-of-UTC
// double-declaration class of bug (VATReturnModal.tsx:52) structurally impossible.
import { CountryConfigError } from '../../country/resolveCountryConfig';
import { roundMoney } from '../../financialMath';
import type { ReturnBoxLine, ReturnComposer } from '../types';

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function taxPeriodsBetween(startYm: string, endYm: string): string[] {
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad2(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function lastDayOfMonth(y: number, m: number): number {
  // Date.UTC(y, m, 0) is the last day of month m (1-based) — no timezone involved.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const gccReturnComposer: ReturnComposer = {
  key: 'gcc_return',
  version: '1.0.0',

  periodBounds(filingFrequency, periodAnchor, forDate, timezone) {
    void timezone; // forDate is already tenant-local (tenantToday); no further shifting.
    if (periodAnchor.slice(3, 5) !== '01') {
      throw new CountryConfigError(
        `gcc_return requires a month-aligned period anchor (MM-01); got ${periodAnchor}`,
      );
    }
    const anchorMonth = Number(periodAnchor.slice(0, 2));
    const fy = Number(forDate.slice(0, 4));
    const fm = Number(forDate.slice(5, 7));
    const monthsPerPeriod = filingFrequency === 'monthly' ? 1 : filingFrequency === 'quarterly' ? 3 : 12;

    const anchorYear = fm < anchorMonth ? fy - 1 : fy;
    const elapsed = (fy - anchorYear) * 12 + (fm - anchorMonth);
    const startOffset = Math.floor(elapsed / monthsPerPeriod) * monthsPerPeriod;

    let sm = anchorMonth + startOffset;
    let sy = anchorYear + Math.floor((sm - 1) / 12);
    sm = ((sm - 1) % 12) + 1;

    let em = sm + monthsPerPeriod - 1;
    let ey = sy + Math.floor((em - 1) / 12);
    em = ((em - 1) % 12) + 1;

    return {
      periodStart: `${sy}-${pad2(sm)}-01`,
      periodEnd: `${ey}-${pad2(em)}-${pad2(lastDayOfMonth(ey, em))}`,
      taxPeriods: taxPeriodsBetween(`${sy}-${pad2(sm)}`, `${ey}-${pad2(em)}`),
    };
  },

  compose(input) {
    if (input.baseCurrency !== input.jurisdictionCurrency) {
      throw new CountryConfigError(
        `gcc_return: tenant base currency ${input.baseCurrency} does not match the jurisdiction filing currency ${input.jurisdictionCurrency} — a return cannot be filed from a mismatched base ledger`,
      );
    }
    let output = 0;
    let inputVat = 0;
    for (const r of input.ledgerRows) {
      const base = Number(r.vat_amount_base ?? 0);
      if (r.record_type === 'sale') output += base;
      else if (r.record_type === 'purchase') inputVat += base;
    }
    output = roundMoney(output, 4);
    inputVat = roundMoney(inputVat, 4);
    const boxes: ReturnBoxLine[] = [
      { boxCode: 'BOX_1_OUTPUT', boxLabel: 'Output VAT on sales', amountBase: output, sequence: 1 },
      { boxCode: 'BOX_2_INPUT', boxLabel: 'Recoverable input VAT on purchases', amountBase: inputVat, sequence: 2 },
      { boxCode: 'BOX_3_NET', boxLabel: 'Net VAT payable / (refundable)', amountBase: roundMoney(output - inputVat, 4), sequence: 3 },
    ];
    return {
      boxes,
      meta: { composer: 'gcc_return', recordCount: input.ledgerRows.length, taxPeriods: input.taxPeriods },
    };
  },
};
```

`src/lib/regimes/gcc_return/fixtures/om_q3_2026.json`:
```json
{
  "name": "om_gcc_3box_q3_2026",
  "input_document": {
    "kind": "return_composition",
    "composer": "gcc_return",
    "filingFrequency": "quarterly",
    "periodAnchor": "01-01",
    "forDate": "2026-07-02",
    "jurisdictionCurrency": "OMR",
    "baseCurrency": "OMR",
    "ledgerRows": [
      { "record_type": "sale", "vat_amount_base": 52.5, "tax_period": "2026-07" },
      { "record_type": "sale", "vat_amount_base": 10.0, "tax_period": "2026-09" },
      { "record_type": "purchase", "vat_amount_base": 12.25, "tax_period": "2026-08" }
    ]
  },
  "expected": {
    "periodStart": "2026-07-01",
    "periodEnd": "2026-09-30",
    "boxes": [
      { "boxCode": "BOX_1_OUTPUT", "amountBase": 62.5 },
      { "boxCode": "BOX_2_INPUT", "amountBase": 12.25 },
      { "boxCode": "BOX_3_NET", "amountBase": 50.25 }
    ]
  }
}
```

Registration — in the Phase-1 plugin bootstrap file located in the Files note, add:
```typescript
import { gccReturnComposer } from './gcc_return';
registerRegimePlugin('return', gccReturnComposer);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/gcc_return/gccReturn.test.ts` — expected: PASS (7 tests).
Run: `npm run typecheck` — expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/gcc_return
git add -u src/lib/regimes
git commit -m "feat(regimes): gcc_return ReturnComposer — 3-box, month-aligned anchors, base==jurisdiction guard (P3)"
```

### Task 6: `taxReturnService` — config → composer → subledger → filing orchestration

**Files:**
- Create: `src/lib/tax/taxReturnService.ts`
- Test: `src/lib/tax/taxReturnService.test.ts`

**Interfaces:**
- Consumes: `resolveReturnComposer(key)` (Phase 1 registry), `gccReturnComposer` + `taxPeriodsBetween` (Task 5), `tenantToday(timezone)` (`src/lib/tenantToday.ts`, Phase 0), `file_vat_return` RPC (Task 3), `supabase` client, `Database` types.
- Produces: `FilingConfig`, `ComposedReturnPreview`, `getFilingConfig(tenantId)`, `composeReturnForDate(tenantId, forDate?)`, `fileReturn(preview, status)`, `getReturnLines(vatReturnId)`, `getReturnLedgerRows(vatReturn)`, re-export `taxPeriodsBetween` — consumed by Tasks 7–9 and by Phase 4/5 composer UIs.

- [ ] **Step 1: Write the failing test**

`src/lib/tax/taxReturnService.test.ts` (node project — pure logic; the supabase-dependent functions are covered by the WP-2 integration probe in Task 9, so here we pin the pure seams):
```typescript
import { describe, expect, it } from 'vitest';
import { taxPeriodsBetween, boxAmount } from './taxReturnService';
import type { ComposedReturn } from '../regimes/types';

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
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/tax/taxReturnService.test.ts`
Expected: FAIL — `Cannot find module './taxReturnService'`.

- [ ] **Step 3: Minimal implementation**

`src/lib/tax/taxReturnService.ts`:
```typescript
// Orchestrates: resolved country config → ReturnComposer → vat_records subledger
// → file_vat_return RPC. The ONLY period dimension anywhere in this file is
// vat_records.tax_period — never created_at (the vatService.ts:279 drift class).
import { supabase } from '../supabaseClient';
import { resolveReturnComposer } from '../regimes/registry';
import { taxPeriodsBetween } from '../regimes/gcc_return';
import { tenantToday } from '../tenantToday';
import type { ComposedReturn } from '../regimes/types';
import type { Database } from '../../types/database.types';

export type VatReturnRow = Database['public']['Tables']['vat_returns']['Row'];
export type TaxReturnLineRow = Database['public']['Tables']['tax_return_lines']['Row'];
export type VatRecordRow = Database['public']['Tables']['vat_records']['Row'];

export { taxPeriodsBetween };

export interface FilingConfig {
  composerKey: string;
  filingFrequency: 'monthly' | 'quarterly' | 'annual';
  periodAnchor: string;
  timezone: string;
  baseCurrency: string;
  jurisdictionCurrency: string;
  legalEntityId: string;
}

export interface ComposedReturnPreview {
  periodStart: string;
  periodEnd: string;
  taxPeriods: string[];
  composed: ComposedReturn;
  outputVat: number;
  inputVat: number;
  netVat: number;
  regimeKey: string;
  filingFrequency: string;
  periodAnchor: string;
}

export function boxAmount(composed: ComposedReturn, boxCode: string): number {
  return composed.boxes.find((b) => b.boxCode === boxCode)?.amountBase ?? 0;
}

export async function getFilingConfig(tenantId: string): Promise<FilingConfig> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, timezone, base_currency_code, resolved_country_config')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`getFilingConfig: tenant ${tenantId} not found`);

  const { data: entity, error: entityError } = await supabase
    .from('legal_entities')
    .select('id, currency_code')
    .eq('tenant_id', tenantId)
    .eq('is_primary', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (entityError) throw entityError;
  if (!entity) throw new Error('getFilingConfig: no primary legal entity for tenant — cannot resolve the filing jurisdiction');

  const cfg = (data.resolved_country_config ?? {}) as Record<string, unknown>;
  return {
    composerKey: (cfg['tax.return_composer'] as string) ?? 'gcc_return',
    filingFrequency: ((cfg['tax.filing_frequency'] as FilingConfig['filingFrequency']) ?? 'quarterly'),
    periodAnchor: (cfg['tax.period_anchor'] as string) ?? '01-01',
    timezone: data.timezone,
    baseCurrency: data.base_currency_code,
    jurisdictionCurrency: entity.currency_code,
    legalEntityId: entity.id,
  };
}

export async function composeReturnForDate(tenantId: string, forDate?: string): Promise<ComposedReturnPreview> {
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

  const composed = composer.compose({
    tenantId,
    legalEntityId: cfg.legalEntityId,
    taxPeriods: bounds.taxPeriods,
    ledgerRows: (rows ?? []) as VatRecordRow[],
    jurisdictionCurrency: cfg.jurisdictionCurrency,
    baseCurrency: cfg.baseCurrency,
  });

  return {
    ...bounds,
    composed,
    outputVat: boxAmount(composed, 'BOX_1_OUTPUT'),
    inputVat: boxAmount(composed, 'BOX_2_INPUT'),
    netVat: boxAmount(composed, 'BOX_3_NET'),
    regimeKey: cfg.composerKey,
    filingFrequency: cfg.filingFrequency,
    periodAnchor: cfg.periodAnchor,
  };
}

export async function fileReturn(preview: ComposedReturnPreview, status: 'draft' | 'review'): Promise<VatReturnRow> {
  const { data, error } = await supabase.rpc('file_vat_return', {
    p_return: {
      period_start: preview.periodStart,
      period_end: preview.periodEnd,
      output_vat: preview.outputVat,
      input_vat: preview.inputVat,
      net_vat: preview.netVat,
      status,
      regime_key: preview.regimeKey,
      filing_frequency: preview.filingFrequency,
      period_anchor: preview.periodAnchor,
    },
    p_lines: preview.composed.boxes,
    p_tax_periods: preview.taxPeriods,
  });
  if (error) throw error;
  return data as VatReturnRow;
}

export async function getReturnLines(vatReturnId: string): Promise<TaxReturnLineRow[]> {
  const { data, error } = await supabase
    .from('tax_return_lines')
    .select('*')
    .eq('vat_return_id', vatReturnId)
    .is('deleted_at', null)
    .order('sequence', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Drill-down MUST query the same dimension the return was composed on:
 *  tax_period months derived from the persisted period bounds. */
export async function getReturnLedgerRows(
  vatReturn: Pick<VatReturnRow, 'period_start' | 'period_end'>,
): Promise<VatRecordRow[]> {
  const periods = taxPeriodsBetween(vatReturn.period_start.slice(0, 7), vatReturn.period_end.slice(0, 7));
  const { data, error } = await supabase
    .from('vat_records')
    .select('*')
    .in('tax_period', periods)
    .is('deleted_at', null)
    .order('tax_period', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/tax/taxReturnService.test.ts` — expected: PASS.
Run: `npm run typecheck` — expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/taxReturnService.ts src/lib/tax/taxReturnService.test.ts
git commit -m "feat(tax): taxReturnService — composer orchestration + tax_period drill-down (P3)"
```

### Task 7: `vatService` drill-down + quarterly summary onto the composer dimension

**Files:**
- Modify: `src/lib/vatService.ts:271-303` (`getVATRecordsByReturn` at :271-285 filters `created_at`; `getQuarterlyVATSummary` at :287-303 hardcodes calendar quarters — both verified on main)
- Test: `src/lib/vatService.test.ts` (append)

**Interfaces:**
- Consumes: `taxPeriodsBetween` (Task 6 re-export), existing `calculateVATForPeriod` (vatService.ts:100), `gccReturnComposer.periodBounds` (Task 5).
- Produces: `getVATRecordsByReturn(periodStart, periodEnd)` (same signature, now `tax_period`-based); `getQuarterlyVATSummary(year, periodAnchor?)` — consumed by VATAuditPage.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/vatService.test.ts` (follow the file's existing supabase mock pattern — it already mocks `../lib/supabaseClient`; extend the mock's query-builder recorder to capture `.in()` calls):
```typescript
describe('getVATRecordsByReturn (P3 — tax_period dimension)', () => {
  it('filters by tax_period months, never created_at', async () => {
    const captured: { column?: string; values?: unknown } = {};
    mockFrom('vat_records', {
      in(column: string, values: unknown[]) { captured.column = column; captured.values = values; return this; },
      data: [], error: null,
    });
    await getVATRecordsByReturn('2026-07-01', '2026-09-30');
    expect(captured.column).toBe('tax_period');
    expect(captured.values).toEqual(['2026-07', '2026-08', '2026-09']);
  });
});
```
(`mockFrom` names the file's existing mock helper — reuse whatever the existing tests in `vatService.test.ts` use to stub the supabase chain; the assertion contract is: the query builder receives `.in('tax_period', ['2026-07','2026-08','2026-09'])` and NO `.gte('created_at', …)`.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/vatService.test.ts -t "tax_period dimension"`
Expected: FAIL — captured column is `undefined` (current code calls `.gte('created_at', …)`).

- [ ] **Step 3: Minimal implementation**

Replace `getVATRecordsByReturn` (currently vatService.ts:271-285) with:
```typescript
export const getVATRecordsByReturn = async (
  periodStart: string,
  periodEnd: string
) => {
  // Same period dimension the return totals were composed on (tax_period-first,
  // matching calculateVATForPeriod's bucketing) — never created_at, which
  // diverges for late-approved expenses (audit finding vatService.ts:279).
  const taxPeriods = taxPeriodsBetween(periodStart.slice(0, 7), periodEnd.slice(0, 7));
  const { data, error } = await supabase
    .from('vat_records')
    .select('*')
    .in('tax_period', taxPeriods)
    .is('deleted_at', null)
    .order('tax_period', { ascending: true });

  if (error) throw error;
  return data || [];
};
```
Replace `getQuarterlyVATSummary` (currently vatService.ts:287-303) with:
```typescript
export const getQuarterlyVATSummary = async (year: number, periodAnchor: string = '01-01') => {
  // Quarter windows derived from the pack's period anchor via the composer —
  // no hardcoded Jan/Apr/Jul/Oct calendar quarters (audit finding vatService.ts:288).
  const anchorMonth = periodAnchor.slice(0, 2);
  const summaries = [] as Array<{ quarter: number } & VATSummary>;
  for (let q = 1; q <= 4; q++) {
    const probeMonthNum = ((Number(anchorMonth) - 1 + (q - 1) * 3) % 12) + 1;
    const probeYear = year + Math.floor((Number(anchorMonth) - 1 + (q - 1) * 3) / 12);
    const probe = `${probeYear}-${String(probeMonthNum).padStart(2, '0')}-15`;
    const bounds = gccReturnComposer.periodBounds('quarterly', periodAnchor, probe, 'UTC');
    const summary = await calculateVATForPeriod(bounds.periodStart, bounds.periodEnd);
    summaries.push({ quarter: q, ...summary });
  }
  return summaries;
};
```
Add the imports at the top of `src/lib/vatService.ts`:
```typescript
import { gccReturnComposer, taxPeriodsBetween } from './regimes/gcc_return';
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/vatService.test.ts` — expected: PASS (all, including pre-existing suites).
Run: `npm run typecheck` — expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vatService.ts src/lib/vatService.test.ts
git commit -m "fix(vat): drill-down + quarterly summary on the tax_period/composer dimension (P3)"
```

### Task 8: VATReturnModal rewrite — composer periods, no UTC round-trips

**Files:**
- Modify: `src/components/financial/VATReturnModal.tsx` (full rewrite; current UTC quarter seeds at :46-54, `setQuarterPeriod` at :102-108, `onSave` shape at :21-30 — verified)
- Modify: `src/pages/financial/VATAuditPage.tsx` (modal call-site at :575-579+, `createVATReturnMutation` at :125-137, `VATReturnModal` import at :12, `createVATReturn` import in the :16-19 import block — verified)
- Test: `src/components/financial/VATReturnModal.test.tsx`

**Interfaces:**
- Consumes: `composeReturnForDate`, `fileReturn`, `ComposedReturnPreview` (Task 6); `useAuth` (`src/contexts/AuthContext.tsx:332` — provides `profile.tenant_id`); `useCurrency` (existing); `Modal`, `Button` (existing UI primitives); `tenantToday` via the service.
- Produces: `VATReturnModal` with props `{ isOpen: boolean; onClose: () => void; onFiled: () => void }` — consumed by VATAuditPage.

- [ ] **Step 1: Write the failing test**

`src/components/financial/VATReturnModal.test.tsx`:
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VATReturnModal } from './VATReturnModal';

const preview = {
  periodStart: '2026-07-01', periodEnd: '2026-09-30',
  taxPeriods: ['2026-07', '2026-08', '2026-09'],
  composed: { boxes: [
    { boxCode: 'BOX_1_OUTPUT', boxLabel: 'Output VAT on sales', amountBase: 62.5, sequence: 1 },
    { boxCode: 'BOX_2_INPUT', boxLabel: 'Recoverable input VAT on purchases', amountBase: 12.25, sequence: 2 },
    { boxCode: 'BOX_3_NET', boxLabel: 'Net VAT payable / (refundable)', amountBase: 50.25, sequence: 3 },
  ], meta: {} },
  outputVat: 62.5, inputVat: 12.25, netVat: 50.25,
  regimeKey: 'gcc_return', filingFrequency: 'quarterly', periodAnchor: '01-01',
};

const composeReturnForDate = vi.fn().mockResolvedValue(preview);
const fileReturn = vi.fn().mockResolvedValue({ id: 'r1' });
vi.mock('../../lib/tax/taxReturnService', () => ({
  composeReturnForDate: (...a: unknown[]) => composeReturnForDate(...a),
  fileReturn: (...a: unknown[]) => fileReturn(...a),
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { tenant_id: 'tenant-1' } }),
}));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => `OMR ${n.toFixed(3)}` }),
}));

describe('VATReturnModal (P3)', () => {
  beforeEach(() => { composeReturnForDate.mockClear(); fileReturn.mockClear(); });

  it('composes the current period on open and renders the three boxes', async () => {
    render(<VATReturnModal isOpen onClose={() => {}} onFiled={() => {}} />);
    await waitFor(() => expect(composeReturnForDate).toHaveBeenCalledWith('tenant-1', undefined));
    expect(await screen.findByText('Output VAT on sales')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01')).toBeInTheDocument();
    expect(screen.getByText('2026-09-30')).toBeInTheDocument();
  });

  it('files via fileReturn with the composed preview', async () => {
    const onFiled = vi.fn();
    render(<VATReturnModal isOpen onClose={() => {}} onFiled={onFiled} />);
    await screen.findByText('Output VAT on sales');
    await userEvent.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => expect(fileReturn).toHaveBeenCalledWith(preview, 'draft'));
    expect(onFiled).toHaveBeenCalled();
  });

  it('navigates to the previous period by re-composing at periodStart - 1 day', async () => {
    render(<VATReturnModal isOpen onClose={() => {}} onFiled={() => {}} />);
    await screen.findByText('Output VAT on sales');
    await userEvent.click(screen.getByRole('button', { name: /previous period/i }));
    await waitFor(() => expect(composeReturnForDate).toHaveBeenLastCalledWith('tenant-1', '2026-06-30'));
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/financial/VATReturnModal.test.tsx`
Expected: FAIL — the current component has no `onFiled` prop and never calls `composeReturnForDate` (TypeScript prop error and/or `toHaveBeenCalled` failures).

- [ ] **Step 3: Full rewrite**

Replace the entire body of `src/components/financial/VATReturnModal.tsx` with:
```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { composeReturnForDate, fileReturn, type ComposedReturnPreview } from '../../lib/tax/taxReturnService';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../hooks/useCurrency';
import { Calendar, ChevronLeft, ChevronRight, Save, Send } from 'lucide-react';
import { logger } from '../../lib/logger';

interface VATReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFiled: () => void;
}

/** Steps a tenant-local YYYY-MM-DD back one calendar day with pure string/int
 *  math — no Date -> toISOString UTC round-trip (the double-declared-month bug). */
function previousDay(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  if (d > 1) return `${isoDate.slice(0, 8)}${String(d - 1).padStart(2, '0')}`;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return `${py}-${String(pm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Steps forward past the current period end to land in the next period. */
function nextDay(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < lastDay) return `${isoDate.slice(0, 8)}${String(d + 1).padStart(2, '0')}`;
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

export const VATReturnModal: React.FC<VATReturnModalProps> = ({ isOpen, onClose, onFiled }) => {
  const { profile } = useAuth();
  const { formatCurrency } = useCurrency();
  const [preview, setPreview] = useState<ComposedReturnPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compose = useCallback(async (forDate?: string) => {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);
    try {
      setPreview(await composeReturnForDate(profile.tenant_id, forDate));
    } catch (e) {
      logger.error('Error composing return:', e);
      setError(e instanceof Error ? e.message : 'Failed to compose the return');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [profile?.tenant_id]);

  useEffect(() => {
    if (isOpen) void compose(undefined);
    else setPreview(null);
  }, [isOpen, compose]);

  const handleFile = async (status: 'draft' | 'review') => {
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    try {
      await fileReturn(preview, status);
      onFiled();
      onClose();
    } catch (e) {
      logger.error('Error filing VAT return:', e);
      setError(e instanceof Error ? e.message : 'Failed to file the return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="File Tax Return" size="lg">
      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-muted px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Previous period"
            disabled={loading || !preview}
            onClick={() => preview && void compose(previousDay(preview.periodStart))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4 text-primary" />
            {preview ? (
              <span>
                <span>{preview.periodStart}</span>
                <span className="mx-1 text-slate-500">→</span>
                <span>{preview.periodEnd}</span>
                <span className="ml-2 text-xs uppercase text-slate-500">{preview.filingFrequency}</span>
              </span>
            ) : (
              <span className="text-slate-500">{loading ? 'Composing…' : 'No period'}</span>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next period"
            disabled={loading || !preview}
            onClick={() => preview && void compose(nextDay(preview.periodEnd))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-danger bg-danger-muted px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {preview && (
          <div className="divide-y divide-border rounded-lg border border-border">
            {preview.composed.boxes.map((box) => (
              <div key={box.boxCode} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{box.boxLabel}</div>
                  <div className="text-xs text-slate-500">{box.boxCode}</div>
                </div>
                <div className="text-sm font-semibold tabular-nums">{formatCurrency(box.amountBase)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="secondary" onClick={() => void handleFile('draft')} disabled={!preview || submitting}>
            <Save className="mr-2 h-4 w-4" /> Save as Draft
          </Button>
          <Button onClick={() => void handleFile('review')} disabled={!preview || submitting}>
            <Send className="mr-2 h-4 w-4" /> Submit for Review
          </Button>
        </div>
      </div>
    </Modal>
  );
};
```
Then rewire `src/pages/financial/VATAuditPage.tsx`:
1. In the JSX at :575-579+, replace the `<VATReturnModal … onSave={…} />` usage with:
```tsx
      <VATReturnModal
        isOpen={showVATReturnModal}
        onClose={() => setShowVATReturnModal(false)}
        onFiled={() => {
          queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
          queryClient.invalidateQueries({ queryKey: ['vat-records'] });
        }}
      />
```
(match the page's actual query keys — grep `useQuery` keys in the file and invalidate the ones feeding the returns list and records table).
2. Delete the now-unused `createVATReturnMutation` block (:125-137) and remove `createVATReturn` from the vatService import block (:16-19) if nothing else uses it.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/financial/VATReturnModal.test.tsx` — expected: PASS (3 tests).
Run: `npm run typecheck` — expected: 0 errors (this catches any missed `onSave` reference).

- [ ] **Step 5: Commit**

```bash
git add src/components/financial/VATReturnModal.tsx src/components/financial/VATReturnModal.test.tsx src/pages/financial/VATAuditPage.tsx
git commit -m "feat(vat): VATReturnModal files through the composer + file_vat_return; kills UTC quarter math (P3)"
```

### Task 9: Return drill-down modal + Oman reconciliation proof

**Files:**
- Create: `src/components/financial/VATReturnDetailModal.tsx`
- Modify: `src/pages/financial/VATAuditPage.tsx` (returns table row action)
- Test: `src/components/financial/VATReturnDetailModal.test.tsx`
- Verification: live SQL reconciliation probe (Step 5)

**Interfaces:**
- Consumes: `getReturnLines`, `getReturnLedgerRows`, `VatReturnRow`, `TaxReturnLineRow`, `VatRecordRow` (Task 6); `useCurrency`; `Modal` UI primitive.
- Produces: `VATReturnDetailModal` with props `{ vatReturn: VatReturnRow | null; onClose: () => void }`.

- [ ] **Step 1: Write the failing test**

`src/components/financial/VATReturnDetailModal.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VATReturnDetailModal } from './VATReturnDetailModal';

vi.mock('../../lib/tax/taxReturnService', () => ({
  getReturnLines: vi.fn().mockResolvedValue([
    { id: 'l1', box_code: 'BOX_1_OUTPUT', box_label: 'Output VAT on sales', amount_base: 62.5, sequence: 1 },
    { id: 'l2', box_code: 'BOX_2_INPUT', box_label: 'Recoverable input VAT on purchases', amount_base: 12.25, sequence: 2 },
    { id: 'l3', box_code: 'BOX_3_NET', box_label: 'Net VAT payable / (refundable)', amount_base: 50.25, sequence: 3 },
  ]),
  getReturnLedgerRows: vi.fn().mockResolvedValue([
    { id: 'v1', record_type: 'sale', vat_amount_base: 62.5, tax_period: '2026-07', record_id: 'inv-1' },
    { id: 'v2', record_type: 'purchase', vat_amount_base: 12.25, tax_period: '2026-08', record_id: 'exp-1' },
  ]),
}));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => `OMR ${n.toFixed(3)}` }),
}));

const vatReturn = {
  id: 'r1', period_start: '2026-07-01', period_end: '2026-09-30',
  output_vat: 62.5, input_vat: 12.25, net_vat: 50.25, status: 'draft',
} as never;

describe('VATReturnDetailModal (P3)', () => {
  it('renders boxes, ledger rows, and a green reconciliation badge when sums match', async () => {
    render(<VATReturnDetailModal vatReturn={vatReturn} onClose={() => {}} />);
    expect(await screen.findByText('Output VAT on sales')).toBeInTheDocument();
    expect(await screen.findByText(/reconciled/i)).toBeInTheDocument();
    expect(screen.getByText('2026-07')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/financial/VATReturnDetailModal.test.tsx`
Expected: FAIL — `Cannot find module './VATReturnDetailModal'`.

- [ ] **Step 3: Minimal implementation**

`src/components/financial/VATReturnDetailModal.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useCurrency } from '../../hooks/useCurrency';
import {
  getReturnLines,
  getReturnLedgerRows,
  type VatReturnRow,
  type TaxReturnLineRow,
  type VatRecordRow,
} from '../../lib/tax/taxReturnService';
import { logger } from '../../lib/logger';

interface VATReturnDetailModalProps {
  vatReturn: VatReturnRow | null;
  onClose: () => void;
}

export const VATReturnDetailModal: React.FC<VATReturnDetailModalProps> = ({ vatReturn, onClose }) => {
  const { formatCurrency } = useCurrency();
  const [lines, setLines] = useState<TaxReturnLineRow[]>([]);
  const [ledger, setLedger] = useState<VatRecordRow[]>([]);

  useEffect(() => {
    if (!vatReturn) return;
    Promise.all([getReturnLines(vatReturn.id), getReturnLedgerRows(vatReturn)])
      .then(([l, r]) => { setLines(l); setLedger(r); })
      .catch((e) => logger.error('Error loading return detail:', e));
  }, [vatReturn]);

  if (!vatReturn) return null;

  const ledgerOutput = ledger
    .filter((r) => r.record_type === 'sale')
    .reduce((s, r) => s + Number(r.vat_amount_base ?? 0), 0);
  const ledgerInput = ledger
    .filter((r) => r.record_type === 'purchase')
    .reduce((s, r) => s + Number(r.vat_amount_base ?? 0), 0);
  const reconciled =
    Math.abs(ledgerOutput - Number(vatReturn.output_vat)) <= 0.0001 &&
    Math.abs(ledgerInput - Number(vatReturn.input_vat)) <= 0.0001;

  return (
    <Modal isOpen onClose={onClose} title={`Return ${vatReturn.period_start} → ${vatReturn.period_end}`} size="xl">
      <div className="space-y-6">
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
            reconciled ? 'border-success bg-success-muted text-success' : 'border-danger bg-danger-muted text-danger'
          }`}
        >
          {reconciled ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {reconciled
            ? 'Reconciled — the filed boxes equal the tax_period subledger exactly'
            : 'NOT reconciled — subledger has changed since filing; investigate before submission'}
        </div>

        <div className="divide-y divide-border rounded-lg border border-border">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between px-4 py-2">
              <span className="text-sm">{l.box_label}</span>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(l.amount_base))}</span>
            </div>
          ))}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Supporting subledger rows (tax_period dimension)</h3>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left">
                <tr>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2 text-right">VAT (base)</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.tax_period}</td>
                    <td className="px-3 py-1.5 capitalize">{r.record_type}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.record_id}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatCurrency(Number(r.vat_amount_base ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
};
```
In `src/pages/financial/VATAuditPage.tsx`, add state `const [detailReturn, setDetailReturn] = useState<VatReturnRow | null>(null);`, a "View" button in the returns table row rendering that calls `setDetailReturn(returnRow)`, and render `<VATReturnDetailModal vatReturn={detailReturn} onClose={() => setDetailReturn(null)} />` beside the existing modals (import both from their modules).

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/financial/VATReturnDetailModal.test.tsx` — expected: PASS.
Run: `npm run typecheck && npm run lint` — expected: 0 errors / no new lint findings.

- [ ] **Step 5: Live Oman reconciliation probe (WP-2 exit evidence)**

With the dev app signed into the Oman demo tenant: open VAT Compliance → File Tax Return → navigate to a period with data → Save as Draft. Then run via `mcp__supabase__execute_sql`:
```sql
WITH r AS (SELECT * FROM vat_returns WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
periods AS (
  SELECT array_agg(to_char(d, 'YYYY-MM')) AS p
  FROM r, generate_series(date_trunc('month', r.period_start), date_trunc('month', r.period_end), interval '1 month') d
)
SELECT
  r.output_vat,
  (SELECT COALESCE(SUM(v.vat_amount_base), 0) FROM vat_records v, periods
    WHERE v.tenant_id = r.tenant_id AND v.record_type = 'sale' AND v.deleted_at IS NULL
      AND v.tax_period = ANY(periods.p)) AS ledger_output,
  (SELECT count(*) FROM tax_return_lines l WHERE l.vat_return_id = r.id AND l.deleted_at IS NULL) AS box_count
FROM r;
```
Expected: `output_vat = ledger_output` exactly; `box_count = 3`.

- [ ] **Step 6: Commit**

```bash
git add src/components/financial/VATReturnDetailModal.tsx src/components/financial/VATReturnDetailModal.test.tsx src/pages/financial/VATAuditPage.tsx
git commit -m "feat(vat): return drill-down on the tax_period dimension with reconciliation badge (P3)"
```

**WP-2 verification:** `npm run typecheck` (0), `npm run test` (green), `npm run lint` (clean), Step-5 probe reconciles. PR: `feat/p3-gcc-return`.

---

# WP-3 — Fiscal-template numbering in production (branch: `feat/p3-fiscal-numbering`)

### Task 10: `master_numbering_policies` table + OM/AE/SA seeds

**Files:**
- Migration: `phase3_master_numbering_policies`
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `geo_countries` (`code` column verified live), `master_country_pack_versions` (Phase 1).
- Produces: global table `master_numbering_policies (id, country_id, scope, format_template, reset_basis, fiscal_year_anchor, max_length, pack_version_id, created_at, updated_at, deleted_at)` — consumed by Task 11 (`apply_country_numbering_policy`), Task 15 (gate part ④), the Studio Numbering tab (Task 23), and `get_next_number` v2's max_length join (Phase 1).

- [ ] **Step 1: Failing probe**

```sql
SELECT to_regclass('public.master_numbering_policies') AS t;
```
Expected: `t = null`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase3_master_numbering_policies`:
```sql
CREATE TABLE master_numbering_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES geo_countries(id),
  scope text NOT NULL,
  format_template text,
  reset_basis text NOT NULL DEFAULT 'never'
    CHECK (reset_basis IN ('never','calendar_year','fiscal_year')),
  fiscal_year_anchor text CHECK (fiscal_year_anchor IS NULL OR fiscal_year_anchor ~ '^\d{2}-\d{2}$'),
  max_length int,
  pack_version_id uuid REFERENCES master_country_pack_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX uq_master_numbering_policies_country_scope
  ON master_numbering_policies(country_id, scope) WHERE deleted_at IS NULL;

ALTER TABLE master_numbering_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_numbering_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY "master_numbering_policies_select" ON master_numbering_policies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "master_numbering_policies_write" ON master_numbering_policies
  FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- GCC launch seeds: legacy prefix behavior — NULL format_template = exact legacy
-- rendering (contract §2.2), reset never. India's INV/{FY}/{SEQ:4} row lands in
-- Phase 4 through the Studio, not here.
INSERT INTO master_numbering_policies (country_id, scope, format_template, reset_basis, fiscal_year_anchor, max_length)
SELECT c.id, s.scope, NULL, 'never', NULL, NULL
FROM geo_countries c
CROSS JOIN (VALUES ('invoices'), ('proforma_invoices'), ('quote')) AS s(scope)
WHERE c.code IN ('OM','AE','SA') AND c.deleted_at IS NULL
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Post-probe**

```sql
SELECT c.code, count(*) AS policies
FROM master_numbering_policies p JOIN geo_countries c ON c.id = p.country_id
GROUP BY c.code ORDER BY c.code;
```
Expected: `AE=3, OM=3, SA=3`.

- [ ] **Step 4: Regen types + typecheck**

`mcp__supabase__generate_typescript_types` → `src/types/database.types.ts`; `npm run typecheck` → 0.

- [ ] **Step 5: Manifest row + commit**

```
| <version> | phase3_master_numbering_policies.sql | Additive | master_numbering_policies pack table (country_id/scope/format_template/reset_basis/fiscal_year_anchor/max_length) + OM/AE/SA legacy-prefix seeds | P3 WP-3 |
```
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): master_numbering_policies pack table + GCC seeds (P3 M3-4)"
```

### Task 11: `apply_country_numbering_policy` RPC

**Files:**
- Migration: `phase3_apply_country_numbering_policy`
- Modify: `src/types/database.types.ts`, `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: Task 10 table; dormant `number_sequences` columns `format_template`/`reset_basis`/`fiscal_year_anchor` (live, verified NULL on all rows); `is_tenant_admin()`, `is_platform_admin()`, `get_current_tenant_id()`.
- Produces: `apply_country_numbering_policy(p_tenant_id uuid) RETURNS int` (rows updated) — consumed by `publish_country_pack` (Task 15) and `countryPackService` (Task 19).

- [ ] **Step 1: Failing probe**

```sql
SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
WHERE ns.nspname='public' AND p.proname='apply_country_numbering_policy';
```
Expected: `n = 0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase3_apply_country_numbering_policy`:
```sql
CREATE OR REPLACE FUNCTION apply_country_numbering_policy(p_tenant_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_country uuid;
  v_pol record;
  v_rows int;
  v_total int := 0;
BEGIN
  -- Platform admin (publish pipeline) or the tenant's own admin only.
  IF NOT (is_platform_admin() OR (is_tenant_admin() AND p_tenant_id = get_current_tenant_id())) THEN
    RAISE EXCEPTION 'apply_country_numbering_policy: requires platform admin or the tenant''s admin';
  END IF;

  SELECT country_id INTO v_country FROM tenants WHERE id = p_tenant_id AND deleted_at IS NULL;
  IF v_country IS NULL THEN
    RETURN 0;
  END IF;

  -- NON-DESTRUCTIVE: policies are country DEFAULTS. A tenant admin's explicit
  -- sequence configuration (any non-NULL fiscal column) is never overwritten.
  FOR v_pol IN
    SELECT scope, format_template, reset_basis, fiscal_year_anchor
    FROM master_numbering_policies
    WHERE country_id = v_country AND deleted_at IS NULL
  LOOP
    UPDATE number_sequences ns SET
      format_template    = COALESCE(ns.format_template, v_pol.format_template),
      reset_basis        = COALESCE(ns.reset_basis, NULLIF(v_pol.reset_basis, 'never')),
      fiscal_year_anchor = COALESCE(ns.fiscal_year_anchor, v_pol.fiscal_year_anchor),
      updated_at         = now()
    WHERE ns.tenant_id = p_tenant_id
      AND ns.scope = v_pol.scope
      AND (
        (ns.format_template IS NULL AND v_pol.format_template IS NOT NULL) OR
        (ns.reset_basis IS NULL AND v_pol.reset_basis <> 'never') OR
        (ns.fiscal_year_anchor IS NULL AND v_pol.fiscal_year_anchor IS NOT NULL)
      );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  END LOOP;

  RETURN v_total;
END
$fn$;

REVOKE ALL ON FUNCTION apply_country_numbering_policy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION apply_country_numbering_policy(uuid) TO authenticated, service_role;
```

- [ ] **Step 3: Post-probes — no-op on legacy seeds + idempotence**

```sql
-- As postgres (bypasses the role guard via service context in MCP): the OM seeds
-- are all-NULL templates, so applying to the Omani tenant must be a ZERO-row no-op.
SELECT apply_country_numbering_policy(t.id) AS updated
FROM tenants t WHERE t.deleted_at IS NULL LIMIT 1;
```
Expected: `updated = 0` (OM policies carry NULL template / 'never' reset — nothing to fill). Run twice: identical result (idempotent).

If the MCP session raises the role-guard exception instead (no platform-admin JWT), that is ALSO a pass for the guard behavior; then temporarily verify the body logic on a Supabase branch (`mcp__supabase__create_branch`) with the guard clause commented, and discard the branch.

- [ ] **Step 4: Regen types + manifest + commit**

`mcp__supabase__generate_typescript_types` → types; `npm run typecheck` → 0.
```
| <version> | phase3_apply_country_numbering_policy.sql | Additive | apply_country_numbering_policy — non-destructive fill of dormant number_sequences fiscal columns from master_numbering_policies | P3 WP-3 |
```
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): apply_country_numbering_policy RPC (P3 M3-5)"
```

### Task 12: SystemNumbers UI — fiscal fields + live format preview

**Files:**
- Modify: `src/pages/settings/SystemNumbers.tsx` (`NumberSequence` interface :43-51, `formData` state :86, `updateMutation` RPC call :103-117, `handleEdit` :132-136, `handleSubmit` :138-148, `formatNumber` :156-159 — all verified on main; if Phase 1's scope-registry fix restructured this file, apply the same additive fields to the restructured edit modal)
- Test: `src/pages/settings/SystemNumbers.test.tsx`

**Interfaces:**
- Consumes: 9-arg `update_number_sequence(p_scope, p_prefix, p_padding, p_reset, p_current_value, p_format_template, p_reset_basis, p_fiscal_year_anchor, p_max_length)` (Phase 1); `preview_number_format(p_scope text, p_format_template text) RETURNS text` (Phase 1).
- Produces: settings UI capable of configuring fiscal-template numbering (the "in production" claim of this phase for tenant admins).

- [ ] **Step 1: Write the failing test**

`src/pages/settings/SystemNumbers.test.tsx` (dom project; mock supabase + toast the way the neighboring settings tests do — the assertion contract is what matters):
```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpc = vi.fn().mockResolvedValue({ data: 'INV/2026-27/0001', error: null });
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({
          data: [{
            id: 's1', scope: 'invoices', prefix: 'INVO', padding: 4, current_value: 10192,
            reset_annually: false, format_template: null, reset_basis: null,
            fiscal_year_anchor: null, created_at: '2026-01-01',
          }],
          error: null,
        }),
      }),
    }),
  },
}));

import { SystemNumbers } from './SystemNumbers';

describe('SystemNumbers fiscal fields (P3)', () => {
  it('edit modal exposes format template / reset basis / fiscal anchor and previews via preview_number_format', async () => {
    render(<SystemNumbers />);           // wrap in the page's required providers, matching sibling tests
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const template = screen.getByLabelText(/format template/i);
    await userEvent.type(template, 'INV/{FY}/{SEQ:4}');
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('preview_number_format', {
        p_scope: 'invoices',
        p_format_template: 'INV/{FY}/{SEQ:4}',
      }),
    );
    expect(screen.getByLabelText(/reset basis/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fiscal year anchor/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/pages/settings/SystemNumbers.test.tsx`
Expected: FAIL — no element with label "Format template".

- [ ] **Step 3: Minimal implementation**

In `src/pages/settings/SystemNumbers.tsx`:

1. Extend the row interface (:43-51):
```typescript
interface NumberSequence {
  id: string;
  scope: SequenceScope;
  prefix: string;
  padding: number;
  current_value: number;
  reset_annually: boolean;
  format_template: string | null;
  reset_basis: 'calendar_year' | 'fiscal_year' | null;
  fiscal_year_anchor: string | null;
  created_at: string;
}
```
2. Extend form state (:86):
```typescript
const [formData, setFormData] = useState({
  prefix: '', padding: 4, reset_annually: false,
  format_template: '' as string, reset_basis: '' as '' | 'calendar_year' | 'fiscal_year',
  fiscal_year_anchor: '' as string,
});
const [previewValue, setPreviewValue] = useState<string | null>(null);
```
3. Extend the mutation RPC call (:103-117) to the 9-arg signature:
```typescript
const { error } = await supabase.rpc('update_number_sequence', {
  p_scope: scope,
  p_prefix: prefix,
  p_padding: padding,
  p_reset: reset_annually,
  p_current_value: null,
  p_format_template: format_template || null,
  p_reset_basis: reset_basis || null,
  p_fiscal_year_anchor: fiscal_year_anchor || null,
  p_max_length: null,
});
```
(thread `format_template`, `reset_basis`, `fiscal_year_anchor` through the mutation's argument object and `handleEdit`/`handleSubmit`/`handleCloseModal` the same way `prefix` already flows.)
4. Debounced preview effect:
```typescript
useEffect(() => {
  if (!editingSequence || !formData.format_template) { setPreviewValue(null); return; }
  const handle = setTimeout(async () => {
    const { data, error } = await supabase.rpc('preview_number_format', {
      p_scope: editingSequence.scope,
      p_format_template: formData.format_template,
    });
    setPreviewValue(error ? null : (data as string));
  }, 300);
  return () => clearTimeout(handle);
}, [editingSequence, formData.format_template]);
```
5. Modal fields (inside the existing edit-modal form, after the padding input):
```tsx
<Input
  id="format_template"
  label="Format template"
  placeholder="INV/{FY}/{SEQ:4} — leave empty for legacy PREFIX-0001"
  value={formData.format_template}
  onChange={(e) => setFormData((f) => ({ ...f, format_template: e.target.value }))}
/>
<div>
  <label htmlFor="reset_basis" className="block text-sm font-medium mb-1">Reset basis</label>
  <select
    id="reset_basis"
    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
    value={formData.reset_basis}
    onChange={(e) => setFormData((f) => ({ ...f, reset_basis: e.target.value as typeof f.reset_basis }))}
  >
    <option value="">Never</option>
    <option value="calendar_year">Calendar year</option>
    <option value="fiscal_year">Fiscal year</option>
  </select>
</div>
{formData.reset_basis === 'fiscal_year' && (
  <Input
    id="fiscal_year_anchor"
    label="Fiscal year anchor"
    placeholder="MM-DD, e.g. 04-01"
    value={formData.fiscal_year_anchor}
    onChange={(e) => setFormData((f) => ({ ...f, fiscal_year_anchor: e.target.value }))}
  />
)}
{previewValue && (
  <p className="text-sm text-slate-500">
    Next number preview: <span className="font-mono font-semibold">{previewValue}</span>
  </p>
)}
```
6. Replace the hardcoded hyphen render in `formatNumber` (:156-159) so template rows do not lie:
```typescript
const formatNumber = (seq: NumberSequence) => {
  if (seq.format_template) return 'templated — see edit preview';
  const nextNum = seq.current_value + 1;
  return seq.prefix + '-' + nextNum.toString().padStart(seq.padding, '0');
};
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/pages/settings/SystemNumbers.test.tsx` — expected: PASS.
Run: `npm run typecheck && npm run lint` — expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/SystemNumbers.tsx src/pages/settings/SystemNumbers.test.tsx
git commit -m "feat(settings): fiscal numbering fields + live preview_number_format preview (P3)"
```

### Task 13: Numbering production-hardening regression probes

**Files:**
- Create: `scripts/financial/p3-numbering-regression.sql` (checked-in probe pack, run manually / from the WP PR description)

**Interfaces:**
- Consumes: `get_next_number` v2, `update_number_sequence` (Phase 1 hardened), Task 10/11 artifacts.
- Produces: a repeatable SQL evidence pack for the phase-brief claims "format_template rendering, reset_basis/fiscal_year_anchor honored, legal-scope counter-rewind protection".

- [ ] **Step 1: Write the probe pack (this IS the test — it asserts live behavior)**

`scripts/financial/p3-numbering-regression.sql`:
```sql
-- P3 numbering regression probes. Run via mcp__supabase__execute_sql (or psql)
-- against a Supabase BRANCH, never straight at the demo tenant's live counters.

-- 1. Template rendering: {FY}/{SEQ:n} tokens produce the documented shape.
SELECT preview_number_format('invoices', 'INV/{FY}/{SEQ:4}') AS rendered;
-- EXPECT: 'INV/<current fiscal year label>/<4-digit next seq>' e.g. INV/2026/10193 shape,
-- matching the Phase-1 token contract; NOT 'INVO-10193'.

-- 2. Legacy fallback: NULL format_template keeps exact PREFIX-0001 rendering.
SELECT preview_number_format('invoices', NULL) AS rendered;
-- EXPECT: 'INVO-10193' (prefix INVO, padding 4, current_value 10192 → next 10193).

-- 3. Legal-scope rewind protection (Phase-1 guard must still hold after P3 wiring):
SELECT update_number_sequence('invoices', 'INVO', 4, false, 1, NULL, NULL, NULL, NULL);
-- EXPECT: ERROR mentioning rewind/issued-max block for legal scope 'invoices'.

-- 4. anon grant posture (SEC-1 must survive every recreate):
SELECT NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_revoked, p.proname
FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
WHERE ns.nspname='public'
  AND p.proname IN ('update_number_sequence','get_next_number','apply_country_numbering_policy','file_vat_return');
-- EXPECT: anon_revoked = true on every row.

-- 5. Policy fill is visible to get_next_number: after an admin sets a template via
--    the SystemNumbers UI (or update_number_sequence), the next mint uses it.
SELECT format_template, reset_basis, fiscal_year_anchor
FROM number_sequences WHERE scope='invoices';
-- EXPECT: reflects the configured values (NULLs before configuration, values after).
```

- [ ] **Step 2: Execute each probe and record outputs**

Run each statement via `mcp__supabase__execute_sql` on a branch created with `mcp__supabase__create_branch` (confirm cost first via `mcp__supabase__confirm_cost`); paste actual outputs as SQL comments under each EXPECT in the committed file. Any deviation = STOP, file the discrepancy against the Phase-1 implementation before proceeding.

- [ ] **Step 3: Commit**

```bash
git add scripts/financial/p3-numbering-regression.sql
git commit -m "test(numbering): P3 production-hardening regression probe pack with recorded evidence"
```

**WP-3 verification:** probes recorded green; `npm run typecheck` (0); `npm run test` (green). PR: `feat/p3-fiscal-numbering` with the migration template.

---

# WP-4 — Publish governance RPCs + monitors (branch: `feat/p3-publish-governance`)

### Task 14: Pack authoring RPCs + gate helper functions

**Files:**
- Migration: `phase3_pack_authoring_rpcs`
- Modify: `src/types/database.types.ts`, `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `master_country_pack_versions` (Phase 1 — columns country_id, version, status CHECK draft/in_review/published/superseded, effective_from, changelog, authored_by, approved_by with `approved_by <> authored_by` CHECK, checksum, next_review_date, staleness_days), `master_country_pack_tests`, `geo_country_tax_rates`, `master_einvoice_regimes` (Phase 1), `master_document_requirements` (Phase 2), `master_numbering_policies` (Task 10), `platform_audit_logs` (live columns verified: `admin_id, action, resource_type, resource_id, tenant_id, details, performed_at`), `is_platform_admin()`, `auth.uid()`.
- Produces: `content_updated_at timestamptz` on `master_country_pack_versions`; RPCs `create_country_pack_draft`, `submit_country_pack_for_review`, `upsert_country_tax_rate`, `upsert_document_requirement`, `upsert_country_pack_test`, `upsert_country_einvoice_regime`, `upsert_country_numbering_policy`, `update_country_pack_facts`, `record_pack_test_result`; helpers `validate_requirement_condition(jsonb)`, `numbering_template_render_length(text,int)` — consumed by Tasks 15, 19, 23, 24, 29, 30.

- [ ] **Step 1: Failing probe**

```sql
SELECT p.proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
WHERE ns.nspname='public' AND p.proname IN
  ('create_country_pack_draft','submit_country_pack_for_review','upsert_country_tax_rate',
   'upsert_document_requirement','upsert_country_pack_test','upsert_country_einvoice_regime',
   'upsert_country_numbering_policy','update_country_pack_facts','record_pack_test_result',
   'validate_requirement_condition','numbering_template_render_length');
```
Expected: 0 rows.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase3_pack_authoring_rpcs`:
```sql
ALTER TABLE master_country_pack_versions
  ADD COLUMN IF NOT EXISTS content_updated_at timestamptz;

-- ── shared internals ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _pack_require_platform_admin() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'country pack authoring: platform admin only';
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION _pack_open_version(p_country_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT id FROM master_country_pack_versions
  WHERE country_id = p_country_id AND status IN ('draft','in_review')
  ORDER BY version DESC LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION _pack_touch(p_pack_version_id uuid, p_action text, p_resource_type text, p_resource_id uuid, p_details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE master_country_pack_versions
     SET content_updated_at = now()
   WHERE id = p_pack_version_id;
  INSERT INTO platform_audit_logs (admin_id, action, resource_type, resource_id, details, performed_at)
  VALUES (auth.uid(), p_action, p_resource_type, p_resource_id, p_details, now());
END $fn$;

-- ── lifecycle ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_country_pack_draft(p_country_id uuid, p_changelog text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_version int; v_id uuid;
BEGIN
  PERFORM _pack_require_platform_admin();
  IF _pack_open_version(p_country_id) IS NOT NULL THEN
    RAISE EXCEPTION 'create_country_pack_draft: an open draft/in_review pack already exists for this country';
  END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM master_country_pack_versions WHERE country_id = p_country_id;
  INSERT INTO master_country_pack_versions
    (country_id, version, status, changelog, authored_by, next_review_date, content_updated_at)
  VALUES
    (p_country_id, v_version, 'draft', p_changelog, auth.uid(), (CURRENT_DATE + 180), now())
  RETURNING id INTO v_id;
  PERFORM _pack_touch(v_id, 'country_pack_draft_created', 'master_country_pack_versions', v_id,
                      jsonb_build_object('country_id', p_country_id, 'version', v_version));
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION submit_country_pack_for_review(p_pack_version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_status text;
BEGIN
  PERFORM _pack_require_platform_admin();
  SELECT status INTO v_status FROM master_country_pack_versions WHERE id = p_pack_version_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'submit_country_pack_for_review: pack version not found'; END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'submit_country_pack_for_review: only draft packs can be submitted (current: %)', v_status;
  END IF;
  UPDATE master_country_pack_versions SET status = 'in_review' WHERE id = p_pack_version_id;
  PERFORM _pack_touch(p_pack_version_id, 'country_pack_submitted_for_review',
                      'master_country_pack_versions', p_pack_version_id, '{}'::jsonb);
END $fn$;

-- ── authoring upserts (every write requires an open draft; provenance stamped) ─
CREATE OR REPLACE FUNCTION upsert_country_tax_rate(p_row jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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
    RETURNING id INTO v_id;
  END IF;
  PERFORM _pack_touch(v_pack, 'country_tax_rate_upserted', 'geo_country_tax_rates', v_id, p_row);
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION validate_requirement_condition(p_condition jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE v_item jsonb;
BEGIN
  IF p_condition IS NULL THEN RETURN true; END IF;             -- unconditional requirement
  IF jsonb_typeof(p_condition->'all') <> 'array' THEN RETURN false; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_condition->'all') LOOP
    IF (v_item->>'fact') IS NULL OR NOT (v_item->>'fact' = ANY (ARRAY[
      'buyer_is_business','buyer_tax_number','seller_registered','place_of_supply',
      'tax_treatment','document_total','line.item_code','line.unit_code'])) THEN
      RETURN false;
    END IF;
    IF NOT (COALESCE(v_item->>'op','') = ANY (ARRAY['eq','neq','in','gte','present'])) THEN
      RETURN false;
    END IF;
    IF v_item->>'op' <> 'present' AND NOT (v_item ? 'value') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION upsert_document_requirement(p_row jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_country uuid := (p_row->>'country_id')::uuid; v_pack uuid; v_id uuid;
BEGIN
  PERFORM _pack_require_platform_admin();
  v_pack := _pack_open_version(v_country);
  IF v_pack IS NULL THEN
    RAISE EXCEPTION 'upsert_document_requirement: no open draft — call create_country_pack_draft first';
  END IF;
  IF (p_row->>'level') NOT IN ('block','warn') THEN
    RAISE EXCEPTION 'upsert_document_requirement: level must be block|warn';
  END IF;
  IF NOT (p_row->>'field_key' = ANY (ARRAY[
    'buyer_tax_number','buyer_address','place_of_supply_subdivision_id','supply_date',
    'seller_tax_number','line.item_code','line.unit_code'])) THEN
    RAISE EXCEPTION 'upsert_document_requirement: field_key % outside the closed vocabulary', p_row->>'field_key';
  END IF;
  IF NOT validate_requirement_condition(p_row->'condition') THEN
    RAISE EXCEPTION 'upsert_document_requirement: condition does not parse against the closed vocabulary';
  END IF;
  IF p_row ? 'id' THEN
    UPDATE master_document_requirements SET
      doc_type = p_row->>'doc_type', field_key = p_row->>'field_key',
      condition = p_row->'condition', level = p_row->>'level',
      message_i18n = p_row->'message_i18n',
      effective_from = COALESCE(NULLIF(p_row->>'effective_from','')::date, CURRENT_DATE),
      pack_version_id = v_pack
    WHERE id = (p_row->>'id')::uuid AND country_id = v_country
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'upsert_document_requirement: row not found for this country'; END IF;
  ELSE
    INSERT INTO master_document_requirements
      (country_id, doc_type, field_key, condition, level, message_i18n, effective_from, pack_version_id)
    VALUES
      (v_country, p_row->>'doc_type', p_row->>'field_key', p_row->'condition', p_row->>'level',
       p_row->'message_i18n', COALESCE(NULLIF(p_row->>'effective_from','')::date, CURRENT_DATE), v_pack)
    RETURNING id INTO v_id;
  END IF;
  PERFORM _pack_touch(v_pack, 'document_requirement_upserted', 'master_document_requirements', v_id, p_row);
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION upsert_country_pack_test(p_row jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_country uuid := (p_row->>'country_id')::uuid; v_pack uuid; v_id uuid;
BEGIN
  PERFORM _pack_require_platform_admin();
  v_pack := _pack_open_version(v_country);
  IF v_pack IS NULL THEN
    RAISE EXCEPTION 'upsert_country_pack_test: no open draft — call create_country_pack_draft first';
  END IF;
  IF p_row ? 'id' THEN
    UPDATE master_country_pack_tests SET
      name = p_row->>'name', input_document = p_row->'input_document',
      expected = p_row->'expected', pack_version_id = v_pack,
      last_run_at = NULL, last_result = NULL          -- content changed → result stale by construction
    WHERE id = (p_row->>'id')::uuid AND country_id = v_country
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'upsert_country_pack_test: row not found for this country'; END IF;
  ELSE
    INSERT INTO master_country_pack_tests (country_id, pack_version_id, name, input_document, expected)
    VALUES (v_country, v_pack, p_row->>'name', p_row->'input_document', p_row->'expected')
    RETURNING id INTO v_id;
  END IF;
  PERFORM _pack_touch(v_pack, 'country_pack_test_upserted', 'master_country_pack_tests', v_id,
                      jsonb_build_object('name', p_row->>'name'));
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION upsert_country_einvoice_regime(p_row jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_country uuid := (p_row->>'country_id')::uuid; v_pack uuid; v_id uuid;
BEGIN
  PERFORM _pack_require_platform_admin();
  v_pack := _pack_open_version(v_country);
  IF v_pack IS NULL THEN
    RAISE EXCEPTION 'upsert_country_einvoice_regime: no open draft — call create_country_pack_draft first';
  END IF;
  IF (p_row->>'regime_class') NOT IN
     ('render_artifact','clearance_api','chained_document','certified_software','filing_api') THEN
    RAISE EXCEPTION 'upsert_country_einvoice_regime: invalid regime_class %', p_row->>'regime_class';
  END IF;
  IF p_row ? 'id' THEN
    UPDATE master_einvoice_regimes SET
      code = p_row->>'code', regime_class = p_row->>'regime_class',
      adapter_key = p_row->>'adapter_key',
      mandatory_from = NULLIF(p_row->>'mandatory_from','')::date,
      thresholds = COALESCE(p_row->'thresholds','{}'::jsonb),
      config = COALESCE(p_row->'config','{}'::jsonb)
    WHERE id = (p_row->>'id')::uuid AND country_id = v_country
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'upsert_country_einvoice_regime: row not found for this country'; END IF;
  ELSE
    INSERT INTO master_einvoice_regimes
      (country_id, code, regime_class, adapter_key, mandatory_from, thresholds, config)
    VALUES
      (v_country, p_row->>'code', p_row->>'regime_class', p_row->>'adapter_key',
       NULLIF(p_row->>'mandatory_from','')::date,
       COALESCE(p_row->'thresholds','{}'::jsonb), COALESCE(p_row->'config','{}'::jsonb))
    RETURNING id INTO v_id;
  END IF;
  PERFORM _pack_touch(v_pack, 'einvoice_regime_upserted', 'master_einvoice_regimes', v_id, p_row);
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION upsert_country_numbering_policy(p_row jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_country uuid := (p_row->>'country_id')::uuid; v_pack uuid; v_id uuid;
BEGIN
  PERFORM _pack_require_platform_admin();
  v_pack := _pack_open_version(v_country);
  IF v_pack IS NULL THEN
    RAISE EXCEPTION 'upsert_country_numbering_policy: no open draft — call create_country_pack_draft first';
  END IF;
  IF COALESCE(p_row->>'reset_basis','never') NOT IN ('never','calendar_year','fiscal_year') THEN
    RAISE EXCEPTION 'upsert_country_numbering_policy: invalid reset_basis';
  END IF;
  INSERT INTO master_numbering_policies
    (country_id, scope, format_template, reset_basis, fiscal_year_anchor, max_length, pack_version_id, updated_at)
  VALUES
    (v_country, p_row->>'scope', NULLIF(p_row->>'format_template',''),
     COALESCE(p_row->>'reset_basis','never'), NULLIF(p_row->>'fiscal_year_anchor',''),
     NULLIF(p_row->>'max_length','')::int, v_pack, now())
  ON CONFLICT (country_id, scope) WHERE deleted_at IS NULL
  DO UPDATE SET
    format_template = EXCLUDED.format_template,
    reset_basis = EXCLUDED.reset_basis,
    fiscal_year_anchor = EXCLUDED.fiscal_year_anchor,
    max_length = EXCLUDED.max_length,
    pack_version_id = EXCLUDED.pack_version_id,
    updated_at = now()
  RETURNING id INTO v_id;
  PERFORM _pack_touch(v_pack, 'numbering_policy_upserted', 'master_numbering_policies', v_id, p_row);
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION update_country_pack_facts(p_country_id uuid, p_scalars jsonb, p_config jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_pack uuid;
BEGIN
  PERFORM _pack_require_platform_admin();
  v_pack := _pack_open_version(p_country_id);
  IF v_pack IS NULL THEN
    RAISE EXCEPTION 'update_country_pack_facts: no open draft — call create_country_pack_draft first';
  END IF;
  -- Allowlisted formatting/statutory scalars only; unknown keys are ignored by
  -- construction (explicit column list — never dynamic SQL over caller keys).
  UPDATE geo_countries SET
    currency_code    = COALESCE(p_scalars->>'currency_code', currency_code),
    currency_symbol  = COALESCE(p_scalars->>'currency_symbol', currency_symbol),
    decimal_places   = COALESCE((p_scalars->>'decimal_places')::int, decimal_places),
    tax_system       = COALESCE(p_scalars->>'tax_system', tax_system),
    tax_label        = COALESCE(p_scalars->>'tax_label', tax_label),
    tax_number_label = COALESCE(p_scalars->>'tax_number_label', tax_number_label),
    default_tax_rate = COALESCE((p_scalars->>'default_tax_rate')::numeric, default_tax_rate),
    locale_code      = COALESCE(p_scalars->>'locale_code', locale_code),
    timezone         = COALESCE(p_scalars->>'timezone', timezone),
    date_format      = COALESCE(p_scalars->>'date_format', date_format),
    fiscal_year_start = COALESCE(p_scalars->>'fiscal_year_start', fiscal_year_start),
    language_code    = COALESCE(p_scalars->>'language_code', language_code),
    country_config   = country_config || COALESCE(p_config, '{}'::jsonb)
  WHERE id = p_country_id;
  PERFORM _pack_touch(v_pack, 'country_pack_facts_updated', 'geo_countries', p_country_id,
                      jsonb_build_object('scalars', p_scalars, 'config_keys',
                        (SELECT jsonb_agg(k) FROM jsonb_object_keys(COALESCE(p_config,'{}'::jsonb)) k)));
END $fn$;

CREATE OR REPLACE FUNCTION record_pack_test_result(p_test_id uuid, p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM _pack_require_platform_admin();
  UPDATE master_country_pack_tests
     SET last_run_at = now(), last_result = p_result
   WHERE id = p_test_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_pack_test_result: test not found'; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION numbering_template_render_length(p_format_template text, p_padding int)
RETURNS int LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE v text := p_format_template; v_seq int;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  v := replace(v, '{FY}', repeat('9', 7));                        -- worst case '2025-26'
  v_seq := COALESCE((regexp_match(v, '\{SEQ:(\d+)\}'))[1]::int, p_padding);
  v := regexp_replace(v, '\{SEQ:\d+\}', repeat('9', GREATEST(v_seq, 10)));  -- 10 digits = bigint headroom
  v := replace(v, '{SEQ}', repeat('9', GREATEST(p_padding, 10)));
  RETURN length(v);
END $fn$;

-- SEC-1 grant posture for the whole family.
DO $do$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'create_country_pack_draft(uuid, text)',
    'submit_country_pack_for_review(uuid)',
    'upsert_country_tax_rate(jsonb)',
    'upsert_document_requirement(jsonb)',
    'upsert_country_pack_test(jsonb)',
    'upsert_country_einvoice_regime(jsonb)',
    'upsert_country_numbering_policy(jsonb)',
    'update_country_pack_facts(uuid, jsonb, jsonb)',
    'record_pack_test_result(uuid, jsonb)',
    '_pack_require_platform_admin()',
    '_pack_open_version(uuid)',
    '_pack_touch(uuid, text, text, uuid, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $do$;
```

- [ ] **Step 3: Post-probes**

```sql
-- All 11 functions exist, SECURITY DEFINER, anon revoked.
SELECT p.proname, p.prosecdef, NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_revoked
FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
WHERE ns.nspname='public' AND p.proname IN
  ('create_country_pack_draft','submit_country_pack_for_review','upsert_country_tax_rate',
   'upsert_document_requirement','upsert_country_pack_test','upsert_country_einvoice_regime',
   'upsert_country_numbering_policy','update_country_pack_facts','record_pack_test_result')
ORDER BY p.proname;
-- Expected: 9 rows, prosecdef=true, anon_revoked=true everywhere.

-- Vocabulary validators behave.
SELECT validate_requirement_condition('{"all":[{"fact":"buyer_tax_number","op":"present"}]}'::jsonb) AS ok,
       validate_requirement_condition('{"all":[{"fact":"favorite_color","op":"eq","value":"red"}]}'::jsonb) AS bad,
       numbering_template_render_length('INV/{FY}/{SEQ:4}', 4) AS len;
-- Expected: ok=true, bad=false, len = 4 ('INV/') + 7 ({FY}) + 1 ('/') + 10 (SEQ headroom) = 22.
```

- [ ] **Step 4: Regen types + manifest + commit**

`mcp__supabase__generate_typescript_types` → types; `npm run typecheck` → 0.
```
| <version> | phase3_pack_authoring_rpcs.sql | Additive | Country-pack authoring RPC family (draft/submit/upsert rate/requirement/test/regime/numbering/facts + record_pack_test_result) with provenance, content_updated_at freshness stamp, closed-vocabulary validators | P3 WP-4 |
```
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): country-pack authoring RPCs + gate validators (P3 M3-6)"
```

### Task 15: `publish_country_pack` — the four-part machine gate

**Files:**
- Migration: `phase3_publish_country_pack`
- Modify: `src/types/database.types.ts`, `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: everything from Task 14; `master_engine_capabilities` (Phase 1); `resync_tenant_country_config(p_tenant_id uuid)` (existing RPC, caller verified at `src/lib/tenantConfigService.ts:272-279`); `apply_country_numbering_policy` (Task 11); `tenants.country_pack_version` (Phase 1 M-J column); `geo_countries.config_status` + `country_config` (verified live).
- Produces: `publish_country_pack(p_country_id uuid, p_version int) RETURNS jsonb` with the contract return shape `{ "published": bool, "config_status": text, "gate": { "fixtures": {...}, "capabilities": {...}, "dual_control": bool, "coverage": {...} } }`; `sync_engine_capabilities(p_capabilities jsonb) RETURNS int` — consumed by Task 19 and Tasks 29/30.

- [ ] **Step 1: Failing probe**

```sql
SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
WHERE ns.nspname='public' AND p.proname IN ('publish_country_pack','sync_engine_capabilities');
```
Expected: `n = 0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase3_publish_country_pack`:
```sql
CREATE OR REPLACE FUNCTION sync_engine_capabilities(p_capabilities jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_item jsonb; v_count int := 0;
BEGIN
  PERFORM _pack_require_platform_admin();
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_capabilities) LOOP
    IF (v_item->>'kind') NOT IN
       ('regime_adapter','scheme_mode','speller_scale','bank_file_op','filing_transport') THEN
      RAISE EXCEPTION 'sync_engine_capabilities: invalid kind % for %', v_item->>'kind', v_item->>'capability_key';
    END IF;
    INSERT INTO master_engine_capabilities (capability_key, kind, min_engine_version)
    VALUES (v_item->>'capability_key', v_item->>'kind', v_item->>'version')
    ON CONFLICT (capability_key)
    DO UPDATE SET kind = EXCLUDED.kind, min_engine_version = EXCLUDED.min_engine_version;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION publish_country_pack(p_country_id uuid, p_version int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_pack master_country_pack_versions;
  v_country geo_countries;
  v_fixture_total int; v_fixture_pass int; v_fixture_stale int;
  v_required_caps text[]; v_missing_caps text[];
  v_rate_ok boolean; v_req_bad int; v_num_bad int;
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

  -- ③ DUAL CONTROL — approver must not be the author (mirrors the table CHECK,
  -- but raised here with a friendly message BEFORE any state changes).
  IF v_pack.authored_by = auth.uid() THEN
    RAISE EXCEPTION 'publish_country_pack: dual control — the approver must differ from the author';
  END IF;

  SELECT * INTO v_country FROM geo_countries WHERE id = p_country_id;

  -- ① FIXTURES — every test recorded pass, and no result older than the last content edit.
  SELECT count(*),
         count(*) FILTER (WHERE (last_result->>'pass')::boolean IS TRUE),
         count(*) FILTER (WHERE last_run_at IS NULL
                             OR last_run_at < COALESCE(v_pack.content_updated_at, v_pack.created_at))
    INTO v_fixture_total, v_fixture_pass, v_fixture_stale
    FROM master_country_pack_tests
   WHERE country_id = p_country_id;

  IF v_country.tax_system IS DISTINCT FROM 'NONE' THEN
    IF v_fixture_total = 0 THEN v_blockers := v_blockers || 'no fixtures — a statutory pack needs golden evidence'; END IF;
    IF v_fixture_pass < v_fixture_total THEN v_blockers := v_blockers || 'failing fixtures'; END IF;
    IF v_fixture_stale > 0 THEN v_blockers := v_blockers || 'stale fixture results — re-run the gate after the last edit'; END IF;
  END IF;

  -- ② CAPABILITY MANIFEST — regime keys + einvoice adapters must be registered engine capabilities.
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
   WHERE NOT EXISTS (SELECT 1 FROM master_engine_capabilities m WHERE m.capability_key = c);

  -- ④ COVERAGE — standard rate effective today; conditions parse; templates fit max_length.
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

  IF NOT v_rate_ok THEN v_blockers := v_blockers || 'no standard-category rate effective today'; END IF;
  IF v_req_bad > 0 THEN v_blockers := v_blockers || format('%s requirement condition(s) fail the closed vocabulary', v_req_bad); END IF;
  IF v_num_bad > 0 THEN v_blockers := v_blockers || format('%s numbering template(s) exceed max_length', v_num_bad); END IF;

  v_gate := jsonb_build_object(
    'fixtures', jsonb_build_object('total', v_fixture_total, 'passed', v_fixture_pass, 'stale', v_fixture_stale),
    'capabilities', jsonb_build_object('required', to_jsonb(v_required_caps),
                                       'missing', COALESCE(to_jsonb(v_missing_caps), '[]'::jsonb)),
    'dual_control', true,
    'coverage', jsonb_build_object('standard_rate', v_rate_ok,
                                   'invalid_requirement_conditions', v_req_bad,
                                   'numbering_over_max_length', v_num_bad),
    'blockers', to_jsonb(v_blockers));

  IF array_length(v_blockers, 1) IS NOT NULL THEN
    RETURN jsonb_build_object('published', false, 'config_status', v_country.config_status, 'gate', v_gate);
  END IF;

  -- PUBLISH: supersede prior published, flip this one, machine-derive config_status.
  UPDATE master_country_pack_versions SET status = 'superseded'
   WHERE country_id = p_country_id AND status = 'published';
  UPDATE master_country_pack_versions
     SET status = 'published', approved_by = auth.uid(),
         effective_from = COALESCE(effective_from, CURRENT_DATE)
   WHERE id = v_pack.id;

  -- HONEST DEGRADATION (spec §CountryConfig): a missing capability caps the ladder
  -- at formatting_ready — the pack publishes but the country stays un-onboardable
  -- for statutory tenants (the provisioning 422 names what is missing).
  v_status := CASE
    WHEN v_missing_caps IS NULL AND v_country.tax_system IS DISTINCT FROM 'NONE' THEN 'statutory_ready'
    ELSE 'formatting_ready'
  END;
  UPDATE geo_countries SET config_status = v_status WHERE id = p_country_id;

  -- Publish→resync discipline (graft 12): forward-looking resolution only —
  -- resync_tenant_country_config touches tenant scalars/resolved_country_config,
  -- NEVER snapshotted documents. Pin the pack version per tenant.
  FOR v_tenant IN SELECT id FROM tenants WHERE country_id = p_country_id AND deleted_at IS NULL LOOP
    PERFORM resync_tenant_country_config(v_tenant.id);
    PERFORM apply_country_numbering_policy(v_tenant.id);
    UPDATE tenants SET country_pack_version = p_version WHERE id = v_tenant.id;
  END LOOP;

  PERFORM _pack_touch(v_pack.id, 'country_pack_published', 'master_country_pack_versions', v_pack.id,
                      jsonb_build_object('version', p_version, 'config_status', v_status, 'gate', v_gate));

  RETURN jsonb_build_object('published', true, 'config_status', v_status, 'gate', v_gate);
END $fn$;

REVOKE ALL ON FUNCTION publish_country_pack(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION publish_country_pack(uuid, int) TO authenticated, service_role;
REVOKE ALL ON FUNCTION sync_engine_capabilities(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_engine_capabilities(jsonb) TO authenticated, service_role;
```
NOTE: if Phase 1 created `master_engine_capabilities` without a unique constraint on `capability_key`, add `CREATE UNIQUE INDEX IF NOT EXISTS uq_master_engine_capabilities_key ON master_engine_capabilities(capability_key);` at the top of this migration (check first: `SELECT indexdef FROM pg_indexes WHERE tablename='master_engine_capabilities';`).

- [ ] **Step 3: Post-probes**

```sql
SELECT p.proname, p.prosecdef, NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_revoked
FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
WHERE ns.nspname='public' AND p.proname IN ('publish_country_pack','sync_engine_capabilities');
-- Expected: 2 rows, prosecdef=true, anon_revoked=true.
```
Behavioral gate probe (a version that does not exist):
```sql
SELECT publish_country_pack((SELECT id FROM geo_countries WHERE code='OM'), 999999);
```
Expected: `ERROR: publish_country_pack: pack version not found` (raised AFTER the platform-admin check when run in an admin context; from the MCP service context the admin check itself may raise first — either exception is a pass for this probe).

- [ ] **Step 4: Regen types + manifest + commit**

`mcp__supabase__generate_typescript_types` → types; `npm run typecheck` → 0.
```
| <version> | phase3_publish_country_pack.sql | Additive | publish_country_pack four-part machine gate (fixtures/capability-manifest/dual-control/coverage) with honest formatting_ready degradation + tenant resync/pin; sync_engine_capabilities | P3 WP-4 |
```
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): publish_country_pack machine gate + capability manifest sync (P3 M3-7)"
```

### Task 16: Pack staleness monitor (pg_cron)

**Files:**
- Migration: `phase3_pack_staleness_monitor`
- Modify: `src/types/database.types.ts`, `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `master_country_pack_versions.next_review_date` + `staleness_days` (Phase 1 columns); pg_cron 1.6.4 (verified installed).
- Produces: `refresh_pack_staleness()` + daily cron job `pack-staleness-daily` — consumed by the staleness dashboard (Task 21) which reads `staleness_days`.

- [ ] **Step 1: Failing probe**

```sql
SELECT count(*) AS n FROM cron.job WHERE jobname = 'pack-staleness-daily';
```
Expected: `n = 0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase3_pack_staleness_monitor`:
```sql
CREATE OR REPLACE FUNCTION refresh_pack_staleness()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE master_country_pack_versions
     SET staleness_days = GREATEST(0, (CURRENT_DATE - next_review_date))
   WHERE status = 'published' AND next_review_date IS NOT NULL;
$fn$;

REVOKE ALL ON FUNCTION refresh_pack_staleness() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION refresh_pack_staleness() TO postgres, service_role;

-- Idempotent (re)schedule at 02:15 UTC daily.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pack-staleness-daily') THEN
    PERFORM cron.unschedule('pack-staleness-daily');
  END IF;
  PERFORM cron.schedule('pack-staleness-daily', '15 2 * * *', 'SELECT refresh_pack_staleness()');
END $do$;
```

- [ ] **Step 3: Post-probe with a seeded violation (testing-the-monitor requirement)**

```sql
SELECT count(*) AS scheduled FROM cron.job WHERE jobname = 'pack-staleness-daily';
-- Expected: scheduled = 1.
SELECT refresh_pack_staleness();
SELECT count(*) AS overdue FROM master_country_pack_versions
 WHERE status='published' AND staleness_days > 0;
-- Expected right now: overdue = 0 (fresh packs). After Task 29/30 publish, temporarily
-- rewind one pack's next_review_date to yesterday on a Supabase BRANCH, re-run
-- refresh_pack_staleness(), and confirm overdue = 1 — the monitor detects seeded violations.
```

- [ ] **Step 4: Regen types + manifest + commit**

```
| <version> | phase3_pack_staleness_monitor.sql | Additive | refresh_pack_staleness + pg_cron daily job stamping staleness_days on published packs | P3 WP-4 |
```
```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): pack staleness pg_cron monitor (P3 M3-8)"
```

### Task 17: Publish→resync no-op discipline probe (graft 12)

**Files:**
- Create: `scripts/financial/p3-resync-noop-probe.sql`

**Interfaces:**
- Consumes: `resync_tenant_country_config` RPC (existing), `tenants` row snapshot.
- Produces: recorded evidence that a resync against already-matching scalars changes nothing (the phase-brief requirement "resync is verifiably a no-op when scalars already match").

- [ ] **Step 1: Write the probe**

`scripts/financial/p3-resync-noop-probe.sql`:
```sql
-- Graft-12 discipline: resync after publish must be a VERIFIABLE NO-OP when the
-- tenant's scalars already match the country pack. Run on a Supabase branch or
-- with a platform-admin JWT.
WITH before AS (
  SELECT id, to_jsonb(t) - 'updated_at' AS snap FROM tenants t WHERE deleted_at IS NULL
)
SELECT b.id,
       resync_tenant_country_config(b.id) IS NULL AS resynced,   -- void fn → NULL
       (SELECT (to_jsonb(t2) - 'updated_at') = b.snap FROM tenants t2 WHERE t2.id = b.id) AS unchanged
FROM before b;
-- EXPECT: unchanged = true for every tenant whose scalars already match its country
-- (the Omani demo tenant is fully country-correct per Appendix A, so: true).
```

- [ ] **Step 2: Execute and record**

Run via `mcp__supabase__execute_sql` in a context where the resync RPC's own permission check passes (platform admin; otherwise on a branch). Paste the observed output as a trailing comment in the file. Expected: `unchanged = true`.

- [ ] **Step 3: Commit**

```bash
git add scripts/financial/p3-resync-noop-probe.sql
git commit -m "test(governance): publish->resync no-op discipline probe with recorded evidence (P3)"
```

### Task 18: Capability manifest sync from the code registry

**Files:**
- Create: `src/lib/tax/capabilityManifest.ts`
- Test: `src/lib/tax/capabilityManifest.test.ts`

**Interfaces:**
- Consumes: `listRegisteredCapabilities(): Array<{ capability_key: string; kind: string; version: string }>` (Phase 1 registry, contract §1.5); `sync_engine_capabilities` RPC (Task 15).
- Produces: `syncEngineCapabilities(): Promise<number>` — consumed by the Studio "Sync capabilities" button (Task 21) and the AE/SA publish runbooks (Tasks 29/30).

- [ ] **Step 1: Write the failing test**

`src/lib/tax/capabilityManifest.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn().mockResolvedValue({ data: 6, error: null });
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('../regimes/registry', () => ({
  listRegisteredCapabilities: () => [
    { capability_key: 'simple_vat', kind: 'regime_adapter', version: '1.0.0' },
    { capability_key: 'gcc_return', kind: 'regime_adapter', version: '1.0.0' },
    { capability_key: 'zatca_ph1', kind: 'regime_adapter', version: '1.0.0' },
  ],
}));

import { syncEngineCapabilities } from './capabilityManifest';

describe('syncEngineCapabilities', () => {
  it('pushes the full code-registry capability list to the DB manifest', async () => {
    const count = await syncEngineCapabilities();
    expect(rpc).toHaveBeenCalledWith('sync_engine_capabilities', {
      p_capabilities: [
        { capability_key: 'simple_vat', kind: 'regime_adapter', version: '1.0.0' },
        { capability_key: 'gcc_return', kind: 'regime_adapter', version: '1.0.0' },
        { capability_key: 'zatca_ph1', kind: 'regime_adapter', version: '1.0.0' },
      ],
    });
    expect(count).toBe(6);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/tax/capabilityManifest.test.ts`
Expected: FAIL — `Cannot find module './capabilityManifest'`.

- [ ] **Step 3: Minimal implementation**

`src/lib/tax/capabilityManifest.ts`:
```typescript
// The honesty bridge (graft 2): the DB capability manifest is only ever a
// projection of what the CODE registry actually has registered. Never insert
// capability rows by hand — a pack must not claim an unimplemented capability.
import { supabase } from '../supabaseClient';
import { listRegisteredCapabilities } from '../regimes/registry';

export async function syncEngineCapabilities(): Promise<number> {
  const capabilities = listRegisteredCapabilities();
  const { data, error } = await supabase.rpc('sync_engine_capabilities', {
    p_capabilities: capabilities,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/tax/capabilityManifest.test.ts` — expected: PASS.
Run: `npm run typecheck` — expected: 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/capabilityManifest.ts src/lib/tax/capabilityManifest.test.ts
git commit -m "feat(tax): capability manifest sync — code registry is the only source (P3)"
```

**WP-4 verification:** all post-probes green; `npm run typecheck` (0); `npm run test` (green). PR: `feat/p3-publish-governance` with the migration template.

---

# WP-5 — Country Authoring Studio (branch: `feat/p3-country-studio`)

### Task 19: `countryPackService`

**Files:**
- Create: `src/lib/countryPackService.ts`
- Test: `src/lib/countryPackService.test.ts`

**Interfaces:**
- Consumes: all WP-4 RPCs; `runPublishGate` + `PackFixture` + `FixtureRunResult` (Phase 1 `src/lib/tax/publishGate.ts`); `syncEngineCapabilities` (Task 18); generated `Database` row types for `master_country_pack_versions`, `master_country_pack_tests`, `geo_country_tax_rates`, `master_document_requirements`, `master_einvoice_regimes`, `master_numbering_policies`.
- Produces (consumed by Tasks 21–25, 29, 30):
```typescript
export type PackVersionRow = Database['public']['Tables']['master_country_pack_versions']['Row'];
export type PackTestRow = Database['public']['Tables']['master_country_pack_tests']['Row'];
export type CountryTaxRateRow = Database['public']['Tables']['geo_country_tax_rates']['Row'];
export type DocumentRequirementRow = Database['public']['Tables']['master_document_requirements']['Row'];
export type EinvoiceRegimeRow = Database['public']['Tables']['master_einvoice_regimes']['Row'];
export type NumberingPolicyRow = Database['public']['Tables']['master_numbering_policies']['Row'];
export interface PackCountrySummary { countryId: string; code: string; name: string; taxSystem: string | null;
  configStatus: string; publishedVersion: number | null; openVersion: PackVersionRow | null;
  stalenessDays: number | null; nextReviewDate: string | null; }
export interface PublishGateResult { published: boolean; config_status: string;
  gate: { fixtures: { total: number; passed: number; stale: number };
          capabilities: { required: string[]; missing: string[] };
          dual_control: boolean;
          coverage: { standard_rate: boolean; invalid_requirement_conditions: number; numbering_over_max_length: number };
          blockers: string[]; }; }
export interface PackDetail { country: { id: string; code: string; name: string; taxSystem: string | null;
    configStatus: string; countryConfig: Record<string, unknown>;
    scalars: Record<string, unknown> };                       // allowlisted geo_countries facts (Facts tab pre-fill)
  versions: PackVersionRow[];
  rates: CountryTaxRateRow[]; requirements: DocumentRequirementRow[]; regimes: EinvoiceRegimeRow[];
  numbering: NumberingPolicyRow[]; tests: PackTestRow[]; }
export interface FixtureRunSummary { total: number; passed: number; results: FixtureRunResult[]; }
export async function listPackCountries(): Promise<PackCountrySummary[]>;
export async function getPackDetail(countryId: string): Promise<PackDetail>;
export async function createPackDraft(countryId: string, changelog: string): Promise<string>;
export async function submitPackForReview(packVersionId: string): Promise<void>;
export async function publishPack(countryId: string, version: number): Promise<PublishGateResult>;
export async function upsertTaxRate(row: Record<string, unknown>): Promise<string>;
export async function upsertRequirement(row: Record<string, unknown>): Promise<string>;
export async function upsertEinvoiceRegime(row: Record<string, unknown>): Promise<string>;
export async function upsertNumberingPolicy(row: Record<string, unknown>): Promise<string>;
export async function upsertPackTest(row: Record<string, unknown>): Promise<string>;
export async function updatePackFacts(countryId: string, scalars: Record<string, unknown>, config: Record<string, unknown>): Promise<void>;
export async function runPackFixtures(countryId: string, countryCode: string): Promise<FixtureRunSummary>;
```

- [ ] **Step 1: Write the failing test**

`src/lib/countryPackService.test.ts`:
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const fromResponses = new Map<string, unknown[]>();
vi.mock('./supabaseClient', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (table: string) => {
      const rows = fromResponses.get(table) ?? [];
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) chain[m] = vi.fn(self);
      (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
        resolve({ data: rows, error: null });
      return chain;
    },
  },
}));
const gateResults = [{ name: 'f1', pass: true, diffs: [], trace: null }];
vi.mock('./tax/publishGate', () => ({
  runPublishGate: vi.fn().mockResolvedValue({ pass: true, results: gateResults }),
}));

import { runPackFixtures, publishPack } from './countryPackService';

describe('countryPackService (P3)', () => {
  beforeEach(() => { rpc.mockReset(); fromResponses.clear(); });

  it('runPackFixtures replays fixtures through runPublishGate and records every result', async () => {
    fromResponses.set('master_country_pack_tests', [
      { id: 't1', name: 'f1', input_document: { kind: 'x' }, expected: { y: 1 } },
    ]);
    rpc.mockResolvedValue({ data: null, error: null });
    const summary = await runPackFixtures('country-1', 'AE');
    expect(summary).toEqual({ total: 1, passed: 1, results: gateResults });
    expect(rpc).toHaveBeenCalledWith('record_pack_test_result', {
      p_test_id: 't1',
      p_result: { pass: true, diffs: [], name: 'f1' },
    });
  });

  it('publishPack surfaces the RPC gate payload', async () => {
    const payload = { published: true, config_status: 'statutory_ready', gate: { blockers: [] } };
    rpc.mockResolvedValue({ data: payload, error: null });
    const result = await publishPack('country-1', 2);
    expect(rpc).toHaveBeenCalledWith('publish_country_pack', { p_country_id: 'country-1', p_version: 2 });
    expect(result).toEqual(payload);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/countryPackService.test.ts`
Expected: FAIL — `Cannot find module './countryPackService'`.

- [ ] **Step 3: Minimal implementation**

`src/lib/countryPackService.ts` (implement every export from the Produces block; the non-trivial bodies):
```typescript
import { supabase } from './supabaseClient';
import { runPublishGate, type PackFixture, type FixtureRunResult } from './tax/publishGate';
import type { Database } from '../types/database.types';

// … (type aliases + interfaces exactly as in the Produces block above) …

export async function listPackCountries(): Promise<PackCountrySummary[]> {
  const { data: countries, error } = await supabase
    .from('geo_countries')
    .select('id, code, name, tax_system, config_status')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  const { data: versions, error: vErr } = await supabase
    .from('master_country_pack_versions')
    .select('*')
    .order('version', { ascending: false });
  if (vErr) throw vErr;
  return (countries ?? []).map((c) => {
    const mine = (versions ?? []).filter((v) => v.country_id === c.id);
    const published = mine.find((v) => v.status === 'published') ?? null;
    const open = mine.find((v) => v.status === 'draft' || v.status === 'in_review') ?? null;
    return {
      countryId: c.id, code: c.code, name: c.name, taxSystem: c.tax_system,
      configStatus: c.config_status,
      publishedVersion: published?.version ?? null,
      openVersion: open,
      stalenessDays: published?.staleness_days ?? null,
      nextReviewDate: published?.next_review_date ?? null,
    };
  });
}

export async function getPackDetail(countryId: string): Promise<PackDetail> {
  const { data: country, error } = await supabase
    .from('geo_countries')
    .select('id, code, name, tax_system, config_status, country_config, currency_code, currency_symbol, decimal_places, tax_label, tax_number_label, default_tax_rate, locale_code, timezone, date_format, fiscal_year_start, language_code')
    .eq('id', countryId)
    .maybeSingle();
  if (error) throw error;
  if (!country) throw new Error(`getPackDetail: country ${countryId} not found`);
  const q = <T>(p: PromiseLike<{ data: T[] | null; error: unknown }>) =>
    p.then((r) => { if (r.error) throw r.error; return r.data ?? []; });
  const [versions, rates, requirements, regimes, numbering, tests] = await Promise.all([
    q(supabase.from('master_country_pack_versions').select('*').eq('country_id', countryId).order('version', { ascending: false })),
    q(supabase.from('geo_country_tax_rates').select('*').eq('country_id', countryId).is('deleted_at', null).order('sort_order')),
    q(supabase.from('master_document_requirements').select('*').eq('country_id', countryId)),
    q(supabase.from('master_einvoice_regimes').select('*').eq('country_id', countryId).is('deleted_at', null)),
    q(supabase.from('master_numbering_policies').select('*').eq('country_id', countryId).is('deleted_at', null)),
    q(supabase.from('master_country_pack_tests').select('*').eq('country_id', countryId)),
  ]);
  const c = country as Record<string, unknown>;
  return {
    country: { id: country.id, code: country.code, name: country.name, taxSystem: country.tax_system,
      configStatus: country.config_status, countryConfig: (country.country_config ?? {}) as Record<string, unknown>,
      scalars: {
        currency_code: c.currency_code, currency_symbol: c.currency_symbol, decimal_places: c.decimal_places,
        tax_system: country.tax_system, tax_label: c.tax_label, tax_number_label: c.tax_number_label,
        default_tax_rate: c.default_tax_rate, locale_code: c.locale_code, timezone: c.timezone,
        date_format: c.date_format, fiscal_year_start: c.fiscal_year_start, language_code: c.language_code,
      } },
    versions, rates, requirements, regimes, numbering, tests,
  };
}

async function rpcReturningString(name: string, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as string;
}
export const createPackDraft = (countryId: string, changelog: string) =>
  rpcReturningString('create_country_pack_draft', { p_country_id: countryId, p_changelog: changelog });
export async function submitPackForReview(packVersionId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_country_pack_for_review', { p_pack_version_id: packVersionId });
  if (error) throw error;
}
export async function publishPack(countryId: string, version: number): Promise<PublishGateResult> {
  const { data, error } = await supabase.rpc('publish_country_pack', { p_country_id: countryId, p_version: version });
  if (error) throw error;
  return data as PublishGateResult;
}
export const upsertTaxRate = (row: Record<string, unknown>) => rpcReturningString('upsert_country_tax_rate', { p_row: row });
export const upsertRequirement = (row: Record<string, unknown>) => rpcReturningString('upsert_document_requirement', { p_row: row });
export const upsertEinvoiceRegime = (row: Record<string, unknown>) => rpcReturningString('upsert_country_einvoice_regime', { p_row: row });
export const upsertNumberingPolicy = (row: Record<string, unknown>) => rpcReturningString('upsert_country_numbering_policy', { p_row: row });
export const upsertPackTest = (row: Record<string, unknown>) => rpcReturningString('upsert_country_pack_test', { p_row: row });
export async function updatePackFacts(countryId: string, scalars: Record<string, unknown>, config: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('update_country_pack_facts',
    { p_country_id: countryId, p_scalars: scalars, p_config: config });
  if (error) throw error;
}

/** Replays every DB-resident fixture through the shared runner and RECORDS each
 *  result — this is what makes gate part ① satisfiable. Mode: 'kernel' (pure
 *  kernel replay) — 'dry_run_rpc' requires a same-country tenant document context
 *  and is used from the Oman verification flow only (Architecture Decision 3). */
export async function runPackFixtures(countryId: string, countryCode: string): Promise<FixtureRunSummary> {
  const { data: tests, error } = await supabase
    .from('master_country_pack_tests')
    .select('*')
    .eq('country_id', countryId);
  if (error) throw error;
  const fixtures: PackFixture[] = (tests ?? []).map((t) => ({
    name: t.name, input_document: t.input_document as Record<string, unknown>,
    expected: t.expected as Record<string, unknown>,
  }));
  const outcome = await runPublishGate({ countryCode, fixtures, mode: 'kernel' });
  for (const t of tests ?? []) {
    const result = outcome.results.find((r) => r.name === t.name);
    const { error: recErr } = await supabase.rpc('record_pack_test_result', {
      p_test_id: t.id,
      p_result: { pass: result?.pass ?? false, diffs: result?.diffs ?? [], name: t.name },
    });
    if (recErr) throw recErr;
  }
  return { total: fixtures.length, passed: outcome.results.filter((r) => r.pass).length, results: outcome.results };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/countryPackService.test.ts` — expected: PASS.
Run: `npm run typecheck` — expected: 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/countryPackService.ts src/lib/countryPackService.test.ts
git commit -m "feat(studio): countryPackService — typed governance-RPC surface + fixture gate runner (P3)"
```

### Task 20: Query keys + routes + platform-admin nav

**Files:**
- Modify: `src/lib/queryKeys.ts` (append; existing pattern verified — e.g. `invoiceKeys` object literal with `as const` arrays)
- Modify: `src/App.tsx` (platform-admin route block at :287-299 — verified; append two routes)
- Modify: `src/components/layout/PlatformAdminLayout.tsx` — the `navItems: NavItem[]` array at `:14-23`; add the `Globe2` icon to the existing `lucide-react` import and insert one entry (exact edit in Step 3)

**Interfaces:**
- Produces: `countryPackKeys` query-key factory; routes `/platform-admin/countries` and `/platform-admin/countries/:countryId` — consumed by Tasks 21/23.

> **TDD exemption (pure wiring):** this task adds only query-key constants, two `<Route>` registrations, and one static nav entry — there is no behavior/branch to red-green. Per the plan's TDD rule it is annotated exempt; its safety net is the WP-end `npm run typecheck` (0) plus the WP-5 manual smoke (`/platform-admin/countries` renders — verification at the WP-5 footer). Each editable target below is an exact-line edit, not a grep-and-append.

- [ ] **Step 1: Add the query keys**

Append to `src/lib/queryKeys.ts`:
```typescript
export const countryPackKeys = {
  all: ['country-packs'] as const,
  list: () => [...countryPackKeys.all, 'list'] as const,
  detail: (countryId: string) => [...countryPackKeys.all, 'detail', countryId] as const,
};
```

- [ ] **Step 2: Add the routes**

In `src/App.tsx`, after the `notifications/dlq` route (:299), add:
```tsx
        <Route path="countries" lazy={page(() => import('./pages/platform-admin/CountryPacksPage'), 'CountryPacksPage')} />
        <Route path="countries/:countryId" lazy={page(() => import('./pages/platform-admin/CountryPackEditorPage'), 'CountryPackEditorPage')} />
```
(The pages are created in Tasks 21/23 — this task lands in the same PR; typecheck runs at WP end.)

- [ ] **Step 3: Add the nav entry (exact edit)**

In `src/components/layout/PlatformAdminLayout.tsx`, add `Globe2` to the existing `lucide-react` import, then insert the entry into `navItems` (`:14-23`) between the Notification DLQ entry (`:21`) and the Settings entry (`:22`):
```tsx
  { path: '/platform-admin/notifications/dlq', label: 'Notification DLQ', icon: AlertOctagon },
  { path: '/platform-admin/countries', label: 'Country Packs', icon: Globe2 },
  { path: '/platform-admin/settings', label: 'Settings', icon: Settings },
```
(The breadcrumb helper `getBreadcrumbs` at `:121` handles unknown segments generically — no change needed for the `/countries` path.)

- [ ] **Step 4: Verify + commit**

Run after Tasks 21+23 exist: `npm run typecheck` → 0.
```bash
git add src/lib/queryKeys.ts src/App.tsx src/components/layout/PlatformAdminLayout.tsx
git commit -m "feat(studio): country-pack routes, nav entry, query keys (P3)"
```

### Task 21: `CountryPacksPage` — list + staleness dashboard

**Files:**
- Create: `src/pages/platform-admin/CountryPacksPage.tsx`
- Test: `src/pages/platform-admin/CountryPacksPage.test.tsx`

**Interfaces:**
- Consumes: `listPackCountries`, `PackCountrySummary` (Task 19); `syncEngineCapabilities` (Task 18); `countryPackKeys` (Task 20); TanStack `useQuery`/`useMutation`; existing `Button` UI primitive; lucide `Globe2`, `RefreshCw`, `AlertTriangle`.
- Produces: `export const CountryPacksPage: React.FC` (named export — required by the `lazy={page(...)}` route pattern).

- [ ] **Step 1: Write the failing test**

`src/pages/platform-admin/CountryPacksPage.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/countryPackService', () => ({
  listPackCountries: vi.fn().mockResolvedValue([
    { countryId: 'c-om', code: 'OM', name: 'Oman', taxSystem: 'VAT', configStatus: 'statutory_ready',
      publishedVersion: 1, openVersion: null, stalenessDays: 0, nextReviewDate: '2026-12-01' },
    { countryId: 'c-sa', code: 'SA', name: 'Saudi Arabia', taxSystem: 'VAT', configStatus: 'formatting_ready',
      publishedVersion: null, openVersion: null, stalenessDays: 12, nextReviewDate: '2026-06-20' },
  ]),
}));
vi.mock('../../lib/tax/capabilityManifest', () => ({ syncEngineCapabilities: vi.fn().mockResolvedValue(6) }));

import { CountryPacksPage } from './CountryPacksPage';

describe('CountryPacksPage (P3)', () => {
  it('lists countries with config status and flags overdue packs in the staleness strip', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><CountryPacksPage /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Oman')).toBeInTheDocument();
    expect(screen.getByText('statutory_ready')).toBeInTheDocument();
    expect(screen.getByText(/overdue for review/i)).toBeInTheDocument();   // SA at 12 days
    expect(screen.getByRole('button', { name: /sync capabilities/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/pages/platform-admin/CountryPacksPage.test.tsx`
Expected: FAIL — `Cannot find module './CountryPacksPage'`.

- [ ] **Step 3: Minimal implementation**

`src/pages/platform-admin/CountryPacksPage.tsx`:
```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Globe2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { listPackCountries } from '../../lib/countryPackService';
import { syncEngineCapabilities } from '../../lib/tax/capabilityManifest';
import { countryPackKeys } from '../../lib/queryKeys';

const statusTone: Record<string, string> = {
  statutory_ready: 'bg-success-muted text-success',
  formatting_ready: 'bg-warning-muted text-warning',
  stub: 'bg-surface-muted text-slate-500',
};

export const CountryPacksPage: React.FC = () => {
  const { data: countries = [], isLoading } = useQuery({
    queryKey: countryPackKeys.list(),
    queryFn: listPackCountries,
  });
  const syncMutation = useMutation({ mutationFn: syncEngineCapabilities });
  const overdue = countries.filter((c) => (c.stalenessDays ?? 0) > 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Globe2 className="h-5 w-5 text-primary" /> Country Packs
        </h1>
        <Button variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {syncMutation.isPending ? 'Syncing…' : 'Sync capabilities'}
          {syncMutation.isSuccess ? ` (${syncMutation.data})` : ''}
        </Button>
      </div>

      {overdue.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning bg-warning-muted px-4 py-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4" />
          {overdue.length} pack{overdue.length > 1 ? 's' : ''} overdue for review:{' '}
          {overdue.map((c) => `${c.code} (${c.stalenessDays}d)`).join(', ')}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left">
            <tr>
              <th className="px-4 py-2">Country</th>
              <th className="px-4 py-2">Tax system</th>
              <th className="px-4 py-2">Config status</th>
              <th className="px-4 py-2">Published</th>
              <th className="px-4 py-2">Open version</th>
              <th className="px-4 py-2">Next review</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
            )}
            {countries.map((c) => (
              <tr key={c.countryId} className="border-t border-border hover:bg-surface-muted">
                <td className="px-4 py-2">
                  <Link to={`/platform-admin/countries/${c.countryId}`} className="font-medium text-primary hover:underline">
                    {c.name}
                  </Link>{' '}
                  <span className="text-xs text-slate-500">{c.code}</span>
                </td>
                <td className="px-4 py-2">{c.taxSystem ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${statusTone[c.configStatus] ?? statusTone.stub}`}>
                    {c.configStatus}
                  </span>
                </td>
                <td className="px-4 py-2">{c.publishedVersion ? `v${c.publishedVersion}` : '—'}</td>
                <td className="px-4 py-2">
                  {c.openVersion ? `v${c.openVersion.version} · ${c.openVersion.status}` : '—'}
                </td>
                <td className="px-4 py-2">
                  {c.nextReviewDate ?? '—'}
                  {(c.stalenessDays ?? 0) > 0 && (
                    <span className="ml-2 rounded bg-danger-muted px-1.5 py-0.5 text-xs text-danger">
                      {c.stalenessDays}d overdue
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/pages/platform-admin/CountryPacksPage.test.tsx` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/platform-admin/CountryPacksPage.tsx src/pages/platform-admin/CountryPacksPage.test.tsx
git commit -m "feat(studio): country pack list + staleness dashboard + capability sync (P3)"
```

### Task 22: `PackRowsTable` — generic pack-dimension CRUD grid

**Files:**
- Create: `src/components/platform-admin/country-packs/PackRowsTable.tsx`
- Test: `src/components/platform-admin/country-packs/PackRowsTable.test.tsx`

**Interfaces:**
- Produces:
```typescript
export interface PackColumn<Row> { key: string; label: string;
  render: (row: Row) => React.ReactNode;
  input?: { type: 'text' | 'number' | 'date' | 'select' | 'json'; options?: string[]; required?: boolean }; }
export interface PackRowsTableProps<Row extends { id: string }> {
  title: string; rows: Row[]; columns: PackColumn<Row>[];
  disabled: boolean;                       // true when there is no open draft
  onSave: (draft: Record<string, unknown>, existing: Row | null) => Promise<void>; }
export function PackRowsTable<Row extends { id: string }>(props: PackRowsTableProps<Row>): JSX.Element;
```
Consumed by Task 23's four tabs.

- [ ] **Step 1: Write the failing test**

`src/components/platform-admin/country-packs/PackRowsTable.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PackRowsTable, type PackColumn } from './PackRowsTable';

type Row = { id: string; component_code: string; rate: number };
const columns: PackColumn<Row>[] = [
  { key: 'component_code', label: 'Component', render: (r) => r.component_code, input: { type: 'text', required: true } },
  { key: 'rate', label: 'Rate', render: (r) => String(r.rate), input: { type: 'number', required: true } },
];

describe('PackRowsTable (P3)', () => {
  it('renders rows, opens the add form, and submits a draft to onSave', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PackRowsTable title="Rates" rows={[{ id: 'r1', component_code: 'VAT', rate: 5 }]}
                          columns={columns} disabled={false} onSave={onSave} />);
    expect(screen.getByText('VAT')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add row/i }));
    await userEvent.type(screen.getByLabelText('Component'), 'CGST');
    await userEvent.type(screen.getByLabelText('Rate'), '9');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith({ component_code: 'CGST', rate: 9 }, null);
  });

  it('disables mutation when there is no open draft', () => {
    render(<PackRowsTable title="Rates" rows={[]} columns={columns} disabled onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add row/i })).toBeDisabled();
    expect(screen.getByText(/create a draft to edit/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/platform-admin/country-packs/PackRowsTable.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

`src/components/platform-admin/country-packs/PackRowsTable.tsx`:
```tsx
import React, { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '../../ui/Button';
import { logger } from '../../../lib/logger';

export interface PackColumn<Row> {
  key: string;
  label: string;
  render: (row: Row) => React.ReactNode;
  input?: { type: 'text' | 'number' | 'date' | 'select' | 'json'; options?: string[]; required?: boolean };
}

export interface PackRowsTableProps<Row extends { id: string }> {
  title: string;
  rows: Row[];
  columns: PackColumn<Row>[];
  disabled: boolean;
  onSave: (draft: Record<string, unknown>, existing: Row | null) => Promise<void>;
}

export function PackRowsTable<Row extends { id: string }>({
  title, rows, columns, disabled, onSave,
}: PackRowsTableProps<Row>) {
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = columns.filter((c) => c.input);

  const open = (row: Row | null) => {
    setEditing(row);
    setAdding(row === null);
    setError(null);
    setDraft(row ? Object.fromEntries(editable.map((c) => [c.key, (row as Record<string, unknown>)[c.key]])) : {});
  };
  const close = () => { setEditing(null); setAdding(false); setDraft({}); };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft, editing);
      close();
    } catch (e) {
      logger.error(`PackRowsTable(${title}) save failed:`, e);
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: string, type: string, raw: string) =>
    setDraft((d) => ({
      ...d,
      [key]: type === 'number' ? Number(raw) : type === 'json' ? safeJson(raw) : raw,
    }));
  const safeJson = (raw: string): unknown => {
    try { return JSON.parse(raw); } catch { return raw; }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => open(null)}>
          <Plus className="mr-1 h-4 w-4" /> Add row
        </Button>
      </div>
      {disabled && <p className="text-xs text-slate-500">Create a draft to edit this dimension.</p>}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left">
            <tr>
              {columns.map((c) => <th key={c.key} className="px-3 py-2">{c.label}</th>)}
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-4 text-center text-slate-500">No rows</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                {columns.map((c) => <td key={c.key} className="px-3 py-1.5">{c.render(row)}</td>)}
                <td className="px-3 py-1.5">
                  <button aria-label={`Edit ${row.id}`} disabled={disabled}
                          className="text-slate-500 hover:text-primary disabled:opacity-40"
                          onClick={() => open(row)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(adding || editing) && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-4">
          {editable.map((c) => (
            <div key={c.key}>
              <label htmlFor={`prt-${c.key}`} className="mb-1 block text-sm font-medium">{c.label}</label>
              {c.input!.type === 'select' ? (
                <select id={`prt-${c.key}`} aria-label={c.label}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                        value={String(draft[c.key] ?? '')}
                        onChange={(e) => setField(c.key, 'text', e.target.value)}>
                  <option value="">—</option>
                  {c.input!.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : c.input!.type === 'json' ? (
                <textarea id={`prt-${c.key}`} aria-label={c.label} rows={4}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs"
                          value={typeof draft[c.key] === 'string' ? String(draft[c.key]) : JSON.stringify(draft[c.key] ?? null, null, 2)}
                          onChange={(e) => setField(c.key, 'json', e.target.value)} />
              ) : (
                <input id={`prt-${c.key}`} aria-label={c.label}
                       type={c.input!.type} required={c.input!.required}
                       className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                       value={String(draft[c.key] ?? '')}
                       onChange={(e) => setField(c.key, c.input!.type, e.target.value)} />
              )}
            </div>
          ))}
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/platform-admin/country-packs/PackRowsTable.test.tsx` — expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/platform-admin/country-packs/PackRowsTable.tsx src/components/platform-admin/country-packs/PackRowsTable.test.tsx
git commit -m "feat(studio): generic PackRowsTable CRUD grid (P3)"
```

### Task 23: `CountryPackEditorPage` — tabs over every pack dimension + reserved keys

**Files:**
- Create: `src/pages/platform-admin/CountryPackEditorPage.tsx`
- Create: `src/components/platform-admin/country-packs/PackFactsTab.tsx` (the "all pack dimensions" facts editor — formatting scalars + regime.* bindings + filing keys + rounding policy + amount-words scale)
- Test: `src/pages/platform-admin/CountryPackEditorPage.test.tsx`

**Interfaces:**
- Consumes: `getPackDetail`, `PackDetail`, all `upsert*` service functions **and `updatePackFacts`** (Task 19); `PackRowsTable`/`PackColumn` (Task 22); `PackFixturesTab` (Task 24); `PackPublishPanel` (Task 25); `countryPackKeys` (Task 20); `useParams` from react-router-dom; `Button` (`src/components/ui/Button`).
- Produces: `export const CountryPackEditorPage: React.FC`; `export const PackFactsTab: React.FC<{ detail: PackDetail; disabled: boolean; onChanged: () => void }>` (wires the otherwise-dead `updatePackFacts` RPC into the Studio); the reserved-key read-only surface for `compliance.audit_file_exports`, `custody.unclaimed_property`, `privacy.regime`.

- [ ] **Step 1: Write the failing test**

`src/pages/platform-admin/CountryPackEditorPage.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/countryPackService', () => ({
  getPackDetail: vi.fn().mockResolvedValue({
    country: { id: 'c-sa', code: 'SA', name: 'Saudi Arabia', taxSystem: 'VAT',
      configStatus: 'formatting_ready',
      countryConfig: { 'regime.tax': 'simple_vat', 'custody.unclaimed_property': { holding_period_days: 90 } },
      scalars: { currency_code: 'SAR', decimal_places: 2, timezone: 'Asia/Riyadh' } },
    versions: [{ id: 'v1', version: 1, status: 'draft', authored_by: 'u1', approved_by: null,
      changelog: 'SA launch', next_review_date: '2026-12-29', staleness_days: null,
      content_updated_at: '2026-07-02T10:00:00Z', country_id: 'c-sa' }],
    rates: [{ id: 'r1', component_code: 'VAT', component_label: 'VAT 15%', tax_category: 'standard',
      rate: 15, valid_from: '2020-07-01', valid_to: null, subdivision_id: null }],
    requirements: [], regimes: [], numbering: [], tests: [],
  }),
  createPackDraft: vi.fn(), submitPackForReview: vi.fn(), publishPack: vi.fn(),
  upsertTaxRate: vi.fn(), upsertRequirement: vi.fn(), upsertEinvoiceRegime: vi.fn(),
  upsertNumberingPolicy: vi.fn(), upsertPackTest: vi.fn(), updatePackFacts: vi.fn(),
  runPackFixtures: vi.fn(),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u2' } }) }));

import { CountryPackEditorPage } from './CountryPackEditorPage';
import { updatePackFacts } from '../../lib/countryPackService';   // the mocked vi.fn()

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/platform-admin/countries/c-sa']}>
        <Routes><Route path="/platform-admin/countries/:countryId" element={<CountryPackEditorPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('CountryPackEditorPage (P3)', () => {
  it('shows the rates tab by default with the seeded SA rate', async () => {
    renderPage();
    expect(await screen.findByText('Saudi Arabia')).toBeInTheDocument();
    expect(screen.getByText('VAT 15%')).toBeInTheDocument();
  });
  it('reserved-keys tab shows E8/E9/privacy dimensions read-only, marked Reserved', async () => {
    renderPage();
    await screen.findByText('Saudi Arabia');
    await userEvent.click(screen.getByRole('tab', { name: /reserved/i }));
    expect(screen.getByText('custody.unclaimed_property')).toBeInTheDocument();
    expect(screen.getByText('compliance.audit_file_exports')).toBeInTheDocument();
    expect(screen.getByText('privacy.regime')).toBeInTheDocument();
    expect(screen.getAllByText(/reserved — not consumed yet/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /add row/i })).not.toBeInTheDocument();
  });
  it('Facts tab pre-fills regime/scalars and authors regime + rounding via updatePackFacts', async () => {
    renderPage();
    await screen.findByText('Saudi Arabia');
    await userEvent.click(screen.getByRole('tab', { name: /facts/i }));
    // pre-filled: regime.tax from countryConfig, currency_code from scalars
    expect(screen.getByLabelText('regime.tax')).toHaveValue('simple_vat');
    expect(screen.getByLabelText('currency_code')).toHaveValue('SAR');
    // author SA line-level rounding, then save
    await userEvent.selectOptions(screen.getByLabelText('tax.rounding_policy.level'), 'line');
    await userEvent.click(screen.getByRole('button', { name: /save facts/i }));
    expect(updatePackFacts).toHaveBeenCalledWith(
      'c-sa',
      expect.objectContaining({ currency_code: 'SAR' }),
      expect.objectContaining({
        'regime.tax': 'simple_vat',
        'tax.rounding_policy': { mode: 'half_up', level: 'line' },
      }),
    );
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/pages/platform-admin/CountryPackEditorPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

`src/pages/platform-admin/CountryPackEditorPage.tsx`:
```tsx
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPackDetail, upsertTaxRate, upsertRequirement, upsertEinvoiceRegime, upsertNumberingPolicy,
  type CountryTaxRateRow, type DocumentRequirementRow, type EinvoiceRegimeRow, type NumberingPolicyRow,
} from '../../lib/countryPackService';
import { countryPackKeys } from '../../lib/queryKeys';
import { PackRowsTable, type PackColumn } from '../../components/platform-admin/country-packs/PackRowsTable';
import { PackFactsTab } from '../../components/platform-admin/country-packs/PackFactsTab';
import { PackFixturesTab } from '../../components/platform-admin/country-packs/PackFixturesTab';
import { PackPublishPanel } from '../../components/platform-admin/country-packs/PackPublishPanel';

const TABS = ['Rates', 'Facts', 'Requirements', 'E-invoice', 'Numbering', 'Fixtures', 'Reserved', 'Lifecycle'] as const;
type Tab = (typeof TABS)[number];

// Owner decisions E8/E9 + E6: created in the Phase-1 pack schema, surfaced here
// so authors SEE the dimensions exist — but no consumer ships until Phase 6, so
// the Studio must not let them leak into tenants yet.
const RESERVED_KEYS = ['compliance.audit_file_exports', 'custody.unclaimed_property', 'privacy.regime'] as const;

export const CountryPackEditorPage: React.FC = () => {
  const { countryId = '' } = useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('Rates');

  const { data: detail } = useQuery({
    queryKey: countryPackKeys.detail(countryId),
    queryFn: () => getPackDetail(countryId),
    enabled: !!countryId,
  });
  if (!detail) return <div className="p-6 text-slate-500">Loading…</div>;

  const openVersion = detail.versions.find((v) => v.status === 'draft' || v.status === 'in_review') ?? null;
  const disabled = !openVersion;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: countryPackKeys.detail(countryId) });
  const withCountry = (draft: Record<string, unknown>, existing: { id: string } | null) => ({
    ...draft, country_id: countryId, ...(existing ? { id: existing.id } : {}),
  });

  const rateColumns: PackColumn<CountryTaxRateRow>[] = [
    { key: 'component_code', label: 'Component', render: (r) => r.component_code, input: { type: 'text', required: true } },
    { key: 'component_label', label: 'Label', render: (r) => r.component_label, input: { type: 'text', required: true } },
    { key: 'tax_category', label: 'Category', render: (r) => r.tax_category,
      input: { type: 'select', options: ['standard', 'reduced', 'zero', 'exempt'], required: true } },
    { key: 'rate', label: 'Rate %', render: (r) => String(r.rate), input: { type: 'number', required: true } },
    { key: 'valid_from', label: 'Valid from', render: (r) => r.valid_from, input: { type: 'date', required: true } },
    { key: 'valid_to', label: 'Valid to', render: (r) => r.valid_to ?? '—', input: { type: 'date' } },
  ];
  const requirementColumns: PackColumn<DocumentRequirementRow>[] = [
    { key: 'doc_type', label: 'Doc type', render: (r) => r.doc_type,
      input: { type: 'select', options: ['quote', 'invoice', 'credit_note', 'stock_sale'], required: true } },
    { key: 'field_key', label: 'Field', render: (r) => r.field_key,
      input: { type: 'select', required: true, options: [
        'buyer_tax_number', 'buyer_address', 'place_of_supply_subdivision_id', 'supply_date',
        'seller_tax_number', 'line.item_code', 'line.unit_code'] } },
    { key: 'level', label: 'Level', render: (r) => r.level, input: { type: 'select', options: ['block', 'warn'], required: true } },
    { key: 'condition', label: 'Condition (closed vocabulary)', render: (r) => JSON.stringify(r.condition), input: { type: 'json' } },
    { key: 'message_i18n', label: 'Message i18n', render: (r) => JSON.stringify(r.message_i18n), input: { type: 'json' } },
  ];
  const regimeColumns: PackColumn<EinvoiceRegimeRow>[] = [
    { key: 'code', label: 'Code', render: (r) => r.code, input: { type: 'text', required: true } },
    { key: 'regime_class', label: 'Class', render: (r) => r.regime_class,
      input: { type: 'select', required: true, options: [
        'render_artifact', 'clearance_api', 'chained_document', 'certified_software', 'filing_api'] } },
    { key: 'adapter_key', label: 'Adapter', render: (r) => r.adapter_key ?? '—', input: { type: 'text', required: true } },
    { key: 'mandatory_from', label: 'Mandatory from', render: (r) => r.mandatory_from ?? '—', input: { type: 'date' } },
    { key: 'thresholds', label: 'Thresholds', render: (r) => JSON.stringify(r.thresholds), input: { type: 'json' } },
  ];
  const numberingColumns: PackColumn<NumberingPolicyRow>[] = [
    { key: 'scope', label: 'Scope', render: (r) => r.scope, input: { type: 'text', required: true } },
    { key: 'format_template', label: 'Template', render: (r) => r.format_template ?? 'legacy prefix', input: { type: 'text' } },
    { key: 'reset_basis', label: 'Reset', render: (r) => r.reset_basis,
      input: { type: 'select', options: ['never', 'calendar_year', 'fiscal_year'], required: true } },
    { key: 'fiscal_year_anchor', label: 'FY anchor', render: (r) => r.fiscal_year_anchor ?? '—', input: { type: 'text' } },
    { key: 'max_length', label: 'Max len', render: (r) => (r.max_length != null ? String(r.max_length) : '—'), input: { type: 'number' } },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{detail.country.name}</h1>
        <p className="text-sm text-slate-500">
          {detail.country.code} · {detail.country.taxSystem ?? 'no tax system'} · {detail.country.configStatus}
          {openVersion && <> · editing v{openVersion.version} ({openVersion.status})</>}
        </p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t}
                  className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-primary font-medium text-primary' : 'text-slate-500'}`}
                  onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Rates' && (
        <PackRowsTable title="Effective-dated tax rates (geo_country_tax_rates)" rows={detail.rates}
          columns={rateColumns} disabled={disabled}
          onSave={async (d, e) => { await upsertTaxRate(withCountry(d, e)); invalidate(); }} />
      )}
      {tab === 'Facts' && (
        <PackFactsTab detail={detail} disabled={disabled} onChanged={invalidate} />
      )}
      {tab === 'Requirements' && (
        <PackRowsTable title="Document requirements (master_document_requirements)" rows={detail.requirements}
          columns={requirementColumns} disabled={disabled}
          onSave={async (d, e) => { await upsertRequirement(withCountry(d, e)); invalidate(); }} />
      )}
      {tab === 'E-invoice' && (
        <PackRowsTable title="E-invoice regimes (master_einvoice_regimes)" rows={detail.regimes}
          columns={regimeColumns} disabled={disabled}
          onSave={async (d, e) => { await upsertEinvoiceRegime(withCountry(d, e)); invalidate(); }} />
      )}
      {tab === 'Numbering' && (
        <PackRowsTable title="Numbering policies (master_numbering_policies)" rows={detail.numbering}
          columns={numberingColumns} disabled={disabled}
          onSave={async (d, e) => { await upsertNumberingPolicy(withCountry(d, e)); invalidate(); }} />
      )}
      {tab === 'Fixtures' && (
        <PackFixturesTab detail={detail} disabled={disabled} onChanged={invalidate} />
      )}
      {tab === 'Reserved' && (
        <div className="space-y-3">
          {RESERVED_KEYS.map((key) => (
            <div key={key} className="rounded-lg border border-dashed border-border bg-surface-muted p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{key}</span>
                <span className="rounded bg-warning-muted px-2 py-0.5 text-xs text-warning">
                  Reserved — not consumed yet (Phase 6)
                </span>
              </div>
              <pre className="mt-2 overflow-x-auto text-xs text-slate-500">
                {JSON.stringify(detail.country.countryConfig[key] ?? null, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
      {tab === 'Lifecycle' && (
        <PackPublishPanel detail={detail} onChanged={invalidate} />
      )}
    </div>
  );
};
```

Then create the Facts editor it renders. `src/components/platform-admin/country-packs/PackFactsTab.tsx`:
```tsx
import React, { useState } from 'react';
import { updatePackFacts, type PackDetail } from '../../../lib/countryPackService';
import { Button } from '../../ui/Button';

type FieldKind = 'text' | 'number' | 'select';
interface FactField { key: string; group: 'scalar' | 'config'; label: string; kind: FieldKind; options?: string[]; }

// Allowlist mirrors update_country_pack_facts(p_scalars) columns + the country-
// locked config keys a pack author sets. Units (master_unit_codes) are edited on
// the global Phase-2 surface, not per-pack here (see this WP's Non-goal note).
const FACT_FIELDS: FactField[] = [
  { key: 'currency_code', group: 'scalar', label: 'Currency code', kind: 'text' },
  { key: 'currency_symbol', group: 'scalar', label: 'Currency symbol', kind: 'text' },
  { key: 'decimal_places', group: 'scalar', label: 'Decimal places', kind: 'number' },
  { key: 'tax_system', group: 'scalar', label: 'Tax system', kind: 'select', options: ['VAT', 'GST', 'SALES_TAX', 'NONE'] },
  { key: 'tax_label', group: 'scalar', label: 'Tax label', kind: 'text' },
  { key: 'tax_number_label', group: 'scalar', label: 'Tax number label', kind: 'text' },
  { key: 'default_tax_rate', group: 'scalar', label: 'Default tax rate (display only)', kind: 'number' },
  { key: 'locale_code', group: 'scalar', label: 'Locale', kind: 'text' },
  { key: 'timezone', group: 'scalar', label: 'Timezone (IANA)', kind: 'text' },
  { key: 'date_format', group: 'scalar', label: 'Date format', kind: 'text' },
  { key: 'fiscal_year_start', group: 'scalar', label: 'Fiscal year start (MM-DD)', kind: 'text' },
  { key: 'language_code', group: 'scalar', label: 'Language code', kind: 'text' },
  { key: 'regime.tax', group: 'config', label: 'Tax regime', kind: 'select', options: ['simple_vat', 'in_gst', 'us_sales_tax'] },
  { key: 'regime.einvoice', group: 'config', label: 'E-invoice regime', kind: 'select', options: ['no_einvoice', 'zatca_ph1', 'zatca_ph2', 'in_irn', 'uk_mtd'] },
  { key: 'regime.numbering', group: 'config', label: 'Numbering regime', kind: 'select', options: ['prefix_numbering', 'in_fiscal_numbering'] },
  { key: 'regime.documents', group: 'config', label: 'Document profile', kind: 'select', options: ['generic_invoice', 'gcc_tax_invoice', 'in_gst_invoice', 'us_plain_invoice'] },
  { key: 'regime.payroll', group: 'config', label: 'Payroll pack', kind: 'select', options: ['none', 'om_payroll'] },
  { key: 'tax.filing_frequency', group: 'config', label: 'Filing frequency', kind: 'select', options: ['monthly', 'quarterly', 'annual'] },
  { key: 'tax.period_anchor', group: 'config', label: 'Period anchor (MM-DD)', kind: 'text' },
  { key: 'tax.return_composer', group: 'config', label: 'Return composer', kind: 'select', options: ['gcc_return', 'gstr', 'us_jurisdiction_remit', 'uk_mtd_9box'] },
  { key: 'format.amount_words_scale', group: 'config', label: 'Amount-in-words scale', kind: 'select', options: ['western', 'indian'] },
];
const ROUNDING_MODES = ['half_up', 'half_even'] as const;
const ROUNDING_LEVELS = ['line', 'document'] as const;

export const PackFactsTab: React.FC<{ detail: PackDetail; disabled: boolean; onChanged: () => void }> = ({ detail, disabled, onChanged }) => {
  const cfg = detail.country.countryConfig ?? {};
  const scalars = detail.country.scalars ?? {};
  const initial: Record<string, string> = {};
  for (const f of FACT_FIELDS) {
    const raw = f.group === 'scalar' ? scalars[f.key] : cfg[f.key];
    initial[f.key] = raw == null ? '' : String(raw);
  }
  const rp = (cfg['tax.rounding_policy'] ?? {}) as { mode?: string; level?: string; cash_increment?: number };
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [rMode, setRMode] = useState<string>(rp.mode ?? 'half_up');
  const [rLevel, setRLevel] = useState<string>(rp.level ?? 'document');
  const [rCash, setRCash] = useState<string>(rp.cash_increment == null ? '' : String(rp.cash_increment));
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const outScalars: Record<string, unknown> = {};
      const outConfig: Record<string, unknown> = {};
      for (const f of FACT_FIELDS) {
        const v = values[f.key];
        if (v === '') continue;                                   // blank = leave unchanged (RPC COALESCEs scalars)
        const parsed: unknown = f.kind === 'number' ? Number(v) : v;
        if (f.group === 'scalar') outScalars[f.key] = parsed;
        else outConfig[f.key] = parsed;
      }
      const rounding: Record<string, unknown> = { mode: rMode, level: rLevel };
      if (rCash !== '') rounding.cash_increment = Number(rCash);
      outConfig['tax.rounding_policy'] = rounding;
      await updatePackFacts(detail.country.id, outScalars, outConfig);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Formatting scalars, jurisdiction regime bindings, filing shape, rounding policy and amount-in-words scale.
        The <code>regime.*</code> / <code>tax.*</code> keys are country-locked — a tenant can never override them.
        Blank leaves a value unchanged.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {FACT_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">{f.label} <span className="font-mono text-xs text-slate-400">{f.key}</span></span>
            {f.kind === 'select' ? (
              <select aria-label={f.key} disabled={disabled} value={values[f.key]}
                      className="rounded border border-border px-2 py-1" onChange={(e) => set(f.key, e.target.value)}>
                <option value="">—</option>
                {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input aria-label={f.key} disabled={disabled} value={values[f.key]}
                     type={f.kind === 'number' ? 'number' : 'text'}
                     className="rounded border border-border px-2 py-1" onChange={(e) => set(f.key, e.target.value)} />
            )}
          </label>
        ))}
      </div>
      <fieldset className="rounded border border-border p-3">
        <legend className="px-1 text-sm font-medium">tax.rounding_policy</legend>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-sm">Mode
            <select aria-label="tax.rounding_policy.mode" disabled={disabled} value={rMode}
                    className="rounded border border-border px-2 py-1" onChange={(e) => setRMode(e.target.value)}>
              {ROUNDING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">Level
            <select aria-label="tax.rounding_policy.level" disabled={disabled} value={rLevel}
                    className="rounded border border-border px-2 py-1" onChange={(e) => setRLevel(e.target.value)}>
              {ROUNDING_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">Cash increment
            <input aria-label="tax.rounding_policy.cash_increment" disabled={disabled} value={rCash} type="number"
                   className="rounded border border-border px-2 py-1" onChange={(e) => setRCash(e.target.value)} />
          </label>
        </div>
      </fieldset>
      <Button variant="primary" disabled={disabled || saving} onClick={save}>
        {saving ? 'Saving…' : 'Save facts'}
      </Button>
    </div>
  );
};
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/pages/platform-admin/CountryPackEditorPage.test.tsx` — expected: PASS (3 tests — rates-default, reserved-keys, Facts-tab — after Tasks 24/25 exist; build Tasks 22–25 before running this WP's suite together if executing strictly in order, or stub the two components first and un-stub when they land).

- [ ] **Step 5: Commit**

```bash
git add src/pages/platform-admin/CountryPackEditorPage.tsx src/components/platform-admin/country-packs/PackFactsTab.tsx src/pages/platform-admin/CountryPackEditorPage.test.tsx
git commit -m "feat(studio): pack editor — Facts tab (scalars/regime/rounding) + all dimensions + reserved keys (P3)"
```

### Task 24: `PackFixturesTab` — golden fixtures + gate runner

**Files:**
- Create: `src/components/platform-admin/country-packs/PackFixturesTab.tsx`
- Test: `src/components/platform-admin/country-packs/PackFixturesTab.test.tsx`

**Interfaces:**
- Consumes: `PackDetail`, `upsertPackTest`, `runPackFixtures`, `FixtureRunSummary` (Task 19); `PackRowsTable` (Task 22).
- Produces: `PackFixturesTab: React.FC<{ detail: PackDetail; disabled: boolean; onChanged: () => void }>`.

- [ ] **Step 1: Write the failing test**

`src/components/platform-admin/country-packs/PackFixturesTab.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const runPackFixtures = vi.fn().mockResolvedValue({
  total: 1, passed: 0,
  results: [{ name: 'sa_standard', pass: false,
    diffs: [{ path: 'totals.taxTotal', expected: 150, actual: 149.99 }], trace: null }],
});
vi.mock('../../../lib/countryPackService', () => ({
  runPackFixtures: (...a: unknown[]) => runPackFixtures(...a),
  upsertPackTest: vi.fn(),
}));

import { PackFixturesTab } from './PackFixturesTab';

const detail = {
  country: { id: 'c-sa', code: 'SA', name: 'Saudi Arabia', taxSystem: 'VAT',
    configStatus: 'formatting_ready', countryConfig: {} },
  versions: [], rates: [], requirements: [], regimes: [], numbering: [],
  tests: [{ id: 't1', name: 'sa_standard', input_document: {}, expected: {},
    last_run_at: null, last_result: null, country_id: 'c-sa', pack_version_id: 'v1' }],
} as never;

describe('PackFixturesTab (P3)', () => {
  it('runs fixtures via runPackFixtures and renders per-fixture diffs', async () => {
    render(<PackFixturesTab detail={detail} disabled={false} onChanged={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /run fixtures/i }));
    await waitFor(() => expect(runPackFixtures).toHaveBeenCalledWith('c-sa', 'SA'));
    expect(await screen.findByText(/0 \/ 1 passed/i)).toBeInTheDocument();
    expect(screen.getByText('totals.taxTotal')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/platform-admin/country-packs/PackFixturesTab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

`src/components/platform-admin/country-packs/PackFixturesTab.tsx`:
```tsx
import React, { useState } from 'react';
import { Play, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../../ui/Button';
import { PackRowsTable, type PackColumn } from './PackRowsTable';
import {
  runPackFixtures, upsertPackTest,
  type PackDetail, type PackTestRow, type FixtureRunSummary,
} from '../../../lib/countryPackService';
import { logger } from '../../../lib/logger';

interface Props { detail: PackDetail; disabled: boolean; onChanged: () => void }

export const PackFixturesTab: React.FC<Props> = ({ detail, disabled, onChanged }) => {
  const [summary, setSummary] = useState<FixtureRunSummary | null>(null);
  const [running, setRunning] = useState(false);

  const columns: PackColumn<PackTestRow>[] = [
    { key: 'name', label: 'Fixture', render: (r) => r.name, input: { type: 'text', required: true } },
    { key: 'input_document', label: 'Input document', render: (r) => <code className="text-xs">{JSON.stringify(r.input_document).slice(0, 60)}…</code>, input: { type: 'json', required: true } },
    { key: 'expected', label: 'Expected', render: (r) => <code className="text-xs">{JSON.stringify(r.expected).slice(0, 60)}…</code>, input: { type: 'json', required: true } },
    { key: 'last_result', label: 'Last result',
      render: (r) => {
        const pass = (r.last_result as { pass?: boolean } | null)?.pass;
        if (pass === undefined || pass === null) return <span className="text-slate-500">not run</span>;
        return pass
          ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> pass</span>
          : <span className="inline-flex items-center gap-1 text-danger"><XCircle className="h-4 w-4" /> fail</span>;
      } },
  ];

  const run = async () => {
    setRunning(true);
    try {
      setSummary(await runPackFixtures(detail.country.id, detail.country.code));
      onChanged();
    } catch (e) {
      logger.error('Fixture run failed:', e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Golden fixtures are the pack's audit evidence. Every content edit stales the results;
          the publish gate refuses stale or failing fixtures.
        </p>
        <Button onClick={() => void run()} disabled={running || detail.tests.length === 0}>
          <Play className="mr-2 h-4 w-4" /> {running ? 'Running…' : 'Run fixtures'}
        </Button>
      </div>

      {summary && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${summary.passed === summary.total ? 'border-success bg-success-muted text-success' : 'border-danger bg-danger-muted text-danger'}`}>
          {summary.passed} / {summary.total} passed
          {summary.results.filter((r) => !r.pass).map((r) => (
            <div key={r.name} className="mt-2">
              <div className="font-medium">{r.name}</div>
              <table className="mt-1 w-full text-xs">
                <tbody>
                  {r.diffs.map((d, i) => (
                    <tr key={i}>
                      <td className="pr-3 font-mono">{d.path}</td>
                      <td className="pr-3">expected {JSON.stringify(d.expected)}</td>
                      <td>got {JSON.stringify(d.actual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <PackRowsTable title="Fixtures (master_country_pack_tests)" rows={detail.tests}
        columns={columns} disabled={disabled}
        onSave={async (d, e) => {
          await upsertPackTest({ ...d, country_id: detail.country.id, ...(e ? { id: e.id } : {}) });
          onChanged();
        }} />
    </div>
  );
};
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/platform-admin/country-packs/PackFixturesTab.test.tsx` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/platform-admin/country-packs/PackFixturesTab.tsx src/components/platform-admin/country-packs/PackFixturesTab.test.tsx
git commit -m "feat(studio): fixtures tab with gate runner + recorded results (P3)"
```

### Task 25: `PackPublishPanel` — dual-control lifecycle UI

**Files:**
- Create: `src/components/platform-admin/country-packs/PackPublishPanel.tsx`
- Test: `src/components/platform-admin/country-packs/PackPublishPanel.test.tsx`

**Interfaces:**
- Consumes: `PackDetail`, `createPackDraft`, `submitPackForReview`, `publishPack`, `PublishGateResult` (Task 19); `useAuth` (existing — `user.id` is the current admin's auth uid).
- Produces: `PackPublishPanel: React.FC<{ detail: PackDetail; onChanged: () => void }>` — publish button DISABLED when `openVersion.authored_by === user.id` (dual control in the UI, mirroring the DB CHECK + RPC guard).

- [ ] **Step 1: Write the failing test**

`src/components/platform-admin/country-packs/PackPublishPanel.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const publishPack = vi.fn();
vi.mock('../../../lib/countryPackService', () => ({
  createPackDraft: vi.fn(), submitPackForReview: vi.fn(),
  publishPack: (...a: unknown[]) => publishPack(...a),
}));
const authUser = { id: 'author-1' };
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }));

import { PackPublishPanel } from './PackPublishPanel';

const detailWith = (authoredBy: string) => ({
  country: { id: 'c-sa', code: 'SA', name: 'Saudi Arabia', taxSystem: 'VAT',
    configStatus: 'formatting_ready', countryConfig: {} },
  versions: [{ id: 'v1', country_id: 'c-sa', version: 2, status: 'in_review',
    authored_by: authoredBy, approved_by: null, changelog: 'SA pack',
    next_review_date: null, staleness_days: null, content_updated_at: null }],
  rates: [], requirements: [], regimes: [], numbering: [], tests: [],
}) as never;

describe('PackPublishPanel dual control (P3)', () => {
  it('disables publish for the pack author with an explanation', () => {
    render(<PackPublishPanel detail={detailWith('author-1')} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: /publish v2/i })).toBeDisabled();
    expect(screen.getByText(/dual control/i)).toBeInTheDocument();
  });
  it('enables publish for a different admin', () => {
    render(<PackPublishPanel detail={detailWith('someone-else')} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: /publish v2/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/platform-admin/country-packs/PackPublishPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

`src/components/platform-admin/country-packs/PackPublishPanel.tsx`:
```tsx
import React, { useState } from 'react';
import { GitBranch, Send, ShieldCheck } from 'lucide-react';
import { Button } from '../../ui/Button';
import { useAuth } from '../../../contexts/AuthContext';
import {
  createPackDraft, submitPackForReview, publishPack,
  type PackDetail, type PublishGateResult,
} from '../../../lib/countryPackService';
import { logger } from '../../../lib/logger';

interface Props { detail: PackDetail; onChanged: () => void }

export const PackPublishPanel: React.FC<Props> = ({ detail, onChanged }) => {
  const { user } = useAuth();
  const [changelog, setChangelog] = useState('');
  const [gate, setGate] = useState<PublishGateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = detail.versions.find((v) => v.status === 'draft' || v.status === 'in_review') ?? null;
  const isAuthor = !!open && open.authored_by === user?.id;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); onChanged(); }
    catch (e) { logger.error('Pack lifecycle action failed:', e); setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-2 text-sm font-semibold">Version history</h3>
        <ul className="space-y-1 text-sm">
          {detail.versions.map((v) => (
            <li key={v.id} className="flex items-center gap-2">
              <span className="font-mono">v{v.version}</span>
              <span className="rounded bg-surface-muted px-2 py-0.5 text-xs">{v.status}</span>
              <span className="text-slate-500">{v.changelog}</span>
            </li>
          ))}
        </ul>
      </div>

      {!open && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="pack-changelog" className="mb-1 block text-sm font-medium">Changelog</label>
            <input id="pack-changelog" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                   value={changelog} onChange={(e) => setChangelog(e.target.value)} />
          </div>
          <Button disabled={busy || !changelog}
                  onClick={() => void act(async () => { await createPackDraft(detail.country.id, changelog); })}>
            <GitBranch className="mr-2 h-4 w-4" /> New draft
          </Button>
        </div>
      )}

      {open?.status === 'draft' && (
        <Button disabled={busy}
                onClick={() => void act(async () => { await submitPackForReview(open.id); })}>
          <Send className="mr-2 h-4 w-4" /> Submit v{open.version} for review
        </Button>
      )}

      {open?.status === 'in_review' && (
        <div className="space-y-2">
          <Button disabled={busy || isAuthor}
                  onClick={() => void act(async () => { setGate(await publishPack(detail.country.id, open.version)); })}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Publish v{open.version}
          </Button>
          {isAuthor && (
            <p className="text-sm text-warning">
              Dual control: you authored this pack — a different platform admin must publish it
              (enforced again by the DB CHECK approved_by ≠ authored_by).
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {gate && (
        <div className={`rounded-lg border p-4 text-sm ${gate.published ? 'border-success bg-success-muted' : 'border-danger bg-danger-muted'}`}>
          <p className="font-medium">
            {gate.published ? `Published — config_status: ${gate.config_status}` : 'Publish blocked by the gate'}
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>Fixtures: {gate.gate.fixtures.passed}/{gate.gate.fixtures.total} passed, {gate.gate.fixtures.stale} stale</li>
            <li>Capabilities missing: {gate.gate.capabilities.missing.length === 0 ? 'none' : gate.gate.capabilities.missing.join(', ')}</li>
            <li>Standard rate coverage: {String(gate.gate.coverage.standard_rate)}</li>
            {gate.gate.blockers.map((b) => <li key={b} className="text-danger">✗ {b}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/platform-admin/country-packs` — expected: PASS (all component tests).
Run: `npm run typecheck && npm run lint` — expected: clean (this also validates Task 20's routes now that all pages exist).

- [ ] **Step 5: Commit**

```bash
git add src/components/platform-admin/country-packs/PackPublishPanel.tsx src/components/platform-admin/country-packs/PackPublishPanel.test.tsx
git commit -m "feat(studio): dual-control publish panel with gate result rendering (P3)"
```

**WP-5 verification:** `npm run typecheck` (0), `npm run test` (green), `npm run lint` (clean), manual smoke: `/platform-admin/countries` renders the country list as a platform admin. PR: `feat/p3-country-studio`.

---

# WP-6 — CLDR locale-facts import job (branch: `feat/p3-cldr-import`)

### Task 26: CLDR mapping + operator seed generator

**Files:**
- Create: `scripts/country-engine/cldrMapping.ts`
- Create: `scripts/country-engine/import-cldr.test.ts` (runs in the `scripts` vitest project — `vitest.config.scripts.ts` already includes `scripts/**/*.test.ts`)
- Generated output (operator-reviewed, committed): `supabase/seeds/cldr_locale_facts.operator.sql`

**Interfaces:**
- Consumes: CLDR JSON at generation time only — `https://unpkg.com/cldr-core@45.0.0/supplemental/currencyData.json` and `.../weekData.json` (network fetch inside the GENERATE=1 path, mirroring the existing `geo:build-seed` convention; no npm package added).
- Produces: `mapTerritoryFacts(currencyData, weekData): Map<string, TerritoryFacts>`; `territoryFactsToSql(facts): string`; `cldrDayToDow(day: string): number` (emits the Country Engine registry convention **0=Sun..6=Sat** used by `datetime.weekend_days` / `datetime.week_starts_on` at `src/lib/country/registry.ts:163-186` — NOT ISO 1..7, whose Sunday=7 would violate the registry's `.min(0).max(6)` schema) — and the operator seed file that fills ONLY missing `geo_countries` facts (`currency_code` when NULL; `datetime.weekend_days` / `datetime.week_starts_on` `country_config` keys when absent). This is the spec's "CLDR/ISO-4217 import job seeds ~190 countries in one pass" entry point; the operator applies the reviewed SQL via `mcp__supabase__apply_migration`.

- [ ] **Step 1: Write the failing test**

`scripts/country-engine/import-cldr.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cldrDayToDow, mapTerritoryFacts, territoryFactsToSql } from './cldrMapping';

const GENERATE = process.env.GENERATE === '1';

const currencyData = { supplemental: { currencyData: { region: {
  AE: [{ AED: { _from: '1973-05-19' } }],
  OM: [{ OMR: { _from: '1972-11-11' } }],
} } } };
const weekData = { supplemental: { weekData: {
  firstDay: { '001': 'mon', AE: 'sat', OM: 'sat' },
  weekendStart: { '001': 'sat', AE: 'sat', OM: 'fri' },
  weekendEnd: { '001': 'sun', AE: 'sun', OM: 'sat' },
} } };

describe('cldrMapping', () => {
  it('maps CLDR day names to registry dow numbers (0=Sun..6=Sat)', () => {
    expect(cldrDayToDow('mon')).toBe(1);
    expect(cldrDayToDow('fri')).toBe(5);
    expect(cldrDayToDow('sat')).toBe(6);
    expect(cldrDayToDow('sun')).toBe(0);
  });
  it('extracts the ACTIVE currency and weekend facts per territory', () => {
    const facts = mapTerritoryFacts(currencyData, weekData);
    expect(facts.get('OM')).toEqual({
      code: 'OM', currencyCode: 'OMR', weekendDays: [5, 6], weekStartsOn: 6,
    });
    expect(facts.get('AE')).toEqual({
      code: 'AE', currencyCode: 'AED', weekendDays: [6, 0], weekStartsOn: 6,
    });
  });
  it('emits fill-only-when-missing SQL (COALESCE + key-absence guards)', () => {
    const sql = territoryFactsToSql([...mapTerritoryFacts(currencyData, weekData).values()]);
    expect(sql).toContain("WHERE code = 'OM' AND deleted_at IS NULL");
    expect(sql).toContain('COALESCE(currency_code');
    expect(sql).toContain("country_config ? 'datetime.weekend_days'");
    expect(sql).not.toContain('DELETE');
    expect(sql).not.toContain('DROP');
  });
});

describe('CLDR seed generation (network — GENERATE=1 only)', () => {
  it.runIf(GENERATE)('fetches live CLDR and writes the operator seed', async () => {
    const fetchJson = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return res.json();
    };
    const [cur, week] = await Promise.all([
      fetchJson('https://unpkg.com/cldr-core@45.0.0/supplemental/currencyData.json'),
      fetchJson('https://unpkg.com/cldr-core@45.0.0/supplemental/weekData.json'),
    ]);
    const facts = mapTerritoryFacts(cur, week);
    expect(facts.size).toBeGreaterThan(150);
    const sql = `-- GENERATED by scripts/country-engine/import-cldr.test.ts (GENERATE=1).\n`
      + `-- Fill-only-when-missing locale facts from CLDR 45 (currencyData + weekData).\n`
      + `-- OPERATOR: review, then apply via mcp__supabase__apply_migration.\n\n`
      + territoryFactsToSql([...facts.values()]);
    writeFileSync('supabase/seeds/cldr_locale_facts.operator.sql', sql);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run --config vitest.config.scripts.ts scripts/country-engine/import-cldr.test.ts`
Expected: FAIL — `Cannot find module './cldrMapping'`.

- [ ] **Step 3: Minimal implementation**

`scripts/country-engine/cldrMapping.ts`:
```typescript
// Pure CLDR → geo_countries fact mapping. Network stays in the GENERATE path of
// the test; this module is deterministic and unit-tested offline.
export interface TerritoryFacts {
  code: string;           // ISO-3166 alpha-2 (geo_countries.code)
  currencyCode: string | null;
  weekendDays: number[];  // registry dow, 0=Sun..6=Sat (matches datetime.weekend_days)
  weekStartsOn: number;   // registry dow, 0=Sun..6=Sat (matches datetime.week_starts_on)
}

// Country Engine convention (registry.ts:163-186): 0=Sun..6=Sat — NOT ISO 1..7.
// Sunday MUST be 0, not 7, or datetime.weekend_days/.week_starts_on fail the
// registry's z.number().int().min(0).max(6) schema on every Sunday-inclusive nation.
const DAY_TO_DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
export function cldrDayToDow(day: string): number {
  const dow = DAY_TO_DOW[day];
  if (dow === undefined) throw new Error(`cldrDayToDow: unknown CLDR day '${day}'`);  // NOT `!dow` — 0 (Sunday) is valid
  return dow;
}

type CurrencyData = { supplemental: { currencyData: { region: Record<string, Array<Record<string, { _from?: string; _to?: string }>>> } } };
type WeekData = { supplemental: { weekData: { firstDay: Record<string, string>; weekendStart: Record<string, string>; weekendEnd: Record<string, string> } } };

function activeCurrency(entries: Array<Record<string, { _from?: string; _to?: string }>>): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    for (const [code, span] of Object.entries(entries[i])) {
      if (!span._to) return code;   // open-ended = the territory's current tender
    }
  }
  return null;
}

export function mapTerritoryFacts(currencyData: unknown, weekData: unknown): Map<string, TerritoryFacts> {
  const cur = (currencyData as CurrencyData).supplemental.currencyData.region;
  const week = (weekData as WeekData).supplemental.weekData;
  const worldFirst = week.firstDay['001'] ?? 'mon';
  const worldWs = week.weekendStart['001'] ?? 'sat';
  const worldWe = week.weekendEnd['001'] ?? 'sun';
  const out = new Map<string, TerritoryFacts>();
  for (const [territory, entries] of Object.entries(cur)) {
    if (!/^[A-Z]{2}$/.test(territory)) continue;   // skip numeric/world territories
    const ws = cldrDayToDow(week.weekendStart[territory] ?? worldWs);
    const we = cldrDayToDow(week.weekendEnd[territory] ?? worldWe);
    const weekend: number[] = [];
    // Walk forward in the 0..6 ring (…Fri=5, Sat=6, Sun=0…) so AE Sat→Sun = [6,0].
    for (let d = ws; ; d = (d + 1) % 7) { weekend.push(d); if (d === we) break; if (weekend.length > 7) break; }
    out.set(territory, {
      code: territory,
      currencyCode: activeCurrency(entries),
      weekendDays: weekend,
      weekStartsOn: cldrDayToDow(week.firstDay[territory] ?? worldFirst),
    });
  }
  return out;
}

export function territoryFactsToSql(facts: TerritoryFacts[]): string {
  return facts.map((f) => {
    const weekendJson = JSON.stringify(f.weekendDays);
    const currencyExpr = f.currencyCode ? `COALESCE(currency_code, '${f.currencyCode}')` : 'currency_code';
    return [
      `UPDATE geo_countries SET`,
      `  currency_code = ${currencyExpr},`,
      `  country_config = country_config`,
      `    || (CASE WHEN country_config ? 'datetime.weekend_days' THEN '{}'::jsonb`,
      `             ELSE jsonb_build_object('datetime.weekend_days', '${weekendJson}'::jsonb) END)`,
      `    || (CASE WHEN country_config ? 'datetime.week_starts_on' THEN '{}'::jsonb`,
      `             ELSE jsonb_build_object('datetime.week_starts_on', ${f.weekStartsOn}) END)`,
      `WHERE code = '${f.code}' AND deleted_at IS NULL;`,
    ].join('\n');
  }).join('\n\n') + '\n';
}
```
Add the npm script to `package.json` beside `geo:build-seed`:
```json
"cldr:build-seed": "GENERATE=1 vitest run --config vitest.config.scripts.ts scripts/country-engine/import-cldr.test.ts",
```

- [ ] **Step 4: Run tests, verify pass; generate + review the seed**

Run: `npx vitest run --config vitest.config.scripts.ts scripts/country-engine/import-cldr.test.ts` — expected: PASS (3 offline tests, network test skipped).
Run: `npm run cldr:build-seed` — expected: writes `supabase/seeds/cldr_locale_facts.operator.sql`. Manually diff-review it (spot-check OM weekend `[5,6]` = Fri/Sat, AE `[6,0]` = Sat/Sun per current CLDR in the registry's 0=Sun..6=Sat convention — GCC weekends moved to Sat/Sun in several states; the DATA decides, not this plan). Applying it to the live DB is an OPERATOR step recorded as its own manifest row when performed.

- [ ] **Step 5: Commit**

```bash
git add scripts/country-engine/cldrMapping.ts scripts/country-engine/import-cldr.test.ts package.json supabase/seeds/cldr_locale_facts.operator.sql
git commit -m "feat(country-engine): CLDR locale-facts import job — fill-only operator seed (P3)"
```

**WP-6 verification:** offline suite green; generated seed reviewed. PR: `feat/p3-cldr-import`.

---

# WP-7 — AE/SA packs + zatca_ph1 + retire the hardcode (branch: `feat/p3-ae-sa-zatca`)

### Task 27: `sha256Hex` + `zatca_ph1` EInvoicingTransport plugin

**Files:**
- Create: `src/lib/tax/hash.ts` (SKIP creating if Phase 1 already shipped a sync `sha256Hex` — check `grep -rn "sha256Hex" src/lib | grep -v test`; if present, import it instead). This is THE shared hash helper; Phase 4/5 transports import `sha256Hex` from this exact path.
- Create: `src/lib/regimes/zatca_ph1/index.ts`
- Test: `src/lib/regimes/zatca_ph1/zatcaPh1.test.ts` (covers hash.ts known-answer too)
- Modify: the Phase-1 plugin bootstrap (same file as Task 5's registration) — register the transport.

**Interfaces:**
- Consumes: `buildZatcaTlvBase64(fields: ZatcaInvoiceFields): string` (`src/lib/pdf/engine/zatcaQr.ts:34`, interface at :14 — fields `sellerName, vatNumber, timestamp, total, vatAmount`, verified); `EInvoicingTransport`, `IssuedDocumentSnapshot` from `src/lib/regimes/types.ts` (Phase 1). If Phase 1's `IssuedDocumentSnapshot` lacks any of `sellerName, sellerTaxNumber, issuedAt, totalAmount, taxAmount, currency, documentType, documentId, documentNumber, meta`, extend the interface ADDITIVELY in `types.ts` in this task to exactly:
```typescript
export interface IssuedDocumentSnapshot {
  documentType: TaxDocumentType;
  documentId: string;
  documentNumber: string | null;
  sellerName: string;
  sellerTaxNumber: string | null;
  issuedAt: string;              // ISO timestamp of the tax point
  currency: string;
  totalAmount: number;           // document currency, gross
  taxAmount: number;             // document currency
  meta: Record<string, unknown>;
}
```
- Produces: `sha256Hex(input: string | Uint8Array): string` (pure, sync); `zatcaPh1Transport: EInvoicingTransport` (key `'zatca_ph1'`, version `'1.0.0'`, regimeClass `'render_artifact'`, artifactType `'zatca_phase1_tlv_qr'`) — consumed by Task 28's adapter and registered as capability `zatca_ph1`.

- [ ] **Step 1: Write the failing test**

`src/lib/regimes/zatca_ph1/zatcaPh1.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../tax/hash';
import { buildZatcaTlvBase64 } from '../../pdf/engine/zatcaQr';
import { zatcaPh1Transport } from './index';
import type { IssuedDocumentSnapshot } from '../types';

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 known answer for "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('zatcaPh1Transport', () => {
  const doc: IssuedDocumentSnapshot = {
    documentType: 'invoice', documentId: 'inv-1', documentNumber: 'INVO-0042',
    sellerName: 'SPACE DATA RECOVERY', sellerTaxNumber: '310123456700003',
    issuedAt: '2026-07-02T09:00:00.000Z', currency: 'SAR',
    totalAmount: 1150, taxAmount: 150, meta: {},
  };
  it('is a render_artifact regime producing the exact Phase-1 TLV payload + sha256', () => {
    const artifact = zatcaPh1Transport.buildArtifact(doc);
    const expectedPayload = buildZatcaTlvBase64({
      sellerName: 'SPACE DATA RECOVERY', vatNumber: '310123456700003',
      timestamp: '2026-07-02T09:00:00.000Z', total: '1150.00', vatAmount: '150.00',
    });
    expect(zatcaPh1Transport.regimeClass).toBe('render_artifact');
    expect(artifact.artifactType).toBe('zatca_phase1_tlv_qr');
    expect(artifact.payload).toBe(expectedPayload);
    expect(artifact.payloadHash).toBe(sha256Hex(expectedPayload));
  });
  it('refuses to build without a seller VAT number (a non-registered seller cannot emit a "compliant" KSA QR)', () => {
    expect(() => zatcaPh1Transport.buildArtifact({ ...doc, sellerTaxNumber: null })).toThrow(/seller tax number/i);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/zatca_ph1/zatcaPh1.test.ts`
Expected: FAIL — `Cannot find module '../../tax/hash'` (or `./index`).

- [ ] **Step 3: Minimal implementation**

`src/lib/tax/hash.ts` (pure sync SHA-256 — `crypto.subtle` is async and `EInvoicingTransport.buildArtifact` is sync by contract; no npm package):
```typescript
/* Minimal synchronous SHA-256 (FIPS 180-4) over a UTF-8 string or raw bytes, hex output. */
export function sha256Hex(input: string | Uint8Array): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 8) >> 6 << 6) + 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  new DataView(padded.buffer).setUint32(padded.length - 4, bitLen >>> 0);
  new DataView(padded.buffer).setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  for (let i = 0; i < padded.length; i += 64) {
    const view = new DataView(padded.buffer, i, 64);
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}
```
`src/lib/regimes/zatca_ph1/index.ts`:
```typescript
// ZATCA Phase-1 (simplified tax invoice TLV QR) — regime row #1. render_artifact
// class: the artifact is produced at render/issuance from frozen document fields;
// no authority round-trip. Replaces the einvoiceRouting.ts country hardcode.
import { buildZatcaTlvBase64 } from '../../pdf/engine/zatcaQr';
import { sha256Hex } from '../../tax/hash';
import type { EInvoicingTransport, IssuedDocumentSnapshot } from '../types';

export const zatcaPh1Transport: EInvoicingTransport = {
  key: 'zatca_ph1',
  version: '1.0.0',
  regimeClass: 'render_artifact',
  buildArtifact(doc: IssuedDocumentSnapshot) {
    if (!doc.sellerTaxNumber) {
      throw new Error('zatca_ph1: seller tax number is required to emit a ZATCA Phase-1 QR');
    }
    const payload = buildZatcaTlvBase64({
      sellerName: doc.sellerName,
      vatNumber: doc.sellerTaxNumber,
      timestamp: doc.issuedAt,
      total: doc.totalAmount.toFixed(2),
      vatAmount: doc.taxAmount.toFixed(2),
    });
    return { artifactType: 'zatca_phase1_tlv_qr', payload, payloadHash: sha256Hex(payload) };
  },
};
```
Register in the Phase-1 plugin bootstrap: `registerRegimePlugin('einvoice', zatcaPh1Transport);`

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/zatca_ph1/zatcaPh1.test.ts` — expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/hash.ts src/lib/regimes/zatca_ph1 && git add -u src/lib/regimes
git commit -m "feat(regimes): zatca_ph1 render_artifact transport wrapping the TLV builder (P3)"
```

### Task 28: Regime-routed QR — retire `einvoiceRouting.ts`

**Files:**
- Modify: `src/lib/pdf/engine/countryConfig.ts` (`ResolvedCountryFacts` interface at :7-16) — add `einvoiceRegimeKey: string`
- Modify: `src/lib/pdf/countryFactsService.ts` (`getResolvedCountryFacts` at :13; current select at :19-23) — resolve the regime key
- Modify: `src/lib/pdf/engine/adapters/invoiceAdapter.ts` — delete `normalizeSaudi` (:38-46) and the `shouldEmitZatcaQr` import (:18); replace the QR block (:289-317) with regime-key routing; `toEngineData` (exported at :69) gains the facts-provided key (Phase 2 already threads `ResolvedCountryFacts` into the adapters — thread `einvoiceRegimeKey` through the same parameter)
- **Delete:** `src/lib/pdf/engine/einvoiceRouting.ts` and its colocated test (locate: `ls src/lib/pdf/engine/einvoiceRouting*`)
- Test: extend the adapter's existing parity test file (locate: `grep -rln "shouldEmitZatcaQr\|zatcaPayload" src/lib/pdf/engine --include="*.test.ts"`)

**Interfaces:**
- Consumes: `zatcaPh1Transport` (Task 27) via `resolveEInvoicingTransport('zatca_ph1')` (Phase 1 registry); `master_einvoice_regimes` (rows exist for SA after Task 30 — until then the resolver returns `'no_einvoice'` and no QR emits, which is correct: the artifact is DATA-gated).
- Produces: `ResolvedCountryFacts.einvoiceRegimeKey: string`; zero remaining references to `einvoiceRouting`/`normalizeSaudi` in `src/`.

- [ ] **Step 1: Write the failing test**

In the adapter test file located above, add:
```typescript
describe('regime-routed e-invoice QR (P3)', () => {
  it('emits the TLV payload only when facts.einvoiceRegimeKey is zatca_ph1', () => {
    const base = buildAdapterInput();                    // the file's existing fixture builder
    const withRegime = toEngineData({ ...base, facts: { ...base.facts, einvoiceRegimeKey: 'zatca_ph1' } });
    const withoutRegime = toEngineData({ ...base, facts: { ...base.facts, einvoiceRegimeKey: 'no_einvoice' } });
    expect(withRegime.zatcaPayload).toBeTruthy();
    expect(withoutRegime.zatcaPayload).toBeNull();
  });
  it('the routing module is gone', async () => {
    await expect(import('../einvoiceRouting')).rejects.toThrow();
  });
});
```
(Adapt the fixture spread to the file's actual `toEngineData` argument shape — the assertion contract is: regime key in ⇒ payload out; `no_einvoice` ⇒ null; module deleted.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/pdf/engine/adapters` — expected: FAIL (`einvoiceRegimeKey` unknown / payload still emitted by country-string matching).

- [ ] **Step 3: Implement**

1. `countryConfig.ts` — extend the interface:
```typescript
export interface ResolvedCountryFacts {
  // …existing fields (code, taxSystem, taxLabel, taxInvoiceRequired, languageCode, decimalPlaces, dateFormat)…
  /** Adapter key of the active e-invoice regime row (master_einvoice_regimes,
   *  mandatory_from <= today), or 'no_einvoice'. Routes statutory artifacts by
   *  REGIME, never by country-string matching. */
  einvoiceRegimeKey: string;
}
```
2. `countryFactsService.ts` — after the existing `geo_countries` fetch succeeds, add:
```typescript
  const today = new Date().toISOString().slice(0, 10);
  const { data: regime } = await supabase
    .from('master_einvoice_regimes')
    .select('adapter_key, mandatory_from')
    .eq('country_id', countryId)
    .is('deleted_at', null)
    .lte('mandatory_from', today)
    .order('mandatory_from', { ascending: false })
    .limit(1)
    .maybeSingle();
```
and include `einvoiceRegimeKey: regime?.adapter_key ?? 'no_einvoice'` in the returned object.
3. `invoiceAdapter.ts` — delete `normalizeSaudi` (:38-46), delete the `shouldEmitZatcaQr` import (:18), and replace the block at :289-317 with:
```typescript
  // ---- E-invoice artifact (regime-routed, P3) -------------------------------
  // Routed by the country pack's master_einvoice_regimes row resolved into
  // facts.einvoiceRegimeKey — never by country-string matching (D11 → data).
  // The tax bar still gates whether seller VAT identification is present at all.
  let zatcaPayload: string | null = null;
  if (config.taxBar?.enabled && facts?.einvoiceRegimeKey === 'zatca_ph1') {
    const sellerName =
      companySettings.basic_info?.legal_name || companySettings.basic_info?.company_name || '';
    const vatNumber =
      (config.taxBar.source === 'manual' ? config.taxBar.value : companySettings.basic_info?.vat_number) || '';
    if (sellerName && vatNumber) {
      const transport = resolveEInvoicingTransport('zatca_ph1');
      const artifact = transport.buildArtifact({
        documentType: 'invoice',
        documentId: invoiceData.id ?? '',
        documentNumber: invoiceData.invoice_number ?? null,
        sellerName,
        sellerTaxNumber: vatNumber,
        issuedAt: invoiceData.invoice_date
          ? new Date(invoiceData.invoice_date).toISOString()
          : new Date().toISOString(),
        currency: '',            // TLV Phase-1 carries no currency field; totals are document-currency strings
        totalAmount,
        taxAmount,
        meta: {},
      });
      zatcaPayload = typeof artifact.payload === 'string' ? artifact.payload : null;
    }
  }
```
with imports `import { resolveEInvoicingTransport } from '../../../regimes/registry';` (adjust relative depth) and `facts` being the `ResolvedCountryFacts | null` the Phase-2 wiring already passes into `toEngineData`.
4. Delete the files:
```bash
git rm src/lib/pdf/engine/einvoiceRouting.ts
git rm src/lib/pdf/engine/einvoiceRouting.test.ts 2>/dev/null || true
```
5. Fix any remaining importer: `grep -rn "einvoiceRouting\|normalizeSaudi\|shouldEmitZatcaQr" src/` must return zero rows (update `sampleData.ts` / `previewRecord.ts` / `tenantPreviewContext.ts` fixture objects to carry `einvoiceRegimeKey: 'no_einvoice'` where they construct `ResolvedCountryFacts`).

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/pdf/engine` — expected: PASS (parity + golden suites untouched for non-SA fixtures; SA fixtures updated to the regime key input).
Run: `npm run typecheck` — expected: 0. Run: `grep -rn "einvoiceRouting" src/ | wc -l` — expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib/pdf
git commit -m "feat(pdf): regime-routed ZATCA QR via zatca_ph1 transport; delete einvoiceRouting hardcode (P3)"
```

### Task 29: AE pack — author + gate + publish (runbook with recorded evidence)

**Files:**
- Create: `scripts/country-engine/publish-ae-pack.md` (the executed runbook, committed with recorded outputs)
- Create: `src/lib/regimes/simple_vat/fixtures/ae_standard_invoice.json`, `src/lib/regimes/simple_vat/fixtures/ae_zero_rated_export.json`

**Interfaces:**
- Consumes: every WP-4/WP-5 artifact; `syncEngineCapabilities` (Task 18); a SECOND platform-admin account for dual control (create one via the existing `user-management` edge function / platform-admin user flow BEFORE starting — the approver must be a different `auth.uid()`).
- Produces: AE `statutory_ready` through the governed pipeline; fixtures resident in BOTH homes (repo + `master_country_pack_tests`).

- [ ] **Step 1: Author the repo fixtures**

`src/lib/regimes/simple_vat/fixtures/ae_standard_invoice.json`:
```json
{
  "name": "ae_standard_rate_invoice",
  "input_document": {
    "documentType": "invoice", "countryCode": "AE", "taxInclusive": false, "documentDiscount": 0,
    "lines": [{ "lineItemId": null, "description": "HDD logical recovery", "quantity": 1,
      "unitPrice": 1000, "lineDiscount": 0, "unitCode": "C62", "itemCode": null,
      "treatment": "standard", "treatmentReasonCode": null }]
  },
  "expected": {
    "rollups": [{ "componentCode": "VAT", "rate": 5, "taxableBase": 1000, "taxAmount": 50 }],
    "totals": { "taxableBase": 1000, "taxTotal": 50, "grandTotal": 1050 }
  }
}
```
`src/lib/regimes/simple_vat/fixtures/ae_zero_rated_export.json`:
```json
{
  "name": "ae_zero_rated_export_of_services",
  "input_document": {
    "documentType": "invoice", "countryCode": "AE", "taxInclusive": false, "documentDiscount": 0,
    "lines": [{ "lineItemId": null, "description": "Remote recovery — export of services", "quantity": 1,
      "unitPrice": 2000, "lineDiscount": 0, "unitCode": "C62", "itemCode": null,
      "treatment": "zero_rated", "treatmentReasonCode": "EXPORT_SERVICES" }]
  },
  "expected": {
    "rollups": [{ "componentCode": "VAT", "rate": 0, "taxableBase": 2000, "taxAmount": 0 }],
    "totals": { "taxableBase": 2000, "taxTotal": 0, "grandTotal": 2000 },
    "notations": [{ "code": "EXPORT_SERVICES" }]
  }
}
```
Run: `npx vitest run src/lib/regimes` — expected: the Phase-1 fixture runner picks the new files up and passes (`simple_vat` computes both).

- [ ] **Step 2: Execute the runbook (record every output into `publish-ae-pack.md`)**

As platform admin A (author), through the Studio UI or equivalent `mcp__supabase__execute_sql` RPC calls:
```sql
-- 0. capability manifest current (or click "Sync capabilities" in the Studio):
--    from the app: syncEngineCapabilities()  → expect count >= number of registered plugins
-- 1. draft
SELECT create_country_pack_draft((SELECT id FROM geo_countries WHERE code='AE'),
  'AE launch pack: VAT 5% + zero-rated export, GCC 3-box quarterly, TRN requirements');
-- 2. verify/stamp the Phase-1 seeded rates onto this pack (idempotent upserts):
SELECT upsert_country_tax_rate(jsonb_build_object(
  'country_id', (SELECT id FROM geo_countries WHERE code='AE'),
  'component_code','VAT','component_label','VAT 5%','tax_category','standard',
  'rate',5.0000,'valid_from','2018-01-01'));
SELECT upsert_country_tax_rate(jsonb_build_object(
  'country_id', (SELECT id FROM geo_countries WHERE code='AE'),
  'component_code','VAT','component_label','VAT 0% (zero-rated)','tax_category','zero',
  'rate',0,'valid_from','2018-01-01'));
-- 3. requirements (TRN both parties on B2B — level block):
SELECT upsert_document_requirement(jsonb_build_object(
  'country_id', (SELECT id FROM geo_countries WHERE code='AE'),
  'doc_type','invoice','field_key','buyer_tax_number','level','block',
  'condition', '{"all":[{"fact":"buyer_is_business","op":"eq","value":true}]}'::jsonb,
  'message_i18n', '{"en":"Buyer TRN is required on a B2B tax invoice.","ar":"الرقم الضريبي للمشتري مطلوب."}'::jsonb));
-- 4. fixtures into the DB home (paste the two repo fixture JSONs verbatim):
SELECT upsert_country_pack_test(jsonb_build_object(
  'country_id', (SELECT id FROM geo_countries WHERE code='AE'),
  'name','ae_standard_rate_invoice',
  'input_document','<input_document JSON from the repo fixture>'::jsonb,
  'expected','<expected JSON from the repo fixture>'::jsonb));
SELECT upsert_country_pack_test(jsonb_build_object(
  'country_id', (SELECT id FROM geo_countries WHERE code='AE'),
  'name','ae_zero_rated_export_of_services',
  'input_document','<input_document JSON from the repo fixture>'::jsonb,
  'expected','<expected JSON from the repo fixture>'::jsonb));
```
Then in the Studio (as admin A): Fixtures tab → **Run fixtures** → expect 2/2 passed. Lifecycle tab → **Submit for review**.

- [ ] **Step 3: Publish as admin B (dual control) + verify**

As platform admin B in the Studio: Lifecycle → **Publish v1** → expect `published: true, config_status: 'statutory_ready'`. Record the gate JSON. Negative evidence first: attempt publish as admin A → expect the dual-control error. Then verify:
```sql
SELECT code, config_status FROM geo_countries WHERE code='AE';
-- EXPECT: statutory_ready
SELECT version, status, authored_by <> approved_by AS dual_control_held
FROM master_country_pack_versions
WHERE country_id = (SELECT id FROM geo_countries WHERE code='AE') AND status='published';
-- EXPECT: 1 row, dual_control_held = true
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/regimes/simple_vat/fixtures/ae_standard_invoice.json src/lib/regimes/simple_vat/fixtures/ae_zero_rated_export.json scripts/country-engine/publish-ae-pack.md
git commit -m "feat(packs): AE pack authored + published statutory_ready through the full gate (P3)"
```

### Task 30: SA pack — zatca_ph1 regime row #1 + publish

**Files:**
- Create: `scripts/country-engine/publish-sa-pack.md` (executed runbook with recorded outputs)
- Create: `src/lib/regimes/simple_vat/fixtures/sa_standard_invoice.json`
- Create: `src/lib/regimes/simple_vat/fixtures/sa_multiline_line_rounding.json` (the multi-line fixture that DISTINGUISHES line-level from document-level rounding — proves SA's `tax.rounding_policy` `level:'line'` pack data actually took effect)
- Modify: `supabase/migrations.manifest.md` (M3-9 data row — the regime insert is performed through the governed RPC but recorded in the manifest as `phase3_sa_zatca_ph1_regime_row` for traceability, classification `Additive (data)`)

**Interfaces:**
- Consumes: Task 27 (`zatca_ph1` capability registered + synced), Task 28 (adapter reads the regime), WP-4 RPCs (incl. `update_country_pack_facts` from Task 14), second admin for dual control.
- Produces: SA `statutory_ready`; `master_einvoice_regimes` row #1 (`code 'zatca_ph1'`, `regime_class 'render_artifact'`, `adapter_key 'zatca_ph1'`, `mandatory_from '2021-12-04'`); SA `geo_countries.country_config['tax.rounding_policy'] = {mode:'half_up', level:'line'}` (spec line 729 — SA = simple_vat **+ line-level rounding policy DATA**); SA invoices emit the TLV QR through the regime path (proving the Task-28 retirement end-to-end).

- [ ] **Step 1: Repo fixture**

`src/lib/regimes/simple_vat/fixtures/sa_standard_invoice.json`:
```json
{
  "name": "sa_standard_rate_invoice",
  "input_document": {
    "documentType": "invoice", "countryCode": "SA", "taxInclusive": false, "documentDiscount": 0,
    "lines": [{ "lineItemId": null, "description": "SSD chip-off recovery", "quantity": 1,
      "unitPrice": 1000, "lineDiscount": 0, "unitCode": "C62", "itemCode": null,
      "treatment": "standard", "treatmentReasonCode": null }]
  },
  "expected": {
    "rollups": [{ "componentCode": "VAT", "rate": 15, "taxableBase": 1000, "taxAmount": 150 }],
    "totals": { "taxableBase": 1000, "taxTotal": 150, "grandTotal": 1150 }
  }
}
```

`src/lib/regimes/simple_vat/fixtures/sa_multiline_line_rounding.json` (SAR 2dp; two lines at 10.10 each — per-line VAT `10.10 × 15% = 1.515` rounds **half_up** to `1.52`, Σ = `3.04`; the document-level alternative `20.20 × 15% = 3.030 → 3.03` is ruled out, so this fixture FAILS unless SA's `tax.rounding_policy` `level:'line'` is in effect):
```json
{
  "name": "sa_multiline_line_rounding",
  "input_document": {
    "documentType": "invoice", "countryCode": "SA", "taxInclusive": false, "documentDiscount": 0,
    "lines": [
      { "lineItemId": null, "description": "Recovery labour hour A", "quantity": 1,
        "unitPrice": 10.10, "lineDiscount": 0, "unitCode": "C62", "itemCode": null,
        "treatment": "standard", "treatmentReasonCode": null },
      { "lineItemId": null, "description": "Recovery labour hour B", "quantity": 1,
        "unitPrice": 10.10, "lineDiscount": 0, "unitCode": "C62", "itemCode": null,
        "treatment": "standard", "treatmentReasonCode": null }
    ]
  },
  "expected": {
    "rollups": [{ "componentCode": "VAT", "rate": 15, "taxableBase": 20.20, "taxAmount": 3.04 }],
    "totals": { "taxableBase": 20.20, "taxTotal": 3.04, "grandTotal": 23.24 }
  }
}
```
Run: `npx vitest run src/lib/regimes` — expected: PASS (both SA fixtures; the multi-line case requires the kernel's `roundMoneyWith` at `level:'line'` — if it produces `3.03`, SA's rounding pack data is missing, which Step 2 sets).

- [ ] **Step 2: Execute the runbook (admin A)**

```sql
SELECT create_country_pack_draft((SELECT id FROM geo_countries WHERE code='SA'),
  'SA launch pack: VAT 15%, GCC 3-box, Arabic-lead documents, zatca_ph1 regime row #1');
SELECT upsert_country_tax_rate(jsonb_build_object(
  'country_id', (SELECT id FROM geo_countries WHERE code='SA'),
  'component_code','VAT','component_label','VAT 15%','tax_category','standard',
  'rate',15.0000,'valid_from','2020-07-01'));
-- THE row that retires einvoiceRouting.ts — the hardcode becomes data:
SELECT upsert_country_einvoice_regime(jsonb_build_object(
  'country_id', (SELECT id FROM geo_countries WHERE code='SA'),
  'code','zatca_ph1','regime_class','render_artifact','adapter_key','zatca_ph1',
  'mandatory_from','2021-12-04',
  'thresholds','{}'::jsonb,
  'config','{"artifact":"tlv_qr_base64","phase":"1"}'::jsonb));
-- SA = simple_vat + LINE-LEVEL rounding policy DATA (spec line 729). Without this,
-- SA inherits simple_vat's default {half_up, document} and multi-line invoices under-
-- report tax by a halala. Written into geo_countries.country_config via the facts RPC:
SELECT update_country_pack_facts((SELECT id FROM geo_countries WHERE code='SA'),
  '{}'::jsonb,
  jsonb_build_object('tax.rounding_policy',
    jsonb_build_object('mode','half_up','level','line')));
SELECT upsert_country_pack_test(jsonb_build_object(
  'country_id', (SELECT id FROM geo_countries WHERE code='SA'),
  'name','sa_standard_rate_invoice',
  'input_document','<input_document JSON from the sa_standard_invoice.json repo fixture>'::jsonb,
  'expected','<expected JSON from the sa_standard_invoice.json repo fixture>'::jsonb));
SELECT upsert_country_pack_test(jsonb_build_object(
  'country_id', (SELECT id FROM geo_countries WHERE code='SA'),
  'name','sa_multiline_line_rounding',
  'input_document','<input_document JSON from the sa_multiline_line_rounding.json repo fixture>'::jsonb,
  'expected','<expected JSON from the sa_multiline_line_rounding.json repo fixture>'::jsonb));
```
Studio: Run fixtures (expect **2/2** — the standard single-line case AND the multi-line line-rounding case, which is green only because `tax.rounding_policy.level = 'line'` is now set), Submit for review.

- [ ] **Step 3: Publish (admin B) + verify the regime path**

Publish v1 → expect `published: true, config_status: 'statutory_ready'` (capability `zatca_ph1` is in the manifest via Task 18 — if the gate reports it missing, run Sync capabilities and re-run fixtures). Verify:
```sql
SELECT code, config_status FROM geo_countries WHERE code='SA';                     -- statutory_ready
SELECT code, regime_class, adapter_key, mandatory_from
FROM master_einvoice_regimes
WHERE country_id=(SELECT id FROM geo_countries WHERE code='SA') AND deleted_at IS NULL;
-- EXPECT: zatca_ph1 | render_artifact | zatca_ph1 | 2021-12-04
SELECT country_config->'tax.rounding_policy' AS rounding FROM geo_countries WHERE code='SA';
-- EXPECT: {"mode": "half_up", "level": "line"}
```
Adapter proof: in the dev app, render an invoice preview with company-settings country set to Saudi Arabia and tax bar enabled → the QR renders; `grep -rn "=== 'SA'" src/lib/pdf` → 0 rows (the eslint `no-country-branching-outside-regimes` gate enforces this permanently).

- [ ] **Step 4: Manifest row + commit**

```
| <version-or-n/a> | phase3_sa_zatca_ph1_regime_row (via upsert_country_einvoice_regime) | Additive (data) | SA master_einvoice_regimes row #1: zatca_ph1 render_artifact, mandatory_from 2021-12-04 — retires einvoiceRouting.ts | P3 WP-7 |
```
```bash
git add src/lib/regimes/simple_vat/fixtures/sa_standard_invoice.json src/lib/regimes/simple_vat/fixtures/sa_multiline_line_rounding.json scripts/country-engine/publish-sa-pack.md supabase/migrations.manifest.md
git commit -m "feat(packs): SA pack statutory_ready — zatca_ph1 row #1 + line-level rounding data (P3)"
```

### Task 31: `statutory-fixtures` CI coverage for AE/SA

**Files:**
- Modify: the Phase-1 `statutory-fixtures` runner spec (locate: `grep -rln "statutory_ready" src scripts .github/workflows/ci.yml | head`; Phase 1 placed the fixture-enumeration test beside `src/lib/tax/publishGate.ts` and the CI job in `.github/workflows/ci.yml`).

**Interfaces:**
- Consumes: `runPublishGate({ mode: 'kernel' })`, the AE/SA fixture files (Tasks 29/30).
- Produces: CI proof that AE/SA cannot silently regress: the job enumerates `statutory_ready` countries from the live DB and fails if any lacks green fixtures.

- [ ] **Step 1: Extend the enumeration expectation**

In the Phase-1 statutory-fixtures spec, extend the pinned country list assertion:
```typescript
it('every statutory_ready country has resident, passing fixtures', async () => {
  // Phase 1 pinned ['OM']; after P3 the governed pipeline added AE + SA.
  expect(statutoryReadyCodes).toEqual(expect.arrayContaining(['OM', 'AE', 'SA']));
  for (const code of statutoryReadyCodes) {
    const outcome = await runPublishGate({ countryCode: code, fixtures: fixturesFor(code), mode: 'kernel' });
    expect(outcome.pass, `${code} fixtures must be green`).toBe(true);
    expect(fixturesFor(code).length, `${code} must have fixtures`).toBeGreaterThan(0);
  }
});
```
(`statutoryReadyCodes` / `fixturesFor` are the Phase-1 spec's own helpers — extend, do not fork.)

- [ ] **Step 2: Run + commit**

Run: `npm run test` (the job self-skips its live-DB enumeration without `SUPABASE_DB_URL`, matching the registry-trigger-parity pattern) — expected: green locally, enforcing in CI.
```bash
git add -u
git commit -m "test(ci): statutory-fixtures covers AE/SA through the kernel runner (P3)"
```

### Task 32: Phase exit verification — end-to-end evidence pack

**Files:**
- Create: `docs/superpowers/specs/2026-07-02-p3-exit-evidence.md` (recorded outputs of every probe below — this is a spec-adjacent evidence document, not a report; it is the phase's exit artifact referenced by the PR)

- [ ] **Step 1: Oman return end-to-end**

Repeat Task 9 Step 5 on the live Oman tenant after all WPs merge; additionally verify the filed return row carries the regime snapshot:
```sql
SELECT regime_key, filing_frequency, period_anchor FROM vat_returns
ORDER BY created_at DESC LIMIT 1;
-- EXPECT: gcc_return | quarterly | 01-01
```

- [ ] **Step 2: AE/SA governed-pipeline proof**

```sql
SELECT c.code, c.config_status, v.version, v.status,
       v.authored_by <> v.approved_by AS dual_control
FROM geo_countries c
JOIN master_country_pack_versions v ON v.country_id = c.id AND v.status = 'published'
WHERE c.code IN ('AE','SA') ORDER BY c.code;
-- EXPECT: 2 rows, both statutory_ready, dual_control = true.
SELECT count(*) AS stale FROM master_country_pack_tests t
JOIN geo_countries c ON c.id = t.country_id
WHERE c.code IN ('AE','SA')
  AND (t.last_result->>'pass')::boolean IS NOT TRUE;
-- EXPECT: stale = 0.
```

- [ ] **Step 3: Hardcode retirement + gates**

```bash
test ! -f src/lib/pdf/engine/einvoiceRouting.ts && echo RETIRED
grep -rn "einvoiceRouting\|normalizeSaudi\|shouldEmitZatcaQr" src/ | wc -l   # expect 0
npm run typecheck && npm run test && npm run lint && npm run check:schema-drift
```
Expected: `RETIRED`, `0`, all gates green.

- [ ] **Step 4: Commit the evidence + open the final PR**

```bash
git add docs/superpowers/specs/2026-07-02-p3-exit-evidence.md
git commit -m "docs(p3): exit evidence — Oman return reconciles; AE/SA statutory_ready via the governed pipeline"
```

---

## Testing Strategy

1. **Golden compliance fixtures, dual-resident (spec Testing §1):** AE/SA fixtures live in `src/lib/regimes/simple_vat/fixtures/` (repo CI, `statutory-fixtures` job, kernel mode — Task 31) AND in `master_country_pack_tests` (replayed at every publish via the Studio runner + `record_pack_test_result`, freshness-enforced by `content_updated_at` — Tasks 14/15/24). Same runner (`runPublishGate`) both places.
2. **Composer unit suite (pure):** period-bound math across anchors/frequencies/year boundaries, boundary-day membership (the toISOString bug class), non-month-aligned anchor rejection, base≠jurisdiction `CountryConfigError`, box summation (Task 5).
3. **Subledger integrity at the RPC:** `file_vat_return` rejects divergent boxes, overlapping periods, missing tax_periods; behavioral probes recorded (Task 3). Reconciliation invariant probed live: filed box == Σ `vat_amount_base` by `tax_period` == drill-down Σ (Tasks 9/32).
4. **Governance behavioral probes:** dual-control rejection (author publish attempt — Task 29 Step 3), stale-fixture blocking (Task 14 stales results on every content upsert by construction), capability degradation to `formatting_ready` (gate JSON recorded), publish→resync no-op (Task 17), staleness monitor with a seeded violation on a Supabase branch (Task 16 Step 3).
5. **Security/RLS:** anon-REVOKE asserted on every new RPC (Tasks 3/11/14/15 post-probes + Task 13 probe pack); `tax_return_lines` full tenant ceremony asserted (Task 1 Step 3); `scripts/check-tenant-table-requirements.sh` covers it permanently.
6. **UI component tests (jsdom):** modal composes/files/navigates periods (Task 8), drill-down reconciliation badge (Task 9), Studio list/editor/fixtures/publish dual-control (Tasks 21–25), SystemNumbers preview RPC wiring (Task 12). Known caveat: LocaleContext/i18n jsdom failures are a local-only artifact — trust CI (project memory).
7. **PDF regression:** engine parity/golden suites must stay green through Task 28; only SA-fixture inputs change (regime key replaces country string). `en` output for non-SA countries is byte-identical by construction (no QR path change when regime ≠ `zatca_ph1`).

## Verification Commands

```bash
npm run typecheck                      # expect: exit 0, zero src/ diagnostics
npm run test                           # expect: all vitest projects green
npm run lint                           # expect: no errors (incl. no-country-branching-outside-regimes)
npm run check:schema-drift             # expect: "no drift" (requires supabase CLI + token)
npm run check:registry-trigger-parity  # expect: pass (3 new tax.* keys mapped)
npx vitest run src/lib/regimes/gcc_return/gccReturn.test.ts        # expect: 7 passing
npx vitest run src/lib/regimes/zatca_ph1/zatcaPh1.test.ts          # expect: 3 passing
npx vitest run --config vitest.config.scripts.ts scripts/country-engine/import-cldr.test.ts   # expect: 3 passing, network test skipped
grep -rn "einvoiceRouting\|normalizeSaudi" src/ | wc -l            # expect: 0
```
Live-DB (via `mcp__supabase__execute_sql`, project `ssmbegiyjivrcwgcqutu`):
```sql
SELECT code, config_status FROM geo_countries WHERE code IN ('OM','AE','SA') ORDER BY code;
-- expect: AE statutory_ready | OM statutory_ready | SA statutory_ready
SELECT count(*) FROM cron.job WHERE jobname='pack-staleness-daily';   -- expect: 1
```

## Acceptance Criteria

- [ ] `tax_return_lines` exists with full tenant ceremony (RLS forced, RESTRICTIVE isolation, audit trigger, partial index) — Task 1 probe recorded.
- [ ] `vat_returns` carries `regime_key`/`filing_frequency`/`period_anchor`; money columns at `numeric(19,4)`.
- [ ] `file_vat_return` re-derives boxes from `vat_records.vat_amount_base` by `tax_period` and rejects divergence and overlapping periods; anon EXECUTE revoked.
- [ ] `gcc_return` registered; period bounds are pure tenant-local string math; base≠jurisdiction currency throws `CountryConfigError` before filing.
- [ ] Oman quarterly return files from the subledger; drill-down queries the SAME `tax_period` dimension; live reconciliation probe shows exact equality (Task 32 Step 1 recorded).
- [ ] `getVATRecordsByReturn` no longer filters `created_at`; `getQuarterlyVATSummary` no longer hardcodes calendar quarters.
- [ ] `master_numbering_policies` seeded for OM/AE/SA; `apply_country_numbering_policy` is non-destructive and idempotent (Task 11 probe); SystemNumbers edits `format_template`/`reset_basis`/`fiscal_year_anchor` with a live `preview_number_format` preview; legal-scope rewind probe still raises (Task 13 evidence).
- [ ] All six contract governance RPCs + five plan-added authoring RPCs live, SECURITY DEFINER, anon-revoked, provenance-stamped into `platform_audit_logs`, freshness-stamped via `content_updated_at`.
- [ ] `publish_country_pack` enforces all four gate parts; missing capability caps at `formatting_ready` (honest degradation); publish resyncs + pins `tenants.country_pack_version`; resync no-op evidence recorded (Task 17).
- [ ] pg_cron `pack-staleness-daily` scheduled; seeded-violation detection demonstrated on a branch.
- [ ] Country Authoring Studio: list + staleness dashboard, editor over rates/requirements/regimes/numbering/fixtures, reserved keys (`compliance.audit_file_exports`, `custody.unclaimed_property`, `privacy.regime`) visible read-only marked "Reserved", draft→in_review→published→superseded lifecycle, publish disabled for the author in the UI AND rejected by the RPC/CHECK.
- [ ] CLDR import job generates a reviewable fill-only operator seed; offline mapping suite green.
- [ ] AE and SA `statutory_ready` via the governed pipeline with dual control held (`authored_by <> approved_by` on the published rows) and 100% fresh passing fixtures.
- [ ] SA carries `master_einvoice_regimes` row #1 (`zatca_ph1`, `render_artifact`); the invoice QR routes by regime key; `src/lib/pdf/engine/einvoiceRouting.ts` deleted with zero remaining references.
- [ ] `statutory-fixtures` CI job covers OM/AE/SA.
- [ ] All existing gates green: typecheck 0, tests, lint, schema-drift, tenant-table-requirements, migration-manifest, registry-trigger-parity.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Phase 1/2 shipped interface details that drift from this plan's citations (e.g. `IssuedDocumentSnapshot` fields, plugin bootstrap location, statutory-fixtures spec shape) | Every consuming task opens with a locate/verify step (grep) and an explicit additive-extension fallback; line numbers are anchored to quoted code, not positions |
| Dual control needs two platform admins; only `dev@flowza.ai` exists today | Pre-task for WP-7: create a dedicated `pack-approver` platform admin via the existing `user-management` edge function; the negative probe (author publish rejected) is mandatory evidence |
| Gate part ① relies on recorded results — a stale-result bypass would gut it | Every `upsert_*` bumps `content_updated_at`; `upsert_country_pack_test` NULLs `last_run_at/last_result` on edit; the gate blocks on `last_run_at < content_updated_at`; results writable only via the admin-gated `record_pack_test_result` |
| `resync_tenant_country_config` inside the publish loop could partially fail across tenants | Single tenant in dev (Oman); the RPC is fail-loud so publish aborts atomically (one transaction); at production scale revisit with a queued per-tenant job — noted as a Phase-5+ follow-up |
| `ALTER TYPE` widening on `vat_returns` rewrites the table | 0 rows live (verified) — instant; harmless even with data (widening only) |
| Overlap guard in `file_vat_return` blocks legitimate corrections (amended returns) | Corrections = soft-delete the draft return (admin) and refile; formal amended-return flows are a Phase-5 composer concern (documented Non-goal) |
| CLDR weekend data may contradict curated GCC facts (several states moved to Sat/Sun) | The seed is fill-only-when-missing + operator-reviewed before apply; it can never overwrite curated `country_config` keys |
| `master_engine_capabilities` may lack a unique key on `capability_key` (Phase-1 DDL detail) | Task 15 NOTE adds the unique index conditionally after checking `pg_indexes` |
| pg_cron job duplication on re-apply | Migration unschedules-then-schedules idempotently |

## Exit Criteria (roadmap row, made measurable)

1. **"Oman quarterly return files from the subledger and drills down reconcilably"** → Task 32 Step 1 recorded: a `vat_returns` row created through the UI carries `regime_key='gcc_return'`, its `output_vat` exactly equals Σ `vat_records.vat_amount_base` (sale) over the period's `tax_period` months, `tax_return_lines` holds the 3 boxes, and the drill-down modal shows a green "Reconciled" badge computed from the same dimension.
2. **"AE/SA statutory_ready via the governed pipeline (proving the data path end-to-end)"** → Task 32 Step 2 recorded: both countries `config_status='statutory_ready'`, flipped ONLY by `publish_country_pack` (machine-derived), with published pack versions where `authored_by <> approved_by`, zero stale/failing fixtures, and the SA pack carrying the `zatca_ph1` regime row that replaced the deleted `einvoiceRouting.ts`.
3. Fiscal-template numbering demonstrably production-capable: `preview_number_format('invoices','INV/{FY}/{SEQ:4}')` renders the tokenized shape, the SystemNumbers UI persists the fiscal fields through the 9-arg RPC, and rewind protection evidence is recorded (Task 13).
4. All CI gates green on `main` after the six WP PRs merge.

## Estimated Effort

| Work package | Scope | Engineer-days |
|---|---|---|
| WP-1 Returns schema + filing RPC (T1–T3) | 3 migrations, probes, types | 2.0 |
| WP-2 gcc_return + service + UI (T4–T9) | registry keys, composer, service, 2 modals, page rewire, reconciliation | 4.0 |
| WP-3 Fiscal numbering (T10–T13) | table+seeds, apply RPC, SystemNumbers UI, probe pack | 2.5 |
| WP-4 Publish governance (T14–T18) | 11 functions across 2 big migrations, cron monitor, capability sync, no-op probe | 4.0 |
| WP-5 Country Authoring Studio (T19–T25) | service, routes, 2 pages, 3 components, generic grid | 4.5 |
| WP-6 CLDR import (T26) | mapping module + generator + reviewed seed | 1.0 |
| WP-7 AE/SA + zatca_ph1 (T27–T32) | hash+transport, adapter rewire+deletion, 2 pack runbooks, CI, exit evidence | 3.0 |
| **Total** | | **21 engineer-days (~3–4 weeks)** — matches the roadmap's 3–4 wk sizing |
