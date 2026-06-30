import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

const mocks = vi.hoisted(() => ({
  runExport: vi.fn(),
}));

vi.mock('../../lib/dataMigration/exportClient', () => ({
  runExport: mocks.runExport,
}));
vi.mock('../../lib/dataMigration/workbookContract', () => ({
  IMPORT_ORDER: ['companies', 'customers', 'cases'] as const,
  SHEET_NAMES: { companies: 'Companies', customers: 'Customers', cases: 'Cases' },
}));

import { ExportWizard } from './ExportWizard';

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HeaderSlotProvider>{ui}</HeaderSlotProvider>
    </QueryClientProvider>,
  );
}

describe('ExportWizard', () => {
  const onClose = vi.fn();

  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Scope step with entity checkboxes', () => {
    wrap(<ExportWizard onClose={onClose} />);
    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /companies/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /customers/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /cases/i })).toBeInTheDocument();
  });

  it('all entities are checked by default', () => {
    wrap(<ExportWizard onClose={onClose} />);
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  it('calls onClose when Cancel is clicked', () => {
    wrap(<ExportWizard onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Generate button calls runExport and shows Download step on success', async () => {
    const fakeBuffer = new ArrayBuffer(8);
    mocks.runExport.mockResolvedValue(fakeBuffer);

    wrap(<ExportWizard onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /generate export/i }));

    await waitFor(() => expect(mocks.runExport).toHaveBeenCalledOnce());

    expect(await screen.findByRole('button', { name: /download/i })).toBeInTheDocument();
  });

  it('unchecking an entity removes it from the export scope', async () => {
    const fakeBuffer = new ArrayBuffer(8);
    mocks.runExport.mockResolvedValue(fakeBuffer);

    wrap(<ExportWizard onClose={onClose} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /companies/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate export/i }));

    await waitFor(() => expect(mocks.runExport).toHaveBeenCalledOnce());

    const callArg = mocks.runExport.mock.calls[0][0] as { entities: string[] };
    expect(callArg.entities).not.toContain('companies');
    expect(callArg.entities).toContain('customers');
  });
});
