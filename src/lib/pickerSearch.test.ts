import { describe, it, expect } from 'vitest';
import { mergeSelectedRow } from './pickerSearch';

describe('mergeSelectedRow', () => {
  const rows = [{ id: 'a' }, { id: 'b' }];

  it('returns rows untouched when nothing is selected', () => {
    expect(mergeSelectedRow(rows, null)).toEqual(rows);
  });

  it('prepends the selected row when the search results do not contain it', () => {
    expect(mergeSelectedRow(rows, { id: 'z' })).toEqual([{ id: 'z' }, { id: 'a' }, { id: 'b' }]);
  });

  it('never duplicates a selected row already in the results', () => {
    expect(mergeSelectedRow(rows, { id: 'b' })).toEqual([{ id: 'b' }, { id: 'a' }]);
  });
});
