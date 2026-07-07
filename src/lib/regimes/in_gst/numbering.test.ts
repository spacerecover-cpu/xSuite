import { describe, it, expect, beforeAll } from 'vitest';
import { inFiscalNumberingPolicy, IN_FISCAL_SEQUENCE_TEMPLATES } from './numbering';
import { resolveNumberingPolicy, listRegisteredCapabilities } from '../registry';
import { registerAllRegimePlugins } from '../register';
import { renderNumberTemplate, validateNumberingTemplate } from '../../numbering/templates';

beforeAll(() => registerAllRegimePlugins());

describe('in_fiscal_numbering policy', () => {
  it('is registered under its data key and identity-correct', () => {
    expect(resolveNumberingPolicy('in_fiscal_numbering')).toBe(inFiscalNumberingPolicy);
    expect(inFiscalNumberingPolicy.key).toBe('in_fiscal_numbering');
    expect(inFiscalNumberingPolicy.version).toBe('1.0.0');
  });

  it('projects into the capability manifest input (S7 asserts the DB row)', () => {
    expect(listRegisteredCapabilities()).toContainEqual({
      capability_key: 'in_fiscal_numbering', kind: 'numbering', version: '1.0.0',
    });
  });

  it('seeds exactly the five FINANCIAL document scopes — cases/devices/inventory untouched', () => {
    const seeds = inFiscalNumberingPolicy.defaultSequences({ countryCode: 'IN', fiscalYearStart: '04-01' });
    expect(seeds.map((s) => s.scope).sort()).toEqual(
      ['credit_note', 'delivery_challan', 'invoices', 'receipt_voucher', 'refund_voucher'],
    );
    expect(seeds.map((s) => s.scope)).not.toContain('case');
  });

  it('every seed is fiscal-year 04-01, template-driven, max_length 16, padding 4, null prefix', () => {
    for (const s of inFiscalNumberingPolicy.defaultSequences({ countryCode: 'IN', fiscalYearStart: '04-01' })) {
      expect(s).toEqual({
        scope: s.scope,
        prefix: null,
        format_template: expect.stringMatching(/^[A-Z]{2,3}\/\{FY\}\/\{SEQ:4\}$/),
        reset_basis: 'fiscal_year',
        fiscal_year_anchor: '04-01',
        max_length: 16,
        padding: 4,
      });
    }
  });

  it('falls back to the 04-01 anchor when the country row has no fiscalYearStart', () => {
    const seeds = inFiscalNumberingPolicy.defaultSequences({ countryCode: 'IN', fiscalYearStart: '' });
    expect(seeds.every((s) => s.fiscal_year_anchor === '04-01')).toBe(true);
  });

  it('rule 46(b): every template renders within the 16-char cap at pad width — SEQ headroom to 6 digits', () => {
    for (const { template } of IN_FISCAL_SEQUENCE_TEMPLATES) {
      expect(validateNumberingTemplate(template, 16)).toEqual([]);
      const at4 = renderNumberTemplate(template, 42, '04-01', new Date(2026, 6, 5));
      expect(at4.length).toBeLessThanOrEqual(14); // 3-letter prefixes → 14; 'DC' challan → 13
      const at6 = renderNumberTemplate(template, 999999, '04-01', new Date(2026, 6, 5));
      expect(at6.length).toBeLessThanOrEqual(16);
    }
  });
});
