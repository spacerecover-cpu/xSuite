import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useCurrency } from '../../hooks/useCurrency';
import { useToast } from '../../hooks/useToast';
import { issueCreditNote, applyCreditNote } from '../../lib/creditNoteService';
import { logger } from '../../lib/logger';
import { FileMinus, AlertTriangle, CheckCircle } from 'lucide-react';

interface CreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: {
    id: string;
    invoice_number?: string | null;
    total_amount?: number | null;
    amount_paid?: number | null;
    credited_amount?: number | null;
    balance_due?: number | null;
    tax_amount?: number | null;
    currency?: string | null;
    case_id?: string | null;
    customer_id?: string | null;
    company_id?: string | null;
  };
  onSaved: () => void;
}

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'discount', label: 'Discount' },
  { value: 'partial_recovery', label: 'Partial recovery' },
  { value: 'negotiated_settlement', label: 'Negotiated settlement' },
  { value: 'goodwill', label: 'Goodwill' },
  { value: 'correction', label: 'Billing correction' },
  { value: 'other', label: 'Other' },
];

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({ isOpen, onClose, invoice, onSaved }) => {
  const { formatCurrency, currencyFormat } = useCurrency();
  const toast = useToast();
  const [amount, setAmount] = useState<number>(0);
  const [reasonCode, setReasonCode] = useState('discount');
  const [reasonNotes, setReasonNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roundMoney = (n: number) => {
    const f = Math.pow(10, currencyFormat.decimalPlaces);
    return Math.round(n * f) / f;
  };

  const total = num(invoice.total_amount);
  const balance = roundMoney(
    invoice.balance_due != null
      ? Math.max(0, num(invoice.balance_due))
      : Math.max(0, total - num(invoice.amount_paid) - num(invoice.credited_amount)),
  );
  // Reverse the invoice's VAT in proportion to the credited share of the total.
  const taxAmount = total > 0 ? roundMoney((amount * num(invoice.tax_amount)) / total) : 0;
  const balanceAfter = roundMoney(balance - amount);
  const exceedsBalance = amount > balance + 1e-9;
  const settlesInFull = !exceedsBalance && amount > 0 && balanceAfter <= 0;
  const canSubmit = !isSubmitting && amount > 0 && !exceedsBalance && reasonCode.trim().length > 0;

  const handleClose = () => {
    setAmount(0);
    setReasonCode('discount');
    setReasonNotes('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const creditNote = await issueCreditNote(
        {
          invoice_id: invoice.id,
          case_id: invoice.case_id ?? null,
          customer_id: invoice.customer_id ?? null,
          company_id: invoice.company_id ?? null,
          credit_type: 'adjustment',
          currency: invoice.currency ?? currencyFormat.currencyCode,
          total_amount: roundMoney(amount),
          tax_amount: taxAmount,
          reason_code: reasonCode,
          reason_notes: reasonNotes || undefined,
        },
        [],
      );
      await applyCreditNote(creditNote.id, [{ invoice_id: invoice.id, amount: roundMoney(amount) }]);
      toast.success(`Credit note ${creditNote.credit_note_number ?? ''} issued`.trim());
      onSaved();
      handleClose();
    } catch (err) {
      logger.error('Error issuing credit note:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to issue credit note');
    } finally {
      setIsSubmitting(false);
    }
  };

  const vatHint =
    num(invoice.tax_amount) > 0 && amount > 0
      ? `Includes ${formatCurrency(taxAmount)} VAT, reversed proportionally.`
      : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Credit note${invoice.invoice_number ? ` for ${invoice.invoice_number}` : ''}`}
      size="md"
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-muted p-3 flex items-center justify-between text-sm">
          <span className="text-slate-600">Outstanding balance</span>
          <span className="font-bold tabular-nums text-slate-900">{formatCurrency(balance)}</span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="cn-amount" className="block text-sm font-medium text-slate-700">
              Credit amount <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <button
              type="button"
              onClick={() => setAmount(balance)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Full balance
            </button>
          </div>
          <Input
            id="cn-amount"
            type="number"
            step="any"
            min="0"
            max={balance}
            value={amount === 0 ? '' : amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            required
            hint={vatHint}
          />
        </div>

        <div>
          <label htmlFor="cn-reason" className="block text-sm font-medium text-slate-700 mb-1">
            Reason <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <select
            id="cn-reason"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          >
            {REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cn-notes" className="block text-sm font-medium text-slate-700 mb-1">
            Notes
          </label>
          <textarea
            id="cn-notes"
            value={reasonNotes}
            onChange={(e) => setReasonNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Optional explanation for the audit trail…"
          />
        </div>

        <div
          aria-live="polite"
          className="rounded-lg border border-border bg-surface p-3 flex items-center justify-between gap-3"
        >
          <span className="text-xs text-slate-500">Invoice balance after this credit</span>
          <span
            className={`text-sm font-bold tabular-nums ${
              exceedsBalance ? 'text-danger' : settlesInFull ? 'text-success' : 'text-slate-900'
            }`}
          >
            {formatCurrency(Math.max(0, balanceAfter))}
          </span>
        </div>

        {exceedsBalance && (
          <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            Credit exceeds the outstanding balance by {formatCurrency(amount - balance)}. Refunds beyond the
            balance aren’t supported yet.
          </p>
        )}
        {settlesInFull && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            This credit settles the invoice in full.
          </p>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} className="flex items-center gap-2">
            <FileMinus className="w-4 h-4" />
            {isSubmitting ? 'Issuing…' : `Issue credit note${amount > 0 ? ` ${formatCurrency(roundMoney(amount))}` : ''}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
