import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Package, ArrowRight } from 'lucide-react';
import { getLowStockItems } from '../../lib/stockService';

export const LowStockWidget: React.FC = () => {
  const navigate = useNavigate();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['stock-low-stock-widget'],
    queryFn: getLowStockItems,
    staleTime: 60000,
  });

  const critical = items.slice(0, 5);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-warning-muted flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-warning" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Low Stock</p>
            <p className="text-xl font-bold text-slate-900 leading-tight">
              {isLoading ? '—' : items.length}
            </p>
          </div>
        </div>
        {items.length > 0 && (
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-warning-muted text-warning">
            {items.filter((i) => i.current_quantity === 0).length} out of stock
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : critical.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-slate-400">
          <Package className="w-6 h-6 mb-1" />
          <p className="text-xs">All items are well-stocked</p>
        </div>
      ) : (
        <div className="space-y-2">
          {critical.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                {item.stock_categories && (
                  <p className="text-xs text-slate-400 truncate">{(item.stock_categories as { name: string }).name}</p>
                )}
              </div>
              <div className="flex-shrink-0 ml-3 text-right">
                <span className={`text-sm font-bold ${item.current_quantity === 0 ? 'text-danger' : 'text-warning'}`}>
                  {item.current_quantity}
                </span>
                <span className="text-xs text-slate-400 ml-0.5">/ {item.minimum_quantity} min</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => navigate('/resources/stock')}
        className="mt-4 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        View all stock items
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
};
