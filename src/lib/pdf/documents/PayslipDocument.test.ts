import { describe, it, expect } from 'vitest';
import { buildPayslipDocument } from './PayslipDocument';
import type { TranslationContext, PayslipDocumentData } from '../types';

// ---------------------------------------------------------------------------
// Regression: the payslip "Total Earnings" must include allowance and bonus
// components, not just component_type === 'earning'. The salary-component
// vocabulary is {earning, allowance, bonus, deduction} and the rest of the app
// treats allowance + bonus as earnings; dropping them understated gross while
// the Net Salary box still reflected them (an internally inconsistent document).
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/** Basic 1000 (earning) + Housing 200 (allowance) + Bonus 150 (bonus) − Tax 100 (deduction). */
function makePayslipData(): PayslipDocumentData {
  return {
    payslipData: {
      id: 'payslip-earnings-1',
      employee: { first_name: 'Jane', last_name: 'Engineer', employee_number: 'EMP-0007' },
      payroll_period: { period_name: 'June 2026', start_date: '2026-06-01', end_date: '2026-06-30' },
      payment_date: '2026-07-01',
      gross_salary: 1350,
      total_deductions: 100,
      net_salary: 1250,
      items: [
        { component_code: 'BASIC', component_name: 'Basic Salary', component_type: 'earning', amount: 1000, calculation_basis: 'Monthly' },
        { component_code: 'HOUSE', component_name: 'Housing Allowance', component_type: 'allowance', amount: 200 },
        { component_code: 'BONUS', component_name: 'Performance Bonus', component_type: 'bonus', amount: 150 },
        { component_code: 'TAX', component_name: 'Income Tax', component_type: 'deduction', amount: 100 },
      ],
      accounting_locales: { currency_symbol: 'AED', currency_position: 'after', decimal_places: 2 },
    },
    companySettings: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Dubai', country: 'United Arab Emirates' },
      contact_info: { phone_primary: '+971 4 123 4567', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.' },
      online_presence: { website: 'https://acme.test' },
    },
  };
}

/** Collect every leaf `text` string in a pdfmake content tree (recursively). */
function collectTexts(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectTexts(child, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('text' in obj) collectTexts(obj.text, out);
    for (const key of Object.keys(obj)) {
      if (key === 'text') continue;
      collectTexts(obj[key], out);
    }
  }
}

describe('buildPayslipDocument — earnings classification', () => {
  it('counts allowance and bonus rows in the earnings table and Total Earnings', () => {
    const texts: string[] = [];
    collectTexts(buildPayslipDocument(makePayslipData(), englishCtx).content, texts);
    const joined = texts.join('|');

    // Allowance + bonus rows must be present (they used to be dropped entirely).
    expect(joined).toContain('Housing Allowance');
    expect(joined).toContain('Performance Bonus');

    // Total Earnings = 1000 + 200 + 150 = 1350 (was 1000 before the fix, dropping 350).
    expect(joined).toContain('1,350.00 AED');

    // Net Salary box stays consistent: 1350 − 100 = 1250.
    expect(joined).toContain('1,250.00 AED');
  });
});

// ---------------------------------------------------------------------------
// Regression: processPayroll writes payroll_records only — it never inserts
// payroll_record_items — so a real payslip arrives with items: []. Summing items
// alone printed "Total Earnings 0.00 / Total Deductions 0.00" beside a correct
// Net Salary box. Both totals must fall back to the record columns.
// ---------------------------------------------------------------------------

describe('buildPayslipDocument — totals when no component breakdown was stored', () => {
  it('derives Total Earnings and Total Deductions from the payroll record', () => {
    const data = makePayslipData();
    data.payslipData.items = [];

    const texts: string[] = [];
    collectTexts(buildPayslipDocument(data, englishCtx).content, texts);
    const joined = texts.join('|');

    // Total Earnings = gross_salary 1350 (was 0.00 before the fix).
    expect(joined).toContain('1,350.00 AED');
    // Total Deductions = payroll_records.total_deductions (was 0.00 before the fix).
    // Deliberately NOT gross − net: net_salary is nullable, so that arithmetic
    // would print the whole gross as deductions for a record with a null net.
    expect(joined).toContain('100.00 AED');
    expect(joined).toContain('1,250.00 AED');
  });

  it('prefers component rows over the record column when both exist', () => {
    const data = makePayslipData();
    // Earnings rows present, deductions missing → earnings from items, deductions
    // from the record column. gross_salary is skewed away from the item sum so the
    // assertion actually pins which side won: summing items gives 1,350 while the
    // record column would give 9,999.
    data.payslipData.gross_salary = 9999;
    data.payslipData.items = data.payslipData.items.filter((i) => i.component_type !== 'deduction');

    const texts: string[] = [];
    collectTexts(buildPayslipDocument(data, englishCtx).content, texts);
    const joined = texts.join('|');

    expect(joined).toContain('Basic Salary');
    expect(joined).toContain('1,350.00 AED');   // items won
    expect(joined).not.toContain('9,999.00 AED');
    expect(joined).toContain('100.00 AED');     // record column supplied deductions
  });
});
