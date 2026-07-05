// Cross-tab inactivity tracking for the auto sign-out guard. The previous
// in-AuthContext timer had three holes that signed out actively-working users:
// it never saw inner-panel scrolling (scroll does not bubble, and the app's
// content scrolls inside overflow containers, not the window), it ignored
// mouse movement and wheel input, and it was per-tab — a forgotten background
// tab would sign out the shared session while the user typed in another tab.
//
// Activity is stamped into localStorage (shared across the browser's tabs) so
// ANY tab's activity keeps the session alive everywhere; a per-watcher
// in-memory stamp covers environments where storage is unavailable. Writes
// are throttled — worst-case staleness (writeThrottleMs) is noise against a
// 30-minute limit.

export const ACTIVITY_STAMP_KEY = 'xsuite_last_activity';

// Capture phase so non-bubbling events (scroll in overflow containers) are
// still observed at the window.
const ACTIVITY_EVENTS = [
  'mousedown',
  'keydown',
  'wheel',
  'mousemove',
  'touchstart',
  'scroll',
] as const;

const readSharedStamp = (): number => {
  try {
    const value = Number(localStorage.getItem(ACTIVITY_STAMP_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

export const markActivity = (): void => {
  try {
    localStorage.setItem(ACTIVITY_STAMP_KEY, String(Date.now()));
  } catch {
    // Storage unavailable — per-watcher in-memory stamps still apply.
  }
};

export interface WatchInactivityOptions {
  limitMs: number;
  onIdle: () => void;
  checkIntervalMs?: number;
  writeThrottleMs?: number;
}

/**
 * Start watching for inactivity. Returns a stop function. Fires onIdle at
 * most once, after no activity in ANY tab for limitMs.
 */
export const watchInactivity = ({
  limitMs,
  onIdle,
  checkIntervalMs = 60_000,
  writeThrottleMs = 15_000,
}: WatchInactivityOptions): (() => void) => {
  let lastLocalActivity = Date.now();
  let lastWrite = Date.now();
  markActivity();

  const onActivity = () => {
    lastLocalActivity = Date.now();
    if (Date.now() - lastWrite >= writeThrottleMs) {
      lastWrite = Date.now();
      markActivity();
    }
  };

  ACTIVITY_EVENTS.forEach((event) =>
    window.addEventListener(event, onActivity, { capture: true, passive: true })
  );

  const stop = () => {
    clearInterval(interval);
    ACTIVITY_EVENTS.forEach((event) =>
      window.removeEventListener(event, onActivity, { capture: true })
    );
  };

  const interval = setInterval(() => {
    const lastActivity = Math.max(readSharedStamp(), lastLocalActivity);
    if (Date.now() - lastActivity >= limitMs) {
      stop();
      onIdle();
    }
  }, checkIntervalMs);

  return stop;
};
