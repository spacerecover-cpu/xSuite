# Session Handoff — 2026-07-04 (Localization Phase 2 — 16/28, WP-1..WP-4 COMPLETE)

## What I was doing
Executing **Localization Phase 2 (Document Compliance)** from `docs/superpowers/plans/2026-07-02-localization-phase2-document-compliance.md` (28 tasks, 9 WPs) via subagent-driven-development (per-task TDD + independent spec/quality review with live-DB probes). Checkpointed at a clean, fully-reviewed WP boundary (16/28) because the next work package (WP-5) is the most delicate remaining — replacing two live financial RPCs — and deserves fresh context.

## Current status
- **Branch:** `feat/localization-phase2-document-compliance` (base `main` 9fbde50). **HEAD = 1058ad0** (+ this handoff commit). LOCAL ONLY — **nothing pushed** (local-first; push only when the owner asks in the moment).
- **16 of 28 tasks COMPLETE + reviewed clean. tsc 0, full suite ~2414 green throughout.**
  - **WP-1 (COMPLETE)** — 3 migrations live on `ssmbegiyjivrcwgcqutu`: `master_unit_codes`+FK (`20260703204512`), `master_document_requirements`+16 GCC seeds (`20260703205658`), structured addresses + 11 Oman governorates (`20260703210554`).
  - **WP-2 (COMPLETE)** — gcc_tax_invoice profile (c68d357), resolveComplianceRenderInputs (1e14831), countryTemplateOverride choke point (5f69a6e), formatters (be4a6a4).
  - **WP-3 (COMPLETE)** — R4 engine wiring (5330b2c), credit-note engine adapter (c588b5b), **DESTRUCTIVE cutover** (87e2817 + env-flag fix aa4a735): 3 legacy PDF builders DELETED, engine is sole render path for invoice/quote/credit_note, flags removed. Guard honored (final parity 34 green before delete).
  - **WP-4 (COMPLETE)** — dataFetcher tax lines/snapshots (505a710), invoiceAdapter (fcf0c16, **render-time tax recompute KILLED — AD-3**), quoteAdapter (7101c5a), previews UNIFIED onto the choke point (9266b38), panels+dryRun (696fff4), preview/print parity exit-gate (1058ad0).

## Next step (resume here — the SDD ledger `.superpowers/sdd/progress.md` is the authoritative map; trust it + `git log` over recollection)
**WP-5 (Tasks 17–19, migration #4) — the most delicate remaining work. Base 1058ad0.**
1. **Task 17** — `evaluate_document_requirements(p_doc_type, p_country_id, p_as_of, p_facts jsonb)` pure STABLE SQL evaluator over `master_document_requirements`. **Coupled to Task 18 — apply as ONE migration (#4); Task 17 does NOT apply standalone.**
2. **Task 18 — HIGHEST STAKES.** REPLACE the live `issue_tax_document` AND `issue_credit_note` (SECURITY DEFINER financial RPCs). MUST: capture live `pg_get_functiondef` first, edit by anchored insertion, verify byte-identical except intended edits (Phase 0/1 lesson — a blind paste reverted prior logic). Adds the requirement gate (`level='block'` → `RAISE ... ERRCODE 'P0403'`; add AUTOMATED rolled-back tests asserting the RAISE, not just hand-run SQL). Stamps buyer_tax_number(+label)/buyer_address(subdivision→NAME)/seller_tax_number/supply_date/reverse_charge/notations onto the issued row — VERIFY the stamp UPDATE is in the SAME txn as the preserved v1.2.0 custody 'financial' event (atomic). Per **OWNER RULING #1**: re-paste the fact-assembly SQL into issue_credit_note + hardcode notation text in both TS profile + migration SQL AS THE PLAN SAYS, but ADD drift tests: (a) the two SQL fact-assembly blocks stay equivalent, (b) TS-vs-SQL notation strings match — import `GCC_TAX_INVOICE_NOTATIONS` from `src/lib/regimes/gcc_tax_invoice/index.ts` (REVERSE_CHARGE obj + ZERO_RATED(reasonCode) fn).
3. **Task 19** — issuance dry-run UI (pre-issue: block stops w/ RequirementFailuresPanel, warn asks confirmation), wiring Task 15's exports.
Then WP-6 (20–22 addresses UI), WP-7 (23–24 units/forms), WP-8 (25–26, migration #5 = `record_stock_sale` 2→3 arg DROP+CREATE, same reconcile-against-live discipline), WP-9 (27–28 matrix+M-I), then whole-branch review + finishing-a-development-branch.

## Owner rulings (apply — in the ledger)
1. Issuance-RPC duplication = FOLLOW PLAN + ADD DRIFT TESTS (see Task 18 above).
2. AD-2 preview dual-path = UNIFY ONTO THE CHOKE POINT — **DONE in Task 14** (verified).

## Live-schema facts + carry-forward (all in the ledger §pre-flight + per-task lines)
- geo_countries.tax_number_label: OM=TRN, AE/SA/BH="VAT Number"; KW/QA tax_system=NONE. Task 27 matrix asserts these ACTUAL values.
- Insert-probes on tenant tables (esp. Task 25 record_stock_sale) need `SET LOCAL app.bypass_tenant_guard='true'` in a rolled-back tx (set_tenant_and_audit_fields blocks no-session MCP inserts before FK/statement checks).
- Task 25 (record_stock_sale): probe vat_records + document_tax_lines full column sets before writing the INSERTs.
- dataFetcher reads customers_enhanced NOT the customers view (new cols not on the view) — done in Task 11.
- Shared forcedColumnOverrides() helper lives in countryConfig.ts (Tasks 12/13/9 reuse it).
- CARRY→final review: Task 5/6 single-global-slot caches not cleared on tenant impersonation; Task 6 untested LTR-bilingual branch; Task 2 buyer_is_business vs VAT-registered; Task 11 credit-note over-fetch; Task 12 0/0 VAT-row rationale comment; Task 16 band-text re-derived-vs-renderTaxBar; known typst PDF-hash test is load-flaky (verify in isolation).

## ⚠️ HARD RULE (standing)
Local-first: NO push / gh pr create / remote change until the owner explicitly asks in the moment. Applying **additive** migrations to the canonical DB via mcp__supabase__apply_migration is the established in-scope workflow when executing an owner-authorized migration plan; git push/PR is separately gated.

## Plan progress
- Phase 0 (#359) + Phase 1 (#361) MERGED. resync fix = PR #363 (open). Phase 2 = this branch, 16/28.
- Phases 3–6 plans exist, not started.

## Open questions / blockers
- None blocking. Resume at Task 17 (WP-5). Both owner rulings decided (#2 done). Manual browser smoke of the Oman invoice/quote PDF is a nice-to-have (covered by invoicePilot.test.ts automation).
