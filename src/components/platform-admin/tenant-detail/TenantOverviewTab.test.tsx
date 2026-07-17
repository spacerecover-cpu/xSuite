import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantOverviewTab } from './TenantOverviewTab';
import type { Database } from '@/types/database.types';

vi.mock('@/lib/platformAdminService', () => ({
  getHealthMetricsHistory: vi.fn().mockResolvedValue([]),
}));

type Tenant = Database['public']['Tables']['tenants']['Row'];

const baseTenant = {
  id: 't1',
  name: 'Acme Lab',
  tenant_code: 'ACME',
  limits: {},
  metadata: {},
} as unknown as Tenant;

const renderTab = (tenant: Tenant) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TenantOverviewTab tenant={tenant} userCount={12} caseCount={340} />
    </QueryClientProvider>,
  );
};

describe('TenantOverviewTab — usage limits', () => {
  it('does not render a misleading "/ 0" denominator when no limit is configured', () => {
    renderTab(baseTenant);
    expect(screen.queryByText(/12\s*\/\s*0/)).toBeNull();
    expect(screen.queryByText(/340\s*\/\s*0/)).toBeNull();
    expect(screen.queryByText(/0 GB \/ 0 GB/)).toBeNull();
  });

  it('renders count with a limit when limits are configured', () => {
    renderTab({ ...baseTenant, limits: { users: 25 } } as unknown as Tenant);
    expect(screen.getByText(/12\s*\/\s*25/)).toBeInTheDocument();
  });
});
