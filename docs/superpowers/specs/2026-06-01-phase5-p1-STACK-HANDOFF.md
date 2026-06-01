# Phase 5 — P1 Stack Handoff (post-PR-#141)

- **Date:** 2026-06-01
- **PR:** [#141 `fix/phase5-p1-stack`](https://github.com/devflowza/Space_Recovery/pull/141) → `main` (open)
- **Supersedes the resume section of** `2026-06-01-phase5-HANDOFF.md` (that doc's plan is now executed for PR-A/B/C + Phase-2 foundation). Read alongside `2026-06-01-phase5-p1-critical-fixes-design.md` (P1 spec) and `2026-06-01-platform-design-system-design.md` (P5.1–P5.8 program).
- **Why a fresh session next:** the build session carried a ~913K-token dynamic-workflow result in context that re-bills every turn (cost ran $27→$74 in two turns). Continue in a clean session.

---

## ✅ Shipped in PR #141 (4 commits, each `tsc=0`)

| Commit | Scope |
|---|---|
| `b8d7c67` PR-A | `create_receipt_with_allocations` RPC (live on prod) + `receiptsService.ts` + both invoice-payment callers rewired + `detect-receipt-ledger-drift.sql`. Stops the ledger-bypass; detail page now updates `amount_paid`. |
| `5449f76` PR-B | F5 ring→`var(--color-primary)`; F6 `prefers-reduced-motion` block + killed `CaseSuccessModal` looping bounce; F4 `AuditTrails` static `ACTION_TONE` map (+ `eslint-rules/no-dynamic-tw-class.js` rule file); F3 dead `/invoices/:id/edit`→modal edit (reuses `InvoiceFormModal`); F8 `'OK'`→`'Approve'`. New `scripts/check-tokens.sh`. |
| `cf2705f` PR-C | F7a money-form inline error + toast (`ExpenseFormModal`, `TransactionFormModal`); F7b `src/hooks/useConfirm.tsx` (ConfirmProvider in `App.tsx`, `Promise<boolean>`, return-focus) replacing `window.confirm` on PaymentsList/TransactionsList/VATAuditPage/InvoicesListPage/CaseEngineersTab/CaseFilesTab. |
| `cba8649` Phase-2 | `statusToBadgeVariant()` in `src/lib/ui/variants.ts`; Button `variant="success"`; skip-nav in `AppLayout`; `check:tokens` npm script + CI `token-guard` job. |

**Verified on the settled tree:** `npm run typecheck` = 0 errors; `bash scripts/check-tokens.sh` = OK; 0 `window.confirm` on the six target surfaces.

---

## 🔴 Must-do before merging #141

1. **Two eslint registrations are NOT applied** — the ECC `config-protection` hook hard-blocks edits to `eslint.config.js`, and the auto-mode classifier (correctly) refuses to let an agent disable it. **A human must apply these**, or disable the hook (`ECC_DISABLED_HOOKS=config-protection`) and let an agent apply them. Both are additive/`warn`-level:
   - In imports: `import noDynamicTwClass from './eslint-rules/no-dynamic-tw-class.js';`
   - In `plugins.xsuite.rules`: `'no-dynamic-tw-class': noDynamicTwClass,`
   - In the main `rules` block: `'xsuite/no-dynamic-tw-class': 'warn',`
   - New scoped config object (before the final `);`):
     ```js
     {
       files: ['src/pages/financial/**', 'src/components/financial/**', 'src/components/cases/**'],
       rules: {
         'no-restricted-globals': ['warn',
           { name: 'confirm', message: 'Use useConfirm() — native confirm is inaccessible.' },
           { name: 'alert', message: 'Use a toast/inline error — native alert is inaccessible.' },
         ],
       },
     }
     ```
   The F4 fix and PR-C migrations do not depend on these — the rules only *enforce* going forward, and there are no current violations to catch.

2. **PR-A pre-merge debt** (from the P1 spec §11): run `scripts/financial/detect-receipt-ledger-drift.sql` and paste the corruption counts into the PR; add the `create_receipt_with_allocations` migration to the migration manifest (`.github` migration-manifest gate) using the migration PR template; run `mcp__supabase__get_advisors` (expect only the by-design `authenticated_security_definer_function_executable` info-lint).

3. **Confirm two open RPC items** with the financial-integrity owner: (a) whether `bank_accounts.current_balance` should be ledger-derived rather than bumped in the RPC (drop that block if so); (b) soften the now-misleading overpayment-as-credit hint in `RecordReceiptModal` (~line 436).

---

## 🟡 Separate, independently-reviewed follow-up (NOT in #141)
**Corrective backfill** of already-corrupted rows (post missing ledger entries + recompute balances). High-risk money migration — additive only, no hard-deletes, preserve append-only. Scope it from the detection-SQL counts.

---

## 🗺️ Deferred by design — Phases 2(rest)/3/4/5

Phase-2 here shipped only the **foundation primitives**. Still open in Phase 2: the **651-site `border-slate-200`→`border-border`** sub-stream, the **52-file hex sweep** (incl. config files), the ~22 `getStatusColor()`→`statusToBadgeVariant()` call-site migration, DESIGN.md drift #1 (glow-blue) and #3 (PDF cyan), and the **interaction-contract decisions** (toast vs inline vs confirm matrix; optimistic-vs-pessimistic; canonical `isPending`; EmptyState variants) — these are *decisions*, brainstorm them before building.

**Phases 3–5 are multi-week, per-domain, hand-authored** (FormModal + RHFFormField adapter; DataGrid<T>/ColumnDef under a new name; DropdownMenu; URL-synced Tabs; ~29 form + ~25 list assisted migrations with per-form Zod + TDD; AppShell mobile drawer; StatsCard consolidation; remove `react-hot-toast`). **Do not one-shot these in a single workflow** — each domain slice is its own scoped session/PR. Re-sized magnitudes and the vertical-slice strategy are in `2026-06-01-phase5-HANDOFF.md` §"Phases 2–5".

**Non-goal to repeat:** Phase 5 is composition/consistency. It does **not** close forensic-lifecycle gates (NDA/consent at intake, payment-before-release, QA-before-close, recovered-file manifest, custody-at-intake). "Phase 5 done" ≠ "lab workflow hardened."

---

## References
- PR #141; commits `b8d7c67`…`cba8649`
- `2026-06-01-phase5-p1-critical-fixes-design.md` (P1 spec, F0–F8)
- `2026-06-01-phase5-HANDOFF.md` (full Phases 2–5 roadmap + resized magnitudes)
- `2026-06-01-platform-design-system-design.md` (P5.1–P5.8); `DESIGN.md` (locked 14 tokens)
