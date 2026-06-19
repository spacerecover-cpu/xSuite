import { Badge } from '../../components/ui/Badge';
import { statusToBadgeVariant } from '../ui/variants';
import { formatDate } from '../format';
import type { InvoiceWithDetails } from '../invoiceService';
import type { TableColumnDef } from './types';
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

/** Page-owned handlers + formatters the column renders close over, so the
 *  defs stay declarative while still navigating, formatting currency, and
 *  firing the row actions. */
export interface InvoiceColumnContext {
  navigate: (path: string) => void;
  formatCurrency: (amount: number) => string;
  getTypeColor: (type: string) => string;
  getClientName: (invoice: InvoiceWithDetails) => string;
  canEdit: (invoice: InvoiceWithDetails) => boolean;
  canRecordPayment: (invoice: InvoiceWithDetails) => boolean;
  onEdit: (invoice: InvoiceWithDetails) => void;
  onRecordPayment: (invoice: InvoiceWithDetails) => void;
}

const naDash = <span className="text-slate-400">N/A</span>;

/**
 * The Invoices list columns, expressed for `ConfigurableDataTable` so the table
 * fits its container (collapsing low-priority columns into the row expander)
 * instead of horizontally scrolling and clipping the right-hand columns — the
 * fit-to-width treatment the Cases table already uses.
 *
 * Identity / decision columns (number, customer, amount, status, actions) are
 * priority 1 and never collapse; metadata (type, case, dates) collapses first
 * on narrow viewports. Interactive cells stop click propagation so they don't
 * also trigger the row's navigate-to-detail.
 */
export function buildInvoicesColumns(ctx: InvoiceColumnContext): TableColumnDef<InvoiceWithDetails>[] {
  return [
    {
      key: 'invoice_number',
      label: 'Invoice #',
      minWidth: 120,
      priority: 1,
      defaultVisible: true,
      render: (r) => <span className="font-semibold text-primary">{r.invoice_number}</span>,
    },
    {
      key: 'invoice_type',
      label: 'Type',
      minWidth: 110,
      priority: 4,
      defaultVisible: true,
      render: (r) => (
        <Badge variant="custom" color={ctx.getTypeColor(r.invoice_type)} size="sm">
          {r.invoice_type === 'proforma' ? 'Proforma' : 'Tax Invoice'}
        </Badge>
      ),
    },
    {
      key: 'case',
      label: 'Case',
      minWidth: 140,
      priority: 3,
      defaultVisible: true,
      render: (r) =>
        r.cases ? (
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{r.cases.case_no}</p>
            <p className="text-xs text-slate-500 truncate">{r.cases.title}</p>
          </div>
        ) : (
          naDash
        ),
    },
    {
      key: 'customer',
      label: 'Customer',
      minWidth: 150,
      priority: 1,
      defaultVisible: true,
      render: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          {r.customers_enhanced ? (
            <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
          ) : (
            <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-slate-900 truncate">{ctx.getClientName(r)}</span>
        </div>
      ),
    },
    {
      key: 'invoice_date',
      label: 'Date',
      minWidth: 110,
      priority: 3,
      defaultVisible: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="text-sm text-slate-600">{formatDate(r.invoice_date || '')}</p>
          {r.created_by_profile && (
            <p className="text-xs text-slate-500 truncate">{r.created_by_profile.full_name}</p>
          )}
        </div>
      ),
    },
    {
      key: 'due_date',
      label: 'Due Date',
      minWidth: 110,
      priority: 5,
      defaultVisible: true,
      render: (r) => (
        <span className="text-sm text-slate-600">{r.due_date ? formatDate(r.due_date) : 'N/A'}</span>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      minWidth: 130,
      priority: 1,
      defaultVisible: true,
      render: (r) => (
        <div>
          <p className="text-sm font-medium text-slate-900 tabular-nums">
            {ctx.formatCurrency(r.total_amount || 0)}
          </p>
          {r.balance_due && r.balance_due > 0 ? (
            <p className="text-xs text-warning tabular-nums">Due: {ctx.formatCurrency(r.balance_due)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      minWidth: 140,
      priority: 1,
      defaultVisible: true,
      render: (r) => {
        const links = r as InvoiceWithLegacyLinks;
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={statusToBadgeVariant(r.status)} size="sm">
              {r.status}
            </Badge>
            {r.status === 'converted' && links.converted_to_invoice_id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.navigate(`/invoices/${links.converted_to_invoice_id}`);
                }}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                title="View converted tax invoice"
              >
                <ExternalLink className="w-3 h-3" />
                <span>View Tax Invoice</span>
              </button>
            )}
            {links.proforma_invoice_id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.navigate(`/invoices/${links.proforma_invoice_id}`);
                }}
                className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 transition-colors"
                title="View original proforma"
              >
                <ArrowRight className="w-3 h-3" />
                <span>From Proforma</span>
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      minWidth: 120,
      priority: 1,
      defaultVisible: true,
      align: 'end',
      render: (r) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => r.id && ctx.navigate(`/invoices/${r.id}`)}
            className="p-1.5 text-primary hover:bg-info-muted rounded transition-colors"
            title="View"
          >
            <Eye className="w-4 h-4" />
          </button>
          {ctx.canEdit(r) && (
            <button
              onClick={() => ctx.onEdit(r)}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
              title="Edit"
            >
              <Edit className="w-4 h-4" />
            </button>
          )}
          {ctx.canRecordPayment(r) && (
            <button
              onClick={() => ctx.onRecordPayment(r)}
              className="p-1.5 text-success hover:bg-success-muted rounded transition-colors"
              title="Record Payment"
            >
              <DollarSign className="w-4 h-4" />
            </button>
          )}
          {r.invoice_type === 'proforma' && r.status === 'converted' && (
            <div className="flex items-center gap-1 text-xs text-slate-500" title="Read-only (Converted)">
              <Lock className="w-3 h-3" />
            </div>
          )}
          {r.invoice_type === 'proforma' && r.status !== 'converted' && (
            <div className="flex items-center gap-1 text-xs text-warning" title="Payments not allowed on proforma">
              <AlertCircle className="w-3 h-3" />
            </div>
          )}
        </div>
      ),
    },
  ];
}
