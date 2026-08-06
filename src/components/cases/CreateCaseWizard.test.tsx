import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DevicesInCustodyError } from '../../lib/caseIntakeService';
import { CreateCaseWizard } from './CreateCaseWizard';

// The seam is the service layer: the wizard's own form, validity gating and
// failure handling run for real, so the assertions are about what the operator
// is actually offered after a failure.

const { spies, toastSpy, customerRow } = vi.hoisted(() => ({
  spies: {
    createCaseWithDevices: vi.fn(),
    shouldAutoPrintLabel: vi.fn(),
  },
  toastSpy: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  },
  customerRow: {
    id: 'cust-1',
    customer_number: 'CUST-1',
    customer_name: 'Aisha Rahman',
    email: 'aisha@example.com' as string | null,
    mobile_number: '+971500000000' as string | null,
  },
}));

vi.mock('../../lib/caseIntakeService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/caseIntakeService')>();
  return { ...actual, createCaseWithDevices: spies.createCaseWithDevices };
});

vi.mock('../../lib/labelPrefsService', () => ({
  shouldAutoPrintLabel: spies.shouldAutoPrintLabel,
}));

vi.mock('../../hooks/useToast', () => ({ useToast: () => toastSpy }));

vi.mock('../../lib/printUtils', () => ({
  printReceipt: vi.fn(),
  printCustomerCopy: vi.fn(),
}));

vi.mock('../../lib/featureGateService', () => ({
  canPerformAction: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => vi.fn(async () => true),
}));

vi.mock('../customers/CustomerFormModal', () => ({
  CustomerFormModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>customer form</div> : null),
}));

vi.mock('./ServerBulkDrivesModal', () => ({
  ServerBulkDrivesModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>bulk drives</div> : null),
}));

const catalogRows: Record<string, { id: string | number; name: string }[]> = {
  catalog_service_types: [{ id: 'st-1', name: 'Data Recovery' }],
  master_case_priorities: [{ id: 'pri-1', name: 'Normal' }],
  catalog_service_locations: [{ id: 'loc-1', name: 'In-lab' }],
  catalog_device_types: [{ id: 'dt-1', name: 'HDD' }],
  catalog_device_brands: [{ id: 'b-1', name: 'Seagate' }],
  catalog_device_capacities: [{ id: 'cap-1', name: '2 TB' }],
  catalog_device_conditions: [{ id: 'cond-1', name: 'Physically damaged' }],
  catalog_accessories: [{ id: 'acc-1', name: 'Power adapter' }],
  catalog_device_encryption: [{ id: 'enc-1', name: 'None' }],
  catalog_service_problems: [{ id: 'sp-1', name: 'Clicking noise' }],
  catalog_device_roles: [{ id: 1, name: 'Patient' }],
};

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const rows = catalogRows[table] ?? [];
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        select: chain,
        eq: chain,
        is: chain,
        limit: chain,
        order: chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }),
      });
      return builder;
    }),
  },
}));

vi.mock('../../lib/pickerSearch', () => ({
  useCustomerPickerRows: () => ({
    rows: [customerRow],
    isLoading: false,
    onSearchTermChange: vi.fn(),
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'prof-1', tenant_id: 'tenant-1', role: 'manager' },
  }),
}));

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <CreateCaseWizard onClose={onClose} onSuccess={onSuccess} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { onClose, onSuccess };
}

const submitButton = () => screen.getByRole('button', { name: /^create case$/i });

// SearchableSelect's trigger is a div[role=combobox], which no label can name —
// its rendered placeholder is the stable handle.
async function pickFrom(
  user: ReturnType<typeof userEvent.setup>,
  placeholder: string,
  option: RegExp,
) {
  await user.click(await screen.findByText(placeholder));
  await user.click(await screen.findByText(option));
}

async function fillValidCase(user: ReturnType<typeof userEvent.setup>) {
  await pickFrom(user, 'Search by name, number, phone, or email', /Aisha Rahman/);
  await user.type(screen.getByLabelText(/serial number/i), 'WD-991');
  await pickFrom(user, 'Select device problem...', /Clicking noise/);
  await waitFor(() => expect(submitButton()).toBeEnabled());
}

beforeEach(() => {
  vi.clearAllMocks();
  spies.shouldAutoPrintLabel.mockResolvedValue(false);
  spies.createCaseWithDevices.mockResolvedValue({
    caseId: 'case-1',
    caseNumber: 'CASE-0042',
    deviceIds: ['dev-1'],
  });
});

describe('CreateCaseWizard', () => {
  // createCaseWithDevices rejects this way only AFTER the case_devices insert has
  // fired DEVICE_RECEIVED. chain_of_custody is append-only, so a second submit
  // would put one physical hand-over into two cases with two custody ledgers.
  it('does not offer a retry when creation failed with the devices already in custody', async () => {
    spies.createCaseWithDevices.mockRejectedValue(
      new DevicesInCustodyError('Another update is in progress — please retry.', {
        caseId: 'case-1',
        caseNumber: 'CASE-0042',
        deviceIds: ['dev-1'],
      }),
    );
    const user = userEvent.setup();
    renderWizard();
    await fillValidCase(user);
    await user.click(submitButton());

    expect(await screen.findByText(/CASE-0042 was created/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^create case$/i })).not.toBeInTheDocument();
    expect(spies.createCaseWithDevices).toHaveBeenCalledTimes(1);
  });

  // The 40001 message this rejects with is literally 'please retry'. Raising it
  // beside a panel that says the case cannot be created again would send the
  // operator back to a physical hand-over the ledger can no longer take twice.
  it('raises no toast beside the panel that refuses the retry', async () => {
    spies.createCaseWithDevices.mockRejectedValue(
      new DevicesInCustodyError('Another update is in progress — please retry.', {
        caseId: 'case-1',
        caseNumber: 'CASE-0042',
        deviceIds: ['dev-1'],
      }),
    );
    const user = userEvent.setup();
    renderWizard();
    await fillValidCase(user);
    await user.click(submitButton());

    expect(await screen.findByText(/CASE-0042 was created/i)).toBeInTheDocument();
    expect(toastSpy.error).not.toHaveBeenCalled();
  });

  it('still offers a retry when the failure landed before any device entered custody', async () => {
    spies.createCaseWithDevices.mockRejectedValue(new Error('network unreachable'));
    const user = userEvent.setup();
    renderWizard();
    await fillValidCase(user);
    await user.click(submitButton());

    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(screen.queryByText(/was created/i)).not.toBeInTheDocument();
    expect(toastSpy.error).toHaveBeenCalledWith(expect.stringContaining('network unreachable'));
  });
});
