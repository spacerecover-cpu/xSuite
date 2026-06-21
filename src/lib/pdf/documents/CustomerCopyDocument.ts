import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { ReceiptData, TranslationContext } from '../types';
import {
  PDF_COLORS,
  getStylesWithFont,
  createBilingualInfoBox,
  createBilingualSectionHeader,
  createSocialFooter,
  getRoleBadgeColors,
  getSimpleRoleLabel,
} from '../styles';
import { formatDate, formatCapacity, buildCompanyAddress, safeString } from '../utils';
import { getDeviceIconSvg, getGeneralIconSvg } from '../../deviceIconMapper';
import { buildLogoNode } from '../brandingImage';

export function buildCustomerCopyDocument(
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

  const customerCopyLogoNode = buildLogoNode(logoBase64, { width: 130, margin: [0, 0, 0, 5] });
  if (customerCopyLogoNode) {
    headerContent.push({
      columns: [
        customerCopyLogoNode,
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
    const arabicTitle = t('deviceCheckInReceipt', '').split(' | ')[1] || 'إيصال استقبال الأجهزة';
    headerContent.push({
      text: `DEVICE CHECK-IN RECEIPT | ${arabicTitle}`,
      fontSize: 16,
      bold: true,
      color: PDF_COLORS.primaryDark,
      alignment: 'center',
      margin: [0, 0, 0, 0],
    });
  } else {
    headerContent.push({
      text: 'DEVICE CHECK-IN RECEIPT',
      fontSize: 16,
      bold: true,
      color: PDF_COLORS.primaryDark,
      alignment: 'center',
      margin: [0, 0, 0, 0],
    });
  }

  headerContent.push({
    text: t('customerCopy', 'Customer Copy'),
    fontSize: 10,
    color: PDF_COLORS.textLight,
    alignment: 'center',
    margin: [0, 1, 0, 6],
  });

  const labelWidth = isBilingual ? 110 : 55;

  const customerInfoContent: object[] = [
    createInfoRow(t('nameLabel', 'Name:'), caseData.customer?.customer_name || caseData.contact_name, labelWidth),
    createInfoRow(t('companyLabel', 'Company:'), caseData.company?.company_name, labelWidth),
    createInfoRow(t('phoneLabel', 'Phone:'), caseData.customer?.mobile_number || caseData.customer?.phone_number || caseData.contact_phone, labelWidth),
    createInfoRow(t('emailLabel', 'Email:'), caseData.customer?.email || caseData.contact_email, labelWidth),
    createInfoRow(t('referenceLabel', 'Reference:'), caseData.client_reference, labelWidth),
  ];

  const firstDeviceProblem = devices.length > 0 ? devices[0].device_problem : null;

  const caseDetailsContent: object[] = [
    createInfoRow(t('caseIdLabel', 'Case ID:'), caseData.case_no, labelWidth),
    createInfoRow(t('serviceLabel', 'Service:'), caseData.service_type?.name, labelWidth),
    createInfoRow(t('priorityLabel', 'Priority:'), caseData.priority, labelWidth),
    createInfoRow(t('problemLabel', 'Problem:'), firstDeviceProblem || caseData.problem_description, labelWidth),
    createInfoRow(t('dateLabel', 'Date:'), formatDate(caseData.created_at, 'dd MMM yyyy, HH:mm'), labelWidth),
  ];

  const customerInfoTitle = isBilingual
    ? `Customer Information | ${t('customerInformation', '').split(' | ')[1] || 'معلومات العميل'}`
    : 'Customer Information';
  const caseDetailsTitle = isBilingual
    ? `Case Details | ${t('caseDetails', '').split(' | ')[1] || 'تفاصيل الحالة'}`
    : 'Case Details';

  const userIconSvg = getGeneralIconSvg('user');
  const fileIconSvg = getGeneralIconSvg('fileText');

  const infoBoxesSection: Content = {
    columns: [
      {
        width: '50%',
        stack: [createBilingualInfoBox(caseDetailsTitle, null, caseDetailsContent, fileIconSvg) as Content],
      },
      { width: 8, text: '' },
      {
        width: '50%',
        stack: [createBilingualInfoBox(customerInfoTitle, null, customerInfoContent, userIconSvg) as Content],
      },
    ],
    margin: [0, 0, 0, 8],
  };

  const devicesTitle = isBilingual
    ? `Device(s) Received | ${t('devicesReceived', '').split(' | ')[1] || 'الأجهزة المستلمة'}`
    : 'Device(s) Received';

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

  const customerAcknowledgementTextEnglish = `By signing, I confirm that I am the owner or authorized representative of the device and authorize ${legalName} (${companyName}) to proceed with the service. I acknowledge that the Terms & Conditions apply to this engagement. A printed copy of the Terms & Conditions is available at reception upon request.`;

  const customerAcknowledgementTextArabic = `بتوقيعي، أؤكد أنني المالك أو الممثل المفوض للجهاز وأفوض ${legalName} (${companyName}) بالمتابعة في الخدمة. أقر بأن الشروط والأحكام تنطبق على هذا التعامل. نسخة مطبوعة من الشروط والأحكام متاحة في الاستقبال عند الطلب.`;

  const englishAcknowledgementTitle = 'Customer Acknowledgement';
  const englishContent: Content[] = [
    { text: englishAcknowledgementTitle, bold: true, fontSize: 9, margin: [0, 0, 0, 3] },
    { text: customerAcknowledgementTextEnglish, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.2 },
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

  const translatedAcknowledgementTitle = isBilingual
    ? (t('customerAcknowledgement', '').split(' | ')[1] || null)
    : null;

  const arabicContent: Content[] = isBilingual && translatedAcknowledgementTitle ? [
    { text: translatedAcknowledgementTitle, bold: true, fontSize: 9, alignment: 'right', margin: [0, 0, 0, 3] },
    { text: customerAcknowledgementTextArabic, fontSize: 7, color: PDF_COLORS.textLight, alignment: 'right', lineHeight: 1.2 },
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

  const creatorName = caseData.created_by_profile?.full_name || caseData.created_by_profile?.email || 'System';
  const registeredBySection: Content = {
    text: `${t('registeredByLabel', 'Registered by:')} ${creatorName}`,
    style: 'registeredBy',
    margin: [0, 8, 0, 6],
  };

  const tagline = companySettings.branding?.brand_tagline || undefined;

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
        const socialFooter = createSocialFooter(companySettings.online_presence, tagline) as { stack: Content[]; margin: [number, number, number, number] };
        return {
          stack: socialFooter.stack,
          margin: [35, 10, 35, 25],
        };
      }
    },
  };
}

function createInfoRow(label: string, value: string | undefined | null, labelWidth: number = 55): object {
  return {
    columns: [
      { text: label, fontSize: 8, color: PDF_COLORS.textLight, width: labelWidth },
      { text: safeString(value), fontSize: 9, color: PDF_COLORS.text, width: '*' },
    ],
    margin: [0, 0, 0, 2],
  };
}
