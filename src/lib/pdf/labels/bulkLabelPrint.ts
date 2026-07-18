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
