import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Receipt, Download, Calendar, FileText, DollarSign, AlertCircle } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { useCurrency } from '../../hooks/useCurrency';
import { generatePaymentReceipt } from '../../lib/pdf/pdfService';
import { logger } from '../../lib/logger';
import { baseAmount } from '../../lib/financialMath';

interface PortalPaymentRow {
  id: string;
  payment_number: string | null;
  amount: number;
  amount_base: number | null;
  currency: string | null;
  payment_date: string | null;
  reference: string | null;
  transaction_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  invoice_id: string | null;
  case_id: string | null;
  invoices: {
    invoice_number: string | null;
    total_amount: number | null;
    balance_due: number | null;
  } | null;
  cases: {
    case_no: string | null;
  } | null;
  master_payment_methods: {
    name: string | null;
  } | null;
}

type StatusBadgeVariant = 'success' | 'warning' | 'danger' | 'default';

function statusBadgeVariant(status: string | null): StatusBadgeVariant {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
    case 'received':
    case 'cleared':
    case 'paid':
      return 'success';
    case 'pending':
    case 'processing':
      return 'warning';
    case 'failed':
    case 'cancelled':
    case 'refunded':
      return 'danger';
    default:
      return 'default';
  }
}

export const PortalPayments: React.FC = () => {
  const { t } = useTranslation();
  const { customer } = usePortalAuth();
  const { formatCurrency } = useCurrency();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    document.title = t('portal.payments.tabTitle');
  }, [t]);

  const {
    data: payments,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['portal_payments', customer?.id],
    queryFn: async () => {
      if (!customer?.id) return [] as PortalPaymentRow[];

      const { data, error } = await supabase
        .from('payments')
        .select(`
          id, payment_number, amount, amount_base, currency, payment_date, reference, transaction_id, status, notes, created_at,
          invoice_id, case_id,
          invoices ( invoice_number, total_amount, balance_due ),
          cases ( case_no ),
          master_payment_methods ( name )
        `)
        .eq('customer_id', customer.id)
        .is('deleted_at', null)
        .order('payment_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as PortalPaymentRow[];
    },
    enabled: !!customer?.id,
  });

  const list = payments ?? [];
  const totalPaid = list.reduce(
    (sum, p) => sum + baseAmount(p as unknown as Record<string, unknown>, 'amount'),
    0,
  );

  const handleDownload = async (paymentId: string) => {
    setDownloadError(null);
    setDownloadingId(paymentId);
    try {
      const result = await generatePaymentReceipt(paymentId, true);
      if (!result.success) {
        setDownloadError(result.error ?? t('portal.payments.loadError'));
      }
    } catch (err) {
      logger.error('Portal payment receipt download failed:', err);
      setDownloadError(t('portal.payments.loadError'));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('portal.payments.heading')}</h1>
        <p className="text-slate-500 mt-1">
          {t('portal.payments.subtitle')}
        </p>
      </div>

      {isError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm">
          <p className="text-danger">{t('portal.payments.loadError')}</p>
          <button onClick={() => refetch()} className="mt-2 text-primary underline">
            {t('portal.payments.retry')}
          </button>
        </div>
      )}

      {downloadError && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning-muted p-4 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium text-slate-900">{t('portal.payments.downloadFailed')}</p>
            <p className="text-slate-600 mt-1">{downloadError}</p>
          </div>
          <button
            onClick={() => setDownloadError(null)}
            className="text-slate-500 hover:text-slate-700 text-xs underline"
          >
            {t('portal.payments.dismiss')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-info-muted rounded-lg flex items-center justify-center">
              <Receipt className="w-5 h-5 text-info" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">{t('portal.payments.totalPayments')}</p>
              <p className="text-2xl font-bold text-slate-900">{list.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-success-muted rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-success" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">{t('portal.payments.totalPaid')}</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPaid)}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">{t('portal.payments.paymentHistory')}</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{t('portal.payments.loadingPayments')}</div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">{t('portal.payments.noPaymentsYet')}</p>
            <p className="text-slate-400 text-sm mt-1">
              {t('portal.payments.noPaymentsSubtitle')}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((payment) => {
              const isDownloading = downloadingId === payment.id;
              const methodName = payment.master_payment_methods?.name ?? null;
              const invoiceNumber = payment.invoices?.invoice_number ?? null;
              const caseNo = payment.cases?.case_no ?? null;

              return (
                <div key={payment.id} className="px-6 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <span className="font-semibold text-slate-900 text-sm">
                          {payment.payment_number ?? `Payment #${payment.id.slice(0, 8)}`}
                        </span>
                        {payment.status && (
                          <Badge variant={statusBadgeVariant(payment.status)}>{payment.status}</Badge>
                        )}
                        {methodName && (
                          <span className="text-xs text-slate-500 bg-slate-100 rounded px-2 py-0.5">
                            {methodName}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-2">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                          {payment.payment_date ? formatDate(payment.payment_date) : formatDate(payment.created_at)}
                        </span>
                        {invoiceNumber && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                            {t('portal.payments.invoiceLabel', { number: invoiceNumber })}
                          </span>
                        )}
                        {caseNo && (
                          <span className="flex items-center gap-1">
                            {t('portal.payments.caseLabel', { caseNo })}
                          </span>
                        )}
                        {payment.reference && (
                          <span className="text-slate-400">{t('portal.payments.refLabel', { ref: payment.reference })}</span>
                        )}
                        {payment.transaction_id && (
                          <span className="text-slate-400">{t('portal.payments.txnLabel', { txn: payment.transaction_id })}</span>
                        )}
                      </div>

                      {payment.notes && (
                        <p className="text-xs text-slate-500 italic max-w-2xl truncate">{payment.notes}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 sm:gap-3 flex-shrink-0">
                      <p className="text-lg font-bold text-slate-900">{formatCurrency(payment.amount ?? 0)}</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleDownload(payment.id)}
                        disabled={isDownloading}
                        className="text-xs"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                        {isDownloading ? t('portal.payments.generating') : t('portal.payments.downloadReceipt')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default PortalPayments;
