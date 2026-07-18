# Bulk Label Printing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print all inventory/stock labels (selected rows, or all items matching the current filter) in one operation with a copies override, scaled safely via chunked generation + progress, silent through QZ Tray when available.

**Architecture:** A chunked orchestrator (`bulkLabelPrint.ts`) drives the existing per-entity print functions batch-by-batch (never one giant PDF). Fetch-all helpers page through the current filter. A shared `BulkLabelPrintModal` (generalized from the stock `PrintLabelsModal`) exposes scope (selected / all-filtered), a copies+size override, a QZ-aware dispatch, and a progress bar. The inventory list gains selection-mode + a bulk action; the stock list swaps to the shared modal.

**Tech Stack:** React 18 + TS + Vite, TanStack Query v5, pdfmake (existing engine), vitest + @testing-library/react, Tailwind (DESIGN.md tokens), lucide-react.

**Design spec:** `docs/superpowers/specs/2026-07-18-bulk-label-printing-design.md`

**Branch:** ships as its **own PR** after #427 merges (restart from `main`, then push). Implement locally on `claude/inventory-label-printer-v67p66`; do not push onto #427.

---

## File Structure

- **Modify** `src/lib/pdf/labels/labelPrintService.ts` — add an optional `filename?` to `LabelPrintOptions` (for chunk part-names).
- **Create** `src/lib/pdf/labels/bulkLabelPrint.ts` (+ test) — the chunked orchestrator.
- **Modify** `src/lib/inventoryService.ts` — `fetchAllInventoryItemsForLabels(filters)`.
- **Modify** `src/lib/stockService.ts` — `fetchAllStockItemsForLabels(filters)`.
- **Create** `src/components/labels/BulkLabelPrintModal.tsx` (+ test) — the shared modal.
- **Modify** `src/pages/inventory/InventoryListPage.tsx` — selection-mode + bulk Print-labels action + modal.
- **Modify** `src/pages/stock/StockListPage.tsx` — swap `PrintLabelsModal` → `BulkLabelPrintModal` (all-filtered scope).
- **Remove** `src/components/stock/PrintLabelsModal.tsx` + `.test.tsx` after the swap (superseded).

**No DB migration.**

---

## Task 1: `filename?` override on the print path

**Files:** Modify `src/lib/pdf/labels/labelPrintService.ts`

- [ ] **Step 1: Add `filename?` to `LabelPrintOptions`**

In the `LabelPrintOptions` interface add:

```ts
  /** Override the emitted PDF filename (used for chunked bulk part-files). */
  filename?: string;
```

- [ ] **Step 2: Use it in `printInventoryLabels` and `printStockLabelBatch`**

In `printInventoryLabels`, replace the `filename` computation's use in `buildAndEmit(...)` so an override wins:

```ts
    const first = items[0];
    const filename =
      opts.filename ??
      (items.length === 1 ? `inv-label-${first.item_number ?? first.id}.pdf` : 'inventory-labels.pdf');
    await buildAndEmit(labels, cfg.size, fontFamily, opts.output ?? 'print', filename, emitOptions(cfg));
```

In `printStockLabelBatch`, similarly:

```ts
    const filename =
      opts.filename ??
      (entries.length === 1
        ? `stock-label-${entries[0].item.sku ?? entries[0].item.name.replace(/\s+/g, '-')}.pdf`
        : 'stock-labels.pdf');
```

- [ ] **Step 3: Typecheck + label suite**

Run: `npm run typecheck` → 0 errors.
Run: `npx vitest run src/lib/pdf/labels` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/labels/labelPrintService.ts
git commit -m "feat(labels): optional filename override on label print

$TRAILERS"
```

(`$TRAILERS` = the two-line Co-Authored-By + Claude-Session block, appended to every commit in this plan.)

---

## Task 2: Chunked orchestrator (`bulkLabelPrint.ts`)

**Files:** Create `src/lib/pdf/labels/bulkLabelPrint.ts` + `bulkLabelPrint.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/pdf/labels/bulkLabelPrint.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const printInventoryLabels = vi.fn().mockResolvedValue({ success: true });
const printStockLabelBatch = vi.fn().mockResolvedValue({ success: true });
vi.mock('./labelPrintService', () => ({ printInventoryLabels, printStockLabelBatch }));

import { printInventoryLabelsBulk, LABELS_PER_CHUNK } from './bulkLabelPrint';
import type { LabelEntityConfig } from '../../labelPrefsService';

const cfg = (copies: number): LabelEntityConfig => ({
  sizeId: 'nb_15x26', autoPrint: false, copies, showQr: true, showBarcode: true,
  fields: {}, idAlign: 'left', showIcon: false, iconPosition: 'top-right', idScale: 1,
});
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, item_number: `INV-${i}` }));

describe('printInventoryLabelsBulk', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prints a single chunk for a small set and reports progress', async () => {
    const onProgress = vi.fn();
    const res = await printInventoryLabelsBulk(items(10) as never, { config: cfg(2), output: 'print', onProgress });
    expect(res).toEqual({ success: true, printedItems: 10, chunks: 1 });
    expect(printInventoryLabels).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith({ done: 10, total: 10, chunk: 1, chunks: 1 });
  });

  it('splits into chunks sized by copies so each PDF stays <= LABELS_PER_CHUNK pages', async () => {
    // copies=2 → itemsPerChunk = floor(LABELS_PER_CHUNK/2). 3× that many items → 3 chunks.
    const per = Math.floor(LABELS_PER_CHUNK / 2);
    const res = await printInventoryLabelsBulk(items(per * 3) as never, { config: cfg(2), output: 'print' });
    expect(res.chunks).toBe(3);
    expect(printInventoryLabels).toHaveBeenCalledTimes(3);
    expect((printInventoryLabels.mock.calls[0][0] as unknown[]).length).toBe(per);
  });

  it('passes output + config + a part filename to each chunk on download', async () => {
    const per = Math.floor(LABELS_PER_CHUNK / 1);
    await printInventoryLabelsBulk(items(per * 2) as never, { config: cfg(1), output: 'download' });
    expect(printInventoryLabels.mock.calls[0][1]).toMatchObject({ output: 'download', filename: 'inventory-labels-part-1-of-2.pdf' });
    expect(printInventoryLabels.mock.calls[1][1]).toMatchObject({ filename: 'inventory-labels-part-2-of-2.pdf' });
  });

  it('stops and reports failure if a chunk fails', async () => {
    printInventoryLabels.mockResolvedValueOnce({ success: false, error: 'boom' });
    const res = await printInventoryLabelsBulk(items(Math.floor(LABELS_PER_CHUNK / 1) * 2) as never, { config: cfg(1), output: 'print' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('boom');
    expect(printInventoryLabels).toHaveBeenCalledTimes(1); // aborted after the failed chunk
  });

  it('aborts between chunks when the signal fires', async () => {
    const ac = new AbortController();
    const per = Math.floor(LABELS_PER_CHUNK / 1);
    printInventoryLabels.mockImplementationOnce(async () => { ac.abort(); return { success: true }; });
    const res = await printInventoryLabelsBulk(items(per * 3) as never, { config: cfg(1), output: 'print', signal: ac.signal });
    expect(res.success).toBe(false);
    expect(printInventoryLabels).toHaveBeenCalledTimes(1);
  });

  it('guards an empty set', async () => {
    const res = await printInventoryLabelsBulk([] as never, { config: cfg(2), output: 'print' });
    expect(res).toEqual({ success: false, printedItems: 0, chunks: 0, error: 'No items to print' });
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/pdf/labels/bulkLabelPrint.test.ts`) — module missing.

- [ ] **Step 3: Implement `bulkLabelPrint.ts`**

```ts
/**
 * Bulk label printing — split a large set of items into ≤LABELS_PER_CHUNK-page
 * batches and print/download each in sequence, so the browser never holds one
 * giant pdfmake document. Each chunk goes through the normal per-entity print
 * path (silent via QZ Tray when installed, else the browser dialog / a download
 * part-file). Progress and cancellation are reported between chunks.
 */

import type { LabelEntityConfig } from '../../labelPrefsService';
import type { InventoryItemWithDetails } from '../../inventory/inventoryLabelTypes';
import type { StockLabelBatchEntry } from './labelPrintService';

export const LABELS_PER_CHUNK = 250;

export interface BulkPrintProgress { done: number; total: number; chunk: number; chunks: number }
export interface BulkPrintOptions {
  config: LabelEntityConfig; // tenant design + per-run overrides (copies inside)
  output: 'print' | 'download';
  onProgress?: (p: BulkPrintProgress) => void;
  signal?: AbortSignal;
}
export interface BulkPrintResult { success: boolean; printedItems: number; chunks: number; error?: string }

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Items per chunk so `itemsPerChunk × copies` stays within LABELS_PER_CHUNK pages. */
function itemsPerChunk(copies: number): number {
  return Math.max(1, Math.floor(LABELS_PER_CHUNK / Math.max(1, copies)));
}

async function runBulk<T>(
  items: T[],
  opts: BulkPrintOptions,
  filenameStem: string,
  printChunk: (chunk: T[], perChunkOpts: { output: 'print' | 'download'; config: LabelEntityConfig; filename?: string }) => Promise<{ success: boolean; error?: string }>,
): Promise<BulkPrintResult> {
  if (items.length === 0) return { success: false, printedItems: 0, chunks: 0, error: 'No items to print' };
  const chunks = chunk(items, itemsPerChunk(opts.config.copies));
  let done = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (opts.signal?.aborted) return { success: false, printedItems: done, chunks: i, error: 'Cancelled' };
    const filename = opts.output === 'download' ? `${filenameStem}-part-${i + 1}-of-${chunks.length}.pdf` : undefined;
    const res = await printChunk(chunks[i], { output: opts.output, config: opts.config, filename });
    if (!res.success) return { success: false, printedItems: done, chunks: i, error: res.error ?? 'Print failed' };
    done += chunks[i].length;
    opts.onProgress?.({ done, total: items.length, chunk: i + 1, chunks: chunks.length });
    if (opts.signal?.aborted) return { success: false, printedItems: done, chunks: i + 1, error: 'Cancelled' };
  }
  return { success: true, printedItems: done, chunks: chunks.length };
}

export async function printInventoryLabelsBulk(items: InventoryItemWithDetails[], opts: BulkPrintOptions): Promise<BulkPrintResult> {
  const { printInventoryLabels } = await import('./labelPrintService');
  return runBulk(items, opts, 'inventory-labels', (c, o) => printInventoryLabels(c, o));
}

export async function printStockLabelsBulk(entries: StockLabelBatchEntry[], opts: BulkPrintOptions & { locationName?: string; companyName?: string }): Promise<BulkPrintResult> {
  const { printStockLabelBatch } = await import('./labelPrintService');
  return runBulk(entries, opts, 'stock-labels', (c, o) =>
    printStockLabelBatch(c, { ...o, locationName: opts.locationName, companyName: opts.companyName }),
  );
}
```

- [ ] **Step 4: Run → PASS.** Run: `npx vitest run src/lib/pdf/labels/bulkLabelPrint.test.ts` → PASS (6 tests).

- [ ] **Step 5: Typecheck + commit** — `npm run typecheck` → 0.

```bash
git add src/lib/pdf/labels/bulkLabelPrint.ts src/lib/pdf/labels/bulkLabelPrint.test.ts
git commit -m "feat(labels): chunked bulk-print orchestrator

$TRAILERS"
```

---

## Task 3: Fetch-all-filtered helpers

**Files:** Modify `src/lib/inventoryService.ts`, `src/lib/stockService.ts` (+ a small test each)

- [ ] **Step 1: Add the cap constant + inventory helper (`inventoryService.ts`)**

After `getInventoryItemsPage`, add:

```ts
/** Max items a single bulk-label operation will gather (guards a runaway relabel). */
export const MAX_BULK_LABEL_ITEMS = 5000;

/** Gather every inventory item matching `filters` (across pages) for bulk labels,
 *  capped at MAX_BULK_LABEL_ITEMS. `truncated` is true if the cap clipped the set. */
export async function fetchAllInventoryItemsForLabels(
  filters?: InventoryFilters,
): Promise<{ items: Awaited<ReturnType<typeof getInventoryItemsPage>>['rows']; truncated: boolean }> {
  const pageSize = 200;
  const items: Awaited<ReturnType<typeof getInventoryItemsPage>>['rows'] = [];
  let page = 0;
  let total = Infinity;
  while (items.length < total && items.length < MAX_BULK_LABEL_ITEMS) {
    const { rows, total: t } = await getInventoryItemsPage({ ...filters, page, pageSize });
    total = t;
    items.push(...rows);
    if (rows.length < pageSize) break;
    page += 1;
  }
  return { items: items.slice(0, MAX_BULK_LABEL_ITEMS), truncated: total > MAX_BULK_LABEL_ITEMS };
}
```

- [ ] **Step 2: Add the stock helper (`stockService.ts`)**

Using the existing `getStockItemsPage(filters, page, pageSize)`:

```ts
/** Gather every stock item matching `filters` for bulk labels, capped like inventory. */
export async function fetchAllStockItemsForLabels(
  filters?: StockFilters,
): Promise<{ items: StockItemWithCategory[]; truncated: boolean }> {
  const pageSize = 200;
  const items: StockItemWithCategory[] = [];
  let page = 0;
  let total = Infinity;
  while (items.length < total && items.length < MAX_BULK_LABEL_ITEMS) {
    const { rows, total: t } = await getStockItemsPage(filters, page, pageSize);
    total = t;
    items.push(...rows);
    if (rows.length < pageSize) break;
    page += 1;
  }
  return { items: items.slice(0, MAX_BULK_LABEL_ITEMS), truncated: total > MAX_BULK_LABEL_ITEMS };
}
```

Import `MAX_BULK_LABEL_ITEMS` from `inventoryService` (or re-declare a shared const in a small `src/lib/labelBulkLimits.ts` and import in both — pick the import to avoid duplication). Confirm `getStockItemsPage` returns `{ rows, total }` (read it first; adapt the destructure to its actual shape).

- [ ] **Step 3: Tests** — for EACH helper, mock the paged function and assert it loops until `total`, stops at the cap, sets `truncated`. Example (`inventoryService` bulk test — add to an existing or new `*.test.ts` that already mocks supabase, or mock `getInventoryItemsPage` via `vi.spyOn`):

```ts
it('pages through all matching items until total', async () => {
  const spy = vi.spyOn(inv, 'getInventoryItemsPage')
    .mockResolvedValueOnce({ rows: new Array(200).fill({ id: 'x' }), total: 350 } as never)
    .mockResolvedValueOnce({ rows: new Array(150).fill({ id: 'y' }), total: 350 } as never);
  const { items, truncated } = await inv.fetchAllInventoryItemsForLabels({});
  expect(items).toHaveLength(350);
  expect(truncated).toBe(false);
  expect(spy).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 4: Run tests → PASS; typecheck → 0; commit.**

```bash
git add src/lib/inventoryService.ts src/lib/stockService.ts src/lib/*bulk*  # + touched tests
git commit -m "feat(labels): fetch-all-filtered helpers for bulk labels

$TRAILERS"
```

---

## Task 4: Shared `BulkLabelPrintModal`

**Files:** Create `src/components/labels/BulkLabelPrintModal.tsx` + `.test.tsx`

> **UI task — load `frontend-design` + `ui-ux-pro-max`** (CLAUDE.md gate); DESIGN.md tokens. Reuse `Modal`, `Button`, `LabelPrintOptionsFields`, and mirror `PrintLabelsModal`'s chrome.

- [ ] **Step 1: Write the failing tests** (`BulkLabelPrintModal.test.tsx`)

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BulkLabelPrintModal } from './BulkLabelPrintModal';

const printInventoryLabelsBulk = vi.fn().mockResolvedValue({ success: true, printedItems: 3, chunks: 1 });
vi.mock('../../lib/pdf/labels/bulkLabelPrint', () => ({ printInventoryLabelsBulk, printStockLabelsBulk: vi.fn(), LABELS_PER_CHUNK: 250 }));
const probeQz = vi.fn().mockResolvedValue({ connected: true });
vi.mock('../../lib/pdf/labels/qzPrintService', () => ({ probeQz }));
vi.mock('../../lib/labelPrefsService', async (o) => {
  const actual = await o<typeof import('../../lib/labelPrefsService')>();
  return { ...actual, getLabelPrintingPrefs: vi.fn().mockResolvedValue(actual.DEFAULT_LABEL_PRINTING_PREFS) };
});

const selected = [{ id: 'a', item_number: 'INV-1' }, { id: 'b', item_number: 'INV-2' }, { id: 'c', item_number: 'INV-3' }];
function renderModal(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BulkLabelPrintModal entity="inventory" selected={selected as never} fetchAllFiltered={vi.fn()} onClose={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

describe('BulkLabelPrintModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the selected count and total = count × copies (default tenant copies=1)', async () => {
    renderModal();
    expect(await screen.findByText(/3 selected/i)).toBeInTheDocument();
  });

  it('prints the selected items in bulk', async () => {
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /^print$/i }));
    await waitFor(() => expect(printInventoryLabelsBulk).toHaveBeenCalled());
    expect(printInventoryLabelsBulk.mock.calls[0][0]).toHaveLength(3);
    expect(printInventoryLabelsBulk.mock.calls[0][1]).toMatchObject({ output: 'print' });
  });

  it('nudges to QZ when a large job is printed without QZ', async () => {
    probeQz.mockResolvedValueOnce({ connected: false });
    const many = Array.from({ length: 400 }, (_, i) => ({ id: `x${i}`, item_number: `INV-${i}` }));
    renderModal({ selected: many });
    fireEvent.click(await screen.findByRole('button', { name: /^print$/i }));
    expect(await screen.findByText(/install qz tray|narrow the filter/i)).toBeInTheDocument();
    expect(printInventoryLabelsBulk).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `BulkLabelPrintModal.tsx`** — generalize `PrintLabelsModal`. Full component:

```tsx
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Download, X, Loader2, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { settingsKeys } from '../../lib/queryKeys';
import { DEFAULT_LABEL_PRINTING_PREFS, getLabelPrintingPrefs, labelEntityConfig, type LabelEntity } from '../../lib/labelPrefsService';
import { LabelPrintOptionsFields, type LabelPrintOverrides } from './LabelPrintOptionsFields';
import { LABELS_PER_CHUNK, type BulkPrintProgress } from '../../lib/pdf/labels/bulkLabelPrint';
import { probeQz } from '../../lib/pdf/labels/qzPrintService';

/** Minimal identity a bulk target needs; entity mappers handle the rest. */
export interface BulkTarget { id: string }

export interface BulkLabelPrintModalProps<T extends BulkTarget = BulkTarget> {
  entity: LabelEntity;
  selected: T[];
  fetchAllFiltered: () => Promise<{ items: T[]; truncated: boolean }>;
  /** Entity-specific print call for one chunked run (wires the orchestrator). */
  onRun?: (items: T[], run: { output: 'print' | 'download'; config: ReturnType<typeof labelEntityConfig>; onProgress?: (p: BulkPrintProgress) => void; signal?: AbortSignal }) => Promise<{ success: boolean; error?: string }>;
  extraFields?: React.ReactNode;
  onClose: () => void;
}

const SINGLE_JOB_CAP = LABELS_PER_CHUNK; // 250

export function BulkLabelPrintModal<T extends BulkTarget>({ entity, selected, fetchAllFiltered, onRun, extraFields, onClose }: BulkLabelPrintModalProps<T>) {
  const toast = useToast();
  const { data: prefs } = useQuery({ queryKey: settingsKeys.labelPrinting(), queryFn: getLabelPrintingPrefs });
  const tenant = labelEntityConfig(prefs ?? DEFAULT_LABEL_PRINTING_PREFS, entity);
  const { data: qz } = useQuery({ queryKey: ['qz', 'status'], queryFn: probeQz, staleTime: 15_000, retry: false });

  const [scope, setScope] = useState<'selected' | 'all'>('selected');
  const [allItems, setAllItems] = useState<{ items: T[]; truncated: boolean } | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [edits, setEdits] = useState<Partial<LabelPrintOverrides>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BulkPrintProgress | null>(null);
  const [nudge, setNudge] = useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const design: LabelPrintOverrides = { sizeId: tenant.sizeId, copies: tenant.copies, showQr: tenant.showQr, showBarcode: tenant.showBarcode, ...edits };
  const targets = scope === 'all' ? allItems?.items ?? [] : selected;
  const total = targets.length * design.copies;

  const pickAll = async () => {
    setScope('all');
    if (allItems) return;
    setLoadingAll(true);
    try { setAllItems(await fetchAllFiltered()); } catch { toast.error('Could not load the full list'); setScope('selected'); }
    finally { setLoadingAll(false); }
  };

  const run = async (output: 'print' | 'download') => {
    if (targets.length === 0) { toast.error('Nothing to print'); return; }
    if (output === 'print' && total > SINGLE_JOB_CAP && !qz?.connected) { setNudge(true); return; }
    setNudge(false); setRunning(true); setProgress(null);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const config = { ...tenant, sizeId: design.sizeId, copies: design.copies, showQr: design.showQr, showBarcode: design.showBarcode };
      const runner = onRun ?? defaultRunner(entity);
      const res = await runner(targets, { output, config, onProgress: setProgress, signal: ac.signal });
      if (res.success) { toast.success(`Printed ${targets.length} label set${targets.length !== 1 ? 's' : ''}.`); onClose(); }
      else toast.error(res.error ?? 'Bulk print failed');
    } catch { toast.error('Bulk print failed'); }
    finally { setRunning(false); abortRef.current = null; }
  };

  return (
    <Modal isOpen onClose={running ? () => {} : onClose} title={`Print ${entity} labels`} size="md">
      <div className="space-y-5">
        {/* Scope */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" checked={scope === 'selected'} onChange={() => setScope('selected')} className="text-primary" />
            Selected <span className="font-semibold text-primary">{selected.length}</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" checked={scope === 'all'} onChange={pickAll} className="text-primary" />
            All matching current filters
            {scope === 'all' && (loadingAll ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : allItems && <span className="font-semibold text-primary">{allItems.items.length}</span>)}
          </label>
          {allItems?.truncated && scope === 'all' && <p className="text-xs text-warning">Showing the first {allItems.items.length} — narrow the filter to relabel the rest.</p>}
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">This print</h4>
          <LabelPrintOptionsFields value={design} onChange={(p) => setEdits((e) => ({ ...e, ...p }))} idPrefix="bulk-print" />
          <p className="text-sm text-slate-600"><span className="font-semibold">{targets.length}</span> items × {design.copies} = <span className="font-semibold">{total}</span> labels</p>
          {extraFields}
        </div>

        {nudge && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-muted p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>That's {total} labels. Install <a href="https://qz.io/download" target="_blank" rel="noopener noreferrer" className="font-medium underline">QZ Tray</a> for silent bulk printing, narrow the filter, or lower copies — or use <span className="font-medium">Download</span>.</span>
          </div>
        )}

        {running && progress && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-slate-200"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
            <p className="text-xs text-slate-500">Printing {progress.done}/{progress.total} (batch {progress.chunk}/{progress.chunks})…</p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
          {running ? (
            <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}><X className="h-4 w-4" /> Cancel</Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={onClose}><X className="h-4 w-4" /> Close</Button>
              <Button variant="secondary" size="sm" className="gap-1" onClick={() => run('download')} disabled={targets.length === 0}><Download className="h-4 w-4" /> Download PDF</Button>
              <Button variant="primary" size="sm" className="gap-1" onClick={() => run('print')} disabled={targets.length === 0}><Printer className="h-4 w-4" /> Print</Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function defaultRunner(entity: LabelEntity) {
  return async (items: BulkTarget[], run: { output: 'print' | 'download'; config: ReturnType<typeof labelEntityConfig>; onProgress?: (p: BulkPrintProgress) => void; signal?: AbortSignal }) => {
    const { printInventoryLabelsBulk } = await import('../../lib/pdf/labels/bulkLabelPrint');
    if (entity === 'inventory') return printInventoryLabelsBulk(items as never, run);
    throw new Error('stock/case must pass onRun'); // stock supplies its own runner (price/location mapping)
  };
}
```

(The `useMemo` import is used if you memoize `targets`; drop the import if unused to keep eslint clean.)

- [ ] **Step 4: Run tests → PASS; typecheck + eslint → clean; commit.**

```bash
git add src/components/labels/BulkLabelPrintModal.tsx src/components/labels/BulkLabelPrintModal.test.tsx
git commit -m "feat(labels): shared bulk label print modal (scope, chunked, QZ-aware)

$TRAILERS"
```

---

## Task 5: Wire the inventory list

**Files:** Modify `src/pages/inventory/InventoryListPage.tsx`

Mirror `StockListPage`'s selection pattern (read `StockListPage.tsx:87-242` for the exact shape) and add the modal.

- [ ] **Step 1** — add state: `const [selectionMode, setSelectionMode] = useState(false)`, `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())`, `const [bulkPrintOpen, setBulkPrintOpen] = useState(false)`; derive `selectedItems = items.filter(i => selectedIds.has(i.id))`; add `toggleSelected`, `toggleSelectAll`, `clearSelection`, `exitSelectionMode` (copy from StockListPage).
- [ ] **Step 2** — render row checkboxes (gated by `useListSelectionEnabled()`), a selection bar showing the count with **Select all / Print labels / Cancel**, and a header "Select" toggle to enter `selectionMode` (mirror StockListPage's markup, using DESIGN.md tokens).
- [ ] **Step 3** — mount the modal:

```tsx
{bulkPrintOpen && (
  <BulkLabelPrintModal
    entity="inventory"
    selected={selectedItems as never}
    fetchAllFiltered={() => fetchAllInventoryItemsForLabels(currentFilters)}
    onClose={() => setBulkPrintOpen(false)}
  />
)}
```

where `currentFilters` is the page's active `InventoryFilters` state. `Print labels` opens it (require ≥1 selected, else toast).

- [ ] **Step 4** — typecheck + eslint clean; a light render test asserting the Print-labels action appears once rows are selected (optional if the page has no test file). Commit:

```bash
git add src/pages/inventory/InventoryListPage.tsx
git commit -m "feat(labels): bulk label printing on the inventory list

$TRAILERS"
```

---

## Task 6: Swap the stock list to the shared modal

**Files:** Modify `src/pages/stock/StockListPage.tsx`; delete `src/components/stock/PrintLabelsModal.tsx` + `.test.tsx`

- [ ] **Step 1** — replace the `PrintLabelsModal` import/usage with `BulkLabelPrintModal` (`entity="stock"`), passing `selected={selectedItems}`, `fetchAllFiltered={() => fetchAllStockItemsForLabels(currentFilters)}`, an `extraFields` node containing the existing company / location / show-price inputs, and an `onRun` that maps price text and calls `printStockLabelsBulk` (mirroring the old `handlePrint`'s `entries` mapping):

```tsx
onRun={(items, run) => import('../../lib/pdf/labels/bulkLabelPrint').then(({ printStockLabelsBulk }) =>
  printStockLabelsBulk(
    items.map((item) => ({ item, priceText: showPrice && item.selling_price != null ? formatCurrencyWithConfig(item.selling_price, currency) : null })),
    { ...run, locationName: locationName || undefined, companyName: companyName || undefined },
  ))}
```

- [ ] **Step 2** — delete `PrintLabelsModal.tsx` + its test; remove now-unused imports.
- [ ] **Step 3** — typecheck; `npx vitest run src/pages/stock src/components/labels` → PASS; eslint clean. Commit:

```bash
git add -A
git commit -m "refactor(labels): stock list uses the shared bulk print modal

$TRAILERS"
```

---

## Task 7: Verification gate

- [ ] `npm run typecheck` → 0.
- [ ] `npx vitest run` → no NEW failures vs `main` (confirm via `git diff --name-only origin/main..HEAD` that only label/inventory/stock files changed; the pre-existing `SuppliersListPage` / `chainOfCustodyParity` failures are unrelated).
- [ ] `npx eslint` on all touched files → 0 errors.
- [ ] `npm run build` → succeeds; `bulkLabelPrint` and the modal are reached only via `await import(...)` (no pdfmake in the list pages' initial chunk).
- [ ] Manual: inventory list → select 3 → Print labels → copies 2 → both copies print; scope "All matching filters" on a location filter → progress bar → completes; no-QZ + >250 labels + Print → nudge shown, Download works (part-files); stock list unchanged for small jobs. Do NOT push (parent turn handles the fresh-branch PR after #427 merges).

---

## Self-Review Notes

- **Spec coverage:** orchestrator+chunking → Task 2; fetch-all → Task 3; shared modal + scope + dispatch + QZ nudge + progress → Task 4; inventory wiring → Task 5; stock swap → Task 6; filename part-files → Task 1; gate → Task 7.
- **Type consistency:** `BulkPrintOptions.config: LabelEntityConfig` carries `copies`; `itemsPerChunk(copies)` derives chunk size; `LABELS_PER_CHUNK`/`SINGLE_JOB_CAP` are the same 250; `fetchAll*ForLabels` both return `{ items, truncated }`; `printInventoryLabelsBulk` / `printStockLabelsBulk` share `runBulk`.
- **Scale safety:** only one chunk PDF in memory at a time; fetch-all capped at `MAX_BULK_LABEL_ITEMS`; no-QZ large print is nudged (no dialog storm); downloads are memory-safe part-files.
- **Reuse:** engine, `LabelPrintOptionsFields`, QZ transport, and the stock selection pattern are reused; `PrintLabelsModal` is superseded (deleted) rather than duplicated.
