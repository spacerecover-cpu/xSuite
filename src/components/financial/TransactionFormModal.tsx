import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { supabase } from '../../lib/supabaseClient';
import { getTransactionCategories, Transaction } from '../../lib/transactionsService';
import {
  DollarSign,
  Calendar,
  Tag,
  FileText,
  TrendingUp,
  TrendingDown,
  Save,
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
    <Modal isOpen={isOpen} onClose={handleClose} title="New Transaction" size="md" closeOnBackdrop={false} initialFocusRef={firstFieldRef}>
      <form onSubmit={handleSubmit} className="space-y-6">
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                ref={firstFieldRef}
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Amount
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => {
                  setAmount(parseFloat(e.target.value) || 0);
                  setAmountError(null);
                }}
                className="pl-10"
                required
              />
            </div>
            {amountError && (
              <p className="mt-1 text-sm text-danger">{amountError}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="transaction-description" className="block text-sm font-medium text-slate-700 mb-1">
            Description
          </label>
          <div className="relative">
            <FileText className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
            <textarea
              id="transaction-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescriptionError(null);
              }}
              rows={2}
              className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="Transaction description..."
              required
            />
          </div>
          {descriptionError && (
            <p className="mt-1 text-sm text-danger">{descriptionError}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="transaction-category" className="block text-sm font-medium text-slate-700 mb-1">
              Category
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <select
                id="transaction-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="transaction-bank-account" className="block text-sm font-medium text-slate-700 mb-1">
              Bank Account
            </label>
            <select
              id="transaction-bank-account"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">Select Account</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name} ({account.account_type})
                </option>
              ))}
            </select>
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
            placeholder="e.g., Check #, Receipt #"
          />
        </div>

        <div>
          <label htmlFor="transaction-notes" className="block text-sm font-medium text-slate-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            id="transaction-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Additional notes..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || amount <= 0}
            className="flex items-center gap-2"
            style={{ backgroundColor: type === 'income' ? '#10b981' : '#ef4444' }}
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Save Transaction'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
