import { describe, it, expect } from 'vitest';
import { toCreditNoteEngineData } from './creditNoteAdapter';
import type { CreditNoteDocumentData, DocumentTaxLine } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';

const rollups: DocumentTaxLine[] = [
  { line_item_id: null, component_code: 'CGST', component_label: 'CGST', rate: 9, taxable_base: -1000, tax_amount: -90, tax_treatment: 'standard', treatment_reason_code: null, sequence: 1, backfilled: false, rule_trace: null },
  { line_item_id: null, component_code: 'SGST', component_label: 'SGST', rate: 9, taxable_base: -1000, tax_amount: -90, tax_treatment: 'standard', treatment_reason_code: null, sequence: 2, backfilled: false, rule_trace: null },
];

const config: DocumentTemplateConfig = {
  sections: [{ key: 'lineItems', columns: [] }, { key: 'totals', lines: {} }],
  statutoryProfileKey: 'in_gst_invoice',
} as unknown as DocumentTemplateConfig;

const data: CreditNoteDocumentData = {
  creditNoteData: {
    credit_note_number: 'CN/25-26/0001', credit_note_date: '2026-05-10',
    credit_type: 'adjustment', status: 'issued', reason_code: 'price_revision', reason_notes: null,
    subtotal: -1000, tax_rate: 18, tax_amount: -180, total_amount: -1180, applied_amount: 0,
    invoice_number: 'INV/25-26/0007', invoice_date: '2026-04-02',
    customer_name: 'Acme', company_name: null, case_no: null,
    currency_symbol: '₹', currency_position: 'before', decimal_places: 2, items: [],
    buyer_tax_number: '27ABCDE1234F1Z5', buyer_address: { state: 'Maharashtra' },
    reverse_charge: false, tax_lines: rollups,
  },
  companySettings: { basic_info: {} } as CreditNoteDocumentData['companySettings'],
};

describe('India credit-note render', () => {
  it('renders one totals row per stored NEGATIVE head rollup (never the single header scalar)', () => {
    const out = toCreditNoteEngineData(data, config);
    const taxRows = (out.totals ?? []).filter((t) => t.label.en === 'CGST' || t.label.en === 'SGST');
    expect(taxRows.length).toBe(2);
    expect(taxRows.map((t) => t.label.en)).toEqual(['CGST', 'SGST']);
  });

  it('carries an original tax invoice reference block with number AND date (r.53)', () => {
    const out = toCreditNoteEngineData(data, config);
    const ref = out.meta.find((m) => m.label.en.startsWith('Revision of Tax Invoice'));
    expect(ref?.value).toContain('INV/25-26/0007');
    expect(ref?.value).toContain('2026-04-02');
  });
});
