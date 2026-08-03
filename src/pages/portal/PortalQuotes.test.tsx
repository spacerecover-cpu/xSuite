import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../contexts/PortalAuthContext', () => ({
  usePortalAuth: () => ({ customer: { id: 'cust1', customer_name: 'Jane' } }),
}));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => `$${n}` }),
}));
vi.mock('../../lib/portalVisibility', () => ({
  fetchPortalVisibility: vi.fn().mockResolvedValue([]),
  getCaseIdsWithFlag: () => ['case1'],
}));

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../../lib/supabaseClient', () => {
  const quote = {
    id: 'q1',
    quote_number: 'QT-0001',
    subtotal: 100,
    tax_amount: 0,
    discount_amount: 0,
    total_amount: 100,
    status: 'pending_approval',
    valid_until: null,
    notes: null,
    approved_at: null,
    approved_by: null,
    created_at: '2026-06-02T00:00:00Z',
    case_id: 'case1',
    cases: { case_no: 'C-1', title: 'RAID rebuild' },
  };
  const chain = (table: string) => {
    const rows = table === 'case_quotes' ? [quote] : [];
    const self: Record<string, unknown> = {};
    for (const m of ['select', 'in', 'is', 'eq']) self[m] = () => self;
    self.order = () => Promise.resolve({ data: rows, error: null });
    return self;
  };
  return { supabase: { from: (t: string) => chain(t), rpc } };
});

import { PortalQuotes } from './PortalQuotes';

const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
  >
    {ui}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
});

/** Open the pending quote's detail modal, then the approve confirmation modal. */
const openApproveModal = async () => {
  render(wrap(<PortalQuotes />));
  fireEvent.click(await screen.findByRole('button', { name: /Open quote QT-0001/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Approve Quote' }));
  return screen.findByRole('button', { name: 'Confirm Approval' });
};

it('surfaces the RPC reason when approving a quote fails', async () => {
  // supabase-js resolves with an error object; the mutationFn throws it.
  rpc.mockResolvedValue({ data: null, error: { message: 'Quote has expired' } });

  fireEvent.click(await openApproveModal());

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Quote has expired');
  // The modal must stay open so the customer can retry.
  expect(screen.getByRole('button', { name: 'Confirm Approval' })).toBeInTheDocument();
});

it('falls back to a generic message when the failure carries no message', async () => {
  rpc.mockRejectedValue({});

  fireEvent.click(await openApproveModal());

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not approve this quote. Please try again.',
  );
});

it('surfaces the RPC reason when rejecting a quote fails', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'Quote already processed' } });

  render(wrap(<PortalQuotes />));
  fireEvent.click(await screen.findByRole('button', { name: /Open quote QT-0001/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reject Quote' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm Rejection' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Quote already processed');
});

it('shows no error alert on a successful approval', async () => {
  rpc.mockResolvedValue({ data: true, error: null });

  fireEvent.click(await openApproveModal());

  await waitFor(() => expect(rpc).toHaveBeenCalledWith('approve_quote', { p_quote_id: 'q1' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
