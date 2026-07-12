import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

// Mock the hook so the page renders deterministically without a live query.
vi.mock('../../hooks/useListPage', () => ({
  useListPage: () => ({
    page: 0, setPage: vi.fn(), search: '', setSearch: vi.fn(), debouncedSearch: '',
    rows: [], total: 0, isLoading: false, isEmpty: true, pageSize: 50,
    pagerProps: { page: 0, pageSize: 50, total: 0, onPageChange: vi.fn() },
  }),
}));

// Fully mock supabaseClient so the real createClient env guard never runs (the
// page transitively imports it via invoiceService/receiptsService). Mirrors the
// SuppliersListPage.test.tsx reference: a universal thenable chain answers every
// builder method so any incidental query resolves empty.
vi.mock('../../lib/supabaseClient', () => {
  const thenableChain = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'or', 'eq', 'order', 'range', 'gte', 'lte', 'ilike', 'in', 'update']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  };
  return {
    supabase: { from: vi.fn(() => thenableChain({ data: [], count: 0, error: null })) },
    resolveTenantId: vi.fn(async () => 'tenant-1'),
  };
});

// Page-consumed hooks: stub so the smoke test renders without their providers.
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => String(n) }),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ profile: { role: 'admin' } }) }));

// Mock the stats query source + the modal save fns the page imports at module load.
vi.mock('../../lib/invoiceService', () => ({
  getInvoiceStats: vi.fn(async () => ({
    total: 0, draft: 0, sent: 0, paid: 0, partial: 0, overdue: 0,
    proforma: 0, taxInvoice: 0, totalValue: 0, totalPaid: 0, totalOutstanding: 0,
  })),
  fetchInvoicesPage: vi.fn(async () => ({ rows: [], total: 0 })),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  toInvoiceEditInitialData: vi.fn((x: unknown) => x),
}));

// Replace the real modal with a stub that immediately invokes onSave with a
// payload carrying a non-base document currency, so the test exercises the
// page's save handler (which must forward `currency` to createInvoice).
vi.mock('../../components/cases/InvoiceFormModal', () => ({
  InvoiceFormModal: (props: {
    isOpen: boolean;
    onSave: (data: Record<string, unknown>, items: unknown[]) => void;
  }) =>
    props.isOpen ? (
      <button
        type="button"
        onClick={() => props.onSave({ title: 'Foreign invoice', currency: 'EUR' }, [])}
      >
        stub-save
      </button>
    ) : null,
}));

import { InvoicesListPage } from './InvoicesListPage';
import { createInvoice } from '../../lib/invoiceService';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><HeaderSlotProvider><InvoicesListPage /></HeaderSlotProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvoicesListPage', () => {
  it('renders the empty state when there are no invoices', async () => {
    renderPage();
    expect(await screen.findByText('No invoices found')).toBeInTheDocument();
  });

  it('forwards the selected document currency to createInvoice on save', async () => {
    vi.mocked(createInvoice).mockClear();
    renderPage();
    // Open the create-invoice modal via the empty-state action.
    fireEvent.click((await screen.findAllByRole('button', { name: /create invoice/i }))[0]);
    // The stubbed modal fires onSave({ currency: 'EUR' }).
    fireEvent.click(await screen.findByText('stub-save'));
    await waitFor(() => expect(vi.mocked(createInvoice)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createInvoice).mock.calls[0][0]).toMatchObject({ currency: 'EUR' });
  });
});
