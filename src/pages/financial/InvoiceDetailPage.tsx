import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchInvoiceById, convertProformaToTaxInvoice, getConversionHistory } from '../../lib/invoiceService';
import { PageHeader } from '../../components/shared/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PDFDownloadButton } from '../../components/shared/PDFDownloadButton';
import { InvoiceDocument } from '../../components/documents/InvoiceDocument';
import { useCurrency } from '../../hooks/useCurrency';
import { usePDFDownload } from '../../hooks/usePDFDownload';
import { useToast } from '../../hooks/useToast';
import { FileText, ArrowLeft, CreditCard as Edit, DollarSign, AlertCircle, RefreshCw, CheckCircle, ArrowRight, Lock } from 'lucide-react';
import { RecordReceiptModal } from '../../components/banking/RecordReceiptModal';
import { logger } from '../../lib/logger';
import { supabase, resolveTenantId } from '../../lib/supabaseClient';
import type { PaymentReceipt } from '../../lib/bankingService';

const statusConfig = {
  draft: { label: 'Draft', color: 'secondary', icon: FileText },
  sent: { label: 'Sent', color: 'info', icon: FileText },
  paid: { label: 'Paid', color: 'success', icon: CheckCircle },
  partial: { label: 'Partially Paid', color: 'warning', icon: DollarSign },
  overdue: { label: 'Overdue', color: 'danger', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'secondary', icon: AlertCircle },
};

const typeConfig = {
  proforma: { label: 'Proforma Invoice', color: 'rgb(var(--color-accent))' },
  tax: { label: 'Tax Invoice', color: '#0ea5e9' },
};

export const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
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
  // Adapter so the strongly-typed translation hook can satisfy InvoiceDocument's
  // looser `(key: string, fallback: string) => string` prop.
  const tForDocument = React.useCallback(
    (key: string, fallback: string): string => t(key as Parameters<typeof t>[0], fallback),
    [t]
  );
  const [isGenerating, setIsGenerating] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConversionHistoryModal, setShowConversionHistoryModal] = useState(false);
  const [conversionHistory, setConversionHistory] = useState<Array<Record<string, unknown>>>([]);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoiceById(id!),
    enabled: !!id,
  });

  const handleDownloadPDF = async () => {
    if (!invoice || !id) return;

    setIsGenerating(true);
    try {
      const { generateInvoicePDF } = await import('../../lib/invoiceService');
      const result = await generateInvoicePDF(id, true);

      if (!result.success) {
        toast.error(result.error || 'Failed to generate PDF');
      }
    } catch (error) {
      logger.error('Error generating invoice PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConvertToTax = async () => {
    if (!invoice || !id || invoice.invoice_type !== 'proforma') return;

    try {
      await convertProformaToTaxInvoice(id);
      toast.success('Successfully converted to tax invoice');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (error) {
      logger.error('Error converting invoice:', error);
      toast.error(
        `Failed to convert: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  };

  const handleViewConversionHistory = async () => {
    if (!invoice || !id) return;

    try {
      const history = await getConversionHistory(id);
      // getConversionHistory returns null in v1.0.0 (B8 to reconstruct from converted_from_quote_id chain).
      const items: unknown[] = Array.isArray(history) ? history : [];
      setConversionHistory(
        items.filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null
        )
      );
      setShowConversionHistoryModal(true);
    } catch (error) {
      logger.error('Error fetching conversion history:', error);
      toast.error('Failed to load conversion history.');
    }
  };

  const handlePaymentRecorded = () => {
    queryClient.invalidateQueries({ queryKey: ['invoice', id] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    setShowPaymentModal(false);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Invoice Not Found</h2>
          <Button onClick={() => navigate('/invoices')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Invoices
          </Button>
        </div>
      </div>
    );
  }

  const StatusIcon = statusConfig[invoice.status as keyof typeof statusConfig]?.icon || FileText;
  // v1.0.0: invoices has no `converted_to_invoice_id`/`proforma_invoice_id`/`converted_at` columns.
  // Conversion state is inferred from status and `converted_from_quote_id` (proforma→tax via RPC).
  const isConverted = invoice.invoice_type === 'proforma' && invoice.status === 'converted';
  const canEdit = ['draft', 'sent'].includes(invoice.status ?? '') && !isConverted;
  const canRecordPayment = invoice.invoice_type === 'tax_invoice' && ['sent', 'partial', 'overdue'].includes(invoice.status ?? '');
  const canConvert = invoice.invoice_type === 'proforma' && invoice.status !== 'converted';
  const hasConversionHistory = invoice.invoice_type === 'tax_invoice' && !!invoice.converted_from_quote_id;
  const wasConvertedFromProforma = invoice.invoice_type === 'tax_invoice' && !!invoice.converted_from_quote_id;

  return (
    <>
      <style>{`
        @media (min-width: 1280px) {
          #invoice-print-content {
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
          #invoice-print-content {
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

        .invoice-printable-content {
          width: 100%;
          height: 100%;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        #invoice-print-content *,
        .invoice-printable-content * {
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

        .invoice-table thead th {
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
          #invoice-print-content {
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

          #invoice-print-content,
          #invoice-print-content * {
            visibility: visible;
          }

          #invoice-print-content {
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
          onClick={() => navigate('/invoices')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-all hover:gap-3 font-medium"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Invoices</span>
        </button>

        <PageHeader title={`Invoice ${invoice.invoice_number || 'Draft'}`} />

        <div className="flex flex-col xl:grid xl:grid-cols-3 gap-6 mb-6">
          <div className="xl:col-span-2 w-full">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-6 min-w-0 overflow-x-auto">
              <InvoiceDocument
                invoice={invoice as unknown as Record<string, unknown>}
                companySettings={companySettings}
                currencyFormat={currencyFormat}
                t={tForDocument}
                elementId="invoice-print-content"
              />
            </div>
          </div>

          <div className="xl:col-span-1 space-y-6">
            {/* Status & Type Card */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Status</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <StatusIcon className="w-5 h-5" />
                  <Badge variant="custom" color={statusConfig[invoice.status as keyof typeof statusConfig]?.color || 'secondary'}>
                    {statusConfig[invoice.status as keyof typeof statusConfig]?.label || invoice.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5" />
                  <Badge variant="custom" color={typeConfig[invoice.invoice_type as keyof typeof typeConfig]?.color || '#64748b'}>
                    {typeConfig[invoice.invoice_type as keyof typeof typeConfig]?.label || invoice.invoice_type}
                  </Badge>
                </div>

                {isConverted && (
                  <div className="mt-4 p-3 bg-info-muted border border-info/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Lock className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-info">Read-Only (Converted)</span>
                    </div>
                    {/* v1.0.0: no `converted_to_invoice_id` column. Link via conversion history (B8). */}
                  </div>
                )}

                {wasConvertedFromProforma && (
                  <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowRight className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-medium text-slate-700">Created from Proforma</span>
                    </div>
                    {/* v1.0.0: no `proforma_invoice_id` column. The proforma quote_id is in `converted_from_quote_id` (B8 to wire navigation). */}
                  </div>
                )}
              </div>
            </Card>

            {/* Actions Card */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Actions</h3>

              {/* Error Messages */}
              {(translationsError || settingsError || resourceError) && (
                <div className="bg-danger-muted border border-danger/30 rounded-lg p-3 mb-4">
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
                <div className="bg-info-muted border border-info/30 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
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

                {canEdit && (
                  <Button
                    onClick={() => navigate(`/invoices/${id}/edit`)}
                    variant="secondary"
                    className="w-full"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Invoice
                  </Button>
                )}

                {canRecordPayment && (
                  <Button
                    onClick={() => setShowPaymentModal(true)}
                    variant="secondary"
                    className="w-full"
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Record Payment
                  </Button>
                )}

                {canConvert && (
                  <Button
                    onClick={handleConvertToTax}
                    variant="secondary"
                    className="w-full"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Convert to Tax Invoice
                  </Button>
                )}

                {hasConversionHistory && (
                  <Button
                    onClick={handleViewConversionHistory}
                    variant="secondary"
                    className="w-full"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    View Conversion History
                  </Button>
                )}
              </div>
            </Card>

            {/* Invoice Details */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Invoice Details</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-slate-600">Invoice Date:</span>
                  <span className="ml-2 text-slate-900 font-medium">
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600">Due Date:</span>
                  <span className="ml-2 text-slate-900 font-medium">
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </span>
                </div>
                <div className="pt-2 border-t">
                  <span className="text-slate-600">Total:</span>
                  <span className="ml-2 text-slate-900 font-bold">
                    {formatCurrency(invoice.total_amount || 0)}
                  </span>
                </div>
                {(invoice.amount_paid ?? 0) > 0 && (
                  <>
                    <div>
                      <span className="text-success">Paid:</span>
                      <span className="ml-2 text-success font-bold">
                        {formatCurrency(invoice.amount_paid ?? 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-warning">Balance Due:</span>
                      <span className="ml-2 text-warning font-bold">
                        {formatCurrency(
                          invoice.balance_due ??
                            ((invoice.total_amount ?? 0) - (invoice.amount_paid ?? 0))
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPaymentModal && id && (
        <RecordReceiptModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          singleInvoiceMode
          invoiceId={id}
          onSave={async (
            receiptData: Record<string, unknown>,
            allocations?: Array<{ invoice_id: string; allocated_amount: number }>
          ) => {
            const receiptRow = receiptData as Partial<PaymentReceipt> & {
              status?: string;
            };
            // `receipts` is the live tenant table. Several caller-facing fields
            // (account_id, payment_method_id, case_id, company_id, reference_number,
            // description, source_type) are not persisted here — they exist only on
            // the modal's draft. tenant_id is auto-populated by the
            // set_tenant_and_audit_fields trigger.
            if (typeof receiptRow.amount !== 'number') {
              throw new Error('Receipt amount is required');
            }
            // Real tenant uuid: the trigger only stamps NULL; '' fails the uuid cast.
            const tenantId = await resolveTenantId();
            const { data: receipt, error: receiptError } = await supabase
              .from('receipts')
              .insert({
                tenant_id: tenantId,
                amount: receiptRow.amount,
                receipt_date: receiptRow.receipt_date,
                customer_id: receiptRow.customer_id ?? null,
                payment_method: receiptRow.payment_method_id ?? null,
                reference: receiptRow.reference_number ?? null,
                notes: receiptRow.notes ?? null,
                status: receiptRow.status ?? 'completed',
              })
              .select()
              .maybeSingle();

            if (receiptError) throw receiptError;
            if (!receipt) throw new Error('Receipt insert returned no row');

            if (allocations && allocations.length > 0) {
              const allocationRecords = allocations.map((alloc) => ({
                tenant_id: tenantId,
                receipt_id: receipt.id,
                invoice_id: alloc.invoice_id,
                amount: alloc.allocated_amount,
              }));

              const { error: allocError } = await supabase
                .from('receipt_allocations')
                .insert(allocationRecords);

              if (allocError) throw allocError;
            }

            handlePaymentRecorded();
          }}
        />
      )}

      {/* Conversion History Modal */}
      {showConversionHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-2xl w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Conversion History</h3>
            {conversionHistory.length > 0 ? (
              <div className="space-y-3">
                {conversionHistory.map((item, index) => {
                  const proformaNumber =
                    typeof item.proforma_invoice_number === 'string'
                      ? item.proforma_invoice_number
                      : '';
                  const taxNumber =
                    typeof item.tax_invoice_number === 'string'
                      ? item.tax_invoice_number
                      : '';
                  const convertedAt =
                    typeof item.converted_at === 'string' ? item.converted_at : null;
                  return (
                    <div key={index} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-900">
                          {proformaNumber} → {taxNumber}
                        </span>
                        <Badge variant="success">Converted</Badge>
                      </div>
                      <div className="text-xs text-slate-600">
                        {convertedAt
                          ? `Converted on ${new Date(convertedAt).toLocaleDateString()}`
                          : 'Converted'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-600 text-center py-8">No conversion history available.</p>
            )}
            <div className="mt-6 flex justify-end">
              <Button variant="secondary" onClick={() => setShowConversionHistoryModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InvoiceDetailPage;
