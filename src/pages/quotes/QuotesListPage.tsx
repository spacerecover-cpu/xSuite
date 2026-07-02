import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetchQuotesPage, getQuoteStats, toQuoteEditInitialData } from '../../lib/quotesService';
import type { QuoteWithDetails } from '../../lib/quotesService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { ListPageTemplate } from '../../components/templates/ListPageTemplate';
import { KpiRow } from '../../components/templates/KpiRow';
import { QuoteFormModal } from '../../components/cases/QuoteFormModal';
import { useCurrency } from '../../hooks/useCurrency';
import { useCurrencyConfig } from '../../contexts/TenantConfigContext';
import { roundMoney } from '../../lib/financialMath';
import { supabase } from '../../lib/supabaseClient';
import { EmptyState } from '../../components/shared/EmptyState';
import { ExportButton } from '../../components/shared/ExportButton';
import { BulkActionsBar, BulkActionButton } from '../../components/shared/BulkActionsBar';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { useListPageSize } from '../../hooks/useListPageSize';
import { useListSelectionEnabled } from '../../hooks/useListSelectionEnabled';
import { downloadCSV } from '../../lib/csvExport';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import type { Database } from '../../types/database.types';
import {
  FileText,
  Plus,
  Search,
  Filter,
  User,
  Building2,
  Eye,
  Edit,
  Send,
  Trash2,
  Archive,
  Download,
} from 'lucide-react';
import { formatDate } from '../../lib/format';
import { logger } from '../../lib/logger';

type QuoteUpdate = Database['public']['Tables']['quotes']['Update'];
type QuoteInsert = Database['public']['Tables']['quotes']['Insert'];
type QuoteItemInsert = Database['public']['Tables']['quote_items']['Insert'];

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
};

export const QuotesListPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const currencyConfig = useCurrencyConfig();
  const { profile } = useAuth();
  const selection = useBulkSelection();
  const canBulkArchive = profile?.role === 'owner' || profile?.role === 'admin';
  const [isArchiving, setIsArchiving] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [editingQuote, setEditingQuote] = useState<QuoteWithDetails | null>(null);
  const [sendingQuoteId, setSendingQuoteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = useListPageSize();
  const selectionEnabled = useListSelectionEnabled();

  // Command-palette deep-link: /quotes?new=1 opens the create modal.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowQuoteModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, debouncedSearch, pageSize]);

  // Hiding checkboxes (tenant preference) drops any in-flight selection so
  // bulk actions can't act on rows the user can no longer see or unselect.
  useEffect(() => {
    if (!selectionEnabled) selection.clear();
  }, [selectionEnabled, selection.clear]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['quote_stats'],
    queryFn: getQuoteStats,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const { data: quotesPage, isLoading, error: quotesError } = useQuery({
    queryKey: ['quotes', statusFilter, debouncedSearch, page, pageSize],
    queryFn: () =>
      fetchQuotesPage({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      }),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  const quotes = quotesPage?.rows ?? [];
  const totalQuotes = quotesPage?.total ?? 0;

  const getClientName = (quote: QuoteWithDetails) => {
    if (quote?.customers?.customer_name) {
      return quote.customers.customer_name;
    }
    if (quote?.companies?.company_name) {
      return quote.companies.company_name;
    }
    if (quote?.companies?.name) {
      return quote.companies.name;
    }
    return 'N/A';
  };

  // Quote.id is `string | undefined` in the service-layer type; filter
  // to defined ids so the selection APIs (which expect strings) type-check.
  const visibleIds = quotes.map((q) => q.id).filter((id): id is string => Boolean(id));

  const handleBulkExport = async () => {
    if (selection.selectedCount === 0) return;
    const ids = Array.from(selection.selectedIds);
    const { data, error } = await supabase
      .from('quotes')
      .select('quote_number, quote_date, valid_until, subtotal, tax_amount, total_amount, status, customers_enhanced:customer_id(customer_name)')
      .in('id', ids);
    if (error) {
      toast.error('Failed to export selected quotes');
      return;
    }
    downloadCSV(
      data ?? [],
      [
        { key: 'quote_number', label: 'Quote #' },
        { key: 'quote_date', label: 'Date' },
        { key: 'valid_until', label: 'Valid Until' },
        {
          key: (r) => (r.customers_enhanced as { customer_name?: string } | null)?.customer_name,
          label: 'Customer',
        },
        { key: 'subtotal', label: 'Subtotal' },
        { key: 'tax_amount', label: 'Tax' },
        { key: 'total_amount', label: 'Total' },
        { key: 'status', label: 'Status' },
      ],
      'quotes-selected',
    );
    toast.success(`Exported ${data?.length ?? 0} quote${data?.length === 1 ? '' : 's'}`);
  };

  const handleBulkArchive = async () => {
    if (selection.selectedCount === 0) return;
    if (!canBulkArchive) {
      toast.error('Only admins can bulk archive quotes');
      return;
    }
    const n = selection.selectedCount;
    const ok = await confirm({
      title: 'Archive quotes',
      message: `Archive ${n} quote${n === 1 ? '' : 's'}? They'll be hidden from lists but recoverable.`,
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!ok) return;
    setIsArchiving(true);
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(selection.selectedIds));
      if (error) throw error;
      toast.success(`Archived ${n} quote${n === 1 ? '' : 's'}`);
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['deletedQuotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote_stats'] });
    } catch (err) {
      toast.error((err as Error).message || 'Failed to archive quotes');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleBulkSend = async () => {
    if (selection.selectedCount === 0) return;
    const n = selection.selectedCount;
    const msg =
      n > 5
        ? `Email ${n} quotes to their customers? Sending is rate-limited to 5/minute — this will take roughly ${Math.ceil(n / 5)} minute(s).`
        : `Email ${n} quote${n === 1 ? '' : 's'} to their customers?`;
    const ok = await confirm({
      title: 'Send quotes',
      message: msg,
      confirmLabel: 'Send',
      tone: 'danger',
    });
    if (!ok) return;
    setSendProgress({ done: 0, total: n });
    try {
      const { bulkSendQuoteEmails } = await import('../../lib/quotesService');
      const results = await bulkSendQuoteEmails(
        Array.from(selection.selectedIds),
        (done, total) => setSendProgress({ done, total }),
      );
      const sent = results.filter((r) => r.status === 'sent').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      const failed = results.filter((r) => r.status === 'failed').length;
      if (failed === 0 && skipped === 0) {
        toast.success(`Sent ${sent} quote${sent === 1 ? '' : 's'}`);
      } else if (failed > 0) {
        toast.warning(`Bulk send: ${sent} sent, ${skipped} skipped, ${failed} failed`);
      } else {
        toast.info(`Bulk send: ${sent} sent, ${skipped} skipped, ${failed} failed`);
      }
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote_stats'] });
    } catch (err) {
      toast.error((err as Error).message || 'Bulk send failed');
    } finally {
      setSendProgress(null);
    }
  };

  if (quotesError) {
    return (
      <div className="p-8 max-w-[1800px] mx-auto">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <div className="text-danger mb-4">
            <FileText className="w-12 h-12 mx-auto mb-2" />
            <p className="text-lg font-semibold">Error Loading Quotes</p>
            <p className="text-sm text-slate-600 mt-2">{(quotesError as Error)?.message || 'Failed to load quotes'}</p>
          </div>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const headerActions = (
    <>
      <Button onClick={() => setShowQuoteModal(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Create Quote
      </Button>
      <Button variant="secondary" onClick={() => navigate('/quotes/recycle-bin')}>
        <Trash2 className="w-4 h-4 mr-2" />
        Recycle Bin
      </Button>
    </>
  );

  const kpis = (
    <KpiRow
      stats={[
        { label: 'Total Invoiced', value: formatCurrency(stats?.totalValue || 0), tone: 'info' },
        { label: 'Paid', value: formatCurrency(stats?.acceptedValue || 0), tone: 'success' },
        { label: 'Outstanding', value: formatCurrency(stats?.sentValue || 0), tone: 'warning' },
        { label: 'Total Count', value: stats?.total ?? 0, tone: 'neutral' },
      ]}
    />
  );

  const toolbar = (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6">
      <div className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="w-full lg:w-80 relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by quote number, title, or customer name"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex-1 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStatusFilter(statusFilter === 'draft' ? 'all' : 'draft')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'draft'
                    ? 'bg-slate-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Draft
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === 'sent' ? 'all' : 'sent')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'sent'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Sent
              </button>
              <button
                onClick={() =>
                  setStatusFilter(statusFilter === 'accepted' ? 'all' : 'accepted')
                }
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'accepted'
                    ? 'bg-success text-success-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Accepted
              </button>
              <button
                onClick={() =>
                  setStatusFilter(statusFilter === 'rejected' ? 'all' : 'rejected')
                }
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'rejected'
                    ? 'bg-danger text-danger-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Rejected
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === 'expired' ? 'all' : 'expired')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'expired'
                    ? 'bg-warning text-warning-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Expired
              </button>
              <button
                onClick={() =>
                  setStatusFilter(statusFilter === 'converted' ? 'all' : 'converted')
                }
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'converted'
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Converted
              </button>
              {statusFilter !== 'all' && (
                <button
                  onClick={() => setStatusFilter('all')}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 transition-all"
                >
                  Clear All
                </button>
              )}
            </div>

            <Button
              variant="secondary"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <Filter className="w-4 h-4" />
              More Filters
              {statusFilter !== 'all' && (
                <span className="ml-1 w-2 h-2 rounded-full bg-primary"></span>
              )}
            </Button>

            <ExportButton
              filename="quotes"
              columns={[
                { key: 'quote_number', label: 'Quote #' },
                { key: 'quote_date', label: 'Date' },
                { key: 'valid_until', label: 'Valid Until' },
                {
                  key: (r) => (r.customers_enhanced as { customer_name?: string } | null)?.customer_name,
                  label: 'Customer',
                },
                { key: 'subtotal', label: 'Subtotal' },
                { key: 'tax_amount', label: 'Tax' },
                { key: 'total_amount', label: 'Total' },
                { key: 'status', label: 'Status' },
              ]}
              getRows={async () => {
                let q = supabase
                  .from('quotes')
                  .select('quote_number, quote_date, valid_until, subtotal, tax_amount, total_amount, status, customers_enhanced:customer_id(customer_name)')
                  .is('deleted_at', null);
                if (debouncedSearch) {
                  q = q.ilike('quote_number', `%${debouncedSearch}%`);
                }
                if (statusFilter !== 'all') q = q.eq('status', statusFilter);
                const { data, error } = await q.order('quote_date', { ascending: false, nullsFirst: false });
                if (error) throw error;
                return data ?? [];
              }}
            />
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
                <option value="converted">Converted</option>
              </select>
            </div>
          )}
        </div>
      </div>
  );

  const empty = (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
      <EmptyState
        icon={FileText}
        title="No quotes found"
        description={
          searchTerm || statusFilter !== 'all'
            ? 'No quotes found matching your criteria.'
            : 'No quotes yet. Create your first quote to get started.'
        }
        action={{ label: 'Create Quote', onClick: () => setShowQuoteModal(true) }}
      />
    </div>
  );

  const table = (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {selectionEnabled && (
                    <th className="px-4 py-4 w-10">
                      <input
                        type="checkbox"
                        checked={selection.allSelected(visibleIds)}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              !selection.allSelected(visibleIds) && selection.someSelected(visibleIds);
                          }
                        }}
                        onChange={(e) => selection.setMany(visibleIds, e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        aria-label="Select all on this page"
                      />
                    </th>
                  )}
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Quote #
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Valid Until
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {quotes.map((quote) => (
                  <tr
                    key={quote.id}
                    onClick={() => navigate(`/quotes/${quote.id}`)}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                      quote.id && selection.isSelected(quote.id) ? 'bg-info-muted/30' : ''
                    }`}
                  >
                    {selectionEnabled && (
                      <td
                        className="px-4 py-4 w-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={quote.id ? selection.isSelected(quote.id) : false}
                          onChange={() => quote.id && selection.toggle(quote.id)}
                          disabled={!quote.id}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-30"
                          aria-label={`Select quote ${quote.quote_number}`}
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-primary">
                        {quote.quote_number}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-900 truncate max-w-xs">
                        {quote.cases?.case_no || quote.cases?.title || '-'}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {quote.customers ? (
                          <User className="w-4 h-4 text-slate-400" />
                        ) : (
                          <Building2 className="w-4 h-4 text-slate-400" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {getClientName(quote)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-slate-600">
                        {formatDate(quote.created_at || '')}
                      </p>
                      {quote.created_by_profile && (
                        <p className="text-xs text-slate-500">
                          {quote.created_by_profile.full_name}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {quote.valid_until ? formatDate(quote.valid_until) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {formatCurrency(quote.total_amount || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={statusToBadgeVariant(quote.status)} size="sm">
                        {quote.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className="flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => navigate(`/quotes/${quote.id}`)}
                          className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {quote.id && ['draft', 'sent'].includes(quote.status) && (
                          <button
                            onClick={async () => {
                              if (!quote.id) return;
                              const { data, error } = await supabase
                                .from('quotes')
                                .select('*')
                                .eq('id', quote.id)
                                .maybeSingle();

                              if (!error && data) {
                                const { data: items } = await supabase
                                  .from('quote_items')
                                  .select('*')
                                  .eq('quote_id', quote.id)
                                  .is('deleted_at', null)
                                  .order('sort_order', { ascending: true });
                                setEditingQuote({ ...data, quote_items: items ?? [] } as unknown as QuoteWithDetails);
                                setShowQuoteModal(true);
                              }
                            }}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {quote.id && quote.status === 'draft' && (
                          <button
                            onClick={async () => {
                              if (!quote.id) return;
                              const quoteId = quote.id;
                              const ok = await confirm({
                                title: 'Send quote',
                                message: `Send quote ${quote.quote_number} to ${getClientName(quote)}?`,
                                confirmLabel: 'Send',
                                tone: 'danger',
                              });
                              if (!ok) return;
                              try {
                                setSendingQuoteId(quoteId);
                                const { error } = await supabase
                                  .from('quotes')
                                  .update({
                                    status: 'sent',
                                  })
                                  .eq('id', quoteId);

                                if (error) throw error;

                                queryClient.invalidateQueries({ queryKey: ['quotes'] });
                                queryClient.invalidateQueries({ queryKey: ['quote_stats'] });

                                toast.success(`Quote ${quote.quote_number} has been sent successfully!`);
                              } catch (error) {
                                logger.error('Error sending quote:', error);
                                toast.error('Failed to send quote. Please try again.');
                              } finally {
                                setSendingQuoteId(null);
                              }
                            }}
                            disabled={sendingQuoteId === quote.id}
                            className="p-1.5 text-success hover:bg-success-muted rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Send Quote"
                          >
                            {sendingQuoteId === quote.id ? (
                              <div className="w-4 h-4 border-2 border-success border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
    </>
  );

  return (
    <ListPageTemplate
      title="Quotes"
      headerActions={headerActions}
      kpis={kpis}
      toolbar={toolbar}
      table={table}
      pager={{ page, pageSize, total: totalQuotes, onPageChange: setPage, itemNoun: 'quotes' }}
      loading={isLoading || statsLoading}
      isEmpty={quotes.length === 0}
      empty={empty}
      footer={
        <BulkActionsBar
          count={selection.selectedCount}
          onClear={selection.clear}
          itemNoun="quote"
        >
          <BulkActionButton
            variant="ghost"
            icon={<Download className="w-4 h-4" />}
            label="Export"
            onClick={handleBulkExport}
            disabled={sendProgress !== null}
          />
          <BulkActionButton
            variant="primary"
            icon={<Send className="w-4 h-4" />}
            label={
              sendProgress
                ? `Sending ${sendProgress.done}/${sendProgress.total}…`
                : 'Send'
            }
            onClick={handleBulkSend}
            disabled={sendProgress !== null || isArchiving}
          />
          {canBulkArchive && (
            <BulkActionButton
              variant="danger"
              icon={<Archive className="w-4 h-4" />}
              label={isArchiving ? 'Archiving…' : 'Archive'}
              onClick={handleBulkArchive}
              disabled={isArchiving || sendProgress !== null}
            />
          )}
        </BulkActionsBar>
      }
    >
      {showQuoteModal && (
        <QuoteFormModal
          isOpen={showQuoteModal}
          onClose={() => {
            setShowQuoteModal(false);
            setEditingQuote(null);
          }}
          onSave={async (quoteData, items) => {
            const taxRate = toNumber(quoteData.tax_rate, 0);
            const discountAmountInput = toNumber(quoteData.discount_amount, 0);
            const discountTypeRaw = typeof quoteData.discount_type === 'string'
              ? quoteData.discount_type
              : 'fixed';
            const validUntil = toOptionalString(quoteData.valid_until);
            const statusRaw = typeof quoteData.status === 'string' ? quoteData.status : 'draft';
            const termsValue = toOptionalString(quoteData.terms_and_conditions);
            const notesValue = toOptionalString(quoteData.notes);
            const caseIdValue = toOptionalString(quoteData.case_id);
            const customerIdValue = toOptionalString(quoteData.customer_id);
            const companyIdValue = toOptionalString(quoteData.company_id);

            if (editingQuote && editingQuote.id) {
              const updatePayload: QuoteUpdate = {
                status: statusRaw,
                valid_until: validUntil,
                tax_rate: taxRate,
                discount_amount: discountAmountInput,
                terms: termsValue,
                notes: notesValue,
                updated_at: new Date().toISOString(),
              };

              const { error } = await supabase
                .from('quotes')
                .update(updatePayload)
                .eq('id', editingQuote.id);

              if (error) throw error;

              await supabase
                .from('quote_items')
                .update({ deleted_at: new Date().toISOString() })
                .eq('quote_id', editingQuote.id);

              const itemsToInsert: Array<Omit<QuoteItemInsert, 'tenant_id'>> = items.map((item, index) => ({
                quote_id: editingQuote.id as string,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: roundMoney(item.quantity * item.unit_price, currencyConfig.decimalPlaces),
                sort_order: index,
              }));

              const { error: itemsError } = await supabase
                .from('quote_items')
                .insert(itemsToInsert as QuoteItemInsert[]);

              if (itemsError) throw itemsError;
            } else {
              const { data: nextNumber } = await supabase.rpc('get_next_number', {
                p_scope: 'quote',
              });

              const subtotal = items.reduce(
                (sum, item) => sum + item.quantity * item.unit_price,
                0
              );
              const taxAmount = (subtotal * taxRate) / 100;
              const discountValue =
                discountTypeRaw === 'percentage'
                  ? (subtotal * discountAmountInput) / 100
                  : discountAmountInput;
              const total = subtotal + taxAmount - discountValue;

              const insertPayload: Omit<QuoteInsert, 'tenant_id'> = {
                quote_number: typeof nextNumber === 'string' ? nextNumber : null,
                case_id: caseIdValue,
                customer_id: customerIdValue,
                company_id: companyIdValue,
                status: statusRaw,
                valid_until: validUntil,
                subtotal,
                tax_amount: taxAmount,
                discount_amount: discountValue,
                total_amount: total,
                tax_rate: taxRate,
                terms: termsValue,
                notes: notesValue,
              };

              const { data: quote, error } = await supabase
                .from('quotes')
                .insert(insertPayload as QuoteInsert)
                .select()
                .maybeSingle();

              if (error) throw error;
              if (!quote) throw new Error('Failed to create quote');

              const itemsToInsert: Array<Omit<QuoteItemInsert, 'tenant_id'>> = items.map((item, index) => ({
                quote_id: quote.id,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: roundMoney(item.quantity * item.unit_price, currencyConfig.decimalPlaces),
                sort_order: index,
              }));

              const { error: itemsError } = await supabase
                .from('quote_items')
                .insert(itemsToInsert as QuoteItemInsert[]);

              if (itemsError) throw itemsError;
            }

            queryClient.invalidateQueries({ queryKey: ['quotes'] });
            queryClient.invalidateQueries({ queryKey: ['quote_stats'] });
          }}
          caseId={editingQuote?.case_id || ''}
          customerId={editingQuote?.customer_id}
          companyId={editingQuote?.company_id}
          initialData={editingQuote ? toQuoteEditInitialData(editingQuote as unknown as Record<string, unknown>) : undefined}
          clientReference={editingQuote?.client_reference}
        />
      )}
    </ListPageTemplate>
  );
};

export default QuotesListPage;
