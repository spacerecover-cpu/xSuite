> **TWO WORKSTREAMS.** Most recent first: (A) the **Performance program** (2026-07-10, updated same-day after #410/#411 merged) below, then (B) the **India Pack Phase 4** stub (build complete; only owner-gated S7+GA remain) beneath the `═══` separator.

---

# Session Handoff (A) — 2026-07-10 (late) — P0–P2 + preview-fix + FU-1 DONE · open PRs #412/#413/#414 · next = FU-4 + lens follow-ups

## Current status

- **MERGED to main:** #410 (perf P0–P2 **plus** the 6 Supabase-Preview replay shims) and #411 (FU-3 tsc fix). `npm run typecheck` on main = **0 errors** again.
- **OPEN PRs (owner merges; all base main, independent):**
  - **#412** — FU-2 debounced-search sweep (6 pages). tsc 0, eslint 0 errors, vitest = pre-existing baseline only. Built via per-page implement→adversarial-review→fix Workflow.
  - **#413** — FU-5 migration record (manifest row + archived SQL for `20260710163756`, already applied live + verified). This commit was originally pushed to the #410 branch but the owner's squash cut the tip seconds earlier — it re-lands here.
  - **#414** — **FU-1 record (DONE)**. Owner chose **lowercase codes canonical**; migration `20260710170508` applied live: 1,138 Title-case legacy quote rows normalized + `invoices_attention` literal → `('sent','partial')`. Live-probed: pending_quotes 0→1053, invoices_attention 11→19, quote stats 0s→77/1053/8. 3-lens adversarial verify all APPROVE. Also restores convert/delete actions on legacy quotes.
- **FU-5 is LIVE on the DB** regardless of #413: the 3 pre-P2c base-stats RPCs now have authenticated-only EXECUTE (verified `proacl`).
- **Main-branch "Supabase Preview" check is RED on every main push and was BEFORE this session** (verified on 22412ef/66ffac6/93dd584): the production branch action fails with `Remote migration versions not found in local migrations directory` because prod history holds ~200 MCP-applied versions with no mirrored file. It **refuses before applying anything** — cosmetic on main; PR preview branches (the real gate) are green. Owner option: disable the production-branch sync in the Supabase GitHub integration (migrations flow via MCP by design), or accept the red run.

## Follow-ups surfaced by the FU-1 verify lenses (pre-existing; each is a small own-PR fix)

1. **Portal quote approval is broken** (lifecycle stage 7!): `approve_quote`/`reject_quote` RPCs look up `master_quote_statuses` names `'Approved'`/`'Rejected'` which don't exist (catalog has `'Accepted'`/`'Declined'`) and never touch the text `status` column — portal accept/reject never moves the visible quote status.
2. **Banking partial-allocation writes `'partially-paid'`** (`bankingService.ts:692,1054` via `deriveInvoiceStatus`) which `invoices_status_check` REJECTS → runtime constraint violation on that path; needs the `partial` reconciliation flagged in `src/lib/invoiceStatus.ts`.
3. **Import re-drift vector**: `coerceWorkbook.ts` lowercases only invoice statuses; a legacy Excel import can reintroduce Title-case quote rows (no CHECK on `quotes.status`). Coerce quote statuses on import + optional 6-value CHECK.
4. **`'overdue'` vocabulary drift**: legal in `invoices_status_check` + import reference list; `financialReportsService.ts:178` counts it for AR while the badge doesn't. Align (drop from CHECK/import list or document derived-only).

## ⚠️ NEW REPO INVARIANT — supabase/migrations/ is a PARTIAL mirror that MUST stay replay-consistent

The Supabase Preview CI check replays `supabase/migrations/` **from scratch** on an empty preview branch. The dir is NOT the full history (that's the live DB + manifest) — it's baseline (20260409000000) + a subset. **Invariant: every object a mirrored file touches must be provided by the baseline or an earlier mirrored file.** PR #233 broke this silently in mid-June (mirrored 3 country-config files without their unmirrored column-creating dependency); #410 was the first PR since to touch `supabase/` and exposed it.

Fixed with 6 **preview-replay shims** (`*_for_preview_replay.sql`, workstream `preview-fix`, precedent `20260409000001`): idempotent no-ops on prod, versions **registered in prod `supabase_migrations.schema_migrations`** so the on-merge apply skips them. Full replay now green.

**When you mirror a migration file (or CI preview goes red on a supabase/-touching PR):**
1. Reproduce locally: scratch dir + `supabase init` + copy `supabase/migrations/` + pin `major_version = 15` + `supabase db start && supabase db reset --no-seed` (needs Docker Desktop running). Iterates in ~1–2 min; this rig caught a gap the static audit missed.
2. Gotchas that VALIDATE at replay time even "inside functions": plpgsql **DECLARE-section `%ROWTYPE`/`%TYPE`** resolve at CREATE FUNCTION; CREATE POLICY expressions; CREATE TRIGGER's function; GRANT signatures; plain DML validates columns even over 0 rows. plpgsql statement bodies do NOT validate.
3. New shims: name `<ts>_<what>_for_preview_replay.sql` with a timestamp just before the first file needing them, mirror EXACT live shapes, omit FKs/RLS that would pull in more unmirrored objects, register the version on prod, add a `preview-fix` manifest row.

## Remaining follow-ups

### FU-4 — Stock-write hygiene (LOW; stock unused in prod, 0 rows) — NOT STARTED
RPC-ify `recordStockReceipt`/`cancelStockSale`/`bulkAdjustQuantities` (crash-fixed in P2b but non-atomic; mirror `receive_stock_from_po`: SECURITY DEFINER + `get_current_tenant_id()` guard + FOR UPDATE + REVOKE PUBLIC/anon). Prune dead `ReceiveStockFromPOData.receivedBy`; `seedData.ts sampleBackupDevices.current_quantity` is dead config (would 400 against the GENERATED column if ever wired).

### Deferred audit items (unscoped; see audit doc "Areas NOT covered")
pdfmake/typst on main thread; `useCasesRealtime` broad invalidation; AuthContext TOKEN_REFRESHED re-render cascade; global `retry:2` stacking; render-blocking Google Fonts; xlsx main-thread assembly.

## Audit + playbook (unchanged)
- Audit source of truth: `docs/superpowers/specs/2026-07-09-e2e-performance-audit.md` (93 findings + per-phase UPDATE blocks).
- DB-phase playbook + house RPC styles + `stock_items` GENERATED-columns warning: see the P0–P2 section of the audit doc and `supabase/migrations.manifest.md` rows `20260710*`.
- Suite baseline: 3 pre-existing `ExpensePaymentModal` failures + 1 load-flaky typst test (fails ~half of isolated runs too — passes on re-run; area byte-identical to pre-perf main).
- `Workflow` scripts: plain JS, NO backticks in prompt strings; `args` may not bind — embed constants in the script body.

## Open owner items
1. Merge **#412** (FU-2), **#413** (FU-5 record), **#414** (FU-1 record).
2. Decide on the always-red main-branch Supabase production check (disable prod-branch sync vs accept).
3. Also open (other workstreams): #409 (thermal labels).
4. India: S7 publish (dual-control) + GA — see (B).

═══════════════════════════════════════════════════════════════════════════════
# (B) India Pack Phase 4 — BUILD COMPLETE (stub)
═══════════════════════════════════════════════════════════════════════════════

All build WPs are MERGED to main: S1a–S3 (#380–#384), S4 (#385), the stranded-stack recovery S5+S6+L1 re-land (#389), L2 (#392), L3 (#390), L4 (#394 — includes the exact per-head CN netting S6 deferred; `gross_pending_l4` is gone from main), L5 (#391), L6 (#395). The 2026-07-07 stacked-merge incident (children merged into parent branches → S5/S6/L1 stranded) is why this repo now does strictly fresh-branch-from-main PRs.

**Remaining (owner-gated only):** S7 publish (dual-control) + GA go-live, and the SA `statutory_ready` decision (ZATCA Phase 2) from P3. Test tenant IND0003 (`4c4c32db-…`) is disposable. Ledger: `.superpowers/sdd/progress.md`; plan/spec `docs/superpowers/{plans,specs}/2026-07-05-phase4-india-pack*.md`.
