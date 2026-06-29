// src/lib/inventory/donorParts.test.ts
// TDD: RED → GREEN
// Written first; runs against the not-yet-existing donorParts module.

import { describe, it, expect } from 'vitest';
import { DONOR_PARTS, getDonorParts } from './donorParts';
import type { DeviceFamily } from '../devices/deviceFamily';

const ALL_FAMILIES: DeviceFamily[] = [
  'hdd', 'ssd', 'nvme', 'usb_flash', 'memory_card',
  'mobile', 'raid', 'nas', 'pcb', 'head_stack', 'other',
];

describe('DONOR_PARTS vocabulary', () => {
  it('has an entry for every DeviceFamily (no missing family)', () => {
    for (const family of ALL_FAMILIES) {
      expect(DONOR_PARTS).toHaveProperty(family);
      expect(Array.isArray(DONOR_PARTS[family])).toBe(true);
    }
  });

  it('hdd includes platter and voice_coil', () => {
    const keys = DONOR_PARTS.hdd.map(p => p.key);
    expect(keys).toContain('platter');
    expect(keys).toContain('voice_coil');
  });

  it('hdd also includes heads and pcb', () => {
    const keys = DONOR_PARTS.hdd.map(p => p.key);
    expect(keys).toContain('heads');
    expect(keys).toContain('pcb');
  });

  it('ssd includes nand and power_ic', () => {
    const keys = DONOR_PARTS.ssd.map(p => p.key);
    expect(keys).toContain('nand');
    expect(keys).toContain('power_ic');
  });

  it('nvme includes nand and power_ic', () => {
    const keys = DONOR_PARTS.nvme.map(p => p.key);
    expect(keys).toContain('nand');
    expect(keys).toContain('power_ic');
  });

  it('head_stack is non-empty and contains heads', () => {
    expect(DONOR_PARTS.head_stack.length).toBeGreaterThan(0);
    const keys = DONOR_PARTS.head_stack.map(p => p.key);
    expect(keys).toContain('heads');
  });

  it('other is empty', () => {
    expect(DONOR_PARTS.other).toHaveLength(0);
  });

  it('every part has a non-empty key and label', () => {
    for (const family of ALL_FAMILIES) {
      for (const part of DONOR_PARTS[family]) {
        expect(typeof part.key).toBe('string');
        expect(part.key.trim().length).toBeGreaterThan(0);
        expect(typeof part.label).toBe('string');
        expect(part.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keys are snake_case (no spaces, no hyphens)', () => {
    for (const family of ALL_FAMILIES) {
      for (const part of DONOR_PARTS[family]) {
        expect(part.key).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });
});

describe('getDonorParts', () => {
  it('returns the hdd parts list', () => {
    const parts = getDonorParts('hdd');
    expect(parts.length).toBeGreaterThan(0);
    expect(parts).toEqual(DONOR_PARTS.hdd);
  });

  it('returns empty array for "other"', () => {
    expect(getDonorParts('other')).toEqual([]);
  });

  it('returns empty array for unknown family (fallback)', () => {
    // Casting to DeviceFamily to simulate unknown/future value
    expect(getDonorParts('unknown_future' as DeviceFamily)).toEqual([]);
  });

  it('raid and nas share the same part keys', () => {
    const raidKeys = getDonorParts('raid').map(p => p.key);
    const nasKeys = getDonorParts('nas').map(p => p.key);
    expect(raidKeys).toEqual(nasKeys);
  });

  it('usb_flash includes controller and nand', () => {
    const keys = getDonorParts('usb_flash').map(p => p.key);
    expect(keys).toContain('controller');
    expect(keys).toContain('nand');
  });

  it('memory_card includes controller, nand, pcb', () => {
    const keys = getDonorParts('memory_card').map(p => p.key);
    expect(keys).toContain('controller');
    expect(keys).toContain('nand');
    expect(keys).toContain('pcb');
  });
});
