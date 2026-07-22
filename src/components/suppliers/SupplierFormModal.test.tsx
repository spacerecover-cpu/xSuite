import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SupplierFormModal from './SupplierFormModal';

// --- Mocks ------------------------------------------------------------------

// Minimal chainable Supabase stub: master-data list queries resolve to [] and
// the next-number RPC returns a fixed value — enough to render the form.
vi.mock('../../lib/supabaseClient', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
      rpc: vi.fn(() => Promise.resolve({ data: 'SUP00001', error: null })),
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })) },
    },
    resolveTenantId: vi.fn(async () => 'tenant-1'),
  };
});

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../lib/geoSubdivisionService', () => ({
  listSubdivisions: vi.fn(async () => []),
}));

function renderModal(props: Partial<React.ComponentProps<typeof SupplierFormModal>> = {}) {
  return render(
    <SupplierFormModal isOpen onClose={() => {}} onSuccess={() => {}} {...props} />,
  );
}

// SupplierFormModal is ONE component for Add and Edit, so the whole field set
// must render identically in both modes.
const SHARED_LABELS = [
  /company name/i,
  /supplier number/i,
  /^email/i,
  /^phone$/i,
  /tax id/i,
  /website/i,
  /^city$/i,
  /^country$/i,
  /preferred shipping/i,
  /description/i,
  /contact name/i,
  /contact email/i,
];

function expectSharedFields() {
  for (const label of SHARED_LABELS) {
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  }
  // The two lookups (converted to SearchableSelect) render in both modes too.
  expect(screen.getByText('Category')).toBeInTheDocument();
  expect(screen.getByText('Payment Terms')).toBeInTheDocument();
}

const EDIT_SUPPLIER = {
  id: 'sup-1',
  name: 'Globex Parts',
  supplier_number: 'SUP00042',
  email: 'sales@globex.test',
  phone: '+1 555 0100',
  tax_id: 'VAT-9',
  website: 'https://globex.test',
  city: 'Metropolis',
  country: 'US',
  description: 'Donor drives supplier',
  primary_contact_name: 'Jane Roe',
  primary_contact_email: 'jane@globex.test',
  is_active: true,
  is_approved: true,
};

describe('SupplierFormModal — Add and Edit match', () => {
  it('renders the shared field set in create (Add) mode', async () => {
    renderModal();

    expect(screen.getByText('Add New Supplier')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create supplier/i })).toBeInTheDocument();
    // Create-only behavior: the next supplier number is auto-loaded.
    expect(await screen.findByDisplayValue('SUP00001')).toBeInTheDocument();
    // Supplier Number is editable while creating.
    expect(screen.getByLabelText(/supplier number/i)).not.toBeDisabled();

    expectSharedFields();
  });

  it('renders the same shared field set in edit mode, prefilled', () => {
    renderModal({ supplier: EDIT_SUPPLIER });

    expect(screen.getByText('Edit Supplier')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update supplier/i })).toBeInTheDocument();

    // Every shared field renders identically to Add.
    expectSharedFields();

    // Prefilled from the record — confirms edit binds to the same fields.
    expect((screen.getByLabelText(/company name/i) as HTMLInputElement).value).toBe('Globex Parts');
    // Intentional Edit delta: the assigned number is shown but locked.
    const supplierNumber = screen.getByLabelText(/supplier number/i) as HTMLInputElement;
    expect(supplierNumber.value).toBe('SUP00042');
    expect(supplierNumber).toBeDisabled();
  });
});
