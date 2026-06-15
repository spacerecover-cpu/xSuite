import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { formatDate } from '../../lib/format';
import { useCurrency } from '../../hooks/useCurrency';
import {
  CreditCard,
  User,
  Calendar,
  Briefcase,
  FileText,
  Building2,
  Hash,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  Receipt,
  Printer,
} from 'lucide-react';

interface PaymentAllocation {
  invoice_id?: string;
  amount: number;
  invoice?: {
    invoice_number?: string;
    case?: {
      case_no?: string;
      title?: string;
    };
  };
}

interface PaymentViewData {
  payment_number?: string;
  payment_date?: string;
  amount?: number;
  status?: string;
  reference?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  customer?: { customer_name?: string; email?: string } | null;
  case?: { case_no?: string; title?: string } | null;
  payment_method?: { name?: string } | null;
  bank_account?: { account_name?: string } | null;
  created_by_profile?: { full_name?: string } | null;
  allocations?: PaymentAllocation[];
  [key: string]: unknown;
}

interface PaymentViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentViewData | null;
  onPrintReceipt?: () => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4" />;
    case 'pending':
      return <Clock className="w-4 h-4" />;
    case 'failed':
      return <XCircle className="w-4 h-4" />;
    case 'refunded':
      return <AlertCircle className="w-4 h-4" />;
    default:
      return null;
  }
};

export const PaymentViewModal: React.FC<PaymentViewModalProps> = ({
  isOpen,
  onClose,
  payment,
  onPrintReceipt,
}) => {
  const { formatCurrency } = useCurrency();

  if (!payment) return null;

  const customerName = payment.customer?.customer_name || 'N/A';
  const customerEmail = payment.customer?.email || 'N/A';
  const caseName = payment.case ? `${payment.case.case_no} - ${payment.case.title}` : 'N/A';
  const paymentMethodName = payment.payment_method?.name || 'N/A';
  const bankAccountName = payment.bank_account?.account_name || 'N/A';
  const createdByName = payment.created_by_profile?.full_name || 'System';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Payment Details"
      size="lg"
    >
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-success-muted to-success-muted rounded-xl p-6 border border-success/30">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Receipt className="w-8 h-8 text-success" />
                <div>
                  <p className="text-sm text-slate-600">Payment Number</p>
                  <h3 className="text-2xl font-bold text-slate-900">
                    {payment.payment_number}
                  </h3>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Calendar className="w-4 h-4 text-slate-500" />
                <p className="text-sm text-slate-600">
                  {payment.payment_date ? formatDate(payment.payment_date) : 'N/A'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600 mb-1">Amount</p>
              <p className="text-3xl font-bold text-success">
                {formatCurrency(payment.amount ?? 0)}
              </p>
              <div className="mt-2">
                <Badge
                  variant={statusToBadgeVariant(payment.status ?? '')}
                  size="md"
                  className="flex items-center gap-1.5"
                >
                  {getStatusIcon(payment.status ?? '')}
                  <span className="capitalize">{payment.status ?? 'unknown'}</span>
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-primary" />
              <h4 className="font-semibold text-slate-900">Customer Information</h4>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-slate-500">Name</p>
                <p className="text-sm font-medium text-slate-900">{customerName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="text-sm text-slate-700">{customerEmail}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-5 h-5 text-accent-foreground" />
              <h4 className="font-semibold text-slate-900">Case Information</h4>
            </div>
            <div>
              <p className="text-xs text-slate-500">Case</p>
              <p className="text-sm font-medium text-slate-900">{caseName}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-success" />
            <h4 className="font-semibold text-slate-900">Payment Details</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Payment Method</p>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-400" />
                <p className="text-sm font-medium text-slate-900">{paymentMethodName}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Bank Account</p>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <p className="text-sm font-medium text-slate-900">{bankAccountName}</p>
              </div>
            </div>
            {payment.reference && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Reference Number</p>
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-medium text-slate-900">
                    {payment.reference}
                  </p>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500 mb-1">Created By</p>
              <p className="text-sm font-medium text-slate-900">{createdByName}</p>
            </div>
          </div>
        </div>

        {payment.allocations && payment.allocations.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h4 className="font-semibold text-slate-900">Invoice Allocations</h4>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Invoice Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Case
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                      Amount Allocated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {payment.allocations!.map((allocation, index: number) => (
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-medium text-primary">
                            {allocation.invoice?.invoice_number || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {allocation.invoice?.case ?
                          `${allocation.invoice.case.case_no} - ${allocation.invoice.case.title}`
                          : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-success">
                          {formatCurrency(allocation.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                      Total Allocated:
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-base font-bold text-success">
                        {formatCurrency(
                          // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-payment rollup rendered in this payment's own currency; payment_allocations has no amount_base and the total must stay native
                          payment.allocations!.reduce(
                            (sum: number, a) => sum + (a.amount || 0),
                            0
                          )
                        )}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {payment.notes && (
          <div className="bg-warning-muted rounded-lg p-4 border border-warning/30">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Notes</h4>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{payment.notes}</p>
          </div>
        )}

        <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
          <p>
            Created on {payment.created_at ? formatDate(payment.created_at) : 'N/A'} by {createdByName}
          </p>
          {payment.updated_at && payment.updated_at !== payment.created_at && (
            <p className="mt-1">Last updated: {formatDate(payment.updated_at)}</p>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {onPrintReceipt && payment.status === 'completed' && (
            <Button
              onClick={onPrintReceipt}
              variant="primary"
              className="flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Print Receipt
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
