import { Badge } from '../../components/ui/Badge';
import { RowActionsMenu, type RowAction } from '../../components/ui/RowActionsMenu';
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
      minWidth: 150,
      priority: 1,
      defaultVisible: true,
      render: (r) => <span className="font-semibold text-primary">{r.invoice_number}</span>,
    },
    {
      key: 'invoice_type',
      label: 'Type',
      minWidth: 135,
      priority: 4,
      defaultVisible: true,
      // Semantic variants (not a custom raw colour): legible muted chip with a
      // proper foreground tone. The previous custom-colour path fed an
      // `rgb(var(--token))` into a `${color}20` opacity hack that isn't valid
      // CSS, so the proforma chip rendered as near-invisible pale text.
      render: (r) =>
        r.invoice_type === 'proforma' ? (
          <Badge variant="secondary" size="sm">Proforma</Badge>
        ) : (
          <Badge variant="info" size="sm">Tax Invoice</Badge>
        ),
    },
    {
      key: 'case',
      label: 'Case',
      minWidth: 160,
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
      minWidth: 170,
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
      minWidth: 140,
      priority: 2,
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
      minWidth: 130,
      priority: 5,
      defaultVisible: true,
      render: (r) => (
        <span className="text-sm text-slate-600">{r.due_date ? formatDate(r.due_date) : 'N/A'}</span>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      minWidth: 140,
      priority: 1,
      defaultVisible: true,
      align: 'end',
      render: (r) => (
        <span className="text-sm font-medium text-slate-900 tabular-nums">
          {ctx.formatCurrency(r.total_amount || 0)}
        </span>
      ),
    },
    {
      key: 'balance',
      label: 'Balance',
      minWidth: 130,
      priority: 2,
      defaultVisible: true,
      align: 'end',
      // Outstanding amount split out of Amount so it scans as its own column;
      // urgency colour stays on the Status column. Settled rows show a muted dash.
      render: (r) =>
        r.balance_due && r.balance_due > 0 ? (
          <span className="text-sm font-medium text-slate-900 tabular-nums">
            {ctx.formatCurrency(r.balance_due)}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      minWidth: 150,
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
      minWidth: 110,
      priority: 1,
      defaultVisible: true,
      align: 'end',
      render: (r) => {
        const actions: RowAction[] = [
          { label: 'Open invoice', icon: Eye, onClick: () => r.id && ctx.navigate(`/invoices/${r.id}`) },
        ];
        if (ctx.canEdit(r)) {
          actions.push({ label: 'Edit', icon: Edit, onClick: () => ctx.onEdit(r) });
        }
        if (ctx.canRecordPayment(r)) {
          actions.push({
            label: 'Record payment',
            icon: DollarSign,
            tone: 'success',
            onClick: () => ctx.onRecordPayment(r),
          });
        }
        const note =
          r.invoice_type === 'proforma'
            ? r.status === 'converted'
              ? { label: 'Read-only (converted)', icon: Lock }
              : { label: 'Payments disabled on proforma', icon: AlertCircle }
            : undefined;
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <RowActionsMenu actions={actions} note={note} ariaLabel={`Actions for ${r.invoice_number ?? 'invoice'}`} />
          </div>
        );
      },
    },
  ];
}
