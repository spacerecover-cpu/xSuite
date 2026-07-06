import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerFormModal } from './CustomerFormModal';

// --- Mocks ------------------------------------------------------------------

const { createCompanySpy, createCustomerSpy } = vi.hoisted(() => ({
  createCompanySpy: vi.fn(),
  createCustomerSpy: vi.fn(),
}));

vi.mock('../../lib/companyService', () => ({ createCompany: createCompanySpy }));
vi.mock('../../lib/customerService', () => ({ createCustomer: createCustomerSpy }));

const { validatePureSpy } = vi.hoisted(() => ({
  validatePureSpy: vi.fn((): { ok: boolean; error: string | null } => ({ ok: true, error: null })),
}));
vi.mock('../../lib/regimes/partyTaxValidation', () => ({
  validatePartyTaxNumberPure: validatePureSpy,
}));
vi.mock('../../lib/geoSubdivisionService', () => ({
  listSubdivisions: vi.fn(async () => []),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'user-1', tenant_id: 'tenant-1' } }),
}));

vi.mock('../shared/UsageLimitGuard', () => ({
  UsageLimitGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Minimal chainable Supabase stub: every list query resolves to [] and every
// maybeSingle() resolves to null, which is enough to render the form.
vi.mock('../../lib/supabaseClient', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
      rpc: vi.fn(() => Promise.resolve({ data: 'COMP-0001', error: null })),
    },
  };
});

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerFormModal isOpen onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('CustomerFormModal — inline Add New Company', () => {
  beforeEach(() => {
    createCompanySpy.mockReset();
    createCustomerSpy.mockReset();
    createCompanySpy.mockResolvedValue({
      id: 'new-co',
      company_number: 'COMP-0001',
      company_name: 'Acme Corp',
      name: 'Acme Corp',
    });
  });

  it('opens the Add New Company sub-modal from the Company select', async () => {
    const user = userEvent.setup();
    renderModal();

    expect(screen.getByText('Add New Customer')).toBeInTheDocument();

    // The Company select shows the unique "No company" placeholder.
    await user.click(screen.getByText('No company'));

    // The dropdown (and its "+ Add New Company" footer) must be portaled out of
    // the modal's overflow-clipped panel — i.e. NOT nested inside a dialog
    // overlay — so it can't be clipped/hidden. Guards the `usePortal` fix.
    const addNewBtn = await screen.findByRole('button', { name: /add new company/i });
    expect(addNewBtn.closest('[data-testid="dialog-overlay"]')).toBeNull();

    await user.click(addNewBtn);

    // The "Company Name" field of the sub-modal must be reachable.
    expect(await screen.findByPlaceholderText('Enter company name')).toBeInTheDocument();
  });

  it('creates a company through the sub-modal and closes it', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('No company'));
    await user.click(await screen.findByRole('button', { name: /add new company/i }));

    const nameInput = await screen.findByPlaceholderText('Enter company name');
    await user.type(nameInput, 'Acme Corp');
    await user.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() =>
      expect(createCompanySpy).toHaveBeenCalledWith({ name: 'Acme Corp', created_by: 'user-1' }),
    );

    // Sub-modal closes on success.
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Enter company name')).not.toBeInTheDocument(),
    );
  });

  it('persists structured address fields alongside the legacy address blob', async () => {
    const user = userEvent.setup();
    createCustomerSpy.mockResolvedValue({ id: 'cust-1' });
    renderModal();

    await user.type(screen.getByLabelText(/customer name/i), 'Jane Doe');
    await user.type(screen.getByLabelText('Address line 1'), 'Bldg 12');
    await user.type(screen.getByLabelText('Postal Code'), '133');
    await user.click(screen.getByRole('button', { name: /create customer/i }));

    await waitFor(() =>
      expect(createCustomerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          address_line1: 'Bldg 12',
          address_line2: null,
          subdivision_id: null,
          postal_code: '133',
        }),
      ),
    );
  });
});

describe('CustomerFormModal — tax registration number (GSTIN) capture', () => {
  beforeEach(() => {
    validatePureSpy.mockReset();
    validatePureSpy.mockReturnValue({ ok: true, error: null });
    createCustomerSpy.mockReset();
    createCustomerSpy.mockResolvedValue({ id: 'cust-1' });
  });

  it('blocks submit and shows the validator error for an invalid tax number', async () => {
    const user = userEvent.setup();
    validatePureSpy.mockReturnValue({
      ok: false, error: 'GSTIN check character is invalid — please re-check the number.',
    });
    renderModal();
    await user.type(screen.getByLabelText(/customer name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/tax registration number/i), '29ABCDE1234F1Z5');
    await user.click(screen.getByRole('button', { name: /create customer/i }));
    expect(await screen.findByText(/check character is invalid/i)).toBeInTheDocument();
    expect(createCustomerSpy).not.toHaveBeenCalled();
  });

  it('includes tax_number in the createCustomer payload when valid', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText(/customer name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/tax registration number/i), '29AAACX0000X1ZW');
    await user.click(screen.getByRole('button', { name: /create customer/i }));
    await waitFor(() =>
      expect(createCustomerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ tax_number: '29AAACX0000X1ZW' }),
      ),
    );
  });
});
