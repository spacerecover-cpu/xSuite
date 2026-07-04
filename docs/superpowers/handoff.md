# Session Handoff — 2026-07-04 — Localization Phase 3: WP-1/2/3 DONE (WP-4→7 remain)

## What this session did
Executed **Localization Phase 3 — Returns, Numbering Value & Publish Governance** from
`docs/superpowers/plans/2026-07-02-localization-phase3-returns-numbering-governance.md`
(32 tasks, 7 work packages). This session took it from "WP-1 implemented but unreviewed"
to **WP-1 verified + WP-2 complete + WP-3 complete**, and caught+fixed a live legal-numbering bug.

Method (keep using it): I personally own every LIVE migration (reconcile-against-live: capture
`pg_get_functiondef` first, edit only intended lines, apply, then rolled-back DO-block probes);
UI/test tasks fan out via `Workflow` (implement → adversarial review → conditional fix); a
whole-branch adversarial review runs per WP. tsc re-verified UN-PIPED by me each task (subagents
have falsely reported tsc 0 before). Migrations apply to the canonical DB `ssmbegiyjivrcwgcqutu`.

## Current status
- **Branch: `feat/p3-fiscal-numbering` (WP-3 tip) @ `fd50755`.** It STACKS the whole phase:
  `feat/p3-returns-schema` (WP-1) → `feat/p3-gcc-return` (WP-2) → `feat/p3-fiscal-numbering` (WP-3).
  All three pushed to origin this session. Base = `ebb7781` (a local-only PRE-REQ tsc fix that fixed
  3 errors #366 leaked; it rides along on the branch and merges via the branch PR — **do NOT push main**).
- **tsc 0 (own un-piped run), all WP tests green, working tree clean** (only `.claude/settings.local.json`,
  harness-owned, left untouched). Every Phase-3 migration is LIVE on `ssmbegiyjivrcwgcqutu`.
- **⚠️ The authoritative task-by-task ledger `.superpowers/sdd/progress.md` is GITIGNORED** — it does
  NOT travel with the push. If you're on a new machine, THIS file + `git log` + the plan are your map.

## Commit stack (origin/main 459b36b → HEAD fd50755, 12 commits incl. PRE-REQ)
```
fd50755 test(numbering): P3 regression probe pack (recorded evidence)          # WP-3 T13
2270b1c fix(db): min-width padding — no LPAD truncation of legal numbers        # WP-3 LPAD fix
ac4ce1d feat(settings): SystemNumbers fiscal-template fields + live preview     # WP-3 T12
1e80940 feat(db): master_numbering_policies + apply_country_numbering_policy    # WP-3 T10+T11
5b498fb feat(vat): return drill-down + reconciliation badge                     # WP-2 T9
5c4285d feat(vat): VATReturnModal files through composer + file_vat_return      # WP-2 T8
5116feb fix(vat): drill-down + quarterly summary on tax_period dimension        # WP-2 T7
a988572 feat(tax): taxReturnService                                             # WP-2 T6
a2a8dc9 feat(regimes): gcc_return ReturnComposer                                # WP-2 T5
ea63c44 feat(country): filing keys + trigger parity                             # WP-2 T4
6c7661f feat(db): P3 WP-1 returns schema + file_vat_return                      # WP-1 T1-3
ebb7781 fix(types): boundary-cast tax columns (PRE-REQ, local-only base)
```

## What shipped, by WP
- **WP-1 (verified):** `tax_return_lines`, `vat_returns` regime cols, `file_vat_return` RPC
  (re-derives boxes from `vat_records.vat_amount_base` by `tax_period`, rejects divergence/overlap).
  Seam resolved: output box fully sourced by issue_tax_document/credit-note-contra/record_stock_sale
  (all `record_type='sale'`); input box has no writer yet (fail-loud via divergence guard).
- **WP-2 (complete):** registry filing keys (`tax.filing_frequency`/`period_anchor`/`return_composer`)
  + trigger parity; `gcc_return` composer (3-box, month-aligned anchors, base==jurisdiction guard);
  `taxReturnService` (config→composer→subledger→file); vatService drill-down + quarterly summary onto
  `tax_period`; VATReturnModal rewrite (no UTC quarter math); VATReturnDetailModal + reconciliation badge.
  **Live rolled-back proof: return files from subledger, `reconciled=t`.**
- **WP-3 (complete):** `master_numbering_policies` global table + GCC seeds; `apply_country_numbering_policy`
  (non-destructive NULL→value fill); SystemNumbers fiscal UI (plan was STALE — Phase-1 already built the
  fields+preview; workflow added the missing test + fixed a lying legacy badge → 'Templated'); regression probe pack.

## Two catches worth remembering
1. **Plan-drift trap (WP-2 T4):** the plan's `validate_country_config_overrides` trigger migration assumed
   `statutory_keys` held 1 key and would REPLACE with 4 — LIVE held **11** (P1/P2 grew it). A verbatim paste
   would have DELETED 10 jurisdiction locks. Reconcile-against-live caught it → additive 11→14. **Every
   plan migration in WP-4→7 must be reconciled against live before applying — the plan drifts.**
2. **LIVE LPAD invoice-number truncation bug (fixed, owner-approved):** `LPAD(v,width)` TRUNCATES longer
   values → `get_next_number` (the invoice-minting path) rendered 10193 as '1019' at padding 4 (Risk #8,
   duplicate legal numbers). OM `invoices` counter=10192 was already in the truncation zone. Fixed via new
   `format_sequence_number(bigint,int)` min-width helper (migration `phase3_fix_lpad_sequence_truncation`).

## Carry-forwards (all MINOR / config-time / unreachable-today — none block; fix in a follow-up pass)
- WP-2: dead vatService helpers `createVATRecordFromInvoice`/`FromPurchase` (no tax_period/base, 0 callers)
  — recommend delete. Legacy `createVATReturn`/`createVATReturnFromPeriod` still exported (returns w/o
  tax_return_lines show spurious "NOT reconciled"). `file_vat_return` trusts `p_tax_periods` for the SUM but
  stores `period_start/end` separately (fine for contiguous gcc_return; harden for future composers).
- WP-3: **F1** preview_number_format renders `{FY}` as fiscal `YYYY-YY` always, but get_next_number renders
  bare `YYYY` for calendar_year/never → preview lies for those bases (fix: mirror the reset_basis branch in
  preview). **F2** `update_number_sequence` COALESCE has no clear-sentinel → UI can't unset a template/reset_basis.
  Same LPAD-truncation class in `assign_receipt_number`/`assign_tenant_code`/`data_migration_finalize` (unfixed).
- OM data: `resolved_country_config` has null filing keys → getFilingConfig falls back to coded defaults
  (correct GCC); a later OM pack republish should set them explicitly. OM `invoices` prefix='INVO' vs historical
  imported "TAX INVOICE####" = data-import mismatch (orthogonal to the LPAD fix).
- Oman reconciliation "real" (nonzero) proof needs SEEDED issued invoices — vat_records is 0 rows live.

## HOW TO RESUME (next session → WP-4)
1. `git checkout feat/p3-fiscal-numbering` (or your pushed tip); `git pull` if continuing elsewhere.
2. Re-read the plan WP-4 section (`### Task 14`…`Task 18`, ~lines 2022-2804) — **11 publish-governance RPCs**:
   pack authoring RPCs + gate helpers (T14), `publish_country_pack` 4-part machine gate (T15), pg_cron
   staleness monitor (T16), publish→resync no-op probe (T17), capability manifest sync (T18).
3. Cut `feat/p3-publish-governance` **from `feat/p3-fiscal-numbering`** (keep stacking — cross-WP type deps).
4. RECONCILE every migration against live first (the plan drifts — see catch #1). Own live DDL yourself;
   fan out any TS/UI via Workflow; whole-branch review per WP.
5. Then **WP-5** (Country Authoring Studio UI, 7 tasks T19-25), **WP-6** (CLDR import, T26),
   **WP-7** (AE/SA pack publish + zatca_ph1 + retire einvoiceRouting, T27-32).
   ⚠️ **WP-7 needs a SECOND platform-admin account** (different `auth.uid()`) for dual-control publish —
   line it up before starting (via `user-management` edge fn / platform-admin flow).

## Standing rules
- Local-first was released this session (owner asked to push). If continuing: commit locally, push when asked.
- Reconcile-against-live on EVERY migration. Re-verify tsc UN-PIPED. Do NOT git-add `.superpowers/` (gitignored)
  or `.claude/settings.local.json`. Never push `main` — PRs squash-merge; don't reuse a merged branch name.
