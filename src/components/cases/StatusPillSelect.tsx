import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { useListboxKeyboard } from '../../hooks/useListboxKeyboard';
import { useAnchoredPosition } from '../../hooks/useAnchoredPosition';

// Neutral grey for statuses with no configured color — matches the
// long-standing fallback in the case surfaces (CaseOverviewTab/CaseDetail).
const FALLBACK_COLOR = '#6b7280';

// Approximate rendered height of one option row (px-3 py-1.5 around a small
// pill) — used only as the flip threshold: when the full list won't fit below
// the trigger, the panel opens upward if there's more room above.
const ROW_HEIGHT = 33;
const LIST_PADDING = 8;
// Fixed panel width so the longest status ("No Solution — Future Follow-up")
// never wraps; the trigger pill itself is much narrower, so matchWidth is off.
const PANEL_WIDTH = 300;

export interface StatusPillOption {
  id: string;
  name: string;
  color: string | null;
}

interface StatusPillSelectProps {
  /** Current status name (statuses are keyed by name in `cases.status`). */
  value: string | null;
  /** Active statuses, ordered by sort_order. */
  options: StatusPillOption[];
  onSelect: (statusName: string) => void;
  ariaLabel?: string;
}

/**
 * Inline status picker that renders every option as its colored pill badge —
 * the same `Badge variant="custom"` + `master_case_statuses.color` treatment
 * used on the case header — so the current and candidate statuses are
 * identifiable by color at a glance (replaces a native <select>, which can
 * only render plain text). A legacy/inactive current value is injected at the
 * top so the field never renders blank.
 *
 * The panel is a fixed-position portal placed by `useAnchoredPosition`: it
 * flips **upward** when the full list won't fit below and there's more room
 * above (common on lower case-detail rows), and its max-height fills whichever
 * side it lands on — so with a tall status list the user sees most or all
 * options without scrolling.
 */
export const StatusPillSelect: React.FC<StatusPillSelectProps> = ({
  value,
  options,
  onSelect,
  ariaLabel = 'Change case status',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const displayOptions = useMemo<StatusPillOption[]>(() => {
    if (value && !options.some((o) => o.name === value)) {
      return [{ id: '__legacy__', name: value, color: null }, ...options];
    }
    return options;
  }, [value, options]);

  const currentColor =
    displayOptions.find((o) => o.name === value)?.color || FALLBACK_COLOR;

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (index: number) => {
      const option = displayOptions[index];
      if (!option) return;
      onSelect(option.name);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [displayOptions, onSelect]
  );

  const getOptionId = useCallback(
    (index: number) => {
      const option = displayOptions[index];
      return option ? `${listboxId}-opt-${option.id}` : '';
    },
    [displayOptions, listboxId]
  );

  const { activeIndex, setActiveIndex, activeOptionId, onKeyDown } = useListboxKeyboard({
    open: isOpen,
    itemCount: displayOptions.length,
    onOpen: () => setIsOpen(true),
    onClose: close,
    onSelect: handleSelect,
    getOptionId,
  });

  // Flip up when the full list can't fit below and there's more room above.
  const { floatingStyle, placement } = useAnchoredPosition({
    open: isOpen,
    anchorRef: triggerRef,
    estimatedHeight: displayOptions.length * ROW_HEIGHT + LIST_PADDING,
    matchWidth: false,
    width: PANEL_WIDTH,
    gap: 4,
  });

  // Start keyboard navigation from the current status when opening.
  const openAtCurrent = useCallback(() => {
    setIsOpen(true);
    setActiveIndex(displayOptions.findIndex((o) => o.name === value));
  }, [displayOptions, value, setActiveIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      (listRef.current?.children[activeIndex] as HTMLElement | undefined)?.scrollIntoView?.({
        block: 'nearest',
      });
    }
  }, [activeIndex, isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen ? activeOptionId : undefined}
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => (isOpen ? setIsOpen(false) : openAtCurrent())}
        onKeyDown={(e) => {
          if (!isOpen && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openAtCurrent();
            return;
          }
          onKeyDown(e);
        }}
      >
        <Badge variant="custom" color={currentColor} size="sm">
          {value || '—'}
        </Badge>
        <ChevronDown
          aria-hidden="true"
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            id={listboxId}
            aria-label={ariaLabel}
            data-placement={placement}
            className="overflow-y-auto bg-surface border border-slate-300 rounded-lg shadow-lg py-1"
            style={{ ...floatingStyle, scrollbarWidth: 'thin' }}
          >
            {displayOptions.map((option, index) => {
              const isSelected = option.name === value;
              return (
                <div
                  key={option.id}
                  role="option"
                  id={`${listboxId}-opt-${option.id}`}
                  aria-selected={isSelected}
                  className={`flex items-center justify-between gap-3 px-3 py-1.5 cursor-pointer transition-colors ${
                    activeIndex === index ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => handleSelect(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <Badge variant="custom" color={option.color || FALLBACK_COLOR} size="sm">
                    {option.name}
                  </Badge>
                  {isSelected && (
                    <Check aria-hidden="true" className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};
