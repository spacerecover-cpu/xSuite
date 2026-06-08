import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConvertProformaToTaxModal } from './ConvertProformaToTaxModal';

// This modal converts a PROFORMA INVOICE into a TAX INVOICE. It must show the
// proforma's own identity (invoice number + customer), and there is no proforma/tax
// choice (the target is always a tax invoice).
describe('ConvertProformaToTaxModal', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    isConverting: false,
    source: { number: 'INVO-0009', customerName: 'Said Al Harthy', totalAmount: 105 },
  };

  it('shows the proforma invoice number, customer, and amount', () => {
    render(<ConvertProformaToTaxModal {...baseProps} onConvert={vi.fn()} />);
    expect(screen.getByText('INVO-0009')).toBeTruthy();
    expect(screen.getByText('Said Al Harthy')).toBeTruthy();
    expect(screen.getByText(/105\.00/)).toBeTruthy();
  });

  it('converts with due date + notes and offers no invoice-type choice', async () => {
    const onConvert = vi.fn().mockResolvedValue(undefined);
    render(<ConvertProformaToTaxModal {...baseProps} onConvert={onConvert} />);

    await userEvent.click(screen.getByRole('button', { name: /convert to tax invoice/i }));

    expect(onConvert).toHaveBeenCalledTimes(1);
    const arg = onConvert.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toHaveProperty('dueDate');
    expect(arg).not.toHaveProperty('invoiceType');
  });
});
