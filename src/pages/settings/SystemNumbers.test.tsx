// src/pages/settings/SystemNumbers.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

// Two live rows: one legacy (no template) and one fiscal-template row. The
// template row proves the card badge must NOT render the classic PREFIX-0001
// form (it would be a lie — the real next number is templated), and the legacy
// row is the one whose edit modal drives the live preview_number_format RPC.
const h = vi.hoisted(() => {
  const rows = [
    {
      id: 's1', scope: 'invoices', prefix: 'INVO', padding: 4, current_value: 10192,
      reset_annually: false, format_template: null, reset_basis: null,
      fiscal_year_anchor: null, max_length: null, created_at: '2026-01-01',
    },
    {
      id: 's2', scope: 'case', prefix: 'CASE', padding: 4, current_value: 42,
      reset_annually: false, format_template: 'CASE/{FY}/{SEQ:4}', reset_basis: 'fiscal_year',
      fiscal_year_anchor: '04-01', max_length: null, created_at: '2026-01-01',
    },
  ];
  const rpc = vi.fn((name: string) =>
    name === 'preview_number_format'
      ? Promise.resolve({ data: 'INV/2026-27/0001', error: null })
      : Promise.resolve({ data: null, error: null }),
  );
  return { rows, rpc };
});

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...(a as [string])),
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: h.rows, error: null }),
      }),
    }),
  },
}));

import { SystemNumbers, SCOPE_REGISTRY } from './SystemNumbers';

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <HeaderSlotProvider>
        <MemoryRouter>
          <SystemNumbers />
        </MemoryRouter>
      </HeaderSlotProvider>
    </QueryClientProvider>,
  );
}

function cardFor(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  // Each sequence is a table row grouped under its category section.
  return heading.closest('tr') as HTMLElement;
}

describe('SystemNumbers scope registry', () => {
  it('contains every real get_next_number caller scope and no phantoms', () => {
    const keys = SCOPE_REGISTRY.map((s) => s.key);
    // Real scopes: live number_sequences rows ∪ src/lib RPC callers (verified 2026-07-02)
    for (const real of ['case', 'companies', 'customers', 'invoices', 'proforma_invoices', 'quote',
      'payment', 'expense', 'stock', 'stock_adjustment', 'purchase_orders', 'suppliers',
      'report_evaluation', 'report_service', 'payroll_bank_file']) {
      expect(keys).toContain(real);
    }
    // Phantom keys from the old SEQUENCE_CONFIG must be gone:
    for (const phantom of ['customer', 'company', 'supplier', 'purchase_order', 'invoice', 'user', 'document']) {
      expect(keys).not.toContain(phantom);
    }
  });
});

describe('SystemNumbers fiscal fields (P3)', () => {
  beforeEach(() => h.rpc.mockClear());

  it('edit modal exposes format template / reset basis / fiscal anchor and previews via preview_number_format', async () => {
    renderPage();

    // Open the (legacy, empty-template) invoices sequence's edit modal.
    const invoicesHeading = await screen.findByRole('heading', { name: 'Tax Invoice Number' });
    const invoicesCard = invoicesHeading.closest('tr') as HTMLElement;
    fireEvent.click(within(invoicesCard).getByRole('button', { name: /edit sequence/i }));

    // Typing a format template drives a LIVE server-side preview, not a
    // client-side '-' reimplementation. fireEvent.change (not userEvent.type)
    // so the literal { } template tokens land verbatim in the field value.
    const template = screen.getByLabelText(/format template/i);
    fireEvent.change(template, { target: { value: 'INV/{FY}/{SEQ:4}' } });
    await waitFor(
      () =>
        expect(h.rpc).toHaveBeenCalledWith('preview_number_format', {
          p_scope: 'invoices',
          p_format_template: 'INV/{FY}/{SEQ:4}',
        }),
      { timeout: 3000 },
    );

    // Reset basis select is always present; the fiscal-year anchor field
    // appears only once the basis is fiscal_year.
    const resetBasis = screen.getByLabelText(/reset basis/i);
    expect(resetBasis).toBeInTheDocument();
    fireEvent.change(resetBasis, { target: { value: 'fiscal_year' } });
    expect(screen.getByLabelText(/fiscal year start/i)).toBeInTheDocument();
  });

  it('persists reset_basis="never" literally so turning an existing reset off is not silently dropped', async () => {
    renderPage();

    // The 'case' row starts at reset_basis='fiscal_year'. Open its edit modal.
    const caseHeading = await screen.findByRole('heading', { name: 'Case Number' });
    const caseCard = caseHeading.closest('tr') as HTMLElement;
    fireEvent.click(within(caseCard).getByRole('button', { name: /edit sequence/i }));

    // Switch the reset basis to "No automatic reset".
    fireEvent.change(screen.getByLabelText(/reset basis/i), { target: { value: 'never' } });

    // Save. The RPC must receive p_reset_basis:'never' — NOT undefined, which
    // COALESCE(NULL, stored) discards, silently keeping the old 'fiscal_year'.
    fireEvent.click(screen.getByRole('button', { name: /update sequence/i }));

    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith(
        'update_number_sequence',
        expect.objectContaining({ p_scope: 'case', p_reset_basis: 'never' }),
      ),
    );
  });

  it('shows a templated indicator on a template row card instead of a legacy PREFIX-0000 next number', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Case Number' });
    const caseCard = cardFor('Case Number');
    // The template row must not advertise the classic hyphenated next number.
    expect(within(caseCard).queryByText('CASE-0043')).toBeNull();
    expect(within(caseCard).getByText(/templated/i)).toBeInTheDocument();

    // A legacy (no-template) row still renders its classic next number.
    const invoicesCard = cardFor('Tax Invoice Number');
    expect(within(invoicesCard).getByText('INVO-10193')).toBeInTheDocument();
  });
});

describe('SystemNumbers inline prefix/padding editing', () => {
  beforeEach(() => h.rpc.mockClear());

  it('editing the prefix inline reveals Save and persists prefix + padding via update_number_sequence', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Tax Invoice Number' });

    // No Save affordance until a cell is dirtied.
    expect(screen.queryByRole('button', { name: /save prefix & padding/i })).toBeNull();

    const prefixInput = screen.getByLabelText('Tax Invoice Number prefix') as HTMLInputElement;
    fireEvent.change(prefixInput, { target: { value: 'newx' } });
    expect(prefixInput.value).toBe('NEWX'); // upper-cased inline

    const saveBtn = await screen.findByRole('button', { name: /save prefix & padding/i });
    fireEvent.click(saveBtn);

    // Inline save touches ONLY prefix + padding; advanced fields are left to
    // COALESCE-to-stored (sent as undefined).
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith(
        'update_number_sequence',
        expect.objectContaining({ p_scope: 'invoices', p_prefix: 'NEWX', p_padding: 4 }),
      ),
    );
  });

  it('Discard reverts an inline edit without calling the RPC', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Tax Invoice Number' });

    const prefixInput = screen.getByLabelText('Tax Invoice Number prefix') as HTMLInputElement;
    fireEvent.change(prefixInput, { target: { value: 'ZZZ' } });
    fireEvent.click(await screen.findByRole('button', { name: /discard changes/i }));

    expect(prefixInput.value).toBe('INVO');
    expect(h.rpc).not.toHaveBeenCalledWith('update_number_sequence', expect.anything());
  });
});
