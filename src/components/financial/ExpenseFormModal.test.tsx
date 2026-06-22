import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ currencyFormat: { currencyCode: 'USD', decimalPlaces: 2 } }),
}));
// Generic chainable supabase stub: every builder method returns the builder and
// awaiting it yields an empty result — robust to the cases + currency-codes queries.
vi.mock('../../lib/supabaseClient', () => {
  const makeBuilder = () => {
    const b: Record<string, unknown> = {};
    ['select', 'eq', 'in', 'is', 'gte', 'lte', 'order', 'limit', 'maybeSingle'].forEach((m) => {
      b[m] = () => b;
    });
    (b as { then: unknown }).then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null });
    return b;
  };
  return { supabase: { from: () => makeBuilder() } };
});
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

  it('pre-fills the date input from a full timestamptz value when editing (date must not vanish)', () => {
    // expenses.expense_date is timestamptz, so a saved value arrives as a full ISO
    // timestamp. <input type="date"> only accepts YYYY-MM-DD; feeding it the full
    // timestamp blanks the field — the reported "date disappears on edit" bug.
    const { container } = renderForm(
      <ExpenseFormModal
        isOpen
        onClose={() => {}}
        onSave={async () => {}}
        initialData={{ id: 'e1', expense_date: '2026-06-01T00:00:00+00:00', amount: 10, description: 'x', status: 'pending' }}
      />,
    );
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).not.toBeNull();
    expect(dateInput.value).toBe('2026-06-01');
  });

  it('captures currency, tax, billable and reference and sends them on save (EXP-005)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm(
      <ExpenseFormModal
        isOpen
        onClose={() => {}}
        onSave={onSave}
        initialData={{ id: 'e1', amount: 100, description: 'x', status: 'pending', tax_amount: 5, currency: 'EUR', is_billable: true, reference: 'R-1' }}
      />,
    );
    expect(await screen.findByDisplayValue('R-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save as draft/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ tax_amount: 5, currency: 'EUR', is_billable: true, reference: 'R-1' }),
    );
  });
});
