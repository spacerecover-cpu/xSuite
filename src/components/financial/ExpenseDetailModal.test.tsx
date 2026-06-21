import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Isolate the component: stub the Dialog-based Modal (i18n/focus-trap) to a
// passthrough, and stub currency/date helpers so the test asserts OUR content,
// not provider wiring.
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title?: string; children: React.ReactNode }) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => `$${n.toFixed(2)}` }),
}));
vi.mock('../../lib/format', () => ({ formatDate: (d: string) => d }));

import { ExpenseDetailModal } from './ExpenseDetailModal';

const baseExpense = {
  id: 'e1',
  expense_number: 'EXP-0007',
  expense_date: '2026-06-01',
  amount: 250,
  description: 'Cleanroom gloves',
  vendor: 'LabSupply Co',
  status: 'pending' as const,
  notes: 'urgent restock',
  category: { id: 'c1', name: 'Consumables' },
  case: { id: 'k1', case_no: 'CASE-0042', title: 'RAID rebuild' },
  attachments: [{ id: 'a1', file_name: 'receipt.pdf', file_url: 'e1/1.pdf' }],
};

describe('ExpenseDetailModal (the previously-dead "View" / preview surface)', () => {
  it('renders the saved expense fields so an approver can review before approving', () => {
    render(<ExpenseDetailModal isOpen onClose={() => {}} expense={baseExpense as never} />);
    expect(screen.getByText('EXP-0007')).toBeInTheDocument();
    expect(screen.getByText(/Cleanroom gloves/)).toBeInTheDocument();
    expect(screen.getByText('LabSupply Co')).toBeInTheDocument();
    expect(screen.getByText('Consumables')).toBeInTheDocument();
    expect(screen.getByText(/CASE-0042/)).toBeInTheDocument();
    expect(screen.getByText('$250.00')).toBeInTheDocument();
    expect(screen.getByText(/urgent restock/)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it('lists attachments and invokes the download handler with the attachment', async () => {
    const onDownload = vi.fn();
    render(
      <ExpenseDetailModal
        isOpen
        onClose={() => {}}
        expense={baseExpense as never}
        onDownloadAttachment={onDownload}
      />,
    );
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(onDownload).toHaveBeenCalledWith(baseExpense.attachments[0]);
  });

  it('shows an empty state when there are no attachments', () => {
    render(
      <ExpenseDetailModal isOpen onClose={() => {}} expense={{ ...baseExpense, attachments: [] } as never} />,
    );
    expect(screen.getByText(/no attachments/i)).toBeInTheDocument();
  });

  it('shows a loading state while the full detail is being fetched', () => {
    render(<ExpenseDetailModal isOpen onClose={() => {}} expense={null} isLoading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows the base-currency amount (not the raw document figure) so View agrees with the list row', () => {
    // A foreign-currency expense: 250 document units, 275 in base. The list row
    // shows the base value; the preview must not print the raw 250 under the base
    // symbol (that mislabels the money on an approver-facing screen).
    render(
      <ExpenseDetailModal
        isOpen
        onClose={() => {}}
        expense={{ ...baseExpense, amount: 250, amount_base: 275 } as never}
      />,
    );
    expect(screen.getByText('$275.00')).toBeInTheDocument();
    expect(screen.queryByText('$250.00')).toBeNull();
  });
});
