import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

// Regression guard for the finding: the quotes-list page's inline "New Quote"
// create path used to hand-roll `supabase.from('quotes').insert(...)`, setting
// `currency` but never resolving a frozen rate — so exchange_rate/rate_source/
// *_base landed NULL, tripping assert_financial_base_integrity(). The fix routes
// creation through quotesService.createQuote (the same path CaseDetail.tsx and
// InvoicesListPage.tsx already use), which snapshots the rate before inserting.
// This test lets the REAL createQuote run against a mocked supabase/currencyService
// so we assert on the literal row it sends to `quotes.insert`.

const { insertedQuotePayload } = vi.hoisted(() => ({
  insertedQuotePayload: vi.fn(),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => String(n) }),
}));
vi.mock('../../hooks/useListPageSize', () => ({ useListPageSize: () => 50 }));
vi.mock('../../hooks/useListSelectionEnabled', () => ({ useListSelectionEnabled: () => true }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ profile: { role: 'admin' } }) }));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useCurrencyConfig: () => ({
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    position: 'before',
    displayMode: 'symbol',
  }),
}));

// The modal's own form-fill/validation is out of scope for this regression —
// stub it down to a single button that invokes the page's real onSave (the
// code under test) with a fixed "create" payload, same shape QuoteFormModal
// produces (see QuoteFormModal.tsx handleSubmit).
vi.mock('../../components/cases/QuoteFormModal', () => ({
  QuoteFormModal: ({ onSave }: { onSave: (data: Record<string, unknown>, items: unknown[]) => Promise<void> }) => (
    <button
      onClick={() =>
        onSave(
          {
            case_id: 'case-1',
            customer_id: 'customer-1',
            company_id: null,
            status: 'draft',
            title: 'SSD Data Recovery',
            client_reference: null,
            valid_until: null,
            tax_rate: 5,
            discount_amount: 0,
            discount_type: 'fixed',
            bank_account_id: null,
            terms_and_conditions: null,
            notes: null,
          },
          [{ description: 'Logical recovery', quantity: 1, unit_price: 200 }],
        )
      }
    >
      Trigger Quote Save
    </button>
  ),
}));

// quotesService: mock only the list-fetch/stats seams the page needs to render
// deterministically; let the REAL createQuote (the fixed code path) execute.
vi.mock('../../lib/quotesService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/quotesService')>();
  return {
    ...actual,
    fetchQuotesPage: vi.fn(async () => ({ rows: [], total: 0 })),
    getQuoteStats: vi.fn(async () => ({ total: 0, totalValue: 0, acceptedValue: 0, sentValue: 0 })),
    createQuote: vi.fn(actual.createQuote),
  };
});

// Frozen-rate context createQuote resolves before computing *_base — a
// non-trivial rate/source proves the values are threaded through, not defaulted.
vi.mock('../../lib/currencyService', () => ({
  resolveRateContext: vi.fn(async () => ({
    documentCurrency: 'USD',
    documentDecimals: 2,
    baseCurrency: 'OMR',
    baseDecimals: 3,
    rate: 2.5,
    rateSource: 'manual',
  })),
  getBaseCurrency: vi.fn(async () => 'OMR'),
  getCurrencyDecimals: vi.fn(async () => 3),
}));

vi.mock('../../lib/auditTrailService', () => ({ logAuditTrail: vi.fn(async () => {}) }));
vi.mock('../../lib/chainOfCustodyService', () => ({
  logQuoteCreated: vi.fn(async () => {}),
  logQuoteStatusChanged: vi.fn(async () => {}),
}));

vi.mock('../../lib/supabaseClient', () => {
  const thenableChain = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'or', 'eq', 'order', 'range', 'gte', 'lte', 'ilike', 'in', 'update', 'maybeSingle']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  };
  return {
    supabase: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
      rpc: vi.fn(async (fn: string) => (fn === 'get_next_number' ? { data: 'QUOT-0001', error: null } : { data: null, error: null })),
      from: vi.fn((table: string) => {
        if (table === 'quotes') {
          return {
            insert: vi.fn((rows: Array<Record<string, unknown>>) => {
              insertedQuotePayload(rows[0]);
              return {
                select: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'quote-1', quote_number: 'QUOT-0001', total_amount: rows[0].total_amount },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === 'quote_items') {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        return thenableChain({ data: [], count: 0, error: null });
      }),
    },
    resolveTenantId: vi.fn(async () => 'tenant-1'),
  };
});

import { QuotesListPage } from './QuotesListPage';
import { createQuote } from '../../lib/quotesService';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><HeaderSlotProvider><QuotesListPage /></HeaderSlotProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('QuotesListPage — New Quote create path stamps rate/base (T17 monitor)', () => {
  it('routes creation through quotesService.createQuote, never a hand-rolled insert missing rate/base', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Create Quote' }));
    await user.click(await screen.findByRole('button', { name: 'Trigger Quote Save' }));

    await waitFor(() => expect(insertedQuotePayload).toHaveBeenCalledTimes(1));

    // The page's onSave must delegate to the shared service, not insert directly.
    expect(vi.mocked(createQuote)).toHaveBeenCalledTimes(1);
    const [quoteArg] = vi.mocked(createQuote).mock.calls[0];
    expect(quoteArg.case_id).toBe('case-1');
    expect(quoteArg.currency).toBe('USD');

    // The literal row sent to `quotes.insert` must carry the frozen rate + base
    // snapshot — this is exactly what assert_financial_base_integrity() checks.
    const insertedRow = insertedQuotePayload.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.exchange_rate).toBe(2.5);
    expect(insertedRow.rate_source).toBe('manual');
    expect(insertedRow.subtotal_base).not.toBeNull();
    expect(insertedRow.tax_amount_base).not.toBeNull();
    expect(insertedRow.total_amount_base).not.toBeNull();
  });
});
