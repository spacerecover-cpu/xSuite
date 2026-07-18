import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabelStudio } from './LabelStudio';

vi.mock('../../../lib/pdf/fonts', () => ({ preloadAllFonts: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../lib/pdf/labels/labelPreview', () => ({ previewLabelBlob: vi.fn().mockResolvedValue('blob:preview') }));
vi.mock('../../../lib/pdf/labels/labelIcon', () => ({ fileToLabelIconDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,ICON') }));

const setPrefs = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../lib/labelPrefsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/labelPrefsService')>();
  return { ...actual, getLabelPrintingPrefs: vi.fn().mockResolvedValue(actual.DEFAULT_LABEL_PRINTING_PREFS), setLabelPrintingPrefs: (p: unknown) => setPrefs(p) };
});

function renderStudio() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LabelStudio entity="inventory" label="Inventory label" onBack={() => {}} />
    </QueryClientProvider>,
  );
}

describe('LabelStudio alignment + icon', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the date-field checkboxes for inventory', async () => {
    renderStudio();
    expect(await screen.findByText('Date added')).toBeInTheDocument();
    expect(screen.getByText('Printed date/time')).toBeInTheDocument();
  });

  it('saves the chosen identifier alignment', async () => {
    renderStudio();
    fireEvent.click(await screen.findByRole('button', { name: /align center/i }));
    fireEvent.click(screen.getByRole('button', { name: /save & deploy/i }));
    await waitFor(() => expect(setPrefs).toHaveBeenCalled());
    expect(setPrefs.mock.calls[0][0].idAlign.inventory).toBe('center');
  });

  it('uploads an icon, shows the preview, and can remove it', async () => {
    renderStudio();
    const input = (await screen.findByText(/upload icon/i)).closest('label')!.querySelector('input')!;
    fireEvent.change(input, { target: { files: [new File(['x'], 'i.png', { type: 'image/png' })] } });
    const img = await screen.findByAltText('Label icon');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,ICON');
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(screen.queryByAltText('Label icon')).not.toBeInTheDocument());
  });

  it('disables the show-icon toggle until an icon is uploaded', async () => {
    renderStudio();
    expect(await screen.findByRole('switch', { name: /show icon on this label/i })).toBeDisabled();
  });
});
