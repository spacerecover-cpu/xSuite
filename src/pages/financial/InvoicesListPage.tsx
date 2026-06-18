import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetchInvoicesPage, getInvoiceStats, createInvoice, updateInvoice, toInvoiceEditInitialData } from '../../lib/invoiceService';
import type { Invoice, InvoiceItem, InvoiceWithDetails } from '../../lib/invoiceService';
import { getInvoiceEditability, canRecordPayment as invoiceCanRecordPayment } from '../../lib/invoicePermissions';
import type { PaymentReceipt } from '../../lib/bankingService';
import { receiptsService } from '../../lib/receiptsService';

// Legacy proforma -> tax-invoice linkage. Columns dropped from `invoices` in
// v1.0.0; surfaced here only so the existing UI buttons compile until the
// linkage UI is wired to the new converted_from_quote_id chain.
type InvoiceWithLegacyLinks = InvoiceWithDetails & {
  converted_to_invoice_id?: string | null;
  proforma_invoice_id?: string | null;
};
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { PageHeader } from '../../components/shared/PageHeader';
import { StatCard } from '../../components/shared/StatCard';
import { InvoiceFormModal } from '../../components/cases/InvoiceFormModal';
import { RecordReceiptModal } from '../../components/banking/RecordReceiptModal';
import { useCurrency } from '../../hooks/useCurrency';
import { useConfirm } from '../../hooks/useConfirm';
import { supabase } from '../../lib/supabaseClient';
import { EmptyState } from '../../components/shared/EmptyState';
import { ExportButton } from '../../components/shared/ExportButton';
import { BulkActionsBar, BulkActionButton } from '../../components/shared/BulkActionsBar';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { downloadCSV } from '../../lib/csvExport';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import {
  FileText,
  Plus,
  Search,
  Filter,
  User,
  Building2,
  Eye,
  Edit,
  DollarSign,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Lock,
  Archive,
  Download,
  Send,
} from 'lucide-react';
import { formatDate } from '../../lib/format';

const PAGE_SIZE = 50;

export const InvoicesListPage: React.FC<unknown> = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const confirm = useConfirm();
  const { profile } = useAuth();
  const selection = useBulkSelection();
  const canBulkArchive = profile?.role === 'owner' || profile?.role === 'admin';
  const [isArchiving, setIsArchiving] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceWithDetails | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceWithDetails | null>(null);

  // Command-palette deep-link: /invoices?new=1 opens the create modal.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowInvoiceModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: stats } = useQuery({
    queryKey: ['invoice_stats'],
    queryFn: () => getInvoiceStats(),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const [page, setPage] = useState(0);

  // Reset to the first page whenever the active filters/search change.
  useEffect(() => {
    setPage(0);
  }, [statusFilter, typeFilter, debouncedSearch]);

  const { data: invoicesPage, isLoading } = useQuery({
    queryKey: ['invoices', statusFilter, typeFilter, debouncedSearch, page],
    queryFn: () =>
      fetchInvoicesPage({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        invoiceType: typeFilter !== 'all' ? typeFilter : undefined,
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
  const invoices = invoicesPage?.rows ?? [];
  const totalInvoices = invoicesPage?.total ?? 0;

  const getTypeColor = (type: string) => {
    return type === 'proforma' ? 'rgb(var(--color-accent))' : '#0ea5e9';
  };

  const getClientName = (invoice: {
    customers_enhanced?: { customer_name: string } | null;
    companies?: { company_name: string | null } | null;
  }) => {
    if (invoice.customers_enhanced) {
      return invoice.customers_enhanced.customer_name;
    }
    if (invoice.companies) {
      return invoice.companies.company_name ?? 'N/A';
    }
    return 'N/A';
  };

  // Invoice.id is technically string | undefined in the service-layer
  // interface (it carries through unsaved drafts), so filter to defined
  // strings before handing the list to the selection state.
  const visibleIds = invoices.map((i) => i.id).filter((id): id is string => Boolean(id));

  const handleBulkExport = async () => {
    if (selection.selectedCount === 0) return;
    const ids = Array.from(selection.selectedIds);
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_number, invoice_date, due_date, invoice_type, subtotal, tax_amount, total_amount, amount_paid, balance_due, status, customers_enhanced:customer_id(customer_name)')
      .in('id', ids);
    if (error) {
      toast.error('Failed to export selected invoices');
      return;
    }
    downloadCSV(
      data ?? [],
      [
        { key: 'invoice_number', label: 'Invoice #' },
        { key: 'invoice_date', label: 'Date' },
        { key: 'due_date', label: 'Due' },
        { key: 'invoice_type', label: 'Type' },
        {
          key: (r) => (r.customers_enhanced as { customer_name?: string } | null)?.customer_name,
          label: 'Customer',
        },
        { key: 'subtotal', label: 'Subtotal' },
        { key: 'tax_amount', label: 'Tax' },
        { key: 'total_amount', label: 'Total' },
        { key: 'amount_paid', label: 'Paid' },
        { key: 'balance_due', label: 'Balance' },
        { key: 'status', label: 'Status' },
      ],
      'invoices-selected',
    );
    toast.success(`Exported ${data?.length ?? 0} invoice${data?.length === 1 ? '' : 's'}`);
  };

  const handleBulkArchive = async () => {
    if (selection.selectedCount === 0) return;
    if (!canBulkArchive) {
      toast.error('Only admins can bulk archive invoices');
      return;
    }
    const n = selection.selectedCount;
    if (!(await confirm({
      title: `Archive ${n} invoice${n === 1 ? '' : 's'}?`,
      message: `Archive ${n} invoice${n === 1 ? '' : 's'}? They'll be hidden from lists but recoverable.`,
      tone: 'danger',
    }))) {
      return;
    }
    setIsArchiving(true);
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(selection.selectedIds));
      if (error) throw error;
      toast.success(`Archived ${n} invoice${n === 1 ? '' : 's'}`);
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_stats'] });
    } catch (err) {
      toast.error((err as Error).message || 'Failed to archive invoices');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleBulkSend = async () => {
    if (selection.selectedCount === 0) return;
    const n = selection.selectedCount;
    // Up-front warning surfaces the rate-limit reality (5 emails/min)
    // before the user kicks off a 30-invoice batch.
    const msg =
      n > 5
        ? `Email ${n} invoices to their customers? Sending is rate-limited to 5/minute — this will take roughly ${Math.ceil(n / 5)} minute(s).`
        : `Email ${n} invoice${n === 1 ? '' : 's'} to their customers?`;
    if (!(await confirm({
      title: n === 1 ? 'Email invoice?' : `Email ${n} invoices?`,
      message: msg,
      tone: 'default',
    }))) return;
    setSendProgress({ done: 0, total: n });
    try {
      // Lazy-import: bulk-send drags pdfmake; only fetch on actual click.
      const { bulkSendInvoiceEmails } = await import('../../lib/invoiceService');
      const results = await bulkSendInvoiceEmails(
        Array.from(selection.selectedIds),
        (done, total) => setSendProgress({ done, total }),
      );
      const sent = results.filter((r) => r.status === 'sent').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      const failed = results.filter((r) => r.status === 'failed').length;
      if (failed === 0 && skipped === 0) {
        toast.success(`Sent ${sent} invoice${sent === 1 ? '' : 's'}`);
      } else if (failed > 0) {
        toast.warning(`Bulk send: ${sent} sent, ${skipped} skipped, ${failed} failed`);
      } else {
        toast.info(`Bulk send: ${sent} sent, ${skipped} skipped, ${failed} failed`);
      }
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_stats'] });
    } catch (err) {
      toast.error((err as Error).message || 'Bulk send failed');
    } finally {
      setSendProgress(null);
    }
  };

  if (isLoading) {
    return (
      <div className="px-6 py-5 max-w-[1800px] mx-auto space-y-4">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 px-4 py-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-5 max-w-[1800px] mx-auto">
      <PageHeader
        icon={FileText}
        title="Invoices"
        description="Manage customer invoices and billing"
        actions={
          <>
            <ExportButton
              filename="invoices"
              columns={[
                { key: 'invoice_number', label: 'Invoice #' },
                { key: 'invoice_date', label: 'Date' },
                { key: 'due_date', label: 'Due' },
                { key: 'invoice_type', label: 'Type' },
                {
                  key: (r) => (r.customers_enhanced as { customer_name?: string } | null)?.customer_name,
                  label: 'Customer',
                },
                { key: 'subtotal', label: 'Subtotal' },
                { key: 'tax_amount', label: 'Tax' },
                { key: 'total_amount', label: 'Total' },
                { key: 'amount_paid', label: 'Paid' },
                { key: 'balance_due', label: 'Balance' },
                { key: 'status', label: 'Status' },
              ]}
              getRows={async () => {
                let q = supabase
                  .from('invoices')
                  .select('invoice_number, invoice_date, due_date, invoice_type, subtotal, tax_amount, total_amount, amount_paid, balance_due, status, customers_enhanced:customer_id(customer_name)')
                  .is('deleted_at', null);
                if (debouncedSearch) {
                  q = q.ilike('invoice_number', `%${debouncedSearch}%`);
                }
                if (statusFilter !== 'all') q = q.eq('status', statusFilter);
                if (typeFilter !== 'all') q = q.eq('invoice_type', typeFilter);
                const { data, error } = await q.order('invoice_date', { ascending: false, nullsFirst: false });
                if (error) throw error;
                return data ?? [];
              }}
            />
            <Button size="sm" onClick={() => setShowInvoiceModal(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Create Invoice
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" role="region" aria-label="Invoice summary">
        <StatCard
          tone="info"
          label="Total Invoiced"
          value={formatCurrency(stats?.totalValue || 0)}
          sub={`${stats?.total ?? 0} invoices`}
        />
        <StatCard
          tone="success"
          label="Paid"
          value={formatCurrency(stats?.totalPaid || 0)}
          sub={`${stats?.paid ?? 0} paid`}
        />
        <StatCard
          tone="warning"
          label="Outstanding"
          value={formatCurrency(stats?.totalOutstanding || 0)}
          sub={`${Math.max((stats?.total ?? 0) - (stats?.paid ?? 0), 0)} unpaid`}
        />
        <StatCard
          tone="danger"
          label="Overdue"
          value={stats?.overdue ?? 0}
          sub="overdue invoices"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-4">
        <div className="px-4 py-3">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="w-full lg:w-80 relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by invoice number, case number, or customer name"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex-1 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStatusFilter(statusFilter === 'draft' ? 'all' : 'draft')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'draft'
                    ? 'bg-slate-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Draft
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === 'sent' ? 'all' : 'sent')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'sent'
                    ? 'bg-info text-info-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Sent
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === 'paid' ? 'all' : 'paid')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'paid'
                    ? 'bg-success text-success-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Paid
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'overdue'
                    ? 'bg-danger text-danger-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Overdue
              </button>
              <div className="h-6 w-px bg-slate-300 mx-2"></div>
              <button
                onClick={() => setTypeFilter(typeFilter === 'proforma' ? 'all' : 'proforma')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  typeFilter === 'proforma'
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Proforma
              </button>
              <button
                onClick={() =>
                  setTypeFilter(typeFilter === 'tax_invoice' ? 'all' : 'tax_invoice')
                }
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  typeFilter === 'tax_invoice'
                    ? 'bg-cat-1 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tax Invoice
              </button>
              {(statusFilter !== 'all' || typeFilter !== 'all') && (
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setTypeFilter('all');
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 transition-all"
                >
                  Clear All
                </button>
              )}
            </div>

            <Button
              variant="secondary"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <Filter className="w-4 h-4" />
              More Filters
              {(statusFilter !== 'all' || typeFilter !== 'all') && (
                <span className="ml-1 w-2 h-2 rounded-full bg-primary"></span>
              )}
            </Button>

          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Types</option>
                  <option value="proforma">Proforma Invoice</option>
                  <option value="tax_invoice">Tax Invoice</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <EmptyState
            icon={FileText}
            title="No invoices found"
            description={
              searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'No invoices found matching your criteria.'
                : 'No invoices yet. Create your first invoice to get started.'
            }
            action={{ label: 'Create Invoice', onClick: () => setShowInvoiceModal(true) }}
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
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
                {invoices.map((invoice) => (
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
                        {getInvoiceEditability(invoice).mode !== 'none' && (
                          <button
                            onClick={async () => {
                              if (!invoice.id) return;
                              const { data, error } = await supabase
                                .from('invoices')
                                .select('*')
                                .eq('id', invoice.id)
                                .maybeSingle();

                              if (!error && data) {
                                const { data: items } = await supabase
                                  .from('invoice_line_items')
                                  .select('*')
                                  .eq('invoice_id', invoice.id)
                                  .is('deleted_at', null)
                                  .order('sort_order', { ascending: true });
                                setEditingInvoice({ ...data, invoice_line_items: items ?? [] } as unknown as InvoiceWithDetails);
                                setShowInvoiceModal(true);
                              }
                            }}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {invoiceCanRecordPayment(invoice) && (
                          <button
                            onClick={() => {
                              setPaymentInvoice(invoice);
                              setShowPaymentModal(true);
                            }}
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
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
            <span>
              {totalInvoices === 0
                ? '0 invoices'
                : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalInvoices)} of ${totalInvoices}`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= totalInvoices}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && paymentInvoice && (
        <RecordReceiptModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setPaymentInvoice(null);
          }}
          onSave={async (receiptData: Record<string, unknown>, allocations?: Array<{ invoice_id: string; allocated_amount: number }>) => {
            const r = receiptData as Partial<PaymentReceipt>;
            if (typeof r.amount !== 'number') {
              throw new Error('Receipt amount is required');
            }
            // Atomic, money-conserving, append-only-ledger-posting receipt recording.
            // The RPC owns invoice balance recompute and bank-balance maintenance.
            await receiptsService.createReceiptWithAllocations(
              {
                amount: r.amount,
                receipt_date: r.receipt_date ?? null,
                customer_id: r.customer_id ?? null,
                payment_method: r.payment_method_id ?? null,
                reference: r.reference_number ?? null,
                notes: r.notes ?? null,
                status: r.status ?? 'completed',
                bank_account_id: r.account_id ?? null,
              },
              (allocations ?? []).map((a) => ({ invoice_id: a.invoice_id, amount: a.allocated_amount })),
            );

            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice'] });
            queryClient.invalidateQueries({ queryKey: ['invoice_stats'] });
          }}
          prefilledData={{
            customer_id: paymentInvoice.customer_id ?? undefined,
            company_id: paymentInvoice.company_id ?? undefined,
            case_id: paymentInvoice.case_id,
            amount: paymentInvoice.balance_due ?? paymentInvoice.total_amount ?? 0,
          }}
        />
      )}

      {showInvoiceModal && (
        <InvoiceFormModal
          isOpen={showInvoiceModal}
          onClose={() => {
            setShowInvoiceModal(false);
            setEditingInvoice(null);
          }}
          onSave={async (invoiceData: Record<string, unknown>, items: InvoiceItem[]) => {
            const invoicePayload = invoiceData as Partial<Invoice>;
            if (editingInvoice && editingInvoice.id) {
              await updateInvoice(editingInvoice.id, {
                case_id: invoicePayload.case_id,
                customer_id: invoicePayload.customer_id,
                company_id: invoicePayload.company_id,
                title: invoicePayload.title,
                invoice_type: invoicePayload.invoice_type,
                invoice_date: invoicePayload.invoice_date,
                due_date: invoicePayload.due_date,
                status: invoicePayload.status,
                payment_terms: invoicePayload.payment_terms,
                notes: invoicePayload.notes,
                internal_notes: invoicePayload.internal_notes,
                discount_amount: invoicePayload.discount_amount,
                discount_type: invoicePayload.discount_type,
                tax_rate: invoicePayload.tax_rate,
                client_reference: invoicePayload.client_reference,
                bank_account_id: invoicePayload.bank_account_id,
                terms_and_conditions: invoicePayload.terms_and_conditions,
                quote_id: invoicePayload.quote_id,
              }, items);
            } else {
              await createInvoice({
                title: invoicePayload.title,
                case_id: invoicePayload.case_id,
                customer_id: invoicePayload.customer_id,
                company_id: invoicePayload.company_id,
                invoice_type: invoicePayload.invoice_type,
                invoice_date: invoicePayload.invoice_date,
                due_date: invoicePayload.due_date,
                status: invoicePayload.status,
                notes: invoicePayload.notes,
                internal_notes: invoicePayload.internal_notes,
                discount_amount: invoicePayload.discount_amount,
                discount_type: invoicePayload.discount_type,
                tax_rate: invoicePayload.tax_rate,
                client_reference: invoicePayload.client_reference,
                bank_account_id: invoicePayload.bank_account_id,
                terms_and_conditions: invoicePayload.terms_and_conditions,
                quote_id: invoicePayload.quote_id,
              }, items);
            }

            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice'] });
            queryClient.invalidateQueries({ queryKey: ['invoice_stats'] });
          }}
          caseId={editingInvoice?.case_id || ''}
          customerId={editingInvoice?.customer_id}
          companyId={editingInvoice?.company_id}
          initialData={editingInvoice ? toInvoiceEditInitialData(editingInvoice as unknown as Record<string, unknown>) : undefined}
          clientReference={editingInvoice?.client_reference}
        />
      )}

      <BulkActionsBar
        count={selection.selectedCount}
        onClear={selection.clear}
        itemNoun="invoice"
      >
        <BulkActionButton
          variant="ghost"
          icon={<Download className="w-4 h-4" />}
          label="Export"
          onClick={handleBulkExport}
          disabled={sendProgress !== null}
        />
        <BulkActionButton
          variant="primary"
          icon={<Send className="w-4 h-4" />}
          label={
            sendProgress
              ? `Sending ${sendProgress.done}/${sendProgress.total}…`
              : 'Send'
          }
          onClick={handleBulkSend}
          disabled={sendProgress !== null || isArchiving}
        />
        {canBulkArchive && (
          <BulkActionButton
            variant="danger"
            icon={<Archive className="w-4 h-4" />}
            label={isArchiving ? 'Archiving…' : 'Archive'}
            onClick={handleBulkArchive}
            disabled={isArchiving || sendProgress !== null}
          />
        )}
      </BulkActionsBar>
    </div>
  );
};

export default InvoicesListPage;
