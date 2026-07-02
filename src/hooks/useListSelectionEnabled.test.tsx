// src/hooks/useListSelectionEnabled.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useListSelectionEnabled } from './useListSelectionEnabled';
import {
  getTenantListSelectionEnabled,
  readListSelectionHint,
  writeListSelectionHint,
} from '../lib/tablePrefsService';

vi.mock('../lib/tablePrefsService', () => ({
  getTenantListSelectionEnabled: vi.fn(),
  readListSelectionHint: vi.fn(),
  writeListSelectionHint: vi.fn(),
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useListSelectionEnabled', () => {
  beforeEach(() => {
    vi.mocked(getTenantListSelectionEnabled).mockReset();
    vi.mocked(readListSelectionHint).mockReset().mockReturnValue(undefined);
    vi.mocked(writeListSelectionHint).mockReset();
  });

  it('defaults to true when no tenant setting and no hint', async () => {
    vi.mocked(getTenantListSelectionEnabled).mockResolvedValue(undefined);
    const { result } = renderHook(() => useListSelectionEnabled(), { wrapper: wrapper() });
    expect(result.current).toBe(true);
    await waitFor(() => expect(getTenantListSelectionEnabled).toHaveBeenCalled());
    expect(result.current).toBe(true);
  });

  it('returns false once the tenant has hidden checkboxes', async () => {
    vi.mocked(getTenantListSelectionEnabled).mockResolvedValue(false);
    const { result } = renderHook(() => useListSelectionEnabled(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('paints with the localStorage hint before the query resolves', () => {
    vi.mocked(readListSelectionHint).mockReturnValue(false);
    vi.mocked(getTenantListSelectionEnabled).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useListSelectionEnabled(), { wrapper: wrapper() });
    expect(result.current).toBe(false);
  });

  it('refreshes the hint from the resolved truth', async () => {
    vi.mocked(readListSelectionHint).mockReturnValue(true);
    vi.mocked(getTenantListSelectionEnabled).mockResolvedValue(false);
    const { result } = renderHook(() => useListSelectionEnabled(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(false));
    expect(writeListSelectionHint).toHaveBeenCalledWith(false);
  });
});
