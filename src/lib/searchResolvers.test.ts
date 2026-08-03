import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }));

import { composeSearchOr, buildInvoiceSearchOr, buildPaymentSearchOr } from './searchResolvers';

/** Chainable, thenable builder resolving to the given {data,error} result. */
function resultBuilder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'or', 'is', 'ilike', 'limit']) {
    b[m] = () => b;
  }
  b.then = (onFulfilled: (r: unknown) => unknown) => Promise.resolve(result).then(onFulfilled);
  return b;
}

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

describe('cross-entity resolver error handling', () => {
  beforeEach(() => fromMock.mockReset());

  it('throws when the customer pre-resolution errors (never degrades to no matches)', async () => {
    fromMock.mockImplementation((table: string) =>
      table === 'customers_enhanced'
        ? resultBuilder({ data: null, error: { message: 'statement timeout', code: '57014' } })
        : resultBuilder({ data: [], error: null }),
    );
    await expect(buildInvoiceSearchOr('Al Futtaim')).rejects.toMatchObject({ code: '57014' });
  });

  it('throws when the case pre-resolution errors', async () => {
    fromMock.mockImplementation((table: string) =>
      table === 'cases'
        ? resultBuilder({ data: null, error: { message: 'boom', code: 'XX000' } })
        : resultBuilder({ data: [], error: null }),
    );
    await expect(buildInvoiceSearchOr('x')).rejects.toMatchObject({ code: 'XX000' });
  });

  it('throws when the invoice pre-resolution errors', async () => {
    fromMock.mockImplementation((table: string) =>
      table === 'invoices'
        ? resultBuilder({ data: null, error: { message: 'denied', code: '42501' } })
        : resultBuilder({ data: [], error: null }),
    );
    await expect(buildPaymentSearchOr('x')).rejects.toMatchObject({ code: '42501' });
  });

  it('returns the folded filter when every pre-resolution succeeds', async () => {
    fromMock.mockImplementation((table: string) =>
      table === 'customers_enhanced'
        ? resultBuilder({ data: [{ id: 'c1' }], error: null })
        : resultBuilder({ data: [{ id: 'k1' }], error: null }),
    );
    await expect(buildInvoiceSearchOr('x')).resolves.toBe(
      'invoice_number.ilike.%x%,notes.ilike.%x%,client_reference.ilike.%x%,customer_id.in.(c1),case_id.in.(k1)',
    );
  });
});
