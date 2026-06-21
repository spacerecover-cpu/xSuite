export interface FitColumnInput {
  key: string;
  minWidth: number;
  /** 1 = always rendered; higher collapses first. */
  priority: number;
  /** User-resized width (wins over minWidth when larger). */
  width?: number;
}

export interface FitResult {
  /** Keys that fit, in the caller's display order. */
  fit: string[];
  /** Keys that did not fit (collapsed into the row expander), in display order. */
  overflow: string[];
}

const widthOf = (c: FitColumnInput) => Math.max(c.minWidth, c.width ?? 0);

/**
 * Decide which columns fit the available pixel budget instead of horizontal
 * scrolling. Priority-1 (identity) columns are always admitted; the rest are
 * admitted best-priority-first (display order breaks ties) while the budget
 * lasts. Output preserves the caller's display order.
 */
export function fitColumns(
  containerWidth: number,
  orderedVisible: FitColumnInput[],
  reservedWidth = 0,
): FitResult {
  const budget = Math.max(0, containerWidth - reservedWidth);
  const admitted = new Set<string>();
  let used = 0;

  for (const col of orderedVisible) {
    if (col.priority === 1) {
      admitted.add(col.key);
      used += widthOf(col);
    }
  }

  const candidates = orderedVisible
    .map((col, index) => ({ col, index }))
    .filter(({ col }) => col.priority !== 1)
    .sort((a, b) => a.col.priority - b.col.priority || a.index - b.index);

  for (const { col } of candidates) {
    const w = widthOf(col);
    if (used + w <= budget) {
      admitted.add(col.key);
      used += w;
    }
  }

  return {
    fit: orderedVisible.filter((c) => admitted.has(c.key)).map((c) => c.key),
    overflow: orderedVisible.filter((c) => !admitted.has(c.key)).map((c) => c.key),
  };
}
