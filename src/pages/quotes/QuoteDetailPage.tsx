import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchQuoteById,
  updateQuoteStatus,
  deleteQuote,
  duplicateQuote,
  updateQuote,
  toQuoteEditInitialData,
} from '../../lib/quotesService';
import type { Quote } from '../../lib/quotesService';
import { PageHeader } from '../../components/shared/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { PDFDownloadButton } from '../../components/shared/PDFDownloadButton';
import { QuoteDocument } from '../../components/documents/QuoteDocument';
import { QuoteFormModal } from '../../components/cases/QuoteFormModal';
import { ConvertToInvoiceModal } from '../../components/cases/ConvertToInvoiceModal';
import { useCurrency } from '../../hooks/useCurrency';
import { usePDFDownload } from '../../hooks/usePDFDownload';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
import { convertQuoteToInvoice } from '../../lib/invoiceService';
import { ArrowLeft, CreditCard as Edit, Trash2, Send, CheckCircle, XCircle, FileText, Copy, Clock, FileCheck, AlertCircle, Receipt, CalendarClock } from 'lucide-react';
import { BackupDeviceRecommendation } from '../../components/quotes/BackupDeviceRecommendation';
import { FollowUpFormModal } from '../../components/communications/FollowUpFormModal';
import { useTenantFeature } from '../../contexts/TenantConfigContext';
import { logger } from '../../lib/logger';

const statusConfig = {
  draft: { label: 'Draft', color: 'secondary', icon: FileText },
  sent: { label: 'Sent', color: 'info', icon: Send },
  accepted: { label: 'Accepted', color: 'success', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'danger', icon: XCircle },
  expired: { label: 'Expired', color: 'warning', icon: Clock },
  converted: { label: 'Converted', color: 'primary', icon: FileCheck },
};

export const QuoteDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatCurrency, currencyFormat } = useCurrency();
  const {
    companySettings,
    isLoadingSettings,
    settingsReady,
    settingsError,
    resourceError,
    translationsReady,
    translationsError,
    translationsErrorMessage,
    isLoadingTranslations,
    t,
  } = usePDFDownload();
  const { profile: _profile } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQuoteChaseModal, setShowQuoteChaseModal] = useState(false);
  const followUpsEnabled = useTenantFeature('automation.case_follow_ups');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const toast = useToast();

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => fetchQuoteById(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteQuote(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['deletedQuotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote_stats'] });
      toast.success('Quote deleted successfully');
      navigate('/quotes');
    },
    onError: (error: Error) => {
      toast.error(error?.message || 'Failed to delete quote');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ status }: { status: string }) =>
      updateQuoteStatus(id!, status as 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', id] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote_stats'] });
      toast.success('Quote status updated successfully');
      setShowStatusModal(false);
    },
    onError: (error: Error) => {
      toast.error(error?.message || 'Failed to update quote status');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateQuote(id!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote_stats'] });
      toast.success('Quote duplicated successfully');
      navigate(`/quotes/${data.id}`);
    },
    onError: (error: Error) => {
      toast.error(error?.message || 'Failed to duplicate quote');
    },
  });

  const handleDownloadPDF = async () => {
    if (!quote?.id) return;

    setIsGenerating(true);
    try {
      const { generateQuotePDF } = await import('../../lib/quotesService');
      const result = await generateQuotePDF(quote.id, true);

      if (!result.success) {
        toast.error(result.error || 'Failed to generate PDF');
      }
    } catch (error) {
      logger.error('Error generating quote PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditQuote = async (
    quoteData: Record<string, unknown>,
    items: Array<{ description: string; quantity: number; unit_price: number; unit?: string }>,
  ): Promise<void> => {
    try {
      await updateQuote(id!, {
        title: typeof quoteData.title === 'string' ? quoteData.title : undefined,
        status: typeof quoteData.status === 'string' ? (quoteData.status as Quote['status']) : 'draft',
        valid_until: typeof quoteData.valid_until === 'string' ? quoteData.valid_until : undefined,
        client_reference: typeof quoteData.client_reference === 'string' ? quoteData.client_reference : undefined,
        tax_rate: typeof quoteData.tax_rate === 'number' ? quoteData.tax_rate : undefined,
        discount_amount: typeof quoteData.discount_amount === 'number' ? quoteData.discount_amount : undefined,
        discount_type: typeof quoteData.discount_type === 'string' ? (quoteData.discount_type as Quote['discount_type']) : undefined,
        terms_and_conditions: typeof quoteData.terms_and_conditions === 'string' ? quoteData.terms_and_conditions : undefined,
        bank_account_id: typeof quoteData.bank_account_id === 'string' ? quoteData.bank_account_id : undefined,
      }, items);

      queryClient.invalidateQueries({ queryKey: ['quote', id] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote updated successfully');
      setShowEditModal(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update quote');
      throw error;
    }
  };

  const handleConvertToInvoice = async (data: {
    invoiceType: 'proforma' | 'tax_invoice';
    dueDate: string;
    notes?: string;
  }) => {
    try {
      setIsConverting(true);
      const invoice = await convertQuoteToInvoice(
        id!,
        data.invoiceType,
        data.dueDate,
        data.notes ? { notes: data.notes } : undefined
      );

      queryClient.invalidateQueries({ queryKey: ['quote', id] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote_stats'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });

      toast.success(
        `Quote converted to ${data.invoiceType === 'proforma' ? 'Proforma' : 'Tax'} Invoice successfully`
      );
      setShowConvertModal(false);

      navigate(`/invoices/${invoice.id}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to convert quote to invoice');
    } finally {
      setIsConverting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Quote Not Found</h2>
          <Button onClick={() => navigate('/quotes')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Quotes
          </Button>
        </div>
      </div>
    );
  }

  const StatusIcon = statusConfig[quote.status as keyof typeof statusConfig]?.icon || FileText;
  const canEdit = ['draft', 'sent'].includes(quote.status);
  const canDelete = quote.status === 'draft';
  const canConvert = quote.status === 'accepted';

  return (
    <>
      <style>{`
        @media (min-width: 1280px) {
          #quote-print-content {
            position: relative;
            width: 210mm;
            min-width: 210mm;
            max-width: 210mm;
            height: 297mm;
            max-height: 297mm;
            padding: 12mm;
            margin: 0 auto;
            background: #ffffff;
            box-sizing: border-box;
            overflow: hidden;
            transform: none;
            transform-origin: top left;
            font-size: 13px;
            line-height: 1.25;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            -webkit-text-size-adjust: 100%;
            text-rendering: optimizeLegibility;
          }
        }

        @media (max-width: 1279px) {
          #quote-print-content {
            position: relative;
            width: 100%;
            max-width: 100%;
            min-width: 100%;
            padding: 1rem;
            margin: 0 auto;
            background: #ffffff;
            box-sizing: border-box;
            transform: none;
            transform-origin: top left;
            font-size: 14px;
            line-height: 1.4;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
        }

        .quote-printable-content {
          width: 100%;
          height: 100%;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        #quote-print-content *,
        .quote-printable-content * {
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 4px;
          line-height: 1;
          height: 14px;
          margin: 0;
          padding: 0;
          margin-bottom: 6px;
        }

        .section-title svg {
          flex-shrink: 0;
          width: 12px;
          height: 12px;
          margin: 0;
          padding: 0;
          vertical-align: middle;
        }

        .section-title h3 {
          line-height: 1;
          height: 12px;
          margin: 0;
          padding: 0;
          transform: none;
          vertical-align: middle;
          display: flex;
          align-items: center;
          font-size: 13px;
        }

        .quote-table thead th {
          text-align: center;
          vertical-align: middle;
          height: auto;
          min-height: 32px;
          padding: 8px;
          background: #f1f5f9;
        }

        .total-row-band {
          margin-top: 8px;
          margin-bottom: 0;
          border-radius: 4px;
          border: 1px solid #e5e7eb;
        }

        .total-row-band-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          margin: 0;
          background: #f8fafc;
          border-bottom: 1px solid #e5e7eb;
          box-sizing: border-box;
        }

        .total-row-band .total-label {
          font-weight: 600;
          font-size: 14px;
          color: #1e293b;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          margin: 0;
          padding: 0;
          vertical-align: middle;
          box-sizing: border-box;
        }

        .total-row-band .total-amount {
          font-weight: 800;
          font-size: 16px;
          color: #1d4ed8;
          letter-spacing: 0.025em;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          margin: 0;
          padding: 0;
          vertical-align: middle;
          box-sizing: border-box;
        }

        .qr-divider {
          position: absolute;
          left: 12mm;
          right: 12mm;
          bottom: calc(5mm + 20mm + 3mm);
          border: 0;
          border-top: 1px solid #ef4444;
          margin: 0;
        }

        .footer-qr {
          margin-top: 0 !important;
          position: absolute;
          left: 12mm;
          bottom: 5mm;
          display: flex;
          align-items: center;
          gap: 8mm;
        }

        .footer-right {
          position: absolute;
          right: 12mm;
          bottom: 5mm;
          text-align: right;
        }

        .hide-in-pdf {
          display: none !important;
        }

        .terms-content {
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
          line-height: 1.4;
          font-size: 11px;
        }

        @media (max-width: 640px) {
          #quote-print-content {
            padding: 0.5rem;
            font-size: 12px;
          }
        }

        @page {
          size: A4;
          margin: 0;
        }

        @media print {
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body * {
            visibility: hidden;
          }

          #quote-print-content,
          #quote-print-content * {
            visibility: visible;
          }

          #quote-print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            height: 297mm;
            max-height: 297mm;
            padding: 12mm;
            margin: 0;
            background: #ffffff;
            overflow: hidden;
            transform: none;
          }

          .no-print {
            display: none !important;
          }

          .hide-in-pdf {
            display: none !important;
          }

          .print-border {
            border: 1px solid #e2e8f0 !important;
          }
        }
      `}</style>

      <div className="p-4 md:p-8 max-w-[1800px] mx-auto">
        <button
          onClick={() => navigate('/quotes')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-all hover:gap-3 font-medium"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Quotes</span>
        </button>

        <PageHeader
          title={`Quote ${quote.quote_number || 'Draft'}`}
        />

        <div className="flex flex-col xl:grid xl:grid-cols-3 gap-6 mb-6">
          <div className="xl:col-span-2 w-full">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-6 min-w-0 overflow-x-auto">
              <QuoteDocument
                quote={quote}
                companySettings={companySettings}
                currencyFormat={currencyFormat}
                t={(key: string, fallback: string) => t(key as Parameters<typeof t>[0], fallback)}
                elementId="quote-print-content"
              />
            </div>
          </div>

          <div className="xl:col-span-1 space-y-6">
            {/* Status Card */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Status</h3>
              <div className="flex items-center gap-3 mb-4">
                <StatusIcon className="w-5 h-5" />
                <Badge variant="custom" color={statusConfig[quote.status as keyof typeof statusConfig]?.color || 'secondary'}>
                  {statusConfig[quote.status as keyof typeof statusConfig]?.label || quote.status}
                </Badge>
              </div>
              {quote.status !== 'converted' && quote.status !== 'accepted' && (
                <Button
                  onClick={() => setShowStatusModal(true)}
                  className="w-full"
                  variant="secondary"
                >
                  Change Status
                </Button>
              )}
            </Card>

            {/* Actions Card */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Actions</h3>

              {/* Error Messages */}
              {(translationsError || settingsError || resourceError) && (
                <div className="bg-danger-muted border border-danger/20 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-danger mb-1">Cannot Generate PDF</h4>
                      <p className="text-sm text-danger">
                        {translationsError && translationsErrorMessage}
                        {settingsError && resourceError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading Status */}
              {(isLoadingTranslations || isLoadingSettings) && !translationsError && !settingsError && (
                <div className="bg-info-muted border border-info/20 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-info"></div>
                    <span className="text-sm text-info">
                      Loading resources...
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <PDFDownloadButton
                  onClick={handleDownloadPDF}
                  isGenerating={isGenerating}
                  disabled={isLoadingSettings || isLoadingTranslations || !translationsReady || !settingsReady || translationsError || settingsError}
                  className="w-full"
                />

                {canConvert && (
                  <Button
                    onClick={() => setShowConvertModal(true)}
                    className="w-full shadow-md hover:shadow-lg transition-shadow bg-success text-success-foreground hover:bg-success/90"
                  >
                    <Receipt className="w-4 h-4 mr-2" />
                    Convert to Invoice
                  </Button>
                )}

                {canEdit && (
                  <Button
                    onClick={() => setShowEditModal(true)}
                    className="w-full"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Quote
                  </Button>
                )}

                {followUpsEnabled && quote.case_id && (
                  <Button
                    onClick={() => setShowQuoteChaseModal(true)}
                    variant="secondary"
                    className="w-full"
                  >
                    <CalendarClock className="w-4 h-4 mr-2" />
                    Schedule Quote Chase
                  </Button>
                )}

                <Button
                  onClick={() => duplicateMutation.mutate()}
                  variant="secondary"
                  className="w-full"
                  disabled={duplicateMutation.isPending}
                >
                  {duplicateMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      Duplicating...
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate Quote
                    </>
                  )}
                </Button>

                {canDelete && (
                  <Button
                    onClick={() => setShowDeleteModal(true)}
                    variant="secondary"
                    className="w-full text-danger hover:bg-danger-muted border-danger/20"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Quote
                  </Button>
                )}
              </div>
            </Card>

            {/* Backup Device Recommendations */}
            {['draft', 'sent'].includes(quote.status) && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Backup Devices</h3>
                <BackupDeviceRecommendation
                  estimatedDataSizeGB={0}
                  onAddToQuote={async (newItems) => {
                    const { data: existingItems } = await supabase
                      .from('quote_items')
                      .select('*')
                      .eq('quote_id', id!)
                      .is('deleted_at', null);
                    const current = (existingItems ?? []).map((i) => ({
                      description: i.description,
                      quantity: i.quantity ?? 0,
                      unit_price: i.unit_price,
                    }));
                    await updateQuote(id!, quote as unknown as Partial<Quote>, [...current, ...newItems]);
                    queryClient.invalidateQueries({ queryKey: ['quote', id] });
                    toast.success(`${newItems.length} device${newItems.length !== 1 ? 's' : ''} added to quote`);
                  }}
                />
              </Card>
            )}

            {/* Quote Details */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Quote Details</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-slate-600">Created:</span>
                  <span className="ml-2 text-slate-900 font-medium">
                    {quote.created_at ? new Date(quote.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                {quote.valid_until && (
                  <div>
                    <span className="text-slate-600">Valid Until:</span>
                    <span className="ml-2 text-slate-900 font-medium">
                      {new Date(quote.valid_until).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-slate-600">Total:</span>
                  <span className="ml-2 text-slate-900 font-bold">
                    {formatCurrency(quote.total_amount || 0)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Quote"
      >
        <div className="space-y-4">
          <div className="bg-warning-muted border border-warning/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-warning mb-1">Deleting Quote</h4>
                <div className="text-sm text-warning space-y-1">
                  <p><strong>Quote Number:</strong> {quote?.quote_number || 'N/A'}</p>
                  <p><strong>Customer:</strong> {quote?.customers?.customer_name || quote?.companies?.company_name || 'N/A'}</p>
                  <p><strong>Amount:</strong> {formatCurrency(quote?.total_amount || 0)}</p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-slate-600">
            This quote will be moved to the recycle bin and can be restored within 30 days. After 30 days, it will be permanently deleted.
          </p>

          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                deleteMutation.mutate();
                setShowDeleteModal(false);
              }}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Quote
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Status Change Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Change Quote Status"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              New Status
            </label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => setShowStatusModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => statusMutation.mutate({ status: newStatus })}
              disabled={!newStatus || statusMutation.isPending}
            >
              Update Status
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Quote Modal */}
      {showEditModal && quote && (
        <QuoteFormModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={handleEditQuote}
          caseId={quote.case_id}
          customerId={quote.customer_id}
          companyId={quote.company_id}
          initialData={quote ? toQuoteEditInitialData(quote as unknown as Record<string, unknown>) : undefined}
          clientReference={quote.client_reference}
        />
      )}

      {/* Quote chase follow-up */}
      {showQuoteChaseModal && quote?.case_id && (
        <FollowUpFormModal
          isOpen={showQuoteChaseModal}
          onClose={() => setShowQuoteChaseModal(false)}
          caseId={quote.case_id}
          quoteId={quote.id}
          defaultType="quote_chase"
          defaultInDays={3}
        />
      )}

      {/* Convert to Invoice Modal */}
      {showConvertModal && quote && (
        <ConvertToInvoiceModal
          isOpen={showConvertModal}
          onClose={() => setShowConvertModal(false)}
          onConvert={handleConvertToInvoice}
          quote={quote as unknown as React.ComponentProps<typeof ConvertToInvoiceModal>['quote']}
          isConverting={isConverting}
        />
      )}
    </>
  );
};

export default QuoteDetailPage;
