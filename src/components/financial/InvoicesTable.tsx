import React from 'react';
import { Badge } from '../ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { formatDate } from '../../lib/format';
import type { InvoiceWithDetails } from '../../lib/invoiceService';
import type { BulkSelection } from '../../hooks/useBulkSelection';
import {
  User,
  Building2,
  Eye,
  Edit,
  DollarSign,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Lock,
} from 'lucide-react';

// Legacy proforma -> tax-invoice linkage. Columns dropped from `invoices` in
// v1.0.0; surfaced here only so the existing UI buttons compile until the
// linkage UI is wired to the new converted_from_quote_id chain.
type InvoiceWithLegacyLinks = InvoiceWithDetails & {
  converted_to_invoice_id?: string | null;
  proforma_invoice_id?: string | null;
};

export interface InvoicesTableProps {
  rows: InvoiceWithDetails[];
  selection: BulkSelection;
  visibleIds: string[];
  navigate: (path: string) => void;
  formatCurrency: (amount: number) => string;
  getTypeColor: (type: string) => string;
  getClientName: (invoice: {
    customers_enhanced?: { customer_name: string } | null;
    companies?: { company_name: string | null } | null;
  }) => string;
  canEdit: (invoice: InvoiceWithDetails) => boolean;
  canRecordPayment: (invoice: InvoiceWithDetails) => boolean;
  onEdit: (invoice: InvoiceWithDetails) => void;
  onRecordPayment: (invoice: InvoiceWithDetails) => void;
}

/**
 * Invoices 9-col list table — lifted verbatim from InvoicesListPage. Presentational
 * only; the page owns the data + handlers. Preserves the select-all indeterminate
 * state and the overdue/selected row highlighting exactly.
 */
export const InvoicesTable: React.FC<InvoicesTableProps> = ({
  rows,
  selection,
  visibleIds,
  navigate,
  formatCurrency,
  getTypeColor,
  getClientName,
  canEdit,
  canRecordPayment,
  onEdit,
  onRecordPayment,
}) => (
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="bg-slate-50 border-b border-slate-200">
        <tr>
          <th className="px-4 py-2.5 w-10">
            <input
              type="checkbox"
              checked={selection.allSelected(visibleIds)}
              ref={(el) => {
                if (el) {
                  el.indeterminate =
                    !selection.allSelected(visibleIds) && selection.someSelected(visibleIds);
                }
              }}
              onChange={(e) => selection.setMany(visibleIds, e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
              aria-label="Select all on this page"
            />
          </th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Invoice #
          </th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Type
          </th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Case
          </th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Customer
          </th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Date
          </th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Due Date
          </th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Amount
          </th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Status
          </th>
          <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Actions
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {rows.map((invoice) => (
          <tr
            key={invoice.id}
            onClick={() => navigate(`/invoices/${invoice.id}`)}
            className={`hover:bg-slate-50 transition-colors cursor-pointer ${
              invoice.id && selection.isSelected(invoice.id)
                ? 'bg-info-muted/30'
                : invoice.status === 'overdue'
                  ? 'bg-danger-muted'
                  : ''
            }`}
          >
            <td
              className="px-4 py-2.5 w-10"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={invoice.id ? selection.isSelected(invoice.id) : false}
                onChange={() => invoice.id && selection.toggle(invoice.id)}
                disabled={!invoice.id}
                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-30"
                aria-label={`Select invoice ${invoice.invoice_number}`}
              />
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <span className="font-semibold text-primary">
                {invoice.invoice_number}
              </span>
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <Badge
                variant="custom"
                color={getTypeColor(invoice.invoice_type)}
                size="sm"
              >
                {invoice.invoice_type === 'proforma' ? 'Proforma' : 'Tax Invoice'}
              </Badge>
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              {invoice.cases ? (
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {invoice.cases.case_no}
                  </p>
                  <p className="text-xs text-slate-500 truncate max-w-xs">
                    {invoice.cases.title}
                  </p>
                </div>
              ) : (
                'N/A'
              )}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <div className="flex items-center gap-2">
                {invoice.customers_enhanced ? (
                  <User className="w-4 h-4 text-slate-400" />
                ) : (
                  <Building2 className="w-4 h-4 text-slate-400" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {getClientName(invoice)}
                  </p>
                </div>
              </div>
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <p className="text-sm text-slate-600">
                {formatDate(invoice.invoice_date || '')}
              </p>
              {invoice.created_by_profile && (
                <p className="text-xs text-slate-500">
                  {invoice.created_by_profile.full_name}
                </p>
              )}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-600">
              {invoice.due_date ? formatDate(invoice.due_date) : 'N/A'}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {formatCurrency(invoice.total_amount || 0)}
                </p>
                {invoice.balance_due && invoice.balance_due > 0 && (
                  <p className="text-xs text-warning">
                    Due: {formatCurrency(invoice.balance_due)}
                  </p>
                )}
              </div>
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <div className="flex flex-col gap-1">
                <Badge variant={statusToBadgeVariant(invoice.status)} size="sm">
                  {invoice.status}
                </Badge>
                {invoice.status === 'converted' &&
                  (invoice as InvoiceWithLegacyLinks).converted_to_invoice_id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(
                        `/invoices/${(invoice as InvoiceWithLegacyLinks).converted_to_invoice_id}`
                      );
                    }}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                    title="View converted tax invoice"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>View Tax Invoice</span>
                  </button>
                )}
                {(invoice as InvoiceWithLegacyLinks).proforma_invoice_id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(
                        `/invoices/${(invoice as InvoiceWithLegacyLinks).proforma_invoice_id}`
                      );
                    }}
                    className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 transition-colors"
                    title="View original proforma"
                  >
                    <ArrowRight className="w-3 h-3" />
                    <span>From Proforma</span>
                  </button>
                )}
              </div>
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <div
                className="flex items-center justify-end gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                  className="p-1.5 text-primary hover:bg-info-muted rounded transition-colors"
                  title="View"
                >
                  <Eye className="w-4 h-4" />
                </button>
                {canEdit(invoice) && (
                  <button
                    onClick={() => onEdit(invoice)}
                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                )}
                {canRecordPayment(invoice) && (
                  <button
                    onClick={() => onRecordPayment(invoice)}
                    className="p-1.5 text-success hover:bg-success-muted rounded transition-colors"
                    title="Record Payment"
                  >
                    <DollarSign className="w-4 h-4" />
                  </button>
                )}
                {invoice.invoice_type === 'proforma' && invoice.status === 'converted' && (
                  <div className="flex items-center gap-1 text-xs text-slate-500" title="Read-only (Converted)">
                    <Lock className="w-3 h-3" />
                  </div>
                )}
                {invoice.invoice_type === 'proforma' && invoice.status !== 'converted' && (
                  <div className="flex items-center gap-1 text-xs text-warning" title="Payments not allowed on proforma">
                    <AlertCircle className="w-3 h-3" />
                  </div>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
