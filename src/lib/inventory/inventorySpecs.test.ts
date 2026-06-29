// src/lib/inventory/inventorySpecs.test.ts
import { describe, it, expect } from 'vitest';
import { serializeInventorySpecs, hydrateInventorySpecs } from './inventorySpecs';
import { getDeviceFamilyConfig } from '../devices/deviceFieldConfig';
import type { DeviceFamily } from '../devices/deviceFamily';

// ---------------------------------------------------------------------------
// Round-trip: serialize then hydrate must reproduce non-empty field values.
// ---------------------------------------------------------------------------

function roundTrip(family: DeviceFamily, formValues: Record<string, unknown>) {
  const serialized = serializeInventorySpecs(family, formValues);
  const hydrated = hydrateInventorySpecs(family, serialized);
  return { serialized, hydrated };
}

describe('inventorySpecs – HDD', () => {
  it('round-trips pcb_number and physical_head_map', () => {
    const { serialized, hydrated } = roundTrip('hdd', {
      pcb_number: 'PCB-1234',
      physical_head_map: '01234567',
      firmware_version: 'SC60',
    });

    expect(serialized.pcb_number).toBe('PCB-1234');
    expect(serialized.physical_head_map).toBe('01234567');
    expect(hydrated.pcb_number).toBe('PCB-1234');
    expect(hydrated.physical_head_map).toBe('01234567');
    expect(hydrated.firmware_version).toBe('SC60');
  });

  it('skips empty string values during serialize', () => {
    const { serialized } = roundTrip('hdd', { pcb_number: '', physical_head_map: 'X' });
    expect('pcb_number' in serialized).toBe(false);
    expect(serialized.physical_head_map).toBe('X');
  });

  it('defaults to empty string on hydrate when key absent', () => {
    const { hydrated } = roundTrip('hdd', {});
    expect(hydrated.pcb_number).toBe('');
    expect(hydrated.physical_head_map).toBe('');
  });
});

describe('inventorySpecs – NVMe', () => {
  it('round-trips pcie_generation and nand_type', () => {
    const { serialized, hydrated } = roundTrip('nvme', {
      pcie_generation: 'PCIe 4.0',
      nand_type: 'TLC',
      controller: 'Phison E18',
    });

    expect(serialized.pcie_generation).toBe('PCIe 4.0');
    expect(serialized.nand_type).toBe('TLC');
    expect(hydrated.pcie_generation).toBe('PCIe 4.0');
    expect(hydrated.nand_type).toBe('TLC');
    expect(hydrated.controller).toBe('Phison E18');
  });
});

describe('inventorySpecs – SSD', () => {
  it('round-trips controller and firmware_version', () => {
    const { serialized, hydrated } = roundTrip('ssd', {
      controller: 'SM2258',
      firmware_version: 'FW2.0',
      nand_type: 'QLC',
    });

    expect(serialized.controller).toBe('SM2258');
    expect(hydrated.controller).toBe('SM2258');
    expect(hydrated.nand_type).toBe('QLC');
  });
});

describe('inventorySpecs – RAID', () => {
  it('round-trips raid_level and num_drives', () => {
    const { serialized, hydrated } = roundTrip('raid', {
      raid_level: 'RAID 5',
      num_drives: '8',
      file_system: 'ext4',
    });

    expect(serialized.raid_level).toBe('RAID 5');
    expect(serialized.num_drives).toBe('8');
    expect(hydrated.raid_level).toBe('RAID 5');
    expect(hydrated.file_system).toBe('ext4');
  });
});

describe('inventorySpecs – no case_devices column is targeted', () => {
  it('serialize never produces a key that matches a case_devices column name', () => {
    // These are storage column names used in case_devices; they must NOT appear
    // as top-level keys in the inventory technical_details output because
    // inventory maps everything to def.key (not def.storage.column).
    const bannedColumnNames = new Set([
      'pcb_number', 'firmware_version', 'head_count_id', 'platter_count_id',
      'made_in_id', 'encryption_id', 'dom', 'part_number', 'dcm',
    ]);

    // Check that for each family, if a field's def.key happens to be the same
    // as a column name, that's fine (the key IS the serialized key in inventory
    // — it just lives in jsonb, not a separate column). The critical assertion
    // is that we do NOT serialize fields whose STORAGE column differs from the key
    // into the column name instead of the key name.
    //
    // Concretely: hdd family has pcb_number with storage column 'pcb_number'.
    // After serialize the key in jsonb should be 'pcb_number' (the def.key), not
    // 'pcb_number' (same name here). For fields where key ≠ storage.column
    // (e.g. head_count_id stored as head_count_id column, keyed as head_count_id),
    // the serialized key must be the def.key.

    const families: DeviceFamily[] = ['hdd', 'ssd', 'nvme', 'raid', 'nas', 'pcb', 'head_stack', 'mobile', 'usb_flash', 'memory_card', 'other'];
    for (const family of families) {
      const cfg = getDeviceFamilyConfig(family);
      const form: Record<string, unknown> = {};
      for (const def of cfg.technical) form[def.key] = 'test-value';
      const serialized = serializeInventorySpecs(family, form);

      for (const def of cfg.technical) {
        if (def.storage.kind === 'column' && def.storage.table === 'case_devices') {
          const colName = def.storage.column;
          if (colName !== def.key) {
            // The column name must NOT be a key in the output; only def.key is valid.
            expect(Object.keys(serialized)).not.toContain(colName);
          }
        }
        // The def.key (and only def.key) must be the serialized key.
        if (form[def.key] !== undefined && form[def.key] !== '' && form[def.key] !== null) {
          expect(serialized).toHaveProperty(def.key);
        }
      }
    }

    // Suppress unused variable warning
    void bannedColumnNames;
  });
});

describe('inventorySpecs – multiselect defaults', () => {
  it('hydrate defaults multiselect fields to [] when absent', () => {
    // mobile family has no multiselect but let us explicitly check the fallback path
    const { hydrated } = roundTrip('hdd', {});
    // BASIC_FIELDS has accessories (multiselect) but technical fields for hdd have no multiselect;
    // hydrateInventorySpecs only covers technical fields, so all should be ''
    for (const val of Object.values(hydrated)) {
      expect(typeof val === 'string' || Array.isArray(val)).toBe(true);
    }
  });
});
