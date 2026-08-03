import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';
import { StockListPage } from './StockListPage';
import { getStockItemsPage } from '../../lib/stockService';

// The low-stock alert banner is rendered BY this page and links to
// /stock?filter=low-stock — i.e. a client-side navigation onto an
// already-mounted page. The deep-link effect must therefore re-run on
// searchParams changes, not only on mount.
vi.mock('../../lib/stockService', () => ({
  getStockItemsPage: vi.fn(async () => ({ rows: [], total: 0 })),
  getStockStats: vi.fn(async () => ({
    totalItems: 5,
    stockValue: 0,
    lowStockCount: 3,
    outOfStockCount: 0,
  })),
  deleteStockItem: vi.fn(),
  fetchAllStockItemsForLabels: vi.fn(async () => []),
}));

vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => String(n) }),
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useCurrencyConfig: () => ({ code: 'AED', symbol: 'AED', decimalPlaces: 2, position: 'before' }),
}));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../hooks/useListPageSize', () => ({ useListPageSize: () => 25 }));

// Data-layer children are irrelevant to the deep-link behaviour under test.
vi.mock('../../components/stock/StockItemsTable', () => ({ StockItemsTable: () => null }));
vi.mock('../../components/stock/StockItemFormModal', () => ({ StockItemFormModal: () => null }));
vi.mock('../../components/stock/StockTransactionModal', () => ({ StockTransactionModal: () => null }));
vi.mock('../../components/stock/StockCategorySelect', () => ({ StockCategorySelect: () => null }));
vi.mock('../../components/stock/SaleableItemsGrid', () => ({ SaleableItemsGrid: () => null }));
vi.mock('../../components/stock/BarcodeLookupInput', () => ({ BarcodeLookupInput: () => null }));
vi.mock('../../components/stock/BulkAdjustmentModal', () => ({ BulkAdjustmentModal: () => null }));
vi.mock('../../components/stock/BulkPriceUpdateModal', () => ({ BulkPriceUpdateModal: () => null }));
vi.mock('../../components/labels/BulkLabelPrintModal', () => ({ BulkLabelPrintModal: () => null }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HeaderSlotProvider>
        <MemoryRouter initialEntries={['/stock']}>
          <StockListPage />
        </MemoryRouter>
      </HeaderSlotProvider>
    </QueryClientProvider>,
  );
}

const lowStockCalls = () =>
  vi.mocked(getStockItemsPage).mock.calls.filter(([filters]) => filters?.lowStock === true);

describe('StockListPage — ?filter=low-stock deep link', () => {
  beforeEach(() => vi.mocked(getStockItemsPage).mockClear());

  it('switches to the Low Stock tab when the alert link navigates the mounted page', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(getStockItemsPage).toHaveBeenCalled());
    expect(lowStockCalls()).toHaveLength(0);

    await user.click(await screen.findByRole('link', { name: /view low stock/i }));

    await waitFor(() => expect(lowStockCalls().length).toBeGreaterThan(0));
  });
});
