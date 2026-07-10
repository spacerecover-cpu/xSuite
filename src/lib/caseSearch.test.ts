import { describe, it, expect } from 'vitest';
import { buildCaseSearchOrParts, applyCaseListFilters } from './caseSearch';

/** Minimal fake PostgREST filter builder that records the filter calls made. */
function fakeQuery() {
  const calls: { method: string; args: unknown[] }[] = [];
  const q = {
    or(filter: string) {
      calls.push({ method: 'or', args: [filter] });
      return q;
    },
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', args: [column, value] });
      return q;
    },
    in(column: string, values: readonly unknown[]) {
      calls.push({ method: 'in', args: [column, values] });
      return q;
    },
    calls,
  };
  return q;
}

describe('buildCaseSearchOrParts', () => {
  it('always searches case_no, client_reference and subject', () => {
    const f = buildCaseSearchOrParts('kashi', [], []);
    expect(f).toBe('case_no.ilike.%kashi%,client_reference.ilike.%kashi%,subject.ilike.%kashi%');
  });

  it('folds matched customer ids into a customer_id in.() clause', () => {
    const f = buildCaseSearchOrParts('kashi', ['aaa-1', 'bbb-2'], []);
    expect(f).toContain('customer_id.in.(aaa-1,bbb-2)');
  });

  it('folds device-serial case ids into an id in.() clause', () => {
    const f = buildCaseSearchOrParts('SN123', [], ['case-uuid-1']);
    expect(f).toContain('id.in.(case-uuid-1)');
  });

  it('omits in.() clauses when there are no matches (no empty in.() syntax errors)', () => {
    const f = buildCaseSearchOrParts('zzz', [], []);
    expect(f).not.toContain('in.(');
  });

  it('combines all clause types', () => {
    const f = buildCaseSearchOrParts('x', ['c1'], ['k1', 'k2']);
    expect(f).toBe('case_no.ilike.%x%,client_reference.ilike.%x%,subject.ilike.%x%,customer_id.in.(c1),id.in.(k1,k2)');
  });
});

describe('applyCaseListFilters', () => {
  // The Cases count query and the Cases rows query MUST apply identical filters.
  // Sharing this one builder is what stops a bucket-card click from filtering the
  // count while leaving the rows (and pagination) unfiltered.
  it('applies the active bucket status set via .in(status, names)', () => {
    const q = fakeQuery();
    applyCaseListFilters(q, {
      searchOr: null,
      filterStatus: 'all',
      filterPriority: 'all',
      bucketStatusNames: ['recovery', 'qa'],
    });
    expect(q.calls).toContainEqual({ method: 'in', args: ['status', ['recovery', 'qa']] });
  });

  it('maps an empty bucket to a no-match sentinel, never an unfiltered result', () => {
    const q = fakeQuery();
    applyCaseListFilters(q, {
      searchOr: null,
      filterStatus: 'all',
      filterPriority: 'all',
      bucketStatusNames: [],
    });
    expect(q.calls).toContainEqual({ method: 'in', args: ['status', ['__none__']] });
  });

  it('applies an explicit status filter via .eq', () => {
    const q = fakeQuery();
    applyCaseListFilters(q, {
      searchOr: null,
      filterStatus: 'diagnosis',
      filterPriority: 'all',
      bucketStatusNames: null,
    });
    expect(q.calls).toContainEqual({ method: 'eq', args: ['status', 'diagnosis'] });
  });

  it('applies search-or and priority, and skips filters left at "all"/null', () => {
    const q = fakeQuery();
    applyCaseListFilters(q, {
      searchOr: 'case_no.ilike.%x%',
      filterStatus: 'all',
      filterPriority: 'urgent',
      bucketStatusNames: null,
    });
    expect(q.calls).toContainEqual({ method: 'or', args: ['case_no.ilike.%x%'] });
    expect(q.calls).toContainEqual({ method: 'eq', args: ['priority', 'urgent'] });
    expect(q.calls.some((c) => c.method === 'eq' && c.args[0] === 'status')).toBe(false);
    expect(q.calls.some((c) => c.method === 'in')).toBe(false);
  });
});
