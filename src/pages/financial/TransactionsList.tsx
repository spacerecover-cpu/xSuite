import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDate } from '../../lib/format';
import { useCurrency } from '../../hooks/useCurrency';
import { useConfirm } from '../../hooks/useConfirm';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { baseAmount } from '../../lib/financialMath';
import { FinancialModuleHeader } from '../../components/financial/FinancialModuleHeader';
import { FinancialStatsCard } from '../../components/financial/FinancialStatsCard';
import { TransactionFormModal } from '../../components/financial/TransactionFormModal';
import {
  createTransaction,
  fetchTransactions,
  reconcileTransaction,
  voidTransaction,
  getTransactionStats,
  Transaction,
} from '../../lib/transactionsService';
import {
  Plus,
  Search,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Eye,
  Calendar,
  DollarSign,
  FileText,
  Filter,
  CheckCircle,
  XCircle,
} from 'lucide-react';

// NOTE: financial_transactions does not have status/reference_number columns or
// related_invoice/related_payment/related_expense joins in v1.0.0.
// `type` is mapped from `transaction_type`. Status defaults to 'completed' (B6 deferred).
interface TransactionDisplay {
  id: string;
  transaction_date: string;
  amount: number;
  amount_base?: number | null;
  type: 'income' | 'expense' | 'asset' | 'equity';
  description: string;
  reference_number: string | null;
  status: string;
  category?: { name: string };
  bank_account?: { account_name: string };
  related_invoice?: { invoice_number: string };
  related_payment?: { payment_number: string };
  related_expense?: { expense_number: string };
}

export const TransactionsList: React.FC = () => {
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const confirm = useConfirm();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  const getDateFromFilter = () => {
    if (dateRange === 'all') return undefined;
    const now = new Date();
    let startDate: Date;
    switch (dateRange) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'quarter':
        startDate = new Date(now.setMonth(now.getMonth() - 3));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        return undefined;
    }
    return startDate.toISOString().split('T')[0];
  };

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['financial_transactions', searchTerm, typeFilter, dateRange],
    queryFn: async () => {
      const data = await fetchTransactions({
        type: typeFilter !== 'all' ? typeFilter : undefined,
        search: searchTerm || undefined,
        dateFrom: getDateFromFilter(),
      });
      // Adapt live schema (transaction_type, no status/reference_number) to display shape.
      return (data || []).map((row): TransactionDisplay => ({
        id: row.id ?? '',
        transaction_date: row.transaction_date ?? '',
        amount: row.amount,
        amount_base: row.amount_base,
        type: (row.transaction_type as TransactionDisplay['type']) ?? 'expense',
        description: row.description ?? '',
        reference_number: null,
        status: 'completed',
        category: row.category ? { name: row.category.name } : undefined,
        bank_account: row.bank_account ? { account_name: row.bank_account.name } : undefined,
      }));
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['transaction_stats'],
    queryFn: () => getTransactionStats(),
  });

  const createTransactionMutation = useMutation({
    mutationFn: (transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>) =>
      createTransaction(transaction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction_stats'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      setShowTransactionModal(false);
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: (id: string) => reconcileTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction_stats'] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction_stats'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
    },
  });

  const handleReconcile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (await confirm({
      title: 'Reconcile transaction?',
      message: 'Mark this transaction as reconciled?',
      tone: 'default',
    })) {
      await reconcileMutation.mutateAsync(id);
    }
  };

  const handleVoid = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (await confirm({
      title: 'Void transaction?',
      message: 'Void this transaction? This posts a reversing entry that unwinds any bank balance change — the original is preserved in the ledger for audit.',
      tone: 'danger',
    })) {
      await voidMutation.mutateAsync(id);
    }
  };

  const incomeTransactions = transactions.filter(t => t.type === 'income');
  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + baseAmount(t as unknown as Record<string, unknown>, 'amount'), 0);
  const totalExpense = expenseTransactions.reduce((sum, t) => sum + baseAmount(t as unknown as Record<string, unknown>, 'amount'), 0);
  const netCashFlow = totalIncome - totalExpense;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'income':
        return '#10b981';
      case 'expense':
        return '#ef4444';
      case 'asset':
        return '#3b82f6';
      case 'equity':
        return 'rgb(var(--color-accent))';
      default:
        return '#64748b';
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1800px] mx-auto space-y-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
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
  }

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <FinancialModuleHeader
        icon={<ArrowLeftRight className="w-7 h-7 text-white" />}
        title="Transactions"
        description="Track all financial movements"
        iconBgColor="#3b82f6"
        statistics={[
          { label: 'Total Transactions', value: transactions.length, color: '#3b82f6' },
          { label: 'Income', value: incomeTransactions.length, color: '#10b981' },
          { label: 'Expenses', value: expenseTransactions.length, color: '#ef4444' },
        ]}
        primaryAction={{
          label: 'New Transaction',
          onClick: () => setShowTransactionModal(true),
          icon: <Plus className="w-4 h-4" />,
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <FinancialStatsCard
          label="Total Income"
          value={formatCurrency(stats?.totalIncome || totalIncome)}
          icon={<TrendingUp className="w-5 h-5 text-white" />}
          color="green"
        />
        <FinancialStatsCard
          label="Total Expenses"
          value={formatCurrency(stats?.totalExpenses || totalExpense)}
          icon={<TrendingDown className="w-5 h-5 text-white" />}
          color="red"
        />
        <FinancialStatsCard
          label="Net Cash Flow"
          value={formatCurrency(stats?.netCashFlow || netCashFlow)}
          icon={<DollarSign className="w-5 h-5 text-white" />}
          color={(stats?.netCashFlow || netCashFlow) >= 0 ? 'green' : 'red'}
        />
        <FinancialStatsCard
          label="Reconciled"
          value={stats?.reconciled || 0}
          icon={<CheckCircle className="w-5 h-5 text-white" />}
          color="blue"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="w-full lg:w-80 relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex-1 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTypeFilter(typeFilter === 'income' ? 'all' : 'income')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  typeFilter === 'income'
                    ? 'bg-success text-success-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Income
              </button>
              <button
                onClick={() => setTypeFilter(typeFilter === 'expense' ? 'all' : 'expense')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  typeFilter === 'expense'
                    ? 'bg-danger text-danger-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Expense
              </button>
              <button
                onClick={() => setTypeFilter(typeFilter === 'asset' ? 'all' : 'asset')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  typeFilter === 'asset'
                    ? 'bg-info text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Asset
              </button>
              {(typeFilter !== 'all' || dateRange !== 'all') && (
                <button
                  onClick={() => {
                    setTypeFilter('all');
                    setDateRange('all');
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
              {(typeFilter !== 'all' || dateRange !== 'all') && (
                <span className="ml-1 w-2 h-2 rounded-full bg-primary"></span>
              )}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="asset">Asset</option>
                  <option value="equity">Equity</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Date Range</label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="quarter">This Quarter</option>
                  <option value="year">This Year</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <ArrowLeftRight className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-lg mb-4">
            {searchTerm || typeFilter !== 'all' || dateRange !== 'all'
              ? 'No transactions found matching your criteria.'
              : 'No transactions yet. Create your first transaction to get started.'}
          </p>
          <Button
            onClick={() => setShowTransactionModal(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Transaction
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Bank Account</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Reference</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {formatDate(transaction.transaction_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge
                        variant="custom"
                        color={getTypeColor(transaction.type)}
                        size="sm"
                      >
                        {transaction.type}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-medium text-slate-900">{transaction.description}</p>
                      {(transaction.related_invoice || transaction.related_payment || transaction.related_expense) && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <FileText className="w-3 h-3" />
                          {transaction.related_invoice?.invoice_number ||
                            transaction.related_payment?.payment_number ||
                            transaction.related_expense?.expense_number}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {transaction.category ? (
                        <Badge variant="secondary" size="sm">
                          {transaction.category.name}
                        </Badge>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {transaction.bank_account?.account_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {transaction.reference_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span
                        className={`text-sm font-bold ${
                          transaction.type === 'income' ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {transaction.type === 'income' ? '+' : '-'}
                        {formatCurrency(transaction.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge
                        variant={statusToBadgeVariant(transaction.status)}
                        size="sm"
                      >
                        {transaction.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {transaction.status === 'completed' && (
                          <button
                            onClick={(e) => handleReconcile(transaction.id, e)}
                            className="p-1.5 text-success hover:bg-success-muted rounded transition-colors"
                            title="Mark as Reconciled"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {(transaction.status === 'completed' || transaction.status === 'pending') && (
                          <button
                            onClick={(e) => handleVoid(transaction.id, e)}
                            className="p-1.5 text-danger hover:bg-danger-muted rounded transition-colors"
                            title="Void Transaction"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          className="p-1.5 text-primary hover:bg-info-muted rounded transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TransactionFormModal
        isOpen={showTransactionModal}
        onClose={() => setShowTransactionModal(false)}
        onSave={async (transaction) => {
          await createTransactionMutation.mutateAsync(transaction);
        }}
      />
    </div>
  );
};
