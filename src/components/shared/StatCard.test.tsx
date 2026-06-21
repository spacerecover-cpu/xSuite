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

  it('applies the tone surface + foreground classes', () => {
    const { container } = render(<StatCard tone="danger" label="Overdue" value={0} />);
    expect((container.firstChild as HTMLElement).className).toContain('bg-danger-muted');
    expect(screen.getByText('Overdue').className).toContain('text-danger');
  });

  it('maps a cat-* tone to the identity palette classes', () => {
    const { container } = render(<StatCard tone="cat-2" label="X" value={1} />);
    expect((container.firstChild as HTMLElement).className).toContain('bg-cat-2/10');
  });

  it('shows a skeleton (not the value/sub) while loading', () => {
    render(<StatCard label="Total" value="123" loading sub="9 invoices" />);
    expect(screen.queryByText('123')).toBeNull();
    expect(screen.queryByText('9 invoices')).toBeNull();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('defaults to the neutral tone', () => {
    const { container } = render(<StatCard label="Count" value={5} />);
    expect((container.firstChild as HTMLElement).className).toContain('bg-slate-50');
  });
});
