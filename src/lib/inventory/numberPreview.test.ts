import { describe, expect, it } from 'vitest';
import { inventoryNumberPreview, willReissueNumber } from './numberPreview';

const HDD35 = 'dt-3.5';
const HDD25 = 'dt-2.5';

const deviceTypes = [
  { id: HDD35, inventory_prefix: 'BIG', inventory_padding: 4 },
  { id: HDD25, inventory_prefix: 'SMALL', inventory_padding: 4 },
  { id: 'dt-new', inventory_prefix: null },
];

// The tenant's real configuration lives here; catalog_device_types.inventory_prefix
// is GLOBAL and shared by every tenant, so it can only ever be a fallback.
// current_value is the LAST allocated number, so the preview is value + 1.
const sequences = [
  { scope: `inventory:${HDD35}`, prefix: 'H35', current_value: 49, padding: 4 },
  { scope: `inventory:${HDD25}`, prefix: 'H25', current_value: 1508, padding: 4 },
];

describe('inventoryNumberPreview', () => {
  it('shows the concrete next number from the tenant sequence', () => {
    expect(inventoryNumberPreview(sequences, deviceTypes, HDD35)).toBe('H35-0050');
    expect(inventoryNumberPreview(sequences, deviceTypes, HDD25)).toBe('H25-1509');
  });

  // The bug as reported: badge read 'BIG' from the shared catalog while the DB
  // allocator wrote H35 from number_sequences.
  it('never shows the catalog default when a tenant sequence exists', () => {
    expect(inventoryNumberPreview(sequences, deviceTypes, HDD35)).not.toContain('BIG');
  });

  it('pads to the sequence padding, not a fixed width', () => {
    expect(inventoryNumberPreview(
      [{ scope: `inventory:${HDD35}`, prefix: 'H35', current_value: 8, padding: 6 }],
      deviceTypes, HDD35,
    )).toBe('H35-000009');
  });

  it('starts a never-used tenant sequence at 1', () => {
    expect(inventoryNumberPreview(
      [{ scope: `inventory:${HDD35}`, prefix: 'H35', current_value: 0, padding: 4 }],
      deviceTypes, HDD35,
    )).toBe('H35-0001');
  });

  it('falls back to the catalog default at 1 when the tenant has no sequence yet', () => {
    // mirrors get_next_inventory_number's lazy seed at current_value 0
    expect(inventoryNumberPreview([], deviceTypes, HDD35)).toBe('BIG-0001');
  });

  it('renders a v2 format_template instead of assuming PREFIX-NNNN', () => {
    expect(inventoryNumberPreview(
      [{ scope: `inventory:${HDD35}`, prefix: null, current_value: 41,
         format_template: 'INV-{SEQ:5}', padding: 4 }],
      deviceTypes, HDD35,
    )).toBe('INV-00042');
  });

  it('returns empty when nothing can be resolved', () => {
    expect(inventoryNumberPreview([], deviceTypes, 'dt-new')).toBe('');
    expect(inventoryNumberPreview(sequences, deviceTypes, '')).toBe('');
    expect(inventoryNumberPreview(undefined, undefined, HDD35)).toBe('');
  });

  it('ignores a tenant sequence with a blank prefix and no template', () => {
    expect(inventoryNumberPreview(
      [{ scope: `inventory:${HDD35}`, prefix: '  ', current_value: 5 }],
      deviceTypes, HDD35,
    )).toBe('BIG-0001');
  });

  it('does not match a different device type by scope prefix collision', () => {
    expect(inventoryNumberPreview(
      [{ scope: 'inventory:dt-3.5-extra', prefix: 'XX', current_value: 7 }],
      deviceTypes, HDD35,
    )).toBe('BIG-0001');
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
