import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart,
  Plus,
  TrendingUp,
  DollarSign,
  Calendar,
  Search,
} from 'lucide-react';
import { stockKeys } from '../../lib/queryKeys';
import {
  getStockSales,
  getStockStats,
  type StockSaleWithDetails,
  type SalesFilters,
} from '../../lib/stockService';
import { baseAmount } from '../../lib/financialMath';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { Button } from '../../components/ui/Button';
import { StockSalesTable } from '../../components/stock/StockSalesTable';
import { StockSaleModal } from '../../components/stock/StockSaleModal';
import { useCurrency } from '../../hooks/useCurrency';

const getTodayIso = (): string => new Date().toISOString().split('T')[0];

const getMonthStartIso = (): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
};

export const StockSalesPage: React.FC = () => {
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [saleModalOpen, setSaleModalOpen] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedCustomer, setDebouncedCustomer] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCustomer(customerSearch), 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const filters = useMemo((): SalesFilters => {
    const f: SalesFilters = {};
    if (startDate) f.startDate = startDate;
    if (endDate) f.endDate = endDate;
    if (paymentStatus) f.status = paymentStatus;
    return f;
  }, [startDate, endDate, paymentStatus]);

  const { data: allSales = [], isLoading } = useQuery({
    queryKey: [...stockKeys.sales(), filters],
    queryFn: () => getStockSales(filters),
    staleTime: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: stockKeys.stats(),
    queryFn: getStockStats,
    staleTime: 60000,
  });

  const displayedSales = useMemo(() => {
    if (!debouncedCustomer) return allSales;
    const lower = debouncedCustomer.toLowerCase();
    return allSales.filter(
      (s) =>
        (s.customers_enhanced?.customer_name ?? '').toLowerCase().includes(lower) ||
        (s.customers_enhanced?.email ?? '').toLowerCase().includes(lower)
    );
  }, [allSales, debouncedCustomer]);

  const todaySales = useMemo(
    () => allSales.filter((s) => s.sale_date?.startsWith(getTodayIso())),
    [allSales]
  );

  const todayRevenue = useMemo(
    () =>
      todaySales.reduce(
        (sum, s) => sum + baseAmount(s as unknown as Record<string, unknown>, 'total_amount'),
        0
      ),
    [todaySales]
  );

  const { data: monthlySalesData = [] } = useQuery({
    queryKey: [...stockKeys.sales(), 'monthly', getMonthStartIso()],
    queryFn: () => getStockSales({ startDate: getMonthStartIso() }),
    staleTime: 60000,
  });

  const monthRevenue = useMemo(
    () =>
      monthlySalesData.reduce(
        (sum, s) => sum + baseAmount(s as unknown as Record<string, unknown>, 'total_amount'),
        0
      ),
    [monthlySalesData]
  );

  const handleViewDetail = (sale: StockSaleWithDetails) => {
    navigate(`/resources/stock/sales/${sale.id}`);
  };

  const handleSaleSuccess = (saleId: string) => {
    queryClient.invalidateQueries({ queryKey: stockKeys.sales() });
    queryClient.invalidateQueries({ queryKey: stockKeys.stats() });
    navigate(`/resources/stock/sales/${saleId}`);
  };

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6">
      <PageHeaderSlot
        title="Device Sales"
        actions={
          <Button
            variant="primary"
            size="sm"
            className="gap-2"
            onClick={() => setSaleModalOpen(true)}
          >
            <Plus className="w-4 h-4" />
            New Sale
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="p-2.5 rounded-lg bg-info-muted">
            <ShoppingCart className="w-5 h-5 text-info" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Today&apos;s Sales</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {stats?.salesToday ?? todaySales.length}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">transactions</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="p-2.5 rounded-lg bg-success-muted">
            <DollarSign className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Today&apos;s Revenue</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {formatCurrency(stats?.revenueToday ?? todayRevenue)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="p-2.5 rounded-lg bg-cat-2/10">
            <TrendingUp className="w-5 h-5 text-cat-2" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">This Month</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {formatCurrency(monthRevenue)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search customer..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-slate-700"
            />
            <span className="text-slate-400 text-sm">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-slate-700"
            />
          </div>

          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-slate-700"
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            {/* No 'Refunded' option: cancel_stock_sale sets status='refunded' AND
                deleted_at=now() on the same row, while getStockSales always filters
                deleted_at IS NULL — so a 'refunded' filter is unsatisfiable and would
                always show zero rows. Surfacing refunds needs getStockSales to include
                soft-deleted rows (stockService.ts), out of scope for this view. */}
          </select>

          {(startDate || endDate || paymentStatus || customerSearch) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setPaymentStatus('');
                setCustomerSearch('');
              }}
              className="text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2 whitespace-nowrap"
            >
              Clear filters
            </button>
          )}

          <div className="ml-auto shrink-0 text-sm text-slate-500">
            <span className="font-medium text-slate-700 tabular-nums">{displayedSales.length}</span>
            {' '}sale{displayedSales.length !== 1 ? 's' : ''}
          </div>
        </div>

        <StockSalesTable
          sales={displayedSales}
          onViewDetail={handleViewDetail}
          isLoading={isLoading}
        />
      </div>

      <StockSaleModal
        isOpen={saleModalOpen}
        onClose={() => setSaleModalOpen(false)}
        onSuccess={handleSaleSuccess}
      />
    </div>
  );
};

export default StockSalesPage;
