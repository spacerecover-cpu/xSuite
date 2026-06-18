# Audit 3 — Enterprise-Density & Scalability Program · Handoff

> **Purpose.** Durable, version-controlled handoff so any new session can continue the Audit 3 remediation. Read §1–§3 (status, conventions, the reusable C1 recipe), then §4 to ship the next increment, or §5 to pick up any other track.
>
> _Snapshot as of 2026-06-18._ Audit = a whole-platform UX/density/scalability review on a 13.5" Surface Pro, grounded in the real implementation. Four tracks approved: **A** (density), **B** (table scalability), **C** (consistency templates), **D** (architecture/perf). Findings catalogued **C1–C2 / H1–H4 / M1–M5 / L1–L3**. It ships as a multi-PR rollout: each increment = one fresh-branch **draft PR**, merged before the next.

## 1. Status snapshot

**Shipped — squash-merged to `main`:**

| PR | Scope | Track |
|----|-------|-------|
| #247 | Templates page fixes | pre-audit |
| #248 | Sidebar enterprise redesign + app-shell scroll fix (`h-dvh` + `min-h-0`) | pre-audit |
| #249 | Compact `PageHeader` + `StatCard` density standard (Invoices ref; `FinancialModuleHeader`/`FinancialStatsCard` → deprecated wrappers that drop inline stats + raw-hex icon) | A foundation |
| #250 | Invoices server-side pagination | C1 |
| #251 | Payments pagination + extracted reusable `Pager` | C1 |
| #252 | Quotes + Expenses + Transactions pagination | C1 |
| #253 | SystemLogs + AuditTrails pagination + server-side search | C1 |
| #254 | Customers pagination + count-based `getCustomerStats` | C1 |
| #255 | Suppliers + Inventory + Stock pagination | C1 |

**Remaining C1 (recon done — ready to build):** Employees + Purchase Orders → completes C1.

**Then:** C2 (virtualization), H1–H4, M1–M5, L1–L3 — see §5.

## 2. Workflow & conventions (operate exactly like this)

- **Branch:** develop on `claude/brave-volta-6nja8k`. Each increment starts: `git fetch --prune origin` → `git reset --hard origin/main` (the branch is squash-merged every time; reset onto fresh `main` so the PR carries only the new commit). The remote branch is *sometimes* auto-deleted on merge, sometimes not — if `git ls-remote --heads origin claude/brave-volta-6nja8k` still returns it, push with `git push -u origin claude/brave-volta-6nja8k --force-with-lease`; otherwise a normal `-u` push creates it.
- **One draft PR per increment**, base `main`. GitHub MCP tools load via `ToolSearch` (`select:mcp__github__create_pull_request`); repo = `devflowza/space_recovery`. Check `list_pull_requests` (head `devflowza:claude/brave-volta-6nja8k`, state open) first to avoid dupes.
- **Commit trailers (required):** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: <session url>`. **PR body footer:** `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Never put the model id in commits/PRs.
- **Verification gates (every PR):** `npm run typecheck` → 0 · `npx eslint <touched files>` → 0 errors (the many `no-untranslated-jsx-text` i18n warnings are pre-existing and acceptable) · `npx vitest run` → green (baseline: 152 files / 1280 passed / 2 skipped).
- **Skill gate (`CLAUDE.md`):** load skills before work (UI → `ui-ux-pro-max` + `frontend-design`; logic → superpowers). In plan mode: Explore → (Plan) → AskUserQuestion → ExitPlanMode.
- **Design system:** semantic tokens only (no raw hex / brand Tailwind colors), DM Sans, reuse `Pager`. The C1 series is **frontend-only — no DB migrations.**

## 3. The C1 pagination recipe (reusable — applied 11×)

Primitive: `src/components/ui/Pager.tsx` (props `page` 0-based, `pageSize`, `total`, `onPageChange`, `itemNoun`). References: `InvoicesListPage` + `invoiceService.fetchInvoicesPage` (service-backed), `PaymentsList` (inline), `CustomersListPage` (manual→useQuery + count stats).

**Core steps per page:**
1. module `const PAGE_SIZE = 50` + `const [page, setPage] = useState(0)` (0-based).
2. debounce search 300ms (`debouncedSearch`) + `useEffect(() => setPage(0), [...filters/debouncedSearch])`.
3. query returns `{ rows, total }` via `.select(cols, { count: 'exact' }) … .range(page*PAGE_SIZE, (page+1)*PAGE_SIZE - 1)` + `placeholderData: keepPreviousData`; derive `rows`/`total`.
4. move ALL filters/search **server-side** (`.eq` / `.or(ilike)` + `sanitizeFilterValue` from `src/lib/postgrestSanitizer.ts`); drop client `.filter()` / `.slice()`.
5. KPIs from a **global count/aggregate** stats source (NOT the page array). Add a `get*Stats()` using `{ count: 'exact', head: true }` count-only queries where none exists (see `customerService.getCustomerStats`).
6. mount `<Pager …>` at the table-card footer (or below the content for grid / `DataTable` layouts).
7. exports re-fetch ALL matching rows server-side (most already do).

**Decision rules & gotchas (learned #250–#255):**
- **Service-backed page** → add `fetch*Page()` returning `{rows,total}`; have the old `fetch*()` delegate (keeps other callers). **Inline page** → paginate the inline query in place. **Never change a shared fetch fn with many callers** — e.g. `getStockItems` has 4 callers, so a new `getStockItemsPage` was added alongside it.
- **Manual `useState`/`useEffect` page** → migrate to `useQuery` (consistency + `keepPreviousData`). If a test renders the page, add a `QueryClientProvider` + update the supabase mock chains (see the rewritten `src/pages/suppliers/SuppliersListPage.test.tsx` — a universal thenable-chain mock).
- **Search on a JOINED field** (AuditTrails `profiles.full_name`; Employees `profiles.full_name`/`departments.name`; PO supplier name) isn't OR-combinable with base columns in PostgREST → resolve matching ids first, then add `…,<fk>.in.(ids)` to `.or(...)` (the AuditTrails pattern). Simpler first-cut fallback: search base columns only.
- **Column-vs-column comparison** (Stock `low_stock`: `current_quantity <= minimum_quantity`) isn't expressible in PostgREST → fetch the matching set and paginate **in memory** for that case (bounded worklist).
- **Non-functional placeholder tied to a missing column** (Suppliers `is_approved`) → remove the filter/KPI/badge/field cleanly; flag in the PR.
- **Behaviour note (put in EVERY C1 PR):** KPIs/analytics become **global** (all matching rows), not filter-reactive — consistent across the series; the Pager `total` IS filter-aware (except the in-memory cases). Page sizes standardized 10/7 → **50**.
- Update any coupled test (`transactionsService.test.ts` select-args; `SuppliersListPage.test.tsx`).

## 4. Remaining C1 — next increment (recon complete, ready)

**Employees** — `src/pages/hr/EmployeesList.tsx` (192 LOC). Inline manual fetch `from('employees').select('*, profiles!employees_user_profile_fkey(*), departments(*), positions(*)').order('created_at', desc)`, **unbounded**, **grid/card layout** (no table, no `DataTable`), client-side search (`profiles.full_name`[join] / `employee_number` / `departments.name`[join]), KPIs total/active/on_leave from the array by `employment_status`, **no stats fn, no export, no Pager**, the Filter button is a stub, **no test**. → Migrate to `useQuery`; server search (base `employee_number` + id-lookup for full_name/department, or base-only as a first cut); add `getEmployeeStats()` (count `total` + `.eq('employment_status','active')` / `'on_leave'`); debounce + reset; `<Pager>` below the grid; optionally wire a real `employment_status` filter.

**Purchase Orders** — `src/pages/suppliers/PurchaseOrdersListPage.tsx` (356 LOC). Inline manual fetch `from('purchase_orders').select('*, supplier:suppliers(name,supplier_number), status:master_purchase_order_statuses(name,color)').is('deleted_at',null).order('created_at', desc)`, **unbounded**, client filter via `useMemo` (search `po_number` + supplier name/number; status by `status_id`), renders via the shared **`DataTable`**, KPIs total/pending/approved/totalValue from the array in `calculateStats` (money via `baseAmount(o,'total_amount')` = base-currency correct; **pending/approved match hardcoded status NAMES** 'Draft'/'Ordered'/'Approved'/'Received'), export already server-side (`po_number` ilike + `status_id`), **no page test**. → Migrate to `useQuery`; server filters (`po_number` ilike + supplier id-lookup; `status_id` eq); `getPurchaseOrderStats()` (counts + PO base-sum — note pending/approved are status-NAME based, so the stats query must resolve status names → ids, or count by the relevant `status_id`s); select `total_amount_base` explicitly; `<Pager>` below the `DataTable`. Reuse `src/lib/purchaseOrderBase.ts` (`buildPoBaseColumns`) + `src/lib/financialMath.ts` (`baseAmount`).

Ship as one PR ("finish C1: Employees + Purchase Orders") or two. After this **C1 is complete**; `CasesList` / `ConfigurableDataTable` stays the original server-`.range()` reference.

## 5. Remaining tracks (the rest of the program)

- **C2 — Virtualization (Critical, not started).** Add `@tanstack/react-virtual` inside the shared `DataTable` for large page sizes / long sub-tables; migrate hand-rolled tables onto it. Pagination (C1) is the baseline bound; virtualization removes the DOM cliff. (~253 hand-rolled `<table>` blocks vs ~12 `DataTable` usages today.)
- **H1 — Detail-page compaction (High).** Shared `DetailPageHeader` (breadcrumb-aware; drop the redundant "← Back" + duplicate title); compact `Card` density (`p-4`/`space-y-4` or a `density` prop); collapse the 5-card right rail to 2-col/tabs; de-dupe preview vs side card. Targets: `InvoiceDetailPage`, `CaseDetail`, `CustomerProfilePage`. Folds in **L3** (detail container → `px-6 py-5`).
- **H2 — Merge page header into the sticky top bar (High).** Lightweight `HeaderSlotContext` (or portal target in `AppLayout` `<header>`): pages register `{actions}`; the breadcrumb already IS the title, so the separate `PageHeader` row is removed on list pages (~60px reclaimed). Keep `PageHeader` where there's no global bar. Folds in **L2** (document breadcrumb-vs-title roles in `DESIGN.md`).
- **H3 — List/Detail templates (High; depends on H2 + DataTable).** `ListPageTemplate` (top-bar actions + optional KPI row + filter bar + paginated/virtualized `DataTable`) and `DetailPageTemplate`; migrate Invoices as reference then more. Folds in **L1** (deprecate `StatsCard` → `StatCard`).
- **H4 — Data-driven sidebar nav (High/Med).** Extract `Sidebar.tsx` inline sections into a typed `navConfig` registry (section/item/icon/moduleKey/featureFlag/order), render by `map`, keep `ProtectedSidebarNavItem` + `useTenantFeatures` gating; elevate Cmd-K (`CommandPalette.tsx`) as primary fast-nav.
- **M1 — Collapsible KPI row (Med).** Per-user persisted (reuse the `user_preferences` / sidebar-prefs mechanism).
- **M2 — Responsive width (Med).** Relax `max-w-[1800px]` (~39 files) for data tables (`2xl:max-w-[2400px]` or full-width-minus-gutters); keep a readable max for forms/documents.
- **M3 — Re-render perf (Med, PARTIAL).** **Correction:** `AuthContext` value is ALREADY `useMemo`-wrapped (the audit's "not memoized" was a partial-read error) → main item done. Remaining (marginal, deferred): `React.memo` `SidebarSection`/`SidebarNavItem`; sane `staleTime` on `useSidebarBadges`. `PermissionsContext`/`TenantConfigContext` are already memoized.
- **M4 — Mega-component splits (Med).** Extract memoized line-item rows + split form state (metadata vs items) + pull tabs into files. Targets (LOC): `GeneralSettings` 1491, `CaseDetail` 1405, `CustomersListPage` ~1228 (now paginated but still large), `LeaveManagement` 1213, `CustomerProfilePage` 1189, `InvoiceFormModal` 1101. One per PR.
- **M5 — Density toggle (Med).** Global comfortable/compact toggle (persisted per user) via the table primitive.

## 6. Key corrections & learnings

- `AuthContext` is already `useMemo`-wrapped (M3) — don't "fix" it.
- C1 KPIs are intentionally GLOBAL; Pager totals are filter-aware. Flag this in each PR.
- Don't change a shared fetch fn with multiple callers — add a `*Page` variant.
- **Verify agent claims against source** — several recon "verdicts" overstate effort ("8–11 hrs / major rewrite"); the recipe is now routine (~1 page/increment).
- Reset the work branch onto fresh `main` each increment (squash-merge rewrites history).

## 7. Where the deeper detail lives

The exhaustive original audit findings (each item with Problem / Why / Fix / Evidence), the phased execution plan, and the worked per-increment plans (PR 2 / PR 3 / PR 5 / PR 6) were authored in the Claude Code **session plan file** for this project (auto-surfaced to a continuing session). This doc is the durable, self-contained summary — §1–§6 are sufficient to execute every remaining increment without that file.
