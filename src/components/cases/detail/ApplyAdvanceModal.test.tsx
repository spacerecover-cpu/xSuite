import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CurrencyConfig } from '../../../types/tenantConfig';
import { ApplyAdvanceModal, toAmountFieldValue } from './ApplyAdvanceModal';

describe('toAmountFieldValue (re-review RC2 — zero-decimal currencies)', () => {
  it('never strips integer trailing zeros (JPY/KRW/VND, decimals=0)', () => {
    expect(toAmountFieldValue(5000, 0)).toBe('5000'); // old regex gave "5"
    expect(toAmountFieldValue(1230, 0)).toBe('1230'); // old regex gave "123"
  });
  it('drops only insignificant fractional zeros for 2/3-decimal currencies', () => {
    expect(toAmountFieldValue(1200, 2)).toBe('1200');
    expect(toAmountFieldValue(1234.5, 2)).toBe('1234.5');
    expect(toAmountFieldValue(1000, 3)).toBe('1000');
  });
  it('returns empty for non-positive', () => {
    expect(toAmountFieldValue(0, 2)).toBe('');
    expect(toAmountFieldValue(-5, 2)).toBe('');
  });
});

const currencyConfig: CurrencyConfig = {
  code: 'INR', symbol: '₹', name: 'Indian Rupee', decimalPlaces: 2,
  decimalSeparator: '.', thousandsSeparator: ',', position: 'before',
  displayMode: 'symbol', negativeFormat: 'minus',
};

const advance = { id: 'pay-1', payment_number: 'PAY-1', unappliedBalance: 5000, currency: 'INR' };
const invoices = [
  { id: 'inv-1', invoice_number: 'INV-1', balance_due: 3000 },
  { id: 'inv-2', invoice_number: 'INV-2', balance_due: 8000 },
];

function renderModal(onApply = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ApplyAdvanceModal
      open
      advance={advance}
      invoices={invoices}
      currencyConfig={currencyConfig}
      onClose={() => {}}
      onApply={onApply}
    />,
  );
  return onApply;
}

beforeEach(() => vi.clearAllMocks());

describe('ApplyAdvanceModal', () => {
  it('defaults the amount to min(unapplied, first invoice balance) and applies with the right args', async () => {
    const onApply = renderModal();
    // Default max is min(5000, 3000) = 3000.
    expect((screen.getByLabelText(/amount/i) as HTMLInputElement).value).toBe('3000');
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply).toHaveBeenCalledWith({ paymentId: 'pay-1', invoiceId: 'inv-1', amount: 3000 });
  });

  it('clamps an over-max amount down to the applicable maximum', async () => {
    const onApply = renderModal();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply).toHaveBeenCalledWith({ paymentId: 'pay-1', invoiceId: 'inv-1', amount: 3000 });
  });

  it('recomputes the max when a different invoice is selected', async () => {
    const onApply = renderModal();
    fireEvent.change(screen.getByLabelText(/invoice/i), { target: { value: 'inv-2' } });
    // New max is min(5000, 8000) = 5000.
    expect((screen.getByLabelText(/amount/i) as HTMLInputElement).value).toBe('5000');
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply).toHaveBeenCalledWith({ paymentId: 'pay-1', invoiceId: 'inv-2', amount: 5000 });
  });
});
