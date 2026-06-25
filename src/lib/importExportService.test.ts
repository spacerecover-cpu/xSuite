import { describe, it, expect, vi } from 'vitest';
// suggestFieldMapping is pure; mock the supabase import so the module loads without env/network.
vi.mock('./supabaseClient', () => ({ supabase: {} }));
import { suggestFieldMapping } from './importExportService';

describe('suggestFieldMapping — inventory alias disambiguation (B4)', () => {
  it("maps a 'category' column to category_id, not device_type_id", () => {
    const r = suggestFieldMapping(['category'], 'inventory');
    expect(r['category']?.target).toBe('category_id');
  });

  it("maps a 'type' column to device_type_id", () => {
    const r = suggestFieldMapping(['type'], 'inventory');
    expect(r['type']?.target).toBe('device_type_id');
  });

  it("still maps 'device_type' to device_type_id", () => {
    const r = suggestFieldMapping(['device_type'], 'inventory');
    expect(r['device_type']?.target).toBe('device_type_id');
  });
});
