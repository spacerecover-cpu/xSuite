import { supabase } from './supabaseClient';

export interface ProfitLossData {
  revenue: {
    total: number;
    byCategory: Array<{ category: string; amount: number }>;
  };
  expenses: {
    total: number;
    byCategory: Array<{ category: string; amount: number }>;
  };
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
}

export interface AgedReceivablesData {
  current: Array<{ customer: string; amount: number; invoices: number }>;
  thirtyDays: Array<{ customer: string; amount: number; invoices: number }>;
  sixtyDays: Array<{ customer: string; amount: number; invoices: number }>;
  ninetyDays: Array<{ customer: string; amount: number; invoices: number }>;
  overNinetyDays: Array<{ customer: string; amount: number; invoices: number }>;
  totals: {
    current: number;
    thirtyDays: number;
    sixtyDays: number;
    ninetyDays: number;
    overNinetyDays: number;
    total: number;
  };
}

export interface CashFlowData {
  operatingActivities: {
    receipts: number;
    payments: number;
    net: number;
  };
  investingActivities: {
    inflows: number;
    outflows: number;
    net: number;
  };
  netCashFlow: number;
  openingBalance: number;
  closingBalance: number;
}

export interface InvoiceSummaryData {
  byStatus: Array<{ status: string; count: number; amount: number }>;
  byType: Array<{ type: string; count: number; amount: number }>;
  totals: {
    invoiced: number;
    paid: number;
    outstanding: number;
    overdue: number;
  };
  conversionRate: number;
}

export const generateProfitLossReport = async (
  dateFrom: string,
  dateTo: string
): Promise<ProfitLossData> => {
  const [invoicesResult, expensesResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('amount_paid, status')
      .gte('invoice_date', dateFrom)
      .lte('invoice_date', dateTo),
    supabase
      .from('expenses')
      .select(`
        amount,
        status,
        category:master_expense_categories(name)
      `)
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo)
      .in('status', ['approved', 'paid']),
  ]);

  const invoices = invoicesResult.data || [];
  const expenses = expensesResult.data || [];

  const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);

  const expensesByCategory: Record<string, number> = {};
  expenses.forEach((exp: any) => {
    const categoryName = exp.category?.name || 'Uncategorized';
    expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + (exp.amount || 0);
  });

  const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const grossProfit = totalRevenue - totalExpenses;
  const netProfit = grossProfit;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    revenue: {
      total: totalRevenue,
      byCategory: [{ category: 'Services', amount: totalRevenue }],
    },
    expenses: {
      total: totalExpenses,
      byCategory: Object.entries(expensesByCategory).map(([category, amount]) => ({
        category,
        amount,
      })),
    },
    grossProfit,
    netProfit,
    profitMargin,
  };
};

export const generateAgedReceivablesReport = async (): Promise<AgedReceivablesData> => {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_date,
      due_date,
      balance_due,
      customer:customers_enhanced(id, customer_name)
    `)
    .gt('balance_due', 0)
    .in('status', ['sent', 'partial', 'overdue']);

  if (error) throw error;

  const buckets: Record<string, Array<{ customer: string; amount: number; invoices: number }>> = {
    current: [],
    thirtyDays: [],
    sixtyDays: [],
    ninetyDays: [],
    overNinetyDays: [],
  };

  const customerTotals: Record<string, Record<string, { amount: number; invoices: number }>> = {};

  (invoices || []).forEach((inv: any) => {
    const dueDate = new Date(inv.due_date || inv.invoice_date);
    const daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const customerName = inv.customer?.customer_name || 'Unknown';

    let bucket: string;
    if (daysPastDue <= 0) {
      bucket = 'current';
    } else if (daysPastDue <= 30) {
      bucket = 'thirtyDays';
    } else if (daysPastDue <= 60) {
      bucket = 'sixtyDays';
    } else if (daysPastDue <= 90) {
      bucket = 'ninetyDays';
    } else {
      bucket = 'overNinetyDays';
    }

    if (!customerTotals[customerName]) {
      customerTotals[customerName] = {};
    }
    if (!customerTotals[customerName][bucket]) {
      customerTotals[customerName][bucket] = { amount: 0, invoices: 0 };
    }
    customerTotals[customerName][bucket].amount += inv.balance_due || 0;
    customerTotals[customerName][bucket].invoices += 1;
  });

  Object.entries(customerTotals).forEach(([customer, bucketData]) => {
    Object.entries(bucketData).forEach(([bucket, data]) => {
      buckets[bucket].push({ customer, ...data });
    });
  });

  Object.keys(buckets).forEach(bucket => {
    buckets[bucket].sort((a, b) => b.amount - a.amount);
  });

  const totals = {
    current: buckets.current.reduce((sum, c) => sum + c.amount, 0),
    thirtyDays: buckets.thirtyDays.reduce((sum, c) => sum + c.amount, 0),
    sixtyDays: buckets.sixtyDays.reduce((sum, c) => sum + c.amount, 0),
    ninetyDays: buckets.ninetyDays.reduce((sum, c) => sum + c.amount, 0),
    overNinetyDays: buckets.overNinetyDays.reduce((sum, c) => sum + c.amount, 0),
    total: 0,
  };
  totals.total = totals.current + totals.thirtyDays + totals.sixtyDays + totals.ninetyDays + totals.overNinetyDays;

  return {
    ...buckets,
    totals,
  } as AgedReceivablesData;
};

export const generateCashFlowReport = async (
  dateFrom: string,
  dateTo: string
): Promise<CashFlowData> => {
  const [paymentsResult, expensesResult, bankAccountsResult] = await Promise.all([
    supabase
      .from('payments')
      .select('amount, status')
      .gte('payment_date', dateFrom)
      .lte('payment_date', dateTo)
      .eq('status', 'completed'),
    supabase
      .from('expenses')
      .select('amount, status')
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo)
      .in('status', ['approved', 'paid']),
    supabase
      .from('bank_accounts')
      .select('current_balance, opening_balance')
      .eq('is_active', true),
  ]);

  const receipts = (paymentsResult.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  const payments = (expensesResult.data || []).reduce((sum, e) => sum + (e.amount || 0), 0);

  const totalCurrentBalance = (bankAccountsResult.data || []).reduce((sum, a) => sum + (a.current_balance || 0), 0);
  const totalOpeningBalance = (bankAccountsResult.data || []).reduce((sum, a) => sum + (a.opening_balance || 0), 0);

  return {
    operatingActivities: {
      receipts,
      payments,
      net: receipts - payments,
    },
    investingActivities: {
      inflows: 0,
      outflows: 0,
      net: 0,
    },
    netCashFlow: receipts - payments,
    openingBalance: totalOpeningBalance,
    closingBalance: totalCurrentBalance,
  };
};

export const generateInvoiceSummaryReport = async (
  dateFrom: string,
  dateTo: string
): Promise<InvoiceSummaryData> => {
  const [invoicesResult, quotesResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('status, invoice_type, total_amount, amount_paid, balance_due')
      .gte('invoice_date', dateFrom)
      .lte('invoice_date', dateTo),
    supabase
      .from('quotes')
      .select('status')
      .gte('quote_date', dateFrom)
      .lte('quote_date', dateTo),
  ]);

  const invoices = invoicesResult.data || [];
  const quotes = quotesResult.data || [];

  const byStatus: Record<string, { count: number; amount: number }> = {};
  const byType: Record<string, { count: number; amount: number }> = {};

  invoices.forEach(inv => {
    const status = inv.status ?? 'unknown';
    if (!byStatus[status]) {
      byStatus[status] = { count: 0, amount: 0 };
    }
    byStatus[status].count += 1;
    byStatus[status].amount += inv.total_amount || 0;

    const type = inv.invoice_type === 'proforma' ? 'Proforma' : 'Tax Invoice';
    if (!byType[type]) {
      byType[type] = { count: 0, amount: 0 };
    }
    byType[type].count += 1;
    byType[type].amount += inv.total_amount || 0;
  });

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0);
  const totalOverdue = invoices
    .filter(inv => inv.status === 'overdue')
    .reduce((sum, inv) => sum + (inv.balance_due || 0), 0);

  const convertedQuotes = quotes.filter(q => q.status === 'converted').length;
  const conversionRate = quotes.length > 0 ? (convertedQuotes / quotes.length) * 100 : 0;

  return {
    byStatus: Object.entries(byStatus).map(([status, data]) => ({
      status,
      ...data,
    })),
    byType: Object.entries(byType).map(([type, data]) => ({
      type,
      ...data,
    })),
    totals: {
      invoiced: totalInvoiced,
      paid: totalPaid,
      outstanding: totalOutstanding,
      overdue: totalOverdue,
    },
    conversionRate,
  };
};

export const generateRevenueByCustomerReport = async (
  dateFrom: string,
  dateTo: string
) => {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      amount_paid,
      customer:customers_enhanced(id, customer_name, email)
    `)
    .gte('invoice_date', dateFrom)
    .lte('invoice_date', dateTo);

  if (error) throw error;

  const customerRevenue: Record<string, { name: string; email: string; amount: number; count: number }> = {};

  (data || []).forEach((inv: any) => {
    const customerId = inv.customer?.id || 'unknown';
    const customerName = inv.customer?.customer_name || 'Unknown';
    const email = inv.customer?.email || '';

    if (!customerRevenue[customerId]) {
      customerRevenue[customerId] = { name: customerName, email, amount: 0, count: 0 };
    }
    customerRevenue[customerId].amount += inv.amount_paid || 0;
    customerRevenue[customerId].count += 1;
  });

  return Object.entries(customerRevenue)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.amount - a.amount);
};

export const generateRevenueByCaseReport = async (
  dateFrom: string,
  dateTo: string
) => {
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select(`
      amount_paid,
      case_id,
      cases(id, case_no, title)
    `)
    .gte('invoice_date', dateFrom)
    .lte('invoice_date', dateTo);

  if (invError) throw invError;

  const { data: expenses, error: expError } = await supabase
    .from('expenses')
    .select(`
      amount,
      case_id,
      cases(id, case_no, title)
    `)
    .gte('expense_date', dateFrom)
    .lte('expense_date', dateTo)
    .not('case_id', 'is', null)
    .in('status', ['approved', 'paid']);

  if (expError) throw expError;

  const caseFinancials: Record<string, {
    caseNo: string;
    title: string;
    revenue: number;
    expenses: number;
    profit: number;
  }> = {};

  (invoices || []).forEach((inv: any) => {
    if (!inv.case_id) return;
    if (!caseFinancials[inv.case_id]) {
      caseFinancials[inv.case_id] = {
        caseNo: inv.cases?.case_no || '',
        title: inv.cases?.title || '',
        revenue: 0,
        expenses: 0,
        profit: 0,
      };
    }
    caseFinancials[inv.case_id].revenue += inv.amount_paid || 0;
  });

  (expenses || []).forEach((exp: any) => {
    if (!exp.case_id) return;
    if (!caseFinancials[exp.case_id]) {
      caseFinancials[exp.case_id] = {
        caseNo: exp.cases?.case_no || '',
        title: exp.cases?.title || '',
        revenue: 0,
        expenses: 0,
        profit: 0,
      };
    }
    caseFinancials[exp.case_id].expenses += exp.amount || 0;
  });

  Object.values(caseFinancials).forEach(c => {
    c.profit = c.revenue - c.expenses;
  });

  return Object.entries(caseFinancials)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.revenue - a.revenue);
};

export const exportReportToCSV = (
  data: any[],
  columns: { key: string; label: string }[],
  filename: string
) => {
  const header = columns.map(c => c.label).join(',');
  const rows = data.map(row =>
    columns.map(c => {
      const value = row[c.key];
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value ?? '';
    }).join(',')
  );

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();

  URL.revokeObjectURL(url);
};

export const financialReportsService = {
  generateProfitLossReport,
  generateAgedReceivablesReport,
  generateCashFlowReport,
  generateInvoiceSummaryReport,
  generateRevenueByCustomerReport,
  generateRevenueByCaseReport,
  exportReportToCSV,
};
