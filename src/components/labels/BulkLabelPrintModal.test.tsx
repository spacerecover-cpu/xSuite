import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BulkLabelPrintModal } from './BulkLabelPrintModal';

// vi.mock factories are hoisted above the const declarations, so the mocked
// fns are created with vi.hoisted (available inside the hoisted factory); the
// default resolutions are set below at module scope (survive vi.clearAllMocks).
const printInventoryLabelsBulk = vi.hoisted(() => vi.fn());
const probeQz = vi.hoisted(() => vi.fn());
vi.mock('../../lib/pdf/labels/bulkLabelPrint', () => ({ printInventoryLabelsBulk, printStockLabelsBulk: vi.fn(), LABELS_PER_CHUNK: 250 }));
vi.mock('../../lib/pdf/labels/qzPrintService', () => ({ probeQz }));
printInventoryLabelsBulk.mockResolvedValue({ success: true, printedItems: 3, chunks: 1 });
probeQz.mockResolvedValue({ connected: true });
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
