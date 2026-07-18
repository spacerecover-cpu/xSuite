import { describe, it, expect } from 'vitest';
import {
  pageAllSelected,
  pageSomeSelected,
  toggleOne,
  togglePage,
} from './listSelection';

interface Row {
  id: string;
  name: string;
}

const row = (id: string): Row => ({ id, name: `item-${id}` });

const page1 = [row('a'), row('b'), row('c')];
const page2 = [row('d'), row('e'), row('f')];

const mapOf = (...rows: Row[]) => new Map(rows.map((r) => [r.id, r] as const));

describe('listSelection — page-aware selection algebra', () => {
  it('pageAllSelected is false for an empty page and when a row is missing', () => {
    expect(pageAllSelected(new Map(), [])).toBe(false);
    expect(pageAllSelected(mapOf(row('a'), row('b')), page1)).toBe(false);
    expect(pageAllSelected(mapOf(...page1), page1)).toBe(true);
  });

  it('pageSomeSelected reflects a partial page selection (indeterminate state)', () => {
    expect(pageSomeSelected(new Map(), page1)).toBe(false);
    expect(pageSomeSelected(mapOf(row('b')), page1)).toBe(true);
    expect(pageSomeSelected(mapOf(...page2), page1)).toBe(false);
  });

  it('toggleOne adds then removes a row, keeping the stored object', () => {
    const added = toggleOne(new Map<string, Row>(), row('a'));
    expect(added.get('a')).toEqual(row('a'));
    const removed = toggleOne(added, row('a'));
    expect(removed.has('a')).toBe(false);
  });

  it('toggleOne does not mutate the input map (returns a new Map)', () => {
    const start = mapOf(row('a'));
    const next = toggleOne(start, row('b'));
    expect(start.size).toBe(1);
    expect(next.size).toBe(2);
  });

  it('togglePage selects the whole current page and PRESERVES other-page selections', () => {
    // Page 1 already selected; now add page 2 (the reported cross-page bug).
    const afterPage1 = mapOf(...page1);
    const afterPage2 = togglePage(afterPage1, page2, /* allSelected on page2 */ false);
    expect(afterPage2.size).toBe(6);
    // page-1 selections must survive
    for (const r of page1) expect(afterPage2.has(r.id)).toBe(true);
    for (const r of page2) expect(afterPage2.has(r.id)).toBe(true);
  });

  it('togglePage deselects only the current page, leaving other pages selected', () => {
    const both = mapOf(...page1, ...page2);
    const removedPage2 = togglePage(both, page2, /* allSelected on page2 */ true);
    expect(removedPage2.size).toBe(3);
    for (const r of page1) expect(removedPage2.has(r.id)).toBe(true);
    for (const r of page2) expect(removedPage2.has(r.id)).toBe(false);
  });
});
