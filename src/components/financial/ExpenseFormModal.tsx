import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { SearchableSelect } from '../ui/SearchableSelect';
import { UsageLimitGuard } from '../shared/UsageLimitGuard';
import { supabase } from '../../lib/supabaseClient';
import { getExpenseCategories, Expense } from '../../lib/expensesService';
import {
  Receipt,
  Save,
  Upload,
  Loader2,
} from 'lucide-react';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/useToast';
import { useCurrency } from '../../hooks/useCurrency';
import { useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { tenantToday } from '../../lib/tenantToday';

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
  const { timezone } = useDateTimeConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expenseDate, setExpenseDate] = useState(() => tenantToday(timezone));
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
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
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
          : tenantToday(timezone),
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
    setExpenseDate(tenantToday(timezone));
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
      subtitle={initialData?.id ? "Update this expense's details." : 'Enter the expense details to record it.'}
      icon={Receipt}
      titleSize="sm"
      size="lg"
      showClose
      closeOnBackdrop={false}
      initialFocusRef={firstFieldRef}
    >
      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Input
            ref={firstFieldRef}
            label="Expense Date"
            floatingLabel
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />

          <div>
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
            />
            {amountError && (
              <p className="mt-1 text-xs text-danger">{amountError}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <SearchableSelect
            label="Currency"
            floatingLabel
            shrinkDefaultValue
            usePortal
            value={currency}
            onChange={(value) => setCurrency(value)}
            options={[
              { id: '', name: 'Not specified' },
              ...(currency && !currencyCodes.some((c) => c.code === currency)
                ? [{ id: currency, name: currency }]
                : []),
              ...currencyCodes.map((c) => ({
                id: c.code,
                name: `${c.code}${c.name ? ` — ${c.name}` : ''}`,
              })),
            ]}
            placeholder="Not specified"
          />

          <Input
            label="Tax Amount"
            floatingLabel
            type="number"
            step="0.01"
            min="0"
            value={taxAmount}
            onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
            placeholder="0.00"
          />
        </div>

        <div>
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
            placeholder="What was this expense for?"
            required
          />
          {descriptionError && (
            <p className="mt-1 text-xs text-danger">{descriptionError}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Input
            label="Vendor / Supplier"
            floatingLabel
            type="text"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="e.g., Office Supplies Inc."
          />

          <SearchableSelect
            label="Category"
            floatingLabel
            shrinkDefaultValue
            usePortal
            value={categoryId}
            onChange={(value) => setCategoryId(value)}
            options={[
              { id: '', name: 'Not specified' },
              ...categories.map((cat) => ({ id: cat.id, name: cat.name })),
            ]}
            placeholder="Not specified"
          />
        </div>

        <SearchableSelect
          label="Link to Case (Optional)"
          floatingLabel
          shrinkDefaultValue
          usePortal
          value={caseId}
          onChange={(value) => setCaseId(value)}
          options={[
            { id: '', name: 'No Case' },
            ...cases.map((c) => ({ id: c.id, name: `${c.case_no} - ${c.title}` })),
          ]}
          placeholder="No Case"
        />

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Input
            label="Reference (Optional)"
            floatingLabel
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Receipt / invoice no."
          />

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
          {/* Only gate the create path. When editing an existing expense
              (initialData provided) the limit doesn't apply — we're not
              consuming a new slot. */}
          {initialData ? (
            <>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting || amount <= 0}
                className="flex items-center gap-2 text-xs"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-4 h-4" />}
                Save as Draft
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={(e) => handleSubmit(e, true)}
                disabled={isSubmitting || amount <= 0}
                className="flex items-center gap-2 text-xs"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isSubmitting ? 'Saving...' : 'Submit for Approval'}
              </Button>
            </>
          ) : (
            <UsageLimitGuard limitKey="max_expenses_per_month" showToast={true}>
              <div className="flex gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting || amount <= 0}
                  className="flex items-center gap-2 text-xs"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save as Draft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={isSubmitting || amount <= 0}
                  className="flex items-center gap-2 text-xs"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-4 h-4" />}
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
