import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The case_engineers DELETE policy is admin-only (has_role('admin')). A policy
// miss returns no error, only zero rows, so these tests pin the two behaviours
// that keep a blocked removal from reading as a success: the control is hidden
// for non-admins, and a zero-row delete surfaces as a failure.
const { toastSuccess, toastError, role, deleteRows } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  role: { current: 'admin' as string },
  deleteRows: { current: [] as { id: string }[] },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'user-1', tenant_id: 'tenant-1', role: role.current } }),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

vi.mock('../../../hooks/useConfirm', () => ({
  useConfirm: () => async () => true,
}));

vi.mock('@/lib/format', () => ({
  formatDate: (v: string) => v,
}));

vi.mock('@/lib/supabaseClient', () => {
  const chainFor = (result: () => unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'is', 'order', 'delete', 'insert', 'update']) {
      chain[m] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  return {
    supabase: {
      from: (table: string) =>
        table === 'case_engineers'
          ? chainFor(() => ({ data: deleteRows.current, error: null }))
          : chainFor(() => ({
              data: [{ id: 'eng-1', full_name: 'Alex Rivera', role: 'technician' }],
              error: null,
            })),
    },
  };
});

import { CaseEngineersTab } from './CaseEngineersTab';

const ASSIGNMENTS = [
  { id: 'assign-1', user_id: 'eng-1', role_text: 'Lead Technician', created_at: '2026-01-02' },
];

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CaseEngineersTab caseId="case-1" caseEngineers={ASSIGNMENTS} />
    </QueryClientProvider>,
  );
}

describe('CaseEngineersTab — engineer removal', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    role.current = 'admin';
    deleteRows.current = [];
  });

  it('hides the remove control for roles the DELETE policy rejects', async () => {
    role.current = 'technician';
    renderTab();

    await screen.findByText('Alex Rivera');
    expect(screen.queryByTitle('Remove engineer')).not.toBeInTheDocument();
  });

  it('shows the remove control for admins', async () => {
    renderTab();

    await screen.findByText('Alex Rivera');
    expect(screen.getByTitle('Remove engineer')).toBeInTheDocument();
  });

  it('reports a failure when the delete matches zero rows instead of a success toast', async () => {
    renderTab();

    fireEvent.click(await screen.findByTitle('Remove engineer'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toMatch(/permission/i);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('reports success when the delete actually removes the assignment', async () => {
    deleteRows.current = [{ id: 'assign-1' }];
    renderTab();

    fireEvent.click(await screen.findByTitle('Remove engineer'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Engineer removed from case'));
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('CaseEngineersTab — duplicate assignment guard', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    role.current = 'admin';
  });

  it('refuses to assign an engineer who is already on the case', async () => {
    renderTab();

    fireEvent.click(await screen.findByText('Add Engineer'));
    // EngineerSelector lists the same profile the existing assignment points at,
    // so picking it reproduces the duplicate the guard has to reject. Only the
    // dropdown option is a button — the assignment card renders the name as text.
    fireEvent.click(screen.getByText('Not assigned'));
    fireEvent.click(await screen.findByRole('button', { name: 'Alex Rivera' }));
    fireEvent.click(screen.getByRole('button', { name: /assign engineer/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toMatch(/already assigned/i);
  });
});
