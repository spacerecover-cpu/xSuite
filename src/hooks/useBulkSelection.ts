import { useCallback, useMemo, useState } from 'react';

// Generic bulk-selection state for list pages. Stores selected IDs in a Set
// so toggle/has/clear are O(1). Survives pagination because state lives in
// the page component, not the row — selecting rows on page 1, navigating to
// page 2, and clicking "Bulk action" still acts on the page-1 selection.
export interface BulkSelection {
  selectedIds: Set<string>;
  selectedCount: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  // Select / deselect all of `ids`. Use the currently visible page's IDs
  // for the header checkbox so users can "select all on this page".
  setMany: (ids: string[], selected: boolean) => void;
  // True if every id in `ids` is currently selected. Drives the header
  // checkbox's checked state — undefined means indeterminate.
  allSelected: (ids: string[]) => boolean;
  someSelected: (ids: string[]) => boolean;
  clear: () => void;
}

export function useBulkSelection(): BulkSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: string[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) for (const id of ids) next.add(id);
      else for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const allSelected = useCallback(
    (ids: string[]) => ids.length > 0 && ids.every((id) => selectedIds.has(id)),
    [selectedIds],
  );
  const someSelected = useCallback(
    (ids: string[]) => ids.some((id) => selectedIds.has(id)),
    [selectedIds],
  );

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return useMemo(
    () => ({
      selectedIds,
      selectedCount: selectedIds.size,
      isSelected,
      toggle,
      setMany,
      allSelected,
      someSelected,
      clear,
    }),
    [selectedIds, isSelected, toggle, setMany, allSelected, someSelected, clear],
  );
}
