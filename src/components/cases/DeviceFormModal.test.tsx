import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DeviceFormModal } from './DeviceFormModal';

// --- Mocks ------------------------------------------------------------------

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', tenant_id: 't1' } }),
}));

// Chainable Supabase stub: list queries resolve to [], maybeSingle() to null.
// The chain is thenable so awaited `.select().eq()...` works, and every method
// returns the chain so multi-filter calls don't break.
vi.mock('../../lib/supabaseClient', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gt', 'is', 'order', 'limit', 'in']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  };
});

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DeviceFormModal isOpen onClose={vi.fn()} caseId="case-1" onSuccess={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DeviceFormModal — tabbed shell', () => {
  it('renders the four tabs, a Save action, and switches to the Diagnostic tab', async () => {
    renderModal();

    // The four tabs render in the fixed header.
    expect(await screen.findByRole('tab', { name: /Device Details/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Diagnostic/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Components/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /History/i })).toBeInTheDocument();

    // Footer Save action is present (add mode → "Add Device"), gated until a
    // device type is selected (device_type_id required for non-donor).
    const save = screen.getByRole('button', { name: /Add Device/i });
    expect(save).toBeInTheDocument();
    expect(save).toBeDisabled();

    // Details tab is active first: a Basic field is rendered in the body.
    expect(screen.getByText('Device Type')).toBeInTheDocument();

    // Switching to the Diagnostic tab surfaces a diagnostic-only field.
    fireEvent.click(screen.getByRole('tab', { name: /Diagnostic/i }));
    await waitFor(() => {
      expect(screen.getByText('Initial Diagnosis')).toBeInTheDocument();
    });
  });

  it('matches the design: titled sections, a header close button, and no role/password/primary/delete controls', async () => {
    renderModal();

    // Details tab renders the two titled sections from the design.
    expect(await screen.findByText('Basic Information')).toBeInTheDocument();
    expect(screen.getByText('Technical Information')).toBeInTheDocument();

    // Header close affordance is present (replaces the old role context row).
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();

    // Structural controls are intentionally absent from the UI. Their values are
    // still hydrated and written back on save — they just have no input here.
    expect(screen.queryByText('Device Role')).not.toBeInTheDocument();
    expect(screen.queryByText('Mark as Primary Device')).not.toBeInTheDocument();
    expect(screen.queryByText('Device Password')).not.toBeInTheDocument();
    expect(screen.queryByText('Role-Specific Notes')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete$/i })).not.toBeInTheDocument();
  });
});
