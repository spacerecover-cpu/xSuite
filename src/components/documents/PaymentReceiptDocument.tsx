import React from 'react';
import { CheckCircle, Receipt } from 'lucide-react';
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
type LoosePaymentData = Record<string, any>;

interface PaymentReceiptDocumentProps {
  payment: LoosePaymentData;
  companySettings: CompanySettings | null;
  currencyFormat: CurrencyFormat;
  t: (key: string, fallback: string) => string;
  elementId?: string;
}

export const PaymentReceiptDocument: React.FC<PaymentReceiptDocumentProps> = ({
  payment,
  companySettings,
  currencyFormat,
  t: _t,
  elementId = 'receipt-print-frame',
}) => {
  if (!payment) return null;

  const formatCurrency = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined) return `${currencyFormat.currencySymbol}0.00`;
    return `${currencyFormat.currencySymbol}${amount.toFixed(currencyFormat.decimalPlaces)}`;
  };

  const customerName = payment.customer?.customer_name || payment.customers?.customer_name || payment.customer_associated_company?.company_name || payment.companies?.company_name || 'N/A';
  const customerEmail = payment.customer?.email || payment.customers?.email || '';
  const customerPhone = payment.customer?.mobile_number || payment.customers?.mobile_number || '';
  const customerAddress = payment.customer?.address_line1 || '';
  const customerCity = payment.customer?.city || '';

  const companyName = companySettings?.basic_info?.company_name || 'Company Name';
  const companyLogo = companySettings?.branding?.logo_url;
  const companyTagline = companySettings?.branding?.brand_tagline;

  const addressParts = [
    companySettings?.location?.building_name,
    companySettings?.location?.unit_number,
    companySettings?.location?.address_line1,
    companySettings?.location?.address_line2,
  ].filter(Boolean);

  const cityParts = [
    companySettings?.location?.city,
    companySettings?.location?.state,
    companySettings?.location?.postal_code,
  ].filter(Boolean);

  const companyAddress = addressParts.join(', ');
  const companyCityLine = cityParts.join(', ');
  const companyCountry = companySettings?.location?.country || '';
  const companyPhone = companySettings?.contact_info?.phone_primary || '';
  const companyEmail = companySettings?.contact_info?.email_general || '';
  const companyWebsite = companySettings?.online_presence?.website || '';

  const bankName = cleanBankFieldValue(companySettings?.banking_info?.bank_name);
  const bankAccountName = cleanBankFieldValue(companySettings?.banking_info?.account_name);
  const bankAccountNumber = cleanBankFieldValue(companySettings?.banking_info?.account_number);
  const bankIBAN = cleanBankFieldValue(companySettings?.banking_info?.iban);

  const qrCodeUrl = companySettings?.branding?.qr_code_invoice_url;
  const qrCodeCaption = companySettings?.branding?.qr_code_invoice_caption;

  return (
    <div id={elementId} className="receipt-printable-content">
      <div className="receipt-header" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            {companyLogo && (
              <img
                src={companyLogo}
                alt={companyName}
                style={{
                  maxWidth: '140px',
                  maxHeight: '70px',
                  objectFit: 'contain',
                  marginBottom: '8px',
                }}
              />
            )}
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#1e293b' }}>
              {companyName}
            </h1>
            {companyTagline && (
              <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 8px 0' }}>
                {companyTagline}
              </p>
            )}
            {companyAddress && <p style={{ fontSize: '11px', margin: '2px 0', color: '#475569' }}>{companyAddress}</p>}
            {companyCityLine && <p style={{ fontSize: '11px', margin: '2px 0', color: '#475569' }}>{companyCityLine}</p>}
            {companyCountry && <p style={{ fontSize: '11px', margin: '2px 0', color: '#475569' }}>{companyCountry}</p>}
            {companyPhone && <p style={{ fontSize: '11px', margin: '2px 0', color: '#475569' }}>Tel: {companyPhone}</p>}
            {companyEmail && <p style={{ fontSize: '11px', margin: '2px 0', color: '#475569' }}>Email: {companyEmail}</p>}
            {companyWebsite && <p style={{ fontSize: '11px', margin: '2px 0', color: '#475569' }}>Web: {companyWebsite}</p>}
          </div>

          <div style={{ textAlign: 'right', minWidth: '180px' }}>
            <div style={{
              backgroundColor: '#10b981',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginBottom: '4px' }}>
                <Receipt style={{ width: '18px', height: '18px' }} />
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>
                  PAYMENT RECEIPT
                </h2>
              </div>
              <p style={{ fontSize: '12px', margin: 0, opacity: 0.9 }}>
                Official Receipt
              </p>
            </div>

            {companySettings?.basic_info?.registration_number && (
              <p style={{ fontSize: '10px', margin: '3px 0', color: '#64748b' }}>
                Reg: {companySettings.basic_info.registration_number}
              </p>
            )}
            {companySettings?.basic_info?.vat_number && (
              <p style={{ fontSize: '10px', margin: '3px 0', color: '#64748b' }}>
                VAT: {companySettings.basic_info.vat_number}
              </p>
            )}
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginBottom: '20px',
        padding: '16px',
        backgroundColor: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
      }}>
        <div>
          <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 6px 0', textTransform: 'uppercase', fontWeight: 600 }}>
            Receipt Details
          </p>
          <div style={{ fontSize: '11px', lineHeight: '1.6' }}>
            <p style={{ margin: '3px 0' }}>
              <strong style={{ color: '#475569' }}>Receipt #:</strong>{' '}
              <span style={{ color: '#1e293b', fontWeight: 600 }}>{payment.payment_number}</span>
            </p>
            <p style={{ margin: '3px 0' }}>
              <strong style={{ color: '#475569' }}>Date:</strong>{' '}
              <span style={{ color: '#1e293b' }}>{formatDate(payment.payment_date)}</span>
            </p>
            {payment.reference_number && (
              <p style={{ margin: '3px 0' }}>
                <strong style={{ color: '#475569' }}>Reference:</strong>{' '}
                <span style={{ color: '#1e293b' }}>{payment.reference_number}</span>
              </p>
            )}
            <p style={{ margin: '3px 0' }}>
              <strong style={{ color: '#475569' }}>Status:</strong>{' '}
              <span style={{
                color: '#10b981',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: '10px'
              }}>
                {payment.status}
              </span>
            </p>
          </div>
        </div>

        <div>
          <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 6px 0', textTransform: 'uppercase', fontWeight: 600 }}>
            Received From
          </p>
          <div style={{ fontSize: '11px', lineHeight: '1.6' }}>
            <p style={{ margin: '3px 0', fontWeight: 600, color: '#1e293b' }}>{customerName}</p>
            {customerEmail && <p style={{ margin: '3px 0', color: '#475569' }}>{customerEmail}</p>}
            {customerPhone && <p style={{ margin: '3px 0', color: '#475569' }}>{customerPhone}</p>}
            {customerAddress && <p style={{ margin: '3px 0', color: '#475569' }}>{customerAddress}</p>}
            {customerCity && <p style={{ margin: '3px 0', color: '#475569' }}>{customerCity}</p>}
          </div>
        </div>
      </div>

      {payment.case && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#eff6ff',
          borderRadius: '6px',
          border: '1px solid #bfdbfe',
          marginBottom: '20px',
        }}>
          <p style={{ fontSize: '10px', color: '#1e40af', margin: '0 0 4px 0', fontWeight: 600 }}>
            CASE INFORMATION
          </p>
          <p style={{ fontSize: '11px', margin: 0, color: '#1e293b' }}>
            <strong>Case #:</strong> {payment.case.case_no} - {payment.case.title}
          </p>
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h3 style={{
          fontSize: '12px',
          fontWeight: 600,
          margin: '0 0 12px 0',
          color: '#1e293b',
          textTransform: 'uppercase',
          borderBottom: '2px solid #10b981',
          paddingBottom: '6px',
        }}>
          Payment Information
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 600 }}>Payment Method</td>
              <td style={{ padding: '10px 12px', color: '#1e293b', textAlign: 'right' }}>
                {payment.payment_method?.name || 'N/A'}
              </td>
            </tr>
            {payment.bank_account && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 600 }}>Bank Account</td>
                <td style={{ padding: '10px 12px', color: '#1e293b', textAlign: 'right' }}>
                  {payment.bank_account.account_name}
                </td>
              </tr>
            )}
            <tr style={{ backgroundColor: '#f8fafc' }}>
              <td style={{ padding: '12px', color: '#1e293b', fontWeight: 700, fontSize: '12px' }}>
                Amount Received
              </td>
              <td style={{
                padding: '12px',
                color: '#10b981',
                fontWeight: 'bold',
                textAlign: 'right',
                fontSize: '16px'
              }}>
                {formatCurrency(payment.amount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {payment.allocations && payment.allocations.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{
            fontSize: '12px',
            fontWeight: 600,
            margin: '0 0 12px 0',
            color: '#1e293b',
            textTransform: 'uppercase',
            borderBottom: '2px solid #10b981',
            paddingBottom: '6px',
          }}>
            Applied To Invoices
          </h3>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>
                  Invoice Number
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>
                  Amount Applied
                </th>
              </tr>
            </thead>
            <tbody>
              {payment.allocations.map((allocation: LoosePaymentData, index: number) => (
                <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', color: '#1e293b' }}>
                    {allocation.invoice?.invoice_number || 'N/A'}
                    {allocation.invoice?.case && (
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                        {allocation.invoice.case.case_no} - {allocation.invoice.case.title}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                    {formatCurrency(allocation.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                <td style={{ padding: '12px', fontWeight: 700, color: '#1e293b' }}>
                  Total Applied
                </td>
                <td style={{
                  padding: '12px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  color: '#10b981',
                  fontSize: '12px'
                }}>
                  {formatCurrency(
                    // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency (allocations of one payment)
                    payment.allocations.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.amount as number) || 0), 0)
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {payment.notes && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fef3c7',
          borderRadius: '6px',
          border: '1px solid #fde047',
          marginBottom: '20px',
        }}>
          <p style={{ fontSize: '10px', color: '#92400e', margin: '0 0 4px 0', fontWeight: 600 }}>
            NOTES
          </p>
          <p style={{ fontSize: '11px', margin: 0, color: '#451a03', whiteSpace: 'pre-wrap' }}>
            {payment.notes}
          </p>
        </div>
      )}

      <div style={{
        marginTop: '30px',
        paddingTop: '20px',
        borderTop: '2px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '20px'
      }}>
        <div style={{ flex: 1 }}>
          {(bankName || bankAccountName || bankAccountNumber || bankIBAN) && (
            <div style={{ marginBottom: '16px' }}>
              <p style={{
                fontSize: '10px',
                color: '#64748b',
                margin: '0 0 8px 0',
                textTransform: 'uppercase',
                fontWeight: 600
              }}>
                Banking Information
              </p>
              <div style={{ fontSize: '10px', lineHeight: '1.5', color: '#475569' }}>
                {bankName && <p style={{ margin: '2px 0' }}><strong>Bank:</strong> {bankName}</p>}
                {bankAccountName && <p style={{ margin: '2px 0' }}><strong>Account Name:</strong> {bankAccountName}</p>}
                {bankAccountNumber && <p style={{ margin: '2px 0' }}><strong>Account #:</strong> {bankAccountNumber}</p>}
                {bankIBAN && <p style={{ margin: '2px 0' }}><strong>IBAN:</strong> {bankIBAN}</p>}
              </div>
            </div>
          )}

          <div style={{
            backgroundColor: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '6px',
            padding: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <CheckCircle style={{ width: '16px', height: '16px', color: '#16a34a', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, margin: '0 0 2px 0', color: '#166534' }}>
                Payment Received
              </p>
              <p style={{ fontSize: '10px', margin: 0, color: '#15803d' }}>
                Thank you for your payment!
              </p>
            </div>
          </div>
        </div>

        {qrCodeUrl && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={qrCodeUrl}
              alt="Company QR Code"
              style={{
                width: '80px',
                height: '80px',
                objectFit: 'contain',
                marginBottom: '4px',
              }}
            />
            {qrCodeCaption && (
              <p style={{ fontSize: '9px', color: '#64748b', margin: 0 }}>
                {qrCodeCaption}
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{
        marginTop: '20px',
        paddingTop: '12px',
        borderTop: '1px solid #e2e8f0',
        textAlign: 'center'
      }}>
        <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0' }}>
          This is a computer-generated receipt and is valid without signature.
        </p>
        <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0' }}>
          Receipt generated on {formatDate(new Date().toISOString())}
        </p>
        {payment.created_by_profile?.full_name && (
          <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0' }}>
            Processed by: {payment.created_by_profile.full_name}
          </p>
        )}
      </div>
    </div>
  );
};
