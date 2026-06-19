import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoicesTable } from './InvoicesTable';
import type { InvoiceWithDetails } from '../../lib/invoiceService';

const selection = {
  isSelected: () => false,
  toggle: vi.fn(),
  allSelected: () => false,
  someSelected: () => false,
  setMany: vi.fn(),
  selectedIds: new Set<string>(),
  selectedCount: 0,
  clear: vi.fn(),
};

const rows = [
  {
    id: 'a',
    invoice_number: 'INVO-0001',
    invoice_type: 'tax_invoice',
    status: 'draft',
    invoice_date: '2026-06-01',
    due_date: '2026-06-10',
    total_amount: 100,
    balance_due: 0,
    customers_enhanced: { customer_name: 'Acme' },
  },
  {
    id: 'b',
    invoice_number: 'INVO-0002',
    invoice_type: 'tax_invoice',
    status: 'overdue',
    invoice_date: '2026-06-02',
    due_date: '2026-06-11',
    total_amount: 200,
    balance_due: 200,
    customers_enhanced: { customer_name: 'Globex' },
  },
] as unknown as InvoiceWithDetails[];

function renderTable() {
  return render(
    <InvoicesTable
      rows={rows}
      selection={selection}
      navigate={vi.fn()}
      formatCurrency={(n) => `OMR ${n}`}
      getTypeColor={() => '#0ea5e9'}
      getClientName={(i) => i.customers_enhanced?.customer_name ?? 'N/A'}
      canEdit={() => true}
      canRecordPayment={() => true}
      onEdit={vi.fn()}
      onRecordPayment={vi.fn()}
    />,
  );
}

describe('InvoicesTable', () => {
  it('fits its container with a fixed-layout table instead of horizontal scroll', () => {
    const { container } = renderTable();
    const table = container.querySelector('table');
    expect(table?.style.tableLayout).toBe('fixed');
  });

  it('renders invoice numbers and tints the overdue row', () => {
    renderTable();
    expect(screen.getAllByText('INVO-0001')[0]).toBeInTheDocument();
    const overdueRow = screen.getAllByText('INVO-0002')[0].closest('tr');
    expect(overdueRow?.className).toContain('bg-danger-muted');
  });
});
