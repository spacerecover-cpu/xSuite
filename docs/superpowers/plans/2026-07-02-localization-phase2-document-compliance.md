# Phase 2 — Document Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every rendered financial document (quote, invoice, credit note, POS stock sale) legally compliant by DEFAULT for the GCC-6 and any simple-VAT country — country facts wired into every pdfService build path, compliance profiles driving titles/bands/columns, statutory field requirements enforced inside `issue_tax_document`, buyer/seller issuance snapshots, structured addresses, unit/item codes persisted, and one totals row per tax component rendered from stored `document_tax_lines` (never a re-summed scalar).

**Architecture:** The Phase 1 fiscal kernel already computes and persists `document_tax_lines`; Phase 2 makes documents *render* and *gate* on that truth. The dead-but-tested country layer (`getResolvedCountryFacts` → `countryTemplateOverride` → `resolveTemplateConfigWithCountry`) is wired into all eight `build*ViaEngine` paths in `pdfService.ts` (R4), a `DocumentComplianceProfile` plugin (resolved via the `regime.documents` key) feeds the same override that the pdfmake adapters AND the React previews consume, and `master_document_requirements` rows are evaluated inside the `issue_tax_document` RPC so no raw-REST client can skip the gate. Per the owner's ceremony-compression decision, the invoice/quote/credit-note legacy pdfmake builders are deleted in this phase after parity is re-verified — the engine becomes the only render path for those three doc types.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query v5, Supabase (Postgres 15, RLS, SECURITY DEFINER RPCs via `mcp__supabase__apply_migration`, `project_id ssmbegiyjivrcwgcqutu`), pdfmake (sole PDF library), Vitest 4 (node + jsdom projects, TZ pinned `Asia/Dubai`), lucide-react, Tailwind semantic tokens.

**Entry criteria (Phase 0 + Phase 1 merged to `main`):**
- Phase 1 kernel live: `src/lib/regimes/types.ts` (all contract §1.1–§1.4 interfaces including `DocumentComplianceProfile`, `TaxDocumentType`, `TaxComputation`, `DocumentNotation`, `RuleTrace`, `TaxableLine`, `TaxTreatment`), `src/lib/regimes/registry.ts` (`registerRegimePlugin`, `resolveDocumentProfile`, `resolveTaxStrategy`), `src/lib/tax/kernel/` (`computeDocumentTax`), `src/lib/tenantToday.ts` (`tenantToday(timezone)`).
- Phase 1 schema live: `document_tax_lines`, `geo_country_tax_rates` (9 countries seeded), `legal_entity_tax_registrations`, `master_country_pack_versions`, `master_country_pack_tests`, `einvoice_submissions`; snapshot columns on `invoices`/`quotes`/`credit_notes` (`tax_inclusive`, `supply_date`, `place_of_supply_subdivision_id`, `buyer_tax_number`, `buyer_tax_number_label`, `buyer_address`, `seller_tax_number`, `reverse_charge`, `expected_withholding`, `tax_regime_key`, `regime_snapshot`, `pack_version_id`, `notations`); line-item columns (`unit_code`, `unit_label`, `item_code`, `tax_treatment`, `treatment_reason_code`) on `invoice_line_items`/`quote_items`/`credit_note_items`/`stock_sale_items`.
- Phase 1 RPC live: `issue_tax_document(p_doc_type, p_doc_id, p_dry_run DEFAULT false)` is the canonical issuance path for **invoice and quote** (invoiceService.issueInvoice already delegates to it); its Phase 1 body carries a marked stub comment `-- Phase 2: requirement gate` between the FOR UPDATE lock and number minting. **Credit-note issuance is owned by a separate RPC** — `issue_credit_note(p_cn, p_items)` (contract §2.7; called by `creditNoteService.issueCreditNote`, `src/lib/creditNoteService.ts:38`) — which mints the credit-note number and posts contra `vat_records`; Phase 2 (Task 18 Edit D) grafts the identical requirement gate + snapshot stamping into it so credit notes are gated exactly like invoices. `issue_tax_document('credit_note', …, true)` remains available for the dry-run/explain surface (Task 15).
- Phase 1 config live: five `regime.*` keys in `COUNTRY_CONFIG_REGISTRY` (`src/lib/country/registry.ts`), resolved values present in `tenants.resolved_country_config` jsonb, `useRegimeConfig()` on `TenantConfigContext`; Oman pack v1 published, Oman tenant pinned (`tenants.country_pack_version = 1`); M-E 993-invoice/1,138-quote parity gate green.
- Repo gates green on main: `npm run check:tsc` = 0 errors, `npm run test`, `npm run lint`, schema-drift.

---

## Global Constraints

Verbatim repo rules every task inherits:

- **Additive-only migrations** — no `DROP TABLE`, no `DELETE FROM`, no column drops. (Replacing a SECURITY DEFINER function body, or `DROP FUNCTION` to change a function signature before re-creating it, is permitted — it is not data-destructive.)
- **Every new tenant-scoped table** gets `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, RLS ENABLED + FORCED, RESTRICTIVE `{table}_tenant_isolation` policy, PERMISSIVE op policies (financial writes gated `has_role('accounts')`), `set_<table>_tenant_and_audit` trigger, `idx_<table>_tenant_id` partial index, `deleted_at timestamptz`. (This phase creates only GLOBAL `master_*` tables: SELECT `USING (true)` for authenticated, writes `is_platform_admin()` only.)
- **Soft deletes only** — set `deleted_at = now()`, never hard-delete rows.
- `maybeSingle()` never `single()`.
- `src/types/database.types.ts` is **generated** — regen via `mcp__supabase__generate_typescript_types` after every migration; never hand-edit.
- **Migration discipline per PR:** apply via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) → regen types → update ALL callers → append a row to `supabase/migrations.manifest.md` (markdown table `| version | filename | classification | summary | PR |`) → use `.github/PULL_REQUEST_TEMPLATE/migration.md`.
- `npm run check:tsc` must stay at **0 errors**.
- **pdfmake-only** PDFs; `@react-pdf/renderer` is not installed.
- **lucide-react** icons only.
- **Semantic theme tokens only** — no `purple/indigo/violet`, no raw brand hexes; PDFs stay neutral (`PDF_COLORS` fixed).
- No new npm packages without checking existing ones first.
- Custody/audit tables append-only; the v1.2.0 custody 'financial' event on issuance is preserved verbatim.
- Import `Database` only from `src/types/database.types.ts`.
- Query keys centralized in `src/lib/queryKeys.ts`; feature gating via `PermissionsContext`.
- eslint gates active: `xsuite/no-country-branching-outside-regimes` (no `if (countryCode === ...)` outside `src/lib/regimes/`), `xsuite/no-adhoc-money-allocation` (use `allocateLargestRemainder` only), banned-tables, `no-untranslated-jsx-text`, token rules.

---

## Objectives

1. **R4 wiring** — `getResolvedCountryFacts` + `countryTemplateOverride` + `resolveTemplateConfigWithCountry` (all built, all currently dead code with zero non-test callers) wired into **every** `pdfService` engine build path: invoice (`pdfService.ts:115`), quote (`:157`), payment_receipt (`:194`), payslip (`:230`), office_receipt/customer_copy (`:274`), checkout_form (`:339`), case_label (`:379`), chain_of_custody (`:420`), plus the new credit_note path. Country facts resolve off the tenant's **primary legal entity** `country_id`.
2. **DocumentComplianceProfile consumed** — the `regime.documents` plugin (default `generic_invoice`; this phase ships `gcc_tax_invoice`) drives document titles (TAX INVOICE vs INVOICE by seller registration + `tax_invoice_required`), registration bands, forced columns, bilingual mode, and paper size — through `countryTemplateOverride` into the pdfmake adapters AND the React preview components (preview/print parity is an exit gate).
3. **Requirements gate in-RPC** — `master_document_requirements` rows evaluated inside `issue_tax_document`; `level='block'` stops issuance (unskippable via raw REST), `level='warn'` surfaces in the UI; requirements apply only after the tenant's pack activation (`tenants.country_pack_version IS NOT NULL`).
4. **Issuance snapshots** — `buyer_tax_number` (+ label), `buyer_address` jsonb (subdivision resolved to its NAME), `seller_tax_number` (from `legal_entities.tax_identifier`), `supply_date` (default `tenantToday`), `reverse_charge` (derived from component treatments) and `notations` (statutory reverse-charge / zero-rated notes frozen from the treatments) — stamped by `issue_tax_document` (invoice/quote) and `issue_credit_note` (credit_note) at issuance, rendered from the stored columns thereafter.
5. **Structured addresses** — `address_line1/2`, `subdivision_id` (FK `geo_subdivisions`), `postal_code` on `customers_enhanced`/`companies`/`suppliers`; shared capture UI; country-ordered rendering on documents.
6. **Units & item codes** — `master_unit_codes` (UN/ECE Rec-20 + India UQC mapping); `unit_code`/`unit_label`/`item_code` persisted on all four line-item tables (today the forms collect a Unit that services silently drop — `quotesService.ts:474-484`, `invoiceService.ts:488-500`); line-item form fields.
7. **Component-row totals** — one totals row and one tax-summary row per `document_tax_lines` rollup component on PDFs and previews; header figures rendered from **stored** amounts, killing the render-time recompute at `invoiceAdapter.ts:143-150`.
8. **POS tax threading** — `record_stock_sale(p_sale, p_items, p_tax_lines DEFAULT NULL)`; stock sales get `document_tax_lines` + `vat_records` parity with invoices.
9. **M-I** — historical documents never re-rendered: sealed Document Studio artifacts stay canonical, reprints use `document_instances.resolved_data`, new columns nullable for legacy rows, adapters degrade gracefully when `document_tax_lines` is empty, `backfilled` rows badge as reconstructed history.

## Non-goals

- **Platform subscription billing** — separate workstream (owner E4). Reuses these primitives; never appears in this phase.
- **ReturnComposer / `tax_return_lines` / filing UI** — Phase 3.
- **Country Authoring Studio, publish governance UI, CLDR import job** — Phase 3 (this phase seeds `master_document_requirements`/`master_unit_codes` via migration, authored to the same closed vocabularies the Phase 3 Studio will manage).
- **India (`in_gst`, HSN/UQC *validation*, GSTIN capture UI, lakh grouping, indian-scale words)** — Phase 4. This phase persists `item_code`/`unit_code` and reserves the rendering columns; it does not validate them against Indian rules.
- **US (`us_sales_tax`), Avalara/TaxJar adapters, profile-relaxed proforma ceremony in production, UK MTD, ZATCA Phase 2** — Phase 5. (`requiresTaxInvoiceCeremony` ships on the profile now; only `gcc_tax_invoice`/`generic_invoice` — both `true` — are registered this phase.)
- **Payroll/leave packs, privacy regimes, unclaimed-property implementation** — Phase 6.
- **Engine cutover for non-financial doc types** (office_receipt, customer_copy, checkout_form, case_label, chain_of_custody, payslip, stock_label, report) — they receive the R4 country layer on their existing engine paths but keep the `VITE_PDF_ENGINE_*` flag mechanism and their legacy builders. Only invoice/quote/credit-note cut over and delete legacy builders this phase (they are the statutory surfaces; payment_receipt cutover rides Phase 3).
- **Data-migration workbook Unit column** (`workbookContract.ts`) — deferred to the first post-Phase-2 workbook rev; single-file change by design, not on the compliance critical path.
- **Per-line tax-rate divergence in the form UI** (mixed-rate documents) — the kernel and `document_tax_lines` support it from Phase 1; the form-level treatment selector ships here but per-line *rate* entry lands with India (Phase 4).
- **`emailTemplates` / portal language / RTL logical-property sweep** — separate i18n program (audit §1.9), not document compliance.
- **Currency fail-loud on a missing symbol** — the residual empty-string currency fallback in the adapters (`invoiceData.accounting_locales?.currency_symbol || ''`) is a defensive floor only; `currencyToBlock` already sources the symbol from the Country Engine (single source), so a real misconfiguration is owned by the Phase 0/1 currency invariant work, not re-litigated here. Phase 2 never fabricates `'USD'`.
- **Place-of-supply capture UI** — the `place_of_supply_subdivision_id` column exists and `issue_tax_document` reads it into the requirement facts, but a per-line/per-document place-of-supply *picker* is a `split_by_place_of_supply` (India, Phase 4) / `jurisdiction_stack` (US, Phase 5) concern. GCC is single-jurisdiction (`schemeMode 'single'`) and seeds no `place_of_supply_subdivision_id` requirement rows, so no capture UI ships this phase.

## Architecture Decisions

**AD-1: The country layer enters through the existing cascade slot, not a new mechanism.**
`resolveTemplateConfigWithCountry(builtIn, country, theme, docType, instance)` already exists (`templateConfig.ts:1396-1405`, unit-tested, zero production callers) with the cascade built-in → country → theme → doc-type → instance. R4 wiring = swapping `resolveTemplateConfig` for `resolveTemplateConfigWithCountry` at the eight call sites and building the `country` override from facts + profile. *Rationale:* the mechanism was designed for exactly this; Studio/tenant overrides stay on top so a tenant rename still wins. *Rejected:* per-country template rows (195 templates — the locked blind-spot decision), or resolving country config inside adapters (adapters stay pure data-mappers).

**AD-2: `DocumentComplianceProfile` feeds `countryTemplateOverride`, which feeds everything.**
The profile is consumed in exactly one place — an extended `countryTemplateOverride(facts, compliance?)` — producing a `TemplateConfigOverride` (title, taxBar, language, paper, forced columns, locale). Adapters and React previews both read the resolved config, so print and preview cannot diverge structurally. *Rationale:* single choke point; the contract names `countryTemplateOverride` as the profile consumer. *Rejected:* adapters calling `resolveDocumentProfile` directly (two sources of truth; previews drift).

**AD-3: Component tax rows render from `document_tax_lines`; stored header amounts are the fallback; nothing is recomputed at render.**
Adapter totals/taxSummary iterate document-level rollup rows (`line_item_id IS NULL`) ordered by `sequence`, printing frozen `component_label` + stored `tax_amount`. When a document has zero tax lines (pre-kernel legacy rows without the M-C backfill, or `backfilled` rows), the adapter renders ONE row from the **stored** header `tax_amount`/`tax_rate` — never the `(subtotal − discount) × rate` recompute currently at `invoiceAdapter.ts:143-150`. *Rationale:* the printed figure must equal the ledger figure (spec Critical, `invoiceAdapter.ts:146`). *Rejected:* keeping the recompute as a "cross-check that wins" — wrong money on a legal document.

**AD-4: Direct cutover for invoice/quote/credit-note; legacy builders deleted this phase.**
Per owner decision (no long dual-path coexistence; flags removed by phase end): the `isPdfEngineEnabled('invoice'|'quote')` ternaries become unconditional engine calls, credit notes get a first-ever engine adapter routed unconditionally, and `src/lib/pdf/documents/{InvoiceDocument,QuoteDocument,CreditNoteDocument}.ts` are deleted after the existing engine↔legacy parity suites are green one final time and goldens are re-baselined to engine output. *Rationale:* pre-production, exhaustive parity harness exists (`invoiceParity.test.ts` etc.), and compliance work landed twice (adapter + legacy) is pure waste. *Rejected:* enabling `VITE_PDF_ENGINE_*` env flags in deploy config (leaves the dead path plus an env foot-gun).

**AD-5: Requirement evaluation is a standalone SQL function called by the RPC.**
`evaluate_document_requirements(p_doc_type, p_country_id, p_as_of, p_facts jsonb)` is a pure, STABLE, independently-testable function over the contract's closed condition vocabulary; `issue_tax_document` builds the facts jsonb and calls it. *Rationale:* the vocabulary is data-shaped and the Phase 3 publish gate must parse the same vocabulary — one evaluator, testable with plain SELECTs. *Rejected:* inlining evaluation in the RPC body (untestable without full document fixtures).

**AD-6: Regime/profile resolution client-side reads `tenants.resolved_country_config` directly.**
`resolveComplianceRenderInputs()` reads `regime.documents` from the tenant's resolved config jsonb (live column, populated by Phase 0/1 `_apply_country_config`), falls back to `'generic_invoice'`, and resolves seller registration from `legal_entities` + `legal_entity_tax_registrations`. *Rationale:* zero coupling to Phase 1's `TenantConfig` TypeScript extension shape; the DB jsonb is the contract. *Rejected:* threading through `useRegimeConfig()` (React-only; pdfService is plain TS).

**AD-7: Structured addresses are additive; the free-text `address` column stays authoritative-fallback.**
New columns are nullable; the party forms write both (structured fields + the legacy blob left untouched for old rows); document rendering prefers the structured snapshot and falls back to free text. Subdivision pickers render only when `geo_subdivisions` has active rows for the party's country (this phase seeds Oman's 11 governorates as the proof set). *Rationale:* M-I — legacy rows must keep rendering; no backfill fabrication. *Rejected:* parsing existing free-text addresses into columns (guaranteed garbage).

**AD-8: POS tax lines are computed client-side by the Phase 1 kernel and validated in-RPC.**
Stock sales have no draft stage, so `stockService.createStockSale` computes `TaxComputation` via `computeDocumentTax` (same kernel as invoices), passes rows as `p_tax_lines`, and `record_stock_sale` validates Σ(rollups) against the header before persisting `document_tax_lines` + `vat_records`. *Rationale:* contract §2.5 fixes this signature; one calculation path for all four doc types. *Rejected:* an in-RPC recompute (would fork the kernel into plpgsql).

## Database Changes

| # | Migration name | Purpose | Tables/functions touched |
|---|---|---|---|
| 1 | `phase2_master_unit_codes` | UN/ECE Rec-20 unit registry + UQC mapping + seed; catalog default unit; FK-validate the four dormant `unit_code` columns | NEW `master_unit_codes`; `catalog_service_line_items` (+`default_unit_code`); FK constraints on `invoice_line_items`/`quote_items`/`credit_note_items`/`stock_sale_items` |
| 2 | `phase2_master_document_requirements` | Data-declared statutory field requirements + GCC-6 seed rows | NEW `master_document_requirements` |
| 3 | `phase2_structured_addresses` | Structured address columns on the three party tables; Oman subdivision seed | `customers_enhanced`, `companies`, `suppliers` (+4 cols each); `geo_subdivisions` seed rows |
| 4 | `phase2_requirement_gate_and_snapshots` | `evaluate_document_requirements` function; `issue_tax_document` v2 (requirement gate + buyer/seller/supply-date/reverse_charge/notations snapshot stamping + `requirement_failures` in dry-run) for invoice/quote; the SAME gate + snapshot stamping grafted into `issue_credit_note` for credit notes | NEW fn `evaluate_document_requirements`; REPLACE fn `issue_tax_document`; REPLACE fn `issue_credit_note` |
| 5 | `phase2_record_stock_sale_tax` | Stock-sale tax threading: header tax columns; 3-arg `record_stock_sale` writing `document_tax_lines` + `vat_records` | `stock_sales` (+`tax_amount`, `tax_inclusive`, `tax_regime_key`); DROP/CREATE fn `record_stock_sale(jsonb,jsonb,jsonb)` |

Every migration: applied via `mcp__supabase__apply_migration` → `database.types.ts` regenerated → manifest row appended → callers updated in the same PR.

## Backend Implementation

| Module | Change |
|---|---|
| `src/lib/regimes/gcc_tax_invoice/index.ts` (NEW) | `gcc_tax_invoice` `DocumentComplianceProfile` plugin + fixtures |
| `src/lib/pdf/engine/profileResolver.ts` (NEW) | `resolveComplianceRenderInputs()` — primary legal entity → country facts + profile + seller registration |
| `src/lib/pdf/countryFactsService.ts` | Facts select gains `tax_number_label`, `decimal_separator`, `thousands_separator`, `digit_grouping` |
| `src/lib/pdf/engine/countryConfig.ts` | `ResolvedCountryFacts` extended; `countryTemplateOverride(facts, compliance?)` consumes the profile |
| `src/lib/pdf/utils.ts` | `formatEngineMoney` gains separator options; `formatPartyAddressLines` country-ordered address renderer |
| `src/lib/pdf/pdfService.ts` | R4: all 8 engine paths use `resolveTemplateConfigWithCountry`; invoice/quote unconditional engine; NEW `buildCreditNoteViaEngine`; legacy financial builders removed |
| `src/lib/pdf/engine/adapters/invoiceAdapter.ts`, `quoteAdapter.ts`, NEW `creditNoteAdapter.ts` | Component-row totals from `document_tax_lines`; stored-amount headers; buyer identity/address rows; supply-date meta; notations; unit/itemCode row keys; `config.locale` date/money consumption |
| `src/lib/pdf/dataFetcher.ts` | `fetchDocumentTaxLines()`; buyer `tax_number` + structured address in party selects; snapshot columns threaded; `currencyToBlock` separators |
| `src/lib/pdf/templateConfig.ts` | `'credit_note'` added to `TemplateDocumentType` + built-in config; `unit`/`itemCode` line columns; `LocaleConfig` separators |
| `src/lib/taxDocumentService.ts` (NEW) | `dryRunIssueTaxDocument()` typed RPC wrapper |
| `src/lib/unitCodesService.ts` (NEW) | Cached `listUnitCodes()` |
| `src/lib/geoSubdivisionService.ts` (NEW) | `listSubdivisions(countryId)` |
| `src/lib/invoiceService.ts` / `src/lib/quotesService.ts` | Item maps persist `unit_code`/`unit_label`/`item_code`/`tax_treatment`/`treatment_reason_code` |
| `src/lib/stockService.ts` + `src/lib/tax/assembleStockSaleContext.ts` (NEW) | POS kernel computation + `p_tax_lines` threading |
| `src/lib/companyService.ts` / party writers | Structured address fields persisted |

## Frontend Implementation

| Surface | Change |
|---|---|
| `src/components/ui/AddressFields.tsx` (NEW) | Shared structured-address capture (line1/line2/subdivision/postal), country-labelled |
| `src/components/customers/CustomerFormModal.tsx`, `src/pages/companies/CompaniesListPage.tsx`, `src/components/suppliers/SupplierFormModal.tsx` | Adopt `AddressFields`; persist structured columns |
| `src/components/cases/InvoiceFormModal.tsx`, `QuoteFormModal.tsx` | Unit select from `master_unit_codes` (replaces free-text Unit that was silently dropped), item-code field, treatment selector, `'Service'` literals removed |
| `src/components/financial/CreditNoteModal.tsx`, `src/components/stock/StockSaleModal.tsx` | Unit/item-code fields; POS component-tax display; tax-aware total |
| `src/components/documents/InvoiceDocument.tsx`, `QuoteDocument.tsx` | Previews read the same resolved profile/facts + `document_tax_lines` component rows; hardcoded `'TAX INVOICE'`/`'VAT No:'` removed |
| `src/components/financial/RequirementFailuresPanel.tsx` (NEW) | Renders `requirement_failures` (block = danger, warn = warning tokens) |
| `src/components/financial/TaxTraceDrawer.tsx` (NEW) | "How was this computed?" drawer over `rule_trace`; backfilled badge |
| `src/pages/financial/InvoiceDetailPage.tsx`, `src/pages/cases/CaseDetail.tsx` | Pre-issue dry-run: block stops with panel, warn asks confirmation |

## APIs & Services (exact signatures)

**SQL (new/changed this phase):**

```sql
-- NEW (migration 4). Pure evaluator over the contract's closed vocabulary.
evaluate_document_requirements(p_doc_type text, p_country_id uuid, p_as_of date, p_facts jsonb)
  RETURNS jsonb   -- '[{"field_key":text,"level":"block"|"warn","message":text}, ...]'

-- CHANGED (migration 4). Signature UNCHANGED from Phase 1.
issue_tax_document(p_doc_type text, p_doc_id uuid, p_dry_run boolean DEFAULT false) RETURNS jsonb
-- dry-run return gains: "requirement_failures": [{"field_key","level","message"}]
-- non-dry-run: blocks issuance (RAISE, ERRCODE 'P0403') when any level='block' failure exists
-- non-dry-run: stamps buyer_tax_number, buyer_tax_number_label, buyer_address, seller_tax_number,
--              supply_date (COALESCE to tenant-local tax point) on the document row before sealing

-- CHANGED (migration 5). 2-arg version dropped, 3-arg created (PostgREST ambiguity avoidance).
record_stock_sale(p_sale jsonb, p_items jsonb, p_tax_lines jsonb DEFAULT NULL) RETURNS stock_sales
-- p_sale gains 'tax_inclusive'; p_items rows gain 'unit_code','unit_label','item_code',
-- 'tax_treatment','treatment_reason_code'; p_tax_lines = document_tax_lines-shaped rows
```

**TypeScript (new exports later tasks + later phases rely on):**

```typescript
// src/lib/regimes/gcc_tax_invoice/index.ts
export const gccTaxInvoiceProfile: DocumentComplianceProfile;   // key 'gcc_tax_invoice', version '1.0.0'

// src/lib/pdf/engine/profileResolver.ts
export interface ComplianceRenderInputs {
  facts: ResolvedCountryFacts | null;
  profile: DocumentComplianceProfile;
  sellerRegistered: boolean;
  sellerTaxNumber: string | null;
}
export async function resolveComplianceRenderInputs(): Promise<ComplianceRenderInputs>;
export function clearComplianceRenderCache(): void;

// src/lib/pdf/engine/countryConfig.ts (extended)
export interface ResolvedCountryFacts {
  code: string; taxSystem: string | null; taxLabel: string | null;
  taxNumberLabel: string | null;                    // NEW — registration-number label ('TRN', 'VATIN')
  taxInvoiceRequired: boolean; languageCode: string | null;
  decimalPlaces: number | null; dateFormat: string | null;
  decimalSeparator: string | null; thousandsSeparator: string | null; digitGrouping: string | null;  // NEW
}
export interface ComplianceOverrideInputs {
  profile: DocumentComplianceProfile;
  sellerRegistered: boolean;
  docType: TaxDocumentType | null;                  // null = non-financial document
}
export function countryTemplateOverride(
  facts: ResolvedCountryFacts, compliance?: ComplianceOverrideInputs,
): TemplateConfigOverride;

// src/lib/pdf/dataFetcher.ts
export interface DocumentTaxLineRow {
  line_item_id: string | null; component_code: string; component_label: string;
  rate: number; taxable_base: number; tax_amount: number; tax_treatment: string;
  treatment_reason_code: string | null; sequence: number; backfilled: boolean;
  rule_trace: unknown;
}
export async function fetchDocumentTaxLines(
  documentType: 'quote' | 'invoice' | 'credit_note' | 'stock_sale', documentId: string,
): Promise<DocumentTaxLineRow[]>;

// src/lib/taxDocumentService.ts
export interface RequirementFailure { field_key: string; level: 'block' | 'warn'; message: string; }
export interface DryRunResult {
  ok: boolean; tax_lines: unknown[]; totals: Record<string, unknown>;
  requirement_failures: RequirementFailure[]; trace: unknown;
}
export async function dryRunIssueTaxDocument(
  docType: 'quote' | 'invoice' | 'credit_note', docId: string,
): Promise<DryRunResult>;

// src/lib/unitCodesService.ts
export interface UnitCode { code: string; uqc_code: string | null; label: string; scheme: string; }
export async function listUnitCodes(): Promise<UnitCode[]>;

// src/lib/geoSubdivisionService.ts
export interface Subdivision { id: string; code: string; name: string; subdivision_type: string | null; }
export async function listSubdivisions(countryId: string): Promise<Subdivision[]>;

// src/lib/pdf/utils.ts (extended)
export function formatEngineMoney(amount: number, opts: {
  symbol: string; decimalPlaces: number; position: 'before' | 'after';
  decimalSeparator?: string; thousandsSeparator?: string;
}): string;
export interface PartyAddressInput {
  line1?: string | null; line2?: string | null; city?: string | null;
  subdivision?: string | null; postal_code?: string | null; country?: string | null;
  free_text?: string | null;
}
export function formatPartyAddressLines(addr: PartyAddressInput, postalFirst: boolean): string[];

// src/lib/tax/assembleStockSaleContext.ts
export interface StockSaleTaxInput { lines: TaxableLine[]; documentDiscount: number; taxInclusive: boolean; }
export async function computeStockSaleTax(input: StockSaleTaxInput): Promise<TaxComputation>;
```

---

## File-by-File Implementation Tasks

Tasks are numbered globally. Each Work Package (WP) is one PR-able unit with its own verification. Execute WPs in order; tasks inside a WP are sequential unless noted.

### WP-1 — Compliance data schema (3 migrations, 1 PR)

**PR:** `feat/localization-p2-compliance-schema` (use the migration PR template). No app code changes in this WP beyond the regenerated types file.

---

### Task 1: `master_unit_codes` + catalog default unit + line-item FK validation

**Files:**
- Migration: `phase2_master_unit_codes` (via `mcp__supabase__apply_migration`)
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `supabase/migrations.manifest.md` (append row)

**Interfaces:**
- Consumes: Phase 1 line-item columns `unit_code text` on `invoice_line_items`/`quote_items`/`credit_note_items`/`stock_sale_items` (all NULL today); `is_platform_admin()` security helper.
- Produces: table `master_unit_codes(code PK-unique, uqc_code, labels_i18n, scheme, is_active, sort_order)`; `catalog_service_line_items.default_unit_code`; FK constraints `fk_<item_table>_unit_code`.

- [ ] **Step 1: SQL probe — verify the failing/absent state**

Run via `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
SELECT
  to_regclass('public.master_unit_codes') AS unit_codes_table,        -- expect NULL
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_service_line_items'
      AND column_name='default_unit_code') AS catalog_col,            -- expect 0
  (SELECT count(*) FROM information_schema.table_constraints
    WHERE table_schema='public' AND constraint_name LIKE 'fk_%_unit_code') AS fk_count;  -- expect 0
```

Expected: `unit_codes_table = NULL`, `catalog_col = 0`, `fk_count = 0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` with name `phase2_master_unit_codes` and this SQL:

```sql
-- ── master_unit_codes: UN/ECE Rec-20 units + India UQC mapping (global) ──────
CREATE TABLE public.master_unit_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,                       -- UN/ECE Rec-20 ('C62','HUR','E48',…)
  uqc_code text,                                   -- India UQC mapping ('NOS','HRS'); NULL = services report per composer rules (Phase 4)
  labels_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"en":"Piece","ar":"قطعة"}
  scheme text NOT NULL DEFAULT 'rec20',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.master_unit_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_unit_codes FORCE ROW LEVEL SECURITY;

CREATE POLICY master_unit_codes_select ON public.master_unit_codes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY master_unit_codes_platform_write ON public.master_unit_codes
  FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Seed: the lab-relevant Rec-20 subset. E34/E35 (giga/terabyte) cover per-GB/TB
-- delivery pricing; E48 (service unit) is the services default; C62 (one/piece)
-- covers per-device work; HUR/DAY/WEE/MON/ANN cover time-based engagements.
INSERT INTO public.master_unit_codes (code, uqc_code, labels_i18n, sort_order) VALUES
  ('C62', 'NOS', '{"en":"Piece","ar":"قطعة"}',            10),
  ('E48', NULL,  '{"en":"Service unit","ar":"وحدة خدمة"}', 20),
  ('HUR', 'HRS', '{"en":"Hour","ar":"ساعة"}',              30),
  ('DAY', 'DAY', '{"en":"Day","ar":"يوم"}',                40),
  ('WEE', NULL,  '{"en":"Week","ar":"أسبوع"}',             50),
  ('MON', NULL,  '{"en":"Month","ar":"شهر"}',              60),
  ('ANN', NULL,  '{"en":"Year","ar":"سنة"}',               70),
  ('E34', NULL,  '{"en":"Gigabyte","ar":"جيجابايت"}',      80),
  ('E35', NULL,  '{"en":"Terabyte","ar":"تيرابايت"}',      90);

-- ── Catalog default unit (fixes the hardcoded 'Service' Quick Add literal) ───
ALTER TABLE public.catalog_service_line_items
  ADD COLUMN IF NOT EXISTS default_unit_code text REFERENCES public.master_unit_codes(code);

-- ── FK-validate the four dormant Phase-1 unit_code columns ───────────────────
-- All values are NULL today, so NOT VALID → VALIDATE is a no-op scan and cannot fail.
ALTER TABLE public.invoice_line_items
  ADD CONSTRAINT fk_invoice_line_items_unit_code
  FOREIGN KEY (unit_code) REFERENCES public.master_unit_codes(code) NOT VALID;
ALTER TABLE public.invoice_line_items VALIDATE CONSTRAINT fk_invoice_line_items_unit_code;

ALTER TABLE public.quote_items
  ADD CONSTRAINT fk_quote_items_unit_code
  FOREIGN KEY (unit_code) REFERENCES public.master_unit_codes(code) NOT VALID;
ALTER TABLE public.quote_items VALIDATE CONSTRAINT fk_quote_items_unit_code;

ALTER TABLE public.credit_note_items
  ADD CONSTRAINT fk_credit_note_items_unit_code
  FOREIGN KEY (unit_code) REFERENCES public.master_unit_codes(code) NOT VALID;
ALTER TABLE public.credit_note_items VALIDATE CONSTRAINT fk_credit_note_items_unit_code;

ALTER TABLE public.stock_sale_items
  ADD CONSTRAINT fk_stock_sale_items_unit_code
  FOREIGN KEY (unit_code) REFERENCES public.master_unit_codes(code) NOT VALID;
ALTER TABLE public.stock_sale_items VALIDATE CONSTRAINT fk_stock_sale_items_unit_code;
```

- [ ] **Step 3: SQL probe — verify the applied state**

```sql
SELECT
  (SELECT count(*) FROM public.master_unit_codes WHERE is_active) AS seeded,   -- expect 9
  (SELECT count(*) FROM information_schema.table_constraints
    WHERE table_schema='public' AND constraint_name LIKE 'fk_%_unit_code') AS fk_count,  -- expect 4
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
    WHERE relname='master_unit_codes') AS rls_forced;                          -- expect true
-- Negative probe: a bogus unit code must now be rejected.
-- Run separately and EXPECT a foreign-key violation error:
--   INSERT INTO invoice_line_items (tenant_id, invoice_id, description, quantity, unit_price, unit_code)
--   VALUES (gen_random_uuid(), gen_random_uuid(), 'probe', 1, 1, 'NOT_A_UNIT');
```

- [ ] **Step 4: Regenerate types**

Run `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) and save the full output over `src/types/database.types.ts`. Then run:

```bash
npm run check:tsc
```

Expected: `0 errors`.

- [ ] **Step 5: Append the manifest row**

Append to the table in `supabase/migrations.manifest.md` (use the actual applied version timestamp):

```markdown
| <version> | phase2_master_unit_codes.sql | Additive | master_unit_codes (Rec-20+UQC, 9 seeds) + catalog_service_line_items.default_unit_code + unit_code FKs on 4 item tables | #TBD-PR |
```

(Replace `#TBD-PR` with the PR number when opened — the gate greps only the `| <version> |` cell.)

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): master_unit_codes registry + catalog default unit + item-table unit FKs (P2/M1)"
```

---

### Task 2: `master_document_requirements` + GCC seed rows

**Files:**
- Migration: `phase2_master_document_requirements`
- Modify: `src/types/database.types.ts` (regenerated), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `geo_countries` (lookup by `code`), `master_country_pack_versions(id)` (Phase 1).
- Produces: table `master_document_requirements(country_id, doc_type, field_key, condition jsonb, level, message_i18n, effective_from, pack_version_id, sort_order)` — the exact shape `evaluate_document_requirements` (Task 17) reads. Closed vocabularies per the interface contract §4.4: `field_key ∈ ('buyer_tax_number','buyer_address','place_of_supply_subdivision_id','supply_date','seller_tax_number','line.item_code','line.unit_code')`; `level ∈ ('block','warn')`; condition shape `{"all":[{"fact":…,"op":"eq"|"neq"|"in"|"gte"|"present","value":…}]}`.

- [ ] **Step 1: SQL probe — absent state**

```sql
SELECT to_regclass('public.master_document_requirements');   -- expect NULL
```

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase2_master_document_requirements`:

```sql
CREATE TABLE public.master_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES public.geo_countries(id),
  doc_type text NOT NULL CHECK (doc_type IN ('quote','invoice','credit_note','stock_sale')),
  field_key text NOT NULL CHECK (field_key IN
    ('buyer_tax_number','buyer_address','place_of_supply_subdivision_id',
     'supply_date','seller_tax_number','line.item_code','line.unit_code')),
  condition jsonb,                                 -- NULL = unconditional; closed vocabulary (contract §4.4)
  level text NOT NULL CHECK (level IN ('block','warn')),
  message_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  pack_version_id uuid REFERENCES public.master_country_pack_versions(id),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_master_document_requirements_lookup
  ON public.master_document_requirements (country_id, doc_type)
  WHERE deleted_at IS NULL;

ALTER TABLE public.master_document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_document_requirements FORCE ROW LEVEL SECURITY;

CREATE POLICY master_document_requirements_select ON public.master_document_requirements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY master_document_requirements_platform_write ON public.master_document_requirements
  FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- ── GCC VAT seed: OM / AE / SA / BH invoices ─────────────────────────────────
-- (KW/QA have tax_system NONE — deliberately zero requirement rows.)
-- 1) Seller tax number: unconditional BLOCK.
INSERT INTO public.master_document_requirements
  (country_id, doc_type, field_key, condition, level, message_i18n, sort_order)
SELECT g.id, 'invoice', 'seller_tax_number', NULL, 'block',
       jsonb_build_object('en', 'Seller ' || COALESCE(g.tax_number_label, 'tax number')
         || ' is required on tax invoices.', 'ar', 'الرقم الضريبي للبائع مطلوب في الفواتير الضريبية.'),
       10
FROM public.geo_countries g WHERE g.code IN ('OM','AE','SA','BH') AND g.deleted_at IS NULL;

-- 2) Buyer tax number: BLOCK when the buyer is a business.
INSERT INTO public.master_document_requirements
  (country_id, doc_type, field_key, condition, level, message_i18n, sort_order)
SELECT g.id, 'invoice', 'buyer_tax_number',
       '{"all":[{"fact":"buyer_is_business","op":"eq","value":true}]}'::jsonb, 'block',
       jsonb_build_object('en', 'Buyer ' || COALESCE(g.tax_number_label, 'tax number')
         || ' is required for B2B tax invoices.', 'ar', 'الرقم الضريبي للمشتري مطلوب لفواتير الأعمال.'),
       20
FROM public.geo_countries g WHERE g.code IN ('OM','AE','SA','BH') AND g.deleted_at IS NULL;

-- 3) Buyer address: WARN when the buyer is a business.
INSERT INTO public.master_document_requirements
  (country_id, doc_type, field_key, condition, level, message_i18n, sort_order)
SELECT g.id, 'invoice', 'buyer_address',
       '{"all":[{"fact":"buyer_is_business","op":"eq","value":true}]}'::jsonb, 'warn',
       jsonb_build_object('en', 'Buyer address is expected on B2B tax invoices.',
                          'ar', 'عنوان المشتري متوقع في فواتير الأعمال.'),
       30
FROM public.geo_countries g WHERE g.code IN ('OM','AE','SA','BH') AND g.deleted_at IS NULL;

-- 4) Credit notes reference the same B2B buyer identity rule (GCC credit notes
--    are statutory documents mirroring the invoice fields).
INSERT INTO public.master_document_requirements
  (country_id, doc_type, field_key, condition, level, message_i18n, sort_order)
SELECT g.id, 'credit_note', 'seller_tax_number', NULL, 'block',
       jsonb_build_object('en', 'Seller ' || COALESCE(g.tax_number_label, 'tax number')
         || ' is required on tax credit notes.', 'ar', 'الرقم الضريبي للبائع مطلوب في إشعارات الدائن الضريبية.'),
       10
FROM public.geo_countries g WHERE g.code IN ('OM','AE','SA','BH') AND g.deleted_at IS NULL;
```

- [ ] **Step 3: SQL probe — applied state**

```sql
SELECT g.code, r.doc_type, r.field_key, r.level
FROM public.master_document_requirements r
JOIN public.geo_countries g ON g.id = r.country_id
ORDER BY g.code, r.doc_type, r.sort_order;
-- Expect 16 rows: 4 per country (OM/AE/SA/BH): invoice seller block, invoice buyer block,
-- invoice buyer_address warn, credit_note seller block. Zero rows for KW/QA.
```

- [ ] **Step 4: Regenerate types + typecheck** — `mcp__supabase__generate_typescript_types` → `src/types/database.types.ts`; `npm run check:tsc` → 0 errors.

- [ ] **Step 5: Manifest row**

```markdown
| <version> | phase2_master_document_requirements.sql | Additive | master_document_requirements (closed field/condition vocabulary) + 16 GCC seed rows | #TBD-PR |
```

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): master_document_requirements + GCC-4 statutory seed rows (P2/M2)"
```

---

### Task 3: Structured addresses on party tables + Oman subdivisions seed

**Files:**
- Migration: `phase2_structured_addresses`
- Modify: `src/types/database.types.ts` (regenerated), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `geo_subdivisions` (exists live, 12 cols, 0 rows), `geo_countries` (OM lookup).
- Produces: `customers_enhanced.address_line1/address_line2/subdivision_id/postal_code` (same on `companies`, `suppliers`) — all nullable (M-I: legacy rows untouched); 11 `geo_subdivisions` rows for OM.

- [ ] **Step 1: SQL probe — absent state**

```sql
SELECT count(*) FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('customers_enhanced','companies','suppliers')
  AND column_name IN ('address_line1','address_line2','subdivision_id','postal_code');
-- expect 0
SELECT count(*) FROM public.geo_subdivisions;   -- expect 0
```

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `phase2_structured_addresses`:

```sql
-- ── Structured address columns (nullable — legacy free-text `address` untouched) ──
ALTER TABLE public.customers_enhanced
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS subdivision_id uuid REFERENCES public.geo_subdivisions(id),
  ADD COLUMN IF NOT EXISTS postal_code text;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS subdivision_id uuid REFERENCES public.geo_subdivisions(id),
  ADD COLUMN IF NOT EXISTS postal_code text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS subdivision_id uuid REFERENCES public.geo_subdivisions(id),
  ADD COLUMN IF NOT EXISTS postal_code text;

CREATE INDEX IF NOT EXISTS idx_customers_enhanced_subdivision
  ON public.customers_enhanced (subdivision_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_companies_subdivision
  ON public.companies (subdivision_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_subdivision
  ON public.suppliers (subdivision_id) WHERE deleted_at IS NULL;

-- ── Oman governorates (ISO 3166-2:OM) — the subdivision proof set ────────────
INSERT INTO public.geo_subdivisions (country_id, code, name, subdivision_type, sort_order, is_active)
SELECT g.id, v.code, v.name, 'governorate', v.ord, true
FROM public.geo_countries g,
  (VALUES
    ('MA', 'Muscat',            10),
    ('BJ', 'Al Batinah South',  20),
    ('BS', 'Al Batinah North',  30),
    ('BU', 'Al Buraymi',        40),
    ('DA', 'Ad Dakhiliyah',     50),
    ('MU', 'Musandam',          60),
    ('SJ', 'Ash Sharqiyah South', 70),
    ('SS', 'Ash Sharqiyah North', 80),
    ('WU', 'Al Wusta',          90),
    ('ZA', 'Ad Dhahirah',      100),
    ('ZU', 'Dhofar',           110)
  ) AS v(code, name, ord)
WHERE g.code = 'OM' AND g.deleted_at IS NULL
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: SQL probe — applied state**

```sql
SELECT count(*) FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('customers_enhanced','companies','suppliers')
  AND column_name IN ('address_line1','address_line2','subdivision_id','postal_code');
-- expect 12
SELECT count(*) FROM public.geo_subdivisions s
JOIN public.geo_countries g ON g.id = s.country_id WHERE g.code = 'OM';
-- expect 11
-- M-I guard: the new columns MUST be nullable.
SELECT count(*) FROM information_schema.columns
WHERE table_schema='public' AND table_name='customers_enhanced'
  AND column_name IN ('address_line1','postal_code') AND is_nullable = 'NO';
-- expect 0
```

- [ ] **Step 4: Regenerate types + typecheck** — regen `database.types.ts`; `npm run check:tsc` → 0 errors. (The `customers` compatibility view over `customers_enhanced` is column-listed; the new columns are additive and do not break it — verify with `SELECT * FROM customers LIMIT 1` succeeding.)

- [ ] **Step 5: Manifest row**

```markdown
| <version> | phase2_structured_addresses.sql | Additive | address_line1/2 + subdivision_id + postal_code on customers_enhanced/companies/suppliers; OM governorate seed (11) | #TBD-PR |
```

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): structured party addresses + Oman subdivision seed (P2/M3)"
```

**WP-1 verification:** `npm run check:tsc` (0), `npm run test` (green), `npm run check:schema-drift` (clean), the three SQL "applied state" probes above. Open the PR with the migration template listing all three migrations.

---
### WP-2 — Compliance profile + country facts extension (1 PR)

**PR:** `feat/localization-p2-compliance-profile`. Pure TypeScript; no migrations.

---

### Task 4: `gcc_tax_invoice` DocumentComplianceProfile plugin

**Files:**
- Create: `src/lib/regimes/gcc_tax_invoice/index.ts`
- Create: `src/lib/regimes/gcc_tax_invoice/gccTaxInvoice.test.ts`
- Modify: `src/lib/regimes/register.ts` (the Phase 1 plugin-registration entry point — add one `registerRegimePlugin` call inside `registerAllRegimePlugins()` alongside the existing `generic_invoice` registration)

**Interfaces:**
- Consumes: `DocumentComplianceProfile`, `TaxComputation`, `DocumentNotation`, `TaxDocumentType` from `src/lib/regimes/types.ts` (Phase 1, contract §1.4); `registerRegimePlugin`, `resolveDocumentProfile` from `src/lib/regimes/registry.ts`.
- Produces: `export const gccTaxInvoiceProfile: DocumentComplianceProfile` with `key: 'gcc_tax_invoice'`, `version: '1.0.0'` — resolvable via `resolveDocumentProfile('gcc_tax_invoice')`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/regimes/gcc_tax_invoice/gccTaxInvoice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { gccTaxInvoiceProfile } from './index';
import type { TaxComputation } from '../types';

const emptyComputation: TaxComputation = {
  lines: [],
  rollups: [],
  totals: { taxableBase: 0, taxTotal: 0, grandTotal: 0, roundingAdjustment: null },
  expectedWithholding: null,
  notations: [],
  trace: { regimeKey: 'simple_vat', pluginVersion: '1.0.0', packVersionId: null, schemeMode: 'single', steps: [] },
};

describe('gccTaxInvoiceProfile', () => {
  it('titles a registered seller invoice TAX INVOICE (bilingual)', () => {
    const t = gccTaxInvoiceProfile.documentTitle({
      docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: true,
    });
    expect(t).toEqual({ title: 'TAX INVOICE', titleTranslated: 'فاتورة ضريبية' });
  });

  it('titles an UNregistered seller invoice plain INVOICE', () => {
    const t = gccTaxInvoiceProfile.documentTitle({
      docType: 'invoice', sellerRegistered: false, taxInvoiceRequired: true,
    });
    expect(t).toEqual({ title: 'INVOICE', titleTranslated: 'فاتورة' });
  });

  it('titles an invoice plain INVOICE when the country does not require the ceremony', () => {
    const t = gccTaxInvoiceProfile.documentTitle({
      docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: false,
    });
    expect(t.title).toBe('INVOICE');
  });

  it('titles quotes, credit notes and POS sales', () => {
    expect(gccTaxInvoiceProfile.documentTitle({ docType: 'quote', sellerRegistered: true, taxInvoiceRequired: true }).title).toBe('QUOTATION');
    expect(gccTaxInvoiceProfile.documentTitle({ docType: 'credit_note', sellerRegistered: true, taxInvoiceRequired: true }).title).toBe('TAX CREDIT NOTE');
    expect(gccTaxInvoiceProfile.documentTitle({ docType: 'stock_sale', sellerRegistered: true, taxInvoiceRequired: true }).title).toBe('SIMPLIFIED TAX INVOICE');
    expect(gccTaxInvoiceProfile.documentTitle({ docType: 'stock_sale', sellerRegistered: false, taxInvoiceRequired: true }).title).toBe('RECEIPT');
  });

  it('declares the GCC statutory shape', () => {
    expect(gccTaxInvoiceProfile.key).toBe('gcc_tax_invoice');
    expect(gccTaxInvoiceProfile.requiresTaxInvoiceCeremony).toBe(true);
    expect(gccTaxInvoiceProfile.showRegistrationBand).toBe(true);
    expect(gccTaxInvoiceProfile.forcedColumns).toEqual([]);
    expect(gccTaxInvoiceProfile.bilingual).toEqual({ enabled: true, secondaryLanguage: 'ar', arabicLead: false });
    expect(gccTaxInvoiceProfile.paperSize).toBe('A4');
  });

  it('emits a reverse-charge notation from the computation', () => {
    const comp: TaxComputation = {
      ...emptyComputation,
      rollups: [{
        lineItemId: null, componentCode: 'VAT', componentLabel: 'VAT 5%', jurisdictionRef: null,
        rate: 5, taxableBase: 100, taxAmount: 0, taxTreatment: 'reverse_charge',
        treatmentReasonCode: null, sequence: 0,
      }],
    };
    const notes = gccTaxInvoiceProfile.notations(comp);
    expect(notes).toContainEqual({
      code: 'REVERSE_CHARGE',
      text: 'VAT to be accounted for by the recipient under the reverse-charge mechanism.',
      textTranslated: 'يتم احتساب ضريبة القيمة المضافة من قبل المستلم وفقاً لآلية الاحتساب العكسي.',
    });
  });

  it('emits a zero-rated notation carrying the reason code', () => {
    const comp: TaxComputation = {
      ...emptyComputation,
      rollups: [{
        lineItemId: null, componentCode: 'VAT', componentLabel: 'VAT 0%', jurisdictionRef: null,
        rate: 0, taxableBase: 100, taxAmount: 0, taxTreatment: 'zero_rated',
        treatmentReasonCode: 'EXPORT_SERVICES', sequence: 0,
      }],
    };
    const notes = gccTaxInvoiceProfile.notations(comp);
    expect(notes).toContainEqual({
      code: 'ZERO_RATED',
      text: 'Zero-rated supply (EXPORT_SERVICES).',
      textTranslated: 'توريد خاضع لنسبة الصفر (EXPORT_SERVICES).',
    });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/gcc_tax_invoice/gccTaxInvoice.test.ts`
Expected: FAIL — `Cannot find module './index'` (or equivalent unresolved-import error).

- [ ] **Step 3: Minimal implementation**

Create `src/lib/regimes/gcc_tax_invoice/index.ts`:

```typescript
import type {
  DocumentComplianceProfile,
  DocumentNotation,
  TaxComputation,
} from '../types';

/** GCC (OM/AE/SA/BH — VAT states) document compliance profile.
 *  Title ceremony: only a registered seller in a tax_invoice_required country
 *  may issue a 'TAX INVOICE'; everyone else issues a plain 'INVOICE'.
 *  POS sales title as the GCC 'simplified tax invoice' when registered. */
export const gccTaxInvoiceProfile: DocumentComplianceProfile = {
  key: 'gcc_tax_invoice',
  version: '1.0.0',

  documentTitle(ctx) {
    if (ctx.docType === 'quote') {
      return { title: 'QUOTATION', titleTranslated: 'عرض سعر' };
    }
    if (ctx.docType === 'credit_note') {
      return ctx.sellerRegistered && ctx.taxInvoiceRequired
        ? { title: 'TAX CREDIT NOTE', titleTranslated: 'إشعار دائن ضريبي' }
        : { title: 'CREDIT NOTE', titleTranslated: 'إشعار دائن' };
    }
    if (ctx.docType === 'stock_sale') {
      return ctx.sellerRegistered && ctx.taxInvoiceRequired
        ? { title: 'SIMPLIFIED TAX INVOICE', titleTranslated: 'فاتورة ضريبية مبسطة' }
        : { title: 'RECEIPT', titleTranslated: 'إيصال' };
    }
    return ctx.sellerRegistered && ctx.taxInvoiceRequired
      ? { title: 'TAX INVOICE', titleTranslated: 'فاتورة ضريبية' }
      : { title: 'INVOICE', titleTranslated: 'فاتورة' };
  },

  requiresTaxInvoiceCeremony: true,
  showRegistrationBand: true,
  forcedColumns: [],
  bilingual: { enabled: true, secondaryLanguage: 'ar', arabicLead: false },
  paperSize: 'A4',

  notations(computation: TaxComputation): DocumentNotation[] {
    const notes: DocumentNotation[] = [];
    const rollups = computation.rollups;
    if (rollups.some((r) => r.taxTreatment === 'reverse_charge')) {
      notes.push({
        code: 'REVERSE_CHARGE',
        text: 'VAT to be accounted for by the recipient under the reverse-charge mechanism.',
        textTranslated: 'يتم احتساب ضريبة القيمة المضافة من قبل المستلم وفقاً لآلية الاحتساب العكسي.',
      });
    }
    for (const r of rollups) {
      if (r.taxTreatment === 'zero_rated') {
        notes.push({
          code: 'ZERO_RATED',
          text: `Zero-rated supply (${r.treatmentReasonCode ?? 'unspecified'}).`,
          textTranslated: `توريد خاضع لنسبة الصفر (${r.treatmentReasonCode ?? 'unspecified'}).`,
        });
        break;
      }
    }
    return notes;
  },
};
```

Then in `src/lib/regimes/register.ts` (the Phase 1 registration entry point), inside `registerAllRegimePlugins()` add next to the existing `registerRegimePlugin('documents', genericInvoiceProfile)` call:

```typescript
import { gccTaxInvoiceProfile } from './gcc_tax_invoice';
registerRegimePlugin('documents', gccTaxInvoiceProfile);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/gcc_tax_invoice/gccTaxInvoice.test.ts` → PASS (7 tests).
Run: `npm run check:tsc` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/gcc_tax_invoice/ src/lib/regimes/register.ts
git commit -m "feat(regimes): gcc_tax_invoice DocumentComplianceProfile (title ceremony, band, bilingual, notations)"
```

---

### Task 5: `resolveComplianceRenderInputs` — profile + facts + seller-registration resolver

**Files:**
- Create: `src/lib/pdf/engine/profileResolver.ts`
- Create: `src/lib/pdf/engine/profileResolver.test.ts`

**Interfaces:**
- Consumes: `getResolvedCountryFacts(countryId)` (`src/lib/pdf/countryFactsService.ts:13`); `resolveDocumentProfile(key)` (`src/lib/regimes/registry.ts`, Phase 1); `supabase` client; `tenantToday(timezone)` (`src/lib/tenantToday.ts`, Phase 0).
- Produces: `ComplianceRenderInputs` + `resolveComplianceRenderInputs(): Promise<ComplianceRenderInputs>` + `clearComplianceRenderCache(): void` (consumed by Tasks 8, 9, 14, 26).

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/profileResolver.test.ts`. Mock the supabase client (the established pattern in `src/lib/pdf/countryFactsService`'s own tests — chainable `from().select()...` mocks):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: Record<string, unknown[]> = {};

vi.mock('../../supabaseClient', () => {
  const chain = (table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    const self: Record<string, unknown> = {};
    const ret = () => self;
    for (const m of ['select', 'eq', 'is', 'lte', 'or', 'order', 'limit']) self[m] = vi.fn(ret);
    (self as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
    self.maybeSingle = vi.fn(async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }));
    return self;
  };
  return { supabase: { from: vi.fn((t: string) => chain(t)) } };
});

import { resolveComplianceRenderInputs, clearComplianceRenderCache } from './profileResolver';

beforeEach(() => {
  clearComplianceRenderCache();
  rows['legal_entities'] = [{
    id: 'le-1', country_id: 'om-uuid', tax_identifier: 'OM1100000000',
    is_primary: true, tenant_id: 't-1',
  }];
  rows['legal_entity_tax_registrations'] = [];
  rows['tenants'] = [{
    id: 't-1', timezone: 'Asia/Muscat',
    resolved_country_config: { 'regime.documents': 'gcc_tax_invoice' },
  }];
  rows['geo_countries'] = [{
    code: 'OM', tax_system: 'VAT', tax_label: 'VAT', tax_number_label: 'VATIN',
    tax_invoice_required: true, language_code: 'ar', decimal_places: 3,
    date_format: 'DD/MM/YYYY', decimal_separator: '.', thousands_separator: ',',
    digit_grouping: '3',
  }];
});

describe('resolveComplianceRenderInputs', () => {
  it('resolves facts + gcc profile + registered seller from the primary entity', async () => {
    const inputs = await resolveComplianceRenderInputs();
    expect(inputs.facts?.code).toBe('OM');
    expect(inputs.profile.key).toBe('gcc_tax_invoice');
    expect(inputs.sellerRegistered).toBe(true);
    expect(inputs.sellerTaxNumber).toBe('OM1100000000');
  });

  it('falls back to generic_invoice when regime.documents is unset', async () => {
    rows['tenants'] = [{ id: 't-1', timezone: 'Asia/Muscat', resolved_country_config: {} }];
    const inputs = await resolveComplianceRenderInputs();
    expect(inputs.profile.key).toBe('generic_invoice');
  });

  it('is unregistered when the entity has no tax_identifier and no active registration', async () => {
    rows['legal_entities'] = [{ id: 'le-1', country_id: 'om-uuid', tax_identifier: null, is_primary: true, tenant_id: 't-1' }];
    const inputs = await resolveComplianceRenderInputs();
    expect(inputs.sellerRegistered).toBe(false);
    expect(inputs.sellerTaxNumber).toBeNull();
  });

  it('returns null facts (never fabricates) when no legal entity exists', async () => {
    rows['legal_entities'] = [];
    const inputs = await resolveComplianceRenderInputs();
    expect(inputs.facts).toBeNull();
    expect(inputs.profile.key).toBe('generic_invoice');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/pdf/engine/profileResolver.test.ts`
Expected: FAIL — `Cannot find module './profileResolver'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/pdf/engine/profileResolver.ts`:

```typescript
import { supabase } from '../../supabaseClient';
import { getResolvedCountryFacts } from '../countryFactsService';
import type { ResolvedCountryFacts } from './countryConfig';
import { resolveDocumentProfile } from '../../regimes/registry';
import type { DocumentComplianceProfile } from '../../regimes/types';
import { tenantToday } from '../../tenantToday';

export interface ComplianceRenderInputs {
  facts: ResolvedCountryFacts | null;
  profile: DocumentComplianceProfile;
  sellerRegistered: boolean;
  sellerTaxNumber: string | null;
}

let cache: { at: number; value: ComplianceRenderInputs } | null = null;
const CACHE_TTL_MS = 60_000; // one generation batch; cleared on tenant switch

export function clearComplianceRenderCache(): void {
  cache = null;
}

/** Resolve the render-time compliance inputs for the CURRENT tenant:
 *  primary legal entity → country facts; `regime.documents` key from
 *  tenants.resolved_country_config → registered profile; seller registration
 *  from legal_entity_tax_registrations (active row) falling back to
 *  legal_entities.tax_identifier. Fail-soft on facts (null = no country layer,
 *  matching countryFactsService), fail-soft to 'generic_invoice' on profile. */
export async function resolveComplianceRenderInputs(): Promise<ComplianceRenderInputs> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const { data: entities } = await supabase
    .from('legal_entities')
    .select('id, tenant_id, country_id, tax_identifier, is_primary')
    .is('deleted_at', null);

  const primary =
    (entities ?? []).find((e) => e.is_primary) ?? (entities ?? [])[0] ?? null;

  if (!primary) {
    const value: ComplianceRenderInputs = {
      facts: null,
      profile: resolveDocumentProfile('generic_invoice'),
      sellerRegistered: false,
      sellerTaxNumber: null,
    };
    cache = { at: Date.now(), value };
    return value;
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, timezone, resolved_country_config')
    .eq('id', primary.tenant_id)
    .maybeSingle();

  const resolved = (tenant?.resolved_country_config ?? {}) as Record<string, unknown>;
  const profileKey =
    typeof resolved['regime.documents'] === 'string' && resolved['regime.documents']
      ? (resolved['regime.documents'] as string)
      : 'generic_invoice';

  const today = tenantToday(tenant?.timezone ?? 'UTC');
  const { data: registrations } = await supabase
    .from('legal_entity_tax_registrations')
    .select('id, tax_number')
    .eq('legal_entity_id', primary.id)
    .is('deleted_at', null)
    .lte('registered_from', today)
    .or(`registered_to.is.null,registered_to.gte.${today}`);

  const activeRegistration = (registrations ?? [])[0] ?? null;
  const sellerTaxNumber = activeRegistration?.tax_number ?? primary.tax_identifier ?? null;

  const value: ComplianceRenderInputs = {
    facts: await getResolvedCountryFacts(primary.country_id),
    profile: resolveDocumentProfile(profileKey),
    sellerRegistered: sellerTaxNumber != null,
    sellerTaxNumber,
  };
  cache = { at: Date.now(), value };
  return value;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/pdf/engine/profileResolver.test.ts` → PASS (4 tests). `npm run check:tsc` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/profileResolver.ts src/lib/pdf/engine/profileResolver.test.ts
git commit -m "feat(pdf): resolveComplianceRenderInputs — primary-entity country facts + regime.documents profile + seller registration"
```

---

### Task 6: Extend `ResolvedCountryFacts` + `countryTemplateOverride` consumes the profile

**Files:**
- Modify: `src/lib/pdf/countryFactsService.ts:18-34` (select + mapping)
- Modify: `src/lib/pdf/engine/countryConfig.ts:7-47` (interface + override mapper)
- Modify: `src/lib/pdf/templateConfig.ts` (`LocaleConfig` gains separator fields — the interface at the `/** Resolved locale slice…` block near `:585`)
- Test: `src/lib/pdf/engine/countryConfig.test.ts` (extend existing suite)

**Interfaces:**
- Consumes: `DocumentComplianceProfile` (Phase 1 types), `TaxDocumentType`, existing `TemplateConfigOverride` (`templateConfig.ts:680`), `isRTLLanguage` (`src/lib/locale.ts:30`), `PaperConfig` override slot (`templateConfig.ts:681` — `paper?: Partial<PaperConfig>`).
- Produces: extended `ResolvedCountryFacts` (adds `taxNumberLabel`, `decimalSeparator`, `thousandsSeparator`, `digitGrouping`); `ComplianceOverrideInputs`; new signature `countryTemplateOverride(facts, compliance?)` — the single place profile → template config happens (consumed by Tasks 8, 9, 14).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/pdf/engine/countryConfig.test.ts`:

```typescript
import { gccTaxInvoiceProfile } from '../../regimes/gcc_tax_invoice';
import type { ResolvedCountryFacts } from './countryConfig';

const omFacts: ResolvedCountryFacts = {
  code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
  taxInvoiceRequired: true, languageCode: 'ar', decimalPlaces: 3,
  dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
};

describe('countryTemplateOverride + DocumentComplianceProfile', () => {
  it('derives the profile title for a registered seller', () => {
    const o = countryTemplateOverride(omFacts, {
      profile: gccTaxInvoiceProfile, sellerRegistered: true, docType: 'invoice',
    });
    expect(o.labels?.documentTitle).toEqual({ en: 'TAX INVOICE', ar: 'فاتورة ضريبية' });
  });

  it('derives plain INVOICE for an unregistered seller and disables the band', () => {
    const o = countryTemplateOverride(omFacts, {
      profile: gccTaxInvoiceProfile, sellerRegistered: false, docType: 'invoice',
    });
    expect(o.labels?.documentTitle).toEqual({ en: 'INVOICE', ar: 'فاتورة' });
    expect(o.taxBar?.enabled).toBe(false);
  });

  it('labels the tax bar with taxNumberLabel (TRN/VATIN), not the tax-system label', () => {
    const o = countryTemplateOverride(omFacts, {
      profile: gccTaxInvoiceProfile, sellerRegistered: true, docType: 'invoice',
    });
    expect(o.taxBar).toMatchObject({ enabled: true, label: { en: 'VATIN' } });
  });

  it('threads the separator facts onto the locale slice', () => {
    const o = countryTemplateOverride(omFacts);
    expect(o.locale).toMatchObject({
      dateFormat: 'DD/MM/YYYY', decimalPlaces: 3,
      decimalSeparator: '.', thousandsSeparator: ',',
    });
  });

  it('keeps the legacy no-compliance behavior byte-identical for existing callers', () => {
    const o = countryTemplateOverride(omFacts);
    expect(o.labels?.documentTitle).toBeUndefined();          // profile absent → no title override
    expect(o.taxBar?.enabled).toBe(true);                     // D11 rule unchanged
    expect(o.language).toEqual({ mode: 'bilingual_stacked', primary: 'ar' });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/pdf/engine/countryConfig.test.ts`
Expected: FAIL — TS errors: `taxNumberLabel` / `decimalSeparator` not in `ResolvedCountryFacts`; `countryTemplateOverride` called with 2 args.

- [ ] **Step 3: Implementation**

3a. `src/lib/pdf/templateConfig.ts` — extend the `LocaleConfig` interface (the `/** Resolved locale slice…` block near `:585`) with two optional fields:

```typescript
  /** Country decimal separator ('.' or ','); absent = engine default '.'. */
  decimalSeparator?: string;
  /** Country thousands separator (',', '.', ' ', or '' for none). */
  thousandsSeparator?: string;
```

3b. `src/lib/pdf/countryFactsService.ts` — replace the select + return (lines 18-34):

```typescript
  const { data } = await supabase
    .from('geo_countries')
    .select(
      'code, tax_system, tax_label, tax_number_label, tax_invoice_required, language_code, ' +
      'decimal_places, date_format, decimal_separator, thousands_separator, digit_grouping',
    )
    .eq('id', countryId)
    .maybeSingle();

  if (!data) return null;

  return {
    code: data.code,
    taxSystem: data.tax_system ?? null,
    taxLabel: data.tax_label ?? null,
    taxNumberLabel: data.tax_number_label ?? null,
    taxInvoiceRequired: !!data.tax_invoice_required,
    languageCode: data.language_code ?? null,
    decimalPlaces: data.decimal_places ?? null,
    dateFormat: data.date_format ?? null,
    decimalSeparator: data.decimal_separator ?? null,
    thousandsSeparator: data.thousands_separator ?? null,
    digitGrouping: data.digit_grouping ?? null,
  };
```

3c. `src/lib/pdf/engine/countryConfig.ts` — full replacement of the file body (interface + mapper):

```typescript
import { isRTLLanguage } from '../../locale';
import type { TemplateConfigOverride } from '../templateConfig';
import type { DocumentComplianceProfile, TaxDocumentType } from '../../regimes/types';

/** Resolved statutory/format facts the country layer needs (read from
 *  geo_countries by countryFactsService; this mapper never touches the DB). */
export interface ResolvedCountryFacts {
  code: string;                        // ISO alpha-2
  taxSystem: string | null;            // 'VAT' | 'GST' | 'SALES_TAX' | 'NONE'
  taxLabel: string | null;             // totals-line label ('VAT')
  taxNumberLabel: string | null;       // registration-number label ('VATIN','TRN','GSTIN')
  taxInvoiceRequired: boolean;
  languageCode: string | null;         // drives RTL via isRTLLanguage
  decimalPlaces: number | null;        // minor-unit (3 OMR/KWD/BHD, 0 JPY)
  dateFormat: string | null;           // stored 'DD/MM/YYYY' etc.
  decimalSeparator: string | null;
  thousandsSeparator: string | null;
  digitGrouping: string | null;        // '3' western, '3;2' Indian (consumed Phase 4)
}

/** Profile inputs for financial documents; null docType = non-financial doc
 *  (labels/receipts/custody) which take only the formatting facts. */
export interface ComplianceOverrideInputs {
  profile: DocumentComplianceProfile;
  sellerRegistered: boolean;
  docType: TaxDocumentType | null;
}

/** Map resolved country facts (+ optional compliance profile) to a derived
 *  (NOT authored) template override slotting between built-in and theme.
 *  Studio/tenant overrides stay ABOVE this layer, so a tenant rename wins. */
export function countryTemplateOverride(
  facts: ResolvedCountryFacts,
  compliance?: ComplianceOverrideInputs,
): TemplateConfigOverride {
  const override: TemplateConfigOverride = {};

  // D9 — resolved tax label drives the totals tax line.
  if (facts.taxLabel) {
    override.labels = { taxLabel: { en: facts.taxLabel } };
  }

  // Profile title ceremony (financial docs only). 'TAX INVOICE' iff the seller
  // is registered AND the country requires the ceremony — decided by the plugin.
  if (compliance && compliance.docType) {
    const t = compliance.profile.documentTitle({
      docType: compliance.docType,
      sellerRegistered: compliance.sellerRegistered,
      taxInvoiceRequired: facts.taxInvoiceRequired,
    });
    override.labels = {
      ...override.labels,
      documentTitle: { en: t.title, ...(t.titleTranslated ? { ar: t.titleTranslated } : {}) },
    };
  }

  // D11 — registration band. With a profile: band shows only for a registered
  // seller whose profile wants it. Without: preserve the legacy fact-only rule.
  const bandEnabled = compliance
    ? facts.taxInvoiceRequired && facts.taxSystem === 'VAT' &&
      compliance.profile.showRegistrationBand && compliance.sellerRegistered
    : facts.taxInvoiceRequired && facts.taxSystem === 'VAT';
  override.taxBar = { enabled: bandEnabled };
  const bandLabel = facts.taxNumberLabel ?? facts.taxLabel;
  if (bandLabel) override.taxBar.label = { en: bandLabel };

  // RTL country -> bilingual-stacked; profile can force Arabic-lead.
  if (facts.languageCode && isRTLLanguage(facts.languageCode)) {
    const arabicLead = compliance?.profile.bilingual.arabicLead === true;
    override.language = { mode: 'bilingual_stacked', primary: arabicLead ? 'ar' : 'ar' };
  } else if (compliance?.profile.bilingual.enabled && compliance.profile.bilingual.secondaryLanguage) {
    override.language = { mode: 'bilingual_stacked', primary: 'en' };
  }

  // §8d/§8g — date format, minor-units and separators onto the locale slice.
  const locale: NonNullable<TemplateConfigOverride['locale']> = {};
  if (facts.dateFormat) locale.dateFormat = facts.dateFormat;
  if (facts.decimalPlaces != null) locale.decimalPlaces = facts.decimalPlaces;
  if (facts.decimalSeparator) locale.decimalSeparator = facts.decimalSeparator;
  if (facts.thousandsSeparator != null) locale.thousandsSeparator = facts.thousandsSeparator;
  if (Object.keys(locale).length > 0) override.locale = locale;

  // Profile paper (Letter for US-profile documents — consumed Phase 5; A4 is a
  // no-op against the built-in default so GCC output is unchanged).
  if (compliance?.profile.paperSize === 'Letter') {
    override.paper = { size: 'LETTER' };
  }

  return override;
}
```

**Note on `override.paper`:** `TemplateConfigOverride.paper?: Partial<PaperConfig>` exists (`templateConfig.ts:681`) and `applyOverride` merges it (`:1313`). Use the actual `PaperConfig` size field name from the file — the `PaperConfig` interface is defined at `templateConfig.ts:236` and the concrete `A4_PORTRAIT` constant at `:739` shows the populated shape (`LABEL_PAPER` at `:746`, `STOCK_LABEL_PAPER` at `:758` are the custom-sheet examples; `:875`/`:957`/`:973` are their *usage* sites, not the definitions). If `PaperConfig` models width/height rather than a named size, map `Letter` to `{ width: 612, height: 792 }` points, matching how `LABEL_PAPER`/`STOCK_LABEL_PAPER` define custom sheets.

3d. Fix the RTL primary duplication above: the `arabicLead` ternary collapses to `'ar'` in both branches deliberately for GCC (Arabic is always primary in bilingual_stacked for RTL countries today — byte-parity with the legacy behavior); the `arabicLead` flag is consumed for real when the SA pack (Arabic-lead mandatory) lands in Phase 3. Keep the variable and add the comment so `zatca`-era readers know it is intentional.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/pdf/engine/countryConfig.test.ts src/lib/pdf/countryFactsService.test.ts` → PASS (existing suites + 5 new). Fix any existing test fixture that now misses the four new `ResolvedCountryFacts` fields by adding them (`taxNumberLabel: null, decimalSeparator: null, thousandsSeparator: null, digitGrouping: null`). `npm run check:tsc` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/countryFactsService.ts src/lib/pdf/engine/countryConfig.ts src/lib/pdf/templateConfig.ts src/lib/pdf/engine/countryConfig.test.ts
git commit -m "feat(pdf): country facts gain taxNumberLabel+separators; countryTemplateOverride consumes DocumentComplianceProfile"
```

---

### Task 7: `formatEngineMoney` separators + `formatPartyAddressLines`

**Files:**
- Modify: `src/lib/pdf/utils.ts:69-78` (`formatEngineMoney`)
- Modify: `src/lib/pdf/utils.ts` (add `formatPartyAddressLines` + `PartyAddressInput` export at end of file)
- Test: `src/lib/pdf/utils.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `formatEngineMoney(amount, { symbol, decimalPlaces, position, decimalSeparator?, thousandsSeparator? })`; `formatPartyAddressLines(addr: PartyAddressInput, postalFirst: boolean): string[]` (consumed by Tasks 12, 13, 22).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/pdf/utils.test.ts`:

```typescript
import { formatEngineMoney, formatPartyAddressLines } from './utils';

describe('formatEngineMoney separators', () => {
  it('defaults to comma-grouping dot-decimal (legacy byte-parity)', () => {
    expect(formatEngineMoney(2000000.5, { symbol: 'OMR', decimalPlaces: 3, position: 'after' }))
      .toBe('2,000,000.500 OMR');
  });
  it('renders continental EU shape from explicit separators', () => {
    expect(formatEngineMoney(1234567.89, {
      symbol: '€', decimalPlaces: 2, position: 'before',
      decimalSeparator: ',', thousandsSeparator: '.',
    })).toBe('€ 1.234.567,89');
  });
  it('supports empty thousands separator', () => {
    expect(formatEngineMoney(1234.5, {
      symbol: 'X', decimalPlaces: 2, position: 'after', thousandsSeparator: '',
    })).toBe('1234.50 X');
  });
});

describe('formatPartyAddressLines', () => {
  const addr = {
    line1: 'Bldg 12, Way 3015', line2: 'Al Khuwair', city: 'Muscat',
    subdivision: 'Muscat', postal_code: '133', country: 'Oman', free_text: null,
  };
  it('street-first order (GCC/US)', () => {
    expect(formatPartyAddressLines(addr, false)).toEqual([
      'Bldg 12, Way 3015', 'Al Khuwair', 'Muscat, Muscat 133', 'Oman',
    ]);
  });
  it('postal-first order (EU/JP city line)', () => {
    expect(formatPartyAddressLines(addr, true)).toEqual([
      'Bldg 12, Way 3015', 'Al Khuwair', '133 Muscat, Muscat', 'Oman',
    ]);
  });
  it('falls back to free text when no structured fields exist (M-I legacy rows)', () => {
    expect(formatPartyAddressLines({ free_text: 'PO Box 1, Ruwi, Muscat' }, false))
      .toEqual(['PO Box 1, Ruwi, Muscat']);
  });
  it('returns [] when nothing is present', () => {
    expect(formatPartyAddressLines({}, false)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/pdf/utils.test.ts`
Expected: FAIL — `formatPartyAddressLines` not exported; separator options rejected by TS.

- [ ] **Step 3: Implementation**

Replace `formatEngineMoney` (`utils.ts:69-78`):

```typescript
export function formatEngineMoney(
  amount: number,
  opts: {
    symbol: string;
    decimalPlaces: number;
    position: 'before' | 'after';
    decimalSeparator?: string;
    thousandsSeparator?: string;
  },
): string {
  const dec = opts.decimalSeparator ?? '.';
  const thou = opts.thousandsSeparator ?? ',';
  const [intPart, decPart] = amount.toFixed(opts.decimalPlaces).split('.');
  const grouped = thou === '' ? intPart : intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thou);
  const formatted = decPart ? `${grouped}${dec}${decPart}` : grouped;
  return opts.position === 'before' ? `${opts.symbol} ${formatted}` : `${formatted} ${opts.symbol}`;
}
```

Append at end of `utils.ts`:

```typescript
export interface PartyAddressInput {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  subdivision?: string | null;
  postal_code?: string | null;
  country?: string | null;
  free_text?: string | null;
}

/** Country-ordered buyer/party address lines. `postalFirst` = the country's
 *  address_format puts the postal code before the city (EU/JP convention).
 *  Falls back to the legacy free-text blob when no structured field is set
 *  (M-I: pre-migration rows keep rendering exactly what they stored). */
export function formatPartyAddressLines(addr: PartyAddressInput, postalFirst: boolean): string[] {
  const lines: string[] = [];
  if (addr.line1?.trim()) lines.push(addr.line1.trim());
  if (addr.line2?.trim()) lines.push(addr.line2.trim());
  const cityBits = [addr.city?.trim(), addr.subdivision?.trim()].filter(Boolean).join(', ');
  const postal = addr.postal_code?.trim() ?? '';
  const cityLine = postalFirst
    ? [postal, cityBits].filter(Boolean).join(' ')
    : [cityBits, postal].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (addr.country?.trim()) lines.push(addr.country.trim());
  if (lines.length === 0 && addr.free_text?.trim()) lines.push(addr.free_text.trim());
  return lines;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/pdf/utils.test.ts` → PASS. `npm run check:tsc` → 0. Also run the full pdf suite to prove the default-separator path is byte-identical: `npx vitest run src/lib/pdf` → all existing goldens/parity green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/utils.ts src/lib/pdf/utils.test.ts
git commit -m "feat(pdf): formatEngineMoney separator options + country-ordered formatPartyAddressLines"
```

**WP-2 verification:** `npm run check:tsc` (0), `npx vitest run src/lib/regimes src/lib/pdf` (green), `npm run lint` (green — no country branching added outside `src/lib/regimes/`).

---
### WP-3 — R4 wiring + credit-note engine + financial cutover (1 PR)

**PR:** `feat/localization-p2-r4-engine-cutover`. Pure TypeScript; no migrations.

---

### Task 8: Wire `resolveTemplateConfigWithCountry` into all eight engine build paths

**Files:**
- Modify: `src/lib/pdf/pdfService.ts` — imports block (`:1-49`) and the eight `resolveTemplateConfig(` call sites at `:115` (invoice), `:157` (quote), `:194` (payment_receipt), `:230` (payslip), `:274` (office_receipt/customer_copy), `:339` (checkout_form), `:379` (case_label), `:420` (chain_of_custody). (The `:73` signature-images helper stays on `resolveTemplateConfig` — it resolves a feature group, not a rendered document.)
- Test: `src/lib/pdf/pdfServiceCountryLayer.test.ts` (new)

**Interfaces:**
- Consumes: `resolveComplianceRenderInputs` (Task 5), `countryTemplateOverride` + `ComplianceOverrideInputs` (Task 6), `resolveTemplateConfigWithCountry` (`templateConfig.ts:1396`).
- Produces: every engine document build resolves the cascade **built-in → country → theme → docType → instance**; a private helper `resolveCountryLayer(docType)` inside pdfService that Tasks 9–10 reuse.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/pdfServiceCountryLayer.test.ts` — a focused unit test on the new helper (exported for test via an internal export):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./engine/profileResolver', () => ({
  resolveComplianceRenderInputs: vi.fn(async () => ({
    facts: {
      code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
      taxInvoiceRequired: true, languageCode: 'ar', decimalPlaces: 3,
      dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
    },
    profile: (await import('../regimes/gcc_tax_invoice')).gccTaxInvoiceProfile,
    sellerRegistered: true,
    sellerTaxNumber: 'OM1100000000',
  })),
  clearComplianceRenderCache: vi.fn(),
}));

import { resolveCountryLayer } from './pdfService';

describe('pdfService country layer (R4)', () => {
  it('builds a profile-titled override for financial doc types', async () => {
    const layer = await resolveCountryLayer('invoice');
    expect(layer?.labels?.documentTitle).toEqual({ en: 'TAX INVOICE', ar: 'فاتورة ضريبية' });
    expect(layer?.taxBar?.enabled).toBe(true);
    expect(layer?.locale?.decimalPlaces).toBe(3);
  });

  it('builds a facts-only override for non-financial doc types', async () => {
    const layer = await resolveCountryLayer(null);
    expect(layer?.labels?.documentTitle).toBeUndefined();
    expect(layer?.locale?.dateFormat).toBe('DD/MM/YYYY');
  });
});
```

Also add a null-facts case: mock `resolveComplianceRenderInputs` to return `{ facts: null, ... }` in a second `vi.mocked(...).mockResolvedValueOnce(...)` block and assert `await resolveCountryLayer('invoice')` returns `undefined` (identity layer — existing tenants without a country are byte-unchanged).

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/pdf/pdfServiceCountryLayer.test.ts`
Expected: FAIL — `resolveCountryLayer` is not exported from `./pdfService`.

- [ ] **Step 3: Implementation**

3a. Add to the pdfService imports block:

```typescript
import { resolveTemplateConfigWithCountry } from './templateConfig';
import { countryTemplateOverride, type ComplianceOverrideInputs } from './engine/countryConfig';
import { resolveComplianceRenderInputs } from './engine/profileResolver';
import type { TaxDocumentType } from '../regimes/types';
```

3b. Add the shared helper (place directly above `buildInvoiceDocumentViaEngine`, `pdfService.ts:96`):

```typescript
/** R4: derive the COUNTRY cascade layer for a build path. Financial doc types
 *  (TaxDocumentType) also take the DocumentComplianceProfile (title ceremony,
 *  registration band, bilingual, paper); non-financial docs (null) take only
 *  the formatting facts. Returns undefined when the tenant has no resolvable
 *  country — the cascade treats undefined as identity, so legacy behavior is
 *  byte-identical. Resolution failures NEVER break generation (fail-soft). */
export async function resolveCountryLayer(
  docType: TaxDocumentType | null,
): Promise<TemplateConfigOverride | undefined> {
  try {
    const compliance = await resolveComplianceRenderInputs();
    if (!compliance.facts) return undefined;
    const inputs: ComplianceOverrideInputs | undefined = docType
      ? { profile: compliance.profile, sellerRegistered: compliance.sellerRegistered, docType }
      : undefined;
    return countryTemplateOverride(compliance.facts, inputs);
  } catch (err) {
    console.error('[PDF Service] country layer resolution failed, rendering without it:', err);
    return undefined;
  }
}
```

3c. Sweep the eight call sites. The complete pattern, shown once (invoice, `pdfService.ts:105-128`):

```typescript
  let docTypeOverride: TemplateConfigOverride | undefined;
  try {
    const deployed = await getDeployedVersionByType('invoice');
    if (deployed) {
      docTypeOverride = readConfig(deployed.config);
    }
  } catch (err) {
    console.error('[PDF Service] Invoice engine: template resolution failed, using built-in default:', err);
  }

  const countryLayer = await resolveCountryLayer('invoice');

  const resolvedConfig: DocumentTemplateConfig = resolveTemplateConfigWithCountry(
    BUILT_IN_TEMPLATE_CONFIGS.invoice,
    countryLayer,
    /* theme */ undefined,
    docTypeOverride,
    /* instance */ undefined,
  );

  const languageAwareConfig = applyTenantLanguage(
    resolvedConfig,
    data.companySettings,
    docTypeOverride?.language !== undefined || countryLayer?.language !== undefined,
  );
```

(The third `applyTenantLanguage` argument gains `|| countryLayer?.language !== undefined` so an explicit country bilingual decision is not stomped by the tenant language bridge; the locale slice needs no `applyTenantLocale` call — the cascade already merged `countryLayer.locale` into `resolvedConfig.locale`, and the adapters consume it in Task 12.)

Complete enumeration — apply the identical three-line change (insert `resolveCountryLayer` call; `resolveTemplateConfig` → `resolveTemplateConfigWithCountry` with `countryLayer` as the 2nd arg; extend the `applyTenantLanguage` suppression flag where the call exists):

| # | Function | Call site (old) | `resolveCountryLayer` arg | BUILT_IN key |
|---|---|---|---|---|
| 1 | `buildInvoiceDocumentViaEngine` | `pdfService.ts:115` | `'invoice'` | `BUILT_IN_TEMPLATE_CONFIGS.invoice` |
| 2 | `buildQuoteViaEngine` | `pdfService.ts:157` | `'quote'` | `.quote` |
| 3 | `buildPaymentReceiptViaEngine` | `pdfService.ts:194` | `null` (not a TaxDocumentType — facts-only) | `.payment_receipt` |
| 4 | `buildPayslipViaEngine` | `pdfService.ts:230` | `null` | `.payslip` |
| 5 | `buildOfficeReceiptViaEngine` | `pdfService.ts:274` | `null` | `.office_receipt` / `.customer_copy` (existing param) |
| 6 | `buildCheckoutFormViaEngine` | `pdfService.ts:339` | `null` | `.checkout_form` |
| 7 | `buildCaseLabelViaEngine` | `pdfService.ts:379` | `null` | `.case_label` |
| 8 | `buildChainOfCustodyViaEngine` | `pdfService.ts:420` | `null` | `.chain_of_custody` |

(Line numbers shift as you edit top-down; re-locate each with `grep -n "resolveTemplateConfig(" src/lib/pdf/pdfService.ts` after each edit — when the sweep is done that grep must return only the `:73` signature-images helper and the `resolveTemplateConfigWithCountry` sites.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/pdf/pdfServiceCountryLayer.test.ts` → PASS.
Run: `npx vitest run src/lib/pdf` → all existing parity/golden suites PASS (they run with facts unresolved/mocked-null → identity layer → byte-identical output).
Run: `npm run check:tsc` → 0.
Run: `grep -c "resolveTemplateConfigWithCountry(" src/lib/pdf/pdfService.ts` → `8`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/pdfService.ts src/lib/pdf/pdfServiceCountryLayer.test.ts
git commit -m "feat(pdf): R4 — country facts + compliance profile wired into all 8 engine build paths"
```

---

### Task 9: Credit-note engine adapter + built-in config + unconditional engine route

**Files:**
- Modify: `src/lib/pdf/templateConfig.ts:660-671` (`TemplateDocumentType` union) and the `BUILT_IN_TEMPLATE_CONFIGS` record (`:1090`)
- Create: `src/lib/pdf/engine/adapters/creditNoteAdapter.ts`
- Create: `src/lib/pdf/engine/adapters/creditNoteAdapter.test.ts`
- Modify: `src/lib/pdf/pdfService.ts` — `generateCreditNote` (`:926`); route its single `buildCreditNoteDocument(data, ctx, logoBase64)` call (`:952`) through `buildCreditNoteViaEngine`. There is NO credit-note blob export today — `generatePDFAsBlob`'s switch (`:1619`) has no `credit_note` case and no `generateCreditNoteAsBlob` exists — so there is exactly one call site to reroute.

**Interfaces:**
- Consumes: `CreditNoteDocumentData` (from `./types`, already returned by `fetchCreditNoteData` at `dataFetcher.ts:640`); `EngineDocData`, `PartyBlock` (`src/lib/pdf/engine/types.ts:618/:51`); `renderTemplate`; `resolveCountryLayer` (Task 8); `formatEngineMoney` (Task 7).
- Produces: `toCreditNoteEngineData(data: CreditNoteDocumentData, config: DocumentTemplateConfig): EngineDocData`; `'credit_note'` as a first-class `TemplateDocumentType` (Studio can now deploy credit-note templates); `buildCreditNoteViaEngine` in pdfService.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/adapters/creditNoteAdapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toCreditNoteEngineData } from './creditNoteAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../../templateConfig';
import type { CreditNoteDocumentData } from '../../types';

// Real fixture: CreditNoteData is FLAT (types.ts:470) — flat currency_symbol/
// currency_position/decimal_places (no accounting_locales), flat customer_name/
// company_name, credit_note_date, and CreditNoteLineItem = {description, quantity,
// unit_price, line_total}. The companySettings shape is narrowed with a cast — the
// adapter only reads basic_info.vat_number / location.country from it.
const fixture: CreditNoteDocumentData = {
  creditNoteData: {
    credit_note_number: 'CN-0001',
    credit_note_date: '2026-07-01',
    credit_type: 'refund',
    status: 'issued',
    reason_code: 'FAILED_RECOVERY',
    reason_notes: 'Refund — failed recovery',
    subtotal: 100,
    tax_rate: 5,
    tax_amount: 5,
    total_amount: 105,
    applied_amount: 0,
    invoice_number: 'INVO-0007',
    customer_name: 'Test Buyer',
    company_name: null,
    case_no: null,
    currency_symbol: 'ر.ع.',
    currency_position: 'after',
    decimal_places: 3,
    items: [{ description: 'Refund — failed recovery', quantity: 1, unit_price: 100, line_total: 105 }],
  },
  companySettings: {
    basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC', vat_number: 'OM1100000000' },
    location: { country: 'Oman' },
  } as CreditNoteDocumentData['companySettings'],
};

describe('toCreditNoteEngineData', () => {
  it('maps the credit note into EngineDocData with stored totals (no recompute)', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.credit_note;
    const data = toCreditNoteEngineData(fixture, config);
    expect(data.meta.some((m) => m.value === 'CN-0001')).toBe(true);
    const totalRow = data.totals?.find((t) => t.key === 'total');
    expect(totalRow?.value).toContain('105');           // stored total_amount, not re-derived
    expect(data.title).toBeDefined();                    // config-driven title (profile layer sets it)
    expect(data.to.name).toBe('Test Buyer');             // flat customer_name, not nested
  });

  it('renders one tax totals row from stored tax_amount when no tax lines exist (M-I fallback)', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.credit_note;
    const data = toCreditNoteEngineData(fixture, config);
    const taxRow = data.totals?.find((t) => t.key === 'tax');
    expect(taxRow?.value).toContain('5');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/pdf/engine/adapters/creditNoteAdapter.test.ts`
Expected: FAIL — module not found; `BUILT_IN_TEMPLATE_CONFIGS.credit_note` type error.

- [ ] **Step 3: Implementation**

3a. `templateConfig.ts` — add `'credit_note'` to the `TemplateDocumentType` union (`:660-671`) and a built-in config entry in `BUILT_IN_TEMPLATE_CONFIGS` (`:1090`). Clone the `invoice` entry's structure with these deltas: `labels.documentTitle: { en: 'CREDIT NOTE', ar: 'إشعار دائن' }`; totals lines `subtotal`, `tax`, `total` on, `amountPaid`/`balanceDue` off; sections `header`, `parties`, `meta`, `lineItems` (same `lineItemColumns()` call), `totals`, `terms`, `footer` in the invoice order. Keep `paper: A4_PORTRAIT` and `ENGLISH_ONLY` language default (the country layer flips bilingual).

3b. Create `src/lib/pdf/engine/adapters/creditNoteAdapter.ts`. Follow `paymentReceiptAdapter.ts` as the structural template (single-money-block document). Core mapping — complete:

```typescript
import type { DocumentTemplateConfig } from '../../templateConfig';
import type { EngineDocData, PartyBlock } from '../types';
import type { CreditNoteDocumentData } from '../../types';
import { formatEngineMoney } from '../../utils';
import { fmtDateWithConfig } from '../../configDate';

export function toCreditNoteEngineData(
  cn: CreditNoteDocumentData,
  config: DocumentTemplateConfig,
): EngineDocData {
  const { creditNoteData, companySettings } = cn;
  // CreditNoteData is FLAT (types.ts:470): flat currency_symbol/currency_position/
  // decimal_places (NO accounting_locales), flat customer_name/company_name,
  // credit_note_date, items {description, quantity, unit_price, line_total}.
  const money = (amount: number): string =>
    formatEngineMoney(amount, {
      symbol: creditNoteData.currency_symbol || '',
      decimalPlaces: config.locale?.decimalPlaces ?? creditNoteData.decimal_places ?? 2,
      position: creditNoteData.currency_position === 'before' ? 'before' : 'after',
      decimalSeparator: config.locale?.decimalSeparator,
      thousandsSeparator: config.locale?.thousandsSeparator,
    });
  const fmtDate = (d: string | null | undefined): string =>
    d ? fmtDateWithConfig(d, config.locale?.dateFormat ?? 'DD/MM/YYYY') : '';

  const to: PartyBlock = {
    title: config.labels?.parties ?? { en: 'Customer Information', ar: 'معلومات العميل' },
    name: creditNoteData.customer_name ?? creditNoteData.company_name ?? 'N/A',
    rows: [],
  };
  if (creditNoteData.buyer_tax_number) {   // added to CreditNoteData by Task 11
    const label = creditNoteData.buyer_tax_number_label ?? config.taxBar?.label?.en ?? 'Tax No';
    to.rows.push({ label: { en: `${label}:`, ar: `${label}:` }, value: creditNoteData.buyer_tax_number });
  }

  const meta: EngineDocData['meta'] = [
    { label: { en: 'Credit Note No:', ar: 'رقم إشعار الدائن:' }, value: creditNoteData.credit_note_number || 'Draft' },
    { label: { en: 'Date:', ar: 'التاريخ:' }, value: fmtDate(creditNoteData.credit_note_date) },
  ];
  if (creditNoteData.invoice_number) {
    meta.push({ label: { en: 'Against Invoice:', ar: 'مقابل الفاتورة:' }, value: creditNoteData.invoice_number });
  }

  const rows = (creditNoteData.items ?? []).map((item) => ({
    description: item.description ?? '',
    quantity: String(item.quantity ?? 1),
    unitPrice: money(item.unit_price ?? 0),
    lineTotal: money(item.line_total ?? 0),
  }));

  // Seller registration number: prefer the legal_entities snapshot (Task 11 →
  // creditNoteData.seller_tax_number) so the printed band matches the preview.
  const sellerVatNumber = creditNoteData.seller_tax_number ?? companySettings.basic_info?.vat_number ?? null;
  const identity = sellerVatNumber
    ? { ...companySettings, basic_info: { ...companySettings.basic_info, vat_number: sellerVatNumber } }
    : companySettings;

  // Totals from STORED amounts. Component rows come from document_tax_lines
  // (threaded in Task 11 via creditNoteData.tax_lines); fall back to the single
  // stored header tax_amount — NEVER a recompute.
  const totals: NonNullable<EngineDocData['totals']> = [
    { key: 'subtotal', label: { en: 'Subtotal:', ar: 'المجموع الفرعي:' }, value: money(creditNoteData.subtotal ?? 0) },
  ];
  const taxLines = (creditNoteData.tax_lines ?? []).filter((l) => l.line_item_id === null);
  if (taxLines.length > 0) {
    for (const l of taxLines) {
      totals.push({ key: 'tax', label: { en: `${l.component_label}:`, ar: `${l.component_label}:` }, value: money(l.tax_amount) });
    }
  } else if ((creditNoteData.tax_amount ?? 0) !== 0) {
    const label = config.labels?.taxLabel?.en ?? 'Tax';
    const rate = creditNoteData.tax_rate != null ? ` ${creditNoteData.tax_rate}%` : '';
    totals.push({ key: 'tax', label: { en: `${label}${rate}:`, ar: `${label}${rate}:` }, value: money(creditNoteData.tax_amount ?? 0) });
  }
  totals.push({ key: 'total', label: { en: 'Total Credited:', ar: 'إجمالي الدائن:' }, value: money(creditNoteData.total_amount ?? 0), emphasis: true });

  return {
    title: config.labels?.documentTitle ?? { en: 'CREDIT NOTE', ar: 'إشعار دائن' },
    identity,
    to,
    meta,
    columns: (config.sections.find((s) => s.key === 'lineItems')?.columns ?? []).map((c) => ({
      key: c.key, visible: c.visible, label: c.label,
      ...(c.width !== undefined ? { width: c.width } : {}),
      align: c.key === 'quantity' ? 'center' : c.key === 'unitPrice' || c.key === 'lineTotal' ? 'right' : 'left',
    })),
    rows,
    totals,
    notes: creditNoteData.reason_notes ?? undefined,
  } satisfies EngineDocData;
}
```

**Do NOT add unit/item-code row keys to credit notes this phase:** `CreditNoteLineItem` is `{description, quantity, unit_price, line_total}` (types.ts:463) and Task 11 threads only `tax_lines` + snapshot fields onto `CreditNoteData` — it does NOT add `unit_label`/`item_code` to the credit-note line type or the `credit_note_items` select. Credit-note rows stay 4-column; unit/item-code rendering on credit notes is deferred (the columns persist via Task 1/23, rendering follows India Phase 4). **Field-name discipline:** `EngineDocData` is a real Phase-1-era interface (`engine/types.ts:618`) — while implementing, open it and match its exact member names; mirror whatever invoiceAdapter emits, including any required members this sketch omits (e.g. `from`/`qr` — copy their construction from `invoiceAdapter.ts`). The test in Step 1 pins the observable behavior.

3c. pdfService — add the engine build function (place after `buildQuoteViaEngine`):

```typescript
async function buildCreditNoteViaEngine(
  data: CreditNoteDocumentData,
  logoBase64: string | null,
): Promise<TDocumentDefinitions> {
  let docTypeOverride: TemplateConfigOverride | undefined;
  try {
    const deployed = await getDeployedVersionByType('credit_note');
    if (deployed) docTypeOverride = readConfig(deployed.config);
  } catch (err) {
    console.error('[PDF Service] Credit-note engine: template resolution failed, using built-in default:', err);
  }
  const countryLayer = await resolveCountryLayer('credit_note');
  const resolvedConfig = resolveTemplateConfigWithCountry(
    BUILT_IN_TEMPLATE_CONFIGS.credit_note, countryLayer, undefined, docTypeOverride, undefined,
  );
  const languageAwareConfig = applyTenantLanguage(
    resolvedConfig, data.companySettings,
    docTypeOverride?.language !== undefined || countryLayer?.language !== undefined,
  );
  const engineData = toCreditNoteEngineData(data, languageAwareConfig);
  await initializePDFFonts(resolveSecondary(languageAwareConfig.language));
  return renderTemplate(languageAwareConfig, engineData, ctxFromLanguageConfig(languageAwareConfig.language), logoBase64);
}
```

Route `generateCreditNote` (`:926`) through `buildCreditNoteViaEngine(data, logoBase64)` unconditionally, replacing the single `buildCreditNoteDocument(data, ctx, logoBase64)` call at `:952`. There is only ONE call site: there is no `generateCreditNoteAsBlob` and `generatePDFAsBlob`'s switch (`:1619`) has no `credit_note` case — do not invent a blob path this phase. (Match `renderTemplate`'s actual arity from `renderTemplate.ts:85` — if it takes a QR/logo bundle like `renderWithQr` does in the invoice path, mirror the quote path's call shape.)

- [ ] **Step 4: Run tests, verify pass**

`npx vitest run src/lib/pdf/engine/adapters/creditNoteAdapter.test.ts` → PASS. `npx vitest run src/lib/pdf` → green. `npm run check:tsc` → 0. Studio smoke: `TemplateDocumentType` consumers compile (`npm run check:tsc` catches all — the union widening is additive).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/templateConfig.ts src/lib/pdf/engine/adapters/creditNoteAdapter.ts src/lib/pdf/engine/adapters/creditNoteAdapter.test.ts src/lib/pdf/pdfService.ts
git commit -m "feat(pdf): credit notes join the engine cascade — adapter, built-in config, unconditional route"
```

---

### Task 10: Invoice/quote engine cutover + legacy builder deletion

**Files:**
- Modify: `src/lib/pdf/pdfService.ts` — flag ternaries at `:771-773` (quote download), `:873-875` (invoice download), blob variants `generateQuoteAsBlob` (`:1436` region) and `generateInvoiceAsBlob` (`:1481` region); imports `:7-9`
- Modify: `src/lib/pdf/engine/featureFlag.ts:29-41` — remove the `invoice` and `quote` entries from `FLAG_ENV_BY_TYPE`
- Delete: `src/lib/pdf/documents/InvoiceDocument.ts`, `src/lib/pdf/documents/QuoteDocument.ts`, `src/lib/pdf/documents/CreditNoteDocument.ts`
- Modify: `src/lib/pdf/engine/invoiceParity.test.ts`, `invoicePilot.test.ts`, and the quote parity suite — convert from engine↔legacy comparison to engine golden snapshots
- Modify: `src/lib/pdf/documents/__goldens__/` — re-baseline invoice/quote/credit-note goldens to engine output

**Interfaces:**
- Consumes: Tasks 8–9 complete; the existing parity suites green (final legacy↔engine byte-comparison).
- Produces: the engine is the ONLY build path for invoice/quote/credit_note; no `VITE_PDF_ENGINE_INVOICE`/`VITE_PDF_ENGINE_QUOTE` flag remains (owner rule: flags removed by phase end).

- [ ] **Step 1: Final parity run (the "failing test" is any divergence)**

```bash
npx vitest run src/lib/pdf/engine/invoiceParity.test.ts src/lib/pdf/engine
```
Expected: PASS. This is the last time the legacy builders execute — a failure here means Tasks 8–9 changed engine output where facts are null; fix before proceeding (the country layer must be identity when facts are null).

- [ ] **Step 2: Cut the routes over**

In `pdfService.ts` replace:

```typescript
    const docDefinition = isPdfEngineEnabled('quote')
      ? await buildQuoteViaEngine(data, ctx, logoBase64, qrCodeBase64)
      : buildQuoteDocument(data, ctx, logoBase64, qrCodeBase64);
```
with:
```typescript
    const docDefinition = await buildQuoteViaEngine(data, ctx, logoBase64, qrCodeBase64);
```
Apply the same collapse at all four sites:

| Site | Location | Keep |
|---|---|---|
| quote download | `pdfService.ts:771-773` | `buildQuoteViaEngine` |
| invoice download | `pdfService.ts:873-875` | `buildInvoiceDocumentViaEngine` |
| quote blob | `generateQuoteAsBlob` (`:1436` region — grep `isPdfEngineEnabled('quote')`) | `buildQuoteViaEngine` |
| invoice blob | `generateInvoiceAsBlob` (`:1481` region — grep `isPdfEngineEnabled('invoice')`) | `buildInvoiceDocumentViaEngine` |

Then delete the three legacy builder files, remove their imports (`pdfService.ts:7-9`), and remove `invoice`/`quote` from `FLAG_ENV_BY_TYPE` (`featureFlag.ts:29-41`). `grep -rn "buildInvoiceDocument\|buildQuoteDocument\|buildCreditNoteDocument" src/` must return zero production hits (test fixtures updated in Step 3).

- [ ] **Step 3: Re-baseline goldens**

The parity tests referenced the legacy builders; convert each to a pure engine golden: render the same fixtures through `buildInvoiceDocumentViaEngine`/`buildQuoteViaEngine`/`buildCreditNoteViaEngine` (facts mocked null) and snapshot the doc-definition JSON. Regenerate `__goldens__` files with `npx vitest run src/lib/pdf -u`, then **manually diff the regenerated goldens** — the only acceptable delta is none (facts-null output was proven byte-identical in Step 1).

- [ ] **Step 4: Full verification**

```bash
npm run check:tsc      # 0
npx vitest run src/lib/pdf
npm run test           # full suite
npm run lint
grep -rn "VITE_PDF_ENGINE_INVOICE\|VITE_PDF_ENGINE_QUOTE" src/ .env* 2>/dev/null   # no src/ hits
```

- [ ] **Step 5: Commit**

```bash
git add -A src/lib/pdf
git commit -m "feat(pdf)!: invoice/quote/credit-note render exclusively via the engine; legacy builders deleted (owner ceremony-compression)"
```

**WP-3 verification:** all of Step 4 above, plus a manual smoke: `npm run dev`, generate an invoice PDF and a quote PDF from the Oman demo tenant and confirm (a) 'TAX INVOICE / فاتورة ضريبية' title, (b) VATIN band, (c) DD/MM/YYYY dates, (d) 3-decimal OMR money — all now flowing from country facts, no Studio override needed.

---

### WP-4 — Component rows, snapshots on documents, previews, trace (1 PR)

**PR:** `feat/localization-p2-component-rendering`. Pure TypeScript; no migrations.

---

### Task 11: dataFetcher — tax lines, buyer identity, snapshot columns

**Files:**
- Modify: `src/lib/pdf/dataFetcher.ts` — `currencyToBlock` (`:159-166`), the invoice party selects (`:772` customers, and the sibling `companies` select in the same `fetchInvoiceDetails` block), the quote party selects (`:513` region), `toInvoiceData` (`:581-624`), `fetchInvoiceData` (`:626-638`), `toQuoteData` (`:433` region), `fetchQuoteData` (`:477` region), `fetchCreditNoteData` (`:640` region)
- Modify: `src/lib/pdf/types.ts` — `InvoiceData`, `QuoteData`, `CreditNoteData` interfaces
- Test: `src/lib/pdf/dataFetcher.test.ts` (extend existing suite)

**Interfaces:**
- Consumes: `document_tax_lines` table (Phase 1), snapshot columns on `invoices`/`quotes`/`credit_notes` (Phase 1), structured address columns (Task 3), `CurrencyConfig` separators (existing `src/types/tenantConfig.ts`).
- Produces: `DocumentTaxLineRow` + `fetchDocumentTaxLines(documentType, documentId)` (exact signature in APIs section); extended document data types:

```typescript
// added to InvoiceData / QuoteData / CreditNoteData in src/lib/pdf/types.ts
buyer_tax_number?: string | null;
buyer_tax_number_label?: string | null;
buyer_address?: Record<string, unknown> | null;   // issuance snapshot jsonb
seller_tax_number?: string | null;
supply_date?: string | null;
reverse_charge?: boolean;
notations?: Array<{ code: string; text: string; textTranslated?: string }> | null;
tax_lines?: DocumentTaxLineRow[];
// customer/company blocks gain:
tax_number?: string | null;
address_line1?: string | null; address_line2?: string | null;
postal_code?: string | null; subdivision_name?: string | null;
// accounting_locales block gains:
decimal_separator?: string; thousands_separator?: string;
```

- [ ] **Step 1: Write the failing test**

Extend `src/lib/pdf/dataFetcher.test.ts`:

```typescript
import { toInvoiceData } from './dataFetcher';

describe('toInvoiceData compliance fields', () => {
  it('threads snapshot columns and tax lines through', () => {
    const data = toInvoiceData(
      {
        id: 'i1', invoice_number: 'INVO-1', invoice_type: 'tax_invoice',
        buyer_tax_number: 'OM222', buyer_tax_number_label: 'VATIN',
        seller_tax_number: 'OM111', supply_date: '2026-07-01', reverse_charge: false,
        notations: [{ code: 'ZERO_RATED', text: 'Zero-rated supply (EXPORT_SERVICES).' }],
      } as Parameters<typeof toInvoiceData>[0],
      {
        currency: { code: 'OMR', symbol: 'ر.ع.', decimalPlaces: 3, position: 'after',
          decimalSeparator: '.', thousandsSeparator: ',' } as never,
        items: [],
        taxLines: [{
          line_item_id: null, component_code: 'VAT', component_label: 'VAT 5%',
          rate: 5, taxable_base: 100, tax_amount: 5, tax_treatment: 'standard',
          treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
        }],
      },
    );
    expect(data.buyer_tax_number).toBe('OM222');
    expect(data.seller_tax_number).toBe('OM111');
    expect(data.supply_date).toBe('2026-07-01');
    expect(data.tax_lines).toHaveLength(1);
    expect(data.accounting_locales?.decimal_separator).toBe('.');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

`npx vitest run src/lib/pdf/dataFetcher.test.ts` → FAIL (unknown properties / extras shape mismatch).

- [ ] **Step 3: Implementation**

3a. Add the fetch helper (top-level export near the other fetchers):

```typescript
export interface DocumentTaxLineRow {
  line_item_id: string | null;
  component_code: string;
  component_label: string;
  rate: number;
  taxable_base: number;
  tax_amount: number;
  tax_treatment: string;
  treatment_reason_code: string | null;
  sequence: number;
  backfilled: boolean;
  rule_trace: unknown;
}

export async function fetchDocumentTaxLines(
  documentType: 'quote' | 'invoice' | 'credit_note' | 'stock_sale',
  documentId: string,
): Promise<DocumentTaxLineRow[]> {
  const { data, error } = await supabase
    .from('document_tax_lines')
    .select('line_item_id, component_code, component_label, rate, taxable_base, tax_amount, tax_treatment, treatment_reason_code, sequence, backfilled, rule_trace')
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .is('deleted_at', null)
    .order('sequence');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    rate: Number(r.rate), taxable_base: Number(r.taxable_base), tax_amount: Number(r.tax_amount),
  }));
}
```

3b. `currencyToBlock` (`:159-166`) — add the two separator fields:

```typescript
export function currencyToBlock(c: CurrencyConfig): NonNullable<QuoteData['accounting_locales']> {
  return {
    currency_symbol: renderCurrencyToken(c),
    currency_position: c.position,
    decimal_places: c.decimalPlaces,
    decimal_separator: c.decimalSeparator,
    thousands_separator: c.thousandsSeparator,
  };
}
```
(`CurrencyConfig` already models separators per the TenantConfig contract — check the exact member names in `src/types/tenantConfig.ts` and use them verbatim.)

3c. Party selects — add buyer identity + structured address. Invoice customers select (`:772`):

```typescript
          .select('id, customer_name, email, mobile_number, phone, address, tax_number, address_line1, address_line2, postal_code, subdivision:geo_subdivisions!subdivision_id ( name )')
```
Apply the identical column addition at: quote customers select (`:513`), and the `companies` selects inside `fetchInvoiceDetails`/`fetchQuoteDetails`/`fetchCreditNoteData` (grep `from('companies')` inside dataFetcher — add `tax_number, address_line1, address_line2, postal_code, subdivision:geo_subdivisions!subdivision_id ( name )` to each). Map the new fields in `toCustomerBlock`/`toCompanyBlock` (flatten `subdivision?.name` → `subdivision_name`).

3d. `toInvoiceData` (`:581-624`) — extras gains `taxLines?: DocumentTaxLineRow[] | null`; the return adds:

```typescript
    buyer_tax_number: invoiceRow.buyer_tax_number ?? null,
    buyer_tax_number_label: invoiceRow.buyer_tax_number_label ?? null,
    buyer_address: (invoiceRow.buyer_address as Record<string, unknown> | null) ?? null,
    seller_tax_number: invoiceRow.seller_tax_number ?? null,
    supply_date: invoiceRow.supply_date ?? null,
    reverse_charge: invoiceRow.reverse_charge ?? false,
    notations: (invoiceRow.notations as InvoiceData['notations']) ?? null,
    tax_lines: extras.taxLines ?? [],
```

`fetchInvoiceData` (`:626-638`) adds the fetch to the `Promise.all`:

```typescript
  const [invoiceResult, settingsResult, paymentHistory, taxLines] = await Promise.all([
    fetchInvoiceDetails(invoiceId),
    fetchCompanySettings(),
    fetchInvoicePaymentHistory(invoiceId),
    fetchDocumentTaxLines('invoice', invoiceId),
  ]);
```
and threads `taxLines` into the invoice data (attach where `fetchInvoiceDetails` composes via `toInvoiceData` — pass through the extras object).

3e. Mirror 3d for `toQuoteData`/`fetchQuoteData` (`document_type 'quote'`) and `fetchCreditNoteData` (`document_type 'credit_note'`; the credit-note fetcher composes inline — attach `tax_lines` onto `creditNoteData` and the snapshot fields from the `credit_notes` row).

- [ ] **Step 4: Run tests, verify pass**

`npx vitest run src/lib/pdf/dataFetcher.test.ts` → PASS. `npm run check:tsc` → 0. `npx vitest run src/lib/pdf` → green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/dataFetcher.ts src/lib/pdf/types.ts src/lib/pdf/dataFetcher.test.ts
git commit -m "feat(pdf): dataFetcher threads document_tax_lines, buyer tax identity, structured addresses, issuance snapshots"
```

---
### Task 12: invoiceAdapter — component rows, stored amounts, buyer identity, locale consumption

**Files:**
- Modify: `src/lib/pdf/engine/adapters/invoiceAdapter.ts` — party rows (`:100-119`), meta dates (`:120-129`), line rows (`:131-140`), totals block (`:142-195`), taxSummary (`:197-224`), money formatter (`:74-79`)
- Modify: `src/lib/pdf/templateConfig.ts` — `lineItemColumns()` (`:778-785`)
- Test: `src/lib/pdf/engine/adapters/invoiceAdapter.compliance.test.ts` (new)

**Interfaces:**
- Consumes: extended `InvoiceData` (Task 11), `formatEngineMoney` separators (Task 7), `formatPartyAddressLines` (Task 7), `fmtDateWithConfig`/`toDateFnsFormat` (`src/lib/pdf/configDate.ts` — existing), `config.locale` (merged by the country layer, Task 8).
- Produces: totals/taxSummary rendering **one row per document-level `tax_lines` rollup**; buyer tax-number + address rows; supply-date meta; notations lines; `unit`/`itemCode` row keys (consumed by the `unit`/`itemCode` columns added to `lineItemColumns()`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/adapters/invoiceAdapter.compliance.test.ts` (reuse the invoice fixture builder from `invoiceParity.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { toEngineData } from './invoiceAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../../templateConfig';
import { countryTemplateOverride } from '../countryConfig';
import { gccTaxInvoiceProfile } from '../../../regimes/gcc_tax_invoice';
// buildInvoiceFixture: copy the fixture helper used by invoiceParity.test.ts
import { buildInvoiceFixture } from '../invoiceParity.fixtures';

const omFacts = {
  code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
  taxInvoiceRequired: true, languageCode: 'ar' as const, decimalPlaces: 3,
  dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
};

function omConfig() {
  return resolveTemplateConfigWithCountry(
    BUILT_IN_TEMPLATE_CONFIGS.invoice,
    countryTemplateOverride(omFacts, { profile: gccTaxInvoiceProfile, sellerRegistered: true, docType: 'invoice' }),
  );
}

describe('invoiceAdapter compliance rendering', () => {
  it('renders one totals row per tax-line component from STORED amounts', () => {
    const fixture = buildInvoiceFixture({
      subtotal: 1440, tax_amount: 72, total_amount: 1512,
      tax_lines: [{
        line_item_id: null, component_code: 'VAT', component_label: 'VAT 5%',
        rate: 5, taxable_base: 1440, tax_amount: 72, tax_treatment: 'standard',
        treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
      }],
    });
    const data = toEngineData(fixture, omConfig());
    const taxRows = data.totals!.filter((t) => t.key === 'tax');
    expect(taxRows).toHaveLength(1);
    expect(taxRows[0].label.en).toBe('VAT 5%:');
    expect(taxRows[0].value).toContain('72');
    // total from stored total_amount, not (subtotal-discount)*(1+rate)
    expect(data.totals!.find((t) => t.key === 'total')!.value).toContain('1,512');
  });

  it('falls back to ONE row from stored header tax when tax_lines is empty (M-I)', () => {
    const fixture = buildInvoiceFixture({ subtotal: 100, tax_rate: 5, tax_amount: 4.75, total_amount: 104.75, tax_lines: [] });
    const data = toEngineData(fixture, omConfig());
    const taxRow = data.totals!.find((t) => t.key === 'tax')!;
    expect(taxRow.value).toContain('4.750');   // the STORED 4.75 — a recompute would print 5.000
  });

  it('renders buyer tax number with the country label and buyer address lines incl. governorate', () => {
    const fixture = buildInvoiceFixture({
      buyer_tax_number: 'OM99887766', buyer_tax_number_label: 'VATIN',
      // Snapshot shape as issued by issue_tax_document (Task 18 Edit B): the
      // subdivision is the RESOLVED NAME under `subdivision`, not a raw uuid.
      buyer_address: { line1: 'Bldg 12', subdivision: 'Muscat Governorate', postal_code: '133' },
    });
    const data = toEngineData(fixture, omConfig());
    const labels = data.to.rows.map((r) => r.label.en);
    expect(labels).toContain('VATIN:');
    expect(data.to.rows.some((r) => r.value === 'Bldg 12')).toBe(true);
    // An ISSUED invoice renders the governorate from the frozen snapshot — the
    // real failure mode (blank subdivision on issued docs) this asserts against.
    expect(data.to.rows.some((r) => (r.value ?? '').includes('Muscat Governorate'))).toBe(true);
  });

  it('adds a Supply Date meta row when supply_date differs from invoice_date', () => {
    const fixture = buildInvoiceFixture({ invoice_date: '2026-07-02', supply_date: '2026-06-28' });
    const data = toEngineData(fixture, omConfig());
    expect(data.meta.some((m) => m.label.en === 'Supply Date:' && m.value === '28/06/2026')).toBe(true);
  });

  it('formats meta dates with config.locale.dateFormat', () => {
    const fixture = buildInvoiceFixture({ invoice_date: '2026-07-02' });
    const data = toEngineData(fixture, omConfig());
    expect(data.meta.find((m) => m.label.en === 'Invoice Date:')!.value).toBe('02/07/2026');
  });

  it('emits unit and itemCode row keys', () => {
    const fixture = buildInvoiceFixture({
      invoice_line_items: [{ description: 'RAID recovery', quantity: 2, unit_price: 100, line_total: 200, unit_label: 'Piece', item_code: '998713' }],
    });
    const data = toEngineData(fixture, omConfig());
    expect(data.rows[0].unit).toBe('Piece');
    expect(data.rows[0].itemCode).toBe('998713');
  });

  it('renders stored notations as note lines', () => {
    const fixture = buildInvoiceFixture({ notations: [{ code: 'ZERO_RATED', text: 'Zero-rated supply (EXPORT_SERVICES).' }] });
    const data = toEngineData(fixture, omConfig());
    expect(JSON.stringify(data)).toContain('Zero-rated supply (EXPORT_SERVICES).');
  });

  it('emits the legal_entities seller tax number on identity (the band value), not company_settings', () => {
    const fixture = buildInvoiceFixture({ seller_tax_number: 'OM1100000000' });
    const data = toEngineData(fixture, omConfig());
    // taxBar.ts renders the band from data.identity.basic_info.vat_number — this
    // proves the printed band uses the stamped snapshot, matching the preview.
    expect(data.identity.basic_info?.vat_number).toBe('OM1100000000');
  });
});
```

(If `invoiceParity.test.ts` builds fixtures inline rather than exporting a helper, extract its fixture object into `invoiceParity.fixtures.ts` first and import from both — pure test refactor, zero behavior change.)

- [ ] **Step 2: Run it, verify it fails**

`npx vitest run src/lib/pdf/engine/adapters/invoiceAdapter.compliance.test.ts` → FAIL (single hardcoded `VAT ${taxRate}%:` row from recompute; no VATIN row; `dd MMM yyyy` dates; no unit/itemCode keys).

- [ ] **Step 3: Implementation** (each numbered edit maps to a failing assertion)

3a. **Money + dates** — replace the formatter block (`:74-79`) and dates (`:122`, `:125`):

```typescript
  const currencySymbol = invoiceData.accounting_locales?.currency_symbol || '';   // Country-Engine sourced (currencyToBlock); never fabricate 'USD'
  const decimalPlaces = config.locale?.decimalPlaces ?? invoiceData.accounting_locales?.decimal_places ?? 2;
  const currencyPosition = invoiceData.accounting_locales?.currency_position || 'after';
  const money = (amount: number): string =>
    formatEngineMoney(amount, {
      symbol: currencySymbol, decimalPlaces, position: currencyPosition,
      decimalSeparator: config.locale?.decimalSeparator ?? invoiceData.accounting_locales?.decimal_separator,
      thousandsSeparator: config.locale?.thousandsSeparator ?? invoiceData.accounting_locales?.thousands_separator,
    });
  const docDate = (d: string): string =>
    config.locale?.dateFormat ? fmtDateWithConfig(d, config.locale.dateFormat) : formatDate(d, 'dd MMM yyyy');
```
Use `docDate(...)` at `:122` and `:125` (import `fmtDateWithConfig` from `../../configDate`).

3b. **Buyer identity + address rows** — after the existing `toRows.push` block (`:107-116`):

```typescript
  const buyerTaxNumber = invoiceData.buyer_tax_number
    ?? invoiceData.customer?.tax_number ?? invoiceData.company?.tax_number ?? null;
  if (buyerTaxNumber) {
    const label = invoiceData.buyer_tax_number_label ?? config.taxBar?.label?.en ?? 'Tax No';
    toRows.push({ label: { en: `${label}:`, ar: `${label}:` }, value: buyerTaxNumber });
  }
  const snapshotAddr = invoiceData.buyer_address as Record<string, string | null> | null;
  const addressLines = formatPartyAddressLines(
    snapshotAddr
      ? { line1: snapshotAddr.line1, line2: snapshotAddr.line2, city: snapshotAddr.city as string | null,
          subdivision: snapshotAddr.subdivision as string | null, postal_code: snapshotAddr.postal_code,
          free_text: snapshotAddr.free_text }
      : { line1: invoiceData.customer?.address_line1, line2: invoiceData.customer?.address_line2,
          subdivision: invoiceData.customer?.subdivision_name,
          postal_code: invoiceData.customer?.postal_code, free_text: invoiceData.customer?.address },
    false, // GCC street-first; postal-first countries ride the Task 22 address_format wiring
  );
  for (const line of addressLines) {
    toRows.push({ label: { en: 'Address:', ar: 'العنوان:' }, value: line });
  }
```
(Emit the `Address:` label only on the first line — subsequent rows use `{ en: '', ar: '' }`.)

3b-seller. **Seller registration number (band value).** The engine `taxBar` section renders the band number from `data.identity.basic_info?.vat_number` (`engine/sections/taxBar.ts:25`) — i.e. `company_settings`, NOT the `legal_entities`-sourced snapshot. Override the identity the adapter emits so the printed band prints the stamped `seller_tax_number` and matches the Task 14 preview (preview/print-parity gate); feed the same value to the ZATCA QR so QR and band agree:

```typescript
  const sellerVatNumber = invoiceData.seller_tax_number ?? companySettings.basic_info?.vat_number ?? null;
  const identity = sellerVatNumber
    ? { ...companySettings, basic_info: { ...companySettings.basic_info, vat_number: sellerVatNumber } }
    : companySettings;
```
Return `identity` in place of the current `identity: companySettings` (`:329`), and replace the ZATCA `vatNumber` expression (`:303-304`) with `(config.taxBar.source === 'manual' ? config.taxBar.value : sellerVatNumber) || ''`.

3c. **Supply-date meta** — after the due-date push (`:124-126`):

```typescript
  if (invoiceData.supply_date && invoiceData.supply_date !== invoiceData.invoice_date) {
    meta.push({ label: { en: 'Supply Date:', ar: 'تاريخ التوريد:' }, value: docDate(invoiceData.supply_date) });
  }
```

3d. **Line rows** (`:133-140`) — add the two keys:

```typescript
    (item) => ({
      description: safeString(item.description),
      quantity: String(item.quantity),
      unit: safeString(item.unit_label ?? ''),
      itemCode: safeString(item.item_code ?? ''),
      unitPrice: money(item.unit_price),
      lineTotal: money(item.line_total || item.quantity * item.unit_price),
    }),
```
(Extend `InvoiceItemData` in `pdf/types.ts` with `unit_label?: string | null; item_code?: string | null;` and thread them through `toInvoiceItems` in dataFetcher — add `unit_label, item_code` to the `invoice_line_items`/`quote_items` selects feeding it.)

3e. **Totals from stored amounts + component rows** — replace `:142-186`:

```typescript
  // ── Totals: STORED header figures; tax rows from document_tax_lines rollups ──
  const subtotal = invoiceData.subtotal || 0;
  const discountAmount = invoiceData.discount_amount || 0;
  const discountedSubtotal = subtotal - discountAmount;
  const storedTax = invoiceData.tax_amount || 0;
  const totalAmount = invoiceData.total_amount || (discountedSubtotal + storedTax);
  const amountPaid = invoiceData.amount_paid || 0;
  const balanceDue = invoiceData.balance_due ?? (totalAmount - amountPaid);
  const rollups = (invoiceData.tax_lines ?? []).filter((l) => l.line_item_id === null);

  const lines = totalsLines(config);
  const on = (key: string): boolean => lines[key] !== false;
  const tLabels = config.totals?.labels ?? {};
  const tl = (key: TotalsLineKey, en: string, ar: string): { key: TotalsLineKey; label: LabelText } => ({
    key, label: { en: tLabels[key] ?? en, ar },
  });

  const totals: NonNullable<EngineDocData['totals']> = [];
  if (on('subtotal')) totals.push({ ...tl('subtotal', 'Subtotal:', 'المجموع الفرعي:'), value: money(subtotal) });
  if (on('discount') && discountAmount > 0) {
    totals.push({ ...tl('discount', 'Discount:', 'الخصم:'), value: `- ${money(discountAmount)}` });
    totals.push({ ...tl('netAmount', 'Net Amount:', 'صافي المبلغ:'), value: money(discountedSubtotal) });
  }
  if (on('vat')) {
    if (rollups.length > 0) {
      for (const r of rollups) {
        totals.push({ key: 'tax', label: { en: `${r.component_label}:`, ar: `${r.component_label}:` }, value: money(r.tax_amount) });
      }
    } else if (storedTax !== 0 || (invoiceData.tax_rate || 0) > 0) {
      const label = config.labels?.taxLabel?.en ?? 'VAT';
      const rate = invoiceData.tax_rate != null ? ` ${invoiceData.tax_rate}%` : '';
      totals.push({ ...tl('tax', `${label}${rate}:`, `${label}${rate}:`), value: money(storedTax) });
    }
  }
  if (on('total')) totals.push({ ...tl('total', 'Total:', 'الإجمالي:'), value: money(totalAmount), emphasis: true });
```
(Keep the existing amountPaid/balanceDue/amountInWords blocks (`:177-195`) unchanged, but source `balanceDue` from the stored column as above.)

3f. **taxSummary per component** — replace the single-row `rows`/`total` at `:211-212`:

```typescript
          rows: rollups.length > 0
            ? rollups.map((r) => ({ rate: `${r.rate}%`, taxable: money(r.taxable_base), tax: money(r.tax_amount) }))
            : [{ rate: `${taxRateDisplay}%`, taxable: money(discountedSubtotal), tax: money(storedTax) }],
          total: {
            label: { en: 'Total', ar: 'الإجمالي' },
            taxable: money(rollups.length > 0 ? rollups.reduce((s, r) => s + r.taxable_base, 0) : discountedSubtotal),
            tax: money(rollups.length > 0 ? rollups.reduce((s, r) => s + r.tax_amount, 0) : storedTax),
          },
```
where `const taxRateDisplay = invoiceData.tax_rate || 0;` and the summary gate becomes `tsCfg?.show && (rollups.length > 0 || taxRateDisplay > 0)`.

3g. **Notations** — append to the terms/notes assembly (the structured notes stack at `:226+`): for each `invoiceData.notations ?? []` entry push a note line `n.text` (and `n.textTranslated` in bilingual modes).

3h. **`lineItemColumns()`** (`templateConfig.ts:778-785`) — add the two hidden-by-default columns:

```typescript
    { key: 'itemCode', visible: false, label: { en: 'Code', ar: 'الرمز' }, width: 50 },
    { key: 'unit', visible: false, label: { en: 'Unit', ar: 'الوحدة' }, width: 45 },
```
(after `quantity`; profile `forcedColumns`/tenant Studio flip `visible` — the adapter's `COLUMN_ALIGN` map gains `itemCode: 'center', unit: 'center'`.)

- [ ] **Step 4: Run tests, verify pass**

`npx vitest run src/lib/pdf/engine/adapters/invoiceAdapter.compliance.test.ts` → PASS (7). `npx vitest run src/lib/pdf` → engine goldens still green (fixtures without tax_lines/facts hit the fallback path which prints the STORED header amounts — if a golden diff appears, it is the recompute-vs-stored delta and the golden must be re-baselined with a comment naming the stored figure as correct). `npm run check:tsc` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/adapters/invoiceAdapter.ts src/lib/pdf/templateConfig.ts src/lib/pdf/types.ts src/lib/pdf/dataFetcher.ts src/lib/pdf/engine/adapters/invoiceAdapter.compliance.test.ts
git commit -m "feat(pdf): invoice adapter renders component tax rows from stored document_tax_lines + buyer identity + locale dates/money"
```

---

### Task 13: quoteAdapter — the same compliance rendering

**Files:**
- Modify: `src/lib/pdf/engine/adapters/quoteAdapter.ts`
- Test: `src/lib/pdf/engine/adapters/quoteAdapter.compliance.test.ts` (new)

**Interfaces:**
- Consumes: extended `QuoteData` (Task 11); the exact patterns from Task 12.
- Produces: quote engine output with component rows, buyer identity, locale dates/money, unit/itemCode keys.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/adapters/quoteAdapter.compliance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toEngineData } from './quoteAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../../templateConfig';
import { countryTemplateOverride } from '../countryConfig';
import { gccTaxInvoiceProfile } from '../../../regimes/gcc_tax_invoice';
// buildQuoteFixture: the quote parity fixture helper (extract to quoteParity.fixtures.ts
// if quoteParity.test.ts builds it inline — pure test refactor, zero behavior change).
import { buildQuoteFixture } from '../quoteParity.fixtures';

const omFacts = {
  code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
  taxInvoiceRequired: true, languageCode: 'ar' as const, decimalPlaces: 3,
  dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
};

function omConfig() {
  return resolveTemplateConfigWithCountry(
    BUILT_IN_TEMPLATE_CONFIGS.quote,
    countryTemplateOverride(omFacts, { profile: gccTaxInvoiceProfile, sellerRegistered: true, docType: 'quote' }),
  );
}

describe('quoteAdapter compliance rendering', () => {
  it('renders one totals row per tax-line component from STORED amounts', () => {
    const fixture = buildQuoteFixture({
      subtotal: 1440, tax_amount: 72, total_amount: 1512,
      tax_lines: [{
        line_item_id: null, component_code: 'VAT', component_label: 'VAT 5%',
        rate: 5, taxable_base: 1440, tax_amount: 72, tax_treatment: 'standard',
        treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
      }],
    });
    const data = toEngineData(fixture, omConfig());
    const taxRows = data.totals!.filter((t) => t.key === 'tax');
    expect(taxRows).toHaveLength(1);
    expect(taxRows[0].label.en).toBe('VAT 5%:');
    expect(taxRows[0].value).toContain('72');
    expect(data.totals!.find((t) => t.key === 'total')!.value).toContain('1,512');
  });

  it('falls back to ONE row from stored header tax when tax_lines is empty (M-I)', () => {
    const fixture = buildQuoteFixture({ subtotal: 100, tax_rate: 5, tax_amount: 4.75, total_amount: 104.75, tax_lines: [] });
    const data = toEngineData(fixture, omConfig());
    expect(data.totals!.find((t) => t.key === 'tax')!.value).toContain('4.750');
  });

  it('resolves the profile QUOTATION title (bilingual)', () => {
    const data = toEngineData(buildQuoteFixture({}), omConfig());
    expect(data.title).toEqual({ en: 'QUOTATION', ar: 'عرض سعر' });
  });

  it('renders buyer tax number with the country label', () => {
    const fixture = buildQuoteFixture({ buyer_tax_number: 'OM99887766', buyer_tax_number_label: 'VATIN' });
    const data = toEngineData(fixture, omConfig());
    expect(data.to.rows.map((r) => r.label.en)).toContain('VATIN:');
  });

  it('formats meta dates with config.locale.dateFormat', () => {
    const data = toEngineData(buildQuoteFixture({ quote_date: '2026-07-02' }), omConfig());
    expect(data.meta.some((m) => m.value === '02/07/2026')).toBe(true);
  });

  it('emits unit and itemCode row keys', () => {
    const fixture = buildQuoteFixture({
      quote_items: [{ description: 'RAID recovery', quantity: 2, unit_price: 100, line_total: 200, unit_label: 'Piece', item_code: '998713' }],
    });
    const data = toEngineData(fixture, omConfig());
    expect(data.rows[0].unit).toBe('Piece');
    expect(data.rows[0].itemCode).toBe('998713');
  });

  it('emits the legal_entities seller tax number on identity (band value)', () => {
    const data = toEngineData(buildQuoteFixture({ seller_tax_number: 'OM1100000000' }), omConfig());
    expect(data.identity.basic_info?.vat_number).toBe('OM1100000000');
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/lib/pdf/engine/adapters/quoteAdapter.compliance.test.ts` → FAIL (single recompute tax row; no VATIN row; `dd MMM yyyy` dates; no unit/itemCode/identity-override).

- [ ] **Step 3: Implementation** — `quoteAdapter.ts` mirrors `invoiceAdapter.ts` (same `:38-46` normalizeSaudi-era layout). Locate each block with `grep -n "taxRate\|formatDate\|toRows\|taxSummary\|identity" src/lib/pdf/engine/adapters/quoteAdapter.ts` and apply the following concrete edits (identical shape to Task 12 but with `QuoteData` fields — `quote_number`, `quote_date`, `valid_until`, `quote_items`):

3a. **Money + dates** — replace the money formatter and date calls:

```typescript
  const currencySymbol = quoteData.accounting_locales?.currency_symbol || '';
  const decimalPlaces = config.locale?.decimalPlaces ?? quoteData.accounting_locales?.decimal_places ?? 2;
  const currencyPosition = quoteData.accounting_locales?.currency_position || 'after';
  const money = (amount: number): string =>
    formatEngineMoney(amount, {
      symbol: currencySymbol, decimalPlaces, position: currencyPosition,
      decimalSeparator: config.locale?.decimalSeparator ?? quoteData.accounting_locales?.decimal_separator,
      thousandsSeparator: config.locale?.thousandsSeparator ?? quoteData.accounting_locales?.thousands_separator,
    });
  const docDate = (d: string): string =>
    config.locale?.dateFormat ? fmtDateWithConfig(d, config.locale.dateFormat) : formatDate(d, 'dd MMM yyyy');
```
Use `docDate(...)` at the `quote_date`/`valid_until` meta rows (import `fmtDateWithConfig` from `../../configDate`).

3b. **Buyer identity + address rows** — after the existing `toRows.push` party block:

```typescript
  const buyerTaxNumber = quoteData.buyer_tax_number
    ?? quoteData.customer?.tax_number ?? quoteData.company?.tax_number ?? null;
  if (buyerTaxNumber) {
    const label = quoteData.buyer_tax_number_label ?? config.taxBar?.label?.en ?? 'Tax No';
    toRows.push({ label: { en: `${label}:`, ar: `${label}:` }, value: buyerTaxNumber });
  }
  const snapshotAddr = quoteData.buyer_address as Record<string, string | null> | null;
  const addressLines = formatPartyAddressLines(
    snapshotAddr
      ? { line1: snapshotAddr.line1, line2: snapshotAddr.line2, city: snapshotAddr.city as string | null,
          subdivision: snapshotAddr.subdivision as string | null, postal_code: snapshotAddr.postal_code,
          free_text: snapshotAddr.free_text }
      : { line1: quoteData.customer?.address_line1, line2: quoteData.customer?.address_line2,
          subdivision: quoteData.customer?.subdivision_name,
          postal_code: quoteData.customer?.postal_code, free_text: quoteData.customer?.address },
    config.locale?.postalFirst ?? false,   // Task 22 wires this; false = GCC street-first
  );
  for (const line of addressLines) {
    toRows.push({ label: { en: 'Address:', ar: 'العنوان:' }, value: line });
  }
```
(Emit the `Address:` label only on the first line — subsequent rows use `{ en: '', ar: '' }`.)

3b-seller. **Seller registration number (band value)** — override the emitted identity so the band prints the stamped `seller_tax_number` (matches the preview + feeds the ZATCA QR), exactly as Task 12 3b-seller:

```typescript
  const sellerVatNumber = quoteData.seller_tax_number ?? companySettings.basic_info?.vat_number ?? null;
  const identity = sellerVatNumber
    ? { ...companySettings, basic_info: { ...companySettings.basic_info, vat_number: sellerVatNumber } }
    : companySettings;
```
Return `identity` in place of `identity: companySettings`.

3d. **Line rows** — add the two keys to the `quote_items` map:

```typescript
    (item) => ({
      description: safeString(item.description),
      quantity: String(item.quantity),
      unit: safeString(item.unit_label ?? ''),
      itemCode: safeString(item.item_code ?? ''),
      unitPrice: money(item.unit_price),
      lineTotal: money(item.line_total || item.quantity * item.unit_price),
    }),
```
(Extend `QuoteItemData` in `pdf/types.ts` with `unit_label?: string | null; item_code?: string | null;` and thread them through the `quote_items` select feeding it — the sibling of Task 12 3d.)

3e. **Totals from stored amounts + component rows** — replace the recompute block; quotes have NO amountPaid/balanceDue block:

```typescript
  const subtotal = quoteData.subtotal || 0;
  const discountAmount = quoteData.discount_amount || 0;
  const discountedSubtotal = subtotal - discountAmount;
  const storedTax = quoteData.tax_amount || 0;
  const totalAmount = quoteData.total_amount || (discountedSubtotal + storedTax);
  const rollups = (quoteData.tax_lines ?? []).filter((l) => l.line_item_id === null);

  const lines = totalsLines(config);
  const on = (key: string): boolean => lines[key] !== false;
  const tLabels = config.totals?.labels ?? {};
  const tl = (key: TotalsLineKey, en: string, ar: string): { key: TotalsLineKey; label: LabelText } => ({
    key, label: { en: tLabels[key] ?? en, ar },
  });

  const totals: NonNullable<EngineDocData['totals']> = [];
  if (on('subtotal')) totals.push({ ...tl('subtotal', 'Subtotal:', 'المجموع الفرعي:'), value: money(subtotal) });
  if (on('discount') && discountAmount > 0) {
    totals.push({ ...tl('discount', 'Discount:', 'الخصم:'), value: `- ${money(discountAmount)}` });
    totals.push({ ...tl('netAmount', 'Net Amount:', 'صافي المبلغ:'), value: money(discountedSubtotal) });
  }
  if (on('vat')) {
    if (rollups.length > 0) {
      for (const r of rollups) {
        totals.push({ key: 'tax', label: { en: `${r.component_label}:`, ar: `${r.component_label}:` }, value: money(r.tax_amount) });
      }
    } else if (storedTax !== 0 || (quoteData.tax_rate || 0) > 0) {
      const label = config.labels?.taxLabel?.en ?? 'VAT';   // replaces the hardcoded 'VAT' literal
      const rate = quoteData.tax_rate != null ? ` ${quoteData.tax_rate}%` : '';
      totals.push({ ...tl('tax', `${label}${rate}:`, `${label}${rate}:`), value: money(storedTax) });
    }
  }
  if (on('total')) totals.push({ ...tl('total', 'Total:', 'الإجمالي:'), value: money(totalAmount), emphasis: true });
```

3f. **taxSummary per component** — replace the single-row summary:

```typescript
          rows: rollups.length > 0
            ? rollups.map((r) => ({ rate: `${r.rate}%`, taxable: money(r.taxable_base), tax: money(r.tax_amount) }))
            : [{ rate: `${quoteData.tax_rate || 0}%`, taxable: money(discountedSubtotal), tax: money(storedTax) }],
          total: {
            label: { en: 'Total', ar: 'الإجمالي' },
            taxable: money(rollups.length > 0 ? rollups.reduce((s, r) => s + r.taxable_base, 0) : discountedSubtotal),
            tax: money(rollups.length > 0 ? rollups.reduce((s, r) => s + r.tax_amount, 0) : storedTax),
          },
```
with the summary gate `tsCfg?.show && (rollups.length > 0 || (quoteData.tax_rate || 0) > 0)`.

3g. **Notations** — for each `quoteData.notations ?? []` entry, push a note line `n.text` (and `n.textTranslated` in bilingual modes) onto the terms/notes stack — the sibling of Task 12 3g.

The `lineItemColumns()` `itemCode`/`unit` columns land once in Task 12 3h (shared by both adapters).

- [ ] **Step 4: Run tests, verify pass** — compliance test PASS; `npx vitest run src/lib/pdf` green; `npm run check:tsc` 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/adapters/quoteAdapter.ts src/lib/pdf/engine/adapters/quoteAdapter.compliance.test.ts
git commit -m "feat(pdf): quote adapter component rows + buyer identity + locale consumption"
```

---

### Task 14: React previews read the same resolved profile + tax lines

**Files:**
- Create: `src/hooks/useDocumentCompliance.ts`
- Modify: `src/components/documents/InvoiceDocument.tsx` — title (`:196`), seller band (`:157`), tax totals row (the discounted-VAT math block near `:116`)
- Modify: `src/components/documents/QuoteDocument.tsx` — seller band (`:142`), title, tax totals row
- Test: `src/hooks/useDocumentCompliance.test.tsx`

**Interfaces:**
- Consumes: `resolveComplianceRenderInputs` (Task 5), `fetchDocumentTaxLines` (Task 11), `countryTemplateOverride` (Task 6), TanStack Query, `queryKeys` (`src/lib/queryKeys.ts`).
- Produces:

```typescript
// src/hooks/useDocumentCompliance.ts
export interface DocumentComplianceView {
  title: { en: string; ar?: string };
  taxBandLabel: string | null;          // 'VATIN' — null hides the band
  sellerTaxNumber: string | null;
  taxRows: Array<{ label: string; amount: number }>;   // one per rollup component
  dateFormat: string | null;
  loading: boolean;
}
export function useDocumentCompliance(
  docType: 'quote' | 'invoice' | 'credit_note',
  documentId: string | null,             // null = unsaved draft (no tax lines yet)
  fallback: { taxRate: number | null; taxAmount: number },
): DocumentComplianceView;
```

- [ ] **Step 1: Write the failing test**

`src/hooks/useDocumentCompliance.test.tsx` (jsdom project — `.tsx`):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../lib/pdf/engine/profileResolver', () => ({
  resolveComplianceRenderInputs: vi.fn(async () => ({
    facts: {
      code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
      taxInvoiceRequired: true, languageCode: 'ar', decimalPlaces: 3,
      dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
    },
    profile: (await vi.importActual<typeof import('../lib/regimes/gcc_tax_invoice')>('../lib/regimes/gcc_tax_invoice')).gccTaxInvoiceProfile,
    sellerRegistered: true, sellerTaxNumber: 'OM1100000000',
  })),
  clearComplianceRenderCache: vi.fn(),
}));
vi.mock('../lib/pdf/dataFetcher', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchDocumentTaxLines: vi.fn(async () => [{
    line_item_id: null, component_code: 'VAT', component_label: 'VAT 5%', rate: 5,
    taxable_base: 1440, tax_amount: 72, tax_treatment: 'standard',
    treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
  }]),
}));

import { useDocumentCompliance } from './useDocumentCompliance';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useDocumentCompliance', () => {
  it('exposes the profile title, band label and one tax row per component', async () => {
    const { result } = renderHook(
      () => useDocumentCompliance('invoice', 'inv-1', { taxRate: 5, taxAmount: 72 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.title.en).toBe('TAX INVOICE');
    expect(result.current.taxBandLabel).toBe('VATIN');
    expect(result.current.sellerTaxNumber).toBe('OM1100000000');
    expect(result.current.taxRows).toEqual([{ label: 'VAT 5%', amount: 72 }]);
  });

  it('falls back to the stored header scalar for drafts/legacy docs', async () => {
    const { fetchDocumentTaxLines } = await import('../lib/pdf/dataFetcher');
    vi.mocked(fetchDocumentTaxLines).mockResolvedValueOnce([]);
    const { result } = renderHook(
      () => useDocumentCompliance('invoice', 'inv-legacy', { taxRate: 5, taxAmount: 4.75 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.taxRows).toEqual([{ label: 'VAT 5%', amount: 4.75 }]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/hooks/useDocumentCompliance.test.tsx` → module not found.

- [ ] **Step 3: Implementation**

```typescript
import { useQuery } from '@tanstack/react-query';
import { resolveComplianceRenderInputs } from '../lib/pdf/engine/profileResolver';
import { fetchDocumentTaxLines } from '../lib/pdf/dataFetcher';

export interface DocumentComplianceView {
  title: { en: string; ar?: string };
  taxBandLabel: string | null;
  sellerTaxNumber: string | null;
  taxRows: Array<{ label: string; amount: number }>;
  dateFormat: string | null;
  loading: boolean;
}

export function useDocumentCompliance(
  docType: 'quote' | 'invoice' | 'credit_note',
  documentId: string | null,
  fallback: { taxRate: number | null; taxAmount: number },
): DocumentComplianceView {
  const inputsQuery = useQuery({
    queryKey: ['documentCompliance', 'inputs'],
    queryFn: resolveComplianceRenderInputs,
    staleTime: 5 * 60 * 1000,
  });
  const linesQuery = useQuery({
    queryKey: ['documentCompliance', 'taxLines', docType, documentId],
    queryFn: () => fetchDocumentTaxLines(docType, documentId as string),
    enabled: documentId != null,
  });

  const inputs = inputsQuery.data;
  const facts = inputs?.facts ?? null;
  const profile = inputs?.profile;
  const title =
    facts && profile
      ? (() => {
          const t = profile.documentTitle({
            docType, sellerRegistered: inputs!.sellerRegistered,
            taxInvoiceRequired: facts.taxInvoiceRequired,
          });
          return { en: t.title, ...(t.titleTranslated ? { ar: t.titleTranslated } : {}) };
        })()
      : { en: docType === 'quote' ? 'QUOTATION' : docType === 'credit_note' ? 'CREDIT NOTE' : 'INVOICE' };

  const rollups = (linesQuery.data ?? []).filter((l) => l.line_item_id === null);
  const taxRows =
    rollups.length > 0
      ? rollups.map((r) => ({ label: r.component_label, amount: r.tax_amount }))
      : fallback.taxAmount !== 0 || (fallback.taxRate ?? 0) > 0
        ? [{ label: `${facts?.taxLabel ?? 'Tax'}${fallback.taxRate != null ? ` ${fallback.taxRate}%` : ''}`, amount: fallback.taxAmount }]
        : [];

  const registered = inputs?.sellerRegistered === true;
  const bandOn = !!facts && facts.taxInvoiceRequired && facts.taxSystem === 'VAT' &&
    (profile ? profile.showRegistrationBand && registered : true);

  return {
    title,
    taxBandLabel: bandOn ? (facts?.taxNumberLabel ?? facts?.taxLabel ?? null) : null,
    sellerTaxNumber: inputs?.sellerTaxNumber ?? null,
    taxRows,
    dateFormat: facts?.dateFormat ?? null,
    loading: inputsQuery.isLoading || (documentId != null && linesQuery.isLoading),
  };
}
```
(Register the two query-key shapes in `src/lib/queryKeys.ts` following its existing pattern.)

Then consume it in the previews:
- `InvoiceDocument.tsx:196` — replace the `t('taxInvoice', 'TAX INVOICE')` branch with `compliance.title.en` (keep the proforma ternary; render `compliance.title.ar` beside it in the bilingual header block).
- `InvoiceDocument.tsx:157` — replace `` `VAT No: ${companySettings.basic_info.vat_number}` `` with `compliance.taxBandLabel ? `${compliance.taxBandLabel}: ${compliance.sellerTaxNumber ?? companySettings?.basic_info?.vat_number ?? ''}` : null`.
- The VAT totals row (discount-then-VAT math near `:116`) — map `compliance.taxRows` to one row each, amounts formatted with the page's existing money formatter; delete the local `* taxRate / 100` recompute.
- `QuoteDocument.tsx:142` band + its title/tax row sites — the same three substitutions with `docType 'quote'`.

- [ ] **Step 4: Run tests, verify pass** — hook test PASS; `npx vitest run src/components/documents` green (update any preview snapshot tests: en output for a null-facts tenant must be byte-identical — the hook's fallback branch guarantees it); `npm run check:tsc` 0.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDocumentCompliance.ts src/hooks/useDocumentCompliance.test.tsx src/components/documents/InvoiceDocument.tsx src/components/documents/QuoteDocument.tsx src/lib/queryKeys.ts
git commit -m "feat(previews): React previews render profile titles, bands and component tax rows from the same resolved compliance inputs"
```

---

### Task 15: `RequirementFailuresPanel` + `TaxTraceDrawer` + `dryRunIssueTaxDocument`

**Files:**
- Create: `src/lib/taxDocumentService.ts`
- Create: `src/components/financial/RequirementFailuresPanel.tsx`
- Create: `src/components/financial/TaxTraceDrawer.tsx`
- Test: `src/lib/taxDocumentService.test.ts`, `src/components/financial/RequirementFailuresPanel.test.tsx`

**Interfaces:**
- Consumes: RPC `issue_tax_document` (Phase 1; Phase 2 dry-run shape from Task 18); `RuleTrace` type (Phase 1); `DocumentTaxLineRow` (Task 11); UI primitives from `src/components/ui/` (Dialog/Drawer base per the modal-remediation program); lucide-react icons; semantic tokens (`danger`/`warning` families).
- Produces: `dryRunIssueTaxDocument(docType, docId): Promise<DryRunResult>`; `<RequirementFailuresPanel failures={RequirementFailure[]} />`; `<TaxTraceDrawer trace={unknown} backfilled={boolean} open onClose />` (consumed by Task 19 and detail pages).

- [ ] **Step 1: Write the failing tests**

`src/lib/taxDocumentService.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

const rpcMock = vi.fn(async () => ({
  data: {
    ok: false, document_number: null, tax_lines: [], totals: {},
    requirement_failures: [{ field_key: 'buyer_tax_number', level: 'block', message: 'Buyer VATIN is required for B2B tax invoices.' }],
    trace: null,
  },
  error: null,
}));
vi.mock('./supabaseClient', () => ({ supabase: { rpc: rpcMock } }));

import { dryRunIssueTaxDocument } from './taxDocumentService';

describe('dryRunIssueTaxDocument', () => {
  it('calls issue_tax_document with p_dry_run=true and normalizes the failures', async () => {
    const result = await dryRunIssueTaxDocument('invoice', 'inv-1');
    expect(rpcMock).toHaveBeenCalledWith('issue_tax_document', {
      p_doc_type: 'invoice', p_doc_id: 'inv-1', p_dry_run: true,
    });
    expect(result.requirement_failures[0]).toMatchObject({ field_key: 'buyer_tax_number', level: 'block' });
  });
});
```

`src/components/financial/RequirementFailuresPanel.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { RequirementFailuresPanel } from './RequirementFailuresPanel';

describe('RequirementFailuresPanel', () => {
  it('renders block failures as errors and warn failures as warnings', () => {
    render(<RequirementFailuresPanel failures={[
      { field_key: 'buyer_tax_number', level: 'block', message: 'Buyer VATIN is required for B2B tax invoices.' },
      { field_key: 'buyer_address', level: 'warn', message: 'Buyer address is expected on B2B tax invoices.' },
    ]} />);
    expect(screen.getByText('Buyer VATIN is required for B2B tax invoices.')).toBeInTheDocument();
    expect(screen.getByText('Buyer address is expected on B2B tax invoices.')).toBeInTheDocument();
    expect(screen.getByTestId('requirement-block-count').textContent).toContain('1');
  });
  it('renders nothing for an empty list', () => {
    const { container } = render(<RequirementFailuresPanel failures={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — both suites: modules not found.

- [ ] **Step 3: Implementation**

`src/lib/taxDocumentService.ts`:

```typescript
import { supabase } from './supabaseClient';

export interface RequirementFailure {
  field_key: string;
  level: 'block' | 'warn';
  message: string;
}
export interface DryRunResult {
  ok: boolean;
  tax_lines: unknown[];
  totals: Record<string, unknown>;
  requirement_failures: RequirementFailure[];
  trace: unknown;
}

/** Dry-run the issuance choke point: returns the computed component lines,
 *  totals, explain trace and requirement failures WITHOUT minting a number or
 *  writing anything. Powers pre-issue validation UI and the explain drawer. */
export async function dryRunIssueTaxDocument(
  docType: 'quote' | 'invoice' | 'credit_note',
  docId: string,
): Promise<DryRunResult> {
  const { data, error } = await supabase.rpc('issue_tax_document', {
    p_doc_type: docType, p_doc_id: docId, p_dry_run: true,
  });
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ok: d.ok === true,
    tax_lines: (d.tax_lines as unknown[]) ?? [],
    totals: (d.totals as Record<string, unknown>) ?? {},
    requirement_failures: ((d.requirement_failures as RequirementFailure[]) ?? []),
    trace: d.trace ?? null,
  };
}
```

`src/components/financial/RequirementFailuresPanel.tsx`:

```tsx
import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { RequirementFailure } from '../../lib/taxDocumentService';

export function RequirementFailuresPanel({ failures }: { failures: RequirementFailure[] }) {
  if (failures.length === 0) return null;
  const blocks = failures.filter((f) => f.level === 'block');
  const warns = failures.filter((f) => f.level === 'warn');
  return (
    <div className="space-y-2">
      {blocks.length > 0 && (
        <div className="rounded-md border border-danger/40 bg-danger-muted p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-danger" data-testid="requirement-block-count">
            <ShieldAlert className="h-4 w-4" /> {blocks.length} issue{blocks.length === 1 ? '' : 's'} blocking issuance
          </div>
          <ul className="mt-1 list-disc pl-6 text-sm text-danger">
            {blocks.map((f) => <li key={f.field_key}>{f.message}</li>)}
          </ul>
        </div>
      )}
      {warns.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning-muted p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" /> Review before issuing
          </div>
          <ul className="mt-1 list-disc pl-6 text-sm text-warning">
            {warns.map((f) => <li key={f.field_key}>{f.message}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
```

`src/components/financial/TaxTraceDrawer.tsx` — a right-side drawer (reuse the repo's Dialog/Drawer base from `src/components/ui/`) titled "How was this computed?". Body: when `backfilled` render a `bg-warning-muted text-warning` badge "Reconstructed history — backfilled from the stored header figure, not engine-computed"; then map trace steps (`(trace as { steps?: Array<Record<string, unknown>> })?.steps ?? []`) to rows: `op` name bold, remaining keys as a `key: value` mono line each (`rate_match` → "Matched rate row {rateRowId} — {componentCode} {rate}% (valid from {validFrom})", any other op → JSON of its fields). Empty/null trace → muted "No trace recorded for this document." Export `export function TaxTraceDrawer({ trace, backfilled, open, onClose }: { trace: unknown; backfilled: boolean; open: boolean; onClose: () => void })`.

- [ ] **Step 4: Run tests, verify pass** — both suites PASS; `npm run check:tsc` 0; `npm run lint` 0 (tokens: only `danger`/`warning` semantic families used).

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxDocumentService.ts src/lib/taxDocumentService.test.ts src/components/financial/RequirementFailuresPanel.tsx src/components/financial/RequirementFailuresPanel.test.tsx src/components/financial/TaxTraceDrawer.tsx
git commit -m "feat(financial): dry-run issuance wrapper + requirement-failures panel + explain-trace drawer"
```

---

### Task 16: Preview/print parity test (exit-gate test)

**Files:**
- Create: `src/components/documents/previewPrintParity.test.tsx`

**Interfaces:**
- Consumes: `toEngineData` (invoiceAdapter, Task 12), `useDocumentCompliance` mocks (Task 14 shapes), the OM facts/profile fixtures from Tasks 12/14.
- Produces: the CI-enforced guarantee that screen preview and printed PDF derive title, band label, and component tax rows from the same inputs and agree.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock the compliance inputs EXACTLY as useDocumentCompliance.test.tsx does:
// same OM facts, real gcc profile, one VAT 5% rollup of 72 on base 1440, and the
// legal_entities seller number OM1100000000.
vi.mock('../../lib/pdf/engine/profileResolver', () => ({
  resolveComplianceRenderInputs: vi.fn(async () => ({
    facts: {
      code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
      taxInvoiceRequired: true, languageCode: 'ar', decimalPlaces: 3,
      dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
    },
    profile: (await vi.importActual<typeof import('../../lib/regimes/gcc_tax_invoice')>('../../lib/regimes/gcc_tax_invoice')).gccTaxInvoiceProfile,
    sellerRegistered: true, sellerTaxNumber: 'OM1100000000',
  })),
  clearComplianceRenderCache: vi.fn(),
}));
vi.mock('../../lib/pdf/dataFetcher', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchDocumentTaxLines: vi.fn(async () => [{
    line_item_id: null, component_code: 'VAT', component_label: 'VAT 5%', rate: 5,
    taxable_base: 1440, tax_amount: 72, tax_treatment: 'standard',
    treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
  }]),
}));

import { toEngineData } from '../../lib/pdf/engine/adapters/invoiceAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../../lib/pdf/templateConfig';
import { countryTemplateOverride } from '../../lib/pdf/engine/countryConfig';
import { gccTaxInvoiceProfile } from '../../lib/regimes/gcc_tax_invoice';
import { buildInvoiceFixture } from '../../lib/pdf/engine/invoiceParity.fixtures';
import { InvoiceDocument } from './InvoiceDocument';

const omFacts = {
  code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
  taxInvoiceRequired: true, languageCode: 'ar' as const, decimalPlaces: 3,
  dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
};
function omConfig() {
  return resolveTemplateConfigWithCountry(
    BUILT_IN_TEMPLATE_CONFIGS.invoice,
    countryTemplateOverride(omFacts, { profile: gccTaxInvoiceProfile, sellerRegistered: true, docType: 'invoice' }),
  );
}
const fixture = buildInvoiceFixture({
  subtotal: 1440, tax_amount: 72, total_amount: 1512,
  tax_lines: [{
    line_item_id: null, component_code: 'VAT', component_label: 'VAT 5%', rate: 5,
    taxable_base: 1440, tax_amount: 72, tax_treatment: 'standard',
    treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
  }],
  seller_tax_number: 'OM1100000000', buyer_tax_number: 'OM99887766', buyer_tax_number_label: 'VATIN',
});

// Maps the pdf fixture onto InvoiceDocumentProps (InvoiceDocument.tsx:59):
// { invoice, companySettings, currencyFormat, t, elementId? }. The loose invoice/
// companySettings props are cast — the compliance-critical values (title/band/rows)
// come from the mocked hook, so the mapping only needs to render the shell.
function previewPropsFor(f: typeof fixture) {
  type Props = React.ComponentProps<typeof InvoiceDocument>;
  return {
    invoice: (f as { invoiceData?: unknown }).invoiceData ?? f,
    companySettings: (f as { companySettings?: unknown }).companySettings ?? null,
    currencyFormat: { currencySymbol: 'ر.ع.', decimalPlaces: 3 },
    t: (_k: string, fallback: string) => fallback,
  } as unknown as Props;
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('preview/print parity (Phase 2 exit gate)', () => {
  it('preview and engine adapter agree on title, band label+number and component rows', async () => {
    const engine = toEngineData(fixture, omConfig());
    render(<InvoiceDocument {...previewPropsFor(fixture)} />, { wrapper });

    // Title parity
    expect(await screen.findByText(engine.title.en)).toBeInTheDocument();
    // Band parity — label AND the legal_entities-sourced seller number (finding: not just the label)
    expect(screen.getByText(/VATIN/)).toBeInTheDocument();
    expect(engine.identity.basic_info?.vat_number).toBe('OM1100000000');
    expect(screen.getByText(/OM1100000000/)).toBeInTheDocument();
    // Component-row parity — every engine tax totals row appears in the preview
    for (const row of engine.totals!.filter((t) => t.key === 'tax')) {
      const label = row.label.en.replace(':', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — fails while Task 14's preview edits are incomplete or if any label diverges. If Tasks 12+14 are done this passes immediately — in that case verify it FAILS when sabotaged: temporarily change the preview band label to a literal and watch the test fail, then revert (mutation check — this test is the exit gate, it must actually bite).

- [ ] **Step 3–4: Make it pass + full suite** — `npx vitest run src/components/documents/previewPrintParity.test.tsx` → PASS; `npm run test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/components/documents/previewPrintParity.test.tsx
git commit -m "test(compliance): preview/print parity exit gate — title, band, component rows"
```

**WP-4 verification:** `npm run check:tsc` (0), `npm run test` (green incl. the parity test), manual smoke on the Oman tenant: invoice detail shows component rows identical to the generated PDF.

---
### WP-5 — Requirements gate in-RPC + issuance snapshots (1 PR, migration)

**PR:** `feat/localization-p2-requirement-gate` (migration PR template).

---

### Task 17: `evaluate_document_requirements` SQL function

**Files:**
- Migration: `phase2_requirement_gate_and_snapshots` — part 1 (this function); part 2 is Task 18 (apply as ONE migration containing both parts)
- Modify: `supabase/migrations.manifest.md` (one row for the combined migration, added in Task 18)

**Interfaces:**
- Consumes: `master_document_requirements` (Task 2).
- Produces: `evaluate_document_requirements(p_doc_type text, p_country_id uuid, p_as_of date, p_facts jsonb) RETURNS jsonb` — a jsonb array `[{"field_key","level","message"}]`.

- [ ] **Step 1: SQL probe — absent state**

```sql
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'evaluate_document_requirements';
-- expect 0
```

- [ ] **Step 2: The function SQL (part 1 of the migration — hold until Task 18 Step 3 applies both parts together)**

```sql
CREATE OR REPLACE FUNCTION public.evaluate_document_requirements(
  p_doc_type text,
  p_country_id uuid,
  p_as_of date,
  p_facts jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_req record;
  v_clause jsonb;
  v_fact_val jsonb;
  v_passes boolean;
  v_missing boolean;
  v_line jsonb;
  v_line_field text;
  v_failures jsonb := '[]'::jsonb;
BEGIN
  FOR v_req IN
    SELECT field_key, condition, level, message_i18n
    FROM master_document_requirements
    WHERE country_id = p_country_id
      AND doc_type = p_doc_type
      AND effective_from <= p_as_of
      AND deleted_at IS NULL
    ORDER BY sort_order, field_key
  LOOP
    -- 1) Condition (NULL = unconditional). Closed vocabulary:
    --    {"all":[{"fact":<key>,"op":"eq"|"neq"|"in"|"gte"|"present","value":...}]}
    v_passes := true;
    IF v_req.condition IS NOT NULL THEN
      FOR v_clause IN SELECT * FROM jsonb_array_elements(v_req.condition -> 'all') LOOP
        v_fact_val := p_facts -> (v_clause ->> 'fact');
        v_passes := CASE v_clause ->> 'op'
          WHEN 'present' THEN v_fact_val IS NOT NULL
                              AND v_fact_val <> 'null'::jsonb
                              AND btrim(COALESCE(v_fact_val #>> '{}', '')) <> ''
          WHEN 'eq'      THEN v_fact_val = (v_clause -> 'value')
          WHEN 'neq'     THEN v_fact_val IS DISTINCT FROM (v_clause -> 'value')
          WHEN 'in'      THEN COALESCE((v_clause -> 'value') @> v_fact_val, false)
          WHEN 'gte'     THEN COALESCE((v_fact_val #>> '{}')::numeric
                                       >= ((v_clause ->> 'value'))::numeric, false)
          ELSE false      -- unknown op: fail-safe (condition never matches)
        END;
        EXIT WHEN NOT v_passes;
      END LOOP;
    END IF;
    CONTINUE WHEN NOT v_passes;

    -- 2) Field presence. 'line.<col>' checks every element of p_facts->'lines'.
    IF v_req.field_key LIKE 'line.%' THEN
      v_line_field := substring(v_req.field_key from 6);
      v_missing := false;
      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_facts -> 'lines', '[]'::jsonb)) LOOP
        IF btrim(COALESCE(v_line ->> v_line_field, '')) = '' THEN
          v_missing := true;
          EXIT;
        END IF;
      END LOOP;
    ELSE
      v_fact_val := p_facts -> v_req.field_key;
      v_missing := v_fact_val IS NULL
        OR v_fact_val = 'null'::jsonb
        OR (jsonb_typeof(v_fact_val) = 'string' AND btrim(v_fact_val #>> '{}') = '')
        OR (jsonb_typeof(v_fact_val) = 'object' AND v_fact_val = '{}'::jsonb);
    END IF;

    IF v_missing THEN
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'field_key', v_req.field_key,
        'level',     v_req.level,
        'message',   COALESCE(v_req.message_i18n ->> 'en', v_req.field_key || ' is required')
      ));
    END IF;
  END LOOP;

  RETURN v_failures;
END;
$fn$;

REVOKE ALL ON FUNCTION public.evaluate_document_requirements(text, uuid, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_document_requirements(text, uuid, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.evaluate_document_requirements(text, uuid, date, jsonb)
  TO authenticated, service_role;
```

- [ ] **Step 3: SQL behavioral probes (run after Task 18 applies the migration)**

```sql
-- B2B invoice missing buyer_tax_number in OM → one block + one warn failure
SELECT public.evaluate_document_requirements(
  'invoice',
  (SELECT id FROM geo_countries WHERE code = 'OM'),
  CURRENT_DATE,
  '{"buyer_is_business": true, "seller_tax_number": "OM1100000000",
    "buyer_tax_number": "", "buyer_address": {}, "lines": []}'::jsonb
);
-- expect: [{"field_key":"buyer_tax_number","level":"block",...},
--          {"field_key":"buyer_address","level":"warn",...}]

-- B2C invoice (buyer_is_business=false) → conditions don't match → only unconditional rules
SELECT public.evaluate_document_requirements(
  'invoice', (SELECT id FROM geo_countries WHERE code = 'OM'), CURRENT_DATE,
  '{"buyer_is_business": false, "seller_tax_number": "OM1100000000"}'::jsonb
);
-- expect: []

-- Missing seller number → unconditional block fires regardless of buyer type
SELECT public.evaluate_document_requirements(
  'invoice', (SELECT id FROM geo_countries WHERE code = 'OM'), CURRENT_DATE,
  '{"buyer_is_business": false, "seller_tax_number": null}'::jsonb
);
-- expect: [{"field_key":"seller_tax_number","level":"block",...}]
```

- [ ] **Step 4/5:** committed together with Task 18 (one migration, one commit).

---

### Task 18: `issue_tax_document` v2 — requirement gate + snapshot stamping

**Files:**
- Migration: `phase2_requirement_gate_and_snapshots` (Task 17 part 1 + this part 2, applied as one migration)
- Modify: `src/types/database.types.ts` (regenerated), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: Phase 1 `issue_tax_document` body AND Phase 1 `issue_credit_note` body (fetch both live definitions first — they are the sources you edit); `evaluate_document_requirements` (Task 17); snapshot columns on `invoices`/`quotes`/`credit_notes` (Phase 1); structured address columns (Task 3); `tenants.country_pack_version` (Phase 1 M-J).
- Produces: dry-run return gains `requirement_failures`; block failures abort real issuance with `ERRCODE 'P0403'`; issuance stamps `buyer_tax_number`, `buyer_tax_number_label`, `buyer_address` (subdivision name resolved), `seller_tax_number`, `supply_date`, `reverse_charge` and `notations` (statutory notes frozen from the component-row treatments) onto the document row before the immutability flip. (`invoice`/`quote` flow through this RPC; `credit_note` issuance is grafted the identical gate + snapshot stamping in `issue_credit_note` — Edit D.)

- [ ] **Step 1: SQL probe — current (Phase 1) behavior**

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='issue_tax_document';
```
Save the full body to the scratchpad — it is the base text you edit. Confirm it contains the Phase 1 stub marker `-- Phase 2: requirement gate` and does NOT reference `master_document_requirements` (grep the def). Also probe the wrong behavior: a dry-run on a draft OM B2B invoice with no buyer tax number returns NO `requirement_failures` key.

- [ ] **Step 2: Compose the migration**

The migration SQL = Task 17's function + a `CREATE OR REPLACE FUNCTION public.issue_tax_document(...)` carrying the fetched Phase 1 body with Edits A–C2, + a `CREATE OR REPLACE FUNCTION public.issue_credit_note(...)` carrying its fetched Phase 1 body with Edit D. The `issue_tax_document` edits (`invoice`/`quote` path):

**Edit A — declarations.** Add to the function's DECLARE section:

```sql
  v_country_id uuid;
  v_pack_version int;
  v_facts jsonb;
  v_req_failures jsonb := '[]'::jsonb;
  v_has_block boolean := false;
  v_buyer_tax_number text;
  v_buyer_tax_number_label text;
  v_buyer_address jsonb;
  v_seller_tax_number text;
  v_lines_facts jsonb;
  v_reverse_charge boolean := false;
  v_notations jsonb := '[]'::jsonb;
```

**Edit B — the requirement gate.** Replace the `-- Phase 2: requirement gate` stub (after the FOR UPDATE lock, before number minting; `v_doc` is the locked document row and `v_tax_point_date` the tenant-local tax point, both already declared by Phase 1):

```sql
  -- ── Phase 2: requirement gate + snapshot facts (graft 11) ─────────────────
  SELECT t.country_id, t.country_pack_version
    INTO v_country_id, v_pack_version
  FROM tenants t WHERE t.id = v_doc.tenant_id;

  -- Buyer identity: company overrides customer when the document bills a company.
  -- The buyer_address snapshot stores BOTH the subdivision uuid (machine key) AND
  -- the RESOLVED subdivision NAME under 'subdivision' — the adapters/previews render
  -- from the name (Task 12 3b reads snapshotAddr.subdivision), and freezing the name
  -- keeps an issued document correct even if geo_subdivisions is later renamed.
  SELECT c.tax_number,
         jsonb_strip_nulls(jsonb_build_object(
           'line1', c.address_line1, 'line2', c.address_line2,
           'subdivision_id', c.subdivision_id, 'subdivision', sub.name,
           'postal_code', c.postal_code, 'free_text', c.address))
    INTO v_buyer_tax_number, v_buyer_address
  FROM customers_enhanced c
  LEFT JOIN geo_subdivisions sub ON sub.id = c.subdivision_id AND sub.deleted_at IS NULL
  WHERE c.id = v_doc.customer_id AND c.deleted_at IS NULL;

  IF v_doc.company_id IS NOT NULL THEN
    SELECT COALESCE(co.tax_number, v_buyer_tax_number),
           COALESCE(jsonb_strip_nulls(jsonb_build_object(
             'line1', co.address_line1, 'line2', co.address_line2,
             'subdivision_id', co.subdivision_id, 'subdivision', sub.name,
             'postal_code', co.postal_code, 'free_text', co.address)), v_buyer_address)
      INTO v_buyer_tax_number, v_buyer_address
    FROM companies co
    LEFT JOIN geo_subdivisions sub ON sub.id = co.subdivision_id AND sub.deleted_at IS NULL
    WHERE co.id = v_doc.company_id AND co.deleted_at IS NULL;
  END IF;

  SELECT le.tax_identifier INTO v_seller_tax_number
  FROM legal_entities le
  WHERE le.tenant_id = v_doc.tenant_id AND le.is_primary AND le.deleted_at IS NULL
  LIMIT 1;

  SELECT g.tax_number_label INTO v_buyer_tax_number_label
  FROM geo_countries g WHERE g.id = v_country_id;

  -- Line facts for 'line.*' field checks (source table varies by p_doc_type —
  -- reuse the same CASE branches Phase 1 uses to load line items).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_code', li.item_code, 'unit_code', li.unit_code,
           'tax_treatment', li.tax_treatment)), '[]'::jsonb)
    INTO v_lines_facts
  FROM invoice_line_items li
  WHERE p_doc_type = 'invoice' AND li.invoice_id = p_doc_id AND li.deleted_at IS NULL;
  -- (Repeat with quote_items / credit_note_items guarded by p_doc_type, OR-ing
  --  into v_lines_facts exactly as Phase 1's item-loading CASE does.)

  -- Requirements apply ONLY after pack activation (M-I).
  IF v_pack_version IS NOT NULL AND v_country_id IS NOT NULL THEN
    v_facts := jsonb_strip_nulls(jsonb_build_object(
      'buyer_is_business', (v_doc.company_id IS NOT NULL),
      'buyer_tax_number', v_buyer_tax_number,
      'seller_registered', (v_seller_tax_number IS NOT NULL),
      'seller_tax_number', v_seller_tax_number,
      'place_of_supply', v_doc.place_of_supply_subdivision_id,
      'place_of_supply_subdivision_id', v_doc.place_of_supply_subdivision_id,
      'supply_date', COALESCE(v_doc.supply_date, v_tax_point_date),
      'document_total', v_doc.total_amount,
      'lines', v_lines_facts
    )) || jsonb_build_object('buyer_address', COALESCE(v_buyer_address, '{}'::jsonb));

    v_req_failures := evaluate_document_requirements(p_doc_type, v_country_id, v_tax_point_date, v_facts);
    SELECT COALESCE(bool_or(f ->> 'level' = 'block'), false)
      INTO v_has_block
    FROM jsonb_array_elements(v_req_failures) f;

    IF NOT p_dry_run AND v_has_block THEN
      RAISE EXCEPTION 'REQUIREMENTS_NOT_MET: %', v_req_failures::text
        USING ERRCODE = 'P0403',
              HINT = 'master_document_requirements gate — resolve the blocking fields and reissue';
    END IF;
  END IF;
```

**Edit B2 — derive statutory notations + reverse_charge (graft 12).** After the requirement gate, before number minting: `document_tax_lines` already exist for the document (Phase 1 validates `Σ(lines) = header`, so they are present at issuance). Derive `reverse_charge` from their treatments and freeze the statutory notations so an issued row is self-describing and no raw-REST client can skip them. The notation strings mirror `gccTaxInvoiceProfile.notations()` (contract §1.4) — the profile stays the human-facing source; this is the issuance-authority freeze of the same output (a future Phase 3 Studio moves the text into pack data):

```sql
  SELECT COALESCE(bool_or(dtl.tax_treatment = 'reverse_charge'), false)
    INTO v_reverse_charge
  FROM document_tax_lines dtl
  WHERE dtl.document_type = p_doc_type AND dtl.document_id = p_doc_id
    AND dtl.deleted_at IS NULL;

  WITH treatments AS (
    SELECT DISTINCT dtl.tax_treatment, dtl.treatment_reason_code
    FROM document_tax_lines dtl
    WHERE dtl.document_type = p_doc_type AND dtl.document_id = p_doc_id
      AND dtl.deleted_at IS NULL
  ),
  notes AS (
    -- Reverse-charge note (mirrors the profile's reverse_charge branch).
    SELECT 1 AS ord, jsonb_build_object(
      'code', 'REVERSE_CHARGE',
      'text', 'VAT to be accounted for by the recipient under the reverse-charge mechanism.',
      'textTranslated', 'يتم احتساب ضريبة القيمة المضافة من قبل المستلم وفقاً لآلية الاحتساب العكسي.') AS note
    WHERE EXISTS (SELECT 1 FROM treatments WHERE tax_treatment = 'reverse_charge')
    UNION ALL
    -- Single zero-rated note carrying the reason code (LIMIT 1 mirrors the
    -- profile's `break` after the first zero_rated rollup).
    SELECT 2, jsonb_build_object(
      'code', 'ZERO_RATED',
      'text', 'Zero-rated supply (' || COALESCE(z.treatment_reason_code, 'unspecified') || ').',
      'textTranslated', 'توريد خاضع لنسبة الصفر (' || COALESCE(z.treatment_reason_code, 'unspecified') || ').')
    FROM (SELECT treatment_reason_code FROM treatments WHERE tax_treatment = 'zero_rated' LIMIT 1) z
  )
  SELECT COALESCE(jsonb_agg(note ORDER BY ord), '[]'::jsonb) INTO v_notations FROM notes;
```

**Edit C1 — dry-run return.** In the Phase 1 dry-run return `jsonb_build_object(...)`, add the key:

```sql
      'requirement_failures', v_req_failures,
```

**Edit C2 — snapshot stamping.** In the non-dry-run path, immediately BEFORE the issued/immutability flip, add (shown for `invoice`; wrap in the same `p_doc_type` CASE used for the doc-table update Phase 1 already performs, adding the identical SET list for `quotes`). Credit notes are stamped by `issue_credit_note` (Edit D), not here — this RPC's `credit_note` branch is only exercised by the dry-run/explain surface (Task 15), which never mutates:

```sql
    UPDATE invoices SET
      buyer_tax_number       = v_buyer_tax_number,
      buyer_tax_number_label = v_buyer_tax_number_label,
      buyer_address          = v_buyer_address,
      seller_tax_number      = v_seller_tax_number,
      supply_date            = COALESCE(supply_date, v_tax_point_date),
      reverse_charge         = v_reverse_charge,
      notations              = v_notations
    WHERE id = p_doc_id AND p_doc_type = 'invoice';
```

**Edit D — graft the SAME gate + snapshots into `issue_credit_note`.** Credit notes are NOT issued through `issue_tax_document`; the canonical credit-note issuance RPC is `issue_credit_note(p_cn jsonb, p_items jsonb)` (contract §2.7; called by `creditNoteService.issueCreditNote`, `src/lib/creditNoteService.ts:38`). To make the credit-note requirement seed rows (Task 2, row 4) actually enforceable and stamp the same snapshots, fetch the live `issue_credit_note` body (`pg_get_functiondef`, same as Step 1) and add — after the CN row + line items are inserted with their `document_tax_lines`, immediately before the function returns — the following. Because `issue_credit_note` has no dry-run parameter, a `block` failure RAISEs synchronously (the modal catches `P0403`, Task 19):

```sql
  -- Reuse the standalone evaluator (Task 17) — one gate implementation for all doc types.
  DECLARE
    v_cn_country_id uuid;
    v_cn_pack_version int;
    v_cn_buyer_tax text; v_cn_buyer_label text; v_cn_buyer_addr jsonb;
    v_cn_seller_tax text; v_cn_facts jsonb; v_cn_failures jsonb; v_cn_has_block boolean;
    v_cn_reverse boolean := false; v_cn_notations jsonb := '[]'::jsonb;
  BEGIN
    SELECT t.country_id, t.country_pack_version INTO v_cn_country_id, v_cn_pack_version
    FROM tenants t WHERE t.id = v_credit_note.tenant_id;

    SELECT c.tax_number,
           jsonb_strip_nulls(jsonb_build_object('line1', c.address_line1, 'line2', c.address_line2,
             'subdivision_id', c.subdivision_id, 'subdivision', sub.name,
             'postal_code', c.postal_code, 'free_text', c.address))
      INTO v_cn_buyer_tax, v_cn_buyer_addr
    FROM customers_enhanced c
    LEFT JOIN geo_subdivisions sub ON sub.id = c.subdivision_id AND sub.deleted_at IS NULL
    WHERE c.id = v_credit_note.customer_id AND c.deleted_at IS NULL;

    IF v_credit_note.company_id IS NOT NULL THEN
      SELECT COALESCE(co.tax_number, v_cn_buyer_tax),
             COALESCE(jsonb_strip_nulls(jsonb_build_object('line1', co.address_line1, 'line2', co.address_line2,
               'subdivision_id', co.subdivision_id, 'subdivision', sub.name,
               'postal_code', co.postal_code, 'free_text', co.address)), v_cn_buyer_addr)
        INTO v_cn_buyer_tax, v_cn_buyer_addr
      FROM companies co
      LEFT JOIN geo_subdivisions sub ON sub.id = co.subdivision_id AND sub.deleted_at IS NULL
      WHERE co.id = v_credit_note.company_id AND co.deleted_at IS NULL;
    END IF;

    SELECT le.tax_identifier INTO v_cn_seller_tax
    FROM legal_entities le
    WHERE le.tenant_id = v_credit_note.tenant_id AND le.is_primary AND le.deleted_at IS NULL LIMIT 1;
    SELECT g.tax_number_label INTO v_cn_buyer_label FROM geo_countries g WHERE g.id = v_cn_country_id;

    -- A credit note mirrors its source invoice: copy the frozen reverse_charge +
    -- notations from the source (a CN's own document_tax_lines are contra copies).
    IF v_credit_note.invoice_id IS NOT NULL THEN
      SELECT COALESCE(i.reverse_charge, false), COALESCE(i.notations, '[]'::jsonb)
        INTO v_cn_reverse, v_cn_notations
      FROM invoices i WHERE i.id = v_credit_note.invoice_id;
    END IF;

    IF v_cn_pack_version IS NOT NULL AND v_cn_country_id IS NOT NULL THEN
      v_cn_facts := jsonb_strip_nulls(jsonb_build_object(
        'buyer_is_business', (v_credit_note.company_id IS NOT NULL),
        'buyer_tax_number', v_cn_buyer_tax,
        'seller_registered', (v_cn_seller_tax IS NOT NULL),
        'seller_tax_number', v_cn_seller_tax,
        'document_total', v_credit_note.total_amount
      )) || jsonb_build_object('buyer_address', COALESCE(v_cn_buyer_addr, '{}'::jsonb));

      v_cn_failures := evaluate_document_requirements('credit_note', v_cn_country_id, CURRENT_DATE, v_cn_facts);
      SELECT COALESCE(bool_or(f ->> 'level' = 'block'), false) INTO v_cn_has_block
      FROM jsonb_array_elements(v_cn_failures) f;
      IF v_cn_has_block THEN
        RAISE EXCEPTION 'REQUIREMENTS_NOT_MET: %', v_cn_failures::text
          USING ERRCODE = 'P0403',
                HINT = 'master_document_requirements gate (credit_note) — resolve the blocking fields and reissue';
      END IF;
    END IF;

    UPDATE credit_notes SET
      buyer_tax_number = v_cn_buyer_tax, buyer_tax_number_label = v_cn_buyer_label,
      buyer_address = v_cn_buyer_addr, seller_tax_number = v_cn_seller_tax,
      reverse_charge = v_cn_reverse, notations = v_cn_notations
    WHERE id = v_credit_note.id;
  END;
```
(`v_credit_note` is the inserted credit-note row already in scope in the Phase 1 body — match its actual variable name when you fetch the definition; if the body uses a different local, alias accordingly.)

- [ ] **Step 3: Apply the migration** — `mcp__supabase__apply_migration`, name `phase2_requirement_gate_and_snapshots`, body = Task 17 function + edited `issue_tax_document` + edited `issue_credit_note`.

- [ ] **Step 4: SQL behavioral probes**

Run Task 17 Step 3's evaluator probes, then the end-to-end probes:

```sql
-- (a) Dry-run a real draft OM B2B invoice missing the buyer tax number:
SELECT public.issue_tax_document('invoice', '<draft-b2b-invoice-uuid>', true);
-- expect: "requirement_failures" contains buyer_tax_number/block; ok=false; no number minted.

-- (b) Real issuance of the same draft must RAISE:
SELECT public.issue_tax_document('invoice', '<draft-b2b-invoice-uuid>', false);
-- expect: ERROR REQUIREMENTS_NOT_MET (SQLSTATE P0403).

-- (c) Fill customers_enhanced.tax_number for the buyer, reissue:
SELECT public.issue_tax_document('invoice', '<draft-b2b-invoice-uuid>', false);
-- expect: ok=true, document_number minted, THEN:
SELECT buyer_tax_number, buyer_tax_number_label, seller_tax_number, supply_date, buyer_address,
       reverse_charge, notations
FROM invoices WHERE id = '<draft-b2b-invoice-uuid>';
-- expect: buyer_tax_number/label/seller/supply_date stamped (label = 'VATIN' for OM);
--         buyer_address->>'subdivision' is the governorate NAME (not a uuid).

-- (e) Notation freeze: issue a draft whose document_tax_lines carry a reverse_charge
--     rollup (and, separately, a zero_rated rollup with treatment_reason_code
--     'EXPORT_SERVICES'), then:
SELECT reverse_charge, notations FROM invoices WHERE id = '<reverse-charge-invoice-uuid>';
-- expect: reverse_charge = true; notations @> '[{"code":"REVERSE_CHARGE"}]'.
SELECT notations FROM invoices WHERE id = '<zero-rated-invoice-uuid>';
-- expect: notations @> '[{"code":"ZERO_RATED"}]' and the text contains 'EXPORT_SERVICES'.
-- (Task 12's 3g "renders stored notations" test then proves the render side.)

-- (d) M-I activation gate: NULL the tenant pin in a transaction and dry-run —
BEGIN;
UPDATE tenants SET country_pack_version = NULL WHERE id = '<tenant-uuid>';
SELECT public.issue_tax_document('invoice', '<another-draft-uuid>', true);
-- expect: "requirement_failures": []  (requirements skipped pre-activation)
ROLLBACK;

-- (f) Credit-note gate (Edit D): attempt issue_credit_note for a B2B credit note on
--     a pack-pinned OM tenant whose buyer/seller tax numbers are missing:
SELECT public.issue_credit_note('<cn-jsonb-missing-seller>'::jsonb, '<items-jsonb>'::jsonb);
-- expect: ERROR REQUIREMENTS_NOT_MET (SQLSTATE P0403). Fill the seller tax_identifier
--         on the primary legal entity, retry → succeeds and stamps credit_notes
--         .buyer_tax_number/.seller_tax_number/.reverse_charge/.notations.
```

- [ ] **Step 5: Regen types + manifest + commit**

Regen `database.types.ts`; `npm run check:tsc` → 0 (the RPC return is jsonb — no TS surface change beyond types file). Manifest row:

```markdown
| <version> | phase2_requirement_gate_and_snapshots.sql | Additive | evaluate_document_requirements + issue_tax_document v2 + issue_credit_note gate (in-RPC requirement gate, dry-run failures, buyer/seller/supply/reverse_charge/notations snapshots) | #TBD-PR |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): issue_tax_document v2 + issue_credit_note gate — unskippable requirement gate + issuance snapshots (P2/M4)"
```

---

### Task 19: Issuance UI — pre-issue dry-run wiring

**Files:**
- Modify: `src/lib/taxDocumentService.ts` (Task 15) — add two PURE, unit-testable helpers (`classifyRequirementFailures`, `parseRequirementFailures`)
- Modify: `src/pages/financial/InvoiceDetailPage.tsx:130-140` (the `issueInvoice(id)` handler at `:136`)
- Modify: `src/pages/cases/CaseDetail.tsx:200-215` (the `invoiceService.issueInvoice(invoice.id)` handler at `:207`)
- Modify: `src/components/financial/CreditNoteModal.tsx` — catch the `issue_credit_note` `P0403` rejection and render `RequirementFailuresPanel` (credit notes have no draft→issue two-step, so the gate fires synchronously inside `issue_credit_note` — Task 18 Edit D — and the modal surfaces it on submit)
- Test: `src/lib/taxDocumentService.test.ts` (extend — the helper unit tests are the Step 1 failing test)

**Interfaces:**
- Consumes: `dryRunIssueTaxDocument`, `RequirementFailure`, `RequirementFailuresPanel` (Task 15); the repo's dialog/confirm primitives (`no-window-confirm` eslint rule — use the existing `ConfirmDialog`-style component from `src/components/ui/`).
- Produces: `classifyRequirementFailures(failures): { kind: 'block' | 'confirm' | 'proceed'; messages: string[] }` and `parseRequirementFailures(errorMessage: string): RequirementFailure[]` (both pure, in `taxDocumentService.ts`); block failures render the panel and abort; warn failures require explicit confirmation; the RPC's `P0403` error path (invoice AND credit note) is caught and re-rendered (defense in depth — the DB gate is authoritative).

- [ ] **Step 1: Write the failing test** — extend `src/lib/taxDocumentService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyRequirementFailures, parseRequirementFailures } from './taxDocumentService';

describe('classifyRequirementFailures', () => {
  it('returns block when any failure is a block', () => {
    expect(classifyRequirementFailures([
      { field_key: 'buyer_tax_number', level: 'block', message: 'Buyer VATIN required.' },
      { field_key: 'buyer_address', level: 'warn', message: 'Buyer address expected.' },
    ])).toEqual({ kind: 'block', messages: ['Buyer VATIN required.'] });
  });
  it('returns confirm with the warn messages when only warns exist', () => {
    expect(classifyRequirementFailures([
      { field_key: 'buyer_address', level: 'warn', message: 'Buyer address expected.' },
    ])).toEqual({ kind: 'confirm', messages: ['Buyer address expected.'] });
  });
  it('returns proceed for a clean dry-run', () => {
    expect(classifyRequirementFailures([])).toEqual({ kind: 'proceed', messages: [] });
  });
});

describe('parseRequirementFailures', () => {
  it('extracts the jsonb payload from a P0403 REQUIREMENTS_NOT_MET message', () => {
    const msg = 'REQUIREMENTS_NOT_MET: [{"field_key":"seller_tax_number","level":"block","message":"Seller VATIN required."}]';
    expect(parseRequirementFailures(msg)).toEqual([
      { field_key: 'seller_tax_number', level: 'block', message: 'Seller VATIN required.' },
    ]);
  });
  it('returns [] when the message carries no parseable payload', () => {
    expect(parseRequirementFailures('some unrelated error')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/lib/taxDocumentService.test.ts` → FAIL (`classifyRequirementFailures`/`parseRequirementFailures` are not exported).

- [ ] **Step 3: Implement the helpers, then wire the handlers.** Add to `src/lib/taxDocumentService.ts`:

```typescript
export function classifyRequirementFailures(
  failures: RequirementFailure[],
): { kind: 'block' | 'confirm' | 'proceed'; messages: string[] } {
  const blocks = failures.filter((f) => f.level === 'block');
  if (blocks.length > 0) return { kind: 'block', messages: blocks.map((f) => f.message) };
  const warns = failures.filter((f) => f.level === 'warn');
  if (warns.length > 0) return { kind: 'confirm', messages: warns.map((f) => f.message) };
  return { kind: 'proceed', messages: [] };
}

/** Recover the requirement-failure payload from a raised P0403 error so the UI
 *  can render the panel even when the gate fires inside the DB (no dry-run). */
export function parseRequirementFailures(errorMessage: string): RequirementFailure[] {
  const marker = 'REQUIREMENTS_NOT_MET:';
  const idx = errorMessage.indexOf(marker);
  if (idx === -1) return [];
  const jsonStart = errorMessage.indexOf('[', idx);
  if (jsonStart === -1) return [];
  try {
    const parsed = JSON.parse(errorMessage.slice(jsonStart)) as unknown;
    return Array.isArray(parsed) ? (parsed as RequirementFailure[]) : [];
  } catch {
    return [];
  }
}
```

Then the InvoiceDetailPage handler (repeat verbatim in `CaseDetail.tsx`):

```typescript
const [requirementFailures, setRequirementFailures] = useState<RequirementFailure[]>([]);

const handleIssue = async () => {
  const dry = await dryRunIssueTaxDocument('invoice', id!);
  setRequirementFailures(dry.requirement_failures);
  const decision = classifyRequirementFailures(dry.requirement_failures);
  if (decision.kind === 'block') {
    toast.error('Issuance blocked — resolve the required fields first.');
    return;
  }
  if (decision.kind === 'confirm') {
    const confirmed = await confirmDialog({
      title: 'Review before issuing',
      description: decision.messages.join('\n'),
      confirmLabel: 'Issue anyway',
    });
    if (!confirmed) return;
  }
  try {
    await issueInvoice(id!);   // existing call — the DB gate re-checks atomically
    // existing post-issue refetch/toast logic unchanged
  } catch (err) {
    const failures = parseRequirementFailures(err instanceof Error ? err.message : String(err));
    if (failures.length > 0) { setRequirementFailures(failures); return; }
    throw err;
  }
};
```
Render `<RequirementFailuresPanel failures={requirementFailures} />` above the issue action. Use the page's existing confirm-dialog helper (grep the file for the pattern the repo's `no-window-confirm` rule enforces and reuse it). In `CreditNoteModal.tsx`, there is no dry-run pre-step — wrap the existing `issueCreditNote(...)` submit call in the same `try/catch` and, on a `P0403`/`REQUIREMENTS_NOT_MET` rejection, `parseRequirementFailures` the message into local state and render `<RequirementFailuresPanel />` inside the modal (block failures keep the modal open; the DB gate is authoritative).

- [ ] **Step 4: Typecheck + tests** — `npx vitest run src/lib/taxDocumentService.test.ts` → PASS; `npm run check:tsc` → 0; `npm run test` → green.

- [ ] **Step 5: Manual smoke (record in the PR):** OM draft B2B invoice, buyer without VATIN → Issue shows the danger panel, no status change; fill VATIN → warn-only path asks confirmation → issues; verify `chain_of_custody` gained the financial event (History tab) — the v1.2.0 invariant. Then a B2B credit note with a missing seller VATIN → the modal keeps open and shows the requirement panel (Edit D gate).

- [ ] **Step 6: Commit**

```bash
git add src/lib/taxDocumentService.ts src/lib/taxDocumentService.test.ts src/pages/financial/InvoiceDetailPage.tsx src/pages/cases/CaseDetail.tsx src/components/financial/CreditNoteModal.tsx
git commit -m "feat(financial): pre-issue dry-run + P0403 recovery — block failures stop issuance, warns require confirmation, credit notes surface the gate"
```

**WP-5 verification:** all Task 17/18 SQL probes green; `npm run check:tsc` 0; PostgREST bypass check — issue a blocked invoice via raw RPC call with the anon/authenticated key: must fail with `P0403` (the gate is in the DB, not the UI).

---

### WP-6 — Structured address capture + rendering (1 PR)

**PR:** `feat/localization-p2-structured-addresses`. TypeScript only (schema landed in WP-1).

---

### Task 20: `geoSubdivisionService` + `AddressFields` component

**Files:**
- Create: `src/lib/geoSubdivisionService.ts`
- Create: `src/components/ui/AddressFields.tsx`
- Test: `src/lib/geoSubdivisionService.test.ts`, `src/components/ui/AddressFields.test.tsx`

**Interfaces:**
- Consumes: `geo_subdivisions` rows (Task 3 seed); `useLocaleConfig()` (`TenantConfigContext.tsx:140` — provides `postalCodeLabel`).
- Produces:

```typescript
// src/lib/geoSubdivisionService.ts
export interface Subdivision { id: string; code: string; name: string; subdivision_type: string | null; }
export async function listSubdivisions(countryId: string): Promise<Subdivision[]>;

// src/components/ui/AddressFields.tsx
export interface AddressValue {
  address_line1: string; address_line2: string;
  subdivision_id: string | null; postal_code: string;
}
export function AddressFields(props: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  countryId: string | null;          // null → subdivision select hidden
  disabled?: boolean;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

`src/lib/geoSubdivisionService.test.ts` — mock supabase (same chainable pattern as Task 5) returning two OM rows; assert `listSubdivisions('om-uuid')` filters `is_active`, orders by `sort_order`, and maps `{id, code, name, subdivision_type}`.

`src/components/ui/AddressFields.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
vi.mock('../../lib/geoSubdivisionService', () => ({
  listSubdivisions: vi.fn(async (countryId: string) =>
    countryId === 'om-uuid'
      ? [{ id: 's1', code: 'MA', name: 'Muscat', subdivision_type: 'governorate' }]
      : []),
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useLocaleConfig: () => ({ postalCodeLabel: 'Postal Code' }),
}));
import { AddressFields } from './AddressFields';

const value = { address_line1: '', address_line2: '', subdivision_id: null, postal_code: '' };

describe('AddressFields', () => {
  it('renders line1/line2/postal inputs and the subdivision select when the country has rows', async () => {
    const onChange = vi.fn();
    render(<AddressFields value={value} onChange={onChange} countryId="om-uuid" />);
    expect(screen.getByLabelText('Address line 1')).toBeInTheDocument();
    expect(await screen.findByLabelText('State / Region')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: 'Bldg 12' } });
    expect(onChange).toHaveBeenCalledWith({ ...value, address_line1: 'Bldg 12' });
  });
  it('hides the subdivision select when the country has no subdivisions', async () => {
    render(<AddressFields value={value} onChange={vi.fn()} countryId="ae-uuid" />);
    expect(screen.getByLabelText('Address line 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('State / Region')).not.toBeInTheDocument();
  });
  it('labels the postal field from tenant locale config', () => {
    render(<AddressFields value={value} onChange={vi.fn()} countryId={null} />);
    expect(screen.getByLabelText('Postal Code')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — both suites: modules not found.

- [ ] **Step 3: Implementation**

`src/lib/geoSubdivisionService.ts`:

```typescript
import { supabase } from './supabaseClient';

export interface Subdivision {
  id: string;
  code: string;
  name: string;
  subdivision_type: string | null;
}

export async function listSubdivisions(countryId: string): Promise<Subdivision[]> {
  const { data, error } = await supabase
    .from('geo_subdivisions')
    .select('id, code, name, subdivision_type')
    .eq('country_id', countryId)
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}
```

`src/components/ui/AddressFields.tsx` — follow the repo's existing labelled-input pattern (grep `CustomerFormModal.tsx:425-435` for the input classes in use):

```tsx
import React, { useEffect, useState } from 'react';
import { listSubdivisions, type Subdivision } from '../../lib/geoSubdivisionService';
import { useLocaleConfig } from '../../contexts/TenantConfigContext';

export interface AddressValue {
  address_line1: string;
  address_line2: string;
  subdivision_id: string | null;
  postal_code: string;
}

export function AddressFields({ value, onChange, countryId, disabled }: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  countryId: string | null;
  disabled?: boolean;
}) {
  const locale = useLocaleConfig();
  const [subdivisions, setSubdivisions] = useState<Subdivision[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!countryId) { setSubdivisions([]); return; }
    listSubdivisions(countryId)
      .then((rows) => { if (!cancelled) setSubdivisions(rows); })
      .catch(() => { if (!cancelled) setSubdivisions([]); });
    return () => { cancelled = true; };
  }, [countryId]);

  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });
  const inputCls = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-ring';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="addr-line1" className="mb-1 block text-sm font-medium">Address line 1</label>
        <input id="addr-line1" className={inputCls} disabled={disabled}
          value={value.address_line1} onChange={(e) => set({ address_line1: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="addr-line2" className="mb-1 block text-sm font-medium">Address line 2</label>
        <input id="addr-line2" className={inputCls} disabled={disabled}
          value={value.address_line2} onChange={(e) => set({ address_line2: e.target.value })} />
      </div>
      {subdivisions.length > 0 && (
        <div>
          <label htmlFor="addr-subdivision" className="mb-1 block text-sm font-medium">State / Region</label>
          <select id="addr-subdivision" className={inputCls} disabled={disabled}
            value={value.subdivision_id ?? ''}
            onChange={(e) => set({ subdivision_id: e.target.value || null })}>
            <option value="">—</option>
            {subdivisions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="addr-postal" className="mb-1 block text-sm font-medium">{locale.postalCodeLabel}</label>
        <input id="addr-postal" className={inputCls} disabled={disabled}
          value={value.postal_code} onChange={(e) => set({ postal_code: e.target.value })} />
      </div>
    </div>
  );
}
```
(Wrap the visible labels with the repo's `t()` i18n helper per `no-untranslated-jsx-text` — key them under the `ui` namespace: `t('ui.addressLine1', 'Address line 1')` etc.)

- [ ] **Step 4: Run tests, verify pass** — both suites PASS; `npm run check:tsc` 0; `npm run lint` 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geoSubdivisionService.ts src/lib/geoSubdivisionService.test.ts src/components/ui/AddressFields.tsx src/components/ui/AddressFields.test.tsx
git commit -m "feat(ui): AddressFields structured capture + geoSubdivisionService"
```

---

### Task 21: Party forms persist structured addresses

**Files:**
- Modify: `src/components/customers/CustomerFormModal.tsx` — state (`:112`, `:260`), save payload (`:223`), the free-text address input (`:431-433`)
- Modify: `src/pages/companies/CompaniesListPage.tsx` — state (`:93`, `:268`), payloads (`:222`, `:246`), both address textareas (`:745`, `:863`)
- Modify: `src/components/suppliers/SupplierFormModal.tsx` — state (`:57`), hydrate (`:85`), payload (`:152` — `composeSupplierAddress` supplemented, not removed)
- Test: extend `src/components/customers/CustomerFormModal.test.tsx`

**Interfaces:**
- Consumes: `AddressFields` + `AddressValue` (Task 20); Task 3 columns.
- Produces: all three party create/edit surfaces write `address_line1/address_line2/subdivision_id/postal_code` alongside the untouched legacy `address` blob.

- [ ] **Step 1: Write the failing test** — extend `CustomerFormModal.test.tsx`: render the modal, fill Address line 1 = 'Bldg 12', postal = '133', submit, and assert the mocked insert/update payload contains `{ address_line1: 'Bldg 12', postal_code: '133', address_line2: null, subdivision_id: null }` (follow the file's existing submit-payload assertion pattern).

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/components/customers/CustomerFormModal.test.tsx` — fields don't exist.

- [ ] **Step 3: Implementation pattern (CustomerFormModal, shown once):**

```typescript
// formData additions (both init sites :112 and :260):
address_line1: '', address_line2: '', subdivision_id: null as string | null, postal_code: '',
// hydrate-on-edit (where `address: customer.address || null` is read back):
address_line1: customer.address_line1 || '', address_line2: customer.address_line2 || '',
subdivision_id: customer.subdivision_id || null, postal_code: customer.postal_code || '',
// save payload (:223 area):
address_line1: formData.address_line1 || null,
address_line2: formData.address_line2 || null,
subdivision_id: formData.subdivision_id,
postal_code: formData.postal_code || null,
```
Replace the single free-text input at `:431-433` with `<AddressFields value={...} onChange={...} countryId={formData.country_id ?? null} />` and demote the legacy `address` textarea to a collapsed "Additional address notes" field (kept writable — M-I rows keep their blob).

Complete enumeration of the remaining two surfaces (identical pattern):

| File | State init | Hydrate | Payload | Input site |
|---|---|---|---|---|
| `src/pages/companies/CompaniesListPage.tsx` | `:93`, `:268` | `:222` (edit-modal open) | `:246` (create) + the update payload beside `:222` | textareas `:745` (create) and `:863` (edit) → `AddressFields` |
| `src/components/suppliers/SupplierFormModal.tsx` | `:57` | `:85` | insert/update payload at `:152` — keep `composeSupplierAddress(formData)` writing the blob AND add the four structured fields | the address textarea the `:143-144` comment describes → `AddressFields` |

- [ ] **Step 4: Run tests, verify pass** — modal suites PASS; `npm run check:tsc` 0; manual smoke: edit the Oman demo customer, pick Muscat governorate, save, re-open — fields persist.

- [ ] **Step 5: Commit**

```bash
git add src/components/customers/CustomerFormModal.tsx src/pages/companies/CompaniesListPage.tsx src/components/suppliers/SupplierFormModal.tsx src/components/customers/CustomerFormModal.test.tsx
git commit -m "feat(parties): structured address capture on customer/company/supplier forms"
```

---

### Task 22: Country-ordered address rendering on documents

**Files:**
- Modify: `src/lib/pdf/engine/countryConfig.ts` — `ResolvedCountryFacts` gains `addressFormat: string | null`; `src/lib/pdf/countryFactsService.ts` select gains `address_format`
- Modify: `src/lib/pdf/engine/adapters/invoiceAdapter.ts` (its Task 12 3b `formatPartyAddressLines(..., false)` literal becomes config-driven). The quote adapter (Task 13 3b) already reads `config.locale?.postalFirst ?? false`; the credit-note adapter renders no party-address lines this phase, so it needs no change.
- Modify: `src/lib/pdf/templateConfig.ts` — `LocaleConfig` gains `postalFirst?: boolean`
- Test: extend `src/lib/pdf/engine/countryConfig.test.ts`

**Interfaces:**
- Consumes: `geo_countries.address_format` (existing column, zero consumers today — spec §1.9); `formatPartyAddressLines` (Task 7).
- Produces: `TemplateConfigOverride.locale.postalFirst?: boolean` (added to `LocaleConfig` alongside Task 6's separators) derived as `addressFormat != null && addressFormat.startsWith('postal_first')`; adapters call `formatPartyAddressLines(addr, config.locale?.postalFirst ?? false)`.

- [ ] **Step 1: Write the failing test** — extend `src/lib/pdf/engine/countryConfig.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { countryTemplateOverride } from './countryConfig';

const baseFacts = {
  code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
  taxInvoiceRequired: true, languageCode: 'ar' as const, decimalPlaces: 3,
  dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',',
  digitGrouping: '3', addressFormat: null as string | null,
};

describe('countryTemplateOverride address ordering', () => {
  it('sets locale.postalFirst=true for a postal_first address_format', () => {
    const override = countryTemplateOverride({ ...baseFacts, addressFormat: 'postal_first_city' });
    expect(override.locale?.postalFirst).toBe(true);
  });
  it('leaves postalFirst undefined for OM (address_format null)', () => {
    const override = countryTemplateOverride(baseFacts);
    expect(override.locale?.postalFirst).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/lib/pdf/engine/countryConfig.test.ts` → the `postalFirst` assertions fail (property absent).

- [ ] **Step 3: Implement** — the four concrete edits:

```typescript
// 1. countryFactsService.ts — add address_format to the select and map it:
//    .select('..., address_format')
addressFormat: row.address_format ?? null,

// 2. engine/countryConfig.ts — ResolvedCountryFacts gains the field (default null in all fixtures):
addressFormat: string | null;

// 3. engine/countryConfig.ts — inside countryTemplateOverride, after the separators block:
if (facts.addressFormat) locale.postalFirst = facts.addressFormat.startsWith('postal_first');

// 4. templateConfig.ts — LocaleConfig gains:
postalFirst?: boolean;
```
Then swap the invoice adapter's Task 12 3b address call `formatPartyAddressLines(addr, false)` → `formatPartyAddressLines(addr, config.locale?.postalFirst ?? false)`.
- [ ] **Step 4: Run** — `npx vitest run src/lib/pdf` green (GCC output unchanged: `postalFirst` stays false); `npm run check:tsc` 0.
- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/countryFactsService.ts src/lib/pdf/engine/countryConfig.ts src/lib/pdf/templateConfig.ts src/lib/pdf/engine/adapters
git commit -m "feat(pdf): country-ordered address rendering via geo_countries.address_format"
```

**WP-6 verification:** `npm run check:tsc` 0; `npm run test` green; manual: Oman invoice PDF shows the structured buyer address street-first with governorate + postal code.

---
### WP-7 — Unit & item-code persistence + form fields (1 PR)

**PR:** `feat/localization-p2-units-persistence`. TypeScript only (schema landed in WP-1 and Phase 1).

---

### Task 23: `unitCodesService` + service-layer persistence

**Files:**
- Create: `src/lib/unitCodesService.ts` + `src/lib/unitCodesService.test.ts`
- Modify: `src/lib/invoiceService.ts` — `InvoiceItem` (`:29-38`), createInvoice items map (`:488-500`), updateInvoice items map (the identical `InvoiceLineItemInsert` map inside `updateInvoice`, `:645-657` region — grep `unit_price: item.unit_price` inside it, `:650`)
- Modify: `src/lib/quotesService.ts` — `QuoteItem` (`:27` region), createQuote items map (`:474-484`), updateQuote items map (the identical `QuoteItemInsert` map inside `updateQuote`)
- Modify: `src/lib/creditNoteService.ts` — `CreditNoteItemInput` (`:22-30`)
- Test: extend `src/lib/quotesService.test.ts`

**Interfaces:**
- Consumes: `master_unit_codes` (Task 1); generated Insert types (regen'd in WP-1).
- Produces: `listUnitCodes(): Promise<UnitCode[]>` (cached, en/ar label resolution); item interfaces gain `unit_code?: string | null; unit_label?: string | null; item_code?: string | null; tax_treatment?: string; treatment_reason_code?: string | null;` and every insert map persists them.

- [ ] **Step 1: Write the failing tests**

`src/lib/unitCodesService.test.ts` — mock supabase returning two rows (`C62`/`HUR` with `labels_i18n`); assert `listUnitCodes()` maps `{code, uqc_code, label: labels_i18n.en, scheme}`, filters `is_active`, and caches (second call → one `from` invocation).

Extend `src/lib/quotesService.test.ts` (follow its existing createQuote mock pattern): create a quote with `items: [{ description: 'RAID recovery', quantity: 2, unit_price: 100, unit_code: 'C62', unit_label: 'Piece', item_code: '998713' }]` and assert the captured `quote_items` insert payload contains `unit_code: 'C62'`, `unit_label: 'Piece'`, `item_code: '998713'` — this is the exact silent-drop bug at `quotesService.ts:474-484` turning into a regression test.

- [ ] **Step 2: Run, verify FAIL** — unit service module missing; quote insert payload lacks the fields.

- [ ] **Step 3: Implementation**

`src/lib/unitCodesService.ts`:

```typescript
import { supabase } from './supabaseClient';

export interface UnitCode {
  code: string;
  uqc_code: string | null;
  label: string;
  scheme: string;
}

let cache: UnitCode[] | null = null;

export async function listUnitCodes(): Promise<UnitCode[]> {
  if (cache) return cache;
  const { data, error } = await supabase
    .from('master_unit_codes')
    .select('code, uqc_code, labels_i18n, scheme')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order');
  if (error) throw error;
  cache = (data ?? []).map((r) => ({
    code: r.code,
    uqc_code: r.uqc_code,
    label: ((r.labels_i18n as Record<string, string> | null)?.en) ?? r.code,
    scheme: r.scheme,
  }));
  return cache;
}

export function clearUnitCodesCache(): void {
  cache = null;
}
```

Item-map persistence — the complete pattern once (invoiceService createInvoice map `:488-500`; the five lines are ADDED to the returned object, nothing else changes):

```typescript
    return {
      tenant_id: tenantId,
      invoice_id: invoiceData.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      unit_code: item.unit_code ?? null,
      unit_label: item.unit_label ?? null,
      item_code: item.item_code ?? null,
      tax_treatment: item.tax_treatment ?? 'standard',
      treatment_reason_code: item.treatment_reason_code ?? null,
      tax_rate: invoiceTaxRate,
      tax_amount: itemTax,
      discount: discountPct,
      total: lineTotal,
      sort_order: index,
    };
```

Complete enumeration of all five edit sites:

| # | File | Site | Interface extended |
|---|---|---|---|
| 1 | `src/lib/invoiceService.ts` | createInvoice `InvoiceLineItemInsert` map (`:488-500`) | `InvoiceItem` (`:29`) gains the 5 optional fields |
| 2 | `src/lib/invoiceService.ts` | updateInvoice `InvoiceLineItemInsert` map (`:645-657` region) | same interface |
| 3 | `src/lib/quotesService.ts` | createQuote `QuoteItemInsert` map (`:474-484`) | `QuoteItem` (`:27`) gains the 5 fields |
| 4 | `src/lib/quotesService.ts` | updateQuote `QuoteItemInsert` map (grep `unit_price: item.unit_price` inside `updateQuote`) | same interface |
| 5 | `src/lib/creditNoteService.ts` | `CreditNoteItemInput` (`:22-30`) gains the 5 fields — the RPC receives them in `p_items` verbatim (DB-side insert already covers the Phase 1 columns) | `CreditNoteItemInput` |

Also update `duplicateQuote` (`quotesService.ts:783`) and `convertQuoteToInvoice` (`invoiceService.ts:793`) item mappings to carry `unit_code/unit_label/item_code` forward — the quote→invoice chain must not drop the unit (spec §1.17: "the unit survives the quote→approval→invoice chain"). Grep each function for its item map and add the three fields.

- [ ] **Step 4: Run tests, verify pass** — `npx vitest run src/lib/unitCodesService.test.ts src/lib/quotesService.test.ts src/lib/invoiceService.test.ts src/lib/creditNoteService.test.ts` → PASS; `npm run check:tsc` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/unitCodesService.ts src/lib/unitCodesService.test.ts src/lib/invoiceService.ts src/lib/quotesService.ts src/lib/creditNoteService.ts src/lib/quotesService.test.ts
git commit -m "feat(financial): unit/item-code persistence — the collected Unit field is no longer silently dropped"
```

---

### Task 24: Line-item form fields (unit select, item code, treatment)

**Files:**
- Modify: `src/components/cases/InvoiceFormModal.tsx` — `LineItem` interface (`:35-36`), init sites (`:218`, `:226`, `:406`), quote-import map (`:383-384`), Quick Add (`:425-426`), unit input (`:812-813`)
- Modify: `src/components/cases/QuoteFormModal.tsx` — mirror sites (`:33-34`, `:219`, `:228`, `:307`, `:326-327`, `:601-602`)
- Modify: `src/components/financial/CreditNoteModal.tsx` — item rows gain the same fields (optional inputs)
- Test: extend `src/components/cases/QuoteFormModal.test.tsx` (or create it following `CustomerFormModal.test.tsx`'s harness)

**Interfaces:**
- Consumes: `listUnitCodes` (Task 23); extended `InvoiceItem`/`QuoteItem` service interfaces (Task 23).
- Produces: forms submit `unit_code`/`unit_label`/`item_code` per line; the untranslatable `'Service'` literal is gone.

- [ ] **Step 1: Write the failing test** — QuoteFormModal test: mock `listUnitCodes` → `[{code:'C62', uqc_code:'NOS', label:'Piece', scheme:'rec20'}, {code:'HUR', uqc_code:'HRS', label:'Hour', scheme:'rec20'}]`; render, add a line, select 'Hour' in the Unit select, submit, assert the `createQuote` payload's item carries `{ unit_code: 'HUR', unit_label: 'Hour' }` and that no `'Service'` string appears in the payload.

- [ ] **Step 2: Run, verify FAIL** — the form still renders a free-text unit input defaulting `'Service'`.

- [ ] **Step 3: Implementation (InvoiceFormModal pattern; QuoteFormModal mirrors)**

3a. `LineItem` interface (`:35-36`): replace `unit?: string;` with:

```typescript
  unit_code?: string | null;
  unit_label?: string | null;
  item_code?: string | null;
```

3b. Literal removals — complete enumeration (every `'Service'` init becomes the neutral empty default `unit_code: null, unit_label: null`):

| File | Line | Old | New |
|---|---|---|---|
| InvoiceFormModal.tsx | `:218` | `{ description: '', quantity: 1, unit_price: 0, unit: 'Service' }` | `{ description: '', quantity: 1, unit_price: 0, unit_code: null, unit_label: null, item_code: null }` |
| InvoiceFormModal.tsx | `:226` | same literal | same replacement |
| InvoiceFormModal.tsx | `:383-384` | quote-import map `unit: 'Service'` | `unit_code: qItem.unit_code ?? null, unit_label: qItem.unit_label ?? null, item_code: qItem.item_code ?? null` (carry the quote's stored unit — no fabrication) |
| InvoiceFormModal.tsx | `:406` | add-line literal | same as `:218` replacement |
| InvoiceFormModal.tsx | `:425-426` | Quick Add `unit: 'Service'` | `unit_code: template.default_unit_code ?? null, unit_label: null` (label resolved from `listUnitCodes` on render; `default_unit_code` is Task 1's catalog column — when the Quick Add source row lacks it, null is honest) |
| QuoteFormModal.tsx | `:219` | literal | same replacement |
| QuoteFormModal.tsx | `:228` | literal | same replacement |
| QuoteFormModal.tsx | `:307` | literal | same replacement |
| QuoteFormModal.tsx | `:326-327` | `unit: template.unit_of_measure` | `unit_code: null, unit_label: template.unit_of_measure ?? null` (free-text label preserved until the template source gains a code) |

3c. Unit input → select (InvoiceFormModal `:812-813`; QuoteFormModal `:601-602`):

```tsx
<select
  value={item.unit_code ?? ''}
  onChange={(e) => {
    const code = e.target.value || null;
    const unit = unitCodes.find((u) => u.code === code);
    updateLineItem(index, 'unit_code', code);
    updateLineItem(index, 'unit_label', unit?.label ?? null);
  }}
  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
>
  <option value="">—</option>
  {unitCodes.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
</select>
```
with `const [unitCodes, setUnitCodes] = useState<UnitCode[]>([]);` loaded once via `useEffect(() => { listUnitCodes().then(setUnitCodes).catch(() => setUnitCodes([])); }, []);`. Add an adjacent optional `Item code` text input bound to `item.item_code` (placeholder `HSN/SAC`, width-constrained, hidden behind the same responsive grid the unit column uses). In `QuoteFormModal.tsx:601-602` the mirrored `<select>` reuses that file's existing input class string, which swaps the focus ring to the quote form's accent: `"w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-success focus:border-success"`.

3d. CreditNoteModal — add the same two inputs per item row bound to `item.unit_code`/`item.item_code` (via the Task 23 `CreditNoteItemInput` fields); default null.

3e. Submit payloads: ensure the form → service call passes the three fields through (the service interfaces already accept them from Task 23); delete any leftover `unit:` key so `check:tsc` proves no dangling references.

- [ ] **Step 4: Run tests, verify pass** — form suites PASS; `grep -rn "unit: 'Service'" src/components` → 0 hits; `npm run check:tsc` 0; `npm run lint` 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/cases/InvoiceFormModal.tsx src/components/cases/QuoteFormModal.tsx src/components/financial/CreditNoteModal.tsx src/components/cases/QuoteFormModal.test.tsx
git commit -m "feat(forms): unit select from master_unit_codes + item-code field; 'Service' literal removed"
```

**WP-7 verification:** `npm run check:tsc` 0; `npm run test` green; manual: create a quote with unit 'Hour', save, re-open — the unit round-trips (the audit's "field that lies" is fixed); convert to invoice — unit survives.

---

### WP-8 — POS tax threading (1 PR, migration)

**PR:** `feat/localization-p2-pos-tax` (migration PR template).

---

### Task 25: Migration — `stock_sales` tax columns + `record_stock_sale` v2

**Files:**
- Migration: `phase2_record_stock_sale_tax`
- Modify: `src/types/database.types.ts` (regenerated), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: live `record_stock_sale(p_sale jsonb, p_items jsonb)` (SECURITY DEFINER — fetch the body via `pg_get_functiondef` first; it computes subtotal/discount/total, FOR-UPDATE locks stock rows, writes `stock_transactions`); `document_tax_lines`, `vat_records` extended columns (Phase 0/1).
- Produces: `record_stock_sale(p_sale jsonb, p_items jsonb, p_tax_lines jsonb DEFAULT NULL) RETURNS stock_sales`; `stock_sales.tax_amount numeric(19,4) NOT NULL DEFAULT 0`, `tax_inclusive boolean NOT NULL DEFAULT false`, `tax_regime_key text`.

- [ ] **Step 1: SQL probes — current wrong behavior**

```sql
-- (a) record_stock_sale writes NO tax evidence today:
SELECT pg_get_functiondef(p.oid) LIKE '%vat_records%' AS posts_vat,
       pg_get_functiondef(p.oid) LIKE '%document_tax_lines%' AS posts_lines
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='record_stock_sale';
-- expect: false, false
-- (b) header has no tax columns:
SELECT count(*) FROM information_schema.columns
WHERE table_schema='public' AND table_name='stock_sales'
  AND column_name IN ('tax_amount','tax_inclusive','tax_regime_key');
-- expect: 0
```
Save the full `pg_get_functiondef` output — it is the base text.

- [ ] **Step 2: Compose + apply the migration**

Header columns (verbatim):

```sql
ALTER TABLE public.stock_sales
  ADD COLUMN IF NOT EXISTS tax_amount numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_regime_key text;
```

Function: `DROP FUNCTION IF EXISTS public.record_stock_sale(jsonb, jsonb);` then `CREATE OR REPLACE FUNCTION public.record_stock_sale(p_sale jsonb, p_items jsonb, p_tax_lines jsonb DEFAULT NULL) RETURNS public.stock_sales ...` with the fetched body plus these four exact additions (anchors named against the Step 1 body):

**Add A — declarations:**

```sql
  v_tax_total numeric := 0;
  v_tax_inclusive boolean := COALESCE((p_sale ->> 'tax_inclusive')::boolean, false);
  v_tax_point date;
  v_tz text;
  v_tl jsonb;
```

**Add B — tax total + header math.** Immediately after the existing subtotal/discount computation and before the `stock_sales` INSERT:

```sql
  SELECT COALESCE(sum((tl ->> 'tax_amount')::numeric), 0)
    INTO v_tax_total
  FROM jsonb_array_elements(COALESCE(p_tax_lines, '[]'::jsonb)) tl
  WHERE (tl ->> 'line_item_id') IS NULL;      -- document-level rollups only

  -- Exclusive tax adds to the total; inclusive tax is already inside it.
  -- (Adjust the existing v_total assignment:)
  --   v_total := v_subtotal - v_discount;                   -- existing line
  --   becomes:
  --   v_total := v_subtotal - v_discount
  --              + CASE WHEN v_tax_inclusive THEN 0 ELSE v_tax_total END;
```
And extend the `stock_sales` INSERT column list with `tax_amount, tax_inclusive, tax_regime_key` valued `v_tax_total, v_tax_inclusive, NULLIF(p_sale ->> 'tax_regime_key', '')`.

**Add C — item extras.** In the `stock_sale_items` INSERT built from `p_items`, add the five columns sourced from each item element: `unit_code` (`itm ->> 'unit_code'`), `unit_label`, `item_code`, `tax_treatment` (`COALESCE(itm ->> 'tax_treatment', 'standard')`), `treatment_reason_code`.

**Add D — tax evidence.** After the sale row insert (sale id available as the function's sale-row variable, e.g. `v_sale`):

```sql
  IF p_tax_lines IS NOT NULL AND jsonb_array_length(p_tax_lines) > 0 THEN
    -- 1) Component snapshot rows (parity with invoices)
    INSERT INTO public.document_tax_lines
      (tenant_id, document_type, document_id, line_item_id, component_code, component_label,
       jurisdiction_ref, rate, taxable_base, tax_amount, currency, exchange_rate,
       tax_amount_base, tax_treatment, treatment_reason_code, regime_key, plugin_version,
       pack_version_id, rule_trace, sequence)
    SELECT v_sale.tenant_id, 'stock_sale', v_sale.id,
           NULLIF(tl ->> 'line_item_id', '')::uuid,
           tl ->> 'component_code', tl ->> 'component_label',
           NULLIF(tl ->> 'jurisdiction_ref', '')::uuid,
           (tl ->> 'rate')::numeric, (tl ->> 'taxable_base')::numeric,
           (tl ->> 'tax_amount')::numeric, tl ->> 'currency',
           COALESCE((tl ->> 'exchange_rate')::numeric, 1),
           COALESCE((tl ->> 'tax_amount_base')::numeric, (tl ->> 'tax_amount')::numeric),
           tl ->> 'tax_treatment', NULLIF(tl ->> 'treatment_reason_code', ''),
           tl ->> 'regime_key', tl ->> 'plugin_version',
           NULLIF(tl ->> 'pack_version_id', '')::uuid, tl -> 'rule_trace',
           COALESCE((tl ->> 'sequence')::int, 0)
    FROM jsonb_array_elements(p_tax_lines) tl;

    -- 2) Output-tax ledger rows, tenant-local tax period (parity with invoices)
    SELECT t.timezone INTO v_tz FROM tenants t WHERE t.id = v_sale.tenant_id;
    v_tax_point := (now() AT TIME ZONE COALESCE(v_tz, 'UTC'))::date;

    INSERT INTO public.vat_records
      (tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
       currency, exchange_rate, vat_amount_base, taxable_amount_base,
       component_code, jurisdiction_ref, tax_treatment, regime_key,
       tax_point_date, source_document_type, source_document_id)
    SELECT v_sale.tenant_id, 'sale', v_sale.id,
           (tl ->> 'tax_amount')::numeric, (tl ->> 'rate')::numeric,
           to_char(v_tax_point, 'YYYY-MM'),
           tl ->> 'currency', COALESCE((tl ->> 'exchange_rate')::numeric, 1),
           COALESCE((tl ->> 'tax_amount_base')::numeric, (tl ->> 'tax_amount')::numeric),
           COALESCE((tl ->> 'taxable_base')::numeric, 0),
           tl ->> 'component_code', NULLIF(tl ->> 'jurisdiction_ref', '')::uuid,
           tl ->> 'tax_treatment', tl ->> 'regime_key',
           v_tax_point, 'stock_sale', v_sale.id
    FROM jsonb_array_elements(p_tax_lines) tl
    WHERE (tl ->> 'line_item_id') IS NULL AND (tl ->> 'tax_amount')::numeric <> 0;
  END IF;
```

Re-grant exactly as the Step 1 body's GRANT/REVOKE tail (SECURITY DEFINER posture preserved; no anon EXECUTE).

- [ ] **Step 3: SQL behavioral probes**

```sql
-- Legacy 2-arg call path must be gone (single 3-arg function with a default):
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='record_stock_sale';   -- expect 1
-- End-to-end (on a test stock item): call with one item + one VAT rollup line;
-- then assert: stock_sales.tax_amount = 5.000, one document_tax_lines row
-- (document_type='stock_sale'), one vat_records row (record_type='sale',
-- source_document_type='stock_sale', tax_period = current tenant-local YYYY-MM).
```

- [ ] **Step 4: Regen types + manifest**

Regen `database.types.ts`; `npm run check:tsc` — `stockService.createStockSale` still calls with 2 named args, which now bind to the 3-arg function's default → compiles and behaves (tax-free) until Task 26 lands. Manifest row:

```markdown
| <version> | phase2_record_stock_sale_tax.sql | Additive + Conditional (function signature widened) | stock_sales tax columns; record_stock_sale v2 writes document_tax_lines + vat_records from p_tax_lines | #TBD-PR |
```

- [ ] **Step 5: Commit**

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(db): record_stock_sale v2 — POS tax threading into document_tax_lines + vat_records (P2/M5)"
```

---

### Task 26: `computeStockSaleTax` + stockService + StockSaleModal

**Files:**
- Create: `src/lib/tax/assembleStockSaleContext.ts` + `src/lib/tax/assembleStockSaleContext.test.ts`
- Modify: `src/lib/stockService.ts:519-552` (`createStockSale`) and the `StockSaleCreateData` interface it consumes (same file — grep `interface StockSaleCreateData`)
- Modify: `src/components/stock/StockSaleModal.tsx` — totals block (`:261-270`), submit payload (`:284-300` region), totals display (`:445-486`, `:563`)
- Test: extend `src/lib/stockService.test.ts`

**Interfaces:**
- Consumes: `computeDocumentTax` (`src/lib/tax/kernel/`, Phase 1); `resolveTaxStrategy` (Phase 1 registry); `TaxContext`, `TaxableLine`, `TaxComputation`, `RoundingPolicy`, `ScaleSystem` (Phase 1 types); `resolveRateContext` (`src/lib/currencyService.ts:137`); `tenantToday` (Phase 0); `geo_country_tax_rates` (Phase 1); `resolveComplianceRenderInputs` internals' query shapes (Task 5 — the legal-entity/tenant reads are repeated here deliberately: this module is kernel-side, not pdf-side).
- Produces: `computeStockSaleTax(input: StockSaleTaxInput): Promise<TaxComputation>`; `createStockSale` passes `p_tax_lines`; the POS modal shows component tax rows and a tax-inclusive-aware total.

- [ ] **Step 1: Write the failing test**

`src/lib/tax/assembleStockSaleContext.test.ts` — mock supabase with: one primary OM legal entity (`tax_identifier` set), tenant row (`timezone 'Asia/Muscat'`, `base_currency_code 'OMR'`, `resolved_country_config {'regime.tax':'simple_vat','tax.rounding_policy':{'mode':'half_up','level':'document'}}`), one `geo_country_tax_rates` row (VAT/standard/5.0000, `valid_from '2021-04-16'`); mock `resolveRateContext` → `{documentCurrency:'OMR', documentDecimals:3, baseCurrency:'OMR', baseDecimals:3, rate:1, rateSource:'derived'}`. Then:

```typescript
it('computes a single VAT rollup for an exclusive POS sale', async () => {
  const comp = await computeStockSaleTax({
    lines: [{ lineItemId: null, description: 'SATA cable', quantity: 2, unitPrice: 5,
      lineDiscount: 0, unitCode: 'C62', itemCode: null, treatment: 'standard', treatmentReasonCode: null }],
    documentDiscount: 0,
    taxInclusive: false,
  });
  expect(comp.rollups).toHaveLength(1);
  expect(comp.rollups[0]).toMatchObject({ componentCode: 'VAT', rate: 5, taxAmount: 0.5 });
  expect(comp.totals.grandTotal).toBe(10.5);
});
```

- [ ] **Step 2: Run, verify FAIL** — module not found.

- [ ] **Step 3: Implementation**

`src/lib/tax/assembleStockSaleContext.ts`:

```typescript
import { supabase } from '../supabaseClient';
import { computeDocumentTax } from './kernel';
import { resolveTaxStrategy } from '../regimes/registry';
import type { TaxableLine, TaxComputation, TaxContext, RoundingPolicy, ScaleSystem } from '../regimes/types';
import { resolveRateContext } from '../currencyService';
import { tenantToday } from '../tenantToday';

export interface StockSaleTaxInput {
  lines: TaxableLine[];
  documentDiscount: number;
  taxInclusive: boolean;
}

/** POS sales have no draft stage: assemble the TaxContext here and run the same
 *  kernel invoices use. Base-currency only (POS is tenant-base by definition). */
export async function computeStockSaleTax(input: StockSaleTaxInput): Promise<TaxComputation> {
  const { data: entities } = await supabase
    .from('legal_entities')
    .select('id, tenant_id, country_id, subdivision_id, tax_identifier, is_primary')
    .is('deleted_at', null);
  const seller = (entities ?? []).find((e) => e.is_primary) ?? (entities ?? [])[0];
  if (!seller) throw new Error('computeStockSaleTax: no legal entity configured for this tenant');

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, timezone, base_currency_code, resolved_country_config')
    .eq('id', seller.tenant_id)
    .maybeSingle();
  if (!tenant) throw new Error('computeStockSaleTax: tenant not resolvable');

  const resolved = (tenant.resolved_country_config ?? {}) as Record<string, unknown>;
  const regimeKey = (resolved['regime.tax'] as string) || 'simple_vat';
  const strategy = resolveTaxStrategy(regimeKey);
  const taxPointDate = tenantToday(tenant.timezone ?? 'UTC');

  const { data: regs } = await supabase
    .from('legal_entity_tax_registrations')
    .select('*')
    .eq('legal_entity_id', seller.id)
    .is('deleted_at', null)
    .lte('registered_from', taxPointDate)
    .or(`registered_to.is.null,registered_to.gte.${taxPointDate}`);

  const { data: rates } = await supabase
    .from('geo_country_tax_rates')
    .select('*')
    .eq('country_id', seller.country_id)
    .is('deleted_at', null)
    .lte('valid_from', taxPointDate)
    .or(`valid_to.is.null,valid_to.gte.${taxPointDate}`)
    .order('sort_order');

  const rateContext = await resolveRateContext(undefined, taxPointDate, null); // tenant base

  const roundingPolicy =
    (resolved['tax.rounding_policy'] as RoundingPolicy | undefined) ?? strategy.defaults.roundingPolicy;
  const scaleSystem =
    (resolved['format.amount_words_scale'] as ScaleSystem | undefined) ?? strategy.defaults.scaleSystem;

  const ctx: TaxContext = {
    documentType: 'stock_sale',
    seller: {
      legalEntityId: seller.id,
      countryId: seller.country_id,
      subdivisionId: seller.subdivision_id ?? null,
      taxIdentifier: seller.tax_identifier ?? null,
      registrations: regs ?? [],
    },
    buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
    taxPointDate,
    placeOfSupplySubdivisionId: null,
    lines: input.lines,
    documentDiscount: input.documentDiscount,
    taxInclusive: input.taxInclusive,
    rateContext,
    rates: rates ?? [],
    roundingPolicy,
    scaleSystem,
  };
  return computeDocumentTax(ctx);
}
```
(`computeDocumentTax` is synchronous per the contract; `await` on `strategy.compute` is unnecessary here — the native `simple_vat` path is used. If Phase 1 kernel expects invocation through `strategy.compute(ctx)`, call that instead of `computeDocumentTax(ctx)` — match Phase 1's invoiceService usage, which is the canonical caller pattern.)

`stockService.createStockSale` (`:519-552`): `StockSaleCreateData` gains `taxComputation?: TaxComputation | null`, `currency: string` (the tenant base currency code — source it from `resolveRateContext(...).baseCurrency` computed alongside `taxComputation`, the exact value stamped on every `p_tax_lines[].currency`), and items gain the five optional fields; the RPC call adds:

```typescript
    p_sale: {
      customer_id: data.customer_id,
      case_id: data.case_id ?? null,
      notes: data.notes ?? null,
      payment_method: data.payment_method ?? null,
      discount_type: data.discount_type ?? null,
      discount_value: data.discount_value ?? null,
      tax_inclusive: data.tax_inclusive ?? false,
      tax_regime_key: data.taxComputation?.trace.regimeKey ?? null,
    },
    p_items: data.items.map((item) => ({
      stock_item_id: item.stock_item_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      cost_price: item.cost_price ?? null,
      serial_number: item.serial_number ?? null,
      unit_code: item.unit_code ?? null,
      unit_label: item.unit_label ?? null,
      item_code: item.item_code ?? null,
      tax_treatment: item.tax_treatment ?? 'standard',
      treatment_reason_code: item.treatment_reason_code ?? null,
    })),
    p_tax_lines: data.taxComputation
      ? [...data.taxComputation.lines, ...data.taxComputation.rollups].map((l, i) => ({
          line_item_id: l.lineItemId,
          component_code: l.componentCode,
          component_label: l.componentLabel,
          jurisdiction_ref: l.jurisdictionRef,
          rate: l.rate,
          taxable_base: l.taxableBase,
          tax_amount: l.taxAmount,
          currency: data.currency,
          exchange_rate: 1,
          tax_amount_base: l.taxAmount,
          tax_treatment: l.taxTreatment,
          treatment_reason_code: l.treatmentReasonCode,
          regime_key: data.taxComputation!.trace.regimeKey,
          plugin_version: data.taxComputation!.trace.pluginVersion,
          pack_version_id: data.taxComputation!.trace.packVersionId,
          rule_trace: i === 0 ? data.taxComputation!.trace : null,
          sequence: l.sequence,
        }))
      : null,
```

`StockSaleModal.tsx`: after the cart/discount memo (`:261-270`), add a debounced effect calling `computeStockSaleTax` with the cart mapped to `TaxableLine[]` (`lineItemId: null`, `description: l.item.name`, `quantity: l.quantity`, `unitPrice: l.unit_price`, `lineDiscount: 0`, `unitCode: null`, `itemCode: null`, `treatment: 'standard'`, `treatmentReasonCode: null`) and `documentDiscount = discountAmount`; store `taxComputation` in state (null on error, with a danger note "Tax could not be computed" and Create disabled when the tenant is pack-pinned). Totals panel (`:445-486`): render one row per `taxComputation.rollups` (`component_label` + amount) between Subtotal and Total; `const total = subtotal - discountAmount + (taxComputation?.totals.taxTotal ?? 0);` replaces `:270`; the submit payload passes `taxComputation` + `currency` through `StockSaleCreateData`.

- [ ] **Step 4: Run tests, verify pass** — `npx vitest run src/lib/tax/assembleStockSaleContext.test.ts src/lib/stockService.test.ts` → PASS (extend the existing `stockService.test.ts` RPC-payload assertion to cover `p_tax_lines`); `npm run check:tsc` 0. Manual smoke: OM tenant POS sale shows 'VAT 5%' row; after Create, `document_tax_lines` and `vat_records` rows exist (Task 25 Step 3 probe query).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/assembleStockSaleContext.ts src/lib/tax/assembleStockSaleContext.test.ts src/lib/stockService.ts src/lib/stockService.test.ts src/components/stock/StockSaleModal.tsx
git commit -m "feat(pos): stock sales compute kernel tax and thread p_tax_lines — vat_records parity with invoices"
```

**WP-8 verification:** Task 25 probes green; `npm run test` green; a POS sale and an invoice for the same amounts produce identical `vat_records` shapes (component_code, tax_period, base amounts).

---

### WP-9 — Multi-country matrix, RTL snapshots, M-I guards (1 PR)

**PR:** `feat/localization-p2-matrix-tests`. Test-only.

---

### Task 27: GCC-6 + UK document matrix + RTL bilingual snapshots

**Files:**
- Create: `src/lib/pdf/engine/complianceMatrix.test.ts`
- Create: `src/lib/pdf/engine/__snapshots__/` entries (generated)

**Interfaces:**
- Consumes: `countryTemplateOverride` (Task 6), `resolveTemplateConfigWithCountry`, `toEngineData` (invoice, Task 12) + quote adapter (Task 13) + credit-note adapter (Task 9), `gccTaxInvoiceProfile` (Task 4), `resolveDocumentProfile('generic_invoice')` (Phase 1).
- Produces: the CI matrix asserting the Phase 2 exit criterion per country.

- [ ] **Step 1: Write the matrix (it fails wherever rendering is wrong — that is its job)**

Fixture facts for the seven countries (fields per the extended `ResolvedCountryFacts`):

| code | taxSystem | taxLabel | taxNumberLabel | taxInvoiceRequired | languageCode | dp | dateFormat | profile |
|---|---|---|---|---|---|---|---|---|
| OM | VAT | VAT | VATIN | true | ar | 3 | DD/MM/YYYY | gcc_tax_invoice |
| AE | VAT | VAT | TRN | true | ar | 2 | DD/MM/YYYY | gcc_tax_invoice |
| SA | VAT | VAT | VAT Number | true | ar | 2 | DD/MM/YYYY | gcc_tax_invoice |
| BH | VAT | VAT | VAT Account Number | true | ar | 3 | DD/MM/YYYY | gcc_tax_invoice |
| KW | NONE | Tax | Tax ID | false | ar | 3 | DD/MM/YYYY | generic_invoice |
| QA | NONE | Tax | Tax ID | false | ar | 2 | DD/MM/YYYY | generic_invoice |
| GB (the "any simple-VAT country") | VAT | VAT | VAT Number | true | en | 2 | DD/MM/YYYY | generic_invoice |

For each country × {invoice, quote}: resolve the config via `resolveTemplateConfigWithCountry(...)`, run the adapter on a shared fixture (2 lines, one document-level VAT rollup at the country rate), and assert. Write it as `it.each` over the table:

```typescript
import { describe, it, expect } from 'vitest';
import { toEngineData } from './adapters/invoiceAdapter';
import { toEngineData as toQuoteEngineData } from './adapters/quoteAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../templateConfig';
import { countryTemplateOverride } from './countryConfig';
import { renderTemplate } from './renderTemplate';
import { ctxFromLanguageConfig } from './rtl';           // engine's ctx builder for the language slice
import { resolveDocumentProfile } from '../../regimes/registry';
import { gccTaxInvoiceProfile } from '../../regimes/gcc_tax_invoice';
import { buildInvoiceFixture } from './invoiceParity.fixtures';
import { buildQuoteFixture } from './quoteParity.fixtures';

interface Cell {
  code: string; taxSystem: 'VAT' | 'NONE'; taxLabel: string; taxNumberLabel: string;
  taxInvoiceRequired: boolean; languageCode: string; dp: number; profileKey: 'gcc_tax_invoice' | 'generic_invoice';
}
const MATRIX: Cell[] = [
  { code: 'OM', taxSystem: 'VAT',  taxLabel: 'VAT', taxNumberLabel: 'VATIN',              taxInvoiceRequired: true,  languageCode: 'ar', dp: 3, profileKey: 'gcc_tax_invoice' },
  { code: 'AE', taxSystem: 'VAT',  taxLabel: 'VAT', taxNumberLabel: 'TRN',                taxInvoiceRequired: true,  languageCode: 'ar', dp: 2, profileKey: 'gcc_tax_invoice' },
  { code: 'SA', taxSystem: 'VAT',  taxLabel: 'VAT', taxNumberLabel: 'VAT Number',         taxInvoiceRequired: true,  languageCode: 'ar', dp: 2, profileKey: 'gcc_tax_invoice' },
  { code: 'BH', taxSystem: 'VAT',  taxLabel: 'VAT', taxNumberLabel: 'VAT Account Number', taxInvoiceRequired: true,  languageCode: 'ar', dp: 3, profileKey: 'gcc_tax_invoice' },
  { code: 'KW', taxSystem: 'NONE', taxLabel: 'Tax', taxNumberLabel: 'Tax ID',             taxInvoiceRequired: false, languageCode: 'ar', dp: 3, profileKey: 'generic_invoice' },
  { code: 'QA', taxSystem: 'NONE', taxLabel: 'Tax', taxNumberLabel: 'Tax ID',             taxInvoiceRequired: false, languageCode: 'ar', dp: 2, profileKey: 'generic_invoice' },
  { code: 'GB', taxSystem: 'VAT',  taxLabel: 'VAT', taxNumberLabel: 'VAT Number',         taxInvoiceRequired: true,  languageCode: 'en', dp: 2, profileKey: 'generic_invoice' },
];

const factsFor = (c: Cell) => ({
  code: c.code, taxSystem: c.taxSystem, taxLabel: c.taxLabel, taxNumberLabel: c.taxNumberLabel,
  taxInvoiceRequired: c.taxInvoiceRequired, languageCode: c.languageCode, decimalPlaces: c.dp,
  dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
  addressFormat: null as string | null,
});
const profileFor = (c: Cell) =>
  c.profileKey === 'gcc_tax_invoice' ? gccTaxInvoiceProfile : resolveDocumentProfile('generic_invoice');
const taxLinesFor = (c: Cell) => c.taxSystem === 'VAT'
  ? [{ line_item_id: null, component_code: 'VAT', component_label: `${c.taxLabel} 5%`, rate: 5,
       taxable_base: 1440, tax_amount: 72, tax_treatment: 'standard', treatment_reason_code: null,
       sequence: 0, backfilled: false, rule_trace: null }]
  : [];
const configFor = (c: Cell, docType: 'invoice' | 'quote') => resolveTemplateConfigWithCountry(
  BUILT_IN_TEMPLATE_CONFIGS[docType],
  countryTemplateOverride(factsFor(c), { profile: profileFor(c), sellerRegistered: true, docType }),
);

describe('Phase 2 compliance matrix', () => {
  it.each(MATRIX)('$code invoice — title ceremony, band, component row, bilingual', (c) => {
    const config = configFor(c, 'invoice');
    const data = toEngineData(buildInvoiceFixture({
      subtotal: 1440, tax_amount: 72, total_amount: 1512, seller_tax_number: `SELLER-${c.code}`,
      tax_lines: taxLinesFor(c),
    }), config);

    // 1. Title ceremony — only VAT + required countries claim TAX INVOICE.
    expect(data.title.en).toBe(c.taxSystem === 'VAT' && c.taxInvoiceRequired ? 'TAX INVOICE' : 'INVOICE');
    // 2. Band — enabled + labelled for VAT countries; disabled for KW/QA.
    expect(config.taxBar?.enabled).toBe(c.taxSystem === 'VAT');
    if (c.taxSystem === 'VAT') expect(config.taxBar?.label?.en).toBe(c.taxNumberLabel);
    // 3. Component row — exactly one 'tax' row, stored amount at country decimals (72.000 OM vs 72.00 AE).
    const taxRows = (data.totals ?? []).filter((t) => t.key === 'tax');
    if (c.taxSystem === 'VAT') {
      expect(taxRows).toHaveLength(1);
      expect(taxRows[0].label.en).toBe(`${c.taxLabel} 5%:`);
      expect(taxRows[0].value).toContain((72).toFixed(c.dp));
    } else {
      expect(taxRows).toHaveLength(0);
    }
    // 4. Bilingual — ar countries stack; GB stays en.
    expect(config.language?.mode).toBe(c.languageCode === 'ar' ? 'bilingual_stacked' : 'en');
    // 5. Snapshot net.
    expect(data).toMatchSnapshot(`${c.code}-invoice`);
  });

  it.each(MATRIX)('$code quote resolves QUOTATION + component rows', (c) => {
    const data = toQuoteEngineData(buildQuoteFixture({
      subtotal: 1440, tax_amount: 72, total_amount: 1512, tax_lines: taxLinesFor(c),
    }), configFor(c, 'quote'));
    expect(data.title.en).toBe('QUOTATION');
    expect(data).toMatchSnapshot(`${c.code}-quote`);
  });

  it('en output for a facts-null tenant is byte-identical (Phase-4a invariant)', () => {
    const gb = MATRIX[6];
    const withFacts = toEngineData(buildInvoiceFixture({ subtotal: 1440, tax_amount: 72, total_amount: 1512, tax_lines: taxLinesFor(gb) }), configFor(gb, 'invoice'));
    const nullFacts = toEngineData(buildInvoiceFixture({ subtotal: 1440, tax_amount: 72, total_amount: 1512, tax_lines: taxLinesFor(gb) }), BUILT_IN_TEMPLATE_CONFIGS.invoice);
    expect(withFacts.title.en).toBe(nullFacts.title.en);
    expect((withFacts.totals ?? []).filter((t) => t.key === 'tax')).toEqual((nullFacts.totals ?? []).filter((t) => t.key === 'tax'));
  });

  it.each(['OM', 'SA'])('%s RTL bilingual PDF content tree snapshot', (code) => {
    const c = MATRIX.find((m) => m.code === code)!;
    const config = configFor(c, 'invoice');
    const data = toEngineData(buildInvoiceFixture({ subtotal: 1440, tax_amount: 72, total_amount: 1512, tax_lines: taxLinesFor(c) }), config);
    const docDef = renderTemplate(config, data, ctxFromLanguageConfig(config.language), null);
    expect(docDef.content).toMatchSnapshot(`${code}-invoice-rtl-content`);
  });
});
```

- [ ] **Step 2: Run, fix, re-run** — `npx vitest run src/lib/pdf/engine/complianceMatrix.test.ts`; every failure is a real compliance defect in Tasks 4–13; fix at the source (never in the test). First green run writes the snapshots; eyeball each snapshot once for sanity (title strings, band labels, Arabic strings present in bilingual cells).

- [ ] **Step 3: Full suite** — `npm run test` green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/engine/complianceMatrix.test.ts src/lib/pdf/engine/__snapshots__
git commit -m "test(compliance): GCC-6 + UK document matrix — titles, bands, component rows, bilingual/RTL snapshots"
```

---

### Task 28: M-I guards — legacy rows, backfilled badge, activation gate, sealed reprints

**Files:**
- Create: `src/lib/pdf/engine/legacyDocumentGuards.test.tsx`
- Modify: `src/components/financial/TaxTraceDrawer.tsx` (only if the badge assertion fails)
- SQL probes (documented in the PR, not committed code)

**Interfaces:**
- Consumes: Task 12 fallback path, Task 15 drawer, Task 18 activation gate, `documentInstanceService.attachArtifact` (`src/lib/documentInstanceService.ts:149` — sha256-sealed artifacts, existing).
- Produces: regression net for "historical documents NEVER re-rendered".

- [ ] **Step 1: Write the failing/guard tests**

`src/lib/pdf/engine/legacyDocumentGuards.test.tsxx` (`.tsx` — guard 2 renders a component, so it runs in the jsdom project):

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { toEngineData } from './adapters/invoiceAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../templateConfig';
import { countryTemplateOverride } from './countryConfig';
import { gccTaxInvoiceProfile } from '../../regimes/gcc_tax_invoice';
import { buildInvoiceFixture } from './invoiceParity.fixtures';
import { TaxTraceDrawer } from '../../../components/financial/TaxTraceDrawer';
import type { Database } from '../../../types/database.types';

function omConfig() {
  return resolveTemplateConfigWithCountry(
    BUILT_IN_TEMPLATE_CONFIGS.invoice,
    countryTemplateOverride(
      { code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN', taxInvoiceRequired: true,
        languageCode: 'ar', decimalPlaces: 3, dateFormat: 'DD/MM/YYYY', decimalSeparator: '.',
        thousandsSeparator: ',', digitGrouping: '3', addressFormat: null },
      { profile: gccTaxInvoiceProfile, sellerRegistered: true, docType: 'invoice' },
    ),
  );
}

describe('M-I guards', () => {
  // 1. Empty-tax-lines fallback prints the STORED header figure, not a recompute.
  it('empty tax_lines fallback prints the STORED header tax (4.75), not a recompute (5.000)', () => {
    const data = toEngineData(
      buildInvoiceFixture({ subtotal: 100, tax_rate: 5, tax_amount: 4.75, total_amount: 104.75, tax_lines: [] }),
      omConfig(),
    );
    const taxRows = (data.totals ?? []).filter((t) => t.key === 'tax');
    expect(taxRows).toHaveLength(1);
    expect(taxRows[0].value).toContain('4.75');
  });

  // 2. Backfilled documents badge as reconstructed history in the trace drawer.
  it('backfilled documents badge as reconstructed history', () => {
    render(<TaxTraceDrawer trace={null} backfilled open onClose={() => {}} />);
    expect(screen.getByText(/Reconstructed history/)).toBeInTheDocument();
  });

  // 3. Schema pin: the snapshot columns stayed nullable (compiles ⇔ nullable).
  it('snapshot columns stayed nullable (type-level pin)', () => {
    const nullable: Database['public']['Tables']['invoices']['Row']['buyer_tax_number'] = null;
    expect(nullable).toBeNull();
  });
});
```

SQL probes recorded in the PR description (run once against live):

```sql
-- Activation gate (repeat of Task 18 probe d — the M-I acceptance evidence):
-- tenant with country_pack_version NULL → dry-run returns "requirement_failures": [].
-- Sealed-artifact canonicality: sealed instances carry pdf_storage_path + pdf_sha256
SELECT count(*) FROM document_instances
WHERE pdf_sha256 IS NOT NULL AND pdf_storage_path IS NULL;   -- expect 0
```
Reprint-path pin: `grep -rn "generateInvoice\|generatePDF" src/components/cases/DocumentViewerModal.tsx src/lib/portalDocumentService.ts` → 0 hits (sealed documents are served from storage via `getDocumentPdfSignedUrl`, never re-rendered — record the grep output in the PR).

- [ ] **Step 2: Run, verify guards bite** — sabotage check: temporarily reintroduce a recompute (`taxAmount = discountedSubtotal * rate / 100`) in the adapter fallback → guard 1 fails; revert.

- [ ] **Step 3: Full suite + gates**

```bash
npm run check:tsc && npm run test && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/engine/legacyDocumentGuards.test.tsx
git commit -m "test(m-i): legacy-row fallback, backfilled badge, nullable-snapshot and sealed-reprint guards"
```

**WP-9 verification:** full suite green; matrix + guards in CI; PR carries the SQL probe outputs.

---

## Testing Strategy

1. **Unit (node project, colocated `*.test.ts`):** profile plugin (Task 4), resolver (Task 5), override mapper (Task 6), money/address formatters (Task 7), adapters (Tasks 9, 12, 13), services (Tasks 23, 26). Pure functions everywhere the contract allows — kernel-style golden inputs/outputs.
2. **Component (jsdom, `*.test.tsx`):** AddressFields, RequirementFailuresPanel, useDocumentCompliance hook, form persistence (Tasks 14, 15, 20, 21, 24).
3. **Preview/print parity (exit gate):** Task 16 — adapter output vs rendered preview on the same fixture; mutation-checked.
4. **Multi-country document matrix (exit gate):** Task 27 — GCC-6 + GB × {quote, invoice, credit note}; per-language snapshots (en byte-parity for facts-null tenants); RTL bilingual pdfmake-tree snapshots for OM/SA.
5. **SQL behavioral probes:** every migration task carries before/after probes; the requirement gate has positive (block fires), negative (B2C passes), and activation-gate (pre-pin skip) probes; PostgREST bypass — raw RPC issuance of a blocked document fails with `P0403`.
6. **M-I regression net:** Task 28 — stored-figure fallback, backfilled badge, nullable snapshot columns, sealed-reprint grep pin.
7. **Existing suites as the safety net:** the pdf engine parity/golden suites run at every step; any diff not explicitly re-baselined (Task 10 Step 3, Task 12 Step 4) is a defect.
8. **TZ determinism:** vitest pins `Asia/Dubai`; all date assertions go through `tenantToday`/`fmtDateWithConfig` fixtures, never `new Date()` literals.

## Verification Commands

```bash
npm run check:tsc                 # expect: 0 errors (script fails otherwise)
npm run test                      # expect: all suites pass (node + dom projects)
npm run lint                      # expect: clean (eslint . — includes xsuite custom rules)
npm run check:schema-drift        # expect: no diff after each WP-1/5/8 migration PR
npx vitest run src/lib/pdf        # expect: engine suites + matrix + parity green
npx vitest run src/lib/regimes    # expect: profile fixtures green
grep -rn "unit: 'Service'" src/components               # expect: no output
grep -n  "resolveTemplateConfig(" src/lib/pdf/pdfService.ts   # expect: only the :73 signature helper
grep -rn "buildInvoiceDocument\|buildQuoteDocument\|buildCreditNoteDocument" src/ --include='*.ts' --include='*.tsx'  # expect: no production hits
grep -rn "VITE_PDF_ENGINE_INVOICE\|VITE_PDF_ENGINE_QUOTE" src/   # expect: no output
```

SQL (via `mcp__supabase__execute_sql`, project `ssmbegiyjivrcwgcqutu`):

```sql
SELECT count(*) FROM master_unit_codes WHERE is_active;                          -- 9
SELECT count(*) FROM master_document_requirements WHERE deleted_at IS NULL;      -- 16
SELECT count(*) FROM geo_subdivisions s JOIN geo_countries g ON g.id=s.country_id WHERE g.code='OM';  -- 11
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname IN ('evaluate_document_requirements');      -- 1 row
SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='record_stock_sale';                      -- 'p_sale jsonb, p_items jsonb, p_tax_lines jsonb'
```

## Acceptance Criteria

- [ ] Country facts flow into all 8 engine build paths + the new credit-note path (`resolveTemplateConfigWithCountry` grep count = 9 in pdfService).
- [ ] Oman tenant renders 'TAX INVOICE / فاتورة ضريبية' with a VATIN band **by default** — zero Studio configuration.
- [ ] An UNregistered seller renders 'INVOICE' with no band (title ceremony is profile+registration-derived, never hardcoded).
- [ ] Invoice/quote/credit-note PDFs and React previews render **one totals row per `document_tax_lines` rollup**; printed figures equal stored figures (recompute deleted; Task 28 guard bites on reintroduction).
- [ ] `issue_tax_document` blocks issuance of an OM B2B invoice missing the buyer VATIN via UI **and** raw REST (`P0403`); warn-level failures surface in the UI and require confirmation.
- [ ] Issued documents carry stamped `buyer_tax_number`, `buyer_tax_number_label`, `buyer_address`, `seller_tax_number`, `supply_date`.
- [ ] Customers/companies/suppliers capture structured addresses; documents render them country-ordered with free-text fallback for legacy rows.
- [ ] `master_unit_codes` live (9 seeds); unit/item codes persist on all four item tables; the forms' Unit field round-trips (silent drop fixed); `'Service'` literal gone; unit survives quote→invoice conversion.
- [ ] POS sale writes `document_tax_lines` + `vat_records` rows shaped identically to invoice evidence; POS total includes tax.
- [ ] Legacy financial builders deleted; no `VITE_PDF_ENGINE_INVOICE`/`QUOTE` flags remain (owner: flags removed by phase end).
- [ ] Historical documents: never re-rendered (sealed-artifact grep pin), adapter falls back to stored header figures, requirements skipped for unpinned tenants, backfilled rows badge as reconstructed.
- [ ] Matrix green: GCC-6 + GB titles/bands/components/bilingual snapshots; preview/print parity test green.
- [ ] All repo gates green: `check:tsc` 0, tests, lint, schema-drift, migration manifest rows for all 5 migrations.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Phase 1 deliverable drift (this plan pins names Phase 1 must ship: `issue_tax_document` stub marker, `regimes/types.ts` exports, `tenants.country_pack_version`) | Entry-criteria checklist runs BEFORE WP-1; any mismatch is a one-line rename in Tasks 5/17/18 — resolve against the live `pg_get_functiondef`/exports, never assume |
| Deleting legacy builders breaks an unnoticed consumer | Task 10 Step 2 grep gate (`buildInvoiceDocument\|buildQuoteDocument\|buildCreditNoteDocument` = 0 hits) + `check:tsc` 0 + full-suite run before the commit |
| Country layer changes byte-output for the facts-null path (breaks M-E parity heritage) | `resolveCountryLayer` returns `undefined` on null facts (identity in the cascade); Task 8 Step 4 runs the full parity suites; Task 27 asserts en byte-parity for a facts-null cell |
| `record_stock_sale` signature change and PostgREST overload ambiguity | The 2-arg function is DROPped in the same migration (Task 25) — exactly one function remains; probe asserts count=1 |
| Requirement gate mis-evaluates and blocks legitimate issuance in production demo | Gate active only when `country_pack_version` pinned; `evaluate_document_requirements` is STABLE and probed standalone (Task 17 Step 3) with positive/negative/B2C cases before the RPC consumes it |
| RPC body splice against an unfetched Phase 1 definition | Tasks 18/25 Step 1 mandates `pg_get_functiondef` fetch first; edits are anchored insertions with complete blocks; behavioral probes (not diffing) are the acceptance evidence |
| `geo_countries` missing `decimal_separator`/`thousands_separator`/`address_format` values for some GCC rows | `countryTemplateOverride` treats null separators as engine defaults (comma/dot) — rendering degrades to today's shape, never breaks; seed gaps are pack-authoring work (Phase 3 Studio) |
| Preview/preview-hook divergence from adapter logic (two implementations of band/title rules) | Both consume the same `profile.documentTitle` + facts fields; Task 16 parity test is mutation-checked so silent divergence fails CI |
| Oman ISO subdivision codes wrong in the seed | Codes are ISO 3166-2:OM; the seed is `ON CONFLICT DO NOTHING` and rows are soft-deletable/correctable via a follow-up additive migration — no document stores the code, only the FK |

## Exit Criteria (roadmap row, made measurable)

1. **"GCC-6 + any simple-VAT country render fully compliant B2B tax invoices by DEFAULT"** — Task 27 matrix green for OM/AE/SA/BH/KW/QA/GB: correct title ceremony, registration band with country-correct label, buyer tax number + address rows, component tax rows from stored lines, bilingual/RTL for the Arabic states, country date/decimal formats — all with zero tenant Studio configuration (the country layer + profile do it).
2. **"Preview/print parity tests green"** — Task 16 in CI, mutation-checked.
3. Requirement gate live and REST-unskippable (Task 18 probes a/b/c/d recorded in the PR).
4. POS parity live (WP-8 verification query outputs recorded).
5. All 5 migrations in the manifest; `check:tsc` 0; full suite green; legacy financial builders and their flags gone.

## Estimated Effort

| WP | Scope | Engineer-days |
|---|---|---|
| WP-1 | 3 migrations + seeds + types regen | 1.5 |
| WP-2 | Profile plugin, resolver, facts/override extension, formatters | 2.5 |
| WP-3 | R4 sweep (8 paths), credit-note adapter + built-in, cutover + deletion + golden re-baseline | 3.0 |
| WP-4 | dataFetcher, two adapters, previews, hook, panels/drawer, parity test | 4.0 |
| WP-5 | Evaluator fn + RPC v2 + probes + issuance UI | 2.5 |
| WP-6 | Subdivision service, AddressFields, 3 form integrations, country-order rendering | 2.0 |
| WP-7 | Unit service, 5 persistence sites + conversions, 3 form surfaces | 2.0 |
| WP-8 | Stock-sale migration + kernel assembly + POS modal | 2.5 |
| WP-9 | Matrix, RTL snapshots, M-I guards | 1.5 |
| **Total** | | **21.5 engineer-days (~3 weeks for one engineer + review, matching the roadmap's 3-wk size)** |
