import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Passthrough Modal so the form renders inline; stub every remote read.
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: unknown }) => (isOpen ? children : null),
}));
const getOpenInvoicesByCase = vi.fn().mockResolvedValue([]);
vi.mock('../../lib/bankingService', () => ({
  bankingService: {
    getAccounts: vi.fn().mockResolvedValue([]),
    getCasesWithInvoices: vi.fn().mockResolvedValue([]),
    getOpenInvoicesByCase: (...a: unknown[]) => getOpenInvoicesByCase(...a),
    getInvoiceForPayment: vi.fn().mockResolvedValue(null),
    getSettledInvoicesByCase: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useCurrencyConfig: () => ({ code: 'OMR' }),
  useDateTimeConfig: () => ({ timezone: 'Asia/Muscat' }),
}));
// Raw numbers keep the money assertions readable (and independent of locale).
vi.mock('../../lib/format', () => ({
  formatCurrencyWithConfig: (amount: number) => String(amount),
}));
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
  },
}));

import { RecordReceiptModal } from './RecordReceiptModal';

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RecordReceiptModal
        isOpen
        onClose={() => {}}
        onSave={async () => {}}
        prefilledData={{ case_id: 'case-1' }}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.useRealTimers());

describe('RecordReceiptModal', () => {
  it('totals outstanding in document currency, not the tenant-base snapshot', async () => {
    // balance_due_base is the OMR snapshot of a EUR invoice — summing it would
    // report 92.5 against document-currency allocations instead of 150.
    getOpenInvoicesByCase.mockResolvedValue([
      { id: 'i1', invoice_number: 'INV-1', invoice_date: null, due_date: null, status: 'sent', total_amount: 100, amount_paid: 0, balance_due: 100, balance_due_base: 42.5 },
      { id: 'i2', invoice_number: 'INV-2', invoice_date: null, due_date: null, status: 'sent', total_amount: 50, amount_paid: 0, balance_due: 50, balance_due_base: 50 },
    ]);
    renderModal();

    const total = await screen.findByText(/Total outstanding on this case/);
    expect(total.textContent).toContain('150');
    expect(total.textContent).not.toContain('92.5');
  });

  it('defaults the receipt date to the tenant calendar day, not the UTC day', () => {
    // 2026-07-31T21:30Z is already 2026-08-01 in Asia/Muscat (UTC+4).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-31T21:30:00Z'));
    renderModal();

    expect(screen.getByLabelText(/Receipt date/)).toHaveValue('2026-08-01');
  });
});
