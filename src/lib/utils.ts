import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with correct Tailwind conflict resolution.
 * clsx flattens conditional/array inputs; tailwind-merge ensures the last
 * conflicting utility in a group wins (e.g. `px-2 px-4` -> `px-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Basic email shape check shared by ChipInput, EmailDocumentModal, and forms.
 * Not RFC-complete: requires a local part, an `@`, and a dotted domain with
 * no whitespace. Use as a fast client-side guard, not for authoritative
 * validation.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate a post-login `from` redirect target. Returns the path only when it
 * is a safe root-relative app path; otherwise null (caller falls back to a
 * default). Rejects protocol-relative (`//host`) and backslash variants that
 * browsers normalize into off-site navigations, and anything not starting with
 * a single `/` (absolute URLs, `javascript:` schemes).
 */
export function safeInternalRedirect(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith('/')) return null;
  if (path.startsWith('//') || path.startsWith('/\\')) return null;
  return path;
}

export type { ClassValue };
