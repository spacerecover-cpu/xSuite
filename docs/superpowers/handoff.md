> **TWO WORKSTREAMS.** Most recent first: (A) the **Performance program** (2026-07-10, updated same-day after #410/#411 merged) below, then (B) the **India Pack Phase 4** stub (build complete; only owner-gated S7+GA remain) beneath the `═══` separator.

---

# Session Handoff (A) — 2026-07-10 (night) — PERF PROGRAM + ALL FOLLOW-UPS BUILD-COMPLETE · open PRs #412–#417 (owner merges) · nothing unstarted

## Current status — the audit follow-ups AND all four FU-1 lens findings are DONE

- **MERGED to main:** #410 (perf P0–P2 + the 6 Supabase-Preview replay shims) and #411 (FU-3 tsc fix). `npm run typecheck` on main = **0 errors**.
- **OPEN PRs (owner merges; all base main, independent code-wise):**
  - **#412** — FU-2 debounced-search sweep (6 pages). Green.
  - **#413** — FU-5 record (grants live + verified). Green — **merge FIRST** (its preview branch holds the plan's only slot; see quota note).
  - **#414** — FU-1 record (migration `20260710170508` live: 1,138 quotes normalized, badge literals fixed; probed pending 0→1053 / attention 11→19 / stats populated; 3-lens verify APPROVE).
  - **#415** — **FU-4 DONE**: atomic RPCs `record_stock_receipt`/`cancel_stock_sale`/`bulk_adjust_stock_quantities` (migrations `20260710173356`+`173624` live; rolled-back scenario probe incl. the double-cancel fail-loud guard; dead June `record_stock_receipt(uuid,int,jsonb)` overload DROPPED — PostgREST ambiguity hazard; dead `receivedBy` + seedData GENERATED-column config pruned; types regenerated; 4 TDD seam tests).
  - **#416** — **WP-B DONE (stage-7 portal approval)**: `approve_quote`/`reject_quote` rewritten (migrations `20260710174846`+`174936` live) — canonical text status + real `status_id`, `status='sent'` gate, DB-side audit + custody `QUOTE_APPROVED/REJECTED` with `source portal|staff`, GRANT `portal` (it had NONE). Probed: staff approve / portal-role reject / foreign-customer + wrong-state raise. **Read-side of the portal quote loop still needs its own WP** — the portal lists the 0-row `case_quotes` orphan with a `pending_approval` vocabulary that exists nowhere (surface choice + column-exposure decision; see PR #416 body).
  - **#417** — **WP-C DONE (vocabulary hardening)**: banking `'partially-paid'` LIVE BUG fixed (both allocation sites wrote a CHECK-rejected value with the error swallowed → invoice paid/balance/status silently never moved on bank-allocation paths; now canonical + fail-loud), `deriveInvoiceStatus` label params dropped (TODO resolved), `normalizeQuoteStatus` import coercion, `importValidator` quotes ERROR-guard, `quotes_status_check` live (migration `20260710180135`, probed accept/reject), reference lists +Quote Statuses / −advertised `overdue` (imports coerce overdue→sent; overdue is a due-date fact), AR aging `deleted_at` filter.
- **⚠️ Preview-branch QUOTA on #414–#417**: their Supabase Preview checks instant-fail (`Maximum number of concurrent branches reached`) — the plan allows 1 preview branch and #413's green one holds it. Flow: merge #413 → re-run the next PR's check from the Checks tab → merge → repeat (each merge frees the slot). Or raise the limit in Project Integrations Settings. Comments to this effect are on each PR.
- **Main-branch "Supabase Preview" check is RED on every main push and was BEFORE this session** (verified on pre-session commits): the production branch action fails with `Remote migration versions not found in local migrations directory` (~200 MCP-applied versions have no mirrored file) and **refuses before applying anything** — cosmetic. Owner option: disable production-branch sync in the integration, or accept the red run.
- **🆕 Suite baseline grew tonight (NOT ours):** 2 `chainOfCustodyParity` tests fail on **pristine main** (proven via stash; deterministic 2/2) — arrived with tonight's merges, most likely #408's tenant-timezone event rendering vs. the parity pins. Belongs to the custody/labels workstream (test-expectation fix). Full baseline now: 3 ExpensePaymentModal + 1 load-flaky typst + 2 custody-parity.

## ⚠️ NEW REPO INVARIANT — supabase/migrations/ is a PARTIAL mirror that MUST stay replay-consistent

The Supabase Preview CI check replays `supabase/migrations/` **from scratch** on an empty preview branch. The dir is NOT the full history (that's the live DB + manifest) — it's baseline (20260409000000) + a subset. **Invariant: every object a mirrored file touches must be provided by the baseline or an earlier mirrored file.** PR #233 broke this silently in mid-June (mirrored 3 country-config files without their unmirrored column-creating dependency); #410 was the first PR since to touch `supabase/` and exposed it.

Fixed with 6 **preview-replay shims** (`*_for_preview_replay.sql`, workstream `preview-fix`, precedent `20260409000001`): idempotent no-ops on prod, versions **registered in prod `supabase_migrations.schema_migrations`** so the on-merge apply skips them. Full replay now green.

**When you mirror a migration file (or CI preview goes red on a supabase/-touching PR):**
1. Reproduce locally: scratch dir + `supabase init` + copy `supabase/migrations/` + pin `major_version = 15` + `supabase db start && supabase db reset --no-seed` (needs Docker Desktop running). Iterates in ~1–2 min; this rig caught a gap the static audit missed.
2. Gotchas that VALIDATE at replay time even "inside functions": plpgsql **DECLARE-section `%ROWTYPE`/`%TYPE`** resolve at CREATE FUNCTION; CREATE POLICY expressions; CREATE TRIGGER's function; GRANT signatures; plain DML validates columns even over 0 rows. plpgsql statement bodies do NOT validate.
3. New shims: name `<ts>_<what>_for_preview_replay.sql` with a timestamp just before the first file needing them, mirror EXACT live shapes, omit FKs/RLS that would pull in more unmirrored objects, register the version on prod, add a `preview-fix` manifest row.

## Remaining follow-ups (all NEW discoveries this session; nothing from the original audit remains)

1. **Portal quote loop read-side rebuild** (stage 7): portal lists `case_quotes` (0 rows, write-orphan) with a `pending_approval` vocabulary that exists nowhere. Needs a surface decision (read `quotes` via a narrowed view/RPC vs. populate `case_quotes`) + vocabulary translation + column-exposure review. The write-side RPCs (#416) are ready for it.
2. **chainOfCustodyParity 2-test red on main** — likely #408 tz rendering vs. the parity pins (custody/labels workstream).
3. Optional: statusToBadgeVariant/portal vocabulary polish once (1) lands; `master_quote_statuses` display catalog still carries 4 names with no code equivalent (Pending Review / Follow-up Required / Under Negotiation / Cancelled) — import coercion maps them (draft/sent/sent/rejected), but the Settings lookup-CRUD surface still shows the stale 10-name catalog.

### Deferred audit items (unscoped; see audit doc "Areas NOT covered")
pdfmake/typst on main thread; `useCasesRealtime` broad invalidation; AuthContext TOKEN_REFRESHED re-render cascade; global `retry:2` stacking; render-blocking Google Fonts; xlsx main-thread assembly.

## Audit + playbook (unchanged)
- Audit source of truth: `docs/superpowers/specs/2026-07-09-e2e-performance-audit.md` (93 findings + per-phase UPDATE blocks).
- DB-phase playbook + house RPC styles + `stock_items` GENERATED-columns warning: see the P0–P2 section of the audit doc and `supabase/migrations.manifest.md` rows `20260710*`.
- Suite baseline: 3 pre-existing `ExpensePaymentModal` failures + 1 load-flaky typst test (fails ~half of isolated runs too — passes on re-run; area byte-identical to pre-perf main).
- `Workflow` scripts: plain JS, NO backticks in prompt strings; `args` may not bind — embed constants in the script body.

## Open owner items
1. Merge **#413 first**, then #412, then re-run-check + merge #414 → #415 → #416 → #417 (preview-branch quota; trivial manifest append-rebases may be needed on the later ones).
2. Decide on the always-red main-branch Supabase production check (disable prod-branch sync vs accept).
3. Also open (other workstreams): #409 (thermal labels). New red on main: chainOfCustodyParity ×2 (custody workstream).
4. India: S7 publish (dual-control) + GA — see (B).

═══════════════════════════════════════════════════════════════════════════════
# (B) India Pack Phase 4 — BUILD COMPLETE (stub)
═══════════════════════════════════════════════════════════════════════════════

All build WPs are MERGED to main: S1a–S3 (#380–#384), S4 (#385), the stranded-stack recovery S5+S6+L1 re-land (#389), L2 (#392), L3 (#390), L4 (#394 — includes the exact per-head CN netting S6 deferred; `gross_pending_l4` is gone from main), L5 (#391), L6 (#395). The 2026-07-07 stacked-merge incident (children merged into parent branches → S5/S6/L1 stranded) is why this repo now does strictly fresh-branch-from-main PRs.

**Remaining (owner-gated only):** S7 publish (dual-control) + GA go-live, and the SA `statutory_ready` decision (ZATCA Phase 2) from P3. Test tenant IND0003 (`4c4c32db-…`) is disposable. Ledger: `.superpowers/sdd/progress.md`; plan/spec `docs/superpowers/{plans,specs}/2026-07-05-phase4-india-pack*.md`.
