import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { VATReturnDetailModal } from './VATReturnDetailModal';
import { getReturnLines, getReturnLedgerRows } from '../../lib/tax/taxReturnService';

vi.mock('../../lib/tax/taxReturnService', () => ({
  getReturnLines: vi.fn().mockResolvedValue([
    { id: 'l1', box_code: 'BOX_1_OUTPUT', box_label: 'Output VAT on sales', amount_base: 62.5, sequence: 1 },
    { id: 'l2', box_code: 'BOX_2_INPUT', box_label: 'Recoverable input VAT on purchases', amount_base: 12.25, sequence: 2 },
    { id: 'l3', box_code: 'BOX_3_NET', box_label: 'Net VAT payable / (refundable)', amount_base: 50.25, sequence: 3 },
    { id: 'l4', box_code: 'hsn.998713', box_label: 'HSN/SAC 998713', amount_base: 90000, quantity: 5, unit_code: 'NOS', sequence: 6 },
  ]),
  getReturnLedgerRows: vi.fn().mockResolvedValue([
    { id: 'v1', record_type: 'sale', vat_amount_base: 62.5, tax_period: '2026-07', record_id: 'inv-1' },
    { id: 'v2', record_type: 'purchase', vat_amount_base: 12.25, tax_period: '2026-08', record_id: 'exp-1' },
  ]),
}));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => `OMR ${n.toFixed(3)}` }),
}));

const vatReturn = {
  id: 'r1', period_start: '2026-07-01', period_end: '2026-09-30',
  output_vat: 62.5, input_vat: 12.25, net_vat: 50.25, status: 'draft',
} as never;

describe('VATReturnDetailModal (P3)', () => {
  it('renders boxes, ledger rows, and a green reconciliation badge when sums match', async () => {
    render(<VATReturnDetailModal vatReturn={vatReturn} onClose={() => {}} />);
    expect(await screen.findByText('Output VAT on sales')).toBeInTheDocument();
    expect(await screen.findByText(/reconciled/i)).toBeInTheDocument();
    expect(screen.getByText('2026-07')).toBeInTheDocument();
  });

  it('renders quantity + UQC on persisted HSN lines', async () => {
    render(<VATReturnDetailModal vatReturn={vatReturn} onClose={() => {}} />);
    await screen.findByText('HSN/SAC 998713');
    expect(screen.getByText('Qty 5 NOS')).toBeInTheDocument();
  });
});

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe('VATReturnDetailModal — stale-fetch race (bug #95)', () => {
  const linesMock = vi.mocked(getReturnLines);
  const ledgerMock = vi.mocked(getReturnLedgerRows);

  afterEach(() => {
    linesMock.mockReset();
    ledgerMock.mockReset();
  });

  it('ignores a slow prior return whose fetch resolves after the user switched returns', async () => {
    const returnA = {
      id: 'rA', period_start: '2026-01-01', period_end: '2026-03-31',
      output_vat: 100, input_vat: 10, net_vat: 90, status: 'draft',
    } as never;
    const returnB = {
      id: 'rB', period_start: '2026-04-01', period_end: '2026-06-30',
      output_vat: 200, input_vat: 20, net_vat: 180, status: 'draft',
    } as never;

    const linesA = deferred(); const linesB = deferred();
    const ledgerA = deferred(); const ledgerB = deferred();

    linesMock.mockImplementation(((id: string) => (id === 'rA' ? linesA.promise : linesB.promise)) as never);
    ledgerMock.mockImplementation(((ret: { id: string }) => (ret.id === 'rA' ? ledgerA.promise : ledgerB.promise)) as never);

    // Open return A (slow), then immediately switch to return B before A resolves.
    const { rerender } = render(<VATReturnDetailModal vatReturn={returnA} onClose={() => {}} />);
    rerender(<VATReturnDetailModal vatReturn={returnB} onClose={() => {}} />);

    // B resolves first and reconciles cleanly (props 200/20 vs subledger 200/20).
    linesB.resolve([{ id: 'lB', box_code: 'BOX_1_OUTPUT', box_label: 'Output VAT on sales', amount_base: 200, sequence: 1 }]);
    ledgerB.resolve([
      { id: 'vB1', record_type: 'sale', vat_amount_base: 200, tax_period: '2026-04', record_id: 'invB' },
      { id: 'vB2', record_type: 'purchase', vat_amount_base: 20, tax_period: '2026-05', record_id: 'expB' },
    ]);
    expect(await screen.findByText(/Reconciled — the filed boxes/)).toBeInTheDocument();
    expect(screen.getByText('2026-04')).toBeInTheDocument();

    // The stale A fetch now resolves (subledger 100/10). It must NOT overwrite B's ledger,
    // otherwise the banner recomputes B's props (200/20) against A's rows and falsely flags NOT reconciled.
    await act(async () => {
      linesA.resolve([{ id: 'lA', box_code: 'BOX_1_OUTPUT', box_label: 'Output VAT on sales', amount_base: 100, sequence: 1 }]);
      ledgerA.resolve([
        { id: 'vA1', record_type: 'sale', vat_amount_base: 100, tax_period: '2026-01', record_id: 'invA' },
        { id: 'vA2', record_type: 'purchase', vat_amount_base: 10, tax_period: '2026-02', record_id: 'expA' },
      ]);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Reconciled — the filed boxes/)).toBeInTheDocument();
    expect(screen.getByText('2026-04')).toBeInTheDocument();
    expect(screen.queryByText('2026-01')).not.toBeInTheDocument();
    expect(screen.queryByText(/NOT reconciled/)).not.toBeInTheDocument();
  });
});
