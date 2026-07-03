# Phase 5 — US Sales Tax, UK MTD & ZATCA Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the US and UK `statutory_ready` through the governed pack pipeline (native `us_sales_tax` jurisdiction stacking with nexus-as-data, Avalara/TaxJar provider seam, profile-relaxed invoice ceremony, UK 20/5/0 + MTD 9-box composer + filing transport) and ship the ZATCA Phase-2 clearance capability with `previous_hash` chaining for wave-mandated KSA tenants.

**Architecture:** Phase 5 stresses the Phase-1 fiscal kernel on the two regimes VAT never exercised — NONE-of-VAT jurisdiction stacking (`us_sales_tax` as a `jurisdiction_stack` parameterization over `geo_country_tax_rates` subdivision rows, with nexus resolved from `legal_entity_tax_registrations`) and authority-interactive transports (`filing_api` for UK MTD, `clearance_api` for ZATCA P2). Everything statutory is data (rate rows, requirement rows, regime rows, pack fixtures); everything algorithmic is a registered plugin implementing the Phase-1 contract interfaces verbatim; provider adapters (Avalara/TaxJar) implement the SAME `TaxStrategy` interface behind a `ProviderTransport` seam with graceful fallback to the native stack.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query v5, Supabase (Postgres 15 RPCs via `mcp__supabase__apply_migration`, Deno edge functions), Vitest 4 — **two** projects in the default `vitest.config.ts` (`node` + `dom`, both scoped to `src/**`), **plus a separate config `vitest.config.scripts.ts`** (include globs `scripts/**/*.test.ts` and `supabase/functions/**/*.test.ts`, run via `npm run geo:test` or `npx vitest run --config vitest.config.scripts.ts`). `npm run test` does NOT discover `supabase/functions/**` — edge-function contract tests run only under the scripts config. pdfmake (profile-driven rendering already wired in Phase 2), lucide-react, semantic theme tokens.

**Entry criteria (Phases 0–4 merged to `main`; this plan consumes their contract names verbatim):**

- `src/lib/regimes/types.ts` exports: `TaxStrategy`, `ReturnComposer`, `ComposedReturn`, `ReturnBoxLine`, `DocumentComplianceProfile`, `EInvoicingTransport`, `TaxContext`, `TaxComputation`, `ComputedTaxLine`, `TaxableLine`, `RuleTrace`, `RuleTraceStep`, `RoundingPolicy`, `ScaleSystem`, `RegimeClass`, `TaxDocumentType`, `DocumentNotation`, `SchemeMode`, `TaxTreatment`, plus row aliases `GeoCountryTaxRateRow`, `LegalEntityTaxRegistrationRow`, `VatRecordRow`, and `IssuedDocumentSnapshot` with shape `{ documentType: TaxDocumentType | 'vat_return'; documentId: string; tenantId: string; number: string | null; issuedAt: string; payload: Record<string, unknown> }`.
- `src/lib/regimes/registry.ts` exports: `registerRegimePlugin(kind, plugin)`, `resolveTaxStrategy(key)`, `resolveReturnComposer(key)`, `resolveDocumentProfile(key)`, `resolveEInvoicingTransport(key)`, `listRegisteredCapabilities()`; `src/lib/regimes/register.ts` is the single module-load registration point for all shipped plugins.
- `src/lib/tax/kernel/index.ts` exports `computeDocumentTax(ctx: TaxContext): TaxComputation` honoring all three scheme modes including `jurisdiction_stack`; `src/lib/financialMath.ts` exports `allocateLargestRemainder`, `roundMoneyWith`, `roundMoney` (existing, `src/lib/financialMath.ts:13`).
- **Kernel exempt-classification behavior is a confirmed Phase-1 property, not a Phase-5 fix.** For an `exempt`-category rate row (and for a line whose `treatment` is `exempt`/`zero_rated`), `computeDocumentTax` emits a **0-amount rollup row that preserves classification** (`taxTreatment: 'exempt'`/`'zero_rated'`, `taxAmount: 0`, `rate` from the row) rather than dropping the component — this is the "preserving classification" behavior of spec walkthrough line 1024 and is exercised by the Phase-1 Oman `zero_rated`/export fixture and the Phase-4 India exempt-slab fixtures. **STOP rule:** if, when this plan starts, the merged Phase-1 kernel does NOT emit that classified 0-amount rollup, the fix belongs in a **Phase-1 kernel amendment** (its own failing kernel test + a re-run of the Oman 993-invoice and India fixture parity suites to prove no regression) landed as a one-commit predecessor — it must NOT be patched inline inside Task 5, which would mutate cross-phase kernel behavior without the parity guard. Task 5 consumes this behavior; it does not create it.
- `src/lib/taxDocumentService.ts` function `computeDocumentTotals(input, rc)` assembles the `TaxContext` **inline** — it builds the context object literal in place, sets `ctx.rates = matchFormRate(effective, input.taxRate)`, and calls `resolveTaxStrategy(...)` directly. This inline builder is the Phase-1 fact-assembly + strategy-call seam and the only I/O layer in front of the pure kernel; **there is no separate `src/lib/tax/assembleTaxContext.ts` on `main`** (Phase 1 never extracted one). Phase 5 edits `computeDocumentTotals` in place. If Phase 1/2 later extracts this into `src/lib/tax/assembleTaxContext.ts`, retarget these edits there in one commit before executing WP-2.
- `src/lib/tax/publishGate.ts` exports `runPublishGate({ countryCode, fixtures, mode }): Promise<{ pass: boolean; results: FixtureRunResult[] }>` and `PackFixture`. The `statutory-fixtures` CI job (`scripts/localization/statutory-fixtures.test.ts`) enumerates `statutory_ready` countries and replays each country's fixtures via `runPublishGate({ mode: 'kernel' })`, importing per-country fixture JSON with **hardcoded imports** (OM in Phase 1; AE/SA added by Phase 3 Task 31; IN by Phase 4). **There is no `PACK_FIXTURES_BY_COUNTRY` registry module** — Phase 5 extends this gate's country list with hardcoded US/GB fixture imports the same way, and each WP's repo-resident fixture test imports its own fixture JSON directly.
- `src/lib/tax/hash.ts` exports `sha256Hex(input: string | Uint8Array): string` (pure/sync — created in Phase 3 at `src/lib/tax/hash.ts`; used by transports for `payloadHash`).
- DB: `geo_country_tax_rates`, `document_tax_lines`, `legal_entity_tax_registrations`, `einvoice_submissions` (columns: `id, tenant_id, document_type, document_id, regime_key, artifact_type, payload_storage_path, payload_hash, previous_hash, status, authority_reference, authority_response, submitted_at, sealed_at, created_at, created_by, deleted_at`; append-only), `master_einvoice_regimes`, `master_engine_capabilities`, `master_country_pack_versions`, `master_country_pack_tests`, `master_document_requirements`, `tax_return_lines`, `vat_returns` (+`regime_key`,`filing_frequency`,`period_anchor`) all live; RPCs `issue_tax_document(p_doc_type, p_doc_id, p_dry_run)`, `publish_country_pack(p_country_id, p_version)`, `create_country_pack_draft`, `submit_country_pack_for_review`, `upsert_country_tax_rate`, `upsert_document_requirement`, `upsert_country_pack_test` callable; `record_payment` accepts `withheld_amount`/`certificate_ref` (Phase 4).
- `TenantConfig` carries `regime: { tax: string; einvoice: string; numbering: string; documents: string; payroll: string }` resolved from the five `regime.*` registry keys; `useRegimeConfig()` exported from `src/contexts/TenantConfigContext.tsx`.
- Phase-3 return UI renders `tax_return_lines` generically per composer box vocabulary; Phase-3 Country Authoring Studio (dual-control publish UI) is live for platform admins.
- **Per-country return-composer binding is a GOVERNED config key, not raw jsonb.** The composer a country resolves (OM/AE/SA → `gcc_return`, IN → `gstr`) is selected through a registered `ConfigKeyDef` in `COUNTRY_CONFIG_REGISTRY` (`src/lib/country/registry.ts`) resolved via `resolveCountryConfigKey` — because `resolveConfig` **throws `CountryConfigError` on any unregistered key** (`src/lib/country/resolveCountryConfig.ts`, pinned by `resolveCountryConfig.test.ts`). This plan binds the US/UK composer + filing cadence via keys `tax.return_composer` (`maxOverrideLayer:'country'`), `tax.filing_frequency`, `tax.period_anchor`; **Task 3b registers them** (and the `validate_country_config_overrides()` trigger-parity update the Phase-0 `check:registry-trigger-parity` gate enforces). **STOP rule:** if Phase 3 already registered a composer-binding key under different names/shapes, reconcile THIS plan's key names (Tasks 2/3/16 + Task 3b) to Phase-3's in one commit before executing WP-1 — do not fork a second vocabulary. `vat_returns.filing_frequency`/`period_anchor` are per-return COLUMNS (a different thing) — do not conflate them with these country-level default keys.
- Phase 4 patterns proven: `in_gst` split_by_place_of_supply live, `gstr` composers live, IRN transport artifact-first shipped, external CA fixture validation sign-off recorded.

If any entry-criterion name differs on `main` when this plan starts, STOP and reconcile the name in this plan first (one commit), then execute — do not fork a second vocabulary.

## Global Constraints

Verbatim repo rules every task inherits:

- **Additive-only migrations** — no `DROP TABLE`, no `DROP COLUMN`, no `DELETE FROM`. Soft deletes only (`deleted_at = now()`).
- **Every new tenant table** gets `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, RLS ENABLED + FORCED, RESTRICTIVE `{table}_tenant_isolation` policy, PERMISSIVE op policies, `set_<table>_tenant_and_audit` trigger, `idx_<table>_tenant_id` partial index, `deleted_at`. (Phase 5 creates NO new tenant tables — this constraint applies to any deviation.)
- `maybeSingle()` never `single()`.
- `src/types/database.types.ts` is generated — regen via `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) after every migration; never hand-edit.
- **Migration discipline per PR:** apply via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) → regen types → update ALL callers → append a `| <version> | <filename> | <classification> | <summary> | <PR> |` row to `supabase/migrations.manifest.md` → use `.github/PULL_REQUEST_TEMPLATE/migration.md`.
- `npm run typecheck` must stay at **0 errors** (`scripts/check-tsc.sh` enforces zero).
- pdfmake-only PDFs; lucide-react icons only; semantic theme tokens only (no purple/indigo/violet, no brand hexes).
- No new npm packages without checking existing ones first (Phase 5 needs none — sha256 comes from `src/lib/tax/hash.ts`; QR from pdfmake `{ qr }`).
- Custody/audit tables append-only; `einvoice_submissions` append-only (status transitions are NEW rows, never UPDATEs).
- Never share code between edge functions; edge functions handle CORS with `Content-Type, Authorization, X-Client-Info, Apikey`; external imports via `npm:` prefix.
- eslint gates in force: `xsuite/no-country-branching-outside-regimes` (no `if (countryCode === ...)` outside `src/lib/regimes/`), `xsuite/no-adhoc-money-allocation` (`allocateLargestRemainder` only).
- Financial writes gated `has_role('accounts')`; platform data writes `is_platform_admin()` only.

## Objectives

1. **US pack `statutory_ready`:** `us_sales_tax` TaxStrategy (jurisdiction_stack parameterization — state+county+city component stacking from `geo_country_tax_rates` subdivision rows; `out_of_scope` when no nexus; exempt-state handling preserving classification), US subdivision + rate seed data, `us_plain_invoice` DocumentComplianceProfile ('Invoice' title, Letter, no registration band, ceremony relaxed), `us_jurisdiction_remit` ReturnComposer (`tax_return_lines` grouped by `jurisdiction_ref`), nexus management UI over `legal_entity_tax_registrations`, externally SALT-reviewed fixtures, published through the four-part machine gate.
2. **Provider seam (owner decision E3):** Avalara and TaxJar adapters implementing the SAME `TaxStrategy` interface behind a `ProviderTransport` seam; per-tenant enablement in `company_settings.metadata`; graceful fallback to the native stack; transport stubbed behind a documented integration test double (no sandbox credentials exist) — the seam and its contract tests ARE the deliverable; capability manifest keeps the native stack honest at subdivision granularity (street-level accuracy explicitly provider-gated).
3. **UK pack `statutory_ready`:** 20/5/0 mixed-rate rows on the existing `simple_vat` plugin, buyer-VAT-number requirement row for reverse-charge B2B, reverse-charge notation fixtures, `uk_mtd_9box` ReturnComposer with stagger-group period anchors, `uk_mtd` filing transport (`filing_api` regime class, artifact-generation-first) + `uk-mtd-file` edge function (HMRC sandbox behind a flag).
4. **ZATCA Phase 2 capability live:** `zatca_ph2` regime row (`clearance_api`), deterministic UBL artifact builder with PIH (`previous_hash`) chaining, `append_einvoice_submission` RPC serializing the per-tenant chain, `zatca-phase2-clearance` edge function with dead-letter + generate-and-hold degraded modes, wave-mandate thresholds read from regime config (never hardcoded).
5. **External US SALT review** as an explicit gated task (same handoff/sign-off pattern as the Phase-4 India CA task) — US publish is blocked until sign-off is recorded.

## Non-goals

- **Platform subscription billing** — separate workstream (owner decision E4); reuses these primitives but appears in no task here.
- **Street-level US rate data / product-taxability matrices** (e.g. TX's 80%-base data-processing rule) — provider-gated by design; the native stack is honest at subdivision granularity and the capability manifest + profile documentation say so explicitly.
- **Live Avalara/TaxJar HTTP transports** — deferred until sandbox credentials exist; the stub transport is the documented integration double. Wiring a real HTTP transport later is one new `ProviderTransport` implementation, zero interface change.
- **HMRC production filing + fraud-prevention header certification** — the edge function ships sandbox-flagged, artifact-generation-first; production go-live is an operator step after HMRC application.
- **ZATCA CSID onboarding/production clearance** — the edge function ships with a stub signer and generate-and-hold; real CSID enrollment is an operator step per wave-mandated tenant.
- **Other US state packs beyond the seeded TX/CO/CA/DE set** — added later as data through the Phase-3 Country Authoring Studio (one rate row per jurisdiction; no code).
- **Certified-software / chained-document regime implementations** (PT/FR/DE) — regime classes exist since Phase 1; implementations remain deferred (owner decision 5).
- **`master_numbering_policies` rows for US/UK** — both use `prefix_numbering` defaults; no numbering work this phase.
- **A dedicated US gross-receipts reconciliation worksheet/report.** Spec walkthrough line 1024 notes a no-nexus `out_of_scope` sale "is listed for gross-receipts reconciliation." This phase captures those sales completely — every no-nexus US sale is still an issued invoice with a `document_tax_lines` `out_of_scope` classification (`taxTotal` 0) and full header totals — so **no data is lost** and a gross-receipts worksheet is a pure read over already-persisted documents. Building that worksheet UI/composer is deferred to a Phase-3 Studio report; `out_of_scope` sales post no `vat_records` rows by design, so the `us_jurisdiction_remit` composer (which groups `vat_records`) correctly excludes them. (Acceptance is scoped to capture, not to the worksheet.)
- **Automatic issuance-time / return-screen wiring of the authority transports.** `uk-mtd-file` and `zatca-phase2-clearance` ship deployed and reachable via an **explicit action / operator step** (proven end-to-end by the Task 26 smoke), NOT wired into automatic invoice issuance or an always-on "auto-file" flow this phase — consistent with the sandbox-flagged, credentials-absent Non-goals above. The full "File to HMRC" return-screen button and the wave-mandated issuance hook are a follow-up once HMRC/CSID credentials exist; the deliverable here is the capability + its contract tests + a working manual invocation, not automatic submission.

## Architecture Decisions

1. **Nexus filtering lives in the `us_sales_tax` strategy, not the kernel.** The kernel's `jurisdiction_stack` mode stacks whatever rate rows the `TaxContext` carries; the strategy decides *which* rows are in scope by intersecting `ctx.seller.registrations` (active on `taxPointDate`) with the state-level row of the ship-to path, downgrading to `out_of_scope` when no nexus exists. Rationale: nexus is US statutory law, not arithmetic — it belongs in the regime plugin so Canada GST+PST can reuse the same kernel mode with different scoping rules. Rejected: baking registration checks into `computeDocumentTax` (couples the pure kernel to a per-country legal doctrine).
2. **`TaxContext.rates` are pre-scoped to the ship-to subdivision path by the fact assembler.** `computeDocumentTotals` in `src/lib/taxDocumentService.ts` (the existing Phase-1 I/O seam where the `TaxContext` is assembled inline) gains a subdivision-path resolver (one recursive query over `geo_subdivisions.parent_id`) so the pure strategy never touches the DB. Rejected: passing the whole country's rate table into the context (bloats every computation; forces tree-walking into pure code).
3. **Seed only the SALT-scoped US rate set (TX stack, CO, CA, DE-exempt), all 51 state subdivisions.** Subdivision rows are cheap ISO-3166-2 facts; rate rows are statutory claims that must survive external SALT review, so we seed exactly what the review covers with `data_source = 'draft_pending_salt_review'` and flip provenance to `salt_validated` only on sign-off. Expanding coverage later is Studio data entry. Rejected: seeding a "complete" US rate table from an unverified source (silent non-compliance — the exact anti-pattern this program exists to kill).
4. **Provider adapters = `createProviderStrategy(providerKey, version, transport, nativeThunk)` over a `ProviderTransport` seam.** Adapters are thin: map `TaxContext` → provider request, provider response → `TaxComputation` (same invariants: `totals.taxTotal` ≡ Σ rollups). Fallback is *returning the native computation object itself* — the persisted `trace.regimeKey` then names the native plugin, so provenance stays honest by construction with zero new trace vocabulary. Rejected: a `fallback` trace op (widens the closed `RuleTraceStep` union); rejected: browser-side HTTP calls to providers (API secrets can never ship to the client — when a real transport lands it will be an edge function behind the same interface).
5. **Per-tenant provider enablement in `company_settings.metadata.tax_provider`.** Precedent: `company_settings.metadata.table_columns` (v1.2.0). The five `regime.*` keys are `maxOverrideLayer:'country'` compliance bindings tenants must not forge; provider choice is a tenant preference layered on top, so it lives in tenant settings, resolved by `resolveEffectiveTaxStrategy()`. Rejected: a sixth `regime.*` key (wrong governance layer); rejected: a new table (YAGNI — one string).
6. **Ceremony relaxation happens at the service seam via the profile, and the UI follows.** There are **TWO** hardcoded `invoice_type !== 'tax_invoice'` ceremony gates in `src/lib/invoiceService.ts` (verified live 2026-07-02) — `recordPayment` at **:910-913** ("Payments can only be recorded against Tax Invoices, not Proforma Invoices.") and `issueInvoice` at **:704-705** ("Only Tax Invoices are issued for payment. Convert the proforma first."). Both are profile-delegated this phase: `assertPayableInvoiceType(invoiceType, profile)` replaces the `recordPayment` gate and `assertIssuableInvoiceType(invoiceType, profile)` replaces the `issueInvoice` gate (same predicate, different legacy error string preserved verbatim per gate). `InvoiceFormModal` hides the tax-invoice/proforma toggle when `requiresTaxInvoiceCeremony === false`. Neither gate is ever deleted — GCC/India tenants (`requiresTaxInvoiceCeremony: true`) keep both verbatim. Rejected: relaxing only the `recordPayment` gate (leaves `issueInvoice` blocking any proforma-typed document irrespective of profile — an incomplete relaxation); rejected: branching on country code in the service (banned by `xsuite/no-country-branching-outside-regimes`).
7. **MTD filing is modeled as an `EInvoicingTransport` of class `filing_api` whose artifact is the 9-box JSON body.** Artifact-generation-first (like IRN): every filing attempt first seals a deterministic payload into `einvoice_submissions`; submission to HMRC happens in the `uk-mtd-file` edge function behind `MTD_SANDBOX_ENABLED`. The pure payload builder lives in `src/lib/regimes/uk_mtd/`; the edge function carries its own copy (edge functions share no code) pinned byte-identical by a contract test run under the **separate scripts vitest config** `vitest.config.scripts.ts` (via `npm run geo:test`), which already includes `supabase/functions/**/*.test.ts` — NOT a third project of the default `npm run test`.
8. **ZATCA P2 chain linearity via `append_einvoice_submission` RPC with a per-tenant advisory lock; status transitions are new rows.** `einvoice_submissions` is append-only (REVOKE UPDATE/DELETE + `prevent_audit_mutation`), so a status change is a NEW row, never an UPDATE. The shipped edge functions (Tasks 20, 23) append exactly **one terminal row per document** — `held` | `accepted` | `rejected` | `dead_letter` — each carrying its sealed payload hash; `previous_hash` chains the PAYLOAD hashes of successive sealed artifacts per tenant+regime (ZATCA PIH semantics). **The chain advances from the most recent sealed artifact of ANY terminal status, crucially including `held`** — the un-credentialed generate-and-hold default is a real, sealed predecessor, so the PIH stays gap-free even for a wave-mandated tenant with no CSID credentials yet. (The RPC's chain-lookup status set therefore MUST include `held`; excluding it — as an earlier draft did — silently kills the chain for the documented degraded mode.) The RPC computes `previous_hash` under `pg_advisory_xact_lock` so two concurrent issuances can never fork the chain. Rejected: allowing UPDATE for status (breaks the append-only invariant the whole fiscal design rests on); rejected: excluding `held`/`rejected`/`dead_letter` from the chain lookup (creates PIH gaps).
9. **Stagger groups are `periodAnchor` data, not code.** `ukMtd9BoxComposer.periodBounds` derives the quarter cycle from the anchor month modulo 3 (`'01-01'` → Mar/Jun/Sep/Dec ends; `'02-01'` → Apr/Jul/Oct/Jan; `'03-01'` → Feb/May/Aug/Nov), using pure date-string integer math (no `Date`/UTC drift — the Phase-0 lesson). Rejected: an enum of three stagger branches (same information, less general).
10. **`zatca_ph1` stays untouched.** The Phase-3 pack migration already routes Phase-1 QR via the `master_einvoice_regimes` row; Phase 5 only ADDS the `zatca_ph2` row and transport. `src/lib/pdf/engine/zatcaQr.ts` (`buildZatcaTlvBase64`, verified) remains the Phase-1 TLV builder and is extended-tag-composed by the P2 artifact, not duplicated.

## Database Changes

All applied via `mcp__supabase__apply_migration` with `project_id = ssmbegiyjivrcwgcqutu`. All are data-seed or additive-function migrations — zero new tables, zero column changes (every table/column consumed here shipped in Phases 0–4).

| # | Migration name | Purpose | Tables/objects touched |
|---|---|---|---|
| M5-1 | `phase5_us_geo_subdivisions_seed` | 51 US state/district subdivisions + TX locals (Travis County, Austin city, Austin MTA district) + CA/CO/DE presence; unique `(country_id, code)` index | `geo_subdivisions` (INSERT), new unique index |
| M5-1b | `phase5_return_composer_statutory_key` | Extend `validate_country_config_overrides()` `statutory_keys` to include `tax.return_composer` — keeps `check:registry-trigger-parity` green once Task 3b registers the country-locked composer key (skip if Phase 3 already registered an equivalent key) | function `validate_country_config_overrides` (CREATE OR REPLACE) |
| M5-2 | `phase5_us_pack_data` | US pack v1 draft: rate rows (TX STATE 6.2500 + Austin CITY 1.0000 + Austin MTA DISTRICT 1.0000; CO STATE 2.9000; CA STATE 7.2500; DE STATE exempt 0.0000), `regime.*`/composer keys into `geo_countries.country_config`, capability rows, pack version draft | `geo_country_tax_rates`, `geo_countries.country_config`, `master_engine_capabilities`, `master_country_pack_versions` |
| M5-3 | `phase5_uk_pack_data` | UK pack v1 draft: VAT 20/5/0 rate rows, reverse-charge buyer-VAT requirement row, `uk_mtd` regime row (`filing_api`), capability rows, config keys, pack version draft | `geo_country_tax_rates`, `master_document_requirements`, `master_einvoice_regimes`, `master_engine_capabilities`, `geo_countries.country_config`, `master_country_pack_versions` |
| M5-4 | `phase5_zatca_ph2_regime_and_chain_rpc` | `zatca_ph2` regime row (`clearance_api`, wave thresholds as data), capability row, `append_einvoice_submission(p_row jsonb)` SECURITY DEFINER RPC (advisory-lock chain append, service_role-only) | `master_einvoice_regimes`, `master_engine_capabilities`, new function `append_einvoice_submission` |
| M5-5 | `phase5_us_uk_pack_fixtures` | DB-resident golden fixtures for US (Austin stack / no-nexus / exempt-state / expired-nexus) and UK (mixed-rate / reverse-charge / 9-box) | `master_country_pack_tests` |
| M5-6 | `phase5_us_salt_signoff` | Provenance flip after external SALT sign-off: `data_source = 'salt_validated'`, `source_version = '2026-US-SALT-R1'` on the US rate rows | `geo_country_tax_rates` (UPDATE of provenance columns only) |

Types regen required after M5-4 (new RPC signature lands in `database.types.ts`); M5-1/2/3/5/6 are data-only (regen is a no-op but the schema-drift gate stays green either way). Every migration gets a manifest row.

## Backend Implementation

| Module | Contents |
|---|---|
| `src/lib/taxDocumentService.ts` (`computeDocumentTotals`, modify) | Ship-to subdivision-path scoping: resolve `[shipToSubdivision, ...ancestors]` via `geo_subdivisions.parent_id` and scope `ctx.rates` to path rows (+ country-level rows) for `jurisdiction_stack` regimes |
| `src/lib/regimes/us_sales_tax/` (new) | `TaxStrategy` key `us_sales_tax` v1.0.0, schemeMode `jurisdiction_stack`; nexus filter over `ctx.seller.registrations`; out-of-scope + exempt-state downgrades; `fixtures/` golden cases |
| `src/lib/regimes/providers/` (new) | `ProviderTransport` seam, `ProviderUnavailableError`, `createStubProviderTransport` (the documented integration double), `createProviderStrategy` (context→request→computation mapping + native fallback) |
| `src/lib/regimes/avalara/`, `src/lib/regimes/taxjar/` (new) | Thin adapters: `makeAvalaraStrategy()` / `makeTaxjarStrategy()` over the seam, native thunk `() => resolveTaxStrategy('us_sales_tax')` |
| `src/lib/tax/resolveEffectiveTaxStrategy.ts` (new) | Per-tenant provider enablement resolution from `company_settings.metadata.tax_provider` with registry fallback |
| `src/lib/regimes/us_plain_invoice/` (new) | `DocumentComplianceProfile`: 'Invoice' titles, `requiresTaxInvoiceCeremony: false`, no registration band, Letter, no bilingual, no forced columns |
| `src/lib/tax/documentProfile.ts` (new) | `getActiveDocumentProfile(tenantId)` + pure `assertPayableInvoiceType(invoiceType, profile)` |
| `src/lib/regimes/us_jurisdiction_remit/` (new) | `ReturnComposer`: groups `vat_records` base amounts by `(jurisdiction_ref, component_code)` into `tax_return_lines`; calendar period bounds; base==jurisdiction currency assertion |
| `src/lib/taxRegistrationsService.ts` (new) | Nexus/GSTIN registration CRUD over `legal_entity_tax_registrations` + pure `validateRegistrationWindow` |
| `src/lib/regimes/uk_mtd_9box/` (new) | `ReturnComposer`: 9-box mapping from `vat_records`, stagger-group `periodBounds`, whole-pound boxes 6–9 |
| `src/lib/regimes/uk_mtd/` (new) | `EInvoicingTransport` (`filing_api`) + pure `buildMtd9BoxBody` payload builder |
| `src/lib/regimes/zatca_ph2/` (new) | `EInvoicingTransport` (`clearance_api`): deterministic UBL XML with PIH + extended TLV; `resolveZatcaWaveMandate` (thresholds as data, honest `revenue_unknown`) |
| `supabase/functions/uk-mtd-file/` (new) | Deno filing transport: seals artifact row, HMRC sandbox POST behind `MTD_SANDBOX_ENABLED`, own `mtdPayload.ts` pinned by contract test |
| `supabase/functions/zatca-phase2-clearance/` (new) | Deno clearance: CSID-stub signer, clearance POST, `append_einvoice_submission` status rows, dead-letter after 3 attempts, held when creds absent |
| `src/lib/invoiceService.ts` (modify :704-705 `issueInvoice` **and** :910-913 `recordPayment`) | BOTH hardcoded ceremony gates delegated to the resolved `DocumentComplianceProfile` (`assertIssuableInvoiceType` / `assertPayableInvoiceType`) |
| `src/lib/regimes/register.ts` (modify) | Register the 8 new plugins |
| `scripts/localization/statutory-fixtures.test.ts` (modify) | Add hardcoded `US` and `GB` fixture imports to the `statutory-fixtures` CI job's country list (mirrors Phase 3 Task 31's AE/SA wiring) |

## Frontend Implementation

| Component | Purpose |
|---|---|
| `src/components/settings/NexusRegistrationsPanel.tsx` (new) | Living nexus surface: list active/ended registrations per legal entity; add state registration (subdivision picker, tax number, registered_from/to); End action (`registered_to`, never delete) |
| `src/components/settings/TaxProviderPanel.tsx` (new) | Provider enablement: None / Avalara / TaxJar select persisted to `company_settings.metadata.tax_provider`; honest-ceiling copy ("street-level accuracy is provider-gated; the native stack is accurate at state/county/city granularity") |
| `src/pages/settings/TaxComplianceSettings.tsx` (new) | Settings page hosting both panels; route `settings/tax-compliance` in `src/App.tsx` (pattern: `src/App.tsx:252`) |
| `src/components/cases/InvoiceFormModal.tsx` (modify :654-676) | Tax-invoice/proforma toggle hidden when the resolved profile's `requiresTaxInvoiceCeremony` is false |

Return **display** needs no new work: the Phase-3 generic `tax_return_lines` renderer shows whatever box vocabulary the registered composer emits (9-box, per-jurisdiction remittance). **Authority submission is NOT auto-wired this phase** (Non-goal): the `uk-mtd-file` and `zatca-phase2-clearance` edge functions are reachable via an explicit action / operator invocation, verified end-to-end by the Task 26 smoke (§below) rather than by an always-on "File" button or an issuance hook. A future follow-up adds the return-screen "File to HMRC" control and the wave-mandated issuance hook once HMRC/CSID credentials exist — one caller each, zero interface change.

## APIs & Services

New/changed signatures this phase creates (exact):

```typescript
// src/lib/regimes/us_sales_tax/index.ts
export const US_SALES_TAX_VERSION = '1.0.0';
export const usSalesTaxStrategy: TaxStrategy;                       // key 'us_sales_tax', schemeMode 'jurisdiction_stack'
export function activeNexusSubdivisions(
  registrations: LegalEntityTaxRegistrationRow[], taxPointDate: string,
): Set<string>;

// src/lib/regimes/providers/providerTransport.ts
export interface ProviderTaxRequestLine { lineItemId: string | null; description: string; quantity: number; unitPrice: number; lineDiscount: number; itemCode: string | null; }
export interface ProviderTaxRequest { providerKey: 'avalara' | 'taxjar'; documentType: TaxDocumentType; taxDate: string; currency: string; shipFromSubdivisionId: string | null; shipToSubdivisionId: string | null; shipToAddress: Record<string, unknown> | null; buyerIsBusiness: boolean; lines: ProviderTaxRequestLine[]; documentDiscount: number; }
export interface ProviderTaxComponent { lineItemId: string | null; componentCode: string; componentLabel: string; jurisdictionRef: string | null; rate: number; taxableBase: number; taxAmount: number; }
export interface ProviderTaxResponse { components: ProviderTaxComponent[]; totalTax: number; providerReference: string; }
export interface ProviderTransport { readonly providerKey: 'avalara' | 'taxjar'; calculate(request: ProviderTaxRequest): Promise<ProviderTaxResponse>; }
export class ProviderUnavailableError extends Error;

// src/lib/regimes/providers/stubTransport.ts
export function createStubProviderTransport(providerKey: 'avalara' | 'taxjar', canned?: Map<string, ProviderTaxResponse>): ProviderTransport;

// src/lib/regimes/providers/providerStrategy.ts
export function createProviderStrategy(providerKey: 'avalara' | 'taxjar', version: string, transport: ProviderTransport, nativeThunk: () => TaxStrategy): TaxStrategy;

// src/lib/regimes/avalara/index.ts + src/lib/regimes/taxjar/index.ts
export function makeAvalaraStrategy(transport?: ProviderTransport): TaxStrategy;   // key 'avalara'
export function makeTaxjarStrategy(transport?: ProviderTransport): TaxStrategy;    // key 'taxjar'

// src/lib/tax/resolveEffectiveTaxStrategy.ts
export async function resolveEffectiveTaxStrategy(regimeTaxKey: string): Promise<TaxStrategy>;

// src/lib/regimes/us_plain_invoice/index.ts
export const usPlainInvoiceProfile: DocumentComplianceProfile;      // key 'us_plain_invoice'

// src/lib/tax/documentProfile.ts
export function assertPayableInvoiceType(invoiceType: string | null, profile: Pick<DocumentComplianceProfile, 'requiresTaxInvoiceCeremony'>): void;   // recordPayment gate (:910-913)
export function assertIssuableInvoiceType(invoiceType: string | null, profile: Pick<DocumentComplianceProfile, 'requiresTaxInvoiceCeremony'>): void;  // issueInvoice gate (:704-705)
export async function getActiveDocumentProfile(tenantId: string): Promise<DocumentComplianceProfile>;

// src/lib/regimes/us_jurisdiction_remit/index.ts
export const usJurisdictionRemitComposer: ReturnComposer;          // key 'us_jurisdiction_remit'

// src/lib/taxRegistrationsService.ts
export type TaxRegistrationRow = Database['public']['Tables']['legal_entity_tax_registrations']['Row'];
export interface CreateTaxRegistrationInput { legal_entity_id: string; country_id: string; subdivision_id: string | null; tax_number: string; scheme?: 'standard' | 'composition' | 'unregistered'; registered_from: string; registered_to?: string | null; is_primary?: boolean; }
export function validateRegistrationWindow(registeredFrom: string, registeredTo: string | null): string | null;
export async function listTaxRegistrations(legalEntityId: string): Promise<TaxRegistrationRow[]>;
export async function createTaxRegistration(input: CreateTaxRegistrationInput): Promise<TaxRegistrationRow>;
export async function endTaxRegistration(id: string, registeredTo: string): Promise<TaxRegistrationRow>;
export async function listCountrySubdivisions(countryId: string): Promise<Array<{ id: string; code: string; name: string; subdivision_type: string | null }>>;

// src/lib/regimes/uk_mtd_9box/index.ts
export const ukMtd9BoxComposer: ReturnComposer;                    // key 'uk_mtd_9box'

// src/lib/regimes/uk_mtd/index.ts
export interface Mtd9BoxBody { periodKey: string; vatDueSales: number; vatDueAcquisitions: number; totalVatDue: number; vatReclaimedCurrPeriod: number; netVatDue: number; totalValueSalesExVAT: number; totalValuePurchasesExVAT: number; totalValueGoodsSuppliedExVAT: number; totalAcquisitionsExVAT: number; finalised: boolean; }
export function buildMtd9BoxBody(composed: ComposedReturn, vrn: string, periodKey: string): Mtd9BoxBody;
export const ukMtdTransport: EInvoicingTransport;                  // key 'uk_mtd', regimeClass 'filing_api'

// src/lib/regimes/zatca_ph2/index.ts
export interface ZatcaP2InvoiceInput { invoiceNumber: string; uuid: string; issueDateTime: string; sellerName: string; sellerVatNumber: string; buyerName: string | null; buyerVatNumber: string | null; currency: string; lines: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number; taxAmount: number; lineTotal: number }>; taxableAmount: number; vatTotal: number; grandTotal: number; invoiceCounter: number; }
export function buildZatcaP2InvoiceXml(input: ZatcaP2InvoiceInput, previousInvoiceHash: string): string;
export const zatcaPh2Transport: EInvoicingTransport;               // key 'zatca_ph2', regimeClass 'clearance_api'

// src/lib/regimes/zatca_ph2/waveMandate.ts
export interface ZatcaWave { wave: number; revenue_threshold_sar: number; mandatory_from: string; }
export interface WaveMandateResult { mandated: boolean; wave: number | null; reason: 'mandated' | 'below_threshold' | 'revenue_unknown' | 'before_mandate_date'; }
export function resolveZatcaWaveMandate(args: { waves: ZatcaWave[]; tenantAnnualRevenueSar: number | null; onDate: string }): WaveMandateResult;
```

```sql
-- New RPC (M5-4) — SECURITY DEFINER, service_role-only
append_einvoice_submission(p_row jsonb) RETURNS einvoice_submissions
```

---

## File-by-File Implementation Tasks

Tasks are numbered globally. Each Work Package (WP) is one PR-able unit with its own verification. Execute WPs in order; tasks within a WP in order.

---

# WP-1 — US & UK pack data (migrations M5-1..M5-3)

One migration-classified PR (`.github/PULL_REQUEST_TEMPLATE/migration.md`). Branch: `feat/l10n-p5-us-uk-pack-data` cut fresh from `main`.

### Task 1: US geo_subdivisions seed (M5-1)

**Files:**
- Migration: `phase5_us_geo_subdivisions_seed` via `mcp__supabase__apply_migration`
- Modify: `supabase/migrations.manifest.md` (append one row)

**Interfaces:**
- Consumes: live tables `geo_subdivisions` (columns `country_id, parent_id, code, name, subdivision_type, tax_authority_code, sort_order, is_active` — verified live 2026-07-02), `geo_countries.code` (verified: `src/lib/geoCountryService.ts:11`)
- Produces: 51 state-level subdivision rows (`code` = USPS code) + 3 TX locals with codes `TX-TRAVIS`, `TX-AUSTIN`, `TX-AUSTIN-MTA`; unique index `uq_geo_subdivisions_country_code` on `(country_id, code)` — Task 2 rate rows and Task 14 subdivision picker key on these codes

- [ ] **Step 1: Failing probe — verify current absent state**

Run via `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
SELECT count(*) AS us_subdivisions
FROM geo_subdivisions s JOIN geo_countries c ON c.id = s.country_id
WHERE c.code = 'US';
```

Expected: `us_subdivisions = 0` (live table has 0 rows total — DB scout 2026-07-02).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` name `phase5_us_geo_subdivisions_seed`:

```sql
-- Phase 5 / M5-1 — US subdivisions: 50 states + DC (ISO/USPS codes) and the
-- Austin, TX local stack used by the SALT-scoped seed rates. Additive-only.
CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_subdivisions_country_code
  ON geo_subdivisions (country_id, code);

WITH us AS (SELECT id FROM geo_countries WHERE code = 'US')
INSERT INTO geo_subdivisions (country_id, parent_id, code, name, subdivision_type, tax_authority_code, sort_order, is_active)
SELECT us.id, NULL, v.code, v.name, 'state', NULL, v.ord, true
FROM us, (VALUES
  ('AL','Alabama',1),('AK','Alaska',2),('AZ','Arizona',3),('AR','Arkansas',4),
  ('CA','California',5),('CO','Colorado',6),('CT','Connecticut',7),('DE','Delaware',8),
  ('FL','Florida',9),('GA','Georgia',10),('HI','Hawaii',11),('ID','Idaho',12),
  ('IL','Illinois',13),('IN','Indiana',14),('IA','Iowa',15),('KS','Kansas',16),
  ('KY','Kentucky',17),('LA','Louisiana',18),('ME','Maine',19),('MD','Maryland',20),
  ('MA','Massachusetts',21),('MI','Michigan',22),('MN','Minnesota',23),('MS','Mississippi',24),
  ('MO','Missouri',25),('MT','Montana',26),('NE','Nebraska',27),('NV','Nevada',28),
  ('NH','New Hampshire',29),('NJ','New Jersey',30),('NM','New Mexico',31),('NY','New York',32),
  ('NC','North Carolina',33),('ND','North Dakota',34),('OH','Ohio',35),('OK','Oklahoma',36),
  ('OR','Oregon',37),('PA','Pennsylvania',38),('RI','Rhode Island',39),('SC','South Carolina',40),
  ('SD','South Dakota',41),('TN','Tennessee',42),('TX','Texas',43),('UT','Utah',44),
  ('VT','Vermont',45),('VA','Virginia',46),('WA','Washington',47),('WV','West Virginia',48),
  ('WI','Wisconsin',49),('WY','Wyoming',50),('DC','District of Columbia',51)
) AS v(code, name, ord)
ON CONFLICT (country_id, code) DO NOTHING;

-- Austin, TX local jurisdiction stack (county > city > special-purpose district)
WITH us AS (SELECT id FROM geo_countries WHERE code = 'US'),
     tx AS (SELECT s.id FROM geo_subdivisions s JOIN us ON s.country_id = us.id WHERE s.code = 'TX')
INSERT INTO geo_subdivisions (country_id, parent_id, code, name, subdivision_type, tax_authority_code, sort_order, is_active)
SELECT us.id, tx.id, 'TX-TRAVIS', 'Travis County', 'county', 'TX-COMPTROLLER', 1, true FROM us, tx
ON CONFLICT (country_id, code) DO NOTHING;

WITH us AS (SELECT id FROM geo_countries WHERE code = 'US'),
     travis AS (SELECT s.id FROM geo_subdivisions s JOIN us ON s.country_id = us.id WHERE s.code = 'TX-TRAVIS')
INSERT INTO geo_subdivisions (country_id, parent_id, code, name, subdivision_type, tax_authority_code, sort_order, is_active)
SELECT us.id, travis.id, 'TX-AUSTIN', 'City of Austin', 'city', 'TX-COMPTROLLER', 1, true FROM us, travis
ON CONFLICT (country_id, code) DO NOTHING;

WITH us AS (SELECT id FROM geo_countries WHERE code = 'US'),
     austin AS (SELECT s.id FROM geo_subdivisions s JOIN us ON s.country_id = us.id WHERE s.code = 'TX-AUSTIN')
INSERT INTO geo_subdivisions (country_id, parent_id, code, name, subdivision_type, tax_authority_code, sort_order, is_active)
SELECT us.id, austin.id, 'TX-AUSTIN-MTA', 'Austin MTA (Transit District)', 'district', 'TX-COMPTROLLER', 1, true FROM us, austin
ON CONFLICT (country_id, code) DO NOTHING;
```

- [ ] **Step 3: Assert the applied state**

`mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM geo_subdivisions s JOIN geo_countries c ON c.id = s.country_id
    WHERE c.code = 'US' AND s.subdivision_type = 'state') AS states,
  (SELECT count(*) FROM geo_subdivisions s JOIN geo_countries c ON c.id = s.country_id
    WHERE c.code = 'US' AND s.code IN ('TX-TRAVIS','TX-AUSTIN','TX-AUSTIN-MTA')) AS tx_locals,
  (SELECT parent.code FROM geo_subdivisions child
    JOIN geo_subdivisions parent ON parent.id = child.parent_id
    JOIN geo_countries c ON c.id = child.country_id
    WHERE c.code = 'US' AND child.code = 'TX-AUSTIN-MTA') AS mta_parent;
```

Expected: `states = 51`, `tx_locals = 3`, `mta_parent = 'TX-AUSTIN'`.

- [ ] **Step 4: Manifest row + commit**

Append to `supabase/migrations.manifest.md` (use the version timestamp returned by the apply):

```
| <version> | phase5_us_geo_subdivisions_seed.sql | Additive | US 51 state subdivisions + Austin TX local stack + (country_id, code) unique index | #<PR> |
```

```bash
git add supabase/migrations.manifest.md
git commit -m "feat(l10n-p5): seed US geo_subdivisions (51 states + Austin TX stack)"
```

### Task 2: US pack data — rates, regime keys, capabilities, pack draft (M5-2)

**Files:**
- Migration: `phase5_us_pack_data` via `mcp__supabase__apply_migration`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: Task 1 subdivision rows; `geo_country_tax_rates`, `master_engine_capabilities`, `master_country_pack_versions` (Phase 1 tables); `geo_countries.country_config` jsonb (Country Engine layer store)
- Produces: US rate rows with `component_code` ∈ (`STATE`,`CITY`,`DISTRICT`) keyed to subdivision ids; `geo_countries.country_config` keys `regime.tax = 'us_sales_tax'`, `regime.documents = 'us_plain_invoice'`, `tax.return_composer = 'us_jurisdiction_remit'`, `tax.filing_frequency = 'quarterly'`, `tax.period_anchor = '01-01'`; capability rows `us_sales_tax`/`us_plain_invoice`/`us_jurisdiction_remit`/`avalara`/`taxjar`; `master_country_pack_versions` US v1 draft (its id stamps `pack_version_id` on the rate rows). The `tax.return_composer`/`tax.filing_frequency`/`tax.period_anchor` keys are registered `ConfigKeyDef`s (Task 3b); `country_config` is the governed **country-layer store** for them, so these writes are the sanctioned seed, not a governance bypass.

- [ ] **Step 1: Failing probe**

```sql
SELECT
  (SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id = r.country_id WHERE c.code = 'US') AS us_rates,
  (SELECT count(*) FROM master_engine_capabilities WHERE capability_key IN ('us_sales_tax','avalara','taxjar','us_jurisdiction_remit','us_plain_invoice')) AS caps,
  (SELECT country_config->>'regime.tax' FROM geo_countries WHERE code = 'US') AS us_regime_tax;
```

Expected: `us_rates = 0`, `caps = 0`, `us_regime_tax` NULL (or `simple_vat` default — must not be `us_sales_tax`).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` name `phase5_us_pack_data`:

```sql
-- Phase 5 / M5-2 — US pack v1 (DRAFT): SALT-review-scoped seed rates, regime
-- bindings, capability manifest rows. data_source stays draft_pending_salt_review
-- until M5-6 flips provenance on external sign-off (Task 25).
WITH us AS (SELECT id FROM geo_countries WHERE code = 'US'),
pack AS (
  INSERT INTO master_country_pack_versions (country_id, version, status, effective_from, changelog, authored_by)
  SELECT us.id, 1, 'draft', '2026-07-01',
         'US pack v1: us_sales_tax jurisdiction stacking; TX/CO/CA/DE seed rates pending SALT review; us_plain_invoice profile; us_jurisdiction_remit composer.',
         NULL
  FROM us
  RETURNING id, country_id
),
sub AS (
  SELECT s.code, s.id FROM geo_subdivisions s JOIN us ON s.country_id = us.id
)
INSERT INTO geo_country_tax_rates
  (country_id, subdivision_id, component_code, component_label, tax_category, rate, applies_to, valid_from, valid_to, pack_version_id, data_source, source_version, sort_order)
SELECT pack.country_id, sub.id, v.component_code, v.component_label, v.tax_category, v.rate, NULL, v.valid_from::date, NULL, pack.id, 'draft_pending_salt_review', '2026-07-A', v.ord
FROM pack
JOIN (VALUES
  ('TX',            'STATE',    'Texas State Sales Tax',        'standard', 6.2500, '2026-07-01', 1),
  ('TX-AUSTIN',     'CITY',     'City of Austin Sales Tax',     'standard', 1.0000, '2026-07-01', 2),
  ('TX-AUSTIN-MTA', 'DISTRICT', 'Austin MTA Transit Tax',       'standard', 1.0000, '2026-07-01', 3),
  ('CO',            'STATE',    'Colorado State Sales Tax',     'standard', 2.9000, '2026-07-01', 1),
  ('CA',            'STATE',    'California State Sales Tax',   'standard', 7.2500, '2026-07-01', 1),
  ('DE',            'STATE',    'Delaware (No Sales Tax)',      'exempt',   0.0000, '2026-07-01', 1)
) AS v(sub_code, component_code, component_label, tax_category, rate, valid_from, ord)
  ON true
JOIN sub ON sub.code = v.sub_code;

UPDATE geo_countries
SET country_config = country_config || jsonb_build_object(
      'regime.tax',           'us_sales_tax',
      'regime.documents',     'us_plain_invoice',
      'tax.return_composer',  'us_jurisdiction_remit',
      'tax.filing_frequency', 'quarterly',
      'tax.period_anchor',    '01-01'
    )
WHERE code = 'US';

INSERT INTO master_engine_capabilities (capability_key, kind, min_engine_version)
VALUES
  ('us_sales_tax',         'regime_adapter', '1.0.0'),
  ('us_plain_invoice',     'regime_adapter', '1.0.0'),
  ('us_jurisdiction_remit','regime_adapter', '1.0.0'),
  ('avalara',              'regime_adapter', '0.1.0'),
  ('taxjar',               'regime_adapter', '0.1.0')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Assert the applied state**

```sql
SELECT
  (SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id = r.country_id
    WHERE c.code = 'US' AND r.data_source = 'draft_pending_salt_review') AS us_rates,
  (SELECT rate FROM geo_country_tax_rates r JOIN geo_subdivisions s ON s.id = r.subdivision_id
    WHERE s.code = 'TX' AND r.component_code = 'STATE') AS tx_state_rate,
  (SELECT country_config->>'regime.tax' FROM geo_countries WHERE code = 'US') AS regime_tax,
  (SELECT count(*) FROM master_engine_capabilities WHERE capability_key IN ('us_sales_tax','avalara','taxjar','us_jurisdiction_remit','us_plain_invoice')) AS caps,
  (SELECT status FROM master_country_pack_versions v JOIN geo_countries c ON c.id = v.country_id WHERE c.code = 'US' AND v.version = 1) AS pack_status;
```

Expected: `us_rates = 6`, `tx_state_rate = 6.2500`, `regime_tax = 'us_sales_tax'`, `caps = 5`, `pack_status = 'draft'`.

- [ ] **Step 4: Manifest row + commit**

```
| <version> | phase5_us_pack_data.sql | Additive | US pack v1 draft: 6 SALT-scoped rate rows, regime.* bindings, 5 capability rows | #<PR> |
```

```bash
git add supabase/migrations.manifest.md
git commit -m "feat(l10n-p5): US pack v1 draft data (rates, regime keys, capabilities)"
```

### Task 3: UK pack data — rates, requirement, MTD regime row (M5-3)

**Files:**
- Migration: `phase5_uk_pack_data` via `mcp__supabase__apply_migration`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `geo_countries` GB row (formatting_ready, VAT 20.00, FY 04-06 — spec Appendix A.1); `master_document_requirements` condition vocabulary `{"all":[{"fact":...,"op":...,"value":...}]}` (contract §4.4); `master_einvoice_regimes` (Phase 1)
- Produces: GB VAT rate rows standard 20.0000 / reduced 5.0000 / zero 0.0000; requirement row `buyer_tax_number` blocking reverse-charge invoices; `master_einvoice_regimes` GB `uk_mtd` row (`filing_api`); capabilities `uk_mtd_9box` (regime_adapter) + `uk_mtd` (filing_transport); GB `country_config` keys (`tax.return_composer = 'uk_mtd_9box'`, `regime.einvoice = 'uk_mtd'`, `tax.filing_frequency = 'quarterly'`, `tax.period_anchor = '01-01'` — stagger group 1 default; `tax.period_anchor` is NOT country-locked, so it is tenant-overridable at the tenant layer); GB pack v1 draft. All three `tax.*` composer/filing keys are registered `ConfigKeyDef`s (Task 3b); `country_config` is their governed country-layer store.

- [ ] **Step 1: Failing probe**

```sql
SELECT
  (SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id = r.country_id WHERE c.code = 'GB') AS gb_rates,
  (SELECT count(*) FROM master_einvoice_regimes e JOIN geo_countries c ON c.id = e.country_id WHERE c.code = 'GB') AS gb_regimes,
  (SELECT count(*) FROM master_document_requirements q JOIN geo_countries c ON c.id = q.country_id WHERE c.code = 'GB') AS gb_reqs;
```

Expected: all three `0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` name `phase5_uk_pack_data`:

```sql
-- Phase 5 / M5-3 — UK pack v1 (DRAFT): 20/5/0 VAT rates (simple_vat plugin),
-- reverse-charge buyer-VAT requirement, uk_mtd filing_api regime row.
WITH gb AS (SELECT id FROM geo_countries WHERE code = 'GB'),
pack AS (
  INSERT INTO master_country_pack_versions (country_id, version, status, effective_from, changelog, authored_by)
  SELECT gb.id, 1, 'draft', '2026-07-01',
         'UK pack v1: simple_vat 20/5/0; reverse-charge buyer VAT requirement; uk_mtd_9box composer; uk_mtd filing transport (stagger groups).',
         NULL
  FROM gb
  RETURNING id, country_id
)
INSERT INTO geo_country_tax_rates
  (country_id, subdivision_id, component_code, component_label, tax_category, rate, applies_to, valid_from, valid_to, pack_version_id, data_source, source_version, sort_order)
SELECT pack.country_id, NULL, 'VAT', v.label, v.category, v.rate, NULL, v.valid_from::date, NULL, pack.id, 'hmrc_published', 'VAT-2011', v.ord
FROM pack
JOIN (VALUES
  ('VAT (Standard 20%)', 'standard', 20.0000, '2011-01-04', 1),
  ('VAT (Reduced 5%)',   'reduced',   5.0000, '2011-01-04', 2),
  ('VAT (Zero Rate)',    'zero',      0.0000, '2011-01-04', 3)
) AS v(label, category, rate, valid_from, ord) ON true;

WITH gb AS (SELECT id FROM geo_countries WHERE code = 'GB'),
pv AS (SELECT v.id FROM master_country_pack_versions v JOIN gb ON v.country_id = gb.id WHERE v.version = 1)
INSERT INTO master_document_requirements
  (country_id, doc_type, field_key, condition, level, message_i18n, effective_from, pack_version_id)
SELECT gb.id, 'invoice', 'buyer_tax_number',
       '{"all":[{"fact":"tax_treatment","op":"eq","value":"reverse_charge"}]}'::jsonb,
       'block',
       '{"en":"Buyer VAT registration number is required for reverse-charge B2B invoices."}'::jsonb,
       '2026-07-01', pv.id
FROM gb, pv;

WITH gb AS (SELECT id FROM geo_countries WHERE code = 'GB')
INSERT INTO master_einvoice_regimes
  (country_id, code, regime_class, adapter_key, mandatory_from, thresholds, config)
SELECT gb.id, 'uk_mtd', 'filing_api', 'uk_mtd', '2019-04-01',
       '{"vat_registration_threshold_gbp": 90000}'::jsonb,
       '{"base_url_sandbox": "https://test-api.service.hmrc.gov.uk", "base_url_live": "https://api.service.hmrc.gov.uk", "stagger_groups": {"1": "01-01", "2": "02-01", "3": "03-01"}}'::jsonb
FROM gb;

UPDATE geo_countries
SET country_config = country_config || jsonb_build_object(
      'regime.einvoice',      'uk_mtd',
      'tax.return_composer',  'uk_mtd_9box',
      'tax.filing_frequency', 'quarterly',
      'tax.period_anchor',    '01-01'
    )
WHERE code = 'GB';

INSERT INTO master_engine_capabilities (capability_key, kind, min_engine_version)
VALUES
  ('uk_mtd_9box', 'regime_adapter',   '1.0.0'),
  ('uk_mtd',      'filing_transport', '1.0.0')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Assert the applied state**

```sql
SELECT
  (SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id = r.country_id WHERE c.code = 'GB') AS gb_rates,
  (SELECT regime_class FROM master_einvoice_regimes e JOIN geo_countries c ON c.id = e.country_id WHERE c.code = 'GB' AND e.code = 'uk_mtd') AS mtd_class,
  (SELECT level FROM master_document_requirements q JOIN geo_countries c ON c.id = q.country_id WHERE c.code = 'GB' AND q.field_key = 'buyer_tax_number') AS req_level,
  (SELECT country_config->>'tax.return_composer' FROM geo_countries WHERE code = 'GB') AS composer;
```

Expected: `gb_rates = 3`, `mtd_class = 'filing_api'`, `req_level = 'block'`, `composer = 'uk_mtd_9box'`.

- [ ] **Step 4: Manifest row, PR gate, commit**

Append manifest row:

```
| <version> | phase5_uk_pack_data.sql | Additive | UK pack v1 draft: VAT 20/5/0 rows, reverse-charge requirement, uk_mtd filing_api regime, composer keys | #<PR> |
```

Run the standing gates (data-only migrations — types unchanged, but prove it):

```bash
npm run typecheck    # expected: 0 errors
npm run test         # expected: all suites pass (no code changed yet)
git add supabase/migrations.manifest.md
git commit -m "feat(l10n-p5): UK pack v1 draft data (VAT 20/5/0, MTD regime row, reverse-charge requirement)"
```

### Task 3b: Register the return-composer + filing binding config keys (Country Engine)

Tasks 2/3 seed `tax.return_composer` / `tax.filing_frequency` / `tax.period_anchor` into `geo_countries.country_config`. Those are the country LAYER of a governed cascade — but the cascade throws on any **unregistered** key, so the keys must exist in `COUNTRY_CONFIG_REGISTRY`. This task registers them and keeps the registry↔trigger parity gate green. Same WP-1 PR (migration-classified).

**STOP-first check:** `grep -n "tax.return_composer\|return_composer\|filing_frequency" src/lib/country/registry.ts`. If Phase 3 ALREADY registered a per-country composer-binding key (any name), this task is a **reconciliation no-op**: rename the Tasks 2/3/16 references + this task to Phase-3's key names and SKIP the additions below (do not double-register). Only if no composer-binding key exists do you add the three keys.

**Files:**
- Modify: `src/lib/country/registry.ts` (append 3 `ConfigKeyDef` entries to `COUNTRY_CONFIG_REGISTRY`)
- Migration: `phase5_return_composer_statutory_key` via `mcp__supabase__apply_migration`
- Modify: `supabase/migrations.manifest.md`
- Test: `src/lib/country/registry.returnComposer.test.ts`

**Interfaces:**
- Consumes: `COUNTRY_CONFIG_REGISTRY`, `REGISTRY_BY_KEY`, `STATUTORY_KEYS`, `resolveCountryConfigKey` (`src/lib/country/registry.ts:216-229`); `CountryConfigError` (`src/lib/country/resolveCountryConfig.ts`); the live `validate_country_config_overrides()` trigger + its parity gate `scripts/country-engine/registry-trigger-parity.test.ts`
- Produces: registered keys `tax.return_composer` (country-locked), `tax.filing_frequency`, `tax.period_anchor` — the governed home for Tasks 2/3's `country_config` writes and Phase-3's `resolveCountryConfigKey` reads

- [ ] **Step 1: Write the failing test**

Create `src/lib/country/registry.returnComposer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { REGISTRY_BY_KEY, STATUTORY_KEYS, resolveCountryConfigKey } from './registry';
import type { ConfigLayers } from './resolveCountryConfig';

const EMPTY: ConfigLayers = { country: {}, legal_entity: {}, tenant: {}, business_unit: {} } as ConfigLayers;

describe('return-composer + filing config keys (Phase 5, Task 3b)', () => {
  it('all three keys are registered and resolve their coded defaults (no CountryConfigError)', () => {
    expect(() => resolveCountryConfigKey(EMPTY, 'tax.return_composer')).not.toThrow();
    expect(resolveCountryConfigKey(EMPTY, 'tax.return_composer')).toBe('none');
    expect(resolveCountryConfigKey(EMPTY, 'tax.filing_frequency')).toBe('quarterly');
    expect(resolveCountryConfigKey(EMPTY, 'tax.period_anchor')).toBe('01-01');
  });
  it('tax.return_composer is country-locked (a compliance binding tenants cannot forge)', () => {
    expect(REGISTRY_BY_KEY['tax.return_composer'].maxOverrideLayer).toBe('country');
    expect(STATUTORY_KEYS).toContain('tax.return_composer');
  });
  it('filing cadence + anchor are tenant-overridable (NOT country-locked)', () => {
    expect(REGISTRY_BY_KEY['tax.filing_frequency'].maxOverrideLayer).toBeUndefined();
    expect(REGISTRY_BY_KEY['tax.period_anchor'].maxOverrideLayer).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/country/registry.returnComposer.test.ts`
Expected: FAIL — `resolveCountryConfigKey(EMPTY, 'tax.return_composer')` throws `CountryConfigError: Unregistered country-config key: tax.return_composer`.

- [ ] **Step 3: Register the three keys**

Append to `COUNTRY_CONFIG_REGISTRY` in `src/lib/country/registry.ts` (after the existing `tax.*` block; `z` is already imported):

```typescript
  // ── tax return composer + filing binding (Phase 5) ──
  {
    // Which registered ReturnComposer builds this country's statutory return
    // (gcc_return, gstr, uk_mtd_9box, us_jurisdiction_remit). A COMPLIANCE
    // binding tenants must not swap ⇒ country-locked (D11). Countries with no
    // return pipeline resolve the benign 'none'; Phase-3's pipeline only calls
    // resolveReturnComposer when the resolved value !== 'none'.
    key: 'tax.return_composer',
    domain: 'tax',
    label: 'Return composer',
    description: 'Registry key of the ReturnComposer that builds the country statutory return. Jurisdiction-derived, country-locked (D11).',
    schema: z.string().min(1),
    codedDefault: 'none',
    maxOverrideLayer: 'country',
  },
  {
    // Default statutory filing cadence; a tenant/registration may file on a
    // different cadence, so NOT country-locked.
    key: 'tax.filing_frequency',
    domain: 'tax',
    label: 'Filing frequency',
    description: 'Default statutory return filing cadence for the country. Tenant/registration may override.',
    schema: z.enum(['monthly', 'quarterly', 'annual']),
    codedDefault: 'quarterly',
  },
  {
    // MM-DD anchor for return period boundaries (e.g. UK VAT stagger group).
    // Stagger groups are per-tenant, so tenant-overridable (NOT country-locked).
    key: 'tax.period_anchor',
    domain: 'tax',
    label: 'Return period anchor',
    description: 'MM-DD anchor for statutory return period boundaries (e.g. UK VAT stagger group). Tenant-overridable.',
    schema: z.string().regex(/^\d{2}-\d{2}$/),
    codedDefault: '01-01',
  },
```

- [ ] **Step 4: Run the registry test + typecheck**

Run: `npx vitest run src/lib/country/registry.returnComposer.test.ts && npm run typecheck`
Expected: PASS, 0 tsc errors.

- [ ] **Step 5: Apply the trigger-parity migration**

Registering a `maxOverrideLayer:'country'` key adds it to `STATUTORY_KEYS`; the `check:registry-trigger-parity` gate then requires the DB trigger's `statutory_keys` array to match. Apply `mcp__supabase__apply_migration` name `phase5_return_composer_statutory_key` — a faithful `CREATE OR REPLACE` of the live function body (captured 2026-06-16) with `tax.return_composer` added to the sorted array:

```sql
CREATE OR REPLACE FUNCTION public.validate_country_config_overrides()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  statutory_keys text[] := ARRAY['tax.return_composer','tax.zatca_qr.enabled'];
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

- [ ] **Step 6: Verify parity + assert the trigger array**

```bash
npm run check:registry-trigger-parity   # STATUTORY_KEYS ⇔ trigger statutory_keys — expected: in parity
```

And prove the DB side via `mcp__supabase__execute_sql`:

```sql
SELECT pg_get_functiondef(p.oid) LIKE '%tax.return_composer%' AS has_key
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'validate_country_config_overrides';
```

Expected: `has_key = true`.

- [ ] **Step 7: Manifest row + commit**

```
| <version> | phase5_return_composer_statutory_key.sql | Additive | Add tax.return_composer to validate_country_config_overrides() statutory_keys (registry-trigger parity for Task 3b) | #<PR> |
```

```bash
git add src/lib/country/registry.ts src/lib/country/registry.returnComposer.test.ts supabase/migrations.manifest.md
git commit -m "feat(l10n-p5): register tax.return_composer/filing_frequency/period_anchor config keys + trigger parity"
```

Open PR `feat/l10n-p5-us-uk-pack-data` using `.github/PULL_REQUEST_TEMPLATE/migration.md`.

---

# WP-2 — `us_sales_tax` TaxStrategy (jurisdiction_stack parameterization)

Branch: `feat/l10n-p5-us-sales-tax` cut fresh from `main` after WP-1 merges.

### Task 4: Fact assembler — ship-to subdivision-path rate scoping

**Files:**
- Modify: `src/lib/taxDocumentService.ts` (`computeDocumentTotals` — the Phase-1 inline `TaxContext` builder where `ctx.rates` is set from `matchFormRate`; add the path resolver + scoping described below; this makes the DB path-resolution async, matching the `Promise<TaxContext>` shape the pure kernel already expects)
- Create: `src/lib/tax/subdivisionPath.ts`
- Test: `src/lib/tax/subdivisionPath.test.ts`

**Interfaces:**
- Consumes: `supabase` client (`src/lib/supabaseClient.ts`), `geo_subdivisions` rows (Task 1), `GeoCountryTaxRateRow` from `src/lib/regimes/types.ts`
- Produces: `resolveSubdivisionPath(subdivisionId: string | null, fetchRow: (id: string) => Promise<{ id: string; parent_id: string | null } | null>): Promise<string[]>` (leaf-to-root id list, pure over an injected fetcher); `scopeRatesToPath(rates: GeoCountryTaxRateRow[], pathIds: string[]): GeoCountryTaxRateRow[]` — used by `computeDocumentTotals` whenever the resolved strategy's `schemeMode === 'jurisdiction_stack'`

- [ ] **Step 1: Write the failing test**

Create `src/lib/tax/subdivisionPath.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveSubdivisionPath, scopeRatesToPath } from './subdivisionPath';
import type { GeoCountryTaxRateRow } from '../regimes/types';

const tree: Record<string, { id: string; parent_id: string | null }> = {
  'sub-mta': { id: 'sub-mta', parent_id: 'sub-austin' },
  'sub-austin': { id: 'sub-austin', parent_id: 'sub-travis' },
  'sub-travis': { id: 'sub-travis', parent_id: 'sub-tx' },
  'sub-tx': { id: 'sub-tx', parent_id: null },
};
const fetchRow = async (id: string) => tree[id] ?? null;

function rateRow(id: string, subdivisionId: string | null): GeoCountryTaxRateRow {
  return {
    id, country_id: 'us', subdivision_id: subdivisionId, component_code: 'STATE',
    component_label: 'x', component_label_i18n: null, tax_category: 'standard',
    rate: 1, applies_to: null, valid_from: '2026-07-01', valid_to: null,
    pack_version_id: null, data_source: null, source_version: null, sort_order: 0,
    created_at: '2026-07-01T00:00:00Z', deleted_at: null,
  } as GeoCountryTaxRateRow;
}

describe('resolveSubdivisionPath', () => {
  it('walks leaf to root', async () => {
    expect(await resolveSubdivisionPath('sub-mta', fetchRow)).toEqual([
      'sub-mta', 'sub-austin', 'sub-travis', 'sub-tx',
    ]);
  });
  it('returns [] for null leaf', async () => {
    expect(await resolveSubdivisionPath(null, fetchRow)).toEqual([]);
  });
  it('throws on a cycle instead of looping forever', async () => {
    const cyclic = async (id: string) =>
      id === 'a' ? { id: 'a', parent_id: 'b' } : { id: 'b', parent_id: 'a' };
    await expect(resolveSubdivisionPath('a', cyclic)).rejects.toThrow(/cycle/i);
  });
});

describe('scopeRatesToPath', () => {
  it('keeps rows on the path plus country-level (null subdivision) rows', () => {
    const rows = [rateRow('r1', 'sub-tx'), rateRow('r2', 'sub-ca'), rateRow('r3', null)];
    const scoped = scopeRatesToPath(rows, ['sub-mta', 'sub-austin', 'sub-travis', 'sub-tx']);
    expect(scoped.map((r) => r.id)).toEqual(['r1', 'r3']);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/tax/subdivisionPath.test.ts`
Expected: FAIL — `Cannot find module './subdivisionPath'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/tax/subdivisionPath.ts`:

```typescript
import type { GeoCountryTaxRateRow } from '../regimes/types';

const MAX_DEPTH = 8;

/** Leaf-to-root subdivision id path. Pure over an injected row fetcher so the
 *  kernel-adjacent logic stays unit-testable without a live DB. */
export async function resolveSubdivisionPath(
  subdivisionId: string | null,
  fetchRow: (id: string) => Promise<{ id: string; parent_id: string | null } | null>,
): Promise<string[]> {
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor = subdivisionId;
  while (cursor) {
    if (seen.has(cursor) || path.length >= MAX_DEPTH) {
      throw new Error(`geo_subdivisions parent cycle detected at ${cursor}`);
    }
    seen.add(cursor);
    path.push(cursor);
    const row = await fetchRow(cursor);
    cursor = row?.parent_id ?? null;
  }
  return path;
}

/** jurisdiction_stack regimes compute over exactly the ship-to path:
 *  path-member rows + country-level (subdivision_id NULL) rows. */
export function scopeRatesToPath(
  rates: GeoCountryTaxRateRow[],
  pathIds: string[],
): GeoCountryTaxRateRow[] {
  const onPath = new Set(pathIds);
  return rates.filter((r) => r.subdivision_id === null || onPath.has(r.subdivision_id));
}
```

Then in `src/lib/taxDocumentService.ts` (`computeDocumentTotals` — where `ctx.rates` is assigned from `matchFormRate`, after the effective-date filter Phase 1 already performs), add:

```typescript
import { resolveSubdivisionPath, scopeRatesToPath } from './subdivisionPath';
import { resolveTaxStrategy } from '../regimes/registry';

// ... inside computeDocumentTotals, after regimeTaxKey and rates are resolved:
const strategy = resolveTaxStrategy(regimeTaxKey);
if (strategy.schemeMode === 'jurisdiction_stack') {
  const shipTo = placeOfSupplySubdivisionId ?? buyer.subdivisionId;
  const pathIds = await resolveSubdivisionPath(shipTo, async (id) => {
    const { data, error } = await supabase
      .from('geo_subdivisions')
      .select('id, parent_id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  });
  rates = scopeRatesToPath(rates, pathIds);
}
```

(Variable names `regimeTaxKey`, `rates`, `placeOfSupplySubdivisionId`, `buyer` above are illustrative; `computeDocumentTotals` builds the `TaxContext` inline over `input`/`rc` with its own locals — `ctx.rates` is set from `matchFormRate(effective, input.taxRate)` and the ship-to comes from the buyer / place-of-supply fields on `input`. Bind to the actual locals and record any rename in the PR description.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/tax/subdivisionPath.test.ts && npm run typecheck`
Expected: PASS, 0 tsc errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/subdivisionPath.ts src/lib/tax/subdivisionPath.test.ts src/lib/taxDocumentService.ts
git commit -m "feat(l10n-p5): scope jurisdiction_stack rates to the ship-to subdivision path"
```

### Task 5: `us_sales_tax` strategy — nexus, stacking, out-of-scope, exempt

**Files:**
- Create: `src/lib/regimes/us_sales_tax/index.ts`
- Test: `src/lib/regimes/us_sales_tax/index.test.ts`

**Interfaces:**
- Consumes: `computeDocumentTax(ctx: TaxContext): TaxComputation` (`src/lib/tax/kernel/index.ts`), types from `src/lib/regimes/types.ts`
- Produces: `usSalesTaxStrategy: TaxStrategy` (key `'us_sales_tax'`, version `'1.0.0'`, schemeMode `'jurisdiction_stack'`), `activeNexusSubdivisions(registrations, taxPointDate): Set<string>`, `US_SALES_TAX_VERSION` — consumed by Tasks 6, 9, 10

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/us_sales_tax/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { usSalesTaxStrategy, activeNexusSubdivisions, US_SALES_TAX_VERSION } from './index';
import type {
  TaxContext, TaxComputation, TaxableLine,
  GeoCountryTaxRateRow, LegalEntityTaxRegistrationRow,
} from '../types';

function rate(id: string, subdivisionId: string, componentCode: string, r: number,
  category: 'standard' | 'reduced' | 'zero' | 'exempt' = 'standard'): GeoCountryTaxRateRow {
  return {
    id, country_id: 'us', subdivision_id: subdivisionId, component_code: componentCode,
    component_label: `${componentCode} ${r}%`, component_label_i18n: null, tax_category: category,
    rate: r, applies_to: null, valid_from: '2026-07-01', valid_to: null, pack_version_id: null,
    data_source: null, source_version: null, sort_order: 0,
    created_at: '2026-07-01T00:00:00Z', deleted_at: null,
  } as GeoCountryTaxRateRow;
}

function registration(subdivisionId: string, from = '2026-01-01', to: string | null = null): LegalEntityTaxRegistrationRow {
  return {
    id: `reg-${subdivisionId}`, tenant_id: 't-1', legal_entity_id: 'le-1', country_id: 'us',
    subdivision_id: subdivisionId, tax_number: 'TX-REG-001', scheme: 'standard',
    registered_from: from, registered_to: to, is_primary: true,
    created_at: '2026-01-01T00:00:00Z', deleted_at: null,
  } as LegalEntityTaxRegistrationRow;
}

const line: TaxableLine = {
  lineItemId: 'li-1', description: 'RAID recovery', quantity: 1, unitPrice: 2000,
  lineDiscount: 0, unitCode: 'C62', itemCode: null, treatment: 'standard', treatmentReasonCode: null,
};

const TX_STACK = [rate('r-tx', 'sub-tx', 'STATE', 6.25), rate('r-city', 'sub-austin', 'CITY', 1), rate('r-mta', 'sub-mta', 'DISTRICT', 1)];

function ctx(overrides: Partial<TaxContext> = {}): TaxContext {
  return {
    documentType: 'invoice',
    seller: {
      legalEntityId: 'le-1', countryId: 'us', subdivisionId: 'sub-tx',
      taxIdentifier: '12-3456789', registrations: [registration('sub-tx')],
    },
    buyer: { taxNumber: null, countryId: 'us', subdivisionId: 'sub-mta', isBusiness: false, addressSnapshot: null },
    taxPointDate: '2026-07-15',
    placeOfSupplySubdivisionId: 'sub-mta',
    lines: [line],
    documentDiscount: 0,
    taxInclusive: false,
    rateContext: { documentCurrency: 'USD', documentDecimals: 2, baseCurrency: 'USD', baseDecimals: 2, rate: 1, rateSource: 'derived' },
    rates: TX_STACK,
    roundingPolicy: { mode: 'half_up', level: 'document' },
    scaleSystem: 'western',
    ...overrides,
  };
}

describe('activeNexusSubdivisions', () => {
  it('includes registrations covering the tax point date', () => {
    expect(activeNexusSubdivisions([registration('sub-tx')], '2026-07-15')).toEqual(new Set(['sub-tx']));
  });
  it('excludes expired, future, unregistered-scheme, and soft-deleted rows', () => {
    const rows = [
      registration('sub-a', '2026-01-01', '2026-06-30'),
      registration('sub-b', '2026-08-01', null),
      { ...registration('sub-c'), scheme: 'unregistered' } as LegalEntityTaxRegistrationRow,
      { ...registration('sub-d'), deleted_at: '2026-05-01T00:00:00Z' } as LegalEntityTaxRegistrationRow,
    ];
    expect(activeNexusSubdivisions(rows, '2026-07-15').size).toBe(0);
  });
});

describe('usSalesTaxStrategy', () => {
  it('declares the contract metadata', () => {
    expect(usSalesTaxStrategy.key).toBe('us_sales_tax');
    expect(usSalesTaxStrategy.version).toBe(US_SALES_TAX_VERSION);
    expect(usSalesTaxStrategy.schemeMode).toBe('jurisdiction_stack');
    expect(usSalesTaxStrategy.defaults).toEqual({
      roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western',
    });
  });

  it('stacks STATE + CITY + DISTRICT components on the Austin path (8.25% on $2,000)', async () => {
    const result = (await usSalesTaxStrategy.compute(ctx())) as TaxComputation;
    const byCode = Object.fromEntries(result.rollups.map((r) => [r.componentCode, r.taxAmount]));
    expect(byCode).toEqual({ STATE: 125, CITY: 20, DISTRICT: 20 });
    expect(result.totals.taxTotal).toBe(165);
    expect(result.totals.grandTotal).toBe(2165);
  });

  it('is out_of_scope with ZERO components when no nexus covers the ship-to state', async () => {
    const caCtx = ctx({ rates: [rate('r-ca', 'sub-ca', 'STATE', 7.25)], placeOfSupplySubdivisionId: 'sub-ca' });
    const result = (await usSalesTaxStrategy.compute(caCtx)) as TaxComputation;
    expect(result.rollups).toHaveLength(0);
    expect(result.totals.taxTotal).toBe(0);
    expect(result.totals.grandTotal).toBe(2000);
  });

  it('is out_of_scope when the nexus registration has ended before the tax point', async () => {
    const ended = ctx({ seller: { ...ctx().seller, registrations: [registration('sub-tx', '2026-01-01', '2026-06-30')] } });
    const result = (await usSalesTaxStrategy.compute(ended)) as TaxComputation;
    expect(result.rollups).toHaveLength(0);
    expect(result.totals.taxTotal).toBe(0);
  });

  it('preserves classification for an exempt-category state (component row, exempt treatment, 0 tax)', async () => {
    const deCtx = ctx({
      rates: [rate('r-de', 'sub-de', 'STATE', 0, 'exempt')],
      placeOfSupplySubdivisionId: 'sub-de',
      seller: { ...ctx().seller, registrations: [registration('sub-de')] },
    });
    const result = (await usSalesTaxStrategy.compute(deCtx)) as TaxComputation;
    expect(result.totals.taxTotal).toBe(0);
    expect(result.rollups.every((r) => r.taxTreatment === 'exempt' && r.taxAmount === 0)).toBe(true);
    expect(result.rollups.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/us_sales_tax/index.test.ts`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/us_sales_tax/index.ts`:

```typescript
import type {
  TaxStrategy, TaxContext, TaxComputation, LegalEntityTaxRegistrationRow,
} from '../types';
import { computeDocumentTax } from '../../tax/kernel';

export const US_SALES_TAX_VERSION = '1.0.0';

/** Nexus as data: subdivision ids with a registration active on the tax point date. */
export function activeNexusSubdivisions(
  registrations: LegalEntityTaxRegistrationRow[],
  taxPointDate: string,
): Set<string> {
  const active = new Set<string>();
  for (const reg of registrations) {
    if (reg.deleted_at !== null) continue;
    if (reg.scheme === 'unregistered') continue;
    if (!reg.subdivision_id) continue;
    if (reg.registered_from > taxPointDate) continue;
    if (reg.registered_to !== null && reg.registered_to < taxPointDate) continue;
    active.add(reg.subdivision_id);
  }
  return active;
}

function downgradeToOutOfScope(ctx: TaxContext): TaxContext {
  return {
    ...ctx,
    rates: [],
    lines: ctx.lines.map((l) => ({
      ...l, treatment: 'out_of_scope' as const, treatmentReasonCode: 'NO_NEXUS',
    })),
  };
}

/** jurisdiction_stack parameterization: the kernel stacks whatever path-scoped
 *  rate rows the context carries; this strategy decides scope — nexus present
 *  (state-level registration active at tax point) or the sale is out_of_scope.
 *  Exempt-category state rows preserve classification (component row @ 0). */
export const usSalesTaxStrategy: TaxStrategy = {
  key: 'us_sales_tax',
  version: US_SALES_TAX_VERSION,
  schemeMode: 'jurisdiction_stack',
  defaults: { roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western' },
  compute(ctx: TaxContext): TaxComputation {
    const nexus = activeNexusSubdivisions(ctx.seller.registrations, ctx.taxPointDate);
    const stateRow = ctx.rates.find(
      (r) => r.component_code === 'STATE' && r.subdivision_id !== null,
    );
    if (!stateRow || !nexus.has(stateRow.subdivision_id as string)) {
      return computeDocumentTax(downgradeToOutOfScope(ctx));
    }
    if (stateRow.tax_category === 'exempt') {
      return computeDocumentTax({
        ...ctx,
        rates: [stateRow],
        lines: ctx.lines.map((l) =>
          l.treatment === 'standard'
            ? { ...l, treatment: 'exempt' as const, treatmentReasonCode: 'STATE_EXEMPT_SERVICES' }
            : l,
        ),
      });
    }
    return computeDocumentTax(ctx);
  },
};
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/us_sales_tax/index.test.ts && npm run typecheck`
Expected: PASS (6 tests), 0 tsc errors. The exempt-state assertion (`result.rollups.every(r => r.taxTreatment === 'exempt' && r.taxAmount === 0)` with `rollups.length > 0`) relies on the **confirmed Phase-1 kernel property** stated in the Entry criteria: `computeDocumentTax` emits a classified 0-amount rollup for `exempt` treatments ("preserving classification", spec line 1024). If this assertion fails, do NOT weaken the test and do NOT patch `src/lib/tax/kernel` from inside this task — **STOP**: the Phase-1 kernel is not honoring its exempt contract, which is a cross-phase kernel change requiring its own failing kernel test plus an Oman/India fixture-parity re-run. Escalate it to a Phase-1 kernel-amendment commit (per the Entry-criteria STOP rule) and resume Task 5 once that predecessor is merged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/us_sales_tax/
git commit -m "feat(l10n-p5): us_sales_tax TaxStrategy — nexus-gated jurisdiction stacking"
```

### Task 6: US golden fixtures + registration + statutory-fixtures wiring

**Files:**
- Create: `src/lib/regimes/us_sales_tax/fixtures/us_austin_stack.json`
- Create: `src/lib/regimes/us_sales_tax/fixtures/us_ca_no_nexus.json`
- Create: `src/lib/regimes/us_sales_tax/fixtures/us_de_exempt_state.json`
- Create: `src/lib/regimes/us_sales_tax/fixtures/us_nexus_expired.json`
- Modify: `scripts/localization/statutory-fixtures.test.ts` (add `US` to the CI gate's country list with hardcoded fixture JSON imports — mirrors Phase 3 Task 31's AE/SA wiring)
- Modify: `src/lib/regimes/register.ts` (register `usSalesTaxStrategy`)
- Test: `src/lib/regimes/us_sales_tax/fixtures.test.ts`

**Interfaces:**
- Consumes: `runPublishGate({ countryCode, fixtures, mode: 'kernel' })` + `PackFixture` (`src/lib/tax/publishGate.ts`), the four US fixture JSON files (imported directly), `registerRegimePlugin` (`src/lib/regimes/registry.ts`)
- Produces: `US` fixture set (also inserted DB-side in Task 24) — the `statutory-fixtures` CI job picks it up automatically once US flips `statutory_ready` (Task 26)

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/us_sales_tax/fixtures.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import '../register';
import { runPublishGate } from '../../tax/publishGate';
import type { PackFixture } from '../../tax/publishGate';
import usAustinStack from './fixtures/us_austin_stack.json';
import usCaNoNexus from './fixtures/us_ca_no_nexus.json';
import usDeExemptState from './fixtures/us_de_exempt_state.json';
import usNexusExpired from './fixtures/us_nexus_expired.json';

const US_FIXTURES = [usAustinStack, usCaNoNexus, usDeExemptState, usNexusExpired] as PackFixture[];

describe('US pack fixtures (repo-resident golden evidence)', () => {
  it('exposes the four US fixtures', () => {
    const names = US_FIXTURES.map((f) => f.name);
    expect(names).toEqual([
      'us_austin_stack', 'us_ca_no_nexus', 'us_de_exempt_state', 'us_nexus_expired',
    ]);
  });

  it('replays green through the shared publish-gate runner (kernel mode)', async () => {
    const { pass, results } = await runPublishGate({
      countryCode: 'US',
      fixtures: US_FIXTURES,
      mode: 'kernel',
    });
    expect(results.flatMap((r) => r.diffs)).toEqual([]);
    expect(pass).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/us_sales_tax/fixtures.test.ts`
Expected: FAIL — `Cannot find module './fixtures/us_austin_stack.json'` (fixture files not created yet).

- [ ] **Step 3: Create the fixture files and wire the statutory-fixtures gate**

Create `src/lib/regimes/us_sales_tax/fixtures/us_austin_stack.json` (the `input_document` shape is the Phase-1 publish-gate convention: the assembled-context inputs; `expected` asserts rollups and totals):

```json
{
  "name": "us_austin_stack",
  "input_document": {
    "documentType": "invoice",
    "regimeTaxKey": "us_sales_tax",
    "currency": "USD",
    "documentDecimals": 2,
    "taxPointDate": "2026-07-15",
    "taxInclusive": false,
    "documentDiscount": 0,
    "roundingPolicy": { "mode": "half_up", "level": "document" },
    "scaleSystem": "western",
    "seller": {
      "subdivisionCode": "TX",
      "registrations": [{ "subdivisionCode": "TX", "taxNumber": "TX-REG-001", "scheme": "standard", "registeredFrom": "2026-01-01", "registeredTo": null }]
    },
    "buyer": { "taxNumber": null, "isBusiness": false, "subdivisionCode": "TX-AUSTIN-MTA" },
    "placeOfSupplySubdivisionCode": "TX-AUSTIN-MTA",
    "rates": [
      { "subdivisionCode": "TX", "componentCode": "STATE", "componentLabel": "Texas State Sales Tax", "taxCategory": "standard", "rate": 6.25, "validFrom": "2026-07-01" },
      { "subdivisionCode": "TX-AUSTIN", "componentCode": "CITY", "componentLabel": "City of Austin Sales Tax", "taxCategory": "standard", "rate": 1.0, "validFrom": "2026-07-01" },
      { "subdivisionCode": "TX-AUSTIN-MTA", "componentCode": "DISTRICT", "componentLabel": "Austin MTA Transit Tax", "taxCategory": "standard", "rate": 1.0, "validFrom": "2026-07-01" }
    ],
    "lines": [{ "lineItemId": "li-1", "description": "Data recovery — 2TB SSD", "quantity": 1, "unitPrice": 2000, "lineDiscount": 0, "unitCode": "C62", "itemCode": null, "treatment": "standard", "treatmentReasonCode": null }]
  },
  "expected": {
    "rollups": [
      { "componentCode": "STATE", "rate": 6.25, "taxableBase": 2000, "taxAmount": 125, "taxTreatment": "standard" },
      { "componentCode": "CITY", "rate": 1.0, "taxableBase": 2000, "taxAmount": 20, "taxTreatment": "standard" },
      { "componentCode": "DISTRICT", "rate": 1.0, "taxableBase": 2000, "taxAmount": 20, "taxTreatment": "standard" }
    ],
    "totals": { "taxableBase": 2000, "taxTotal": 165, "grandTotal": 2165, "roundingAdjustment": null }
  }
}
```

Create `src/lib/regimes/us_sales_tax/fixtures/us_ca_no_nexus.json` (COMPLETE — no deltas; CA ship-to, seller registered only in TX ⇒ `out_of_scope`, zero components):

```json
{
  "name": "us_ca_no_nexus",
  "input_document": {
    "documentType": "invoice",
    "regimeTaxKey": "us_sales_tax",
    "currency": "USD",
    "documentDecimals": 2,
    "taxPointDate": "2026-07-15",
    "taxInclusive": false,
    "documentDiscount": 0,
    "roundingPolicy": { "mode": "half_up", "level": "document" },
    "scaleSystem": "western",
    "seller": {
      "subdivisionCode": "TX",
      "registrations": [{ "subdivisionCode": "TX", "taxNumber": "TX-REG-001", "scheme": "standard", "registeredFrom": "2026-01-01", "registeredTo": null }]
    },
    "buyer": { "taxNumber": null, "isBusiness": false, "subdivisionCode": "CA" },
    "placeOfSupplySubdivisionCode": "CA",
    "rates": [
      { "subdivisionCode": "CA", "componentCode": "STATE", "componentLabel": "California State Sales Tax", "taxCategory": "standard", "rate": 7.25, "validFrom": "2026-07-01" }
    ],
    "lines": [{ "lineItemId": "li-1", "description": "Data recovery — 2TB SSD", "quantity": 1, "unitPrice": 2000, "lineDiscount": 0, "unitCode": "C62", "itemCode": null, "treatment": "standard", "treatmentReasonCode": null }]
  },
  "expected": {
    "rollups": [],
    "totals": { "taxableBase": 2000, "taxTotal": 0, "grandTotal": 2000, "roundingAdjustment": null }
  }
}
```

Create `src/lib/regimes/us_sales_tax/fixtures/us_de_exempt_state.json` (COMPLETE — DE ship-to, DE registration present, exempt-category state ⇒ classified 0-amount rollup):

```json
{
  "name": "us_de_exempt_state",
  "input_document": {
    "documentType": "invoice",
    "regimeTaxKey": "us_sales_tax",
    "currency": "USD",
    "documentDecimals": 2,
    "taxPointDate": "2026-07-15",
    "taxInclusive": false,
    "documentDiscount": 0,
    "roundingPolicy": { "mode": "half_up", "level": "document" },
    "scaleSystem": "western",
    "seller": {
      "subdivisionCode": "DE",
      "registrations": [{ "subdivisionCode": "DE", "taxNumber": "DE-REG-001", "scheme": "standard", "registeredFrom": "2026-01-01", "registeredTo": null }]
    },
    "buyer": { "taxNumber": null, "isBusiness": false, "subdivisionCode": "DE" },
    "placeOfSupplySubdivisionCode": "DE",
    "rates": [
      { "subdivisionCode": "DE", "componentCode": "STATE", "componentLabel": "Delaware (No Sales Tax)", "taxCategory": "exempt", "rate": 0, "validFrom": "2026-07-01" }
    ],
    "lines": [{ "lineItemId": "li-1", "description": "Data recovery — 2TB SSD", "quantity": 1, "unitPrice": 2000, "lineDiscount": 0, "unitCode": "C62", "itemCode": null, "treatment": "standard", "treatmentReasonCode": null }]
  },
  "expected": {
    "rollups": [
      { "componentCode": "STATE", "rate": 0, "taxableBase": 2000, "taxAmount": 0, "taxTreatment": "exempt" }
    ],
    "totals": { "taxableBase": 2000, "taxTotal": 0, "grandTotal": 2000, "roundingAdjustment": null }
  }
}
```

Create `src/lib/regimes/us_sales_tax/fixtures/us_nexus_expired.json` (COMPLETE — TX Austin stack, but the TX registration ended 2026-06-30 while the sale is 2026-07-15 ⇒ nexus lapsed ⇒ `out_of_scope`):

```json
{
  "name": "us_nexus_expired",
  "input_document": {
    "documentType": "invoice",
    "regimeTaxKey": "us_sales_tax",
    "currency": "USD",
    "documentDecimals": 2,
    "taxPointDate": "2026-07-15",
    "taxInclusive": false,
    "documentDiscount": 0,
    "roundingPolicy": { "mode": "half_up", "level": "document" },
    "scaleSystem": "western",
    "seller": {
      "subdivisionCode": "TX",
      "registrations": [{ "subdivisionCode": "TX", "taxNumber": "TX-REG-001", "scheme": "standard", "registeredFrom": "2026-01-01", "registeredTo": "2026-06-30" }]
    },
    "buyer": { "taxNumber": null, "isBusiness": false, "subdivisionCode": "TX-AUSTIN-MTA" },
    "placeOfSupplySubdivisionCode": "TX-AUSTIN-MTA",
    "rates": [
      { "subdivisionCode": "TX", "componentCode": "STATE", "componentLabel": "Texas State Sales Tax", "taxCategory": "standard", "rate": 6.25, "validFrom": "2026-07-01" },
      { "subdivisionCode": "TX-AUSTIN", "componentCode": "CITY", "componentLabel": "City of Austin Sales Tax", "taxCategory": "standard", "rate": 1.0, "validFrom": "2026-07-01" },
      { "subdivisionCode": "TX-AUSTIN-MTA", "componentCode": "DISTRICT", "componentLabel": "Austin MTA Transit Tax", "taxCategory": "standard", "rate": 1.0, "validFrom": "2026-07-01" }
    ],
    "lines": [{ "lineItemId": "li-1", "description": "Data recovery — 2TB SSD", "quantity": 1, "unitPrice": 2000, "lineDiscount": 0, "unitCode": "C62", "itemCode": null, "treatment": "standard", "treatmentReasonCode": null }]
  },
  "expected": {
    "rollups": [],
    "totals": { "taxableBase": 2000, "taxTotal": 0, "grandTotal": 2000, "roundingAdjustment": null }
  }
}
```

Extend the Phase-1 `statutory-fixtures` gate `scripts/localization/statutory-fixtures.test.ts` — add hardcoded US fixture imports to its per-country fixtures map (the same hardcoded-import pattern Phase 1 established for OM and Phase 3 Task 31 for AE/SA):

```typescript
import usAustinStack from '../../src/lib/regimes/us_sales_tax/fixtures/us_austin_stack.json';
import usCaNoNexus from '../../src/lib/regimes/us_sales_tax/fixtures/us_ca_no_nexus.json';
import usDeExemptState from '../../src/lib/regimes/us_sales_tax/fixtures/us_de_exempt_state.json';
import usNexusExpired from '../../src/lib/regimes/us_sales_tax/fixtures/us_nexus_expired.json';

// add to the gate's per-country fixtures map (same shape as its OM/AE/SA entries):
  US: [usAustinStack, usCaNoNexus, usDeExemptState, usNexusExpired] as PackFixture[],
```

Modify `src/lib/regimes/register.ts` — add:

```typescript
import { usSalesTaxStrategy } from './us_sales_tax';

registerRegimePlugin('tax', usSalesTaxStrategy);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/us_sales_tax/ && npm run typecheck && npx eslint src/lib/regimes src/lib/tax`
Expected: PASS; 0 tsc errors; no `no-country-branching-outside-regimes` / `no-adhoc-money-allocation` violations.

- [ ] **Step 5: Commit + PR**

```bash
git add src/lib/regimes/us_sales_tax/ scripts/localization/statutory-fixtures.test.ts src/lib/regimes/register.ts
git commit -m "feat(l10n-p5): US golden fixtures + us_sales_tax registration"
```

Open PR `feat/l10n-p5-us-sales-tax`.

---

# WP-3 — Provider seam: Avalara/TaxJar adapters on the same `TaxStrategy` interface

Branch: `feat/l10n-p5-provider-seam` cut fresh from `main` after WP-2 merges.

### Task 7: `ProviderTransport` seam + stub transport (the documented integration double)

**Files:**
- Create: `src/lib/regimes/providers/providerTransport.ts`
- Create: `src/lib/regimes/providers/stubTransport.ts`
- Test: `src/lib/regimes/providers/stubTransport.test.ts`

**Interfaces:**
- Consumes: `TaxDocumentType` from `src/lib/regimes/types.ts`
- Produces: `ProviderTransport`, `ProviderTaxRequest`, `ProviderTaxRequestLine`, `ProviderTaxComponent`, `ProviderTaxResponse`, `ProviderUnavailableError`, `createStubProviderTransport` — consumed by Tasks 8–10

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/providers/stubTransport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createStubProviderTransport, stubRequestKey } from './stubTransport';
import { ProviderUnavailableError, type ProviderTaxRequest, type ProviderTaxResponse } from './providerTransport';

const request: ProviderTaxRequest = {
  providerKey: 'avalara', documentType: 'invoice', taxDate: '2026-07-15', currency: 'USD',
  shipFromSubdivisionId: 'sub-tx', shipToSubdivisionId: 'sub-mta', shipToAddress: null,
  buyerIsBusiness: false, documentDiscount: 0,
  lines: [{ lineItemId: 'li-1', description: 'Recovery', quantity: 1, unitPrice: 2000, lineDiscount: 0, itemCode: null }],
};

const canned: ProviderTaxResponse = {
  providerReference: 'AVA-TEST-1',
  totalTax: 165,
  components: [
    { lineItemId: null, componentCode: 'STATE', componentLabel: 'TX State', jurisdictionRef: 'sub-tx', rate: 6.25, taxableBase: 2000, taxAmount: 125 },
    { lineItemId: null, componentCode: 'CITY', componentLabel: 'Austin', jurisdictionRef: 'sub-austin', rate: 1, taxableBase: 2000, taxAmount: 20 },
    { lineItemId: null, componentCode: 'DISTRICT', componentLabel: 'Austin MTA', jurisdictionRef: 'sub-mta', rate: 1, taxableBase: 2000, taxAmount: 20 },
  ],
};

describe('createStubProviderTransport', () => {
  it('returns the canned response for a known request key', async () => {
    const transport = createStubProviderTransport('avalara', new Map([[stubRequestKey(request), canned]]));
    await expect(transport.calculate(request)).resolves.toEqual(canned);
  });

  it('throws ProviderUnavailableError for unknown requests (the graceful-fallback signal)', async () => {
    const transport = createStubProviderTransport('avalara');
    await expect(transport.calculate(request)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('keys deterministically on ship-to + date + line economics', () => {
    expect(stubRequestKey(request)).toBe(stubRequestKey({ ...request }));
    expect(stubRequestKey(request)).not.toBe(stubRequestKey({ ...request, taxDate: '2026-08-01' }));
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/providers/stubTransport.test.ts`
Expected: FAIL — `Cannot find module './stubTransport'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/providers/providerTransport.ts`:

```typescript
import type { TaxDocumentType } from '../types';

export interface ProviderTaxRequestLine {
  lineItemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  itemCode: string | null;
}

export interface ProviderTaxRequest {
  providerKey: 'avalara' | 'taxjar';
  documentType: TaxDocumentType;
  taxDate: string;                      // YYYY-MM-DD tax point
  currency: string;
  shipFromSubdivisionId: string | null;
  shipToSubdivisionId: string | null;
  shipToAddress: Record<string, unknown> | null;   // street-level accuracy is provider-gated
  buyerIsBusiness: boolean;
  lines: ProviderTaxRequestLine[];
  documentDiscount: number;
}

export interface ProviderTaxComponent {
  lineItemId: string | null;
  componentCode: string;
  componentLabel: string;
  jurisdictionRef: string | null;
  rate: number;
  taxableBase: number;
  taxAmount: number;
}

export interface ProviderTaxResponse {
  components: ProviderTaxComponent[];
  totalTax: number;
  providerReference: string;
}

/** Thrown by transports when the provider cannot answer (no credentials, network
 *  failure, provider 5xx). The provider strategy catches EXACTLY this error and
 *  falls back to the native stack — anything else propagates. */
export class ProviderUnavailableError extends Error {
  constructor(providerKey: string, cause?: unknown) {
    super(`Tax provider '${providerKey}' unavailable`);
    this.name = 'ProviderUnavailableError';
    this.cause = cause;
  }
}

export interface ProviderTransport {
  readonly providerKey: 'avalara' | 'taxjar';
  calculate(request: ProviderTaxRequest): Promise<ProviderTaxResponse>;
}
```

Create `src/lib/regimes/providers/stubTransport.ts`:

```typescript
import {
  ProviderUnavailableError,
  type ProviderTransport, type ProviderTaxRequest, type ProviderTaxResponse,
} from './providerTransport';

/** Deterministic request key: ship-to + tax date + currency + line economics.
 *  Contract tests and the integration double both key on this. */
export function stubRequestKey(request: ProviderTaxRequest): string {
  return JSON.stringify([
    request.providerKey, request.documentType, request.taxDate, request.currency,
    request.shipToSubdivisionId, request.documentDiscount,
    request.lines.map((l) => [l.lineItemId, l.quantity, l.unitPrice, l.lineDiscount, l.itemCode]),
  ]);
}

/** The documented integration test double (owner decision E3): until sandbox
 *  credentials exist, this IS the shipped transport. Unknown requests throw
 *  ProviderUnavailableError so production behavior is always native-fallback. */
export function createStubProviderTransport(
  providerKey: 'avalara' | 'taxjar',
  canned: Map<string, ProviderTaxResponse> = new Map(),
): ProviderTransport {
  return {
    providerKey,
    async calculate(request: ProviderTaxRequest): Promise<ProviderTaxResponse> {
      const hit = canned.get(stubRequestKey(request));
      if (!hit) throw new ProviderUnavailableError(providerKey);
      return hit;
    },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/providers/stubTransport.test.ts && npm run typecheck`
Expected: PASS, 0 tsc errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/providers/
git commit -m "feat(l10n-p5): ProviderTransport seam + stub integration double"
```

### Task 8: `createProviderStrategy` — provider adapters as first-class TaxStrategy

**Files:**
- Create: `src/lib/regimes/providers/providerStrategy.ts`
- Test: `src/lib/regimes/providers/providerStrategy.test.ts`

**Interfaces:**
- Consumes: Task 7 exports; `TaxStrategy`, `TaxContext`, `TaxComputation`, `ComputedTaxLine` from `src/lib/regimes/types.ts`; `roundMoney` from `src/lib/financialMath.ts:13`
- Produces: `createProviderStrategy(providerKey, version, transport, nativeThunk): TaxStrategy` — consumed by Task 9

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/providers/providerStrategy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createProviderStrategy } from './providerStrategy';
import { createStubProviderTransport, stubRequestKey } from './stubTransport';
import { buildProviderRequest } from './providerStrategy';
import type { TaxContext, TaxComputation, TaxStrategy } from '../types';
import type { ProviderTaxResponse } from './providerTransport';

const nativeResult: TaxComputation = {
  lines: [], rollups: [],
  totals: { taxableBase: 2000, taxTotal: 0, grandTotal: 2000, roundingAdjustment: null },
  expectedWithholding: null, notations: [],
  trace: { regimeKey: 'us_sales_tax', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'jurisdiction_stack', steps: [] },
};
const native: TaxStrategy = {
  key: 'us_sales_tax', version: '1.0.0', schemeMode: 'jurisdiction_stack',
  defaults: { roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western' },
  compute: () => nativeResult,
};

function ctx(): TaxContext {
  return {
    documentType: 'invoice',
    seller: { legalEntityId: 'le-1', countryId: 'us', subdivisionId: 'sub-tx', taxIdentifier: null, registrations: [] },
    buyer: { taxNumber: null, countryId: 'us', subdivisionId: 'sub-mta', isBusiness: false, addressSnapshot: null },
    taxPointDate: '2026-07-15', placeOfSupplySubdivisionId: 'sub-mta',
    lines: [{ lineItemId: 'li-1', description: 'Recovery', quantity: 1, unitPrice: 2000, lineDiscount: 0, unitCode: 'C62', itemCode: null, treatment: 'standard', treatmentReasonCode: null }],
    documentDiscount: 0, taxInclusive: false,
    rateContext: { documentCurrency: 'USD', documentDecimals: 2, baseCurrency: 'USD', baseDecimals: 2, rate: 1, rateSource: 'derived' },
    rates: [], roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western',
  };
}

const canned: ProviderTaxResponse = {
  providerReference: 'AVA-REF-9',
  totalTax: 165,
  components: [
    { lineItemId: null, componentCode: 'STATE', componentLabel: 'TX State 6.25%', jurisdictionRef: 'sub-tx', rate: 6.25, taxableBase: 2000, taxAmount: 125 },
    { lineItemId: null, componentCode: 'CITY', componentLabel: 'Austin 1%', jurisdictionRef: 'sub-austin', rate: 1, taxableBase: 2000, taxAmount: 20 },
    { lineItemId: null, componentCode: 'DISTRICT', componentLabel: 'Austin MTA 1%', jurisdictionRef: 'sub-mta', rate: 1, taxableBase: 2000, taxAmount: 20 },
  ],
};

describe('createProviderStrategy', () => {
  it('maps a provider response onto TaxComputation with the Σ-rollups invariant', async () => {
    const transport = createStubProviderTransport('avalara',
      new Map([[stubRequestKey(buildProviderRequest('avalara', ctx())), canned]]));
    const strategy = createProviderStrategy('avalara', '0.1.0', transport, () => native);
    const result = await strategy.compute(ctx());
    expect(result.rollups).toHaveLength(3);
    expect(result.totals.taxTotal).toBe(165);
    expect(result.totals.taxTotal).toBe(result.rollups.reduce((s, r) => s + r.taxAmount, 0));
    expect(result.totals.grandTotal).toBe(2165);
    expect(result.trace.regimeKey).toBe('avalara');
    expect(result.trace.steps[0]).toEqual({
      op: 'scheme_decision', mode: 'jurisdiction_stack', detail: 'provider:avalara:AVA-REF-9',
    });
  });

  it('falls back to the NATIVE computation when the transport is unavailable — provenance stays native', async () => {
    const strategy = createProviderStrategy('avalara', '0.1.0', createStubProviderTransport('avalara'), () => native);
    const result = await strategy.compute(ctx());
    expect(result).toBe(nativeResult);
    expect(result.trace.regimeKey).toBe('us_sales_tax');
  });

  it('declares provider metadata on the SAME TaxStrategy interface', () => {
    const strategy = createProviderStrategy('taxjar', '0.1.0', createStubProviderTransport('taxjar'), () => native);
    expect(strategy.key).toBe('taxjar');
    expect(strategy.schemeMode).toBe('jurisdiction_stack');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/providers/providerStrategy.test.ts`
Expected: FAIL — `Cannot find module './providerStrategy'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/providers/providerStrategy.ts`:

```typescript
import type { TaxStrategy, TaxContext, TaxComputation, ComputedTaxLine } from '../types';
import { roundMoney } from '../../financialMath';
import {
  ProviderUnavailableError,
  type ProviderTransport, type ProviderTaxRequest,
} from './providerTransport';

export function buildProviderRequest(
  providerKey: 'avalara' | 'taxjar', ctx: TaxContext,
): ProviderTaxRequest {
  return {
    providerKey,
    documentType: ctx.documentType,
    taxDate: ctx.taxPointDate,
    currency: ctx.rateContext.documentCurrency,
    shipFromSubdivisionId: ctx.seller.subdivisionId,
    shipToSubdivisionId: ctx.placeOfSupplySubdivisionId ?? ctx.buyer.subdivisionId,
    shipToAddress: ctx.buyer.addressSnapshot,
    buyerIsBusiness: ctx.buyer.isBusiness,
    documentDiscount: ctx.documentDiscount,
    lines: ctx.lines.map((l) => ({
      lineItemId: l.lineItemId, description: l.description, quantity: l.quantity,
      unitPrice: l.unitPrice, lineDiscount: l.lineDiscount, itemCode: l.itemCode,
    })),
  };
}

/** Provider adapters are first-class TaxStrategy implementations (owner E3).
 *  Fallback contract: ProviderUnavailableError → return the NATIVE computation
 *  object itself, so persisted trace.regimeKey names the plugin that actually
 *  produced the figures. No other error is swallowed. */
export function createProviderStrategy(
  providerKey: 'avalara' | 'taxjar',
  version: string,
  transport: ProviderTransport,
  nativeThunk: () => TaxStrategy,
): TaxStrategy {
  return {
    key: providerKey,
    version,
    schemeMode: 'jurisdiction_stack',
    defaults: { roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western' },
    async compute(ctx: TaxContext): Promise<TaxComputation> {
      let response;
      try {
        response = await transport.calculate(buildProviderRequest(providerKey, ctx));
      } catch (err) {
        if (err instanceof ProviderUnavailableError) {
          return nativeThunk().compute(ctx);
        }
        throw err;
      }
      const dp = ctx.rateContext.documentDecimals;
      const toLine = (c: (typeof response.components)[number], sequence: number): ComputedTaxLine => ({
        lineItemId: c.lineItemId,
        componentCode: c.componentCode,
        componentLabel: c.componentLabel,
        jurisdictionRef: c.jurisdictionRef,
        rate: c.rate,
        taxableBase: roundMoney(c.taxableBase, dp),
        taxAmount: roundMoney(c.taxAmount, dp),
        taxTreatment: 'standard',
        treatmentReasonCode: null,
        sequence,
      });
      const rollups = response.components
        .filter((c) => c.lineItemId === null)
        .map(toLine);
      const lines = response.components
        .filter((c) => c.lineItemId !== null)
        .map(toLine);
      const taxTotal = roundMoney(rollups.reduce((s, r) => s + r.taxAmount, 0), dp);
      const taxableBase = roundMoney(
        ctx.lines.reduce((s, l) => s + l.quantity * l.unitPrice - l.lineDiscount, 0) - ctx.documentDiscount,
        dp,
      );
      return {
        lines,
        rollups,
        totals: {
          taxableBase,
          taxTotal,
          grandTotal: roundMoney(taxableBase + taxTotal, dp),
          roundingAdjustment: null,
        },
        expectedWithholding: null,
        notations: [],
        trace: {
          regimeKey: providerKey,
          pluginVersion: version,
          packVersionId: null,
          schemeMode: 'jurisdiction_stack',
          steps: [{
            op: 'scheme_decision', mode: 'jurisdiction_stack',
            detail: `provider:${providerKey}:${response.providerReference}`,
          }],
        },
      };
    },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/providers/ && npm run typecheck`
Expected: PASS, 0 tsc errors. (`roundMoney` is the sanctioned rounding path; no ad-hoc allocation appears anywhere in this file, keeping `xsuite/no-adhoc-money-allocation` green.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/providers/providerStrategy.ts src/lib/regimes/providers/providerStrategy.test.ts
git commit -m "feat(l10n-p5): provider adapters as first-class TaxStrategy with native fallback"
```

### Task 9: Avalara + TaxJar adapter modules + registration

**Files:**
- Create: `src/lib/regimes/avalara/index.ts`
- Create: `src/lib/regimes/taxjar/index.ts`
- Modify: `src/lib/regimes/register.ts`
- Test: `src/lib/regimes/avalara/index.test.ts`

**Interfaces:**
- Consumes: Tasks 7–8 exports; `resolveTaxStrategy` from `src/lib/regimes/registry.ts`; `usSalesTaxStrategy` (Task 5, via registry key `'us_sales_tax'`)
- Produces: `makeAvalaraStrategy(transport?)`, `makeTaxjarStrategy(transport?)`, registry keys `'avalara'` and `'taxjar'` — consumed by Task 10 and by `listRegisteredCapabilities()` (capability-manifest honesty vs the M5-2 rows)

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/avalara/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import '../register';
import { resolveTaxStrategy, listRegisteredCapabilities } from '../registry';

describe('provider adapter registration', () => {
  it('resolves avalara and taxjar as registered TaxStrategy plugins', () => {
    expect(resolveTaxStrategy('avalara').key).toBe('avalara');
    expect(resolveTaxStrategy('taxjar').key).toBe('taxjar');
  });
  it('reports both in the capability manifest (kept honest vs master_engine_capabilities)', () => {
    const keys = listRegisteredCapabilities().map((c) => c.capability_key);
    expect(keys).toContain('avalara');
    expect(keys).toContain('taxjar');
    expect(keys).toContain('us_sales_tax');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/avalara/index.test.ts`
Expected: FAIL — `resolveTaxStrategy('avalara')` throws `CountryConfigError` (unregistered key).

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/avalara/index.ts`:

```typescript
import type { TaxStrategy } from '../types';
import type { ProviderTransport } from '../providers/providerTransport';
import { createProviderStrategy } from '../providers/providerStrategy';
import { createStubProviderTransport } from '../providers/stubTransport';
import { resolveTaxStrategy } from '../registry';

export const AVALARA_VERSION = '0.1.0';

/** Avalara adapter — SAME TaxStrategy interface as native plugins (owner E3).
 *  Default transport is the documented stub double; swapping in a real HTTP
 *  transport later is constructor injection, zero interface change. The native
 *  thunk resolves lazily so registration order never matters. */
export function makeAvalaraStrategy(
  transport: ProviderTransport = createStubProviderTransport('avalara'),
): TaxStrategy {
  return createProviderStrategy('avalara', AVALARA_VERSION, transport,
    () => resolveTaxStrategy('us_sales_tax'));
}
```

Create `src/lib/regimes/taxjar/index.ts`:

```typescript
import type { TaxStrategy } from '../types';
import type { ProviderTransport } from '../providers/providerTransport';
import { createProviderStrategy } from '../providers/providerStrategy';
import { createStubProviderTransport } from '../providers/stubTransport';
import { resolveTaxStrategy } from '../registry';

export const TAXJAR_VERSION = '0.1.0';

/** TaxJar adapter — see avalara/index.ts; identical seam, distinct key. */
export function makeTaxjarStrategy(
  transport: ProviderTransport = createStubProviderTransport('taxjar'),
): TaxStrategy {
  return createProviderStrategy('taxjar', TAXJAR_VERSION, transport,
    () => resolveTaxStrategy('us_sales_tax'));
}
```

Modify `src/lib/regimes/register.ts` — add:

```typescript
import { makeAvalaraStrategy } from './avalara';
import { makeTaxjarStrategy } from './taxjar';

registerRegimePlugin('tax', makeAvalaraStrategy());
registerRegimePlugin('tax', makeTaxjarStrategy());
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/ && npm run typecheck`
Expected: PASS, 0 tsc errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/avalara/ src/lib/regimes/taxjar/ src/lib/regimes/register.ts
git commit -m "feat(l10n-p5): Avalara + TaxJar adapters registered on the TaxStrategy seam"
```

### Task 10: Per-tenant provider enablement + `TaxProviderPanel`

**Files:**
- Create: `src/lib/tax/resolveEffectiveTaxStrategy.ts`
- Create: `src/components/settings/TaxProviderPanel.tsx`
- Test: `src/lib/tax/resolveEffectiveTaxStrategy.test.ts`

**Interfaces:**
- Consumes: `getOrCreateCompanySettings()` / `updateCompanySettings()` / `CompanySettings.metadata?: Json | null` (`src/lib/companySettingsService.ts:5-8,197,259` — verified); `resolveTaxStrategy` (registry); Task 9 keys
- Produces: `resolveEffectiveTaxStrategy(regimeTaxKey: string): Promise<TaxStrategy>` and pure `pickTaxStrategyKey(regimeTaxKey: string, metadata: unknown): string` — the document-total pipeline (the `computeDocumentTotals` totals path in `src/lib/taxDocumentService.ts`) swaps its direct `resolveTaxStrategy(regime.tax)` totals call for this resolver in the same commit; `TaxProviderPanel` mounted by Task 15's settings page

- [ ] **Step 1: Write the failing test**

Create `src/lib/tax/resolveEffectiveTaxStrategy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { pickTaxStrategyKey } from './resolveEffectiveTaxStrategy';

describe('pickTaxStrategyKey', () => {
  it('returns the regime key when no provider is enabled', () => {
    expect(pickTaxStrategyKey('us_sales_tax', null)).toBe('us_sales_tax');
    expect(pickTaxStrategyKey('us_sales_tax', {})).toBe('us_sales_tax');
    expect(pickTaxStrategyKey('us_sales_tax', { tax_provider: null })).toBe('us_sales_tax');
  });
  it('returns the provider key when a supported provider is enabled', () => {
    expect(pickTaxStrategyKey('us_sales_tax', { tax_provider: 'avalara' })).toBe('avalara');
    expect(pickTaxStrategyKey('us_sales_tax', { tax_provider: 'taxjar' })).toBe('taxjar');
  });
  it('ignores unknown provider values (never trusts free-form metadata)', () => {
    expect(pickTaxStrategyKey('us_sales_tax', { tax_provider: 'evil_llc' })).toBe('us_sales_tax');
    expect(pickTaxStrategyKey('us_sales_tax', { tax_provider: 42 })).toBe('us_sales_tax');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/tax/resolveEffectiveTaxStrategy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/tax/resolveEffectiveTaxStrategy.ts`:

```typescript
import type { TaxStrategy } from '../regimes/types';
import { resolveTaxStrategy } from '../regimes/registry';
import { getOrCreateCompanySettings } from '../companySettingsService';

const SUPPORTED_PROVIDERS = new Set(['avalara', 'taxjar']);

/** Pure decision: tenant preference (company_settings.metadata.tax_provider)
 *  layered over the country-locked regime.tax binding. Unknown values are
 *  ignored — a tenant can pick a provider, never forge a regime. */
export function pickTaxStrategyKey(regimeTaxKey: string, metadata: unknown): string {
  if (metadata && typeof metadata === 'object') {
    const value = (metadata as Record<string, unknown>)['tax_provider'];
    if (typeof value === 'string' && SUPPORTED_PROVIDERS.has(value)) return value;
  }
  return regimeTaxKey;
}

/** The single entry point document pipelines use in place of a raw
 *  resolveTaxStrategy(regime.tax) call. Runtime provider failure still falls
 *  back inside createProviderStrategy — this only resolves the preference. */
export async function resolveEffectiveTaxStrategy(regimeTaxKey: string): Promise<TaxStrategy> {
  const settings = await getOrCreateCompanySettings();
  const key = pickTaxStrategyKey(regimeTaxKey, settings.metadata ?? null);
  try {
    return resolveTaxStrategy(key);
  } catch {
    return resolveTaxStrategy(regimeTaxKey);
  }
}
```

Create `src/components/settings/TaxProviderPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Plug, ShieldCheck } from 'lucide-react';
import {
  getOrCreateCompanySettings, updateCompanySettings, invalidateCompanySettingsCache,
} from '../../lib/companySettingsService';

const OPTIONS = [
  { value: 'none', label: 'Native engine (state / county / city granularity)' },
  { value: 'avalara', label: 'Avalara (street-level, provider-gated)' },
  { value: 'taxjar', label: 'TaxJar (street-level, provider-gated)' },
] as const;

export function TaxProviderPanel() {
  const [value, setValue] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrCreateCompanySettings().then((settings) => {
      const meta = (settings.metadata ?? {}) as Record<string, unknown>;
      const current = typeof meta['tax_provider'] === 'string' ? (meta['tax_provider'] as string) : 'none';
      if (!cancelled) setValue(current === 'avalara' || current === 'taxjar' ? current : 'none');
    });
    return () => { cancelled = true; };
  }, []);

  const save = async (next: string) => {
    setSaving(true);
    setValue(next);
    const settings = await getOrCreateCompanySettings();
    const meta = { ...((settings.metadata ?? {}) as Record<string, unknown>) };
    meta['tax_provider'] = next === 'none' ? null : next;
    await updateCompanySettings({ metadata: meta });
    invalidateCompanySettingsCache();
    setSaving(false);
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <Plug className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Sales-tax calculation provider</h3>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        The native engine is accurate at state, county, and city granularity. Street-level
        rooftop accuracy and product-taxability rules are provider-gated. If a provider is
        unreachable, documents fall back to the native engine automatically and record which
        engine produced the figures.
      </p>
      <select
        aria-label="Tax provider"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-ring"
        value={value}
        disabled={saving}
        onChange={(e) => void save(e.target.value)}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
        <ShieldCheck className="h-3.5 w-3.5 text-success" />
        Every issued document keeps a trace of the engine and reference that computed it.
      </div>
    </section>
  );
}
```

Then update the document-total pipeline call sites: in `src/lib/taxDocumentService.ts` (`computeDocumentTotals` — the inline `TaxContext` builder that calls `resolveTaxStrategy(regime.tax)` to compute totals) and any other Phase-1/2 totals caller (find them with `grep -rn "resolveTaxStrategy(" src/lib --include='*.ts' | grep -v regimes/`), replace the direct call with `await resolveEffectiveTaxStrategy(regimeTaxKey)`. The grep result is the complete caller list; there must be zero remaining direct `resolveTaxStrategy(regime.tax)` totals-path calls outside `src/lib/regimes/` and `src/lib/tax/resolveEffectiveTaxStrategy.ts` when done.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/tax/ && npm run typecheck && npx eslint src/lib/tax src/components/settings/TaxProviderPanel.tsx`
Expected: PASS, 0 tsc errors, lint clean (semantic tokens only).

- [ ] **Step 5: Commit + PR**

```bash
git add src/lib/tax/resolveEffectiveTaxStrategy.ts src/lib/tax/resolveEffectiveTaxStrategy.test.ts src/components/settings/TaxProviderPanel.tsx src/lib/taxDocumentService.ts
git commit -m "feat(l10n-p5): per-tenant tax-provider enablement with native fallback"
```

Open PR `feat/l10n-p5-provider-seam`.

---

# WP-4 — `us_plain_invoice` profile + invoice-type ceremony relaxation

Branch: `feat/l10n-p5-us-document-profile` cut fresh from `main` after WP-3 merges.

### Task 11: `us_plain_invoice` DocumentComplianceProfile

**Files:**
- Create: `src/lib/regimes/us_plain_invoice/index.ts`
- Modify: `src/lib/regimes/register.ts`
- Test: `src/lib/regimes/us_plain_invoice/index.test.ts`

**Interfaces:**
- Consumes: `DocumentComplianceProfile`, `TaxComputation` from `src/lib/regimes/types.ts`; `registerRegimePlugin`, `resolveDocumentProfile` from registry
- Produces: `usPlainInvoiceProfile: DocumentComplianceProfile` (key `'us_plain_invoice'`) — consumed by the Phase-2 pdfService/adapter/preview cascade automatically (they already resolve `regime.documents`), and by Tasks 12–13

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/us_plain_invoice/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import '../register';
import { resolveDocumentProfile } from '../registry';
import { usPlainInvoiceProfile } from './index';
import type { TaxComputation } from '../types';

const computation: TaxComputation = {
  lines: [], rollups: [],
  totals: { taxableBase: 100, taxTotal: 8.25, grandTotal: 108.25, roundingAdjustment: null },
  expectedWithholding: null, notations: [],
  trace: { regimeKey: 'us_sales_tax', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'jurisdiction_stack', steps: [] },
};

describe('usPlainInvoiceProfile', () => {
  it('titles every invoice "Invoice" — never TAX INVOICE, regardless of registration facts', () => {
    expect(usPlainInvoiceProfile.documentTitle({ docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: true }))
      .toEqual({ title: 'Invoice', titleTranslated: null });
    expect(usPlainInvoiceProfile.documentTitle({ docType: 'quote', sellerRegistered: false, taxInvoiceRequired: false }))
      .toEqual({ title: 'Quote', titleTranslated: null });
    expect(usPlainInvoiceProfile.documentTitle({ docType: 'credit_note', sellerRegistered: true, taxInvoiceRequired: false }))
      .toEqual({ title: 'Credit Note', titleTranslated: null });
    expect(usPlainInvoiceProfile.documentTitle({ docType: 'stock_sale', sellerRegistered: false, taxInvoiceRequired: false }))
      .toEqual({ title: 'Sales Receipt', titleTranslated: null });
  });

  it('relaxes the ceremony: no proforma gate, no registration band, Letter paper, no bilingual, no forced columns', () => {
    expect(usPlainInvoiceProfile.requiresTaxInvoiceCeremony).toBe(false);
    expect(usPlainInvoiceProfile.showRegistrationBand).toBe(false);
    expect(usPlainInvoiceProfile.paperSize).toBe('Letter');
    expect(usPlainInvoiceProfile.bilingual).toEqual({ enabled: false, secondaryLanguage: null, arabicLead: false });
    expect(usPlainInvoiceProfile.forcedColumns).toEqual([]);
  });

  it('emits no statutory notations (US plain invoices carry none)', () => {
    expect(usPlainInvoiceProfile.notations(computation)).toEqual([]);
  });

  it('is resolvable from the registry by key', () => {
    expect(resolveDocumentProfile('us_plain_invoice').key).toBe('us_plain_invoice');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/us_plain_invoice/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/us_plain_invoice/index.ts`:

```typescript
import type { DocumentComplianceProfile, TaxDocumentType } from '../types';

const TITLES: Record<TaxDocumentType, string> = {
  invoice: 'Invoice',
  quote: 'Quote',
  credit_note: 'Credit Note',
  stock_sale: 'Sales Receipt',
};

/** US document profile: no tax-invoice ceremony (payments record against plain
 *  invoices — relaxes the invoiceService gate BY PROFILE), no VATIN band, Letter
 *  paper, English-only. Date format (MM/DD/YYYY) comes from the country
 *  formatting baseline, not from this profile. */
export const usPlainInvoiceProfile: DocumentComplianceProfile = {
  key: 'us_plain_invoice',
  version: '1.0.0',
  documentTitle(ctx) {
    return { title: TITLES[ctx.docType], titleTranslated: null };
  },
  requiresTaxInvoiceCeremony: false,
  showRegistrationBand: false,
  forcedColumns: [],
  bilingual: { enabled: false, secondaryLanguage: null, arabicLead: false },
  paperSize: 'Letter',
  notations() {
    return [];
  },
};
```

Modify `src/lib/regimes/register.ts` — add:

```typescript
import { usPlainInvoiceProfile } from './us_plain_invoice';

registerRegimePlugin('documents', usPlainInvoiceProfile);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/us_plain_invoice/ && npm run typecheck`
Expected: PASS, 0 tsc errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/us_plain_invoice/ src/lib/regimes/register.ts
git commit -m "feat(l10n-p5): us_plain_invoice DocumentComplianceProfile"
```

### Task 12: Ceremony gate relaxed by profile in `recordPayment`

**Files:**
- Create: `src/lib/tax/documentProfile.ts`
- Modify: `src/lib/invoiceService.ts:704-705` (the `issueInvoice` gate — verified live: `if (inv.invoice_type !== 'tax_invoice') throw 'Only Tax Invoices are issued for payment. Convert the proforma first.'`)
- Modify: `src/lib/invoiceService.ts:901-913` (the `recordPayment` fetch + gate — verified live: gate at :910-913, `invoice_type !== 'tax_invoice'` throw)
- Test: `src/lib/tax/documentProfile.test.ts`

**Interfaces:**
- Consumes: `resolveDocumentProfile` (registry), `getTenantConfig(tenantId)` + `TenantConfig.regime.documents` (`src/lib/tenantConfigService.ts:194`), module-local `resolveTenantId()` (imported at `src/lib/invoiceService.ts:1`, already used in `recordPayment` at :925 and available in `issueInvoice`)
- Produces: `assertPayableInvoiceType(invoiceType, profile): void`, `assertIssuableInvoiceType(invoiceType, profile): void`, `getActiveDocumentProfile(tenantId): Promise<DocumentComplianceProfile>` — consumed by Task 13 and any future payment/issuance path

> **Both** ceremony gates must be relaxed by profile, not just `recordPayment`. `issueInvoice` (:704-705) blocks issuing (sending) any non-`tax_invoice` document with a DIFFERENT error string, so a `not Proforma Invoices` grep cannot see it; leaving it hardcoded makes the `requiresTaxInvoiceCeremony: false` model incomplete (a relaxed tenant could not issue a proforma-typed invoice). **Phase-4 note:** `record_payment` is now a plpgsql RPC (entry criteria). Before committing, confirm whether the tax-invoice ceremony is ALSO enforced inside the `record_payment` RPC body (`mcp__supabase__execute_sql` → `SELECT pg_get_functiondef(...)`). If it is, that server-side check must also become profile-aware (or accept a `p_ceremony_relaxed boolean` the JS layer computes from the profile) — otherwise the JS relaxation is cosmetic and the RPC still blocks. If it is NOT (the JS wrapper is the sole gate), record that finding in the PR and no RPC change is needed.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tax/documentProfile.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assertPayableInvoiceType, assertIssuableInvoiceType } from './documentProfile';

describe('assertPayableInvoiceType', () => {
  it('rejects non-tax-invoice payments under a ceremony profile (GCC/India behavior preserved verbatim)', () => {
    expect(() => assertPayableInvoiceType('proforma', { requiresTaxInvoiceCeremony: true }))
      .toThrow('Payments can only be recorded against Tax Invoices, not Proforma Invoices.');
    expect(() => assertPayableInvoiceType(null, { requiresTaxInvoiceCeremony: true }))
      .toThrow('Payments can only be recorded against Tax Invoices, not Proforma Invoices.');
  });
  it('accepts tax invoices under a ceremony profile', () => {
    expect(() => assertPayableInvoiceType('tax_invoice', { requiresTaxInvoiceCeremony: true })).not.toThrow();
  });
  it('accepts ANY invoice type when the profile relaxes the ceremony (us_plain_invoice)', () => {
    expect(() => assertPayableInvoiceType('proforma', { requiresTaxInvoiceCeremony: false })).not.toThrow();
    expect(() => assertPayableInvoiceType('tax_invoice', { requiresTaxInvoiceCeremony: false })).not.toThrow();
  });
});

describe('assertIssuableInvoiceType (the issueInvoice gate, :704-705)', () => {
  it('rejects issuing a non-tax-invoice under a ceremony profile with the EXACT legacy issueInvoice error string', () => {
    expect(() => assertIssuableInvoiceType('proforma', { requiresTaxInvoiceCeremony: true }))
      .toThrow('Only Tax Invoices are issued for payment. Convert the proforma first.');
    expect(() => assertIssuableInvoiceType(null, { requiresTaxInvoiceCeremony: true }))
      .toThrow('Only Tax Invoices are issued for payment. Convert the proforma first.');
  });
  it('accepts tax invoices under a ceremony profile', () => {
    expect(() => assertIssuableInvoiceType('tax_invoice', { requiresTaxInvoiceCeremony: true })).not.toThrow();
  });
  it('accepts ANY invoice type when the profile relaxes the ceremony (us_plain_invoice can issue a plain invoice)', () => {
    expect(() => assertIssuableInvoiceType('proforma', { requiresTaxInvoiceCeremony: false })).not.toThrow();
    expect(() => assertIssuableInvoiceType('tax_invoice', { requiresTaxInvoiceCeremony: false })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/tax/documentProfile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/tax/documentProfile.ts`:

```typescript
import type { DocumentComplianceProfile } from '../regimes/types';
import { resolveDocumentProfile } from '../regimes/registry';
import { getTenantConfig } from '../tenantConfigService';

/** Pure ceremony gate. Profiles with requiresTaxInvoiceCeremony=false
 *  (us_plain_invoice) accept payments against plain invoices; ceremony
 *  regimes keep the exact legacy error string. */
export function assertPayableInvoiceType(
  invoiceType: string | null,
  profile: Pick<DocumentComplianceProfile, 'requiresTaxInvoiceCeremony'>,
): void {
  if (profile.requiresTaxInvoiceCeremony && invoiceType !== 'tax_invoice') {
    throw new Error('Payments can only be recorded against Tax Invoices, not Proforma Invoices.');
  }
}

/** Pure ISSUANCE ceremony gate — the second hardcoded gate, in issueInvoice
 *  (:704-705). Same predicate as the payment gate, but the legacy error string
 *  is the issue-context one and is preserved verbatim for ceremony regimes. */
export function assertIssuableInvoiceType(
  invoiceType: string | null,
  profile: Pick<DocumentComplianceProfile, 'requiresTaxInvoiceCeremony'>,
): void {
  if (profile.requiresTaxInvoiceCeremony && invoiceType !== 'tax_invoice') {
    throw new Error('Only Tax Invoices are issued for payment. Convert the proforma first.');
  }
}

/** Resolve the tenant's active document profile from the regime.documents key. */
export async function getActiveDocumentProfile(tenantId: string): Promise<DocumentComplianceProfile> {
  const config = await getTenantConfig(tenantId);
  return resolveDocumentProfile(config.regime.documents);
}
```

Modify `src/lib/invoiceService.ts` — replace the hardcoded gate (current lines 910-913):

```typescript
  // Only allow payment recording for tax invoices, not proforma invoices
  if (invoice.invoice_type !== 'tax_invoice') {
    throw new Error('Payments can only be recorded against Tax Invoices, not Proforma Invoices.');
  }
```

with:

```typescript
  // Ceremony is a regime concern (us_plain_invoice relaxes it BY PROFILE,
  // never by country branching): resolve the tenant's document profile.
  const gateTenantId = await resolveTenantId();
  assertPayableInvoiceType(
    invoice.invoice_type,
    await getActiveDocumentProfile(gateTenantId),
  );
```

Also modify `issueInvoice` — replace the second hardcoded gate (current lines 704-705):

```typescript
  if (inv.invoice_type !== 'tax_invoice') {
    throw new Error('Only Tax Invoices are issued for payment. Convert the proforma first.');
  }
```

with the profile-delegated form (`resolveTenantId` is a module-local import at :1, available here):

```typescript
  assertIssuableInvoiceType(
    inv.invoice_type,
    await getActiveDocumentProfile(await resolveTenantId()),
  );
```

and add the import at the top of the file alongside the existing imports:

```typescript
import { assertPayableInvoiceType, assertIssuableInvoiceType, getActiveDocumentProfile } from './tax/documentProfile';
```

(`resolveTenantId` is already used in `recordPayment` at :925 — the extra calls are fine; do not reorder the base-currency block. `issueInvoice`'s `select` already fetches `invoice_type`, verified live at :698.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/tax/documentProfile.test.ts src/lib/invoiceService.test.ts 2>/dev/null; npx vitest run src/lib/tax/documentProfile.test.ts && npm run typecheck`
Expected: PASS, 0 tsc errors. Then prove NO hardcoded ceremony gate survives anywhere in the service layer — grep the PREDICATE, not either error string (the two gates use different strings, so a string grep gives false confidence):

```bash
grep -rn "invoice_type !== 'tax_invoice'" src/lib/
```
Expected output: **zero hits** (both gates now delegate to `assertPayableInvoiceType` / `assertIssuableInvoiceType`, which test the camel-case `invoiceType` param inside `documentProfile.ts`). If any hit remains in `invoiceService.ts` (or elsewhere), route it through the matching `assert*InvoiceType(...)` helper before committing. Then confirm both legacy error strings now live ONLY in `documentProfile.ts`:

```bash
grep -rn "not Proforma Invoices\|Only Tax Invoices are issued" src/lib/
```
Expected output: only `src/lib/tax/documentProfile.ts` (twice — the two preserved strings).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/documentProfile.ts src/lib/tax/documentProfile.test.ts src/lib/invoiceService.ts
git commit -m "feat(l10n-p5): invoice-type ceremony gate delegated to DocumentComplianceProfile"
```

### Task 13: Hide the tax-invoice/proforma toggle when the profile relaxes ceremony

**Files:**
- Modify: `src/components/cases/InvoiceFormModal.tsx:654-676` (verified: `tax_invoice` button at :654-656, `proforma` button at :666-668; default `invoice_type: 'tax_invoice'` at :125)
- Test: `src/components/cases/InvoiceFormModal.ceremony.test.tsx`

**Interfaces:**
- Consumes: `useRegimeConfig()` (`src/contexts/TenantConfigContext.tsx`), `resolveDocumentProfile` (registry), Task 11 profile
- Produces: ceremony-aware invoice form (no new exports)

- [ ] **Step 1: Write the failing test**

Create `src/components/cases/InvoiceFormModal.ceremony.test.tsx` (dom project — mirrors the modal's existing test scaffolding for providers; mock `useRegimeConfig` directly to isolate the toggle):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { shouldShowInvoiceTypeToggle } from './InvoiceFormModal';

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));

describe('invoice-type ceremony visibility', () => {
  it('shows the toggle for ceremony profiles and hides it for relaxed profiles', () => {
    expect(shouldShowInvoiceTypeToggle('gcc_tax_invoice')).toBe(true);
    expect(shouldShowInvoiceTypeToggle('generic_invoice')).toBe(true);
    expect(shouldShowInvoiceTypeToggle('us_plain_invoice')).toBe(false);
  });
  it('renders nothing for an unknown key rather than crashing the form', () => {
    expect(shouldShowInvoiceTypeToggle('not_a_profile')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/cases/InvoiceFormModal.ceremony.test.tsx`
Expected: FAIL — `shouldShowInvoiceTypeToggle` is not exported.

- [ ] **Step 3: Minimal implementation**

In `src/components/cases/InvoiceFormModal.tsx` add near the top (after imports):

```typescript
import '../../lib/regimes/register';
import { resolveDocumentProfile } from '../../lib/regimes/registry';
import { useRegimeConfig } from '../../contexts/TenantConfigContext';

/** Exported for tests: ceremony toggle visibility from the documents regime key.
 *  Unknown keys default to SHOWING the toggle (fail-safe for ceremony markets). */
export function shouldShowInvoiceTypeToggle(regimeDocumentsKey: string): boolean {
  try {
    return resolveDocumentProfile(regimeDocumentsKey).requiresTaxInvoiceCeremony;
  } catch {
    return true;
  }
}
```

Inside the component body add:

```typescript
  const regime = useRegimeConfig();
  const showInvoiceTypeToggle = shouldShowInvoiceTypeToggle(regime.documents);
```

Wrap the existing invoice-type toggle block (the container around lines 654-676 holding both the `tax_invoice` and `proforma` buttons) in:

```tsx
          {showInvoiceTypeToggle && (
            /* existing toggle JSX, unchanged */
          )}
```

The default `invoice_type: 'tax_invoice'` at :125 already makes hidden-toggle forms produce plain payable invoices — no data change needed.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/cases/InvoiceFormModal.ceremony.test.tsx && npm run typecheck && npx eslint src/components/cases/InvoiceFormModal.tsx`
Expected: PASS, 0 tsc errors, lint clean.

- [ ] **Step 5: Commit + PR**

```bash
git add src/components/cases/InvoiceFormModal.tsx src/components/cases/InvoiceFormModal.ceremony.test.tsx
git commit -m "feat(l10n-p5): hide invoice-type ceremony toggle under relaxed profiles"
```

Open PR `feat/l10n-p5-us-document-profile`.

---

# WP-5 — Nexus management + per-jurisdiction remittance composer

Branch: `feat/l10n-p5-nexus-and-remit` cut fresh from `main` after WP-4 merges.

### Task 14: `taxRegistrationsService` — nexus facts CRUD

**Files:**
- Create (or extend if Phase 4 created it — keep these exact export names either way): `src/lib/taxRegistrationsService.ts`
- Test: `src/lib/taxRegistrationsService.test.ts`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabaseClient.ts`), `Database` types (`legal_entity_tax_registrations`, `geo_subdivisions`)
- Produces: `validateRegistrationWindow`, `listTaxRegistrations`, `createTaxRegistration`, `endTaxRegistration`, `listCountrySubdivisions`, `TaxRegistrationRow`, `CreateTaxRegistrationInput` — consumed by Task 15 UI; the rows feed `TaxContext.seller.registrations` (Phase-1 assembler) and therefore Task 5's nexus logic

- [ ] **Step 1: Write the failing test**

Create `src/lib/taxRegistrationsService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateRegistrationWindow } from './taxRegistrationsService';

describe('validateRegistrationWindow', () => {
  it('accepts an open-ended window', () => {
    expect(validateRegistrationWindow('2026-01-01', null)).toBeNull();
  });
  it('accepts to >= from', () => {
    expect(validateRegistrationWindow('2026-01-01', '2026-01-01')).toBeNull();
    expect(validateRegistrationWindow('2026-01-01', '2026-12-31')).toBeNull();
  });
  it('rejects to < from with an actionable message', () => {
    expect(validateRegistrationWindow('2026-07-01', '2026-06-30'))
      .toBe('Registration end date must be on or after the start date.');
  });
  it('rejects malformed dates', () => {
    expect(validateRegistrationWindow('07/01/2026', null))
      .toBe('Dates must be in YYYY-MM-DD format.');
    expect(validateRegistrationWindow('2026-01-01', '30-06-2026'))
      .toBe('Dates must be in YYYY-MM-DD format.');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/taxRegistrationsService.test.ts`
Expected: FAIL — module (or export) not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/taxRegistrationsService.ts`:

```typescript
import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

export type TaxRegistrationRow =
  Database['public']['Tables']['legal_entity_tax_registrations']['Row'];
type TaxRegistrationInsert =
  Database['public']['Tables']['legal_entity_tax_registrations']['Insert'];

export interface CreateTaxRegistrationInput {
  legal_entity_id: string;
  country_id: string;
  subdivision_id: string | null;
  tax_number: string;
  scheme?: 'standard' | 'composition' | 'unregistered';
  registered_from: string;
  registered_to?: string | null;
  is_primary?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateRegistrationWindow(
  registeredFrom: string,
  registeredTo: string | null,
): string | null {
  if (!DATE_RE.test(registeredFrom) || (registeredTo !== null && !DATE_RE.test(registeredTo))) {
    return 'Dates must be in YYYY-MM-DD format.';
  }
  if (registeredTo !== null && registeredTo < registeredFrom) {
    return 'Registration end date must be on or after the start date.';
  }
  return null;
}

export async function listTaxRegistrations(legalEntityId: string): Promise<TaxRegistrationRow[]> {
  const { data, error } = await supabase
    .from('legal_entity_tax_registrations')
    .select('*')
    .eq('legal_entity_id', legalEntityId)
    .is('deleted_at', null)
    .order('registered_from', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTaxRegistration(
  input: CreateTaxRegistrationInput,
): Promise<TaxRegistrationRow> {
  const problem = validateRegistrationWindow(input.registered_from, input.registered_to ?? null);
  if (problem) throw new Error(problem);
  const payload: TaxRegistrationInsert = {
    legal_entity_id: input.legal_entity_id,
    country_id: input.country_id,
    subdivision_id: input.subdivision_id,
    tax_number: input.tax_number,
    scheme: input.scheme ?? 'standard',
    registered_from: input.registered_from,
    registered_to: input.registered_to ?? null,
    is_primary: input.is_primary ?? false,
  };
  const { data, error } = await supabase
    .from('legal_entity_tax_registrations')
    .insert(payload)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Registration insert returned no row');
  return data;
}

/** Ending nexus is a dated business event — set registered_to, never delete.
 *  Historical documents keep computing against the window that covered them. */
export async function endTaxRegistration(
  id: string,
  registeredTo: string,
): Promise<TaxRegistrationRow> {
  if (!DATE_RE.test(registeredTo)) throw new Error('Dates must be in YYYY-MM-DD format.');
  const { data, error } = await supabase
    .from('legal_entity_tax_registrations')
    .update({ registered_to: registeredTo })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Registration not found');
  return data;
}

export async function listCountrySubdivisions(
  countryId: string,
): Promise<Array<{ id: string; code: string; name: string; subdivision_type: string | null }>> {
  const { data, error } = await supabase
    .from('geo_subdivisions')
    .select('id, code, name, subdivision_type')
    .eq('country_id', countryId)
    .is('parent_id', null)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/taxRegistrationsService.test.ts && npm run typecheck`
Expected: PASS, 0 tsc errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxRegistrationsService.ts src/lib/taxRegistrationsService.test.ts
git commit -m "feat(l10n-p5): taxRegistrationsService — nexus registration CRUD"
```

### Task 15: `NexusRegistrationsPanel` + `TaxComplianceSettings` page + route

**Files:**
- Create: `src/components/settings/NexusRegistrationsPanel.tsx`
- Create: `src/pages/settings/TaxComplianceSettings.tsx`
- Modify: `src/App.tsx:252` (add one sibling route inside the existing `<Route path="settings">` block at `src/App.tsx:248`)
- Test: `src/components/settings/NexusRegistrationsPanel.test.tsx`

**Interfaces:**
- Consumes: Task 14 service; Task 10 `TaxProviderPanel`; `useTenantConfig()` (`src/contexts/TenantConfigContext.tsx:121`)
- Produces: route `/settings/tax-compliance`; "adding CO later is one row, no wizard re-run" (spec walkthrough line 1024) becomes a living Settings surface

- [ ] **Step 1: Write the failing test**

Create `src/components/settings/NexusRegistrationsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NexusRegistrationsPanel } from './NexusRegistrationsPanel';

const registrations = [
  {
    id: 'reg-1', tenant_id: 't-1', legal_entity_id: 'le-1', country_id: 'us',
    subdivision_id: 'sub-tx', tax_number: 'TX-REG-001', scheme: 'standard',
    registered_from: '2026-01-01', registered_to: null, is_primary: true,
    created_at: '2026-01-01T00:00:00Z', deleted_at: null,
  },
];

vi.mock('../../lib/taxRegistrationsService', () => ({
  listTaxRegistrations: vi.fn(async () => registrations),
  listCountrySubdivisions: vi.fn(async () => [
    { id: 'sub-tx', code: 'TX', name: 'Texas', subdivision_type: 'state' },
    { id: 'sub-co', code: 'CO', name: 'Colorado', subdivision_type: 'state' },
  ]),
  createTaxRegistration: vi.fn(),
  endTaxRegistration: vi.fn(),
  validateRegistrationWindow: vi.fn(() => null),
}));

describe('NexusRegistrationsPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists active registrations with their window', async () => {
    render(<NexusRegistrationsPanel legalEntityId="le-1" countryId="us" />);
    await waitFor(() => expect(screen.getByText('TX-REG-001')).toBeInTheDocument());
    expect(screen.getByText(/2026-01-01/)).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('offers the state picker for adding a new registration', async () => {
    render(<NexusRegistrationsPanel legalEntityId="le-1" countryId="us" />);
    await waitFor(() => expect(screen.getByLabelText(/state \/ subdivision/i)).toBeInTheDocument());
    expect(screen.getByRole('option', { name: /colorado/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/settings/NexusRegistrationsPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

Create `src/components/settings/NexusRegistrationsPanel.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { MapPin, Plus, CircleStop } from 'lucide-react';
import {
  listTaxRegistrations, createTaxRegistration, endTaxRegistration,
  listCountrySubdivisions, validateRegistrationWindow, type TaxRegistrationRow,
} from '../../lib/taxRegistrationsService';

interface Props {
  legalEntityId: string;
  countryId: string;
}

export function NexusRegistrationsPanel({ legalEntityId, countryId }: Props) {
  const [rows, setRows] = useState<TaxRegistrationRow[]>([]);
  const [subdivisions, setSubdivisions] = useState<Array<{ id: string; code: string; name: string; subdivision_type: string | null }>>([]);
  const [subdivisionId, setSubdivisionId] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [registeredFrom, setRegisteredFrom] = useState('');
  const [registeredTo, setRegisteredTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setRows(await listTaxRegistrations(legalEntityId));
  }, [legalEntityId]);

  useEffect(() => {
    void reload();
    void listCountrySubdivisions(countryId).then(setSubdivisions);
  }, [reload, countryId]);

  const add = async () => {
    const to = registeredTo || null;
    const problem = validateRegistrationWindow(registeredFrom, to)
      ?? (!subdivisionId ? 'Pick a state / subdivision.' : null)
      ?? (!taxNumber.trim() ? 'Registration / permit number is required.' : null);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await createTaxRegistration({
        legal_entity_id: legalEntityId, country_id: countryId,
        subdivision_id: subdivisionId, tax_number: taxNumber.trim(),
        registered_from: registeredFrom, registered_to: to,
      });
      setSubdivisionId(''); setTaxNumber(''); setRegisteredFrom(''); setRegisteredTo('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add registration');
    } finally {
      setBusy(false);
    }
  };

  const end = async (row: TaxRegistrationRow) => {
    const today = new Date().toISOString().slice(0, 10);
    setBusy(true);
    try {
      await endTaxRegistration(row.id, today);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Tax registrations & nexus</h3>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Documents compute tax only where an active registration exists on the tax point date.
        Ending a registration keeps history intact — past documents stay unchanged.
      </p>

      <table className="mb-4 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-gray-500">
            <th className="py-1 pr-2">Jurisdiction</th>
            <th className="py-1 pr-2">Number</th>
            <th className="py-1 pr-2">From</th>
            <th className="py-1 pr-2">To</th>
            <th className="py-1 pr-2">Status</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/50">
              <td className="py-1.5 pr-2">{subdivisions.find((s) => s.id === r.subdivision_id)?.name ?? r.subdivision_id ?? 'Country-wide'}</td>
              <td className="py-1.5 pr-2 font-mono text-xs">{r.tax_number}</td>
              <td className="py-1.5 pr-2">{r.registered_from}</td>
              <td className="py-1.5 pr-2">{r.registered_to ?? '—'}</td>
              <td className="py-1.5 pr-2">
                {r.registered_to === null
                  ? <span className="rounded bg-success-muted px-1.5 py-0.5 text-xs text-success">active</span>
                  : <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-gray-500">ended</span>}
              </td>
              <td className="py-1.5 text-right">
                {r.registered_to === null && (
                  <button type="button" disabled={busy} onClick={() => void end(r)}
                    className="inline-flex items-center gap-1 text-xs text-danger hover:underline">
                    <CircleStop className="h-3.5 w-3.5" /> End
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <label className="col-span-2 text-xs md:col-span-1">
          <span className="mb-1 block text-gray-500">State / subdivision</span>
          <select aria-label="State / subdivision" value={subdivisionId} disabled={busy}
            onChange={(e) => setSubdivisionId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5">
            <option value="">Select…</option>
            {subdivisions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-gray-500">Registration no.</span>
          <input aria-label="Registration number" value={taxNumber} disabled={busy}
            onChange={(e) => setTaxNumber(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-gray-500">From</span>
          <input aria-label="Registered from" type="date" value={registeredFrom} disabled={busy}
            onChange={(e) => setRegisteredFrom(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-gray-500">To (optional)</span>
          <input aria-label="Registered to" type="date" value={registeredTo} disabled={busy}
            onChange={(e) => setRegisteredTo(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5" />
        </label>
        <div className="flex items-end">
          <button type="button" disabled={busy} onClick={() => void add()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
```

Create `src/pages/settings/TaxComplianceSettings.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { NexusRegistrationsPanel } from '../../components/settings/NexusRegistrationsPanel';
import { TaxProviderPanel } from '../../components/settings/TaxProviderPanel';

export function TaxComplianceSettings() {
  const [entity, setEntity] = useState<{ id: string; country_id: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('legal_entities')
      .select('id, country_id')
      .eq('is_primary', true)
      .is('deleted_at', null)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setEntity(data); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Tax Compliance</h2>
      {entity ? (
        <NexusRegistrationsPanel legalEntityId={entity.id} countryId={entity.country_id} />
      ) : (
        <p className="text-sm text-gray-500">No primary legal entity configured.</p>
      )}
      <TaxProviderPanel />
    </div>
  );
}
```

Modify `src/App.tsx` — inside the `<Route path="settings">` block (opens at `src/App.tsx:248`), add after the appearance route at :252:

```tsx
            <Route path="tax-compliance" lazy={page(() => import('./pages/settings/TaxComplianceSettings'), 'TaxComplianceSettings')} />
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/settings/NexusRegistrationsPanel.test.tsx && npm run typecheck && npx eslint src/components/settings src/pages/settings/TaxComplianceSettings.tsx`
Expected: PASS, 0 tsc errors, lint clean (all colors are semantic tokens or sanctioned grays).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/NexusRegistrationsPanel.tsx src/components/settings/NexusRegistrationsPanel.test.tsx src/pages/settings/TaxComplianceSettings.tsx src/App.tsx
git commit -m "feat(l10n-p5): nexus registrations settings surface + tax-compliance route"
```

### Task 16: `us_jurisdiction_remit` ReturnComposer

**Files:**
- Create: `src/lib/regimes/us_jurisdiction_remit/index.ts`
- Modify: `src/lib/regimes/register.ts`
- Test: `src/lib/regimes/us_jurisdiction_remit/index.test.ts`

**Interfaces:**
- Consumes: `ReturnComposer`, `ComposedReturn`, `ReturnBoxLine`, `VatRecordRow` from `src/lib/regimes/types.ts`; `CountryConfigError` from `src/lib/country/resolveCountryConfig` (verified export site); `roundMoney` (`src/lib/financialMath.ts:13`)
- Produces: `usJurisdictionRemitComposer: ReturnComposer` (key `'us_jurisdiction_remit'`) — the Phase-3 return pipeline persists its boxes into `tax_return_lines`; box `meta.jurisdiction_ref` is the drill-down key. The composer is a pure function of its args; `periodBounds`' `filingFrequency`/`periodAnchor` are supplied by the Phase-3 pipeline from the **registered** `tax.filing_frequency`/`tax.period_anchor` keys (Task 3b) — this task reads no `country_config` directly and invents no key.

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/us_jurisdiction_remit/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { usJurisdictionRemitComposer } from './index';
import { CountryConfigError } from '../../country/resolveCountryConfig';
import type { VatRecordRow } from '../types';

function ledgerRow(componentCode: string, jurisdictionRef: string | null,
  vatBase: number, taxableBase: number, taxPeriod: string): VatRecordRow {
  return {
    id: `vr-${componentCode}-${vatBase}`, tenant_id: 't-1', record_type: 'sale', record_id: 'doc-1',
    vat_amount: vatBase, vat_rate: 6.25, tax_period: taxPeriod,
    currency: 'USD', exchange_rate: 1, vat_amount_base: vatBase, taxable_amount_base: taxableBase,
    component_code: componentCode, jurisdiction_ref: jurisdictionRef, tax_treatment: 'standard',
    regime_key: 'us_sales_tax', tax_point_date: '2026-07-15',
    source_document_type: 'invoice', source_document_id: 'doc-1',
    created_at: '2026-07-15T00:00:00Z', updated_at: null, deleted_at: null,
  } as VatRecordRow;
}

describe('usJurisdictionRemitComposer.periodBounds', () => {
  it('quarterly calendar bounds in tenant-local date math', () => {
    expect(usJurisdictionRemitComposer.periodBounds('quarterly', '01-01', '2026-08-10', 'America/Chicago'))
      .toEqual({ periodStart: '2026-07-01', periodEnd: '2026-09-30', taxPeriods: ['2026-07', '2026-08', '2026-09'] });
  });
  it('monthly bounds', () => {
    expect(usJurisdictionRemitComposer.periodBounds('monthly', '01-01', '2026-02-10', 'America/Chicago'))
      .toEqual({ periodStart: '2026-02-01', periodEnd: '2026-02-28', taxPeriods: ['2026-02'] });
  });
});

describe('usJurisdictionRemitComposer.compose', () => {
  const input = {
    tenantId: 't-1', legalEntityId: 'le-1', taxPeriods: ['2026-07', '2026-08', '2026-09'],
    jurisdictionCurrency: 'USD', baseCurrency: 'USD',
    ledgerRows: [
      ledgerRow('STATE', 'sub-tx', 125, 2000, '2026-07'),
      ledgerRow('STATE', 'sub-tx', 62.5, 1000, '2026-08'),
      ledgerRow('CITY', 'sub-austin', 20, 2000, '2026-07'),
      ledgerRow('DISTRICT', 'sub-mta', 20, 2000, '2026-07'),
      ledgerRow('STATE', 'sub-tx', -125, -2000, '2026-09'),   // credit-note contra nets in
    ],
  };

  it('groups base amounts per (jurisdiction, component) into remittance lines', () => {
    const composed = usJurisdictionRemitComposer.compose(input);
    expect(composed.boxes).toEqual([
      { boxCode: 'REMIT:STATE:sub-tx', boxLabel: 'STATE — sub-tx', amountBase: 62.5, meta: { jurisdiction_ref: 'sub-tx', component_code: 'STATE', taxable_base: 1000 }, sequence: 1 },
      { boxCode: 'REMIT:CITY:sub-austin', boxLabel: 'CITY — sub-austin', amountBase: 20, meta: { jurisdiction_ref: 'sub-austin', component_code: 'CITY', taxable_base: 2000 }, sequence: 2 },
      { boxCode: 'REMIT:DISTRICT:sub-mta', boxLabel: 'DISTRICT — sub-mta', amountBase: 20, meta: { jurisdiction_ref: 'sub-mta', component_code: 'DISTRICT', taxable_base: 2000 }, sequence: 3 },
    ]);
    expect(composed.meta).toEqual({ boxScheme: 'us_jurisdiction_remit', totalRemittanceBase: 102.5 });
  });

  it('throws CountryConfigError when base currency differs from the jurisdiction currency (graft 7)', () => {
    expect(() => usJurisdictionRemitComposer.compose({ ...input, baseCurrency: 'OMR' }))
      .toThrow(CountryConfigError);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/us_jurisdiction_remit/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/us_jurisdiction_remit/index.ts`:

```typescript
import type { ReturnComposer, ReturnBoxLine } from '../types';
import { CountryConfigError } from '../../country/resolveCountryConfig';
import { roundMoney } from '../../financialMath';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Per-jurisdiction remittance worksheet: vat_records base amounts grouped by
 *  (jurisdiction_ref, component_code). Every figure traces back through
 *  rule_trace to the rate rows and pack version that produced it. */
export const usJurisdictionRemitComposer: ReturnComposer = {
  key: 'us_jurisdiction_remit',
  version: '1.0.0',

  periodBounds(filingFrequency, _periodAnchor, forDate, _timezone) {
    const y = Number(forDate.slice(0, 4));
    const m = Number(forDate.slice(5, 7));
    if (filingFrequency === 'monthly') {
      return {
        periodStart: `${y}-${pad2(m)}-01`,
        periodEnd: `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}`,
        taxPeriods: [`${y}-${pad2(m)}`],
      };
    }
    if (filingFrequency === 'annual') {
      return {
        periodStart: `${y}-01-01`,
        periodEnd: `${y}-12-31`,
        taxPeriods: Array.from({ length: 12 }, (_, i) => `${y}-${pad2(i + 1)}`),
      };
    }
    const qStart = m - ((m - 1) % 3);
    const qEnd = qStart + 2;
    return {
      periodStart: `${y}-${pad2(qStart)}-01`,
      periodEnd: `${y}-${pad2(qEnd)}-${pad2(lastDayOfMonth(y, qEnd))}`,
      taxPeriods: [qStart, qStart + 1, qEnd].map((mm) => `${y}-${pad2(mm)}`),
    };
  },

  compose(input) {
    if (input.baseCurrency !== input.jurisdictionCurrency) {
      throw new CountryConfigError(
        `us_jurisdiction_remit files in ${input.jurisdictionCurrency}; tenant base is ${input.baseCurrency}`,
      );
    }
    const groups = new Map<string, { component: string; jurisdiction: string | null; tax: number; taxable: number; order: number }>();
    let order = 0;
    for (const row of input.ledgerRows) {
      const component = row.component_code ?? 'TAX';
      const jurisdiction = row.jurisdiction_ref;
      const key = `${component}:${jurisdiction ?? 'UNASSIGNED'}`;
      const existing = groups.get(key);
      if (existing) {
        existing.tax += row.vat_amount_base ?? 0;
        existing.taxable += row.taxable_amount_base ?? 0;
      } else {
        order += 1;
        groups.set(key, {
          component, jurisdiction,
          tax: row.vat_amount_base ?? 0,
          taxable: row.taxable_amount_base ?? 0,
          order,
        });
      }
    }
    const boxes: ReturnBoxLine[] = [...groups.values()].map((g) => ({
      boxCode: `REMIT:${g.component}:${g.jurisdiction ?? 'UNASSIGNED'}`,
      boxLabel: `${g.component} — ${g.jurisdiction ?? 'unassigned'}`,
      amountBase: roundMoney(g.tax, 2),
      meta: {
        jurisdiction_ref: g.jurisdiction,
        component_code: g.component,
        taxable_base: roundMoney(g.taxable, 2),
      },
      sequence: g.order,
    }));
    return {
      boxes,
      meta: {
        boxScheme: 'us_jurisdiction_remit',
        totalRemittanceBase: roundMoney(boxes.reduce((s, b) => s + b.amountBase, 0), 2),
      },
    };
  },
};
```

Modify `src/lib/regimes/register.ts` — add:

```typescript
import { usJurisdictionRemitComposer } from './us_jurisdiction_remit';

registerRegimePlugin('return', usJurisdictionRemitComposer);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/us_jurisdiction_remit/ && npm run typecheck`
Expected: PASS, 0 tsc errors.

- [ ] **Step 5: Commit + PR**

```bash
git add src/lib/regimes/us_jurisdiction_remit/ src/lib/regimes/register.ts
git commit -m "feat(l10n-p5): us_jurisdiction_remit per-jurisdiction remittance composer"
```

Open PR `feat/l10n-p5-nexus-and-remit`.

---

# WP-6 — UK pack: mixed-rate VAT, reverse charge, MTD 9-box + filing transport

Branch: `feat/l10n-p5-uk-mtd` cut fresh from `main` after WP-5 merges.

### Task 17: `uk_mtd_9box` ReturnComposer with stagger-group period anchors

**Files:**
- Create: `src/lib/regimes/uk_mtd_9box/index.ts`
- Modify: `src/lib/regimes/register.ts`
- Test: `src/lib/regimes/uk_mtd_9box/index.test.ts`

**Interfaces:**
- Consumes: `ReturnComposer`, `ReturnBoxLine`, `VatRecordRow` (`src/lib/regimes/types.ts`); `CountryConfigError`; `roundMoney`
- Produces: `ukMtd9BoxComposer: ReturnComposer` (key `'uk_mtd_9box'`) — boxes 1–9 as `ReturnBoxLine` rows (boxCode `'BOX1'..'BOX9'`); consumed by Task 19's payload builder and the Phase-3 return pipeline

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/uk_mtd_9box/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ukMtd9BoxComposer } from './index';
import { CountryConfigError } from '../../country/resolveCountryConfig';
import type { VatRecordRow } from '../types';

function row(recordType: 'sale' | 'purchase', vatBase: number, taxableBase: number, taxPeriod: string): VatRecordRow {
  return {
    id: `vr-${recordType}-${vatBase}-${taxPeriod}`, tenant_id: 't-1', record_type: recordType,
    record_id: 'doc-1', vat_amount: vatBase, vat_rate: 20, tax_period: taxPeriod,
    currency: 'GBP', exchange_rate: 1, vat_amount_base: vatBase, taxable_amount_base: taxableBase,
    component_code: 'VAT', jurisdiction_ref: null, tax_treatment: 'standard',
    regime_key: 'simple_vat', tax_point_date: '2026-05-10',
    source_document_type: 'invoice', source_document_id: 'doc-1',
    created_at: '2026-05-10T00:00:00Z', updated_at: null, deleted_at: null,
  } as VatRecordRow;
}

describe('ukMtd9BoxComposer.periodBounds — stagger groups', () => {
  it('stagger group 1 (anchor 01-01): quarters end Mar/Jun/Sep/Dec', () => {
    expect(ukMtd9BoxComposer.periodBounds('quarterly', '01-01', '2026-05-10', 'Europe/London'))
      .toEqual({ periodStart: '2026-04-01', periodEnd: '2026-06-30', taxPeriods: ['2026-04', '2026-05', '2026-06'] });
  });
  it('stagger group 2 (anchor 02-01): quarters end Apr/Jul/Oct/Jan', () => {
    expect(ukMtd9BoxComposer.periodBounds('quarterly', '02-01', '2026-05-10', 'Europe/London'))
      .toEqual({ periodStart: '2026-05-01', periodEnd: '2026-07-31', taxPeriods: ['2026-05', '2026-06', '2026-07'] });
  });
  it('stagger group 3 (anchor 03-01): quarters end Feb/May/Aug/Nov — with a year boundary', () => {
    expect(ukMtd9BoxComposer.periodBounds('quarterly', '03-01', '2026-01-15', 'Europe/London'))
      .toEqual({ periodStart: '2025-12-01', periodEnd: '2026-02-28', taxPeriods: ['2025-12', '2026-01', '2026-02'] });
  });
});

describe('ukMtd9BoxComposer.compose — the 9 boxes', () => {
  const input = {
    tenantId: 't-1', legalEntityId: 'le-1', taxPeriods: ['2026-04', '2026-05', '2026-06'],
    jurisdictionCurrency: 'GBP', baseCurrency: 'GBP',
    ledgerRows: [
      row('sale', 200, 1000, '2026-04'),
      row('sale', 100, 500, '2026-05'),
      row('sale', -20, -100, '2026-06'),      // credit-note contra
      row('purchase', 60, 300.75, '2026-05'),
    ],
  };

  it('maps the ledger onto boxes 1..9 with whole-pound boxes 6-9 (pence truncated)', () => {
    const { boxes, meta } = ukMtd9BoxComposer.compose(input);
    const byCode = Object.fromEntries(boxes.map((b) => [b.boxCode, b.amountBase]));
    expect(byCode).toEqual({
      BOX1: 280,      // output VAT 200+100-20
      BOX2: 0,        // EU acquisitions — services lab, none
      BOX3: 280,      // box1 + box2
      BOX4: 60,       // input VAT reclaimed
      BOX5: 220,      // |box3 - box4|
      BOX6: 1400,     // sales ex-VAT, whole pounds
      BOX7: 300,      // purchases ex-VAT, whole pounds (300.75 → 300)
      BOX8: 0,
      BOX9: 0,
    });
    expect(boxes).toHaveLength(9);
    expect(boxes.map((b) => b.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(meta).toEqual({ boxScheme: 'uk_mtd_9box' });
  });

  it('throws CountryConfigError on base/jurisdiction currency mismatch (graft 7)', () => {
    expect(() => ukMtd9BoxComposer.compose({ ...input, baseCurrency: 'USD' }))
      .toThrow(CountryConfigError);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/uk_mtd_9box/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/uk_mtd_9box/index.ts`:

```typescript
import type { ReturnComposer, ReturnBoxLine } from '../types';
import { CountryConfigError } from '../../country/resolveCountryConfig';
import { roundMoney } from '../../financialMath';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Whole pounds, pence left out (HMRC boxes 6-9 rule): truncate toward zero. */
function wholePounds(value: number): number {
  return Math.trunc(value);
}

const BOX_LABELS: Record<string, string> = {
  BOX1: 'VAT due on sales and other outputs',
  BOX2: 'VAT due on acquisitions from EU member states',
  BOX3: 'Total VAT due',
  BOX4: 'VAT reclaimed on purchases and other inputs',
  BOX5: 'Net VAT to pay to HMRC or reclaim',
  BOX6: 'Total value of sales excluding VAT',
  BOX7: 'Total value of purchases excluding VAT',
  BOX8: 'Total value of goods supplied to EU member states excluding VAT',
  BOX9: 'Total value of acquisitions from EU member states excluding VAT',
};

/** MTD 9-box. Stagger groups are periodAnchor DATA: the anchor month modulo 3
 *  fixes which quarter cycle the tenant files on (group 1 = 01-01, group 2 =
 *  02-01, group 3 = 03-01) — no code branch per group. Pure date-string math;
 *  no Date-object timezone drift (the Phase-0 lesson). */
export const ukMtd9BoxComposer: ReturnComposer = {
  key: 'uk_mtd_9box',
  version: '1.0.0',

  periodBounds(filingFrequency, periodAnchor, forDate, _timezone) {
    let y = Number(forDate.slice(0, 4));
    const m = Number(forDate.slice(5, 7));
    if (filingFrequency === 'monthly') {
      return {
        periodStart: `${y}-${pad2(m)}-01`,
        periodEnd: `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}`,
        taxPeriods: [`${y}-${pad2(m)}`],
      };
    }
    if (filingFrequency === 'annual') {
      const anchorMonth = Number(periodAnchor.slice(0, 2));
      let startY = y;
      if (m < anchorMonth) startY -= 1;
      const months = Array.from({ length: 12 }, (_, i) => {
        const mm = ((anchorMonth - 1 + i) % 12) + 1;
        const yy = startY + Math.floor((anchorMonth - 1 + i) / 12);
        return `${yy}-${pad2(mm)}`;
      });
      const endMonth = ((anchorMonth + 10) % 12) + 1;
      const endYear = anchorMonth === 1 ? startY : startY + 1;
      return {
        periodStart: `${startY}-${pad2(anchorMonth)}-01`,
        periodEnd: `${endYear}-${pad2(endMonth)}-${pad2(lastDayOfMonth(endYear, endMonth))}`,
        taxPeriods: months,
      };
    }
    // quarterly: cycle offset from the stagger anchor month
    const offset = (Number(periodAnchor.slice(0, 2)) - 1) % 3;
    let qs = m;
    while ((qs - 1) % 3 !== offset) {
      qs -= 1;
      if (qs < 1) { qs += 12; y -= 1; }
    }
    const qEndMonth = ((qs + 1) % 12) + 1;
    const qEndYear = qs + 2 > 12 ? y + 1 : y;
    const taxPeriods = [0, 1, 2].map((i) => {
      const mm = ((qs - 1 + i) % 12) + 1;
      const yy = qs + i > 12 ? y + 1 : y;
      return `${yy}-${pad2(mm)}`;
    });
    return {
      periodStart: `${y}-${pad2(qs)}-01`,
      periodEnd: `${qEndYear}-${pad2(qEndMonth)}-${pad2(lastDayOfMonth(qEndYear, qEndMonth))}`,
      taxPeriods,
    };
  },

  compose(input) {
    if (input.baseCurrency !== input.jurisdictionCurrency) {
      throw new CountryConfigError(
        `uk_mtd_9box files in ${input.jurisdictionCurrency}; tenant base is ${input.baseCurrency}`,
      );
    }
    let outputVat = 0; let inputVat = 0; let salesEx = 0; let purchasesEx = 0;
    for (const r of input.ledgerRows) {
      if (r.record_type === 'sale') {
        outputVat += r.vat_amount_base ?? 0;
        salesEx += r.taxable_amount_base ?? 0;
      } else if (r.record_type === 'purchase') {
        inputVat += r.vat_amount_base ?? 0;
        purchasesEx += r.taxable_amount_base ?? 0;
      }
    }
    const box1 = roundMoney(outputVat, 2);
    const box2 = 0;
    const box3 = roundMoney(box1 + box2, 2);
    const box4 = roundMoney(inputVat, 2);
    const box5 = roundMoney(Math.abs(box3 - box4), 2);
    const amounts: Record<string, number> = {
      BOX1: box1, BOX2: box2, BOX3: box3, BOX4: box4, BOX5: box5,
      BOX6: wholePounds(salesEx), BOX7: wholePounds(purchasesEx), BOX8: 0, BOX9: 0,
    };
    const boxes: ReturnBoxLine[] = Object.entries(amounts).map(([code, amount], i) => ({
      boxCode: code,
      boxLabel: BOX_LABELS[code],
      amountBase: amount,
      sequence: i + 1,
    }));
    return { boxes, meta: { boxScheme: 'uk_mtd_9box' } };
  },
};
```

Modify `src/lib/regimes/register.ts` — add:

```typescript
import { ukMtd9BoxComposer } from './uk_mtd_9box';

registerRegimePlugin('return', ukMtd9BoxComposer);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/uk_mtd_9box/ && npm run typecheck`
Expected: PASS, 0 tsc errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/uk_mtd_9box/ src/lib/regimes/register.ts
git commit -m "feat(l10n-p5): uk_mtd_9box composer with stagger-group period anchors"
```

### Task 18: UK golden fixtures — mixed-rate 20/5/0 + reverse-charge notation

**Files:**
- Create: `src/lib/regimes/simple_vat/fixtures/gb_mixed_rate.json`
- Create: `src/lib/regimes/simple_vat/fixtures/gb_reverse_charge.json`
- Modify: `scripts/localization/statutory-fixtures.test.ts` (add `GB` to the CI gate's country list with hardcoded fixture JSON imports)
- Test: `src/lib/regimes/simple_vat/gbFixtures.test.ts`

**Interfaces:**
- Consumes: existing `simple_vat` plugin (Phase 1 — no code change; UK is data-only on the tax side), `runPublishGate`, the GB fixture JSON files (imported directly)
- Produces: `GB` fixture set (also inserted DB-side in Task 24)

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/simple_vat/gbFixtures.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import '../register';
import { runPublishGate } from '../../tax/publishGate';
import type { PackFixture } from '../../tax/publishGate';
import gbMixedRate from './fixtures/gb_mixed_rate.json';
import gbReverseCharge from './fixtures/gb_reverse_charge.json';

const GB_FIXTURES = [gbMixedRate, gbReverseCharge] as PackFixture[];

describe('UK pack fixtures — simple_vat mixed rates + reverse charge', () => {
  it('exposes both GB fixtures', () => {
    expect(GB_FIXTURES.map((f) => f.name))
      .toEqual(['gb_mixed_rate', 'gb_reverse_charge']);
  });
  it('replays green through the shared publish-gate runner', async () => {
    const { pass, results } = await runPublishGate({
      countryCode: 'GB', fixtures: GB_FIXTURES, mode: 'kernel',
    });
    expect(results.flatMap((r) => r.diffs)).toEqual([]);
    expect(pass).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/simple_vat/gbFixtures.test.ts`
Expected: FAIL — `Cannot find module './fixtures/gb_mixed_rate.json'` (fixture files not created yet).

- [ ] **Step 3: Create the fixtures and wire the statutory-fixtures gate**

Create `src/lib/regimes/simple_vat/fixtures/gb_mixed_rate.json` — one document, three lines at 20/5/0 (mixed-rate documents are the UK matrix cell, spec line 981):

```json
{
  "name": "gb_mixed_rate",
  "input_document": {
    "documentType": "invoice",
    "regimeTaxKey": "simple_vat",
    "currency": "GBP",
    "documentDecimals": 2,
    "taxPointDate": "2026-05-10",
    "taxInclusive": false,
    "documentDiscount": 0,
    "roundingPolicy": { "mode": "half_up", "level": "document" },
    "scaleSystem": "western",
    "seller": { "subdivisionCode": null, "registrations": [{ "subdivisionCode": null, "taxNumber": "GB123456789", "scheme": "standard", "registeredFrom": "2020-01-01", "registeredTo": null }] },
    "buyer": { "taxNumber": "GB987654321", "isBusiness": true, "subdivisionCode": null },
    "placeOfSupplySubdivisionCode": null,
    "rates": [
      { "subdivisionCode": null, "componentCode": "VAT", "componentLabel": "VAT (Standard 20%)", "taxCategory": "standard", "rate": 20.0, "validFrom": "2011-01-04" },
      { "subdivisionCode": null, "componentCode": "VAT", "componentLabel": "VAT (Reduced 5%)", "taxCategory": "reduced", "rate": 5.0, "validFrom": "2011-01-04" },
      { "subdivisionCode": null, "componentCode": "VAT", "componentLabel": "VAT (Zero Rate)", "taxCategory": "zero", "rate": 0.0, "validFrom": "2011-01-04" }
    ],
    "lines": [
      { "lineItemId": "li-1", "description": "RAID recovery service", "quantity": 1, "unitPrice": 1000, "lineDiscount": 0, "unitCode": "C62", "itemCode": null, "treatment": "standard", "treatmentReasonCode": null },
      { "lineItemId": "li-2", "description": "Energy-saving media handling", "quantity": 1, "unitPrice": 200, "lineDiscount": 0, "unitCode": "C62", "itemCode": null, "treatment": "reduced", "treatmentReasonCode": null },
      { "lineItemId": "li-3", "description": "Exported recovered-data delivery", "quantity": 1, "unitPrice": 300, "lineDiscount": 0, "unitCode": "C62", "itemCode": null, "treatment": "zero_rated", "treatmentReasonCode": "EXPORT_SERVICES" }
    ]
  },
  "expected": {
    "lines": [
      { "lineItemId": "li-1", "componentCode": "VAT", "rate": 20.0, "taxableBase": 1000, "taxAmount": 200, "taxTreatment": "standard" },
      { "lineItemId": "li-2", "componentCode": "VAT", "rate": 5.0, "taxableBase": 200, "taxAmount": 10, "taxTreatment": "reduced" },
      { "lineItemId": "li-3", "componentCode": "VAT", "rate": 0.0, "taxableBase": 300, "taxAmount": 0, "taxTreatment": "zero_rated" }
    ],
    "totals": { "taxableBase": 1500, "taxTotal": 210, "grandTotal": 1710, "roundingAdjustment": null }
  }
}
```

Create `src/lib/regimes/simple_vat/fixtures/gb_reverse_charge.json` (COMPLETE — single reverse-charge B2B line, buyer VAT number present, zero VAT + mandatory notation):

```json
{
  "name": "gb_reverse_charge",
  "input_document": {
    "documentType": "invoice",
    "regimeTaxKey": "simple_vat",
    "currency": "GBP",
    "documentDecimals": 2,
    "taxPointDate": "2026-05-10",
    "taxInclusive": false,
    "documentDiscount": 0,
    "roundingPolicy": { "mode": "half_up", "level": "document" },
    "scaleSystem": "western",
    "seller": { "subdivisionCode": null, "registrations": [{ "subdivisionCode": null, "taxNumber": "GB123456789", "scheme": "standard", "registeredFrom": "2020-01-01", "registeredTo": null }] },
    "buyer": { "taxNumber": "GB987654321", "isBusiness": true, "subdivisionCode": null },
    "placeOfSupplySubdivisionCode": null,
    "rates": [
      { "subdivisionCode": null, "componentCode": "VAT", "componentLabel": "VAT (Standard 20%)", "taxCategory": "standard", "rate": 20.0, "validFrom": "2011-01-04" },
      { "subdivisionCode": null, "componentCode": "VAT", "componentLabel": "VAT (Reduced 5%)", "taxCategory": "reduced", "rate": 5.0, "validFrom": "2011-01-04" },
      { "subdivisionCode": null, "componentCode": "VAT", "componentLabel": "VAT (Zero Rate)", "taxCategory": "zero", "rate": 0.0, "validFrom": "2011-01-04" }
    ],
    "lines": [
      { "lineItemId": "li-1", "description": "RAID recovery service (reverse charge)", "quantity": 1, "unitPrice": 1000, "lineDiscount": 0, "unitCode": "C62", "itemCode": null, "treatment": "reverse_charge", "treatmentReasonCode": "REVERSE_CHARGE_B2B" }
    ]
  },
  "expected": {
    "totals": { "taxableBase": 1000, "taxTotal": 0, "grandTotal": 1000, "roundingAdjustment": null },
    "notations": [
      { "code": "REVERSE_CHARGE", "text": "Reverse charge: customer to account for VAT to HMRC." }
    ]
  }
}
```

Extend the Phase-1 `statutory-fixtures` gate `scripts/localization/statutory-fixtures.test.ts` — add hardcoded GB fixture imports to its per-country fixtures map (same pattern as the OM/AE/SA/US entries):

```typescript
import gbMixedRate from '../../src/lib/regimes/simple_vat/fixtures/gb_mixed_rate.json';
import gbReverseCharge from '../../src/lib/regimes/simple_vat/fixtures/gb_reverse_charge.json';

// add to the gate's per-country fixtures map:
  GB: [gbMixedRate, gbReverseCharge] as PackFixture[],
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/simple_vat/gbFixtures.test.ts && npm run typecheck`
Expected: PASS. If the reverse-charge notation text differs from the Phase-1 `simple_vat` notation emitter, align the FIXTURE to the emitter's exact text (the emitter is the single source; fixtures are evidence).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/simple_vat/fixtures/ src/lib/regimes/simple_vat/gbFixtures.test.ts scripts/localization/statutory-fixtures.test.ts
git commit -m "feat(l10n-p5): UK golden fixtures — 20/5/0 mixed rates + reverse charge"
```

### Task 19: `uk_mtd` filing transport — artifact-first 9-box payload

**Files:**
- Create: `src/lib/regimes/uk_mtd/index.ts`
- Modify: `src/lib/regimes/register.ts`
- Test: `src/lib/regimes/uk_mtd/index.test.ts`

**Interfaces:**
- Consumes: `EInvoicingTransport`, `IssuedDocumentSnapshot`, `ComposedReturn` (`src/lib/regimes/types.ts`); `sha256Hex` (`src/lib/tax/hash.ts`); Task 17 box codes
- Produces: `buildMtd9BoxBody(composed, vrn, periodKey): Mtd9BoxBody`, `ukMtdTransport: EInvoicingTransport` (key `'uk_mtd'`, regimeClass `'filing_api'`) — Task 20's edge function payload is pinned byte-identical to `buildMtd9BoxBody`

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/uk_mtd/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildMtd9BoxBody, ukMtdTransport } from './index';
import type { ComposedReturn, IssuedDocumentSnapshot } from '../types';

const composed: ComposedReturn = {
  boxes: [
    { boxCode: 'BOX1', boxLabel: 'VAT due on sales and other outputs', amountBase: 280, sequence: 1 },
    { boxCode: 'BOX2', boxLabel: 'VAT due on acquisitions from EU member states', amountBase: 0, sequence: 2 },
    { boxCode: 'BOX3', boxLabel: 'Total VAT due', amountBase: 280, sequence: 3 },
    { boxCode: 'BOX4', boxLabel: 'VAT reclaimed on purchases and other inputs', amountBase: 60, sequence: 4 },
    { boxCode: 'BOX5', boxLabel: 'Net VAT to pay to HMRC or reclaim', amountBase: 220, sequence: 5 },
    { boxCode: 'BOX6', boxLabel: 'Total value of sales excluding VAT', amountBase: 1400, sequence: 6 },
    { boxCode: 'BOX7', boxLabel: 'Total value of purchases excluding VAT', amountBase: 300, sequence: 7 },
    { boxCode: 'BOX8', boxLabel: 'Total value of goods supplied to EU member states excluding VAT', amountBase: 0, sequence: 8 },
    { boxCode: 'BOX9', boxLabel: 'Total value of acquisitions from EU member states excluding VAT', amountBase: 0, sequence: 9 },
  ],
  meta: { boxScheme: 'uk_mtd_9box' },
};

describe('buildMtd9BoxBody', () => {
  it('maps box codes onto the HMRC VAT-return body, finalised', () => {
    expect(buildMtd9BoxBody(composed, '123456789', '26A2')).toEqual({
      periodKey: '26A2',
      vatDueSales: 280, vatDueAcquisitions: 0, totalVatDue: 280,
      vatReclaimedCurrPeriod: 60, netVatDue: 220,
      totalValueSalesExVAT: 1400, totalValuePurchasesExVAT: 300,
      totalValueGoodsSuppliedExVAT: 0, totalAcquisitionsExVAT: 0,
      finalised: true,
    });
  });
  it('throws when a box is missing (never files a partial return)', () => {
    expect(() => buildMtd9BoxBody({ boxes: composed.boxes.slice(0, 8), meta: {} }, '123456789', '26A2'))
      .toThrow(/BOX9/);
  });
});

describe('ukMtdTransport.buildArtifact', () => {
  const snapshot: IssuedDocumentSnapshot = {
    documentType: 'vat_return', documentId: 'ret-1', tenantId: 't-1',
    number: null, issuedAt: '2026-07-07T10:00:00Z',
    payload: { composedReturn: composed, vrn: '123456789', periodKey: '26A2' },
  };
  it('is deterministic and sha256-addressed (artifact-generation-first)', () => {
    const a = ukMtdTransport.buildArtifact(snapshot);
    const b = ukMtdTransport.buildArtifact(snapshot);
    expect(a.artifactType).toBe('uk_mtd_vat_return');
    expect(a.payload).toBe(b.payload);
    expect(a.payloadHash).toBe(b.payloadHash);
    expect(a.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ukMtdTransport.regimeClass).toBe('filing_api');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/uk_mtd/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/uk_mtd/index.ts`:

```typescript
import type { ComposedReturn, EInvoicingTransport, IssuedDocumentSnapshot } from '../types';
import { sha256Hex } from '../../tax/hash';

export interface Mtd9BoxBody {
  periodKey: string;
  vatDueSales: number;
  vatDueAcquisitions: number;
  totalVatDue: number;
  vatReclaimedCurrPeriod: number;
  netVatDue: number;
  totalValueSalesExVAT: number;
  totalValuePurchasesExVAT: number;
  totalValueGoodsSuppliedExVAT: number;
  totalAcquisitionsExVAT: number;
  finalised: boolean;
}

const BOX_TO_FIELD: Array<[string, keyof Omit<Mtd9BoxBody, 'periodKey' | 'finalised'>]> = [
  ['BOX1', 'vatDueSales'], ['BOX2', 'vatDueAcquisitions'], ['BOX3', 'totalVatDue'],
  ['BOX4', 'vatReclaimedCurrPeriod'], ['BOX5', 'netVatDue'], ['BOX6', 'totalValueSalesExVAT'],
  ['BOX7', 'totalValuePurchasesExVAT'], ['BOX8', 'totalValueGoodsSuppliedExVAT'],
  ['BOX9', 'totalAcquisitionsExVAT'],
];

/** HMRC MTD VAT-return body from a composed 9-box return. The edge function
 *  supabase/functions/uk-mtd-file/mtdPayload.ts carries a byte-identical copy
 *  (edge functions share no code) pinned by its contract test. */
export function buildMtd9BoxBody(composed: ComposedReturn, _vrn: string, periodKey: string): Mtd9BoxBody {
  const byCode = new Map(composed.boxes.map((b) => [b.boxCode, b.amountBase]));
  const body: Partial<Mtd9BoxBody> = { periodKey, finalised: true };
  for (const [code, field] of BOX_TO_FIELD) {
    const value = byCode.get(code);
    if (value === undefined) throw new Error(`uk_mtd: composed return is missing ${code}`);
    body[field] = value;
  }
  return body as Mtd9BoxBody;
}

function readFilingPayload(doc: IssuedDocumentSnapshot): { composed: ComposedReturn; vrn: string; periodKey: string } {
  const composed = doc.payload['composedReturn'] as ComposedReturn | undefined;
  const vrn = doc.payload['vrn'];
  const periodKey = doc.payload['periodKey'];
  if (!composed || typeof vrn !== 'string' || typeof periodKey !== 'string') {
    throw new Error('uk_mtd: snapshot payload must carry composedReturn, vrn, periodKey');
  }
  return { composed, vrn, periodKey };
}

/** filing_api transport: the artifact IS the 9-box JSON body. Submission to
 *  HMRC happens in the uk-mtd-file edge function (sandbox behind a flag);
 *  the sealed artifact exists FIRST so a failed submission never loses the
 *  return that was composed (artifact-generation-first, like IRN). */
export const ukMtdTransport: EInvoicingTransport = {
  key: 'uk_mtd',
  version: '1.0.0',
  regimeClass: 'filing_api',
  buildArtifact(doc: IssuedDocumentSnapshot) {
    const { composed, vrn, periodKey } = readFilingPayload(doc);
    const payload = JSON.stringify(buildMtd9BoxBody(composed, vrn, periodKey));
    return { artifactType: 'uk_mtd_vat_return', payload, payloadHash: sha256Hex(payload) };
  },
};
```

Modify `src/lib/regimes/register.ts` — add:

```typescript
import { ukMtdTransport } from './uk_mtd';

registerRegimePlugin('einvoice', ukMtdTransport);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/uk_mtd/ && npm run typecheck`
Expected: PASS, 0 tsc errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/uk_mtd/ src/lib/regimes/register.ts
git commit -m "feat(l10n-p5): uk_mtd filing_api transport — artifact-first 9-box payload"
```

### Task 20: `uk-mtd-file` edge function (HMRC sandbox behind a flag)

**Files:**
- Create: `supabase/functions/uk-mtd-file/index.ts`
- Create: `supabase/functions/uk-mtd-file/mtdPayload.ts`
- Test: `supabase/functions/uk-mtd-file/mtdPayload.test.ts` (runs under the separate scripts config `vitest.config.scripts.ts` via `npm run geo:test` — `vitest.config.scripts.ts:16` already includes `supabase/functions/**/*.test.ts`; NOT discovered by `npm run test`)

**Interfaces:**
- Consumes: env `MTD_SANDBOX_ENABLED`, `MTD_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; RPC `append_einvoice_submission` (Task 21 — deploy this function AFTER WP-7's M5-4 merges, or land WP-6 and WP-7 in the same release train); `master_einvoice_regimes.config.base_url_sandbox` (Task 3)
- Produces: deployed edge function `uk-mtd-file` accepting `{ vat_return_id, vrn, period_key, composed_return }` and returning `{ submission_id, status }`

- [ ] **Step 1: Write the failing contract test**

Create `supabase/functions/uk-mtd-file/mtdPayload.test.ts` (pins the Deno copy byte-identical to the `src/lib/regimes/uk_mtd` builder — the acknowledged DRY seam):

```typescript
import { describe, it, expect } from 'vitest';
import { buildMtd9BoxBody as edgeBuild } from './mtdPayload';
import { buildMtd9BoxBody as libBuild } from '../../../src/lib/regimes/uk_mtd/index';
import type { ComposedReturn } from '../../../src/lib/regimes/types';

const composed: ComposedReturn = {
  boxes: [
    { boxCode: 'BOX1', boxLabel: 'b1', amountBase: 280, sequence: 1 },
    { boxCode: 'BOX2', boxLabel: 'b2', amountBase: 0, sequence: 2 },
    { boxCode: 'BOX3', boxLabel: 'b3', amountBase: 280, sequence: 3 },
    { boxCode: 'BOX4', boxLabel: 'b4', amountBase: 60, sequence: 4 },
    { boxCode: 'BOX5', boxLabel: 'b5', amountBase: 220, sequence: 5 },
    { boxCode: 'BOX6', boxLabel: 'b6', amountBase: 1400, sequence: 6 },
    { boxCode: 'BOX7', boxLabel: 'b7', amountBase: 300, sequence: 7 },
    { boxCode: 'BOX8', boxLabel: 'b8', amountBase: 0, sequence: 8 },
    { boxCode: 'BOX9', boxLabel: 'b9', amountBase: 0, sequence: 9 },
  ],
  meta: {},
};

describe('uk-mtd-file payload contract', () => {
  it('the edge copy is byte-identical to the src/lib/regimes builder', () => {
    expect(JSON.stringify(edgeBuild(composed, '123456789', '26A2')))
      .toBe(JSON.stringify(libBuild(composed, '123456789', '26A2')));
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run --config vitest.config.scripts.ts supabase/functions/uk-mtd-file/mtdPayload.test.ts`
Expected: FAIL — `./mtdPayload` not found.

- [ ] **Step 3: Implement the pure module and the Deno handler**

Create `supabase/functions/uk-mtd-file/mtdPayload.ts` — an exact copy of the `Mtd9BoxBody` interface, `BOX_TO_FIELD` table, and `buildMtd9BoxBody` function from `src/lib/regimes/uk_mtd/index.ts` (Task 19 Step 3), with `ComposedReturn` replaced by a local structural type (no cross-boundary imports in the shipped module):

```typescript
export interface EdgeComposedReturn {
  boxes: Array<{ boxCode: string; boxLabel: string; amountBase: number; sequence: number }>;
  meta: Record<string, unknown>;
}

export interface Mtd9BoxBody {
  periodKey: string;
  vatDueSales: number;
  vatDueAcquisitions: number;
  totalVatDue: number;
  vatReclaimedCurrPeriod: number;
  netVatDue: number;
  totalValueSalesExVAT: number;
  totalValuePurchasesExVAT: number;
  totalValueGoodsSuppliedExVAT: number;
  totalAcquisitionsExVAT: number;
  finalised: boolean;
}

const BOX_TO_FIELD: Array<[string, keyof Omit<Mtd9BoxBody, 'periodKey' | 'finalised'>]> = [
  ['BOX1', 'vatDueSales'], ['BOX2', 'vatDueAcquisitions'], ['BOX3', 'totalVatDue'],
  ['BOX4', 'vatReclaimedCurrPeriod'], ['BOX5', 'netVatDue'], ['BOX6', 'totalValueSalesExVAT'],
  ['BOX7', 'totalValuePurchasesExVAT'], ['BOX8', 'totalValueGoodsSuppliedExVAT'],
  ['BOX9', 'totalAcquisitionsExVAT'],
];

export function buildMtd9BoxBody(composed: EdgeComposedReturn, _vrn: string, periodKey: string): Mtd9BoxBody {
  const byCode = new Map(composed.boxes.map((b) => [b.boxCode, b.amountBase]));
  const body: Partial<Mtd9BoxBody> = { periodKey, finalised: true };
  for (const [code, field] of BOX_TO_FIELD) {
    const value = byCode.get(code);
    if (value === undefined) throw new Error(`uk_mtd: composed return is missing ${code}`);
    body[field] = value;
  }
  return body as Mtd9BoxBody;
}
```

Create `supabase/functions/uk-mtd-file/index.ts`:

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildMtd9BoxBody, type EdgeComposedReturn } from './mtdPayload.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { vat_return_id, vrn, period_key, composed_return, tenant_id } = await req.json() as {
      vat_return_id: string; vrn: string; period_key: string;
      composed_return: EdgeComposedReturn; tenant_id: string;
    };
    if (!vat_return_id || !vrn || !period_key || !composed_return || !tenant_id) {
      return new Response(JSON.stringify({ error: 'vat_return_id, vrn, period_key, composed_return, tenant_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Artifact-generation-first: seal the payload BEFORE any network attempt.
    const body = buildMtd9BoxBody(composed_return, vrn, period_key);
    const payload = JSON.stringify(body);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    const payloadHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

    const sandboxEnabled = Deno.env.get('MTD_SANDBOX_ENABLED') === 'true';
    const accessToken = Deno.env.get('MTD_ACCESS_TOKEN') ?? '';

    const appendRow = async (status: string, authorityReference: string | null, authorityResponse: unknown) => {
      const { data, error } = await supabase.rpc('append_einvoice_submission', {
        p_row: {
          tenant_id, document_type: 'vat_return', document_id: vat_return_id,
          regime_key: 'uk_mtd', artifact_type: 'uk_mtd_vat_return',
          payload_storage_path: null, payload_hash: payloadHash, status,
          authority_reference: authorityReference, authority_response: authorityResponse,
          submitted_at: status === 'submitted' || status === 'accepted' ? new Date().toISOString() : null,
          sealed_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      return data;
    };

    // 2. Generate-and-hold when filing is not enabled/credentialed.
    if (!sandboxEnabled || !accessToken) {
      const held = await appendRow('held', null, { reason: 'MTD filing disabled or no access token' });
      return new Response(JSON.stringify({ submission_id: held.id, status: 'held' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Sandbox filing (HMRC VAT API). Fraud-prevention headers are the
    //    minimum sandbox set; production go-live is an operator step.
    const response = await fetch(
      `https://test-api.service.hmrc.gov.uk/organisations/vat/${vrn}/returns`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/vnd.hmrc.1.0+json',
          Authorization: `Bearer ${accessToken}`,
          'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
        },
        body: payload,
      },
    );
    const responseBody = await response.json().catch(() => null);
    if (response.ok) {
      const ref = (responseBody?.formBundleNumber as string | undefined) ?? null;
      const accepted = await appendRow('accepted', ref, responseBody);
      return new Response(JSON.stringify({ submission_id: accepted.id, status: 'accepted' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const rejected = await appendRow('rejected', null, { http_status: response.status, body: responseBody });
    return new Response(JSON.stringify({ submission_id: rejected.id, status: 'rejected' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
```

- [ ] **Step 4: Run tests, verify pass; deploy**

Run: `npx vitest run --config vitest.config.scripts.ts supabase/functions/uk-mtd-file/mtdPayload.test.ts`
Expected: PASS.
Deploy via `mcp__supabase__deploy_edge_function` (project_id `ssmbegiyjivrcwgcqutu`, name `uk-mtd-file`) only after M5-4 (Task 21) has applied `append_einvoice_submission`.

- [ ] **Step 5: Commit + PR**

```bash
git add supabase/functions/uk-mtd-file/
git commit -m "feat(l10n-p5): uk-mtd-file edge function — sandbox-flagged 9-box filing"
```

Open PR `feat/l10n-p5-uk-mtd`.

---

# WP-7 — ZATCA Phase 2 clearance (`clearance_api` + `previous_hash` chaining)

Branch: `feat/l10n-p5-zatca-p2` cut fresh from `main` after WP-6 merges. Migration-classified PR.

### Task 21: `zatca_ph2` regime row + `append_einvoice_submission` chain RPC (M5-4)

**Files:**
- Migration: `phase5_zatca_ph2_regime_and_chain_rpc` via `mcp__supabase__apply_migration`
- Modify: `src/types/database.types.ts` (regen — new RPC signature)
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `master_einvoice_regimes`, `master_engine_capabilities`, `einvoice_submissions` (entry-criteria column set)
- Produces: SA regime row `zatca_ph2` (`clearance_api`, wave thresholds as data); RPC `append_einvoice_submission(p_row jsonb) RETURNS einvoice_submissions` — the ONLY chain-append path, used by Tasks 20 and 23

- [ ] **Step 1: Failing probe**

`mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM master_einvoice_regimes e JOIN geo_countries c ON c.id = e.country_id
    WHERE c.code = 'SA' AND e.code = 'zatca_ph2') AS ph2_rows,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'append_einvoice_submission') AS rpc_exists;
```

Expected: `ph2_rows = 0`, `rpc_exists = 0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` name `phase5_zatca_ph2_regime_and_chain_rpc`:

```sql
-- Phase 5 / M5-4 — ZATCA Phase 2: clearance_api regime row (wave mandates as
-- DATA) + the serialized chain-append RPC. einvoice_submissions stays
-- append-only; status transitions are NEW rows; previous_hash chains payload
-- hashes per (tenant, regime) under an advisory lock so the chain cannot fork.
WITH sa AS (SELECT id FROM geo_countries WHERE code = 'SA')
INSERT INTO master_einvoice_regimes
  (country_id, code, regime_class, adapter_key, mandatory_from, thresholds, config)
SELECT sa.id, 'zatca_ph2', 'clearance_api', 'zatca_ph2', '2023-01-01',
       '{"waves": [
          {"wave": 1, "revenue_threshold_sar": 3000000000, "mandatory_from": "2023-01-01"},
          {"wave": 2, "revenue_threshold_sar": 500000000,  "mandatory_from": "2023-07-01"},
          {"wave": 3, "revenue_threshold_sar": 250000000,  "mandatory_from": "2023-10-01"}
        ]}'::jsonb,
       '{"clearance_url_sandbox": "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/clearance/single",
         "max_attempts": 3}'::jsonb
FROM sa;

INSERT INTO master_engine_capabilities (capability_key, kind, min_engine_version)
VALUES ('zatca_ph2', 'regime_adapter', '0.1.0')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.append_einvoice_submission(p_row jsonb)
RETURNS einvoice_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := (p_row->>'tenant_id')::uuid;
  v_regime text := p_row->>'regime_key';
  v_prev   text;
  v_result einvoice_submissions;
BEGIN
  IF v_tenant IS NULL OR v_regime IS NULL THEN
    RAISE EXCEPTION 'append_einvoice_submission: tenant_id and regime_key are required';
  END IF;
  -- Serialize the per-tenant chain: concurrent issuances cannot fork previous_hash.
  PERFORM pg_advisory_xact_lock(hashtext('einvoice_chain:' || v_tenant::text || ':' || v_regime));

  -- Chain from the most recent SEALED artifact for this (tenant, regime),
  -- regardless of the authority verdict. CRITICAL: a generate-and-hold artifact
  -- (status 'held' — the un-credentialed degraded DEFAULT the shipped edge
  -- functions emit, see Task 23 clearanceCore line ~3932 and Task 20 MTD held
  -- path) IS the ZATCA PIH predecessor and MUST advance the chain; a
  -- rejected/dead-lettered artifact still carries an ICV, so including it keeps
  -- the PIH gap-free. Only soft-deleted rows are excluded. ('generated' is
  -- intentionally absent — NO shipped transport emits it; the terminal statuses
  -- below are the real chain. The earlier `('generated','submitted','accepted')`
  -- set was a defect: it excluded 'held', so every generate-and-hold invoice got
  -- previous_hash = NULL and the chain never formed.)
  SELECT payload_hash INTO v_prev
  FROM einvoice_submissions
  WHERE tenant_id = v_tenant AND regime_key = v_regime
    AND status IN ('held','submitted','accepted','rejected','dead_letter')
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO einvoice_submissions
    (tenant_id, document_type, document_id, regime_key, artifact_type,
     payload_storage_path, payload_hash, previous_hash, status,
     authority_reference, authority_response, submitted_at, sealed_at)
  VALUES
    (v_tenant,
     p_row->>'document_type',
     (p_row->>'document_id')::uuid,
     v_regime,
     p_row->>'artifact_type',
     p_row->>'payload_storage_path',
     p_row->>'payload_hash',
     COALESCE(p_row->>'previous_hash', v_prev),
     p_row->>'status',
     p_row->>'authority_reference',
     CASE WHEN p_row ? 'authority_response' THEN p_row->'authority_response' ELSE NULL END,
     (p_row->>'submitted_at')::timestamptz,
     (p_row->>'sealed_at')::timestamptz)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.append_einvoice_submission(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_einvoice_submission(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.append_einvoice_submission(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_einvoice_submission(jsonb) TO service_role;
```

- [ ] **Step 3: Assert chaining behavior with a SQL probe**

`mcp__supabase__execute_sql`. The probe exercises the EXACT status the shipped
transports write — `'held'` (the un-credentialed generate-and-hold default), NOT
the phantom `'generated'` no production path emits — so it proves the shipped
chaining behavior, not a status the code never produces. It runs inside a
`DO` block that appends two `held` rows for a disposable `regime_key`
(`zatca_ph2_probe`), asserts the chain within the transaction, then `RAISE`s to
**abort and roll back** — so the append-only forensic ledger of the live demo
tenant is never seeded with probe rows (append-only forbids cleanup; a rolled-back
transaction never persists, and no UPDATE/DELETE is issued):

```sql
DO $$
DECLARE
  v_t uuid := (SELECT id FROM tenants LIMIT 1);
  r1 einvoice_submissions;
  r2 einvoice_submissions;
BEGIN
  r1 := append_einvoice_submission(jsonb_build_object(
    'tenant_id', v_t, 'document_type', 'invoice', 'document_id', gen_random_uuid(),
    'regime_key', 'zatca_ph2_probe', 'artifact_type', 'probe',
    'payload_hash', 'aaaa', 'status', 'held', 'sealed_at', now()::text));
  r2 := append_einvoice_submission(jsonb_build_object(
    'tenant_id', v_t, 'document_type', 'invoice', 'document_id', gen_random_uuid(),
    'regime_key', 'zatca_ph2_probe', 'artifact_type', 'probe',
    'payload_hash', 'bbbb', 'status', 'held', 'sealed_at', now()::text));
  -- The genesis row has no predecessor; the second row must chain to the first's
  -- payload_hash even though both are 'held' (the fix under test).
  ASSERT r1.previous_hash IS NULL,
    format('genesis row must have NULL previous_hash, got %L', r1.previous_hash);
  ASSERT r2.previous_hash = 'aaaa',
    format('second held row must chain to first payload_hash ''aaaa'', got %L', r2.previous_hash);
  RAISE EXCEPTION 'PROBE_OK: held→held chaining verified (first_prev=NULL, second_prev=aaaa); rolling back probe rows — no live-ledger pollution';
END $$;
```

Expected: the statement ends with `ERROR: PROBE_OK: held→held chaining verified …` (a deliberate abort — the assertions passed and the two probe rows were rolled back). If either `ASSERT` fires first, its message names the real defect (e.g. `second held row must chain … got NULL` = the chain never formed for `held` rows). Also verify the grant posture:

```sql
SELECT grantee FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'append_einvoice_submission'
  AND privilege_type = 'EXECUTE' AND grantee IN ('anon','authenticated');
```

Expected: 0 rows.

- [ ] **Step 4: Regen types + manifest + commit**

Run `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) → save to `src/types/database.types.ts`. Append manifest row:

```
| <version> | phase5_zatca_ph2_regime_and_chain_rpc.sql | Additive | zatca_ph2 clearance_api regime row + append_einvoice_submission chain RPC (service_role-only) | #<PR> |
```

```bash
npm run typecheck
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(l10n-p5): zatca_ph2 regime row + serialized einvoice chain-append RPC"
```

### Task 22: `zatca_ph2` transport — deterministic UBL artifact + wave mandates as data

**Files:**
- Create: `src/lib/regimes/zatca_ph2/index.ts`
- Create: `src/lib/regimes/zatca_ph2/waveMandate.ts`
- Modify: `src/lib/regimes/register.ts`
- Test: `src/lib/regimes/zatca_ph2/index.test.ts`
- Test: `src/lib/regimes/zatca_ph2/waveMandate.test.ts`

**Interfaces:**
- Consumes: `EInvoicingTransport`, `IssuedDocumentSnapshot` (`src/lib/regimes/types.ts`); `sha256Hex` (`src/lib/tax/hash.ts`); `buildZatcaTlvBase64`, `ZatcaInvoiceFields` (`src/lib/pdf/engine/zatcaQr.ts` — verified, Phase-1 TLV builder reused, never duplicated)
- Produces: `buildZatcaP2InvoiceXml(input, previousInvoiceHash): string`, `zatcaPh2Transport: EInvoicingTransport` (key `'zatca_ph2'`, regimeClass `'clearance_api'`), `resolveZatcaWaveMandate(args): WaveMandateResult` — consumed by Task 23's edge function and the issuance transport hook

- [ ] **Step 1: Write the failing tests**

Create `src/lib/regimes/zatca_ph2/waveMandate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveZatcaWaveMandate, type ZatcaWave } from './waveMandate';

const waves: ZatcaWave[] = [
  { wave: 1, revenue_threshold_sar: 3_000_000_000, mandatory_from: '2023-01-01' },
  { wave: 2, revenue_threshold_sar: 500_000_000, mandatory_from: '2023-07-01' },
  { wave: 3, revenue_threshold_sar: 250_000_000, mandatory_from: '2023-10-01' },
];

describe('resolveZatcaWaveMandate — thresholds from regime config, never hardcoded', () => {
  it('mandates the lowest wave whose threshold and date are both met', () => {
    expect(resolveZatcaWaveMandate({ waves, tenantAnnualRevenueSar: 600_000_000, onDate: '2026-07-02' }))
      .toEqual({ mandated: true, wave: 2, reason: 'mandated' });
  });
  it('is below-threshold when revenue is under every wave', () => {
    expect(resolveZatcaWaveMandate({ waves, tenantAnnualRevenueSar: 1_000_000, onDate: '2026-07-02' }))
      .toEqual({ mandated: false, wave: null, reason: 'below_threshold' });
  });
  it('is before-mandate-date when a wave matches but is not yet effective', () => {
    expect(resolveZatcaWaveMandate({ waves, tenantAnnualRevenueSar: 600_000_000, onDate: '2023-06-30' }))
      .toEqual({ mandated: false, wave: 2, reason: 'before_mandate_date' });
  });
  it('is HONESTLY unknown when revenue is unknown — never silently compliant or mandated', () => {
    expect(resolveZatcaWaveMandate({ waves, tenantAnnualRevenueSar: null, onDate: '2026-07-02' }))
      .toEqual({ mandated: false, wave: null, reason: 'revenue_unknown' });
  });
});
```

Create `src/lib/regimes/zatca_ph2/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildZatcaP2InvoiceXml, zatcaPh2Transport, type ZatcaP2InvoiceInput } from './index';
import type { IssuedDocumentSnapshot } from '../types';

const input: ZatcaP2InvoiceInput = {
  invoiceNumber: 'INVO-10193', uuid: '8e6b2c9a-0000-4000-8000-000000000001',
  issueDateTime: '2026-07-02T10:00:00Z',
  sellerName: 'Riyadh Recovery Lab LLC', sellerVatNumber: '310123456700003',
  buyerName: 'Acme Trading', buyerVatNumber: '311987654300003',
  currency: 'SAR',
  lines: [{ description: 'SSD data recovery', quantity: 1, unitPrice: 1000, taxRate: 15, taxAmount: 150, lineTotal: 1150 }],
  taxableAmount: 1000, vatTotal: 150, grandTotal: 1150,
  invoiceCounter: 42,
};

describe('buildZatcaP2InvoiceXml', () => {
  it('is deterministic (same input → byte-identical XML)', () => {
    expect(buildZatcaP2InvoiceXml(input, 'PREVHASH')).toBe(buildZatcaP2InvoiceXml(input, 'PREVHASH'));
  });
  it('embeds PIH, ICV, UUID, VAT numbers and totals', () => {
    const xml = buildZatcaP2InvoiceXml(input, 'PREVHASH');
    expect(xml).toContain('PREVHASH');                       // PIH
    expect(xml).toContain('<cbc:ID>INVO-10193</cbc:ID>');
    expect(xml).toContain('<cbc:UUID>8e6b2c9a-0000-4000-8000-000000000001</cbc:UUID>');
    expect(xml).toContain('310123456700003');
    expect(xml).toContain('>42<');                           // ICV counter
    expect(xml).toContain('currencyID="SAR">150.00<');
    expect(xml).toContain('currencyID="SAR">1150.00<');
  });
  it('escapes XML-significant characters in party names', () => {
    const xml = buildZatcaP2InvoiceXml({ ...input, sellerName: 'A&B <Labs>' }, 'X');
    expect(xml).toContain('A&amp;B &lt;Labs&gt;');
    expect(xml).not.toContain('A&B <Labs>');
  });
});

describe('zatcaPh2Transport.buildArtifact', () => {
  it('builds a clearance_api artifact with a sha256 payload hash', () => {
    const snapshot: IssuedDocumentSnapshot = {
      documentType: 'invoice', documentId: 'inv-1', tenantId: 't-1',
      number: 'INVO-10193', issuedAt: '2026-07-02T10:00:00Z',
      payload: { zatcaP2: input, previousHash: 'PREVHASH' },
    };
    const artifact = zatcaPh2Transport.buildArtifact(snapshot);
    expect(zatcaPh2Transport.regimeClass).toBe('clearance_api');
    expect(artifact.artifactType).toBe('zatca_ubl_invoice');
    expect(artifact.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(String(artifact.payload)).toContain('PREVHASH');
  });
  it('fails loudly when the snapshot payload is malformed (never a silent artifact)', () => {
    const bad: IssuedDocumentSnapshot = {
      documentType: 'invoice', documentId: 'inv-1', tenantId: 't-1',
      number: null, issuedAt: '2026-07-02T10:00:00Z', payload: {},
    };
    expect(() => zatcaPh2Transport.buildArtifact(bad)).toThrow(/zatcaP2/);
  });
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `npx vitest run src/lib/regimes/zatca_ph2/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/zatca_ph2/waveMandate.ts`:

```typescript
export interface ZatcaWave {
  wave: number;
  revenue_threshold_sar: number;
  mandatory_from: string;
}

export interface WaveMandateResult {
  mandated: boolean;
  wave: number | null;
  reason: 'mandated' | 'below_threshold' | 'revenue_unknown' | 'before_mandate_date';
}

/** Wave mandates are regime-config DATA (master_einvoice_regimes.thresholds).
 *  Unknown revenue is surfaced as revenue_unknown — the UI flags it for the
 *  operator; the platform never silently claims (non-)compliance. */
export function resolveZatcaWaveMandate(args: {
  waves: ZatcaWave[];
  tenantAnnualRevenueSar: number | null;
  onDate: string;
}): WaveMandateResult {
  if (args.tenantAnnualRevenueSar === null) {
    return { mandated: false, wave: null, reason: 'revenue_unknown' };
  }
  const eligible = args.waves
    .filter((w) => args.tenantAnnualRevenueSar! >= w.revenue_threshold_sar)
    .sort((a, b) => a.revenue_threshold_sar - b.revenue_threshold_sar);
  const match = eligible[0];
  if (!match) return { mandated: false, wave: null, reason: 'below_threshold' };
  if (args.onDate < match.mandatory_from) {
    return { mandated: false, wave: match.wave, reason: 'before_mandate_date' };
  }
  return { mandated: true, wave: match.wave, reason: 'mandated' };
}
```

Create `src/lib/regimes/zatca_ph2/index.ts`:

```typescript
import type { EInvoicingTransport, IssuedDocumentSnapshot } from '../types';
import { sha256Hex } from '../../tax/hash';

export interface ZatcaP2InvoiceInput {
  invoiceNumber: string;
  uuid: string;
  issueDateTime: string;
  sellerName: string;
  sellerVatNumber: string;
  buyerName: string | null;
  buyerVatNumber: string | null;
  currency: string;
  lines: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number; taxAmount: number; lineTotal: number }>;
  taxableAmount: number;
  vatTotal: number;
  grandTotal: number;
  invoiceCounter: number;   // ICV — monotonic per device/tenant
}

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function money(value: number): string {
  return value.toFixed(2);
}

/** Deterministic ZATCA UBL 2.1 invoice XML (reporting/clearance profile).
 *  PIH = previous invoice hash (the einvoice_submissions previous_hash chain);
 *  cryptographic signing (CSID) is applied by the clearance edge function —
 *  this builder produces the canonical unsigned document. */
export function buildZatcaP2InvoiceXml(input: ZatcaP2InvoiceInput, previousInvoiceHash: string): string {
  const lines = input.lines.map((l, i) => `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">${l.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${esc(input.currency)}">${money(l.quantity * l.unitPrice)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${esc(input.currency)}">${money(l.taxAmount)}</cbc:TaxAmount>
        <cbc:RoundingAmount currencyID="${esc(input.currency)}">${money(l.lineTotal)}</cbc:RoundingAmount>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${esc(l.description)}</cbc:Name>
        <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${l.taxRate}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price><cbc:PriceAmount currencyID="${esc(input.currency)}">${money(l.unitPrice)}</cbc:PriceAmount></cac:Price>
    </cac:InvoiceLine>`).join('');

  const buyerParty = input.buyerName === null ? '' : `
  <cac:AccountingCustomerParty><cac:Party>
    ${input.buyerVatNumber ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(input.buyerVatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
    <cac:PartyLegalEntity><cbc:RegistrationName>${esc(input.buyerName)}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${esc(input.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${esc(input.uuid)}</cbc:UUID>
  <cbc:IssueDate>${input.issueDateTime.slice(0, 10)}</cbc:IssueDate>
  <cbc:IssueTime>${input.issueDateTime.slice(11, 19)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${esc(input.currency)}</cbc:DocumentCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${input.invoiceCounter}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(previousInvoiceHash)}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyTaxScheme><cbc:CompanyID>${esc(input.sellerVatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${esc(input.sellerName)}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>${buyerParty}
  <cac:TaxTotal><cbc:TaxAmount currencyID="${esc(input.currency)}">${money(input.vatTotal)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="${esc(input.currency)}">${money(input.taxableAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(input.currency)}">${money(input.grandTotal)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${esc(input.currency)}">${money(input.grandTotal)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>`;
}

function readP2Payload(doc: IssuedDocumentSnapshot): { input: ZatcaP2InvoiceInput; previousHash: string } {
  const input = doc.payload['zatcaP2'] as ZatcaP2InvoiceInput | undefined;
  const previousHash = doc.payload['previousHash'];
  if (!input || typeof input.invoiceNumber !== 'string') {
    throw new Error('zatca_ph2: snapshot payload must carry zatcaP2 input');
  }
  return { input, previousHash: typeof previousHash === 'string' ? previousHash : '0' };
}

/** clearance_api transport: the artifact is the canonical unsigned UBL XML.
 *  The zatca-phase2-clearance edge function signs (CSID) and submits it,
 *  appending status rows via append_einvoice_submission. */
export const zatcaPh2Transport: EInvoicingTransport = {
  key: 'zatca_ph2',
  version: '0.1.0',
  regimeClass: 'clearance_api',
  buildArtifact(doc: IssuedDocumentSnapshot) {
    const { input, previousHash } = readP2Payload(doc);
    const payload = buildZatcaP2InvoiceXml(input, previousHash);
    return { artifactType: 'zatca_ubl_invoice', payload, payloadHash: sha256Hex(payload) };
  },
};
```

Modify `src/lib/regimes/register.ts` — add:

```typescript
import { zatcaPh2Transport } from './zatca_ph2';

registerRegimePlugin('einvoice', zatcaPh2Transport);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/zatca_ph2/ && npm run typecheck && npx eslint src/lib/regimes/zatca_ph2`
Expected: PASS (8 tests), 0 tsc errors, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/zatca_ph2/ src/lib/regimes/register.ts
git commit -m "feat(l10n-p5): zatca_ph2 clearance transport — deterministic UBL + wave mandates as data"
```

### Task 23: `zatca-phase2-clearance` edge function — clearance with degraded modes

**Files:**
- Create: `supabase/functions/zatca-phase2-clearance/index.ts`
- Create: `supabase/functions/zatca-phase2-clearance/clearanceCore.ts`
- Test: `supabase/functions/zatca-phase2-clearance/clearanceCore.test.ts`

**Interfaces:**
- Consumes: RPC `append_einvoice_submission` (Task 21); env `ZATCA_CSID_CERT`, `ZATCA_CSID_PRIVATE_KEY`, `ZATCA_CLEARANCE_ENABLED`; regime config `max_attempts` (Task 21 row)
- Produces: deployed edge function `zatca-phase2-clearance` accepting `{ tenant_id, document_id, xml, payload_hash, invoice_hash }` and returning `{ submission_id, status }`; state machine — `held` (no credentials), `accepted`/`rejected` (authority verdicts), `dead_letter` (exhausted retries)

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/zatca-phase2-clearance/clearanceCore.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { decideClearanceStep } from './clearanceCore';

describe('decideClearanceStep — the clearance state machine', () => {
  it('generate-and-hold when credentials are absent (degraded mode, never blocks issuance)', () => {
    expect(decideClearanceStep({ hasCredentials: false, httpStatus: null, attempt: 1, maxAttempts: 3 }))
      .toEqual({ action: 'append', status: 'held' });
  });
  it('accepted on authority 200/202', () => {
    expect(decideClearanceStep({ hasCredentials: true, httpStatus: 200, attempt: 1, maxAttempts: 3 }))
      .toEqual({ action: 'append', status: 'accepted' });
    expect(decideClearanceStep({ hasCredentials: true, httpStatus: 202, attempt: 1, maxAttempts: 3 }))
      .toEqual({ action: 'append', status: 'accepted' });
  });
  it('rejected on authority 4xx (a verdict, not an outage — no retry)', () => {
    expect(decideClearanceStep({ hasCredentials: true, httpStatus: 400, attempt: 1, maxAttempts: 3 }))
      .toEqual({ action: 'append', status: 'rejected' });
  });
  it('retries on 5xx/network until attempts are exhausted, then dead-letters', () => {
    expect(decideClearanceStep({ hasCredentials: true, httpStatus: 503, attempt: 1, maxAttempts: 3 }))
      .toEqual({ action: 'retry' });
    expect(decideClearanceStep({ hasCredentials: true, httpStatus: null, attempt: 2, maxAttempts: 3 }))
      .toEqual({ action: 'retry' });
    expect(decideClearanceStep({ hasCredentials: true, httpStatus: 503, attempt: 3, maxAttempts: 3 }))
      .toEqual({ action: 'append', status: 'dead_letter' });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run --config vitest.config.scripts.ts supabase/functions/zatca-phase2-clearance/clearanceCore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

Create `supabase/functions/zatca-phase2-clearance/clearanceCore.ts`:

```typescript
export type ClearanceStatus = 'held' | 'accepted' | 'rejected' | 'dead_letter';

export type ClearanceStep =
  | { action: 'retry' }
  | { action: 'append'; status: ClearanceStatus };

/** Pure clearance state machine. 4xx = an authority VERDICT (rejected, no
 *  retry); 5xx/network = an outage (retry, then dead_letter); no credentials =
 *  generate-and-hold so issuance is never blocked by ZATCA availability. */
export function decideClearanceStep(args: {
  hasCredentials: boolean;
  httpStatus: number | null;
  attempt: number;
  maxAttempts: number;
}): ClearanceStep {
  if (!args.hasCredentials) return { action: 'append', status: 'held' };
  if (args.httpStatus !== null && args.httpStatus >= 200 && args.httpStatus < 300) {
    return { action: 'append', status: 'accepted' };
  }
  if (args.httpStatus !== null && args.httpStatus >= 400 && args.httpStatus < 500) {
    return { action: 'append', status: 'rejected' };
  }
  if (args.attempt >= args.maxAttempts) return { action: 'append', status: 'dead_letter' };
  return { action: 'retry' };
}
```

Create `supabase/functions/zatca-phase2-clearance/index.ts`:

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decideClearanceStep } from './clearanceCore.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { tenant_id, document_id, xml, payload_hash, invoice_hash } = await req.json() as {
      tenant_id: string; document_id: string; xml: string; payload_hash: string; invoice_hash: string;
    };
    if (!tenant_id || !document_id || !xml || !payload_hash || !invoice_hash) {
      return new Response(JSON.stringify({ error: 'tenant_id, document_id, xml, payload_hash, invoice_hash required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const appendRow = async (status: string, authorityReference: string | null, authorityResponse: unknown) => {
      const { data, error } = await supabase.rpc('append_einvoice_submission', {
        p_row: {
          tenant_id, document_type: 'invoice', document_id,
          regime_key: 'zatca_ph2', artifact_type: 'zatca_ubl_invoice',
          payload_storage_path: null, payload_hash, status,
          authority_reference: authorityReference, authority_response: authorityResponse,
          submitted_at: status === 'accepted' || status === 'rejected' ? new Date().toISOString() : null,
          sealed_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      return data;
    };

    const cert = Deno.env.get('ZATCA_CSID_CERT') ?? '';
    const key = Deno.env.get('ZATCA_CSID_PRIVATE_KEY') ?? '';
    const enabled = Deno.env.get('ZATCA_CLEARANCE_ENABLED') === 'true';
    const hasCredentials = enabled && cert.length > 0 && key.length > 0;

    // Load clearance endpoint + retry budget from the regime row (data, not code).
    const { data: regime } = await supabase
      .from('master_einvoice_regimes')
      .select('config')
      .eq('code', 'zatca_ph2')
      .maybeSingle();
    const config = (regime?.config ?? {}) as { clearance_url_sandbox?: string; max_attempts?: number };
    const maxAttempts = config.max_attempts ?? 3;
    const clearanceUrl = config.clearance_url_sandbox ?? '';

    let attempt = 0;
    let httpStatus: number | null = null;
    let responseBody: unknown = null;
    for (;;) {
      attempt += 1;
      if (hasCredentials && clearanceUrl) {
        try {
          const response = await fetch(clearanceUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'Accept-Version': 'V2',
              Authorization: `Basic ${btoa(`${cert}:`)}`,
            },
            body: JSON.stringify({
              invoiceHash: invoice_hash,
              uuid: document_id,
              invoice: btoa(unescape(encodeURIComponent(xml))),
            }),
          });
          httpStatus = response.status;
          responseBody = await response.json().catch(() => null);
        } catch {
          httpStatus = null;   // network outage
          responseBody = null;
        }
      }
      const step = decideClearanceStep({ hasCredentials, httpStatus, attempt, maxAttempts });
      if (step.action === 'retry') continue;
      const reference = step.status === 'accepted'
        ? ((responseBody as { clearedInvoice?: string } | null)?.clearedInvoice ? invoice_hash : invoice_hash)
        : null;
      const row = await appendRow(step.status, reference, responseBody ?? { reason: hasCredentials ? 'authority_unreachable' : 'no CSID credentials' });
      return new Response(JSON.stringify({ submission_id: row.id, status: step.status }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
```

- [ ] **Step 4: Run tests, verify pass; deploy**

Run: `npx vitest run --config vitest.config.scripts.ts supabase/functions/zatca-phase2-clearance/clearanceCore.test.ts`
Expected: PASS (4 tests).
Deploy via `mcp__supabase__deploy_edge_function` (project_id `ssmbegiyjivrcwgcqutu`, name `zatca-phase2-clearance`). Without CSID env secrets the function appends `held` rows — the documented degraded mode.

- [ ] **Step 5: Commit + PR**

```bash
git add supabase/functions/zatca-phase2-clearance/
git commit -m "feat(l10n-p5): zatca-phase2-clearance edge function with previous_hash chaining"
```

Open PR `feat/l10n-p5-zatca-p2` using the migration template (covers M5-4).

---

# WP-8 — SALT review gate, pack fixtures, publish to `statutory_ready`

Branch: `feat/l10n-p5-publish-gate` cut fresh from `main` after WP-7 merges. Migration-classified PR.

### Task 24: DB-resident pack fixtures for US + UK (M5-5)

**Files:**
- Migration: `phase5_us_uk_pack_fixtures` via `mcp__supabase__apply_migration`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: repo fixture JSONs (Tasks 6, 18 — the DB rows carry the SAME `input_document`/`expected` payloads: dual-resident by design, spec §Testing-1), `master_country_pack_tests`, pack version rows (Tasks 2–3)
- Produces: 6 `master_country_pack_tests` rows (4 US + 2 GB) replayed by `publish_country_pack` at every publish

- [ ] **Step 1: Failing probe**

```sql
SELECT c.code, count(*) FROM master_country_pack_tests t
JOIN geo_countries c ON c.id = t.country_id
WHERE c.code IN ('US','GB') GROUP BY c.code;
```

Expected: 0 rows.

- [ ] **Step 2: Apply the migration**

The migration body is **GENERATED** from the six repo fixture files (Tasks 6, 18) — there are NO hand-filled slots. Run the generator, which reads each JSON and emits the exact `INSERT` SQL with dollar-quoted jsonb literals (`$json$…$json$` cannot collide with fixture content), then apply its output via `mcp__supabase__apply_migration` name `phase5_us_uk_pack_fixtures`:

Write the generator to a temp ESM script via a **quoted** heredoc (`<<'EOF'` — no shell interpolation, so the SQL single quotes and JS backticks inside are safe), then run it:

```bash
cat > gen-phase5-fixtures.mjs.out <<'EOF'
import fs from 'node:fs';
// [country code, fixtures subdir, fixture names] — the 6 repo fixtures from Tasks 6 & 18.
const packs = [
  ['US', 'us_sales_tax', ['us_austin_stack', 'us_ca_no_nexus', 'us_de_exempt_state', 'us_nexus_expired']],
  ['GB', 'simple_vat',   ['gb_mixed_rate', 'gb_reverse_charge']],
];
const dq = (obj) => '$json$' + JSON.stringify(obj) + '$json$';  // dollar-quoted jsonb literal
let out =
  '-- Phase 5 / M5-5 — DB-resident golden fixtures, GENERATED from\n' +
  '-- src/lib/regimes/**/fixtures/*.json (byte-identical, dual-resident; no hand-copying).\n' +
  '-- The publish gate replays these on EVERY pack publish, including single-rate-row\n' +
  '-- Studio edits repo CI never sees.\n';
for (const [code, subdir, names] of packs) {
  const rows = names.map((n) => {
    const f = JSON.parse(fs.readFileSync(`src/lib/regimes/${subdir}/fixtures/${n}.json`, 'utf8'));
    return `  ('${n}', ${dq(f.input_document)}::jsonb, ${dq(f.expected)}::jsonb)`;
  }).join(',\n');
  out +=
    `\nWITH c AS (SELECT id FROM geo_countries WHERE code = '${code}'),\n` +
    `     pv AS (SELECT v.id FROM master_country_pack_versions v JOIN c ON v.country_id = c.id WHERE v.version = 1)\n` +
    `INSERT INTO master_country_pack_tests (country_id, pack_version_id, name, input_document, expected)\n` +
    `SELECT c.id, pv.id, f.name, f.input_document, f.expected\n` +
    `FROM c, pv, (VALUES\n${rows}\n) AS f(name, input_document, expected);\n`;
}
fs.writeFileSync('phase5_us_uk_pack_fixtures.sql.out', out);
process.stdout.write(out);
EOF
node gen-phase5-fixtures.mjs.out
```

`*.out` is gitignored (never committed). Apply the emitted `phase5_us_uk_pack_fixtures.sql.out` verbatim as the `phase5_us_uk_pack_fixtures` migration (pass its contents as the `mcp__supabase__apply_migration` query). Because the SQL is machine-derived from the repo files, repo↔DB byte-identity holds by construction. Guard it anyway with a diff check in the PR (run after apply):

```bash
# For each fixture, the DB row must equal the repo file (canonicalized).
for f in us_sales_tax/us_austin_stack us_sales_tax/us_ca_no_nexus us_sales_tax/us_de_exempt_state \
         us_sales_tax/us_nexus_expired simple_vat/gb_mixed_rate simple_vat/gb_reverse_charge; do
  name=$(basename "$f")
  jq -S '{input_document, expected}' "src/lib/regimes/${f%/*}/fixtures/${name}.json"
  # compare against: SELECT jsonb_build_object('input_document',input_document,'expected',expected)
  #                  FROM master_country_pack_tests WHERE name='${name}';  (via mcp__supabase__execute_sql)
done
```
A mismatch between repo and DB fixture bodies is a defect — regenerate, do not hand-edit.

- [ ] **Step 3: Assert applied state**

```sql
SELECT c.code, count(*) AS fixtures FROM master_country_pack_tests t
JOIN geo_countries c ON c.id = t.country_id
WHERE c.code IN ('US','GB') GROUP BY c.code ORDER BY c.code;
```

Expected: `GB 2`, `US 4`.

- [ ] **Step 4: Manifest row + commit**

```
| <version> | phase5_us_uk_pack_fixtures.sql | Additive | 6 master_country_pack_tests golden fixtures (US 4, GB 2), dual-resident with repo fixtures | #<PR> |
```

```bash
git add supabase/migrations.manifest.md
git commit -m "feat(l10n-p5): DB-resident US/UK pack fixtures for the publish gate"
```

### Task 25: External US SALT review — gated sign-off + provenance flip (M5-6)

**Files:**
- Create: `docs/superpowers/reviews/2026-us-salt-review-packet.md`
- Migration (only AFTER sign-off): `phase5_us_salt_signoff` via `mcp__supabase__apply_migration`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: US rate rows (Task 2, `data_source = 'draft_pending_salt_review'`), US fixtures (Tasks 6/24)
- Produces: recorded SALT sign-off; `data_source = 'salt_validated'` provenance — Task 26's US publish is BLOCKED until this lands (owner decision E1: validate with qualified statutory experts before any country's production release)

- [ ] **Step 1: Author the review packet (the handoff artifact — same pattern as the Phase-4 India CA task)**

Create `docs/superpowers/reviews/2026-us-salt-review-packet.md` with exactly these sections filled from the shipped data:

```markdown
# US Sales & Use Tax — External SALT Review Packet (2026-US-SALT-R1)

## Scope
- Native engine claim: subdivision-granularity accuracy (state/county/city/district
  component stacking); street-level and product-taxability explicitly provider-gated.
- Jurisdictions under review: TX (state 6.25% + City of Austin 1.00% + Austin MTA 1.00%),
  CO (state 2.90%), CA (state 7.25% — no-nexus fixture only), DE (no-sales-tax handling).
- Nexus model: legal_entity_tax_registrations rows (registered_from/to per state);
  out_of_scope treatment when no active registration covers the ship-to state.
- Out of scope: marketplace facilitator rules, economic-nexus thresholds automation,
  home-rule locals beyond the seeded Austin stack, product taxability matrices.

## Rate rows under review
| Jurisdiction | Component | Category | Rate | valid_from |
|---|---|---|---|---|
| TX | STATE | standard | 6.2500 | 2026-07-01 |
| TX / City of Austin | CITY | standard | 1.0000 | 2026-07-01 |
| TX / Austin MTA | DISTRICT | standard | 1.0000 | 2026-07-01 |
| CO | STATE | standard | 2.9000 | 2026-07-01 |
| CA | STATE | standard | 7.2500 | 2026-07-01 |
| DE | STATE | exempt | 0.0000 | 2026-07-01 |

## Fixtures under review (worked examples — expected values must be independently confirmed)
1. us_austin_stack — $2,000 service, Austin ship-to, TX nexus → 125.00 + 20.00 + 20.00 = 165.00 (8.25%)
2. us_ca_no_nexus — CA ship-to, no CA registration → out_of_scope, $0 tax, gross-receipts listed
3. us_de_exempt_state — DE ship-to, DE registration → exempt component row @ 0
4. us_nexus_expired — TX registration ended 2026-06-30, sale 2026-07-15 → out_of_scope

## Questions for the reviewer
1. Are the seeded rates correct for the stated valid_from date?
2. Is out_of_scope (no components) the correct representation for no-nexus sales?
3. Is the exempt-component representation acceptable for no-sales-tax states, or should
   these render as out_of_scope?
4. For data-recovery services specifically: which of the seeded states tax the service
   at all (services vs tangible-property classification)?
5. Any misstatement in the "honest ceiling" language shown to tenants?

## Sign-off (completed by the reviewer)
- Reviewer name / firm:
- Credential (CPA/JD, state):
- Date:
- Verdict per fixture (pass / fail + correction):
- Corrections required before publish:
```

- [ ] **Step 2: Execute the engagement (operator step — blocks this WP, not the codebase)**

Send the packet; iterate on corrections. EVERY correction lands as a fixture/rate-row edit (new `valid_from` rows or fixture value changes) in BOTH residences (repo JSON + `master_country_pack_tests`) plus a re-run of Task 6/18 tests. Record the completed sign-off section in the packet file and commit it.

- [ ] **Step 3: Apply the provenance migration (ONLY after the sign-off section is complete)**

`mcp__supabase__apply_migration` name `phase5_us_salt_signoff`:

```sql
-- Phase 5 / M5-6 — provenance flip on external SALT sign-off (2026-US-SALT-R1).
UPDATE geo_country_tax_rates r
SET data_source = 'salt_validated', source_version = '2026-US-SALT-R1'
FROM geo_countries c
WHERE c.id = r.country_id AND c.code = 'US'
  AND r.data_source = 'draft_pending_salt_review' AND r.deleted_at IS NULL;
```

Assert:

```sql
SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id = r.country_id
WHERE c.code = 'US' AND r.data_source = 'draft_pending_salt_review' AND r.deleted_at IS NULL;
```

Expected: `0`.

- [ ] **Step 4: Manifest row + commit**

```
| <version> | phase5_us_salt_signoff.sql | Additive | US rate provenance → salt_validated (2026-US-SALT-R1 sign-off recorded) | #<PR> |
```

```bash
git add docs/superpowers/reviews/2026-us-salt-review-packet.md supabase/migrations.manifest.md
git commit -m "docs(l10n-p5): US SALT review sign-off recorded; rate provenance flipped"
```

### Task 26: Publish US + UK packs → `statutory_ready`

**Files:**
- No code. Operator steps through the Phase-3 Country Authoring Studio + SQL assertions.
- Modify: `docs/superpowers/reviews/2026-us-salt-review-packet.md` (append the publish record)

**Interfaces:**
- Consumes: `submit_country_pack_for_review(p_pack_version_id)`, `publish_country_pack(p_country_id, p_version)` (Phase 3); Tasks 1–25 all merged and deployed (edge functions included)
- Produces: `geo_countries.config_status = 'statutory_ready'` for US and GB (machine-derived — never hand-asserted); the `statutory-fixtures` CI job now enumerates both countries on every PR

- [ ] **Step 1: Pre-publish verification (all must be green before touching the Studio)**

```bash
npm run typecheck        # 0 errors
npm run test             # all suites green, incl. us_sales_tax/uk fixtures
npx vitest run --config vitest.config.scripts.ts   # edge-function contract tests green
```

And in SQL: Task 24's fixture counts (US 4 / GB 2), Task 25's provenance flip (0 draft rows), Task 2/3 capability rows present.

- [ ] **Step 2: Dual-control publish (platform admin A authors, platform admin B approves)**

In the Country Authoring Studio (Phase 3): admin A opens the US pack v1 draft → **Submit for review** (calls `submit_country_pack_for_review`); admin B reviews and **Publish** (calls `publish_country_pack(us_country_id, 1)`). The RPC runs the four-part machine gate: ① replay the 4 `master_country_pack_tests` fixtures via dry-run `issue_tax_document`; ② capability manifest — `us_sales_tax`/`us_plain_invoice`/`us_jurisdiction_remit` resolve in `master_engine_capabilities` against registered fixture-green plugins; ③ author ≠ approver; ④ rate-coverage/requirement-parse checks. Repeat for GB (gate ② additionally resolves `uk_mtd_9box` + `uk_mtd`).

- [ ] **Step 3: Assert the machine-derived status**

`mcp__supabase__execute_sql`:

```sql
SELECT c.code, c.config_status, v.status AS pack_status, v.approved_by IS NOT NULL AS approved,
       v.authored_by IS DISTINCT FROM v.approved_by AS dual_control
FROM geo_countries c
JOIN master_country_pack_versions v ON v.country_id = c.id AND v.version = 1
WHERE c.code IN ('US','GB') ORDER BY c.code;
```

Expected: both rows `config_status = 'statutory_ready'`, `pack_status = 'published'`, `approved = true`, `dual_control = true`.

- [ ] **Step 4: Post-publish smoke — the walkthrough end-to-end (spec line 1024)**

Provision a US fixture tenant (Austin) via the onboarding wizard; add the TX nexus registration in `/settings/tax-compliance`; create a $2,000 invoice for an Austin customer; verify: dry-run preview shows the three-component stack (125/20/20); issued PDF titles 'Invoice' on Letter with MM/DD dates and NO registration band; `recordPayment` succeeds against the plain invoice; the return screen composes the per-jurisdiction remittance rows. For a CA customer: zero components, no phantom 'VAT 0%'. Record results in the review packet file.

- [ ] **Step 5: Authority-transport reachability smoke — UK filing + ZATCA clearance end-to-end**

The two authority-interactive transports are deployed but not auto-wired (Non-goal), so their capability is proven here by an **explicit invocation** on **disposable fixture tenants** (never the demo tenant). Both run unflagged/uncredentialed and therefore land in the shipped `held` degraded mode — the exact default a real wave-mandated tenant hits before credentials exist. This makes Exit Criteria 2 and 3 actually verified rather than merely "deployed."

Provision a UK fixture tenant and a KSA fixture tenant (onboarding wizard). Then invoke the deployed functions (request shapes are the exact contracts from Task 20 index.ts and Task 23 index.ts):

```bash
# UK — MTD_SANDBOX_ENABLED unset ⇒ artifact sealed, then held (no network attempt)
curl -sS -X POST "$SUPABASE_URL/functions/v1/uk-mtd-file" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{ "tenant_id":"<uk_fixture_tenant>", "vat_return_id":"<gb_vat_return_id>", "vrn":"123456789",
        "period_key":"26A1",
        "composed_return": { "boxes":[
          {"boxCode":"BOX1","boxLabel":"VAT due on sales","amountBase":200,"sequence":1},
          {"boxCode":"BOX2","boxLabel":"VAT due on acquisitions","amountBase":0,"sequence":2},
          {"boxCode":"BOX3","boxLabel":"Total VAT due","amountBase":200,"sequence":3},
          {"boxCode":"BOX4","boxLabel":"VAT reclaimed","amountBase":0,"sequence":4},
          {"boxCode":"BOX5","boxLabel":"Net VAT due","amountBase":200,"sequence":5},
          {"boxCode":"BOX6","boxLabel":"Total sales ex-VAT","amountBase":1000,"sequence":6},
          {"boxCode":"BOX7","boxLabel":"Total purchases ex-VAT","amountBase":0,"sequence":7},
          {"boxCode":"BOX8","boxLabel":"Goods supplied ex-VAT","amountBase":0,"sequence":8},
          {"boxCode":"BOX9","boxLabel":"Acquisitions ex-VAT","amountBase":0,"sequence":9} ], "meta":{} } }'

# ZATCA — ZATCA_CLEARANCE_ENABLED unset ⇒ generate-and-hold; run TWICE to prove the PIH chain
curl -sS -X POST "$SUPABASE_URL/functions/v1/zatca-phase2-clearance" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{ "tenant_id":"<ksa_fixture_tenant>", "document_id":"<ksa_invoice_1>", "xml":"<ubl-1>",
        "payload_hash":"hash1", "invoice_hash":"pih1" }'
curl -sS -X POST "$SUPABASE_URL/functions/v1/zatca-phase2-clearance" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{ "tenant_id":"<ksa_fixture_tenant>", "document_id":"<ksa_invoice_2>", "xml":"<ubl-2>",
        "payload_hash":"hash2", "invoice_hash":"pih2" }'
```

Each `curl` returns `{ "submission_id":"...", "status":"held" }`. Then assert the sealed rows landed and the ZATCA chain is contiguous (second invoice chains to the first):

```sql
SELECT regime_key, status, payload_hash, previous_hash
FROM einvoice_submissions
WHERE tenant_id IN ('<uk_fixture_tenant>','<ksa_fixture_tenant>')
  AND regime_key IN ('uk_mtd','zatca_ph2')
ORDER BY created_at;
```

Expected: one `uk_mtd`/`held` row (sealed before any network attempt); two `zatca_ph2`/`held` rows where the **second row's `previous_hash = 'hash1'`** (the first's `payload_hash`) — the PIH chain forms for `held` rows, the exact defect the Task 21 probe guards. Record the invocation results in the review packet file.

- [ ] **Step 6: Commit + PR**

```bash
git add docs/superpowers/reviews/2026-us-salt-review-packet.md
git commit -m "feat(l10n-p5): US + UK published statutory_ready through the machine gate"
```

Open PR `feat/l10n-p5-publish-gate` (migration template — covers M5-5/M5-6).

---

## Testing Strategy

1. **Golden compliance fixtures (dual-resident):** US (4) + GB (2) fixtures live in `src/lib/regimes/**/fixtures/*.json` AND `master_country_pack_tests`, both replayed by the shared `runPublishGate` runner — repo CI (`statutory-fixtures` job) on every PR, the DB gate on every publish (Tasks 6, 18, 24, 26).
2. **Multi-country document matrix rows (spec lines 980–981):** US — 3-component stack / out-of-scope no-nexus / exempt-state quotes; 'Invoice', Letter, no ceremony, MM/DD invoice; jurisdiction-split reversal (contra rows net in the composer — Task 16 test); per-jurisdiction remittance report. UK — 20/5/0 mixed-rate document; buyer VAT number + reverse-charge notation; contra credit note; MTD 9-box with stagger-group boundaries (Task 17 tests all three groups incl. a year boundary).
3. **Unit/property coverage:** nexus window logic (Task 5), path-scoping + cycle guard (Task 4), provider mapping Σ-invariant + fallback provenance (Task 8), ceremony gate truth table (Task 12), stagger `periodBounds` (Task 17), whole-pound truncation (Task 17), XML determinism + escaping (Task 22), clearance state machine (Task 23), wave mandate incl. `revenue_unknown` honesty (Task 22).
4. **Contract tests pinning edge-function payloads** to the `src/lib/regimes` builders (Tasks 20, 23) run under the separate scripts config `vitest.config.scripts.ts` (`npm run geo:test`) — the acknowledged DRY seam across the no-code-sharing boundary. `npm run test` does not see them.
5. **Security/bypass:** M5-4's RPC grant probe (anon/authenticated get NOTHING); chain-fork probe (two appends under the advisory lock chain correctly); `einvoice_submissions` append-only untouched (no UPDATE path added anywhere in this phase).
6. **Rendering parity:** the Phase-2 preview/print parity suites (`src/lib/pdf/engine/*.test.ts`) pick up `us_plain_invoice` automatically once registered; add a snapshot case in the existing invoice parity suite if the Phase-2 harness enumerates profiles from the registry (it does per Phase-2 exit criteria — verify during Task 11's PR).

## Verification Commands

| Command | Expected |
|---|---|
| `npm run typecheck` | exit 0, zero errors (`scripts/check-tsc.sh` posture) |
| `npm run test` | all suites pass, incl. new `src/lib/regimes/**`, `src/lib/tax/**` tests |
| `npx vitest run --config vitest.config.scripts.ts` | scripts project green (edge-function contract tests + existing country-engine suites) |
| `npm run lint` | 0 errors — incl. `xsuite/no-country-branching-outside-regimes`, `xsuite/no-adhoc-money-allocation` |
| `npm run check:schema-drift` | clean after each types regen |
| `npx vitest run src/lib/regimes/us_sales_tax/ src/lib/regimes/uk_mtd_9box/ src/lib/regimes/zatca_ph2/` | PASS |
| `grep -rn "invoice_type !== 'tax_invoice'" src/lib/` | **zero hits** — both ceremony gates (`issueInvoice` :704-705, `recordPayment` :910-913) delegate to `assert{Issuable,Payable}InvoiceType` |
| `grep -rn "not Proforma Invoices\|Only Tax Invoices are issued" src/lib/` | only `src/lib/tax/documentProfile.ts` (both preserved strings) |
| SQL (Task 26 Step 3) | US + GB `statutory_ready`, packs `published`, dual-control true |
| SQL (Task 21 Step 3) | chain probe: genesis NULL → second row chained; anon/authenticated grants absent |

## Acceptance Criteria

- [ ] US quote/invoice for an Austin ship-to computes STATE 6.25 + CITY 1.00 + DISTRICT 1.00 = 8.25% as three `document_tax_lines` component rows, each traceable via `rule_trace` to its rate row.
- [ ] A ship-to state with no active registration produces `out_of_scope` with ZERO component rows (no phantom 'VAT 0%'); an exempt-category state produces an `exempt` component row preserving classification; an ended registration (`registered_to` past) stops producing tax the next day.
- [ ] Nexus is manageable post-onboarding at `/settings/tax-compliance` — adding CO is one row, no wizard re-run; ending nexus never deletes history.
- [ ] `resolveTaxStrategy('avalara')` and `('taxjar')` return strategies satisfying the SAME `TaxStrategy` interface; provider failure transparently yields the native computation with native provenance in the trace; per-tenant enablement round-trips through `company_settings.metadata.tax_provider`; street-level accuracy is documented as provider-gated in the UI copy.
- [ ] US invoices render 'Invoice' (never 'TAX INVOICE') on Letter paper with no registration band; BOTH `issueInvoice` and `recordPayment` accept plain (non-`tax_invoice`) US invoices under `us_plain_invoice`; GCC/India ceremony behavior is byte-identical to before (both gates + both error strings unchanged for `requiresTaxInvoiceCeremony: true`); `grep -rn "invoice_type !== 'tax_invoice'" src/lib/` returns zero hits.
- [ ] `us_jurisdiction_remit` composes `tax_return_lines` grouped by `jurisdiction_ref` with credit-note contras netted in, and throws `CountryConfigError` on base≠jurisdiction currency.
- [ ] UK mixed-rate 20/5/0 document computes per-line component rows on `simple_vat` (no code change to the plugin); reverse-charge B2B invoices are blocked without buyer VAT number by the in-RPC requirement row and carry the reverse-charge notation.
- [ ] `uk_mtd_9box` produces all 9 boxes (whole-pound 6–9) for all three stagger groups, incl. year-boundary quarters; `uk-mtd-file` seals the artifact BEFORE any network attempt and holds when unflagged/uncredentialed.
- [ ] ZATCA P2: deterministic UBL artifact with PIH; `append_einvoice_submission` chains `previous_hash` per (tenant, regime) under an advisory lock, is EXECUTE-granted to `service_role` only; clearance lifecycle appends rows (`held`/`accepted`/`rejected`/`dead_letter`) — zero UPDATEs on `einvoice_submissions`; wave mandates resolved from regime-config data with honest `revenue_unknown`.
- [ ] US and GB `config_status = 'statutory_ready'`, machine-derived via `publish_country_pack` with dual control; the `statutory-fixtures` CI job enumerates and replays both countries.
- [ ] External SALT sign-off recorded in `docs/superpowers/reviews/2026-us-salt-review-packet.md`; US rate provenance is `salt_validated`; US publish happened only after the flip.
- [ ] All migrations applied via MCP with manifest rows; `database.types.ts` regenerated after M5-4; `npm run typecheck` = 0 throughout.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Phase 1–4 contract names drift from this plan's entry criteria | Entry-criteria STOP rule: reconcile names in one commit before executing; every consumed name is listed verbatim at the top |
| Seeded US rates are statutorily wrong | `data_source = 'draft_pending_salt_review'` until the external SALT gate (Task 25); publish blocked on the provenance flip; corrections are effective-dated rate rows, not edits |
| Native stack oversold as street-level accurate | Honest-ceiling copy in `TaxProviderPanel` + profile docs; capability manifest rows distinguish native vs provider adapters; walkthrough language reused verbatim |
| Provider stub mistaken for a real integration | `createStubProviderTransport` throws `ProviderUnavailableError` on anything un-canned → production behavior is always native-fallback; the stub is documented as THE transport until credentials exist (Non-goal) |
| Ceremony relaxation leaks into ceremony markets | Gate is profile-driven with a fail-safe default (unknown key → ceremony ON, Task 13); truth-table test locks GCC/India behavior + exact error string |
| MTD stagger math off-by-one at year boundaries | Task 17 tests all three groups including the Dec→Feb quarter; pure integer date-string math, no `Date` timezone drift |
| ZATCA chain forks under concurrency | `pg_advisory_xact_lock` per (tenant, regime) inside the ONLY append path; SQL probe asserts genesis→chained behavior; client roles cannot execute the RPC |
| einvoice_submissions status model misread as mutable | Plan-wide invariant: transitions are new rows; the edge functions only INSERT via the RPC; append-only REVOKEs from Phase 1 stay untouched |
| HMRC/ZATCA sandbox unavailability blocks the phase | Artifact-generation-first everywhere: `held` rows and dead-letter modes make authority availability an operations concern, not a release blocker |
| `us_plain_invoice` breaks Oman/India PDF parity | Profiles are registry-resolved per tenant; existing Phase-2 parity suites run on every PR; no shared code paths were edited except the two ceremony gates at invoiceService.ts:704-705 (`issueInvoice`) and :910-913 (`recordPayment`), both behavior-identical for `requiresTaxInvoiceCeremony: true` profiles (same predicate, same error strings) |

## Exit Criteria (roadmap row, made measurable)

1. **US `statutory_ready`** — Task 26 SQL assertion green; the US walkthrough smoke (Task 26 Step 4) passes end-to-end on a fresh Austin tenant.
2. **UK `statutory_ready`** — same assertion; a UK fixture tenant composes a stagger-group-correct 9-box return from `vat_records`; the `uk-mtd-file` transport, **invoked explicitly by the Task 26 Step 5 smoke**, seals the artifact and (unflagged) holds it — a sealed `uk_mtd`/`held` `einvoice_submissions` row is proven. Sandbox filing and automatic "File to HMRC" wiring are deferred (Non-goal); the capability is deployed + reachable + verified, not auto-submitting.
3. **KSA P2 capability live for wave-mandated tenants** — `zatca_ph2` regime row published; `resolveZatcaWaveMandate` drives the tenant flag; `append_einvoice_submission` chains `previous_hash` for `held` rows, verified BOTH by the Task 21 probe (held→held) AND the Task 26 Step 5 two-invoice clearance smoke (second `previous_hash` = first `payload_hash`); the clearance edge function is deployed and reachable; un-credentialed tenants degrade to `held` (generate-and-hold), never silently non-compliant. Automatic issuance-time invocation is deferred (Non-goal).
4. **External SALT review complete** — sign-off section of `2026-us-salt-review-packet.md` filled, provenance `salt_validated`, corrections (if any) landed in both fixture residences.

## Estimated Effort

| Work package | Scope | Engineer-days |
|---|---|---|
| WP-1 | US subdivisions + US/UK pack data migrations | 2 |
| WP-2 | assembler path scoping + `us_sales_tax` + fixtures | 3 |
| WP-3 | provider seam + adapters + enablement UI | 3 |
| WP-4 | `us_plain_invoice` + ceremony relaxation (service + form) | 2 |
| WP-5 | nexus service/UI + `us_jurisdiction_remit` | 3 |
| WP-6 | `uk_mtd_9box` + UK fixtures + `uk_mtd` transport + edge fn | 4 |
| WP-7 | zatca_ph2 regime/RPC + UBL transport + clearance edge fn | 4 |
| WP-8 | pack fixtures + SALT packet + publish + smoke | 2 (+ external reviewer calendar time, typically 1–2 weeks elapsed) |
| **Total** | | **23 engineer-days** (~4.5 weeks single engineer; fits the 4–6-week roadmap window with review/QA overhead; WP-6 and WP-7 are parallelizable to compress to ~3.5 weeks with two engineers) |
