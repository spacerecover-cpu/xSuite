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

export type { ClassValue };
