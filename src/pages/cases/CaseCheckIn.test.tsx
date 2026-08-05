import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';
import { DevicesInCustodyError } from '../../lib/caseIntakeService';
import { CaseCheckIn } from './CaseCheckIn';

// The seam is the service layer: the four sections and the page's own
// orchestration run for real, so the assertions are about what the front desk
// actually produces, not about mocks calling mocks.

const calls: string[] = [];

const { spies, customerRow } = vi.hoisted(() => ({
  spies: {
    createCaseWithDevices: vi.fn(),
    logCaseIntake: vi.fn(),
    signIntakeReceipt: vi.fn(),
    captureIntakeConsents: vi.fn(),
    createDocumentInstance: vi.fn(),
    shouldAutoPrintLabel: vi.fn(),
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
  return {
    ...actual,
    createCaseWithDevices: spies.createCaseWithDevices,
    logCaseIntake: spies.logCaseIntake,
    signIntakeReceipt: spies.signIntakeReceipt,
    captureIntakeConsents: spies.captureIntakeConsents,
  };
});

vi.mock('../../lib/documentInstanceService', () => ({
  createDocumentInstance: spies.createDocumentInstance,
}));

vi.mock('../../lib/labelPrefsService', () => ({
  shouldAutoPrintLabel: spies.shouldAutoPrintLabel,
}));

const catalogRows: Record<string, { id: string; name: string }[]> = {
  catalog_device_types: [{ id: 'dt-1', name: 'HDD' }],
  catalog_device_brands: [{ id: 'b-1', name: 'Seagate' }],
  catalog_device_capacities: [{ id: 'cap-1', name: '2 TB' }],
  catalog_device_conditions: [{ id: 'cond-1', name: 'Physically damaged' }],
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
        order: () => Promise.resolve({ data: rows, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
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

vi.mock('../../lib/companySettingsService', () => ({
  getOrCreateCompanySettings: vi.fn(async () => ({
    basic_info: { company_name: 'Nova Data Labs' },
  })),
}));

vi.mock('../../components/cases/SignatureCaptureModal', () => ({
  SignatureCaptureModal: ({ open, onCapture }: { open: boolean; onCapture: (s: unknown) => void }) =>
    open ? (
      <button type="button" onClick={() => onCapture({ method: 'typed', typedValue: 'Aisha Rahman' })}>
        confirm signature
      </button>
    ) : null,
}));

vi.mock('../../components/customers/CustomerFormModal', () => ({
  CustomerFormModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>customer form</div> : null),
}));

vi.mock('../../components/cases/EmailDocumentModal', () => ({
  EmailDocumentModal: ({ isOpen, companyName }: { isOpen: boolean; companyName: string }) =>
    isOpen ? (
      <div>
        <div>email modal</div>
        <div data-testid="email-company">{companyName}</div>
      </div>
    ) : null,
}));

vi.mock('../../lib/printUtils', () => ({ printCustomerCopy: vi.fn() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <HeaderSlotProvider>
          <CaseCheckIn />
        </HeaderSlotProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  // SearchableSelect's trigger is a div[role=combobox]; its `name` prop is the
  // only stable handle (the label is wired with htmlFor, which cannot name a div).
  const trigger = document.querySelector('[data-name="customer"]');
  await user.click(trigger as HTMLElement);
  await user.click(await screen.findByText('Aisha Rahman'));
}

async function fillOneDevice(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/condition/i), 'cond-1');
}

const submitButton = () => screen.getByRole('button', { name: /complete check-in/i });

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  customerRow.email = 'aisha@example.com';
  customerRow.mobile_number = '+971500000000';
  spies.createCaseWithDevices.mockImplementation(async () => {
    calls.push('createCaseWithDevices');
    return { caseId: 'case-1', caseNumber: 'CASE-0042', deviceIds: ['dev-1'] };
  });
  spies.createDocumentInstance.mockImplementation(async () => {
    calls.push('createDocumentInstance');
    return { id: 'inst-1' };
  });
  spies.signIntakeReceipt.mockImplementation(async () => {
    calls.push('signIntakeReceipt');
    return 'sig-1';
  });
  spies.logCaseIntake.mockImplementation(async () => {
    calls.push('logCaseIntake');
    return 'batch-1';
  });
  spies.captureIntakeConsents.mockImplementation(async () => {
    calls.push('captureIntakeConsents');
  });
  spies.shouldAutoPrintLabel.mockResolvedValue(false);
});

describe('CaseCheckIn', () => {
  it('will not submit until every device has a recorded condition', async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));

    expect(submitButton()).toBeDisabled();

    await fillOneDevice(user);
    await waitFor(() => expect(submitButton()).toBeEnabled());
  });

  it('will not submit until the terms are accepted', async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);

    expect(submitButton()).toBeDisabled();
  });

  it('runs the evidence sequence in order, signing before the custody event', async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(screen.getByRole('button', { name: /capture signature/i }));
    await user.click(screen.getByRole('button', { name: /confirm signature/i }));
    await user.click(submitButton());

    await waitFor(() => expect(spies.captureIntakeConsents).toHaveBeenCalled());
    expect(calls).toEqual([
      'createCaseWithDevices',
      'createDocumentInstance',
      'signIntakeReceipt',
      'logCaseIntake',
      'captureIntakeConsents',
    ]);
  });

  it('links the custody event to the receipt instance that was just signed', async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(submitButton());

    await waitFor(() => expect(spies.logCaseIntake).toHaveBeenCalled());
    expect(spies.logCaseIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'case-1',
        deviceIds: ['dev-1'],
        receiptInstanceId: 'inst-1',
        depositorRelationship: 'self',
      }),
    );
  });

  it('completes a wet-ink check-in with no captured signature', async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(submitButton());

    await waitFor(() => expect(spies.captureIntakeConsents).toHaveBeenCalled());
    expect(spies.signIntakeReceipt).not.toHaveBeenCalled();
    expect(calls).toEqual([
      'createCaseWithDevices',
      'createDocumentInstance',
      'logCaseIntake',
      'captureIntakeConsents',
    ]);
  });

  it('stores the WhatsApp consent sentence the customer actually saw', async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(await screen.findByLabelText(/on WhatsApp/i));
    await user.click(submitButton());

    await waitFor(() => expect(spies.captureIntakeConsents).toHaveBeenCalled());
    expect(spies.captureIntakeConsents).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappUtility: true,
        phoneE164: '+971500000000',
        consentText: 'Receive case & service updates from Nova Data Labs on WhatsApp',
      }),
    );
  });

  it('keeps the intake evidence when the label printer fails', async () => {
    spies.shouldAutoPrintLabel.mockRejectedValue(new Error('printer offline'));
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(submitButton());

    await waitFor(() => expect(spies.captureIntakeConsents).toHaveBeenCalled());
    expect(await screen.findByText(/CASE-0042/)).toBeInTheDocument();
  });

  it('starts the next customer from a clean form', async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(submitButton());

    await user.click(await screen.findByRole('button', { name: /check in another/i }));

    expect(screen.getByLabelText(/condition/i)).toHaveValue('');
    expect(await screen.findByLabelText(/accept the terms/i)).not.toBeChecked();
    expect(submitButton()).toBeDisabled();
  });

  it('does not reopen the previous customer’s email modal on the next check-in', async () => {
    const user = userEvent.setup();
    renderPage();

    async function checkInOnce() {
      await pickCustomer(user);
      await fillOneDevice(user);
      await user.click(await screen.findByLabelText(/accept the terms/i));
      await user.click(submitButton());
      await screen.findByRole('button', { name: /check in another/i });
    }

    await checkInOnce();
    await user.click(screen.getByRole('button', { name: /send to customer/i }));
    expect(screen.getByText('email modal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /check in another/i }));
    await checkInOnce();

    expect(screen.queryByText('email modal')).not.toBeInTheDocument();
  });

  it('blocks a courier hand-over that has no National ID on record', async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.selectOptions(screen.getByLabelText(/relationship/i), 'courier');
    // Name first: switching off `self` clears it, and an empty name blocks submit
    // on its own — which would make the National ID assertion below vacuous.
    await user.type(screen.getByLabelText(/full name/i), 'Sam Okafor');

    expect(screen.getByLabelText(/national id/i)).toHaveValue('');
    expect(submitButton()).toBeDisabled();

    await user.type(screen.getByLabelText(/national id/i), 'P1234567');
    await waitFor(() => expect(submitButton()).toBeEnabled());
  });

  it('does not offer a retry once the case exists but a later step failed', async () => {
    spies.logCaseIntake.mockRejectedValue(new Error('custody log unavailable'));
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(submitButton());

    expect(await screen.findByText(/CASE-0042 was created/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete check-in/i })).not.toBeInTheDocument();
    expect(spies.createCaseWithDevices).toHaveBeenCalledTimes(1);
  });

  it('still offers a retry when the failure landed before any device entered custody', async () => {
    spies.createCaseWithDevices.mockRejectedValue(new Error('network unreachable'));
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(submitButton());

    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(screen.queryByText(/was created/i)).not.toBeInTheDocument();
    expect(spies.createDocumentInstance).not.toHaveBeenCalled();
  });

  // createCaseWithDevices itself rejects only AFTER the case_devices insert has
  // fired DEVICE_RECEIVED — offering the retry its message asks for would put
  // one physical hand-over into two cases with two custody ledgers.
  it('does not offer a retry when creation itself failed with the devices already in custody', async () => {
    spies.createCaseWithDevices.mockRejectedValue(
      new DevicesInCustodyError('Another update is in progress — please retry.', {
        caseId: 'case-1',
        caseNumber: 'CASE-0042',
        deviceIds: ['dev-1'],
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(submitButton());

    expect(await screen.findByText(/CASE-0042 was created/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete check-in/i })).not.toBeInTheDocument();
    expect(spies.createCaseWithDevices).toHaveBeenCalledTimes(1);
  });

  it('names the screens that can still record consent when only that step failed', async () => {
    spies.captureIntakeConsents.mockRejectedValue(new Error('rls denied'));
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(await screen.findByLabelText(/on WhatsApp/i));
    await user.click(screen.getByLabelText(/permanently alter the media/i));
    await user.click(submitButton());

    expect(await screen.findByText(/CASE-0042 was created/i)).toBeInTheDocument();
    expect(screen.getByText(/Edit Profile → WhatsApp updates/i)).toBeInTheDocument();
    expect(screen.getByText(/as an internal note on CASE-0042/i)).toBeInTheDocument();
    // Both missing facts are re-recordable in-app: this screen must never send a
    // re-tickable checkbox to an administrator as if it were unwritable.
    expect(screen.queryByText(/escalate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No screen in the app/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete check-in/i })).not.toBeInTheDocument();
  });

  it('lists only the consent the customer actually gave', async () => {
    spies.captureIntakeConsents.mockRejectedValue(new Error('rls denied'));
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(await screen.findByLabelText(/on WhatsApp/i));
    await user.click(submitButton());

    expect(await screen.findByText(/Edit Profile → WhatsApp updates/i)).toBeInTheDocument();
    expect(screen.queryByText(/as an internal note on CASE-0042/i)).not.toBeInTheDocument();
  });

  // The counterpart pin: nothing before the consent step has an in-app remedy,
  // so that branch must keep saying so rather than promise one.
  it('promises no in-app remedy when the missing evidence really has none', async () => {
    spies.logCaseIntake.mockRejectedValue(new Error('custody log unavailable'));
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(await screen.findByLabelText(/on WhatsApp/i));
    await user.click(submitButton());

    expect(await screen.findByText(/No screen in the app can write the missing intake evidence/i))
      .toBeInTheDocument();
    expect(screen.getByText(/escalate CASE-0042 to a lab administrator/i)).toBeInTheDocument();
    expect(screen.queryByText(/Edit Profile → WhatsApp updates/i)).not.toBeInTheDocument();
  });

  it('will not write an undeliverable opt-in for a customer with no mobile number', async () => {
    customerRow.mobile_number = null;
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);

    const optIn = await screen.findByLabelText(/on WhatsApp/i);
    expect(optIn).toBeDisabled();
    expect(screen.getByText(/No mobile number on this customer/i)).toBeInTheDocument();

    await fillOneDevice(user);
    await user.click(screen.getByLabelText(/accept the terms/i));
    await user.click(submitButton());

    await waitFor(() => expect(spies.captureIntakeConsents).toHaveBeenCalled());
    expect(spies.captureIntakeConsents).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappUtility: false, phoneE164: null }),
    );
  });

  it('sends the customer copy under the tenant’s own name', async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(submitButton());

    await user.click(await screen.findByRole('button', { name: /send to customer/i }));
    expect(screen.getByTestId('email-company')).toHaveTextContent('Nova Data Labs');
  });

  it('keeps the email hand-off disabled for a WhatsApp customer with no email', async () => {
    customerRow.email = null;
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await fillOneDevice(user);
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(await screen.findByLabelText(/on WhatsApp/i));
    await user.click(submitButton());

    await screen.findByRole('button', { name: /check in another/i });
    expect(screen.getByRole('button', { name: /send to customer/i })).toBeDisabled();
    expect(screen.getByText(/no email on file/i)).toBeInTheDocument();
  });
});
