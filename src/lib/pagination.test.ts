import { describe, it, expect } from 'vitest';
import { pageWindow } from './pagination';

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('windows around the current page with gaps to first/last', () => {
    expect(pageWindow(10, 41)).toEqual([1, 'gap', 9, 10, 11, 'gap', 41]);
  });

  it('collapses a gap of one page into the page itself', () => {
    expect(pageWindow(3, 41)).toEqual([1, 2, 3, 4, 'gap', 41]);
    expect(pageWindow(39, 41)).toEqual([1, 'gap', 38, 39, 40, 41]);
  });

  it('handles edges without duplicates', () => {
    expect(pageWindow(1, 41)).toEqual([1, 2, 'gap', 41]);
    expect(pageWindow(41, 41)).toEqual([1, 'gap', 40, 41]);
  });
});
