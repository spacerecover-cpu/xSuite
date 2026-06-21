import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Isolate the form: passthrough Modal + UsageLimitGuard, stub toast, stub the
// cases query, and serve a deterministic category list.
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title?: string; children: React.ReactNode }) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));
vi.mock('../shared/UsageLimitGuard', () => ({
  UsageLimitGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
        order: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
    }),
  },
}));
vi.mock('../../lib/expensesService', () => ({
  getExpenseCategories: async () => [
    { id: 'c1', name: 'Consumables' },
    { id: 'c2', name: 'Travel' },
  ],
}));

import { ExpenseFormModal } from './ExpenseFormModal';

function renderForm(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ExpenseFormModal edit prefill (EXP-003a / EXP-003b)', () => {
  it('pre-selects the saved category when editing — the value that previously blanked', async () => {
    renderForm(
      <ExpenseFormModal
        isOpen
        onClose={() => {}}
        onSave={async () => {}}
        initialData={{ id: 'e1', category_id: 'c1', amount: 10, description: 'x', status: 'pending' }}
      />,
    );
    // Wait for the async category options to load before asserting the bound value.
    await screen.findByRole('option', { name: 'Consumables' });
    const select = screen.getByLabelText('Category') as HTMLSelectElement;
    expect(select.value).toBe('c1');
  });

  it('no longer renders the phantom Payment Method field', () => {
    renderForm(
      <ExpenseFormModal
        isOpen
        onClose={() => {}}
        onSave={async () => {}}
        initialData={{ id: 'e1', status: 'draft' }}
      />,
    );
    expect(screen.queryByText(/payment method/i)).toBeNull();
    expect(screen.queryByLabelText(/payment method/i)).toBeNull();
  });
});
