import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';

interface UseListboxKeyboardOptions {
  open: boolean;
  itemCount: number;
  /** Multi: Enter/Space toggles & keeps the panel open. Single: selects & closes. */
  multiple?: boolean;
  onOpen: () => void;
  /** Caller restores focus to the trigger. */
  onClose: () => void;
  onSelect: (index: number) => void;
  /** Maps an item index to its stable option DOM id (keyed off option.id, not the index). */
  getOptionId: (index: number) => string;
}

interface UseListboxKeyboardResult {
  activeIndex: number;
  /** Reset to -1 / 0 on filter change. */
  setActiveIndex: (i: number) => void;
  /** For `aria-activedescendant` — undefined when nothing is active. */
  activeOptionId: string | undefined;
  /** Bind to the trigger and/or the in-panel search input. */
  onKeyDown: (e: KeyboardEvent) => void;
}

/**
 * Roving `aria-activedescendant` keyboard contract shared by the three select
 * widgets — without owning open/filter/value state (each select manages those
 * differently). Ref-free so the component owns `scrollIntoView` and the hook
 * stays jsdom-testable.
 *
 * Keys: ArrowDown/Up move + clamp (ArrowDown when closed → `onOpen`); Home/End
 * jump; Enter/Space when closed → `onOpen` (never selects), when open →
 * `onSelect(activeIndex)` with `preventDefault` (single also `onClose`, multi
 * stays open); Escape → `onClose` + reset to -1; Tab → `onClose` (no
 * `preventDefault`, no trap). Closing always clears the active highlight.
 */
export function useListboxKeyboard(
  opts: UseListboxKeyboardOptions
): UseListboxKeyboardResult {
  const { open, itemCount, multiple, onOpen, onClose, onSelect, getOptionId } = opts;
  const [activeIndex, setActiveIndex] = useState(-1);

  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(i, itemCount - 1)),
    [itemCount]
  );

  // When the listbox is closed, nothing is active. Clearing here stops a stale
  // highlight from a prior (possibly filtered) session leaking into the next
  // one — e.g. a refocused closed trigger silently re-selecting an index that
  // no longer maps to the same option after the filter reset.
  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (!open) {
            onOpen();
            return;
          }
          setActiveIndex((i) => clamp(i + 1));
          return;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setActiveIndex((i) => clamp(i - 1));
          return;
        }
        case 'Home': {
          e.preventDefault();
          if (itemCount > 0) setActiveIndex(0);
          return;
        }
        case 'End': {
          e.preventDefault();
          if (itemCount > 0) setActiveIndex(itemCount - 1);
          return;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (!open) {
            onOpen();
            return;
          }
          if (activeIndex >= 0) {
            onSelect(activeIndex);
            if (!multiple) onClose();
          }
          return;
        }
        case 'Escape': {
          e.preventDefault();
          onClose();
          setActiveIndex(-1);
          return;
        }
        case 'Tab': {
          onClose();
          return;
        }
        default:
          return;
      }
    },
    [open, itemCount, multiple, activeIndex, onOpen, onClose, onSelect, clamp]
  );

  const activeOptionId = activeIndex >= 0 ? getOptionId(activeIndex) : undefined;

  return { activeIndex, setActiveIndex, activeOptionId, onKeyDown };
}
