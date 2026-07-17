import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceiveStockModal } from './ReceiveStockModal';
import { receiveStockFromPO } from '../../lib/stockService';

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

vi.mock('../../lib/stockService', () => ({
  getStockItems: vi.fn().mockResolvedValue([]),
  receiveStockFromPO: vi.fn().mockResolvedValue(undefined),
}));

// The modal now reads already-received quantities from purchase_order_items.
// This thenable stub returns a partially-received line (4 of 10 received).
vi.mock('../../lib/supabaseClient', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: [{ id: 'poi-1', received_quantity: 4 }], error: null });
    return chain;
  };
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

const items = [
  { id: 'poi-1', description: 'HDD donor drive', quantity: 10, unit_price: 25, stock_item_id: 'stk-1' },
];

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReceiveStockModal
        isOpen
        onClose={() => {}}
        purchaseOrderId="po-1"
        purchaseOrderItems={items}
        onSuccess={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('ReceiveStockModal — outstanding-quantity default', () => {
  beforeEach(() => {
    vi.mocked(receiveStockFromPO).mockClear();
  });

  it('pre-fills Qty Received with the remaining outstanding quantity, not the full ordered qty', async () => {
    renderModal();
    const qtyInput = await screen.findByPlaceholderText('0');
    // 10 ordered, 4 already received -> remaining 6 (NOT 10).
    await waitFor(() => expect(qtyInput).toHaveValue(6));
    expect(screen.getByText(/Already received: 4/)).toBeInTheDocument();
  });
});
