/**
 * QZ Tray transport for thermal labels — the ONLY module that talks to the local
 * QZ Tray agent. It lazy-loads the `qz-tray` client (kept out of every initial
 * bundle), caches one localhost WebSocket connection, and pixel-prints the
 * already-exact-size label PDF to a named printer so the label lands at the
 * correct size with no browser dialog. Preferences are per-WORKSTATION (the
 * printer is physical), so they live in localStorage — never the tenant DB.
 *
 * MVP is UNSIGNED: no certificate/signature promises are set, so QZ shows its
 * own one-time "Allow + Remember" prompt per workstation, then prints silently.
 * Request signing (zero-prompt) is a future upgrade — see the design spec.
 */

import { logger } from '../../logger';
import type { LabelSizePreset } from './labelSizes';

export type QzMode = 'auto' | 'off';
export interface QzPrefs {
  mode: QzMode;
  printer?: string;
}

const PREFS_KEY = 'xsuite.labelPrint.qz';

/** 203 dpi thermal printers = 8 dots/mm. QZ interprets `density` as dots per the
 *  config `units`, so with units:'mm' this must be dots-per-mm — NOT 203. */
export const LABEL_DPI = 203;
export const LABEL_DOTS_PER_MM = Math.round(LABEL_DPI / 25.4); // 8

export function getQzPrefs(): QzPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { mode: 'auto', printer: undefined };
    const parsed = JSON.parse(raw) as Partial<QzPrefs>;
    return {
      mode: parsed.mode === 'off' ? 'off' : 'auto',
      printer: typeof parsed.printer === 'string' && parsed.printer.trim() ? parsed.printer : undefined,
    };
  } catch {
    return { mode: 'auto', printer: undefined };
  }
}

export function setQzPrefs(next: QzPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: next.mode, printer: next.printer }));
  } catch (err) {
    logger.error('[qzPrint] failed to persist prefs', err);
  }
}
