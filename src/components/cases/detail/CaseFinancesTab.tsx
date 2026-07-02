import React from 'react';
import { FileText, DollarSign, Eye, CreditCard, RefreshCw, Lock, ExternalLink, TrendingUp, TrendingDown, Minus, Receipt, Wallet, Send } from 'lucide-react';
import { CreditCard as Edit } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { getCaseExpenses, getCasePayments, type CaseExpense, type CasePayment, type CaseFinancialSummary } from '@/lib/caseFinanceService';
import { formatDate, formatCurrencyWithConfig } from '@/lib/format';
import { useCurrencyConfig } from '@/contexts/TenantConfigContext';
import { useAuth } from '@/contexts/AuthContext';
import { toQuoteEditInitialData } from '@/lib/quotesService';
import { toInvoiceEditInitialData } from '@/lib/invoiceService';
import { useNavigate } from 'react-router-dom';

// Row shapes match the live DB schema (quotes / invoices tables) plus the
// currency_symbol/position/decimal_places fields injected by
// quotesService.getQuotesByCaseId() / invoiceService.getInvoicesByCaseId().
// Some legacy fields the UI references (title, converted_to_invoice_id,
// proforma_invoice_id) do not exist on the live invoices table — they are
// kept as optional so the existing guards short-circuit cleanly.
interface CaseQuoteRow {
  id: string;
  quote_number: string | null;
  status: string | null;
  title?: string | null;
  total_amount: number | null;
  valid_until: string | null;
  created_at: string;
  currency_symbol?: string;
  currency_position?: string;
  decimal_places?: number;
}

interface CaseInvoiceRow {
  id: string;
  invoice_number: string | null;
  invoice_type: string | null;
  status: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  due_date: string | null;
  created_at: string;
  converted_to_invoice_id?: string | null;
  proforma_invoice_id?: string | null;
  currency_symbol?: string;
  currency_position?: string;
  decimal_places?: number;
}

interface QuoteServiceLike {
  fetchQuoteById: (id: string) => Promise<unknown>;
}

interface InvoiceServiceLike {
  fetchInvoiceById: (id: string) => Promise<unknown>;
}

interface CaseFinancesTabProps {
  caseId: string;
  quotes: CaseQuoteRow[];
  invoices: CaseInvoiceRow[];
  caseFinancialSummary: CaseFinancialSummary | null | undefined;
  formatCurrency: (amount: number) => string;
  onSetShowQuoteModal: (v: boolean) => void;
  onSetShowInvoiceModal: (v: boolean) => void;
  onSetEditingQuote: (q: unknown) => void;
  onSetEditingInvoice: (inv: unknown) => void;
  onSetViewingQuote: (q: unknown) => void;
  onSetViewingInvoice: (inv: unknown) => void;
  onHandleRecordPayment: (invoice: CaseInvoiceRow) => void;
  onHandleIssueInvoice: (invoice: CaseInvoiceRow) => void;
  onSetConvertingInvoice: (inv: CaseInvoiceRow) => void;
  onSetShowConvertProformaModal: (v: boolean) => void;
  quotesService: QuoteServiceLike;
  invoiceService: InvoiceServiceLike;
}

const CountPill: React.FC<{ value: number }> = ({ value }) => (
  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold leading-none">
    {value}
  </span>
);

export const CaseFinancesTab: React.FC<CaseFinancesTabProps> = ({
  caseId,
  quotes,
  invoices,
  caseFinancialSummary,
  formatCurrency,
  onSetShowQuoteModal,
  onSetShowInvoiceModal,
  onSetEditingQuote,
  onSetEditingInvoice,
  onSetViewingQuote,
  onSetViewingInvoice,
  onHandleRecordPayment,
  onHandleIssueInvoice,
  onSetConvertingInvoice,
  onSetShowConvertProformaModal,
  quotesService,
  invoiceService,
}) => {
  const navigate = useNavigate();
  const currencyConfig = useCurrencyConfig();
  const { profile } = useAuth();
  const isOwnerAdmin = ['owner', 'admin'].includes(profile?.role ?? '');

  const { data: expenses = [] } = useQuery<CaseExpense[]>({
    queryKey: ['case_expenses', caseId],
    queryFn: () => getCaseExpenses(caseId),
    enabled: !!caseId,
  });

  const { data: payments = [] } = useQuery<CasePayment[]>({
    queryKey: ['case_payments', caseId],
    queryFn: () => getCasePayments(caseId),
    enabled: !!caseId,
  });

  const margin = caseFinancialSummary?.profitMargin ?? 0;
  const marginColor = margin > 20 ? 'text-success' : margin >= 0 ? 'text-warning' : 'text-danger';
  const MarginIcon = margin > 20 ? TrendingUp : margin >= 0 ? Minus : TrendingDown;

  const outstanding = caseFinancialSummary?.outstandingBalance ?? 0;
  const fullyCollected = outstanding <= 0;
  const collectedPct = caseFinancialSummary && caseFinancialSummary.totalInvoiced > 0
    ? Math.round((caseFinancialSummary.totalPaid / caseFinancialSummary.totalInvoiced) * 100)
    : 0;
  const invoicesDue = invoices.filter((inv) => (inv.balance_due ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-5">
          {/* Single heading — no duplicate section titles below */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Quotes &amp; Invoices
            </h2>
            <div className="flex gap-2">
              <Button onClick={() => { onSetEditingQuote(null); onSetShowQuoteModal(true); }} style={{ backgroundColor: 'rgb(var(--color-success))' }} size="sm">
                <DollarSign className="w-4 h-4 mr-2" />
                New Quote
              </Button>
              <Button onClick={() => { onSetEditingInvoice(null); onSetShowInvoiceModal(true); }} size="sm">
                <FileText className="w-4 h-4 mr-2" />
                New Invoice
              </Button>
            </div>
          </div>

          {/* Compact KPI strip — 4th tile is Outstanding */}
          {caseFinancialSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
              <div className="bg-success-muted rounded-lg p-3 border border-success/20">
                <p className="text-xs font-semibold text-success uppercase tracking-wider">Quoted</p>
                <p className="text-lg font-bold text-success mt-0.5 truncate tabular-nums">{formatCurrency(caseFinancialSummary.totalQuoted)}</p>
                <p className="text-xs text-success/80 mt-0.5">{caseFinancialSummary.quotesCount} {caseFinancialSummary.quotesCount === 1 ? 'quote' : 'quotes'}</p>
              </div>
              <div className="bg-info-muted rounded-lg p-3 border border-info/20">
                <p className="text-xs font-semibold text-info uppercase tracking-wider">Invoiced</p>
                <p className="text-lg font-bold text-info mt-0.5 truncate tabular-nums">{formatCurrency(caseFinancialSummary.totalInvoiced)}</p>
                <p className="text-xs text-info/80 mt-0.5">{caseFinancialSummary.invoicesCount} {caseFinancialSummary.invoicesCount === 1 ? 'invoice' : 'invoices'}</p>
              </div>
              <div className="bg-success/10 rounded-lg p-3 border border-success/25">
                <p className="text-xs font-semibold text-success uppercase tracking-wider">Received</p>
                <p className="text-lg font-bold text-success mt-0.5 truncate tabular-nums">{formatCurrency(caseFinancialSummary.totalPaid)}</p>
                <p className="text-xs text-success/80 mt-0.5">{collectedPct}% collected</p>
              </div>
              <div className={`rounded-lg p-3 border ${fullyCollected ? 'bg-success-muted border-success/20' : 'bg-warning-muted border-warning/20'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wider ${fullyCollected ? 'text-success' : 'text-warning'}`}>Outstanding</p>
                <p className={`text-lg font-bold mt-0.5 truncate tabular-nums ${fullyCollected ? 'text-success' : 'text-warning'}`}>{formatCurrency(outstanding)}</p>
                <p className={`text-xs mt-0.5 ${fullyCollected ? 'text-success/80' : 'text-warning/80'}`}>
                  {fullyCollected ? 'Fully collected' : `${invoicesDue} ${invoicesDue === 1 ? 'invoice' : 'invoices'} due`}
                </p>
              </div>
            </div>
          )}

          {/* Expenses + margin — compact line, owner/admin only */}
          {isOwnerAdmin && caseFinancialSummary && (
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-500 bg-surface-muted border border-border rounded-lg px-3 py-2 mb-4">
              <span className="inline-flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-warning" />
                Expenses <b className="text-slate-700 tabular-nums">{formatCurrency(caseFinancialSummary.totalExpenses)}</b>
              </span>
              <span className="inline-flex items-center gap-1.5">
                Profit margin
                <span className={`inline-flex items-center gap-1 font-semibold ${marginColor}`}>
                  <MarginIcon className="w-3 h-3" />
                  {margin.toFixed(1)}%
                </span>
              </span>
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                <Lock className="w-3 h-3" />
                Owner / Admin only
              </span>
            </div>
          )}

          {/* Two columns: compact rows */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Quotes */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-success" />
                Quotes
                <CountPill value={quotes.length} />
              </h3>
              {quotes.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-success-muted/40 rounded-lg border-2 border-dashed border-success/30">
                  <DollarSign className="w-8 h-8 mx-auto mb-2 text-success/40" />
                  <p className="text-sm font-medium text-slate-600">No quotes yet.</p>
                  <p className="text-xs text-slate-500 mt-0.5">Use “New Quote” above.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                  {quotes.map((quote) => (
                    <div key={quote.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-success/60 hover:shadow-sm transition-all bg-white">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900">{quote.quote_number || 'Draft'}</span>
                          <Badge
                            variant="custom"
                            color={
                              quote.status === 'draft' ? '#64748b'
                                : quote.status === 'sent' ? '#3b82f6'
                                : quote.status === 'accepted' ? '#10b981'
                                : quote.status === 'rejected' ? '#ef4444'
                                : '#f59e0b'
                            }
                            size="sm"
                          >
                            {quote.status}
                          </Badge>
                          <span className="text-xs font-medium text-slate-700 tabular-nums">{formatCurrencyWithConfig(quote.total_amount ?? 0, currencyConfig)}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {quote.title ? `${quote.title} • ` : ''}Created {formatDate(quote.created_at)}
                          {quote.valid_until && ` • Valid until ${formatDate(quote.valid_until)}`}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            const fullQuote = await quotesService.fetchQuoteById(quote.id);
                            onSetViewingQuote(fullQuote);
                          }}
                          title="View Quote"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            const fullQuote = await quotesService.fetchQuoteById(quote.id);
                            const editData = fullQuote ? toQuoteEditInitialData(fullQuote as Record<string, unknown>) : null;
                            onSetEditingQuote(editData);
                            onSetShowQuoteModal(true);
                          }}
                          title="Edit Quote"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invoices */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Invoices
                <CountPill value={invoices.length} />
              </h3>
              {invoices.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-info-muted/40 rounded-lg border-2 border-dashed border-info/30">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-info/40" />
                  <p className="text-sm font-medium text-slate-600">No invoices yet.</p>
                  <p className="text-xs text-slate-500 mt-0.5">Use “New Invoice” above.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-primary/60 hover:shadow-sm transition-all bg-white">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900">{invoice.invoice_number || 'Draft'}</span>
                          {invoice.invoice_type === 'proforma' ? (
                            <Badge variant="accent" size="sm">Proforma</Badge>
                          ) : (
                            <Badge variant="custom" color="rgb(var(--color-primary))" size="sm">Tax</Badge>
                          )}
                          {invoice.status === 'converted' ? (
                            <Badge variant="accent" size="sm">{invoice.status}</Badge>
                          ) : (
                            <Badge
                              variant="custom"
                              color={
                                invoice.status === 'draft' ? '#64748b'
                                  : invoice.status === 'sent' ? '#3b82f6'
                                  : invoice.status === 'paid' ? '#10b981'
                                  : invoice.status === 'overdue' ? '#ef4444'
                                  : '#f59e0b'
                              }
                              size="sm"
                            >
                              {invoice.status}
                            </Badge>
                          )}
                          {invoice.status === 'converted' && invoice.converted_to_invoice_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/invoices/${invoice.converted_to_invoice_id}`);
                              }}
                              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                              title="View converted tax invoice"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Tax Invoice</span>
                            </button>
                          )}
                          {invoice.proforma_invoice_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/invoices/${invoice.proforma_invoice_id}`);
                              }}
                              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                              title="View original proforma"
                            >
                              <span>From Proforma</span>
                            </button>
                          )}
                        </div>
                        <div className="text-xs flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-700 tabular-nums">{formatCurrencyWithConfig(invoice.total_amount ?? 0, currencyConfig)}</span>
                          {(invoice.amount_paid ?? 0) > 0 && (
                            <span className="text-success tabular-nums">Paid {formatCurrencyWithConfig(invoice.amount_paid ?? 0, currencyConfig)}</span>
                          )}
                          {(invoice.balance_due ?? 0) > 0 && (
                            <span className="text-warning tabular-nums">Bal {formatCurrencyWithConfig(invoice.balance_due ?? 0, currencyConfig)}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          Created {formatDate(invoice.created_at)}
                          {invoice.due_date && ` • Due ${formatDate(invoice.due_date)}`}
                        </p>
                      </div>
                      <div className="flex gap-1 items-center shrink-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            const fullInvoice = await invoiceService.fetchInvoiceById(invoice.id);
                            onSetViewingInvoice(fullInvoice);
                          }}
                          title="View Invoice"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {invoice.status !== 'converted' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              const fullInvoice = await invoiceService.fetchInvoiceById(invoice.id);
                              const editData = fullInvoice ? toInvoiceEditInitialData(fullInvoice as Record<string, unknown>) : null;
                              onSetEditingInvoice(editData);
                              onSetShowInvoiceModal(true);
                            }}
                            title="Edit Invoice"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {invoice.invoice_type === 'tax_invoice' && invoice.status === 'draft' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onHandleIssueInvoice(invoice)}
                            title="Issue Invoice — enables payment recording"
                            style={{ backgroundColor: 'rgb(var(--color-info))', color: 'rgb(var(--color-info-foreground))' }}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        )}
                        {invoice.invoice_type === 'tax_invoice' && invoice.status !== 'draft' && (invoice.balance_due ?? 0) > 0 && invoice.status !== 'paid' && invoice.status !== 'void' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onHandleRecordPayment(invoice)}
                            title="Record Payment"
                            style={{ backgroundColor: 'rgb(var(--color-success))', color: 'rgb(var(--color-success-foreground))' }}
                          >
                            <CreditCard className="w-4 h-4" />
                          </Button>
                        )}
                        {invoice.invoice_type === 'proforma' && invoice.status !== 'converted' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              onSetConvertingInvoice(invoice);
                              onSetShowConvertProformaModal(true);
                            }}
                            title="Convert to Tax Invoice"
                            style={{ backgroundColor: 'rgb(var(--color-primary))', color: 'rgb(var(--color-primary-foreground))' }}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        )}
                        {invoice.invoice_type === 'proforma' && invoice.status === 'converted' && (
                          <div className="flex items-center gap-1 ml-1" title="Read-only (Converted)">
                            <Lock className="w-4 h-4 text-slate-400" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Payment history — folded into the same card as a compact chip grid */}
          {payments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dashed border-slate-200">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
                <Wallet className="w-3.5 h-3.5 text-success" />
                Payment History
                <CountPill value={payments.length} />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-0.5">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-center gap-2.5 bg-success/5 border border-success/20 rounded-lg px-3 py-2">
                    <div className="w-7 h-7 bg-success/15 rounded-full flex items-center justify-center shrink-0">
                      <CreditCard className="w-3.5 h-3.5 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{payment.payment_number}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {formatDate(payment.payment_date)}
                        {payment.payment_method?.name && ` • ${payment.payment_method.name}`}
                        {payment.invoice?.invoice_number && ` • ${payment.invoice.invoice_number}`}
                      </p>
                    </div>
                    <p className="text-xs font-bold text-success tabular-nums shrink-0">{formatCurrency(payment.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Case Expenses — detailed list, owner/admin only */}
      {isOwnerAdmin && expenses.length > 0 && (
        <Card>
          <div className="p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
              <Receipt className="w-3.5 h-3.5 text-warning" />
              Case Expenses
              <CountPill value={expenses.length} />
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between gap-2 p-2.5 bg-warning-muted border border-warning/20 rounded-lg">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 bg-warning/20 rounded-full flex items-center justify-center shrink-0">
                      <Receipt className="w-3.5 h-3.5 text-warning" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">
                        {expense.description || expense.expense_number}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {formatDate(expense.expense_date)}
                        {expense.category?.name && ` • ${expense.category.name}`}
                        {expense.vendor && ` • ${expense.vendor}`}
                        {expense.submitter?.full_name && ` • By ${expense.submitter.full_name}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-warning tabular-nums">{formatCurrencyWithConfig(expense.amount ?? 0, currencyConfig)}</p>
                    <Badge
                      variant="custom"
                      color={expense.status === 'paid' ? '#10b981' : expense.status === 'approved' ? '#3b82f6' : '#64748b'}
                      size="sm"
                    >
                      {expense.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
