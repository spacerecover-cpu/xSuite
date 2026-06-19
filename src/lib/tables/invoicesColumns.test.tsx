import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { buildInvoicesColumns, type InvoiceColumnContext } from './invoicesColumns';
import type { InvoiceWithDetails } from '../invoiceService';

function makeCtx(over: Partial<InvoiceColumnContext> = {}): InvoiceColumnContext {
  return {
    navigate: vi.fn(),
    formatCurrency: (n: number) => `OMR ${n.toFixed(3)}`,
    getTypeColor: () => '#0ea5e9',
    getClientName: () => 'Ramcharan',
    canEdit: () => true,
    canRecordPayment: () => true,
    onEdit: vi.fn(),
    onRecordPayment: vi.fn(),
    ...over,
  };
}

const baseInvoice = {
  id: 'inv-1',
  invoice_number: 'INVO-0028',
  invoice_type: 'tax_invoice',
  status: 'draft',
  invoice_date: '2026-06-18',
  due_date: '2026-06-18',
  total_amount: 273,
  balance_due: 273,
  customers_enhanced: { customer_name: 'Ramcharan' },
} as unknown as InvoiceWithDetails;

function col(ctx: InvoiceColumnContext, key: string) {
  const found = buildInvoicesColumns(ctx).find((c) => c.key === key);
  if (!found) throw new Error(`column ${key} not found`);
  return found;
}

describe('invoicesColumns', () => {
  it('exposes the expected columns in display order', () => {
    const keys = buildInvoicesColumns(makeCtx()).map((c) => c.key);
    expect(keys).toEqual([
      'invoice_number',
      'invoice_type',
      'case',
      'customer',
      'invoice_date',
      'due_date',
      'amount',
      'status',
      'actions',
    ]);
  });

  it('renders the formatted total and the outstanding balance in the amount column', () => {
    const ctx = makeCtx();
    render(<>{col(ctx, 'amount').render(baseInvoice)}</>);
    expect(screen.getByText('OMR 273.000')).toBeInTheDocument();
    expect(screen.getByText(/Due:/)).toBeInTheDocument();
  });

  it('links a converted-from-proforma row back to its proforma from the status column', () => {
    const ctx = makeCtx();
    const row = { ...baseInvoice, proforma_invoice_id: 'pro-9' } as unknown as InvoiceWithDetails;
    render(<>{col(ctx, 'status').render(row)}</>);
    fireEvent.click(screen.getByText('From Proforma'));
    expect(ctx.navigate).toHaveBeenCalledWith('/invoices/pro-9');
  });

  it('invokes the row edit handler from the actions column', () => {
    const ctx = makeCtx();
    render(<>{col(ctx, 'actions').render(baseInvoice)}</>);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(ctx.onEdit).toHaveBeenCalledWith(baseInvoice);
  });
});
