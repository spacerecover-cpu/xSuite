import React, { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { bulkUpdatePrices, type StockItemWithCategory } from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';
import { useCurrency } from '../../hooks/useCurrency';

interface Props {
  selectedItems: StockItemWithCategory[];
  onClose: () => void;
}

export const BulkPriceUpdateModal: React.FC<Props> = ({ selectedItems, onClose }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { formatCurrency } = useCurrency();

  const priceFieldId = useId();
  const directionFieldId = useId();
  const amountFieldId = useId();

  const [updateType, setUpdateType] = useState<'percentage' | 'fixed'>('percentage');
  const [priceField, setPriceField] = useState<'selling' | 'cost' | 'both'>('selling');
  const [value, setValue] = useState<number>(0);
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');

  const mutation = useMutation({
    mutationFn: () => {
      const updates = selectedItems.map((item) => {
        const result: { id: string; costPrice?: number; sellingPrice?: number } = { id: item.id };

        const applyChange = (original: number | null) => {
          if (original === null) return original ?? 0;
          const delta = updateType === 'percentage'
            ? (original * value) / 100
            : value;
          return direction === 'increase' ? original + delta : Math.max(0, original - delta);
        };

        if (priceField === 'cost' || priceField === 'both') {
          result.costPrice = applyChange(item.cost_price);
        }
        if (priceField === 'selling' || priceField === 'both') {
          result.sellingPrice = applyChange(item.selling_price);
        }
        return result;
      });
      return bulkUpdatePrices(updates);
    },
    onSuccess: (count) => {
      toast.success(`Updated prices for ${count} item${count !== 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: stockKeys.items() });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to update prices'),
  });

  const getPreviewPrice = (item: StockItemWithCategory) => {
    const original = priceField === 'cost' ? item.cost_price : item.selling_price;
    if (original === null) return null;
    const delta = updateType === 'percentage' ? (original * value) / 100 : value;
    return direction === 'increase' ? original + delta : Math.max(0, original - delta);
  };

  return (
    <Modal isOpen onClose={onClose} title={`Bulk Price Update — ${selectedItems.length} items`} size="md">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={priceFieldId} className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Price Field
            </label>
            <select
              id={priceFieldId}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              value={priceField}
              onChange={(e) => setPriceField(e.target.value as typeof priceField)}
            >
              <option value="selling">Selling Price</option>
              <option value="cost">Cost Price</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label htmlFor={directionFieldId} className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Direction
            </label>
            <select
              id={directionFieldId}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              value={direction}
              onChange={(e) => setDirection(e.target.value as typeof direction)}
            >
              <option value="increase">Increase</option>
              <option value="decrease">Decrease</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Update Type
            </label>
            <div className="flex rounded-lg border border-slate-300 overflow-hidden">
              {(['percentage', 'fixed'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setUpdateType(type)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    updateType === type
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {type === 'percentage' ? '%' : 'Fixed'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor={amountFieldId} className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              {updateType === 'percentage' ? 'Percentage (%)' : 'Amount'}
            </label>
            <input
              id={amountFieldId}
              type="number"
              min={0}
              step={updateType === 'percentage' ? 0.1 : 0.001}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={updateType === 'percentage' ? 'e.g. 10' : 'e.g. 5.000'}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Preview</p>
          <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {selectedItems.slice(0, 8).map((item) => {
              const preview = getPreviewPrice(item);
              const original = priceField === 'cost' ? item.cost_price : item.selling_price;
              return (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-slate-700 truncate flex-1 mr-2">{item.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-slate-400">{original != null ? formatCurrency(original) : '—'}</span>
                    <TrendingUp className="w-3.5 h-3.5 text-slate-300" />
                    <span className={`font-semibold ${direction === 'increase' ? 'text-success' : 'text-danger'}`}>
                      {preview != null ? formatCurrency(preview) : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
            {selectedItems.length > 8 && (
              <div className="px-3 py-2 text-xs text-slate-400 text-center">
                +{selectedItems.length - 8} more items
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || value === 0}
            className="gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            {mutation.isPending ? 'Updating...' : `Update ${selectedItems.length} Items`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
