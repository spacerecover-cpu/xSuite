import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { getEInvoiceReadiness } = vi.hoisted(() => ({ getEInvoiceReadiness: vi.fn() }));
vi.mock('../../lib/einvoiceReadinessService', () => ({ getEInvoiceReadiness }));

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: { regime: { tax: 'in_gst' } } as { regime: { tax: string } },
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useTenantConfig: () => ({ config: mockConfig }),
}));

import { EInvoiceReadinessBanner } from './EInvoiceReadinessBanner';

function renderBanner() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EInvoiceReadinessBanner />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.regime.tax = 'in_gst';
});

describe('EInvoiceReadinessBanner', () => {
  it('renders the loud warning when in_gst + flag on', async () => {
    getEInvoiceReadiness.mockResolvedValue({ applicable: true, marked_at: '2026-07-05T00:00:00.000Z' });
    renderBanner();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('manual IRP registration required');
    expect(alert.textContent).toContain('not a valid tax invoice');
  });

  it('renders nothing when the flag is off', async () => {
    getEInvoiceReadiness.mockResolvedValue({ applicable: false, marked_at: null });
    const { container } = renderBanner();
    // settle the query, then assert emptiness
    await new Promise((r) => setTimeout(r, 0));
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing (and never queries) for a non-in_gst tenant even with stale flag data', () => {
    mockConfig.regime.tax = 'simple_vat';
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
    expect(getEInvoiceReadiness).not.toHaveBeenCalled();
  });
});
