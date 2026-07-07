import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { REPORT_TYPES } from '../../lib/reportTypes';

// ---------------------------------------------------------------------------
// The Reports category must surface all 8 report types as separate template
// cards, plus the legacy shared-base card ONLY while its row still exists.
// Storage and heavy children are mocked; the page logic runs for real.
// ---------------------------------------------------------------------------

const { templateByKey } = vi.hoisted(() => ({
  templateByKey: { current: new Set<string>() },
}));

vi.mock('../../lib/documentTemplateService', () => ({
  getDocumentTemplateByType: vi.fn(async (key: string) =>
    templateByKey.current.has(key) ? { id: `tpl-${key}`, document_type: key, config: {} } : null,
  ),
  getDeployedVersionByType: vi.fn(async (key: string) =>
    templateByKey.current.has(key) ? { id: `ver-${key}`, config: {} } : null,
  ),
  upsertDocumentTemplate: vi.fn(),
  createVersion: vi.fn(),
  publishVersion: vi.fn(),
  readConfig: (config: unknown) => config ?? {},
  applyTemplateStyle: (target: unknown) => target,
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { role: 'admin' } }),
}));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => vi.fn(),
}));
vi.mock('../../components/layout/SettingsPageHeader', () => ({
  SettingsPageHeader: () => null,
}));
vi.mock('../../components/settings/documents/TemplateStudio', () => ({
  TemplateStudio: () => <div data-testid="studio" />,
}));
vi.mock('../../components/settings/documents/TemplateGalleryModal', () => ({
  TemplateGalleryModal: () => null,
}));
vi.mock('../../components/settings/documents/CopyStyleModal', () => ({
  CopyStyleModal: () => null,
}));

import { DocumentTemplatesPage } from './DocumentTemplatesPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DocumentTemplatesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openReportsCategory() {
  // Wait for the overview query to resolve (cards replace the skeletons).
  await screen.findByText('Tax invoice issued to customers for recovery work.');
  fireEvent.click(screen.getByRole('button', { name: /Reports/ }));
}

beforeEach(() => {
  templateByKey.current = new Set();
});

describe('DocumentTemplatesPage — Reports category', () => {
  it('shows all 8 report types as separate template cards', async () => {
    renderPage();
    await openReportsCategory();

    for (const rt of Object.values(REPORT_TYPES)) {
      expect(screen.getByRole('heading', { name: rt.name })).toBeInTheDocument();
    }
    // No legacy shared row → no legacy card, and the rail counts exactly 8.
    expect(screen.queryByText('All reports — shared base')).not.toBeInTheDocument();
    const rail = screen.getByRole('button', { name: /Reports/ });
    expect(within(rail).getByText('8')).toBeInTheDocument();
  });

  it('keeps the legacy shared-base card while its row exists', async () => {
    templateByKey.current = new Set(['report']);
    renderPage();
    await openReportsCategory();

    expect(screen.getByText('All reports — shared base')).toBeInTheDocument();
    const rail = screen.getByRole('button', { name: /Reports/ });
    expect(within(rail).getByText('9')).toBeInTheDocument();
  });

  it('opens the Studio when a report-type card is edited', async () => {
    renderPage();
    await openReportsCategory();

    const card = screen.getByRole('heading', { name: 'Malware Report' }).closest('div.flex.flex-col')!;
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /Edit/ }));
    expect(await screen.findByTestId('studio')).toBeInTheDocument();
  });
});
