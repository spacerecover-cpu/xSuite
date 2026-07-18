// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getQzPrefs, setQzPrefs, LABEL_DOTS_PER_MM } from './qzPrintService';

describe('qz prefs', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to auto mode when nothing is stored', () => {
    expect(getQzPrefs()).toEqual({ mode: 'auto', printer: undefined });
  });

  it('round-trips mode and printer through localStorage', () => {
    setQzPrefs({ mode: 'off', printer: 'OSCAR MetaPrint(ZPL)' });
    expect(getQzPrefs()).toEqual({ mode: 'off', printer: 'OSCAR MetaPrint(ZPL)' });
  });

  it('coerces an unknown mode and blank printer back to safe defaults', () => {
    localStorage.setItem('xsuite.labelPrint.qz', JSON.stringify({ mode: 'weird', printer: '' }));
    expect(getQzPrefs()).toEqual({ mode: 'auto', printer: undefined });
  });

  it('returns auto on corrupt JSON', () => {
    localStorage.setItem('xsuite.labelPrint.qz', '{not json');
    expect(getQzPrefs()).toEqual({ mode: 'auto', printer: undefined });
  });

  it('exposes 8 dots/mm (203 dpi)', () => {
    expect(LABEL_DOTS_PER_MM).toBe(8);
  });
});
