import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }));

import { buildCaseSearchOrParts, applyCaseListFilters, buildCaseSearchOr } from './caseSearch';

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

/** Chainable, thenable builder resolving to the given {data,error} result. */
function resultBuilder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'or', 'is', 'ilike', 'limit', 'abortSignal']) {
    b[m] = () => b;
  }
  b.then = (onFulfilled: (r: unknown) => unknown) => Promise.resolve(result).then(onFulfilled);
  return b;
}

describe('buildCaseSearchOr error handling', () => {
  beforeEach(() => fromMock.mockReset());

  it('throws when the customer pre-resolution query errors (never silently degrades)', async () => {
    fromMock.mockImplementation((table: string) =>
      table === 'customers_enhanced'
        ? resultBuilder({ data: null, error: { message: 'statement timeout', code: '57014' } })
        : resultBuilder({ data: [], error: null }),
    );
    await expect(buildCaseSearchOr('kashi')).rejects.toMatchObject({ code: '57014' });
  });

  it('throws when the device-serial scan errors', async () => {
    fromMock.mockImplementation((table: string) =>
      table === 'case_devices'
        ? resultBuilder({ data: null, error: { message: 'boom', code: 'XX000' } })
        : resultBuilder({ data: [], error: null }),
    );
    await expect(buildCaseSearchOr('SN1')).rejects.toMatchObject({ code: 'XX000' });
  });

  it('does not throw on an aborted (superseded) scan', async () => {
    fromMock.mockImplementation(() =>
      resultBuilder({ data: null, error: { message: 'AbortError: aborted', code: '' } }),
    );
    await expect(buildCaseSearchOr('x')).resolves.toContain('case_no.ilike.%x%');
  });

  it('returns the folded filter when both scans succeed', async () => {
    fromMock.mockImplementation((table: string) =>
      table === 'customers_enhanced'
        ? resultBuilder({ data: [{ id: 'c1' }], error: null })
        : resultBuilder({ data: [{ case_id: 'k1' }], error: null }),
    );
    await expect(buildCaseSearchOr('x')).resolves.toBe(
      'case_no.ilike.%x%,client_reference.ilike.%x%,subject.ilike.%x%,customer_id.in.(c1),id.in.(k1)',
    );
  });
});

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
