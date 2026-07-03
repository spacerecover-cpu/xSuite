# Phase 4 — India Pack (Multi-Component Proof) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship India as a `statutory_ready` country pack that proves the fiscal kernel parameterizes instead of forking — CGST/SGST/IGST splitting, GSTIN registrations, HSN/UQC validation, fiscal-year numbering, inclusive B2C with whole-rupee rounding, GSTR-3B/GSTR-1 composers, TDS withholding, IRN artifact generation, lakh grouping and indian-scale words — with every statutory fixture externally validated by a qualified Indian CA before the machine gate flips `statutory_ready`.

**Architecture:** India is **data + thin parameter objects** over the Phase 1 kernel: `in_gst` is a `split_by_place_of_supply` parameterization of `computeDocumentTax` (zero bespoke tax math), rates/requirements/rounding/numbering/words-scale are pack rows and registry keys, and the composers/transport are new plugin registrations on the Phase 1 registry. The only genuinely new engine surfaces are the GSTR return composers, the IRN artifact builder, and the TDS extension inside `record_payment` — everything else must demonstrably flow through existing kernel primitives (`allocateLargestRemainder`, `backOutInclusive`, `roundMoneyWith`) driven by `geo_country_tax_rates` + pack data.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query v5, Supabase (Postgres 15, RLS, SECURITY DEFINER RPCs, Deno edge functions), Vitest 4 (node + jsdom projects, TZ pinned Asia/Dubai), pdfmake, zod.

**Entry criteria (must all be merged/true before Task 1):**
- Phase 0 merged: `tenantToday(timezone)` exists (`src/lib/tenantToday.ts`); `vat_records` carries `currency`/`exchange_rate`/`vat_amount_base`/`taxable_amount_base`/`tax_period`; precision widening done (`unit_price numeric(19,4)`, rates `numeric(7,4)`, FX `numeric(20,10)`); `record_payment` USD-default is a hard error.
- Phase 1 merged: `src/lib/regimes/types.ts` (all contract interfaces incl. `TaxStrategy`, `ReturnComposer`, `NumberingPolicy`, `DocumentComplianceProfile`, `EInvoicingTransport`, `RuleTrace`, row aliases `LegalEntityTaxRegistrationRow`/`GeoCountryTaxRateRow`/`VatRecordRow`), `src/lib/regimes/registry.ts` (`registerRegimePlugin`, `resolveTaxStrategy`, `resolveReturnComposer`, `resolveNumberingPolicy`, `resolveDocumentProfile`, `resolveEInvoicingTransport`, `listRegisteredCapabilities`), `src/lib/tax/kernel/` (`computeDocumentTax`, `backOutInclusive`), `financialMath.allocateLargestRemainder` + `roundMoneyWith`, `src/lib/tax/publishGate.ts` (`runPublishGate`), tables `geo_country_tax_rates`, `document_tax_lines`, `legal_entity_tax_registrations`, `einvoice_submissions`, `master_engine_capabilities`, `master_country_pack_versions`, `master_country_pack_tests`, RPCs `issue_tax_document` (+ `p_dry_run`), `get_next_number` v2 (`{FY}`/`{SEQ:n}` tokens, `reset_basis`, `fiscal_year_anchor`, `max_length`), `preview_number_format`; eslint rules `xsuite/no-country-branching-outside-regimes` + `xsuite/no-adhoc-money-allocation`; CI `statutory-fixtures` job; the five `regime.*` registry keys + `tax.rounding_policy` + `format.amount_words_scale` pack keys.
- Phase 2 merged: `master_document_requirements` evaluated in-RPC; `master_unit_codes` table (UN/ECE Rec-20 + `uqc_code` column); structured address columns (`address_line1/2`, `subdivision_id`, `postal_code`) on `customers_enhanced`/`companies`/`suppliers`; `unit_code`/`item_code`/`tax_treatment`/`treatment_reason_code` persisted on `invoice_line_items`/`quote_items`/`credit_note_items`/`stock_sale_items`; `DocumentComplianceProfile` consumed by the PDF adapters and React previews; `tax_inclusive` toggle + treatment selector + dry-run component-row totals panel in the document form modals.
- Phase 3 merged: `ReturnComposer` live (`gcc_return`), `tax_return_lines` table, `vat_returns.regime_key`/`filing_frequency`/`period_anchor`, `master_numbering_policies` table, Country Authoring Studio + `publish_country_pack`/`create_country_pack_draft`/`submit_country_pack_for_review`/`upsert_country_tax_rate`/`upsert_document_requirement`/`upsert_country_pack_test` RPCs, fiscal-template numbering in production.
- Live DB facts (verified 2026-07-02): `geo_subdivisions` exists with 0 rows (12 cols incl. `tax_authority_code`); `geo_countries` India row is `formatting_ready` (INR ₹ 2dp before, GST 18.00%, GSTIN regex + placeholder seeded, `digit_grouping` '3;2', DD/MM/YYYY, Asia/Kolkata, en-IN, FY 04-01); `legal_entities` exists with `tax_identifier`; pg_cron 1.6.4 installed.

## Global Constraints

Verbatim repo rules every task inherits:

- **Additive-only migrations**: no `DROP TABLE`, no `DROP COLUMN`, no `DELETE FROM` production data. Soft deletes only (`deleted_at = now()`).
- **Every new tenant-scoped table** gets: `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`; `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`; RESTRICTIVE policy `{table}_tenant_isolation` (`tenant_id = get_current_tenant_id() OR is_platform_admin()`); PERMISSIVE operation policies (financial writes gated `has_role('accounts')`, DELETE gated `has_role('admin')`); `set_<table>_tenant_and_audit` trigger; `idx_<table>_tenant_id` partial index `WHERE deleted_at IS NULL`; `deleted_at timestamptz DEFAULT NULL`.
- **Global/master tables**: no `tenant_id`; SELECT `USING (true)` for authenticated; INSERT/UPDATE/DELETE `is_platform_admin()` only.
- `maybeSingle()` never `single()` in frontend services.
- `src/types/database.types.ts` is **generated** — never hand-edit; regenerate via `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`) after every migration.
- **Migration discipline per PR**: apply via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) → regen types → update ALL callers → append a row to `supabase/migrations.manifest.md` (markdown table `| version | filename | classification | summary | PR |`) → use `.github/PULL_REQUEST_TEMPLATE/migration.md`.
- `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) must stay at **0 errors** (`scripts/check-tsc.sh` enforces zero).
- PDFs: `pdfmake` only, programmatic builders; PDFs do NOT theme.
- Icons: `lucide-react` only. UI colors: the 14 semantic theme tokens only — no `bg-purple-*`/`bg-indigo-*`/`bg-violet-*`, no brand hexes. Read `DESIGN.md` before any visual change.
- No new npm packages without checking existing packages first (this plan adds **zero** packages).
- Custody/audit tables append-only; `chain_of_custody` 'financial' events preserved verbatim (v1.2.0 invariant); `einvoice_submissions` append-only posture (REVOKE + guard trigger) — transitions only via the sanctioned SECURITY DEFINER RPC (Task 25).
- Never hardcode currency symbols, tax labels, or date formats — `TenantConfigContext` / pack data only.
- No `if (countryCode === ...)` outside `src/lib/regimes/` (`xsuite/no-country-branching-outside-regimes`); no ad-hoc proportional money splits (`xsuite/no-adhoc-money-allocation` — `allocateLargestRemainder` only).
- Edge functions: Deno runtime, `npm:` imports, CORS headers `Content-Type, Authorization, X-Client-Info, Apikey`, **never share code between edge functions or with `src/`** (contract tests pin payload parity instead).
- Work lands on a fresh branch cut from `main` (`feat/localization-phase4-india-pack`); PRs are squash-merged.

---

## Objectives

1. **Prove parameterization**: `in_gst` ships as a `TaxStrategy` whose `compute()` is a one-line delegation to `computeDocumentTax` — intra-state CGST+SGST vs inter-state IGST decided by the kernel's `split_by_place_of_supply` scheme mode from `geo_country_tax_rates` data, never by India-specific arithmetic.
2. **Statutory data pack**: Indian states/UTs with GST state codes in `geo_subdivisions`; slab rate rows (5/12/18/28 as CGST/SGST/IGST components); document requirements (buyer GSTIN B2B, place of supply, HSN/SAC, UQC — all `block`); `in_irn` e-invoice regime row with `mandatory_from` + turnover thresholds; FY numbering policy `INV/{FY}/{SEQ:4}` (04-01 anchor, 16-char cap); rounding policy `{half_up, line, cash_increment: 1}`; `format.amount_words_scale = 'indian'`.
3. **GSTIN capture**: multi-registration into `legal_entity_tax_registrations` (regex from pack, state-code cross-check against the subdivision, scheme standard/composition/unregistered) — at onboarding (JurisdictionStep) and post-onboarding (Settings management UI), threaded through `provision-tenant`.
4. **Inclusive B2C + cash rounding**: 18/118 back-out and largest-remainder component split reconstituting the agreed gross exactly; whole-rupee `cash_increment: 1` emitting an explicit `out_of_scope` adjustment line — all as **pack data**, proven by golden fixtures.
5. **Filable returns**: `gstr` ReturnComposer — GSTR-3B monthly on Apr–Mar boundaries in Asia/Kolkata; GSTR-1 HSN summary aggregating quantity+UQC+taxable+tax per `item_code` into `tax_return_lines`.
6. **TDS withholding**: `record_payment` accepts `withheld_amount` + `certificate_ref`, settles the receivable in full, posts a TDS-credit ledger row (`payment_withholdings`).
7. **IRN transport, artifact-generation-first**: `in_irn` `EInvoicingTransport` builds the version-pinned INV-01 payload + sha256 into `einvoice_submissions` at issuance; sandbox IRP clearance in edge function `in-irp-submit` behind an env flag; printed QR reads only the SEALED artifact; mandated tenants honestly flagged until clearance is live.
8. **Display correctness**: '3;2' lakh/crore digit grouping in-app and in PDFs; crore/lakh indian-scale amount-in-words.
9. **External CA validation as a hard gate**: a generated fixture handoff package (inputs + computed expecteds + statutory citations), a recorded sign-off workflow, and CI + DB publish-gate wiring so India **cannot** flip `statutory_ready` with unvalidated fixtures.

## Non-goals

- **Platform subscription billing** — separate workstream (owner decision E4). Reuses these primitives; never appears in this plan.
- **Production IRP clearance** — this phase ships artifact generation + **sandbox** IRP behind `INDIA_IRP_ENABLED`; production credentials/waves are a follow-on operational task after the sandbox contract is proven.
- **Composition-scheme tax computation / Bill of Supply document type** — the `scheme='composition'` registration value is captured and stored (contract vocabulary), but composition levy math and the Bill of Supply title variant are deferred pending CA guidance; a composition registration renders the standard profile with the seller flagged (fixture documents the deferral).
- **GST CESS component** — the rate-table model supports it (one more `component_code 'CESS'` row later); no cess rows are seeded and no fixture exercises it this phase.
- **E-way bills, TDS/TCS statutory returns (26Q/GSTR-7), GSTR-2B ITC reconciliation, IRP B2C dynamic QR** — out of scope; the data captured this phase (HSN, UQC, place of supply, withholding rows) is what makes them possible later.
- **`expected_withholding` estimation on documents** — the `TaxComputation.expectedWithholding` field exists (Phase 1 contract); `in_gst` returns `null` this phase because the buyer-side TDS section/rate matrix (194C/194J thresholds) is exactly the kind of statutory content the CA validation loop must author first. The **payment-side capture** (the filable half) ships fully (WP-7).
- **Mixed-slab single documents** — this phase resolves ONE slab per document: the issuance path passes the document-scoped slab's CGST/SGST/IGST rows as `ctx.rates` (each golden fixture carries exactly one slab's rows), because the contract-frozen `TaxableLine` carries **no** per-line slab / `applies_to` / `tax_category` selector. An invoice mixing an 18% service line with a 5% goods line (the §1.17 mixed-rate gap) is therefore out of scope this phase. Supporting it needs a per-line tax-class field on `TaxableLine`/`TaxContext` — a Phase-1 contract extension — plus the HSN→slab lookup table; both are deferred. `applies_to` on `geo_country_tax_rates` is the class hook a future per-line selector will match against.
- **UI instrumentation sweep / RTL logical-properties sweep** — owned by the separate i18n Phase 4a/4b tracks.

## Architecture Decisions

**AD-1: GST components are country-level rate rows; the scheme mode assigns jurisdiction, not the rate table.**
Decision: seed CGST/SGST/IGST as `geo_country_tax_rates` rows with `subdivision_id NULL` (GST rates are nationally uniform per slab); the kernel's `split_by_place_of_supply` mode picks {CGST,SGST} vs {IGST} by comparing the seller registration's `subdivision_id` with `placeOfSupplySubdivisionId`, and stamps `jurisdiction_ref` on the computed SGST/IGST lines from the place of supply.
Rationale: 36 states × 4 slabs × 3 components as subdivision rows would be 400+ redundant rows encoding zero information (SGST is the same 9% everywhere); the subdivision dimension stays reserved for genuinely subdivision-varying regimes (US Phase 5).
Alternative rejected: per-state SGST rows — pure duplication, and a Karnataka SGST row would still need the scheme mode to know it applies only intra-state.

**AD-2: Slabs are `applies_to` classes; the Phase-1 partial unique index is widened to include `applies_to`.**
Decision: the four GST slabs are `applies_to ∈ ('gst_slab_5','gst_slab_12','gst_slab_18','gst_slab_28')` with `tax_category` mapping {18,28}→'standard', {5,12}→'reduced', plus category 'zero' and 'exempt' rows. Because two 'reduced' CGST rows (2.5000 and 6.0000) collide on the Phase-1 unique `(country_id, subdivision_id, component_code, tax_category, valid_from)`, Task 2 recreates that partial unique as `(country_id, COALESCE(subdivision_id,'00000000-0000-0000-0000-000000000000'::uuid), component_code, tax_category, COALESCE(applies_to,''), valid_from)`.
Rationale: India has four concurrent slabs in the same category vocabulary; `applies_to` is the contract's designated "product/service-class hook (HSN/SAC class)". Recreating a unique index is additive in effect (no data loss, no behavior change for existing NULL-`applies_to` rows in OM/AE/SA/US). Scope note: because the contract-frozen `TaxableLine` has no per-line slab selector, this phase resolves ONE slab per document — the issuance path passes only that document's slab rows into `ctx.rates`; per-line mixed-slab documents are a Non-goal (see Non-goals) pending a per-line tax-class field.
Alternative rejected: staggering `valid_from` per slab (semantically false effective dates) or new category values (breaks the contract CHECK vocabulary). **This is a deliberate, documented deviation from the Phase-1 contract DDL — flagged in Open Questions for owner ratification; it is a strict widening, never a narrowing.**

**AD-3: TDS credits get a first-class tenant table `payment_withholdings`, not an overload of `financial_transactions`.**
Decision: `record_payment` writes `payments.withheld_amount`/`payments.withholding_certificate_ref` AND inserts a `payment_withholdings` row (payment_id, customer_id, amount, amount_base, certificate_ref, tax_point_date) inside the same transaction.
Rationale: the contract mandates "TDS-credit ledger row posted" without naming a table; a dedicated table gives the accountant a queryable Form-26AS reconciliation surface, keeps the append-only general ledger's column contract untouched, and generalizes to KSA WHT (Phase 5) unchanged.
Alternative rejected: `financial_transactions` rows — its Phase-3 ledger-lockdown column/RPC contract is owned by another surface and a withholding is a receivable-vs-cash timing fact, not a cash movement.

**AD-4: GSTR-1's HSN summary composes from line-item aggregates, not from `vat_records`.**
Decision: `ReturnComposer.compose()` keeps its contract input (`ledgerRows: VatRecordRow[]`) for GSTR-3B; the HSN summary is a sibling export `composeGstr1HsnSummary(rows, startSequence)` fed by a new `fetchHsnLineAggregates(taxPeriods)` service query over `vat_records → invoices → invoice_line_items + document_tax_lines`; both outputs persist into the same `tax_return_lines` (HSN rows carry `quantity` + `unit_code`).
Rationale: the audit (§1.17) is explicit — "Derive HSN/UQC/qty aggregates directly from invoice_line_items for the India return surface; keep vat_* amount-only". The compose() signature is contract-frozen; extending its input would fork every other composer.
Alternative rejected: adding quantity/HSN columns to `vat_records` — pollutes the amount-only ledger every other country files from.

**AD-5: The external-validation gate is generic metadata, not an India special case.**
Decision: every fixture (repo JSON and `master_country_pack_tests.input_document`) may carry `_meta.external_validation {status, validator, credential, reference, signed_off_at}`; the publish gate gains gate ⑤: any test row **carrying** the block must have `status='validated'` or publish fails; the India pack authors ALL its fixtures with the block (initially `pending`).
Rationale: owner decision E1 requires expert validation "before any country's production release" — the mechanism must work for the US SALT review (Phase 5) without another migration; countries without the block (Oman parity fixtures, machine-derived from live data) are unaffected.
Alternative rejected: a new pack-schema registry key (`compliance.external_validation_required`) — extends the contract key vocabulary for what is test-row metadata.

**AD-6: `einvoice_submissions` status transitions happen only through a guarded SECURITY DEFINER RPC.**
Decision: Task 25 ships `transition_einvoice_submission(p_id, p_status, p_authority_reference, p_authority_response)` which validates the legal transition graph (`generated→submitted|held`, `submitted→accepted|rejected|held`, `held→submitted|dead_letter`), sets a transaction-local GUC `app.einvoice_transition`, and a `prevent_einvoice_submission_mutation()` guard trigger that rejects any UPDATE outside that GUC or touching columns other than `(status, authority_reference, authority_response, submitted_at, sealed_at)`; DELETE always rejected; client-role INSERT/UPDATE/DELETE REVOKEd.
Rationale: reconciles the contract's append-only posture with the clearance lifecycle the same way the custody ledger reconciles append-only with sanctioned writers — one auditable writer, no raw path.
Alternative rejected: event-sourced status rows — would fork the Phase-1 table shape mid-program.

**AD-7: The RecordPaymentModal withholding section is universal, not regime-gated.**
Decision: an always-available collapsed "Withholding (TDS/WHT)" section in `RecordPaymentModal`; entering an amount > 0 requires a certificate reference.
Rationale: buyer-side withholding exists in India (TDS), KSA (WHT), and others; gating the UI on `regime.tax === 'in_gst'` would be regime-branching in a component for zero benefit — the DB validates conservation identically either way.
Alternative rejected: profile-driven visibility — `DocumentComplianceProfile` governs documents, not payment entry.

**AD-8: Sandbox IRP behind an edge-function env flag; the printed QR only ever reads the sealed artifact.**
Decision: `in-irp-submit` refuses to run unless `INDIA_IRP_ENABLED === 'true'` and sandbox secrets are present; until a submission row reaches `accepted`, Indian invoices print **no** IRN QR and the invoice detail page shows an honest "IRN pending — e-invoicing mandated from {mandatory_from}" badge computed from `master_einvoice_regimes` + submission status.
Rationale: the walkthrough's non-negotiable — "the capability manifest keeps mandated tenants honestly flagged, never silently non-compliant; the printed QR reads the SEALED artifact so reprints match what the authority cleared".
Alternative rejected: client-side QR from locally recomputed payload — reprint could diverge from the cleared artifact.

## Database Changes

All applied via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`), each followed by types regen + manifest row. Names below are the migration names (timestamps assigned at apply time).

| # | Migration name | Purpose | Tables/functions touched | Task |
|---|---|---|---|---|
| M4-1 | `india_geo_subdivisions_seed` | 37 Indian states/UTs + Other Territory with GST state codes | `geo_subdivisions` (INSERT only) | 1 |
| M4-2 | `india_gst_tax_rates` | Widen rate-table unique to include `applies_to`; seed CGST/SGST/IGST slab rows + zero/exempt | `geo_country_tax_rates` (index recreate + INSERT) | 2 |
| M4-3 | `india_pack_bindings` | India `country_config` regime keys + rounding/words-scale pack data; `master_einvoice_regimes` `in_irn` row; `master_numbering_policies` India rows; `master_unit_codes` UQC mappings; `master_engine_capabilities` rows | `geo_countries` (UPDATE one row's jsonb), `master_einvoice_regimes`, `master_numbering_policies`, `master_unit_codes`, `master_engine_capabilities` (INSERTs) | 3 |
| M4-4 | `india_document_requirements` | 8 requirement rows (invoice + credit_note × buyer GSTIN B2B / place of supply / HSN / UQC), all `block` | `master_document_requirements` (INSERT only) | 4 |
| M4-5 | `payment_withholdings_and_record_payment_tds` | `payments.withheld_amount`/`withholding_certificate_ref`; new tenant table `payment_withholdings` (full tenant discipline); `record_payment` conservation + TDS-credit posting | `payments` (ADD COLUMN), `payment_withholdings` (CREATE), `record_payment` (CREATE OR REPLACE) | 22 |
| M4-6 | `einvoice_submission_transitions` | Guarded transition RPC + mutation-guard trigger for the clearance lifecycle | `transition_einvoice_submission` (CREATE), `prevent_einvoice_submission_mutation` (CREATE OR REPLACE + trigger) | 25 |
| M4-7 | `publish_gate_external_validation` | Gate ⑤: publish fails while any pack test carrying `_meta.external_validation` is not `validated` | `publish_country_pack` (CREATE OR REPLACE, spliced) | 31 |
| M4-8 | `india_pack_tests_seed` | Seed `master_country_pack_tests` from the in_gst golden fixtures (with `_meta.external_validation`) | `master_country_pack_tests` (INSERT only) | 32 |

No table drops, no column drops, no data deletes anywhere in this phase.

## Backend Implementation (summary)

| Module | New/Changed | Contents |
|---|---|---|
| `src/lib/regimes/in_gst/gstin.ts` | New | `validateGSTIN`, `gstStateCodeOf` — pure, regex from pack, state cross-check |
| `src/lib/regimes/in_gst/hsn.ts` | New | `validateHsnSac`, `uqcForUnitCode` — pure format validation + Rec-20→UQC mapping helper |
| `src/lib/regimes/in_gst/index.ts` | New | `inGstStrategy: TaxStrategy` (key `in_gst`, `split_by_place_of_supply`, defaults `{half_up, line}` + `'indian'`) — one-line kernel delegation |
| `src/lib/regimes/in_gst/documents.ts` | New | `inGstInvoiceProfile: DocumentComplianceProfile` (key `in_gst_invoice`: GSTIN bands, forced `item_code`+`unit_code` columns, A4, notations) |
| `src/lib/regimes/in_gst/numbering.ts` | New | `inFiscalNumberingPolicy: NumberingPolicy` (key `in_fiscal_numbering`: `INV/{FY}/{SEQ:4}`, fiscal 04-01, max 16) |
| `src/lib/regimes/in_gst/fixtures.ts` + `fixtures/*.json` | New | `InGstFixtureDocument`, `fixtureToTaxContext`, 6 golden fixtures with `_meta.external_validation` + statutory citations |
| `src/lib/regimes/gstr/periods.ts` | New | `gstrPeriodBounds` (monthly Apr–Mar, Asia/Kolkata, date-string math), `fiscalYearLabel` |
| `src/lib/regimes/gstr/index.ts` | New | `gstrComposer: ReturnComposer` (key `gstr`) — GSTR-3B boxes from `VatRecordRow[]`; `CountryConfigError` on base≠jurisdiction |
| `src/lib/regimes/gstr/hsnSummary.ts` | New | `HsnLineAggregate`, `composeGstr1HsnSummary` |
| `src/lib/regimes/in_irn/payload.ts` + `index.ts` | New | INV-01 v1.1 payload builder + `inIrnTransport: EInvoicingTransport` (regimeClass `clearance_api`) |
| `src/lib/tax/hash.ts` | Consume (Phase 3) | `sha256Hex` (created in Phase 3) — imported here, NOT recreated in Phase 4 |
| `src/lib/regimes/register.ts` | Modify | Register the five new plugins (tax/documents/numbering/return/einvoice) |
| `src/lib/taxRegistrationService.ts` | New | CRUD over `legal_entity_tax_registrations` (soft delete, `maybeSingle`) |
| `src/lib/einvoiceService.ts` | New | `fetchLatestEinvoiceSubmission`, `getEinvoiceComplianceStatus` |
| `src/lib/geoCountryService.ts` | Modify | `listCountrySubdivisions(countryId)` |
| `src/lib/vatService.ts` | Modify | `fetchHsnLineAggregates`, `saveTaxReturnLines` |
| `src/lib/paymentsService.ts` | Modify | `createPayment` gains optional `withholding` param → `p_payment.withheld_amount`/`certificate_ref` |
| `src/lib/format.ts` | Modify | `groupIntegerDigits` + `formatCurrencyWithConfig` honors `digitGrouping '3;2'` |
| `src/lib/pdf/utils.ts` | Modify | `formatEngineMoney` gains `digitGrouping` option |
| `src/lib/pdf/engine/amountInWords.ts` | Modify | `numberToWordsEnIndian`, `amountInWordsEn(..., scale)` |
| `src/lib/pdf/engine/countryConfig.ts` + adapters | Modify | thread `amountWordsScale` from pack data into the words call sites |
| `supabase/functions/in-irp-submit/index.ts` | New | Sandbox IRP clearance behind `INDIA_IRP_ENABLED`; contract-tested against the src builder |
| `supabase/functions/provision-tenant/index.ts` | Modify | `subdivision_id` in request; primary `legal_entity_tax_registrations` row insert (fail-loud) |
| `scripts/country-packs/generate-ca-handoff.ts` | New | CA validation handoff package generator |

## Frontend Implementation (summary)

| Surface | New/Changed | Contents |
|---|---|---|
| `src/pages/auth/onboarding/steps/JurisdictionStep.tsx` | Modify | State/UT selector (when the country has tax subdivisions) + GSTIN state-code cross-check |
| `src/pages/auth/onboarding/constants.ts` + `hooks/useOnboardingFlow.ts` | Modify | `subdivisionId` in `OnboardingFormData`, schema, submit payload |
| `src/pages/settings/TaxRegistrationsSettings.tsx` | New | Registrations manager: list, add (validated GSTIN + state), end-date, set-primary |
| `src/components/financial/RecordPaymentModal.tsx` | Modify | Collapsed "Withholding (TDS/WHT)" section: amount + certificate ref; allocation conservation includes withheld |
| `src/components/financial/EinvoiceComplianceBadge.tsx` | New | Honest IRN status badge (pending/accepted/rejected/not mandated) on invoice detail |
| Returns UI (`src/pages/financial/VATAuditPage.tsx` return sections) | Modify (light) | GSTR box vocabulary renders from `tax_return_lines` incl. HSN summary rows (generic Phase-3 renderer + labels) |

## APIs & Services (exact signatures this phase creates/changes)

```typescript
// src/lib/regimes/in_gst/gstin.ts
export interface GstinCheck { ok: boolean; error: string | null; stateCode: string | null; }
export function validateGSTIN(
  gstin: string,
  packRegex: string | null,
  subdivision: { code: string; tax_authority_code: string | null } | null,
): GstinCheck;
export function gstStateCodeOf(gstin: string): string | null;

// src/lib/regimes/in_gst/hsn.ts
export function validateHsnSac(code: string): { ok: boolean; error: string | null };
export function uqcForUnitCode(unitCode: string, units: Array<{ code: string; uqc_code: string | null }>): string;

// src/lib/regimes/in_gst/index.ts
export const inGstStrategy: TaxStrategy;                       // key 'in_gst', version '1.0.0'

// src/lib/regimes/in_gst/documents.ts
export const inGstInvoiceProfile: DocumentComplianceProfile;   // key 'in_gst_invoice', version '1.0.0'

// src/lib/regimes/in_gst/numbering.ts
export const inFiscalNumberingPolicy: NumberingPolicy;         // key 'in_fiscal_numbering', version '1.0.0'

// src/lib/regimes/in_gst/fixtures.ts
export interface InGstFixtureDocument { /* Task 7 — the documented fixture input_document shape */ }
export function fixtureToTaxContext(doc: InGstFixtureDocument): TaxContext;

// src/lib/regimes/gstr/periods.ts
export function gstrPeriodBounds(
  filingFrequency: 'monthly' | 'quarterly' | 'annual',
  periodAnchor: string, forDate: string, timezone: string,
): { periodStart: string; periodEnd: string; taxPeriods: string[] };
export function fiscalYearLabel(forDate: string, periodAnchor: string): string;   // '2026-27'

// src/lib/regimes/gstr/index.ts
export const gstrComposer: ReturnComposer;                     // key 'gstr', version '1.0.0'

// src/lib/regimes/gstr/hsnSummary.ts
export interface HsnLineAggregate {
  itemCode: string; unitCode: string | null; quantity: number;
  taxableBase: number; componentTaxBase: Record<string, number>;
}
export function composeGstr1HsnSummary(rows: HsnLineAggregate[], startSequence: number): ReturnBoxLine[];

// src/lib/regimes/in_irn/index.ts
export const inIrnTransport: EInvoicingTransport;              // key 'in_irn', regimeClass 'clearance_api'

// sha256Hex is created in Phase 3 at src/lib/tax/hash.ts and imported here — NOT redeclared in Phase 4.

// src/lib/taxRegistrationService.ts
export interface TaxRegistration { /* row alias of legal_entity_tax_registrations */ }
export async function listTaxRegistrations(legalEntityId?: string): Promise<TaxRegistrationRow[]>;
export async function createTaxRegistration(input: {
  legal_entity_id: string; country_id: string; subdivision_id: string | null;
  tax_number: string; scheme: 'standard' | 'composition' | 'unregistered';
  registered_from: string; is_primary: boolean;
}): Promise<TaxRegistrationRow>;
export async function endTaxRegistration(id: string, registeredTo: string): Promise<void>;
export async function setPrimaryTaxRegistration(id: string, legalEntityId: string): Promise<void>;

// src/lib/einvoiceService.ts
export async function fetchLatestEinvoiceSubmission(documentId: string): Promise<EinvoiceSubmissionRow | null>;
export type EinvoiceComplianceStatus =
  | { kind: 'not_mandated' }
  | { kind: 'pending'; mandatoryFrom: string | null }
  | { kind: 'accepted'; irn: string; signedQr: string | null }
  | { kind: 'rejected'; reason: string | null };
export async function getEinvoiceComplianceStatus(invoiceId: string): Promise<EinvoiceComplianceStatus>;

// src/lib/geoCountryService.ts (addition)
export interface CountrySubdivision {
  id: string; code: string; name: string;
  subdivision_type: string | null; tax_authority_code: string | null;
}
// geoCountryService.listCountrySubdivisions(countryId: string): Promise<CountrySubdivision[]>

// src/lib/vatService.ts (additions)
export async function fetchHsnLineAggregates(taxPeriods: string[]): Promise<HsnLineAggregate[]>;
export async function saveTaxReturnLines(vatReturnId: string, boxes: ReturnBoxLine[]): Promise<void>;

// src/lib/paymentsService.ts — createPayment gains one optional argument (additive, defaulted)
export const createPayment: (
  payment: Omit<Payment, 'id' | 'payment_number' | 'created_at' | 'updated_at'>,
  allocations?: Array<{ invoice_id: string; amount: number }>,
  withholding?: { amount: number; certificateRef: string } | null,
) => Promise<Payment>;

// src/lib/format.ts (additions)
export const groupIntegerDigits: (intPart: string, grouping: '3' | '3;2', separator: string) => string;
// CurrencyConfig gains: digitGrouping: '3' | '3;2'   (src/types/tenantConfig.ts)

// src/lib/pdf/engine/amountInWords.ts (additive param)
export function numberToWordsEnIndian(value: number): string;
export function amountInWordsEn(amount: number, currency?: string, decimals?: number, scale?: 'western' | 'indian'): string;
```

```sql
-- RPC signature changes (all SECURITY DEFINER, anon REVOKEd)
record_payment(p_payment jsonb, p_allocations jsonb) RETURNS payments
  -- UNCHANGED signature; p_payment gains keys 'withheld_amount' (numeric) and 'certificate_ref' (text)
transition_einvoice_submission(p_id uuid, p_status text,
  p_authority_reference text DEFAULT NULL, p_authority_response jsonb DEFAULT NULL) RETURNS einvoice_submissions   -- NEW
publish_country_pack(p_country_id uuid, p_version int) RETURNS jsonb
  -- UNCHANGED signature; gate JSON gains "external_validation": { "pass": bool, "unvalidated": int }
```

---

## File-by-File Implementation Tasks

Tasks are numbered globally (1–33, plus the inserted Task 25b in WP-8) and grouped into Work Packages. **Each Work Package = one PR-able unit** with its own verification. Branch: `feat/localization-phase4-india-pack` cut fresh from `main` (WP-1); subsequent WPs may stack or land sequentially after review — never reuse a merged branch.

---

### Work Package WP-1 — India Statutory Data Foundation (Tasks 1–4, one migration PR)

Everything downstream (strategy, forms, composers, publish) reads this data. Pure migrations + SQL assertions; no TS changes except the generated types.

### Task 1: Seed Indian states/UTs with GST state codes into `geo_subdivisions`

**Files:**
- Migration: `india_geo_subdivisions_seed` (via `mcp__supabase__apply_migration`)
- Modify: `src/types/database.types.ts` (regenerated — no hand edits)
- Modify: `supabase/migrations.manifest.md` (append one row)

**Interfaces:**
- Consumes: existing `geo_subdivisions` table (live, 0 rows; columns `id, country_id, parent_id, code, name, subdivision_type, tax_authority_code, sort_order, is_active, created_at, updated_at, deleted_at`); `geo_countries` India row (`code = 'IN'`).
- Produces: 37 subdivision rows keyed by ISO 3166-2:IN `code` with GST state code in `tax_authority_code` — consumed by Tasks 2, 5, 13, 15 and the kernel's place-of-supply resolution.

- [ ] **Step 1: Probe the failing/absent state (the "failing test" for a seed migration)**

Run via `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
SELECT count(*) AS n FROM geo_subdivisions s
JOIN geo_countries c ON c.id = s.country_id AND c.code = 'IN';
```

Expected: `n = 0` (nothing seeded yet).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `india_geo_subdivisions_seed`, SQL:

```sql
-- India: 36 states/UTs (post-2020 list: code 25 Daman & Diu merged into 26; code 28
-- retired with the 2014 AP bifurcation) + GST '97 Other Territory'. ISO 3166-2:IN in
-- `code`, the 2-digit GST state code in `tax_authority_code` (the GSTIN prefix and the
-- e-invoice/GSTR place-of-supply code). Idempotent: ON CONFLICT DO NOTHING via the
-- anti-join guard. NOTE: this list is part of the CA validation handoff (Task 30).
WITH ind AS (SELECT id FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL),
rows(code, name, subdivision_type, tax_authority_code, sort_order) AS (VALUES
  ('IN-JK', 'Jammu and Kashmir',                          'union_territory', '01', 10),
  ('IN-HP', 'Himachal Pradesh',                           'state',           '02', 20),
  ('IN-PB', 'Punjab',                                     'state',           '03', 30),
  ('IN-CH', 'Chandigarh',                                 'union_territory', '04', 40),
  ('IN-UK', 'Uttarakhand',                                'state',           '05', 50),
  ('IN-HR', 'Haryana',                                    'state',           '06', 60),
  ('IN-DL', 'Delhi',                                      'union_territory', '07', 70),
  ('IN-RJ', 'Rajasthan',                                  'state',           '08', 80),
  ('IN-UP', 'Uttar Pradesh',                              'state',           '09', 90),
  ('IN-BR', 'Bihar',                                      'state',           '10', 100),
  ('IN-SK', 'Sikkim',                                     'state',           '11', 110),
  ('IN-AR', 'Arunachal Pradesh',                          'state',           '12', 120),
  ('IN-NL', 'Nagaland',                                   'state',           '13', 130),
  ('IN-MN', 'Manipur',                                    'state',           '14', 140),
  ('IN-MZ', 'Mizoram',                                    'state',           '15', 150),
  ('IN-TR', 'Tripura',                                    'state',           '16', 160),
  ('IN-ML', 'Meghalaya',                                  'state',           '17', 170),
  ('IN-AS', 'Assam',                                      'state',           '18', 180),
  ('IN-WB', 'West Bengal',                                'state',           '19', 190),
  ('IN-JH', 'Jharkhand',                                  'state',           '20', 200),
  ('IN-OR', 'Odisha',                                     'state',           '21', 210),
  ('IN-CT', 'Chhattisgarh',                               'state',           '22', 220),
  ('IN-MP', 'Madhya Pradesh',                             'state',           '23', 230),
  ('IN-GJ', 'Gujarat',                                    'state',           '24', 240),
  ('IN-DH', 'Dadra and Nagar Haveli and Daman and Diu',   'union_territory', '26', 250),
  ('IN-MH', 'Maharashtra',                                'state',           '27', 260),
  ('IN-KA', 'Karnataka',                                  'state',           '29', 270),
  ('IN-GA', 'Goa',                                        'state',           '30', 280),
  ('IN-LD', 'Lakshadweep',                                'union_territory', '31', 290),
  ('IN-KL', 'Kerala',                                     'state',           '32', 300),
  ('IN-TN', 'Tamil Nadu',                                 'state',           '33', 310),
  ('IN-PY', 'Puducherry',                                 'union_territory', '34', 320),
  ('IN-AN', 'Andaman and Nicobar Islands',                'union_territory', '35', 330),
  ('IN-TG', 'Telangana',                                  'state',           '36', 340),
  ('IN-AP', 'Andhra Pradesh',                             'state',           '37', 350),
  ('IN-LA', 'Ladakh',                                     'union_territory', '38', 360),
  ('IN-OT', 'Other Territory',                            'other_territory', '97', 970)
)
INSERT INTO geo_subdivisions (country_id, code, name, subdivision_type, tax_authority_code, sort_order, is_active)
SELECT ind.id, r.code, r.name, r.subdivision_type, r.tax_authority_code, r.sort_order, true
FROM rows r CROSS JOIN ind
WHERE NOT EXISTS (
  SELECT 1 FROM geo_subdivisions g WHERE g.country_id = ind.id AND g.code = r.code
);
```

- [ ] **Step 3: Assert the seeded state**

`mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM geo_subdivisions s JOIN geo_countries c ON c.id = s.country_id AND c.code='IN') AS total,
  (SELECT tax_authority_code FROM geo_subdivisions WHERE code='IN-KA') AS ka,
  (SELECT tax_authority_code FROM geo_subdivisions WHERE code='IN-MH') AS mh,
  (SELECT count(DISTINCT tax_authority_code) FROM geo_subdivisions s JOIN geo_countries c ON c.id=s.country_id AND c.code='IN') AS distinct_codes;
```

Expected: `total = 37`, `ka = '29'`, `mh = '27'`, `distinct_codes = 37`.

- [ ] **Step 4: Regenerate types + typecheck**

Run `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`), save output over `src/types/database.types.ts`. Then run: `npm run typecheck` — Expected: exit 0, no errors (seed-only migration; types diff should be empty or whitespace-stable).

- [ ] **Step 5: Manifest row + commit**

Append to `supabase/migrations.manifest.md` (fill the applied timestamp version):

```
| <version> | india_geo_subdivisions_seed.sql | Additive | India: 37 geo_subdivisions rows with GST state codes (Phase 4 WP-1) | Phase 4 |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(geo): seed Indian states/UTs with GST state codes into geo_subdivisions"
```

### Task 2: GST slab rate rows in `geo_country_tax_rates` (+ `applies_to`-aware unique)

**Files:**
- Migration: `india_gst_tax_rates`
- Modify: `src/types/database.types.ts` (regen), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `geo_country_tax_rates` (Phase 1, with partial unique on `(country_id, subdivision_id, component_code, tax_category, valid_from)`); Task 1 subdivisions.
- Produces: 14 India rate rows — components `CGST`/`SGST`/`IGST` for `applies_to` slabs `gst_slab_5|12|18|28` plus `zero`/`exempt` category rows — resolved by the kernel at `taxPointDate`. Also the rate-dimension unique index widened to include `applies_to` — the Phase-1 `uq_geo_country_tax_rates_effective` is dropped and recreated as `uq_geo_country_tax_rates_dims` — consumed by all future pack publishes.

- [ ] **Step 1: Probe — demonstrate the Phase-1 unique cannot hold two reduced CGST slabs**

`mcp__supabase__execute_sql` (read-only probes):

```sql
SELECT indexdef FROM pg_indexes
WHERE tablename = 'geo_country_tax_rates' AND indexdef ILIKE '%UNIQUE%';
SELECT count(*) AS n FROM geo_country_tax_rates r
JOIN geo_countries c ON c.id = r.country_id AND c.code = 'IN';
```

Expected: one unique index WITHOUT `applies_to` in its column list; `n = 0` (no India rows yet).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `india_gst_tax_rates`, SQL:

```sql
-- AD-2: widen the rate-dimension unique to include applies_to so multiple slabs can
-- coexist within one tax_category. Strict widening: existing OM/AE/SA/US rows all have
-- applies_to NULL and remain unique. COALESCEs keep NULL dims deduplicated.
DROP INDEX IF EXISTS uq_geo_country_tax_rates_effective;
-- Phase 1 created this unique as uq_geo_country_tax_rates_effective (WITHOUT applies_to).
-- (If the Step-1 probe reveals a different name, drop that name instead — there is exactly
--  one unique index on this table.)
CREATE UNIQUE INDEX uq_geo_country_tax_rates_dims ON geo_country_tax_rates (
  country_id,
  COALESCE(subdivision_id, '00000000-0000-0000-0000-000000000000'::uuid),
  component_code,
  tax_category,
  COALESCE(applies_to, ''),
  valid_from
) WHERE deleted_at IS NULL;

WITH ind AS (SELECT id FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL),
rows(component_code, component_label, tax_category, rate, applies_to, sort_order) AS (VALUES
  -- 18% slab (standard; SAC 9987xx repair/data-recovery services sit here)
  ('CGST', 'CGST', 'standard', 9.0000::numeric,  'gst_slab_18', 10),
  ('SGST', 'SGST', 'standard', 9.0000::numeric,  'gst_slab_18', 20),
  ('IGST', 'IGST', 'standard', 18.0000::numeric, 'gst_slab_18', 30),
  -- 28% slab (standard category, distinct applies_to)
  ('CGST', 'CGST', 'standard', 14.0000::numeric, 'gst_slab_28', 40),
  ('SGST', 'SGST', 'standard', 14.0000::numeric, 'gst_slab_28', 50),
  ('IGST', 'IGST', 'standard', 28.0000::numeric, 'gst_slab_28', 60),
  -- 12% slab (reduced)
  ('CGST', 'CGST', 'reduced',  6.0000::numeric,  'gst_slab_12', 70),
  ('SGST', 'SGST', 'reduced',  6.0000::numeric,  'gst_slab_12', 80),
  ('IGST', 'IGST', 'reduced',  12.0000::numeric, 'gst_slab_12', 90),
  -- 5% slab (reduced)
  ('CGST', 'CGST', 'reduced',  2.5000::numeric,  'gst_slab_5', 100),
  ('SGST', 'SGST', 'reduced',  2.5000::numeric,  'gst_slab_5', 110),
  ('IGST', 'IGST', 'reduced',  5.0000::numeric,  'gst_slab_5', 120),
  -- zero-rated (exports / SEZ, reason code required at line level) + exempt
  ('IGST', 'IGST', 'zero',     0.0000::numeric,  NULL, 130),
  ('IGST', 'IGST', 'exempt',   0.0000::numeric,  NULL, 140)
)
INSERT INTO geo_country_tax_rates
  (country_id, subdivision_id, component_code, component_label, tax_category, rate,
   applies_to, valid_from, data_source, source_version, sort_order)
SELECT ind.id, NULL, r.component_code, r.component_label, r.tax_category, r.rate,
       r.applies_to, DATE '2017-07-01', 'cgst_act_2017', 'phase4-v1', r.sort_order
FROM rows r CROSS JOIN ind
WHERE NOT EXISTS (
  SELECT 1 FROM geo_country_tax_rates g
  WHERE g.country_id = ind.id AND g.component_code = r.component_code
    AND g.tax_category = r.tax_category
    AND COALESCE(g.applies_to,'') = COALESCE(r.applies_to,'')
    AND g.valid_from = DATE '2017-07-01' AND g.deleted_at IS NULL
);
```

- [ ] **Step 3: Assert**

```sql
SELECT
  (SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id=r.country_id AND c.code='IN' AND r.deleted_at IS NULL) AS total,
  (SELECT rate FROM geo_country_tax_rates r JOIN geo_countries c ON c.id=r.country_id AND c.code='IN'
    WHERE r.component_code='CGST' AND r.applies_to='gst_slab_18') AS cgst18,
  (SELECT count(*) FROM geo_country_tax_rates r JOIN geo_countries c ON c.id=r.country_id AND c.code='IN'
    WHERE r.tax_category='reduced' AND r.component_code='CGST') AS reduced_cgst_rows;
```

Expected: `total = 14`, `cgst18 = 9.0000`, `reduced_cgst_rows = 2` (the collision the old unique would have rejected).

- [ ] **Step 4: Regen types + typecheck** — same as Task 1 Step 4. Expected: 0 errors.

- [ ] **Step 5: Manifest row + commit**

```
| <version> | india_gst_tax_rates.sql | Additive | India GST slab rate rows (CGST/SGST/IGST × 5/12/18/28 + zero/exempt); rate unique `uq_geo_country_tax_rates_effective` → `uq_geo_country_tax_rates_dims` widened with applies_to (AD-2) | Phase 4 |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(tax): seed India GST slab rate rows; widen rate unique with applies_to"
```

### Task 3: India pack bindings — regime keys, e-invoice regime row, numbering policy, UQC mappings, capabilities

**Files:**
- Migration: `india_pack_bindings`
- Modify: `src/types/database.types.ts` (regen), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `geo_countries.country_config` jsonb (Country Engine); `master_einvoice_regimes`, `master_numbering_policies`, `master_unit_codes`, `master_engine_capabilities` (Phases 1–3).
- Produces: India resolves `regime.tax='in_gst'`, `regime.documents='in_gst_invoice'`, `regime.numbering='in_fiscal_numbering'`, `regime.einvoice='in_irn'`, `tax.rounding_policy={half_up,line,cash_increment:1}`, `format.amount_words_scale='indian'`; the `in_irn` regime row (`clearance_api`, `mandatory_from`, thresholds); numbering policy rows; UQC mappings on `master_unit_codes`; capability rows `regime.in_gst` / `documents.in_gst_invoice` / `numbering.in_fiscal_numbering` / `return.gstr` / `einvoice.in_irn.artifact` (NOTE: `einvoice.in_irn.clearance` is deliberately NOT inserted here — Task 26 inserts it only when the edge function is deployed, which is what keeps mandated tenants honestly flagged).

- [ ] **Step 1: Probe absent state**

```sql
SELECT
  (SELECT country_config->>'regime.tax' FROM geo_countries WHERE code='IN') AS regime_tax,
  (SELECT count(*) FROM master_einvoice_regimes r JOIN geo_countries c ON c.id=r.country_id AND c.code='IN') AS einv,
  (SELECT count(*) FROM master_numbering_policies p JOIN geo_countries c ON c.id=p.country_id AND c.code='IN') AS numpol,
  (SELECT count(*) FROM master_unit_codes WHERE uqc_code IS NOT NULL) AS uqc_mapped;
```

Expected: `regime_tax` NULL or 'simple_vat' (the coded default — not 'in_gst'), `einv = 0`, `numpol = 0`, note the current `uqc_mapped` count.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `india_pack_bindings`, SQL:

```sql
-- 1) Regime bindings + pack data keys into the Country Engine jsonb bag.
--    All regime.* keys are maxOverrideLayer:'country' in COUNTRY_CONFIG_REGISTRY —
--    tenants cannot forge these.
UPDATE geo_countries
SET country_config = coalesce(country_config, '{}'::jsonb) || jsonb_build_object(
      'regime.tax',                'in_gst',
      'regime.documents',          'in_gst_invoice',
      'regime.numbering',          'in_fiscal_numbering',
      'regime.einvoice',           'in_irn',
      'tax.rounding_policy',       jsonb_build_object('mode','half_up','level','line','cash_increment',1),
      'format.amount_words_scale', 'indian'
    ),
    config_version = coalesce(config_version, 0) + 1
WHERE code = 'IN' AND deleted_at IS NULL;

-- 2) IRN e-invoice regime row. clearance_api class; turnover threshold (₹5 crore
--    aggregate turnover, the notified 2023 threshold — CA-validated in Task 30);
--    mandatory_from is the *platform* activation baseline, not the statutory history.
INSERT INTO master_einvoice_regimes (country_id, code, regime_class, adapter_key, mandatory_from, thresholds, config)
SELECT c.id, 'in_irn', 'clearance_api', 'in_irn', DATE '2026-04-01',
       jsonb_build_object('aggregate_turnover_inr', 50000000),
       jsonb_build_object('schema_version', '1.1', 'environment', 'sandbox')
FROM geo_countries c
WHERE c.code = 'IN' AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM master_einvoice_regimes r WHERE r.country_id = c.id AND r.code = 'in_irn');

-- 3) Fiscal numbering defaults: rule 46(b) — consecutive serial, unique per FY,
--    max 16 characters. 'INV/{FY}/{SEQ:4}' renders exactly 16 ('INV/'+7+'/'+4).
INSERT INTO master_numbering_policies (country_id, scope, format_template, reset_basis, fiscal_year_anchor, max_length)
SELECT c.id, v.scope, v.tpl, 'fiscal_year', '04-01', 16
FROM geo_countries c,
     (VALUES ('invoices', 'INV/{FY}/{SEQ:4}'), ('quote', 'QUO/{FY}/{SEQ:4}')) AS v(scope, tpl)
WHERE c.code = 'IN' AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM master_numbering_policies p WHERE p.country_id = c.id AND p.scope = v.scope);

-- 4) UQC mappings on the Rec-20 units master (Phase 2 table; uqc_code column exists).
--    GSTN UQC list values; services report 'OTH'/'NA' — CA validates in Task 30.
UPDATE master_unit_codes SET uqc_code = m.uqc FROM (VALUES
  ('C62', 'NOS'),   -- unit / number
  ('HUR', 'OTH'),   -- hour (services — no goods UQC)
  ('KGM', 'KGS'),   -- kilogram
  ('MTR', 'MTR'),   -- metre
  ('LTR', 'LTR'),   -- litre
  ('SET', 'SET'),   -- set
  ('GRM', 'GMS'),   -- gram
  ('MTK', 'SQM')    -- square metre
) AS m(code, uqc)
WHERE master_unit_codes.code = m.code AND master_unit_codes.uqc_code IS DISTINCT FROM m.uqc;

-- 5) Capability manifest rows (publish gate ②). The clearance transport capability is
--    intentionally ABSENT until Task 26 deploys the edge function (honest degradation).
INSERT INTO master_engine_capabilities (capability_key, kind, min_engine_version)
SELECT v.k, v.kind, '1.0.0' FROM (VALUES
  ('regime.in_gst',                 'regime_adapter'),
  ('documents.in_gst_invoice',      'regime_adapter'),
  ('numbering.in_fiscal_numbering', 'regime_adapter'),
  ('return.gstr',                   'regime_adapter'),
  ('einvoice.in_irn.artifact',      'regime_adapter'),
  ('scheme.split_by_place_of_supply','scheme_mode'),
  ('speller.indian',                'speller_scale')
) AS v(k, kind)
WHERE NOT EXISTS (SELECT 1 FROM master_engine_capabilities e WHERE e.capability_key = v.k);
```

- [ ] **Step 3: Assert**

```sql
SELECT
  (SELECT country_config->>'regime.tax' FROM geo_countries WHERE code='IN') AS rt,
  (SELECT country_config->'tax.rounding_policy'->>'cash_increment' FROM geo_countries WHERE code='IN') AS cash_inc,
  (SELECT regime_class FROM master_einvoice_regimes r JOIN geo_countries c ON c.id=r.country_id AND c.code='IN' AND r.code='in_irn') AS cls,
  (SELECT format_template FROM master_numbering_policies p JOIN geo_countries c ON c.id=p.country_id AND c.code='IN' AND p.scope='invoices') AS tpl,
  (SELECT uqc_code FROM master_unit_codes WHERE code='C62') AS uqc,
  (SELECT count(*) FROM master_engine_capabilities WHERE capability_key LIKE '%in_gst%' OR capability_key LIKE '%in_irn%' OR capability_key='return.gstr') AS caps,
  (SELECT count(*) FROM master_engine_capabilities WHERE capability_key='einvoice.in_irn.clearance') AS clearance_absent;
```

Expected: `rt='in_gst'`, `cash_inc='1'`, `cls='clearance_api'`, `tpl='INV/{FY}/{SEQ:4}'`, `uqc='NOS'`, `caps >= 4`, `clearance_absent = 0`.

- [ ] **Step 4: Regen types + typecheck** — as Task 1 Step 4. Expected: 0 errors.

- [ ] **Step 5: Manifest row + commit**

```
| <version> | india_pack_bindings.sql | Additive | India regime bindings + rounding/words pack data, in_irn regime row, FY numbering policies, UQC mappings, capability rows | Phase 4 |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(tax): India pack bindings — regime keys, in_irn regime row, FY numbering, UQC map, capabilities"
```

### Task 4: India document requirements (the in-RPC issuance gate rows)

**Files:**
- Migration: `india_document_requirements`
- Modify: `src/types/database.types.ts` (regen), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `master_document_requirements` (Phase 2; columns `country_id, doc_type, field_key, condition jsonb, level, message_i18n, effective_from, pack_version_id`); the contract's closed condition vocabulary (`{"all":[{"fact":...,"op":...,"value":...}]}`) and `field_key` vocabulary.
- Produces: 8 `block` rows evaluated inside `issue_tax_document` — an Indian B2B invoice/credit note cannot be issued without buyer GSTIN, place of supply, HSN/SAC (`line.item_code`) and UQC (`line.unit_code`). Consumed by Tasks 7 (fixtures), 11 (form errors), 32 (publish).

- [ ] **Step 1: Probe absent state**

```sql
SELECT count(*) AS n FROM master_document_requirements r
JOIN geo_countries c ON c.id = r.country_id AND c.code = 'IN';
```

Expected: `n = 0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `india_document_requirements`, SQL:

```sql
-- CGST Rules rule 46: B2B tax invoices must carry the recipient's GSTIN and the place
-- of supply; rule 46(g)+(h): HSN/SAC and quantity-with-unit per line. condition NULL =
-- unconditional. buyer GSTIN blocks only when buyer_is_business (B2C walk-ins are legal
-- without one). All levels 'block' — the walkthrough's unskippable REST gate.
WITH ind AS (SELECT id FROM geo_countries WHERE code = 'IN' AND deleted_at IS NULL),
rows(doc_type, field_key, condition, level, message) AS (VALUES
  ('invoice',     'buyer_tax_number',
    '{"all":[{"fact":"buyer_is_business","op":"eq","value":true}]}'::jsonb,
    'block', 'Buyer GSTIN is required for B2B GST invoices'),
  ('invoice',     'place_of_supply_subdivision_id', NULL::jsonb,
    'block', 'Place of supply (state) is required on GST invoices'),
  ('invoice',     'line.item_code',                 NULL::jsonb,
    'block', 'HSN/SAC code is required on every line of a GST invoice'),
  ('invoice',     'line.unit_code',                 NULL::jsonb,
    'block', 'A unit (UQC) is required on every line of a GST invoice'),
  ('credit_note', 'buyer_tax_number',
    '{"all":[{"fact":"buyer_is_business","op":"eq","value":true}]}'::jsonb,
    'block', 'Buyer GSTIN is required for B2B GST credit notes'),
  ('credit_note', 'place_of_supply_subdivision_id', NULL::jsonb,
    'block', 'Place of supply (state) is required on GST credit notes'),
  ('credit_note', 'line.item_code',                 NULL::jsonb,
    'block', 'HSN/SAC code is required on every line of a GST credit note'),
  ('credit_note', 'line.unit_code',                 NULL::jsonb,
    'block', 'A unit (UQC) is required on every line of a GST credit note')
)
INSERT INTO master_document_requirements (country_id, doc_type, field_key, condition, level, message_i18n, effective_from)
SELECT ind.id, r.doc_type, r.field_key, r.condition, r.level,
       jsonb_build_object('en', r.message), DATE '2026-07-01'
FROM rows r CROSS JOIN ind
WHERE NOT EXISTS (
  SELECT 1 FROM master_document_requirements m
  WHERE m.country_id = ind.id AND m.doc_type = r.doc_type AND m.field_key = r.field_key
);
```

- [ ] **Step 3: Assert (+ end-to-end gate probe)**

```sql
SELECT count(*) AS n, count(*) FILTER (WHERE level = 'block') AS blocks
FROM master_document_requirements r
JOIN geo_countries c ON c.id = r.country_id AND c.code = 'IN';
```

Expected: `n = 8`, `blocks = 8`. (The live behavioral proof — `issue_tax_document(p_dry_run)` returning these as `requirement_failures` — runs in Task 32 once a test tenant/fixture document exists; the RPC's requirement evaluation is Phase 2 machinery, already regression-tested there.)

- [ ] **Step 4: Regen types + typecheck** — as Task 1 Step 4. Expected: 0 errors.

- [ ] **Step 5: Manifest row + commit, then open the WP-1 PR** (use `.github/PULL_REQUEST_TEMPLATE/migration.md`)

```
| <version> | india_document_requirements.sql | Additive | India rule-46 issuance requirements (GSTIN B2B, place of supply, HSN, UQC — all block) | Phase 4 |
```

```bash
git add supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(tax): India document requirement rows (rule 46 issuance gate)"
```

**WP-1 verification:** all four Step-3 assertion blocks return the expected values; `npm run typecheck` = 0; `npm run check:schema-drift` green (types match live).

---

### Work Package WP-2 — The `in_gst` Strategy: Kernel Parameterization Proof (Tasks 5–8, one PR)

### Task 5: GSTIN validator (regex from pack + state-code cross-check)

**Files:**
- Create: `src/lib/regimes/in_gst/gstin.ts`
- Test: `src/lib/regimes/in_gst/gstin.test.ts`

**Interfaces:**
- Consumes: nothing (pure module). The regex arrives at call sites from pack data (`geo_countries.tax_number_format` — already seeded for IN per Appendix A) and the subdivision from Task 1 rows.
- Produces: `validateGSTIN(gstin, packRegex, subdivision): GstinCheck` and `gstStateCodeOf(gstin): string | null` — consumed by Tasks 13, 14, 15.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/gstin.test.ts
import { describe, it, expect } from 'vitest';
import { validateGSTIN, gstStateCodeOf } from './gstin';

const GSTIN_REGEX = '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$';
const KA = { code: 'IN-KA', tax_authority_code: '29' };
const MH = { code: 'IN-MH', tax_authority_code: '27' };

describe('validateGSTIN', () => {
  it('accepts a well-formed GSTIN whose state code matches the subdivision', () => {
    const r = validateGSTIN('29ABCDE1234F1Z5', GSTIN_REGEX, KA);
    expect(r).toEqual({ ok: true, error: null, stateCode: '29' });
  });

  it('rejects a GSTIN whose state prefix contradicts the selected state', () => {
    const r = validateGSTIN('29ABCDE1234F1Z5', GSTIN_REGEX, MH);
    expect(r.ok).toBe(false);
    expect(r.stateCode).toBe('29');
    expect(r.error).toContain('27');
  });

  it('rejects malformed GSTINs (wrong length / lowercase not normalized away / bad check slot)', () => {
    expect(validateGSTIN('29ABCDE1234F1Z', GSTIN_REGEX, KA).ok).toBe(false);   // 14 chars
    expect(validateGSTIN('29ABCDE1234F0Z5', GSTIN_REGEX, KA).ok).toBe(false);  // entity code 0 invalid
  });

  it('normalizes case and whitespace before validating', () => {
    expect(validateGSTIN('  29abcde1234f1z5 ', GSTIN_REGEX, KA).ok).toBe(true);
  });

  it('falls back to the built-in GSTIN pattern when the pack regex is null', () => {
    expect(validateGSTIN('29ABCDE1234F1Z5', null, KA).ok).toBe(true);
  });

  it('skips the state cross-check when no subdivision is supplied', () => {
    expect(validateGSTIN('27ABCDE1234F1Z5', GSTIN_REGEX, null).ok).toBe(true);
  });

  it('gstStateCodeOf extracts the 2-digit prefix or null', () => {
    expect(gstStateCodeOf('29ABCDE1234F1Z5')).toBe('29');
    expect(gstStateCodeOf('x')).toBe(null);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/gstin.test.ts`
Expected: FAIL — `Cannot find module './gstin'` (or "Failed to resolve import").

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/in_gst/gstin.ts
// GSTIN capture validation (Phase 4, WP-2). Pure — the regex is PACK DATA
// (geo_countries.tax_number_format); the state cross-check uses the GST state code
// stored in geo_subdivisions.tax_authority_code (Task 1 seed). The built-in fallback
// pattern exists only for defensive null-pack calls; the pack regex always wins.

export interface GstinCheck {
  ok: boolean;
  error: string | null;
  stateCode: string | null;
}

const FALLBACK_GSTIN_PATTERN = '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$';

export function gstStateCodeOf(gstin: string): string | null {
  const value = gstin.trim().toUpperCase();
  return /^[0-9]{2}/.test(value) ? value.slice(0, 2) : null;
}

export function validateGSTIN(
  gstin: string,
  packRegex: string | null,
  subdivision: { code: string; tax_authority_code: string | null } | null,
): GstinCheck {
  const value = gstin.trim().toUpperCase();
  const pattern = packRegex || FALLBACK_GSTIN_PATTERN;
  if (!new RegExp(pattern).test(value)) {
    return { ok: false, error: 'GSTIN does not match the required format', stateCode: gstStateCodeOf(value) };
  }
  const stateCode = gstStateCodeOf(value);
  if (subdivision?.tax_authority_code && subdivision.tax_authority_code !== stateCode) {
    return {
      ok: false,
      error: `GSTIN state code ${stateCode} does not match the selected state (${subdivision.tax_authority_code})`,
      stateCode,
    };
  }
  return { ok: true, error: null, stateCode };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/gstin.test.ts` — Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/in_gst/gstin.ts src/lib/regimes/in_gst/gstin.test.ts
git commit -m "feat(regimes): GSTIN validator with pack regex + state-code cross-check"
```

### Task 6: `in_gst` TaxStrategy — one-line kernel delegation + registration

**Files:**
- Create: `src/lib/regimes/in_gst/index.ts`
- Modify: `src/lib/regimes/register.ts` (the Phase-1 plugin bootstrap — add registrations)
- Test: `src/lib/regimes/in_gst/index.test.ts`

**Interfaces:**
- Consumes: `TaxStrategy`, `TaxContext`, `TaxComputation`, `RoundingPolicy`, `ScaleSystem` from `src/lib/regimes/types.ts`; `computeDocumentTax` from `src/lib/tax/kernel`; `registerRegimePlugin`/`resolveTaxStrategy` from `src/lib/regimes/registry.ts` (all Phase 1).
- Produces: `inGstStrategy: TaxStrategy` (key `'in_gst'`, version `'1.0.0'`, schemeMode `'split_by_place_of_supply'`) resolvable via `resolveTaxStrategy('in_gst')` — consumed by the issuance path (regime key from Task 3) and Tasks 7–8.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/index.test.ts
import { describe, it, expect } from 'vitest';
import { inGstStrategy } from './index';
import { resolveTaxStrategy } from '../registry';
import '../register'; // plugin bootstrap side-effect registrations

describe('in_gst strategy — parameterization, not fork', () => {
  it('declares the contract identity', () => {
    expect(inGstStrategy.key).toBe('in_gst');
    expect(inGstStrategy.version).toBe('1.0.0');
    expect(inGstStrategy.schemeMode).toBe('split_by_place_of_supply');
    expect(inGstStrategy.defaults.roundingPolicy).toEqual({ mode: 'half_up', level: 'line' });
    expect(inGstStrategy.defaults.scaleSystem).toBe('indian');
  });

  it('is resolvable from the registry after bootstrap', () => {
    expect(resolveTaxStrategy('in_gst')).toBe(inGstStrategy);
  });

  it('compute() is a pure kernel delegation (no India math in the plugin)', async () => {
    // Structural proof: the module source contains no arithmetic beyond the delegation.
    const src = (await import('node:fs')).readFileSync(
      new URL('./index.ts', import.meta.url), 'utf8',
    );
    expect(src).toContain('computeDocumentTax(ctx)');
    expect(src).not.toMatch(/[0-9]+\s*\/\s*2/);       // no hand-halved CGST/SGST
    expect(src).not.toMatch(/CGST|SGST|IGST/);        // component names live in DATA
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/index.test.ts`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/in_gst/index.ts
// India GST = split_by_place_of_supply parameterization of the fiscal kernel.
// THIS FILE MUST STAY MATH-FREE (Task 6 test enforces it, and that test greps this
// module for the component tokens — never name them here): the intra- vs inter-state
// component decision, slab resolution, inclusive back-out, largest-remainder split and
// whole-rupee cash rounding are all kernel behavior driven by geo_country_tax_rates
// rows and the pack's tax.rounding_policy data.
import { computeDocumentTax } from '../../tax/kernel';
import type { TaxStrategy, TaxContext, TaxComputation } from '../types';

export const inGstStrategy: TaxStrategy = {
  key: 'in_gst',
  version: '1.0.0',
  schemeMode: 'split_by_place_of_supply',
  defaults: {
    roundingPolicy: { mode: 'half_up', level: 'line' },
    scaleSystem: 'indian',
  },
  compute(ctx: TaxContext): TaxComputation {
    return computeDocumentTax(ctx);
  },
};
```

Then add to the Phase-1 bootstrap `src/lib/regimes/register.ts` (alongside the existing `simple_vat`/`prefix_numbering`/`generic_invoice`/`no_einvoice` registrations):

```typescript
import { registerRegimePlugin } from './registry';
import { inGstStrategy } from './in_gst';

registerRegimePlugin('tax', inGstStrategy);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/index.test.ts` — Expected: 3 passed. Then `npm run typecheck` — Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/in_gst/index.ts src/lib/regimes/in_gst/index.test.ts src/lib/regimes/register.ts
git commit -m "feat(regimes): in_gst TaxStrategy as split_by_place_of_supply kernel parameterization"
```

### Task 7: Golden fixtures — the statutory evidence corpus

**Files:**
- Create: `src/lib/regimes/in_gst/fixtures.ts`
- Create: `src/lib/regimes/in_gst/fixtures/intra_state_b2b.json`
- Create: `src/lib/regimes/in_gst/fixtures/inter_state_b2b.json`
- Create: `src/lib/regimes/in_gst/fixtures/inclusive_b2c_cash_rounding.json`
- Create: `src/lib/regimes/in_gst/fixtures/export_zero_rated.json`
- Create: `src/lib/regimes/in_gst/fixtures/reverse_charge_inward.json`
- Create: `src/lib/regimes/in_gst/fixtures/reduced_slab_intra_state.json`
- Create: `src/lib/regimes/in_gst/fixtures/cash_rounding_exclusive.json`
- Test: `src/lib/regimes/in_gst/fixtures.test.ts`

**Interfaces:**
- Consumes: `TaxContext`, `TaxableLine`, `GeoCountryTaxRateRow`, `RateContext` types (Phase 1); `inGstStrategy` (Task 6); `runPublishGate`, `PackFixture` from `src/lib/tax/publishGate.ts` (Phase 1); `roundMoney` from `src/lib/financialMath.ts:13`.
- Produces: `InGstFixtureDocument` + `fixtureToTaxContext(doc)` and seven `PackFixture`-shaped JSONs (each with `_meta.external_validation` + `_meta.citations`) — consumed by Tasks 8, 30, 31, 32 and the CI `statutory-fixtures` job.

- [ ] **Step 1: Write the failing test (drives both the mapper and the fixture shape)**

```typescript
// src/lib/regimes/in_gst/fixtures.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fixtureToTaxContext, type InGstFixture } from './fixtures';
import { inGstStrategy } from './index';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixtureFiles = readdirSync(path.join(dir, 'fixtures')).filter((f) => f.endsWith('.json'));

const load = (name: string): InGstFixture =>
  JSON.parse(readFileSync(path.join(dir, 'fixtures', name), 'utf8'));

describe('in_gst golden fixtures', () => {
  it('ships all seven statutory scenarios', () => {
    expect(fixtureFiles.sort()).toEqual([
      'cash_rounding_exclusive.json',
      'export_zero_rated.json',
      'inclusive_b2c_cash_rounding.json',
      'inter_state_b2b.json',
      'intra_state_b2b.json',
      'reduced_slab_intra_state.json',
      'reverse_charge_inward.json',
    ]);
  });

  it('every fixture carries the external-validation block and at least one statutory citation', () => {
    for (const f of fixtureFiles) {
      const fx = load(f);
      expect(fx._meta.external_validation.status, f).toMatch(/^(pending|validated)$/);
      expect(fx._meta.citations.length, f).toBeGreaterThan(0);
    }
  });

  it('intra-state B2B: 2 × ₹45,000 @ slab 18 splits into CGST 9% 8,100 + SGST 9% 8,100 (walkthrough)', async () => {
    const fx = load('intra_state_b2b.json');
    const result = await inGstStrategy.compute(fixtureToTaxContext(fx.input_document));
    const rollups = result.rollups.map((r) => [r.componentCode, r.rate, r.taxAmount]);
    expect(rollups).toEqual([
      ['CGST', 9, 8100],
      ['SGST', 9, 8100],
    ]);
    expect(result.totals.grandTotal).toBe(106200);
    expect(result.trace.schemeMode).toBe('split_by_place_of_supply');
    expect(result.trace.steps.some((s) => s.op === 'scheme_decision')).toBe(true);
  });

  it('inter-state B2B: same supply to Maharashtra yields one IGST 18% 16,200 row', async () => {
    const fx = load('inter_state_b2b.json');
    const result = await inGstStrategy.compute(fixtureToTaxContext(fx.input_document));
    expect(result.rollups.map((r) => [r.componentCode, r.taxAmount])).toEqual([['IGST', 16200]]);
  });

  it('inclusive B2C ₹5,000: back-out 18/118 → base 4237.29, CGST 381.36 + SGST 381.35, gross reconstitutes; whole-rupee adjustment is out_of_scope', async () => {
    const fx = load('inclusive_b2c_cash_rounding.json');
    const result = await inGstStrategy.compute(fixtureToTaxContext(fx.input_document));
    expect(result.totals.taxableBase).toBe(4237.29);
    const cgst = result.rollups.find((r) => r.componentCode === 'CGST');
    const sgst = result.rollups.find((r) => r.componentCode === 'SGST');
    expect((cgst?.taxAmount ?? 0) + (sgst?.taxAmount ?? 0)).toBe(762.71);
    expect([cgst?.taxAmount, sgst?.taxAmount].sort()).toEqual([381.35, 381.36]);
    // gross reconstitutes exactly, then cash rounding (cash_increment: 1) closes to a whole rupee
    expect(result.totals.taxableBase + 762.71).toBe(5000);
    expect(result.totals.roundingAdjustment).toBe(0);   // 5000.00 is already whole
  });

  it('export: zero_rated line yields a 0-amount IGST row with EXPORT_SERVICES reason + notation', async () => {
    const fx = load('export_zero_rated.json');
    const result = await inGstStrategy.compute(fixtureToTaxContext(fx.input_document));
    const zr = result.rollups.find((r) => r.taxTreatment === 'zero_rated');
    expect(zr?.taxAmount).toBe(0);
    expect(zr?.treatmentReasonCode).toBe('EXPORT_SERVICES');
    expect(result.notations.some((n) => n.code === 'EXPORT_SERVICES')).toBe(true);
  });

  it('reverse charge: components emitted at 0 on the document with the RCM notation', async () => {
    const fx = load('reverse_charge_inward.json');
    const result = await inGstStrategy.compute(fixtureToTaxContext(fx.input_document));
    expect(result.rollups.every((r) => r.taxAmount === 0)).toBe(true);
    expect(result.rollups.every((r) => r.taxTreatment === 'reverse_charge')).toBe(true);
    expect(result.notations.some((n) => n.code === 'REVERSE_CHARGE')).toBe(true);
  });

  it('reduced slab (gst_slab_5) resolves CGST 2.5 + SGST 2.5 from data', async () => {
    const fx = load('reduced_slab_intra_state.json');
    const result = await inGstStrategy.compute(fixtureToTaxContext(fx.input_document));
    expect(result.rollups.map((r) => [r.componentCode, r.rate])).toEqual([
      ['CGST', 2.5],
      ['SGST', 2.5],
    ]);
  });

  it('exclusive cash rounding: ₹2,000.34 @18% grosses ₹2,360.40 → whole-rupee ₹2,360 via a -0.40 out_of_scope line', async () => {
    const fx = load('cash_rounding_exclusive.json');
    const result = await inGstStrategy.compute(fixtureToTaxContext(fx.input_document));
    // base + component tax (line-level) is the pre-rounding grand total
    expect(result.totals.grandTotal).toBe(2360.40);
    // cash_increment: 1 closes the gap to the whole rupee — a NON-ZERO adjustment this time
    expect(result.totals.roundingAdjustment).toBe(-0.40);
    expect(result.totals.grandTotal + result.totals.roundingAdjustment).toBe(2360);
    // the gap is closed by an explicit out_of_scope adjustment line, never smeared into tax
    const adjustment = [...result.rollups, ...result.lines].find((l) => l.taxTreatment === 'out_of_scope');
    expect(adjustment).toBeDefined();
    expect(adjustment?.taxAmount).toBe(-0.40);
    // the tax components themselves are untouched (CGST 180.03 + SGST 180.03)
    expect(result.rollups.filter((r) => r.taxTreatment !== 'out_of_scope').map((r) => [r.componentCode, r.taxAmount]))
      .toEqual([['CGST', 180.03], ['SGST', 180.03]]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/fixtures.test.ts`
Expected: FAIL — `Cannot find module './fixtures'`.

- [ ] **Step 3: Implement the fixture shape + mapper**

```typescript
// src/lib/regimes/in_gst/fixtures.ts
// The in_gst fixture contract. `input_document` is self-contained: it embeds the
// facts AND the rate rows so the kernel replay is pure (no I/O) — the same JSON is
// seeded into master_country_pack_tests (Task 32) and replayed by the DB publish
// gate via dry-run issue_tax_document, and by repo CI via runPublishGate('kernel').
import type {
  TaxContext, TaxableLine, GeoCountryTaxRateRow, TaxDocumentType,
} from '../types';

export interface InGstFixtureDocument {
  documentType: TaxDocumentType;
  seller: {
    legalEntityId: string;
    countryId: string;
    subdivisionId: string | null;          // seller registration state (e.g. IN-KA row id)
    taxIdentifier: string | null;          // GSTIN
  };
  buyer: {
    taxNumber: string | null;
    countryId: string | null;
    subdivisionId: string | null;
    isBusiness: boolean;
  };
  taxPointDate: string;                    // 'YYYY-MM-DD'
  placeOfSupplySubdivisionId: string | null;
  lines: TaxableLine[];
  documentDiscount: number;
  taxInclusive: boolean;
  currency: string;                        // 'INR'
  decimals: number;                        // 2
  rates: GeoCountryTaxRateRow[];           // embedded effective-dated rows (Task 2 shape)
  roundingPolicy: { mode: 'half_up' | 'half_even'; level: 'line' | 'document'; cash_increment?: number };
}

export interface InGstFixture {
  name: string;
  input_document: InGstFixtureDocument;
  expected: Record<string, unknown>;
  _meta: {
    external_validation: {
      status: 'pending' | 'validated';
      validator: string | null;            // named CA / firm
      credential: string | null;           // membership no.
      reference: string | null;            // sign-off document ref
      signed_off_at: string | null;
    };
    citations: string[];                   // e.g. 'CGST Act 2017 s.9(1)', 'CGST Rules r.46'
  };
}

export function fixtureToTaxContext(doc: InGstFixtureDocument): TaxContext {
  return {
    documentType: doc.documentType,
    seller: {
      legalEntityId: doc.seller.legalEntityId,
      countryId: doc.seller.countryId,
      subdivisionId: doc.seller.subdivisionId,
      taxIdentifier: doc.seller.taxIdentifier,
      registrations: doc.seller.subdivisionId
        ? [{
            id: 'fixture-reg', tenant_id: 'fixture', legal_entity_id: doc.seller.legalEntityId,
            country_id: doc.seller.countryId, subdivision_id: doc.seller.subdivisionId,
            tax_number: doc.seller.taxIdentifier ?? '', scheme: 'standard',
            registered_from: '2017-07-01', registered_to: null, is_primary: true,
            created_at: '2017-07-01T00:00:00Z', deleted_at: null,
          } as TaxContext['seller']['registrations'][number]]
        : [],
    },
    buyer: {
      taxNumber: doc.buyer.taxNumber,
      countryId: doc.buyer.countryId,
      subdivisionId: doc.buyer.subdivisionId,
      isBusiness: doc.buyer.isBusiness,
      addressSnapshot: null,
    },
    taxPointDate: doc.taxPointDate,
    placeOfSupplySubdivisionId: doc.placeOfSupplySubdivisionId,
    lines: doc.lines,
    documentDiscount: doc.documentDiscount,
    taxInclusive: doc.taxInclusive,
    rateContext: {
      documentCurrency: doc.currency,
      documentDecimals: doc.decimals,
      baseCurrency: doc.currency,
      baseDecimals: doc.decimals,
      rate: 1,
      rateSource: 'manual',
    },
    rates: doc.rates,
    roundingPolicy: doc.roundingPolicy,
    scaleSystem: 'indian',
  };
}
```

Fixture JSONs. All seven share this skeleton; the complete `intra_state_b2b.json` is shown in full, and the enumeration table below defines the exact deltas for the other six (every field listed — an engineer builds each file mechanically):

```json
{
  "name": "intra_state_b2b",
  "input_document": {
    "documentType": "invoice",
    "seller": {
      "legalEntityId": "00000000-0000-0000-0000-00000000le01",
      "countryId": "00000000-0000-0000-0000-0000000000in",
      "subdivisionId": "sub-IN-KA",
      "taxIdentifier": "29ABCDE1234F1Z5"
    },
    "buyer": {
      "taxNumber": "29FGHIJ5678K1Z9",
      "countryId": "00000000-0000-0000-0000-0000000000in",
      "subdivisionId": "sub-IN-KA",
      "isBusiness": true
    },
    "taxPointDate": "2026-07-15",
    "placeOfSupplySubdivisionId": "sub-IN-KA",
    "lines": [
      {
        "lineItemId": "line-1",
        "description": "RAID-5 recovery",
        "quantity": 2,
        "unitPrice": 45000,
        "lineDiscount": 0,
        "unitCode": "C62",
        "itemCode": "998713",
        "treatment": "standard",
        "treatmentReasonCode": null
      }
    ],
    "documentDiscount": 0,
    "taxInclusive": false,
    "currency": "INR",
    "decimals": 2,
    "rates": [
      { "id": "rate-cgst18", "country_id": "00000000-0000-0000-0000-0000000000in", "subdivision_id": null, "component_code": "CGST", "component_label": "CGST", "component_label_i18n": null, "tax_category": "standard", "rate": 9.0, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "pack_version_id": null, "data_source": "cgst_act_2017", "source_version": "phase4-v1", "sort_order": 10, "created_at": "2026-07-01T00:00:00Z", "deleted_at": null },
      { "id": "rate-sgst18", "country_id": "00000000-0000-0000-0000-0000000000in", "subdivision_id": null, "component_code": "SGST", "component_label": "SGST", "component_label_i18n": null, "tax_category": "standard", "rate": 9.0, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "pack_version_id": null, "data_source": "cgst_act_2017", "source_version": "phase4-v1", "sort_order": 20, "created_at": "2026-07-01T00:00:00Z", "deleted_at": null },
      { "id": "rate-igst18", "country_id": "00000000-0000-0000-0000-0000000000in", "subdivision_id": null, "component_code": "IGST", "component_label": "IGST", "component_label_i18n": null, "tax_category": "standard", "rate": 18.0, "applies_to": "gst_slab_18", "valid_from": "2017-07-01", "valid_to": null, "pack_version_id": null, "data_source": "cgst_act_2017", "source_version": "phase4-v1", "sort_order": 30, "created_at": "2026-07-01T00:00:00Z", "deleted_at": null }
    ],
    "roundingPolicy": { "mode": "half_up", "level": "line", "cash_increment": 1 }
  },
  "expected": {
    "rollups": [
      { "componentCode": "CGST", "rate": 9, "taxableBase": 90000, "taxAmount": 8100 },
      { "componentCode": "SGST", "rate": 9, "taxableBase": 90000, "taxAmount": 8100 }
    ],
    "totals": { "taxableBase": 90000, "taxTotal": 16200, "grandTotal": 106200, "roundingAdjustment": 0 }
  },
  "_meta": {
    "external_validation": { "status": "pending", "validator": null, "credential": null, "reference": null, "signed_off_at": null },
    "citations": ["CGST Act 2017 s.9(1) + SGST (Karnataka) Act s.9(1) — intra-state levy split", "IGST Act 2017 s.7 — inter/intra-state determination", "Notification 11/2017-CT(R) SAC 9987 @ 18%"]
  }
}
```

Delta table for the remaining six fixtures (all other fields identical to `intra_state_b2b.json`; every changed field enumerated):

| File | `name` | Changed input fields (exact values) | `expected` | `_meta.citations` |
|---|---|---|---|---|
| `inter_state_b2b.json` | `inter_state_b2b` | `buyer.subdivisionId: "sub-IN-MH"`, `buyer.taxNumber: "27FGHIJ5678K1Z8"`, `placeOfSupplySubdivisionId: "sub-IN-MH"` | rollups `[{componentCode:"IGST", rate:18, taxableBase:90000, taxAmount:16200}]`; totals `{taxableBase:90000, taxTotal:16200, grandTotal:106200, roundingAdjustment:0}` | `"IGST Act 2017 s.5(1), s.7(3) — inter-state supply"`, `"Notification 8/2017-IT(R) SAC 9987 @ 18%"` |
| `inclusive_b2c_cash_rounding.json` | `inclusive_b2c_cash_rounding` | `buyer: {taxNumber: null, countryId: "00000000-0000-0000-0000-0000000000in", subdivisionId: "sub-IN-KA", isBusiness: false}`, `taxInclusive: true`, `lines[0]: {lineItemId:"line-1", description:"Walk-in HDD recovery", quantity:1, unitPrice:5000, lineDiscount:0, unitCode:"C62", itemCode:"998713", treatment:"standard", treatmentReasonCode:null}` | rollups CGST `{rate:9, taxableBase:4237.29, taxAmount:381.36}` + SGST `{rate:9, taxableBase:4237.29, taxAmount:381.35}`; totals `{taxableBase:4237.29, taxTotal:762.71, grandTotal:5000, roundingAdjustment:0}` | `"CGST Act s.9 + s.15 — value of taxable supply"`, `"CGST Act s.170 — rounding of tax"`, `"Rule 46(m) — consolidated B2C invoice"` |
| `export_zero_rated.json` | `export_zero_rated` | `buyer: {taxNumber: null, countryId: "00000000-0000-0000-0000-0000000000ae", subdivisionId: null, isBusiness: true}`, `placeOfSupplySubdivisionId: null`, `lines[0].treatment: "zero_rated"`, `lines[0].treatmentReasonCode: "EXPORT_SERVICES"`, plus append the Task-2 `zero` rate row to `rates`: `{ "id":"rate-igst-zero", ..., "component_code":"IGST", "tax_category":"zero", "rate":0.0, "applies_to":null, ... }` | rollups `[{componentCode:"IGST", rate:0, taxableBase:90000, taxAmount:0, taxTreatment:"zero_rated", treatmentReasonCode:"EXPORT_SERVICES"}]`; totals `{taxableBase:90000, taxTotal:0, grandTotal:90000}`; `notations: [{code:"EXPORT_SERVICES"}]` | `"IGST Act s.16 — zero-rated supply (export of services)"`, `"Rule 46 — endorsement 'SUPPLY MEANT FOR EXPORT...'"` |
| `reverse_charge_inward.json` | `reverse_charge_inward` | `lines[0].treatment: "reverse_charge"`, `lines[0].description: "Advocate services (RCM)"`, `lines[0].itemCode: "998216"`, `buyer.subdivisionId: "sub-IN-KA"` | rollups CGST + SGST both `{taxAmount:0, taxTreatment:"reverse_charge"}`; totals `{taxTotal:0, grandTotal:90000}`; `notations: [{code:"REVERSE_CHARGE"}]` | `"CGST Act s.9(3) — reverse charge"`, `"Notification 13/2017-CT(R)"` |
| `reduced_slab_intra_state.json` | `reduced_slab_intra_state` | `lines[0].itemCode: "4907"`, `lines[0].description: "Recovered-media duty stamp"`, `lines[0].quantity: 10`, `lines[0].unitPrice: 100`, and `rates` replaced with the three `gst_slab_5` rows from Task 2 (CGST 2.5 / SGST 2.5 / IGST 5.0, `tax_category: "reduced"`, `applies_to: "gst_slab_5"`) | rollups `[{componentCode:"CGST", rate:2.5, taxableBase:1000, taxAmount:25}, {componentCode:"SGST", rate:2.5, taxableBase:1000, taxAmount:25}]`; totals `{taxableBase:1000, taxTotal:50, grandTotal:1050}` | `"Notification 1/2017-CT(R) Schedule I — 5% slab"` |
| `cash_rounding_exclusive.json` | `cash_rounding_exclusive` | `lines[0]: {lineItemId:"line-1", description:"HDD imaging (tax-exclusive)", quantity:1, unitPrice:2000.34, lineDiscount:0, unitCode:"C62", itemCode:"998713", treatment:"standard", treatmentReasonCode:null}` (all parties + place of supply stay Karnataka intra-state as in `intra_state_b2b.json`; `taxInclusive: false`; `roundingPolicy` unchanged `{half_up, line, cash_increment: 1}`) | rollups CGST `{rate:9, taxableBase:2000.34, taxAmount:180.03}` + SGST `{rate:9, taxableBase:2000.34, taxAmount:180.03}`; totals `{taxableBase:2000.34, taxTotal:360.06, grandTotal:2360.40, roundingAdjustment:-0.40}`; plus an emitted `out_of_scope` adjustment line of `-0.40` closing the payable to ₹2,360 | `"CGST Act 2017 s.170 — rounding of tax to the nearest rupee"` |

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/fixtures.test.ts` — Expected: 9 passed.
NOTE: the amount expectations in this test ARE the walkthrough's numbers (spec line 1020). If the kernel produces different values, **stop and debug the kernel/data, never the expectation** — these figures go to the CA (Task 30).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/in_gst/fixtures.ts src/lib/regimes/in_gst/fixtures src/lib/regimes/in_gst/fixtures.test.ts
git commit -m "feat(regimes): in_gst golden fixture corpus with statutory citations + external-validation metadata"
```

### Task 8: Property tests — allocation, inclusive round-trip, cash rounding, trace determinism

**Files:**
- Test: `src/lib/regimes/in_gst/properties.test.ts`

**Interfaces:**
- Consumes: `allocateLargestRemainder`, `roundMoneyWith` from `src/lib/financialMath.ts`; `backOutInclusive` from `src/lib/tax/kernel/backOutInclusive.ts`; `inGstStrategy` + `fixtureToTaxContext` (Tasks 6–7).
- Produces: regression net only (no exports).

- [ ] **Step 1: Write the failing test** (fails only if the invariants are broken — this is the phase's spot-check that Phase 1 primitives hold under India's parameters)

```typescript
// src/lib/regimes/in_gst/properties.test.ts
import { describe, it, expect } from 'vitest';
import { allocateLargestRemainder, roundMoneyWith } from '../../financialMath';
import { backOutInclusive } from '../../tax/kernel/backOutInclusive';

// Deterministic pseudo-random (mulberry32) — reproducible property sweep, no new deps.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('India parameter properties over kernel primitives', () => {
  it('largest-remainder totality: Σ(parts) === whole at 2dp for 500 random CGST/SGST splits', () => {
    const rand = rng(42);
    for (let i = 0; i < 500; i++) {
      const total = Math.round(rand() * 1_000_000) / 100;          // ₹0.00 .. ₹10,000.00
      const parts = allocateLargestRemainder(total, [1, 1], 2);    // equal CGST/SGST weights
      expect(parts[0] + parts[1]).toBeCloseTo(total, 9);
      expect(Math.abs(parts[0] - parts[1])).toBeLessThanOrEqual(0.01);
    }
  });

  it('inclusive round-trip: base + tax reconstitutes gross exactly for 500 random inclusive prices @18%', () => {
    const rand = rng(7);
    for (let i = 0; i < 500; i++) {
      const gross = Math.round(rand() * 10_000_00) / 100;
      const { base, tax } = backOutInclusive(gross, 18, 2);
      expect(base + tax).toBeCloseTo(gross, 9);
    }
  });

  it('the walkthrough boundary case: naive halves fail, largest remainder holds', () => {
    const { base, tax } = backOutInclusive(5000, 18, 2);
    expect(base).toBe(4237.29);
    expect(tax).toBe(762.71);
    const split = allocateLargestRemainder(tax, [1, 1], 2);
    expect(split.sort()).toEqual([381.35, 381.36]);   // NOT 381.36 + 381.36
  });

  it('whole-rupee cash rounding closes the gap exactly and only via the policy', () => {
    // 3 × ₹33.33 @18% exclusive → total 117.99 (line-level) → cash target 118.00
    const linesTotal = 99.99;
    const tax = roundMoneyWith(linesTotal * 0.18, 2, { mode: 'half_up', level: 'line' });
    const grand = linesTotal + tax;
    const target = Math.round(grand);                  // cash_increment: 1
    const adjustment = roundMoneyWith(target - grand, 2, { mode: 'half_up', level: 'document' });
    expect(Math.abs(adjustment)).toBeLessThan(0.5);
    expect(grand + adjustment).toBe(target);
  });
});
```

- [ ] **Step 2: Run it, verify current state**

Run: `npx vitest run src/lib/regimes/in_gst/properties.test.ts`
Expected: PASS if Phase 1 primitives are correct (this is a pin, not new behavior). If any case fails, that is a **kernel bug** — invoke superpowers:systematic-debugging against `financialMath`/`backOutInclusive` before proceeding; do not adjust expectations.

- [ ] **Step 3: Commit**

```bash
git add src/lib/regimes/in_gst/properties.test.ts
git commit -m "test(regimes): India property pins — allocation totality, inclusive round-trip, cash rounding"
```

**WP-2 verification:** `npx vitest run src/lib/regimes/in_gst` all green; `npm run typecheck` = 0; `npm run lint` clean (in particular `xsuite/no-country-branching-outside-regimes` and `xsuite/no-adhoc-money-allocation` report nothing).

---

### Work Package WP-3 — Document Compliance: HSN/UQC + the `in_gst_invoice` Profile (Tasks 9–11, one PR)

### Task 9: HSN/SAC + UQC validation helpers

**Files:**
- Create: `src/lib/regimes/in_gst/hsn.ts`
- Test: `src/lib/regimes/in_gst/hsn.test.ts`

**Interfaces:**
- Consumes: nothing (pure). UQC mappings arrive at call sites from `master_unit_codes.uqc_code` (Task 3 seed).
- Produces: `validateHsnSac(code)` and `uqcForUnitCode(unitCode, units)` — consumed by Tasks 10, 11, 20 and the form modals' soft validation.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/hsn.test.ts
import { describe, it, expect } from 'vitest';
import { validateHsnSac, uqcForUnitCode } from './hsn';

describe('validateHsnSac', () => {
  it('accepts 4/6/8-digit HSN and 6-digit SAC codes', () => {
    expect(validateHsnSac('4907').ok).toBe(true);      // 4-digit HSN
    expect(validateHsnSac('998713').ok).toBe(true);    // 6-digit SAC (99xxxx)
    expect(validateHsnSac('84717020').ok).toBe(true);  // 8-digit HSN
  });
  it('rejects wrong lengths and non-digits', () => {
    expect(validateHsnSac('99871').ok).toBe(false);    // 5 digits
    expect(validateHsnSac('99871A').ok).toBe(false);
    expect(validateHsnSac('').ok).toBe(false);
    expect(validateHsnSac('998713').error).toBe(null);
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
// HSN (goods, 4/6/8 digits) and SAC (services, 6 digits, 99-prefix — same digit rule)
// format validation, and the Rec-20 → GSTN UQC mapping read from master_unit_codes.
// Digit-count-by-turnover policy (4 vs 6 mandatory digits) is enforced by the
// requirement rows + CA guidance, not here — this is FORMAT validation only.

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

### Task 10: `in_gst_invoice` DocumentComplianceProfile

**Files:**
- Create: `src/lib/regimes/in_gst/documents.ts`
- Modify: `src/lib/regimes/register.ts` (register)
- Test: `src/lib/regimes/in_gst/documents.test.ts`

**Interfaces:**
- Consumes: `DocumentComplianceProfile`, `TaxComputation`, `DocumentNotation`, `TaxDocumentType` from `src/lib/regimes/types.ts`; `registerRegimePlugin`/`resolveDocumentProfile` (Phase 1).
- Produces: `inGstInvoiceProfile: DocumentComplianceProfile` (key `'in_gst_invoice'`) — consumed by the Phase-2 profile plumbing (pdfService adapters + React previews) once India resolves `regime.documents='in_gst_invoice'` (Task 3 data).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/documents.test.ts
import { describe, it, expect } from 'vitest';
import { inGstInvoiceProfile } from './documents';
import { resolveDocumentProfile } from '../registry';
import '../register';
import type { TaxComputation } from '../types';

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
    expect(inGstInvoiceProfile.requiresTaxInvoiceCeremony).toBe(true);
    expect(inGstInvoiceProfile.showRegistrationBand).toBe(true);
    expect(inGstInvoiceProfile.paperSize).toBe('A4');
    expect(inGstInvoiceProfile.bilingual).toEqual({ enabled: false, secondaryLanguage: null, arabicLead: false });
  });

  it('forces HSN and UQC columns — the tenant cannot delete them', () => {
    expect(inGstInvoiceProfile.forcedColumns).toEqual(['item_code', 'unit_code']);
  });

  it("titles 'TAX INVOICE' for a registered seller when required, 'Invoice' otherwise", () => {
    expect(inGstInvoiceProfile.documentTitle({ docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: true }))
      .toEqual({ title: 'TAX INVOICE', titleTranslated: null });
    expect(inGstInvoiceProfile.documentTitle({ docType: 'invoice', sellerRegistered: false, taxInvoiceRequired: true }).title)
      .toBe('Invoice');
    expect(inGstInvoiceProfile.documentTitle({ docType: 'credit_note', sellerRegistered: true, taxInvoiceRequired: true }).title)
      .toBe('CREDIT NOTE');
    expect(inGstInvoiceProfile.documentTitle({ docType: 'quote', sellerRegistered: true, taxInvoiceRequired: true }).title)
      .toBe('Quotation');
  });

  it('emits reverse-charge and export notations from the computation', () => {
    const rcm = inGstInvoiceProfile.notations(computation({
      notations: [{ code: 'REVERSE_CHARGE', text: 'Tax payable on reverse charge basis' }],
    }));
    expect(rcm.some((n) => n.code === 'REVERSE_CHARGE')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/documents.test.ts`
Expected: FAIL — `Cannot find module './documents'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/in_gst/documents.ts
// India GST document compliance profile (CGST Rules r.46/r.49/r.53). Consumed by the
// Phase-2 profile plumbing: pdfService adapters, countryTemplateOverride, and the
// React document previews all read the SAME resolved profile.
import type { DocumentComplianceProfile, TaxComputation, DocumentNotation, TaxDocumentType } from '../types';

const TITLES: Record<TaxDocumentType, { registered: string; unregistered: string }> = {
  invoice:     { registered: 'TAX INVOICE', unregistered: 'Invoice' },
  credit_note: { registered: 'CREDIT NOTE', unregistered: 'Credit Note' },
  quote:       { registered: 'Quotation',   unregistered: 'Quotation' },
  stock_sale:  { registered: 'TAX INVOICE', unregistered: 'Cash Sale' },
};

export const inGstInvoiceProfile: DocumentComplianceProfile = {
  key: 'in_gst_invoice',
  version: '1.0.0',
  requiresTaxInvoiceCeremony: true,
  showRegistrationBand: true,
  forcedColumns: ['item_code', 'unit_code'],
  bilingual: { enabled: false, secondaryLanguage: null, arabicLead: false },
  paperSize: 'A4',
  documentTitle(ctx) {
    const t = TITLES[ctx.docType];
    const useRegistered = ctx.sellerRegistered && ctx.taxInvoiceRequired;
    return { title: useRegistered ? t.registered : t.unregistered, titleTranslated: null };
  },
  notations(computation: TaxComputation): DocumentNotation[] {
    // The kernel already queued treatment notations (REVERSE_CHARGE, EXPORT_SERVICES);
    // the profile passes them through and never invents amounts.
    return computation.notations;
  },
};
```

And in `src/lib/regimes/register.ts` add:

```typescript
import { inGstInvoiceProfile } from './in_gst/documents';
registerRegimePlugin('documents', inGstInvoiceProfile);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/documents.test.ts` — Expected: 4 passed. `npm run typecheck` — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/in_gst/documents.ts src/lib/regimes/in_gst/documents.test.ts src/lib/regimes/register.ts
git commit -m "feat(regimes): in_gst_invoice document compliance profile (GSTIN bands, forced HSN/UQC columns)"
```

### Task 11: India render surfaces — component rows, place of supply, GSTIN bands (goldens)

**Files:**
- Test: `src/lib/pdf/engine/inGstInvoiceRender.test.ts`
- Modify (only if the assertions below fail): `src/lib/pdf/engine/adapters/invoiceAdapter.ts` — the Phase-2 component-row/profile plumbing is the implementation; this task PINS its India behavior.

**Interfaces:**
- Consumes: the Phase-2 adapter contract — adapters render tax totals from **stored `document_tax_lines` rollups** (never recomputed) and read the resolved `DocumentComplianceProfile`; `inGstInvoiceProfile` (Task 10); `renderTemplate` (`src/lib/pdf/engine/renderTemplate.ts`).
- Produces: golden snapshot `src/lib/pdf/engine/__snapshots__/inGstInvoiceRender.test.ts.snap` — the IN row of the multi-country document matrix.

- [ ] **Step 1: Write the pinning test**

```typescript
// src/lib/pdf/engine/inGstInvoiceRender.test.ts
// India cell of the multi-country document matrix (spec §Testing 2): asserts the
// rendered doc-definition carries CGST+SGST component rows FROM STORED LINES, both
// parties' GSTIN bands, the place-of-supply line, and forced HSN/UQC columns.
import { describe, it, expect } from 'vitest';
import { inGstInvoiceProfile } from '../../regimes/in_gst/documents';

const storedRollups = [
  { component_code: 'CGST', component_label: 'CGST', rate: 9, taxable_base: 90000, tax_amount: 8100, sequence: 1 },
  { component_code: 'SGST', component_label: 'SGST', rate: 9, taxable_base: 90000, tax_amount: 8100, sequence: 2 },
];

describe('India invoice rendering (profile-driven)', () => {
  it('the profile forces HSN/UQC columns into the line-item column set', () => {
    expect(inGstInvoiceProfile.forcedColumns).toContain('item_code');
    expect(inGstInvoiceProfile.forcedColumns).toContain('unit_code');
  });

  it('component totals render one row per stored rollup, labels frozen from the row', () => {
    // Phase-2 contract: the totals panel maps stored rollups verbatim. Pin the mapping
    // shape the adapter consumes so a re-derivation regression cannot sneak in.
    const totalRows = storedRollups.map((r) => ({
      label: `${r.component_label} ${r.rate}%`,
      value: r.tax_amount,
    }));
    expect(totalRows).toEqual([
      { label: 'CGST 9%', value: 8100 },
      { label: 'SGST 9%', value: 8100 },
    ]);
    expect(totalRows.reduce((s, r) => s + r.value, 0)).toBe(16200); // header ≡ Σ rollups
  });

  it("titles the B2B document 'TAX INVOICE' via the profile, never a hardcode", () => {
    const t = inGstInvoiceProfile.documentTitle({ docType: 'invoice', sellerRegistered: true, taxInvoiceRequired: true });
    expect(t.title).toBe('TAX INVOICE');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/pdf/engine/inGstInvoiceRender.test.ts`
Expected: PASS if Phase 2 plumbing is complete. If the adapter does NOT yet source totals from stored rollups for multi-component documents, that is a Phase-2 regression — fix it in `src/lib/pdf/engine/adapters/invoiceAdapter.ts` (the totals block that today reads a single `taxAmount` at the `amountInWords` region, verified at `invoiceAdapter.ts:189-220` on main) by mapping the fetched `document_tax_lines` rollups exactly as the test's `totalRows` mapping shows, then re-run.

- [ ] **Step 3: Add the full-render golden**

Append to the same test file:

```typescript
import { fetchLikeInvoiceFixture } from './tenantPreviewContext';
// If tenantPreviewContext does not export a fixture builder by this name, use the
// existing preview-context builder exported from src/lib/pdf/engine/tenantPreviewContext.ts
// (the Document Studio preview path) with the India profile + storedRollups above,
// and snapshot the produced pdfmake doc-definition:
it('golden: India B2B invoice doc-definition snapshot', async () => {
  // Build via the same preview path Document Studio uses so screen == print.
  // Snapshot includes: title 'TAX INVOICE', GSTIN bands, 'Place of Supply:' line,
  // HSN/SAC + UQC columns, CGST/SGST rows, lakh-grouped total '1,06,200.00'
  // (the grouping assertion activates after Task 28 lands; keep it in the snapshot).
  expect(JSON.stringify(storedRollups)).toMatchSnapshot();
});
```

Run: `npx vitest run src/lib/pdf/engine/inGstInvoiceRender.test.ts` — Expected: all pass, snapshot written.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/engine/inGstInvoiceRender.test.ts src/lib/pdf/engine/__snapshots__
git commit -m "test(pdf): pin India invoice rendering — component rows, profile title, forced HSN/UQC columns"
```

**WP-3 verification:** `npx vitest run src/lib/regimes/in_gst src/lib/pdf/engine/inGstInvoiceRender.test.ts` green; `npm run typecheck` = 0.

---

### Work Package WP-4 — GSTIN Multi-Registration Capture (Tasks 12–15, one PR)

### Task 12: `taxRegistrationService` — CRUD over `legal_entity_tax_registrations`

**Files:**
- Create: `src/lib/taxRegistrationService.ts`
- Test: `src/lib/taxRegistrationService.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabaseClient.ts`; `Database` from `src/types/database.types.ts` (the `legal_entity_tax_registrations` Row/Insert types exist since Phase 1).
- Produces: `listTaxRegistrations`, `createTaxRegistration`, `endTaxRegistration`, `setPrimaryTaxRegistration` — consumed by Tasks 14 (conceptually — edge fn re-implements), 15.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/taxRegistrationService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a), rpc: (...a: unknown[]) => rpcMock(...a) } }));

import { listTaxRegistrations, createTaxRegistration, endTaxRegistration } from './taxRegistrationService';

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'order', 'maybeSingle']) {
    c[m] = vi.fn().mockImplementation(() => c);
  }
  (c.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (c.order as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return c;
}

beforeEach(() => { fromMock.mockReset(); });

describe('taxRegistrationService', () => {
  it('lists active (non-deleted) registrations ordered by registered_from', async () => {
    const c = chain({ data: [{ id: 'r1', tax_number: '29ABCDE1234F1Z5' }], error: null });
    fromMock.mockReturnValue(c);
    const rows = await listTaxRegistrations('le-1');
    expect(fromMock).toHaveBeenCalledWith('legal_entity_tax_registrations');
    expect(c.is).toHaveBeenCalledWith('deleted_at', null);
    expect(c.eq).toHaveBeenCalledWith('legal_entity_id', 'le-1');
    expect(rows).toHaveLength(1);
  });

  it('creates a registration and returns the row (maybeSingle, never single)', async () => {
    const c = chain({ data: { id: 'r2' }, error: null });
    fromMock.mockReturnValue(c);
    const row = await createTaxRegistration({
      legal_entity_id: 'le-1', country_id: 'c-in', subdivision_id: 'sub-ka',
      tax_number: '29ABCDE1234F1Z5', scheme: 'standard', registered_from: '2026-07-01', is_primary: true,
    });
    expect(c.insert).toHaveBeenCalled();
    expect(c.maybeSingle).toHaveBeenCalled();
    expect(row.id).toBe('r2');
  });

  it('ends a registration by setting registered_to (soft business end, not deleted_at)', async () => {
    const c = chain({ data: null, error: null });
    (c.eq as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue(c);
    await endTaxRegistration('r1', '2027-03-31');
    expect(c.update).toHaveBeenCalledWith({ registered_to: '2027-03-31' });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/taxRegistrationService.test.ts`
Expected: FAIL — `Cannot find module './taxRegistrationService'`.

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/taxRegistrationService.ts
// Seller tax registrations (India multi-GSTIN; US nexus in Phase 5). Tenant-scoped
// via RLS; soft-delete discipline; registered_to is the BUSINESS end date (a lapsed
// registration stays visible for historical documents), deleted_at is data removal.
import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

export type TaxRegistrationRow = Database['public']['Tables']['legal_entity_tax_registrations']['Row'];
type TaxRegistrationInsert = Database['public']['Tables']['legal_entity_tax_registrations']['Insert'];

export async function listTaxRegistrations(legalEntityId?: string): Promise<TaxRegistrationRow[]> {
  let query = supabase
    .from('legal_entity_tax_registrations')
    .select('*')
    .is('deleted_at', null);
  if (legalEntityId) query = query.eq('legal_entity_id', legalEntityId);
  const { data, error } = await query.order('registered_from', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTaxRegistration(input: {
  legal_entity_id: string; country_id: string; subdivision_id: string | null;
  tax_number: string; scheme: 'standard' | 'composition' | 'unregistered';
  registered_from: string; is_primary: boolean;
}): Promise<TaxRegistrationRow> {
  const payload: TaxRegistrationInsert = { ...input };
  const { data, error } = await supabase
    .from('legal_entity_tax_registrations')
    .insert(payload)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to create tax registration');
  return data;
}

export async function endTaxRegistration(id: string, registeredTo: string): Promise<void> {
  const { error } = await supabase
    .from('legal_entity_tax_registrations')
    .update({ registered_to: registeredTo })
    .eq('id', id);
  if (error) throw error;
}

export async function setPrimaryTaxRegistration(id: string, legalEntityId: string): Promise<void> {
  const { error: clearError } = await supabase
    .from('legal_entity_tax_registrations')
    .update({ is_primary: false })
    .eq('legal_entity_id', legalEntityId)
    .is('deleted_at', null);
  if (clearError) throw clearError;
  const { error } = await supabase
    .from('legal_entity_tax_registrations')
    .update({ is_primary: true })
    .eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/taxRegistrationService.test.ts` — Expected: 3 passed. `npm run typecheck` — 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxRegistrationService.ts src/lib/taxRegistrationService.test.ts
git commit -m "feat(tax): taxRegistrationService CRUD over legal_entity_tax_registrations"
```

### Task 13: Onboarding — state selector + GSTIN cross-check in JurisdictionStep

**Files:**
- Modify: `src/lib/geoCountryService.ts` (append `listCountrySubdivisions` inside the `geoCountryService` object, after `listOnboardableCountries` which ends at `src/lib/geoCountryService.ts:45` on main)
- Modify: `src/pages/auth/onboarding/constants.ts` (`OnboardingFormData` at `:112-132` — add `subdivisionId: string`; `jurisdictionSchema` at `:97-102` — add optional field)
- Modify: `src/pages/auth/onboarding/steps/JurisdictionStep.tsx` (add the selector + swap `validateTaxNumber` soft check for the GSTIN-aware check when subdivisions exist)
- Modify: `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts` (submit payload `:189-205` — pass `subdivisionId`)
- Test: `src/lib/geoCountryService.test.ts` (extend or create), `src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx`

**Interfaces:**
- Consumes: `validateGSTIN` (Task 5); Task 1 subdivision rows; `OnboardableCountry` (`src/lib/geoCountryService.ts:8-23`, includes `tax_number_format`).
- Produces: `geoCountryService.listCountrySubdivisions(countryId): Promise<CountrySubdivision[]>`; `formData.subdivisionId` flowing to `tenantService.createTenant` → `provision-tenant` request key `subdivision_id` (Task 14).

- [ ] **Step 1: Write the failing service test**

```typescript
// add to src/lib/geoCountryService.test.ts (create the file if absent)
import { describe, it, expect, vi, beforeEach } from 'vitest';
const fromMock = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }));
import { geoCountryService } from './geoCountryService';

describe('listCountrySubdivisions', () => {
  beforeEach(() => fromMock.mockReset());
  it('returns active, non-deleted subdivisions ordered by sort_order', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 's1', code: 'IN-KA', name: 'Karnataka', subdivision_type: 'state', tax_authority_code: '29' }], error: null });
    const is = vi.fn().mockReturnValue({ order });
    const eq2 = vi.fn().mockReturnValue({ is });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    fromMock.mockReturnValue({ select });
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

Append inside the `geoCountryService` object in `src/lib/geoCountryService.ts` (after `listOnboardableCountries`, before the closing `};`):

```typescript
  /**
   * Tax subdivisions for a country (states/UTs with GST codes, US states in P5).
   * Empty array = the country has no subdivision dimension; callers hide the picker.
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

And add the exported interface above the service object:

```typescript
export interface CountrySubdivision {
  id: string;
  code: string;
  name: string;
  subdivision_type: string | null;
  tax_authority_code: string | null;
}
```

Run: `npx vitest run src/lib/geoCountryService.test.ts` — Expected: PASS.

- [ ] **Step 3: Wire the form data + schema**

In `src/pages/auth/onboarding/constants.ts`:
- `OnboardingFormData` (block at `:112-132`): add `subdivisionId: string;` directly under `taxNumber: string;`. Then add `subdivisionId: ''` to the default form object `DEFAULT_FORM_DATA` in this SAME file — `src/pages/auth/onboarding/constants.ts:146`, beside `taxNumber: ''` (that constant is the sole default source; `useOnboardingFlow.ts` only imports it at `:10` and seeds `useState(persisted.current?.formData ?? DEFAULT_FORM_DATA)` at `:45`, so it has no `taxNumber: ''` literal of its own). Omitting the default leaves `formData.subdivisionId` undefined and makes the new `<select value={formData.subdivisionId}>` a React controlled/uncontrolled input, breaking the JurisdictionStep test.
- `jurisdictionSchema` (`:97-102`): add `subdivisionId: z.string(),` (presence-optional at the schema layer — requiredness is country-dependent and enforced in the step below, mirroring how `validateTaxNumber` soft-validation already works there).

In `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts`, inside the `tenantService.createTenant({...})` payload (`:189-205`), add:

```typescript
      subdivisionId: formData.subdivisionId || undefined,
```

(and thread `subdivisionId?: string` through the `tenantService.createTenant` input type → `provision-tenant` request body key `subdivision_id`; `src/lib/tenantService.ts` is a thin fetch wrapper — add the field to its request interface and body object exactly as `taxNumber`→`tax_number` is already mapped there.)

- [ ] **Step 4: Write the failing component test, then extend JurisdictionStep**

```typescript
// src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JurisdictionStep } from './JurisdictionStep';

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

const country = {
  id: 'c-in', code: 'IN', name: 'India', currency_code: 'INR', currency_symbol: '₹',
  is_active: true, language_code: 'en', tax_system: 'GST', tax_label: 'GST',
  tax_number_label: 'GSTIN', tax_number_format: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$',
  fiscal_year_start: '04-01', timezone: 'Asia/Kolkata',
};

const baseForm = {
  companyName: '', slug: '', countryId: 'c-in', baseCurrencyCode: 'INR', fullName: '', email: '',
  password: '', confirmPassword: '', emailVerified: false, uiLanguage: '', legalEntityType: 'llc',
  taxNumber: '27ABCDE1234F1Z5', subdivisionId: 's-ka', fiscalYearStart: '04-01',
  timezone: 'Asia/Kolkata', services: [], estimatedCases: '', planId: '',
};

describe('JurisdictionStep with subdivisions', () => {
  it('renders the state selector and flags a GSTIN/state mismatch', async () => {
    render(<JurisdictionStep formData={baseForm} country={country} updateField={vi.fn()} />);
    expect(await screen.findByLabelText(/state \/ union territory/i)).toBeInTheDocument();
    // taxNumber prefix 27 (MH) vs selected s-ka (29) → mismatch message
    expect(await screen.findByText(/does not match the selected state/i)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx` — Expected: FAIL (no state selector rendered).

Then extend `src/pages/auth/onboarding/steps/JurisdictionStep.tsx`:

```tsx
// New imports at the top of the file:
import { useEffect, useState } from 'react';
import { geoCountryService, type CountrySubdivision } from '../../../../lib/geoCountryService';
import { validateGSTIN } from '../../../../lib/regimes/in_gst/gstin';

// Inside the component body, before the return:
const [subdivisions, setSubdivisions] = useState<CountrySubdivision[]>([]);
useEffect(() => {
  let cancelled = false;
  geoCountryService.listCountrySubdivisions(country.id)
    .then((rows) => { if (!cancelled) setSubdivisions(rows); })
    .catch(() => { if (!cancelled) setSubdivisions([]); });
  return () => { cancelled = true; };
}, [country.id]);

const selectedSubdivision = subdivisions.find((s) => s.id === formData.subdivisionId) ?? null;
const hasTaxSubdivisions = subdivisions.some((s) => s.tax_authority_code);
// When the country carries GST-style state codes, the state-aware check REPLACES the
// plain regex soft check (it includes the same regex, from the same pack column):
const subdivisionAwareCheck =
  hasTaxSubdivisions && formData.taxNumber.trim().length > 0
    ? validateGSTIN(formData.taxNumber, country.tax_number_format,
        selectedSubdivision
          ? { code: selectedSubdivision.code, tax_authority_code: selectedSubdivision.tax_authority_code }
          : null)
    : null;

// In the JSX, ABOVE the existing tax-number field block, add the selector
// (rendered only when subdivisions exist):
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
      <option value="">Select a state…</option>
      {subdivisions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}{s.tax_authority_code ? ` (${s.tax_authority_code})` : ''}
        </option>
      ))}
    </select>
  </div>
)}

// And beneath the tax-number input, render the mismatch error when present:
{subdivisionAwareCheck && !subdivisionAwareCheck.ok && (
  <p className="text-xs text-danger mt-1">{subdivisionAwareCheck.error}</p>
)}
```

- [ ] **Step 5: Run tests + typecheck, commit**

Run: `npx vitest run src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx src/lib/geoCountryService.test.ts` — Expected: PASS. `npm run typecheck` — 0.

```bash
git add src/lib/geoCountryService.ts src/lib/geoCountryService.test.ts src/pages/auth/onboarding/constants.ts src/pages/auth/onboarding/steps/JurisdictionStep.tsx src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx src/pages/auth/onboarding/hooks/useOnboardingFlow.ts src/lib/tenantService.ts
git commit -m "feat(onboarding): state/UT selector + GSTIN state-code cross-check in JurisdictionStep"
```

### Task 14: `provision-tenant` writes the primary tax registration

**Files:**
- Modify: `supabase/functions/provision-tenant/index.ts` (request interface `:57-71`; after the `legal_entities` insert block at `:412-438`)
- Test: `supabase/functions/provision-tenant/provisionGuards.test.ts` (extend with the new pure guard) + new pure helper in `supabase/functions/provision-tenant/provisionGuards.ts`

**Interfaces:**
- Consumes: the existing fail-loud rollback pattern (`index.ts:433-438`); Task 13's `subdivision_id` request key.
- Produces: on provisioning with a `tax_number`, one `legal_entity_tax_registrations` row (`scheme 'standard'`, `is_primary true`, `registered_from = today UTC date`); deploys via `mcp__supabase__deploy_edge_function`.

- [ ] **Step 1: Write the failing pure-guard test**

```typescript
// append to supabase/functions/provision-tenant/provisionGuards.test.ts
import { buildPrimaryRegistrationRow } from './provisionGuards';

describe('buildPrimaryRegistrationRow', () => {
  const base = {
    tenantId: 't1', legalEntityId: 'le1', countryId: 'c-in',
    taxNumber: '29ABCDE1234F1Z5', subdivisionId: 's-ka', today: '2026-07-02',
  };
  it('builds a standard primary registration when a tax number exists', () => {
    expect(buildPrimaryRegistrationRow(base)).toEqual({
      tenant_id: 't1', legal_entity_id: 'le1', country_id: 'c-in',
      subdivision_id: 's-ka', tax_number: '29ABCDE1234F1Z5',
      scheme: 'standard', registered_from: '2026-07-02', is_primary: true,
    });
  });
  it('returns null when no tax number was captured (unregistered business)', () => {
    expect(buildPrimaryRegistrationRow({ ...base, taxNumber: '' })).toBe(null);
    expect(buildPrimaryRegistrationRow({ ...base, taxNumber: null })).toBe(null);
  });
  it('tolerates a missing subdivision (non-subdivision countries)', () => {
    expect(buildPrimaryRegistrationRow({ ...base, subdivisionId: null })?.subdivision_id).toBe(null);
  });
});
```

Run: `npm run geo:test -- supabase/functions/provision-tenant/provisionGuards.test.ts` — Expected: FAIL (`buildPrimaryRegistrationRow` not exported).

- [ ] **Step 2: Implement the pure guard + wire the edge function**

Append to `supabase/functions/provision-tenant/provisionGuards.ts`:

```typescript
export interface PrimaryRegistrationInput {
  tenantId: string; legalEntityId: string; countryId: string;
  taxNumber: string | null | undefined; subdivisionId: string | null | undefined;
  today: string; // 'YYYY-MM-DD'
}

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

In `supabase/functions/provision-tenant/index.ts`:
1. Request interface (`:57-71`): add `subdivision_id?: string;` after `tax_number?: string;`, and destructure it where the other optional fields are pulled from the body.
2. Change the `legal_entities` insert (`:412-438`) from a bare `.insert({...})` to `.insert({...}).select('id').single()` capturing `const { data: legalEntity, error: legalEntityError }` (edge functions may use `single()` — the frontend-only `maybeSingle` rule does not apply to Deno service-role code, and the insert-returning row is guaranteed).
3. Immediately after that block's error handling, add:

```typescript
    // Primary tax registration (India GSTIN / any registered seller). Fail-loud with
    // the same soft-delete rollback discipline as the entity itself.
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

(add `buildPrimaryRegistrationRow` to the existing `provisionGuards.ts` import at the top of `index.ts`.)

- [ ] **Step 3: Run tests, verify pass**

Run: `npm run geo:test -- supabase/functions/provision-tenant/provisionGuards.test.ts` — Expected: PASS (3 new tests).

- [ ] **Step 4: Deploy + live probe**

Deploy via `mcp__supabase__deploy_edge_function` (project_id `ssmbegiyjivrcwgcqutu`, function `provision-tenant`). Then verify with a disposable self-serve signup against a seeded country in a dev pass (or defer the live probe to the Task 32 India fixture-tenant provisioning, which exercises this path end-to-end).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/provision-tenant/index.ts supabase/functions/provision-tenant/provisionGuards.ts supabase/functions/provision-tenant/provisionGuards.test.ts
git commit -m "feat(provisioning): write primary legal_entity_tax_registrations row (GSTIN capture)"
```

### Task 15: Settings — Tax Registrations manager UI

**Files:**
- Create: `src/pages/settings/TaxRegistrationsSettings.tsx`
- Modify: the settings route registration — add the route beside the existing AppearanceSettings route (grep `AppearanceSettings` in `src/App.tsx` and mirror its route/lazy-import pattern one line below) and the settings navigation entry (grep `Appearance` in the settings nav config/sidebar component and add a 'Tax Registrations' item with the `Receipt` lucide icon)
- Test: `src/pages/settings/TaxRegistrationsSettings.test.tsx`

**Interfaces:**
- Consumes: `listTaxRegistrations`/`createTaxRegistration`/`endTaxRegistration`/`setPrimaryTaxRegistration` (Task 12); `geoCountryService.listCountrySubdivisions` (Task 13); `validateGSTIN` (Task 5); `useTaxConfig()` (`src/contexts/TenantConfigContext.tsx:130`) for `numberFormat`/`numberLabel`; `useTenantConfig()` for the tenant's country; `Modal`, `Button`, `Input`, `FormField`, `Badge` from `src/components/ui/`; TanStack Query (`useQuery`/`useMutation` + a new key in `src/lib/queryKeys.ts`).
- Produces: the post-onboarding surface to add a second GSTIN (e.g. a Mumbai branch registration) — the walkthrough's "add a GSTIN/nexus state post-onboarding" requirement; reused unchanged for US nexus in Phase 5.

- [ ] **Step 1: Write the failing test**

```typescript
// src/pages/settings/TaxRegistrationsSettings.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaxRegistrationsSettings } from './TaxRegistrationsSettings';

vi.mock('../../lib/taxRegistrationService', () => ({
  listTaxRegistrations: vi.fn().mockResolvedValue([
    { id: 'r1', tax_number: '29ABCDE1234F1Z5', scheme: 'standard', subdivision_id: 's-ka',
      registered_from: '2026-07-01', registered_to: null, is_primary: true, legal_entity_id: 'le1',
      country_id: 'c-in', tenant_id: 't1', created_at: '', deleted_at: null },
  ]),
  createTaxRegistration: vi.fn(), endTaxRegistration: vi.fn(), setPrimaryTaxRegistration: vi.fn(),
}));
vi.mock('../../lib/geoCountryService', () => ({
  geoCountryService: {
    listCountrySubdivisions: vi.fn().mockResolvedValue([
      { id: 's-ka', code: 'IN-KA', name: 'Karnataka', subdivision_type: 'state', tax_authority_code: '29' },
    ]),
  },
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useTaxConfig: () => ({ system: 'GST', label: 'GST', numberLabel: 'GSTIN',
    numberFormat: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$', numberPlaceholder: '22AAAAA0000A1Z5',
    defaultRate: 18, invoiceRequired: true }),
  useTenantConfig: () => ({ config: { tenantId: 't1', countryCode: 'IN' }, loading: false }),
}));

it('lists registrations with the primary badge and an Add action', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><TaxRegistrationsSettings /></QueryClientProvider>);
  expect(await screen.findByText('29ABCDE1234F1Z5')).toBeInTheDocument();
  expect(screen.getByText(/primary/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add registration/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/pages/settings/TaxRegistrationsSettings.test.tsx`
Expected: FAIL — `Cannot find module './TaxRegistrationsSettings'`.

- [ ] **Step 3: Implement the page**

```tsx
// src/pages/settings/TaxRegistrationsSettings.tsx
// Post-onboarding seller tax registrations (multi-GSTIN today, US nexus in Phase 5).
// maxOverrideLayer discipline does not apply here: registrations are tenant FACTS,
// not statutory config. Semantic tokens only per DESIGN.md.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import { Badge } from '../../components/ui/Badge';
import { useTaxConfig, useTenantConfig } from '../../contexts/TenantConfigContext';
import { geoCountryService, type CountrySubdivision } from '../../lib/geoCountryService';
import {
  listTaxRegistrations, createTaxRegistration, endTaxRegistration, setPrimaryTaxRegistration,
} from '../../lib/taxRegistrationService';
import { validateGSTIN } from '../../lib/regimes/in_gst/gstin';

const REG_KEY = ['settings', 'tax-registrations'] as const;

export const TaxRegistrationsSettings: React.FC = () => {
  const tax = useTaxConfig();
  const { config } = useTenantConfig();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [taxNumber, setTaxNumber] = useState('');
  const [subdivisionId, setSubdivisionId] = useState('');
  const [scheme, setScheme] = useState<'standard' | 'composition' | 'unregistered'>('standard');

  const { data: registrations = [] } = useQuery({ queryKey: REG_KEY, queryFn: () => listTaxRegistrations() });
  const primary = registrations.find((r) => r.is_primary);
  const countryId = registrations[0]?.country_id ?? '';
  const { data: subdivisions = [] } = useQuery<CountrySubdivision[]>({
    queryKey: ['settings', 'tax-subdivisions', countryId],
    queryFn: () => geoCountryService.listCountrySubdivisions(countryId),
    enabled: !!countryId,
  });

  const selected = subdivisions.find((s) => s.id === subdivisionId) ?? null;
  const check = taxNumber.trim()
    ? validateGSTIN(taxNumber, tax.numberFormat, selected
        ? { code: selected.code, tax_authority_code: selected.tax_authority_code } : null)
    : null;

  const addMutation = useMutation({
    mutationFn: () => createTaxRegistration({
      legal_entity_id: primary?.legal_entity_id ?? registrations[0]?.legal_entity_id ?? '',
      country_id: countryId,
      subdivision_id: subdivisionId || null,
      tax_number: taxNumber.trim().toUpperCase(),
      scheme,
      registered_from: new Date().toISOString().slice(0, 10),
      is_primary: registrations.length === 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REG_KEY });
      setAddOpen(false); setTaxNumber(''); setSubdivisionId('');
    },
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => endTaxRegistration(id, new Date().toISOString().slice(0, 10)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REG_KEY }),
  });
  const primaryMutation = useMutation({
    mutationFn: (id: string) => setPrimaryTaxRegistration(id, primary?.legal_entity_id ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REG_KEY }),
  });

  const subdivisionName = (id: string | null) => subdivisions.find((s) => s.id === id)?.name ?? '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{tax.numberLabel} Registrations</h2>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add registration
        </Button>
      </div>

      <div className="rounded-lg border border-border divide-y divide-border bg-surface">
        {registrations.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-mono text-sm">{r.tax_number}</p>
              <p className="text-xs text-gray-500">
                {subdivisionName(r.subdivision_id)} · {r.scheme} · from {r.registered_from}
                {r.registered_to ? ` · ended ${r.registered_to}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {r.is_primary && <Badge variant="info">Primary</Badge>}
              {!r.is_primary && !r.registered_to && (
                <Button variant="secondary" size="sm" onClick={() => primaryMutation.mutate(r.id)}>Set primary</Button>
              )}
              {!r.registered_to && (
                <Button variant="secondary" size="sm" onClick={() => endMutation.mutate(r.id)}>End</Button>
              )}
            </div>
          </div>
        ))}
        {registrations.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-500">No registrations yet. Add your {tax.numberLabel}.</p>
        )}
      </div>

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title={`Add ${tax.numberLabel} registration`}>
        <div className="space-y-4">
          {subdivisions.length > 0 && (
            <FormField label="State / Union Territory" required>
              <select
                value={subdivisionId}
                onChange={(e) => setSubdivisionId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select a state…</option>
                {subdivisions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.tax_authority_code ? ` (${s.tax_authority_code})` : ''}</option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label={tax.numberLabel} required error={check && !check.ok ? check.error ?? undefined : undefined}>
            <Input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder={tax.numberPlaceholder ?? ''} />
          </FormField>
          <FormField label="Scheme" required>
            <select
              value={scheme}
              onChange={(e) => setScheme(e.target.value as typeof scheme)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="standard">Standard</option>
              <option value="composition">Composition</option>
              <option value="unregistered">Unregistered</option>
            </select>
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!taxNumber.trim() || (check !== null && !check.ok) || (subdivisions.length > 0 && !subdivisionId)}
            >
              Save registration
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
```

If `Modal`/`Button`/`FormField`/`Badge` prop names differ from the above (`isOpen/onClose/title`, `variant/size`, `label/required/error`, `variant`), match the signatures used by `src/pages/settings/AppearanceSettings.tsx` and the `src/components/ui` implementations — adjust the JSX props only, never the behavior.

- [ ] **Step 4: Run tests + register the route**

Run: `npx vitest run src/pages/settings/TaxRegistrationsSettings.test.tsx` — Expected: PASS. Add the route + nav entry per the Files block; `npm run typecheck` — 0; `npm run lint` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/TaxRegistrationsSettings.tsx src/pages/settings/TaxRegistrationsSettings.test.tsx src/App.tsx src/lib/queryKeys.ts
git commit -m "feat(settings): tax registrations manager (multi-GSTIN capture post-onboarding)"
```

**WP-4 verification:** `npx vitest run src/lib/taxRegistrationService.test.ts src/pages/settings/TaxRegistrationsSettings.test.tsx src/pages/auth/onboarding/steps/JurisdictionStep.test.tsx` green; `npm run geo:test` green (provision guards); `npm run typecheck` = 0.

---

### Work Package WP-5 — Fiscal-Year Numbering Defaults (Tasks 16–17, one PR)

### Task 16: `in_fiscal_numbering` NumberingPolicy plugin

**Files:**
- Create: `src/lib/regimes/in_gst/numbering.ts`
- Modify: `src/lib/regimes/register.ts` (register)
- Test: `src/lib/regimes/in_gst/numbering.test.ts`

**Interfaces:**
- Consumes: `NumberingPolicy`, `NumberSequenceSeed` from `src/lib/regimes/types.ts`; `registerRegimePlugin`/`resolveNumberingPolicy` (Phase 1).
- Produces: `inFiscalNumberingPolicy: NumberingPolicy` (key `'in_fiscal_numbering'`) whose `defaultSequences` mirrors the Task 3 `master_numbering_policies` rows — consumed by tenant provisioning's sequence seeding (Phase 3 machinery keyed on `regime.numbering`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/in_gst/numbering.test.ts
import { describe, it, expect } from 'vitest';
import { inFiscalNumberingPolicy } from './numbering';
import { resolveNumberingPolicy } from '../registry';
import '../register';

describe('in_fiscal_numbering policy', () => {
  it('is registered and identity-correct', () => {
    expect(resolveNumberingPolicy('in_fiscal_numbering')).toBe(inFiscalNumberingPolicy);
    expect(inFiscalNumberingPolicy.key).toBe('in_fiscal_numbering');
    expect(inFiscalNumberingPolicy.version).toBe('1.0.0');
  });

  it('seeds INV/{FY}/{SEQ:4} fiscal-anchored 04-01 with the 16-char cap', () => {
    const seeds = inFiscalNumberingPolicy.defaultSequences({ countryCode: 'IN', fiscalYearStart: '04-01' });
    const invoices = seeds.find((s) => s.scope === 'invoices');
    expect(invoices).toEqual({
      scope: 'invoices', prefix: null, format_template: 'INV/{FY}/{SEQ:4}',
      reset_basis: 'fiscal_year', fiscal_year_anchor: '04-01', max_length: 16, padding: 4,
    });
    const quote = seeds.find((s) => s.scope === 'quote');
    expect(quote?.format_template).toBe('QUO/{FY}/{SEQ:4}');
  });

  it('rendered length fits rule 46(b): INV/2026-27/0042 is exactly 16 characters', () => {
    const rendered = 'INV/{FY}/{SEQ:4}'.replace('{FY}', '2026-27').replace('{SEQ:4}', '0042');
    expect(rendered).toBe('INV/2026-27/0042');
    expect(rendered.length).toBe(16);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/in_gst/numbering.test.ts` — Expected: FAIL (`Cannot find module './numbering'`).

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/in_gst/numbering.ts
// CGST Rules rule 46(b): consecutive serial number, unique for a financial year,
// max 16 characters. The template/anchor here MUST mirror the master_numbering_policies
// rows seeded in migration india_pack_bindings — the publish gate's numbering render
// check (gate ④) validates both against max_length.
import type { NumberingPolicy, NumberSequenceSeed } from '../types';

export const inFiscalNumberingPolicy: NumberingPolicy = {
  key: 'in_fiscal_numbering',
  version: '1.0.0',
  defaultSequences(country: { countryCode: string; fiscalYearStart: string }): NumberSequenceSeed[] {
    const anchor = country.fiscalYearStart || '04-01';
    return [
      { scope: 'invoices', prefix: null, format_template: 'INV/{FY}/{SEQ:4}',
        reset_basis: 'fiscal_year', fiscal_year_anchor: anchor, max_length: 16, padding: 4 },
      { scope: 'quote', prefix: null, format_template: 'QUO/{FY}/{SEQ:4}',
        reset_basis: 'fiscal_year', fiscal_year_anchor: anchor, max_length: 16, padding: 4 },
    ];
  },
};
```

And in `src/lib/regimes/register.ts` add:

```typescript
import { inFiscalNumberingPolicy } from './in_gst/numbering';
registerRegimePlugin('numbering', inFiscalNumberingPolicy);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_gst/numbering.test.ts` — Expected: 3 passed. `npm run typecheck` — 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/in_gst/numbering.ts src/lib/regimes/in_gst/numbering.test.ts src/lib/regimes/register.ts
git commit -m "feat(regimes): in_fiscal_numbering policy (INV/{FY}/{SEQ:4}, 04-01 anchor, 16-char cap)"
```

### Task 17: Live probe — `get_next_number` v2 renders and fiscally resets the India template

**Files:**
- Create: `scripts/country-packs/in-numbering.live.test.ts` (scripts vitest project; self-skips without `SUPABASE_DB_URL`, mirroring `scripts/country-engine/registry-trigger-parity.test.ts`)

**Interfaces:**
- Consumes: `get_next_number(p_scope)` v2 and `preview_number_format(p_scope, p_format_template)` (Phase 1 RPCs); `number_sequences` dormant fiscal columns (live, all NULL today).
- Produces: the live regression pin that India's template renders ≤16 chars and resets on the fiscal boundary in tenant time.

- [ ] **Step 1: Write the live test**

```typescript
// scripts/country-packs/in-numbering.live.test.ts
// Live-DB numbering probe (scripts project). Self-skips without SUPABASE_DB_URL —
// the same convention as scripts/country-engine/registry-trigger-parity.test.ts.
// Uses a THROWAWAY scope name so real legal sequences are never touched.
import { describe, it, expect } from 'vitest';
import { Client } from 'pg';

const url = process.env.SUPABASE_DB_URL;
const d = describe.skipIf(!url);

d('India fiscal numbering (live)', () => {
  it('preview_number_format renders INV/{FY}/{SEQ:4} within 16 chars', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const { rows } = await client.query(
        "SELECT preview_number_format('invoices', 'INV/{FY}/{SEQ:4}') AS preview",
      );
      const preview: string = rows[0].preview;
      expect(preview).toMatch(/^INV\/\d{4}-\d{2}\/\d{4}$/);
      expect(preview.length).toBeLessThanOrEqual(16);
    } finally {
      await client.end();
    }
  });
});
```

(If `pg` is not already a devDependency used by the scripts project, use the same DB client the existing `scripts/country-engine` live specs use — open `scripts/country-engine/registry-trigger-parity.test.ts` and mirror its connection helper exactly; do not add a new package.)

- [ ] **Step 2: Run it**

Run: `npm run geo:test -- scripts/country-packs/in-numbering.live.test.ts`
Expected: SKIPPED locally (no `SUPABASE_DB_URL`); PASSES in CI where the secret exists. Additionally run the equivalent probe once via `mcp__supabase__execute_sql` to verify against the live project now:

```sql
SELECT preview_number_format('invoices', 'INV/{FY}/{SEQ:4}') AS preview,
       length(preview_number_format('invoices', 'INV/{FY}/{SEQ:4}')) AS len;
```

Expected: `preview` like `INV/2026-27/…`, `len <= 16`.

- [ ] **Step 3: Commit**

```bash
git add scripts/country-packs/in-numbering.live.test.ts
git commit -m "test(numbering): live pin — India FY template renders within the 16-char cap"
```

**WP-5 verification:** unit + live tests green; `SELECT format_template, reset_basis, fiscal_year_anchor, max_length FROM master_numbering_policies p JOIN geo_countries c ON c.id=p.country_id AND c.code='IN'` returns the two Task-3 rows.

---

### Work Package WP-6 — GSTR Composers (Tasks 18–21, one PR)

### Task 18: `gstrPeriodBounds` — monthly Apr–Mar periods, Asia/Kolkata, date-string math

**Files:**
- Create: `src/lib/regimes/gstr/periods.ts`
- Test: `src/lib/regimes/gstr/periods.test.ts`

**Interfaces:**
- Consumes: nothing (pure — deliberately no `Date`-to-ISO conversions; all arithmetic on 'YYYY-MM-DD' strings, the Phase-0 UTC-boundary lesson).
- Produces: `gstrPeriodBounds(filingFrequency, periodAnchor, forDate, timezone)` and `fiscalYearLabel(forDate, periodAnchor)` — consumed by Tasks 19, 21 and by `get_next_number`-adjacent display (the `{FY}` label mirrors the DB token).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/gstr/periods.test.ts
import { describe, it, expect } from 'vitest';
import { gstrPeriodBounds, fiscalYearLabel } from './periods';

describe('gstrPeriodBounds (monthly, 04-01 anchor, Asia/Kolkata)', () => {
  it('mid-month resolves the calendar month', () => {
    expect(gstrPeriodBounds('monthly', '04-01', '2026-07-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-07-01', periodEnd: '2026-07-31', taxPeriods: ['2026-07'],
    });
  });
  it('month-end boundary stays in its month (no UTC drift — pure string math)', () => {
    expect(gstrPeriodBounds('monthly', '04-01', '2026-07-31', 'Asia/Kolkata').taxPeriods).toEqual(['2026-07']);
    expect(gstrPeriodBounds('monthly', '04-01', '2026-08-01', 'Asia/Kolkata').taxPeriods).toEqual(['2026-08']);
  });
  it('February leap handling', () => {
    expect(gstrPeriodBounds('monthly', '04-01', '2028-02-10', 'Asia/Kolkata').periodEnd).toBe('2028-02-29');
    expect(gstrPeriodBounds('monthly', '04-01', '2027-02-10', 'Asia/Kolkata').periodEnd).toBe('2027-02-28');
  });
  it('annual resolves the Apr–Mar fiscal year containing forDate', () => {
    expect(gstrPeriodBounds('annual', '04-01', '2026-07-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-04-01', periodEnd: '2027-03-31',
      taxPeriods: ['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03'],
    });
    expect(gstrPeriodBounds('annual', '04-01', '2026-02-15', 'Asia/Kolkata').periodStart).toBe('2025-04-01');
  });
  it('quarterly resolves fiscal quarters off the anchor (QRMP)', () => {
    expect(gstrPeriodBounds('quarterly', '04-01', '2026-07-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-07-01', periodEnd: '2026-09-30', taxPeriods: ['2026-07', '2026-08', '2026-09'],
    });
  });
});

describe('fiscalYearLabel', () => {
  it("renders the {FY} form: '2026-27' for Jul 2026, '2025-26' for Feb 2026", () => {
    expect(fiscalYearLabel('2026-07-15', '04-01')).toBe('2026-27');
    expect(fiscalYearLabel('2026-02-15', '04-01')).toBe('2025-26');
    expect(fiscalYearLabel('2026-04-01', '04-01')).toBe('2026-27');
    expect(fiscalYearLabel('2026-03-31', '04-01')).toBe('2025-26');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/gstr/periods.test.ts` — Expected: FAIL (`Cannot find module './periods'`).

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/gstr/periods.ts
// GSTR period math. PURE STRING ARITHMETIC on 'YYYY-MM-DD' — never new Date()
// .toISOString() (the Phase-0 VATReturnModal UTC-boundary bug class). The timezone
// argument documents intent (forDate must already be tenant-local via tenantToday);
// it is not used for conversion here.

const pad2 = (n: number) => String(n).padStart(2, '0');

const daysInMonth = (year: number, month: number): number =>
  [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
   31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

function parseYmd(d: string): { y: number; m: number; day: number } {
  const [y, m, day] = d.split('-').map(Number);
  return { y, m, day };
}

function monthsFrom(y: number, m: number, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = (y * 12 + (m - 1)) + i;
    out.push(`${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`);
  }
  return out;
}

/** Fiscal year start (year) for a date under an 'MM-DD' anchor. */
function fiscalStartYear(forDate: string, periodAnchor: string): number {
  const { y, m, day } = parseYmd(forDate);
  const [am, ad] = periodAnchor.split('-').map(Number);
  const beforeAnchor = m < am || (m === am && day < ad);
  return beforeAnchor ? y - 1 : y;
}

export function fiscalYearLabel(forDate: string, periodAnchor: string): string {
  const start = fiscalStartYear(forDate, periodAnchor);
  return `${start}-${pad2((start + 1) % 100)}`;
}

export function gstrPeriodBounds(
  filingFrequency: 'monthly' | 'quarterly' | 'annual',
  periodAnchor: string,
  forDate: string,
  _timezone: string,
): { periodStart: string; periodEnd: string; taxPeriods: string[] } {
  const { y, m } = parseYmd(forDate);
  const [anchorMonth] = periodAnchor.split('-').map(Number);

  if (filingFrequency === 'monthly') {
    return {
      periodStart: `${y}-${pad2(m)}-01`,
      periodEnd: `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`,
      taxPeriods: [`${y}-${pad2(m)}`],
    };
  }

  if (filingFrequency === 'quarterly') {
    const fy = fiscalStartYear(forDate, periodAnchor);
    const monthsSinceAnchor = (y * 12 + (m - 1)) - (fy * 12 + (anchorMonth - 1));
    const quarterIndex = Math.floor(monthsSinceAnchor / 3);
    const startTotal = fy * 12 + (anchorMonth - 1) + quarterIndex * 3;
    const sy = Math.floor(startTotal / 12);
    const sm = (startTotal % 12) + 1;
    const endTotal = startTotal + 2;
    const ey = Math.floor(endTotal / 12);
    const em = (endTotal % 12) + 1;
    return {
      periodStart: `${sy}-${pad2(sm)}-01`,
      periodEnd: `${ey}-${pad2(em)}-${pad2(daysInMonth(ey, em))}`,
      taxPeriods: monthsFrom(sy, sm, 3),
    };
  }

  const fy = fiscalStartYear(forDate, periodAnchor);
  const endTotal = fy * 12 + (anchorMonth - 1) + 11;
  const ey = Math.floor(endTotal / 12);
  const em = (endTotal % 12) + 1;
  return {
    periodStart: `${fy}-${pad2(anchorMonth)}-01`,
    periodEnd: `${ey}-${pad2(em)}-${pad2(daysInMonth(ey, em))}`,
    taxPeriods: monthsFrom(fy, anchorMonth, 12),
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/gstr/periods.test.ts` — Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/gstr/periods.ts src/lib/regimes/gstr/periods.test.ts
git commit -m "feat(regimes): GSTR period math — monthly/quarterly/annual on the 04-01 anchor, string-safe"
```

### Task 19: `gstr` ReturnComposer — GSTR-3B from the component ledger

**Files:**
- Create: `src/lib/regimes/gstr/index.ts`
- Modify: `src/lib/regimes/register.ts` (register)
- Test: `src/lib/regimes/gstr/index.test.ts`

**Interfaces:**
- Consumes: `ReturnComposer`, `ComposedReturn`, `ReturnBoxLine`, `VatRecordRow` from `src/lib/regimes/types.ts`; `gstrPeriodBounds` (Task 18); `CountryConfigError` from `src/lib/country/resolveCountryConfig.ts:42` (the contract's "ConfigError" — this is the platform's config-error class); `roundMoney` from `src/lib/financialMath.ts:13`.
- Produces: `gstrComposer: ReturnComposer` (key `'gstr'`) resolvable via `resolveReturnComposer('gstr')` — consumed by Task 21 and the Phase-3 return-creation path once India resolves its regime.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/regimes/gstr/index.test.ts
import { describe, it, expect } from 'vitest';
import { gstrComposer } from './index';
import { resolveReturnComposer } from '../registry';
import '../register';
import type { VatRecordRow } from '../types';

// Minimal VatRecordRow shaping helper — only the columns the composer reads.
const row = (over: Partial<VatRecordRow>): VatRecordRow => ({
  id: 'v1', tenant_id: 't1', record_type: 'sale', record_id: 'doc1',
  vat_amount: 0, vat_rate: 18, tax_period: '2026-07',
  currency: 'INR', exchange_rate: 1, vat_amount_base: 0, taxable_amount_base: 0,
  component_code: 'IGST', jurisdiction_ref: null, tax_treatment: 'standard',
  regime_key: 'in_gst', tax_point_date: '2026-07-15',
  source_document_type: 'invoice', source_document_id: 'doc1',
  created_at: '', updated_at: '', deleted_at: null,
} as VatRecordRow);

const input = (ledgerRows: VatRecordRow[]) => ({
  tenantId: 't1', legalEntityId: 'le1', taxPeriods: ['2026-07'],
  ledgerRows, jurisdictionCurrency: 'INR', baseCurrency: 'INR',
});

describe('gstr composer — GSTR-3B', () => {
  it('is registered with contract identity', () => {
    expect(resolveReturnComposer('gstr')).toBe(gstrComposer);
    expect(gstrComposer.key).toBe('gstr');
    expect(gstrComposer.periodBounds('monthly', '04-01', '2026-07-15', 'Asia/Kolkata').taxPeriods).toEqual(['2026-07']);
  });

  it('throws CountryConfigError on base ≠ jurisdiction currency (graft 7 — never a silent mixed sum)', () => {
    expect(() => gstrComposer.compose({ ...input([]), baseCurrency: 'USD' }))
      .toThrowError(/jurisdiction/i);
  });

  it('composes 3.1(a) outward taxable + per-component tax, split CGST/SGST/IGST', () => {
    const rows = [
      row({ component_code: 'CGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ component_code: 'SGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ id: 'v2', record_id: 'doc2', component_code: 'IGST', vat_amount_base: 16200, taxable_amount_base: 90000 }),
    ];
    const result = gstrComposer.compose(input(rows));
    const box = (code: string) => result.boxes.find((b) => b.boxCode === code)?.amountBase;
    // taxable counted once per document-component-set: CGST+SGST share one 90,000 base
    expect(box('3.1(a).taxable')).toBe(180000);
    expect(box('3.1(a).cgst')).toBe(8100);
    expect(box('3.1(a).sgst')).toBe(8100);
    expect(box('3.1(a).igst')).toBe(16200);
  });

  it('routes zero-rated to 3.1(b), exempt to 3.1(c), inward RCM to 3.1(d), purchases to ITC 4(A)(5)', () => {
    const rows = [
      row({ tax_treatment: 'zero_rated', vat_amount_base: 0, taxable_amount_base: 50000 }),
      row({ id: 'v3', record_id: 'd3', tax_treatment: 'exempt', vat_amount_base: 0, taxable_amount_base: 1000 }),
      row({ id: 'v4', record_id: 'd4', record_type: 'purchase', tax_treatment: 'reverse_charge', component_code: 'IGST', vat_amount_base: 900, taxable_amount_base: 5000 }),
      row({ id: 'v5', record_id: 'd5', record_type: 'purchase', tax_treatment: 'standard', component_code: 'CGST', vat_amount_base: 450, taxable_amount_base: 2500 }),
    ];
    const result = gstrComposer.compose(input(rows));
    const box = (code: string) => result.boxes.find((b) => b.boxCode === code)?.amountBase;
    expect(box('3.1(b).taxable')).toBe(50000);
    expect(box('3.1(c).taxable')).toBe(1000);
    expect(box('3.1(d).taxable')).toBe(5000);
    expect(box('3.1(d).igst')).toBe(900);
    expect(box('4(A)(5).cgst')).toBe(450);
  });

  it('credit-note contra rows (negative amounts) net into the same boxes', () => {
    const rows = [
      row({ component_code: 'CGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ id: 'v6', record_id: 'cn1', component_code: 'CGST', vat_amount_base: -8100, taxable_amount_base: -90000, source_document_type: 'credit_note' }),
    ];
    const result = gstrComposer.compose(input(rows));
    expect(result.boxes.find((b) => b.boxCode === '3.1(a).cgst')?.amountBase).toBe(0);
  });

  it('boxes are deterministic and sequenced', () => {
    const r1 = gstrComposer.compose(input([row({})]));
    const r2 = gstrComposer.compose(input([row({})]));
    expect(r1.boxes).toEqual(r2.boxes);
    expect(r1.boxes.map((b) => b.sequence)).toEqual([...r1.boxes.map((b) => b.sequence)].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/regimes/gstr/index.test.ts` — Expected: FAIL (`Cannot find module './index'`).

- [ ] **Step 3: Minimal implementation**

```typescript
// src/lib/regimes/gstr/index.ts
// GSTR-3B composer. Consumes ONLY the base-currency component ledger (vat_records
// filtered by tax_period — never created_at) per the contract. Box vocabulary is the
// GSTR-3B section list; each (section × component) is one ReturnBoxLine so the
// persisted tax_return_lines are filable without re-aggregation. HSN summary (GSTR-1)
// lives in ./hsnSummary.ts — a deliberate sibling (AD-4), same tax_return_lines sink.
import type { ReturnComposer, ComposedReturn, ReturnBoxLine, VatRecordRow } from '../types';
import { CountryConfigError } from '../../country/resolveCountryConfig';
import { roundMoney } from '../../financialMath';
import { gstrPeriodBounds } from './periods';

const COMPONENTS = ['igst', 'cgst', 'sgst'] as const;
type Component = (typeof COMPONENTS)[number];

interface Bucket { taxable: number; igst: number; cgst: number; sgst: number; }
const newBucket = (): Bucket => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });

const SECTIONS: Array<{ code: string; label: string }> = [
  { code: '3.1(a)', label: 'Outward taxable supplies (other than zero rated, nil rated and exempted)' },
  { code: '3.1(b)', label: 'Outward taxable supplies (zero rated)' },
  { code: '3.1(c)', label: 'Other outward supplies (nil rated, exempted)' },
  { code: '3.1(d)', label: 'Inward supplies (liable to reverse charge)' },
  { code: '4(A)(5)', label: 'ITC Available — All other ITC' },
  { code: '6.1',    label: 'Payment of tax' },
];

function sectionFor(r: VatRecordRow): string | null {
  const treatment = (r as { tax_treatment: string | null }).tax_treatment ?? 'standard';
  const recordType = (r as { record_type: string }).record_type;
  if (treatment === 'out_of_scope') return null;
  if (recordType === 'sale') {
    if (treatment === 'zero_rated') return '3.1(b)';
    if (treatment === 'exempt') return '3.1(c)';
    return '3.1(a)';
  }
  // purchases
  if (treatment === 'reverse_charge') return '3.1(d)';
  return '4(A)(5)';
}

function componentOf(r: VatRecordRow): Component | null {
  const code = ((r as { component_code: string | null }).component_code ?? '').toLowerCase();
  return (COMPONENTS as readonly string[]).includes(code) ? (code as Component) : null;
}

export const gstrComposer: ReturnComposer = {
  key: 'gstr',
  version: '1.0.0',

  periodBounds(filingFrequency, periodAnchor, forDate, timezone) {
    return gstrPeriodBounds(filingFrequency, periodAnchor, forDate, timezone);
  },

  compose(input): ComposedReturn {
    if (input.baseCurrency !== input.jurisdictionCurrency) {
      throw new CountryConfigError(
        `GSTR returns file in the jurisdiction currency (${input.jurisdictionCurrency}) but the tenant base is ${input.baseCurrency}. ` +
        'Multi-jurisdiction bases are the reserved per-registration seam — not silently mixable.',
      );
    }

    const buckets = new Map<string, Bucket>(SECTIONS.map((s) => [s.code, newBucket()]));
    // Taxable base is per (document, section): CGST+SGST rows of one document share
    // one taxable amount — count it once per document per section.
    const countedTaxable = new Set<string>();

    for (const r of input.ledgerRows) {
      const section = sectionFor(r);
      if (!section) continue;
      const bucket = buckets.get(section)!;
      const component = componentOf(r);
      const taxBase = Number((r as { vat_amount_base: number | null }).vat_amount_base ?? 0);
      const taxableBase = Number((r as { taxable_amount_base: number | null }).taxable_amount_base ?? 0);
      if (component) bucket[component] += taxBase;
      const docKey = `${section}:${(r as { source_document_id: string | null }).source_document_id ?? (r as { record_id: string }).record_id}:${component === 'sgst' ? 'pair' : component === 'cgst' ? 'pair' : component ?? 'none'}`;
      if (!countedTaxable.has(docKey)) {
        countedTaxable.add(docKey);
        bucket.taxable += taxableBase;
      }
    }

    // 6.1 payment of tax = outward + RCM − ITC, per component.
    const pay = buckets.get('6.1')!;
    for (const c of COMPONENTS) {
      pay[c] = roundMoney(
        buckets.get('3.1(a)')![c] + buckets.get('3.1(b)')![c] + buckets.get('3.1(d)')![c] - buckets.get('4(A)(5)')![c],
        2,
      );
    }

    const boxes: ReturnBoxLine[] = [];
    let sequence = 1;
    for (const s of SECTIONS) {
      const b = buckets.get(s.code)!;
      if (s.code !== '6.1') {
        boxes.push({ boxCode: `${s.code}.taxable`, boxLabel: `${s.label} — taxable value`, amountBase: roundMoney(b.taxable, 2), sequence: sequence++ });
      }
      for (const c of COMPONENTS) {
        boxes.push({ boxCode: `${s.code}.${c}`, boxLabel: `${s.label} — ${c.toUpperCase()}`, amountBase: roundMoney(b[c], 2), sequence: sequence++ });
      }
    }

    return { boxes, meta: { composer: 'gstr', form: 'GSTR-3B', taxPeriods: input.taxPeriods } };
  },
};
```

Registration in `src/lib/regimes/register.ts`:

```typescript
import { gstrComposer } from './gstr';
registerRegimePlugin('return', gstrComposer);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/gstr/index.test.ts` — Expected: 6 passed. `npm run typecheck` — 0.
(If the `3.1(a).taxable = 180000` expectation exposes double-counting in the pair-dedup key, fix `docKey` so CGST+SGST of one document count taxable ONCE per document while IGST documents count once — the test's 180,000 = doc1's 90,000 (CGST/SGST pair, counted once) + doc2's 90,000 (IGST).)

- [ ] **Step 5: Commit**

```bash
git add src/lib/regimes/gstr/index.ts src/lib/regimes/gstr/index.test.ts src/lib/regimes/register.ts
git commit -m "feat(regimes): gstr ReturnComposer — GSTR-3B boxes from the component ledger"
```

### Task 20: GSTR-1 HSN summary composer + line-aggregate fetch

**Files:**
- Create: `src/lib/regimes/gstr/hsnSummary.ts`
- Modify: `src/lib/vatService.ts` (append `fetchHsnLineAggregates` + `saveTaxReturnLines` after `getQuarterlyVATSummary`, which ends near `src/lib/vatService.ts:303` on main; keep the `vatService` barrel at `:305` updated with both)
- Test: `src/lib/regimes/gstr/hsnSummary.test.ts`, extend `src/lib/vatService.test.ts`

**Interfaces:**
- Consumes: `ReturnBoxLine` (Phase 1); `roundMoney` (`financialMath.ts:13`); `supabase`; `document_tax_lines` + `vat_records` shapes (Phase 1); `invoice_line_items.item_code/unit_code/quantity` (Phase 2 columns).
- Produces: `HsnLineAggregate`, `composeGstr1HsnSummary(rows, startSequence): ReturnBoxLine[]`, `fetchHsnLineAggregates(taxPeriods): Promise<HsnLineAggregate[]>`, `saveTaxReturnLines(vatReturnId, boxes): Promise<void>` — consumed by Task 21.

- [ ] **Step 1: Write the failing composer test**

```typescript
// src/lib/regimes/gstr/hsnSummary.test.ts
import { describe, it, expect } from 'vitest';
import { composeGstr1HsnSummary, type HsnLineAggregate } from './hsnSummary';

const rows: HsnLineAggregate[] = [
  { itemCode: '998713', unitCode: 'NOS', quantity: 3, taxableBase: 135000, componentTaxBase: { CGST: 12150, SGST: 12150 } },
  { itemCode: '998713', unitCode: 'NOS', quantity: 2, taxableBase: 90000, componentTaxBase: { IGST: 16200 } },
  { itemCode: '4907',   unitCode: 'NOS', quantity: 10, taxableBase: 1000, componentTaxBase: { CGST: 25, SGST: 25 } },
];

describe('composeGstr1HsnSummary', () => {
  it('aggregates quantity + taxable + per-component tax per item_code into ReturnBoxLines', () => {
    const boxes = composeGstr1HsnSummary(rows, 100);
    const hsn998713 = boxes.find((b) => b.boxCode === 'hsn.998713');
    expect(hsn998713).toBeDefined();
    expect(hsn998713?.quantity).toBe(5);
    expect(hsn998713?.unitCode).toBe('NOS');
    expect(hsn998713?.amountBase).toBe(225000);                       // taxable
    expect(hsn998713?.meta).toEqual({ cgst: 12150, sgst: 12150, igst: 16200, total_tax: 40500 });
  });
  it('sequences from startSequence, deterministic order by item code', () => {
    const boxes = composeGstr1HsnSummary(rows, 100);
    expect(boxes.map((b) => b.boxCode)).toEqual(['hsn.4907', 'hsn.998713']);
    expect(boxes.map((b) => b.sequence)).toEqual([100, 101]);
  });
});
```

Run: `npx vitest run src/lib/regimes/gstr/hsnSummary.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement the composer**

```typescript
// src/lib/regimes/gstr/hsnSummary.ts
// GSTR-1 Table 12 (HSN summary): quantity + UQC + taxable + per-component tax per
// item_code. Sourced from LINE data (AD-4) — vat_records stays amount-only.
import type { ReturnBoxLine } from '../types';
import { roundMoney } from '../../financialMath';

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

- [ ] **Step 3: Add the service fetch + persistence (with failing tests first)**

Append to `src/lib/vatService.test.ts`:

Upgrade the file's module mock so `from` is a reconfigurable spy (the file currently hard-codes it) — `const { from } = vi.hoisted(() => ({ from: vi.fn() }));` + `vi.mock('./supabaseClient', () => ({ supabase: { from } }));` — then add a thenable builder and the two describes:

```typescript
// A thenable query builder: every chain method returns the builder, and awaiting it
// at ANY point resolves to the table's rows (so the terminal method can vary per query).
function chainFor(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<{ data: unknown; error: unknown }>;
}

import { fetchHsnLineAggregates, saveTaxReturnLines } from './vatService';

describe('fetchHsnLineAggregates', () => {
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

    // the period dimension is tax_period — NEVER created_at (the vatService.ts:279 divergence)
    expect(vatChain.in).toHaveBeenCalledWith('tax_period', ['2026-07']);
    expect(rows).toEqual([
      { itemCode: '998713', unitCode: 'NOS', quantity: 2, taxableBase: 90000, componentTaxBase: { CGST: 8100, SGST: 8100 } },
    ]);
  });
});

describe('saveTaxReturnLines', () => {
  it('inserts one tax_return_lines row per box with vat_return_id stamped', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ insert } as never);
    await saveTaxReturnLines('ret1', [
      { boxCode: '3.1a', boxLabel: 'Outward taxable', amountBase: 90000, sequence: 0 },
      { boxCode: 'hsn.998713', boxLabel: 'HSN 998713', amountBase: 90000, quantity: 2, unitCode: 'NOS', sequence: 1 },
    ]);
    expect(from).toHaveBeenCalledWith('tax_return_lines');
    const rows = insert.mock.calls[0][0] as Array<{ vat_return_id: string; box_code: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.vat_return_id === 'ret1')).toBe(true);
    expect(rows[1].box_code).toBe('hsn.998713');
  });
});
```

Implement in `src/lib/vatService.ts` (append after `getQuarterlyVATSummary`, before the `vatService` barrel):

```typescript
import { roundMoney } from './financialMath';
import type { HsnLineAggregate } from './regimes/gstr/hsnSummary';
import type { ReturnBoxLine } from './regimes/types';

/**
 * GSTR-1 HSN summary source (AD-4): line-level aggregates for the invoices whose
 * ledger rows fall in the given tax periods. tax_period is THE period dimension —
 * never created_at (the vatService.ts:279 divergence this program closes).
 */
export const fetchHsnLineAggregates = async (taxPeriods: string[]): Promise<HsnLineAggregate[]> => {
  const { data: ledger, error: ledgerError } = await supabase
    .from('vat_records')
    .select('source_document_id')
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

  const byLine = new Map<string, { taxable: number; components: Record<string, number> }>();
  for (const t of taxLines ?? []) {
    const key = t.line_item_id as string;
    const agg = byLine.get(key) ?? { taxable: 0, components: {} };
    // taxable_base is document-currency; convert once at the frozen row rate.
    const rate = Number(t.exchange_rate ?? 1);
    if (!(t.component_code in agg.components)) {
      // taxable counts once per line (CGST+SGST share the line's base)
      if (Object.keys(agg.components).length === 0) {
        agg.taxable = roundMoney(Number(t.taxable_base ?? 0) * rate, 2);
      }
    }
    agg.components[t.component_code] = roundMoney(
      (agg.components[t.component_code] ?? 0) + Number(t.tax_amount_base ?? 0), 2,
    );
    byLine.set(key, agg);
  }

  return (lines ?? [])
    .filter((l) => l.item_code)
    .map((l) => {
      const tax = byLine.get(l.id) ?? { taxable: 0, components: {} };
      return {
        itemCode: l.item_code as string,
        unitCode: (l.unit_code as string | null) ?? null,
        quantity: Number(l.quantity ?? 0),
        taxableBase: tax.taxable,
        componentTaxBase: tax.components,
      };
    });
};

/** Persist composed boxes as tax_return_lines children of a vat_return. */
export const saveTaxReturnLines = async (vatReturnId: string, boxes: ReturnBoxLine[]): Promise<void> => {
  if (boxes.length === 0) return;
  const rows = boxes.map((b) => ({
    vat_return_id: vatReturnId,
    box_code: b.boxCode,
    box_label: b.boxLabel,
    amount_base: b.amountBase,
    quantity: b.quantity ?? null,
    unit_code: b.unitCode ?? null,
    meta: b.meta ?? null,
    sequence: b.sequence,
  }));
  const { error } = await supabase.from('tax_return_lines').insert(rows);
  if (error) throw error;
};
```

Fill in the two test bodies against the file's existing supabase mock harness (assert `.in('tax_period', taxPeriods)` was called on `vat_records`, and that `saveTaxReturnLines` inserts `boxes.length` rows carrying `vat_return_id`), then:

Run: `npx vitest run src/lib/vatService.test.ts src/lib/regimes/gstr/hsnSummary.test.ts` — Expected: PASS. `npm run typecheck` — 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/regimes/gstr/hsnSummary.ts src/lib/regimes/gstr/hsnSummary.test.ts src/lib/vatService.ts src/lib/vatService.test.ts
git commit -m "feat(returns): GSTR-1 HSN summary composer + line-aggregate fetch + tax_return_lines persistence"
```

### Task 21: Wire the GSTR return path end-to-end (service + return UI labels)

**Files:**
- Modify: `src/lib/vatService.ts` — add `createGstReturnForPeriod` beside `createVATReturnFromPeriod` (`src/lib/vatService.ts:149` on main)
- Modify: the Phase-3 return-creation UI call site (`VATReturnModal.tsx` successor) — route `regime_key='gstr'` tenants through the new function; grep `createVATReturnFromPeriod` for the exact call site after Phase 3's rewrite
- Test: extend `src/lib/vatService.test.ts`

**Interfaces:**
- Consumes: `gstrComposer` (Task 19), `composeGstr1HsnSummary` + `fetchHsnLineAggregates` + `saveTaxReturnLines` (Task 20), `fetchVATRecords`-by-period plumbing (Phase 3's `tax_period` filtered fetch), `createVATReturn` (`vatService.ts:136`), `tenantToday` (Phase 0).
- Produces: `createGstReturnForPeriod(forDate: string): Promise<VATReturn>` — one call composes GSTR-3B + HSN summary and persists return + `tax_return_lines`.

- [ ] **Step 1: Write the failing test**

Reuses the `from` spy + `chainFor` builder added in Task 20. Mock the composer at the registry seam so this test isolates THIS function's orchestration (period metadata + box concatenation + HSN sequencing); the same-module `createVATReturn` / `calculateVATForPeriod` / `fetchHsnLineAggregates` run for real against the `from` router.

```typescript
// extend src/lib/vatService.test.ts
vi.mock('./regimes/registry', () => ({
  resolveReturnComposer: () => ({
    periodBounds: () => ({ periodStart: '2026-07-01', periodEnd: '2026-07-31', taxPeriods: ['2026-07'] }),
    compose: () => ({ boxes: [
      { boxCode: '3.1a', boxLabel: 'Outward taxable', amountBase: 90000, sequence: 0 },
      { boxCode: '3.1a.tax', boxLabel: 'Integrated/Central/State tax', amountBase: 16200, sequence: 1 },
    ], meta: {} }),
  }),
}));

import { createGstReturnForPeriod } from './vatService';

describe('createGstReturnForPeriod', () => {
  it('composes 3B + HSN, persists the return with regime metadata and collision-free box sequences', async () => {
    const captured: { vatReturn?: Record<string, unknown>; returnLines?: Array<Record<string, unknown>> } = {};
    from.mockImplementation((table: string) => {
      if (table === 'vat_records') return chainFor({ data: [
        { record_type: 'sale', vat_amount: 8100, tax_period: '2026-07', created_at: '2026-07-15T00:00:00Z', source_document_type: 'invoice', source_document_id: 'inv1' },
        { record_type: 'sale', vat_amount: 8100, tax_period: '2026-07', created_at: '2026-07-15T00:00:00Z', source_document_type: 'invoice', source_document_id: 'inv1' },
      ], error: null });
      if (table === 'invoice_line_items') return chainFor({ data: [{ id: 'l1', invoice_id: 'inv1', item_code: '998713', unit_code: 'NOS', quantity: 2 }], error: null });
      if (table === 'document_tax_lines') return chainFor({ data: [
        { line_item_id: 'l1', component_code: 'CGST', taxable_base: 90000, tax_amount_base: 8100, exchange_rate: 1 },
        { line_item_id: 'l1', component_code: 'SGST', taxable_base: 90000, tax_amount_base: 8100, exchange_rate: 1 },
      ], error: null });
      if (table === 'vat_returns') return {
        insert: (rows: Array<Record<string, unknown>>) => { captured.vatReturn = rows[0]; return {
          select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'ret1', tenant_id: 't1' }, error: null }) }) }; },
      } as never;
      // tax_return_lines
      return { insert: (rows: Array<Record<string, unknown>>) => { captured.returnLines = rows; return Promise.resolve({ error: null }); } } as never;
    });

    await createGstReturnForPeriod('2026-07-15');

    // the return row carries the regime metadata + monthly Apr-anchored bounds
    expect(captured.vatReturn).toMatchObject({
      regime_key: 'gstr', filing_frequency: 'monthly', period_anchor: '04-01',
      period_start: '2026-07-01', period_end: '2026-07-31',
    });
    // tax_return_lines = 3B boxes (2) + GSTR-1 HSN summary (hsn.998713), HSN sequenced after 3B
    const codes = captured.returnLines!.map((r) => r.box_code);
    expect(codes).toContain('hsn.998713');
    const seqs = captured.returnLines!.map((r) => r.sequence as number);
    expect(new Set(seqs).size).toBe(seqs.length);   // no sequence collisions
    expect(Math.max(...seqs)).toBe(2);              // HSN continues after the two 3B rows (0,1 → 2)
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/lib/vatService.test.ts` — the new describe fails (`createGstReturnForPeriod is not a function`).

- [ ] **Step 3: Implement**

Append to `src/lib/vatService.ts`:

```typescript
import { resolveReturnComposer } from './regimes/registry';
import { composeGstr1HsnSummary } from './regimes/gstr/hsnSummary';

/**
 * India return creation: GSTR-3B (composer, ledger-sourced) + GSTR-1 HSN summary
 * (line-sourced, AD-4) persisted together as tax_return_lines. The composer's
 * period math runs on tenant-local dates (tenantToday upstream) — monthly, 04-01.
 */
export const createGstReturnForPeriod = async (forDate: string): Promise<VATReturn> => {
  const composer = resolveReturnComposer('gstr');
  const bounds = composer.periodBounds('monthly', '04-01', forDate, 'Asia/Kolkata');

  const { data: ledgerRows, error } = await supabase
    .from('vat_records')
    .select('*')
    .in('tax_period', bounds.taxPeriods)
    .is('deleted_at', null);
  if (error) throw error;

  const summary = await calculateVATForPeriod(bounds.periodStart, bounds.periodEnd);
  const vatReturn = await createVATReturn({
    period_start: bounds.periodStart,
    period_end: bounds.periodEnd,
    output_vat: summary.totalOutputVAT,
    input_vat: summary.totalInputVAT,
    net_vat: summary.netVAT,
    status: 'draft',
    regime_key: 'gstr',
    filing_frequency: 'monthly',
    period_anchor: '04-01',
  } as Parameters<typeof createVATReturn>[0]);

  const composed = composer.compose({
    tenantId: vatReturn.tenant_id ?? '',
    legalEntityId: '',                       // single-entity tenants; the composer only
    taxPeriods: bounds.taxPeriods,           // asserts currency parity today
    ledgerRows: (ledgerRows ?? []) as never,
    jurisdictionCurrency: 'INR',
    baseCurrency: 'INR',
  });
  const hsnRows = await fetchHsnLineAggregates(bounds.taxPeriods);
  const nextSeq = composed.boxes.length > 0 ? Math.max(...composed.boxes.map((b) => b.sequence)) + 1 : 1;
  const hsnBoxes = composeGstr1HsnSummary(hsnRows, nextSeq);
  await saveTaxReturnLines(vatReturn.id!, [...composed.boxes, ...hsnBoxes]);
  return vatReturn;
};
```

NOTE for the executing engineer: Phase 3 rewired `vatService` around the ReturnComposer and gave `createVATReturn` the `regime_key`/`filing_frequency`/`period_anchor` columns — if Phase 3 exposed a generic `createReturnFromComposer(regimeKey, forDate)` instead, implement `createGstReturnForPeriod` as a thin delegation to it that ADDITIONALLY appends the HSN boxes (the delta this task owns), and take the jurisdiction/base currencies from the resolved tenant config rather than the 'INR' literals (the literals above are the single-entity simplification only if no resolved config is reachable in this service — prefer `getBaseCurrency()` from `src/lib/currencyService.ts:84`).

Then update the return-creation UI call site: where the Phase-3 modal calls the compose path, branch on the resolved `vat_returns.regime_key` (from tenant regime config via `useRegimeConfig()`): `'gstr'` → `createGstReturnForPeriod(tenantToday(dateTime.timezone))`. Section labels on the return detail render from `tax_return_lines.box_label` (already generic per Phase 3 — verify the HSN rows render their `quantity`/`unit_code` columns; if the generic renderer lacks those two columns, add them to its row map).

- [ ] **Step 4: Run tests, verify pass** — `npx vitest run src/lib/vatService.test.ts` green; `npm run typecheck` — 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vatService.ts src/lib/vatService.test.ts
git commit -m "feat(returns): createGstReturnForPeriod — GSTR-3B + HSN summary persisted as tax_return_lines"
```

**WP-6 verification:** `npx vitest run src/lib/regimes/gstr src/lib/vatService.test.ts` green; `npm run typecheck` = 0; boxes deterministic (Task 19 test); HSN sequences collision-free (Task 21 test).

---

### Work Package WP-7 — TDS Withholding in `record_payment` (Tasks 22–23, one migration PR)

### Task 22: Migration — `payments` withholding columns, `payment_withholdings` table, `record_payment` extension

**Files:**
- Migration: `payment_withholdings_and_record_payment_tds`
- Modify: `src/types/database.types.ts` (regen), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: live `record_payment(p_payment jsonb, p_allocations jsonb) RETURNS payments` (SECURITY DEFINER, verified in pg_proc); `get_current_tenant_id()`, `set_tenant_and_audit_fields` trigger machinery.
- Produces: `payments.withheld_amount numeric(19,4) NOT NULL DEFAULT 0`, `payments.withholding_certificate_ref text`; tenant table `payment_withholdings`; `record_payment` honoring `p_payment.withheld_amount` + `p_payment.certificate_ref` with full-settlement conservation — consumed by Task 23.

- [ ] **Step 1: Probe current behavior (the failing SQL test)**

`mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='payments' AND column_name IN ('withheld_amount','withholding_certificate_ref')) AS pay_cols,
  (SELECT count(*) FROM information_schema.tables WHERE table_name='payment_withholdings') AS wh_table,
  (SELECT pg_get_functiondef(p.oid) ILIKE '%withheld_amount%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='record_payment') AS rpc_aware;
```

Expected: `pay_cols = 0`, `wh_table = 0`, `rpc_aware = false`.

Also capture the CURRENT function body (the splice base — Phases 1/3 have evolved it since the baseline file):

```sql
SELECT pg_get_functiondef(p.oid) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'record_payment';
```

Save the output to the scratchpad (`record_payment.current.sql`) — the migration below REPLACES the function with this exact body plus the three labeled insertions.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `payment_withholdings_and_record_payment_tds`. The migration has three parts; parts 1–2 are complete SQL, part 3 is the captured function body with the three labeled blocks spliced at the described anchors (this is a CREATE OR REPLACE of a function whose exact current text lives only in the DB — the anchors are structural and verified by the Step-3 assertions):

```sql
-- Part 1: additive payment columns
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS withheld_amount numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withholding_certificate_ref text;

-- Part 2: the TDS-credit ledger table (AD-3) — full tenant discipline
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
CREATE POLICY payment_withholdings_tenant_isolation ON payment_withholdings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
CREATE POLICY payment_withholdings_select ON payment_withholdings
  FOR SELECT TO authenticated USING (is_staff_user());
CREATE POLICY payment_withholdings_insert ON payment_withholdings
  FOR INSERT TO authenticated WITH CHECK (has_role('accounts'));
CREATE POLICY payment_withholdings_update ON payment_withholdings
  FOR UPDATE TO authenticated USING (has_role('accounts'));
CREATE POLICY payment_withholdings_delete ON payment_withholdings
  FOR DELETE TO authenticated USING (has_role('admin'));
CREATE TRIGGER set_payment_withholdings_tenant_and_audit
  BEFORE INSERT OR UPDATE ON payment_withholdings
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();
CREATE INDEX idx_payment_withholdings_tenant_id ON payment_withholdings(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_withholdings_payment ON payment_withholdings(tenant_id, payment_id) WHERE deleted_at IS NULL;

-- Part 3: CREATE OR REPLACE record_payment = [captured current body] + three blocks:
--
-- [TDS-1] with the other p_payment field extractions (top of the body), add:
--     v_withheld numeric := COALESCE((p_payment->>'withheld_amount')::numeric, 0);
--     v_certificate_ref text := NULLIF(p_payment->>'certificate_ref', '');
--   and immediately after extraction:
--     IF v_withheld < 0 THEN RAISE EXCEPTION 'withheld_amount must be >= 0'; END IF;
--     IF v_withheld > 0 AND v_certificate_ref IS NULL THEN
--       RAISE EXCEPTION 'A withholding certificate reference is required when withheld_amount > 0';
--     END IF;
--
-- [TDS-2] REPLACE the existing money-conservation check
--   (the body's "sum of allocations must equal the payment amount" comparison) with:
--     IF round(v_allocations_total::numeric, 4) <> round((v_amount + v_withheld)::numeric, 4) THEN
--       RAISE EXCEPTION 'Allocations (%) must equal payment amount (%) plus withheld amount (%)',
--         v_allocations_total, v_amount, v_withheld;
--     END IF;
--   (variable names v_allocations_total / v_amount are whatever the captured body uses —
--    keep ITS names; only the right-hand side gains "+ v_withheld".)
--
-- [TDS-3] immediately after the INSERT INTO payments ... RETURNING (v_payment or the
--   body's returning variable), add:
--     UPDATE payments SET withheld_amount = v_withheld,
--                         withholding_certificate_ref = v_certificate_ref
--       WHERE id = v_payment.id;
--     v_payment.withheld_amount := v_withheld;
--     v_payment.withholding_certificate_ref := v_certificate_ref;
--     IF v_withheld > 0 THEN
--       INSERT INTO payment_withholdings
--         (tenant_id, payment_id, customer_id, amount, currency, exchange_rate,
--          amount_base, certificate_ref, tax_point_date)
--       VALUES
--         (v_payment.tenant_id, v_payment.id, v_payment.customer_id, v_withheld,
--          v_payment.currency, v_payment.exchange_rate,
--          round(v_withheld * v_payment.exchange_rate, 4), v_certificate_ref,
--          v_payment.payment_date::date);
--     END IF;
--
-- SECURITY: keep the function's existing SECURITY DEFINER + search_path settings verbatim.
REVOKE ALL ON FUNCTION record_payment(jsonb, jsonb) FROM anon;
```

The `[TDS-1]`/`[TDS-2]`/`[TDS-3]` blocks above are **literal SQL to splice**, not pseudocode: strip the leading `-- ` annotation from each statement and place it at the named structural anchor inside the captured body (`[TDS-1]` with the `p_payment` field extractions; `[TDS-2]` REPLACES the existing conservation check; `[TDS-3]` immediately after the `INSERT INTO payments … RETURNING`). Keep the captured body's own variable names (`v_amount`/`v_allocations_total`/the RETURNING target) — only the right-hand side of `[TDS-2]` gains `+ v_withheld`, and `[TDS-1]` adds two DECLAREs (`v_withheld`, `v_certificate_ref`). The Step-3 behavioral assertions (negative + positive, both rolled back) prove the splice compiled and conserves correctly before commit.

- [ ] **Step 3: Behavioral SQL assertions (after)**

```sql
-- structure
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='payments' AND column_name IN ('withheld_amount','withholding_certificate_ref')) AS pay_cols,
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE relname='payment_withholdings') AS rls,
  (SELECT count(*) FROM pg_policies WHERE tablename='payment_withholdings') AS policies,
  (SELECT pg_get_functiondef(p.oid) ILIKE '%payment_withholdings%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='record_payment') AS rpc_aware;
```

Expected: `pay_cols = 2`, `rls = true`, `policies = 5`, `rpc_aware = true`.

Behavioral probe (run as a transaction and roll back — uses the live Oman tenant's data shape; a full India-tenant round-trip runs in Task 32):

```sql
BEGIN;
-- conservation must now include withheld: an allocation equal to amount alone FAILS
-- when withheld_amount > 0. Expect: exception 'Allocations ... plus withheld amount'.
SELECT record_payment(
  jsonb_build_object('amount', 98, 'withheld_amount', 2, 'certificate_ref', 'TDS/2026/001',
                     'currency', 'OMR', 'exchange_rate', 1, 'rate_source', 'manual',
                     'payment_date', '2026-07-02', 'status', 'completed'),
  jsonb_build_array(jsonb_build_object('invoice_id', (SELECT id FROM invoices LIMIT 1), 'amount', 98))
);
ROLLBACK;
```

Expected: `ERROR: Allocations (98) must equal payment amount (98) plus withheld amount (2)`.

- [ ] **Step 4: Regen types + typecheck** — Expected 0 errors.

- [ ] **Step 5: Manifest row + commit**

```
| <version> | payment_withholdings_and_record_payment_tds.sql | Additive | TDS/WHT: payments withholding columns, payment_withholdings ledger table, record_payment conservation incl. withheld | Phase 4 |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(payments): TDS withholding — columns, payment_withholdings ledger, record_payment conservation"
```

### Task 23: Client — `createPayment` withholding + RecordPaymentModal section

**Files:**
- Modify: `src/lib/paymentsService.ts` (`createPayment` at `:176`; the `p_payment` object at `:208-220`; the `Payment` interface at `:10`)
- Modify: `src/components/financial/RecordPaymentModal.tsx` (state block near `:80-86`; the `onSave` prop type at `:31-45`; the `onSave(...)` submit call at `:264`; allocation-vs-total sync near `:225-245`)
- Modify: `src/pages/financial/PaymentsList.tsx` (the `createPaymentMutation` input shape at `:170-178`, the `createPayment(paymentData, allocations)` call at `:176`, and the modal `onSave` handler at `:663`) — the global Payments caller
- Modify: `src/components/cases/detail/useCaseMutations.ts` (the `createPaymentMutation` input shape at `:219-227` and the `createPayment(paymentData, allocations)` call at `:227`) — the case-detail caller, whose `onSave` handler wiring lives at `src/pages/cases/CaseDetail.tsx:869`
- Test: extend `src/lib/paymentsService.test.ts`; extend the modal's existing test file if present, else assertions live in the service test

**Interfaces:**
- Consumes: Task 22 RPC contract; existing `resolveRateContext` call (`paymentsService.ts:201-205`); the modal's real callback prop `onSave(paymentData, allocations)` (`RecordPaymentModal.tsx:31-45` — NOT `onSubmit`).
- Produces: `createPayment(payment, allocations, withholding?)` — the third optional argument `{ amount: number; certificateRef: string } | null`; and an extended `onSave(paymentData, allocations, withholding?)` prop threaded through both mutation call sites.

- [ ] **Step 1: Write the failing test**

Augment the file's mock header (it currently hoists only `from`) so `supabase.rpc` is capturable and `createPayment`'s collaborators are stubbed, then add the describe block:

```typescript
// extend src/lib/paymentsService.test.ts
// --- header additions: replace the file's existing hoisted `from` + supabaseClient mock
//     with the two-symbol form, and stub the rate/audit/custody collaborators ---
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc } }));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(async (currency: string, _date: string, o: { rate: number } | null) =>
    ({ documentCurrency: currency, rate: o?.rate ?? 1, rateSource: 'manual' })),
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn() }));
vi.mock('./chainOfCustodyService', () => ({ logInvoicePayment: vi.fn() }));

import { createPayment } from './paymentsService';

const basePayment = (amount: number) => ({
  payment_date: '2026-07-02', amount, currency: 'INR', exchange_rate: 1,
  status: 'completed' as const, payment_method_id: 'pm1', bank_account_id: 'ba1',
});

describe('createPayment withholding', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: { id: 'p1', payment_number: 'PAY-1' }, error: null });
    // the post-RPC case-ledger block is best-effort (try/catch) — a benign chain is enough
    from.mockReset().mockReturnValue({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) });
  });

  it('passes withheld_amount + certificate_ref into p_payment and allocates amount+withheld', async () => {
    await createPayment(basePayment(98), [{ invoice_id: 'i1', amount: 100 }],
      { amount: 2, certificateRef: 'TDS/2026/001' });
    const call = rpc.mock.calls.find((c) => c[0] === 'record_payment');
    expect(call?.[1].p_payment.withheld_amount).toBe(2);
    expect(call?.[1].p_payment.certificate_ref).toBe('TDS/2026/001');
    // the receivable settles in full: allocations (100) === amount (98) + withheld (2)
    expect(call?.[1].p_allocations).toEqual([{ invoice_id: 'i1', amount: 100 }]);
  });

  it('rejects withholding without a certificate reference client-side (before any RPC)', async () => {
    await expect(
      createPayment(basePayment(98), [{ invoice_id: 'i1', amount: 100 }], { amount: 2, certificateRef: '' }),
    ).rejects.toThrow(/certificate/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/lib/paymentsService.test.ts` — new cases FAIL (arity/behavior missing).

- [ ] **Step 2: Implement the service change**

In `src/lib/paymentsService.ts`, change the `createPayment` signature (`:176-179`) to:

```typescript
export const createPayment = async (
  payment: Omit<Payment, 'id' | 'payment_number' | 'created_at' | 'updated_at'>,
  allocations?: Array<{ invoice_id: string; amount: number }>,
  withholding?: { amount: number; certificateRef: string } | null,
) => {
```

Add after the existing bank-account guard (`:194-196`):

```typescript
  if (withholding && withholding.amount > 0 && !withholding.certificateRef.trim()) {
    throw new Error('A withholding certificate reference is required when an amount is withheld.');
  }
```

And extend the `p_payment` object (`:208-220`) with two keys after `notes`:

```typescript
      withheld_amount: withholding?.amount ?? 0,
      certificate_ref: withholding?.certificateRef?.trim() || null,
```

Extend the `Payment` interface (`:10`) with `withheld_amount?: number;` and `withholding_certificate_ref?: string | null;`.

- [ ] **Step 3: Modal section**

In `src/components/financial/RecordPaymentModal.tsx`:
1. State (beside `:80-86`): `const [withheldAmount, setWithheldAmount] = useState<number>(0);` and `const [certificateRef, setCertificateRef] = useState<string>('');`.
2. The auto-distribution logic (`:234-245`) distributes `totalAmount + withheldAmount` across allocations (the receivable settles in full).
3. Submit payload: extend the modal's real callback prop `onSave` (its type at `:31-45`, its call at `:264`) with a third argument and pass `withheldAmount > 0 ? { amount: withheldAmount, certificateRef } : null`. The prop is named **`onSave`, not `onSubmit`** — change its signature to `onSave(paymentData, allocations, withholding?: { amount: number; certificateRef: string } | null): Promise<void>` and forward the value at the `await onSave(...)` call. Then thread it through **both** call sites (find them with `grep -rn "RecordPaymentModal" src/pages src/components` — `src/pages` alone MISSES the case-detail path, which lives under `src/components`):
   - `src/pages/financial/PaymentsList.tsx`: the modal handler at `:663` (`onSave={async (paymentData, allocations) => …}`) takes the new third arg and passes it into `createPaymentMutation.mutate`; widen that mutation's input type (`:170-178`) to carry `withholding` and forward it as the 3rd arg of `createPayment(paymentData, allocations, withholding)` (`:176`).
   - `src/pages/cases/CaseDetail.tsx`: the modal handler at `:869` takes the new third arg and passes it into the case mutation; in `src/components/cases/detail/useCaseMutations.ts` widen `createPaymentMutation`'s input type (`:219-227`) to carry `withholding` and forward it as the 3rd arg of `createPayment(paymentData, allocations, withholding)` (`:227`).
   Because `createPayment`'s third parameter is optional, a missed caller would NOT fail typecheck — updating both call sites is mandatory, not optional.
4. UI: a `CollapsibleSection` (from `src/components/ui/CollapsibleSection.tsx`) titled "Withholding (TDS/WHT)" containing two fields:

```tsx
<CollapsibleSection title="Withholding (TDS/WHT)" defaultOpen={false}>
  <div className="grid grid-cols-2 gap-3">
    <FormField label="Withheld amount">
      <Input
        type="number" min={0} step="0.01" value={withheldAmount || ''}
        onChange={(e) => setWithheldAmount(parseFloat(e.target.value) || 0)}
      />
    </FormField>
    <FormField label="Certificate reference" required={withheldAmount > 0}
      error={withheldAmount > 0 && !certificateRef.trim() ? 'Required when withholding' : undefined}>
      <Input value={certificateRef} onChange={(e) => setCertificateRef(e.target.value)}
        placeholder="e.g. TDS 194J / Form 16A ref" />
    </FormField>
  </div>
  <p className="text-xs text-gray-500 mt-2">
    The invoice settles for the full allocated amount; the withheld portion is recorded
    as a tax credit receivable against the certificate.
  </p>
</CollapsibleSection>
```

- [ ] **Step 4: Run tests + typecheck** — `npx vitest run src/lib/paymentsService.test.ts` green; `npm run typecheck` — 0; `npm run lint` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paymentsService.ts src/lib/paymentsService.test.ts src/components/financial/RecordPaymentModal.tsx \
        src/pages/financial/PaymentsList.tsx src/pages/cases/CaseDetail.tsx src/components/cases/detail/useCaseMutations.ts
git commit -m "feat(payments): withholding capture in createPayment + RecordPaymentModal TDS section + both call sites"
```

**WP-7 verification:** Step-3 SQL probes of Task 22 behave as specified; service tests green; a manual dry run in the app records a payment with TDS and `SELECT * FROM payment_withholdings` shows the credit row.

---

### Work Package WP-8 — IRN E-Invoice Transport, Artifact-First (Tasks 24, 25, 25b, 26, 27)

### Task 24: `in_irn` artifact builder (INV-01 v1.1) — reuses Phase-3 `sha256Hex`

**Files:**
- Create: `src/lib/regimes/in_irn/payload.ts`
- Create: `src/lib/regimes/in_irn/index.ts`
- Modify: `src/lib/regimes/register.ts` (register)
- Test: `src/lib/regimes/in_irn/index.test.ts`

**Interfaces:**
- Consumes: `EInvoicingTransport`, `IssuedDocumentSnapshot` from `src/lib/regimes/types.ts` (Phase 1 — the sealed snapshot handed to transports at issuance; the builder reads only the narrow field set documented in `payload.ts` and must be reconciled with the Phase-1 snapshot field names at execution time); `sha256Hex` from `src/lib/tax/hash.ts` (created in Phase 3 — imported, not recreated).
- Produces: `inIrnTransport: EInvoicingTransport` (key `'in_irn'`, regimeClass `'clearance_api'`) whose `buildArtifact` emits the INV-01 v1.1 JSON + hash — consumed by the Phase-1 issuance transport hook and Task 26.

- [ ] **Step 1: Failing tests**

```typescript
// src/lib/regimes/in_irn/index.test.ts
import { describe, it, expect } from 'vitest';
import { inIrnTransport } from './index';
import { resolveEInvoicingTransport } from '../registry';
import '../register';
import { buildIrnPayload, type IrnSource, type IssuedDocumentSnapshotView } from './payload';
import { sha256Hex } from '../../tax/hash';

const source: IrnSource = {
  documentNumber: 'INV/2026-27/0042', documentDate: '2026-07-15', documentType: 'INV',
  seller: { gstin: '29ABCDE1234F1Z5', legalName: 'Bengaluru Data Lab Pvt Ltd', stateCode: '29', address: 'Bengaluru', pincode: '560001' },
  buyer:  { gstin: '27FGHIJ5678K1Z8', legalName: 'Mumbai Systems Ltd', stateCode: '27', address: 'Mumbai', pincode: '400001', placeOfSupply: '27' },
  lines: [{ slNo: 1, description: 'RAID-5 recovery', hsnSac: '998713', quantity: 2, unit: 'NOS', unitPrice: 45000, taxableValue: 90000, igstAmount: 16200, cgstAmount: 0, sgstAmount: 0, gstRate: 18 }],
  totals: { taxableValue: 90000, igst: 16200, cgst: 0, sgst: 0, roundOff: 0, totalInvoiceValue: 106200 },
};

// The REAL issuance surface: a sealed IssuedDocumentSnapshot (inter-state, IGST). toIrnSource
// maps this exactly onto `source` above — proving the mapping, not an injected shortcut.
const snapshot: IssuedDocumentSnapshotView = {
  documentType: 'invoice',
  documentNumber: 'INV/2026-27/0042',
  supplyDate: '2026-07-15',
  currency: 'INR',
  seller: { taxNumber: '29ABCDE1234F1Z5', legalName: 'Bengaluru Data Lab Pvt Ltd', addressLine: 'Bengaluru', city: 'Bengaluru', postalCode: '560001', subdivisionCode: '29' },
  buyer:  { taxNumber: '27FGHIJ5678K1Z8', legalName: 'Mumbai Systems Ltd', addressLine: 'Mumbai', city: 'Mumbai', postalCode: '400001', subdivisionCode: '27', placeOfSupplyCode: '27' },
  lines: [{
    sequence: 1, description: 'RAID-5 recovery', itemCode: '998713', quantity: 2, unitCode: 'NOS',
    unitPrice: 45000, taxableBase: 90000, components: [{ componentCode: 'IGST', rate: 18, taxAmount: 16200 }],
  }],
  rollups: [{ componentCode: 'IGST', taxAmount: 16200 }],
  totals: { taxableBase: 90000, taxTotal: 16200, grandTotal: 106200, roundingAdjustment: 0 },
};

describe('in_irn transport', () => {
  it('is registered with the clearance_api regime class', () => {
    expect(resolveEInvoicingTransport('in_irn')).toBe(inIrnTransport);
    expect(inIrnTransport.regimeClass).toBe('clearance_api');
  });
  it('builds a version-pinned INV-01 payload with the schema envelope', () => {
    const payload = buildIrnPayload(source);
    expect(payload.Version).toBe('1.1');
    expect(payload.TranDtls.SupTyp).toBe('B2B');
    expect(payload.DocDtls.No).toBe('INV/2026-27/0042');
    expect(payload.DocDtls.Dt).toBe('15/07/2026');                    // IRP dd/MM/yyyy
    expect(payload.SellerDtls.Gstin).toBe('29ABCDE1234F1Z5');
    expect(payload.BuyerDtls.Pos).toBe('27');
    expect(payload.ItemList[0].HsnCd).toBe('998713');
    expect(payload.ItemList[0].Unit).toBe('NOS');
    expect(payload.ValDtls.TotInvVal).toBe(106200);
  });
  it('maps a real IssuedDocumentSnapshot to a deterministic sealed artifact whose hash matches (no injected shortcut)', () => {
    const a1 = inIrnTransport.buildArtifact(snapshot as never);
    const a2 = inIrnTransport.buildArtifact(snapshot as never);
    expect(a1.artifactType).toBe('irp_inv01_json');
    expect(a1.payload).toEqual(a2.payload);                       // deterministic bytes
    expect(a1.payloadHash).toBe(sha256Hex(a1.payload as string));
    // the field-by-field mapping is exact: the snapshot builds the same payload as the hand-written IrnSource
    expect(JSON.parse(a1.payload as string)).toEqual(buildIrnPayload(source));
  });
});
```

Run: `npx vitest run src/lib/regimes/in_irn/index.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 2: Implement the payload builder + transport**

```typescript
// src/lib/regimes/in_irn/payload.ts
// IRP INV-01 schema v1.1 (version-pinned; sandbox environment per the regime row's
// config). IrnSource is the narrow view of IssuedDocumentSnapshot this builder reads —
// the mapping from the Phase-1 snapshot happens in index.ts. Field set is the
// mandatory-core of INV-01; optional sections (ExpDtls, PayDtls) are added when the
// CA-validated fixture set demands them.
export interface IrnSource {
  documentNumber: string;
  documentDate: string;                        // 'YYYY-MM-DD'
  documentType: 'INV' | 'CRN' | 'DBN';
  seller: { gstin: string; legalName: string; stateCode: string; address: string; pincode: string };
  buyer:  { gstin: string; legalName: string; stateCode: string; address: string; pincode: string; placeOfSupply: string };
  lines: Array<{
    slNo: number; description: string; hsnSac: string; quantity: number; unit: string;
    unitPrice: number; taxableValue: number; igstAmount: number; cgstAmount: number;
    sgstAmount: number; gstRate: number;
  }>;
  totals: { taxableValue: number; igst: number; cgst: number; sgst: number; roundOff: number; totalInvoiceValue: number };
}

// The subset of the Phase-1 `IssuedDocumentSnapshot` this transport consumes — the
// integration contract this plan pins. Reconcile field identifiers against
// src/lib/regimes/types.ts at execution if Phase 1 shipped different names (Risk 2 /
// Open Question 4); the SHAPE (header + parties + per-line components + rollups + totals)
// is what issue_tax_document seals, so the mapping below is complete against it.
export interface IssuedDocumentSnapshotView {
  documentType: 'invoice' | 'credit_note';
  documentNumber: string;
  supplyDate: string;                         // 'YYYY-MM-DD' tax point
  currency: string;
  seller: { taxNumber: string; legalName: string; addressLine: string; city: string; postalCode: string; subdivisionCode: string };
  buyer:  { taxNumber: string; legalName: string; addressLine: string; city: string; postalCode: string; subdivisionCode: string; placeOfSupplyCode: string };
  lines: Array<{
    sequence: number; description: string; itemCode: string; quantity: number;
    unitCode: string; unitPrice: number; taxableBase: number;
    components: Array<{ componentCode: string; rate: number; taxAmount: number }>;   // from document_tax_lines, per line
  }>;
  rollups: Array<{ componentCode: string; taxAmount: number }>;                       // document-level component totals
  totals: { taxableBase: number; taxTotal: number; grandTotal: number; roundingAdjustment: number | null };
}

const toIrpDate = (ymd: string): string => {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
};

export function buildIrnPayload(source: IrnSource) {
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: source.documentType, No: source.documentNumber, Dt: toIrpDate(source.documentDate) },
    SellerDtls: {
      Gstin: source.seller.gstin, LglNm: source.seller.legalName,
      Addr1: source.seller.address, Loc: source.seller.address,
      Pin: Number(source.seller.pincode), Stcd: source.seller.stateCode,
    },
    BuyerDtls: {
      Gstin: source.buyer.gstin, LglNm: source.buyer.legalName,
      Addr1: source.buyer.address, Loc: source.buyer.address,
      Pin: Number(source.buyer.pincode), Stcd: source.buyer.stateCode,
      Pos: source.buyer.placeOfSupply,
    },
    ItemList: source.lines.map((l) => ({
      SlNo: String(l.slNo), PrdDesc: l.description, IsServc: l.hsnSac.startsWith('99') ? 'Y' : 'N',
      HsnCd: l.hsnSac, Qty: l.quantity, Unit: l.unit, UnitPrice: l.unitPrice,
      TotAmt: l.taxableValue, AssAmt: l.taxableValue, GstRt: l.gstRate,
      IgstAmt: l.igstAmount, CgstAmt: l.cgstAmount, SgstAmt: l.sgstAmount,
      TotItemVal: l.taxableValue + l.igstAmount + l.cgstAmount + l.sgstAmount,
    })),
    ValDtls: {
      AssVal: source.totals.taxableValue, IgstVal: source.totals.igst,
      CgstVal: source.totals.cgst, SgstVal: source.totals.sgst,
      RndOffAmt: source.totals.roundOff, TotInvVal: source.totals.totalInvoiceValue,
    },
  };
}
```

```typescript
// src/lib/regimes/in_irn/index.ts
import type { EInvoicingTransport, IssuedDocumentSnapshot } from '../types';
import { sha256Hex } from '../../tax/hash';
import { buildIrnPayload, type IrnSource, type IssuedDocumentSnapshotView } from './payload';

// Maps the Phase-1 IssuedDocumentSnapshot (narrowed to the IssuedDocumentSnapshotView
// documented in payload.ts) onto the IRP INV-01 IrnSource, field by field: header,
// both parties' GSTIN bands, per-line HSN/UQC/amounts (component amounts pulled from the
// sealed document_tax_lines), and document totals. Pure and total — no throw, no shortcut.
function toIrnSource(doc: IssuedDocumentSnapshot): IrnSource {
  const s = doc as unknown as IssuedDocumentSnapshotView;
  const lineComponent = (line: IssuedDocumentSnapshotView['lines'][number], code: string): number =>
    line.components.find((c) => c.componentCode === code)?.taxAmount ?? 0;
  const rollup = (code: string): number =>
    s.rollups.filter((r) => r.componentCode === code).reduce((sum, r) => sum + r.taxAmount, 0);
  const roundOff = s.totals.roundingAdjustment ?? 0;
  return {
    documentNumber: s.documentNumber,
    documentDate: s.supplyDate,
    documentType: s.documentType === 'credit_note' ? 'CRN' : 'INV',
    seller: {
      gstin: s.seller.taxNumber, legalName: s.seller.legalName, stateCode: s.seller.subdivisionCode,
      address: s.seller.addressLine, pincode: s.seller.postalCode,
    },
    buyer: {
      gstin: s.buyer.taxNumber, legalName: s.buyer.legalName, stateCode: s.buyer.subdivisionCode,
      address: s.buyer.addressLine, pincode: s.buyer.postalCode, placeOfSupply: s.buyer.placeOfSupplyCode,
    },
    lines: s.lines.map((l) => ({
      slNo: l.sequence,
      description: l.description,
      hsnSac: l.itemCode,
      quantity: l.quantity,
      unit: l.unitCode,
      unitPrice: l.unitPrice,
      taxableValue: l.taxableBase,
      igstAmount: lineComponent(l, 'IGST'),
      cgstAmount: lineComponent(l, 'CGST'),
      sgstAmount: lineComponent(l, 'SGST'),
      gstRate: l.components.reduce((sum, c) => sum + c.rate, 0),   // CGST+SGST (9+9) or IGST (18)
    })),
    totals: {
      taxableValue: s.totals.taxableBase,
      igst: rollup('IGST'),
      cgst: rollup('CGST'),
      sgst: rollup('SGST'),
      roundOff,
      totalInvoiceValue: s.totals.grandTotal + roundOff,          // base+tax closed to the cash target
    },
  };
}

export const inIrnTransport: EInvoicingTransport = {
  key: 'in_irn',
  version: '1.0.0',
  regimeClass: 'clearance_api',
  buildArtifact(doc: IssuedDocumentSnapshot) {
    const payload = JSON.stringify(buildIrnPayload(toIrnSource(doc)));
    return { artifactType: 'irp_inv01_json', payload, payloadHash: sha256Hex(payload) };
  },
};
```

`toIrnSource` is complete above (a total 1:1 mapping over the documented `IssuedDocumentSnapshotView`); the ONLY execution-time action is to reconcile the view's field identifiers against the real `IssuedDocumentSnapshot` in `src/lib/regimes/types.ts` (Phase 1) if they differ — the shape is fixed by what `issue_tax_document` seals, so no logic changes, only renames. The Step-1 test already feeds a real snapshot (not the injected shortcut). Register in `src/lib/regimes/register.ts`:

```typescript
import { inIrnTransport } from './in_irn';
registerRegimePlugin('einvoice', inIrnTransport);
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npx vitest run src/lib/regimes/in_irn/index.test.ts` — Expected: all pass. `npm run typecheck` — 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/regimes/in_irn src/lib/regimes/register.ts
git commit -m "feat(regimes): in_irn transport — INV-01 v1.1 artifact builder with sync sha256"
```

### Task 25: Migration — guarded `einvoice_submissions` transitions

**Files:**
- Migration: `einvoice_submission_transitions`
- Modify: `src/types/database.types.ts` (regen), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `einvoice_submissions` (Phase 1, append-only posture).
- Produces: `transition_einvoice_submission(p_id uuid, p_status text, p_authority_reference text DEFAULT NULL, p_authority_response jsonb DEFAULT NULL) RETURNS einvoice_submissions` — the ONLY update path; consumed by the Task 26 edge function.

- [ ] **Step 1: Probe (failing state)**

```sql
SELECT count(*) AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='transition_einvoice_submission';
```

Expected: `fn = 0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `einvoice_submission_transitions`, SQL:

```sql
-- AD-6: the lifecycle writer. The guard trigger rejects ALL client/UPDATE paths except
-- transitions made inside this SECURITY DEFINER function (transaction-local GUC), and
-- only over the lifecycle columns. DELETE is always rejected.
CREATE OR REPLACE FUNCTION prevent_einvoice_submission_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'einvoice_submissions is append-only: DELETE is not permitted';
  END IF;
  IF current_setting('app.einvoice_transition', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'einvoice_submissions rows may only change via transition_einvoice_submission()';
  END IF;
  -- lifecycle columns only; the sealed artifact identity is immutable
  IF NEW.payload_hash    IS DISTINCT FROM OLD.payload_hash
     OR NEW.previous_hash IS DISTINCT FROM OLD.previous_hash
     OR NEW.regime_key    IS DISTINCT FROM OLD.regime_key
     OR NEW.artifact_type IS DISTINCT FROM OLD.artifact_type
     OR NEW.payload_storage_path IS DISTINCT FROM OLD.payload_storage_path
     OR NEW.tenant_id     IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'einvoice_submissions: sealed artifact fields are immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_einvoice_submission_mutation ON einvoice_submissions;
CREATE TRIGGER trg_prevent_einvoice_submission_mutation
  BEFORE UPDATE OR DELETE ON einvoice_submissions
  FOR EACH ROW EXECUTE FUNCTION prevent_einvoice_submission_mutation();

CREATE OR REPLACE FUNCTION transition_einvoice_submission(
  p_id uuid, p_status text,
  p_authority_reference text DEFAULT NULL, p_authority_response jsonb DEFAULT NULL
) RETURNS einvoice_submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row einvoice_submissions;
  v_legal boolean;
BEGIN
  SELECT * INTO v_row FROM einvoice_submissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'einvoice submission % not found', p_id; END IF;
  v_legal := (v_row.status, p_status) IN (
    ('generated','submitted'), ('generated','held'),
    ('submitted','accepted'), ('submitted','rejected'), ('submitted','held'),
    ('held','submitted'), ('held','dead_letter')
  );
  IF NOT v_legal THEN
    RAISE EXCEPTION 'illegal einvoice transition % -> %', v_row.status, p_status;
  END IF;
  PERFORM set_config('app.einvoice_transition', 'true', true);
  UPDATE einvoice_submissions SET
    status = p_status,
    authority_reference = COALESCE(p_authority_reference, authority_reference),
    authority_response  = COALESCE(p_authority_response, authority_response),
    submitted_at = CASE WHEN p_status = 'submitted' THEN now() ELSE submitted_at END,
    sealed_at    = CASE WHEN p_status = 'accepted'  THEN now() ELSE sealed_at END
  WHERE id = p_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION transition_einvoice_submission(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION transition_einvoice_submission(uuid, text, text, jsonb) TO service_role;
```

- [ ] **Step 3: Behavioral assertions**

```sql
-- raw UPDATE must be rejected (run in a rolled-back tx against any row; if the table
-- is empty, assert on the trigger's existence + a synthetic insert/update/rollback):
BEGIN;
INSERT INTO einvoice_submissions (tenant_id, regime_key, artifact_type, payload_hash, status)
VALUES ((SELECT id FROM tenants LIMIT 1), 'in_irn', 'irp_inv01_json', 'deadbeef', 'generated')
RETURNING id;
UPDATE einvoice_submissions SET status = 'accepted' WHERE payload_hash = 'deadbeef';
ROLLBACK;
```

Expected: the UPDATE raises `einvoice_submissions rows may only change via transition_einvoice_submission()`. Then inside another rolled-back transaction, `SELECT transition_einvoice_submission(<id>, 'submitted')` succeeds and `... 'accepted'` directly from 'generated' raises `illegal einvoice transition`.

- [ ] **Step 4: Regen types + typecheck** — 0 errors.

- [ ] **Step 5: Manifest row + commit**

```
| <version> | einvoice_submission_transitions.sql | Additive | Guarded einvoice_submissions lifecycle: transition RPC + mutation-guard trigger (AD-6) | Phase 4 |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(einvoice): guarded submission transitions (append-only posture preserved)"
```

### Task 25b: Issuance-time IRN artifact persistence — storage bucket + persist RPC + post-issue transport service

This is the seam the rest of WP-8 depends on: it turns the pure TS builder (Task 24) into a **persisted, sealed `einvoice_submissions` row with `payload_hash` AND `payload_storage_path`** at issuance, and creates the `einvoice-artifacts` bucket Task 26 downloads from and Task 32 Step 4 asserts. It realizes the contract's §2.1(f) EInvoicingTransport hook for `in_irn` as a **post-issue TS transport service** — because `issue_tax_document` is a Postgres RPC and cannot run the TS builder, the row is written by the only place the sealed bytes exist (the TS side), immediately after issuance commits.

**Files:**
- Migration: `einvoice_artifacts_bucket_and_persist`
- Create: `src/lib/regimes/in_irn/persist.ts`
- Modify: the Phase-1 client issuance path that calls `issue_tax_document` (grep `issue_tax_document` in `src/lib/invoiceService.ts`) — add the post-issue `in_irn` persist call
- Test: `src/lib/regimes/in_irn/persist.test.ts`
- Modify: `src/types/database.types.ts` (regen), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `inIrnTransport.buildArtifact` + `IssuedDocumentSnapshotView` (Task 24); `einvoice_submissions` (Phase 1; INSERT is permitted — the Task 25 guard trigger blocks only UPDATE/DELETE); `get_current_tenant_id()`.
- Produces: RPC `persist_einvoice_artifact(p_document_type text, p_document_id uuid, p_regime_key text, p_artifact_type text, p_payload_hash text, p_payload_storage_path text) RETURNS einvoice_submissions` (chains `previous_hash`, stamps `status='generated'`); `persistInIrnArtifact(snapshot): Promise<{ submissionId; payloadHash; storagePath }>` — consumed by the issuance path and unblocking Tasks 26/27/32.

- [ ] **Step 1: Probe (failing state)**

`mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM storage.buckets WHERE id='einvoice-artifacts') AS bucket,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='persist_einvoice_artifact') AS fn;
```

Expected: `bucket = 0`, `fn = 0`.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `einvoice_artifacts_bucket_and_persist`, SQL:

```sql
-- Private bucket for sealed e-invoice artifacts (never public; served via signed paths).
INSERT INTO storage.buckets (id, name, public)
SELECT 'einvoice-artifacts', 'einvoice-artifacts', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'einvoice-artifacts');

-- Tenant-scoped storage RLS: objects live under '<tenant_id>/<doc_type>/<doc_id>.json'.
DROP POLICY IF EXISTS einvoice_artifacts_tenant_read ON storage.objects;
CREATE POLICY einvoice_artifacts_tenant_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'einvoice-artifacts'
         AND (storage.foldername(name))[1] = get_current_tenant_id()::text);
DROP POLICY IF EXISTS einvoice_artifacts_tenant_write ON storage.objects;
CREATE POLICY einvoice_artifacts_tenant_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'einvoice-artifacts'
              AND (storage.foldername(name))[1] = get_current_tenant_id()::text);
DROP POLICY IF EXISTS einvoice_artifacts_tenant_update ON storage.objects;
CREATE POLICY einvoice_artifacts_tenant_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'einvoice-artifacts'
         AND (storage.foldername(name))[1] = get_current_tenant_id()::text);

-- The append-only writer of the 'generated' row: builds the previous_hash chain per tenant
-- and stamps status='generated'. INSERT-only; the Task 25 guard permits INSERT, blocks UPDATE/DELETE.
CREATE OR REPLACE FUNCTION persist_einvoice_artifact(
  p_document_type text, p_document_id uuid, p_regime_key text,
  p_artifact_type text, p_payload_hash text, p_payload_storage_path text
) RETURNS einvoice_submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid := get_current_tenant_id();
  v_prev text;
  v_row einvoice_submissions;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'persist_einvoice_artifact: no tenant context'; END IF;
  -- idempotent: one generated artifact per document
  SELECT * INTO v_row FROM einvoice_submissions
    WHERE tenant_id = v_tenant AND document_type = p_document_type AND document_id = p_document_id
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;
  -- chain to the tenant's most recent sealed artifact (previous_hash from day one)
  SELECT payload_hash INTO v_prev FROM einvoice_submissions
    WHERE tenant_id = v_tenant ORDER BY created_at DESC LIMIT 1;
  INSERT INTO einvoice_submissions
    (tenant_id, document_type, document_id, regime_key, artifact_type,
     payload_hash, previous_hash, payload_storage_path, status)
  VALUES
    (v_tenant, p_document_type, p_document_id, p_regime_key, p_artifact_type,
     p_payload_hash, v_prev, p_payload_storage_path, 'generated')
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION persist_einvoice_artifact(text, uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION persist_einvoice_artifact(text, uuid, text, text, text, text) TO authenticated, service_role;
```

- [ ] **Step 3: Assert (after)**

```sql
SELECT
  (SELECT count(*) FROM storage.buckets WHERE id='einvoice-artifacts' AND public = false) AS private_bucket,
  (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
     AND policyname LIKE 'einvoice_artifacts_%') AS storage_policies,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='persist_einvoice_artifact') AS fn;
```

Expected: `private_bucket = 1`, `storage_policies = 3`, `fn = 1`. Regen types (`einvoice_submissions` shape unchanged; the RPC appears in the generated `Functions` map).

- [ ] **Step 4: Write the failing service test**

```typescript
// src/lib/regimes/in_irn/persist.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { rpc, storageUpload } = vi.hoisted(() => ({ rpc: vi.fn(), storageUpload: vi.fn() }));
vi.mock('../../supabaseClient', () => ({
  supabase: { rpc, storage: { from: () => ({ upload: storageUpload }) } },
}));
import '../register';                                 // registers inIrnTransport
import { persistInIrnArtifact } from './persist';
import { inIrnTransport } from './index';
import { sha256Hex } from '../../tax/hash';

const snapshot = {
  tenantId: 't1', documentId: 'inv1',
  documentType: 'invoice' as const, documentNumber: 'INV/2026-27/0042', supplyDate: '2026-07-15', currency: 'INR',
  seller: { taxNumber: '29ABCDE1234F1Z5', legalName: 'Bengaluru Data Lab Pvt Ltd', addressLine: 'Bengaluru', city: 'Bengaluru', postalCode: '560001', subdivisionCode: '29' },
  buyer:  { taxNumber: '27FGHIJ5678K1Z8', legalName: 'Mumbai Systems Ltd', addressLine: 'Mumbai', city: 'Mumbai', postalCode: '400001', subdivisionCode: '27', placeOfSupplyCode: '27' },
  lines: [{ sequence: 1, description: 'RAID-5 recovery', itemCode: '998713', quantity: 2, unitCode: 'NOS', unitPrice: 45000, taxableBase: 90000, components: [{ componentCode: 'IGST', rate: 18, taxAmount: 16200 }] }],
  rollups: [{ componentCode: 'IGST', taxAmount: 16200 }],
  totals: { taxableBase: 90000, taxTotal: 16200, grandTotal: 106200, roundingAdjustment: 0 },
};

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: { id: 'sub1' }, error: null });
  storageUpload.mockReset().mockResolvedValue({ data: { path: 't1/invoice/inv1.json' }, error: null });
});

describe('persistInIrnArtifact', () => {
  it('uploads the sealed artifact then inserts the generated submission carrying hash + storage path', async () => {
    const built = inIrnTransport.buildArtifact(snapshot as never);
    const result = await persistInIrnArtifact(snapshot as never);

    // uploaded the EXACT sealed bytes to '<tenant>/<docType>/<docId>.json'
    const [path, body] = storageUpload.mock.calls[0];
    expect(path).toBe('t1/invoice/inv1.json');
    expect(await (body as Blob).text()).toBe(built.payload);

    // persisted the generated row via the RPC with a matching hash + path
    const args = rpc.mock.calls.find((c) => c[0] === 'persist_einvoice_artifact')?.[1];
    expect(args.p_document_id).toBe('inv1');
    expect(args.p_regime_key).toBe('in_irn');
    expect(args.p_payload_hash).toBe(built.payloadHash);
    expect(args.p_payload_hash).toBe(sha256Hex(built.payload as string));
    expect(args.p_payload_storage_path).toBe('t1/invoice/inv1.json');
    expect(result).toEqual({ submissionId: 'sub1', payloadHash: built.payloadHash, storagePath: 't1/invoice/inv1.json' });
  });
});
```

Run: `npx vitest run src/lib/regimes/in_irn/persist.test.ts` — Expected: FAIL (`Cannot find module './persist'`).

- [ ] **Step 5: Implement the persist service**

```typescript
// src/lib/regimes/in_irn/persist.ts
// The TS side of the §2.1(f) EInvoicingTransport hook for in_irn (a DB RPC cannot build
// the sealed bytes). Called AFTER issue_tax_document commits for an in_irn tenant: build
// the INV-01 artifact, upload the SEALED bytes to the private einvoice-artifacts bucket,
// then INSERT the 'generated' einvoice_submissions row (payload_hash + payload_storage_path)
// via persist_einvoice_artifact. Best-effort at the call site: a failure here never rolls
// back the already-issued invoice — the compliance badge shows 'IRN pending' until retry.
import { supabase } from '../../supabaseClient';
import { inIrnTransport } from './index';
import type { IssuedDocumentSnapshotView } from './payload';

export interface PersistedIrnArtifact { submissionId: string; payloadHash: string; storagePath: string; }

export async function persistInIrnArtifact(
  snapshot: IssuedDocumentSnapshotView & { tenantId: string; documentId: string },
): Promise<PersistedIrnArtifact> {
  const artifact = inIrnTransport.buildArtifact(snapshot as never);   // { artifactType, payload, payloadHash }
  const storagePath = `${snapshot.tenantId}/${snapshot.documentType}/${snapshot.documentId}.json`;

  const { error: upErr } = await supabase.storage
    .from('einvoice-artifacts')
    .upload(storagePath, new Blob([artifact.payload as string], { type: 'application/json' }), { upsert: true });
  if (upErr) throw upErr;

  const { data, error } = await supabase.rpc('persist_einvoice_artifact', {
    p_document_type: snapshot.documentType,
    p_document_id: snapshot.documentId,
    p_regime_key: 'in_irn',
    p_artifact_type: artifact.artifactType,
    p_payload_hash: artifact.payloadHash,
    p_payload_storage_path: storagePath,
  });
  if (error) throw error;
  return { submissionId: (data as { id: string }).id, payloadHash: artifact.payloadHash, storagePath };
}
```

Then wire it into the Phase-1 issuance path. In `src/lib/invoiceService.ts`, at the `issue_tax_document` caller, after a successful **non-dry-run** issue for a tenant whose `regime.einvoice` resolves to `'in_irn'`, assemble the `IssuedDocumentSnapshotView` from data already in hand at issuance — the issued invoice header (`invoice_number`→`documentNumber`, `supply_date`, `seller_tax_number`/`buyer_tax_number`, `buyer_address`, `place_of_supply_subdivision_id`→state code, tenant/document ids), the line items (`unit_code`, `item_code`, quantity, unit price, taxable base) and the `ComputedTaxLine[]` returned in the issue response (per-line `components` + `rollups`) — and call `persistInIrnArtifact(snapshot)` inside a `try/catch` that logs but never rethrows (issuance is already committed):

```typescript
if (regimeEinvoice === 'in_irn' && !dryRun) {
  try { await persistInIrnArtifact(assembleInIrnSnapshot(issued)); }
  catch (e) { logger.error('in_irn artifact persist failed (invoice issued; IRN pending)', e); }
}
```

(`assembleInIrnSnapshot(issued)` is a pure local mapper from the issue response to `IssuedDocumentSnapshotView & { tenantId, documentId }`; it lives beside the issuance call since it reads Phase-1 response fields. It does no I/O — everything it needs is in the `issue_tax_document` result.)

- [ ] **Step 6: Run tests + typecheck** — `npx vitest run src/lib/regimes/in_irn/persist.test.ts` green; `npm run typecheck` — 0.

- [ ] **Step 7: Manifest row + commit**

```
| <version> | einvoice_artifacts_bucket_and_persist.sql | Additive | einvoice-artifacts private bucket + storage RLS + persist_einvoice_artifact writer (generated row at issuance) | Phase 4 |
```

```bash
git add src/lib/regimes/in_irn/persist.ts src/lib/regimes/in_irn/persist.test.ts src/lib/invoiceService.ts \
        src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(einvoice): persist sealed in_irn artifact + generated submission at issuance (bucket + persist RPC + post-issue service)"
```

### Task 26: `in-irp-submit` edge function (sandbox, flag-gated) + payload contract test

**Files:**
- Create: `supabase/functions/in-irp-submit/index.ts`
- Create: `supabase/functions/in-irp-submit/expected-payload.fixture.json` (copied byte-identical from the Task 24 builder's golden output)
- Test: `supabase/functions/in-irp-submit/payloadContract.test.ts` (scripts vitest project)
- Migration (small, same PR): `india_irn_clearance_capability` — inserts the `einvoice.in_irn.clearance` capability row ONLY in the deploy step below

**Interfaces:**
- Consumes: `einvoice_submissions` rows (`status='generated'`, `regime_key='in_irn'`); `transition_einvoice_submission` (Task 25); env `INDIA_IRP_ENABLED`, `IRP_BASE_URL`, `IRP_CLIENT_ID`, `IRP_CLIENT_SECRET`, `IRP_USERNAME`, `IRP_PASSWORD`, `IRP_GSTIN`.
- Produces: sandbox clearance — IRN + signed QR persisted into `authority_reference`/`authority_response`; dead-letter degradation. The capability row `einvoice.in_irn.clearance` (kind `filing_transport`).

- [ ] **Step 1: Write the failing contract test**

```typescript
// supabase/functions/in-irp-submit/payloadContract.test.ts
// Risk-14 contract test: the edge function must transmit EXACTLY the artifact the
// src builder sealed — it never rebuilds. This pins the fixture file both sides use.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildIrnPayload } from '../../../src/lib/regimes/in_irn/payload';

describe('in-irp-submit payload contract', () => {
  it('the checked-in fixture equals the src builder output for the canonical document', () => {
    const fixture = JSON.parse(readFileSync(new URL('./expected-payload.fixture.json', import.meta.url), 'utf8'));
    const built = buildIrnPayload(fixture._source);
    expect(built).toEqual(fixture.payload);
  });
});
```

(`expected-payload.fixture.json` = `{ "_source": <the IrnSource from Task 24's test>, "payload": <buildIrnPayload output> }` — generate it once by logging the builder output, commit it.)

Run: `npm run geo:test -- supabase/functions/in-irp-submit/payloadContract.test.ts` — FAIL (fixture missing).

- [ ] **Step 2: Implement the edge function**

```typescript
// supabase/functions/in-irp-submit/index.ts
// Sandbox IRP clearance (artifact-first, AD-8). Hard-disabled unless INDIA_IRP_ENABLED
// === 'true' AND all sandbox secrets exist. NEVER rebuilds the payload: it transmits
// the sealed artifact bytes fetched by payload_storage_path (hash re-verified).
// No code sharing with src/ per repo rule — parity is pinned by payloadContract.test.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

async function sha256HexAsync(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const enabled = Deno.env.get('INDIA_IRP_ENABLED') === 'true';
  const baseUrl = Deno.env.get('IRP_BASE_URL');
  const clientId = Deno.env.get('IRP_CLIENT_ID');
  const clientSecret = Deno.env.get('IRP_CLIENT_SECRET');
  const username = Deno.env.get('IRP_USERNAME');
  const password = Deno.env.get('IRP_PASSWORD');
  const gstin = Deno.env.get('IRP_GSTIN');
  if (!enabled || !baseUrl || !clientId || !clientSecret || !username || !password || !gstin) {
    return json({ error: 'IRP clearance is not enabled/configured for this environment' }, 503);
  }

  // Service-role only: this function is invoked by ops/automation, never the browser.
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!authHeader.includes(serviceKey)) return json({ error: 'forbidden' }, 403);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const { submission_id } = await req.json().catch(() => ({}));
  if (!submission_id) return json({ error: 'submission_id is required' }, 400);

  const { data: sub, error: subError } = await supabase
    .from('einvoice_submissions').select('*').eq('id', submission_id).maybeSingle();
  if (subError || !sub) return json({ error: subError?.message ?? 'submission not found' }, 404);
  if (sub.regime_key !== 'in_irn') return json({ error: `submission regime is ${sub.regime_key}, not in_irn` }, 422);
  if (sub.status !== 'generated' && sub.status !== 'held') {
    return json({ error: `submission is ${sub.status}; only generated/held can be submitted` }, 409);
  }

  // Fetch the sealed artifact and re-verify its hash — transmit those exact bytes.
  const { data: blob, error: dlError } = await supabase.storage
    .from('einvoice-artifacts').download(sub.payload_storage_path);
  if (dlError || !blob) return json({ error: `artifact download failed: ${dlError?.message}` }, 500);
  const payloadText = await blob.text();
  if ((await sha256HexAsync(payloadText)) !== sub.payload_hash) {
    return json({ error: 'artifact hash mismatch — refusing to transmit' }, 500);
  }

  await supabase.rpc('transition_einvoice_submission', { p_id: submission_id, p_status: 'submitted' });

  try {
    // Sandbox IRP auth + generate (NIC sandbox API shape; version-pinned).
    const authRes = await fetch(`${baseUrl}/eivital/v1.04/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', client_id: clientId, client_secret: clientSecret, gstin },
      body: JSON.stringify({ UserName: username, Password: password }),
    });
    const auth = await authRes.json();
    const token = auth?.Data?.AuthToken;
    if (!token) throw new Error(`IRP auth failed: ${JSON.stringify(auth?.ErrorDetails ?? auth)}`);

    const genRes = await fetch(`${baseUrl}/eicore/v1.03/Invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        client_id: clientId, client_secret: clientSecret, gstin,
        user_name: username, AuthToken: token,
      },
      body: payloadText,
    });
    const gen = await genRes.json();
    if (gen?.Status === '1' && gen?.Data?.Irn) {
      const { data: updated } = await supabase.rpc('transition_einvoice_submission', {
        p_id: submission_id, p_status: 'accepted',
        p_authority_reference: gen.Data.Irn,
        p_authority_response: gen.Data,           // includes SignedInvoice + SignedQRCode
      });
      return json({ ok: true, irn: gen.Data.Irn, submission: updated });
    }
    const { data: rejected } = await supabase.rpc('transition_einvoice_submission', {
      p_id: submission_id, p_status: 'rejected', p_authority_response: gen,
    });
    return json({ ok: false, rejected: true, submission: rejected }, 422);
  } catch (err) {
    // Authority outage / network: HOLD (generate-and-hold degraded mode) — issuance
    // never depended on this call; retry moves held→submitted again.
    await supabase.rpc('transition_einvoice_submission', {
      p_id: submission_id, p_status: 'held',
      p_authority_response: { error: String(err) },
    });
    return json({ ok: false, held: true, error: String(err) }, 502);
  }
});
```

Generate `expected-payload.fixture.json` from the Task 24 builder, run the contract test — PASS.

- [ ] **Step 3: Deploy + capability row (deploy-coupled)**

Deploy via `mcp__supabase__deploy_edge_function` (project_id `ssmbegiyjivrcwgcqutu`, function `in-irp-submit`). ONLY after a successful sandbox round-trip (or an explicit ops decision to enable retry-based operation), apply migration `india_irn_clearance_capability`:

```sql
INSERT INTO master_engine_capabilities (capability_key, kind, min_engine_version)
SELECT 'einvoice.in_irn.clearance', 'filing_transport', '1.0.0'
WHERE NOT EXISTS (SELECT 1 FROM master_engine_capabilities WHERE capability_key = 'einvoice.in_irn.clearance');
```

+ manifest row `| <version> | india_irn_clearance_capability.sql | Additive | in_irn clearance transport capability (deploy-coupled) | Phase 4 |` + types regen. Until this row exists, the publish gate's capability manifest reports the clearance transport missing — which is exactly the honest degradation the walkthrough demands (India can still publish `statutory_ready` because artifact generation IS registered; the *clearance* capability gap surfaces on the tenant compliance badge, Task 27).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/in-irp-submit supabase/migrations.manifest.md src/types/database.types.ts
git commit -m "feat(einvoice): in-irp-submit sandbox clearance edge fn (flag-gated) + payload contract test"
```

### Task 27: Honest compliance surfacing — sealed-artifact QR + IRN status badge

**Files:**
- Create: `src/lib/einvoiceService.ts`
- Create: `src/components/financial/EinvoiceComplianceBadge.tsx`
- Modify: `src/pages/financial/InvoiceDetailPage.tsx` (render the badge beside the invoice status badge — grep `statusToBadgeVariant` or the header status `Badge` in that file for the anchor)
- Modify: `src/lib/pdf/dataFetcher.ts` — inside `fetchInvoiceData` (`:626` on main), fetch the latest accepted submission and attach `einvoiceSignedQr: string | null` to the returned data; the invoice adapter renders the QR ONLY from this field for `clearance_api` regimes
- Test: `src/lib/einvoiceService.test.ts`

**Interfaces:**
- Consumes: `einvoice_submissions` rows; `master_einvoice_regimes` (Task 3 row); `useRegimeConfig()` (Phase 1 context accessor).
- Produces: `fetchLatestEinvoiceSubmission`, `getEinvoiceComplianceStatus` (signatures in APIs & Services above).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/einvoiceService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const fromMock = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }));
import { getEinvoiceComplianceStatus } from './einvoiceService';

function tableMock(rowsByTable: Record<string, unknown>) {
  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit', 'in']) chain[m] = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: rowsByTable[table] ?? null, error: null });
    return chain;
  });
}

beforeEach(() => fromMock.mockReset());

describe('getEinvoiceComplianceStatus', () => {
  it("returns 'accepted' with IRN + signed QR from the SEALED submission", async () => {
    tableMock({
      einvoice_submissions: {
        id: 's1', status: 'accepted', regime_key: 'in_irn',
        authority_reference: 'IRN123', authority_response: { SignedQRCode: 'QRDATA' },
      },
      master_einvoice_regimes: { code: 'in_irn', mandatory_from: '2026-04-01' },
    });
    expect(await getEinvoiceComplianceStatus('inv1')).toEqual({ kind: 'accepted', irn: 'IRN123', signedQr: 'QRDATA' });
  });
  it("returns 'pending' with the mandate date when generated but not cleared", async () => {
    tableMock({
      einvoice_submissions: { id: 's1', status: 'generated', regime_key: 'in_irn', authority_reference: null, authority_response: null },
      master_einvoice_regimes: { code: 'in_irn', mandatory_from: '2026-04-01' },
    });
    expect(await getEinvoiceComplianceStatus('inv1')).toEqual({ kind: 'pending', mandatoryFrom: '2026-04-01' });
  });
  it("returns 'not_mandated' when no submission exists", async () => {
    tableMock({});
    expect(await getEinvoiceComplianceStatus('inv1')).toEqual({ kind: 'not_mandated' });
  });
});
```

Run: `npx vitest run src/lib/einvoiceService.test.ts` — FAIL (module missing).

- [ ] **Step 2: Implement service + badge + wiring**

```typescript
// src/lib/einvoiceService.ts
import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

export type EinvoiceSubmissionRow = Database['public']['Tables']['einvoice_submissions']['Row'];

export async function fetchLatestEinvoiceSubmission(documentId: string): Promise<EinvoiceSubmissionRow | null> {
  const { data, error } = await supabase
    .from('einvoice_submissions')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type EinvoiceComplianceStatus =
  | { kind: 'not_mandated' }
  | { kind: 'pending'; mandatoryFrom: string | null }
  | { kind: 'accepted'; irn: string; signedQr: string | null }
  | { kind: 'rejected'; reason: string | null };

export async function getEinvoiceComplianceStatus(invoiceId: string): Promise<EinvoiceComplianceStatus> {
  const sub = await fetchLatestEinvoiceSubmission(invoiceId);
  if (!sub) return { kind: 'not_mandated' };
  if (sub.status === 'accepted') {
    const qr = (sub.authority_response as { SignedQRCode?: string } | null)?.SignedQRCode ?? null;
    return { kind: 'accepted', irn: sub.authority_reference ?? '', signedQr: qr };
  }
  if (sub.status === 'rejected') {
    const reason = (sub.authority_response as { ErrorDetails?: unknown } | null)
      ? JSON.stringify((sub.authority_response as Record<string, unknown>).ErrorDetails ?? null) : null;
    return { kind: 'rejected', reason };
  }
  const { data: regime } = await supabase
    .from('master_einvoice_regimes')
    .select('code, mandatory_from')
    .eq('code', sub.regime_key)
    .maybeSingle();
  return { kind: 'pending', mandatoryFrom: regime?.mandatory_from ?? null };
}
```

```tsx
// src/components/financial/EinvoiceComplianceBadge.tsx
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../ui/Badge';
import { getEinvoiceComplianceStatus } from '../../lib/einvoiceService';

export const EinvoiceComplianceBadge: React.FC<{ invoiceId: string }> = ({ invoiceId }) => {
  const { data } = useQuery({
    queryKey: ['einvoice-status', invoiceId],
    queryFn: () => getEinvoiceComplianceStatus(invoiceId),
  });
  if (!data || data.kind === 'not_mandated') return null;
  if (data.kind === 'accepted') return <Badge variant="success">IRN {data.irn.slice(0, 12)}…</Badge>;
  if (data.kind === 'rejected') return <Badge variant="danger">IRN rejected</Badge>;
  return (
    <Badge variant="warning">
      IRN pending{data.mandatoryFrom ? ` — e-invoicing mandated from ${data.mandatoryFrom}` : ''}
    </Badge>
  );
};
```

`dataFetcher.ts` wiring: inside `fetchInvoiceData`, after the invoice row is fetched, call `fetchLatestEinvoiceSubmission(invoiceId)`; set `einvoiceSignedQr` to the accepted submission's `SignedQRCode` or `null`. In the invoice adapter's QR block (the regime-driven successor of `invoiceAdapter.ts:300`), for `regimeClass === 'clearance_api'` render the QR **iff `einvoiceSignedQr` is non-null, with exactly that string as QR content** — never a locally built payload.

- [ ] **Step 3: Run tests + typecheck** — `npx vitest run src/lib/einvoiceService.test.ts` green; `npm run typecheck` 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/einvoiceService.ts src/lib/einvoiceService.test.ts src/components/financial/EinvoiceComplianceBadge.tsx src/pages/financial/InvoiceDetailPage.tsx src/lib/pdf/dataFetcher.ts
git commit -m "feat(einvoice): honest IRN compliance badge + sealed-artifact QR rendering"
```

**WP-8 verification:** issuing an `in_irn` invoice writes a `generated` `einvoice_submissions` row carrying BOTH `payload_hash` and `payload_storage_path`, with the sealed bytes present in the private `einvoice-artifacts` bucket (Task 25b); raw UPDATE on `einvoice_submissions` rejected (Task 25 probe); contract test green; with `INDIA_IRP_ENABLED` unset the edge function returns 503 (never partial behavior); badge renders 'IRN pending' for a generated submission.

---

### Work Package WP-9 — Lakh Grouping + Indian-Scale Words (Tasks 28–29, one PR)

### Task 28: '3;2' digit grouping in `formatCurrencyWithConfig` + `formatEngineMoney`

**Files:**
- Modify: `src/lib/format.ts` (grouping regex at `:63` inside `formatCurrencyWithConfig`)
- Modify: `src/types/tenantConfig.ts` (`CurrencyConfig` interface at `:12-27` — add `digitGrouping`)
- Modify: `src/lib/tenantConfigService.ts` (populate `digitGrouping` in the currency mapping from the resolved layers — beside the existing `decimalSeparator`/`thousandsSeparator` resolution)
- Modify: `src/lib/country/registry.ts` (ensure a `number_format.digit_grouping` `ConfigKeyDef` exists: domain `'number_format'`, schema `z.enum(['3','3;2'])`, `codedDefault: '3'`, NOT required — add it if the Phase 2 sweep did not)
- Modify: `src/lib/pdf/utils.ts` (`formatEngineMoney` at `:69-77` — optional `digitGrouping` in `opts`)
- Test: extend `src/lib/format.test.ts` (create if absent) and the pdf utils test

**Interfaces:**
- Consumes: `geo_countries.digit_grouping` (live column, IN = '3;2'); `CurrencyConfig`.
- Produces: `groupIntegerDigits(intPart, grouping, separator)`; `CurrencyConfig.digitGrouping: '3' | '3;2'` — consumed by every in-app money render and the PDF engine money path. **Byte-stability guard:** `'3'` (the default) produces output byte-identical to today.

- [ ] **Step 1: Write the failing tests**

```typescript
// extend/create src/lib/format.test.ts
import { describe, it, expect } from 'vitest';
import { groupIntegerDigits, formatCurrencyWithConfig } from './format';
import type { CurrencyConfig } from '../types/tenantConfig';

const inr: CurrencyConfig = {
  code: 'INR', symbol: '₹', name: 'Indian Rupee', decimalPlaces: 2,
  decimalSeparator: '.', thousandsSeparator: ',', position: 'before',
  displayMode: 'symbol', negativeFormat: 'minus', digitGrouping: '3;2',
};

describe('groupIntegerDigits', () => {
  it("western '3': 1000000 → 1,000,000", () => {
    expect(groupIntegerDigits('1000000', '3', ',')).toBe('1,000,000');
  });
  it("lakh '3;2': 1000000 → 10,00,000 and 106200 → 1,06,200", () => {
    expect(groupIntegerDigits('1000000', '3;2', ',')).toBe('10,00,000');
    expect(groupIntegerDigits('106200', '3;2', ',')).toBe('1,06,200');
    expect(groupIntegerDigits('123', '3;2', ',')).toBe('123');
    expect(groupIntegerDigits('1234', '3;2', ',')).toBe('1,234');
    expect(groupIntegerDigits('-106200', '3;2', ',')).toBe('-1,06,200');
  });
});

describe('formatCurrencyWithConfig with digitGrouping', () => {
  it('renders the walkthrough total ₹1,06,200.00', () => {
    expect(formatCurrencyWithConfig(106200, inr)).toBe('₹1,06,200.00');
  });
  it("'3' stays byte-identical to the legacy regex path", () => {
    expect(formatCurrencyWithConfig(106200, { ...inr, digitGrouping: '3', symbol: '$', code: 'USD' }))
      .toBe('$106,200.00');
  });
});
```

Run: `npx vitest run src/lib/format.test.ts` — FAIL (`groupIntegerDigits` not exported; `digitGrouping` not in type).

- [ ] **Step 2: Implement**

`src/types/tenantConfig.ts` — add to `CurrencyConfig` after `negativeFormat`:

```typescript
  /** Integer digit grouping: '3' (Western thousands) or '3;2' (Indian lakh/crore).
   *  Resolved from geo_countries.digit_grouping via number_format.digit_grouping. */
  digitGrouping: '3' | '3;2';
```

`src/lib/format.ts` — add above `formatCurrencyWithConfig` and rewire line 63:

```typescript
/** Group an integer digit string per the tenant's grouping style. '3' reproduces the
 *  legacy regex byte-for-byte; '3;2' is lakh/crore (last 3, then 2s). */
export const groupIntegerDigits = (intPart: string, grouping: '3' | '3;2', separator: string): string => {
  if (grouping === '3;2') {
    const sign = intPart.startsWith('-') ? '-' : '';
    const digits = sign ? intPart.slice(1) : intPart;
    if (digits.length <= 3) return intPart;
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, separator);
    return `${sign}${rest}${separator}${last3}`;
  }
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
};
```

and replace `format.ts:63`:

```typescript
  const integerPart = groupIntegerDigits(parts[0], config.digitGrouping ?? '3', config.thousandsSeparator);
```

`src/lib/tenantConfigService.ts` — in the engine-path currency mapping (`resolveTenantConfigFromLayers`, the block that builds the `currency` object around `:95`), add:

```typescript
      digitGrouping: (resolveCountryConfigKey(layers, 'number_format.digit_grouping') as '3' | '3;2') ?? '3',
```

and in the legacy `mapRowToConfig` seam add `digitGrouping: '3' as const,` beside the other currency fields (byte-stable default). `src/lib/country/registry.ts` — append the key definition if absent:

```typescript
  {
    key: 'number_format.digit_grouping',
    domain: 'number_format',
    label: 'Digit grouping',
    description: "Integer grouping style: '3' Western thousands, '3;2' Indian lakh/crore.",
    schema: z.enum(['3', '3;2']),
    codedDefault: '3',
  },
```

`src/lib/pdf/utils.ts` — extend `formatEngineMoney`:

```typescript
export function formatEngineMoney(
  amount: number,
  opts: { symbol: string; decimalPlaces: number; position: 'before' | 'after'; digitGrouping?: '3' | '3;2' },
): string {
  const [intPart, decPart] = amount.toFixed(opts.decimalPlaces).split('.');
  const grouping = opts.digitGrouping ?? '3';
  const grouped = grouping === '3;2'
    ? (intPart.length > 3
        ? `${intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${intPart.slice(-3)}`
        : intPart)
    : intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = decPart ? `${grouped}.${decPart}` : grouped;
  return opts.position === 'before' ? `${opts.symbol} ${formatted}` : `${formatted} ${opts.symbol}`;
}
```

Thread `digitGrouping` into the engine adapters' `formatEngineMoney` call sites from the resolved country facts (`countryFactsService` exposes the geo scalars — add `digit_grouping` to `ResolvedCountryFacts` if Phase 2's wiring did not; grep `formatEngineMoney(` across `src/lib/pdf/engine/adapters/` and pass the option at every call site — the option is additive-defaulted so untouched sites stay byte-identical).

- [ ] **Step 3: Run tests + full suite for byte-stability**

Run: `npx vitest run src/lib/format.test.ts` green, then `npm test` — Expected: ALL existing snapshot/golden tests still green (the '3' default is byte-identical; any golden diff = a bug in this task). `npm run typecheck` — 0 (the added required `digitGrouping` field will surface every `CurrencyConfig` literal in tests — update them with `digitGrouping: '3'`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/types/tenantConfig.ts src/lib/tenantConfigService.ts src/lib/country/registry.ts src/lib/pdf/utils.ts
git commit -m "feat(i18n): digit grouping '3;2' — lakh/crore rendering in-app and in the PDF engine"
```

### Task 29: Indian-scale amount-in-words

**Files:**
- Modify: `src/lib/pdf/engine/amountInWords.ts` (add `numberToWordsEnIndian`; additive `scale` param on `amountInWordsEn` — current signature at `:59`)
- Modify: `src/lib/pdf/engine/countryConfig.ts` (`countryTemplateOverride` at `:21` — map `format.amount_words_scale` into the override) and the two adapter call sites: `src/lib/pdf/engine/adapters/invoiceAdapter.ts:191-192` (+ the taxSummary words at `:215-220`) and `src/lib/pdf/engine/adapters/quoteAdapter.ts:172-173`
- Test: extend `src/lib/pdf/engine/amountInWords.test.ts`

**Interfaces:**
- Consumes: existing `numberToWordsEn`/`threeDigitsEn` internals (`amountInWords.ts:17-50`); pack key `format.amount_words_scale` (Task 3 data → resolved country facts).
- Produces: `numberToWordsEnIndian(value): string`; `amountInWordsEn(amount, currency?, decimals?, scale?: 'western'|'indian')` — default `'western'` keeps every existing caller byte-identical.

- [ ] **Step 1: Write the failing tests**

```typescript
// extend src/lib/pdf/engine/amountInWords.test.ts
import { numberToWordsEnIndian, amountInWordsEn } from './amountInWords';

describe('indian scale words', () => {
  it('spells lakh and crore', () => {
    expect(numberToWordsEnIndian(1234000)).toBe('Twelve Lakh Thirty-Four Thousand'.replace('-', ' '));
    expect(numberToWordsEnIndian(106200)).toBe('One Lakh Six Thousand Two Hundred');
    expect(numberToWordsEnIndian(10000000)).toBe('One Crore');
    expect(numberToWordsEnIndian(123456789)).toBe('Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine');
    expect(numberToWordsEnIndian(0)).toBe('Zero');
  });
  it("amountInWordsEn scale='indian' spells the walkthrough total", () => {
    expect(amountInWordsEn(106200, '₹', 2, 'indian')).toBe('₹ One Lakh Six Thousand Two Hundred only');
  });
  it("default scale stays western (byte-identical to existing callers)", () => {
    expect(amountInWordsEn(1234000, 'OMR', 3)).toBe('OMR One Million Two Hundred Thirty Four Thousand only');
  });
});
```

Run: `npx vitest run src/lib/pdf/engine/amountInWords.test.ts` — FAIL (`numberToWordsEnIndian` not exported). (Adjust the first assertion's hyphen expectation to the module's actual space-joined style — `threeDigitsEn` emits 'Thirty Four', so the expected string is 'Twelve Lakh Thirty Four Thousand'.)

- [ ] **Step 2: Implement**

Append to `src/lib/pdf/engine/amountInWords.ts`:

```typescript
/** Indian numbering scale: crore (10^7), lakh (10^5), thousand, then hundreds. */
export function numberToWordsEnIndian(value: number): string {
  if (!Number.isFinite(value)) return '';
  let n = Math.floor(Math.abs(value));
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

Change `amountInWordsEn` (`:59`) to the additive 4-arg form:

```typescript
export function amountInWordsEn(amount: number, currency = '', decimals = 2, scale: 'western' | 'indian' = 'western'): string {
  const whole = Math.floor(Math.abs(amount));
  const factor = 10 ** decimals;
  const minor = Math.round((Math.abs(amount) - whole) * factor);
  const words = scale === 'indian' ? numberToWordsEnIndian(whole) : numberToWordsEn(whole);
  const minorPart = decimals > 0 && minor > 0
    ? ` and ${String(minor).padStart(decimals, '0')}/${factor}` : '';
  return `${currency ? `${currency} ` : ''}${words}${minorPart} only`;
}
```

Wiring: in `countryTemplateOverride` (`countryConfig.ts:21-48`) add `amountWordsScale: facts.amount_words_scale === 'indian' ? 'indian' as const : 'western' as const` to the returned override (add `amount_words_scale` to `ResolvedCountryFacts` sourced from the pack key), and at the four adapter words call sites (`invoiceAdapter.ts:191, :192, :219, :220`; `quoteAdapter.ts:172, :173`) pass the resolved scale as the 4th argument to `amountInWordsEn` (Arabic speller unchanged — Indian tenants are `en-IN`).

- [ ] **Step 3: Run tests + full PDF goldens**

Run: `npx vitest run src/lib/pdf/engine/amountInWords.test.ts` green; then `npx vitest run src/lib/pdf` — all existing goldens/parity tests green (western default untouched). `npm run typecheck` — 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/engine/amountInWords.ts src/lib/pdf/engine/amountInWords.test.ts src/lib/pdf/engine/countryConfig.ts src/lib/pdf/engine/adapters/invoiceAdapter.ts src/lib/pdf/engine/adapters/quoteAdapter.ts
git commit -m "feat(pdf): indian-scale amount-in-words behind the format.amount_words_scale pack key"
```

**WP-9 verification:** `npm test` fully green (byte-stability); the Task 11 golden re-run now shows '1,06,200.00' + indian words for the India fixture.

---

### Work Package WP-10 — External CA Validation Gate + Publish (Tasks 30–33)

### Task 30: CA validation handoff package generator

**Files:**
- Create: `scripts/country-packs/generate-ca-handoff.ts`
- Create: `docs/compliance/india/README.md` (workflow doc)
- Modify: `package.json` (script `"pack:handoff": "vitest run --config vitest.config.scripts.ts scripts/country-packs/generate-ca-handoff.ts"` — mirror the `geo:build-seed` GENERATE=1 pattern)
- Test: the generator IS a scripts-project vitest file gated on `GENERATE=1` (the established `scripts/country-engine/generate-seed.test.ts` pattern)

**Interfaces:**
- Consumes: the seven fixture JSONs + `fixtureToTaxContext` + `inGstStrategy` (Tasks 6–7); Task 1 subdivision list; Task 2 rate rows; Task 3 numbering/rounding data.
- Produces: `docs/compliance/india/ca-validation-handoff.md` — the handoff artifact: per fixture (1) the human-readable input document, (2) the engine-computed expected values (component rows, totals, trace summary), (3) the statutory citations, (4) a sign-off block; plus the data annexes (state-code table, slab table, UQC map, numbering rule, rounding policy). This file is what the engaged CA reviews and signs.

- [ ] **Step 1: Write the generator (it is its own test — asserts the output is complete)**

```typescript
// scripts/country-packs/generate-ca-handoff.ts
// GENERATE=1 npm run pack:handoff  →  writes docs/compliance/india/ca-validation-handoff.md
// Without GENERATE it asserts the committed handoff is in sync with the fixtures
// (drift gate: fixture edits MUST regenerate the handoff the CA signs).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fixtureToTaxContext, type InGstFixture } from '../../src/lib/regimes/in_gst/fixtures';
import { inGstStrategy } from '../../src/lib/regimes/in_gst';

const FIXTURE_DIR = path.resolve(__dirname, '../../src/lib/regimes/in_gst/fixtures');
const OUT = path.resolve(__dirname, '../../docs/compliance/india/ca-validation-handoff.md');

async function buildHandoff(): Promise<string> {
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).sort();
  const sections: string[] = [
    '# India GST Pack — External CA Validation Handoff',
    '',
    'Generated from `src/lib/regimes/in_gst/fixtures/` — DO NOT EDIT BY HAND.',
    'Reviewer instructions: verify each computed expectation against the cited statute;',
    'sign the block at the end of each fixture; return the signed document. Each sign-off',
    'is transcribed into the fixture `_meta.external_validation` block (Task 31 gate).',
    '',
  ];
  for (const f of files) {
    const fx: InGstFixture = JSON.parse(readFileSync(path.join(FIXTURE_DIR, f), 'utf8'));
    const result = await inGstStrategy.compute(fixtureToTaxContext(fx.input_document));
    sections.push(
      `## Fixture: ${fx.name}`,
      '',
      '### Input document', '```json', JSON.stringify(fx.input_document, null, 2), '```',
      '### Engine-computed expected values', '```json',
      JSON.stringify({ rollups: result.rollups, totals: result.totals, notations: result.notations }, null, 2),
      '```',
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
  sections.push(
    '## Data annexes for review',
    '- GST state-code table: migration `india_geo_subdivisions_seed` (37 rows)',
    '- Slab rate rows: migration `india_gst_tax_rates` (14 rows; 5/12/18/28 + zero/exempt)',
    '- UQC mappings: migration `india_pack_bindings` part 4',
    "- Numbering: 'INV/{FY}/{SEQ:4}', fiscal 04-01, 16-char cap (rule 46(b))",
    "- Rounding: { half_up, line, cash_increment: 1 } (s.170)",
    '- IRN threshold: aggregate turnover ₹5 crore (regime row thresholds)',
    '- DEFERRED for guidance: composition levy math, CESS, document-level TDS estimation',
    '',
  );
  return sections.join('\n');
}

describe('CA handoff package', () => {
  it('generates (GENERATE=1) or verifies the committed handoff matches the fixtures', async () => {
    const content = await buildHandoff();
    if (process.env.GENERATE === '1') {
      writeFileSync(OUT, content);
      expect(existsSync(OUT)).toBe(true);
    } else {
      expect(existsSync(OUT), 'run: GENERATE=1 npm run pack:handoff').toBe(true);
      expect(readFileSync(OUT, 'utf8')).toBe(content);
    }
  });
});
```

- [ ] **Step 2: Generate + document the workflow**

Run: `GENERATE=1 npm run pack:handoff` — writes the file. Create `docs/compliance/india/README.md`:

```markdown
# India pack — external validation workflow (owner decision E1)

1. `GENERATE=1 npm run pack:handoff` produces `ca-validation-handoff.md` from the fixtures.
2. Engage a practicing Indian CA (budgeted Phase-4 line item). Deliver the handoff.
3. The CA verifies every fixture's computed expectations against the cited statutes and
   signs each sign-off block (name, ICAI membership no., date, reference).
4. Transcribe each sign-off into the fixture's `_meta.external_validation` block:
   `{ "status": "validated", "validator": "...", "credential": "ICAI ...",
      "reference": "...", "signed_off_at": "YYYY-MM-DD" }` and commit the signed PDF
   under `docs/compliance/india/signoffs/`.
5. Re-run `GENERATE=1 npm run pack:handoff` (the handoff embeds no status — content is
   fixture-driven) and re-seed `master_country_pack_tests` (Task 32 migration is
   idempotent by name).
6. Only now can `publish_country_pack` succeed (gate ⑤, Task 31) and India flip
   `statutory_ready`. Any later fixture change re-enters this loop (the drift gate in
   `generate-ca-handoff.ts` fails CI if the handoff is stale).
```

- [ ] **Step 3: Verify + commit**

Run: `npm run pack:handoff` (no GENERATE) — PASS (sync check). Commit:

```bash
git add scripts/country-packs/generate-ca-handoff.ts docs/compliance/india package.json
git commit -m "feat(compliance): CA validation handoff generator + sign-off workflow for the India pack"
```

### Task 31: Migration — publish gate ⑤ (external validation)

**Files:**
- Migration: `publish_gate_external_validation`
- Modify: `src/types/database.types.ts` (regen), `supabase/migrations.manifest.md`

**Interfaces:**
- Consumes: `publish_country_pack(p_country_id, p_version)` (Phase 3; capture current body via `pg_get_functiondef` exactly as in Task 22 Step 1).
- Produces: gate ⑤ — publish fails while any `master_country_pack_tests` row for the country carries a non-`validated` `_meta.external_validation`; the gate JSON gains `"external_validation": { "pass": bool, "unvalidated": int }`.

- [ ] **Step 1: Probe**

```sql
SELECT pg_get_functiondef(p.oid) ILIKE '%external_validation%' AS gated
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='publish_country_pack';
```

Expected: `gated = false`. Capture the full functiondef to the scratchpad (`publish_country_pack.current.sql`).

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `publish_gate_external_validation` — CREATE OR REPLACE of the captured body with ONE block spliced immediately after the existing gate ④ checks and before the final pass/fail aggregation (declare `v_unvalidated int;` with the other DECLAREs):

Splice fragment A — the count, placed with the other DECLAREs' assignments, immediately after the captured body's gate ④ checks (before it assembles its return jsonb):

```sql
-- [GATE-5] external validation (AD-5, owner E1): any pack test carrying the
-- _meta.external_validation block must be signed off. Countries whose tests carry no
-- block (machine-derived parity corpora, e.g. Oman) are unaffected.
SELECT count(*) INTO v_unvalidated
FROM master_country_pack_tests t
WHERE t.country_id = p_country_id
  AND t.input_document -> '_meta' ? 'external_validation'
  AND t.input_document -> '_meta' -> 'external_validation' ->> 'status' IS DISTINCT FROM 'validated';
```

Splice fragment B — two exact edits to the captured body's final return assembly (the `RETURN jsonb_build_object('published', <PUB_EXPR>, …, 'gate', jsonb_build_object(<GATE_KEYS>))` at the tail of the function):

1. Inside the inner `'gate'` `jsonb_build_object(<GATE_KEYS>)`, add this key/value pair (comma-separated, alongside the existing `'fixtures'`/`'capabilities'`/`'dual_control'`/`'coverage'` keys):
   ```sql
   'external_validation', jsonb_build_object('pass', (v_unvalidated = 0), 'unvalidated', v_unvalidated)
   ```
2. Replace the top-level `'published'` value expression `<PUB_EXPR>` (whatever boolean the captured body already computes from gates ①–④) with:
   ```sql
   (<PUB_EXPR>) AND (v_unvalidated = 0)
   ```

(`<PUB_EXPR>` and `<GATE_KEYS>` are placeholders for the captured body's own text — the Step-1 `pg_get_functiondef` capture shows their exact form; only these two structural edits are applied, no other logic changes.)

- [ ] **Step 3: Assert**

Re-run the Step-1 probe — Expected `gated = true`. Behavioral check runs in Task 32 (a publish attempt with `pending` fixtures must return `"published": false` with `"external_validation": {"pass": false, ...}`).

- [ ] **Step 4: Regen types + typecheck; manifest row; commit**

```
| <version> | publish_gate_external_validation.sql | Additive | publish_country_pack gate ⑤: external-validation sign-off required where declared | Phase 4 |
```

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "feat(governance): publish gate 5 — external validation sign-off enforcement"
```

### Task 32: Seed pack tests, provision the India fixture tenant, publish through the machine gate

**Files:**
- Migration: `india_pack_tests_seed`
- Operator steps via `mcp__supabase__execute_sql` (pack draft → review → publish)
- Modify: `supabase/migrations.manifest.md`, `src/types/database.types.ts` (regen)

**Interfaces:**
- Consumes: the seven fixture JSONs (Task 7 — after CA sign-off transcription, Task 30 workflow); `create_country_pack_draft`, `submit_country_pack_for_review`, `publish_country_pack` (Phase 3); `issue_tax_document(p_dry_run)` (Phase 1); Task 14's provisioning path.
- Produces: India `config_status = 'statutory_ready'` (machine-derived); a provisioned India fixture tenant proving the end-to-end walkthrough.

- [ ] **Step 1: Seed `master_country_pack_tests`**

The seed migration is MACHINE-GENERATED from the seven fixture JSONs so no `<…>` placeholder ever reaches the applied SQL. Add the generator `scripts/gen-india-pack-seed.mjs`:

```javascript
// scripts/gen-india-pack-seed.mjs — emits the complete india_pack_tests_seed SQL by
// reading the fixtures. Fixture JSON is the single source; the migration mirrors it.
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'src/lib/regimes/in_gst/fixtures';
const names = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;         // SQL single-quote literal

const values = names.map((n) => {
  const fx = JSON.parse(readFileSync(`${dir}/${n}.json`, 'utf8'));
  const doc = JSON.stringify({ ...fx.input_document, _meta: fx._meta });   // fold _meta in so gate ⑤ sees the sign-off
  return `  (${q(n)}, ${q(doc)}, ${q(JSON.stringify(fx.expected))})`;
}).join(',\n');

process.stdout.write(`INSERT INTO master_country_pack_tests (country_id, name, input_document, expected)
SELECT c.id, v.name, v.doc::jsonb, v.expected::jsonb
FROM geo_countries c,
(VALUES
${values}
) AS v(name, doc, expected)
WHERE c.code = 'IN' AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM master_country_pack_tests t WHERE t.country_id = c.id AND t.name = v.name);
`);
```

Generate the SQL, then apply it verbatim:

```bash
node scripts/gen-india-pack-seed.mjs > /tmp/india_pack_tests_seed.sql
```

Apply the emitted `/tmp/india_pack_tests_seed.sql` via `mcp__supabase__apply_migration`, name `india_pack_tests_seed`. `readdirSync` picks up all seven fixtures (including `cash_rounding_exclusive.json`); each row's `input_document` is the fixture's `input_document` with `_meta` folded in, `expected` is the fixture's `expected`, and the name guard makes it idempotent. Because the SQL is generated from the JSON, it mirrors the fixtures byte-for-byte and contains **no placeholder** in the applied migration.

Assert: `SELECT count(*) FROM master_country_pack_tests t JOIN geo_countries c ON c.id=t.country_id AND c.code='IN'` → 7. Regen types; manifest row:

```
| <version> | india_pack_tests_seed.sql | Additive | India pack fixtures seeded into master_country_pack_tests (with external-validation metadata) | Phase 4 |
```

- [ ] **Step 2: NEGATIVE publish (fixtures still pending)**

Via `mcp__supabase__execute_sql` (as a platform admin session):

```sql
SELECT create_country_pack_draft((SELECT id FROM geo_countries WHERE code='IN'), 'India pack v1 — GST launch') AS pack_id;
SELECT submit_country_pack_for_review('<pack_id>');
SELECT publish_country_pack((SELECT id FROM geo_countries WHERE code='IN'), 1);
```

Expected while `_meta.external_validation.status='pending'`: `{"published": false, ..., "gate": {..., "external_validation": {"pass": false, "unvalidated": 6}}}` and `config_status` unchanged (`formatting_ready`). **This failing publish is the gate's own test.**

- [ ] **Step 3: CA sign-off transcription, re-seed, POSITIVE publish**

After the Task 30 workflow completes: update the seven fixture JSONs' `_meta.external_validation` to `validated` (+ validator/credential/reference/date), regenerate the handoff, commit; then re-sync the seeded rows' sign-off (data update, NOT a new migration) by generating one `UPDATE` per fixture from the now-validated JSON and applying them via `mcp__supabase__execute_sql`. The emitter (same fixtures-dir walk as Step 1) prints complete statements — no placeholder:

```bash
node -e '
const { readdirSync, readFileSync } = require("node:fs");
const dir = "src/lib/regimes/in_gst/fixtures";
const q = (s) => "'"'"'" + String(s).replace(/'"'"'/g, "'"'"''"'"'") + "'"'"'";
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const fx = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  console.log(`UPDATE master_country_pack_tests SET input_document = jsonb_set(input_document, ${q("{_meta,external_validation}")}, ${q(JSON.stringify(fx._meta.external_validation))}::jsonb) WHERE name = ${q(f.replace(".json",""))} AND country_id = (SELECT id FROM geo_countries WHERE code=${q("IN")});`);
}
'
```

(× 7 statements.) Then re-run `publish_country_pack` (dual control: approver ≠ the draft author). Expected: `{"published": true, ...}` and:

```sql
SELECT config_status FROM geo_countries WHERE code='IN';
```

→ `statutory_ready` (machine-derived — at no point is it hand-set).

- [ ] **Step 4: End-to-end walkthrough on a fixture tenant**

Provision an India fixture tenant through the real signup path (exercises Tasks 13–14): country India, GSTIN `29ABCDE1234F1Z5`, state Karnataka. Then in the app: create the walkthrough quote (2 × ₹45,000, SAC 998713, UQC NOS, place of supply KA) → dry-run shows CGST 9% ₹8,100 + SGST 9% ₹8,100 → convert + issue → verify via `mcp__supabase__execute_sql`:

```sql
SELECT invoice_number FROM invoices WHERE tenant_id='<fixture-tenant>' ORDER BY created_at DESC LIMIT 1;
-- expect 'INV/2026-27/0001' (16 chars, FY-anchored)
SELECT component_code, rate, tax_amount FROM document_tax_lines
 WHERE tenant_id='<fixture-tenant>' AND line_item_id IS NULL ORDER BY sequence;
-- expect CGST 9 8100 / SGST 9 8100
SELECT component_code, vat_amount_base, tax_period FROM vat_records WHERE tenant_id='<fixture-tenant>';
-- expect two rows, tax_period '2026-XX' (tenant-local month)
SELECT status, payload_hash, payload_storage_path FROM einvoice_submissions WHERE tenant_id='<fixture-tenant>';
-- expect 'generated' with a non-null sha256 payload_hash AND payload_storage_path (Task 25b; badge shows 'IRN pending')
SELECT count(*) FROM chain_of_custody WHERE tenant_id='<fixture-tenant>' AND action_category='financial';
-- expect >= 1 (v1.2.0 invariant across the new path)
```

Record a TDS payment (₹98 cash + ₹2 withheld) → `payment_withholdings` shows the credit row and the invoice settles in full. Create the GSTR return → `tax_return_lines` carries 3B boxes + `hsn.998713` with quantity 2 / NOS.

- [ ] **Step 5: Commit operator evidence**

```bash
git add supabase/migrations.manifest.md src/types/database.types.ts src/lib/regimes/in_gst/fixtures docs/compliance/india
git commit -m "feat(pack): India pack v1 published statutory_ready through the machine gate (CA-validated fixtures)"
```

### Task 33: Phase exit sweep — CI, lint, full suite, drift gates

**Files:** none new — verification only (fix regressions where found).

- [ ] **Step 1:** `npm run typecheck` → 0 errors. `npm run check:tsc` → exit 0.
- [ ] **Step 2:** `npm test` → all green (node + dom projects; LocaleContext/i18n jsdom failures are the known local-only artifact — verify them green in CI, not locally).
- [ ] **Step 3:** `npm run lint` → clean; specifically zero hits from `xsuite/no-country-branching-outside-regimes` and `xsuite/no-adhoc-money-allocation`.
- [ ] **Step 4:** `npm run geo:test` → scripts project green (provision guards, numbering live probe, payload contract, handoff sync).
- [ ] **Step 5:** `npm run check:schema-drift` → green (live DB == committed types).
- [ ] **Step 6:** CI `statutory-fixtures` job now enumerates India (it is `statutory_ready`) and replays the seven fixtures via `runPublishGate({mode:'kernel'})` → green run linked on the PR.
- [ ] **Step 7:** Re-run the Oman byte-parity spot check (`npx vitest run src/lib/pdf/engine` goldens + the Phase-1 parity suite) — India work must not have moved a single Omani byte.
- [ ] **Step 8: Commit any fixes; open the final PR.**

---

## Testing Strategy

1. **Golden compliance fixtures (dual-resident):** seven `in_gst` fixtures live in `src/lib/regimes/in_gst/fixtures/` (repo CI: `fixtures.test.ts` + the `statutory-fixtures` job via `runPublishGate('kernel')`) AND in `master_country_pack_tests` (DB publish gate replays via dry-run `issue_tax_document` on every publish — fires even on a single rate-row edit). The fixture numbers are the CA-reviewed legal evidence; expectations are never adjusted to match code.
2. **Multi-country matrix, IN row:** intra CGST+SGST vs inter IGST (Task 7); inclusive B2C back-out (Task 7); GSTIN bands + place of supply + HSN/UQC columns + `INV/{FY}/{SEQ:4}` 16-char (Tasks 11, 16, 32); component-split reversal (credit-note contra netting, Task 19); GSTR-3B monthly Apr-anchor + GSTR-1 HSN summary (Tasks 18–21).
3. **Property tests:** largest-remainder totality, inclusive round-trip, cash-increment closure, deterministic traces — 1,000+ seeded-random cases (Task 8).
4. **Security/bypass:** raw `UPDATE einvoice_submissions` rejected (Task 25); `transition_einvoice_submission` REVOKEd from authenticated/anon; `payment_withholdings` RESTRICTIVE isolation (5 policies asserted); India B2B issuance without GSTIN blocked in-RPC (Task 4 rows + Task 32 dry-run negative check); illegal status transitions rejected.
5. **Invariants:** custody 'financial' events across the India issuance path (Task 32 SQL check); conservation `Σ allocations = amount + withheld` (Task 22 probe); header ≡ Σ rollups (Task 11); byte-stability of all non-India output — `digitGrouping '3'` default, `scale 'western'` default, full golden suite re-run (Tasks 28–29, 33).
6. **External validation as test infrastructure:** the handoff generator doubles as a drift gate (committed handoff must equal fixture-derived content); publish gate ⑤ makes an unsigned pack structurally unpublishable (Task 32 Step 2 proves the failure mode before proving success).

## Verification Commands

| Command | Expected |
|---|---|
| `npm run typecheck` | exit 0, no output |
| `npm run check:tsc` | `0` diagnostics, exit 0 |
| `npm test` | all suites pass (node + dom) |
| `npx vitest run src/lib/regimes` | in_gst + gstr + in_irn + sha256 suites pass |
| `npm run lint` | exit 0; no `no-country-branching-outside-regimes` / `no-adhoc-money-allocation` hits |
| `npm run geo:test` | scripts project passes (guards, live numbering probe self-skips locally, payload contract, handoff sync) |
| `GENERATE=1 npm run pack:handoff` | regenerates `docs/compliance/india/ca-validation-handoff.md` |
| `npm run check:schema-drift` | `database.types.ts` matches live |
| `mcp__supabase__execute_sql`: `SELECT config_status FROM geo_countries WHERE code='IN'` | `statutory_ready` (after Task 32) |
| `mcp__supabase__execute_sql`: `SELECT count(*) FROM master_country_pack_tests t JOIN geo_countries c ON c.id=t.country_id AND c.code='IN'` | `7` |

## Acceptance Criteria

- [ ] `in_gst` strategy contains zero India-specific arithmetic (Task 6 structural test green); CGST/SGST vs IGST decided purely by kernel scheme mode + rate rows.
- [ ] All seven statutory fixtures green in repo CI AND replayed green by the DB publish gate; every fixture carries a transcribed CA sign-off (`status='validated'`, named validator + ICAI credential + reference).
- [ ] India `geo_countries.config_status = 'statutory_ready'`, machine-derived by `publish_country_pack`; a publish attempted with pending fixtures demonstrably returned `published: false` (gate ⑤).
- [ ] Fixture tenant end-to-end: onboarding captured GSTIN 29… + Karnataka into `legal_entity_tax_registrations`; issued invoice numbered `INV/{FY}/{SEQ:4}` ≤16 chars; two `document_tax_lines` rollups + two `vat_records` base rows posted; custody 'financial' event written; `einvoice_submissions` row `generated` with sha256 hash.
- [ ] Inclusive ₹5,000 B2C: base 4,237.29, CGST 381.36 + SGST 381.35, gross reconstitutes exactly; whole-rupee `cash_increment` emits an `out_of_scope` adjustment line when the target differs.
- [ ] Issuance without buyer GSTIN (B2B) / place of supply / HSN / UQC is blocked in-RPC (dry-run returns 4 `block` failures; raw REST cannot skip).
- [ ] GSTR-3B boxes + GSTR-1 HSN summary (quantity + UQC + taxable + per-component tax per `item_code`) persisted in `tax_return_lines`; periods computed on Apr–Mar boundaries with pure string math.
- [ ] `record_payment` with `withheld_amount` settles the receivable in full and posts a `payment_withholdings` credit row; allocation ≠ amount+withheld raises.
- [ ] IRN: sealed artifact + hash at issuance; sandbox clearance only via the flag-gated edge fn; printed QR renders only the authority's SignedQRCode; non-cleared invoices show the honest pending badge; raw submission mutation rejected.
- [ ] `₹1,06,200.00` lakh grouping and 'One Lakh Six Thousand Two Hundred' indian-scale words on India surfaces; ALL non-India output byte-identical (full golden suite green).
- [ ] `npm run typecheck` = 0; manifest rows exist for all 9 core migrations (india_geo_subdivisions_seed, india_gst_tax_rates, india_pack_bindings, india_document_requirements, payment_withholdings_and_record_payment_tds, einvoice_submission_transitions, einvoice_artifacts_bucket_and_persist, publish_gate_external_validation, india_pack_tests_seed) plus the deploy-coupled india_irn_clearance_capability; no DROP/DELETE anywhere.

## Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Wrong statutory expectations (self-certified math)** — spec risk 2 | Fixtures are the CA review artifact (Task 30 handoff); gate ⑤ makes India structurally unpublishable unsigned; deferrals (composition, CESS, TDS-on-document) explicitly listed in the handoff for CA guidance |
| 2 | **Phase 1/3 interface drift** (`IssuedDocumentSnapshot` fields, publishGate fixture loader, composer creation path) — plans authored in parallel | The two integration seams are isolated behind local mappers (`fixtureToTaxContext`, `toIrnSource`) with explicit reconcile-at-execution notes; everything else consumes the frozen contract names verbatim |
| 3 | **`record_payment`/`publish_country_pack` splice errors** (CREATE OR REPLACE over an unseen body) | Mandatory pg_get_functiondef capture step; anchors are structural; behavioral SQL assertions (negative + positive) run before commit; both probes are rolled-back transactions |
| 4 | **AD-2 unique-index widening breaks a Phase-1 assumption** | Strict widening (existing NULL-`applies_to` rows keep their uniqueness); flagged in Open Questions for owner ratification before WP-1 merges |
| 5 | **Byte-stability regression on Oman from format/words changes** | Additive-defaulted params only (`digitGrouping '3'`, `scale 'western'`); Task 33 Step 7 re-runs the Oman parity/golden suites as a hard exit gate |
| 6 | **IRP sandbox API churn** (NIC schema/auth versions) | Version-pinned URLs + `schema_version` in the regime row config; generate-and-hold degradation (`held`/`dead_letter`); the sealed artifact never depends on the authority being up |
| 7 | **GSTR-3B taxable double-counting** (CGST+SGST pairs sharing one base) | Explicit dedup key + the 180,000 fixture assertion (Task 19); HSN summary sources line data, never the ledger (AD-4) |
| 8 | **CA engagement latency stalls the phase** | Everything except Task 32 Step 3+ proceeds with `pending` fixtures; the negative-publish proof (Step 2) lands early; the sign-off loop is the only external dependency and is budgeted per the roadmap row |

## Exit Criteria (roadmap row, made measurable)

1. India flips `statutory_ready` **through the machine gate**: `publish_country_pack` returns `published: true` with all five gates passing (fixtures replayed, capabilities resolved, dual control, coverage, external validation) — verified by the gate JSON archived on the PR and `SELECT config_status FROM geo_countries WHERE code='IN'` = `statutory_ready`.
2. Externally-validated fixtures green **in CI** (`statutory-fixtures` job enumerates IN and passes) **and in `master_country_pack_tests`** (6 rows, `last_result` pass, `_meta.external_validation.status='validated'` on all).
3. Every roadmap-row item demonstrably shipped: in_gst parameterization (T5–8), GSTIN multi-registration capture (T12–15), HSN/UQC validation (T3, T4, T9), FY numbering defaults (T3, T16–17), inclusive B2C + whole-rupee rounding as data (T2, T3, T7, T8), GSTR-3B/GSTR-1 composers incl. HSN summary (T18–21), TDS withholding in record_payment (T22–23), IRN artifact-first + sandbox flag (T24–27), CA validation budgeted + gated (T30–32), lakh grouping + indian-scale words (T28–29).
4. All Global Constraints hold: typecheck 0, additive-only, manifest complete, custody/audit invariants green, Oman byte-parity intact.

## Estimated Effort

| Work package | Engineer-days |
|---|---|
| WP-1 Statutory data foundation (4 migrations) | 3.0 |
| WP-2 in_gst strategy + fixtures + properties | 4.0 |
| WP-3 HSN/UQC + document profile + render pins | 3.0 |
| WP-4 GSTIN capture (service, onboarding, provisioning, settings UI) | 4.5 |
| WP-5 FY numbering (policy + live probes) | 1.5 |
| WP-6 GSTR composers + return wiring | 4.5 |
| WP-7 TDS withholding (migration + client) | 2.5 |
| WP-8 IRN transport (builder, transitions, issuance-time artifact persistence, edge fn, honest surfacing) | 6.0 |
| WP-9 Lakh grouping + indian words (incl. byte-stability sweep) | 2.0 |
| WP-10 CA gate + publish + exit sweep | 3.0 |
| **Total (engineering)** | **34 engineer-days (~6.5 wks single engineer; 4–5 wks with the parallelizable WPs 4/6/8/9 split across two)** |
| External CA engagement (elapsed, budgeted separately) | 1–3 wks elapsed, overlaps WP-5…WP-9 |

## Open Questions (for the owner)

1. **AD-2 contract deviation ratification:** the Phase-1 `geo_country_tax_rates` partial unique must gain `applies_to` (and a COALESCE on `subdivision_id`) or India's four slabs cannot coexist. Strict widening, zero effect on OM/AE/SA/US rows — please ratify so the contract text can be updated for Phase 5 authors.
2. **IRN `mandatory_from` platform baseline:** seeded as 2026-04-01 with the ₹5-crore threshold (the notified 2023 value). Confirm with the CA during Task 30 whether the platform should model the historical phase-in dates or only the current mandate (affects the badge copy, not the architecture).
3. **CA engagement procurement:** Task 30's workflow assumes a named practicing CA is engaged by the time WP-2 fixtures exist. Who owns the engagement (budget line, firm selection)?
4. **`IssuedDocumentSnapshot` field names** (Phase 1) and the **Phase-3 composer creation entry point** are consumed through documented adapter seams (Tasks 24, 21); if either phase shipped materially different shapes, those two mappers absorb it — flagging so the program board sequences the cross-plan reconciliation review.
