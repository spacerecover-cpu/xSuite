import { describe, it, expect } from 'vitest';
import { buildLocationTree, flattenLocationPath } from '../locationTree';
import type { Database } from '../../../types/database.types';

type InventoryLocationRow = Database['public']['Tables']['inventory_locations']['Row'];

function makeRow(
  id: string,
  name: string,
  parent_id: string | null = null,
  location_code: string | null = null,
): InventoryLocationRow {
  return {
    id,
    name,
    parent_id,
    location_code,
    description: null,
    is_active: true,
    tenant_id: 'tenant-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    deleted_at: null,
  };
}

describe('buildLocationTree', () => {
  it('nests a 3-level set correctly (Rack → Shelf → Bin)', () => {
    const rows: InventoryLocationRow[] = [
      makeRow('rack-1', 'Rack A', null),
      makeRow('shelf-4', 'Shelf 4', 'rack-1'),
      makeRow('bin-2', 'Bin 2', 'shelf-4'),
    ];

    const tree = buildLocationTree(rows);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Rack A');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe('Shelf 4');
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].name).toBe('Bin 2');
    expect(tree[0].children[0].children[0].children).toHaveLength(0);
  });

  it('flattenLocationPath returns "Rack A / Shelf 4 / Bin 2" breadcrumb format', () => {
    const rows: InventoryLocationRow[] = [
      makeRow('rack-1', 'Rack A', null),
      makeRow('shelf-4', 'Shelf 4', 'rack-1'),
      makeRow('bin-2', 'Bin 2', 'shelf-4'),
    ];

    expect(flattenLocationPath(rows, 'bin-2')).toBe('Rack A / Shelf 4 / Bin 2');
    expect(flattenLocationPath(rows, 'shelf-4')).toBe('Rack A / Shelf 4');
    expect(flattenLocationPath(rows, 'rack-1')).toBe('Rack A');
  });

  it('orphan rows (parent_id points to missing row) fall back to root level', () => {
    const rows: InventoryLocationRow[] = [
      makeRow('shelf-4', 'Shelf 4', 'missing-rack'),
      makeRow('bin-2', 'Bin 2', 'shelf-4'),
    ];

    const tree = buildLocationTree(rows);
    const names = tree.map(n => n.name);
    expect(names).toContain('Shelf 4');
  });

  it('cycle-safe: a row whose parent_id chain eventually points back to itself does NOT cause infinite recursion', () => {
    const rows: InventoryLocationRow[] = [
      makeRow('a', 'A', 'b'),
      makeRow('b', 'B', 'a'),
      makeRow('c', 'C', null),
    ];

    expect(() => buildLocationTree(rows)).not.toThrow();
    const tree = buildLocationTree(rows);
    expect(tree.some(n => n.name === 'C')).toBe(true);
  });
});
