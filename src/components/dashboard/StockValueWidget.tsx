import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layers, ArrowRight } from 'lucide-react';
import { getStockValuationSummary } from '../../lib/stockService';
import { useCurrency } from '../../hooks/useCurrency';

export const StockValueWidget: React.FC = () => {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();

  const { data, isLoading } = useQuery({
    queryKey: ['stock-valuation-widget'],
    queryFn: getStockValuationSummary,
    staleTime: 120000,
  });

  const totalValue = data?.totalValue ?? 0;
  const internalValue = data?.internalValue ?? 0;
  const saleableValue = data?.saleableValue ?? 0;
  const itemCount = data?.itemCount ?? 0;

  const saleablePct = totalValue > 0 ? Math.round((saleableValue / totalValue) * 100) : 0;
  const internalPct = totalValue > 0 ? Math.round((internalValue / totalValue) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-info-muted flex items-center justify-center">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Stock Value</p>
            <p className="text-xl font-bold text-slate-900 leading-tight">
              {isLoading ? '—' : formatCurrency(totalValue)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">{isLoading ? '—' : itemCount} items</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-4 bg-slate-100 rounded animate-pulse" />
          <div className="h-6 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 bg-slate-100 rounded animate-pulse mt-3" />
          <div className="h-4 bg-slate-100 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className="mb-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Internal vs Saleable</span>
              <span>{saleablePct}% saleable</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-slate-400 rounded-l-full transition-all"
                style={{ width: `${internalPct}%` }}
              />
              <div
                className="h-full bg-primary rounded-r-full transition-all"
                style={{ width: `${saleablePct}%` }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
                <span className="text-slate-600">Internal Supplies</span>
              </div>
              <span className="font-medium text-slate-900">{formatCurrency(internalValue)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
                <span className="text-slate-600">Saleable Devices</span>
              </div>
              <span className="font-medium text-slate-900">{formatCurrency(saleableValue)}</span>
            </div>
          </div>
        </>
      )}

      <button
        onClick={() => navigate('/resources/stock/reports')}
        className="mt-4 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        View stock reports
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
};
