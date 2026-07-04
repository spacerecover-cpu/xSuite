import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VATReturnModal } from './VATReturnModal';

const preview = {
  periodStart: '2026-07-01', periodEnd: '2026-09-30',
  taxPeriods: ['2026-07', '2026-08', '2026-09'],
  composed: { boxes: [
    { boxCode: 'BOX_1_OUTPUT', boxLabel: 'Output VAT on sales', amountBase: 62.5, sequence: 1 },
    { boxCode: 'BOX_2_INPUT', boxLabel: 'Recoverable input VAT on purchases', amountBase: 12.25, sequence: 2 },
    { boxCode: 'BOX_3_NET', boxLabel: 'Net VAT payable / (refundable)', amountBase: 50.25, sequence: 3 },
  ], meta: {} },
  outputVat: 62.5, inputVat: 12.25, netVat: 50.25,
  regimeKey: 'gcc_return', filingFrequency: 'quarterly', periodAnchor: '01-01',
};

const composeReturnForDate = vi.fn().mockResolvedValue(preview);
const fileReturn = vi.fn().mockResolvedValue({ id: 'r1' });
vi.mock('../../lib/tax/taxReturnService', () => ({
  composeReturnForDate: (...a: unknown[]) => composeReturnForDate(...a),
  fileReturn: (...a: unknown[]) => fileReturn(...a),
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { tenant_id: 'tenant-1' } }),
}));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => `OMR ${n.toFixed(3)}` }),
}));

describe('VATReturnModal (P3)', () => {
  beforeEach(() => { composeReturnForDate.mockClear(); fileReturn.mockClear(); });

  it('composes the current period on open and renders the three boxes', async () => {
    render(<VATReturnModal isOpen onClose={() => {}} onFiled={() => {}} />);
    await waitFor(() => expect(composeReturnForDate).toHaveBeenCalledWith('tenant-1', undefined));
    expect(await screen.findByText('Output VAT on sales')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01')).toBeInTheDocument();
    expect(screen.getByText('2026-09-30')).toBeInTheDocument();
  });

  it('files via fileReturn with the composed preview', async () => {
    const onFiled = vi.fn();
    render(<VATReturnModal isOpen onClose={() => {}} onFiled={onFiled} />);
    await screen.findByText('Output VAT on sales');
    await userEvent.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => expect(fileReturn).toHaveBeenCalledWith(preview, 'draft'));
    expect(onFiled).toHaveBeenCalled();
  });

  it('navigates to the previous period by re-composing at periodStart - 1 day', async () => {
    render(<VATReturnModal isOpen onClose={() => {}} onFiled={() => {}} />);
    await screen.findByText('Output VAT on sales');
    await userEvent.click(screen.getByRole('button', { name: /previous period/i }));
    await waitFor(() => expect(composeReturnForDate).toHaveBeenLastCalledWith('tenant-1', '2026-06-30'));
  });
});
