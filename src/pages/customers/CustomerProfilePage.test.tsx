import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Regression guard: the customer detail read must filter soft-deleted rows the
// same way CustomersListPage does, so an archived customer opened by direct URL
// lands on the not-found state instead of a fully actionable profile.
//
// The supabase mock models PostgREST semantics — the archived row is only
// filtered out when `.is('deleted_at', null)` is actually applied.

const ARCHIVED_CUSTOMER = {
  id: 'cust-1',
  customer_number: 'CUST-0001',
  customer_name: 'Archived Customer',
  email: 'archived@example.com',
  deleted_at: '2026-08-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  portal_enabled: true,
  is_active: true,
};

vi.mock('../../lib/supabaseClient', () => {
  const makeChain = (resolve: (softDeleteFiltered: boolean) => unknown) => {
    let softDeleteFiltered = false;
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'or', 'order', 'range', 'gte', 'lte', 'ilike', 'in', 'limit', 'update']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.is = vi.fn((column: string, value: unknown) => {
      if (column === 'deleted_at' && value === null) softDeleteFiltered = true;
      return chain;
    });
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolve(softDeleteFiltered)));
    chain.then = (onFulfilled: (v: unknown) => void) => onFulfilled(resolve(softDeleteFiltered));
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'customers_enhanced') {
          return makeChain((filtered) => ({
            data: filtered ? null : { ...ARCHIVED_CUSTOMER },
            error: null,
          }));
        }
        return makeChain(() => ({ data: [], error: null, count: 0 }));
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    },
    resolveTenantId: vi.fn(async () => 'tenant-1'),
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ id: 'cust-1' }) };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { role: 'admin', tenant_id: 'tenant-1' } }),
}));

vi.mock('../../contexts/TenantConfigContext', () => ({
  useTenantFeature: () => false,
}));

vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

vi.mock('../../lib/portalUrlService', () => ({
  generatePortalLoginUrl: vi.fn(async () => 'https://portal.example.com/login'),
  generateCustomerPortalCredentialsText: vi.fn(async () => 'credentials'),
}));

// The full profile body is heavy and irrelevant here — render a marker so the
// test can assert the page did NOT reach the profile surface.
vi.mock('../../components/templates/DetailPageTemplate', () => ({
  DetailPageTemplate: () => <div>customer-profile-rendered</div>,
}));

import { CustomerProfilePage } from './CustomerProfilePage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CustomerProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomerProfilePage', () => {
  it('shows not-found for a soft-deleted customer instead of the full profile', async () => {
    renderPage();
    expect(await screen.findByText('Not found')).toBeInTheDocument();
    expect(screen.queryByText('customer-profile-rendered')).not.toBeInTheDocument();
  });
});
