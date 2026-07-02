// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_STAT_CARD_STYLE,
  STAT_CARD_STYLES,
  normalizeStatCardStyle,
  readStatCardStyleHint,
  writeStatCardStyleHint,
} from './statCardStyleService';

describe('normalizeStatCardStyle', () => {
  it('accepts both styles', () => {
    expect(normalizeStatCardStyle('compact')).toBe('compact');
    expect(normalizeStatCardStyle('vivid')).toBe('vivid');
  });

  it('rejects anything else', () => {
    expect(normalizeStatCardStyle('gradient')).toBeUndefined();
    expect(normalizeStatCardStyle(null)).toBeUndefined();
    expect(normalizeStatCardStyle(1)).toBeUndefined();
  });

  it('default is a valid style', () => {
    expect(STAT_CARD_STYLES).toContain(DEFAULT_STAT_CARD_STYLE);
  });
});

describe('stat card style hint', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through localStorage', () => {
    writeStatCardStyleHint('vivid');
    expect(readStatCardStyleHint()).toBe('vivid');
  });

  it('returns undefined when unset or corrupt', () => {
    expect(readStatCardStyleHint()).toBeUndefined();
    localStorage.setItem('xsuite_stat_card_style', 'nonsense');
    expect(readStatCardStyleHint()).toBeUndefined();
  });
});
