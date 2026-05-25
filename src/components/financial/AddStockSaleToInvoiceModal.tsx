import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Package, CheckSquare, Square } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { getStockSales, addSaleToInvoice } from '../../lib/stockService';
import { formatDate } from '../../lib/format';
import { useCurrency } from '../../hooks/useCurrency';
import { useToast } from '../../hooks/useToast';

interface AddStockSaleToInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  customerId: string;
  onSuccess: () => void;
}

export const AddStockSaleToInvoiceModal: React.FC<AddStockSaleToInvoiceModalProps> = ({
  isOpen,
  onClose,
  invoiceId,
  customerId,
  onSuccess,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: pendingSales = [], isLoading } = useQuery({
    queryKey: ['stock-sales-pending', customerId],
    queryFn: () => getStockSales({ customer_id: customerId, status: 'pending' }),
    enabled: isOpen && !!customerId,
    // NOTE: stock_sales has no invoice_id column in v1.0.0 — addSaleToInvoice throws (see stockService.ts).
    // Until B8 wires sale↔invoice linkage via invoice_line_items, list all pending sales.
    select: (data) => data,
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      for (const saleId of Array.from(selected)) {
        await addSaleToInvoice(saleId, invoiceId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['stock-sales-pending', customerId] });
      toast.success(`${selected.size} sale${selected.size !== 1 ? 's' : ''} linked to invoice`);
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to link sales to invoice');
    },
  });

  const toggleSale = (saleId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) next.delete(saleId);
      else next.add(saleId);
      return next;
    });
  };

  const selectedTotal = pendingSales
    .filter((s) => selected.has(s.id))
    .reduce((sum, s) => sum + (s.total_amount ?? 0), 0);

  const handleClose = () => {
    setSelected(new Set());
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Stock Sales to Invoice" size="lg">
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : pendingSales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Package className="w-12 h-12 mb-3" />
            <p className="text-sm font-medium">No pending sales for this customer</p>
            <p className="text-xs mt-1">Only unpaid sales without an invoice will appear here</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Select pending device sales to add to this invoice. Linked sales will be marked as payment pending via invoice.
            </p>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {pendingSales.map((sale) => {
                const isSelected = selected.has(sale.id);
                const itemNames = sale.stock_sale_items
                  ?.map((i) => i.stock_items?.name ?? 'Item')
                  .join(', ');
                return (
                  <div
                    key={sale.id}
                    onClick={() => toggleSale(sale.id)}
                    className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-info-muted' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex-shrink-0 text-primary">
                      {isSelected
                        ? <CheckSquare className="w-5 h-5" />
                        : <Square className="w-5 h-5 text-slate-300" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {sale.sale_number}
                        </span>
                        <Badge variant="warning" size="sm">Pending</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDate(sale.sale_date ?? sale.created_at)}
                        {itemNames && ` — ${itemNames}`}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="font-semibold text-slate-900">{formatCurrency(sale.total_amount ?? 0)}</p>
                      <p className="text-xs text-slate-500">
                        {sale.stock_sale_items?.length ?? 0} item{(sale.stock_sale_items?.length ?? 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {selected.size > 0 && (
              <div className="flex items-center justify-between p-3 bg-info-muted rounded-lg border border-info/30">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-info">
                    {selected.size} sale{selected.size !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <span className="text-sm font-bold text-info">{formatCurrency(selectedTotal)}</span>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => linkMutation.mutate()}
            disabled={selected.size === 0 || linkMutation.isPending}
          >
            {linkMutation.isPending
              ? 'Linking...'
              : `Link ${selected.size > 0 ? `${selected.size} Sale${selected.size !== 1 ? 's' : ''}` : 'Sales'} to Invoice`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
