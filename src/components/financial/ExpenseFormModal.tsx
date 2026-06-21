import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { UsageLimitGuard } from '../shared/UsageLimitGuard';
import { supabase } from '../../lib/supabaseClient';
import { getExpenseCategories, Expense } from '../../lib/expensesService';
import { getPaymentMethods } from '../../lib/paymentsService';
import {
  DollarSign,
  Calendar,
  Tag,
  FileText,
  Briefcase,
  Save,
  Upload,
} from 'lucide-react';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/useToast';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [caseId, setCaseId] = useState<string>(preselectedCaseId || '');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['expense_categories'],
    queryFn: getExpenseCategories,
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment_methods'],
    queryFn: getPaymentMethods,
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

  useEffect(() => {
    if (initialData) {
      setExpenseDate(initialData.expense_date || new Date().toISOString().split('T')[0]);
      setAmount(initialData.amount || 0);
      setDescription(initialData.description || '');
      setVendorName(initialData.vendor || '');
      setCategoryId(initialData.category_id || '');
      setCaseId(initialData.case_id || preselectedCaseId || '');
      setPaymentMethodId(initialData.payment_method_id || '');
      setNotes(initialData.notes || '');
    } else {
      resetForm();
    }
  }, [initialData, preselectedCaseId]);

  const resetForm = () => {
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setAmount(0);
    setDescription('');
    setVendorName('');
    setCategoryId('');
    setCaseId(preselectedCaseId || '');
    setPaymentMethodId('');
    setNotes('');
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

        <div className="grid grid-cols-2 gap-4">
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

          <div>
            <label htmlFor="expense-payment-method" className="block text-sm font-medium text-slate-700 mb-1">
              Payment Method
            </label>
            <select
              id="expense-payment-method"
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">Select Method</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
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
