import { describe, it, expect } from 'vitest';
import { SETTINGS_CATEGORIES, TABLE_LABELS, hasActiveToggle, ACTIVE_TOGGLE_TABLES } from './settingsCategories';

describe('Devices & Inventory settings — interface catalog consolidation', () => {
  const deviceMedia = SETTINGS_CATEGORIES.find((c) => c.id === 'device-media')!;

  it('exposes catalog_interfaces and not catalog_device_interfaces', () => {
    expect(deviceMedia.tables).toContain('catalog_interfaces');
    expect(deviceMedia.tables).not.toContain('catalog_device_interfaces');
  });

  it('labels catalog_interfaces as "Interfaces" and has no catalog_device_interfaces label', () => {
    expect(TABLE_LABELS.catalog_interfaces).toBe('Interfaces');
    expect((TABLE_LABELS as Record<string, string>).catalog_device_interfaces).toBeUndefined();
  });
});

describe('Settings master-data — active/inactive toggle scope', () => {
  it('enables the visibility toggle for device + service catalogs', () => {
    expect(hasActiveToggle('catalog_interfaces')).toBe(true);
    expect(hasActiveToggle('catalog_device_types')).toBe(true);
    expect(hasActiveToggle('master_inventory_condition_types')).toBe(true);
    expect(hasActiveToggle('catalog_service_types')).toBe(true);
  });

  it('does not enable the toggle for platform-managed / non-catalog tables', () => {
    // These are not admin-writable per the catalog perms migration, so a toggle would error.
    expect(hasActiveToggle('geo_countries')).toBe(false);
    expect(hasActiveToggle('master_industries')).toBe(false);
  });

  it('every ACTIVE_TOGGLE_TABLES entry is a real device-media or case-service table', () => {
    const operational = new Set([
      ...SETTINGS_CATEGORIES.find((c) => c.id === 'device-media')!.tables,
      ...SETTINGS_CATEGORIES.find((c) => c.id === 'case-service')!.tables,
    ]);
    for (const t of ACTIVE_TOGGLE_TABLES) {
      expect(operational.has(t)).toBe(true);
    }
  });
});
