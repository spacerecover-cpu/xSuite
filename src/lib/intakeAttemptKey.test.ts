// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { beginIntakeAttempt, clearIntakeAttempt, peekIntakeAttempt } from './intakeAttemptKey';

describe('intakeAttemptKey', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mints a key for a fresh attempt', () => {
    const key = beginIntakeAttempt('cust-1');
    expect(key).toBeTruthy();
    expect(peekIntakeAttempt()?.key).toBe(key);
  });

  // The whole point: a reload between the device INSERT and its response must not
  // let the operator re-key the same hand-over into a second case.
  it('returns the same key across a reload for the same customer', () => {
    const first = beginIntakeAttempt('cust-1');
    const afterReload = beginIntakeAttempt('cust-1');
    expect(afterReload).toBe(first);
  });

  // ...but a stale key must never be attached to a DIFFERENT customer's intake,
  // or their check-in would silently resolve to the previous customer's case.
  it('mints a new key when the attempt is for a different customer', () => {
    const first = beginIntakeAttempt('cust-1');
    const second = beginIntakeAttempt('cust-2');
    expect(second).not.toBe(first);
    expect(peekIntakeAttempt()?.customerId).toBe('cust-2');
  });

  it('mints a new key once the pending attempt has gone stale', () => {
    const first = beginIntakeAttempt('cust-1');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
    expect(beginIntakeAttempt('cust-1')).not.toBe(first);
  });

  it('forgets the attempt once it is cleared', () => {
    const first = beginIntakeAttempt('cust-1');
    clearIntakeAttempt();
    expect(peekIntakeAttempt()).toBeNull();
    expect(beginIntakeAttempt('cust-1')).not.toBe(first);
  });

  it('survives unreadable storage rather than blocking a check-in', () => {
    localStorage.setItem('xsuite_pending_checkin', 'not json');
    expect(peekIntakeAttempt()).toBeNull();
    expect(beginIntakeAttempt('cust-1')).toBeTruthy();
  });
});
