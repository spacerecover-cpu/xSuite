import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

// Mutable list state so a test can inject a row to drive the edit path while the
// default (empty) state keeps the empty-state smoke test deterministic.
const listState = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], isEmpty: true }));

// Mock the hook so the page renders deterministically without a live query.
vi.mock('../../hooks/useListPage', () => ({
  useListPage: () => ({
    page: 0, setPage: vi.fn(), search: '', setSearch: vi.fn(), debouncedSearch: '',
    rows: listState.rows, total: listState.rows.length, isLoading: false, isEmpty: listState.isEmpty, pageSize: 50,
    pagerProps: { page: 0, pageSize: 50, total: listState.rows.length, onPageChange: vi.fn() },
  }),
}));

// A draft tax invoice with one imported line stored at 10% discount (900 net on a
// 1000 gross line) — the edit re-fetch must normalize `discount` → `discount_percent`.
const RAW_INVOICE = {
  id: 'inv-1', invoice_number: 'INVO-0001', status: 'draft', invoice_type: 'tax_invoice',
  invoice_date: '2026-07-01', due_date: '2026-07-15', currency: 'USD',
  total_amount: 900, amount_paid: 0, balance_due: 900, tax_amount: 0,
  case_id: 'case-1', customer_id: 'cust-1', company_id: null, title: 'Data Recovery Service',
  customers_enhanced: { customer_name: 'Acme' }, companies: null,
};
const RAW_LINE = {
  id: 'li-1', description: 'RAID rebuild', quantity: 1, unit_price: 1000, tax_rate: 0,
  discount: 10, total: 900, sort_order: 0, unit_code: null, unit_label: null, item_code: null,
};

// Fully mock supabaseClient so the real createClient env guard never runs (the
// page transitively imports it via invoiceService/receiptsService). The re-fetch
// in the edit handler is table-aware so the raw DB row shapes drive the page's
// discount normalization.
vi.mock('../../lib/supabaseClient', () => {
  const makeChain = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'or', 'eq', 'order', 'range', 'gte', 'lte', 'ilike', 'in', 'update', 'limit']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(result));
    chain.single = vi.fn(() => Promise.resolve(result));
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'invoices') return makeChain({ data: { ...RAW_INVOICE }, count: 0, error: null });
        if (table === 'invoice_line_items') return makeChain({ data: [{ ...RAW_LINE }], count: 0, error: null });
        return makeChain({ data: [], count: 0, error: null });
      }),
    },
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

// Keep the real discount mapping + initial-data normalization; only stub the
// network read/write calls the page issues at module load.
vi.mock('../../lib/invoiceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/invoiceService')>();
  return {
    ...actual,
    getInvoiceStats: vi.fn(async () => ({
      total: 0, draft: 0, sent: 0, paid: 0, partial: 0, overdue: 0,
      proforma: 0, taxInvoice: 0, totalValue: 0, totalPaid: 0, totalOutstanding: 0,
    })),
    fetchInvoicesPage: vi.fn(async () => ({ rows: [], total: 0 })),
    createInvoice: vi.fn(),
    updateInvoice: vi.fn(),
  };
});

// Replace the real modal with a stub. In create mode (no initialData) it fires a
// payload carrying a non-base document currency; in edit mode it replays the
// normalized line items back through onSave exactly as the real modal does.
vi.mock('../../components/cases/InvoiceFormModal', () => ({
  InvoiceFormModal: (props: {
    isOpen: boolean;
    initialData?: { invoice_line_items?: unknown[] } & Record<string, unknown>;
    onSave: (data: Record<string, unknown>, items: unknown[]) => void;
  }) =>
    props.isOpen ? (
      <button
        type="button"
        onClick={() =>
          props.onSave(
            { ...(props.initialData ?? {}), title: 'Foreign invoice', currency: 'EUR' },
            props.initialData?.invoice_line_items ?? [],
          )
        }
      >
        stub-save
      </button>
    ) : null,
}));

import { InvoicesListPage } from './InvoicesListPage';
import { createInvoice, updateInvoice } from '../../lib/invoiceService';

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
    listState.rows = [];
    listState.isEmpty = true;
    renderPage();
    expect(await screen.findByText('No invoices found')).toBeInTheDocument();
  });

  it('forwards the selected document currency to createInvoice on save', async () => {
    listState.rows = [];
    listState.isEmpty = true;
    vi.mocked(createInvoice).mockClear();
    renderPage();
    // Open the create-invoice modal via the empty-state action.
    fireEvent.click((await screen.findAllByRole('button', { name: /create invoice/i }))[0]);
    // The stubbed modal fires onSave({ currency: 'EUR' }).
    fireEvent.click(await screen.findByText('stub-save'));
    await waitFor(() => expect(vi.mocked(createInvoice)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createInvoice).mock.calls[0][0]).toMatchObject({ currency: 'EUR' });
  });

  it('preserves an imported line discount_percent when editing from the list', async () => {
    listState.rows = [{ ...RAW_INVOICE }];
    listState.isEmpty = false;
    vi.mocked(updateInvoice).mockClear();
    renderPage();
    // Open the row actions menu, then choose Edit — this runs handleEditInvoice.
    // The responsive table renders a desktop + a card trigger; drive the first.
    fireEvent.click((await screen.findAllByRole('button', { name: /actions for invo-0001/i }))[0]);
    fireEvent.click((await screen.findAllByRole('menuitem', { name: /edit/i }))[0]);
    // The edit modal opens with the normalized line items; save replays them.
    fireEvent.click(await screen.findByText('stub-save'));
    await waitFor(() => expect(vi.mocked(updateInvoice)).toHaveBeenCalledTimes(1));
    const items = vi.mocked(updateInvoice).mock.calls[0][2] as Array<{ discount_percent?: number }>;
    expect(items[0].discount_percent).toBe(10);
  });
});
