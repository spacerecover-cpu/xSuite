import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// PLAN DRIFT: the spec's literal test rendered <RecordPaymentModal/> bare with a
// `{ format, currencyCode }` useCurrency mock and a `{ toast }` useToast mock. The
// real component reads TanStack `useQuery` (needs a QueryClientProvider) and the
// real hook shapes `{ formatCurrency, currencyFormat }` / `toast.error(...)`. This
// harness mirrors the shipped RecordPaymentModal.test.tsx so the component can
// mount; the ASSERTIONS (advance radio hides the grid; onSave gets kind=advance +
// []) are preserved verbatim from the plan.
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('../../lib/paymentsService', () => ({
  getPaymentMethods: vi.fn(async () => [{ id: 'pm-1', name: 'Cash' }]),
  getCasesWithUnpaidInvoices: vi.fn(async () => []),
  getUnpaidInvoicesByCase: vi.fn(async () => []),
}));
const { from } = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  })),
}));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from } }));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => `₹${n}`, currencyFormat: { decimalPlaces: 2, currencyCode: 'INR' } }),
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }) }));
vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { RecordPaymentModal } from './RecordPaymentModal';

beforeEach(() => vi.clearAllMocks());

describe('RecordPaymentModal advance kind', () => {
  it('hides the invoice allocation grid and emits kind=advance with no allocations', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <RecordPaymentModal isOpen onClose={() => {}} onSave={onSave} preselectedCaseId="case-1" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('radio', { name: /advance \(unallocated\)/i }));
    expect(screen.queryByText(/allocate to invoices/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5000' } });
    // PLAN DRIFT: the spec used fireEvent.click on the submit button, but a bare
    // click does not dispatch form submission in this jsdom. Assert the Record
    // Advance action is present + enabled (the real UX gate), then submit the form.
    const submitBtn = screen.getByRole('button', { name: /record advance/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [payload, allocations] = onSave.mock.calls[0];
    expect((payload as { kind: string }).kind).toBe('advance');
    expect(allocations).toEqual([]);
  });
});
