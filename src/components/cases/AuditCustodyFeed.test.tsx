import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/chainOfCustodyService', () => ({
  fetchCustodyFeed: vi.fn(async () => ({
    rows: [{ id: 'c1', case_id: 'k1', device_id: 'd1', action: 'DEVICE_CHECKED_OUT',
             action_category: 'transfer', description: 'Device released to MARCELO',
             actor_name: 'Tech A', custody_status: 'checked_out',
             created_at: '2026-06-19T00:00:00Z', case_no: 'C-0032' }],
    total: 1,
  })),
  formatActionType: (s: string) => s,
}));
vi.mock('../../contexts/TenantConfigContext', () => ({ useDateTimeConfig: () => ({}) }));

import { AuditCustodyFeed } from './AuditCustodyFeed';

it('renders a custody event with its case number and actor', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><AuditCustodyFeed page={0} onPageChange={vi.fn()} search="" /></MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText('C-0032')).toBeInTheDocument();
  expect(screen.getByText(/Device released to MARCELO/)).toBeInTheDocument();
});
