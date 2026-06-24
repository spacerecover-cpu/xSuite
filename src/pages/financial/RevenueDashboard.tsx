import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { FinancialModuleHeader } from '../../components/financial/FinancialModuleHeader';
import { StatCard } from '../../components/shared/StatCard';
import { formatDate } from '../../lib/format';
import { useCurrency } from '../../hooks/useCurrency';
import {
  generateRevenueByCustomerReport,
  generateRevenueByCaseReport,
} from '../../lib/financialReportsService';
import { baseAmount } from '../../lib/financialMath';
import { TrendingUp, BarChart3, Plus, Search, Users, Briefcase } from 'lucide-react';

type RevenueInvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  status: string | null;
  customer: { customer_name: string } | null;
};

type CustomerRevenueRow = {
  id: string;
  name: string;
  email: string;
  amount: number;
  count: number;
};

type CaseRevenueRow = {
  id: string;
  caseNo: string;
  title: string;
  revenue: number;
  expenses: number;
  profit: number;
};

export const RevenueDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('month');
  const [viewMode, setViewMode] = useState<'invoices' | 'customers' | 'cases'>('invoices');

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;
    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case 'year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        startDate = new Date(2020, 0, 1);
    }
    return {
      from: startDate.toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0],
    };
  };

  const dateRange = useMemo(() => getDateRange(), [dateFilter]);

  const { data: revenueData = [], isLoading } = useQuery<RevenueInvoiceRow[]>({
    queryKey: ['revenue_data', dateFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          invoice_date,
          total_amount,
          total_amount_base,
          amount_paid,
          amount_paid_base,
          status,
          customer:customers_enhanced(customer_name)
        `)
        .gte('invoice_date', dateRange.from)
        .order('invoice_date', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as RevenueInvoiceRow[];
    },
  });

  const { data: customerRevenue = [] } = useQuery<CustomerRevenueRow[]>({
    queryKey: ['revenue_by_customer', dateFilter],
    queryFn: () => generateRevenueByCustomerReport(dateRange.from, dateRange.to),
    enabled: viewMode === 'customers',
  });

  const { data: caseRevenue = [] } = useQuery<CaseRevenueRow[]>({
    queryKey: ['revenue_by_case', dateFilter],
    queryFn: () => generateRevenueByCaseReport(dateRange.from, dateRange.to),
    enabled: viewMode === 'cases',
  });

  const { data: prevPeriodRevenue = 0 } = useQuery<number>({
    queryKey: ['prev_period_revenue', dateFilter],
    queryFn: async () => {
      const periodLength = dateFilter === 'year' ? 365 : dateFilter === 'month' ? 30 : dateFilter === 'week' ? 7 : 1;
      const prevStart = new Date(new Date(dateRange.from).getTime() - periodLength * 24 * 60 * 60 * 1000);
      const prevEnd = new Date(dateRange.from);
      const { data } = await supabase
        .from('invoices')
        .select('amount_paid, amount_paid_base')
        .gte('invoice_date', prevStart.toISOString().split('T')[0])
        .lt('invoice_date', prevEnd.toISOString().split('T')[0]);
      return (data || []).reduce<number>((sum, inv) => sum + baseAmount(inv, 'amount_paid'), 0);
    },
  });

  const totalRevenue = revenueData.reduce<number>((sum, inv) => sum + baseAmount(inv, 'amount_paid'), 0);
  const thisMonth = revenueData.filter((inv) => inv.invoice_date !== null && new Date(inv.invoice_date).getMonth() === new Date().getMonth());
  const thisMonthRevenue = thisMonth.reduce<number>((sum, inv) => sum + baseAmount(inv, 'amount_paid'), 0);
  const paidInvoices = revenueData.filter((inv) => inv.status === 'paid');
  const growthRate = prevPeriodRevenue > 0 ? ((totalRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100 : 0;

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1800px] mx-auto space-y-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <FinancialModuleHeader
        icon={<TrendingUp className="w-7 h-7 text-white" />}
        title="Revenue Dashboard"
        description="Track revenue streams and performance analytics"
        iconBgColor="#10b981"
        statistics={[
          { label: 'Total Revenue', value: formatCurrency(totalRevenue), color: '#10b981' },
          { label: 'This Month', value: formatCurrency(thisMonthRevenue), color: '#3b82f6' },
          { label: 'Paid Invoices', value: paidInvoices.length, color: '#10b981' },
        ]}
        primaryAction={{
          label: 'View Reports',
          onClick: () => navigate('/financial/reports'),
          icon: <Plus className="w-4 h-4" />,
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          tone="primary"
        />
        <StatCard
          label="This Month"
          value={formatCurrency(thisMonthRevenue)}
          tone="info"
        />
        <StatCard
          label="Growth Rate"
          value={`${growthRate.toFixed(2)}%`}
          tone="success"
        />
        <StatCard
          label="Revenue Streams"
          value={revenueData.length}
          tone="cat-5"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="w-full lg:w-80 relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search revenue records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex-1 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setDateFilter(dateFilter === 'today' ? 'month' : 'today')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  dateFilter === 'today'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setDateFilter(dateFilter === 'week' ? 'month' : 'week')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  dateFilter === 'week'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setDateFilter('month')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  dateFilter === 'month'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                This Month
              </button>
              <button
                onClick={() => setDateFilter(dateFilter === 'year' ? 'month' : 'year')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  dateFilter === 'year'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                This Year
              </button>
            </div>

            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('invoices')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all flex items-center gap-1 ${
                  viewMode === 'invoices'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Invoices
              </button>
              <button
                onClick={() => setViewMode('customers')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all flex items-center gap-1 ${
                  viewMode === 'customers'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-4 h-4" />
                By Customer
              </button>
              <button
                onClick={() => setViewMode('cases')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all flex items-center gap-1 ${
                  viewMode === 'cases'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                By Case
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'invoices' && (
        revenueData.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
            <TrendingUp className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">
              {searchTerm || dateFilter !== 'all'
                ? 'No revenue data found matching your criteria.'
                : 'No revenue data yet. Start generating invoices to track revenue.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Invoice #</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Total Amount</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Amount Paid</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {revenueData
                    .filter((inv) => {
                      if (searchTerm === '') return true;
                      const needle = searchTerm.toLowerCase();
                      const numberMatches = (inv.invoice_number ?? '').toLowerCase().includes(needle);
                      const customerMatches = (inv.customer?.customer_name ?? '').toLowerCase().includes(needle);
                      return numberMatches || customerMatches;
                    })
                    .map((invoice) => (
                      <tr key={invoice.id} onClick={() => navigate(`/invoices/${invoice.id}`)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-semibold text-primary">{invoice.invoice_number ?? '-'}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{invoice.invoice_date ? formatDate(invoice.invoice_date) : '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{invoice.customer?.customer_name || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 text-right">{formatCurrency(invoice.total_amount ?? 0)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-success text-right">{formatCurrency(invoice.amount_paid ?? 0)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={invoice.status === 'paid' ? 'success' : 'secondary'} size="sm">{invoice.status ?? '-'}</Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {viewMode === 'customers' && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Revenue by Customer</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Invoices</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Revenue</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {customerRevenue.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">No customer revenue data found</p>
                    </td>
                  </tr>
                ) : (
                  customerRevenue.map((customer) => {
                    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- CustomerRevenueRow.amount is already base-currency (accumulated via baseAmount in generateRevenueByCustomerReport); summing it is a base rollup, not raw native.
                    const totalCustomerRevenue = customerRevenue.reduce<number>((sum, c) => sum + c.amount, 0);
                    const percentage = totalCustomerRevenue > 0 ? (customer.amount / totalCustomerRevenue) * 100 : 0;
                    return (
                      <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-info-muted rounded-full flex items-center justify-center">
                              <Users className="w-4 h-4 text-primary" />
                            </div>
                            <span className="font-medium text-slate-900">{customer.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{customer.email || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 text-right">{customer.count}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-success text-right">{formatCurrency(customer.amount)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-success rounded-full" style={{ width: `${Math.min(percentage, 100)}%` }} />
                            </div>
                            <span className="text-sm text-slate-600 w-12 text-right">{percentage.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'cases' && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Revenue by Case</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Case #</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Revenue</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Expenses</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {caseRevenue.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">No case revenue data found</p>
                    </td>
                  </tr>
                ) : (
                  caseRevenue.map((c) => (
                    <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-semibold text-primary">{c.caseNo}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">{c.title || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-success text-right">{formatCurrency(c.revenue)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-danger text-right">{formatCurrency(c.expenses)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className={`text-sm font-bold ${c.profit >= 0 ? 'text-success' : 'text-danger'}`}>
                          {formatCurrency(c.profit)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
