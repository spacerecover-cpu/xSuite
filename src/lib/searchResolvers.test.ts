import { describe, it, expect } from 'vitest';
import { composeSearchOr } from './searchResolvers';

describe('composeSearchOr', () => {
  it('returns only local parts when no ids resolved', () => {
    expect(composeSearchOr(['a.ilike.%x%', 'b.ilike.%x%'], [{ column: 'customer_id', ids: [] }]))
      .toBe('a.ilike.%x%,b.ilike.%x%');
  });

  it('appends an in.() clause per non-empty id set', () => {
    expect(composeSearchOr(['n.ilike.%x%'], [
      { column: 'customer_id', ids: ['c1', 'c2'] },
      { column: 'case_id', ids: [] },
      { column: 'invoice_id', ids: ['i1'] },
    ])).toBe('n.ilike.%x%,customer_id.in.(c1,c2),invoice_id.in.(i1)');
  });

  it('never emits an empty in.() clause (PostgREST syntax error)', () => {
    const f = composeSearchOr(['n.ilike.%x%'], [{ column: 'case_id', ids: [] }]);
    expect(f).not.toContain('in.(');
  });
});
