import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Regression guards for the case-detail inline quote save handlers.
//
// Finding A (#5): the inline quote-EDIT branch hand-rolled a
// `supabase.from('quotes').update(...)` that omitted subtotal/tax_amount/
// total_amount (+ *_base) and re-inserted line items dropping unit_code/
// unit_label/item_code + currency — so items summed to a new total while the
// stored header total stayed frozen, and per-line fields were lost each edit.
// The fix routes the edit through quotesService.updateQuote (the recomputing
// service path QuotesListPage uses), preserving full item fields.
//
// Finding B (#6): the CREATE branch built the new quote WITHOUT `currency`, so
// createQuote's resolveRateContext(undefined) fell back to base (USD) and a EUR
// quote persisted at the wrong currency. The fix forwards the modal-selected
// currency into createQuote (mirroring the round-2 #22 fix on QuotesListPage).
//
// The cleanest seam is quotesService: mock createQuote/updateQuote and assert the
// handlers delegate with the correct args. The rest of the (very heavy) page is
// mocked down to the modal shell so only the save handlers exercise real code.

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() }, rpc: vi.fn() },
  resolveTenantId: vi.fn(async () => 'tenant-1'),
}));

const { createQuoteSpy, updateQuoteSpy } = vi.hoisted(() => ({
  createQuoteSpy: vi.fn(async (_quote?: unknown, _items?: unknown) => ({ id: 'quote-new', quote_number: 'QUOT-0001' })),
  updateQuoteSpy: vi.fn(async (_id?: unknown, _quote?: unknown, _items?: unknown) => ({ id: 'quote-1' })),
}));

vi.mock('../../lib/quotesService', () => ({
  quotesService: {},
  createQuote: createQuoteSpy,
  updateQuote: updateQuoteSpy,
}));

vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({
    formatCurrency: (n: number) => String(n),
    formatCurrencyIn: (n: number) => String(n),
    currencyFormat: {
      currencySymbol: '$',
      currencyPosition: 'before',
      decimalPlaces: 2,
      currencyCode: 'USD',
    },
    loading: false,
  }),
}));

vi.mock('../../contexts/TenantConfigContext', () => ({
  useTenantFeatures: () => ({ isEnabled: () => false }),
  useTenantConfig: () => ({ config: { regime: { documents: [] } } }),
  useCurrencyConfig: () => ({ code: 'USD', symbol: '$', decimalPlaces: 2, position: 'before' }),
}));

// Render only the page's `outside` slot (which holds the modals); skip the
// header/tab content entirely so the test surface is just the save handlers.
vi.mock('../../components/templates/DetailPageTemplate', () => ({
  DetailPageTemplate: ({ outside }: { outside: React.ReactNode }) => <div>{outside}</div>,
}));

const caseData = {
  id: 'case-1',
  case_no: 'CASE-0001',
  status: 'quoting',
  status_id: 'st-1',
  recovery_outcome: null,
  parent_case_id: null,
  priority: 'normal',
  customer_id: 'customer-1',
  company_id: null,
  client_reference: 'REF-1',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
  created_by_profile: { full_name: 'Alice' },
  updated_by_profile: { full_name: 'Bob' },
  customer: { customer_name: 'Acme', mobile_number: '123', phone: '123', email: 'a@b.c' },
  contact: null,
  service_type: { name: 'Logical Recovery' },
};

vi.mock('../../components/cases/detail/useCaseQueries', () => ({
  useCaseQueries: () => ({
    caseData,
    isLoading: false,
    caseError: null,
    caseStatuses: [],
    devices: [],
    cloneDrives: [],
    attachments: [],
    quotes: [],
    invoices: [],
    caseFinancialSummary: null,
    documentInstances: [],
    caseEngineers: [],
    portalSettings: null,
    notes: [],
  }),
}));

const noopMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock('../../components/cases/detail/useCaseMutations', () => ({
  useCaseMutations: () => ({
    addNoteMutation: noopMutation,
    updateNoteMutation: noopMutation,
    updateCaseStatusMutation: noopMutation,
    updateCasePriorityMutation: noopMutation,
    updateAssignedEngineerMutation: noopMutation,
    updateCaseInfoMutation: noopMutation,
    updateDeviceInfoMutation: noopMutation,
    updateCustomerInfoMutation: noopMutation,
    markAsDeliveredMutation: noopMutation,
    preserveLongTermMutation: noopMutation,
    duplicateCaseMutation: noopMutation,
    deleteCaseMutation: noopMutation,
    createCloneDriveMutation: noopMutation,
    extractCloneMutation: noopMutation,
    archiveCloneMutation: noopMutation,
    createPaymentMutation: noopMutation,
    queryClient: { invalidateQueries: vi.fn() },
    navigate: vi.fn(),
    profile: { role: 'admin', tenant_id: 'tenant-1', case_access_level: 'full' },
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }),
}));

// Modal-state hook: quote modal open, nothing else.
vi.mock('../../components/cases/detail/useCaseModals', () => {
  const passthrough = new Proxy(
    {
      showQuoteModal: true,
      editingQuote: null,
    } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        // Any setShowX / boolean flag the page reads → no-op / false.
        if (prop.startsWith('set')) return vi.fn();
        return false;
      },
    },
  );
  return { useCaseModals: () => passthrough };
});

// QuoteFormModal stub: three save buttons matching the payload QuoteFormModal
// produces (its handleSubmit spreads quoteData + adds id/case_id/customer_id...).
vi.mock('../../components/cases/QuoteFormModal', () => ({
  QuoteFormModal: ({
    onSave,
  }: {
    onSave: (data: Record<string, unknown>, items: unknown[]) => Promise<void>;
  }) => {
    const items = [
      {
        description: 'Logical recovery',
        quantity: 1,
        unit_price: 150,
        unit_code: 'GB',
        unit_label: 'Gigabytes',
        item_code: '998877',
      },
    ];
    const base = {
      case_id: 'case-1',
      customer_id: 'customer-1',
      company_id: null,
      status: 'draft',
      title: 'SSD Recovery',
      client_reference: 'REF-1',
      valid_until: null,
      tax_rate: 5,
      discount_amount: 0,
      discount_type: 'fixed',
      bank_account_id: null,
      terms_and_conditions: null,
      notes: null,
    };
    return (
      <>
        <button onClick={() => onSave({ ...base, id: 'quote-1' }, items)}>Save Edit</button>
        <button onClick={() => onSave({ ...base, currency: 'EUR' }, items)}>Save Create EUR</button>
      </>
    );
  },
}));

import { CaseDetail } from './CaseDetail';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/cases/case-1']}>
        <Routes>
          <Route path="/cases/:id" element={<CaseDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CaseDetail — inline quote EDIT recomputes totals via updateQuote (Finding #5)', () => {
  it('routes the edit through quotesService.updateQuote, preserving item_code/unit fields', async () => {
    updateQuoteSpy.mockClear();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Save Edit' }));

    await waitFor(() => expect(updateQuoteSpy).toHaveBeenCalledTimes(1));

    const [idArg, quoteArg, itemsArg] = updateQuoteSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Array<Record<string, unknown>>,
    ];
    expect(idArg).toBe('quote-1');
    // discount_type was dropped by the old hand-rolled path's item re-insert;
    // the service recomputes header totals from these fields + items.
    expect(quoteArg.discount_type).toBe('fixed');
    expect(quoteArg.tax_rate).toBe(5);
    // Per-line unit + HSN/SAC code must survive the edit (dropped before).
    expect(itemsArg).toHaveLength(1);
    expect(itemsArg[0]).toMatchObject({
      unit_price: 150,
      unit_code: 'GB',
      unit_label: 'Gigabytes',
      item_code: '998877',
    });
  });
});

describe('CaseDetail — inline quote CREATE forwards selected currency (Finding #6)', () => {
  it('passes the modal-selected currency (EUR) into createQuote, not the tenant base', async () => {
    createQuoteSpy.mockClear();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Save Create EUR' }));

    await waitFor(() => expect(createQuoteSpy).toHaveBeenCalledTimes(1));

    const [quoteArg, itemsArg] = createQuoteSpy.mock.calls[0] as [
      Record<string, unknown>,
      Array<Record<string, unknown>>,
    ];
    expect(quoteArg.currency).toBe('EUR');
    // Item fields carried through the create path too.
    expect(itemsArg[0]).toMatchObject({ unit_code: 'GB', item_code: '998877' });
  });
});
