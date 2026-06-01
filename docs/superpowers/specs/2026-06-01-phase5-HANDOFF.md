# Phase 5 — Implementation Handoff (all remaining phases)

- **Date:** 2026-06-01
- **Purpose:** Resume point after the analysis + Phase-1 data fix were executed. Read with: the **execution strategy** (synthesis in session transcript), `2026-06-01-platform-design-system-design.md` (the program plan, P5.1–P5.8), `2026-06-01-platform-ux-consistency-audit.md` (evidence), `2026-06-01-phase5-p1-critical-fixes-design.md` (the P1 spec), and `DESIGN.md` (locked tokens).
- **Resume cheaply:** this session's cost ballooned because a 10-agent workflow (~970K tokens) sits in context and is re-billed every turn. **Start remaining work in a fresh session.** Ideally set `ECC_GATEGUARD=off` first (the per-write fact-gate added friction; it could not be disabled mid-session — the classifier blocks disabling a guard). **Nothing has been committed** — all changes are in the working tree.

---

## ✅ Shipped this session (PR-A — the live money bug)

The flagship defect was **live financial corruption**, not a UX split: both invoice-payment entry points wrote `receipts`/`receipt_allocations` inline, **bypassing the append-only `record_payment` ledger** and (on the detail page) **never updating `invoices.amount_paid`**.

| Artifact | State |
|---|---|
| `create_receipt_with_allocations(p_receipt jsonb, p_allocations jsonb)` RPC | **LIVE on production** (migration applied). Mirrors `record_payment`: FOR UPDATE invoice locks, Σ(alloc)=amount, balance/status recompute, **one append-only income `financial_transactions` posting**, optional atomic bank-balance update. Base-currency only (receipts is currency-naive); rejects foreign-currency invoices, overpayment, unapplied cash, and missing allocations with clear errors. `receipt_number` left null (no `receipt` number-sequence scope exists). `authenticated`-only EXECUTE grant. |
| TDD | **RED→GREEN verified** via rolled-back `DO` blocks (happy + Σ≠amount + over-balance + no-allocation rejections) — `happy=[PASS] sum=[PASS] exceed=[PASS] noalloc=[PASS]`. Nothing persisted to production. |
| `src/types/database.types.ts` | Regenerated (15,898 lines; includes the new function). Schema-drift gate will pass. |
| `src/lib/receiptsService.ts` | New: `createReceiptWithAllocations(receipt, allocations)` wrapping the RPC + audit-trail log. |
| `src/pages/financial/InvoiceDetailPage.tsx` | `onSave` rewired to the service; **synthesizes a full-amount allocation** to the invoice (singleInvoiceMode emits none); dropped `resolveTenantId` import. |
| `src/pages/financial/InvoicesListPage.tsx` | `onSave` rewired; **manual invoice + bank-balance loops deleted** (RPC owns them); dropped `resolveTenantId` import. |
| `scripts/financial/detect-receipt-ledger-drift.sql` | Read-only reconciliation detection (receipts w/o ledger row; invoices whose amount_paid ≠ Σ allocations). |
| `tsc --noEmit` | **0 errors.** |

### ⚠️ Correction baked in (was wrong in the audit/verification/spec)
`RecordPaymentModal.tsx` is **NOT dead code** — it is live in `PaymentsList.tsx:614` and `CaseDetail.tsx:1267` (both write the *good* atomic `payments` path via `paymentsService`). **F2's "delete dead modal" is cancelled.** The spec §0/§3.2 and the memory note have been corrected.

### Behavior changes to announce in the PR
- Overpayment / unapplied / foreign-currency receipts now **fail with a clear error** (modal shows it) instead of silently writing a wrong-ledger row.
- Detail-page payments now correctly update the invoice balance (previously never did).

### Still owed for PR-A before merge
- Run `scripts/financial/detect-receipt-ledger-drift.sql` and **record the corruption counts** in the PR description (scopes the backfill).
- `get_advisors` after migration (expect only the by-design SECURITY DEFINER info-lint).
- Add the migration to the manifest (`.github` migration-manifest gate) + use the migration PR template.
- **Open items to confirm:** (1) whether bank balance should be ledger-derived instead of the RPC's atomic `current_balance` bump (coordinate with the financial-integrity owner; drop that RPC block if so). (2) The overpayment-as-credit hint in `RecordReceiptModal` (line ~436) is now misleading — soften it.

### Separate, independently-reviewed follow-up (NOT in PR-A)
**Corrective backfill** of already-corrupted rows (post missing ledger entries + recompute balances). High-risk money migration — own it separately, scoped from the detection counts. Additive, **no hard-deletes**, preserve append-only.

---

## 🔧 Remaining Phase-1 work (defects, NOT yet done)

These are independent of the composition layer and of PR-A. The P1 spec (§4–§9) has exact fixes. Suggested two PRs:

**PR-B (pure defects, low-risk, parallelizable):**
- **F3** dead `/invoices/:id/edit` (`InvoiceDetailPage.tsx:521`) → switch to modal edit (match Quote). Do NOT register the dead route.
- **F4** `AuditTrails.tsx:170` `bg-${getActionColor()}-100` (JIT-stripped, invisible in prod) → static `ACTION_TONE` map (success-muted/info-muted/danger-muted/surface-muted) + fix sibling `<Badge color=…>` to `variant`. Author AST `no-dynamic-tw-class` lint (warn).
- **F5** `index.css:37` `--color-ring: 99 102 241` (banned indigo, fails WCAG 2.4.11 on every focus ring) → `--color-ring: var(--color-primary);`. Add CI assertion: no `99 102 241` / `59 130 246` triplet in `index.css`/`tailwind.config.js`.
- **F6** add global `@media (prefers-reduced-motion: reduce)` block to `index.css` (205 `animate-*` sites, zero coverage); change `CaseSuccessModal.tsx:43` looping `animate-bounce` → static.
- **F8** `ExpensesList.tsx:690` `'OK'` → `'Approve'`.

**PR-C (silent-failure / a11y):**
- **F7a** `ExpenseFormModal.tsx:105` & `TransactionFormModal.tsx:60` `if (amount<=0||!description.trim()) return;` on **money** forms → surface inline error + `useToast().error()`, never silent. (Leave the `#10b981/#ef4444` inline style at `TransactionFormModal.tsx:256` for the P2 token sweep.)
- **F7b** introduce `useConfirm() → Promise<boolean>` (ConfirmDialog-backed, return-focus contract); replace `window.confirm` on financial+custody: `PaymentsList` (void), `TransactionsList` (reconcile/void), `VATAuditPage` (submit/mark-paid), `InvoicesListPage` (bulk archive/send), `CaseEngineersTab` (remove engineer), `CaseFilesTab` (delete attachment). Scoped `no-restricted-globals: [warn] alert, confirm` on financial/cases dirs.

**F0 re-baseline (verification, record results):** "dead History tab" is already fixed (`CaseDetail.tsx:738` renders `ChainOfCustodyTab`, no orphan `case_job_history` fetch); portal quote approve/reject is **already guarded** (`PortalQuotes.tsx`). → Re-point P5.6's quote guard to the **staff** path only (`QuoteDetailPage.tsx:734`).

---

## 🗺️ Phases 2–5 (condensed roadmap; full detail in the strategy + design plan)

**Re-sized magnitudes from verification (the audit under/over-counted):** `border-slate-200` **651** in 199 files (not ~85), raw `<table>` **45** files, hardcoded hex **52** files, `fixed inset-0` **28** in 19 files, `window.confirm` **22** (not ~40). RHF+Zod **already installed**; `.range()` server pagination **already present** in payments/invoices/transactions services (frontend wiring is the gap); removing `react-hot-toast` is a **net bundle win**.

### Phase 2 — Design System Foundation (= plan P5.1 + guardrails + interaction contracts)
- `statusToBadgeVariant()` **returning the Badge variant enum** (colocate with existing `STATUS_TONE` in `src/lib/ui/variants.ts`); replaces 22 `getStatusColor()` + the `getCommunicationColor()` copies.
- `Button variant="success"` (add to union + cva + a type guard so unknown variants fail typecheck, not silently alias to primary).
- Hex sweep (52 files **incl. config files**); `border-slate-200`→`border-border` as its **own sub-stream** (651 sites); resolve DESIGN.md drift #1 (glow-blue in `tailwind.config.js`) and #3 (PDF cyan — ratify-or-align). (#2 ring done in P1/F5.)
- CI: closed-14-token check; flip hex + AST dynamic-class lints warn→error.
- **Decide interaction contracts BEFORE building components:** feedback decision matrix (toast vs inline banner vs confirm vs success-modal), optimistic-vs-pessimistic policy (app is 100% pessimistic today), canonical busy-state prop name (`isPending`), `EmptyState`→`ui/` with two variants (no-data-yet vs no-results), Create-success = toast (reserve SuccessModal for next-action flows).
- a11y front-load: skip-nav link; document `status-muted` = icons/chips only (text fails 4.5:1).

### Phase 3 — Platform Standardization (= plan P5.2–P5.5; **vertical-slice per domain, NOT big-bang**)
- `FormModal` that **renders the `<form>`** + a **`RHFFormField` adapter** bridging the existing render-prop `FormField` to RHF `Controller` (the single most-reused, least-specified seam — pin it first with a worked `RecordPaymentDialog` reference).
- `DataGrid<T>` under a **new name + `ColumnDef<T>`** (the existing `Column<T>` in `ui/Table` and `shared/DataTable` collide; keep both as deprecated shims, delete in a terminal PR). Reconcile column-`sortable` vs controlled server-sort to avoid double-sorting money lists. `useDataTableQuery` hook owns `{page,sort,debouncedSearch}` + `keepPreviousData`; `count:'estimated'` (tenant-scoped) on large financial tables. **Scope DataGrid to ~20 flat lists; exclude card-grids + device/custody composites.**
- `DropdownMenu` (portaled — avoids `overflow-x-auto` clipping; APG Menu pattern) landing with/before DataGrid `rowActions`.
- `Tabs`/`TabPanel` (URL-synced via `useSearchParams`, **full APG Tab pattern**: tablist/tab/tabpanel, roving tabindex, arrow/Home/End). Mandatory `PageHeader`. Two `DetailPage` variants.
- Per-cluster **assisted migrations** (29 forms, ~25 lists) — **not codemods** (Zod schemas + column defs are hand-authored; TDD per form/table). The `react-hot-toast`→`useToast` rename *is* mechanical.

### Phase 4 — Workflow Optimization (= plan P5.6 + status patterns; **data half already shipped in P1**)
- Unify the Record-Payment **UI** behind one `RecordPaymentDialog` from every entry point. The **data path is already atomic** (P1 RPC). The receipts↔payments↔`payment_receipts` **consolidation** is the separately-owned financial workstream (3 paths, not 2).
- **Staff** quote guard (`QuoteDetailPage.tsx:734`) via the `CaseStageBanner` modal+reason pattern, aligned to the portal's existing reason shape — **gated on a cases/financial ticket first fixing the broken `case_quotes`/status-name loop** (don't paint forensic intent over a write that doesn't land).
- Sanctioned status-transition pattern set; approval gates (delivery/QA release, custody transfer) via `ConfirmDialog`+reason — preserve existing lab control points.

### Phase 5 — Final Polish & Production Readiness (= plan P5.7–P5.8 + gates)
- `NoteComposer`/`NoteItem`, `FileUploader`/`FileList` (one size/types/affordance policy), **presentational** `Timeline`. **Custody stays a forensically-distinct, append-only, device-anchored surface** — not folded into a generic activity feed. **Surface** `case_job_history` as a real Activity tab rather than deleting anything.
- `StatsCard` consolidation (14-token `COLOR_ALIAS` only; map orange→warning, teal→info, emerald→success, purple→accent/secondary; **no new `--color-*`**). All charts via `chartTheme`.
- `AppShell` mobile drawer — **position-aware** (`user_sidebar_preferences` left/right → mirror transform) and **RTL-aware**; table→card fallback; mobile full-screen modal (focus trap preserved). Mobile AT sign-off (VoiceOver/TalkBack).
- Remove `react-hot-toast` from `package.json`; **flip all guardrails warn→error** per migrated cluster; 14-token contrast audit; register every new component in DESIGN.md (per-phase exit).

---

## 🚩 Non-Goals to repeat loudly (avoid generic-CRM leakage)
Phase 5 is composition/consistency. It does **not** close forensic-lifecycle gates: NDA/destructive-consent at intake, payment-before-release, QA-before-close, recovered-file manifest + customer acceptance, custody-at-intake. Those are lab-workflow work owned elsewhere. **"Phase 5 done" ≠ "lab workflow hardened."**

## References
- `docs/superpowers/specs/2026-06-01-phase5-p1-critical-fixes-design.md` (P1 detail)
- `docs/superpowers/specs/2026-06-01-platform-design-system-design.md` (P5.1–P5.8)
- `docs/audits/2026-06-01-platform-ux-consistency-audit.md` (evidence)
- `docs/financial-integrity-audit-2026-06-01.md` (Phase-4 consolidation + backfill)
- `DESIGN.md` (locked 14-token vocabulary); `CLAUDE.md` (append-only audit/custody, soft-deletes, RESTRICTIVE isolation, 16-stage lifecycle)
