// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { watchInactivity, markActivity, ACTIVITY_STAMP_KEY } from './inactivity';

const LIMIT = 30 * 60 * 1000;
const CHECK = 60 * 1000;

describe('watchInactivity', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onIdle once the limit elapses with no activity', () => {
    const onIdle = vi.fn();
    const stop = watchInactivity({ limitMs: LIMIT, onIdle, checkIntervalMs: CHECK });

    vi.advanceTimersByTime(LIMIT - CHECK);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * CHECK);
    expect(onIdle).toHaveBeenCalledTimes(1);

    stop();
  });

  it('fires onIdle at most once (stops watching after firing)', () => {
    const onIdle = vi.fn();
    watchInactivity({ limitMs: LIMIT, onIdle, checkIntervalMs: CHECK });

    vi.advanceTimersByTime(LIMIT * 3);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('defers onIdle on user input events (keydown)', () => {
    const onIdle = vi.fn();
    const stop = watchInactivity({ limitMs: LIMIT, onIdle, checkIntervalMs: CHECK });

    vi.advanceTimersByTime(LIMIT - CHECK);
    window.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(LIMIT - CHECK);
    expect(onIdle).not.toHaveBeenCalled();

    stop();
  });

  it('catches non-bubbling scroll events from inner containers (capture phase)', () => {
    const onIdle = vi.fn();
    const stop = watchInactivity({ limitMs: LIMIT, onIdle, checkIntervalMs: CHECK });

    const innerPanel = document.createElement('div');
    document.body.appendChild(innerPanel);

    vi.advanceTimersByTime(LIMIT - CHECK);
    innerPanel.dispatchEvent(new Event('scroll', { bubbles: false }));
    vi.advanceTimersByTime(LIMIT - CHECK);
    expect(onIdle).not.toHaveBeenCalled();

    stop();
    innerPanel.remove();
  });

  it('treats a fresh shared stamp from another tab as activity', () => {
    const onIdle = vi.fn();
    const stop = watchInactivity({ limitMs: LIMIT, onIdle, checkIntervalMs: CHECK });

    vi.advanceTimersByTime(LIMIT - CHECK);
    // Another tab of the same browser stamps activity (storage is shared).
    localStorage.setItem(ACTIVITY_STAMP_KEY, String(Date.now()));
    vi.advanceTimersByTime(LIMIT - CHECK);
    expect(onIdle).not.toHaveBeenCalled();

    stop();
  });

  it('stop() prevents any further onIdle', () => {
    const onIdle = vi.fn();
    const stop = watchInactivity({ limitMs: LIMIT, onIdle, checkIntervalMs: CHECK });

    stop();
    vi.advanceTimersByTime(LIMIT * 2);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('throttles shared-stamp writes under rapid event streams', () => {
    const onIdle = vi.fn();
    const stop = watchInactivity({
      limitMs: LIMIT,
      onIdle,
      checkIntervalMs: CHECK,
      writeThrottleMs: 15_000,
    });

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    for (let i = 0; i < 100; i++) {
      window.dispatchEvent(new Event('mousemove'));
      vi.advanceTimersByTime(100); // 10s of constant mousemove
    }
    // 10s of events under a 15s throttle → at most one write.
    expect(setItem.mock.calls.filter(([k]) => k === ACTIVITY_STAMP_KEY).length).toBeLessThanOrEqual(1);

    setItem.mockRestore();
    stop();
  });

  it('markActivity writes the shared stamp', () => {
    markActivity();
    expect(Number(localStorage.getItem(ACTIVITY_STAMP_KEY))).toBe(Date.now());
  });
});
