import { useMemo } from 'react';
import { X } from 'lucide-react';
import { flattenLocationPath } from '../../lib/inventory/locationTree';
import type { Database } from '../../types/database.types';

type InventoryLocationRow = Database['public']['Tables']['inventory_locations']['Row'];

interface HierarchicalLocationPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  locations: InventoryLocationRow[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const LEVEL_LABELS = ['Rack / Area', 'Shelf / Zone', 'Bin / Slot'];

function getLevelLabel(level: number): string {
  return LEVEL_LABELS[level] ?? `Level ${level + 1}`;
}

export function HierarchicalLocationPicker({
  value,
  onChange,
  locations,
  placeholder = 'Select location',
  disabled = false,
  className,
}: HierarchicalLocationPickerProps) {
  const rowMap = useMemo(
    () => new Map(locations.map(r => [r.id, r])),
    [locations],
  );

  const selectedPath = useMemo<string[]>(() => {
    if (!value) return [];
    const path: string[] = [];
    const visited = new Set<string>();
    let current = rowMap.get(value);
    while (current) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      path.unshift(current.id);
      current = current.parent_id ? rowMap.get(current.parent_id) : undefined;
    }
    return path;
  }, [value, rowMap]);

  const selectionAtLevel = (level: number): string => selectedPath[level] ?? '';

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, InventoryLocationRow[]>();
    for (const row of locations) {
      const key = row.parent_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [locations]);

  const rootOptions = childrenOf.get(null) ?? [];

  const l1Selected = selectionAtLevel(0);
  const l2Options = l1Selected ? (childrenOf.get(l1Selected) ?? []) : [];
  const l2Selected = selectionAtLevel(1);
  const l3Options = l2Selected ? (childrenOf.get(l2Selected) ?? []) : [];
  const l3Selected = selectionAtLevel(2);

  const handleLevel = (level: number, selectedId: string) => {
    if (!selectedId) {
      if (level === 0) onChange(null);
      else if (level === 1) onChange(l1Selected || null);
      else if (level === 2) onChange(l2Selected || null);
      return;
    }
    onChange(selectedId);
  };

  const breadcrumb = value ? flattenLocationPath(locations, value) : '';

  const selectClass =
    'w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-slate-900 ' +
    'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className={className}>
      <div className="space-y-2">
        {/* Level 0 */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {getLevelLabel(0)}
          </label>
          <select
            aria-label={`Select ${getLevelLabel(0)}`}
            value={l1Selected}
            onChange={e => handleLevel(0, e.target.value)}
            disabled={disabled || rootOptions.length === 0}
            className={selectClass}
          >
            <option value="">{placeholder}</option>
            {rootOptions.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Level 1 — shown only when L0 selected and has children */}
        {l1Selected && l2Options.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {getLevelLabel(1)}
            </label>
            <select
              aria-label={`Select ${getLevelLabel(1)}`}
              value={l2Selected}
              onChange={e => handleLevel(1, e.target.value)}
              disabled={disabled}
              className={selectClass}
            >
              <option value="">— select —</option>
              {l2Options.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Level 2 — shown only when L1 selected and has children */}
        {l2Selected && l3Options.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {getLevelLabel(2)}
            </label>
            <select
              aria-label={`Select ${getLevelLabel(2)}`}
              value={l3Selected}
              onChange={e => handleLevel(2, e.target.value)}
              disabled={disabled}
              className={selectClass}
            >
              <option value="">— select —</option>
              {l3Options.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Breadcrumb + clear */}
      <div className="mt-1.5 flex items-center gap-2 min-h-[1.25rem]">
        <span
          aria-live="polite"
          className="text-xs text-slate-500 truncate flex-1"
        >
          {breadcrumb}
        </span>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Clear location"
            className="shrink-0 p-0.5 rounded text-slate-400 hover:text-danger focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default HierarchicalLocationPicker;
