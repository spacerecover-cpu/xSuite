import { describe, it, expect, vi } from 'vitest';

// The component pulls in supabaseClient transitively; stub it so importing the
// module for the pure helper under test has no side effects (no real client /
// env access). We only exercise familyFromDeviceType, which is pure.
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) },
  getTenantId: () => 't1',
}));

import { familyFromDeviceType } from './InventoryItemWizard';

describe('familyFromDeviceType', () => {
  // Regression: catalog_device_types.family holds canonical underscore KEYS
  // (migration 20260629215312). These MUST pass through untouched — routing them
  // through the name resolver previously collapsed exactly these two to 'other',
  // selecting the wrong technical fields and wiping donor parts on edit/save.
  it('returns the canonical family KEY directly (head_stack)', () => {
    expect(familyFromDeviceType({ family: 'head_stack', name: 'Head Stack' })).toBe('head_stack');
  });

  it('returns the canonical family KEY directly (memory_card)', () => {
    expect(familyFromDeviceType({ family: 'memory_card', name: 'SD Card' })).toBe('memory_card');
  });

  it.each(['hdd', 'ssd', 'nvme', 'usb_flash', 'mobile', 'raid', 'nas', 'pcb', 'other'])(
    'preserves other canonical family key %s',
    (key) => {
      expect(familyFromDeviceType({ family: key, name: 'irrelevant' })).toBe(key);
    },
  );

  it('is tolerant of casing/whitespace on the family key', () => {
    expect(familyFromDeviceType({ family: '  Head_Stack ', name: 'Head Stack' })).toBe('head_stack');
  });

  it('falls back to name-based resolution when family is null/empty', () => {
    expect(familyFromDeviceType({ family: null, name: 'Head Stack' })).toBe('head_stack');
    expect(familyFromDeviceType({ family: '', name: 'SD Card' })).toBe('memory_card');
    expect(familyFromDeviceType({ family: null, name: '3.5" HDD' })).toBe('hdd');
  });

  it('defensively resolves a legacy display-name family through the name resolver', () => {
    expect(familyFromDeviceType({ family: 'Head Stack', name: 'ignored' })).toBe('head_stack');
  });

  it('returns other for an unknown, unresolvable device type', () => {
    expect(familyFromDeviceType({ family: null, name: 'Smart Fridge' })).toBe('other');
    expect(familyFromDeviceType(undefined)).toBe('other');
  });
});
