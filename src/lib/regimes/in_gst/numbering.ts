//
// CGST Rules rule 46(b): consecutive serial number, unique for a financial year,
// max 16 characters, charset [A-Za-z0-9/-]. These seeds MIRROR the
// master_numbering_policies IN rows seeded by WP-S1b — the live parity test
// fails on any drift, and the publish gate's coverage check (④) independently
// validates template-vs-max_length DB-side. {FY} renders SHORT form ('26-27'), so
// each template is 14 chars at pad width, leaving SEQ headroom to 6 digits inside
// the 16-char cap. Financial document scopes ONLY: case/device/inventory numbering
// is out of regime scope.
import type { NumberingPolicy, NumberSequenceSeed } from '../types';
import { validateNumberingTemplate } from '../../numbering/templates';

export const IN_FISCAL_SEQUENCE_TEMPLATES: ReadonlyArray<{ scope: string; template: string }> = [
  { scope: 'invoices', template: 'INV/{FY}/{SEQ:4}' },
  { scope: 'credit_note', template: 'CRN/{FY}/{SEQ:4}' },
  { scope: 'receipt_voucher', template: 'RCV/{FY}/{SEQ:4}' },
  { scope: 'refund_voucher', template: 'RFV/{FY}/{SEQ:4}' },
  { scope: 'delivery_challan', template: 'DC/{FY}/{SEQ:4}' },
];

const RULE_46B_MAX_LENGTH = 16;

export const inFiscalNumberingPolicy: NumberingPolicy = {
  key: 'in_fiscal_numbering',
  version: '1.0.0',
  defaultSequences(country: { countryCode: string; fiscalYearStart: string }): NumberSequenceSeed[] {
    const anchor = country.fiscalYearStart || '04-01';
    return IN_FISCAL_SEQUENCE_TEMPLATES.map(({ scope, template }) => {
      const errors = validateNumberingTemplate(template, RULE_46B_MAX_LENGTH);
      if (errors.length > 0) {
        throw new Error(`in_fiscal_numbering seed for scope "${scope}" is invalid: ${errors.join('; ')}`);
      }
      return {
        scope, prefix: null, format_template: template, reset_basis: 'fiscal_year',
        fiscal_year_anchor: anchor, max_length: RULE_46B_MAX_LENGTH, padding: 4,
      };
    });
  },
};
