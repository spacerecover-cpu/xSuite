import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';
import SuppliersListPage from './SuppliersListPage';

// --- Mocks ------------------------------------------------------------------
//
// The Total Spend stat sums purchase_orders across documents. That
// cross-document sum must use the base-currency shadow (total_amount_base),
// never the raw native total_amount — otherwise a multi-currency tenant adds
// e.g. OMR to EUR under one symbol.

const { poSelectSpy, poIsSpy, supplierSelectSpy, supplierRows } = vi.hoisted(() => ({
  poSelectSpy: vi.fn(),
  poIsSpy: vi.fn(),
  supplierSelectSpy: vi.fn(),
  // Mutable holder so the Location-column test can seed rows without changing
  // what the Total Spend tests see (they rely on an empty suppliers list).
  supplierRows: { current: [] as Record<string, unknown>[] },
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
  // suppliers list + count queries and categories resolve empty; purchase_orders
  // feeds the mixed-currency rows. A universal thenable chain answers every
  // builder method (select/is/or/eq/order/range…) so the paged list query and
  // the head:count stats queries both resolve. purchase_orders.select() is
  // captured so we can assert the query widened to include total_amount_base.
  const thenableChain = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'or', 'eq', 'order', 'range', 'gte', 'lte', 'ilike', 'in', 'limit', 'insert', 'update', 'upsert']) {
      chain[m] = vi.fn(() => chain);
    }
    // Terminal for zero-or-one-row reads (e.g. getOrCreateCompanySettings via
    // the stat-card style hook, which renders alongside this page; its
    // create-defaults insert path chains through the same builder).
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  };
  // Chainable so the spend query can .select(...).is('deleted_at', null) — the
  // soft-delete filter (matching PurchaseOrdersListPage) that excludes deleted POs
  // from the KPI. 100 @ base 38, plus 50 @ base 50 ⇒ base total 88. Raw native
  // sum is 150. select() and is() are captured to assert both fixes are live.
  const purchaseOrdersChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = poSelectSpy.mockReturnValue(chain);
    chain.is = poIsSpy.mockReturnValue(chain);
    // The spend KPI pages through explicit ranges (db-max-rows safety); the
    // two-row resolution below is a short batch, so one .range() call ends it.
    chain.range = vi.fn(() => chain);
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({
        data: [
          { total_amount: 100, total_amount_base: 38 },
          { total_amount: 50, total_amount_base: 50 },
        ],
        error: null,
      });
    return chain;
  };
  // suppliers serves both the paged list and the head:count stat queries; the
  // select string is captured to assert the geo_* embeds that back the Location
  // column are actually requested.
  const suppliersChain = () => {
    const chain = thenableChain({
      data: supplierRows.current,
      count: supplierRows.current.length,
      error: null,
    }) as Record<string, unknown>;
    chain.select = supplierSelectSpy.mockReturnValue(chain);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'purchase_orders') return purchaseOrdersChain();
        if (table === 'master_supplier_categories') return thenableChain({ data: [], error: null });
        if (table === 'suppliers') return suppliersChain();
        return thenableChain({ data: [], count: 0, error: null });
      }),
      // uiPrefsService (collapsible-KPI preference) reads the session user.
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    },
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HeaderSlotProvider>
          <SuppliersListPage />
        </HeaderSlotProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SuppliersListPage — Total Spend must sum base currency', () => {
  beforeEach(() => {
    poSelectSpy.mockReset();
    poIsSpy.mockReset();
    supplierRows.current = [];
  });

  it('sums total_amount_base across mixed-currency POs, never the raw native total', async () => {
    renderPage();

    // base total = 38 + 50 = 88 (the native sum 100 + 50 = 150 would be wrong).
    // The KPI renders currency-formatted (e.g. "$88.00" via useCurrency), so
    // match the number inside the formatted string rather than a bare "88".
    await waitFor(() => expect(screen.getByText(/\b88(\.00)?\b/)).toBeInTheDocument());
    expect(screen.queryByText(/\b150(\.00)?\b/)).not.toBeInTheDocument();
  });

  it('selects the total_amount_base shadow column (fix is a no-op otherwise)', async () => {
    renderPage();

    await waitFor(() =>
      expect(poSelectSpy).toHaveBeenCalledWith(expect.stringContaining('total_amount_base')),
    );
  });

  it('excludes soft-deleted purchase orders from the spend KPI via .is(deleted_at, null)', async () => {
    renderPage();

    await waitFor(() => expect(poIsSpy).toHaveBeenCalledWith('deleted_at', null));
  });
});

// suppliers stores location as FK ids (city_id/country_id), so the Location
// column can only render if the query embeds geo_cities/geo_countries and the
// row mapping reads the resolved names.
describe('SuppliersListPage — Location column resolves city/country FKs', () => {
  beforeEach(() => {
    supplierSelectSpy.mockReset();
    supplierRows.current = [
      {
        id: 'sup-1',
        supplier_number: 'SUP-0001',
        name: 'Gulf Components',
        email: null,
        phone: null,
        is_active: true,
        created_at: '2026-01-05T10:00:00Z',
        category_id: null,
        category: null,
        payment_terms: null,
        geo_cities: { name: 'Muscat' },
        geo_countries: { name: 'Oman' },
      },
    ];
  });

  it('embeds the geo_* relations in the suppliers query', async () => {
    renderPage();

    await waitFor(() =>
      expect(supplierSelectSpy).toHaveBeenCalledWith(
        expect.stringContaining('geo_cities(name)'),
        expect.anything(),
      ),
    );
    expect(supplierSelectSpy).toHaveBeenCalledWith(
      expect.stringContaining('geo_countries(name)'),
      expect.anything(),
    );
  });

  it('renders the resolved city and country instead of a placeholder dash', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Muscat, Oman')).toBeInTheDocument());
  });
});
