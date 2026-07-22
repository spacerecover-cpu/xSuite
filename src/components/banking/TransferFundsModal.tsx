import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { SearchableSelect } from '../ui/SearchableSelect';
import { bankingService } from '../../lib/bankingService';
import { useCurrencyConfig } from '../../contexts/TenantConfigContext';
import { formatCurrencyWithConfig } from '../../lib/format';
import { AlertCircle, ArrowRight, ArrowLeftRight, Loader2 } from 'lucide-react';

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
  const currencyConfig = useCurrencyConfig();
  const formatCurrencyValue = (amount: number) => formatCurrencyWithConfig(amount, currencyConfig);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [warning, setWarning] = useState<string>('');

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
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer Funds" subtitle="Move funds from one account to another." icon={ArrowLeftRight} size="large" titleSize="sm" showClose closeOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-5">
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
          floatingLabel
          type="date"
          value={formData.transfer_date}
          onChange={(e) => setFormData({ ...formData, transfer_date: e.target.value })}
          required
        />

        <div className="grid grid-cols-[1fr,auto,1fr] gap-x-4 gap-y-5 items-end">
          <div>
            <SearchableSelect
              label="From Account"
              floatingLabel
              shrinkDefaultValue
              usePortal
              value={formData.from_account_id}
              onChange={(value) => setFormData({ ...formData, from_account_id: value })}
              options={[
                { id: '', name: 'Select Source' },
                ...accounts.map((acc) => ({
                  id: acc.id,
                  name: `${acc.account_name} - Balance: ${formatCurrencyValue(acc.current_balance)}`,
                })),
              ]}
              placeholder="Select Source"
            />
            {fromAccount && (
              <p className="mt-1 text-xs text-slate-500">
                Type: <span className="font-medium capitalize">{fromAccount.account_type}</span>
              </p>
            )}
          </div>

          <div className="pb-2">
            <ArrowRight className="w-6 h-6 text-primary" />
          </div>

          <div>
            <SearchableSelect
              label="To Account"
              floatingLabel
              shrinkDefaultValue
              usePortal
              value={formData.to_account_id}
              onChange={(value) => setFormData({ ...formData, to_account_id: value })}
              options={[
                { id: '', name: 'Select Destination' },
                ...accounts
                  .filter((a) => a.id !== formData.from_account_id)
                  .map((acc) => ({
                    id: acc.id,
                    name: `${acc.account_name} - Balance: ${formatCurrencyValue(acc.current_balance)}`,
                  })),
              ]}
              placeholder="Select Destination"
            />
            {toAccount && (
              <p className="mt-1 text-xs text-slate-500">
                Type: <span className="font-medium capitalize">{toAccount.account_type}</span>
              </p>
            )}
          </div>
        </div>

        <Input
          label="Amount"
          floatingLabel
          type="number"
          step="0.01"
          value={formData.amount}
          onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
          required
        />

        <Input
          label="Reference Number"
          floatingLabel
          value={formData.reference}
          onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
          placeholder="Optional reference"
        />

        <Textarea
          label="Description"
          floatingLabel
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
          className="resize-none"
          placeholder="Reason for transfer..."
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="text-xs" disabled={isSubmitting || !!warning}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Processing...
              </>
            ) : (
              'Transfer Funds'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
