import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { DollarSign, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { useCurrency } from '../../hooks/useCurrency';
import { fetchPortalVisibility, getCaseIdsWithFlag } from '../../lib/portalVisibility';

interface Quote {
  id: string;
  quote_number: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  status: string;
  valid_until: string | null;
  notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  case_id: string;
  cases: {
    case_no: string;
    title: string;
  };
}

interface QuoteItem {
  id: string;
  description: string;
  quantity: number | null;
  unit_price: number;
  total_price: number;
}

export const PortalQuotes: React.FC = () => {
  const { t } = useTranslation();
  const { customer } = usePortalAuth();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [response, setResponse] = useState('');

  useEffect(() => {
    document.title = t('portal.quotes.tabTitle');
  }, [t]);

  const { data: visibility = [] } = useQuery({
    queryKey: ['portal_visibility', customer?.id],
    queryFn: () => fetchPortalVisibility(customer!.id),
    enabled: !!customer?.id,
  });

  const quoteVisibleCaseIds = React.useMemo(
    () => getCaseIdsWithFlag(visibility, 'show_quotes'),
    [visibility]
  );

  const { data: quotes = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['portal_quotes', customer?.id, quoteVisibleCaseIds.join(',')],
    queryFn: async () => {
      if (quoteVisibleCaseIds.length === 0) return [];

      const { data, error } = await supabase
        .from('case_quotes')
        .select(`
          id, quote_number, subtotal, tax_amount, discount_amount, total_amount,
          status, valid_until, notes, approved_at, approved_by, created_at, case_id,
          cases!inner(case_no, title)
        `)
        .in('case_id', quoteVisibleCaseIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as Quote[];
    },
    enabled: !!customer?.id,
  });

  const { data: quoteItems = [] } = useQuery<QuoteItem[]>({
    queryKey: ['portal_quote_items', selectedQuote?.id],
    queryFn: async () => {
      if (!selectedQuote?.id) return [];

      const { data, error } = await supabase
        .from('case_quote_items')
        .select('id, description, quantity, unit_price, total_price')
        .eq('quote_id', selectedQuote.id)
        .is('deleted_at', null)
        .order('sort_order');

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedQuote?.id,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ quoteId }: { quoteId: string }) => {
      const { data, error } = await supabase.rpc('approve_quote', {
        p_quote_id: quoteId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal_quotes'] });
      queryClient.invalidateQueries({ queryKey: ['portal_pending_quotes'] });
      setIsApproveModalOpen(false);
      setIsDetailModalOpen(false);
      setResponse('');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ quoteId, response }: { quoteId: string; response: string }) => {
      const { data, error } = await supabase.rpc('reject_quote', {
        p_quote_id: quoteId,
        p_reason: response || undefined,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal_quotes'] });
      queryClient.invalidateQueries({ queryKey: ['portal_pending_quotes'] });
      setIsRejectModalOpen(false);
      setIsDetailModalOpen(false);
      setResponse('');
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending_approval':
        return <Clock className="w-5 h-5" />;
      case 'approved':
        return <CheckCircle className="w-5 h-5" />;
      case 'rejected':
        return <XCircle className="w-5 h-5" />;
      case 'expired':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <DollarSign className="w-5 h-5" />;
    }
  };

  const handleViewDetails = (quote: Quote) => {
    setSelectedQuote(quote);
    setIsDetailModalOpen(true);
  };

  const handleApprove = () => {
    if (selectedQuote) {
      approveMutation.mutate({ quoteId: selectedQuote.id });
    }
  };

  const handleReject = () => {
    if (selectedQuote) {
      rejectMutation.mutate({ quoteId: selectedQuote.id, response });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('portal.quotes.heading')}</h1>
          <p className="text-slate-600">{t('portal.quotes.subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-1/3 bg-slate-200 rounded" />
                  <div className="h-3 w-1/5 bg-slate-200 rounded" />
                  <div className="h-3 w-1/2 bg-slate-200 rounded" />
                </div>
                <div className="h-8 w-24 bg-slate-200 rounded" />
              </div>
              <div className="h-3 w-1/3 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const pendingQuotes = quotes.filter((q) => q.status === 'pending_approval');
  const processedQuotes = quotes.filter((q) => q.status !== 'pending_approval');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('portal.quotes.heading')}</h1>
        <p className="text-slate-600">
          {t('portal.quotes.subtitle')}
        </p>
      </div>

      {isError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm">
          <p className="text-danger">{t('portal.quotes.loadError')}</p>
          <button onClick={() => refetch()} className="mt-2 text-primary underline">{t('portal.quotes.retry')}</button>
        </div>
      )}

      {pendingQuotes.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-warning" aria-hidden="true" />
            {t('portal.quotes.awaitingResponse')}
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {pendingQuotes.map((quote) => (
              <Card
                key={quote.id}
                className="p-6 border-2 border-warning/30 bg-warning-muted cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/40"
                onClick={() => handleViewDetails(quote)}
                role="button"
                tabIndex={0}
                aria-label={t('portal.quotes.openQuote', { quoteNo: quote.quote_number })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleViewDetails(quote);
                  }
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{quote.cases?.title ?? t('portal.quotes.heading')}</h3>
                    <p className="text-sm text-slate-600 mb-2">{quote.quote_number}</p>
                    <p className="text-sm text-slate-700">{t('portal.quotes.caseLabel', { caseNo: quote.cases?.case_no, caseTitle: quote.cases?.title })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-900">
                      {formatCurrency(Number(quote.total_amount) || 0)}
                    </p>
                    {quote.valid_until && (
                      <p className="text-xs text-slate-500 mt-1">
                        {t('portal.quotes.validUntil', { date: formatDate(quote.valid_until) })}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-warning/30">
                  <Badge variant="warning">
                    {t('portal.quotes.responseRequired')}
                  </Badge>
                  <span className="text-sm text-primary font-medium">{t('portal.quotes.viewAndRespond')}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {processedQuotes.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-4">{t('portal.quotes.quoteHistory')}</h2>
          <div className="grid grid-cols-1 gap-4">
            {processedQuotes.map((quote) => (
              <Card
                key={quote.id}
                className="p-6 cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/40"
                onClick={() => handleViewDetails(quote)}
                role="button"
                tabIndex={0}
                aria-label={t('portal.quotes.openQuote', { quoteNo: quote.quote_number })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleViewDetails(quote);
                  }
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-slate-900">{quote.cases?.title ?? quote.quote_number}</h3>
                      {getStatusIcon(quote.status)}
                      <Badge variant={statusToBadgeVariant(quote.status)}>
                        {quote.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{quote.quote_number}</p>
                    <p className="text-sm text-slate-700">{t('portal.quotes.caseLabelShort', { caseNo: quote.cases?.case_no })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-slate-900">
                      {formatCurrency(Number(quote.total_amount) || 0)}
                    </p>
                  </div>
                </div>
                {quote.approved_at && (
                  <p className="text-xs text-slate-500 pt-4 border-t border-slate-200">
                    {t('portal.quotes.approvedOn', { date: formatDate(quote.approved_at) })}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {quotes.length === 0 && !isError && (
        <Card className="p-12 text-center">
          <DollarSign className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-lg text-slate-600 mb-2">{t('portal.quotes.noQuotesFound')}</p>
          <p className="text-sm text-slate-500">
            {t('portal.quotes.noQuotesSubtitle')}
          </p>
        </Card>
      )}

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={t('portal.quotes.quoteDetails')}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDetailModalOpen(false)}>{t('ui.close')}</Button>
            {selectedQuote?.status === 'pending_approval' && (
              <>
                <Button
                  variant="danger"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    setIsRejectModalOpen(true);
                  }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  {t('portal.quotes.rejectQuote')}
                </Button>
                <Button
                  variant="success"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    setIsApproveModalOpen(true);
                  }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t('portal.quotes.approveQuote')}
                </Button>
              </>
            )}
          </div>
        }
      >
        {selectedQuote && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold text-slate-900">{selectedQuote.cases?.title ?? selectedQuote.quote_number}</h2>
                <Badge variant={statusToBadgeVariant(selectedQuote.status)}>
                  {selectedQuote.status.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-sm text-slate-600 mb-2">{selectedQuote.quote_number}</p>
              <p className="text-sm text-slate-700">
                {t('portal.quotes.caseLabel', { caseNo: selectedQuote.cases?.case_no, caseTitle: selectedQuote.cases?.title })}
              </p>
              {selectedQuote.notes && (
                <p className="text-slate-700 mt-3 whitespace-pre-wrap">{selectedQuote.notes}</p>
              )}
            </div>

            {quoteItems.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
                  {t('portal.quotes.quoteItems')}
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left p-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('portal.quotes.tableItem')}</th>
                        <th className="text-center p-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('portal.quotes.tableQty')}</th>
                        <th className="text-right p-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('portal.quotes.tableUnitPrice')}</th>
                        <th className="text-right p-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('portal.quotes.tableTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quoteItems.map((item, index) => (
                        <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="p-3">
                            <p className="font-medium text-slate-900">{item.description}</p>
                          </td>
                          <td className="p-3 text-center text-slate-700">{item.quantity ?? 1}</td>
                          <td className="p-3 text-right text-slate-700">
                            {formatCurrency(Number(item.unit_price) || 0)}
                          </td>
                          <td className="p-3 text-right font-medium text-slate-900">
                            {formatCurrency(Number(item.total_price) || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={3} className="p-3 text-right font-bold text-slate-900">
                          {t('portal.quotes.subtotal')}
                        </td>
                        <td className="p-3 text-right text-slate-900">
                          {formatCurrency(Number(selectedQuote.subtotal) || 0)}
                        </td>
                      </tr>
                      {Number(selectedQuote.discount_amount) > 0 && (
                        <tr>
                          <td colSpan={3} className="p-3 text-right font-bold text-slate-900">
                            {t('portal.quotes.discount')}
                          </td>
                          <td className="p-3 text-right text-slate-900">
                            -{formatCurrency(Number(selectedQuote.discount_amount) || 0)}
                          </td>
                        </tr>
                      )}
                      {Number(selectedQuote.tax_amount) > 0 && (
                        <tr>
                          <td colSpan={3} className="p-3 text-right font-bold text-slate-900">
                            {t('portal.quotes.tax')}
                          </td>
                          <td className="p-3 text-right text-slate-900">
                            {formatCurrency(Number(selectedQuote.tax_amount) || 0)}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={3} className="p-3 text-right font-bold text-slate-900">
                          {t('portal.quotes.totalAmount')}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900 text-lg">
                          {formatCurrency(Number(selectedQuote.total_amount) || 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </Modal>

      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => {
          setIsApproveModalOpen(false);
          setResponse('');
        }}
        title={t('portal.quotes.approveModal.title')}
      >
        <div className="space-y-4">
          <p className="text-slate-700">
            {t('portal.quotes.approveModal.body')}
          </p>
          <div className="flex gap-3 justify-end pt-3 border-t">
            <Button
              variant="secondary"
              onClick={() => {
                setIsApproveModalOpen(false);
                setResponse('');
              }}
            >
              {t('portal.quotes.approveModal.cancel')}
            </Button>
            <Button
              variant="success"
              onClick={handleApprove}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? t('portal.quotes.approveModal.approving') : t('portal.quotes.approveModal.confirmApproval')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => {
          setIsRejectModalOpen(false);
          setResponse('');
        }}
        title={t('portal.quotes.rejectModal.title')}
      >
        <div className="space-y-4">
          <p className="text-slate-700">
            {t('portal.quotes.rejectModal.body')}
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('portal.quotes.rejectModal.reasonLabel')}
            </label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder={t('portal.quotes.rejectModal.reasonPlaceholder')}
            />
          </div>
          <div className="flex gap-3 justify-end pt-3 border-t">
            <Button
              variant="secondary"
              onClick={() => {
                setIsRejectModalOpen(false);
                setResponse('');
              }}
            >
              {t('portal.quotes.rejectModal.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? t('portal.quotes.rejectModal.rejecting') : t('portal.quotes.rejectModal.confirmRejection')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
