// Page-aware, cross-page-preserving multi-select algebra for paginated lists.
//
// The selection is held as a Map keyed by row id whose values are the row
// objects themselves — so a selection built up across several pages can still
// be acted on (e.g. printed) even though the list only ever holds the current
// page in memory. The header "select all" control is page-scoped: it toggles
// only the rows currently on screen and leaves selections on other pages intact.

export interface Identifiable {
  id: string;
}

/** True when every row on the current page is selected (empty page → false). */
export function pageAllSelected(
  selected: ReadonlyMap<string, unknown>,
  page: readonly Identifiable[],
): boolean {
  return page.length > 0 && page.every((row) => selected.has(row.id));
}

/** True when at least one — but not necessarily every — page row is selected. */
export function pageSomeSelected(
  selected: ReadonlyMap<string, unknown>,
  page: readonly Identifiable[],
): boolean {
  return page.some((row) => selected.has(row.id));
}

/** Toggle a single row, returning a new Map (selection on other pages intact). */
export function toggleOne<T extends Identifiable>(
  selected: ReadonlyMap<string, T>,
  row: T,
): Map<string, T> {
  const next = new Map(selected);
  if (next.has(row.id)) next.delete(row.id);
  else next.set(row.id, row);
  return next;
}

/**
 * Toggle the whole current page. When every page row is already selected the
 * page is removed from the selection; otherwise the page is added to it. Rows
 * belonging to other pages are never touched.
 */
export function togglePage<T extends Identifiable>(
  selected: ReadonlyMap<string, T>,
  page: readonly T[],
  allSelected: boolean,
): Map<string, T> {
  const next = new Map(selected);
  for (const row of page) {
    if (allSelected) next.delete(row.id);
    else next.set(row.id, row);
  }
  return next;
}
