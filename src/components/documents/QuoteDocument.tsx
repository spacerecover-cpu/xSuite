/**
 * @deprecated This component is deprecated and should not be used for new features.
 * Use PDFPreviewModal with documentType="quote" instead for consistent PDF viewing experience.
 * This component remains for backward compatibility with existing inline HTML rendering.
 */

import React from 'react';
import { User, Building2, FileText } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { formatDate, cleanBankFieldValue } from '../../lib/format';

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
    qr_code_quote_url?: string;
    qr_code_quote_caption?: string;
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
type LooseQuoteData = Record<string, any>;

interface QuoteDocumentProps {
  quote: LooseQuoteData;
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
    case 'accepted':
      return '#10b981';
    case 'rejected':
      return '#ef4444';
    case 'expired':
      return '#f59e0b';
    default:
      return '#64748b';
  }
};

export const QuoteDocument: React.FC<QuoteDocumentProps> = ({
  quote,
  companySettings,
  currencyFormat,
  t,
  elementId = 'print-frame',
}) => {
  if (!quote) return null;

  const customerAssociatedCompany = quote.customer_associated_company;
  const customerName = quote.customers?.customer_name || quote.customers_enhanced?.customer_name || customerAssociatedCompany?.company_name || quote.companies?.company_name || 'N/A';
  const companyName = customerAssociatedCompany?.company_name || quote.companies?.company_name || null;
  const customerEmail = quote.customers?.email || quote.companies?.email || 'N/A';
  const customerPhone = quote.customers?.mobile_number || quote.companies?.phone_number || 'N/A';

  // Recalculate correct tax amount based on proper billing rules
  // Discount should be applied to subtotal first, then VAT calculated on discounted amount
  const subtotal = quote.subtotal || 0;
  const discountAmount = quote.discount_amount || 0;
  const discountType = quote.discount_type || 'amount';
  const discountValue = discountType === 'percentage' ? (subtotal * discountAmount) / 100 : discountAmount;
  const discountedSubtotal = subtotal - discountValue;
  const taxRate = quote.tax_rate || 0;
  const correctTaxAmount = (discountedSubtotal * taxRate) / 100;
  const correctTotalAmount = discountedSubtotal + correctTaxAmount;

  return (
    <div id={elementId}>
      <div className="quote-printable-content space-y-3">
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
              {(companySettings?.basic_info?.registration_number || companySettings?.basic_info?.vat_number) && (
                <p className="text-slate-600 leading-tight">
                  {companySettings?.basic_info?.registration_number && `Reg No: ${companySettings.basic_info.registration_number}`}
                  {companySettings?.basic_info?.registration_number && companySettings?.basic_info?.vat_number && ' | '}
                  {companySettings?.basic_info?.vat_number && `VAT No: ${companySettings.basic_info.vat_number}`}
                </p>
              )}
              <div className="space-y-0.5">
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
              <div className="space-y-0.5">
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
            {t('quotation', 'QUOTATION')}
          </h2>
          <div className="flex justify-center mt-1 hide-in-pdf">
            <Badge variant="custom" color={getStatusColor(quote.status)}>
              {quote.status}
            </Badge>
          </div>
        </div>

        {/* Customer and Quote Details Side by Side */}
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
              {quote.client_reference && (
                <div className="flex">
                  <span className="font-semibold text-slate-700 w-24 flex-shrink-0">Client Ref:</span>
                  <span className="text-slate-900 flex-1">{quote.client_reference}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quote Details */}
          <div className="border border-blue-200 rounded bg-blue-50 p-2 flex flex-col">
            <div className="section-title">
              <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">{t('quoteDetails', 'Quote Details')}</h3>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex">
                <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Quote No:</span>
                <span className="text-slate-900 font-mono flex-1">{quote.quote_number || 'Draft'}</span>
              </div>
              <div className="flex">
                <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Created Date:</span>
                <span className="text-slate-900 flex-1">{formatDate(quote.created_at)}</span>
              </div>
              {quote.valid_until && (
                <div className="flex">
                  <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Expiry Date:</span>
                  <span className="text-slate-900 flex-1">{formatDate(quote.valid_until)}</span>
                </div>
              )}
              {quote.cases?.case_no && (
                <div className="flex">
                  <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Job ID:</span>
                  <span className="text-slate-900 flex-1">{quote.cases.case_no}</span>
                </div>
              )}
              <div className="flex">
                <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Quote Value:</span>
                <span className="text-slate-900 flex-1">
                  {currencyFormat.currencySymbol}{quote.total_amount?.toFixed(currencyFormat.decimalPlaces) || (0).toFixed(currencyFormat.decimalPlaces)}
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
                <tr className="quote-table">
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
                {(quote.quote_items as Array<{ description: string; quantity: number; unit_price: number }> | undefined)?.map((item, index: number) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 text-xs text-slate-900">
                      {item.description}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-slate-900 text-center font-medium">
                      {item.quantity}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-slate-900 text-right font-medium">
                      {currencyFormat.currencySymbol} {item.unit_price.toFixed(currencyFormat.decimalPlaces)}
                    </td>
                    <td className="px-2 py-1.5 text-xs font-semibold text-slate-900 text-right">
                      {currencyFormat.currencySymbol} {(item.quantity * item.unit_price).toFixed(currencyFormat.decimalPlaces)}
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
                {currencyFormat.currencySymbol} {quote.subtotal?.toFixed(currencyFormat.decimalPlaces) || (0).toFixed(currencyFormat.decimalPlaces)}
              </span>
            </div>
            {quote.discount_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-700 font-medium">
                  {t('discount', 'Discount')} ({quote.discount_type === 'percentage' ? `${quote.discount_amount}%` : t('amount', 'Amount')}):
                </span>
                <span className="font-semibold text-red-600 text-right">
                  - {currencyFormat.currencySymbol} {discountValue.toFixed(currencyFormat.decimalPlaces)}
                </span>
              </div>
            )}
            {quote.discount_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-700 font-medium">{t('netAmount', 'Net Amount')}:</span>
                <span className="font-semibold text-slate-900 text-right">
                  {currencyFormat.currencySymbol} {discountedSubtotal.toFixed(currencyFormat.decimalPlaces)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm" style={{ marginBottom: '12px' }}>
              <span className="text-slate-700 font-medium">
                VAT {quote.tax_rate || 0}% | ضريبة القيمة المضافة:
              </span>
              <span className="font-semibold text-slate-900 text-right">
                {currencyFormat.currencySymbol} {correctTaxAmount.toFixed(currencyFormat.decimalPlaces)}
              </span>
            </div>
            <div className="total-row-band">
              <div className="total-row-band-inner">
                <span className="total-label">{t('total', 'Total')} | الإجمالي:</span>
                <span className="total-amount">
                  {currencyFormat.currencySymbol} {correctTotalAmount.toFixed(currencyFormat.decimalPlaces)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Terms & Conditions and Bank Account Side by Side */}
        <div className="grid grid-cols-2 gap-3" style={{ marginTop: '32px', marginBottom: '50mm' }}>
          {/* Terms and Conditions */}
          <div>
            {quote.terms_and_conditions && (
              <div>
                <h4 className="text-xs font-bold text-slate-900" style={{ marginBottom: '16px' }}>
                  {t('termsAndConditions', 'Terms & Conditions')}
                </h4>
                <div className="bg-slate-50 rounded border border-slate-200 text-xs text-slate-700 terms-content leading-tight" style={{ padding: '12px' }}>
                  {quote.terms_and_conditions}
                </div>
              </div>
            )}
            {quote.notes && (
              <div className="mt-1.5">
                <h4 className="text-xs font-bold text-slate-900" style={{ marginBottom: '16px' }}>Notes</h4>
                <div className="bg-yellow-50 rounded border border-yellow-200 text-xs text-slate-700 terms-content leading-tight" style={{ padding: '12px' }}>
                  {quote.notes}
                </div>
              </div>
            )}
          </div>

          {/* Bank Account Details */}
          {(quote.bank_accounts || companySettings?.banking_info) && (
            <div className="mt-0">
              <h4 className="text-xs font-bold text-slate-900" style={{ marginBottom: '16px' }}>
                Bank Account / تفاصيل البنك
              </h4>
              <div className="bg-slate-50 rounded border border-slate-200" style={{ padding: '12px' }}>
                <div className="space-y-1 text-xs">
                  {(quote.bank_accounts?.account_name || companySettings?.banking_info?.account_name) && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Account Name:</span>
                      <span className="text-slate-900 flex-1">{quote.bank_accounts?.account_name || companySettings?.banking_info?.account_name}</span>
                    </div>
                  )}
                  {(quote.bank_accounts?.account_number || companySettings?.banking_info?.account_number) && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Account No:</span>
                      <span className="text-slate-900 font-mono flex-1">{quote.bank_accounts?.account_number || companySettings?.banking_info?.account_number}</span>
                    </div>
                  )}
                  {(quote.bank_accounts?.bank_name || companySettings?.banking_info?.bank_name) && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Bank Name:</span>
                      <span className="text-slate-900 flex-1">{quote.bank_accounts?.bank_name || companySettings?.banking_info?.bank_name}</span>
                    </div>
                  )}
                  {(quote.bank_accounts?.iban || companySettings?.banking_info?.iban) && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">IBAN:</span>
                      <span className="text-slate-900 font-mono flex-1 break-words">{cleanBankFieldValue(quote.bank_accounts?.iban || companySettings?.banking_info?.iban)}</span>
                    </div>
                  )}
                  {quote.bank_accounts?.swift_code && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">SWIFT Code:</span>
                      <span className="text-slate-900 font-mono flex-1">{quote.bank_accounts.swift_code}</span>
                    </div>
                  )}
                  {quote.bank_accounts?.branch_code && (
                    <div className="flex">
                      <span className="font-semibold text-slate-700 w-28 flex-shrink-0">Branch Code:</span>
                      <span className="text-slate-900 font-mono flex-1">{quote.bank_accounts.branch_code}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Section - Fixed at Bottom */}
        {(companySettings?.branding?.qr_code_quote_url || companySettings?.branding?.brand_tagline || companySettings?.online_presence?.website) && (
          <>
            <hr className="qr-divider" />
            <div className="footer-qr">
              {companySettings?.branding?.qr_code_quote_url && (
                <>
                  <img
                    src={companySettings.branding.qr_code_quote_url}
                    alt="Quote QR Code"
                    className="w-16 h-16 object-contain"
                    crossOrigin="anonymous"
                  />
                  {(companySettings.branding.qr_code_quote_caption || 'Scan to approve this quote') && (
                    <p className="text-xs text-slate-600 max-w-[180px]">
                      {companySettings.branding.qr_code_quote_caption || 'Scan to approve this quote'}
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
