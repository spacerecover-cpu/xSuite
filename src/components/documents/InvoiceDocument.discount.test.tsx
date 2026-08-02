import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// The compliance hook is a network-backed concern that is already covered by
// `previewPrintParity.test.tsx`; stub it so this file isolates the discount math.
vi.mock('../../hooks/useDocumentCompliance', () => ({
  useDocumentCompliance: () => ({
    title: { en: 'INVOICE' },
    taxBandLabel: null,
    sellerTaxNumber: null,
    taxRows: [],
    dateFormat: null,
    loading: false,
  }),
}));

import { InvoiceDocument } from './InvoiceDocument';

const baseInvoice = {
  id: 'inv-discount',
  invoice_number: 'INV-0001',
  invoice_type: 'tax_invoice',
  status: 'issued',
  subtotal: 1500,
  tax_amount: 0,
  tax_rate: 0,
  total_amount: 1350,
  amount_paid: 0,
  invoice_line_items: [],
};

const renderInvoice = (invoice: Record<string, unknown>) =>
  render(
    <InvoiceDocument
      invoice={invoice}
      companySettings={null}
      currencyFormat={{ currencySymbol: '$', decimalPlaces: 2 }}
      t={(_key: string, fallback: string) => fallback}
    />,
  );

describe('InvoiceDocument discount rendering', () => {
  it('resolves a percentage discount against the subtotal instead of printing the raw percent', () => {
    renderInvoice({ ...baseInvoice, discount_type: 'percentage', discount_amount: 10 });

    expect(screen.getByText('Discount (10%):')).toBeInTheDocument();
    // 10% of 1500 = 150.00 — never "$10.00".
    expect(screen.getByText('- $150.00')).toBeInTheDocument();
    expect(screen.queryByText('- $10.00')).not.toBeInTheDocument();
  });

  it('renders an absolute discount verbatim', () => {
    renderInvoice({ ...baseInvoice, discount_type: 'amount', discount_amount: 100, total_amount: 1400 });

    expect(screen.getByText('Discount:')).toBeInTheDocument();
    expect(screen.getByText('- $100.00')).toBeInTheDocument();
  });
});
