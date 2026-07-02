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
    vi.useRealTimers(); // RTL waitFor polls on the real clock — don't mix with fake timers here
    const fetchPage = vi.fn(async () => ({ rows: [{ id: 'a' }, { id: 'b' }], total: 7 }));
    const { result } = renderHook(() => useListPage(baseConfig({ fetchPage })), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.rows.length).toBe(2));
    expect(result.current.total).toBe(7);
    expect(fetchPage).toHaveBeenCalledWith({ status: 'all', search: '', page: 0, pageSize: 50 });
    expect(result.current.pagerProps).toMatchObject({ page: 0, pageSize: 50, total: 7 });
    expect(typeof result.current.pagerProps.onPageChange).toBe('function');
  });

  it('resets page and refetches when pageSize changes (tenant setting update)', async () => {
    vi.useRealTimers(); // see note above — real clock for waitFor polling
    const fetchPage = vi.fn(async () => ({ rows: [{ id: 'a' }], total: 100 }));
    const { result, rerender } = renderHook(
      ({ pageSize }) => useListPage(baseConfig({ fetchPage, pageSize })),
      { wrapper: wrapper(), initialProps: { pageSize: 50 } },
    );
    await waitFor(() =>
      expect(fetchPage).toHaveBeenCalledWith({ status: 'all', search: '', page: 0, pageSize: 50 }),
    );
    act(() => result.current.setPage(2));
    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
    rerender({ pageSize: 25 });
    expect(result.current.page).toBe(0);
    await waitFor(() =>
      expect(fetchPage).toHaveBeenCalledWith({ status: 'all', search: '', page: 0, pageSize: 25 }),
    );
  });

  it('isEmpty is false while loading and true when loaded with no rows', async () => {
    vi.useRealTimers(); // see note above — real clock for waitFor polling
    const fetchPage = vi.fn(async () => ({ rows: [], total: 0 }));
    const { result } = renderHook(() => useListPage(baseConfig({ fetchPage })), { wrapper: wrapper() });
    expect(result.current.isEmpty).toBe(false); // loading
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEmpty).toBe(true);
  });
});
