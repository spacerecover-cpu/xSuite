# Audit H2 — Merge the page header into the global top bar

**Status:** approved (brainstable decisions captured below)
**Date:** 2026-06-19
**Branch:** `claude/audit-h2-header-topbar`
**Predecessor:** H1 (`DetailPageHeader`, PR #260) — detail pages already carry their own breadcrumb-led header. H2 does the analogous compaction for **list pages**.
**Audit source:** `docs/.../audit-3` H-track. Folds in **L2** (document breadcrumb-vs-title roles in `DESIGN.md`).

---

## 1. Problem

`AppLayout`'s sticky top bar (`src/components/layout/AppLayout.tsx`, the `h-14` `<header>`) already renders a route-derived breadcrumb — `Section › PageLabel` — on every page, plus the command-palette / notifications cluster. Yet ~19 list pages **also** render a `PageHeader` row (icon chip + title + subtitle + actions) at the top of their content. The title is therefore shown **twice**, and the `PageHeader` row costs ~60px of vertical space above the table on a 13.5" screen.

Two complications the routing introduces:

1. **The bar breadcrumb is too coarse for nested routes.** `getBreadcrumbs()` keys off `segments[0]` only. So `/stock/categories`, `/stock/reports`, `/payroll/process`, `/payroll/loans`, `/settings/billing`, `/admin/tenants`, `/quotes/recycle-bin` all render as just `Section › Stock` / `Payroll` / `Settings` / `Admin Panel` / `Quotes`. If we simply delete `PageHeader`, the specific page title ("Stock Categories", "Employee Loans", "Billing", "Tenant Management", "Recycle Bin") **disappears**. The bar must therefore learn the current page's real title.
2. **The bar is space-constrained** (`h-14`, already holding mobile-menu + breadcrumb + search + notifications + stock-alerts). Page actions must coexist there.

## 2. Goals / Non-goals

**Goals**
- A lightweight mechanism for a page to register its **title** and **actions** into the AppLayout top bar.
- Migrate the **19 in-scope list pages** to register title+actions and **delete their `PageHeader` row** (drop the icon chip and subtitle — decision below).
- The bar shows the registered title (so nested-route pages keep their real title) and the registered actions, right-aligned with the existing global controls.
- Net ~60px reclaimed above the table on every migrated page. No behavior change to any action.
- Update `DESIGN.md` to document the breadcrumb-as-title contract (L2).

**Non-goals**
- Detail pages (they use H1's `DetailPageHeader`): `InvoiceDetailPage`, `CaseDetail`, `CustomerProfilePage`, and `QuoteDetailPage` (still on `PageHeader` — a **future** DetailPageHeader migration, not H2).
- Pages with **no global bar**: anything under `PlatformAdminLayout` or `PortalLayout` keeps `PageHeader`.
- `FinancialModuleHeader` — a **dormant** wrapper with **zero importers**; left untouched (optional later cleanup).
- Restyling the bar, the command palette, notifications, or the sidebar. Mobile gets a sensible default (below) but a dedicated mobile pass is out of scope.

## 3. Brainstorm decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | First-increment scope | **All 19 list pages now** (one PR; mechanism + full sweep) |
| 2 | How actions sit in the bar | **Actions as-is in the bar** — register the page's existing actions node; it sits right-aligned with the global cluster and wraps/condenses responsively |
| 3 | PageHeader icon + subtitle | **Drop both** — the bar breadcrumb is the title; these list subtitles are low-value |

## 4. Design

### 4.1 Mechanism — `HeaderSlotContext` (title as state + actions as portal)

A new context owns the per-route header slot. **Title travels as context state; actions travel through a portal** into a host node the bar renders. This split is deliberate:
- The **title** is a plain string the breadcrumb logic needs, it changes only on navigation, and a `useLayoutEffect` keyed on the string can't loop.
- The **actions** are a live `React.ReactNode` that can change *without* navigation (e.g. InvoicesListPage's selection-driven bulk actions, PayrollSettings' save button toggling `disabled`). A portal keeps them live every render with zero risk of the set-state → re-render → set-state loop you'd get from storing a fresh node in context state each render.

`src/contexts/HeaderSlotContext.tsx`
```tsx
interface HeaderSlotContextValue {
  title: string | undefined;
  setTitle: (t: string | undefined) => void;
  actionsHost: HTMLElement | null;          // the bar's actions container
  setActionsHost: (el: HTMLElement | null) => void;
}
```
- `HeaderSlotProvider` holds `title` and `actionsHost` state; placed in `AppLayout` so the bar and the `<Outlet/>` pages share it.
- `usePageHeaderSlot({ title, actions })`:
  - `useLayoutEffect(() => { setTitle(title); return () => setTitle(undefined); }, [title])` — pre-paint, so no flash; clears on unmount.
  - returns `actionsHost ? createPortal(actions, actionsHost) : null` — live every render; dynamic actions stay current.
- Declarative wrapper `src/components/layout/PageHeaderSlot.tsx`:
  ```tsx
  export const PageHeaderSlot: React.FC<{ title: string; actions?: React.ReactNode }> =
    ({ title, actions }) => usePageHeaderSlot({ title, actions });
  ```
  Pages render `<PageHeaderSlot title="Stock Categories" actions={<>…</>} />` where the old `PageHeader` was. It returns the actions portal (or null); the title is registered via the effect.

**Backward compatibility (the critical invariant):** a page that never calls `usePageHeaderSlot` leaves `title === undefined` (bar falls back to the route label) and portals nothing (empty host). Unmigrated, detail, and portal/platform pages render exactly as today.

### 4.2 AppLayout bar changes

- Wrap the layout in `<HeaderSlotProvider>` (inside `SidebarPreferencesProvider`).
- The bar consumes the context:
  - **Title:** render `title ?? routeLabel` as the current crumb (keep the existing `Section ›` prefix from `sectionLabels[firstSegment]`). So `/stock/categories` with a registered title shows `Resources › Stock Categories`; unmigrated/detail routes still show the route label (backward compatible).
  - **Actions host:** render `<div ref={setActionsHost} className="hidden md:flex items-center gap-2" />` in the right cluster, **before** the existing search/notifications group, with a divider that only shows when actions are present (e.g. `empty:hidden` on the host + a sibling divider, or render the divider inside the host). Pages portal their actions into this host; buttons should be `size="sm"` to fit `h-14`.
- **Mobile default:** the actions container is `hidden md:flex` (the bar is too tight on phones, and the search button is already `hidden md:inline-flex`). Migrated pages keep working on mobile because the action handlers still exist — but to avoid losing mobile access to primary actions, **the page keeps rendering its actions in-content on mobile only** is *out of scope*; instead, for H2, actions are desktop-bar-only and we accept that the 13.5"+ target (the audit's context) is covered. Any page where this is unacceptable is flagged for a follow-up. (Documented as a known limitation.)

### 4.3 Per-page migration (the 19)

For each in-scope page, replace:
```tsx
<PageHeader title="X" description="…" icon={SomeIcon} actions={<>…</>} />
```
with:
```tsx
<PageHeaderSlot title="X" actions={<>…</>} />
```
- **Drop** `description` and `icon` (decision 3). Remove the now-unused Lucide icon import if it's not used elsewhere in the file.
- **Move the `actions` node verbatim** (decision 2) — same buttons, same handlers, same conditionals.
- Remove the `PageHeader` import if no longer used.
- The page's outer content wrapper stays; only the header row is replaced by the (null-rendering) slot. Reclaim the `mb-4` the row occupied.

**Filter/toolbar caveat.** A few pages pass page-level **filters / view-toggles** in (or beside) the `PageHeader` actions (e.g. StockListPage view-mode + filters, StockSalesPage filters, PayrollHistoryPage year/status filters, PlansPage billing-interval toggle). Rule: **only header *actions* (buttons that act on the page — Create/Add/Export/Save) move to the bar.** Page-level **filters/toggles that belong with the data stay in a slim in-content toolbar** (do not push filters into the global bar). If a page's `actions` prop mixes both, split them: actions → bar, filters → a `mb-3` toolbar row above the table. Implementers flag any ambiguous case rather than guess.

### 4.4 In-scope file inventory (19)

**Stock (6):** `StockListPage`, `StockCategoriesPage`, `StockSalesPage`, `StockAdjustmentsPage`, `StockReportsPage`, `StockLocationsPage`
**Payroll (6):** `ProcessPayrollPage`, `SalaryComponentsPage`, `PayrollHistoryPage`, `PayrollAdjustmentsPage`, `EmployeeLoansPage`, `PayrollSettingsPage`
**Settings (3):** `BillingPage`, `PlansPage`, `ImportExport`
**Financial / Suppliers / Admin / Quotes (4):** `InvoicesListPage`, `PurchaseOrdersListPage`, `TenantManagement` (`/admin/tenants`), `QuotesRecycleBin`

**Out of scope (keep PageHeader):** `QuoteDetailPage` (detail). **Dormant:** `FinancialModuleHeader`.

### 4.5 DESIGN.md (L2)

Add a short "Page header & breadcrumb roles" note: the AppLayout top bar owns the page title (as the breadcrumb's current crumb) and primary actions for list pages; detail pages use `DetailPageHeader`; `PageHeader` remains only for non-AppLayout shells. Record the `usePageHeaderSlot` contract.

## 5. Testing

- **Unit (new):** `HeaderSlotContext` — provider + `usePageHeaderSlot` set/clear; `PageHeaderSlot` registers title+actions and renders null. A small AppLayout-bar test (or a focused harness) asserting the bar shows a registered title over the route label and renders registered actions.
- **Regression:** every migrated page's existing test suite must stay green. `npm run typecheck` 0, `npx vitest run` green, `eslint` 0 errors on touched files.
- **Manual:** on a nested route (e.g. `/stock/categories`, `/payroll/loans`, `/settings/billing`) confirm the bar shows the specific title and the page's primary action works from the bar; confirm no double title; confirm ~60px reclaimed.

## 6. Risks

- **Shared AppLayout blast radius.** Every page renders through it. The provider + bar changes must be backward-compatible: unmigrated/detail/portal pages (which never call `usePageHeaderSlot`) must render exactly as today (slot empty → route label, no actions). This is the single most important invariant; the mechanism is built and reviewed first, in isolation, before any page is migrated.
- **Title flash on navigation.** Mitigated by `useLayoutEffect` registration + route-label fallback.
- **Mobile crowding.** Actions are `hidden md:flex` in the bar (documented limitation; desktop-first per audit).
- **RTL.** The bar already handles RTL; the actions container uses logical spacing and must be verified under `dir="rtl"`.
- **Filter mis-placement.** The §4.3 caveat prevents shoving filters into the global bar.

## 7. Rollout (subagent-driven)

1. **Foundation (TDD, reviewed in isolation):** `HeaderSlotContext` + `usePageHeaderSlot` + `PageHeaderSlot` + AppLayout wiring (provider + bar reads title/actions) + unit tests. Prove backward-compatibility (empty slot = today's bar).
2. **Migrate the 19 in 4 domain batches** (parallelizable, each reviewed): Stock(6), Payroll(6), Settings(3), Financial/Suppliers/Admin/Quotes(4).
3. **DESIGN.md** L2 note.
4. **Final gate** (typecheck/eslint/vitest) + whole-diff review + PR.
