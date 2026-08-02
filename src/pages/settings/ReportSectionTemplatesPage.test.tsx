import { it, expect, vi, beforeEach, describe } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const svc = vi.hoisted(() => ({
  listTenantReportSectionTemplates: vi.fn(),
  listReportSectionPresets: vi.fn(),
  listSectionLibrary: vi.fn(),
  setDefaultReportSectionTemplate: vi.fn(),
  clearDefaultReportSectionTemplate: vi.fn(),
  softDeleteReportSectionTemplate: vi.fn(),
  normalizeSections: (input: unknown) => (Array.isArray(input) ? input : []),
  createReportSectionTemplate: vi.fn(),
  updateReportSectionTemplate: vi.fn(),
}));
vi.mock('../../lib/reportSectionTemplateService', () => svc);
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: 'admin', full_name: 'Admin' } }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => toast }));
vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => (opts: { onConfirm: () => unknown }) => Promise.resolve(opts.onConfirm()),
}));
vi.mock('../../components/layout/SettingsPageHeader', () => ({
  SettingsPageHeader: () => <div data-testid="header" />,
}));

import { ReportSectionTemplatesPage } from './ReportSectionTemplatesPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ReportSectionTemplatesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.listReportSectionPresets.mockResolvedValue([
    {
      id: 'p1',
      report_type: 'evaluation',
      name: 'Standard Evaluation',
      description: 'Full assessment',
      sections: [{ key: 'executive_summary', title: 'Executive Summary' }],
      is_default: true,
      is_active: true,
      sort_order: 0,
    },
  ]);
  svc.listTenantReportSectionTemplates.mockResolvedValue([
    {
      id: 't1',
      report_type: 'evaluation',
      name: 'Our Evaluation',
      description: null,
      sections: [
        { key: 'executive_summary', title: 'Executive Summary' },
        { key: 'findings', title: 'Diagnostic Findings' },
      ],
      is_default: false,
      is_active: true,
    },
  ]);
  svc.listSectionLibrary.mockResolvedValue([]);
  svc.setDefaultReportSectionTemplate.mockResolvedValue(undefined);
});

describe('ReportSectionTemplatesPage', () => {
  it('lists system presets and tenant templates per report type', async () => {
    renderPage();
    expect(await screen.findByText('Standard Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Our Evaluation')).toBeInTheDocument();
    // preset shows System badge; tenant row shows Custom badge
    expect(screen.getAllByText('System').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Custom').length).toBeGreaterThan(0);
    // all 8 report type cards render
    expect(screen.getByText('Data Destruction Report')).toBeInTheDocument();
    expect(screen.getByText('Recovered Files Report')).toBeInTheDocument();
  });

  it('sets a tenant template as the per-type default', async () => {
    renderPage();
    await screen.findByText('Our Evaluation');
    fireEvent.click(screen.getByRole('button', { name: 'Set Our Evaluation as default' }));
    await waitFor(() =>
      expect(svc.setDefaultReportSectionTemplate).toHaveBeenCalledWith('t1', 'evaluation'),
    );
  });

  it('clears the tenant default so the system default applies again', async () => {
    svc.listTenantReportSectionTemplates.mockResolvedValue([
      {
        id: 't1',
        report_type: 'evaluation',
        name: 'Our Evaluation',
        description: null,
        sections: [{ key: 'executive_summary', title: 'Executive Summary' }],
        is_default: true,
        is_active: true,
      },
    ]);
    svc.clearDefaultReportSectionTemplate.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Our Evaluation');
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop using Our Evaluation as default' }),
    );
    await waitFor(() =>
      expect(svc.clearDefaultReportSectionTemplate).toHaveBeenCalledWith('evaluation'),
    );
  });
});
