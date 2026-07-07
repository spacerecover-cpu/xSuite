import React, { useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { formatCurrencyWithConfig } from '../../../lib/format';
import { maxApplicable, clampApplyAmount } from '../../../lib/advanceApply';
import type { CurrencyConfig } from '../../../types/tenantConfig';

export interface ApplyAdvanceHeld {
  id: string;
  payment_number: string | null;
  unappliedBalance: number;
  currency: string | null;
}

export interface ApplyAdvanceInvoice {
  id: string;
  invoice_number: string | null;
  balance_due: number;
}

interface ApplyAdvanceModalProps {
  open: boolean;
  advance: ApplyAdvanceHeld;
  invoices: ApplyAdvanceInvoice[];
  currencyConfig: CurrencyConfig;
  onClose: () => void;
  /** Parent nets the advance (applyAdvanceToInvoice), toasts, refetches, then closes. */
  onApply: (args: { paymentId: string; invoiceId: string; amount: number }) => Promise<void>;
}

const TITLE_ID = 'apply-advance-title';
const INVOICE_ID = 'apply-advance-invoice';
const AMOUNT_ID = 'apply-advance-amount';

// Render the max as a plain number the amount <input type="number"> accepts
// (no grouping/symbol), rounded to the currency's decimal places.
// Round to the currency's precision then drop only INSIGNIFICANT fractional
// zeros via a numeric round-trip. The old /\.?0+$/ regex stripped integer
// trailing zeros for a 0-decimal currency (5000 → "5") — silent under-apply.
export const toAmountFieldValue = (n: number, decimals: number) =>
  n > 0 ? String(Number(n.toFixed(decimals))) : '';

export const ApplyAdvanceModal: React.FC<ApplyAdvanceModalProps> = ({
  open,
  advance,
  invoices,
  currencyConfig,
  onClose,
  onApply,
}) => {
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? '');
  const selected = invoices.find((inv) => inv.id === invoiceId) ?? invoices[0] ?? null;
  const decimals = currencyConfig.decimalPlaces ?? 2;
  const max = useMemo(
    () => maxApplicable(advance.unappliedBalance, selected?.balance_due ?? 0),
    [advance.unappliedBalance, selected?.balance_due],
  );
  const [amount, setAmount] = useState(() => toAmountFieldValue(max, decimals));
  const [busy, setBusy] = useState(false);

  const applyAmount = clampApplyAmount(parseFloat(amount), max);
  const canApply = !!selected && applyAmount > 0 && !busy;

  const handleSelectInvoice = (id: string) => {
    setInvoiceId(id);
    const next = invoices.find((inv) => inv.id === id);
    setAmount(toAmountFieldValue(maxApplicable(advance.unappliedBalance, next?.balance_due ?? 0), decimals));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || applyAmount <= 0) return;
    setBusy(true);
    try {
      await onApply({ paymentId: advance.id, invoiceId: selected.id, amount: applyAmount });
      // On success the parent closes this modal; the parent surfaces any error
      // as a toast, so here we only need to release the busy state on rejection.
    } catch {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} labelledBy={TITLE_ID} className="max-w-md">
      <form onSubmit={handleSubmit} className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-success/15 flex items-center justify-center shrink-0">
            <Wallet className="w-4.5 h-4.5 text-success" />
          </div>
          <div className="min-w-0">
            <h2 id={TITLE_ID} className="text-base font-bold text-slate-900">
              Apply advance {advance.payment_number ?? ''}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Unapplied balance{' '}
              <span className="font-semibold text-slate-700 tabular-nums">
                {formatCurrencyWithConfig(advance.unappliedBalance, currencyConfig)}
              </span>
            </p>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="text-sm text-slate-600 bg-surface-muted border border-border rounded-lg px-3 py-4 text-center">
            No open tax invoice to apply this advance to. Issue a tax invoice first, then net the advance into it.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor={INVOICE_ID} className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice
              </label>
              <select
                id={INVOICE_ID}
                value={invoiceId}
                onChange={(e) => handleSelectInvoice(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number || 'Draft'} — {formatCurrencyWithConfig(inv.balance_due, currencyConfig)} due
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={AMOUNT_ID} className="block text-xs font-semibold text-slate-700 mb-1">
                Amount
              </label>
              <input
                id={AMOUNT_ID}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                // No native `max`: an over-max entry is clamped on submit
                // (clampApplyAmount) rather than silently blocking the form.
                aria-describedby={`${AMOUNT_ID}-hint`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <p id={`${AMOUNT_ID}-hint`} className="text-xs text-slate-400 mt-1">
                Up to{' '}
                <span className="font-medium text-slate-600 tabular-nums">
                  {formatCurrencyWithConfig(max, currencyConfig)}
                </span>{' '}
                (advance balance vs invoice due).
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="success"
            size="sm"
            disabled={!canApply}
            isLoading={busy}
            loadingLabel="Applying"
          >
            Apply
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
