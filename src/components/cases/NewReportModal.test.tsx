import { it, expect, vi, beforeEach, describe } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const tplSvc = vi.hoisted(() => ({
  listReportTemplateChoices: vi.fn(),
  listSectionLibrary: vi.fn(),
  createReportSectionTemplate: vi.fn(),
  slugifySectionKey: (raw: string) =>
    raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'custom_section',
}));
vi.mock('../../lib/reportSectionTemplateService', () => tplSvc);
const docSvc = vi.hoisted(() => ({ createReportInstance: vi.fn() }));
vi.mock('../../lib/documentInstanceService', () => docSvc);
vi.mock('../../lib/pdf/engine/adapters/reportAdapter', () => ({
  reportSubtypeSections: () => [{ key: 'executive_summary', title: 'Executive Summary' }],
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => toast }));
vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { NewReportModal } from './NewReportModal';

const CHOICES = {
  tenant: [],
  system: [
    {
      source: 'system' as const,
      id: 'p1',
      reportType: 'evaluation',
      name: 'Standard Evaluation',
      description: 'Full assessment',
      isDefault: true,
      sections: [
        { key: 'executive_summary', title: 'Executive Summary' },
        { key: 'findings', title: 'Diagnostic Findings' },
      ],
    },
    {
      source: 'system' as const,
      id: 'p2',
      reportType: 'evaluation',
      name: 'Compact Evaluation',
      description: 'Short form',
      isDefault: false,
      sections: [{ key: 'executive_summary', title: 'Executive Summary' }],
    },
  ],
};

function renderModal(onCreated = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NewReportModal
        isOpen
        onClose={vi.fn()}
        caseId="c1"
        reportSubtype="evaluation"
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  );
  return onCreated;
}

beforeEach(() => {
  vi.clearAllMocks();
  tplSvc.listReportTemplateChoices.mockResolvedValue(CHOICES);
  tplSvc.listSectionLibrary.mockResolvedValue([
    { section_key: 'risks_disclaimers', title: 'Risks & Required Consents', guidance: 'g' },
  ]);
  tplSvc.createReportSectionTemplate.mockResolvedValue({ id: 'tpl-1' });
  docSvc.createReportInstance.mockResolvedValue({ id: 'di-9' });
});

describe('NewReportModal', () => {
  it('lists the templates with the default preselected and its sections loaded', async () => {
    renderModal();
    const standard = await screen.findByRole('radio', { name: /standard evaluation/i });
    expect(standard).toBeChecked();
    expect(screen.getByRole('radio', { name: /compact evaluation/i })).not.toBeChecked();
    expect(screen.getByLabelText('Include section Diagnostic Findings')).toBeInTheDocument();
    expect(screen.getByText('2 of 2 sections included')).toBeInTheDocument();
  });

  it('creates the draft with only the included sections and reports the new id', async () => {
    const onCreated = renderModal();
    await screen.findByRole('radio', { name: /standard evaluation/i });

    fireEvent.click(screen.getByLabelText('Include section Diagnostic Findings'));
    fireEvent.click(screen.getByRole('button', { name: /create document/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('di-9'));
    expect(docSvc.createReportInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'c1',
        reportSubtype: 'evaluation',
        sections: [expect.objectContaining({ key: 'executive_summary' })],
      }),
    );
    const { sections } = docSvc.createReportInstance.mock.calls[0][0] as {
      sections: Array<{ key: string }>;
    };
    expect(sections).toHaveLength(1);
    expect(tplSvc.createReportSectionTemplate).not.toHaveBeenCalled();
  });

  it('switching template reseeds the section list', async () => {
    renderModal();
    await screen.findByRole('radio', { name: /standard evaluation/i });
    fireEvent.click(screen.getByRole('radio', { name: /compact evaluation/i }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Include section Diagnostic Findings')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('1 of 1 sections included')).toBeInTheDocument();
  });

  it('saves the customization as a team template before creating when asked', async () => {
    renderModal();
    await screen.findByRole('radio', { name: /standard evaluation/i });

    fireEvent.click(screen.getByLabelText(/save these sections as a team template/i));
    fireEvent.change(screen.getByLabelText(/template name/i), {
      target: { value: 'Our Evaluation' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create document/i }));

    await waitFor(() =>
      expect(tplSvc.createReportSectionTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          reportType: 'evaluation',
          name: 'Our Evaluation',
          isDefault: false,
          sourcePresetId: 'p1',
          sections: expect.arrayContaining([expect.objectContaining({ key: 'findings' })]),
        }),
      ),
    );
    await waitFor(() => expect(docSvc.createReportInstance).toHaveBeenCalled());
  });
});
