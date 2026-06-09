import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2,
  TrendingUp,
  Download,
  AlertTriangle,
  DollarSign,
  ShoppingCart,
  Package,
  Award,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { PageHeader } from '../../components/shared/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { useCurrency } from '../../hooks/useCurrency';
import { chartAxis, chartCategorical, chartTooltipBorder } from '../../lib/chartTheme';
import {
  getStockValuation,
  getSalesReport,
  getTopSellingItems,
  getLowStockItems,
} from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';

function downloadCSV(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatPct(val: number): string {
  return `${val.toFixed(1)}%`;
}

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon: Icon, title, description, action }) => (
  <div className="flex items-start justify-between mb-4">
    <div className="flex items-center gap-3">
      <div className="p-2.5 bg-info-muted rounded-lg">
        <Icon className="w-5 h-5 text-info" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </div>
    {action}
  </div>
);

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  negative?: boolean;
  icon: React.ElementType;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, sub, positive, negative, icon: Icon }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
    <div
      className={`p-2 rounded-lg flex-shrink-0 ${
        positive ? 'bg-success-muted' : negative ? 'bg-danger-muted' : 'bg-slate-50'
      }`}
    >
      <Icon
        className={`w-5 h-5 ${positive ? 'text-success' : negative ? 'text-danger' : 'text-slate-500'}`}
      />
    </div>
    <div className="min-w-0">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

export const StockReportsPage: React.FC = () => {
  const { formatCurrency } = useCurrency();
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [startDate, setStartDate] = useState(firstOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const { data: valuation = [], isLoading: loadingVal } = useQuery({
    queryKey: [...stockKeys.all, 'valuation'],
    queryFn: getStockValuation,
  });

  const { data: salesReport, isLoading: loadingSales } = useQuery({
    queryKey: [...stockKeys.all, 'sales-report', startDate, endDate],
    queryFn: () => getSalesReport(startDate, endDate),
  });

  const { data: topItems = [], isLoading: loadingTop } = useQuery({
    queryKey: [...stockKeys.all, 'top-selling', startDate, endDate],
    queryFn: () => getTopSellingItems(startDate, endDate, 10),
  });

  const { data: lowStockItems = [], isLoading: loadingLow } = useQuery({
    queryKey: stockKeys.lowStock(),
    queryFn: getLowStockItems,
  });

  const totalCostValue = valuation.reduce((s, v) => s + v.costValue, 0);
  const totalSellValue = valuation.reduce((s, v) => s + v.sellValue, 0);
  const overallMargin =
    totalSellValue > 0 ? ((totalSellValue - totalCostValue) / totalSellValue) * 100 : 0;

  const grossMargin =
    (salesReport?.totalRevenue ?? 0) > 0
      ? (((salesReport?.totalProfit ?? 0) / (salesReport?.totalRevenue ?? 1)) * 100)
      : 0;

  const handleExportValuation = () => {
    const rows: string[][] = [
      ['SKU', 'Name', 'Brand', 'Qty', 'Cost Price', 'Sell Price', 'Cost Value', 'Sell Value', 'Margin %'],
      ...valuation.map((v) => [
        v.item.sku ?? '',
        v.item.name,
        v.item.brand ?? '',
        String(v.item.current_quantity),
        String(v.item.cost_price ?? 0),
        String(v.item.selling_price ?? 0),
        v.costValue.toFixed(3),
        v.sellValue.toFixed(3),
        v.margin.toFixed(1) + '%',
      ]),
    ];
    downloadCSV('stock-valuation.csv', rows);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Stock Reports"
        description="Valuation, sales performance, and inventory health"
        icon={BarChart2}
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-end gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
            Start Date
          </label>
          <input
            type="date"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
            End Date
          </label>
          <input
            type="date"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <p className="text-sm text-slate-400 pb-2">
          Sales report and top items reflect this date range
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <SectionHeader
          icon={DollarSign}
          title="Stock Valuation"
          description="Current inventory value at cost and selling price"
          action={
            <button
              onClick={handleExportValuation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 font-medium text-slate-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          }
        />

        <div className="grid grid-cols-3 gap-4 mb-5">
          <StatCard
            label="Total Cost Value"
            value={formatCurrency(totalCostValue)}
            icon={Package}
          />
          <StatCard
            label="Total Sell Value"
            value={formatCurrency(totalSellValue)}
            positive
            icon={TrendingUp}
          />
          <StatCard
            label="Overall Margin"
            value={formatPct(overallMargin)}
            positive={overallMargin > 0}
            icon={BarChart2}
          />
        </div>

        {loadingVal ? (
          <div className="py-8 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Cost/Unit
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Sell/Unit
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Cost Value
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Sell Value
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Margin
                  </th>
                </tr>
              </thead>
              <tbody>
                {valuation.map(({ item, costValue, sellValue, margin }) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.sku && <span className="font-mono mr-1.5">{item.sku}</span>}
                        {item.brand && <span>{item.brand}</span>}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                      {item.current_quantity}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">
                      {item.cost_price != null ? formatCurrency(item.cost_price) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">
                      {item.selling_price != null ? formatCurrency(item.selling_price) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                      {formatCurrency(costValue)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                      {formatCurrency(sellValue)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={`font-semibold text-sm ${
                          margin > 30
                            ? 'text-success'
                            : margin > 10
                            ? 'text-warning'
                            : 'text-danger'
                        }`}
                      >
                        {formatPct(margin)}
                      </span>
                    </td>
                  </tr>
                ))}
                {valuation.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-400 text-sm">
                      No stock items found
                    </td>
                  </tr>
                )}
              </tbody>
              {valuation.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                    <td className="px-3 py-2.5 text-slate-700">Totals</td>
                    <td className="px-3 py-2.5 text-right text-slate-700" />
                    <td colSpan={2} />
                    <td className="px-3 py-2.5 text-right text-slate-900">
                      {formatCurrency(totalCostValue)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-900">
                      {formatCurrency(totalSellValue)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={overallMargin >= 0 ? 'text-success' : 'text-danger'}>
                        {formatPct(overallMargin)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <SectionHeader
          icon={ShoppingCart}
          title="Sales Report"
          description={`Sales activity from ${startDate} to ${endDate}`}
        />

        {loadingSales ? (
          <div className="py-8 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4 mb-5">
              <StatCard
                label="Total Revenue"
                value={formatCurrency(salesReport?.totalRevenue ?? 0)}
                positive
                icon={DollarSign}
              />
              <StatCard
                label="Total Cost"
                value={formatCurrency(salesReport?.totalCost ?? 0)}
                icon={Package}
              />
              <StatCard
                label="Gross Profit"
                value={formatCurrency(salesReport?.totalProfit ?? 0)}
                positive={(salesReport?.totalProfit ?? 0) > 0}
                negative={(salesReport?.totalProfit ?? 0) < 0}
                icon={TrendingUp}
              />
              <StatCard
                label="Gross Margin"
                value={formatPct(grossMargin)}
                positive={grossMargin > 0}
                negative={grossMargin < 0}
                icon={BarChart2}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Sale #
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(salesReport?.sales ?? []).map((sale: Record<string, unknown>) => (
                    <tr
                      key={sale.id as string}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-3 py-2.5 font-mono text-primary">
                        {(sale.sale_number as string) ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {sale.sale_date
                          ? new Date(sale.sale_date as string).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                        {formatCurrency((sale.total_amount as number) ?? 0)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${
                            sale.payment_status === 'paid'
                              ? 'bg-success-muted text-success'
                              : sale.payment_status === 'pending'
                              ? 'bg-warning-muted text-warning'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {String(sale.payment_status ?? '—')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(salesReport?.sales ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-400 text-sm">
                        No sales in this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <SectionHeader
          icon={Award}
          title="Top Selling Items"
          description={`Best performers by revenue from ${startDate} to ${endDate}`}
        />

        {loadingTop ? (
          <div className="py-8 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : topItems.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            No sales data available for this period
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Item
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Qty Sold
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Revenue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.map((item, idx) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-info-muted text-info text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{item.name}</p>
                            {item.brand && (
                              <p className="text-xs text-slate-400">{item.brand}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-700">
                        {item.totalQty}
                      </td>
                      <td className="py-2.5 text-right font-semibold text-slate-800">
                        {formatCurrency(item.totalRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <ResponsiveContainer width="100%" height={Math.max(200, topItems.length * 36)}>
                <BarChart
                  data={topItems}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 12, fill: chartAxis }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: `1px solid ${chartTooltipBorder}`,
                    }}
                  />
                  <Bar dataKey="totalRevenue" radius={[0, 4, 4, 0]}>
                    {topItems.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartCategorical[index % chartCategorical.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <SectionHeader
          icon={AlertTriangle}
          title="Low Stock Alert"
          description="Items at or below minimum quantity threshold"
        />

        {loadingLow ? (
          <div className="py-8 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : lowStockItems.length === 0 ? (
          <div className="py-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-success-muted rounded-full">
              <TrendingUp className="w-4 h-4 text-success" />
              <span className="text-sm font-medium text-success">
                All items are adequately stocked
              </span>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Current Qty
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Minimum Qty
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Reorder Qty
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Suggested Order
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((item) => {
                  const currentQty = item.current_quantity ?? 0;
                  const suggested = Math.max(
                    0,
                    (item.reorder_quantity ?? item.minimum_quantity ?? 0) - currentQty
                  );
                  const isOut = currentQty === 0;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                        isOut ? 'bg-danger-muted/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          {item.sku && <span className="font-mono mr-1.5">{item.sku}</span>}
                          {item.brand && <span>{item.brand}</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`font-mono font-bold text-sm ${
                            isOut ? 'text-danger' : 'text-warning'
                          }`}
                        >
                          {item.current_quantity}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                        {item.minimum_quantity}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                        {item.reorder_quantity ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-info-muted text-info font-mono font-semibold text-sm">
                          +{suggested}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                            isOut
                              ? 'bg-danger-muted text-danger'
                              : 'bg-warning-muted text-warning'
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {isOut ? 'Out of Stock' : 'Low Stock'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockReportsPage;
