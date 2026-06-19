# Audit 3 — H3 List/Detail Page Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the H3 foundation — `ListPageTemplate`, `DetailPageTemplate`, `useListPage`, `KpiRow` (+ standardized skeletons/not-found) — and migrate the Invoices list + detail pages onto them as the proof reference.

**Architecture:** Hybrid — two thin `ReactNode`-slot shells own only the drift-prone frame (container gutter, `PageHeaderSlot`/`DetailPageHeader` wiring, table-card + `Pager`, standardized loading/empty/not-found). One opt-in `useListPage` hook owns the C1 data plumbing (page state + 300 ms debounce + page-reset-on-filter + `{rows,total}` query). `KpiRow` is the single sanctioned KPI path (its `KpiSpec` shape = `StatCard`'s, making legacy `StatsCard` unreachable). Templates never see data; the hook never renders chrome. Spec: `docs/superpowers/specs/2026-06-19-audit-h3-list-detail-templates-design.md`.

**Tech Stack:** React 18 + TypeScript, TanStack Query v5 (`keepPreviousData`), Tailwind semantic tokens, vitest + `@testing-library/react` (render/screen + `renderHook`, className assertions, no snapshots).

**Conventions:** semantic tokens only (no raw hex/brand-Tailwind/purple-indigo-violet). New components live in `src/components/templates/`; Invoices presentational children in `src/components/financial/`. Each component is preceded by its test (TDD). Verify peripheral imports (`Button`, `Card`, `EmptyState`, `Skeleton`, `cn`) against the live tree before writing — confirmed so far: `cn` = `src/lib/utils`, `Skeleton` = `src/components/ui/Skeleton`, `Button` = `src/components/ui/Button`, `StatCard`/`StatCardTone` = `src/components/shared/StatCard`, `DetailPageHeader`/`DetailPageHeaderProps`/`Crumb` = `src/components/shared/DetailPageHeader`, `Pager` = `src/components/ui/Pager`, `PageHeaderSlot` = `src/components/layout/PageHeaderSlot`, `HeaderSlotProvider` = `src/contexts/HeaderSlotContext`.

**Gates (run after Task 11):** `npm run typecheck` → 0 · `npx eslint <touched files>` → 0 errors (pre-existing `no-untranslated-jsx-text` warnings acceptable) · `npx vitest run` → green (baseline 157 files / 1295 passed / 2 skipped + the new files).

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/hooks/useListPage.ts` | C1 data-plumbing hook (the four duplicated concerns only) |
| `src/components/templates/KpiRow.tsx` | `KpiSpec[]` → `StatCard` grid; the L1 fold point |
| `src/components/templates/ListPageSkeleton.tsx` | Standard list loading skeleton |
| `src/components/templates/ListPageTemplate.tsx` | Thin list shell (container + header slot + table-card + pager + skeleton/empty) |
| `src/components/templates/DetailPageSkeleton.tsx` | Standard detail loading skeleton |
| `src/components/templates/DetailPageNotFound.tsx` | Standard detail not-found |
| `src/components/templates/DetailSidebarCard.tsx` | Opt-in `Card + icon + h3` sidebar sugar |
| `src/components/templates/DetailPageTemplate.tsx` | Thin detail shell (container + DetailPageHeader + alerts + body + outside) |
| `src/components/financial/InvoicesFilterBar.tsx` | Invoices filter-bar JSX lifted verbatim |
| `src/components/financial/InvoicesTable.tsx` | Invoices 9-col table JSX lifted verbatim |
| `src/pages/financial/InvoicesListPage.tsx` | MODIFY — compose `ListPageTemplate` + `useListPage` + `KpiRow` |
| `src/pages/financial/InvoiceDetailPage.tsx` | MODIFY — compose `DetailPageTemplate` |

---

## Task 1: `useListPage` hook

**Files:**
- Create: `src/hooks/useListPage.ts`
- Test: `src/hooks/useListPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/useListPage.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useListPage } from './useListPage';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const baseConfig = (overrides = {}) => ({
  queryKey: ['things'] as const,
  filters: { status: 'all' as string },
  fetchPage: vi.fn(async () => ({ rows: [{ id: '1' }], total: 1 })),
  ...overrides,
});

describe('useListPage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces search by 300ms before updating debouncedSearch', async () => {
    const { result } = renderHook(() => useListPage(baseConfig()), { wrapper: wrapper() });
    act(() => result.current.setSearch('abc'));
    expect(result.current.debouncedSearch).toBe('');
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(result.current.debouncedSearch).toBe('');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.debouncedSearch).toBe('abc');
  });

  it('resets page to 0 when the debounced search changes', async () => {
    const { result } = renderHook(() => useListPage(baseConfig()), { wrapper: wrapper() });
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);
    act(() => result.current.setSearch('x'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.page).toBe(0);
  });

  it('resets page to 0 when filters identity changes', async () => {
    const { result, rerender } = renderHook(
      ({ status }) => useListPage(baseConfig({ filters: { status } })),
      { wrapper: wrapper(), initialProps: { status: 'all' } },
    );
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    rerender({ status: 'paid' });
    expect(result.current.page).toBe(0);
  });

  it('passes filters + search + page + pageSize to fetchPage and exposes rows/total', async () => {
    const fetchPage = vi.fn(async () => ({ rows: [{ id: 'a' }, { id: 'b' }], total: 7 }));
    const { result } = renderHook(() => useListPage(baseConfig({ fetchPage })), { wrapper: wrapper() });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await waitFor(() => expect(result.current.rows.length).toBe(2));
    expect(result.current.total).toBe(7);
    expect(fetchPage).toHaveBeenCalledWith({ status: 'all', search: '', page: 0, pageSize: 50 });
    expect(result.current.pagerProps).toMatchObject({ page: 0, pageSize: 50, total: 7 });
    expect(typeof result.current.pagerProps.onPageChange).toBe('function');
  });

  it('isEmpty is false while loading and true when loaded with no rows', async () => {
    const fetchPage = vi.fn(async () => ({ rows: [], total: 0 }));
    const { result } = renderHook(() => useListPage(baseConfig({ fetchPage })), { wrapper: wrapper() });
    expect(result.current.isEmpty).toBe(false); // loading
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEmpty).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useListPage.test.tsx`
Expected: FAIL — `useListPage` not found / no export.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/useListPage.ts
import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

export interface PagerSlotProps {
  /** Zero-based page index. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  itemNoun?: string;
}

export interface UseListPageConfig<TRow, TFilters extends object> {
  /** Stable base key, e.g. ['invoices']. */
  queryKey: readonly unknown[];
  /** Page-owned filter values; their identity is part of the query key + reset trigger. */
  filters: TFilters;
  fetchPage: (
    args: TFilters & { search: string; page: number; pageSize: number },
  ) => Promise<{ rows: TRow[]; total: number }>;
  pageSize?: number;
  debounceMs?: number;
  staleTime?: number;
}

export interface UseListPageResult<TRow> {
  page: number;
  setPage: (p: number) => void;
  search: string;
  setSearch: (s: string) => void;
  debouncedSearch: string;
  rows: TRow[];
  total: number;
  isLoading: boolean;
  isEmpty: boolean;
  pageSize: number;
  pagerProps: Omit<PagerSlotProps, 'itemNoun'>;
}

/**
 * The C1 list recipe extracted once: zero-indexed page state, a debounced search
 * term, page-reset-on-filter/search-change, and the {rows,total} paged query with
 * keepPreviousData. Owns ONLY these four concerns — selection, URL-sync, sorting,
 * and invalidation deliberately stay out (see the H3 spec's hard scope cap).
 */
export function useListPage<TRow, TFilters extends object>(
  config: UseListPageConfig<TRow, TFilters>,
): UseListPageResult<TRow> {
  const { queryKey, filters, fetchPage, pageSize = 50, debounceMs = 300, staleTime = 30_000 } = config;

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), debounceMs);
    return () => clearTimeout(t);
  }, [search, debounceMs]);

  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    setPage(0);
  }, [filtersKey, debouncedSearch]);

  const query = useQuery({
    queryKey: [...queryKey, filters, debouncedSearch, page],
    queryFn: () => fetchPage({ ...filters, search: debouncedSearch, page, pageSize }),
    staleTime,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const isLoading = query.isLoading;

  return {
    page,
    setPage,
    search,
    setSearch,
    debouncedSearch,
    rows,
    total,
    isLoading,
    isEmpty: !isLoading && rows.length === 0,
    pageSize,
    pagerProps: { page, pageSize, total, onPageChange: setPage },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useListPage.test.tsx`
Expected: PASS (5 tests). If the filters-change reset test flakes because of mount-effect ordering, confirm the reset effect depends on `[filtersKey, debouncedSearch]` and that `filtersKey` recomputes per render.

- [ ] **Step 5: Commit** — `git add src/hooks/useListPage.ts src/hooks/useListPage.test.tsx && git commit -m "feat(h3): useListPage hook — extract the C1 list recipe"`

---

## Task 2: `KpiRow`

**Files:**
- Create: `src/components/templates/KpiRow.tsx`
- Test: `src/components/templates/KpiRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/templates/KpiRow.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiRow } from './KpiRow';

const stats = [
  { tone: 'info' as const, label: 'Total', value: '10' },
  { tone: 'success' as const, label: 'Paid', value: '4', sub: '4 paid' },
];

describe('KpiRow', () => {
  it('renders one StatCard per stat with label/value/sub', () => {
    render(<KpiRow stats={stats} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('4 paid')).toBeInTheDocument();
  });

  it('is a labelled summary region with the default grid columns', () => {
    const { container } = render(<KpiRow stats={stats} />);
    const region = screen.getByRole('region', { name: 'summary' });
    expect(region).toBe(container.firstChild);
    expect((region as HTMLElement).className).toContain('grid-cols-2');
    expect((region as HTMLElement).className).toContain('lg:grid-cols-4');
  });

  it('honors a cols override', () => {
    const { container } = render(<KpiRow stats={stats} cols="grid-cols-3" />);
    expect((container.firstChild as HTMLElement).className).toContain('grid-cols-3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/templates/KpiRow.test.tsx` → FAIL (no `KpiRow`).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/templates/KpiRow.tsx
import React from 'react';
import { cn } from '../../lib/utils';
import { StatCard, type StatCardTone } from '../shared/StatCard';

export interface KpiSpec {
  label: string;
  value: string | number;
  sub?: string;
  tone?: StatCardTone;
  loading?: boolean;
}

export interface KpiRowProps {
  stats: KpiSpec[];
  /** Tailwind grid-cols utility; defaults to a 2-up/4-up responsive grid. */
  cols?: string;
}

/**
 * The single sanctioned KPI path. Maps KpiSpec[] → <StatCard/> grid. KpiSpec is
 * deliberately StatCard's contract (tone/label/value/sub) with no required icon
 * and no trend — so legacy StatsCard is structurally unreachable through the
 * templates (the H3 → L1 fold).
 */
export const KpiRow: React.FC<KpiRowProps> = ({ stats, cols = 'grid-cols-2 lg:grid-cols-4' }) => (
  <div className={cn('grid gap-3 mb-4', cols)} role="region" aria-label="summary">
    {stats.map((s) => (
      <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} tone={s.tone} loading={s.loading} />
    ))}
  </div>
);
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/components/templates/KpiRow.test.tsx` → PASS (3 tests).

- [ ] **Step 5: Commit** — `git add src/components/templates/KpiRow.tsx src/components/templates/KpiRow.test.tsx && git commit -m "feat(h3): KpiRow — single sanctioned KPI path (folds in L1)"`

---

## Task 3: `ListPageSkeleton`

**Files:** Create `src/components/templates/ListPageSkeleton.tsx` (no own test — exercised via `ListPageTemplate`).

- [ ] **Step 1: Implement** (verify `Skeleton` import path is `../ui/Skeleton`)

```tsx
// src/components/templates/ListPageSkeleton.tsx
import React from 'react';
import { Skeleton } from '../ui/Skeleton';

/** Standard list loading frame: KPI row + toolbar strip + 8 table rows. */
export const ListPageSkeleton: React.FC = () => (
  <div aria-busy="true" aria-label="Loading" className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
    </div>
    <Skeleton className="h-12 rounded-lg" />
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 m-0 rounded-none" />)}
    </div>
  </div>
);
```

- [ ] **Step 2: Commit** — `git add src/components/templates/ListPageSkeleton.tsx && git commit -m "feat(h3): ListPageSkeleton default"`

---

## Task 4: `ListPageTemplate`

**Files:**
- Create: `src/components/templates/ListPageTemplate.tsx`
- Test: `src/components/templates/ListPageTemplate.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/templates/ListPageTemplate.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';
import { ListPageTemplate } from './ListPageTemplate';

function renderTemplate(ui: React.ReactNode) {
  return render(
    <MemoryRouter><HeaderSlotProvider>{ui}</HeaderSlotProvider></MemoryRouter>,
  );
}

describe('ListPageTemplate', () => {
  it('renders the kpis, toolbar, table, footer and children slots', () => {
    renderTemplate(
      <ListPageTemplate
        title="Invoices"
        kpis={<div>KPIS</div>}
        toolbar={<div>TOOLBAR</div>}
        table={<div>TABLE</div>}
        footer={<div>FOOTER</div>}
      >
        <div>MODAL</div>
      </ListPageTemplate>,
    );
    expect(screen.getByText('KPIS')).toBeInTheDocument();
    expect(screen.getByText('TOOLBAR')).toBeInTheDocument();
    expect(screen.getByText('TABLE')).toBeInTheDocument();
    expect(screen.getByText('FOOTER')).toBeInTheDocument();
    expect(screen.getByText('MODAL')).toBeInTheDocument();
  });

  it('shows the standard skeleton and hides the table while loading', () => {
    renderTemplate(<ListPageTemplate title="X" loading table={<div>TABLE</div>} />);
    expect(screen.queryByText('TABLE')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('renders the empty slot instead of the table when isEmpty', () => {
    renderTemplate(<ListPageTemplate title="X" isEmpty empty={<div>EMPTY</div>} table={<div>TABLE</div>} />);
    expect(screen.getByText('EMPTY')).toBeInTheDocument();
    expect(screen.queryByText('TABLE')).toBeNull();
  });

  it('renders the Pager only when pager props are supplied', () => {
    const { rerender } = renderTemplate(<ListPageTemplate title="X" table={<div>T</div>} />);
    expect(screen.queryByText('Previous')).toBeNull();
    rerender(
      <MemoryRouter><HeaderSlotProvider>
        <ListPageTemplate title="X" table={<div>T</div>} pager={{ page: 0, pageSize: 50, total: 100, onPageChange: () => {}, itemNoun: 'x' }} />
      </HeaderSlotProvider></MemoryRouter>,
    );
    expect(screen.getByText('Previous')).toBeInTheDocument();
  });

  it('honors the loadingFallback escape hatch', () => {
    renderTemplate(<ListPageTemplate title="X" loading loadingFallback={<div>CUSTOM</div>} table={<div>T</div>} />);
    expect(screen.getByText('CUSTOM')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (no `ListPageTemplate`).

- [ ] **Step 3: Write minimal implementation** (verify `cn` = `../../lib/utils`)

```tsx
// src/components/templates/ListPageTemplate.tsx
import React from 'react';
import { cn } from '../../lib/utils';
import { PageHeaderSlot } from '../layout/PageHeaderSlot';
import { Pager } from '../ui/Pager';
import { ListPageSkeleton } from './ListPageSkeleton';
import type { PagerSlotProps } from '../../hooks/useListPage';

export interface ListPageTemplateProps {
  /** Portaled to the top bar via PageHeaderSlot. */
  title: string;
  headerActions?: React.ReactNode;
  kpis?: React.ReactNode;
  toolbar?: React.ReactNode;
  /** Page owns its <table>; no column registry. */
  table: React.ReactNode;
  /** Spread useListPage().pagerProps (+ itemNoun); omit to hide the pager. */
  pager?: PagerSlotProps;
  empty?: React.ReactNode;
  loading?: boolean;
  isEmpty?: boolean;
  /** e.g. BulkActionsBar — rendered outside the table card. */
  footer?: React.ReactNode;
  /** Modals / deep-link effects — page-owned. */
  children?: React.ReactNode;
  loadingFallback?: React.ReactNode;
  /** Skip the white table-card wrapper (table supplies its own surface). */
  unstyledBody?: boolean;
}

/**
 * Thin list shell. Owns the px-6 py-5 container, the top-bar header slot, the
 * white table-card chrome, the Pager footer, and the standard loading/empty
 * swap. Every domain region (kpis/toolbar/table/footer/children) is a ReactNode
 * slot — no column/filter/modal registry. Requires HeaderSlotProvider (AppLayout).
 */
export const ListPageTemplate: React.FC<ListPageTemplateProps> = ({
  title,
  headerActions,
  kpis,
  toolbar,
  table,
  pager,
  empty,
  loading = false,
  isEmpty = false,
  footer,
  children,
  loadingFallback,
  unstyledBody = false,
}) => (
  <div className="px-6 py-5 max-w-[1800px] mx-auto">
    <PageHeaderSlot title={title} actions={headerActions} />
    {loading ? (
      loadingFallback ?? <ListPageSkeleton />
    ) : (
      <>
        {kpis}
        {toolbar}
        {isEmpty ? (
          empty
        ) : (
          <div className={cn(!unstyledBody && 'bg-white rounded-xl border border-slate-200 overflow-hidden')}>
            {table}
            {pager && <Pager {...pager} />}
          </div>
        )}
        {footer}
      </>
    )}
    {children}
  </div>
);
```

> Note: `children` (modals) render in all states (including loading) so deep-link/modal effects keep working. `PageHeaderSlot` returns a portal node that React renders harmlessly when no actions host exists (tests use `HeaderSlotProvider` with no host).

- [ ] **Step 4: Run test to verify it passes** — PASS (5 tests).

- [ ] **Step 5: Commit** — `git add src/components/templates/ListPageTemplate.tsx src/components/templates/ListPageTemplate.test.tsx && git commit -m "feat(h3): ListPageTemplate thin list shell"`

---

## Task 5: `DetailPageSkeleton` + `DetailPageNotFound`

**Files:** Create `src/components/templates/DetailPageSkeleton.tsx` and `src/components/templates/DetailPageNotFound.tsx` (exercised via `DetailPageTemplate`).

- [ ] **Step 1: Implement DetailPageSkeleton**

```tsx
// src/components/templates/DetailPageSkeleton.tsx
import React from 'react';
import { Skeleton } from '../ui/Skeleton';

/** Standard detail loading frame: header strip + 2-col card placeholders. */
export const DetailPageSkeleton: React.FC = () => (
  <div className="px-6 py-5 max-w-[1800px] mx-auto" aria-busy="true" aria-label="Loading">
    <Skeleton className="h-8 w-64 mb-4" />
    <div className="flex flex-col xl:grid xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2"><Skeleton className="h-96 rounded-xl" /></div>
      <div className="xl:col-span-1 space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  </div>
);
```

- [ ] **Step 2: Implement DetailPageNotFound** (verify `Button` import = `../ui/Button`; `AlertCircle` from `lucide-react`)

```tsx
// src/components/templates/DetailPageNotFound.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

export interface DetailPageNotFoundProps {
  backTo?: { to: string; label: string };
}

/** Standard detail not-found: centered icon + message + optional back button. */
export const DetailPageNotFound: React.FC<DetailPageNotFoundProps> = ({ backTo }) => (
  <div className="px-6 py-5 max-w-[1800px] mx-auto">
    <div className="flex flex-col items-center justify-center text-center py-16">
      <AlertCircle className="w-10 h-10 text-slate-400 mb-3" aria-hidden="true" />
      <p className="text-lg font-semibold text-slate-900">Not found</p>
      <p className="text-sm text-slate-500 mb-4">This record doesn't exist or has been removed.</p>
      {backTo && (
        <Link to={backTo.to}><Button variant="secondary" size="sm">{backTo.label}</Button></Link>
      )}
    </div>
  </div>
);
```

- [ ] **Step 3: Commit** — `git add src/components/templates/DetailPageSkeleton.tsx src/components/templates/DetailPageNotFound.tsx && git commit -m "feat(h3): standardized DetailPageSkeleton + DetailPageNotFound"`

---

## Task 6: `DetailSidebarCard`

**Files:**
- Create: `src/components/templates/DetailSidebarCard.tsx`
- Test: `src/components/templates/DetailSidebarCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/templates/DetailSidebarCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Receipt } from 'lucide-react';
import { DetailSidebarCard } from './DetailSidebarCard';

describe('DetailSidebarCard', () => {
  it('renders the title as a heading and the children body', () => {
    render(<DetailSidebarCard title="Payment History"><div>BODY</div></DetailSidebarCard>);
    expect(screen.getByRole('heading', { name: 'Payment History' })).toBeInTheDocument();
    expect(screen.getByText('BODY')).toBeInTheDocument();
  });

  it('renders an optional icon', () => {
    const { container } = render(
      <DetailSidebarCard title="X" icon={Receipt}><span /></DetailSidebarCard>,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (no `DetailSidebarCard`).

- [ ] **Step 3: Write minimal implementation** (verify `Card` import path — likely `../ui/Card`; if a `Card` primitive doesn't exist, use a `div` with `bg-white rounded-xl border border-slate-200`)

```tsx
// src/components/templates/DetailSidebarCard.tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface DetailSidebarCardProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}

/** Opt-in sugar killing the repeated "Card + icon + h3" sidebar pattern. */
export const DetailSidebarCard: React.FC<DetailSidebarCardProps> = ({ title, icon: Icon, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4">
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" />}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    </div>
    {children}
  </div>
);
```

- [ ] **Step 4: Run test to verify it passes** — PASS (2 tests).

- [ ] **Step 5: Commit** — `git add src/components/templates/DetailSidebarCard.tsx src/components/templates/DetailSidebarCard.test.tsx && git commit -m "feat(h3): DetailSidebarCard opt-in sidebar sugar"`

---

## Task 7: `DetailPageTemplate`

**Files:**
- Create: `src/components/templates/DetailPageTemplate.tsx`
- Test: `src/components/templates/DetailPageTemplate.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/templates/DetailPageTemplate.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailPageTemplate } from './DetailPageTemplate';

const header = { breadcrumbs: [{ label: 'Invoices', to: '/invoices' }, { label: 'Invoice INV-1' }] };
const renderDt = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('DetailPageTemplate', () => {
  it('renders the header title and the children body', () => {
    renderDt(<DetailPageTemplate header={header}><div>BODY</div></DetailPageTemplate>);
    expect(screen.getByRole('heading', { name: 'Invoice INV-1' })).toBeInTheDocument();
    expect(screen.getByText('BODY')).toBeInTheDocument();
  });

  it('renders the alerts zone before the body', () => {
    renderDt(<DetailPageTemplate header={header} alerts={<div>ALERT</div>}><div>BODY</div></DetailPageTemplate>);
    expect(screen.getByText('ALERT')).toBeInTheDocument();
  });

  it('renders the skeleton (not the body) while loading', () => {
    renderDt(<DetailPageTemplate header={header} loading><div>BODY</div></DetailPageTemplate>);
    expect(screen.queryByText('BODY')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('renders not-found with the backTo label when notFound', () => {
    renderDt(
      <DetailPageTemplate header={header} notFound backTo={{ to: '/invoices', label: 'Back to Invoices' }}>
        <div>BODY</div>
      </DetailPageTemplate>,
    );
    expect(screen.queryByText('BODY')).toBeNull();
    expect(screen.getByText('Back to Invoices')).toBeInTheDocument();
  });

  it('renders the outside slot even during loading', () => {
    renderDt(
      <DetailPageTemplate header={header} loading outside={<div>PRINT</div>}><div>BODY</div></DetailPageTemplate>,
    );
    expect(screen.getByText('PRINT')).toBeInTheDocument();
    expect(screen.queryByText('BODY')).toBeNull();
  });

  it('honors loadingFallback / notFoundFallback overrides', () => {
    const { rerender } = renderDt(
      <DetailPageTemplate header={header} loading loadingFallback={<div>LOAD</div>}><div>B</div></DetailPageTemplate>,
    );
    expect(screen.getByText('LOAD')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <DetailPageTemplate header={header} notFound notFoundFallback={<div>NF</div>}><div>B</div></DetailPageTemplate>
      </MemoryRouter>,
    );
    expect(screen.getByText('NF')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (no `DetailPageTemplate`).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/templates/DetailPageTemplate.tsx
import React from 'react';
import { DetailPageHeader, type DetailPageHeaderProps } from '../shared/DetailPageHeader';
import { DetailPageSkeleton } from './DetailPageSkeleton';
import { DetailPageNotFound } from './DetailPageNotFound';

export interface DetailPageTemplateProps {
  header: DetailPageHeaderProps;
  /** Page-owned alert blocks; hidden when empty. */
  alerts?: React.ReactNode;
  /** The entire body — page composes its own grid/rail/tabs. */
  children: React.ReactNode;
  loading?: boolean;
  notFound?: boolean;
  loadingFallback?: React.ReactNode;
  notFoundFallback?: React.ReactNode;
  backTo?: { to: string; label: string };
  /** Rendered OUTSIDE the padded container (print <style> + modal portals). */
  outside?: React.ReactNode;
}

/**
 * Thin detail shell. Owns the px-6 py-5 container, the DetailPageHeader render,
 * the alert zone, and standardized loading/not-found defaults. The body is a
 * single children slot; `outside` renders at root (and in every state) so print
 * CSS + modals are never clipped by the container.
 */
export const DetailPageTemplate: React.FC<DetailPageTemplateProps> = ({
  header,
  alerts,
  children,
  loading = false,
  notFound = false,
  loadingFallback,
  notFoundFallback,
  backTo,
  outside,
}) => (
  <>
    {outside}
    {loading ? (
      loadingFallback ?? <DetailPageSkeleton />
    ) : notFound ? (
      notFoundFallback ?? <DetailPageNotFound backTo={backTo} />
    ) : (
      <div className="px-6 py-5 max-w-[1800px] mx-auto">
        <DetailPageHeader {...header} />
        {alerts && <div className="space-y-2 empty:hidden mb-4">{alerts}</div>}
        {children}
      </div>
    )}
  </>
);
```

- [ ] **Step 4: Run test to verify it passes** — PASS (6 tests).

- [ ] **Step 5: Commit** — `git add src/components/templates/DetailPageTemplate.tsx src/components/templates/DetailPageTemplate.test.tsx && git commit -m "feat(h3): DetailPageTemplate thin detail shell"`

---

## Task 8: Extract `InvoicesFilterBar` + `InvoicesTable` (verbatim)

**Files:**
- Read first: `src/pages/financial/InvoicesListPage.tsx` (full).
- Create: `src/components/financial/InvoicesFilterBar.tsx`, `src/components/financial/InvoicesTable.tsx`.

This is a **mechanical extraction**, not a redesign. Move the existing JSX out of the page into presentational children with explicit props. Do NOT add a column/filter registry; keep the JSX as-is.

- [ ] **Step 1:** Read `InvoicesListPage.tsx`. Identify the filter-bar block (search input + quick filter toggles + "More Filters" panel) and the `<table>` block (thead select-all + tbody rows + conversion-linkage buttons).
- [ ] **Step 2: Create `InvoicesFilterBar.tsx`** — a presentational component taking exactly the inputs the JSX reads: `search: string`, `onSearch: (s: string) => void`, plus the existing filter state setters (`statusFilter`, `setStatusFilter`, `typeFilter`, `setTypeFilter`, `showFilters`, `setShowFilters`, and any others present). Paste the filter-bar JSX verbatim; rebind the search input's `value`/`onChange` to `search`/`onSearch`. Keep all token classes unchanged.
- [ ] **Step 3: Create `InvoicesTable.tsx`** — props: `rows: InvoiceWithDetails[]`, `selection` (the `useBulkSelection` return), `visibleIds: string[]`, `navigate`, `formatCurrency`, and the row action handlers (`onEdit`, `onPay`, etc. — whatever the rows call). Paste the `<table>` JSX verbatim; thread the handlers as props. Preserve select-all indeterminate state and overdue/selected row highlighting exactly.
- [ ] **Step 4: Typecheck** — `npm run typecheck` → 0 errors (these files don't compile standalone until Task 9 wires them, so a temporary unused-import error is fine here; the wiring lands in Task 9. If you prefer a green checkpoint, do Steps 8.2–8.4 and Task 9 in one commit).
- [ ] **Step 5: Commit (with Task 9)** — these extractions are committed together with the page migration in Task 9 to keep a compiling tree.

---

## Task 9: Migrate `InvoicesListPage`

**Files:**
- Modify: `src/pages/financial/InvoicesListPage.tsx`
- Create: `src/pages/financial/InvoicesListPage.test.tsx`

- [ ] **Step 1: Write the failing page smoke test**

```tsx
// src/pages/financial/InvoicesListPage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

// Mock the hook so the page renders deterministically without a live query.
vi.mock('../../hooks/useListPage', () => ({
  useListPage: () => ({
    page: 0, setPage: vi.fn(), search: '', setSearch: vi.fn(), debouncedSearch: '',
    rows: [], total: 0, isLoading: false, isEmpty: true, pageSize: 50,
    pagerProps: { page: 0, pageSize: 50, total: 0, onPageChange: vi.fn() },
  }),
}));
// Mock the stats query source + any service the page imports at module load.
vi.mock('../../lib/invoiceService', async (orig) => ({
  ...(await orig<typeof import('../../lib/invoiceService')>()),
  getInvoiceStats: vi.fn(async () => ({ total: 0, paid: 0, totalValue: 0, totalPaid: 0, totalOutstanding: 0, overdue: 0 })),
  fetchInvoicesPage: vi.fn(async () => ({ rows: [], total: 0 })),
}));

import { InvoicesListPage } from './InvoicesListPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><HeaderSlotProvider><InvoicesListPage /></HeaderSlotProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvoicesListPage', () => {
  it('renders the empty state when there are no invoices', async () => {
    renderPage();
    expect(await screen.findByText(/No invoices/i)).toBeInTheDocument();
  });
});
```

> Adapt the mock to the page's actual default export vs named export and the real `getInvoiceStats` return shape (read the service). If `InvoicesListPage` is a default export, import it as default in the test.

- [ ] **Step 2: Run test to verify it fails** — FAIL (page still renders the old structure / import mismatch).

- [ ] **Step 3: Migrate the page.** Read the current `InvoicesListPage.tsx`, then:
  1. Replace the page-state/debounce/page-reset/paged-query block (~lines 70–127) with a single `useListPage` call:
     ```tsx
     const list = useListPage<InvoiceWithDetails, { status?: string; invoiceType?: string }>({
       queryKey: ['invoices'],
       filters: {
         status: statusFilter !== 'all' ? statusFilter : undefined,
         invoiceType: typeFilter !== 'all' ? typeFilter : undefined,
       },
       fetchPage: ({ status, invoiceType, search, page, pageSize }) =>
         fetchInvoicesPage({ status, invoiceType, search: search || undefined, page, pageSize }),
     });
     ```
     Keep the separate global `getInvoiceStats` query as-is (KPIs are global, not page-scoped).
  2. Wrap the returned JSX in `<ListPageTemplate title="Invoices" headerActions={…} kpis={<KpiRow …/>} toolbar={<InvoicesFilterBar …/>} loading={list.isLoading} isEmpty={list.isEmpty} empty={…} table={<InvoicesTable rows={list.rows} …/>} pager={{ ...list.pagerProps, itemNoun: 'invoices' }} footer={<BulkActionsBar …/>}>{modals}</ListPageTemplate>`.
  3. Replace the KPI cards with `<KpiRow stats={[…]}/>` using the existing 4 stats (Total Invoiced/Paid/Outstanding/Overdue) and their tones (info/success/warning/danger).
  4. Move all modals + the `?new=1` deep-link effect into `children`. Keep bulk handlers, `ExportButton`, and permission gating unchanged.
  5. Delete the now-removed inline `PageHeader`/skeleton/pager JSX. Search is now `list.search` / `list.setSearch`.
- [ ] **Step 4: Run tests** — `npx vitest run src/pages/financial/InvoicesListPage.test.tsx` → PASS. Also `npm run typecheck` → 0.
- [ ] **Step 5: Commit** — `git add src/components/financial/InvoicesFilterBar.tsx src/components/financial/InvoicesTable.tsx src/pages/financial/InvoicesListPage.tsx src/pages/financial/InvoicesListPage.test.tsx && git commit -m "feat(h3): migrate InvoicesListPage onto ListPageTemplate + useListPage"`

---

## Task 10: Migrate `InvoiceDetailPage`

**Files:** Modify `src/pages/financial/InvoiceDetailPage.tsx`.

- [ ] **Step 1:** Read the current `InvoiceDetailPage.tsx` in full. Note the print `<style>` block (~line 259), the 4 modals, the loading + not-found branches, the header block, the alert blocks, and the 3-col body grid.
- [ ] **Step 2: Migrate** — wrap in `DetailPageTemplate`:
  - `loading={isLoading}`, `notFound={!isLoading && !invoice}`, `backTo={{ to: '/invoices', label: 'Back to Invoices' }}`.
  - `outside={<><style>…</style>{…all 4 modals…}</>}` — move the print `<style>` and every modal here (they must render at root, including during loading/not-found).
  - `header={{ breadcrumbs: [{ label: 'Invoices', to: '/invoices' }, { label: \`Invoice ${invoice?.invoice_number || 'Draft'}\` }], badges: <>…</>, actions: <>…</>, meta: <AuditInfo …/> }}` — lift the existing badges/actions/AuditInfo verbatim.
  - `alerts={<>…the existing conditional alert blocks…</>}`.
  - Body (`children`): the existing 3-col grid verbatim. Optionally wrap the sidebar cards in `DetailSidebarCard` (title + optional icon + children) — this is the 3-call-site justification; keep the inner content identical.
  - Delete the old inline `px-6 py-5` container wrapper, the inline loading skeleton, and the inline not-found block (now template-owned).
- [ ] **Step 3: Verify** — `npm run typecheck` → 0. Manually confirm (read the diff) the print `<style>` + modals are inside `outside`, not the body. Run the full suite: `npx vitest run` → green.
- [ ] **Step 4: Commit** — `git add src/pages/financial/InvoiceDetailPage.tsx && git commit -m "feat(h3): migrate InvoiceDetailPage onto DetailPageTemplate"`

---

## Task 11: Gates + handoff doc

- [ ] **Step 1:** `npm run typecheck` → expect 0 errors.
- [ ] **Step 2:** `npx eslint src/components/templates src/hooks/useListPage.ts src/components/financial/InvoicesFilterBar.tsx src/components/financial/InvoicesTable.tsx src/pages/financial/InvoicesListPage.tsx src/pages/financial/InvoiceDetailPage.tsx` → 0 errors (pre-existing `no-untranslated-jsx-text` warnings acceptable).
- [ ] **Step 3:** `npx vitest run` → green; confirm new test files counted and baseline still passes.
- [ ] **Step 4:** Update `docs/audit-3-handoff.md` §1 (add the H3 PR row, mark H3 foundation shipped, note the sweep + L1 retirement remain) and §3 (add the new templates/hook to the reusable assets). Commit: `git commit -am "docs(h3): handoff — H3 foundation + Invoices reference shipped; sweep remains"`.

---

## Self-review (completed at authoring)

- **Spec coverage:** §4 ListPageTemplate→T4; §5 useListPage→T1; §6 KpiRow + L1 fold→T2/T9; §7 DetailPageTemplate + DetailSidebarCard + skeleton/not-found→T5/T6/T7; §8 Invoices migration→T8/T9/T10; §9 file inventory→all tasks; §10 test plan→T1/T2/T4/T6/T7/T9 (the 3 default skeletons covered via template tests, per spec §9). ✓
- **Placeholder scan:** migration tasks (8–10) carry exact recipes + the load-bearing code; the verbatim-JSX lifts are intentionally "read live source then move" because reproducing ~700 lines of existing page code in the plan would be stale-by-copy. No "TBD/TODO". ✓
- **Type consistency:** `PagerSlotProps` defined in T1, imported by T4. `KpiSpec`/`StatCardTone` consistent T2↔T9. `DetailPageHeaderProps` (live) used by T7. `useListPage` result fields (`rows/total/isLoading/isEmpty/pagerProps/search/setSearch`) consistent T1↔T9. ✓
