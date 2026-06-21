import { describe, it, expect } from 'vitest';
import { contrastRatio, relativeLuminance, generatePalette, isHex } from './palette';

const WHITE = '#ffffff';

describe('contrastRatio', () => {
  it('is 21:1 for black on white and 1:1 for identical colors', () => {
    expect(contrastRatio('#000000', WHITE)).toBeCloseTo(21, 0);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#10b981', WHITE)).toBeCloseTo(contrastRatio(WHITE, '#10b981'), 5);
  });

  it('returns 1 for malformed colors (never throws)', () => {
    expect(contrastRatio('nope', WHITE)).toBe(1);
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
  });
});

describe('isHex', () => {
  it('accepts #rgb / #rrggbb and rejects the rest', () => {
    expect(isHex('#abc')).toBe(true);
    expect(isHex('#10B981')).toBe(true);
    expect(isHex('10b981')).toBe(false);
    expect(isHex('rgb(0,0,0)')).toBe(false);
  });
});

describe('generatePalette', () => {
  const seeds = ['#10b981', '#1e5bb8', '#dc2626', '#6b21a8', '#0f766e', '#b45309'];

  it('keeps the seed as the accent (normalized lowercase)', () => {
    expect(generatePalette('#10B981').accent).toBe('#10b981');
  });

  it('derives a WCAG-safe set for any seed', () => {
    for (const seed of seeds) {
      const p = generatePalette(seed);
      expect(isHex(p.text!)).toBe(true);
      expect(isHex(p.label!)).toBe(true);
      expect(isHex(p.headerBackground!)).toBe(true);
      // Body text on white must clear AAA (7:1); label on white AA (4.5:1).
      expect(contrastRatio(p.text!, WHITE)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(p.label!, WHITE)).toBeGreaterThanOrEqual(4.5);
      // Body text on the tinted header background must clear AA (4.5:1).
      expect(contrastRatio(p.text!, p.headerBackground!)).toBeGreaterThanOrEqual(4.5);
      expect(p.headerBackgroundEnabled).toBe(true);
    }
  });

  it('falls back to a neutral palette for a malformed seed without throwing', () => {
    const p = generatePalette('not-a-color');
    expect(isHex(p.accent!)).toBe(true);
    expect(contrastRatio(p.text!, WHITE)).toBeGreaterThanOrEqual(7);
  });
});
