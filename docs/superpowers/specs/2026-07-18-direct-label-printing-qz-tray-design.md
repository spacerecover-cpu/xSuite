# Direct Label Printing via QZ Tray (pixel-PDF transport) — Design

**Date**: 2026-07-18 · **Status**: Approved (user chose Option A + MVP unsigned + default printer)

## Problem

Inventory (and case/stock) labels do not print automatically at the correct
size. On inventory create, `printInventoryLabels([item], { output: 'print' })`
routes through pdfmake's `pdf.print()` (hidden iframe → `window.print()`), which
opens Chrome's print dialog. Two symptoms follow, both inherent to the browser
print path — **not** the label builder:

1. **Not silent.** A normal browser page cannot bypass the print dialog (a
   security control), so "Auto-print on create" still requires a human click.
2. **Wrong size.** Chrome selects the paper size from the **printer driver's
   default stock**, not the PDF page/mediabox (`@page` size is ignored for media
   selection — Chromium issue 238303). The lab's printer (OSCAR MetaPrint(ZPL),
   a 203 dpi Zebra-compatible ZPL thermal printer) defaults to a 4×6"
   (`Custom 101.6×152.4mm`) stock, so the 26×15 mm label prints tiny in a corner.

The pdfmake output is already correct (page sized exactly to the label at 100%).
The gap is purely the **browser→printer transport**: no silent dispatch and no
control over the printer's paper size.

Research + adversarial verification (12-agent sweep, 2026-07-18): a local print
bridge is the robust fix. QZ Tray talks to the browser over a localhost
WebSocket and prints to a **named printer** with an **explicit paper size**,
bypassing both the browser dialog and the driver's default-stock problem. See
also `docs/bug-audit-round3-2026-07-17.md` (thermal-label feature context) and
the label engine at `src/lib/pdf/labels/`.

## Approach (chosen): Option A — QZ Tray pixel-prints the existing PDF

Change only the **transport**, not the renderer. Instead of `pdf.print()`, hand
the already-exact-size pdfmake PDF to QZ Tray as a base64 "pixel" job with the
label dimensions declared explicitly. QZ prints it silently to the workstation's
printer at the correct size.

**Why not raw ZPL (Option B, rejected).** Generating ZPL would mean a whole
second label renderer reproducing all 3 layout classes × 13 sizes, it **breaks
Arabic/CJK** (ZPL built-in fonts are Latin-only; RTL customer/item names would
have to be hand-rasterized to image fields — re-doing what the PDF already does),
and it depends on the OSCAR queue accepting raw ZPL (unverified). Option A reuses
the entire existing engine (all sizes, all 3 entities, QR, Code128, field
toggles, **RTL/Arabic via `reverseArabicText` + Noto fonts**) as the single
source of truth, and keeps preview == print. Raw ZPL remains a possible future
enhancement for pure-Latin tenants; out of scope here.

**Silent strategy — MVP unsigned.** QZ Tray shows its own one-time
*Allow + Remember* prompt per workstation on first print from the xSuite origin;
after the user accepts once, every print is silent. No certificate, no signing
service, no private-key management. Request signing (true zero-prompt from job
one) is a documented v2 upgrade — the print call is identical; signing only adds
a `setSignaturePromise` hook + a backend that holds the RSA key.

**Printer targeting — default printer.** v1 targets the workstation's default
printer (`qz.printers.getDefault()`), with an optional printer-name override
selectable in settings when QZ is connected.

## Architecture — one insertion point

All label printing already funnels through `buildAndEmit` in
`src/lib/pdf/labels/labelPrintService.ts`. Its `'print'` branch changes from
`pdf.print()` to a QZ attempt with a browser-dialog fallback:

```ts
async function buildAndEmit(labels, size, fontFamily, output, filename) {
  const pdf = createPdfWithFonts(buildCompactLabelDocument(labels, size, fontFamily));
  if (output === 'download') pdf.download(filename);
  else if (output === 'open') pdf.open();
  else {
    const handled = await tryQzPrint(pdf, size); // NEW
    if (!handled) pdf.print();                    // unchanged fallback
  }
}
```

Because case / stock / inventory labels and **every** print button route through
`buildAndEmit`, this fixes all label surfaces at once. `download` / `open`
outputs and the Label Studio live preview (`buildLabelBlobUrl`) are untouched.

## Components

### 1. `src/lib/pdf/labels/qzPrintService.ts` (new — single purpose: QZ transport)

- `tryQzPrint(pdf, size): Promise<boolean>` — reads per-workstation prefs; if
  `mode === 'off'` returns `false` without importing/connecting; else connects
  (cached, ~3 s timeout), resolves the printer, `pdf.getBase64()`, prints. Any
  failure or unavailability → returns `false` (caller falls back). **Never
  throws.**
- Print call:
  ```ts
  const cfg = qz.configs.create(printer, {
    size: { width: size.widthMm, height: size.heightMm },
    units: 'mm',
    density: LABEL_DPI_DOTS_PER_MM, // 8 (203 dpi ÷ 25.4, rounded) — QZ mm-units footgun handled explicitly
    scaleContent: false,
    rasterize: true,
    colorType: 'blackwhite',
  });
  await qz.print(cfg, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: base64 }]);
  ```
- Helpers for the settings card: `probeAvailable()`, `getPrinters()`,
  `getDefaultPrinter()`, `testPrint(size)`.
- Connection is **cached** (one `qz.websocket.connect()`), timeout-capped so a
  missing agent never hangs a print button.
- **Unsigned:** no cert/signature promises are set → QZ uses its Allow+Remember
  flow.
- `qz-tray` is **lazy-imported** inside this module, so it never enters any
  page's initial bundle (same pattern as the pdfmake/barcode dynamic imports).

### 2. Per-workstation preferences (localStorage — no DB)

- Key `xsuite.labelPrint.qz`, value `{ mode: 'auto' | 'off', printer?: string }`,
  default `{ mode: 'auto' }` when absent.
- `mode: 'auto'` → use QZ when reachable, else fall back to the browser dialog.
- `mode: 'off'` → always use the browser dialog (skip QZ entirely).
- localStorage is correct: the printer is tied to the **machine**, not the
  user/tenant — nothing is persisted server-side, so there is no RLS /
  multi-tenant surface and no migration. A tiny `qzPrefs` read/write helper lives
  in `qzPrintService.ts`.

### 3. `src/components/settings/labels/DirectPrintCard.tsx` (new — settings UI)

A compact card rendered in **Settings → Preferences** (accessible to all staff,
unlike the admin-gated Label Studio):
- **Status**: "Connected ✓" (with resolved default printer) or "Not detected"
  with an **Install QZ Tray** link (https://qz.io/download).
- **Auto / Off** toggle (persists to localStorage).
- **Printer** `<select>` populated from `getPrinters()` when connected; default =
  system default; selection persisted to localStorage.
- **Test print** button → `testPrint()` with success/error toast.
- Styled with DESIGN.md semantic tokens; `frontend-design` + `ui-ux-pro-max`
  loaded at implementation per the CLAUDE.md skill gate.
- A one-line pointer added to the Label Studio hint
  (`LabelStudio.tsx`): "Silent direct printing → Settings → Preferences".

## Data flow

1. Inventory item created → wizard calls
   `printInventoryLabels([item], { output: 'print' })` (**unchanged**).
2. → `resolveLabelConfig` + label mapping → `buildAndEmit(..., 'print', filename)`.
3. `buildAndEmit` builds the pdf, then `await tryQzPrint(pdf, size)`:
   - prefs `off` → `false`;
   - connect fails/times out → `false`;
   - success → `true`.
4. `false` → `pdf.print()` (today's dialog) as fallback.

## Error handling

- Auto-print stays **fire-and-forget** (the wizard already wraps it in
  `void …then(…)`); it must never block or throw into intake.
- All QZ errors are logged via `logger` and swallowed → browser-dialog fallback.
- Connect timeout-capped + cached: first print may take ~1–3 s to connect;
  subsequent prints are instant.
- Manual "Print Label" buttons: on QZ-`auto`-but-unreachable we simply fall
  through to the dialog (today's behavior) with no nag. The settings **Test
  print** gives explicit success/error feedback.

## Dependencies

- Add npm **`qz-tray`** (LGPL-2.1, official client), pinned to the **2.2.x** line
  to match the agent (latest 2.2.6). Lazy-imported only. No equivalent exists in
  the tree (flagged per the "check before adding packages" rule).
- **No DB migration. No `database.types.ts` change.**

## Testing (TDD)

- `qzPrintService.test.ts`:
  - `mode: 'off'` → `tryQzPrint` returns `false` without connecting.
  - QZ unreachable (connect rejects/times out) → `false` (fallback).
  - QZ reachable → builds the pixel config with `size` in mm + `density: 8`,
    calls `qz.print`, returns `true`.
  - printer resolution: configured name vs. `getDefault()`.
  - density derived from the `LABEL_DPI` constant (not a magic number).
- `labelPrintService` test: `buildAndEmit` uses QZ when available and falls back
  to `pdf.print()` when not (mock `qzPrintService`).
- `DirectPrintCard.test.tsx`: status render (connected / not-detected + install
  link), Auto/Off toggle persists to localStorage, Test print calls the service.
- Mock the `qz-tray` module (it needs WebSocket/DOM); mock the `qz` object.

## Boundaries

- **In scope:** transport swap in `buildAndEmit`, `qzPrintService`, per-workstation
  prefs, `DirectPrintCard` in Preferences, Label Studio hint pointer, tests,
  `qz-tray` dependency.
- **Out of scope (v2 / future):** request signing + certificate service
  (zero-prompt), raw ZPL generation, any change to the label design engine
  (sizes, fields, QR/Code128, RTL), a tenant-level enable toggle.
- **Unchanged:** the compact label engine, `download`/`open` outputs, the Label
  Studio live preview, `company_settings.metadata.label_printing`.

## Early risk to de-risk first (spike, ~15 min)

Confirm the `qz-tray` npm client imports cleanly under Vite (UMD/`window`
references) via a lazy dynamic import and can `qz.websocket.connect()` +
`qz.printers.getDefault()`. If import ergonomics are poor, fall back to loading
the vendored `qz-tray.js` as a lazy module. Validate before building the rest.

## Verification (gate)

- `npm run typecheck` → 0 errors (CI gate).
- New unit tests green; full `npx vitest run` → no new failures beyond known
  pre-existing ones.
- `eslint` clean on touched files.
- Manual: with QZ Tray installed + a 26×15 mm stock loaded, create an inventory
  item → label prints silently at correct size (after the one-time Allow+Remember);
  with QZ **not** running → falls back to the browser dialog (no regression).
