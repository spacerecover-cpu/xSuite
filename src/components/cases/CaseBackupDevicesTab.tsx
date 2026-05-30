import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, ShoppingCart, Wrench, ExternalLink, HardDrive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { SaleableItemsGrid } from '../stock/SaleableItemsGrid';
import { StockSaleModal } from '../stock/StockSaleModal';
import { StockTransactionModal } from '../stock/StockTransactionModal';
import { QuickSaleWidget } from '../stock/QuickSaleWidget';
import { stockKeys } from '../../lib/queryKeys';
import {
  getSalesByCase,
  getStockUsageByCase,
  getRecommendedDevices,
  type StockItemWithCategory,
} from '../../lib/stockService';
import { formatDate } from '../../lib/format';
import { useCurrency } from '../../hooks/useCurrency';

interface CaseBackupDevicesTabProps {
  caseId: string;
  customerId: string;
  companyId?: string | null;
  recoveredDataSizeGB?: number;
}

export const CaseBackupDevicesTab: React.FC<CaseBackupDevicesTabProps> = ({
  caseId,
  customerId,
  companyId: _companyId,
  recoveredDataSizeGB,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();

  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [usageItem, setUsageItem] = useState<StockItemWithCategory | null>(null);

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: stockKeys.salesByCase(caseId),
    queryFn: () => getSalesByCase(caseId),
    enabled: !!caseId,
  });

  const { data: usageTransactions = [], isLoading: loadingUsage } = useQuery({
    queryKey: ['stock-usage-case', caseId],
    queryFn: () => getStockUsageByCase(caseId),
    enabled: !!caseId,
  });

  const { data: recommendedItems = [], isLoading: loadingRecommended } = useQuery({
    queryKey: ['stock-recommended', recoveredDataSizeGB ?? 0],
    queryFn: () => getRecommendedDevices(recoveredDataSizeGB ?? 0),
  });

  const paymentStatusConfig: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'secondary' }> = {
    paid: { label: 'Paid', color: 'success' },
    pending: { label: 'Pending', color: 'warning' },
    partial: { label: 'Partial', color: 'warning' },
    refunded: { label: 'Refunded', color: 'danger' },
  };

  const handleSaleSuccess = (saleId: string) => {
    setShowSaleModal(false);
    queryClient.invalidateQueries({ queryKey: stockKeys.salesByCase(caseId) });
    navigate(`/resources/stock/sales/${saleId}`);
  };

  const handleUsageSuccess = () => {
    setShowUsageModal(false);
    setUsageItem(null);
    queryClient.invalidateQueries({ queryKey: ['stock-usage-case', caseId] });
  };

  const handleItemSelect = (item: StockItemWithCategory) => {
    setSelectedItems((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
    );
    setUsageItem(item);
  };

  const openUsageModal = () => {
    if (!usageItem) {
      const firstSelectedId = selectedItems[0];
      const fallback = recommendedItems.find((i) => i.id === firstSelectedId) ?? recommendedItems[0] ?? null;
      setUsageItem(fallback);
    }
    setShowUsageModal(true);
  };

  return (
    <div className="space-y-6">
      {/* QuickSaleWidget — 1-click sell entry point. Displays recent case
          sales with payment-status badges and opens StockSaleModal in
          create-sale mode. Sits above Recommended Backup Devices so
          engineers can sell without scrolling through the recommendation
          grid first. */}
      <QuickSaleWidget
        caseId={caseId}
        customerId={customerId}
        onSaleCreated={() => {
          queryClient.invalidateQueries({ queryKey: stockKeys.salesByCase(caseId) });
        }}
      />

      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-slate-900">Recommended Backup Devices</h3>
              {recoveredDataSizeGB && recoveredDataSizeGB > 0 && (
                <span className="text-sm text-slate-500">
                  — based on {recoveredDataSizeGB >= 1024
                    ? `${(recoveredDataSizeGB / 1024).toFixed(1)} TB`
                    : `${recoveredDataSizeGB} GB`} recovered data
                </span>
              )}
            </div>
            <Button onClick={() => setShowSaleModal(true)} size="sm">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Sell to Customer
            </Button>
          </div>

          {loadingRecommended ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : recommendedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <HardDrive className="w-10 h-10 mb-2" />
              <p className="text-sm">No saleable devices in stock</p>
            </div>
          ) : (
            <SaleableItemsGrid
              items={recommendedItems}
              onSelect={handleItemSelect}
              selectedIds={selectedItems}
            />
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-success" />
              <h3 className="text-lg font-semibold text-slate-900">Devices Sold for This Case</h3>
            </div>
          </div>

          {loadingSales ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Package className="w-10 h-10 mb-2" />
              <p className="text-sm">No devices sold for this case yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-3 font-medium text-slate-600">Sale #</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Date</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Items</th>
                    <th className="text-right pb-3 font-medium text-slate-600">Amount</th>
                    <th className="text-center pb-3 font-medium text-slate-600">Status</th>
                    <th className="text-right pb-3 font-medium text-slate-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sales.map((sale) => {
                    const statusCfg = paymentStatusConfig[sale.status ?? 'pending'];
                    const itemNames = sale.stock_sale_items
                      ?.map((i) => i.stock_items?.name ?? 'Item')
                      .join(', ');
                    return (
                      <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 font-mono text-primary">{sale.sale_number}</td>
                        <td className="py-3 text-slate-600">{formatDate(sale.sale_date ?? sale.created_at)}</td>
                        <td className="py-3 text-slate-700 max-w-xs truncate">{itemNames || '—'}</td>
                        <td className="py-3 text-right font-semibold text-slate-900">
                          {formatCurrency(sale.total_amount ?? 0)}
                        </td>
                        <td className="py-3 text-center">
                          <Badge variant={statusCfg?.color ?? 'secondary'} size="sm">
                            {statusCfg?.label ?? sale.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => navigate(`/resources/stock/sales/${sale.id}`)}
                            className="text-slate-400 hover:text-primary transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-warning" />
              <h3 className="text-lg font-semibold text-slate-900">Stock Used for This Case</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={openUsageModal}
              disabled={recommendedItems.length === 0}
              title={recommendedItems.length === 0 ? 'No saleable items in stock' : 'Record usage of a stock item against this case'}
            >
              <Wrench className="w-4 h-4 mr-2" />
              Record Usage
            </Button>
          </div>

          {loadingUsage ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : usageTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Wrench className="w-10 h-10 mb-2" />
              <p className="text-sm">No stock usage recorded for this case</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-3 font-medium text-slate-600">Item</th>
                    <th className="text-right pb-3 font-medium text-slate-600">Qty</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Date</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {usageTransactions.map((tx) => {
                    const item = tx as unknown as typeof tx & { stock_items?: { name: string; brand: string | null; sku: string | null } };
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3">
                          <div className="font-medium text-slate-900">{item.stock_items?.name ?? '—'}</div>
                          {item.stock_items?.sku && (
                            <div className="text-xs text-slate-500">{item.stock_items.sku}</div>
                          )}
                        </td>
                        <td className="py-3 text-right font-semibold text-slate-900">
                          {Math.abs(tx.quantity ?? 0)}
                        </td>
                        <td className="py-3 text-slate-600">
                          {formatDate(tx.created_at)}
                        </td>
                        <td className="py-3 text-slate-500 max-w-xs truncate">
                          {tx.notes ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {showSaleModal && (
        <StockSaleModal
          isOpen={showSaleModal}
          onClose={() => setShowSaleModal(false)}
          customerId={customerId}
          caseId={caseId}
          onSuccess={handleSaleSuccess}
        />
      )}

      {showUsageModal && (
        <StockTransactionModal
          isOpen={showUsageModal}
          onClose={() => {
            setShowUsageModal(false);
            setUsageItem(null);
          }}
          item={usageItem}
          mode="usage"
          caseId={caseId}
          onSuccess={handleUsageSuccess}
        />
      )}
    </div>
  );
};
