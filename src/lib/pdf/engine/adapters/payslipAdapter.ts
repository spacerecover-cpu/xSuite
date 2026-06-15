/**
 * Payslip adapter — maps the real {@link PayslipDocumentData} (employee +
 * payroll period + earning/deduction component items + company settings) into
 * the document-agnostic {@link EngineDocData} the section renderers consume.
 *
 * A payslip carries NO party blocks, NO line-item table, NO money totals stack
 * and NO bank/payment-history. Its body is four engine blocks instead:
 *   - {@link PayslipInfoBlock} — the employee/period header (name, number, pay
 *     period, payment date, and the working-days/hours rows), generalized from
 *     the legacy "Employee Information" + "Attendance Summary" boxes.
 *   - {@link PayComponentBlock} earnings  — items with `component_type === 'earning'`.
 *   - {@link PayComponentBlock} deductions — items with `component_type === 'deduction'`.
 *   - {@link NetPayBlock} — the emphasized Net Salary line.
 *
 * The adapter owns ALL domain knowledge: the locale-driven currency formatting,
 * the earning/deduction split + per-section totals math, the calculation-basis
 * `'-'` fallback, and the date formatting. The section renderers stay dumb.
 *
 * Parity reference: `documents/PayslipDocument.ts` — employee info ~83-113,
 * attendance ~115-149, `buildComponentTable` ~151-207, net salary ~209-234.
 */

import type { PayslipDocumentData } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';
import { formatDate, safeString } from '../../utils';
import type {
  EngineDocData,
  LabelText,
  NetPayBlock,
  PayComponentBlock,
  PayslipInfoBlock,
} from '../types';

/** Bilingual column headers shared by the earnings + deductions tables. */
const COMPONENT_COLUMNS: PayComponentBlock['columns'] = {
  component: { en: 'Component', ar: 'البند' },
  calculation: { en: 'Calculation', ar: 'الحساب' },
  amount: { en: 'Amount', ar: 'المبلغ' },
};

export function toEngineData(
  data: PayslipDocumentData,
  _config: DocumentTemplateConfig,
): EngineDocData {
  const { payslipData, companySettings } = data;

  // ---- Currency formatter (locale-driven, matches the builder) -------------
  const currencySymbol = payslipData.accounting_locales?.currency_symbol || 'USD';
  const decimalPlaces = payslipData.accounting_locales?.decimal_places ?? 2;
  const currencyPosition = payslipData.accounting_locales?.currency_position || 'after';
  const money = (amount: number): string => {
    const formatted = amount.toFixed(decimalPlaces);
    return currencyPosition === 'before' ? `${currencySymbol} ${formatted}` : `${formatted} ${currencySymbol}`;
  };

  // ---- Title ---------------------------------------------------------------
  const documentTitle: LabelText = { en: 'PAYSLIP', ar: 'قسيمة الراتب' };

  // ---- Earning / deduction split (parity with the builder's filters) -------
  const items = payslipData.items || [];
  const earningItems = items.filter((i) => i.component_type === 'earning');
  const deductionItems = items.filter((i) => i.component_type === 'deduction');

  // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency (within-document: component items of one payroll record, no amount_base shadow on payslip line items)
  const totalEarnings = earningItems.reduce((sum, i) => sum + Number(i.amount), 0);
  // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency (within-document: component items of one payroll record, no amount_base shadow on payslip line items)
  const totalDeductions = deductionItems.reduce((sum, i) => sum + Number(i.amount), 0);

  // ---- Payslip info header (employee + period + attendance) ----------------
  // Merges the legacy "Employee Information" and "Attendance Summary" boxes into
  // one bilingual info box of label/value rows.
  const employeeName = `${safeString(payslipData.employee?.first_name)} ${safeString(
    payslipData.employee?.last_name,
  )}`.trim();
  const payPeriod = `${formatDate(payslipData.payroll_period?.start_date)} - ${formatDate(
    payslipData.payroll_period?.end_date,
  )}`;

  const payslipInfo: PayslipInfoBlock = {
    title: { en: 'Employee Information', ar: 'معلومات الموظف' },
    rows: [
      { label: { en: 'Employee Name', ar: 'اسم الموظف' }, value: employeeName || '-' },
      {
        label: { en: 'Employee Number', ar: 'رقم الموظف' },
        value: safeString(payslipData.employee?.employee_number),
      },
      { label: { en: 'Pay Period', ar: 'فترة الدفع' }, value: payPeriod },
      {
        label: { en: 'Payment Date', ar: 'تاريخ الدفع' },
        value: payslipData.payment_date ? formatDate(payslipData.payment_date) : 'Not paid',
      },
      { label: { en: 'Working Days', ar: 'أيام العمل' }, value: String(payslipData.working_days || 0) },
      { label: { en: 'Days Worked', ar: 'أيام العمل الفعلية' }, value: String(payslipData.days_worked || 0) },
      { label: { en: 'Days Absent', ar: 'أيام الغياب' }, value: String(payslipData.days_absent || 0) },
      { label: { en: 'Regular Hours', ar: 'الساعات العادية' }, value: String(payslipData.regular_hours || 0) },
      { label: { en: 'Overtime Hours', ar: 'ساعات إضافية' }, value: String(payslipData.overtime_hours || 0) },
    ],
  };

  // ---- Earnings / deductions component tables ------------------------------
  const earnings: PayComponentBlock = {
    title: { en: 'Earnings', ar: 'الإيرادات' },
    columns: COMPONENT_COLUMNS,
    rows: earningItems.map((i) => ({
      component: safeString(i.component_name),
      calculation: safeString(i.calculation_basis) || '-',
      amount: money(Number(i.amount)),
    })),
    total: { label: { en: 'Total Earnings', ar: 'إجمالي الإيرادات' }, amount: money(totalEarnings) },
  };

  const deductions: PayComponentBlock = {
    title: { en: 'Deductions', ar: 'الخصومات' },
    columns: COMPONENT_COLUMNS,
    rows: deductionItems.map((i) => ({
      component: safeString(i.component_name),
      calculation: safeString(i.calculation_basis) || '-',
      amount: money(Number(i.amount)),
    })),
    total: { label: { en: 'Total Deductions', ar: 'إجمالي الخصومات' }, amount: money(totalDeductions) },
  };

  // ---- Net salary ----------------------------------------------------------
  const netPay: NetPayBlock = {
    label: { en: 'Net Salary', ar: 'صافي الراتب' },
    amount: money(Number(payslipData.net_salary)),
  };

  return {
    documentTitle,
    identity: companySettings,
    parties: {},
    meta: [],
    payslipInfo,
    earnings,
    deductions,
    netPay,
    // A payslip carries no money totals stack, no bank, no payment history.
    totals: undefined,
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: null,
  };
}
