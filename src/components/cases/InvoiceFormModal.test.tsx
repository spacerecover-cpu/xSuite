import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoiceFormModal } from './InvoiceFormModal';
import { resolveInvoiceTermsHtml } from '../../lib/invoiceTermsService';

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
  toDateInputValue: (v: string) => v,
}));

vi.mock('../../lib/invoiceTermsService', () => ({
  resolveInvoiceTermsHtml: vi.fn().mockResolvedValue('<p>DEFAULT TERMS</p>'),
  resolveTermsHtmlFromContent: vi.fn().mockResolvedValue('<p>PICKED TERMS</p>'),
}));

// Chainable Supabase stub: list queries resolve to [], maybeSingle() to null.
// The chain is thenable so `await ...select().eq().order().order()` works, and
// chain methods all return the chain so multi-.order() calls don't break.
vi.mock('../../lib/supabaseClient', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit', 'in']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
      rpc: vi.fn(() => Promise.resolve({ data: 'INVO-0017', error: null })),
    },
  };
});

const initialData = {
  id: 'inv-1',
  invoice_number: 'INVO-0017',
  invoice_type: 'tax_invoice',
  title: 'Data Recovery',
  invoice_date: '2026-06-07',
  due_date: '2026-06-07',
  status: 'draft',
  client_reference: 'PO-12345',
  terms_and_conditions: 'No Data No Fees',
  tax_rate: 5,
  discount_amount: 20,
  discount_type: 'fixed',
  bank_account_id: null,
  invoice_line_items: [{ description: 'SSD Data Recovery', quantity: 1, unit_price: 260, unit_code: null, unit_label: null }],
  currency: 'OMR',
};

const REF_PLACEHOLDER = "Client's PO or reference number";

function renderModal(onSave = vi.fn().mockResolvedValue(undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <InvoiceFormModal isOpen onClose={() => {}} onSave={onSave} caseId="case-1" initialData={initialData} />
    </QueryClientProvider>,
  );
  return { onSave };
}

describe('InvoiceFormModal — Client Reference is optional', () => {
  beforeEach(() => {
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it('loads the existing client reference in edit mode and does not mark it required', () => {
    renderModal();
    const ref = screen.getByPlaceholderText(REF_PLACEHOLDER) as HTMLInputElement;
    // existing value is populated (requirement: values load correctly when editing)
    expect(ref).toHaveValue('PO-12345');
    // optional now (requirement: not mandatory)
    expect(ref).not.toBeRequired();
    // other fields are populated too (requirement: all form data populated in edit mode)
    expect(screen.getByDisplayValue('Data Recovery')).toBeInTheDocument();
  });

  it('saves with an empty client reference without blocking, preserving all other fields', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    const ref = screen.getByPlaceholderText(REF_PLACEHOLDER);
    await user.clear(ref);
    await user.click(screen.getByRole('button', { name: /update invoice/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();

    const [payload, items] = onSave.mock.calls[0] as [Record<string, unknown>, Array<{ description: string }>];
    expect(payload.client_reference).toBe('');
    // no data loss: the rest of the form survives an empty reference
    expect(payload.title).toBe('Data Recovery');
    expect(payload.case_id).toBe('case-1');
    expect(payload.tax_rate).toBe(5);
    expect(payload.discount_amount).toBe(20);
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe('SSD Data Recovery');
  });

  it('preserves a provided client reference on save (no data loss when present)', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.click(screen.getByRole('button', { name: /update invoice/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [payload] = onSave.mock.calls[0] as [Record<string, unknown>];
    expect(payload.client_reference).toBe('PO-12345');
  });

  it('allows creating a new invoice (Add mode) without a client reference', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <InvoiceFormModal isOpen onClose={() => {}} onSave={onSave} caseId="case-1" />
      </QueryClientProvider>,
    );

    await user.type(screen.getByPlaceholderText('e.g., Data Recovery Services Invoice'), 'SSD Recovery');
    await user.type(screen.getByPlaceholderText('Describe the service or item'), 'Logical recovery');
    // client reference deliberately left empty
    expect(screen.getByPlaceholderText(REF_PLACEHOLDER)).toHaveValue('');

    await user.click(screen.getByRole('button', { name: /create invoice/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
    const [payload, items] = onSave.mock.calls[0] as [Record<string, unknown>, Array<{ description: string }>];
    expect(payload.client_reference).toBe('');
    expect(payload.title).toBe('SSD Recovery');
    expect(items[0].description).toBe('Logical recovery');
  });
});

describe('InvoiceFormModal — default payment terms', () => {
  it('auto-fills a new invoice from the default terms template', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <InvoiceFormModal isOpen onClose={() => {}} onSave={vi.fn().mockResolvedValue(undefined)} caseId="case-1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('DEFAULT TERMS')).toBeInTheDocument());
  });

  it('uses the default template (not the quote terms) when converting from a quote', async () => {
    const resolveMock = vi.mocked(resolveInvoiceTermsHtml);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <InvoiceFormModal
          isOpen onClose={() => {}} onSave={vi.fn().mockResolvedValue(undefined)} caseId="case-1"
          quotes={[{ id: 'q1', quote_number: 'QUOT-1', title: 'Recovery', total_amount: 231 }]}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('DEFAULT TERMS')).toBeInTheDocument());
    expect(resolveMock).toHaveBeenCalled();
  });
});
