import { describe, it, expect, vi, afterEach } from 'vitest';
import { useRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import { useAnchoredPosition } from './useAnchoredPosition';

// jsdom has no layout: getBoundingClientRect returns all-zeros by default.
// We mock it on the anchor element to drive the placement/clamp math.
function mockRect(el: HTMLElement, rect: Partial<DOMRect>) {
  const full: DOMRect = {
    x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  el.getBoundingClientRect = () => full;
}

interface HarnessProps {
  open: boolean;
  rect: Partial<DOMRect>;
  estimatedHeight?: number;
  matchWidth?: boolean;
  width?: number;
  gap?: number;
  viewportPadding?: number;
  exposeRecompute?: (fn: () => void) => void;
}

function Harness(props: HarnessProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  // Apply the mock before the effect measures (synchronously during render).
  if (anchorRef.current) mockRect(anchorRef.current, props.rect);
  const { floatingStyle, placement, recompute } = useAnchoredPosition({
    open: props.open,
    anchorRef,
    estimatedHeight: props.estimatedHeight,
    matchWidth: props.matchWidth,
    width: props.width,
    gap: props.gap,
    viewportPadding: props.viewportPadding,
  });
  props.exposeRecompute?.(recompute);
  return (
    <div>
      <div
        ref={(el) => {
          anchorRef.current = el;
          if (el) mockRect(el, props.rect);
        }}
        data-testid="anchor"
      >
        anchor
      </div>
      <div data-testid="panel" style={floatingStyle} data-placement={placement}>
        panel
      </div>
    </div>
  );
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAnchoredPosition', () => {
  it('returns a position:fixed style with the expected keys when open', () => {
    setViewport(1000, 800);
    render(
      <Harness
        open
        rect={{ top: 100, bottom: 130, left: 200, width: 150, height: 30 }}
      />,
    );
    const panel = screen.getByTestId('panel');
    expect(panel.style.position).toBe('fixed');
    expect(panel.style.zIndex).toBe('9999');
    // matchWidth default true -> width matches anchor rect width
    expect(panel.style.width).toBe('150px');
    // left clamped within [viewportPadding, innerWidth - width - viewportPadding]
    expect(panel.style.left).toBe('200px');
    // plenty of space below -> bottom placement -> top set to rect.bottom + gap
    expect(panel.getAttribute('data-placement')).toBe('bottom');
    expect(panel.style.top).toBe('130px');
    expect(panel.style.maxHeight).not.toBe('');
  });

  it('places the panel below (top = rect.bottom + gap) when space below is sufficient', () => {
    setViewport(1000, 800);
    render(
      <Harness
        open
        gap={4}
        rect={{ top: 100, bottom: 130, left: 50, width: 100, height: 30 }}
      />,
    );
    const panel = screen.getByTestId('panel');
    expect(panel.getAttribute('data-placement')).toBe('bottom');
    expect(panel.style.top).toBe('134px');
    expect(panel.style.bottom).toBe('');
  });

  it('flips to top placement when spaceBelow < estimatedHeight and spaceAbove is larger', () => {
    // viewport height 500; anchor near the bottom so spaceBelow is small,
    // spaceAbove (rect.top) is large.
    setViewport(1000, 500);
    render(
      <Harness
        open
        estimatedHeight={300}
        gap={4}
        rect={{ top: 420, bottom: 450, left: 50, width: 100, height: 30 }}
      />,
    );
    const panel = screen.getByTestId('panel');
    // spaceBelow = 500 - 450 = 50 < 300; spaceAbove = 420 > 50 -> flip to top
    expect(panel.getAttribute('data-placement')).toBe('top');
    // bottom = innerHeight - rect.top + gap = 500 - 420 + 4 = 84
    expect(panel.style.bottom).toBe('84px');
    expect(panel.style.top).toBe('');
  });

  it('uses an explicit width when matchWidth is false', () => {
    setViewport(1000, 800);
    render(
      <Harness
        open
        matchWidth={false}
        width={260}
        rect={{ top: 100, bottom: 130, left: 10, width: 100, height: 30 }}
      />,
    );
    const panel = screen.getByTestId('panel');
    expect(panel.style.width).toBe('260px');
  });

  it('clamps left so the panel stays within the viewport padding', () => {
    setViewport(400, 800);
    render(
      <Harness
        open
        viewportPadding={8}
        rect={{ top: 100, bottom: 130, left: 380, width: 150, height: 30 }}
      />,
    );
    const panel = screen.getByTestId('panel');
    // max left = innerWidth - width - viewportPadding = 400 - 150 - 8 = 242
    expect(panel.style.left).toBe('242px');
  });

  it('returns an empty style and no listeners when closed', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(
      <Harness
        open={false}
        rect={{ top: 100, bottom: 130, left: 200, width: 150, height: 30 }}
      />,
    );
    const panel = screen.getByTestId('panel');
    expect(panel.style.position).toBe('');
    const scrollAdds = addSpy.mock.calls.filter(([type]) => type === 'scroll');
    expect(scrollAdds.length).toBe(0);
  });

  it('adds capture-phase scroll + resize listeners on open and removes them on close', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { rerender } = render(
      <Harness
        open
        rect={{ top: 100, bottom: 130, left: 200, width: 150, height: 30 }}
      />,
    );
    const scrollAdds = addSpy.mock.calls.filter(([type]) => type === 'scroll');
    const resizeAdds = addSpy.mock.calls.filter(([type]) => type === 'resize');
    expect(scrollAdds.length).toBeGreaterThan(0);
    expect(resizeAdds.length).toBeGreaterThan(0);
    // capture phase: third arg truthy on the scroll listener
    expect(scrollAdds[0][2]).toBeTruthy();

    rerender(
      <Harness
        open={false}
        rect={{ top: 100, bottom: 130, left: 200, width: 150, height: 30 }}
      />,
    );
    const scrollRemoves = removeSpy.mock.calls.filter(([type]) => type === 'scroll');
    const resizeRemoves = removeSpy.mock.calls.filter(([type]) => type === 'resize');
    expect(scrollRemoves.length).toBeGreaterThan(0);
    expect(resizeRemoves.length).toBeGreaterThan(0);
  });

  it('removes listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <Harness
        open
        rect={{ top: 100, bottom: 130, left: 200, width: 150, height: 30 }}
      />,
    );
    unmount();
    const scrollRemoves = removeSpy.mock.calls.filter(([type]) => type === 'scroll');
    expect(scrollRemoves.length).toBeGreaterThan(0);
  });

  it('exposes a callable recompute that re-measures', () => {
    setViewport(1000, 800);
    let recomputeFn: (() => void) | undefined;
    const { getByTestId } = render(
      <Harness
        open
        rect={{ top: 100, bottom: 130, left: 200, width: 150, height: 30 }}
        exposeRecompute={(fn) => {
          recomputeFn = fn;
        }}
      />,
    );
    expect(typeof recomputeFn).toBe('function');
    // Re-measure: should not throw and should keep a valid fixed style.
    act(() => {
      recomputeFn?.();
    });
    const panel = getByTestId('panel');
    expect(panel.style.position).toBe('fixed');
  });
});
