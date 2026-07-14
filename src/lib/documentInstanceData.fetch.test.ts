import { describe, it, expect, vi } from 'vitest';

// The module under test imports the real Supabase client at load time, which
// throws without VITE_* env. Mock it — the aggregation helper never touches it.
vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { aggregateRecoverability } from './documentInstanceData.fetch';

describe('aggregateRecoverability', () => {
  it('returns null when no device has a recovery_result (donors / pre-diagnosis)', () => {
    expect(aggregateRecoverability([])).toBeNull();
    expect(aggregateRecoverability([null, undefined, ''])).toBeNull();
  });

  it('reports a unanimous outcome as that single category', () => {
    expect(aggregateRecoverability(['Recoverable', 'Recoverable'])).toBe('Recoverable');
    expect(aggregateRecoverability(['Unrecoverable'])).toBe('Unrecoverable');
    expect(aggregateRecoverability(['Pending', 'Pending'])).toBe('Pending');
  });

  it('does NOT collapse a multi-device case to the earliest member (bug #47)', () => {
    // 3-drive case: drive #1 (earliest) unrecoverable, drives #2/#3 recovered.
    // The whole case must not read "Unrecoverable".
    expect(
      aggregateRecoverability(['Unrecoverable', 'Recoverable', 'Recoverable']),
    ).toBe('Partially Recoverable');
  });

  it('treats any explicitly-partial member as partial', () => {
    expect(aggregateRecoverability(['Recoverable', 'Partially Recoverable'])).toBe('Partially Recoverable');
  });

  it('normalizes legacy / snake_case / migration vocabularies', () => {
    expect(aggregateRecoverability(['fully_recoverable', 'full'])).toBe('Recoverable');
    expect(aggregateRecoverability(['none', 'unrecoverable'])).toBe('Unrecoverable');
    expect(aggregateRecoverability(['full', 'none'])).toBe('Partially Recoverable');
    expect(aggregateRecoverability(['partially_recoverable'])).toBe('Partially Recoverable');
  });

  it('ignores unassessed members when a determined outcome exists', () => {
    expect(aggregateRecoverability(['Recoverable', null, 'Pending'])).toBe('Recoverable');
    expect(aggregateRecoverability(['Unrecoverable', 'Pending'])).toBe('Unrecoverable');
  });

  it('preserves an unrecognised single value verbatim', () => {
    expect(aggregateRecoverability(['Escalated to L2'])).toBe('Escalated to L2');
  });
});
