import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useListboxKeyboard } from './useListboxKeyboard';

interface HarnessOpts {
  open: boolean;
  itemCount: number;
  multiple?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onSelect?: (index: number) => void;
  getOptionId?: (index: number) => string;
}

function setup(overrides: Partial<HarnessOpts> = {}) {
  const onOpen = overrides.onOpen ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const onSelect = overrides.onSelect ?? vi.fn();
  const getOptionId = overrides.getOptionId ?? ((i: number) => `lb-opt-${i}`);
  const { result } = renderHook(() =>
    useListboxKeyboard({
      open: overrides.open ?? true,
      itemCount: overrides.itemCount ?? 3,
      multiple: overrides.multiple,
      onOpen,
      onClose,
      onSelect,
      getOptionId,
    })
  );
  return { result, onOpen, onClose, onSelect, getOptionId };
}

// Minimal React.KeyboardEvent stub: only key + preventDefault are exercised.
function keyEvent(key: string) {
  const preventDefault = vi.fn();
  return {
    event: { key, preventDefault } as unknown as React.KeyboardEvent,
    preventDefault,
  };
}

describe('useListboxKeyboard', () => {
  it('ArrowDown / ArrowUp move activeIndex and clamp at the bounds', () => {
    const { result } = setup({ itemCount: 3 });
    expect(result.current.activeIndex).toBe(-1);

    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event));
    expect(result.current.activeIndex).toBe(0);

    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event));
    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event));
    expect(result.current.activeIndex).toBe(2);

    // Clamp at the top.
    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event));
    expect(result.current.activeIndex).toBe(2);

    act(() => result.current.onKeyDown(keyEvent('ArrowUp').event));
    expect(result.current.activeIndex).toBe(1);

    act(() => result.current.onKeyDown(keyEvent('ArrowUp').event));
    act(() => result.current.onKeyDown(keyEvent('ArrowUp').event));
    expect(result.current.activeIndex).toBe(0);

    // Clamp at the bottom (does not go below 0).
    act(() => result.current.onKeyDown(keyEvent('ArrowUp').event));
    expect(result.current.activeIndex).toBe(0);
  });

  it('ArrowDown when closed calls onOpen', () => {
    const { result, onOpen } = setup({ open: false, itemCount: 3 });
    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('Home jumps to first, End jumps to last', () => {
    const { result } = setup({ itemCount: 5 });

    act(() => result.current.onKeyDown(keyEvent('End').event));
    expect(result.current.activeIndex).toBe(4);

    act(() => result.current.onKeyDown(keyEvent('Home').event));
    expect(result.current.activeIndex).toBe(0);
  });

  it('Enter in single mode calls onSelect(activeIndex) and onClose with preventDefault', () => {
    const { result, onSelect, onClose } = setup({ itemCount: 3, multiple: false });
    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event)); // active = 0
    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event)); // active = 1

    const { event, preventDefault } = keyEvent('Enter');
    act(() => result.current.onKeyDown(event));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('Space in single mode behaves like Enter (select + close)', () => {
    const { result, onSelect, onClose } = setup({ itemCount: 3, multiple: false });
    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event)); // active = 0

    const { event, preventDefault } = keyEvent(' ');
    act(() => result.current.onKeyDown(event));

    expect(onSelect).toHaveBeenCalledWith(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('Enter in multiple mode calls onSelect but does NOT call onClose', () => {
    const { result, onSelect, onClose } = setup({ itemCount: 3, multiple: true });
    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event)); // active = 0

    act(() => result.current.onKeyDown(keyEvent('Enter').event));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Enter does nothing when no option is active (activeIndex === -1)', () => {
    const { result, onSelect, onClose } = setup({ itemCount: 3, multiple: false });
    act(() => result.current.onKeyDown(keyEvent('Enter').event));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape calls onClose and resets activeIndex to -1', () => {
    const { result, onClose } = setup({ itemCount: 3 });
    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event)); // active = 0
    expect(result.current.activeIndex).toBe(0);

    act(() => result.current.onKeyDown(keyEvent('Escape').event));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.activeIndex).toBe(-1);
  });

  it('Tab calls onClose without preventDefault', () => {
    const { result, onClose } = setup({ itemCount: 3 });
    const { event, preventDefault } = keyEvent('Tab');
    act(() => result.current.onKeyDown(event));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('activeOptionId is undefined at -1, else getOptionId(activeIndex)', () => {
    const getOptionId = (i: number) => `row-${i}`;
    const { result } = setup({ itemCount: 3, getOptionId });
    expect(result.current.activeOptionId).toBeUndefined();

    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event)); // active = 0
    expect(result.current.activeOptionId).toBe('row-0');

    act(() => result.current.onKeyDown(keyEvent('ArrowDown').event)); // active = 1
    expect(result.current.activeOptionId).toBe('row-1');
  });

  it('setActiveIndex lets the caller reset on filter change', () => {
    const { result } = setup({ itemCount: 3 });
    act(() => result.current.setActiveIndex(2));
    expect(result.current.activeIndex).toBe(2);
    act(() => result.current.setActiveIndex(0));
    expect(result.current.activeIndex).toBe(0);
  });
});
