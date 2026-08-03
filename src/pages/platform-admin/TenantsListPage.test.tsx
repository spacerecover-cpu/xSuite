import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/platformAdminService', () => ({
  getTenantsList: vi.fn().mockResolvedValue([]),
  suspendTenant: vi.fn(),
  reactivateTenant: vi.fn(),
}));

import { TenantsListPage } from './TenantsListPage';

// tenants_status_check (baseline migration) — the status filter is an exact
// .eq('status', …), so any option outside this set can never match a row.
const TENANT_STATUS_VALUES = ['trial', 'active', 'suspended', 'cancelled', 'deleted'];

describe('TenantsListPage status filter', () => {
  it('only offers status values that exist in the tenants status vocabulary', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><TenantsListPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    const statusSelect = await screen.findByDisplayValue('All Statuses');
    const values = Array.from(statusSelect.querySelectorAll('option'))
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean);

    expect(values.length).toBeGreaterThan(0);
    values.forEach((v) => expect(TENANT_STATUS_VALUES).toContain(v));
    expect(values).toContain('trial');
  });
});
