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
vi.mock('../../lib/dataMigration/coerceWorkbook', () => ({
  coerceWorkbook: (wb: unknown) => wb,
}));
vi.mock('../../lib/dataMigration/referenceLists', () => ({
  fetchReferenceLists: vi.fn(async () => ({})),
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
  DOMAIN_ENTITIES: { records: ['companies', 'customers', 'cases'], inventory: [] },
  DOMAIN_LABELS: { records: 'Case Records', inventory: 'Inventory' },
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
    wrap(<ImportWizard domain="records" onClose={onClose} />);
    expect(screen.getByText(/drop your/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse file/i })).toBeInTheDocument();
  });

  it('offers a blank-template download in the Upload step', () => {
    wrap(<ImportWizard domain="records" onClose={onClose} />);
    expect(screen.getByRole('button', { name: /download.*template/i })).toBeInTheDocument();
  });

  it('Validate button is disabled without a file selected', () => {
    wrap(<ImportWizard domain="records" onClose={onClose} />);
    const validateBtn = screen.queryByRole('button', { name: /validate/i });
    expect(validateBtn).toBeNull();
  });

  it('calls onClose when Cancel is clicked', () => {
    wrap(<ImportWizard domain="records" onClose={onClose} />);
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

    wrap(<ImportWizard domain="records" onClose={onClose} />);

    const file = new File(['dummy'], 'lab-export.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    await waitFor(() => expect(mocks.computeFileHash).toHaveBeenCalled());
    await waitFor(() => expect(mocks.parseWorkbook).toHaveBeenCalled());
    await waitFor(() => expect(mocks.validateWorkbook).toHaveBeenCalledWith(parsedWb, 'records'));

    expect(await screen.findByText(/validate \/ preview/i)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('summary lists only the imported domain sheets, not cross-domain entities', async () => {
    const parsedWb = { companies: [{ legacy_id: 'c1', name: 'Acme' }], customers: [], cases: [] };
    mocks.parseWorkbook.mockReturnValue(parsedWb);
    mocks.validateWorkbook.mockReturnValue({
      ok: true,
      counts: { companies: 1, customers: 0, cases: 0 },
      issues: [],
    });
    // runImport returns the FULL cross-domain counts object (emptyCounts iterates IMPORT_ORDER),
    // including entities that are not part of the records domain.
    mocks.runImport.mockResolvedValue({
      runId: 'run-123',
      counts: {
        companies: { inserted: 1, skipped: 0, error: 0 },
        customers: { inserted: 0, skipped: 0, error: 0 },
        cases: { inserted: 0, skipped: 0, error: 0 },
        employees: { inserted: 0, skipped: 0, error: 0 },
        stock_items: { inserted: 0, skipped: 0, error: 0 },
      },
    });

    wrap(<ImportWizard domain="records" onClose={onClose} />);

    const file = new File(['dummy'], 'lab-export.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    fireEvent.click(await screen.findByRole('button', { name: /^import$/i }));

    expect(await screen.findByText(/import complete/i)).toBeInTheDocument();
    // Domain sheets are shown…
    expect(screen.getByText('Companies')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Cases')).toBeInTheDocument();
    // …cross-domain entities are NOT.
    expect(screen.queryByText('employees')).toBeNull();
    expect(screen.queryByText('stock_items')).toBeNull();
  });

  it('shows validation errors when validateWorkbook reports issues', async () => {
    const parsedWb = { companies: [], customers: [], cases: [] };
    mocks.parseWorkbook.mockReturnValue(parsedWb);
    mocks.validateWorkbook.mockReturnValue({
      ok: false,
      counts: { companies: 0, customers: 0, cases: 0 },
      issues: [{ entity: 'companies', rowIndex: 2, field: 'name', message: 'Required field missing', severity: 'error' }],
    });

    wrap(<ImportWizard domain="records" onClose={onClose} />);

    const file = new File(['dummy'], 'bad.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    expect(await screen.findByText(/1 error/i)).toBeInTheDocument();
    const importBtn = screen.queryByRole('button', { name: /^import$/i });
    expect(importBtn).toBeNull();
  });
});
