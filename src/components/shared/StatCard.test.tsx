import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders label, value and the muted sub-count', () => {
    render(<StatCard tone="success" label="Paid" value="2,175.000 OMR" sub="4 paid" />);
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('2,175.000 OMR')).toBeInTheDocument();
    expect(screen.getByText('4 paid')).toBeInTheDocument();
  });

  it('renders a tone gradient with white ink on dark tiles', () => {
    const { container } = render(<StatCard tone="danger" label="Overdue" value={0} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('from-danger');
    expect(card.className).toContain('bg-gradient-to-br');
    expect(card.className).toContain('text-white');
  });

  it('flips light tones (warning) to a dark foreground for contrast', () => {
    const { container } = render(<StatCard tone="warning" label="Pending" value={3} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('from-warning');
    expect(card.className).toContain('text-slate-900');
  });

  it('maps a cat-* tone to its gradient', () => {
    const { container } = render(<StatCard tone="cat-2" label="X" value={1} />);
    expect((container.firstChild as HTMLElement).className).toContain('from-cat-2');
  });

  it('shows a skeleton (not the value/sub) while loading', () => {
    render(<StatCard label="Total" value="123" loading sub="9 invoices" />);
    expect(screen.queryByText('123')).toBeNull();
    expect(screen.queryByText('9 invoices')).toBeNull();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('defaults to the neutral (slate) gradient', () => {
    const { container } = render(<StatCard label="Count" value={5} />);
    expect((container.firstChild as HTMLElement).className).toContain('from-slate-600');
  });
});
