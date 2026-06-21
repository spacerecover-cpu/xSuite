import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/chainOfCustodyService', () => ({
  fetchCustomerTimeline: vi.fn(async () => [
    { id: 'h1', action: 'checkout', details: null, old_value: null, new_value: null, performed_by: 'u1', created_at: '2026-06-19T00:00:00Z', actor_name: 'Tech A' },
  ]),
}));
vi.mock('../shared/ActivityTimeline', () => ({
  ActivityTimeline: ({ entries }: { entries: unknown[] }) => <div data-testid="timeline">{entries.length} events</div>,
}));

import { CustomerTimelineTab } from './CustomerTimelineTab';

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CustomerTimelineTab customerId="cust-1" />
    </QueryClientProvider>,
  );
}

describe('CustomerTimelineTab', () => {
  it('renders the activity timeline with the fetched entries', async () => {
    renderTab();
    expect(await screen.findByTestId('timeline')).toHaveTextContent('1 events');
  });

  it('shows an empty state when there is no activity', async () => {
    const { fetchCustomerTimeline } = await import('../../lib/chainOfCustodyService');
    (fetchCustomerTimeline as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce([]);
    renderTab();
    expect(await screen.findByText(/No activity recorded/i)).toBeInTheDocument();
  });
});
