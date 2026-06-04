import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { DollarSign, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { formatDate } from '../../lib/format';
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
  const { customer } = usePortalAuth();
  const queryClient = useQueryClient();
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [response, setResponse] = useState('');

  useEffect(() => {
    document.title = 'Quotes — Customer Portal';
  }, []);

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
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Quotes</h1>
          <p className="text-slate-600">Review and respond to quotes for your data recovery cases</p>
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
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Quotes</h1>
        <p className="text-slate-600">
          Review and respond to quotes for your data recovery cases
        </p>
      </div>

      {isError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm">
          <p className="text-danger">Failed to load quotes. Please try again.</p>
          <button onClick={() => refetch()} className="mt-2 text-primary underline">Retry</button>
        </div>
      )}

      {pendingQuotes.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-warning" aria-hidden="true" />
            Awaiting Your Response
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {pendingQuotes.map((quote) => (
              <Card
                key={quote.id}
                className="p-6 border-2 border-warning/30 bg-warning-muted cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/40"
                onClick={() => handleViewDetails(quote)}
                role="button"
                tabIndex={0}
                aria-label={`Open quote ${quote.quote_number}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleViewDetails(quote);
                  }
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{quote.cases?.title ?? 'Quote'}</h3>
                    <p className="text-sm text-slate-600 mb-2">{quote.quote_number}</p>
                    <p className="text-sm text-slate-700">Case: {quote.cases?.case_no} - {quote.cases?.title}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-900">
                      {Number(quote.total_amount).toLocaleString()}
                    </p>
                    {quote.valid_until && (
                      <p className="text-xs text-slate-500 mt-1">
                        Valid until {formatDate(quote.valid_until)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-warning/30">
                  <Badge variant="warning">
                    Response Required
                  </Badge>
                  <span className="text-sm text-primary font-medium">View & Respond →</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {processedQuotes.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-4">Quote History</h2>
          <div className="grid grid-cols-1 gap-4">
            {processedQuotes.map((quote) => (
              <Card
                key={quote.id}
                className="p-6 cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/40"
                onClick={() => handleViewDetails(quote)}
                role="button"
                tabIndex={0}
                aria-label={`Open quote ${quote.quote_number}`}
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
                    <p className="text-sm text-slate-700">Case: {quote.cases?.case_no}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-slate-900">
                      {Number(quote.total_amount).toLocaleString()}
                    </p>
                  </div>
                </div>
                {quote.approved_at && (
                  <p className="text-xs text-slate-500 pt-4 border-t border-slate-200">
                    Approved on {formatDate(quote.approved_at)}
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
          <p className="text-lg text-slate-600 mb-2">No quotes yet</p>
          <p className="text-sm text-slate-500">
            Quotes for your data recovery cases will appear here
          </p>
        </Card>
      )}

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Quote Details"
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
                Case: {selectedQuote.cases?.case_no} - {selectedQuote.cases?.title}
              </p>
              {selectedQuote.notes && (
                <p className="text-slate-700 mt-3 whitespace-pre-wrap">{selectedQuote.notes}</p>
              )}
            </div>

            {quoteItems.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
                  Quote Items
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Item</th>
                        <th className="text-center p-3 font-semibold text-slate-700">Qty</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Unit Price</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Total</th>
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
                            {Number(item.unit_price).toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-medium text-slate-900">
                            {Number(item.total_price).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={3} className="p-3 text-right font-bold text-slate-900">
                          Subtotal:
                        </td>
                        <td className="p-3 text-right text-slate-900">
                          {Number(selectedQuote.subtotal).toLocaleString()}
                        </td>
                      </tr>
                      {Number(selectedQuote.discount_amount) > 0 && (
                        <tr>
                          <td colSpan={3} className="p-3 text-right font-bold text-slate-900">
                            Discount:
                          </td>
                          <td className="p-3 text-right text-slate-900">
                            -{Number(selectedQuote.discount_amount).toLocaleString()}
                          </td>
                        </tr>
                      )}
                      {Number(selectedQuote.tax_amount) > 0 && (
                        <tr>
                          <td colSpan={3} className="p-3 text-right font-bold text-slate-900">
                            Tax:
                          </td>
                          <td className="p-3 text-right text-slate-900">
                            {Number(selectedQuote.tax_amount).toLocaleString()}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={3} className="p-3 text-right font-bold text-slate-900">
                          Total Amount:
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900 text-lg">
                          {Number(selectedQuote.total_amount).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {selectedQuote.status === 'pending_approval' && (
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    setIsRejectModalOpen(true);
                  }}
                  className="flex-1 text-danger hover:bg-danger-muted"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject Quote
                </Button>
                <Button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    setIsApproveModalOpen(true);
                  }}
                  className="flex-1 bg-success hover:bg-success/90"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve Quote
                </Button>
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
        title="Approve Quote"
      >
        <div className="space-y-4">
          <p className="text-slate-700">
            You are about to approve this quote. This action will notify our team to proceed with the work.
          </p>
          <div className="flex gap-3 justify-end pt-3 border-t">
            <Button
              variant="secondary"
              onClick={() => {
                setIsApproveModalOpen(false);
                setResponse('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="bg-success hover:bg-success/90"
            >
              {approveMutation.isPending ? 'Approving...' : 'Confirm Approval'}
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
        title="Reject Quote"
      >
        <div className="space-y-4">
          <p className="text-slate-700">
            You are about to reject this quote. Please provide a reason to help us understand your concerns.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Reason for Rejection
            </label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="Please explain why you're rejecting this quote..."
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
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={rejectMutation.isPending}
              className="bg-danger hover:bg-danger/90"
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
