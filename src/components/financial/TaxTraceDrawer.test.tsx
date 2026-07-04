import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaxTraceDrawer } from './TaxTraceDrawer';

describe('TaxTraceDrawer', () => {
  it('renders the title and a friendly rate_match line from the trace steps', () => {
    const trace = {
      steps: [
        { op: 'rate_match', rateRowId: 'r1', componentCode: 'VAT', rate: 5, validFrom: '2021-04-16' },
      ],
    };
    render(<TaxTraceDrawer trace={trace} backfilled={false} open onClose={vi.fn()} />);
    expect(screen.getByText('How was this computed?')).toBeInTheDocument();
    expect(screen.getByText(/Matched rate row r1/)).toBeInTheDocument();
    expect(screen.getByText(/VAT 5% \(valid from 2021-04-16\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('tax-trace-backfilled-badge')).toBeNull();
  });

  it('renders a generic key: value line for a non-rate_match step', () => {
    const trace = { steps: [{ op: 'scheme_decision', mode: 'standard', detail: 'single-stage VAT' }] };
    render(<TaxTraceDrawer trace={trace} backfilled={false} open onClose={vi.fn()} />);
    expect(screen.getByText('scheme_decision')).toBeInTheDocument();
    expect(screen.getByText(/mode:/)).toBeInTheDocument();
    expect(screen.getByText(/"standard"/)).toBeInTheDocument();
  });

  it('shows the backfilled badge with warning tokens when backfilled', () => {
    render(<TaxTraceDrawer trace={null} backfilled open onClose={vi.fn()} />);
    const badge = screen.getByTestId('tax-trace-backfilled-badge');
    expect(badge).toHaveClass('bg-warning-muted', 'text-warning');
    expect(badge).toHaveTextContent('Reconstructed history');
  });

  it('does not show the backfilled badge when not backfilled', () => {
    render(<TaxTraceDrawer trace={null} backfilled={false} open onClose={vi.fn()} />);
    expect(screen.queryByTestId('tax-trace-backfilled-badge')).toBeNull();
  });

  it('renders a muted empty state when there is no trace', () => {
    render(<TaxTraceDrawer trace={null} backfilled={false} open onClose={vi.fn()} />);
    expect(screen.getByText('No trace recorded for this document.')).toBeInTheDocument();
  });

  it('calls onClose from the footer Close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TaxTraceDrawer trace={null} backfilled={false} open onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    const { container } = render(<TaxTraceDrawer trace={null} backfilled={false} open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
