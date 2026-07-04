import { describe, it, expect } from 'vitest';
import { toCreditNoteEngineData } from './creditNoteAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../../templateConfig';
import type { DocumentTemplateConfig } from '../../templateConfig';
import type { CreditNoteDocumentData } from '../../types';

// Real fixture: CreditNoteData is FLAT (types.ts:470) — flat currency_symbol/
// currency_position/decimal_places (no accounting_locales), flat customer_name/
// company_name, credit_note_date, and CreditNoteLineItem = {description, quantity,
// unit_price, line_total}. The companySettings shape is narrowed with a cast — the
// adapter only reads basic_info.vat_number / location.country from it.
const fixture: CreditNoteDocumentData = {
  creditNoteData: {
    credit_note_number: 'CN-0001',
    credit_note_date: '2026-07-01',
    credit_type: 'refund',
    status: 'issued',
    reason_code: 'FAILED_RECOVERY',
    reason_notes: 'Refund — failed recovery',
    subtotal: 100,
    tax_rate: 5,
    tax_amount: 5,
    total_amount: 105,
    applied_amount: 0,
    invoice_number: 'INVO-0007',
    customer_name: 'Test Buyer',
    company_name: null,
    case_no: null,
    currency_symbol: 'ر.ع.',
    currency_position: 'after',
    decimal_places: 3,
    items: [{ description: 'Refund — failed recovery', quantity: 1, unit_price: 100, line_total: 105 }],
  },
  companySettings: {
    basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC', vat_number: 'OM1100000000' },
    location: { country: 'Oman' },
  } as CreditNoteDocumentData['companySettings'],
};

describe('toCreditNoteEngineData', () => {
  it('maps the credit note into EngineDocData with stored totals (no recompute)', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.credit_note;
    const data = toCreditNoteEngineData(fixture, config);
    expect(data.meta.some((m) => m.value === 'CN-0001')).toBe(true);
    const totalRow = data.totals?.find((t) => t.key === 'total');
    expect(totalRow?.value).toContain('105');            // stored total_amount, not re-derived
    expect(data.documentTitle).toBeDefined();             // config-driven title (profile layer sets it)
    expect(data.parties.to?.name).toBe('Test Buyer');     // flat customer_name, not nested
  });

  it('renders one tax totals row from stored tax_amount when no tax lines exist (M-I fallback)', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.credit_note;
    const data = toCreditNoteEngineData(fixture, config);
    const taxRow = data.totals?.find((t) => t.key === 'tax');
    expect(taxRow?.value).toContain('5');
  });

  it('shows an "Applied to Invoices" total row only when applied_amount > 0', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.credit_note;
    const zeroApplied = toCreditNoteEngineData(fixture, config);
    expect(zeroApplied.totals?.some((t) => t.label.en.includes('Applied'))).toBe(false);

    const partlyApplied: CreditNoteDocumentData = {
      ...fixture,
      creditNoteData: { ...fixture.creditNoteData, applied_amount: 50 },
    };
    const data = toCreditNoteEngineData(partlyApplied, config);
    const row = data.totals?.find((t) => t.label.en.includes('Applied'));
    expect(row?.value).toContain('50');
  });

  it('honors a country-layer documentTitle override (TAX CREDIT NOTE ceremony)', () => {
    const config: DocumentTemplateConfig = {
      ...BUILT_IN_TEMPLATE_CONFIGS.credit_note,
      labels: {
        ...BUILT_IN_TEMPLATE_CONFIGS.credit_note.labels,
        documentTitle: { en: 'TAX CREDIT NOTE', ar: 'إشعار دائن ضريبي' },
      },
    };
    const data = toCreditNoteEngineData(fixture, config);
    expect(data.documentTitle).toEqual({ en: 'TAX CREDIT NOTE', ar: 'إشعار دائن ضريبي' });
  });
});
