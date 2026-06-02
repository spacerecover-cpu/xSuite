import React, { useState, useEffect, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { supabase } from '../../lib/supabaseClient';
import { bankingService } from '../../lib/bankingService';
import { useAccountingLocale } from '../../hooks/useAccountingLocale';
import { AlertCircle, Check, Clock, AlertTriangle, Receipt, CheckCircle } from 'lucide-react';

interface RecordReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (receiptData: Record<string, unknown>, allocations?: Array<{ invoice_id: string; allocated_amount: number }>) => Promise<void>;
  prefilledData?: {
    customer_id?: string;
    company_id?: string;
    case_id?: string;
    amount?: number;
  };
  singleInvoiceMode?: boolean;
  invoiceId?: string;
}

export const RecordReceiptModal: React.FC<RecordReceiptModalProps> = ({
  isOpen,
  onClose,
  onSave,
  prefilledData,
  singleInvoiceMode = false,
  invoiceId,
}) => {
  const { formatCurrencyValue } = useAccountingLocale();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [allocations, setAllocations] = useState<Map<string, number>>(new Map());
  const accountSelectId = useId();
  const paymentMethodSelectId = useId();
  const notesId = useId();

  const [formData, setFormData] = useState({
    receipt_date: new Date().toISOString().split('T')[0],
    account_id: '',
    payment_method_id: '',
    amount: 0,
    case_id: '',
    customer_id: '',
    company_id: '',
    reference_number: '',
    description: '',
    notes: '',
  });

  useEffect(() => {
    if (prefilledData && isOpen) {
      setFormData(prev => ({
        ...prev,
        customer_id: prefilledData.customer_id || '',
        company_id: prefilledData.company_id || '',
        case_id: prefilledData.case_id || '',
        amount: prefilledData.amount || 0,
      }));

      if (singleInvoiceMode && invoiceId) {
        setSelectedInvoices(new Set([invoiceId]));
        setAllocations(new Map([[invoiceId, prefilledData.amount || 0]]));
      }
    }
  }, [prefilledData, isOpen, singleInvoiceMode, invoiceId]);

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        receipt_date: new Date().toISOString().split('T')[0],
        account_id: '',
        payment_method_id: '',
        amount: 0,
        case_id: '',
        customer_id: '',
        company_id: '',
        reference_number: '',
        description: '',
        notes: '',
      });
      setSelectedInvoices(new Set());
      setAllocations(new Map());
      setError('');
    }
  }, [isOpen]);

  const { data: accounts = [] } = useQuery({
    queryKey: ['active_accounts'],
    queryFn: async () => {
      return bankingService.getAccounts({ is_active: true });
    },
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment_methods'],
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

  const { data: cases = [] } = useQuery({
    queryKey: ['cases_with_invoices'],
    queryFn: async () => {
      return bankingService.getCasesWithInvoices({
        hasOutstandingInvoices: true,
      });
    },
    enabled: isOpen,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices_by_case', formData.case_id],
    queryFn: async () => {
      if (!formData.case_id) return [];
      return bankingService.getInvoicesByCase(formData.case_id);
    },
    enabled: !!formData.case_id,
  });

  useEffect(() => {
    if (formData.case_id && !singleInvoiceMode) {
      const selectedCase = cases.find(c => c.id === formData.case_id);
      if (selectedCase) {
        setFormData(prev => ({
          ...prev,
          customer_id: selectedCase.customer_id || '',
          company_id: selectedCase.company_id || '',
        }));
      }
    }
  }, [formData.case_id, cases, singleInvoiceMode]);

  const handleInvoiceToggle = (invoiceId: string, outstandingAmount: number) => {
    const newSelected = new Set(selectedInvoices);
    const newAllocations = new Map(allocations);

    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
      newAllocations.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
      newAllocations.set(invoiceId, outstandingAmount);
    }

    setSelectedInvoices(newSelected);
    setAllocations(newAllocations);

    const totalAmount = Array.from(newAllocations.values()).reduce((sum, val) => sum + val, 0);
    setFormData(prev => ({ ...prev, amount: totalAmount }));
  };

  const handleAllocationAmountChange = (invoiceId: string, amount: number) => {
    const newAllocations = new Map(allocations);
    newAllocations.set(invoiceId, amount);
    setAllocations(newAllocations);

    const totalAmount = Array.from(newAllocations.values()).reduce((sum, val) => sum + val, 0);
    setFormData(prev => ({ ...prev, amount: totalAmount }));
  };

  const handleAutoDistribute = () => {
    if (!formData.amount || selectedInvoices.size === 0) return;

    const newAllocations = new Map<string, number>();
    let remainingAmount = formData.amount;

    const selectedInvoicesList = invoices.filter(inv => selectedInvoices.has(inv.id));

    for (const invoice of selectedInvoicesList) {
      const outstanding = invoice.balance_due || 0;
      if (remainingAmount <= 0) {
        newAllocations.set(invoice.id, 0);
      } else if (remainingAmount >= outstanding) {
        newAllocations.set(invoice.id, outstanding);
        remainingAmount -= outstanding;
      } else {
        newAllocations.set(invoice.id, remainingAmount);
        remainingAmount = 0;
      }
    }

    setAllocations(newAllocations);
  };

  const totalAllocated = Array.from(allocations.values()).reduce((sum, val) => sum + val, 0);
  const unallocatedAmount = formData.amount - totalAllocated;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (!formData.account_id) {
        throw new Error('Please select an account');
      }

      if (!formData.amount || formData.amount <= 0) {
        throw new Error('Amount must be greater than zero');
      }

      if (!formData.case_id) {
        throw new Error('Please select a case');
      }

      if (totalAllocated > formData.amount) {
        throw new Error('Total allocated amount cannot exceed receipt amount');
      }

      for (const [invoiceId, amount] of allocations.entries()) {
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (invoice && amount > (invoice.balance_due || 0)) {
          throw new Error(`Allocation for invoice ${invoice.invoice_number} exceeds outstanding balance`);
        }
      }

      const receiptData = {
        ...formData,
        source_type: formData.customer_id ? 'customer' : formData.company_id ? 'company' : 'other',
        status: 'completed',
      };

      const allocationRecords = Array.from(allocations.entries()).map(([invoice_id, allocated_amount]) => ({
        invoice_id,
        allocated_amount,
      }));

      await onSave(receiptData, allocationRecords);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record receipt');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
      paid: { color: 'bg-success-muted text-success', icon: Check },
      'partially-paid': { color: 'bg-info-muted text-info', icon: Clock },
      sent: { color: 'bg-warning-muted text-warning', icon: AlertTriangle },
      draft: { color: 'bg-slate-100 text-slate-800', icon: Receipt },
      overdue: { color: 'bg-danger-muted text-danger', icon: AlertTriangle },
    };

    const config = statusConfig[status] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {status}
      </span>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={singleInvoiceMode ? "Record Payment for Invoice" : "Record Payment Receipt"}
      size="large"
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-danger-muted border border-danger/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Receipt Date"
            type="date"
            value={formData.receipt_date}
            onChange={(e) => setFormData({ ...formData, receipt_date: e.target.value })}
            required
          />

          <div>
            <label htmlFor={accountSelectId} className="block text-sm font-medium text-slate-700 mb-1.5">
              Deposit To Account <span className="text-danger">*</span>
            </label>
            <select
              id={accountSelectId}
              value={formData.account_id}
              onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              required
            >
              <option value="">Select Account</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_name} ({acc.account_type}) - Balance: {formatCurrencyValue(acc.current_balance)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!singleInvoiceMode && (
          <>
            <SearchableSelect
              label="Case ID"
              value={formData.case_id}
              onChange={(value) => {
                setFormData({ ...formData, case_id: value });
                setSelectedInvoices(new Set());
                setAllocations(new Map());
              }}
              options={cases.map((caseItem) => ({
                id: caseItem.id,
                name: `${caseItem.case_number ?? ''} - ${caseItem.title ?? ''} (${caseItem.client_name})`,
              }))}
              placeholder="Search by case number or title..."
              required
              emptyMessage="No cases with outstanding invoices found"
            />
            <p className="text-xs text-slate-500 -mt-3">
              Showing cases with outstanding invoices only
            </p>
          </>
        )}

        {formData.case_id && invoices.length > 0 && (
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {singleInvoiceMode ? 'Invoice Payment Details' : 'Select Invoice(s) for Payment'}
              </h3>
              {!singleInvoiceMode && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleAutoDistribute}
                  disabled={selectedInvoices.size === 0 || !formData.amount}
                >
                  Auto-Distribute Payment
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 max-h-80 overflow-y-auto">
              {invoices
                .filter((invoice) => singleInvoiceMode ? invoice.id === invoiceId : true)
                .map((invoice) => {
                const outstanding = invoice.balance_due || 0;
                const isSelected = selectedInvoices.has(invoice.id);
                const allocation = allocations.get(invoice.id) || 0;

                return (
                  <div key={invoice.id} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => !singleInvoiceMode && handleInvoiceToggle(invoice.id, outstanding)}
                      className={`w-full text-left border-2 rounded-lg p-3 transition-all ${
                        isSelected
                          ? 'border-primary bg-info-muted shadow-sm'
                          : singleInvoiceMode
                          ? 'border-primary bg-info-muted shadow-sm cursor-default'
                          : 'border-slate-200 bg-white hover:border-primary/50 hover:shadow-sm'
                      }`}
                      disabled={singleInvoiceMode}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-bold text-slate-900">
                              {invoice.invoice_number}
                            </p>
                            {getStatusBadge(invoice.status ?? 'draft')}
                            {isSelected && (
                              <CheckCircle className="w-4 h-4 text-primary ml-auto" />
                            )}
                            {singleInvoiceMode && (
                              <span className="ml-auto text-xs font-medium text-info bg-info-muted px-2 py-1 rounded">
                                Current Invoice
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mb-2">
                            Invoice Date: {invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString() : 'N/A'} | Due:{' '}
                            {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A'}
                          </p>
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div>
                              <span className="text-slate-500 block">Total Amount</span>
                              <span className="font-semibold text-slate-900">
                                {formatCurrencyValue(invoice.total_amount || 0)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Amount Paid</span>
                              <span className="font-semibold text-success">
                                {formatCurrencyValue(invoice.amount_paid || 0)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Outstanding</span>
                              <span className="font-bold text-lg text-danger">
                                {formatCurrencyValue(outstanding)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                    {isSelected && (
                      <div className="ml-3 pl-3 border-l-2 border-primary">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {singleInvoiceMode ? 'Payment Amount' : 'Allocate Amount'}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={singleInvoiceMode ? undefined : outstanding}
                          value={allocation}
                          onChange={(e) =>
                            handleAllocationAmountChange(invoice.id, parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                        {singleInvoiceMode && allocation > outstanding && (
                          <p className="text-xs text-success mt-1">
                            Overpayment: {formatCurrencyValue(allocation - outstanding)} will be recorded as credit
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-300 bg-white rounded-lg p-3">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-600 text-xs mb-0.5">Receipt Amount</p>
                  <p className="font-bold text-lg text-slate-900">{formatCurrencyValue(formData.amount)}</p>
                </div>
                <div>
                  <p className="text-slate-600 text-xs mb-0.5">Total Allocated</p>
                  <p className="font-bold text-lg text-primary">{formatCurrencyValue(totalAllocated)}</p>
                </div>
                <div>
                  <p className="text-slate-600 text-xs mb-0.5">Unallocated</p>
                  <p className={`font-bold text-lg ${unallocatedAmount >= 0 ? 'text-success' : 'text-danger'}`}>
                    {formatCurrencyValue(unallocatedAmount)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {formData.case_id && invoices.length === 0 && (
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 text-center">
            <Receipt className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">No invoices found for this case</p>
            <p className="text-xs text-slate-500 mt-1">This payment will be recorded as unallocated</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Amount"
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
            required
          />

          <div>
            <label htmlFor={paymentMethodSelectId} className="block text-sm font-medium text-slate-700 mb-1.5">Payment Method</label>
            <select
              id={paymentMethodSelectId}
              value={formData.payment_method_id}
              onChange={(e) => setFormData({ ...formData, payment_method_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">Select Method</option>
              {paymentMethods.map((method: { id: string; name: string }) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Input
          label="Reference Number"
          value={formData.reference_number}
          onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
          placeholder="Check number, transaction ID, etc."
        />

        <Input
          label="Description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Payment description"
        />

        <div>
          <label htmlFor={notesId} className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
          <textarea
            id={notesId}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Additional notes..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Recording...' : 'Record Receipt'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
