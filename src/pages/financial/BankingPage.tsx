import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankingService, BankAccount, PaymentReceipt, AccountTransfer } from '../../lib/bankingService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAccountingLocale } from '../../hooks/useAccountingLocale';
import { useToast } from '../../hooks/useToast';
import { AccountFormModal } from '../../components/banking/AccountFormModal';
import { RecordReceiptModal } from '../../components/banking/RecordReceiptModal';
import { TransferFundsModal } from '../../components/banking/TransferFundsModal';
import {
  Plus,
  Landmark,
  Building,
  Wallet,
  Smartphone,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowLeftRight,
  Receipt,
  DollarSign,
  CheckCircle2,
  Clock,
  Search,
  Edit,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

export const BankingPage: React.FC = () => {
  const { formatCurrencyValue, locale, getCurrencySymbol, getCurrencyCode } = useAccountingLocale();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'accounts' | 'receipts' | 'transfers'>('accounts');

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<BankAccount | null>(null);

  const { data: accounts = [], isLoading: accountsLoading, refetch: refetchAccounts } = useQuery({
    queryKey: ['bank_accounts', accountFilter],
    queryFn: async () => {
      const filters: Record<string, string> = {};
      if (accountFilter !== 'all') {
        filters.account_type = accountFilter;
      }
      return bankingService.getAccounts(filters);
    },
  });

  const { data: balanceSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['balance_summary'],
    queryFn: () => bankingService.getAccountBalanceSummary(),
  });

  const { data: receipts = [] } = useQuery({
    queryKey: ['payment_receipts', selectedAccount],
    queryFn: async () => {
      const filters: Record<string, string> = {};
      if (selectedAccount) {
        filters.account_id = selectedAccount;
      }
      return bankingService.getReceipts(filters);
    },
    enabled: activeTab === 'receipts',
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ['account_transfers', selectedAccount],
    queryFn: async () => {
      const filters: Record<string, string> = {};
      if (selectedAccount) {
        filters.account_id = selectedAccount;
      }
      return bankingService.getTransfers(filters);
    },
    enabled: activeTab === 'transfers',
  });

  const { data: bankTransactions = [] } = useQuery({
    queryKey: ['bank_transactions', selectedAccount],
    queryFn: async () => {
      if (!selectedAccount) return [];
      return bankingService.getBankTransactions({ account_id: selectedAccount });
    },
    enabled: !!selectedAccount,
  });

  const createAccountMutation = useMutation({
    mutationFn: (data: Partial<BankAccount>) => bankingService.createAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['balance_summary'] });
      setShowAccountModal(false);
      setEditingAccount(null);
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BankAccount> }) =>
      bankingService.updateAccount(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['balance_summary'] });
      setShowAccountModal(false);
      setEditingAccount(null);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (id: string) => bankingService.deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['balance_summary'] });
      toast.success('Account deleted successfully');
    },
  });

  const createReceiptMutation = useMutation({
    mutationFn: ({ receiptData, allocations }: { receiptData: Partial<PaymentReceipt>; allocations?: Array<{ invoice_id: string; allocated_amount: number }> }) => {
      if (allocations && allocations.length > 0) {
        return bankingService.createReceiptWithAllocations(receiptData, allocations);
      }
      return bankingService.createReceipt(receiptData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_receipts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['balance_summary'] });
      queryClient.invalidateQueries({ queryKey: ['invoices_by_case'] });
      queryClient.invalidateQueries({ queryKey: ['cases_with_invoices'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      setShowReceiptModal(false);
    },
  });

  const createTransferMutation = useMutation({
    mutationFn: (data: Partial<AccountTransfer>) => bankingService.createTransfer({ ...data, status: 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account_transfers'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['balance_summary'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      setShowTransferModal(false);
    },
  });

  const handleSaveAccount = async (data: Partial<BankAccount>) => {
    if (editingAccount) {
      await updateAccountMutation.mutateAsync({ id: editingAccount.id, data });
    } else {
      await createAccountMutation.mutateAsync(data);
    }
  };

  const handleDeleteAccount = (account: BankAccount) => {
    setDeletingAccount(account);
  };

  const confirmDeleteAccount = async () => {
    if (!deletingAccount) return;
    await deleteAccountMutation.mutateAsync(deletingAccount.id);
    setDeletingAccount(null);
  };

  const activeAccounts = accounts.filter(acc => acc.is_active);
  const bankAccounts = activeAccounts.filter(a => a.account_type === 'bank');
  const cashAccounts = activeAccounts.filter(a => a.account_type === 'cash');
  const mobileAccounts = activeAccounts.filter(a => a.account_type === 'mobile');

  const selectedAccountData = accounts.find(acc => acc.id === selectedAccount);

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case 'bank':
        return <Building className="w-5 h-5 text-primary" />;
      case 'cash':
        return <Wallet className="w-5 h-5 text-success" />;
      case 'mobile':
        return <Smartphone className="w-5 h-5 text-orange-600" />;
      default:
        return <Landmark className="w-5 h-5 text-slate-600" />;
    }
  };

  const getBalanceColor = (balance: number) => {
    if (balance < 0) return 'text-danger';
    if (balance < 1000) return 'text-orange-600';
    return 'text-slate-900';
  };

  if (accountsLoading || summaryLoading) {
    return (
      <div className="p-8 max-w-[1800px] mx-auto">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
          <p className="text-slate-500 mt-4">Loading banking data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-start gap-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              backgroundColor: '#10b981',
              boxShadow: '0 10px 40px -10px #10b98180',
            }}
          >
            <Landmark className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Banking & Cash Management</h1>
            <p className="text-slate-600 text-base">
              Manage accounts, track payments, and reconcile transactions
              {locale && (
                <span className="ml-2 text-sm text-slate-500">
                  • Currency: {getCurrencyCode()} ({getCurrencySymbol()})
                </span>
              )}
            </p>
            <div className="flex gap-4 mt-3">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-primary"></div>
                <span className="text-slate-600">
                  {formatCurrencyValue(balanceSummary?.totalBankBalance || 0)} Bank
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-success"></div>
                <span className="text-slate-600">
                  {formatCurrencyValue(balanceSummary?.totalCashBalance || 0)} Cash
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <span className="text-slate-600">
                  {formatCurrencyValue(balanceSummary?.totalMobileBalance || 0)} Mobile
                </span>
              </div>
              {balanceSummary && balanceSummary.pendingReconciliations > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-danger"></div>
                  <span className="text-slate-600">
                    {balanceSummary.pendingReconciliations} Pending Reconciliations
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => refetchAccounts()}
            variant="secondary"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => setShowTransferModal(true)}
            variant="secondary"
          >
            <ArrowLeftRight className="w-4 h-4 mr-2" />
            Transfer
          </Button>
          <Button
            onClick={() => setShowReceiptModal(true)}
            variant="secondary"
          >
            <Receipt className="w-4 h-4 mr-2" />
            Record Receipt
          </Button>
          <Button
            onClick={() => {
              setEditingAccount(null);
              setShowAccountModal(true);
            }}
            style={{ backgroundColor: '#10b981' }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-info-muted to-info-muted rounded-xl p-4 border border-info/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-info uppercase tracking-wide">Bank Balance</p>
              <p className="text-2xl font-bold text-info mt-1">
                {formatCurrencyValue(balanceSummary?.totalBankBalance || 0)}
              </p>
              <p className="text-xs text-info mt-1">{bankAccounts.length} accounts</p>
            </div>
            <div className="w-10 h-10 bg-info rounded-lg flex items-center justify-center">
              <Building className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-success-muted to-success-muted rounded-xl p-4 border border-success/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-success uppercase tracking-wide">Cash on Hand</p>
              <p className="text-2xl font-bold text-success mt-1">
                {formatCurrencyValue(balanceSummary?.totalCashBalance || 0)}
              </p>
              <p className="text-xs text-success mt-1">{cashAccounts.length} accounts</p>
            </div>
            <div className="w-10 h-10 bg-success rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">Mobile Balance</p>
              <p className="text-2xl font-bold text-orange-900 mt-1">
                {formatCurrencyValue(balanceSummary?.totalMobileBalance || 0)}
              </p>
              <p className="text-xs text-orange-700 mt-1">{mobileAccounts.length} accounts</p>
            </div>
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Total Balance</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {formatCurrencyValue(
                  (balanceSummary?.totalBankBalance || 0) +
                  (balanceSummary?.totalCashBalance || 0) +
                  (balanceSummary?.totalMobileBalance || 0)
                )}
              </p>
              <p className="text-xs text-slate-700 mt-1">{activeAccounts.length} total accounts</p>
            </div>
            <div className="w-10 h-10 bg-slate-500 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 bg-white rounded-2xl shadow-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            {['all', 'bank', 'cash', 'mobile'].map((type) => (
              <button
                key={type}
                onClick={() => setAccountFilter(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  accountFilter === type
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {type === 'all' ? 'All Accounts' : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Accounts</h2>
              <Badge variant="secondary" size="sm">
                {accounts.length}
              </Badge>
            </div>
            <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
              {accounts.length === 0 ? (
                <div className="p-6 text-center">
                  <Landmark className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No accounts found</p>
                  <Button
                    className="mt-4"
                    size="sm"
                    onClick={() => setShowAccountModal(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Account
                  </Button>
                </div>
              ) : (
                accounts
                  .filter(account =>
                    account.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (account.account_number && account.account_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (account.mobile_number && account.mobile_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (account.location && account.location.toLowerCase().includes(searchTerm.toLowerCase()))
                  )
                  .map((account) => {
                    const balanceChange = account.current_balance - account.opening_balance;
                    const isPositiveChange = balanceChange > 0;
                    const hasChange = Math.abs(balanceChange) > 0.01;

                    const getAccountTypeColor = (type: string) => {
                      switch (type) {
                        case 'bank': return { bg: 'from-info-muted/50 to-info-muted/30', border: 'border-info/30', accent: 'bg-info' };
                        case 'cash': return { bg: 'from-success-muted/50 to-success-muted/30', border: 'border-success/30', accent: 'bg-success' };
                        case 'mobile': return { bg: 'from-orange-50/50 to-orange-100/30', border: 'border-orange-200', accent: 'bg-orange-500' };
                        default: return { bg: 'from-slate-50/50 to-slate-100/30', border: 'border-slate-200', accent: 'bg-slate-500' };
                      }
                    };

                    const typeColor = getAccountTypeColor(account.account_type);

                    return (
                      <div
                        key={account.id}
                        className={`group relative cursor-pointer transition-all duration-200 ${
                          selectedAccount === account.id
                            ? 'bg-info-muted/70 shadow-sm'
                            : 'hover:bg-slate-50/70 hover:shadow-sm'
                        }`}
                        onClick={() => setSelectedAccount(account.id)}
                      >
                        {selectedAccount === account.id && (
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${typeColor.accent}`}></div>
                        )}

                        <div className={`p-3 bg-gradient-to-r ${typeColor.bg} border-l-2 ${typeColor.border} transition-all`}>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm ring-1 ${typeColor.border} flex-shrink-0`}>
                              {getAccountTypeIcon(account.account_type)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="text-sm font-bold text-slate-900 truncate">
                                  {account.account_name}
                                </h3>
                                {account.is_default && (
                                  <Badge variant="success" size="sm" className="text-xs py-0.5 px-1.5">Default</Badge>
                                )}
                                {!account.is_active && (
                                  <Badge variant="secondary" size="sm" className="text-xs py-0.5 px-1.5">Inactive</Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 font-medium truncate">
                                {account.account_type === 'bank' ? account.bank_name : account.account_type.charAt(0).toUpperCase() + account.account_type.slice(1)}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {account.account_type === 'mobile'
                                  ? account.mobile_number || 'No mobile number'
                                  : account.account_type === 'cash'
                                  ? account.location || 'Cash'
                                  : account.account_number || 'No account number'}
                              </p>
                            </div>

                            <div className="flex flex-col items-end justify-center gap-1 flex-shrink-0">
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    setEditingAccount(account);
                                    setShowAccountModal(true);
                                  }}
                                  className="p-1 text-slate-400 hover:text-primary hover:bg-info-muted rounded transition-colors"
                                  title="Edit Account"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteAccount(account)}
                                  className="p-1 text-slate-400 hover:text-danger hover:bg-danger-muted rounded transition-colors"
                                  title="Delete Account"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="text-right">
                                <p className={`text-base font-bold leading-none ${getBalanceColor(account.current_balance)}`}>
                                  {formatCurrencyValue(account.current_balance)}
                                </p>

                                {hasChange && (
                                  <div className={`flex items-center justify-end gap-1 text-xs font-semibold mt-0.5 ${
                                    isPositiveChange ? 'text-success' : 'text-danger'
                                  }`}>
                                    {isPositiveChange ? (
                                      <TrendingUp className="w-3 h-3" />
                                    ) : (
                                      <TrendingDown className="w-3 h-3" />
                                    )}
                                    <span>
                                      {formatCurrencyValue(Math.abs(balanceChange))}
                                    </span>
                                  </div>
                                )}

                                {account.current_balance < 0 && (
                                  <div className="flex items-center justify-end gap-1 text-danger mt-0.5">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span className="text-xs font-medium">Negative</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedAccount ? (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {selectedAccountData?.account_name}
                    </h2>
                    <p className="text-sm text-slate-600">
                      {selectedAccountData?.account_type === 'mobile'
                        ? `Mobile Number: ${selectedAccountData?.mobile_number || 'Not set'}`
                        : selectedAccountData?.account_type === 'cash'
                        ? `Location: ${selectedAccountData?.location || 'Not set'}`
                        : `Account Number: ${selectedAccountData?.account_number || 'Not set'}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600">Current Balance</p>
                    <p className={`text-2xl font-bold ${getBalanceColor(selectedAccountData?.current_balance || 0)}`}>
                      {formatCurrencyValue(selectedAccountData?.current_balance || 0)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {['accounts', 'receipts', 'transfers'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === tab
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto" style={{ maxHeight: '500px' }}>
                {activeTab === 'accounts' && (
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-4 text-xs font-semibold text-slate-700">Date</th>
                        <th className="text-left py-2 px-4 text-xs font-semibold text-slate-700">Description</th>
                        <th className="text-right py-2 px-4 text-xs font-semibold text-slate-700">Debit</th>
                        <th className="text-right py-2 px-4 text-xs font-semibold text-slate-700">Credit</th>
                        <th className="text-right py-2 px-4 text-xs font-semibold text-slate-700">Balance</th>
                        <th className="text-center py-2 px-4 text-xs font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {bankTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center">
                            <Landmark className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="text-slate-500 text-sm">No transactions found</p>
                          </td>
                        </tr>
                      ) : (
                        bankTransactions.map((transaction) => {
                          // bank_transactions has amount+type, not separate debit/credit columns.
                          const isDebit = transaction.type === 'debit' || transaction.type === 'expense' || transaction.type === 'withdrawal';
                          const isCredit = transaction.type === 'credit' || transaction.type === 'income' || transaction.type === 'deposit';
                          return (
                          <tr key={transaction.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2 px-4 text-xs text-slate-600">
                              {new Date(transaction.transaction_date).toLocaleDateString()}
                            </td>
                            <td className="py-2 px-4">
                              <p className="text-xs font-medium text-slate-900">{transaction.description ?? ''}</p>
                              {transaction.reference && (
                                <p className="text-xs text-slate-500">{transaction.reference}</p>
                              )}
                            </td>
                            <td className="py-2 px-4 text-right">
                              {isDebit && transaction.amount > 0 ? (
                                <span className="text-xs font-semibold text-danger flex items-center justify-end gap-1">
                                  <TrendingDown className="w-3 h-3" />
                                  {formatCurrencyValue(transaction.amount)}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-2 px-4 text-right">
                              {isCredit && transaction.amount > 0 ? (
                                <span className="text-xs font-semibold text-success flex items-center justify-end gap-1">
                                  <TrendingUp className="w-3 h-3" />
                                  {formatCurrencyValue(transaction.amount)}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-2 px-4 text-right text-xs font-semibold text-slate-900">
                              -
                            </td>
                            <td className="py-2 px-4 text-center">
                              {transaction.is_reconciled ? (
                                <CheckCircle2 className="w-4 h-4 text-success mx-auto" />
                              ) : (
                                <Clock className="w-4 h-4 text-orange-600 mx-auto" />
                              )}
                            </td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}

                {activeTab === 'receipts' && (
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-4">{receipts.length} receipts found</p>
                    <div className="space-y-2">
                      {receipts.map((receipt: PaymentReceipt) => (
                        <div
                          key={receipt.id}
                          className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-sm">{receipt.receipt_number}</p>
                              <p className="text-xs text-slate-600">{receipt.description}</p>
                              <p className="text-xs text-slate-500 mt-1">
                                {receipt.receipt_date ? new Date(receipt.receipt_date).toLocaleDateString() : 'N/A'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-success">
                                {formatCurrencyValue(receipt.amount)}
                              </p>
                              <Badge
                                variant="custom"
                                color={receipt.status === 'completed' ? '#10b981' : '#f59e0b'}
                                size="sm"
                              >
                                {receipt.status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'transfers' && (
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-4">{transfers.length} transfers found</p>
                    <div className="space-y-2">
                      {transfers.map((transfer: AccountTransfer & { from_account?: { account_name: string }; to_account?: { account_name: string } }) => (
                        <div
                          key={transfer.id}
                          className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-sm">{transfer.transfer_number}</p>
                              <p className="text-xs text-slate-600">
                                {transfer.from_account?.account_name} → {transfer.to_account?.account_name}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                {new Date(transfer.transfer_date).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-primary">
                                {formatCurrencyValue(transfer.amount)}
                              </p>
                              <Badge
                                variant="custom"
                                color={transfer.status === 'completed' ? '#10b981' : '#f59e0b'}
                                size="sm"
                              >
                                {transfer.status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12">
              <div className="text-center">
                <Landmark className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 mb-2">
                  Select an Account
                </h3>
                <p className="text-slate-500">
                  Choose an account from the left to view transactions and details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AccountFormModal
        isOpen={showAccountModal}
        onClose={() => {
          setShowAccountModal(false);
          setEditingAccount(null);
        }}
        onSave={handleSaveAccount}
        initialData={editingAccount}
      />

      <RecordReceiptModal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        onSave={async (receiptData, allocations) => {
          await createReceiptMutation.mutateAsync({ receiptData, allocations });
        }}
      />

      <TransferFundsModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onSave={async (data) => {
          await createTransferMutation.mutateAsync(data);
        }}
      />

      <ConfirmDialog
        isOpen={!!deletingAccount}
        onClose={() => setDeletingAccount(null)}
        onConfirm={confirmDeleteAccount}
        title="Delete Account"
        message={`Are you sure you want to delete the account "${deletingAccount?.account_name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
};
