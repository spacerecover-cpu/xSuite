// src/lib/devices/deviceCatalogQueries.test.ts
import { describe, it, expect } from 'vitest';
import { CATALOG_SOURCES } from './deviceCatalogQueries';
import { BASIC_FIELDS, getDeviceFamilyConfig, type CatalogKey } from './deviceFieldConfig';

const FAMILIES = ['hdd','ssd','usb_flash','memory_card','mobile','raid','nas','other'] as const;

describe('CATALOG_SOURCES', () => {
  it('covers every optionsSource referenced by any field', () => {
    const used = new Set<CatalogKey>();
    const all = [...BASIC_FIELDS, ...FAMILIES.flatMap(f => {
      const c = getDeviceFamilyConfig(f); return [...c.technical, ...c.components];
    })];
    all.forEach(f => { if (f.optionsSource) used.add(f.optionsSource); });
    for (const key of used) {
      expect(CATALOG_SOURCES[key], `missing source for ${key}`).toBeTruthy();
      expect(typeof CATALOG_SOURCES[key].table).toBe('string');
    }
  });

  it('component_statuses uses valueField "name" so reports store readable labels', () => {
    expect(CATALOG_SOURCES.component_statuses.valueField).toBe('name');
  });

  it('all other catalog sources do NOT set valueField to "name" (they use id)', () => {
    const nameValued = new Set<CatalogKey>(['component_statuses', 'service_problems']);
    const others = (Object.keys(CATALOG_SOURCES) as CatalogKey[]).filter(k => !nameValued.has(k));
    for (const key of others) {
      expect(CATALOG_SOURCES[key].valueField, `${key} should not use name as value`).not.toBe('name');
    }
  });

  it('service_problems source exists with valueField "name" and correct table', () => {
    expect(CATALOG_SOURCES.service_problems).toBeTruthy();
    expect(CATALOG_SOURCES.service_problems.table).toBe('catalog_service_problems');
    expect(CATALOG_SOURCES.service_problems.valueField).toBe('name');
  });
});
