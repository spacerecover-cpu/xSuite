import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { buildInvoicesColumns, type InvoiceColumnContext } from './invoicesColumns';
import type { InvoiceWithDetails } from '../invoiceService';

function makeCtx(over: Partial<InvoiceColumnContext> = {}): InvoiceColumnContext {
  return {
    navigate: vi.fn(),
    formatCurrency: (n: number) => `OMR ${n.toFixed(3)}`,
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
      'balance',
      'status',
      'actions',
    ]);
  });

  it('renders the total in Amount (right-aligned) and the outstanding in its own Balance column', () => {
    const ctx = makeCtx();
    const amount = col(ctx, 'amount');
    const balance = col(ctx, 'balance');
    expect(amount.align).toBe('end');
    expect(balance.align).toBe('end');

    render(<>{amount.render(baseInvoice)}</>);
    expect(screen.getByText('OMR 273.000')).toBeInTheDocument();
    expect(screen.queryByText(/Due:/)).not.toBeInTheDocument();

    const { container } = render(<>{balance.render(baseInvoice)}</>);
    expect(container.textContent).toContain('OMR 273.000');
  });

  it('shows a muted dash in Balance when the invoice is settled', () => {
    const ctx = makeCtx();
    const settled = { ...baseInvoice, balance_due: 0 } as unknown as InvoiceWithDetails;
    const { container } = render(<>{col(ctx, 'balance').render(settled)}</>);
    expect(container.textContent).toContain('—');
  });

  it('renders legible Type chips (no invalid custom-colour) for both invoice kinds', () => {
    const ctx = makeCtx();
    const type = col(ctx, 'invoice_type');
    render(<>{type.render(baseInvoice)}</>);
    expect(screen.getByText('Tax Invoice')).toBeInTheDocument();

    const proforma = { ...baseInvoice, invoice_type: 'proforma' } as unknown as InvoiceWithDetails;
    const { getByText } = render(<>{type.render(proforma)}</>);
    const chip = getByText('Proforma');
    expect(chip).toBeInTheDocument();
    // The proforma chip must NOT fall back to the broken inline custom colour
    // (rgb(var(--token)) fed into a `${color}20` hack rendered invisible text).
    expect(chip.getAttribute('style') ?? '').not.toContain('var(--color-accent)');
  });

  it('links a converted-from-proforma row back to its proforma from the status column', () => {
    const ctx = makeCtx();
    const row = { ...baseInvoice, proforma_invoice_id: 'pro-9' } as unknown as InvoiceWithDetails;
    render(<>{col(ctx, 'status').render(row)}</>);
    fireEvent.click(screen.getByText('From Proforma'));
    expect(ctx.navigate).toHaveBeenCalledWith('/invoices/pro-9');
  });

  it('invokes the row edit handler from the actions menu', () => {
    const ctx = makeCtx();
    render(<>{col(ctx, 'actions').render(baseInvoice)}</>);
    fireEvent.click(screen.getByLabelText(/Actions for/));
    fireEvent.click(screen.getByText('Edit'));
    expect(ctx.onEdit).toHaveBeenCalledWith(baseInvoice);
  });
});
