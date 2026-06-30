import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

vi.mock('../../components/dataMigration/ImportWizard', () => ({
  ImportWizard: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="import-wizard">
      <button onClick={onClose}>close-import</button>
    </div>
  ),
}));
vi.mock('../../components/dataMigration/ExportWizard', () => ({
  ExportWizard: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="export-wizard">
      <button onClick={onClose}>close-export</button>
    </div>
  ),
}));
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ order: vi.fn(() => ({ data: [], error: null })) })) })) },
}));

import { ImportExportCenter } from './ImportExportCenter';

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <HeaderSlotProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </HeaderSlotProvider>
    </QueryClientProvider>,
  );
}

describe('ImportExportCenter', () => {
  it('renders Import and Export action cards', () => {
    wrap(<ImportExportCenter />);
    expect(screen.getByText('Import Data')).toBeInTheDocument();
    expect(screen.getByText('Export Data')).toBeInTheDocument();
  });

  it('opens ImportWizard when Import button clicked', () => {
    wrap(<ImportExportCenter />);
    expect(screen.queryByTestId('import-wizard')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start import/i }));
    expect(screen.getByTestId('import-wizard')).toBeInTheDocument();
  });

  it('opens ExportWizard when Export button clicked', () => {
    wrap(<ImportExportCenter />);
    expect(screen.queryByTestId('export-wizard')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start export/i }));
    expect(screen.getByTestId('export-wizard')).toBeInTheDocument();
  });

  it('closes ImportWizard on wizard onClose', () => {
    wrap(<ImportExportCenter />);
    fireEvent.click(screen.getByRole('button', { name: /start import/i }));
    fireEvent.click(screen.getByRole('button', { name: 'close-import' }));
    expect(screen.queryByTestId('import-wizard')).not.toBeInTheDocument();
  });
});
