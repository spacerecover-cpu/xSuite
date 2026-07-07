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
