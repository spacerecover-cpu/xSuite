import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VATReturnDetailModal } from './VATReturnDetailModal';

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
