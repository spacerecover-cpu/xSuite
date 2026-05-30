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

export type { ClassValue };
