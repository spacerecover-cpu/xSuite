import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError, info: vi.fn(), warning: vi.fn() }),
}));

vi.mock('../../../hooks/useConfirm', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

vi.mock('@/lib/format', () => ({ formatDate: (v: string) => v }));

const deleteResult = { data: [] as { id: string }[], error: null as unknown };
const storageRemove = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabaseClient', () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    chain.delete = () => chain;
    chain.eq = () => chain;
    chain.select = () => Promise.resolve(deleteResult);
    return chain;
  };
  return {
    supabase: {
      from: () => builder(),
      storage: { from: () => ({ remove: storageRemove }) },
    },
  };
});

import { CaseFilesTab } from './CaseFilesTab';

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseFilesTab
        caseId="case-1"
        uploadedBy="user-1"
        attachments={[{ id: 'att-1', file_name: 'evidence.img', file_url: 'case-1/1_evidence.img', file_size: 1024, file_type: 'application/octet-stream', category: 'other', created_at: '2026-07-01T00:00:00Z' }]}
      />
    </QueryClientProvider>,
  );
}

describe('CaseFilesTab handleDelete', () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    storageRemove.mockClear();
    deleteResult.data = [];
    deleteResult.error = null;
  });

  it('does not report success and does not touch storage when the DB delete removes 0 rows (non-admin RLS)', async () => {
    deleteResult.data = [];
    renderTab();
    screen.getByTitle('Delete').click();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it('reports success and removes the blob when a row was actually deleted (admin)', async () => {
    deleteResult.data = [{ id: 'att-1' }];
    renderTab();
    screen.getByTitle('Delete').click();

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('File deleted'));
    expect(storageRemove).toHaveBeenCalledWith(['case-1/1_evidence.img']);
    expect(toastError).not.toHaveBeenCalled();
  });
});
