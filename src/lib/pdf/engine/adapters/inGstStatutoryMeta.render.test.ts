// India cell of the document matrix: the invoice/credit-note adapters must append
// the Rule-46 statutory meta rows when config.statutoryProfileKey === 'in_gst_invoice',
// sourced ONLY from fields already on the doc data (no new fetch), and emit nothing
// for a non-India profile (byte-stability for GCC/generic).
import { describe, it, expect } from 'vitest';
import { toCreditNoteEngineData } from './creditNoteAdapter';
import type { CreditNoteDocumentData } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';

const config = (over: Partial<DocumentTemplateConfig>): DocumentTemplateConfig => ({
  ...(over as DocumentTemplateConfig),
  sections: over.sections ?? ([
    { key: 'lineItems', columns: [] }, { key: 'totals', lines: {} },
  ] as unknown as DocumentTemplateConfig['sections']),
});

const cnData = (over: Partial<CreditNoteDocumentData['creditNoteData']>): CreditNoteDocumentData => ({
  creditNoteData: {
    credit_note_number: 'CN/25-26/0001', credit_note_date: '2026-05-10',
    credit_type: 'adjustment', status: 'issued', reason_code: null, reason_notes: null,
    subtotal: 1000, tax_rate: 18, tax_amount: 180, total_amount: 1180, applied_amount: 0,
    invoice_number: 'INV/25-26/0007', customer_name: 'Acme', company_name: null, case_no: null,
    currency_symbol: '₹', currency_position: 'before', decimal_places: 2, items: [],
    buyer_tax_number: '27ABCDE1234F1Z5', buyer_address: { state: 'Maharashtra' },
    reverse_charge: false, tax_lines: [],
    ...over,
  },
  companySettings: { basic_info: {} } as CreditNoteDocumentData['companySettings'],
});

describe('India statutory meta wiring on the credit-note adapter', () => {
  it('appends Place of Supply + Reverse Charge for in_gst_invoice', () => {
    const out = toCreditNoteEngineData(cnData({}), config({ statutoryProfileKey: 'in_gst_invoice' }));
    const labels = out.meta.map((m) => m.label.en);
    expect(labels).toContain('Place of Supply:');
    expect(labels).toContain('Reverse Charge:');
    const pos = out.meta.find((m) => m.label.en === 'Place of Supply:');
    expect(pos?.value).toBe('Maharashtra (27)');
  });

  it('emits NO statutory meta for a non-India profile (byte-stable)', () => {
    const out = toCreditNoteEngineData(cnData({}), config({ statutoryProfileKey: 'gcc_tax_invoice' }));
    expect(out.meta.some((m) => m.label.en === 'Place of Supply:')).toBe(false);
  });
});
