import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { getEInvoiceReadiness, setEInvoiceApplicable } = vi.hoisted(() => ({
  getEInvoiceReadiness: vi.fn(),
  setEInvoiceApplicable: vi.fn(),
}));
vi.mock('../../lib/einvoiceReadinessService', () => ({ getEInvoiceReadiness, setEInvoiceApplicable }));

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: { regime: { tax: 'in_gst' } } as { regime: { tax: string } },
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useTenantConfig: () => ({ config: mockConfig }),
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ success: toastSuccess, error: toastError }) }));

import { EInvoiceReadinessCard } from './EInvoiceReadinessCard';

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EInvoiceReadinessCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.regime.tax = 'in_gst';
  getEInvoiceReadiness.mockResolvedValue({ applicable: false, marked_at: null });
  setEInvoiceApplicable.mockResolvedValue(undefined);
});

describe('EInvoiceReadinessCard', () => {
  it('renders nothing for a non-in_gst tenant (regime data key, not a country literal)', () => {
    mockConfig.regime.tax = 'simple_vat';
    const { container } = renderCard();
    expect(container.firstChild).toBeNull();
    expect(getEInvoiceReadiness).not.toHaveBeenCalled(); // query disabled too
  });

  it('renders the applicability toggle for an in_gst tenant', async () => {
    renderCard();
    expect(
      await screen.findByLabelText('E-invoicing is applicable to this business'),
    ).not.toBeChecked();
    expect(screen.queryByRole('alert')).toBeNull(); // no warning while off
  });

  it('shows the LOUD manual-IRP warning when the flag is on', async () => {
    getEInvoiceReadiness.mockResolvedValue({ applicable: true, marked_at: '2026-07-05T00:00:00.000Z' });
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('xSuite does not yet generate IRNs');
    expect(alert.textContent).toContain('IRP');
  });

  it('persists the toggle through the service and toasts', async () => {
    renderCard();
    fireEvent.click(await screen.findByLabelText('E-invoicing is applicable to this business'));
    await waitFor(() => expect(setEInvoiceApplicable).toHaveBeenCalledWith(true));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });
});
