import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Shield, Hash, ExternalLink, Package } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import {
  getSalesByCustomer,
  getCustomerWarranties,
  getCustomerSerialNumbers,
} from '../../lib/stockService';
import { formatDate } from '../../lib/format';
import { baseAmount } from '../../lib/financialMath';
import { useCurrency } from '../../hooks/useCurrency';

interface CustomerPurchasesTabProps {
  customerId: string;
}

function getWarrantyColor(daysRemaining?: number): 'success' | 'warning' | 'danger' {
  if (daysRemaining === undefined) return 'warning';
  if (daysRemaining > 90) return 'success';
  if (daysRemaining > 30) return 'warning';
  return 'danger';
}

export const CustomerPurchasesTab: React.FC<CustomerPurchasesTabProps> = ({ customerId }) => {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['stock-sales-customer', customerId],
    queryFn: () => getSalesByCustomer(customerId),
    enabled: !!customerId,
  });

  const { data: warranties = [], isLoading: loadingWarranties } = useQuery({
    queryKey: ['stock-warranties-customer', customerId],
    queryFn: () => getCustomerWarranties(customerId),
    enabled: !!customerId,
  });

  const { data: serialNumbers = [], isLoading: loadingSerials } = useQuery({
    queryKey: ['stock-serials-customer', customerId],
    queryFn: () => getCustomerSerialNumbers(customerId),
    enabled: !!customerId,
  });

  const paymentStatusConfig: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'secondary' }> = {
    paid: { label: 'Paid', color: 'success' },
    pending: { label: 'Pending', color: 'warning' },
    partial: { label: 'Partial', color: 'warning' },
    refunded: { label: 'Refunded', color: 'danger' },
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-slate-900">Devices Purchased</h3>
            {sales.length > 0 && (
              <span className="ml-1 text-sm text-slate-500">({sales.length} sale{sales.length !== 1 ? 's' : ''})</span>
            )}
          </div>

          {loadingSales ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Package className="w-10 h-10 mb-2" />
              <p className="text-sm">No purchases recorded for this customer</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-3 font-medium text-slate-600">Sale #</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Date</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Items</th>
                    <th className="text-right pb-3 font-medium text-slate-600">Total</th>
                    <th className="text-center pb-3 font-medium text-slate-600">Status</th>
                    <th className="text-right pb-3 font-medium text-slate-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sales.map((sale) => {
                    const saleStatus = sale.status ?? 'pending';
                    const statusCfg = paymentStatusConfig[saleStatus];
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
                            {statusCfg?.label ?? saleStatus}
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
                <tfoot>
                  <tr className="border-t border-slate-200">
                    <td colSpan={3} className="pt-3 text-sm font-medium text-slate-500">Total Purchases</td>
                    <td className="pt-3 text-right font-bold text-slate-900">
                      {formatCurrency(sales.reduce((sum, s) => sum + baseAmount(s as unknown as Record<string, unknown>, 'total_amount'), 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-success" />
            <h3 className="text-lg font-semibold text-slate-900">Active Warranties</h3>
          </div>

          {loadingWarranties ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : warranties.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Shield className="w-10 h-10 mb-2" />
              <p className="text-sm">No active warranties</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-3 font-medium text-slate-600">Device</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Serial #</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Purchase Date</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Expires</th>
                    <th className="text-center pb-3 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {warranties.map((w) => {
                    const item = w as unknown as typeof w & {
                      stock_items?: { name: string; brand: string | null };
                      serial_number?: string | null;
                    };
                    const color = getWarrantyColor(w.daysRemaining);
                    const daysLabel = w.daysRemaining !== undefined
                      ? `${w.daysRemaining} day${w.daysRemaining !== 1 ? 's' : ''} left`
                      : 'Active';
                    return (
                      <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3">
                          <div className="font-medium text-slate-900">{item.stock_items?.name ?? '—'}</div>
                          {item.stock_items?.brand && (
                            <div className="text-xs text-slate-500">{item.stock_items.brand}</div>
                          )}
                        </td>
                        <td className="py-3 font-mono text-slate-600 text-xs">{item.serial_number ?? '—'}</td>
                        <td className="py-3 text-slate-600">{formatDate(w.warranty_start_date ?? w.created_at)}</td>
                        <td className="py-3 text-slate-600">{formatDate(w.warranty_end_date ?? '')}</td>
                        <td className="py-3 text-center">
                          <Badge variant={color} size="sm">{daysLabel}</Badge>
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
          <div className="flex items-center gap-2 mb-4">
            <Hash className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-900">Serial Numbers Owned</h3>
          </div>

          {loadingSerials ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : serialNumbers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Hash className="w-10 h-10 mb-2" />
              <p className="text-sm">No serial numbers on record</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-3 font-medium text-slate-600">Item</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Serial #</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Purchase Date</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Warranty Ends</th>
                    <th className="text-center pb-3 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {serialNumbers.map((sn) => {
                    const snItem = sn as unknown as typeof sn & {
                      stock_items?: { name: string; brand: string | null };
                      warranty_end_date?: string | null;
                      purchase_date?: string | null;
                    };
                    const warrantyEnd = snItem.warranty_end_date ? new Date(snItem.warranty_end_date) : null;
                    const daysLeft = warrantyEnd
                      ? Math.ceil((warrantyEnd.getTime() - Date.now()) / 86400000)
                      : null;
                    const warrantyColor = daysLeft !== null && daysLeft > 0
                      ? getWarrantyColor(daysLeft)
                      : 'secondary';
                    return (
                      <tr key={sn.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3">
                          <div className="font-medium text-slate-900">{snItem.stock_items?.name ?? '—'}</div>
                          {snItem.stock_items?.brand && (
                            <div className="text-xs text-slate-500">{snItem.stock_items.brand}</div>
                          )}
                        </td>
                        <td className="py-3 font-mono text-slate-700 text-xs">{sn.serial_number}</td>
                        <td className="py-3 text-slate-600">{formatDate(snItem.purchase_date ?? sn.created_at)}</td>
                        <td className="py-3 text-slate-600">
                          {snItem.warranty_end_date ? formatDate(snItem.warranty_end_date) : '—'}
                        </td>
                        <td className="py-3 text-center">
                          <Badge variant={warrantyColor} size="sm">
                            {sn.status === 'sold'
                              ? daysLeft !== null && daysLeft > 0
                                ? `${daysLeft}d warranty`
                                : 'Expired'
                              : sn.status}
                          </Badge>
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
    </div>
  );
};
