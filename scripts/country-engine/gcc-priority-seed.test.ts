import { describe, it, expect } from 'vitest';
import { GCC_PRIORITY_SEED, buildAllSeedRows } from './gcc-priority-seed';
import { MissingReferenceError } from './build-geo-seed';

// This is the HAND-VERIFIED reference seed for the GCC-6 + priority countries.
// It intentionally does NOT cover ~195 countries — that needs the CLDR/ISO
// dataset dependency (an owner decision, see blockers). Every value here is
// hand-checkable.

describe('GCC_PRIORITY_SEED', () => {
  it('covers the GCC-6 plus the priority anchor countries', () => {
    const codes = GCC_PRIORITY_SEED.map((c) => c.iso.alpha2).sort();
    // GCC-6
    for (const gcc of ['SA', 'AE', 'OM', 'KW', 'QA', 'BH']) {
      expect(codes, `missing GCC country ${gcc}`).toContain(gcc);
    }
    // priority anchors (already-configured markets)
    for (const anchor of ['GB', 'IN', 'US']) {
      expect(codes, `missing anchor ${anchor}`).toContain(anchor);
    }
  });

  it('gives every GCC country the Friday/Saturday weekend [5,6] (D15)', () => {
    for (const gcc of ['SA', 'AE', 'OM', 'KW', 'QA', 'BH']) {
      const entry = GCC_PRIORITY_SEED.find((c) => c.iso.alpha2 === gcc)!;
      expect(entry.cldr.weekendDays, `${gcc} weekend`).toEqual([5, 6]);
    }
  });

  it('preserves the 3-decimal currencies (OMR/BHD/KWD) — never collapses to 2 (D18-adjacent)', () => {
    for (const code of ['OM', 'BH', 'KW']) {
      const entry = GCC_PRIORITY_SEED.find((c) => c.iso.alpha2 === code)!;
      expect(entry.iso.currencyMinorUnits, `${code} minor units`).toBe(3);
    }
  });

  it('every seed entry carries the three keystones (currency, locale, firstDay) so none throw', () => {
    expect(() => buildAllSeedRows()).not.toThrow(MissingReferenceError);
    const rows = buildAllSeedRows();
    expect(rows.length).toBe(GCC_PRIORITY_SEED.length);
    for (const r of rows) {
      expect(r.currency_code.length).toBe(3);
      expect(r.config_status).toBe('formatting_ready');
      expect(r.country_config.datetime.weekend_days.length).toBeGreaterThan(0);
    }
  });

  it('US keeps its real en-US / MM/DD/YYYY identity (not fabricated — it is genuinely US here)', () => {
    const us = buildAllSeedRows().find((r) => r.code === 'US')!;
    expect(us.locale_code).toBe('en-US');
    expect(us.date_format).toBe('MM/DD/YYYY');
    expect(us.country_config.datetime.weekend_days).toEqual([6, 0]); // Sat/Sun
  });
});
