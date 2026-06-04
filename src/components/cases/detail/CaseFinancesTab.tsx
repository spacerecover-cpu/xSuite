import React from 'react';
import { FileText, DollarSign, Plus, Eye, CreditCard, RefreshCw, Lock, ExternalLink, TrendingUp, TrendingDown, Minus, Receipt, Wallet } from 'lucide-react';
import { CreditCard as Edit } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { getCaseExpenses, getCasePayments, type CaseExpense, type CasePayment, type CaseFinancialSummary } from '@/lib/caseFinanceService';
import { formatDate } from '@/lib/format';
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
  formatCurrencyAmount: (amount: number, symbol: string, position: string, decimals: number) => string;
  onSetShowQuoteModal: (v: boolean) => void;
  onSetShowInvoiceModal: (v: boolean) => void;
  onSetEditingQuote: (q: unknown) => void;
  onSetEditingInvoice: (inv: unknown) => void;
  onSetViewingQuote: (q: unknown) => void;
  onSetViewingInvoice: (inv: unknown) => void;
  onHandleRecordPayment: (invoice: CaseInvoiceRow) => void;
  onSetConvertingInvoice: (inv: CaseInvoiceRow) => void;
  onSetShowConvertProformaModal: (v: boolean) => void;
  quotesService: QuoteServiceLike;
  invoiceService: InvoiceServiceLike;
}

export const CaseFinancesTab: React.FC<CaseFinancesTabProps> = ({
  caseId,
  quotes,
  invoices,
  caseFinancialSummary,
  formatCurrency,
  formatCurrencyAmount,
  onSetShowQuoteModal,
  onSetShowInvoiceModal,
  onSetEditingQuote,
  onSetEditingInvoice,
  onSetViewingQuote,
  onSetViewingInvoice,
  onHandleRecordPayment,
  onSetConvertingInvoice,
  onSetShowConvertProformaModal,
  quotesService,
  invoiceService,
}) => {
  const navigate = useNavigate();

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

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">Quotes & Invoices</h2>
            <div className="flex gap-2">
              <Button onClick={() => onSetShowQuoteModal(true)} style={{ backgroundColor: 'rgb(var(--color-success))' }} size="sm">
                <DollarSign className="w-4 h-4 mr-2" />
                New Quote
              </Button>
              <Button onClick={() => onSetShowInvoiceModal(true)} size="sm">
                <FileText className="w-4 h-4 mr-2" />
                New Invoice
              </Button>
            </div>
          </div>

          {caseFinancialSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-success-muted rounded-xl p-4 border border-success/20">
                <p className="text-xs font-medium text-success uppercase tracking-wide">Quoted</p>
                <p className="text-xl font-bold text-success mt-1">{formatCurrency(caseFinancialSummary.totalQuoted)}</p>
                <p className="text-xs text-success mt-1">{caseFinancialSummary.quotesCount} quotes</p>
              </div>
              <div className="bg-info-muted rounded-xl p-4 border border-info/20">
                <p className="text-xs font-medium text-info uppercase tracking-wide">Invoiced</p>
                <p className="text-xl font-bold text-info mt-1">{formatCurrency(caseFinancialSummary.totalInvoiced)}</p>
                <p className="text-xs text-info mt-1">{caseFinancialSummary.invoicesCount} invoices</p>
              </div>
              <div className="bg-success/15 rounded-xl p-4 border border-success/25">
                <p className="text-xs font-medium text-success uppercase tracking-wide">Received</p>
                <p className="text-xl font-bold text-success mt-1">{formatCurrency(caseFinancialSummary.totalPaid)}</p>
                <p className="text-xs text-success mt-1">{formatCurrency(caseFinancialSummary.outstandingBalance)} outstanding</p>
              </div>
              <div className="bg-warning-muted rounded-xl p-4 border border-warning/20">
                <p className="text-xs font-medium text-warning uppercase tracking-wide">Expenses</p>
                <p className="text-xl font-bold text-warning mt-1">{formatCurrency(caseFinancialSummary.totalExpenses)}</p>
                <p className={`text-xs mt-1 flex items-center gap-1 ${marginColor}`}>
                  <MarginIcon className="w-3 h-3" />
                  {margin.toFixed(1)}% margin
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quotes */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-success" />
                  Quotes
                </h3>
                <Button onClick={() => onSetShowQuoteModal(true)} style={{ backgroundColor: 'rgb(var(--color-success))' }} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {quotes.length === 0 ? (
                <div className="text-center py-12 text-slate-500 bg-success-muted/40 rounded-lg border-2 border-dashed border-success/30">
                  <DollarSign className="w-12 h-12 mx-auto mb-3 text-success/40" />
                  <p className="font-medium text-slate-600">No quotes generated for this case yet.</p>
                  <p className="text-sm text-slate-500 mt-1">Create a quote using the button above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {quotes.map((quote) => (
                    <div key={quote.id} className="border border-slate-200 rounded-lg p-4 hover:border-success/60 hover:shadow-md transition-all bg-white">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-slate-900">{quote.quote_number || 'Draft'}</span>
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
                          </div>
                          <p className="text-sm text-slate-600 mb-1">{quote.title}</p>
                          <p className="text-sm font-medium text-slate-900">
                            Total: {formatCurrencyAmount(
                              quote.total_amount || 0,
                              quote.currency_symbol || 'USD',
                              quote.currency_position || 'after',
                              quote.decimal_places || 2
                            )}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Created {formatDate(quote.created_at)}
                            {quote.valid_until && ` • Valid until ${formatDate(quote.valid_until)}`}
                          </p>
                        </div>
                        <div className="flex gap-1">
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
                              onSetEditingQuote(fullQuote ? toQuoteEditInitialData(fullQuote as Record<string, unknown>) : null);
                              onSetShowQuoteModal(true);
                            }}
                            title="Edit Quote"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invoices */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Invoices
                </h3>
                <Button onClick={() => onSetShowInvoiceModal(true)} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {invoices.length === 0 ? (
                <div className="text-center py-12 text-slate-500 bg-info-muted/40 rounded-lg border-2 border-dashed border-info/30">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-info/40" />
                  <p className="font-medium text-slate-600">No invoices created for this case yet.</p>
                  <p className="text-sm text-slate-500 mt-1">Create an invoice using the button above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="border border-slate-200 rounded-lg p-4 hover:border-primary/60 hover:shadow-md transition-all bg-white">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-slate-900">{invoice.invoice_number || 'Draft'}</span>
                            {invoice.invoice_type === 'proforma' ? (
                              <Badge variant="accent" size="sm">Proforma</Badge>
                            ) : (
                              <Badge variant="custom" color="rgb(var(--color-primary))" size="sm">Tax Invoice</Badge>
                            )}
                            {invoice.status === 'converted' ? (
                              <Badge variant="accent" size="sm">
                                {invoice.status}
                              </Badge>
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
                                <span>View Tax Invoice</span>
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
                          <p className="text-sm font-medium text-slate-900 mb-1">
                            Total: {formatCurrencyAmount(
                              invoice.total_amount || 0,
                              invoice.currency_symbol || 'USD',
                              invoice.currency_position || 'after',
                              invoice.decimal_places || 2
                            )}
                          </p>
                          {(invoice.amount_paid ?? 0) > 0 && (
                            <p className="text-sm text-success">
                              Paid: {formatCurrencyAmount(
                                invoice.amount_paid ?? 0,
                                invoice.currency_symbol || 'USD',
                                invoice.currency_position || 'after',
                                invoice.decimal_places || 2
                              )}
                              {(invoice.balance_due ?? 0) > 0 && (
                                <span className="text-warning ml-2">
                                  • Balance: {formatCurrencyAmount(
                                    invoice.balance_due ?? 0,
                                    invoice.currency_symbol || 'USD',
                                    invoice.currency_position || 'after',
                                    invoice.decimal_places || 2
                                  )}
                                </span>
                              )}
                            </p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">
                            Created {formatDate(invoice.created_at)}
                            {invoice.due_date && ` • Due ${formatDate(invoice.due_date)}`}
                          </p>
                        </div>
                        <div className="flex gap-1 items-center">
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
                                onSetEditingInvoice(fullInvoice ? toInvoiceEditInitialData(fullInvoice as Record<string, unknown>) : null);
                                onSetShowInvoiceModal(true);
                              }}
                              title="Edit Invoice"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {invoice.invoice_type === 'tax_invoice' && (invoice.balance_due ?? 0) > 0 && invoice.status !== 'paid' && invoice.status !== 'void' && (
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Payments History */}
      {payments.length > 0 && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-success" />
              Payment History
            </h3>
            <div className="space-y-2">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-3 bg-success-muted border border-success/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-success/20 rounded-full flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{payment.payment_number}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(payment.payment_date)}
                        {payment.payment_method?.name && ` • ${payment.payment_method.name}`}
                        {payment.invoice?.invoice_number && ` • ${payment.invoice.invoice_number}`}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-success">{formatCurrency(payment.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Expenses */}
      {expenses.length > 0 && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <Receipt className="w-5 h-5 text-warning" />
              Case Expenses
            </h3>
            <div className="space-y-2">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-3 bg-warning-muted border border-warning/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-warning/20 rounded-full flex items-center justify-center">
                      <Receipt className="w-4 h-4 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {expense.description || expense.expense_number}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(expense.expense_date)}
                        {expense.category?.name && ` • ${expense.category.name}`}
                        {expense.vendor && ` • ${expense.vendor}`}
                        {expense.submitter?.full_name && ` • By ${expense.submitter.full_name}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-warning">{expense.amount?.toFixed(2)}</p>
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
