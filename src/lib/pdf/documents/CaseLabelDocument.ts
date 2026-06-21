import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import type { ReceiptData, TranslationContext } from '../types';
import { PDF_COLORS, getPriorityColor, getStylesWithFont } from '../styles';
import { formatDate, safeString } from '../utils';
import { getDeviceIconSvg } from '../../deviceIconMapper';
import { buildLogoNode } from '../brandingImage';

export function buildCaseLabelDocument(
  data: ReceiptData,
  ctx: TranslationContext,
  logoBase64?: string | null,
  qrCodeBase64?: string | null
): TDocumentDefinitions {
  const { caseData, devices, companySettings } = data;
  const { t, isBilingual, fontFamily } = ctx;

  const companyName = companySettings.basic_info?.company_name || 'Company';
  const priorityColor = getPriorityColor(caseData.priority);
  const qrCaption = companySettings.branding?.qr_code_label_caption || 'Scan to track';

  const headerContent: Content = {
    columns: [
      buildLogoNode(logoBase64, { width: 60, margin: [0, 0, 0, 0] }) ?? {
        text: companyName,
        fontSize: 12,
        bold: true,
        color: PDF_COLORS.text,
      },
      {
        stack: [
          {
            text: caseData.priority?.toUpperCase() || 'NORMAL',
            fontSize: 10,
            bold: true,
            color: '#ffffff',
            alignment: 'center',
            margin: [0, 3, 0, 3],
          },
        ],
        width: 80,
        alignment: 'right',
        fillColor: priorityColor,
      },
    ],
    margin: [0, 0, 0, 10],
  };

  const caseNumberSection: Content = {
    stack: [
      {
        text: isBilingual ? t('caseNumber', 'CASE NUMBER') : 'CASE NUMBER',
        fontSize: 8,
        color: PDF_COLORS.textLight,
        alignment: 'center',
        margin: [0, 5, 0, 3],
      },
      {
        text: caseData.case_number ?? caseData.case_no,
        fontSize: 28,
        bold: true,
        color: PDF_COLORS.primary,
        alignment: 'center',
        margin: [0, 0, 0, 5],
      },
    ],
  };

  const receivedLabelText = isBilingual ? t('receivedLabel', 'Received:') : 'Received:';
  const dateSection: Content = {
    columns: [
      {
        text: `${receivedLabelText} ${formatDate(caseData.created_at, 'dd/MM/yyyy')}`,
        fontSize: 9,
        color: PDF_COLORS.textLight,
      },
      {
        text: `${formatDate(caseData.created_at, 'HH:mm')}`,
        fontSize: 9,
        color: PDF_COLORS.textLight,
        alignment: 'right',
      },
    ],
    margin: [0, 0, 0, 10],
  };

  const divider: Content = {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 200,
        y2: 0,
        lineWidth: 1,
        lineColor: PDF_COLORS.border,
        dash: { length: 3, space: 2 },
      },
    ],
    margin: [0, 5, 0, 10],
  };

  const customerSection: Content = {
    stack: [
      {
        text: isBilingual ? t('customer', 'CUSTOMER') : 'CUSTOMER',
        fontSize: 7,
        color: PDF_COLORS.textMuted,
        margin: [0, 0, 0, 2],
      },
      {
        text: safeString(caseData.customer?.customer_name || caseData.contact_name),
        fontSize: 12,
        bold: true,
        color: PDF_COLORS.text,
        margin: [0, 0, 0, 3],
      },
      caseData.company?.company_name
        ? {
            text: caseData.company.company_name,
            fontSize: 9,
            color: PDF_COLORS.textLight,
            margin: [0, 0, 0, 3],
          }
        : { text: '' },
      {
        text: safeString(caseData.customer?.mobile_number || caseData.customer?.phone_number || caseData.contact_phone),
        fontSize: 10,
        color: PDF_COLORS.text,
      },
    ],
    margin: [0, 0, 0, 10],
  };

  const deviceSummary = devices.length > 0 ? devices[0] : null;
  const deviceSection: Content = deviceSummary
    ? {
        stack: [
          {
            text: isBilingual ? t('device', 'DEVICE') : 'DEVICE',
            fontSize: 7,
            color: PDF_COLORS.textMuted,
            margin: [0, 0, 0, 2],
          },
          {
            text: `${safeString(deviceSummary.brand)} ${safeString(deviceSummary.model)}`,
            fontSize: 10,
            bold: true,
            color: PDF_COLORS.text,
            margin: [0, 0, 0, 2],
          },
          {
            columns: [
              {
                columns: [
                  {
                    svg: getDeviceIconSvg(deviceSummary.device_type),
                    width: 10,
                    height: 10,
                    margin: [0, 0, 0, 0]
                  },
                  {
                    text: safeString(deviceSummary.device_type),
                    fontSize: 8,
                    color: PDF_COLORS.textLight,
                    width: 'auto'
                  },
                ],
                columnGap: 4,
                width: 'auto'
              },
              deviceSummary.capacity
                ? {
                    text: deviceSummary.capacity,
                    fontSize: 8,
                    color: PDF_COLORS.textLight,
                    alignment: 'right',
                  }
                : { text: '' },
            ],
          },
          devices.length > 1
            ? {
                text: `+ ${devices.length - 1} more device(s)`,
                fontSize: 8,
                color: PDF_COLORS.primary,
                italics: true,
                margin: [0, 3, 0, 0],
              }
            : { text: '' },
        ],
        margin: [0, 0, 0, 10],
      }
    : { text: '' };

  const serviceSection: Content = {
    stack: [
      {
        text: isBilingual ? t('service', 'SERVICE') : 'SERVICE',
        fontSize: 7,
        color: PDF_COLORS.textMuted,
        margin: [0, 0, 0, 2],
      },
      {
        text: safeString(caseData.service_type?.name),
        fontSize: 10,
        color: PDF_COLORS.text,
      },
    ],
    margin: [0, 0, 0, 10],
  };

  const qrSection: Content = qrCodeBase64
    ? {
        columns: [
          {
            stack: [
              {
                text: isBilingual ? t('status', 'STATUS') : 'STATUS',
                fontSize: 7,
                color: PDF_COLORS.textMuted,
                margin: [0, 0, 0, 2],
              },
              {
                text: caseData.status?.replace(/_/g, ' ').toUpperCase() || 'PENDING',
                fontSize: 10,
                bold: true,
                color: PDF_COLORS.text,
              },
            ],
            width: '*',
          },
          {
            stack: [
              {
                image: qrCodeBase64,
                width: 50,
                alignment: 'right',
              },
              {
                text: qrCaption,
                fontSize: 6,
                color: PDF_COLORS.textMuted,
                alignment: 'right',
                margin: [0, 2, 0, 0],
              },
            ],
            width: 60,
          },
        ],
      }
    : {
        stack: [
          {
            text: isBilingual ? t('status', 'STATUS') : 'STATUS',
            fontSize: 7,
            color: PDF_COLORS.textMuted,
            margin: [0, 0, 0, 2],
          },
          {
            text: caseData.status?.replace(/_/g, ' ').toUpperCase() || 'PENDING',
            fontSize: 10,
            bold: true,
            color: PDF_COLORS.text,
          },
        ],
      };

  return {
    pageSize: { width: 283, height: 425 },
    pageMargins: [15, 15, 15, 15],
    defaultStyle: {
      font: fontFamily,
    },
    styles: getStylesWithFont(fontFamily),
    content: [
      headerContent,
      caseNumberSection,
      dateSection,
      divider,
      customerSection,
      deviceSection,
      serviceSection,
      qrSection,
    ],
  };
}
