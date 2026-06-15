import { describe, it, expect } from 'vitest';
import { toDateFnsFormat, fmtDateWithConfig } from './configDate';

describe('toDateFnsFormat', () => {
  it('maps stored uppercase country formats to date-fns tokens', () => {
    expect(toDateFnsFormat('MM/DD/YYYY')).toBe('MM/dd/yyyy');
    expect(toDateFnsFormat('DD/MM/YYYY')).toBe('dd/MM/yyyy');
    expect(toDateFnsFormat('YYYY-MM-DD')).toBe('yyyy-MM-dd');
    expect(toDateFnsFormat('DD-MM-YYYY')).toBe('dd-MM-yyyy');
  });
  it('falls back to dd MMM yyyy for an empty/unknown stored format (current PDF default)', () => {
    expect(toDateFnsFormat(null)).toBe('dd MMM yyyy');
    expect(toDateFnsFormat('')).toBe('dd MMM yyyy');
    expect(toDateFnsFormat('garbage')).toBe('dd MMM yyyy');
  });
  it('passes through an already-valid date-fns pattern unchanged', () => {
    expect(toDateFnsFormat('dd MMM yyyy')).toBe('dd MMM yyyy');
  });
});

describe('fmtDateWithConfig', () => {
  const d = '2026-03-09T14:05:00.000Z';
  it('formats a date with the resolved country pattern', () => {
    expect(fmtDateWithConfig(d, { dateFormat: 'DD/MM/YYYY' })).toBe('09/03/2026');
    expect(fmtDateWithConfig(d, { dateFormat: 'MM/DD/YYYY' })).toBe('03/09/2026');
  });
  it('appends a HH:mm time suffix when withTime is set, after the configured date', () => {
    const out = fmtDateWithConfig(d, { dateFormat: 'DD/MM/YYYY' }, { withTime: true });
    expect(out.startsWith('09/03/2026 ')).toBe(true);
    expect(/\d{2}:\d{2}$/.test(out)).toBe(true);
  });
  it('uses the PDF default when no config is supplied (back-compat)', () => {
    expect(fmtDateWithConfig(d, undefined)).toBe('09 Mar 2026');
  });
  it('returns "-" for a null date (parity with formatDate)', () => {
    expect(fmtDateWithConfig(null, { dateFormat: 'DD/MM/YYYY' })).toBe('-');
  });
});
