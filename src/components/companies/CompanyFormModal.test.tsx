import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CompanyFormModal, type CompanyEditData } from './CompanyFormModal';

// --- Mocks ------------------------------------------------------------------

vi.mock('../../lib/companyService', () => ({
  createCompany: vi.fn(),
  updateCompany: vi.fn(),
  getNextCompanyNumberPreview: vi.fn(async () => 'COMP-0001'),
}));

vi.mock('../../lib/pickerSearch', () => ({
  useCustomerPickerRows: () => ({ rows: [], onSearchTermChange: vi.fn() }),
}));

vi.mock('../../lib/geoSubdivisionService', () => ({
  listSubdivisions: vi.fn(async () => []),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'user-1', tenant_id: 'tenant-1' } }),
}));

// Minimal chainable Supabase stub: list queries resolve to [] and every
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
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

function renderModal(props: Partial<React.ComponentProps<typeof CompanyFormModal>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CompanyFormModal isOpen onClose={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

// The fields that MUST render identically in Add (create) and Edit (profile).
const SHARED_LABELS = [
  /company name/i,
  /vat \/ tax number/i,
  /^email/i,
  /website/i,
  /^address$/i,
  /internal notes/i,
];

const EDIT_COMPANY: CompanyEditData = {
  id: 'co-1',
  company_name: 'Acme Corp',
  tax_number: '123',
  industry_id: null,
  email: 'hi@acme.test',
  phone: null,
  website: null,
  country_id: null,
  city_id: null,
  address: '1 Main St',
  address_line1: 'Bldg 2',
  address_line2: null,
  subdivision_id: null,
  postal_code: '133',
  notes: null,
};

describe('CompanyFormModal — Add and Edit match', () => {
  it('renders the shared field set in create (Add) mode', async () => {
    renderModal();

    expect(screen.getByText('Add New Company')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create company/i })).toBeInTheDocument();
    // Create-only affordances.
    expect(await screen.findByText('COMP-0001')).toBeInTheDocument(); // "Next No." preview
    expect(screen.getByText('No contact')).toBeInTheDocument();       // Primary Contact select
    // The shared, always-present fields.
    for (const label of SHARED_LABELS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('renders the same shared field set in edit (profile) mode, minus the intentional deltas', () => {
    renderModal({ company: EDIT_COMPANY, showAddressDetails: false });

    expect(screen.getByText('Edit Company')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();

    // Every shared field renders identically to Add.
    for (const label of SHARED_LABELS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // Prefilled from the record — confirms edit binds to the same fields.
    expect((screen.getByLabelText(/company name/i) as HTMLInputElement).value).toBe('Acme Corp');

    // Intentional Edit deltas: no next-number badge, no Primary Contact,
    // and (profile Edit is minimal) no structured "Additional address details".
    expect(screen.queryByText('COMP-0001')).not.toBeInTheDocument();
    expect(screen.queryByText('No contact')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Address line 1')).not.toBeInTheDocument();
  });

  it('shows the structured address block in Add (the only field-set difference)', () => {
    renderModal();
    // Add keeps the full structured-address block…
    expect(screen.getByLabelText('Address line 1')).toBeInTheDocument();
  });
});
