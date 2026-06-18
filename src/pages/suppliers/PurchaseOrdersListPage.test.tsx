import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PurchaseOrdersListPage from './PurchaseOrdersListPage';

// The Total Value KPI sums purchase orders across documents, so it MUST use the
// base-currency shadow (total_amount_base), never the raw native total_amount —
// otherwise a multi-currency tenant adds e.g. OMR to EUR under one symbol. With
// server-side pagination the value stat also has to be a GLOBAL aggregate, not a
// reduction over the rendered page.
const { poSelectSpy } = vi.hoisted(() => ({ poSelectSpy: vi.fn() }));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

// formatCurrency echoes the raw number so the rendered card text is exactly the
// summed value — the assertion target.
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => String(n) }),
}));

vi.mock('../../lib/supabaseClient', () => {
  // 100 @ base 38, plus 50 @ base 50 ⇒ base total 88. Raw native sum is 150.
  const poResult = {
    data: [
      { id: 'po1', po_number: 'PO-001', order_date: null, expected_delivery_date: null, created_at: '2026-01-01', total_amount: 100, total_amount_base: 38, supplier: null, status: null, status_id: null },
      { id: 'po2', po_number: 'PO-002', order_date: null, expected_delivery_date: null, created_at: '2026-01-02', total_amount: 50, total_amount_base: 50, supplier: null, status: null, status_id: null },
    ],
    count: 2,
    error: null,
  };
  // Status name → id map so the pending/approved counts resolve their ids.
  const statusResult = {
    data: [
      { id: 'd', name: 'Draft' },
      { id: 'o', name: 'Ordered' },
      { id: 'a', name: 'Approved' },
      { id: 'r', name: 'Received' },
    ],
    error: null,
  };
  const makeChain = (result: unknown, selectSpy?: (...a: unknown[]) => unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'or', 'eq', 'order', 'range', 'gte', 'lte', 'ilike', 'in']) {
      chain[m] = vi.fn(() => chain);
    }
    if (selectSpy) {
      chain.select = vi.fn((...a: unknown[]) => {
        selectSpy(...a);
        return chain;
      });
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'master_purchase_order_statuses') return makeChain(statusResult);
        // purchase_orders.select() is captured so we can assert the value stat
        // query widened to include total_amount_base.
        return makeChain(poResult, poSelectSpy);
      }),
    },
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PurchaseOrdersListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PurchaseOrdersListPage — Total Value must sum base currency', () => {
  beforeEach(() => poSelectSpy.mockReset());

  it('sums total_amount_base across mixed-currency POs, never the raw native total', async () => {
    renderPage();
    // base total = 38 + 50 = 88 (the native sum 100 + 50 = 150 would be wrong)
    await waitFor(() => expect(screen.getByText('88')).toBeInTheDocument());
    expect(screen.queryByText('150')).not.toBeInTheDocument();
  });

  it('selects the total_amount_base shadow column for the global value stat', async () => {
    renderPage();
    await waitFor(() =>
      expect(poSelectSpy).toHaveBeenCalledWith(expect.stringContaining('total_amount_base')),
    );
  });

  it('renders a pager driven by the server count', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/of 2/)).toBeInTheDocument());
  });
});
