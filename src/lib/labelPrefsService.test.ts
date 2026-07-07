import { describe, it, expect } from 'vitest';
import { DEFAULT_LABEL_PRINTING_PREFS, normalizeLabelPrintingPrefs } from './labelPrefsService';
import { DEFAULT_LABEL_SIZE_ID } from './pdf/labels/labelSizes';

describe('normalizeLabelPrintingPrefs', () => {
  it('returns defaults for missing or garbage metadata', () => {
    expect(normalizeLabelPrintingPrefs(undefined)).toEqual(DEFAULT_LABEL_PRINTING_PREFS);
    expect(normalizeLabelPrintingPrefs(null)).toEqual(DEFAULT_LABEL_PRINTING_PREFS);
    expect(normalizeLabelPrintingPrefs('nonsense')).toEqual(DEFAULT_LABEL_PRINTING_PREFS);
    expect(normalizeLabelPrintingPrefs(42)).toEqual(DEFAULT_LABEL_PRINTING_PREFS);
  });

  it('defaults every size to the 15×26 stock and auto-print to off', () => {
    const prefs = normalizeLabelPrintingPrefs(undefined);
    expect(prefs.sizes).toEqual({
      case: DEFAULT_LABEL_SIZE_ID,
      stock: DEFAULT_LABEL_SIZE_ID,
      inventory: DEFAULT_LABEL_SIZE_ID,
    });
    expect(prefs.autoPrint).toEqual({ case: false, stock: false, inventory: false });
  });

  it('keeps valid stored values', () => {
    const prefs = normalizeLabelPrintingPrefs({
      sizes: { case: 'dymo_30252', stock: 'nb_40x30', inventory: 'zebra_2x1' },
      autoPrint: { case: true, stock: false, inventory: true },
    });
    expect(prefs.sizes.case).toBe('dymo_30252');
    expect(prefs.sizes.stock).toBe('nb_40x30');
    expect(prefs.autoPrint).toEqual({ case: true, stock: false, inventory: true });
  });

  it('replaces unknown size ids with the default', () => {
    const prefs = normalizeLabelPrintingPrefs({ sizes: { case: 'retired_size' } });
    expect(prefs.sizes.case).toBe(DEFAULT_LABEL_SIZE_ID);
  });

  it('merges partial objects and coerces non-boolean autoPrint flags to false', () => {
    const prefs = normalizeLabelPrintingPrefs({
      sizes: { stock: 'nb_30x20' },
      autoPrint: { case: 'yes', inventory: true },
    });
    expect(prefs.sizes.stock).toBe('nb_30x20');
    expect(prefs.sizes.case).toBe(DEFAULT_LABEL_SIZE_ID);
    expect(prefs.autoPrint.case).toBe(false);
    expect(prefs.autoPrint.inventory).toBe(true);
    expect(prefs.autoPrint.stock).toBe(false);
  });
});
