import React, { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { bulkAdjustQuantities, type StockItemWithCategory } from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';

interface AdjustmentLine {
  id: string;
  name: string;
  currentQty: number;
  newQty: number;
}

interface Props {
  selectedItems: StockItemWithCategory[];
  onClose: () => void;
}

export const BulkAdjustmentModal: React.FC<Props> = ({ selectedItems, onClose }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const reasonFieldId = useId();
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<AdjustmentLine[]>(
    selectedItems.map((item) => ({
      id: item.id,
      name: item.name,
      currentQty: item.current_quantity ?? 0,
      newQty: item.current_quantity ?? 0,
    }))
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (!reason.trim()) throw new Error('Please provide a reason for the adjustment');
      const changed = lines.filter((l) => l.newQty !== l.currentQty);
      if (changed.length === 0) throw new Error('No quantities have been changed');
      return bulkAdjustQuantities(changed.map((l) => ({ id: l.id, newQuantity: l.newQty, reason })));
    },
    onSuccess: (count) => {
      toast.success(`Adjusted quantities for ${count} item${count !== 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: stockKeys.items() });
      queryClient.invalidateQueries({ queryKey: stockKeys.stats() });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to adjust quantities'),
  });

  const updateQty = (idx: number, newQty: number) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, newQty: Math.max(0, newQty) } : l)));
  };

  const changedCount = lines.filter((l) => l.newQty !== l.currentQty).length;

  return (
    <Modal isOpen onClose={onClose} title={`Bulk Quantity Adjustment — ${selectedItems.length} items`} size="md">
      <div className="space-y-5">
        <div>
          <label htmlFor={reasonFieldId} className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Adjustment Reason <span className="text-danger">*</span>
          </label>
          <select
            id={reasonFieldId}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Select reason...</option>
            <option value="Physical count correction">Physical count correction</option>
            <option value="Damaged items write-off">Damaged items write-off</option>
            <option value="Expired items">Expired items</option>
            <option value="Theft or shrinkage">Theft or shrinkage</option>
            <option value="Supplier credit">Supplier credit</option>
            <option value="System correction">System correction</option>
          </select>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
            Adjust Quantities
          </p>
          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Item</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">Current</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">New Qty</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, idx) => {
                  const change = line.newQty - line.currentQty;
                  return (
                    <tr key={line.id} className={change !== 0 ? 'bg-info-muted/30' : ''}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900 text-xs">{line.name}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                        {line.currentQty}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="number"
                          min={0}
                          value={line.newQty}
                          onChange={(e) => updateQty(idx, Number(e.target.value))}
                          className="w-20 text-center px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {change !== 0 ? (
                          <span className={`font-semibold text-sm font-mono ${change > 0 ? 'text-success' : 'text-danger'}`}>
                            {change > 0 ? '+' : ''}{change}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {changedCount > 0 && (
            <p className="text-xs text-info mt-1.5 font-medium">
              {changedCount} item{changedCount !== 1 ? 's' : ''} will be adjusted
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || changedCount === 0 || !reason}
            className="gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {mutation.isPending ? 'Adjusting...' : `Apply ${changedCount} Adjustment${changedCount !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
