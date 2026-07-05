import { describe, it, expect } from 'vitest';
import { simpleVat } from './index';
import type { TaxContext } from '../types';
import omStandard from './fixtures/om-standard-invoice.json';
import omZero from './fixtures/om-zero-rated-export.json';
import omDiscount from './fixtures/om-doc-discount-mils.json';
import aeStandard from './fixtures/ae_standard_invoice.json';
import aeZero from './fixtures/ae_zero_rated_export.json';
import saStandard from './fixtures/sa_standard_invoice.json';
import saMultiline from './fixtures/sa_multiline_line_rounding.json';

const fixtures = [omStandard, omZero, omDiscount, aeStandard, aeZero, saStandard, saMultiline] as Array<{
  name: string; input_document: TaxContext;
  expected: { totals: Record<string, number | null>; rollups: Array<Record<string, unknown>> };
}>;

describe('simple_vat golden fixtures (Oman pack v1 evidence)', () => {
  it('identity: key/version/mode/defaults per contract', () => {
    expect(simpleVat.key).toBe('simple_vat');
    expect(simpleVat.version).toBe('1.0.0');
    expect(simpleVat.schemeMode).toBe('single');
    expect(simpleVat.defaults).toEqual({
      roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western',
    });
  });
  fixtures.forEach((f) => {
    it(`fixture: ${f.name}`, async () => {
      const c = await simpleVat.compute(f.input_document);
      expect(c.totals).toEqual(f.expected.totals);
      f.expected.rollups.forEach((r, i) => expect(c.rollups[i]).toMatchObject(r));
      expect(c.trace.regimeKey).toBe('simple_vat');
      expect(c.trace.pluginVersion).toBe('1.0.0');
    });
  });
});
