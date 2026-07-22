import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { SearchableSelect } from '../ui/SearchableSelect';
import { supabase } from '../../lib/supabaseClient';
import { getTransactionCategories, Transaction } from '../../lib/transactionsService';
import {
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Loader2,
} from 'lucide-react';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/useToast';

interface TransactionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
}

export const TransactionFormModal: React.FC<TransactionFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [description, setDescription] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['transaction_categories'],
    queryFn: getTransactionCategories,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextAmountError = amount <= 0 ? 'Amount must be greater than zero.' : null;
    const nextDescriptionError = !description.trim() ? 'Description is required.' : null;
    setAmountError(nextAmountError);
    setDescriptionError(nextDescriptionError);
    if (nextAmountError || nextDescriptionError) {
      toast.error(nextAmountError || nextDescriptionError || 'Please fix the highlighted fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      // financial_transactions has no status/reference_number/notes columns — capture extras
      // in description as a stop-gap until a migration adds them (B6 deferred).
      const ref = referenceNumber.trim();
      const extraNotes = notes.trim();
      const descParts = [description.trim()];
      if (ref) descParts.push(`Ref: ${ref}`);
      if (extraNotes) descParts.push(extraNotes);
      await onSave({
        transaction_date: transactionDate,
        amount,
        transaction_type: type,
        description: descParts.join(' | '),
        category_id: categoryId || null,
        bank_account_id: bankAccountId || null,
      });
      handleClose();
    } catch (error) {
      logger.error('Error saving transaction:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTransactionDate(new Date().toISOString().split('T')[0]);
    setAmount(0);
    setType('income');
    setDescription('');
    setReferenceNumber('');
    setCategoryId('');
    setBankAccountId('');
    setNotes('');
    setAmountError(null);
    setDescriptionError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Transaction" subtitle="Enter the transaction details to record it." icon={ArrowLeftRight} titleSize="sm" size="md" showClose closeOnBackdrop={false} initialFocusRef={firstFieldRef}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setType('income')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              type === 'income'
                ? 'bg-success text-success-foreground shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Income
          </button>
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              type === 'expense'
                ? 'bg-danger text-danger-foreground shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            Expense
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Input
            ref={firstFieldRef}
            label="Date"
            floatingLabel
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            required
          />

          <Input
            label="Amount"
            floatingLabel
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => {
              setAmount(parseFloat(e.target.value) || 0);
              setAmountError(null);
            }}
            required
            error={amountError || undefined}
          />
        </div>

        <Textarea
          label="Description"
          floatingLabel
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setDescriptionError(null);
          }}
          rows={2}
          className="resize-none"
          placeholder="Transaction description..."
          required
          error={descriptionError || undefined}
        />

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <SearchableSelect
            label="Category"
            floatingLabel
            shrinkDefaultValue
            usePortal
            value={categoryId}
            onChange={(value) => setCategoryId(value)}
            options={[{ id: '', name: 'Not specified' }, ...categories.map((cat) => ({ id: cat.id, name: cat.name }))]}
            placeholder="Not specified"
          />

          <SearchableSelect
            label="Bank Account"
            floatingLabel
            shrinkDefaultValue
            usePortal
            value={bankAccountId}
            onChange={(value) => setBankAccountId(value)}
            options={[{ id: '', name: 'No Bank Account' }, ...bankAccounts.map((account) => ({ id: account.id, name: `${account.account_name} (${account.account_type})` }))]}
            placeholder="No Bank Account"
          />
        </div>

        <Input
          label="Reference Number"
          floatingLabel
          type="text"
          value={referenceNumber}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="e.g., Check #, Receipt #"
        />

        <Textarea
          label="Notes (Optional)"
          floatingLabel
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="resize-none"
          placeholder="Additional notes..."
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting || amount <= 0}
            className="text-xs"
            style={{ backgroundColor: type === 'income' ? '#10b981' : '#ef4444' }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Transaction'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
