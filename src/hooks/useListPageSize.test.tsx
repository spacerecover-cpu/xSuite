// src/hooks/useListPageSize.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useListPageSize } from './useListPageSize';
import {
  getTenantListPageSize,
  readListPageSizeHint,
  writeListPageSizeHint,
} from '../lib/tablePrefsService';

vi.mock('../lib/tablePrefsService', () => ({
  DEFAULT_LIST_PAGE_SIZE: 50,
  getTenantListPageSize: vi.fn(),
  readListPageSizeHint: vi.fn(),
  writeListPageSizeHint: vi.fn(),
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useListPageSize', () => {
  beforeEach(() => {
    vi.mocked(getTenantListPageSize).mockReset();
    vi.mocked(readListPageSizeHint).mockReset().mockReturnValue(undefined);
    vi.mocked(writeListPageSizeHint).mockReset();
  });

  it('returns the default when no tenant setting and no hint', async () => {
    vi.mocked(getTenantListPageSize).mockResolvedValue(undefined);
    const { result } = renderHook(() => useListPageSize(), { wrapper: wrapper() });
    expect(result.current).toBe(50);
    await waitFor(() => expect(getTenantListPageSize).toHaveBeenCalled());
    expect(result.current).toBe(50);
  });

  it('returns the tenant-configured size once resolved', async () => {
    vi.mocked(getTenantListPageSize).mockResolvedValue(25);
    const { result } = renderHook(() => useListPageSize(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(25));
  });

  it('paints with the localStorage hint before the query resolves', () => {
    vi.mocked(readListPageSizeHint).mockReturnValue(100);
    vi.mocked(getTenantListPageSize).mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useListPageSize(), { wrapper: wrapper() });
    expect(result.current).toBe(100);
  });

  it('still fetches the truth even when a hint exists, and refreshes the hint', async () => {
    vi.mocked(readListPageSizeHint).mockReturnValue(100);
    vi.mocked(getTenantListPageSize).mockResolvedValue(25);
    const { result } = renderHook(() => useListPageSize(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(25));
    expect(writeListPageSizeHint).toHaveBeenCalledWith(25);
  });
});
