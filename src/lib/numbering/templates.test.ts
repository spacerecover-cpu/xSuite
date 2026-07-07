import { describe, it, expect } from 'vitest';
import { fiscalYearLabel, renderNumberTemplate, validateNumberingTemplate } from './templates';

describe('fiscalYearLabel (short form, spec §3)', () => {
  it('renders 26-27 on and after the 04-01 anchor', () => {
    expect(fiscalYearLabel('04-01', new Date(2026, 3, 1))).toBe('26-27');
    expect(fiscalYearLabel('04-01', new Date(2026, 6, 5))).toBe('26-27');
  });

  it('renders 25-26 before the anchor', () => {
    expect(fiscalYearLabel('04-01', new Date(2026, 2, 31))).toBe('25-26');
  });

  it('defaults are calendar-year-like with a 01-01 anchor', () => {
    expect(fiscalYearLabel('01-01', new Date(2026, 0, 1))).toBe('26-27');
  });
});

describe('renderNumberTemplate', () => {
  it('renders INV/{FY}/{SEQ:4} to exactly 14 characters (rule 46(b) headroom)', () => {
    const out = renderNumberTemplate('INV/{FY}/{SEQ:4}', 42, '04-01', new Date(2026, 6, 5));
    expect(out).toBe('INV/26-27/0042');
    expect(out).toHaveLength(14);
  });

  it('grows SEQ beyond the pad width instead of truncating (9999 → 10000)', () => {
    expect(renderNumberTemplate('INV/{FY}/{SEQ:4}', 9999, '04-01', new Date(2026, 6, 5))).toBe('INV/26-27/9999');
    expect(renderNumberTemplate('INV/{FY}/{SEQ:4}', 10000, '04-01', new Date(2026, 6, 5))).toBe('INV/26-27/10000');
  });

  it('throws on a template with no {SEQ:n} token (DB parity: get_next_number RAISEs)', () => {
    expect(() => renderNumberTemplate('INV/{FY}', 1, '04-01', new Date(2026, 6, 5))).toThrow('{SEQ:n}');
  });
});

describe('validateNumberingTemplate (charset as TEMPLATE validation — no charset column)', () => {
  it('accepts the India invoice template', () => {
    expect(validateNumberingTemplate('INV/{FY}/{SEQ:4}', 16)).toEqual([]);
  });

  it('rejects literal characters outside [A-Za-z0-9/-]', () => {
    expect(validateNumberingTemplate('INV#{FY}/{SEQ:4}', 16)).toContainEqual(
      expect.stringContaining('[A-Za-z0-9/-]'),
    );
    expect(validateNumberingTemplate('INV {FY}/{SEQ:4}', 16)).toContainEqual(
      expect.stringContaining('[A-Za-z0-9/-]'),
    );
  });

  it('requires exactly one {SEQ:n} token', () => {
    expect(validateNumberingTemplate('INV/{FY}', 16)).toContainEqual(
      expect.stringContaining('exactly one {SEQ:n}'),
    );
    expect(validateNumberingTemplate('{SEQ:2}/{SEQ:4}', 16)).toContainEqual(
      expect.stringContaining('exactly one {SEQ:n}'),
    );
  });

  it('rejects a template whose minimum rendered length already exceeds max_length', () => {
    // literals 'INVOICE-SERIES//' (16) + FY (5) + pad 4 = 25 > 16
    expect(validateNumberingTemplate('INVOICE-SERIES/{FY}/{SEQ:4}', 16)).toContainEqual(
      expect.stringContaining('max_length'),
    );
  });
});
