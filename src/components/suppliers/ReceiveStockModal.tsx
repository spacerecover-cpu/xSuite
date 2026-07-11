import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { SerialNumberInput } from '../stock/SerialNumberInput';
import { getStockItems, receiveStockFromPO } from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';
import { useToast } from '../../hooks/useToast';

interface POLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number | null;
  stock_item_id?: string | null;
}

interface ReceiveStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrderId: string;
  purchaseOrderItems: POLineItem[];
  onSuccess: () => void;
}

interface ReceiveRow {
  poItemId: string;
  description: string;
  orderedQty: number;
  stockItemId: string;
  quantity: string;
  unitCost: string;
  serialNumbers: string[];
}

export const ReceiveStockModal: React.FC<ReceiveStockModalProps> = ({
  isOpen,
  onClose,
  purchaseOrderId,
  purchaseOrderItems,
  onSuccess,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<ReceiveRow[]>(() =>
    purchaseOrderItems.map((item) => ({
      poItemId: item.id,
      description: item.description,
      orderedQty: item.quantity,
      stockItemId: item.stock_item_id ?? '',
      quantity: String(item.quantity),
      unitCost: String(item.unit_price ?? ''),
      serialNumbers: [],
    }))
  );

  const { data: stockItems = [] } = useQuery({
    queryKey: ['stock-items-all'],
    queryFn: () => getStockItems(),
    enabled: isOpen,
  });

  const stockOptions = stockItems.map((item) => ({
    id: item.id,
    name: `${item.name}${item.sku ? ` (${item.sku})` : ''}${item.brand ? ` — ${item.brand}` : ''}`,
  }));

  const updateRow = (index: number, updates: Partial<ReceiveRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const validRows = rows.filter((r) => r.stockItemId && Number(r.quantity) > 0);
      if (validRows.length === 0) throw new Error('No valid items to receive');

      await receiveStockFromPO({
        purchaseOrderId,
        items: validRows.map((r) => ({
          poItemId: r.poItemId,
          stockItemId: r.stockItemId,
          quantity: Number(r.quantity),
          unitCost: Number(r.unitCost) || 0,
          serialNumbers: r.serialNumbers.length > 0 ? r.serialNumbers : undefined,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.items() });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', purchaseOrderId] });
      toast.success('Stock received successfully');
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to receive stock');
    },
  });

  const validCount = rows.filter((r) => r.stockItemId && Number(r.quantity) > 0).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receive Stock from Purchase Order" size="xl" closeOnBackdrop={false}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Match each line item to a stock item and confirm quantities received. Items without a linked stock item will be skipped.
        </p>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <div key={row.poItemId} className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{row.description}</p>
                  <p className="text-xs text-slate-500">Ordered: {row.orderedQty}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-3">
                  <SearchableSelect
                    label="Stock Item"
                    required
                    options={stockOptions}
                    value={row.stockItemId}
                    onChange={(val) => updateRow(index, { stockItemId: val })}
                    placeholder="Select or search stock item..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Qty Received</label>
                  <Input
                    type="number"
                    min="0"
                    value={row.quantity}
                    onChange={(e) => updateRow(index, { quantity: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Unit Cost</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unitCost}
                    onChange={(e) => updateRow(index, { unitCost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Serial Numbers <span className="text-slate-400">(optional — cap at received qty)</span>
                </label>
                {/* Centralized SerialNumberInput handles Enter/comma to add,
                    Backspace-on-empty to remove the last chip, and dedup.
                    maxItems prevents over-tagging beyond the qty received. */}
                <SerialNumberInput
                  value={row.serialNumbers}
                  onChange={(serials) => updateRow(index, { serialNumbers: serials })}
                  maxItems={Math.max(0, Number(row.quantity) || 0)}
                  placeholder="Type a serial and press Enter or comma…"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={validCount === 0 || mutation.isPending}
          >
            <PackageCheck className="w-4 h-4 mr-2" />
            {mutation.isPending
              ? 'Receiving...'
              : `Receive ${validCount > 0 ? `${validCount} Item${validCount !== 1 ? 's' : ''}` : 'Stock'}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
