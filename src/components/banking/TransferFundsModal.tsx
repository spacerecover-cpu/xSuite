import React, { useState, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { bankingService } from '../../lib/bankingService';
import { useAccountingLocale } from '../../hooks/useAccountingLocale';
import { AlertCircle, ArrowRight } from 'lucide-react';

interface TransferFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transferData: Record<string, unknown>) => Promise<void>;
}

export const TransferFundsModal: React.FC<TransferFundsModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const { formatCurrencyValue } = useAccountingLocale();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [warning, setWarning] = useState<string>('');
  const fromAccountId = useId();
  const toAccountId = useId();
  const descriptionId = useId();

  const [formData, setFormData] = useState({
    transfer_date: new Date().toISOString().split('T')[0],
    from_account_id: '',
    to_account_id: '',
    amount: 0,
    reference: '',
    description: '',
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['active_accounts'],
    queryFn: async () => bankingService.getAccounts({ is_active: true }),
  });

  const fromAccount = accounts.find(a => a.id === formData.from_account_id);
  const toAccount = accounts.find(a => a.id === formData.to_account_id);

  const handleAmountChange = (value: number) => {
    setFormData({ ...formData, amount: value });
    setWarning('');

    if (fromAccount && value > fromAccount.current_balance) {
      setWarning(`Insufficient balance. Available: ${formatCurrencyValue(fromAccount.current_balance)}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (!formData.from_account_id) {
        throw new Error('Please select source account');
      }

      if (!formData.to_account_id) {
        throw new Error('Please select destination account');
      }

      if (formData.from_account_id === formData.to_account_id) {
        throw new Error('Source and destination accounts must be different');
      }

      if (!formData.amount || formData.amount <= 0) {
        throw new Error('Amount must be greater than zero');
      }

      if (fromAccount && formData.amount > fromAccount.current_balance) {
        throw new Error('Insufficient balance in source account');
      }

      await onSave(formData);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create transfer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer Funds" size="large">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-danger-muted border border-danger/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {warning && (
          <div className="bg-warning-muted border border-warning/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-sm text-warning">{warning}</p>
          </div>
        )}

        <Input
          label="Transfer Date"
          type="date"
          value={formData.transfer_date}
          onChange={(e) => setFormData({ ...formData, transfer_date: e.target.value })}
          required
        />

        <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-end">
          <div>
            <label htmlFor={fromAccountId} className="block text-sm font-medium text-slate-700 mb-1.5">From Account</label>
            <select
              id={fromAccountId}
              value={formData.from_account_id}
              onChange={(e) => setFormData({ ...formData, from_account_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              required
            >
              <option value="">Select Source</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_name} - Balance: {formatCurrencyValue(acc.current_balance)}
                </option>
              ))}
            </select>
            {fromAccount && (
              <p className="mt-1 text-xs text-slate-600">
                Type: <span className="font-medium capitalize">{fromAccount.account_type}</span>
              </p>
            )}
          </div>

          <div className="pb-2">
            <ArrowRight className="w-6 h-6 text-primary" />
          </div>

          <div>
            <label htmlFor={toAccountId} className="block text-sm font-medium text-slate-700 mb-1.5">To Account</label>
            <select
              id={toAccountId}
              value={formData.to_account_id}
              onChange={(e) => setFormData({ ...formData, to_account_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              required
            >
              <option value="">Select Destination</option>
              {accounts
                .filter(a => a.id !== formData.from_account_id)
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.account_name} - Balance: {formatCurrencyValue(acc.current_balance)}
                  </option>
                ))}
            </select>
            {toAccount && (
              <p className="mt-1 text-xs text-slate-600">
                Type: <span className="font-medium capitalize">{toAccount.account_type}</span>
              </p>
            )}
          </div>
        </div>

        <Input
          label="Amount"
          type="number"
          step="0.01"
          value={formData.amount}
          onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
          required
        />

        <Input
          label="Reference Number"
          value={formData.reference}
          onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
          placeholder="Optional reference"
        />

        <div>
          <label htmlFor={descriptionId} className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
          <textarea
            id={descriptionId}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Reason for transfer..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || !!warning}>
            {isSubmitting ? 'Processing...' : 'Transfer Funds'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
