import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DollarSign, Receipt, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatDate } from '../../lib/format';
import { baseAmount } from '../../lib/financialMath';
import { useCurrency } from '../../hooks/useCurrency';

interface CustomerFinancialTabProps {
  customerId?: string;
  companyId?: string;
}

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  total_amount_base: number | null;
  amount_paid_base: number | null;
  balance_due_base: number | null;
  status: string | null;
  is_proforma: boolean | null;
  [key: string]: unknown;
}

interface QuoteRow {
  id: string;
  quote_number: string | null;
  quote_date: string | null;
  total_amount: number | null;
  status: string | null;
}

function invoiceStatusVariant(s: string | null): 'success' | 'warning' | 'info' | 'secondary' | 'danger' {
  if (!s) return 'secondary';
  const v = s.toLowerCase();
  if (v.includes('paid')) return 'success';
  if (v.includes('void') || v.includes('cancel')) return 'danger';
  if (v.includes('overdue')) return 'danger';
  if (v.includes('partial')) return 'warning';
  if (v.includes('sent') || v.includes('issued')) return 'info';
  return 'secondary';
}

export function CustomerFinancialTab({ customerId, companyId }: CustomerFinancialTabProps) {
  const navigate = useNavigate();
  const filterCol = customerId ? 'customer_id' : 'company_id';
  const filterVal = customerId ?? companyId ?? '';
  const { formatCurrency } = useCurrency();

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['profile-invoices', filterCol, filterVal],
    queryFn: async (): Promise<InvoiceRow[]> => {
      if (!filterVal) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, total_amount, amount_paid, balance_due, total_amount_base, amount_paid_base, balance_due_base, status, is_proforma')
        .eq(filterCol, filterVal)
        .is('deleted_at', null)
        .order('invoice_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
    enabled: Boolean(filterVal),
  });

  const { data: quotes = [], isLoading: loadingQuotes } = useQuery({
    queryKey: ['profile-quotes', filterCol, filterVal],
    queryFn: async (): Promise<QuoteRow[]> => {
      if (!filterVal) return [];
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, quote_date, total_amount, status')
        .eq(filterCol, filterVal)
        .is('deleted_at', null)
        .order('quote_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as QuoteRow[];
    },
    enabled: Boolean(filterVal),
  });

  // Pure invoices (not proformas) drive the financial summary.
  // Proformas live in quotes essentially; double-counting would inflate KPIs.
  const realInvoices = invoices.filter((i) => !i.is_proforma);
  const totals = realInvoices.reduce(
    (acc, inv) => {
      acc.invoiced += baseAmount(inv, 'total_amount');
      acc.paid += baseAmount(inv, 'amount_paid');
      acc.outstanding += baseAmount(inv, 'balance_due');
      return acc;
    },
    { invoiced: 0, paid: 0, outstanding: 0 },
  );

  const isLoading = loadingInvoices || loadingQuotes;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <div className="p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-24" />
              </div>
            </Card>
          ))}
        </div>
        <Card>
          <div className="p-6 space-y-3">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (invoices.length === 0 && quotes.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <DollarSign className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <p className="text-lg">No financial history yet</p>
        <p className="text-sm mt-2">
          Quotes, invoices, and payments for this {customerId ? 'customer' : 'company'} will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <div className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Total Invoiced</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totals.invoiced)}</p>
            <p className="text-xs text-slate-500 mt-1">{realInvoices.length} invoice(s)</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Total Paid</p>
            <p className="text-2xl font-bold text-success mt-1">{formatCurrency(totals.paid)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Outstanding</p>
            <p className={`text-2xl font-bold mt-1 ${totals.outstanding > 0 ? 'text-warning' : 'text-slate-500'}`}>
              {formatCurrency(totals.outstanding)}
            </p>
          </div>
        </Card>
      </div>

      {invoices.length > 0 && (
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-slate-900">Invoices</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-3 font-medium text-slate-600">Invoice #</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Date</th>
                    <th className="text-right pb-3 font-medium text-slate-600">Amount</th>
                    <th className="text-right pb-3 font-medium text-slate-600">Balance</th>
                    <th className="text-center pb-3 font-medium text-slate-600">Status</th>
                    <th className="text-right pb-3 font-medium text-slate-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                    >
                      <td className="py-3 font-mono text-primary">
                        {inv.invoice_number ?? '—'}
                        {inv.is_proforma && (
                          <span className="ml-1 text-[10px] uppercase text-slate-400 font-sans">
                            Proforma
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-slate-600">
                        {inv.invoice_date ? formatDate(inv.invoice_date) : '—'}
                      </td>
                      <td className="py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(inv.total_amount ?? 0)}
                      </td>
                      <td className="py-3 text-right text-slate-700">
                        {formatCurrency(inv.balance_due ?? 0)}
                      </td>
                      <td className="py-3 text-center">
                        <Badge variant={invoiceStatusVariant(inv.status)} size="sm">
                          {inv.status ?? 'draft'}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <ExternalLink className="w-4 h-4 text-slate-400 inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {quotes.length > 0 && (
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-secondary" />
              <h3 className="text-lg font-semibold text-slate-900">Quotes</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-3 font-medium text-slate-600">Quote #</th>
                    <th className="text-left pb-3 font-medium text-slate-600">Date</th>
                    <th className="text-right pb-3 font-medium text-slate-600">Amount</th>
                    <th className="text-center pb-3 font-medium text-slate-600">Status</th>
                    <th className="text-right pb-3 font-medium text-slate-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {quotes.map((q) => (
                    <tr
                      key={q.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/quotes/${q.id}`)}
                    >
                      <td className="py-3 font-mono text-primary">{q.quote_number ?? '—'}</td>
                      <td className="py-3 text-slate-600">
                        {q.quote_date ? formatDate(q.quote_date) : '—'}
                      </td>
                      <td className="py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(q.total_amount ?? 0)}
                      </td>
                      <td className="py-3 text-center">
                        <Badge variant={invoiceStatusVariant(q.status)} size="sm">
                          {q.status ?? 'draft'}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <ExternalLink className="w-4 h-4 text-slate-400 inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
