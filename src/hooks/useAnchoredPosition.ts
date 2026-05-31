import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

interface UseAnchoredPositionOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  /** Flip threshold: the panel's expected height in px. @default 300 */
  estimatedHeight?: number;
  /** Match the anchor's width. @default true */
  matchWidth?: boolean;
  /** Explicit panel width in px when `matchWidth` is false. */
  width?: number;
  /** Gap between anchor and panel in px. @default 0 */
  gap?: number;
  /** Viewport edge padding used to clamp the panel's left/maxHeight. @default 8 */
  viewportPadding?: number;
}

interface UseAnchoredPositionResult {
  floatingStyle: CSSProperties;
  placement: 'top' | 'bottom';
  recompute: () => void;
}

// Use layout effect in the browser; fall back to a plain effect during SSR so
// React doesn't warn (this hook is client-only but defensive cheaply).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Position a floating panel relative to an anchor element using `position: fixed`.
 * Flips above the anchor when there isn't room below; clamps the left edge to the
 * viewport. Re-measures on capture-phase scroll/resize while `open`. Pure positioning —
 * no portal, no focus handling. Consumed by the combobox/select components.
 */
export function useAnchoredPosition({
  open,
  anchorRef,
  estimatedHeight = 300,
  matchWidth = true,
  width,
  gap = 0,
  viewportPadding = 8,
}: UseAnchoredPositionOptions): UseAnchoredPositionResult {
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties>({});
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');

  const recompute = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const nextPlacement: 'top' | 'bottom' =
      spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';

    const panelWidth = matchWidth ? rect.width : (width ?? rect.width);

    const minLeft = viewportPadding;
    const maxLeft = viewportWidth - panelWidth - viewportPadding;
    // Guard against a negative range (panel wider than the viewport) by not
    // pushing minLeft past maxLeft.
    const left = Math.max(minLeft, Math.min(rect.left, Math.max(minLeft, maxLeft)));

    const availableSpace = nextPlacement === 'bottom' ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(0, availableSpace - gap - viewportPadding);

    const style: CSSProperties = {
      position: 'fixed',
      left,
      width: panelWidth,
      zIndex: 9999,
      maxHeight,
    };
    if (nextPlacement === 'bottom') {
      style.top = rect.bottom + gap;
    } else {
      style.bottom = viewportHeight - rect.top + gap;
    }

    setPlacement(nextPlacement);
    setFloatingStyle(style);
  }, [anchorRef, estimatedHeight, matchWidth, width, gap, viewportPadding]);

  useIsoLayoutEffect(() => {
    if (!open) {
      setFloatingStyle({});
      return;
    }

    recompute();

    const onScroll = () => recompute();
    const onResize = () => recompute();
    // Capture phase so nested scroll containers (not just window) trigger a re-measure.
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, recompute]);

  return { floatingStyle, placement, recompute };
}
