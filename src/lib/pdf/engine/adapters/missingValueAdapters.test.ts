/**
 * TBL-10 end-to-end: every adapter that fell back to a hardcoded English `'N/A'`
 * now routes it through {@link missingValue}, so a bilingual document gets the
 * script-neutral em dash while an English-only document is byte-identical.
 *
 * Each adapter is exercised TWICE with the SAME record (a record deliberately
 * missing the customer name/phone/email), once English-only and once Arabic
 * bilingual, so the parity assertion and the fix assertion cannot drift apart.
 */
import { describe, it, expect } from 'vitest';
import { toAdvanceVoucherEngineData } from './advanceVoucherAdapter';
import { toEngineData as toCheckoutEngineData } from './checkoutAdapter';
import { toCreditNoteEngineData } from './creditNoteAdapter';
import { toEngineData as toInvoiceEngineData } from './invoiceAdapter';
import { toEngineData as toPaymentReceiptEngineData } from './paymentReceiptAdapter';
import { toEngineData as toQuoteEngineData } from './quoteAdapter';
import { toEngineData as toReceiptEngineData } from './receiptAdapter';
import { toEngineData as toReportEngineData } from './reportAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../../templateConfig';
import type { DocumentTemplateConfig, LanguageConfig } from '../../templateConfig';
import type {
  CaseData,
  CreditNoteDocumentData,
  InvoiceDocumentData,
  PaymentReceiptDocumentData,
  QuoteDocumentData,
  ReceiptData,
  TranslationContext,
} from '../../types';
import type { ReportData } from '../../documents/ReportDocument';
import type { EngineDocData, PartyBlock } from '../types';

const EN: LanguageConfig = { mode: 'en', primary: 'en' };
const AR: LanguageConfig = { mode: 'bilingual_stacked', primary: 'ar' };

/** Clone a built-in config with only the language swapped — nothing else moves. */
const withLang = (type: keyof typeof BUILT_IN_TEMPLATE_CONFIGS, language: LanguageConfig) =>
  ({ ...BUILT_IN_TEMPLATE_CONFIGS[type], language }) as DocumentTemplateConfig;

/** All strings reachable from a party block (name + every row value). */
const partyValues = (p: PartyBlock | undefined): string[] =>
  p ? [p.name ?? '', ...p.rows.map((r) => r.value)] : [];

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

// ── Fixtures: every one deliberately MISSING the fields that trigger a fallback ──

const emptyCase: CaseData = {
  id: 'c1',
  case_no: 'C-0001',
  created_at: '2026-07-01T00:00:00Z',
  status: 'ready',
  priority: 'normal',
};

const receiptData = (): ReceiptData => ({
  caseData: { ...emptyCase },
  devices: [],
  companySettings: { basic_info: {}, legal_compliance: {}, branding: {} } as ReceiptData['companySettings'],
});

const creditNote = (): CreditNoteDocumentData =>
  ({
    creditNoteData: {
      credit_note_number: 'CN-0001',
      credit_note_date: '2026-07-01',
      credit_type: 'refund',
      status: 'issued',
      subtotal: 100,
      tax_rate: 5,
      tax_amount: 5,
      total_amount: 105,
      applied_amount: 0,
      customer_name: null,
      company_name: null,
      currency_symbol: 'ر.ع.',
      currency_position: 'after',
      decimal_places: 3,
      items: [],
    },
    companySettings: { basic_info: {}, location: {} },
  }) as unknown as CreditNoteDocumentData;

const invoice = (): InvoiceDocumentData =>
  ({
    invoiceData: {
      invoice_number: 'INV-0001',
      invoice_date: '2026-07-01',
      subtotal: 100,
      tax_amount: 5,
      total_amount: 105,
      invoice_line_items: [],
    },
    companySettings: { basic_info: {}, location: {} },
  }) as unknown as InvoiceDocumentData;

const quote = (): QuoteDocumentData =>
  ({
    quoteData: {
      quote_number: 'QT-0001',
      quote_date: '2026-07-01',
      subtotal: 100,
      tax_amount: 5,
      total_amount: 105,
      quote_items: [],
    },
    companySettings: { basic_info: {}, location: {} },
  }) as unknown as QuoteDocumentData;

const paymentReceipt = (): PaymentReceiptDocumentData =>
  ({
    paymentData: {
      receipt_number: 'RCP-0001',
      payment_date: '2026-07-01',
      amount: 105,
    },
    companySettings: { basic_info: {}, location: {} },
  }) as unknown as PaymentReceiptDocumentData;

const report = (): ReportData =>
  ({
    report: {
      id: 'rpt-1',
      case_id: 'case-1',
      report_number: 'REP-0001',
      report_type: 'evaluation',
      title: 'Evaluation',
      status: 'approved',
      version_number: 1,
      created_at: '2026-07-01T09:30:00Z',
    },
    sections: [],
    companySettings: { basic_info: {} },
  }) as unknown as ReportData;

/**
 * Each case: a label, and a render function taking the language to use. The
 * probe returns every user-visible string that could carry the fallback.
 */
const CASES: Array<{ name: string; probe: (l: LanguageConfig) => string[] }> = [
  {
    name: 'advanceVoucherAdapter',
    probe: (l) =>
      partyValues(
        toAdvanceVoucherEngineData(
          {
            voucher_type: 'receipt',
            voucher_number: 'RV-0001',
            voucher_date: '2026-07-01',
            currency_symbol: '₹',
            currency_position: 'before',
            decimal_places: 2,
            customer_name: null,
            company_name: null,
            taxable_amount: 100,
            tax_amount: 18,
            total_amount: 118,
            original_voucher_number: null,
          },
          withLang('invoice', l),
        ).parties.to,
      ),
  },
  {
    name: 'checkoutAdapter',
    probe: (l) => partyValues(toCheckoutEngineData(receiptData(), withLang('checkout_form', l)).parties.to),
  },
  {
    name: 'creditNoteAdapter',
    probe: (l) => partyValues(toCreditNoteEngineData(creditNote(), withLang('credit_note', l)).parties.to),
  },
  {
    name: 'invoiceAdapter',
    probe: (l) => partyValues(toInvoiceEngineData(invoice(), withLang('invoice', l)).parties.to),
  },
  {
    name: 'paymentReceiptAdapter',
    probe: (l) =>
      partyValues(toPaymentReceiptEngineData(paymentReceipt(), withLang('payment_receipt', l)).parties.to),
  },
  {
    name: 'quoteAdapter',
    probe: (l) => partyValues(toQuoteEngineData(quote(), withLang('quote', l)).parties.to),
  },
  {
    name: 'receiptAdapter',
    probe: (l) =>
      partyValues(toReceiptEngineData(receiptData(), withLang('office_receipt', l), 'office').parties.to),
  },
  {
    name: 'reportAdapter',
    probe: (l) => {
      const data: EngineDocData = toReportEngineData(report(), withLang('report', l), ctx);
      return (data.reportInfoColumns?.general.rows ?? []).map((r) => r.value);
    },
  },
];

describe('TBL-10 — hardcoded English "N/A" fallback across the adapters', () => {
  // ── PARITY: the default English document must not move ─────────────────────
  describe('parity — an English-only document still prints "N/A"', () => {
    for (const { name, probe } of CASES) {
      it(`${name} keeps 'N/A' under mode 'en'`, () => {
        const values = probe(EN);
        expect(values).toContain('N/A');
        expect(values).not.toContain('—');
      });
    }
  });

  // ── THE FIX: a bilingual document gets the script-neutral glyph ────────────
  describe('bilingual — the Latin abbreviation is replaced by the neutral em dash', () => {
    for (const { name, probe } of CASES) {
      it(`${name} prints '—' under an Arabic bilingual config`, () => {
        const values = probe(AR);
        expect(values).toContain('—');
        expect(values).not.toContain('N/A');
      });
    }
  });

  // ── Only the fallback moves; present values are untouched ─────────────────
  it('a record that HAS a customer name is identical in both languages', () => {
    const named = (): ReceiptData => ({
      ...receiptData(),
      caseData: {
        ...emptyCase,
        customer: {
          id: 'cust1',
          customer_name: 'Acme Data',
          email: 'a@b.com',
          mobile_number: '+968 1234 5678',
        },
      },
    });
    const en = partyValues(toReceiptEngineData(named(), withLang('office_receipt', EN), 'office').parties.to);
    const ar = partyValues(toReceiptEngineData(named(), withLang('office_receipt', AR), 'office').parties.to);
    expect(ar).toEqual(en);
    expect(en).toContain('Acme Data');
  });

  it('checkout mirrors receipt: phone AND email fall back, not just the name', () => {
    const values = partyValues(
      toCheckoutEngineData(receiptData(), withLang('checkout_form', AR)).parties.to,
    );
    // name + phone + email all missing on the fixture → three em dashes.
    expect(values.filter((v) => v === '—')).toHaveLength(3);
  });
});
