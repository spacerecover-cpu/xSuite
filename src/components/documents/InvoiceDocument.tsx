/**
 * @deprecated This component is deprecated and should not be used for new features.
 * Use PDFPreviewModal with documentType="invoice" instead for consistent PDF viewing experience.
 * This component remains for backward compatibility with existing inline HTML rendering.
 */

import React from 'react';
import { User, Building2, FileText } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { formatDate, cleanBankFieldValue, formatCurrencyWithConfig } from '../../lib/format';
import { useCurrencyConfig } from '../../contexts/TenantConfigContext';
import { useDocumentCompliance } from '../../hooks/useDocumentCompliance';

interface CompanySettings {
  basic_info?: {
    company_name?: string;
    legal_name?: string;
    registration_number?: string;
    vat_number?: string;
  };
  location?: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    building_name?: string;
    unit_number?: string;
  };
  contact_info?: {
    phone_primary?: string;
    email_general?: string;
  };
  branding?: {
    logo_url?: string;
    brand_tagline?: string;
    qr_code_invoice_url?: string;
    qr_code_invoice_caption?: string;
  };
  online_presence?: {
    website?: string;
  };
  banking_info?: {
    bank_name?: string;
    account_name?: string;
    account_number?: string;
    iban?: string;
  };
}

interface CurrencyFormat {
  currencySymbol: string;
  decimalPlaces: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseInvoiceData = Record<string, any>;

interface InvoiceDocumentProps {
  invoice: LooseInvoiceData;
  companySettings: CompanySettings | null;
  currencyFormat: CurrencyFormat;
  t: (key: string, fallback: string) => string;
  elementId?: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'draft':
      return '#64748b';
    case 'sent':
      return '#3b82f6';
    case 'paid':
      return '#10b981';
    case 'partial':
      return '#f59e0b';
    case 'overdue':
      return '#ef4444';
    case 'cancelled':
      return '#64748b';
    default:
      return '#64748b';
  }
};

const getInvoiceTypeColor = (type: string) => {
  return type === 'proforma' ? '#d946ef' : '#0ea5e9';
};

export const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({
  invoice,
  companySettings,
  currencyFormat: _currencyFormat,
  t,
  elementId = 'print-frame',
}) => {
  const currencyConfig = useCurrencyConfig();
  const formatMoney = (n: number | null | undefined): string =>
    formatCurrencyWithConfig(n ?? 0, currencyConfig);
  // Same choke point (countryTemplateOverride) the pdfmake adapter reads, so the
  // preview title/band/tax rows can never structurally diverge from print (AD-2).
  const compliance = useDocumentCompliance(
    'invoice',
    invoice?.id ?? null,
    { taxRate: invoice?.tax_rate ?? null, taxAmount: invoice?.tax_amount ?? 0 },
  );

  if (!invoice) return null;

  const customerAssociatedCompany = invoice.customer_associated_company;
  const customerName =
    invoice.customers_enhanced?.customer_name ||
    invoice.customers?.customer_name ||
    customerAssociatedCompany?.company_name ||
    invoice.companies?.company_name ||
    'N/A';
  const companyName = customerAssociatedCompany?.company_name || invoice.companies?.company_name || null;
  const customerEmail = invoice.customers_enhanced?.email || invoice.customers?.email || invoice.companies?.email || 'N/A';
  const customerPhone = invoice.customers_enhanced?.mobile_number || invoice.customers?.mobile_number || invoice.companies?.phone_number || 'N/A';

  const subtotal = invoice.subtotal || 0;
  const discountAmount = invoice.discount_amount || 0;
  const discountedSubtotal = subtotal - discountAmount;
  // Tax rows come from document_tax_lines (via useDocumentCompliance) — no
  // render-time (subtotal - discount) * rate recompute (AD-3).
  // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency: summing this ONE document's own tax-component rows, not a cross-document rollup
  const taxTotal = compliance.taxRows.reduce((sum, row) => sum + row.amount, 0);
  const totalAmount = invoice.total_amount ?? (discountedSubtotal + taxTotal);

  return (
    <div id={elementId}>
      <div className="invoice-printable-content space-y-3">
        {/* Professional Header with Company Logo and Details */}
        <div className="border-b border-red-600 pb-2 print-border">
          <div className="flex items-start justify-between">
            {/* Company Logo */}
            <div className="flex-shrink-0">
              {companySettings?.branding?.logo_url ? (
                <img
                  src={companySettings.branding.logo_url}
                  alt="Company Logo"
                  className="h-10 w-auto object-contain"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-8 h-8 text-blue-600" />
                  <span className="text-base font-bold text-slate-900">
                    {companySettings?.basic_info?.company_name || 'Company Name'}
                  </span>
                </div>
              )}
            </div>

            {/* Company Contact Information */}
            <div className="text-right text-xs leading-tight">
              <h3 className="font-bold text-slate-900 text-sm mb-0.5">
                {companySettings?.basic_info?.company_name || 'Company Name'}
              </h3>
              {(companySettings?.basic_info?.registration_number || compliance.taxBandLabel) && (
                <p className="text-slate-600 leading-tight">
                  {companySettings?.basic_info?.registration_number && `Reg No: ${companySettings.basic_info.registration_number}`}
                  {companySettings?.basic_info?.registration_number && compliance.taxBandLabel && ' | '}
                  {compliance.taxBandLabel && `${compliance.taxBandLabel}: ${compliance.sellerTaxNumber ?? companySettings?.basic_info?.vat_number ?? ''}`}
                </p>
              )}
              <div className="mt-1 space-y-0">
                {companySettings?.location?.building_name && (
                  <p className="text-slate-700 leading-tight">{companySettings.location.building_name}</p>
                )}
                {companySettings?.location?.address_line1 && (
                  <p className="text-slate-700 leading-tight">{companySettings.location.address_line1}</p>
                )}
                {(companySettings?.location?.city || companySettings?.location?.country) && (
                  <p className="text-slate-700 leading-tight">
                    {companySettings?.location?.city}
                    {companySettings?.location?.city && companySettings?.location?.country && ', '}
                    {companySettings?.location?.country}
                  </p>
                )}
              </div>
              <div className="mt-1 space-y-0">
                {companySettings?.contact_info?.email_general && (
                  <p className="text-blue-600 leading-tight">
                    {companySettings.contact_info.email_general}
                  </p>
                )}
                {companySettings?.contact_info?.phone_primary && (
                  <p className="text-slate-700 leading-tight">
                    {companySettings.contact_info.phone_primary}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Document Title */}
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            {invoice.invoice_type === 'proforma'
              ? t('proformaInvoice', 'PROFORMA INVOICE')
              : compliance.title.ar
                ? `${compliance.title.en} | ${compliance.title.ar}`
                : compliance.title.en}
          </h2>
          <div className="flex justify-center mt-1 hide-in-pdf">
            <div className="flex gap-2">
              <Badge variant="custom" color={getInvoiceTypeColor(invoice.invoice_type)}>
                {invoice.invoice_type === 'proforma' ? 'Proforma' : 'Tax Invoice'}
              </Badge>
              <Badge variant="custom" color={getStatusColor(invoice.status)}>
                {invoice.status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Customer and Invoice Details Side by Side */}
        <div className="grid grid-cols-2 gap-3 items-stretch mt-3" style={{ marginBottom: '16px' }}>
          {/* Customer Information */}
          <div className="border border-blue-200 rounded bg-blue-50 p-2 flex flex-col">
            <div className="section-title">
              <User className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">{t('customerInformation', 'Customer Information')}</h3>
            </div>
            <div className="space-y-1 text-xs">
              {companyName && (
                <div className="flex">
                  <span className="font-semibold text-slate-700 w-24 flex-shrink-0">Company:</span>
                  <span className="text-slate-900 flex-1">{companyName}</span>
                </div>
              )}
              <div className="flex">
                <span className="font-semibold text-slate-700 w-24 flex-shrink-0">Name:</span>
                <span className="text-slate-900 flex-1">{customerName}</span>
              </div>
              <div className="flex">
                <span className="font-semibold text-slate-700 w-24 flex-shrink-0">Phone:</span>
                <span className="text-slate-900 flex-1">{customerPhone}</span>
              </div>
              <div className="flex">
                <span className="font-semibold text-slate-700 w-24 flex-shrink-0">Email:</span>
                <span className="text-blue-600 flex-1 break-words">{customerEmail}</span>
              </div>
              {invoice.client_reference && (
                <div className="flex">
                  <span className="font-semibold text-slate-700 w-24 flex-shrink-0">Client Ref:</span>
                  <span className="text-slate-900 flex-1">{invoice.client_reference}</span>
                </div>
              )}
            </div>
          </div>

          {/* Invoice Details */}
          <div className="border border-blue-200 rounded bg-blue-50 p-2 flex flex-col">
            <div className="section-title">
              <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">{t('invoiceDetails', 'Invoice Details')}</h3>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex">
                <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Invoice No:</span>
                <span className="text-slate-900 font-mono flex-1">{invoice.invoice_number || 'Draft'}</span>
              </div>
              <div className="flex">
                <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Invoice Date:</span>
                <span className="text-slate-900 flex-1">{formatDate(invoice.invoice_date)}</span>
              </div>
              <div className="flex">
                <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Due Date:</span>
                <span className="text-slate-900 flex-1">{formatDate(invoice.due_date)}</span>
              </div>
              {invoice.cases?.case_no && (
                <div className="flex">
                  <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Job ID:</span>
                  <span className="text-slate-900 flex-1">{invoice.cases.case_no}</span>
                </div>
              )}
              <div className="flex">
                <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Invoice Value:</span>
                <span className="text-slate-900 flex-1">
                  {formatMoney(invoice.total_amount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div style={{ marginTop: '16px', marginBottom: '24px' }}>
          <div className="border border-slate-300 rounded overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-100 border-b border-slate-300">
                <tr className="invoice-table">
                  <th className="text-left text-xs font-bold text-slate-900 px-2 py-2">
                    {t('description', 'Description')}
                  </th>
                  <th className="text-center text-xs font-bold text-slate-900 px-2 py-2">
                    {t('qty', 'Qty')}
                  </th>
                  <th className="text-right text-xs font-bold text-slate-900 px-2 py-2">
                    {t('unitPrice', 'Unit Price')}
                  </th>
                  <th className="text-right text-xs font-bold text-slate-900 px-2 py-2">
                    {t('amount', 'Amount')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {(invoice.invoice_line_items as Array<{ description: string; quantity: number; unit_price: number; line_total?: number }> | undefined)?.map((item, index: number) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 text-xs text-slate-900">
                      {item.description}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-slate-900 text-center font-medium">
                      {item.quantity}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-slate-900 text-right font-medium">
                      {formatMoney(item.unit_price)}
                    </td>
                    <td className="px-2 py-1.5 text-xs font-semibold text-slate-900 text-right">
                      {formatMoney(item.line_total || (item.quantity * item.unit_price))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="pt-1" style={{ marginTop: '32px' }}>
          <div className="space-y-1.5 max-w-md ml-auto">
            <div className="flex justify-between text-sm">
              <span className="text-slate-700 font-medium">{t('subtotal', 'Subtotal')}:</span>
              <span className="font-semibold text-slate-900 text-right">
                {formatMoney(invoice.subtotal)}
              </span>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-700 font-medium">
                  {t('discount', 'Discount')}:
                </span>
                <span className="font-semibold text-red-600 text-right">
                  - {formatMoney(invoice.discount_amount)}
                </span>
              </div>
            )}
            {compliance.taxRows.map((row, index) => (
              <div
                key={`${row.label}-${index}`}
                className="flex justify-between text-sm"
                style={index === compliance.taxRows.length - 1 ? { marginBottom: '12px' } : undefined}
              >
                <span className="text-slate-700 font-medium">{row.label}:</span>
                <span className="font-semibold text-slate-900 text-right">
                  {formatMoney(row.amount)}
                </span>
              </div>
            ))}
            <div className="total-row-band">
              <div className="total-row-band-inner">
                <span className="total-label">{t('total', 'Total')} | الإجمالي:</span>
                <span className="total-amount">
                  {formatMoney(totalAmount)}
                </span>
              </div>
            </div>
            {invoice.amount_paid > 0 && (
              <>
                <div className="flex justify-between text-sm mt-3">
                  <span className="text-green-700 font-medium">{t('amountPaid', 'Amount Paid')}:</span>
                  <span className="font-semibold text-green-600 text-right">
                    {formatMoney(invoice.amount_paid)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-orange-700 font-medium">{t('balanceDue', 'Balance Due')}:</span>
                  <span className="font-bold text-orange-600 text-right">
                    {formatMoney(totalAmount - invoice.amount_paid)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Terms & Conditions, Notes, and Bank Account Side by Side */}
        <div className="grid grid-cols-2 gap-3" style={{ marginTop: '32px', marginBottom: '50mm' }}>
          {/* Terms, Notes - Left Column */}
          <div>
            {invoice.payment_terms && (
              <div>
                <h4 className="text-xs font-bold text-slate-900" style={{ marginBottom: '16px' }}>
                  {t('paymentTerms', 'Payment Terms')}
                </h4>
                <div className="bg-slate-50 rounded border border-slate-200 text-xs text-slate-700 terms-content leading-tight" style={{ padding: '12px' }}>
                  {invoice.payment_terms}
                </div>
              </div>
            )}
            {invoice.notes && (
              <div className={invoice.payment_terms ? 'mt-1.5' : ''}>
                <h4 className="text-xs font-bold text-slate-900" style={{ marginBottom: '16px' }}>Notes</h4>
                <div className="bg-yellow-50 rounded border border-yellow-200 text-xs text-slate-700 terms-content leading-tight" style={{ padding: '12px' }}>
                  {invoice.notes}
                </div>
              </div>
            )}
            {invoice.internal_notes && (
              <div className="mt-3 hide-in-pdf">
                <h4 className="text-sm font-bold text-slate-900 mb-2">
                  Internal Notes <span className="text-xs text-orange-600 font-normal">(Not on PDF)</span>
                </h4>
                <div className="bg-orange-50 rounded p-3 border border-orange-200 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {invoice.internal_notes}
                </div>
              </div>
            )}
          </div>

          {/* Bank Account Details - Right Column */}
          {(invoice.bank_accounts || companySettings?.banking_info) && (
            <div className="mt-0">
              <h4 className="text-xs font-bold text-slate-900" style={{ marginBottom: '16px' }}>
                Bank Account / تفاصيل البنك
              </h4>
              <div className="bg-slate-50 rounded border border-slate-200" style={{ padding: '12px' }}>
                <div className="space-y-1 text-xs">
                  {(invoice.bank_accounts?.account_name || companySettings?.banking_info?.account_name) && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Account Name:</span>
                      <span className="text-slate-900 flex-1">{invoice.bank_accounts?.account_name || companySettings?.banking_info?.account_name}</span>
                    </div>
                  )}
                  {(invoice.bank_accounts?.account_number || companySettings?.banking_info?.account_number) && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Account No:</span>
                      <span className="text-slate-900 font-mono flex-1">{invoice.bank_accounts?.account_number || companySettings?.banking_info?.account_number}</span>
                    </div>
                  )}
                  {(invoice.bank_accounts?.bank_name || companySettings?.banking_info?.bank_name) && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Bank Name:</span>
                      <span className="text-slate-900 flex-1">{invoice.bank_accounts?.bank_name || companySettings?.banking_info?.bank_name}</span>
                    </div>
                  )}
                  {(invoice.bank_accounts?.iban || companySettings?.banking_info?.iban) && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">IBAN:</span>
                      <span className="text-slate-900 font-mono flex-1 break-words">{cleanBankFieldValue(invoice.bank_accounts?.iban || companySettings?.banking_info?.iban)}</span>
                    </div>
                  )}
                  {invoice.bank_accounts?.swift_code && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">SWIFT Code:</span>
                      <span className="text-slate-900 font-mono flex-1">{invoice.bank_accounts.swift_code}</span>
                    </div>
                  )}
                  {invoice.bank_accounts?.branch_code && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Branch Code:</span>
                      <span className="text-slate-900 font-mono flex-1">{invoice.bank_accounts.branch_code}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Section - Fixed at Bottom */}
        {(companySettings?.branding?.qr_code_invoice_url || companySettings?.branding?.brand_tagline || companySettings?.online_presence?.website) && (
          <>
            <hr className="qr-divider" />
            <div className="footer-qr">
              {companySettings?.branding?.qr_code_invoice_url && (
                <>
                  <img
                    src={companySettings.branding.qr_code_invoice_url}
                    alt="Invoice QR Code"
                    className="w-16 h-16 object-contain"
                    crossOrigin="anonymous"
                  />
                  {(companySettings.branding.qr_code_invoice_caption || 'Scan to pay this invoice') && (
                    <p className="text-xs text-slate-600 max-w-[180px]">
                      {companySettings.branding.qr_code_invoice_caption || 'Scan to pay this invoice'}
                    </p>
                  )}
                </>
              )}
            </div>
            {(companySettings?.branding?.brand_tagline || companySettings?.online_presence?.website) && (
              <div className="footer-right">
                {companySettings?.branding?.brand_tagline && (
                  <p className="text-sm font-semibold text-blue-600 mb-0.5">
                    {companySettings.branding.brand_tagline}
                  </p>
                )}
                {companySettings?.online_presence?.website && (
                  <p className="text-xs text-slate-600">
                    {companySettings.online_presence.website}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
