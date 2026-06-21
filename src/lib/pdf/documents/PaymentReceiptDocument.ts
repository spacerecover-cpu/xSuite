import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { PaymentReceiptData, PaymentReceiptDocumentData, TranslationContext } from '../types';
import {
  PDF_COLORS,
  getStylesWithFont,
  createBilingualInfoBox,
  createBilingualSectionHeader,
} from '../styles';
import { formatDate, buildCompanyAddress, safeString } from '../utils';
import { getGeneralIconSvg } from '../../deviceIconMapper';
import { buildLogoNode } from '../brandingImage';

export function buildPaymentReceiptDocument(
  data: PaymentReceiptDocumentData,
  ctx: TranslationContext,
  logoBase64?: string | null,
  qrCodeBase64?: string | null,
  qrCodeCaption?: string | null
): TDocumentDefinitions {
  const { paymentData, companySettings } = data;
  const { t, isBilingual, fontFamily } = ctx;

  const finalQrCodeCaption = qrCodeCaption || 'Scan to verify this receipt';

  const companyName = companySettings.basic_info?.company_name || 'Company Name';
  const legalName = companySettings.basic_info?.legal_name || companyName;
  const companyAddress = buildCompanyAddress(companySettings.location);

  const contactLines: string[] = [];
  if (companySettings.contact_info?.phone_primary) {
    contactLines.push(`Tel: ${companySettings.contact_info.phone_primary}`);
  }
  if (companySettings.contact_info?.email_general) {
    contactLines.push(`Email: ${companySettings.contact_info.email_general}`);
  }

  const headerContent: Content[] = [];

  const paymentReceiptLogoNode = buildLogoNode(logoBase64, { width: 130, margin: [0, 0, 0, 5] });
  if (paymentReceiptLogoNode) {
    headerContent.push({
      columns: [
        paymentReceiptLogoNode,
        {
          stack: [
            { text: legalName, fontSize: 14, bold: true, color: PDF_COLORS.text, alignment: 'right' },
            { text: companyAddress, fontSize: 8, color: PDF_COLORS.textLight, alignment: 'right', margin: [0, 2, 0, 0], lineHeight: 1.1 },
            ...contactLines.map((line) => ({
              text: line,
              fontSize: 8,
              color: PDF_COLORS.textLight,
              alignment: 'right' as const,
              margin: [0, 0, 0, 0] as [number, number, number, number],
              lineHeight: 1.1,
            })),
          ],
          width: '*',
        },
      ],
      margin: [0, 0, 0, 12],
    });
  } else {
    headerContent.push({
      stack: [
        { text: legalName, fontSize: 14, bold: true, color: PDF_COLORS.text, alignment: 'center' },
        { text: companyAddress, fontSize: 8, color: PDF_COLORS.textLight, alignment: 'center', margin: [0, 2, 0, 0], lineHeight: 1.1 },
        ...contactLines.map((line) => ({
          text: line,
          fontSize: 8,
          color: PDF_COLORS.textLight,
          alignment: 'center' as const,
          margin: [0, 0, 0, 0] as [number, number, number, number],
          lineHeight: 1.1,
        })),
      ],
      margin: [0, 0, 0, 12],
    });
  }

  headerContent.push({
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 525,
        y2: 0,
        lineWidth: 0.5,
        lineColor: PDF_COLORS.error,
      },
    ],
    margin: [0, 0, 0, 12],
  });

  const documentTitle = 'PAYMENT RECEIPT';
  const arabicTitle = 'إيصال الدفع';

  if (isBilingual) {
    headerContent.push({
      text: `${documentTitle} | ${arabicTitle}`,
      fontSize: 16,
      bold: true,
      color: PDF_COLORS.primaryDark,
      alignment: 'center',
      margin: [0, 0, 0, 6],
    });
  } else {
    headerContent.push({
      text: documentTitle,
      fontSize: 16,
      bold: true,
      color: PDF_COLORS.primaryDark,
      alignment: 'center',
      margin: [0, 0, 0, 6],
    });
  }

  const fileIconSvg = getGeneralIconSvg('fileText');
  const userIconSvg = getGeneralIconSvg('user');

  const customerName = paymentData.customer?.customer_name || 'N/A';
  const companyNameDisplay = paymentData.company?.company_name;
  const customerPhone = paymentData.customer?.mobile_number || paymentData.customer?.phone_number || 'N/A';
  const customerEmail = paymentData.customer?.email || 'N/A';

  const labelWidth = isBilingual ? 150 : 90;

  const customerDetailsContent: object[] = [
    createInfoRow(t('nameLabel', 'Name:'), customerName, labelWidth),
    createInfoRow(t('companyLabel', 'Company:'), companyNameDisplay, labelWidth),
    createInfoRow(t('phoneLabel', 'Phone:'), customerPhone, labelWidth),
    createInfoRow(t('emailLabel', 'Email:'), customerEmail, labelWidth),
  ];

  const paymentDetailsContent: object[] = [
    createInfoRow(t('receiptNoLabel', 'Receipt No:'), paymentData.receipt_number || 'Draft', labelWidth),
    createInfoRow(t('paymentDateLabel', 'Payment Date:'), formatDate(paymentData.payment_date, 'dd MMM yyyy'), labelWidth),
    createInfoRow(t('methodLabel', 'Method:'), safeString(paymentData.payment_method), labelWidth),
    createInfoRow(t('referenceLabel', 'Reference:'), paymentData.reference_number, labelWidth),
    ...(paymentData.invoice?.invoice_number ? [createInfoRow(t('invoiceNoLabel', 'Invoice No:'), paymentData.invoice.invoice_number, labelWidth)] : []),
    ...(paymentData.cases?.case_no ? [createInfoRow(t('jobIdLabel', 'Job ID:'), paymentData.cases.case_no, labelWidth)] : []),
  ];

  const customerInfoTitle = isBilingual
    ? `Customer Information | ${t('customerInformation', '').split(' | ')[1] || 'معلومات العميل'}`
    : 'Customer Information';
  const paymentDetailsTitle = isBilingual
    ? `Payment Details | ${t('paymentDetails', '').split(' | ')[1] || 'تفاصيل الدفع'}`
    : 'Payment Details';

  const infoBoxesSection: Content = {
    columns: [
      {
        width: '50%',
        stack: [createBilingualInfoBox(customerInfoTitle, null, customerDetailsContent, userIconSvg)],
      },
      { width: 8, text: '' },
      {
        width: '50%',
        stack: [createBilingualInfoBox(paymentDetailsTitle, null, paymentDetailsContent, fileIconSvg)],
      },
    ],
    margin: [0, 0, 0, 8],
  } as Content;

  const currencySymbol = paymentData.accounting_locales?.currency_symbol || 'USD';
  const decimalPlaces = paymentData.accounting_locales?.decimal_places || 2;
  const currencyPosition = paymentData.accounting_locales?.currency_position || 'after';

  const formatCurrencyValue = (amount: number): string => {
    const formatted = amount.toFixed(decimalPlaces);
    return currencyPosition === 'before' ? `${currencySymbol} ${formatted}` : `${formatted} ${currencySymbol}`;
  };

  const amountPaidLabel = isBilingual ? 'Amount Paid | المبلغ المدفوع' : 'Amount Paid';
  const paidStatusLabel = isBilingual ? 'PAID | مدفوع' : 'PAID';

  const amountSection: Content = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              {
                text: paidStatusLabel,
                fontSize: 14,
                bold: true,
                color: PDF_COLORS.success,
                alignment: 'center',
                margin: [0, 0, 0, 4],
              },
              {
                text: formatCurrencyValue(paymentData.amount),
                fontSize: 22,
                bold: true,
                color: PDF_COLORS.text,
                alignment: 'center',
                margin: [0, 0, 0, 4],
              },
              {
                text: amountPaidLabel,
                fontSize: 9,
                color: PDF_COLORS.textLight,
                alignment: 'center',
                margin: [0, 0, 0, 0],
              },
            ],
            fillColor: PDF_COLORS.background,
            margin: [0, 12, 0, 12],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => PDF_COLORS.success,
      vLineColor: () => PDF_COLORS.success,
    },
    margin: [0, 8, 0, 8],
  };

  const invoiceDetailsSection: Content[] = [];

  if (paymentData.invoice) {
    const invoiceTitle = isBilingual
      ? `Related Invoice | ${t('relatedInvoice', '').split(' | ')[1] || 'الفاتورة المرتبطة'}`
      : 'Related Invoice';

    const invoiceSectionHeader: Content = createBilingualSectionHeader(invoiceTitle, null) as Content;

    const invoiceTableBody: TableCell[][] = [
      [
        { text: isBilingual ? t('invoiceNo', 'Invoice No') : 'Invoice No', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'left' },
        { text: isBilingual ? t('type', 'Type') : 'Type', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'center' },
        { text: isBilingual ? t('invoiceTotal', 'Invoice Total') : 'Invoice Total', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'right' },
        { text: isBilingual ? t('amountPaid', 'Amount Paid') : 'Amount Paid', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'right' },
      ],
      [
        { text: safeString(paymentData.invoice.invoice_number), style: 'tableCell' },
        { text: safeString(paymentData.invoice.invoice_type), style: 'tableCellCenter' },
        { text: formatCurrencyValue(paymentData.invoice.total_amount), style: 'tableCellRight' },
        { text: formatCurrencyValue(paymentData.amount), style: 'tableCellRight', bold: true },
      ],
    ];

    invoiceDetailsSection.push({
      stack: [
        invoiceSectionHeader,
        {
          table: {
            headerRows: 1,
            widths: [140, 100, 130, 130],
            body: invoiceTableBody,
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => PDF_COLORS.border,
            vLineColor: () => PDF_COLORS.border,
          },
          margin: [0, 0, 0, 8],
        },
      ],
    });
  }

  const termsAndBankSection: Content[] = [];

  const notesSectionLabel = isBilingual ? t('notes', 'Notes') : 'Notes';
  const bankAccountSectionLabel = isBilingual ? `${t('bankAccount', 'Bank Account')} | تفاصيل البنك` : 'Bank Account';
  const accountNameRowLabel = t('accountNameLabel', 'Account Name:');
  const accountNoRowLabel = t('accountNoLabel', 'Account No:');
  const bankRowLabel = t('bankLabel', 'Bank:');
  const ibanRowLabel = t('ibanLabel', 'IBAN:');
  const swiftRowLabel = t('swiftLabel', 'SWIFT:');

  if (paymentData.notes || paymentData.bank_accounts) {
    const notesStack: object[] = [];

    if (paymentData.notes) {
      notesStack.push(
        { text: notesSectionLabel, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
        { text: paymentData.notes, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3 }
      );
    }

    const bankAccounts = paymentData.bank_accounts;
    termsAndBankSection.push({
      columns: [
        {
          width: bankAccounts ? '50%' : '100%',
          stack: notesStack,
        },
        ...(bankAccounts ? [
          { width: 8, text: '' },
          {
            width: '50%',
            stack: [
              { text: bankAccountSectionLabel, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
              {
                table: {
                  widths: ['*'],
                  body: [
                    [
                      {
                        stack: [
                          ...(bankAccounts.account_name ? [{ text: `${accountNameRowLabel} ${bankAccounts.account_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(bankAccounts.account_number ? [{ text: `${accountNoRowLabel} ${bankAccounts.account_number}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(bankAccounts.bank_name ? [{ text: `${bankRowLabel} ${bankAccounts.bank_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(bankAccounts.iban ? [{ text: `${ibanRowLabel} ${bankAccounts.iban}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(bankAccounts.swift_code ? [{ text: `${swiftRowLabel} ${bankAccounts.swift_code}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ],
                        fillColor: PDF_COLORS.background,
                        margin: [6, 4, 6, 4],
                      },
                    ],
                  ],
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => PDF_COLORS.border,
                  vLineColor: () => PDF_COLORS.border,
                },
              },
            ],
          },
        ] : []),
      ],
      margin: [0, 8, 0, 0],
    } as Content);
  } else if (paymentData.bank_accounts) {
    // The prior `if (notes || bank_accounts)` narrows bank_accounts to never in this branch.
    // Cast back to the source-of-truth type so property access works.
    const bankAccounts = paymentData.bank_accounts as NonNullable<PaymentReceiptData['bank_accounts']>;
    termsAndBankSection.push({
      columns: [
        { width: '50%', text: '' },
        { width: 8, text: '' },
        {
          width: '50%',
          stack: [
            { text: bankAccountSectionLabel, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
            {
              table: {
                widths: ['*'],
                body: [
                  [
                    {
                      stack: [
                        ...(bankAccounts.account_name ? [{ text: `${accountNameRowLabel} ${bankAccounts.account_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(bankAccounts.account_number ? [{ text: `${accountNoRowLabel} ${bankAccounts.account_number}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(bankAccounts.bank_name ? [{ text: `${bankRowLabel} ${bankAccounts.bank_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(bankAccounts.iban ? [{ text: `${ibanRowLabel} ${bankAccounts.iban}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(bankAccounts.swift_code ? [{ text: `${swiftRowLabel} ${bankAccounts.swift_code}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                      ],
                      fillColor: PDF_COLORS.background,
                      margin: [6, 4, 6, 4],
                    },
                  ],
                ],
              },
              layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => PDF_COLORS.border,
                vLineColor: () => PDF_COLORS.border,
              },
            },
          ],
        },
      ],
      margin: [0, 8, 0, 0],
    } as Content);
  }

  if (paymentData.created_by_profile?.full_name) {
    termsAndBankSection.push({
      text: `${t('receivedByLabel', 'Received by:')} ${paymentData.created_by_profile.full_name}`,
      fontSize: 8,
      color: PDF_COLORS.textLight,
      alignment: 'left',
      margin: [0, 12, 0, 0],
    });
  }

  const tagline = companySettings.branding?.brand_tagline || null;

  return {
    pageSize: 'A4',
    pageMargins: [35, 30, 35, 95],
    defaultStyle: {
      font: fontFamily,
    },
    styles: getStylesWithFont(fontFamily),
    content: [
      ...headerContent,
      infoBoxesSection,
      amountSection,
      ...invoiceDetailsSection,
      ...termsAndBankSection,
    ],
    footer: (_currentPage: number, _pageCount: number) => {
      if (qrCodeBase64) {
        const footerStack: any[] = [];

        if (tagline) {
          footerStack.push({
            text: tagline,
            fontSize: 10,
            bold: true,
            color: PDF_COLORS.primary,
            alignment: 'right',
            margin: [0, 5, 0, 1],
          });
        }

        if (companySettings.online_presence?.website) {
          footerStack.push({
            text: companySettings.online_presence.website,
            fontSize: 8,
            color: PDF_COLORS.textLight,
            alignment: 'right',
            margin: [0, 0, 0, 0],
          });
        }

        return {
          stack: [
            {
              canvas: [
                {
                  type: 'line',
                  x1: 0,
                  y1: 0,
                  x2: 525,
                  y2: 0,
                  lineWidth: 0.5,
                  lineColor: PDF_COLORS.error,
                },
              ],
              margin: [0, 0, 0, 10],
            },
            {
              columns: [
                {
                  stack: [
                    {
                      image: qrCodeBase64,
                      width: 60,
                      height: 60,
                      alignment: 'left',
                      margin: [0, 0, 0, 2],
                    },
                    {
                      text: finalQrCodeCaption,
                      fontSize: 8,
                      color: PDF_COLORS.text,
                      bold: false,
                      alignment: 'left',
                      margin: [0, 0, 0, 0],
                    },
                  ],
                  width: 'auto',
                  margin: [0, 0, 0, 0],
                },
                { text: '', width: '*' },
                {
                  stack: footerStack,
                  width: 'auto',
                  margin: [0, 0, 0, 0],
                },
              ],
            },
          ],
          margin: [35, 0, 35, 25],
        };
      } else {
        const footerLines: any[] = [];
        if (tagline) {
          footerLines.push({
            text: tagline,
            fontSize: 10,
            bold: true,
            color: PDF_COLORS.primary,
            alignment: 'center',
          });
        }
        if (companySettings.online_presence?.website) {
          footerLines.push({
            text: companySettings.online_presence.website,
            fontSize: 8,
            color: PDF_COLORS.textLight,
            alignment: 'center',
            margin: [0, 2, 0, 0],
          });
        }

        return {
          stack: [
            {
              canvas: [
                {
                  type: 'line',
                  x1: 0,
                  y1: 0,
                  x2: 525,
                  y2: 0,
                  lineWidth: 0.5,
                  lineColor: PDF_COLORS.error,
                },
              ],
              margin: [0, 0, 0, 10],
            },
            {
              stack: footerLines,
            },
          ],
          margin: [35, 10, 35, 25],
        };
      }
    },
  };
}

function createInfoRow(label: string, value: string | undefined | null, labelWidth: number = 90): object {
  return {
    columns: [
      { text: label, fontSize: 8, color: PDF_COLORS.textLight, width: labelWidth },
      { text: safeString(value), fontSize: 9, color: PDF_COLORS.text, width: '*' },
    ],
    margin: [0, 0, 0, 2],
  };
}
