import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { ChainOfCustodyDocumentData, TranslationContext } from '../types';
import { PDF_COLORS, getStylesWithFont, createBilingualSectionHeader } from '../styles';
import { formatDate, safeString } from '../utils';
import { formatDateTimeWithConfig } from '../../format';

const categoryColors: Record<string, string> = {
  creation: '#D1FAE5',
  modification: '#DBEAFE',
  access: '#E9D5FF',
  transfer: '#FED7AA',
  verification: '#CCFBF1',
  communication: '#E0E7FF',
  evidence_handling: '#CFFAFE',
  financial: '#D1FAE5',
  critical_event: '#FECACA',
};

function formatActionType(actionType: string): string {
  return actionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function padEntryNumber(num: number): string {
  return String(num).padStart(4, '0');
}

function buildHeaderSection(
  data: ChainOfCustodyDocumentData,
  ctx: TranslationContext
): Content {
  const { isBilingual, t } = ctx;
  const title = 'FORENSIC CHAIN OF CUSTODY REPORT';
  const arabicTitle = isBilingual ? (t('forensicChainOfCustodyReport', '').split(' | ')[1] || null) : null;
  const caseNumberLabel = t('caseNumber', 'Case Number');
  const generatedLabel = t('generatedLabel', 'Generated:');

  const headerRows: TableCell[][] = [
    [
      {
        stack: [
          {
            text: title,
            fontSize: 16,
            bold: true,
            color: PDF_COLORS.white,
            margin: [0, 0, 0, isBilingual && arabicTitle ? 2 : 0] as [number, number, number, number],
          },
          ...(isBilingual && arabicTitle
            ? [{ text: arabicTitle, fontSize: 12, bold: true, color: PDF_COLORS.white, alignment: 'right' as const }]
            : []),
          {
            columns: [
              { text: `${caseNumberLabel}: ${data.caseNumber}`, fontSize: 9, color: PDF_COLORS.white },
              { text: `${generatedLabel} ${formatDate(new Date().toISOString(), 'dd/MM/yyyy HH:mm')}`, fontSize: 9, color: PDF_COLORS.white, alignment: 'right' as const },
            ],
            margin: [0, 4, 0, 0] as [number, number, number, number],
          },
        ],
        fillColor: '#0E7490',
        margin: [10, 8, 10, 8] as [number, number, number, number],
      },
    ],
  ];

  return {
    table: {
      widths: ['*'],
      body: headerRows,
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };
}

function buildLegalNotice(ctx: TranslationContext): Content {
  const { t, isBilingual } = ctx;

  const legalText =
    'This Chain of Custody record is maintained for forensic and legal purposes. All entries are immutable ' +
    'and cryptographically secured. Unauthorized modification or tampering with evidence may result in legal consequences.';

  const translatedLegalText = isBilingual ? (t('legalNoticeText', '').split(' | ')[1] || null) : null;
  const legalNoticeTitle = isBilingual ? (t('legalNotice', '').split(' | ')[1] || null) : null;

  const contentStack: Content[] = [
    { text: isBilingual && legalNoticeTitle ? `LEGAL NOTICE | ${legalNoticeTitle}` : 'LEGAL NOTICE', fontSize: 8, bold: true, color: '#78350F', margin: [0, 0, 0, 3] as [number, number, number, number] },
    { text: legalText, fontSize: 7, color: '#78350F', lineHeight: 1.3 },
  ];

  if (isBilingual && translatedLegalText) {
    contentStack.push({ text: translatedLegalText, fontSize: 7, color: '#78350F', alignment: 'right' as const, margin: [0, 3, 0, 0] as [number, number, number, number], lineHeight: 1.3 });
  }

  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: contentStack,
            fillColor: '#FFF3CD',
            margin: [8, 6, 8, 6] as [number, number, number, number],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => '#FCD34D',
      vLineColor: () => '#FCD34D',
    },
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };
}

function buildSummarySection(
  data: ChainOfCustodyDocumentData,
  ctx: TranslationContext
): Content {
  const { entries } = data;
  const { t, isBilingual } = ctx;

  const categories = [...new Set(entries.map(e => e.action_category))];
  const actors = [...new Set(entries.map(e => e.actor_name))];

  let dateRange = '-';
  if (entries.length > 0) {
    const sortedByDate = [...entries].sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    );
    const first = formatDateTimeWithConfig(sortedByDate[0].occurred_at, data.dateTimeConfig ?? null, { withTz: true });
    const last = formatDateTimeWithConfig(sortedByDate[sortedByDate.length - 1].occurred_at, data.dateTimeConfig ?? null, { withTz: true });
    dateRange = `${first} - ${last}`;
  }

  const summaryArabic = isBilingual ? (t('summary', '').split(' | ')[1] || 'ملخص') : null;
  const summaryHeader = isBilingual
    ? createBilingualSectionHeader('Summary', summaryArabic)
    : { text: 'Summary', fontSize: 10, bold: true, color: '#1E40AF', margin: [0, 0, 0, 4] as [number, number, number, number] };

  const totalEntriesLabel = t('totalEntriesLabel', 'Total Entries:');
  const actionCategoriesLabel = t('actionCategoriesLabel', 'Action Categories:');
  const uniqueActorsLabel = t('uniqueActorsLabel', 'Unique Actors:');
  const dateRangeLabel = t('dateRangeLabel', 'Date Range:');

  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              summaryHeader as Content,
              {
                columns: [
                  {
                    stack: [
                      { text: `${totalEntriesLabel} ${entries.length}`, fontSize: 9, color: '#334155', margin: [0, 0, 0, 3] as [number, number, number, number] },
                      { text: `${actionCategoriesLabel} ${categories.length}`, fontSize: 9, color: '#334155' },
                    ],
                    width: '*',
                  },
                  {
                    stack: [
                      { text: `${uniqueActorsLabel} ${actors.length}`, fontSize: 9, color: '#334155', margin: [0, 0, 0, 3] as [number, number, number, number] },
                      { text: `${dateRangeLabel} ${dateRange}`, fontSize: 9, color: '#334155' },
                    ],
                    width: '*',
                  },
                ],
              },
            ],
            fillColor: '#EFF6FF',
            margin: [8, 6, 8, 6] as [number, number, number, number],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#BFDBFE',
      vLineColor: () => '#BFDBFE',
    },
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };
}

function buildEntriesTable(
  data: ChainOfCustodyDocumentData,
  ctx: TranslationContext
): Content {
  const { entries, options: _options } = data;
  const { isBilingual, t } = ctx;

  const chainEntriesArabic = isBilingual ? (t('chainOfCustodyEntries', '').split(' | ')[1] || null) : null;
  const sectionHeader: Content = isBilingual
    ? (createBilingualSectionHeader(
        'Chain of Custody Entries',
        chainEntriesArabic
      ) as Content)
    : { text: 'Chain of Custody Entries', fontSize: 11, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 6] as [number, number, number, number] };

  const headerRow: TableCell[] = [
    { text: isBilingual ? t('entryNum', 'Entry #') : 'Entry #', style: 'tableHeader' },
    { text: isBilingual ? t('actionType', 'Action Type') : 'Action Type', style: 'tableHeader' },
    { text: isBilingual ? t('description', 'Description') : 'Description', style: 'tableHeader' },
    { text: isBilingual ? t('actor', 'Actor') : 'Actor', style: 'tableHeader' },
    { text: isBilingual ? t('dateTime', 'Date/Time') : 'Date/Time', style: 'tableHeader' },
    { text: isBilingual ? t('category', 'Category') : 'Category', style: 'tableHeader' },
  ];

  const bodyRows: TableCell[][] = entries.map((entry, index) => {
    const bgColor = index % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.background;
    const catColor = categoryColors[entry.action_category] || PDF_COLORS.headerBg;

    const actorText = entry.actor_role
      ? `${safeString(entry.actor_name)}\n(${entry.actor_role})`
      : safeString(entry.actor_name);

    return [
      { text: `#${padEntryNumber(entry.entry_number)}`, fontSize: 7, bold: true, color: PDF_COLORS.text, fillColor: bgColor, margin: [2, 3, 2, 3] as [number, number, number, number], alignment: 'center' as const },
      { text: formatActionType(entry.action_type), fontSize: 7, bold: true, color: PDF_COLORS.text, fillColor: bgColor, margin: [2, 3, 2, 3] as [number, number, number, number] },
      { text: safeString(entry.action_description), fontSize: 7, color: PDF_COLORS.text, fillColor: bgColor, margin: [2, 3, 2, 3] as [number, number, number, number] },
      { text: actorText, fontSize: 7, color: PDF_COLORS.text, fillColor: bgColor, margin: [2, 3, 2, 3] as [number, number, number, number] },
      { text: formatDateTimeWithConfig(entry.occurred_at, data.dateTimeConfig ?? null, { withTz: true }), fontSize: 7, color: PDF_COLORS.textLight, fillColor: bgColor, margin: [2, 3, 2, 3] as [number, number, number, number], alignment: 'center' as const },
      {
        table: {
          widths: ['*'],
          body: [[
            {
              text: formatActionType(entry.action_category),
              fontSize: 6,
              bold: true,
              color: '#334155',
              fillColor: catColor,
              alignment: 'center' as const,
              margin: [2, 2, 2, 2] as [number, number, number, number],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 1,
          paddingBottom: () => 1,
        },
        fillColor: bgColor,
        margin: [2, 3, 2, 3] as [number, number, number, number],
      },
    ];
  });

  const tableContent: Content[] = [
    sectionHeader,
    {
      table: {
        headerRows: 1,
        widths: [38, 65, '*', 70, 65, 60],
        body: [headerRow, ...bodyRows],
      },
      layout: {
        hLineWidth: (i: number, _node: any) => (i <= 1 ? 1 : 0.5),
        vLineWidth: () => 0.5,
        hLineColor: (i: number) => (i <= 1 ? PDF_COLORS.primary : PDF_COLORS.border),
        vLineColor: () => PDF_COLORS.border,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    },
  ];

  return {
    stack: tableContent,
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };
}

function buildHashSection(
  data: ChainOfCustodyDocumentData,
  ctx: TranslationContext
): Content | null {
  if (!data.options?.includeHashes) return null;

  const entriesWithHashes = data.entries.filter(e => e.hash_value);
  if (entriesWithHashes.length === 0) return null;

  const { isBilingual, t } = ctx;

  const hashArabic = isBilingual ? (t('hashVerification', '').split(' | ')[1] || null) : null;
  const sectionHeader: Content = isBilingual
    ? (createBilingualSectionHeader(
        'Hash Verification',
        hashArabic
      ) as Content)
    : { text: 'Hash Verification', fontSize: 10, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 4] as [number, number, number, number] };

  const headerRow: TableCell[] = [
    { text: isBilingual ? t('entryNum', 'Entry #') : 'Entry #', style: 'tableHeader' },
    { text: isBilingual ? t('algorithm', 'Algorithm') : 'Algorithm', style: 'tableHeader' },
    { text: isBilingual ? t('hashValue', 'Hash Value') : 'Hash Value', style: 'tableHeader' },
  ];

  const bodyRows: TableCell[][] = entriesWithHashes.map(entry => [
    { text: `#${padEntryNumber(entry.entry_number)}`, fontSize: 7, bold: true, color: PDF_COLORS.text, margin: [3, 3, 3, 3] as [number, number, number, number], alignment: 'center' as const },
    { text: safeString(entry.hash_algorithm), fontSize: 7, color: PDF_COLORS.text, margin: [3, 3, 3, 3] as [number, number, number, number] },
    { text: safeString(entry.hash_value), fontSize: 6, color: PDF_COLORS.textLight, margin: [3, 3, 3, 3] as [number, number, number, number], font: 'Courier' },
  ]);

  return {
    stack: [
      sectionHeader,
      {
        table: {
          headerRows: 1,
          widths: [50, 60, '*'],
          body: [headerRow, ...bodyRows],
        },
        layout: {
          hLineWidth: (i: number) => (i <= 1 ? 1 : 0.5),
          vLineWidth: () => 0.5,
          hLineColor: (i: number) => (i <= 1 ? PDF_COLORS.primary : PDF_COLORS.border),
          vLineColor: () => PDF_COLORS.border,
        },
      },
    ],
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };
}

function buildSignatureSection(
  data: ChainOfCustodyDocumentData,
  ctx: TranslationContext
): Content | null {
  if (!data.options?.includeSignatures) return null;

  const entriesWithSigs = data.entries.filter(e => e.digital_signature);
  if (entriesWithSigs.length === 0) return null;

  const { isBilingual, t } = ctx;

  const digSigArabic = isBilingual ? (t('digitalSignatures', '').split(' | ')[1] || null) : null;
  const digitallySignedAr = isBilingual ? (t('digitallySigned', '').split(' | ')[1] || null) : null;
  const sectionHeader: Content = isBilingual
    ? (createBilingualSectionHeader(
        'Digital Signatures',
        digSigArabic
      ) as Content)
    : { text: 'Digital Signatures', fontSize: 10, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 4] as [number, number, number, number] };

  const signatureBadges: Content[] = entriesWithSigs.map(entry => ({
    columns: [
      {
        table: {
          widths: ['auto'],
          body: [[
            {
              text: `\u2713 Entry #${padEntryNumber(entry.entry_number)} — Digitally Signed${isBilingual && digitallySignedAr ? ' | ' + digitallySignedAr : ''}`,
              fontSize: 7,
              bold: true,
              color: '#0D9488',
              fillColor: '#CCFBF1',
              margin: [6, 3, 6, 3] as [number, number, number, number],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#99F6E4',
          vLineColor: () => '#99F6E4',
        },
        width: 'auto' as const,
      },
      { text: `${safeString(entry.actor_name)} — ${formatDateTimeWithConfig(entry.occurred_at, data.dateTimeConfig ?? null, { withTz: true })}`, fontSize: 7, color: PDF_COLORS.textLight, margin: [6, 4, 0, 0] as [number, number, number, number] },
    ],
    margin: [0, 0, 0, 3] as [number, number, number, number],
  }));

  return {
    stack: [sectionHeader, ...signatureBadges],
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };
}

export function buildChainOfCustodyDocument(
  data: ChainOfCustodyDocumentData,
  ctx: TranslationContext
): TDocumentDefinitions {
  const { t, isBilingual, fontFamily } = ctx;

  const content: Content[] = [
    buildHeaderSection(data, ctx),
    buildLegalNotice(ctx),
    buildSummarySection(data, ctx),
    buildEntriesTable(data, ctx),
  ];

  const hashSection = buildHashSection(data, ctx);
  if (hashSection) content.push(hashSection);

  const signatureSection = buildSignatureSection(data, ctx);
  if (signatureSection) content.push(signatureSection);

  const pageWord = isBilingual ? t('page', 'Page') : 'Page';
  const ofWord = isBilingual ? t('of', 'of') : 'of';
  const certifiedText = isBilingual ? t('pageFooterCertified', 'This document is a certified Chain of Custody record') : 'This document is a certified Chain of Custody record';

  return {
    pageSize: 'A4',
    pageMargins: [25, 25, 25, 40],
    ...(data.options?.watermark ? { watermark: { text: data.options.watermark, color: '#e2e8f0', opacity: 0.15, bold: true, fontSize: 50 } } : {}),
    defaultStyle: {
      font: fontFamily,
      fontSize: 8,
    },
    styles: getStylesWithFont(fontFamily),
    footer: (currentPage: number, pageCount: number): Content => ({
      text: `${pageWord} ${currentPage} ${ofWord} ${pageCount} | ${certifiedText}`,
      fontSize: 7,
      color: PDF_COLORS.textMuted,
      alignment: 'center',
      margin: [25, 10, 25, 0],
    }),
    content,
  };
}
