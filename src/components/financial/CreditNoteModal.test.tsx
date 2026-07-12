import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Passthrough Modal so the form renders inline.
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
// The requirement panel pulls in react-i18next; stub it (empty list renders nothing anyway).
vi.mock('./RequirementFailuresPanel', () => ({ RequirementFailuresPanel: () => null }));
vi.mock('../../lib/taxDocumentService', () => ({ parseRequirementFailures: () => [] }));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({
    formatCurrency: (n: number) => n.toFixed(2),
    currencyFormat: { decimalPlaces: 2, currencyCode: 'USD' },
  }),
}));
vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { issueCreditNote, applyCreditNote, voidCreditNote } = vi.hoisted(() => ({
  issueCreditNote: vi.fn(),
  applyCreditNote: vi.fn(),
  voidCreditNote: vi.fn(),
}));
vi.mock('../../lib/creditNoteService', () => ({ issueCreditNote, applyCreditNote, voidCreditNote }));

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ error: toastError, success: toastSuccess, info: vi.fn() }),
}));

import { CreditNoteModal, proratedVat } from './CreditNoteModal';

describe('CreditNoteModal proratedVat', () => {
  it('splits invoice VAT proportionally with exact totality (largest remainder)', () => {
    // invoice tax 72.000 over total 1512.000; credit the whole → 72.000
    expect(proratedVat(1512, 72, 1512, 3)).toBe(72);
    // partial credit of 756.000 (half) → 36.000
    expect(proratedVat(756, 72, 1512, 3)).toBe(36);
    // zero total → 0 (no divide-by-zero)
    expect(proratedVat(100, 0, 0, 3)).toBe(0);
  });

  it('reverses VAT that sums exactly to the invoice VAT across a sequence of partial credits', () => {
    // Invoice total 100.00, tax 10.00 (2dp). Three partial credits fully credit it.
    // Prorating each independently against the full invoice strands 0.01 of VAT
    // (3.33 + 3.33 + 3.33 = 9.99); the cumulative (running-total) basis telescopes to
    // exactly 10.00. The 5th arg is the amount already credited before this note.
    const cn1 = proratedVat(33.33, 10, 100, 2, 0);
    const cn2 = proratedVat(33.33, 10, 100, 2, 33.33);
    const cn3 = proratedVat(33.34, 10, 100, 2, 66.66);
    expect([cn1, cn2, cn3]).toEqual([3.33, 3.34, 3.33]);
    expect(cn1 + cn2 + cn3).toBeCloseTo(10, 6);
  });
});

describe('CreditNoteModal issuance/allocation atomicity', () => {
  const invoice = { id: 'inv-1', invoice_number: 'INV-1', total_amount: 100, balance_due: 100, tax_amount: 0 };

  beforeEach(() => {
    issueCreditNote.mockReset();
    applyCreditNote.mockReset();
    voidCreditNote.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  async function submitCredit() {
    await userEvent.type(screen.getByLabelText(/credit amount/i), '50');
    await userEvent.click(screen.getByRole('button', { name: /issue credit note/i }));
  }

  it('voids the just-issued credit note when allocation fails, so the -income reversal is not orphaned', async () => {
    issueCreditNote.mockResolvedValue({ id: 'cn-1', credit_note_number: 'CN-1' });
    applyCreditNote.mockRejectedValue(new Error('allocation failed'));
    voidCreditNote.mockResolvedValue({ id: 'cn-1' });
    const onSaved = vi.fn();

    render(<CreditNoteModal isOpen onClose={() => {}} invoice={invoice} onSaved={onSaved} />);
    await submitCredit();

    // Compensation: the orphaned issuance must be voided so a retry cannot double-post.
    await waitFor(() => expect(voidCreditNote).toHaveBeenCalledWith('cn-1', expect.any(String)));
    expect(onSaved).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it('does not void on the happy path', async () => {
    issueCreditNote.mockResolvedValue({ id: 'cn-1', credit_note_number: 'CN-1' });
    applyCreditNote.mockResolvedValue({ id: 'cn-1' });
    const onSaved = vi.fn();

    render(<CreditNoteModal isOpen onClose={() => {}} invoice={invoice} onSaved={onSaved} />);
    await submitCredit();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(voidCreditNote).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalled();
  });
});
