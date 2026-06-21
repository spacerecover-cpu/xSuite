import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { InvoiceDocumentData, TranslationContext } from '../types';
import {
  PDF_COLORS,
  getStylesWithFont,
  createBilingualInfoBox,
  createBilingualSectionHeader,
} from '../styles';
import { formatDate, buildCompanyAddress, safeString } from '../utils';
import { getGeneralIconSvg } from '../../deviceIconMapper';
import { buildLogoNode } from '../brandingImage';

export function buildInvoiceDocument(
  data: InvoiceDocumentData,
  ctx: TranslationContext,
  logoBase64?: string | null,
  qrCodeBase64?: string | null,
  qrCodeCaption?: string | null
): TDocumentDefinitions {
  const { invoiceData, companySettings, paymentHistory = [] } = data;
  const { t, isBilingual, fontFamily } = ctx;

  const finalQrCodeCaption = qrCodeCaption || 'Scan to pay this invoice';

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

  const invoiceLogoNode = buildLogoNode(logoBase64, { width: 130, margin: [0, 0, 0, 5] });
  if (invoiceLogoNode) {
    headerContent.push({
      columns: [
        invoiceLogoNode,
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

  const isProforma = invoiceData.invoice_type === 'proforma';
  const documentTitle = isProforma ? 'PROFORMA INVOICE' : 'TAX INVOICE';
  const arabicTitle = isProforma ? 'فاتورة مبدئية' : 'فاتورة ضريبية';

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

  const customerAssociatedCompany = invoiceData.customer_associated_company;
  const customerName = invoiceData.customer?.customer_name || invoiceData.cases?.contact_name || 'N/A';
  const companyNameDisplay = customerAssociatedCompany?.company_name || invoiceData.company?.company_name;
  const customerEmail = invoiceData.customer?.email || invoiceData.cases?.contact_email || invoiceData.company?.email || 'N/A';
  const customerPhone = invoiceData.customer?.mobile_number || invoiceData.customer?.phone_number || invoiceData.cases?.contact_phone || invoiceData.company?.phone_number || 'N/A';

  const labelWidth = isBilingual ? 150 : 90;

  const customerDetailsContent: object[] = [
    createInfoRow(t('nameLabel', 'Name:'), customerName, labelWidth),
    createInfoRow(t('companyLabel', 'Company:'), companyNameDisplay, labelWidth),
    createInfoRow(t('phoneLabel', 'Phone:'), customerPhone, labelWidth),
    createInfoRow(t('emailLabel', 'Email:'), customerEmail, labelWidth),
    createInfoRow(t('referenceLabel', 'Reference:'), invoiceData.client_reference, labelWidth),
  ];

  const invoiceDetailsContent: object[] = [
    createInfoRow(t('invoiceNoLabel', 'Invoice No:'), invoiceData.invoice_number || 'Draft', labelWidth),
    createInfoRow(t('invoiceDateLabel', 'Invoice Date:'), formatDate(invoiceData.invoice_date, 'dd MMM yyyy'), labelWidth),
    createInfoRow(t('dueDateLabel', 'Due Date:'), formatDate(invoiceData.due_date, 'dd MMM yyyy'), labelWidth),
    ...(invoiceData.cases?.case_no ? [createInfoRow(t('jobIdLabel', 'Job ID:'), invoiceData.cases.case_no, labelWidth)] : []),
  ];

  const customerInfoTitle = isBilingual
    ? `Customer Information | ${t('customerInformation', '').split(' | ')[1] || 'معلومات العميل'}`
    : 'Customer Information';
  const invoiceDetailsTitle = isBilingual
    ? `Invoice Details | ${t('invoiceDetails', '').split(' | ')[1] || 'تفاصيل الفاتورة'}`
    : 'Invoice Details';

  const infoBoxesSection: Content = {
    columns: [
      {
        width: '50%',
        stack: [createBilingualInfoBox(customerInfoTitle, null, customerDetailsContent, userIconSvg) as Content],
      },
      { width: 8, text: '' },
      {
        width: '50%',
        stack: [createBilingualInfoBox(invoiceDetailsTitle, null, invoiceDetailsContent, fileIconSvg) as Content],
      },
    ],
    margin: [0, 0, 0, 8],
  };

  const lineItemsTitle = isBilingual
    ? `Line Items | ${t('lineItems', '').split(' | ')[1] || 'البنود'}`
    : 'Line Items';

  const lineItemsHeader: Content = createBilingualSectionHeader(lineItemsTitle, null) as Content;

  const currencySymbol = invoiceData.accounting_locales?.currency_symbol || 'USD';
  const decimalPlaces = invoiceData.accounting_locales?.decimal_places || 2;
  const currencyPosition = invoiceData.accounting_locales?.currency_position || 'after';

  const formatCurrency = (amount: number): string => {
    const formatted = amount.toFixed(decimalPlaces);
    return currencyPosition === 'before' ? `${currencySymbol} ${formatted}` : `${formatted} ${currencySymbol}`;
  };

  const lineItemsTableBody: TableCell[][] = [
    [
      { text: isBilingual ? t('description', 'Description') : 'Description', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'left' },
      { text: isBilingual ? t('qty', 'Qty') : 'Qty', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'center' },
      { text: isBilingual ? t('unitPrice', 'Unit Price') : 'Unit Price', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'right' },
      { text: isBilingual ? t('amount', 'Amount') : 'Amount', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'right' },
    ],
  ];

  (invoiceData.invoice_line_items || []).forEach((item) => {
    lineItemsTableBody.push([
      { text: safeString(item.description), style: 'tableCell' },
      { text: String(item.quantity), style: 'tableCellCenter' },
      { text: formatCurrency(item.unit_price), style: 'tableCellRight' },
      { text: formatCurrency(item.line_total || (item.quantity * item.unit_price)), style: 'tableCellRight', bold: true },
    ]);
  });

  const lineItemsSection: Content = {
    stack: [
      lineItemsHeader,
      {
        table: {
          headerRows: 1,
          widths: [220, 60, 105, 105],
          body: lineItemsTableBody,
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
  };

  const subtotal = invoiceData.subtotal || 0;
  const discountAmount = invoiceData.discount_amount || 0;
  const discountedSubtotal = subtotal - discountAmount;
  const taxRate = invoiceData.tax_rate || 0;
  const taxAmount = (discountedSubtotal * taxRate) / 100;
  const totalAmount = discountedSubtotal + taxAmount;
  const amountPaid = invoiceData.amount_paid || 0;
  const balanceDue = totalAmount - amountPaid;

  const subtotalLabel = isBilingual ? t('subtotalLabel', 'Subtotal:') : 'Subtotal:';
  const discountLabelTxt = isBilingual ? t('discountLabel', 'Discount:') : 'Discount:';
  const vatTranslated = isBilingual ? (t('vat', '').split(' | ')[1] || 'ضريبة القيمة المضافة') : null;
  const vatLabel = isBilingual ? `VAT ${taxRate}% | ${vatTranslated}:` : `VAT ${taxRate}%:`;
  const totalTranslated = isBilingual ? (t('total', '').split(' | ')[1] || 'الإجمالي') : null;
  const totalLabel = isBilingual ? `Total | ${totalTranslated}:` : 'Total:';
  const amountPaidLabel = isBilingual ? t('amountPaidLabel', 'Amount Paid:') : 'Amount Paid:';
  const balanceDueLabel = isBilingual ? t('balanceDueLabel', 'Balance Due:') : 'Balance Due:';

  const financialSummaryRows: object[] = [
    {
      columns: [
        { text: subtotalLabel, fontSize: 9, color: PDF_COLORS.textLight, width: '*', alignment: 'right' },
        { text: formatCurrency(subtotal), fontSize: 9, bold: true, color: PDF_COLORS.text, width: 100, alignment: 'right' },
      ],
      margin: [0, 2, 0, 2],
    },
  ];

  if (discountAmount > 0) {
    financialSummaryRows.push({
      columns: [
        { text: discountLabelTxt, fontSize: 9, color: PDF_COLORS.textLight, width: '*', alignment: 'right' },
        { text: `- ${formatCurrency(discountAmount)}`, fontSize: 9, bold: true, color: PDF_COLORS.error, width: 100, alignment: 'right' },
      ],
      margin: [0, 2, 0, 2],
    });
    const netAmountLabel = isBilingual ? 'Net Amount | صافي المبلغ:' : 'Net Amount:';
    financialSummaryRows.push({
      columns: [
        { text: netAmountLabel, fontSize: 9, color: PDF_COLORS.textLight, width: '*', alignment: 'right' },
        { text: formatCurrency(discountedSubtotal), fontSize: 9, bold: true, color: PDF_COLORS.text, width: 100, alignment: 'right' },
      ],
      margin: [0, 2, 0, 2],
    });
  }

  financialSummaryRows.push({
    columns: [
      { text: vatLabel, fontSize: 9, color: PDF_COLORS.textLight, width: '*', alignment: 'right' },
      { text: formatCurrency(taxAmount), fontSize: 9, bold: true, color: PDF_COLORS.text, width: 100, alignment: 'right' },
    ],
    margin: [0, 2, 0, 2],
  });

  financialSummaryRows.push({
    table: {
      widths: ['*', 100],
      body: [
        [
          { text: totalLabel, fontSize: 10, bold: true, color: PDF_COLORS.text, alignment: 'right', border: [false, false, false, false], margin: [0, 3, 0, 3] },
          { text: formatCurrency(totalAmount), fontSize: 11, bold: true, color: PDF_COLORS.primary, alignment: 'right', border: [false, false, false, false], margin: [0, 3, 0, 3] },
        ],
      ],
    },
    layout: {
      fillColor: () => PDF_COLORS.background,
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
    },
    margin: [0, 4, 0, 0],
  });

  if (!isProforma && amountPaid > 0) {
    financialSummaryRows.push(
      { text: '', margin: [0, 4, 0, 0] },
      {
        columns: [
          { text: amountPaidLabel, fontSize: 9, color: PDF_COLORS.success, width: '*', alignment: 'right' },
          { text: formatCurrency(amountPaid), fontSize: 9, bold: true, color: PDF_COLORS.success, width: 100, alignment: 'right' },
        ],
        margin: [0, 2, 0, 2],
      },
      {
        columns: [
          { text: balanceDueLabel, fontSize: 9, color: PDF_COLORS.warning, width: '*', alignment: 'right' },
          { text: formatCurrency(balanceDue), fontSize: 10, bold: true, color: PDF_COLORS.warning, width: 100, alignment: 'right' },
        ],
        margin: [0, 2, 0, 2],
      }
    );
  }

  const financialSummarySection: Content = {
    stack: financialSummaryRows,
    margin: [280, 8, 0, 8],
  } as Content;

  const paymentHistoryTitle = isBilingual ? t('paymentHistory', 'Payment History') : 'Payment History';
  const paymentHistorySection: Content =
    !isProforma && paymentHistory.length > 0
      ? {
          margin: [0, 10, 0, 0],
          stack: [
            { text: paymentHistoryTitle, fontSize: 10, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 4] },
            {
              table: {
                headerRows: 1,
                widths: ['auto', 'auto', 'auto', '*', 'auto', 'auto', 'auto'],
                body: [
                  [
                    { text: t('phDate', 'Date'), fontSize: 8, bold: true, color: PDF_COLORS.textLight },
                    { text: t('phDocument', 'Document'), fontSize: 8, bold: true, color: PDF_COLORS.textLight },
                    { text: t('phMethod', 'Method'), fontSize: 8, bold: true, color: PDF_COLORS.textLight },
                    { text: t('phReference', 'Reference'), fontSize: 8, bold: true, color: PDF_COLORS.textLight },
                    { text: t('phRecordedBy', 'Recorded By'), fontSize: 8, bold: true, color: PDF_COLORS.textLight },
                    { text: t('phAmount', 'Amount'), fontSize: 8, bold: true, color: PDF_COLORS.textLight, alignment: 'right' },
                    { text: t('phBalance', 'Balance'), fontSize: 8, bold: true, color: PDF_COLORS.textLight, alignment: 'right' },
                  ],
                  ...paymentHistory.map((p): TableCell[] => [
                    { text: p.payment_date ? formatDate(p.payment_date) : '-', fontSize: 8, color: PDF_COLORS.text },
                    { text: p.doc_number || '-', fontSize: 8, color: PDF_COLORS.text },
                    { text: p.method || '-', fontSize: 8, color: PDF_COLORS.text },
                    { text: p.reference || '-', fontSize: 8, color: PDF_COLORS.text },
                    { text: p.recorded_by || '-', fontSize: 8, color: PDF_COLORS.text },
                    { text: formatCurrency(p.amount), fontSize: 8, color: PDF_COLORS.success, alignment: 'right' },
                    {
                      text: p.running_balance !== undefined ? formatCurrency(p.running_balance) : '-',
                      fontSize: 8,
                      bold: true,
                      color: PDF_COLORS.text,
                      alignment: 'right',
                    },
                  ]),
                ],
              },
              layout: {
                fillColor: (rowIndex: number) => (rowIndex === 0 ? PDF_COLORS.background : null),
                hLineWidth: () => 0.5,
                vLineWidth: () => 0,
                hLineColor: () => PDF_COLORS.border,
              },
            },
          ],
        }
      : { text: '' };

  const termsAndBankSection: Content[] = [];

  const paymentTermsLabel = isBilingual ? t('paymentTermsTitle', 'Payment Terms') : 'Payment Terms';
  const notesLabel = isBilingual ? t('notes', 'Notes') : 'Notes';
  const bankAccountLabel = isBilingual ? t('bankAccount', 'Bank Account') : 'Bank Account';
  const accountNameRowLabel = t('accountNameLabel', 'Account Name:');
  const accountNoRowLabel = t('accountNoLabel', 'Account No:');
  const bankRowLabel = t('bankLabel', 'Bank:');
  const ibanRowLabel = t('ibanLabel', 'IBAN:');
  const swiftRowLabel = t('swiftLabel', 'SWIFT:');

  if (invoiceData.payment_terms || invoiceData.notes) {
    const termsStack: object[] = [];

    if (invoiceData.payment_terms) {
      termsStack.push(
        { text: paymentTermsLabel, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
        { text: invoiceData.payment_terms, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3 }
      );
    }

    if (invoiceData.notes) {
      if (termsStack.length > 0) {
        termsStack.push({ text: '', margin: [0, 4, 0, 0] });
      }
      termsStack.push(
        { text: notesLabel, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
        { text: invoiceData.notes, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3 }
      );
    }

    termsAndBankSection.push({
      columns: [
        {
          width: invoiceData.bank_accounts ? '50%' : '100%',
          stack: termsStack,
        },
        ...(invoiceData.bank_accounts ? [
          { width: 8, text: '' },
          {
            width: '50%',
            stack: [
              { text: isBilingual ? `${bankAccountLabel} | تفاصيل البنك` : bankAccountLabel, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
              {
                table: {
                  widths: ['*'],
                  body: [
                    [
                      {
                        stack: [
                          ...(invoiceData.bank_accounts.account_name ? [{ text: `${accountNameRowLabel} ${invoiceData.bank_accounts.account_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(invoiceData.bank_accounts.account_number ? [{ text: `${accountNoRowLabel} ${invoiceData.bank_accounts.account_number}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(invoiceData.bank_accounts.bank_name ? [{ text: `${bankRowLabel} ${invoiceData.bank_accounts.bank_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(invoiceData.bank_accounts.iban ? [{ text: `${ibanRowLabel} ${invoiceData.bank_accounts.iban}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(invoiceData.bank_accounts.swift_code ? [{ text: `${swiftRowLabel} ${invoiceData.bank_accounts.swift_code}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
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
  } else if (invoiceData.bank_accounts) {
    termsAndBankSection.push({
      columns: [
        { width: '50%', text: '' },
        { width: 8, text: '' },
        {
          width: '50%',
          stack: [
            { text: isBilingual ? `${bankAccountLabel} | تفاصيل البنك` : bankAccountLabel, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
            {
              table: {
                widths: ['*'],
                body: [
                  [
                    {
                      stack: [
                        ...(invoiceData.bank_accounts.account_name ? [{ text: `${accountNameRowLabel} ${invoiceData.bank_accounts.account_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(invoiceData.bank_accounts.account_number ? [{ text: `${accountNoRowLabel} ${invoiceData.bank_accounts.account_number}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(invoiceData.bank_accounts.bank_name ? [{ text: `${bankRowLabel} ${invoiceData.bank_accounts.bank_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(invoiceData.bank_accounts.iban ? [{ text: `${ibanRowLabel} ${invoiceData.bank_accounts.iban}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(invoiceData.bank_accounts.swift_code ? [{ text: `${swiftRowLabel} ${invoiceData.bank_accounts.swift_code}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
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
      lineItemsSection,
      financialSummarySection,
      paymentHistorySection,
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
