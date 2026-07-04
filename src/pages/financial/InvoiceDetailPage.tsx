import React, { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchInvoiceById, convertProformaToTaxInvoice, getConversionHistory, updateInvoice, toInvoiceEditInitialData, getPaymentHistory, issueInvoice } from '../../lib/invoiceService';
import type { Invoice, InvoiceItem, InvoiceWithDetails } from '../../lib/invoiceService';
import { getInvoiceEditability, canRecordPayment as invoiceCanRecordPayment, canIssueInvoice as invoiceCanIssue, canCreditInvoice as invoiceCanCredit, getPaymentSummary } from '../../lib/invoicePermissions';
import { PaymentSummaryBar } from '../../components/financial/PaymentSummaryBar';
import { PaymentHistoryTable } from '../../components/financial/PaymentHistoryTable';
import { DetailPageTemplate } from '../../components/templates/DetailPageTemplate';
import { DetailSidebarCard } from '../../components/templates/DetailSidebarCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { PDFDownloadButton } from '../../components/shared/PDFDownloadButton';
import { InvoiceDocument } from '../../components/documents/InvoiceDocument';
import { useCurrency } from '../../hooks/useCurrency';
import { usePDFDownload } from '../../hooks/usePDFDownload';
import { useProfileNames } from '../../hooks/useProfileNames';
import { AuditInfo } from '../../components/ui/AuditInfo';
import { useToast } from '../../hooks/useToast';
import { FileText, CreditCard as Edit, DollarSign, AlertCircle, RefreshCw, CheckCircle, ArrowRight, Lock, Receipt, Send, FileMinus, Download } from 'lucide-react';
import { RecordReceiptModal } from '../../components/banking/RecordReceiptModal';
import { InvoiceFormModal } from '../../components/cases/InvoiceFormModal';
import { CreditNoteModal } from '../../components/financial/CreditNoteModal';
import { getCreditNotesByInvoice, generateCreditNotePDF } from '../../lib/creditNoteService';
import { creditNoteKeys } from '../../lib/queryKeys';
import { logger } from '../../lib/logger';
import { supabase } from '../../lib/supabaseClient';
import type { PaymentReceipt } from '../../lib/bankingService';
import { receiptsService } from '../../lib/receiptsService';
import {
  dryRunIssueTaxDocument, classifyRequirementFailures, parseRequirementFailures,
  type RequirementFailure,
} from '../../lib/taxDocumentService';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RequirementFailuresPanel } from '../../components/financial/RequirementFailuresPanel';

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
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [downloadingCnId, setDownloadingCnId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceWithDetails | null>(null);
  const [showConversionHistoryModal, setShowConversionHistoryModal] = useState(false);
  const [conversionHistory, setConversionHistory] = useState<Array<Record<string, unknown>>>([]);
  const [requirementFailures, setRequirementFailures] = useState<RequirementFailure[]>([]);
  const [showIssueWarnConfirm, setShowIssueWarnConfirm] = useState(false);
  const [issueWarnMessages, setIssueWarnMessages] = useState<string[]>([]);
  const [isIssuing, setIsIssuing] = useState(false);
  // Synchronous re-entry guard so a double-click can't fire two concurrent dry-runs.
  const issueBusyRef = useRef(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoiceById(id!),
    enabled: !!id,
  });
  const { nameOf } = useProfileNames([invoice?.created_by, invoice?.updated_by]);

  const { data: payments = [] } = useQuery({
    queryKey: ['invoice_payments', id],
    queryFn: () => getPaymentHistory(id!),
    enabled: !!id,
  });

  const { data: creditNotes = [] } = useQuery({
    queryKey: creditNoteKeys.byInvoice(id!),
    queryFn: () => getCreditNotesByInvoice(id!),
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

  // The authoritative issue call — the DB requirement gate re-checks atomically.
  // A P0403 (blocked) rejection is recovered into the panel (defense in depth).
  const performIssue = async () => {
    if (!id) return;
    setIsIssuing(true);
    try {
      await issueInvoice(id);
      toast.success('Invoice issued — payments can now be recorded');
      setRequirementFailures([]);
      setShowIssueWarnConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (error) {
      logger.error('Error issuing invoice:', error);
      const failures = parseRequirementFailures(error instanceof Error ? error.message : String(error));
      if (failures.length > 0) {
        setRequirementFailures(failures);
        setShowIssueWarnConfirm(false);
        toast.error('Issuance blocked — resolve the required fields first.');
      } else {
        // A non-gate failure (race, transient) — close the now-stale confirm dialog.
        setShowIssueWarnConfirm(false);
        toast.error(error instanceof Error ? error.message : 'Failed to issue invoice');
      }
    } finally {
      setIsIssuing(false);
    }
  };

  const handleIssueInvoice = async () => {
    if (!id || issueBusyRef.current || showIssueWarnConfirm) return;
    issueBusyRef.current = true;
    try {
      const dry = await dryRunIssueTaxDocument('invoice', id);
      setRequirementFailures(dry.requirement_failures);
      const decision = classifyRequirementFailures(dry.requirement_failures);
      if (decision.kind === 'block') {
        toast.error('Issuance blocked — resolve the required fields first.');
        return;
      }
      if (decision.kind === 'confirm') {
        setIssueWarnMessages(decision.messages);
        setShowIssueWarnConfirm(true);
        return;
      }
      await performIssue();
    } catch (error) {
      logger.error('Error checking issuance requirements:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to issue invoice');
    } finally {
      issueBusyRef.current = false;
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

  const handleCreditNoteSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['invoice', id] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: creditNoteKeys.byInvoice(id!) });
    setShowCreditNoteModal(false);
  };

  const handleDownloadCreditNote = async (creditNoteId: string) => {
    setDownloadingCnId(creditNoteId);
    try {
      const res = await generateCreditNotePDF(creditNoteId, true);
      if (!res.success) toast.error(res.error || 'Failed to generate credit note PDF');
    } catch (err) {
      logger.error('Error generating credit note PDF:', err);
      toast.error('Failed to generate credit note PDF');
    } finally {
      setDownloadingCnId(null);
    }
  };

  const handleOpenEdit = async () => {
    if (!id) return;
    // Re-fetch with line items so the form can pre-fill items (the detail
    // query returns the document-shaped invoice without an editable item array).
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      logger.error('Error loading invoice for edit:', error);
      toast.error('Failed to load invoice for editing.');
      return;
    }
    // LIVE line items only — soft-deleted rows must not resurface on edit.
    const { data: items } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });
    setEditingInvoice({ ...data, invoice_line_items: items ?? [] } as unknown as InvoiceWithDetails);
    setShowEditModal(true);
  };

  const StatusIcon = statusConfig[invoice?.status as keyof typeof statusConfig]?.icon || FileText;
  // v1.0.0: invoices has no `converted_to_invoice_id`/`proforma_invoice_id`/`converted_at` columns.
  // Conversion state is inferred from status and `converted_from_quote_id` (proforma→tax via RPC).
  const isConverted = invoice?.invoice_type === 'proforma' && invoice?.status === 'converted';
  const editability = invoice ? getInvoiceEditability(invoice) : null;
  const canEdit = editability !== null && editability.mode !== 'none';
  const canRecordPayment = invoice ? invoiceCanRecordPayment(invoice) : false;
  const canCredit = invoice ? invoiceCanCredit(invoice) : false;
  const canIssue = invoice ? invoiceCanIssue(invoice) : false;
  const canConvert = invoice?.invoice_type === 'proforma' && invoice?.status !== 'converted';
  const hasConversionHistory = invoice?.invoice_type === 'tax_invoice' && !!invoice?.converted_from_quote_id;
  const wasConvertedFromProforma = invoice?.invoice_type === 'tax_invoice' && !!invoice?.converted_from_quote_id;

  // Rendered via DetailPageTemplate's `outside` slot — at root, in every state
  // (including loading/not-found) — so the print CSS + modal portals are never
  // clipped by the padded container.
  const outsideContent = (
    <>
      <style>{`
        /* True-to-print A4 preview only once the 2/3 document column can
           actually hold 210mm (~794px). With the 288px sidebar + page gutters
           that needs a ~1800px viewport; below it the fluid rule beneath takes
           over so the page never clips its right edge on a 13" laptop. The PDF
           is generated programmatically (pdfmake), so this on-screen sizing
           never affects the downloaded document. */
        @media (min-width: 1800px) {
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

        @media (max-width: 1799px) {
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
            const r = receiptData as Partial<PaymentReceipt> & { status?: string };
            if (typeof r.amount !== 'number') {
              throw new Error('Receipt amount is required');
            }
            // Atomic, money-conserving, append-only-ledger-posting receipt recording.
            // singleInvoiceMode emits no allocations, so allocate the full amount to this invoice.
            const allocs =
              allocations && allocations.length > 0
                ? allocations.map((a) => ({ invoice_id: a.invoice_id, amount: a.allocated_amount }))
                : [{ invoice_id: id as string, amount: r.amount }];
            await receiptsService.createReceiptWithAllocations(
              {
                amount: r.amount,
                receipt_date: r.receipt_date ?? null,
                customer_id: r.customer_id ?? null,
                payment_method: r.payment_method_id ?? null,
                reference: r.reference_number ?? null,
                notes: r.notes ?? null,
                status: r.status ?? 'completed',
                bank_account_id: r.account_id ?? null,
              },
              allocs,
            );
            handlePaymentRecorded();
          }}
        />
      )}

      {/* Credit Note Modal */}
      {showCreditNoteModal && invoice && (
        <CreditNoteModal
          isOpen={showCreditNoteModal}
          onClose={() => setShowCreditNoteModal(false)}
          invoice={{
            id: invoice.id!,
            invoice_number: invoice.invoice_number,
            total_amount: invoice.total_amount,
            amount_paid: invoice.amount_paid,
            balance_due: invoice.balance_due,
            tax_amount: invoice.tax_amount,
            currency: invoice.currency,
            case_id: invoice.case_id,
            customer_id: invoice.customer_id,
            company_id: invoice.company_id,
          }}
          onSaved={handleCreditNoteSaved}
        />
      )}

      {/* Edit Invoice Modal */}
      {showEditModal && editingInvoice && (
        <InvoiceFormModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingInvoice(null);
          }}
          onSave={async (invoiceData: Record<string, unknown>, items: InvoiceItem[]) => {
            const invoicePayload = invoiceData as Partial<Invoice>;
            if (!editingInvoice.id) return;
            await updateInvoice(
              editingInvoice.id,
              {
                case_id: invoicePayload.case_id,
                customer_id: invoicePayload.customer_id,
                company_id: invoicePayload.company_id,
                title: invoicePayload.title,
                invoice_type: invoicePayload.invoice_type,
                invoice_date: invoicePayload.invoice_date,
                due_date: invoicePayload.due_date,
                status: invoicePayload.status,
                payment_terms: invoicePayload.payment_terms,
                notes: invoicePayload.notes,
                internal_notes: invoicePayload.internal_notes,
                discount_amount: invoicePayload.discount_amount,
                discount_type: invoicePayload.discount_type,
                tax_rate: invoicePayload.tax_rate,
                client_reference: invoicePayload.client_reference,
                bank_account_id: invoicePayload.bank_account_id,
                terms_and_conditions: invoicePayload.terms_and_conditions,
                quote_id: invoicePayload.quote_id,
              },
              items,
            );
            queryClient.invalidateQueries({ queryKey: ['invoice', id] });
            queryClient.invalidateQueries({ queryKey: ['invoice_payments', id] });
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice_stats'] });
          }}
          caseId={editingInvoice.case_id || ''}
          customerId={editingInvoice.customer_id}
          companyId={editingInvoice.company_id}
          initialData={editingInvoice ? toInvoiceEditInitialData(editingInvoice as unknown as Record<string, unknown>) : undefined}
          clientReference={editingInvoice.client_reference}
        />
      )}

      {/* Conversion History Modal */}
      <Modal
        isOpen={showConversionHistoryModal}
        onClose={() => setShowConversionHistoryModal(false)}
        title="Conversion History"
        size="lg"
      >
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
      </Modal>
    </>
  );

  return (
    <DetailPageTemplate
      loading={isLoading}
      notFound={!isLoading && !invoice}
      backTo={{ to: '/invoices', label: 'Back to Invoices' }}
      outside={outsideContent}
      header={{
        breadcrumbs: [
          { label: 'Invoices', to: '/invoices' },
          { label: `Invoice ${invoice?.invoice_number || 'Draft'}` },
        ],
        badges: (
          <>
            <div className="flex items-center gap-2">
              <StatusIcon className="w-5 h-5" />
              <Badge variant="custom" color={statusConfig[invoice?.status as keyof typeof statusConfig]?.color || 'secondary'}>
                {statusConfig[invoice?.status as keyof typeof statusConfig]?.label || invoice?.status}
              </Badge>
            </div>
            <Badge variant="custom" color={typeConfig[invoice?.invoice_type as keyof typeof typeConfig]?.color || '#64748b'}>
              {typeConfig[invoice?.invoice_type as keyof typeof typeConfig]?.label || invoice?.invoice_type}
            </Badge>
          </>
        ),
        actions: (
          <>
            <PDFDownloadButton
              onClick={handleDownloadPDF}
              isGenerating={isGenerating}
              disabled={isLoadingSettings || isLoadingTranslations || !translationsReady || !settingsReady || translationsError || settingsError}
            />
            {canEdit && (
              <Button onClick={handleOpenEdit} variant="secondary">
                <Edit className="w-4 h-4 mr-2" />
                Edit Invoice
              </Button>
            )}
            {canIssue && (
              <Button onClick={handleIssueInvoice}>
                <Send className="w-4 h-4 mr-2" />
                Issue Invoice
              </Button>
            )}
            {canRecordPayment && (
              <Button onClick={() => setShowPaymentModal(true)} variant="secondary">
                <DollarSign className="w-4 h-4 mr-2" />
                Record Payment
              </Button>
            )}
            {canCredit && (
              <Button onClick={() => setShowCreditNoteModal(true)} variant="secondary">
                <FileMinus className="w-4 h-4 mr-2" />
                Create Credit Note
              </Button>
            )}
            {canConvert && (
              <Button onClick={handleConvertToTax} variant="secondary">
                <RefreshCw className="w-4 h-4 mr-2" />
                Convert to Tax Invoice
              </Button>
            )}
            {hasConversionHistory && (
              <Button onClick={handleViewConversionHistory} variant="secondary">
                <ArrowRight className="w-4 h-4 mr-2" />
                View Conversion History
              </Button>
            )}
          </>
        ),
        meta: (
          <AuditInfo
            variant="inline"
            createdAt={invoice?.created_at}
            createdByName={nameOf(invoice?.created_by)}
            updatedAt={invoice?.updated_at}
            updatedByName={nameOf(invoice?.updated_by)}
          />
        ),
      }}
      alerts={
        <>
          {(translationsError || settingsError || resourceError) && (
            <div className="bg-danger-muted border border-danger/30 rounded-lg p-3">
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
          {(isLoadingTranslations || isLoadingSettings) && !translationsError && !settingsError && (
            <div className="bg-info-muted border border-info/30 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-sm text-info">
                  Loading resources...
                </span>
              </div>
            </div>
          )}
          {isConverted && (
            <div className="p-3 bg-info-muted border border-info/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-info">Read-Only (Converted)</span>
              </div>
              {/* v1.0.0: no `converted_to_invoice_id` column. Link via conversion history (B8). */}
            </div>
          )}
          {wasConvertedFromProforma && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">Created from Proforma</span>
              </div>
              {/* v1.0.0: no `proforma_invoice_id` column. The proforma quote_id is in `converted_from_quote_id` (B8 to wire navigation). */}
            </div>
          )}
          <RequirementFailuresPanel failures={requirementFailures} />
        </>
      }
    >
      {invoice && (
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

          <div className="xl:col-span-1 space-y-4">
            {/* Invoice Details */}
            <DetailSidebarCard title="Invoice Details">
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
            </DetailSidebarCard>

            <DetailSidebarCard title="Payment History" icon={Receipt}>
              <div className="space-y-3">
                <PaymentSummaryBar summary={getPaymentSummary(invoice)} formatMoney={formatCurrency} />
                <PaymentHistoryTable
                  entries={payments}
                  formatMoney={formatCurrency}
                  formatDate={(d) => (d ? new Date(d).toLocaleDateString() : '—')}
                />
              </div>
            </DetailSidebarCard>

            {creditNotes.length > 0 && (
              <DetailSidebarCard title="Credit Notes" icon={FileMinus}>
                <div className="divide-y divide-border">
                  {creditNotes.map((cn) => (
                    <div key={cn.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{cn.credit_note_number}</p>
                        <p className="text-xs text-slate-500">
                          {cn.credit_note_date ? new Date(cn.credit_note_date).toLocaleDateString() : '—'}
                          {cn.reason_code ? ` · ${cn.reason_code.replace(/_/g, ' ')}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {cn.status === 'void' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Void</span>
                        )}
                        <span
                          className={`font-semibold tabular-nums ${cn.status === 'void' ? 'text-slate-400 line-through' : 'text-slate-900'}`}
                        >
                          −{formatCurrency(cn.total_amount || 0)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDownloadCreditNote(cn.id)}
                          disabled={downloadingCnId === cn.id}
                          className="p-1 text-slate-400 hover:text-primary disabled:opacity-50"
                          title="Download credit note PDF"
                          aria-label="Download credit note PDF"
                        >
                          {downloadingCnId === cn.id ? (
                            <span className="block w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </DetailSidebarCard>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={showIssueWarnConfirm}
        onClose={() => setShowIssueWarnConfirm(false)}
        onConfirm={() => void performIssue()}
        title="Review before issuing"
        message={issueWarnMessages.join(' ')}
        confirmText="Issue anyway"
        variant="warning"
        isLoading={isIssuing}
      />
    </DetailPageTemplate>
  );
};

export default InvoiceDetailPage;
