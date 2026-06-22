import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Passthrough Modal so the form renders inline; stub the banking service.
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: unknown }) => (isOpen ? children : null),
}));
const getAccounts = vi.fn();
vi.mock('../../lib/bankingService', () => ({
  bankingService: { getAccounts: (...a: unknown[]) => getAccounts(...a) },
}));

import { ExpensePaymentModal } from './ExpensePaymentModal';

function renderModal(currency: string | null = 'EUR') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={qc}>
      <ExpensePaymentModal
        isOpen
        onClose={() => {}}
        expense={{ id: 'e1', amount: 200, currency, expense_number: 'EXP-1' }}
        onConfirm={onConfirm}
      />
    </QueryClientProvider>,
  );
  return { onConfirm };
}

beforeEach(() => getAccounts.mockReset());

describe('ExpensePaymentModal (EXP-017 — match-currency v1)', () => {
  it('lists only accounts whose currency matches the expense', async () => {
    getAccounts.mockResolvedValue([
      { id: 'eur', account_name: 'EUR Ops', currency: 'EUR', current_balance: 1000 },
      { id: 'usd', account_name: 'USD Ops', currency: 'USD', current_balance: 1000 },
    ]);
    renderModal('EUR');

    expect(await screen.findByRole('option', { name: /EUR Ops/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /USD Ops/ })).toBeNull();
  });

  it('disables Record Payment until an account is chosen, then calls onConfirm with it', async () => {
    getAccounts.mockResolvedValue([{ id: 'eur', account_name: 'EUR Ops', currency: 'EUR', current_balance: 1000 }]);
    const { onConfirm } = renderModal('EUR');

    const submit = await screen.findByRole('button', { name: /record payment/i });
    expect(submit).toBeDisabled();

    // wait for the async-loaded option before selecting it
    await screen.findByRole('option', { name: /EUR Ops/ });
    await userEvent.selectOptions(screen.getByLabelText(/pay from account/i), 'eur');
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ bankAccountId: 'eur' }));
  });

  it('warns when no matching-currency account exists', async () => {
    getAccounts.mockResolvedValue([{ id: 'usd', account_name: 'USD Ops', currency: 'USD', current_balance: 1000 }]);
    renderModal('EUR');

    expect(await screen.findByText(/No active EUR account/i)).toBeInTheDocument();
  });
});
