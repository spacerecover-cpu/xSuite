import React, { useEffect, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { supabase } from '../../lib/supabaseClient';
import { bankingService } from '../../lib/bankingService';
import { useAccountingLocale } from '../../hooks/useAccountingLocale';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  Receipt,
  Wand2,
  XCircle,
} from 'lucide-react';

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

interface PayableInvoice {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  status: string;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
}

// OMR needs 3 decimals; this is safe for 2-decimal currencies too.
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const isZero = (n: number) => Math.abs(n) < 0.0005;

const STATUS_BADGES: Record<string, { classes: string; icon: React.ComponentType<{ className?: string }> }> = {
  paid: { classes: 'bg-success-muted text-success', icon: Check },
  partial: { classes: 'bg-info-muted text-info', icon: Clock },
  sent: { classes: 'bg-warning-muted text-warning', icon: Clock },
  overdue: { classes: 'bg-danger-muted text-danger', icon: AlertTriangle },
  void: { classes: 'bg-slate-100 text-slate-600', icon: XCircle },
  cancelled: { classes: 'bg-slate-100 text-slate-600', icon: XCircle },
  draft: { classes: 'bg-slate-100 text-slate-700', icon: Receipt },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = STATUS_BADGES[status] || STATUS_BADGES.draft;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.classes}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
};

const daysOverdue = (dueDate: string | null): number => {
  if (!dueDate) return 0;
  const diff = Date.now() - new Date(dueDate).getTime();
  return diff > 0 ? Math.floor(diff / 86400000) : 0;
};

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
  const [allocations, setAllocations] = useState<Map<string, number>>(new Map());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
      setAllocations(new Map());
      setHistoryOpen(false);
      setDetailsOpen(false);
      setError('');
    }
  }, [isOpen]);

  const { data: accounts = [] } = useQuery({
    queryKey: ['active_accounts'],
    queryFn: async () => bankingService.getAccounts({ is_active: true }),
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
    queryFn: async () => bankingService.getCasesWithInvoices({ hasOutstandingInvoices: true }),
    enabled: isOpen && !singleInvoiceMode,
  });

  // Only OPEN, PAYABLE tax invoices enter the allocation surface (oldest due
  // first). Proformas, converted shells, drafts, void and fully-paid documents
  // are filtered server-side — see bankingService.getOpenInvoicesByCase.
  const { data: openInvoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['open_invoices_by_case', formData.case_id],
    queryFn: async () => bankingService.getOpenInvoicesByCase(formData.case_id),
    enabled: isOpen && !!formData.case_id && !singleInvoiceMode,
  });

  const { data: singleInvoice } = useQuery({
    queryKey: ['invoice_for_payment', invoiceId],
    queryFn: async () => bankingService.getInvoiceForPayment(invoiceId as string),
    enabled: isOpen && singleInvoiceMode && !!invoiceId,
  });

  // Settled history is statement context only — loaded lazily on expand.
  const { data: settledInvoices = [] } = useQuery({
    queryKey: ['settled_invoices_by_case', formData.case_id],
    queryFn: async () => bankingService.getSettledInvoicesByCase(formData.case_id),
    enabled: isOpen && historyOpen && !!formData.case_id && !singleInvoiceMode,
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

  const payable: PayableInvoice[] = useMemo(() => {
    if (singleInvoiceMode) {
      return singleInvoice
        ? [singleInvoice as PayableInvoice]
        : [];
    }
    return openInvoices as PayableInvoice[];
  }, [singleInvoiceMode, singleInvoice, openInvoices]);

  const totalOutstanding = useMemo(
    () => round3(payable.reduce((sum, inv) => sum + (inv.balance_due || 0), 0)),
    [payable]
  );
  const totalAllocated = round3(Array.from(allocations.values()).reduce((sum, val) => sum + val, 0));
  const remaining = round3(formData.amount - totalAllocated);
  const remainingZero = isZero(remaining);
  const allocatedRows = Array.from(allocations.values()).filter(v => v > 0).length;

  const canSubmit =
    !isSubmitting &&
    !!formData.account_id &&
    formData.amount > 0 &&
    remainingZero &&
    allocatedRows > 0 &&
    (singleInvoiceMode || !!formData.case_id);

  const setAllocation = (id: string, value: number, outstanding: number) => {
    const clamped = Math.min(Math.max(round3(value), 0), round3(outstanding));
    const next = new Map(allocations);
    if (clamped > 0) next.set(id, clamped);
    else next.delete(id);
    setAllocations(next);
  };

  const toggleInvoice = (inv: PayableInvoice) => {
    if (singleInvoiceMode) return;
    const next = new Map(allocations);
    if (next.has(inv.id)) {
      next.delete(inv.id);
    } else {
      // Default to settling the invoice, but never allocate more than the
      // receipt has left to give.
      const outstanding = inv.balance_due || 0;
      const left = round3(formData.amount - round3(Array.from(next.values()).reduce((s, v) => s + v, 0)));
      next.set(inv.id, round3(Math.min(outstanding, Math.max(left, 0)) || outstanding));
    }
    setAllocations(next);
  };

  // Oldest-due-first auto apply (the Xero/QuickBooks default): walks the open
  // list in due-date order and fills until the received amount is exhausted.
  const handleAutoApply = () => {
    if (formData.amount <= 0) return;
    const next = new Map<string, number>();
    let left = formData.amount;
    for (const inv of payable) {
      if (left <= 0) break;
      const outstanding = inv.balance_due || 0;
      const slice = round3(Math.min(left, outstanding));
      if (slice > 0) {
        next.set(inv.id, slice);
        left = round3(left - slice);
      }
    }
    setAllocations(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      for (const [id, amount] of allocations.entries()) {
        const invoice = payable.find(inv => inv.id === id);
        if (invoice && amount > round3(invoice.balance_due || 0)) {
          throw new Error(`Allocation for ${invoice.invoice_number} exceeds its outstanding balance`);
        }
      }

      const receiptData = {
        ...formData,
        amount: round3(formData.amount),
        source_type: formData.customer_id ? 'customer' : formData.company_id ? 'company' : 'other',
        status: 'completed',
      };
      const allocationRecords = Array.from(allocations.entries())
        .filter(([, allocated_amount]) => allocated_amount > 0)
        .map(([invoice_id, allocated_amount]) => ({ invoice_id, allocated_amount: round3(allocated_amount) }));

      await onSave(receiptData, allocationRecords);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record receipt');
    } finally {
      setIsSubmitting(false);
    }
  };

  const meterTone = remainingZero && formData.amount > 0
    ? 'text-success'
    : remaining < 0
      ? 'text-danger'
      : 'text-warning';

  const meter = (
    <div aria-live="polite" className="rounded-lg border border-border bg-surface p-3">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Received</p>
          <p className="font-bold tabular-nums text-slate-900">{formatCurrencyValue(formData.amount)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Applied</p>
          <p className="font-bold tabular-nums text-primary">{formatCurrencyValue(totalAllocated)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Remaining</p>
          <p className={`font-bold tabular-nums ${meterTone}`}>{formatCurrencyValue(remaining)}</p>
        </div>
      </div>
      {!remainingZero && formData.amount > 0 && (
        <p className={`mt-2 text-xs ${remaining < 0 ? 'text-danger' : 'text-warning'}`}>
          {remaining < 0
            ? `Applied exceeds the received amount by ${formatCurrencyValue(Math.abs(remaining))} — reduce an allocation.`
            : `Apply ${formatCurrencyValue(remaining)} more, or reduce the received amount to match.`}
        </p>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={singleInvoiceMode ? 'Record Payment for Invoice' : 'Record Payment'}
      size="2xl"
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="bg-danger-muted border border-danger/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {!singleInvoiceMode && (
          <div>
            <SearchableSelect
              label="Case"
              value={formData.case_id}
              onChange={(value) => {
                setFormData(prev => ({ ...prev, case_id: value }));
                setAllocations(new Map());
                setHistoryOpen(false);
              }}
              options={cases.map((caseItem) => ({
                id: caseItem.id,
                name: `${caseItem.case_number ?? ''} - ${caseItem.title ?? ''} (${caseItem.client_name})`,
              }))}
              placeholder="Search by case number or title..."
              required
              emptyMessage="No cases with outstanding invoices found"
            />
            <p className="text-xs text-slate-500 mt-1">Showing cases with outstanding invoices only</p>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-[minmax(280px,340px)_1fr] lg:gap-5 space-y-4 lg:space-y-0">
          {/* Left pane: the facts the user knows first, then the meter. */}
          <div className="space-y-4 lg:self-start">
            <div className="rounded-lg border border-border bg-surface-muted p-4 space-y-4">
              <Input
                label="Amount received"
                type="number"
                step="any"
                min="0"
                value={formData.amount === 0 ? '' : formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                required
              />
              <Input
                label="Receipt date"
                type="date"
                value={formData.receipt_date}
                onChange={(e) => setFormData({ ...formData, receipt_date: e.target.value })}
                required
              />
              <div>
                <label htmlFor={accountSelectId} className="block text-sm font-medium text-slate-700 mb-1.5">
                  Deposit to account <span className="text-danger">*</span>
                </label>
                <select
                  id={accountSelectId}
                  value={formData.account_id}
                  onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_name} ({acc.account_type}) - {formatCurrencyValue(acc.current_balance)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={paymentMethodSelectId} className="block text-sm font-medium text-slate-700 mb-1.5">
                  Payment method
                </label>
                <select
                  id={paymentMethodSelectId}
                  value={formData.payment_method_id}
                  onChange={(e) => setFormData({ ...formData, payment_method_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">Select method</option>
                  {paymentMethods.map((method: { id: string; name: string }) => (
                    <option key={method.id} value={method.id}>{method.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="hidden lg:block">{meter}</div>

            <div className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setDetailsOpen(o => !o)}
                aria-expanded={detailsOpen}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-surface-muted rounded-lg"
              >
                {detailsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Reference &amp; notes
                <span className="text-xs font-normal text-slate-400 ml-auto">optional</span>
              </button>
              {detailsOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <Input
                    label="Reference number"
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
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right pane: open invoices only. */}
          <div className="space-y-3">
            {(singleInvoiceMode || formData.case_id) && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {singleInvoiceMode
                      ? 'Invoice'
                      : `Open invoices${payable.length ? ` · ${payable.length}` : ''}`}
                  </h3>
                  {!singleInvoiceMode && payable.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={handleAutoApply}
                      disabled={formData.amount <= 0}
                      title={formData.amount <= 0 ? 'Enter the amount received first' : 'Apply to the oldest invoices first'}
                    >
                      <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                      Auto-apply oldest first
                    </Button>
                  )}
                </div>

                {!singleInvoiceMode && payable.length > 0 && (
                  <p className="text-xs text-slate-500 -mt-1">
                    Total outstanding on this case: <span className="font-semibold tabular-nums text-slate-700">{formatCurrencyValue(totalOutstanding)}</span>
                  </p>
                )}

                <div className="space-y-2 lg:max-h-[420px] lg:overflow-y-auto lg:pr-1">
                  {invoicesLoading && (
                    <div className="rounded-lg border border-border p-6 text-center text-sm text-slate-500">
                      Loading open invoices…
                    </div>
                  )}

                  {!invoicesLoading && payable.length === 0 && (
                    <div className="rounded-lg border border-border bg-surface-muted p-6 text-center">
                      <Receipt className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-700">No open invoices on this case</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Payments must be allocated to an issued tax invoice with an outstanding balance.
                        Proformas and settled invoices are not payable.
                      </p>
                    </div>
                  )}

                  {payable.map((invoice) => {
                    const outstanding = round3(invoice.balance_due || 0);
                    const isSelected = allocations.has(invoice.id);
                    const allocation = allocations.get(invoice.id) ?? 0;
                    const overdueDays = daysOverdue(invoice.due_date);
                    const checkboxId = `alloc-${invoice.id}`;

                    return (
                      <div
                        key={invoice.id}
                        className={`rounded-lg border-2 transition-colors ${
                          isSelected ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:border-primary/40'
                        } ${overdueDays > 0 ? 'border-l-4 border-l-danger' : ''}`}
                      >
                        <label htmlFor={checkboxId} className={`flex items-start gap-3 p-3 ${singleInvoiceMode ? '' : 'cursor-pointer'}`}>
                          <input
                            id={checkboxId}
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-primary"
                            checked={isSelected}
                            disabled={singleInvoiceMode}
                            onChange={() => toggleInvoice(invoice)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-slate-900">{invoice.invoice_number}</span>
                              <StatusBadge status={invoice.status ?? 'draft'} />
                              {overdueDays > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-danger-muted text-danger">
                                  <AlertTriangle className="w-3 h-3" />
                                  {overdueDays}d overdue
                                </span>
                              )}
                              <span className="ml-auto text-xs text-slate-500">
                                Due {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-baseline gap-4 text-xs text-slate-500">
                              <span>
                                Total <span className="font-semibold tabular-nums text-slate-700">{formatCurrencyValue(invoice.total_amount || 0)}</span>
                              </span>
                              <span>
                                Paid <span className="font-semibold tabular-nums text-success">{formatCurrencyValue(invoice.amount_paid || 0)}</span>
                              </span>
                              <span className="ml-auto">
                                Outstanding{' '}
                                <span className="font-bold tabular-nums text-base text-slate-900">{formatCurrencyValue(outstanding)}</span>
                              </span>
                            </div>
                          </div>
                        </label>
                        {isSelected && (
                          <div className="px-3 pb-3 pl-10">
                            <div className="flex items-center gap-2">
                              <label htmlFor={`amount-${invoice.id}`} className="text-xs font-medium text-slate-700 whitespace-nowrap">
                                Apply
                              </label>
                              <input
                                id={`amount-${invoice.id}`}
                                type="number"
                                step="any"
                                min="0"
                                max={outstanding}
                                value={allocation === 0 ? '' : allocation}
                                onChange={(e) => setAllocation(invoice.id, parseFloat(e.target.value) || 0, outstanding)}
                                className="w-36 px-3 py-1.5 text-sm tabular-nums border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                                aria-label={`Amount to apply to ${invoice.invoice_number}`}
                              />
                              <button
                                type="button"
                                onClick={() => setAllocation(invoice.id, outstanding, outstanding)}
                                className="px-2 py-1 text-xs font-medium rounded border border-border text-primary hover:bg-primary/5"
                              >
                                Full {formatCurrencyValue(outstanding)}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!singleInvoiceMode && formData.case_id && (
                  <div className="rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(o => !o)}
                      aria-expanded={historyOpen}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-surface-muted rounded-lg"
                    >
                      {historyOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      Settled invoices on this case
                      <span className="text-xs font-normal text-slate-400 ml-auto">read-only</span>
                    </button>
                    {historyOpen && (
                      <div className="px-4 pb-3 space-y-1.5">
                        {settledInvoices.length === 0 && (
                          <p className="text-xs text-slate-500 py-1">No settled invoices yet.</p>
                        )}
                        {settledInvoices.map((inv) => (
                          <div key={inv.id} className="flex items-center gap-2 text-xs text-slate-600 py-1 border-b border-border/50 last:border-0">
                            <span className="font-medium text-slate-700">{inv.invoice_number}</span>
                            <StatusBadge status={inv.status ?? 'paid'} />
                            <span className="ml-auto tabular-nums">{formatCurrencyValue(inv.total_amount || 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {!singleInvoiceMode && !formData.case_id && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-slate-500">
                Select a case to see its open invoices.
              </div>
            )}
          </div>
        </div>

        {/* Mobile: the meter rides above the actions, sticky inside the modal scroll. */}
        <div className="lg:hidden sticky bottom-0 bg-surface pt-2 -mx-1 px-1">{meter}</div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          {!canSubmit && formData.amount > 0 && !remainingZero && (
            <p className="mr-auto text-xs text-slate-500">Remaining must reach zero to record</p>
          )}
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {isSubmitting ? 'Recording…' : formData.amount > 0 ? `Record ${formatCurrencyValue(formData.amount)}` : 'Record payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
