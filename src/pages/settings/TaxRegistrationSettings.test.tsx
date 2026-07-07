// src/pages/settings/TaxRegistrationSettings.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const svc = vi.hoisted(() => ({
  getPrimaryLegalEntity: vi.fn(),
  getActiveTaxRegistration: vi.fn(),
  createTaxRegistration: vi.fn(),
  endTaxRegistration: vi.fn(),
  getDeclaredRegistrationStatus: vi.fn(),
  setDeclaredRegistrationStatus: vi.fn(),
  getBranchStateMismatches: vi.fn(),
}));
vi.mock('../../lib/taxRegistrationService', () => svc);

// Controllable (hoisted) mocks so a test can switch regime/subdivisions.
const geo = vi.hoisted(() => ({ listCountrySubdivisions: vi.fn() }));
vi.mock('../../lib/geoCountryService', () => ({
  geoCountryService: { listCountrySubdivisions: geo.listCountrySubdivisions },
}));
const gstin = vi.hoisted(() => ({ validateGSTIN: vi.fn() }));
vi.mock('../../lib/regimes/in_gst/gstin', () => ({ validateGSTIN: gstin.validateGSTIN }));

const GST_CONFIG = {
  system: 'GST', label: 'GST', numberLabel: 'GSTIN',
  numberFormat: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$',
  numberPlaceholder: '22AAAAA0000A1Z5', defaultRate: 18, invoiceRequired: true,
};
const cfg = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../../contexts/TenantConfigContext', () => ({ useTaxConfig: () => cfg.value }));

vi.mock('../../components/layout/SettingsPageHeader', () => ({
  SettingsPageHeader: () => null,
}));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { TaxRegistrationSettings } from './TaxRegistrationSettings';

const registration = {
  id: 'r1', legal_entity_id: 'le1', country_id: 'c-in', subdivision_id: 's-ka',
  tax_number: '29ABCDE1234F1Z5', scheme: 'standard', registered_from: '2026-04-01',
  registered_to: null, is_primary: true, tenant_id: 't1', created_at: '', updated_at: null, deleted_at: null,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}><TaxRegistrationSettings /></QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.values(svc).forEach((m) => m.mockReset());
  svc.getPrimaryLegalEntity.mockResolvedValue({ id: 'le1', country_id: 'c-in' });
  svc.getBranchStateMismatches.mockResolvedValue([]);
  geo.listCountrySubdivisions.mockReset();
  geo.listCountrySubdivisions.mockResolvedValue([
    { id: 's-ka', code: 'IN-KA', name: 'Karnataka', subdivision_type: 'state', tax_authority_code: '29' },
  ]);
  gstin.validateGSTIN.mockReset();
  gstin.validateGSTIN.mockReturnValue({ ok: true, error: null });
  cfg.value = { ...GST_CONFIG };
});

describe('TaxRegistrationSettings', () => {
  it('registered tenant: shows the GSTIN and the Registered state', async () => {
    svc.getActiveTaxRegistration.mockResolvedValue(registration);
    svc.getDeclaredRegistrationStatus.mockResolvedValue('registered');
    renderPage();
    expect(await screen.findByText('29ABCDE1234F1Z5')).toBeInTheDocument();
    expect(screen.getByText(/^registered$/i)).toBeInTheDocument();
  });

  it('declared-unregistered tenant: renders the LOUD warning', async () => {
    svc.getActiveTaxRegistration.mockResolvedValue(null);
    svc.getDeclaredRegistrationStatus.mockResolvedValue('unregistered');
    renderPage();
    // Loud unregistered banner body (phrase unique to the banner — the form
    // footer note also contains "without GST", so target the banner directly).
    expect(await screen.findByText(/plain invoices, no tax lines/i)).toBeInTheDocument();
    expect(screen.getByText(/not gst registered/i)).toBeInTheDocument();
  });

  it('undeclared tenant: renders the action-required state (D6 — never silent)', async () => {
    svc.getActiveTaxRegistration.mockResolvedValue(null);
    svc.getDeclaredRegistrationStatus.mockResolvedValue(undefined);
    renderPage();
    expect(await screen.findByText(/registration status is not set/i)).toBeInTheDocument();
  });

  it('branch-state mismatch: renders the warning banner naming the branch', async () => {
    svc.getActiveTaxRegistration.mockResolvedValue(registration);
    svc.getDeclaredRegistrationStatus.mockResolvedValue('registered');
    svc.getBranchStateMismatches.mockResolvedValue([
      { branchId: 'b2', branchName: 'Mumbai Intake Desk', branchSubdivisionId: 's-mh' },
    ]);
    renderPage();
    expect(await screen.findByText(/Mumbai Intake Desk/)).toBeInTheDocument();
    expect(screen.getByText(/multi-state gstin management is not yet available/i)).toBeInTheDocument();
  });

  it('same-day unregister ends the registration on YESTERDAY so status flips today (C4)', async () => {
    svc.getActiveTaxRegistration.mockResolvedValue(registration);
    svc.getDeclaredRegistrationStatus.mockResolvedValue('registered');
    svc.endTaxRegistration.mockResolvedValue(undefined);
    svc.setDeclaredRegistrationStatus.mockResolvedValue(undefined);
    renderPage();

    // Registered card → open the form → click the loud unregister button.
    fireEvent.click(await screen.findByRole('button', { name: /change gstin/i }));
    fireEvent.click(await screen.findByRole('button', { name: /we are not gst registered/i }));

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await waitFor(() => expect(svc.endTaxRegistration).toHaveBeenCalledWith('r1', yesterday));
    // registered_from '2026-04-01' precedes yesterday, so the clamp keeps yesterday.
    expect(svc.setDeclaredRegistrationStatus).toHaveBeenCalledWith('unregistered');
  });

  it('non-GST regime (no GST-coded subdivisions): a valid non-GSTIN number can be saved (C3)', async () => {
    // UAE-style VAT tenant: TRN = 15 digits, no GST-coded subdivisions. The India
    // GSTIN validator must NOT run — it would reject a valid TRN and block Save.
    cfg.value = {
      system: 'VAT', label: 'VAT', numberLabel: 'TRN',
      numberFormat: '^[0-9]{15}$', numberPlaceholder: '100000000000003',
      defaultRate: 5, invoiceRequired: true,
    };
    geo.listCountrySubdivisions.mockResolvedValue([]);
    gstin.validateGSTIN.mockReturnValue({ ok: false, error: 'GSTIN must be 15 characters…' });
    svc.getPrimaryLegalEntity.mockResolvedValue({ id: 'le1', country_id: 'c-ae' });
    svc.getActiveTaxRegistration.mockResolvedValue(null);
    svc.getDeclaredRegistrationStatus.mockResolvedValue(undefined);

    renderPage();
    const input = await screen.findByLabelText(/TRN/i);
    fireEvent.change(input, { target: { value: '100000000000003' } });

    const save = screen.getByRole('button', { name: /save as registered/i });
    expect(save).not.toBeDisabled();
    // The India-specific validator was never invoked for this non-GST tenant.
    expect(gstin.validateGSTIN).not.toHaveBeenCalled();
  });
});
