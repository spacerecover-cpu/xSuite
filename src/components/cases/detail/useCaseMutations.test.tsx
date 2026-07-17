import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const { update, select, eq, from } = vi.hoisted(() => {
  const eq = vi.fn();
  const select = vi.fn(() => Promise.resolve({ data: [{ id: 'case-1' }], error: null }));
  const update = vi.fn();
  const from = vi.fn();
  return { update, select, eq, from };
});

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from } }));
vi.mock('../../../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', tenant_id: 't1' } }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { useCaseMutations } from './useCaseMutations';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

const noopModals = {
  setNewNote: vi.fn(),
  setShowRecordPaymentModal: vi.fn(),
  setSelectedInvoiceForPayment: vi.fn(),
  setShowMarkAsDeliveredModal: vi.fn(),
  setSelectedClone: vi.fn(),
  setShowPreserveLongTermModal: vi.fn(),
  setShowDuplicateModal: vi.fn(),
  setShowDeleteModal: vi.fn(),
};

describe('updateAssignedEngineerMutation payload', () => {
  beforeEach(() => {
    from.mockReset();
    update.mockReset();
    eq.mockReset();
    // cases.update(...).eq('id', ...).select()
    update.mockImplementation(() => ({ eq }));
    eq.mockImplementation(() => ({ select }));
    from.mockImplementation(() => ({ update }));
  });

  it('writes only assigned_to (never the generated assigned_engineer_id column)', async () => {
    const { result } = renderHook(
      () => useCaseMutations({ id: 'case-1', caseData: null, devices: [], modals: noopModals }),
      { wrapper },
    );

    await result.current.updateAssignedEngineerMutation.mutateAsync('eng-9');

    await waitFor(() =>
      expect(result.current.updateAssignedEngineerMutation.isSuccess).toBe(true),
    );

    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0];
    expect(payload).not.toHaveProperty('assigned_engineer_id');
    expect(payload).toMatchObject({ assigned_to: 'eng-9' });
    expect(payload).toHaveProperty('updated_at');
  });
});

describe('markAsDeliveredMutation cache invalidation', () => {
  beforeEach(() => {
    from.mockReset();
    update.mockReset();
    eq.mockReset();
    // clone_drives.update(...).eq('id', ...) resolves with no error
    eq.mockImplementation(() => Promise.resolve({ error: null }));
    update.mockImplementation(() => ({ eq }));
    from.mockImplementation(() => ({ update }));
  });

  it('invalidates command-center and history keys after a delivery', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const localWrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const { result } = renderHook(
      () => useCaseMutations({ id: 'case-1', caseData: null, devices: [], modals: noopModals }),
      { wrapper: localWrapper },
    );

    await result.current.markAsDeliveredMutation.mutateAsync({
      cloneId: 'clone-1',
      updateCaseStatus: false,
      deliveryNotes: '',
      retentionDays: 30,
    });

    await waitFor(() =>
      expect(result.current.markAsDeliveredMutation.isSuccess).toBe(true),
    );

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(invalidatedKeys).toContain(JSON.stringify(['cases']));
    expect(invalidatedKeys).toContain(JSON.stringify(['case_history', 'case-1']));
    expect(invalidatedKeys.some((k) => k.includes('command'))).toBe(true);
  });
});
