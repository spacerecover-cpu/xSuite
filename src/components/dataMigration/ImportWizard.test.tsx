import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

const mocks = vi.hoisted(() => ({
  parseWorkbook: vi.fn(),
  readWorkbookMeta: vi.fn(() => ({ schemaVersion: 1, sourceTenant: null, exportedAt: null })),
  computeFileHash: vi.fn(async () => 'sha256:aabbccdd'),
  validateWorkbook: vi.fn(),
  validateSchemaVersion: vi.fn(() => ({ ok: true })),
  runImport: vi.fn(),
}));

vi.mock('../../lib/dataMigration/workbookParser', () => ({
  parseWorkbook: mocks.parseWorkbook,
  readWorkbookMeta: mocks.readWorkbookMeta,
  computeFileHash: mocks.computeFileHash,
}));
vi.mock('../../lib/dataMigration/importValidator', () => ({
  validateWorkbook: mocks.validateWorkbook,
  validateSchemaVersion: mocks.validateSchemaVersion,
}));
vi.mock('../../lib/dataMigration/importClient', () => ({
  runImport: mocks.runImport,
}));
vi.mock('../../lib/dataMigration/workbookContract', () => ({
  IMPORT_ORDER: ['companies', 'customers', 'cases'] as const,
  SHEET_NAMES: { companies: 'Companies', customers: 'Customers', cases: 'Cases' },
}));

import { ImportWizard } from './ImportWizard';

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HeaderSlotProvider>{ui}</HeaderSlotProvider>
    </QueryClientProvider>,
  );
}

describe('ImportWizard', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.computeFileHash.mockResolvedValue('sha256:aabbccdd');
  });

  it('renders the Upload step by default', () => {
    wrap(<ImportWizard onClose={onClose} />);
    expect(screen.getByText(/drop your/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse file/i })).toBeInTheDocument();
  });

  it('Validate button is disabled without a file selected', () => {
    wrap(<ImportWizard onClose={onClose} />);
    const validateBtn = screen.queryByRole('button', { name: /validate/i });
    expect(validateBtn).toBeNull();
  });

  it('calls onClose when Cancel is clicked', () => {
    wrap(<ImportWizard onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('advances to Validate step after file is parsed and shows per-entity counts', async () => {
    const parsedWb = { companies: [{ legacy_id: 'c1', name: 'Acme' }], customers: [], cases: [] };
    mocks.parseWorkbook.mockReturnValue(parsedWb);
    mocks.validateWorkbook.mockReturnValue({
      ok: true,
      counts: { companies: 1, customers: 0, cases: 0 },
      issues: [],
    });

    wrap(<ImportWizard onClose={onClose} />);

    const file = new File(['dummy'], 'lab-export.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    await waitFor(() => expect(mocks.computeFileHash).toHaveBeenCalled());
    await waitFor(() => expect(mocks.parseWorkbook).toHaveBeenCalled());
    await waitFor(() => expect(mocks.validateWorkbook).toHaveBeenCalledWith(parsedWb));

    expect(await screen.findByText(/validate \/ preview/i)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows validation errors when validateWorkbook reports issues', async () => {
    const parsedWb = { companies: [], customers: [], cases: [] };
    mocks.parseWorkbook.mockReturnValue(parsedWb);
    mocks.validateWorkbook.mockReturnValue({
      ok: false,
      counts: { companies: 0, customers: 0, cases: 0 },
      issues: [{ entity: 'companies', rowIndex: 2, field: 'name', message: 'Required field missing', severity: 'error' }],
    });

    wrap(<ImportWizard onClose={onClose} />);

    const file = new File(['dummy'], 'bad.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    expect(await screen.findByText(/1 error/i)).toBeInTheDocument();
    const importBtn = screen.queryByRole('button', { name: /^import$/i });
    expect(importBtn).toBeNull();
  });
});
