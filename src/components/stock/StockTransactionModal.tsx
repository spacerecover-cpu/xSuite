import React, { useState, useEffect } from 'react';
import { PackagePlus, PackageMinus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  recordStockReceipt,
  recordStockUsage,
  StockItemWithCategory,
} from '../../lib/stockService';
import { useToast } from '../../hooks/useToast';

interface StockTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: StockItemWithCategory | null;
  mode: 'receipt' | 'usage';
  caseId?: string;
  onSuccess: () => void;
}

interface FormState {
  quantity: string;
  notes: string;
  costPerUnit: string;
  serialNumbers: string;
}

const defaultForm: FormState = {
  quantity: '',
  notes: '',
  costPerUnit: '',
  serialNumbers: '',
};

export function StockTransactionModal({
  isOpen,
  onClose,
  item,
  mode,
  caseId,
  onSuccess,
}: StockTransactionModalProps) {
  const { success, error: showError } = useToast();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (isOpen) {
      setForm(defaultForm);
      setErrors({});
    }
  }, [isOpen]);

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    const qty = Number(form.quantity);
    if (!form.quantity || isNaN(qty) || qty <= 0) {
      next.quantity = 'Quantity must be a positive number';
    }
    if (mode === 'usage' && item) {
      const itemAvailable = (item.current_quantity ?? 0) - (item.quantity_reserved ?? 0);
      if (qty > itemAvailable) {
        next.quantity = `Only ${itemAvailable} units available`;
      }
    }
    if (
      mode === 'receipt' &&
      form.costPerUnit !== '' &&
      (isNaN(Number(form.costPerUnit)) || Number(form.costPerUnit) < 0)
    ) {
      next.costPerUnit = 'Cost must be a valid non-negative number';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !validate()) return;

    setSubmitting(true);
    try {
      const qty = Number(form.quantity);

      if (mode === 'receipt') {
        const serialList = form.serialNumbers
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        await recordStockReceipt(item.id, qty, {
          cost: form.costPerUnit !== '' ? Number(form.costPerUnit) : undefined,
          serialNumbers: serialList.length > 0 ? serialList : undefined,
          notes: form.notes || undefined,
        });
        success(`Received ${qty} unit${qty !== 1 ? 's' : ''} of ${item.name}`);
      } else {
        if (!caseId) {
          showError('A case ID is required to record stock usage');
          setSubmitting(false);
          return;
        }
        await recordStockUsage(item.id, qty, caseId, form.notes || undefined);
        success(`Recorded usage of ${qty} unit${qty !== 1 ? 's' : ''} of ${item.name}`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const available =
    item ? (item.current_quantity ?? 0) - (item.quantity_reserved ?? 0) : 0;

  const titleText = mode === 'receipt' ? 'Receive Stock' : 'Record Usage';
  const TitleIcon = mode === 'receipt' ? PackagePlus : PackageMinus;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={titleText}
      icon={TitleIcon}
      size="sm"
    >
      {item && (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-sm font-semibold text-slate-800">{item.name}</p>
          {item.brand && (
            <p className="text-xs text-slate-500 mt-0.5">{item.brand}</p>
          )}
          {item.sku && (
            <p className="text-xs text-slate-400 font-mono mt-0.5">{item.sku}</p>
          )}
          <div className="flex gap-4 mt-2 text-xs text-slate-600">
            <span>In stock: <strong>{item.current_quantity ?? 0}</strong></span>
            <span>Reserved: <strong>{item.quantity_reserved ?? 0}</strong></span>
            {mode === 'usage' && (
              <span>Available: <strong>{available}</strong></span>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Quantity"
          type="number"
          min={1}
          step={1}
          value={form.quantity}
          onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
          error={errors.quantity}
          required
          placeholder="0"
        />

        {mode === 'receipt' && (
          <>
            <Input
              label="Cost Per Unit"
              type="number"
              min={0}
              step="0.001"
              value={form.costPerUnit}
              onChange={(e) =>
                setForm((p) => ({ ...p, costPerUnit: e.target.value }))
              }
              error={errors.costPerUnit}
              placeholder={
                item?.cost_price != null
                  ? String(item.cost_price)
                  : 'Leave blank to use existing cost'
              }
            />

            <div>
              <label htmlFor="stock-txn-serial-numbers" className="block text-sm font-medium text-slate-700 mb-1">
                Serial Numbers
                <span className="text-slate-400 font-normal ml-1">(comma-separated, optional)</span>
              </label>
              <textarea
                id="stock-txn-serial-numbers"
                rows={3}
                value={form.serialNumbers}
                onChange={(e) =>
                  setForm((p) => ({ ...p, serialNumbers: e.target.value }))
                }
                placeholder="SN001, SN002, SN003"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </>
        )}

        <div>
          <label htmlFor="stock-txn-notes" className="block text-sm font-medium text-slate-700 mb-1">
            Notes
            <span className="text-slate-400 font-normal ml-1">(optional)</span>
          </label>
          <textarea
            id="stock-txn-notes"
            rows={3}
            value={form.notes}
            onChange={(e) =>
              setForm((p) => ({ ...p, notes: e.target.value }))
            }
            placeholder={
              mode === 'receipt'
                ? 'Purchase order, supplier info, etc.'
                : 'Reason for usage, job details, etc.'
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={submitting || !item}
          >
            {submitting
              ? 'Saving...'
              : mode === 'receipt'
              ? 'Confirm Receipt'
              : 'Confirm Usage'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
