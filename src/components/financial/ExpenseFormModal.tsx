import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { UsageLimitGuard } from '../shared/UsageLimitGuard';
import { supabase } from '../../lib/supabaseClient';
import { getExpenseCategories, Expense } from '../../lib/expensesService';
import {
  DollarSign,
  Calendar,
  Tag,
  FileText,
  Briefcase,
  Percent,
  Hash,
  Save,
  Upload,
} from 'lucide-react';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/useToast';
import { useCurrency } from '../../hooks/useCurrency';

interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Omit<Expense, 'id' | 'expense_number' | 'created_at' | 'updated_at'>) => Promise<void>;
  initialData?: Partial<Expense> | null;
  preselectedCaseId?: string;
}

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  preselectedCaseId,
}) => {
  const toast = useToast();
  const { currencyFormat } = useCurrency();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [caseId, setCaseId] = useState<string>(preselectedCaseId || '');
  const [notes, setNotes] = useState('');
  const [taxAmount, setTaxAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('');
  const [isBillable, setIsBillable] = useState<boolean>(false);
  const [reference, setReference] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['expense_categories'],
    queryFn: getExpenseCategories,
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases_for_expense'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('id, case_no, title')
        .in('status', ['Open', 'In Progress'])
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        const { data: allCases } = await supabase
          .from('cases')
          .select('id, case_no, title')
          .order('created_at', { ascending: false })
          .limit(100);
        return allCases || [];
      }
      return data || [];
    },
  });

  const { data: currencyCodes = [] } = useQuery({
    queryKey: ['active_currency_codes'],
    queryFn: async () => {
      const { data } = await supabase
        .from('master_currency_codes')
        .select('code, name')
        .eq('is_active', true)
        .order('code');
      return data || [];
    },
  });

  useEffect(() => {
    if (initialData) {
      // expense_date is a timestamptz, so it arrives as a full ISO string; an
      // <input type="date"> only accepts YYYY-MM-DD, so slice the date portion or
      // the saved date renders blank on edit.
      setExpenseDate(
        initialData.expense_date
          ? initialData.expense_date.slice(0, 10)
          : new Date().toISOString().split('T')[0],
      );
      setAmount(initialData.amount || 0);
      setDescription(initialData.description || '');
      setVendorName(initialData.vendor || '');
      setCategoryId(initialData.category_id || '');
      setCaseId(initialData.case_id || preselectedCaseId || '');
      setNotes(initialData.notes || '');
      setTaxAmount(initialData.tax_amount || 0);
      setCurrency(initialData.currency || currencyFormat.currencyCode || '');
      setIsBillable(initialData.is_billable ?? false);
      setReference(initialData.reference || '');
    } else {
      resetForm();
    }
  }, [initialData, preselectedCaseId, currencyFormat.currencyCode]);

  const resetForm = () => {
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setAmount(0);
    setDescription('');
    setVendorName('');
    setCategoryId('');
    setCaseId(preselectedCaseId || '');
    setNotes('');
    setTaxAmount(0);
    setCurrency(currencyFormat.currencyCode || '');
    setIsBillable(false);
    setReference('');
  };

  const handleSubmit = async (e: React.FormEvent, submitForApproval: boolean = false) => {
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
      await onSave({
        expense_date: expenseDate,
        amount,
        description: description.trim(),
        vendor: vendorName.trim() || undefined,
        category_id: categoryId || null,
        case_id: caseId || null,
        status: submitForApproval ? 'pending' : 'draft',
        notes: notes.trim() || undefined,
        tax_amount: taxAmount || 0,
        currency: currency || undefined,
        is_billable: isBillable,
        reference: reference.trim() || undefined,
      });
      handleClose();
    } catch (error) {
      logger.error('Error saving expense:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={initialData?.id ? 'Edit Expense' : 'New Expense'}
      size="lg"
      closeOnBackdrop={false}
      initialFocusRef={firstFieldRef}
    >
      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Expense Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                ref={firstFieldRef}
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="expense-currency" className="block text-sm font-medium text-slate-700 mb-1">
              Currency
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <select
                id="expense-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              >
                {currency && !currencyCodes.some((c) => c.code === currency) && (
                  <option value={currency}>{currency}</option>
                )}
                {currencyCodes.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}{c.name ? ` — ${c.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tax Amount
            </label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={taxAmount}
                onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
                className="pl-10"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="expense-description" className="block text-sm font-medium text-slate-700 mb-1">
            Description
          </label>
          <div className="relative">
            <FileText className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
            <textarea
              id="expense-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescriptionError(null);
              }}
              rows={2}
              className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="What was this expense for?"
              required
            />
          </div>
          {descriptionError && (
            <p className="mt-1 text-sm text-danger">{descriptionError}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Vendor / Supplier
            </label>
            <Input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g., Office Supplies Inc."
            />
          </div>

          <div>
            <label htmlFor="expense-category" className="block text-sm font-medium text-slate-700 mb-1">
              Category
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <select
                id="expense-category"
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
        </div>

        <div>
          <label htmlFor="expense-case" className="block text-sm font-medium text-slate-700 mb-1">
            Link to Case (Optional)
          </label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
            <select
              id="expense-case"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">No Case</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.case_no} - {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="expense-reference" className="block text-sm font-medium text-slate-700 mb-1">
              Reference (Optional)
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                id="expense-reference"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="pl-10"
                placeholder="Receipt / invoice no."
              />
            </div>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              Billable to linked case
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="expense-notes" className="block text-sm font-medium text-slate-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            id="expense-notes"
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
          {/* Only gate the create path. When editing an existing expense
              (initialData provided) the limit doesn't apply — we're not
              consuming a new slot. */}
          {initialData ? (
            <>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || amount <= 0}
                className="flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save as Draft
              </Button>
              <Button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={isSubmitting || amount <= 0}
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {isSubmitting ? 'Saving...' : 'Submit for Approval'}
              </Button>
            </>
          ) : (
            <UsageLimitGuard limitKey="max_expenses_per_month" showToast={true}>
              <div className="flex gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || amount <= 0}
                  className="flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save as Draft
                </Button>
                <Button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={isSubmitting || amount <= 0}
                  className="flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {isSubmitting ? 'Saving...' : 'Submit for Approval'}
                </Button>
              </div>
            </UsageLimitGuard>
          )}
        </div>
      </form>
    </Modal>
  );
};
