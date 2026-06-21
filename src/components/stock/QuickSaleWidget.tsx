import React, { useState } from 'react';
import { ShoppingCart, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getSalesByCase, type StockSaleWithDetails } from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';
import { StockSaleModal } from './StockSaleModal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useCurrency } from '../../hooks/useCurrency';

interface QuickSaleWidgetProps {
  caseId: string;
  customerId: string;
  onSaleCreated: () => void;
}

const paymentStatusConfig: Record<
  string,
  { label: string; variant: 'warning' | 'success' | 'info' | 'secondary' }
> = {
  pending: { label: 'Pending', variant: 'warning' },
  paid: { label: 'Paid', variant: 'success' },
  partial: { label: 'Partial', variant: 'info' },
  refunded: { label: 'Refunded', variant: 'secondary' },
};

const getSaleItemNames = (sale: StockSaleWithDetails): string => {
  if (!sale.stock_sale_items || sale.stock_sale_items.length === 0) return 'No items';
  return sale.stock_sale_items
    .map((i) => i.stock_items?.name ?? 'Unknown')
    .join(', ');
};

export const QuickSaleWidget: React.FC<QuickSaleWidgetProps> = ({
  caseId,
  customerId,
  onSaleCreated,
}) => {
  const { formatCurrency } = useCurrency();
  const formatAmount = (value: number | null): string =>
    value === null || value === undefined ? '—' : formatCurrency(value);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: sales = [], refetch } = useQuery({
    queryKey: stockKeys.salesByCase(caseId),
    queryFn: () => getSalesByCase(caseId),
    enabled: !!caseId,
  });

  const handleSaleCreated = (_saleId: string) => {
    refetch();
    onSaleCreated();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-slate-900">Backup Devices</h3>
          {sales.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-info-muted text-info text-xs font-bold">
              {sales.length}
            </span>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setModalOpen(true)}
          className="gap-1.5"
        >
          <ShoppingCart className="w-4 h-4" />
          Sell Backup Device
        </Button>
      </div>

      <div className="p-4">
        {sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
            <Package className="w-8 h-8" />
            <p className="text-sm">No devices sold for this case yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sales.map((sale) => {
              const statusCfg =
                paymentStatusConfig[sale.status ?? 'pending'] ??
                paymentStatusConfig['pending'];

              return (
                <div
                  key={sale.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 rounded-md border border-slate-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500 font-medium">
                        {sale.sale_number ?? '—'}
                      </span>
                      <Badge variant={statusCfg.variant} size="sm">
                        {statusCfg.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-700 mt-0.5 truncate">
                      {getSaleItemNames(sale)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatAmount(sale.total_amount)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <StockSaleModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        caseId={caseId}
        customerId={customerId}
        onSuccess={handleSaleCreated}
      />
    </div>
  );
};
