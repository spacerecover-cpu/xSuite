import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import type { TranslationContext } from '../types';
import {
  PDF_COLORS,
  getStylesWithFont,
  createBilingualInfoBox,
  createBilingualSectionHeader,
} from '../styles';
import { formatDate, buildCompanyAddressLines, safeString } from '../utils';
import { getGeneralIconSvg } from '../../deviceIconMapper';
import { buildLogoNode } from '../brandingImage';

export interface ReportData {
  report: {
    id: string;
    case_id: string;
    report_number: string;
    report_type: string;
    title: string;
    status: string;
    version_number: number;
    created_at: string;
    created_by?: string;
    approved_by?: string;
    approved_at?: string;
    version_notes?: string;
  };
  sections: Array<{
    id: string;
    section_key: string;
    section_title: string;
    section_content: string;
    section_order: number;
  }>;
  caseData?: {
    case_number: string;
    case_no?: string;
    customer_name: string;
    customer_email?: string;
    customer_phone?: string;
    customer_company?: string;
    company_name?: string;
    client_reference?: string;
    service_type?: string;
    assigned_engineer?: string;
    created_at: string;
  };
  customerData?: {
    customer_name: string;
    email?: string;
    mobile_number?: string;
    company_name?: string;
  };
  deviceData?: {
    device_type?: string;
    brand?: string;
    model?: string;
    capacity?: string;
    serial_number?: string;
    interface?: string;
    condition?: string;
  };
  diagnosticsData?: {
    device_type_category?: string;
    heads_status?: string;
    pcb_status?: string;
    motor_status?: string;
    surface_status?: string;
    controller_status?: string;
    memory_chips_status?: string;
    controller_model?: string;
    nand_type?: string;
    physical_damage_notes?: string;
  };
  chainOfCustodyEvents?: Array<{
    event_type: string;
    event_date: string;
    event_timestamp?: string;
    event_description?: string;
    from_party?: string;
    to_party?: string;
    location?: string;
    notes?: string;
    actor?: {
      full_name?: string;
    };
  }>;
  companySettings: {
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
      qr_code_general_url?: string;
      qr_code_general_caption?: string;
    };
    online_presence?: {
      website?: string;
      facebook?: string;
      twitter?: string;
      linkedin?: string;
      instagram?: string;
    };
    legal_compliance?: {
      terms_conditions_url?: string;
    };
    localization?: {
      document_language_settings?: {
        mode: 'english_only' | 'bilingual';
        secondary_language: string | null;
        language_name: string | null;
      };
    };
  };
  preparedByName?: string;
}

export function buildReportDocument(
  data: ReportData,
  ctx: TranslationContext,
  logoBase64?: string | null,
  qrCodeBase64?: string | null,
  qrCodeCaption?: string | null
): TDocumentDefinitions {
  const { report, sections, caseData, customerData, deviceData, diagnosticsData, chainOfCustodyEvents, companySettings, preparedByName } = data;
  const { t, isBilingual, fontFamily } = ctx;

  const finalQrCodeCaption = qrCodeCaption || 'Scan for more information';

  const companyName = companySettings.basic_info?.company_name || 'Company Name';
  const legalName = companySettings.basic_info?.legal_name || companyName;
  const addressLines = buildCompanyAddressLines(companySettings.location);

  // Build contact info without labels
  const contactLines: string[] = [];
  if (companySettings.contact_info?.phone_primary) {
    contactLines.push(companySettings.contact_info.phone_primary);
  }
  if (companySettings.contact_info?.email_general) {
    contactLines.push(companySettings.contact_info.email_general);
  }

  const headerContent: Content[] = [];

  // Header with logo and company details
  const reportLogoNode = buildLogoNode(logoBase64, { width: 130, margin: [0, 0, 0, 5] });
  if (reportLogoNode) {
    headerContent.push({
      columns: [
        reportLogoNode,
        {
          stack: [
            { text: legalName, fontSize: 14, bold: true, color: PDF_COLORS.text, alignment: 'right' },
            ...addressLines.map((line, index) => ({
              text: line,
              fontSize: 8,
              color: PDF_COLORS.textLight,
              alignment: 'right' as const,
              margin: [0, index === 0 ? 2 : 0, 0, 0] as [number, number, number, number],
              lineHeight: 1.1,
            })),
            ...contactLines.map((line, index) => ({
              text: line,
              fontSize: 8,
              color: PDF_COLORS.textLight,
              alignment: 'right' as const,
              margin: [0, index === 0 ? 0 : 0, 0, 0] as [number, number, number, number],
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
        ...addressLines.map((line, index) => ({
          text: line,
          fontSize: 8,
          color: PDF_COLORS.textLight,
          alignment: 'center' as const,
          margin: [0, index === 0 ? 2 : 0, 0, 0] as [number, number, number, number],
          lineHeight: 1.1,
        })),
        ...contactLines.map((line, index) => ({
          text: line,
          fontSize: 8,
          color: PDF_COLORS.textLight,
          alignment: 'center' as const,
          margin: [0, index === 0 ? 0 : 0, 0, 0] as [number, number, number, number],
          lineHeight: 1.1,
        })),
      ],
      margin: [0, 0, 0, 12],
    });
  }

  // Header divider line
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

  // Document title
  const reportTypeTitle = getReportTypeTitle(report.report_type, t, isBilingual);
  headerContent.push({
    text: reportTypeTitle,
    fontSize: 16,
    bold: true,
    color: PDF_COLORS.primaryDark,
    alignment: 'center',
    margin: [0, 0, 0, 6],
  });

  // Customer Information and Report Details boxes
  const customerName = customerData?.customer_name || caseData?.customer_name || 'N/A';
  const companyNameValue = customerData?.company_name || caseData?.company_name || caseData?.customer_company;
  const customerEmail = customerData?.email || caseData?.customer_email || 'N/A';
  const customerPhone = customerData?.mobile_number || caseData?.customer_phone || 'N/A';
  const clientReference = caseData?.client_reference;

  const labelWidth = isBilingual ? 130 : 70;

  const customerInfoContent: object[] = [
    createInfoRow(t('nameLabel', 'Name:'), customerName, labelWidth),
    createInfoRow(t('companyLabel', 'Company:'), companyNameValue, labelWidth),
    createInfoRow(t('phoneLabel', 'Phone:'), customerPhone, labelWidth),
    createInfoRow(t('emailLabel', 'Email:'), customerEmail, labelWidth),
    createInfoRow(t('referenceLabel', 'Reference:'), clientReference, labelWidth),
  ];

  const reportDetailsContent: object[] = [
    createInfoRow(t('caseIdLabel', 'Case ID:'), caseData?.case_no, labelWidth),
    createInfoRow(t('reportNoLabel', 'Report No:'), report.report_number || 'Draft', labelWidth),
    createInfoRow(t('serviceLabel', 'Service:'), caseData?.service_type, labelWidth),
    createInfoRow(t('preparedByLabel', 'Prepared By:'), preparedByName || 'N/A', labelWidth),
    createInfoRow(t('createdDateLabel', 'Created Date:'), formatDate(report.created_at, 'dd MMM yyyy'), labelWidth),
  ];

  const customerInfoTitle = isBilingual
    ? `Customer Information | ${t('customerInformation', '').split(' | ')[1] || 'معلومات العميل'}`
    : 'Customer Information';
  const reportDetailsTitle = isBilingual
    ? `Report Details | ${t('reportDetails', '').split(' | ')[1] || 'تفاصيل التقرير'}`
    : 'Report Details';

  const userIconSvg = getGeneralIconSvg('user');
  const fileIconSvg = getGeneralIconSvg('fileText');

  const infoBoxesSection: Content = {
    columns: [
      {
        width: '50%',
        stack: [createBilingualInfoBox(customerInfoTitle, null, customerInfoContent, userIconSvg) as Content],
      },
      { width: 8, text: '' },
      {
        width: '50%',
        stack: [createBilingualInfoBox(reportDetailsTitle, null, reportDetailsContent, fileIconSvg) as Content],
      },
    ],
    margin: [0, 0, 0, 8],
  };

  const bodyContent: Content[] = [infoBoxesSection];

  // Media Details Section (if device data exists)
  if (deviceData) {
    const mediaDetailsTitle = isBilingual
      ? `Media Details | ${t('mediaDetails', '').split(' | ')[1] || 'تفاصيل الوسائط'}`
      : 'Media Details';

    const hardDriveIconSvg = getGeneralIconSvg('fileText');
    const mediaDetailsHeader: Content = createBilingualSectionHeader(mediaDetailsTitle, null, hardDriveIconSvg) as Content;

    const typeLabel = isBilingual ? (t('type', '').split(' | ')[1] ? `Type | ${t('type', '').split(' | ')[1]}` : 'Type') : 'Type';
    const modelLabel = isBilingual ? (t('model', '').split(' | ')[1] ? `Model | ${t('model', '').split(' | ')[1]}` : 'Model') : 'Model';
    const capacityLabel = isBilingual ? (t('capacity', '').split(' | ')[1] ? `Capacity | ${t('capacity', '').split(' | ')[1]}` : 'Capacity') : 'Capacity';
    const serialLabel = isBilingual ? (t('serialNumber', '').split(' | ')[1] ? `Serial No | ${t('serialNumber', '').split(' | ')[1]}` : 'Serial No') : 'Serial No';

    const deviceInfoParts: string[] = [];
    if (deviceData.device_type) deviceInfoParts.push(`${typeLabel}: ${deviceData.device_type}`);
    if (deviceData.model) deviceInfoParts.push(`${modelLabel}: ${deviceData.model}`);
    if (deviceData.capacity) deviceInfoParts.push(`${capacityLabel}: ${deviceData.capacity}`);
    if (deviceData.serial_number) deviceInfoParts.push(`${serialLabel}: ${deviceData.serial_number}`);

    const deviceInfoText = deviceInfoParts.join(' | ');

    const mediaDetailsContent: Content[] = [
      mediaDetailsHeader,
      {
        text: deviceInfoText,
        fontSize: 8,
        color: PDF_COLORS.text,
        margin: [0, 3, 0, 0],
      },
    ];

    // Add diagnostics if available
    if (diagnosticsData) {
      const diagnosticsTitle = isBilingual
        ? `Component Diagnostics | تشخيص المكونات`
        : 'Component Diagnostics';

      mediaDetailsContent.push(
        { text: diagnosticsTitle, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 6, 0, 3] }
      );

      const diagnosticsParts: string[] = [];
      if (diagnosticsData.device_type_category === 'hdd') {
        if (diagnosticsData.heads_status) diagnosticsParts.push(`Heads: ${diagnosticsData.heads_status}`);
        if (diagnosticsData.pcb_status) diagnosticsParts.push(`PCB: ${diagnosticsData.pcb_status}`);
        if (diagnosticsData.motor_status) diagnosticsParts.push(`Motor: ${diagnosticsData.motor_status}`);
        if (diagnosticsData.surface_status) diagnosticsParts.push(`Surface: ${diagnosticsData.surface_status}`);
      } else if (diagnosticsData.device_type_category === 'ssd') {
        if (diagnosticsData.controller_status) diagnosticsParts.push(`Controller: ${diagnosticsData.controller_status}`);
        if (diagnosticsData.memory_chips_status) diagnosticsParts.push(`Memory Chips: ${diagnosticsData.memory_chips_status}`);
        if (diagnosticsData.controller_model) diagnosticsParts.push(`Controller Model: ${diagnosticsData.controller_model}`);
        if (diagnosticsData.nand_type) diagnosticsParts.push(`NAND Type: ${diagnosticsData.nand_type}`);
      }

      if (diagnosticsParts.length > 0) {
        mediaDetailsContent.push({
          text: diagnosticsParts.join(' | '),
          fontSize: 8,
          color: PDF_COLORS.text,
          margin: [0, 0, 0, 3],
        });
      }

      if (diagnosticsData.physical_damage_notes) {
        const physicalDamageLabel = isBilingual
          ? (t('physicalDamageNotesLabel', '').split(' | ')[1]
              ? `Physical Damage Notes | ${t('physicalDamageNotesLabel', '').split(' | ')[1].replace(/:$/, '')}`
              : 'Physical Damage Notes')
          : 'Physical Damage Notes';
        mediaDetailsContent.push({
          text: `${physicalDamageLabel}: ${diagnosticsData.physical_damage_notes}`,
          fontSize: 8,
          color: PDF_COLORS.text,
          margin: [0, 3, 0, 0],
        });
      }
    }

    bodyContent.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: mediaDetailsContent,
              fillColor: PDF_COLORS.background,
              margin: [6, 5, 6, 6],
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
      margin: [0, 0, 0, 8],
    });
  }

  // Report Sections
  const visibleSections = sections.filter(section => {
    if (section.section_key === 'chain_of_custody') {
      return chainOfCustodyEvents && chainOfCustodyEvents.length > 0;
    }
    const content = section.section_content?.trim();
    return content && content.length > 0;
  });

  visibleSections.forEach(section => {
    const sectionTitle = getSectionTitle(section.section_key, section.section_title, t, isBilingual);

    if (section.section_key === 'chain_of_custody' && chainOfCustodyEvents && chainOfCustodyEvents.length > 0) {
      // Chain of Custody special handling
      const cocContent: Content[] = [
        {
          text: sectionTitle,
          fontSize: 10,
          bold: true,
          color: PDF_COLORS.text,
          margin: [0, 0, 0, 5],
        },
      ];

      chainOfCustodyEvents.forEach(event => {
        cocContent.push({
          stack: [
            {
              columns: [
                { text: event.event_type, fontSize: 8, bold: true, color: PDF_COLORS.text, width: '*' },
                { text: formatDate(event.event_timestamp || event.event_date, 'dd MMM yyyy, HH:mm'), fontSize: 8, color: PDF_COLORS.textLight, alignment: 'right', width: 'auto' },
              ],
              margin: [0, 0, 0, 2],
            },
            { text: event.event_description || '-', fontSize: 8, color: PDF_COLORS.text, margin: [0, 0, 0, 1] },
            event.actor ? { text: `By: ${event.actor.full_name || 'Unknown'}`, fontSize: 7, color: PDF_COLORS.textLight, margin: [0, 1, 0, 0] } : { text: '' },
          ],
          fillColor: PDF_COLORS.background,
          margin: [6, 4, 6, 4],
        } as Content);
      });

      bodyContent.push({
        table: {
          widths: ['*'],
          body: [[{ stack: cocContent, margin: [8, 6, 8, 6] }]],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => PDF_COLORS.border,
          vLineColor: () => PDF_COLORS.border,
        },
        margin: [0, 0, 0, 8],
      });
    } else {
      // Regular content section
      const cleanContent = stripHtmlTags(section.section_content);

      bodyContent.push({
        table: {
          widths: ['*'],
          body: [
            [
              {
                text: sectionTitle,
                fontSize: 10,
                bold: true,
                color: PDF_COLORS.text,
                fillColor: PDF_COLORS.background,
                margin: [6, 5, 6, 5],
              },
            ],
            [
              {
                text: cleanContent,
                fontSize: 8,
                color: PDF_COLORS.text,
                margin: [8, 6, 8, 6],
                lineHeight: 1.4,
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
        margin: [0, 0, 0, 8],
      });
    }
  });

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
      ...bodyContent,
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

function createInfoRow(label: string, value: string | undefined | null, labelWidth: number = 70): object {
  return {
    columns: [
      { text: label, fontSize: 8, color: PDF_COLORS.textLight, width: labelWidth },
      { text: safeString(value), fontSize: 9, color: PDF_COLORS.text, width: '*' },
    ],
    margin: [0, 0, 0, 2],
  };
}

function getReportTypeTitle(reportType: string, _t: (key: string, fallback: string) => string, isBilingual: boolean): string {
  const translationMap: Record<string, { key: string, fallback: string, arabic: string }> = {
    evaluation: { key: 'evaluationReport', fallback: 'EVALUATION REPORT', arabic: 'تقرير التقييم' },
    service: { key: 'serviceReport', fallback: 'SERVICE REPORT', arabic: 'تقرير الخدمة' },
    server: { key: 'serverReport', fallback: 'SERVER RECOVERY REPORT', arabic: 'تقرير استعادة الخادم' },
    malware: { key: 'malwareReport', fallback: 'MALWARE ANALYSIS REPORT', arabic: 'تقرير تحليل البرامج الضارة' },
    forensic: { key: 'forensicReport', fallback: 'FORENSIC ANALYSIS REPORT', arabic: 'تقرير التحليل الجنائي' },
    data_destruction: { key: 'dataDestructionReport', fallback: 'DATA DESTRUCTION CERTIFICATE', arabic: 'شهادة تدمير البيانات' },
    prevention: { key: 'preventionReport', fallback: 'PREVENTION & STRATEGY REPORT', arabic: 'تقرير الوقاية والاستراتيجية' },
  };

  const mapping = translationMap[reportType];
  if (!mapping) return reportType.toUpperCase();

  if (isBilingual) {
    return `${mapping.fallback} | ${mapping.arabic}`;
  }

  return mapping.fallback;
}

function getSectionTitle(sectionKey: string, defaultTitle: string, _t: (key: string, fallback: string) => string, isBilingual: boolean): string {
  const translationMap: Record<string, { key: string, arabic: string }> = {
    diagnostic_findings: { key: 'diagnosticFindings', arabic: 'نتائج التشخيص' },
    proposed_solutions: { key: 'proposedSolutions', arabic: 'الحلول المقترحة' },
    proposed_solution: { key: 'proposedSolutions', arabic: 'الحلول المقترحة' },
    recovery_time: { key: 'estimatedRecoveryTime', arabic: 'وقت الاسترداد المقدر' },
    estimated_recovery_time: { key: 'estimatedRecoveryTime', arabic: 'وقت الاسترداد المقدر' },
    failure_cause_analysis: { key: 'failureCauseAnalysis', arabic: 'تحليل سبب الفشل' },
    non_recovery_reasons: { key: 'nonRecoveryReasons', arabic: 'أسباب عدم الاسترداد' },
    actions_taken: { key: 'actionsTaken', arabic: 'الإجراءات المتخذة' },
    service_important_notes: { key: 'serviceImportantNotes', arabic: 'ملاحظات مهمة' },
    service_recommendations: { key: 'serviceRecommendations', arabic: 'التوصيات' },
    important_notes: { key: 'importantNotes', arabic: 'ملاحظات مهمة' },
    recommendations: { key: 'recommendations', arabic: 'التوصيات' },
    chain_of_custody: { key: 'chainOfCustody', arabic: 'سلسلة الحراسة' },
  };

  const mapping = translationMap[sectionKey];
  if (!mapping) return defaultTitle;

  if (isBilingual) {
    return `${defaultTitle} | ${mapping.arabic}`;
  }

  return defaultTitle;
}

function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}
