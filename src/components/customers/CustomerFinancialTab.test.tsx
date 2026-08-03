import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

// Deterministic, currency-tagged output so the assertions can tell a base-currency
// KPI apart from a row rendered in the document's own currency.
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({
    formatCurrency: (n: number) => `USD ${n}`,
    formatCurrencyIn: (n: number, c?: string | null) => `${c ?? 'USD'} ${n}`,
  }),
}));

const INVOICES = [
  // Cancelled: balance_due survives the status change, so it must not be counted.
  {
    id: 'inv-cancelled',
    invoice_number: 'INV-1',
    invoice_date: '2026-07-01',
    total_amount: 1200,
    amount_paid: 0,
    balance_due: 1200,
    total_amount_base: 1200,
    amount_paid_base: 0,
    balance_due_base: 1200,
    status: 'cancelled',
    invoice_type: 'tax_invoice',
    currency: 'USD',
    is_proforma: false,
  },
  // Live EUR invoice: base 330 feeds the KPI, face 300 renders in EUR in the row.
  {
    id: 'inv-live',
    invoice_number: 'INV-2',
    invoice_date: '2026-07-02',
    total_amount: 300,
    amount_paid: 300,
    balance_due: 0,
    total_amount_base: 330,
    amount_paid_base: 330,
    balance_due_base: 0,
    status: 'paid',
    invoice_type: 'tax_invoice',
    currency: 'EUR',
    is_proforma: false,
  },
];

vi.mock('../../lib/supabaseClient', () => {
  const table = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: rows, error: null }));
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((name: string) => table(name === 'invoices' ? INVOICES : [])),
    },
  };
});

import { CustomerFinancialTab } from './CustomerFinancialTab';

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CustomerFinancialTab customerId="cust-1" />
    </QueryClientProvider>,
  );
}

describe('CustomerFinancialTab', () => {
  it('excludes cancelled invoices from the summary KPIs', async () => {
    renderTab();

    // Only the live invoice counts: 330 invoiced / 330 paid / 0 outstanding.
    // (The table below still lists the cancelled invoice — it is history.)
    expect(await screen.findByText('1 invoice(s)')).toBeInTheDocument();
    expect(screen.getByText('Total Invoiced').parentElement).toHaveTextContent('USD 330');
    expect(screen.getByText('Total Paid').parentElement).toHaveTextContent('USD 330');
    // The cancelled invoice's stale balance must not surface as money owed.
    expect(screen.getByText('Outstanding').parentElement).toHaveTextContent('USD 0');
  });

  it('renders each invoice row in its own document currency', async () => {
    renderTab();

    // Face value in the document currency — not the base amount under the tenant symbol.
    expect(await screen.findByText('EUR 300')).toBeInTheDocument();
  });
});
