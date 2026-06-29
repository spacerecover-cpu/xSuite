// src/lib/devices/deviceFamily.test.ts
import { describe, it, expect } from 'vitest';
import { resolveDeviceFamily } from './deviceFamily';

describe('resolveDeviceFamily', () => {
  const cases: Array<[string, string]> = [
    ['2.5" HDD', 'hdd'], ['3.5" HDD', 'hdd'], ['Hybrid Drive', 'hdd'],
    ['2.5" SSD', 'ssd'], ['M.2 SSD', 'ssd'], ['NVMe SSD', 'nvme'], ['SSD External', 'ssd'],
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
    // NVMe SSD now maps to nvme (finer taxonomy); M.2 SSD maps to ssd
    expect(resolveDeviceFamily('  nvme ssd ')).toBe('nvme');
    expect(resolveDeviceFamily('  m.2 ssd ')).toBe('ssd');
  });

  // --- NEW: NVMe / PCB / Head Stack families ---
  it('NVMe SSD resolves to nvme (not ssd)', () => {
    expect(resolveDeviceFamily('NVMe SSD')).toBe('nvme');
  });
  it('PCB resolves to pcb', () => {
    expect(resolveDeviceFamily('PCB')).toBe('pcb');
  });
  it('Head Stack resolves to head_stack', () => {
    expect(resolveDeviceFamily('Head Stack')).toBe('head_stack');
  });
  it('Head Assembly resolves to head_stack', () => {
    expect(resolveDeviceFamily('Head Assembly')).toBe('head_stack');
  });
  it('heuristic nvme matches before ssd fallback', () => {
    expect(resolveDeviceFamily('NVMe PCIe SSD')).toBe('nvme');
    expect(resolveDeviceFamily('M.2 NVMe')).toBe('nvme');
  });
  it('heuristic pcb matches circuit board / logic board names', () => {
    expect(resolveDeviceFamily('Circuit Board')).toBe('pcb');
    expect(resolveDeviceFamily('Logic Board')).toBe('pcb');
  });
  it('heuristic head_stack matches head assembly variants', () => {
    expect(resolveDeviceFamily('Head Assembly HGA')).toBe('head_stack');
  });
  it('existing hdd and ssd cases still resolve correctly after nvme split', () => {
    expect(resolveDeviceFamily('3.5" HDD')).toBe('hdd');
    expect(resolveDeviceFamily('M.2 SSD')).toBe('ssd');
  });
});
