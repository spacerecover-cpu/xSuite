import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, AlertCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { createStockReturn, type StockSaleWithDetails } from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';
import { useCurrency } from '../../hooks/useCurrency';

interface ReturnLineState {
  sale_item_id: string;
  stock_item_id: string;
  name: string;
  sku: string | null;
  maxQuantity: number;
  quantity: number;
  serial_number: string | null;
  condition: string;
  restock: boolean;
  refund_amount: number;
  include: boolean;
}

interface Props {
  sale: StockSaleWithDetails;
  onClose: () => void;
}

const CONDITIONS = ['good', 'damaged', 'defective', 'opened'];
const REASONS = [
  { value: 'defective', label: 'Defective' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'customer_changed_mind', label: 'Customer Changed Mind' },
  { value: 'warranty_claim', label: 'Warranty Claim' },
  { value: 'other', label: 'Other' },
];
const REFUND_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'store_credit', label: 'Store Credit' },
  { value: 'replacement', label: 'Replacement' },
];

export const StockReturnModal: React.FC<Props> = ({ sale, onClose }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { formatCurrency } = useCurrency();

  const [reason, setReason] = useState('defective');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<ReturnLineState[]>(
    (sale.stock_sale_items ?? []).map((item) => ({
      sale_item_id: item.id,
      stock_item_id: item.item_id,
      name: item.stock_items?.name ?? 'Unknown Item',
      sku: item.stock_items?.sku ?? null,
      maxQuantity: item.quantity,
      quantity: item.quantity,
      serial_number: null,
      condition: 'good',
      restock: true,
      refund_amount: item.unit_price * item.quantity,
      include: true,
    }))
  );

  const mutation = useMutation({
    mutationFn: () => {
      const selectedItems = lines.filter((l) => l.include);
      if (selectedItems.length === 0) throw new Error('Select at least one item to return');
      return createStockReturn({
        sale_id: sale.id,
        customer_id: sale.customer_id!,
        reason,
        refund_method: refundMethod,
        notes: notes || null,
        items: selectedItems.map((l) => ({
          sale_item_id: l.sale_item_id,
          stock_item_id: l.stock_item_id,
          quantity: l.quantity,
          serial_number: l.serial_number,
          condition: l.condition,
          restock: l.restock,
          refund_amount: l.refund_amount,
        })),
      });
    },
    onSuccess: () => {
      toast.success('Return request created successfully');
      queryClient.invalidateQueries({ queryKey: stockKeys.returns() });
      queryClient.invalidateQueries({ queryKey: stockKeys.sale(sale.id) });
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to create return');
    },
  });

  const updateLine = (idx: number, updates: Partial<ReturnLineState>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...updates } : l)));
  };

  const totalRefund = lines
    .filter((l) => l.include)
    .reduce((sum, l) => sum + l.refund_amount, 0);

  return (
    <Modal isOpen onClose={onClose} title="Create Return Request" size="lg">
      <div className="space-y-5">
        <div className="bg-warning-muted border border-warning/30 rounded-lg px-4 py-3 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
          <p className="text-sm text-warning">
            This creates a return request for <strong>{sale.sale_number}</strong>. Staff will need to approve and complete the return to restock items.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Return Reason
            </label>
            <select
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Refund Method
            </label>
            <select
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value)}
            >
              {REFUND_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Return Items
          </label>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Include</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Item</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">Qty</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Condition</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">Restock</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, idx) => (
                  <tr key={line.sale_item_id} className={!line.include ? 'opacity-40' : ''}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={line.include}
                        onChange={(e) => updateLine(idx, { include: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-primary"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-900">{line.name}</p>
                      {line.sku && (
                        <p className="text-xs font-mono text-slate-500">{line.sku}</p>
                      )}
                      {line.serial_number && (
                        <p className="text-xs text-slate-400">S/N: {line.serial_number}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min={1}
                        max={line.maxQuantity}
                        value={line.quantity}
                        disabled={!line.include}
                        onChange={(e) => updateLine(idx, { quantity: Math.min(line.maxQuantity, Math.max(1, Number(e.target.value))) })}
                        className="w-16 text-center px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={line.condition}
                        disabled={!line.include}
                        onChange={(e) => updateLine(idx, { condition: e.target.value })}
                        className="px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-100 capitalize"
                      >
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={line.restock}
                        disabled={!line.include}
                        onChange={(e) => updateLine(idx, { restock: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-primary"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.001}
                        value={line.refund_amount}
                        disabled={!line.include}
                        onChange={(e) => updateLine(idx, { refund_amount: Number(e.target.value) })}
                        className="w-24 text-right px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-2">
            <span className="text-sm text-slate-600">
              Total Refund:{' '}
              <strong className="text-slate-900">{formatCurrency(totalRefund)}</strong>
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Notes (optional)
          </label>
          <textarea
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            rows={2}
            placeholder="Additional notes about this return..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !lines.some((l) => l.include)}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {mutation.isPending ? 'Creating...' : 'Create Return Request'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
