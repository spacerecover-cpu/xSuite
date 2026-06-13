import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { CreditNoteDocumentData, TranslationContext } from '../types';
import {
  PDF_COLORS,
  getStylesWithFont,
  createBilingualInfoBox,
  createBilingualSectionHeader,
} from '../styles';
import { formatDate, buildCompanyAddress, safeString } from '../utils';
import { getGeneralIconSvg } from '../../deviceIconMapper';

const humanize = (s: string | null | undefined): string =>
  s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-';

export function buildCreditNoteDocument(
  data: CreditNoteDocumentData,
  ctx: TranslationContext,
  logoBase64?: string | null,
  qrCodeBase64?: string | null,
  qrCodeCaption?: string | null,
): TDocumentDefinitions {
  const { creditNoteData: cn, companySettings } = data;
  const { t, isBilingual, fontFamily } = ctx;

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

  const decimalPlaces = cn.decimal_places ?? 2;
  const currencySymbol = cn.currency_symbol || 'USD';
  const formatCurrency = (amount: number): string => {
    const formatted = amount.toFixed(decimalPlaces);
    return cn.currency_position === 'before' ? `${currencySymbol} ${formatted}` : `${formatted} ${currencySymbol}`;
  };

  const headerContent: Content[] = [];

  if (logoBase64) {
    headerContent.push({
      columns: [
        { image: logoBase64, width: 130, margin: [0, 0, 0, 5] },
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
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 0.5, lineColor: PDF_COLORS.error }],
    margin: [0, 0, 0, 12],
  });

  const documentTitle = 'CREDIT NOTE';
  const arabicTitle = 'إشعار دائن';
  headerContent.push({
    text: isBilingual ? `${documentTitle} | ${arabicTitle}` : documentTitle,
    fontSize: 16,
    bold: true,
    color: PDF_COLORS.primaryDark,
    alignment: 'center',
    margin: [0, 0, 0, 6],
  });

  const fileIconSvg = getGeneralIconSvg('fileText');
  const userIconSvg = getGeneralIconSvg('user');
  const labelWidth = isBilingual ? 150 : 95;

  const customerDetailsContent: object[] = [
    createInfoRow(t('nameLabel', 'Name:'), cn.customer_name, labelWidth),
    createInfoRow(t('companyLabel', 'Company:'), cn.company_name, labelWidth),
  ];

  const creditNoteDetailsContent: object[] = [
    createInfoRow(t('creditNoteNoLabel', 'Credit Note No:'), cn.credit_note_number || 'Draft', labelWidth),
    createInfoRow(t('creditNoteDateLabel', 'Date:'), formatDate(cn.credit_note_date, 'dd MMM yyyy'), labelWidth),
    createInfoRow(t('creditTypeLabel', 'Type:'), humanize(cn.credit_type), labelWidth),
    createInfoRow(t('statusLabel', 'Status:'), humanize(cn.status), labelWidth),
    ...(cn.invoice_number ? [createInfoRow(t('againstInvoiceLabel', 'Against Invoice:'), cn.invoice_number, labelWidth)] : []),
    ...(cn.case_no ? [createInfoRow(t('jobIdLabel', 'Job ID:'), cn.case_no, labelWidth)] : []),
  ];

  const infoBoxesSection: Content = {
    columns: [
      { width: '50%', stack: [createBilingualInfoBox('Customer Information', null, customerDetailsContent, userIconSvg) as Content] },
      { width: 8, text: '' },
      { width: '50%', stack: [createBilingualInfoBox('Credit Note Details', null, creditNoteDetailsContent, fileIconSvg) as Content] },
    ],
    margin: [0, 0, 0, 8],
  };

  const sectionContent: Content[] = [...headerContent, infoBoxesSection];

  // Reason — why the credit was issued (audit/customer-facing).
  if (cn.reason_code || cn.reason_notes) {
    const reasonText = [humanize(cn.reason_code), cn.reason_notes].filter((p) => p && p !== '-').join(' — ');
    sectionContent.push({
      stack: [
        createBilingualSectionHeader('Reason', null) as Content,
        {
          table: {
            widths: ['*'],
            body: [[{ text: safeString(reasonText), fontSize: 8, color: PDF_COLORS.text, fillColor: PDF_COLORS.background, margin: [6, 5, 6, 5] }]],
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

  // Optional line items (credit notes issued as a flat adjustment carry none).
  if (cn.items.length > 0) {
    const itemsBody: TableCell[][] = [
      [
        { text: 'Description', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'left' },
        { text: 'Qty', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'center' },
        { text: 'Unit Price', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'right' },
        { text: 'Amount', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'right' },
      ],
    ];
    cn.items.forEach((item) => {
      itemsBody.push([
        { text: safeString(item.description), style: 'tableCell' },
        { text: String(item.quantity), style: 'tableCellCenter' },
        { text: formatCurrency(item.unit_price), style: 'tableCellRight' },
        { text: formatCurrency(item.line_total || item.quantity * item.unit_price), style: 'tableCellRight', bold: true },
      ]);
    });
    sectionContent.push({
      stack: [
        createBilingualSectionHeader('Items', null) as Content,
        {
          table: { headerRows: 1, widths: [220, 60, 105, 105], body: itemsBody },
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

  // Financial summary — the credited amounts (a credit note reduces what's owed).
  const total = cn.total_amount || 0;
  const taxAmount = cn.tax_amount || 0;
  const subtotal = cn.subtotal != null ? cn.subtotal : total - taxAmount;
  const applied = cn.applied_amount || 0;
  const taxRate = cn.tax_rate || 0;

  const summaryRows: object[] = [
    {
      columns: [
        { text: isBilingual ? t('subtotalLabel', 'Subtotal:') : 'Subtotal:', fontSize: 9, color: PDF_COLORS.textLight, width: '*', alignment: 'right' },
        { text: formatCurrency(subtotal), fontSize: 9, bold: true, color: PDF_COLORS.text, width: 100, alignment: 'right' },
      ],
      margin: [0, 2, 0, 2],
    },
    {
      columns: [
        { text: isBilingual ? `VAT ${taxRate}% | ضريبة القيمة المضافة:` : `VAT ${taxRate}%:`, fontSize: 9, color: PDF_COLORS.textLight, width: '*', alignment: 'right' },
        { text: formatCurrency(taxAmount), fontSize: 9, bold: true, color: PDF_COLORS.text, width: 100, alignment: 'right' },
      ],
      margin: [0, 2, 0, 2],
    },
    {
      table: {
        widths: ['*', 100],
        body: [
          [
            { text: isBilingual ? 'Total Credited | إجمالي الإشعار:' : 'Total Credited:', fontSize: 10, bold: true, color: PDF_COLORS.text, alignment: 'right', border: [false, false, false, false], margin: [0, 3, 0, 3] },
            { text: formatCurrency(total), fontSize: 11, bold: true, color: PDF_COLORS.primary, alignment: 'right', border: [false, false, false, false], margin: [0, 3, 0, 3] },
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
    },
  ];

  if (applied > 0) {
    summaryRows.push({
      columns: [
        { text: isBilingual ? t('appliedLabel', 'Applied to invoices:') : 'Applied to invoices:', fontSize: 9, color: PDF_COLORS.success, width: '*', alignment: 'right' },
        { text: formatCurrency(applied), fontSize: 9, bold: true, color: PDF_COLORS.success, width: 100, alignment: 'right' },
      ],
      margin: [0, 6, 0, 2],
    });
  }

  sectionContent.push({ stack: summaryRows, margin: [280, 8, 0, 8] } as Content);

  const tagline = companySettings.branding?.brand_tagline || null;
  const website = companySettings.online_presence?.website || null;
  const finalQrCaption = qrCodeCaption || 'Scan to verify this credit note';

  return {
    pageSize: 'A4',
    pageMargins: [35, 30, 35, 95],
    defaultStyle: { font: fontFamily },
    styles: getStylesWithFont(fontFamily),
    content: sectionContent,
    footer: () => {
      const footerStack: Content[] = [];
      if (tagline) {
        footerStack.push({ text: tagline, fontSize: 10, bold: true, color: PDF_COLORS.primary, alignment: qrCodeBase64 ? 'right' : 'center', margin: [0, 5, 0, 1] });
      }
      if (website) {
        footerStack.push({ text: website, fontSize: 8, color: PDF_COLORS.textLight, alignment: qrCodeBase64 ? 'right' : 'center' });
      }
      const divider: Content = {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 0.5, lineColor: PDF_COLORS.error }],
        margin: [0, 0, 0, 10],
      };
      if (qrCodeBase64) {
        return {
          stack: [
            divider,
            {
              columns: [
                { stack: [{ image: qrCodeBase64, width: 60, height: 60, alignment: 'left', margin: [0, 0, 0, 2] }, { text: finalQrCaption, fontSize: 8, color: PDF_COLORS.text, alignment: 'left' }], width: 'auto' },
                { text: '', width: '*' },
                { stack: footerStack, width: 'auto' },
              ],
            },
          ],
          margin: [35, 0, 35, 25],
        };
      }
      return { stack: [divider, { stack: footerStack }], margin: [35, 10, 35, 25] };
    },
  };
}

function createInfoRow(label: string, value: string | undefined | null, labelWidth: number = 95): object {
  return {
    columns: [
      { text: label, fontSize: 8, color: PDF_COLORS.textLight, width: labelWidth },
      { text: safeString(value), fontSize: 9, color: PDF_COLORS.text, width: '*' },
    ],
    margin: [0, 0, 0, 2],
  };
}
