# Audit 3 — H3: List / Detail Page Templates · Design Spec

> **Increment:** H3 (High) of the Audit 3 Enterprise-Density & Scalability program.
> **Dependency:** H2 (`HeaderSlot`) + the C1/H1 primitives — all shipped. H3 is **composition of primitives already built**, not new infrastructure.
> **Constraint:** frontend-only, no DB migrations. Semantic tokens only (DM Sans, no raw hex / brand Tailwind / purple-indigo-violet). Backward-compatible — adoption is opt-in per page; non-adopters are untouched.
> _Date: 2026-06-19. Branch: `claude/audit-h3-list-detail-templates`._

## 1. Context & problem

Every xSuite list and detail page hand-assembles the same chrome. The recon (5 readers over the shipped primitives + the Invoices reference pair + 4 detail pages, verified against live code) found four concrete, drift-prone duplications:

1. **Container-gutter drift.** Detail pages each re-declare `px-6 py-5 max-w-[1800px] mx-auto` (Invoice/Case/Customer) — and `SupplierProfilePage` is *missing* it. No single owner.
2. **Four divergent loading skeletons** and **four divergent not-found states** across detail pages — same intent, different pixels.
3. **The C1 list recipe copy-pasted across all 19 `PageHeaderSlot` list pages**: zero-indexed page state + a 300 ms search debounce + the easy-to-forget *page-reset-on-filter-change* effect (`InvoicesListPage:108`) + the `{rows,total}` TanStack query with `keepPreviousData`. **Verified: there is no `useDebounce` hook in `src/hooks` today** — this is genuinely un-extracted duplication.
4. **Two competing KPI cards** — the modern `StatCard` (7 call sites) and legacy `StatsCard` (12 call sites, L1 deprecation target) — with incompatible prop shapes.

**Hard constraints.** Do **not** build a config monolith (the handoff's explicit anti-pattern). Do **not** force a rewrite of mega-components (`CaseDetail` ~1405 LOC, `CustomerProfilePage` ~1189 LOC). **Compose** the existing primitives (`DetailPageHeader`, `StatCard`, `PageHeaderSlot`/`usePageHeaderSlot`, `Pager`, `VirtualizedTableBody`) — do not redesign their visuals; H1/H2 already shipped the look.

## 2. Decision

Adopt the **Hybrid**: two thin `ReactNode`-slot **shells** (`ListPageTemplate`, `DetailPageTemplate`) **plus** one opt-in data-plumbing **hook** (`useListPage`) and one tiny KPI wrapper (`KpiRow`).

- **Rejected — pure thin-slots:** refuses to own the data plumbing, leaving ~150 lines of pagination/debounce/page-reset boilerplate per page. Under-abstraction; the biggest missed win.
- **Rejected — config object:** must model columns/filters/actions/modals as data. The recon *proved* cells/actions/modals are irreducibly domain-specific (9 vs 12 columns, 7 conditional actions, conversion-linkage buttons). This is the config-monolith anti-pattern the handoff names.
- **Hybrid wins** by extracting the duplication that *is* uniform (the hook) and slotting the variation that is *not* (the JSX).

## 3. Architecture & governing rules

**The contract:** the template owns the *frame* and **never sees data**; the hook owns *data plumbing* and **never renders chrome**. They are decoupled — a weird page can drop either one without being stranded.

Two rules grafted from the runner-up proposals govern review:

- **Slot-first guardrail.** Config may declare *which* regions exist (a `kpis` slot, a `toolbar` slot); it may **never** declare *what* renders inside a `<td>`, a modal, or an action. The moment a prop describes a column, a filter control, or a row cell, it is rejected.
- **Single-ReactNode + prop-cap rule.** Every non-scaffold region is a single `ReactNode`, never a structured object; both shells stay under a hard prop count so neither drifts into a wide-prop monolith.

## 4. `ListPageTemplate` API

`src/components/templates/ListPageTemplate.tsx` — thin shell, `ReactNode` slots only, **no registry**.

```ts
export interface PagerSlotProps {
  page: number; pageSize: number; total: number;
  onPageChange: (page: number) => void; itemNoun?: string;
}
export interface ListPageTemplateProps {
  title: string;             // portaled to the top bar via PageHeaderSlot (required)
  headerActions?: ReactNode; // Export / Create — pure slot
  kpis?: ReactNode;          // <KpiRow stats={…}/> or raw <StatCard/>s
  toolbar?: ReactNode;       // filter/search bar card — page-owned JSX
  table: ReactNode;          // page owns <table>/<thead>/<tbody> — NO column registry
  pager?: PagerSlotProps;    // spread useListPage().pagerProps + itemNoun; omit to hide
  empty?: ReactNode;         // shown in place of the table when isEmpty
  loading?: boolean;         // true => standardized ListPageSkeleton
  isEmpty?: boolean;         // true => render `empty` instead of the table card
  footer?: ReactNode;        // BulkActionsBar — rendered OUTSIDE the card
  children?: ReactNode;      // modals / deep-link effects — page-owned, NO modal registry
  loadingFallback?: ReactNode; // escape hatch: bespoke skeleton
  unstyledBody?: boolean;      // escape hatch: skip the white table-card wrapper
}
```

**Owns:** the `px-6 py-5 max-w-[1800px] mx-auto` container, `PageHeaderSlot` wiring (title → top bar, actions → portaled host), the white table-card chrome, the `Pager` footer, and the standardized list skeleton/empty swap. **Escape hatches:** `loadingFallback`, `unstyledBody`.

## 5. `useListPage` API + hard scope cap

`src/hooks/useListPage.ts` — the C1 recipe extraction (this is where the verified boilerplate dies).

```ts
export interface UseListPageConfig<TRow, TFilters extends object> {
  queryKey: readonly unknown[];                 // stable base, e.g. ['invoices']
  filters: TFilters;                            // page-owned; identity is part of the key
  fetchPage: (a: TFilters & { search: string; page: number; pageSize: number })
    => Promise<{ rows: TRow[]; total: number }>;
  pageSize?: number;   // default 50
  debounceMs?: number; // default 300
  staleTime?: number;  // default 30_000
}
export interface UseListPageResult<TRow> {
  page: number; setPage: (p: number) => void;
  search: string; setSearch: (s: string) => void; debouncedSearch: string;
  rows: TRow[]; total: number; isLoading: boolean; isEmpty: boolean; pageSize: number;
  pagerProps: Omit<PagerSlotProps, 'itemNoun'>; // ready to spread
}
```

**Owns exactly four concerns:** (1) zero-indexed `page` state; (2) `debounce(search, debounceMs) → debouncedSearch`; (3) a `useEffect` that resets `page = 0` when **filters identity OR `debouncedSearch`** changes; (4) `useQuery({ queryKey: [...queryKey, filters, debouncedSearch, page], queryFn, staleTime, refetchOnWindowFocus: false, placeholderData: keepPreviousData })`.

**Hard non-goals (must stay OUT — review-enforced):** bulk selection (`useBulkSelection`), URL-sync, sorting, query invalidation. If the hook grows past the four concerns it becomes the config monolith wearing a hook's clothes — that is the single biggest risk and the spec's scope cap is the mitigation.

## 6. `KpiRow` + the L1 fold

`src/components/templates/KpiRow.tsx` — the single sanctioned KPI path.

```ts
export interface KpiSpec { label: string; value: string | number; sub?: string; tone?: StatCardTone; loading?: boolean; }
export interface KpiRowProps { stats: KpiSpec[]; cols?: string; } // default 'grid-cols-2 lg:grid-cols-4'
// renders <div className={cn('grid gap-3 mb-4', cols)} role="region" aria-label="summary">
//   {stats.map(s => <StatCard key={s.label} {...s}/>)}</div>
```

**L1 by construction:** `KpiSpec` *is* the `StatCard` contract (`tone/label/value/sub/loading`) with **no required icon and no trend** — the two things only legacy `StatsCard` has. A page that fills the `kpis` slot with `<KpiRow>` is **type-incapable** of wiring `StatsCard`/`FinancialStatsCard` through the template. Deprecation becomes a default, not a codemod.

The remaining 12 `StatsCard` call sites are retired during the sweep (§11) using the existing `FinancialStatsCard` colour→tone map (`blue→info, green→success, orange|amber→warning, red→danger, slate→neutral, purple→cat-7, teal→cat-2`; drop icon, drop trend). `FinancialStatsCard` (the shim) is deleted once its callers move.

## 7. `DetailPageTemplate` API

`src/components/templates/DetailPageTemplate.tsx` — thin shell, single `children` body.

```ts
export interface DetailPageTemplateProps {
  header: DetailPageHeaderProps;     // template renders <DetailPageHeader {...header}/>
  alerts?: ReactNode;                // rendered in a `space-y-2 empty:hidden mb-4` zone
  children: ReactNode;               // the ENTIRE body — page composes its own grid/rail/tabs
  loading?: boolean; notFound?: boolean;
  loadingFallback?: ReactNode; notFoundFallback?: ReactNode;
  backTo?: { to: string; label: string }; // default not-found back-button target
  outside?: ReactNode;               // escape hatch: render OUTSIDE the padded container
}
// Render order: {outside} → if loading: skeleton → if notFound: not-found →
//   <div className="px-6 py-5 max-w-[1800px] mx-auto"> <DetailPageHeader/> {alerts} {children} </div>
```

**Why the `outside` slot exists (the one genuine migration footgun):** verified at `InvoiceDetailPage:259`, the A4 print `<style>` block and the 4 modals render **outside** the padded container today. They must render at root or print layout breaks — so they go in `outside`, which renders even during `loading`/`notFound`.

**Owns:** the container, `DetailPageHeader` render, the alert zone, and standardized `DetailPageSkeleton` / `DetailPageNotFound` defaults (replacing the 4 divergent hand-rolled versions). **Opt-in sugar:** `DetailSidebarCard` (`title`, optional `icon`, `children` → `<Card p-4>` with an icon+`h3` header) — earns its keep at the 3 sidebar call sites on `InvoiceDetailPage`.

**Mega-component adoption (later, near-zero diff):** `CaseDetail` / `CustomerProfilePage` pass `header` + `loading` + `notFound` + dump their existing 14-tab / 2-col body into `children` untouched. The template never inspects `children`, so a forced rewrite is structurally impossible.

## 8. Reference migration (PR #1)

- **`InvoicesListPage`** — lines 70–127 collapse to one `useListPage` call; `return` wraps in `ListPageTemplate`; KPIs → `KpiRow`; the filter-bar JSX (354–492) and the 9-column table (508–764) lift **verbatim** into new presentational children `InvoicesFilterBar` + `InvoicesTable` in `src/components/financial/`; modals, bulk handlers, `ExportButton` unchanged.
- **`InvoiceDetailPage`** — wrap in `DetailPageTemplate`; header block → `header` prop; loading/not-found → props + `backTo`; print `<style>` + 4 modals → `outside`; the 3-col body verbatim into `children`; sidebar cards → `DetailSidebarCard`.

## 9. File inventory & PR #1 scope

**Create — components:** `src/components/templates/{ListPageTemplate,KpiRow,DetailPageTemplate,DetailSidebarCard,DetailPageSkeleton,DetailPageNotFound,ListPageSkeleton}.tsx`; `src/hooks/useListPage.ts`; `src/components/financial/{InvoicesFilterBar,InvoicesTable}.tsx`.
**Create — tests (6, each written first):** `ListPageTemplate.test.tsx`, `KpiRow.test.tsx`, `DetailPageTemplate.test.tsx`, `DetailSidebarCard.test.tsx` (co-located in `templates/`), `src/hooks/useListPage.test.tsx`, `src/pages/financial/InvoicesListPage.test.tsx`. The three standardized defaults (`DetailPageSkeleton`, `DetailPageNotFound`, `ListPageSkeleton`) are covered indirectly via the template tests, so they get no own test file.
**Create — doc:** this spec.
**Modify:** `src/pages/financial/InvoicesListPage.tsx`, `src/pages/financial/InvoiceDetailPage.tsx`.

**Ships in PR #1:** the 4 primitives + 3 standardized defaults (each TDD-first) + the Invoices list **and** detail reference migration + the L1 fold proven on the Invoices KPI row.

**Deferred to later PRs (the sweep):** migrating the other ~18 list + ~3 detail pages; retiring the 12 `StatsCard` call sites + deleting `FinancialStatsCard`; `SupplierProfilePage` `DetailPageHeader` adoption; `CaseDetail`/`CustomerProfilePage` shell adoption. **We do NOT do the 19-page sweep in PR #1** — it would balloon the diff and mix mechanical-migration risk with foundation-design risk. PR #1 proves the API on the hardest reference pair.

## 10. Test plan (TDD)

All vitest + `@testing-library/react`, matching the H1/H2 pattern (`render`/`screen`, className assertions, no snapshots). Each test file is written **before** its component.

1. **`useListPage.test.tsx`** — `QueryClientProvider` + fake timers: `debouncedSearch` settles only after 300 ms; `setPage` works; page resets to 0 on filter-value change and on `debouncedSearch` change; query key = `[...base, filters, debouncedSearch, page]`; `isEmpty` false while loading, true when `!loading && rows.length===0`; `pagerProps` shape.
2. **`ListPageTemplate.test.tsx`** — `HeaderSlotProvider` + `MemoryRouter`: title registered to the slot; kpis/toolbar/table/footer/children sentinels render; `loading` → skeleton, not table; `isEmpty` → empty slot; pager present iff props passed; `loadingFallback`/`unstyledBody` honored.
3. **`KpiRow.test.tsx`** — one `StatCard` per stat; default + override `cols`; `role=region`; tone/sub/loading forwarded.
4. **`DetailPageTemplate.test.tsx`** — `MemoryRouter`: header breadcrumbs/badges/actions/meta render; children render; alerts wrapper uses `space-y-2 empty:hidden`; `loading` → skeleton; `notFound` → not-found with `backTo` link; `outside` renders even during loading/notFound; fallbacks override defaults.
5. **`DetailSidebarCard.test.tsx`** — title `h3`, optional icon, children, `p-4` Card.
6. **`InvoicesListPage.test.tsx`** (smoke) — mock `useListPage`/`fetchInvoicesPage` + `getInvoiceStats`: KPIs from stats; empty-state filtered-vs-empty message branch; table rows when present; Create opens modal.

Gate: whole suite green (baseline 157 files / 1295 passed / 2 skipped, +the new files) and `tsc` 0 errors.

## 11. Rollout / sweep plan (post-PR-#1)

One module-cluster per PR, low-risk and parallelizable: financial → quotes → stock → suppliers → payroll → admin/platform-admin list pages onto `ListPageTemplate` + `useListPage`; detail pages onto `DetailPageTemplate`; retire `StatsCard` → `KpiRow`/`StatCard` per cluster; adopt `DetailPageHeader` on `SupplierProfilePage`; shell-adopt `CaseDetail`/`CustomerProfilePage`; **delete `FinancialStatsCard`** once its callers move. A targeted list-page-variation survey (the recon reader that failed to emit structured output) is run at sweep-planning time to confirm no page is a poor fit.

## 12. Risks & mitigations

1. **`useListPage` god-hook creep** → spec scope cap (§5) + review enforcement. **First-class risk.**
2. **Detail print regression** → the A4 `<style>` + modals MUST render via `outside`; the test asserts `outside` renders during loading/notFound. (Verified `InvoiceDetailPage:259`.)
3. **Prop-drilling into `InvoicesFilterBar`/`InvoicesTable`** → mechanical, but watch select-all indeterminate + overdue/selected row highlight; page smoke test + careful diff review.
4. **Search rewiring** → the page-reset effect must fire on the same deps (status/type/`debouncedSearch`) the page owned before; a missed dep silently breaks pagination reset.
5. **Skeleton pixel swap** → standardized skeletons replace 4 bespoke ones; flag in the PR so it isn't read as a regression.
6. **Two-tool learning curve / helper-zoo creep** → spec states "template never fetches, hook never renders chrome"; "3+ real call sites before a primitive ships."
7. **`HeaderSlotProvider` dependency** → `ListPageTemplate` renders `PageHeaderSlot`, which requires the provider; non-AppLayout usage (rare) documented.

## 13. Decisions (resolved with the user, 2026-06-19)

- **Approach + PR #1 scope:** Hybrid, **approved as scoped** — both templates + `useListPage` + `KpiRow` + skeletons/not-found, migrate Invoices list **and** detail; sweep + StatsCard retirement deferred.
- **DetailPageTemplate timing:** ships in PR #1 alongside `ListPageTemplate` (independent files; the detail migration is the lower-risk half).
- **Hook vs copy-paste:** **hook** (`useListPage`) — verified un-extracted duplication across 19 pages.
- **First-PR page scope:** **Invoices only** — the richest reference; generalize in the sweep.
- **Component location:** `src/components/financial/` — matches the one-dir-per-domain convention.

## Appendix A — Verified ground-truth references

`DetailPageHeader.tsx` (gutter-neutral `mb-4`, final crumb = `h1`); `StatCard.tsx` (tone system, `p-3`); `PageHeader.tsx` (icon-chip toolbar, AppLayout-less shells only); `PageHeaderSlot.tsx` + `HeaderSlotContext.tsx` (title via `useLayoutEffect`, actions portaled); `Pager.tsx` (zero-indexed, `itemNoun`); `VirtualizedTableBody.tsx` (threshold 100); `FinancialStatsCard.tsx` (deprecated colour→tone shim); legacy `StatsCard` (12 call sites). Reference pages: `InvoicesListPage.tsx:70–127` (C1 recipe), `:354–492` (filter bar), `:508–764` (table); `InvoiceDetailPage.tsx:259` (print `<style>` outside container).
