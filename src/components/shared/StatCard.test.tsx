import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';
import { useStatCardStyle } from '../../hooks/useStatCardStyle';

vi.mock('../../hooks/useStatCardStyle', () => ({ useStatCardStyle: vi.fn() }));

describe('StatCard (vivid style)', () => {
  beforeEach(() => vi.mocked(useStatCardStyle).mockReturnValue('vivid'));

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

  it('uses the dense (sm) tile so every KPI surface is the same size', () => {
    const { container } = render(<StatCard tone="info" label="Total" value={10} />);
    expect((container.firstChild as HTMLElement).className).toContain('p-2.5');
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

describe('StatCard (compact style)', () => {
  beforeEach(() => vi.mocked(useStatCardStyle).mockReturnValue('compact'));

  it('renders a calm chip: no gradient, white card, dot + label + value + sub', () => {
    const { container } = render(<StatCard tone="success" label="Paid" value="2,175.000 OMR" sub="4 paid" />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain('bg-gradient-to-br');
    expect(card.className).toContain('bg-white');
    expect(card.querySelector('.bg-success')).not.toBeNull();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('2,175.000 OMR')).toBeInTheDocument();
    expect(screen.getByText('4 paid')).toBeInTheDocument();
  });

  it('the number carries the tone hue; neutral stays ink', () => {
    render(<StatCard tone="success" label="Paid" value="2,175.000 OMR" />);
    expect(screen.getByText('2,175.000 OMR').className).toContain('text-success');
    render(<StatCard label="Count" value="42" />);
    expect(screen.getByText('42').className).toContain('text-slate-900');
  });

  it('becomes a real button when onClick is given', () => {
    render(<StatCard label="Total" value={10} onClick={() => {}} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows a skeleton (not the value) while loading', () => {
    render(<StatCard label="Total" value="123" loading />);
    expect(screen.queryByText('123')).toBeNull();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });
});
