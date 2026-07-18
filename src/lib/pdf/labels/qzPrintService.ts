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

// ---- Connection (cached) --------------------------------------------------

type Qz = (typeof import('qz-tray'))['default'];

let qzModule: Qz | null = null;
let connectPromise: Promise<Qz> | null = null;

async function loadQz(): Promise<Qz> {
  if (!qzModule) {
    const mod = await import('qz-tray');
    qzModule = mod.default ?? (mod as unknown as Qz);
    // Native promises are the default in 2.2.x, but set it defensively so an
    // older/edge build doesn't reject connect with "no promise type set".
    try {
      qzModule.api.setPromiseType((resolver) => new Promise(resolver));
    } catch {
      /* setPromiseType absent or already set — ignore */
    }
  }
  return qzModule;
}

/** Connect once and reuse. Rejects (callers catch) if the agent isn't running. */
async function connect(timeoutMs = 3000): Promise<Qz> {
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    const qz = await loadQz();
    if (qz.websocket.isActive()) return qz;
    await Promise.race([
      qz.websocket.connect({ retries: 0, delay: 0 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('QZ connect timeout')), timeoutMs)),
    ]);
    return qz;
  })().catch((err) => {
    connectPromise = null; // clear so a later attempt can retry
    throw err;
  });
  return connectPromise;
}

async function resolvePrinter(qz: Qz, override?: string): Promise<string> {
  if (override) return override;
  const saved = getQzPrefs().printer;
  if (saved) return saved;
  return qz.printers.getDefault();
}

// ---- Public transport -----------------------------------------------------

/**
 * Low-level: pixel-print a base64 PDF to the resolved printer at the exact label
 * size. THROWS on any failure (agent down, no printer) — callers decide how to
 * react. Used by tryQzPrint (fallback) and the settings Test print (toast).
 */
export async function qzPrintPdfBase64(
  base64: string,
  size: { widthMm: number; heightMm: number },
  opts: { printer?: string } = {},
): Promise<void> {
  const qz = await connect();
  const printer = await resolvePrinter(qz, opts.printer);
  const config = qz.configs.create(printer, {
    size: { width: size.widthMm, height: size.heightMm },
    units: 'mm',
    density: LABEL_DOTS_PER_MM,
    scaleContent: false,
    rasterize: true,
    colorType: 'blackwhite',
    orientation: null,
    jobName: 'xSuite label',
  });
  await qz.print(config, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: base64 }]);
}

/**
 * Transport hook for buildAndEmit. Returns true if QZ handled the print, false
 * to fall back to the browser dialog. NEVER throws — a printer problem must
 * never break an intake/creation flow.
 */
export async function tryQzPrint(
  pdf: { getBase64: (cb: (data: string) => void) => void },
  size: LabelSizePreset,
): Promise<boolean> {
  if (getQzPrefs().mode === 'off') return false;
  try {
    const base64 = await new Promise<string>((resolve) => pdf.getBase64(resolve));
    await qzPrintPdfBase64(base64, size);
    return true;
  } catch (err) {
    logger.warn('[qzPrint] direct print unavailable; falling back to browser dialog', err);
    return false;
  }
}

export interface QzStatus {
  connected: boolean;
  defaultPrinter?: string;
  printers?: string[];
}

/** Connection + printer status for the settings card. Never throws. */
export async function probeQz(): Promise<QzStatus> {
  try {
    const qz = await connect();
    const [defaultPrinter, found] = await Promise.all([
      qz.printers.getDefault().catch(() => undefined),
      qz.printers.find().catch(() => undefined),
    ]);
    const printers = Array.isArray(found) ? found : found ? [found] : undefined;
    return { connected: true, defaultPrinter: defaultPrinter ?? undefined, printers };
  } catch {
    return { connected: false };
  }
}
