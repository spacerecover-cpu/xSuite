import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DeviceFormModal } from './DeviceFormModal';

// --- Mocks ------------------------------------------------------------------

const { mockToastError, mockToastSuccess, mockRpc } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockRpc: vi.fn((_fn: string) => Promise.resolve({ data: null, error: null } as { data: unknown; error: { message: string } | null })),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ error: mockToastError, success: mockToastSuccess }),
}));

vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', tenant_id: 't1' } }),
}));

// Table-aware chainable Supabase stub: `catalog_device_roles` yields a Donor
// role (so the modal enters the donor branch) and `inventory_items` yields one
// available donor drive. rpc() is the shared spy under assertion.
vi.mock('../../lib/supabaseClient', () => {
  const tableRows: Record<string, unknown[]> = {
    catalog_device_roles: [{ id: 7, name: 'Donor' }],
    inventory_items: [
      {
        id: 'donor-1',
        name: 'Donor Drive',
        model: 'MDL',
        serial_number: 'SN1',
        quantity: 3,
        purchase_price: 0,
        brand_id: 'b1',
        capacity_id: 'c1',
        brand: { name: 'BrandX' },
        capacity: { name: '1TB' },
      },
    ],
  };
  const makeChain = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gt', 'is', 'order', 'limit', 'in', 'update', 'insert']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => makeChain(tableRows[table] ?? [])),
      rpc: mockRpc,
    },
  };
});

function renderDonorModal(onSuccess = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DeviceFormModal
          isOpen
          onClose={vi.fn()}
          caseId="case-1"
          deviceData={{ id: 'dev-1', device_role_id: 7 }}
          onSuccess={onSuccess}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSuccess };
}

async function selectDonorAndSave() {
  // Donor branch is active (role = Donor) → the inventory picker renders.
  await screen.findByText('Select Donor from Inventory');
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: /Donor Drive/i }));

  const save = await screen.findByRole('button', { name: /Save Changes/i });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
}

describe('DeviceFormModal — donor assignment routes through the atomic RPC', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it('calls assign_inventory_to_case with the item/case/notes (not a raw insert)', async () => {
    const { onSuccess } = renderDonorModal();
    await selectDonorAndSave();

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('assign_inventory_to_case', {
        p_item_id: 'donor-1',
        p_case_id: 'case-1',
        p_notes: 'Donor for case device dev-1',
      }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('surfaces an assignment failure instead of silently succeeding', async () => {
    mockRpc.mockImplementation((fn: string) =>
      fn === 'assign_inventory_to_case'
        ? Promise.resolve({ data: null, error: { message: 'Item already assigned to another case' } })
        : Promise.resolve({ data: null, error: null }),
    );

    const { onSuccess } = renderDonorModal();
    await selectDonorAndSave();

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
