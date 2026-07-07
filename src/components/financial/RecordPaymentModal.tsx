import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { supabase } from '../../lib/supabaseClient';
import {
  getPaymentMethods,
  getCasesWithUnpaidInvoices,
  getUnpaidInvoicesByCase,
} from '../../lib/paymentsService';
import { useCurrency } from '../../hooks/useCurrency';
import { useToast } from '../../hooks/useToast';
import {
  DollarSign,
  Calendar,
  CreditCard,
  FileText,
  Trash2,
  CheckCircle,
  Briefcase,
  User,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { logger } from '../../lib/logger';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    paymentData: {
      payment_date: string;
      amount: number;
      case_id?: string | null;
      customer_id?: string | null;
      payment_method_id?: string | null;
      bank_account_id?: string | null;
      reference?: string;
      status: 'pending' | 'completed';
      notes?: string;
    },
    allocations: Array<{ invoice_id: string; amount: number }>,
    withholding?: { amount: number; certificateRef: string } | null
  ) => Promise<void>;
  preselectedCaseId?: string;
  preselectedInvoiceId?: string;
}

interface InvoiceAllocation {
  invoice_id: string;
  invoice_number: string;
  total_amount: number;
  balance_due: number;
  allocation_amount: number;
  status: string;
}

interface CaseWithCustomer {
  id: string;
  case_no: string;
  title: string;
  customer?: {
    id: string;
    customer_name: string;
    email: string;
  };
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  preselectedCaseId,
  preselectedInvoiceId,
}) => {
  const { formatCurrency, currencyFormat } = useCurrency();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(preselectedCaseId || '');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);
  // Surface the method/account "required" errors only after a submit attempt, so
  // the form doesn't shout at the user before they've had a chance to fill it in.
  const [showErrors, setShowErrors] = useState(false);
  const [showWithholding, setShowWithholding] = useState(false);
  const [withheldAmount, setWithheldAmount] = useState<number>(0);
  const [certificateRef, setCertificateRef] = useState('');

  const { data: casesWithInvoices = [] } = useQuery({
    queryKey: ['cases_with_unpaid_invoices'],
    queryFn: getCasesWithUnpaidInvoices,
    enabled: isOpen,
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment_methods_active'],
    queryFn: getPaymentMethods,
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank_accounts_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name:name, bank_name, account_type')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: unpaidInvoices = [], refetch: refetchInvoices } = useQuery({
    queryKey: ['unpaid_invoices_by_case', selectedCaseId],
    queryFn: () => getUnpaidInvoicesByCase(selectedCaseId),
    enabled: !!selectedCaseId,
  });

  const selectedCase = casesWithInvoices.find(
    (c: CaseWithCustomer) => c.id === selectedCaseId
  ) as CaseWithCustomer | undefined;

  useEffect(() => {
    if (preselectedCaseId) {
      setSelectedCaseId(preselectedCaseId);
    }
  }, [preselectedCaseId]);

  useEffect(() => {
    if (selectedCaseId) {
      refetchInvoices();
      setAllocations([]);
      setTotalAmount(0);
    }
  }, [selectedCaseId, refetchInvoices]);

  useEffect(() => {
    if (preselectedInvoiceId && unpaidInvoices.length > 0) {
      const invoice = unpaidInvoices.find((inv) => inv.id === preselectedInvoiceId);
      if (invoice && !allocations.find(a => a.invoice_id === invoice.id)) {
        const balanceDue = invoice.balance_due ?? 0;
        setAllocations([{
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number ?? '',
          total_amount: invoice.total_amount ?? 0,
          balance_due: balanceDue,
          allocation_amount: balanceDue,
          status: invoice.status ?? 'draft',
        }]);
        setTotalAmount(balanceDue);
      }
    }
  }, [preselectedInvoiceId, unpaidInvoices]);

  // Most cases carry a single open invoice — seed it when the case is picked
  // so the invoice total/due are visible immediately and the amounts start in
  // sync. Once per case selection, so a deliberate row removal sticks.
  const seededCaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !preselectedInvoiceId &&
      selectedCaseId &&
      seededCaseRef.current !== selectedCaseId &&
      unpaidInvoices.length === 1 &&
      allocations.length === 0
    ) {
      seededCaseRef.current = selectedCaseId;
      const invoice = unpaidInvoices[0];
      const balanceDue = invoice.balance_due ?? 0;
      setAllocations([{
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number ?? '',
        total_amount: invoice.total_amount ?? 0,
        balance_due: balanceDue,
        allocation_amount: balanceDue,
        status: invoice.status ?? 'draft',
      }]);
      setTotalAmount(balanceDue);
    }
  }, [preselectedInvoiceId, selectedCaseId, unpaidInvoices, allocations.length]);

  const handleCaseChange = (caseId: string) => {
    setSelectedCaseId(caseId);
    setAllocations([]);
    setTotalAmount(0);
  };

  const handleAddInvoice = (invoiceId: string) => {
    const invoice = unpaidInvoices.find((inv) => inv.id === invoiceId);
    if (!invoice || allocations.find(a => a.invoice_id === invoiceId)) return;

    const balanceDue = invoice.balance_due ?? 0;
    const newAllocation: InvoiceAllocation = {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number ?? '',
      total_amount: invoice.total_amount ?? 0,
      balance_due: balanceDue,
      allocation_amount: balanceDue,
      status: invoice.status ?? 'draft',
    };

    setAllocations([...allocations, newAllocation]);
    updateTotalFromAllocations([...allocations, newAllocation]);
  };

  const handleRemoveAllocation = (invoiceId: string) => {
    const updated = allocations.filter(a => a.invoice_id !== invoiceId);
    setAllocations(updated);
    updateTotalFromAllocations(updated);
  };

  const handleAllocationAmountChange = (invoiceId: string, amount: number) => {
    const updated = allocations.map(a =>
      a.invoice_id === invoiceId
        ? { ...a, allocation_amount: Math.min(amount, a.balance_due) }
        : a
    );
    setAllocations(updated);
    updateTotalFromAllocations(updated);
  };

  const roundToCurrency = (n: number) => {
    const factor = Math.pow(10, currencyFormat.decimalPlaces);
    return Math.round(n * factor) / factor;
  };

  const updateTotalFromAllocations = (allocs: InvoiceAllocation[]) => {
    const total = allocs.reduce((sum, a) => sum + a.allocation_amount, 0);
    // Withheld tax reduces the CASH received, not the receivable settled.
    setTotalAmount(Math.max(0, roundToCurrency(total - withheldAmount)));
  };

  // Two-way sync: typing the payment amount distributes it across the listed
  // invoices in order, each clamped to its due. record_payment requires
  // allocations to sum EXACTLY to the amount, so the user never has to
  // reconcile the two by hand (the old one-way sync caused 400s on partials).
  const handleTotalAmountChange = (value: number) => {
    setTotalAmount(value);
    setAllocations((prev) => {
      // The receivable settled = cash amount + withheld tax; distribute that total.
      let remaining = roundToCurrency(value + withheldAmount);
      return prev.map((a) => {
        const take = roundToCurrency(Math.min(remaining, a.balance_due));
        remaining = roundToCurrency(remaining - take);
        return { ...a, allocation_amount: take };
      });
    });
  };

  // Withheld tax reduces the CASH received, not the receivable settled: keep
  // the allocations pinned to the invoice dues and re-derive the cash amount.
  const handleWithheldChange = (value: number) => {
    const w = Math.max(0, value);
    setWithheldAmount(w);
    setTotalAmount(Math.max(0, roundToCurrency(totalAllocated - w)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalAmount <= 0 || !selectedCaseId || isSubmitting) return;
    // Financial integrity: every payment must record HOW it was paid and WHERE it
    // lands so it can be reconciled. Block (with inline errors) rather than recording
    // a payment with no method/account — createPayment enforces this server-side too.
    if (!paymentMethodId || !bankAccountId) {
      setShowErrors(true);
      return;
    }
    if (Math.abs(totalAllocated - (totalAmount + withheldAmount)) > 1e-6 || certMissing) return;

    setIsSubmitting(true);
    try {
      await onSave(
        {
          payment_date: paymentDate,
          amount: totalAmount,
          customer_id: selectedCase?.customer?.id || null,
          payment_method_id: paymentMethodId || null,
          bank_account_id: bankAccountId || null,
          reference: referenceNumber || undefined,
          status: 'completed',
          notes: notes || undefined,
        },
        allocations.map(a => ({
          invoice_id: a.invoice_id,
          amount: a.allocation_amount,
        })),
        withheldAmount > 0 ? { amount: withheldAmount, certificateRef: certificateRef.trim() } : null
      );
      handleClose();
    } catch (error) {
      logger.error('Error recording payment:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setTotalAmount(0);
    setSelectedCaseId(preselectedCaseId || '');
    setPaymentMethodId('');
    setBankAccountId('');
    setReferenceNumber('');
    setNotes('');
    setAllocations([]);
    setShowErrors(false);
    setShowWithholding(false);
    setWithheldAmount(0);
    setCertificateRef('');
    onClose();
  };

  const availableInvoices = unpaidInvoices.filter(
    (inv) => !allocations.find(a => a.invoice_id === inv.id)
  );

  const totalAllocated = allocations.reduce((sum, a) => sum + a.allocation_amount, 0);
  // What the listed invoices will still owe once this payment is applied.
  // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency rollup: a payment allocates across one customer's invoices, all in the tenant currency
  const totalDue = allocations.reduce((sum, a) => sum + a.balance_due, 0);
  const remainingBalance = Math.max(0, totalDue - totalAllocated);
  // record_payment rejects any difference (money conservation) — block the
  // submit client-side and explain, instead of surfacing a server 400.
  const allocationMismatch =
    allocations.length > 0 && Math.abs(totalAllocated - (totalAmount + withheldAmount)) > 1e-6;
  const certMissing = withheldAmount > 0 && !certificateRef.trim();
  // Required for financial integrity — a payment must name its method and deposit account.
  const methodMissing = !paymentMethodId;
  const accountMissing = !bankAccountId;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Record Payment" size="lg" closeOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="payment-case" className="block text-sm font-medium text-slate-700 mb-1">
            Case <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
            <select
              id="payment-case"
              value={selectedCaseId}
              onChange={(e) => handleCaseChange(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              required
            >
              <option value="">Select Case</option>
              {casesWithInvoices.map((c: CaseWithCustomer) => (
                <option key={c.id} value={c.id}>
                  {c.case_no} - {c.title}
                </option>
              ))}
            </select>
          </div>
          {casesWithInvoices.length === 0 && (
            <p className="mt-1 text-xs text-warning">
              No cases with unpaid invoices found.
            </p>
          )}
        </div>

        {selectedCase?.customer && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500 -mt-1">
            <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span>Customer</span>
            <span className="font-medium text-slate-900">{selectedCase.customer.customer_name}</span>
            {selectedCase.customer.email && (
              <span className="truncate">· {selectedCase.customer.email}</span>
            )}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Payment Date <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Payment Amount <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={totalAmount}
                onChange={(e) => handleTotalAmountChange(parseFloat(e.target.value) || 0)}
                className="pl-10 pr-14 text-lg font-semibold tabular-nums"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400 pointer-events-none">
                {currencyFormat.currencyCode}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="payment-method" className="block text-sm font-medium text-slate-700 mb-1">
              Payment Method <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <select
                id="payment-method"
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                aria-invalid={showErrors && methodMissing}
                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary ${
                  showErrors && methodMissing ? 'border-danger bg-danger-muted/40' : 'border-slate-300'
                }`}
                required
              >
                <option value="">Select Method</option>
                {paymentMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.name}
                  </option>
                ))}
              </select>
            </div>
            {showErrors && methodMissing ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-danger" role="alert">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                Required for financial records
              </p>
            ) : paymentMethods.length === 0 ? (
              <p className="mt-1 text-xs text-warning">
                No payment methods enabled. Enable them in Settings.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="payment-bank-account" className="block text-sm font-medium text-slate-700 mb-1">
              Deposit To <span className="text-danger">*</span>
            </label>
            <select
              id="payment-bank-account"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              aria-invalid={showErrors && accountMissing}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary ${
                showErrors && accountMissing ? 'border-danger bg-danger-muted/40' : 'border-slate-300'
              }`}
              required
            >
              <option value="">Select Account</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name} ({account.account_type})
                </option>
              ))}
            </select>
            {showErrors && accountMissing ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-danger" role="alert">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                Required — where the money lands
              </p>
            ) : bankAccounts.length === 0 ? (
              <p className="mt-1 text-xs text-warning">
                No deposit accounts found. Add one in Settings → Banking.
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Reference Number
          </label>
          <Input
            type="text"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="e.g., Check #, Transaction ID"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">
              Invoice Allocation <span className="text-danger">*</span>
            </label>
            {selectedCaseId && availableInvoices.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddInvoice(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="text-sm px-2 py-1 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">+ Add Invoice</option>
                {availableInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} - {formatCurrency(inv.balance_due ?? 0)} due
                  </option>
                ))}
              </select>
            )}
          </div>

          {allocations.length > 0 ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left py-1.5 px-3 text-xs font-semibold text-slate-600">Invoice</th>
                    <th className="text-right py-1.5 px-3 text-xs font-semibold text-slate-600">Invoice Total</th>
                    <th className="text-right py-1.5 px-3 text-xs font-semibold text-slate-600">Due</th>
                    <th className="text-right py-1.5 px-3 text-xs font-semibold text-slate-600">Allocate</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {allocations.map((alloc) => (
                    <tr key={alloc.invoice_id}>
                      <td className="py-1.5 px-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">
                              {alloc.invoice_number}
                            </p>
                            {alloc.status === 'draft' && (
                              <Badge variant="warning" size="sm">
                                Draft
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right text-sm text-slate-600 tabular-nums">
                        {formatCurrency(alloc.total_amount)}
                      </td>
                      <td className="py-1.5 px-3 text-right text-sm font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(alloc.balance_due)}
                      </td>
                      <td className="py-1.5 px-3">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={alloc.balance_due}
                          value={alloc.allocation_amount}
                          onChange={(e) =>
                            handleAllocationAmountChange(
                              alloc.invoice_id,
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-28 text-right text-sm"
                        />
                      </td>
                      <td className="py-1.5 px-3">
                        <button
                          type="button"
                          onClick={() => handleRemoveAllocation(alloc.invoice_id)}
                          className="p-1 text-danger hover:bg-danger-muted rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={3} className="py-1.5 px-3 text-right text-sm font-semibold text-slate-700">
                      Total Allocated:
                    </td>
                    <td className="py-1.5 px-3 text-right text-sm font-bold text-primary tabular-nums">
                      {formatCurrency(totalAllocated)}
                    </td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="py-1.5 px-3 text-right text-sm font-medium text-slate-600">
                      Remaining Balance:
                    </td>
                    <td
                      className={`py-1.5 px-3 text-right text-sm font-bold tabular-nums ${
                        remainingBalance === 0 ? 'text-success' : 'text-slate-900'
                      }`}
                    >
                      {formatCurrency(remainingBalance)}
                    </td>
                    <td></td>
                  </tr>
                  <tr className={allocationMismatch ? 'bg-warning-muted' : 'bg-success-muted/50'}>
                    <td colSpan={5} className="py-1.5 px-3">
                      {allocationMismatch ? (
                        <p className="flex items-center gap-1.5 text-sm font-medium text-warning" role="alert">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                          {totalAmount + withheldAmount - totalAllocated > 0
                            ? `${formatCurrency(totalAmount + withheldAmount - totalAllocated)} of the payment is unallocated — it exceeds the listed invoices' due. Reduce the amount or add another invoice.`
                            : `Allocated ${formatCurrency(totalAllocated)} exceeds the payment amount plus withheld tax ${formatCurrency(totalAmount + withheldAmount)} — lower the allocations or raise the amount.`}
                        </p>
                      ) : (
                        <p className="flex items-center gap-1.5 text-sm text-success">
                          <CheckCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                          Payment fully allocated
                        </p>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="border border-dashed border-slate-300 rounded-lg p-4 text-center">
              <FileText className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
              <p className="text-sm text-slate-500">
                {selectedCaseId && unpaidInvoices.length === 0
                  ? 'No payable invoices on this case. Draft invoices must be issued first — use Issue Invoice on the invoice.'
                  : selectedCaseId
                    ? 'No invoices selected. Add invoices to allocate this payment.'
                    : 'Select a case first to see available invoices.'}
              </p>
            </div>
          )}
        </div>

        <div className="border border-slate-200 rounded-lg">
          <button
            type="button"
            onClick={() => setShowWithholding((v) => !v)}
            aria-expanded={showWithholding}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            <span>Withholding (TDS/WHT)</span>
            <ChevronDown
              aria-hidden="true"
              className={`w-4 h-4 text-slate-400 transition-transform ${showWithholding ? 'rotate-180' : ''}`}
            />
          </button>
          {showWithholding && (
            <div className="px-3 pb-3 space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="payment-withheld-amount" className="block text-sm font-medium text-slate-700 mb-1">
                    Withheld Amount
                  </label>
                  <Input
                    id="payment-withheld-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={withheldAmount || ''}
                    onChange={(e) => handleWithheldChange(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label htmlFor="payment-withholding-cert" className="block text-sm font-medium text-slate-700 mb-1">
                    Certificate Reference {withheldAmount > 0 && <span className="text-danger">*</span>}
                  </label>
                  <Input
                    id="payment-withholding-cert"
                    type="text"
                    value={certificateRef}
                    onChange={(e) => setCertificateRef(e.target.value)}
                    placeholder="e.g. TDS 194J / Form 16A ref"
                  />
                  {certMissing && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-danger" role="alert">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                      Required when an amount is withheld
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                The invoice settles for the full allocated amount; the withheld portion is recorded
                as a tax-credit receivable against the certificate.
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="payment-notes" className="block text-sm font-medium text-slate-700 mb-1">
            Notes
          </label>
          <textarea
            id="payment-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Optional payment notes..."
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          {(methodMissing || accountMissing) ? (
            <span className="mr-auto flex items-center gap-1.5 text-xs font-medium text-danger">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              Select {methodMissing && accountMissing ? 'method & account' : methodMissing ? 'a payment method' : 'a deposit account'}
            </span>
          ) : certMissing ? (
            // Surfaced here too so the disabled reason is visible even when the
            // Withholding section (which holds the inline error) is collapsed.
            <span className="mr-auto flex items-center gap-1.5 text-xs font-medium text-danger">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              Add the withholding certificate reference
            </span>
          ) : null}
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || totalAmount <= 0 || !selectedCaseId || allocations.length === 0 || allocationMismatch || methodMissing || accountMissing || certMissing}
            title={
              allocationMismatch
                ? 'The allocation must equal the payment amount before recording'
                : (methodMissing || accountMissing)
                  ? 'Select a payment method and deposit account before recording'
                  : certMissing
                    ? 'A withholding certificate reference is required when an amount is withheld'
                    : undefined
            }
            className="flex items-center gap-2"
            variant="primary"
          >
            <CheckCircle className="w-4 h-4" />
            {isSubmitting ? 'Recording...' : 'Record Payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
