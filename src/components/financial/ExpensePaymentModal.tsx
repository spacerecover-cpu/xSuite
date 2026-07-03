import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Wallet, Banknote } from 'lucide-react';
import { bankingService } from '../../lib/bankingService';
import { useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { tenantToday } from '../../lib/tenantToday';

export interface ExpensePaymentTarget {
  id: string;
  amount: number;
  currency: string | null;
  expense_number?: string | null;
}

interface ExpensePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: ExpensePaymentTarget | null;
  /** Parent owns the mutation; resolves on success so the modal can stay open on error. */
  onConfirm: (args: { bankAccountId: string; paidAt: string; reference?: string }) => Promise<void>;
  isSubmitting?: boolean;
}

/**
 * EXP-017 — collects the account + date for an atomic expense disbursement.
 * Match-currency v1: only active accounts whose currency equals the expense currency
 * are selectable (the debit is 1:1). Insufficient-funds is enforced server-side by the
 * RPC; here we just gather inputs.
 */
export const ExpensePaymentModal: React.FC<ExpensePaymentModalProps> = ({
  isOpen,
  onClose,
  expense,
  onConfirm,
  isSubmitting = false,
}) => {
  const { timezone } = useDateTimeConfig();
  const [bankAccountId, setBankAccountId] = useState('');
  const [paidAt, setPaidAt] = useState(() => tenantToday(timezone));
  const [reference, setReference] = useState('');

  const expenseCurrency = expense?.currency ?? 'USD';

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['bank_accounts', 'active'],
    queryFn: () => bankingService.getAccounts({ is_active: true }),
    enabled: isOpen,
  });

  // Match-currency v1: only accounts in the expense's currency can pay it 1:1.
  const eligibleAccounts = useMemo(
    () => accounts.filter((a) => (a.currency ?? 'USD') === expenseCurrency),
    [accounts, expenseCurrency],
  );

  // Reset the form whenever a new expense opens the modal.
  useEffect(() => {
    if (isOpen) {
      setBankAccountId('');
      setPaidAt(tenantToday(timezone));
      setReference('');
    }
  }, [isOpen, expense?.id]);

  const fmt = (n: number) => `${expenseCurrency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankAccountId || !expense) return;
    await onConfirm({ bankAccountId, paidAt, reference: reference.trim() || undefined });
  };

  if (!expense) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Expense Payment" icon={Wallet} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {expense.expense_number ? `Expense ${expense.expense_number}` : 'Expense amount'}
            </span>
            <span className="text-base font-semibold text-slate-900">{fmt(expense.amount)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Paying debits the selected account and records a bank transaction. The accounting entry was already posted at approval.
          </p>
        </div>

        <div>
          <label htmlFor="exp-pay-account" className="mb-1 block text-sm font-medium text-slate-700">
            Pay from account <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <Banknote className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              id="exp-pay-account"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              required
              disabled={isLoading || eligibleAccounts.length === 0}
              className="w-full rounded-lg border border-border bg-surface py-2 ps-9 pe-3 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
            >
              <option value="">{isLoading ? 'Loading accounts…' : 'Select an account'}</option>
              {eligibleAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name} — {fmt(a.current_balance ?? 0)}
                </option>
              ))}
            </select>
          </div>
          {!isLoading && eligibleAccounts.length === 0 && (
            <p className="mt-1 text-xs text-warning-foreground">
              No active {expenseCurrency} account exists. Add a matching-currency bank account to pay this expense.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="exp-pay-date" className="mb-1 block text-sm font-medium text-slate-700">
            Payment date
          </label>
          <Input
            id="exp-pay-date"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="exp-pay-ref" className="mb-1 block text-sm font-medium text-slate-700">
            Reference <span className="text-slate-400">(optional)</span>
          </label>
          <Input
            id="exp-pay-ref"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Cheque no., transfer ref…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={!bankAccountId || isSubmitting}>
            {isSubmitting ? 'Recording…' : 'Record Payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
