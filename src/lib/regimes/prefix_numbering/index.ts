import type { NumberingPolicy, NumberSequenceSeed } from '../types';

// The REAL scope registry (live number_sequences scopes ∪ every get_next_number
// caller in src/lib — verified 2026-07-02). 'inventory:*' scopes are dynamic
// per-device-type and auto-created by get_next_number; they are not seeded here.
const LEGACY_SCOPES: Array<{ scope: string; prefix: string }> = [
  { scope: 'invoices', prefix: 'INVO' },
  { scope: 'proforma_invoices', prefix: 'PRO' },
  { scope: 'quote', prefix: 'QUOT' },
  { scope: 'case', prefix: 'CASE' },
  { scope: 'customers', prefix: 'CUST' },
  { scope: 'companies', prefix: 'COMP' },
  { scope: 'payment', prefix: 'PAYM' },
  { scope: 'expense', prefix: 'EXPE' },
  { scope: 'stock', prefix: 'STOC' },
  { scope: 'stock_adjustment', prefix: 'STOC' },
  { scope: 'purchase_orders', prefix: 'PURC' },
  { scope: 'suppliers', prefix: 'SUPP' },
  { scope: 'report_evaluation', prefix: 'REVL' },
  { scope: 'report_service', prefix: 'RSVC' },
  { scope: 'payroll_bank_file', prefix: 'PAYR' },
];

/** Legacy prefix numbering: PREFIX-{SEQ:padding}, never resets, no template. */
export const prefixNumbering: NumberingPolicy = {
  key: 'prefix_numbering',
  version: '1.0.0',
  defaultSequences(): NumberSequenceSeed[] {
    return LEGACY_SCOPES.map(({ scope, prefix }) => ({
      scope, prefix, format_template: null, reset_basis: 'never',
      fiscal_year_anchor: null, max_length: null, padding: 4,
    }));
  },
};
