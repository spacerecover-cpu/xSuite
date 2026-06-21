import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { formatDate } from '../../lib/format';
import { ListPageTemplate } from '../../components/templates/ListPageTemplate';
import { KpiRow } from '../../components/templates/KpiRow';
import { RecordPaymentModal } from '../../components/financial/RecordPaymentModal';
import { PaymentViewModal } from '../../components/financial/PaymentViewModal';
import { PaymentReceiptModal } from '../../components/financial/PaymentReceiptModal';
import { useCurrency } from '../../hooks/useCurrency';
import { useConfirm } from '../../hooks/useConfirm';
import { useToast } from '../../hooks/useToast';
import { createPayment, getPaymentStats, voidPayment, fetchPaymentById } from '../../lib/paymentsService';
import { baseAmount } from '../../lib/financialMath';
import { EmptyState } from '../../components/shared/EmptyState';
import { logger } from '../../lib/logger';
import {
  Plus,
  Search,
  CreditCard,
  User,
  Eye,
  Receipt,
  XCircle,
  CheckCircle,
  AlertCircle,
  Download,
  MoreVertical,
  Printer,
  TrendingUp,
  BarChart3,
} from 'lucide-react';

const PAGE_SIZE = 50;

export const PaymentsList: React.FC = () => {
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const confirm = useConfirm();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [_selectedPayment, _setSelectedPayment] = useState<any>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [fullPaymentData, setFullPaymentData] = useState<any>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Command-palette deep-link: /payments?new=1 opens record payment.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowRecordPaymentModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Reset to the first page whenever the active filters/search change.
  useEffect(() => {
    setPage(0);
  }, [searchTerm, statusFilter, dateFilter, paymentMethodFilter]);

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment_methods_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_payment_methods')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: paymentsPage, isLoading } = useQuery({
    queryKey: ['payments', searchTerm, statusFilter, dateFilter, paymentMethodFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select(`
          id,
          payment_number,
          payment_date,
          amount,
          amount_base,
          reference,
          status,
          notes,
          payment_method_id,
          customer:customers_enhanced(id, customer_name, email),
          payment_method:master_payment_methods(id, name),
          bank_account:bank_accounts(account_name:name),
          allocations:payment_allocations(
            amount,
            invoice:invoices(invoice_number, case_id)
          )
        `, { count: 'exact' })
        .order('payment_date', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (searchTerm) {
        const s = sanitizeFilterValue(searchTerm);
        query = query.or(`payment_number.ilike.%${s}%,reference.ilike.%${s}%`);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (paymentMethodFilter !== 'all') {
        query = query.eq('payment_method_id', paymentMethodFilter);
      }

      if (dateFilter !== 'all') {
        const now = new Date();
        let startDate: Date;

        switch (dateFilter) {
          case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'week':
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case 'month':
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
          case 'year':
            startDate = new Date(now.setFullYear(now.getFullYear() - 1));
            break;
          default:
            startDate = new Date(0);
        }

        query = query.gte('payment_date', startDate.toISOString().split('T')[0]);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data || [], total: count || 0 };
    },
    placeholderData: keepPreviousData,
  });
  const payments = paymentsPage?.rows ?? [];
  const totalPaymentsCount = paymentsPage?.total ?? 0;

  const { data: stats } = useQuery({
    queryKey: ['payment_stats'],
    queryFn: () => getPaymentStats(),
  });

  const createPaymentMutation = useMutation({
    mutationFn: async ({
      paymentData,
      allocations,
    }: {
      paymentData: Omit<import('../../lib/paymentsService').Payment, 'id' | 'payment_number' | 'created_at' | 'updated_at'>;
      allocations: Array<{ invoice_id: string; amount: number }>;
    }) => {
      return createPayment(paymentData, allocations);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment_stats'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['cases_with_unpaid_invoices'] });
      queryClient.invalidateQueries({ queryKey: ['unpaid_invoices_by_case'] });
      setShowRecordPaymentModal(false);
    },
  });

  const voidPaymentMutation = useMutation({
    mutationFn: (paymentId: string) => voidPayment(paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment_stats'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['cases_with_unpaid_invoices'] });
      queryClient.invalidateQueries({ queryKey: ['unpaid_invoices_by_case'] });
    },
  });

  const handleVoidPayment = async (paymentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (await confirm({
      title: 'Void payment?',
      message: 'Are you sure you want to void this payment? This will reverse all invoice allocations.',
      tone: 'danger',
    })) {
      await voidPaymentMutation.mutateAsync(paymentId);
    }
  };

  const handleViewPayment = async (payment: { id: string }) => {
    try {
      const fullData = await fetchPaymentById(payment.id);
      setFullPaymentData(fullData);
      setShowViewModal(true);
    } catch (error) {
      logger.error('Error fetching payment details:', error);
      toast.error('Failed to load payment details');
    }
  };

  const handlePrintReceipt = async (payment: { id: string }) => {
    try {
      const fullData = await fetchPaymentById(payment.id);
      setFullPaymentData(fullData);
      setShowReceiptModal(true);
    } catch (error) {
      logger.error('Error fetching payment details:', error);
      toast.error('Failed to load payment receipt');
    }
  };

  const handlePrintReceiptFromView = () => {
    setShowViewModal(false);
    setShowReceiptModal(true);
  };

  const handleExportToCSV = async () => {
    // Export ALL rows matching the active filters (not just the current page).
    let query = supabase
      .from('payments')
      .select(`
        payment_number, payment_date, amount, reference, status,
        customer:customers_enhanced(customer_name),
        payment_method:master_payment_methods(name)
      `)
      .order('payment_date', { ascending: false });

    if (searchTerm) {
      const s = sanitizeFilterValue(searchTerm);
      query = query.or(`payment_number.ilike.%${s}%,reference.ilike.%${s}%`);
    }
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (paymentMethodFilter !== 'all') query = query.eq('payment_method_id', paymentMethodFilter);
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      switch (dateFilter) {
        case 'today': startDate = new Date(now.setHours(0, 0, 0, 0)); break;
        case 'week': startDate = new Date(now.setDate(now.getDate() - 7)); break;
        case 'month': startDate = new Date(now.setMonth(now.getMonth() - 1)); break;
        case 'year': startDate = new Date(now.setFullYear(now.getFullYear() - 1)); break;
        default: startDate = new Date(0);
      }
      query = query.gte('payment_date', startDate.toISOString().split('T')[0]);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to export payments');
      return;
    }

    const headers = ['Payment #', 'Date', 'Customer', 'Amount', 'Method', 'Reference', 'Status'];
    const rows = (data ?? []).map((p: any) => [
      p.payment_number,
      p.payment_date ? formatDate(p.payment_date) : '',
      p.customer?.customer_name || 'N/A',
      p.amount,
      p.payment_method?.name || 'N/A',
      p.reference || '',
      p.status,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter('all');
    setPaymentMethodFilter('all');
  };

  const activeFiltersCount = [
    searchTerm,
    statusFilter !== 'all' ? statusFilter : null,
    dateFilter !== 'all' ? dateFilter : null,
    paymentMethodFilter !== 'all' ? paymentMethodFilter : null,
  ].filter(Boolean).length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-3 h-3" />;
      case 'pending':
        return <AlertCircle className="w-3 h-3" />;
      case 'failed':
      case 'refunded':
        return <XCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const loadingFallback = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );

  const headerActions = (
    <Button onClick={() => setShowRecordPaymentModal(true)} className="flex items-center gap-2">
      <Plus className="w-4 h-4" />
      Record Payment
    </Button>
  );

  const kpis = (
    <KpiRow
      stats={[
        { label: 'Total Received', value: formatCurrency(stats?.totalAmount || 0), tone: 'success' },
        { label: 'This Month', value: formatCurrency(stats?.thisMonthAmount || 0), tone: 'info' },
        { label: 'Completed', value: stats?.completed ?? 0, tone: 'success' },
        { label: 'Total Count', value: stats?.total ?? 0, tone: 'neutral' },
      ]}
    />
  );

  const toolbar = (
    <>
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6">
        <div className="p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
              <div className="w-full lg:w-80 relative flex-shrink-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search payments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div className="flex-1 flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>

                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                </select>

                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Methods</option>
                  {paymentMethods.map((method: { id: string; name: string }) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>

                {activeFiltersCount > 0 && (
                  <button
                    onClick={handleClearFilters}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Clear ({activeFiltersCount})
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="secondary"
                  onClick={handleExportToCSV}
                  className="flex items-center gap-2"
                  disabled={totalPaymentsCount === 0}
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowAnalytics(!showAnalytics)}
                  className="flex items-center gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  {showAnalytics ? 'Hide' : 'Show'} Analytics
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAnalytics && (
        <div className="bg-gradient-to-br from-info-muted to-info-muted rounded-2xl shadow-lg border border-info/30 mb-6 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-slate-900">Payment Analytics</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-info/20">
              <p className="text-xs text-slate-500 mb-1">Average Payment</p>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(stats && stats.total > 0 ? stats.totalAmount / stats.total : 0)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-success/20">
              <p className="text-xs text-slate-500 mb-1">Success Rate</p>
              <p className="text-2xl font-bold text-success">
                {stats && stats.total > 0
                  ? ((stats.completed / stats.total) * 100).toFixed(1)
                  : 0}%
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-accent/20">
              <p className="text-xs text-slate-500 mb-1">Total Transactions</p>
              <p className="text-2xl font-bold text-accent-foreground">{stats?.total ?? 0}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const empty = (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
      <EmptyState
        icon={CreditCard}
        title="No payments found"
        description={
          searchTerm || statusFilter !== 'all' || dateFilter !== 'all'
            ? 'No payments found matching your criteria.'
            : 'No payments yet. Record your first payment to get started.'
        }
        action={{ label: 'Record Payment', onClick: () => setShowRecordPaymentModal(true) }}
      />
    </div>
  );

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Payment #</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Case</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Method</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Reference</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-primary">{payment.payment_number}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {payment.payment_date ? formatDate(payment.payment_date) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {/* payments has no case_id column in v1.0.0 (linkage flows via invoice.case_id). */}
                      <span className="text-sm text-slate-400">-</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-900">
                          {payment.customer?.customer_name || 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm font-bold text-success">
                        {formatCurrency(baseAmount(payment, 'amount'))}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="secondary" size="sm">
                        {payment.payment_method?.name || 'N/A'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {payment.reference || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge
                        variant={statusToBadgeVariant(payment.status ?? '')}
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        {getStatusIcon(payment.status ?? '')}
                        {payment.status ?? 'unknown'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleViewPayment(payment)}
                          className="p-1.5 text-primary hover:bg-info-muted rounded transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePrintReceipt(payment)}
                          className="p-1.5 text-success hover:bg-success-muted rounded transition-colors"
                          title="Print Receipt"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setOpenDropdown(openDropdown === payment.id ? null : payment.id)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                            title="More Actions"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {openDropdown === payment.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenDropdown(null)}
                              />
                              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-20">
                                <button
                                  onClick={() => {
                                    window.open(`/print/payment-receipt/${payment.id}`, '_blank');
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <Printer className="w-4 h-4" />
                                  Print in New Tab
                                </button>
                                <button
                                  onClick={() => {
                                    handleViewPayment(payment);
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <Eye className="w-4 h-4" />
                                  View Full Details
                                </button>
                                {/* payments has no case_id column in v1.0.0 — case linkage is via invoice. */}
                                <div className="border-t border-slate-200 my-1" />
                                {payment.status === 'completed' && (
                                  <button
                                    onClick={(e) => {
                                      setOpenDropdown(null);
                                      handleVoidPayment(payment.id, e);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-danger hover:bg-danger-muted flex items-center gap-2"
                                  >
                                    <XCircle className="w-4 h-4" />
                                    Void Payment
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
    </div>
  );

  return (
    <ListPageTemplate
      title="Payments"
      headerActions={headerActions}
      kpis={kpis}
      toolbar={toolbar}
      table={table}
      pager={{
        page,
        pageSize: PAGE_SIZE,
        total: totalPaymentsCount,
        onPageChange: setPage,
        itemNoun: 'payments',
      }}
      loading={isLoading}
      loadingFallback={loadingFallback}
      isEmpty={payments.length === 0}
      empty={empty}
    >
      <RecordPaymentModal
        isOpen={showRecordPaymentModal}
        onClose={() => setShowRecordPaymentModal(false)}
        onSave={async (paymentData, allocations) => {
          await createPaymentMutation.mutateAsync({ paymentData, allocations });
        }}
      />

      <PaymentViewModal
        isOpen={showViewModal}
        onClose={() => {
          setShowViewModal(false);
          setFullPaymentData(null);
        }}
        payment={fullPaymentData}
        onPrintReceipt={handlePrintReceiptFromView}
      />

      <PaymentReceiptModal
        isOpen={showReceiptModal}
        onClose={() => {
          setShowReceiptModal(false);
          setFullPaymentData(null);
        }}
        payment={fullPaymentData}
      />
    </ListPageTemplate>
  );
};
