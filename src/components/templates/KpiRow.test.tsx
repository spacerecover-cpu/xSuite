// src/components/templates/KpiRow.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiRow } from './KpiRow';

const stats = [
  { tone: 'info' as const, label: 'Total', value: '10' },
  { tone: 'success' as const, label: 'Paid', value: '4', sub: '4 paid' },
];

describe('KpiRow', () => {
  it('renders one StatCard per stat with label/value/sub', () => {
    render(<KpiRow stats={stats} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('4 paid')).toBeInTheDocument();
  });

  it('is a labelled summary region with the default grid columns', () => {
    const { container } = render(<KpiRow stats={stats} />);
    const region = screen.getByRole('region', { name: 'summary' });
    expect(region).toBe(container.firstChild);
    expect((region as HTMLElement).className).toContain('grid-cols-2');
    expect((region as HTMLElement).className).toContain('lg:grid-cols-4');
  });

  it('honors a cols override', () => {
    const { container } = render(<KpiRow stats={stats} cols="grid-cols-3" />);
    expect((container.firstChild as HTMLElement).className).toContain('grid-cols-3');
  });
});
