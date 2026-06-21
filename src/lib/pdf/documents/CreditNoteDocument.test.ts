import { describe, it, expect } from 'vitest';
import type { CreditNoteDocumentData, TranslationContext } from '../types';
import { buildCreditNoteDocument } from './CreditNoteDocument';

const ctx: TranslationContext = {
  t: (_k: string, e: string) => e,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

const data: CreditNoteDocumentData = {
  creditNoteData: {
    credit_note_number: 'CRED-0001',
    credit_note_date: '2026-06-13',
    credit_type: 'adjustment',
    status: 'applied',
    reason_code: 'negotiated_settlement',
    reason_notes: 'Agreed discount after partial recovery.',
    subtotal: 100,
    tax_rate: 5,
    tax_amount: 5,
    total_amount: 105,
    applied_amount: 105,
    invoice_number: 'INVO-0027',
    customer_name: 'Acme Corp',
    company_name: 'Acme Holdings',
    case_no: 'CASE-0042',
    currency_symbol: 'OMR',
    currency_position: 'after',
    decimal_places: 3,
    items: [],
  },
  companySettings: { basic_info: { company_name: 'Lab Co', legal_name: 'Lab Co LLC' } },
};

// Recursively collect every `text` string in a pdfmake content tree.
function collectText(node: unknown, acc: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    acc.push(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, acc));
    return;
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.text === 'string') acc.push(o.text);
    else if (o.text != null) collectText(o.text, acc);
    collectText(o.stack, acc);
    collectText(o.columns, acc);
    if (o.table && typeof o.table === 'object') {
      collectText((o.table as Record<string, unknown>).body, acc);
    }
  }
}

describe('buildCreditNoteDocument', () => {
  const def = buildCreditNoteDocument(data, ctx);
  const acc: string[] = [];
  collectText(def.content, acc);
  const blob = acc.join(' | ');

  it('produces an A4 document using the context font', () => {
    expect(def.pageSize).toBe('A4');
    expect((def.defaultStyle as { font?: string }).font).toBe('Roboto');
  });

  it('renders the credit-note title, number and the invoice it credits', () => {
    expect(blob).toContain('CREDIT NOTE');
    expect(blob).toContain('CRED-0001');
    expect(blob).toContain('INVO-0027');
  });

  it('renders the credited total in the configured currency and the reason', () => {
    expect(blob).toContain('105.000');
    expect(blob).toContain('OMR');
    expect(blob).toContain('Agreed discount after partial recovery.');
  });
});
