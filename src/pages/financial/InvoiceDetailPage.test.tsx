import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

// A draft tax invoice with one imported line stored at 10% discount (900 net on a
// 1000 gross line). The edit path must survive both a currency change and the
// per-line discount when the form is opened and saved unchanged.
const INVOICE = {
  id: 'inv-1',
  invoice_number: 'INVO-0001',
  status: 'draft',
  invoice_type: 'tax_invoice',
  invoice_date: '2026-07-01',
  due_date: '2026-07-15',
  currency: 'USD',
  total_amount: 900,
  amount_paid: 0,
  balance_due: 900,
  tax_amount: 0,
  case_id: 'case-1',
  customer_id: 'cust-1',
  company_id: null,
  title: 'Data Recovery Service',
};

const RAW_LINE = {
  id: 'li-1',
  description: 'RAID rebuild',
  quantity: 1,
  unit_price: 1000,
  tax_rate: 0,
  discount: 10,
  total: 900,
  sort_order: 0,
  unit_code: null,
  unit_label: null,
  item_code: null,
};

// Differentiate the raw re-fetch in handleOpenEdit by table: the invoice header
// row and its live line items must come back with their real DB column shapes so
// the page's normalization (discount -> discount_percent) is what's under test.
vi.mock('../../lib/supabaseClient', () => {
  const makeChain = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'or', 'eq', 'order', 'range', 'gte', 'lte', 'ilike', 'in', 'update', 'limit']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(result));
    chain.single = vi.fn(() => Promise.resolve(result));
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'invoices') return makeChain({ data: { ...INVOICE }, error: null });
        if (table === 'invoice_line_items') return makeChain({ data: [{ ...RAW_LINE }], error: null });
        return makeChain({ data: null, error: null });
      }),
    },
    resolveTenantId: vi.fn(async () => 'tenant-1'),
  };
});

// Keep the real discount mapping + initial-data normalization; only stub the
// network read/write calls the detail page issues.
vi.mock('../../lib/invoiceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/invoiceService')>();
  return {
    ...actual,
    fetchInvoiceById: vi.fn(async () => INVOICE),
    getPaymentHistory: vi.fn(async () => []),
    getConversionHistory: vi.fn(async () => null),
    convertProformaToTaxInvoice: vi.fn(),
    issueInvoice: vi.fn(),
    updateInvoice: vi.fn(async () => {}),
    generateInvoicePDF: vi.fn(async () => ({ success: true })),
  };
});

vi.mock('../../lib/creditNoteService', () => ({
  getCreditNotesByInvoice: vi.fn(async () => []),
  generateCreditNotePDF: vi.fn(async () => ({ success: true })),
}));

vi.mock('../../lib/taxDocumentService', () => ({
  dryRunIssueTaxDocument: vi.fn(async () => ({ requirement_failures: [] })),
  classifyRequirementFailures: vi.fn(() => ({ kind: 'ok' as const })),
  parseRequirementFailures: vi.fn(() => []),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrencyIn: (n: number) => String(n), currencyFormat: { code: 'USD' } }),
}));
vi.mock('../../hooks/useProfileNames', () => ({
  useProfileNames: () => ({ nameOf: () => '' }),
}));
vi.mock('../../hooks/usePDFDownload', () => ({
  usePDFDownload: () => ({
    companySettings: null,
    isLoadingSettings: false,
    settingsReady: true,
    settingsError: false,
    resourceError: null,
    translationsReady: true,
    translationsError: false,
    translationsErrorMessage: '',
    isLoadingTranslations: false,
    t: (_k: string, fallback: string) => fallback,
  }),
}));

// Heavy/query-backed children replaced with inert stubs.
vi.mock('../../components/documents/InvoiceDocument', () => ({
  InvoiceDocument: () => <div data-testid="invoice-doc" />,
}));
vi.mock('../../components/financial/EInvoiceReadinessBanner', () => ({
  EInvoiceReadinessBanner: () => null,
}));

// Edit-mode stub: replay the exact initialData line items back through onSave
// (as the real modal does), and inject a currency change so the save handler is
// exercised on both the currency and the per-line discount.
vi.mock('../../components/cases/InvoiceFormModal', () => ({
  InvoiceFormModal: (props: {
    isOpen: boolean;
    initialData?: { invoice_line_items?: unknown[] } & Record<string, unknown>;
    onSave: (data: Record<string, unknown>, items: unknown[]) => void;
  }) =>
    props.isOpen ? (
      <button
        type="button"
        onClick={() =>
          props.onSave(
            { ...(props.initialData ?? {}), currency: 'EUR' },
            props.initialData?.invoice_line_items ?? [],
          )
        }
      >
        stub-save
      </button>
    ) : null,
}));

// Capture the props the detail page forwards to CreditNoteModal so a regression
// test can assert credited_amount (needed for cumulative VAT proration) is passed.
const captured = vi.hoisted(() => ({ creditNote: null as Record<string, unknown> | null }));

vi.mock('../../components/financial/CreditNoteModal', () => ({
  CreditNoteModal: (props: { isOpen: boolean } & Record<string, unknown>) => {
    if (props.isOpen) captured.creditNote = props;
    return props.isOpen ? <div data-testid="credit-note-modal" /> : null;
  },
}));

vi.mock('../../components/banking/RecordReceiptModal', () => ({
  RecordReceiptModal: (props: {
    isOpen: boolean;
    onSave: (d: Record<string, unknown>) => Promise<void>;
  }) =>
    props.isOpen ? (
      <button type="button" onClick={() => void props.onSave({ amount: 100 })}>
        stub-record-receipt
      </button>
    ) : null,
}));

vi.mock('../../lib/receiptsService', () => ({
  receiptsService: { createReceiptWithAllocations: vi.fn(async () => ({})) },
}));

import { InvoiceDetailPage } from './InvoiceDetailPage';
import { updateInvoice, fetchInvoiceById } from '../../lib/invoiceService';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/invoices/inv-1']}>
        <HeaderSlotProvider>
          <Routes>
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          </Routes>
        </HeaderSlotProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openEditAndSave() {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /edit invoice/i }));
  fireEvent.click(await screen.findByText('stub-save'));
  await waitFor(() => expect(vi.mocked(updateInvoice)).toHaveBeenCalledTimes(1));
}

describe('InvoiceDetailPage edit', () => {
  it('forwards a changed document currency to updateInvoice', async () => {
    vi.mocked(updateInvoice).mockClear();
    await openEditAndSave();
    expect(vi.mocked(updateInvoice).mock.calls[0][1]).toMatchObject({ currency: 'EUR' });
  });

  it('preserves the per-line discount_percent of an imported line on save', async () => {
    vi.mocked(updateInvoice).mockClear();
    await openEditAndSave();
    const items = vi.mocked(updateInvoice).mock.calls[0][2] as Array<{ discount_percent?: number }>;
    expect(items[0].discount_percent).toBe(10);
  });
});

// An issued, partially-credited tax invoice: credited_amount must reach the
// CreditNoteModal so its cumulative VAT proration telescopes correctly, and the
// Record Payment path must be reachable.
const ISSUED_INVOICE = {
  ...INVOICE,
  status: 'sent',
  invoice_type: 'tax_invoice' as const,
  total_amount: 100,
  amount_paid: 0,
  balance_due: 100,
  tax_amount: 10,
  credited_amount: 50,
};

describe('InvoiceDetailPage financial modal plumbing', () => {
  it('forwards credited_amount to CreditNoteModal for cumulative VAT proration', async () => {
    captured.creditNote = null;
    vi.mocked(fetchInvoiceById).mockResolvedValueOnce(ISSUED_INVOICE as never);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /create credit note/i }));
    await screen.findByTestId('credit-note-modal');
    expect(((captured.creditNote as Record<string, unknown> | null)?.invoice as { credited_amount?: number }).credited_amount).toBe(50);
  });

  it('invalidates the Record Payment modal query after a receipt is recorded', async () => {
    vi.mocked(fetchInvoiceById).mockResolvedValueOnce(ISSUED_INVOICE as never);
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /record payment/i }));
    fireEvent.click(await screen.findByText('stub-record-receipt'));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['invoice_for_payment', 'inv-1'] }),
    );
    invalidateSpy.mockRestore();
  });
});
