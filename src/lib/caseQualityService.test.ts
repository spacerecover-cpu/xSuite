import { describe, it, expect, vi } from 'vitest';

// caseQualityService imports supabaseClient at module load (which throws when
// env vars are absent, as in the test runner); mock it out — these tests only
// exercise the pure aggregateRecoveryOutcome helper.
vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { aggregateRecoveryOutcome } from './caseQualityService';

// Regression lock for the last-write-wins outcome corruption (bug: a later
// failed/no_data attempt flipped the whole case to 'unrecoverable', exposing a
// Rule 51 refund voucher on a case that had actually recovered data).
// The case outcome MUST be an aggregate over every attempt, never the latest.
describe('aggregateRecoveryOutcome', () => {
  it('returns null when there are no valid attempts', () => {
    expect(aggregateRecoveryOutcome([])).toBeNull();
    expect(aggregateRecoveryOutcome([null, 'bogus'])).toBeNull();
  });

  it('is "full" only when every attempt succeeded', () => {
    expect(aggregateRecoveryOutcome(['success'])).toBe('full');
    expect(aggregateRecoveryOutcome(['success', 'success'])).toBe('full');
  });

  it('is "unrecoverable" only when nothing was recovered', () => {
    expect(aggregateRecoveryOutcome(['failed'])).toBe('unrecoverable');
    expect(aggregateRecoveryOutcome(['no_data'])).toBe('unrecoverable');
    expect(aggregateRecoveryOutcome(['failed', 'no_data'])).toBe('unrecoverable');
  });

  it('does NOT let a later empty attempt downgrade recovered data (the bug)', () => {
    // RAID drive 1 succeeded, drive 2 donor attempt found nothing new.
    expect(aggregateRecoveryOutcome(['success', 'no_data'])).toBe('partial');
    // Order must not matter — aggregate, not last-write-wins.
    expect(aggregateRecoveryOutcome(['no_data', 'success'])).toBe('partial');
    expect(aggregateRecoveryOutcome(['success', 'failed'])).toBe('partial');
  });

  it('treats any partial attempt as at least a partial case outcome', () => {
    expect(aggregateRecoveryOutcome(['partial'])).toBe('partial');
    expect(aggregateRecoveryOutcome(['partial', 'failed'])).toBe('partial');
    expect(aggregateRecoveryOutcome(['success', 'partial'])).toBe('partial');
  });

  it('ignores null/unknown result values when aggregating', () => {
    expect(aggregateRecoveryOutcome(['success', null])).toBe('full');
    expect(aggregateRecoveryOutcome([null, 'no_data'])).toBe('unrecoverable');
  });
});
