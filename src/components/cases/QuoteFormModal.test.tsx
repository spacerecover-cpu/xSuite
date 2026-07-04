import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuoteFormModal } from './QuoteFormModal';

// --- Mocks ------------------------------------------------------------------

vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ currencyFormat: { currencySymbol: '$' } }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ error: toastError, success: toastSuccess }),
}));

vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock('../../lib/currencyService', () => ({
  getSupportedCurrencies: () => Promise.resolve([]),
  getBaseCurrency: () => Promise.resolve('USD'),
  getConversionRate: () => Promise.resolve(1),
}));

vi.mock('../../lib/format', () => ({
  formatCurrency: (v: number) => `$${Number(v).toFixed(2)}`,
  formatBaseEquivalent: () => '',
}));

vi.mock('../../lib/unitCodesService', () => ({
  listUnitCodes: vi.fn().mockResolvedValue([
    { code: 'C62', uqc_code: 'NOS', label: 'Piece', scheme: 'rec20' },
    { code: 'HUR', uqc_code: 'HRS', label: 'Hour', scheme: 'rec20' },
  ]),
}));

// Chainable Supabase stub: list queries resolve to [], maybeSingle() to null.
// The chain is thenable so `await ...select().eq().order().order()` works, and
// chain methods all return the chain so multi-.order() calls don't break.
vi.mock('../../lib/supabaseClient', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit', 'in', 'or']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
      rpc: vi.fn(() => Promise.resolve({ data: 'QT-000001', error: null })),
    },
  };
});

const TITLE_PLACEHOLDER = 'e.g., Data Recovery Service';
const DESCRIPTION_PLACEHOLDER = 'Describe the service or item';

function renderModal(onSave = vi.fn().mockResolvedValue(undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <QuoteFormModal isOpen onClose={() => {}} onSave={onSave} caseId="case-1" />
    </QueryClientProvider>,
  );
  return { onSave };
}

describe('QuoteFormModal — unit select from master_unit_codes', () => {
  beforeEach(() => {
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it('submits unit_code/unit_label from the selected unit and never a free-text "Service" literal', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.type(screen.getByPlaceholderText(TITLE_PLACEHOLDER), 'SSD Recovery Quote');
    await user.type(screen.getByPlaceholderText(DESCRIPTION_PLACEHOLDER), 'Logical recovery');

    // Wait for listUnitCodes() to resolve and populate the Unit select's options.
    await waitFor(() => expect(screen.getByRole('option', { name: 'Hour' })).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Unit'), 'HUR');

    await user.click(screen.getByRole('button', { name: /create quote/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();

    const [payload, items] = onSave.mock.calls[0] as [Record<string, unknown>, Array<Record<string, unknown>>];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ unit_code: 'HUR', unit_label: 'Hour' });

    const serialized = JSON.stringify({ payload, items });
    expect(serialized).not.toContain('Service');
  });
});
