import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Service is the only write path; stub it so the suite stays focused on the
// tab's cache-invalidation behaviour rather than Supabase.
const recordRecoveryAttempt = vi.fn();
const recordQaResult = vi.fn();
vi.mock('@/lib/caseQualityService', () => ({
  caseQualityService: {
    listRecoveryAttempts: vi.fn().mockResolvedValue([]),
    listQaChecklists: vi.fn().mockResolvedValue([]),
    recordRecoveryAttempt: (...args: unknown[]) => recordRecoveryAttempt(...args),
    recordQaResult: (...args: unknown[]) => recordQaResult(...args),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'user-1', tenant_id: 'tenant-1' } }),
}));

vi.mock('@/contexts/TenantConfigContext', () => ({
  useTenantFeature: () => true,
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/format', () => ({
  formatDate: (v: string) => v,
}));

import { CaseRecoveryQaTab } from './CaseRecoveryQaTab';

const CASE_ID = 'case-1';

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <CaseRecoveryQaTab caseId={CASE_ID} />
    </QueryClientProvider>,
  );
  return { invalidateSpy };
}

describe('CaseRecoveryQaTab cache invalidation', () => {
  beforeEach(() => {
    recordRecoveryAttempt.mockReset().mockResolvedValue({ id: 'attempt-1' });
    recordQaResult.mockReset().mockResolvedValue({ id: 'qa-1' });
  });

  it("invalidates ['case', id] after recording a recovery attempt so the DB-side recovery_outcome rollup is refetched", async () => {
    // recordRecoveryAttempt writes cases.recovery_outcome directly; if the
    // page-level ['case', id] query is not invalidated, the stale outcome seeds
    // Device Checkout and the Rule 51 refund gate (bug: data corruption).
    const { invalidateSpy } = renderTab();

    fireEvent.click(screen.getByRole('button', { name: /record attempt/i }));

    await waitFor(() => expect(recordRecoveryAttempt).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['case', CASE_ID] }),
    );
    // The pre-existing attempts-list invalidation must still fire.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['case_recovery_attempts', CASE_ID],
    });
  });

  it("invalidates ['case', id] after recording a QA result", async () => {
    const { invalidateSpy } = renderTab();

    fireEvent.click(screen.getByRole('button', { name: /record qa result/i }));

    await waitFor(() => expect(recordQaResult).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['case', CASE_ID] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['case_qa_checklists', CASE_ID],
    });
  });
});
