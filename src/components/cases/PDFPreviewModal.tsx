import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  Download,
  Mail,
  Printer,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileText,
} from 'lucide-react';
// pdfService + pdf/fonts are dynamic-imported inside the preview-load
// handler so eagerly importing this modal (CaseDetail mounts it) doesn't
// drag the 2 MB pdfmake-libs chunk into the case page's initial load.
import type { PDFBlobResult } from '../../lib/pdf/pdfService';
import type { DocumentType } from '../../lib/pdf/types';
import { logger } from '../../lib/logger';

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: DocumentType;
  documentId: string;
  documentNumber: string;
  customerEmail?: string;
  onSendEmail?: (blobUrl: string, blob: Blob, filename: string) => void;
}

const documentTitles: Record<DocumentType, string> = {
  office_receipt: 'Office Receipt',
  customer_copy: 'Customer Copy',
  checkout_form: 'Checkout Form',
  case_label: 'Case Label',
  quote: 'Quote',
  invoice: 'Invoice',
  credit_note: 'Credit Note',
  payment_receipt: 'Payment Receipt',
  payslip: 'Payslip',
  chain_of_custody: 'Chain of Custody',
};

export const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({
  isOpen,
  onClose,
  documentId,
  documentNumber,
  documentType,
  customerEmail: _customerEmail,
  onSendEmail,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<PDFBlobResult | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (isOpen && documentId) {
      loadPDF();
    }

    return () => {
      if (pdfResult?.blobUrl) {
        URL.revokeObjectURL(pdfResult.blobUrl);
      }
    };
  }, [isOpen, documentId, documentType]);

  const loadPDF = async () => {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);
    setLoadingMessage('Initializing PDF generation...');

    try {
      setLoadingMessage('Loading fonts and resources...');
      const [{ preloadAllFonts }, { generatePDFAsBlob }] = await Promise.all([
        import('../../lib/pdf/fonts'),
        import('../../lib/pdf/pdfService'),
      ]);
      await preloadAllFonts();

      setLoadingMessage('Fetching document data...');
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for UI update

      setLoadingMessage('Building PDF document...');
      const result = await generatePDFAsBlob(documentType, documentId);

      if (result.success && result.blobUrl) {
        setLoadingMessage('PDF ready!');
        setPdfResult(result);
      } else {
        const errorMsg = result.error || 'Failed to generate PDF';
        const code = result.errorCode || 'UNKNOWN';

        // Provide user-friendly error messages
        let friendlyError = errorMsg;
        if (code === 'TIMEOUT') {
          friendlyError = 'PDF generation is taking longer than expected. This might be due to slow internet or large file sizes. Please try again.';
        } else if (errorMsg.includes('font')) {
          friendlyError = 'Failed to load required fonts. The PDF will be generated in English-only mode. Click Retry to try again.';
        } else if (errorMsg.includes('fetch')) {
          friendlyError = 'Failed to fetch document data. Please check your internet connection and try again.';
        }

        setError(friendlyError);
        setErrorCode(code);
      }
    } catch (err) {
      logger.error('[PDF Preview] Error loading PDF:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to load PDF';
      const friendlyError = errorMsg.includes('timeout')
        ? 'PDF generation timed out. Please try again.'
        : 'An unexpected error occurred while generating the PDF. Please try again.';

      setError(friendlyError);
      setErrorCode('UNEXPECTED_ERROR');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (pdfResult?.blob && pdfResult?.filename) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfResult.blob);
      link.download = pdfResult.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleSendEmail = () => {
    if (onSendEmail && pdfResult?.blobUrl && pdfResult?.blob && pdfResult?.filename) {
      onSendEmail(pdfResult.blobUrl, pdfResult.blob, pdfResult.filename);
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    loadPDF();
  };

  const handleClose = () => {
    if (pdfResult?.blobUrl) {
      URL.revokeObjectURL(pdfResult.blobUrl);
    }
    setPdfResult(null);
    setError(null);
    setErrorCode(null);
    setRetryCount(0);
    onClose();
  };

  const documentTitle = documentTitles[documentType];

  const getDocumentLabel = () => {
    if (documentType === 'quote') return `Quote #${documentNumber}`;
    if (documentType === 'invoice') return `Invoice #${documentNumber}`;
    return `Case #${documentNumber}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title=""
      size="2xl"
    >
      <div className="flex flex-col h-[80vh]">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {documentTitle}
              </h2>
              <p className="text-sm text-slate-500">{getDocumentLabel()}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleDownload}
              disabled={isLoading || !!error}
              variant="secondary"
              size="sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={isLoading || !!error || !onSendEmail}
              variant="secondary"
              size="sm"
            >
              <Mail className="w-4 h-4 mr-2" />
              Send Email
            </Button>
            <Button
              onClick={handlePrint}
              disabled={isLoading || !!error}
              variant="secondary"
              size="sm"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        <div className="flex-1 mt-4 bg-slate-100 rounded-lg overflow-hidden relative">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <p className="text-slate-600 font-medium">{loadingMessage}</p>
              <p className="text-sm text-slate-400 mt-1">Please wait</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white p-6">
              <AlertCircle className="w-12 h-12 text-danger mb-4" />
              <p className="text-slate-900 font-medium mb-2">Failed to Generate PDF</p>
              <p className="text-sm text-slate-500 mb-2 max-w-md text-center">{error}</p>
              {errorCode && (
                <p className="text-xs text-slate-400 mb-4 font-mono">Error Code: {errorCode}</p>
              )}
              {retryCount > 0 && (
                <p className="text-xs text-slate-400 mb-4">Retry attempts: {retryCount}</p>
              )}
              <div className="flex gap-2">
                <Button onClick={handleRetry} variant="primary" size="sm">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {retryCount > 0 ? 'Try Again' : 'Retry'}
                </Button>
                {errorCode === 'TIMEOUT' && retryCount < 2 && (
                  <Button onClick={handleClose} variant="secondary" size="sm">
                    Cancel
                  </Button>
                )}
              </div>
              {retryCount >= 2 && (
                <div className="mt-4 p-3 bg-slate-50 rounded-lg max-w-md">
                  <p className="text-xs text-slate-600 text-center">
                    If the problem persists, please check your internet connection or try again later.
                    Contact support if the issue continues.
                  </p>
                </div>
              )}
            </div>
          )}

          {!isLoading && !error && pdfResult?.blobUrl && (
            <iframe
              ref={iframeRef}
              src={pdfResult.blobUrl}
              className="w-full h-full border-0"
              title={`${documentTitle} Preview`}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PDFPreviewModal;
