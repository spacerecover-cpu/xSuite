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
    expect(screen.getByText(/default: OSCAR MetaPrint\(ZPL\)/)).toBeInTheDocument();
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
