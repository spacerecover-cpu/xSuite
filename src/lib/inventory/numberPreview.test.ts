import { describe, expect, it } from 'vitest';
import { inventoryNumberPreview, willReissueNumber } from './numberPreview';

const HDD35 = 'dt-3.5';
const HDD25 = 'dt-2.5';

const deviceTypes = [
  { id: HDD35, inventory_prefix: 'BIG' },
  { id: HDD25, inventory_prefix: 'SMALL' },
  { id: 'dt-new', inventory_prefix: null },
];

// The tenant's real configuration lives here; catalog_device_types.inventory_prefix
// is GLOBAL and shared by every tenant, so it can only ever be a fallback.
const sequences = [
  { scope: `inventory:${HDD35}`, prefix: 'H35' },
  { scope: `inventory:${HDD25}`, prefix: 'H25' },
];

describe('inventoryNumberPreview', () => {
  it('prefers the tenant sequence over the global catalog default', () => {
    expect(inventoryNumberPreview(sequences, deviceTypes, HDD35)).toBe('H35-…');
    expect(inventoryNumberPreview(sequences, deviceTypes, HDD25)).toBe('H25-…');
  });

  // The bug as reported: badge read 'BIG' from the shared catalog while the DB
  // allocator wrote H35 from number_sequences.
  it('never shows the catalog default when a tenant sequence exists', () => {
    expect(inventoryNumberPreview(sequences, deviceTypes, HDD35)).not.toContain('BIG');
  });

  it('falls back to the catalog default when the tenant has no sequence yet', () => {
    // mirrors get_next_inventory_number's lazy seed on first allocation
    expect(inventoryNumberPreview([], deviceTypes, HDD35)).toBe('BIG-…');
  });

  it('returns empty when nothing can be resolved', () => {
    expect(inventoryNumberPreview([], deviceTypes, 'dt-new')).toBe('');
    expect(inventoryNumberPreview(sequences, deviceTypes, '')).toBe('');
    expect(inventoryNumberPreview(undefined, undefined, HDD35)).toBe('');
  });

  it('ignores a tenant sequence with a blank prefix rather than rendering "-…"', () => {
    expect(inventoryNumberPreview([{ scope: `inventory:${HDD35}`, prefix: '  ' }], deviceTypes, HDD35))
      .toBe('BIG-…');
  });

  it('does not match a different device type by scope prefix collision', () => {
    expect(inventoryNumberPreview([{ scope: 'inventory:dt-3.5-extra', prefix: 'XX' }], deviceTypes, HDD35))
      .toBe('BIG-…');
  });
});

describe('willReissueNumber', () => {
  it('is true when the type moves away from the series that issued the number', () => {
    expect(willReissueNumber({ issuedByDeviceTypeId: HDD35, selectedDeviceTypeId: HDD25 })).toBe(true);
  });

  it('is false while the type still matches the issuing series', () => {
    expect(willReissueNumber({ issuedByDeviceTypeId: HDD35, selectedDeviceTypeId: HDD35 })).toBe(false);
  });

  // NULL issuing type = outside the managed scheme (legacy / imported / manual).
  // The DB trigger leaves those alone, so the UI must not promise a reissue.
  it('is false for a number outside the managed scheme', () => {
    expect(willReissueNumber({ issuedByDeviceTypeId: null, selectedDeviceTypeId: HDD25 })).toBe(false);
  });

  it('is false with no selection yet', () => {
    expect(willReissueNumber({ issuedByDeviceTypeId: HDD35, selectedDeviceTypeId: '' })).toBe(false);
  });
});
