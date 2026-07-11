import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// The batch modal's "This print" section edits a ONE-OFF design that must
// reach printStockLabelBatch as a full `config` (tenant design + edits) —
// the tenant's saved stock-label design stays untouched.
// ---------------------------------------------------------------------------

vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => (isOpen ? <div>{children}</div> : null),
}));
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useCurrencyConfig: () => ({ code: 'USD', symbol: '$', decimalPlaces: 2 }),
}));

const getLabelPrintingPrefs = vi.fn();
vi.mock('../../lib/labelPrefsService', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/labelPrefsService')>();
  return { ...real, getLabelPrintingPrefs: (...a: unknown[]) => getLabelPrintingPrefs(...a) };
});

// Intercepts the dynamic import inside handlePrint.
const printStockLabelBatch = vi.fn();
vi.mock('../../lib/pdf/labels/labelPrintService', () => ({
  printStockLabelBatch: (...a: unknown[]) => printStockLabelBatch(...a),
}));

import { DEFAULT_LABEL_PRINTING_PREFS } from '../../lib/labelPrefsService';
import { PrintLabelsModal } from './PrintLabelsModal';
import type { StockItemWithCategory } from '../../lib/stockService';

const item = {
  id: 's1',
  name: 'SATA cable',
  sku: 'SKU-1',
  selling_price: null,
} as unknown as StockItemWithCategory;

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PrintLabelsModal items={[item]} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getLabelPrintingPrefs.mockResolvedValue(DEFAULT_LABEL_PRINTING_PREFS);
  printStockLabelBatch.mockResolvedValue({ success: true });
  printStockLabelBatch.mockClear();
});

describe('PrintLabelsModal', () => {
  it('passes the edited one-off design through to printStockLabelBatch as a full config', async () => {
    renderModal();

    const sizeSelect = await screen.findByLabelText(/label stock/i);
    expect(sizeSelect).toHaveValue('nb_15x26'); // seeded from the tenant stock design

    fireEvent.change(sizeSelect, { target: { value: 'zebra_2x1' } });
    fireEvent.change(screen.getByLabelText(/copies/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /^print$/i }));

    await waitFor(() => expect(printStockLabelBatch).toHaveBeenCalledTimes(1));
    const [entries, opts] = printStockLabelBatch.mock.calls[0] as [
      unknown[],
      { output: string; config: Record<string, unknown> },
    ];
    expect(entries).toHaveLength(1);
    expect(opts.output).toBe('print');
    expect(opts.config).toEqual(
      expect.objectContaining({
        sizeId: 'zebra_2x1',
        copies: 2,
        showQr: true,
        fields: expect.any(Object), // tenant field toggles ride along untouched
      }),
    );
  });

  it('prints with the tenant design unchanged when nothing is edited', async () => {
    renderModal();
    await screen.findByLabelText(/label stock/i);

    fireEvent.click(screen.getByRole('button', { name: /^print$/i }));

    await waitFor(() => expect(printStockLabelBatch).toHaveBeenCalledTimes(1));
    const [, opts] = printStockLabelBatch.mock.calls[0] as [unknown[], { config: Record<string, unknown> }];
    expect(opts.config).toEqual(
      expect.objectContaining({ sizeId: 'nb_15x26', copies: 1, showQr: true }),
    );
  });
});
