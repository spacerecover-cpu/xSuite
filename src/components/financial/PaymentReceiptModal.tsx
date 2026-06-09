import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { PDFDownloadButton } from '../shared/PDFDownloadButton';
import { PaymentReceiptDocument } from '../documents/PaymentReceiptDocument';
import { useCurrency } from '../../hooks/useCurrency';
import { usePDFDownload } from '../../hooks/usePDFDownload';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

interface PaymentData {
  id?: string;
  payment_number?: string;
  customer?: { customer_name?: string } | null;
  [key: string]: unknown;
}

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentData | null;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  payment,
}) => {
  const { currencyFormat } = useCurrency();
  const toast = useToast();
  const {
    companySettings,
    isLoadingSettings,
    settingsReady,
    settingsError,
    translationsReady,
    translationsError,
    isLoadingTranslations,
    t,
  } = usePDFDownload();
  const [isGenerating, setIsGenerating] = useState(false);

  if (!payment) return null;

  const handleDownloadPDF = async () => {
    if (!payment.id) return;
    setIsGenerating(true);
    try {
      // Lazy-load pdfService so this modal — which is imported eagerly by
      // PaymentsList and several other parents — doesn't drag the 2 MB
      // pdfmake-libs chunk into the parent page's initial load.
      const { generatePaymentReceipt } = await import('../../lib/pdf/pdfService');
      const result = await generatePaymentReceipt(payment.id);
      if (!result.success) {
        toast.error(result.error || 'Failed to generate PDF');
      }
    } catch (error) {
      logger.error('Error generating payment receipt PDF:', error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadButton = (
    <PDFDownloadButton
      onClick={handleDownloadPDF}
      isGenerating={isGenerating}
      disabled={!payment.id || isLoadingSettings || isLoadingTranslations || !translationsReady || !settingsReady || translationsError || settingsError}
      tooltip={
        !payment.id
          ? 'Payment ID not available'
          : !translationsReady || !settingsReady
          ? 'Waiting for resources to load...'
          : translationsError || settingsError
          ? 'Cannot generate PDF due to loading errors'
          : undefined
      }
    />
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="large" headerAction={downloadButton}>
      <style>{`
        #receipt-print-frame {
          position: relative;
          width: 210mm;
          min-width: 210mm;
          max-width: 210mm;
          min-height: 297mm;
          padding: 15mm;
          margin: 0 auto;
          background: #ffffff;
          box-sizing: border-box;
          transform: none;
          transform-origin: top left;
          font-size: 13px;
          line-height: 1.4;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          -webkit-text-size-adjust: 100%;
          text-rendering: optimizeLegibility;
        }

        .receipt-printable-content {
          width: 100%;
          height: 100%;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        #receipt-print-frame *,
        .receipt-printable-content * {
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        @media print {
          #receipt-print-frame {
            width: 210mm;
            height: 297mm;
            padding: 15mm;
            page-break-after: avoid;
          }

          .receipt-printable-content {
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="overflow-auto" style={{ maxHeight: '80vh' }}>
        <PaymentReceiptDocument
          payment={payment}
          companySettings={companySettings}
          currencyFormat={currencyFormat}
          t={(key: string, fallback: string) => t(key as Parameters<typeof t>[0], fallback)}
          elementId="receipt-print-frame"
        />
      </div>
    </Modal>
  );
};
