# Bulk Label Printing — Design

**Date**: 2026-07-18 · **Status**: Approved (scope = both selection + all-filtered; both entities; chunked + progress; silent via QZ; soft-capped no-QZ path)

## Problem

A tenant relabeling their entire inventory wants to print **all** inventory/stock labels in one operation, with **N copies each** (they need 2). Today:

- **Inventory** list has only a **per-row** "Print label" — no selection, no bulk.
- **Stock** list already has selection-mode + a `PrintLabelsModal` that batch-prints the **selected** items as one PDF with a copies override — but "select all" only covers the **currently loaded page** (~50 rows), and it builds **one un-chunked PDF**.

Neither has a cross-page "print everything matching the current filter" scope, and neither is safe at the scale of a full relabel (≈1,000 items × 2 = 2,000 label pages built client-side would risk crashing the tab).

## What already exists (reuse — do not rebuild)

- **Engine:** `printInventoryLabels(items[], opts)` / `printStockLabelBatch(entries[], opts)` each build **one** multi-page PDF and emit it; `withCopies` repeats each label up to 20× (`labelPrintService.ts`).
- **Stock modal:** `components/stock/PrintLabelsModal.tsx` — `LabelPrintOptionsFields` (size / copies / QR overlaid on the tenant design), **Print** + **Download PDF**, dynamic-imports pdfmake.
- **Options field:** `components/labels/LabelPrintOptionsFields.tsx` (`sizeId`/`copies`/`showQr`/`showBarcode`).
- **QZ transport:** `qzPrintService.probeQz()` (availability + printers) and the `output: 'print'` path already routes through QZ silently when installed, else the browser dialog.
- **Selection:** `StockListPage` selection pattern (`selectedIds`, `selectedItems`, `toggleSelectAll`, selection bar), `useListSelectionEnabled`, shared `BulkActionsBar`.
- **Item shape:** `getInventoryItemsPage` returns enriched rows (brand / device_type / capacity / storage_location joins + `*`), which already carry every inventory-label field (`item_number`, `qr_value`, `barcode`, `created_at`).

## Scope (approved)

- **Both scopes:** print the **selected** rows, or **all items matching the current filters**.
- **Both entities:** inventory and stock, via one shared modal.
- **Copies:** a per-run field (reusing `LabelPrintOptionsFields`), defaulting to the tenant's configured copies — the tenant sets it to 2 for this run.

## Architecture

### 1. Chunked orchestrator — `src/lib/pdf/labels/bulkLabelPrint.ts` (new)

```ts
export interface BulkPrintProgress { done: number; total: number; chunk: number; chunks: number }
export interface BulkPrintOptions {
  copies: number;
  config: LabelEntityConfig;            // tenant design + per-run overrides
  output: 'print' | 'download';
  onProgress?: (p: BulkPrintProgress) => void;
  signal?: AbortSignal;                 // Cancel button
}
export interface BulkPrintResult { success: boolean; printedItems: number; chunks: number; error?: string }

/** Split items into ≤LABELS_PER_CHUNK-page batches and print/download each in
 *  sequence, reporting progress. Never builds one giant document. */
export async function printInventoryLabelsBulk(items: InventoryItemWithDetails[], opts: BulkPrintOptions): Promise<BulkPrintResult>;
export async function printStockLabelsBulk(entries: StockLabelBatchEntry[], opts: BulkPrintOptions): Promise<BulkPrintResult>;
```

- `LABELS_PER_CHUNK = 250`; items-per-chunk = `max(1, floor(LABELS_PER_CHUNK / copies))` so each chunk PDF stays ≤ ~250 pages.
- Each chunk calls the existing `printInventoryLabels` / `printStockLabelBatch` with `{ output, config }` (which already applies `copies` + emit path). For `output:'download'`, each chunk downloads as `…-part-<k>-of-<n>.pdf`.
- Awaits each chunk before the next; calls `onProgress`; honors `signal` (abort between chunks).
- Memory-safe: only one chunk's PDF is in memory at a time.

### 2. Fetch-all-filtered — service helpers

- `inventoryService.fetchAllInventoryItemsForLabels(filters)` — loop `getInventoryItemsPage({ ...filters, page, pageSize: 200 })` until `rows.length` reaches `total` (or `MAX_BULK_ITEMS = 5000`), concatenating rows. Returns the enriched rows (already label-ready).
- `stockService.fetchAllStockItemsForLabels(filters)` — analogous over the stock list query.
- Both stop at `MAX_BULK_ITEMS` and report if truncated (the modal warns "showing first 5000").

### 3. Shared modal — `src/components/labels/BulkLabelPrintModal.tsx` (new)

Generalizes `PrintLabelsModal`. Props:

```ts
interface BulkLabelPrintModalProps {
  entity: 'inventory' | 'stock';
  selected: BulkTarget[];                        // currently-selected rows
  fetchAllFiltered: () => Promise<{ items: BulkTarget[]; truncated: boolean }>;
  extraFields?: React.ReactNode;                 // stock-only: company / location / show-price
  onClose: () => void;
}
```

- **Scope radio:** "Selected (N)" vs "All matching filters" (the latter lazily calls `fetchAllFiltered` and shows the count M, spinner while loading).
- **Options:** `LabelPrintOptionsFields` seeded from `labelEntityConfig(prefs, entity)` (copies editable; default tenant).
- **Readout:** `total = count × copies`, with a warning band when `total > SINGLE_JOB_CAP`.
- **QZ status** (`probeQz`, cached): drives dispatch + the soft cap.
- **Buttons:** Print, Download PDF, Cancel; a **progress bar + Cancel** while a bulk job runs.
- Stock passes its `extraFields` (company / location / show-price) and maps them into the print opts via a thin per-entity adapter; inventory passes none.

### 4. Dispatch rules (in the modal)

| total labels | Print | Download |
|---|---|---|
| ≤ `SINGLE_JOB_CAP` (250) | one batch (QZ silent, or one browser dialog) | one PDF |
| > cap, **QZ available** | chunked **silent** print + progress + Cancel | chunked part-files + progress |
| > cap, **no QZ** | **blocked with a nudge**: "N labels — install QZ Tray for silent bulk printing, or narrow the filter / lower copies." Download still offered. | chunked part-files + progress |

Rationale: without QZ, chunked printing would pop a dialog per chunk — worse than one nudge. Download stays available (memory-safe part-files).

### 5. List-page wiring

- **`InventoryListPage`** — add selection mode mirroring `StockListPage` (`selectedIds` set, row checkboxes gated by `useListSelectionEnabled`, a selection bar with a **Print labels** action) that opens `BulkLabelPrintModal` with `entity:'inventory'`, `selected = selectedItems`, and `fetchAllFiltered` bound to the current filter state.
- **`StockListPage`** — replace the direct `PrintLabelsModal` with `BulkLabelPrintModal` (`entity:'stock'`, its existing selected-items + a new `fetchAllStockItemsForLabels(filters)`, and its company/location/show-price block passed as `extraFields`). Existing single-batch behavior is preserved for small jobs.

## Boundaries

- **In:** the orchestrator, fetch-all helpers, the shared modal, inventory selection + bulk action, stock modal swap, tests.
- **Out:** any change to the label design engine or `LabelPrintOptionsFields`; a queue/server-side print service; combining chunks into a single downloaded PDF (needs a PDF-merge lib — not worth it; part-files instead); raw-ZPL bulk (pixel-PDF path only).
- **Unchanged:** label rendering, auto-print-on-create, per-row Print label, QZ transport, `database.types.ts`. **No DB migration.**
- **Custody:** none — inventory/stock items are not chain-of-custody devices, so reprinting their labels has no forensic implications.

## Testing (TDD)

- `bulkLabelPrint.test.ts`: chunk math (items-per-chunk from copies); N chunks for N×cap items; `onProgress` fires per chunk with correct done/total; abort stops between chunks; empty input guarded; each chunk calls the entity print fn with `{ output, config }`.
- fetch-all helpers: loop until `total`, stop at `MAX_BULK_ITEMS`, report `truncated`.
- `BulkLabelPrintModal.test.tsx`: scope toggle switches count; `total = count × copies` display; QZ-absent + large + Print shows the nudge (no chunked print); Download runs chunked; Cancel aborts.
- Inventory selection wiring: selecting rows enables the Print-labels action (light render test).

## Verification (gate)

`npm run typecheck` (0); new + existing label/stock/inventory suites green; full suite no new failures; eslint clean; build succeeds. Manual: select a few inventory items → Print labels → copies 2 → prints both copies; "All matching filters" on a location filter → chunked progress → completes; no-QZ + 1000×2 → nudge shown, Download works.

## Branch / PR

New feature → **its own PR**. #427 (identifier font size) is currently open on `claude/inventory-label-printer-v67p66`; this work is committed locally but **kept off #427's PR** and shipped as a separate PR once #427 merges (restart the branch from `main`, then push). If #427 is still open at push time, confirm branch handling with the user.
