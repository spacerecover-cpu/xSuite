import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PurchaseOrderFormModal from './PurchaseOrderFormModal';

// --- Mocks ------------------------------------------------------------------

// Chainable Supabase stub: master-data list queries resolve to [] and the
// next-number RPC returns a fixed value — enough to render the form.
vi.mock('../../lib/supabaseClient', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
      rpc: vi.fn(() => Promise.resolve({ data: 'PO000001', error: null })),
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) },
    },
    resolveTenantId: vi.fn(async () => 'tenant-1'),
  };
});

vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
    currencyFormat: { decimalPlaces: 2, currencySymbol: '$' },
  }),
}));
vi.mock('../../contexts/TenantConfigContext', () => ({ useTaxConfig: () => ({ defaultRate: 5 }) }));
// Submit-only helpers — stubbed so importing the modal never pulls their real deps.
vi.mock('../../lib/currencyService', () => ({ resolveRateContext: vi.fn(async () => ({})) }));
vi.mock('../../lib/purchaseOrderBase', () => ({ buildPoBaseColumns: vi.fn(() => ({})) }));

function renderModal(props: Partial<React.ComponentProps<typeof PurchaseOrderFormModal>> = {}) {
  return render(
    <PurchaseOrderFormModal isOpen onClose={() => {}} onSuccess={() => {}} {...props} />,
  );
}

// One component drives Add and Edit, so the whole field set must render in both.
const SHARED_LABELS = [
  /po number/i,
  /order date/i,
  /expected delivery/i,
  /shipping method/i,
  /shipping address/i,
];

function expectSharedFields() {
  for (const label of SHARED_LABELS) {
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  }
  // The two lookups (Supplier, Status) render their floating labels in both modes.
  expect(screen.getByText('Supplier')).toBeInTheDocument();
  expect(screen.getByText('Status')).toBeInTheDocument();
}

const EDIT_PO = {
  id: 'po-1',
  po_number: 'PO000042',
  supplier_id: 's1',
  status_id: 'st1',
  order_date: '2026-07-01',
  expected_delivery: '2026-07-10',
  shipping_address: '1 Dock St',
  shipping_method: 'DHL',
  notes: 'n',
  internal_notes: 'i',
  line_items: [{ description: 'Part', quantity: 2, unit_price: 5, total: 10 }],
};

describe('PurchaseOrderFormModal — Add and Edit match', () => {
  it('renders the shared field set in create (Add) mode', async () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Create Purchase Order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create purchase order/i })).toBeInTheDocument();
    // Create-only: the next PO number is auto-loaded, and PO Number is editable.
    expect(await screen.findByDisplayValue('PO000001')).toBeInTheDocument();
    expect(screen.getByLabelText(/po number/i)).not.toBeDisabled();

    expectSharedFields();
  });

  it('renders the same shared field set in edit mode, prefilled', () => {
    renderModal({ purchaseOrder: EDIT_PO });

    expect(screen.getByRole('heading', { name: 'Edit Purchase Order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update purchase order/i })).toBeInTheDocument();

    // Every shared field renders identically to Add.
    expectSharedFields();

    // Prefilled from the record — confirms edit binds to the same fields.
    expect((screen.getByLabelText(/shipping method/i) as HTMLInputElement).value).toBe('DHL');
    // Intentional Edit delta: the assigned number is shown but locked.
    const poNumber = screen.getByLabelText(/po number/i) as HTMLInputElement;
    expect(poNumber.value).toBe('PO000042');
    expect(poNumber).toBeDisabled();
  });
});
