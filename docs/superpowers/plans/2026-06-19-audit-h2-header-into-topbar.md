# Audit H2 — Implementation Plan (header into top bar)

Spec: `docs/superpowers/specs/2026-06-19-audit-h2-header-into-topbar-design.md`
Branch: `claude/audit-h2-header-topbar` (cut from `main` @ `b2e3fc8`, includes H1).
Execution: subagent-driven; fresh implementer per task; spec + code-quality review per task; final whole-diff review. Commits signed (`git commit -S`), trailers required.

**Invariant for every task:** unmigrated/detail/portal pages must render exactly as today (empty slot → route label, no actions). `npm run typecheck` 0 · `npx vitest run` green · `eslint` 0 errors on touched files.

---

## Task 0 — Foundation (TDD, reviewed in isolation BEFORE any page migration)

Files: `src/contexts/HeaderSlotContext.tsx` (new), `src/components/layout/PageHeaderSlot.tsx` (new), `src/contexts/HeaderSlotContext.test.tsx` (new), `src/components/layout/AppLayout.tsx` (wire provider + bar).

1. **RED** — unit tests:
   - `HeaderSlotProvider` + `usePageHeaderSlot({title, actions})`: mounting a consumer sets context `title`; unmount clears it (`undefined`).
   - With an `actionsHost` present, `usePageHeaderSlot` portals `actions` into it; without a host, renders null (no throw).
   - `PageHeaderSlot` renders null in the tree (returns the portal/null) and registers the title.
   - Backward-compat: a tree with the provider but no `usePageHeaderSlot` consumer leaves `title === undefined`.
2. **GREEN** — implement per spec §4.1: context (title state + actionsHost state), `useLayoutEffect([title])` set/clear, `createPortal(actions, actionsHost)` when host present. `PageHeaderSlot` wrapper.
3. **AppLayout wiring** (spec §4.2): wrap in `<HeaderSlotProvider>` (inside `SidebarPreferencesProvider`); breadcrumb current crumb = `title ?? routeLabel`; add the `<div ref={setActionsHost} className="hidden md:flex items-center gap-2" />` host in the right cluster before search/notifications, with an `empty:hidden` divider. Do NOT change any other bar element.
4. Gates + commit `feat(layout): HeaderSlot — register page title+actions into the top bar (Audit H2)`.

**Review gate:** spec + code-quality review focused on the backward-compat invariant (empty slot = today's bar), the no-loop guarantee, RTL, and `useLayoutEffect` SSR/jsdom safety. Do not start Task 1 until APPROVED.

## Tasks 1–4 — Migrate the 19 pages (domain batches; each = one implementer + one review)

Per page: replace `<PageHeader title icon description actions={A}/>` with `<PageHeaderSlot title="…" actions={A}/>`; **drop icon + description**; move `actions` **verbatim** (same handlers/conditionals); remove now-unused imports (`PageHeader`, the Lucide icon); reclaim the row's `mb-4`. Apply the **filter caveat** (spec §4.3): page-level filters/view-toggles stay in a slim in-content toolbar; only Create/Add/Export/Save-type actions go to the bar — flag ambiguity, don't guess.

- **Task 1 — Stock (6):** `StockListPage`, `StockCategoriesPage`, `StockSalesPage`, `StockAdjustmentsPage`, `StockReportsPage`, `StockLocationsPage`. (Note: StockListPage & StockSalesPage carry filters/view-toggle — keep those in-content.)
- **Task 2 — Payroll (6):** `ProcessPayrollPage`, `SalaryComponentsPage`, `PayrollHistoryPage`, `PayrollAdjustmentsPage`, `EmployeeLoansPage`, `PayrollSettingsPage`. (PayrollHistory filters stay in-content; PayrollSettings Save/Reset → bar.)
- **Task 3 — Settings (3):** `BillingPage`, `PlansPage`, `ImportExport`. (Plans billing-interval toggle stays in-content; Billing Cancel → bar; ImportExport has no actions — title only.)
- **Task 4 — Financial/Suppliers/Admin/Quotes (4):** `InvoicesListPage` (selection-driven bulk actions — verify they stay live through the portal), `PurchaseOrdersListPage`, `TenantManagement`, `QuotesRecycleBin`.

Each batch: one commit `refactor(<domain>): page title+actions into top bar via HeaderSlot (Audit H2)`; reviewed (behavior preserved, no lost handler, filter caveat honored, imports cleaned).

## Task 5 — DESIGN.md (L2)

Add the "Page header & breadcrumb roles" note + the `usePageHeaderSlot` contract (spec §4.5). Commit `docs(design): breadcrumb-as-title + HeaderSlot contract (Audit H2 / L2)`.

## Task 6 — Finalize

Full gate (typecheck/eslint/vitest); whole-diff review (consistency across the 19, backward-compat intact, mobile `hidden md:flex` acceptable, no banned colors); push; open PR (base `main`) on explicit user go.

---

### Parallelization
Tasks 1–4 are independent (disjoint files) and can run concurrently **after** Task 0 is APPROVED. Task 0 is the hard dependency. Reviews are per-batch.
