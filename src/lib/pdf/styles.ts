import type { StyleDictionary } from 'pdfmake/interfaces';

export const PDF_COLORS = {
  // Fixed Royal-brand navy. PDFs are intentionally non-themed (one color for
  // all tenants); aligned to the default Royal primary so documents read as
  // branded. See DESIGN.md → Non-Themed Surfaces / Decisions Log.
  primary: '#162660',
  primaryDark: '#1E3A5F',
  secondary: '#10b981',
  accent: '#f59e0b',
  text: '#1e293b',
  textLight: '#64748b',
  textMuted: '#94a3b8',
  border: '#e2e8f0',
  background: '#f8fafc',
  headerBg: '#F1F5F9',
  white: '#ffffff',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  patientBg: '#FEF2F2',
  patientText: '#DC2626',
  backupBg: '#EFF6FF',
  backupText: '#2563EB',
  sourceBg: '#F0FDF4',
  sourceText: '#16A34A',
  donorBg: '#FFFBEB',
  donorText: '#D97706',
};

export const DEFAULT_FONT = 'Roboto';

export const PDF_STYLES: StyleDictionary = {
  header: {
    font: DEFAULT_FONT,
    fontSize: 20,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 0, 0, 10],
  },
  subheader: {
    font: DEFAULT_FONT,
    fontSize: 14,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 10, 0, 5],
  },
  documentTitle: {
    font: DEFAULT_FONT,
    fontSize: 16,
    bold: true,
    color: PDF_COLORS.primary,
    alignment: 'center' as const,
    margin: [0, 0, 0, 5],
  },
  documentSubtitle: {
    font: DEFAULT_FONT,
    fontSize: 10,
    color: PDF_COLORS.textLight,
    alignment: 'center' as const,
    margin: [0, 0, 0, 8],
  },
  sectionTitle: {
    font: DEFAULT_FONT,
    fontSize: 10,
    bold: true,
    color: PDF_COLORS.text,
    fillColor: PDF_COLORS.background,
    margin: [4, 5, 4, 5],
  },
  label: {
    font: DEFAULT_FONT,
    fontSize: 8,
    color: PDF_COLORS.textLight,
    margin: [0, 1, 0, 1],
  },
  value: {
    font: DEFAULT_FONT,
    fontSize: 9,
    color: PDF_COLORS.text,
    margin: [0, 1, 0, 1],
  },
  valueBold: {
    font: DEFAULT_FONT,
    fontSize: 9,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 1, 0, 1],
  },
  tableHeader: {
    font: DEFAULT_FONT,
    fontSize: 8,
    bold: true,
    color: PDF_COLORS.white,
    fillColor: PDF_COLORS.primary,
    alignment: 'center' as const,
    margin: [2, 4, 2, 4],
  },
  tableCell: {
    font: DEFAULT_FONT,
    fontSize: 8,
    color: PDF_COLORS.text,
    margin: [2, 3, 2, 3],
  },
  tableCellCenter: {
    font: DEFAULT_FONT,
    fontSize: 8,
    color: PDF_COLORS.text,
    alignment: 'center' as const,
    margin: [2, 3, 2, 3],
  },
  tableCellRight: {
    font: DEFAULT_FONT,
    fontSize: 8,
    color: PDF_COLORS.text,
    alignment: 'right' as const,
    margin: [2, 3, 2, 3],
  },
  footer: {
    font: DEFAULT_FONT,
    fontSize: 8,
    color: PDF_COLORS.textMuted,
    alignment: 'center' as const,
    margin: [0, 10, 0, 0],
  },
  termsTitle: {
    font: DEFAULT_FONT,
    fontSize: 9,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 8, 0, 3],
  },
  termsText: {
    font: DEFAULT_FONT,
    fontSize: 7,
    color: PDF_COLORS.textLight,
    margin: [0, 1, 0, 1],
    lineHeight: 1.2,
  },
  signatureLabel: {
    font: DEFAULT_FONT,
    fontSize: 8,
    color: PDF_COLORS.textLight,
    margin: [0, 3, 0, 0],
  },
  signatureLine: {
    font: DEFAULT_FONT,
    fontSize: 9,
    color: PDF_COLORS.text,
    margin: [0, 25, 0, 5],
  },
  caseNumber: {
    font: DEFAULT_FONT,
    fontSize: 24,
    bold: true,
    color: PDF_COLORS.primary,
    alignment: 'center' as const,
  },
  priorityBadge: {
    font: DEFAULT_FONT,
    fontSize: 10,
    bold: true,
    color: PDF_COLORS.white,
    alignment: 'center' as const,
    margin: [5, 3, 5, 3],
  },
  companyName: {
    font: DEFAULT_FONT,
    fontSize: 14,
    bold: true,
    color: PDF_COLORS.text,
  },
  companyTagline: {
    font: DEFAULT_FONT,
    fontSize: 9,
    color: PDF_COLORS.textLight,
    italics: true,
  },
  companyContact: {
    font: DEFAULT_FONT,
    fontSize: 8,
    color: PDF_COLORS.textLight,
  },
  totalLabel: {
    font: DEFAULT_FONT,
    fontSize: 10,
    bold: true,
    color: PDF_COLORS.text,
    alignment: 'right' as const,
  },
  totalValue: {
    font: DEFAULT_FONT,
    fontSize: 12,
    bold: true,
    color: PDF_COLORS.primary,
    alignment: 'right' as const,
  },
  watermark: {
    font: DEFAULT_FONT,
    fontSize: 60,
    color: '#e2e8f0',
    opacity: 0.3,
    bold: true,
  },
  jobIdBadge: {
    font: DEFAULT_FONT,
    fontSize: 10,
    bold: true,
    color: PDF_COLORS.white,
    alignment: 'center' as const,
  },
  infoBoxHeader: {
    font: DEFAULT_FONT,
    fontSize: 9,
    bold: true,
    color: PDF_COLORS.text,
    fillColor: PDF_COLORS.background,
    margin: [6, 5, 6, 5],
  },
  roleBadge: {
    font: DEFAULT_FONT,
    fontSize: 7,
    bold: true,
    alignment: 'center' as const,
  },
  footerTagline: {
    font: DEFAULT_FONT,
    fontSize: 10,
    bold: true,
    color: PDF_COLORS.primary,
    alignment: 'center' as const,
  },
  registeredBy: {
    font: DEFAULT_FONT,
    fontSize: 8,
    color: PDF_COLORS.textMuted,
    alignment: 'center' as const,
  },
  socialLink: {
    font: DEFAULT_FONT,
    fontSize: 8,
    color: PDF_COLORS.textLight,
  },
  bilingualHeader: {
    font: DEFAULT_FONT,
    fontSize: 9,
    bold: true,
    color: PDF_COLORS.text,
  },
};

export function getStylesWithFont(fontFamily: string): StyleDictionary {
  return {
    header: { ...PDF_STYLES.header, font: fontFamily },
    subheader: { ...PDF_STYLES.subheader, font: fontFamily },
    documentTitle: { ...PDF_STYLES.documentTitle, font: fontFamily },
    documentSubtitle: { ...PDF_STYLES.documentSubtitle, font: fontFamily },
    sectionTitle: { ...PDF_STYLES.sectionTitle, font: fontFamily },
    label: { ...PDF_STYLES.label, font: fontFamily },
    value: { ...PDF_STYLES.value, font: fontFamily },
    valueBold: { ...PDF_STYLES.valueBold, font: fontFamily },
    tableHeader: { ...PDF_STYLES.tableHeader, font: fontFamily },
    tableCell: { ...PDF_STYLES.tableCell, font: fontFamily },
    tableCellCenter: { ...PDF_STYLES.tableCellCenter, font: fontFamily },
    tableCellRight: { ...PDF_STYLES.tableCellRight, font: fontFamily },
    footer: { ...PDF_STYLES.footer, font: fontFamily },
    termsTitle: { ...PDF_STYLES.termsTitle, font: fontFamily },
    termsText: { ...PDF_STYLES.termsText, font: fontFamily },
    signatureLabel: { ...PDF_STYLES.signatureLabel, font: fontFamily },
    signatureLine: { ...PDF_STYLES.signatureLine, font: fontFamily },
    caseNumber: { ...PDF_STYLES.caseNumber, font: fontFamily },
    priorityBadge: { ...PDF_STYLES.priorityBadge, font: fontFamily },
    companyName: { ...PDF_STYLES.companyName, font: fontFamily },
    companyTagline: { ...PDF_STYLES.companyTagline, font: fontFamily },
    companyContact: { ...PDF_STYLES.companyContact, font: fontFamily },
    totalLabel: { ...PDF_STYLES.totalLabel, font: fontFamily },
    totalValue: { ...PDF_STYLES.totalValue, font: fontFamily },
    watermark: { ...PDF_STYLES.watermark, font: fontFamily },
    jobIdBadge: { ...PDF_STYLES.jobIdBadge, font: fontFamily },
    infoBoxHeader: { ...PDF_STYLES.infoBoxHeader, font: fontFamily },
    roleBadge: { ...PDF_STYLES.roleBadge, font: fontFamily },
    footerTagline: { ...PDF_STYLES.footerTagline, font: fontFamily },
    registeredBy: { ...PDF_STYLES.registeredBy, font: fontFamily },
    socialLink: { ...PDF_STYLES.socialLink, font: fontFamily },
    bilingualHeader: { ...PDF_STYLES.bilingualHeader, font: fontFamily },
  };
}

export function createSectionHeader(title: string, secondaryTitle?: string, iconSvg?: string): object {
  const text = secondaryTitle ? `${title} | ${secondaryTitle}` : title;

  if (iconSvg) {
    return {
      columns: [
        { svg: iconSvg, width: 13, height: 13, margin: [0, 0, 0, 0] },
        { text, style: 'sectionTitle', width: '*' },
      ],
      columnGap: 6,
      margin: [0, 5, 0, 3],
    };
  }

  return {
    text,
    style: 'sectionTitle',
    margin: [0, 5, 0, 3],
  };
}

export function createLabelValuePair(
  label: string,
  value: string | number | null | undefined,
  options?: { bold?: boolean; labelWidth?: number }
): object {
  return {
    columns: [
      {
        text: label,
        style: 'label',
        width: options?.labelWidth || 70,
      },
      {
        text: String(value ?? '-'),
        style: options?.bold ? 'valueBold' : 'value',
        width: '*',
      },
    ],
    margin: [0, 1, 0, 1],
  };
}

export function createDivider(): object {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 515,
        y2: 0,
        lineWidth: 0.5,
        lineColor: PDF_COLORS.border,
      },
    ],
    margin: [0, 6, 0, 6],
  };
}

export function createSignatureBlock(label: string): object {
  return {
    stack: [
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 28,
            x2: 160,
            y2: 28,
            lineWidth: 0.5,
            lineColor: PDF_COLORS.textLight,
          },
        ],
      },
      {
        text: label,
        style: 'signatureLabel',
        margin: [0, 3, 0, 0],
      },
    ],
    width: 180,
  };
}

export function createInfoBox(title: string, content: any[]): object {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: title,
            style: 'sectionTitle',
            border: [true, true, true, false],
          },
        ],
        [
          {
            stack: content,
            margin: [5, 3, 5, 5],
            border: [true, false, true, true],
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
    margin: [0, 0, 0, 6],
  };
}

export function createTableSectionHeader(title: string, columnCount: number): any {
  return {
    text: title,
    style: 'sectionTitle',
    colSpan: columnCount,
    fillColor: PDF_COLORS.primary,
    alignment: 'left',
  };
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    normal: '#2563eb',
    low: '#16a34a',
  };
  return colors[priority?.toLowerCase()] || PDF_COLORS.primary;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: '#f59e0b',
    in_progress: '#3b82f6',
    completed: '#22c55e',
    cancelled: '#ef4444',
    on_hold: '#6b7280',
    delivered: '#10b981',
  };
  return colors[status?.toLowerCase()] || PDF_COLORS.textLight;
}

export function createJobIdBadge(jobId: string): object {
  return {
    table: {
      widths: ['auto'],
      body: [
        [
          {
            text: `Job ID: ${jobId}`,
            style: 'jobIdBadge',
            fillColor: PDF_COLORS.primary,
            margin: [20, 6, 20, 6],
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
    alignment: 'center',
    margin: [0, 8, 0, 12],
  };
}

export function getRoleBadgeColors(role: string | null | undefined): { bg: string; text: string } {
  const normalizedRole = (role || '').toLowerCase();
  if (normalizedRole.includes('patient') || normalizedRole === 'source') {
    return { bg: PDF_COLORS.patientBg, text: PDF_COLORS.patientText };
  }
  if (normalizedRole.includes('backup') || normalizedRole === 'clone') {
    return { bg: PDF_COLORS.backupBg, text: PDF_COLORS.backupText };
  }
  if (normalizedRole.includes('donor')) {
    return { bg: PDF_COLORS.donorBg, text: PDF_COLORS.donorText };
  }
  if (normalizedRole.includes('spare')) {
    return { bg: PDF_COLORS.sourceBg, text: PDF_COLORS.sourceText };
  }
  return { bg: PDF_COLORS.background, text: PDF_COLORS.textLight };
}

export function getSimpleRoleLabel(role: string | null | undefined): string {
  if (!role) return '-';
  const normalizedRole = role.toLowerCase();
  if (normalizedRole.includes('patient') || normalizedRole === 'source') return 'Patient';
  if (normalizedRole.includes('backup') || normalizedRole === 'clone') return 'Backup';
  if (normalizedRole.includes('donor')) return 'Donor';
  if (normalizedRole.includes('spare')) return 'Spare';
  return role;
}

export function createBilingualInfoBox(
  englishTitle: string,
  arabicTitle: string | null,
  content: object[],
  iconSvg?: string
): object {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            columns: [
              iconSvg ? { svg: iconSvg, width: 13, height: 13, margin: [0, 0, 0, 0] } : { text: '', width: 0 },
              { text: englishTitle, style: 'bilingualHeader', width: 'auto' },
              { text: '', width: '*' },
              arabicTitle ? { text: arabicTitle, style: 'bilingualHeader', alignment: 'right', width: 'auto' } : { text: '', width: 0 },
            ],
            columnGap: 6,
            fillColor: PDF_COLORS.background,
            margin: [6, 4, 6, 4],
          },
        ],
        [
          {
            stack: content,
            margin: [8, 5, 8, 6],
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
  };
}

export function createBilingualSectionHeader(
  englishTitle: string,
  arabicTitle: string | null,
  iconSvg?: string
): object {
  return {
    columns: [
      iconSvg ? { svg: iconSvg, width: 13, height: 13, margin: [0, 0, 0, 0] } : { text: '', width: 0 },
      { text: englishTitle, style: 'bilingualHeader', width: 'auto' },
      { text: '', width: '*' },
      arabicTitle ? { text: arabicTitle, style: 'bilingualHeader', alignment: 'right', width: 'auto' } : { text: '', width: 0 },
    ],
    columnGap: 6,
    margin: [0, 4, 0, 5],
  };
}

export function createTermsBox(
  englishTitle: string,
  translatedTitle: string | null,
  englishTerms: string,
  translatedTerms: string | null,
  policyUrl?: string | null
): object {
  const englishContent: object[] = [
    { text: englishTitle, bold: true, fontSize: 9, margin: [0, 0, 0, 3] },
    { text: englishTerms, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.2 },
  ];

  if (policyUrl) {
    englishContent.push({
      text: policyUrl,
      fontSize: 7,
      color: PDF_COLORS.primary,
      link: policyUrl,
      margin: [0, 3, 0, 0],
    } as object);
  }

  const translatedContent: object[] = translatedTerms && translatedTitle ? [
    { text: translatedTitle, bold: true, fontSize: 9, alignment: 'right', margin: [0, 0, 0, 3] },
    { text: translatedTerms, fontSize: 7, color: PDF_COLORS.textLight, alignment: 'right', lineHeight: 1.2 },
  ] : [];

  if (policyUrl && translatedTerms) {
    translatedContent.push({
      text: policyUrl,
      fontSize: 7,
      color: PDF_COLORS.primary,
      link: policyUrl,
      alignment: 'right',
      margin: [0, 3, 0, 0],
    } as object);
  }

  return {
    table: {
      widths: translatedTerms ? ['55%', '45%'] : ['*'],
      body: [
        translatedTerms
          ? [
              { stack: englishContent, margin: [8, 6, 8, 6] },
              { stack: translatedContent, margin: [8, 6, 8, 6] },
            ]
          : [{ stack: englishContent, margin: [8, 6, 8, 6] }],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
    },
    margin: [0, 6, 0, 6],
  };
}

export function createRegisteredByLine(name: string): object {
  return {
    text: `Registered by: ${name}`,
    style: 'registeredBy',
    margin: [0, 12, 0, 8],
  };
}

export function createBilingualSignatureBlock(
  englishLabel: string,
  arabicLabel: string | null
): object {
  return {
    stack: [
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 28,
            x2: 180,
            y2: 28,
            lineWidth: 0.5,
            lineColor: PDF_COLORS.textLight,
          },
        ],
      },
      {
        text: arabicLabel ? `${englishLabel}\n${arabicLabel}` : englishLabel,
        style: 'signatureLabel',
        alignment: 'center',
        margin: [0, 3, 0, 0],
      },
    ],
    width: 200,
  };
}

export function createSocialFooter(
  onlinePresence: { website?: string; facebook?: string; twitter?: string; linkedin?: string; instagram?: string } | undefined,
  tagline?: string
): object {
  const socialItems: object[] = [];

  if (onlinePresence?.facebook) {
    socialItems.push({ text: 'Facebook', style: 'socialLink', margin: [0, 0, 12, 0] });
  }
  if (onlinePresence?.twitter) {
    socialItems.push({ text: 'X', style: 'socialLink', margin: [0, 0, 12, 0] });
  }
  if (onlinePresence?.linkedin) {
    socialItems.push({ text: 'LinkedIn', style: 'socialLink', margin: [0, 0, 12, 0] });
  }
  if (onlinePresence?.instagram) {
    socialItems.push({ text: 'Instagram', style: 'socialLink', margin: [0, 0, 0, 0] });
  }

  const footerContent: object[] = [];

  if (tagline) {
    footerContent.push({
      text: tagline,
      style: 'footerTagline',
      margin: [0, 0, 0, 1],
    });
  }

  if (onlinePresence?.website) {
    footerContent.push({
      text: onlinePresence.website,
      fontSize: 8,
      color: PDF_COLORS.textLight,
      alignment: 'center',
      margin: [0, 0, 0, 6],
    });
  }

  if (socialItems.length > 0) {
    footerContent.push({
      columns: [
        { text: '', width: '*' },
        ...socialItems,
        { text: '', width: '*' },
      ],
      alignment: 'center',
    });
  }

  return {
    stack: footerContent,
    margin: [0, 12, 0, 0],
  };
}
