import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, ArrowRight, TrendingUp } from 'lucide-react';
import { getTodaysSales } from '../../lib/stockService';
import { useCurrency } from '../../hooks/useCurrency';

export const StockSalesWidget: React.FC = () => {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();

  const { data, isLoading } = useQuery({
    queryKey: ['stock-today-sales-widget'],
    queryFn: getTodaysSales,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const count = data?.count ?? 0;
  const revenue = data?.revenue ?? 0;
  const recentSales = (data?.sales ?? []).slice(0, 3);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-success-muted flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-success" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Today's Sales</p>
            <p className="text-xl font-bold text-slate-900 leading-tight">
              {isLoading ? '—' : count}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Revenue</p>
          <p className="text-base font-bold text-success">
            {isLoading ? '—' : formatCurrency(revenue)}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : recentSales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-slate-400">
          <TrendingUp className="w-6 h-6 mb-1" />
          <p className="text-xs">No sales recorded today</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recentSales.map((sale) => {
            const customer = sale as unknown as typeof sale & {
              customers_enhanced?: { customer_name: string | null };
            };
            return (
              <div
                key={sale.id}
                className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {customer.customers_enhanced?.customer_name ?? 'Customer'}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">{sale.sale_number}</p>
                </div>
                <span className="flex-shrink-0 ml-3 text-sm font-semibold text-slate-900">
                  {formatCurrency(sale.total_amount ?? 0)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => navigate('/resources/stock/sales')}
        className="mt-4 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        View all sales
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
};
