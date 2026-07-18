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
