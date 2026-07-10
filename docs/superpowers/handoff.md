> **TWO CONCURRENT WORKSTREAMS.** Most recent first: (A) the **Performance program** (2026-07-10, PR #410) below, then (B) the **India Pack Phase 4** handoff (2026-07-07, PR stack #385–#388) preserved beneath the `═══` separator. Read the one you're resuming.

---

# Session Handoff (A) — 2026-07-10 — Performance program: P0–P2 shipped as PR #410 · next = follow-ups FU-1…FU-5

## What I was doing
Ran an end-to-end performance audit of xSuite (10-dimension multi-agent workflow, 93 verified findings) and implemented the fixes in phases **P0 → P2c**. All five root causes are addressed and shipped as **PR #410**. This section carries the remaining follow-up work into a fresh session.

## Current status
- **Branch:** `main` is clean at `origin/main` (`66ffac6`). Perf work is on **`perf/e2e-audit-p0-p2`** → **PR #410** (OPEN, MERGEABLE, base `main`; Cloudflare green, Supabase Preview pending).
- **Last completed:** P2c shipped; PR #410 opened; local `main` reset to origin.
- **Next step:** owner reviews/merges #410 (never merge unasked). Then the follow-ups below.
- **⚠️ DB note:** All 6 migrations in #410 are **already applied to the live canonical DB** (`ssmbegiyjivrcwgcqutu`) via the Supabase MCP during dev. The PR only *records* them (manifest + `docs/migrations-pending/` archive) + ships regenerated types. Nothing new runs on merge; `schema-drift` should be green.

## The audit = source of truth for all remaining work
`docs/superpowers/specs/2026-07-09-e2e-performance-audit.md` — full 93-finding catalog + a dated **UPDATE block per phase** (P0/P1/P2a/P2b/P2c) recording what shipped and what's deferred. Read its top section first.

## Shipped in PR #410 (do not redo)
| Phase | Commit | What |
|---|---|---|
| P0 | `9ba2894` | 665 bare RLS helper calls → `(SELECT …)` InitPlans + 6 BU OR-chains reordered + `is_portal_user()` STABLE. Live: cases count **642→4.1ms (~156×)**, status-counts **2487→8.3ms (~300×)**. CI guard `scripts/check-rls-initplan.sql` + CLAUDE.md template updated. |
| P1 | `ad6df52` | Cases list: `useDebouncedValue` + shared cached search-or (`fetchQuery`) + AbortSignal; count `head:true`; `refetchOnWindowFocus:false`+`keepPreviousData`; **fixed the bucket-card filter bug** (count filtered, rows weren't). New `applyCaseListFilters` shared builder + 13 TDD tests. |
| P2a | `3c448d7` | `get_sidebar_badge_counts()` RPC replaces 4 polled badge queries; fixes IDX-06 (`deleted_at`). |
| P2b | `82a5d59` | `receive_stock_from_po(uuid, jsonb)` atomic RPC — PO receiving was broken (wrote GENERATED `current_quantity`). Also crash-fixed the 3 sibling generated-column writes (`current_quantity`→`quantity_on_hand`). |
| P2c | `79bb9f4` | `get_quote_stats_base` (+sentValueBase) + new `get_payment_stats_base` + `get_transaction_stats_base` — 3 fetch-all-reduce-in-JS stats → SQL aggregation. |

## Remaining phases / follow-ups (NOT started)

### FU-1 — Status-literal fixes (HIGHEST VALUE; user-visible-wrong today) 🔴
Three surfaces filter on status literals that don't match stored DB values → read **wrong/0 right now**. Deliberately **preserved verbatim** in P2a/P2c (a perf refactor must not silently change displayed numbers); deferred to one reviewed change:
1. **Invoice "attention" badge** (`get_sidebar_badge_counts`): filters `('sent','partially-paid','overdue')` but `invoices.status` stores `sent`/`partial`/`paid`/`draft`/`cancelled` (no `partially-paid`, no `overdue`) → counts only `sent`.
2. **Quote "pending" badge** (`get_sidebar_badge_counts`): `status='sent'` lowercase but `quotes.status` stores Title-case `Sent`/`Draft`/`Accepted` → **0 for every tenant**.
3. **`getQuoteStats` / `get_quote_stats_base`**: same lowercase-vs-Title-case → draft/sent/accepted read 0.
Owner decision first: which vocabulary is canonical (lowercase codes vs stored Title-case)? Then fix the literals in the RPCs + live-probe. Changes displayed numbers → its own reviewed PR.

### FU-2 — Systemic undebounced-search sweep (PERF-06) 🟡
Same pattern P1 fixed on Cases still on 6 pages (raw `searchTerm`→queryKey, no debounce; some run a twice-scan `buildXSearchOr` per keystroke). Mirror P1: `useDebouncedValue(searchTerm,300)` + route search-or through `queryClient.fetchQuery`. Reusable primitive exists: `src/hooks/useDebouncedValue.ts`.
- **Tier 1:** `pages/financial/PaymentsList.tsx`, `financial/ExpensesList.tsx`, `financial/TransactionsList.tsx`, `notifications/NotificationsHistory.tsx`.
- **Tier 2:** `financial/VATAuditPage.tsx` (searchTerm is a **dead** key segment — just drop it), `resources/CloneDrivesList.tsx` (gated lookup box).

### FU-3 — Pre-existing `tsc` errors (CI RISK, not ours) 🟠
`src/lib/pdf/labels/compactLabelDocument.ts:228,230` — `TS2365`/`TS2363` (`Content` + `number`). On `main` (`66ffac6`), untouched by #410. If a `typecheck` gate runs it's red from these regardless of #410. ~2-line fix in a tiny separate PR unblocks it. Reproduce: `npm run typecheck`.

### FU-4 — Stock-write hygiene (LOW; stock feature unused in prod, 0 rows)
RPC-ify the 3 still-non-atomic stock siblings (`recordStockReceipt`/`cancelStockSale`/`bulkAdjustQuantities` — crash-fixed but still non-atomic; mirror `receive_stock_from_po`); prune dead `ReceiveStockFromPOData.receivedBy`; `seedData.ts sampleBackupDevices.current_quantity` is dead config that would 400 if wired to a stock_items insert.

### FU-5 — Grant consistency (LOW; RLS already gates)
`get_quote_stats_base`/`get_invoice_stats_base`/`get_expense_stats_base` keep a pre-existing PUBLIC/anon EXECUTE grant (the 2 new P2c fns revoke it). All SECURITY INVOKER so RLS scopes rows. Optional `REVOKE … FROM PUBLIC, anon` for consistency.

### Deferred audit items not yet scoped (completeness critic; lower priority)
pdfmake/typst layout on main thread; `useCasesRealtime` broad `['cases']` invalidation fan-out (do AFTER P0 — done); AuthContext TOKEN_REFRESHED re-render cascade; global `retry:2` stacking; render-blocking Google Fonts; xlsx main-thread workbook assembly. See the audit doc's "Areas NOT covered."

## Playbook that worked (reuse it)
Per DB phase: **generate/author SQL mirroring an existing precedent RPC** → **live RED/parity/EXPLAIN probe in a rolled-back txn** under `SET LOCAL ROLE authenticated` + real JWT (owner sub `b4b86e5d-de36-4059-9237-0018157c9f1d`, tenant `4803501b-87a1-4a0e-abbe-8d7d45eeb4fc`) → **`apply_migration`** → **`npm run db:types`** → **rewrite callers** → **tsc + eslint + full vitest** → **adversarial `Workflow` review** (2–4 lenses, each re-verifying on the live DB) → **manifest row + archive SQL in `docs/migrations-pending/` + audit-doc UPDATE block** → **commit**. Owner merges.

## Key conventions (don't re-derive)
- **Perf refactors are behavior-neutral.** Preserve status literals/semantics; surface latent bugs as follow-ups (→ FU-1). Only sanctioned in-refactor fixes were audit-named mechanical ones (deleted_at/IDX-06, timestamptz `today`).
- **Read RPCs:** SECURITY INVOKER, house style `LANGUAGE sql STABLE SET search_path TO ''` + schema-qualified `public.<table>` + `jsonb_build_object` + `coalesce(sum(...),0)`. **Write RPCs:** mirror `record_stock_usage_for_case` (SECURITY DEFINER + explicit `get_current_tenant_id()` guard + `FOR UPDATE`). Always `REVOKE … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`.
- **`stock_items`:** `current_quantity`/`minimum_quantity`/`quantity_available` are **GENERATED** — never write them; write `quantity_on_hand`.
- **Migrations are NOT mirrored as files** in `supabase/migrations/`; the **manifest is source of truth**, reviewed SQL archived in `docs/migrations-pending/`.
- **`Workflow` scripts are plain JS** — NO backticks inside the backtick-delimited prompt template (parse fails; hit twice). Use single quotes for inline code.
- Suite baseline: **3 pre-existing `ExpensePaymentModal` failures** + **1 load-flaky typst test** (passes in isolation) — proven pre-existing, not regressions.

## Open questions / blockers (perf)
- **Owner decision for FU-1** (canonical status vocabulary) — blocks the literal fix.
- **PR #410 merge** — awaiting owner. Recommended post-merge order: FU-3 (unblock CI) → FU-1 (user-visible) → FU-2 → FU-4/FU-5.

═══════════════════════════════════════════════════════════════════════════════
# (B) PRESERVED — India Pack Phase 4 handoff (separate active workstream)
═══════════════════════════════════════════════════════════════════════════════

# Session Handoff — 2026-07-07 (autonomous /loop) — Phase 4 India Pack: S1a–S3 MERGED · S4 #385 / S5 #386 / S6 #387 / L1 #388 open (stacked) · next = L4

## OPEN PR STACK (owner merges bottom-up; each merge deletes its branch → auto-closes the child → reopen+retarget base→main+rebase)
- **#385 (WP-S4 in_gst_invoice profile + India CNs)** base main — OPEN
- **#386 (WP-S5 in_fiscal_numbering)** base feat/india-s4-in-gst-invoice-profile — OPEN, stacked on #385
- **#387 (WP-S6 gstr return composers)** base feat/india-s5-in-fiscal-numbering — OPEN, stacked on #386
- **#388 (WP-L1 lakh/crore + amount-in-words + ₹)** base feat/india-s6-gstr-composer — OPEN, stacked on #387 (L1 rides S4's amount-in-words hook)
- **Merge order: S4 → S5 → S6 → L1.** Full merge-order + reopen dance in `.superpowers/sdd/progress.md`.

## WP-L1 — DONE (PR #388)
Lakh/crore digit grouping ('3;2' via new non-statutory registry key number_format.digit_grouping), PDF money grouping via country-layer groupingStyle (3 adapters), Indian-scale amount-in-words (implemented S4's numberToWordsEnIndian hook in place + additive amountInWordsEn scale param keyed on format.amount_words_scale), ₹ U+20B9 TrueType-cmap glyph gate (all 4 Roboto TTFs pass, no swap). **Byte-parity exit gate: 2759 pass, tsc 0, ZERO golden diffs.** Adversarial review (wf_e5512bb3, 4 lenses) 0 confirmed / 2 refuted; applied one free hardening anyway (indian amount-in-words `?? ''` degrade for non-finite, aligns with western path).
- ⚠️ **Pre-existing unrelated red test**: `StatCard.test.tsx` "flips light tones (warning)" expects `text-slate-900` but the component correctly emits `text-ink-dark` (DESIGN.md saturated-fill rule; stale since the v1.5.0 ink-dark migration, last touched #353). NOT an L1 regression, NOT run by CI (Cloudflare+Supabase only). **For the theme/typography program to fix** (1-line test update to `text-ink-dark`).

## Loop context
Running `/loop keep going and finish all in ultracode` — autonomously executing the remaining India Pack WPs one per branch/PR, self-paced. **STOP before the owner-gated S7 publish (dual-control) + GA (go-live)** — build up to them and flag.

## Merged / open
- MERGED to main: #379 (plan), #380 (S1a), #381 (S1b), #382 (provisioning P0 hotfix), #383 (S2 buyer-seam), #384 (S3 in_gst strategy + seam).
- OPEN: #385 (S4), #386 (S5), #387 (S6). Awaiting owner merges bottom-up.

## WP-S6 — DONE (PR #387)
gstr ReturnComposer: GSTR-3B 3.1(a)/3.1(c) (dual-levy dedup, signed netting), Table 3.2 state-wise inter-state B2C, GSTR-1 Table 12 HSN summary; monthly Apr–Mar period math + {FY} short-form; `composeReturnForDate` derives header totals from the ledger exactly as `file_vat_return` re-derives (RPC-parity) via a data-keyed supplementary-box seam (gcc parity preserved); HSN qty/UQC rendering + 'VAT'-literal→taxConfig.label sweep on return/audit surfaces. **Capability `gstr | regime_adapter | 1.0.0` synced live** (code-registry projection through sync_engine_capabilities). tsc 0 + 53 tests.
- **Adversarial review (wf_f0b0c31c): 7 confirmed / 3 refuted — ALL 5 code defects fixed.** Root cause = the live `post_credit_note_vat_record` trigger writes ONE **head-less, source-less** contra (`component_code`/`source_document_type` NULL):
  - **F1 CRITICAL** — composer netted the head-less contra into the taxable base but not the tax heads → declared full CN tax on ₹0 net base. Fixed: exclude head-less sale rows from BOTH heads and taxable → 3.1(a) **gross-but-consistent**; header output tax still nets; `meta.credit_notes_netting='gross_pending_l4'`.
  - **F2 HIGH** — Table 3.2 is likewise gross of CNs → reconciles with gross 3.1(a); false "net automatically" docstring corrected.
  - **F3/F4/F5 MEDIUM** — deleted_at filter on invoice_line_items (Table 12 qty inflation on edit); null-PoS inter-state B2C bucketed to explicit '00' unknown-state (not dropped); Table 12 keyed by (item_code, **UQC**).
  - **F6 LOW** — documented unbounded `.in()` scaling limit.
  - **LESSON: 82 pre-review green tests hid the CRITICAL bug because every CN test modeled a per-head shape the live trigger NEVER emits. The review verified against the live trigger definition, not the mocks.**

## ⚠️ WP-L4 now OWNS the exact credit-note netting S6 deferred
S6 makes 3.1(a)/3.2 **gross of credit notes** (consistent + flagged `gross_pending_l4`). **WP-L4 must deliver exact per-head CN (and advance) netting into 3.1(a) & 3.2** — either by making the CN ledger contra per-head/source-linked (DB trigger change, cross-regime — sum-preserving so GCC-safe) or by enriching the return path. Per-head contras already net in the composer (index.test proves it) — L4 just has to make the ledger produce them. L4 rebases AFTER S6 lands (shared register.ts seam).

## Resume (in order)
1. `gh pr view 385 386 387 388` — confirm CI (Cloudflare green; Supabase Preview skips no-migration PRs); nudge owner to merge S4→S5→S6→L1.
2. **WP-L4** (India credit notes / Rule 50-51 vouchers / advance netting — read the plan's WP-L4 section for exact scope+deps) — touches the register.ts seam, so **stack on the S6 tip** (`feat/india-s6-gstr-composer`) or on L1; branch `feat/india-l4-*`. **L4 now ALSO owns the exact per-head CN/advance netting into GSTR-3B 3.1(a)/Table 3.2 that WP-S6 deferred** (S6 ships gross, flagged `gross_pending_l4`): make the CN ledger contra per-head/source-linked (the live `post_credit_note_vat_record` trigger writes ONE head-less row — a DB migration; cross-regime but sum-preserving → GCC-safe) OR enrich the return path. Per-head contras already net in the gstr composer (index.test proves it). Also wire `issueIndiaCreditNote` to a live caller. Per-task TDD, tsc un-piped, adversarial review before PR.
3. Then the rest per merge order `S4→S5→S6→{L1,L4}→S7→GA` (L2≥S4, L3<L4, L5≥S4, L6≥S5), then **STOP at S7 publish + GA (owner-gated)**.
4. Own every LIVE migration personally (L-series have migrations); governed RPCs (sync_engine_capabilities, pack authoring) need platform admin → `SET LOCAL request.jwt.claims sub=d1139ac6` (platform owner, support@xsuite.space) inside a BEGIN/COMMIT txn in one execute_sql call.

## Open carry-forwards (place in a WP)
- **convert_proforma_invoice_to_tax_invoice drops place_of_supply_subdivision_id** (from S2.9; needs a migration — issuance/convert WP). S6-F4 now buckets the resulting null-PoS B2C into '00' unknown-state so Table 3.2 no longer silently drops it, but the ROOT convert bug remains.
- **Exact CN/advance netting into 3.1(a)/3.2** → **WP-L4** (see ⚠️ above; S6 ships gross_pending_l4).
- **issueIndiaCreditNote not yet wired to a live caller** (live CN path = generic issueCreditNote→apply_credit_note, no per-head lines) → WP-L4 wires the India CN issue path (this is also what would make CN ledger rows per-head).

## Test-rig / method
LIVE tenant "IN Test Lab (Phase 4 - disposable)" IND0003 (`4c4c32db-bd06-4100-b106-7ccae2f70b48`, owner support@xsuite.space is the PLATFORM owner `d1139ac6`; the IN-lab owner is phase4-in-lab2@…, creds in scratchpad; bound gstr/monthly/04-01, 0 vat_records). Ledger (fullest map): `.superpowers/sdd/progress.md`. Plan+spec on main: `docs/superpowers/{plans,specs}/2026-07-05-phase4-india-pack*.md`. Canonical DB `ssmbegiyjivrcwgcqutu`. Method: reconcile-vs-live before migrations; per-task TDD + tsc un-piped; multi-lens verify Workflow per WP (it keeps catching real bugs — see S6 F1); semantic tokens + lucide only.

## Open owner items
- Merge #385 → #386 → #387 (bottom-up).
- SA statutory_ready (from P3, unrelated to India).
- S7 publish (dual-control) + GA — owner decisions when the build reaches them.
