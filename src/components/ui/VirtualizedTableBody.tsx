import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface VirtualizedTableBodyProps<T> {
  /** Full row dataset (already filtered/sorted by the host). */
  items: T[];
  /** Renders one row; must return a `<tr>`. */
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Ref to the host's overflow-auto scroll viewport. */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Host column count, for the spacer rows' colSpan. */
  colSpan: number;
  /** Fixed estimated row height in px (rows are uniform). */
  estimateRowHeight?: number;
  /** Extra rows rendered above/below the visible window (passed to useVirtualizer). Default 8. */
  overscan?: number;
  /** At/below this row count, render every row plainly (no virtualization). */
  threshold?: number;
}

/**
 * Virtualizes `<tr>` rows inside a host `<table>`'s `<tbody>` using the
 * spacer-row technique, so a multi-thousand-row ledger only mounts the visible
 * window. The host keeps its own `<table>/<thead>`, sticky header and cell
 * markup; this component renders ONLY `<tbody>` children (the windowed rows plus
 * two spacer `<tr>`s).
 *
 * Below `threshold` rows it renders every row plainly, so small datasets — and
 * their tests — behave exactly as before.
 *
 * A11y note: while virtualized, off-screen rows are intentionally absent from the
 * DOM (and the accessibility tree); the spacer `<tr>`s are `aria-hidden`. This is
 * the point of virtualization — do not "fix" it. The threshold keeps small sets
 * fully present.
 */
export function VirtualizedTableBody<T>({
  items,
  renderRow,
  scrollRef,
  colSpan,
  estimateRowHeight = 44,
  overscan = 8,
  threshold = 100,
}: VirtualizedTableBodyProps<T>) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
  });

  if (items.length <= threshold) {
    return <>{items.map((item, index) => renderRow(item, index))}</>;
  }

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <>
      {paddingTop > 0 && (
        <tr aria-hidden="true">
          <td colSpan={colSpan} style={{ height: paddingTop, padding: 0 }} />
        </tr>
      )}
      {virtualItems.map((vi) => renderRow(items[vi.index], vi.index))}
      {paddingBottom > 0 && (
        <tr aria-hidden="true">
          <td colSpan={colSpan} style={{ height: paddingBottom, padding: 0 }} />
        </tr>
      )}
    </>
  );
}
