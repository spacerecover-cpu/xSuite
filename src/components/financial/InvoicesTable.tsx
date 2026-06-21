import React, { useMemo } from 'react';
import { ConfigurableDataTable } from '../ui/ConfigurableDataTable';
import { buildInvoicesColumns } from '../../lib/tables/invoicesColumns';
import type { ResolvedTableView } from '../../lib/tables/types';
import type { InvoiceWithDetails } from '../../lib/invoiceService';
import type { BulkSelection } from '../../hooks/useBulkSelection';

export interface InvoicesTableProps {
  rows: InvoiceWithDetails[];
  selection: BulkSelection;
  navigate: (path: string) => void;
  formatCurrency: (amount: number) => string;
  getClientName: (invoice: InvoiceWithDetails) => string;
  canEdit: (invoice: InvoiceWithDetails) => boolean;
  canRecordPayment: (invoice: InvoiceWithDetails) => boolean;
  onEdit: (invoice: InvoiceWithDetails) => void;
  onRecordPayment: (invoice: InvoiceWithDetails) => void;
}

/**
 * Invoices list table. Renders through `ConfigurableDataTable` so it fits the
 * available width — collapsing low-priority columns into a per-row expander and
 * falling back to stacked cards on phones — instead of the old
 * `overflow-x-auto` + `whitespace-nowrap` table that clipped the right-hand
 * columns on narrower laptops (e.g. a 13" Surface Pro). The overdue row tint
 * and select-all behavior are preserved.
 */
export const InvoicesTable: React.FC<InvoicesTableProps> = ({
  rows,
  selection,
  navigate,
  formatCurrency,
  getClientName,
  canEdit,
  canRecordPayment,
  onEdit,
  onRecordPayment,
}) => {
  const columns = useMemo(
    () =>
      buildInvoicesColumns({
        navigate,
        formatCurrency,
        getClientName,
        canEdit,
        canRecordPayment,
        onEdit,
        onRecordPayment,
      }),
    [navigate, formatCurrency, getClientName, canEdit, canRecordPayment, onEdit, onRecordPayment],
  );

  const view: ResolvedTableView = useMemo(
    () => ({ orderedVisible: columns.map((c) => c.key), locked: [], widths: {} }),
    [columns],
  );

  return (
    <ConfigurableDataTable
      rows={rows}
      columns={columns}
      view={view}
      rowKey={(r) => r.id ?? ''}
      onRowClick={(r) => r.id && navigate(`/invoices/${r.id}`)}
      selection={selection}
      fillMode="proportional"
      rowAriaLabel={(r) => `Invoice ${r.invoice_number ?? ''}`}
      rowClassName={(r) => (r.status === 'overdue' ? 'bg-danger-muted' : undefined)}
    />
  );
};
