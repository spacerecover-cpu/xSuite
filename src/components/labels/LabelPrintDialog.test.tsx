import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Print-time overrides: the dialog seeds from the tenant's saved label design
// and hands back a ONE-OFF config for this print only — nothing is persisted.
// ---------------------------------------------------------------------------

// Passthrough Modal so content + footer render inline.
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, children, footer }: { isOpen: boolean; children: ReactNode; footer?: ReactNode }) =>
    isOpen ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));
// labelPrefsService pulls companySettingsService → supabaseClient at module
// scope; stub the client so imports don't throw on missing env vars.
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));

const getLabelPrintingPrefs = vi.fn();
vi.mock('../../lib/labelPrefsService', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/labelPrefsService')>();
  return { ...real, getLabelPrintingPrefs: (...a: unknown[]) => getLabelPrintingPrefs(...a) };
});

import { DEFAULT_LABEL_PRINTING_PREFS } from '../../lib/labelPrefsService';
import { LabelPrintDialog } from './LabelPrintDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof LabelPrintDialog>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onPrint = vi.fn();
  const onClose = vi.fn();
  const tree = (p: Partial<React.ComponentProps<typeof LabelPrintDialog>>) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LabelPrintDialog entity="case" isOpen onClose={onClose} onPrint={onPrint} {...props} {...p} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const { rerender } = render(tree({}));
  return { onPrint, onClose, rerender: (p: Partial<React.ComponentProps<typeof LabelPrintDialog>>) => rerender(tree(p)) };
}

beforeEach(() => {
  getLabelPrintingPrefs.mockResolvedValue(DEFAULT_LABEL_PRINTING_PREFS);
});

describe('LabelPrintDialog', () => {
  it('seeds from the tenant design and prints an edited one-off config', async () => {
    const { onPrint } = renderDialog();

    const sizeSelect = await screen.findByLabelText(/label stock/i);
    expect(sizeSelect).toHaveValue('nb_15x26'); // tenant default seeds the dialog

    fireEvent.change(sizeSelect, { target: { value: 'zebra_2x1' } });
    fireEvent.change(screen.getByLabelText(/copies/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^print$/i }));

    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onPrint).toHaveBeenCalledWith(
      expect.objectContaining({ sizeId: 'zebra_2x1', copies: 3, showQr: true }),
    );
  });

  it('clamps copies to the 1–20 print range', async () => {
    const { onPrint } = renderDialog();
    const copies = await screen.findByLabelText(/copies/i);

    fireEvent.change(copies, { target: { value: '99' } });
    expect(copies).toHaveValue(20);
    fireEvent.change(copies, { target: { value: '0' } });
    expect(copies).toHaveValue(1);

    fireEvent.click(screen.getByRole('button', { name: /^print$/i }));
    expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ copies: 1 }));
  });

  it('disables the barcode toggle on narrow stock and re-enables it on wide stock', async () => {
    renderDialog({ entity: 'stock' });

    const barcode = await screen.findByLabelText(/barcode/i);
    expect(barcode).toBeDisabled(); // default nb_15x26 is too narrow for Code128

    fireEvent.change(screen.getByLabelText(/label stock/i), { target: { value: 'zebra_2x1' } });
    expect(screen.getByLabelText(/barcode/i)).toBeEnabled();
  });

  it('re-seeds from the saved design on reopen — an abandoned edit never leaks into the next print', async () => {
    const { rerender } = renderDialog();

    const sizeSelect = await screen.findByLabelText(/label stock/i);
    fireEvent.change(sizeSelect, { target: { value: 'zebra_2x1' } });
    expect(sizeSelect).toHaveValue('zebra_2x1');

    rerender({ isOpen: false });
    rerender({ isOpen: true });

    expect(await screen.findByLabelText(/label stock/i)).toHaveValue('nb_15x26');
  });

  it('cancel closes without printing, and the one-off hint links to the Label Studio', async () => {
    const { onPrint, onClose } = renderDialog();
    await screen.findByLabelText(/label stock/i);

    expect(screen.getByRole('link', { name: /label studio/i })).toHaveAttribute(
      'href',
      '/settings/labels',
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPrint).not.toHaveBeenCalled();
  });
});
