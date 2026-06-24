import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { Modal } from '../../components/ui/Modal';
import { formatDate } from '../../lib/format';
import { baseAmount } from '../../lib/financialMath';
import { ListPageTemplate } from '../../components/templates/ListPageTemplate';
import { KpiRow } from '../../components/templates/KpiRow';
import { ExpenseFormModal } from '../../components/financial/ExpenseFormModal';
import { ExpenseDetailModal } from '../../components/financial/ExpenseDetailModal';
import { ExpensePaymentModal, type ExpensePaymentTarget } from '../../components/financial/ExpensePaymentModal';
import { useCurrency } from '../../hooks/useCurrency';
import {
  createExpense,
  updateExpense,
  approveExpense,
  rejectExpense,
  recordExpenseDisbursement,
  archiveExpense,
  getExpenseStats,
  fetchExpenseById,
  uploadExpenseAttachment,
  deleteExpenseAttachment,
  EXPENSE_LIST_COLUMNS,
  Expense,
  ExpenseAttachment,
} from '../../lib/expensesService';
import { useAuth } from '../../contexts/AuthContext';
import { canManageExpenses } from '../../lib/roleGates';
import { EmptyState } from '../../components/shared/EmptyState';
import { ExportButton } from '../../components/shared/ExportButton';
import { BulkActionsBar, BulkActionButton } from '../../components/shared/BulkActionsBar';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { downloadCSV } from '../../lib/csvExport';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Skeleton } from '../../components/ui/Skeleton';
import { logger } from '../../lib/logger';
import type { Database } from '../../types/database.types';
import {
  Plus,
  Search,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  FileText,
  Filter,
  Check,
  X,
  AlertCircle,
  Edit,
  RefreshCw,
  Archive,
  Download,
} from 'lucide-react';

type ExpenseRow = Pick<
  Database['public']['Tables']['expenses']['Row'],
  | 'id'
  | 'expense_number'
  | 'expense_date'
  | 'amount'
  | 'amount_base'
  | 'currency'
  | 'description'
  | 'vendor'
  | 'status'
  | 'case_id'
  | 'category_id'
  | 'created_by'
  | 'approved_by'
  | 'approved_at'
  | 'notes'
  | 'rejection_reason'
  | 'updated_at'
> & {
  category: { id: string; name: string } | null;
  case: { case_no: string | null; title: string | null } | null;
};

const PAGE_SIZE = 50;

export const ExpensesList: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { formatCurrency } = useCurrency();
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selection = useBulkSelection();
  const canBulkArchive = profile?.role === 'owner' || profile?.role === 'admin';
  const [isArchiving, setIsArchiving] = useState(false);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [expenseToReject, setExpenseToReject] = useState<string | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [expenseToApprove, setExpenseToApprove] = useState<string | null>(null);
  const [expenseToPay, setExpenseToPay] = useState<ExpensePaymentTarget | null>(null);

  // Command-palette deep-link: /expenses?new=1 opens the create modal.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowExpenseModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm, statusFilter]);

  // Mirror the server has_role('accounts') set (owner/admin/manager/accounts) so the
  // Approve/Reject/Mark-as-Paid affordances match what RLS+service actually permit (EXP-012).
  // SoD (creator≠approver) is still enforced server-side in approveExpense.
  const canManage = canManageExpenses(profile?.role);

  const { data: expensesPage, isLoading, error, refetch } = useQuery({
    queryKey: ['expenses', searchTerm, statusFilter, page],
    queryFn: async () => {
      try {
        let query = supabase
          .from('expenses')
          .select(EXPENSE_LIST_COLUMNS, { count: 'exact' })
          .is('deleted_at', null)
          .order('expense_date', { ascending: false });

        if (searchTerm) {
          const s = sanitizeFilterValue(searchTerm);
          query = query.or(`expense_number.ilike.%${s}%,description.ilike.%${s}%,vendor.ilike.%${s}%`);
        }

        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter);
        }

        const { data, error, count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        return { rows: (data ?? []) as unknown as ExpenseRow[], total: count ?? 0 };
      } catch (err) {
        logger.error('Error loading expenses:', err);
        return { rows: [] as ExpenseRow[], total: 0 };
      }
    },
    placeholderData: keepPreviousData,
  });
  const expenses = expensesPage?.rows ?? [];
  const totalExpensesCount = expensesPage?.total ?? 0;

  const { data: stats } = useQuery({
    queryKey: ['expense_stats'],
    queryFn: () => getExpenseStats(),
  });

  const { data: expenseDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['expense_detail', selectedExpenseId],
    queryFn: () => fetchExpenseById(selectedExpenseId as string),
    enabled: !!selectedExpenseId,
  });

  const handleDownloadAttachment = async (attachment: ExpenseAttachment) => {
    const { data, error: signError } = await supabase.storage
      .from('expense-receipts')
      .createSignedUrl(attachment.file_url, 3600);
    if (signError || !data?.signedUrl) {
      toast.error('Could not open this attachment');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleUploadReceipt = async (file: File) => {
    if (!selectedExpenseId) return;
    setIsUploadingReceipt(true);
    try {
      await uploadExpenseAttachment(selectedExpenseId, file);
      await queryClient.invalidateQueries({ queryKey: ['expense_detail', selectedExpenseId] });
      toast.success('Receipt uploaded');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to upload receipt');
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleDeleteAttachment = async (attachment: ExpenseAttachment) => {
    try {
      await deleteExpenseAttachment(attachment.id);
      await queryClient.invalidateQueries({ queryKey: ['expense_detail', selectedExpenseId] });
      toast.success('Receipt removed');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to remove receipt');
    }
  };

  const createExpenseMutation = useMutation({
    mutationFn: (expense: Omit<Expense, 'id' | 'expense_number' | 'created_at' | 'updated_at'>) =>
      createExpense({ ...expense, created_by: profile?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense_stats'] });
      setShowExpenseModal(false);
      setEditingExpense(null);
    },
    onError: (e) => toast.error((e as Error).message || 'Failed to save expense'),
  });

  const updateExpenseMutation = useMutation({
    mutationFn: ({ id, expense, expectedUpdatedAt }: { id: string; expense: Partial<Expense>; expectedUpdatedAt?: string }) =>
      updateExpense(id, expense, expectedUpdatedAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense_stats'] });
      setShowExpenseModal(false);
      setEditingExpense(null);
    },
    onError: (e) => toast.error((e as Error).message || 'Failed to save expense'),
  });

  const approveExpenseMutation = useMutation({
    mutationFn: (expenseId: string) => approveExpense(expenseId, profile?.id || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense_stats'] });
      setShowApproveModal(false);
      setExpenseToApprove(null);
    },
    onError: (e) => toast.error((e as Error).message || 'Failed to approve expense'),
  });

  const rejectExpenseMutation = useMutation({
    mutationFn: ({ expenseId, reason }: { expenseId: string; reason: string }) =>
      rejectExpense(expenseId, profile?.id || '', reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense_stats'] });
      setShowRejectModal(false);
      setExpenseToReject(null);
      setRejectionReason('');
    },
    onError: (e) => toast.error((e as Error).message || 'Failed to reject expense'),
  });

  const recordDisbursementMutation = useMutation({
    mutationFn: ({
      expenseId,
      bankAccountId,
      paidAt,
      reference,
    }: {
      expenseId: string;
      bankAccountId: string;
      paidAt: string;
      reference?: string;
    }) => recordExpenseDisbursement(expenseId, bankAccountId, paidAt, reference),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense_stats'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      setExpenseToPay(null);
      toast.success('Expense paid and disbursement recorded');
    },
    onError: (e) => toast.error((e as Error).message || 'Failed to record payment'),
  });

  const handlePay = (expense: ExpenseRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpenseToPay({
      id: expense.id,
      amount: expense.amount ?? 0,
      currency: expense.currency,
      expense_number: expense.expense_number,
    });
  };

  const handleApprove = (expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpenseToApprove(expenseId);
    setShowApproveModal(true);
  };

  const handleApproveConfirm = async () => {
    if (!expenseToApprove) return;
    await approveExpenseMutation.mutateAsync(expenseToApprove);
  };

  const handleEdit = (expense: { id: string }, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingExpense(expense);
    setShowExpenseModal(true);
  };

  const handleRejectClick = (expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpenseToReject(expenseId);
    setShowRejectModal(true);
  };

  const handleRejectConfirm = async () => {
    if (!expenseToReject || !rejectionReason.trim()) return;
    await rejectExpenseMutation.mutateAsync({
      expenseId: expenseToReject,
      reason: rejectionReason,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
      case 'paid':
        return <CheckCircle2 className="w-3 h-3" />;
      case 'rejected':
        return <XCircle className="w-3 h-3" />;
      case 'pending':
        return <Clock className="w-3 h-3" />;
      case 'draft':
        return <AlertCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const visibleIds = expenses.map((e) => e.id);

  const handleBulkExport = async () => {
    if (selection.selectedCount === 0) return;
    const ids = Array.from(selection.selectedIds);
    const { data, error } = await supabase
      .from('expenses')
      .select('expense_number, expense_date, vendor, description, amount, tax_amount, currency, status, is_billable, master_expense_categories:category_id(name)')
      .in('id', ids);
    if (error) {
      toast.error('Failed to export selected expenses');
      return;
    }
    downloadCSV(
      data ?? [],
      [
        { key: 'expense_number', label: 'Expense #' },
        { key: 'expense_date', label: 'Date' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'description', label: 'Description' },
        {
          key: (r) => (r.master_expense_categories as { name?: string } | null)?.name,
          label: 'Category',
        },
        { key: 'amount', label: 'Amount' },
        { key: 'tax_amount', label: 'Tax' },
        { key: 'currency', label: 'Currency' },
        { key: 'status', label: 'Status' },
        { key: 'is_billable', label: 'Billable', format: (v) => (v ? 'yes' : 'no') },
      ],
      'expenses-selected',
    );
    toast.success(`Exported ${data?.length ?? 0} expense${data?.length === 1 ? '' : 's'}`);
  };

  const handleBulkArchive = async () => {
    if (selection.selectedCount === 0) return;
    if (!canBulkArchive) {
      toast.error('Only admins can bulk archive expenses');
      return;
    }
    const n = selection.selectedCount;
    const ok = await confirm({
      title: `Archive ${n} expense${n === 1 ? '' : 's'}?`,
      message: `They'll be hidden from lists but recoverable.`,
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }
    setIsArchiving(true);
    try {
      // Route through archive_expense so each row reverses its GL accrual + retires VAT
      // (the old raw bulk .update({deleted_at}) orphaned the ledger). Per-row so one
      // failure (e.g. a paid expense, which the RPC blocks) doesn't sink the whole batch.
      const ids = Array.from(selection.selectedIds);
      const failures: string[] = [];
      for (const id of ids) {
        try {
          await archiveExpense(id);
        } catch (err) {
          failures.push((err as Error).message || id);
        }
      }
      const archived = ids.length - failures.length;
      if (archived > 0) toast.success(`Archived ${archived} expense${archived === 1 ? '' : 's'}`);
      if (failures.length > 0) toast.error(`${failures.length} could not be archived: ${failures[0]}`);
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense_stats'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
    } catch (err) {
      toast.error((err as Error).message || 'Failed to archive expenses');
    } finally {
      setIsArchiving(false);
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

  if (error) {
    return (
      <div className="p-8 max-w-[1800px] mx-auto">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Unable to Load Expenses</h3>
          <p className="text-slate-600 mb-4">
            There was an error loading expense data. Please try again or contact support if the problem persists.
          </p>
          <Button onClick={() => refetch()} variant="secondary">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ListPageTemplate
      title="Expenses"
      headerActions={
        <>
          <ExportButton
            filename="expenses"
            columns={[
              { key: 'expense_number', label: 'Expense #' },
              { key: 'expense_date', label: 'Date' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'description', label: 'Description' },
              {
                key: (r) => (r.master_expense_categories as { name?: string } | null)?.name,
                label: 'Category',
              },
              { key: 'amount', label: 'Amount' },
              { key: 'tax_amount', label: 'Tax' },
              { key: 'currency', label: 'Currency' },
              { key: 'status', label: 'Status' },
              { key: 'is_billable', label: 'Billable', format: (v) => (v ? 'yes' : 'no') },
            ]}
            getRows={async () => {
              let q = supabase
                .from('expenses')
                .select('expense_number, expense_date, vendor, description, amount, tax_amount, currency, status, is_billable, master_expense_categories:category_id(name)')
                .is('deleted_at', null);
              if (searchTerm) {
                const s = sanitizeFilterValue(searchTerm);
                q = q.or(`expense_number.ilike.%${s}%,vendor.ilike.%${s}%,description.ilike.%${s}%`);
              }
              if (statusFilter !== 'all') q = q.eq('status', statusFilter);
              const { data, error } = await q.order('expense_date', { ascending: false, nullsFirst: false });
              if (error) throw error;
              return data ?? [];
            }}
          />
          <Button
            size="sm"
            onClick={() => {
              setEditingExpense(null);
              setShowExpenseModal(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Submit Expense
          </Button>
        </>
      }
      kpis={
        <KpiRow
          stats={[
            {
              tone: 'success',
              label: 'Total Approved',
              value: formatCurrency(stats?.totalAmount ?? 0),
            },
            {
              tone: 'warning',
              label: 'Pending Amount',
              value: formatCurrency(stats?.pendingAmount || 0),
            },
            {
              tone: 'info',
              label: 'This Month',
              value: formatCurrency(stats?.thisMonthAmount || 0),
            },
            {
              tone: 'cat-5',
              label: 'Pending Count',
              value: stats?.pending ?? 0,
            },
          ]}
        />
      }
      toolbar={
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6">
          <div className="p-6">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
              <div className="w-full lg:w-80 relative flex-shrink-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search expenses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div className="flex-1 flex flex-wrap items-center gap-2">
                {['all', 'draft', 'pending', 'approved', 'rejected', 'paid'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      statusFilter === status
                        ? status === 'pending'
                          ? 'bg-warning text-warning-foreground shadow-md'
                          : status === 'approved'
                          ? 'bg-success text-success-foreground shadow-md'
                          : status === 'rejected'
                          ? 'bg-danger text-danger-foreground shadow-md'
                          : status === 'paid'
                          ? 'bg-info text-info-foreground shadow-md'
                          : 'bg-slate-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>

              <Button
                variant="secondary"
                onClick={() => refetch()}
                className="flex items-center gap-2 flex-shrink-0"
              >
                <Filter className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      }
      loading={isLoading}
      loadingFallback={loadingFallback}
      isEmpty={expenses.length === 0}
      empty={
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <EmptyState
            icon={Wallet}
            title="No expenses found"
            description={
              searchTerm || statusFilter !== 'all'
                ? 'No expenses found matching your criteria.'
                : 'No expenses yet. Submit your first expense to get started.'
            }
            action={{ label: 'Submit Expense', onClick: () => { setEditingExpense(null); setShowExpenseModal(true); } }}
          />
        </div>
      }
      pager={{ page, pageSize: PAGE_SIZE, total: totalExpensesCount, onPageChange: setPage, itemNoun: 'expenses' }}
      table={
        <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-4 w-10">
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
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Expense #</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {expenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      selection.isSelected(expense.id) ? 'bg-info-muted/30' : ''
                    }`}
                  >
                    <td className="px-4 py-4 w-10">
                      <input
                        type="checkbox"
                        checked={selection.isSelected(expense.id)}
                        onChange={() => selection.toggle(expense.id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        aria-label={`Select expense ${expense.expense_number ?? expense.id}`}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-primary">{expense.expense_number ?? '-'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {expense.expense_date ? formatDate(expense.expense_date) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-900 truncate max-w-xs">
                        {expense.description ?? '-'}
                      </p>
                      {expense.case && (
                        <p className="text-xs text-slate-500">
                          <span className="text-primary">
                            Case: {expense.case.case_no ?? '-'}
                          </span>
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="secondary" size="sm">
                        {expense.category?.name || 'N/A'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {expense.vendor || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm font-bold text-slate-900">
                        {formatCurrency(baseAmount(expense, 'amount'))}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge
                        variant={statusToBadgeVariant(expense.status ?? '')}
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        {getStatusIcon(expense.status ?? '')}
                        {expense.status ?? '-'}
                      </Badge>
                      {expense.status === 'rejected' && expense.rejection_reason && (
                        <p className="text-xs text-danger mt-1 max-w-[150px] truncate" title={expense.rejection_reason}>
                          {expense.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {expense.status === 'pending' && canManage && (
                          <>
                            <button
                              onClick={(e) => handleApprove(expense.id, e)}
                              className="p-1.5 text-success hover:bg-success-muted rounded transition-colors"
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleRejectClick(expense.id, e)}
                              className="p-1.5 text-danger hover:bg-danger-muted rounded transition-colors"
                              title="Reject"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {expense.status === 'approved' && canManage && (
                          <button
                            onClick={(e) => handlePay(expense, e)}
                            className="p-1.5 text-success hover:bg-success-muted rounded transition-colors"
                            title="Mark as Paid"
                          >
                            <Wallet className="w-4 h-4" />
                          </button>
                        )}
                        {(expense.status === 'draft' || expense.status === 'pending' || expense.status === 'rejected') && (
                          <button
                            onClick={(e) => handleEdit(expense, e)}
                            className="p-1.5 text-warning hover:bg-warning-muted rounded transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedExpenseId(expense.id)}
                          className="p-1.5 text-primary hover:bg-info-muted rounded transition-colors"
                          title="View"
                          aria-label={`View expense ${expense.expense_number ?? ''}`.trim()}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSelectedExpenseId(expense.id)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                          title="Attachments"
                          aria-label={`View attachments for expense ${expense.expense_number ?? ''}`.trim()}
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      }
      footer={
        <BulkActionsBar
          count={selection.selectedCount}
          onClear={selection.clear}
          itemNoun="expense"
        >
          <BulkActionButton
            variant="ghost"
            icon={<Download className="w-4 h-4" />}
            label="Export"
            onClick={handleBulkExport}
          />
          {canBulkArchive && (
            <BulkActionButton
              variant="danger"
              icon={<Archive className="w-4 h-4" />}
              label={isArchiving ? 'Archiving…' : 'Archive'}
              onClick={handleBulkArchive}
              disabled={isArchiving}
            />
          )}
        </BulkActionsBar>
      }
    >
      <ExpenseFormModal
        isOpen={showExpenseModal}
        onClose={() => {
          setShowExpenseModal(false);
          setEditingExpense(null);
        }}
        initialData={editingExpense}
        onSave={async (expense) => {
          if (editingExpense) {
            await updateExpenseMutation.mutateAsync({
              id: editingExpense.id,
              expense,
              expectedUpdatedAt: editingExpense.updated_at,
            });
          } else {
            await createExpenseMutation.mutateAsync(expense);
          }
        }}
      />

      <Modal
        isOpen={showApproveModal}
        onClose={() => {
          setShowApproveModal(false);
          setExpenseToApprove(null);
        }}
        title="Approve Expense"
        size="xs"
      >
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6 text-success" />
          </div>
          <p className="text-base font-medium text-slate-900 mb-4">
            Approve this expense?
          </p>
          <div className="flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowApproveModal(false);
                setExpenseToApprove(null);
              }}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApproveConfirm}
              disabled={approveExpenseMutation.isPending}
              variant="primary"
              size="sm"
            >
              {approveExpenseMutation.isPending ? 'Approving...' : 'Approve'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setExpenseToReject(null);
          setRejectionReason('');
        }}
        title="Reject Expense"
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Provide a reason for rejection:
          </p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-danger focus:border-danger text-sm"
            placeholder="Enter rejection reason..."
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowRejectModal(false);
                setExpenseToReject(null);
                setRejectionReason('');
              }}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectConfirm}
              disabled={!rejectionReason.trim() || rejectExpenseMutation.isPending}
              variant="danger"
              size="sm"
            >
              {rejectExpenseMutation.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
          </div>
        </div>
      </Modal>

      <ExpensePaymentModal
        isOpen={!!expenseToPay}
        onClose={() => setExpenseToPay(null)}
        expense={expenseToPay}
        isSubmitting={recordDisbursementMutation.isPending}
        onConfirm={async ({ bankAccountId, paidAt, reference }) => {
          if (!expenseToPay) return;
          await recordDisbursementMutation.mutateAsync({
            expenseId: expenseToPay.id,
            bankAccountId,
            paidAt,
            reference,
          });
        }}
      />

      <ExpenseDetailModal
        isOpen={!!selectedExpenseId}
        onClose={() => setSelectedExpenseId(null)}
        expense={expenseDetail ?? null}
        isLoading={detailLoading}
        onDownloadAttachment={handleDownloadAttachment}
        onUploadAttachment={handleUploadReceipt}
        onDeleteAttachment={handleDeleteAttachment}
        isUploading={isUploadingReceipt}
      />
    </ListPageTemplate>
  );
};
