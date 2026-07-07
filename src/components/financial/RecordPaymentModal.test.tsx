import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Passthrough Modal so the form renders inline; stub the service + client.
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('../../lib/paymentsService', () => ({
  getPaymentMethods: vi.fn(async () => [{ id: 'pm1', name: 'Bank Transfer' }]),
  getCasesWithUnpaidInvoices: vi.fn(async () => [
    { id: 'c1', case_no: 'CASE-1', title: 'RAID job', customer: { id: 'cu1', customer_name: 'Acme Labs', email: 'a@acme.test' } },
  ]),
  getUnpaidInvoicesByCase: vi.fn(async () => [
    { id: 'i1', invoice_number: 'INV-1', total_amount: 100, balance_due: 100, status: 'sent' },
  ]),
}));
// vi.mock factories are hoisted above module-level consts, so `from` must live in
// vi.hoisted to be initialised before the supabaseClient mock references it.
const { from } = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: () => ({
      eq: () => ({
        order: () =>
          Promise.resolve({
            data: [{ id: 'ba1', account_name: 'Ops Account', bank_name: 'HDFC', account_type: 'current' }],
            error: null,
          }),
      }),
    }),
  })),
}));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from } }));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({
    formatCurrency: (n: number) => n.toFixed(2),
    currencyFormat: { decimalPlaces: 2, currencyCode: 'INR' },
  }),
}));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));
vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { RecordPaymentModal } from './RecordPaymentModal';

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={qc}>
      <RecordPaymentModal
        isOpen
        onClose={() => {}}
        onSave={onSave}
        preselectedCaseId="c1"
        preselectedInvoiceId="i1"
      />
    </QueryClientProvider>,
  );
  return { onSave };
}

async function fillRequiredFields() {
  await screen.findByText('INV-1'); // allocation seeded from the preselected invoice (100 due)
  await userEvent.selectOptions(screen.getByLabelText(/payment method/i), 'pm1');
  await userEvent.selectOptions(screen.getByLabelText(/deposit to/i), 'ba1');
}

beforeEach(() => vi.clearAllMocks());

describe('RecordPaymentModal withholding (WP-L3 TDS, AD-7 universal collapsed section)', () => {
  it('captures withheld amount + certificate, adjusts cash amount, and passes withholding to onSave', async () => {
    const { onSave } = renderModal();
    await fillRequiredFields();

    await userEvent.click(screen.getByRole('button', { name: /withholding/i }));
    await userEvent.type(screen.getByLabelText(/withheld amount/i), '2');
    await userEvent.type(screen.getByLabelText(/certificate reference/i), 'TDS/2026/001');

    // receivable stays fully allocated at 100; the CASH amount drops to 98
    expect(screen.getByDisplayValue('98')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /record payment/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 98, status: 'completed' }),
      [{ invoice_id: 'i1', amount: 100 }],
      { amount: 2, certificateRef: 'TDS/2026/001' },
    );
  });

  it('blocks submit while an amount is withheld without a certificate reference', async () => {
    renderModal();
    await fillRequiredFields();

    await userEvent.click(screen.getByRole('button', { name: /withholding/i }));
    await userEvent.type(screen.getByLabelText(/withheld amount/i), '2');

    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled();
    expect(screen.getByText(/required when an amount is withheld/i)).toBeInTheDocument();
  });

  it('surfaces the certificate-required reason in the footer even when the section is collapsed (WP-L3 review fix)', async () => {
    renderModal();
    await fillRequiredFields();

    const toggle = screen.getByRole('button', { name: /withholding/i });
    await userEvent.click(toggle);
    await userEvent.type(screen.getByLabelText(/withheld amount/i), '2');
    await userEvent.click(toggle); // collapse — the inline error is now hidden

    // The disabled reason must still be visible somewhere (footer), not a dead-end.
    expect(screen.getByText(/certificate reference/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled();
  });

  it('passes null withholding when the section is untouched (regression: existing flow)', async () => {
    const { onSave } = renderModal();
    await fillRequiredFields();

    await userEvent.click(screen.getByRole('button', { name: /record payment/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100 }),
      [{ invoice_id: 'i1', amount: 100 }],
      null,
    );
  });
});
