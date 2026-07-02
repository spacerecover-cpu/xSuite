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
  /**
   * Page-owned filter values; their identity is part of the query key + reset
   * trigger. Must be a flat object of JSON-stable primitives — the page-reset
   * effect compares them via `JSON.stringify`, so Dates / functions / key-order
   * are not safe here. Sufficient for the Invoices reference; revisit (e.g.
   * hash via `@tanstack/react-query`'s `hashKey`) if the sweep needs richer filters.
   */
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

  // pageSize is a reset trigger + key segment: the tenant setting can change at
  // runtime (Settings → Tables), which must re-clamp to page 0 and refetch.
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    setPage(0);
  }, [filtersKey, debouncedSearch, pageSize]);

  const query = useQuery({
    queryKey: [...queryKey, filters, debouncedSearch, page, pageSize],
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
