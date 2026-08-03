import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_LABEL_PRINTING_PREFS,
  normalizeLabelPrintingPrefs,
  labelEntityConfig,
  defaultLabelFields,
  getLabelPrintingPrefs,
  setLabelPrintingPrefs,
} from './labelPrefsService';
import { DEFAULT_LABEL_SIZE_ID } from './pdf/labels/labelSizes';

/** Stand-in for companySettingsService's stored row + its module-level cache. */
const settingsStub = vi.hoisted(() => ({
  row: { id: 'cs-1', metadata: {} as Record<string, unknown> },
  cache: null as null | { id: string; metadata: Record<string, unknown> },
}));

vi.mock('./companySettingsService', () => ({
  getOrCreateCompanySettings: async () => {
    if (!settingsStub.cache) settingsStub.cache = JSON.parse(JSON.stringify(settingsStub.row));
    return settingsStub.cache;
  },
  updateCompanySettings: async (updates: { metadata?: Record<string, unknown> }) => {
    settingsStub.row.metadata = updates.metadata ?? {};
    settingsStub.cache = null;
    return settingsStub.row;
  },
  invalidateCompanySettingsCache: () => {
    settingsStub.cache = null;
  },
}));

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

  it('migrates legacy { sizes, autoPrint } metadata forward with new-knob defaults', () => {
    // A tenant saved before the design knobs existed: sizes/autoPrint survive
    // verbatim; copies=1, QR/barcode on, and default field sets fill in.
    const prefs = normalizeLabelPrintingPrefs({
      sizes: { case: 'nb_40x30', stock: DEFAULT_LABEL_SIZE_ID, inventory: DEFAULT_LABEL_SIZE_ID },
      autoPrint: { case: true, stock: false, inventory: false },
    });
    expect(prefs.sizes.case).toBe('nb_40x30');
    expect(prefs.copies).toEqual({ case: 1, stock: 1, inventory: 1 });
    expect(prefs.showQr).toEqual({ case: true, stock: true, inventory: true });
    expect(prefs.showBarcode.case).toBe(true);
    expect(prefs.fields.case).toEqual(defaultLabelFields('case'));
    expect(prefs.fields.stock).toEqual(defaultLabelFields('stock'));
    expect(prefs.fields.inventory).toEqual(defaultLabelFields('inventory'));
  });

  it('defaults copies to 1 and clamps to 1–20', () => {
    expect(normalizeLabelPrintingPrefs(undefined).copies).toEqual({ case: 1, stock: 1, inventory: 1 });
    const p = normalizeLabelPrintingPrefs({ copies: { case: 0, stock: 999, inventory: 3.7 } });
    expect(p.copies.case).toBe(1);
    expect(p.copies.stock).toBe(20);
    expect(p.copies.inventory).toBe(3);
  });

  it('keeps only known field keys and coerces each to a boolean', () => {
    const p = normalizeLabelPrintingPrefs({
      fields: { case: { serial: false, bogus: true }, stock: { price: false } },
    });
    expect(p.fields.case.serial).toBe(false);
    expect(p.fields.case).not.toHaveProperty('bogus');
    expect(p.fields.case.customer).toBe(true); // untouched → default
    expect(p.fields.stock.price).toBe(false);
    expect(p.fields.inventory).toEqual(defaultLabelFields('inventory'));
  });

  it('coerces non-boolean showQr / showBarcode to their on defaults', () => {
    const p = normalizeLabelPrintingPrefs({
      showQr: { case: false, stock: 'yes' },
      showBarcode: { inventory: false },
    });
    expect(p.showQr.case).toBe(false);
    expect(p.showQr.stock).toBe(true); // 'yes' is not a boolean → default on
    expect(p.showBarcode.inventory).toBe(false);
    expect(p.showBarcode.case).toBe(true);
  });

  it('labelEntityConfig projects one entity into the shape the engine consumes', () => {
    const prefs = normalizeLabelPrintingPrefs({
      sizes: { stock: 'nb_50x30' },
      copies: { stock: 4 },
      showQr: { stock: false },
      fields: { stock: { price: false } },
    });
    const cfg = labelEntityConfig(prefs, 'stock');
    expect(cfg.sizeId).toBe('nb_50x30');
    expect(cfg.copies).toBe(4);
    expect(cfg.showQr).toBe(false);
    expect(cfg.fields.price).toBe(false);
    expect(cfg.fields.category).toBe(true);
  });

  it('defaults idAlign=left, showIcon=false, iconPosition=top-right for every entity', () => {
    const p = normalizeLabelPrintingPrefs(undefined);
    expect(p.idAlign).toEqual({ case: 'left', stock: 'left', inventory: 'left' });
    expect(p.showIcon).toEqual({ case: false, stock: false, inventory: false });
    expect(p.iconPosition).toEqual({ case: 'top-right', stock: 'top-right', inventory: 'top-right' });
    expect(p.icon).toBeUndefined();
  });

  it('coerces invalid idAlign / iconPosition back to their defaults and keeps valid ones', () => {
    const p = normalizeLabelPrintingPrefs({
      idAlign: { inventory: 'center', case: 'sideways' },
      iconPosition: { inventory: 'bottom-left', stock: 'nope' },
      showIcon: { inventory: true, case: 'yes' },
    });
    expect(p.idAlign.inventory).toBe('center');
    expect(p.idAlign.case).toBe('left');
    expect(p.iconPosition.inventory).toBe('bottom-left');
    expect(p.iconPosition.stock).toBe('top-right');
    expect(p.showIcon.inventory).toBe(true);
    expect(p.showIcon.case).toBe(false);
  });

  it('keeps a small valid icon data URL but rejects a non-data-URL or an oversized blob', () => {
    const ok = 'data:image/png;base64,AAAA';
    expect(normalizeLabelPrintingPrefs({ icon: ok }).icon).toBe(ok);
    expect(normalizeLabelPrintingPrefs({ icon: 'https://x/y.png' }).icon).toBeUndefined();
    expect(normalizeLabelPrintingPrefs({ icon: 'data:image/png;base64,' + 'A'.repeat(70000) }).icon).toBeUndefined();
  });

  it('the inventory date fields default OFF and survive normalization', () => {
    const p = normalizeLabelPrintingPrefs(undefined);
    expect(p.fields.inventory.added).toBe(false);
    expect(p.fields.inventory.printed).toBe(false);
    const enabled = normalizeLabelPrintingPrefs({ fields: { inventory: { added: true } } });
    expect(enabled.fields.inventory.added).toBe(true);
    expect(enabled.fields.inventory.printed).toBe(false);
  });

  it('labelEntityConfig projects idAlign / showIcon / iconPosition / icon', () => {
    const prefs = normalizeLabelPrintingPrefs({
      idAlign: { inventory: 'center' },
      showIcon: { inventory: true },
      iconPosition: { inventory: 'bottom-right' },
      icon: 'data:image/png;base64,AAAA',
    });
    const cfg = labelEntityConfig(prefs, 'inventory');
    expect(cfg.idAlign).toBe('center');
    expect(cfg.showIcon).toBe(true);
    expect(cfg.iconPosition).toBe('bottom-right');
    expect(cfg.icon).toBe('data:image/png;base64,AAAA');
  });

  it('defaults idScale to 1 per entity and clamps out-of-range / non-finite values', () => {
    expect(normalizeLabelPrintingPrefs(undefined).idScale).toEqual({ case: 1, stock: 1, inventory: 1 });
    const p = normalizeLabelPrintingPrefs({ idScale: { inventory: 1.5, case: 5, stock: 'big' } });
    expect(p.idScale.inventory).toBe(1.5);
    expect(p.idScale.case).toBe(2);
    expect(p.idScale.stock).toBe(1);
  });

  it('labelEntityConfig projects idScale', () => {
    const prefs = normalizeLabelPrintingPrefs({ idScale: { inventory: 1.25 } });
    expect(labelEntityConfig(prefs, 'inventory').idScale).toBe(1.25);
  });
});

describe('setLabelPrintingPrefs', () => {
  beforeEach(() => {
    settingsStub.row = { id: 'cs-1', metadata: {} };
    settingsStub.cache = null;
  });

  it('merges onto a fresh read so a sibling metadata bucket written elsewhere survives', async () => {
    // This tab loads company settings (populating the 5-minute cache)…
    await getLabelPrintingPrefs();
    // …then another admin saves table_columns straight to the row.
    settingsStub.row.metadata = { table_columns: { cases: { locked: ['case_number'] } } };

    await setLabelPrintingPrefs({
      ...DEFAULT_LABEL_PRINTING_PREFS,
      copies: { case: 3, stock: 1, inventory: 1 },
    });

    expect(settingsStub.row.metadata.table_columns).toEqual({
      cases: { locked: ['case_number'] },
    });
    expect(
      (settingsStub.row.metadata.label_printing as { copies: Record<string, number> }).copies.case,
    ).toBe(3);
  });
});
