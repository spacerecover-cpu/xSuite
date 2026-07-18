# Direct Label Printing via QZ Tray — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print thermal labels silently at the correct size to the workstation's label printer via QZ Tray, falling back to today's browser print dialog when QZ Tray isn't running — with no change to the label design engine.

**Architecture:** One insertion point. Every label print already funnels through `buildAndEmit` in `src/lib/pdf/labels/labelPrintService.ts`; its `'print'` branch changes from `pdf.print()` (browser dialog) to `tryQzPrint(pdf, size)` with a `pdf.print()` fallback. A new `qzPrintService.ts` owns the QZ transport (lazy-loaded `qz-tray`, cached localhost WebSocket connection, per-workstation localStorage prefs). A `DirectPrintCard` in Settings → Preferences exposes status / Auto-Off / printer / Test print. Because case, stock and inventory labels all route through `buildAndEmit`, all three are fixed at once.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query v5, pdfmake 0.2.20 (existing), `qz-tray` 2.2.x (new, LGPL-2.1, lazy-imported), vitest + @testing-library/react, Tailwind (DESIGN.md semantic tokens), lucide-react.

**Design spec:** `docs/superpowers/specs/2026-07-18-direct-label-printing-qz-tray-design.md`

**Branch:** `claude/inventory-label-printer-v67p66` (already checked out).

---

## File Structure

- **Create** `src/types/qz-tray.d.ts` — ambient module declaration for the `qz` subset used (keeps tsc at 0 errors; `qz-tray` ships no types).
- **Create** `src/lib/pdf/labels/qzPrintService.ts` — QZ transport: prefs (localStorage), cached connect, `qzPrintPdfBase64`, `tryQzPrint`, `probeQz`. Single responsibility.
- **Create** `src/lib/pdf/labels/qzPrintService.test.ts` — unit tests (mock `qz-tray`).
- **Modify** `src/lib/pdf/labels/labelPrintService.ts` — add `buildLabelBase64`; change `buildAndEmit` `'print'` branch to try QZ then fall back.
- **Modify** `src/lib/pdf/labels/labelPreview.ts` — extract sample-mapping helper; add `previewLabelBase64` (for the Test print).
- **Create** `src/components/settings/labels/DirectPrintCard.tsx` — settings UI (status / toggle / printer / test).
- **Create** `src/components/settings/labels/DirectPrintCard.test.tsx` — component tests.
- **Modify** `src/pages/settings/PreferencesSettings.tsx` — render `<DirectPrintCard/>` after `<LabelPrintingCard/>`.
- **Modify** `src/components/settings/labels/LabelStudio.tsx` — add a one-line pointer to the direct-printing setting.
- **Modify** `package.json` — add `qz-tray` dependency.

**No DB migration. No `database.types.ts` change.**

---

## Task 1: Add the `qz-tray` dependency and ambient types

**Files:**
- Modify: `package.json`
- Create: `src/types/qz-tray.d.ts`

- [ ] **Step 1: Install the dependency**

Run: `npm install qz-tray@^2.2.6`
Expected: `package.json` gains `"qz-tray": "^2.2.6"` under `dependencies`; `package-lock.json` updates. (If `2.2.6` is unavailable, use the latest `2.2.x`.)

- [ ] **Step 2: Verify it imports under Vite (de-risk spike)**

Run: `node -e "require('qz-tray'); console.log('qz-tray require OK')"`
Expected: prints `qz-tray require OK` (the package resolves). If this throws, stop and report — the whole plan depends on the client loading.

- [ ] **Step 3: Create the ambient type declaration**

Create `src/types/qz-tray.d.ts`:

```ts
/**
 * Minimal ambient types for the `qz-tray` client — only the subset xSuite uses
 * (connect, printer discovery, config, pixel-PDF print, optional api overrides).
 * `qz-tray` ships no bundled types; this keeps `tsc` at 0 errors without `any`.
 * See https://qz.io/docs and the Pixel / Configs wiki pages.
 */
declare module 'qz-tray' {
  export interface QzConfigOptions {
    size?: { width: number; height: number };
    units?: 'in' | 'cm' | 'mm';
    /** Dots per UNIT — with units:'mm' this is dots/mm (8 ≈ 203 dpi), NOT DPI. */
    density?: number | string;
    scaleContent?: boolean;
    rasterize?: boolean;
    colorType?: 'color' | 'grayscale' | 'blackwhite' | 'default';
    orientation?: 'portrait' | 'landscape' | 'reverse-landscape' | null;
    copies?: number;
    jobName?: string;
    margins?: number | { top: number; right: number; bottom: number; left: number };
  }

  /** Opaque config handle returned by configs.create and passed to print. */
  export type QzConfig = Record<string, unknown>;

  export interface QzPixelData {
    type: 'pixel';
    format: 'pdf' | 'html' | 'image';
    flavor: 'base64' | 'file' | 'plain';
    data: string;
  }

  interface QzApi {
    websocket: {
      connect(options?: { retries?: number; delay?: number }): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
    };
    printers: {
      getDefault(): Promise<string>;
      find(query?: string): Promise<string | string[]>;
    };
    configs: {
      create(printer: string, options?: QzConfigOptions): QzConfig;
    };
    print(config: QzConfig, data: QzPixelData[]): Promise<void>;
    api: {
      setPromiseType(
        fn: (resolver: (resolve: (v?: unknown) => void, reject: (e?: unknown) => void) => void) => Promise<unknown>,
      ): void;
      setSha256Type(fn: (data: string) => string): void;
      setWebSocketType(ws: unknown): void;
    };
    security: {
      setCertificatePromise(fn: unknown): void;
      setSignatureAlgorithm(algo: string): void;
      setSignaturePromise(fn: unknown): void;
    };
  }

  const qz: QzApi;
  export default qz;
}
```

- [ ] **Step 4: Verify tsc is clean**

Run: `npm run typecheck`
Expected: 0 errors (the new `.d.ts` resolves `import 'qz-tray'`).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/types/qz-tray.d.ts
git commit -m "feat(labels): add qz-tray dependency and ambient types"
```

---

## Task 2: Per-workstation prefs (localStorage)

**Files:**
- Create: `src/lib/pdf/labels/qzPrintService.ts` (prefs section only this task)
- Create: `src/lib/pdf/labels/qzPrintService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/pdf/labels/qzPrintService.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getQzPrefs, setQzPrefs, LABEL_DOTS_PER_MM } from './qzPrintService';

describe('qz prefs', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to auto mode when nothing is stored', () => {
    expect(getQzPrefs()).toEqual({ mode: 'auto', printer: undefined });
  });

  it('round-trips mode and printer through localStorage', () => {
    setQzPrefs({ mode: 'off', printer: 'OSCAR MetaPrint(ZPL)' });
    expect(getQzPrefs()).toEqual({ mode: 'off', printer: 'OSCAR MetaPrint(ZPL)' });
  });

  it('coerces an unknown mode and blank printer back to safe defaults', () => {
    localStorage.setItem('xsuite.labelPrint.qz', JSON.stringify({ mode: 'weird', printer: '' }));
    expect(getQzPrefs()).toEqual({ mode: 'auto', printer: undefined });
  });

  it('returns auto on corrupt JSON', () => {
    localStorage.setItem('xsuite.labelPrint.qz', '{not json');
    expect(getQzPrefs()).toEqual({ mode: 'auto', printer: undefined });
  });

  it('exposes 8 dots/mm (203 dpi)', () => {
    expect(LABEL_DOTS_PER_MM).toBe(8);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/labels/qzPrintService.test.ts`
Expected: FAIL — `qzPrintService` module not found.

- [ ] **Step 3: Create the module with the prefs + constants**

Create `src/lib/pdf/labels/qzPrintService.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdf/labels/qzPrintService.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/labels/qzPrintService.ts src/lib/pdf/labels/qzPrintService.test.ts
git commit -m "feat(labels): qz print prefs (per-workstation localStorage)"
```

---

## Task 3: QZ connection, print and probe

**Files:**
- Modify: `src/lib/pdf/labels/qzPrintService.ts`
- Modify: `src/lib/pdf/labels/qzPrintService.test.ts`

- [ ] **Step 1: Write the failing tests (append)**

Append to `src/lib/pdf/labels/qzPrintService.test.ts`. Put the `vi.mock` factory at top-of-file scope (hoisted) and reset between tests:

```ts
import { vi } from 'vitest';
import type { LabelSizePreset } from './labelSizes';

const qzMock = {
  websocket: {
    connect: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isActive: vi.fn().mockReturnValue(false),
  },
  printers: {
    getDefault: vi.fn<[], Promise<string>>().mockResolvedValue('OSCAR MetaPrint(ZPL)'),
    find: vi.fn().mockResolvedValue(['OSCAR MetaPrint(ZPL)', 'Save as PDF']),
  },
  configs: { create: vi.fn((printer: string, options: unknown) => ({ printer, options })) },
  print: vi.fn().mockResolvedValue(undefined),
  api: { setPromiseType: vi.fn(), setSha256Type: vi.fn(), setWebSocketType: vi.fn() },
  security: { setCertificatePromise: vi.fn(), setSignatureAlgorithm: vi.fn(), setSignaturePromise: vi.fn() },
};
vi.mock('qz-tray', () => ({ default: qzMock }));

const SIZE = { id: 'nb_15x26', name: '26 × 15 mm', printers: 'Niimbot', widthMm: 26, heightMm: 15 } as LabelSizePreset;
const fakePdf = { getBase64: (cb: (d: string) => void) => cb('QkFTRTY0') };

describe('tryQzPrint', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    qzMock.websocket.isActive.mockReturnValue(false);
    qzMock.websocket.connect.mockResolvedValue(undefined);
    qzMock.printers.getDefault.mockResolvedValue('OSCAR MetaPrint(ZPL)');
    // Reset the module-level cached connection between tests.
    vi.resetModules();
  });

  it('returns false without touching QZ when mode is off', async () => {
    setQzPrefs({ mode: 'off' });
    const { tryQzPrint } = await import('./qzPrintService');
    expect(await tryQzPrint(fakePdf, SIZE)).toBe(false);
    expect(qzMock.websocket.connect).not.toHaveBeenCalled();
  });

  it('prints a pixel-PDF at exact mm size + 8 dots/mm and returns true', async () => {
    const { tryQzPrint } = await import('./qzPrintService');
    expect(await tryQzPrint(fakePdf, SIZE)).toBe(true);
    expect(qzMock.configs.create).toHaveBeenCalledWith(
      'OSCAR MetaPrint(ZPL)',
      expect.objectContaining({
        size: { width: 26, height: 15 },
        units: 'mm',
        density: 8,
        colorType: 'blackwhite',
        scaleContent: false,
      }),
    );
    expect(qzMock.print).toHaveBeenCalledWith(
      expect.anything(),
      [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: 'QkFTRTY0' }],
    );
  });

  it('targets the saved printer override when set', async () => {
    setQzPrefs({ mode: 'auto', printer: 'Zebra ZD421' });
    const { tryQzPrint } = await import('./qzPrintService');
    await tryQzPrint(fakePdf, SIZE);
    expect(qzMock.printers.getDefault).not.toHaveBeenCalled();
    expect(qzMock.configs.create).toHaveBeenCalledWith('Zebra ZD421', expect.anything());
  });

  it('returns false (fallback) when the agent is unreachable', async () => {
    qzMock.websocket.connect.mockRejectedValueOnce(new Error('no agent'));
    const { tryQzPrint } = await import('./qzPrintService');
    expect(await tryQzPrint(fakePdf, SIZE)).toBe(false);
    expect(qzMock.print).not.toHaveBeenCalled();
  });
});

describe('probeQz', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    qzMock.websocket.isActive.mockReturnValue(false);
    qzMock.websocket.connect.mockResolvedValue(undefined);
    vi.resetModules();
  });

  it('reports connected with the default printer and list', async () => {
    const { probeQz } = await import('./qzPrintService');
    expect(await probeQz()).toEqual({
      connected: true,
      defaultPrinter: 'OSCAR MetaPrint(ZPL)',
      printers: ['OSCAR MetaPrint(ZPL)', 'Save as PDF'],
    });
  });

  it('reports disconnected when connect fails', async () => {
    qzMock.websocket.connect.mockRejectedValueOnce(new Error('no agent'));
    const { probeQz } = await import('./qzPrintService');
    expect(await probeQz()).toEqual({ connected: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/labels/qzPrintService.test.ts`
Expected: FAIL — `tryQzPrint` / `probeQz` are not exported.

- [ ] **Step 3: Implement the connection, print and probe (append to `qzPrintService.ts`)**

Append to `src/lib/pdf/labels/qzPrintService.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdf/labels/qzPrintService.test.ts`
Expected: PASS (all prefs + tryQzPrint + probeQz tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/labels/qzPrintService.ts src/lib/pdf/labels/qzPrintService.test.ts
git commit -m "feat(labels): qz connection, pixel-PDF print and status probe"
```

---

## Task 4: Wire QZ into `buildAndEmit` (+ `buildLabelBase64`)

**Files:**
- Modify: `src/lib/pdf/labels/labelPrintService.ts:130-166` (`buildAndEmit`, and add `buildLabelBase64` next to `buildLabelBlobUrl`)

- [ ] **Step 1: Add `buildLabelBase64` next to `buildLabelBlobUrl`**

In `src/lib/pdf/labels/labelPrintService.ts`, immediately after the `buildLabelBlobUrl` function (ends ~line 166), add:

```ts
/** Same builder as printing, returned as a raw base64 PDF (no data: prefix) for
 *  the QZ Tray pixel-print path (LabelStudio Test print / direct print). */
export async function buildLabelBase64(
  labels: CompactLabelContent[],
  size: LabelSizePreset,
  fontFamily: string,
): Promise<string> {
  const [{ createPdfWithFonts }, { buildCompactLabelDocument }] = await Promise.all([
    import('../fonts'),
    import('./compactLabelDocument'),
  ]);
  const pdf = createPdfWithFonts(buildCompactLabelDocument(labels, size, fontFamily));
  return new Promise<string>((resolve) => pdf.getBase64((data: string) => resolve(data)));
}
```

- [ ] **Step 2: Change the `buildAndEmit` print branch to try QZ first**

Replace the body of `buildAndEmit` (currently lines 130-145) so the `'print'` branch tries QZ and falls back:

```ts
async function buildAndEmit(
  labels: CompactLabelContent[],
  size: LabelSizePreset,
  fontFamily: string,
  output: LabelOutput,
  filename: string,
): Promise<void> {
  const [{ createPdfWithFonts }, { buildCompactLabelDocument }] = await Promise.all([
    import('../fonts'),
    import('./compactLabelDocument'),
  ]);
  const pdf = createPdfWithFonts(buildCompactLabelDocument(labels, size, fontFamily));
  if (output === 'download') pdf.download(filename);
  else if (output === 'open') pdf.open();
  else {
    // Direct print: hand the exact-size PDF to QZ Tray (silent, correct size).
    // If QZ isn't installed/running, fall back to the browser print dialog.
    const { tryQzPrint } = await import('./qzPrintService');
    const handled = await tryQzPrint(pdf, size);
    if (!handled) pdf.print();
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Run the existing label tests (no regressions)**

Run: `npx vitest run src/lib/pdf/labels`
Expected: PASS (existing `labelContent` / `labelSizes` / `compactLabelDocument` / `qzPrintService` suites green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/labels/labelPrintService.ts
git commit -m "feat(labels): print via QZ Tray with browser-dialog fallback"
```

---

## Task 5: `previewLabelBase64` sample helper

**Files:**
- Modify: `src/lib/pdf/labels/labelPreview.ts`

- [ ] **Step 1: Extract the sample-mapping into a shared helper and add the base64 preview**

In `src/lib/pdf/labels/labelPreview.ts`, update the import from `labelPrintService` to also pull `buildLabelBase64`, then replace the `previewLabelBlob` function (lines 38-53) with a shared `sampleLabelImages` helper plus both preview functions:

```ts
import { resolveLabelImages, buildLabelBlobUrl, buildLabelBase64 } from './labelPrintService';
```

```ts
/** Map + rasterize one representative label for `entity` under `config`. Shared
 *  by the iframe preview (blob URL) and the QZ Test print (base64). */
async function sampleLabelImages(entity: LabelEntity, config: LabelEntityConfig) {
  const size = getLabelSize(config.sizeId);
  const mapped =
    entity === 'case'
      ? caseLabelContents(sampleReceiptData(), size, config.fields).slice(0, 1)
      : entity === 'stock'
        ? [stockLabelContent(SAMPLE_STOCK, { priceText: '1,234.50', locationName: 'Shelf A-3', companyName: 'Space Data Recovery' }, config.fields)]
        : [inventoryLabelContent(SAMPLE_INVENTORY, config.fields)];
  const labels = await resolveLabelImages(mapped, size, {
    showQr: config.showQr,
    showBarcode: config.showBarcode,
  });
  return { size, labels };
}

/** Render one representative label for `entity` under `config`; returns a blob URL. */
export async function previewLabelBlob(entity: LabelEntity, config: LabelEntityConfig): Promise<string> {
  const { size, labels } = await sampleLabelImages(entity, config);
  return buildLabelBlobUrl(labels, size, 'Roboto');
}

/** Render one representative label as base64 PDF for the QZ Tray Test print. */
export async function previewLabelBase64(entity: LabelEntity, config: LabelEntityConfig): Promise<string> {
  const { size, labels } = await sampleLabelImages(entity, config);
  return buildLabelBase64(labels, size, 'Roboto');
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/labels/labelPreview.ts
git commit -m "feat(labels): previewLabelBase64 sample helper for QZ test print"
```

---

## Task 6: `DirectPrintCard` settings component

> **UI task — load the skill-gate design skills first.** Before writing this
> component, invoke `frontend-design` and `ui-ux-pro-max` (per CLAUDE.md) and
> follow DESIGN.md semantic tokens. Mirror the existing card chrome in
> `PreferencesSettings.tsx` (`bg-white rounded-2xl shadow-lg border border-slate-200 p-6`,
> `text-slate-900/500`, `text-primary`, switch pattern from `LabelPrintingCard`).

**Files:**
- Create: `src/components/settings/labels/DirectPrintCard.tsx`
- Create: `src/components/settings/labels/DirectPrintCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/settings/labels/DirectPrintCard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DirectPrintCard } from './DirectPrintCard';

vi.mock('../../../lib/pdf/labels/qzPrintService', () => ({
  probeQz: vi.fn(),
  qzPrintPdfBase64: vi.fn().mockResolvedValue(undefined),
  getQzPrefs: vi.fn(() => ({ mode: 'auto', printer: undefined })),
  setQzPrefs: vi.fn(),
}));
vi.mock('../../../lib/pdf/labels/labelPreview', () => ({
  previewLabelBase64: vi.fn().mockResolvedValue('QkFTRTY0'),
}));
vi.mock('../../../lib/labelPrefsService', () => ({
  getLabelPrintingPrefs: vi.fn().mockResolvedValue({}),
  labelEntityConfig: vi.fn(() => ({ sizeId: 'nb_15x26', showQr: true, showBarcode: true, fields: {}, autoPrint: false, copies: 1 })),
  DEFAULT_LABEL_PRINTING_PREFS: {},
}));

import { probeQz, setQzPrefs, qzPrintPdfBase64 } from '../../../lib/pdf/labels/qzPrintService';

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DirectPrintCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DirectPrintCard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows a "Not detected" state with an install link when QZ is unreachable', async () => {
    vi.mocked(probeQz).mockResolvedValue({ connected: false });
    renderCard();
    expect(await screen.findByText(/not detected/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /install qz tray/i })).toHaveAttribute('href', 'https://qz.io/download');
  });

  it('shows Connected with the default printer when reachable', async () => {
    vi.mocked(probeQz).mockResolvedValue({ connected: true, defaultPrinter: 'OSCAR MetaPrint(ZPL)', printers: ['OSCAR MetaPrint(ZPL)'] });
    renderCard();
    expect(await screen.findByText(/connected/i)).toBeInTheDocument();
    expect(screen.getByText(/OSCAR MetaPrint\(ZPL\)/)).toBeInTheDocument();
  });

  it('persists the Off toggle to prefs', async () => {
    vi.mocked(probeQz).mockResolvedValue({ connected: true, defaultPrinter: 'P', printers: ['P'] });
    renderCard();
    const toggle = await screen.findByRole('switch', { name: /direct printing/i });
    fireEvent.click(toggle);
    expect(setQzPrefs).toHaveBeenCalledWith(expect.objectContaining({ mode: 'off' }));
  });

  it('runs a test print through the QZ transport', async () => {
    vi.mocked(probeQz).mockResolvedValue({ connected: true, defaultPrinter: 'P', printers: ['P'] });
    renderCard();
    const btn = await screen.findByRole('button', { name: /test print/i });
    fireEvent.click(btn);
    await waitFor(() => expect(qzPrintPdfBase64).toHaveBeenCalledWith('QkFTRTY0', expect.objectContaining({ widthMm: 26, heightMm: 15 }), expect.anything()));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/settings/labels/DirectPrintCard.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `src/components/settings/labels/DirectPrintCard.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '../../../hooks/useToast';
import { logger } from '../../../lib/logger';
import { settingsKeys } from '../../../lib/queryKeys';
import { getLabelSize } from '../../../lib/pdf/labels/labelSizes';
import {
  probeQz,
  getQzPrefs,
  setQzPrefs,
  qzPrintPdfBase64,
  type QzMode,
} from '../../../lib/pdf/labels/qzPrintService';
import { previewLabelBase64 } from '../../../lib/pdf/labels/labelPreview';
import { getLabelPrintingPrefs, labelEntityConfig } from '../../../lib/labelPrefsService';

/**
 * Settings → Preferences: per-WORKSTATION direct label printing via QZ Tray.
 * Shows agent status, the Auto/Off switch, an optional printer override, and a
 * Test print. All state is localStorage (the printer is physical to this PC).
 */
export const DirectPrintCard: React.FC = () => {
  const toast = useToast();
  const [mode, setMode] = useState<QzMode>(() => getQzPrefs().mode);
  const [printer, setPrinter] = useState<string>(() => getQzPrefs().printer ?? '');
  const [testing, setTesting] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['qz', 'status'],
    queryFn: probeQz,
    staleTime: 15_000,
    retry: false,
  });

  // Default the printer override selection to the detected default (display only
  // until the user changes it — an empty override means "use system default").
  useEffect(() => {
    if (!printer && status?.defaultPrinter) setPrinter(status.defaultPrinter);
  }, [status?.defaultPrinter, printer]);

  const persist = (next: { mode?: QzMode; printer?: string }) => {
    const merged = { mode: next.mode ?? mode, printer: next.printer ?? printer };
    setQzPrefs({ mode: merged.mode, printer: merged.printer || undefined });
  };

  const handleToggle = () => {
    const next: QzMode = mode === 'auto' ? 'off' : 'auto';
    setMode(next);
    persist({ mode: next });
  };

  const handlePrinter = (value: string) => {
    setPrinter(value);
    persist({ printer: value });
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const prefs = await getLabelPrintingPrefs();
      const cfg = labelEntityConfig(prefs, 'inventory');
      const size = getLabelSize(cfg.sizeId);
      const base64 = await previewLabelBase64('inventory', cfg);
      await qzPrintPdfBase64(base64, size, { printer: printer || undefined });
      toast.success('Test label sent to the printer.');
    } catch (err) {
      logger.error('[DirectPrintCard] test print failed', err);
      toast.error('Test print failed. Is QZ Tray running and a printer selected?');
    } finally {
      setTesting(false);
    }
  };

  const connected = status?.connected === true;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
      <div className="flex items-center gap-2">
        <Printer className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="text-base font-semibold text-slate-900">Direct label printing (this workstation)</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Print labels silently at the exact label size straight to your thermal printer — no browser
        dialog, no A4 fallback. Requires the free QZ Tray helper installed on this PC. When it isn't
        running, labels open in the normal print dialog as before.
      </p>

      {/* Status row */}
      <div className="mt-4 flex items-center gap-2 text-sm">
        {isLoading ? (
          <span className="inline-flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking for QZ Tray…
          </span>
        ) : connected ? (
          <span className="inline-flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Connected
            {status?.defaultPrinter && (
              <span className="font-normal text-slate-500">· default: {status.defaultPrinter}</span>
            )}
          </span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2 text-slate-600">
            <AlertCircle className="h-4 w-4 text-warning" aria-hidden="true" /> Not detected
            <a
              href="https://qz.io/download"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Install QZ Tray →
            </a>
          </span>
        )}
      </div>

      {/* Auto / Off */}
      <div className="mt-4 flex items-center justify-between gap-6 border-t border-slate-100 pt-4">
        <div>
          <p className="text-sm font-medium text-slate-800">Use direct printing when available</p>
          <p className="text-xs text-slate-500">Off = always use the browser print dialog on this PC.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={mode === 'auto'}
          aria-label="Direct printing"
          onClick={handleToggle}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            mode === 'auto' ? 'bg-primary' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              mode === 'auto' ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Printer override + test */}
      {connected && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="qz-printer" className="mb-1 block text-sm font-medium text-slate-800">
              Printer
            </label>
            <select
              id="qz-printer"
              value={printer}
              onChange={(e) => handlePrinter(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {(status?.printers ?? []).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Printer className="h-4 w-4" aria-hidden="true" />}
            Test print
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        First print on a new PC shows a one-time QZ Tray “Allow” prompt — tick “Remember” and it stays
        silent after that.
      </p>
    </div>
  );
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/settings/labels/DirectPrintCard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npx eslint src/components/settings/labels/DirectPrintCard.tsx`
Expected: 0 errors, clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/labels/DirectPrintCard.tsx src/components/settings/labels/DirectPrintCard.test.tsx
git commit -m "feat(labels): DirectPrintCard settings UI (status, toggle, printer, test)"
```

---

## Task 7: Wire the card into Preferences + Label Studio pointer

**Files:**
- Modify: `src/pages/settings/PreferencesSettings.tsx`
- Modify: `src/components/settings/labels/LabelStudio.tsx:308-311`

- [ ] **Step 1: Render `DirectPrintCard` under the label printing card**

In `src/pages/settings/PreferencesSettings.tsx`, add the import near the other imports:

```ts
import { DirectPrintCard } from '../../components/settings/labels/DirectPrintCard';
```

Then render it immediately after `<LabelPrintingCard />` (currently line 264):

```tsx
      <LabelPrintingCard />

      <DirectPrintCard />
```

- [ ] **Step 2: Add a pointer from the Label Studio hint**

In `src/components/settings/labels/LabelStudio.tsx`, replace the closing hint paragraph (lines 308-311) with one that points to the setting:

```tsx
          <p className="mt-3 px-1 text-xs text-slate-500">
            Print at 100% scale. For silent, exact-size printing straight to a thermal printer, enable{' '}
            <span className="font-medium text-slate-600">Direct label printing</span> in Settings →
            Preferences (installs the free QZ Tray helper). Otherwise labels open in the browser print
            dialog.
          </p>
```

- [ ] **Step 3: Typecheck + lint touched files**

Run: `npm run typecheck && npx eslint src/pages/settings/PreferencesSettings.tsx src/components/settings/labels/LabelStudio.tsx`
Expected: 0 errors, clean.

- [ ] **Step 4: Run any existing suites for the touched pages**

Run: `npx vitest run src/pages/settings src/components/settings`
Expected: PASS (no regressions; DirectPrintCard suite green).

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/PreferencesSettings.tsx src/components/settings/labels/LabelStudio.tsx
git commit -m "feat(labels): surface Direct print card in Preferences + Studio pointer"
```

---

## Task 8: Verification gate

**Files:** none (verification only)

- [ ] **Step 1: Typecheck (CI gate)**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: PASS except any pre-existing known failures (e.g. the 2 `chainOfCustodyParity` failures noted in prior plans). No NEW failures.

- [ ] **Step 3: Lint touched files**

Run: `npx eslint src/lib/pdf/labels/qzPrintService.ts src/lib/pdf/labels/labelPrintService.ts src/lib/pdf/labels/labelPreview.ts src/components/settings/labels/DirectPrintCard.tsx src/pages/settings/PreferencesSettings.tsx src/components/settings/labels/LabelStudio.tsx`
Expected: clean.

- [ ] **Step 4: Build (bundle sanity — qz-tray must be lazy, not in the main chunk)**

Run: `npm run build`
Expected: succeeds. `qz-tray` appears only in an async chunk (it is imported via `await import('qz-tray')` inside `qzPrintService`, which is itself `await import(...)`-ed from `buildAndEmit`).

- [ ] **Step 5: Manual verification (record results in the PR/handoff)**

Without QZ Tray running: create an inventory item with auto-print on → the browser print dialog opens as before (no regression). In Settings → Preferences the Direct print card shows "Not detected" + Install link.

With QZ Tray installed + a 26×15 mm roll loaded + the label printer as workstation default: open Settings → Preferences → Direct print → "Connected", pick the printer, **Test print** → after the one-time Allow+Remember prompt, a sample label prints at correct size. Then create an inventory item (auto-print on) → label prints silently at correct size, no dialog. Toggle **Off** → next print uses the browser dialog again.

- [ ] **Step 6: Adversarial self-review + push**

Run a multi-lens review of the branch diff (correctness, the never-throw contract on `tryQzPrint`, the cached-connection reset semantics, localStorage failure handling, bundle laziness). Fix confirmed findings.

```bash
git push -u origin claude/inventory-label-printer-v67p66
```

Do NOT open a PR unless explicitly requested.

---

## Self-Review Notes

- **Spec coverage:** §Architecture → Task 4 (buildAndEmit). §qzPrintService → Tasks 2-3. §prefs (localStorage) → Task 2. §DirectPrintCard in Preferences → Tasks 6-7. §Label Studio pointer → Task 7. §Dependency (`qz-tray` lazy) → Task 1 + verified in Task 8/4. §Testing → Tasks 2,3,6. §Boundaries: no DB migration, no engine change, download/open/preview untouched — honored (Task 4 only touches the `'print'` branch; `buildLabelBase64` is additive). §Early-risk spike → Task 1 Step 2.
- **Type consistency:** `QzPrefs`/`QzMode`/`QzStatus`, `getQzPrefs`/`setQzPrefs`, `tryQzPrint`, `qzPrintPdfBase64`, `probeQz`, `buildLabelBase64`, `previewLabelBase64`, `LABEL_DOTS_PER_MM` are named identically across every task that references them. `qz.configs.create`/`qz.print`/`qz.printers.getDefault`/`find` match the `qz-tray.d.ts` declaration in Task 1.
- **Density footgun:** `units:'mm'` ⇒ `density` is dots/mm (`LABEL_DOTS_PER_MM = 8`), asserted by a test in Task 2 and the config test in Task 3 — not a magic `203`.
- **Never-throw contract:** `tryQzPrint` and `probeQz` swallow all errors; only `qzPrintPdfBase64` throws (Test print catches it for a toast). Auto-print stays fire-and-forget (wizard unchanged).
