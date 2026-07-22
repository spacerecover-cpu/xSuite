import React, { useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { SearchableSelect } from '../../ui/SearchableSelect';
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
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Apply advance ${advance.payment_number ?? ''}`}
      subtitle={`Unapplied balance ${formatCurrencyWithConfig(advance.unappliedBalance, currencyConfig)}`}
      icon={Wallet}
      titleSize="sm"
      size="sm"
      showClose
      closeOnBackdrop={false}
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="applyAdvanceForm"
            variant="success"
            size="sm"
            className="text-xs"
            disabled={!canApply}
            isLoading={busy}
            loadingLabel="Applying"
          >
            Apply
          </Button>
        </div>
      }
    >
      <form id="applyAdvanceForm" onSubmit={handleSubmit} className="space-y-5">
        {invoices.length === 0 ? (
          <div className="text-sm text-slate-600 bg-surface-muted border border-border rounded-lg px-3 py-4 text-center">
            No open tax invoice to apply this advance to. Issue a tax invoice first, then net the advance into it.
          </div>
        ) : (
          <>
            <SearchableSelect
              label="Invoice"
              floatingLabel
              shrinkDefaultValue
              usePortal
              value={invoiceId}
              onChange={handleSelectInvoice}
              options={invoices.map((inv) => ({
                id: inv.id,
                name: `${inv.invoice_number || 'Draft'} — ${formatCurrencyWithConfig(inv.balance_due, currencyConfig)} due`,
              }))}
              placeholder="Select invoice"
            />

            <div>
              {/* No native `max`: an over-max entry is clamped on submit
                  (clampApplyAmount) rather than silently blocking the form. */}
              <Input
                label="Amount"
                floatingLabel
                id={AMOUNT_ID}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                aria-describedby={`${AMOUNT_ID}-hint`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular-nums"
              />
              <p id={`${AMOUNT_ID}-hint`} className="text-xs text-slate-500 mt-1">
                Up to{' '}
                <span className="font-medium text-slate-600 tabular-nums">
                  {formatCurrencyWithConfig(max, currencyConfig)}
                </span>{' '}
                (advance balance vs invoice due).
              </p>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
};
