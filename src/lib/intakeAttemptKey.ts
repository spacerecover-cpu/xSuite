/**
 * One physical check-in attempt, remembered across a browser reload.
 *
 * The duplicate-intake guard on the check-in page lives in component state, so a
 * reload between the `case_devices` INSERT and its response wiped it: the operator
 * got a blank form, re-keyed the same drives, and the lab ended up with two cases
 * and two sets of DEVICE_RECEIVED events in an append-only ledger for ONE physical
 * hand-over. Persisting the attempt key means the resubmit carries the same key
 * and `createCaseWithDevices` returns the original case instead.
 *
 * The key is scoped to the customer on purpose: a stale key must never attach to a
 * different customer's intake, or their check-in would silently resolve to the
 * previous customer's case.
 */

const STORAGE_KEY = 'xsuite_pending_checkin';

/** A front-desk shift. Beyond this an unfinished attempt is not worth resuming. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface PendingIntakeAttempt {
  key: string;
  customerId: string;
  at: number;
}

function read(): PendingIntakeAttempt | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingIntakeAttempt>;
    if (!parsed?.key || !parsed.customerId || typeof parsed.at !== 'number') return null;
    return parsed as PendingIntakeAttempt;
  } catch {
    // Unreadable storage must never block a check-in — the desk still has drives
    // on the counter. Fall back to minting a fresh key.
    return null;
  }
}

function mintKey(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `intake-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The pending attempt, or null. Does not mint one. */
export function peekIntakeAttempt(): PendingIntakeAttempt | null {
  const pending = read();
  if (!pending) return null;
  return Date.now() - pending.at > MAX_AGE_MS ? null : pending;
}

/**
 * The key to submit this attempt under: the pending one when it belongs to the
 * same customer and is still fresh, otherwise a new one.
 */
export function beginIntakeAttempt(customerId: string): string {
  const pending = peekIntakeAttempt();
  if (pending && pending.customerId === customerId) return pending.key;

  const attempt: PendingIntakeAttempt = { key: mintKey(), customerId, at: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // Storage full or blocked: the key still guards this submit, it just will not
    // survive a reload. Degrading is better than refusing the check-in.
  }
  return attempt.key;
}

/** Called once the attempt has reached a terminal outcome. */
export function clearIntakeAttempt(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — a stale key expires on its own.
  }
}
