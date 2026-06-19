# Audit 3 — Enterprise-Density & Scalability Program · Handoff

> **Purpose.** Durable, version-controlled handoff so any new session can continue the Audit 3 remediation. Read §1 (status), §2 (conventions), §3 (the reusable assets/patterns already built), then §4 to ship the recommended next increment (H3), or §5 to pick up any other track.
>
> _Snapshot as of 2026-06-19._ Audit = a whole-platform UX/density/scalability review on a 13.5" Surface Pro, grounded in the real implementation. Four tracks approved: **A** (density), **B** (table scalability), **C** (consistency templates), **D** (architecture/perf). Findings catalogued **C1–C2 / H1–H4 / M1–M5 / L1–L3**. It ships as a multi-PR rollout: each increment = one fresh-branch PR, merged before the next.

## 1. Status snapshot

**Shipped — squash-merged to `main`:**

| PR | Scope | Track |
|----|-------|-------|
| #247 | Templates page fixes | pre-audit |
| #248 | Sidebar enterprise redesign + app-shell scroll fix (`h-dvh` + `min-h-0`) | pre-audit |
| #249 | Compact `PageHeader` + `StatCard` density standard (Invoices ref; `FinancialModuleHeader`/`FinancialStatsCard` → deprecated wrappers) | A foundation |
| #250–#255 | C1 server-side pagination ×9 list pages + reusable `Pager` + count-based stats | C1 |
| #256 | This handoff doc | docs |
| #257 | **Finish C1** (Employees + Purchase Orders) + C2 BankingPage ledger virtualization | C1 / C2 |
| #259 | **C2** — virtualize StockReports valuation table + paginate Clone Drives list | C2 |
| #260 | **H1** — shared `DetailPageHeader` + detail-page compaction (Invoice/Case/Customer); folds in **L3** | H1 |
| #261 | **H2** — `HeaderSlot` (page title+actions into the top bar) across 19 list pages; folds in **L2** | H2 |

**Done:**
- **C1 complete** — 11 list pages on server-side pagination + Employees + Purchase Orders. `CasesList` / `ConfigurableDataTable` stays the original server-`.range()` reference.
- **C2** — the critical unbounded tables are virtualized (StockReports valuation, BankingPage ledger) and Clone Drives paginated. Every other large table is already bounded by C1 pagination, so **further virtualization is an optional long tail**, not a blocker (see §5).
- **H1 ✅** — detail-page compaction shipped. **L3 ✅** (detail container `px-6 py-5`).
- **H2 ✅** — page header merged into the top bar. **L2 ✅** (breadcrumb-vs-title roles documented in `DESIGN.md`).

**Remaining:** **H3** (List/Detail templates — its H2 dependency is now satisfied; **recommended next**, §4), **H4** (data-driven sidebar nav), **M1–M5** (M3 mostly done), **L1** (deprecate `StatsCard` → `StatCard`; folds into H3). See §5.

## 2. Workflow & conventions (operate exactly like this)

- **Branch:** one **fresh** branch per increment named `claude/audit-<item>-<slug>` (e.g. `claude/audit-h2-header-topbar`), cut from current `main`: `git fetch origin main` → `git checkout -b claude/audit-<item>-<slug> origin/main`. PRs here are **squash-merged and the branch deleted** — never reuse a merged branch (pushing the old name recreates already-merged commits). Always cut a new one from fresh `main`.
- **Signed commits (required):** commit with `git commit -S`. A stop-hook flags any commit GitHub will show as Unverified (unsigned, or committer email ≠ `noreply@anthropic.com`). If a subagent's commit lands unsigned, re-sign the unpushed range with `git rebase --exec 'git commit --amend --no-edit --reset-author -S' <last-good-sha>` before pushing.
- **Commit trailers (required):** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: <session url>`. **PR body footer:** `🤖 Generated with [Claude Code](https://claude.com/claude-code)` + the session url. Never put the model id in commits/PRs/code.
- **One PR per increment**, base `main`. GitHub MCP tools load via `ToolSearch` (`select:mcp__github__create_pull_request`); repo = `devflowza/space_recovery`. Check `list_pull_requests` (head `devflowza:claude/audit-<item>-<slug>`, state open) first to avoid dupes. **Do not open a PR until the user explicitly asks** (offer the finishing-a-development-branch options).
- **Verification gates (every PR):** `npm run typecheck` → 0 · `npx eslint <touched files>` → 0 errors (the many `no-untranslated-jsx-text` i18n warnings are pre-existing and acceptable) · `npx vitest run` → green. **Baseline as of #261: 157 files / 1295 passed / 2 skipped.**
- **Execution model (used for C2/H1/H2 — works well):** subagent-driven. Decompose into tasks; dispatch one **implementer** subagent per task (TDD for new code), then a **spec-compliance** review and a **code-quality** review per task (combined for mechanical tasks), then a **final whole-diff** review before the PR. The controller (you) holds the thread, applies small review fixes directly, and runs the gates. Foundation/shared-layout work is built + reviewed **in isolation** before dependent pages.
- **Skill gate (`CLAUDE.md`):** load skills before work (UI → `ui-ux-pro-max` + `frontend-design`; logic/process → superpowers: `brainstorming` → `writing-plans` → `subagent-driven-development`/`executing-plans` → `verification-before-completion`). Design-heavy tracks: brainstorm → spec doc → plan doc → execute.
- **Design system:** semantic tokens only (no raw hex / brand Tailwind colors; no purple/indigo/violet), DM Sans, reuse the primitives in §3. UI tracks so far are **frontend-only — no DB migrations.**

## 3. Reusable assets & patterns already built

**C1 — pagination.** Primitive `src/components/ui/Pager.tsx` (props `page` 0-based, `pageSize`, `total`, `onPageChange`, `itemNoun`). Recipe (applied 11×): module `PAGE_SIZE=50` + 0-based `page` state; 300ms debounced search + `setPage(0)` on filter change; `useQuery` returning `{rows,total}` via `.select(cols,{count:'exact'}).range(...)` + `keepPreviousData`; **all filters/search server-side** (`sanitizeFilterValue` from `src/lib/postgrestSanitizer.ts`); **KPIs from a global count/aggregate stats fn** (`{count:'exact',head:true}`), not the page array; `<Pager>` at the table-card footer. Gotchas: never mutate a shared `fetch*()` with many callers — add a `*Page` variant; joined-field search needs id-lookup then `.or(...,<fk>.in.(ids))`; column-vs-column comparisons paginate in-memory. References: `invoiceService.fetchInvoicesPage`, `customerService.getCustomerStats`, `SuppliersListPage.test.tsx` (universal thenable-chain supabase mock).

**C2 — virtualization.** `@tanstack/react-virtual` for unbounded/large tables. Shipped on the StockReports valuation table and BankingPage ledger; pattern = a virtualized row window over the full fetched set when a table can legitimately be long. Spec: `docs/superpowers/specs/2026-06-18-audit-c2-table-virtualization-design.md`. C1 pagination is the baseline bound; reach for C2 only where a single view legitimately renders thousands of rows.

**H1 — `DetailPageHeader`** (`src/components/shared/DetailPageHeader.tsx`). Breadcrumb-led detail header: `breadcrumbs: Crumb[]` where the **final crumb is the page title** rendered once as `<h1 aria-current="page">` (no duplicate title); `badges` / `actions` / `meta` slots. **Gutter-neutral** (`mb-4` only) — the page's `px-6 py-5` container supplies the gutter (don't double-pad). Used on Invoice/Case/Customer detail. Spec/plan: `docs/superpowers/{specs,plans}/2026-06-18-audit-h1-detail-page-compaction*`.

**H2 — `HeaderSlot`** (`src/contexts/HeaderSlotContext.tsx`). A list page registers `usePageHeaderSlot({ title, actions })` (or `<PageHeaderSlot title actions/>` from `src/components/layout/PageHeaderSlot.tsx`). **Title** → context state (set in `useLayoutEffect`, no flash); the AppLayout top bar renders `title ?? routeLabel` as the breadcrumb's current crumb (fixes coarse first-segment-only breadcrumbs on nested routes). **Actions** → portaled into a `hidden md:flex empty:hidden` host in the bar (live every render, so selection-driven actions stay current). **Backward-compatible:** a page that doesn't register leaves the bar exactly as before. The per-page `PageHeader` row is then deleted (icon + subtitle dropped; page filters stay in-content). `PageHeader` (`src/components/shared/PageHeader.tsx`) remains only for shells with no global bar (portal, platform-admin). Spec/plan: `docs/superpowers/{specs,plans}/2026-06-19-audit-h2-header-into-topbar*`. Contract recorded in `DESIGN.md` → "Page header & breadcrumb roles".

## 4. Recommended next increment — H3 (List/Detail templates)

**Why now:** H3 depends on H2 + `DataTable`, both of which now exist — so H3 is largely **composition of primitives already shipped**, not new infrastructure.

- **`ListPageTemplate`** — composes: H2's `<PageHeaderSlot title actions/>` (top-bar) + optional KPI row (the count-based stats pattern from C1) + a filter bar + a C1-paginated (C2-virtualized where needed) `DataTable`. Goal: a list page becomes "configure the template", not "hand-assemble the chrome".
- **`DetailPageTemplate`** — composes: H1's `<DetailPageHeader>` + the compact card/rail layout (the `px-6 py-5` container, `p-4` cards) standardized in H1.
- **Reference-first:** migrate **Invoices** (`InvoicesListPage` + `InvoiceDetailPage`) onto the templates, prove the pattern, then roll out more list/detail pages in batches (subagent-driven, like H2's sweep).
- **Folds in L1:** deprecate the legacy `StatsCard` → `StatCard` as part of the KPI-row composition.
- **Approach:** brainstorm → spec → plan → subagent-driven. Watch for over-abstraction — the template should be a thin, opinionated composition with escape hatches (slots), not a config monolith.

## 5. Remaining tracks

- **C2 — Virtualization (long tail, optional).** Critical tables done (§1/§3). If a profiling pass finds another view that renders thousands of DOM rows despite pagination, virtualize it with the §3 pattern. Not required for program completion.
- **H3 — List/Detail templates (High).** See §4. Folds in L1.
- **H4 — Data-driven sidebar nav (High/Med).** Extract `Sidebar.tsx` inline sections into a typed `navConfig` registry (section/item/icon/moduleKey/featureFlag/order), render by `map`, keep `ProtectedSidebarNavItem` + `useTenantFeatures` gating; elevate Cmd-K (`CommandPalette.tsx`) as primary fast-nav. Independent of H3.
- **M1 — Collapsible KPI row (Med).** Per-user persisted (reuse the `user_preferences` / sidebar-prefs mechanism). Natural companion to H3's KPI row.
- **M2 — Responsive width (Med).** Relax `max-w-[1800px]` (~39 files) for data tables (`2xl:max-w-[2400px]` or full-width-minus-gutters); keep a readable max for forms/documents.
- **M3 — Re-render perf (Med, MOSTLY DONE).** `AuthContext`/`PermissionsContext`/`TenantConfigContext` already `useMemo`-wrapped (the audit's "not memoized" was a partial-read error — **do not "fix" them**). Remaining (marginal, deferred): `React.memo` on `SidebarSection`/`SidebarNavItem`; sane `staleTime` on `useSidebarBadges`.
- **M4 — Mega-component splits (Med).** Extract memoized line-item rows + split form state (metadata vs items) + pull tabs into files. Targets (LOC): `GeneralSettings` 1491, `CaseDetail` ~1405 (note: H1 touched its header only), `CustomersListPage` ~1228, `LeaveManagement` 1213, `CustomerProfilePage` ~1189, `InvoiceFormModal` 1101. One per PR.
- **M5 — Density toggle (Med).** Global comfortable/compact toggle (persisted per user) via the table primitive.
- **L1 — `StatsCard` → `StatCard` (Low).** Folds into H3.
- **L2 ✅ / L3 ✅** — done via H2 / H1.

## 6. Key corrections & learnings

- **Subagent-driven execution scaled well** for both surgical (H1: 3 pages) and broad (H2: 19 pages) work. Foundation/shared-layout pieces MUST be built + reviewed in isolation before dependents (H2's `HeaderSlot` was gated on a backward-compat review before the 19-page sweep). Reviews catch real issues — H1's double-`px-6` gutter and the `text-2xl` title were review-driven fixes.
- **Signed commits:** subagents sometimes commit unsigned; re-sign the unpushed range before pushing (§2). Verify with `git cat-file commit HEAD | grep -c gpgsig`.
- **H2 insight:** the AppLayout breadcrumb keyed only off `segments[0]`, so nested routes (`/stock/categories`, `/payroll/loans`) showed only the parent label — the HeaderSlot had to register the **title**, not just actions. Check routing depth before assuming the bar already shows the right title.
- **H1 insight:** a shared header should be **gutter-neutral**; let the page container own the horizontal gutter (avoids double-padding when composed).
- `AuthContext` is already `useMemo`-wrapped (M3) — don't "fix" it.
- C1 KPIs are intentionally GLOBAL; Pager totals are filter-aware. Don't change a shared fetch fn with multiple callers — add a `*Page` variant.
- **Verify agent claims against source** — recon "verdicts" sometimes overstate effort; the established recipes are routine.

## 7. Where the deeper detail lives

Per-increment specs + plans (self-contained, with the exact mechanism, file inventory, and rollout): `docs/superpowers/specs/` and `docs/superpowers/plans/` — `2026-06-18-audit-c2-*`, `2026-06-18-audit-h1-*`, `2026-06-19-audit-h2-*`. The original exhaustive audit findings (Problem/Why/Fix/Evidence per item) live in the project's Claude Code session plan file (auto-surfaced to a continuing session). §1–§6 here are sufficient to execute every remaining increment without that file.
