import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchInvoices, getInvoiceStats, createInvoice, updateInvoice } from '../../lib/invoiceService';
import type { Invoice, InvoiceItem, InvoiceWithDetails } from '../../lib/invoiceService';
import type { PaymentReceipt } from '../../lib/bankingService';

// Legacy proforma -> tax-invoice linkage. Columns dropped from `invoices` in
// v1.0.0; surfaced here only so the existing UI buttons compile until the
// linkage UI is wired to the new converted_from_quote_id chain.
type InvoiceWithLegacyLinks = InvoiceWithDetails & {
  converted_to_invoice_id?: string | null;
  proforma_invoice_id?: string | null;
};
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { FinancialModuleHeader } from '../../components/financial/FinancialModuleHeader';
import { FinancialStatsCard } from '../../components/financial/FinancialStatsCard';
import { InvoiceFormModal } from '../../components/cases/InvoiceFormModal';
import { RecordReceiptModal } from '../../components/banking/RecordReceiptModal';
import { useCurrency } from '../../hooks/useCurrency';
import { supabase } from '../../lib/supabaseClient';
import { EmptyState } from '../../components/shared/EmptyState';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle,
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
import { formatDate } from '../../lib/format';

export const InvoicesListPage: React.FC<unknown> = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
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

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', statusFilter, typeFilter, debouncedSearch],
    queryFn: () =>
      fetchInvoices({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        invoiceType: typeFilter !== 'all' ? typeFilter : undefined,
        search: debouncedSearch || undefined,
      }),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: '#94a3b8',
      sent: '#3b82f6',
      paid: '#10b981',
      partial: '#f59e0b',
      overdue: '#ef4444',
      cancelled: '#64748b',
      converted: 'rgb(var(--color-accent))',
    };
    return colors[status] || '#64748b';
  };

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

  const { sentInvoices, paidInvoices, overdueInvoices } = useMemo(
    () => ({
      sentInvoices: invoices.filter((i) => i.status === 'sent'),
      paidInvoices: invoices.filter((i) => i.status === 'paid'),
      overdueInvoices: invoices.filter((i) => i.status === 'overdue'),
    }),
    [invoices]
  );

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1800px] mx-auto">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
          <p className="text-slate-500 mt-4">Loading invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <FinancialModuleHeader
        icon={<FileText className="w-7 h-7 text-white" />}
        title="Invoices"
        description="Manage customer invoices and billing"
        iconBgColor="#10b981"
        statistics={[
          { label: 'Total Invoices', value: invoices.length, color: '#10b981' },
          { label: 'Paid', value: paidInvoices.length, color: '#10b981' },
          { label: 'Sent', value: sentInvoices.length, color: '#f59e0b' },
          { label: 'Overdue', value: overdueInvoices.length, color: '#ef4444' },
        ]}
        primaryAction={{
          label: 'Create Invoice',
          onClick: () => setShowInvoiceModal(true),
          icon: <Plus className="w-4 h-4" />,
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <FinancialStatsCard
          label="Total Invoiced"
          value={formatCurrency(stats?.totalValue || 0)}
          icon={<FileText className="w-5 h-5 text-white" />}
          color="blue"
        />
        <FinancialStatsCard
          label="Paid"
          value={formatCurrency(stats?.totalPaid || 0)}
          icon={<CheckCircle className="w-5 h-5 text-white" />}
          color="green"
        />
        <FinancialStatsCard
          label="Outstanding"
          value={formatCurrency(stats?.totalOutstanding || 0)}
          icon={<Clock className="w-5 h-5 text-white" />}
          color="orange"
        />
        <FinancialStatsCard
          label="Overdue"
          value={overdueInvoices.length}
          icon={<AlertCircle className="w-5 h-5 text-white" />}
          color="red"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6">
        <div className="p-6">
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
                    ? 'bg-sky-500 text-white shadow-md'
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
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Invoice #
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Case
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
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
                      invoice.status === 'overdue' ? 'bg-danger-muted' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-primary">
                        {invoice.invoice_number}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge
                        variant="custom"
                        color={getTypeColor(invoice.invoice_type)}
                        size="sm"
                      >
                        {invoice.invoice_type === 'proforma' ? 'Proforma' : 'Tax Invoice'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
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
                    <td className="px-6 py-4 whitespace-nowrap">
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-slate-600">
                        {formatDate(invoice.invoice_date || '')}
                      </p>
                      {invoice.created_by_profile && (
                        <p className="text-xs text-slate-500">
                          {invoice.created_by_profile.full_name}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {invoice.due_date ? formatDate(invoice.due_date) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <Badge variant="custom" color={getStatusColor(invoice.status)} size="sm">
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
                    <td className="px-6 py-4 whitespace-nowrap">
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
                        {['draft', 'sent'].includes(invoice.status) && invoice.status !== 'converted' && (
                          <button
                            onClick={async () => {
                              if (!invoice.id) return;
                              const { data, error } = await supabase
                                .from('invoices')
                                .select(`
                                  *,
                                  invoice_line_items (*)
                                `)
                                .eq('id', invoice.id)
                                .maybeSingle();

                              if (!error && data) {
                                setEditingInvoice(data as unknown as InvoiceWithDetails);
                                setShowInvoiceModal(true);
                              }
                            }}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {invoice.invoice_type === 'tax_invoice' && invoice.status !== 'paid' && invoice.status !== 'converted' && (
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
            const receiptRow = receiptData as Partial<PaymentReceipt>;
            if (typeof receiptRow.amount !== 'number') {
              throw new Error('Receipt amount is required');
            }
            // `receipts` is the live tenant table. Caller-facing fields that do
            // not exist on the live schema (account_id, payment_method_id,
            // case_id, company_id, reference_number, description, source_type)
            // exist only on the modal's draft. tenant_id is auto-populated by
            // the set_tenant_and_audit_fields trigger.
            const { data: receipt, error: receiptError } = await supabase
              .from('receipts')
              .insert({
                tenant_id: '' as string,
                amount: receiptRow.amount,
                receipt_date: receiptRow.receipt_date ?? null,
                customer_id: receiptRow.customer_id ?? null,
                payment_method: receiptRow.payment_method_id ?? null,
                reference: receiptRow.reference_number ?? null,
                notes: receiptRow.notes ?? null,
                status: receiptRow.status ?? 'completed',
              })
              .select()
              .maybeSingle();

            if (receiptError) throw receiptError;
            if (!receipt) throw new Error('Receipt insert returned no row');

            if (allocations && allocations.length > 0) {
              const allocationRecords = allocations.map((alloc) => ({
                tenant_id: '' as string,
                receipt_id: receipt.id,
                invoice_id: alloc.invoice_id,
                amount: alloc.allocated_amount,
              }));

              const { error: allocError } = await supabase
                .from('receipt_allocations')
                .insert(allocationRecords);

              if (allocError) throw allocError;

              for (const alloc of allocations) {
                const { data: invoice } = await supabase
                  .from('invoices')
                  .select('total_amount, amount_paid, status')
                  .eq('id', alloc.invoice_id)
                  .maybeSingle();

                if (invoice) {
                  const totalAmount = invoice.total_amount ?? 0;
                  const newAmountPaid = (invoice.amount_paid ?? 0) + alloc.allocated_amount;
                  const newAmountDue = totalAmount - newAmountPaid;
                  const newStatus =
                    newAmountDue <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : invoice.status;

                  await supabase
                    .from('invoices')
                    .update({
                      amount_paid: newAmountPaid,
                      balance_due: newAmountDue,
                      status: newStatus,
                    })
                    .eq('id', alloc.invoice_id);
                }
              }
            }

            // `account_id` lives on the modal draft only (no FK column on
            // `receipts`); still useful for updating the bank balance.
            const accountId = receiptRow.account_id;
            if (accountId) {
              const { data: account } = await supabase
                .from('bank_accounts')
                .select('current_balance')
                .eq('id', accountId)
                .maybeSingle();

              if (account) {
                await supabase
                  .from('bank_accounts')
                  .update({
                    current_balance: (account.current_balance ?? 0) + receiptRow.amount,
                  })
                  .eq('id', accountId);
              }
            }

            queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
            queryClient.invalidateQueries({ queryKey: ['invoice_stats'] });
          }}
          caseId={editingInvoice?.case_id || ''}
          customerId={editingInvoice?.customer_id}
          companyId={editingInvoice?.company_id}
          initialData={editingInvoice as unknown as Record<string, unknown> | undefined}
          clientReference={editingInvoice?.client_reference}
        />
      )}
    </div>
  );
};

export default InvoicesListPage;
