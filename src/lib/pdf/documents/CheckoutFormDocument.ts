import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { ReceiptData, TranslationContext } from '../types';
import {
  PDF_COLORS,
  getStylesWithFont,
  createBilingualInfoBox,
  createBilingualSectionHeader,
  getRoleBadgeColors,
  getSimpleRoleLabel,
} from '../styles';
import { formatDate, formatCapacity, buildCompanyAddress, safeString } from '../utils';
import { getDeviceIconSvg, getGeneralIconSvg } from '../../deviceIconMapper';
import { buildLogoNode } from '../brandingImage';

export function buildCheckoutFormDocument(
  data: ReceiptData,
  ctx: TranslationContext,
  logoBase64?: string | null,
  qrCodeBase64?: string | null,
  qrCodeCaption?: string | null
): TDocumentDefinitions {
  const { caseData, devices, companySettings } = data;
  const { t, isBilingual, fontFamily } = ctx;

  const finalQrCodeCaption = qrCodeCaption || 'Scan for more information';

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

  const checkoutFormLogoNode = buildLogoNode(logoBase64, { width: 130, margin: [0, 0, 0, 5] });
  if (checkoutFormLogoNode) {
    headerContent.push({
      columns: [
        checkoutFormLogoNode,
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
    const arabicTitle = 'إيصال استلام الأجهزة';
    headerContent.push({
      text: `DEVICE CHECKOUT FORM | ${arabicTitle}`,
      fontSize: 16,
      bold: true,
      color: PDF_COLORS.primaryDark,
      alignment: 'center',
      margin: [0, 0, 0, 0],
    });
  } else {
    headerContent.push({
      text: 'DEVICE CHECKOUT FORM',
      fontSize: 16,
      bold: true,
      color: PDF_COLORS.primaryDark,
      alignment: 'center',
      margin: [0, 0, 0, 0],
    });
  }

  headerContent.push({
    text: isBilingual ? 'Office Copy | نسخة المكتب' : 'Office Copy',
    fontSize: 10,
    color: PDF_COLORS.textLight,
    alignment: 'center',
    margin: [0, 1, 0, 6],
  });

  const fileIconSvg = getGeneralIconSvg('fileText');
  const userIconSvg = getGeneralIconSvg('user');

  const isCollectorSameAsCustomer =
    caseData.checkout_collector_name === caseData.customer?.customer_name ||
    !caseData.checkout_collector_name ||
    caseData.checkout_collector_name.trim() === '';

  const labelWidth = isBilingual ? 130 : 75;

  const caseDetailsContent: object[] = [
    createInfoRow(t('caseIdLabel', 'Case ID:'), caseData.case_no, labelWidth),
    createInfoRow(t('customerNameLabel', 'Customer Name:'), caseData.customer?.customer_name || caseData.contact_name, labelWidth),
    createInfoRow(t('companyLabel', 'Company:'), caseData.company?.company_name, labelWidth),
    createInfoRow(t('serviceLabel', 'Service:'), caseData.service_type?.name, labelWidth),
    createInfoRow(t('customerPhoneLabel', 'Customer Phone:'), caseData.customer?.mobile_number || caseData.customer?.phone_number || caseData.contact_phone, labelWidth),
  ];

  let collectionInfoContent: object[];

  if (isCollectorSameAsCustomer) {
    collectionInfoContent = [
      createInfoRow(t('checkoutDateLabel', 'Checkout Date:'), formatDate(caseData.checkout_date || new Date().toISOString(), 'dd MMM yyyy, HH:mm'), labelWidth),
      createInfoRow(t('recoveryOutcomeLabel', 'Recovery Outcome:'), getRecoveryOutcomeLabel(caseData.recovery_outcome), labelWidth),
      createInfoRow(t('collectedByLabel', 'Collected By:'), caseData.customer?.customer_name || caseData.contact_name, labelWidth),
      createInfoRow(t('mobileNumberLabel', 'Mobile Number:'), caseData.customer?.mobile_number || caseData.customer?.phone_number || caseData.contact_phone, labelWidth),
    ];
  } else {
    collectionInfoContent = [
      createInfoRow(t('checkoutDateLabel', 'Checkout Date:'), formatDate(caseData.checkout_date || new Date().toISOString(), 'dd MMM yyyy, HH:mm'), labelWidth),
      createInfoRow(t('recoveryOutcomeLabel', 'Recovery Outcome:'), getRecoveryOutcomeLabel(caseData.recovery_outcome), labelWidth),
      createInfoRow(t('collectedByLabel', 'Collected By:'), caseData.checkout_collector_name, labelWidth),
      createInfoRow(t('mobileNumberLabel', 'Mobile Number:'), caseData.checkout_collector_mobile, labelWidth),
      createInfoRow(t('nationalIdLabel', 'National ID:'), caseData.checkout_collector_id, labelWidth),
    ];
  }

  const collectionInfoTitle = isBilingual
    ? `Collection Information | ${t('collectionInformation', '').split(' | ')[1] || 'معلومات الاستلام'}`
    : 'Collection Information';
  const caseDetailsTitle = isBilingual
    ? `Case Details | ${t('caseDetails', '').split(' | ')[1] || 'تفاصيل الحالة'}`
    : 'Case Details';

  const infoBoxesSection: Content = {
    columns: [
      {
        width: '50%',
        stack: [createBilingualInfoBox(caseDetailsTitle, null, caseDetailsContent, fileIconSvg) as Content],
      },
      { width: 8, text: '' },
      {
        width: '50%',
        stack: [createBilingualInfoBox(collectionInfoTitle, null, collectionInfoContent, userIconSvg) as Content],
      },
    ],
    margin: [0, 0, 0, 8],
  };

  const devicesTitle = isBilingual
    ? `Device(s) Returned | ${t('devicesReturned', '').split(' | ')[1] || 'الأجهزة المرتجعة'}`
    : 'Device(s) Returned';

  const devicesHeader: Content = createBilingualSectionHeader(devicesTitle, null) as Content;

  const devicesTableBody: TableCell[][] = [
    [
      { text: isBilingual ? t('type', 'Type') : 'Type', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'left' },
      { text: isBilingual ? t('brand', 'Brand') : 'Brand', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'left' },
      { text: isBilingual ? t('capacity', 'Capacity') : 'Capacity', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'left' },
      { text: isBilingual ? t('serialNumber', 'Serial Number') : 'Serial Number', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'left' },
      { text: isBilingual ? t('role', 'Role') : 'Role', style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'left' },
    ],
  ];

  devices.forEach((device) => {
    const roleLabel = getSimpleRoleLabel(device.role);
    const roleColors = getRoleBadgeColors(device.role);
    const deviceIconSvg = getDeviceIconSvg(device.device_type);

    devicesTableBody.push([
      {
        columns: [
          {
            svg: deviceIconSvg,
            width: 12,
            height: 12,
            margin: [0, 1, 0, 0]
          },
          { text: safeString(device.device_type), fontSize: 8, color: PDF_COLORS.text, width: 'auto' },
        ],
        columnGap: 5,
        margin: [2, 3, 2, 3],
      },
      { text: safeString(device.brand), style: 'tableCell' },
      { text: formatCapacity(device.capacity), style: 'tableCell' },
      { text: safeString(device.serial_number), style: 'tableCell' },
      roleLabel !== '-'
        ? {
            table: {
              widths: ['auto'],
              body: [
                [
                  {
                    text: roleLabel,
                    fontSize: 8,
                    bold: true,
                    color: roleColors.text,
                    fillColor: roleColors.bg,
                    margin: [8, 2, 8, 2],
                    alignment: 'center',
                    noWrap: true,
                  },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: () => 0,
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 0,
              paddingBottom: () => 0,
            },
            margin: [2, 3, 2, 3],
          }
        : { text: '-', style: 'tableCell' },
    ]);
  });

  const devicesSection: Content = {
    stack: [
      devicesHeader,
      {
        table: {
          headerRows: 1,
          widths: [100, 75, 85, 125, '*'],
          body: devicesTableBody,
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

  const termsConditionsUrl = companySettings.legal_compliance?.terms_conditions_url || null;

  const checkoutAcknowledgementTextEnglish = `I confirm receipt of my device/data and acknowledge that my case has been concluded (completed, cancelled, or non-recoverable). I accept that data recovery is best-effort and subject to the Terms & Conditions available online or at reception.`;

  const checkoutAcknowledgementTextArabic = `أؤكد استلام جهازي/بياناتي وأقر بأن حالتي قد انتهت (مكتملة، ملغاة، أو غير قابلة للاستعادة). أقبل أن استعادة البيانات تتم على أساس بذل أقصى جهد ممكن وتخضع للشروط والأحكام المتاحة عبر الإنترنت أو في الاستقبال.`;

  const englishContent: Content[] = [
    { text: 'Customer Checkout Acknowledgement', bold: true, fontSize: 9, margin: [0, 0, 0, 3] },
    { text: checkoutAcknowledgementTextEnglish, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.2 },
  ];

  if (termsConditionsUrl) {
    englishContent.push({
      text: termsConditionsUrl,
      fontSize: 7,
      color: PDF_COLORS.primary,
      link: termsConditionsUrl,
      margin: [0, 3, 0, 0],
    });
  }

  const arabicContent: Content[] = isBilingual ? [
    { text: 'إقرار استلام العميل', bold: true, fontSize: 9, alignment: 'right', margin: [0, 0, 0, 3] },
    { text: checkoutAcknowledgementTextArabic, fontSize: 7, color: PDF_COLORS.textLight, alignment: 'right', lineHeight: 1.2 },
  ] : [];

  if (termsConditionsUrl && isBilingual) {
    arabicContent.push({
      text: termsConditionsUrl,
      fontSize: 7,
      color: PDF_COLORS.primary,
      link: termsConditionsUrl,
      alignment: 'right',
      margin: [0, 3, 0, 0],
    });
  }

  const customerAcknowledgementSection: Content = {
    table: {
      widths: isBilingual ? ['55%', '45%'] : ['*'],
      body: [
        isBilingual
          ? [
              { stack: englishContent, margin: [8, 6, 8, 6], fillColor: PDF_COLORS.background },
              { stack: arabicContent, margin: [8, 6, 8, 6], fillColor: PDF_COLORS.background },
            ]
          : [{ stack: englishContent, margin: [8, 6, 8, 6], fillColor: PDF_COLORS.background }],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
    },
    margin: [0, 0, 0, 8],
  };

  const checkoutDateFormatted = formatDate(caseData.checkout_date || new Date().toISOString(), 'dd MMM yyyy, HH:mm');

  const signatureSection: Content = {
    columns: [
      {
        width: '50%',
        stack: [
          isBilingual
            ? {
                stack: [
                  {
                    text: 'Customer/Collector Signature',
                    fontSize: 9,
                    bold: true,
                    color: PDF_COLORS.text,
                    alignment: 'center',
                    margin: [0, 0, 0, 0],
                  },
                  {
                    text: 'توقيع العميل/المستلم',
                    fontSize: 9,
                    bold: true,
                    color: PDF_COLORS.text,
                    alignment: 'center',
                    margin: [0, 0, 0, 4],
                  },
                ],
              }
            : {
                text: 'Customer/Collector Signature',
                fontSize: 9,
                bold: true,
                color: PDF_COLORS.text,
                alignment: 'center',
                margin: [0, 0, 0, 4],
              },
          {
            canvas: [
              {
                type: 'rect',
                x: 0,
                y: 0,
                w: 250,
                h: 50,
                lineWidth: 0.5,
                lineColor: PDF_COLORS.border,
              },
            ],
            margin: [0, 0, 0, 4],
          },
          {
            text: `${t('dateLabel', 'Date:')} ${checkoutDateFormatted}`,
            fontSize: 8,
            color: PDF_COLORS.textLight,
            alignment: 'center',
          },
        ],
      },
      { width: 20, text: '' },
      {
        width: '50%',
        stack: [
          isBilingual
            ? {
                stack: [
                  {
                    text: 'Company Representative',
                    fontSize: 9,
                    bold: true,
                    color: PDF_COLORS.text,
                    alignment: 'center',
                    margin: [0, 0, 0, 0],
                  },
                  {
                    text: 'ممثل الشركة',
                    fontSize: 9,
                    bold: true,
                    color: PDF_COLORS.text,
                    alignment: 'center',
                    margin: [0, 0, 0, 4],
                  },
                ],
              }
            : {
                text: 'Company Representative',
                fontSize: 9,
                bold: true,
                color: PDF_COLORS.text,
                alignment: 'center',
                margin: [0, 0, 0, 4],
              },
          {
            canvas: [
              {
                type: 'rect',
                x: 0,
                y: 0,
                w: 250,
                h: 50,
                lineWidth: 0.5,
                lineColor: PDF_COLORS.border,
              },
            ],
            margin: [0, 0, 0, 4],
          },
          {
            text: `${t('dateLabel', 'Date:')} ${checkoutDateFormatted}`,
            fontSize: 8,
            color: PDF_COLORS.textLight,
            alignment: 'center',
          },
        ],
      },
    ],
    margin: [0, 16, 0, 8],
  };

  const creatorName = caseData.created_by_profile?.full_name || caseData.created_by_profile?.email || 'System';
  const registeredBySection: Content = {
    text: `${t('registeredByLabel', 'Registered by:')} ${creatorName}`,
    style: 'registeredBy',
    margin: [0, 8, 0, 6],
  };

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
      devicesSection,
      customerAcknowledgementSection,
      signatureSection,
      registeredBySection,
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

function createInfoRow(label: string, value: string | undefined | null, labelWidth: number = 75): object {
  return {
    columns: [
      { text: label, fontSize: 8, color: PDF_COLORS.textLight, width: labelWidth },
      { text: safeString(value), fontSize: 9, color: PDF_COLORS.text, width: '*' },
    ],
    margin: [0, 0, 0, 2],
  };
}

function getRecoveryOutcomeLabel(outcome: string | undefined | null): string {
  if (!outcome) return '-';

  const outcomes: Record<string, string> = {
    full: 'Full Recovery',
    partial: 'Partial Recovery',
    unrecoverable: 'Unrecoverable',
    declined: 'Declined',
  };

  return outcomes[outcome] || outcome;
}
