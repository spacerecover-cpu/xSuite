import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LABEL_SIZE_ID,
  LABEL_SIZE_PRESETS,
  getLabelSize,
  labelMarginPt,
  mmToPt,
  sizeClass,
  supportsBarcode,
} from './labelSizes';

describe('LABEL_SIZE_PRESETS', () => {
  it('has unique ids', () => {
    const ids = LABEL_SIZE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the tenant 15×26 Niimbot stock as printed 26mm wide × 15mm tall', () => {
    const preset = LABEL_SIZE_PRESETS.find((p) => p.id === 'nb_15x26');
    expect(preset).toBeDefined();
    expect(preset!.widthMm).toBe(26);
    expect(preset!.heightMm).toBe(15);
  });

  it('is the default preset', () => {
    expect(DEFAULT_LABEL_SIZE_ID).toBe('nb_15x26');
    expect(LABEL_SIZE_PRESETS.some((p) => p.id === DEFAULT_LABEL_SIZE_ID)).toBe(true);
  });

  it('every preset has positive dimensions, a name and printer hint', () => {
    for (const p of LABEL_SIZE_PRESETS) {
      expect(p.widthMm).toBeGreaterThan(0);
      expect(p.heightMm).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.printers.length).toBeGreaterThan(0);
    }
  });
});

describe('getLabelSize', () => {
  it('resolves a known id', () => {
    expect(getLabelSize('dymo_30252').widthMm).toBe(89);
  });

  it('falls back to the default for unknown or missing ids', () => {
    expect(getLabelSize('bogus').id).toBe(DEFAULT_LABEL_SIZE_ID);
    expect(getLabelSize(undefined).id).toBe(DEFAULT_LABEL_SIZE_ID);
  });
});

describe('mmToPt', () => {
  it('converts millimetres to PostScript points', () => {
    expect(mmToPt(26)).toBeCloseTo(73.7, 1);
    expect(mmToPt(15)).toBeCloseTo(42.5, 1);
  });
});

describe('sizeClass', () => {
  it('classifies short stock as strip', () => {
    expect(sizeClass(getLabelSize('nb_15x26'))).toBe('strip');
    expect(sizeClass(getLabelSize('nb_12x40'))).toBe('strip');
    expect(sizeClass(getLabelSize('dymo_30333'))).toBe('strip');
  });

  it('classifies near-square stock as square', () => {
    expect(sizeClass(getLabelSize('sq_25'))).toBe('square');
  });

  it('classifies the rest as card', () => {
    expect(sizeClass(getLabelSize('nb_40x30'))).toBe('card');
    expect(sizeClass(getLabelSize('zebra_2x1'))).toBe('card');
    expect(sizeClass(getLabelSize('brother_dk11201'))).toBe('card');
  });
});

describe('supportsBarcode', () => {
  it('allows Code128 only on stock at least 50mm wide and 25mm tall', () => {
    expect(supportsBarcode(getLabelSize('zebra_2x1'))).toBe(true);
    expect(supportsBarcode(getLabelSize('dymo_30252'))).toBe(true);
    expect(supportsBarcode(getLabelSize('nb_15x26'))).toBe(false);
    expect(supportsBarcode(getLabelSize('nb_40x30'))).toBe(false);
    expect(supportsBarcode(getLabelSize('nb_12x40'))).toBe(false);
  });
});

describe('labelMarginPt', () => {
  it('uses tighter margins on narrow stock', () => {
    expect(labelMarginPt(getLabelSize('nb_15x26'))).toBeCloseTo(mmToPt(1.5), 2);
    expect(labelMarginPt(getLabelSize('dymo_30252'))).toBeCloseTo(mmToPt(2), 2);
  });
});
