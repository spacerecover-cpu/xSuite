import { useState, useEffect, useRef } from 'react';
import { Download, Edit, FileText, CheckCircle, Send, AlertCircle, Mail, Printer } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { reportsService } from '../../lib/reportsService';
// reportPDFService is dynamic-imported in generatePDFPreview so this
// modal — imported eagerly by CaseDetail — doesn't pull the pdfmake
// chunk into the case page's initial load.
import {
  getReportTypeConfig,
  getReportStatusConfig,
  type Report,
  type ReportSectionData,
} from '../../lib/reportTypes';
import { format } from 'date-fns';
import { EmailDocumentModal } from './EmailDocumentModal';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Skeleton } from '../ui/Skeleton';

interface ReportViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  onEdit?: () => void;
  onNewVersion?: () => void;
  onApprove?: (reportId: string) => void;
  onSend?: (reportId: string) => void;
}

export default function ReportViewModal({
  isOpen,
  onClose,
  reportId,
  onEdit,
  onNewVersion,
  onApprove,
  onSend,
}: ReportViewModalProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [report, setReport] = useState<Report | null>(null);
  const [, setSections] = useState<ReportSectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>('');
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (isOpen && reportId) {
      loadReport();
    }
  }, [isOpen, reportId]);

  useEffect(() => {
    if (isOpen && reportId && !loading && report) {
      generatePDFPreview();
    }
  }, [isOpen, reportId, loading, report]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  const loadReport = async () => {
    try {
      setLoading(true);
      setPdfError(null);
      const [reportData, sectionsData] = await Promise.all([
        reportsService.getReportById(reportId),
        reportsService.getReportSections(reportId),
      ]);

      setReport(reportData);
      setSections(sectionsData);
    } catch (error) {
      logger.error('Error loading report:', error);
      setPdfError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const generatePDFPreview = async () => {
    try {
      setPdfError(null);
      const { reportPDFService } = await import('../../lib/reportPDFService');
      const result = await reportPDFService.generateReportAsBlob(reportId);

      if (result.success && result.blobUrl && result.blob && result.filename) {
        setPdfBlobUrl(result.blobUrl);
        setPdfBlob(result.blob);
        setPdfFilename(result.filename);
      } else {
        setPdfError(result.error || 'Failed to generate PDF preview');
      }
    } catch (error) {
      logger.error('Error generating PDF preview:', error);
      setPdfError('Failed to generate PDF preview');
    }
  };

  const handleDownloadPDF = async () => {
    if (!report) return;

    try {
      setDownloadingPDF(true);
      const { reportPDFService } = await import('../../lib/reportPDFService');
      await reportPDFService.downloadReportPDF(reportId);
    } catch (error) {
      logger.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF. Please try again.');
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleApprove = async () => {
    if (!report) return;

    const ok = await confirm({
      title: 'Approve Report',
      message: 'Are you sure you want to approve this report?',
      confirmLabel: 'Approve',
      tone: 'danger',
    });
    if (ok) {
      try {
        await onApprove?.(report.id);
        await loadReport();
      } catch (error) {
        logger.error('Error approving report:', error);
        toast.error('Failed to approve report');
      }
    }
  };

  const handleSendToCustomer = async () => {
    if (!report) return;

    if (report.status !== 'approved') {
      toast.warning('Report must be approved before sending to customer');
      return;
    }

    const ok = await confirm({
      title: 'Send to Customer',
      message: 'Send this report to the customer?',
      confirmLabel: 'Send',
      tone: 'danger',
    });
    if (ok) {
      try {
        await onSend?.(report.id);
        await loadReport();
      } catch (error) {
        logger.error('Error sending report:', error);
        toast.error('Failed to send report');
      }
    }
  };

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleSendEmail = () => {
    if (pdfBlob && pdfFilename) {
      setShowEmailModal(true);
    }
  };

  if (loading || !report) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Loading...">
        <div className="text-center py-8">Loading report...</div>
      </Modal>
    );
  }

  const typeConfig = getReportTypeConfig(report.report_type);
  const statusConfig = getReportStatusConfig(report.status);
  const TypeIcon = typeConfig.icon;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" maxWidth="6xl">
      <div className="flex flex-col h-[calc(100vh-12rem)]">
        {/* Compact Header with Actions */}
        <div className="flex-shrink-0 border-b pb-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TypeIcon className="w-6 h-6" style={{ color: typeConfig.color }} />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{report.title}</h2>
                <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
                  <span className="font-medium">{report.report_number}</span>
                  <span>•</span>
                  <Badge style={{ backgroundColor: statusConfig.color, color: 'white' }} className="text-xs">
                    {statusConfig.label}
                  </Badge>
                  {report.version_number > 1 && (
                    <>
                      <span>•</span>
                      <Badge variant="secondary" className="text-xs">v{report.version_number}</Badge>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleDownloadPDF}
                disabled={downloadingPDF || !pdfBlobUrl}
                variant="secondary"
                size="sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={!pdfBlob || !pdfFilename}
                variant="secondary"
                size="sm"
              >
                <Mail className="w-4 h-4 mr-2" />
                Send Email
              </Button>
              <Button
                onClick={handlePrint}
                disabled={!pdfBlobUrl}
                variant="secondary"
                size="sm"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            </div>
          </div>

          {/* Created By Info */}
          <div className="mt-3 text-sm text-slate-600">
            <span className="text-slate-500">Created By</span>
            <span className="mx-2 font-medium text-slate-900">
              {report.created_by_profile?.full_name || 'Unknown'}
            </span>
            <span className="text-slate-400">
              {format(new Date(report.created_at), 'MMM dd, yyyy HH:mm')}
            </span>
          </div>

          {/* Version Notes */}
          {report.version_notes && (
            <div className="mt-3 p-3 bg-info-muted border border-info/30 rounded-lg">
              <div className="text-xs font-medium text-info mb-1">Version Notes</div>
              <div className="text-sm text-info">{report.version_notes}</div>
            </div>
          )}
        </div>

        {/* PDF Preview */}
        <div className="flex-1 overflow-hidden">
          {pdfError && (
            <div className="bg-danger-muted border border-danger/30 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-danger mb-1">Error Loading PDF</h4>
                  <p className="text-sm text-danger">{pdfError}</p>
                </div>
              </div>
            </div>
          )}

          {!pdfError && !pdfBlobUrl && (
            <div className="h-full border border-gray-300 rounded-lg p-8 space-y-4">
              <Skeleton className="h-8 w-1/2 mx-auto" />
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <div className="space-y-3 pt-6">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <p className="text-sm text-gray-600 text-center pt-4">Generating PDF preview...</p>
            </div>
          )}

          {!pdfError && pdfBlobUrl && (
            <iframe
              ref={iframeRef}
              src={pdfBlobUrl}
              className="w-full h-full border border-gray-300 rounded-lg"
              title="Report PDF Preview"
            />
          )}
        </div>

        {/* Workflow Actions */}
        <div className="flex-shrink-0 flex items-center justify-end gap-2 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            {report.status === 'draft' && onEdit && (
              <Button variant="ghost" onClick={onEdit}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
            {report.is_latest_version && onNewVersion && (
              <Button variant="ghost" onClick={onNewVersion}>
                <FileText className="w-4 h-4 mr-2" />
                New Version
              </Button>
            )}
            {report.status === 'review' && onApprove && (
              <Button onClick={handleApprove}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve
              </Button>
            )}
            {report.status === 'approved' && !report.sent_to_customer_at && onSend && (
              <Button onClick={handleSendToCustomer}>
                <Send className="w-4 h-4 mr-2" />
                Send to Customer
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Email Document Modal */}
      {showEmailModal && pdfBlob && pdfFilename && (
        <EmailDocumentModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          blob={pdfBlob}
          filename={pdfFilename}
          documentType="office_receipt"
          caseId={report.case_id}
          caseNumber={report.report_number}
          customerName="Customer"
          customerEmail=""
          companyName="Company"
        />
      )}
    </Modal>
  );
}
