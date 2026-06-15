import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { PayslipDocumentData, TranslationContext } from '../types';
import { PDF_COLORS, getStylesWithFont, createBilingualSectionHeader } from '../styles';
import { formatDate, safeString } from '../utils';

export function buildPayslipDocument(
  data: PayslipDocumentData,
  ctx: TranslationContext
): TDocumentDefinitions {
  const { payslipData, companySettings } = data;
  const { t, isBilingual, fontFamily } = ctx;

  const companyName = companySettings.basic_info?.company_name || 'Company Name';

  const currencySymbol = payslipData.accounting_locales?.currency_symbol || 'USD';
  const decimalPlaces = payslipData.accounting_locales?.decimal_places || 2;
  const currencyPosition = payslipData.accounting_locales?.currency_position || 'after';

  const formatCurrency = (amount: number): string => {
    const formatted = amount.toFixed(decimalPlaces);
    return currencyPosition === 'before'
      ? `${currencySymbol} ${formatted}`
      : `${formatted} ${currencySymbol}`;
  };

  const earnings = payslipData.items?.filter((item) => item.component_type === 'earning') || [];
  const deductions = payslipData.items?.filter((item) => item.component_type === 'deduction') || [];

  // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single payroll_record = one employee/period in one currency; payroll_record_items has no amount_base shadow
  const totalEarnings = earnings.reduce((sum, item) => sum + Number(item.amount), 0);
  // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single payroll_record = one employee/period in one currency; payroll_record_items has no amount_base shadow
  const totalDeductions = deductions.reduce((sum, item) => sum + Number(item.amount), 0);

  const thinTableLayout = {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => PDF_COLORS.border,
    vLineColor: () => PDF_COLORS.border,
  };

  const headerSection: Content = {
    stack: [
      { text: companyName, fontSize: 18, bold: true, color: PDF_COLORS.primaryDark },
      { text: t('employeePayslipSubtitle', 'Employee Payslip'), fontSize: 10, color: PDF_COLORS.textLight, margin: [0, 2, 0, 0] },
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 525,
            y2: 0,
            lineWidth: 2,
            lineColor: PDF_COLORS.primary,
          },
        ],
        margin: [0, 8, 0, 0],
      },
    ],
    margin: [0, 0, 0, 15],
  };

  const titleSection: Content = {
    text: `${t('salarySlip', 'Salary Slip')} - ${safeString(payslipData.payroll_period?.period_name)}`,
    fontSize: 16,
    bold: true,
    color: PDF_COLORS.text,
    alignment: 'center',
    margin: [0, 5, 0, 15],
  };

  const buildKeyValueRows = (pairs: Array<{ label: string; value: string }>): TableCell[][] => {
    return pairs.map((pair) => [
      { text: pair.label, fontSize: 9, color: PDF_COLORS.textLight, margin: [4, 3, 4, 3] },
      { text: pair.value, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [4, 3, 4, 3] },
    ]);
  };

  const extractArabic = (key: string, fallback: string): string | null => {
    if (!isBilingual) return null;
    const parts = t(key, fallback).split(' | ');
    return parts[1] || null;
  };

  const employeeInfoSection: Content[] = [
    createBilingualSectionHeader(
      'Employee Information',
      extractArabic('employeeInformation', 'Employee Information')
    ) as Content,
    {
      table: {
        widths: ['40%', '60%'],
        body: buildKeyValueRows([
          {
            label: t('employeeName', 'Employee Name'),
            value: `${safeString(payslipData.employee?.first_name)} ${safeString(payslipData.employee?.last_name)}`,
          },
          {
            label: t('employeeNumber', 'Employee Number'),
            value: safeString(payslipData.employee?.employee_number),
          },
          {
            label: t('payPeriod', 'Pay Period'),
            value: `${formatDate(payslipData.payroll_period?.start_date)} - ${formatDate(payslipData.payroll_period?.end_date)}`,
          },
          {
            label: t('paymentDate', 'Payment Date'),
            value: payslipData.payment_date ? formatDate(payslipData.payment_date) : t('notPaid', 'Not paid'),
          },
        ]),
      },
      layout: thinTableLayout,
      margin: [0, 0, 0, 12],
    },
  ];

  const attendanceSection: Content[] = [
    createBilingualSectionHeader(
      'Attendance Summary',
      extractArabic('attendanceSummary', 'Attendance Summary')
    ) as Content,
    {
      table: {
        widths: ['40%', '60%'],
        body: buildKeyValueRows([
          {
            label: t('workingDays', 'Working Days'),
            value: String(payslipData.working_days || 0),
          },
          {
            label: t('daysWorked', 'Days Worked'),
            value: String(payslipData.days_worked || 0),
          },
          {
            label: t('daysAbsent', 'Days Absent'),
            value: String(payslipData.days_absent || 0),
          },
          {
            label: t('regularHours', 'Regular Hours'),
            value: String(payslipData.regular_hours || 0),
          },
          {
            label: t('overtimeHours', 'Overtime Hours'),
            value: String(payslipData.overtime_hours || 0),
          },
        ]),
      },
      layout: thinTableLayout,
      margin: [0, 0, 0, 12],
    },
  ];

  const buildComponentTable = (
    sectionTitle: string,
    sectionTitleAr: string | null,
    items: typeof earnings,
    totalLabel: string,
    totalAmount: number
  ): Content[] => {
    const headerRow: TableCell[] = [
      { text: t('component', 'Component'), style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text },
      { text: t('calculation', 'Calculation'), style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text },
      { text: t('amount', 'Amount'), style: 'tableHeader', fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment: 'right' },
    ];

    const dataRows: TableCell[][] = items.map((item) => [
      { text: safeString(item.component_name), fontSize: 9, color: PDF_COLORS.text, margin: [4, 3, 4, 3] },
      { text: safeString(item.calculation_basis) || '-', fontSize: 9, color: PDF_COLORS.textLight, alignment: 'center', margin: [4, 3, 4, 3] },
      { text: formatCurrency(Number(item.amount)), fontSize: 9, color: PDF_COLORS.text, alignment: 'right', margin: [4, 3, 4, 3] },
    ]);

    const totalRow: TableCell[] = [
      { text: totalLabel, fontSize: 9, bold: true, color: PDF_COLORS.text, fillColor: PDF_COLORS.background, margin: [4, 4, 4, 4] },
      { text: '', fillColor: PDF_COLORS.background, margin: [4, 4, 4, 4] },
      { text: formatCurrency(totalAmount), fontSize: 9, bold: true, color: PDF_COLORS.text, fillColor: PDF_COLORS.background, alignment: 'right', margin: [4, 4, 4, 4] },
    ];

    return [
      createBilingualSectionHeader(
        sectionTitle,
        sectionTitleAr
      ) as Content,
      {
        table: {
          headerRows: 1,
          widths: ['50%', '25%', '25%'],
          body: [headerRow, ...dataRows, totalRow],
        },
        layout: thinTableLayout,
        margin: [0, 0, 0, 12],
      },
    ];
  };

  const earningsSection = buildComponentTable(
    'Earnings',
    extractArabic('earnings', 'Earnings'),
    earnings,
    t('totalEarnings', 'Total Earnings'),
    totalEarnings
  );

  const deductionsSection = buildComponentTable(
    'Deductions',
    extractArabic('deductions', 'Deductions'),
    deductions,
    t('totalDeductions', 'Total Deductions'),
    totalDeductions
  );

  const netSalarySection: Content = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: t('netSalary', 'Net Salary'), fontSize: 12, color: PDF_COLORS.primaryDark, margin: [0, 0, 0, 4] },
              { text: formatCurrency(Number(payslipData.net_salary)), fontSize: 20, bold: true, color: PDF_COLORS.primaryDark },
            ],
            fillColor: '#DBEAFE',
            margin: [12, 10, 12, 10],
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
    margin: [0, 8, 0, 20],
  };

  const footerSection: Content = {
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
            lineColor: PDF_COLORS.border,
          },
        ],
        margin: [0, 0, 0, 8],
      },
      {
        text: t('systemGenerated', 'This is a system-generated payslip and does not require a signature.'),
        fontSize: 9,
        color: PDF_COLORS.textLight,
        alignment: 'center',
      },
      {
        text: `${t('generatedOn', 'Generated on')} ${formatDate(new Date())}`,
        fontSize: 9,
        color: PDF_COLORS.textLight,
        alignment: 'center',
        margin: [0, 4, 0, 0],
      },
    ],
  };

  const content: Content[] = [
    headerSection,
    titleSection,
    ...employeeInfoSection,
    ...attendanceSection,
    ...earningsSection,
    ...deductionsSection,
    netSalarySection,
    footerSection,
  ];

  return {
    pageSize: 'A4',
    pageMargins: [35, 30, 35, 60],
    defaultStyle: {
      font: fontFamily,
    },
    styles: getStylesWithFont(fontFamily),
    content,
  };
}
