import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { QuoteDocumentData, TranslationContext } from '../types';
import {
  PDF_COLORS,
  getStylesWithFont,
  createBilingualInfoBox,
  createBilingualSectionHeader,
} from '../styles';
import { formatDate, buildCompanyAddress, safeString } from '../utils';
import { getGeneralIconSvg } from '../../deviceIconMapper';

export function buildQuoteDocument(
  data: QuoteDocumentData,
  ctx: TranslationContext,
  logoBase64?: string | null,
  qrCodeBase64?: string | null,
  qrCodeCaption?: string | null
): TDocumentDefinitions {
  const { quoteData, companySettings } = data;
  const { t, isBilingual, fontFamily } = ctx;

  const finalQrCodeCaption = qrCodeCaption || 'Scan to approve this quote';

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

  if (logoBase64) {
    headerContent.push({
      columns: [
        {
          image: logoBase64,
          width: 130,
          margin: [0, 0, 0, 5],
        },
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

  if (isBilingual) {
    const arabicTitle = 'عرض أسعار';
    headerContent.push({
      text: `QUOTATION | ${arabicTitle}`,
      fontSize: 16,
      bold: true,
      color: PDF_COLORS.primaryDark,
      alignment: 'center',
      margin: [0, 0, 0, 6],
    });
  } else {
    headerContent.push({
      text: 'QUOTATION',
      fontSize: 16,
      bold: true,
      color: PDF_COLORS.primaryDark,
      alignment: 'center',
      margin: [0, 0, 0, 6],
    });
  }

  const fileIconSvg = getGeneralIconSvg('fileText');
  const userIconSvg = getGeneralIconSvg('user');

  const customerAssociatedCompany = quoteData.customer_associated_company;
  const customerName = quoteData.customer?.customer_name || quoteData.cases?.contact_name || 'N/A';
  const companyNameDisplay = customerAssociatedCompany?.company_name || quoteData.company?.company_name;
  const customerEmail = quoteData.customer?.email || quoteData.cases?.contact_email || quoteData.company?.email || 'N/A';
  const customerPhone = quoteData.customer?.mobile_number || quoteData.customer?.phone_number || quoteData.cases?.contact_phone || quoteData.company?.phone_number || 'N/A';

  const labelWidth = isBilingual ? 140 : 85;

  const customerDetailsContent: object[] = [
    createInfoRow(t('nameLabel', 'Name:'), customerName, labelWidth),
    createInfoRow(t('companyLabel', 'Company:'), companyNameDisplay, labelWidth),
    createInfoRow(t('phoneLabel', 'Phone:'), customerPhone, labelWidth),
    createInfoRow(t('emailLabel', 'Email:'), customerEmail, labelWidth),
    createInfoRow(t('referenceLabel', 'Reference:'), quoteData.client_reference, labelWidth),
  ];

  const quoteDetailsContent: object[] = [
    createInfoRow(t('quoteNoLabel', 'Quote No:'), quoteData.quote_number || 'Draft', labelWidth),
    createInfoRow(t('createdDateLabel', 'Created Date:'), formatDate(quoteData.created_at, 'dd MMM yyyy'), labelWidth),
    ...(quoteData.valid_until ? [createInfoRow(t('expiryDateLabel', 'Expiry Date:'), formatDate(quoteData.valid_until, 'dd MMM yyyy'), labelWidth)] : []),
    ...(quoteData.cases?.case_no ? [createInfoRow(t('jobIdLabel', 'Job ID:'), quoteData.cases.case_no, labelWidth)] : []),
  ];

  const customerInfoTitle = isBilingual
    ? `Customer Information | ${t('customerInformation', '').split(' | ')[1] || 'معلومات العميل'}`
    : 'Customer Information';
  const quoteDetailsTitle = isBilingual
    ? `Quote Details | ${t('quoteDetails', '').split(' | ')[1] || 'تفاصيل العرض'}`
    : 'Quote Details';

  const infoBoxesSection: Content = {
    columns: [
      {
        width: '50%',
        stack: [createBilingualInfoBox(customerInfoTitle, null, customerDetailsContent, userIconSvg) as Content],
      },
      { width: 8, text: '' },
      {
        width: '50%',
        stack: [createBilingualInfoBox(quoteDetailsTitle, null, quoteDetailsContent, fileIconSvg) as Content],
      },
    ],
    margin: [0, 0, 0, 8],
  };

  const lineItemsTitle = isBilingual
    ? `Line Items | ${t('lineItems', '').split(' | ')[1] || 'البنود'}`
    : 'Line Items';

  const lineItemsHeader: Content = createBilingualSectionHeader(lineItemsTitle, null) as Content;

  const currencySymbol = quoteData.accounting_locales?.currency_symbol || 'USD';
  const decimalPlaces = quoteData.accounting_locales?.decimal_places || 2;
  const currencyPosition = quoteData.accounting_locales?.currency_position || 'after';

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

  (quoteData.quote_items || []).forEach((item) => {
    lineItemsTableBody.push([
      { text: safeString(item.description), style: 'tableCell' },
      { text: String(item.quantity), style: 'tableCellCenter' },
      { text: formatCurrency(item.unit_price), style: 'tableCellRight' },
      { text: formatCurrency(item.quantity * item.unit_price), style: 'tableCellRight', bold: true },
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

  const subtotal = quoteData.subtotal || 0;
  const discountAmount = quoteData.discount_amount || 0;
  const discountType = quoteData.discount_type || 'amount';
  const discountValue = discountType === 'percentage' ? (subtotal * discountAmount) / 100 : discountAmount;
  const discountedSubtotal = subtotal - discountValue;
  const taxRate = quoteData.tax_rate || 0;
  const taxAmount = (discountedSubtotal * taxRate) / 100;
  const totalAmount = discountedSubtotal + taxAmount;

  const subtotalRowLabel = isBilingual ? t('subtotalLabel', 'Subtotal:') : 'Subtotal:';
  const vatTranslated = isBilingual ? (t('vat', '').split(' | ')[1] || 'ضريبة القيمة المضافة') : null;
  const vatLabel = isBilingual ? `VAT ${taxRate}% | ${vatTranslated}:` : `VAT ${taxRate}%:`;
  const totalTranslated = isBilingual ? (t('total', '').split(' | ')[1] || 'الإجمالي') : null;
  const totalRowLabel = isBilingual ? `Total | ${totalTranslated}:` : 'Total:';
  const baseDiscountLabel = isBilingual ? t('discountLabel', 'Discount:') : 'Discount:';

  const financialSummaryRows: object[] = [
    {
      columns: [
        { text: subtotalRowLabel, fontSize: 9, color: PDF_COLORS.textLight, width: '*', alignment: 'right' },
        { text: formatCurrency(subtotal), fontSize: 9, bold: true, color: PDF_COLORS.text, width: 100, alignment: 'right' },
      ],
      margin: [0, 2, 0, 2],
    },
  ];

  if (discountValue > 0) {
    const discountLabelText = discountType === 'percentage'
      ? (isBilingual ? `Discount (${discountAmount}%) | الخصم:` : `Discount (${discountAmount}%):`)
      : baseDiscountLabel;
    financialSummaryRows.push({
      columns: [
        { text: discountLabelText, fontSize: 9, color: PDF_COLORS.textLight, width: '*', alignment: 'right' },
        { text: `- ${formatCurrency(discountValue)}`, fontSize: 9, bold: true, color: PDF_COLORS.error, width: 100, alignment: 'right' },
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
          { text: totalRowLabel, fontSize: 10, bold: true, color: PDF_COLORS.text, alignment: 'right', border: [false, false, false, false], margin: [0, 3, 0, 3] },
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

  const financialSummarySection: Content = {
    stack: financialSummaryRows,
    margin: [280, 8, 0, 8],
  } as Content;

  const termsAndBankSection: Content[] = [];

  const termsConditionsLabel = isBilingual ? t('termsAndConditions', 'Terms & Conditions') : 'Terms & Conditions';
  const notesSectionLabel = isBilingual ? t('notes', 'Notes') : 'Notes';
  const bankAccountSectionLabel = isBilingual ? `${t('bankAccount', 'Bank Account')} | تفاصيل البنك` : 'Bank Account';
  const accountNameRowLabel = t('accountNameLabel', 'Account Name:');
  const accountNoRowLabel = t('accountNoLabel', 'Account No:');
  const bankRowLabel = t('bankLabel', 'Bank:');
  const ibanRowLabel = t('ibanLabel', 'IBAN:');
  const swiftRowLabel = t('swiftLabel', 'SWIFT:');

  if (quoteData.terms_and_conditions || quoteData.notes) {
    const termsStack: object[] = [];

    if (quoteData.terms_and_conditions) {
      termsStack.push(
        { text: termsConditionsLabel, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
        { text: quoteData.terms_and_conditions, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3 }
      );
    }

    if (quoteData.notes) {
      if (termsStack.length > 0) {
        termsStack.push({ text: '', margin: [0, 4, 0, 0] });
      }
      termsStack.push(
        { text: notesSectionLabel, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
        { text: quoteData.notes, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3 }
      );
    }

    termsAndBankSection.push({
      columns: [
        {
          width: quoteData.bank_accounts ? '50%' : '100%',
          stack: termsStack,
        },
        ...(quoteData.bank_accounts ? [
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
                          ...(quoteData.bank_accounts.account_name ? [{ text: `${accountNameRowLabel} ${quoteData.bank_accounts.account_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(quoteData.bank_accounts.account_number ? [{ text: `${accountNoRowLabel} ${quoteData.bank_accounts.account_number}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(quoteData.bank_accounts.bank_name ? [{ text: `${bankRowLabel} ${quoteData.bank_accounts.bank_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(quoteData.bank_accounts.iban ? [{ text: `${ibanRowLabel} ${quoteData.bank_accounts.iban}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                          ...(quoteData.bank_accounts.swift_code ? [{ text: `${swiftRowLabel} ${quoteData.bank_accounts.swift_code}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
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
  } else if (quoteData.bank_accounts) {
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
                        ...(quoteData.bank_accounts.account_name ? [{ text: `${accountNameRowLabel} ${quoteData.bank_accounts.account_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(quoteData.bank_accounts.account_number ? [{ text: `${accountNoRowLabel} ${quoteData.bank_accounts.account_number}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(quoteData.bank_accounts.bank_name ? [{ text: `${bankRowLabel} ${quoteData.bank_accounts.bank_name}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(quoteData.bank_accounts.iban ? [{ text: `${ibanRowLabel} ${quoteData.bank_accounts.iban}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
                        ...(quoteData.bank_accounts.swift_code ? [{ text: `${swiftRowLabel} ${quoteData.bank_accounts.swift_code}`, fontSize: 7, color: PDF_COLORS.text, margin: [0, 1, 0, 1] }] : []),
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

function createInfoRow(label: string, value: string | undefined | null, labelWidth: number = 85): object {
  return {
    columns: [
      { text: label, fontSize: 8, color: PDF_COLORS.textLight, width: labelWidth },
      { text: safeString(value), fontSize: 9, color: PDF_COLORS.text, width: '*' },
    ],
    margin: [0, 0, 0, 2],
  };
}
