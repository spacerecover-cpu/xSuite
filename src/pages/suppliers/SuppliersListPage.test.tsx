import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SuppliersListPage from './SuppliersListPage';

// --- Mocks ------------------------------------------------------------------
//
// The Total Spend (YTD) stat sums purchase_orders across documents. That
// cross-document sum must use the base-currency shadow (total_amount_base),
// never the raw native total_amount — otherwise a multi-currency tenant adds
// e.g. OMR to EUR under one symbol.

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
  // suppliers list + count queries and categories resolve empty; purchase_orders
  // feeds the mixed-currency rows. A universal thenable chain answers every
  // builder method (select/is/or/eq/order/range…) so the paged list query and
  // the head:count stats queries both resolve. purchase_orders.select() is
  // captured so we can assert the query widened to include total_amount_base.
  const thenableChain = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'or', 'eq', 'order', 'range', 'gte', 'lte', 'ilike', 'in']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  };
  const purchaseOrdersChain = () => ({
    // 100 @ base 38, plus 50 @ base 50 ⇒ base total 88. Raw native sum is 150.
    select: poSelectSpy.mockReturnValue(
      Promise.resolve({
        data: [
          { total_amount: 100, total_amount_base: 38 },
          { total_amount: 50, total_amount_base: 50 },
        ],
        error: null,
      }),
    ),
  });
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'purchase_orders') return purchaseOrdersChain();
        if (table === 'master_supplier_categories') return thenableChain({ data: [], error: null });
        return thenableChain({ data: [], count: 0, error: null });
      }),
    },
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SuppliersListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SuppliersListPage — Total Spend must sum base currency', () => {
  beforeEach(() => poSelectSpy.mockReset());

  it('sums total_amount_base across mixed-currency POs, never the raw native total', async () => {
    renderPage();

    // base total = 38 + 50 = 88 (the native sum 100 + 50 = 150 would be wrong)
    await waitFor(() => expect(screen.getByText('88')).toBeInTheDocument());
    expect(screen.queryByText('150')).not.toBeInTheDocument();
  });

  it('selects the total_amount_base shadow column (fix is a no-op otherwise)', async () => {
    renderPage();

    await waitFor(() =>
      expect(poSelectSpy).toHaveBeenCalledWith(expect.stringContaining('total_amount_base')),
    );
  });
});
