// src/lib/devices/deviceFamily.test.ts
import { describe, it, expect } from 'vitest';
import { resolveDeviceFamily } from './deviceFamily';

describe('resolveDeviceFamily', () => {
  const cases: Array<[string, string]> = [
    ['2.5" HDD', 'hdd'], ['3.5" HDD', 'hdd'], ['Hybrid Drive', 'hdd'],
    ['2.5" SSD', 'ssd'], ['M.2 SSD', 'ssd'], ['NVMe SSD', 'ssd'], ['SSD External', 'ssd'],
    ['USB Drive', 'usb_flash'], ['Memory Stick', 'usb_flash'],
    ['SD Card', 'memory_card'], ['MicroSD Card', 'memory_card'], ['CF Card', 'memory_card'],
    ['Mobile Phone', 'mobile'], ['Tablet', 'mobile'],
    ['RAID Array', 'raid'], ['Server', 'raid'],
    ['NAS Device', 'nas'],
    ['DVR/Camera', 'other'],
  ];
  it.each(cases)('maps %s -> %s', (name, family) => {
    expect(resolveDeviceFamily(name)).toBe(family);
  });
  it('defaults unknown/empty to other', () => {
    expect(resolveDeviceFamily('Smart Fridge')).toBe('other');
    expect(resolveDeviceFamily('')).toBe('other');
    expect(resolveDeviceFamily(null)).toBe('other');
  });
  it('is case/spacing tolerant', () => {
    expect(resolveDeviceFamily('  nvme ssd ')).toBe('ssd');
  });
});
