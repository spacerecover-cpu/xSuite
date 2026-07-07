import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { useCurrency } from '../../hooks/useCurrency';
import { useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { getFinancialYearDates } from '../../lib/financialService';
import { baseAmount } from '../../lib/financialMath';
import { sumBase, groupSumBase } from './reportsDashboardRollup';
import {
  generateProfitLossReport,
  generateAgedReceivablesReport,
  generateAgedPayablesReport,
  generateCashFlowReport,
  generateInvoiceSummaryReport,
  generateExpenseByCategoryReport,
  generateInvoiceVsExpenseReport,
  exportReportToCSV,
  ProfitLossData,
  AgedReceivablesData,
  AgedPayablesData,
  CashFlowData,
  InvoiceSummaryData,
  ExpenseByCategoryData,
  InvoiceVsExpenseData,
} from '../../lib/financialReportsService';
import { logger } from '../../lib/logger';
import { KpiRow } from '../../components/templates/KpiRow';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  Download,
  Calendar,
  PieChart,
  Receipt,
  Wallet,
  AlertCircle,
} from 'lucide-react';

interface ReportData {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  invoiceCount: number;
  expenseCount: number;
}

export const ReportsDashboard: React.FC = () => {
  const { formatCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState<string>('thisMonth');
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [profitLossData, setProfitLossData] = useState<ProfitLossData | null>(null);
  const [agedReceivablesData, setAgedReceivablesData] = useState<AgedReceivablesData | null>(null);
  const [agedPayablesData, setAgedPayablesData] = useState<AgedPayablesData | null>(null);
  const [cashFlowData, setCashFlowData] = useState<CashFlowData | null>(null);
  const [invoiceSummaryData, setInvoiceSummaryData] = useState<InvoiceSummaryData | null>(null);
  const [expenseByCategoryData, setExpenseByCategoryData] = useState<ExpenseByCategoryData | null>(null);
  const [invoiceVsExpenseData, setInvoiceVsExpenseData] = useState<InvoiceVsExpenseData | null>(null);

  const { fiscalYearStart } = useDateTimeConfig();
  const dates = getFinancialYearDates(fiscalYearStart);
  const selectedDateRange = dates[dateRange as keyof typeof dates] || dates.thisMonth;

  const handleGenerateReport = async (reportId: string) => {
    setSelectedReport(reportId);
    setReportLoading(true);
    setShowReportModal(true);

    try {
      switch (reportId) {
        case 'profit-loss':
          const plData = await generateProfitLossReport(selectedDateRange.start, selectedDateRange.end);
          setProfitLossData(plData);
          break;
        case 'aged-receivables':
          const arData = await generateAgedReceivablesReport();
          setAgedReceivablesData(arData);
          break;
        case 'cash-flow':
          const cfData = await generateCashFlowReport(selectedDateRange.start, selectedDateRange.end);
          setCashFlowData(cfData);
          break;
        case 'invoice-report':
          const isData = await generateInvoiceSummaryReport(selectedDateRange.start, selectedDateRange.end);
          setInvoiceSummaryData(isData);
          break;
        case 'aged-payables':
          const apData = await generateAgedPayablesReport();
          setAgedPayablesData(apData);
          break;
        case 'expense-by-category':
          const ebcData = await generateExpenseByCategoryReport(selectedDateRange.start, selectedDateRange.end);
          setExpenseByCategoryData(ebcData);
          break;
        case 'invoice-vs-expense':
          const iveData = await generateInvoiceVsExpenseReport(selectedDateRange.start, selectedDateRange.end);
          setInvoiceVsExpenseData(iveData);
          break;
        default:
          break;
      }
    } catch (error) {
      logger.error('Error generating report:', error);
    } finally {
      setReportLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!selectedReport) return;

    switch (selectedReport) {
      case 'profit-loss':
        if (profitLossData) {
          const data = [
            { category: 'Total Revenue', amount: profitLossData.revenue.total },
            { category: 'Total Expenses', amount: profitLossData.expenses.total },
            { category: 'Gross Profit', amount: profitLossData.grossProfit },
            { category: 'Net Profit', amount: profitLossData.netProfit },
          ];
          exportReportToCSV(data, [{ key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount' }], 'profit-loss-report');
        }
        break;
      case 'aged-receivables':
        if (agedReceivablesData) {
          const data = [
            { period: 'Current', amount: agedReceivablesData.totals.current },
            { period: '1-30 Days', amount: agedReceivablesData.totals.thirtyDays },
            { period: '31-60 Days', amount: agedReceivablesData.totals.sixtyDays },
            { period: '61-90 Days', amount: agedReceivablesData.totals.ninetyDays },
            { period: '90+ Days', amount: agedReceivablesData.totals.overNinetyDays },
            { period: 'Total', amount: agedReceivablesData.totals.total },
          ];
          exportReportToCSV(data, [{ key: 'period', label: 'Period' }, { key: 'amount', label: 'Amount' }], 'aged-receivables-report');
        }
        break;
      case 'cash-flow':
        if (cashFlowData) {
          const data = [
            { item: 'Operating Receipts', amount: cashFlowData.operatingActivities.receipts },
            { item: 'Operating Payments', amount: cashFlowData.operatingActivities.payments },
            { item: 'Net Operating', amount: cashFlowData.operatingActivities.net },
            { item: 'Net Cash Flow', amount: cashFlowData.netCashFlow },
          ];
          exportReportToCSV(data, [{ key: 'item', label: 'Item' }, { key: 'amount', label: 'Amount' }], 'cash-flow-report');
        }
        break;
      case 'aged-payables':
        if (agedPayablesData) {
          const data = [
            { period: 'Current (≤30d)', amount: agedPayablesData.totals.current },
            { period: '31-60 Days', amount: agedPayablesData.totals.thirtyDays },
            { period: '61-90 Days', amount: agedPayablesData.totals.sixtyDays },
            { period: '91-120 Days', amount: agedPayablesData.totals.ninetyDays },
            { period: '120+ Days', amount: agedPayablesData.totals.overNinetyDays },
            { period: 'Total', amount: agedPayablesData.totals.total },
          ];
          exportReportToCSV(data, [{ key: 'period', label: 'Period' }, { key: 'amount', label: 'Amount' }], 'aged-payables-report');
        }
        break;
      case 'expense-by-category':
        if (expenseByCategoryData) {
          exportReportToCSV(
            expenseByCategoryData.rows,
            [
              { key: 'category', label: 'Category' },
              { key: 'count', label: 'Expense Count' },
              { key: 'amount', label: 'Amount' },
              { key: 'percentage', label: '% of Total' },
            ],
            'expense-by-category-report',
          );
        }
        break;
      case 'invoice-vs-expense':
        if (invoiceVsExpenseData) {
          const rows = invoiceVsExpenseData.months.map((m) => ({
            month: m.month,
            revenue: m.revenue,
            expense: m.expense,
            net: m.net,
          }));
          rows.push({
            month: 'Total',
            revenue: invoiceVsExpenseData.totals.revenue,
            expense: invoiceVsExpenseData.totals.expense,
            net: invoiceVsExpenseData.totals.net,
          });
          exportReportToCSV(
            rows,
            [
              { key: 'month', label: 'Month' },
              { key: 'revenue', label: 'Revenue' },
              { key: 'expense', label: 'Expense' },
              { key: 'net', label: 'Net' },
            ],
            'invoice-vs-expense-report',
          );
        }
        break;
      default:
        break;
    }
  };

  const closeReportModal = () => {
    setShowReportModal(false);
    setSelectedReport(null);
    setProfitLossData(null);
    setAgedReceivablesData(null);
    setAgedPayablesData(null);
    setCashFlowData(null);
    setInvoiceSummaryData(null);
    setExpenseByCategoryData(null);
    setInvoiceVsExpenseData(null);
  };

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['financial_report', dateRange],
    queryFn: async () => {
      const { start, end } = selectedDateRange;

      const [invoicesResult, expensesResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('total_amount, total_amount_base, amount_paid, amount_paid_base, status, invoice_date')
          .gte('invoice_date', start)
          .lte('invoice_date', end),
        supabase
          .from('expenses')
          .select('amount, amount_base, status, expense_date')
          .is('deleted_at', null)
          .gte('expense_date', start)
          .lte('expense_date', end)
          .in('status', ['approved', 'paid']),
      ]);

      const invoices = invoicesResult.data || [];
      const expenses = expensesResult.data || [];

      const totalRevenue = sumBase(invoices, 'amount_paid');
      const totalExpenses = sumBase(expenses, 'amount');
      const netProfit = totalRevenue - totalExpenses;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return {
        totalRevenue,
        totalExpenses,
        netProfit,
        profitMargin,
        invoiceCount: invoices.length,
        expenseCount: expenses.length,
      } as ReportData;
    },
  });

  const { data: invoicesByStatus } = useQuery({
    queryKey: ['invoices_by_status', dateRange],
    queryFn: async () => {
      const { start, end } = selectedDateRange;
      const { data, error } = await supabase
        .from('invoices')
        .select('status, total_amount, total_amount_base')
        .gte('invoice_date', start)
        .lte('invoice_date', end);

      if (error) throw error;

      const statusCounts: Record<string, { count: number; amount: number }> = {};
      (data || []).forEach((invoice) => {
        const status = invoice.status ?? 'unknown';
        if (!statusCounts[status]) {
          statusCounts[status] = { count: 0, amount: 0 };
        }
        statusCounts[status].count += 1;
        statusCounts[status].amount += baseAmount(invoice, 'total_amount');
      });

      return statusCounts;
    },
  });

  const { data: expensesByCategory } = useQuery({
    queryKey: ['expenses_by_category', dateRange],
    queryFn: async () => {
      const { start, end } = selectedDateRange;
      const { data, error } = await supabase
        .from('expenses')
        .select('amount, amount_base, category:master_expense_categories(name)')
        .is('deleted_at', null)
        .gte('expense_date', start)
        .lte('expense_date', end)
        .in('status', ['approved', 'paid']);

      if (error) throw error;

      const categoryCounts = groupSumBase(
        (data || []) as Array<{ amount?: number; amount_base?: number; category?: { name?: string } | null }>,
        'amount',
        (e) => e.category?.name || 'Uncategorized',
      );

      return categoryCounts;
    },
  });

  const { data: topCustomers } = useQuery({
    queryKey: ['top_customers', dateRange],
    queryFn: async () => {
      const { start, end } = selectedDateRange;
      const { data, error } = await supabase
        .from('invoices')
        .select('customer_id, amount_paid, amount_paid_base, customers_enhanced(customer_name)')
        .gte('invoice_date', start)
        .lte('invoice_date', end);

      if (error) throw error;

      const customerRevenue: Record<string, { name: string; amount: number }> = {};
      (data || []).forEach((invoice) => {
        const customerId = invoice.customer_id;
        if (!customerId) return;
        const customerName = invoice.customers_enhanced?.customer_name || 'Unknown';
        if (!customerRevenue[customerId]) {
          customerRevenue[customerId] = { name: customerName, amount: 0 };
        }
        customerRevenue[customerId].amount += baseAmount(invoice, 'amount_paid');
      });

      return Object.values(customerRevenue)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);
    },
  });

  const reports = [
    {
      id: 'profit-loss',
      name: 'Profit & Loss Statement',
      description: 'Revenue, expenses, and net profit',
      icon: TrendingUp,
      color: 'blue',
    },
    {
      id: 'balance-sheet',
      name: 'Balance Sheet',
      description: 'Assets, liabilities, and equity',
      icon: BarChart3,
      color: 'green',
    },
    {
      id: 'cash-flow',
      name: 'Cash Flow Statement',
      description: 'Operating, investing, and financing activities',
      icon: DollarSign,
      color: 'teal',
    },
    {
      id: 'aged-receivables',
      name: 'Aged Receivables',
      description: 'Outstanding invoices by aging period',
      icon: Receipt,
      color: 'orange',
    },
    {
      id: 'aged-payables',
      name: 'Aged Payables',
      description: 'Outstanding expenses and payments',
      icon: Wallet,
      color: 'red',
    },
    {
      id: 'revenue-by-service',
      name: 'Revenue by Service',
      description: 'Income breakdown by service type',
      icon: PieChart,
      color: 'accent',
    },
    {
      id: 'expense-by-category',
      name: 'Expense by Category',
      description: 'Cost analysis by category',
      icon: BarChart3,
      color: 'slate',
    },
    {
      id: 'invoice-report',
      name: 'Invoice Report',
      description: 'Detailed invoice analysis',
      icon: FileText,
      color: 'blue',
    },
    {
      id: 'invoice-vs-expense',
      name: 'Invoice vs Expense',
      description: 'Profitability and margin analysis',
      icon: TrendingDown,
      color: 'accent',
    },
  ];

  if (isLoading) {
    return (
      <div className="px-6 py-5 max-w-[1800px] mx-auto space-y-6">
        <Skeleton className="h-12 w-64 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-5 max-w-[1800px] mx-auto">
      <PageHeaderSlot
        title="Financial Reports"
        icon={BarChart3}
        actions={
          <Button variant="secondary" size="sm" className="flex items-center gap-2">
            <Download className="w-4 h-4 mr-2" />
            Export All
          </Button>
        }
      />
      <div className="mb-4 flex justify-end">
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
        >
          <option value="thisMonth">This Month</option>
          <option value="lastMonth">Last Month</option>
          <option value="thisQuarter">This Quarter</option>
          <option value="thisYear">This Year</option>
          <option value="lastYear">Last Year</option>
        </select>
      </div>

      <KpiRow
        cols="grid-cols-1 md:grid-cols-4"
        stats={[
          {
            tone: 'success',
            label: 'Total Revenue',
            value: formatCurrency(reportData?.totalRevenue || 0),
            sub: `${reportData?.invoiceCount || 0} invoices`,
            icon: TrendingUp,
          },
          {
            tone: 'danger',
            label: 'Total Expenses',
            value: formatCurrency(reportData?.totalExpenses || 0),
            sub: `${reportData?.expenseCount || 0} expenses`,
            icon: TrendingDown,
          },
          {
            tone: 'info',
            label: 'Net Profit',
            value: formatCurrency(reportData?.netProfit || 0),
            sub: (reportData?.netProfit || 0) >= 0 ? 'Profit' : 'Loss',
            icon: DollarSign,
          },
          {
            tone: 'neutral',
            label: 'Profit Margin',
            value: `${(reportData?.profitMargin || 0).toFixed(2)}%`,
            sub: 'Net margin',
            icon: BarChart3,
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Invoices by Status</h2>
            </div>
            <div className="p-4">
              {invoicesByStatus && Object.keys(invoicesByStatus).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(invoicesByStatus).map(([status, data]) => (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="capitalize">
                          {status}
                        </Badge>
                        <span className="text-sm text-slate-600">{data.count} invoices</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">
                        {formatCurrency(data.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No invoice data</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Expenses by Category</h2>
            </div>
            <div className="p-4">
              {expensesByCategory && Object.keys(expensesByCategory).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(expensesByCategory)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([category, amount]) => (
                      <div key={category} className="flex items-center justify-between">
                        <span className="text-sm text-slate-900">{category}</span>
                        <span className="text-sm font-semibold text-danger">
                          {formatCurrency(amount)}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No expense data</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Top Customers</h2>
            </div>
            <div className="p-4">
              {topCustomers && topCustomers.length > 0 ? (
                <div className="space-y-3">
                  {topCustomers.slice(0, 6).map((customer, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500">#{index + 1}</span>
                        <span className="text-sm text-slate-900">{customer.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-success">
                        {formatCurrency(customer.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No customer data</p>
                </div>
              )}
            </div>
          </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Available Reports</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => {
              const IconComponent = report.icon;
              return (
                <div
                  key={report.id}
                  className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 cursor-pointer hover:shadow-xl transition-shadow overflow-hidden"
                  onClick={() => handleGenerateReport(report.id)}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-info-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      <IconComponent className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-slate-900 mb-1">
                        {report.name}
                      </h3>
                      <p className="text-xs text-slate-600 mb-3">{report.description}</p>
                      <Button size="sm" variant="ghost" className="text-xs">
                        <Download className="w-3 h-3 mr-1" />
                        Generate
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <div className="text-center">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Report Period</h3>
            <p className="text-slate-600">
              Viewing data from{' '}
              <span className="font-semibold">{selectedDateRange.start}</span> to{' '}
              <span className="font-semibold">{selectedDateRange.end}</span>
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Select different date ranges from the dropdown above to analyze different periods
            </p>
          </div>
      </div>

      <Modal isOpen={showReportModal} onClose={closeReportModal} title={reports.find(r => r.id === selectedReport)?.name || 'Report'} size="lg">
        <div className="space-y-6">
          {reportLoading ? (
            <div className="text-center py-12">
              <div className="inline-block w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
              <p className="text-slate-500 mt-4">Generating report...</p>
            </div>
          ) : (
            <>
              {selectedReport === 'profit-loss' && profitLossData && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-success-muted rounded-xl p-4 border border-success/30">
                      <p className="text-sm font-medium text-success">Total Revenue</p>
                      <p className="text-2xl font-bold text-success tabular-nums">{formatCurrency(profitLossData.revenue.total)}</p>
                    </div>
                    <div className="bg-danger-muted rounded-xl p-4 border border-danger/30">
                      <p className="text-sm font-medium text-danger">Total Expenses</p>
                      <p className="text-2xl font-bold text-danger tabular-nums">{formatCurrency(profitLossData.expenses.total)}</p>
                    </div>
                  </div>
                  <div className="bg-info-muted rounded-xl p-4 border border-info/30">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-info">Net Profit</p>
                        <p className="text-2xl font-bold text-info tabular-nums">{formatCurrency(profitLossData.netProfit)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-info">Profit Margin</p>
                        <p className="text-2xl font-bold text-info tabular-nums">{profitLossData.profitMargin.toFixed(2)}%</p>
                      </div>
                    </div>
                  </div>
                  {profitLossData.expenses.byCategory.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">Expenses by Category</h4>
                      <div className="space-y-2">
                        {profitLossData.expenses.byCategory.map((cat, i) => (
                          <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm text-slate-600">{cat.category}</span>
                            <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(cat.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedReport === 'aged-receivables' && agedReceivablesData && (
                <div className="space-y-6">
                  <div className="grid grid-cols-5 gap-3">
                    <div className="bg-success-muted rounded-lg p-3 border border-success/30 text-center">
                      <p className="text-xs font-medium text-success">Current</p>
                      <p className="text-lg font-bold text-success">{formatCurrency(agedReceivablesData.totals.current)}</p>
                    </div>
                    <div className="bg-warning-muted rounded-lg p-3 border border-warning/30 text-center">
                      <p className="text-xs font-medium text-warning">1-30 Days</p>
                      <p className="text-lg font-bold text-warning">{formatCurrency(agedReceivablesData.totals.thirtyDays)}</p>
                    </div>
                    <div className="bg-warning-muted rounded-lg p-3 border border-warning/40 text-center">
                      <p className="text-xs font-medium text-warning">31-60 Days</p>
                      <p className="text-lg font-bold text-warning">{formatCurrency(agedReceivablesData.totals.sixtyDays)}</p>
                    </div>
                    <div className="bg-danger-muted rounded-lg p-3 border border-danger/30 text-center">
                      <p className="text-xs font-medium text-danger">61-90 Days</p>
                      <p className="text-lg font-bold text-danger">{formatCurrency(agedReceivablesData.totals.ninetyDays)}</p>
                    </div>
                    <div className="bg-danger-muted rounded-lg p-3 border border-danger/50 text-center">
                      <p className="text-xs font-medium text-danger">90+ Days</p>
                      <p className="text-lg font-bold text-danger">{formatCurrency(agedReceivablesData.totals.overNinetyDays)}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
                    <p className="text-sm font-medium text-slate-600">Total Outstanding</p>
                    <p className="text-3xl font-bold text-slate-900">{formatCurrency(agedReceivablesData.totals.total)}</p>
                  </div>
                </div>
              )}

              {selectedReport === 'cash-flow' && cashFlowData && (
                <div className="space-y-6">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h4 className="text-sm font-semibold text-slate-700 mb-4">Operating Activities</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-600">Cash Receipts</span>
                        <span className="text-sm font-semibold text-success tabular-nums">+{formatCurrency(cashFlowData.operatingActivities.receipts)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-600">Cash Payments</span>
                        <span className="text-sm font-semibold text-danger tabular-nums">-{formatCurrency(cashFlowData.operatingActivities.payments)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-slate-200">
                        <span className="text-sm font-medium text-slate-700">Net Operating</span>
                        <span className={`text-sm font-bold tabular-nums ${cashFlowData.operatingActivities.net >= 0 ? 'text-success' : 'text-danger'}`}>
                          {formatCurrency(cashFlowData.operatingActivities.net)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-info-muted rounded-xl p-4 border border-info/30 text-center">
                    <p className="text-sm font-medium text-info">Net Cash Flow</p>
                    <p className={`text-3xl font-bold ${cashFlowData.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                      {formatCurrency(cashFlowData.netCashFlow)}
                    </p>
                    {cashFlowData.closingBalanceIsIndicative && (
                      <div className="mt-2 flex justify-center">
                        <Badge variant="info">Indicative base — converted across currencies</Badge>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedReport === 'invoice-report' && invoiceSummaryData && (
                <div className="space-y-6">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-info-muted rounded-lg p-3 border border-info/30 text-center">
                      <p className="text-xs font-medium text-info">Invoiced</p>
                      <p className="text-lg font-bold text-info">{formatCurrency(invoiceSummaryData.totals.invoiced)}</p>
                    </div>
                    <div className="bg-success-muted rounded-lg p-3 border border-success/30 text-center">
                      <p className="text-xs font-medium text-success">Paid</p>
                      <p className="text-lg font-bold text-success">{formatCurrency(invoiceSummaryData.totals.paid)}</p>
                    </div>
                    <div className="bg-warning-muted rounded-lg p-3 border border-warning/30 text-center">
                      <p className="text-xs font-medium text-warning">Outstanding</p>
                      <p className="text-lg font-bold text-warning">{formatCurrency(invoiceSummaryData.totals.outstanding)}</p>
                    </div>
                    <div className="bg-danger-muted rounded-lg p-3 border border-danger/30 text-center">
                      <p className="text-xs font-medium text-danger">Overdue</p>
                      <p className="text-lg font-bold text-danger">{formatCurrency(invoiceSummaryData.totals.overdue)}</p>
                    </div>
                  </div>
                  {invoiceSummaryData.byStatus.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">By Status</h4>
                      <div className="space-y-2">
                        {invoiceSummaryData.byStatus.map((status, i) => (
                          <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="capitalize">{status.status}</Badge>
                              <span className="text-sm text-slate-600">{status.count} invoices</span>
                            </div>
                            <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(status.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
                    <p className="text-sm font-medium text-slate-600">Quote to Invoice Conversion Rate</p>
                    <p className="text-3xl font-bold text-slate-900">{invoiceSummaryData.conversionRate.toFixed(1)}%</p>
                  </div>
                </div>
              )}

              {selectedReport === 'aged-payables' && agedPayablesData && (
                <div className="space-y-6">
                  <div className="grid grid-cols-5 gap-3">
                    <div className="bg-success-muted rounded-lg p-3 border border-success/30 text-center">
                      <p className="text-xs font-medium text-success">Current</p>
                      <p className="text-lg font-bold text-success">{formatCurrency(agedPayablesData.totals.current)}</p>
                    </div>
                    <div className="bg-warning-muted rounded-lg p-3 border border-warning/30 text-center">
                      <p className="text-xs font-medium text-warning">31-60 Days</p>
                      <p className="text-lg font-bold text-warning">{formatCurrency(agedPayablesData.totals.thirtyDays)}</p>
                    </div>
                    <div className="bg-warning-muted rounded-lg p-3 border border-warning/40 text-center">
                      <p className="text-xs font-medium text-warning">61-90 Days</p>
                      <p className="text-lg font-bold text-warning">{formatCurrency(agedPayablesData.totals.sixtyDays)}</p>
                    </div>
                    <div className="bg-danger-muted rounded-lg p-3 border border-danger/30 text-center">
                      <p className="text-xs font-medium text-danger">91-120 Days</p>
                      <p className="text-lg font-bold text-danger">{formatCurrency(agedPayablesData.totals.ninetyDays)}</p>
                    </div>
                    <div className="bg-danger-muted rounded-lg p-3 border border-danger/50 text-center">
                      <p className="text-xs font-medium text-danger">120+ Days</p>
                      <p className="text-lg font-bold text-danger">{formatCurrency(agedPayablesData.totals.overNinetyDays)}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
                    <p className="text-sm font-medium text-slate-600">Total Outstanding to Vendors</p>
                    <p className="text-3xl font-bold text-slate-900">{formatCurrency(agedPayablesData.totals.total)}</p>
                  </div>
                </div>
              )}

              {selectedReport === 'expense-by-category' && expenseByCategoryData && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-info-muted rounded-lg p-3 border border-info/30 text-center">
                      <p className="text-xs font-medium text-info">Total Expenses</p>
                      <p className="text-lg font-bold text-info">{formatCurrency(expenseByCategoryData.total)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-center">
                      <p className="text-xs font-medium text-slate-600">Transactions</p>
                      <p className="text-lg font-bold text-slate-900">{expenseByCategoryData.count}</p>
                    </div>
                  </div>
                  {expenseByCategoryData.rows.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No expenses in this date range.</p>
                  ) : (
                    <div className="space-y-2">
                      {expenseByCategoryData.rows.map((row, i) => (
                        <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100">
                          <div className="flex-1">
                            <div className="flex justify-between items-baseline">
                              <span className="text-sm font-medium text-slate-700">{row.category}</span>
                              <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(row.amount)}</span>
                            </div>
                            {/* Inline percentage bar — visualizes share at a glance. */}
                            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${Math.min(row.percentage, 100)}%` }}
                              />
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {row.count} expense{row.count === 1 ? '' : 's'} · {row.percentage.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedReport === 'invoice-vs-expense' && invoiceVsExpenseData && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-info-muted rounded-lg p-3 border border-info/30 text-center">
                      <p className="text-xs font-medium text-info">Revenue</p>
                      <p className="text-lg font-bold text-info">{formatCurrency(invoiceVsExpenseData.totals.revenue)}</p>
                    </div>
                    <div className="bg-danger-muted rounded-lg p-3 border border-danger/30 text-center">
                      <p className="text-xs font-medium text-danger">Expense</p>
                      <p className="text-lg font-bold text-danger">{formatCurrency(invoiceVsExpenseData.totals.expense)}</p>
                    </div>
                    <div className={`${invoiceVsExpenseData.totals.net >= 0 ? 'bg-success-muted border-success/30' : 'bg-danger-muted border-danger/30'} rounded-lg p-3 border text-center`}>
                      <p className={`text-xs font-medium ${invoiceVsExpenseData.totals.net >= 0 ? 'text-success' : 'text-danger'}`}>Net</p>
                      <p className={`text-lg font-bold ${invoiceVsExpenseData.totals.net >= 0 ? 'text-success' : 'text-danger'}`}>
                        {formatCurrency(invoiceVsExpenseData.totals.net)}
                      </p>
                    </div>
                  </div>
                  {invoiceVsExpenseData.months.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No activity in this date range.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Month</th>
                            <th className="text-right py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Revenue</th>
                            <th className="text-right py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Expense</th>
                            <th className="text-right py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceVsExpenseData.months.map((m) => (
                            <tr key={m.month} className="border-b border-slate-50">
                              <td className="py-2 font-mono text-slate-700">{m.month}</td>
                              <td className="py-2 text-right text-slate-900">{formatCurrency(m.revenue)}</td>
                              <td className="py-2 text-right text-slate-900">{formatCurrency(m.expense)}</td>
                              <td className={`py-2 text-right font-semibold ${m.net >= 0 ? 'text-success' : 'text-danger'}`}>
                                {formatCurrency(m.net)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {!['profit-loss', 'aged-receivables', 'aged-payables', 'cash-flow', 'invoice-report', 'expense-by-category', 'invoice-vs-expense'].includes(selectedReport || '') && (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">This report is not yet available.</p>
                  <p className="text-sm text-slate-400 mt-2">Coming soon!</p>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button variant="secondary" onClick={closeReportModal}>Close</Button>
            {(profitLossData || agedReceivablesData || agedPayablesData || cashFlowData || expenseByCategoryData || invoiceVsExpenseData) && (
              <Button onClick={handleExportCSV} className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
