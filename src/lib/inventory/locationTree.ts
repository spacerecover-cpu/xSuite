import type { Database } from '../../types/database.types';

export type InventoryLocationRow = Database['public']['Tables']['inventory_locations']['Row'];

export interface LocationNode {
  id: string;
  name: string;
  location_code: string | null;
  children: LocationNode[];
}

export function buildLocationTree(rows: InventoryLocationRow[]): LocationNode[] {
  const idSet = new Set(rows.map(r => r.id));

  const nodeMap = new Map<string, LocationNode>();
  for (const row of rows) {
    nodeMap.set(row.id, {
      id: row.id,
      name: row.name,
      location_code: row.location_code,
      children: [],
    });
  }

  const roots: LocationNode[] = [];

  for (const row of rows) {
    const node = nodeMap.get(row.id)!;
    const parentId = row.parent_id;

    if (parentId === null || !idSet.has(parentId)) {
      roots.push(node);
    } else {
      nodeMap.get(parentId)!.children.push(node);
    }
  }

  const sortNodes = (nodes: LocationNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);

  return roots;
}

export function flattenLocationPath(rows: InventoryLocationRow[], id: string): string {
  const rowMap = new Map(rows.map(r => [r.id, r]));
  const parts: string[] = [];
  const visited = new Set<string>();

  let current = rowMap.get(id);
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    parts.unshift(current.name);
    current = current.parent_id ? rowMap.get(current.parent_id) : undefined;
  }

  return parts.join(' / ');
}
