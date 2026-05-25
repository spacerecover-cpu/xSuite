import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PackageCheck, Plus, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { getStockItems, receiveStockFromPO } from '../../lib/stockService';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';

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
  newSerial: string;
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
  const { profile } = useAuth();

  const [rows, setRows] = useState<ReceiveRow[]>(() =>
    purchaseOrderItems.map((item) => ({
      poItemId: item.id,
      description: item.description,
      orderedQty: item.quantity,
      stockItemId: item.stock_item_id ?? '',
      quantity: String(item.quantity),
      unitCost: String(item.unit_price ?? ''),
      serialNumbers: [],
      newSerial: '',
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

  const addSerial = (index: number) => {
    const row = rows[index];
    const serial = row.newSerial.trim();
    if (!serial || row.serialNumbers.includes(serial)) return;
    updateRow(index, {
      serialNumbers: [...row.serialNumbers, serial],
      newSerial: '',
    });
  };

  const removeSerial = (rowIndex: number, serial: string) => {
    updateRow(rowIndex, {
      serialNumbers: rows[rowIndex].serialNumbers.filter((s) => s !== serial),
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
        receivedBy: profile?.id ?? '',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
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
    <Modal isOpen={isOpen} onClose={onClose} title="Receive Stock from Purchase Order" size="xl">
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
                  Serial Numbers <span className="text-slate-400">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    value={row.newSerial}
                    onChange={(e) => updateRow(index, { newSerial: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSerial(index))}
                    placeholder="Enter serial number and press Enter"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => addSerial(index)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {row.serialNumbers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {row.serialNumbers.map((sn) => (
                      <span
                        key={sn}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-full"
                      >
                        {sn}
                        <button
                          type="button"
                          onClick={() => removeSerial(index, sn)}
                          className="text-slate-400 hover:text-danger transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <Button variant="ghost" onClick={onClose}>
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
