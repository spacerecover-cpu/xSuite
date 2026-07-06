# Phase 4 — India Pack: Verified Work-Package Design

**Date:** 2026-07-05 · **Status:** Approved (owner, 2026-07-05; section approvals waived — "proceed, finish all")
**Supersedes:** `docs/superpowers/plans/2026-07-02-localization-phase4-india-pack.md` as the governing decomposition. That plan remains a reference corpus — its task-level SQL/spec text is mined per-WP at plan-writing time where it survives the decisions below.
**Verification:** this design was adversarially verified by a 5-lens panel (statutory, codebase-accuracy, dependencies/delivery, critique-coverage, DR-lab fit) — 42 findings (6 blockers) all folded in or explicitly deferred. Evidence files: session scratchpad `verify-*.json`.

---

## 1. Goal & Owner Decisions (locked)

**Goal:** a real Indian data-recovery lab runs compliantly on xSuite — India flips `statutory_ready` through the machine publish gate with external CA validation, and a written GA checklist gates the first real tenant.

| # | Decision |
|---|----------|
| D1 | Re-derived decomposition; 2026-07-02 plan is input, not spec |
| D2 | Full Receipt Voucher (Rule 50) + Refund Voucher (Rule 51) in v1, wired to the case lifecycle |
| D3 | IRN **readiness only**: `regime.einvoice='no_einvoice'`; per-tenant "e-invoicing applicable" flag + loud warning; QR real-estate reserved; NO in_irn plugin/lifecycle/edge-fn this phase |
| D4 | Two-stage publish: spine ⇒ `statutory_ready`; GA onboarding checklist ⇒ first real lab |
| D5 | Slabs: 18% + zero (nil-rated domestic) + exempt only; mixed goods+services = two-document designed UX; 5/12/28 not seeded |
| D6 | Single GSTIN + explicit tenant-visible "GST registration status" setting; unregistered mode loud; silent fallback = dev assertion failure |
| D7 | CA engaged in parallel with S1; reviews fixture JSONs + rendered PDFs (invoice, credit note, receipt voucher) + a named-deferrals memo for ratification; sign-off = signed memo hash-referenced in pack-test `_meta.external_validation` |
| D8 | Delivery: PR-per-WP (fresh branch from main, squash), I open PRs, owner merges; migration WPs are same-day PRs |

## 2. Architecture Constraints (verified against live code/DB)

- **Zero kernel changes.** `in_gst.compute()` = one-line delegation to **`computeWithMode(ctx, 'split_by_place_of_supply')`** (`src/lib/tax/kernel/index.ts:88`; `computeDocumentTax` itself is hardwired to `'single'`). Split mode + `backOutInclusive` + `allocateLargestRemainder` are shipped and tested.
- **Contract freeze with ONE ratified exception:** `TaxDocumentType` union (`src/lib/regimes/types.ts:21`, currently `quote|invoice|credit_note|stock_sale`) gets an **additive-only widening** (`receipt_voucher`, `refund_voucher`) in WP-L4, proven non-breaking by assignability tests. No other interface changes.
- All India logic under `src/lib/regimes/` (eslint `no-country-branching-outside-regimes`).
- `vat_records` stays amount-only (AD-4); HSN/qty aggregates from `invoice_line_items` + `document_tax_lines`.
- **Capability rows are never hand-seeded.** `master_engine_capabilities` is a projection of `listRegisteredCapabilities()` via the `sync_engine_capabilities` RPC (`src/lib/tax/capabilityManifest.ts`). Each plugin WP registers in `register.ts` and syncs in the same PR; S7 asserts all rows present pre-publish.
- Additive-only migrations; tenant tables get full tenant discipline; `database.types.ts` regenerated per migration; manifest row per migration.
- **Two known seams to fix, both verified live:** `src/lib/taxDocumentService.ts` (a) lines ~162–170 hardcode buyer.taxNumber/subdivisionId, placeOfSupplySubdivisionId = null, roundingPolicy = document/half_up, scaleSystem = 'western'; (b) line ~172 hardcodes `resolveTaxStrategy('simple_vat')`, and `matchFormRate` (lines ~77–91) can never assemble the CGST/SGST/IGST head-set (9+9+18=36 ≠ form rate 18). Without fixing both, the kernel split never fires on a live invoice.

## 3. Statutory Semantics (pinned, CA-facing)

These are design-level rulings the fixtures encode; the CA validates them:

- **Rounding (Section 170):** line taxes compute at 2dp half-up; whole-rupee rounding applies **per tax head per invoice** (head level, not line level); `cash_increment: 1` produces a persisted **"Round off" adjustment line** (`out_of_scope` treatment) at grand total so invoice, ledger, and return tie. Pack binding is therefore `tax.rounding_policy = {mode:'half_up', level:'head', cash_increment:1}` — if the registry Zod schema for `level` lacks `'head'`, widening that enum is in-scope for S1a.
- **Equal dual-levy heads:** CGST and SGST are each independently 9% of the same taxable value and MUST be equal. The inclusive ₹5,000 B2C fixture is **taxable 4,237.29, CGST 381.36, SGST 381.36, round-off −0.01, total 5,000.00**. Largest-remainder applies only to the pre-rounding inclusive back-out allocation, never across equal-rate head pairs.
- **Numbering headroom (Rule 46(b)):** `{FY}` renders short-form (`25-26`); invoice template `INV/{FY}/{SEQ:4}` = 14 chars, letting SEQ grow to 6 digits within the 16-char cap. S5 pins overflow behavior: SEQ width grows within `max_length`; hard error before a 17-char number; test at the 9,999→10,000 boundary. Charset `[A-Za-z0-9/-]` is enforced as template validation in S5 (live `master_numbering_policies` has **no charset column**; we do not add one).
- **State codes:** seed the full active GST code set incl. 26* (merged DNH+DD; 25 defunct), 38 (Ladakh), AP=37 (28 defunct). **Ruling:** special codes 96 (foreign) / 97 (Other Territory) ARE seeded as place-of-supply-only rows, flagged non-GSTIN. WP-S3's GSTIN-validator set = seeded set MINUS the non-GSTIN-flagged codes, count-pinned by test.
- **UTGST:** UTs without legislatures print "UTGST", not "SGST" — subdivision-scoped rate rows / `component_label` data, plus a Chandigarh fixture.
- **'zero' means nil-rated domestic.** Export zero-rating (LUT) is deferred. A wholly-exempt document legally requires a Bill of Supply (Rule 49) — not supported; S4 adds a block/warning ("consult CA") and the deferral is named in the CA memo.
- **Rule 46 conditionals:** delivery-address-where-different is in the S4 profile; B2C ≥ ₹50,000 (unregistered buyer → name/address/PoS state mandatory) is a conditional block requirement row in S1b.
- **Rule 50/51 specifics:** refund voucher must reference the original receipt voucher number+date (block requirement, L4 migration); Rule 50 proviso defaults for indeterminable advances = 18% rate, IGST treatment.
- **Advance GST netting (blocker fix):** the receipt voucher posts tax at receipt; the final invoice posts **net-of-advance** (an offsetting adjustment entry in the invoice period). Conservation assertion: voucher tax + invoice net tax = total supply tax. An advance-then-invoice fixture proves the GSTR-3B boxes tie. GSTR-1 Table 11 rows: composed in S6 **or** explicitly named deferred — resolved at S6 planning; default = defer with the adjustment data model designed to support it.
- **GSTR-3B scope:** 3.1(a) outward taxable + per-head payable, 3.1(c) exempt/nil box, and **Table 3.2** (state-wise inter-state B2C — derivable from place-of-supply data). **Table 4 ITC is a named non-goal** (purchases not modeled) so the display-only 3B cannot be mistaken for fileable.

## 4. Work Packages

### Spine (gates `statutory_ready`)

**WP-S1a — Schema Foundation [S, MIGRATION PR]**
Widen `uq_geo_country_tax_rates_effective` to include COALESCE'd `applies_to` (subdivision COALESCE + `tax_category` already present in the live index — verified). Widen `master_document_requirements` CHECKs: `field_key` gains the credit-note original-invoice-ref key (doc_type widening for vouchers happens in L4, the WP that wires them). Widen the `tax.rounding_policy` registry/Zod `level` enum with `'head'` if absent. Nothing else.

**WP-S1b — India Data Pack [M, MIGRATION PR]**
Seed via Country Authoring Studio RPCs: `geo_subdivisions` (full active GST code list per §3, `tax_authority_code`); `geo_country_tax_rates` IN rows — 18% slab as **`tax_category='standard'`** + `applies_to='gst_slab_18'` (publish gate and kernel both filter on 'standard' — verified), CGST 9 / SGST 9 / IGST 18, plus zero + exempt categories, plus UT-scoped UTGST label rows; the migration includes a post-insert seed assertion (all `gst_slab_18` rows are `tax_category='standard'`, zero/exempt rows are not — migration fails on mismatch); IN `country_config` bindings (`regime.tax='in_gst'`, `regime.documents='in_gst_invoice'`, `regime.numbering='in_fiscal_numbering'`, `regime.einvoice='no_einvoice'` [D3], `tax.return_composer='gstr'`, `tax.filing_frequency='monthly'`, `tax.period_anchor='04-01'`, rounding per §3, `format.amount_words_scale='indian'`); `master_numbering_policies` IN rows (invoice/CN/receipt-voucher/refund-voucher/challan series, short-form FY, max_length 16); `master_unit_codes` UQC mappings; `master_document_requirements` block rows for invoice + credit note only (incl. B2C≥50k conditional; voucher rows live in L4). **No capability rows** (§2). Side task: CA engagement kickoff (D7).

**WP-S2 — IN Test Tenant + Buyer-Seam Threading [M, no migration]**
Provision the disposable IN test tenant (2nd live tenant). Buyer GSTIN/state capture **reuses existing columns** (`customers_enhanced.tax_number`/`subdivision_id`, `companies.*`, snapshotted on `invoices.buyer_tax_number`/`place_of_supply_subdivision_id` — all verified live): add GSTIN checksum + state-prefix validation to customer/company forms. Place-of-supply derivation per Sec 12(2) in `src/lib/regimes/in_gst/placeOfSupply.ts` (registered → GSTIN-prefix state; unregistered → billing state). Thread buyer fields, `placeOfSupplySubdivisionId`, pack-resolved rounding + scale into TaxContext in `taxDocumentService.ts` (pattern: `assembleStockSaleContext.ts:37-38`). **Strategy-key threading stays in S3** (threading `regime.tax` here would throw `CountryConfigError` — `in_gst` isn't registered yet); S2's dry-run acceptance = TaxContext **field** assertions, not tax-math; the IN tenant knowingly computes `simple_vat` until S3. Seller registration row created directly (UI is L2).

**WP-S3 — `in_gst` Strategy + Seam Completion + Golden Fixtures [M→L, no migration]**
`in_gst/index.ts` = one-line `computeWithMode(ctx,'split_by_place_of_supply')` delegation (structural test asserts zero India arithmetic). `gstin.ts` mod-36 checksum validator (state set = seeded set, count-pinned). **Seam completion (blocker fix):** thread pack-resolved `regime.tax` into `computeDocumentTotals` replacing the `'simple_vat'` hardcode (`taxDocumentService.ts:172`), and make `matchFormRate` slab-aware (form rate 18 on IN → the 3 real head rows, never a synthetic `form:18` row — regression test). Section 170 round-off adjustment line persisted. Register + `syncEngineCapabilities()` same PR. Golden fixtures (all `_meta.external_validation: pending`, lab-shaped): intra-state SAC-998319; inter-state IGST; inclusive B2C per §3; head-vs-line rounding discriminator; UTGST Chandigarh; credit-note full reversal; **advance-then-invoice netting**; unregistered-seller plain invoice. Property tests: allocation conservation, inclusive round-trip, trace determinism.

**WP-S4 — `in_gst_invoice` Profile + India Credit Notes [L, no migration]**
Rule 46 profile: GSTIN bands, per-head columns (never blended), place of supply w/ state name+code, HSN/SAC per line (6-digit, printed unconditionally), UQC, reverse-charge notation, delivery-address-where-different, signature block, amount-in-words hook (implementation lands in L1). SAC mechanism **decided**: tenant-level line-item defaults seeded at IN provisioning (998319 default, 998713 selectable) — never on global `catalog_*` rows. India credit notes: own FY series, original-invoice ref (block), per-head negative `document_tax_lines`/`vat_records`, 30-Nov cutoff documented. Wholly-exempt → Bill-of-Supply guard (§3). Two-document goods flow: S4 ships an in-product guidance banner/dialog directing goods+services jobs to a separate goods tax invoice; the automated **linked** two-document flow is DEFERRED (§7 ⊕). Dry-run failures surface field-by-field. **Acceptance: the IN test-tenant quote renders per-head GST lines (CGST/SGST or IGST) on screen and PDF** — the GA dry-run's quote-approval step depends on it. Register profile + sync capabilities. Dev assertion: registered IN tenant resolving `regime.documents` to `generic_invoice` = hard failure (moved here from L2 so it never fires before the profile exists).

**WP-S5 — `in_fiscal_numbering` [S, no migration]**
NumberingPolicy plugin seeding from `master_numbering_policies`; financial document scopes ONLY (cases/devices untouched). **Backfill onto the already-provisioned IN test tenant via the existing `apply_country_numbering_policy(uuid)` RPC** (verified in manifest) + live FY-reset probe on those rows. Overflow + charset rules per §3. The one real client preview bug is `src/lib/inventory/inventorySequenceService.ts:89-97` (template-blind `${prefix}-${padded}`) — fixed as cosmetic preview-correctness only; the previously-cited SystemNumbers.tsx:156 claim was false (it previews server-side via `preview_number_format`) and is dropped. Register + sync.

**WP-S6 — `gstr` Composers [M, no migration]**
GSTR-3B per §3 scope (incl. Table 3.2; CGST+SGST pairs share one base — dedup + double-count assertion; credit notes and advance adjustments net). GSTR-1 Table 12 HSN summary from `invoice_line_items` + `document_tax_lines` via new `fetchHsnLineAggregates` (AD-4). `periods.ts`: monthly Apr–Mar, Asia/Kolkata, pure string math; wire `vatService` to consume the tenant's composer/frequency (monthly for IN) — note: `getQuarterlyVATSummary` is already period-anchor-driven (the draft's "hardcoded quarter at :287-293" claim was stale — verified). 'VAT'-literal sweep → `taxConfig.label`. Named non-goals: GSTR-1 B2B rows, documents-issued table, portal JSON, Table 4 ITC, Table 11 (unless pulled in per §3). Register + sync.

**WP-S7 — CA Gate ⑤ + Governed Publish [M, MIGRATION PR]**
Migration A: `publish_country_pack` gate ⑤ splice (generic `_meta.external_validation` mechanism; pg_get_functiondef capture; negative-publish proof). Migration B: seed `master_country_pack_tests` from the fixtures. CA package generator: fixture JSONs + rendered PDFs (invoice, credit note, receipt voucher) **+ the deferrals-and-treatments memo for explicit CA ratification** — two labeled lists: *deferred items* (debit notes, automated linked two-document goods flow, media-destruction GST) and *implemented treatments submitted for ratification* (advance netting per §3, Bill-of-Supply wholly-exempt guard). **Step-level dependency: the CA-package step requires L1 + L4 merged** (voucher render, Indian formatting); the gate migrations and publish machinery do not. Capability assertion (all 4 plugin rows present via sync). Live dual-control publish (P3 recipe); fixture-staleness re-run immediately before. Produces the **GA checklist** document.

### Lab track (fills the GA checklist; only L1/L4 feed S7's CA-package step)

**WP-L1 — Lakh/Crore Formatting + Indian Words + ₹ [S, no migration]** (after S4 — implements the S4-defined amount-in-words hook)
`format.ts` + `pdf/utils.ts formatEngineMoney` honor `digit_grouping '3;2'`; `numberToWordsEnIndian` implements the amount-in-words hook S4 defines, keyed on `format.amount_words_scale`; U+20B9 font verification both render paths; all non-India output byte-identical (golden suite).

**WP-L2 — GSTIN Registration Capture + Status Setting [M, no migration]** (after S4)
`taxRegistrationService` CRUD over `legal_entity_tax_registrations`; onboarding JurisdictionStep (state + GSTIN + checksum/prefix validation); `provision-tenant` threads the registration; Settings page with explicit registered/unregistered control (D6), loud unregistered treatment **including D6's silent-fallback dev assertion (an L2 deliverable)**; **branch-state mismatch warning** (any active `branches.subdivision_id` ≠ GSTIN state → settings banner + dev assertion) pointing at the deferred multi-state manager.

**WP-L3 — TDS Withholding [M, MIGRATION PR]** (independent of the spine; **merges before L4** — both splice `record_payment`)
`payments.withheld_amount` + `withholding_certificate_ref`; `payment_withholdings` tenant table (full discipline); `record_payment` conservation (amount + withheld = allocations) + TDS-credit row same transaction; universal collapsed RecordPaymentModal section (AD-7), free-amount capture + mandatory certificate ref. GST-TDS (Sec 51) deferred.

**WP-L4 — Advance Vouchers + the Advance Money Leg [L, MIGRATION PR]** (after S6 for the shared `register.ts` seam, and after L3 for the `record_payment` splice — see §5)
The verification panel's biggest re-scope. Migration: widen `master_document_requirements` doc_type CHECK + seed voucher requirement rows (incl. refund→receipt-voucher ref); **additive `TaxDocumentType` union widening** (§2); extend `issue_tax_document` for the voucher types; **advance payment model** — `record_payment` currently REJECTS unallocated payments (verified: allocations must be non-empty and sum to amount), so add an 'advance' payment kind held unallocated (ledger-balanced), with invoice-time allocation via `payment_allocations`; **L4's splice re-captures `record_payment` via pg_get_functiondef AFTER L3 merges** (declared order), preserving L3's withholding conservation. UI surfaces named: RecordPaymentModal gains an "Advance (unallocated)" payment kind (coordinated with L3's TDS section), plus an advance-capture entry point on the intake/diagnosis case surfaces. Voucher issuance: GST at receipt (18/118 back-out; Rule 50 proviso defaults); invoice posts net-of-advance with conservation assertion (§3). **Case-lifecycle hooks named concretely:** Receipt Voucher from advance capture at intake/diagnosis; Refund Voucher offered from the **Mark No Solution flow / `recovery_outcome='unrecoverable'` / cancellation**, documenting an actual payment reversal; third terminal — **advance retained on no-recovery ⇒ evaluation-service tax invoice (SAC 998319)** the advance allocates against, closing the GST loop. **Receipt-artifact decision:** for IN tenants the Rule 50 voucher **supersedes** the legacy `payment_receipts` artifact for taxable advances (regime-keyed switch inside the document engine, not country branching); dry-run asserts one advance ⇒ exactly one customer-facing receipt artifact. PDF builders + previews.

**WP-L5 — IRN-Readiness [S, no migration]** (after S4)
Per-tenant "e-invoicing applicable" flag (settings metadata) + loud warning banner; INV-01 field-completeness assertion test (a test, not a builder); invoice PDF QR real-estate.

**WP-L6 — Rule 55 Delivery Challan [M, no migration]** (after S5)
pdfmake DeliveryChallan **in triplicate** (ORIGINAL FOR CONSIGNEE / DUPLICATE FOR TRANSPORTER / TRIPLICATE FOR CONSIGNER); line items sourced from **the specific checkout event's device set** (`log_case_checkout` `p_device_ids` → per-device `chain_of_custody_transfers` rows — never the full `case_devices` list; partial-checkout multi-device test); **customer-owned devices only** (patient/donor roles) with goods-flow guidance when lab-supplied delivery media is in the handover ("sold media needs a goods tax invoice, not this challan"); challan numbering **consumes the S1b-seeded FY series** (16-char; L6 adds no numbering-policy rows); custody ledger untouched (append-only); e-way manual with ₹50k threshold guidance.

## 5. Ordering, Critical Path & GA Checklist

```
S1a → S1b → S2 → S3 → S4 → S5 → S6 → {L1, L4} → S7 (CA package → sign-off → publish = statutory_ready) → WP-GA
                                      L2 (≥S4) · L3 (before L4) · L5 (≥S4) · L6 (≥S5)
```

`register.ts` is touched by S3/S4/S5/S6/**L4** → the spine WPs merge sequentially (they already are); **L4 rebases after S6**. S7's CA-package **step** requires L1 + L4 merged; the gate migrations and publish machinery do not.

**WP-GA — GA Dry-Run Execution [S, no migration]** (after S7 publish + all of L1–L6)
Executes both live branches on the IN test tenant and records the results in the GA checklist document: **intake → advance receipt voucher → diagnosis → quote with GST breakup → approval → recovery → invoice (advance netted) → payment w/ TDS → challan checkout**, and the no-recovery branch (**diagnosis → no_solution → refund voucher**, plus the retained-advance→evaluation-invoice terminal). Verifies the honest-degrade assertion set and the branch-state warning.

**GA checklist (all ✓ before the first real lab tenant):** L1–L6 merged; WP-GA's two dry-run branches recorded; **honest-degrade assertions** green — the enumerated set: S4's generic_invoice dev assertion, L2's unregistered-mode loud treatment + D6 silent-fallback dev assertion, L2's branch-state mismatch warning. GST-on-quote display rides the existing quote surfaces (rate picker populated by S1b-seeded rows + S2 threading), with per-head rendering owned by S4's acceptance item; the known-broken portal `case_quotes` loop (0 rows) is called out in the GA checklist as a pre-existing platform gap, not an India Pack deliverable.

## 6. Migration Inventory (same-day PR rule)

| WP | Migration content |
|----|-------------------|
| S1a | rate-unique widening (`applies_to`); `field_key` CHECK widening (CN ref); rounding-level enum if needed |
| S1b | subdivisions; rates; bindings; numbering policies; UQC; invoice+CN requirement rows |
| S7 | gate ⑤ splice; pack-tests seed |
| L3 | payments cols; `payment_withholdings`; `record_payment` extension |
| L4 | doc_type CHECK widening; voucher requirement rows; `issue_tax_document` extension; `record_payment` advance-kind extension (re-splice AFTER L3) |

S2, S3, S4, S5, S6, L1, L2, L5, L6: **no migration** (S2's buyer columns verified pre-existing).

## 7. Named Deferrals (explicit; ⊕ = in the CA ratification memo)

Debit notes ⊕ (second-invoice substitute is compliant); automated linked two-document goods flow ⊕ (S4 ships the guidance banner only); live IRP/GSP + `in_irn` + `einvoice_submissions` lifecycle; composition scheme / Bill of Supply ⊕; CESS; e-way API; GSTR-7/26Q; GSTR-2B ITC recon; B2C dynamic QR; mixed-slab documents ⊕ (TaxableLine contract extension); GST-TDS Sec 51; LUT zero-rated exports; DPDP consent copy; multi-state GSTIN manager (detection warning ships in L2); GSTR-1 B2B rows / documents-issued table / portal JSON / Table 4 ITC / Table 11 advance rows (data model supports later composition) ⊕; media-destruction / certificate-of-destruction GST treatment ⊕.

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Self-certified statutory math | CA gate ⑤ hard-blocks publish; fixtures + rendered PDFs + deferral memo reviewed (D7); engagement starts at S1 |
| CA latency stalls the phase | Only S7's final steps block on sign-off; negative-publish proof lands early; everything else proceeds with `pending` fixtures |
| Advance money-leg complexity (L4) | Blocker-driven design in §4-L4; conservation assertions at voucher, invoice, and return levels; the three case terminals each have a fixture |
| `record_payment`/`publish_country_pack` splices | pg_get_functiondef capture; behavioral positive+negative SQL assertions; rolled-back probes |
| Oman/AE byte-parity regression from formatting | Additive-defaulted params; golden parity suite is a hard exit gate |
| Shared `register.ts` conflicts | Spine WPs merge sequentially; lab-track WPs don't touch it except L4's document-type registration — L4 merges after S6 (§5 ordering) |
| Live-pipeline surprises (P3 lesson) | IN test tenant from S2 onward; dual-control publish executed live; fixture-staleness re-run pre-publish |

## 9. Exit Criteria

1. `publish_country_pack` returns `published: true` with all five gates passing; `geo_countries.code='IN'` → `config_status='statutory_ready'`; gate JSON archived on the S7 PR.
2. Every fixture green in CI and in `master_country_pack_tests` with `_meta.external_validation.status='validated'` (named CA + credential + memo hash).
3. The kernel split demonstrably fires on a LIVE invoice: intra-state (CGST+SGST) and inter-state (IGST) invoices issued on the IN test tenant through the real UI path with correct per-head rendering, numbering, words, and lakh grouping.
4. GA checklist document exists and is complete, with WP-GA's two live dry-run branches executed and recorded.
5. `npm run typecheck` = 0; all migrations manifested; no DROP/DELETE; custody/audit invariants intact; non-India golden suites byte-identical.
