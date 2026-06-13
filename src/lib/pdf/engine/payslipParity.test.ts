import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/payslipAdapter';
import { renderTemplate } from './renderTemplate';
import { buildPayslipDocument } from '../documents/PayslipDocument';
import type { TranslationContext, PayslipDocumentData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';

// ---------------------------------------------------------------------------
// Payslip ENGINE ↔ LEGACY parity.
//
// Renders a representative PAYSLIP BOTH ways — the legacy hand-written
// `buildPayslipDocument(...)` and the config-driven engine (toEngineData →
// renderTemplate) — and asserts CONTENT equivalence (not byte-identical
// layout): the employee name + number, the pay period, every earnings row,
// every deductions row, and the net salary. Layout differs (the legacy builder
// uses a fixed company header + "Salary Slip - <period>" title; the engine uses
// the templated header + section order), so we assert content, not geometry.
//
// The legacy builder is the reference and MUST stay untouched. All inputs are
// synthetic — no DB, no font loading.
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/**
 * Representative payslip: employee Jane Engineer (EMP-0007), June 2026 period,
 * two earnings (Basic Salary + Housing Allowance) and two deductions (Pension +
 * Loan Repayment), net salary 8,250.00.
 */
function makePayslipData(): PayslipDocumentData {
  return {
    payslipData: {
      id: 'payslip-parity-1',
      employee: {
        first_name: 'Jane',
        last_name: 'Engineer',
        employee_number: 'EMP-0007',
      },
      payroll_period: {
        period_name: 'June 2026',
        start_date: '2026-06-01',
        end_date: '2026-06-30',
      },
      payment_date: '2026-07-01',
      working_days: 22,
      days_worked: 21,
      days_absent: 1,
      regular_hours: 168,
      overtime_hours: 6,
      gross_salary: 10000,
      net_salary: 8250,
      items: [
        { component_code: 'BASIC', component_name: 'Basic Salary', component_type: 'earning', amount: 7000, calculation_basis: 'Monthly' },
        { component_code: 'HOUSE', component_name: 'Housing Allowance', component_type: 'earning', amount: 3000, calculation_basis: '30% of basic' },
        { component_code: 'PENSION', component_name: 'Pension', component_type: 'deduction', amount: 750, calculation_basis: '7.5% of basic' },
        { component_code: 'LOAN', component_name: 'Loan Repayment', component_type: 'deduction', amount: 1000 },
      ],
      accounting_locales: {
        currency_symbol: 'AED',
        currency_position: 'after',
        decimal_places: 2,
      },
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

/** All text leaves across the content AND the (possibly-callback) footer. */
function allTexts(def: TDocumentDefinitions): string[] {
  const out: string[] = [];
  collectTexts(def.content, out);
  const footer = def.footer as
    | ((currentPage: number, pageCount: number, pageSize?: unknown) => Content)
    | Content
    | undefined;
  if (typeof footer === 'function') {
    collectTexts(footer(1, 1, undefined), out);
  } else if (footer != null) {
    collectTexts(footer, out);
  }
  return out;
}

function renderEngine(data: PayslipDocumentData): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.payslip;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, englishCtx, null, null);
}

describe('payslip parity — engine output matches the legacy builder', () => {
  it('renders the employee name + number in both', () => {
    const data = makePayslipData();
    const legacy = allTexts(buildPayslipDocument(data, englishCtx)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).toContain('Jane Engineer');
    expect(legacy).toContain('EMP-0007');
    expect(engine).toContain('Jane Engineer');
    expect(engine).toContain('EMP-0007');
  });

  it('renders the pay period in both', () => {
    const data = makePayslipData();
    const legacy = allTexts(buildPayslipDocument(data, englishCtx)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    // start_date 2026-06-01 → "01/06/2026", end_date 2026-06-30 → "30/06/2026".
    expect(legacy).toContain('01/06/2026');
    expect(legacy).toContain('30/06/2026');
    expect(engine).toContain('01/06/2026');
    expect(engine).toContain('30/06/2026');
  });

  it('renders every earnings row in both', () => {
    const data = makePayslipData();
    const legacy = allTexts(buildPayslipDocument(data, englishCtx)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    for (const name of ['Basic Salary', 'Housing Allowance']) {
      expect(legacy).toContain(name);
      expect(engine).toContain(name);
    }
    // Earnings amounts (AED, after-position, 2dp).
    expect(legacy).toContain('7000.00 AED');
    expect(engine).toContain('7000.00 AED');
    // Total earnings = 7000 + 3000 = 10000.
    expect(legacy).toContain('10000.00 AED');
    expect(engine).toContain('10000.00 AED');
  });

  it('renders every deductions row in both', () => {
    const data = makePayslipData();
    const legacy = allTexts(buildPayslipDocument(data, englishCtx)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    for (const name of ['Pension', 'Loan Repayment']) {
      expect(legacy).toContain(name);
      expect(engine).toContain(name);
    }
    // Total deductions = 750 + 1000 = 1750.
    expect(legacy).toContain('1750.00 AED');
    expect(engine).toContain('1750.00 AED');
  });

  it('renders the net salary in both', () => {
    const data = makePayslipData();
    const legacy = allTexts(buildPayslipDocument(data, englishCtx)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).toContain('8250.00 AED');
    expect(engine).toContain('8250.00 AED');
  });

  it('falls back the calculation cell to "-" when a component has no basis', () => {
    const data = makePayslipData();
    // Loan Repayment has no calculation_basis → renders "-" in the calc column.
    const engine = allTexts(renderEngine(data));
    expect(engine).toContain('-');
  });
});
