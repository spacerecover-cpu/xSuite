import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplatesDashboard } from './TemplatesDashboard';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

// --- Mocks ------------------------------------------------------------------

const { navigateSpy, seedTemplatesSpy, checkIfSeededTemplatesSpy, insertSpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  seedTemplatesSpy: vi.fn(),
  checkIfSeededTemplatesSpy: vi.fn(),
  insertSpy: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'user-1', tenant_id: 'tenant-1' } }),
}));

vi.mock('../../lib/seedService', () => ({
  seedTemplates: seedTemplatesSpy,
  checkIfSeededTemplates: checkIfSeededTemplatesSpy,
}));

// Stub the heavy editor modal so we only assert the dashboard's wiring.
vi.mock('../../components/templates/LineItemTemplateFormModal', () => ({
  LineItemTemplateFormModal: ({ isOpen, templateTypeId }: { isOpen: boolean; templateTypeId: string }) =>
    isOpen ? <div data-testid="form-modal">form-modal:{templateTypeId}</div> : null,
}));

vi.mock('../../components/settings/SeedingResultsDisplay', () => ({
  SeedingResultsDisplay: () => <div data-testid="seeding-results" />,
}));

// Per-table chainable Supabase stub. Each `from(table)` resolves to that
// table's rows whether the query terminates on `.order()` or `.eq()`.
const tableData: Record<string, unknown[]> = {
  master_template_categories: [{ id: 'cat-1', name: 'Quotes', is_active: true, sort_order: 1 }],
  master_template_types: [
    { id: 'type-1', name: 'Quote Terms', code: 'quote_terms', description: 'Terms for quotes', is_active: true, sort_order: 1 },
    { id: 'type-2', name: 'Email Template', code: 'email', description: 'Email comms', is_active: true, sort_order: 2 },
  ],
  document_templates: [],
};

vi.mock('../../lib/supabaseClient', () => {
  const makeChain = (table: string) => {
    const result = { data: tableData[table] ?? [], error: null };
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.insert = insertSpy;
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.then = (onFulfilled: (v: typeof result) => unknown) => Promise.resolve(result).then(onFulfilled);
    return chain;
  };
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

function renderDashboard() {
  return render(
    <HeaderSlotProvider>
      <TemplatesDashboard />
    </HeaderSlotProvider>,
  );
}

describe('TemplatesDashboard', () => {
  beforeEach(() => {
    navigateSpy.mockReset();
    seedTemplatesSpy.mockReset();
    insertSpy.mockClear();
    checkIfSeededTemplatesSpy.mockReset();
    checkIfSeededTemplatesSpy.mockResolvedValue(false);
  });

  it('shows the "Seed Sample Templates" button when templates are not yet seeded', async () => {
    checkIfSeededTemplatesSpy.mockResolvedValue(false);
    renderDashboard();

    await screen.findByRole('button', { name: /new template/i });
    expect(screen.getByRole('button', { name: /seed sample templates/i })).toBeInTheDocument();
  });

  it('hides the "Seed Sample Templates" button once seeding is completed', async () => {
    checkIfSeededTemplatesSpy.mockResolvedValue(true);
    renderDashboard();

    await screen.findByRole('button', { name: /new template/i });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /seed sample templates/i })).toBeNull();
    });
  });

  it('opens the template-type picker instead of navigating to a dead /templates/new route', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const newTemplateBtn = await screen.findByRole('button', { name: /new template/i });
    await user.click(newTemplateBtn);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Template Type')).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalledWith('/templates/new');
  });

  it('opens the template editor for the chosen type after Continue', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const newTemplateBtn = await screen.findByRole('button', { name: /new template/i });
    await user.click(newTemplateBtn);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /continue/i }));

    const formModal = await screen.findByTestId('form-modal');
    expect(formModal).toHaveTextContent('form-modal:type-1');
  });
});
