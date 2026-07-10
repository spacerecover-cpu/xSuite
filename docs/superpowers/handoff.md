> **TWO WORKSTREAMS.** Most recent first: (A) the **Performance program** (2026-07-10, updated same-day after #410/#411 merged) below, then (B) the **India Pack Phase 4** stub (build complete; only owner-gated S7+GA remain) beneath the `═══` separator.

---

# Session Handoff (A) — 2026-07-10 (evening) — Perf program P0–P2 + preview-fix MERGED (#410, #411) · FU-2 = PR #412, FU-5 record = PR #413 · next = FU-1 (owner decision) then FU-4

## Current status

- **MERGED to main:** #410 (perf P0–P2 **plus** the 6 Supabase-Preview replay shims) and #411 (FU-3 tsc fix). `npm run typecheck` on main = **0 errors** again.
- **OPEN PRs (owner merges; both base main, independent):**
  - **#412** — FU-2 debounced-search sweep (6 pages). tsc 0, eslint 0 errors, vitest = pre-existing baseline only. Built via per-page implement→adversarial-review→fix Workflow.
  - **#413** — FU-5 migration record (manifest row + archived SQL for `20260710163756`, already applied live + verified). This commit was originally pushed to the #410 branch but the owner's squash cut the tip seconds earlier — it re-lands here.
- **FU-5 is LIVE on the DB** regardless of #413: the 3 pre-P2c base-stats RPCs (`get_quote_stats_base()`, `get_invoice_stats_base(uuid)`, `get_expense_stats_base()`) now have authenticated-only EXECUTE (verified `proacl`).
- **Post-merge production Supabase run on `main` (commit `90a6e4c`)**: was still `Waiting for branch action run to complete` at session end — expected to no-op (all 75 file versions are registered in prod history; shims are IF NOT EXISTS besides). **Verify its conclusion first thing** (`gh api repos/{owner}/{repo}/commits/90a6e4c/check-runs`).

## ⚠️ NEW REPO INVARIANT — supabase/migrations/ is a PARTIAL mirror that MUST stay replay-consistent

The Supabase Preview CI check replays `supabase/migrations/` **from scratch** on an empty preview branch. The dir is NOT the full history (that's the live DB + manifest) — it's baseline (20260409000000) + a subset. **Invariant: every object a mirrored file touches must be provided by the baseline or an earlier mirrored file.** PR #233 broke this silently in mid-June (mirrored 3 country-config files without their unmirrored column-creating dependency); #410 was the first PR since to touch `supabase/` and exposed it.

Fixed with 6 **preview-replay shims** (`*_for_preview_replay.sql`, workstream `preview-fix`, precedent `20260409000001`): idempotent no-ops on prod, versions **registered in prod `supabase_migrations.schema_migrations`** so the on-merge apply skips them. Full replay now green.

**When you mirror a migration file (or CI preview goes red on a supabase/-touching PR):**
1. Reproduce locally: scratch dir + `supabase init` + copy `supabase/migrations/` + pin `major_version = 15` + `supabase db start && supabase db reset --no-seed` (needs Docker Desktop running). Iterates in ~1–2 min; this rig caught a gap the static audit missed.
2. Gotchas that VALIDATE at replay time even "inside functions": plpgsql **DECLARE-section `%ROWTYPE`/`%TYPE`** resolve at CREATE FUNCTION; CREATE POLICY expressions; CREATE TRIGGER's function; GRANT signatures; plain DML validates columns even over 0 rows. plpgsql statement bodies do NOT validate.
3. New shims: name `<ts>_<what>_for_preview_replay.sql` with a timestamp just before the first file needing them, mirror EXACT live shapes, omit FKs/RLS that would pull in more unmirrored objects, register the version on prod, add a `preview-fix` manifest row.

## Remaining follow-ups

### FU-1 — Status-literal fixes (HIGHEST VALUE; user-visible-wrong today) 🔴 OWNER DECISION PENDING
Evidence gathered this session (live DB):
- `invoices.status` stores **lowercase codes**: paid 972 / sent 11 / partial 8 / draft 3 / cancelled 2. No `partially-paid`, no `overdue` ever stored.
- `quotes.status` stores **Title-case**: Sent 1053 / Draft 77 / Accepted 8 (all legacy-import era rows).
- **`quotesService.ts` already types + writes lowercase codes** (`'draft'|'sent'|'accepted'|'rejected'|'expired'|'converted'`, default `'draft'`) → app and data disagree TODAY independent of the badges.
- `master_invoice_statuses`/`master_quote_statuses` hold Title-case display NAMES (12/10 rows, no code column) — a third vocabulary; treat as UI labels only.
- Broken readers: sidebar invoice "attention" badge (counts only `'sent'`, misses `'partial'`, `'overdue'` impossible); sidebar quote "pending" badge (= 0 forever, `'sent'` vs `Sent`); `get_quote_stats_base` draft/sent/accepted = 0.
- **Recommendation:** lowercase codes canonical. One reviewed PR: (a) one-time data migration normalizing `quotes.status` Title-case → lowercase; (b) fix RPC literals — quote badge/stats → lowercase; invoice attention → `status IN ('sent','partial') OR (unpaid AND due_date < now)` (overdue is a date fact, not a status); (c) master names stay display-only. Live-probe badge numbers before/after.

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
1. Merge **#412** (FU-2) and **#413** (FU-5 record).
2. **FU-1 vocabulary decision** (see above) — then implement as its own reviewed PR.
3. Also open (other workstreams): #409 (thermal labels).
4. India: S7 publish (dual-control) + GA — see (B).

═══════════════════════════════════════════════════════════════════════════════
# (B) India Pack Phase 4 — BUILD COMPLETE (stub)
═══════════════════════════════════════════════════════════════════════════════

All build WPs are MERGED to main: S1a–S3 (#380–#384), S4 (#385), the stranded-stack recovery S5+S6+L1 re-land (#389), L2 (#392), L3 (#390), L4 (#394 — includes the exact per-head CN netting S6 deferred; `gross_pending_l4` is gone from main), L5 (#391), L6 (#395). The 2026-07-07 stacked-merge incident (children merged into parent branches → S5/S6/L1 stranded) is why this repo now does strictly fresh-branch-from-main PRs.

**Remaining (owner-gated only):** S7 publish (dual-control) + GA go-live, and the SA `statutory_ready` decision (ZATCA Phase 2) from P3. Test tenant IND0003 (`4c4c32db-…`) is disposable. Ledger: `.superpowers/sdd/progress.md`; plan/spec `docs/superpowers/{plans,specs}/2026-07-05-phase4-india-pack*.md`.
