import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PaymentReceiptDocument } from '../../components/documents/PaymentReceiptDocument';
import { fetchPaymentById } from '../../lib/paymentsService';
import { supabase } from '../../lib/supabaseClient';
import { useCurrency } from '../../hooks/useCurrency';
import { useDocumentTranslations } from '../../hooks/useDocumentTranslations';
import { logger } from '../../lib/logger';

export const PrintPaymentReceiptPage: React.FC = () => {
  const { paymentId } = useParams<{ paymentId: string }>();
  const { currencyFormat } = useCurrency();
  const { t, isLoading: translationsLoading } = useDocumentTranslations();
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const { data: payment, isLoading: paymentLoading, error: paymentError } = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: () => fetchPaymentById(paymentId!),
    enabled: !!paymentId,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('*')
          .maybeSingle();

        if (error) throw error;
        setCompanySettings(data);
      } catch (error) {
        logger.error('Error fetching company settings:', error);
      } finally {
        setSettingsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  if (!paymentId) {
    return (
      <div className="p-8 text-center">
        <p className="text-danger">Invalid payment ID</p>
      </div>
    );
  }

  if (paymentLoading || settingsLoading || translationsLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin mb-4"></div>
          <p className="text-slate-600">Loading payment receipt...</p>
        </div>
      </div>
    );
  }

  if (paymentError || !payment) {
    return (
      <div className="p-8 text-center">
        <p className="text-danger">Error loading payment. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="no-print fixed bottom-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold shadow-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
        <button
          onClick={() => window.close()}
          className="bg-slate-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:bg-slate-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close
        </button>
      </div>

      <PaymentReceiptDocument
        payment={payment}
        companySettings={companySettings}
        currencyFormat={currencyFormat}
        t={(key: string, fallback: string) => t(key as Parameters<typeof t>[0], fallback)}
      />

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }

          @page {
            size: A4;
            margin: 0;
          }

          body {
            margin: 0;
            padding: 0;
          }

          #receipt-print-frame {
            width: 210mm;
            height: 297mm;
            padding: 15mm;
            page-break-after: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default PrintPaymentReceiptPage;
