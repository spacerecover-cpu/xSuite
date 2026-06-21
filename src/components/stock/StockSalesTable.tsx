import React from 'react';
import { Eye } from 'lucide-react';
import type { StockSaleWithDetails } from '../../lib/stockService';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { useCurrency } from '../../hooks/useCurrency';

interface StockSalesTableProps {
  sales: StockSaleWithDetails[];
  onViewDetail: (sale: StockSaleWithDetails) => void;
  isLoading: boolean;
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

const formatDate = (value: string | null): string => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const StockSalesTable: React.FC<StockSalesTableProps> = ({
  sales,
  onViewDetail,
  isLoading,
}) => {
  const { formatCurrency } = useCurrency();
  const formatAmount = (value: number | null): string =>
    value === null || value === undefined ? '—' : formatCurrency(value);

  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <p className="text-sm font-medium">No sales found</p>
        <p className="text-xs mt-1">Sales will appear here once created</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
              Sale #
            </th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
              Date
            </th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
              Case #
            </th>
            <th className="text-center px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
              Items
            </th>
            <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
              Total
            </th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
              Payment Status
            </th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
              Method
            </th>
            <th className="text-center px-4 py-3 font-semibold text-slate-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sales.map((sale) => {
            const statusCfg =
              paymentStatusConfig[sale.status ?? 'pending'] ??
              paymentStatusConfig['pending'];
            const itemCount = sale.stock_sale_items?.length ?? 0;

            return (
              <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-mono text-slate-800 font-medium text-xs">
                    {sale.sale_number ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  {formatDate(sale.sale_date)}
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-900 font-medium">
                    {sale.customers_enhanced?.customer_name ?? '—'}
                  </span>
                  {sale.customers_enhanced?.email && (
                    <p className="text-xs text-slate-400 truncate max-w-[160px]">
                      {sale.customers_enhanced.email}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {sale.cases?.case_no ? (
                    <span className="font-mono text-xs text-slate-700">
                      {sale.cases.case_no}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                    {itemCount}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-slate-900">
                  {formatAmount(sale.total_amount)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Badge variant={statusCfg.variant} size="sm">
                    {statusCfg.label}
                  </Badge>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600 capitalize">
                  <span className="text-slate-400">—</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewDetail(sale)}
                    className="gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
