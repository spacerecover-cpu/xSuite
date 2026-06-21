import { describe, expect, it } from 'vitest';
import { fitColumns } from './fitColumns';
import { resolveTableView } from './types';

const col = (key: string, minWidth: number, priority: number, width?: number) => ({
  key,
  minWidth,
  priority,
  width,
});

describe('fitColumns', () => {
  it('admits everything when the container is wide enough', () => {
    const result = fitColumns(1000, [col('a', 100, 1), col('b', 100, 2), col('c', 100, 3)]);
    expect(result.fit).toEqual(['a', 'b', 'c']);
    expect(result.overflow).toEqual([]);
  });

  it('collapses the worst-priority columns first, preserving display order', () => {
    const result = fitColumns(320, [
      col('id', 100, 1),
      col('low', 100, 5),
      col('mid', 100, 3),
      col('high', 100, 2),
    ]);
    // Budget 320: id (p1) + high (p2) + mid (p3) fit; low (p5) overflows.
    expect(result.fit).toEqual(['id', 'mid', 'high']);
    expect(result.overflow).toEqual(['low']);
  });

  it('always keeps priority-1 columns even when over budget', () => {
    const result = fitColumns(150, [col('id', 120, 1), col('status', 120, 1), col('x', 80, 2)]);
    expect(result.fit).toEqual(['id', 'status']);
    expect(result.overflow).toEqual(['x']);
  });

  it('counts user-resized widths against the budget', () => {
    const narrow = fitColumns(300, [col('a', 100, 1), col('b', 100, 2, 250)]);
    expect(narrow.overflow).toEqual(['b']);
    const wide = fitColumns(360, [col('a', 100, 1), col('b', 100, 2, 250)]);
    expect(wide.overflow).toEqual([]);
  });

  it('honours reserved width (selection / expander columns)', () => {
    const result = fitColumns(300, [col('a', 100, 1), col('b', 100, 2), col('c', 100, 4)], 100);
    expect(result.fit).toEqual(['a', 'b']);
    expect(result.overflow).toEqual(['c']);
  });
});

describe('resolveTableView', () => {
  const registry = [
    { key: 'a', defaultVisible: true },
    { key: 'b', defaultVisible: true },
    { key: 'c', defaultVisible: false },
    { key: 'd', defaultVisible: false },
  ];

  it('falls back to registry defaults with registry order', () => {
    const view = resolveTableView(registry);
    expect(view.orderedVisible).toEqual(['a', 'b']);
    expect(view.locked).toEqual([]);
  });

  it('tenant config overrides defaults; locked columns are always visible', () => {
    const view = resolveTableView(registry, { visible: ['c'], locked: ['a'], order: ['c', 'a'] });
    expect(view.orderedVisible).toEqual(['c', 'a']);
  });

  it('user prefs override tenant visibility but cannot hide locked columns', () => {
    const view = resolveTableView(
      registry,
      { visible: ['a', 'b'], locked: ['a'] },
      { visible: ['d'], order: ['d', 'a'] },
    );
    expect(view.orderedVisible).toEqual(['d', 'a']);
  });

  it('drops unknown keys from stale prefs and appends new registry columns to the order', () => {
    const view = resolveTableView(registry, undefined, {
      visible: ['a', 'removed_column', 'd'],
      order: ['d'],
      widths: { a: 240 },
    });
    expect(view.orderedVisible).toEqual(['d', 'a']);
    expect(view.widths).toEqual({ a: 240 });
  });
});
