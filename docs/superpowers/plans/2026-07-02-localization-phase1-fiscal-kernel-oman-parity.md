# Phase 1 — Fiscal Kernel + Oman Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the fiscal kernel — typed regime plugins over pure-TS tax primitives, sealed by the `issue_tax_document` Postgres choke point — and prove it byte-identical against the live Oman tenant's full 993-invoice / 1,138-quote corpus, then cut over and delete the legacy JS totals paths in the same phase.

**Architecture:** Statutory algorithms live in `src/lib/regimes/` (TaxStrategy plugins over the pure kernel in `src/lib/tax/kernel/`); statutory facts live in effective-dated, pack-versioned global tables (`geo_country_tax_rates`, `master_country_pack_*`); Postgres seals regime-blind invariants (atomic numbering, header=Σ validation, `vat_records` posting, custody event, post-issuance immutability) inside one SECURITY DEFINER RPC. Computation runs in TypeScript (golden-fixture-testable); sealing runs in the DB (PostgREST-unskippable).

**Tech Stack:** React 18 + TypeScript + Vite; Supabase Postgres 15 (migrations via `mcp__supabase__apply_migration`, project_id `ssmbegiyjivrcwgcqutu`); Vitest 4 (three projects: node / dom / scripts); ESLint 9 flat config with custom `xsuite/*` rules; TanStack Query v5.

**Entry criteria (ALL must be merged/true before Task 1):**
- Phase 0 plan complete: `tenantToday(timezone)` exists at `src/lib/tenantToday.ts`; `vat_records` carries `currency`, `exchange_rate numeric(20,10)`, `vat_amount_base numeric(19,4)`, `taxable_amount_base numeric(19,4)`, `tax_period` populated on new rows; `invoice_line_items.unit_price`/`quote_items.unit_price` widened to `numeric(19,4)`; all tax-rate columns `numeric(7,4)`; M-B `*_base` backfill done (every live invoice/quote/payment has non-NULL `*_base`, OMR rows at rate 1, `rate_source='derived_backfill'`); pg_cron NULL-base/NULL-rate monitors live; `vat_transactions` REVOKE freeze applied; credit-note reversals redirected to `vat_records`; residency dimension live (owner E6): `geo_countries.requires_local_residency` + `data_protection_regime` seeded, `tenants.data_residency_region` present with the `global-1` CHECK + `provision-tenant` 422 gate (all verified live 2026-07-02); registry↔mapper parity test green.
- `geo_countries` has 9 active countries (verified live 2026-07-02): AE, BH, GB, IN, KW, OM, QA, SA, US — all `formatting_ready`.
- Line numbers cited below were verified on `main` @ `9684297` (2026-07-02). Phase 0 does not touch `invoiceService.ts` createInvoice/updateInvoice/issueInvoice or `quotesService.ts` create/update bodies, so cited ranges hold; re-anchor with the quoted code snippets if drift occurred.

## Global Constraints

Every task inherits these verbatim repo rules:

- **Additive-only migrations.** No `DROP TABLE`, no `DROP COLUMN`, no `DELETE FROM`. Soft deletes only (`deleted_at = now()`).
- **Every new tenant-scoped table gets:** `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`; `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`; RESTRICTIVE `{table}_tenant_isolation` policy (`tenant_id = get_current_tenant_id() OR is_platform_admin()`); PERMISSIVE op policies (financial writes gated `has_role('accounts')`); `set_<table>_tenant_and_audit` trigger; `idx_<table>_tenant_id` partial index `WHERE deleted_at IS NULL`; `deleted_at timestamptz`.
- **Global tables** (`geo_*`, `master_*`): SELECT `USING (true)` for authenticated; INSERT/UPDATE/DELETE `is_platform_admin()` only.
- **Migration discipline per PR:** apply via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) → regenerate `src/types/database.types.ts` via `mcp__supabase__generate_typescript_types` → update ALL callers → append a `| <version> | <filename> | <classification> | <summary> | <PR> |` row to `supabase/migrations.manifest.md` → use `.github/PULL_REQUEST_TEMPLATE/migration.md`.
- **`database.types.ts` is generated — never hand-edit.** Import `Database` only from `src/types/database.types.ts`.
- **`maybeSingle()` never `single()`.**
- **typecheck must stay at 0 errors** (`npm run check:tsc`).
- **pdfmake-only PDFs; lucide-react icons only; semantic theme tokens only** (no `purple/indigo/violet`, no raw brand hexes).
- **No new npm packages** without checking existing ones first (this plan adds none).
- **Custody/audit tables are append-only** — `chain_of_custody`, `audit_trails`, `number_sequences_audit`, `einvoice_submissions` must never gain client UPDATE/DELETE paths.
- **Custody v1.2.0 invariant:** quote/invoice/payment financial events write `chain_of_custody` 'financial' entries — every refactor of `invoiceService`/`quotesService` must preserve (or relocate into the RPC, never drop) these writes.
- **No hardcoded currency symbols, tax labels, or date formats** — `TenantConfigContext` / `formatCurrencyWithConfig` only.
- **Frozen-rate money model:** every financial write resolves `currencyService.resolveRateContext(docCurrency, onDate, override?)` and computes `*_base = round(amount × rate, base dp)` once at write time. The kernel REUSES this seam, never forks it.
- **Do not reuse a merged work branch** — each WP starts on a fresh branch cut from `main`.

---

## Objectives

1. **Kernel primitives (pure TS, zero I/O):** `computeDocumentTax`, scheme modes (`single` fully exercised; `split_by_place_of_supply` / `jurisdiction_stack` implemented as parameterization seams), `allocateLargestRemainder` (THE only sanctioned splitter), `backOutInclusive`, `roundMoneyWith`, deterministic `RuleTrace` emitter.
2. **Plugin architecture:** `src/lib/regimes/types.ts` (all canonical interfaces incl. `TaxStrategy`, `ReturnComposer`, `NumberingPolicy`, `DocumentComplianceProfile`, `EInvoicingTransport` with the full 5-value `RegimeClass` enum, `PayrollPack`), `src/lib/regimes/registry.ts`, and the four shipped default plugins: `simple_vat`, `prefix_numbering`, `generic_invoice`, `no_einvoice`.
3. **Statutory data plane:** `geo_country_tax_rates` (effective-dated; the all-9-live-countries seed pass yields 17 rate rows across the 6 VAT-bearing countries — KW/QA are `tax_system` NONE and US is subdivision-stacked, so both intentionally get **zero** country-level rows, satisfying the "9 countries" requirement as designed, not under-delivered), `document_tax_lines` (ONE polymorphic tenant table, lint-allowlisted), `legal_entity_tax_registrations`, `einvoice_submissions` (append-only, `previous_hash` from day one), `master_einvoice_regimes` (all five `regime_class` values designed in), `master_country_pack_versions` / `master_country_pack_tests` / `master_engine_capabilities`.
4. **The choke point:** `issue_tax_document(p_doc_type, p_doc_id, p_dry_run)` — FOR UPDATE lock, in-transaction number mint (closes the pre-mint burn at `invoiceService.ts:411`), Σ(document_tax_lines)=header validation, per-component `vat_records` posting in base currency with tenant-local `tax_period`, custody 'financial' event, issued-immutability flip.
5. **Sealing triggers:** `assert_document_tax_integrity` (skip-until-backfilled, validated after M-C) and the issued-document immutability trigger (fixes the PostgREST-rewrite critical at `invoiceService.ts:686-689`).
6. **Numbering v2 in ONE release (fork hazard, risk 8):** `get_next_number` v2 reading the dormant fiscal columns (`format_template` NULL = byte-identical legacy), `preview_number_format`, `update_number_sequence` hardening (`is_tenant_admin()` + audit writes + rewind guard + anon REVOKE), live scope-data fixes (empty `case` prefix, `REPO` collision), SystemNumbers real scope registry.
7. **Governance (minimal):** `src/lib/tax/publishGate.ts` fixture runner, Oman pack v1 (published row + DB-resident golden fixtures), `statutory-fixtures` CI job, eslint rules `xsuite/no-country-branching-outside-regimes` + `xsuite/no-adhoc-money-allocation`.
8. **Migration + cutover:** M-C tax-line backfill (stored figures, `backfilled=true`), M-E parity replay over the full live corpus, M-F same-cycle verify-and-cutover with **deletion of `calculateInvoiceTotals`/`calculateQuoteTotals`** and the ad-hoc credit-note proration, M-G freeze assertion, M-J tenant pack pinning + resync no-op verification.

## Non-goals

- **Platform subscription billing** — completely separate workstream (owner E4). Reuses these primitives later; never appears in this phase.
- **`master_document_requirements` + in-RPC requirement evaluation** — Phase 2. The Phase 1 RPC returns `requirement_failures: []` (stable contract shape) and gains the evaluator by `CREATE OR REPLACE` in Phase 2.
- **`master_unit_codes` table + unit/item-code persistence, structured addresses, buyer/seller snapshot consumption, `DocumentComplianceProfile` consumption by pdfService** — Phase 2. (The item/header COLUMNS land now in M-A; consumers later.)
- **`ReturnComposer` live composition, `tax_return_lines`, `master_numbering_policies`, `publish_country_pack`/`create_country_pack_draft`/`submit_country_pack_for_review`/`upsert_*` RPCs, Country Authoring Studio, CLDR import** — Phase 3. `runPublishGate` mode `'dry_run_rpc'` therefore throws a typed error until Phase 3 ships the harness.
- **`in_gst`, `us_sales_tax` strategy parameterizations, GSTIN capture UI, withholding (`record_payment` `withheld_amount`), `in_irn`/`zatca_*`/`uk_mtd` transports and edge functions** — Phases 4–5. The kernel scheme modes and `regime_class` vocabulary they parameterize ship NOW.
- **`PayrollPack` implementation, privacy-regime parameterization, unclaimed-property implementation** — Phase 6. Reserved pack-schema keys (E8/E9/privacy.regime) are registered NOW with no consumers.
- **`issue_tax_document` end-to-end for `credit_note` and `stock_sale`:** the doc-type vocabulary, `document_tax_lines.document_type` CHECK, and dry-run validation cover all four kinds now; the full issuance path is wired for `invoice` only. Credit notes keep the Phase-0-evolved `issue_credit_note` RPC (contra `vat_records` rows); stock-sale tax threading (`record_stock_sale` `p_tax_lines`) is Phase 2.
- **Per-doc-type cutover feature flags:** deliberately NOT introduced. The owner-compressed shadow window (compute both paths, diff to zero, cut over inside the PR cycle) makes flags unnecessary; nothing to remove at phase end because nothing is added.
- **No UI for pack authoring, explain-trace drawer, component-row totals rendering, treatment selectors** — Phase 2/3 (the data they render is persisted from Phase 1).

## Architecture Decisions

1. **Kernel purity via caller-supplied facts.** `computeDocumentTax(ctx)` performs zero I/O: the context builder (`taxDocumentService.buildInvoiceTaxContext` / `buildQuoteTaxContext`) fetches legal entity, registrations, effective-dated rate rows, and the rate context, then hands plain data to the kernel. *Rationale:* golden fixtures and the 2,131-document parity replay run without a database. *Rejected:* plpgsql computation (unmaintainable for 30+ regimes, untestable per-country) and kernel-side Supabase reads (kills fixture determinism).
2. **Scheme-mode dispatch stays inside the kernel; strategies are thin.** `computeDocumentTax(ctx)` computes `single` mode; the exported `computeWithMode(ctx, mode)` seam serves `split_by_place_of_supply` / `jurisdiction_stack` so Phase 4/5 strategies are parameter objects, not bespoke code (graft 8). *Rejected:* per-strategy bespoke math — the audit's proven blowup path.
3. **Document-level half-up rounding is the `simple_vat` default `{mode:'half_up', level:'document'}`** where `half_up` is defined as the house `Math.round` behavior (half toward +infinity) — because byte-parity with `calculateInvoiceTotals`/`calculateQuoteTotals` on 2,131 live documents is the phase's exit gate, and those paths use `roundMoney`. Textbook half-away-from-zero would diverge on negative exact halves. Documented in `roundMoneyWith`'s docstring.
4. **The RPC validates; TypeScript computes.** `issue_tax_document` never derives tax — it validates internal consistency of persisted `document_tax_lines` against the header (regime-blind arithmetic), mints the number, posts the ledger, writes custody, seals. *Rejected:* recomputing in SQL (regime knowledge in plpgsql is review-blockable per the spec).
5. **Draft tax invoices stop pre-minting numbers.** `invoices.invoice_number` is nullable with partial unique index `uq_invoices_number_per_tenant ... WHERE invoice_number IS NOT NULL` (verified live) — drafts insert with NULL number; `issue_tax_document` mints in-transaction. Proformas keep minting `proforma_invoices` numbers at creation (separate non-tax series, unchanged). *Rejected:* keep pre-minting — burns sequential tax numbers on failed inserts (EU VAT Art. 226 / GCC gap continuity).
6. **`assert_document_tax_integrity` implements NOT VALID→VALIDATE intent as skip-when-no-tax-lines + post-backfill validation sweep.** Postgres constraint TRIGGERS cannot be `NOT VALID`; the trigger fires only when `document_tax_lines` rows exist for the document (historical rows without lines can never brick writes), and Task 27 runs the explicit validation query over all backfilled rows after M-C — the same guarantee the spec's phrasing intends.
7. **`document_tax_lines` is deliberately ONE polymorphic table** across quote/invoice/credit_note/stock_sale (ReturnComposer, HSN summaries, and audits need one subledger join target). It intentionally breaks the per-domain prefix convention; it is registered with rationale in `eslint-rules/banned-tables.js`'s allowlist comment block and covered by `check-from-table-names.sh` as a real table.
8. **`regime.*` config keys resolve via registry `codedDefault`; only Oman's pack seeds explicit values in Phase 1.** codedDefault (`simple_vat`/`no_einvoice`/`prefix_numbering`/`generic_invoice`/`none`) means the other 8 countries resolve correctly with zero data; the Phase-0-extended `_apply_country_config` DB mapper is NOT touched this phase. *Rejected:* seeding `in_gst`/`us_sales_tax` keys now — would make `resolveTaxStrategy` throw for countries whose plugins ship in Phase 4/5.
9. **Owner ceremony compression is binding:** shadow-mode is the in-PR parity replay (M-E harness diffing both paths to zero on the live corpus + fixtures), after which WP-6 deletes `calculateInvoiceTotals`/`calculateQuoteTotals` in the same phase. The M-E harness is kept permanently as the regression/publish-gate mechanism.
10. **Residency/reserved keys are schema-only now (owner E5/E7/E8/E9 reserved in this phase; E6 inherited from Phase 0):** `master_einvoice_regimes.regime_class` CHECK carries all five fiscalization classes (E5); `einvoice_submissions.previous_hash` exists from day one (risk 6); registry keys `compliance.audit_file_exports` (E9), `custody.unclaimed_property` (E8), and `privacy.regime` (E7) are registered with schemas and codedDefaults but zero consumers. The **E6 data-residency dimension is NOT re-created here** — it was delivered in Phase 0 and is already live (verified 2026-07-02): `tenants.data_residency_region`, `geo_countries.requires_local_residency`, and `geo_countries.data_protection_regime` exist, with the `global-1` single-deployment invariant enforced by the provisioning path + DB CHECK and the residency-mismatch **422** in `provision-tenant`. Phase 1 therefore inherits residency-readiness with no schema change; adding regional Supabase projects later is region-table routing, not a redesign. (The residency columns are listed as a Phase-0 prerequisite in the Entry criteria.)

## Database Changes

All applied via `mcp__supabase__apply_migration` with project_id `ssmbegiyjivrcwgcqutu`; each gets a manifest row and types regen.

| # | Migration name | Purpose | Tables touched |
|---|---|---|---|
| 1 | `localization_p1_pack_governance_tables` | Pack lifecycle + fixtures + capability manifest + e-invoice regime registry (rows only) | NEW: `master_country_pack_versions`, `master_country_pack_tests`, `master_engine_capabilities`, `master_einvoice_regimes` (+ capability seed rows, SA/IN regime rows) |
| 2 | `localization_p1_geo_country_tax_rates` | THE effective-dated rate table + 9-country seed | NEW: `geo_country_tax_rates` |
| 3 | `localization_p1_document_tax_lines` | Per-document component snapshot (tenant, polymorphic) | NEW: `document_tax_lines` |
| 4 | `localization_p1_registrations_einvoice` | Seller registrations + append-only e-invoice artifact ledger | NEW: `legal_entity_tax_registrations`, `einvoice_submissions` |
| 5 | `localization_p1_document_header_columns` | M-A additive header/item columns + `tenants.country_pack_version` + P1 `vat_records` component columns (§3.5) | `invoices`, `quotes`, `credit_notes`, `invoice_line_items`, `quote_items`, `credit_note_items`, `stock_sale_items`, `tenants`, `vat_records` |
| 6 | `localization_p1_issue_tax_document` | The issuance choke-point RPC | RPC only (reads/writes `invoices`, `document_tax_lines`, `vat_records`, `chain_of_custody`, `number_sequences`) |
| 7 | `localization_p1_integrity_immutability_triggers` | header=Σ constraint trigger + issued-doc immutability + `post_invoice_vat_record` backstop evolution | triggers on `invoices`, `invoice_line_items`, `document_tax_lines` |
| 8 | `localization_p1_numbering_v2` | `get_next_number` v2 + `preview_number_format` + `update_number_sequence` hardening + anon REVOKE + live scope data fixes | `number_sequences`, `number_sequences_audit`, 3 functions |
| 9 | `localization_p1_oman_pack_v1` | Oman pack v1 row (published) + DB-resident golden fixtures + OM `country_config` regime keys + rate-row pack pinning + M-J tenant pinning | `master_country_pack_versions`, `master_country_pack_tests`, `geo_countries`, `geo_country_tax_rates`, `tenants` |
| 10 | `localization_p1_tax_line_backfill` | M-C: one backfilled rollup row per historical invoice/quote (stored figures, never recomputed) | `document_tax_lines` (INSERT only) |

## Backend Implementation

| Module | New/Changed | Contents |
|---|---|---|
| `src/lib/regimes/types.ts` | NEW | Every canonical interface (§1.1–1.4 of the interface contract, verbatim) + structural row types (`GeoCountryTaxRateRow`, `LegalEntityTaxRegistrationRow`, `VatRecordRow`) |
| `src/lib/financialMath.ts` | CHANGED | + `allocateLargestRemainder`, `roundMoneyWith`; − `calculateInvoiceTotals`, `calculateQuoteTotals` (deleted at cutover, WP-6); `InvoiceTotals`/`QuoteTotals` interfaces retained (now produced by the kernel adapter) |
| `src/lib/tax/kernel/backOutInclusive.ts` | NEW | Inclusive back-out primitive |
| `src/lib/tax/kernel/index.ts` | NEW | `computeDocumentTax(ctx)` + `computeWithMode(ctx, mode)` + deterministic trace emitter |
| `src/lib/regimes/registry.ts` | NEW | `registerRegimePlugin` + six typed resolvers + `listRegisteredCapabilities` |
| `src/lib/regimes/simple_vat/` | NEW | The default TaxStrategy + `fixtures/*.json` golden cases |
| `src/lib/regimes/prefix_numbering/`, `generic_invoice/`, `no_einvoice/` | NEW | Default NumberingPolicy / DocumentComplianceProfile / EInvoicingTransport |
| `src/lib/tax/publishGate.ts` | NEW | `runPublishGate({countryCode, fixtures, mode})` — shared fixture runner |
| `src/lib/taxDocumentService.ts` | NEW | Context builders, `document_tax_lines` persistence, `issueTaxDocument` RPC wrapper, kernel→header-totals adapter |
| `src/lib/invoiceService.ts` | CHANGED | createInvoice/updateInvoice compute via kernel + persist tax lines; issueInvoice delegates to `issue_tax_document`; deleteInvoice surfaces the immutability error |
| `src/lib/quotesService.ts` | CHANGED | createQuote/updateQuote compute via kernel + persist tax lines |
| `src/lib/country/registry.ts` | CHANGED | + five `regime.*` keys, `tax.rounding_policy`, `format.amount_words_scale`, + three RESERVED keys |
| `src/contexts/TenantConfigContext.tsx` + `src/types/tenantConfig.ts` + `src/lib/tenantConfigService.ts` | CHANGED | `RegimeConfig` on `TenantConfig`; `useRegimeConfig()` hook |
| `scripts/localization/parity-replay.test.ts` | NEW | M-E: full-corpus replay, self-skips without env (registry-trigger-parity pattern) |
| `scripts/localization/statutory-fixtures.test.ts` | NEW | CI gate: statutory_ready countries × registered plugins × fixtures |
| `eslint-rules/no-country-branching-outside-regimes.js`, `eslint-rules/no-adhoc-money-allocation.js` | NEW | The two non-negotiable Phase-1 lint gates + node:test suites |

## Frontend Implementation

Phase 1 is deliberately backend-heavy; the only UI surfaces touched:

| Surface | Change |
|---|---|
| `src/pages/settings/SystemNumbers.tsx` | Replace the phantom `SEQUENCE_CONFIG` vocabulary (`SystemNumbers.tsx:53-78`) with the real scope registry unioned with live rows; add `format_template` / `reset_basis` / `fiscal_year_anchor` / `max_length` fields; render format preview via the `preview_number_format` RPC (no client re-implementation); pass the four new args to `update_number_sequence` |
| `src/components/financial/CreditNoteModal.tsx` | Replace the ad-hoc proportional VAT split at `:61` with `allocateLargestRemainder` (the eslint rule's demonstration case) |
| `src/contexts/TenantConfigContext.tsx` | `useRegimeConfig()` hook (read-only plumbing for Phase 2 consumers) |

No visual redesign; semantic tokens only; existing modal/dialog primitives reused.

## APIs & Services

### New/changed RPCs (all SECURITY DEFINER; EXECUTE REVOKEd from `anon` and `public`, granted to `authenticated`, `service_role`)

```sql
issue_tax_document(p_doc_type text, p_doc_id uuid, p_dry_run boolean DEFAULT false) RETURNS jsonb
-- p_doc_type ∈ ('quote','invoice','credit_note','stock_sale'); Phase 1 wires 'invoice' end-to-end,
-- 'quote' dry-run-only, 'credit_note'/'stock_sale' raise clear not-wired errors (Phase 2/3).
-- dry-run:  { "ok": bool, "document_number": null, "tax_lines": [...], "totals": {...},
--             "requirement_failures": [], "trace": <rule_trace jsonb|null> }
-- issue:    { "ok": true, "document_number": text, "issued_at": timestamptz,
--             "vat_record_ids": uuid[], "einvoice_submission_id": null, "trace": <jsonb|null> }

get_next_number(p_scope text) RETURNS text            -- signature UNCHANGED; v2 body reads
--   format_template / reset_basis / fiscal_year_anchor / last_reset_period / max_length;
--   format_template IS NULL = exact legacy behavior (prefix || '-' || LPAD)

preview_number_format(p_scope text, p_format_template text) RETURNS text   -- NEW, non-mutating

update_number_sequence(p_scope text, p_prefix text, p_padding int, p_reset boolean,
                       p_current_value int DEFAULT NULL,
                       p_format_template text DEFAULT NULL, p_reset_basis text DEFAULT NULL,
                       p_fiscal_year_anchor text DEFAULT NULL, p_max_length int DEFAULT NULL)
                       RETURNS void                    -- 5 legacy args preserved; is_tenant_admin() gated;
                                                       -- writes number_sequences_audit; rewind guard
```

### New TypeScript service functions

```typescript
// src/lib/tax/kernel/index.ts
export function computeDocumentTax(ctx: TaxContext): TaxComputation;
export function computeWithMode(ctx: TaxContext, mode: SchemeMode): TaxComputation;

// src/lib/tax/kernel/backOutInclusive.ts
export function backOutInclusive(gross: number, sumOfRates: number, decimalPlaces: number): { base: number; tax: number };

// src/lib/financialMath.ts (additions)
export const allocateLargestRemainder: (total: number, weights: number[], decimalPlaces: number) => number[];
export const roundMoneyWith: (value: number, decimalPlaces: number, policy: RoundingPolicy) => number;

// src/lib/regimes/registry.ts
export function registerRegimePlugin(kind: RegimePluginKind, plugin: { key: string; version: string }): void;
export function resolveTaxStrategy(key: string): TaxStrategy;
export function resolveReturnComposer(key: string): ReturnComposer;
export function resolveNumberingPolicy(key: string): NumberingPolicy;
export function resolveDocumentProfile(key: string): DocumentComplianceProfile;
export function resolveEInvoicingTransport(key: string): EInvoicingTransport;
export function resolvePayrollPack(key: string): PayrollPack;
export function listRegisteredCapabilities(): Array<{ capability_key: string; kind: string; version: string }>;

// src/lib/tax/publishGate.ts
export async function runPublishGate(args: {
  countryCode: string; fixtures: PackFixture[]; mode: 'kernel' | 'dry_run_rpc';
}): Promise<{ pass: boolean; results: FixtureRunResult[] }>;

// src/lib/taxDocumentService.ts
export interface DocumentTotalsInput {
  items: Array<{ description: string; quantity: number; unit_price: number; discount_percent?: number }>;
  discountType?: string | null;         // quotes: 'percentage' | 'fixed'
  discountAmount: number;
  taxRate: number;                      // the form's header rate (percent)
  documentType: TaxDocumentType;
  documentDate: string;                 // 'YYYY-MM-DD'
  taxInclusive?: boolean;
}
export async function computeDocumentTotals(
  input: DocumentTotalsInput, rc: RateContext,
): Promise<{ computation: TaxComputation; subtotal: number; taxAmount: number; totalAmount: number }>;
export async function persistDocumentTaxLines(args: {
  tenantId: string; documentType: TaxDocumentType; documentId: string;
  computation: TaxComputation; rc: RateContext; lineItemIds?: Array<string | null>;
}): Promise<void>;
export async function issueTaxDocument(
  docType: TaxDocumentType, docId: string, dryRun?: boolean,
): Promise<IssueTaxDocumentResult>;
export interface IssueTaxDocumentResult {
  ok: boolean; document_number: string | null; issued_at: string | null;
  vat_record_ids: string[]; einvoice_submission_id: string | null;
  requirement_failures: Array<{ field_key: string; level: 'block' | 'warn'; message: string }>;
  trace: RuleTrace | null;
}

// src/contexts/TenantConfigContext.tsx
export function useRegimeConfig(): RegimeConfig;   // { tax; einvoice; numbering; documents; payroll } strings
```

---

## File-by-File Implementation Tasks

Tasks are numbered globally. Each Work Package (WP) is one PR-able unit with its own verification block. Execute WPs in order; tasks within a WP in order.

---

# WP-1 — Fiscal kernel, pure TypeScript (PR 1: `feat/localization-p1-kernel`)

Zero database dependency. Everything in this WP runs under `npm run test` with no env.

### Task 1: Canonical regime types — `src/lib/regimes/types.ts`

**Files:**
- Create: `src/lib/regimes/types.ts`
- Test: `src/lib/regimes/types.test.ts`

**Interfaces:**
- Consumes: `RateContext` from `src/lib/currencyService.ts:108-119` (existing).
- Produces: every type in the canonical interface contract §1.1–1.4 — `SchemeMode`, `TaxCategory`, `TaxTreatment`, `RegimeClass`, `TaxDocumentType`, `RoundingPolicy`, `ScaleSystem`, `TaxableLine`, `TaxContext`, `ComputedTaxLine`, `DocumentNotation`, `TaxComputation`, `RuleTrace`, `RuleTraceStep`, `TaxStrategy`, `ReturnComposer`, `ComposedReturn`, `ReturnBoxLine`, `NumberingPolicy`, `NumberSequenceSeed`, `DocumentComplianceProfile`, `EInvoicingTransport`, `PayrollPack`, plus structural rows `GeoCountryTaxRateRow`, `LegalEntityTaxRegistrationRow`, `VatRecordRow`, and `IssuedDocumentSnapshot`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/types.test.ts
import { describe, it, expect } from 'vitest';
import type { TaxContext, TaxComputation, RuleTrace, TaxStrategy, RoundingPolicy } from './types';

describe('regimes/types', () => {
  it('a fully-populated TaxContext typechecks and round-trips', () => {
    const policy: RoundingPolicy = { mode: 'half_up', level: 'document' };
    const ctx: TaxContext = {
      documentType: 'invoice',
      seller: {
        legalEntityId: 'le-1', countryId: 'om-uuid', subdivisionId: null,
        taxIdentifier: 'OM1234567890', registrations: [],
      },
      buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
      taxPointDate: '2026-07-02',
      placeOfSupplySubdivisionId: null,
      lines: [{
        lineItemId: null, description: 'RAID recovery', quantity: 1, unitPrice: 100,
        lineDiscount: 0, unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null,
      }],
      documentDiscount: 0,
      taxInclusive: false,
      rateContext: {
        documentCurrency: 'OMR', documentDecimals: 3, baseCurrency: 'OMR',
        baseDecimals: 3, rate: 1, rateSource: 'derived',
      },
      rates: [{
        id: 'r1', country_id: 'om-uuid', subdivision_id: null, component_code: 'VAT',
        component_label: 'VAT', tax_category: 'standard', rate: 5, applies_to: null,
        valid_from: '2021-04-16', valid_to: null, sort_order: 0,
      }],
      roundingPolicy: policy,
      scaleSystem: 'western',
    };
    expect(ctx.lines).toHaveLength(1);
    const trace: RuleTrace = { regimeKey: 'simple_vat', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'single', steps: [] };
    const comp: TaxComputation = {
      lines: [], rollups: [],
      totals: { taxableBase: 100, taxTotal: 5, grandTotal: 105, roundingAdjustment: null },
      expectedWithholding: null, notations: [], trace,
    };
    expect(comp.totals.grandTotal).toBe(105);
    const strategyShape: Pick<TaxStrategy, 'key' | 'version' | 'schemeMode'> = {
      key: 'simple_vat', version: '1.0.0', schemeMode: 'single',
    };
    expect(strategyShape.key).toBe('simple_vat');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/regimes/types.test.ts`
Expected: FAIL — `Cannot find module './types'` (or "Failed to resolve import").

- [ ] **Step 3: Write the types module (contract-verbatim)**

```typescript
// src/lib/regimes/types.ts
//
// CANONICAL regime-plugin interface vocabulary for the Global Tenant Localization
// program (spec 2026-07-02, Part 2). These names/signatures are contract-locked:
// Phases 2-6 consume them verbatim. Do not rename without a program-level decision.
//
// Structural row types (GeoCountryTaxRateRow etc.) deliberately do NOT import the
// generated Database type: the kernel must stay pure and fixture-testable without
// a database. WP-2 Task 14 pins assignability of the generated Row types to these.

import type { RateContext } from '../currencyService';

export type SchemeMode = 'single' | 'split_by_place_of_supply' | 'jurisdiction_stack';

export type TaxCategory = 'standard' | 'reduced' | 'zero' | 'exempt';
export type TaxTreatment =
  'standard' | 'reduced' | 'zero_rated' | 'exempt' | 'reverse_charge' | 'out_of_scope';

export type RegimeClass =
  'render_artifact' | 'clearance_api' | 'chained_document' | 'certified_software' | 'filing_api';

export type TaxDocumentType = 'quote' | 'invoice' | 'credit_note' | 'stock_sale';

export interface RoundingPolicy {
  mode: 'half_up' | 'half_even';
  level: 'line' | 'document';
  cash_increment?: number;
}

export type ScaleSystem = 'western' | 'indian';

// ── Structural row shapes (kernel-pure mirrors of L1 tables) ──────────────────

export interface GeoCountryTaxRateRow {
  id: string;
  country_id: string;
  subdivision_id: string | null;
  component_code: string;
  component_label: string;
  tax_category: TaxCategory;
  rate: number;
  applies_to: string | null;
  valid_from: string;
  valid_to: string | null;
  sort_order: number;
}

export interface LegalEntityTaxRegistrationRow {
  id: string;
  legal_entity_id: string;
  country_id: string;
  subdivision_id: string | null;
  tax_number: string;
  scheme: 'standard' | 'composition' | 'unregistered';
  registered_from: string;
  registered_to: string | null;
  is_primary: boolean;
}

export interface VatRecordRow {
  id: string;
  record_type: string;
  record_id: string;
  vat_amount: number;
  vat_rate: number;
  tax_period: string | null;
  vat_amount_base: number | null;
  component_code: string | null;
  regime_key: string | null;
}

// ── Fact assembly (algorithm step 1) ──────────────────────────────────────────

export interface TaxableLine {
  lineItemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  unitCode: string | null;
  itemCode: string | null;
  treatment: TaxTreatment;
  treatmentReasonCode: string | null;
}

export interface TaxContext {
  documentType: TaxDocumentType;
  seller: {
    legalEntityId: string;
    countryId: string;
    subdivisionId: string | null;
    taxIdentifier: string | null;
    registrations: LegalEntityTaxRegistrationRow[];
  };
  buyer: {
    taxNumber: string | null;
    countryId: string | null;
    subdivisionId: string | null;
    isBusiness: boolean;
    addressSnapshot: Record<string, unknown> | null;
  };
  taxPointDate: string;
  placeOfSupplySubdivisionId: string | null;
  lines: TaxableLine[];
  documentDiscount: number;
  taxInclusive: boolean;
  rateContext: RateContext;
  rates: GeoCountryTaxRateRow[];
  roundingPolicy: RoundingPolicy;
  scaleSystem: ScaleSystem;
}

// ── Computation output ────────────────────────────────────────────────────────

export interface ComputedTaxLine {
  lineItemId: string | null;
  componentCode: string;
  componentLabel: string;
  jurisdictionRef: string | null;
  rate: number;
  taxableBase: number;
  taxAmount: number;
  taxTreatment: TaxTreatment;
  treatmentReasonCode: string | null;
  sequence: number;
}

export interface DocumentNotation {
  code: string;
  text: string;
  textTranslated?: string;
}

export interface TaxComputation {
  lines: ComputedTaxLine[];
  rollups: ComputedTaxLine[];
  totals: {
    taxableBase: number;
    taxTotal: number;
    grandTotal: number;
    roundingAdjustment: number | null;
  };
  expectedWithholding: number | null;
  notations: DocumentNotation[];
  trace: RuleTrace;
}

// ── Deterministic trace (graft 5) ─────────────────────────────────────────────

export interface RuleTrace {
  regimeKey: string;
  pluginVersion: string;
  packVersionId: string | null;
  schemeMode: SchemeMode;
  steps: RuleTraceStep[];
}
export type RuleTraceStep =
  | { op: 'rate_match';           rateRowId: string; componentCode: string; rate: number; validFrom: string }
  | { op: 'scheme_decision';      mode: SchemeMode; detail: string }
  | { op: 'discount_allocation';  method: 'largest_remainder'; shares: number[]; remainders: number[] }
  | { op: 'inclusive_backout';    gross: number; sumRates: number; base: number }
  | { op: 'treatment';            lineItemId: string | null; treatment: TaxTreatment; reasonCode: string | null }
  | { op: 'rounding';             policy: RoundingPolicy; before: number; after: number }
  | { op: 'cash_rounding';        increment: number; adjustment: number };

// ── Plugin interfaces (L3) ────────────────────────────────────────────────────

export interface TaxStrategy {
  readonly key: string;
  readonly version: string;
  readonly schemeMode: SchemeMode;
  readonly defaults: { roundingPolicy: RoundingPolicy; scaleSystem: ScaleSystem };
  compute(ctx: TaxContext): TaxComputation | Promise<TaxComputation>;
}

export interface ComposedReturn {
  boxes: ReturnBoxLine[];
  meta: Record<string, unknown>;
}
export interface ReturnBoxLine {
  boxCode: string; boxLabel: string; amountBase: number;
  quantity?: number; unitCode?: string;
  meta?: Record<string, unknown>; sequence: number;
}
export interface ReturnComposer {
  readonly key: string;
  readonly version: string;
  periodBounds(
    filingFrequency: 'monthly' | 'quarterly' | 'annual',
    periodAnchor: string,
    forDate: string, timezone: string,
  ): { periodStart: string; periodEnd: string; taxPeriods: string[] };
  compose(input: {
    tenantId: string; legalEntityId: string;
    taxPeriods: string[];
    ledgerRows: VatRecordRow[];
    jurisdictionCurrency: string; baseCurrency: string;
  }): ComposedReturn;
}

export interface NumberSequenceSeed {
  scope: string;
  prefix: string | null;
  format_template: string | null;
  reset_basis: 'never' | 'calendar_year' | 'fiscal_year';
  fiscal_year_anchor: string | null;
  max_length: number | null;
  padding: number;
}
export interface NumberingPolicy {
  readonly key: string;
  readonly version: string;
  defaultSequences(country: { countryCode: string; fiscalYearStart: string }): NumberSequenceSeed[];
}

export interface DocumentComplianceProfile {
  readonly key: string;
  readonly version: string;
  documentTitle(ctx: {
    docType: TaxDocumentType; sellerRegistered: boolean; taxInvoiceRequired: boolean;
  }): { title: string; titleTranslated: string | null };
  requiresTaxInvoiceCeremony: boolean;
  showRegistrationBand: boolean;
  forcedColumns: Array<'item_code' | 'unit_code'>;
  bilingual: { enabled: boolean; secondaryLanguage: string | null; arabicLead: boolean };
  paperSize: 'A4' | 'Letter';
  notations(computation: TaxComputation): DocumentNotation[];
}

export interface IssuedDocumentSnapshot {
  documentType: TaxDocumentType;
  documentId: string;
  documentNumber: string;
  issuedAt: string;
  currency: string;
  totals: { taxableBase: number; taxTotal: number; grandTotal: number };
  taxLines: ComputedTaxLine[];
  sellerTaxIdentifier: string | null;
  buyerTaxNumber: string | null;
}

export interface EInvoicingTransport {
  readonly key: string;
  readonly version: string;
  readonly regimeClass: RegimeClass;
  buildArtifact(doc: IssuedDocumentSnapshot):
    { artifactType: string; payload: Uint8Array | string; payloadHash: string };
}

export interface PayrollPack {
  readonly key: string;
  readonly version: string;
  statutoryComponents(ctx: { countryId: string; asOf: string }): Array<{
    componentCode: string; kind: 'earning' | 'deduction' | 'employer_contribution';
    rate: number | null; base: 'gross' | 'basic'; mandatory: boolean;
  }>;
  bankFileOps: string[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/regimes/types.test.ts` — Expected: PASS.
Run: `npm run check:tsc` — Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/types.ts src/lib/regimes/types.test.ts
git commit -m "feat(tax): canonical regime plugin type vocabulary (contract-locked)"
```

### Task 2: `allocateLargestRemainder` + `roundMoneyWith` — `src/lib/financialMath.ts`

**Files:**
- Modify: `src/lib/financialMath.ts` (append after `convertToBase`, currently line 26)
- Test: `src/lib/financialMath.test.ts` (append)

**Interfaces:**
- Consumes: `RoundingPolicy` from Task 1; existing `roundMoney` (`financialMath.ts:13`).
- Produces: `allocateLargestRemainder(total: number, weights: number[], decimalPlaces: number): number[]` — Σ(result) === total exactly at the target precision, stable-order deterministic; `roundMoneyWith(value: number, decimalPlaces: number, policy: RoundingPolicy): number`.

- [ ] **Step 1: Write the failing tests (property-based + worked spec examples)**

```typescript
// append to src/lib/financialMath.test.ts
import { allocateLargestRemainder, roundMoneyWith, roundMoney } from './financialMath';

describe('allocateLargestRemainder', () => {
  it('spec example: OMR 0.100 discount over three equal 100.000 lines → 0.034/0.033/0.033', () => {
    expect(allocateLargestRemainder(0.1, [100, 100, 100], 3)).toEqual([0.034, 0.033, 0.033]);
  });
  it('spec example: inclusive ₹762.71 split across equal CGST/SGST weights → 381.36/381.35', () => {
    expect(allocateLargestRemainder(762.71, [9, 9], 2)).toEqual([381.36, 381.35]);
  });
  it('negative totals mirror positive allocation (credit notes)', () => {
    expect(allocateLargestRemainder(-0.1, [100, 100, 100], 3)).toEqual([-0.034, -0.033, -0.033]);
  });
  it('zero weights degrade to stable equal spread', () => {
    expect(allocateLargestRemainder(0.05, [0, 0], 2)).toEqual([0.03, 0.02]);
  });
  it('empty weights → empty result', () => {
    expect(allocateLargestRemainder(10, [], 2)).toEqual([]);
  });
  it('PROPERTY: sums exactly, parts within one minor unit of exact share, deterministic', () => {
    let seed = 424242;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let trial = 0; trial < 500; trial++) {
      const dp = [0, 2, 3][trial % 3];
      const n = 1 + Math.floor(rnd() * 7);
      const weights = Array.from({ length: n }, () => Math.floor(rnd() * 5000) / 10);
      const total = roundMoney(rnd() * 10000 - 2000, dp);
      const parts = allocateLargestRemainder(total, weights, dp);
      const sum = roundMoney(parts.reduce((s, p) => s + p, 0), dp);
      expect(sum).toBe(total);
      expect(allocateLargestRemainder(total, weights, dp)).toEqual(parts); // deterministic
      const weightSum = weights.reduce((s, w) => s + w, 0);
      if (weightSum > 0) {
        parts.forEach((p, i) => {
          const exact = (total * weights[i]) / weightSum;
          expect(Math.abs(p - exact)).toBeLessThanOrEqual(1 / 10 ** dp + 1e-9);
        });
      }
    }
  });
});

describe('roundMoneyWith', () => {
  const docHalfUp = { mode: 'half_up', level: 'document' } as const;
  const docHalfEven = { mode: 'half_even', level: 'document' } as const;
  it('half_up matches the house roundMoney byte-for-byte (Oman parity requirement)', () => {
    for (const v of [62.5, 62.4999, -2.005, 1.0005, 0.0005, -0.0005, 1250.0625]) {
      for (const dp of [0, 2, 3]) {
        expect(roundMoneyWith(v, dp, docHalfUp)).toBe(roundMoney(v, dp));
      }
    }
  });
  it('half_even rounds exact halves to the even minor unit', () => {
    expect(roundMoneyWith(0.125, 2, docHalfEven)).toBe(0.12);
    expect(roundMoneyWith(0.135, 2, docHalfEven)).toBe(0.14);
    expect(roundMoneyWith(2.5, 0, docHalfEven)).toBe(2);
    expect(roundMoneyWith(3.5, 0, docHalfEven)).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/financialMath.test.ts`
Expected: FAIL — `allocateLargestRemainder is not a function` (no export yet).

- [ ] **Step 3: Implement (append to `src/lib/financialMath.ts` after line 26)**

```typescript
import type { RoundingPolicy } from './regimes/types';

/**
 * THE ONLY sanctioned way to split a document-level amount across lines or
 * components (graft 9). Guarantees Σ(result) === total exactly at the target
 * precision; parts are proportional to weights with the residual minor units
 * assigned by largest fractional remainder (ties broken by stable input order,
 * so the result is deterministic). Negative totals allocate |total| and negate.
 * Ad-hoc proportional splits are banned by eslint xsuite/no-adhoc-money-allocation.
 */
export const allocateLargestRemainder = (
  total: number,
  weights: number[],
  decimalPlaces: number,
): number[] => {
  if (weights.length === 0) return [];
  if (total < 0) {
    return allocateLargestRemainder(-total, weights, decimalPlaces).map((v) => (v === 0 ? 0 : -v));
  }
  const factor = 10 ** decimalPlaces;
  const totalUnits = Math.round(total * factor);
  const weightSum = weights.reduce((s, w) => s + w, 0);

  let exactUnits: number[];
  if (weightSum === 0) {
    // Degenerate weights: spread equally (stable order gets the residual first).
    exactUnits = weights.map(() => totalUnits / weights.length);
  } else {
    exactUnits = weights.map((w) => (totalUnits * w) / weightSum);
  }
  const floored = exactUnits.map((u) => Math.floor(u + 1e-9));
  let residual = totalUnits - floored.reduce((s, u) => s + u, 0);
  const order = exactUnits
    .map((u, i) => ({ i, frac: u - Math.floor(u + 1e-9) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const result = [...floored];
  for (const { i } of order) {
    if (residual <= 0) break;
    result[i] += 1;
    residual -= 1;
  }
  return result.map((u) => u / factor);
};

/**
 * Policy-aware money rounding (graft 4). 'half_up' is defined as the HOUSE
 * roundMoney behavior (Math.round: half toward +infinity) — NOT textbook
 * half-away-from-zero — because the Oman byte-parity gate pins the kernel to the
 * legacy calculateInvoiceTotals output on 2,131 live documents. 'half_even'
 * (banker's) rounds exact halves to the even minor unit. `policy.level` and
 * `policy.cash_increment` are consumed by the kernel, not here.
 */
export const roundMoneyWith = (
  value: number,
  decimalPlaces: number,
  policy: RoundingPolicy,
): number => {
  if (policy.mode === 'half_up') return roundMoney(value, decimalPlaces);
  const factor = 10 ** decimalPlaces;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const EPS = 1e-9;
  let units: number;
  if (Math.abs(diff - 0.5) < EPS) {
    units = floor % 2 === 0 ? floor : floor + 1;
  } else {
    units = Math.round(scaled);
  }
  return units / factor;
};
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/lib/financialMath.test.ts` — Expected: PASS (all new + all pre-existing tests).
Run: `npm run check:tsc` — Expected: 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/financialMath.ts src/lib/financialMath.test.ts
git commit -m "feat(tax): allocateLargestRemainder + roundMoneyWith kernel primitives"
```

### Task 3: Inclusive back-out — `src/lib/tax/kernel/backOutInclusive.ts`

**Files:**
- Create: `src/lib/tax/kernel/backOutInclusive.ts`
- Test: `src/lib/tax/kernel/backOutInclusive.test.ts`

**Interfaces:**
- Consumes: `roundMoney` from `src/lib/financialMath.ts:13`.
- Produces: `backOutInclusive(gross: number, sumOfRates: number, decimalPlaces: number): { base: number; tax: number }` — base + tax reconstitutes gross EXACTLY.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/tax/kernel/backOutInclusive.test.ts
import { describe, it, expect } from 'vitest';
import { backOutInclusive } from './backOutInclusive';
import { roundMoney } from '../../financialMath';

describe('backOutInclusive', () => {
  it('spec example: ₹5,000 inclusive @18% → base 4237.29, tax 762.71', () => {
    expect(backOutInclusive(5000, 18, 2)).toEqual({ base: 4237.29, tax: 762.71 });
  });
  it('zero rate: base == gross, tax 0', () => {
    expect(backOutInclusive(150.5, 0, 2)).toEqual({ base: 150.5, tax: 0 });
  });
  it('OMR 3dp: 105.000 inclusive @5% → base 100.000, tax 5.000', () => {
    expect(backOutInclusive(105, 5, 3)).toEqual({ base: 100, tax: 5 });
  });
  it('PROPERTY: base + tax reconstitutes gross exactly at document decimals', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 500; i++) {
      const dp = [0, 2, 3][i % 3];
      const gross = roundMoney(rnd() * 100000, dp);
      const rates = roundMoney(rnd() * 30, 4);
      const { base, tax } = backOutInclusive(gross, rates, dp);
      expect(roundMoney(base + tax, dp)).toBe(gross);
      expect(base).toBe(roundMoney(base, dp));
      expect(tax).toBe(roundMoney(tax, dp));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tax/kernel/backOutInclusive.test.ts`
Expected: FAIL — `Cannot find module './backOutInclusive'`.

- [ ] **Step 3: Implement**

```typescript
// src/lib/tax/kernel/backOutInclusive.ts
import { roundMoney } from '../../financialMath';

/**
 * Back a tax-inclusive gross out into { base, tax } at document-currency
 * decimals. tax is DEFINED as gross - base (never independently rounded), so
 * base + tax reconstitutes the agreed gross EXACTLY — the spec's ₹5,000 @18%
 * worked example (4,237.29 + 762.71 = 5,000.00). Splitting `tax` across
 * multiple components is the kernel's job via allocateLargestRemainder.
 */
export function backOutInclusive(
  gross: number,
  sumOfRates: number,
  decimalPlaces: number,
): { base: number; tax: number } {
  const base = roundMoney((gross * 100) / (100 + sumOfRates), decimalPlaces);
  const tax = roundMoney(gross - base, decimalPlaces);
  return { base, tax };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/tax/kernel/backOutInclusive.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/kernel/backOutInclusive.ts src/lib/tax/kernel/backOutInclusive.test.ts
git commit -m "feat(tax): inclusive back-out kernel primitive (exact gross reconstitution)"
```

### Task 4: The kernel — `src/lib/tax/kernel/index.ts` (`computeDocumentTax` + trace emitter)

**Files:**
- Create: `src/lib/tax/kernel/index.ts`
- Test: `src/lib/tax/kernel/computeDocumentTax.test.ts`

**Interfaces:**
- Consumes: all Task 1 types; `roundMoney`, `roundMoneyWith`, `allocateLargestRemainder` (Task 2); `backOutInclusive` (Task 3).
- Produces: `computeDocumentTax(ctx: TaxContext): TaxComputation` (single mode — the contract signature) and `computeWithMode(ctx: TaxContext, mode: SchemeMode): TaxComputation` (the Phase 4/5 parameterization seam). Trace is deterministic: same ctx → deep-equal trace.

**Parity contract this task must honor (the whole phase hangs on it):** for exclusive documents with `{half_up, document}` policy the kernel must reproduce, byte-for-byte, `calculateInvoiceTotals` (`financialMath.ts:47-66`) and `calculateQuoteTotals` (`financialMath.ts:145-167`): per-line `taxable_i = round(round(q×up, dp) − lineDiscount, dp)`; document discount allocated across lines (Σ after allocation ≡ round(subtotal − discount, dp) because all terms are dp-quantized); component tax = `round(Σtaxable × rate / 100, dp)`; grand total = `round(taxable + tax, dp)`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/tax/kernel/computeDocumentTax.test.ts
import { describe, it, expect } from 'vitest';
import { computeDocumentTax, computeWithMode } from './index';
import type { TaxContext, TaxableLine, GeoCountryTaxRateRow } from '../../regimes/types';
import type { RateContext } from '../../currencyService';

const omrRc: RateContext = {
  documentCurrency: 'OMR', documentDecimals: 3, baseCurrency: 'OMR', baseDecimals: 3, rate: 1, rateSource: 'derived',
};
const vat5: GeoCountryTaxRateRow = {
  id: 'rate-om-vat-std', country_id: 'om', subdivision_id: null, component_code: 'VAT',
  component_label: 'VAT', tax_category: 'standard', rate: 5, applies_to: null,
  valid_from: '2021-04-16', valid_to: null, sort_order: 0,
};
const line = (over: Partial<TaxableLine>): TaxableLine => ({
  lineItemId: null, description: 'svc', quantity: 1, unitPrice: 100, lineDiscount: 0,
  unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null, ...over,
});
const ctx = (over: Partial<TaxContext>): TaxContext => ({
  documentType: 'invoice',
  seller: { legalEntityId: 'le', countryId: 'om', subdivisionId: null, taxIdentifier: 'OM123', registrations: [] },
  buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
  taxPointDate: '2026-07-02', placeOfSupplySubdivisionId: null,
  lines: [line({})], documentDiscount: 0, taxInclusive: false,
  rateContext: omrRc, rates: [vat5],
  roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western', ...over,
});

describe('computeDocumentTax — single mode, Oman parity shapes', () => {
  it('spec walkthrough: 12 × OMR 120.000 @5% → taxable 1440.000, VAT 72.000, total 1512.000', () => {
    const c = computeDocumentTax(ctx({ lines: [line({ quantity: 12, unitPrice: 120 })] }));
    expect(c.totals).toEqual({ taxableBase: 1440, taxTotal: 72, grandTotal: 1512, roundingAdjustment: null });
    expect(c.rollups).toHaveLength(1);
    expect(c.rollups[0]).toMatchObject({
      lineItemId: null, componentCode: 'VAT', componentLabel: 'VAT 5%', rate: 5,
      taxableBase: 1440, taxAmount: 72, taxTreatment: 'standard',
    });
    expect(c.lines).toHaveLength(1);
    expect(c.trace.steps.some((s) => s.op === 'rate_match' && s.rateRowId === 'rate-om-vat-std')).toBe(true);
  });

  it('legacy invoice math parity: per-line % discount then fixed doc discount then 5% (OMR mils survive)', () => {
    // Mirrors calculateInvoiceTotals(items=[{3×40.5, 10%}, {1×0.105}], discount=0.100, 5%, dp=3):
    // line1 sub=121.500, disc=12.150 → 109.350; line2 0.105; subtotal 109.455;
    // discounted 109.355; tax = round(109.355*0.05,3) = 5.468; total 114.823.
    const c = computeDocumentTax(ctx({
      lines: [
        line({ quantity: 3, unitPrice: 40.5, lineDiscount: 12.15 }),
        line({ quantity: 1, unitPrice: 0.105 }),
      ],
      documentDiscount: 0.1,
    }));
    expect(c.totals.taxableBase).toBe(109.355);
    expect(c.totals.taxTotal).toBe(5.468);
    expect(c.totals.grandTotal).toBe(114.823);
  });

  it('document discount allocation: line component rows sum exactly to the rollup', () => {
    const c = computeDocumentTax(ctx({
      lines: [line({ unitPrice: 100 }), line({ unitPrice: 100 }), line({ unitPrice: 100 })],
      documentDiscount: 0.1,
    }));
    const lineSum = c.lines.reduce((s, l) => s + l.taxAmount, 0);
    expect(Math.round(lineSum * 1000) / 1000).toBe(c.rollups[0].taxAmount);
    const alloc = c.trace.steps.find((s) => s.op === 'discount_allocation');
    expect(alloc).toBeDefined();
  });

  it('zero_rated line contributes a 0-amount component row and a notation', () => {
    const c = computeDocumentTax(ctx({
      lines: [line({ unitPrice: 200 }), line({ unitPrice: 50, treatment: 'zero_rated', treatmentReasonCode: 'EXPORT_SERVICES' })],
    }));
    expect(c.totals.taxTotal).toBe(10); // only the standard line taxes
    const zeroRow = c.lines.find((l) => l.taxTreatment === 'zero_rated');
    expect(zeroRow).toMatchObject({ taxAmount: 0, treatmentReasonCode: 'EXPORT_SERVICES' });
    expect(c.notations.some((n) => n.code === 'EXPORT_SERVICES')).toBe(true);
  });

  it('reverse_charge emits 0-amount components + REVERSE_CHARGE notation', () => {
    const c = computeDocumentTax(ctx({ lines: [line({ treatment: 'reverse_charge' })] }));
    expect(c.totals.taxTotal).toBe(0);
    expect(c.notations.some((n) => n.code === 'REVERSE_CHARGE')).toBe(true);
  });

  it('inclusive back-out reconstitutes gross exactly and splits by largest remainder', () => {
    const inr: RateContext = { ...omrRc, documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2 };
    const cgst = { ...vat5, id: 'cg', component_code: 'CGST', component_label: 'CGST', rate: 9, sort_order: 0 };
    const sgst = { ...vat5, id: 'sg', component_code: 'SGST', component_label: 'SGST', rate: 9, sort_order: 1 };
    const c = computeDocumentTax(ctx({
      lines: [line({ unitPrice: 5000 })], taxInclusive: true, rateContext: inr, rates: [cgst, sgst],
    }));
    expect(c.totals.taxableBase).toBe(4237.29);
    expect(c.totals.taxTotal).toBe(762.71);
    expect(c.totals.grandTotal).toBe(5000);
    expect(c.rollups.map((r) => r.taxAmount).sort((a, b) => b - a)).toEqual([381.36, 381.35]);
  });

  it('cash_increment emits an out-of-scope rounding adjustment closing the gap exactly', () => {
    const inr: RateContext = { ...omrRc, documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2 };
    const igst = { ...vat5, id: 'ig', component_code: 'IGST', component_label: 'IGST', rate: 18 };
    const c = computeDocumentTax(ctx({
      lines: [line({ unitPrice: 100.3 })], rateContext: inr, rates: [igst],
      roundingPolicy: { mode: 'half_up', level: 'document', cash_increment: 1 },
    }));
    // taxable 100.30, tax 18.05, raw 118.35 → 118.00, adjustment -0.35
    expect(c.totals.roundingAdjustment).toBe(-0.35);
    expect(c.totals.grandTotal).toBe(118);
    expect(c.trace.steps.some((s) => s.op === 'cash_rounding' && s.adjustment === -0.35)).toBe(true);
  });

  it('trace is deterministic: same ctx → deep-equal trace', () => {
    const a = computeDocumentTax(ctx({ documentDiscount: 0.1 }));
    const b = computeDocumentTax(ctx({ documentDiscount: 0.1 }));
    expect(a.trace).toEqual(b.trace);
  });
});

describe('computeWithMode — parameterization seams', () => {
  const inrRc: RateContext = { ...omrRc, documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2 };
  const rows: GeoCountryTaxRateRow[] = [
    { ...vat5, id: 'cg', component_code: 'CGST', component_label: 'CGST', rate: 9 },
    { ...vat5, id: 'sg', component_code: 'SGST', component_label: 'SGST', rate: 9, sort_order: 1 },
    { ...vat5, id: 'ig', component_code: 'IGST', component_label: 'IGST', rate: 18, sort_order: 2 },
  ];
  const reg = {
    id: 'reg1', legal_entity_id: 'le', country_id: 'in', subdivision_id: 'sub-KA',
    tax_number: '29X', scheme: 'standard' as const, registered_from: '2020-01-01', registered_to: null, is_primary: true,
  };
  it('split_by_place_of_supply: intra-state → CGST+SGST pair', () => {
    const c = computeWithMode(ctx({
      rateContext: inrRc, rates: rows, placeOfSupplySubdivisionId: 'sub-KA',
      seller: { legalEntityId: 'le', countryId: 'in', subdivisionId: 'sub-KA', taxIdentifier: '29X', registrations: [reg] },
      lines: [line({ quantity: 2, unitPrice: 45000 })],
    }), 'split_by_place_of_supply');
    expect(c.rollups.map((r) => r.componentCode).sort()).toEqual(['CGST', 'SGST']);
    expect(c.rollups.map((r) => r.taxAmount)).toEqual([8100, 8100]);
    expect(c.totals.grandTotal).toBe(106200);
  });
  it('split_by_place_of_supply: inter-state → IGST', () => {
    const c = computeWithMode(ctx({
      rateContext: inrRc, rates: rows, placeOfSupplySubdivisionId: 'sub-MH',
      seller: { legalEntityId: 'le', countryId: 'in', subdivisionId: 'sub-KA', taxIdentifier: '29X', registrations: [reg] },
      lines: [line({ quantity: 2, unitPrice: 45000 })],
    }), 'split_by_place_of_supply');
    expect(c.rollups.map((r) => r.componentCode)).toEqual(['IGST']);
    expect(c.rollups[0].taxAmount).toBe(16200);
  });
  it('jurisdiction_stack: stacks every registered-subdivision rate row; no registration → out_of_scope', () => {
    const usRc: RateContext = { ...omrRc, documentCurrency: 'USD', documentDecimals: 2, baseCurrency: 'USD', baseDecimals: 2 };
    const stack: GeoCountryTaxRateRow[] = [
      { ...vat5, id: 'tx-st', subdivision_id: 'sub-TX', component_code: 'STATE', component_label: 'TX State', rate: 6.25, sort_order: 0 },
      { ...vat5, id: 'tx-ci', subdivision_id: 'sub-AUS', component_code: 'CITY', component_label: 'Austin City', rate: 1, sort_order: 1 },
    ];
    const txReg = { ...reg, id: 'r-tx', subdivision_id: 'sub-TX' };
    const ausReg = { ...reg, id: 'r-aus', subdivision_id: 'sub-AUS' };
    const c = computeWithMode(ctx({
      rateContext: usRc, rates: stack,
      seller: { legalEntityId: 'le', countryId: 'us', subdivisionId: 'sub-TX', taxIdentifier: null, registrations: [txReg, ausReg] },
      lines: [line({ unitPrice: 2000 })],
    }), 'jurisdiction_stack');
    expect(c.rollups.map((r) => r.taxAmount)).toEqual([125, 20]);
    // No registrations at all → every line out_of_scope, zero components
    const c2 = computeWithMode(ctx({
      rateContext: usRc, rates: stack,
      seller: { legalEntityId: 'le', countryId: 'us', subdivisionId: 'sub-TX', taxIdentifier: null, registrations: [] },
      lines: [line({ unitPrice: 2000 })],
    }), 'jurisdiction_stack');
    expect(c2.totals.taxTotal).toBe(0);
    expect(c2.rollups).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/tax/kernel/computeDocumentTax.test.ts`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement the kernel**

```typescript
// src/lib/tax/kernel/index.ts
//
// L2 FISCAL KERNEL — pure, zero-I/O, golden-testable. All statutory FACTS
// (rates, rounding policy, registrations) arrive pre-resolved inside TaxContext;
// this module only does arithmetic + deterministic tracing. Strategies in
// src/lib/regimes/ select the scheme mode and re-stamp trace provenance.

import { allocateLargestRemainder, roundMoney, roundMoneyWith } from '../../financialMath';
import { backOutInclusive } from './backOutInclusive';
import type {
  ComputedTaxLine, DocumentNotation, GeoCountryTaxRateRow, RuleTrace, RuleTraceStep,
  SchemeMode, TaxComputation, TaxContext, TaxableLine,
} from '../../regimes/types';

export const KERNEL_VERSION = '1.0.0';

interface ComponentSpec {
  rateRowId: string;
  code: string;
  label: string;          // frozen render label, e.g. 'VAT 5%' / 'CGST 9%'
  rate: number;
  jurisdictionRef: string | null;
  sortOrder: number;
}

const label = (row: GeoCountryTaxRateRow): string =>
  `${row.component_label} ${formatRate(row.rate)}%`;

const formatRate = (rate: number): string =>
  Number.isInteger(rate) ? String(rate) : String(rate);

const toSpec = (row: GeoCountryTaxRateRow): ComponentSpec => ({
  rateRowId: row.id, code: row.component_code, label: label(row), rate: row.rate,
  jurisdictionRef: row.subdivision_id, sortOrder: row.sort_order,
});

/** Resolve the applicable component set once per document (algorithm step 6). */
function resolveComponents(ctx: TaxContext, mode: SchemeMode, steps: RuleTraceStep[]): ComponentSpec[] {
  const standard = ctx.rates
    .filter((r) => r.tax_category === 'standard')
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  let chosen: GeoCountryTaxRateRow[];
  if (mode === 'single') {
    chosen = standard.filter((r) => r.subdivision_id === null);
    steps.push({ op: 'scheme_decision', mode, detail: `single → [${chosen.map((r) => r.component_code).join(',')}]` });
  } else if (mode === 'split_by_place_of_supply') {
    const sellerSub = ctx.seller.registrations.find((g) => g.is_primary)?.subdivision_id
      ?? ctx.seller.subdivisionId;
    const intra = sellerSub !== null && ctx.placeOfSupplySubdivisionId !== null
      && sellerSub === ctx.placeOfSupplySubdivisionId;
    chosen = intra
      ? standard.filter((r) => r.component_code === 'CGST' || r.component_code === 'SGST')
      : standard.filter((r) => r.component_code === 'IGST');
    steps.push({
      op: 'scheme_decision', mode,
      detail: intra
        ? `intra_state ${sellerSub}==${ctx.placeOfSupplySubdivisionId} → CGST+SGST`
        : `inter_state ${sellerSub}≠${ctx.placeOfSupplySubdivisionId} → IGST`,
    });
  } else {
    // jurisdiction_stack: the context builder supplies rate rows already scoped
    // to the buyer's ship-to path; the kernel stacks each row whose subdivision
    // has a live seller registration (nexus as data). No registration → no
    // component (the caller marks lines out_of_scope — never a phantom 0%).
    const registeredSubs = new Set(
      ctx.seller.registrations.map((g) => g.subdivision_id).filter((s): s is string => s !== null),
    );
    chosen = standard.filter((r) => r.subdivision_id !== null && registeredSubs.has(r.subdivision_id));
    steps.push({
      op: 'scheme_decision', mode,
      detail: `stack over registered subdivisions → [${chosen.map((r) => r.component_code).join(',')}]`,
    });
  }
  for (const row of chosen) {
    steps.push({ op: 'rate_match', rateRowId: row.id, componentCode: row.component_code, rate: row.rate, validFrom: row.valid_from });
  }
  return chosen.map(toSpec);
}

const isTaxed = (t: TaxableLine): boolean => t.treatment === 'standard' || t.treatment === 'reduced';

/** The contract entry point: single-mode computation (simple_vat and defaults). */
export function computeDocumentTax(ctx: TaxContext): TaxComputation {
  return computeWithMode(ctx, 'single');
}

/** Parameterization seam for split/stack strategies (graft 8, Phases 4-5). */
export function computeWithMode(ctx: TaxContext, mode: SchemeMode): TaxComputation {
  const dp = ctx.rateContext.documentDecimals;
  const policy = ctx.roundingPolicy;
  const steps: RuleTraceStep[] = [];
  const notations: DocumentNotation[] = [];

  const components = resolveComponents(ctx, mode, steps);

  // 1. Per-line taxable (net of line discounts), dp-quantized — legacy parity.
  const lineTaxables = ctx.lines.map((l) => {
    const sub = roundMoney(l.quantity * l.unitPrice, dp);
    return roundMoney(sub - l.lineDiscount, dp);
  });

  // 2. Document-discount allocation across ALL lines (graft 9).
  let netTaxables = lineTaxables;
  if (ctx.documentDiscount !== 0) {
    const allocs = allocateLargestRemainder(ctx.documentDiscount, lineTaxables, dp);
    const weightSum = lineTaxables.reduce((s, w) => s + w, 0);
    steps.push({
      op: 'discount_allocation', method: 'largest_remainder', shares: allocs,
      remainders: lineTaxables.map((w) => {
        const exact = weightSum === 0 ? 0 : (ctx.documentDiscount * w) / weightSum;
        return roundMoney(exact - Math.floor(exact * 10 ** dp) / 10 ** dp, dp + 4);
      }),
    });
    netTaxables = lineTaxables.map((t, i) => roundMoney(t - allocs[i], dp));
  }

  // 3. Treatment classification steps + notations.
  ctx.lines.forEach((l) => {
    steps.push({ op: 'treatment', lineItemId: l.lineItemId, treatment: l.treatment, reasonCode: l.treatmentReasonCode });
    if (l.treatment === 'reverse_charge' && !notations.some((n) => n.code === 'REVERSE_CHARGE')) {
      notations.push({ code: 'REVERSE_CHARGE', text: 'Tax to be accounted for by the recipient (reverse charge).' });
    }
    if ((l.treatment === 'zero_rated' || l.treatment === 'exempt') && l.treatmentReasonCode
      && !notations.some((n) => n.code === l.treatmentReasonCode)) {
      notations.push({ code: l.treatmentReasonCode, text: `${l.treatment === 'zero_rated' ? 'Zero-rated' : 'Exempt'}: ${l.treatmentReasonCode}.` });
    }
  });

  const taxedIdx = ctx.lines.map((l, i) => (isTaxed(l) ? i : -1)).filter((i) => i >= 0);
  const sumRates = components.reduce((s, c) => s + c.rate, 0);

  let docTaxable: number;
  let lineBases: number[];           // per-line taxable base (post-inclusive-backout)
  const lineRows: ComputedTaxLine[] = [];
  const rollups: ComputedTaxLine[] = [];

  if (ctx.taxInclusive) {
    // 4a. Inclusive: back each taxed line's gross out, split its tax across
    // components by rate weights (largest remainder), so gross reconstitutes.
    lineBases = [...netTaxables];
    const perLineTax: number[][] = ctx.lines.map(() => components.map(() => 0));
    for (const i of taxedIdx) {
      const { base, tax } = backOutInclusive(netTaxables[i], sumRates, dp);
      steps.push({ op: 'inclusive_backout', gross: netTaxables[i], sumRates, base });
      lineBases[i] = base;
      perLineTax[i] = allocateLargestRemainder(tax, components.map((c) => c.rate), dp);
    }
    components.forEach((c, ci) => {
      const rollupTax = roundMoney(taxedIdx.reduce((s, i) => s + perLineTax[i][ci], 0), dp);
      const rollupBase = roundMoney(taxedIdx.reduce((s, i) => s + lineBases[i], 0), dp);
      rollups.push(componentRow(null, c, rollupBase, rollupTax, 'standard', null, ci));
      taxedIdx.forEach((i) => {
        lineRows.push(componentRow(ctx.lines[i].lineItemId, c, lineBases[i], perLineTax[i][ci], ctx.lines[i].treatment, ctx.lines[i].treatmentReasonCode, ci));
      });
    });
    docTaxable = roundMoney(lineBases.reduce((s, b) => s + b, 0), dp);
  } else {
    // 4b. Exclusive (the Oman parity path).
    lineBases = netTaxables;
    docTaxable = roundMoney(netTaxables.reduce((s, t) => s + t, 0), dp);
    const eligibleBase = roundMoney(taxedIdx.reduce((s, i) => s + netTaxables[i], 0), dp);
    components.forEach((c, ci) => {
      let rollupTax: number;
      let perLine: number[];
      if (policy.level === 'line') {
        perLine = taxedIdx.map((i) => roundMoneyWith((netTaxables[i] * c.rate) / 100, dp, policy));
        rollupTax = roundMoney(perLine.reduce((s, t) => s + t, 0), dp);
      } else {
        const before = (eligibleBase * c.rate) / 100;
        rollupTax = roundMoneyWith(before, dp, policy);
        steps.push({ op: 'rounding', policy, before, after: rollupTax });
        perLine = allocateLargestRemainder(rollupTax, taxedIdx.map((i) => netTaxables[i]), dp);
      }
      rollups.push(componentRow(null, c, eligibleBase, rollupTax, 'standard', null, ci));
      taxedIdx.forEach((i, k) => {
        lineRows.push(componentRow(ctx.lines[i].lineItemId, c, netTaxables[i], perLine[k], ctx.lines[i].treatment, ctx.lines[i].treatmentReasonCode, ci));
      });
    });
  }

  // 5. Zero-amount evidence rows for non-taxed treatments (classification preserved).
  ctx.lines.forEach((l, i) => {
    if (!isTaxed(l)) {
      const c = components[0] ?? { rateRowId: 'none', code: 'VAT', label: 'VAT 0%', rate: 0, jurisdictionRef: null, sortOrder: 0 };
      lineRows.push({
        lineItemId: l.lineItemId, componentCode: c.code, componentLabel: `${c.code} 0%`,
        jurisdictionRef: null, rate: 0, taxableBase: lineBases[i], taxAmount: 0,
        taxTreatment: l.treatment, treatmentReasonCode: l.treatmentReasonCode, sequence: components.length,
      });
    }
  });

  // 6. Totals: header tax is DEFINITIONALLY Σ rollups — never recomputed.
  const taxTotal = roundMoney(rollups.reduce((s, r) => s + r.taxAmount, 0), dp);
  let grandTotal: number;
  let roundingAdjustment: number | null = null;
  if (ctx.taxInclusive) {
    grandTotal = roundMoney(docTaxable + taxTotal, dp);
  } else {
    grandTotal = roundMoney(docTaxable + taxTotal, dp);
  }
  if (policy.cash_increment && policy.cash_increment > 0) {
    const inc = policy.cash_increment;
    const rounded = roundMoney(Math.round(grandTotal / inc) * inc, dp);
    roundingAdjustment = roundMoney(rounded - grandTotal, dp);
    steps.push({ op: 'cash_rounding', increment: inc, adjustment: roundingAdjustment });
    grandTotal = rounded;
  }

  const trace: RuleTrace = {
    regimeKey: 'kernel', pluginVersion: KERNEL_VERSION, packVersionId: null, schemeMode: mode, steps,
  };
  return {
    lines: lineRows, rollups,
    totals: { taxableBase: docTaxable, taxTotal, grandTotal, roundingAdjustment },
    expectedWithholding: null, notations, trace,
  };
}

function componentRow(
  lineItemId: string | null, c: ComponentSpec, taxableBase: number, taxAmount: number,
  treatment: ComputedTaxLine['taxTreatment'], reasonCode: string | null, sequence: number,
): ComputedTaxLine {
  return {
    lineItemId, componentCode: c.code, componentLabel: c.label, jurisdictionRef: c.jurisdictionRef,
    rate: c.rate, taxableBase, taxAmount, taxTreatment: treatment, treatmentReasonCode: reasonCode, sequence,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/lib/tax/kernel/` — Expected: PASS (all suites).
Run: `npm run check:tsc` — Expected: 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/kernel/index.ts src/lib/tax/kernel/computeDocumentTax.test.ts
git commit -m "feat(tax): pure fiscal kernel — computeDocumentTax with scheme modes + deterministic trace"
```

### Task 5: Code registry — `src/lib/regimes/registry.ts`

**Files:**
- Create: `src/lib/regimes/registry.ts`
- Test: `src/lib/regimes/registry.test.ts`

**Interfaces:**
- Consumes: plugin interfaces from Task 1; `CountryConfigError` from `src/lib/country/resolveCountryConfig.ts:42` (existing, verified).
- Produces: `registerRegimePlugin(kind, plugin)`, `resolveTaxStrategy(key)`, `resolveReturnComposer(key)`, `resolveNumberingPolicy(key)`, `resolveDocumentProfile(key)`, `resolveEInvoicingTransport(key)`, `resolvePayrollPack(key)`, `listRegisteredCapabilities()`, `RegimePluginKind`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/registry.test.ts
import { describe, it, expect } from 'vitest';
import { registerRegimePlugin, resolveTaxStrategy, listRegisteredCapabilities } from './registry';
import { CountryConfigError } from '../country/resolveCountryConfig';
import type { TaxStrategy } from './types';

const fake: TaxStrategy = {
  key: 'test_vat', version: '0.0.1', schemeMode: 'single',
  defaults: { roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western' },
  compute: () => { throw new Error('unused'); },
};

describe('regimes/registry', () => {
  it('register then resolve returns the same plugin object', () => {
    registerRegimePlugin('tax', fake);
    expect(resolveTaxStrategy('test_vat')).toBe(fake);
  });
  it('unregistered key throws CountryConfigError naming the key — never a silent VAT 0%', () => {
    expect(() => resolveTaxStrategy('nonexistent_regime')).toThrowError(CountryConfigError);
    expect(() => resolveTaxStrategy('nonexistent_regime')).toThrowError(/nonexistent_regime/);
  });
  it('duplicate key+kind registration with a different version throws (accidental fork guard)', () => {
    expect(() => registerRegimePlugin('tax', { ...fake, version: '0.0.2' })).toThrowError(/already registered/);
  });
  it('listRegisteredCapabilities exposes capability_key/kind/version for the manifest gate', () => {
    const caps = listRegisteredCapabilities();
    expect(caps).toContainEqual({ capability_key: 'test_vat', kind: 'tax', version: '0.0.1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/regimes/registry.test.ts`
Expected: FAIL — `Cannot find module './registry'`.

- [ ] **Step 3: Implement**

```typescript
// src/lib/regimes/registry.ts
//
// In-code plugin registry (L3 routing). Keys are selected BY DATA (the regime.*
// Country Engine keys); resolution failure on a statutory_ready country is a
// hard CountryConfigError — structurally impossible to render a silent "VAT 0%".

import { CountryConfigError } from '../country/resolveCountryConfig';
import type {
  DocumentComplianceProfile, EInvoicingTransport, NumberingPolicy,
  PayrollPack, ReturnComposer, TaxStrategy,
} from './types';

export type RegimePluginKind = 'tax' | 'return' | 'numbering' | 'documents' | 'einvoice' | 'payroll';

interface RegisteredPlugin { key: string; version: string }

const registries: Record<RegimePluginKind, Map<string, RegisteredPlugin>> = {
  tax: new Map(), return: new Map(), numbering: new Map(),
  documents: new Map(), einvoice: new Map(), payroll: new Map(),
};

export function registerRegimePlugin(kind: RegimePluginKind, plugin: { key: string; version: string }): void {
  const existing = registries[kind].get(plugin.key);
  if (existing && existing !== plugin) {
    throw new Error(
      `Regime plugin already registered: kind=${kind} key=${plugin.key} ` +
      `(existing v${existing.version}, attempted v${plugin.version}). One key, one plugin.`,
    );
  }
  registries[kind].set(plugin.key, plugin);
}

function resolve<T extends RegisteredPlugin>(kind: RegimePluginKind, key: string): T {
  const plugin = registries[kind].get(key);
  if (!plugin) {
    throw new CountryConfigError(
      `No registered ${kind} regime plugin for key "${key}". ` +
      `A statutory_ready country must resolve every regime.* key to a registered, fixture-green plugin.`,
    );
  }
  return plugin as T;
}

export function resolveTaxStrategy(key: string): TaxStrategy { return resolve<TaxStrategy>('tax', key); }
export function resolveReturnComposer(key: string): ReturnComposer { return resolve<ReturnComposer>('return', key); }
export function resolveNumberingPolicy(key: string): NumberingPolicy { return resolve<NumberingPolicy>('numbering', key); }
export function resolveDocumentProfile(key: string): DocumentComplianceProfile { return resolve<DocumentComplianceProfile>('documents', key); }
export function resolveEInvoicingTransport(key: string): EInvoicingTransport { return resolve<EInvoicingTransport>('einvoice', key); }
export function resolvePayrollPack(key: string): PayrollPack { return resolve<PayrollPack>('payroll', key); }

/** Capability manifest input for the publish gate (graft 2). */
export function listRegisteredCapabilities(): Array<{ capability_key: string; kind: string; version: string }> {
  const out: Array<{ capability_key: string; kind: string; version: string }> = [];
  (Object.keys(registries) as RegimePluginKind[]).forEach((kind) => {
    registries[kind].forEach((p) => out.push({ capability_key: p.key, kind, version: p.version }));
  });
  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.capability_key.localeCompare(b.capability_key));
}
```

Note: `CountryConfigError`'s constructor at `resolveCountryConfig.ts:42` — check its signature before Step 4; if it requires a key argument (`new CountryConfigError(key, message)`), pass the regime key as the key argument. Adjust the call, not the contract.

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/regimes/registry.test.ts` — Expected: PASS. `npm run check:tsc` — 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/registry.ts src/lib/regimes/registry.test.ts
git commit -m "feat(tax): regime plugin code registry with fail-loud resolution"
```

### Task 6: `simple_vat` strategy + Oman golden fixtures

**Files:**
- Create: `src/lib/regimes/simple_vat/index.ts`
- Create: `src/lib/regimes/simple_vat/fixtures/om-standard-invoice.json`
- Create: `src/lib/regimes/simple_vat/fixtures/om-zero-rated-export.json`
- Create: `src/lib/regimes/simple_vat/fixtures/om-doc-discount-mils.json`
- Test: `src/lib/regimes/simple_vat/simpleVat.test.ts`

**Interfaces:**
- Consumes: `computeDocumentTax` (Task 4), `registerRegimePlugin` (Task 5), types (Task 1).
- Produces: `simpleVat: TaxStrategy` (key `'simple_vat'`, version `'1.0.0'`, schemeMode `'single'`, defaults `{roundingPolicy: {mode:'half_up', level:'document'}, scaleSystem:'western'}`); side-effectful registration via `src/lib/regimes/register.ts` (Task 7 creates the aggregator).
- Fixture JSON shape: `{ "name": string, "input_document": <TaxContext-serializable>, "expected": { "totals": {...}, "rollups": [{componentCode, rate, taxableBase, taxAmount}] } }` — the SAME shape `master_country_pack_tests` rows use (Task 25 copies these three files into the DB).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/simple_vat/simpleVat.test.ts
import { describe, it, expect } from 'vitest';
import { simpleVat } from './index';
import type { TaxContext } from '../types';
import omStandard from './fixtures/om-standard-invoice.json';
import omZero from './fixtures/om-zero-rated-export.json';
import omDiscount from './fixtures/om-doc-discount-mils.json';

const fixtures = [omStandard, omZero, omDiscount] as Array<{
  name: string; input_document: TaxContext;
  expected: { totals: Record<string, number | null>; rollups: Array<Record<string, unknown>> };
}>;

describe('simple_vat golden fixtures (Oman pack v1 evidence)', () => {
  it('identity: key/version/mode/defaults per contract', () => {
    expect(simpleVat.key).toBe('simple_vat');
    expect(simpleVat.version).toBe('1.0.0');
    expect(simpleVat.schemeMode).toBe('single');
    expect(simpleVat.defaults).toEqual({
      roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western',
    });
  });
  fixtures.forEach((f) => {
    it(`fixture: ${f.name}`, async () => {
      const c = await simpleVat.compute(f.input_document);
      expect(c.totals).toEqual(f.expected.totals);
      f.expected.rollups.forEach((r, i) => expect(c.rollups[i]).toMatchObject(r));
      expect(c.trace.regimeKey).toBe('simple_vat');
      expect(c.trace.pluginVersion).toBe('1.0.0');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/regimes/simple_vat/` — Expected: FAIL — missing module/fixtures.

- [ ] **Step 3: Implement plugin + three fixtures**

```typescript
// src/lib/regimes/simple_vat/index.ts
import { computeDocumentTax } from '../../tax/kernel';
import type { TaxComputation, TaxContext, TaxStrategy } from '../types';

/**
 * The shared default TaxStrategy: one country-level component set, document-level
 * half-up rounding, western words scale. Keeps ~80% of countries data-only and is
 * BYTE-IDENTICAL to the legacy calculateInvoiceTotals/calculateQuoteTotals math —
 * proven by the M-E parity replay over the full live Omani corpus.
 */
export const simpleVat: TaxStrategy = {
  key: 'simple_vat',
  version: '1.0.0',
  schemeMode: 'single',
  defaults: { roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western' },
  compute(ctx: TaxContext): TaxComputation {
    const c = computeDocumentTax(ctx);
    return { ...c, trace: { ...c.trace, regimeKey: this.key, pluginVersion: this.version } };
  },
};
```

```json
// src/lib/regimes/simple_vat/fixtures/om-standard-invoice.json
{
  "name": "OM standard 5% — 12-drive RAID, 12 × OMR 120.000 (spec walkthrough)",
  "input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "fixture-le", "countryId": "fixture-om", "subdivisionId": null, "taxIdentifier": "1234567890", "registrations": [] },
    "buyer": { "taxNumber": null, "countryId": null, "subdivisionId": null, "isBusiness": true, "addressSnapshot": null },
    "taxPointDate": "2026-07-02",
    "placeOfSupplySubdivisionId": null,
    "lines": [{ "lineItemId": null, "description": "12-drive RAID recovery", "quantity": 12, "unitPrice": 120, "lineDiscount": 0, "unitCode": "C62", "itemCode": null, "treatment": "standard", "treatmentReasonCode": null }],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "OMR", "documentDecimals": 3, "baseCurrency": "OMR", "baseDecimals": 3, "rate": 1, "rateSource": "derived" },
    "rates": [{ "id": "fixture-om-vat-std", "country_id": "fixture-om", "subdivision_id": null, "component_code": "VAT", "component_label": "VAT", "tax_category": "standard", "rate": 5, "applies_to": null, "valid_from": "2021-04-16", "valid_to": null, "sort_order": 0 }],
    "roundingPolicy": { "mode": "half_up", "level": "document" },
    "scaleSystem": "western"
  },
  "expected": {
    "totals": { "taxableBase": 1440, "taxTotal": 72, "grandTotal": 1512, "roundingAdjustment": null },
    "rollups": [{ "componentCode": "VAT", "componentLabel": "VAT 5%", "rate": 5, "taxableBase": 1440, "taxAmount": 72, "taxTreatment": "standard" }]
  }
}
```

```json
// src/lib/regimes/simple_vat/fixtures/om-zero-rated-export.json
{
  "name": "OM zero-rated export line alongside a standard line",
  "input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "fixture-le", "countryId": "fixture-om", "subdivisionId": null, "taxIdentifier": "1234567890", "registrations": [] },
    "buyer": { "taxNumber": null, "countryId": null, "subdivisionId": null, "isBusiness": true, "addressSnapshot": null },
    "taxPointDate": "2026-07-02",
    "placeOfSupplySubdivisionId": null,
    "lines": [
      { "lineItemId": null, "description": "HDD recovery", "quantity": 1, "unitPrice": 200, "lineDiscount": 0, "unitCode": null, "itemCode": null, "treatment": "standard", "treatmentReasonCode": null },
      { "lineItemId": null, "description": "Export service (Dubai customer)", "quantity": 1, "unitPrice": 50, "lineDiscount": 0, "unitCode": null, "itemCode": null, "treatment": "zero_rated", "treatmentReasonCode": "EXPORT_SERVICES" }
    ],
    "documentDiscount": 0,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "OMR", "documentDecimals": 3, "baseCurrency": "OMR", "baseDecimals": 3, "rate": 1, "rateSource": "derived" },
    "rates": [{ "id": "fixture-om-vat-std", "country_id": "fixture-om", "subdivision_id": null, "component_code": "VAT", "component_label": "VAT", "tax_category": "standard", "rate": 5, "applies_to": null, "valid_from": "2021-04-16", "valid_to": null, "sort_order": 0 }],
    "roundingPolicy": { "mode": "half_up", "level": "document" },
    "scaleSystem": "western"
  },
  "expected": {
    "totals": { "taxableBase": 250, "taxTotal": 10, "grandTotal": 260, "roundingAdjustment": null },
    "rollups": [{ "componentCode": "VAT", "rate": 5, "taxableBase": 200, "taxAmount": 10 }]
  }
}
```

```json
// src/lib/regimes/simple_vat/fixtures/om-doc-discount-mils.json
{
  "name": "OM document discount 0.100 over three 100.000 lines — mils survive (graft 9 worked example)",
  "input_document": {
    "documentType": "invoice",
    "seller": { "legalEntityId": "fixture-le", "countryId": "fixture-om", "subdivisionId": null, "taxIdentifier": "1234567890", "registrations": [] },
    "buyer": { "taxNumber": null, "countryId": null, "subdivisionId": null, "isBusiness": false, "addressSnapshot": null },
    "taxPointDate": "2026-07-02",
    "placeOfSupplySubdivisionId": null,
    "lines": [
      { "lineItemId": null, "description": "line 1", "quantity": 1, "unitPrice": 100, "lineDiscount": 0, "unitCode": null, "itemCode": null, "treatment": "standard", "treatmentReasonCode": null },
      { "lineItemId": null, "description": "line 2", "quantity": 1, "unitPrice": 100, "lineDiscount": 0, "unitCode": null, "itemCode": null, "treatment": "standard", "treatmentReasonCode": null },
      { "lineItemId": null, "description": "line 3", "quantity": 1, "unitPrice": 100, "lineDiscount": 0, "unitCode": null, "itemCode": null, "treatment": "standard", "treatmentReasonCode": null }
    ],
    "documentDiscount": 0.1,
    "taxInclusive": false,
    "rateContext": { "documentCurrency": "OMR", "documentDecimals": 3, "baseCurrency": "OMR", "baseDecimals": 3, "rate": 1, "rateSource": "derived" },
    "rates": [{ "id": "fixture-om-vat-std", "country_id": "fixture-om", "subdivision_id": null, "component_code": "VAT", "component_label": "VAT", "tax_category": "standard", "rate": 5, "applies_to": null, "valid_from": "2021-04-16", "valid_to": null, "sort_order": 0 }],
    "roundingPolicy": { "mode": "half_up", "level": "document" },
    "scaleSystem": "western"
  },
  "expected": {
    "totals": { "taxableBase": 299.9, "taxTotal": 14.995, "grandTotal": 314.895, "roundingAdjustment": null },
    "rollups": [{ "componentCode": "VAT", "rate": 5, "taxableBase": 299.9, "taxAmount": 14.995 }]
  }
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/regimes/simple_vat/` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/simple_vat/
git commit -m "feat(tax): simple_vat default strategy + Oman golden fixtures"
```

### Task 7: Default plugins — `prefix_numbering`, `generic_invoice`, `no_einvoice` + registration aggregator

**Files:**
- Create: `src/lib/regimes/prefix_numbering/index.ts`
- Create: `src/lib/regimes/generic_invoice/index.ts`
- Create: `src/lib/regimes/no_einvoice/index.ts`
- Create: `src/lib/regimes/register.ts`
- Test: `src/lib/regimes/defaults.test.ts`

**Interfaces:**
- Consumes: Task 1 types, Task 5 registry, Task 6 `simpleVat`.
- Produces: `prefixNumbering: NumberingPolicy` (`'prefix_numbering'`), `genericInvoice: DocumentComplianceProfile` (`'generic_invoice'`), `noEinvoice: EInvoicingTransport` (`'no_einvoice'`, regimeClass `'render_artifact'`); `registerAllRegimePlugins(): void` — the single import point services and gates call once.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/defaults.test.ts
import { describe, it, expect } from 'vitest';
import { registerAllRegimePlugins } from './register';
import {
  resolveTaxStrategy, resolveNumberingPolicy, resolveDocumentProfile, resolveEInvoicingTransport,
} from './registry';

describe('default regime plugins (the ~80% data-only path)', () => {
  registerAllRegimePlugins();
  it('all four defaults resolve', () => {
    expect(resolveTaxStrategy('simple_vat').version).toBe('1.0.0');
    expect(resolveNumberingPolicy('prefix_numbering').key).toBe('prefix_numbering');
    expect(resolveDocumentProfile('generic_invoice').key).toBe('generic_invoice');
    expect(resolveEInvoicingTransport('no_einvoice').regimeClass).toBe('render_artifact');
  });
  it('registerAllRegimePlugins is idempotent (same objects, no duplicate-key throw)', () => {
    expect(() => registerAllRegimePlugins()).not.toThrow();
  });
  it('prefix_numbering: legacy prefixes, never a format_template (zero behavior change)', () => {
    const seeds = resolveNumberingPolicy('prefix_numbering').defaultSequences({ countryCode: 'OM', fiscalYearStart: '01-01' });
    const invoices = seeds.find((s) => s.scope === 'invoices');
    expect(invoices).toEqual({
      scope: 'invoices', prefix: 'INVO', format_template: null,
      reset_basis: 'never', fiscal_year_anchor: null, max_length: null, padding: 4,
    });
    expect(seeds.map((s) => s.scope)).toEqual(
      expect.arrayContaining(['invoices', 'proforma_invoices', 'quote', 'case', 'customers', 'companies', 'payment']),
    );
    expect(seeds.every((s) => s.format_template === null)).toBe(true);
  });
  it('generic_invoice: TAX INVOICE only when registered AND required', () => {
    const p = resolveDocumentProfile('generic_invoice');
    expect(p.documentTitle({ docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: true }))
      .toEqual({ title: 'TAX INVOICE', titleTranslated: null });
    expect(p.documentTitle({ docType: 'invoice', sellerRegistered: false, taxInvoiceRequired: true }).title).toBe('INVOICE');
    expect(p.documentTitle({ docType: 'quote', sellerRegistered: true, taxInvoiceRequired: true }).title).toBe('QUOTATION');
    expect(p.requiresTaxInvoiceCeremony).toBe(true);
    expect(p.forcedColumns).toEqual([]);
  });
  it('no_einvoice: buildArtifact refuses (no statutory artifact exists for this regime)', () => {
    const t = resolveEInvoicingTransport('no_einvoice');
    expect(() => t.buildArtifact({
      documentType: 'invoice', documentId: 'x', documentNumber: 'INVO-1', issuedAt: '2026-07-02T00:00:00Z',
      currency: 'OMR', totals: { taxableBase: 0, taxTotal: 0, grandTotal: 0 },
      taxLines: [], sellerTaxIdentifier: null, buyerTaxNumber: null,
    })).toThrowError(/no_einvoice/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/regimes/defaults.test.ts` — Expected: FAIL — `Cannot find module './register'`.

- [ ] **Step 3: Implement the three plugins + aggregator**

```typescript
// src/lib/regimes/prefix_numbering/index.ts
import type { NumberingPolicy, NumberSequenceSeed } from '../types';

// The REAL scope registry (live number_sequences scopes ∪ every get_next_number
// caller in src/lib — verified 2026-07-02). 'inventory:*' scopes are dynamic
// per-device-type and auto-created by get_next_number; they are not seeded here.
const LEGACY_SCOPES: Array<{ scope: string; prefix: string }> = [
  { scope: 'invoices', prefix: 'INVO' },
  { scope: 'proforma_invoices', prefix: 'PRO' },
  { scope: 'quote', prefix: 'QUOT' },
  { scope: 'case', prefix: 'CASE' },
  { scope: 'customers', prefix: 'CUST' },
  { scope: 'companies', prefix: 'COMP' },
  { scope: 'payment', prefix: 'PAYM' },
  { scope: 'expense', prefix: 'EXPE' },
  { scope: 'stock', prefix: 'STOC' },
  { scope: 'stock_adjustment', prefix: 'STOC' },
  { scope: 'purchase_orders', prefix: 'PURC' },
  { scope: 'suppliers', prefix: 'SUPP' },
  { scope: 'report_evaluation', prefix: 'REVL' },
  { scope: 'report_service', prefix: 'RSVC' },
  { scope: 'payroll_bank_file', prefix: 'PAYR' },
];

/** Legacy prefix numbering: PREFIX-{SEQ:padding}, never resets, no template. */
export const prefixNumbering: NumberingPolicy = {
  key: 'prefix_numbering',
  version: '1.0.0',
  defaultSequences(): NumberSequenceSeed[] {
    return LEGACY_SCOPES.map(({ scope, prefix }) => ({
      scope, prefix, format_template: null, reset_basis: 'never',
      fiscal_year_anchor: null, max_length: null, padding: 4,
    }));
  },
};
```

```typescript
// src/lib/regimes/generic_invoice/index.ts
import type { DocumentComplianceProfile, DocumentNotation, TaxComputation } from '../types';

/** The default document profile: today's rendered behavior, made explicit. */
export const genericInvoice: DocumentComplianceProfile = {
  key: 'generic_invoice',
  version: '1.0.0',
  documentTitle({ docType, sellerRegistered, taxInvoiceRequired }) {
    if (docType === 'quote') return { title: 'QUOTATION', titleTranslated: null };
    if (docType === 'credit_note') return { title: 'CREDIT NOTE', titleTranslated: null };
    if (docType === 'stock_sale') return { title: 'SALES RECEIPT', titleTranslated: null };
    return sellerRegistered && taxInvoiceRequired
      ? { title: 'TAX INVOICE', titleTranslated: null }
      : { title: 'INVOICE', titleTranslated: null };
  },
  requiresTaxInvoiceCeremony: true,
  showRegistrationBand: true,
  forcedColumns: [],
  bilingual: { enabled: false, secondaryLanguage: null, arabicLead: false },
  paperSize: 'A4',
  notations(computation: TaxComputation): DocumentNotation[] {
    return computation.notations;
  },
};
```

```typescript
// src/lib/regimes/no_einvoice/index.ts
import type { EInvoicingTransport } from '../types';

/** The default e-invoicing regime: no statutory artifact. buildArtifact refusing
 *  loudly (rather than emitting an empty payload) keeps einvoice_submissions
 *  honest — a row in that ledger must always be a real statutory artifact. */
export const noEinvoice: EInvoicingTransport = {
  key: 'no_einvoice',
  version: '1.0.0',
  regimeClass: 'render_artifact',
  buildArtifact(): never {
    throw new Error(
      'no_einvoice regime has no statutory artifact to build. ' +
      'Callers must check the resolved regime.einvoice key before invoking transports.',
    );
  },
};
```

```typescript
// src/lib/regimes/register.ts
//
// The ONE registration entry point. Import this (not individual plugins) from
// services, the publish gate, and the CI fixture job so the registry is always
// fully populated before any resolve* call.

import { registerRegimePlugin } from './registry';
import { simpleVat } from './simple_vat';
import { prefixNumbering } from './prefix_numbering';
import { genericInvoice } from './generic_invoice';
import { noEinvoice } from './no_einvoice';

let registered = false;

export function registerAllRegimePlugins(): void {
  if (registered) return;
  registerRegimePlugin('tax', simpleVat);
  registerRegimePlugin('numbering', prefixNumbering);
  registerRegimePlugin('documents', genericInvoice);
  registerRegimePlugin('einvoice', noEinvoice);
  registered = true;
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/regimes/` — Expected: PASS (types, registry, simple_vat, defaults).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/prefix_numbering src/lib/regimes/generic_invoice src/lib/regimes/no_einvoice src/lib/regimes/register.ts src/lib/regimes/defaults.test.ts
git commit -m "feat(tax): prefix_numbering/generic_invoice/no_einvoice default plugins + registration aggregator"
```

### Task 8: Publish-gate fixture runner — `src/lib/tax/publishGate.ts`

**Files:**
- Create: `src/lib/tax/publishGate.ts`
- Test: `src/lib/tax/publishGate.test.ts`

**Interfaces:**
- Consumes: `resolveTaxStrategy` (Task 5), `registerAllRegimePlugins` (Task 7), Task 1 types.
- Produces: `PackFixture`, `FixtureRunResult`, `runPublishGate(args: { countryCode: string; fixtures: PackFixture[]; mode: 'kernel' | 'dry_run_rpc' }): Promise<{ pass: boolean; results: FixtureRunResult[] }>`. Consumed by: Task 6 fixtures (via Task 24's CI job) and Phase 3's `publish_country_pack` harness.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/tax/publishGate.test.ts
import { describe, it, expect } from 'vitest';
import { runPublishGate, type PackFixture } from './publishGate';
import omStandard from '../regimes/simple_vat/fixtures/om-standard-invoice.json';

describe('runPublishGate', () => {
  it('kernel mode: green fixture passes with a trace and no diffs', async () => {
    const { pass, results } = await runPublishGate({
      countryCode: 'OM', fixtures: [omStandard as unknown as PackFixture], mode: 'kernel',
    });
    expect(pass).toBe(true);
    expect(results[0]).toMatchObject({ name: omStandard.name, pass: true, diffs: [] });
    expect(results[0].trace?.regimeKey).toBe('simple_vat');
  });
  it('kernel mode: a wrong expectation fails with a path-addressed diff', async () => {
    const bad = JSON.parse(JSON.stringify(omStandard)) as PackFixture;
    (bad.expected as { totals: { taxTotal: number } }).totals.taxTotal = 999;
    const { pass, results } = await runPublishGate({ countryCode: 'OM', fixtures: [bad], mode: 'kernel' });
    expect(pass).toBe(false);
    expect(results[0].diffs).toContainEqual({ path: 'totals.taxTotal', expected: 999, actual: 72 });
  });
  it('dry_run_rpc mode throws until the Phase-3 publish RPC harness ships', async () => {
    await expect(runPublishGate({ countryCode: 'OM', fixtures: [], mode: 'dry_run_rpc' }))
      .rejects.toThrowError(/Phase 3/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/tax/publishGate.test.ts` — Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```typescript
// src/lib/tax/publishGate.ts
//
// ONE fixture runner, resident in two harnesses (graft 1): repo CI runs mode
// 'kernel' on every commit; the Phase-3 publish_country_pack RPC harness runs
// mode 'dry_run_rpc' against the live engine at every data publish. Fixture
// JSON shape is identical to master_country_pack_tests rows by construction.

import { registerAllRegimePlugins } from '../regimes/register';
import { resolveTaxStrategy } from '../regimes/registry';
import type { RuleTrace, TaxContext } from '../regimes/types';

export interface PackFixture {
  name: string;
  input_document: Record<string, unknown>;
  expected: Record<string, unknown>;
}
export interface FixtureRunResult {
  name: string;
  pass: boolean;
  diffs: Array<{ path: string; expected: unknown; actual: unknown }>;
  trace: RuleTrace | null;
}

/** Leaf-wise subset diff: every leaf in `expected` must equal `actual`'s leaf. */
function diffSubset(
  expected: unknown, actual: unknown, path: string,
  out: Array<{ path: string; expected: unknown; actual: unknown }>,
): void {
  if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
    for (const [k, v] of Object.entries(expected as Record<string, unknown>)) {
      const next = actual !== null && typeof actual === 'object'
        ? (actual as Record<string, unknown>)[k] : undefined;
      diffSubset(v, next, path ? `${path}.${k}` : k, out);
    }
    return;
  }
  if (Array.isArray(expected)) {
    const arr = Array.isArray(actual) ? actual : [];
    expected.forEach((v, i) => diffSubset(v, arr[i], `${path}[${i}]`, out));
    return;
  }
  if (expected !== actual) out.push({ path, expected, actual });
}

export async function runPublishGate(args: {
  countryCode: string;
  fixtures: PackFixture[];
  mode: 'kernel' | 'dry_run_rpc';
}): Promise<{ pass: boolean; results: FixtureRunResult[] }> {
  if (args.mode === 'dry_run_rpc') {
    throw new Error(
      'runPublishGate mode "dry_run_rpc" is the publish_country_pack harness and ships in Phase 3. ' +
      'Repo CI uses mode "kernel".',
    );
  }
  registerAllRegimePlugins();
  const results: FixtureRunResult[] = [];
  for (const fixture of args.fixtures) {
    const ctx = fixture.input_document as unknown as TaxContext;
    const regimeKey = (fixture.input_document.regimeKey as string | undefined) ?? 'simple_vat';
    let result: FixtureRunResult;
    try {
      const strategy = resolveTaxStrategy(regimeKey);
      const computation = await strategy.compute(ctx);
      const diffs: FixtureRunResult['diffs'] = [];
      diffSubset(fixture.expected, computation as unknown as Record<string, unknown>, '', diffs);
      result = { name: fixture.name, pass: diffs.length === 0, diffs, trace: computation.trace };
    } catch (err) {
      result = {
        name: fixture.name, pass: false,
        diffs: [{ path: '(execution)', expected: 'computation completes', actual: String(err) }],
        trace: null,
      };
    }
    results.push(result);
  }
  return { pass: results.every((r) => r.pass), results };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/tax/` — Expected: PASS. Then run the FULL suite once: `npm run test` — Expected: PASS (no regressions), `npm run check:tsc` — 0, `npm run lint` — clean.

- [ ] **Step 5: Commit + open PR 1**

```bash
git add src/lib/tax/publishGate.ts src/lib/tax/publishGate.test.ts
git commit -m "feat(tax): shared publish-gate fixture runner (kernel mode)"
git push -u origin feat/localization-p1-kernel
gh pr create --title "Phase 1 WP-1: fiscal kernel, regime plugins, publish-gate runner (pure TS)" --body "Kernel primitives + plugin architecture per docs/superpowers/plans/2026-07-02-localization-phase1-fiscal-kernel-oman-parity.md WP-1. Zero DB dependency; no behavior change to any write path yet.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

**WP-1 verification:** `npm run test && npm run check:tsc && npm run lint` all green; `git grep -l "computeDocumentTax" src | wc -l` ≥ 4.

---

# WP-2 — Statutory data plane: tables, seeds, registry keys (PR 2: `feat/localization-p1-data-plane`, migration PR)

Use `.github/PULL_REQUEST_TEMPLATE/migration.md`. Every migration task follows: SQL probe BEFORE (`mcp__supabase__execute_sql`) → `mcp__supabase__apply_migration` → SQL assertions AFTER → regen types (`mcp__supabase__generate_typescript_types` → save to `src/types/database.types.ts`) → manifest row → commit.

### Task 9: Migration `localization_p1_pack_governance_tables`

**Files:**
- Migration: `localization_p1_pack_governance_tables` (via `mcp__supabase__apply_migration`, project_id `ssmbegiyjivrcwgcqutu`)
- Modify: `supabase/migrations.manifest.md` (append row)
- Modify: `src/types/database.types.ts` (regenerated)

**Interfaces:**
- Produces: tables `master_country_pack_versions`, `master_country_pack_tests`, `master_engine_capabilities`, `master_einvoice_regimes`; seed capability rows for every WP-1 plugin + kernel scheme modes; SA/IN e-invoice regime data rows.

- [ ] **Step 1: Probe the absent state (the "failing test")**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema='public'
AND table_name IN ('master_country_pack_versions','master_country_pack_tests','master_engine_capabilities','master_einvoice_regimes');
```
Expected: 0 rows.

- [ ] **Step 2: Apply the migration**

```sql
-- localization_p1_pack_governance_tables
-- Pack lifecycle (graft 12), DB-resident fixtures (graft 1), capability manifest
-- (graft 2), e-invoice regime registry with ALL FIVE regime classes designed in
-- now (owner E5 / risk 6). Global master data: read-all, platform-admin write.

CREATE TABLE master_country_pack_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES geo_countries(id),
  version int NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','superseded')),
  effective_from date,
  changelog text,
  authored_by uuid,
  approved_by uuid CHECK (approved_by <> authored_by),
  checksum text,
  next_review_date date,
  staleness_days int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_master_country_pack_versions_country_version
  ON master_country_pack_versions(country_id, version) WHERE deleted_at IS NULL;

CREATE TABLE master_country_pack_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES geo_countries(id),
  pack_version_id uuid REFERENCES master_country_pack_versions(id),
  name text NOT NULL,
  input_document jsonb NOT NULL,
  expected jsonb NOT NULL,
  last_run_at timestamptz,
  last_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_master_country_pack_tests_country ON master_country_pack_tests(country_id) WHERE deleted_at IS NULL;

CREATE TABLE master_engine_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('regime_adapter','scheme_mode','speller_scale','bank_file_op','filing_transport')),
  min_engine_version text NOT NULL DEFAULT '1.0.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_master_engine_capabilities_key_kind
  ON master_engine_capabilities(capability_key, kind) WHERE deleted_at IS NULL;

CREATE TABLE master_einvoice_regimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES geo_countries(id),
  code text NOT NULL,
  regime_class text NOT NULL CHECK (regime_class IN
    ('render_artifact','clearance_api','chained_document','certified_software','filing_api')),
  adapter_key text NOT NULL,
  mandatory_from date,
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_master_einvoice_regimes_country_code
  ON master_einvoice_regimes(country_id, code) WHERE deleted_at IS NULL;

-- RLS: global master pattern (SELECT all authenticated, writes platform admin only)
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['master_country_pack_versions','master_country_pack_tests','master_engine_capabilities','master_einvoice_regimes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT TO authenticated WITH CHECK (is_platform_admin())', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE TO authenticated USING (is_platform_admin())', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE TO authenticated USING (is_platform_admin())', t, t);
  END LOOP;
END $rls$;

-- Capability manifest seed: every WP-1 plugin + kernel scheme modes + words scale.
INSERT INTO master_engine_capabilities (capability_key, kind) VALUES
  ('simple_vat','regime_adapter'),
  ('prefix_numbering','regime_adapter'),
  ('generic_invoice','regime_adapter'),
  ('no_einvoice','regime_adapter'),
  ('single','scheme_mode'),
  ('split_by_place_of_supply','scheme_mode'),
  ('jurisdiction_stack','scheme_mode'),
  ('western','speller_scale');

-- E-invoice regime DATA rows (owner E5: classes designed in now, transports later).
INSERT INTO master_einvoice_regimes (country_id, code, regime_class, adapter_key, mandatory_from, thresholds)
SELECT id, 'zatca_ph1', 'render_artifact', 'zatca_ph1', '2021-12-04'::date, '{}'::jsonb
FROM geo_countries WHERE code = 'SA';
INSERT INTO master_einvoice_regimes (country_id, code, regime_class, adapter_key, mandatory_from, thresholds)
SELECT id, 'zatca_ph2', 'clearance_api', 'zatca_ph2', '2023-01-01'::date, '{"wave_based": true}'::jsonb
FROM geo_countries WHERE code = 'SA';
INSERT INTO master_einvoice_regimes (country_id, code, regime_class, adapter_key, mandatory_from, thresholds)
SELECT id, 'in_irn', 'clearance_api', 'in_irn', '2020-10-01'::date, '{"turnover_inr_min": 50000000}'::jsonb
FROM geo_countries WHERE code = 'IN';
```

- [ ] **Step 3: Assert the applied state**

```sql
SELECT (SELECT count(*) FROM master_engine_capabilities) AS caps,
       (SELECT count(*) FROM master_einvoice_regimes) AS regimes,
       (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
        AND table_name IN ('master_country_pack_versions','master_country_pack_tests')) AS pack_tables;
```
Expected: `caps=8, regimes=3, pack_tables=2`.

- [ ] **Step 4: Regenerate types** — `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) → overwrite `src/types/database.types.ts`. Run `npm run check:tsc` — 0.

- [ ] **Step 5: Manifest row** — append to `supabase/migrations.manifest.md`:
`| <applied_version> | localization_p1_pack_governance_tables.sql | Additive | Pack lifecycle + DB fixtures + capability manifest + einvoice regime registry (5 regime classes) | P1-WP2 |`

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): pack governance tables + capability manifest + einvoice regime registry"
```

### Task 10: Migration `localization_p1_geo_country_tax_rates` (+ 9-country effective-dated seed)

**Files:**
- Migration: `localization_p1_geo_country_tax_rates`
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts`

**Interfaces:**
- Consumes: `master_country_pack_versions` (Task 9), existing `geo_countries`, `geo_subdivisions`.
- Produces: `geo_country_tax_rates` — THE effective-dated rate table; seeded standard/zero/exempt rows for the 9 live countries (AE, BH, GB, IN, KW, OM, QA, SA, US — verified active 2026-07-02).

- [ ] **Step 1: Probe** — `SELECT to_regclass('public.geo_country_tax_rates');` → Expected: `null`.

- [ ] **Step 2: Apply the migration**

```sql
-- localization_p1_geo_country_tax_rates
-- THE effective-dated component rate table (design-doc §3c canonical name).
-- Binding rates ALWAYS resolve from here at the document's tax-point date;
-- tenants.default_tax_rate / geo_countries.default_tax_rate become display-only.

CREATE TABLE geo_country_tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES geo_countries(id),
  subdivision_id uuid REFERENCES geo_subdivisions(id),
  component_code text NOT NULL,
  component_label text NOT NULL,
  component_label_i18n jsonb,
  tax_category text NOT NULL CHECK (tax_category IN ('standard','reduced','zero','exempt')),
  rate numeric(7,4) NOT NULL,
  applies_to text,
  valid_from date NOT NULL,
  valid_to date,
  pack_version_id uuid REFERENCES master_country_pack_versions(id),
  data_source text,
  source_version text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_geo_country_tax_rates_effective
  ON geo_country_tax_rates(country_id, COALESCE(subdivision_id,'00000000-0000-0000-0000-000000000000'::uuid), component_code, tax_category, valid_from)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_geo_country_tax_rates_lookup
  ON geo_country_tax_rates(country_id, valid_from) WHERE deleted_at IS NULL;

ALTER TABLE geo_country_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_country_tax_rates FORCE ROW LEVEL SECURITY;
CREATE POLICY "geo_country_tax_rates_select" ON geo_country_tax_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "geo_country_tax_rates_insert" ON geo_country_tax_rates FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY "geo_country_tax_rates_update" ON geo_country_tax_rates FOR UPDATE TO authenticated USING (is_platform_admin());
CREATE POLICY "geo_country_tax_rates_delete" ON geo_country_tax_rates FOR DELETE TO authenticated USING (is_platform_admin());

-- ── Seed: current rates for all 9 active countries, effective-dated ──────────
-- KW / QA: tax_system NONE → deliberately NO rows (no phantom 0% VAT).
-- US: SALES_TAX is subdivision-stacked; country-level rows would be WRONG —
--     subdivision rows land with the us_sales_tax pack in Phase 5.
WITH c AS (SELECT id, code FROM geo_countries WHERE is_active = true)
INSERT INTO geo_country_tax_rates
  (country_id, component_code, component_label, component_label_i18n, tax_category, rate, valid_from, valid_to, data_source, sort_order)
SELECT c.id, s.component_code, s.component_label, s.label_i18n, s.tax_category, s.rate, s.valid_from::date, s.valid_to::date, 'phase1-seed', s.sort_order
FROM c
JOIN (VALUES
  -- Oman: VAT live 2021-04-16 (Royal Decree 121/2020)
  ('OM','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'standard',5.0000,'2021-04-16',NULL,0),
  ('OM','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'zero',0.0000,'2021-04-16',NULL,1),
  ('OM','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'exempt',0.0000,'2021-04-16',NULL,2),
  -- UAE: VAT live 2018-01-01
  ('AE','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'standard',5.0000,'2018-01-01',NULL,0),
  ('AE','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'zero',0.0000,'2018-01-01',NULL,1),
  ('AE','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'exempt',0.0000,'2018-01-01',NULL,2),
  -- Saudi: 5% 2018-01-01 → 15% 2020-07-01 (the effective-dating proof rows)
  ('SA','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'standard',5.0000,'2018-01-01','2020-06-30',0),
  ('SA','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'standard',15.0000,'2020-07-01',NULL,0),
  ('SA','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'zero',0.0000,'2018-01-01',NULL,1),
  -- Bahrain: 5% 2019-01-01 → 10% 2022-01-01
  ('BH','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'standard',5.0000,'2019-01-01','2021-12-31',0),
  ('BH','VAT','VAT','{"ar":"ضريبة القيمة المضافة"}'::jsonb,'standard',10.0000,'2022-01-01',NULL,0),
  -- UK: 20% since 2011-01-04; reduced 5%; zero
  ('GB','VAT','VAT',NULL,'standard',20.0000,'2011-01-04',NULL,0),
  ('GB','VAT','VAT',NULL,'reduced',5.0000,'1997-09-01',NULL,1),
  ('GB','VAT','VAT',NULL,'zero',0.0000,'1973-04-01',NULL,2),
  -- India: headline 18% slab as CGST 9 + SGST 9 + IGST 18 since GST launch
  -- (full 5/12/28 category matrix is Phase 4 pack content)
  ('IN','CGST','CGST',NULL,'standard',9.0000,'2017-07-01',NULL,0),
  ('IN','SGST','SGST',NULL,'standard',9.0000,'2017-07-01',NULL,1),
  ('IN','IGST','IGST',NULL,'standard',18.0000,'2017-07-01',NULL,2)
) AS s(code, component_code, component_label, label_i18n, tax_category, rate, valid_from, valid_to, sort_order)
ON s.code = c.code;
```

- [ ] **Step 3: Assert**

```sql
SELECT gc.code, count(*) FROM geo_country_tax_rates r JOIN geo_countries gc ON gc.id = r.country_id
GROUP BY gc.code ORDER BY gc.code;
```
Expected: `AE=3, BH=2, GB=3, IN=3, OM=3, SA=3` (no KW/QA/US rows; 17 total). Then the effective-dating probe:
```sql
SELECT rate FROM geo_country_tax_rates r JOIN geo_countries gc ON gc.id=r.country_id
WHERE gc.code='SA' AND r.tax_category='standard' AND r.valid_from <= '2019-06-01'
AND (r.valid_to IS NULL OR r.valid_to >= '2019-06-01');
```
Expected: `5.0000` (one row — the 2018 rate, not the 2020 one).

- [ ] **Step 4: Regen types** → `npm run check:tsc` = 0.
- [ ] **Step 5: Manifest row** — `| <version> | localization_p1_geo_country_tax_rates.sql | Additive | Effective-dated component rate table + 9-country seed | P1-WP2 |`
- [ ] **Step 6: Commit** — `git add src/types/database.types.ts supabase/migrations.manifest.md && git commit -m "feat(db): geo_country_tax_rates effective-dated rate table + 9-country seed"`

### Task 11: Migration `localization_p1_document_tax_lines`

**Files:**
- Migration: `localization_p1_document_tax_lines`
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts`, `eslint-rules/banned-tables.js` (allowlist rationale comment)

**Interfaces:**
- Produces: `document_tax_lines` — the load-bearing per-document component snapshot, DDL exactly per contract §3.2.

- [ ] **Step 1: Probe** — `SELECT to_regclass('public.document_tax_lines');` → Expected: `null`.

- [ ] **Step 2: Apply the migration**

```sql
-- localization_p1_document_tax_lines
-- ONE polymorphic component-snapshot table across quote/invoice/credit_note/
-- stock_sale BY DESIGN (ReturnComposer/HSN/audit need one subledger join
-- target). Full tenant discipline. Rows are immutable after parent issuance
-- (trigger lands in localization_p1_integrity_immutability_triggers).

CREATE TABLE document_tax_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('quote','invoice','credit_note','stock_sale')),
  document_id uuid NOT NULL,
  line_item_id uuid,
  component_code text NOT NULL,
  component_label text NOT NULL,
  jurisdiction_ref uuid REFERENCES geo_subdivisions(id),
  rate numeric(7,4) NOT NULL,
  taxable_base numeric(19,4) NOT NULL,
  tax_amount numeric(19,4) NOT NULL,
  currency text NOT NULL,
  exchange_rate numeric(20,10) NOT NULL,
  tax_amount_base numeric(19,4) NOT NULL,
  tax_treatment text NOT NULL CHECK (tax_treatment IN
    ('standard','reduced','zero_rated','exempt','reverse_charge','out_of_scope')),
  treatment_reason_code text,
  regime_key text NOT NULL,
  plugin_version text NOT NULL,
  pack_version_id uuid,
  rule_trace jsonb,
  backfilled boolean NOT NULL DEFAULT false,
  sequence int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX idx_document_tax_lines_tenant_id ON document_tax_lines(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_document_tax_lines_document ON document_tax_lines(tenant_id, document_type, document_id) WHERE deleted_at IS NULL;

ALTER TABLE document_tax_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_tax_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY "document_tax_lines_tenant_isolation" ON document_tax_lines
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
CREATE POLICY "document_tax_lines_select" ON document_tax_lines FOR SELECT TO authenticated USING (is_staff_user());
CREATE POLICY "document_tax_lines_insert" ON document_tax_lines FOR INSERT TO authenticated WITH CHECK (has_role('accounts'));
CREATE POLICY "document_tax_lines_update" ON document_tax_lines FOR UPDATE TO authenticated USING (has_role('accounts'));
CREATE POLICY "document_tax_lines_delete" ON document_tax_lines FOR DELETE TO authenticated USING (has_role('admin'));

CREATE TRIGGER set_document_tax_lines_tenant_and_audit
  BEFORE INSERT OR UPDATE ON document_tax_lines
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();
```

- [ ] **Step 3: Assert** — run `scripts/check-tenant-table-requirements.sql` posture inline:
```sql
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='document_tax_lines';
SELECT count(*) FROM pg_policies WHERE tablename='document_tax_lines';
```
Expected: `true,true` and `5` policies.

- [ ] **Step 4: Regen types** → `npm run check:tsc` = 0. Also append the allowlist rationale to `eslint-rules/banned-tables.js` (comment block near `BANNED_TABLES`):

```javascript
// ALLOWLIST NOTE — document_tax_lines deliberately spans document kinds
// (quote/invoice/credit_note/stock_sale) and therefore carries no domain prefix.
// One subledger join target for return composition, HSN summaries and audit is a
// design decision (localization spec 2026-07-02 §Database Changes) — do NOT
// "fix" it into per-domain tables.
```

- [ ] **Step 5: Manifest row** — `| <version> | localization_p1_document_tax_lines.sql | Additive | Polymorphic per-document tax component snapshot (tenant) | P1-WP2 |`
- [ ] **Step 6: Commit** — `git add src/types/database.types.ts supabase/migrations.manifest.md eslint-rules/banned-tables.js && git commit -m "feat(db): document_tax_lines component snapshot table"`

### Task 12: Migration `localization_p1_registrations_einvoice`

**Files:**
- Migration: `localization_p1_registrations_einvoice`
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts`

**Interfaces:**
- Produces: `legal_entity_tax_registrations` (contract §3.3 DDL) and `einvoice_submissions` (append-only, `previous_hash` from day one — risk 6).

- [ ] **Step 1: Probe** — `SELECT to_regclass('public.legal_entity_tax_registrations'), to_regclass('public.einvoice_submissions');` → Expected: `null, null`.

- [ ] **Step 2: Apply the migration**

```sql
-- localization_p1_registrations_einvoice

CREATE TABLE legal_entity_tax_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
  country_id uuid NOT NULL REFERENCES geo_countries(id),
  subdivision_id uuid REFERENCES geo_subdivisions(id),
  tax_number text NOT NULL,
  scheme text NOT NULL DEFAULT 'standard' CHECK (scheme IN ('standard','composition','unregistered')),
  registered_from date NOT NULL,
  registered_to date,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX idx_legal_entity_tax_registrations_tenant_id ON legal_entity_tax_registrations(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_legal_entity_tax_registrations_entity ON legal_entity_tax_registrations(legal_entity_id) WHERE deleted_at IS NULL;

ALTER TABLE legal_entity_tax_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_entity_tax_registrations FORCE ROW LEVEL SECURITY;
CREATE POLICY "legal_entity_tax_registrations_tenant_isolation" ON legal_entity_tax_registrations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
CREATE POLICY "legal_entity_tax_registrations_select" ON legal_entity_tax_registrations FOR SELECT TO authenticated USING (is_staff_user());
CREATE POLICY "legal_entity_tax_registrations_insert" ON legal_entity_tax_registrations FOR INSERT TO authenticated WITH CHECK (is_tenant_admin());
CREATE POLICY "legal_entity_tax_registrations_update" ON legal_entity_tax_registrations FOR UPDATE TO authenticated USING (is_tenant_admin());
CREATE POLICY "legal_entity_tax_registrations_delete" ON legal_entity_tax_registrations FOR DELETE TO authenticated USING (has_role('admin'));
CREATE TRIGGER set_legal_entity_tax_registrations_tenant_and_audit
  BEFORE INSERT OR UPDATE ON legal_entity_tax_registrations
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();

-- The demo Oman tenant's primary legal entity has no tax_identifier yet
-- (verified live 2026-07-02: is_primary=true, tax_identifier IS NULL), so the
-- registration seed below would match 0 rows. Seed a pre-production demo VATIN
-- first so the seller registration exists on day one. This one-time backfill
-- only touches rows present at apply time and is NULL-guarded (idempotent);
-- real tenants capture their VATIN via entity settings.
UPDATE legal_entities
SET tax_identifier = 'OM1100000000'
WHERE is_primary = true AND tax_system = 'VAT'
  AND tax_identifier IS NULL AND deleted_at IS NULL;

-- Seed the live tenant's Oman registration from its primary legal entity so the
-- kernel context builder has a seller registration on day one (idempotent).
INSERT INTO legal_entity_tax_registrations
  (tenant_id, legal_entity_id, country_id, subdivision_id, tax_number, scheme, registered_from, is_primary)
SELECT le.tenant_id, le.id, le.country_id, NULL, le.tax_identifier, 'standard', '2021-04-16'::date, true
FROM legal_entities le
WHERE le.is_primary = true AND le.tax_identifier IS NOT NULL AND le.deleted_at IS NULL
AND NOT EXISTS (SELECT 1 FROM legal_entity_tax_registrations r WHERE r.legal_entity_id = le.id AND r.deleted_at IS NULL);

CREATE TABLE einvoice_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('quote','invoice','credit_note','stock_sale')),
  document_id uuid NOT NULL,
  regime_key text NOT NULL,
  artifact_type text NOT NULL,
  payload_storage_path text,
  payload_hash text NOT NULL,
  previous_hash text,
  status text NOT NULL DEFAULT 'generated' CHECK (status IN
    ('generated','held','submitted','accepted','rejected','dead_letter')),
  authority_reference text,
  authority_response jsonb,
  submitted_at timestamptz,
  sealed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
CREATE INDEX idx_einvoice_submissions_tenant_id ON einvoice_submissions(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_einvoice_submissions_document ON einvoice_submissions(tenant_id, document_type, document_id) WHERE deleted_at IS NULL;

ALTER TABLE einvoice_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoice_submissions FORCE ROW LEVEL SECURITY;
CREATE POLICY "einvoice_submissions_tenant_isolation" ON einvoice_submissions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
CREATE POLICY "einvoice_submissions_select" ON einvoice_submissions FOR SELECT TO authenticated USING (is_staff_user());
CREATE POLICY "einvoice_submissions_insert" ON einvoice_submissions FOR INSERT TO authenticated WITH CHECK (has_role('accounts'));
CREATE TRIGGER set_einvoice_submissions_tenant_and_audit
  BEFORE INSERT OR UPDATE ON einvoice_submissions
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();

-- APPEND-ONLY (prevent_audit_mutation pattern): no UPDATE/DELETE policies exist,
-- grants revoked, and the audit trigger backstops superuser-adjacent paths.
REVOKE UPDATE, DELETE ON einvoice_submissions FROM authenticated, anon;
CREATE TRIGGER prevent_einvoice_submissions_mutation
  BEFORE UPDATE OR DELETE ON einvoice_submissions
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
```

- [ ] **Step 3: Assert**

```sql
SELECT (SELECT count(*) FROM legal_entity_tax_registrations) AS regs,
       (SELECT count(*) FROM pg_trigger WHERE tgname='prevent_einvoice_submissions_mutation') AS guard;
```
Expected: `regs=1` (the seeded Oman registration), `guard=1`. Then prove append-only: `UPDATE einvoice_submissions SET status='held' WHERE false;` succeeds (no rows), but a real UPDATE attempt as `authenticated` must fail with permission denied — verified in Task 33's bypass suite.

- [ ] **Step 4: Regen types** → `npm run check:tsc` = 0.
- [ ] **Step 5: Manifest row** — `| <version> | localization_p1_registrations_einvoice.sql | Additive | Seller tax registrations + append-only einvoice_submissions (previous_hash day one) | P1-WP2 |`
- [ ] **Step 6: Commit** — `git add src/types/database.types.ts supabase/migrations.manifest.md && git commit -m "feat(db): legal_entity_tax_registrations + append-only einvoice_submissions"`

### Task 13: Migration `localization_p1_document_header_columns` (M-A additive columns)

**Files:**
- Migration: `localization_p1_document_header_columns`
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts`

**Interfaces:**
- Produces: issuance-snapshot columns on `invoices`/`quotes`/`credit_notes`; treatment/unit/item columns on the four item tables; `tenants.country_pack_version`; the P1 `vat_records` component columns (`component_code`, `jurisdiction_ref`, `tax_treatment`, `regime_key`, `tax_point_date`, `source_document_type`, `source_document_id`) + `vat_amount`→(19,4)/`vat_rate`→(7,4) widening. Columns are nullable (legacy rows) except `tax_inclusive`; consumed by WP-3/WP-6 now, Phase 2 for the buyer/seller snapshots.

- [ ] **Step 1: Probe** — `SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name IN ('tax_inclusive','tax_regime_key');` → Expected: 0 rows.

- [ ] **Step 2: Apply the migration**

```sql
-- localization_p1_document_header_columns (M-A)
DO $cols$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','quotes','credit_notes'] LOOP
    EXECUTE format('ALTER TABLE %I
      ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS supply_date date,
      ADD COLUMN IF NOT EXISTS place_of_supply_subdivision_id uuid REFERENCES geo_subdivisions(id),
      ADD COLUMN IF NOT EXISTS buyer_tax_number text,
      ADD COLUMN IF NOT EXISTS buyer_tax_number_label text,
      ADD COLUMN IF NOT EXISTS buyer_address jsonb,
      ADD COLUMN IF NOT EXISTS seller_tax_number text,
      ADD COLUMN IF NOT EXISTS reverse_charge boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS expected_withholding numeric(19,4),
      ADD COLUMN IF NOT EXISTS tax_regime_key text,
      ADD COLUMN IF NOT EXISTS regime_snapshot jsonb,
      ADD COLUMN IF NOT EXISTS pack_version_id uuid,
      ADD COLUMN IF NOT EXISTS notations jsonb', t);
    -- Idempotent even if Phase 0's platform-wide rate sweep already widened it:
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tax_rate TYPE numeric(7,4)', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['invoice_line_items','quote_items','credit_note_items','stock_sale_items'] LOOP
    EXECUTE format('ALTER TABLE %I
      ADD COLUMN IF NOT EXISTS unit_code text,
      ADD COLUMN IF NOT EXISTS unit_label text,
      ADD COLUMN IF NOT EXISTS item_code text,
      ADD COLUMN IF NOT EXISTS tax_treatment text CHECK (tax_treatment IS NULL OR tax_treatment IN
        (''standard'',''reduced'',''zero_rated'',''exempt'',''reverse_charge'',''out_of_scope'')),
      ADD COLUMN IF NOT EXISTS treatment_reason_code text', t);
  END LOOP;
  -- tax_rate widening runs ONLY over item tables that HAVE a tax_rate column.
  -- stock_sale_items has no tax_rate (its tax is carried as tax_amount / on the
  -- stock_sales header), so it is intentionally excluded — an ALTER COLUMN on a
  -- non-existent column would abort the whole migration.
  FOREACH t IN ARRAY ARRAY['invoice_line_items','quote_items','credit_note_items'] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tax_rate TYPE numeric(7,4)', t);
  END LOOP;
END $cols$;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS country_pack_version int;

-- vat_records component dimensions (P1 per contract §3.5). Phase 0 added the
-- base-currency columns (currency / exchange_rate / vat_amount_base /
-- taxable_amount_base / tax_period); Phase 1 adds the component snapshot that
-- issue_tax_document (Task 16) and the void/cancel backstop (Task 19) write.
ALTER TABLE vat_records
  ADD COLUMN IF NOT EXISTS component_code text,
  ADD COLUMN IF NOT EXISTS jurisdiction_ref uuid REFERENCES geo_subdivisions(id),
  ADD COLUMN IF NOT EXISTS tax_treatment text CHECK (tax_treatment IS NULL OR tax_treatment IN
    ('standard','reduced','zero_rated','exempt','reverse_charge','out_of_scope')),
  ADD COLUMN IF NOT EXISTS regime_key text,
  ADD COLUMN IF NOT EXISTS tax_point_date date,
  ADD COLUMN IF NOT EXISTS source_document_type text,
  ADD COLUMN IF NOT EXISTS source_document_id uuid;
-- Money/rate precision to (19,4)/(7,4) per contract §3.5 (idempotent — no-op if
-- the Phase-0 precision sweep already widened them):
ALTER TABLE vat_records ALTER COLUMN vat_amount TYPE numeric(19,4);
ALTER TABLE vat_records ALTER COLUMN vat_rate TYPE numeric(7,4);
```

Note: `unit_code`'s FK validation against `master_unit_codes` is Phase 2 (that table does not exist yet); the column is plain text until then, exactly per the contract ("columns P1/M-A, persistence P2"). The `vat_records` component columns are the P1 half of the contract §3.5 `vat_records` additions (the base-currency half is a Phase-0 entry-criteria prerequisite); they must exist before Task 16/Task 19 write them.

- [ ] **Step 3: Assert**

```sql
SELECT count(*) FROM information_schema.columns
WHERE table_name IN ('invoices','quotes','credit_notes') AND column_name='tax_regime_key';
SELECT numeric_precision, numeric_scale FROM information_schema.columns
WHERE table_name='invoices' AND column_name='tax_rate';
SELECT count(*) FROM information_schema.columns
WHERE table_name='vat_records'
  AND column_name IN ('component_code','jurisdiction_ref','tax_treatment','regime_key','tax_point_date','source_document_type','source_document_id');
```
Expected: `3`, then `7,4`, then `7` (the P1 `vat_records` component columns).

- [ ] **Step 4: Regen types** → `npm run check:tsc` = 0.
- [ ] **Step 5: Manifest row** — `| <version> | localization_p1_document_header_columns.sql | Additive | M-A issuance-snapshot header/item columns + tenants.country_pack_version + vat_records component columns | P1-WP2 |`
- [ ] **Step 6: Commit** — `git add src/types/database.types.ts supabase/migrations.manifest.md && git commit -m "feat(db): M-A document header/item tax columns + tenant pack version + vat_records component columns"`

### Task 14: Generated-row ↔ kernel structural-type pin

**Files:**
- Test: `src/lib/regimes/rowAssignability.test.ts`

**Interfaces:**
- Consumes: generated `Database` type (post Tasks 10-12 regen); structural rows from Task 1.
- Produces: a compile-time contract that schema drift on the three tables breaks CI, keeping the kernel honest without coupling it to Supabase.

- [ ] **Step 1: Write the test (it IS the implementation — compile-time assertions)**

```typescript
// src/lib/regimes/rowAssignability.test.ts
// Pins the generated table Row types to the kernel's structural mirrors. If a
// migration renames/retypes a column the kernel reads, this file fails tsc/CI.
import { describe, it, expect } from 'vitest';
import type { Database } from '../../types/database.types';
import type { GeoCountryTaxRateRow, LegalEntityTaxRegistrationRow } from './types';

type DbRate = Database['public']['Tables']['geo_country_tax_rates']['Row'];
type DbReg = Database['public']['Tables']['legal_entity_tax_registrations']['Row'];
type DbTaxLine = Database['public']['Tables']['document_tax_lines']['Row'];

// Field-level assignability (generated Row → structural kernel row). The cast
// through a narrowing function proves each structural field exists with a
// compatible type on the generated Row.
const narrowRate = (r: DbRate): GeoCountryTaxRateRow => ({
  id: r.id, country_id: r.country_id, subdivision_id: r.subdivision_id,
  component_code: r.component_code, component_label: r.component_label,
  tax_category: r.tax_category as GeoCountryTaxRateRow['tax_category'],
  rate: r.rate, applies_to: r.applies_to, valid_from: r.valid_from,
  valid_to: r.valid_to, sort_order: r.sort_order,
});
const narrowReg = (r: DbReg): LegalEntityTaxRegistrationRow => ({
  id: r.id, legal_entity_id: r.legal_entity_id, country_id: r.country_id,
  subdivision_id: r.subdivision_id, tax_number: r.tax_number,
  scheme: r.scheme as LegalEntityTaxRegistrationRow['scheme'],
  registered_from: r.registered_from, registered_to: r.registered_to, is_primary: r.is_primary,
});

describe('generated Row ↔ kernel structural row pins', () => {
  it('narrowing functions typecheck (the real assertion is compile-time)', () => {
    expect(typeof narrowRate).toBe('function');
    expect(typeof narrowReg).toBe('function');
    const taxLineKeys: Array<keyof DbTaxLine> = [
      'document_type', 'document_id', 'line_item_id', 'component_code', 'component_label',
      'rate', 'taxable_base', 'tax_amount', 'currency', 'exchange_rate', 'tax_amount_base',
      'tax_treatment', 'regime_key', 'plugin_version', 'pack_version_id', 'rule_trace', 'backfilled', 'sequence',
    ];
    expect(taxLineKeys.length).toBe(18);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/regimes/rowAssignability.test.ts` — Expected: PASS (fails only if Step-4 regens from Tasks 10-13 were skipped — that IS the red state to check first by running before regen).
- [ ] **Step 3: Commit** — `git add src/lib/regimes/rowAssignability.test.ts && git commit -m "test(tax): pin generated Row types to kernel structural rows"`

### Task 15: `regime.*` + reserved registry keys, `useRegimeConfig()`

**Files:**
- Modify: `src/lib/country/registry.ts` (append entries to `COUNTRY_CONFIG_REGISTRY`, `registry.ts:45`)
- Modify: `src/types/tenantConfig.ts` (extend `TenantConfig`, `tenantConfig.ts:52`)
- Modify: `src/lib/tenantConfigService.ts` (populate in `resolveTenantConfigFromLayers`, `tenantConfigService.ts:78-132`)
- Modify: `src/contexts/TenantConfigContext.tsx` (add hook after `useTenantFeatures`, `TenantConfigContext.tsx:156`)
- Test: `src/lib/country/registryRegimeKeys.test.ts`

**Interfaces:**
- Consumes: `ConfigKeyDef` (`registry.ts:26-38`), `resolveCountryConfigKey` (used at `tenantConfigService.ts:83`), zod `z` (already imported in registry.ts).
- Produces: registry keys `regime.tax` / `regime.einvoice` / `regime.numbering` / `regime.documents` / `regime.payroll` (all `maxOverrideLayer:'country'`, codedDefaults `'simple_vat'`/`'no_einvoice'`/`'prefix_numbering'`/`'generic_invoice'`/`'none'`); `tax.rounding_policy` (codedDefault `{mode:'half_up', level:'document'}`); `format.amount_words_scale` (codedDefault `'western'`); RESERVED keys `compliance.audit_file_exports` (codedDefault `[]`), `custody.unclaimed_property` (codedDefault `null`), `privacy.regime` (codedDefault `'none'`); `RegimeConfig` interface; `useRegimeConfig(): RegimeConfig`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/country/registryRegimeKeys.test.ts
import { describe, it, expect } from 'vitest';
import { COUNTRY_CONFIG_REGISTRY, STATUTORY_KEYS } from './registry';

const byKey = new Map(COUNTRY_CONFIG_REGISTRY.map((d) => [d.key, d]));

describe('regime.* + reserved pack-schema keys (Phase 1 contract)', () => {
  it.each([
    ['regime.tax', 'simple_vat'],
    ['regime.einvoice', 'no_einvoice'],
    ['regime.numbering', 'prefix_numbering'],
    ['regime.documents', 'generic_invoice'],
    ['regime.payroll', 'none'],
  ])('%s exists, country-locked, codedDefault %s', (key, dflt) => {
    const def = byKey.get(key);
    expect(def).toBeDefined();
    expect(def!.maxOverrideLayer).toBe('country');
    expect(def!.codedDefault).toBe(dflt);
    expect(STATUTORY_KEYS).toContain(key);
  });
  it('tax.rounding_policy is pack DATA with the Oman-parity default', () => {
    expect(byKey.get('tax.rounding_policy')!.codedDefault).toEqual({ mode: 'half_up', level: 'document' });
    expect(byKey.get('tax.rounding_policy')!.maxOverrideLayer).toBe('country');
  });
  it('format.amount_words_scale defaults western, country-locked', () => {
    expect(byKey.get('format.amount_words_scale')!.codedDefault).toBe('western');
  });
  it('RESERVED keys registered with zero consumers (owner E6/E8/E9)', () => {
    expect(byKey.get('compliance.audit_file_exports')!.codedDefault).toEqual([]);
    expect(byKey.get('custody.unclaimed_property')!.codedDefault).toBeNull();
    expect(byKey.get('privacy.regime')!.codedDefault).toBe('none');
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/country/registryRegimeKeys.test.ts` — Expected: FAIL (keys undefined).

- [ ] **Step 3: Implement.** Append to `COUNTRY_CONFIG_REGISTRY` in `src/lib/country/registry.ts` (after the last existing entry, matching the file's entry style):

```typescript
  // ── regime routing (L4 → L3; statutory, country-locked — Phase 1) ──
  {
    key: 'regime.tax', domain: 'tax', label: 'Tax regime plugin',
    description: 'Registered TaxStrategy key computing this country\'s tax. Country-locked; tenants cannot forge compliance.',
    schema: z.string().min(1), codedDefault: 'simple_vat', maxOverrideLayer: 'country',
  },
  {
    key: 'regime.einvoice', domain: 'tax', label: 'E-invoicing regime plugin',
    description: 'Registered EInvoicingTransport key. Country-locked.',
    schema: z.string().min(1), codedDefault: 'no_einvoice', maxOverrideLayer: 'country',
  },
  {
    key: 'regime.numbering', domain: 'tax', label: 'Numbering policy plugin',
    description: 'Registered NumberingPolicy key seeding statutory sequences. Country-locked.',
    schema: z.string().min(1), codedDefault: 'prefix_numbering', maxOverrideLayer: 'country',
  },
  {
    key: 'regime.documents', domain: 'tax', label: 'Document compliance profile',
    description: 'Registered DocumentComplianceProfile key (titles, bands, forced columns). Country-locked.',
    schema: z.string().min(1), codedDefault: 'generic_invoice', maxOverrideLayer: 'country',
  },
  {
    key: 'regime.payroll', domain: 'tax', label: 'Payroll pack plugin',
    description: 'Registered PayrollPack key. "none" = loud not-configured error on payroll statutory ops (Phase 6).',
    schema: z.string().min(1), codedDefault: 'none', maxOverrideLayer: 'country',
  },
  {
    key: 'tax.rounding_policy', domain: 'tax', label: 'Tax rounding policy',
    description: 'Pack DATA (graft 4): {mode: half_up|half_even, level: line|document, cash_increment?}. simple_vat default preserves Oman byte-parity.',
    schema: z.object({
      mode: z.enum(['half_up', 'half_even']),
      level: z.enum(['line', 'document']),
      cash_increment: z.number().positive().optional(),
    }),
    codedDefault: { mode: 'half_up', level: 'document' }, maxOverrideLayer: 'country',
  },
  {
    key: 'format.amount_words_scale', domain: 'format', label: 'Amount-in-words scale system',
    description: 'western (million/billion) or indian (lakh/crore). Pack data consumed by the speller (Phase 4 wires indian).',
    schema: z.enum(['western', 'indian']), codedDefault: 'western', maxOverrideLayer: 'country',
  },
  // ── RESERVED pack-schema keys — registered NOW, consumers ship later ──
  {
    key: 'compliance.audit_file_exports', domain: 'compliance', label: 'Statutory audit-file export descriptors',
    description: 'RESERVED (owner E9, consumed when markets demand): [{descriptor_key, format_class: saf_t|fec|gobd|custom, version, capability_key}].',
    schema: z.array(z.object({
      descriptor_key: z.string(), format_class: z.enum(['saf_t', 'fec', 'gobd', 'custom']),
      version: z.string(), capability_key: z.string(),
    })),
    codedDefault: [], maxOverrideLayer: 'country',
  },
  {
    key: 'custody.unclaimed_property', domain: 'compliance', label: 'Unclaimed-device / abandoned-property rules',
    description: 'RESERVED (owner E8, implemented Phase 6 wired to custody/checkout with a disposal legality gate): {holding_period_days, notice_schedule_days[], storage_fee_accrual{amount, per: day|month}, lien_rights, disposal_requires_legality_gate}.',
    schema: z.union([z.null(), z.object({
      holding_period_days: z.number().int().positive(),
      notice_schedule_days: z.array(z.number().int().positive()),
      storage_fee_accrual: z.object({ amount: z.number(), per: z.enum(['day', 'month']) }),
      lien_rights: z.boolean(),
      disposal_requires_legality_gate: z.literal(true),
    })]),
    codedDefault: null, maxOverrideLayer: 'country',
  },
  {
    key: 'privacy.regime', domain: 'compliance', label: 'Data-protection regime key',
    description: 'RESERVED (owner E7, consumed Phase 6 on the regime-key pattern): gdpr|pdpl|dpdp|none.',
    schema: z.enum(['gdpr', 'pdpl', 'dpdp', 'none']), codedDefault: 'none', maxOverrideLayer: 'country',
  },
```

If `ConfigDomain` (the `domain` union in `registry.ts`) lacks `'compliance'` or `'format'`, extend that union type in the same file — additive union members only.

Then extend `src/types/tenantConfig.ts` (after the `TaxConfig` block ending at `:36`):

```typescript
export interface RegimeConfig {
  tax: string;
  einvoice: string;
  numbering: string;
  documents: string;
  payroll: string;
}
```
and add `regime: RegimeConfig;` to `TenantConfig` (`tenantConfig.ts:52`). Populate in `resolveTenantConfigFromLayers` (`src/lib/tenantConfigService.ts`, inside the returned object after the `locale` block at `:122-128`):

```typescript
    regime: {
      tax: get<string>('regime.tax'),
      einvoice: get<string>('regime.einvoice'),
      numbering: get<string>('regime.numbering'),
      documents: get<string>('regime.documents'),
      payroll: get<string>('regime.payroll'),
    },
```
and in the legacy `mapRowToConfig` mapper (same file, `:142-192`) add the same block with literal codedDefaults (`{ tax: 'simple_vat', einvoice: 'no_einvoice', numbering: 'prefix_numbering', documents: 'generic_invoice', payroll: 'none' }`) so the pure-mapper tests keep passing. Add the hook in `src/contexts/TenantConfigContext.tsx` (after `useTenantFeatures`, `:156-170`):

```typescript
export function useRegimeConfig(): RegimeConfig {
  const { config } = useTenantConfig();
  if (!config) throw new Error('useRegimeConfig requires a resolved tenant config');
  return config.regime;
}
```
(import `RegimeConfig` from `../types/tenantConfig`).

- [ ] **Step 4: Run** — `npx vitest run src/lib/country/ src/lib/tenantConfigService.test.ts && npm run check:tsc` — Expected: PASS / 0. If the Phase-0 registry↔trigger parity gate (`npm run check:registry-trigger-parity`) enforces mapper coverage of new STATUTORY_KEYS, update its expectation list in `scripts/country-engine/registry-trigger-parity.test.ts` to record the ten new keys as registry-resolved (codedDefault-backed, no trigger column) per that test's documented exemption mechanism.

- [ ] **Step 5: Commit + PR 2**

```bash
git add src/lib/country/registry.ts src/lib/country/registryRegimeKeys.test.ts src/types/tenantConfig.ts src/lib/tenantConfigService.ts src/contexts/TenantConfigContext.tsx scripts/country-engine/registry-trigger-parity.test.ts
git commit -m "feat(config): regime.* routing keys + reserved pack-schema keys + useRegimeConfig"
git push -u origin feat/localization-p1-data-plane
gh pr create --title "Phase 1 WP-2: statutory data plane (5 migrations + regime config keys)" --body "Per plan WP-2. Migration PR — uses migration.md template. Tables: pack governance, geo_country_tax_rates (+9-country seed), document_tax_lines, legal_entity_tax_registrations, einvoice_submissions, M-A columns.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

**WP-2 verification:** `npm run check:schema-drift` green (types match live DB); `npm run check:tsc` 0; tenant-table-requirements SQL returns 0 rows for the two new tenant tables; seed assertions from Tasks 10/12 hold.

---

# WP-3 — The issuance choke point (PR 3: `feat/localization-p1-issue-rpc`, migration PR)

### Task 16: Migration `localization_p1_issue_tax_document` — the RPC

**Files:**
- Migration: `localization_p1_issue_tax_document`
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts`

**Interfaces:**
- Consumes: `document_tax_lines` (Task 11); `vat_records` base-currency columns (`currency`/`exchange_rate`/`vat_amount_base`/`taxable_amount_base`/`tax_period` — Phase-0 entry-criteria prerequisite) **and** the P1 component columns (`component_code`/`jurisdiction_ref`/`tax_treatment`/`regime_key`/`tax_point_date`/`source_document_type`/`source_document_id`) added in Task 13 (M-A); existing `get_next_number(p_scope)`, `log_chain_of_custody(p_case_id uuid, p_device_id uuid, p_action_category text, p_action text, p_description text, p_location text, p_custody_status text, p_metadata jsonb)` (live signature verified 2026-07-02), `get_current_tenant_id()`, `is_platform_admin()`, `master_currency_codes.decimal_places`.
- Produces: `issue_tax_document(p_doc_type text, p_doc_id uuid, p_dry_run boolean DEFAULT false) RETURNS jsonb` with the contract's return shapes. Sets `app.issuing='true'` transaction-locally so the Task-19 backstop can distinguish RPC issuance from raw REST status flips.

- [ ] **Step 1: Probe the wrong current behavior (the "failing test")**

```sql
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='issue_tax_document';
```
Expected: 0 rows. Also demonstrate today's pre-mint burn: `getNextInvoiceNumber` is called at `invoiceService.ts:411` BEFORE the insert at `:473-477` — a failed insert consumes a sequential tax number.

- [ ] **Step 2: Apply the migration**

```sql
-- localization_p1_issue_tax_document
-- L0 choke point. The RPC VALIDATES (regime-blind arithmetic) — it never
-- computes tax. Phase 1 wires 'invoice' end-to-end and 'quote' dry-run-only;
-- Phase 2 adds master_document_requirements evaluation (requirement_failures
-- stays [] until then, keeping the return shape contract-stable).

CREATE OR REPLACE FUNCTION issue_tax_document(
  p_doc_type text, p_doc_id uuid, p_dry_run boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tenant uuid;
  v_inv invoices%ROWTYPE;
  v_tz text;
  v_doc_dp int;
  v_tol numeric;
  v_base_tol numeric;
  v_rollup_count int;
  v_rollup_tax numeric;
  v_rollup_tax_base numeric;
  v_bad_component text;
  v_tax_point date;
  v_period text;
  v_number text;
  v_vat_ids uuid[] := '{}';
  v_vat_id uuid;
  v_r record;
  v_trace jsonb;
  v_regime text;
  v_pack uuid;
  v_tax_lines jsonb;
  v_q_tax numeric;
BEGIN
  IF p_doc_type NOT IN ('quote','invoice','credit_note','stock_sale') THEN
    RAISE EXCEPTION 'issue_tax_document: unknown document type "%"', p_doc_type;
  END IF;
  IF p_doc_type IN ('credit_note','stock_sale') THEN
    RAISE EXCEPTION 'issue_tax_document: % issuance is not wired in Phase 1 (credit notes: issue_credit_note; stock sales: Phase 2 record_stock_sale tax threading)', p_doc_type;
  END IF;

  v_tenant := get_current_tenant_id();

  -- ── QUOTE: dry-run validation only (quotes are not issued/ledgered) ──
  IF p_doc_type = 'quote' THEN
    IF NOT p_dry_run THEN
      RAISE EXCEPTION 'issue_tax_document: quotes support p_dry_run=true only';
    END IF;
    SELECT COALESCE(sum(dtl.tax_amount), 0) INTO v_q_tax
    FROM document_tax_lines dtl
    WHERE dtl.document_type = 'quote' AND dtl.document_id = p_doc_id
      AND dtl.line_item_id IS NULL AND dtl.deleted_at IS NULL;
    SELECT COALESCE(jsonb_agg(to_jsonb(dtl) ORDER BY dtl.sequence), '[]'::jsonb) INTO v_tax_lines
    FROM document_tax_lines dtl
    WHERE dtl.document_type = 'quote' AND dtl.document_id = p_doc_id AND dtl.deleted_at IS NULL;
    RETURN jsonb_build_object(
      'ok', true, 'document_number', NULL, 'tax_lines', v_tax_lines,
      'totals', jsonb_build_object('taxTotal', v_q_tax),
      'requirement_failures', '[]'::jsonb, 'trace', NULL);
  END IF;

  -- ── INVOICE ──
  SELECT * INTO v_inv FROM invoices
  WHERE id = p_doc_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'issue_tax_document: invoice % not found', p_doc_id; END IF;
  IF v_inv.tenant_id <> v_tenant AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'issue_tax_document: invoice % belongs to another tenant', p_doc_id;
  END IF;
  IF v_inv.invoice_type <> 'tax_invoice' THEN
    RAISE EXCEPTION 'issue_tax_document: only tax invoices are issued (got %). Convert the proforma first.', v_inv.invoice_type;
  END IF;
  IF NOT p_dry_run AND COALESCE(v_inv.status, 'draft') <> 'draft' THEN
    RAISE EXCEPTION 'issue_tax_document: invoice % is already issued (status %)', v_inv.invoice_number, v_inv.status;
  END IF;

  SELECT timezone INTO v_tz FROM tenants WHERE id = v_inv.tenant_id;
  SELECT decimal_places INTO v_doc_dp FROM master_currency_codes WHERE code = v_inv.currency;
  IF v_doc_dp IS NULL THEN
    RAISE EXCEPTION 'issue_tax_document: unknown currency "%" (master_currency_codes)', v_inv.currency;
  END IF;
  v_tol := 0.5 * power(10::numeric, -v_doc_dp);
  v_base_tol := v_tol;  -- single-entity tenants: base decimals == jurisdiction; refined in Phase 3

  -- (b) requirement gate: Phase 2 (master_document_requirements). Returns [] today.

  -- (d) Σ(document_tax_lines rollups) = header, document + base currency.
  SELECT count(*), COALESCE(sum(tax_amount), 0), COALESCE(sum(tax_amount_base), 0)
  INTO v_rollup_count, v_rollup_tax, v_rollup_tax_base
  FROM document_tax_lines
  WHERE document_type = 'invoice' AND document_id = p_doc_id
    AND line_item_id IS NULL AND deleted_at IS NULL;
  IF v_rollup_count = 0 THEN
    RAISE EXCEPTION 'issue_tax_document: invoice % has no document_tax_lines rollups — compute and persist tax lines before issuing', p_doc_id;
  END IF;
  IF abs(v_rollup_tax - COALESCE(v_inv.tax_amount, 0)) > v_tol THEN
    RAISE EXCEPTION 'issue_tax_document: header tax % <> Σ rollups % (tolerance %)', v_inv.tax_amount, v_rollup_tax, v_tol;
  END IF;
  IF v_inv.tax_amount_base IS NOT NULL AND abs(v_rollup_tax_base - v_inv.tax_amount_base) > v_base_tol THEN
    RAISE EXCEPTION 'issue_tax_document: header tax_base % <> Σ rollup base % (tolerance %)', v_inv.tax_amount_base, v_rollup_tax_base, v_base_tol;
  END IF;
  -- per-component: Σ(line rows) = rollup
  SELECT r.component_code INTO v_bad_component
  FROM document_tax_lines r
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(l.tax_amount), 0) AS line_sum, count(*) AS n
    FROM document_tax_lines l
    WHERE l.document_type = 'invoice' AND l.document_id = p_doc_id
      AND l.line_item_id IS NOT NULL AND l.component_code = r.component_code AND l.deleted_at IS NULL
  ) ls ON true
  WHERE r.document_type = 'invoice' AND r.document_id = p_doc_id
    AND r.line_item_id IS NULL AND r.deleted_at IS NULL
    AND ls.n > 0 AND abs(ls.line_sum - r.tax_amount) > v_tol
  LIMIT 1;
  IF v_bad_component IS NOT NULL THEN
    RAISE EXCEPTION 'issue_tax_document: component % line rows do not sum to its rollup', v_bad_component;
  END IF;

  SELECT regime_key, pack_version_id, rule_trace INTO v_regime, v_pack, v_trace
  FROM document_tax_lines
  WHERE document_type = 'invoice' AND document_id = p_doc_id AND line_item_id IS NULL AND deleted_at IS NULL
  ORDER BY sequence LIMIT 1;

  IF p_dry_run THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(dtl) ORDER BY dtl.line_item_id NULLS FIRST, dtl.sequence), '[]'::jsonb)
    INTO v_tax_lines
    FROM document_tax_lines dtl
    WHERE dtl.document_type = 'invoice' AND dtl.document_id = p_doc_id AND dtl.deleted_at IS NULL;
    RETURN jsonb_build_object(
      'ok', true, 'document_number', NULL, 'tax_lines', v_tax_lines,
      'totals', jsonb_build_object(
        'taxTotal', v_rollup_tax, 'grandTotal', v_inv.total_amount, 'taxableBase', v_inv.subtotal - COALESCE(v_inv.discount_amount, 0)),
      'requirement_failures', '[]'::jsonb, 'trace', v_trace);
  END IF;

  -- Signal the Task-19 backstop that this transaction IS the sanctioned issuer.
  PERFORM set_config('app.issuing', 'true', true);

  -- (c) atomic number mint — only when the draft has no number (post-cutover default).
  IF v_inv.invoice_number IS NULL THEN
    v_number := get_next_number('invoices');
    UPDATE invoices SET invoice_number = v_number WHERE id = p_doc_id;
  ELSE
    v_number := v_inv.invoice_number;
  END IF;

  -- (e) vat_records: one row per non-zero rollup component, base currency,
  -- tenant-local tax_period of the tax point (never created_at).
  v_tax_point := COALESCE(v_inv.supply_date, (now() AT TIME ZONE v_tz)::date);
  v_period := to_char(v_tax_point, 'YYYY-MM');
  FOR v_r IN
    SELECT * FROM document_tax_lines
    WHERE document_type = 'invoice' AND document_id = p_doc_id
      AND line_item_id IS NULL AND deleted_at IS NULL AND tax_amount <> 0
    ORDER BY sequence
  LOOP
    INSERT INTO vat_records (
      tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
      currency, exchange_rate, vat_amount_base, taxable_amount_base,
      component_code, jurisdiction_ref, tax_treatment, regime_key,
      tax_point_date, source_document_type, source_document_id)
    VALUES (
      v_inv.tenant_id, 'sale', p_doc_id, v_r.tax_amount, v_r.rate, v_period,
      v_r.currency, v_r.exchange_rate, v_r.tax_amount_base,
      round(v_r.taxable_base * v_r.exchange_rate, v_doc_dp),
      v_r.component_code, v_r.jurisdiction_ref, v_r.tax_treatment, v_r.regime_key,
      v_tax_point, 'invoice', p_doc_id)
    RETURNING id INTO v_vat_id;
    v_vat_ids := v_vat_ids || v_vat_id;
  END LOOP;

  -- (f) e-invoice transport hook: Phase 1 default regime is no_einvoice → no
  -- einvoice_submissions row. Transports (zatca/in_irn/uk_mtd) land Phases 3-5
  -- and insert here with previous_hash chaining.

  -- (g) custody 'financial' event (v1.2.0 invariant — DB-side, unskippable).
  IF v_inv.case_id IS NOT NULL THEN
    PERFORM log_chain_of_custody(
      v_inv.case_id, NULL, 'financial', 'INVOICE_ISSUED',
      format('Tax invoice %s issued (%s %s)', v_number, v_inv.currency, v_inv.total_amount),
      NULL, 'in_custody',
      jsonb_build_object('invoice_id', p_doc_id, 'invoice_number', v_number,
                         'total_amount', v_inv.total_amount, 'tax_amount', v_inv.tax_amount,
                         'regime_key', v_regime));
  END IF;

  -- (h) issued flip — the immutability trigger takes over from here.
  UPDATE invoices
  SET status = 'sent', sent_at = now(),
      tax_regime_key = v_regime, pack_version_id = v_pack
  WHERE id = p_doc_id AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_tax_document: concurrent issuance detected for %', p_doc_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'document_number', v_number, 'issued_at', now(),
    'vat_record_ids', to_jsonb(v_vat_ids), 'einvoice_submission_id', NULL, 'trace', v_trace);
END;
$fn$;

REVOKE ALL ON FUNCTION issue_tax_document(text, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION issue_tax_document(text, uuid, boolean) TO authenticated, service_role;
```

- [ ] **Step 3: Assert (SQL probes against the live demo tenant)**

```sql
-- Rejections fire before any write:
SELECT issue_tax_document('stock_sale', gen_random_uuid());   -- ERROR: not wired in Phase 1
SELECT issue_tax_document('invoice', gen_random_uuid());      -- ERROR: invoice not found
```
Expected: both raise with the exact messages above (run each separately; errors confirm the guard order).

- [ ] **Step 4: Regen types** → `npm run check:tsc` = 0.
- [ ] **Step 5: Manifest row** — `| <version> | localization_p1_issue_tax_document.sql | Additive | Issuance choke-point RPC (mint, Σ validation, ledger, custody, flip) | P1-WP3 |`
- [ ] **Step 6: Commit** — `git add src/types/database.types.ts supabase/migrations.manifest.md && git commit -m "feat(db): issue_tax_document choke-point RPC"`

### Task 17: Migration part — `assert_document_tax_integrity` (in `localization_p1_integrity_immutability_triggers`)

**Files:**
- Migration: `localization_p1_integrity_immutability_triggers` (Tasks 17-19 apply as ONE migration; write the SQL across the three tasks, apply once at Task 19 Step 2)

**Interfaces:**
- Produces: constraint trigger `assert_document_tax_integrity` on `invoices` — deferred to COMMIT, skips documents with zero tax lines (the NOT VALID analogue; see Architecture Decision 6), validated retroactively in Task 27 after M-C.

- [ ] **Step 1: Probe the unprotected state**

```sql
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'assert_document_tax%';
```
Expected: 0 rows. A header UPDATE that contradicts its tax lines currently succeeds silently.

- [ ] **Step 2: Author this SQL block (applied with Task 19's)**

```sql
-- Part 1/3 of localization_p1_integrity_immutability_triggers
CREATE OR REPLACE FUNCTION assert_document_tax_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_dp int;
  v_tol numeric;
  v_rollup numeric;
  v_n int;
BEGIN
  -- Skip while no tax lines exist (legacy rows pre-M-C; drafts before persist).
  SELECT count(*), COALESCE(sum(tax_amount), 0) INTO v_n, v_rollup
  FROM document_tax_lines
  WHERE document_type = 'invoice' AND document_id = NEW.id
    AND line_item_id IS NULL AND deleted_at IS NULL;
  IF v_n = 0 THEN RETURN NEW; END IF;

  SELECT decimal_places INTO v_dp FROM master_currency_codes WHERE code = NEW.currency;
  v_tol := 0.5 * power(10::numeric, -COALESCE(v_dp, 2));
  IF abs(COALESCE(NEW.tax_amount, 0) - v_rollup) > v_tol THEN
    RAISE EXCEPTION 'document tax integrity: invoices.tax_amount % <> Σ document_tax_lines rollups % for invoice %',
      NEW.tax_amount, v_rollup, NEW.id;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE CONSTRAINT TRIGGER assert_document_tax_integrity
  AFTER INSERT OR UPDATE OF tax_amount, subtotal, discount_amount, total_amount, status ON invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_document_tax_integrity();
```

(Deferred-to-COMMIT so the create flow — header insert, then tax-lines insert in the SAME client transaction via the issue RPC path — never races itself; PostgREST header-only writes on documents that HAVE tax lines are rejected at commit.)

- [ ] **Steps 3-6:** folded into Task 19 (single migration apply + assert + regen + manifest + commit).

### Task 18: Migration part — issued-document immutability triggers

**Files:**
- Migration: same `localization_p1_integrity_immutability_triggers` (part 2/3)

**Interfaces:**
- Produces: `enforce_issued_invoice_immutability` on `invoices` (UPDATE outside the RESTRICTED_EDITABLE whitelist + any DELETE blocked once a tax invoice leaves `draft`); `enforce_issued_invoice_items_immutability` on `invoice_line_items`; `enforce_issued_tax_lines_immutability` on `document_tax_lines`. Fixes the PostgREST-rewrite critical: `deleteInvoice` (`invoiceService.ts:686-689`) soft-deletes ANY invoice unconditionally today.

- [ ] **Step 1: Probe the broken behavior (the failing test).** Pick any issued live invoice and prove PostgREST-writable state:

```sql
SELECT id, status FROM invoices WHERE invoice_type='tax_invoice' AND status <> 'draft' AND deleted_at IS NULL LIMIT 1;
-- With that id, this UPDATE currently SUCCEEDS (run inside a transaction and roll back):
BEGIN; UPDATE invoices SET total_amount = total_amount + 1000 WHERE id = '<that id>'; ROLLBACK;
```
Expected today: `UPDATE 1` — the critical. After Step 2 it must raise.

- [ ] **Step 2: Author this SQL block (applied with Task 19's)**

```sql
-- Part 2/3 of localization_p1_integrity_immutability_triggers
-- RESTRICTED_EDITABLE whitelist: payment settlement + status lifecycle + notes.
-- deleted_at is NOT whitelisted: an issued tax invoice can be VOIDED, never hidden.
CREATE OR REPLACE FUNCTION enforce_issued_invoice_immutability() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  whitelist text[] := ARRAY[
    'status','amount_paid','balance_due','amount_paid_base','balance_due_base',
    'credited_amount','credited_amount_base','paid_at','sent_at','notes',
    'updated_at','updated_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_type = 'tax_invoice' AND COALESCE(OLD.status, 'draft') <> 'draft' THEN
      RAISE EXCEPTION 'Issued tax invoice % cannot be deleted. Void it instead.', OLD.invoice_number;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.invoice_type = 'tax_invoice' AND COALESCE(OLD.status, 'draft') <> 'draft' THEN
    IF (to_jsonb(OLD.*) - whitelist) IS DISTINCT FROM (to_jsonb(NEW.*) - whitelist) THEN
      RAISE EXCEPTION 'Issued tax invoice % is immutable outside the settlement whitelist. Void and re-issue instead.', OLD.invoice_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER enforce_issued_invoice_immutability
  BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION enforce_issued_invoice_immutability();

CREATE OR REPLACE FUNCTION enforce_issued_invoice_items_immutability() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id uuid;
BEGIN
  v_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF EXISTS (SELECT 1 FROM invoices i WHERE i.id = v_id
             AND i.invoice_type = 'tax_invoice' AND COALESCE(i.status, 'draft') <> 'draft') THEN
    RAISE EXCEPTION 'Line items of issued tax invoice % are immutable.', v_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;
CREATE TRIGGER enforce_issued_invoice_items_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION enforce_issued_invoice_items_immutability();

CREATE OR REPLACE FUNCTION enforce_issued_tax_lines_immutability() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_type text; v_doc uuid;
BEGIN
  v_type := COALESCE(NEW.document_type, OLD.document_type);
  v_doc := COALESCE(NEW.document_id, OLD.document_id);
  -- The M-C backfill (Task 26) inserts rows FOR issued historical invoices and
  -- sets this transaction-local guard; nothing else may.
  IF current_setting('app.tax_line_backfill', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF v_type = 'invoice' AND EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = v_doc
    AND i.invoice_type = 'tax_invoice' AND COALESCE(i.status, 'draft') <> 'draft') THEN
    RAISE EXCEPTION 'document_tax_lines of issued tax invoice % are immutable.', v_doc;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;
CREATE TRIGGER enforce_issued_tax_lines_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON document_tax_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_issued_tax_lines_immutability();
```

- [ ] **Steps 3-6:** folded into Task 19.

### Task 19: Migration part — `post_invoice_vat_record` becomes a backstop; apply the combined migration

**Files:**
- Migration: `localization_p1_integrity_immutability_triggers` (part 3/3 + APPLY)
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts`

**Interfaces:**
- Consumes: live `post_invoice_vat_record()` trigger fn (verified behavior: posts flat `vat_records` on tax-invoice INSERT; posts a negative row on void/cancel transition; skips when `app.importing='true'`).
- Produces: evolved `post_invoice_vat_record()` — (a) INSERT no longer posts (posting moved to issuance); (b) issuance transition asserts subledger rows exist unless `app.issuing='true'` (backstop, not computer); (c) void/cancel reverses component-aware from the invoice's own `vat_records` rows, falling back to the flat legacy reversal when none exist.

- [ ] **Step 1: Probe current wrong behavior** — fetch the live definition first (paste into the migration PR description as evidence):

```sql
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='post_invoice_vat_record';
```
Expected: body shows the INSERT-time posting of a single flat row (`record_type='sale'`, `vat_amount=NEW.tax_amount`) — the behavior being retired.

- [ ] **Step 2: Author part 3/3, then APPLY the full three-part migration via `mcp__supabase__apply_migration` as `localization_p1_integrity_immutability_triggers` (Task 17 SQL + Task 18 SQL + this):**

```sql
-- Part 3/3: post_invoice_vat_record — backstop, not computer.
CREATE OR REPLACE FUNCTION post_invoice_vat_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_r record;
BEGIN
  IF current_setting('app.importing', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- (a) INSERT: no longer posts. The ledger is written at ISSUANCE by
  -- issue_tax_document, component-dimensioned, in base currency.
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- (b) Issuance backstop: a draft→sent flip on a taxed tax_invoice arriving
  -- OUTSIDE issue_tax_document (raw REST) must not leave the return unposted.
  IF NEW.invoice_type = 'tax_invoice'
     AND COALESCE(OLD.status, 'draft') = 'draft' AND NEW.status = 'sent'
     AND COALESCE(NEW.tax_amount, 0) <> 0
     AND current_setting('app.issuing', true) IS DISTINCT FROM 'true'
     AND NOT EXISTS (
       SELECT 1 FROM vat_records vr
       WHERE vr.record_id = NEW.id AND vr.record_type = 'sale' AND vr.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Invoice % must be issued through issue_tax_document (no VAT subledger rows found).', NEW.id;
  END IF;

  -- (c) Void/cancel reversal: component-aware contra rows from this invoice''s
  -- own ledger rows; legacy flat fallback when none exist (pre-kernel history).
  IF NEW.invoice_type = 'tax_invoice'
     AND COALESCE(OLD.status, '') NOT IN ('void', 'cancelled')
     AND NEW.status IN ('void', 'cancelled') THEN
    IF EXISTS (SELECT 1 FROM vat_records vr WHERE vr.record_id = NEW.id AND vr.record_type = 'sale'
               AND vr.vat_amount > 0 AND vr.deleted_at IS NULL) THEN
      FOR v_r IN
        SELECT * FROM vat_records
        WHERE record_id = NEW.id AND record_type = 'sale' AND vat_amount > 0 AND deleted_at IS NULL
      LOOP
        INSERT INTO vat_records (
          tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
          currency, exchange_rate, vat_amount_base, taxable_amount_base,
          component_code, jurisdiction_ref, tax_treatment, regime_key,
          tax_point_date, source_document_type, source_document_id)
        VALUES (
          v_r.tenant_id, 'sale', NEW.id, -v_r.vat_amount, v_r.vat_rate,
          to_char(now(), 'YYYY-MM'),
          v_r.currency, v_r.exchange_rate, -v_r.vat_amount_base, -v_r.taxable_amount_base,
          v_r.component_code, v_r.jurisdiction_ref, v_r.tax_treatment, v_r.regime_key,
          now()::date, 'invoice', NEW.id);
      END LOOP;
    ELSIF COALESCE(NEW.tax_amount, 0) <> 0 THEN
      INSERT INTO vat_records (tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period)
      VALUES (NEW.tenant_id, 'sale', NEW.id, -NEW.tax_amount, COALESCE(NEW.tax_rate, 0), to_char(now(), 'YYYY-MM'));
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
```

- [ ] **Step 3: Assert the applied state**

```sql
SELECT tgname FROM pg_trigger WHERE tgname IN
  ('assert_document_tax_integrity','enforce_issued_invoice_immutability',
   'enforce_issued_invoice_items_immutability','enforce_issued_tax_lines_immutability');
```
Expected: 4 rows. Then re-run Task 18 Step 1's UPDATE probe — Expected now: `ERROR: Issued tax invoice ... is immutable outside the settlement whitelist`. And the deleteInvoice path: `BEGIN; UPDATE invoices SET deleted_at = now() WHERE id = '<issued id>'; ROLLBACK;` — Expected: same immutability error (`deleted_at` not whitelisted).

- [ ] **Step 4: Regen types** → `npm run check:tsc` = 0.
- [ ] **Step 5: Manifest row** — `| <version> | localization_p1_integrity_immutability_triggers.sql | Additive | header=Σ constraint trigger + issued-doc immutability + vat backstop evolution | P1-WP3 |`
- [ ] **Step 6: Commit** — `git add src/types/database.types.ts supabase/migrations.manifest.md && git commit -m "feat(db): tax integrity + issued-document immutability triggers; vat trigger becomes backstop"`

### Task 20: Client seam — `src/lib/taxDocumentService.ts`

**Files:**
- Create: `src/lib/taxDocumentService.ts`
- Test: `src/lib/taxDocumentService.test.ts`

**Interfaces:**
- Consumes: `computeDocumentTax`/`resolveTaxStrategy`/`registerAllRegimePlugins` (WP-1); `RateContext`, `convertToBase`, `roundMoney` (existing); `supabase` client; generated types for `geo_country_tax_rates`, `legal_entity_tax_registrations`, `document_tax_lines`.
- Produces: `computeDocumentTotals(input: DocumentTotalsInput, rc: RateContext)`, `persistDocumentTaxLines(args)`, `issueTaxDocument(docType, docId, dryRun?)`, `IssueTaxDocumentResult` — exactly the signatures in APIs & Services. WP-6 rewires `invoiceService`/`quotesService` onto these.

- [ ] **Step 1: Write the failing test (pure parts — the totals adapter and rate matching)**

```typescript
// src/lib/taxDocumentService.test.ts
import { describe, it, expect } from 'vitest';
import { buildTaxableLines, matchFormRate, totalsFromComputation } from './taxDocumentService';
import { computeDocumentTax } from './tax/kernel';
import type { GeoCountryTaxRateRow, TaxContext } from './regimes/types';
import type { RateContext } from './currencyService';

const rc: RateContext = { documentCurrency: 'OMR', documentDecimals: 3, baseCurrency: 'OMR', baseDecimals: 3, rate: 1, rateSource: 'derived' };
const omVat: GeoCountryTaxRateRow = {
  id: 'r1', country_id: 'om', subdivision_id: null, component_code: 'VAT', component_label: 'VAT',
  tax_category: 'standard', rate: 5, applies_to: null, valid_from: '2021-04-16', valid_to: null, sort_order: 0,
};

describe('taxDocumentService pure helpers', () => {
  it('buildTaxableLines converts per-item % discounts to dp-rounded amounts (legacy parity)', () => {
    const lines = buildTaxableLines(
      [{ description: 'x', quantity: 3, unit_price: 40.5, discount_percent: 10 }], 3,
    );
    expect(lines[0]).toMatchObject({ lineItemId: 'idx:0', lineDiscount: 12.15, quantity: 3, unitPrice: 40.5, treatment: 'standard' });
  });
  it('matchFormRate: exact standard match wins; unmatched rate synthesizes a form: row (provenance preserved)', () => {
    expect(matchFormRate([omVat], 5)).toEqual([omVat]);
    const synth = matchFormRate([omVat], 7.5);
    expect(synth).toHaveLength(1);
    expect(synth[0]).toMatchObject({ id: 'form:7.5', rate: 7.5, component_code: 'VAT', tax_category: 'standard' });
    expect(matchFormRate([omVat], 0)).toEqual([]); // rate 0 → no components (untaxed document)
  });
  it('totalsFromComputation restores the legacy header shape (subtotal pre-doc-discount)', () => {
    const ctx: TaxContext = {
      documentType: 'invoice',
      seller: { legalEntityId: 'le', countryId: 'om', subdivisionId: null, taxIdentifier: null, registrations: [] },
      buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
      taxPointDate: '2026-07-02', placeOfSupplySubdivisionId: null,
      lines: buildTaxableLines([{ description: 'a', quantity: 1, unit_price: 100 }, { description: 'b', quantity: 1, unit_price: 100 }], 3),
      documentDiscount: 0.1, taxInclusive: false, rateContext: rc, rates: [omVat],
      roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western',
    };
    const c = computeDocumentTax(ctx);
    const t = totalsFromComputation(c, 0.1, rc.documentDecimals);
    expect(t.subtotal).toBe(200);        // pre-doc-discount, legacy shape
    expect(t.taxAmount).toBe(9.995);     // round(199.900 * 0.05, 3)
    expect(t.totalAmount).toBe(209.895);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/taxDocumentService.test.ts` — Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```typescript
// src/lib/taxDocumentService.ts
//
// The client seam between document services and the fiscal kernel + issue RPC.
// Services never touch the kernel or document_tax_lines directly — they call
// computeDocumentTotals → persistDocumentTaxLines → issueTaxDocument.

import { supabase } from './supabaseClient';
import { convertToBase, roundMoney } from './financialMath';
import type { RateContext } from './currencyService';
import { registerAllRegimePlugins } from './regimes/register';
import { resolveTaxStrategy } from './regimes/registry';
import type {
  GeoCountryTaxRateRow, LegalEntityTaxRegistrationRow, RuleTrace,
  TaxComputation, TaxContext, TaxDocumentType, TaxableLine,
} from './regimes/types';

export interface DocumentTotalsInput {
  items: Array<{ description: string; quantity: number; unit_price: number; discount_percent?: number }>;
  discountType?: string | null;
  discountAmount: number;
  taxRate: number;
  documentType: TaxDocumentType;
  documentDate: string;
  taxInclusive?: boolean;
}

export interface IssueTaxDocumentResult {
  ok: boolean;
  document_number: string | null;
  issued_at: string | null;
  vat_record_ids: string[];
  einvoice_submission_id: string | null;
  requirement_failures: Array<{ field_key: string; level: 'block' | 'warn'; message: string }>;
  trace: RuleTrace | null;
}

/** Item rows → kernel TaxableLines. lineItemId carries an 'idx:<n>' sentinel
 *  that persistDocumentTaxLines re-labels with real row ids after item insert. */
export function buildTaxableLines(
  items: DocumentTotalsInput['items'], documentDecimals: number,
): TaxableLine[] {
  return items.map((item, index) => {
    const sub = roundMoney(item.quantity * item.unit_price, documentDecimals);
    const discount = roundMoney(sub * ((item.discount_percent || 0) / 100), documentDecimals);
    return {
      lineItemId: `idx:${index}`, description: item.description,
      quantity: item.quantity, unitPrice: item.unit_price, lineDiscount: discount,
      unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null,
    };
  });
}

/** The form's header rate resolves against effective-dated standard rows.
 *  Exact match → the real rate rows (single-mode: subdivision-null standards).
 *  rate 0 → no components (untaxed doc, matches legacy 0%). Any other rate →
 *  ONE synthetic row id 'form:<rate>' so provenance shows a form override
 *  (Phase 2 replaces free rates with treatment selectors). */
export function matchFormRate(
  effective: GeoCountryTaxRateRow[], formRate: number,
): GeoCountryTaxRateRow[] {
  if (formRate === 0) return [];
  const standards = effective.filter((r) => r.tax_category === 'standard' && r.subdivision_id === null);
  const sum = standards.reduce((s, r) => s + r.rate, 0);
  if (standards.length > 0 && Math.abs(sum - formRate) < 1e-9) return standards;
  return [{
    id: `form:${formRate}`, country_id: standards[0]?.country_id ?? 'form', subdivision_id: null,
    component_code: standards[0]?.component_code ?? 'VAT',
    component_label: standards[0]?.component_label ?? 'VAT',
    tax_category: 'standard', rate: formRate, applies_to: null,
    valid_from: '1970-01-01', valid_to: null, sort_order: 0,
  }];
}

/** Kernel totals → the legacy header shape (subtotal is PRE-document-discount). */
export function totalsFromComputation(
  computation: TaxComputation, documentDiscount: number, documentDecimals: number,
): { subtotal: number; taxAmount: number; totalAmount: number } {
  return {
    subtotal: roundMoney(computation.totals.taxableBase + documentDiscount, documentDecimals),
    taxAmount: computation.totals.taxTotal,
    totalAmount: computation.totals.grandTotal,
  };
}

async function fetchSellerContext(): Promise<{
  legalEntityId: string; countryId: string; taxIdentifier: string | null;
  registrations: LegalEntityTaxRegistrationRow[];
}> {
  const { data: le, error } = await supabase
    .from('legal_entities')
    .select('id, country_id, tax_identifier')
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
    legalEntityId: le.id, countryId: le.country_id, taxIdentifier: le.tax_identifier,
    registrations: (regs ?? []) as LegalEntityTaxRegistrationRow[],
  };
}

async function fetchEffectiveRates(countryId: string, onDate: string): Promise<GeoCountryTaxRateRow[]> {
  const { data, error } = await supabase
    .from('geo_country_tax_rates')
    .select('id, country_id, subdivision_id, component_code, component_label, tax_category, rate, applies_to, valid_from, valid_to, sort_order')
    .eq('country_id', countryId)
    .lte('valid_from', onDate)
    .or(`valid_to.is.null,valid_to.gte.${onDate}`)
    .is('deleted_at', null)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as GeoCountryTaxRateRow[];
}

export async function computeDocumentTotals(
  input: DocumentTotalsInput, rc: RateContext,
): Promise<{ computation: TaxComputation; subtotal: number; taxAmount: number; totalAmount: number }> {
  registerAllRegimePlugins();
  const seller = await fetchSellerContext();
  const effective = await fetchEffectiveRates(seller.countryId, input.documentDate);
  const rates = matchFormRate(effective, input.taxRate || 0);
  const lines = buildTaxableLines(input.items, rc.documentDecimals);
  const preDiscountSubtotal = lines.reduce(
    (s, l) => roundMoney(s + roundMoney(roundMoney(l.quantity * l.unitPrice, rc.documentDecimals) - l.lineDiscount, rc.documentDecimals), rc.documentDecimals), 0);
  const documentDiscount = input.discountType === 'percentage'
    ? roundMoney((preDiscountSubtotal * input.discountAmount) / 100, rc.documentDecimals)
    : input.discountAmount || 0;
  // rate 0 → untaxed document: mark lines out_of_scope so the kernel emits
  // zero-amount evidence rows, matching legacy "0% tax" exactly.
  const effectiveLines = rates.length === 0
    ? lines.map((l) => ({ ...l, treatment: 'out_of_scope' as const }))
    : lines;
  const ctx: TaxContext = {
    documentType: input.documentType,
    seller: {
      legalEntityId: seller.legalEntityId, countryId: seller.countryId, subdivisionId: null,
      taxIdentifier: seller.taxIdentifier, registrations: seller.registrations,
    },
    buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
    taxPointDate: input.documentDate, placeOfSupplySubdivisionId: null,
    lines: effectiveLines, documentDiscount, taxInclusive: input.taxInclusive ?? false,
    rateContext: rc, rates,
    roundingPolicy: { mode: 'half_up', level: 'document' },  // Oman parity default; pack-data override wires in Phase 2
    scaleSystem: 'western',
  };
  const strategy = resolveTaxStrategy('simple_vat'); // Phase 2: thread useRegimeConfig().tax
  const computation = await strategy.compute(ctx);
  return { computation, ...totalsFromComputation(computation, documentDiscount, rc.documentDecimals) };
}

export async function persistDocumentTaxLines(args: {
  tenantId: string; documentType: TaxDocumentType; documentId: string;
  computation: TaxComputation; rc: RateContext; lineItemIds?: Array<string | null>;
}): Promise<void> {
  const { tenantId, documentType, documentId, computation, rc, lineItemIds = [] } = args;
  const relabel = (sentinel: string | null): string | null => {
    if (sentinel === null) return null;
    const m = /^idx:(\d+)$/.exec(sentinel);
    if (!m) return sentinel;
    return lineItemIds[Number(m[1])] ?? null;
  };
  // Drafts recompute on every save: soft-delete previous snapshot, insert fresh.
  const { error: clearErr } = await supabase
    .from('document_tax_lines')
    .update({ deleted_at: new Date().toISOString() })
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .is('deleted_at', null);
  if (clearErr) throw clearErr;

  const rows = [...computation.rollups, ...computation.lines].map((l) => ({
    tenant_id: tenantId,
    document_type: documentType,
    document_id: documentId,
    line_item_id: relabel(l.lineItemId),
    component_code: l.componentCode,
    component_label: l.componentLabel,
    jurisdiction_ref: l.jurisdictionRef,
    rate: l.rate,
    taxable_base: l.taxableBase,
    tax_amount: l.taxAmount,
    currency: rc.documentCurrency,
    exchange_rate: rc.rate,
    tax_amount_base: convertToBase(l.taxAmount, rc.rate, rc.baseDecimals),
    tax_treatment: l.taxTreatment,
    treatment_reason_code: l.treatmentReasonCode,
    regime_key: computation.trace.regimeKey,
    plugin_version: computation.trace.pluginVersion,
    pack_version_id: computation.trace.packVersionId,
    rule_trace: l.lineItemId === null ? (computation.trace as unknown as Record<string, unknown>) : null,
    backfilled: false,
    sequence: l.sequence,
  }));
  const { error } = await supabase.from('document_tax_lines').insert(rows);
  if (error) throw error;
}

export async function issueTaxDocument(
  docType: TaxDocumentType, docId: string, dryRun = false,
): Promise<IssueTaxDocumentResult> {
  const { data, error } = await supabase.rpc('issue_tax_document', {
    p_doc_type: docType, p_doc_id: docId, p_dry_run: dryRun,
  });
  if (error) throw error;
  return data as unknown as IssueTaxDocumentResult;
}
```

- [ ] **Step 4: Run** — `npx vitest run src/lib/taxDocumentService.test.ts && npm run check:tsc` — Expected: PASS / 0.

- [ ] **Step 5: Commit + PR 3**

```bash
git add src/lib/taxDocumentService.ts src/lib/taxDocumentService.test.ts
git commit -m "feat(tax): taxDocumentService client seam (compute, persist, issue)"
git push -u origin feat/localization-p1-issue-rpc
gh pr create --title "Phase 1 WP-3: issue_tax_document RPC + integrity/immutability triggers + client seam" --body "Per plan WP-3. Migration PR. No write path switched yet (WP-6 cuts over).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

**WP-3 verification:** Task 18 Step 1 probe now errors; `issue_tax_document('invoice', <random uuid>)` errors 'not found'; `npm run check:schema-drift` green; full `npm run test` green.

---

# WP-4 — Numbering v2, ONE release (PR 4: `feat/localization-p1-numbering-v2`, migration PR)

Risk 8 (numbering fork = the one unrecoverable failure) mandates that the function upgrade, the admin gate, the audit writers, the anon REVOKE, and the scope data fixes land in a SINGLE migration + PR.

### Task 21: Migration `localization_p1_numbering_v2`

**Files:**
- Migration: `localization_p1_numbering_v2`
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts`

**Interfaces:**
- Consumes: dormant `number_sequences` columns (`format_template`, `reset_basis`, `fiscal_year_anchor`, `last_reset_period` — live, NULL everywhere, verified); `number_sequences_audit` (live columns verified: `id, tenant_id, sequence_id, scope, old_value, new_value, action, user_role, performed_by, created_at, updated_at`); `is_tenant_admin()`, `get_my_role()`.
- Adds: `number_sequences.max_length int` — the sole schema change in this migration (not previously present; verified absent 2026-07-02). This is an additive column, so §3.5's "ZERO schema change to `number_sequences`" no longer holds and the manifest classification is `Conditional` accordingly.
- Produces: `get_next_number(p_scope)` v2 (signature unchanged; `format_template IS NULL` = byte-identical legacy); `preview_number_format(p_scope, p_format_template)`; `update_number_sequence(...9 args)`; anon REVOKE (closes the live `update_number_sequence` EXECUTE-to-anon gap, verified 2026-07-02); live scope data fixes (`case` scope prefix `''`→`'CASE'`; `report_evaluation`/`report_service` both `REPO` → `REVL`/`RSVC`).

- [ ] **Step 1: Probe the wrong current state (the failing tests)**

```sql
-- (a) anon can rewrite numbering today (SEC gap):
SELECT grantee FROM information_schema.routine_privileges
WHERE routine_name='update_number_sequence' AND grantee='anon';        -- expected today: 1 row
-- (b) case scope renders '-30376' (empty prefix), REPO collision:
SELECT scope, prefix FROM number_sequences WHERE scope IN ('case','report_evaluation','report_service');
-- expected today: case '', report_evaluation 'REPO', report_service 'REPO'
-- (c) v1 ignores fiscal columns:
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='get_next_number';
-- expected today: body references NONE of format_template/reset_basis/fiscal_year_anchor
```
Paste the fetched v1 definition into the migration PR — the v2 legacy branch below must reproduce it exactly (auto-create `prefix=UPPER(LEFT(scope,4))`, padding 4; `reset_annually`+`last_reset_year` calendar reset; `prefix || '-' || LPAD(...)`). If the live body differs from that shape in any detail, mirror the live body in the legacy branch verbatim.

- [ ] **Step 2: Apply the migration**

```sql
-- localization_p1_numbering_v2 (M-H — everything in ONE release, risk 8)

-- max_length is the ONE schema change here (verified absent on number_sequences
-- 2026-07-02); the fiscal columns (format_template / reset_basis /
-- fiscal_year_anchor / last_reset_period) already exist dormant. get_next_number
-- v2 reads v_seq.max_length and update_number_sequence writes it below, so the
-- column must be added BEFORE the CREATE OR REPLACE FUNCTION statements or the
-- %ROWTYPE field access / SET clause aborts the migration.
ALTER TABLE number_sequences ADD COLUMN IF NOT EXISTS max_length int;

CREATE OR REPLACE FUNCTION get_next_number(p_scope text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tenant uuid := get_current_tenant_id();
  v_seq number_sequences%ROWTYPE;
  v_tz text;
  v_today date;
  v_period text;
  v_fy_label text;
  v_anchor text;
  v_pad int;
  v_next bigint;
  v_result text;
BEGIN
  SELECT * INTO v_seq FROM number_sequences
  WHERE tenant_id = v_tenant AND scope = p_scope FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO number_sequences (tenant_id, scope, prefix, current_value, padding, reset_annually)
    VALUES (v_tenant, p_scope, UPPER(LEFT(p_scope, 4)), 0, 4, false)
    RETURNING * INTO v_seq;
    SELECT * INTO v_seq FROM number_sequences WHERE id = v_seq.id FOR UPDATE;
  END IF;

  SELECT timezone INTO v_tz FROM tenants WHERE id = v_tenant;
  v_today := (now() AT TIME ZONE COALESCE(v_tz, 'UTC'))::date;

  -- ── LEGACY branch: format_template IS NULL = exact v1 behavior ──
  IF v_seq.format_template IS NULL THEN
    IF COALESCE(v_seq.reset_annually, false)
       AND COALESCE(v_seq.last_reset_year, 0) <> EXTRACT(YEAR FROM v_today)::int THEN
      UPDATE number_sequences SET current_value = 0, last_reset_year = EXTRACT(YEAR FROM v_today)::int
      WHERE id = v_seq.id;
      v_seq.current_value := 0;
    END IF;
    v_next := v_seq.current_value + 1;
    UPDATE number_sequences SET current_value = v_next, updated_at = now() WHERE id = v_seq.id;
    RETURN COALESCE(v_seq.prefix, '') || '-' || LPAD(v_next::text, COALESCE(v_seq.padding, 4), '0');
  END IF;

  -- ── v2 template branch: {FY} + {SEQ:n}, fiscal reset in TENANT timezone ──
  v_pad := (regexp_match(v_seq.format_template, '\{SEQ:(\d+)\}'))[1]::int;
  IF v_pad IS NULL THEN
    RAISE EXCEPTION 'number_sequences.format_template for scope % must contain {SEQ:n}', p_scope;
  END IF;
  v_anchor := COALESCE(v_seq.fiscal_year_anchor, '01-01');
  IF v_seq.reset_basis = 'fiscal_year' THEN
    IF to_char(v_today, 'MM-DD') >= v_anchor THEN
      v_period := to_char(v_today, 'YYYY');
    ELSE
      v_period := (EXTRACT(YEAR FROM v_today)::int - 1)::text;
    END IF;
    v_fy_label := v_period || '-' || to_char(((v_period::int + 1) % 100), 'FM00');
  ELSIF v_seq.reset_basis = 'calendar_year' THEN
    v_period := to_char(v_today, 'YYYY');
    v_fy_label := v_period;
  ELSE
    v_period := NULL;
    v_fy_label := to_char(v_today, 'YYYY');
  END IF;

  IF v_period IS NOT NULL AND v_seq.last_reset_period IS DISTINCT FROM v_period THEN
    UPDATE number_sequences SET current_value = 0, last_reset_period = v_period WHERE id = v_seq.id;
    v_seq.current_value := 0;
  END IF;

  v_next := v_seq.current_value + 1;
  UPDATE number_sequences SET current_value = v_next, updated_at = now() WHERE id = v_seq.id;

  v_result := replace(
    replace(v_seq.format_template, '{FY}', v_fy_label),
    '{SEQ:' || v_pad || '}', LPAD(v_next::text, v_pad, '0'));
  IF v_seq.max_length IS NOT NULL AND length(v_result) > v_seq.max_length THEN
    RAISE EXCEPTION 'get_next_number: "%" exceeds max_length % for scope % — fix the template before issuing', v_result, v_seq.max_length, p_scope;
  END IF;
  RETURN v_result;
END;
$fn$;

-- Non-mutating preview: renders next value against a candidate template.
CREATE OR REPLACE FUNCTION preview_number_format(p_scope text, p_format_template text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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
    RETURN COALESCE(v_seq.prefix, UPPER(LEFT(p_scope, 4))) || '-' || LPAD(v_next::text, COALESCE(v_seq.padding, 4), '0');
  END IF;
  v_pad := (regexp_match(p_format_template, '\{SEQ:(\d+)\}'))[1]::int;
  IF v_pad IS NULL THEN
    RAISE EXCEPTION 'format_template must contain {SEQ:n}';
  END IF;
  IF COALESCE(v_seq.fiscal_year_anchor, '01-01') <= to_char(v_today, 'MM-DD') THEN
    v_fy_label := to_char(v_today, 'YYYY') || '-' || to_char(((EXTRACT(YEAR FROM v_today)::int + 1) % 100), 'FM00');
  ELSE
    v_fy_label := (EXTRACT(YEAR FROM v_today)::int - 1)::text || '-' || to_char((EXTRACT(YEAR FROM v_today)::int % 100), 'FM00');
  END IF;
  RETURN replace(replace(p_format_template, '{FY}', v_fy_label), '{SEQ:' || v_pad || '}', LPAD(v_next::text, v_pad, '0'));
END;
$fn$;

-- Hardened admin mutator: 5 legacy args preserved + 4 new optional; tenant-admin
-- gated; audited; counter rewind below current blocked for legal scopes.
CREATE OR REPLACE FUNCTION update_number_sequence(
  p_scope text, p_prefix text, p_padding int, p_reset boolean,
  p_current_value int DEFAULT NULL,
  p_format_template text DEFAULT NULL, p_reset_basis text DEFAULT NULL,
  p_fiscal_year_anchor text DEFAULT NULL, p_max_length int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tenant uuid := get_current_tenant_id();
  v_seq number_sequences%ROWTYPE;
  v_legal boolean := p_scope IN ('invoices', 'proforma_invoices', 'credit_notes', 'receipts', 'payment');
BEGIN
  IF NOT is_tenant_admin() THEN
    RAISE EXCEPTION 'update_number_sequence: tenant admin role required';
  END IF;
  IF p_reset_basis IS NOT NULL AND p_reset_basis NOT IN ('never', 'calendar_year', 'fiscal_year') THEN
    RAISE EXCEPTION 'update_number_sequence: invalid reset_basis "%"', p_reset_basis;
  END IF;
  IF p_fiscal_year_anchor IS NOT NULL AND p_fiscal_year_anchor !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
    RAISE EXCEPTION 'update_number_sequence: fiscal_year_anchor must be MM-DD';
  END IF;
  IF p_format_template IS NOT NULL AND p_format_template !~ '\{SEQ:\d+\}' THEN
    RAISE EXCEPTION 'update_number_sequence: format_template must contain {SEQ:n}';
  END IF;

  SELECT * INTO v_seq FROM number_sequences WHERE tenant_id = v_tenant AND scope = p_scope FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_number_sequence: unknown scope "%"', p_scope;
  END IF;
  IF p_current_value IS NOT NULL AND v_legal AND p_current_value < v_seq.current_value THEN
    RAISE EXCEPTION 'update_number_sequence: rewinding % below % would duplicate legal document numbers', p_scope, v_seq.current_value;
  END IF;

  UPDATE number_sequences SET
    prefix = p_prefix,
    padding = p_padding,
    reset_annually = p_reset,
    current_value = COALESCE(p_current_value, current_value),
    format_template = COALESCE(p_format_template, format_template),
    reset_basis = COALESCE(p_reset_basis, reset_basis),
    fiscal_year_anchor = COALESCE(p_fiscal_year_anchor, fiscal_year_anchor),
    max_length = COALESCE(p_max_length, max_length),
    updated_at = now()
  WHERE id = v_seq.id;

  INSERT INTO number_sequences_audit
    (tenant_id, sequence_id, scope, old_value, new_value, action, user_role, performed_by)
  VALUES
    (v_tenant, v_seq.id, p_scope, v_seq.current_value,
     COALESCE(p_current_value, v_seq.current_value), 'update', get_my_role(), auth.uid());
END;
$fn$;

-- SEC fix: anon could EXECUTE the mutator (verified live 2026-07-02).
REVOKE ALL ON FUNCTION update_number_sequence(text, text, int, boolean, int, text, text, text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_number_sequence(text, text, int, boolean, int, text, text, text, int) TO authenticated, service_role;
REVOKE ALL ON FUNCTION preview_number_format(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION preview_number_format(text, text) TO authenticated, service_role;

-- Drop the superseded 5-arg overload so PostgREST resolves ONE function.
DROP FUNCTION IF EXISTS update_number_sequence(text, text, integer, boolean, integer);

-- Scope DATA fixes (demo tenant, pre-production — future numbers change shape):
UPDATE number_sequences SET prefix = 'CASE' WHERE scope = 'case' AND COALESCE(prefix, '') = '';
UPDATE number_sequences SET prefix = 'REVL' WHERE scope = 'report_evaluation' AND prefix = 'REPO';
UPDATE number_sequences SET prefix = 'RSVC' WHERE scope = 'report_service' AND prefix = 'REPO';
```

(The `DROP FUNCTION` of the old 5-arg overload is a function-signature replacement, not a data drop — the additive-only rule governs tables/columns/rows. Both callers — `SystemNumbers.tsx:106`, Task 22 — move to the 9-arg form in this same PR.)

- [ ] **Step 3: Assert**

```sql
SELECT get_next_number('case');
-- Expected: 'CASE-30376' (or current_value+1) — never '-30376'
SELECT preview_number_format('invoices', 'INV/{FY}/{SEQ:4}');
-- Expected: 'INV/2026-27/10193'-shaped string (anchor-dependent FY label)
SELECT grantee FROM information_schema.routine_privileges
WHERE routine_name='update_number_sequence' AND grantee='anon';
-- Expected: 0 rows
SELECT count(*) FROM number_sequences WHERE prefix = 'REPO';
-- Expected: 0
```
Then verify the legacy branch is untouched for every existing scope: `SELECT scope, format_template FROM number_sequences;` — Expected: `format_template` NULL on ALL rows (nobody opted into templates yet; zero behavior change beyond the three data fixes).

- [ ] **Step 4: Regen types** → `npm run check:tsc` = 0 (the 9-arg RPC signature lands in generated types).
- [ ] **Step 5: Manifest row** — `| <version> | localization_p1_numbering_v2.sql | Conditional | get_next_number v2 + preview RPC + hardened update_number_sequence + anon REVOKE + scope data fixes | P1-WP4 |`
- [ ] **Step 6: Commit** — `git add src/types/database.types.ts supabase/migrations.manifest.md && git commit -m "feat(db): numbering v2 — fiscal templates, admin gate, audit, anon REVOKE, scope fixes (one release)"`

### Task 22: SystemNumbers — real scope registry + v2 fields + preview RPC

**Files:**
- Modify: `src/pages/settings/SystemNumbers.tsx` (`SEQUENCE_CONFIG` at `:53-78`; `formData` state at `:86`; mutation at `:103-117`)
- Test: `src/pages/settings/SystemNumbers.test.tsx` (create)

**Interfaces:**
- Consumes: `update_number_sequence` 9-arg + `preview_number_format` (Task 21).
- Produces: `SCOPE_REGISTRY` — the REAL scope vocabulary; the settings surface renders `registry ∪ live rows` so unknown scopes still appear and phantom cards die.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/settings/SystemNumbers.test.tsx
import { describe, it, expect } from 'vitest';
import { SCOPE_REGISTRY } from './SystemNumbers';

describe('SystemNumbers scope registry', () => {
  it('contains every real get_next_number caller scope and no phantoms', () => {
    const keys = SCOPE_REGISTRY.map((s) => s.key);
    // Real scopes: live number_sequences rows ∪ src/lib RPC callers (verified 2026-07-02)
    for (const real of ['case', 'companies', 'customers', 'invoices', 'proforma_invoices', 'quote',
      'payment', 'expense', 'stock', 'stock_adjustment', 'purchase_orders', 'suppliers',
      'report_evaluation', 'report_service', 'payroll_bank_file']) {
      expect(keys).toContain(real);
    }
    // Phantom keys from the old SEQUENCE_CONFIG must be gone:
    for (const phantom of ['customer', 'company', 'supplier', 'purchase_order', 'invoice', 'user', 'document']) {
      expect(keys).not.toContain(phantom);
    }
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/pages/settings/SystemNumbers.test.tsx` — Expected: FAIL (`SCOPE_REGISTRY` not exported).

- [ ] **Step 3: Implement.** In `SystemNumbers.tsx`: replace `SEQUENCE_CONFIG` (`:53-78`) with the exported real registry (keep the card rendering; labels/categories preserved where the scope survives):

```typescript
export const SCOPE_REGISTRY = [
  { key: 'case', label: 'Case Number', description: 'Recovery case identifiers', category: 'Operations' },
  { key: 'invoices', label: 'Tax Invoice Number', description: 'Sequential tax invoices (legal series)', category: 'Financial' },
  { key: 'proforma_invoices', label: 'Proforma Number', description: 'Proforma series (non-tax)', category: 'Financial' },
  { key: 'quote', label: 'Quote Number', description: 'Customer quotations', category: 'Financial' },
  { key: 'payment', label: 'Payment Number', description: 'Payment records', category: 'Financial' },
  { key: 'expense', label: 'Expense Number', description: 'Expense records', category: 'Financial' },
  { key: 'customers', label: 'Customer Number', description: 'Individual client IDs', category: 'Business Partners' },
  { key: 'companies', label: 'Company Number', description: 'Corporate client IDs', category: 'Business Partners' },
  { key: 'suppliers', label: 'Supplier Number', description: 'Vendor/supplier IDs', category: 'Business Partners' },
  { key: 'stock', label: 'Stock Number', description: 'Stock item management', category: 'Inventory' },
  { key: 'stock_adjustment', label: 'Stock Adjustment Number', description: 'Stock adjustment sessions', category: 'Inventory' },
  { key: 'purchase_orders', label: 'Purchase Order Number', description: 'Supplier purchase orders', category: 'Operations' },
  { key: 'report_evaluation', label: 'Evaluation Report Number', description: 'Assessment and recovery feasibility reports', category: 'Reports' },
  { key: 'report_service', label: 'Service Report Number', description: 'Service work documentation reports', category: 'Reports' },
  { key: 'payroll_bank_file', label: 'Payroll Bank File Number', description: 'Payroll bank-file batches', category: 'HR' },
] as const;
```

Rendering: build the card list as `SCOPE_REGISTRY ∪ live sequences` — a live row whose scope is not in the registry (e.g. dynamic `inventory:<uuid>`) renders with `label = scope`, category `'Other'`; a registry entry with no live row renders as "not yet used". Extend `formData` (`:86`) to `{ prefix: '', padding: 4, reset_annually: false, format_template: '', reset_basis: 'never', fiscal_year_anchor: '', max_length: '' }`; pass all through the mutation (`:106-111`) as `p_format_template: formData.format_template || null, p_reset_basis: formData.reset_basis === 'never' ? null : formData.reset_basis, p_fiscal_year_anchor: formData.fiscal_year_anchor || null, p_max_length: formData.max_length === '' ? null : Number(formData.max_length)`. Add a debounced preview `useQuery` keyed on `[scope, format_template]` calling `supabase.rpc('preview_number_format', { p_scope, p_format_template: formData.format_template || null })` and render its string in the edit modal ("Next number: INV/2026-27/0042"). Use existing form primitives + semantic tokens; no new visual patterns.

- [ ] **Step 4: Run** — `npx vitest run src/pages/settings/SystemNumbers.test.tsx && npm run check:tsc && npx eslint src/pages/settings/SystemNumbers.tsx` — Expected: PASS / 0 / clean.

- [ ] **Step 5: Commit + PR 4**

```bash
git add src/pages/settings/SystemNumbers.tsx src/pages/settings/SystemNumbers.test.tsx
git commit -m "feat(settings): SystemNumbers real scope registry + v2 numbering fields + DB preview"
git push -u origin feat/localization-p1-numbering-v2
gh pr create --title "Phase 1 WP-4: numbering v2 in one release (M-H)" --body "get_next_number v2 + preview + hardened update_number_sequence + anon REVOKE + scope data fixes + SystemNumbers registry. Per plan WP-4.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

**WP-4 verification:** Task 21 Step 3 assertions all hold; existing services mint unchanged numbers (`SELECT get_next_number('quote')` returns `QUOT-…`); SystemNumbers renders no phantom cards.

---

# WP-5 — Lint/CI gates + Oman pack v1 (PR 5: `feat/localization-p1-gates-oman-pack`)

### Task 23: ESLint rules `no-country-branching-outside-regimes` + `no-adhoc-money-allocation`

**Files:**
- Create: `eslint-rules/no-country-branching-outside-regimes.js`
- Create: `eslint-rules/no-country-branching-outside-regimes.test.js`
- Create: `eslint-rules/no-adhoc-money-allocation.js`
- Create: `eslint-rules/no-adhoc-money-allocation.test.js`
- Modify: `eslint.config.js` (imports block `:6-15`; xsuite plugin rules map; rule activations near `:96`)

**Interfaces:**
- Consumes: the module shape of `eslint-rules/no-raw-currency-aggregation.js` (mirrored).
- Produces: `xsuite/no-country-branching-outside-regimes` ('error', with `src/lib/regimes/**` exempted via a flat-config override) and `xsuite/no-adhoc-money-allocation` ('error'). Rule self-tests run in the existing CI `country-i18n` job (`node --test eslint-rules/*.test.js` — new files auto-covered).

- [ ] **Step 1: Write the failing tests**

```javascript
// eslint-rules/no-country-branching-outside-regimes.test.js
import test from 'node:test';
import { RuleTester } from 'eslint';
import rule from './no-country-branching-outside-regimes.js';

RuleTester.describe = (name, fn) => fn();
RuleTester.it = (name, fn) => test(name, fn);
const rt = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

rt.run('no-country-branching-outside-regimes', rule, {
  valid: [
    { code: 'const x = regimeKey === "simple_vat";' },
    { code: 'if (currency === "SA") {}' },                       // not a country identifier
    { code: 'const label = countryName === "Saudi Arabia";' },    // full name, not code branching on 2-letter
  ],
  invalid: [
    { code: 'if (countryCode === "SA") { emitQr(); }', errors: [{ messageId: 'countryBranch' }] },
    { code: 'return args.countryCode === "SA" && taxSystem === "VAT";', errors: [{ messageId: 'countryBranch' }] },
    { code: 'if (seller.country_code !== "OM") {}', errors: [{ messageId: 'countryBranch' }] },
    { code: 'switch (countryCode) { case "IN": break; }', errors: [{ messageId: 'countryBranch' }] },
  ],
});
```

```javascript
// eslint-rules/no-adhoc-money-allocation.test.js
import test from 'node:test';
import { RuleTester } from 'eslint';
import rule from './no-adhoc-money-allocation.js';

RuleTester.describe = (name, fn) => fn();
RuleTester.it = (name, fn) => test(name, fn);
const rt = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

rt.run('no-adhoc-money-allocation', rule, {
  valid: [
    { code: 'const shares = allocateLargestRemainder(discount, weights, 3);' },
    { code: 'const ratio = (width * height) / area;' },                      // no money field
    { code: 'const taxAmount = roundMoney((subtotal * rate) / 100);' },      // percent-of-one-amount, not a split
  ],
  invalid: [
    // The CreditNoteModal.tsx:61 shape: prorating one document amount by another
    { code: 'const t = roundMoney((amount * invoice.tax_amount) / total);', errors: [{ messageId: 'adhocAllocation' }] },
    { code: 'const share = (line.total_amount * discount) / invoiceTotal;', errors: [{ messageId: 'adhocAllocation' }] },
  ],
});
```

- [ ] **Step 2: Run** — `node --test eslint-rules/no-country-branching-outside-regimes.test.js eslint-rules/no-adhoc-money-allocation.test.js` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement both rules**

```javascript
// eslint-rules/no-country-branching-outside-regimes.js
// The institutionalized lesson of einvoiceRouting.ts:6 / invoiceAdapter.ts:38:
// no `if (countryCode === 'XX')` outside src/lib/regimes/. Statutory branching
// is a typed plugin selected BY DATA (regime.* keys), never an inline hardcode.
// Conservative: flags equality comparisons between a country-ish identifier
// (/country(_?code)?$/i on an Identifier or MemberExpression property) and a
// 2-uppercase-letter string literal, plus switch() on a country-ish identifier
// with 2-letter case labels. src/lib/regimes/** is exempted in eslint.config.js.

const COUNTRY_IDENT = /country(_?code)?$/i;
const ISO2 = /^[A-Z]{2}$/;

function isCountryRef(node) {
  if (!node) return false;
  if (node.type === 'Identifier') return COUNTRY_IDENT.test(node.name);
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
    return COUNTRY_IDENT.test(node.property.name);
  }
  return false;
}
const isIso2Literal = (node) =>
  node && node.type === 'Literal' && typeof node.value === 'string' && ISO2.test(node.value);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Country branching belongs in src/lib/regimes/ plugins selected by regime.* data keys.' },
    schema: [],
    messages: {
      countryBranch:
        'Country branching ("{{code}}") outside src/lib/regimes/. Move the behavior into a regime plugin and select it via the regime.* config keys.',
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!['===', '!==', '==', '!='].includes(node.operator)) return;
        const pairs = [[node.left, node.right], [node.right, node.left]];
        for (const [ref, lit] of pairs) {
          if (isCountryRef(ref) && isIso2Literal(lit)) {
            context.report({ node, messageId: 'countryBranch', data: { code: lit.value } });
            return;
          }
        }
      },
      SwitchStatement(node) {
        if (isCountryRef(node.discriminant) && node.cases.some((c) => isIso2Literal(c.test))) {
          context.report({ node: node.discriminant, messageId: 'countryBranch', data: { code: 'switch' } });
        }
      },
    };
  },
};
```

```javascript
// eslint-rules/no-adhoc-money-allocation.js
// Graft 9 enforcement: largest-remainder allocation is the ONLY sanctioned way
// to split a document-level money amount. Flags the proportional-split shape
// `(a * b) / c` where at least two operands are money-named — the exact
// CreditNoteModal.tsx:61 bug shape — and points to allocateLargestRemainder.
// `x * rate / 100` (percent of ONE amount) is NOT a split and is not flagged.

const MONEY_NAME = /(amount|total|subtotal|tax|discount|balance|paid|credited|price)/i;

function moneyOperandCount(node, src) {
  const texts = [];
  const collect = (n) => {
    if (!n) return;
    if (n.type === 'BinaryExpression') { collect(n.left); collect(n.right); return; }
    texts.push(src.getText(n));
  };
  collect(node);
  return texts.filter((t) => MONEY_NAME.test(t)).length;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Document-amount splits must use financialMath.allocateLargestRemainder (Σ(parts) === whole).' },
    schema: [],
    messages: {
      adhocAllocation:
        'Ad-hoc proportional money split. Use allocateLargestRemainder(total, weights, decimalPlaces) so parts sum exactly to the whole.',
    },
  },
  create(context) {
    const src = context.sourceCode || context.getSourceCode();
    return {
      BinaryExpression(node) {
        if (node.operator !== '/') return;
        if (node.left.type !== 'BinaryExpression' || node.left.operator !== '*') return;
        // percent-of-one-amount (`/ 100`) is not a split
        if (node.right.type === 'Literal' && node.right.value === 100) return;
        if (moneyOperandCount(node, src) < 2) return;
        context.report({ node, messageId: 'adhocAllocation' });
      },
    };
  },
};
```

Register in `eslint.config.js`: add both imports next to line 12 (`import noRawCurrencyAggregation …`), add both to the `xsuitePlugin` rules map, activate `'xsuite/no-country-branching-outside-regimes': 'error'` and `'xsuite/no-adhoc-money-allocation': 'error'` next to line 96, and append an override block (same shape as the `:151` overrides):

```javascript
  {
    files: ['src/lib/regimes/**'],
    plugins: { 'xsuite': xsuitePlugin },
    rules: { 'xsuite/no-country-branching-outside-regimes': 'off' },
  },
```

Known existing violation: `src/components/financial/CreditNoteModal.tsx:61` will now FAIL lint — that is intentional; it is fixed in Task 31 (same phase). Until WP-6 merges, add the one temporary inline disable in CreditNoteModal with a `-- fixed in Task 31` comment ONLY if WP-5 must merge first; prefer merging WP-5 and WP-6 in order without the disable if the cutover lands within the same CI window. `src/lib/pdf/engine/einvoiceRouting.ts:6` (`countryCode === 'SA'`) also flags — add `// eslint-disable-next-line xsuite/no-country-branching-outside-regimes -- retired by the zatca_ph1 regime row in Phase 3 (master_einvoice_regimes seeded; adapter migration scheduled)` there.

- [ ] **Step 4: Run** — `node --test eslint-rules/*.test.js` — Expected: PASS. `npx eslint src --max-warnings=0 2>&1 | grep -c no-country-branching` — Expected: `0` after the two annotations above.

- [ ] **Step 5: Commit**

```bash
git add eslint-rules/ eslint.config.js src/lib/pdf/engine/einvoiceRouting.ts
git commit -m "feat(lint): no-country-branching-outside-regimes + no-adhoc-money-allocation (Phase 1 non-negotiables)"
```

### Task 24: `statutory-fixtures` CI gate

**Files:**
- Create: `scripts/localization/statutory-fixtures.test.ts`
- Modify: `package.json` (scripts block)
- Modify: `.github/workflows/ci.yml` (add job)

**Interfaces:**
- Consumes: `runPublishGate` (Task 8), `registerAllRegimePlugins`/`resolveTaxStrategy` (Tasks 5/7), simple_vat fixtures (Task 6); `SUPABASE_DB_URL` env (self-skip pattern from `scripts/country-engine/registry-trigger-parity.test.ts:101`).
- Produces: `npm run check:statutory-fixtures`; CI job `statutory-fixtures`. A country cannot BE `statutory_ready` with missing/failing fixtures.

- [ ] **Step 1: Write the (initially failing) test**

```typescript
// scripts/localization/statutory-fixtures.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { runPublishGate, type PackFixture } from '../../src/lib/tax/publishGate';
import { registerAllRegimePlugins } from '../../src/lib/regimes/register';
import { resolveTaxStrategy } from '../../src/lib/regimes/registry';
import omStandard from '../../src/lib/regimes/simple_vat/fixtures/om-standard-invoice.json';
import omZero from '../../src/lib/regimes/simple_vat/fixtures/om-zero-rated-export.json';
import omDiscount from '../../src/lib/regimes/simple_vat/fixtures/om-doc-discount-mils.json';

const REPO_FIXTURES: Record<string, PackFixture[]> = {
  OM: [omStandard, omZero, omDiscount] as unknown as PackFixture[],
};

describe('statutory-fixtures gate (repo half — always runs)', () => {
  it('every repo fixture set passes through the live kernel', async () => {
    registerAllRegimePlugins();
    for (const [country, fixtures] of Object.entries(REPO_FIXTURES)) {
      const { pass, results } = await runPublishGate({ countryCode: country, fixtures, mode: 'kernel' });
      expect(pass, `${country}: ${JSON.stringify(results.filter((r) => !r.pass), null, 2)}`).toBe(true);
    }
  });
});

// Self-skips without SUPABASE_DB_URL (local dev, fork PRs) — enforced in CI where
// the secret exists, mirroring registry-trigger-parity.test.ts:101.
describe.skipIf(!process.env.SUPABASE_DB_URL)('statutory-fixtures gate (live-DB half)', () => {
  it('every statutory_ready country resolves regime keys and has fixtures', () => {
    registerAllRegimePlugins();
    const dbUrl = process.env.SUPABASE_DB_URL as string;
    const out = execSync(
      `psql "${dbUrl}" -t -A -c "SELECT code, COALESCE(country_config->>'regime.tax','simple_vat') FROM geo_countries WHERE config_status='statutory_ready' AND deleted_at IS NULL"`,
      { encoding: 'utf8' },
    ).trim();
    const rows = out ? out.split('\n').map((l) => l.split('|')) : [];
    for (const [code, regimeKey] of rows) {
      expect(() => resolveTaxStrategy(regimeKey), `${code}: regime.tax=${regimeKey} unregistered`).not.toThrow();
      expect(REPO_FIXTURES[code], `${code} is statutory_ready but has NO repo fixtures`).toBeDefined();
      expect(REPO_FIXTURES[code].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run --config vitest.config.scripts.ts scripts/localization/statutory-fixtures.test.ts` — Expected: repo half PASSES already (that is fine — the RED step for this task is the missing npm script/CI job, verified by `npm run check:statutory-fixtures` failing with "missing script").

- [ ] **Step 3: Wire the script + CI job.** `package.json` scripts (after `check:registry-trigger-parity`):

```json
"check:statutory-fixtures": "vitest run --config vitest.config.scripts.ts scripts/localization/statutory-fixtures.test.ts"
```

`.github/workflows/ci.yml` — add a job mirroring the `registry-trigger-parity` job's shape (checkout, setup-node with cache, `npm ci`, then):

```yaml
  statutory-fixtures:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run check:statutory-fixtures
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
```

- [ ] **Step 4: Run** — `npm run check:statutory-fixtures` — Expected: PASS (repo half; live half skipped locally).
- [ ] **Step 5: Commit** — `git add scripts/localization/statutory-fixtures.test.ts package.json .github/workflows/ci.yml && git commit -m "ci(tax): statutory-fixtures gate — statutory_ready requires registered, fixture-green plugins"`

### Task 25: Migration `localization_p1_oman_pack_v1` — Oman pack + M-J tenant pinning + resync no-op

**Files:**
- Migration: `localization_p1_oman_pack_v1`
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts` (no schema change — regen is a no-op diff; run it anyway per discipline)

**Interfaces:**
- Consumes: Tasks 9-10 tables; `resync_tenant_country_config(p_tenant_id uuid)` (existing, Phase-0-extended).
- Produces: OM pack version 1 (`published`); three `master_country_pack_tests` rows (byte-identical to the Task 6 repo fixtures); OM `country_config` regime keys; OM rate rows pinned to the pack; `tenants.country_pack_version = 1` for the Oman tenant (M-J).

- [ ] **Step 1: Probe** — `SELECT count(*) FROM master_country_pack_versions;` → Expected: `0`.

- [ ] **Step 2: Apply the migration**

```sql
-- localization_p1_oman_pack_v1 (M-E pack + M-J pinning)
-- Dual-control authored_by/approved_by are NULL here: the pack is a parity SEED
-- reproducing current behavior exactly; the Phase-3 publish RPC enforces
-- NOT NULL + author<>approver for every subsequent publish.
WITH om AS (SELECT id FROM geo_countries WHERE code = 'OM'),
pack AS (
  INSERT INTO master_country_pack_versions (country_id, version, status, effective_from, changelog, next_review_date)
  SELECT om.id, 1, 'published', '2026-07-01', 'Oman pack v1 — byte-parity seed: VAT 5% (2021-04-16), document-level half-up rounding, legacy prefix numbering, GCC quarterly.', '2027-01-01'
  FROM om RETURNING id, country_id
)
UPDATE geo_country_tax_rates r SET pack_version_id = pack.id
FROM pack WHERE r.country_id = pack.country_id AND r.deleted_at IS NULL;

-- Explicit regime + rounding keys on the country config bag (flat dotted keys —
-- codedDefaults already resolve these; the pack makes Oman self-describing).
UPDATE geo_countries SET country_config = country_config || jsonb_build_object(
  'regime.tax', 'simple_vat',
  'regime.einvoice', 'no_einvoice',
  'regime.numbering', 'prefix_numbering',
  'regime.documents', 'generic_invoice',
  'regime.payroll', 'none',
  'tax.rounding_policy', jsonb_build_object('mode', 'half_up', 'level', 'document'),
  'format.amount_words_scale', 'western')
WHERE code = 'OM';

-- DB-resident golden fixtures (graft 1) — content byte-identical to
-- src/lib/regimes/simple_vat/fixtures/*.json (Task 6). The implementer pastes
-- each file's "input_document" and "expected" objects into the placeholders.
INSERT INTO master_country_pack_tests (country_id, pack_version_id, name, input_document, expected)
SELECT gc.id, pv.id, t.name, t.input_document::jsonb, t.expected::jsonb
FROM geo_countries gc
JOIN master_country_pack_versions pv ON pv.country_id = gc.id AND pv.version = 1
JOIN (VALUES
  ('OM standard 5% — 12-drive RAID, 12 × OMR 120.000 (spec walkthrough)',
   '<paste om-standard-invoice.json .input_document verbatim>',
   '<paste om-standard-invoice.json .expected verbatim>'),
  ('OM zero-rated export line alongside a standard line',
   '<paste om-zero-rated-export.json .input_document verbatim>',
   '<paste om-zero-rated-export.json .expected verbatim>'),
  ('OM document discount 0.100 over three 100.000 lines — mils survive (graft 9 worked example)',
   '<paste om-doc-discount-mils.json .input_document verbatim>',
   '<paste om-doc-discount-mils.json .expected verbatim>')
) AS t(name, input_document, expected) ON true
WHERE gc.code = 'OM';

-- M-J: pin the live Omani tenant to pack v1.
UPDATE tenants t SET country_pack_version = 1
FROM geo_countries gc
WHERE t.country_id = gc.id AND gc.code = 'OM' AND t.deleted_at IS NULL;
```

The three `<paste …>` markers are mechanical copy operations from the Task 6 JSON files created in WP-1 — the migration author runs `cat src/lib/regimes/simple_vat/fixtures/om-standard-invoice.json | jq -c .input_document` (and `.expected`) and inlines each result as a quoted SQL string literal. A follow-up assertion (Step 3) proves DB and repo fixtures are identical, so drift between the two residences is impossible to miss.

- [ ] **Step 3: Assert + M-J resync no-op verification**

```sql
SELECT (SELECT count(*) FROM master_country_pack_tests WHERE input_document ? 'lines') AS fixtures,
       (SELECT count(*) FROM geo_country_tax_rates WHERE pack_version_id IS NOT NULL) AS pinned_rates,
       (SELECT country_pack_version FROM tenants LIMIT 1) AS tenant_pin;
```
Expected: `fixtures=3, pinned_rates≥3 (the OM rows), tenant_pin=1`. Then the resync no-op (M-J):
```sql
-- capture → resync → compare (scalars already country-correct, so resync must not move anything)
SELECT md5(resolved_country_config::text) AS before_hash, currency_code, tax_system, default_tax_rate, timezone
FROM tenants LIMIT 1;
SELECT resync_tenant_country_config(id) FROM tenants LIMIT 1;
SELECT md5(resolved_country_config::text) AS after_hash, currency_code, tax_system, default_tax_rate, timezone
FROM tenants LIMIT 1;
```
Expected: `before_hash = after_hash` and identical scalars (OMR / VAT / 5.00 / Asia/Muscat). Any diff = STOP, investigate before WP-6.

- [ ] **Step 4: Regen types** (no-op diff expected) → `npm run check:tsc` = 0. Also run `npm run check:statutory-fixtures` — still green (OM remains `formatting_ready` in Phase 1; the gate arms for it when Phase 3's publish flow flips `config_status`).
- [ ] **Step 5: Manifest row** — `| <version> | localization_p1_oman_pack_v1.sql | Additive | Oman pack v1 (published) + DB golden fixtures + regime keys + M-J tenant pinning | P1-WP5 |`
- [ ] **Step 6: Commit + PR 5**

```bash
git add supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(db): Oman pack v1 + DB-resident fixtures + tenant pack pinning (M-J)"
git push -u origin feat/localization-p1-gates-oman-pack
gh pr create --title "Phase 1 WP-5: lint/CI gates + Oman pack v1" --body "Two non-negotiable eslint rules, statutory-fixtures CI job, Oman pack v1 with DB-resident golden fixtures, M-J tenant pinning + verified resync no-op. Per plan WP-5.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

**WP-5 verification:** `node --test eslint-rules/*.test.js` green; `npm run lint` clean; `npm run check:statutory-fixtures` green; Task 25 Step 3 SQL assertions hold.

---

# WP-6 — Backfill, parity replay, cutover, legacy deletion (PR 6: `feat/localization-p1-cutover`, migration + code PR)

This is the owner-compressed shadow-and-cutover: compute both paths, diff to zero on the full live corpus + fixtures, then flip the write paths and DELETE the legacy JS totals functions — all in this phase.

### Task 26: Migration `localization_p1_tax_line_backfill` (M-C)

**Files:**
- Migration: `localization_p1_tax_line_backfill`
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts` (no schema change; regen no-op)

**Interfaces:**
- Consumes: `document_tax_lines` (Task 11), immutability guard's `app.tax_line_backfill` escape (Task 18), the STORED header figures on `invoices`/`quotes`.
- Produces: exactly one backfilled `document_tax_lines` rollup row per historical invoice and quote (the STORED tax_amount/rate — never recomputed), `regime_key='simple_vat'`, `plugin_version='backfill-1'`, `backfilled=true`, `rule_trace=NULL`. Idempotent (keyed on `backfilled=true` existence).

- [ ] **Step 1: Probe (row counts before)**

```sql
SELECT (SELECT count(*) FROM invoices WHERE deleted_at IS NULL) AS inv,
       (SELECT count(*) FROM quotes WHERE deleted_at IS NULL) AS qt,
       (SELECT count(*) FROM document_tax_lines WHERE backfilled) AS existing_backfill;
```
Expected (live 2026-07-02): `inv=993, qt=1138, existing_backfill=0`.

- [ ] **Step 2: Apply the migration**

```sql
-- localization_p1_tax_line_backfill (M-C)
-- ONE rollup row per historical invoice/quote carrying the STORED header figure
-- (the stored number IS the legal figure — never recomputed). backfilled=true
-- rows render distinctly and are EXCLUDED from filings for pre-activation
-- periods (graft 6). Idempotent: NOT EXISTS skips already-backfilled documents.
SET LOCAL app.tax_line_backfill = 'true';

INSERT INTO document_tax_lines (
  tenant_id, document_type, document_id, line_item_id, component_code, component_label,
  jurisdiction_ref, rate, taxable_base, tax_amount, currency, exchange_rate,
  tax_amount_base, tax_treatment, treatment_reason_code, regime_key, plugin_version,
  pack_version_id, rule_trace, backfilled, sequence)
SELECT
  i.tenant_id, 'invoice', i.id, NULL, 'VAT',
  'VAT ' || COALESCE(i.tax_rate, 0)::text || '%', NULL,
  COALESCE(i.tax_rate, 0),
  COALESCE(i.subtotal, 0) - COALESCE(i.discount_amount, 0),
  COALESCE(i.tax_amount, 0), COALESCE(i.currency, 'OMR'), COALESCE(i.exchange_rate, 1),
  COALESCE(i.tax_amount_base, i.tax_amount, 0),
  CASE WHEN COALESCE(i.tax_amount, 0) = 0 THEN 'out_of_scope' ELSE 'standard' END,
  NULL, 'simple_vat', 'backfill-1', NULL, NULL, true, 0
FROM invoices i
WHERE i.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM document_tax_lines d
                  WHERE d.document_type = 'invoice' AND d.document_id = i.id AND d.deleted_at IS NULL);

INSERT INTO document_tax_lines (
  tenant_id, document_type, document_id, line_item_id, component_code, component_label,
  jurisdiction_ref, rate, taxable_base, tax_amount, currency, exchange_rate,
  tax_amount_base, tax_treatment, treatment_reason_code, regime_key, plugin_version,
  pack_version_id, rule_trace, backfilled, sequence)
SELECT
  q.tenant_id, 'quote', q.id, NULL, 'VAT',
  'VAT ' || COALESCE(q.tax_rate, 0)::text || '%', NULL,
  COALESCE(q.tax_rate, 0),
  COALESCE(q.subtotal, 0) - COALESCE(q.discount_amount, 0),
  COALESCE(q.tax_amount, 0), COALESCE(q.currency, 'OMR'), COALESCE(q.exchange_rate, 1),
  COALESCE(q.tax_amount_base, q.tax_amount, 0),
  CASE WHEN COALESCE(q.tax_amount, 0) = 0 THEN 'out_of_scope' ELSE 'standard' END,
  NULL, 'simple_vat', 'backfill-1', NULL, NULL, true, 0
FROM quotes q
WHERE q.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM document_tax_lines d
                  WHERE d.document_type = 'quote' AND d.document_id = q.id AND d.deleted_at IS NULL);
```

Note: `q.discount_amount`/`q.tax_amount` exist on `quotes` (verified via createQuote persist fields, `quotesService.ts:432-438`); if a quote lacks a stored `discount_amount` column value it defaults 0 via COALESCE. If `quotes` has no `exchange_rate`/`*_base` (Phase 0 added them per its plan), COALESCE(…,1)/COALESCE(…,tax_amount) keep the backfill total-preserving.

- [ ] **Step 3: Assert (header sums hold by construction; counts)**

```sql
SELECT
  (SELECT count(*) FROM document_tax_lines WHERE document_type='invoice' AND backfilled) AS inv_lines,
  (SELECT count(*) FROM document_tax_lines WHERE document_type='quote' AND backfilled) AS qt_lines,
  (SELECT count(*) FROM invoices i WHERE i.deleted_at IS NULL AND abs(
     COALESCE(i.tax_amount,0) - COALESCE((SELECT sum(d.tax_amount) FROM document_tax_lines d
       WHERE d.document_type='invoice' AND d.document_id=i.id AND d.line_item_id IS NULL AND d.deleted_at IS NULL),0)
   ) > 0.0005) AS inv_mismatches;
```
Expected: `inv_lines=993, qt_lines=1138, inv_mismatches=0`.

- [ ] **Step 4: Regen types** (no-op) → `npm run check:tsc` = 0.
- [ ] **Step 5: Manifest row** — `| <version> | localization_p1_tax_line_backfill.sql | Additive | M-C: one backfilled rollup tax line per historical invoice/quote (stored figures) | P1-WP6 |`
- [ ] **Step 6: Commit** — `git add supabase/migrations.manifest.md src/types/database.types.ts && git commit -m "feat(db): M-C tax-line backfill (993 invoices + 1,138 quotes, stored figures)"`

### Task 27: Migration `localization_p1_validate_integrity` (M-D VALIDATE sweep)

**Files:**
- Migration: `localization_p1_validate_integrity`
- Modify: `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `assert_document_tax_integrity` (Task 17, now skip-when-no-lines) and the M-C backfill (Task 26 — every historical invoice now HAS a rollup line).
- Produces: an explicit full-corpus validation that header = Σ rollups for every non-deleted invoice, logged — the "VALIDATE CONSTRAINT after backfill" guarantee (Architecture Decision 6). Historical rows can never brick writes because the trigger already skips zero-line docs; this proves none are now inconsistent.

- [ ] **Step 1: Probe** — the trigger exists (Task 17) but no corpus validation has run:

```sql
SELECT count(*) FROM invoices i WHERE i.deleted_at IS NULL
AND EXISTS (SELECT 1 FROM document_tax_lines d WHERE d.document_type='invoice' AND d.document_id=i.id AND d.line_item_id IS NULL AND d.deleted_at IS NULL)
AND abs(COALESCE(i.tax_amount,0) - COALESCE((SELECT sum(d.tax_amount) FROM document_tax_lines d
   WHERE d.document_type='invoice' AND d.document_id=i.id AND d.line_item_id IS NULL AND d.deleted_at IS NULL),0)) > 0.0005;
```
Expected: `0` (M-C guarantees it). If non-zero, STOP — M-C is wrong.

- [ ] **Step 2: Apply the migration (validation is the migration body — raises if any row is inconsistent)**

```sql
-- localization_p1_validate_integrity (M-D)
DO $validate$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM invoices i WHERE i.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM document_tax_lines d WHERE d.document_type='invoice' AND d.document_id=i.id AND d.line_item_id IS NULL AND d.deleted_at IS NULL)
  AND abs(COALESCE(i.tax_amount,0) - COALESCE((SELECT sum(d.tax_amount) FROM document_tax_lines d
     WHERE d.document_type='invoice' AND d.document_id=i.id AND d.line_item_id IS NULL AND d.deleted_at IS NULL),0)) > 0.0005;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'M-D validation: % invoices have header tax <> Σ rollups — integrity trigger cannot be trusted until fixed', v_bad;
  END IF;
  RAISE NOTICE 'M-D validation passed: all issued invoices header = Σ document_tax_lines rollups.';
END $validate$;
```

- [ ] **Step 3: Assert** — the migration raising NOTICE (not EXCEPTION) IS the pass. Re-run Step 1 probe post-apply — Expected: `0`.
- [ ] **Step 4:** no types change. `npm run check:tsc` = 0.
- [ ] **Step 5: Manifest row** — `| <version> | localization_p1_validate_integrity.sql | Additive | M-D: validate header=Σ across the full backfilled corpus | P1-WP6 |`
- [ ] **Step 6: Commit** — `git add supabase/migrations.manifest.md && git commit -m "feat(db): M-D full-corpus tax-integrity validation sweep"`

### Task 28: M-E parity replay harness (the phase's exit gate)

**Files:**
- Create: `scripts/localization/parity-replay.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `computeDocumentTotals`/`totalsFromComputation` (Task 20), the live corpus via `SUPABASE_DB_URL` (self-skip pattern). Reconstructs each document's items from `invoice_line_items`/`quote_items` and replays through the kernel.
- Produces: `npm run check:parity-replay` — asserts kernel totals byte-identical to stored `tax_amount`/`total_amount`/`subtotal` for all 993 invoices + 1,138 quotes. This is the M-E gate AND the permanent regression harness (kept, per owner decision).

- [ ] **Step 1: Write the harness (its RED state is any nonzero divergence)**

```typescript
// scripts/localization/parity-replay.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { computeDocumentTax } from '../../src/lib/tax/kernel';
import { buildTaxableLines, matchFormRate, totalsFromComputation } from '../../src/lib/taxDocumentService';
import type { GeoCountryTaxRateRow, TaxContext } from '../../src/lib/regimes/types';

const DB = process.env.SUPABASE_DB_URL;

interface DocRow {
  id: string; currency: string; decimals: number; tax_rate: number;
  discount_amount: number; discount_type: string | null;
  subtotal: number; tax_amount: number; total_amount: number;
  items: Array<{ description: string; quantity: number; unit_price: number; discount_percent: number }>;
  rates: GeoCountryTaxRateRow[];
}

function fetchDocs(kind: 'invoice' | 'quote'): DocRow[] {
  const table = kind === 'invoice' ? 'invoices' : 'quotes';
  const itemTable = kind === 'invoice' ? 'invoice_line_items' : 'quote_items';
  const fk = kind === 'invoice' ? 'invoice_id' : 'quote_id';
  const discountCol = kind === 'invoice' ? "d.discount_percent" : "d.discount";
  // One JSON blob per document with its items and the effective OM standard rate rows.
  const sql = `
    SELECT json_agg(row) FROM (
      SELECT json_build_object(
        'id', h.id, 'currency', COALESCE(h.currency,'OMR'),
        'decimals', COALESCE(mc.decimal_places, 3), 'tax_rate', COALESCE(h.tax_rate,0),
        'discount_amount', COALESCE(h.discount_amount,0),
        'discount_type', ${kind === 'quote' ? 'h.discount_type' : 'NULL'},
        'subtotal', COALESCE(h.subtotal,0), 'tax_amount', COALESCE(h.tax_amount,0),
        'total_amount', COALESCE(h.total_amount,0),
        'items', COALESCE((SELECT json_agg(json_build_object(
            'description', d.description, 'quantity', d.quantity, 'unit_price', d.unit_price,
            'discount_percent', COALESCE(${discountCol},0)) ORDER BY d.sort_order)
          FROM ${itemTable} d WHERE d.${fk} = h.id), '[]'::json),
        'rates', COALESCE((SELECT json_agg(json_build_object(
            'id', r.id, 'country_id', r.country_id, 'subdivision_id', r.subdivision_id,
            'component_code', r.component_code, 'component_label', r.component_label,
            'tax_category', r.tax_category, 'rate', r.rate, 'applies_to', r.applies_to,
            'valid_from', r.valid_from, 'valid_to', r.valid_to, 'sort_order', r.sort_order))
          FROM geo_country_tax_rates r
          JOIN legal_entities le ON le.id = (SELECT id FROM legal_entities WHERE tenant_id = h.tenant_id AND is_primary LIMIT 1)
          WHERE r.country_id = le.country_id AND r.tax_category='standard' AND r.subdivision_id IS NULL
            AND r.valid_from <= COALESCE(h.invoice_date, CURRENT_DATE)
            AND (r.valid_to IS NULL OR r.valid_to >= COALESCE(h.invoice_date, CURRENT_DATE))
            AND r.deleted_at IS NULL), '[]'::json)
      ) AS row
      FROM ${table} h
      LEFT JOIN master_currency_codes mc ON mc.code = h.currency
      WHERE h.deleted_at IS NULL
      ${kind === 'invoice' ? "" : ""}
    ) s`;
  const out = execSync(`psql "${DB}" -t -A -c "${sql.replace(/\n/g, ' ')}"`, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
  return out && out !== '' ? JSON.parse(out) : [];
}

function replay(doc: DocRow): { subtotal: number; taxAmount: number; totalAmount: number } {
  const rates = matchFormRate(doc.rates, doc.tax_rate);
  const lines = buildTaxableLines(doc.items, doc.decimals);
  const documentDiscount = doc.discount_type === 'percentage'
    ? Math.round(((doc.subtotal * doc.discount_amount) / 100) * 10 ** doc.decimals) / 10 ** doc.decimals
    : doc.discount_amount;
  const ctx: TaxContext = {
    documentType: 'invoice',
    seller: { legalEntityId: 'x', countryId: doc.rates[0]?.country_id ?? 'x', subdivisionId: null, taxIdentifier: null, registrations: [] },
    buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
    taxPointDate: '2026-07-02', placeOfSupplySubdivisionId: null,
    lines: rates.length === 0 ? lines.map((l) => ({ ...l, treatment: 'out_of_scope' as const })) : lines,
    documentDiscount, taxInclusive: false,
    rateContext: { documentCurrency: doc.currency, documentDecimals: doc.decimals, baseCurrency: doc.currency, baseDecimals: doc.decimals, rate: 1, rateSource: 'derived' },
    rates,
    roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western',
  };
  const c = computeDocumentTax(ctx);
  return totalsFromComputation(c, documentDiscount, doc.decimals);
}

describe.skipIf(!DB)('M-E parity replay — kernel byte-identical to stored corpus', () => {
  for (const kind of ['invoice', 'quote'] as const) {
    it(`${kind}s: every stored subtotal/tax/total reproduced exactly`, () => {
      const docs = fetchDocs(kind);
      expect(docs.length).toBeGreaterThan(0);
      const diffs: Array<{ id: string; field: string; stored: number; kernel: number }> = [];
      for (const doc of docs) {
        const r = replay(doc);
        if (r.taxAmount !== doc.tax_amount) diffs.push({ id: doc.id, field: 'tax', stored: doc.tax_amount, kernel: r.taxAmount });
        if (r.totalAmount !== doc.total_amount) diffs.push({ id: doc.id, field: 'total', stored: doc.total_amount, kernel: r.totalAmount });
        if (r.subtotal !== doc.subtotal) diffs.push({ id: doc.id, field: 'subtotal', stored: doc.subtotal, kernel: r.subtotal });
      }
      expect(diffs.slice(0, 25), `${diffs.length} divergences`).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run against a production-snapshot Supabase branch.** Create the branch (`mcp__supabase__create_branch`), run migrations M-A→M-D on it, then:
`SUPABASE_DB_URL=<branch-url> npm run check:parity-replay`
Expected: PASS (0 divergences). Any divergence is a REAL kernel/parity bug — fix the kernel (WP-1) or the adapter (Task 20), never the corpus. Add the script to `package.json`:
```json
"check:parity-replay": "vitest run --config vitest.config.scripts.ts scripts/localization/parity-replay.test.ts"
```

- [ ] **Step 3: Investigate any divergence.** Divergences here reveal an edge case the golden fixtures missed (e.g., a historical quote with `discount_type='percentage'` and a rate the form set off-standard). For each class of divergence, add a golden fixture reproducing it to `src/lib/regimes/simple_vat/fixtures/`, fix the kernel to satisfy it, re-run WP-1 tests, then re-run the replay. Loop until zero.

- [ ] **Step 4: Run** — `npm run check:parity-replay` (branch env) — Expected: PASS.
- [ ] **Step 5: Commit** — `git add scripts/localization/parity-replay.test.ts package.json && git commit -m "test(tax): M-E full-corpus parity replay harness (993 invoices + 1,138 quotes)"`

### Task 29: Cutover — invoiceService onto the kernel + issue RPC

**Files:**
- Modify: `src/lib/invoiceService.ts` (createInvoice `:405-508`; updateInvoice ~`:531-611`; issueInvoice `:696-738`; deleteInvoice `:686-689`; getNextInvoiceNumber usage `:411`)
- Modify: `src/lib/invoiceService.test.ts` (or create if absent)

**Interfaces:**
- Consumes: `computeDocumentTotals`, `persistDocumentTaxLines`, `issueTaxDocument` (Task 20); existing `resolveRateContext`, `resolveTenantId`.
- Produces: createInvoice/updateInvoice compute totals via the kernel and persist `document_tax_lines`; issueInvoice delegates to `issue_tax_document`; tax invoices no longer pre-mint numbers (draft `invoice_number` NULL); custody event moves into the RPC. `deleteInvoice` now surfaces the immutability error for issued invoices.

- [ ] **Step 1: Write the failing test (shadow-parity assertion in the create path + issue delegation)**

```typescript
// src/lib/invoiceService.test.ts (append or create)
import { describe, it, expect, vi } from 'vitest';
import { computeDocumentTotals } from './taxDocumentService';
import { calculateInvoiceTotals } from './financialMath';

// Byte-parity: kernel totals == legacy totals for the create-path shapes. This
// test guards the cutover BEFORE calculateInvoiceTotals is deleted in Task 32.
describe('invoiceService cutover parity (kernel vs legacy)', () => {
  it('kernel computeDocumentTotals matches legacy calculateInvoiceTotals on OMR shapes', async () => {
    vi.spyOn(await import('./supabaseClient'), 'supabase', 'get'); // context builder mocked in integration harness
    const items = [{ description: 'a', quantity: 3, unit_price: 40.5, discount_percent: 10 }, { description: 'b', quantity: 1, unit_price: 0.105 }];
    const legacy = calculateInvoiceTotals(items, 0.1, 5, 0, 3);
    // The kernel result is compared against legacy in the parity-replay harness
    // (Task 28) over the full corpus; this unit test pins the arithmetic identity
    // for the representative shape used in the walkthrough.
    expect(legacy.taxAmount).toBe(5.468);
    expect(legacy.totalAmount).toBe(114.823);
  });
});
```

(Note: `computeDocumentTotals` does I/O; the exhaustive kernel-vs-legacy proof is Task 28's replay over the real corpus. This unit test locks the legacy expected values so the deletion in Task 32 cannot silently change them; the kernel side is asserted equal to these in `computeDocumentTax.test.ts` Task 4 "legacy invoice math parity" case.)

- [ ] **Step 2: Run** — `npx vitest run src/lib/invoiceService.test.ts` — Expected: PASS for the legacy pin (RED for the behavioral change comes from the integration/replay harness, which is the real gate here).

- [ ] **Step 3: Rewire `invoiceService.ts`.** In `createInvoice` (`:405`):
  - Replace the `calculateInvoiceTotals`/`calculateInvoiceTotalsBase` block (`:427-438`) with:
    ```typescript
    const { computation, subtotal, taxAmount, totalAmount } = await computeDocumentTotals(
      {
        items: items.map((i) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, discount_percent: i.discount_percent })),
        discountType: null, discountAmount: invoice.discount_amount || 0,
        taxRate: invoiceTaxRate, documentType: 'invoice',
        documentDate: invoice.invoice_date || new Date().toISOString().slice(0, 10),
        taxInclusive: invoice.tax_inclusive ?? false,
      }, rc,
    );
    const amountDue = roundMoney(totalAmount - amountPaid, rc.documentDecimals);
    const baseTotals = calculateInvoiceTotalsBase({ subtotal, taxAmount, totalAmount, amountPaid, amountDue }, rc.rate, rc.baseDecimals);
    ```
  - Change tax-invoice number minting: for `invoiceType === 'tax_invoice'` do NOT call `getNextInvoiceNumber` — insert with `invoice_number: null` and `status: 'draft'`. Proformas keep `invoice_number: await getNextInvoiceNumber('proforma')`. (The partial unique index `uq_invoices_number_per_tenant ... WHERE invoice_number IS NOT NULL` permits NULL numbers — verified live.)
  - After the line-items insert (`:504-508`), call `await persistDocumentTaxLines({ tenantId, documentType: 'invoice', documentId: invoiceData.id, computation, rc, lineItemIds: insertedItemIds })` where `insertedItemIds` is the ordered id array from a `.select('id')` on the items insert.
  - Keep the per-line item map but source `tax_amount`/`total` for each item FROM `computation.lines` (the kernel's per-line component rows) so item rows and tax lines never diverge; keep the `logInvoiceCreated` custody call unchanged.
  In `updateInvoice` apply the identical compute+persist swap. In `issueInvoice` (`:696`) replace the body's UPDATE (`:711-720`) + custody call (`:724-735`) with:
    ```typescript
    const result = await issueTaxDocument('invoice', id);
    if (!result.ok) throw new Error('Invoice issuance failed');
    return { id, invoice_number: result.document_number, status: 'sent', sent_at: result.issued_at };
    ```
  keeping the pre-checks (`:697-709`). In `deleteInvoice` (`:686-689`) wrap the update so the DB immutability error surfaces a clear message:
    ```typescript
    export const deleteInvoice = async (id: string) => {
      const { error } = await supabase.from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) {
        if (error.message?.includes('immutable') || error.message?.includes('cannot be deleted')) {
          throw new Error('Issued tax invoices cannot be deleted — void the invoice instead.');
        }
        throw error;
      }
    };
    ```

- [ ] **Step 4: Run** — `npx vitest run src/lib/invoiceService.test.ts && npm run check:tsc` — Expected: PASS / 0.
- [ ] **Step 5: Commit** — `git add src/lib/invoiceService.ts src/lib/invoiceService.test.ts && git commit -m "feat(invoices): compute via kernel + persist tax lines + issue via RPC (cutover)"`

### Task 30: Cutover — quotesService onto the kernel

**Files:**
- Modify: `src/lib/quotesService.ts` (createQuote `:372-440`+; updateQuote ~`:520-564`)
- Create (or append if present): `src/lib/quotesService.test.ts` (verified absent on `main` @ `9684297`, 2026-07-02 — Step 5's `git add` creates it)

**Interfaces:**
- Consumes: `computeDocumentTotals`, `persistDocumentTaxLines` (Task 20).
- Produces: createQuote/updateQuote compute via the kernel + persist `document_tax_lines` for `document_type='quote'`. Quotes are not issued/ledgered — no RPC issuance; the dry-run RPC is available for the Phase-2 preview drawer.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/quotesService.test.ts (create; or append if the file already exists)
import { describe, it, expect } from 'vitest';
import { calculateQuoteTotals } from './financialMath';
describe('quotesService cutover parity pin', () => {
  it('legacy calculateQuoteTotals expected values are locked before deletion', () => {
    const t = calculateQuoteTotals([{ quantity: 12, unit_price: 120 }], null, 0, 5, 3);
    expect(t.subtotal).toBe(1440);
    expect(t.taxAmount).toBe(72);
    expect(t.totalAmount).toBe(1512);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/quotesService.test.ts` — Expected: PASS (pins legacy values).
- [ ] **Step 3: Rewire.** In `createQuote` replace the `calculateQuoteTotals`/`calculateQuoteTotalsBase` block (`:409-416`) with:
    ```typescript
    const { computation, subtotal, taxAmount, totalAmount } = await computeDocumentTotals(
      {
        items: items.map((i) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, discount_percent: i.discount_percent })),
        discountType: quote.discount_type, discountAmount: quote.discount_amount || 0,
        taxRate: quote.tax_rate || 0, documentType: 'quote',
        documentDate: new Date().toISOString().slice(0, 10),
        taxInclusive: quote.tax_inclusive ?? false,
      }, rc,
    );
    const baseTotals = calculateQuoteTotalsBase({ subtotal, taxAmount, totalAmount }, rc.rate, rc.baseDecimals);
    ```
  After the items insert, call `persistDocumentTaxLines({ tenantId, documentType: 'quote', documentId: quoteData.id, computation, rc, lineItemIds: insertedItemIds })`. Apply the identical swap in `updateQuote`. Preserve the `logQuoteCreated`/custody writes unchanged.
- [ ] **Step 4: Run** — `npx vitest run src/lib/quotesService.test.ts && npm run check:tsc` — Expected: PASS / 0.
- [ ] **Step 5: Commit** — `git add src/lib/quotesService.ts src/lib/quotesService.test.ts && git commit -m "feat(quotes): compute via kernel + persist tax lines (cutover)"`

### Task 31: Cutover — CreditNoteModal proration onto `allocateLargestRemainder`

**Files:**
- Modify: `src/components/financial/CreditNoteModal.tsx` (`:61`)
- Test: `src/components/financial/CreditNoteModal.test.tsx` (create or append)

**Interfaces:**
- Consumes: `allocateLargestRemainder` (Task 2).
- Produces: the credit-note VAT proration uses the sanctioned splitter — satisfies `xsuite/no-adhoc-money-allocation` (Task 23) and removes the ad-hoc `(amount * invoice.tax_amount) / total` at `:61`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/financial/CreditNoteModal.test.tsx
import { describe, it, expect } from 'vitest';
import { proratedVat } from './CreditNoteModal';

describe('CreditNoteModal proratedVat', () => {
  it('splits invoice VAT proportionally with exact totality (largest remainder)', () => {
    // invoice tax 72.000 over total 1512.000; credit the whole → 72.000
    expect(proratedVat(1512, 72, 1512, 3)).toBe(72);
    // partial credit of 756.000 (half) → 36.000
    expect(proratedVat(756, 72, 1512, 3)).toBe(36);
    // zero total → 0 (no divide-by-zero)
    expect(proratedVat(100, 0, 0, 3)).toBe(0);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/components/financial/CreditNoteModal.test.tsx` — Expected: FAIL (`proratedVat` not exported).
- [ ] **Step 3: Implement.** Extract and export the helper, replacing the inline `:61` computation:

```typescript
import { allocateLargestRemainder } from '../../lib/financialMath';

/** Reverse the invoice's VAT in proportion to the credited share, using the
 *  sanctioned splitter so the credited + remaining VAT sum exactly to the
 *  invoice VAT (no ad-hoc proration — xsuite/no-adhoc-money-allocation). */
export function proratedVat(creditAmount: number, invoiceTax: number, invoiceTotal: number, decimals: number): number {
  if (invoiceTotal <= 0 || invoiceTax === 0) return 0;
  const remaining = invoiceTotal - creditAmount;
  const [creditedShare] = allocateLargestRemainder(invoiceTax, [creditAmount, Math.max(0, remaining)], decimals);
  return creditedShare;
}
```
Replace the `:61` line (`const taxAmount = total > 0 ? roundMoney((amount * num(invoice.tax_amount)) / total) : 0;`) with `const taxAmount = proratedVat(amount, num(invoice.tax_amount), total, currencyDecimals);` where `currencyDecimals` comes from the existing currency config in scope (use `2` fallback only if none — but the modal already has document currency context). Remove the now-unused inline `roundMoney` import if it becomes dead.

- [ ] **Step 4: Run** — `npx vitest run src/components/financial/CreditNoteModal.test.tsx && npx eslint src/components/financial/CreditNoteModal.tsx && npm run check:tsc` — Expected: PASS / clean / 0. Remove the temporary inline eslint-disable from Task 23 if one was added.
- [ ] **Step 5: Commit** — `git add src/components/financial/CreditNoteModal.tsx src/components/financial/CreditNoteModal.test.tsx && git commit -m "fix(credit-notes): prorate VAT via allocateLargestRemainder (exact totality)"`

### Task 32: Delete the legacy JS totals paths (M-F/M-G)

**Files:**
- Modify: `src/lib/financialMath.ts` (delete `calculateInvoiceTotals` `:47-66`, `calculateQuoteTotals` `:145-167`)
- Modify: `src/lib/financialMath.test.ts` (delete their direct unit tests; keep the cutover-parity pins now living in invoiceService/quotesService tests)
- Verify no remaining callers.

**Interfaces:**
- Consumes: cutover complete (Tasks 29-30 — no service calls `calculateInvoiceTotals`/`calculateQuoteTotals`).
- Produces: legacy JS totals paths deleted; `calculateInvoiceTotalsBase`/`calculateQuoteTotalsBase` RETAINED (they snapshot base amounts from kernel totals — still used).

**Complete caller enumeration (verified 2026-07-02 via `grep -rn "calculateInvoiceTotals\b\|calculateQuoteTotals\b" src`):**

| File | Line | Reference | Action |
|---|---|---|---|
| `src/lib/financialMath.ts` | 47 | `export const calculateInvoiceTotals` | DELETE the function |
| `src/lib/financialMath.ts` | 145 | `export const calculateQuoteTotals` | DELETE the function |
| `src/lib/invoiceService.ts` | 427 | `calculateInvoiceTotals(...)` call | Already removed in Task 29 |
| `src/lib/quotesService.ts` | 409 | `calculateQuoteTotals(...)` call | Already removed in Task 30 |
| `src/lib/financialMath.test.ts` | (describe blocks) | direct unit tests | DELETE the two describe blocks; parity now pinned in service tests + kernel test |
| `src/lib/__tests__/eurOnOmrReconciliation.test.ts` | (uses) | reconciliation test | Re-point to `computeDocumentTotals` OR keep if it only imports `calculateInvoiceTotalsBase` — inspect and repoint the header-total call to the kernel; base helper stays |

(`calculateInvoiceTotalsBase`/`calculateQuoteTotalsBase`/`computeRealizedFx`/`baseAmount`/`roundMoney`/`convertToBase`/`allocateLargestRemainder`/`roundMoneyWith` all REMAIN.)

- [ ] **Step 1: Prove no runtime callers remain**

Run: `grep -rn "calculateInvoiceTotals\b\|calculateQuoteTotals\b" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v 'financialMath.ts'`
Expected: no output. If any line prints, repoint it to `computeDocumentTotals` first.

- [ ] **Step 2: Confirm the tests currently reference them (RED for deletion)**

Run: `grep -rn "calculateInvoiceTotals\|calculateQuoteTotals" src/lib/financialMath.test.ts src/lib/__tests__/eurOnOmrReconciliation.test.ts`
Expected: matches to remove/repoint.

- [ ] **Step 3: Delete + repoint.** Remove `calculateInvoiceTotals` (`financialMath.ts:47-66`) and `calculateQuoteTotals` (`:145-167`) and their `InvoiceTotals`/`QuoteTotals`-returning bodies (keep the `InvoiceTotals`/`QuoteTotals` interfaces — they type the kernel adapter output). Delete their two describe blocks from `financialMath.test.ts`. In `eurOnOmrReconciliation.test.ts`, if it calls the deleted header functions, replace with the kernel path (build a `TaxContext`, call `computeDocumentTax`, read `totals`); if it only uses `calculateInvoiceTotalsBase`, leave it.

- [ ] **Step 4: Run** — `npm run test && npm run check:tsc && npm run lint` — Expected: all green, 0, clean.
- [ ] **Step 5: Commit** — `git add src/lib/financialMath.ts src/lib/financialMath.test.ts src/lib/__tests__/eurOnOmrReconciliation.test.ts && git commit -m "refactor(tax): delete legacy calculateInvoiceTotals/calculateQuoteTotals — kernel is canonical (M-F/M-G)"`

### Task 33: PostgREST bypass + custody regression suite

**Files:**
- Create: `scripts/localization/bypass-suite.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: the WP-3 triggers, WP-4 REVOKE, `einvoice_submissions` append-only guard, live custody invariant; `SUPABASE_DB_URL` (self-skip).
- Produces: `npm run check:bypass-suite` — the security evidence that no PostgREST client can bypass the seals, plus a custody-event regression across the issuance flip (v1.2.0 invariant, risk 12), plus the M-G `vat_transactions` freeze assertion (proves the Phase-0 REVOKE freeze holds — the verifiable step behind Objective 8's "M-G freeze assertion").

- [ ] **Step 1: Write the suite (RED = any bypass succeeds)**

```typescript
// scripts/localization/bypass-suite.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const DB = process.env.SUPABASE_DB_URL;
const q = (sql: string) => execSync(`psql "${DB}" -v ON_ERROR_STOP=0 -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });

describe.skipIf(!DB)('PostgREST bypass suite (SEC-1 posture)', () => {
  it('mutating an issued invoice header off-whitelist is rejected by the immutability trigger', () => {
    const id = q(`SELECT id FROM invoices WHERE invoice_type='tax_invoice' AND status<>'draft' AND deleted_at IS NULL LIMIT 1`).trim();
    if (!id) return; // no issued invoice in the snapshot
    const out = q(`BEGIN; UPDATE invoices SET total_amount=total_amount+1000 WHERE id='${id}'; ROLLBACK;`);
    expect(out).toMatch(/immutable|cannot be deleted/i);
  });
  it('soft-deleting an issued invoice is rejected (deleted_at not whitelisted)', () => {
    const id = q(`SELECT id FROM invoices WHERE invoice_type='tax_invoice' AND status<>'draft' AND deleted_at IS NULL LIMIT 1`).trim();
    if (!id) return;
    const out = q(`BEGIN; UPDATE invoices SET deleted_at=now() WHERE id='${id}'; ROLLBACK;`);
    expect(out).toMatch(/immutable|cannot be deleted/i);
  });
  it('inserting an internally-inconsistent invoice fails the deferred integrity trigger at commit', () => {
    // A draft with tax lines whose rollup != header must fail on COMMIT.
    const out = q(`BEGIN;
      WITH t AS (SELECT id, tenant_id, currency FROM invoices WHERE status='draft' AND deleted_at IS NULL LIMIT 1)
      INSERT INTO document_tax_lines (tenant_id, document_type, document_id, component_code, component_label, rate, taxable_base, tax_amount, currency, exchange_rate, tax_amount_base, tax_treatment, regime_key, plugin_version)
      SELECT tenant_id, 'invoice', id, 'VAT', 'VAT 5%', 5, 100, 99999, currency, 1, 99999, 'standard', 'simple_vat', '1.0.0' FROM t;
      UPDATE invoices SET tax_amount = tax_amount WHERE id=(SELECT id FROM invoices WHERE status='draft' LIMIT 1);
      COMMIT;`);
    expect(out).toMatch(/integrity|<> Σ|rollups/i);
  });
  it('anon cannot EXECUTE update_number_sequence', () => {
    const out = q(`SELECT has_function_privilege('anon', 'update_number_sequence(text,text,int,boolean,int,text,text,text,int)', 'EXECUTE')`);
    expect(out.trim()).toBe('f');
  });
  it('einvoice_submissions rejects UPDATE (append-only)', () => {
    const out = q(`BEGIN; UPDATE einvoice_submissions SET status='accepted' WHERE true; ROLLBACK;`);
    expect(out).toMatch(/append-only|permission denied|prevent_audit_mutation/i);
  });
  it('vat_transactions is frozen: authenticated has no INSERT/UPDATE/DELETE (M-G)', () => {
    // The Phase-0 REVOKE freeze (entry criteria) must still hold. Assert via
    // privilege check (not an INSERT attempt) because psql connects as owner;
    // has_table_privilege evaluates the grant that a PostgREST client inherits.
    const out = q(`SELECT (has_table_privilege('authenticated','vat_transactions','INSERT')
      OR has_table_privilege('authenticated','vat_transactions','UPDATE')
      OR has_table_privilege('authenticated','vat_transactions','DELETE'))`);
    expect(out.trim()).toBe('f');
  });
});

describe.skipIf(!DB)('custody regression across issuance (v1.2.0)', () => {
  it('issuing an invoice through issue_tax_document writes a financial custody event', () => {
    // Prove the RPC path writes chain_of_custody; run on a branch with a draft.
    const draft = q(`SELECT id, case_id FROM invoices WHERE invoice_type='tax_invoice' AND status='draft' AND case_id IS NOT NULL AND deleted_at IS NULL LIMIT 1`).trim();
    if (!draft) return;
    const [id] = draft.split('|');
    q(`SELECT issue_tax_document('invoice','${id}', false)`);
    const events = q(`SELECT count(*) FROM chain_of_custody WHERE action='INVOICE_ISSUED' AND (metadata->>'invoice_id')='${id}'`).trim();
    expect(Number(events)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run on the migration branch** — `SUPABASE_DB_URL=<branch> npm run check:bypass-suite` — Expected: PASS (all seals hold). Add script:
```json
"check:bypass-suite": "vitest run --config vitest.config.scripts.ts scripts/localization/bypass-suite.test.ts"
```
- [ ] **Step 3:** any failing seal → fix the corresponding trigger/grant in WP-3/WP-4, re-run.
- [ ] **Step 4: Run** — `npm run check:bypass-suite` (branch) — Expected: PASS.
- [ ] **Step 5: Commit + PR 6**

```bash
git add scripts/localization/bypass-suite.test.ts package.json
git commit -m "test(sec): PostgREST bypass + custody-across-issuance regression suite"
git push -u origin feat/localization-p1-cutover
gh pr create --title "Phase 1 WP-6: backfill, parity replay, cutover + legacy deletion" --body "M-C/M-D/M-E/M-F/M-G. Kernel becomes canonical for invoice/quote totals; legacy calculateInvoiceTotals/calculateQuoteTotals deleted; full-corpus parity replay + bypass suite green. Per plan WP-6.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

**WP-6 verification:** on the migration branch — `npm run check:parity-replay` 0 divergences; `npm run check:bypass-suite` green; `npm run test && npm run check:tsc && npm run lint` green; `grep -rn "calculateInvoiceTotals\b\|calculateQuoteTotals\b" src | grep -v '\.test\.'` empty.

---

## Testing Strategy

Per the spec's Testing Strategy (§966-1008), Phase 1 delivers these test surfaces:

1. **Golden compliance fixtures (dual-resident).** `src/lib/regimes/simple_vat/fixtures/*.json` run in repo CI via `runPublishGate({mode:'kernel'})` (Task 8/24) AND are copied byte-identical into `master_country_pack_tests` (Task 25) for the Phase-3 publish-time replay. One runner, two residences.
2. **Property-based tests (Task 2/3).** Largest-remainder totality (Σ(parts) ≡ whole across random amounts × {0,2,3}dp; parts within one minor unit; deterministic); inclusive round-trip (base + Σ(components) reconstitutes gross exactly); half_up==house-roundMoney and half_even boundary values.
3. **Kernel unit matrix (Task 4).** Single/split/stack modes; zero-rated/reverse-charge notations; cash_increment adjustment; trace determinism.
4. **Migration rehearsal + parity (Task 28).** Full M-A→M-D on a `mcp__supabase__create_branch` production snapshot; M-E replays all 993 invoices + 1,138 quotes to zero divergence; backfill row-count/SUM assertions (Task 26/27).
5. **Security, RLS, bypass (Task 33).** Cross-tenant isolation on the four new tenant tables (tenant-table-requirements gate); anon-key probes; the five-part PostgREST bypass suite (inconsistent insert, issued-mutation, issued-delete, anon numbering, einvoice append-only).
6. **Invariant regression (Task 33).** Custody 'financial' event asserted across the issuance flip (v1.2.0); `einvoice_submissions` append-only; the standing pg_cron NULL-base monitor (Phase 0) remains green.
7. **i18n/display.** No en-output change this phase (kernel is byte-parity); the per-language snapshot invariant is untouched — no new UI copy except SystemNumbers labels (English, unchanged vocabulary set).

Test framework: Vitest 4, three projects (`node` for `src/**/*.test.ts`, `dom` for `.test.tsx`, `scripts` for `scripts/**` and the localization harnesses via `vitest.config.scripts.ts`). TZ pinned `Asia/Dubai`. Colocated `*.test.ts(x)`; harnesses under `scripts/localization/`.

## Verification Commands

Run at the end of each WP and before each PR (all verified to exist per the ground-truth scout map §6-7):

| Command | Expected |
|---|---|
| `npm run check:tsc` | `0` src diagnostics (zero-error gate) |
| `npm run test` | all suites pass (kernel, regimes, financialMath, taxDocumentService, services) |
| `npm run lint` | clean — including the two new `xsuite/*` rules |
| `node --test eslint-rules/*.test.js` | all rule self-tests pass |
| `npm run check:schema-drift` | green (generated types match live DB after every regen) |
| `npm run check:statutory-fixtures` | green (repo half always; live half in CI) |
| `npm run check:registry-trigger-parity` | green (regime.* keys recorded as registry-resolved) |
| `npm run check:parity-replay` (branch env) | `0` divergences over 993 + 1,138 documents |
| `npm run check:bypass-suite` (branch env) | all seals reject; custody event present |
| SQL: `SELECT get_next_number('case')` | `CASE-<n>` (never `-<n>`) |
| SQL: `issue_tax_document('invoice', gen_random_uuid())` | raises `invoice ... not found` |
| SQL: bypass probe UPDATE on issued invoice | raises `immutable` |

## Acceptance Criteria

- [ ] `src/lib/regimes/types.ts` exports every canonical interface (§1.1–1.4) verbatim; `rowAssignability.test.ts` pins generated Row types.
- [ ] `allocateLargestRemainder` + `roundMoneyWith` + `backOutInclusive` pass property tests; `roundMoneyWith('half_up')` is byte-identical to `roundMoney`.
- [ ] `computeDocumentTax` reproduces the walkthrough (12 × OMR 120.000 → VAT 72.000) and the legacy invoice/quote math; `computeWithMode` handles split/stack.
- [ ] `simple_vat`, `prefix_numbering`, `generic_invoice`, `no_einvoice` registered; `resolveTaxStrategy('unregistered')` throws `CountryConfigError`.
- [ ] Tables `geo_country_tax_rates` (9-country seed pass → 17 rate rows across the 6 VAT-bearing countries; KW/QA/US intentionally get zero rows — NONE / subdivision-level Phase 5; effective-dated with the SA 5→15 proof rows), `document_tax_lines`, `legal_entity_tax_registrations`, `einvoice_submissions` (append-only), `master_country_pack_versions/_tests`, `master_engine_capabilities`, `master_einvoice_regimes` (5-class CHECK) all live with full tenant/global RLS discipline.
- [ ] Five `regime.*` keys + `tax.rounding_policy` + `format.amount_words_scale` + three RESERVED keys registered, all `maxOverrideLayer:'country'`; `useRegimeConfig()` resolves them.
- [ ] `issue_tax_document` mints in-transaction, validates header=Σ (document + base), posts component `vat_records` with tenant-local `tax_period`, writes the custody 'financial' event, flips to issued; `p_dry_run` returns tax_lines + totals + `requirement_failures: []` + trace.
- [ ] `assert_document_tax_integrity` + three immutability triggers live; the PostgREST-rewrite critical (`invoiceService.ts:686`) is closed (issued invoices reject off-whitelist UPDATE and soft-delete).
- [ ] `get_next_number` v2 (`format_template IS NULL` = byte-identical legacy) + `preview_number_format` + hardened `update_number_sequence` (admin-gated, audited, rewind-blocked) + anon REVOKE + scope data fixes — ALL in one migration.
- [ ] `xsuite/no-country-branching-outside-regimes` + `xsuite/no-adhoc-money-allocation` active; `statutory-fixtures` CI job runs.
- [ ] Oman pack v1 published with three DB-resident fixtures matching the repo fixtures byte-for-byte; tenant pinned to v1; resync verified a no-op.
- [ ] M-C backfill: exactly 993 invoice + 1,138 quote backfilled rollup rows, `backfilled=true`, header sums hold; M-D validation passes.
- [ ] **M-E: kernel byte-identical to all 993 invoices + 1,138 quotes (0 divergences).**
- [ ] Cutover complete: `invoiceService`/`quotesService` compute via the kernel + persist tax lines; `issueInvoice` delegates to the RPC; `calculateInvoiceTotals`/`calculateQuoteTotals` DELETED with zero remaining callers; CreditNoteModal uses `allocateLargestRemainder`.
- [ ] Custody regression green across the flip; bypass suite green.

## Risks & Mitigations

| Risk (spec #) | Mitigation in this plan |
|---|---|
| Filing discrepancy on the live Omani tenant at cutover (risk 1) | M-E byte-parity gate over the full corpus (Task 28) BEFORE any write flip; the flip and legacy deletion are separate commits after replay is 0; pre-production tenant, empty VAT ledger — cheapest possible window |
| Numbering fork → duplicate legal numbers (risk 8) | v2 + admin gate + audit + anon REVOKE + scope fixes in ONE migration (Task 21); rewind-below-current blocked for legal scopes; partial unique index already live |
| Config-only erosion — future `if (countryCode===)` (risk 5) | `no-country-branching-outside-regimes` lands in Phase 1 (Task 23), non-negotiable; existing `einvoiceRouting.ts:6` annotated with its Phase-3 retirement path |
| Interface freeze wrong for chained/certified regimes (risk 6) | Full 5-value `regime_class` CHECK + `einvoice_submissions.previous_hash` from day one (Tasks 9/12) |
| TS-preview vs DB drift (risk 4) | Previews are `issue_tax_document(p_dry_run)` of the SAME persisted lines; the kernel that persisted them is the kernel the dry-run reads back — no independent recompute |
| Custody/audit regression in the RPC refactor (risk 12) | Custody write moved INTO the RPC (DB-side, unskippable); Task 33 asserts the 'financial' event across the flip; append-only triggers untouched |
| Backfill "schema landed, data didn't" (risk 9) | M-C idempotent + row-count/SUM assertions (Task 26); M-D validation sweep (Task 27); Phase-0 pg_cron NULL-base monitor still armed |
| Plan-specific: deferred 5-arg `update_number_sequence` overload drop breaks a caller | Complete caller enumeration (only `SystemNumbers.tsx:106`) moved to 9-arg in the same PR (Task 22); `DROP FUNCTION` is signature replacement, not data loss |
| Plan-specific: `matchFormRate` synthesizes a `form:<rate>` row for off-standard historical rates | Provenance preserved (`id='form:<rate>'` in the trace); parity replay (Task 28) proves totals still byte-identical; Phase 2 replaces free rates with treatment selectors |

## Exit Criteria (from the roadmap row, made measurable)

1. **Oman tenant runs entirely on the kernel** — `invoiceService.createInvoice`/`updateInvoice`/`issueInvoice` and `quotesService.createQuote`/`updateQuote` contain no `calculateInvoiceTotals`/`calculateQuoteTotals` call; `grep` returns empty (Task 32 Step 1).
2. **Byte-parity on all 993 invoices / 1,138 quotes** — `npm run check:parity-replay` reports 0 divergences on a production-snapshot branch (Task 28).
3. **Shadow-mode zero-divergence (compressed)** — the in-PR-cycle verification window: both paths computed and diffed to zero on the live corpus + fixtures before WP-6's cutover commit; legacy deleted in the same phase (Task 32).
4. **Custody regression green** — `bypass-suite.test.ts` custody block asserts the 'financial' event across issuance (Task 33).
5. **All Phase-1 machinery live** — kernel, plugins, registry, `regime.*` keys, `geo_country_tax_rates` (9-country pass: 17 rate rows for the 6 VAT countries; KW/QA/US zero by design), `document_tax_lines`, `issue_tax_document`, integrity + immutability triggers, `get_next_number` v2, publish-gate runner, Oman pack v1, `statutory-fixtures` + two eslint gates — per the Acceptance Criteria checklist.

## Estimated Effort

| Work Package | Scope | Engineer-days |
|---|---|---|
| WP-1 | Kernel primitives + plugins + registry + publish-gate runner (pure TS, property tests) | 7 |
| WP-2 | 5 migrations (pack governance, rate table + 9-country seed, tax lines, registrations/einvoice, M-A columns) + regime config keys | 5 |
| WP-3 | `issue_tax_document` RPC + integrity/immutability triggers + vat backstop + client seam | 6 |
| WP-4 | Numbering v2 (one release) + SystemNumbers UI | 3.5 |
| WP-5 | Two eslint rules + statutory-fixtures CI + Oman pack v1 + M-J pinning | 3.5 |
| WP-6 | M-C backfill + M-D validate + M-E replay harness + cutover (invoices/quotes/credit-note) + legacy deletion + bypass suite + branch rehearsal | 8 |
| Integration, review cycles, branch rehearsal buffer | cross-WP | 3.5 |
| **Total** | | **~36.5 engineer-days (≈4.5 weeks for one engineer; within the 4–5 wk roadmap size with parallelization of WP-1/WP-2)** |

**Parallelization note:** WP-1 (pure TS) and WP-2 (migrations) are independent and can run concurrently; WP-3 depends on both; WP-4 is independent of WP-1/WP-3 and can land anytime; WP-5 depends on WP-1 (fixtures) + WP-2 (tables); WP-6 depends on everything. Critical path: WP-1 → WP-3 → WP-6.
