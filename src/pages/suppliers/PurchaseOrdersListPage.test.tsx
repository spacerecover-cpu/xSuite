import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';
import PurchaseOrdersListPage from './PurchaseOrdersListPage';

// The Total Value KPI sums purchase orders across documents, so it MUST use the
// base-currency shadow (total_amount_base), never the raw native total_amount —
// otherwise a multi-currency tenant adds e.g. OMR to EUR under one symbol. With
// server-side pagination the value stat also has to be a GLOBAL aggregate, not a
// reduction over the rendered page.
// poMoney.rows is the mutable dataset the value-stat query pages through, so a test
// can supply MORE rows than one PostgREST batch returns and prove the sum accumulates
// every batch instead of truncating at the ~1000-row cap.
const { poSelectSpy, poMoney } = vi.hoisted(() => ({
  poSelectSpy: vi.fn(),
  poMoney: {
    rows: [
      { total_amount: 100, total_amount_base: 38 },
      { total_amount: 50, total_amount_base: 50 },
    ] as Array<{ total_amount: number; total_amount_base: number | null }>,
  },
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

// formatCurrency echoes the raw number so the rendered card text is exactly the
// summed value — the assertion target.
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => String(n) }),
}));

vi.mock('../../lib/supabaseClient', () => {
  // The rendered table + pager (main query, select embeds `supplier:`): 2 rows, count 2.
  const ordersResult = {
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
  // Resolver-based chain: records the select string and the last range() window so
  // the purchase_orders mock can serve the two distinct queries — the main table
  // page vs. the value-stat aggregation, which pages through poMoney.rows.
  const makeChain = (resolve: (state: { select: string; range: [number, number] | null }) => unknown, selectSpy?: (...a: unknown[]) => unknown) => {
    const state: { select: string; range: [number, number] | null } = { select: '', range: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['is', 'or', 'eq', 'order', 'gte', 'lte', 'ilike', 'in']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.select = vi.fn((...a: unknown[]) => {
      state.select = String(a[0] ?? '');
      if (selectSpy) selectSpy(...a);
      return chain;
    });
    chain.range = vi.fn((from: number, to: number) => {
      state.range = [from, to];
      return chain;
    });
    chain.then = (r: (v: unknown) => void) => r(resolve(state));
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'master_purchase_order_statuses') return makeChain(() => statusResult);
        return makeChain((state) => {
          // Main table/pager query embeds the supplier join; return the fixed page.
          if (state.select.includes('supplier:')) return ordersResult;
          // Value-stat aggregation: page poMoney.rows by the requested range. Model
          // the PostgREST db-max-rows cap — EVERY request (ranged or not) returns at
          // most CAP rows, so an unranged fetch-all truncates at CAP (the bug) while
          // the paged loop accumulates each CAP-sized batch.
          const CAP = 1000;
          const from = state.range ? state.range[0] : 0;
          const size = state.range ? state.range[1] - state.range[0] + 1 : CAP;
          return { data: poMoney.rows.slice(from, from + Math.min(size, CAP)), error: null };
        }, poSelectSpy);
      }),
    },
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HeaderSlotProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PurchaseOrdersListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </HeaderSlotProvider>,
  );
}

describe('PurchaseOrdersListPage — Total Value must sum base currency', () => {
  beforeEach(() => {
    poSelectSpy.mockReset();
    poMoney.rows = [
      { total_amount: 100, total_amount_base: 38 },
      { total_amount: 50, total_amount_base: 50 },
    ];
  });

  it('sums total_amount_base across mixed-currency POs, never the raw native total', async () => {
    renderPage();
    // base total = 38 + 50 = 88 (the native sum 100 + 50 = 150 would be wrong)
    await waitFor(() => expect(screen.getByText('88')).toBeInTheDocument());
    expect(screen.queryByText('150')).not.toBeInTheDocument();
  });

  it('sums EVERY PO across batches, not just the first PostgREST page', async () => {
    // 1000 POs @ base 1 fill one batch; 3 more @ base 1 spill into the next. A single
    // unranged fetch caps at ~1000 and would report 1000 — the truncation bug. The
    // paged aggregate must accumulate both batches → 1003.
    poMoney.rows = [
      ...Array.from({ length: 1000 }, () => ({ total_amount: 1, total_amount_base: 1 })),
      ...Array.from({ length: 3 }, () => ({ total_amount: 1, total_amount_base: 1 })),
    ];
    renderPage();
    await waitFor(() => expect(screen.getByText('1003')).toBeInTheDocument());
    expect(screen.queryByText('1000')).not.toBeInTheDocument();
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
